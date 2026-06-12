<script setup lang="ts">
/**
 * EntityQueryPanel.vue
 * 온톨로지 노드에 대한 자연어 검색 및 인스턴스 생성
 */
import { ref, computed, watch } from 'vue'
import type { OntologyNode, ReactExecutionResult } from '@/types'
import { useSessionStore } from '@/stores/session'
import { useOntologyStore } from '@/stores/ontology'
import { useDatasourcesStore } from '@/stores/datasources'
import { IconPlay, IconRefresh, IconDatabase, IconSearch, IconLink, IconCheck } from '@/shared/icons'
import { ResultTable } from '@/features/text2sql'

const props = defineProps<{
  node: OntologyNode
  schemaId?: string
}>()

const emit = defineEmits<{
  (e: 'sql-generated', sql: string): void
  (e: 'instances-created', count: number): void
}>()

const sessionStore = useSessionStore()
const ontologyStore = useOntologyStore()
const datasourcesStore = useDatasourcesStore()

// 상태
const query = ref('')
const isLoading = ref(false)
const isCreatingInstances = ref(false)
const generatedSql = ref<string | null>(null)
const queryResult = ref<{ columns: string[]; rows: any[]; rowCount: number } | null>(null)
const executionTimeMs = ref(0)

// ResultTable용 데이터 형식 변환
const resultTableData = computed<ReactExecutionResult | null>(() => {
  if (!queryResult.value) return null
  return {
    columns: queryResult.value.columns,
    rows: queryResult.value.rows,
    row_count: queryResult.value.rowCount,
    execution_time_ms: executionTimeMs.value
  }
})
const error = ref<string | null>(null)
const successMessage = ref<string | null>(null)

// 인스턴스 생성 설정
const showInstanceConfig = ref(false)
const selectedIdColumn = ref('')
const selectedNameColumn = ref('')
const createMaterializedView = ref(true)
const mvViewName = ref('')

// 기본 쿼리 생성 (노드 기반)
const defaultQuery = computed(() => {
  const name = props.node.name
  const desc = props.node.description || props.node.label
  return `${name}(${desc})에 해당하는 모든 데이터를 조회해줘`
})

// 뷰 이름 기본값
watch(() => props.node.name, (newName) => {
  mvViewName.value = `mv_${newName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_instances`
}, { immediate: true })

// 자연어 쿼리 실행 (Text2SQL /ask API 사용)
async function executeQuery() {
  if (!query.value.trim()) {
    query.value = defaultQuery.value
  }
  
  isLoading.value = true
  error.value = null
  successMessage.value = null
  generatedSql.value = null
  queryResult.value = null
  showInstanceConfig.value = false
  
  try {
    const selectedDs = datasourcesStore.selectedDatasource
    if (!selectedDs?.name) {
      throw new Error('데이터소스를 선택해주세요')
    }
    const response = await fetch('/api/gateway/text2sql/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: query.value,
        datasource: selectedDs.name,
        limit: 1000
      })
    })
    
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}))
      throw new Error(errData.detail || `HTTP ${response.status}`)
    }
    
    const result = await response.json()
    console.log('[EntityQueryPanel] API 응답:', result)
    
    // SQL 추출
    if (result.sql) {
      generatedSql.value = result.sql
      emit('sql-generated', result.sql)
    }
    
    // 결과 추출 - 다양한 응답 형식 지원
    const tableData = result.table || result.result || result.data
    console.log('[EntityQueryPanel] 테이블 데이터:', tableData)
    
    if (tableData) {
      queryResult.value = {
        columns: tableData.columns || Object.keys(tableData.rows?.[0] || {}),
        rows: tableData.rows || [],
        rowCount: tableData.row_count || tableData.rowCount || tableData.rows?.length || 0
      }
      executionTimeMs.value = result.perf?.sql_ms || result.perf?.total_ms || 0
      console.log('[EntityQueryPanel] queryResult:', queryResult.value)
      
      // 컬럼이 있으면 기본 ID/이름 컬럼 선택
      if (queryResult.value.columns.length > 0) {
        selectedIdColumn.value = queryResult.value.columns[0]
        selectedNameColumn.value = queryResult.value.columns.length > 1 
          ? queryResult.value.columns[1] 
          : queryResult.value.columns[0]
      }
    } else {
      console.log('[EntityQueryPanel] 테이블 데이터 없음')
    }
    
  } catch (err) {
    error.value = err instanceof Error ? err.message : '쿼리 실행 실패'
  } finally {
    isLoading.value = false
  }
}

