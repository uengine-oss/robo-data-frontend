<script setup lang="ts">
/**
 * NvlGraph.vue
 * Neo4j NVL 기반 그래프 시각화 컴포넌트 (1-hop 캔버스 전용).
 *
 * 입력(graphData)는 canvasStore.canvasGraphData — 사용자가 Navigator에서 드래그-드롭한
 * 노드와 그 1-hop 이웃만 포함된 소규모 부분집합이다.
 * 따라서 배치 렌더링/개수 제한/대기 큐 같은 장치는 필요 없으며,
 * props 변경 시 즉시 diff 하여 NVL에 반영한다.
 */

import { logger } from '@/shared/utils/logger'
import { logicalModeName } from '@/shared/utils/nodeClassify'
import { ref, computed, onMounted, onUnmounted, watch, shallowRef, nextTick } from 'vue'
import { NVL } from '@neo4j-nvl/base'
import {
  ClickInteraction,
  DragNodeInteraction,
  PanInteraction,
  ZoomInteraction
} from '@neo4j-nvl/interaction-handlers'
import type { GraphData, GraphNode, GraphLink, NvlNode, NvlRelationship } from '@/shared/types'
import type { PartialNode, PartialRelationship } from '@neo4j-nvl/base'
import { getNodeColor, getRelationshipColor, getRelationshipWidth, getNodeSize } from '@/shared/config/graphStyles'
import { useNavigatorStore } from '@/shared/stores/navigator'
import { storeToRefs } from 'pinia'
import { useGroupHulls, type HullLevel } from './useGroupHulls'

// ============================================================================
// 타입 정의
// ============================================================================

interface Props {
  graphData: GraphData
  selectedNodeId?: string
  selectedRelationshipId?: string
  /** 노드 라벨 필터 (비어있으면 전체 표시) */
  labelFilters?: string[]
  /**
   * 중첩 영역(헐) 레벨들 — 바깥→안 순서(예: [패키지, 파일]). 빈 배열/미지정이면 표시 안 함.
   * 그룹 키/라벨은 호출측(GraphTab)이 계층 조상맵 기반 closure 로 주입(spec 021).
   */
  hullLevels?: HullLevel[]
  /**
   * 클러스터 분리 키(spec 022) — 노드를 이 키로 묶어 **각 그룹을 화면의 떨어진 구역으로 평행이동**
   * 해서 영역 겹침을 없앤다. force 레이아웃으로 그룹 내부 구조는 살리고 그룹째 이동만 한다.
   * null/미지정이면 분리 안 함. 그룹키/closure는 GraphTab이 주입.
   */
  clusterKeyOf?: ((node: GraphNode) => string | null) | null
  /**
   * 노드 색 기준.
   *  - 'label'(기본) → 라벨별 색(getNodeColor)
   *  - 'health'      → 건강지표(risk)별 색 — 나쁜 함수 강조. 지표 없는 노드는 회색.
   */
  colorMode?: 'label' | 'health'
  /** 표시할 관계 타입 필터 (비어있으면 전체). 예: ['READS'] = 읽기만, ['WRITES'] = 쓰기만. */
  relFilter?: string[]
  /** 숨길 관계 타입 (끄고/켜기 blacklist, spec 020). 여기 든 타입은 그리지 않는다. */
  hiddenRelTypes?: string[]
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
    physics: { enabled: false },   // 비물리 배치(레이아웃 1회) — 렌더 후 fit()으로 카메라 맞춤
    updateOnDrag: false,
    updateOnClick: false
  } as any
} as const

// ============================================================================
// Props & Emits
// ============================================================================

const props = withDefaults(defineProps<Props>(), {
  labelFilters: () => [],
  hullLevels: () => [],
  clusterKeyOf: null,
  colorMode: 'label',
  relFilter: () => [],
  hiddenRelTypes: () => []
})

