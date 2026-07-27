<script setup lang="ts">
/**
 * GraphTab.vue
 * 그래프 및 UML 다이어그램 탭 - 개선된 플로팅 UI
 */

import { ref, computed, watch, onMounted } from 'vue'
import { useAnalyzerStore } from '@/workflows/code-analysis'
import { useCanvasStore } from '@/features/code-analysis/graphCanvas'
import { useNavigatorStore } from '@/workflows/code-analysis'
import { storeToRefs } from 'pinia'
import NvlGraph from './NvlGraph.vue'
import {
  createGraphClusterKey,
  createGraphClusterLabel,
  createGraphHullLevels,
  type GraphViewMode,
} from '@/features/code-analysis/graphViewModel'
import { useGraphTypeFilter } from './useGraphTypeFilter'
import NodeDetailPanel from './NodeDetailPanel.vue'
import GraphStylePanel from './GraphStylePanel.vue'
import type { GraphNode, GraphLink } from '@/shared/types'
import { useResize } from '@/shared/composables/useResize'
import { useDrag } from '@/shared/composables/useDrag'
import { getNodeColor, getRelationshipColor, registerLabelColors } from '@/shared/config/graphStyles'
import { isHiddenMarker, semanticRoleLabels } from '@/shared/utils/nodeLabels'
import { storageVersion } from '@/shared/utils/graphStyleStorage'
import { isSystemNode } from '@/shared/utils/graphVisibility'

const projectStore = useAnalyzerStore()
const canvasStore = useCanvasStore()
const navigatorStore = useNavigatorStore()
const {
  graphData,
  showHidden,
  isProcessing,
  currentStep,
  consoleMessages,
} = storeToRefs(projectStore)
const { canvasGraphData } = storeToRefs(canvasStore)
const { showLogicalNames } = storeToRefs(navigatorStore)

const showNodePanel = ref(false)
const showConsole = ref(false)
const progressPanelCollapsed = ref(false) // 진행 패널 축소 상태

/**
 * 보기 모드 (spec 018 — 단일선택 enum).
 * 모듈간/업무 단위는 서로 배타라 한 번에 하나만 켜진다. 기존엔 독립 토글이라
 * 동시에 켜져 화면 의미가 모호해지고 silent no-op 가 섞였다 → 단일 enum 으로 일원화.
 *
 *  - 'default' : 프리셋 끔, hull 끔, 색=라벨별
 *  - 'module'  : 모듈간 상호작용 — 영역을 접고 영역을 넘는 관계만 그린다(spec 059)
 *  - 'area'    : 실제 업무 단위(hull, component_id=CALL 군집 기준). ※폴더 구조와 별개
 *
 * groupHullBy / preset 은 viewMode 에서 파생(computed)되므로
 * 단일 진실원천은 viewMode 하나다. (NvlGraph/canvasStore 가 소비하는 prop 계약은 불변)
 */
// 'module'=모듈간 상호작용 / 'area'=실제 업무 단위
// (spec 021: 'table-flow' 제거 — 노드 폭발. 'area-struct'(영역·구조) 제거 — 모듈간과 구조 중복.
//  spec 059: '건강' 제거 — 화면 전체를 위험색으로 칠해 정작 봐야 할 결합이 묻혔다. 실제 건강
//  악화를 보여주는 화면은 별도 UI/UX 로 다시 설계한다(우선순위 낮음, 사용자 결정 2026-07-21).)
const viewMode = ref<GraphViewMode>('default')

/**
 * 중첩 영역(헐) 레벨 — NvlGraph :hullLevels 소비(spec 021).
 *  - 실제 업무 단위(area) = [component_id 단일 레벨]
 *  - 그 외             = [] (표시 안 함). 모듈간은 별도(Phase4)에서 패키지 1겹.
 */
const hullLevels = computed(() => createGraphHullLevels(
  viewMode.value,
  canvasStore.hierarchyMap,
  nodeId => canvasStore.tableAreaKey(nodeId),
))

/**
 * 클러스터 분리 키(spec 022) — NvlGraph :clusterKeyOf 소비. 노드를 이 키로 묶어 화면에서 떨어뜨림.
 *  - 모듈간: 모듈=패키지(external은 '__external__'), 테이블=주인 영역 → 영역 단위로 분리
 *  - 협력군집: component_id(미보유='__ungrouped__') → 군집/기타 분리
 *  - 그 외: null(분리 안 함 — 영역구조는 중첩이라 분리 불필요, 건강은 단일)
 */
const clusterKeyOf = computed(() => createGraphClusterKey(
  viewMode.value,
  canvasStore.hierarchyMap,
  nodeId => canvasStore.tableAreaKey(nodeId),
))

/**
 * 클러스터 키 → 앵커(대표 노드) 라벨(spec 022). clusterKeyOf 와 짝 — NvlGraph 가 각 클러스터
 * 중심에 이 라벨의 앵커 노드를 둔다. 키는 노드 id(패키지)·합성키('__external__'/'__ungrouped__')·
 * component_id 가 섞이므로 보기별로 사람이 읽을 이름으로 푼다.
 */
const clusterLabelOf = computed(() => createGraphClusterLabel(
  viewMode.value,
  projectStore.nodeMap,
))


/**
 * 필터 ▾ (spec 020/038) — 타입 끄고/켜기(blacklist). 보기모드와 직교(동시 적용).
 * 빈 집합 = 전체 표시. 끄면 그 타입만 렌더서 사라진다(데이터는 유지).
 * 노드·관계 두 축이 **같은 토글 기계**를 공유 — 공통 팩토리(중복 0, spec 038).
 */
const relFilter = useGraphTypeFilter()
const nodeFilter = useGraphTypeFilter()
/** 활성 필터 총 개수(노드+관계) — 필터 ▾ 버튼 배지. */
const hiddenFilterCount = computed(() => relFilter.count + nodeFilter.count)
const showFilterMenu = ref(false)

