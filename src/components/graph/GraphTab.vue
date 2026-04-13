<script setup lang="ts">
/**
 * GraphTab.vue
 * 그래프 및 UML 다이어그램 탭 - 개선된 플로팅 UI
 */

import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useProjectStore } from '@/stores/project'
import { useSessionStore } from '@/stores/session'
import { useSchemaCanvasStore } from '@/stores/schemaCanvas'
import { storeToRefs } from 'pinia'
import NvlGraph from './NvlGraph.vue'
import NodeDetailPanel from './NodeDetailPanel.vue'
import GraphStylePanel from './GraphStylePanel.vue'
import VueFlowClassDiagram from './VueFlowClassDiagram.vue'
import SchemaView from '../text2sql/SchemaView.vue'
import { getClassName, getDirectory, CLASS_LABELS } from '@/utils/classDiagram'
import type { GraphNode, GraphLink } from '@/types'
import { useResize } from '@/composables/useResize'

const projectStore = useProjectStore()
const sessionStore = useSessionStore()
const schemaCanvasStore = useSchemaCanvasStore()
const {
  graphData,
  canvasGraphData,
  isProcessing,
  currentStep,
  sourceType,
  consoleMessages,
  graphEvents
} = storeToRefs(projectStore)

const MAX_SEARCH_RESULTS = 8

// activeView 는 session 스토어에 저장하여 MainLayout 에서 Navigator 노출 조건으로 활용한다.
const activeView = computed({
  get: () => sessionStore.graphActiveView,
  set: (v) => sessionStore.setGraphActiveView(v),
})
const showNodePanel = ref(false)
const showConsole = ref(false)
const showSearch = ref(false)
const progressPanelCollapsed = ref(false) // 진행 패널 축소 상태
const labelFilters = ref<string[]>([]) // 레전드 필터 (노드 라벨)

// 분석 패널 모드: 'docked' (왼쪽 고정), 'floating' (플로팅), 'hidden' (완전 숨김)
// 기본값은 hidden - 인제스천 시작 시에만 자동으로 표시됨
const analysisPanelMode = ref<'docked' | 'floating' | 'hidden'>('hidden')

// 인제스천 시작 시 그래프 뷰로 자동 전환 (분석 진행 상황을 볼 수 있도록)
watch(isProcessing, (newVal, oldVal) => {
  if (newVal && !oldVal) {
    // 인제스천이 시작되면 그래프 뷰로 전환
    activeView.value = 'graph'
    // 분석 패널도 표시
    if (analysisPanelMode.value === 'hidden') {
      analysisPanelMode.value = 'docked'
    }
  }
})

// 플로팅 모드용 위치
const floatingX = ref(20)
const floatingY = ref(80)
const isDraggingPanel = ref(false)
const dragOffset = ref({ x: 0, y: 0 })