// 건강지표(risk)별 노드 색 — getNodeColor(공유 유틸)는 건드리지 않고 여기서만 override.
// 색 의미(사용자 확정): 위험=빨강 / 주의=노랑 / 양호=파랑 (green 대신 blue).
const HEALTH_COLORS: Record<string, string> = {
  high: '#fa5252',   // 위험 — 빨강
  medium: '#ffd43b', // 주의 — 노랑
  low: '#4dabf7',    // 양호 — 파랑
}
const HEALTH_NEUTRAL = '#868e96' // 위험도 미산정 노드(드물게 risk_level 없는 루틴)

/** colorMode 에 따른 노드 색 — 'health' 면 risk 기반, 아니면 라벨 기반. */
function resolveNodeColor(labels: string[], properties?: Record<string, unknown>): string {
  if (props.colorMode === 'health') {
    const risk = String(properties?.risk_level ?? '')
    return HEALTH_COLORS[risk] ?? HEALTH_NEUTRAL
  }
  return getNodeColor(labels)
}

const emit = defineEmits<{
  'node-select': [node: GraphNode | null]
  'relationship-select': [relationship: GraphLink | null]
  'node-delete': [nodeId: string]
  'node-collapse': [nodeId: string]
  'node-isolate-label': [nodeId: string]
  'node-drop': [payload: { nodeId: string; nodeType?: string; labels?: string[] }]
  'node-expand': [nodeId: string]
  'clear-filters': []
  'open-navigator': []
}>()

// ============================================================================
// 논리명/물리명 토글 (navigator store 공유)
// ============================================================================

const navigatorStore = useNavigatorStore()
const { showLogicalNames } = storeToRefs(navigatorStore)

// ============================================================================
// 상태
// ============================================================================

const containerRef = ref<HTMLElement>()
const nvlInstance = shallowRef<NVL | null>(null)
const isInitializing = ref(false)

// 그룹 영역(바운디드 컨텍스트) 오버레이. 변환·hull·동기화는 useGroupHulls 가 캡슐화하고,
// 여기서는 라이프사이클 배선만 한다(단일 책임 분리).
const groupHulls = useGroupHulls(
  containerRef,
  nvlInstance,
  () => props.graphData.nodes,
  () => ({ levels: props.hullLevels ?? [] })
)

const nodeStats = ref<Map<string, NodeStat>>(new Map())
const relationshipStats = ref<Map<string, NodeStat>>(new Map())

/** 현재 필터/렌더 결과로 캔버스에 표시 중인 노드 수 */
const visibleNodeCount = ref(0)

/**
 * "필터는 걸려있는데 매치되는 노드가 0건" 상태 — 빈 캔버스에 안내 카드 표시.
 * 데이터 자체가 비었거나 필터가 없는 경우엔 표시하지 않는다 (각각 다른 상태).
 */
const showFilterEmptyOverlay = computed(() =>
  props.labelFilters.length > 0
  && props.graphData.nodes.length > 0
  && visibleNodeCount.value === 0
)

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

function resolveCaption(node: GraphNode): string {
  const physical = (node.properties?.name as string) || node.labels?.[node.labels.length - 1] || node.id
  // 논리명 모드는 단일 결정처에 위임(논리명→구조한글→'논리명 없음·물리').
  return showLogicalNames.value ? logicalModeName(node, physical) : physical
}

function toNvlNode(node: GraphNode, isSelected = false): NvlNode {
  return {
    id: node.id,
    caption: resolveCaption(node),
    color: resolveNodeColor(node.labels, node.properties),
    size: getNodeSize(node.labels),
    selected: isSelected,
    properties: {
      ...node.properties,
      labels: node.labels
    }
  }
}