/**
 * "내부 요소 펼치기"(spec 059 FR-027) — 기본 접힘(변수·INIT_BY·REFERENCES·메타노드)을 통째로 펼침.
 * 이름을 '숨김'에서 '펼치기'로 바꾼 이유: 데이터는 지워지지 않고 접혀 있을 뿐이라, '숨김'은
 * 사용자가 무언가 사라졌다고 오해하게 만든다.
 * 노드·관계 끄고/켜기(nodeFilter·relFilter)와 **독립 축**: 서로 상태를 안 건드린다.
 * 그래프(graphData)·네비게이터(isExcluded)·필터 목록이 한 토글로 동시 반영.
 */
function toggleShowHidden(): void {
  showHidden.value = !showHidden.value
}

/**
 * 보기 ▾ 드롭다운 (spec 018) — 보기 모드(모듈간/업무 단위)를 상단 일렬 버튼 대신 한 곳에서 고른다.
 * 단일선택: 한 항목을 누르면 그 모드로, 이미 그 모드면 default 로 토글오프. 한 번에 하나만 켜짐.
 * 관계필터는 별개 축이라 보기모드와 무관하게 독립 토글.
 */
const showViewMenu = ref(false)

/**
 * 보기 모드 선택 — 단일선택. 이미 선택된 모드면 default 로 끔(토글오프).
 * 모드 진입 시 그 모드가 무언가를 보이게 캔버스를 보장(업무 단위는 빈 캔버스면 해당 속성 노드 자동 로드).
 */
function selectViewMode(mode: Exclude<GraphViewMode, 'default'>): void {
  const next: GraphViewMode = viewMode.value === mode ? 'default' : mode
  applyViewMode(next)
  // 단일선택이라 고르면 메뉴를 닫는다(관계필터는 아래에서 별도 — 닫지 않음).
  showViewMenu.value = false
}

/** 보기 모드 적용 — 프리셋/캔버스 populate 까지 일괄 처리(단일 결정처). */
function applyViewMode(mode: GraphViewMode): void {
  viewMode.value = mode
  // 이전 프리셋(모듈간 가상그래프) 해제 — 다른 모드로 갈 때 항상 클리어.
  if (canvasPresetMode.value) canvasStore.setPreset(null)

  if (mode === 'module') {
    // 모듈간 상호작용 — 기존 가상 그래프(모듈↔모듈 CALL + 모듈↔테이블 R/W)를 그대로 쓴다.
    // spec 059 가 바꾼 것은 두 가지뿐이다: 테이블을 '__tables__' 별도 구역이 아니라 **주인 영역의
    // 테두리 안**으로 녹이고(clusterKeyOf/hullLevels), 색을 영역 통과 여부로 진하기 구분한다.
    canvasStore.setPreset('module-interaction')
    // FR-004: 합성 결과가 비면 빈 화면 침묵 대신 사유 안내(전략·DDL 무관, 데이터 유무로만).
    hintIfEmpty(
      '영역 간 관계가 없습니다 — 분석 대상의 폴더(패키지)가 둘 이상이고 그 사이에 호출이나 '
      + '테이블 접근이 있어야 합니다. 폴더가 하나뿐이면 모든 관계가 그 안에 있어 그릴 선이 없습니다.',
    )
  } else if (mode === 'area') {
    ensureNodesForView('component_id')
  } else {
    autoPopulateHint.value = ''
  }
}

/**
 * FR-004 — 프리셋 적용 직후 그릴 게 없으면 사유 안내, 아니면 안내 해제.
 * 판정은 전략명이 아니라 **canvasGraphData(동기 computed)** 단일 규칙 → 전략·DDL 무관.
 *
 * ★모듈간 상호작용은 "영역 간 관계"를 보는 화면이라 **관계 0건도 빈 화면**이다.
 * 영역이 하나뿐이면 노드는 1개지만 그릴 선이 없어, 사유 없이 외딴 동그라미만 남는다.
 * (실측 2026-07-21: shop_mall 은 PACKAGE 가 1개뿐이라 정확히 이 상태가 된다.)
 */
function hintIfEmpty(reason: string): void {
  const graph = canvasGraphData.value
  const nothingToShow = viewMode.value === 'module'
    ? graph.links.length === 0
    : graph.nodes.length === 0
  autoPopulateHint.value = nothingToShow ? reason : ''
}

/**
 * 빈 캔버스에서 업무 단위 보기를 켜면 무반응(재스타일만 함)이던 문제 근본수정.
 * 캔버스가 비어 있으면 해당 속성을 가진 노드만 골라 캔버스에 자동 추가(바운디드 — 전체덤프 X).
 * 추가할 노드가 0개면 침묵 대신 안내 힌트를 띄운다.
 *
 * @param propKey   노드가 가져야 할 속성 키 (예: 'component_id')
 */
function ensureNodesForView(propKey: string): void {
  autoPopulateHint.value = ''
  // spec 021: 보기모드 독립 — 진입할 때마다 자기 콘텐츠로 리셋(이전 보기 노드 잔상 0).
  // (과거엔 캔버스 비었을 때만 채우는 early-return 이라 테이블흐름→영역 전환 시 이전 노드
  //  위에 영역 헐이 덧칠되던 비독립 버그가 있었다.)
  const matched: string[] = []
  for (const node of projectStore.nodeMap.values()) {
    if (isSystemNode(node)) continue
    const v = node.properties?.[propKey]
    if (v === undefined || v === null || v === '') continue
    matched.push(node.id)
  }

  if (matched.length === 0) {
    canvasStore.setCanvasNodes([])   // 독립: 매치 0이면 이전 보기 잔상 비우고 사유 안내만
    autoPopulateHint.value =
      propKey === 'component_id'
        ? '업무 단위(군집) 정보를 가진 노드가 없습니다 — 분석을 끝까지 실행해 주세요'
        : '표시할 노드가 없습니다 — 분석을 끝까지 실행해 주세요'
    return
  }
  canvasStore.setCanvasNodes(matched)
}

