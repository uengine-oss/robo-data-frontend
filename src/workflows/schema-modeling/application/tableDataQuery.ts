import type { DataQueryRequest, DataQueryResponse } from '@/domains/data-fabric'
import type { ObjectTypeDetail } from '@/domains/ontology'

export interface QueryableTable {
  name: string
  schema?: string
  datasource?: string
}

export interface TableDataQueryInput {
  tableName: string
  schema?: string
  limit: number
  datasource?: string
  tables: QueryableTable[]
}

export interface TableDataQueryPlan {
  tableName: string
  schema: string
  datasource: string
  limit: number
  primarySql: string
  candidateSqls: string[]
}

export type TableDataQueryPlanResult =
  | { ok: true; plan: TableDataQueryPlan }
  | { ok: false; plan: TableDataQueryPlan; error: string }

export type TableDataQueryExecutionResult =
  | {
      ok: true
      executedSql: string
      columns: string[]
      rows: unknown[][]
      rowCount: number
      executionTimeMs: number
    }
  | { ok: false; executedSql: string; error: string }

export interface TableDataQueryDependencies {
  getObjectType: (tableName: string) => Promise<ObjectTypeDetail>
  executeQuery: (request: DataQueryRequest) => Promise<DataQueryResponse>
}

export function extractDatasourceFromSql(query: string): string {
  const trimmedQuery = String(query || '').trim()
  if (!trimmedQuery) return ''

  const datasourcePatterns = [
    /\bFROM\s+[`"]?([A-Za-z_][A-Za-z0-9_]*)[`"]?\s*\(/i,
    /\b(?:FROM|JOIN)\s+[`"]?([A-Za-z_][A-Za-z0-9_]*)[`"]?\s*\.\s*[`"]?[A-Za-z_][A-Za-z0-9_]*[`"]?\s*\.\s*[`"]?[A-Za-z_][A-Za-z0-9_]*[`"]?/i,
  ]

  for (const pattern of datasourcePatterns) {
    const match = trimmedQuery.match(pattern)
    if (match?.[1]) return match[1].replace(/[`"]/g, '').trim()
  }

  return ''
}

export function toTargetDatabaseSql(query: string, datasourceName: string): string {
  const trimmed = String(query || '').trim().replace(/;+\s*$/, '')
  if (!trimmed || !datasourceName) return trimmed

  const escapedDatasource = datasourceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const quotedDatasourcePattern = '[`"]?' + escapedDatasource + '[`"]?'
  const nativeWrapper = new RegExp(
    `^SELECT\\s+\\*\\s+FROM\\s+${quotedDatasourcePattern}\\s*\\(([\\s\\S]*)\\)$`,
    'i',
  )
  const wrapped = trimmed.match(nativeWrapper)
  const targetSql = wrapped?.[1]?.trim() || trimmed
  const qualifiedDatasource = new RegExp(
    `(\\b(?:FROM|JOIN)\\s+)${quotedDatasourcePattern}\\s*\\.`,
    'gi',
  )
  return targetSql.replace(qualifiedDatasource, '$1')
}

export function withRowLimit(rawSql: string, rowLimit: number): string {
  const trimmed = String(rawSql || '').trim().replace(/;+\s*$/, '')
  if (!trimmed) return ''
  if (/\blimit\s+\d+\s*$/i.test(trimmed)) {
    return trimmed.replace(/\blimit\s+\d+\s*$/i, `LIMIT ${rowLimit}`)
  }
  return `${trimmed} LIMIT ${rowLimit}`
}

function emptyPlan(input: TableDataQueryInput, datasource: string): TableDataQueryPlan {
  return {
    tableName: input.tableName,
    schema: input.schema || 'public',
    datasource,
    limit: input.limit,
    primarySql: '',
    candidateSqls: [],
  }
}

function quoteMysqlIdentifier(identifier: string): string {
  return `\`${identifier.replace(/`/g, '``')}\``
}

function buildDirectTableSql(tableName: string, schema: string, datasource: string, limit: number): string {
  const needsSchemaQuoting = /[A-Z]/.test(schema)
  const needsTableQuoting = /[A-Z]/.test(tableName)
  let fullTableName: string

  if (datasource) {
    const schemaIdentifier = needsSchemaQuoting ? quoteMysqlIdentifier(schema) : schema
    const tableIdentifier = needsTableQuoting ? quoteMysqlIdentifier(tableName) : tableName
    fullTableName = `${schemaIdentifier}.${tableIdentifier}`
  } else if (needsSchemaQuoting || needsTableQuoting) {
    fullTableName = `"${schema}"."${tableName}"`
  } else {
    fullTableName = `${schema}.${tableName}`
  }

  return `SELECT * FROM ${fullTableName} LIMIT ${limit}`
}

export async function buildTableDataQueryPlan(
  input: TableDataQueryInput,
  getObjectType: TableDataQueryDependencies['getObjectType'],
): Promise<TableDataQueryPlanResult> {
  const schema = input.schema || 'public'
  const normalizedDatasource = (input.datasource || '').trim()
  const matchedTable = input.tables.find(
    table => table.name === input.tableName && (table.schema || 'public') === schema,
  )
  let datasource = normalizedDatasource || (matchedTable?.datasource || '').trim()
  const plan = emptyPlan(input, datasource)

  if (schema !== 'ObjectType' && normalizedDatasource !== 'ontology') {
    plan.primarySql = buildDirectTableSql(input.tableName, schema, datasource, input.limit)
    plan.candidateSqls = [plan.primarySql]
    return { ok: true, plan }
  }

  try {
    const objectType = await getObjectType(input.tableName)
    const objectQuery = String(objectType.query || '').trim()
    const objectDatasource = [
      String(objectType.datasource || '').trim(),
      String(objectType.dataSource || '').trim(),
      extractDatasourceFromSql(objectQuery),
    ].find(Boolean) || ''
    if (!datasource && objectDatasource) datasource = objectDatasource
    plan.datasource = datasource

    if (objectType.materializedView) {
      plan.primarySql = withRowLimit(
        toTargetDatabaseSql(`SELECT * FROM ${String(objectType.materializedView)}`, datasource),
        input.limit,
      )
      plan.candidateSqls.push(plan.primarySql)
    }

    if (objectQuery) {
      const sourceSql = withRowLimit(toTargetDatabaseSql(objectQuery, datasource), input.limit)
      if (sourceSql && !plan.candidateSqls.includes(sourceSql)) plan.candidateSqls.push(sourceSql)
      if (!plan.primarySql) plan.primarySql = sourceSql
    }

    if (!plan.primarySql) {
      throw new Error(`ObjectType '${input.tableName}'에 조회 가능한 데이터가 없습니다.`)
    }

    return { ok: true, plan }
  } catch (error) {
    return {
      ok: false,
      plan,
      error: error instanceof Error ? error.message : 'ObjectType 정보 조회 실패',
    }
  }
}

export async function executeTableDataQueryPlan(
  plan: TableDataQueryPlan,
  executeQuery: TableDataQueryDependencies['executeQuery'],
  onAttempt?: (sql: string) => void,
): Promise<TableDataQueryExecutionResult> {
  let lastError = ''
  let lastSql = plan.primarySql

  for (const candidateSql of plan.candidateSqls) {
    lastSql = candidateSql
    onAttempt?.(candidateSql)
    try {
      const result = await executeQuery({
        datasource: plan.datasource,
        query: candidateSql,
        max_rows: plan.limit,
      })
      if (result.type === 'error') {
        lastError = String(result.error || 'SQL 실행 오류')
        continue
      }

      return {
        ok: true,
        executedSql: candidateSql,
        columns: result.columns || [],
        rows: result.data || [],
        rowCount: Number(result.row_count || 0),
        executionTimeMs: Math.round(Number(result.execution_time || 0) * 1000),
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'SQL 실행 오류'
    }
  }

  return { ok: false, executedSql: lastSql, error: lastError || '알 수 없는 오류' }
}
