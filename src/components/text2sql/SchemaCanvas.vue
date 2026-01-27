<script setup lang="ts">
import { ref, onMounted, provide, computed, markRaw, watch, nextTick } from 'vue'
import { VueFlow, useVueFlow, type Connection, type NodeChange } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import TableNode from './nodes/TableNode.vue'
import TableDetailPanel from './TableDetailPanel.vue'
import CardinalityModal, { type ConnectionInfo, type Cardinality, type MatchStrategy } from './CardinalityModal.vue'
import EditRelationshipDialog from './EditRelationshipDialog.vue'
import { useSchemaCanvasStore } from '@/stores/schemaCanvas'
import type { Text2SqlTableInfo } from '@/types'
import { IconTable, IconSearch, IconRefresh, IconTrash, IconZoomIn, IconZoomOut, IconMaximize, IconLink, IconFolder, IconChevronRight, IconDatabase } from '@/components/icons'

// Props
const props = withDefaults(defineProps<{
  hideTablePanel?: boolean  // 왼쪽 테이블 패널 숨기기 (ObjectTypeModeler에서 사용)
  hideLegend?: boolean      // FK 관계 범례 숨기기 (ObjectTypeModeler에서 사용)
}>(), {
  hideTablePanel: false,
  hideLegend: false
})

// Behavior 인터페이스
interface Behavior {
  name: string
  description?: string
  behaviorType: 'rest_api' | 'javascript' | 'python' | 'dmn'
  config: Record<string, any>
  inputFields?: string[]
  outputField?: string
}

// Emits
const emit = defineEmits<{
  (e: 'empty-drop', data: { sourceType: string; sourceColumn: string }): void
  (e: 'open-behavior-dialog', data: { mode: 'create' | 'edit', objectTypeName: string, columns: string[], behavior?: Behavior }): void
}>()

const store = useSchemaCanvasStore()
const isDragOver = ref(false)
const searchQuery = ref('')
const isConnecting = ref(false)

// 소스 코드 패널 refs
const sourceCodeContentRef = ref<HTMLElement | null>(null)

// 하이라이트된 라인으로 스크롤하는 함수
function scrollToHighlightedLine() {
  const lineNumber = store.sourceCodePanel.highlightedLine
  if (!lineNumber || !sourceCodeContentRef.value) return
  
  const lineElement = sourceCodeContentRef.value.querySelector(`[data-line="${lineNumber}"]`)
  if (lineElement) {
    lineElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
    console.log('[scrollToHighlightedLine] 스크롤 완료:', lineNumber)
  } else {
    console.warn('[scrollToHighlightedLine] 라인 엘리먼트를 찾을 수 없음:', lineNumber)
  }
}

// 소스 코드 패널이 열리거나 하이라이트 라인이 변경되면 스크롤
watch(
  () => [store.sourceCodePanel.isOpen, store.sourceCodePanel.highlightedLine],
  ([isOpen, lineNumber]) => {
    if (isOpen && lineNumber) {
      // DOM 렌더링 완료 후 스크롤 (약간의 딜레이 필요)
      nextTick(() => {
        setTimeout(() => {
          scrollToHighlightedLine()
        }, 200)
      })
    }
  },
  { immediate: true }
)

// Statement 로딩 완료 후에도 스크롤 재조정 (AI 설명이 추가되면 위치가 바뀔 수 있음)
watch(
  () => store.sourceCodePanel.isLoadingStatements,
  (isLoading, wasLoading) => {
    if (wasLoading && !isLoading && store.sourceCodePanel.isOpen) {
      // 로딩 완료 후 스크롤 재조정
      nextTick(() => {
        setTimeout(() => {
          scrollToHighlightedLine()
        }, 100)
      })
    }
  }
)

// 라인에 해당하는 statement 설명 찾기
function getStatementForLine(lineNumber: number) {
  const statements = store.sourceCodePanel.statements
  if (!statements || statements.length === 0) return null
  
  // 해당 라인이 시작 라인인 statement 찾기
  const statement = statements.find(s => s.start_line === lineNumber)
  if (statement && (statement.summary || statement.ai_description)) {
    return statement
  }
  return null
}

// 데이터 셀 포맷팅
function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'number') {
    return value.toLocaleString()
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }
  const str = String(value)
  // 너무 긴 문자열은 자르기
  return str.length > 100 ? str.substring(0, 100) + '...' : str
}

// 클립보드에 복사
function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).then(() => {
    console.log('SQL 복사됨:', text)
  }).catch(err => {
    console.error('클립보드 복사 실패:', err)
  })
}

// ========== Behavior 실행 모드 관련 ==========

// Behavior 실행 결과 팝업 상태
const showBehaviorResultPopup = ref(false)
const behaviorResultData = ref<any>(null)
const behaviorResultError = ref<string | null>(null)
const executingRowIndex = ref<number | null>(null)

// React Agent 관련 상태
const showOriginalCode = ref(false)
const selectedAttemptIndex = ref(0)

// 표시할 코드 (원본 vs 수정됨)
const displayedCode = computed(() => {
  if (!behaviorResultData.value) return ''
  if (showOriginalCode.value && behaviorResultData.value.originalCode) {
    return behaviorResultData.value.originalCode
  }
  return behaviorResultData.value.code || ''
})

// Behavior 모드 종료
function cancelBehaviorMode() {
  store.cancelBehaviorMode()
  showBehaviorResultPopup.value = false
  behaviorResultData.value = null
  behaviorResultError.value = null
  executingRowIndex.value = null
  showOriginalCode.value = false
  selectedAttemptIndex.value = 0
}

// 행 데이터를 객체로 변환
function rowToObject(row: any[], columns: string[]): Record<string, any> {
  const obj: Record<string, any> = {}
  columns.forEach((col, idx) => {
    obj[col] = row[idx]
  })
  return obj
}

// 단일 행에 대해 behavior 실행
async function executeBehaviorForRow(rowIdx: number) {
  const behavior = store.tableDataPanel.activeBehavior
  if (!behavior) return
  
  const row = store.tableDataPanel.rows[rowIdx]
  const instanceData = rowToObject(row, store.tableDataPanel.columns)
  
  executingRowIndex.value = rowIdx
  store.tableDataPanel.isExecutingBehavior = true
  behaviorResultError.value = null
  
  try {
    const url = `/api/gateway/ontology/object-types/${encodeURIComponent(behavior.objectTypeName)}/behaviors/${encodeURIComponent(behavior.name)}/execute`
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instanceData: instanceData })
    })
    
    if (!response.ok) {
      const errData = await response.json()
      // detail이 배열인 경우 (Pydantic validation error) 처리
      let errorMsg = 'Behavior 실행 실패'
      if (errData.detail) {
        if (Array.isArray(errData.detail)) {
          errorMsg = errData.detail.map((e: any) => e.msg || JSON.stringify(e)).join(', ')
        } else if (typeof errData.detail === 'string') {
          errorMsg = errData.detail
        } else {
          errorMsg = JSON.stringify(errData.detail)
        }
      }
      throw new Error(errorMsg)
    }
    
    const result = await response.json()
    behaviorResultData.value = result
    showBehaviorResultPopup.value = true
    
    console.log(`[Behavior] Row ${rowIdx} 실행 완료:`, result)
  } catch (err) {
    console.error(`[Behavior] Row ${rowIdx} 실행 오류:`, err)
    behaviorResultError.value = err instanceof Error ? err.message : '실행 오류'
    behaviorResultData.value = null
    showBehaviorResultPopup.value = true
  } finally {
    store.tableDataPanel.isExecutingBehavior = false
    executingRowIndex.value = null
  }
}

// 결과 팝업 닫기
function closeBehaviorResultPopup() {
  showBehaviorResultPopup.value = false
  behaviorResultData.value = null
  behaviorResultError.value = null
  showOriginalCode.value = false
  selectedAttemptIndex.value = 0
}

// 데이터소스 폴더 확장 상태
const expandedDatasources = ref<Record<string, boolean>>({
  robo_postgres: true  // 기본적으로 첫 번째 데이터소스는 펼쳐서 표시
})

// 스키마 폴더 확장 상태
const expandedSchemas = ref<Record<string, boolean>>({
  public: true,  // 기본적으로 public 스키마는 펼쳐서 표시
  ins: true      // ins 스키마도 펼쳐서 표시
})

// SQL 쿼리 표시 토글
const showSqlQuery = ref(false)

function toggleDatasource(ds: string) {
  expandedDatasources.value[ds] = !expandedDatasources.value[ds]
}

function toggleSchema(schema: string) {
  expandedSchemas.value[schema] = !expandedSchemas.value[schema]
}

// 데이터소스 내 스키마 수 계산
function getSchemasInDatasource(ds: string): string[] {
  const schemas = store.tablesByDatasource[ds]
  return schemas ? Object.keys(schemas).sort() : []
}

// 데이터소스 내 총 테이블 수 계산
function getTableCountInDatasource(ds: string): number {
  const schemas = store.tablesByDatasource[ds]
  if (!schemas) return 0
  return Object.values(schemas).reduce((sum, tables) => sum + tables.length, 0)
}

// Cardinality Modal State
const isCardinalityModalOpen = ref(false)
const pendingConnection = ref<ConnectionInfo | null>(null)

// Edge Edit Dialog State
const isEditRelationshipDialogOpen = ref(false)
const editingRelationship = ref<{
  id: string
  sourceType: string
  targetType: string
  sourceColumn: string
  targetColumn: string
} | null>(null)

const { fitView, zoomIn, zoomOut } = useVueFlow()

// Node types - using markRaw to prevent Vue from making the component reactive
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeTypes: Record<string, any> = {
  tableNode: markRaw(TableNode)
}

// MiniMap node color
function getNodeColor() {
  return '#228be6'
}

// Computed
const nodesWithSelection = computed(() => {
  return store.nodes.map(node => ({
    ...node,
    class: store.selectedNodeId === node.id ? 'table-node--selected' : ''
  }))
})

// 엣지에 애니메이션 클래스 적용
const edgesWithAnimation = computed(() => {
  return store.edges.map(edge => {
    // 새로 추가된 엣지 감지
    const isNewEdge = store.newlyAddedEdges.has(edge.id) || 
      (edge.data?.source && edge.data?.target && 
       store.newlyAddedEdges.has(`${edge.data.fromTable}.${edge.data.source}->${edge.data.toTable}.${edge.data.target}`))
    
    return {
      ...edge,
      class: isNewEdge ? 'edge-newly-added' : '',
      animated: isNewEdge || edge.animated
    }
  })
})

// Provide handlers to child nodes
provide('onRemoveTable', (tableName: string) => {
  store.removeTableFromCanvas(tableName)
})

provide('onLoadRelated', async (tableName: string) => {
  await store.loadRelatedTables(tableName)
  setTimeout(() => fitView({ padding: 0.3 }), 150)
})

// Lifecycle
onMounted(async () => {
  await store.loadAllTables()
  await store.loadUserRelationships()
  
  // 초기 로드 후 엣지 업데이트 (캔버스에 테이블이 이미 있는 경우)
  if (store.nodes.length > 0) {
    setTimeout(() => {
      store.updateEdgesFromRelationships()
    }, 500)
  }
})

// Handlers
let semanticSearchTimeout: ReturnType<typeof setTimeout> | null = null