/** 자동 로드 결과 안내 (해당 속성 노드 0개일 때). 빈 문자열이면 표시 안 함. */
const autoPopulateHint = ref('')

/**
 * 층 칩(영역/모듈/루틴) — spec 059. 언어마다 다른 종류 이름(FILE/CLASS/PACKAGE_BODY…)을 하나로
 * 묶어 부른다. 판정과 구성 라벨은 캔버스 스토어(→ nodeClassify)가 소유하고 여기서는 표시값만 만든다.
 */
const LAYER_COLORS: Record<string, string> = { 영역: '#7C6BAD', 모듈: '#4A7C8C', 루틴: '#6B8E5A' }
const LAYER_MEMBERS: Record<string, string> = {
  영역: '패키지·폴더',
  모듈: '파일·클래스·PL/SQL 패키지',
  루틴: '함수·메서드·프로시저·트리거',
}
const layerStats = computed(() => {
  void storageVersion.value
  return [...canvasStore.layerCounts().entries()]
    .filter(([, count]) => count > 0)
    .map(([layer, count]) => ({
      layer,
      count,
      color: LAYER_COLORS[layer] ?? '#6b7280',
      active: canvasStore.isLayerLoaded(layer),
      members: LAYER_MEMBERS[layer] ?? '',
    }))
})

/** 층 칩 클릭 — 그 층을 구성하는 실제 라벨들을 켜고 끈다(스토어가 펼친다). */
function handleLayerFilter(layer: string): void {
  canvasStore.toggleLayerLoad(layer)
}

/** 현재 보기 모드 라벨 (보기 ▾ 버튼 표시용). */
const activeViewLabel = computed(() => {
  switch (viewMode.value) {
    case 'module': return '모듈간'
    case 'area': return '실제 업무 단위'
    default: return '기본'
  }
})
/** 보기 모드가 기본이 아닌지 (버튼 active 표시용). 관계필터는 별개 축이라 미포함. */
const isViewModeActive = computed(() => viewMode.value !== 'default')

// 분석 패널 모드: 'docked' (왼쪽 고정), 'floating' (플로팅), 'hidden' (완전 숨김)
// 기본값은 hidden - 인제스천 시작 시에만 자동으로 표시됨
const analysisPanelMode = ref<'docked' | 'floating' | 'hidden'>('hidden')

// 인제스천 시작 시 그래프 뷰로 자동 전환 (분석 진행 상황을 볼 수 있도록)
watch(isProcessing, (newVal, oldVal) => {
  if (newVal && !oldVal) {
    // 인제스천 시작 시 분석 패널 표시
    if (analysisPanelMode.value === 'hidden') {
      analysisPanelMode.value = 'docked'
    }
  }
})

// 플로팅 모드용 위치 — useDrag composable 활용. floating 모드 아닐 때 startDrag 호출 차단.
const {
  x: floatingX,
  y: floatingY,
  isDragging: isDraggingPanel,
  startDrag: startPanelDragRaw,
} = useDrag({ initialX: 20, initialY: 80, boundToWindow: true })

