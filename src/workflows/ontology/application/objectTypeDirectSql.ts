import {
  toRecordRows,
  type DirectSqlStreamEvent,
} from '@/domains/text2sql'

export interface ObjectTypeSqlDatasourceOption {
  name: string
  label: string
}

export interface ObjectTypeSqlDatasourceResolution {
  selected?: string | null
  sql: string
  storeSelected?: string | null
  available: string[]
}

export interface ObjectTypeDirectSqlRequest {
  sql: string
  datasource: string
}

export interface ObjectTypeDirectSqlResult {
  columns: string[]
  rows: Array<Record<string, unknown>>
}

export type ObjectTypeDirectSqlStreamRunner = (
  request: ObjectTypeDirectSqlRequest,
  onEvent: (event: DirectSqlStreamEvent) => void,
) => Promise<void>

export function normalizeDatasourceToken(token?: string | null): string {
  return String(token || '')
    .trim()
    .replace(/^[`'"]+/, '')
    .replace(/[`'"]+$/, '')
}

export function detectDatasourceFromSql(sql: string): string | null {
  const patterns = [
    /(?:FROM|JOIN)\s+[`"]?([a-zA-Z_][\w-]*)[`"]?\s*\(/i,
    /(?:FROM|JOIN)\s+[`"]?([a-zA-Z_][\w-]*)[`"]?\s*\.\s*[`"]?([a-zA-Z_][\w-]*)[`"]?\s*\.\s*[`"]?([a-zA-Z_][\w-]*)[`"]?/i,
  ]

  for (const pattern of patterns) {
    const match = sql.match(pattern)
    if (match?.[1]) return normalizeDatasourceToken(match[1])
  }

  return null
}

export function buildObjectTypeSqlDatasourceOptions(
  sql: string,
  available: string[],
): ObjectTypeSqlDatasourceOption[] {
  const options: ObjectTypeSqlDatasourceOption[] = []
  const seen = new Set<string>()
  const detected = detectDatasourceFromSql(sql)

  if (detected) {
    seen.add(detected)
    options.push({
      name: detected,
      label: `${detected} (SQL에서 감지됨)`,
    })
  }

  for (const candidate of available) {
    const name = normalizeDatasourceToken(candidate)
    if (!name || seen.has(name)) continue
    seen.add(name)
    options.push({ name, label: name })
  }

  return options
}

export function resolveObjectTypeSqlDatasource(
  resolution: ObjectTypeSqlDatasourceResolution,
): string {
  const selected = normalizeDatasourceToken(resolution.selected)
  if (selected) return selected

  const detected = detectDatasourceFromSql(resolution.sql)
  if (detected) return detected

  const storeSelected = normalizeDatasourceToken(resolution.storeSelected)
  if (storeSelected) return storeSelected

  const available = resolution.available
    .map(normalizeDatasourceToken)
    .filter(Boolean)

  return available.length === 1 ? available[0] : ''
}

export async function executeObjectTypeDirectSql(
  runStream: ObjectTypeDirectSqlStreamRunner,
  request: ObjectTypeDirectSqlRequest,
): Promise<ObjectTypeDirectSqlResult> {
  if (!request.sql.trim()) throw new Error('SQL을 입력해주세요')
  if (!request.datasource.trim()) {
    throw new Error('데이터소스를 선택하거나 SQL에 datasource를 명시해주세요')
  }

  let columns: string[] = []
  let rows: Array<Record<string, unknown>> = []

  await runStream(request, event => {
    if (event.event === 'result') {
      columns = event.columns || []
      rows = toRecordRows(event.rows, columns)
    } else if (event.event === 'error') {
      throw new Error(event.message || 'SQL 실행 오류')
    } else if (event.type === 'columns' && Array.isArray(event.data)) {
      columns = event.data.filter(
        (column): column is string => typeof column === 'string',
      )
    } else if (event.type === 'row' && event.data) {
      rows.push(...toRecordRows([event.data], columns))
    } else if (event.type === 'error') {
      throw new Error(event.message || 'SQL 실행 오류')
    } else if (event.columns) {
      columns = event.columns
      rows = toRecordRows(event.rows, columns)
    }
  })

  if (columns.length === 0) {
    throw new Error('결과 컬럼을 파싱할 수 없습니다')
  }

  return { columns, rows }
}
