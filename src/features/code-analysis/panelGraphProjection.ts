import type { GraphLink, GraphNode } from '@/shared/types'

export interface PanelGraphProjection {
  nodeIds: Set<string>
  linkIds: Set<string>
}

/**
 * 노드패널 칩의 캔버스 투영을 한 곳에서 계산한다.
 *
 * - 관계 칩: 선택한 타입의 관계와 양끝 노드만 포함한다.
 * - 라벨 칩: 선택 라벨 노드와 그 노드끼리의 관계를 포함한다.
 * - 둘을 함께 선택하면 노드는 합집합이지만, 끝점만 같다는 이유로 미선택 관계를 포함하지 않는다.
 *
 * 호출자는 시스템 노드와 기본 숨김 관계를 먼저 제외한 목록을 전달한다.
 */
export function buildPanelGraphProjection(
  nodes: Iterable<GraphNode>,
  links: Iterable<GraphLink>,
  loadedLabels: ReadonlySet<string>,
  loadedRelTypes: ReadonlySet<string>,
): PanelGraphProjection {
  const eligibleNodeIds = new Set<string>()
  const labelNodeIds = new Set<string>()

  for (const node of nodes) {
    eligibleNodeIds.add(node.id)
    if ((node.labels || []).some(label => loadedLabels.has(label))) {
      labelNodeIds.add(node.id)
    }
  }

  const nodeIds = new Set(labelNodeIds)
  const linkIds = new Set<string>()
  for (const link of links) {
    if (!eligibleNodeIds.has(link.source) || !eligibleNodeIds.has(link.target)) continue

    if (loadedRelTypes.has(link.type)) {
      nodeIds.add(link.source)
      nodeIds.add(link.target)
      linkIds.add(link.id)
      continue
    }

    if (labelNodeIds.has(link.source) && labelNodeIds.has(link.target)) {
      linkIds.add(link.id)
    }
  }

  return { nodeIds, linkIds }
}
