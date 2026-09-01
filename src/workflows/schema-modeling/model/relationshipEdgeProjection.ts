import { MarkerType } from '@vue-flow/core'
import type { Edge } from '@vue-flow/core'

export interface SchemaRelationship {
  from_table: string
  from_schema: string
  from_column: string
  to_table: string
  to_schema: string
  to_column: string
  description?: string
  relationship_type: 'FK'
  name?: string
}

export interface CatalogRelationship {
  from_table: string
  to_table: string
  type: 'FK'
  source?: 'analyzer' | 'catalog'
  column_pairs: Array<{ source: string; target: string; name?: string }>
  name?: string
}

export type CatalogRelationshipInput = Omit<CatalogRelationship, 'column_pairs'> & {
  column_pairs?: CatalogRelationship['column_pairs']
}

export interface RelationshipVisibility {
  ddl: boolean
  code: boolean
  user: boolean
}

export interface RelationshipCanvasNode {
  id: string
  position?: { x: number; y: number }
  data?: { tableName?: string; schema?: string; datasource?: string }
}

interface CardinalityStyle {
  label: string
  markerStart?: string
  markerEnd?: string
}

interface RelationshipHandles {
  sourceHandle: string
  targetHandle: string
}

export interface RelationshipEdgeProjectionInput {
  nodes: RelationshipCanvasNode[]
  userRelationships: SchemaRelationship[]
  catalogRelationships: CatalogRelationship[]
  visibility: RelationshipVisibility
}

function catalogRelationshipIdentity(relationship: CatalogRelationshipInput): string {
  return [
    relationship.from_table,
    relationship.to_table,
    relationship.type,
    relationship.source || '',
  ].join('\u0000')
}

export function mergeCatalogRelationships(
  current: CatalogRelationship[],
  incoming: CatalogRelationshipInput[],
): CatalogRelationship[] {
  const merged = current.map(relationship => ({
    ...relationship,
    column_pairs: relationship.column_pairs.map(pair => ({ ...pair })),
  }))
  const byIdentity = new Map(
    merged.map((relationship, index) => [catalogRelationshipIdentity(relationship), index]),
  )

  for (const relationship of incoming) {
    const identity = catalogRelationshipIdentity(relationship)
    const existingIndex = byIdentity.get(identity)
    if (existingIndex === undefined) {
      byIdentity.set(identity, merged.length)
      merged.push({ ...relationship, column_pairs: (relationship.column_pairs || []).map(pair => ({ ...pair })) })
      continue
    }

    const existing = merged[existingIndex]
    if (relationship.name !== undefined) existing.name = relationship.name
    for (const pair of relationship.column_pairs || []) {
      const existingPair = existing.column_pairs.find(
        candidate => candidate.source === pair.source && candidate.target === pair.target,
      )
      if (existingPair) {
        if (pair.name !== undefined) existingPair.name = pair.name
      } else {
        existing.column_pairs.push({ ...pair })
      }
    }
  }

  return merged
}

function resolveRelationshipNode(
  nodes: RelationshipCanvasNode[],
  tableName: string,
  schema?: string,
): RelationshipCanvasNode | null {
  const normalizedSchema = String(schema || '').trim()
  const candidates = nodes.filter(node =>
    node.data?.tableName === tableName
      && (!normalizedSchema || (node.data.schema || 'public') === normalizedSchema),
  )
  return candidates.length === 1 ? candidates[0] : null
}

function resolveHandles(
  sourceNode: RelationshipCanvasNode,
  targetNode: RelationshipCanvasNode,
  fromColumn: string,
  toColumn: string,
): RelationshipHandles {
  if ((sourceNode.position?.x ?? 0) < (targetNode.position?.x ?? 0)) {
    return {
      sourceHandle: `fk-${fromColumn}-source`,
      targetHandle: `pk-${toColumn}`,
    }
  }

  return {
    sourceHandle: `fk-${fromColumn}-source-left`,
    targetHandle: `pk-${toColumn}-right`,
  }
}

function resolveCardinalityStyle(relationship: SchemaRelationship): CardinalityStyle {
  const description = relationship.description || ''
  if (description.includes('[1:1]')) {
    return {
      label: '1:1',
      markerStart: 'url(#erd-one-green)',
      markerEnd: 'url(#erd-one-green)',
    }
  }
  if (description.includes('[1:N]')) {
    return {
      label: '1:N',
      markerStart: 'url(#erd-one)',
      markerEnd: 'url(#crowfoot-many)',
    }
  }
  if (description.includes('[N:1]')) {
    return {
      label: 'N:1',
      markerStart: 'url(#crowfoot-many)',
      markerEnd: 'url(#erd-one)',
    }
  }
  if (description.includes('[N:N]')) {
    return {
      label: 'N:N',
      markerStart: 'url(#crowfoot-many-purple)',
      markerEnd: 'url(#crowfoot-many-purple)',
    }
  }

  return { label: `${relationship.from_column} → ${relationship.to_column}` }
}

