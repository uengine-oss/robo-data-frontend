import type { GraphLink, GraphNode } from '@/shared/types'
import { logicalNodeName, technicalNodeName } from '@/shared/utils/graphDisplay'

export interface NodeDetailPropertyItem {
  key: string
  value: string
  isMultiLine: boolean
}

const relationshipPropertyLabels: Record<string, string> = {
  count: '묶인 관계 수',
  via_tables: '원인 테이블',
  via_routines: '원인 루틴',
  crosses_area: '영역을 넘음',
  virtual: '합쳐진 선',
  via_count: '경유 개수',
  via_sample: '경유 예시',
}

function formatRelationshipValue(value: unknown): string {
  if (Array.isArray(value)) return value.length ? value.join(', ') : '(없음)'
  if (typeof value === 'boolean') return value ? '예' : '아니오'
  if (typeof value === 'object' && value !== null) return JSON.stringify(value, null, 2)
  return String(value)
}

export function projectRelationshipProperties(
  node: GraphNode | null,
  relationship: GraphLink | null,
): NodeDetailPropertyItem[] {
  if (node || !relationship) return []
  const items: NodeDetailPropertyItem[] = [{
    key: '<id>',
    value: relationship.id,
    isMultiLine: false,
  }]
  for (const [key, value] of Object.entries(relationship.properties || {})) {
    items.push({
      key: relationshipPropertyLabels[key] ?? key,
      value: formatRelationshipValue(value),
      isMultiLine: typeof value === 'object' && !Array.isArray(value),
    })
  }
  return items
}

export function projectRelationshipEndpoints(
  relationship: GraphLink | null,
  nodes: readonly GraphNode[],
) {
  if (!relationship) return null
  return {
    from: nodes.find(node => node.id === relationship.source),
    to: nodes.find(node => node.id === relationship.target),
    fromId: relationship.source,
    toId: relationship.target,
  }
}

export function nodeEndpointLabel(node: GraphNode | undefined, fallbackId: string): string {
  if (!node) return fallbackId.includes(':') ? fallbackId.split(':').pop() || fallbackId : fallbackId
  const technicalName = technicalNodeName(node)
  const logicalName = logicalNodeName(node)
  return logicalName && logicalName !== technicalName
    ? `${technicalName} — ${logicalName}`
    : technicalName
}

export function filterNodesByIdentity(nodes: readonly GraphNode[], searchQuery: string): GraphNode[] {
  const query = searchQuery.trim().toLowerCase()
  if (!query) return []
  return nodes.filter(node => {
    const name = String(node.properties?.name || '').toLowerCase()
    return name.includes(query) || String(node.id || '').toLowerCase().includes(query)
  })
}

export function nodeSearchContext(node: GraphNode): string {
  const properties = node.properties || {}
  const id = String(node.id || '')
  const lastDot = id.lastIndexOf('.')
  if (lastDot > 0) return id.slice(0, lastDot)

  const parts: string[] = []
  if (properties.schema_name) parts.push(String(properties.schema_name))
  if (properties.file_path) {
    parts.push(String(properties.file_path).split(/[\\/]/).pop() || '')
  }
  return parts.filter(Boolean).join(' • ')
}

export function nodeSearchPrimary(node: GraphNode): string {
  const properties = node.properties || {}
  return String(properties.logical_name || properties.name || node.id || 'Unknown')
}

export function nodeSearchSecondary(node: GraphNode): string {
  const properties = node.properties || {}
  const parts: string[] = []
  if (
    properties.logical_name
    && properties.name
    && properties.logical_name !== properties.name
  ) {
    parts.push(String(properties.name))
  }
  const context = nodeSearchContext(node)
  if (context) parts.push(context)
  return parts.join(' · ')
}
