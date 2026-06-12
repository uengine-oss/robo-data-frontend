<script setup lang="ts">
/**
 * InstancePanel.vue
 * 선택된 온톨로지 노드의 실제 인스턴스 데이터 표시
 * 데이터 소스 바인딩 및 Text2SQL 에이전트를 통한 인스턴스 조회
 */
import { ref, watch, computed, onMounted } from 'vue'
import { useOntologyStore } from '@/stores/ontology'
import { useSessionStore } from '@/stores/session'
import type { OntologyNode } from '@/types'
import { storeToRefs } from 'pinia'
import { IconX, IconRefresh, IconDatabase, IconSearch, IconCheck } from '@/components/icons'
import { ontologyApi } from '@/services/api'
import { Text2SqlTab } from '@/features/text2sql'
import { useReactStore } from '@/stores/text2sql'
import { useDatasourcesStore } from '@/stores/datasources'

const sessionStore = useSessionStore()
const datasourcesStore = useDatasourcesStore()

const props = defineProps<{
  node: OntologyNode
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'instances-updated', data: { nodeId: string; count: number }): void
}>()

const store = useOntologyStore()
const { instanceData, instanceLoading } = storeToRefs(store)

// 로딩 상태 alias
const isLoadingInstances = instanceLoading

// 데이터 제한
const limit = ref(20)

// 데이터 소스 바인딩 상태
const availableTables = ref<string[]>([])
const selectedTable = ref('')
const tableSearchQuery = ref('')
const isLoadingTables = ref(false)
const isBinding = ref(false)
const bindingError = ref<string | null>(null)

// Text2SQL 자동 검색 (더 이상 로컬 상태 필요 없음 - 탭 이동 방식)

// 현재 노드의 인스턴스 데이터
const currentInstances = computed(() => {
  return instanceData.value
})

// 필터된 테이블 목록
const filteredTables = computed(() => {
  if (!tableSearchQuery.value) return availableTables.value
  const query = tableSearchQuery.value.toLowerCase()
  return availableTables.value.filter(t => t.toLowerCase().includes(query))
})

// 노드 라벨에 따른 아이콘
const nodeIcon = computed(() => {
  const label = props.node.label.toLowerCase()
  if (label.includes('asset')) return '📦'
  if (label.includes('system')) return '🖥️'
  if (label.includes('event') || label.includes('alarm')) return '⚡'
  return '🔧'
})

// 데이터 로드
async function loadData() {
  if (props.node.dataSource) {
    await store.loadInstanceData(props.node)
  }
}

// 사용 가능한 테이블 목록 로드
async function loadAvailableTables() {
  isLoadingTables.value = true
  try {
    const response = await ontologyApi.getAvailableDataSources()
    availableTables.value = (response.tables || []).map(t => typeof t === 'string' ? t : t.name)
  } catch (err) {
    console.error('Failed to load tables:', err)
    availableTables.value = []
  } finally {
    isLoadingTables.value = false
  }
}

// AI 인스턴스 탐색 모달 상태
const showInstanceExplorerModal = ref(false)
const reactStore = useReactStore()

// 기본 인스턴스 검색 쿼리
const defaultInstanceQuery = computed(() => {
  const name = props.node.name
  const desc = props.node.description || props.node.label
  return `${name}(${desc})에 해당하는 모든 데이터를 조회해줘`
})

// AI 인스턴스 탐색 모달 열기
function openInstanceExplorer() {
  showInstanceExplorerModal.value = true
}

// reactStore에서 결과 가져오기
const hasSearchResult = computed(() => {
  return reactStore.executionResult && 
         reactStore.executionResult.rows && 
         reactStore.executionResult.rows.length > 0
})

const searchResultColumns = computed(() => {
  return reactStore.executionResult?.columns || []
})

const searchResultRowCount = computed(() => {
  return reactStore.executionResult?.row_count || 0
})

