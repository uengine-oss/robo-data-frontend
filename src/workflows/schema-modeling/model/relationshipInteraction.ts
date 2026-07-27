export interface RelationshipNodeIdentity {
  id: string
  data?: { tableName?: string; schema?: string; datasource?: string }
}

export interface RelationshipEdgeIdentity {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
  label?: unknown
  data?: { relationshipSource?: unknown }
}

export interface EditingRelationship {
  id: string
  sourceType: string
  targetType: string
  sourceColumn: string
  targetColumn: string
  fromSchema: string
  toSchema: string
  source: 'user' | 'ddl' | 'code' | 'procedure' | 'unknown'
}

export interface PendingRelationshipConnection {
  fromTable: string
  fromSchema: string
  fromColumn: string
  toTable: string
  toSchema: string
  toColumn: string
}

export function extractColumnNameFromHandle(handleId: string): string {
  return handleId
    .replace(/^(?:fk-|pk-|col-)/, '')
    .replace(/-(?:source|target)-(?:left|right)$/, '')
    .replace(/-(?:source|target|left|right|out|in)$/, '')
}

function identityForNode(nodes: RelationshipNodeIdentity[], nodeId: string) {
  const node = nodes.find(candidate => candidate.id === nodeId)
  if (!node?.data?.tableName) return null
  return {
    tableName: node.data.tableName,
    schema: node.data.schema || 'public',
  }
}

export function parseEditingRelationship(
  edge: RelationshipEdgeIdentity,
  nodes: RelationshipNodeIdentity[],
): EditingRelationship | null {
  let sourceColumn = edge.sourceHandle ? extractColumnNameFromHandle(edge.sourceHandle) : ''
  let targetColumn = edge.targetHandle ? extractColumnNameFromHandle(edge.targetHandle) : ''

  if ((!sourceColumn || !targetColumn) && typeof edge.label === 'string') {
    const labelMatch = edge.label.match(/^(.+?)\s*→\s*(.+)$/)
    if (labelMatch) {
      sourceColumn ||= labelMatch[1].trim()
      targetColumn ||= labelMatch[2].trim()
    }
  }
  if (!sourceColumn || !targetColumn) return null
  const sourceNode = identityForNode(nodes, edge.source)
  const targetNode = identityForNode(nodes, edge.target)
  if (!sourceNode || !targetNode) return null

  const rawSource = edge.data?.relationshipSource
  const source = rawSource === 'user'
    || rawSource === 'ddl'
    || rawSource === 'code'
    || rawSource === 'procedure'
    ? rawSource
    : 'unknown'

  return {
    id: edge.id,
    sourceType: sourceNode.tableName,
    targetType: targetNode.tableName,
    sourceColumn,
    targetColumn,
    fromSchema: sourceNode.schema,
    toSchema: targetNode.schema,
    source,
  }
}

export function parsePendingRelationshipConnection(
  connection: {
    source?: string | null
    target?: string | null
    sourceHandle?: string | null
    targetHandle?: string | null
  },
  nodes: RelationshipNodeIdentity[],
): PendingRelationshipConnection | null {
  if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) {
    return null
  }
  const sourceNode = identityForNode(nodes, connection.source)
  const targetNode = identityForNode(nodes, connection.target)
  if (!sourceNode || !targetNode) return null

  return {
    fromTable: sourceNode.tableName,
    fromSchema: sourceNode.schema,
    fromColumn: extractColumnNameFromHandle(connection.sourceHandle),
    toTable: targetNode.tableName,
    toSchema: targetNode.schema,
    toColumn: extractColumnNameFromHandle(connection.targetHandle),
  }
}

export function parseEmptyDropSource(
  nodeId: string,
  handleId: string,
  nodes: RelationshipNodeIdentity[],
) {
  const sourceColumn = extractColumnNameFromHandle(handleId)
  const sourceNode = identityForNode(nodes, nodeId)
  if (!sourceColumn || !sourceNode) return null
  return {
    sourceType: sourceNode.tableName,
    sourceColumn,
  }
}
