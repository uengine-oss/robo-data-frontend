<script setup lang="ts">
/**
 * NvlGraph.vue
 * Neo4j NVL 기반 그래프 시각화 컴포넌트 (1-hop 캔버스 전용).
 *
 * 입력(graphData)는 projectStore.canvasGraphData — 사용자가 Navigator에서 드래그-드롭한
 * 노드와 그 1-hop 이웃만 포함된 소규모 부분집합이다.
 * 따라서 배치 렌더링/개수 제한/대기 큐 같은 장치는 필요 없으며,
 * props 변경 시 즉시 diff 하여 NVL에 반영한다.
 */

import { ref, onMounted, onUnmounted, watch, shallowRef, nextTick } from 'vue'
import { NVL } from '@neo4j-nvl/base'
import {
  ClickInteraction,
  DragNodeInteraction,
  PanInteraction,
  ZoomInteraction
} from '@neo4j-nvl/interaction-handlers'
import type { GraphData, GraphNode, GraphLink, NvlNode, NvlRelationship } from '@/types'
import type { PartialNode, PartialRelationship } from '@neo4j-nvl/base'
import { getNodeColor, getRelationshipColor, getRelationshipWidth, getNodeSize } from '@/config/graphStyles'

// ============================================================================
// 타입 정의
// ============================================================================

interface Props {
  graphData: GraphData
  selectedNodeId?: string
  selectedRelationshipId?: string
  /** 노드 라벨 필터 (비어있으면 전체 표시) */
  labelFilters?: string[]
}

interface NodeStat {
  count: number
  color: string
}

// ============================================================================
// 상수
// ============================================================================

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
    iterations: 150,
    animationDuration: 0,
    disableAnimation: true,
    updateLayoutOnChange: false,
    separateComponents: true,
    componentSpacing: 200,
    componentArrangement: 'grid',
    nodeRepulsion: 800,
    linkDistance: 80,
    gravity: 0.05,
    physics: { enabled: false },
    updateOnDrag: false,
    updateOnClick: false
  } as any
} as const

// ============================================================================
// Props & Emits
// ============================================================================

const props = withDefaults(defineProps<Props>(), {
  labelFilters: () => []
})

const emit = defineEmits<{
  'node-select': [node: GraphNode | null]
  'relationship-select': [relationship: GraphLink | null]
  'node-delete': [nodeId: string]
  'node-drop': [payload: { nodeId: string; nodeType?: string; labels?: string[] }]
}>()

// ============================================================================
// 상태
// ============================================================================

const containerRef = ref<HTMLElement>()
const nvlInstance = shallowRef<NVL | null>(null)
const isInitializing = ref(false)

const nodeStats = ref<Map<string, NodeStat>>(new Map())
const relationshipStats = ref<Map<string, NodeStat>>(new Map())

// 내부 맵 (id → NvlNode/Relationship) — 반응형 불필요
const nodeMap = new Map<string, NvlNode>()
const relationshipMap = new Map<string, NvlRelationship>()

// 드래그 오버 시각적 피드백
const isDragOver = ref(false)

// 컨텍스트 메뉴
const contextMenuVisible = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })
const contextMenuNodeId = ref<string | null>(null)
const contextMenuRef = ref<HTMLElement | null>(null)

// ============================================================================
// 데이터 변환
// ============================================================================

function toNvlNode(node: GraphNode, isSelected = false): NvlNode {
  const caption = (node.properties?.name as string)
    || node.labels?.[node.labels.length - 1]
    || node.id
  return {
    id: node.id,
    caption,
    color: getNodeColor(node.labels),
    size: getNodeSize(node.labels),
    selected: isSelected,
    properties: {
      ...node.properties,
      labels: node.labels
    }
  }
}

function toNvlRelationship(link: GraphLink, isSelected = false): NvlRelationship {
  return {
    id: link.id,
    from: link.source,
    to: link.target,
    caption: link.type,
    color: getRelationshipColor(link.type),
    width: getRelationshipWidth(link.type),
    selected: isSelected,
    properties: link.properties
  }
}

function matchesLabelFilter(node: GraphNode): boolean {
  if (!props.labelFilters || props.labelFilters.length === 0) return true
  const labels = node.labels || ['Unknown']
  return labels.some(label => props.labelFilters!.includes(label))
}

