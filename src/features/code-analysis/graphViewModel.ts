import type { GraphNode } from '@/shared/types'
import type { HierarchyInfo } from './graphCanvas'
import type { HullLevel } from './components/graph/useGroupHulls'

export type GraphViewMode = 'default' | 'module' | 'area'

type HierarchyMap = ReadonlyMap<string, HierarchyInfo>

function componentKey(node: GraphNode): string | null {
  const value = node.properties?.component_id
  return value === undefined || value === null || value === '' ? null : String(value)
}

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
  if (mode === 'area') {
    return [{
      keyOf: componentKey,
      labelOf: () => '',
      padding: 30,
    }]
  }
  if (mode === 'module') {
    return [{
      keyOf: node => moduleKey(node, hierarchyMap, tableAreaKey),
      labelOf: () => '',
      padding: 22,
    }]
  }
  return []
}

export function createGraphClusterKey(
  mode: GraphViewMode,
  hierarchyMap: HierarchyMap,
  tableAreaKey: (nodeId: string) => string | null,
): ((node: GraphNode) => string | null) | null {
  if (mode === 'module') {
    return node => moduleKey(node, hierarchyMap, tableAreaKey)
  }
  if (mode === 'area') {
    return node => componentKey(node) ?? '__ungrouped__'
  }
  return null
}

export function createGraphClusterLabel(
  mode: GraphViewMode,
  nodeMap: ReadonlyMap<string, GraphNode>,
): ((key: string) => string) | null {
  if (mode === 'module') {
    return key => key === '__external__'
      ? 'external (외부 호출)'
      : String(nodeMap.get(key)?.properties?.name || '모듈')
  }
  if (mode === 'area') {
    return key => {
      if (key === '__ungrouped__') return '기타'
      for (const node of nodeMap.values()) {
        if (String(node.properties?.component_id ?? '') === key) {
          return String(node.properties?.component_name || `군집 ${key}`)
        }
      }
      return `군집 ${key}`
    }
  }
  return null
}
