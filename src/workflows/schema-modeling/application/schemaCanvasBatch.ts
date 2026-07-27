import type { SchemaModelingTable } from './schemaCatalogDiscovery'

export type SchemaCanvasBatchMode = 'top' | 'all'

export interface SchemaCanvasBatchAttempt {
  mode: SchemaCanvasBatchMode
  tables: SchemaModelingTable[]
}

function cloneTable(table: Readonly<SchemaModelingTable>): SchemaModelingTable {
  return {
    name: table.name,
    schema: table.schema,
    datasource: table.datasource,
    logical_name: table.logical_name,
    description: table.description,
    description_source: table.description_source,
    analyzed_description: table.analyzed_description,
    column_count: table.column_count,
  }
}

export function createSchemaCanvasBatchAttempt(
  mode: SchemaCanvasBatchMode,
  tables: readonly SchemaModelingTable[],
): SchemaCanvasBatchAttempt {
  return {
    mode,
    tables: tables.map(cloneTable),
  }
}

export function cloneSchemaCanvasBatchAttempt(
  attempt: Readonly<SchemaCanvasBatchAttempt>,
): SchemaCanvasBatchAttempt {
  return createSchemaCanvasBatchAttempt(attempt.mode, attempt.tables)
}
