import type { RoboSchemaColumnInfo, RoboSchemaTableInfo } from '@/domains/catalog'

export interface SchemaModelingTable {
  name: string
  schema: string
  datasource?: string
  logical_name?: string
  description: string
  summary?: string
  column_count: number
}

export interface SchemaModelingColumn {
  name: string
  table_name: string
  data_type: string
  nullable: boolean
  logical_name?: string
  description: string
  summary?: string
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
    summary: table.summary,
    column_count: table.column_count,
  }))
}

export function projectSchemaCatalogColumns(
  columns: readonly RoboSchemaColumnInfo[],
): SchemaModelingColumn[] {
  return columns.map(column => ({
    name: column.name,
    table_name: column.table_name,
    data_type: column.data_type,
    nullable: column.nullable,
    logical_name: column.logical_name || undefined,
    description: column.description || '',
    summary: column.summary,
  }))
}
