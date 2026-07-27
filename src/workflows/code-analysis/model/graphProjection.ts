import type {
  GraphLink,
  GraphNode,
  Neo4jNode,
  Neo4jRelationship,
} from '@/shared/types'
import { kindOf } from '@/shared/utils/nodeLabels'

export interface GraphEvent {
  id: string
  type: 'node' | 'relationship'
  action: 'created' | 'updated' | 'deleted'
  nodeType?: string
  nodeName?: string
  relType?: string
  source?: string
  target?: string
  timestamp: string
}

export const MAX_GRAPH_EVENTS = 500

export function createTimestamp(): string {
  return new Date().toISOString()
}

export function extractSubLabel(labels: readonly string[]): string {
  return kindOf(labels)
}

export function convertNeo4jNode(node: Neo4jNode): GraphNode {
  const labels = node['Labels'] || []
  const properties = node['Properties'] || {}
  return {
    id: (properties.id as string) || node['Node ID'],
    labels,
    properties,
  }
}

export function convertNeo4jRelationship(
  relationship: Neo4jRelationship,
  elementIdToLogicalId: Map<string, string>,
): GraphLink {
  const source =
    elementIdToLogicalId.get(relationship['Start Node ID']) ??
    relationship['Start Node ID']
  const target =
    elementIdToLogicalId.get(relationship['End Node ID']) ??
    relationship['End Node ID']

  return {
    id: `${relationship['Type']}|${source}|${target}||`,
    source,
    target,
    type: relationship['Type'],
    properties: relationship['Properties'],
  }
}

export function resolveNodeName(
  properties: Record<string, unknown>,
  labels: string[],
  nodeId: string,
): string {
  const name = properties.name
  if (name) return String(name)
  const key = properties.key
  if (key) return String(key)
  const title = properties.title
  if (title) return String(title)
  const kind = extractSubLabel(labels) || (properties.type as string) || ''
  const line = properties.start_line
  if (kind) return line != null && line !== 0 ? `${kind} [${line}]` : kind
  const id = properties.id
  if (id) return String(id).split('.').pop() || String(id)
  return nodeId
}
