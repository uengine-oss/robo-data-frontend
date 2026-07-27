<script setup lang="ts">
/**
 * ObjectExplorerTab.vue
 * 도메인 레이어 오브젝트 탐색기 - Materialized View 기반 그래프 시각화
 * 
 * 주요 기능:
 * - Object Type 기반 검색 및 필터링
 * - 더블클릭으로 스키마 정의 기반 드릴다운
 * - NVL 그래프 기반 시각화
 * - 5개 이상 child 노드 선택 다이얼로그
 * - 왼쪽 패널 검색/상세 탭 전환
 * - 우측 ObjectType별 차트 영역
 */

import { ref, computed, onMounted } from 'vue'
import ObjectExplorerGraph from './ObjectExplorerGraph.vue'
import ObjectSearchPanel from './ObjectSearchPanel.vue'
import ObjectDetailPanel from './ObjectDetailPanel.vue'
import ChildSelectDialog from './ChildSelectDialog.vue'
import ObjectChartPanel from './ObjectChartPanel.vue'
import { useResize } from '@/shared/composables/useResize'
import { objectExplorerApi } from '@/domains/ontology'

// ============================================================================
// 타입 정의
// ============================================================================

interface ObjectNode {
  id: string
  name: string
  type: string  // Object Type 이름
  labels: string[]
  properties: Record<string, unknown>
}

interface ObjectRelation {
  id: string
  source: string
  target: string
  type: string
  properties?: Record<string, unknown>
}

interface GraphData {
  nodes: ObjectNode[]
  links: ObjectRelation[]
}

interface ObjectType {
  id: string
  name: string
  description?: string
  columns: Array<{ name: string; type: string }>
  materializedView?: string
  query?: string
  chartConfig?: ChartConfig
}

interface ChartConfig {
  chartType: 'bar' | 'line' | 'pie' | 'map' | 'none'
  xAxis?: string
  yAxis?: string
  valueField?: string
  labelField?: string
  latitudeField?: string
  longitudeField?: string
  regionField?: string
}

// ============================================================================
// 상태
// ============================================================================

const graphData = ref<GraphData>({ nodes: [], links: [] })
const objectTypes = ref<ObjectType[]>([])
const selectedObjectType = ref<ObjectType | null>(null)
const selectedNode = ref<ObjectNode | null>(null)
const isLoading = ref(false)
const error = ref<string | null>(null)
const searchQuery = ref('')
const showLeftPanel = ref(true)
const showChartPanel = ref(true)
const leftPanelTab = ref<'search' | 'detail'>('search')

// 드릴다운 선택 다이얼로그 상태
const showChildSelectDialog = ref(false)
const pendingChildren = ref<ObjectNode[]>([])
const pendingParentNode = ref<ObjectNode | null>(null)
const pendingChildType = ref('')
const pendingRelationType = ref('')

// 그래프 레퍼런스
const graphRef = ref<InstanceType<typeof ObjectExplorerGraph> | null>(null)

// 패널 리사이즈
const { value: leftPanelWidth, isResizing: isLeftResizing, startResize: startLeftResize } = useResize({
  direction: 'horizontal',
  initialValue: 300,
  min: 240,
  max: 500,
  fromEnd: true
})

const { value: chartPanelWidth, isResizing: isChartResizing, startResize: startChartResize } = useResize({
  direction: 'horizontal',
  initialValue: 350,
  min: 280,
  max: 600,
  fromEnd: true
})

// ============================================================================
// Computed
// ============================================================================

// 현재 그래프에 표시된 ObjectType별 노드 그룹
const nodesByType = computed(() => {
  const groups: Record<string, ObjectNode[]> = {}
  for (const node of graphData.value.nodes) {
    if (!groups[node.type]) {
      groups[node.type] = []
    }
    groups[node.type].push(node)
  }
  return groups
})

// ============================================================================
// API 호출
// ============================================================================

