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
   * 클러스터 키 → 앵커(대표 노드) 라벨(spec 022). clusterKeyOf 와 짝. 각 클러스터 중심에
   * 이 라벨의 합성 앵커 노드를 두고, 끌면 그룹째 이동한다. 미지정이면 키를 그대로 라벨로.
   */
  clusterLabelOf?: ((key: string) => string) | null
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
  /**
   * 캔버스 오른쪽이 패널(노드 상세/통계)에 가려지는 폭(px). fitView 가 이 영역을 빼고 프레임해
   * 우측에 놓인 클러스터가 패널 뒤로 숨지 않게 한다(spec 022). 0이면 풀폭.
   */
  rightInset?: number
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
  maxZoom: 2,        // 확대 상한 — 과대확대·헐 삐짐 방지(US4)
  minZoom: 0.08,
  layout: 'forceDirected' as const,
  layoutOptions: {
    // ★라이브 물리. 앵커↔멤버를 관계(링크)로 이으면 force 가 멤버를 앵커 둘레 원으로 모으고,
    // 앵커끼리 반발해 군집이 분리된다. 드래그하면 reheat 되어 출렁이며 헐도 따라온다 —
    // NVL 네이티브 물리/드래그를 그대로(억지 좌표계산·고정 없음).
    physics: { enabled: true },
    updateOnDrag: true,
    updateOnClick: false,
    updateLayoutOnChange: true,
    separateComponents: false,
    nodeRepulsion: 800,
    linkDistance: 80,
    gravity: 0.05
  } as any
} as const

// 그룹 앵커(대표 노드, spec 022). 합성 노드 id 접두사 + 강조색/크기(일반 노드와 구분).
const ANCHOR_PREFIX = '__anchor__:'
const ANCHOR_COLOR = '#f59f00'   // 주황 — 앵커 전용(라벨색과 충돌 없음)
const ANCHOR_SIZE = 46           // 멤버보다 약간 크게(허브). 이름은 캡션으로 표시(헐 라벨 대체)
// 앵커↔멤버 헬퍼 링크(허브 스포크) — 배경에 가깝게 옅게 칠해 거의 안 보이게.
const ANCHOR_LINK_PREFIX = '__anchorlink__:'
const ANCHOR_LINK_COLOR = '#32353c'

// ============================================================================
// Props & Emits
// ============================================================================

