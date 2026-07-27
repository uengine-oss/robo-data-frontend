import type {
  OntologyDataSourceSchema,
  OntologyFilterField,
  OntologyNode,
  OntologyRelationship,
} from '@/domains/ontology'

export interface OntologyCanvasNode extends OntologyNode {
  unit?: string
  formula?: string
  targetValue?: number
  thresholds?: Record<string, number>
  bpmnXml?: string
}

export interface OntologyCanvasRelationship extends OntologyRelationship {
  weight?: number
  lag?: number
  sourceLayer?: string
  targetLayer?: string
}

export interface OntologyCanvasSchemaInput {
  id?: string
  name?: string
  nodes: readonly OntologyCanvasNode[]
  relationships: readonly OntologyCanvasRelationship[]
}

export type OntologyCanvasSchemaSource =
  | { kind: 'document' }
  | { kind: 'database' }
  | { kind: 'library'; schemaId: string }

export interface OntologyCanvasGraphSummary {
  nodeCount: number
  relationshipCount: number
  layerBreakdown: Record<string, number>
  synonymSuggestionCount: number
}

export interface OntologyCanvasSchemaProjection {
  schemaId: string | null
  schemaName: string
  autoNamed: boolean
  nodes: OntologyCanvasNode[]
  relationships: OntologyCanvasRelationship[]
  skippedRelationshipCount: number
  rekeyedRelationshipCount: number
  summary: OntologyCanvasGraphSummary
}

interface OntologyCanvasProjectionOptions {
  synonymSuggestionCount?: number
  now?: Date
}

const MULTI_LAYER_CANVAS_LAYERS = new Set([
  'KPI',
  'Measure',
  'Process',
  'Driver',
  'Resource',
])

function cloneDataSourceSchema(
  schema: string | OntologyDataSourceSchema | undefined,
): string | OntologyDataSourceSchema | undefined {
  if (!schema || typeof schema === 'string') return schema
  return {
    ...schema,
    ...(schema.columns ? { columns: [...schema.columns] } : {}),
  }
}

function cloneFilterFields(
  fields: OntologyFilterField[] | undefined,
): OntologyFilterField[] | undefined {
  return fields?.map(field => ({ ...field }))
}

function cloneCanvasNode(node: OntologyCanvasNode): OntologyCanvasNode {
  return {
    ...node,
    properties: node.properties?.map(property => ({ ...property })),
    dataSourceSchema: cloneDataSourceSchema(node.dataSourceSchema),
    filterFields: cloneFilterFields(node.filterFields),
    position: node.position ? { ...node.position } : undefined,
    thresholds: node.thresholds ? { ...node.thresholds } : undefined,
  }
}

function projectDatabaseCanvasNode(
  node: OntologyCanvasNode,
): OntologyCanvasNode {
  const cloned = cloneCanvasNode(node)
  const requestedLayer = cloned.layer || cloned.label
  const layer = MULTI_LAYER_CANVAS_LAYERS.has(requestedLayer)
    ? requestedLayer
    : 'Resource'
  return {
    ...cloned,
    label: layer,
    layer,
    description: cloned.description || '',
    dataSource: cloned.dataSource || '',
    filterFields: cloned.filterFields || [],
  }
}

function cloneCanvasRelationship(
  relationship: OntologyCanvasRelationship,
): OntologyCanvasRelationship {
  return {
    ...relationship,
    properties: relationship.properties
      ? { ...relationship.properties }
      : undefined,
  }
}

function projectDatabaseCanvasRelationship(
  relationship: OntologyCanvasRelationship,
): OntologyCanvasRelationship {
  const {
    from_field: fromFieldAlias,
    to_field: toFieldAlias,
    ...canonical
  } = cloneCanvasRelationship(relationship)
  return {
    ...canonical,
    type: canonical.type || 'RELATED_TO',
    description: canonical.description || '',
    fromField: canonical.fromField || fromFieldAlias || undefined,
    toField: canonical.toField || toFieldAlias || undefined,
  }
}