function handleSearch() {
  store.searchQuery = searchQuery.value
  
  // 시멘틱 검색 디바운스 (500ms 후 실행)
  if (semanticSearchTimeout) {
    clearTimeout(semanticSearchTimeout)
  }
  
  if (searchQuery.value.trim().length >= 2) {
    semanticSearchTimeout = setTimeout(() => {
      store.performSemanticSearch(searchQuery.value)
    }, 500)
  } else {
    store.clearSemanticSearch()
  }
}

function clearSearch() {
  searchQuery.value = ''
  store.searchQuery = ''
  store.clearSemanticSearch()
  if (semanticSearchTimeout) {
    clearTimeout(semanticSearchTimeout)
  }
}

async function handleDrop(event: DragEvent) {
  event.preventDefault()
  isDragOver.value = false
  
  const data = event.dataTransfer?.getData('application/json')
  if (!data) return
  
  try {
    const parsed = JSON.parse(data)
    
    // Get drop position relative to canvas
    const bounds = (event.target as HTMLElement).getBoundingClientRect()
    const position = {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top
    }
    
    // ObjectType인 경우 (직접 데이터 형식)
    if (parsed._isObjectType || parsed.isObjectType || parsed.schema === 'ObjectType') {
      const tableInfo = {
        name: parsed.name,
        schema: parsed.schema || 'ObjectType',
        description: parsed.description || '',
        column_count: parsed.column_count || 0
      }
      await store.addTableToCanvas(tableInfo, position, {
        autoLoadRelated: false,
        isPrimary: true,
        columns: parsed._columns || parsed.columns || [],
        isObjectType: true,
        behaviors: parsed.behaviors || []
      })
    } 
    // 기존 테이블 드래그 형식 (table 래핑)
    else if (parsed.table) {
      await store.addTableToCanvas(parsed.table, position)
    }
    // 직접 테이블 정보 형식
    else if (parsed.name) {
      await store.addTableToCanvas(parsed, position)
    }
    
    setTimeout(() => fitView({ padding: 0.3 }), 150)
  } catch (error) {
    console.error('Failed to handle drop:', error)
  }
}

function handleDragOver(event: DragEvent) {
  event.preventDefault()
  isDragOver.value = true
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy'
  }
}

function handleDragLeave() {
  isDragOver.value = false
}

function startDragTable(event: DragEvent, table: Text2SqlTableInfo) {
  if (event.dataTransfer) {
    event.dataTransfer.setData('application/json', JSON.stringify({ table }))
    event.dataTransfer.effectAllowed = 'copy'
  }
}

// 테이블 더블클릭 - 캔버스에 추가
async function handleTableDoubleClick(table: Text2SqlTableInfo) {
  console.log('[SchemaCanvas] 🖱️ 테이블 더블클릭:', table.name)
  await store.addTableToCanvas(table)
  setTimeout(() => fitView({ padding: 0.3 }), 150)
}

// 시멘틱 검색 결과 드래그
function startDragSemanticResult(event: DragEvent, result: { name: string; schema: string; description: string }) {
  const table: Text2SqlTableInfo = {
    name: result.name,
    schema: result.schema,
    description: result.description,
    column_count: 0
  }
  if (event.dataTransfer) {
    event.dataTransfer.setData('application/json', JSON.stringify({ table }))
    event.dataTransfer.effectAllowed = 'copy'
  }
}

// 시멘틱 검색 결과 더블클릭으로 캔버스에 추가
async function addSemanticResultToCanvas(result: { name: string; schema: string; description: string }) {
  const table: Text2SqlTableInfo = {
    name: result.name,
    schema: result.schema,
    description: result.description,
    column_count: 0
  }
  await store.addTableToCanvas(table)
  setTimeout(() => fitView({ padding: 0.3 }), 150)
}

function onNodesChange(changes: NodeChange[]) {
  let positionChanged = false
  changes.forEach(change => {
    if (change.type === 'position' && 'id' in change && change.position) {
      store.updateNodePosition(change.id, change.position)
      positionChanged = true
    }
  })
  // 노드 위치가 변경되면 엣지 핸들 방향 재계산 (debounced)
  if (positionChanged) {
    store.debouncedUpdateEdges()
  }
}

function onNodeClick(event: { node: { id: string } }) {
  store.selectNode(event.node.id)
}

function onNodeDoubleClick(event: { node: { id: string } }) {
  store.selectNode(event.node.id)
}

function onPaneClick() {
  store.clearSelection()
}

// Edge double click - 관계 편집 다이얼로그 표시
function onEdgeDoubleClick(event: { edge: { id: string; label?: string; source: string; target: string; sourceHandle?: string; targetHandle?: string } }) {
  const edge = event.edge
  
  // 엣지 정보 파싱
  const sourceType = edge.source.replace('table-', '')
  const targetType = edge.target.replace('table-', '')
  
  // sourceHandle에서 컬럼명 추출 (fk-COLUMN_NAME-source 형식)
  let sourceColumn = ''
  if (edge.sourceHandle) {
    const match = edge.sourceHandle.match(/^fk-(.+)-source$/)
    if (match) {
      sourceColumn = match[1]
    }
  }
  
  // targetHandle에서 컬럼명 추출 (pk-COLUMN_NAME 형식)
  let targetColumn = ''
  if (edge.targetHandle) {
    const match = edge.targetHandle.match(/^pk-(.+?)(-right)?$/)
    if (match) {
      targetColumn = match[1]
    }
  }
  
  // 라벨에서 컬럼 정보 추출 시도 (COLUMN → COLUMN 형식)
  if ((!sourceColumn || !targetColumn) && edge.label) {
    const labelStr = typeof edge.label === 'string' ? edge.label : ''
    const labelMatch = labelStr.match(/^(.+?)\s*→\s*(.+)$/)
    if (labelMatch) {
      if (!sourceColumn) sourceColumn = labelMatch[1].trim()
      if (!targetColumn) targetColumn = labelMatch[2].trim()
    }
  }
  
  // 컬럼 정보가 없으면 에러
  if (!sourceColumn || !targetColumn) {
    console.warn('[SchemaCanvas] 컬럼 정보를 찾을 수 없습니다:', edge)
    return
  }
  
  editingRelationship.value = {
    id: edge.id,
    sourceType,
    targetType,
    sourceColumn,
    targetColumn
  }
  isEditRelationshipDialogOpen.value = true
}

// 관계 편집 완료
async function handleRelationshipUpdated() {
  isEditRelationshipDialogOpen.value = false
  const rel = editingRelationship.value
  editingRelationship.value = null
  
  if (rel) {
    // 관계 정보를 다시 로드하여 메모리에 반영
    await store.updateRelationshipInfo(
      rel.sourceType,
      rel.targetType,
      rel.sourceColumn,
      rel.targetColumn
    )
  }
  
  // 관계 정보 업데이트 후 캔버스 새로고침
  store.updateEdgesFromRelationships()
}

// 관계 삭제 완료
function handleRelationshipDeleted() {
  isEditRelationshipDialogOpen.value = false
  const rel = editingRelationship.value
  if (rel) {
    // 캔버스에서 엣지 제거
    store.edges = store.edges.filter(e => e.id !== rel.id)
  }
  editingRelationship.value = null
  // 관계 정보 업데이트
  store.updateEdgesFromRelationships()
}

// Handle edge connection - show cardinality modal
function onConnect(connection: Connection) {
  if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) {
    return
  }
  
  const fromTable = connection.source.replace('table-', '')
  const toTable = connection.target.replace('table-', '')
  
  // Parse column from handle ID
  let fromColumn = connection.sourceHandle
  if (fromColumn.startsWith('fk-')) {
    fromColumn = fromColumn.replace('fk-', '').replace('-source', '')
  } else if (fromColumn.startsWith('col-')) {
    fromColumn = fromColumn.replace('col-', '').replace('-out', '')
  }
  
  let toColumn = connection.targetHandle
  if (toColumn.startsWith('pk-')) {
    toColumn = toColumn.replace('pk-', '').replace('-right', '')
  } else if (toColumn.startsWith('col-')) {
    toColumn = toColumn.replace('col-', '').replace('-out', '')
  }
  
  // Store pending connection and show modal
  pendingConnection.value = {
    fromTable,
    fromColumn,
    toTable,
    toColumn
  }
  isCardinalityModalOpen.value = true
}

// Handle cardinality modal confirmation
async function handleCardinalityConfirm(cardinality: Cardinality, description: string, matchStrategy: MatchStrategy = 'EXACT_MATCH') {
  if (!pendingConnection.value) return
  
  const { fromTable, fromColumn, toTable, toColumn } = pendingConnection.value
  
  // Create description with cardinality and matchStrategy
  const fullDescription = description 
    ? `[${cardinality}] ${description}`
    : `[${cardinality}] ${fromTable}.${fromColumn} → ${toTable}.${toColumn}`
  
  try {
    isConnecting.value = true
    await store.addRelationshipWithCardinality({
      from_table: fromTable,
      from_schema: 'public',
      from_column: fromColumn,
      to_table: toTable,
      to_schema: 'public',
      to_column: toColumn,
      description: fullDescription,
      cardinality,
      matchStrategy  // Correlation 전략 추가
    })
    
    isCardinalityModalOpen.value = false
    pendingConnection.value = null
  } catch (error) {
    console.error('Failed to create relationship:', error)
    alert('릴레이션 생성에 실패했습니다.')
  } finally {
    isConnecting.value = false
  }
}

function handleCardinalityModalClose() {
  isCardinalityModalOpen.value = false
  pendingConnection.value = null
}

// 연결 시작 시 소스 정보 저장 (허공 드롭 감지용)
const connectingSource = ref<{ nodeId: string; handleId: string } | null>(null)

function onConnectStart(event: { nodeId: string; handleId: string | null }) {
  isConnecting.value = true
  if (event.nodeId && event.handleId) {
    connectingSource.value = { nodeId: event.nodeId, handleId: event.handleId }
  }
}

function onConnectEnd(event: MouseEvent) {
  isConnecting.value = false
  
  // 허공에 드롭되었는지 확인 (hideTablePanel이 true인 경우 = ObjectTypeModeler)
  if (props.hideTablePanel && connectingSource.value) {
    // 드롭 위치에 노드가 있는지 확인
    const dropTarget = document.elementFromPoint(event.clientX, event.clientY)
    const isDropOnNode = dropTarget?.closest('.vue-flow__node')
    const isDropOnHandle = dropTarget?.closest('.vue-flow__handle')
    
    // 노드나 핸들 위에 드롭되지 않았으면 허공 드롭
    if (!isDropOnNode && !isDropOnHandle) {
      const sourceNodeId = connectingSource.value.nodeId
      const sourceHandleId = connectingSource.value.handleId
      
      // nodeId에서 테이블명 추출 (table-{tableName} 형식)
      const sourceType = sourceNodeId.replace('table-', '')
      
      // handleId에서 컬럼명 추출 ({tableName}-{columnName}-source/target 형식)
      const handleParts = sourceHandleId.split('-')
      // 마지막 요소(source/target)를 제외하고 테이블명 이후의 부분이 컬럼명
      const sourceColumn = handleParts.slice(1, -1).join('-')
      
      console.log('[SchemaCanvas] 허공 드롭 감지:', { sourceType, sourceColumn })
      emit('empty-drop', { sourceType, sourceColumn })
    }
  }
  
  connectingSource.value = null
}

