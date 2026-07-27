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
import { applyLogicalMode } from '@/shared/utils/graphDisplay'
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
import {
  getNodeColor, getRelationshipColor, getRelationshipWidth, getNodeSize,
  getRelationshipDisplayName,
} from '@/shared/config/graphStyles'
import { colorLabelOf } from '@/shared/utils/nodeLabels'
import { storageVersion } from '@/shared/utils/graphStyleStorage'
import { useNavigatorStore } from '@/workflows/code-analysis'
import { storeToRefs } from 'pinia'
import { useGroupHulls, type HullLevel } from './useGroupHulls'
import { planSevereClusterSeparation, type PositionedCluster } from './clusterGeometry'

// ============================================================================
// 타입 정의
// ============================================================================

interface Props {
  graphData: GraphData
  selectedNodeId?: string
  selectedRelationshipId?: string
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
  /** 숨길 관계 타입 (끄고/켜기 blacklist, spec 020). 여기 든 타입은 그리지 않는다. */
  hiddenRelTypes?: string[]
  /** 숨길 노드 타입 (끄고/켜기 blacklist, spec 038). 이 라벨을 가진 노드·그 관계를 안 그린다. */
  hiddenNodeTypes?: string[]
  /** 지금 isolate 된 라벨(loadedLabels, 라벨 원본 케이스). 역할이 isolate되면 그 노드를 역할색으로(spec 040). */
  isolatedLabels?: string[]
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
const SEVERE_CLUSTER_OVERLAP_RATIO = 0.35
const CLUSTER_GAP_CSS_PX = 24

// ============================================================================
// Props & Emits
// ============================================================================

const props = withDefaults(defineProps<Props>(), {
  hullLevels: () => [],
  clusterKeyOf: null,
  clusterLabelOf: null,
  hiddenRelTypes: () => [],
  hiddenNodeTypes: () => [],
  isolatedLabels: () => [],
  rightInset: 0
})

/** isolate 라벨 집합(대문자) — 역할 렌즈 색 판정용(spec 040). */
const isolatedSet = computed(() => new Set(props.isolatedLabels))

/**
 * 노드 색 — 라벨 기반(활성 렌즈: isolate 된 역할 우선).
 * spec 059 에서 건강(risk) 색 override 를 삭제했다. 화면 전체를 위험색으로 칠하면 정작 봐야 할
 * 결합이 묻힌다 — 위험은 "발견된 문제" 목록에서 해당 대상만 캔버스에 투영해 본다.
 */
function resolveNodeColor(labels: string[], properties?: Record<string, unknown>): string {
  return getNodeColor([colorLabelOf({ labels, properties }, isolatedSet.value)])
}

const emit = defineEmits<{
  'node-select': [node: GraphNode | null]
  'relationship-select': [relationship: GraphLink | null]
  'node-delete': [nodeId: string]
  'node-collapse': [nodeId: string]
  'node-isolate-label': [nodeId: string]
  'node-drop': [payload: { nodeId: string; nodeType?: string; labels?: string[] }]
  'node-expand': [nodeId: string]
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
let clusterLayoutGeneration = 0
let separatedClusterGeneration = -1

interface ClusterSeparationSnapshot {
  generation: number
  adjustedPairCount: number
  severeBefore: number
  severeAfter: number
  maxOverlapBefore: number
  maxOverlapAfter: number
  maxTranslation: number
  settleP95MovementCss: number
}

const clusterSeparationSnapshot = ref<ClusterSeparationSnapshot | null>(null)
const clusterSeparationStatus = ref<'idle' | 'pending' | 'measured' | 'skipped-unstable'>('idle')

// 그룹 영역(바운디드 컨텍스트) 오버레이. 변환·hull·동기화는 useGroupHulls 가 캡슐화하고,
// 여기서는 라이프사이클 배선만 한다(단일 책임 분리).
const groupHulls = useGroupHulls(
  containerRef,
  nvlInstance,
  () => props.graphData.nodes.filter(matchesNodeFilter),
  () => ({ levels: props.hullLevels ?? [] }),
  // 클러스터 보기는 실엣지를 NVL force 에서 빼고 오버레이로 그린다(군집 분리 유지). 비클러스터는 NVL 이.
  () => props.clusterKeyOf ? props.graphData.links.filter(matchesRelFilter) : [],
  // 그룹 앵커 — 헐 포함 + 고정크기 칩 라벨용. key=클러스터키(헐 그룹키와 일치).
  () => [...anchorMembers.keys()].map(id => {
    const key = id.slice(ANCHOR_PREFIX.length)
    return { id, key, label: props.clusterLabelOf?.(key) ?? key, size: ANCHOR_SIZE }
  })
)

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

function resolveCaption(node: GraphNode): string {
  // type 산출은 캔버스 고유(마지막 라벨), 줄번호 미표기(현 동작). 논리명 모드는 공유 헬퍼에 위임.
  const physical = (node.properties?.name as string) || node.labels?.[node.labels.length - 1] || node.id
  return applyLogicalMode(node, physical, showLogicalNames.value)
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

/**
 * 묶인 관계 수 → 선 굵기(spec 059 FR-003). 건수가 수십 개까지 벌어져도 화면을 덮지 않도록
 * 로그로 눌러 담고 상한을 둔다. 굵기는 "많다/적다"를 읽히게 하는 용도이지 정확한 수치가 아니다 —
 * 정확한 건수는 관계를 선택하면 패널에서 확인한다.
 */
function bundledWidth(count: number): number {
  return Math.min(12, 2 + Math.log2(count + 1) * 1.8)
}

function toNvlRelationship(link: GraphLink, isSelected = false): NvlRelationship {
  const isVirtual = link.properties?.virtual === true
  // spec 059: 색 = (종류, 영역 통과 여부) 2축. 굵기는 별개 축으로 넘나드는 관계 수를 나타낸다.
  // 캡션은 한국어 표시명 — 색약에서 빨강·주황이 붙어 보여도 글자로 구분된다.
  const crossesArea = link.properties?.crosses_area === true
  const bundled = typeof link.properties?.count === 'number' ? (link.properties.count as number) : 0
  const base: NvlRelationship = {
    id: link.id,
    from: link.source,
    to: link.target,
    caption: getRelationshipDisplayName(link.type),
    color: getRelationshipColor(link.type, crossesArea),
    width: bundled > 0 ? bundledWidth(bundled) : getRelationshipWidth(link.type),
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

/** 관계 타입 필터 — 숨김(blacklist)만. 필터▾에서 끈 타입은 그리지 않는다. */
function matchesRelFilter(link: GraphLink): boolean {
  if (props.hiddenRelTypes && props.hiddenRelTypes.includes(link.type)) return false
  return true
}

/** 노드 타입 필터 — 끈 라벨을 하나라도 가진 노드는 안 그린다(끝점 잃은 관계는 visibleIds 로 자동 제외). */
function matchesNodeFilter(node: GraphNode): boolean {
  const hidden = props.hiddenNodeTypes
  if (hidden && hidden.length && (node.labels || []).some(l => hidden.includes(l))) return false
  return true
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
    if (!matchesNodeFilter(node)) continue
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
      onLayoutDone: () => {
        if (needsFit) {
          separateSevereClusterOverlaps()
          fitView()
          needsFit = false
        }
        groupHulls.redraw()
      }
    }
  )

  setupInteractions()
  groupHulls.attach()
  updateStats()

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
  let settleChecks = 0
  let stableSamples = 0
  let settleP95MovementCss = Number.POSITIVE_INFINITY
  let previousPositions: Map<string, { x: number; y: number }> | null = null

  const finish = () => {
    if (!needsFit || !nvlInstance.value) return
    separateSevereClusterOverlaps(
      Number.isFinite(settleP95MovementCss) ? settleP95MovementCss : 0,
    )
    fitView()
    needsFit = false
    fitTimer = undefined
  }

  const waitForSettlement = () => {
    const nvl = nvlInstance.value
    if (!needsFit || !nvl) {
      fitTimer = undefined
      return
    }
    const current = new Map(
      nvl.getNodePositions().map(position => [
        position.id,
        { x: position.x, y: position.y },
      ]),
    )
    let movements: number[] = []
    if (previousPositions && previousPositions.size === current.size) {
      for (const [id, position] of current) {
        const previous = previousPositions.get(id)
        if (!previous) {
          movements = []
          break
        }
        movements.push(Math.hypot(position.x - previous.x, position.y - previous.y))
      }
    }
    previousPositions = current
    movements.sort((first, second) => first - second)
    const p95World = movements[Math.floor(movements.length * 0.95)]
      ?? Number.POSITIVE_INFINITY
    settleP95MovementCss = p95World
      * nvl.getScale()
      / (window.devicePixelRatio || 1)
    // NVL의 살아 있는 force는 저진폭 이동을 계속 보고할 수 있다. 화면상 2px 미만이면
    // 현재 보기의 정상적인 미세 이동으로 보고, 큰 출렁임만 정착을 지연시킨다.
    stableSamples = settleP95MovementCss <= 2 ? stableSamples + 1 : 0
    settleChecks += 1
    if (!nvl.isLayoutMoving() || stableSamples >= 3) {
      finish()
      return
    }
    if (settleChecks >= 80) {
      // 불안정한 force 위에 좌표를 덮어쓰면 이후 출렁임이 생긴다. 이 경우 보정 자체를 안전하게 생략한다.
      clusterSeparationStatus.value = 'skipped-unstable'
      fitView()
      needsFit = false
      fitTimer = undefined
      logger.debug('[NvlGraph] cluster overlap adjustment skipped: layout did not settle')
      return
    }
    fitTimer = setTimeout(waitForSettlement, 450)
  }

  const tick = () => {
    if (!needsFit || !nvlInstance.value) {
      fitTimer = undefined
      return
    }
    fitView(); groupHulls.redraw()
    if (++tries < 5) {
      fitTimer = setTimeout(tick, 450)
      return
    }
    if (props.clusterKeyOf) {
      fitTimer = setTimeout(waitForSettlement, 450)
      return
    }
    finish()
  }
  fitTimer = setTimeout(tick, 450)
}

/**
 * 현재 force 결과를 보존한 채 심하게 겹친 군집만 한 번 통째로 평행 이동한다.
 * 노드를 pin하거나 free layout으로 바꾸지 않으며, 같은 layout generation에는 재실행하지 않는다.
 */
function separateSevereClusterOverlaps(settleP95MovementCss = 0): boolean {
  const nvl = nvlInstance.value
  const keyOf = props.clusterKeyOf
  if (!nvl || !keyOf || separatedClusterGeneration === clusterLayoutGeneration) return false

  separatedClusterGeneration = clusterLayoutGeneration
  const positionById = new Map(
    nvl.getNodePositions().map(position => [position.id, position]),
  )
  const grouped = new Map<string, PositionedCluster>()
  for (const node of props.graphData.nodes) {
    if (!nodeMap.has(node.id)) continue
    const position = positionById.get(node.id)
    if (!position) continue
    const key = keyOf(node) ?? '__ungrouped__'
    let cluster = grouped.get(key)
    if (!cluster) {
      cluster = { key, points: [] }
      grouped.set(key, cluster)
    }
    cluster.points.push({ id: node.id, x: position.x, y: position.y })
  }

  for (const [anchorId] of anchorMembers) {
    const key = anchorId.slice(ANCHOR_PREFIX.length)
    const position = positionById.get(anchorId)
    const cluster = grouped.get(key)
    if (position && cluster) {
      cluster.points.push({ id: anchorId, x: position.x, y: position.y })
    }
  }

  const worldGap = CLUSTER_GAP_CSS_PX
    * (window.devicePixelRatio || 1)
    / Math.max(nvl.getScale(), 0.0001)
  const plan = planSevereClusterSeparation([...grouped.values()], {
    severeOverlapRatio: SEVERE_CLUSTER_OVERLAP_RATIO,
    gap: worldGap,
  })
  const severeBefore = plan.before.filter(
    overlap => overlap.ratioToSmaller >= SEVERE_CLUSTER_OVERLAP_RATIO,
  ).length
  const severeAfter = plan.after.filter(
    overlap => overlap.ratioToSmaller >= SEVERE_CLUSTER_OVERLAP_RATIO,
  ).length
  const maxTranslation = Math.max(
    0,
    ...plan.translations.map(translation => Math.hypot(translation.dx, translation.dy)),
  )
  clusterSeparationSnapshot.value = {
    generation: clusterLayoutGeneration,
    adjustedPairCount: plan.adjustedPairCount,
    severeBefore,
    severeAfter,
    maxOverlapBefore: plan.before[0]?.ratioToSmaller ?? 0,
    maxOverlapAfter: plan.after[0]?.ratioToSmaller ?? 0,
    maxTranslation,
    settleP95MovementCss,
  }
  clusterSeparationStatus.value = 'measured'

  const positions = plan.positions.filter(
    (position): position is typeof position & { id: string } => typeof position.id === 'string',
  )
  if (maxTranslation <= 0.01 || positions.length === 0) return false

  nvl.setNodePositions(positions, false)
  logger.debug('[NvlGraph] severe cluster overlap one-shot adjustment', {
    ...clusterSeparationSnapshot.value,
    threshold: SEVERE_CLUSTER_OVERLAP_RATIO,
  })
  groupHulls.redraw()
  return true
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
  try { nvl.setZoomAndPan(scale, panX, by) } catch (e) { logger.debug('[NvlGraph] setZoomAndPan 무시(라이브러리 가드):', e) }
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
  if (!keyOf) {
    clusterSeparationStatus.value = 'idle'
    clearAnchors()
    return
  }

  const groups = new Map<string, string[]>()
  for (const node of props.graphData.nodes) {
    if (!nodeMap.has(node.id)) continue
    const key = keyOf(node) ?? '__ungrouped__'
    const ids = groups.get(key)
    if (ids) ids.push(node.id)
    else groups.set(key, [node.id])
  }
  if (groups.size === 0) {
    clusterSeparationStatus.value = 'idle'
    clearAnchors()
    return
  }

  clusterLayoutGeneration += 1
  separatedClusterGeneration = -1
  clusterSeparationSnapshot.value = null
  clusterSeparationStatus.value = 'pending'
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
    // 앵커도 다른 노드처럼 자기 캡션(그룹 이름)을 갖는다. 영역 이름은 useGroupHulls 가 앵커 위 알약으로도 그려
    // 줌 무관하게 또렷이 보이고, 이 네이티브 캡션은 노드 자체의 라벨 역할(NVL 기본 동작).
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
  if (nodes.length) { try { nvl.addAndUpdateElementsInGraph(nodes, rels) } catch (e) { logger.debug('[NvlGraph] addAndUpdateElementsInGraph 무시(라이브러리 가드):', e) } }
}

/** 앵커 노드 + 헬퍼 링크를 모두 제거(보기 전환·정리). */
function clearAnchors(): void {
  const nvl = nvlInstance.value
  if (nvl) {
    if (anchorLinkIds.length) { try { nvl.removeRelationshipsWithIds(anchorLinkIds) } catch (e) { logger.debug('[NvlGraph] removeRelationshipsWithIds 무시(라이브러리 가드):', e) } }
    const ids = [...anchorMembers.keys()]
    if (ids.length) { try { nvl.removeNodesWithIds(ids) } catch (e) { logger.debug('[NvlGraph] removeNodesWithIds 무시(라이브러리 가드):', e) } }
  }
  anchorMembers.clear()
  anchorLinkIds = []
  separatedClusterGeneration = -1
}

function destroyNvl(): void {
  closeContextMenu()
  groupHulls.detach()
  for (const it of interactions) { try { it.destroy() } catch (e) { logger.debug('[NvlGraph] interaction.destroy 무시(라이브러리 가드):', e) } }
  interactions = []
  if (nvlInstance.value) {
    nvlInstance.value.destroy()
    nvlInstance.value = null
  }
  if (fitTimer) { clearTimeout(fitTimer); fitTimer = undefined }
  needsFit = false
  nodeMap.clear()
  relationshipMap.clear()
  anchorMembers.clear()
  anchorLinkIds = []
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

  // 1) 표시할 노드 = 캔버스 노드 중 노드필터(끄고/켜기, spec 038) 통과분. 끈 타입은 targetIds 에서
  //    빠져 아래 제거 단계가 캔버스서 떼고, 끝점 잃은 관계도 함께 정리된다.
  const visibleNodes = props.graphData.nodes.filter(matchesNodeFilter)
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
  groupHulls.redraw()
}

// ============================================================================
// 인터랙션
// ============================================================================

let contextMenuHandler: ((e: MouseEvent) => void) | null = null
let documentClickHandler: ((e: MouseEvent) => void) | null = null
let userGrabHandler: (() => void) | null = null
// NVL 인터랙션 핸들러(Click/Drag/Pan/Zoom) — 각자 컨테이너에 리스너를 단다. destroyNvl 에서
// destroy() 해야 init/destroy 반복(필터 토글) 시 리스너가 누적되지 않는다.
let interactions: Array<{ destroy(): void }> = []

// ── 그룹 앵커 (spec 022) ──────────────────────────────────────────────────
// 앵커는 NVL 노드로, 멤버와 옅은 링크로 이어져 라이브 물리가 원형 군집을 만든다. 앵커를 끌면
// NVL 네이티브 드래그 + reheat 로 멤버가 출렁이며 따라온다(별도 드래그 로직 불필요).
// anchorMembers/anchorLinkIds 는 보기 전환 시 정리용으로만 보관.
const anchorMembers = new Map<string, string[]>()   // anchorId → 멤버 노드 id[]
let anchorLinkIds: string[] = []                    // 앵커↔멤버 헬퍼 링크 id(정리용)

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
    const host = containerRef.value
    if (!host) return
    const hostRect = host.getBoundingClientRect()
    contextMenuNodeId.value = node.id
    contextMenuPosition.value = {
      x: evt.clientX - hostRect.left,
      y: evt.clientY - hostRect.top,
    }
    contextMenuVisible.value = true
    nextTick(() => {
      const currentHost = containerRef.value
      const menu = contextMenuRef.value
      if (!currentHost || !menu || !contextMenuVisible.value) return
      const edge = 8
      contextMenuPosition.value = {
        x: Math.max(edge, Math.min(contextMenuPosition.value.x, currentHost.clientWidth - menu.offsetWidth - edge)),
        y: Math.max(edge, Math.min(contextMenuPosition.value.y, currentHost.clientHeight - menu.offsetHeight - edge)),
      }
    })
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
      // 선택된 요소는 NVL 선택 오버레이가 옛 색을 덮어 새 색이 즉시 안 보임 → selected 를 함께
      // 보내 오버레이까지 새 색으로 다시 그린다(선택 안 푼 채 즉시 반영). 비선택은 영향 0.
      updates.push(id === props.selectedNodeId ? { id, color, size, selected: true } : { id, color, size })
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
      // 선택된 관계는 선택 오버레이가 옛 색을 덮어 새 색이 즉시 안 보임(노드는 선택=링이라 보임).
      // selected 를 함께 보내 오버레이까지 새 색으로 다시 그린다 — "끄고 그래프 터치" 없이 즉시 반영.
      updates.push(id === props.selectedRelationshipId ? { id, color, width, selected: true } : { id, color, width })
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
  destroyNvl()
})

// ============================================================================
// Watchers
// ============================================================================

watch(() => props.graphData, () => {
  syncGraph()
}, { deep: false })

// 노드·관계 끄고/켜기(blacklist) 변경 → 재빌드(initNvl 이 matchesNode/RelFilter 적용). 엣지/노드
// 기준 필터라 부분갱신보다 재빌드가 단순·정확(spec 020/038).
watch([() => props.hiddenRelTypes, () => props.hiddenNodeTypes], () => {
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

// 사용자 스타일(색/크기/두께) 변경(GraphStylePanel → graphStyleStorage) → 이미 그려진 노드·관계의
// 색·크기만 부분 갱신(updateElementsInGraph, 위치·레이아웃 보존). storageVersion 구독이 끊겨
// 캔버스에 반영 안 되던 회귀 복원(spec 034). 함수는 색만 바뀐 요소만 갱신(불변시 no-op).
watch(storageVersion, () => {
  updateAllStyles()
})

// isolate 라벨 변경(역할 렌즈, spec 040) → 노드 색만 부분 갱신(위치·선택 보존).
watch(() => props.isolatedLabels, () => {
  updateNodeStyles()
}, { deep: true })

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
  relationshipCount: () => relationshipMap.size,
  getClusterSeparationSnapshot: () => clusterSeparationSnapshot.value,
})
</script>

<template>
  <div
    class="nvl-graph"
    :class="{ 'drag-over': isDragOver }"
    ref="containerRef"
    :data-cluster-adjustments="clusterSeparationSnapshot?.adjustedPairCount ?? ''"
    :data-cluster-separation-status="clusterSeparationStatus"
    :data-cluster-severe-before="clusterSeparationSnapshot?.severeBefore ?? ''"
    :data-cluster-severe-after="clusterSeparationSnapshot?.severeAfter ?? ''"
    :data-cluster-max-overlap-before="clusterSeparationSnapshot?.maxOverlapBefore ?? ''"
    :data-cluster-max-overlap-after="clusterSeparationSnapshot?.maxOverlapAfter ?? ''"
    :data-cluster-max-translation="clusterSeparationSnapshot?.maxTranslation ?? ''"
    :data-cluster-settle-p95-css="clusterSeparationSnapshot?.settleP95MovementCss ?? ''"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
    @click.self="emit('node-select', null); emit('relationship-select', null)"
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
  position: absolute;
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