export function sanitizeOntologyCanvasRelationships(
  rawRelationships: readonly OntologyCanvasRelationship[],
  rawNodes: readonly OntologyCanvasNode[],
): {
  relationships: OntologyCanvasRelationship[]
  skipped: number
  rekeyed: number
} {
  const nodeIds = new Set(
    rawNodes.map(node => node.id).filter(nodeId => nodeId.length > 0),
  )
  const usedRelationshipIds = new Set<string>()
  const relationships: OntologyCanvasRelationship[] = []
  let skipped = 0
  let rekeyed = 0

  rawRelationships.forEach((rawRelationship, index) => {
    const relationship = cloneCanvasRelationship(rawRelationship)
    if (
      !relationship.source
      || !relationship.target
      || !nodeIds.has(relationship.source)
      || !nodeIds.has(relationship.target)
    ) {
      skipped += 1
      return
    }

    const type = relationship.type || 'RELATED_TO'
    const generatedId =
      `rel_${relationship.source}_${relationship.target}_${type}`
    const baseId = (relationship.id || generatedId).trim()
      || `rel_${index + 1}`
    let uniqueId = baseId
    if (usedRelationshipIds.has(uniqueId)) {
      let suffix = 2
      while (usedRelationshipIds.has(`${baseId}__${suffix}`)) {
        suffix += 1
      }
      uniqueId = `${baseId}__${suffix}`
      rekeyed += 1
    }

    usedRelationshipIds.add(uniqueId)
    relationships.push({
      ...relationship,
      id: uniqueId,
      type,
    })
  })

  return { relationships, skipped, rekeyed }
}

export function generateOntologyCanvasName(
  nodes: readonly OntologyCanvasNode[],
  now = new Date(),
): string {
  if (nodes.length === 0) {
    return `온톨로지_${now.toISOString().slice(0, 10)}`
  }

  const layerCounts: Record<string, number> = {}
  const nodeNames: string[] = []
  for (const node of nodes) {
    const layer = node.layer || node.label || 'Unknown'
    layerCounts[layer] = (layerCounts[layer] || 0) + 1
    if (node.name) nodeNames.push(node.name)
  }

  const mainLayer = Object.entries(layerCounts)
    .sort((left, right) => right[1] - left[1])[0]?.[0] || ''
  const topNodes = nodeNames.slice(0, 3).join('_')
  if (mainLayer && topNodes) {
    const layerName = mainLayer === 'KPI'
      ? 'KPI'
      : mainLayer === 'Measure'
        ? '측정'
        : mainLayer === 'Process'
          ? '프로세스'
          : mainLayer === 'Driver'
            ? '드라이버'
            : mainLayer === 'Resource'
              ? '자원'
              : mainLayer
    return `${layerName}_${topNodes}_온톨로지`
  }

  const date = now.toISOString().slice(5, 10).replace('-', '')
  return `온톨로지_${nodes.length}노드_${date}`
}

function createLayerBreakdown(
  nodes: readonly OntologyCanvasNode[],
): Record<string, number> {
  const layerBreakdown: Record<string, number> = {}
  for (const node of nodes) {
    const layer = node.layer || node.label || 'Unknown'
    layerBreakdown[layer] = (layerBreakdown[layer] || 0) + 1
  }
  return layerBreakdown
}

export function projectOntologyCanvasSchema(
  schema: OntologyCanvasSchemaInput,
  source: OntologyCanvasSchemaSource,
  options: OntologyCanvasProjectionOptions = {},
): OntologyCanvasSchemaProjection {
  const nodes = schema.nodes.map(node =>
    source.kind === 'database'
      ? projectDatabaseCanvasNode(node)
      : cloneCanvasNode(node))
  const sourceRelationships = schema.relationships.map(relationship =>
    source.kind === 'database'
      ? projectDatabaseCanvasRelationship(relationship)
      : cloneCanvasRelationship(relationship))
  const sanitized = sanitizeOntologyCanvasRelationships(
    sourceRelationships,
    nodes,
  )

  const suppliedName = schema.name?.trim() || ''
  const shouldAutoName = source.kind !== 'library'
    && (
      !suppliedName
      || suppliedName.startsWith('온톨로지_')
      || suppliedName === 'Multi-Layer Ontology'
    )
  const schemaName = shouldAutoName
    ? generateOntologyCanvasName(nodes, options.now)
    : suppliedName
  const schemaId = source.kind === 'library'
    ? source.schemaId
    : schema.id?.trim() || null

  return {
    schemaId,
    schemaName,
    autoNamed: shouldAutoName,
    nodes,
    relationships: sanitized.relationships,
    skippedRelationshipCount: sanitized.skipped,
    rekeyedRelationshipCount: sanitized.rekeyed,
    summary: {
      nodeCount: nodes.length,
      relationshipCount: sanitized.relationships.length,
      layerBreakdown: createLayerBreakdown(nodes),
      synonymSuggestionCount: options.synonymSuggestionCount ?? 0,
    },
  }
}