// ============================================================================
// 통계 (현재 캔버스 기준)
// ============================================================================

function updateStats(): void {
  const nStats = new Map<string, NodeStat>()
  for (const node of props.graphData.nodes) {
    const labels = node.labels || ['Unknown']
    for (const label of labels) {
      if (label === '_Placeholder') continue
      const existing = nStats.get(label)
      if (existing) existing.count++
      else nStats.set(label, { count: 1, color: getNodeColor([label]) })
    }
  }
  nodeStats.value = nStats

  const rStats = new Map<string, NodeStat>()
  for (const link of props.graphData.links) {
    const type = link.type || 'UNKNOWN'
    const existing = rStats.get(type)
    if (existing) existing.count++
    else rStats.set(type, { count: 1, color: getRelationshipColor(type) })
  }
  relationshipStats.value = rStats
}

// ============================================================================
// NVL 인스턴스 라이프사이클
// ============================================================================

async function initNvl(): Promise<void> {
  if (!containerRef.value || isInitializing.value) return
  if (nvlInstance.value) return

  isInitializing.value = true

  const nodes: NvlNode[] = []
  const rels: NvlRelationship[] = []

  for (const node of props.graphData.nodes) {
    if (!matchesLabelFilter(node)) continue
    const n = toNvlNode(node, props.selectedNodeId === node.id)
    nodeMap.set(node.id, n)
    nodes.push(n)
  }
  const visibleIds = new Set(nodes.map(n => n.id))
  for (const link of props.graphData.links) {
    if (!visibleIds.has(link.source) || !visibleIds.has(link.target)) continue
    const r = toNvlRelationship(link, props.selectedRelationshipId === link.id)
    relationshipMap.set(link.id, r)
    rels.push(r)
  }

  await nextTick()

  nvlInstance.value = new NVL(
    containerRef.value,
    nodes,
    rels,
    NVL_OPTIONS,
    {
      onLayoutDone: () => {
        isInitializing.value = false
      }
    }
  )

  setupInteractions()
  updateStats()
}

function destroyNvl(): void {
  closeContextMenu()
  if (nvlInstance.value) {
    nvlInstance.value.destroy()
    nvlInstance.value = null
  }
  nodeMap.clear()
  relationshipMap.clear()
  isInitializing.value = false
}

/**
 * props.graphData 변경 시 NVL 인스턴스를 destroy 없이 incremental diff 로 반영.
 */
function syncGraph(): void {
  if (!nvlInstance.value) {
    if (props.graphData.nodes.length > 0) initNvl()
    return
  }

  if (props.graphData.nodes.length === 0) {
    destroyNvl()
    updateStats()
    return
  }

  // 1) 현재 표시해야 할 노드 결정
  const visibleNodes = props.graphData.nodes.filter(matchesLabelFilter)
  const targetIds = new Set(visibleNodes.map(n => n.id))

  // 2) 제거할 노드
  const removeIds: string[] = []
  for (const id of nodeMap.keys()) {
    if (!targetIds.has(id)) removeIds.push(id)
  }
  if (removeIds.length > 0) {
    nvlInstance.value.removeNodesWithIds(removeIds)
    for (const id of removeIds) nodeMap.delete(id)
    for (const [relId, rel] of relationshipMap.entries()) {
      if (!targetIds.has(rel.from) || !targetIds.has(rel.to)) {
        relationshipMap.delete(relId)
      }
    }
  }

  // 3) 추가할 노드
  const newNvlNodes: NvlNode[] = []
  for (const node of visibleNodes) {
    if (nodeMap.has(node.id)) continue
    const n = toNvlNode(node, props.selectedNodeId === node.id)
    nodeMap.set(node.id, n)
    newNvlNodes.push(n)
  }

  // 4) 추가할 관계 (양 끝이 모두 캔버스에 있을 때만)
  const newNvlRels: NvlRelationship[] = []
  for (const link of props.graphData.links) {
    if (relationshipMap.has(link.id)) continue
    if (!targetIds.has(link.source) || !targetIds.has(link.target)) continue
    const r = toNvlRelationship(link, props.selectedRelationshipId === link.id)
    relationshipMap.set(link.id, r)
    newNvlRels.push(r)
  }

  if (newNvlNodes.length > 0 || newNvlRels.length > 0) {
    nvlInstance.value.addAndUpdateElementsInGraph(newNvlNodes, newNvlRels)
  }

  updateStats()
}