async function handleAddTopTables() {
  for (const table of store.tablesNotOnCanvas.slice(0, 10)) {
    await store.addTableToCanvas(table)
  }
  setTimeout(() => fitView({ padding: 0.3 }), 200)
}

async function handleAddAllTables() {
  // 전체 테이블 보기 모드 활성화
  store.setFullViewMode(true)
  await store.addAllTablesToCanvas()
  setTimeout(() => fitView({ padding: 0.2 }), 300)
}

function handleClearCanvas() {
  if (confirm('캔버스를 비우시겠습니까?')) {
    store.clearCanvas()
  }
}

async function handleRefresh() {
  await store.loadAllTables()
  await store.loadUserRelationships()
}
</script>

<template>
  <div class="schema-canvas" :class="{ 'hide-table-panel': props.hideTablePanel }">
    <!-- Left Panel: Table List (숨김 가능) -->
    <aside v-if="!props.hideTablePanel" class="left-panel">
      <div class="panel-header">
        <div class="panel-title">
          <IconTable :size="16" />
          <span>테이블</span>
          <span class="panel-count">{{ store.allTables.length }}</span>
        </div>
        <button class="panel-action" @click="handleRefresh" title="새로고침">
          <IconRefresh :size="14" />
        </button>
      </div>
      
      <!-- Data Source Selector -->
      <div class="data-source-selector">
        <label>
          <input 
            type="radio" 
            value="robo"
            :checked="store.dataSource === 'robo'"
            @change="() => store.setDataSource('robo')"
          />
          <span>Neo4j (분석결과)</span>
        </label>
        <label>
          <input 
            type="radio" 
            value="text2sql"
            :checked="store.dataSource === 'text2sql'"
            @change="() => store.setDataSource('text2sql')"
          />
          <span>PostgreSQL</span>
        </label>
      </div>
      
      <!-- Search -->
      <div class="search-box">
        <IconSearch :size="14" />
        <input 
          v-model="searchQuery"
          @input="handleSearch"
          type="text" 
          placeholder="테이블 검색..."
        />
        <button v-if="searchQuery" class="search-clear" @click="clearSearch">×</button>
      </div>
      
      <!-- 시멘틱 검색 결과 섹션 -->
      <div v-if="searchQuery && store.dataSource === 'robo'" class="semantic-search-section">
        <!-- 시멘틱 검색 중 표시 -->
        <div v-if="store.isSemanticSearching" class="semantic-loading">
          <span class="semantic-spinner"></span>
          <span>의미 기반 검색 중...</span>
        </div>
        
        <!-- 시멘틱 검색 결과 -->
        <template v-else-if="store.semanticSearchResults.length > 0">
          <div class="section-header semantic-header">
            <span>🔮 의미 기반 추천</span>
            <span class="section-count">{{ store.semanticSearchResults.length }}</span>
          </div>
          <div class="semantic-results">
            <div 
              v-for="result in store.semanticSearchResults" 
              :key="`semantic-${result.name}`"
              class="semantic-result-item"
              draggable="true"
              @dragstart="(e) => startDragSemanticResult(e, result)"
              @dblclick="addSemanticResultToCanvas(result)"
            >
              <div class="semantic-result-header">
                <IconTable :size="14" class="table-icon" />
                <span class="semantic-result-name">{{ result.name }}</span>
                <span class="similarity-badge">{{ Math.round(result.similarity * 100) }}%</span>
              </div>
              <div v-if="result.description" class="semantic-result-desc">
                {{ result.description.substring(0, 80) }}...
              </div>
            </div>
          </div>
        </template>
        
        <!-- 시멘틱 검색 에러 -->
        <div v-else-if="store.semanticSearchError" class="semantic-error">
          ⚠️ {{ store.semanticSearchError }}
        </div>
      </div>
      
      <!-- Tables on Canvas -->
      <div v-if="store.tablesOnCanvas.length > 0" class="table-section">
        <div class="section-header">
          <span>캔버스에 있는 테이블</span>
          <span class="section-count">{{ store.tablesOnCanvas.length }}</span>
        </div>
        <div class="table-list">
          <div 
            v-for="tableName in store.tablesOnCanvas" 
            :key="tableName"
            class="table-item table-item--on-canvas"
            @click="store.selectNode(`table-${tableName}`)"
          >
            <IconTable :size="14" class="table-item__icon" />
            <span class="table-item__name">{{ tableName }}</span>
            <button 
              class="table-item__remove"
              @click.stop="store.removeTableFromCanvas(tableName)"
              title="캔버스에서 제거"
            >×</button>
          </div>
        </div>
      </div>
      
      <!-- 텍스트 검색 결과 (searchQuery가 있을 때만 표시) -->
      <div v-if="searchQuery && store.filteredTables.length > 0" class="table-section text-search-results">
        <div class="section-header search-results-header">
          <span>🔍 검색 결과</span>
          <span class="section-count">{{ store.tablesNotOnCanvas.length }}</span>
        </div>
        <div class="table-list">
          <div 
            v-for="table in store.tablesNotOnCanvas" 
            :key="`search-${table.name}`"
            class="table-item table-item--search-result"
            draggable="true"
            @dragstart="(e) => startDragTable(e, table)"
            @dblclick="handleTableDoubleClick(table)"
          >
            <IconTable :size="14" class="table-item__icon" />
            <div class="table-item__info">
              <span class="table-item__name">{{ table.name }}</span>
              <span class="table-item__schema">{{ table.schema }}</span>
            </div>
            <div v-if="table.description" class="table-item__desc" :title="table.description">
              {{ table.description.slice(0, 50) }}{{ table.description.length > 50 ? '...' : '' }}
            </div>
          </div>
        </div>
      </div>
      
      <!-- Available Tables (Schema Tree) - 검색어가 없을 때만 표시 -->
      <div v-else class="table-section table-section--scrollable">
        <div class="section-header">
          <span>사용 가능한 테이블</span>
          <span class="section-count">{{ store.tablesNotOnCanvas.length }}</span>
        </div>
        <div class="schema-tree">
          <!-- 3레벨: 데이터소스 > 스키마 > 테이블 -->
          <div 
            v-for="ds in store.datasources" 
            :key="ds"
            class="datasource-folder"
          >
            <!-- 데이터소스 헤더 (1레벨) -->
            <div 
              class="datasource-header"
              :class="{ 'datasource-header--expanded': expandedDatasources[ds] }"
              @click="toggleDatasource(ds)"
            >
              <IconChevronRight 
                :size="12" 
                class="datasource-chevron"
                :class="{ 'datasource-chevron--expanded': expandedDatasources[ds] }"
              />
              <IconDatabase :size="14" class="datasource-icon" />
              <span class="datasource-name">{{ ds }}</span>
              <span class="datasource-count">{{ getTableCountInDatasource(ds) }}</span>
            </div>
            
            <!-- 데이터소스 내 스키마들 (2레벨) -->
            <div v-if="expandedDatasources[ds]" class="datasource-schemas">
              <div 
                v-for="schema in getSchemasInDatasource(ds)" 
                :key="`${ds}-${schema}`"
                class="schema-folder"
              >
                <!-- 스키마 헤더 (클릭 시 토글) -->
                <div 
                  class="schema-header"
                  :class="{ 'schema-header--expanded': expandedSchemas[schema] }"
                  @click="toggleSchema(schema)"
                >
                  <IconChevronRight 
                    :size="12" 
                    class="schema-chevron"
                    :class="{ 'schema-chevron--expanded': expandedSchemas[schema] }"
                  />
                  <IconFolder :size="14" class="schema-icon" />
                  <span class="schema-name">{{ schema }}</span>
                  <span class="schema-count">{{ store.tablesByDatasource[ds]?.[schema]?.length || 0 }}</span>
                </div>
                
                <!-- 스키마 내 테이블 목록 (3레벨) -->
                <div v-if="expandedSchemas[schema]" class="schema-tables">
                  <div 
                    v-for="table in store.tablesByDatasource[ds]?.[schema] || []" 
                    :key="table.name"
                    class="table-item"
                    draggable="true"
                    @dragstart="(e) => startDragTable(e, table)"
                    @dblclick="handleTableDoubleClick(table)"
                  >
                    <IconTable :size="14" class="table-item__icon" />
                    <div class="table-item__info">
                      <span class="table-item__name">{{ table.name }}</span>
                      <span class="table-item__cols">{{ table.column_count }} cols</span>
                      <span v-if="table.description" class="table-item__desc" :title="table.description">
                        {{ table.description.slice(0, 30) }}{{ table.description.length > 30 ? '...' : '' }}
                      </span>
                    </div>
                    <div class="table-item__drag-hint">⋮⋮</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Quick Actions -->
      <div class="panel-footer">
        <button 
          v-if="store.tablesNotOnCanvas.length > 0"
          class="btn btn--secondary btn--sm btn--block"
          @click="handleAddTopTables"
        >
          상위 10개 테이블 추가
        </button>
        <button 
          v-if="store.allTables.length > 0"
          class="btn btn--primary btn--sm btn--block"
          :disabled="store.loading"
          @click="handleAddAllTables"
          style="margin-top: 8px;"
        >
          {{ store.loading ? '로딩 중...' : '📊 전체 테이블 보기' }}
        </button>
      </div>
    </aside>
    
    <!-- Main Canvas -->
    <main 
      class="canvas-area"
      :class="{ 'drop-zone-active': isDragOver }"
      @drop="handleDrop"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
    >
      <!-- Empty State -->
      <div v-if="store.nodes.length === 0" class="canvas-empty">
        <div class="canvas-empty__icon">
          <IconTable :size="64" />
        </div>
        <div class="canvas-empty__text">캔버스가 비어 있습니다</div>
        <div class="canvas-empty__hint">
          왼쪽에서 테이블을 드래그하거나 더블클릭하여 추가하세요
        </div>
      </div>
      
      <!-- VueFlow Canvas -->
      <VueFlow
        v-else
        :nodes="nodesWithSelection"
        :edges="edgesWithAnimation"
        :node-types="nodeTypes"
        :default-viewport="{ zoom: 0.8, x: 50, y: 50 }"
        :min-zoom="0.2"
        :max-zoom="2"
        :snap-to-grid="true"
        :snap-grid="[15, 15]"
        :nodes-draggable="true"
        :nodes-connectable="true"
        :pan-on-drag="true"
        :zoom-on-scroll="true"
        :prevent-scrolling="true"
        :connect-on-click="false"
        :default-edge-options="{ type: 'smoothstep', animated: true }"
        fit-view-on-init
        @nodes-change="onNodesChange"
        @node-click="onNodeClick"
        @node-double-click="onNodeDoubleClick"
        @pane-click="onPaneClick"
        @edge-double-click="onEdgeDoubleClick"
        @connect="onConnect"
        @connect-start="onConnectStart"
        @connect-end="onConnectEnd"
      >
        <!-- Custom ERD Markers -->
        <template #connection-line="{ sourceX, sourceY, targetX, targetY }">
          <path
            :d="`M${sourceX},${sourceY} C ${sourceX + 50},${sourceY} ${targetX - 50},${targetY} ${targetX},${targetY}`"
            fill="none"
            stroke="#40c057"
            stroke-width="2"
            stroke-dasharray="5,5"
          />
        </template>
        
        <!-- SVG Defs for ERD Markers -->
        <svg style="position: absolute; width: 0; height: 0;">
          <defs>
            <!-- Crow's Foot (Many) Marker -->
            <marker
              id="crowfoot-many"
              viewBox="0 0 20 20"
              refX="18"
              refY="10"
              markerWidth="12"
              markerHeight="12"
              orient="auto-start-reverse"
            >
              <path d="M 0,10 L 18,0 M 0,10 L 18,10 M 0,10 L 18,20" 
                    fill="none" stroke="#228be6" stroke-width="2" stroke-linecap="round"/>
            </marker>
            
            <!-- One Marker -->
            <marker
              id="erd-one"
              viewBox="0 0 20 20"
              refX="18"
              refY="10"
              markerWidth="10"
              markerHeight="10"
              orient="auto-start-reverse"
            >
              <line x1="16" y1="2" x2="16" y2="18" stroke="#228be6" stroke-width="2" stroke-linecap="round"/>
            </marker>
            
            <!-- One Marker (Green for 1:1) -->
            <marker
              id="erd-one-green"
              viewBox="0 0 20 20"
              refX="18"
              refY="10"
              markerWidth="10"
              markerHeight="10"
              orient="auto-start-reverse"
            >
              <line x1="16" y1="2" x2="16" y2="18" stroke="#40c057" stroke-width="2" stroke-linecap="round"/>
            </marker>
            
            <!-- Crow's Foot (Many) Marker - Purple for N:N -->
            <marker
              id="crowfoot-many-purple"
              viewBox="0 0 20 20"
              refX="18"
              refY="10"
              markerWidth="12"
              markerHeight="12"
              orient="auto-start-reverse"
            >
              <path d="M 0,10 L 18,0 M 0,10 L 18,10 M 0,10 L 18,20" 
                    fill="none" stroke="#be4bdb" stroke-width="2" stroke-linecap="round"/>
            </marker>
            
            <!-- Gray markers for auto-detected FK -->
            <marker
              id="crowfoot-many-gray"
              viewBox="0 0 20 20"
              refX="18"
              refY="10"
              markerWidth="12"
              markerHeight="12"
              orient="auto-start-reverse"
            >
              <path d="M 0,10 L 18,0 M 0,10 L 18,10 M 0,10 L 18,20" 
                    fill="none" stroke="#868e96" stroke-width="2" stroke-linecap="round"/>
            </marker>
            
            <marker
              id="erd-one-gray"
              viewBox="0 0 20 20"
              refX="18"
              refY="10"
              markerWidth="10"
              markerHeight="10"
              orient="auto-start-reverse"
            >
              <line x1="16" y1="2" x2="16" y2="18" stroke="#868e96" stroke-width="2" stroke-linecap="round"/>
            </marker>
          </defs>
        </svg>
        
        <Background pattern-color="#2a2a3a" :gap="20" />
        <Controls position="bottom-left" />
        <MiniMap 
          :node-color="getNodeColor"
          :node-stroke-width="3"
          pannable
          zoomable
        />
      </VueFlow>
      
      <!-- Connection Mode Indicator -->
      <div v-if="isConnecting" class="connection-indicator">
        🔗 릴레이션 연결 중...
      </div>
      
      <!-- Canvas Toolbar -->
      <div v-if="store.nodes.length > 0" class="canvas-toolbar">
        <button class="canvas-toolbar__btn" @click="zoomIn()" title="Zoom In">
          <IconZoomIn :size="18" />
        </button>
        <button class="canvas-toolbar__btn" @click="zoomOut()" title="Zoom Out">
          <IconZoomOut :size="18" />
        </button>
        <button class="canvas-toolbar__btn" @click="fitView({ padding: 0.3 })" title="Fit View">
          <IconMaximize :size="18" />
        </button>
        <div class="canvas-toolbar__divider"></div>
        <button class="canvas-toolbar__btn" @click="store.updateEdgesFromRelationships()" title="릴레이션 새로고침">
          <IconLink :size="18" />
        </button>
        <button class="canvas-toolbar__btn canvas-toolbar__btn--danger" @click="handleClearCanvas" title="캔버스 비우기">
          <IconTrash :size="18" />
        </button>
      </div>
      
      <!-- Legend (숨김 가능) -->
      <div v-if="!props.hideLegend" class="canvas-legend">
        <div class="legend-title">메타데이터 출처</div>
        
        <!-- DDL 기반 FK (실선, 초록색) -->
        <label class="legend-item legend-item--checkbox">
          <input 
            type="checkbox" 
            :checked="store.fkVisibility.ddl" 
            @change="store.toggleFkVisibility('ddl')"
            class="legend-checkbox"
          />
          <span class="legend-line legend-line--ddl"></span>
          <span class="legend-label">DDL 정의</span>
        </label>
        
        <!-- 프로시저 분석 FK (점선, 하늘색) -->
        <label class="legend-item legend-item--checkbox">
          <input 
            type="checkbox" 
            :checked="store.fkVisibility.procedure" 
            @change="store.toggleFkVisibility('procedure')"
            class="legend-checkbox"
          />
          <span class="legend-line legend-line--procedure"></span>
          <span class="legend-label">코드 (프로시저) 분석</span>
        </label>
        
        <!-- 사용자 추가 FK (실선, 주황색) -->
        <label class="legend-item legend-item--checkbox">
          <input 
            type="checkbox" 
            :checked="store.fkVisibility.user" 
            @change="store.toggleFkVisibility('user')"
            class="legend-checkbox"
          />
          <span class="legend-line legend-line--user"></span>
          <span class="legend-label">사용자 입력</span>
        </label>
        
        <div class="legend-divider"></div>
        <div class="legend-tip">
          💡 컬럼 핸들을 드래그하여 릴레이션 연결
        </div>
        <div class="legend-tip">
          🖱️ 테이블 더블클릭으로 상세 편집
        </div>
      </div>
    </main>
    
    <!-- Right Panel: Table Details -->
    <TableDetailPanel @open-behavior-dialog="(data) => emit('open-behavior-dialog', data)" />
    
    <!-- Right Panel: Source Code Viewer -->
    <Transition name="slide-right">
      <aside v-if="store.sourceCodePanel.isOpen" class="source-code-panel">
        <div class="source-panel-header">
          <div class="source-panel-title">
            <span class="source-panel-icon">📄</span>
            <span class="source-panel-filename">{{ store.sourceCodePanel.fileName }}</span>
          </div>
          <button class="source-panel-close" @click="store.closeSourceCodePanel()">✕</button>
        </div>
        <div class="source-panel-info">
          <span class="source-panel-procedure">{{ store.sourceCodePanel.procedureName }}</span>
          <span class="source-panel-line">Line {{ store.sourceCodePanel.highlightedLine }}</span>
        </div>
        <div class="source-panel-content" ref="sourceCodeContentRef">
          <div v-if="store.sourceCodePanel.isLoadingStatements" class="source-loading">
            AI 설명 로딩 중...
          </div>
          <template v-for="(line, index) in store.sourceCodePanel.fileContent.split('\n')" :key="index">
            <!-- Statement 시작 라인에 AI 설명 표시 -->
            <div 
              v-if="getStatementForLine(index + 1)" 
              class="source-ai-comment"
            >
              <span class="ai-comment-icon">🤖</span>
              <span class="ai-comment-type">{{ getStatementForLine(index + 1)?.statement_type }}</span>
              <span class="ai-comment-text">{{ getStatementForLine(index + 1)?.summary || getStatementForLine(index + 1)?.ai_description || '' }}</span>
            </div>
            <!-- 코드 라인 -->
            <div 
              class="source-line"
              :class="{ 
                'highlighted': store.sourceCodePanel.highlightedLine === index + 1,
                'has-statement': !!getStatementForLine(index + 1)
              }"
              :data-line="index + 1"
            >
              <span class="source-line-number">{{ index + 1 }}</span>
              <span class="source-line-content">{{ line || ' ' }}</span>
            </div>
          </template>
        </div>
      </aside>
    </Transition>
    
    <!-- Cardinality Modal -->
    <CardinalityModal
      :is-open="isCardinalityModalOpen"
      :connection="pendingConnection"
      @close="handleCardinalityModalClose"
      @confirm="handleCardinalityConfirm"
    />
    
    <!-- 관계 편집 다이얼로그 -->
    <EditRelationshipDialog
      v-if="editingRelationship"
      :visible="isEditRelationshipDialogOpen"
      mode="edit"
      :source-type="editingRelationship.sourceType"
      :target-type="editingRelationship.targetType"
      :source-column="editingRelationship.sourceColumn"
      :target-column="editingRelationship.targetColumn"
      @close="isEditRelationshipDialogOpen = false; editingRelationship = null"
      @updated="handleRelationshipUpdated"
      @deleted="handleRelationshipDeleted"
    />
    
    <!-- 하단 테이블 데이터 조회 패널 -->
    <Transition name="slide-up">
      <div v-if="store.tableDataPanel.isOpen" class="table-data-panel">
        <div class="table-data-panel__header">
          <div class="table-data-panel__title">
            <IconTable :size="16" />
            <span>{{ store.tableDataPanel.schema }}.{{ store.tableDataPanel.tableName }}</span>
            <span class="row-count-badge">{{ store.tableDataPanel.rowCount }}행</span>
            <span v-if="store.tableDataPanel.executionTimeMs > 0" class="exec-time">
              {{ store.tableDataPanel.executionTimeMs }}ms
            </span>
          </div>
          <div class="table-data-panel__actions">
            <!-- SQL 토글 버튼 -->
            <button 
              v-if="store.tableDataPanel.executedSql"
              class="sql-toggle-btn" 
              :class="{ active: showSqlQuery }"
              @click="showSqlQuery = !showSqlQuery" 
              :title="showSqlQuery ? 'SQL 숨기기' : 'SQL 보기'"
            >
              {{ showSqlQuery ? '▼' : '▶' }} SQL
            </button>
            <label class="limit-selector">
              <span>Limit:</span>
              <select 
                :value="store.tableDataPanel.limit" 
                @change="(e) => store.changeTableDataLimit(Number((e.target as HTMLSelectElement).value))"
              >
                <option :value="10">10</option>
                <option :value="25">25</option>
                <option :value="50">50</option>
                <option :value="100">100</option>
              </select>
            </label>
            <button class="refresh-btn" @click="store.queryTableData(store.tableDataPanel.tableName, store.tableDataPanel.schema, store.tableDataPanel.limit)" title="새로고침">
              <IconRefresh :size="14" />
            </button>
            <button class="close-btn" @click="store.closeTableDataPanel" title="닫기">×</button>
          </div>
        </div>
        
        <!-- 실행된 SQL 표시 (펼쳤을 때만) -->
        <div v-if="showSqlQuery && store.tableDataPanel.executedSql" class="table-data-panel__sql">
          <code class="sql-code">{{ store.tableDataPanel.executedSql }}</code>
          <button 
            class="sql-copy-btn" 
            @click="copyToClipboard(store.tableDataPanel.executedSql || '')"
            title="SQL 복사"
          >
            📋
          </button>
        </div>
        
        <div class="table-data-panel__content">
          <!-- 로딩 상태 -->
          <div v-if="store.tableDataPanel.isLoading" class="loading-state">
            <span class="spinner"></span>
            <span>데이터 조회 중...</span>
          </div>
          
          <!-- 에러 상태 -->
          <div v-else-if="store.tableDataPanel.error" class="error-state">
            <span class="error-icon">⚠️</span>
            <span>{{ store.tableDataPanel.error }}</span>
          </div>
          
          <!-- 데이터 테이블 -->
          <div v-else-if="store.tableDataPanel.columns.length > 0" class="data-table-wrapper">
            <!-- Behavior 모드 헤더 -->
            <div v-if="store.tableDataPanel.behaviorMode" class="behavior-mode-header">
              <span class="behavior-badge">
                🎯 {{ store.tableDataPanel.activeBehavior?.name }} 실행 모드
              </span>
              <div class="behavior-actions">
                <span class="row-count">{{ store.tableDataPanel.rows.length }}건 조회됨</span>
                <button class="cancel-mode-btn" @click="cancelBehaviorMode">
                  모드 종료
                </button>
              </div>
            </div>
            
            <table class="data-table" :class="{ 'behavior-mode': store.tableDataPanel.behaviorMode }">
              <thead>
                <tr>
                  <th v-for="col in store.tableDataPanel.columns" :key="col">{{ col }}</th>
                  <!-- Behavior 모드: 실행 버튼 헤더 -->
                  <th v-if="store.tableDataPanel.behaviorMode" class="action-col">실행</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, idx) in store.tableDataPanel.rows" :key="idx">
                  <td v-for="(cell, cidx) in row" :key="cidx">{{ formatCell(cell) }}</td>
                  <!-- Behavior 모드: 실행 버튼 -->
                  <td v-if="store.tableDataPanel.behaviorMode" class="action-col">
                    <button 
                      class="row-execute-btn"
                      :disabled="store.tableDataPanel.isExecutingBehavior"
                      @click="executeBehaviorForRow(idx)"
                      :title="`이 행으로 ${store.tableDataPanel.activeBehavior?.name} 실행`"
                    >
                      <span v-if="executingRowIndex === idx">⏳</span>
                      <span v-else>▶</span>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          
          <!-- 데이터 없음 -->
          <div v-else class="empty-state">
            <span>조회된 데이터가 없습니다.</span>
          </div>
        </div>
      </div>
    </Transition>
    
    <!-- Behavior 실행 결과 팝업 (인터랙티브 + React Agent) -->
    <Transition name="fade">
      <div v-if="showBehaviorResultPopup" class="behavior-result-overlay" @click.self="closeBehaviorResultPopup">
        <div class="behavior-result-popup behavior-result-popup--large">
          <div class="popup-header">
            <h3>
              <span v-if="behaviorResultData?.success">✅</span>
              <span v-else>❌</span>
              {{ store.tableDataPanel.activeBehavior?.name }} 실행 결과
              <span v-if="behaviorResultData?.autoFixed" class="auto-fixed-badge">🤖 AI 자동 수정됨</span>
            </h3>
            <button class="close-btn" @click="closeBehaviorResultPopup">✕</button>
          </div>
          
          <!-- React Agent 시도 타임라인 -->
          <div v-if="behaviorResultData?.attempts && behaviorResultData.attempts.length > 1" class="attempts-timeline">
            <div class="timeline-header">
              <span class="timeline-title">🔄 React Agent 실행 과정</span>
              <span class="timeline-summary">{{ behaviorResultData.attempts.length }}회 시도</span>
            </div>
            <div class="timeline-steps">
              <div 
                v-for="(attempt, idx) in behaviorResultData.attempts" 
                :key="idx"
                class="timeline-step"
                :class="{
                  'timeline-step--success': attempt.status === 'success',
                  'timeline-step--error': attempt.status === 'error',
                  'timeline-step--active': selectedAttemptIndex === idx
                }"
                @click="selectedAttemptIndex = idx"
              >
                <div class="step-number">{{ attempt.attempt }}</div>
                <div class="step-info">
                  <div class="step-status">
                    <span v-if="attempt.status === 'success'">✅ 성공</span>
                    <span v-else-if="attempt.status === 'error'">❌ 실패</span>
                    <span v-else>⏳ 대기</span>
                  </div>
                  <div v-if="attempt.error" class="step-error">{{ attempt.error.errorType }}: {{ attempt.error.error }}</div>
                </div>
                <div v-if="idx < behaviorResultData.attempts.length - 1" class="step-arrow">
                  <span v-if="attempt.status === 'error'">🤖→</span>
                </div>
              </div>
            </div>
          </div>
          
          <div class="popup-content popup-content--split">
            <!-- 좌측: 소스 코드 -->
            <div class="code-section">
              <div class="section-header">
                <span class="section-title">📝 소스 코드</span>
                <div class="code-tabs" v-if="behaviorResultData?.originalCode && behaviorResultData?.autoFixed">
                  <button 
                    class="code-tab"
                    :class="{ 'code-tab--active': !showOriginalCode }"
                    @click="showOriginalCode = false"
                  >수정된 코드</button>
                  <button 
                    class="code-tab"
                    :class="{ 'code-tab--active': showOriginalCode }"
                    @click="showOriginalCode = true"
                  >원본 코드</button>
                </div>
                <span v-if="behaviorResultData?.errorLine && !showOriginalCode" class="error-line-badge">
                  에러: {{ behaviorResultData.errorLine }}번 라인
                </span>
              </div>
              <div class="code-viewer">
                <div 
                  v-for="(line, idx) in (displayedCode || '').split('\n')" 
                  :key="idx"
                  class="code-line"
                  :class="{ 'code-line--error': !showOriginalCode && behaviorResultData?.errorLine === idx + 1 }"
                >
                  <span class="line-number">{{ idx + 1 }}</span>
                  <span class="line-content">{{ line }}</span>
                </div>
              </div>
            </div>
            
            <!-- 우측: 결과/에러 정보 -->
            <div class="result-section">
              <!-- 입력 데이터 -->
              <div class="result-block">
                <div class="section-header">
                  <span class="section-title">📥 입력 데이터</span>
                </div>
                <pre class="result-pre result-pre--input">{{ JSON.stringify(behaviorResultData?.inputData, null, 2) }}</pre>
              </div>
              
              <!-- 에러인 경우 -->
              <div v-if="behaviorResultData && !behaviorResultData.success" class="result-block result-block--error">
                <div class="section-header">
                  <span class="section-title">⚠️ 에러 정보</span>
                </div>
                <div class="error-info">
                  <div class="error-type">{{ behaviorResultData.errorType }}: {{ behaviorResultData.error }}</div>
                  <div v-if="behaviorResultData.errorLineContent" class="error-line-content">
                    <span class="label">에러 라인:</span>
                    <code>{{ behaviorResultData.errorLineContent }}</code>
                  </div>
                  <details class="traceback-details">
                    <summary>전체 Traceback 보기</summary>
                    <pre class="traceback-pre">{{ behaviorResultData.traceback }}</pre>
                  </details>
                </div>
              </div>
              
              <!-- 성공인 경우 -->
              <div v-else-if="behaviorResultData?.success" class="result-block result-block--success">
                <div class="section-header">
                  <span class="section-title">📤 실행 결과</span>
                </div>
                <pre class="result-pre result-pre--output">{{ JSON.stringify(behaviorResultData.result, null, 2) }}</pre>
              </div>
              
              <!-- 프론트엔드 에러 (API 호출 실패 등) -->
              <div v-else-if="behaviorResultError" class="result-block result-block--error">
                <div class="section-header">
                  <span class="section-title">⚠️ 에러</span>
                </div>
                <div class="error-info">
                  <div class="error-type">{{ behaviorResultError }}</div>
                </div>
              </div>
            </div>
          </div>
          <div class="popup-footer">
            <span v-if="behaviorResultData?.message" class="footer-message">{{ behaviorResultData.message }}</span>
            <button class="close-popup-btn" @click="closeBehaviorResultPopup">닫기</button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style>