function toNvlRelationship(link: GraphLink, isSelected = false): NvlRelationship {
  const isVirtual = link.properties?.virtual === true
  const base: NvlRelationship = {
    id: link.id,
    from: link.source,
    to: link.target,
    caption: link.type,
    color: getRelationshipColor(link.type),
    width: getRelationshipWidth(link.type),
    selected: isSelected,
    properties: link.properties
  }
  if (isVirtual) {
    // 가상 링크: 점선 스타일 힌트. NVL 이 옵션을 무시해도 색/두께로 구분됨.
    ;(base as any).style = 'dashed'
    ;(base as any).dashed = true
  }
  return base
}

function matchesLabelFilter(node: GraphNode): boolean {
  if (!props.labelFilters || props.labelFilters.length === 0) return true
  const labels = node.labels || ['Unknown']
  const targets = props.labelFilters.map(l => l.toUpperCase())
  return labels.some(label => targets.includes(label.toUpperCase()))
}

/** 관계 타입 필터 — 숨김(blacklist) 우선, 그다음 표시 whitelist(읽기만/쓰기만). */
function matchesRelFilter(link: GraphLink): boolean {
  if (props.hiddenRelTypes && props.hiddenRelTypes.includes(link.type)) return false
  if (!props.relFilter || props.relFilter.length === 0) return true
  return props.relFilter.includes(link.type)
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
    if (!matchesRelFilter(link)) continue
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
      // 레이아웃이 움직이는 매 프레임/완료 시 영역 오버레이도 같이 갱신
      onLayoutStep: () => groupHulls.redraw(),
      onLayoutDone: () => {
        isInitializing.value = false
        separateClusters()   // 그룹별로 떨어뜨려 겹침 제거(spec 022) — fit 전에 위치 확정
        fitView()
        groupHulls.redraw()
      }
    }
  )

  setupInteractions()
  groupHulls.attach()
  updateStats()
  visibleNodeCount.value = nodeMap.size
}

/**
 * 카메라를 현재 캔버스 노드 전체에 맞춘다(zoom/pan 조정).
 * NVL 비물리 배치는 노드를 원점이 아닌 곳(grid)에 둘 수 있어, fit 없으면 화면 밖이라
 * "빈 화면"처럼 보인다 — 보기모드(대량 주입)·드래그-드롭 후 호출해 노드가 보이게 한다.
 */
function fitView(): void {
  const nvl = nvlInstance.value
  if (!nvl) return
  const ids = [...nodeMap.keys()]
  if (ids.length === 0) return
  try { nvl.fit(ids) } catch { /* 레이아웃 준비 전 호출은 무해 */ }
}

/**
 * 클러스터 분리(spec 022) — clusterKeyOf 로 노드를 그룹지어, **각 그룹을 통째로 떨어진
 * 위치(큰 원 둘레)로 평행이동**한다. force 레이아웃이 만든 그룹 내부 구조는 보존하고
 * 그룹간 거리만 벌려 영역(헐) 겹침을 없앤다. 2그룹 미만이면 분리할 게 없어 무동작.
 */
