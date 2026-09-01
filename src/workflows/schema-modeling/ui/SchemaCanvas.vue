<script setup lang="ts">
import { copyToClipboard } from '@/shared/utils/clipboard'
import { logger } from '@/shared/utils/logger'
import { ref, onMounted, provide, computed, markRaw, nextTick, watch } from 'vue'
import type { Component } from 'vue'
import {
  VueFlow,
  useVueFlow,
  type Connection,
  type EdgeMouseEvent,
  type NodeChange,
  type OnConnectStartParams,
} from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import TableNode from './nodes/TableNode.vue'
import TableDetailPanel from './TableDetailPanel.vue'
import TextViewer from '@/shared/components/TextViewer.vue'
import ActionDialog from '@/shared/components/ActionDialog.vue'
import CardinalityModal, { type Cardinality } from './CardinalityModal.vue'
import EditRelationshipDialog from './EditRelationshipDialog.vue'
import CatalogRelationshipDialog from './CatalogRelationshipDialog.vue'
import CloseButton from './CloseButton.vue'
import NameModeSwitch from './NameModeSwitch.vue'
import { useSchemaCanvasStore } from '../state/schemaCanvas.ts'
import {
  type OntologyBehavior,
} from '@/domains/ontology'
import { schemaRelationshipGateway } from '../application/relationshipGateway'
import type { SchemaModelingTable } from '../application/schemaCatalogDiscovery'
import { IconTable, IconSearch, IconRefresh, IconTrash, IconZoomIn, IconZoomOut, IconMaximize, IconLink, IconFolder, IconChevronRight, IconDatabase } from '@/shared/icons'
import { useManagedTimeouts } from '@/shared/composables/useManagedTimeouts'
import { useBehaviorExecution } from '../composables/useBehaviorExecution'
import { useSourceCodePanelView } from '../composables/useSourceCodePanelView'
import {
  parseEditingRelationship,
  parseEmptyDropSource,
  parsePendingRelationshipConnection,
  type EditingRelationship,
  type PendingRelationshipConnection,
} from '../model/relationshipInteraction'
import {
  sameTableIdentity,
  tableIdentityKey,
  tableNodeId,
  type SchemaTableIdentityInput,
} from '../model/tableIdentity'
import {
  cloneSchemaCanvasBatchAttempt,
  createSchemaCanvasBatchAttempt,
  type SchemaCanvasBatchAttempt,
} from '../application/schemaCanvasBatch'
import { useSchemaCanvasViewport } from '../composables/useSchemaCanvasViewport'
import { useSchemaCanvasTableIntake } from '../composables/useSchemaCanvasTableIntake'

// Props
const props = withDefaults(defineProps<{
  hideTablePanel?: boolean  // 왼쪽 테이블 패널 숨기기 (ObjectTypeModeler에서 사용)
  hideLegend?: boolean      // FK 관계 범례 숨기기 (ObjectTypeModeler에서 사용)
}>(), {
  hideTablePanel: false,
  hideLegend: false
})

// Emits
const emit = defineEmits<{
  (e: 'empty-drop', data: { sourceType: string; sourceColumn: string }): void
  (e: 'open-behavior-dialog', data: { mode: 'create' | 'edit', objectTypeName: string, columns: string[], behavior?: OntologyBehavior }): void
}>()

const store = useSchemaCanvasStore()
const managedTimeouts = useManagedTimeouts()
const batchPending = ref(false)
const batchError = ref<string | null>(null)
const failedBatchAttempt = ref<SchemaCanvasBatchAttempt | null>(null)
const canvasAreaRef = ref<HTMLElement | null>(null)
const floatingControlsRef = ref<HTMLElement | null>(null)
const canvasToolbarRef = ref<HTMLElement | null>(null)
const canvasLegendRef = ref<HTMLElement | null>(null)
const mobileTablePanelOpen = ref(false)
const mobileTablePanelTriggerRef = ref<HTMLButtonElement | null>(null)
const mobileTablePanelCloseRef = ref<HTMLButtonElement | null>(null)
// 검색어 단일 출처 = store.searchQuery (로컬 ref 폐기 — 상단 전체검색 등 외부 설정도 즉시 반영)
const isConnecting = ref(false)

const { sourceCodeContentRef, getStatementForLine } = useSourceCodePanelView(
  () => store.sourceCodePanel,
)

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

// 클립보드 복사는 @/shared/utils/clipboard 의 copyToClipboard 사용

const {
  showBehaviorResultPopup,
  behaviorResultData,
  behaviorResultError,
  executingRowIndex,
  showOriginalCode,
  selectedAttemptIndex,
  displayedCode,
  cancelBehaviorMode,
  executeBehaviorForRow,
  closeBehaviorResultPopup,
} = useBehaviorExecution(store)

// 기본 상태는 모두 펼침이며 false인 canonical identity만 저장한다.
const expandedDatasources = ref<Record<string, boolean>>({})
const expandedSchemas = ref<Record<string, boolean>>({})

// SQL 쿼리 표시 토글
const showSqlQuery = ref(false)

// 기본 펼침 — 명시적으로 false 일 때만 접힘(undefined=펼침)
function isDsExpanded(ds: string): boolean {
  return expandedDatasources.value[ds] !== false
}
function schemaExpansionKey(datasource: string, schema: string): string {
  return JSON.stringify([datasource, schema])
}

function treeDisclosureId(level: 'datasource' | 'schema', ...identity: string[]): string {
  const key = identity
    .map(value => encodeURIComponent(value).replace(/%/g, '_'))
    .join('--')
  return `schema-tree-${level}-${key}`
}

