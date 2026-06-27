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
import { useAnalyzerStore } from '@/features/code-analysis/analyzer'
import { isContainerNode, CALLABLE_LABELS } from '@/shared/utils/nodeClassify'
import { isLinkHidden } from '@/shared/utils/graphVisibility'
import type { GraphData, GraphLink, GraphNode } from '@/shared/types'

/**
 * 캔버스 프리셋 — 일반 그래프와 다른 표시 규칙을 적용하는 모드.
 *   - 'module-interaction' : MODULE/TABLE 만 노출, 둘 사이 가상 링크 합성(루틴 R/W를 모듈로 압축).
 * (spec 021: 건강 보기는 테이블 제거 → 프리셋 폐기, risk_level 루틴만 속성로드로 표시.)
 */
export type CanvasPreset = 'module-interaction' | 'health-rw' | null

/** 노드별 계층 조상(파일/패키지) — 중첩 헐(spec 021) 그룹핑용. */
export interface HierarchyInfo {
  fileKey: string | null
  fileLabel: string
  packageKey: string | null
  packageLabel: string
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

  /** 활성 프리셋. null 이면 일반 모드. */
  const presetMode = ref<CanvasPreset>(null)

  // 노드패널 칩 = 캔버스에 "누적 로드"(spec 025, 표시필터 아님). 누른 노드 라벨·관계 타입을 다중으로 캔버스에 띄운다.
  const loadedLabels = ref<Set<string>>(new Set())
  const loadedRelTypes = ref<Set<string>>(new Set())

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

  /**
   * 구문 노드 → 소유 **루틴** id 해소기(건강 보기용). PARENT_OF 를 거슬러 올라가 funcToModule
   * 키(=루틴)를 처음 만나면 그 루틴을 반환. 못 찾으면 null. memoize.
   * (모듈간의 resolveModule 은 루틴의 *그릇*을 반환 — 여기선 루틴 자체가 필요해 별도.)
   */
  function makeRoutineResolver(funcToModule: Map<string, string>, childToParent: Map<string, string>) {
    const cache = new Map<string, string | null>()
    return function resolveRoutine(nodeId: string): string | null {
      const path: string[] = []
      const seen = new Set<string>()
      let cur: string | undefined = nodeId
      let result: string | null = null
      while (cur !== undefined && !seen.has(cur)) {
        const memo = cache.get(cur)
        if (memo !== undefined) { result = memo; break }
        if (funcToModule.has(cur)) { result = cur; break }   // cur 자체가 루틴
        seen.add(cur); path.push(cur); cur = childToParent.get(cur)
      }
      for (const id of path) cache.set(id, result)
      return result
    }
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
      const key = `${fromMod} ${toMod}`
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

    return { nodes, links }
  }