const props = withDefaults(defineProps<Props>(), {
  labelFilters: () => [],
  hullLevels: () => [],
  clusterKeyOf: null,
  clusterLabelOf: null,
  colorMode: 'label',
  relFilter: () => [],
  hiddenRelTypes: () => [],
  rightInset: 0
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
let needsFit = false   // 라이브 물리 정착(onLayoutDone) 시 1회 프레임할지 — 최초/뷰전환에만 true

// 그룹 영역(바운디드 컨텍스트) 오버레이. 변환·hull·동기화는 useGroupHulls 가 캡슐화하고,
// 여기서는 라이프사이클 배선만 한다(단일 책임 분리).
const groupHulls = useGroupHulls(
  containerRef,
  nvlInstance,
  () => props.graphData.nodes,
  () => ({ levels: props.hullLevels ?? [] }),
  // 클러스터 보기는 실엣지를 NVL force 에서 빼고 오버레이로 그린다(군집 분리 유지). 비클러스터는 NVL 이.
  () => props.clusterKeyOf ? props.graphData.links.filter(matchesRelFilter) : []
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
  // 클러스터 보기: 실엣지(R/W 등)는 force 에서 제외해야 앵커로 군집 분리가 된다(NVL force 는
  // 교차엣지를 못 약화시켜 전부 한 덩어리로 뭉침). 그 엣지는 useGroupHulls 오버레이가 직접 그린다.
  const clusterMode = !!props.clusterKeyOf
  if (!clusterMode) {
    for (const link of props.graphData.links) {
      if (!visibleIds.has(link.source) || !visibleIds.has(link.target)) continue
      if (!matchesRelFilter(link)) continue
      const r = toNvlRelationship(link, props.selectedRelationshipId === link.id)
      relationshipMap.set(link.id, r)
      rels.push(r)
    }
  }

  await nextTick()

  nvlInstance.value = new NVL(
    containerRef.value,
    nodes,
    rels,
    NVL_OPTIONS,
    {
      // 라이브 물리: 매 틱 헐 추종, 정착(onLayoutDone) 시 최초/뷰전환에만 1회 프레임(드래그 후엔 안 튐).
      onLayoutStep: () => groupHulls.redraw(),
      onLayoutDone: () => { if (needsFit) fitView(); groupHulls.redraw() }
    }
  )

  setupInteractions()
  groupHulls.attach()
  updateStats()
  visibleNodeCount.value = nodeMap.size

  // 다음 프레임에 앵커/링크 주입 → 라이브 물리가 군집을 형성. 퍼지며 정착하므로 시간차로 프레임.
  requestAnimationFrame(() => {
    isInitializing.value = false
    layoutClusters()
    scheduleFit()
    groupHulls.redraw()
  })
}

/**
 * 클러스터 보기는 R/W 를 force 에서 빼 군집이 퍼지며 천천히 정착한다 → onLayoutDone 한 번으론
 * 이른 시점을 잡아 한 군집만 확대된다. 정착 시간을 두고 여러 번 프레임해 **마지막 정착**을 잡되,
 * 사용자가 캔버스를 만지면(needsFit=false) 즉시 멈춰 카메라 통제를 넘긴다.
 */
let fitTimer: ReturnType<typeof setTimeout> | undefined
function scheduleFit(): void {
  needsFit = true
  if (fitTimer) clearTimeout(fitTimer)
  let tries = 0
  const tick = () => {
    if (!needsFit || !nvlInstance.value) return
    fitView(); groupHulls.redraw()
    if (++tries < 5) fitTimer = setTimeout(tick, 450)
  }
  fitTimer = setTimeout(tick, 450)
}

/**
 * 카메라를 현재 캔버스 노드 전체에 맞춘다(zoom/pan). NVL `fit()` 은 패딩·가림영역 옵션이 없어
 * 우측 패널 뒤로 클러스터가 숨는 문제가 있다 → 노드 bbox 를 **가시영역(전체폭 − rightInset)**
 * 안에 여백 두고 직접 프레임한다. setZoomAndPan 만 쓰므로 재레이아웃은 일어나지 않는다.
 */
function fitView(): void {
  const nvl = nvlInstance.value
  const host = containerRef.value
  if (!nvl || !host) return
  const pts = nvl.getNodePositions().filter(p =>
    (nodeMap.has(p.id) || anchorMembers.has(p.id)) && typeof p.x === 'number' && !Number.isNaN(p.x))
  if (pts.length === 0) return

  const xs = pts.map(p => p.x), ys = pts.map(p => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const bw = Math.max(maxX - minX, 1), bh = Math.max(maxY - minY, 1)
  const bx = (minX + maxX) / 2, by = (minY + maxY) / 2

  const dpr = window.devicePixelRatio || 1
  const cssW = host.clientWidth, cssH = host.clientHeight
  const PAD = 96   // 노드 반지름 + 헐 여백 + 라벨 여유(CSS px)
  const visW = Math.max(cssW - (props.rightInset || 0), 120)
  // scale = world→canvas px 배율. bbox 를 가시영역에 PAD 두고 맞추는 최대 배율.
  const scale = Math.min(
    Math.max(2, (visW - 2 * PAD)) * dpr / bw,
    Math.max(2, (cssH - 2 * PAD)) * dpr / bh,
    2,   // 과도 확대 방지
  )
  // bbox 중심을 가시영역(좌측, 패널 제외) 중앙에 오게 pan. screenX=(wx-panX)·scale/dpr+cssW/2.
  const panX = bx + ((props.rightInset || 0) / 2) * dpr / scale
  try { nvl.setZoomAndPan(scale, panX, by) } catch { /* 무해 */ }
}

/**
 * 클러스터 보기(spec 022) — clusterKeyOf 로 멤버를 그룹지어, 각 그룹에 앵커(대표 노드)를 두고
 * **앵커↔멤버를 관계(링크)로 연결만** 한다. 좌표는 일절 고정/계산하지 않는다.
 * 라이브 물리가 알아서: 앵커 링크 인력 → 멤버가 앵커 둘레 원으로 모이고, 앵커끼리 반발 → 군집 분리,
 * 드래그하면 reheat → 출렁이며 헐도 따라온다(NVL 기본 상호작용 그대로). 비클러스터 보기는 무동작.
 */
function layoutClusters(): void {
  const keyOf = props.clusterKeyOf
  const nvl = nvlInstance.value
  if (!nvl) return
  if (!keyOf) { clearAnchors(); return }

  const groups = new Map<string, string[]>()
  for (const node of props.graphData.nodes) {
    if (!nodeMap.has(node.id)) continue
    const key = keyOf(node) ?? '__ungrouped__'
    const ids = groups.get(key)
    if (ids) ids.push(node.id)
    else groups.set(key, [node.id])
  }
  if (groups.size === 0) { clearAnchors(); return }

  const labelOf = props.clusterLabelOf
  rebuildAnchors([...groups.entries()].map(([key, ids]) => ({
    key, memberIds: ids, label: labelOf ? labelOf(key) : key,
  })))
}

/**
 * 그룹 앵커 동기화(spec 022) — 클러스터마다 ①앵커 노드(대표) ②앵커→멤버 옅은 링크(허브 스포크)를
 * NVL 에 주입만 한다(위치 고정 없음). updateLayoutOnChange 로 라이브 물리가 이 링크를 반영해
 * 멤버를 앵커 둘레 원으로 모은다. 앵커도 고정 안 해 네이티브 드래그로 끌면 출렁이며 따라온다.
 * 앵커·링크는 props.graphData 에 없는 가상 요소라 stats/selection/필터에서 자연히 제외된다.
 */
function rebuildAnchors(specs: Array<{ key: string; memberIds: string[]; label: string }>): void {
  const nvl = nvlInstance.value
  if (!nvl) return
  clearAnchors()

  const nodes: NvlNode[] = []
  const rels: NvlRelationship[] = []
  for (const s of specs) {
    const id = ANCHOR_PREFIX + s.key
    anchorMembers.set(id, s.memberIds)
    nodes.push({
      id, caption: s.label, color: ANCHOR_COLOR, size: ANCHOR_SIZE,
      selected: false, properties: { __anchor: true },
    } as unknown as NvlNode)
    for (const m of s.memberIds) {
      const lid = ANCHOR_LINK_PREFIX + id + '->' + m
      anchorLinkIds.push(lid)
      rels.push({ id: lid, from: id, to: m, color: ANCHOR_LINK_COLOR, width: 1, properties: { __anchorlink: true } } as unknown as NvlRelationship)
    }
  }
  if (nodes.length) { try { nvl.addAndUpdateElementsInGraph(nodes, rels) } catch { /* 무해 */ } }
}

/** 앵커 노드 + 헬퍼 링크를 모두 제거(보기 전환·정리). */
function clearAnchors(): void {
  const nvl = nvlInstance.value
  if (nvl) {
    if (anchorLinkIds.length) { try { nvl.removeRelationshipsWithIds(anchorLinkIds) } catch { /* 무해 */ } }
    const ids = [...anchorMembers.keys()]
    if (ids.length) { try { nvl.removeNodesWithIds(ids) } catch { /* 무해 */ } }
  }
  anchorMembers.clear()
  anchorLinkIds = []
}

function destroyNvl(): void {
  closeContextMenu()
  groupHulls.detach()
  for (const it of interactions) { try { it.destroy() } catch { /* 무해 */ } }
  interactions = []
  if (nvlInstance.value) {
    nvlInstance.value.destroy()
    nvlInstance.value = null
  }
  if (fitTimer) { clearTimeout(fitTimer); fitTimer = undefined }
  needsFit = false
  onGroupDragUp()   // 드래그 중 파괴 시 window 리스너 정리
  nodeMap.clear()
  relationshipMap.clear()
  anchorMembers.clear()
  anchorLinkIds = []
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

  // 4) 추가할 관계 (양 끝이 모두 캔버스에 있을 때만). 클러스터 보기는 실엣지를 force 에서 빼고
  //    오버레이로 그리므로 NVL 엔 안 넣는다(군집 분리 유지).
  const newNvlRels: NvlRelationship[] = []
  if (!props.clusterKeyOf) {
    for (const link of props.graphData.links) {
      if (relationshipMap.has(link.id)) continue
      if (!targetIds.has(link.source) || !targetIds.has(link.target)) continue
      if (!matchesRelFilter(link)) continue
      const r = toNvlRelationship(link, props.selectedRelationshipId === link.id)
      relationshipMap.set(link.id, r)
      newNvlRels.push(r)
    }
  }

  if (newNvlNodes.length > 0 || newNvlRels.length > 0) {
    nvlInstance.value.addAndUpdateElementsInGraph(newNvlNodes, newNvlRels)
  }

  // 대량 주입(보기모드 전환 등)이면 앵커 재구성 후 물리 정착 시 프레임. 드래그-드롭 단건(1~2개)은
  // 기존 화면을 유지하려고 재배치/재맞춤하지 않는다(수동 배치 보존).
  if (newNvlNodes.length >= 3) {
    layoutClusters()
    scheduleFit()
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
let userGrabHandler: (() => void) | null = null
let anchorMouseDownHandler: ((e: MouseEvent) => void) | null = null
// NVL 인터랙션 핸들러(Click/Drag/Pan/Zoom) — 각자 컨테이너에 리스너를 단다. destroyNvl 에서
// destroy() 해야 init/destroy 반복(필터 토글) 시 리스너가 누적되지 않는다.
let interactions: Array<{ destroy(): void }> = []

// ── 그룹 앵커 (spec 022) ──────────────────────────────────────────────────
// 앵커는 멤버와 옅은 링크로 이어져 라이브 물리가 원형 군집을 만든다 — 대칭 링크라 앵커는 자연히
// 군집 중앙(대표 허브)에 쉰다. 앵커를 끌면(아래 capture mousedown 가로채기) 그 그룹(멤버+앵커)이
// **통째로 평행이동**해 중앙을 유지 — 일반 노드는 NVL 기본 드래그(그것만 출렁).
const anchorMembers = new Map<string, string[]>()   // anchorId → 멤버 노드 id[]
let anchorLinkIds: string[] = []                    // 앵커↔멤버 헬퍼 링크 id(정리용)
let groupDrag: { ids: string[]; lastX: number; lastY: number } | null = null

function onAnchorMouseDown(e: MouseEvent): void {
  if (e.button !== 0 || !nvlInstance.value) return
  const hits = nvlInstance.value.getHits(e, ['node'])?.nvlTargets?.nodes ?? []
  const anchor = hits.find(h => h.insideNode && h.data.id.startsWith(ANCHOR_PREFIX))
  if (!anchor) return                              // 앵커 아님 → NVL 노드/팬에 양보
  const members = anchorMembers.get(anchor.data.id)
  if (!members) return
  groupDrag = { ids: [anchor.data.id, ...members], lastX: e.clientX, lastY: e.clientY }
  e.stopPropagation()
  e.preventDefault()
  window.addEventListener('mousemove', onGroupDragMove, true)
  window.addEventListener('mouseup', onGroupDragUp, true)
}

function onGroupDragMove(e: MouseEvent): void {
  const nvl = nvlInstance.value
  if (!groupDrag || !nvl) return
  const scale = nvl.getScale() || 1
  const dpr = window.devicePixelRatio || 1
  const dxW = (e.clientX - groupDrag.lastX) * dpr / scale
  const dyW = (e.clientY - groupDrag.lastY) * dpr / scale
  const set = new Set(groupDrag.ids)
  const updates = nvl.getNodePositions()
    .filter(p => set.has(p.id))
    .map(p => ({ id: p.id, x: p.x + dxW, y: p.y + dyW }))
  if (updates.length) nvl.setNodePositions(updates as unknown as NvlNode[], false)
  groupDrag.lastX = e.clientX
  groupDrag.lastY = e.clientY
  groupHulls.redraw()
}

function onGroupDragUp(): void {
  groupDrag = null
  window.removeEventListener('mousemove', onGroupDragMove, true)
  window.removeEventListener('mouseup', onGroupDragUp, true)
}

function setupInteractions(): void {
  if (!nvlInstance.value || !containerRef.value) return

  const nvl = nvlInstance.value
  const click = new ClickInteraction(nvl)
  interactions.push(click)

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

  // 사용자가 캔버스를 만지면(드래그/팬) 자동 프레임 중단 — 카메라 통제를 넘긴다.
  userGrabHandler = () => { needsFit = false }
  containerRef.value.addEventListener('mousedown', userGrabHandler)

  // 앵커 드래그(그룹 평행이동) — capture 단계로 NVL 보다 먼저 가로채기(앵커일 때만 차단).
  anchorMouseDownHandler = onAnchorMouseDown
  containerRef.value.addEventListener('mousedown', anchorMouseDownHandler, true)

  interactions.push(new DragNodeInteraction(nvl))

  // 캔버스 줌/이동 시 영역 오버레이를 같은 변환으로 다시 그림 (NVL 과 desync 방지).
  // NVL 은 setPan/setZoom 을 콜백 호출 전에 실행하고 콜백 반환값은 무시하므로
  // (interaction-handlers base.js) 기본 동작에 영향 없다.
  // 팬/줌은 버튼 없는 전이(휠)도 있어 idle 루프가 안 돈다 → kick 으로 잠깐 깨워 추종.
  const panInteraction = new PanInteraction(nvl)
  panInteraction.updateCallback('onPan', () => { needsFit = false; groupHulls.kick() })
  interactions.push(panInteraction)
  const zoomInteraction = new ZoomInteraction(nvl)
  zoomInteraction.updateCallback('onZoom', () => { needsFit = false; groupHulls.kick() })
  interactions.push(zoomInteraction)
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
  if (containerRef.value && userGrabHandler) {
    containerRef.value.removeEventListener('mousedown', userGrabHandler)
  }
  if (containerRef.value && anchorMouseDownHandler) {
    containerRef.value.removeEventListener('mousedown', anchorMouseDownHandler, true)
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

// 클러스터 키가 바뀌면(보기 전환) 앵커 재구성 → 물리 정착 시 프레임.
watch(() => props.clusterKeyOf, () => {
  if (nvlInstance.value) { layoutClusters(); scheduleFit(); groupHulls.redraw() }
})

// 우측 패널 열림/닫힘으로 가시영역이 바뀌면 다시 프레임(리사이즈 중 매 px 재맞춤은 피하고 토글만).
watch(() => props.rightInset, (n, o) => {
  if ((n > 0) !== (o > 0) && nvlInstance.value) { fitView(); groupHulls.redraw() }
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