const startPanelDrag = (e: MouseEvent) => {
  if (analysisPanelMode.value !== 'floating') return
  startPanelDragRaw(e)
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

const selectedNode = ref<GraphNode | null>(null)
const selectedRelationship = ref<GraphLink | null>(null)
const selectedNodeType = ref<string | null>(null)
const selectedRelType = ref<string | null>(null)
const stylePanelTop = ref<number>(0)
/** 현재 스타일 패널이 노드용인지 관계용인지 */
const stylePanelCategory = ref<'node' | 'relationship'>('node')
const nvlGraphRef = ref<InstanceType<typeof NvlGraph> | null>(null)

onMounted(() => {
  // Graph 탭 진입 시 Navigator 자동 오픈 (VSCode Explorer 스타일)
  navigatorStore.setPanelOpen(true)
})

// Navigator 트리 단일 클릭 → 디테일 패널에 즉시 표시.
// nodeMap 에서 lookup, 없으면 무시 (동기화 race 시 무해).
watch(
  () => navigatorStore.selectedNodeId,
  (nodeId) => {
    if (!nodeId) return
    const node = projectStore.nodeMap.get(nodeId)
    if (node) handleNodeSelect(node)
  },
)

const statusType = computed(() => {
  if (!currentStep.value) return 'idle'
  const step = currentStep.value.toLowerCase()
  if (step.includes('에러') || step.includes('실패') || step.includes('error')) return 'error'
  if (step.includes('완료') || step.includes('complete')) return 'success'
  if (isProcessing.value) return 'processing'
  return 'idle'
})

// 그래프 통계 — 실제 표시 중인 고유 노드/관계 수(graphData = nodeMap/linkMap 숨김 제외).
// 이벤트 피드 개수가 아니라 → 중복·숨김 없이 화면과 100% 일치(spec 022 FR-006).
const graphStats = computed(() => ({
  totalNodes: graphData.value?.nodes.length ?? 0,
  totalRels: graphData.value?.links.length ?? 0,
}))

/**
 * 오버뷰 패널용 전체 프로젝트 통계 — 라벨 / 관계 타입 별 분포.
 * NodeDetailPanel 이 Map<label, {count, color}> 형식 그대로 소비.
 * 캔버스 상태와 무관하게 projectStore.nodeMap/linkMap 기준.
 *
 * graphStyleStorage 의 storageVersion 을 dependency 로 읽어 색 변경 시 자동 재계산.
 */
const overallNodeStats = computed(() => {
  void storageVersion.value
  // 종류 = 어떤 노드든 labels[0] 로 등장한 라벨(+EXTERNAL stub 마커). 그 외 = 역할(stereotype).
  // 위치 파생이라 하드코딩 역할집합 0(spec 035). 라벨별 group 태그를 붙여 필터가 섹션 분리.
  const stats = new Map<string, { count: number; color: string; group: 'kind' | 'role' }>()

  // spec 059: 색을 묻기 **전에** 이 그래프의 전체 라벨을 한 번에 등록해 배정 순서를 고정한다.
  // 등록하지 않으면 "화면에서 처음 만난 순서"가 배정 순서가 되어 다시 열 때 색이 달라진다.
  // 등록은 정렬된 순서로 하며 이미 색을 받은 라벨은 건드리지 않는다(색 불변).
  const allLabels: string[] = []
  for (const node of graphData.value?.nodes ?? []) {
    for (const label of node.labels || []) {
      if (label !== '_Placeholder' && !isHiddenMarker(label)) allLabels.push(label)
    }
  }
  registerLabelColors(allLabels)

  for (const node of graphData.value?.nodes ?? []) {
    const roleLabels = new Set(semanticRoleLabels(node))
    for (const label of node.labels || ['Unknown']) {
      if (label === '_Placeholder' || isHiddenMarker(label)) continue
      const existing = stats.get(label)
      if (existing) { existing.count++; continue }
      const group = roleLabels.has(label) ? 'role' : 'kind'
      stats.set(label, { count: 1, color: getNodeColor([label]), group })
    }
  }
  return stats
})

const overallRelationshipStats = computed(() => {
  void storageVersion.value
  const stats = new Map<string, { count: number; color: string }>()
  for (const link of graphData.value?.links ?? []) {
    const type = link.type || 'UNKNOWN'
    const existing = stats.get(type)
    if (existing) existing.count++
    else stats.set(type, { count: 1, color: getRelationshipColor(type) })
  }
  return stats
})

/**
 * 필터 ▾ 관계 토글 목록 — **현재 캔버스(NvlGraph)에 그려진 관계** 기준(전체 그래프 X).
 * 캔버스에 있는 것만 끄고/켜는 게 직관적(없는 관계는 목록에 안 뜸). 숨긴 타입도 canvasGraphData엔
 * 남아 있어(렌더 단계 필터라) 목록에 계속 보여 다시 켤 수 있다.
 */
const relTypeList = computed(() => {
  const counts = new Map<string, number>()
  for (const link of canvasGraphData.value?.links ?? []) {
    counts.set(link.type, (counts.get(link.type) ?? 0) + 1)
  }
  return Array.from(counts, ([type, count]) => ({ type, count }))
})

/** 필터 ▾ 노드 토글 목록 — 현재 캔버스 노드 라벨 기준(관계 목록과 동형). 멀티라벨은 각 라벨로 집계. */
const nodeTypeList = computed(() => {
  const counts = new Map<string, number>()
  const roleLabels = new Set<string>()
  for (const node of canvasGraphData.value?.nodes ?? []) {
    for (const role of semanticRoleLabels(node)) roleLabels.add(role)
    for (const label of node.labels ?? []) {
      if (label === '_Placeholder' || isHiddenMarker(label)) continue
      counts.set(label, (counts.get(label) ?? 0) + 1)
    }
  }
  // spec 059: 종류(무엇인가)와 역할(무슨 일을 하는가)은 다른 축이다. 개요 패널은 이미 나눠
  // 보여주는데 필터만 한 줄로 섞여 있어 같은 개념이 두 화면에서 다르게 보였다(원칙 §7 위반).
  return Array.from(counts, ([type, count]) => ({
    type,
    count,
    group: roleLabels.has(type) ? 'role' as const : 'kind' as const,
  }))
})

/** 필터의 '종류' 섹션 — 이게 무엇인가(antlr 타입). */
const nodeKindList = computed(() => nodeTypeList.value.filter(n => n.group === 'kind'))
/** 필터의 '역할' 섹션 — 이게 무슨 일을 하는가(stereotype). */
const nodeRoleList = computed(() => nodeTypeList.value.filter(n => n.group === 'role'))

// 캔버스(NvlGraph)에 표시 중인 그래프가 있는지
const hasGraph = computed(() => canvasGraphData.value.nodes.length > 0)
// 프로젝트 전체에 로드된 데이터가 있는지 (Navigator에서 탐색 가능한지)
const hasAnyData = computed(() => (graphData.value?.nodes.length ?? 0) > 0)

// 로그가 있을 때 자동으로 콘솔 표시
watch(consoleMessages, (messages) => {
  if (messages.length > 0 && !showConsole.value) {
    showConsole.value = true
  }
}, { immediate: true })

/** 스타일 패널 상태 초기화 */
function resetStylePanel(): void {
  selectedNodeType.value = null
  selectedRelType.value = null
  stylePanelTop.value = 0
}

function handleNodeSelect(node: GraphNode | null): void {
  if (node && isSystemNode(node)) return
  selectedNode.value = node
  selectedRelationship.value = null
  resetStylePanel()
  if (node) showNodePanel.value = true
  navigatorStore.selectNode(node?.id ?? null)
}

/**
 * 검색 결과에서 노드 선택 시 처리 — 캔버스에 해당 노드만 추가.
 * 이웃까지 보려면 캔버스에서 더블클릭.
 */
function handleNodeSearchSelect(node: GraphNode): void {
  selectedNode.value = node
  selectedRelationship.value = null
  resetStylePanel()
  showNodePanel.value = true
  canvasStore.addNodeToCanvas(node.id)
}

/**
 * 의미검색 뭉치 선택 (spec 046) — 뭉치의 노드들을 캔버스에 올린다.
 * selectedNode 를 세팅하지 않아 패널은 Overview(검색) 유지(FR-005). 상세는 캔버스 노드 클릭으로.
 * 현재 그래프에 없는 노드는 조용히 누락하지 않고 카운트해 안내(무반응 금지).
 */
function handleClusterSelect(nodeIds: string[]): void {
  let missing = 0
  for (const id of nodeIds) {
    if (projectStore.nodeMap.has(id)) canvasStore.addNodeToCanvas(id)
    else missing += 1
  }
  clusterMissingHint.value = missing > 0
    ? `${missing}개 노드는 현재 그래프에 없어 추가하지 못했습니다`
    : ''
}
const clusterMissingHint = ref('')

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

/**
 * 노드 라벨 칩 클릭 = 캔버스에 그 라벨 노드들을 **누적 로드**(isolate, spec 025).
 * 표시필터가 아니라 캔버스 구성(canvasStore) — 여러 개 누르면 누적, 다시 누르면 제거.
 */
function handleLabelFilter(label: string): void {
  canvasStore.toggleLabelLoad(label)
}

/** 관계 칩 클릭 = 캔버스에 그 관계 + 양끝 노드를 **누적 로드**(표시필터 아님). 노드와 함께 다중. */
function handleRelFilterToggle(relType: string): void {
  canvasStore.toggleRelLoad(relType)
}

/**
 * "모듈간 상호작용 보기" 프리셋(viewMode='module'): 화면에서 MODULE 과 TABLE 만 보여주고
 * 둘 사이를 잇는 가상 링크(VIRTUAL_USES) 를 합성해 그려준다.
 * 가상 링크 합성은 canvasStore.canvasGraphData(computed) 에서 처리하므로 여기선 프리셋만 토글.
 */
const { presetMode: canvasPresetMode, loadedLabels, loadedRelTypes } = storeToRefs(canvasStore)
// 노드패널 칩 active 표시 = 캔버스에 로드된 라벨/관계(표시필터 아님)
const activeNodeLoads = computed(() => [...loadedLabels.value])
const activeRelLoads = computed(() => [...loadedRelTypes.value])

// 프리셋(모듈간 가상그래프)이 외부 동작(캔버스 비우기·라벨 격리 등)으로 해제되면
// 해당 보기도 default 로 환원 — 상태 일관성.
watch(canvasPresetMode, (mode) => {
  if (mode === null && viewMode.value === 'module') {
    viewMode.value = 'default'
  }
})

/** isolate 해제 (오버뷰 `*` 클릭) — 노드패널 로드(loadedLabels/loadedRelTypes) 해제 + 캔버스 비움. */
function handleClearFilters(): void {
  canvasStore.clearPanelLoad()
  canvasStore.clearCanvas()
}

/**
 * 캔버스 비우기 — 표시된 노드 제거 + 선택/활성 필터(칩 active) 모두 해제.
 * 캔버스가 비면 "로드됨" 표시도 남으면 안 되므로 loadedLabels/loadedRelTypes 도 함께 비운다.
 */
function handleResetGraph(): void {
  selectedNode.value = null
  selectedRelationship.value = null
  canvasStore.clearPanelLoad()
  canvasStore.clearCanvas()
}

/**
 * 캔버스에서 노드 제거 (원본 nodeMap 은 유지).
 */
function handleNodeRemoveFromCanvas(nodeId: string): void {
  canvasStore.removeFromCanvas(nodeId)
  if (selectedNode.value?.id === nodeId) {
    selectedNode.value = null
  }
}

/**
 * Navigator 트리에서 드래그-드롭 → 캔버스에 그 노드 하나만 추가.
 * 기본 동작: 단일 노드. 이웃 확장은 캔버스에서 더블클릭해야 함.
 */
function handleNodeDrop(payload: { nodeId: string }): void {
  if (!payload?.nodeId) return
  canvasStore.addNodeToCanvas(payload.nodeId)
}

/**
 * 캔버스 노드 더블클릭 (spec 059).
 *  - 모듈간 상호작용 보기: 모듈을 **한 단계** 펼쳐 그 안의 루틴을 드러낸다. 지목한 대상만 열리고
 *    다시 누르면 접힌다. 전체 펼치기는 제공하지 않는다.
 *  - 그 외 보기: 기존대로 1-hop 이웃을 캔버스에 누적 추가한다.
 */
function handleNodeExpand(nodeId: string): void {
  if (!nodeId) return
  if (canvasPresetMode.value === 'module-interaction') {
    canvasStore.expandLayer(nodeId)
    return
  }
  canvasStore.expandNodeOnCanvas(nodeId)
}

/**
 * 컨텍스트 메뉴 "이웃 접기" → 그 노드와만 연결된 이웃을 캔버스에서 제거.
 * expand 의 직관적 역연산.
 */
function handleNodeCollapse(nodeId: string): void {
  if (!nodeId) return
  canvasStore.collapseNodeOnCanvas(nodeId)
}

/**
 * 컨텍스트 메뉴 "같은 라벨만 남기기" → 우클릭 노드의 라벨과 같은 노드만 캔버스에 유지.
 * 결과적으로 같은 라벨 사이의 관계만 남게 된다.
 */
function handleNodeIsolateLabel(nodeId: string): void {
  if (!nodeId) return
  canvasStore.isolateLabel(nodeId)
}

watch(hasGraph, (has, prev) => {
  if (has && !prev) showNodePanel.value = true
  // 캔버스에 노드가 생기면(드래그·자동로드) 이전 0건 안내는 더 이상 무의미.
  if (has) autoPopulateHint.value = ''
})


</script>

<template>
  <div class="graph-tab">
    
    <!-- 왼쪽 통합 분석 패널 -->
    <div
      v-if="analysisPanelMode !== 'hidden'"
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
        
        <!-- 레전드(Node labels/Relationship types)는 우측 노드패널 한 곳으로 통일(spec 018 FR-008).
             진행패널은 진행률·노드/관계 카운트만 — 레전드 중복 제거. -->
      </template>
    </div>

    <!-- 메인 콘텐츠 -->
    <div class="content-area">
      <div class="view-container">
        <!-- 캔버스는 항상 마운트 — drop 이벤트를 받아야 하므로 v-if 로 제거하지 않음 -->
        <NvlGraph
          ref="nvlGraphRef"
          :graphData="canvasGraphData"
          :selectedNodeId="selectedNode?.id"
          :selectedRelationshipId="selectedRelationship?.id"
          :hullLevels="hullLevels"
          :clusterKeyOf="clusterKeyOf"
          :clusterLabelOf="clusterLabelOf"
          :hiddenRelTypes="relFilter.hidden"
          :hiddenNodeTypes="nodeFilter.hidden"
          :isolatedLabels="activeNodeLoads"
          :rightInset="showNodePanel ? panelWidth : 0"
          @node-select="handleNodeSelect"
          @relationship-select="handleRelationshipSelect"
          @node-delete="handleNodeRemoveFromCanvas"
          @node-collapse="handleNodeCollapse"
          @node-isolate-label="handleNodeIsolateLabel"
          @node-drop="handleNodeDrop"
          @node-expand="handleNodeExpand"
        />
        <!-- 의미검색 뭉치 중 현재 그래프에 없는 노드 안내 (spec 046, 무반응 금지) -->
        <div v-if="clusterMissingHint" class="cluster-missing-banner">
          <span>{{ clusterMissingHint }}</span>
          <button @click="clusterMissingHint = ''" title="닫기">✕</button>
        </div>
        <!-- 빈 상태 오버레이 -->
        <div v-if="!hasGraph" class="empty-state empty-overlay">
          <template v-if="autoPopulateHint">
            <!-- 보기를 켰지만 그릴 대상이 0개 — 침묵 대신 안내 -->
            <div class="empty-icon">🔍</div>
            <h3>{{ activeViewLabel }} 보기로 표시할 노드가 없습니다</h3>
            <p>{{ autoPopulateHint }}</p>
          </template>
          <template v-else-if="!hasAnyData">
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

      <!-- 플로팅: 우측 패널 토글 -->
      <button
        v-if="!showNodePanel"
        class="panel-toggle right"
        @click="showNodePanel = !showNodePanel"
      >
        ‹
      </button>
    </div>
    
    <!-- 플로팅: 좌측 상단 컨트롤 -->
    <div class="floating-controls left-top">
      <!-- 논리명 / 물리명 토글. Navigator·NvlGraph 캡션 동기화. -->
      <label
        class="name-toggle"
        :title="showLogicalNames ? '논리명 표시 중 — 클릭하면 물리명' : '물리명 표시 중 — 클릭하면 논리명'"
        @click.prevent="navigatorStore.toggleLogicalNames()"
      >
        <span class="toggle-track" :class="{ active: showLogicalNames }">
          <span class="toggle-thumb" />
        </span>
        <span class="toggle-text">{{ showLogicalNames ? '논리명' : '물리명' }}</span>
      </label>

      <!-- 보기 ▾ (spec 018): 보기 모드(모듈간/업무 단위)를 한 곳에서 단일선택.
           모듈간/업무 단위는 서로 배타 — 한 번에 하나만. 관계필터는 별개 축(동시 가능). -->
      <div class="view-menu-wrap">
        <button
          class="view-menu-btn"
          :class="{ active: isViewModeActive }"
          title="보기 — 그래프를 보는 방식 (하나만 선택)"
          @click="showViewMenu = !showViewMenu; showFilterMenu = false"
        >
          <svg class="vm-eye" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>
          </svg>
          <span class="vm-btn-label">보기: <strong>{{ activeViewLabel }}</strong></span>
          <span class="vm-caret">▾</span>
        </button>
        <Transition name="fade">
          <div v-if="showViewMenu" class="view-menu-pop">
            <div class="vm-section-label">보기 모드 <span class="vm-section-hint">하나만 선택</span></div>
            <button class="view-menu-item" :class="{ active: viewMode === 'module' }" @click="selectViewMode('module')">
              <span class="vm-icon">🔗</span>
              <span class="vm-text"><b>모듈간 상호작용</b><small>모듈·함수·테이블만</small></span>
              <span class="vm-check">{{ viewMode === 'module' ? '✓' : '' }}</span>
            </button>
            <button class="view-menu-item" :class="{ active: viewMode === 'area' }" @click="selectViewMode('area')">
              <span class="vm-icon">🧩</span>
              <span class="vm-text"><b>실제 업무 단위</b><small>호출로 함께 움직이는 루틴 묶음</small></span>
              <span class="vm-check">{{ viewMode === 'area' ? '✓' : '' }}</span>
            </button>
          </div>
        </Transition>
      </div>

      <!-- 필터 ▾ (spec 020): 보기 ▾ 옆 — 관계 종류 끄고/켜기 + 읽기만/쓰기만. 보기모드와 직교. -->
      <div class="view-menu-wrap">
        <button
          class="view-menu-btn"
          :class="{ active: hiddenFilterCount > 0 }"
          title="필터 — 노드·관계 종류 끄고/켜기"
          @click="showFilterMenu = !showFilterMenu; showViewMenu = false"
        >
          <svg class="vm-eye" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 4h18l-7 8v6l-4 2v-8L3 4Z"/>
          </svg>
          <span class="vm-btn-label">필터<strong v-if="hiddenFilterCount > 0"> {{ hiddenFilterCount }}</strong></span>
          <span class="vm-caret">▾</span>
        </button>
        <Transition name="fade">
          <div v-if="showFilterMenu" class="view-menu-pop">
            <!-- 섹션 B: 내부 요소 펼치기 (기본 접힘 해제 — 관계 끄고/켜기와 독립 축, spec 059) -->
            <div class="vm-section-label">내부 요소 <span class="vm-section-hint">기본 접힘 해제</span></div>
            <button
              class="view-menu-item"
              :class="{ active: showHidden }"
              @click="toggleShowHidden"
            >
              <span class="vm-icon">{{ showHidden ? '☑' : '☐' }}</span>
              <span class="vm-text"><b>내부 요소까지 펼치기</b><small>변수·내부 연결·분석 보조 노드 — 지운 게 아니라 접어둔 것</small></span>
            </button>

            <div class="vm-divider" />

            <!-- 노드 영역: 노드 종류 끄고/켜기 — 종류 많아도 칩이 감싸져 콤팩트(spec 038) -->
            <div class="vm-section-label">노드 끄고/켜기 <span class="vm-section-hint">현재 캔버스 기준</span></div>
            <div v-if="nodeTypeList.length === 0" class="vm-empty-hint">
              지금 캔버스에 그려진 노드가 없어요.<br>네비게이터에서 노드를 올리면 종류가 여기 나타납니다.
            </div>
            <template v-else>
              <div class="vm-chips">
                <button
                  v-for="nt in nodeKindList"
                  :key="'n-' + nt.type"
                  class="vm-chip"
                  :class="{ off: !nodeFilter.isShown(nt.type) }"
                  :title="(nodeFilter.isShown(nt.type) ? '끄기: ' : '켜기: ') + nt.type"
                  @click="nodeFilter.toggle(nt.type)"
                >{{ nt.type }}<span class="vm-chip-n">{{ nt.count }}</span></button>
              </div>
              <!-- 역할은 종류와 다른 축이라 줄을 나눈다(개요 패널과 같은 규칙, 원칙 §7). -->
              <template v-if="nodeRoleList.length > 0">
                <div class="vm-sub-label">역할</div>
                <div class="vm-chips">
                  <button
                    v-for="nt in nodeRoleList"
                    :key="'r-' + nt.type"
                    class="vm-chip"
                    :class="{ off: !nodeFilter.isShown(nt.type) }"
                    :title="(nodeFilter.isShown(nt.type) ? '끄기: ' : '켜기: ') + nt.type"
                    @click="nodeFilter.toggle(nt.type)"
                  >{{ nt.type }}<span class="vm-chip-n">{{ nt.count }}</span></button>
                </div>
              </template>
            </template>

            <div class="vm-divider" />

            <!-- 관계 영역: 관계 종류 끄고/켜기 -->
            <div class="vm-section-label">관계 끄고/켜기 <span class="vm-section-hint">현재 캔버스 기준</span></div>
            <div v-if="relTypeList.length === 0" class="vm-empty-hint">
              지금 캔버스에 그려진 관계가 없어요.<br>위 <b>보기</b>를 고르거나 노드를 올리면 관계 종류가 여기 나타납니다.
            </div>
            <div v-else class="vm-chips">
              <button
                v-for="rt in relTypeList"
                :key="'r-' + rt.type"
                class="vm-chip"
                :class="{ off: !relFilter.isShown(rt.type) }"
                :title="(relFilter.isShown(rt.type) ? '끄기: ' : '켜기: ') + rt.type"
                @click="relFilter.toggle(rt.type)"
              >{{ rt.type }}<span class="vm-chip-n">{{ rt.count }}</span></button>
            </div>
          </div>
        </Transition>
      </div>
    </div>
    <!-- 메뉴 바깥 클릭 시 닫힘 -->
    <div v-if="showViewMenu" class="view-menu-backdrop" @click="showViewMenu = false" />
    <div v-if="showFilterMenu" class="view-menu-backdrop" @click="showFilterMenu = false" />
    
    <!-- 플로팅: 노드 상세 패널 -->
    <Transition name="slide-right">
      <div
        class="floating-panel right"
        v-if="showNodePanel"
        :style="{ width: `${panelWidth}px` }"
      >
        <div class="panel-header">
          <span>{{ selectedNode ? 'Node' : selectedRelationship ? 'Relationship' : 'Overview' }}</span>
          <button @click="showNodePanel = false">›</button>
        </div>
        <div class="panel-body">
          <NodeDetailPanel
            :layerStats="layerStats"
            @layer-filter="handleLayerFilter"
            :node="selectedNode"
            :relationship="selectedRelationship"
            :nodeStats="overallNodeStats"
            :relationshipStats="overallRelationshipStats"
            :totalNodes="graphData?.nodes.length || 0"
            :totalRelationships="graphData?.links.length || 0"
            :hasGraph="hasGraph"
            :isProcessing="isProcessing"
            :activeFilters="activeNodeLoads"
            :activeRelFilters="activeRelLoads"
            :allNodes="graphData?.nodes || []"
            @node-type-select="handleNodeTypeSelect"
            @relationship-type-select="handleRelTypeSelect"
            @label-filter="handleLabelFilter"
            @relationship-filter="handleRelFilterToggle"
            @clear-filters="handleClearFilters"
            @node-select="handleNodeSearchSelect"
            @reset-graph="handleResetGraph"
            @cluster-select="handleClusterSelect"
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

// 의미검색 뭉치 중 현재 그래프에 없는 노드 안내 배너 (spec 046)
.cluster-missing-banner {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 12px;
  font-size: 12px;
  color: #e8c89a;
  background: rgba(36, 29, 22, 0.95);
  border: 1px solid #4a3a2a;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);

  button {
    background: none;
    border: none;
    color: #9a9187;
    cursor: pointer;
    font-size: 12px;
  }
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
// "모듈간 상호작용 보기" 단일 프리셋 버튼 — 누르면 MODULE+FUNCTION+TABLE 라벨만 표시
// ============================================================================

.interaction-preset-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text);
  cursor: pointer;
  white-space: nowrap;
  box-shadow: var(--shadow-md);
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;

  &:hover {
    background: var(--color-bg-tertiary);
    border-color: var(--color-text-muted);
  }

  &.active {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: #fff;
  }
}

