<script setup lang="ts">
/**
 * ObjectExplorerGraph.vue
 * 도메인 오브젝트 그래프 시각화 (NVL 기반)
 * 
 * 주요 기능:
 * - Object Type 기반 노드 색상
 * - 더블클릭으로 스키마 기반 드릴다운
 * - 줌/팬/드래그 인터랙션
 */

import { ref, computed, onMounted, onUnmounted, watch, shallowRef, nextTick } from 'vue'
import { NVL } from '@neo4j-nvl/base'
import { 
  ClickInteraction, 
  DragNodeInteraction, 
  PanInteraction, 
  ZoomInteraction 
} from '@neo4j-nvl/interaction-handlers'

// ============================================================================
// 타입 정의
// ============================================================================

interface ObjectNode {
  id: string
  name: string
  type: string
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

interface NvlNode {
  id: string
  caption: string
  color: string
  size: number
  selected?: boolean
  properties?: Record<string, unknown>
}

interface NvlRelationship {
  id: string
  from: string
  to: string
  caption: string
  color: string
  selected?: boolean
  properties?: Record<string, unknown>
}

interface ObjectTypeInfo {
  id: string
  name: string
  description?: string
}

interface Props {
  graphData: GraphData
  selectedNodeId?: string
  objectTypes?: ObjectTypeInfo[]
}

// ============================================================================
// 상수
// ============================================================================

// 기본 색상 팔레트 (ObjectType에 동적 할당)
const COLOR_PALETTE = [
  '#22c55e',  // green
  '#3b82f6',  // blue
  '#f59e0b',  // amber
  '#8b5cf6',  // violet
  '#06b6d4',  // cyan
  '#ec4899',  // pink
  '#ef4444',  // red
  '#10b981',  // emerald
  '#f97316',  // orange
  '#6366f1',  // indigo
  '#14b8a6',  // teal
  '#a855f7',  // purple
]

const DEFAULT_COLOR = '#6b7280'

// 관계 타입 레이블 변환
const RELATION_LABELS: Record<string, string> = {
  'ONE_TO_MANY': '1:N',
  'MANY_TO_ONE': 'N:1',
  'ONE_TO_ONE': '1:1',
  'MANY_TO_MANY': 'N:N',
  'FK_TO_TABLE': 'FK',
  'HAS_CHILD': 'has',
  'RELATES_TO': 'rel'
}

const NVL_OPTIONS = {
  initialZoom: 1.0,
  disableWebWorkers: true,
  renderer: 'canvas' as const,
  relationshipLabelFontSize: 10,
  relationshipWidth: 2,
  nodeCaptionFontSize: 12,
  nodeCaptionColor: '#333333',
  panOnClick: false,
  zoomOnClick: false,
  layout: 'forceDirected' as const,
  layoutOptions: {
    iterations: 100,
    animationDuration: 0,
    disableAnimation: true,
    updateLayoutOnChange: false,
    separateComponents: true,
    componentSpacing: 150,
    nodeRepulsion: 600,
    linkDistance: 80,
    gravity: 0.08,
    physics: { enabled: false }
  } as any
}

// ============================================================================
// Props & Emits
// ============================================================================

const props = withDefaults(defineProps<Props>(), {
  selectedNodeId: undefined,
  objectTypes: () => []
})

const emit = defineEmits<{
  'node-select': [node: ObjectNode | null]
  'node-drilldown': [node: ObjectNode]
}>()

// ============================================================================
// 상태
// ============================================================================

const containerRef = ref<HTMLElement>()
const nvlInstance = shallowRef<NVL | null>(null)
const isInitializing = ref(false)
const nodeCount = ref(0)
const nodeMap = new Map<string, NvlNode>()
const relationshipMap = new Map<string, NvlRelationship>()

// ============================================================================
// Computed
// ============================================================================

// 동적으로 ObjectType에 색상 할당
const typeColorMap = computed(() => {
  const colorMap: Record<string, string> = {}
  
  // objectTypes props가 있으면 사용
  if (props.objectTypes && props.objectTypes.length > 0) {
    props.objectTypes.forEach((ot, idx) => {
      colorMap[ot.name] = COLOR_PALETTE[idx % COLOR_PALETTE.length]
    })
  }
  
  // graphData에서 추출된 타입도 추가 (없으면)
  props.graphData.nodes.forEach(node => {
    if (!colorMap[node.type]) {
      const existingTypes = Object.keys(colorMap)
      colorMap[node.type] = COLOR_PALETTE[existingTypes.length % COLOR_PALETTE.length]
    }
  })
  
  return colorMap
})

// 범례에 표시할 ObjectType 목록
const legendItems = computed(() => {
  const items: Array<{ name: string; color: string }> = []
  
  // 현재 그래프에 있는 타입들만 표시
  const typesInGraph = new Set(props.graphData.nodes.map(n => n.type))
  
  // objectTypes props가 있으면 우선 사용
  if (props.objectTypes && props.objectTypes.length > 0) {
    props.objectTypes.forEach(ot => {
      if (typesInGraph.has(ot.name)) {
        items.push({
          name: ot.name,
          color: typeColorMap.value[ot.name] || DEFAULT_COLOR
        })
      }
    })
  }
  
  // 추가로 그래프에 있지만 objectTypes에 없는 타입들 추가
  typesInGraph.forEach(type => {
    if (!items.some(item => item.name === type)) {
      items.push({
        name: type,
        color: typeColorMap.value[type] || DEFAULT_COLOR
      })
    }
  })
  
  return items
})

// ============================================================================
// 유틸리티 함수
// ============================================================================

function getNodeColor(type: string): string {
  return typeColorMap.value[type] || DEFAULT_COLOR
}

function getRelationshipColor(_type: string): string {
  return '#94a3b8'
}

function getRelationshipLabel(type: string): string {
  return RELATION_LABELS[type] || type
}

function toNvlNode(node: ObjectNode, isSelected: boolean = false): NvlNode {
  return {
    id: node.id,
    caption: node.name,
    color: getNodeColor(node.type),
    size: 30,
    selected: isSelected,
    properties: {
      ...node.properties,
      nodeType: node.type,
      labels: node.labels
    }
  }
}

function toNvlRelationship(link: ObjectRelation, isSelected: boolean = false): NvlRelationship {
  return {
    id: link.id,
    from: link.source,
    to: link.target,
    caption: getRelationshipLabel(link.type),
    color: getRelationshipColor(link.type),
    selected: isSelected,
    properties: link.properties
  }
}

// ============================================================================
// NVL 초기화
// ============================================================================

async function initNvl(): Promise<void> {
  if (!containerRef.value || isInitializing.value) return
  
  isInitializing.value = true
  
  // 기존 인스턴스 정리
  if (nvlInstance.value) {
    nvlInstance.value.destroy()
    nvlInstance.value = null
  }
  
  nodeMap.clear()
  relationshipMap.clear()
  
  await nextTick()
  
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      if (!containerRef.value) {
        isInitializing.value = false
        resolve()
        return
      }
      
      // 노드 변환
      const nvlNodes: NvlNode[] = props.graphData.nodes.map(node => {
        const nvlNode = toNvlNode(node, props.selectedNodeId === node.id)
        nodeMap.set(node.id, nvlNode)
        return nvlNode
      })
      nodeCount.value = nodeMap.size
      
      // 관계 변환
      const nvlRels: NvlRelationship[] = props.graphData.links
        .filter(link => nodeMap.has(link.source) && nodeMap.has(link.target))
        .map(link => {
          const nvlRel = toNvlRelationship(link)
          relationshipMap.set(link.id, nvlRel)
          return nvlRel
        })
      
      // NVL 인스턴스 생성
      nvlInstance.value = new NVL(
        containerRef.value!,
        nvlNodes,
        nvlRels,
        NVL_OPTIONS,
        {
          onLayoutDone: () => {
            isInitializing.value = false
          }
        }
      )
      
      setupInteractions()
      resolve()
    })
  })
}

