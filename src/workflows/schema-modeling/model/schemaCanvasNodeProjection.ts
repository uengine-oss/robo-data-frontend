import type { OntologyBehavior } from '@/domains/ontology'
import type {
  SchemaModelingColumn,
  SchemaModelingTable,
} from '../application/schemaCatalogDiscovery'
import { tableNodeId } from './tableIdentity'

export interface TableNodeData {
  tableName: string
  schema: string
  datasource?: string
  logical_name?: string
  description?: string
  analyzed_description?: string
  description_source?: 'ddl' | 'procedure' | 'code' | 'user' | ''
  columns: SchemaModelingColumn[]
  columnCount: number
  isPrimary?: boolean
  isObjectType?: boolean
  behaviors?: OntologyBehavior[]
  query?: string
}

export interface SchemaCanvasNodeProjection {
  id: string
  type: 'tableNode'
  position: {
    x: number
    y: number
  }
  data: TableNodeData
}

export interface SchemaCanvasNodeOptions {
  isPrimary?: boolean
  isObjectType?: boolean
  behaviors?: readonly OntologyBehavior[]
}

export function projectSchemaCanvasNode(
  table: Readonly<SchemaModelingTable>,
  columns: readonly SchemaModelingColumn[],
  position: Readonly<{ x: number; y: number }>,
  options: Readonly<SchemaCanvasNodeOptions> = {},
): SchemaCanvasNodeProjection {
  return {
    id: tableNodeId(table),
    type: 'tableNode',
    position: {
      x: position.x,
      y: position.y,
    },
    data: {
      tableName: table.name,
      schema: table.schema || 'public',
      datasource: table.datasource || '',
      logical_name: table.logical_name || undefined,
      description: table.description || undefined,
      analyzed_description: table.analyzed_description || undefined,
      description_source: table.description_source || undefined,
      columns: columns.map(column => ({ ...column })),
      columnCount: table.column_count || columns.length,
      isPrimary: options.isPrimary !== false,
      isObjectType: options.isObjectType === true,
      behaviors: options.behaviors?.map(behavior => ({
        ...behavior,
        config: behavior.config
          ? {
              ...behavior.config,
              parameters: behavior.config.parameters
                ? { ...behavior.config.parameters }
                : undefined,
            }
          : undefined,
        inputFields: behavior.inputFields ? [...behavior.inputFields] : undefined,
      })) ?? [],
    },
  }
}

export function projectSchemaCanvasGridPosition(
  index: number,
  tableCount: number,
): { x: number; y: number } {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error('Schema canvas grid index must be a nonnegative integer.')
  }
  if (!Number.isInteger(tableCount) || tableCount <= 0 || index >= tableCount) {
    throw new Error('Schema canvas grid table count must contain the requested index.')
  }

  const columns = Math.ceil(Math.sqrt(tableCount))
  return {
    x: 50 + (index % columns) * 330,
    y: 50 + Math.floor(index / columns) * 250,
  }
}