// 플로팅 패널 드래그 시작
const startPanelDrag = (e: MouseEvent) => {
  if (analysisPanelMode.value !== 'floating') return
  isDraggingPanel.value = true
  dragOffset.value = {
    x: e.clientX - floatingX.value,
    y: e.clientY - floatingY.value
  }
  
  const onMouseMove = (e: MouseEvent) => {
    floatingX.value = e.clientX - dragOffset.value.x
    floatingY.value = e.clientY - dragOffset.value.y
  }
  
  const onMouseUp = () => {
    isDraggingPanel.value = false
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }
  
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

// 패널 모드 토글
const togglePanelMode = () => {
  if (analysisPanelMode.value === 'docked') {
    analysisPanelMode.value = 'floating'
  } else if (analysisPanelMode.value === 'floating') {
    analysisPanelMode.value = 'docked'
  }
}

// 패널 숨기기/보이기
const togglePanelVisibility = () => {
  if (analysisPanelMode.value === 'hidden') {
    analysisPanelMode.value = 'docked'
  } else {
    analysisPanelMode.value = 'hidden'
  }
}

// 진행 패널 리사이즈
const { value: progressPanelWidth, isResizing: isProgressResizing, startResize: startProgressResize } = useResize({
  direction: 'horizontal',
  initialValue: 340,
  min: 280,
  max: 500,
  fromEnd: true
})

// 노드 패널 리사이즈 (기본 폭 확대)
const { value: panelWidth, isResizing: isPanelResizing, startResize: startPanelResize } = useResize({
  direction: 'horizontal',
  initialValue: 500,
  min: 300,
  max: 800,
  fromEnd: true
})

const searchQuery = ref('')
const selectedNode = ref<GraphNode | null>(null)
const selectedRelationship = ref<GraphLink | null>(null)
const selectedNodeType = ref<string | null>(null)
const selectedRelType = ref<string | null>(null)
const stylePanelTop = ref<number>(0)
/** 현재 스타일 패널이 노드용인지 관계용인지 */
const stylePanelCategory = ref<'node' | 'relationship'>('node')
const nvlGraphRef = ref<InstanceType<typeof NvlGraph> | null>(null)
const selectedClasses = ref<Array<{ className: string; directory: string }>>([])

// UML 깊이 설정 (UML 뷰 전용)
const umlDepth = ref(3)
try {
  const savedUmlDepth = localStorage.getItem('umlDepth')
  if (savedUmlDepth) {
    const parsed = parseInt(savedUmlDepth)
    if (!isNaN(parsed)) umlDepth.value = parsed
  }
} catch (e) {
  console.warn('localStorage 접근 실패:', e)
}

function handleUmlDepthChange(event: Event) {
  const customEvent = event as CustomEvent
  umlDepth.value = customEvent.detail
}

onMounted(() => {
  window.addEventListener('umlDepthChange', handleUmlDepthChange)

  // Graph 탭 진입 시 Navigator 자동 오픈 (VSCode Explorer 스타일)
  sessionStore.setNavigatorPanelOpen(true)

  // 상단 검색에서 전달된 스키마 검색어 처리
  const pendingQuery = sessionStore.consumeSchemaSearch()
  if (pendingQuery) {
    activeView.value = 'schema'
    schemaCanvasStore.searchQuery = pendingQuery
    schemaCanvasStore.performSemanticSearch(pendingQuery)
  }
})

onUnmounted(() => {
  window.removeEventListener('umlDepthChange', handleUmlDepthChange)
})

const statusType = computed(() => {
  if (!currentStep.value) return 'idle'
  const step = currentStep.value.toLowerCase()
  if (step.includes('에러') || step.includes('실패') || step.includes('error')) return 'error'
  if (step.includes('완료') || step.includes('complete')) return 'success'
  if (isProcessing.value) return 'processing'
  return 'idle'
})

// 그래프 통계
const graphStats = computed(() => {
  const nodes = graphEvents.value?.filter(e => e.type === 'node') || []
  const rels = graphEvents.value?.filter(e => e.type === 'relationship') || []
  
  const nodeTypes: Record<string, number> = {}
  nodes.forEach(n => {
    const type = n.nodeType || 'Unknown'
    nodeTypes[type] = (nodeTypes[type] || 0) + 1
  })
  
  const relTypes: Record<string, number> = {}
  rels.forEach(r => {
    const type = r.relType || 'Unknown'
    relTypes[type] = (relTypes[type] || 0) + 1
  })
  
  return {
    totalNodes: nodes.length,
    totalRels: rels.length,
    nodeTypes,
    relTypes
  }
})

// 캔버스(NvlGraph)에 표시 중인 그래프가 있는지
const hasGraph = computed(() => canvasGraphData.value.nodes.length > 0)
// 프로젝트 전체에 로드된 데이터가 있는지 (Navigator에서 탐색 가능한지)
const hasAnyData = computed(() => (graphData.value?.nodes.length ?? 0) > 0)
const showUmlTab = computed(() => sourceType.value === 'java' || sourceType.value === 'python')
const showSchemaTab = computed(() => true) // 스키마 탭은 항상 활성화

// 로그가 있을 때 자동으로 콘솔 표시
watch(consoleMessages, (messages) => {
  if (messages.length > 0 && !showConsole.value) {
    showConsole.value = true
  }
}, { immediate: true })

const filteredNodes = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!graphData.value || !query) return []
  
  return graphData.value.nodes.filter(node => {
    const labels = node.labels || []
    if (!labels.some(label => CLASS_LABELS.includes(label))) return false
    
    const name = ((node.properties?.name as string) || '').toLowerCase()
    const className = ((node.properties?.class_name as string) || '').toLowerCase()
    
    return name.includes(query) || className.includes(query)
  })
})

/** 스타일 패널 상태 초기화 */
function resetStylePanel(): void {
  selectedNodeType.value = null
  selectedRelType.value = null
  stylePanelTop.value = 0
}

function handleNodeSelect(node: GraphNode | null): void {
  selectedNode.value = node
  selectedRelationship.value = null
  resetStylePanel()
  if (node) showNodePanel.value = true
}

/**
 * 검색 결과에서 노드 선택 시 처리 — 캔버스에 해당 노드 + 1-hop 이웃 표시.
 */
function handleNodeSearchSelect(node: GraphNode): void {
  selectedNode.value = node
  selectedRelationship.value = null
  resetStylePanel()
  showNodePanel.value = true
  projectStore.expandNodeOnCanvas(node.id)
}

function handleRelationshipSelect(relationship: GraphLink | null): void {
  selectedRelationship.value = relationship
  selectedNode.value = null
  resetStylePanel()
  if (relationship) showNodePanel.value = true
}

function handleNodeTypeSelect(nodeType: string, topOffset: number): void {
  selectedNodeType.value = nodeType
  selectedRelType.value = null
  selectedNode.value = null
  stylePanelCategory.value = 'node'
  stylePanelTop.value = topOffset
  showNodePanel.value = true
}

function handleRelTypeSelect(relType: string, topOffset: number): void {
  selectedRelType.value = relType
  selectedNodeType.value = null
  selectedNode.value = null
  stylePanelCategory.value = 'relationship'
  stylePanelTop.value = topOffset
  showNodePanel.value = true
}

function handleStylePanelClose(): void {
  resetStylePanel()
}

function handleSearchSelect(node: GraphNode): void {
  selectedRelationship.value = null
  resetStylePanel()
  selectedNode.value = node
  showNodePanel.value = true
  
  const directory = getDirectory(node)
  const className = getClassName(node)
  
  if (!className) return
  
  if (activeView.value === 'uml') {
    const exists = selectedClasses.value.some(
      c => c.className === className && c.directory === directory
    )
    if (!exists) {
      selectedClasses.value = [...selectedClasses.value, { className, directory }]
    }
  }
  
  searchQuery.value = ''
  showSearch.value = false
}