function setupInteractions(): void {
  if (!nvlInstance.value || !containerRef.value) return
  
  const nvl = nvlInstance.value
  const click = new ClickInteraction(nvl)
  
  let lastClickNodeId: string | null = null
  let lastClickTime = 0
  
  click.updateCallback('onNodeClick', (node: { id: string } | null) => {
    if (!node?.id) return
    
    const now = Date.now()
    const isDoubleClick = lastClickNodeId === node.id && (now - lastClickTime) < 300
    
    if (isDoubleClick) {
      // 더블클릭: 드릴다운
      const originalNode = props.graphData.nodes.find(n => n.id === node.id)
      if (originalNode) {
        emit('node-drilldown', originalNode)
      }
      lastClickNodeId = null
      lastClickTime = 0
    } else {
      // 단일 클릭: 선택
      lastClickNodeId = node.id
      lastClickTime = now
      
      const originalNode = props.graphData.nodes.find(n => n.id === node.id)
      emit('node-select', originalNode || null)
    }
  })
  
  click.updateCallback('onCanvasClick', () => {
    emit('node-select', null)
  })
  
  new DragNodeInteraction(nvl)
  new PanInteraction(nvl)
  new ZoomInteraction(nvl)
}

// ============================================================================
// 그래프 업데이트
// ============================================================================

function updateGraph(): void {
  if (!nvlInstance.value) {
    initNvl()
    return
  }
  
  // 새 노드 추가
  const newNodes: NvlNode[] = []
  const newRels: NvlRelationship[] = []
  
  for (const node of props.graphData.nodes) {
    if (!nodeMap.has(node.id)) {
      const nvlNode = toNvlNode(node, props.selectedNodeId === node.id)
      nodeMap.set(node.id, nvlNode)
      newNodes.push(nvlNode)
    }
  }
  
  for (const link of props.graphData.links) {
    if (!relationshipMap.has(link.id) && nodeMap.has(link.source) && nodeMap.has(link.target)) {
      const nvlRel = toNvlRelationship(link)
      relationshipMap.set(link.id, nvlRel)
      newRels.push(nvlRel)
    }
  }
  
  if (newNodes.length > 0 || newRels.length > 0) {
    nvlInstance.value.addAndUpdateElementsInGraph(newNodes, newRels)
    nodeCount.value = nodeMap.size
  }
}

