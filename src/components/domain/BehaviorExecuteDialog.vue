<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { IconX, IconDatabase } from '@/components/icons'
import { useDatasourcesStore } from '@/stores/datasources'

interface Behavior {
  name: string
  description?: string
  behaviorType: 'rest_api' | 'javascript' | 'python' | 'dmn'
  config?: Record<string, any>
  inputFields?: string[]
  outputField?: string
}

const props = defineProps<{
  visible: boolean
  objectTypeName: string
  behavior: Behavior | null
  query: string  // ObjectType의 SQL query
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

// 상태
const isLoadingInstances = ref(false)
const isExecuting = ref(false)
const isSavingResult = ref(false)
const instances = ref<Record<string, any>[]>([])
const columns = ref<string[]>([])
const selectedInstance = ref<Record<string, any> | null>(null)
const executionResult = ref<any>(null)
const error = ref<string | null>(null)

const datasourcesStore = useDatasourcesStore()

// 결과 저장 관련
const showSaveOptions = ref(false)
const saveTableName = ref('')
const saveSchemaName = ref('RWIS')

// 인스턴스 로드
async function loadInstances() {
  if (!props.query) {
    error.value = 'ObjectType에 query가 설정되지 않았습니다.'
    return
  }
  
  isLoadingInstances.value = true
  error.value = null
  instances.value = []
  columns.value = []
  
  try {
    const selectedDs = datasourcesStore.selectedDatasource
    if (!selectedDs?.name) {
      throw new Error('데이터소스를 선택해주세요')
    }
    // SQL 실행하여 인스턴스 조회
    const response = await fetch('/api/gateway/text2sql/direct-sql/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: props.query, datasource: selectedDs.name })
    })
    
    if (!response.ok) {
      throw new Error('인스턴스 조회 실패')
    }
    
    // 스트리밍 응답 처리
    const text = await response.text()
    const lines = text.split('\n').filter(line => line.trim())
    
    for (const line of lines) {
      try {
        const chunk = JSON.parse(line)
        if (chunk.event === 'result') {
          columns.value = chunk.columns || []
          instances.value = chunk.rows || []
        } else if (chunk.event === 'error') {
          throw new Error(chunk.message || 'SQL 실행 오류')
        } else if (chunk.type === 'columns' && chunk.columns) {
          // legacy best-effort
          columns.value = chunk.columns
        } else if (chunk.type === 'row' && chunk.row) {
          instances.value.push(chunk.row)
        } else if (chunk.type === 'error') {
          throw new Error(chunk.message || 'SQL 실행 오류')
        }
      } catch (parseErr) {
        // JSON이 아닌 라인은 무시
      }
    }
    
    // 스트리밍이 아닌 경우 (일반 JSON 응답)
    if (instances.value.length === 0 && columns.value.length === 0) {
      const data = JSON.parse(text)
      if (data.columns) columns.value = data.columns
      if (data.rows) instances.value = data.rows
    }
    
  } catch (err) {
    error.value = err instanceof Error ? err.message : '인스턴스 로드 실패'
  } finally {
    isLoadingInstances.value = false
  }
}

// 인스턴스 선택
function selectInstance(instance: Record<string, any>) {
  selectedInstance.value = instance
}

// Behavior 실행
async function executeBehavior() {
  if (!selectedInstance.value || !props.behavior) return
  
  isExecuting.value = true
  executionResult.value = null
  error.value = null
  
  try {
    const url = `/api/gateway/ontology/object-types/${encodeURIComponent(props.objectTypeName)}/behaviors/${encodeURIComponent(props.behavior.name)}/execute`
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instance_data: selectedInstance.value
      })
    })
    
    if (!response.ok) {
      const errData = await response.json()
      throw new Error(errData.detail || 'Behavior 실행 실패')
    }
    
    executionResult.value = await response.json()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Behavior 실행 실패'
  } finally {
    isExecuting.value = false
  }
}