function handleVueFlowClassClick(nodeId: string): void {
  // 클릭한 노드의 ID로 직접 찾기 (우회 없이)
  const node = graphData.value?.nodes.find(n => n.id === nodeId)
  if (node) {
    selectedNode.value = node
    selectedRelationship.value = null
    resetStylePanel()
    showNodePanel.value = true
  }
}

function handleVueFlowClassExpand(className: string, directory: string): void {
  const exists = selectedClasses.value.some(
    c => c.className === className && c.directory === directory
  )
  if (!exists) {
    selectedClasses.value = [...selectedClasses.value, { className, directory }]
  }
}

function clearSelectedClasses(): void {
  selectedClasses.value = []
}

function removeSelectedClass(className: string, directory: string): void {
  selectedClasses.value = selectedClasses.value.filter(
    c => !(c.className === className && c.directory === directory)
  )
}

function handleStyleUpdated(): void {
  nvlGraphRef.value?.updateAllStyles()
}

/**
 * 레전드 필터 핸들러 (토글 방식)
 */
function handleLabelFilter(label: string): void {
  const index = labelFilters.value.indexOf(label)
  if (index === -1) {
    // 필터에 추가
    labelFilters.value = [...labelFilters.value, label]
  } else {
    // 필터에서 제거
    labelFilters.value = labelFilters.value.filter(l => l !== label)
  }
}

/**
 * 모든 필터 초기화
 */
function handleClearFilters(): void {
  labelFilters.value = []
}

/**
 * 캔버스 초기화 (필터 + 표시된 노드 모두 비우기).
 */
function handleResetGraph(): void {
  selectedNode.value = null
  selectedRelationship.value = null
  labelFilters.value = []
  projectStore.clearCanvas()
}

/**
 * 캔버스에서 노드 제거 (원본 nodeMap 은 유지).
 */
function handleNodeRemoveFromCanvas(nodeId: string): void {
  projectStore.removeFromCanvas(nodeId)
  if (selectedNode.value?.id === nodeId) {
    selectedNode.value = null
  }
}

/**
 * Navigator 트리에서 노드를 드래그-드롭 → 1-hop 이웃까지 캔버스에 추가.
 */
function handleNodeDrop(payload: { nodeId: string }): void {
  if (!payload?.nodeId) return
  projectStore.expandNodeOnCanvas(payload.nodeId)
}

watch(hasGraph, (has, prev) => {
  if (has && !prev) showNodePanel.value = true
})


</script>