function separateClusters(): void {
  const keyOf = props.clusterKeyOf
  const nvl = nvlInstance.value
  if (!keyOf || !nvl) return
  const positions = nvl.getNodePositions()
  if (positions.length === 0) return

  const nodeById = new Map(props.graphData.nodes.map(n => [n.id, n]))
  const posById = new Map(positions.map(p => [p.id, { x: p.x, y: p.y }]))

  // 그룹별 멤버 + 무게중심
  const groups = new Map<string, { ids: string[]; cx: number; cy: number }>()
  for (const p of positions) {
    const node = nodeById.get(p.id)
    if (!node || typeof p.x !== 'number' || Number.isNaN(p.x)) continue
    const k = keyOf(node) ?? '__ungrouped__'
    let g = groups.get(k)
    if (!g) { g = { ids: [], cx: 0, cy: 0 }; groups.set(k, g) }
    g.ids.push(p.id); g.cx += p.x; g.cy += p.y
  }
  if (groups.size <= 1) return   // 분리 불필요

  // 각 그룹 반경 → 둘레 간격 확보한 ring 반지름
  const arr = [...groups.values()].map(g => {
    g.cx /= g.ids.length; g.cy /= g.ids.length
    let r = 60
    for (const id of g.ids) {
      const p = posById.get(id)!
      const d = Math.hypot(p.x - g.cx, p.y - g.cy)
      if (d > r) r = d
    }
    return { ids: g.ids, cx: g.cx, cy: g.cy, r }
  })
  const GAP = 160
  const circumference = arr.reduce((s, g) => s + 2 * g.r + GAP, 0)
  const ringR = Math.max(circumference / (2 * Math.PI), 320)

  // 각 그룹을 ring 위 목표 지점으로 평행이동(내부 구조 보존)
  const updates: { id: string; x: number; y: number }[] = []
  arr.forEach((g, i) => {
    const angle = (i / arr.length) * Math.PI * 2 - Math.PI / 2
    const tx = Math.cos(angle) * ringR
    const ty = Math.sin(angle) * ringR
    const dx = tx - g.cx, dy = ty - g.cy
    for (const id of g.ids) {
      const p = posById.get(id)!
      updates.push({ id, x: p.x + dx, y: p.y + dy })
    }
  })
  try { nvl.setNodePositions(updates as unknown as NvlNode[], false) } catch { /* 무해 */ }
}

function destroyNvl(): void {
  closeContextMenu()
  groupHulls.detach()
  if (nvlInstance.value) {
    nvlInstance.value.destroy()
    nvlInstance.value = null
  }
  nodeMap.clear()
  relationshipMap.clear()
  isInitializing.value = false
  visibleNodeCount.value = 0
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
    if (!matchesRelFilter(link)) continue
    const r = toNvlRelationship(link, props.selectedRelationshipId === link.id)
    relationshipMap.set(link.id, r)
    newNvlRels.push(r)
  }

  if (newNvlNodes.length > 0 || newNvlRels.length > 0) {
    nvlInstance.value.addAndUpdateElementsInGraph(newNvlNodes, newNvlRels)
  }

  // 대량 주입(보기모드 전환 등)이면 클러스터 분리 후 카메라 맞춤. 드래그-드롭 단건(1~2개)은
  // 기존 화면을 유지하려고 재배치/재맞춤하지 않는다(수동 배치 보존).
  if (newNvlNodes.length >= 3) {
    separateClusters()
    fitView()
  }

  updateStats()
  visibleNodeCount.value = nodeMap.size
  groupHulls.redraw()
}

// ============================================================================
// 인터랙션
// ============================================================================

let contextMenuHandler: ((e: MouseEvent) => void) | null = null
let documentClickHandler: ((e: MouseEvent) => void) | null = null
let hullMouseDownHandler: ((e: MouseEvent) => void) | null = null

// ── 헐(영역) 드래그 (spec 021) ──────────────────────────────────────────
// 헐 영역(노드 위 아님)을 끌면 그 그룹 멤버 노드가 통째로 같이 이동(setNodePositions).
// NVL 은 mousedown/move/up 으로 팬·노드드래그를 처리하므로, capture 단계 mousedown 에서
// 헐 hit 이면 stopPropagation 으로 NVL 을 차단하고 직접 그룹 이동을 수행한다.
let hullDrag: { ids: Set<string>; lastX: number; lastY: number } | null = null

