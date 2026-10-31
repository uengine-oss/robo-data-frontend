import type {
  GraphLink,
  GraphNode,
  Neo4jNode,
  Neo4jRelationship,
} from '@/shared/types'
import { isHiddenMarker, kindOf } from '@/shared/utils/nodeLabels'

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

/**
 * 저장된 그래프(카탈로그 /graph/)의 노드 → GraphNode.
 * - id: 분석 중 스트림이 쓰는 논리 id(`id` 속성)와 같게 — 다시 띄운 앱에서도 같은 노드가 같은 id 다.
 *   없으면 엔진 내부 id.
 * - labels: 저장 표지(ANALYZER_OWNED · EMBEDDED)를 뺀다. Ontological DB 는 상속 사슬 순서로 돌려줘
 *   표지가 labels[0] 에 오고, labels[0] 을 종류로 읽는 곳(색 · 상세 머리 · 이름)이 모두 표지로 칠했다.
 */
export function convertNeo4jNode(node: Neo4jNode): GraphNode {
  const labels = (node['Labels'] || []).filter(label => !isHiddenMarker(label))
  const properties = node['Properties'] || {}
  const logicalId = properties._id ?? properties.id
  return {
    id: (typeof logicalId === 'string' && logicalId) || node['Node ID'],
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