/**
 * Object Type 목록 로드
 */
async function loadObjectTypes() {
  isLoading.value = true
  error.value = null
  
  try {
    const response = await objectExplorerApi.getObjectTypes()
    objectTypes.value = response.objectTypes
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Object Type 목록 로드 실패'
    console.error('Failed to load object types:', err)
  } finally {
    isLoading.value = false
  }
}

// 선택 모드 (objectType: 초기 로드, drilldown: 드릴다운)
const selectMode = ref<'objectType' | 'drilldown'>('objectType')

/**
 * Object Type 선택 시 데이터 로드
 */
async function handleObjectTypeSelect(objectType: ObjectType) {
  selectedObjectType.value = objectType
  isLoading.value = true
  error.value = null
  
  try {
    // 해당 Object Type의 인스턴스를 그래프 노드로 변환
    const response = await objectExplorerApi.getObjectTypeData(objectType.name)
    
    // 그래프 데이터 구성
    const nodes: ObjectNode[] = response.rows.map((row: Record<string, unknown>, idx: number) => ({
      id: `${objectType.name}_${row.id || idx}`,
      name: String(row.name || row.id || `${objectType.name} #${idx + 1}`),
      type: objectType.name,
      labels: [objectType.name],
      properties: row
    }))
    
    // 5개 이상이면 선택 다이얼로그 표시
    if (nodes.length > 5) {
      selectMode.value = 'objectType'
      pendingChildren.value = nodes
      pendingParentNode.value = null
      pendingChildType.value = objectType.name
      pendingRelationType.value = ''
      showChildSelectDialog.value = true
      isLoading.value = false
      return
    }
    
    graphData.value = {
      nodes,
      links: []
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '데이터 로드 실패'
    console.error('Failed to load object type data:', err)
  } finally {
    isLoading.value = false
  }
}

/**
 * 검색 실행
 */
async function handleSearch(query: string) {
  if (!query.trim()) return
  
  isLoading.value = true
  error.value = null
  
  try {
    const response = await objectExplorerApi.searchObjects(query)
    
    // 검색 결과를 그래프 노드로 변환
    const nodes: ObjectNode[] = response.results.map((item) => ({
      id: String(item.id),
      name: String(item.name || item.id),
      type: String(item.objectType || 'Unknown'),
      labels: [String(item.objectType || 'Unknown')],
      properties: item.properties || {}
    }))
    
    graphData.value = {
      nodes,
      links: []
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '검색 실패'
    console.error('Search failed:', err)
  } finally {
    isLoading.value = false
  }
}

/**
 * 노드 선택 핸들러
 */
function handleNodeSelect(node: ObjectNode | null) {
  selectedNode.value = node
  if (node) {
    leftPanelTab.value = 'detail'
  }
}

/**
 * 노드 드릴다운 핸들러 (더블클릭 시)
 * 스키마 정의를 기반으로 하위 노드를 가져와서 확장
 */
async function handleNodeDrilldown(node: ObjectNode) {
  isLoading.value = true
  error.value = null
  
  try {
    // 스키마 정의에서 하위 관계 찾기 (전체 properties 전달)
    const response = await objectExplorerApi.getChildNodes(
      node.type, 
      String(node.properties.id || node.id),
      node.properties
    )
    
    // child.properties에 실제 데이터가 있음 (여과지명, 정수장명 등)
    const newNodes: ObjectNode[] = response.children.map((child: Record<string, unknown>) => ({
      id: `${child.type}_${child.id}`,
      name: String(child.name || child.id),
      type: String(child.type),
      labels: [String(child.type)],
      properties: (child.properties as Record<string, unknown>) || child
    }))
    
    // 5개 이상이면 선택 다이얼로그 표시
    if (newNodes.length > 5) {
      selectMode.value = 'drilldown'
      pendingChildren.value = newNodes
      pendingParentNode.value = node
      pendingChildType.value = newNodes[0]?.type || ''
      pendingRelationType.value = response.relationshipType || 'HAS_CHILD'
      showChildSelectDialog.value = true
      isLoading.value = false
      return
    }
    
    // 5개 이하면 바로 추가
    addNodesToGraph(node, newNodes, response.relationshipType || 'HAS_CHILD')
    
  } catch (err) {
    error.value = err instanceof Error ? err.message : '하위 데이터 로드 실패'
    console.error('Drilldown failed:', err)
  } finally {
    isLoading.value = false
  }
}

/**
 * 노드를 그래프에 추가
 */
function addNodesToGraph(parentNode: ObjectNode, newNodes: ObjectNode[], relationType: string) {
  const newLinks: ObjectRelation[] = newNodes.map((childNode) => ({
    id: `rel_${parentNode.id}_${childNode.id}`,
    source: parentNode.id,
    target: childNode.id,
    type: relationType
  }))
  
  // 기존 데이터에 추가 (중복 제거)
  graphData.value = {
    nodes: [...graphData.value.nodes, ...newNodes.filter(n => 
      !graphData.value.nodes.some(existing => existing.id === n.id)
    )],
    links: [...graphData.value.links, ...newLinks]
  }
}

/**
 * Child 선택 다이얼로그에서 선택 완료
 */
function handleChildSelectConfirm(children: Array<{ id: string; name: string; type: string; labels?: string[]; properties: Record<string, unknown> }>) {
  showChildSelectDialog.value = false
  
  // labels 필드가 없으면 추가
  const selectedChildren: ObjectNode[] = children.map(c => ({
    ...c,
    labels: c.labels || [c.type]
  }))
  
  if (selectedChildren.length > 0) {
    if (selectMode.value === 'objectType') {
      // ObjectType 선택 모드: 새로운 그래프로 시작
      graphData.value = {
        nodes: selectedChildren,
        links: []
      }
    } else if (pendingParentNode.value) {
      // 드릴다운 모드: 기존 그래프에 추가
      addNodesToGraph(pendingParentNode.value, selectedChildren, pendingRelationType.value)
    }
  }
  
  pendingChildren.value = []
  pendingParentNode.value = null
}

/**
 * Child 선택 다이얼로그 닫기
 */
function handleChildSelectClose() {
  showChildSelectDialog.value = false
  pendingChildren.value = []
  pendingParentNode.value = null
}

/**
 * 그래프 초기화
 */
function handleResetGraph() {
  graphData.value = { nodes: [], links: [] }
  selectedNode.value = null
  selectedObjectType.value = null
  leftPanelTab.value = 'search'
}

/**
 * 상세 패널에서 검색으로 돌아가기
 */
function handleBackToSearch() {
  leftPanelTab.value = 'search'
  selectedNode.value = null
}

// ============================================================================
// 라이프사이클
// ============================================================================

onMounted(() => {
  loadObjectTypes()
})
</script>

<template>
  <div class="object-explorer-tab">
    <!-- 왼쪽 패널 (검색/상세 탭) -->
    <Transition name="slide-left">
      <div 
        v-if="showLeftPanel"
        class="left-panel"
        :style="{ width: `${leftPanelWidth}px` }"
      >
        <!-- 탭 헤더 -->
        <div class="panel-tabs">
          <button 
            class="tab-btn"
            :class="{ active: leftPanelTab === 'search' }"
            @click="leftPanelTab = 'search'"
          >
            검색
          </button>
          <button 
            class="tab-btn"
            :class="{ active: leftPanelTab === 'detail', disabled: !selectedNode }"
            :disabled="!selectedNode"
            @click="leftPanelTab = 'detail'"
          >
            상세
          </button>
        </div>
        
        <!-- 탭 콘텐츠 -->
        <div class="panel-content">
          <!-- 검색 탭 -->
          <div v-show="leftPanelTab === 'search'" class="tab-content">
            <ObjectSearchPanel
              :object-types="objectTypes"
              :selected-type="selectedObjectType"
              :is-loading="isLoading"
              v-model:search-query="searchQuery"
              @type-select="handleObjectTypeSelect"
              @search="handleSearch"
              @reset="handleResetGraph"
            />
          </div>
          
          <!-- 상세 탭 -->
          <div v-show="leftPanelTab === 'detail'" class="tab-content">
            <ObjectDetailPanel
              v-if="selectedNode"
              :node="selectedNode"
              :object-type="selectedObjectType"
              @close="handleBackToSearch"
              @drilldown="handleNodeDrilldown"
            />
            <div v-else class="no-selection">
              <p>노드를 선택하면 상세 정보가 표시됩니다</p>
            </div>
          </div>
        </div>
        
        <!-- 리사이즈 핸들 -->
        <div 
          class="panel-resize-handle right"
          :class="{ resizing: isLeftResizing }"
          @mousedown="startLeftResize"
        ></div>
      </div>
    </Transition>
    
    <!-- 메인 그래프 영역 -->
    <div class="graph-container">
      <!-- 로딩 오버레이 -->
      <div v-if="isLoading" class="loading-overlay">
        <div class="loading-spinner"></div>
        <span>데이터 로딩 중...</span>
      </div>
      
      <!-- 에러 메시지 -->
      <div v-if="error" class="error-banner">
        <span class="error-icon">⚠️</span>
        <span>{{ error }}</span>
        <button class="dismiss-btn" @click="error = null">✕</button>
      </div>
      
      <!-- 빈 상태 -->
      <div v-if="!isLoading && graphData.nodes.length === 0" class="empty-state">
        <div class="empty-icon">🔍</div>
        <h3>오브젝트 탐색기</h3>
        <p>왼쪽 패널에서 Object Type을 선택하거나<br/>검색어를 입력하여 오브젝트를 탐색하세요</p>
      </div>
      
      <!-- 그래프 뷰 -->
      <ObjectExplorerGraph
        v-if="graphData.nodes.length > 0"
        ref="graphRef"
        :graph-data="graphData"
        :selected-node-id="selectedNode?.id"
        :object-types="objectTypes"
        @node-select="handleNodeSelect"
        @node-drilldown="handleNodeDrilldown"
      />
      
      <!-- 플로팅 컨트롤 -->
      <div class="floating-controls">
        <button 
          class="control-btn"
          :class="{ active: showLeftPanel }"
          @click="showLeftPanel = !showLeftPanel"
          title="검색 패널 토글"
        >
          🔍
        </button>
        <button 
          class="control-btn"
          :class="{ active: showChartPanel }"
          @click="showChartPanel = !showChartPanel"
          title="차트 패널 토글"
        >
          📊
        </button>
        <button 
          class="control-btn"
          @click="handleResetGraph"
          title="그래프 초기화"
        >
          🔄
        </button>
      </div>
    </div>
    
    <!-- 우측 차트 패널 -->
    <Transition name="slide-right">
      <div 
        v-if="showChartPanel && Object.keys(nodesByType).length > 0"
        class="chart-panel"
        :style="{ width: `${chartPanelWidth}px` }"
      >
        <!-- 리사이즈 핸들 -->
        <div 
          class="panel-resize-handle left"
          :class="{ resizing: isChartResizing }"
          @mousedown="startChartResize"
        ></div>
        
        <ObjectChartPanel
          :nodes-by-type="nodesByType"
          :object-types="objectTypes"
        />
      </div>
    </Transition>
    
    <!-- Child 선택 다이얼로그 -->
    <ChildSelectDialog
      :visible="showChildSelectDialog"
      :children="pendingChildren"
      :parent-name="pendingParentNode?.name || ''"
      :child-type="pendingChildType"
      @close="handleChildSelectClose"
      @confirm="handleChildSelectConfirm"
    />
  </div>
</template>

<style lang="scss" scoped>
.object-explorer-tab {
  display: flex;
  height: 100%;
  width: 100%;
  background: var(--color-canvas-bg);
  overflow: hidden;
}

// ============================================================================
// 왼쪽 패널
// ============================================================================

.left-panel {
  position: relative;
  height: 100%;
  background: var(--color-bg-secondary);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  z-index: 10;
}

.panel-tabs {
  display: flex;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-tertiary);
  
  .tab-btn {
    flex: 1;
    padding: 12px 16px;
    background: none;
    border: none;
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all 0.15s;
    border-bottom: 2px solid transparent;
    
    &:hover:not(.disabled) {
      color: var(--color-text);
      background: var(--color-bg-secondary);
    }
    
    &.active {
      color: var(--color-accent);
      border-bottom-color: var(--color-accent);
      background: var(--color-bg-secondary);
    }
    
    &.disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
}

.panel-content {
  flex: 1;
  overflow: hidden;
  
  .tab-content {
    height: 100%;
    overflow: auto;
  }
}

.no-selection {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-muted);
  font-size: 13px;
  text-align: center;
  padding: 20px;
}

// ============================================================================
// 그래프 컨테이너
// ============================================================================

.graph-container {
  flex: 1;
  position: relative;
  min-width: 0;
  overflow: hidden;
}

// ============================================================================
// 차트 패널
// ============================================================================

.chart-panel {
  position: relative;
  height: 100%;
  background: var(--color-bg-secondary);
  border-left: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  z-index: 10;
}

// ============================================================================
// 리사이즈 핸들
// ============================================================================

.panel-resize-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 4px;
  cursor: col-resize;
  background: transparent;
  transition: background 0.15s;
  z-index: 100;
  
  &.right {
    right: 0;
  }
  
  &.left {
    left: 0;
  }
  
  &:hover {
    background: var(--color-border);
  }
  
  &.resizing {
    background: var(--color-accent);
  }
}

