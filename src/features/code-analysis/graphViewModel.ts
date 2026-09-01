import type { GraphNode } from '@/shared/types'
import type { HierarchyInfo } from './graphCanvas'
import type { HullLevel } from './components/graph/useGroupHulls'

export type GraphViewMode = 'default' | 'module'

type HierarchyMap = ReadonlyMap<string, HierarchyInfo>

function moduleKey(
  node: GraphNode,
  hierarchyMap: HierarchyMap,
  tableAreaKey: (nodeId: string) => string | null,
): string | null {
  return (node.labels || []).includes('TABLE')
    ? tableAreaKey(node.id)
    : hierarchyMap.get(node.id)?.packageKey ?? null
}

export function createGraphHullLevels(
  mode: GraphViewMode,
  hierarchyMap: HierarchyMap,
  tableAreaKey: (nodeId: string) => string | null,
): HullLevel[] {
  if (mode !== 'module') return []
  return [{
    keyOf: node => moduleKey(node, hierarchyMap, tableAreaKey),
    labelOf: () => '',
    padding: 22,
  }]
}

export function createGraphClusterKey(
  mode: GraphViewMode,
  hierarchyMap: HierarchyMap,
  tableAreaKey: (nodeId: string) => string | null,
): ((node: GraphNode) => string | null) | null {
  return mode === 'module'
    ? node => moduleKey(node, hierarchyMap, tableAreaKey)
    : null
}

export function createGraphClusterLabel(
  mode: GraphViewMode,
  nodeMap: ReadonlyMap<string, GraphNode>,
): ((key: string) => string) | null {
  if (mode !== 'module') return null
  return key => key === '__external__'
    ? 'external'
    : String(nodeMap.get(key)?.properties?.name || 'package')
}