function resetGraph(): void {
  nodeMap.clear()
  relationshipMap.clear()
  nodeCount.value = 0
  
  if (nvlInstance.value) {
    nvlInstance.value.destroy()
    nvlInstance.value = null
  }
}

// ============================================================================
// 라이프사이클
// ============================================================================

onMounted(() => {
  if (props.graphData.nodes.length > 0) {
    initNvl()
  }
})

onUnmounted(() => {
  resetGraph()
})

// ============================================================================
// 워처
// ============================================================================

watch(() => props.graphData, (newData, oldData) => {
  if (newData.nodes.length === 0) {
    resetGraph()
    return
  }
  
  // 노드 수가 크게 변경되거나 처음 데이터가 들어오면 재초기화
  const oldNodeLen = oldData?.nodes?.length || 0
  const isInitialLoad = oldNodeLen === 0 && newData.nodes.length > 0
  const isSignificantChange = oldNodeLen > 0 && Math.abs(newData.nodes.length - oldNodeLen) > oldNodeLen * 0.5
  
  if (isInitialLoad || isSignificantChange) {
    resetGraph()
    initNvl()
  } else {
    updateGraph()
  }
}, { deep: true })

watch(() => props.selectedNodeId, (newId, oldId) => {
  if (!nvlInstance.value) return
  
  const nodesToUpdate: { id: string; selected: boolean }[] = []
  
  if (oldId) {
    nodesToUpdate.push({ id: oldId, selected: false })
  }
  
  if (newId) {
    nodesToUpdate.push({ id: newId, selected: true })
  }
  
  if (nodesToUpdate.length > 0) {
    nvlInstance.value.updateElementsInGraph(nodesToUpdate, [])
  }
})

// ============================================================================
// Public API
// ============================================================================

defineExpose({
  resetGraph,
  updateGraph,
  getNodeCount: () => nodeCount.value,
  getRelationshipCount: () => relationshipMap.size
})
</script>

<template>
  <div class="object-explorer-graph" ref="containerRef">
    <!-- 빈 상태 -->
    <div v-if="!isInitializing && nodeCount === 0" class="empty-state">
      <div class="empty-icon">🔗</div>
      <p>그래프 데이터가 없습니다</p>
    </div>
    
    <!-- 로딩 인디케이터 -->
    <Transition name="fade">
      <div v-if="isInitializing" class="loading-indicator">
        <div class="loading-spinner"></div>
        <span>그래프 렌더링 중...</span>
      </div>
    </Transition>
    
    <!-- 범례 -->
    <div v-if="legendItems.length > 0" class="graph-legend">
      <div class="legend-title">Object Types</div>
      <div class="legend-items">
        <div 
          v-for="item in legendItems" 
          :key="item.name"
          class="legend-item"
        >
          <span class="legend-color" :style="{ background: item.color }"></span>
          <span class="legend-label">{{ item.name }}</span>
        </div>
      </div>
    </div>
    
    <!-- 도움말 -->
    <div class="graph-help">
      <span class="help-item">클릭: 선택</span>
      <span class="help-divider">|</span>
      <span class="help-item">더블클릭: 드릴다운</span>
      <span class="help-divider">|</span>
      <span class="help-item">드래그: 이동</span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.object-explorer-graph {
  width: 100%;
  height: 100%;
  min-height: 400px;
  position: relative;
  background: var(--color-canvas-bg);
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
    font-size: 48px;
    margin-bottom: 16px;
    opacity: 0.5;
  }
  
  p {
    font-size: 14px;
  }
}

// ============================================================================
// 로딩
// ============================================================================

.loading-indicator {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px 32px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  z-index: 100;
  
  .loading-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid #e5e7eb;
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  
  span {
    font-size: 13px;
    color: #64748b;
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

// ============================================================================
// 범례
// ============================================================================

.graph-legend {
  position: absolute;
  bottom: 16px;
  left: 16px;
  padding: 12px 16px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  z-index: 50;
  
  .legend-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-muted);
    margin-bottom: 8px;
  }
  
  .legend-items {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  
  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  
  .legend-color {
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }
  
  .legend-label {
    font-size: 11px;
    color: var(--color-text-light);
  }
}

// ============================================================================
// 도움말
// ============================================================================

.graph-help {
  position: absolute;
  bottom: 16px;
  right: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: 11px;
  color: var(--color-text-muted);
  z-index: 50;
  
  .help-divider {
    opacity: 0.3;
  }
}

// ============================================================================
// 트랜지션
// ============================================================================

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
