/**
 * canvas.ts
 * NvlGraph 캔버스에 "지금 표시되고 있는" 노드 집합을 관리한다.
 *
 * 전체 분석 데이터(projectStore.nodeMap/linkMap)와 사용자가 캔버스에서
 * 보고 있는 부분집합을 분리하여, Navigator 는 전체를 소스로 쓰고
 * NvlGraph 는 canvasGraphData 만 렌더하도록 한다.
 *
 * 인터랙션:
 *   - addNodeToCanvas(id)      : 드롭/검색선택/트리 더블클릭 — 그 노드만 추가
 *   - expandNodeOnCanvas(id)   : 캔버스 노드 더블클릭 — 1-hop 이웃 확장 (누적)
 *   - collapseNodeOnCanvas(id) : 컨텍스트 메뉴 접기 — 그 노드와만 연결된 이웃 제거
 *   - removeFromCanvas(id)     : 컨텍스트 메뉴 제거
 *   - clearCanvas()            : 전체 비우기
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useAnalyzerStore } from '@/workflows/code-analysis'
import { buildPanelGraphProjection } from '@/features/code-analysis/panelGraphProjection'
import { computeTableOwners } from '@/features/code-analysis/areaGraph'
import { isContainerNode, CALLABLE_LABELS, CONTAINER_LABELS } from '@/shared/utils/nodeClassify'
import { isLinkHidden, isNodeHidden, isSystemNode } from '@/shared/utils/graphVisibility'
import type { GraphData, GraphLink, GraphNode } from '@/shared/types'

/**
 * 캔버스 프리셋 — 일반 그래프와 다른 표시 규칙을 적용하는 모드.
 *   - 'module-interaction' : MODULE/TABLE 만 노출, 둘 사이 가상 링크 합성(루틴 R/W를 모듈로 압축).
 * (spec 059: 건강 보기 프리셋 'health-rw' 삭제 — 화면 전체를 위험색으로 칠해 정작 봐야 할 결합이
 *  묻혔다. 실제 건강 악화를 보여주는 화면은 별도 UI/UX 로 다시 설계한다.
 *  영역을 노드로 접는 'area-relation' 프리셋도 폐기 — 영역은 노드가 아니라 헐(테두리)이다.)
 */
export type CanvasPreset = 'module-interaction' | null

/** 노드별 계층 조상(패키지) — 헐/클러스터(spec 021·022) 그룹핑용.
 * (fileKey/fileLabel/packageLabel 제거 — 유일 소비자였던 '영역(구조)' 보기 삭제, 2026-07-16.) */
export interface HierarchyInfo {
  packageKey: string | null
  isExternal: boolean
}

// HAS_MEMBER 는 그릇→루틴/데이터 공통이지만, 다음 단계(FUNCTION_TO_TABLE_REL)에서 테이블을
// READS/WRITES 하는 루틴만 가상 링크로 이어지므로 데이터 멤버는 자연 제외된다.
const MODULE_TO_FUNCTION_REL = new Set(['HAS_MEMBER'])
const FUNCTION_TO_TABLE_REL = new Set(['FROM', 'READS', 'REFER_TO', 'REFERS_TO', 'WRITES'])
// DBMS 의 READS/WRITES 는 루틴 루트가 아니라 그 안에 중첩된 구문 노드(SELECT/INSERT/MERGE…)에서
// 나온다. 구문 → 소유 루틴은 PARENT_OF 엣지 체인으로만 거슬러 올라갈 수 있다
// (parent_id/owner_id 는 모델 필드일 뿐 노드 속성으로 영속되지 않음 — Neo4j 실측 0건).
// PARENT_OF 는 그릇/루틴 트리(parent)→child 방향이라, child id 로 부모를 찾으려면 target→source 로 인덱스.
const STATEMENT_PARENT_REL = new Set(['PARENT_OF'])

function hasLabel(node: GraphNode, label: string): boolean {
  const target = label.toUpperCase()
  return (node.labels || []).some(l => l.toUpperCase() === target)
}