// 인스턴스 생성 설정
const showInstanceConfig = ref(false)
const selectedIdColumn = ref('')
const selectedNameColumn = ref('')
const createMaterializedView = ref(true)
const mvViewName = ref('')
const isCreatingInstances = ref(false)
const createError = ref<string | null>(null)
const createSuccess = ref<string | null>(null)

// 뷰 이름 기본값
watch(() => props.node.name, (newName) => {
  mvViewName.value = `mv_${newName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_instances`
}, { immediate: true })

// 결과가 나오면 컬럼 기본값 설정
watch(() => reactStore.executionResult, (result) => {
  if (result?.columns?.length) {
    selectedIdColumn.value = result.columns[0]
    selectedNameColumn.value = result.columns.length > 1 ? result.columns[1] : result.columns[0]
  }
})

// 인스턴스로 채택하기
function confirmAdopt() {
  showInstanceConfig.value = true
  createError.value = null
  createSuccess.value = null
}

// 인스턴스 생성 실행
async function createInstances() {
  if (!reactStore.finalSql || !selectedIdColumn.value) {
    createError.value = 'ID 컬럼을 선택해주세요'
    return
  }
  
  isCreatingInstances.value = true
  createError.value = null
  createSuccess.value = null
  
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
          sql_query: reactStore.finalSql,
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
    
    // 2. Neo4j에 인스턴스 생성 (백엔드에서 SQL 실행)
    const schemaId = store.schema?.id
    if (!schemaId) {
      throw new Error('스키마 ID가 없습니다')
    }
    
    const response = await fetch('/api/gateway/ontology/instances/bulk-create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schema_id: schemaId,
        node_type: props.node.name,
        sql_query: reactStore.finalSql,  // SQL만 전달, 백엔드에서 실행
        id_column: selectedIdColumn.value,
        name_column: selectedNameColumn.value || selectedIdColumn.value,
        materialized_view: viewFullName,
        source_question: reactStore.currentQuestion
      })
    })
    
    if (response.ok) {
      const result = await response.json()
      const count = result.created_count || 0
      createSuccess.value = `${count}개의 ${props.node.name} 인스턴스가 생성되었습니다!`
      
      // 스토어의 노드 인스턴스 개수 업데이트
      store.updateNodeInstanceCountByName(props.node.name, count)
      
      // 캔버스에 인스턴스 노드 추가
      if (reactStore.executionResult?.rows) {
        const instances = reactStore.executionResult.rows.map(row => ({
          id: String(row[selectedIdColumn.value] || ''),
          name: String(row[selectedNameColumn.value || selectedIdColumn.value] || '')
        })).filter(i => i.id)
        store.addCanvasInstances(props.node.name, instances)
      }
      
      // 성공 후 모달 닫기
      setTimeout(() => {
        showInstanceExplorerModal.value = false
        showInstanceConfig.value = false
        emit('instances-updated', { nodeId: props.node.id, count })
      }, 1500)
    } else {
      const errData = await response.json()
      throw new Error(errData.detail || '인스턴스 생성 실패')
    }
    
  } catch (err) {
    createError.value = err instanceof Error ? err.message : '인스턴스 생성 실패'
  } finally {
    isCreatingInstances.value = false
  }
}

// 인스턴스 생성 완료 후 처리 (기존 호환성 유지)
function handleInstancesCreatedInModal(count: number) {
  console.log(`모달에서 ${count}개 인스턴스 생성됨`)
  showInstanceExplorerModal.value = false
  emit('instances-updated', { nodeId: props.node.id, count })
}

// 데이터 소스 바인딩
async function bindDataSource() {
  if (!selectedTable.value) return
  
  isBinding.value = true
  bindingError.value = null
  
  try {
    await store.bindDataSource(props.node.id, selectedTable.value)
    // 바인딩 성공 후 데이터 로드
    await loadData()
  } catch (err) {
    bindingError.value = err instanceof Error ? err.message : '바인딩 실패'
  } finally {
    isBinding.value = false
  }
}

