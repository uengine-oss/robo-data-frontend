import type { ObjectTypeInfo, OntologyBehavior } from '@/domains/ontology'

export interface ObjectTypeCanvasColumn {
  name: string
  table_name: string
  data_type: string
  description: string
  nullable: boolean
}

export interface ObjectTypeCanvasProjection {
  tableInfo: {
    name: string
    schema: 'ObjectType'
    description: string
    column_count: number
  }
  columns: ObjectTypeCanvasColumn[]
  behaviors: OntologyBehavior[]
  dragData: {
    name: string
    schema: 'ObjectType'
    description: string
    column_count: number
    columns: ObjectTypeCanvasColumn[]
    isObjectType: true
    behaviors: OntologyBehavior[]
  }
}

export interface ObjectTypeRelationshipEdge {
  source: string
  target: string
  label?: unknown
  data?: { name?: unknown }
}

export interface RelatedObjectType {
  name: string
  relationName?: string
  columns: string[]
}

export function projectObjectTypeToCanvas(objectType: ObjectTypeInfo): ObjectTypeCanvasProjection {
  const columns = objectType.columns.map(column => ({
    name: column.name,
    table_name: objectType.name,
    data_type: column.type || 'string',
    description: column.description || '',
    nullable: true,
  }))
  const behaviors = objectType.behaviors || []
  const tableInfo = {
    name: objectType.name,
    schema: 'ObjectType' as const,
    description: objectType.description || '',
    column_count: objectType.columns.length,
  }

  return {
    tableInfo,
    columns,
    behaviors,
    dragData: {
      ...tableInfo,
      columns,
      isObjectType: true,
      behaviors,
    },
  }
}

export function collectRelatedObjectTypes(
  objectTypeName: string,
  objectTypes: readonly ObjectTypeInfo[],
  edges: readonly ObjectTypeRelationshipEdge[],
): RelatedObjectType[] {
  const relatedTypes: RelatedObjectType[] = []

  for (const edge of edges) {
    if (edge.source !== objectTypeName && edge.target !== objectTypeName) continue
    const relatedName = edge.source === objectTypeName ? edge.target : edge.source
    const relatedObjectType = objectTypes.find(candidate => candidate.name === relatedName)
    if (!relatedObjectType) continue

    const dataName = typeof edge.data?.name === 'string' ? edge.data.name : undefined
    const label = typeof edge.label === 'string' ? edge.label : undefined
    relatedTypes.push({
      name: relatedObjectType.name,
      relationName: dataName || label,
      columns: relatedObjectType.columns.map(column => column.name),
    })
  }

  return relatedTypes
}