// ============================================================================
// 보기 ▾ 드롭다운 (spec 018) — 보기 모드 다중토글 + 노드패널 보기옵션
// ============================================================================
.view-menu-wrap { position: relative; }

.view-menu-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;          // 살짝 축소(32→28) — 글자 크기(12px)는 유지
  padding: 0 11px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: 12px;
  font-weight: 600;
  // line-height:1 로 텍스트 line-box 를 글리프 높이에 맞춰, name-toggle(18px) 과의
  // line-height 불일치로 글자가 아래로 치우치던 문제 제거. align-items:center 가 중앙정렬.
  line-height: 1;
  color: var(--color-text);
  cursor: pointer;
  white-space: nowrap;
  box-shadow: var(--shadow-md);
  transition: background 0.15s ease, border-color 0.15s ease;

  // 이모지/라벨/캐럿을 각각 flex item 으로 만들어 중앙선에 정렬(익명 텍스트노드의
  // 들쭉날쭉한 baseline 대신 명시적 inline-flex item 으로 통일).
  // SVG 아이콘 — viewBox 대칭이라 align-items:center 로 글자 중앙선에 정확히 정렬(이모지 baseline 편차 제거).
  .vm-eye { display: inline-flex; align-items: center; width: 14px; height: 14px; }
  .vm-btn-label { display: inline-flex; align-items: center; line-height: 1; }
  strong { font-weight: 700; }
  .vm-caret { display: inline-flex; align-items: center; font-size: 10px; line-height: 1; opacity: 0.7; }

  &:hover { background: var(--color-bg-tertiary); border-color: var(--color-text-muted); }
  &.active { border-color: var(--color-accent); color: var(--color-accent); }
}

