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
import type { GraphData, GraphLink, GraphNode } from '@/shared/types'

/**
 * 캔버스 프리셋 — 일반 그래프와 다른 표시 규칙을 적용하는 모드.
 *   - 'module-interaction' : MODULE/TABLE 만 노출하고 둘 사이에 가상 링크(VIRTUAL_USES) 합성.
 *     실제 데이터는 MODULE -[HAS_MEMBER]-> FUNCTION -[READS/WRITES/...]-> TABLE 이지만
 *     화면에서만 FUNCTION 을 압축해 MODULE → TABLE 한 줄로 보여준다.
 */
export type CanvasPreset = 'module-interaction' | null

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
  function buildModuleInteractionGraph(): GraphData {
    const funcToModule = new Map<string, string>()
    // 구문 노드 → 부모 노드(그릇 또는 상위 구문) id. PARENT_OF 는 parent→child 라
    // child(=link.target) 로 부모(=link.source) 를 찾는다. 한 번 훑어 인덱스.
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
      // 그릇(타입집합)→호출가능(타입집합) 정합 — 역할 라벨 폐기(spec 019).
      if (!isContainerNode(moduleNode.labels || [])) continue
      if (!(funcNode.labels || []).some(l => CALLABLE_LABELS.has(l))) continue
      funcToModule.set(funcNode.id, moduleNode.id)
    }

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

  /** NvlGraph 에 전달할 부분집합. 프리셋이 활성화되면 가상 그래프를 반환. */
  const canvasGraphData = computed<GraphData>(() => {
    if (presetMode.value === 'module-interaction') {
      return buildModuleInteractionGraph()
    }

    const ids = canvasNodeIds.value
    if (ids.size === 0) return { nodes: [], links: [] }
    const nodes: GraphNode[] = []
    for (const node of projectStore.nodeMap.values()) {
      if (ids.has(node.id)) nodes.push(node)
    }
    const links: GraphLink[] = []
    for (const link of projectStore.linkMap.values()) {
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
    for (const link of projectStore.linkMap.values()) {
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
    for (const link of projectStore.linkMap.values()) {
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
   * 테이블 흐름 보기(spec 020 US5) — R/W에 참여하는 노드만(테이블 + 그걸 읽고/쓰는 DML 구문).
   * READS/WRITES 엣지의 양 끝(구문 source + 테이블 target)만 캔버스에 올린다 → 엣지가 자연히 그려짐.
   * 전체 SELECT 수백 개가 아니라 실제 테이블 접근만 → 데이터 흐름에 집중.
   */
  function loadTableFlow(): void {
    presetMode.value = null
    const ids = new Set<string>()
    for (const link of projectStore.linkMap.values()) {
      if (link.type === 'READS' || link.type === 'WRITES') {
        ids.add(link.source)
        ids.add(link.target)
      }
    }
    canvasNodeIds.value = ids
  }

  return {
    canvasNodeIds,
    canvasGraphData,
    presetMode,
    addNodeToCanvas,
    expandNodeOnCanvas,
    collapseNodeOnCanvas,
    removeFromCanvas,
    clearCanvas,
    loadNodesByLabels,
    loadTableFlow,
    setCanvasNodes,
    setPreset,
    isolateLabel,
  }
})
