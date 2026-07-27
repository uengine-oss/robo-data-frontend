export interface SqlInstanceCreationRequest {
  datasource: string
  sourceSql: string
  schemaId: string
  nodeType: string
  idColumn: string
  nameColumn: string
  sourceQuestion?: string
  materializedView?: {
    enabled: boolean
    viewName: string
    description: string
  }
}

export interface SqlInstanceCreationDependencies {
  createMaterializedView: (request: {
    datasource: string
    view_name: string
    source_sql: string
    schema_name: string
    description: string
    refresh_on_create: boolean
  }) => Promise<{ full_name: string }>
  bulkCreateInstances: (request: {
    schema_id: string
    node_type: string
    sql_query: string
    id_column: string
    name_column: string
    materialized_view: string | null
    source_question?: string
  }) => Promise<{ created_count?: number }>
}

export interface SqlInstanceCreationResult {
  createdCount: number
  materializedView: string | null
  warning: string | null
}

function describeError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

export async function createInstancesFromSql(
  request: SqlInstanceCreationRequest,
  dependencies: SqlInstanceCreationDependencies,
): Promise<SqlInstanceCreationResult> {
  let materializedView: string | null = null
  let warning: string | null = null

  if (request.materializedView?.enabled && request.materializedView.viewName) {
    try {
      const created = await dependencies.createMaterializedView({
        datasource: request.datasource,
        view_name: request.materializedView.viewName,
        source_sql: request.sourceSql,
        schema_name: 'public',
        description: request.materializedView.description,
        refresh_on_create: true,
      })
      materializedView = created.full_name
    } catch (cause) {
      warning = `Materialized View는 생성하지 못했습니다: ${describeError(cause)}`
    }
  }

  const created = await dependencies.bulkCreateInstances({
    schema_id: request.schemaId,
    node_type: request.nodeType,
    sql_query: request.sourceSql,
    id_column: request.idColumn,
    name_column: request.nameColumn,
    materialized_view: materializedView,
    source_question: request.sourceQuestion,
  })

  return {
    createdCount: created.created_count || 0,
    materializedView,
    warning,
  }
}