function isSchemaExpanded(datasource: string, schema: string): boolean {
  return expandedSchemas.value[schemaExpansionKey(datasource, schema)] !== false
}
function toggleDatasource(ds: string) {
  expandedDatasources.value[ds] = expandedDatasources.value[ds] === false
}

function toggleSchema(datasource: string, schema: string) {
  const key = schemaExpansionKey(datasource, schema)
  expandedSchemas.value[key] = expandedSchemas.value[key] === false
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

// 트리에서 캔버스에 올라간 테이블 표시용 (단일 목록 통합 spec 044)
function isOnCanvas(table: SchemaTableIdentityInput): boolean {
  return store.tablesOnCanvas.includes(tableIdentityKey(table))
}

function isSelectedTable(table: SchemaTableIdentityInput): boolean {
  return Boolean(store.selectedTable && sameTableIdentity(store.selectedTable, table))
}

function selectCanvasTable(table: SchemaTableIdentityInput) {
  if (isOnCanvas(table)) void store.selectNode(tableNodeId(table))
}

// 검색결과 소속줄 — (논리명을 1차로 썼으면) 물리명 · 스키마. 그래프 노드검색과 같은 톤(spec 045)
function tableSearchSub(t: { name: string; logical_name?: string; schema?: string; datasource?: string }): string {
  const parts: string[] = []
  if (t.logical_name && t.logical_name !== t.name) parts.push(t.name)
  if (t.datasource) parts.push(t.datasource)
  if (t.schema) parts.push(t.schema)
  return parts.join(' · ')
}

// Cardinality Modal State
const isCardinalityModalOpen = ref(false)
const pendingConnection = ref<PendingRelationshipConnection | null>(null)

// Edge Edit Dialog State
const isEditRelationshipDialogOpen = ref(false)
const isCatalogRelationshipDialogOpen = ref(false)
const isCatalogDeleteConfirmOpen = ref(false)
const editingRelationship = ref<EditingRelationship | null>(null)
const catalogRelationshipError = ref<string | null>(null)
const isDeletingCatalogRelationship = ref(false)
const relationshipActionError = ref<string | null>(null)

const { fitView, zoomIn, zoomOut } = useVueFlow()
const {
  fit: fitCanvasView,
  scheduleFit: scheduleFitView,
} = useSchemaCanvasViewport({
  canvas: canvasAreaRef,
  floatingControls: floatingControlsRef,
  toolbar: canvasToolbarRef,
  legend: canvasLegendRef,
  fitView,
  schedule: managedTimeouts.schedule,
})
const {
  draggingOver: isDragOver,
  pending: dropPending,
  error: dropError,
  failedTarget: failedDropTarget,
  handleDrop,
  addTable: addTableThroughIntake,
  retry: retryDroppedTable,
  dismissError: dismissDropError,
  handleDragOver,
  handleDragLeave,
  startDrag: startDragTable,
} = useSchemaCanvasTableIntake({
  addTable: (table, position, options) => (
    store.addTableToCanvas(table, position, options)
  ),
  afterAdded: () => {
    closeMobileTablePanel()
    scheduleFitView(0.3)
  },
  reportError: (message, error) => logger.error(message, error),
})

// Node types - using markRaw to prevent Vue from making the component reactive
const nodeTypes: Record<string, Component> = {
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
provide('onRemoveTable', (table: SchemaTableIdentityInput) => {
  store.removeTableFromCanvas(table)
})

provide('onLoadRelated', async (table: SchemaTableIdentityInput) => {
  const loaded = await store.loadRelatedTables(table)
  if (loaded) scheduleFitView(0.3)
})

// Lifecycle
onMounted(async () => {
  await store.loadAllTables()
  await store.loadUserRelationships()

  // 초기 로드 후 엣지 업데이트 (캔버스에 테이블이 이미 있는 경우)
  if (store.nodes.length > 0) {
    managedTimeouts.schedule('initial-edge-update', () => {
      store.updateEdgesFromRelationships()
    }, 500)
  }
})

// Handlers
// 검색어(store.searchQuery) 변경 감시 — 입력이든 외부(상단 전체검색)든 의미검색 디바운스 트리거
watch(() => store.searchQuery, (q) => {
  managedTimeouts.cancel('semantic-search')
  const v = (q || '').trim()
  if (v.length >= 2) {
    managedTimeouts.schedule('semantic-search', () => store.performSemanticSearch(v), 500)
  } else {
    store.clearSemanticSearch()
  }
})

function clearSearch() {
  store.searchQuery = ''
  store.clearSemanticSearch()
  managedTimeouts.cancel('semantic-search')
}

async function addTableToCanvas(table: SchemaModelingTable) {
  await addTableThroughIntake(table)
}

// 시멘틱 검색 결과 드래그
function startDragSemanticResult(event: DragEvent, result: { name: string; schema: string; description: string }) {
  const table: SchemaModelingTable = {
    name: result.name,
    schema: result.schema,
    description: result.description,
    column_count: 0
  }
  startDragTable(event, table)
}

async function addSemanticResultToCanvas(result: { name: string; schema: string; description: string }) {
  const table: SchemaModelingTable = {
    name: result.name,
    schema: result.schema,
    description: result.description,
    column_count: 0
  }
  await addTableThroughIntake(table)
}

function activateCatalogTable(table: SchemaModelingTable) {
  if (isOnCanvas(table)) {
    selectCanvasTable(table)
    return
  }
  void addTableToCanvas(table)
}

function activateSemanticResult(result: { name: string; schema: string; description: string }) {
  if (isOnCanvas(result)) {
    selectCanvasTable(result)
    return
  }
  void addSemanticResultToCanvas(result)
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
function onEdgeDoubleClick(event: EdgeMouseEvent) {
  const relationship = parseEditingRelationship(event.edge, store.nodes)
  if (!relationship) {
    logger.warn('[SchemaCanvas] 컬럼 정보를 찾을 수 없습니다:', event.edge)
    return
  }
  editingRelationship.value = relationship
  catalogRelationshipError.value = null
  isCatalogDeleteConfirmOpen.value = false
  if (props.hideTablePanel) {
    isEditRelationshipDialogOpen.value = true
  } else {
    isCatalogRelationshipDialogOpen.value = true
  }
}

// 관계 편집 완료
async function handleRelationshipUpdated() {
  isEditRelationshipDialogOpen.value = false
  const rel = editingRelationship.value
  editingRelationship.value = null

  if (rel) {
    try {
      const updated = await schemaRelationshipGateway.loadRelationship({
        sourceType: rel.sourceType,
        targetType: rel.targetType,
        sourceColumn: rel.sourceColumn,
        targetColumn: rel.targetColumn,
      })
      if (updated) {
        store.edges = store.edges.map(edge => edge.id === rel.id
          ? {
              ...edge,
              label: updated.name || updated.description || edge.label,
              data: {
                ...edge.data,
                relationshipScope: 'ontology',
                relationshipSource: 'user',
              },
            }
          : edge)
      }
    } catch (error) {
      relationshipActionError.value = error instanceof Error
        ? `Ontology 관계는 저장됐지만 화면 갱신에 실패했습니다: ${error.message}`
        : 'Ontology 관계는 저장됐지만 화면 갱신에 실패했습니다.'
    }
  }
}

// Ontology 다이얼로그가 이미 삭제 API를 완료한 뒤 로컬 edge만 제거한다.
function handleRelationshipDeleted() {
  isEditRelationshipDialogOpen.value = false
  const rel = editingRelationship.value
  if (rel) store.edges = store.edges.filter(edge => edge.id !== rel.id)
  editingRelationship.value = null
}

function closeCatalogRelationshipDialog() {
  if (isDeletingCatalogRelationship.value) return
  isCatalogRelationshipDialogOpen.value = false
  isCatalogDeleteConfirmOpen.value = false
  editingRelationship.value = null
  catalogRelationshipError.value = null
}

function requestCatalogRelationshipDelete() {
  if (editingRelationship.value?.source !== 'user') return
  catalogRelationshipError.value = null
  isCatalogDeleteConfirmOpen.value = true
}

async function deleteCatalogRelationship() {
  const rel = editingRelationship.value
  if (!rel || rel.source !== 'user') return

  isDeletingCatalogRelationship.value = true
  catalogRelationshipError.value = null
  try {
    const result = await store.removeRelationship({
      from_table: rel.sourceType,
      from_schema: rel.fromSchema,
      from_column: rel.sourceColumn,
      to_table: rel.targetType,
      to_schema: rel.toSchema,
      to_column: rel.targetColumn,
    })
    isCatalogDeleteConfirmOpen.value = false
    isCatalogRelationshipDialogOpen.value = false
    editingRelationship.value = null
    if (result.refreshWarning) {
      relationshipActionError.value = `관계는 삭제되었지만 최신 관계 목록을 다시 불러오지 못했습니다: ${result.refreshWarning}`
    }
  } catch (error) {
    catalogRelationshipError.value = error instanceof Error
      ? error.message
      : 'Catalog 관계를 삭제하지 못했습니다.'
  } finally {
    isDeletingCatalogRelationship.value = false
  }
}

// Handle edge connection - show cardinality modal
function onConnect(connection: Connection) {
  const pending = parsePendingRelationshipConnection(connection, store.nodes)
  if (!pending) return
  logger.debug('[onConnect] Parsed:', pending)
  relationshipActionError.value = null
  pendingConnection.value = pending
  isCardinalityModalOpen.value = true
}

// Handle cardinality modal confirmation
async function handleCardinalityConfirm(cardinality: Cardinality, description: string) {
  if (!pendingConnection.value || isConnecting.value) return

  const { fromTable, fromSchema, fromColumn, toTable, toSchema, toColumn } = pendingConnection.value

  // Keep cardinality in the description because Catalog stores no dedicated cardinality field.
  const fullDescription = description
    ? `[${cardinality}] ${description}`
    : `[${cardinality}] ${fromTable}.${fromColumn} → ${toTable}.${toColumn}`

  logger.debug('[handleCardinalityConfirm] Creating relationship:', {
    from_table: fromTable,
    from_schema: fromSchema,
    from_column: fromColumn,
    to_table: toTable,
    to_schema: toSchema,
    to_column: toColumn,
    cardinality,
  })

  try {
    isConnecting.value = true
    relationshipActionError.value = null
    await store.addRelationshipWithCardinality({
      from_table: fromTable,
      from_schema: fromSchema || 'public',
      from_column: fromColumn,
      to_table: toTable,
      to_schema: toSchema || 'public',
      to_column: toColumn,
      description: fullDescription,
      cardinality,
    })

    isCardinalityModalOpen.value = false
    pendingConnection.value = null
  } catch (error) {
    logger.error('Failed to create relationship:', error)
    relationshipActionError.value = error instanceof Error
      ? error.message
      : '릴레이션 생성에 실패했습니다.'
  } finally {
    isConnecting.value = false
  }
}

function handleCardinalityModalClose() {
  if (isConnecting.value) return
  isCardinalityModalOpen.value = false
  pendingConnection.value = null
  relationshipActionError.value = null
}

// 연결 시작 시 소스 정보 저장 (허공 드롭 감지용)
const connectingSource = ref<{ nodeId: string; handleId: string } | null>(null)

function onConnectStart(event: { event?: MouseEvent } & OnConnectStartParams) {
  isConnecting.value = true
  if (event.nodeId && event.handleId) {
    connectingSource.value = { nodeId: event.nodeId, handleId: event.handleId }
  }
}

function onConnectEnd(event?: MouseEvent) {
  isConnecting.value = false
  if (!event) {
    connectingSource.value = null
    return
  }

  // 허공에 드롭되었는지 확인 (hideTablePanel이 true인 경우 = ObjectTypeModeler)
  if (props.hideTablePanel && connectingSource.value) {
    // 드롭 위치에 노드가 있는지 확인
    const dropTarget = document.elementFromPoint(event.clientX, event.clientY)
    const isDropOnNode = dropTarget?.closest('.vue-flow__node')
    const isDropOnHandle = dropTarget?.closest('.vue-flow__handle')

    // 노드나 핸들 위에 드롭되지 않았으면 허공 드롭
    if (!isDropOnNode && !isDropOnHandle) {
      const source = parseEmptyDropSource(
        connectingSource.value.nodeId,
        connectingSource.value.handleId,
        store.nodes,
      )
      if (source) {
        logger.debug('[SchemaCanvas] 허공 드롭 감지:', source)
        emit('empty-drop', source)
      }
    }
  }

  connectingSource.value = null
}

// 테이블 보기 컨트롤(상위10개/전체) 단일 드롭다운
const showTableViewMenu = ref(false)

// 범례 접기(기본 펼침) — 테이블 가림 방지
const legendCollapsed = ref(
  typeof window !== 'undefined'
    && window.matchMedia('(max-width: 720px)').matches,
)

async function openMobileTablePanel() {
  mobileTablePanelOpen.value = true
  await nextTick()
  mobileTablePanelCloseRef.value?.focus()
}

function closeMobileTablePanel() {
  if (!mobileTablePanelOpen.value) return
  mobileTablePanelOpen.value = false
  void nextTick(() => mobileTablePanelTriggerRef.value?.focus())
}

async function applyTableBatch(attempt: SchemaCanvasBatchAttempt) {
  if (batchPending.value) return

  const frozenAttempt = cloneSchemaCanvasBatchAttempt(attempt)
  batchPending.value = true
  batchError.value = null
  try {
    const committed = frozenAttempt.mode === 'all'
      ? await store.addAllTablesToCanvas(frozenAttempt.tables)
      : await store.addTablesToCanvasAtomically(frozenAttempt.tables)
    if (!committed) return

    failedBatchAttempt.value = null
    if (frozenAttempt.mode === 'all') {
      store.setFullViewMode(true)
      scheduleFitView(0.2, 300)
    } else {
      scheduleFitView(0.3, 200)
    }
  } catch (error) {
    logger.error(`[SchemaCanvas] ${frozenAttempt.mode} 테이블 묶음 추가 실패:`, error)
    failedBatchAttempt.value = frozenAttempt
    batchError.value = error instanceof Error
      ? error.message
      : '테이블 묶음을 캔버스에 추가하지 못했습니다.'
  } finally {
    batchPending.value = false
  }
}

function dismissBatchError() {
  if (batchPending.value) return
  batchError.value = null
  failedBatchAttempt.value = null
}

async function retryTableBatch() {
  if (!failedBatchAttempt.value) return
  await applyTableBatch(failedBatchAttempt.value)
}

async function handleAddTopTables() {
  showTableViewMenu.value = false
  await applyTableBatch(createSchemaCanvasBatchAttempt(
    'top',
    store.tablesNotOnCanvas.slice(0, 10),
  ))
}

async function handleAddAllTables() {
  showTableViewMenu.value = false
  await applyTableBatch(createSchemaCanvasBatchAttempt('all', store.allTables))
}

const isClearCanvasDialogOpen = ref(false)

function handleClearCanvas() {
  isClearCanvasDialogOpen.value = true
}

function confirmClearCanvas() {
  store.clearCanvas()
  isClearCanvasDialogOpen.value = false
}

async function handleRefresh() {
  await store.loadAllTables()
  await store.loadUserRelationships()
}
</script>

<template>
  <div class="schema-canvas" :class="{ 'hide-table-panel': props.hideTablePanel }">
    <!-- Left Panel: Table List (숨김 가능) -->
    <aside
      v-if="!props.hideTablePanel"
      id="schema-table-panel"
      class="left-panel"
      :class="{ 'left-panel--mobile-open': mobileTablePanelOpen }"
      aria-label="테이블 탐색"
      @keydown.esc.prevent.stop="closeMobileTablePanel"
    >
      <div class="panel-header">
        <div class="panel-title">
          <IconTable :size="16" />
          <span>테이블</span>
          <span class="panel-count">{{ store.allTables.length }}</span>
        </div>
        <div class="panel-header-actions">
          <button type="button" class="panel-action" @click="handleRefresh" title="새로고침">
            <IconRefresh :size="14" />
          </button>
          <button
            ref="mobileTablePanelCloseRef"
            type="button"
            class="mobile-table-panel-close"
            aria-label="테이블 목록 닫기"
            @click="closeMobileTablePanel"
          >×</button>
        </div>
      </div>

      <!-- Search (입력 단일 출처 = store.searchQuery) -->
      <div class="search-box">
        <IconSearch :size="14" />
        <input
          v-model="store.searchQuery"
          type="text"
          placeholder="테이블 검색..."
        />
        <button v-if="store.searchQuery" class="search-clear" @click="clearSearch">×</button>
      </div>

      <div v-if="store.tableListError" class="resource-alert resource-alert--panel">
        <span>테이블 목록을 불러오지 못했습니다: {{ store.tableListError }}</span>
        <button type="button" @click="store.loadAllTables">다시 시도</button>
      </div>

      <!-- 검색 결과 — 이름·논리명 검색. 검색어 있을 때 -->
      <div v-if="store.searchQuery" class="table-section table-section--scrollable">
        <div v-if="store.filteredTables.length === 0" class="search-empty">
          '{{ store.searchQuery }}' 와 일치하는 테이블이 없습니다
        </div>
        <!-- 검색결과 = 그래프 노드검색과 같은 톤(논리명 우선·소속). 트리 아니므로 가이드선 없는 깔끔한 리스트 -->
        <div v-else class="search-results">
          <div
            v-for="table in store.filteredTables"
            :key="`search-${tableIdentityKey(table)}`"
            class="search-row"
            :class="{ 'is-on-canvas': isOnCanvas(table), 'is-selected': isSelectedTable(table) }"
            draggable="true"
            :title="isOnCanvas(table) ? '캔버스에 있음' : '드래그로도 캔버스에 추가할 수 있습니다'"
            @dragstart="(e) => startDragTable(e, table)"
          >
            <button
              type="button"
              class="search-row__primary"
              :aria-label="isOnCanvas(table)
                ? `${table.logical_name || table.name} 테이블 선택`
                : `${table.logical_name || table.name} 테이블 캔버스에 추가`"
              :aria-pressed="isOnCanvas(table) ? isSelectedTable(table) : undefined"
              @click="activateCatalogTable(table)"
            >
              <IconTable :size="16" class="search-row__icon" />
              <span class="search-row__info">
                <span class="search-row__name" :title="table.logical_name || table.name">{{ table.logical_name || table.name }}</span>
                <span class="search-row__sub" v-if="tableSearchSub(table)" :title="tableSearchSub(table)">{{ tableSearchSub(table) }}</span>
              </span>
              <span v-if="isOnCanvas(table)" class="search-row__dot" title="캔버스에 있음">●</span>
              <span v-else class="search-row__hint" aria-hidden="true">＋</span>
            </button>
            <button
              v-if="isOnCanvas(table)"
              type="button"
              class="search-row__remove"
              :aria-label="`${table.logical_name || table.name} 테이블 캔버스에서 제거`"
              @click="store.removeTableFromCanvas(table)"
            >×</button>
          </div>
        </div>

        <!-- 의미 기반 추천(semantic) — 이름검색과 별개, 컴팩트 표시 -->
        <div v-if="store.isSemanticSearching || store.semanticSearchResults.length > 0 || store.semanticSearchError" class="semantic-section">
          <div class="semantic-section__head">의미 기반 추천</div>
          <div v-if="store.isSemanticSearching" class="semantic-section__msg">검색 중…</div>
          <div
            v-else-if="store.semanticSearchError"
            class="semantic-section__msg semantic-section__msg--error"
            role="alert"
          >
            <span>{{ store.semanticSearchError }}</span>
            <button type="button" @click="store.retrySemanticSearch">같은 검색 다시 시도</button>
          </div>
          <div
            v-for="result in store.semanticSearchResults"
            :key="`sem-${tableIdentityKey(result)}`"
            class="search-row"
            :class="{ 'is-on-canvas': isOnCanvas(result) }"
            draggable="true"
            :title="result.description || '드래그로도 캔버스에 추가할 수 있습니다'"
            @dragstart="(e) => startDragSemanticResult(e, result)"
          >
            <button
              type="button"
              class="search-row__primary"
              :aria-label="isOnCanvas(result)
                ? `${result.name} 테이블 선택`
                : `${result.name} 의미 검색 결과를 캔버스에 추가`"
              :aria-pressed="isOnCanvas(result) ? isSelectedTable(result) : undefined"
              @click="activateSemanticResult(result)"
            >
              <IconTable :size="16" class="search-row__icon" />
              <span class="search-row__info">
                <span class="search-row__name" :title="result.name">{{ result.name }}</span>
                <span class="search-row__sub" v-if="result.schema" :title="result.schema">{{ result.schema }}</span>
              </span>
              <span class="search-row__pct" :title="`의미 유사도 ${Math.round(result.similarity * 100)}%`">{{ Math.round(result.similarity * 100) }}%</span>
              <span v-if="isOnCanvas(result)" class="search-row__dot" title="캔버스에 있음">●</span>
              <span v-else class="search-row__hint" aria-hidden="true">＋</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 테이블 트리 (단일 목록) - 캔버스에 올라간 건 ● 로 표시. 검색어 없을 때만 -->
      <div v-else class="table-section table-section--scrollable">
        <div class="schema-tree">
          <!-- 3레벨: 데이터소스 > 스키마 > 테이블 -->
          <div
            v-for="ds in store.datasources"
            :key="ds"
            class="datasource-folder"
          >
            <!-- 데이터소스 헤더 (1레벨) -->
            <button
              type="button"
              class="datasource-header"
              :class="{ 'datasource-header--expanded': isDsExpanded(ds) }"
              :aria-label="`${ds} 데이터소스`"
              :aria-expanded="isDsExpanded(ds)"
              :aria-controls="treeDisclosureId('datasource', ds)"
              @click="toggleDatasource(ds)"
            >
              <IconChevronRight
                :size="12"
                class="datasource-chevron"
                :class="{ 'datasource-chevron--expanded': isDsExpanded(ds) }"
              />
              <IconDatabase :size="14" class="datasource-icon" />
              <span class="datasource-name">{{ ds }}</span>
              <span class="datasource-count">{{ getTableCountInDatasource(ds) }}</span>
            </button>

            <!-- 데이터소스 내 스키마들 (2레벨) -->
            <div
              v-if="isDsExpanded(ds)"
              :id="treeDisclosureId('datasource', ds)"
              class="datasource-schemas"
            >
              <div
                v-for="schema in getSchemasInDatasource(ds)"
                :key="`${ds}-${schema}`"
                class="schema-folder"
              >
                <!-- 스키마 헤더 (클릭 시 토글) -->
                <button
                  type="button"
                  class="schema-header"
                  :class="{ 'schema-header--expanded': isSchemaExpanded(ds, schema) }"
                  :aria-label="`${ds} ${schema} 스키마`"
                  :aria-expanded="isSchemaExpanded(ds, schema)"
                  :aria-controls="treeDisclosureId('schema', ds, schema)"
                  @click="toggleSchema(ds, schema)"
                >
                  <IconChevronRight
                    :size="12"
                    class="schema-chevron"
                    :class="{ 'schema-chevron--expanded': isSchemaExpanded(ds, schema) }"
                  />
                  <IconFolder :size="14" class="schema-icon" />
                  <span class="schema-name">{{ schema }}</span>
                  <span class="schema-count">{{ store.tablesByDatasource[ds]?.[schema]?.length || 0 }}</span>
                </button>

                <!-- 스키마 내 테이블 목록 (3레벨) -->
                <div
                  v-if="isSchemaExpanded(ds, schema)"
                  :id="treeDisclosureId('schema', ds, schema)"
                  class="schema-tables"
                >
                  <div
                    v-for="table in store.tablesByDatasource[ds]?.[schema] || []"
                    :key="tableIdentityKey(table)"
                    class="table-item"
                    :class="{ 'is-on-canvas': isOnCanvas(table), 'is-selected': isSelectedTable(table) }"
                    draggable="true"
                    :title="isOnCanvas(table) ? '캔버스에 있음' : '드래그로도 캔버스에 추가할 수 있습니다'"
                    @dragstart="(e) => startDragTable(e, table)"
                  >
                    <button
                      type="button"
                      class="table-item__primary"
                      :aria-label="isOnCanvas(table)
                        ? `${table.name} 테이블 선택`
                        : `${table.name} 테이블 캔버스에 추가`"
                      :aria-pressed="isOnCanvas(table) ? isSelectedTable(table) : undefined"
                      @click="activateCatalogTable(table)"
                    >
                      <IconTable :size="14" class="table-item__icon" />
                      <span class="table-item__name" :title="table.description || table.name">{{ table.name }}</span>
                      <span v-if="isOnCanvas(table)" class="table-item__on-dot" title="캔버스에 있음">●</span>
                      <span v-else class="table-item__add-hint" aria-hidden="true">＋</span>
                    </button>
                    <button
                      v-if="isOnCanvas(table)"
                      type="button"
                      class="table-item__remove"
                      :aria-label="`${table.name} 테이블 캔버스에서 제거`"
                      @click="store.removeTableFromCanvas(table)"
                    >×</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

    </aside>

    <button
      v-if="!props.hideTablePanel && mobileTablePanelOpen"
      type="button"
      class="mobile-table-panel-backdrop"
      aria-label="테이블 목록 닫기"
      @click="closeMobileTablePanel"
    />

    <!-- Main Canvas -->
    <main
      ref="canvasAreaRef"
      class="canvas-area"
      :class="{ 'drop-zone-active': isDragOver }"
      @drop="handleDrop"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
    >
      <div class="canvas-resource-alerts">
        <div v-if="batchError" class="resource-alert" role="alert">
          <span>테이블 묶음 추가에 실패했습니다: {{ batchError }}</span>
          <button
            v-if="failedBatchAttempt"
            type="button"
            :disabled="batchPending"
            @click="retryTableBatch"
          >{{ batchPending ? '다시 시도 중…' : '같은 테이블 묶음 다시 시도' }}</button>
          <button
            type="button"
            :disabled="batchPending"
            @click="dismissBatchError"
          >닫기</button>
        </div>
        <div v-if="dropError" class="resource-alert" role="alert">
          <span>테이블 드롭에 실패했습니다: {{ dropError }}</span>
          <button
            v-if="failedDropTarget"
            type="button"
            :disabled="dropPending"
            @click="retryDroppedTable"
          >{{ dropPending ? '다시 시도 중…' : '같은 테이블 다시 시도' }}</button>
          <button
            type="button"
            :disabled="dropPending"
            @click="dismissDropError"
          >닫기</button>
        </div>
        <div v-if="relationshipActionError" class="resource-alert">
          <span>릴레이션 작업에 실패했습니다: {{ relationshipActionError }}</span>
          <button type="button" @click="relationshipActionError = null">닫기</button>
        </div>
        <div v-if="store.relationshipLoadError" class="resource-alert">
          <span>릴레이션을 불러오지 못했습니다: {{ store.relationshipLoadError }}</span>
          <button type="button" @click="store.loadUserRelationships">다시 시도</button>
        </div>
        <div v-if="store.relatedTableLoadError" class="resource-alert">
          <span>
            {{ store.relatedTableLoadError.tableName }}의 관련 릴레이션을 불러오지 못했습니다:
            {{ store.relatedTableLoadError.message }}
          </span>
          <button
            type="button"
            @click="store.loadRelatedTables(store.relatedTableLoadError.table)"
          >다시 시도</button>
        </div>
        <div v-if="store.lastTableColumnError" class="resource-alert">
          <span>
            {{ store.lastTableColumnError.tableName }} 컬럼을 불러오지 못했습니다:
            {{ store.lastTableColumnError.message }} 다시 추가하거나 상세 패널에서 재시도하세요.
          </span>
          <button type="button" @click="store.clearLastTableColumnError">닫기</button>
        </div>
      </div>

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

      <!-- 캔버스 위 컨트롤 그룹 — 그래프 탭과 일관(좌상단 floating). 테이블 보기 + 논리/물리 토글 (spec 044) -->
      <div
        v-if="store.allTables.length > 0"
        ref="floatingControlsRef"
        class="floating-controls left-top"
      >
        <button
          v-if="!props.hideTablePanel"
          ref="mobileTablePanelTriggerRef"
          type="button"
          class="tv-btn mobile-table-panel-trigger"
          aria-controls="schema-table-panel"
          :aria-expanded="mobileTablePanelOpen"
          aria-label="테이블 목록 열기"
          @click="openMobileTablePanel"
        >
          <IconTable :size="14" />
          <span>테이블</span>
        </button>
        <!-- 논리/물리 토글 — 캔버스 노드 유무와 무관하게 상시 표시 -->
        <NameModeSwitch />
        <div class="table-view-control">
          <button
            class="tv-btn"
            :class="{ active: showTableViewMenu }"
            :disabled="store.loading"
            @click="showTableViewMenu = !showTableViewMenu"
          >
            <span class="tv-btn__label">{{ store.loading ? '로딩 중…' : '테이블 추가' }}</span>
            <span class="tv-btn__caret">▾</span>
          </button>
          <div v-if="showTableViewMenu" class="table-view-menu">
            <button
              v-if="store.tablesNotOnCanvas.length > 0"
              class="table-view-menu__item"
              @click="handleAddTopTables"
            >상위 10개</button>
            <button
              class="table-view-menu__item"
              :disabled="store.loading"
              @click="handleAddAllTables"
            >전체</button>
          </div>
        </div>
        <div class="floating-divider"></div>
        <!-- 비우기 — 상시 표시(캔버스 의존 X), 빈 캔버스에선 비활성 -->
        <button
          class="tv-btn tv-btn--danger"
          title="캔버스의 모든 테이블 비우기"
          :disabled="store.nodes.length === 0"
          @click="handleClearCanvas"
        >
          <IconTrash :size="13" />
          <span>비우기</span>
        </button>
      </div>
      <div v-if="showTableViewMenu" class="table-view-backdrop" @click="showTableViewMenu = false" />

      <!-- Canvas Toolbar -->
      <div
        v-if="store.nodes.length > 0"
        ref="canvasToolbarRef"
        class="canvas-toolbar"
      >
        <button class="canvas-toolbar__btn" @click="zoomIn()" title="Zoom In">
          <IconZoomIn :size="18" />
        </button>
        <button class="canvas-toolbar__btn" @click="zoomOut()" title="Zoom Out">
          <IconZoomOut :size="18" />
        </button>
        <button class="canvas-toolbar__btn" @click="fitCanvasView(0.3)" title="Fit View">
          <IconMaximize :size="18" />
        </button>
        <div class="canvas-toolbar__divider"></div>
        <button class="canvas-toolbar__btn" @click="store.updateEdgesFromRelationships()" title="릴레이션 새로고침">
          <IconLink :size="18" />
        </button>
      </div>

      <!-- Legend (숨김 가능) -->
      <div
        v-if="!props.hideLegend"
        ref="canvasLegendRef"
        class="canvas-legend"
        :class="{ 'canvas-legend--collapsed': legendCollapsed }"
      >
        <button type="button" class="legend-title legend-title--toggle" @click="legendCollapsed = !legendCollapsed" :title="legendCollapsed ? '범례 펼치기' : '범례 접기'">
          <span>메타데이터 출처</span>
          <IconChevronRight :size="14" class="legend-chevron" :class="{ 'is-open': !legendCollapsed }" />
        </button>
        <div v-show="!legendCollapsed" class="legend-body">

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

        <!-- 코드 분석 FK (점선, 하늘색) -->
        <label class="legend-item legend-item--checkbox">
          <input
            type="checkbox"
            :checked="store.fkVisibility.code"
            @change="store.toggleFkVisibility('code')"
            class="legend-checkbox"
          />
          <span class="legend-line legend-line--procedure"></span>
          <span class="legend-label">코드 분석</span>
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
        <!-- 카드 컬럼 표기 의미 (작은 카드는 마커로 표시 → 여기서 설명) -->
        <div class="legend-subtitle">카드 표기</div>
        <div class="legend-item legend-item--sym">
          <span class="legend-nn-star">*</span>
          <span class="legend-label">NOT NULL (필수 입력)</span>
        </div>

        <div class="legend-divider"></div>
        <div class="legend-tip">
          💡 컬럼 핸들을 드래그하여 릴레이션 연결
        </div>
        <div class="legend-tip">
          🖱️ 테이블 더블클릭으로 상세 편집
        </div>
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
          <CloseButton @click="store.closeSourceCodePanel()" />
        </div>
        <div class="source-panel-info">
          <span class="source-panel-procedure">{{ store.sourceCodePanel.procedureName }}</span>
          <span class="source-panel-line">Line {{ store.sourceCodePanel.highlightedLine }}</span>
        </div>
        <div class="source-panel-content" ref="sourceCodeContentRef">
          <div v-if="store.sourceCodePanel.notFound" class="source-empty">
            <span class="source-empty-icon">📄</span>
            <p class="source-empty-title">저장된 원문 코드가 없습니다</p>
            <p class="source-empty-desc">해당 노드에 code_text가 있는지 확인한 뒤 다시 분석해 주세요.</p>
          </div>
          <template v-else>
          <div v-if="store.sourceCodePanel.isLoadingStatements" class="source-loading">
            AI 설명 로딩 중...
          </div>
          <div
            v-else-if="store.sourceCodePanel.statementError"
            class="source-annotation-error"
            role="alert"
          >
            <span>{{ store.sourceCodePanel.statementError }}</span>
            <button type="button" @click="store.loadSourceStatements()">AI 설명 다시 시도</button>
          </div>
          <!-- 슬라이스된 노드 코드 — 표시 줄번호는 실제 파일 줄(startLine 오프셋) (spec 044) -->
          <template v-for="(line, index) in store.sourceCodePanel.fileContent.split('\n')" :key="index">
            <!-- Statement 시작 라인에 AI 설명 표시 (실제 줄 기준) -->
            <div
              v-if="getStatementForLine(store.sourceCodePanel.startLine + index)"
              class="source-ai-comment"
            >
              <div class="ai-comment-header">
                <span class="ai-comment-icon">🤖</span>
                <span class="ai-comment-type">{{ getStatementForLine(store.sourceCodePanel.startLine + index)?.statement_type }}</span>
              </div>
              <TextViewer
                class="ai-comment-text"
                :content="getStatementForLine(store.sourceCodePanel.startLine + index)?.summary || getStatementForLine(store.sourceCodePanel.startLine + index)?.ai_description || ''"
                :max-height="240"
                compact
              />
            </div>
            <!-- 코드 라인 -->
            <div
              class="source-line"
              :class="{
                'highlighted': store.sourceCodePanel.highlightedLine === store.sourceCodePanel.startLine + index,
                'has-statement': !!getStatementForLine(store.sourceCodePanel.startLine + index)
              }"
              :data-line="store.sourceCodePanel.startLine + index"
            >
              <span class="source-line-content">{{ line || ' ' }}</span>
            </div>
          </template>
          </template>
        </div>
      </aside>
    </Transition>

    <!-- Cardinality Modal -->
    <CardinalityModal
      :is-open="isCardinalityModalOpen"
      :connection="pendingConnection"
      :pending="isConnecting"
      :error="relationshipActionError"
      @close="handleCardinalityModalClose"
      @confirm="handleCardinalityConfirm"
    />

    <ActionDialog
      :open="isClearCanvasDialogOpen"
      dialog-id="clear-schema-canvas"
      title="캔버스 비우기"
      message="캔버스에 배치한 모든 테이블을 제거하시겠습니까? Catalog의 테이블이나 관계 데이터는 삭제되지 않습니다."
      confirm-label="캔버스 비우기"
      :pending="false"
      :error="null"
      @cancel="isClearCanvasDialogOpen = false"
      @confirm="confirmClearCanvas"
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

    <CatalogRelationshipDialog
      v-if="editingRelationship"
      :visible="isCatalogRelationshipDialogOpen"
      :relationship="editingRelationship"
      :deleting="isDeletingCatalogRelationship"
      :error="catalogRelationshipError"
      @close="closeCatalogRelationshipDialog"
      @delete="requestCatalogRelationshipDelete"
    />

    <ActionDialog
      :open="isCatalogDeleteConfirmOpen"
      dialog-id="delete-catalog-relationship"
      title="Catalog 관계 삭제"
      :message="editingRelationship
        ? `${editingRelationship.fromSchema}.${editingRelationship.sourceType}.${editingRelationship.sourceColumn} → ${editingRelationship.toSchema}.${editingRelationship.targetType}.${editingRelationship.targetColumn} 관계를 삭제하시겠습니까?`
        : ''"
      confirm-label="관계 삭제"
      pending-label="삭제 중…"
      :pending="isDeletingCatalogRelationship"
      :error="catalogRelationshipError"
      @cancel="isCatalogDeleteConfirmOpen = false; catalogRelationshipError = null"
      @confirm="deleteCatalogRelationship"
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
            <button class="refresh-btn" @click="store.queryTableData(store.tableDataPanel.tableName, store.tableDataPanel.schema, store.tableDataPanel.limit, store.tableDataPanel.datasource)" title="새로고침">
              <IconRefresh :size="14" />
            </button>
            <CloseButton @click="store.closeTableDataPanel()" />
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
            <CloseButton light @click="closeBehaviorResultPopup" />
          </div>

          <!-- React Agent 시도 타임라인 -->
          <div v-if="behaviorResultData?.attempts && behaviorResultData.attempts.length > 1" class="attempts-timeline">
            <div class="timeline-header">
              <span class="timeline-title">🔄 React Agent 실행 과정</span>
              <span class="timeline-summary">{{ behaviorResultData.attempts.length }}회 시도</span>
            </div>
            <div class="timeline-steps">
              <button
                v-for="(attempt, idx) in behaviorResultData.attempts"
                :key="idx"
                type="button"
                class="timeline-step"
                :class="{
                  'timeline-step--success': attempt.status === 'success',
                  'timeline-step--error': attempt.status === 'error',
                  'timeline-step--active': selectedAttemptIndex === idx
                }"
                :aria-pressed="selectedAttemptIndex === idx"
                :aria-label="`${attempt.attempt}차 시도 ${attempt.status === 'success' ? '성공' : attempt.status === 'error' ? '실패' : '대기'} 결과 보기`"
                @click="selectedAttemptIndex = idx"
              >
                <span class="step-number">{{ attempt.attempt }}</span>
                <span class="step-info">
                  <span class="step-status">
                    <span v-if="attempt.status === 'success'">✅ 성공</span>
                    <span v-else-if="attempt.status === 'error'">❌ 실패</span>
                    <span v-else>⏳ 대기</span>
                  </span>
                  <span v-if="attempt.error" class="step-error">{{ attempt.error.errorType }}: {{ attempt.error.error }}</span>
                </span>
                <span v-if="idx < behaviorResultData.attempts.length - 1" class="step-arrow" aria-hidden="true">
                  <span v-if="attempt.status === 'error'">🤖→</span>
                </span>
              </button>
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

<style src="./SchemaCanvas.global.css"></style>
<style scoped lang="scss" src="./SchemaCanvas.scss"></style>