<template>
  <div class="graph-tab">
    <!-- 패널 열기 버튼 (숨김 상태일 때) -->
    <button 
      v-if="activeView !== 'schema' && analysisPanelMode === 'hidden'"
      class="panel-show-btn"
      @click="togglePanelVisibility"
      title="분석 패널 열기"
    >
      <span class="btn-icon">📊</span>
      <span class="btn-label">분석</span>
    </button>
    
    <!-- 왼쪽 통합 분석 패널 (Graph/UML 모드에서만 표시) -->
    <div 
      v-if="activeView !== 'schema' && analysisPanelMode !== 'hidden'"
      class="analysis-panel"
      :class="{ 
        collapsed: progressPanelCollapsed, 
        floating: analysisPanelMode === 'floating',
        dragging: isDraggingPanel
      }"
      :style="analysisPanelMode === 'floating' 
        ? { width: `${progressPanelWidth}px`, left: `${floatingX}px`, top: `${floatingY}px` }
        : { width: progressPanelCollapsed ? '48px' : `${progressPanelWidth}px` }"
    >
      <!-- 리사이즈 핸들 -->
      <div 
        v-if="!progressPanelCollapsed"
        class="panel-resize-handle"
        :class="{ resizing: isProgressResizing }"
        @mousedown="startProgressResize"
      ></div>
      
      <!-- 축소 상태 (docked 모드에서만) -->
      <div v-if="progressPanelCollapsed && analysisPanelMode === 'docked'" class="collapsed-content" @click="progressPanelCollapsed = false">
        <div class="collapsed-indicator" :class="statusType">
          <span class="spinner-mini" v-if="isProcessing"></span>
          <span v-else>✓</span>
        </div>
        <span class="collapsed-label">분석</span>
        <span class="collapsed-count">{{ consoleMessages.length }}</span>
      </div>
      
      <!-- 확장 상태 -->
      <template v-if="!progressPanelCollapsed || analysisPanelMode === 'floating'">
        <!-- 헤더 (드래그 가능) -->
        <div 
          class="panel-header"
          :class="{ draggable: analysisPanelMode === 'floating' }"
          @mousedown="analysisPanelMode === 'floating' && startPanelDrag($event)"
        >
          <div class="header-title">
            <span class="overview-icon">🔍</span>
            <span>그래프 오버뷰</span>
          </div>
          <div class="header-actions">
            <!-- 플로팅/고정 토글 -->
            <button 
              class="mode-btn" 
              @click.stop="togglePanelMode" 
              :title="analysisPanelMode === 'floating' ? '왼쪽에 고정' : '플로팅 모드'"
            >
              <span v-if="analysisPanelMode === 'floating'">📌</span>
              <span v-else>🪟</span>
            </button>
            <!-- 완전 숨기기 -->
            <button 
              class="hide-btn" 
              @click.stop="togglePanelVisibility" 
              title="패널 숨기기"
            >
              ✕
            </button>
            <!-- 최소화 (docked 모드에서만) -->
            <button 
              v-if="analysisPanelMode === 'docked'"
              class="collapse-btn" 
              @click.stop="progressPanelCollapsed = true" 
              title="최소화"
            >
              ‹
            </button>
          </div>
        </div>
        
        <!-- 오버뷰 통계 헤더 -->
        <div class="overview-stats-header">
          <div class="stat-item">
            <span class="stat-icon">📦</span>
            <span class="stat-value">{{ graphStats.totalNodes }}</span>
            <span class="stat-label">노드</span>
          </div>
          <div class="stat-item">
            <span class="stat-icon">🔗</span>
            <span class="stat-value">{{ graphStats.totalRels }}</span>
            <span class="stat-label">관계</span>
          </div>
        </div>
        
        <!-- 오버뷰 내용 (노드 필터링 - 항상 표시) -->
        <div class="tab-content overview-content">
          <NodeDetailPanel
            :node="null"
            :relationship="null"
            :nodeStats="nvlGraphRef?.nodeStats"
            :relationshipStats="nvlGraphRef?.relationshipStats"
            :totalNodes="graphData?.nodes.length || 0"
            :totalRelationships="graphData?.links.length || 0"
            :isProcessing="isProcessing"
            :activeFilters="labelFilters"
            :allNodes="graphData?.nodes || []"
            @node-type-select="handleNodeTypeSelect"
            @relationship-type-select="handleRelTypeSelect"
            @style-updated="handleStyleUpdated"
            @label-filter="handleLabelFilter"
            @clear-filters="handleClearFilters"
            @node-select="handleNodeSearchSelect"
            @reset-graph="handleResetGraph"
          />
        </div>
      </template>
    </div>
    
    <!-- 메인 콘텐츠 -->
    <div class="content-area">
      <div class="view-container" v-show="activeView === 'graph'">
        <!-- 캔버스는 항상 마운트 — drop 이벤트를 받아야 하므로 v-if 로 제거하지 않음 -->
        <NvlGraph
          ref="nvlGraphRef"
          :graphData="canvasGraphData"
          :selectedNodeId="selectedNode?.id"
          :selectedRelationshipId="selectedRelationship?.id"
          :labelFilters="labelFilters"
          @node-select="handleNodeSelect"
          @relationship-select="handleRelationshipSelect"
          @node-delete="handleNodeRemoveFromCanvas"
          @node-drop="handleNodeDrop"
        />
        <!-- 빈 상태 오버레이 -->
        <div v-if="!hasGraph" class="empty-state empty-overlay">
          <template v-if="!hasAnyData">
            <div class="empty-icon">📈</div>
            <h3>그래프 데이터가 없습니다</h3>
            <p>업로드 탭에서 파일을 업로드하고 분석을 실행하세요</p>
          </template>
          <template v-else>
            <div class="empty-icon">🗂️</div>
            <h3>Navigator에서 노드를 드래그하세요</h3>
            <p>좌측 Navigator 트리의 노드를 캔버스에 놓으면 1-hop 이웃이 함께 표시됩니다</p>
          </template>
        </div>
      </div>
      
      <div class="view-container" v-show="activeView === 'uml'">
        <VueFlowClassDiagram
          :graph-nodes="graphData?.nodes || []"
          :graph-links="graphData?.links || []"
          :selected-classes="selectedClasses"
          :depth="umlDepth"
          @class-click="handleVueFlowClassClick"
          @class-expand="handleVueFlowClassExpand"
          @relationship-select="handleRelationshipSelect"
        />
      </div>
      
      <div class="view-container" v-show="activeView === 'schema'">
        <SchemaView />
      </div>
      
      <!-- 플로팅: 우측 패널 토글 (그래프 뷰에서만) -->
      <button 
        v-if="!showNodePanel && (activeView === 'graph' || activeView === 'uml')"
        class="panel-toggle right"
        @click="showNodePanel = !showNodePanel"
      >
        ‹
      </button>
    </div>
    
    <!-- 플로팅: 좌측 상단 컨트롤 -->
    <div class="floating-controls left-top">
      <div class="view-switcher">
        <button 
          :class="{ active: activeView === 'schema', disabled: !showSchemaTab }"
          :disabled="!showSchemaTab"
          @click="activeView = 'schema'"
        >
          스키마
        </button>
        <button 
          :class="{ active: activeView === 'uml', disabled: !showUmlTab }"
          :disabled="!showUmlTab"
          @click="activeView = 'uml'"
        >
          UML
        </button>
        <button 
          :class="{ active: activeView === 'graph' }"
          @click="activeView = 'graph'"
        >
          Graph
        </button>
      </div>
      
      <template v-if="activeView === 'uml'">
        <button class="control-btn" @click="showSearch = !showSearch" title="클래스 명 검색">
          🔍
        </button>
      </template>
      
      <div class="search-panel" v-if="showSearch && activeView === 'uml'">
        <input 
          v-model="searchQuery"
          placeholder="클래스 명 검색..."
          @keyup.escape="showSearch = false"
          autofocus
        />
        <div class="search-results" v-if="searchQuery && filteredNodes.length > 0">
          <button 
            v-for="node in filteredNodes.slice(0, MAX_SEARCH_RESULTS)" 
            :key="node.id"
            @click="handleSearchSelect(node)"
          >
            <span class="tag">{{ node.labels?.join(' / ') || 'Unknown' }}</span>
            <span class="node-info">
              <span class="node-name">{{ node.properties?.name || node.properties?.class_name || node.id }}</span>
              <span class="node-dir" v-if="getDirectory(node)">{{ getDirectory(node) }}</span>
            </span>
          </button>
        </div>
      </div>
      
      <div class="selected-tags" v-if="activeView === 'uml' && selectedClasses.length > 0">
        <span v-for="cls in selectedClasses" :key="`${cls.directory}::${cls.className}`" class="tag">
          {{ cls.className }}
          <button @click="removeSelectedClass(cls.className, cls.directory)">✕</button>
        </span>
        <button class="clear-btn" @click="clearSelectedClasses">지우기</button>
      </div>
      
    </div>
    
    <!-- 플로팅: 노드 패널 -->
    <!-- 노드 상세 패널 (그래프 뷰에서만 표시) -->
    <Transition name="slide-right">
      <div 
        class="floating-panel right" 
        v-if="showNodePanel && (activeView === 'graph' || activeView === 'uml')"
        :style="{ width: `${panelWidth}px` }"
      >
        <div class="panel-header">
          <span>{{ selectedNode ? 'Node' : selectedRelationship ? 'Relationship' : 'Overview' }}</span>
          <button @click="showNodePanel = false">›</button>
        </div>
        <div class="panel-body">
          <NodeDetailPanel
            :node="selectedNode"
            :relationship="selectedRelationship"
            :nodeStats="nvlGraphRef?.nodeStats"
            :relationshipStats="nvlGraphRef?.relationshipStats"
            :totalNodes="graphData?.nodes.length || 0"
            :totalRelationships="graphData?.links.length || 0"
            :isProcessing="isProcessing"
            :activeFilters="labelFilters"
            :allNodes="graphData?.nodes || []"
            @node-type-select="handleNodeTypeSelect"
            @relationship-type-select="handleRelTypeSelect"
            @style-updated="handleStyleUpdated"
            @label-filter="handleLabelFilter"
            @clear-filters="handleClearFilters"
            @node-select="handleNodeSearchSelect"
            @reset-graph="handleResetGraph"
          />
        </div>
        <!-- 리사이즈 핸들 -->
        <div 
          class="panel-resize-handle"
          :class="{ resizing: isPanelResizing }"
          @mousedown="startPanelResize"
        ></div>
        
        <!-- 그래프 요소 스타일 설정 패널 (노드/관계 공통) -->
        <Transition name="fade">
          <div
            v-if="selectedNodeType || selectedRelType"
            class="style-panel-wrapper"
            :style="{ top: `${stylePanelTop}px` }"
          >
            <GraphStylePanel
              :category="stylePanelCategory"
              :elementType="selectedNodeType || selectedRelType"
              @style-updated="handleStyleUpdated"
              @close="handleStylePanelClose"
            />
          </div>
        </Transition>
      </div>
    </Transition>
    
  </div>