// 데이터 소스 바인딩 해제
async function unbindDataSource() {
  try {
    await store.unbindDataSource(props.node.id)
    selectedTable.value = ''
  } catch (err) {
    console.error('Unbind failed:', err)
  }
}

// 노드 변경 시 데이터 로드
watch(() => props.node.id, () => {
  if (props.node.dataSource) {
    loadData()
  }
}, { immediate: true })

// 컴포넌트 마운트 시 테이블 목록 로드
onMounted(() => {
  if (!props.node.dataSource) {
    loadAvailableTables()
  }
})

// 셀 값 포맷팅
function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'boolean') return value ? '✓' : '✗'
  if (typeof value === 'number') return value.toLocaleString()
  if (value instanceof Date) return value.toLocaleString()
  const str = String(value)
  return str.length > 50 ? str.substring(0, 50) + '...' : str
}

// 현재 스키마 ID
const currentSchemaId = computed(() => store.schema?.id || '')

// EntityQueryPanel 이벤트 핸들러
function handleSqlGenerated(sql: string) {
  console.log('Generated SQL:', sql)
}

function handleInstancesCreated(count: number) {
  console.log(`${count}개 인스턴스 생성됨`)
  // 인스턴스 데이터 새로고침
  if (props.node.dataSource) {
    loadData()
  }
}
</script>