.view-menu-pop {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 220px;
  width: max-content;
  max-width: 320px;
  // 종류·관계 수가 많아도 — 칩이 감싸지고, 그래도 길면 메뉴 자체가 스크롤(화면 안 넘침).
  max-height: min(70vh, 520px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg, var(--shadow-md));
  z-index: 10;
}

/* 필터 칩 — 노드/관계 종류 토글. 많아도 flex-wrap 으로 감싸져 콤팩트. 끈 것은 흐리게+취소선. */
.vm-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 2px;
}
.vm-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.6;
  border-radius: 11px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  cursor: pointer;
  white-space: nowrap;
  transition: opacity 0.12s ease, border-color 0.12s ease;

  .vm-chip-n { font-size: 10px; font-weight: 500; opacity: 0.55; }
  &:hover { border-color: var(--color-text-muted); }
  &.off { opacity: 0.4; text-decoration: line-through; }
}

.view-menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 11px 12px;
  background: transparent;
  border: none;
  border-radius: var(--radius-md, 8px);
  color: var(--color-text);
  cursor: pointer;
  text-align: left;

  .vm-icon { font-size: 16px; width: 20px; text-align: center; flex: none; }
  // word-break:keep-all = 한글을 단어 단위로만 줄바꿈(글자 중간 안 쪼갬) → 설명 가독성 근본해결.
  .vm-text { display: flex; flex-direction: column; gap: 3px; line-height: 1.4; flex: 1; min-width: 0; word-break: keep-all; }
  .vm-text b { font-size: 13px; font-weight: 600; }
  .vm-text small { font-size: 11.5px; line-height: 1.5; color: var(--color-text-muted); }
  .vm-check { width: 14px; text-align: center; color: var(--color-accent); font-weight: 700; flex: none; }

  &:hover { background: var(--color-bg-tertiary); }
  &.active { background: var(--color-bg-tertiary); }
  &.active .vm-text b { color: var(--color-accent); }
}