  /**
   * 건강 보기 가상 그래프(spec 022) — **위험(risk_level) 루틴 + 그들이 닿는 모든 관계**를 보여준다.
   * 위험한 코드가 어떤 테이블을 R/W 하고 어떤 루틴을 호출하는지(호출 사용처) 한눈에.
   *   위험 루틴 -[READS/WRITES]-> TABLE  (구문→루틴 해소 후 루틴 단위로 집계)
   *   위험 루틴 -[CALLS]-> 루틴         (한쪽이라도 위험이면 포함)
   * 관계가 없는 고립 위험 루틴도 포함(빠짐없이). 색은 colorMode='health'(위험도)로 칠해진다.
   */
  function buildHealthGraph(): GraphData {
    const { funcToModule, childToParent } = buildModuleIndexes()
    const resolveRoutine = makeRoutineResolver(funcToModule, childToParent)
    const isRisk = (id: string): boolean => {
      const r = projectStore.nodeMap.get(id)?.properties?.risk_level
      return r === 'low' || r === 'medium' || r === 'high'
    }

    const ids = new Set<string>()
    const links: GraphLink[] = []

    // 위험 루틴의 R/W (구문 발 → 소유 루틴으로 끌어올림, 루틴×테이블×타입 dedup)
    const seenRW = new Set<string>()
    for (const link of projectStore.linkMap.values()) {
      if (!FUNCTION_TO_TABLE_REL.has(link.type)) continue
      const routine = resolveRoutine(link.source)
      if (!routine || !isRisk(routine)) continue
      const table = projectStore.nodeMap.get(link.target)
      if (!table || !hasLabel(table, 'TABLE')) continue
      const key = `${link.type} ${routine} ${table.id}`
      if (seenRW.has(key)) continue
      seenRW.add(key)
      ids.add(routine); ids.add(table.id)
      links.push({
        id: `vh:${link.type}:${routine}->${table.id}`,
        source: routine, target: table.id, type: link.type,
        properties: { ...(link.properties || {}), virtual: true },
      })
    }

    // 위험 루틴의 CALL (양끝 루틴 해소, 한쪽이라도 위험이면 포함)
    const seenCall = new Set<string>()
    for (const link of projectStore.linkMap.values()) {
      if (link.type !== 'CALLS') continue
      const from = resolveRoutine(link.source), to = resolveRoutine(link.target)
      if (!from || !to || from === to) continue
      if (!isRisk(from) && !isRisk(to)) continue
      const key = `${from} ${to}`
      if (seenCall.has(key)) continue
      seenCall.add(key)
      ids.add(from); ids.add(to)
      links.push({ id: `vh:CALLS:${from}->${to}`, source: from, target: to, type: 'CALLS', properties: { virtual: true } })
    }

    // 고립 위험 루틴도 포함(관계 없어도 빠짐없이)
    for (const node of projectStore.nodeMap.values()) {
      if (isRisk(node.id)) ids.add(node.id)
    }

    const nodes: GraphNode[] = []
    for (const id of ids) { const n = projectStore.nodeMap.get(id); if (n) nodes.push(n) }
    return { nodes, links: links.filter(l => ids.has(l.source) && ids.has(l.target)) }
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
    const nameOf = (id: string | null): string => {
      if (!id) return ''
      const n = projectStore.nodeMap.get(id)
      return (n?.properties?.name as string) || id
    }
    const baseName = (path: string): string =>
      path.replace(/\\/g, '/').split('/').filter(Boolean).pop() || path

    const map = new Map<string, HierarchyInfo>()
    for (const node of projectStore.nodeMap.values()) {
      const isExternal = (node.labels || []).includes('EXTERNAL')
      const containerId = memberToFile.get(node.id) ?? null
      const filePath = node.properties?.file_path as string | undefined
      const fileKey = containerId ?? (filePath ?? null)
      const fileLabel = containerId ? nameOf(containerId) : (filePath ? baseName(filePath) : '')
      let packageKey: string | null = containerId ? (fileToPackage.get(containerId) ?? null) : null
      if (!packageKey) packageKey = fileToPackage.get(node.id) ?? null
      let packageLabel = nameOf(packageKey)
      if (isExternal) { packageKey = '__external__'; packageLabel = 'external (외부 호출)' }
      map.set(node.id, { fileKey, fileLabel, packageKey, packageLabel, isExternal })
    }
    return map
  })

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

  const canvasGraphData = computed<GraphData>(() => {
    if (presetMode.value === 'module-interaction') {
      return buildModuleInteractionGraph()
    }
    if (presetMode.value === 'health-rw') {
      return buildHealthGraph()
    }

    // "숨김 요소까지 모두 보기"면 캔버스도 neo4j DB 그대로 — 전체 그래프(graphData=날것 전부)를
    // 렌더. 평소엔 사용자가 캔버스에 올린 부분집합(canvasNodeIds)만.
    if (projectStore.showHidden) return projectStore.graphData

    const ids = canvasNodeIds.value
    if (ids.size === 0) return { nodes: [], links: [] }
    const nodes: GraphNode[] = []
    for (const node of projectStore.nodeMap.values()) {
      if (ids.has(node.id)) nodes.push(node)
    }
    const links: GraphLink[] = []
    for (const link of visibleLinks()) {
      if (ids.has(link.source) && ids.has(link.target)) links.push(link)
    }
    return { nodes, links }
  })

  function addNodeToCanvas(nodeId: string): void {
    if (canvasNodeIds.value.has(nodeId)) return
    const next = new Set(canvasNodeIds.value)
    next.add(nodeId)
    canvasNodeIds.value = next
  }

  function expandNodeOnCanvas(nodeId: string): void {
    const next = new Set(canvasNodeIds.value)
    next.add(nodeId)
    for (const link of visibleLinks()) {
      if (link.source === nodeId) next.add(link.target)
      else if (link.target === nodeId) next.add(link.source)
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
    canvasNodeIds.value = new Set(nodeIds)
  }

  /** 프리셋 활성화 — 일반 노드 집합은 비우고 가상 합성 결과만 노출. */
  function setPreset(mode: CanvasPreset): void {
    presetMode.value = mode
    if (mode !== null) {
      canvasNodeIds.value = new Set()
    }
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
    const ids = new Set<string>()
    for (const node of projectStore.nodeMap.values()) {
      if ((node.labels || []).some(l => loadedLabels.value.has(l.toUpperCase()))) ids.add(node.id)
    }
    for (const link of visibleLinks()) {
      if (loadedRelTypes.value.has(link.type)) { ids.add(link.source); ids.add(link.target) }
    }
    canvasNodeIds.value = ids
  }
  function toggleLabelLoad(label: string): void {
    presetMode.value = null
    const up = label.toUpperCase()
    const s = new Set(loadedLabels.value)
    s.has(up) ? s.delete(up) : s.add(up)
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
  }
})
