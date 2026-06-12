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
import type { GraphData, GraphLink, GraphNode } from '@/shared/types'

/**
 * 캔버스 프리셋 — 일반 그래프와 다른 표시 규칙을 적용하는 모드.
 *   - 'module-interaction' : MODULE/TABLE 만 노출하고 둘 사이에 가상 링크(VIRTUAL_USES) 합성.
 *     실제 데이터는 MODULE -[HAS_FUNCTION]-> FUNCTION -[READS/WRITES/...]-> TABLE 이지만
 *     화면에서만 FUNCTION 을 압축해 MODULE → TABLE 한 줄로 보여준다.
 */
export type CanvasPreset = 'module-interaction' | null

const MODULE_TO_FUNCTION_REL = new Set(['HAS_FUNCTION'])
const FUNCTION_TO_TABLE_REL = new Set(['FROM', 'READS', 'REFER_TO', 'REFERS_TO', 'WRITES'])

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
   * 알고리즘 (O(N)):
   *   1) linkMap 을 한 번 훑어 HAS_FUNCTION 으로 funcId → moduleId 인덱스
   *   2) linkMap 을 한 번 더 훑어 FUNCTION -[READS/WRITES/...]-> TABLE 만나면
   *      위 인덱스로 module 을 찾아 가상 링크 후보로 수집
   *   3) (moduleId, tableId, type, op) 단위로 dedup —
   *      원본 관계 타입(READS/WRITES/FROM/...) 과 op 등 속성을 그대로 보존.
   *      → 색상/캡션이 일반 그래프와 동일하게 자동 적용됨.
   */
  function buildModuleInteractionGraph(): GraphData {
    const funcToModule = new Map<string, string>()
    for (const link of projectStore.linkMap.values()) {
      if (!MODULE_TO_FUNCTION_REL.has(link.type)) continue
      const moduleNode = projectStore.nodeMap.get(link.source)
      const funcNode = projectStore.nodeMap.get(link.target)
      if (!moduleNode || !funcNode) continue
      if (!hasLabel(moduleNode, 'MODULE')) continue
      if (!hasLabel(funcNode, 'FUNCTION')) continue
      funcToModule.set(funcNode.id, moduleNode.id)
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
      const moduleId = funcToModule.get(link.source)
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

    const nodes: GraphNode[] = []
    for (const id of moduleIds) {
      const n = projectStore.nodeMap.get(id)
      if (n) nodes.push(n)
    }
    for (const id of tableIds) {
      const n = projectStore.nodeMap.get(id)
      if (n) nodes.push(n)
    }

    const links: GraphLink[] = []
    for (const info of virtuals.values()) {
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
    setPreset,
    isolateLabel,
  }
})