export const useCanvasStore = defineStore('canvas', () => {
  const projectStore = useAnalyzerStore()

  /** 캔버스에 표시되는 노드 ID 집합. 여기 있는 것만 NvlGraph 에 넘어간다. */
  const canvasNodeIds = ref<Set<string>>(new Set())

  /** 펼침 상태(spec 059) — 모듈간 상호작용 보기에서 어느 모듈을 열어 놨는가. */
  const expandedModuleIds = ref<Set<string>>(new Set())

  /** 활성 프리셋. null 이면 일반 모드. */
  const presetMode = ref<CanvasPreset>(null)

  // 노드패널 칩 = 캔버스에 "누적 로드"(spec 025, 표시필터 아님). 누른 노드 라벨·관계 타입을 다중으로 캔버스에 띄운다.
  const loadedLabels = ref<Set<string>>(new Set())
  const loadedRelTypes = ref<Set<string>>(new Set())

  function isCanvasEligible(nodeId: string): boolean {
    const node = projectStore.nodeMap.get(nodeId)
    return Boolean(node && !isSystemNode(node))
  }

  /** 원시 상태를 읽는 프리셋까지 포함한 캔버스 최종 시스템 경계. */
  function excludeSystemGraph(graph: GraphData): GraphData {
    const nodes = graph.nodes.filter(node => !isSystemNode(node))
    const visibleIds = new Set(nodes.map(node => node.id))
    const links = graph.links.filter(link => visibleIds.has(link.source) && visibleIds.has(link.target))
    return { nodes, links }
  }

  /**
   * 모듈간 상호작용 가상 그래프 — MODULE/TABLE 노드 + 그 사이를 잇는 가상 링크.
   *
   * 올바른 데이터 체인(DBMS):
   *   그릇 -[HAS_MEMBER]-> 루틴 -[PARENT_OF*]-> 구문(SELECT/INSERT/MERGE…) -[READS/WRITES]-> TABLE
   * READS/WRITES 의 source 는 루틴 루트가 아니라 그 안에 중첩된 구문 노드라(실측 156/157),
   * funcToModule 직접조회는 거의 다 실패해 2노드만 떴다 — 구문→소유그릇을 PARENT_OF 로 해소한다.
   *
   * 알고리즘 (O(N)):
   *   1) linkMap 을 한 번 훑어 HAS_MEMBER 로 funcId → moduleId, PARENT_OF 로 childId → parentId 인덱스
   *   2) linkMap 을 한 번 더 훑어 (구문) -[READS/WRITES/...]-> TABLE 만나면
   *      resolveModule(구문) 로 PARENT_OF 를 거슬러 소유 그릇을 찾아 가상 링크 후보로 수집
   *   3) (moduleId, tableId, type, op) 단위로 dedup —
   *      원본 관계 타입(READS/WRITES/FROM/...) 과 op 등 속성을 그대로 보존.
   *      → 색상/캡션이 일반 그래프와 동일하게 자동 적용됨.
   */
  /**
   * 공유 인덱스(모듈간·건강 보기 공통):
   *  - funcToModule: 루틴 id → 소유 그릇(모듈) id  (그릇 -HAS_MEMBER-> 루틴)
   *  - childToParent: 자식 id → 부모 id           (부모 -PARENT_OF-> 자식, 역방향)
   * funcToModule 의 키 집합 = "루틴(호출가능 노드) id" 이기도 하다(구문→루틴 해소에 사용).
   */
  function buildModuleIndexes(): { funcToModule: Map<string, string>; childToParent: Map<string, string> } {
    const funcToModule = new Map<string, string>()
    const childToParent = new Map<string, string>()
    for (const link of projectStore.linkMap.values()) {
      if (STATEMENT_PARENT_REL.has(link.type)) {
        childToParent.set(link.target, link.source)
        continue
      }
      if (!MODULE_TO_FUNCTION_REL.has(link.type)) continue
      const moduleNode = projectStore.nodeMap.get(link.source)
      const funcNode = projectStore.nodeMap.get(link.target)
      if (!moduleNode || !funcNode) continue
      if (!isContainerNode(moduleNode.labels || [])) continue
      if (!(funcNode.labels || []).some(l => CALLABLE_LABELS.has(l))) continue
      funcToModule.set(funcNode.id, moduleNode.id)
    }
    return { funcToModule, childToParent }
  }

  function buildModuleInteractionGraph(): GraphData {
    const { funcToModule, childToParent } = buildModuleIndexes()

    // 구문 노드(READS/WRITES 의 source) → 소유 그릇 id 해소.
    // 자신이 루틴이면 funcToModule 에 바로 있고, 중첩 구문이면 PARENT_OF 를 거슬러
    // 올라가 funcToModule 에 있는 조상(루틴)을 만나 그 그릇을 반환. 못 찾으면 null.
    // memoize — 깊은 중첩(실측 최대 9단계)에서도 노드당 1회만 walk.
    const resolveCache = new Map<string, string | null>()
    function resolveModule(nodeId: string): string | null {
      const cached = resolveCache.get(nodeId)
      if (cached !== undefined) return cached
      // 사이클/누락 방어를 위해 방문 경로를 추적, 해소되면 경로 전체를 memoize.
      const path: string[] = []
      const seen = new Set<string>()
      let cur: string | undefined = nodeId
      let result: string | null = null
      while (cur !== undefined && !seen.has(cur)) {
        const memo = resolveCache.get(cur)
        if (memo !== undefined) { result = memo; break }
        const direct = funcToModule.get(cur)
        if (direct !== undefined) { result = direct; break }
        seen.add(cur)
        path.push(cur)
        cur = childToParent.get(cur)
      }
      for (const id of path) resolveCache.set(id, result)
      return result
    }

    interface VirtualInfo {
      moduleId: string
      tableId: string
      type: string
      op: string
      originProps: Record<string, unknown>
      viaFuncIds: Set<string>
    }
    const virtuals = new Map<string, VirtualInfo>()
    const moduleIds = new Set<string>()
    const tableIds = new Set<string>()

    for (const link of projectStore.linkMap.values()) {
      if (!FUNCTION_TO_TABLE_REL.has(link.type)) continue
      // R/W source 는 루틴 루트가 아니라 중첩 구문(SELECT/INSERT/MERGE…)일 수 있어
      // PARENT_OF 체인으로 소유 그릇을 해소(직접 funcToModule.get 은 156/157 누락 → 2노드 버그).
      const moduleId = resolveModule(link.source)
      if (!moduleId) continue
      const tableNode = projectStore.nodeMap.get(link.target)
      if (!tableNode) continue
      if (!hasLabel(tableNode, 'TABLE')) continue

      const tableId = tableNode.id
      const op = typeof link.properties?.op === 'string' ? (link.properties.op as string) : ''
      const key = `${moduleId}\u0000${tableId}\u0000${link.type}\u0000${op}`

      let info = virtuals.get(key)
      if (!info) {
        info = {
          moduleId,
          tableId,
          type: link.type,
          op,
          originProps: { ...(link.properties || {}) },
          viaFuncIds: new Set(),
        }
        virtuals.set(key, info)
      }
      info.viaFuncIds.add(link.source)
      moduleIds.add(moduleId)
      tableIds.add(tableId)
    }

    // ── 모듈↔모듈 CALL 집계 (spec 020 US3) — 루틴간 호출을 모듈로 끌어올림(R/W와 동일 방식) ──
    // CALLS 끝점(caller/callee)을 resolveModule로 소유 모듈에 해소 → 다른 모듈이면 가상 링크.
    interface CallVirtual { fromMod: string; toMod: string; viaFuncIds: Set<string> }
    const callVirtuals = new Map<string, CallVirtual>()
    for (const link of projectStore.linkMap.values()) {
      if (link.type !== 'CALLS') continue
      const fromMod = resolveModule(link.source)
      const toMod = resolveModule(link.target)
      if (!fromMod || !toMod || fromMod === toMod) continue
      const key = `${fromMod}\u0000${toMod}`
      let cv = callVirtuals.get(key)
      if (!cv) { cv = { fromMod, toMod, viaFuncIds: new Set() }; callVirtuals.set(key, cv) }
      cv.viaFuncIds.add(link.source)
      moduleIds.add(fromMod)
      moduleIds.add(toMod)
    }

    // 노드 — dedupe(같은 id 중복 push 금지). 실제 push된 id 집합으로 링크 끝점을 가드한다.
    const nodes: GraphNode[] = []
    const presentIds = new Set<string>()
    for (const id of moduleIds) {
      if (presentIds.has(id)) continue
      const n = projectStore.nodeMap.get(id)
      if (n) { nodes.push(n); presentIds.add(id) }
    }
    for (const id of tableIds) {
      if (presentIds.has(id)) continue
      const n = projectStore.nodeMap.get(id)
      if (n) { nodes.push(n); presentIds.add(id) }
    }

    const links: GraphLink[] = []
    for (const info of virtuals.values()) {
      // 끝점 노드가 실제로 추가된 경우만 링크 생성 — 누락 끝점 링크는 NVL/d3-force가
      // null 참조로 크래시(`Cannot read properties of null`). 양 끝 존재 보장.
      if (!presentIds.has(info.moduleId) || !presentIds.has(info.tableId)) continue
      const viaNames: string[] = []
      for (const fid of info.viaFuncIds) {
        const fn = projectStore.nodeMap.get(fid)
        const name = (fn?.properties?.name as string) || fid
        viaNames.push(name)
        if (viaNames.length >= 5) break
      }
      links.push({
        id: `virtual:${info.type}:${info.op}:${info.moduleId}->${info.tableId}`,
        source: info.moduleId,
        target: info.tableId,
        type: info.type,
        properties: {
          ...info.originProps,
          virtual: true,
          via_count: info.viaFuncIds.size,
          via_sample: viaNames,
        },
      })
    }

    // 모듈↔모듈 CALL 가상 링크 (양 끝 모듈 노드 존재 시).
    for (const cv of callVirtuals.values()) {
      if (!presentIds.has(cv.fromMod) || !presentIds.has(cv.toMod)) continue
      links.push({
        id: `virtual:CALLS:${cv.fromMod}->${cv.toMod}`,
        source: cv.fromMod,
        target: cv.toMod,
        type: 'CALLS',
        properties: { virtual: true, via_count: cv.viaFuncIds.size },
      })
    }

    // ── 펼친 모듈의 루틴 드러내기 (spec 059 US3) ────────────────────────────
    // 기본은 모듈 단위로 접힌 상태다. 사용자가 더블클릭한 모듈만 그 안의 루틴을 드러내고,
    // 그 루틴이 실제로 닿는 관계(CALLS / 테이블 R/W)를 함께 그린다. 전체 펼치기는 없다 —
    // 한 번에 다 펼치면 지금 고치려는 헤어볼로 되돌아간다.
    for (const moduleId of expandedModuleIds.value) {
      if (!presentIds.has(moduleId)) continue
      const routineIds: string[] = []
      for (const link of projectStore.linkMap.values()) {
        if (link.type !== 'HAS_MEMBER' || link.source !== moduleId) continue
        const routine = projectStore.nodeMap.get(link.target)
        if (!routine) continue
        if (!(routine.labels || []).some(l => CALLABLE_LABELS.has(l))) continue
        if (!presentIds.has(routine.id)) { nodes.push(routine); presentIds.add(routine.id) }
        routineIds.push(routine.id)
        // 모듈 → 자기 루틴: 소속을 보여주는 선. 같은 영역 안이라 흐리게 그려진다.
        links.push({
          id: `expand:HAS_MEMBER:${moduleId}->${routine.id}`,
          source: moduleId,
          target: routine.id,
          type: 'HAS_MEMBER',
          properties: { virtual: true },
        })
      }

      // 드러난 루틴이 닿는 곳 — 이미 화면에 있는 대상과만 잇는다(새 노드를 추가로 끌어오지 않는다).
      const routineSet = new Set(routineIds)
      for (const link of projectStore.linkMap.values()) {
        const fromRoutine = routineSet.has(link.source)
        if (!fromRoutine) continue
        if (link.type === 'CALLS') {
          const calleeModule = resolveModule(link.target)
          if (calleeModule && presentIds.has(calleeModule) && calleeModule !== moduleId) {
            links.push({
              id: `expand:CALLS:${link.source}->${calleeModule}`,
              source: link.source, target: calleeModule, type: 'CALLS',
              properties: { virtual: true },
            })
          }
          continue
        }
        if (!FUNCTION_TO_TABLE_REL.has(link.type)) continue
        if (!presentIds.has(link.target)) continue
        links.push({
          id: `expand:${link.type}:${link.source}->${link.target}`,
          source: link.source, target: link.target, type: link.type,
          properties: { ...(link.properties || {}), virtual: true },
        })
      }
    }

    return { nodes, links }
  }



  /**
   * 계층 조상 맵 (spec 021) — 노드별 {파일, 패키지} 그룹 키/라벨. 중첩 헐의 단일 도출처(DRY).
   * 기존 그래프 엣지로 도출 → 백엔드 무변경·재분석 0:
   *   파일→패키지 = `FILE -BELONGS_TO-> PACKAGE`
   *   파일→루틴   = `FILE -HAS_MEMBER-> 루틴` (역인덱스로 루틴→파일)
   *   폴백        = 루틴.file_path (HAS_MEMBER 없을 때 파일 키)
   * external 라벨이면 패키지를 가상 `"__external__"` 로 묶어 분리(프론트 분리 그룹).
   */
  // ★캐시되는 computed — hullLevels·clusterKeyOf·clusterLabelOf 가 공유한다. 과거엔 각 computed 가
  // 따로 호출해 한 렌더에 nodeMap+linkMap 전수 순회를 5번 했다 → 1회로(nodeMap/linkMap 바뀔 때만 재계산).
  const hierarchyMap = computed<Map<string, HierarchyInfo>>(() => {
    const fileToPackage = new Map<string, string>()   // fileNodeId -> packageNodeId (BELONGS_TO)
    const memberToFile = new Map<string, string>()    // memberId -> containerId (HAS_MEMBER)
    for (const link of projectStore.linkMap.values()) {
      if (link.type === 'BELONGS_TO') fileToPackage.set(link.source, link.target)
      else if (link.type === 'HAS_MEMBER') memberToFile.set(link.target, link.source)
    }
    const map = new Map<string, HierarchyInfo>()
    for (const node of projectStore.nodeMap.values()) {
      const isExternal = (node.labels || []).includes('EXTERNAL')
      const containerId = memberToFile.get(node.id) ?? null
      let packageKey: string | null = containerId ? (fileToPackage.get(containerId) ?? null) : null
      if (!packageKey) packageKey = fileToPackage.get(node.id) ?? null
      if (isExternal) packageKey = '__external__'
      map.set(node.id, { packageKey, isExternal })
    }
    return map
  })

  /**
   * 테이블 → 소속 영역(패키지) 키 (spec 059).
   *
   * 테이블은 여러 영역이 함께 쓰는 공용 자산이지만 화면에 그리려면 소속이 하나 있어야 한다.
   * 예전에는 모든 테이블을 `__tables__` 한 구역에 몰아넣었는데, 그 구역이 선을 화면 가로로 길게
   * 늘여 정작 봐야 할 결합을 가렸다. 그래서 **자기를 가장 많이 쓰는 영역의 테두리 안**으로 녹인다.
   *
   * 주인 판정(사업 결정 2026-07-21): **쓰기가 가장 많은 영역**. 쓰기가 같으면 읽기가 많은 쪽.
   * 그래도 앞선 영역이 유일하지 않으면 주인을 정하지 않는다 — 데이터가 말해주지 않는 소유권을
   * 만들어내지 않는다(실측: 테이블 22개 중 20개는 갈리고 2개는 완전 동률).
   *
   * R/W 의 출발점은 루틴일 수도(Framework) 중첩 구문일 수도(DBMS) 있어 PARENT_OF 를 거슬러
   * 소유 루틴을 찾는다. 이 한 식이 두 전략을 함께 덮으므로 전략 분기가 없다.
   */
  const tableAreaMap = computed<Map<string, string | null>>(() => {
    const hmap = hierarchyMap.value
    const owners = computeTableOwners({
      nodes: [...projectStore.nodeMap.values()],
      links: [...projectStore.linkMap.values()],
      routineLabels: CALLABLE_LABELS,
      tableLabel: 'TABLE',
      // 루틴 → 영역: 계층맵이 이미 파일→패키지를 해소해 둔다(사본 0).
      areaOfRoutine: routineId => hmap.get(routineId)?.packageKey ?? null,
    })
    const result = new Map<string, string | null>()
    for (const [tableId, own] of owners) result.set(tableId, own.ownerArea)
    return result
  })

  /** 헐·클러스터가 쓰는 테이블 소속 키. 주인이 없거나 아무도 안 쓰면 null(그룹 미배정). */
  function tableAreaKey(tableId: string): string | null {
    return tableAreaMap.value.get(tableId) ?? null
  }

  /** NvlGraph 에 전달할 부분집합. 프리셋이 활성화되면 가상 그래프를 반환. */
  // 캔버스가 따라갈 링크 — linkMap(날것 전부)에서 기본 숨김 타입을 거른다. "숨김 요소 표시"면
  // 거르지 않고 메타·보조 링크까지 전부(neo4j 그대로). graphData 와 동일한 단일 정의(graphVisibility).
  function visibleLinks(): GraphLink[] {
    const showAll = projectStore.showHidden
    const out: GraphLink[] = []
    for (const link of projectStore.linkMap.values()) {
      if (showAll || !isLinkHidden(link.type)) out.push(link)
    }
    return out
  }

  /** 패널 칩이 활성일 때만 관계 allowlist를 만든다. 일반 캔버스는 기존 끝점 기반 관계 표시를 유지한다. */
  const panelProjection = computed(() => {
    if (loadedLabels.value.size === 0 && loadedRelTypes.value.size === 0) return null
    const eligibleNodes: GraphNode[] = []
    for (const node of projectStore.nodeMap.values()) {
      if (!isSystemNode(node)) eligibleNodes.push(node)
    }
    return buildPanelGraphProjection(
      eligibleNodes,
      visibleLinks(),
      loadedLabels.value,
      loadedRelTypes.value,
    )
  })

  const canvasGraphData = computed<GraphData>(() => {
    if (presetMode.value === 'module-interaction') {
      return excludeSystemGraph(buildModuleInteractionGraph())
    }

    // 캔버스는 "숨김 요소 표시" 토글과 무관 — 항상 사용자가 올린 부분집합(canvasNodeIds)만 렌더.
    // (토글은 네비게이터·오버뷰에 숨김 노드를 "사용 가능"하게 드러낼 뿐, 캔버스를 강제로 안 채운다.)
    const ids = canvasNodeIds.value
    if (ids.size === 0) return { nodes: [], links: [] }
    const nodes: GraphNode[] = []
    for (const node of projectStore.nodeMap.values()) {
      if (ids.has(node.id)) nodes.push(node)
    }
    const links: GraphLink[] = []
    const allowedPanelLinkIds = panelProjection.value?.linkIds
    for (const link of visibleLinks()) {
      if (
        ids.has(link.source)
        && ids.has(link.target)
        && (!allowedPanelLinkIds || allowedPanelLinkIds.has(link.id))
      ) links.push(link)
    }
    return excludeSystemGraph({ nodes, links })
  })

  function addNodeToCanvas(nodeId: string): void {
    if (!isCanvasEligible(nodeId)) return
    if (canvasNodeIds.value.has(nodeId)) return
    const next = new Set(canvasNodeIds.value)
    next.add(nodeId)
    canvasNodeIds.value = next
  }

  function expandNodeOnCanvas(nodeId: string): void {
    const next = new Set(canvasNodeIds.value)
    next.add(nodeId)
    // 확장 = 1-hop 이웃 추가. visibleLinks 가 숨김 "링크"는 거르지만, 보이는 링크(HAS_MEMBER 등)로
    // 닿는 숨김 "노드"(변수·DEFINE 등)는 그냥 따라오면 안 된다 — "숨김 모두 보기" OFF 면 제외.
    // (캔버스 표시는 사용자가 로드한 노드 기준이라 render 단계에서 안 거르므로, 여기서 안 넣는 게 근본.)
    const showAll = projectStore.showHidden
    const canAdd = (id: string): boolean => {
      const n = projectStore.nodeMap.get(id)
      if (n && isSystemNode(n)) return false
      if (showAll) return true
      return !n || !isNodeHidden(n)
    }
    for (const link of visibleLinks()) {
      if (link.source === nodeId && canAdd(link.target)) next.add(link.target)
      else if (link.target === nodeId && canAdd(link.source)) next.add(link.source)
    }
    canvasNodeIds.value = next
  }

  function removeFromCanvas(nodeId: string): void {
    if (!canvasNodeIds.value.has(nodeId)) return
    const next = new Set(canvasNodeIds.value)
    next.delete(nodeId)
    canvasNodeIds.value = next
  }

  /**
   * 노드의 1단계 이웃을 모두 캔버스에서 제거. expand 의 정확한 역연산.
   * 자기 노드는 남고 이웃 전부 제거 — 자기 노드 자체를 빼려면 removeFromCanvas 사용.
   */
  function collapseNodeOnCanvas(nodeId: string): void {
    if (!canvasNodeIds.value.has(nodeId)) return
    const ids = canvasNodeIds.value
    const next = new Set(ids)
    for (const link of visibleLinks()) {
      if (link.source === nodeId && ids.has(link.target)) next.delete(link.target)
      else if (link.target === nodeId && ids.has(link.source)) next.delete(link.source)
    }
    canvasNodeIds.value = next
  }

  function clearCanvas(): void {
    canvasNodeIds.value = new Set()
    presetMode.value = null
    collapseAll()
  }

  /**
   * 우클릭한 노드의 라벨과 같은 노드만 캔버스에 남긴다.
   * (= 다른 라벨의 노드는 모두 제거 → 결과적으로 같은 라벨 사이의 관계만 표시됨)
   *
   * 프리셋 모드(가상 그래프)에서 호출돼도 동작 — 가상 그래프에 보이던 노드를
   * 일반 canvasNodeIds 로 옮긴 뒤 라벨 필터링한다.
   *
   * 라벨이 여럿이면 그중 하나라도 겹치면 유지. 라벨 비교는 대소문자 무관.
   */
  function isolateLabel(nodeId: string): void {
    const node = projectStore.nodeMap.get(nodeId)
    if (!node) return
    const myLabels = new Set((node.labels || []).map(l => l.toUpperCase()))
    if (myLabels.size === 0) return

    // 현재 보이는 노드 집합. 프리셋 모드면 합성된 그래프의 노드, 일반 모드면 canvasNodeIds.
    const visibleIds: Iterable<string> = presetMode.value
      ? canvasGraphData.value.nodes.map(n => n.id)
      : canvasNodeIds.value

    presetMode.value = null
    const next = new Set<string>()
    for (const id of visibleIds) {
      const n = projectStore.nodeMap.get(id)
      if (!n) continue
      const nLabels = (n.labels || []).map(l => l.toUpperCase())
      if (nLabels.some(l => myLabels.has(l))) next.add(id)
    }
    canvasNodeIds.value = next
  }

  /**
   * 캔버스 노드 집합을 통째로 지정 ID 배열로 교체. 프리셋은 해제(일반 모드).
   * 보기 모드(영역/건강)가 빈 캔버스를 해당 속성 노드로 채울 때 사용.
   * 노드 간 관계는 canvasGraphData computed 가 linkMap 에서 자동 포함.
   */
  function setCanvasNodes(nodeIds: string[]): void {
    presetMode.value = null
    canvasNodeIds.value = new Set(nodeIds.filter(isCanvasEligible))
  }

  /** 프리셋 활성화 — 일반 노드 집합은 비우고 가상 합성 결과만 노출. */
  function setPreset(mode: CanvasPreset): void {
    presetMode.value = mode
    if (mode !== null) {
      canvasNodeIds.value = new Set()
    }
    collapseAll()   // 보기 전환 시 이전 펼침 잔상 0 (spec 059)
  }

  /** 모든 펼침 해제. 보기 전환·캔버스 비우기에서 공통으로 쓴다. */
  function collapseAll(): void {
    expandedModuleIds.value = new Set()
  }

  /**
   * 층 한 단계 펼치기(spec 059 FR-009~012) — 지목한 대상 하나만 연다.
   * 영역이면 그 영역의 모듈을, 모듈이면 그 모듈의 루틴을, 루틴이면 그 루틴이 닿는 대상을 드러낸다.
   * 새 루틴을 열면 이전 루틴은 자동으로 접힌다(단수 상태).
   * 이미 열린 대상을 다시 누르면 접는다.
   */
  function expandLayer(nodeId: string): void {
    const node = projectStore.nodeMap.get(nodeId)
    if (!node) return
    const labels = (node.labels || []).map(l => l.toUpperCase())
    // 모듈만 펼침 대상이다. 영역은 노드가 아니라 테두리(헐)이고, 루틴 아래(구문)는 캔버스에
    // 올리지 않는다 — 한 번에 다 펼치면 지금 고치려는 헤어볼로 되돌아간다.
    if (!labels.some(l => CONTAINER_LABELS.has(l))) return
    const next = new Set(expandedModuleIds.value)
    next.has(nodeId) ? next.delete(nodeId) : next.add(nodeId)
    expandedModuleIds.value = next
  }

  /**
   * 전체 nodeMap 에서 지정 라벨을 가진 모든 노드를 캔버스에 일괄 로드.
   * 라벨 비교는 대소문자 무관 (그래프 라벨이 SCREAMING_SNAKE 와 PascalCase 혼재해도 매치).
   * 그들 사이의 관계는 canvasGraphData computed 가 linkMap 에서 자동 포함.
   */
  function loadNodesByLabels(labels: string[]): void {
    if (labels.length === 0) {
      canvasNodeIds.value = new Set()
      return
    }
    const targets = new Set(labels.map(l => l.toUpperCase()))
    const next = new Set<string>()
    for (const node of projectStore.nodeMap.values()) {
      if (isSystemNode(node)) continue
      const nodeLabels = node.labels || []
      if (nodeLabels.some(l => targets.has(l.toUpperCase()))) {
        next.add(node.id)
      }
    }
    canvasNodeIds.value = next
  }

  /**
   * 노드패널 칩 클릭 = 캔버스에 누적 로드(isolate). 표시필터(NvlGraph labelFilters/relFilter)가 아니라
   * "누른 것을 캔버스에 직접 띄우는" 것. 노드 라벨 → 그 라벨 노드들 / 관계 타입 → 그 관계 + 양끝 노드.
   * 여러 개 누르면 누적(union). 보기모드(preset)는 해제한다(섞임·경고 방지).
   */
  function rebuildPanelLoad(): void {
    canvasNodeIds.value = new Set(panelProjection.value?.nodeIds ?? [])
  }
  /**
   * 층 칩(영역/모듈/루틴) 토글 — spec 059.
   *
   * 층은 언어마다 이름이 다른 종류 라벨(FILE/CLASS/PACKAGE_BODY…)을 하나로 묶어 부르는 이름이다.
   * 판정 집합은 nodeClassify 단일 정의처가 소유하고, 여기서는 그 집합을 **실제 라벨들로 펼쳐**
   * 기존 라벨 로드 기계에 그대로 넘긴다 — 새 투영 경로를 만들지 않는다(DRY).
   */
  const LAYER_LABELS: Record<string, ReadonlySet<string>> = {
    영역: new Set(['PACKAGE']),
    모듈: CONTAINER_LABELS,
    루틴: CALLABLE_LABELS,
  }

  /** 화면에 실제로 존재하는 층만 셈한다. 없는 층은 칩을 만들지 않는다. */
  function layerCounts(): Map<string, number> {
    const counts = new Map<string, number>()
    for (const node of projectStore.nodeMap.values()) {
      if (isSystemNode(node)) continue
      const labels = (node.labels || []).map(l => l.toUpperCase())
      for (const [layer, members] of Object.entries(LAYER_LABELS)) {
        if (labels.some(l => members.has(l))) counts.set(layer, (counts.get(layer) ?? 0) + 1)
      }
    }
    return counts
  }

  /** 그 층이 지금 로드돼 있는가 — 구성 라벨이 하나라도 켜져 있으면 활성으로 본다. */
  function isLayerLoaded(layer: string): boolean {
    const members = LAYER_LABELS[layer]
    if (!members) return false
    for (const label of loadedLabels.value) {
      if (members.has(label.toUpperCase())) return true
    }
    return false
  }

  function toggleLayerLoad(layer: string): void {
    const members = LAYER_LABELS[layer]
    if (!members) return
    presetMode.value = null
    const next = new Set(loadedLabels.value)
    const turnOff = isLayerLoaded(layer)
    for (const node of projectStore.nodeMap.values()) {
      for (const label of node.labels || []) {
        if (!members.has(label.toUpperCase())) continue
        turnOff ? next.delete(label) : next.add(label)
      }
    }
    loadedLabels.value = next
    rebuildPanelLoad()
  }

  function toggleLabelLoad(label: string): void {
    presetMode.value = null
    const s = new Set(loadedLabels.value)
    s.has(label) ? s.delete(label) : s.add(label)
    loadedLabels.value = s
    rebuildPanelLoad()
  }
  function toggleRelLoad(relType: string): void {
    presetMode.value = null
    const s = new Set(loadedRelTypes.value)
    s.has(relType) ? s.delete(relType) : s.add(relType)
    loadedRelTypes.value = s
    rebuildPanelLoad()
  }
  function clearPanelLoad(): void {
    loadedLabels.value = new Set()
    loadedRelTypes.value = new Set()
  }

  return {
    canvasNodeIds,
    canvasGraphData,
    presetMode,
    loadedLabels,
    loadedRelTypes,
    toggleLabelLoad,
    toggleRelLoad,
    toggleLayerLoad,
    isLayerLoaded,
    layerCounts,
    clearPanelLoad,
    addNodeToCanvas,
    expandNodeOnCanvas,
    collapseNodeOnCanvas,
    removeFromCanvas,
    clearCanvas,
    loadNodesByLabels,
    setCanvasNodes,
    setPreset,
    isolateLabel,
    hierarchyMap,
    tableAreaKey,
    expandedModuleIds,
    expandLayer,
    collapseAll,
  }
})