<template>
  <aside class="instance-panel">
    <!-- 헤더 -->
    <div class="panel-header">
      <div class="header-title">
        <span class="node-icon">{{ nodeIcon }}</span>
        <div class="title-info">
          <h3>{{ node.name }}</h3>
          <span class="node-label-badge">{{ node.label }}</span>
        </div>
      </div>
      <button class="close-btn" @click="emit('close')">
        <IconX :size="18" />
      </button>
    </div>
    
    <!-- 노드 정보 -->
    <div class="node-info">
      <div v-if="node.description" class="info-item">
        <span class="info-label">설명</span>
        <span class="info-value">{{ node.description }}</span>
      </div>
      
      <!-- 데이터 소스가 바인딩된 경우 -->
      <div v-if="node.dataSource" class="info-item">
        <span class="info-label">데이터 소스</span>
        <div class="data-source-bound">
          <span class="info-value data-source">
            <IconDatabase :size="14" />
            {{ node.dataSource }}
          </span>
          <button class="unbind-btn" @click="unbindDataSource" title="바인딩 해제">
            <IconX :size="12" />
          </button>
        </div>
      </div>
      
      <div class="info-item">
        <span class="info-label">인스턴스 수</span>
        <span class="info-value count">{{ node.instanceCount || 0 }}</span>
      </div>
    </div>
    
    <!-- 데이터 소스 바인딩 UI (바인딩되지 않은 경우) -->
    <div v-if="!node.dataSource" class="binding-section">
      <div class="binding-header">
        <span class="binding-title">🔗 데이터 소스 연결</span>
        <button 
          class="auto-search-btn" 
          @click="openInstanceExplorer"
          title="AI로 인스턴스 데이터 탐색 및 생성"
        >
          <IconSearch :size="14" />
          AI 인스턴스 탐색
        </button>
      </div>
      
      <!-- 테이블 검색 -->
      <div class="table-search">
        <input 
          v-model="tableSearchQuery"
          type="text"
          placeholder="테이블 검색..."
          class="search-input"
        />
      </div>
      
      <!-- 테이블 목록 -->
      <div v-if="isLoadingTables" class="loading-tables">
        <span class="spinner-small"></span>
        <span>테이블 목록 로딩 중...</span>
      </div>
      
      <div v-else-if="filteredTables.length === 0" class="no-tables">
        <span>사용 가능한 테이블이 없습니다</span>
        <button class="reload-btn" @click="loadAvailableTables">
          <IconRefresh :size="12" /> 새로고침
        </button>
      </div>
      
      <div v-else class="table-list">
        <div 
          v-for="table in filteredTables" 
          :key="table"
          :class="['table-item', { selected: selectedTable === table }]"
          @click="selectedTable = table"
        >
          <IconDatabase :size="14" />
          <span>{{ table }}</span>
        </div>
      </div>
      
      <!-- 바인딩 버튼 -->
      <div class="binding-actions">
        <button 
          class="bind-btn"
          :disabled="!selectedTable || isBinding"
          @click="bindDataSource"
        >
          <span v-if="isBinding" class="spinner-small"></span>
          <span v-else>🔗</span>
          {{ isBinding ? '연결 중...' : '데이터 소스 연결' }}
        </button>
      </div>
      
      <!-- 에러 메시지 -->
      <div v-if="bindingError" class="binding-error">
        {{ bindingError }}
      </div>
    </div>
    
    <!-- 데이터 테이블 (바인딩된 경우만 표시) -->
    <div v-if="node.dataSource" class="data-section">
      <div class="section-header">
        <span class="section-title">인스턴스 데이터</span>
        <div class="section-actions">
          <select v-model="limit" @change="loadData">
            <option :value="10">10건</option>
            <option :value="20">20건</option>
            <option :value="50">50건</option>
            <option :value="100">100건</option>
          </select>
          <button class="refresh-btn" @click="loadData" :disabled="isLoadingInstances">
            <IconRefresh :size="14" :class="{ spinning: isLoadingInstances }" />
          </button>
        </div>
      </div>
      
      <!-- 로딩 -->
      <div v-if="isLoadingInstances" class="loading-state">
        <span class="spinner"></span>
        <span>데이터 조회 중...</span>
      </div>
      
      <!-- 데이터 없음 -->
      <div v-else-if="!currentInstances || !currentInstances.rows || currentInstances.rows.length === 0" class="empty-state">
        <span class="empty-icon">📭</span>
        <span>인스턴스 데이터가 없습니다</span>
      </div>
      
      <!-- 데이터 테이블 -->
      <div v-else class="data-table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th v-for="col in currentInstances.columns" :key="col">{{ col }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, idx) in currentInstances.rows" :key="idx">
              <td v-for="(cell, cidx) in row" :key="cidx" :title="String(cell)">
                {{ formatCell(cell) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      
      <!-- 실행 정보 -->
      <div v-if="currentInstances && currentInstances.rowCount" class="exec-info">
        <span>{{ currentInstances.rowCount }}건 조회</span>
        <span v-if="currentInstances.executionTimeMs">
          · {{ currentInstances.executionTimeMs }}ms
        </span>
      </div>
    </div>
    
    <!-- 데이터 소스 미연결 안내 -->
    <div v-else class="no-datasource-hint">
      <span class="hint-icon">💡</span>
      <span>위에서 데이터 소스를 연결하면 실제 인스턴스 데이터를 조회할 수 있습니다.</span>
    </div>
    
    <!-- 자연어 검색 및 인스턴스 생성 -->
    <div class="query-section">
      <EntityQueryPanel 
        :node="node"
        :schema-id="currentSchemaId"
        @sql-generated="handleSqlGenerated"
        @instances-created="handleInstancesCreated"
      />
    </div>
  </aside>
  
  <!-- AI 인스턴스 탐색 모달 -->
  <Teleport to="body">
    <div v-if="showInstanceExplorerModal" class="instance-explorer-overlay">
      <div class="instance-explorer-modal large">
        <div class="modal-header">
          <div class="header-title">
            <span class="modal-icon">🔮</span>
            <h3>AI 인스턴스 탐색 - {{ node.name }}</h3>
          </div>
          <button class="close-btn" @click="showInstanceExplorerModal = false">✕</button>
        </div>
        
        <div class="modal-body">
          <!-- 기존 Text2SqlTab 컴포넌트 임베드 (히스토리 숨김, 자동 검색) -->
          <Text2SqlTab 
            class="embedded-text2sql" 
            :embedded="true"
            :initial-query="defaultInstanceQuery"
            :auto-execute="true"
          />
        </div>
        
        <!-- 결과가 있으면 채택 버튼 표시 -->
        <div v-if="hasSearchResult" class="modal-footer">
          <div class="result-summary">
            <span class="result-icon">📊</span>
            <span>검색 결과: <strong>{{ searchResultRowCount }}</strong>건</span>
          </div>
          
          <button v-if="!showInstanceConfig" class="adopt-btn" @click="confirmAdopt">
            <IconCheck :size="16" />
            <span>이 결과를 {{ node.name }} 인스턴스로 채택</span>
          </button>
          
          <!-- 인스턴스 생성 설정 -->
          <div v-if="showInstanceConfig" class="instance-config">
            <div class="config-row">
              <label>ID 컬럼</label>
              <select v-model="selectedIdColumn">
                <option v-for="col in searchResultColumns" :key="col" :value="col">{{ col }}</option>
              </select>
            </div>
            <div class="config-row">
              <label>이름 컬럼</label>
              <select v-model="selectedNameColumn">
                <option value="">ID와 동일</option>
                <option v-for="col in searchResultColumns" :key="col" :value="col">{{ col }}</option>
              </select>
            </div>
            <div class="config-row checkbox">
              <label>
                <input type="checkbox" v-model="createMaterializedView" />
                Materialized View 생성 (동기화용)
              </label>
            </div>
            <div v-if="createMaterializedView" class="config-row">
              <label>뷰 이름</label>
              <input v-model="mvViewName" type="text" placeholder="mv_..." />
            </div>
            
            <div v-if="createError" class="error-msg">{{ createError }}</div>
            <div v-if="createSuccess" class="success-msg">{{ createSuccess }}</div>
            
            <div class="config-actions">
              <button class="cancel-btn" @click="showInstanceConfig = false">취소</button>
              <button 
                class="create-btn" 
                @click="createInstances"
                :disabled="isCreatingInstances || !selectedIdColumn"
              >
                <span v-if="isCreatingInstances" class="spinner"></span>
                <span>{{ isCreatingInstances ? '생성 중...' : `${searchResultRowCount}개 인스턴스 생성` }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.instance-panel {
  width: 400px;
  min-width: 350px;
  max-width: 500px;
  background: var(--color-bg-secondary);
  border-left: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-tertiary);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 12px;
  
  .node-icon {
    font-size: 24px;
  }
  
  .title-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    
    h3 {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
      color: var(--color-text-bright);
    }
    
    .node-label-badge {
      font-size: 0.7rem;
      padding: 2px 8px;
      background: var(--color-accent);
      color: white;
      border-radius: 10px;
      width: fit-content;
    }
  }
}

.close-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all 0.2s;
  
  &:hover {
    background: var(--color-bg-hover);
    color: var(--color-text);
  }
}