</template>

<style lang="scss" scoped>
// ============================================================================
// 기본 레이아웃 (명확한 구분)
// ============================================================================

.graph-tab {
  flex: 1;
  display: flex;
  position: relative;
  overflow: hidden;
  background: var(--color-bg);
}

.content-area {
  flex: 1;
  display: flex;
  position: relative;
}

.view-container {
  position: absolute;
  inset: 0;
  background: var(--color-canvas-bg);
  overflow: visible;
}

// ============================================================================
// 노드 스타일 설정 패널
// ============================================================================

.style-panel-wrapper {
  position: absolute;
  right: 100%;
  top: 0;
  margin-right: 12px;
  z-index: 1000;
  pointer-events: none;
  transform: translateY(-50%);
  
  > * {
    pointer-events: auto;
  }
}

// ============================================================================
// 빈 상태
// ============================================================================

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-light);

  .empty-icon {
    font-size: 48px;
    margin-bottom: 12px;
    opacity: 0.5;
  }

  h3 {
    font-size: 16px;
    color: var(--color-text-bright);
    margin-bottom: 6px;
    font-weight: 600;
  }

  p {
    font-size: 13px;
    color: var(--color-text-muted);
  }
}

/** NvlGraph 위에 떠있는 안내 오버레이 (pointer-events: none 으로 drop 이벤트 통과) */
.empty-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: transparent;
  text-align: center;
  padding: 0 24px;
}

// ============================================================================
// 플로팅 좌측 상단 컨트롤 (명확한 구분)
// ============================================================================

.floating-controls {
  position: absolute;
  top: 8px;
  left: 8px;
  right: 50px;
  display: flex;
  align-items: center;
  gap: 6px;
  z-index: 100;
}