.vm-sub-label {
  margin: 8px 0 4px;
  font-size: 11px;
  color: var(--color-text-dim, #868e96);
  letter-spacing: 0.02em;
}
.vm-section-label {
  padding: 11px 12px 6px;
  font-size: 10.5px;
  font-weight: 700;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;

  .vm-section-hint { font-weight: 500; text-transform: none; letter-spacing: 0; opacity: 0.65; margin-left: 6px; }
}
.vm-divider { height: 1px; margin: 6px 4px; background: var(--color-border); }
.vm-empty-hint {
  padding: 6px 12px 10px;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--color-text-muted);
  b { color: var(--color-text-light); font-weight: 600; }
}

.view-menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
  background: transparent;
}

// ============================================================================
// 논리명 / 물리명 토글 — view-switcher 와 시각적으로 짝맞춤
// ============================================================================

.name-toggle {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 28px;          // view-menu-btn 과 동일하게 살짝 축소(글자 12px 유지)
  padding: 0 10px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  user-select: none;
  box-shadow: var(--shadow-md);
  transition: background 0.15s ease, border-color 0.15s ease;

  &:hover {
    background: var(--color-bg-tertiary);
    border-color: var(--color-text-muted);
  }

  .toggle-track {
    position: relative;
    width: 28px;
    height: 16px;
    border-radius: 8px;
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
    transition: background 0.18s ease, border-color 0.18s ease;
  }

  .toggle-thumb {
    position: absolute;
    top: 1px;
    left: 1px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--color-text-light);
    transition: transform 0.18s ease, background 0.18s ease;
  }

  .toggle-track.active {
    background: var(--color-accent);
    border-color: var(--color-accent);

    .toggle-thumb {
      transform: translateX(12px);
      background: #fff;
    }
  }

  .toggle-text {
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text-bright);
    letter-spacing: 0.2px;
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