.node-info {
  padding: 16px;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  
  .info-label {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  
  .info-value {
    font-size: 0.9rem;
    color: var(--color-text);
    
    &.data-source {
      display: flex;
      align-items: center;
      gap: 6px;
      font-family: 'JetBrains Mono', monospace;
      color: #38bdf8;
    }
    
    &.count {
      font-weight: 600;
      color: #34d399;
    }
  }
}

.data-source-bound {
  display: flex;
  align-items: center;
  gap: 8px;
  
  .unbind-btn {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all 0.2s;
    
    &:hover {
      background: var(--color-error);
      border-color: var(--color-error);
      color: white;
    }
  }
}

// 데이터 소스 바인딩 섹션
.binding-section {
  padding: 16px;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.binding-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  
  .binding-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--color-text);
  }
}

.auto-search-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: linear-gradient(135deg, #a78bfa, #7c3aed);
  border: none;
  border-radius: 6px;
  color: white;
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  
  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(167, 139, 250, 0.4);
  }
  
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  .spinning {
    animation: spin 1s linear infinite;
  }
}

.auto-search-result {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: rgba(52, 211, 153, 0.1);
  border: 1px solid rgba(52, 211, 153, 0.3);
  border-radius: 8px;
  font-size: 0.85rem;
  color: #34d399;
  
  .result-icon {
    font-size: 1rem;
  }
  
  strong {
    font-family: 'JetBrains Mono', monospace;
  }
}