.view-switcher {
  display: flex;
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  overflow: hidden;
  border: 1px solid var(--color-border);
  gap: 4px;
  padding: 4px;
  
  button {
    padding: 6px 16px;
    font-size: 13px;
    font-weight: 500;
    background: transparent;
    border: none;
    color: var(--color-text-light);
    cursor: pointer;
    transition: all 0.2s ease;
    border-radius: var(--radius-sm);
    
    &:hover:not(.disabled) {
      background: var(--color-bg-tertiary);
      color: var(--color-text);
    }
    
    &.active {
      background: var(--color-bg-tertiary);
      color: var(--color-text-bright);
      font-weight: 600;
      box-shadow: var(--shadow-sm);
    }
    
    &.disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  }
}

.control-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 10px;
  height: 32px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-light);
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  
  &:hover {
    background: var(--color-bg-tertiary);
    border-color: var(--color-text-muted);
    color: var(--color-text);
  }
}


// ============================================================================
// 검색 패널
// ============================================================================

.search-panel {
  position: relative;
  
  input {
    width: 200px;
    height: 32px;
    padding: 0 10px;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-size: 12px;
    color: var(--color-text-bright);
    box-shadow: var(--shadow-md);
    
    &:focus {
      outline: none;
      border-color: var(--color-accent);
      box-shadow: 0 0 0 3px rgba(34, 139, 230, 0.15);
    }
    
    &::placeholder {
      color: var(--color-text-muted);
    }
  }
  
  .search-results {
    position: absolute;
    top: 100%;
    left: 0;
    width: 320px;
    margin-top: 4px;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-lg);
    max-height: 280px;
    overflow-y: auto;
    
    button {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      width: 100%;
      padding: 10px 12px;
      background: transparent;
      border: none;
      text-align: left;
      font-size: 12px;
      color: var(--color-text);
      cursor: pointer;
      border-bottom: 1px solid var(--color-border);
      
      &:last-child {
        border-bottom: none;
      }
      
      &:hover {
        background: var(--color-bg-tertiary);
      }
      
      .tag {
        font-size: 10px;
        padding: 2px 6px;
        background: var(--color-accent);
        color: white;
        border-radius: var(--radius-sm);
        font-weight: 600;
        flex-shrink: 0;
        margin-top: 2px;
      }
      
      .node-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
        flex: 1;
        
        .node-name {
          font-weight: 500;
          color: var(--color-text-bright);
        }
        
        .node-dir {
          font-size: 10px;
          color: var(--color-text-light);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      }
    }
  }
}


// ============================================================================
// 선택된 클래스 태그
// ============================================================================

.selected-tags {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  max-width: 280px;
  
  .tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: var(--color-accent);
    color: white;
    border-radius: var(--radius-sm);
    font-size: 11px;
    font-weight: 500;
    
    button {
      width: 14px;
      height: 14px;
      background: rgba(255, 255, 255, 0.2);
      border: none;
      border-radius: 50%;
      color: white;
      font-size: 9px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      
      &:hover {
        background: rgba(255, 255, 255, 0.4);
      }
    }
  }
  
  .clear-btn {
    padding: 4px 8px;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-size: 10px;
    color: var(--color-text-light);
    cursor: pointer;
    
    &:hover {
      background: rgba(250, 82, 82, 0.15);
      border-color: var(--color-error);
      color: var(--color-error);
    }
  }
}

// ============================================================================
// 패널 토글 버튼
// ============================================================================

.panel-toggle {
  position: absolute;
  top: 8px;
  width: 32px;
  height: 32px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-light);
  cursor: pointer;
  z-index: 100;
  transition: all 0.15s;
  box-shadow: var(--shadow-md);
  display: flex;
  align-items: center;
  justify-content: center;
  
  &.right {
    right: 8px;
    border-radius: var(--radius-sm);
  }
  
  &:hover {
    background: var(--color-bg-tertiary);
    color: var(--color-text-bright);
    border-color: var(--color-text-light);
    box-shadow: var(--shadow-lg);
  }
}

// ============================================================================
// 리사이즈 핸들 공통 스타일
// ============================================================================

@mixin resize-handle-base {
  background: transparent;
  transition: background 0.15s;
  z-index: 10;
  
  &:hover {
    background: var(--color-border);
  }
  
  &.resizing {
    background: var(--color-text-light);
  }
}

// ============================================================================
// 플로팅 노드 패널
// ============================================================================

.floating-panel {
  position: absolute;
  top: 0;
  bottom: 0;
  height: 100%;
  min-height: 200px;
  background: var(--color-bg-secondary);
  border-left: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  z-index: 90;
  box-shadow: var(--shadow-lg);
  
  &.right {
    right: 0;
  }
  
  .panel-resize-handle {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    cursor: col-resize;
    @include resize-handle-base;
  }
  
  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    background: var(--color-bg-tertiary);
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
    
    span {
      font-size: 12px;
      font-weight: 600;
      color: var(--color-text-bright);
    }
    
    button {
      width: 24px;
      height: 24px;
      background: transparent;
      border: none;
      color: var(--color-text-light);
      cursor: pointer;
      border-radius: var(--radius-sm);
      font-size: 16px;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      
      &:hover {
        background: var(--color-bg-elevated);
        color: var(--color-text-bright);
      }
    }
  }
  
  .panel-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 8px;
    
    // 스크롤바 스타일링
    &::-webkit-scrollbar {
      width: 6px;
    }
    
    &::-webkit-scrollbar-track {
      background: var(--color-bg-tertiary);
      border-radius: 3px;
    }
    
    &::-webkit-scrollbar-thumb {
      background: var(--color-border);
      border-radius: 3px;
      
      &:hover {
        background: var(--color-text-light);
      }
    }
  }
}