// ============================================================================
// 로딩/에러 상태
// ============================================================================

.loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  background: rgba(0, 0, 0, 0.5);
  z-index: 50;
  
  .loading-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid rgba(255, 255, 255, 0.2);
    border-top-color: var(--color-accent);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  
  span {
    font-size: 14px;
    color: var(--color-text);
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-banner {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: rgba(239, 68, 68, 0.9);
  color: white;
  border-radius: 8px;
  font-size: 13px;
  z-index: 50;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  
  .dismiss-btn {
    background: transparent;
    border: none;
    color: white;
    cursor: pointer;
    padding: 4px;
    opacity: 0.8;
    
    &:hover {
      opacity: 1;
    }
  }
}

// ============================================================================
// 빈 상태
// ============================================================================

.empty-state {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: var(--color-text-muted);
  
  .empty-icon {
    font-size: 64px;
    margin-bottom: 16px;
    opacity: 0.5;
  }
  
  h3 {
    font-size: 20px;
    font-weight: 600;
    color: var(--color-text-bright);
    margin-bottom: 8px;
  }
  
  p {
    font-size: 14px;
    line-height: 1.6;
  }
}

// ============================================================================
// 플로팅 컨트롤
// ============================================================================

.floating-controls {
  position: absolute;
  top: 12px;
  left: 12px;
  display: flex;
  gap: 8px;
  z-index: 40;
}

.control-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.15s;
  
  &:hover {
    background: var(--color-bg-tertiary);
    border-color: var(--color-accent);
  }
  
  &.active {
    background: rgba(34, 139, 230, 0.15);
    border-color: var(--color-accent);
  }
}

// ============================================================================
// 트랜지션
// ============================================================================

.slide-left-enter-active,
.slide-left-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.slide-left-enter-from,
.slide-left-leave-to {
  transform: translateX(-100%);
  opacity: 0;
}

.slide-right-enter-active,
.slide-right-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.slide-right-enter-from,
.slide-right-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>