.table-search {
  .search-input {
    width: 100%;
    padding: 10px 12px;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    color: var(--color-text);
    font-size: 0.85rem;
    
    &::placeholder {
      color: var(--color-text-muted);
    }
    
    &:focus {
      outline: none;
      border-color: var(--color-accent);
    }
  }
}

.loading-tables,
.no-tables {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
  color: var(--color-text-muted);
  font-size: 0.85rem;
}

.reload-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-text);
  font-size: 0.75rem;
  cursor: pointer;
  
  &:hover {
    border-color: var(--color-accent);
  }
}

.table-list {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  
  &::-webkit-scrollbar {
    width: 4px;
  }
  
  &::-webkit-scrollbar-thumb {
    background: var(--color-border);
    border-radius: 2px;
  }
}

.table-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  font-size: 0.85rem;
  font-family: 'JetBrains Mono', monospace;
  color: var(--color-text);
  cursor: pointer;
  transition: all 0.15s;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  
  &:last-child {
    border-bottom: none;
  }
  
  &:hover {
    background: var(--color-bg-hover);
  }
  
  &.selected {
    background: rgba(56, 189, 248, 0.15);
    color: #38bdf8;
  }
}

.binding-actions {
  display: flex;
  justify-content: flex-end;
}

.bind-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  background: linear-gradient(135deg, #38bdf8, #0ea5e9);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  
  &:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(56, 189, 248, 0.4);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.binding-error {
  padding: 10px 12px;
  background: rgba(248, 113, 113, 0.1);
  border: 1px solid rgba(248, 113, 113, 0.3);
  border-radius: 8px;
  font-size: 0.85rem;
  color: #f87171;
}

.spinner-small {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.no-datasource-hint {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 0.85rem;
  line-height: 1.5;
  
  .hint-icon {
    font-size: 24px;
  }
}

.data-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--color-bg-tertiary);
  
  .section-title {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--color-text-light);
  }
  
  .section-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    
    select {
      padding: 4px 8px;
      background: var(--color-bg);
      border: 1px solid var(--color-border);
      border-radius: 6px;
      color: var(--color-text);
      font-size: 0.8rem;
      cursor: pointer;
    }
    
    .refresh-btn {
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-bg);
      border: 1px solid var(--color-border);
      border-radius: 6px;
      color: var(--color-text);
      cursor: pointer;
      transition: all 0.2s;
      
      &:hover:not(:disabled) {
        border-color: var(--color-accent);
        color: var(--color-accent);
      }
      
      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      
      .spinning {
        animation: spin 1s linear infinite;
      }
    }
  }
}

.loading-state,
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--color-text-muted);
  font-size: 0.9rem;
}

