export interface DataSourceField {
  name: string
  label: string
  type: 'text' | 'number' | 'password' | 'select'
  required: boolean
  default?: string | number
  placeholder?: string
  options?: Array<{ value: string; label: string }>
}

export type DataSourceCategory =
  | 'database'
  | 'nosql'
  | 'datawarehouse'
  | 'api'
  | 'saas'
  | 'file'
  | 'streaming'
  | 'analytics'
  | 'vector'
  | 'other'

export interface DataSourceTypeConfig {
  type: string
  display_name: string
  icon: string
  category: DataSourceCategory
  fields: DataSourceField[]
  description?: string
}

export interface HealthCheckResult {
  name: string
  status: 'healthy' | 'partial' | 'disconnected' | 'unknown' | 'not_found' | 'checking'
  message: string
  db_connected: boolean
  source_connected: boolean
}

export interface DataSource {
  name: string
  engine: string
  display_name?: string
  host?: string
  port?: number
  database?: string
  user?: string
  tables?: string[]
  created_at?: string
  health?: HealthCheckResult
}

export interface DataSourceTable {
  name: string
  description?: string
  column_count?: number
}

export interface DataSourceCreateRequest {
  name: string
  engine: string
  parameters: Record<string, unknown>
}

export interface TestConnectionRequest {
  engine: string
  host: string
  port?: number
  user?: string
  password?: string
  database?: string
}

export interface ConnectionTestResult {
  success: boolean
  message: string
}

export interface DataQueryRequest {
  datasource: string
  query: string
  max_rows: number
}

export interface DataQueryResponse {
  type?: 'result' | 'error'
  columns?: string[]
  data?: unknown[][]
  row_count?: number
  execution_time?: number
  error?: string
}