function onHullMouseDown(e: MouseEvent): void {
  if (e.button !== 0 || !nvlInstance.value || !containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  const x = e.clientX - rect.left, y = e.clientY - rect.top
  if (groupHulls.isNearNode(x, y)) return        // 노드 위 → NVL 노드 드래그에 양보
  const ids = groupHulls.hitTest(x, y)
  if (!ids || ids.length === 0) return            // 빈 영역 → NVL 팬에 양보
  hullDrag = { ids: new Set(ids), lastX: e.clientX, lastY: e.clientY }
  e.stopPropagation()
  e.preventDefault()
  window.addEventListener('mousemove', onHullMouseMove, true)
  window.addEventListener('mouseup', onHullMouseUp, true)
}

function onHullMouseMove(e: MouseEvent): void {
  const nvl = nvlInstance.value
  if (!hullDrag || !nvl) return
  const scale = nvl.getScale() || 1
  const dpr = window.devicePixelRatio || 1
  const dxW = (e.clientX - hullDrag.lastX) * dpr / scale
  const dyW = (e.clientY - hullDrag.lastY) * dpr / scale
  const updates = nvl.getNodePositions()
    .filter(p => hullDrag!.ids.has(p.id))
    .map(p => ({ id: p.id, x: p.x + dxW, y: p.y + dyW }))
  if (updates.length) nvl.setNodePositions(updates as unknown as NvlNode[], false)
  hullDrag.lastX = e.clientX
  hullDrag.lastY = e.clientY
  groupHulls.redraw()
}

function onHullMouseUp(): void {
  hullDrag = null
  window.removeEventListener('mousemove', onHullMouseMove, true)
  window.removeEventListener('mouseup', onHullMouseUp, true)
}

function setupInteractions(): void {
  if (!nvlInstance.value || !containerRef.value) return

  const nvl = nvlInstance.value
  const click = new ClickInteraction(nvl)

  // 더블클릭 탐지 (NVL 은 별도 onNodeDoubleClick 훅이 없으므로 onNodeClick 에서 판정)
  let lastClickNodeId: string | null = null
  let lastClickTime = 0
  const DBL_CLICK_MS = 300

  click.updateCallback('onNodeClick', (node: { id: string } | null) => {
    if (!node?.id) return
    const now = Date.now()
    if (lastClickNodeId === node.id && now - lastClickTime < DBL_CLICK_MS) {
      // 더블클릭 — 1-hop 이웃 확장 요청
      emit('node-expand', node.id)
      lastClickNodeId = null
      lastClickTime = 0
      return
    }
    lastClickNodeId = node.id
    lastClickTime = now
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

  // 헐 드래그 — capture 단계로 NVL(canvas) 보다 먼저 mousedown 가로채기.
  hullMouseDownHandler = onHullMouseDown
  containerRef.value.addEventListener('mousedown', hullMouseDownHandler, true)

  new DragNodeInteraction(nvl)

  // 캔버스 줌/이동 시 영역 오버레이를 같은 변환으로 다시 그림 (NVL 과 desync 방지).
  // NVL 은 setPan/setZoom 을 콜백 호출 전에 실행하고 콜백 반환값은 무시하므로
  // (interaction-handlers base.js) 기본 동작에 영향 없다.
  const panInteraction = new PanInteraction(nvl)
  panInteraction.updateCallback('onPan', () => groupHulls.redraw())
  const zoomInteraction = new ZoomInteraction(nvl)
  zoomInteraction.updateCallback('onZoom', () => groupHulls.redraw())
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

function handleCollapse(event?: Event): void {
  if (event) {
    event.stopPropagation()
    event.preventDefault()
  }
  const id = contextMenuNodeId.value
  if (!id) return
  emit('node-collapse', id)
  closeContextMenu()
}

function handleIsolateLabel(event?: Event): void {
  if (event) {
    event.stopPropagation()
    event.preventDefault()
  }
  const id = contextMenuNodeId.value
  if (!id) return
  emit('node-isolate-label', id)
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
    logger.warn('[NvlGraph] drop payload 파싱 실패:', err)
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
    const color = resolveNodeColor(labels, n.properties)
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
  if (containerRef.value && hullMouseDownHandler) {
    containerRef.value.removeEventListener('mousedown', hullMouseDownHandler, true)
  }
  onHullMouseUp()   // 혹시 드래그 중 unmount 시 window 리스너 정리
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

// 관계 필터(읽기만/쓰기만 + 숨김)는 엣지 기준이라 노드중심 syncGraph 로 못 지움 → 재빌드.
watch([() => props.relFilter, () => props.hiddenRelTypes], () => {
  if (nvlInstance.value) { destroyNvl(); initNvl() }
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

watch(() => props.hullLevels, () => {
  groupHulls.redraw()
})

// 클러스터 키가 바뀌면(보기 전환) 기존 위치를 새 그룹 기준으로 다시 분리.
watch(() => props.clusterKeyOf, () => {
  if (nvlInstance.value) { separateClusters(); fitView(); groupHulls.redraw() }
})

// 색 기준(라벨↔건강) 전환 시 이미 그려진 노드 색을 즉시 갱신
watch(() => props.colorMode, () => {
  updateNodeStyles()
})

watch(showLogicalNames, () => {
  if (!nvlInstance.value) return
  const updates: PartialNode[] = []
  for (const node of props.graphData.nodes) {
    if (!nodeMap.has(node.id)) continue
    updates.push({ id: node.id, caption: resolveCaption(node) })
  }
  if (updates.length > 0) {
    nvlInstance.value.updateElementsInGraph(updates, [])
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
          class="context-menu-item"
          @mousedown.stop.prevent="handleCollapse($event)"
        >
          <span class="icon">▾</span>
          <span>이웃 접기</span>
        </button>
        <button
          class="context-menu-item"
          @mousedown.stop.prevent="handleIsolateLabel($event)"
          title="이 노드와 같은 라벨인 노드만 남기고 나머지는 캔버스에서 제거"
        >
          <span class="icon">⌖</span>
          <span>같은 라벨만 남기기</span>
        </button>
        <button
          class="context-menu-item danger"
          @mousedown.stop.prevent="handleRemoveFromCanvas($event)"
        >
          <span class="icon">🗑</span>
          <span>캔버스에서 제거</span>
        </button>
      </div>
    </Transition>

    <!-- 필터 적용 결과 0건 안내 (필터 활성 + 데이터 있음 + 매치 0) -->
    <Transition name="fade">
      <div v-if="showFilterEmptyOverlay" class="filter-empty-overlay">
        <div class="filter-empty-card">
          <div class="filter-empty-title">필터에 매치되는 노드가 없습니다</div>
          <div class="filter-empty-hint">현재 캔버스에 활성 필터에 해당하는 노드가 없습니다.</div>
          <div class="filter-empty-actions">
            <button class="btn-primary" @click="emit('clear-filters')">필터 해제</button>
            <button class="btn-secondary" @click="emit('open-navigator')">Navigator 열기</button>
          </div>
        </div>
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

// ============================================================================
// 필터 매치 0건 안내 오버레이
// ============================================================================

.filter-empty-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 10;
}

.filter-empty-card {
  pointer-events: auto;
  background: var(--color-bg-secondary, #1e1f23);
  border: 1px solid var(--color-border, #373a40);
  border-radius: 12px;
  padding: 20px 24px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  max-width: 320px;
  text-align: center;
}

.filter-empty-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-bright, #f8fafc);
  margin-bottom: 6px;
}

.filter-empty-hint {
  font-size: 12px;
  color: var(--color-text-muted, #94a3b8);
  margin-bottom: 16px;
  line-height: 1.5;
}

.filter-empty-actions {
  display: flex;
  gap: 8px;
  justify-content: center;

  button {
    padding: 6px 14px;
    font-size: 12px;
    font-weight: 500;
    border-radius: 6px;
    cursor: pointer;
    border: 1px solid transparent;
    transition: all 0.15s ease;
  }

  .btn-primary {
    background: var(--color-accent, #74c0fc);
    color: white;

    &:hover { filter: brightness(1.08); }
  }

  .btn-secondary {
    background: transparent;
    border-color: var(--color-border, #373a40);
    color: var(--color-text, #c1c2c5);

    &:hover { background: var(--color-bg-hover, #2c2e33); }
  }
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