// ============================================================================
// 콘솔 토글 버튼
// ============================================================================

.console-toggle-btn {
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text);
  cursor: pointer;
  box-shadow: var(--shadow-md);
  z-index: 100;
  transition: all 0.15s;
  
  &:hover {
    background: var(--color-bg-tertiary);
    box-shadow: var(--shadow-lg);
  }
  
  
  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-text-muted);
  }
  
  &.processing .status-dot {
    background: var(--color-accent);
    animation: pulse 1.5s infinite;
  }
  
  &.error .status-dot {
    background: var(--color-error);
  }
  
  &.success .status-dot {
    background: var(--color-success);
  }
  
  .count {
    padding: 2px 6px;
    background: var(--color-accent);
    color: white;
    border-radius: 8px;
    font-size: 10px;
    font-weight: 600;
  }
  
  .arrow {
    font-size: 10px;
    color: var(--color-text-muted);
  }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

// ============================================================================
// 왼쪽 통합 분석 패널
// ============================================================================

// 패널 열기 버튼 (숨김 상태일 때)
.panel-show-btn {
  position: absolute;
  left: 8px;
  top: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: var(--shadow-md);
  z-index: 100;
  transition: all 0.15s ease;
  
  &:hover {
    background: var(--color-bg-tertiary);
    box-shadow: var(--shadow-lg);
  }
  
  .btn-icon {
    font-size: 14px;
  }
}

.analysis-panel {
  position: relative;
  height: 100%;
  background: var(--color-bg-secondary);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow: hidden;
  transition: width 0.2s ease;
  
  &.collapsed {
    cursor: pointer;
    
    &:hover {
      background: var(--color-bg-tertiary);
    }
  }
  
  // 플로팅 모드
  &.floating {
    position: absolute;
    left: 20px;
    top: 80px;
    height: auto;
    max-height: calc(100% - 100px);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    z-index: 200;
    
    &.dragging {
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      opacity: 0.95;
    }
    
    .panel-header {
      cursor: grab;
      
      &:active {
        cursor: grabbing;
      }
    }
  }
  
  .panel-resize-handle {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    cursor: col-resize;
    @include resize-handle-base;
  }
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
  
  &.draggable {
    cursor: grab;
    user-select: none;
    
    &:active {
      cursor: grabbing;
    }
  }
}

.mode-btn,
.hide-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-light);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  
  &:hover {
    background: var(--color-bg);
    border-color: var(--color-accent);
    color: var(--color-accent);
  }
}

.hide-btn {
  &:hover {
    border-color: var(--color-error);
    color: var(--color-error);
  }
}

.panel-tabs {
  display: flex;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.panel-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 12px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--color-text-light);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  
  &:hover {
    background: var(--color-bg-tertiary);
    color: var(--color-text);
  }
  
  &.active {
    color: var(--color-accent);
    border-bottom-color: var(--color-accent);
    background: rgba(34, 139, 230, 0.08);
  }
  
  .tab-icon {
    font-size: 14px;
  }
  
  .tab-badge {
    background: var(--color-accent);
    color: white;
    font-size: 10px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 10px;
    min-width: 18px;
  }
}

.tab-content {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.progress-content {
  display: flex;
  flex-direction: column;
}

.console-content {
  display: flex;
  flex-direction: column;
}

.overview-content {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  
  :deep(.node-detail-panel) {
    height: 100%;
    border: none;
    border-radius: 0;
    box-shadow: none;
  }
}

.console-messages {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  font-family: var(--font-mono);
  font-size: 11px;
  
  .log-item {
    display: flex;
    gap: 8px;
    padding: 4px 6px;
    border-radius: var(--radius-sm);
    margin-bottom: 2px;
    
    &:hover {
      background: var(--color-bg-tertiary);
    }
    
    &.error {
      color: var(--color-error);
      background: rgba(250, 82, 82, 0.1);
    }
    
    &.graph {
      color: var(--color-accent);
    }
    
    .time {
      color: var(--color-text-muted);
      flex-shrink: 0;
    }
    
    .text {
      color: var(--color-text);
      word-break: break-all;
    }
  }
  
  .log-empty {
    padding: 20px;
    text-align: center;
    color: var(--color-text-muted);
    font-style: italic;
  }
}

.collapsed-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 8px;
}

.collapsed-indicator {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: white;
  
  &.processing {
    background: var(--color-accent);
  }
  
  &.success {
    background: var(--color-success);
  }
  
  &.error {
    background: var(--color-error);
  }
  
  &.idle {
    background: var(--color-text-muted);
  }
}

.collapsed-label {
  writing-mode: vertical-rl;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-light);
}

.collapsed-count {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-accent);
}

.progress-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
  
  &.draggable {
    cursor: grab;
    user-select: none;
    
    &:active {
      cursor: grabbing;
    }
  }
}