// 인스턴스 생성 확인
function confirmInstances() {
  showInstanceConfig.value = true
}

// 인스턴스 생성 실행
async function createInstances() {
  if (!generatedSql.value || !selectedIdColumn.value) {
    error.value = 'ID 컬럼을 선택해주세요'
    return
  }
  
  isCreatingInstances.value = true
  error.value = null
  successMessage.value = null
  
  try {
    const selectedDs = datasourcesStore.selectedDatasource
    if (!selectedDs?.name) {
      throw new Error('데이터소스를 선택해주세요')
    }
    // 1. Materialized View 생성 (선택된 경우)
    let viewFullName = null
    if (createMaterializedView.value && mvViewName.value) {
      const mvResponse = await fetch('/api/gateway/text2sql/direct-sql/materialized-view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datasource: selectedDs.name,
          view_name: mvViewName.value,
          sql_query: generatedSql.value,
          schema_name: 'public',
          description: `${props.node.name} 인스턴스 동기화`,
          refresh_on_create: true
        })
      })
      
      if (mvResponse.ok) {
        const mvData = await mvResponse.json()
        viewFullName = mvData.full_name
      }
    }
    
    // 2. Neo4j에 인스턴스 생성
    const schemaId = props.schemaId || ontologyStore.schema?.id
    if (!schemaId) {
      throw new Error('스키마 ID가 없습니다')
    }
    
    const response = await fetch('/api/gateway/ontology/instances/bulk-create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schema_id: schemaId,
        node_type: props.node.name,
        sql_query: generatedSql.value,
        id_column: selectedIdColumn.value,
        name_column: selectedNameColumn.value || selectedIdColumn.value,
        materialized_view: viewFullName,
        source_question: query.value
      })
    })
    
    if (response.ok) {
      const result = await response.json()
      const count = result.created_count || 0
      successMessage.value = `${count}개의 ${props.node.name} 인스턴스가 생성되었습니다!`
      showInstanceConfig.value = false
      
      // 스토어의 노드 인스턴스 개수 업데이트
      ontologyStore.updateNodeInstanceCountByName(props.node.name, count)
      
      // 캔버스에 인스턴스 노드 추가 (쿼리 결과에서 인스턴스 목록 생성)
      if (queryResult.value) {
        const instances = queryResult.value.rows.map(row => ({
          id: String(row[selectedIdColumn.value] || ''),
          name: String(row[selectedNameColumn.value || selectedIdColumn.value] || '')
        })).filter(i => i.id)
        ontologyStore.addCanvasInstances(props.node.name, instances)
      }
      
      emit('instances-created', count)
    } else {
      const errData = await response.json()
      throw new Error(errData.detail || '인스턴스 생성 실패')
    }
    
  } catch (err) {
    error.value = err instanceof Error ? err.message : '인스턴스 생성 실패'
  } finally {
    isCreatingInstances.value = false
  }
}

// 전체 Text2SQL 탭으로 이동
function openFullText2Sql() {
  sessionStore.navigateToNLSearch(query.value || defaultQuery.value)
}

// 기본 쿼리 사용
function useDefaultQuery() {
  query.value = defaultQuery.value
}
</script>

