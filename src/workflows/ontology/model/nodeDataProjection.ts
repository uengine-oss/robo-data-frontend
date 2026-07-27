export interface ChartRecommendation {
  type: 'table' | 'line' | 'bar'
  xAxis: string | null
  yAxis: string[]
}

export interface NodeDataProjection {
  rows: Array<Record<string, unknown>>
  timeColumns: string[]
  numericColumns: string[]
  chartRecommendation: ChartRecommendation
}

function cellValue(row: unknown, columns: string[], column: string): unknown {
  if (Array.isArray(row)) return row[columns.indexOf(column)]
  return typeof row === 'object' && row !== null
    ? (row as Record<string, unknown>)[column]
    : null
}

function isDateValue(value: unknown): boolean {
  if (value instanceof Date) return Number.isFinite(value.getTime())
  if (typeof value !== 'string' || !/\d{4}-\d{1,2}-\d{1,2}/.test(value)) return false
  return Number.isFinite(Date.parse(value))
}

function isNumericValue(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'string' || !value.trim()) return false
  return Number.isFinite(Number(value))
}

/** Project the runtime-validated direct-SQL result into the ontology data panel model. */
export function projectNodeData(columns: string[], inputRows: unknown[]): NodeDataProjection {
  const timeColumns: string[] = []
  const numericColumns: string[] = []

  for (const column of columns) {
    const sample = inputRows
      .slice(0, 10)
      .map(row => cellValue(row, columns, column))
      .find(value => value != null)
    if (sample == null) continue
    if (isDateValue(sample)) timeColumns.push(column)
    if (isNumericValue(sample)) numericColumns.push(column)
  }

  const rows = inputRows.map(row => {
    if (Array.isArray(row)) {
      return Object.fromEntries(columns.map((column, index) => [column, row[index]]))
    }
    return typeof row === 'object' && row !== null
      ? row as Record<string, unknown>
      : { value: row }
  })

  const chartRecommendation: ChartRecommendation = numericColumns.length > 0
    ? {
        type: 'line',
        xAxis: timeColumns[0] ?? columns[0] ?? null,
        yAxis: numericColumns.slice(0, 3),
      }
    : { type: 'table', xAxis: null, yAxis: [] }

  return { rows, timeColumns, numericColumns, chartRecommendation }
}