// ============================================================================
// 인터랙션
// ============================================================================

let contextMenuHandler: ((e: MouseEvent) => void) | null = null
let documentClickHandler: ((e: MouseEvent) => void) | null = null

function setupInteractions(): void {
  if (!nvlInstance.value || !containerRef.value) return

  const nvl = nvlInstance.value
  const click = new ClickInteraction(nvl)

  click.updateCallback('onNodeClick', (node: { id: string } | null) => {
    if (!node?.id) return
    const graphNode = props.graphData.nodes.find(n => n.id === node.id)
    if (graphNode) emit('node-select', graphNode)
  })

  click.updateCallback('onNodeRightClick', (node: { id: string } | null, _hits: any, evt: MouseEvent) => {
    if (!node?.id) return
    evt.preventDefault()
    contextMenuNodeId.value = node.id
    contextMenuPosition.value = { x: evt.clientX, y: evt.clientY }
    contextMenuVisible.value = true
  })

  click.updateCallback('onRelationshipClick', (relationship: { id: string } | null) => {
    if (!relationship?.id) return
    const graphLink = props.graphData.links.find(l => l.id === relationship.id)
    if (graphLink) emit('relationship-select', graphLink)
  })

  click.updateCallback('onCanvasClick', () => {
    emit('node-select', null)
    emit('relationship-select', null)
    closeContextMenu()
  })

  contextMenuHandler = (e: MouseEvent) => {
    if (!contextMenuNodeId.value) e.preventDefault()
  }

  documentClickHandler = (e: MouseEvent) => {
    if (!contextMenuVisible.value) return
    const el = contextMenuRef.value
    if (el && e.target instanceof Node && el.contains(e.target)) return
    closeContextMenu()
  }

  containerRef.value.addEventListener('contextmenu', contextMenuHandler)
  document.addEventListener('click', documentClickHandler as EventListener)

  new DragNodeInteraction(nvl)
  new PanInteraction(nvl)
  new ZoomInteraction(nvl)
}

function closeContextMenu(): void {
  contextMenuVisible.value = false
  contextMenuNodeId.value = null
}

function handleRemoveFromCanvas(event?: Event): void {
  if (event) {
    event.stopPropagation()
    event.preventDefault()
  }
  const id = contextMenuNodeId.value
  if (!id) return
  emit('node-delete', id)
  closeContextMenu()
}

// ============================================================================
// Drag & Drop (Navigator → 캔버스)
// ============================================================================

function onDragOver(e: DragEvent): void {
  if (!e.dataTransfer) return
  e.preventDefault()
  e.dataTransfer.dropEffect = 'copy'
  isDragOver.value = true
}

function onDragLeave(e: DragEvent): void {
  if (!containerRef.value) return
  const rel = e.relatedTarget as Node | null
  if (rel && containerRef.value.contains(rel)) return
  isDragOver.value = false
}

function onDrop(e: DragEvent): void {
  e.preventDefault()
  isDragOver.value = false
  const raw = e.dataTransfer?.getData('application/json')
  if (!raw) return
  try {
    const payload = JSON.parse(raw)
    if (payload && typeof payload.nodeId === 'string') {
      emit('node-drop', payload)
    }
  } catch (err) {
    console.warn('[NvlGraph] drop payload 파싱 실패:', err)
  }
}

// ============================================================================
// 스타일 업데이트 (GraphStylePanel에서 호출)
// ============================================================================

function updateNodeStyles(): void {
  if (!nvlInstance.value) return
  const updates: PartialNode[] = []
  for (const [id, n] of nodeMap.entries()) {
    const labels = (n.properties?.labels as string[]) || ['Unknown']
    const color = getNodeColor(labels)
    const size = getNodeSize(labels)
    if (n.color !== color || n.size !== size) {
      updates.push({ id, color, size })
      nodeMap.set(id, { ...n, color, size })
    }
  }
  if (updates.length > 0) {
    nvlInstance.value.updateElementsInGraph(updates, [])
    updateStats()
  }
}