// 결과를 테이블에 저장
async function saveResultToTable() {
  if (!executionResult.value || !saveTableName.value) return
  
  isSavingResult.value = true
  error.value = null
  
  try {
    // 결과 데이터 준비
    const resultData = Array.isArray(executionResult.value.result) 
      ? executionResult.value.result 
      : [executionResult.value.result]
    
    if (resultData.length === 0) {
      throw new Error('저장할 데이터가 없습니다.')
    }
    
    // 테이블 생성 및 데이터 삽입 API 호출
    const response = await fetch('/api/gateway/ontology/save-result-to-table', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schema_name: saveSchemaName.value,
        table_name: saveTableName.value,
        data: resultData
      })
    })
    
    if (!response.ok) {
      const errData = await response.json()
      throw new Error(errData.detail || '테이블 저장 실패')
    }
    
    const result = await response.json()
    alert(`테이블 "${saveSchemaName.value}"."${saveTableName.value}"에 ${result.rows_inserted || resultData.length}개 행이 저장되었습니다.`)
    showSaveOptions.value = false
    
  } catch (err) {
    error.value = err instanceof Error ? err.message : '테이블 저장 실패'
  } finally {
    isSavingResult.value = false
  }
}

// 엑셀 다운로드
function downloadAsExcel() {
  if (!executionResult.value) return
  
  const resultData = Array.isArray(executionResult.value.result) 
    ? executionResult.value.result 
    : [executionResult.value.result]
  
  if (resultData.length === 0) {
    error.value = '다운로드할 데이터가 없습니다.'
    return
  }
  
  // CSV 생성 (엑셀 호환)
  const headers = Object.keys(resultData[0])
  const csvContent = [
    headers.join(','),
    ...resultData.map((row: Record<string, any>) => 
      headers.map(h => {
        const val = row[h]
        if (val === null || val === undefined) return ''
        if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
          return `"${val.replace(/"/g, '""')}"`
        }
        return String(val)
      }).join(',')
    )
  ].join('\n')
  
  // BOM 추가 (엑셀 한글 호환)
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${props.objectTypeName}_${props.behavior?.name}_result.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// 다이얼로그 열릴 때 인스턴스 로드
watch(() => props.visible, (visible) => {
  if (visible) {
    selectedInstance.value = null
    executionResult.value = null
    error.value = null
    showSaveOptions.value = false
    loadInstances()
  }
})

// 결과 데이터 형식화
const formattedResult = computed(() => {
  if (!executionResult.value) return null
  try {
    return JSON.stringify(executionResult.value, null, 2)
  } catch {
    return String(executionResult.value)
  }
})