<template>
  <div class="entity-query-panel">
    <!-- 헤더 -->
    <div class="panel-header">
      <div class="header-title">
        <IconSearch :size="16" />
        <span>{{ node.name }} 인스턴스 검색</span>
      </div>
      <button class="expand-btn" @click="openFullText2Sql" title="전체 화면으로 보기">
        <IconLink :size="14" />
      </button>
    </div>
    
    <!-- 검색 입력 -->
    <div class="query-input-area">
      <textarea 
        v-model="query"
        :placeholder="defaultQuery"
        rows="2"
        :disabled="isLoading"
        @keydown.ctrl.enter.prevent="executeQuery"
      ></textarea>
      <div class="input-actions">
        <button 
          class="default-query-btn"
          @click="useDefaultQuery"
          title="기본 쿼리 사용"
        >
          <IconRefresh :size="12" />
        </button>
        <button 
          class="execute-btn"
          @click="executeQuery"
          :disabled="isLoading"
        >
          <span v-if="isLoading" class="spinner-small"></span>
          <IconPlay v-else :size="14" />
          <span>{{ isLoading ? '검색 중...' : '검색' }}</span>
        </button>
      </div>
    </div>
    
    <!-- 에러 -->
    <div v-if="error" class="error-message">
      {{ error }}
    </div>
    
    <!-- 성공 메시지 -->
    <div v-if="successMessage" class="success-message">
      <IconCheck :size="16" />
      {{ successMessage }}
    </div>
    
    <!-- 생성된 SQL -->
    <div v-if="generatedSql" class="generated-sql">
      <div class="sql-header">
        <span>생성된 SQL</span>
      </div>
      <pre class="sql-code">{{ generatedSql }}</pre>
    </div>
    
    <!-- 결과 테이블 (기존 ResultTable 컴포넌트 사용) -->
    <div v-if="resultTableData && resultTableData.rows.length > 0" class="result-section">
      <ResultTable :data="resultTableData" :max-rows="20" />
      
      <!-- 인스턴스로 채택 버튼 -->
      <div v-if="!showInstanceConfig" class="adopt-actions">
        <button class="adopt-btn" @click="confirmInstances">
          <IconCheck :size="16" />
          <span>이 데이터를 {{ node.name }} 인스턴스로 채택</span>
        </button>
      </div>
    </div>
    
    <!-- 기존 결과 미리보기 제거 - ResultTable로 대체 -->
    <div v-if="false" class="result-preview-old">
      <div class="result-header">
        <span>검색 결과 ({{ queryResult?.rowCount }}건)</span>
      </div>
      <div class="result-table-wrapper">
        <table class="result-table">
          <thead>
            <tr>
              <th v-for="col in queryResult?.columns.slice(0, 6)" :key="col">{{ col }}</th>
              <th v-if="(queryResult?.columns.length || 0) > 6">...</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, idx) in queryResult?.rows.slice(0, 10)" :key="idx">
              <td v-for="col in queryResult?.columns.slice(0, 6)" :key="col">
                {{ row[col] ?? '-' }}
              </td>
              <td v-if="(queryResult?.columns.length || 0) > 6">...</td>
            </tr>
            <tr v-if="(queryResult?.rows.length || 0) > 10" class="more-row">
              <td :colspan="Math.min(queryResult?.columns.length || 1, 7)">
                ... 외 {{ queryResult.rows.length - 10 }}개 더 있음
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    
    <!-- 인스턴스 생성 설정 -->
    <div v-if="showInstanceConfig && queryResult" class="instance-config">
      <div class="config-header">
        <IconDatabase :size="16" />
        <span>인스턴스 생성 설정</span>
      </div>
      
      <div class="config-form">
        <div class="form-row">
          <label>ID 컬럼 (필수)</label>
          <select v-model="selectedIdColumn">
            <option v-for="col in queryResult.columns" :key="col" :value="col">
              {{ col }}
            </option>
          </select>
        </div>
        
        <div class="form-row">
          <label>이름 컬럼</label>
          <select v-model="selectedNameColumn">
            <option value="">ID와 동일</option>
            <option v-for="col in queryResult.columns" :key="col" :value="col">
              {{ col }}
            </option>
          </select>
        </div>
        
        <div class="form-row checkbox-row">
          <label>
            <input type="checkbox" v-model="createMaterializedView" />
            Materialized View 생성 (데이터 동기화용)
          </label>
        </div>
        
        <div v-if="createMaterializedView" class="form-row">
          <label>뷰 이름</label>
          <input v-model="mvViewName" type="text" placeholder="mv_..." />
        </div>
      </div>
      
      <div class="config-actions">
        <button class="cancel-btn" @click="showInstanceConfig = false">
          취소
        </button>
        <button 
          class="create-btn"
          @click="createInstances"
          :disabled="isCreatingInstances || !selectedIdColumn"
        >
          <span v-if="isCreatingInstances" class="spinner-small"></span>
          <span>{{ isCreatingInstances ? '생성 중...' : `${queryResult.rowCount}개 인스턴스 생성` }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.entity-query-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--color-bg-tertiary);
  border-radius: 10px;
  border: 1px solid var(--color-border);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  
  .header-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--color-text-bright);
  }
  
  .expand-btn {
    padding: 6px 10px;
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all 0.2s;
    
    &:hover {
      background: var(--color-bg-hover);
      color: var(--color-accent);
      border-color: var(--color-accent);
    }
  }
}

.query-input-area {
  display: flex;
  flex-direction: column;
  gap: 8px;
  
  textarea {
    padding: 10px 12px;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    color: var(--color-text);
    font-size: 0.85rem;
    resize: none;
    
    &:focus {
      outline: none;
      border-color: var(--color-accent);
    }
    
    &::placeholder {
      color: var(--color-text-muted);
    }
  }
  
  .input-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }
  
  .default-query-btn {
    padding: 6px 10px;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    color: var(--color-text-muted);
    cursor: pointer;
    
    &:hover {
      background: var(--color-bg-hover);
      color: var(--color-text);
    }
  }
  
  .execute-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    background: linear-gradient(135deg, #00d4aa, #00a8cc);
    border: none;
    border-radius: 6px;
    color: white;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    
    &:hover:not(:disabled) {
      filter: brightness(1.1);
    }
    
    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }
}