function updateRelationshipStyles(): void {
  if (!nvlInstance.value) return
  const updates: PartialRelationship[] = []
  for (const [id, r] of relationshipMap.entries()) {
    const type = r.caption || 'UNKNOWN'
    const color = getRelationshipColor(type)
    const width = getRelationshipWidth(type)
    if (r.color !== color || r.width !== width) {
      updates.push({ id, color, width })
      relationshipMap.set(id, { ...r, color, width })
    }
  }
  if (updates.length > 0) {
    nvlInstance.value.updateElementsInGraph([], updates)
    updateStats()
  }
}

function updateAllStyles(): void {
  updateNodeStyles()
  updateRelationshipStyles()
}

// ============================================================================
// 라이프사이클
// ============================================================================

onMounted(() => {
  if (props.graphData.nodes.length > 0) initNvl()
})

onUnmounted(() => {
  if (containerRef.value && contextMenuHandler) {
    containerRef.value.removeEventListener('contextmenu', contextMenuHandler)
  }
  if (documentClickHandler) {
    document.removeEventListener('click', documentClickHandler)
  }
  destroyNvl()
})

// ============================================================================
// Watchers
// ============================================================================

watch(() => props.graphData, () => {
  syncGraph()
}, { deep: false })

watch(() => props.labelFilters, () => {
  syncGraph()
}, { deep: true })

watch([() => props.selectedNodeId, () => props.selectedRelationshipId], ([newNodeId, newRelId], [oldNodeId, oldRelId]) => {
  if (!nvlInstance.value || (newNodeId === oldNodeId && newRelId === oldRelId)) return

  const nodesToUpdate: PartialNode[] = []
  const relsToUpdate: PartialRelationship[] = []

  if (oldNodeId) nodesToUpdate.push({ id: oldNodeId, selected: false })
  if (newNodeId) nodesToUpdate.push({ id: newNodeId, selected: true })
  if (oldRelId) relsToUpdate.push({ id: oldRelId, selected: false })
  if (newRelId) relsToUpdate.push({ id: newRelId, selected: true })

  if (nodesToUpdate.length > 0 || relsToUpdate.length > 0) {
    nvlInstance.value.updateElementsInGraph(nodesToUpdate, relsToUpdate)
  }
})

// ============================================================================
// Public API
// ============================================================================

defineExpose({
  updateNodeStyles,
  updateRelationshipStyles,
  updateAllStyles,
  nodeStats,
  relationshipStats,
  nodeCount: () => nodeMap.size,
  relationshipCount: () => relationshipMap.size
})
</script>

<template>
  <div
    class="nvl-graph"
    :class="{ 'drag-over': isDragOver }"
    ref="containerRef"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <!-- 컨텍스트 메뉴 -->
    <Transition name="fade">
      <div
        v-if="contextMenuVisible && contextMenuNodeId"
        ref="contextMenuRef"
        class="context-menu"
        :style="{ left: `${contextMenuPosition.x}px`, top: `${contextMenuPosition.y}px` }"
        @click.stop.prevent
        @mousedown.stop.prevent
      >
        <button
          class="context-menu-item danger"
          @mousedown.stop.prevent="handleRemoveFromCanvas($event)"
        >
          <span class="icon">🗑</span>
          <span>캔버스에서 제거</span>
        </button>
      </div>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
.nvl-graph {
  width: 100%;
  height: 100%;
  min-height: 400px;
  position: relative;
  background: var(--color-canvas-bg);

  &.drag-over::after {
    content: '';
    position: absolute;
    inset: 8px;
    border: 2px dashed var(--color-accent, #74c0fc);
    background: rgba(116, 192, 252, 0.05);
    border-radius: 8px;
    pointer-events: none;
    z-index: 5;
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

.context-menu {
  position: fixed;
  z-index: 1000;
  background: var(--color-bg-secondary, #1e1f23);
  border: 1px solid var(--color-border, #373a40);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  padding: 4px;
  min-width: 160px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.context-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  border-radius: 4px;
  font-size: 13px;
  color: var(--color-text, #c1c2c5);
  transition: background-color 0.15s;

  &:hover {
    background: var(--color-bg-hover, #2c2e33);
  }

  &.danger {
    color: #fa5252;
    &:hover {
      background: rgba(250, 82, 82, 0.12);
    }
  }

  .icon {
    font-size: 14px;
    width: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
}
</style>