// 결과가 배열인지 확인
const isResultArray = computed(() => {
  return executionResult.value?.result && Array.isArray(executionResult.value.result)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="execute-dialog-overlay" @click.self="$emit('close')">
      <div class="execute-dialog-container">
        <!-- 헤더 -->
        <div class="execute-dialog-header">
          <h2>
            <span class="behavior-icon">▶</span>
            {{ behavior?.name }} 실행
          </h2>
          <button class="close-btn" @click="$emit('close')">
            <IconX :size="20" />
          </button>
        </div>
        
        <!-- 콘텐츠 -->
        <div class="execute-dialog-content">
          <!-- 인스턴스 선택 영역 -->
          <div class="instances-section">
            <h3>인스턴스 선택</h3>
            <p class="section-desc">{{ objectTypeName }}의 인스턴스 중 하나를 선택하세요.</p>
            
            <!-- 로딩 -->
            <div v-if="isLoadingInstances" class="loading-state">
              <div class="spinner"></div>
              <span>인스턴스 로드 중...</span>
            </div>
            
            <!-- 인스턴스 테이블 -->
            <div v-else-if="instances.length > 0" class="instances-table-wrapper">
              <table class="instances-table">
                <thead>
                  <tr>
                    <th class="select-col"></th>
                    <th v-for="col in columns.slice(0, 5)" :key="col">{{ col }}</th>
                    <th v-if="columns.length > 5">...</th>
                  </tr>
                </thead>
                <tbody>
                  <tr 
                    v-for="(instance, idx) in instances.slice(0, 50)" 
                    :key="idx"
                    :class="{ 'is-selected': selectedInstance === instance }"
                    @click="selectInstance(instance)"
                  >
                    <td class="select-col">
                      <input 
                        type="radio" 
                        :checked="selectedInstance === instance"
                        @change="selectInstance(instance)"
                      />
                    </td>
                    <td v-for="col in columns.slice(0, 5)" :key="col">
                      {{ instance[col] ?? '-' }}
                    </td>
                    <td v-if="columns.length > 5">...</td>
                  </tr>
                </tbody>
              </table>
              <div v-if="instances.length > 50" class="table-info">
                총 {{ instances.length }}개 중 50개 표시
              </div>
            </div>
            
            <!-- 인스턴스 없음 -->
            <div v-else class="empty-state">
              인스턴스가 없습니다.
            </div>
          </div>
          
          <!-- 실행 버튼 -->
          <div class="execute-action">
            <button 
              class="execute-btn"
              :disabled="!selectedInstance || isExecuting"
              @click="executeBehavior"
            >
              <span v-if="isExecuting" class="spinner small"></span>
              <span v-else>▶</span>
              {{ isExecuting ? '실행 중...' : '선택한 인스턴스로 실행' }}
            </button>
          </div>
          
          <!-- 결과 영역 -->
          <div v-if="executionResult" class="result-section">
            <div class="result-header">
              <h3>실행 결과</h3>
              <div class="result-actions">
                <button class="action-btn" @click="downloadAsExcel" title="CSV/Excel 다운로드">
                  📥 다운로드
                </button>
                <button class="action-btn save" @click="showSaveOptions = !showSaveOptions" title="테이블에 저장">
                  <IconDatabase :size="16" />
                  테이블 저장
                </button>
              </div>
            </div>
            
            <!-- 저장 옵션 -->
            <div v-if="showSaveOptions" class="save-options">
              <div class="save-form">
                <label>
                  스키마:
                  <input v-model="saveSchemaName" type="text" placeholder="RWIS" />
                </label>
                <label>
                  테이블명:
                  <input v-model="saveTableName" type="text" placeholder="result_table" />
                </label>
                <button 
                  class="save-confirm-btn" 
                  :disabled="!saveTableName || isSavingResult"
                  @click="saveResultToTable"
                >
                  {{ isSavingResult ? '저장 중...' : '저장' }}
                </button>
              </div>
            </div>
            
            <!-- 결과 테이블 (배열인 경우) -->
            <div v-if="isResultArray" class="result-table-wrapper">
              <table class="result-table">
                <thead>
                  <tr>
                    <th v-for="key in Object.keys(executionResult.result[0] || {})" :key="key">
                      {{ key }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, idx) in executionResult.result.slice(0, 100)" :key="idx">
                    <td v-for="key in Object.keys(executionResult.result[0] || {})" :key="key">
                      {{ row[key] ?? '-' }}
                    </td>
                  </tr>
                </tbody>
              </table>
              <div v-if="executionResult.result.length > 100" class="table-info">
                총 {{ executionResult.result.length }}개 중 100개 표시
              </div>
            </div>
            
            <!-- 결과 JSON (객체인 경우) -->
            <pre v-else class="result-json">{{ formattedResult }}</pre>
          </div>
          
          <!-- 에러 표시 -->
          <div v-if="error" class="error-message">
            {{ error }}
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.execute-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.execute-dialog-container {
  width: 90%;
  max-width: 900px;
  max-height: 90vh;
  background: var(--color-bg-secondary, #1e1e2e);
  border: 1px solid var(--color-border, #373a40);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.execute-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: linear-gradient(135deg, #51cf66, #37b24d);
  
  h2 {
    margin: 0;
    font-size: 1.2rem;
    color: white;
    display: flex;
    align-items: center;
    gap: 10px;
    
    .behavior-icon {
      font-size: 0.9rem;
    }
  }
  
  .close-btn {
    background: rgba(255, 255, 255, 0.2);
    border: none;
    border-radius: 8px;
    padding: 6px;
    color: white;
    cursor: pointer;
    
    &:hover {
      background: rgba(255, 255, 255, 0.3);
    }
  }
}

.execute-dialog-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.instances-section {
  h3 {
    margin: 0 0 6px;
    font-size: 1rem;
    color: var(--color-text-bright);
  }
  
  .section-desc {
    margin: 0 0 12px;
    font-size: 0.85rem;
    color: var(--color-text-muted);
  }
}

.loading-state {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px;
  color: var(--color-text-muted);
}

.empty-state {
  padding: 20px;
  text-align: center;
  color: var(--color-text-muted);
  background: var(--color-bg-tertiary);
  border-radius: 8px;
}

.instances-table-wrapper {
  max-height: 250px;
  overflow: auto;
  border: 1px solid var(--color-border);
  border-radius: 8px;
}

.instances-table, .result-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
  
  th, td {
    padding: 8px 12px;
    text-align: left;
    border-bottom: 1px solid var(--color-border);
    white-space: nowrap;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  th {
    background: var(--color-bg-tertiary);
    font-weight: 600;
    position: sticky;
    top: 0;
    color: var(--color-text-light);
  }
  
  tbody tr {
    cursor: pointer;
    transition: background 0.15s ease;
    
    &:hover {
      background: rgba(167, 139, 250, 0.1);
    }
    
    &.is-selected {
      background: rgba(81, 207, 102, 0.15);
      
      td {
        color: #51cf66;
      }
    }
  }
  
  .select-col {
    width: 40px;
    text-align: center;
  }
}

.table-info {
  padding: 8px;
  text-align: center;
  font-size: 0.8rem;
  color: var(--color-text-muted);
  background: var(--color-bg-tertiary);
}

.execute-action {
  display: flex;
  justify-content: center;
}

.execute-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 32px;
  background: linear-gradient(135deg, #51cf66, #37b24d);
  border: none;
  border-radius: 10px;
  color: white;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(81, 207, 102, 0.4);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.result-section {
  background: var(--color-bg-tertiary);
  border-radius: 12px;
  padding: 16px;
}

.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  
  h3 {
    margin: 0;
    font-size: 1rem;
    color: #51cf66;
  }
}

.result-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 0.8rem;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text-light);
  cursor: pointer;
  
  &:hover {
    background: var(--color-bg);
  }
  
  &.save {
    border-color: #228be6;
    color: #228be6;
  }
}

.save-options {
  margin-bottom: 12px;
  padding: 12px;
  background: var(--color-bg-secondary);
  border-radius: 8px;
}

.save-form {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  
  label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.85rem;
    color: var(--color-text-light);
    
    input {
      padding: 6px 10px;
      background: var(--color-bg);
      border: 1px solid var(--color-border);
      border-radius: 6px;
      color: var(--color-text-bright);
      font-size: 0.85rem;
      width: 120px;
    }
  }
  
  .save-confirm-btn {
    padding: 6px 16px;
    background: #228be6;
    border: none;
    border-radius: 6px;
    color: white;
    font-weight: 500;
    cursor: pointer;
    
    &:hover:not(:disabled) {
      background: #1c7ed6;
    }
    
    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
}

.result-table-wrapper {
  max-height: 300px;
  overflow: auto;
  border: 1px solid var(--color-border);
  border-radius: 8px;
}

.result-json {
  margin: 0;
  padding: 12px;
  background: var(--color-bg);
  border-radius: 8px;
  font-size: 0.85rem;
  color: var(--color-text-light);
  overflow-x: auto;
  max-height: 300px;
  white-space: pre-wrap;
  word-break: break-all;
}

.error-message {
  padding: 12px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid #ef4444;
  border-radius: 8px;
  color: #ef4444;
  font-size: 0.9rem;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid transparent;
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  
  &.small {
    width: 16px;
    height: 16px;
    border-width: 2px;
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