/* VueFlow imports */
@import '@vue-flow/core/dist/style.css';
@import '@vue-flow/core/dist/theme-default.css';
@import '@vue-flow/controls/dist/style.css';
@import '@vue-flow/minimap/dist/style.css';

/* VueFlow overrides */
.vue-flow {
  background: var(--color-bg, #1a1b26) !important;
}

.vue-flow__minimap {
  background: var(--color-bg-secondary, #25262b) !important;
  border: 1px solid var(--color-border, #373a40) !important;
  border-radius: var(--radius-lg, 8px) !important;
}

.vue-flow__controls {
  background: var(--color-bg-secondary, #25262b) !important;
  border: 1px solid var(--color-border, #373a40) !important;
  border-radius: var(--radius-lg, 8px) !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4) !important;
}

.vue-flow__controls-button {
  background: transparent !important;
  border: none !important;
  color: var(--color-text, #c1c2c5) !important;
}

.vue-flow__controls-button:hover {
  background: var(--color-bg-tertiary, #373a40) !important;
}

.vue-flow__controls-button svg {
  fill: var(--color-text, #c1c2c5) !important;
}

.vue-flow__edge-textbg {
  fill: var(--color-bg, #1a1b26) !important;
}

.vue-flow__edge-text {
  fill: var(--color-text, #c1c2c5) !important;
}

.vue-flow__node.table-node--selected {
  z-index: 10 !important;
}

.vue-flow__edge-path {
  stroke-width: 2 !important;
}

.vue-flow__edge.animated path {
  stroke-dasharray: 5 !important;
  animation: flowEdge 0.5s linear infinite !important;
}

@keyframes flowEdge {
  to {
    stroke-dashoffset: -10;
  }
}

.vue-flow__connection-line {
  stroke: var(--color-accent, #228be6) !important;
  stroke-width: 2 !important;
  stroke-dasharray: 5 !important;
}

.vue-flow__handle:hover {
  background: var(--color-accent, #228be6) !important;
  transform: scale(1.5) !important;
}

/* 새로 추가된 엣지 애니메이션 */
.vue-flow__edge.edge-newly-added path {
  stroke: #51cf66 !important;
  stroke-width: 3 !important;
  animation: edge-draw 1s ease-out forwards, edge-pulse 0.8s ease-in-out 3;
  filter: drop-shadow(0 0 6px rgba(81, 207, 102, 0.6));
}

.vue-flow__edge.edge-newly-added .vue-flow__edge-text {
  animation: label-appear 0.5s ease-out 0.5s forwards;
  opacity: 0;
}

@keyframes edge-draw {
  0% {
    stroke-dasharray: 1000;
    stroke-dashoffset: 1000;
  }
  100% {
    stroke-dasharray: 1000;
    stroke-dashoffset: 0;
  }
}

@keyframes edge-pulse {
  0%, 100% {
    stroke-width: 3px;
    filter: drop-shadow(0 0 6px rgba(81, 207, 102, 0.6));
  }
  50% {
    stroke-width: 5px;
    filter: drop-shadow(0 0 12px rgba(81, 207, 102, 0.9));
  }
}

@keyframes label-appear {
  0% {
    opacity: 0;
    transform: scale(0.8);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}
</style>

<style scoped lang="scss">
.schema-canvas {
  display: flex;
  height: 100%;
  width: 100%;
  background: var(--color-bg);
  overflow: hidden;
}

/* 왼쪽 패널 숨김 모드 */
.schema-canvas.hide-table-panel {
  .canvas-area {
    width: 100%;
    flex: 1;
  }
  
  .table-data-panel {
    left: 0;
  }
}

/* Left Panel */
.left-panel {
  width: 280px;
  min-width: 260px;
  background: var(--color-bg-secondary);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-text-bright);
  
  svg {
    color: var(--color-accent);
  }
}

.panel-count {
  font-size: 0.7rem;
  padding: 2px 8px;
  background: var(--color-bg);
  border-radius: 10px;
  color: var(--color-text-light);
}

.panel-action {
  background: none;
  border: none;
  color: var(--color-text-light);
  cursor: pointer;
  padding: 6px;
  border-radius: var(--radius-sm);
  transition: all 0.15s;
  
  &:hover {
    background: var(--color-bg);
    color: var(--color-text-bright);
  }
}

/* Search */
.data-source-selector {
  display: flex;
  gap: 12px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-tertiary);
  
  label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--color-text-secondary);
    cursor: pointer;
    
    input[type="radio"] {
      margin: 0;
      accent-color: var(--color-primary);
    }
    
    &:hover {
      color: var(--color-text);
    }
  }
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-tertiary);
  
  svg {
    color: var(--color-text-muted);
    flex-shrink: 0;
  }
  
  input {
    flex: 1;
    background: none;
    border: none;
    color: var(--color-text);
    font-size: 0.85rem;
    outline: none;
    
    &::placeholder {
      color: var(--color-text-muted);
    }
  }
}

.search-clear {
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 2px 6px;
  font-size: 1rem;
  
  &:hover {
    color: var(--color-text-bright);
  }
}

/* 시멘틱 검색 섹션 */
.semantic-search-section {
  border-bottom: 1px solid var(--color-border);
  background: linear-gradient(135deg, rgba(124, 58, 237, 0.1) 0%, rgba(34, 139, 230, 0.1) 100%);
}

.semantic-loading {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  font-size: 0.8rem;
  color: var(--color-text-light);
  
  .semantic-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid var(--color-border);
    border-top-color: var(--color-accent);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.semantic-header {
  background: rgba(124, 58, 237, 0.15);
  color: #a78bfa;
}

.semantic-results {
  max-height: 200px;
  overflow-y: auto;
}

.semantic-result-item {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(124, 58, 237, 0.15);
  cursor: grab;
  transition: background 0.15s;
  
  &:hover {
    background: rgba(124, 58, 237, 0.2);
  }
  
  &:last-child {
    border-bottom: none;
  }
}

.semantic-result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  
  .table-icon {
    color: #a78bfa;
  }
}

.semantic-result-name {
  flex: 1;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-text-bright);
}

.similarity-badge {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 10px;
  background: linear-gradient(135deg, #7c3aed, #3b82f6);
  color: white;
}

.semantic-result-desc {
  margin-top: 4px;
  font-size: 0.75rem;
  color: var(--color-text-light);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.semantic-error {
  padding: 10px 16px;
  font-size: 0.8rem;
  color: var(--color-warning);
}

/* Table Section */
.table-section {
  padding: 8px;
  
  &--scrollable {
    flex: 1;
    overflow-y: auto;
  }
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}

.section-count {
  font-size: 0.65rem;
  padding: 1px 6px;
  background: var(--color-bg);
  border-radius: 8px;
  color: var(--color-text-light);
}

/* Table List */
.table-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.table-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--color-bg-tertiary);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  cursor: grab;
  transition: all 0.15s;
  
  &:hover {
    background: var(--color-bg);
    border-color: var(--color-accent-light);
  }
  
  &:active {
    cursor: grabbing;
  }
  
  &--on-canvas {
    background: rgba(34, 139, 230, 0.15);
    border-color: rgba(34, 139, 230, 0.3);
    cursor: pointer;
    
    &:hover {
      background: rgba(34, 139, 230, 0.25);
    }
  }
}

.table-item__icon {
  color: var(--color-accent);
}

.table-item__info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.table-item__name {
  font-size: 0.85rem;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.table-item__cols {
  font-size: 0.7rem;
  color: var(--color-text-muted);
}

.table-item__desc {
  font-size: 0.65rem;
  color: var(--color-text-light);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-style: italic;
}

.table-item__schema {
  font-size: 0.65rem;
  color: var(--color-text-muted);
  margin-left: 6px;
  opacity: 0.7;
}

/* 텍스트 검색 결과 스타일 */
.text-search-results {
  max-height: 300px;
  overflow-y: auto;
  border-bottom: 1px solid var(--color-border);
}

.search-results-header {
  background: linear-gradient(135deg, var(--color-accent), var(--color-accent-hover));
  color: white;
  
  span:first-child {
    font-weight: 600;
  }
}

.table-item--search-result {
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 10px 12px;
  background: var(--color-bg-tertiary);
  border-left: 3px solid var(--color-accent);
  
  &:hover {
    background: var(--color-bg-hover);
    border-left-color: var(--color-success);
  }
  
  .table-item__info {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
  }
  
  .table-item__desc {
    width: 100%;
    font-size: 0.7rem;
    opacity: 0.8;
  }
}

.table-item__drag-hint {
  color: var(--color-text-muted);
  opacity: 0;
  transition: opacity 0.15s;
  font-size: 0.8rem;
}

.table-item:hover .table-item__drag-hint {
  opacity: 1;
}

// ============================================================================
// 스키마 트리 스타일 (3레벨: 데이터소스 > 스키마 > 테이블)
// ============================================================================

.schema-tree {
  display: flex;
  flex-direction: column;
}

// 데이터소스 (1레벨)
.datasource-folder {
  display: flex;
  flex-direction: column;
}

.datasource-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.15s;
  user-select: none;
  background: rgba(56, 189, 248, 0.05);
  
  &:hover {
    background: rgba(56, 189, 248, 0.12);
  }
  
  &--expanded {
    .datasource-icon {
      color: #38bdf8;
    }
  }
}

.datasource-chevron {
  color: var(--color-text-muted);
  transition: transform 0.2s;
  flex-shrink: 0;

  &--expanded {
    transform: rotate(90deg);
  }
}

.datasource-icon {
  color: #38bdf8;
  flex-shrink: 0;
}

.datasource-name {
  flex: 1;
  font-size: 0.85rem;
  font-weight: 600;
  color: #38bdf8;
}

.datasource-count {
  font-size: 0.7rem;
  padding: 2px 6px;
  background: rgba(56, 189, 248, 0.15);
  border-radius: 8px;
  color: #38bdf8;
  min-width: 20px;
  text-align: center;
}

.datasource-schemas {
  padding-left: 12px;
  border-left: 1px solid rgba(56, 189, 248, 0.15);
  margin-left: 8px;
}

// 스키마 (2레벨)
.schema-folder {
  display: flex;
  flex-direction: column;
}

.schema-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.15s;
  user-select: none;
  
  &:hover {
    background: var(--color-bg-elevated);
  }
  
  &--expanded {
    .schema-icon {
      color: var(--color-accent);
    }
  }
}

.schema-chevron {
  color: var(--color-text-muted);
  transition: transform 0.2s;
  flex-shrink: 0;
  
  &--expanded {
    transform: rotate(90deg);
  }
}

.schema-icon {
  color: var(--color-text-light);
  flex-shrink: 0;
}

.schema-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-text);
  flex: 1;
}

.schema-count {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  background: var(--color-bg-tertiary);
  padding: 2px 6px;
  border-radius: 10px;
}

.schema-tables {
  display: flex;
  flex-direction: column;
  padding-left: 12px;
  margin-left: 8px;
  border-left: 1px solid var(--color-border);
  
  .table-item {
    margin-left: 0;
    padding-left: 8px;
  }
}

.table-item__remove {
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  opacity: 0;
  transition: all 0.15s;
  font-size: 1rem;
  
  .table-item:hover & {
    opacity: 1;
  }
  
  &:hover {
    background: var(--color-error);
    color: white;
  }
}

/* Panel Footer */
.panel-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--color-border);
}

/* Canvas Area */
.canvas-area {
  flex: 1;
  position: relative;
  background: var(--color-bg);
  overflow: hidden;
  
  &.drop-zone-active {
    background: rgba(34, 139, 230, 0.1);
    
    &::after {
      content: '';
      position: absolute;
      inset: 16px;
      border: 2px dashed var(--color-accent);
      border-radius: var(--radius-lg);
      pointer-events: none;
      z-index: 100;
    }
  }
}

/* Canvas Empty */
.canvas-empty {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: var(--color-text-muted);
  
  &__icon {
    margin-bottom: 16px;
    opacity: 0.3;
    
    svg {
      color: var(--color-text-muted);
    }
  }
  
  &__text {
    font-size: 1.2rem;
    font-weight: 500;
    color: var(--color-text-light);
    margin-bottom: 8px;
  }
  
  &__hint {
    font-size: 0.9rem;
  }
}

/* Connection Indicator */
.connection-indicator {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  background: linear-gradient(135deg, var(--color-accent) 0%, #7c3aed 100%);
  color: white;
  padding: 8px 20px;
  border-radius: 20px;
  font-size: 0.85rem;
  font-weight: 500;
  box-shadow: 0 4px 16px rgba(34, 139, 230, 0.4);
  z-index: 100;
  animation: pulse-indicator 1.5s infinite;
}

@keyframes pulse-indicator {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

/* Canvas Toolbar */
.canvas-toolbar {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 4px;
  background: var(--color-bg-secondary);
  padding: 6px;
  border-radius: var(--radius-lg);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  border: 1px solid var(--color-border);
  z-index: 10;
  
  &__btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: var(--radius-md);
    color: var(--color-text);
    cursor: pointer;
    transition: all 0.15s;
    
    &:hover {
      background: var(--color-bg);
      color: var(--color-text-bright);
    }
    
    &--danger:hover {
      background: var(--color-error);
      color: white;
    }
  }
  
  &__divider {
    width: 1px;
    background: var(--color-border);
    margin: 4px 0;
  }
}

/* Canvas Legend */
.canvas-legend {
  position: absolute;
  top: 16px;
  right: 16px;
  background: var(--color-bg-secondary);
  padding: 12px 16px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 10;
}

.legend-title {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  margin-bottom: 8px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.75rem;
  color: var(--color-text-light);
  margin-bottom: 4px;
  
  &--checkbox {
    cursor: pointer;
    padding: 4px 0;
    transition: opacity 0.2s ease;
    
    &:hover {
      opacity: 0.8;
    }
  }
}

.legend-checkbox {
  width: 14px;
  height: 14px;
  cursor: pointer;
  accent-color: var(--color-accent);
  flex-shrink: 0;
}

.legend-line {
  width: 28px;
  height: 3px;
  border-radius: 2px;
  flex-shrink: 0;
  
  &--ddl {
    background: #22c55e;  // 초록색 실선
  }
  
  &--procedure {
    // 하늘색 점선
    background: repeating-linear-gradient(
      to right,
      #38bdf8 0px,
      #38bdf8 5px,
      transparent 5px,
      transparent 9px
    );
  }
  
  &--user {
    background: #f59e0b;  // 주황색 실선
  }
}

.legend-label {
  font-size: 0.72rem;
  white-space: nowrap;
}

.legend-color {
  width: 20px;
  height: 3px;
  border-radius: 2px;
  
  &--dashed {
    background: repeating-linear-gradient(
      to right,
      var(--color-text-muted) 0px,
      var(--color-text-muted) 4px,
      transparent 4px,
      transparent 8px
    );
  }
}

.legend-divider {
  height: 1px;
  background: var(--color-border);
  margin: 8px 0;
}

.legend-tip {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  margin-bottom: 4px;
  
  &:last-child {
    margin-bottom: 0;
  }
}

/* Edge Delete Modal */
.edge-delete-modal-overlay {
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
  backdrop-filter: blur(4px);
}

.edge-delete-modal {
  background: var(--color-bg-secondary, #2c2e33);
  border: 1px solid var(--color-border, #373a40);
  border-radius: 12px;
  padding: 24px;
  min-width: 360px;
  max-width: 450px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
  
  &__header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 20px;
    
    h3 {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--color-text, #c1c2c5);
    }
  }
  
  &__icon {
    font-size: 1.5rem;
  }
  
  &__body {
    margin-bottom: 24px;
    
    p {
      margin: 0 0 16px 0;
      color: var(--color-text-light, #909296);
      font-size: 0.9rem;
    }
  }
  
  &__info {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    background: var(--color-bg-tertiary, #25262b);
    border-radius: 8px;
    border: 1px solid var(--color-border, #373a40);
  }
  
  &__table {
    flex: 1;
    
    .edge-delete-modal__label {
      display: block;
      font-size: 0.7rem;
      color: var(--color-text-muted, #5c5f66);
      margin-bottom: 4px;
      text-transform: uppercase;
    }
    
    .edge-delete-modal__value {
      font-size: 0.85rem;
      font-weight: 500;
      color: var(--color-accent, #4dabf7);
      font-family: var(--font-mono, monospace);
    }
  }
  
  &__arrow {
    font-size: 1.2rem;
    color: var(--color-text-muted, #5c5f66);
  }
  
  &__actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  }
  
  &__btn {
    padding: 10px 20px;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    border: none;
    
    &--cancel {
      background: var(--color-bg-tertiary, #373a40);
      color: var(--color-text-light, #909296);
      
      &:hover {
        background: var(--color-bg, #25262b);
      }
    }
    
    &--delete {
      background: #ef4444;
      color: white;
      
      &:hover {
        background: #dc2626;
      }
    }
  }
}

// ============================================================================
// 소스 코드 패널
// ============================================================================
.source-code-panel {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 55%;
  max-width: 800px;
  min-width: 500px;
  background: var(--color-bg-secondary, #1e1f2a);
  border-left: 1px solid var(--color-border, #373a40);
  display: flex;
  flex-direction: column;
  z-index: 100;
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.4);
}

.source-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--color-bg-tertiary, #2c2e33);
  border-bottom: 1px solid var(--color-border, #373a40);
  color: var(--color-text, #c1c2c5);
}

.source-panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 0.9rem;
}

.source-panel-icon {
  font-size: 1rem;
}

.source-panel-filename {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-panel-close {
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: var(--color-text-muted, #909296);
  width: 28px;
  height: 28px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  
  &:hover {
    background: rgba(255, 255, 255, 0.15);
    color: var(--color-text, #c1c2c5);
  }
}

.source-panel-info {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: var(--color-bg-secondary, #1e1f2a);
  border-bottom: 1px solid var(--color-border, #373a40);
  font-size: 0.8rem;
}

.source-panel-procedure {
  color: #a78bfa;
  font-weight: 500;
  font-family: var(--font-mono, monospace);
}

.source-panel-line {
  color: #6ee7b7;
  font-weight: 500;
  font-size: 0.75rem;
  padding: 2px 8px;
  background: rgba(110, 231, 183, 0.1);
  border-radius: 4px;
}

.source-panel-content {
  flex: 1;
  overflow: auto;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 12px;
  line-height: 1.6;
  
  &::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  
  &::-webkit-scrollbar-thumb {
    background: var(--color-border, #373a40);
    border-radius: 4px;
    
    &:hover {
      background: var(--color-text-muted, #5c5f66);
    }
  }
}

.source-line {
  display: flex;
  padding: 0 12px;
  transition: background 0.2s;
  position: relative;
  
  &:hover {
    background: rgba(255, 255, 255, 0.03);
  }
  
  &.highlighted {
    background: rgba(56, 189, 248, 0.25);
    
    // 왼쪽 강조 바
    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 4px;
      background: linear-gradient(180deg, #38bdf8, #0ea5e9);
      box-shadow: 0 0 8px rgba(56, 189, 248, 0.6);
    }
    
    .source-line-number {
      color: #38bdf8;
      font-weight: 700;
      opacity: 1;
      background: rgba(56, 189, 248, 0.15);
    }
    
    .source-line-content {
      color: #fff;
    }
  }
}

.source-line-number {
  min-width: 50px;
  padding: 0 12px;
  text-align: right;
  color: var(--color-text-muted, #5c5f66);
  user-select: none;
  opacity: 0.5;
  flex-shrink: 0;
  border-right: 1px solid var(--color-border, #373a40);
  margin-right: 12px;
  transition: all 0.2s;
}

.source-line-content {
  white-space: pre;
  color: var(--color-text, #c1c2c5);
  flex: 1;
}

.source-loading {
  padding: 20px;
  text-align: center;
  color: var(--color-text-muted, #5c5f66);
  font-size: 0.85rem;
}

// AI 설명 주석
.source-ai-comment {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px 8px 70px;
  background: linear-gradient(90deg, rgba(168, 85, 247, 0.08) 0%, rgba(168, 85, 247, 0.02) 100%);
  border-left: 3px solid #a855f7;
  margin: 4px 0;
  font-size: 0.8rem;
  line-height: 1.5;
}

.ai-comment-icon {
  flex-shrink: 0;
  font-size: 0.9rem;
}

.ai-comment-type {
  flex-shrink: 0;
  font-weight: 600;
  color: #a855f7;
  font-size: 0.7rem;
  padding: 2px 6px;
  background: rgba(168, 85, 247, 0.15);
  border-radius: 4px;
  text-transform: uppercase;
}

.ai-comment-text {
  color: #c4b5fd;
  font-style: italic;
}

.source-line.has-statement {
  background: rgba(168, 85, 247, 0.05);
}

// 슬라이드 애니메이션
.slide-right-enter-active,
.slide-right-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.slide-right-enter-from,
.slide-right-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

.slide-right-enter-to,
.slide-right-leave-from {
  transform: translateX(0);
  opacity: 1;
}

// 하단 슬라이드 업 애니메이션
.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}

.slide-up-enter-to,
.slide-up-leave-from {
  transform: translateY(0);
  opacity: 1;
}

// 테이블 데이터 조회 패널
.table-data-panel {
  position: absolute;
  bottom: 0;
  left: 280px; // left-panel 너비
  right: 0;
  height: 300px;
  background: var(--color-bg-secondary, #25262b);
  border-top: 1px solid var(--color-border, #373a40);
  display: flex;
  flex-direction: column;
  z-index: 100;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.3);
  
  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: var(--color-bg-tertiary, #1e1f23);
    border-bottom: 1px solid var(--color-border, #373a40);
    flex-shrink: 0;
  }
  
  &__title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--color-text-bright, #fff);
    
    .row-count-badge {
      font-size: 0.75rem;
      font-weight: 500;
      padding: 2px 8px;
      background: rgba(56, 189, 248, 0.15);
      color: #38bdf8;
      border-radius: 12px;
    }
    
    .exec-time {
      font-size: 0.75rem;
      color: var(--color-success, #40c057);
    }
  }
  
  &__actions {
    display: flex;
    align-items: center;
    gap: 12px;
    
    .limit-selector {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.8rem;
      color: var(--color-text-light, #909296);
      
      select {
        padding: 4px 8px;
        background: var(--color-bg, #1a1b26);
        border: 1px solid var(--color-border, #373a40);
        border-radius: 4px;
        color: var(--color-text, #c1c2c5);
        font-size: 0.8rem;
        cursor: pointer;
        
        &:hover {
          border-color: var(--color-text-muted, #5c5f66);
        }
      }
    }
    
    .refresh-btn,
    .close-btn {
      padding: 6px 10px;
      background: var(--color-bg, #1a1b26);
      border: 1px solid var(--color-border, #373a40);
      border-radius: 4px;
      color: var(--color-text, #c1c2c5);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
      
      &:hover {
        background: var(--color-bg-tertiary, #1e1f23);
        border-color: var(--color-text-muted, #5c5f66);
      }
    }
    
    .close-btn {
      font-size: 1.2rem;
      line-height: 1;
    }
  }
  
  &__sql {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 16px;
    background: var(--color-bg, #1a1b26);
    border-bottom: 1px solid var(--color-border, #373a40);
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    flex-shrink: 0;
    
    .sql-code {
      flex: 1;
      font-size: 0.8rem;
      color: #38bdf8;
      background: rgba(56, 189, 248, 0.08);
      padding: 6px 12px;
      border-radius: 4px;
      border: 1px solid rgba(56, 189, 248, 0.2);
      overflow-x: auto;
      white-space: nowrap;
      
      &::-webkit-scrollbar {
        height: 4px;
      }
      
      &::-webkit-scrollbar-thumb {
        background: rgba(56, 189, 248, 0.3);
        border-radius: 2px;
      }
    }
    
    .sql-copy-btn {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 1rem;
      padding: 4px;
      opacity: 0.6;
      transition: opacity 0.2s;
      flex-shrink: 0;
      
      &:hover {
        opacity: 1;
      }
    }
  }
  
  // SQL 토글 버튼 (헤더 actions에 위치)
  .sql-toggle-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    background: var(--color-bg, #1a1b26);
    border: 1px solid var(--color-border, #373a40);
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--color-text-light, #909296);
    cursor: pointer;
    transition: all 0.15s;
    
    &:hover {
      background: var(--color-bg-tertiary, #1e1f23);
      border-color: var(--color-text-muted, #5c5f66);
    }
    
    &.active {
      background: rgba(56, 189, 248, 0.15);
      border-color: rgba(56, 189, 248, 0.4);
      color: #38bdf8;
    }
  }
  
  &__content {
    flex: 1;
    overflow: auto;
    
    .loading-state,
    .error-state,
    .empty-state {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      height: 100%;
      color: var(--color-text-light, #909296);
      font-size: 0.9rem;
    }
    
    .error-state {
      color: var(--color-error, #fa5252);
    }
    
    .spinner {
      width: 20px;
      height: 20px;
      border: 2px solid var(--color-border, #373a40);
      border-top-color: #38bdf8;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
  }
}

// Behavior 실행 모드 헤더
.behavior-mode-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: linear-gradient(135deg, rgba(81, 207, 102, 0.15), rgba(55, 178, 77, 0.1));
  border-bottom: 1px solid rgba(81, 207, 102, 0.3);
  
  .behavior-badge {
    font-weight: 600;
    color: #51cf66;
    font-size: 0.9rem;
  }
  
  .behavior-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    
    .row-count {
      font-size: 0.85rem;
      color: var(--color-text-muted);
    }
    
    .cancel-mode-btn {
      padding: 6px 12px;
      background: transparent;
      border: 1px solid var(--color-border);
      border-radius: 6px;
      color: var(--color-text-light);
      font-size: 0.85rem;
      cursor: pointer;
      
      &:hover {
        background: var(--color-bg-tertiary);
      }
    }
  }
}

.data-table-wrapper {
  overflow: auto;
  height: 100%;
}

.data-table {
  // Behavior 모드 스타일
  &.behavior-mode {
    .action-col {
      width: 60px;
      text-align: center;
    }
    
    .row-execute-btn {
      padding: 4px 12px;
      background: linear-gradient(135deg, #51cf66, #37b24d);
      border: none;
      border-radius: 4px;
      color: white;
      font-size: 0.8rem;
      cursor: pointer;
      transition: all 0.2s;
      
      &:hover:not(:disabled) {
        background: linear-gradient(135deg, #40c057, #2f9e44);
        transform: scale(1.05);
      }
      
      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }
  }
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
  
  thead {
    position: sticky;
    top: 0;
    background: var(--color-bg-tertiary, #1e1f23);
    z-index: 1;
  }
  
  th {
    padding: 10px 14px;
    text-align: left;
    font-weight: 600;
    color: var(--color-text-light, #909296);
    border-bottom: 1px solid var(--color-border, #373a40);
    white-space: nowrap;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  
  td {
    padding: 8px 14px;
    border-bottom: 1px solid rgba(55, 58, 64, 0.5);
    color: var(--color-text, #c1c2c5);
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  tbody tr {
    transition: background 0.15s;
    
    &:hover {
      background: rgba(56, 189, 248, 0.05);
    }
    
    &:nth-child(even) {
      background: rgba(255, 255, 255, 0.01);
      
      &:hover {
        background: rgba(56, 189, 248, 0.05);
      }
    }
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

// Behavior 결과 팝업 (인터랙티브)
.behavior-result-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.behavior-result-popup {
  background: var(--color-bg-secondary, #25262b);
  border-radius: 12px;
  border: 1px solid var(--color-border, #373a40);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  
  &--large {
    width: 90vw;
    max-width: 1200px;
    height: 80vh;
    max-height: 800px;
  }
  
  .popup-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--color-border, #373a40);
    background: var(--color-bg-tertiary, #1e1f23);
    border-radius: 12px 12px 0 0;
    
    h3 {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--color-text, #c1c2c5);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .close-btn {
      background: transparent;
      border: none;
      color: var(--color-text-muted, #909296);
      font-size: 1.2rem;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
      
      &:hover {
        background: var(--color-bg, #1a1b26);
        color: var(--color-text, #c1c2c5);
      }
    }
  }
  
  .popup-content {
    flex: 1;
    overflow: hidden;
    
    &--split {
      display: flex;
      gap: 1px;
      background: var(--color-border, #373a40);
    }
  }
  
  .code-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--color-bg-secondary, #25262b);
    overflow: hidden;
    
    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 16px;
      background: var(--color-bg-tertiary, #1e1f23);
      border-bottom: 1px solid var(--color-border, #373a40);
      
      .section-title {
        font-weight: 600;
        font-size: 0.85rem;
        color: var(--color-text-light, #909296);
      }
      
      .error-line-badge {
        padding: 4px 10px;
        background: rgba(250, 82, 82, 0.2);
        border: 1px solid rgba(250, 82, 82, 0.5);
        border-radius: 4px;
        font-size: 0.75rem;
        color: #fa5252;
        font-weight: 600;
      }
    }
    
    .code-viewer {
      flex: 1;
      overflow: auto;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 0.8rem;
      
      .code-line {
        display: flex;
        padding: 2px 0;
        
        &:hover {
          background: rgba(56, 189, 248, 0.05);
        }
        
        &--error {
          background: rgba(250, 82, 82, 0.15) !important;
          
          .line-content {
            color: #fa5252;
          }
        }
        
        .line-number {
          min-width: 50px;
          padding: 0 12px;
          text-align: right;
          color: var(--color-text-muted, #5c5f66);
          user-select: none;
          border-right: 1px solid var(--color-border, #373a40);
          margin-right: 12px;
        }
        
        .line-content {
          flex: 1;
          color: var(--color-text, #c1c2c5);
          white-space: pre;
        }
      }
    }
  }
  
  .result-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--color-bg-secondary, #25262b);
    overflow: hidden;
    
    .result-block {
      display: flex;
      flex-direction: column;
      border-bottom: 1px solid var(--color-border, #373a40);
      
      &:last-child {
        flex: 1;
        border-bottom: none;
      }
      
      &--error {
        .section-title {
          color: #fa5252;
        }
      }
      
      &--success {
        .section-title {
          color: #51cf66;
        }
      }
      
      .section-header {
        display: flex;
        align-items: center;
        padding: 10px 16px;
        background: var(--color-bg-tertiary, #1e1f23);
        
        .section-title {
          font-weight: 600;
          font-size: 0.85rem;
        }
      }
      
      .result-pre {
        flex: 1;
        margin: 0;
        padding: 12px 16px;
        font-family: 'JetBrains Mono', 'Fira Code', monospace;
        font-size: 0.8rem;
        overflow: auto;
        background: var(--color-bg, #1a1b26);
        
        &--input {
          color: #38bdf8;
          max-height: 120px;
        }
        
        &--output {
          color: #51cf66;
        }
      }
      
      .error-info {
        padding: 12px 16px;
        
        .error-type {
          font-weight: 600;
          color: #fa5252;
          margin-bottom: 10px;
        }
        
        .error-line-content {
          margin-bottom: 10px;
          
          .label {
            color: var(--color-text-muted);
            margin-right: 8px;
          }
          
          code {
            padding: 4px 8px;
            background: rgba(250, 82, 82, 0.1);
            border-radius: 4px;
            color: #fa5252;
            font-family: 'JetBrains Mono', 'Fira Code', monospace;
            font-size: 0.85rem;
          }
        }
        
        .traceback-details {
          margin-top: 10px;
          
          summary {
            cursor: pointer;
            color: var(--color-text-muted);
            font-size: 0.85rem;
            
            &:hover {
              color: var(--color-text);
            }
          }
          
          .traceback-pre {
            margin-top: 8px;
            padding: 12px;
            background: var(--color-bg, #1a1b26);
            border-radius: 6px;
            font-family: 'JetBrains Mono', 'Fira Code', monospace;
            font-size: 0.75rem;
            color: #909296;
            overflow: auto;
            max-height: 200px;
            white-space: pre-wrap;
            word-break: break-word;
          }
        }
      }
    }
  }
  
  .popup-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    border-top: 1px solid var(--color-border, #373a40);
    background: var(--color-bg-tertiary, #1e1f23);
    border-radius: 0 0 12px 12px;
    
    .footer-message {
      font-size: 0.85rem;
      color: var(--color-text-muted);
    }
    
    .close-popup-btn {
      padding: 8px 24px;
      background: var(--color-bg, #1a1b26);
      border: 1px solid var(--color-border, #373a40);
      border-radius: 6px;
      color: var(--color-text, #c1c2c5);
      font-size: 0.9rem;
      cursor: pointer;
      margin-left: auto;
      
      &:hover {
        background: var(--color-bg-secondary, #25262b);
      }
    }
  }
  
  // React Agent 시도 타임라인
  .attempts-timeline {
    border-bottom: 1px solid var(--color-border, #373a40);
    background: var(--color-bg, #1a1b26);
    padding: 12px 20px;
    
    .timeline-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
      
      .timeline-title {
        font-weight: 600;
        font-size: 0.85rem;
        color: var(--color-text-light);
      }
      
      .timeline-summary {
        font-size: 0.75rem;
        color: var(--color-text-muted);
        padding: 2px 8px;
        background: var(--color-bg-tertiary);
        border-radius: 10px;
      }
    }
    
    .timeline-steps {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      
      .timeline-step {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: var(--color-bg-secondary);
        border: 1px solid var(--color-border);
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;
        
        &:hover {
          background: var(--color-bg-tertiary);
        }
        
        &--active {
          border-color: #38bdf8;
          background: rgba(56, 189, 248, 0.1);
        }
        
        &--success {
          border-color: rgba(81, 207, 102, 0.5);
          
          .step-number {
            background: rgba(81, 207, 102, 0.2);
            color: #51cf66;
          }
        }
        
        &--error {
          border-color: rgba(250, 82, 82, 0.5);
          
          .step-number {
            background: rgba(250, 82, 82, 0.2);
            color: #fa5252;
          }
        }
        
        .step-number {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: var(--color-bg-tertiary);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--color-text);
        }
        
        .step-info {
          .step-status {
            font-size: 0.8rem;
            font-weight: 500;
            color: var(--color-text);
          }
          
          .step-error {
            font-size: 0.7rem;
            color: var(--color-text-muted);
            max-width: 200px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
        }
        
        .step-arrow {
          font-size: 0.9rem;
          color: #f59e0b;
        }
      }
    }
  }
  
  // AI 자동 수정 배지
  .auto-fixed-badge {
    margin-left: 12px;
    padding: 4px 10px;
    background: rgba(56, 189, 248, 0.15);
    border: 1px solid rgba(56, 189, 248, 0.4);
    border-radius: 4px;
    font-size: 0.75rem;
    color: #38bdf8;
    font-weight: 500;
  }
  
  // 코드 탭
  .code-tabs {
    display: flex;
    gap: 4px;
    margin-right: auto;
    margin-left: 12px;
    
    .code-tab {
      padding: 4px 10px;
      background: transparent;
      border: 1px solid var(--color-border);
      border-radius: 4px;
      color: var(--color-text-muted);
      font-size: 0.75rem;
      cursor: pointer;
      transition: all 0.2s;
      
      &:hover {
        background: var(--color-bg-tertiary);
        color: var(--color-text);
      }
      
      &--active {
        background: var(--color-bg-tertiary);
        border-color: #38bdf8;
        color: #38bdf8;
      }
    }
  }
}

// 레거시 호환 (기존 스타일 유지)
.behavior-result-popup:not(.behavior-result-popup--large) {
  min-width: 400px;
  max-width: 600px;
  max-height: 70vh;
  
  .popup-content {
    padding: 20px;
    
    .error-result {
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--color-error, #fa5252);
      
      .error-icon {
        font-size: 1.5rem;
      }
    }
    
    .success-result {
      pre {
        margin: 0;
        padding: 16px;
        background: var(--color-bg, #1a1b26);
        border-radius: 8px;
        border: 1px solid var(--color-border, #373a40);
        font-family: 'JetBrains Mono', 'Fira Code', monospace;
        font-size: 0.85rem;
        color: #51cf66;
        overflow: auto;
        white-space: pre-wrap;
        word-break: break-word;
      }
    }
  }
  
  .popup-footer {
    padding: 12px 20px;
    border-top: 1px solid var(--color-border, #373a40);
    display: flex;
    justify-content: flex-end;
    
    .close-popup-btn {
      padding: 8px 20px;
      background: var(--color-bg-tertiary, #373a40);
      border: 1px solid var(--color-border, #373a40);
      border-radius: 6px;
      color: var(--color-text, #c1c2c5);
      font-size: 0.9rem;
      cursor: pointer;
      
      &:hover {
        background: var(--color-bg, #1a1b26);
      }
    }
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>