.empty-icon {
  font-size: 32px;
  opacity: 0.5;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.data-table-wrapper {
  flex: 1;
  overflow: auto;
  
  &::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  
  &::-webkit-scrollbar-thumb {
    background: var(--color-border);
    border-radius: 3px;
  }
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
  
  thead {
    position: sticky;
    top: 0;
    background: var(--color-bg-tertiary);
    z-index: 1;
  }
  
  th {
    padding: 10px 12px;
    text-align: left;
    font-weight: 600;
    color: var(--color-text-muted);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    border-bottom: 1px solid var(--color-border);
    white-space: nowrap;
  }
  
  td {
    padding: 8px 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    color: var(--color-text);
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  tbody tr {
    transition: background 0.15s;
    
    &:hover {
      background: rgba(56, 189, 248, 0.05);
    }
  }
}

.exec-info {
  padding: 8px 16px;
  background: var(--color-bg-tertiary);
  border-top: 1px solid var(--color-border);
  font-size: 0.75rem;
  color: var(--color-text-muted);
  display: flex;
  gap: 4px;
}

.query-section {
  padding: 16px;
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
}

// AI 인스턴스 탐색 모달
.instance-explorer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.instance-explorer-modal {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  width: 90%;
  max-width: 700px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  
  &.large {
    max-width: 1200px;
    width: 95%;
    height: 90vh;
    max-height: 90vh;
  }
  
  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px;
    border-bottom: 1px solid var(--color-border);
    
    .header-title {
      display: flex;
      align-items: center;
      gap: 12px;
      
      .modal-icon {
        font-size: 1.5rem;
      }
      
      h3 {
        margin: 0;
        font-size: 1.1rem;
        font-weight: 600;
        color: var(--color-text-bright);
      }
    }
    
    .close-btn {
      background: transparent;
      border: none;
      color: var(--color-text-muted);
      font-size: 1.3rem;
      cursor: pointer;
      padding: 4px 10px;
      border-radius: 6px;
      
      &:hover {
        background: var(--color-bg-tertiary);
        color: var(--color-text-bright);
      }
    }
  }
  
  .modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 0;
    
    .embedded-text2sql {
      height: 100%;
      border: none;
      
      :deep(.text2sql-tab) {
        height: 100%;
      }
    }
  }
  
  .modal-footer {
    border-top: 1px solid var(--color-border);
    padding: 16px 24px;
    background: var(--color-bg-tertiary);
    display: flex;
    flex-direction: column;
    gap: 12px;
    
    .result-summary {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.9rem;
      color: var(--color-text-light);
      
      .result-icon {
        font-size: 1.2rem;
      }
      
      strong {
        color: #00d4aa;
      }
    }
    
    .adopt-btn {
      display: flex;
      align-items: center;
      justify-content: center;
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
    
    .instance-config {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: flex-end;
      
      .config-row {
        display: flex;
        flex-direction: column;
        gap: 4px;
        
        label {
          font-size: 0.75rem;
          color: var(--color-text-muted);
        }
        
        select, input[type="text"] {
          padding: 8px 12px;
          background: var(--color-bg-primary);
          border: 1px solid var(--color-border);
          border-radius: 6px;
          color: var(--color-text-bright);
          min-width: 150px;
        }
        
        &.checkbox {
          flex-direction: row;
          
          label {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 0.85rem;
            color: var(--color-text-light);
            
            input[type="checkbox"] {
              width: 16px;
              height: 16px;
            }
          }
        }
      }
      
      .error-msg {
        width: 100%;
        padding: 8px 12px;
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.3);
        border-radius: 6px;
        color: #f87171;
        font-size: 0.85rem;
      }
      
      .success-msg {
        width: 100%;
        padding: 8px 12px;
        background: rgba(34, 197, 94, 0.1);
        border: 1px solid rgba(34, 197, 94, 0.3);
        border-radius: 6px;
        color: #4ade80;
        font-size: 0.85rem;
      }
      
      .config-actions {
        display: flex;
        gap: 10px;
        margin-left: auto;
        
        .cancel-btn {
          padding: 10px 20px;
          background: transparent;
          border: 1px solid var(--color-border);
          border-radius: 8px;
          color: var(--color-text-light);
          cursor: pointer;
          
          &:hover {
            background: var(--color-bg-secondary);
          }
        }
        
        .create-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 24px;
          background: linear-gradient(135deg, #00d4aa, #00a8cc);
          border: none;
          border-radius: 8px;
          color: white;
          font-weight: 600;
          cursor: pointer;
          
          &:hover:not(:disabled) {
            box-shadow: 0 4px 16px rgba(0, 212, 170, 0.4);
          }
          
          &:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }
          
          .spinner {
            width: 14px;
            height: 14px;
            border: 2px solid transparent;
            border-top-color: white;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
          }
        }
      }
    }
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