.drag-handle {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  font-size: 10px;
  letter-spacing: -2px;
  opacity: 0.6;
  transition: opacity 0.2s;
  
  &:hover {
    opacity: 1;
    color: var(--color-text-light);
  }
  
  .drag-dots {
    line-height: 1;
  }
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-bright);
  flex: 1;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.pause-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-light);
  font-size: 10px;
  cursor: pointer;
  transition: all 0.15s ease;
  
  &:hover {
    background: var(--color-bg);
    border-color: var(--color-accent);
    color: var(--color-accent);
  }
  
  &.paused {
    background: rgba(var(--accent-rgb), 0.15);
    border-color: var(--color-accent);
    color: var(--color-accent);
    
    &:hover {
      background: rgba(var(--accent-rgb), 0.25);
    }
  }
}

.paused-icon {
  font-size: 10px;
  color: var(--color-warning);
}

.status-indicator {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  
  &.processing {
    background: var(--color-accent);
  }
  
  &.success {
    background: var(--color-success);
  }
  
  &.error {
    background: var(--color-error);
  }
}

.spinner-mini {
  width: 12px;
  height: 12px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.collapse-btn {
  width: 24px;
  height: 24px;
  background: transparent;
  border: none;
  color: var(--color-text-light);
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  
  &:hover {
    background: var(--color-bg-elevated);
    color: var(--color-text-bright);
  }
}

.progress-bar-section {
  padding: 12px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
  
  &.paused {
    background: rgba(245, 158, 11, 0.08);
  }
}

.progress-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.step-label {
  font-size: 11px;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}

.progress-percent {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-accent);
}

.progress-track {
  height: 4px;
  background: var(--color-bg-tertiary);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--color-accent) 0%, var(--color-accent-hover) 100%);
  border-radius: 2px;
  transition: width 0.3s ease;
  
  &.completed {
    background: linear-gradient(90deg, var(--color-success) 0%, #4ade80 100%);
  }
  
  &.paused {
    background: linear-gradient(90deg, var(--color-warning) 0%, #f59e0b 100%);
    animation: pulse-glow 1.5s ease-in-out infinite;
  }
}

@keyframes pulse-glow {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.stats-row,
.overview-stats-header {
  display: flex;
  gap: 16px;
  padding: 10px 12px;
  background: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.overview-icon {
  margin-right: 4px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.stat-icon {
  font-size: 12px;
}

.stat-value {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text-bright);
}

.stat-label {
  font-size: 10px;
  color: var(--color-text-muted);
}

.event-stream {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  min-height: 0;
  
  &::-webkit-scrollbar {
    width: 4px;
  }
  
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  
  &::-webkit-scrollbar-thumb {
    background: var(--color-border);
    border-radius: 2px;
  }
}

.event-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.event-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  animation: eventSlideIn 0.2s ease;
  
  &:hover {
    background: var(--color-bg-tertiary);
  }
}

@keyframes eventSlideIn {
  from {
    opacity: 0;
    transform: translateX(-8px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.event-item-enter-active {
  animation: eventSlideIn 0.2s ease;
}

.event-item-leave-active {
  animation: eventSlideIn 0.2s ease reverse;
}

.event-item-move {
  transition: transform 0.2s ease;
}

.type-tag {
  font-size: 9px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 3px;
  text-transform: uppercase;
  flex-shrink: 0;
}

.event-name {
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rel-from,
.rel-to {
  color: var(--color-text);
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rel-tag {
  font-weight: 600;
  flex-shrink: 0;
}

.event-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 100px;
  color: var(--color-text-muted);
  font-size: 12px;
}

// ============================================================================
// 플로팅 콘솔
// ============================================================================

.floating-console {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--color-bg-secondary);
  border-top: 2px solid var(--color-border);
  z-index: 90;
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  
  .console-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--color-bg-tertiary);
    border-bottom: 1px solid var(--color-border);
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text-bright);
    
    .console-count {
      padding: 2px 6px;
      background: var(--color-accent);
      color: white;
      border-radius: 8px;
      font-size: 10px;
      font-weight: 600;
    }
    
  }
  
  .console-close-btn-bottom {
    position: absolute;
    bottom: 8px;
    left: 50%;
    transform: translateX(-50%);
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    color: var(--color-text-light);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    z-index: 10;
    transition: all 0.15s;
    box-shadow: var(--shadow-md);
    
    .arrow {
      font-size: 12px;
    }
    
    &:hover {
      background: var(--color-bg-tertiary);
      color: var(--color-text-bright);
      border-color: var(--color-text-light);
      box-shadow: var(--shadow-lg);
    }
  }
  
  .console-resize-handle {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
    cursor: row-resize;
    z-index: 1;
    @include resize-handle-base;
  }
  
  .console-content {
    flex: 1;
    overflow-y: auto;
    padding: 8px 12px;
    margin-top: 4px;
    font-family: var(--font-mono);
    font-size: 11px;
    background: var(--color-bg);
    margin-left: 4px;
    margin-right: 4px;
    margin-bottom: 4px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
  }
  
  .log-item {
    display: flex;
    gap: 10px;
    padding: 3px 0;
    color: var(--color-text);
    
    &.error {
      color: var(--color-error);
    }
    
    .time {
      color: var(--color-text-muted);
      flex-shrink: 0;
    }
  }
  
  .log-empty {
    color: var(--color-text-muted);
    text-align: center;
    padding: 16px;
  }
}

// ============================================================================
// 트랜지션
// ============================================================================

.slide-right-enter-active,
.slide-right-leave-active {
  transition: transform 0.2s ease;
}

.slide-right-enter-from,
.slide-right-leave-to {
  transform: translateX(100%);
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.2s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
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