.error-message {
  padding: 10px 12px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 6px;
  color: #f87171;
  font-size: 0.85rem;
}

.success-message {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  background: rgba(52, 211, 153, 0.1);
  border: 1px solid rgba(52, 211, 153, 0.3);
  border-radius: 8px;
  color: #34d399;
  font-size: 0.9rem;
  font-weight: 500;
}

.generated-sql {
  .sql-header {
    font-size: 0.8rem;
    color: var(--color-text-muted);
    margin-bottom: 6px;
  }
  
  .sql-code {
    padding: 10px 12px;
    background: var(--color-bg-secondary);
    border-radius: 6px;
    font-size: 0.75rem;
    color: var(--color-text-light);
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-all;
    margin: 0;
    max-height: 100px;
  }
}

// 결과 섹션 (ResultTable + 채택 버튼)
.result-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  
  :deep(.result-table) {
    max-height: 300px;
    overflow-y: auto;
  }
}

.adopt-actions {
  display: flex;
  justify-content: center;
  padding: 12px 0;
  
  .adopt-btn {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 28px;
    background: linear-gradient(135deg, #a78bfa, #7c3aed);
    border: none;
    border-radius: 10px;
    color: white;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    
    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(167, 139, 250, 0.4);
    }
  }
}

.result-preview, .result-preview-old {
  .result-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
    
    span {
      font-size: 0.85rem;
      color: var(--color-text-light);
      font-weight: 500;
    }
    
    .confirm-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      background: linear-gradient(135deg, #a78bfa, #7c3aed);
      border: none;
      border-radius: 6px;
      color: white;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      
      &:hover {
        box-shadow: 0 4px 12px rgba(167, 139, 250, 0.4);
      }
    }
  }
  
  .result-table-wrapper {
    overflow-x: auto;
    border-radius: 6px;
    border: 1px solid var(--color-border);
  }
  
  .result-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.75rem;
    
    th, td {
      padding: 8px 10px;
      text-align: left;
      border-bottom: 1px solid var(--color-border);
      max-width: 120px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    
    th {
      background: var(--color-bg-secondary);
      color: var(--color-text-muted);
      font-weight: 500;
    }
    
    td {
      color: var(--color-text);
    }
    
    tbody tr:hover {
      background: var(--color-bg-hover);
    }
    
    .more-row td {
      text-align: center;
      color: var(--color-text-muted);
      font-style: italic;
    }
  }
}

.instance-config {
  padding: 16px;
  background: var(--color-bg-secondary);
  border: 1px solid rgba(167, 139, 250, 0.3);
  border-radius: 10px;
  
  .config-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;
    font-size: 0.9rem;
    font-weight: 600;
    color: #a78bfa;
  }
  
  .config-form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  
  .form-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    
    label {
      font-size: 0.8rem;
      color: var(--color-text-muted);
    }
    
    select, input[type="text"] {
      padding: 8px 12px;
      background: var(--color-bg-tertiary);
      border: 1px solid var(--color-border);
      border-radius: 6px;
      color: var(--color-text);
      font-size: 0.85rem;
      
      &:focus {
        outline: none;
        border-color: #a78bfa;
      }
    }
    
    &.checkbox-row label {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      font-size: 0.85rem;
      color: var(--color-text);
      
      input[type="checkbox"] {
        width: 16px;
        height: 16px;
        accent-color: #a78bfa;
      }
    }
  }
  
  .config-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 16px;
    
    .cancel-btn {
      padding: 8px 16px;
      background: var(--color-bg-tertiary);
      border: 1px solid var(--color-border);
      border-radius: 6px;
      color: var(--color-text);
      font-size: 0.85rem;
      cursor: pointer;
      
      &:hover {
        background: var(--color-bg-hover);
      }
    }
    
    .create-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 10px 20px;
      background: linear-gradient(135deg, #a78bfa, #7c3aed);
      border: none;
      border-radius: 6px;
      color: white;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      
      &:hover:not(:disabled) {
        box-shadow: 0 4px 16px rgba(167, 139, 250, 0.4);
      }
      
      &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
    }
  }
}

.spinner-small {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
