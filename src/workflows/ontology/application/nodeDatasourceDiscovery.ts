import type { NodeSearchCandidate } from '@/domains/ontology'
import type {
  AskResponse,
  DirectSqlResponse,
} from '@/domains/text2sql'

export interface NodeDatasourceDiscoveryNode {
  id: string
  name: string
  label?: string
  layer?: string
}

export interface ManualNodeDatasourceTable {
  name: string
  schema: string
  executionDatasource: string
  fullName: string
  materializedView?: string
  sourceKind: 'table' | 'object-type'
}

const NODE_QUERY_SUFFIX: Record<string, string> = {
  KPI: 'KPI 지표 데이터',
  Measure: '측정 데이터',
  Process: '프로세스 로그',
  Driver: '외부 변수 데이터',
  Resource: '자원 현황',
}

function normalizedColumnNames(columns: unknown): string[] {
  if (!Array.isArray(columns)) return []
  return Array.from(new Set(columns
    .filter((column): column is string => typeof column === 'string')
    .map(column => column.trim())
    .filter(Boolean)))
}

export function createNodeDatasourceQuery(
  node: NodeDatasourceDiscoveryNode,
): string {
  const layer = (node.layer || node.label || '').trim()
  return `${node.name.trim()} ${NODE_QUERY_SUFFIX[layer] || '데이터'}`.trim()
}

export function normalizeDatasourceTableRef(
  tableName: string,
  datasource: string,
): string {
  const parts = tableName
    .replace(/["`]/g, '')
    .split('.')
    .map(part => part.trim())
    .filter(Boolean)
  const normalizedDatasource = datasource.trim().toLowerCase()
  if (
    parts.length === 3
    && normalizedDatasource
    && parts[0].toLowerCase() === normalizedDatasource
  ) {
    return `${parts[1]}.${parts[2]}`
  }
  return parts.length >= 2
    ? `${parts.at(-2)}.${parts.at(-1)}`
    : parts[0] || ''
}

function quoteTableName(tableName: string): string {
  return tableName
    .split('.')
    .map(part => `"${part.replace(/"/g, '""')}"`)
    .join('.')
}

export function projectNodeDatasourceCandidates(
  response: AskResponse,
  datasource: string,
): NodeSearchCandidate[] {
  const scores = new Map<string, number>()
  for (const match of response.provenance.vector_matches) {
    const node = typeof match.node === 'string' ? match.node : ''
    const score = typeof match.score === 'number' && Number.isFinite(match.score)
      ? match.score
      : null
    if (!node || score === null) continue
    const tableName = node.startsWith('Table:')
      ? node.slice('Table:'.length)
      : node
    scores.set(tableName, score)
  }

  const columns = normalizedColumnNames(response.table.columns)
  return response.provenance.tables.map(tableName => {
    const shortName = tableName.split('.').at(-1) || tableName
    return {
      table_name: tableName,
      datasource,
      full_table_name: quoteTableName(tableName),
      columns: [...columns],
      sample_data: [],
      row_count: null,
      row_count_approx: false,
      relevance_score: scores.get(tableName) ?? scores.get(shortName) ?? null,
      match_reason: 'Text2SQL provenance에서 확인된 사용 테이블',
      suggested_sql: response.sql,
    }
  })
}

export function createNodeDatasourceProbeRequest(
  candidate: NodeSearchCandidate,
): {
  sql: string
  datasource: string
  max_sql_seconds: number
  format_with_ai: false
} {
  const tableRef = normalizeDatasourceTableRef(
    candidate.table_name,
    candidate.datasource || '',
  )
  return {
    sql: `SELECT * FROM ${tableRef} LIMIT 11`,
    datasource: candidate.datasource || '',
    max_sql_seconds: 15,
    format_with_ai: false,
  }
}

export function toNodeDatasourceRows(
  rows: unknown,
  columns: unknown,
): Array<Record<string, unknown>> {
  if (!Array.isArray(rows) || rows.length === 0) return []
  if (Array.isArray(rows[0])) {
    const names = normalizedColumnNames(columns)
    return rows.filter(Array.isArray).map(row => {
      const projected: Record<string, unknown> = {}
      names.forEach((name, index) => {
        projected[name] = row[index]
      })
      return projected
    })
  }
  return rows
    .filter((row): row is Record<string, unknown> => (
      typeof row === 'object' && row !== null && !Array.isArray(row)
    ))
    .map(row => ({ ...row }))
}

export function projectNodeDatasourceProbe(
  candidate: NodeSearchCandidate,
  response: Pick<DirectSqlResponse, 'columns' | 'rows'>,
): NodeSearchCandidate {
  const columns = normalizedColumnNames(response.columns)
  const rows = Array.isArray(response.rows) ? response.rows : []
  const hasMoreThanTen = rows.length >= 11
  const projectedColumns = columns.length > 0
    ? columns
    : [...candidate.columns]
  return {
    ...candidate,
    columns: projectedColumns,
    sample_data: toNodeDatasourceRows(rows.slice(0, 10), projectedColumns),
    row_count: hasMoreThanTen ? 10 : rows.length,
    row_count_approx: hasMoreThanTen,
  }
}

export function projectNodeDatasourceProbeFailure(
  candidate: NodeSearchCandidate,
): NodeSearchCandidate {
  return {
    ...candidate,
    columns: [...candidate.columns],
    sample_data: candidate.sample_data.map(row => ({ ...row })),
    row_count: -1,
    row_count_approx: false,
  }
}

export function createManualNodeDatasourceCandidate(
  table: ManualNodeDatasourceTable,
  columns: readonly string[] = [],
): NodeSearchCandidate {
  const tableName = table.sourceKind === 'object-type' && table.materializedView
    ? table.materializedView
    : table.fullName.replace(/"/g, '')
  return {
    table_name: tableName,
    datasource: table.executionDatasource,
    columns: normalizedColumnNames(columns),
    sample_data: [],
    row_count: 0,
    row_count_approx: false,
    relevance_score: 1,
    match_reason: table.sourceKind === 'object-type'
      ? '온톨로지 (ObjectType) 선택'
      : '수동 선택',
    suggested_sql: `SELECT * FROM ${table.fullName} LIMIT 100`,
    materializedView: table.materializedView,
  }
}

export function createSelectedSearchCandidate(
  candidate: NodeSearchCandidate,
  fallbackDatasource: string,
): NodeSearchCandidate {
  return {
    ...candidate,
    datasource: candidate.datasource || fallbackDatasource,
    columns: [...candidate.columns],
    sample_data: candidate.sample_data.map(row => ({ ...row })),
    suggested_sql: candidate.suggested_sql
      || `SELECT * FROM ${candidate.full_table_name || quoteTableName(candidate.table_name)} LIMIT 100`,
  }
}
