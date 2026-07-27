import type {
  CatalogDescriptionSource,
  RoboSchemaColumnInfo,
  RoboSchemaTableInfo,
} from '@/domains/catalog'

export interface SchemaModelingTable {
  name: string
  schema: string
  datasource?: string
  logical_name?: string
  description: string
  description_source?: CatalogDescriptionSource
  analyzed_description?: string
  column_count: number
}

export interface SchemaModelingColumn {
  name: string
  table_name: string
  dtype: string
  nullable: boolean
  logical_name?: string
  description: string
  description_source?: CatalogDescriptionSource
  analyzed_description?: string
}

export interface SchemaColumnFailure {
  tableName: string
  schema: string
  datasource: string
  message: string
}

export function projectSchemaCatalogTables(
  tables: readonly RoboSchemaTableInfo[],
): SchemaModelingTable[] {
  return tables.map(table => ({
    name: table.name,
    schema: table.table_schema,
    datasource: table.datasource || '',
    logical_name: table.logical_name,
    description: table.description || '',
    description_source: table.description_source,
    analyzed_description: table.analyzed_description,
    column_count: table.column_count,
  }))
}

export function projectSchemaCatalogColumns(
  columns: readonly RoboSchemaColumnInfo[],
): SchemaModelingColumn[] {
  return columns.map(column => ({
    name: column.name,
    table_name: column.table_name,
    dtype: column.dtype,
    nullable: column.nullable,
    logical_name: column.logical_name || undefined,
    description: column.description || '',
    description_source: column.description_source,
    analyzed_description: column.analyzed_description,
  }))
}
