export type LineageNodeType = 'SOURCE' | 'TARGET' | 'ETL'

export interface LineageNode {
  id: string
  name: string
  type: LineageNodeType
  properties: Record<string, unknown>
}

export interface LineageEdge {
  id: string
  source: string
  target: string
  type: string
  properties: Record<string, unknown>
}

export interface LineageStats {
  etlCount: number
  sourceCount: number
  targetCount: number
  flowCount: number
}

export interface LineageGraphData {
  nodes: LineageNode[]
  edges: LineageEdge[]
  stats: LineageStats
}

export function emptyLineageGraph(): LineageGraphData {
  return {
    nodes: [],
    edges: [],
    stats: {
      etlCount: 0,
      sourceCount: 0,
      targetCount: 0,
      flowCount: 0,
    },
  }
}

export function resolveLineageCubeName(node: LineageNode): string | null {
  if (node.type !== 'ETL') return null
  const propertyCubeName = node.properties.cube_name
  return typeof propertyCubeName === 'string' && propertyCubeName.trim()
    ? propertyCubeName
    : null
}