function projectUserRelationship(
  nodes: RelationshipCanvasNode[],
  relationship: SchemaRelationship,
): Edge | null {
  const sourceNode = resolveRelationshipNode(
    nodes,
    relationship.from_table,
    relationship.from_schema,
  )
  const targetNode = resolveRelationshipNode(
    nodes,
    relationship.to_table,
    relationship.to_schema,
  )
  if (!sourceNode || !targetNode) return null
  const cardinality = resolveCardinalityStyle(relationship)
  const handles = resolveHandles(
    sourceNode,
    targetNode,
    relationship.from_column,
    relationship.to_column,
  )
  const cleanedLabel = (relationship.name || relationship.description || '').replace(/\[.*?\]\s*/, '')
  const label = cleanedLabel.trim() ? cleanedLabel : cardinality.label
  const edge: Edge = {
    id: `rel-${relationship.from_table}-${relationship.from_column}-${relationship.to_table}-${relationship.to_column}`,
    source: sourceNode.id,
    target: targetNode.id,
    sourceHandle: handles.sourceHandle,
    targetHandle: handles.targetHandle,
    type: 'default',
    animated: false,
    label,
    data: { relationshipScope: 'catalog', relationshipSource: 'user' },
    style: { stroke: '#f59e0b', strokeWidth: 2.5 },
    labelStyle: { fill: '#e9ecef', fontSize: 11, fontWeight: 600 },
    labelBgStyle: { fill: '#1a1b26', fillOpacity: 0.9 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#f59e0b', width: 20, height: 20 },
  }

  if (cardinality.markerStart) edge.markerStart = cardinality.markerStart
  if (cardinality.markerEnd) edge.markerEnd = cardinality.markerEnd

  return edge
}

function resolveCatalogSource(relationship: CatalogRelationship): {
  visibility: keyof RelationshipVisibility
  strokeColor: string
  strokeDasharray: string | undefined
} {
  if (relationship.source === 'catalog') {
    return { visibility: 'user', strokeColor: '#f59e0b', strokeDasharray: undefined }
  }
  return { visibility: 'ddl', strokeColor: '#22c55e', strokeDasharray: undefined }
}

export function projectRelationshipEdges({
  nodes,
  userRelationships,
  catalogRelationships,
  visibility,
}: RelationshipEdgeProjectionInput): Edge[] {
  const edges: Edge[] = []
  const edgeIds = new Set<string>()

  if (visibility.user) {
    for (const relationship of userRelationships) {
      const edge = projectUserRelationship(nodes, relationship)
      if (!edge) continue
      edges.push(edge)
      edgeIds.add(edge.id)
    }
  }

  for (const relationship of catalogRelationships) {
    // related-tables 응답에는 schema/datasource가 없으므로 같은 이름의 node가
    // 둘 이상이면 임의 edge를 연결하지 않는다.
    const sourceNode = resolveRelationshipNode(nodes, relationship.from_table)
    const targetNode = resolveRelationshipNode(nodes, relationship.to_table)
    if (!sourceNode || !targetNode) continue

    const source = resolveCatalogSource(relationship)
    if (!visibility[source.visibility]) continue

    for (const pair of relationship.column_pairs || []) {
      if (!pair.source?.trim() || !pair.target?.trim()) continue

      const edgeId = `neo4j-${relationship.from_table}-${pair.source}-${relationship.to_table}-${pair.target}`
      if (edgeIds.has(edgeId)) continue

      const handles = resolveHandles(
        sourceNode,
        targetNode,
        pair.source,
        pair.target,
      )
      edges.push({
        id: edgeId,
        source: sourceNode.id,
        target: targetNode.id,
        sourceHandle: handles.sourceHandle,
        targetHandle: handles.targetHandle,
        type: 'default',
        animated: false,
        label: pair.name || relationship.name || `${pair.source} → ${pair.target}`,
        data: {
          relationshipScope: 'catalog',
          relationshipSource: relationship.source || 'ddl',
        },
        style: {
          stroke: source.strokeColor,
          strokeWidth: 2.5,
          strokeDasharray: source.strokeDasharray,
        },
        labelStyle: { fill: '#e9ecef', fontSize: 10, fontWeight: 500 },
        labelBgStyle: { fill: '#1a1b26', fillOpacity: 0.9 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: source.strokeColor,
          width: 20,
          height: 20,
        },
      })
      edgeIds.add(edgeId)
    }
  }

  return edges
}
