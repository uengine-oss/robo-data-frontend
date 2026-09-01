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
    id: (properties._id as string) || node['Node ID'],
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

  const properties = relationship['Properties'] || {}
  return {
    id: [
      relationship['Type'],
      source,
      target,
      properties.from_column || '',
      properties.to_column || '',
      properties._owner || '',
    ].join('|'),
    source,
    target,
    type: relationship['Type'],
    properties,
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
  const extractedKind = extractSubLabel(labels)
  const kind = extractedKind === 'Unknown' ? '' : extractedKind
  const line = properties.start_line
  if (kind) return line != null && line !== 0 ? `${kind} [${line}]` : kind
  const id = properties._id
  if (id) return String(id).split('.').pop() || String(id)
  return nodeId
}
