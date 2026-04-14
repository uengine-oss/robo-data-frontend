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
 *   - removeFromCanvas(id)     : 컨텍스트 메뉴 제거
 *   - clearCanvas()            : 전체 비우기
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useProjectStore } from '@/stores/project'
import type { GraphData, GraphLink, GraphNode } from '@/types'

export const useCanvasStore = defineStore('canvas', () => {
  const projectStore = useProjectStore()

  /** 캔버스에 표시되는 노드 ID 집합. 여기 있는 것만 NvlGraph 에 넘어간다. */
  const canvasNodeIds = ref<Set<string>>(new Set())

  /** NvlGraph 에 전달할 부분집합 (nodeMap/linkMap 기반 필터). */
  const canvasGraphData = computed<GraphData>(() => {
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

  function clearCanvas(): void {
    canvasNodeIds.value = new Set()
  }

  return {
    canvasNodeIds,
    canvasGraphData,
    addNodeToCanvas,
    expandNodeOnCanvas,
    removeFromCanvas,
    clearCanvas,
  }
})
