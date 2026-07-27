export interface SqlResultInstanceExport {
  sql: string
  question: string
  rowCount: number
  columns: string[]
  sampleData: Array<Record<string, unknown>>
}
