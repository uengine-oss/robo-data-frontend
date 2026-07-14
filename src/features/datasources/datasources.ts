/**
 * datasources.ts
 * 데이터 소스 관리 스토어
 * 
 * DataSource → Schema → Table → Column 계층 구조 관리
 * MindsDB가 지원하는 모든 데이터 소스 유형 포함
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { DATA_FABRIC_BASE_URL } from '@/shared/services/http'
import { useSessionStore } from '@/shared/stores/session'

// ============================================================================
// 타입 정의
// ============================================================================

export interface DataSourceField {
  name: string
  label: string
  type: 'text' | 'number' | 'password' | 'select'
  required: boolean
  default?: string | number
  placeholder?: string  // 힌트 텍스트
  options?: { value: string; label: string }[]  // For select type
}

export interface DataSourceTypeConfig {
  type: string
  display_name: string
  icon: string
  category: DataSourceCategory
  fields: DataSourceField[]
  description?: string
}

export type DataSourceCategory = 
  | 'database'      // 관계형 데이터베이스
  | 'nosql'         // NoSQL 데이터베이스
  | 'datawarehouse' // 데이터 웨어하우스
  | 'api'           // REST API / GraphQL
  | 'saas'          // SaaS 플랫폼
  | 'file'          // 파일 기반
  | 'streaming'     // 스트리밍 / 메시지 큐
  | 'analytics'     // 분석 플랫폼
  | 'vector'        // 벡터 DB
  | 'other'         // 기타

export interface DataSource {
  name: string
  engine: string
  display_name?: string
  host?: string
  port?: number
  database?: string
  user?: string
  schema_count?: number
  tables?: string[]
  created_at?: string
  // 헬스 상태
  health?: HealthCheckResult
}

export interface HealthCheckResult {
  name: string
  status: 'healthy' | 'disconnected' | 'unknown' | 'not_found' | 'checking'
  message: string
  db_connected: boolean
  mindsdb_connected: boolean
}

export interface DataSourceSchema {
  name: string
  description?: string
  table_count?: number
}

export interface DataSourceTable {
  name: string
  description?: string
  schema?: string
  column_count?: number
}

export interface ExtractionProgress {
  phase: string
  message: string
  progress: number
  total_schemas: number
  processed_schemas: number
  total_tables: number
  processed_tables: number
  error?: string
}

// ============================================================================
// API 클라이언트
// ============================================================================

const API_BASE_URL = DATA_FABRIC_BASE_URL

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  // Neo4j override(X-Neo4j-*) 를 실어야 Electron 이 고른 DB 에 데이터소스가 등록된다.
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...useSessionStore().getHeaders(),
      ...options.headers,
    },
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(error.detail || 'API request failed')
  }
  
  return response.json()
}

const datasourcesApi = {
  getTypes: () => fetchApi<{ types: DataSourceTypeConfig[] }>('/api/datasources/types'),
  
  list: (source = 'neo4j') => 
    fetchApi<{ datasources: DataSource[] }>(`/api/datasources?source=${source}`),
  
  create: (data: { name: string; engine: string; parameters: Record<string, any> }, registerTo = 'both') =>
    fetchApi<DataSource>(`/api/datasources?register_to=${registerTo}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  get: (name: string, source = 'neo4j') =>
    fetchApi<DataSource>(`/api/datasources/${name}?source=${source}`),
  
  delete: (name: string, deleteFrom = 'neo4j') =>
    fetchApi<{ message: string }>(`/api/datasources/${name}?delete_from=${deleteFrom}`, {
      method: 'DELETE',
    }),
  
  getSchemas: (name: string) =>
    fetchApi<{ schemas: DataSourceSchema[] }>(`/api/datasources/${name}/schemas`),
  
  getTables: (name: string, schema?: string, source = 'neo4j') => {
    const params = new URLSearchParams({ source })
    if (schema) params.append('schema', schema)
    return fetchApi<{ tables: DataSourceTable[] }>(`/api/datasources/${name}/tables?${params}`)
  },
  
  testConnection: (name: string, source = 'mindsdb') =>
    fetchApi<{ success: boolean; message: string }>(`/api/datasources/${name}/test?source=${source}`, {
      method: 'POST',
    }),
  
  // 파라미터 기반 연결 테스트 (생성 전 사용)
  testConnectionWithParams: (params: { engine: string; host: string; port?: number; user?: string; password?: string; database?: string }) =>
    fetchApi<{ success: boolean; message: string }>(`/api/datasources/test-connection`, {
      method: 'POST',
      body: JSON.stringify(params),
    }),
  
  // 헬스체크 - 데이터소스 연결 상태 확인
  checkHealth: (name: string) =>
    fetchApi<HealthCheckResult>(`/api/datasources/${name}/health`),
  
  // 메타데이터 추출 (SSE 스트리밍) - 패스워드 필요 시 전달
  extractMetadata: (name: string, schemas?: string[], password?: string) => {
    const url = `${API_BASE_URL}/api/datasources/${name}/extract-metadata`
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...useSessionStore().getHeaders() },
      body: JSON.stringify({ schemas, password }),
    })
  },
  
  // 메타데이터 추출 (동기) - 패스워드 필요 시 전달
  extractMetadataSync: (name: string, schemas?: string[], password?: string) =>
    fetchApi<{ success: boolean; message: string; schemas: number; tables: number }>(
      `/api/datasources/${name}/extract-metadata-sync`,
      {
        method: 'POST',
        body: JSON.stringify({ schemas, password }),
      }
    ),
  
  // 지원하는 엔진 목록
  getSupportedEngines: () => fetchApi<{ engines: string[] }>('/api/datasources/supported-engines'),
}

// ============================================================================
// MindsDB 지원 데이터 소스 전체 목록
// ============================================================================

export function getAllDataSourceTypes(): DataSourceTypeConfig[] {
  return [
    // =========================================================================
    // 관계형 데이터베이스 (Relational Databases)
    // =========================================================================
    {
      type: 'postgres',
      display_name: 'PostgreSQL',
      icon: 'postgresql',
      category: 'database',
      description: '강력한 오픈소스 관계형 데이터베이스',
      fields: [
        { name: 'host', label: 'Host', type: 'text', required: true, default: 'localhost' },
        { name: 'port', label: 'Port', type: 'number', required: true, default: 5432 },
        { name: 'user', label: 'Username', type: 'text', required: true },
        { name: 'password', label: 'Password', type: 'password', required: true },
        { name: 'database', label: 'Database', type: 'text', required: true },
        { name: 'schema', label: 'Schema', type: 'text', required: false, default: '', placeholder: '비워두면 모든 스키마 접근' }
      ]
    },
    {
      type: 'mysql',
      display_name: 'MySQL',
      icon: 'mysql',
      category: 'database',
      description: '가장 인기있는 오픈소스 데이터베이스',
      fields: [
        { name: 'host', label: 'Host', type: 'text', required: true, default: 'localhost' },
        { name: 'port', label: 'Port', type: 'number', required: true, default: 3306 },
        { name: 'user', label: 'Username', type: 'text', required: true },
        { name: 'password', label: 'Password', type: 'password', required: true },
        { name: 'database', label: 'Database', type: 'text', required: true },
        { name: 'schema', label: 'Schema', type: 'text', required: false, default: '', placeholder: '비워두면 모든 스키마 접근' }
      ]
    },
    {
      type: 'mariadb',
      display_name: 'MariaDB',
      icon: 'mariadb',
      category: 'database',
      description: 'MySQL 호환 커뮤니티 개발 데이터베이스',
      fields: [
        { name: 'host', label: 'Host', type: 'text', required: true, default: 'localhost' },
        { name: 'port', label: 'Port', type: 'number', required: true, default: 3306 },
        { name: 'user', label: 'Username', type: 'text', required: true },
        { name: 'password', label: 'Password', type: 'password', required: true },
        { name: 'database', label: 'Database', type: 'text', required: true },
        { name: 'schema', label: 'Schema', type: 'text', required: false, default: '', placeholder: '비워두면 모든 스키마 접근' }
      ]
    },
    {
      type: 'mssql',
      display_name: 'SQL Server',
      icon: 'mssql',
      category: 'database',
      description: 'Microsoft SQL Server',
      fields: [
        { name: 'host', label: 'Host', type: 'text', required: true },
        { name: 'port', label: 'Port', type: 'number', required: true, default: 1433 },
        { name: 'user', label: 'Username', type: 'text', required: true },
        { name: 'password', label: 'Password', type: 'password', required: true },
        { name: 'database', label: 'Database', type: 'text', required: true }
      ]
    },
    {
      type: 'oracle',
      display_name: 'Oracle',
      icon: 'oracle',
      category: 'database',
      description: 'Oracle Database',
      fields: [
        { name: 'host', label: 'Host', type: 'text', required: true },
        { name: 'port', label: 'Port', type: 'number', required: true, default: 1521 },
        { name: 'user', label: 'Username', type: 'text', required: true },
        { name: 'password', label: 'Password', type: 'password', required: true },
        { name: 'sid', label: 'SID/Service Name', type: 'text', required: true }
      ]
    },
    {
      type: 'sqlite',
      display_name: 'SQLite',
      icon: 'sqlite',
      category: 'database',
      description: '경량 임베디드 데이터베이스',
      fields: [
        { name: 'db_file', label: 'Database File Path', type: 'text', required: true }
      ]
    },
    {
      type: 'cockroachdb',
      display_name: 'CockroachDB',
      icon: 'cockroachdb',
      category: 'database',
      description: '분산 SQL 데이터베이스',
      fields: [
        { name: 'host', label: 'Host', type: 'text', required: true },
        { name: 'port', label: 'Port', type: 'number', required: true, default: 26257 },
        { name: 'user', label: 'Username', type: 'text', required: true },
        { name: 'password', label: 'Password', type: 'password', required: true },
        { name: 'database', label: 'Database', type: 'text', required: true }
      ]
    },
    {
      type: 'tidb',
      display_name: 'TiDB',
      icon: 'tidb',
      category: 'database',
      description: 'MySQL 호환 분산 HTAP 데이터베이스',
      fields: [
        { name: 'host', label: 'Host', type: 'text', required: true },
        { name: 'port', label: 'Port', type: 'number', required: true, default: 4000 },
        { name: 'user', label: 'Username', type: 'text', required: true },
        { name: 'password', label: 'Password', type: 'password', required: true },
        { name: 'database', label: 'Database', type: 'text', required: true }
      ]
    },
    {
      type: 'singlestore',
      display_name: 'SingleStore',
      icon: 'singlestore',
      category: 'database',
      description: '실시간 분산 SQL 데이터베이스',
      fields: [
        { name: 'host', label: 'Host', type: 'text', required: true },
        { name: 'port', label: 'Port', type: 'number', required: true, default: 3306 },
        { name: 'user', label: 'Username', type: 'text', required: true },
        { name: 'password', label: 'Password', type: 'password', required: true },
        { name: 'database', label: 'Database', type: 'text', required: true }
      ]
    },
    {
      type: 'vitess',
      display_name: 'Vitess',
      icon: 'vitess',
      category: 'database',
      description: 'MySQL용 데이터베이스 클러스터링 시스템',
      fields: [
        { name: 'host', label: 'Host', type: 'text', required: true },
        { name: 'port', label: 'Port', type: 'number', required: true, default: 3306 },
        { name: 'user', label: 'Username', type: 'text', required: true },
        { name: 'password', label: 'Password', type: 'password', required: true },
        { name: 'database', label: 'Database', type: 'text', required: true }
      ]
    },

    // =========================================================================
    // NoSQL 데이터베이스
    // =========================================================================
    {
      type: 'mongodb',
      display_name: 'MongoDB',
      icon: 'mongodb',
      category: 'nosql',
      description: '도큐먼트 기반 NoSQL 데이터베이스',
      fields: [
        { name: 'host', label: 'Host', type: 'text', required: true, default: 'localhost' },
        { name: 'port', label: 'Port', type: 'number', required: true, default: 27017 },
        { name: 'user', label: 'Username', type: 'text', required: false },
        { name: 'password', label: 'Password', type: 'password', required: false },
        { name: 'database', label: 'Database', type: 'text', required: true }
      ]
    },
    {
      type: 'neo4j',
      display_name: 'Neo4j',
      icon: 'neo4j',
      category: 'nosql',
      description: '네이티브 그래프 데이터베이스',
      fields: [
        { name: 'host', label: 'Host', type: 'text', required: true, default: 'localhost' },
        { name: 'port', label: 'Port', type: 'number', required: true, default: 7687 },
        { name: 'user', label: 'Username', type: 'text', required: true, default: 'neo4j' },
        { name: 'password', label: 'Password', type: 'password', required: true }
      ]
    },
    {
      type: 'cassandra',
      display_name: 'Cassandra',
      icon: 'cassandra',
      category: 'nosql',
      description: '분산 NoSQL 데이터베이스',
      fields: [
        { name: 'host', label: 'Host', type: 'text', required: true },
        { name: 'port', label: 'Port', type: 'number', required: true, default: 9042 },
        { name: 'user', label: 'Username', type: 'text', required: false },
        { name: 'password', label: 'Password', type: 'password', required: false },
        { name: 'keyspace', label: 'Keyspace', type: 'text', required: true }
      ]
    },
    {
      type: 'scylladb',
      display_name: 'ScyllaDB',
      icon: 'scylladb',
      category: 'nosql',
      description: '고성능 Cassandra 호환 데이터베이스',
      fields: [
        { name: 'host', label: 'Host', type: 'text', required: true },
        { name: 'port', label: 'Port', type: 'number', required: true, default: 9042 },
        { name: 'user', label: 'Username', type: 'text', required: false },
        { name: 'password', label: 'Password', type: 'password', required: false },
        { name: 'keyspace', label: 'Keyspace', type: 'text', required: true }
      ]
    },
    {
      type: 'redis',
      display_name: 'Redis',
      icon: 'redis',
      category: 'nosql',
      description: '인메모리 키-밸류 스토어',
      fields: [
        { name: 'host', label: 'Host', type: 'text', required: true, default: 'localhost' },
        { name: 'port', label: 'Port', type: 'number', required: true, default: 6379 },
        { name: 'password', label: 'Password', type: 'password', required: false },
        { name: 'database', label: 'Database Index', type: 'number', required: false, default: 0 }
      ]
    },
    {
      type: 'couchbase',
      display_name: 'Couchbase',
      icon: 'couchbase',
      category: 'nosql',
      description: '분산 도큐먼트 데이터베이스',
      fields: [
        { name: 'host', label: 'Host', type: 'text', required: true },
        { name: 'port', label: 'Port', type: 'number', required: true, default: 8091 },
        { name: 'user', label: 'Username', type: 'text', required: true },
        { name: 'password', label: 'Password', type: 'password', required: true },
        { name: 'bucket', label: 'Bucket', type: 'text', required: true }
      ]
    },
    {
      type: 'dynamodb',
      display_name: 'DynamoDB',
      icon: 'dynamodb',
      category: 'nosql',
      description: 'AWS 관리형 NoSQL 데이터베이스',
      fields: [
        { name: 'aws_access_key', label: 'AWS Access Key', type: 'text', required: true },
        { name: 'aws_secret_key', label: 'AWS Secret Key', type: 'password', required: true },
        { name: 'region', label: 'Region', type: 'text', required: true, default: 'us-east-1' }
      ]
    },
    {
      type: 'arangodb',
      display_name: 'ArangoDB',
      icon: 'arangodb',
      category: 'nosql',
      description: '멀티모델 그래프 데이터베이스',
      fields: [
        { name: 'host', label: 'Host', type: 'text', required: true },
        { name: 'port', label: 'Port', type: 'number', required: true, default: 8529 },
        { name: 'user', label: 'Username', type: 'text', required: true },
        { name: 'password', label: 'Password', type: 'password', required: true },
        { name: 'database', label: 'Database', type: 'text', required: true }
      ]
    },

    // =========================================================================
    // 데이터 웨어하우스 / OLAP
    // =========================================================================
    {
      type: 'snowflake',
      display_name: 'Snowflake',
      icon: 'snowflake',
      category: 'datawarehouse',
      description: '클라우드 데이터 웨어하우스',
      fields: [
        { name: 'account', label: 'Account', type: 'text', required: true },
        { name: 'user', label: 'Username', type: 'text', required: true },
        { name: 'password', label: 'Password', type: 'password', required: true },
        { name: 'warehouse', label: 'Warehouse', type: 'text', required: true },
        { name: 'database', label: 'Database', type: 'text', required: true },
        { name: 'schema', label: 'Schema', type: 'text', required: false, default: '', placeholder: '비워두면 모든 스키마 접근' }
      ]
    },
    {
      type: 'bigquery',
      display_name: 'BigQuery',
      icon: 'bigquery',
      category: 'datawarehouse',
      description: 'Google Cloud 데이터 웨어하우스',
      fields: [
        { name: 'project_id', label: 'Project ID', type: 'text', required: true },
        { name: 'dataset', label: 'Dataset', type: 'text', required: true },
        { name: 'service_account_json', label: 'Service Account JSON', type: 'text', required: true }
      ]
    },
    {
      type: 'redshift',
      display_name: 'Amazon Redshift',
      icon: 'redshift',
      category: 'datawarehouse',
      description: 'AWS 데이터 웨어하우스',
      fields: [
        { name: 'host', label: 'Cluster Endpoint', type: 'text', required: true },
        { name: 'port', label: 'Port', type: 'number', required: true, default: 5439 },
        { name: 'user', label: 'Username', type: 'text', required: true },
        { name: 'password', label: 'Password', type: 'password', required: true },
        { name: 'database', label: 'Database', type: 'text', required: true }
      ]
    },
    {
      type: 'clickhouse',
      display_name: 'ClickHouse',
      icon: 'clickhouse',
      category: 'datawarehouse',
      description: '컬럼 기반 OLAP 데이터베이스',
      fields: [
        { name: 'host', label: 'Host', type: 'text', required: true },
        { name: 'port', label: 'HTTP Port', type: 'number', required: true, default: 8123 },
        { name: 'user', label: 'Username', type: 'text', required: false, default: 'default' },
        { name: 'password', label: 'Password', type: 'password', required: false },
        { name: 'database', label: 'Database', type: 'text', required: true }
      ]
    },
    {
      type: 'databricks',
      display_name: 'Databricks',
      icon: 'databricks',
      category: 'datawarehouse',
      description: '통합 데이터 분석 플랫폼',
      fields: [
        { name: 'host', label: 'Workspace URL', type: 'text', required: true },
        { name: 'token', label: 'Access Token', type: 'password', required: true },
        { name: 'http_path', label: 'HTTP Path', type: 'text', required: true },
        { name: 'catalog', label: 'Catalog', type: 'text', required: false },
        { name: 'schema', label: 'Schema', type: 'text', required: false }
      ]
    },
    {
      type: 'duckdb',
      display_name: 'DuckDB',
      icon: 'duckdb',
      category: 'datawarehouse',
      description: '임베디드 분석용 데이터베이스',
      fields: [
        { name: 'db_file', label: 'Database File Path', type: 'text', required: false }
      ]
    },
    {
      type: 'trino',
      display_name: 'Trino',
      icon: 'trino',
      category: 'datawarehouse',
      description: '분산 SQL 쿼리 엔진 (구 PrestoSQL)',
      fields: [
        { name: 'host', label: 'Coordinator Host', type: 'text', required: true },
        { name: 'port', label: 'Port', type: 'number', required: true, default: 8080 },
        { name: 'user', label: 'Username', type: 'text', required: true },
        { name: 'catalog', label: 'Catalog', type: 'text', required: true },
        { name: 'schema', label: 'Schema', type: 'text', required: false }
      ]
    },
    {
      type: 'presto',
      display_name: 'Presto',
      icon: 'presto',
      category: 'datawarehouse',
      description: '분산 SQL 쿼리 엔진',
      fields: [
        { name: 'host', label: 'Coordinator Host', type: 'text', required: true },
        { name: 'port', label: 'Port', type: 'number', required: true, default: 8080 },
        { name: 'user', label: 'Username', type: 'text', required: true },
        { name: 'catalog', label: 'Catalog', type: 'text', required: true },
        { name: 'schema', label: 'Schema', type: 'text', required: false }
      ]
    },
    {
      type: 'athena',
      display_name: 'Amazon Athena',
      icon: 'athena',
      category: 'datawarehouse',
      description: 'AWS 서버리스 쿼리 서비스',
      fields: [
        { name: 'aws_access_key', label: 'AWS Access Key', type: 'text', required: true },
        { name: 'aws_secret_key', label: 'AWS Secret Key', type: 'password', required: true },
        { name: 'region', label: 'Region', type: 'text', required: true, default: 'us-east-1' },
        { name: 's3_output_location', label: 'S3 Output Location', type: 'text', required: true },
        { name: 'database', label: 'Database', type: 'text', required: true }
      ]
    },
    {
      type: 'druid',
      display_name: 'Apache Druid',
      icon: 'druid',
      category: 'datawarehouse',
      description: '실시간 분석 데이터베이스',
      fields: [
        { name: 'host', label: 'Router Host', type: 'text', required: true },
        { name: 'port', label: 'Port', type: 'number', required: true, default: 8888 }
      ]
    },
    {
      type: 'vertica',
      display_name: 'Vertica',
      icon: 'vertica',
      category: 'datawarehouse',
      description: '분석 데이터 플랫폼',
      fields: [
        { name: 'host', label: 'Host', type: 'text', required: true },
        { name: 'port', label: 'Port', type: 'number', required: true, default: 5433 },
        { name: 'user', label: 'Username', type: 'text', required: true },
        { name: 'password', label: 'Password', type: 'password', required: true },
        { name: 'database', label: 'Database', type: 'text', required: true }
      ]
    },
    {
      type: 'teradata',
      display_name: 'Teradata',
      icon: 'teradata',
      category: 'datawarehouse',
      description: '엔터프라이즈 데이터 웨어하우스',
      fields: [
        { name: 'host', label: 'Host', type: 'text', required: true },
        { name: 'user', label: 'Username', type: 'text', required: true },
        { name: 'password', label: 'Password', type: 'password', required: true },
        { name: 'database', label: 'Database', type: 'text', required: true }
      ]
    },
    {
      type: 'starrocks',
      display_name: 'StarRocks',
      icon: 'starrocks',
      category: 'datawarehouse',
      description: '차세대 OLAP 데이터베이스',
      fields: [
        { name: 'host', label: 'Host', type: 'text', required: true },
        { name: 'port', label: 'Port', type: 'number', required: true, default: 9030 },
        { name: 'user', label: 'Username', type: 'text', required: true },
        { name: 'password', label: 'Password', type: 'password', required: true },
        { name: 'database', label: 'Database', type: 'text', required: true }
      ]
    },
    {
      type: 'doris',
      display_name: 'Apache Doris',
      icon: 'doris',
      category: 'datawarehouse',
      description: '실시간 분석 데이터 웨어하우스',
      fields: [
        { name: 'host', label: 'Host', type: 'text', required: true },
        { name: 'port', label: 'Port', type: 'number', required: true, default: 9030 },
        { name: 'user', label: 'Username', type: 'text', required: true },
        { name: 'password', label: 'Password', type: 'password', required: true },
        { name: 'database', label: 'Database', type: 'text', required: true }
      ]
    },

    // =========================================================================
    // API / GraphQL
    // =========================================================================
    {
      type: 'rest_api',
      display_name: 'REST API',
      icon: 'api',
      category: 'api',
      description: 'RESTful API 엔드포인트',
      fields: [
        { name: 'url', label: 'Base URL', type: 'text', required: true },
        { name: 'api_key', label: 'API Key', type: 'password', required: false },
        { name: 'headers', label: 'Custom Headers (JSON)', type: 'text', required: false }
      ]
    },
    {
      type: 'graphql',
      display_name: 'GraphQL',
      icon: 'graphql',
      category: 'api',
      description: 'GraphQL API 엔드포인트',
      fields: [
        { name: 'url', label: 'GraphQL Endpoint', type: 'text', required: true },
        { name: 'api_key', label: 'API Key', type: 'password', required: false },
        { name: 'headers', label: 'Custom Headers (JSON)', type: 'text', required: false }
      ]
    },
    {
      type: 'odata',
      display_name: 'OData',
      icon: 'odata',
      category: 'api',
      description: 'OData 프로토콜 API',
      fields: [
        { name: 'url', label: 'Service URL', type: 'text', required: true },
        { name: 'user', label: 'Username', type: 'text', required: false },
        { name: 'password', label: 'Password', type: 'password', required: false }
      ]
    },

    // =========================================================================
    // SaaS / 비즈니스 플랫폼
    // =========================================================================
    {
      type: 'stripe',
      display_name: 'Stripe',
      icon: 'stripe',
      category: 'saas',
      description: '결제 플랫폼',
      fields: [
        { name: 'api_key', label: 'API Key', type: 'password', required: true }
      ]
    },
    {
      type: 'shopify',
      display_name: 'Shopify',
      icon: 'shopify',
      category: 'saas',
      description: '이커머스 플랫폼',
      fields: [
        { name: 'shop_url', label: 'Shop URL', type: 'text', required: true },
        { name: 'access_token', label: 'Access Token', type: 'password', required: true }
      ]
    },
    {
      type: 'salesforce',
      display_name: 'Salesforce',
      icon: 'salesforce',
      category: 'saas',
      description: 'CRM 플랫폼',
      fields: [
        { name: 'username', label: 'Username', type: 'text', required: true },
        { name: 'password', label: 'Password', type: 'password', required: true },
        { name: 'security_token', label: 'Security Token', type: 'password', required: true }
      ]
    },
    {
      type: 'hubspot',
      display_name: 'HubSpot',
      icon: 'hubspot',
      category: 'saas',
      description: '마케팅/영업 플랫폼',
      fields: [
        { name: 'api_key', label: 'API Key', type: 'password', required: true }
      ]
    },
    {
      type: 'zendesk',
      display_name: 'Zendesk',
      icon: 'zendesk',
      category: 'saas',
      description: '고객 지원 플랫폼',
      fields: [
        { name: 'subdomain', label: 'Subdomain', type: 'text', required: true },
        { name: 'email', label: 'Email', type: 'text', required: true },
        { name: 'api_token', label: 'API Token', type: 'password', required: true }
      ]
    },
    {
      type: 'slack',
      display_name: 'Slack',
      icon: 'slack',
      category: 'saas',
      description: '팀 커뮤니케이션 플랫폼',
      fields: [
        { name: 'bot_token', label: 'Bot Token', type: 'password', required: true }
      ]
    },
    {
      type: 'github',
      display_name: 'GitHub',
      icon: 'github',
      category: 'saas',
      description: '코드 저장소 플랫폼',
      fields: [
        { name: 'access_token', label: 'Personal Access Token', type: 'password', required: true },
        { name: 'repository', label: 'Repository (owner/repo)', type: 'text', required: false }
      ]
    },
    {
      type: 'jira',
      display_name: 'Jira',
      icon: 'jira',
      category: 'saas',
      description: '프로젝트 관리 플랫폼',
      fields: [
        { name: 'url', label: 'Jira URL', type: 'text', required: true },
        { name: 'email', label: 'Email', type: 'text', required: true },
        { name: 'api_token', label: 'API Token', type: 'password', required: true }
      ]
    },
    {
      type: 'notion',
      display_name: 'Notion',
      icon: 'notion',
      category: 'saas',
      description: '협업 도구',
      fields: [
        { name: 'integration_token', label: 'Integration Token', type: 'password', required: true }
      ]
    },
    {
      type: 'airtable',
      display_name: 'Airtable',
      icon: 'airtable',
      category: 'saas',
      description: '스프레드시트 데이터베이스',
      fields: [
        { name: 'api_key', label: 'API Key', type: 'password', required: true },
        { name: 'base_id', label: 'Base ID', type: 'text', required: true }
      ]
    },
    {
      type: 'google_analytics',
      display_name: 'Google Analytics',
      icon: 'google_analytics',
      category: 'saas',
      description: '웹 분석 플랫폼',
      fields: [
        { name: 'property_id', label: 'Property ID', type: 'text', required: true },
        { name: 'service_account_json', label: 'Service Account JSON', type: 'text', required: true }
      ]
    },
    {
      type: 'google_sheets',
      display_name: 'Google Sheets',
      icon: 'google_sheets',
      category: 'saas',
      description: '클라우드 스프레드시트',
      fields: [
        { name: 'spreadsheet_id', label: 'Spreadsheet ID', type: 'text', required: true },
        { name: 'service_account_json', label: 'Service Account JSON', type: 'text', required: true }
      ]
    },
    {
      type: 'twitter',
      display_name: 'Twitter/X',
      icon: 'twitter',
      category: 'saas',
      description: '소셜 미디어 플랫폼',
      fields: [
        { name: 'bearer_token', label: 'Bearer Token', type: 'password', required: true }
      ]
    },
    {
      type: 'youtube',
      display_name: 'YouTube',
      icon: 'youtube',
      category: 'saas',
      description: '동영상 플랫폼',
      fields: [
        { name: 'api_key', label: 'API Key', type: 'password', required: true }
      ]
    },

    // =========================================================================
    // 파일 기반 데이터 소스
    // =========================================================================
    {
      type: 's3',
      display_name: 'Amazon S3',
      icon: 's3',
      category: 'file',
      description: 'AWS 객체 스토리지',
      fields: [
        { name: 'aws_access_key', label: 'AWS Access Key', type: 'text', required: true },
        { name: 'aws_secret_key', label: 'AWS Secret Key', type: 'password', required: true },
        { name: 'bucket', label: 'Bucket Name', type: 'text', required: true },
        { name: 'region', label: 'Region', type: 'text', required: false, default: 'us-east-1' }
      ]
    },
    {
      type: 'gcs',
      display_name: 'Google Cloud Storage',
      icon: 'gcs',
      category: 'file',
      description: 'GCP 객체 스토리지',
      fields: [
        { name: 'bucket', label: 'Bucket Name', type: 'text', required: true },
        { name: 'service_account_json', label: 'Service Account JSON', type: 'text', required: true }
      ]
    },
    {
      type: 'azure_blob',
      display_name: 'Azure Blob Storage',
      icon: 'azure_blob',
      category: 'file',
      description: 'Azure 객체 스토리지',
      fields: [
        { name: 'account_name', label: 'Storage Account Name', type: 'text', required: true },
        { name: 'account_key', label: 'Account Key', type: 'password', required: true },
        { name: 'container', label: 'Container Name', type: 'text', required: true }
      ]
    },
    {
      type: 'hdfs',
      display_name: 'HDFS',
      icon: 'hdfs',
      category: 'file',
      description: 'Hadoop 분산 파일 시스템',
      fields: [
        { name: 'host', label: 'NameNode Host', type: 'text', required: true },
        { name: 'port', label: 'Port', type: 'number', required: true, default: 9000 },
        { name: 'user', label: 'Username', type: 'text', required: false }
      ]
    },
    {
      type: 'minio',
      display_name: 'MinIO',
      icon: 'minio',
      category: 'file',
      description: 'S3 호환 객체 스토리지',
      fields: [
        { name: 'endpoint', label: 'Endpoint URL', type: 'text', required: true },
        { name: 'access_key', label: 'Access Key', type: 'text', required: true },
        { name: 'secret_key', label: 'Secret Key', type: 'password', required: true },
        { name: 'bucket', label: 'Bucket Name', type: 'text', required: true }
      ]
    },
    {
      type: 'ftp',
      display_name: 'FTP/SFTP',
      icon: 'ftp',
      category: 'file',
      description: '파일 전송 프로토콜',
      fields: [
        { name: 'host', label: 'Host', type: 'text', required: true },
        { name: 'port', label: 'Port', type: 'number', required: true, default: 22 },
        { name: 'user', label: 'Username', type: 'text', required: true },
        { name: 'password', label: 'Password', type: 'password', required: true },
        { name: 'path', label: 'Base Path', type: 'text', required: false }
      ]
    },
    {
      type: 'sharepoint',
      display_name: 'SharePoint',
      icon: 'sharepoint',
      category: 'file',
      description: 'Microsoft SharePoint',
      fields: [
        { name: 'site_url', label: 'Site URL', type: 'text', required: true },
        { name: 'client_id', label: 'Client ID', type: 'text', required: true },
        { name: 'client_secret', label: 'Client Secret', type: 'password', required: true }
      ]
    },

    // =========================================================================
    // 스트리밍 / 메시지 큐
    // =========================================================================
    {
      type: 'kafka',
      display_name: 'Apache Kafka',
      icon: 'kafka',
      category: 'streaming',
      description: '분산 이벤트 스트리밍 플랫폼',
      fields: [
        { name: 'bootstrap_servers', label: 'Bootstrap Servers', type: 'text', required: true },
        { name: 'topic', label: 'Topic', type: 'text', required: true },
        { name: 'group_id', label: 'Consumer Group ID', type: 'text', required: false }
      ]
    },
    {
      type: 'pulsar',
      display_name: 'Apache Pulsar',
      icon: 'pulsar',
      category: 'streaming',
      description: '분산 메시징 스트리밍 플랫폼',
      fields: [
        { name: 'service_url', label: 'Service URL', type: 'text', required: true },
        { name: 'topic', label: 'Topic', type: 'text', required: true }
      ]
    },
    {
      type: 'rabbitmq',
      display_name: 'RabbitMQ',
      icon: 'rabbitmq',
      category: 'streaming',
      description: '메시지 브로커',
      fields: [
        { name: 'host', label: 'Host', type: 'text', required: true },
        { name: 'port', label: 'Port', type: 'number', required: true, default: 5672 },
        { name: 'user', label: 'Username', type: 'text', required: true, default: 'guest' },
        { name: 'password', label: 'Password', type: 'password', required: true },
        { name: 'virtual_host', label: 'Virtual Host', type: 'text', required: false, default: '/' }
      ]
    },
    {
      type: 'kinesis',
      display_name: 'Amazon Kinesis',
      icon: 'kinesis',
      category: 'streaming',
      description: 'AWS 실시간 데이터 스트리밍',
      fields: [
        { name: 'aws_access_key', label: 'AWS Access Key', type: 'text', required: true },
        { name: 'aws_secret_key', label: 'AWS Secret Key', type: 'password', required: true },
        { name: 'stream_name', label: 'Stream Name', type: 'text', required: true },
        { name: 'region', label: 'Region', type: 'text', required: true, default: 'us-east-1' }
      ]
    },
    {
      type: 'nats',
      display_name: 'NATS',
      icon: 'nats',
      category: 'streaming',
      description: '고성능 메시징 시스템',
      fields: [
        { name: 'servers', label: 'Server URLs', type: 'text', required: true },
        { name: 'user', label: 'Username', type: 'text', required: false },
        { name: 'password', label: 'Password', type: 'password', required: false }
      ]
    },

    // =========================================================================
    // 검색 / 분석 엔진
    // =========================================================================
    {
      type: 'elasticsearch',
      display_name: 'Elasticsearch',
      icon: 'elasticsearch',
      category: 'analytics',
      description: '분산 검색 및 분석 엔진',
      fields: [
        { name: 'hosts', label: 'Hosts (comma separated)', type: 'text', required: true },
        { name: 'user', label: 'Username', type: 'text', required: false },
        { name: 'password', label: 'Password', type: 'password', required: false },
        { name: 'index', label: 'Index Pattern', type: 'text', required: false }
      ]
    },
    {
      type: 'opensearch',
      display_name: 'OpenSearch',
      icon: 'opensearch',
      category: 'analytics',
      description: 'AWS 관리형 Elasticsearch',
      fields: [
        { name: 'hosts', label: 'Hosts (comma separated)', type: 'text', required: true },
        { name: 'user', label: 'Username', type: 'text', required: false },
        { name: 'password', label: 'Password', type: 'password', required: false }
      ]
    },
    {
      type: 'solr',
      display_name: 'Apache Solr',
      icon: 'solr',
      category: 'analytics',
      description: '엔터프라이즈 검색 플랫폼',
      fields: [
        { name: 'url', label: 'Solr URL', type: 'text', required: true },
        { name: 'collection', label: 'Collection', type: 'text', required: true }
      ]
    },
    {
      type: 'splunk',
      display_name: 'Splunk',
      icon: 'splunk',
      category: 'analytics',
      description: '로그 분석 플랫폼',
      fields: [
        { name: 'host', label: 'Host', type: 'text', required: true },
        { name: 'port', label: 'Port', type: 'number', required: true, default: 8089 },
        { name: 'username', label: 'Username', type: 'text', required: true },
        { name: 'password', label: 'Password', type: 'password', required: true }
      ]
    },
    {
      type: 'prometheus',
      display_name: 'Prometheus',
      icon: 'prometheus',
      category: 'analytics',
      description: '모니터링 시스템 및 시계열 DB',
      fields: [
        { name: 'url', label: 'Prometheus URL', type: 'text', required: true }
      ]
    },
    {
      type: 'influxdb',
      display_name: 'InfluxDB',
      icon: 'influxdb',
      category: 'analytics',
      description: '시계열 데이터베이스',
      fields: [
        { name: 'host', label: 'Host', type: 'text', required: true },
        { name: 'port', label: 'Port', type: 'number', required: true, default: 8086 },
        { name: 'token', label: 'API Token', type: 'password', required: true },
        { name: 'org', label: 'Organization', type: 'text', required: true },
        { name: 'bucket', label: 'Bucket', type: 'text', required: true }
      ]
    },
    {
      type: 'timescaledb',
      display_name: 'TimescaleDB',
      icon: 'timescaledb',
      category: 'analytics',
      description: 'PostgreSQL 기반 시계열 DB',
      fields: [
        { name: 'host', label: 'Host', type: 'text', required: true },
        { name: 'port', label: 'Port', type: 'number', required: true, default: 5432 },
        { name: 'user', label: 'Username', type: 'text', required: true },
        { name: 'password', label: 'Password', type: 'password', required: true },
        { name: 'database', label: 'Database', type: 'text', required: true }
      ]
    },
    {
      type: 'questdb',
      display_name: 'QuestDB',
      icon: 'questdb',
      category: 'analytics',
      description: '고성능 시계열 데이터베이스',
      fields: [
        { name: 'host', label: 'Host', type: 'text', required: true },
        { name: 'port', label: 'Port', type: 'number', required: true, default: 8812 },
        { name: 'user', label: 'Username', type: 'text', required: false, default: 'admin' },
        { name: 'password', label: 'Password', type: 'password', required: false }
      ]
    },

    // =========================================================================
    // 벡터 데이터베이스
    // =========================================================================
    {
      type: 'pinecone',
      display_name: 'Pinecone',
      icon: 'pinecone',
      category: 'vector',
      description: '관리형 벡터 데이터베이스',
      fields: [
        { name: 'api_key', label: 'API Key', type: 'password', required: true },
        { name: 'environment', label: 'Environment', type: 'text', required: true },
        { name: 'index', label: 'Index Name', type: 'text', required: true }
      ]
    },
    {
      type: 'milvus',
      display_name: 'Milvus',
      icon: 'milvus',
      category: 'vector',
      description: '오픈소스 벡터 데이터베이스',
      fields: [
        { name: 'host', label: 'Host', type: 'text', required: true },
        { name: 'port', label: 'Port', type: 'number', required: true, default: 19530 },
        { name: 'user', label: 'Username', type: 'text', required: false },
        { name: 'password', label: 'Password', type: 'password', required: false }
      ]
    },
    {
      type: 'weaviate',
      display_name: 'Weaviate',
      icon: 'weaviate',
      category: 'vector',
      description: '오픈소스 벡터 검색 엔진',
      fields: [
        { name: 'url', label: 'Weaviate URL', type: 'text', required: true },
        { name: 'api_key', label: 'API Key', type: 'password', required: false }
      ]
    },
    {
      type: 'qdrant',
      display_name: 'Qdrant',
      icon: 'qdrant',
      category: 'vector',
      description: '벡터 유사성 검색 엔진',
      fields: [
        { name: 'host', label: 'Host', type: 'text', required: true },
        { name: 'port', label: 'Port', type: 'number', required: true, default: 6333 },
        { name: 'api_key', label: 'API Key', type: 'password', required: false }
      ]
    },
    {
      type: 'chroma',
      display_name: 'ChromaDB',
      icon: 'chroma',
      category: 'vector',
      description: 'AI 네이티브 임베딩 DB',
      fields: [
        { name: 'host', label: 'Host', type: 'text', required: true, default: 'localhost' },
        { name: 'port', label: 'Port', type: 'number', required: true, default: 8000 }
      ]
    },
    {
      type: 'pgvector',
      display_name: 'pgvector',
      icon: 'pgvector',
      category: 'vector',
      description: 'PostgreSQL 벡터 확장',
      fields: [
        { name: 'host', label: 'Host', type: 'text', required: true },
        { name: 'port', label: 'Port', type: 'number', required: true, default: 5432 },
        { name: 'user', label: 'Username', type: 'text', required: true },
        { name: 'password', label: 'Password', type: 'password', required: true },
        { name: 'database', label: 'Database', type: 'text', required: true }
      ]
    },

    // =========================================================================
    // 기타 / 특수 데이터 소스
    // =========================================================================
    {
      type: 'factordb',
      display_name: 'FactorDB',
      icon: 'factordb',
      category: 'other',
      description: '금융 데이터 팩터 데이터베이스',
      fields: [
        { name: 'api_key', label: 'API Key', type: 'password', required: true }
      ]
    },
    {
      type: 'binance',
      display_name: 'Binance',
      icon: 'binance',
      category: 'other',
      description: '암호화폐 거래소 API',
      fields: [
        { name: 'api_key', label: 'API Key', type: 'password', required: true },
        { name: 'api_secret', label: 'API Secret', type: 'password', required: true }
      ]
    },
    {
      type: 'coinbase',
      display_name: 'Coinbase',
      icon: 'coinbase',
      category: 'other',
      description: '암호화폐 거래소 API',
      fields: [
        { name: 'api_key', label: 'API Key', type: 'password', required: true },
        { name: 'api_secret', label: 'API Secret', type: 'password', required: true }
      ]
    },
    {
      type: 'plaid',
      display_name: 'Plaid',
      icon: 'plaid',
      category: 'other',
      description: '금융 데이터 연결 플랫폼',
      fields: [
        { name: 'client_id', label: 'Client ID', type: 'text', required: true },
        { name: 'secret', label: 'Secret', type: 'password', required: true },
        { name: 'access_token', label: 'Access Token', type: 'password', required: true }
      ]
    },
    {
      type: 'email',
      display_name: 'Email (IMAP)',
      icon: 'email',
      category: 'other',
      description: '이메일 수신함 연결',
      fields: [
        { name: 'host', label: 'IMAP Host', type: 'text', required: true },
        { name: 'port', label: 'Port', type: 'number', required: true, default: 993 },
        { name: 'email', label: 'Email', type: 'text', required: true },
        { name: 'password', label: 'Password', type: 'password', required: true }
      ]
    },
    {
      type: 'web_scraper',
      display_name: 'Web Scraper',
      icon: 'web',
      category: 'other',
      description: '웹 페이지 데이터 수집',
      fields: [
        { name: 'url', label: 'Target URL', type: 'text', required: true },
        { name: 'selector', label: 'CSS Selector', type: 'text', required: false }
      ]
    },
    {
      type: 'pdf',
      display_name: 'PDF',
      icon: 'pdf',
      category: 'other',
      description: 'PDF 문서 데이터 추출',
      fields: [
        { name: 'file_path', label: 'File Path or URL', type: 'text', required: true }
      ]
    },
    {
      type: 'rss',
      display_name: 'RSS/Atom Feed',
      icon: 'rss',
      category: 'other',
      description: 'RSS/Atom 피드 구독',
      fields: [
        { name: 'feed_url', label: 'Feed URL', type: 'text', required: true }
      ]
    },
    {
      type: 'weather',
      display_name: 'Weather API',
      icon: 'weather',
      category: 'other',
      description: '날씨 데이터 API',
      fields: [
        { name: 'api_key', label: 'API Key', type: 'password', required: true },
        { name: 'location', label: 'Location', type: 'text', required: false }
      ]
    },
    {
      type: 'openai',
      display_name: 'OpenAI',
      icon: 'openai',
      category: 'other',
      description: 'OpenAI API 연결',
      fields: [
        { name: 'api_key', label: 'API Key', type: 'password', required: true },
        { name: 'model', label: 'Model', type: 'text', required: false, default: 'gpt-4' }
      ]
    },
    {
      type: 'anthropic',
      display_name: 'Anthropic',
      icon: 'anthropic',
      category: 'other',
      description: 'Anthropic Claude API',
      fields: [
        { name: 'api_key', label: 'API Key', type: 'password', required: true },
        { name: 'model', label: 'Model', type: 'text', required: false, default: 'claude-3-opus' }
      ]
    },
    {
      type: 'huggingface',
      display_name: 'Hugging Face',
      icon: 'huggingface',
      category: 'other',
      description: 'Hugging Face Hub 연결',
      fields: [
        { name: 'api_token', label: 'API Token', type: 'password', required: true },
        { name: 'model_id', label: 'Model ID', type: 'text', required: false }
      ]
    },
  ]
}

// ============================================================================
// 스토어 정의
// ============================================================================

export const useDatasourcesStore = defineStore('datasources', () => {
  // State
  const datasources = ref<DataSource[]>([])
  const datasourceTypes = ref<DataSourceTypeConfig[]>([])
  const selectedDatasource = ref<DataSource | null>(null)
  const schemas = ref<DataSourceSchema[]>([])
  const selectedSchema = ref<DataSourceSchema | null>(null)
  const tables = ref<DataSourceTable[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Getters
  const hasDatasources = computed(() => datasources.value.length > 0)
  const sortedDatasources = computed(() => 
    [...datasources.value].sort((a, b) => a.name.localeCompare(b.name))
  )
  
  // Category-based grouping
  const typesByCategory = computed(() => {
    const types = datasourceTypes.value.length > 0 
      ? datasourceTypes.value 
      : getAllDataSourceTypes()
    
    const grouped: Record<DataSourceCategory, DataSourceTypeConfig[]> = {
      database: [],
      nosql: [],
      datawarehouse: [],
      api: [],
      saas: [],
      file: [],
      streaming: [],
      analytics: [],
      vector: [],
      other: []
    }
    
    types.forEach(type => {
      const category = type.category || 'other'
      if (grouped[category]) {
        grouped[category].push(type)
      } else {
        grouped.other.push(type)
      }
    })
    
    return grouped
  })
  
  const categoryLabels: Record<DataSourceCategory, string> = {
    database: '관계형 데이터베이스',
    nosql: 'NoSQL 데이터베이스',
    datawarehouse: '데이터 웨어하우스',
    api: 'API / GraphQL',
    saas: 'SaaS 플랫폼',
    file: '파일 스토리지',
    streaming: '스트리밍 / 메시지 큐',
    analytics: '분석 / 검색',
    vector: '벡터 데이터베이스',
    other: '기타'
  }

  // Actions
  async function fetchTypes() {
    try {
      const response = await datasourcesApi.getTypes()
      datasourceTypes.value = response.types
    } catch (e: any) {
      console.error('Failed to fetch data source types:', e)
      // 기본 타입 설정 (전체 목록)
      datasourceTypes.value = getAllDataSourceTypes()
    }
  }

  async function fetchDatasources() {
    loading.value = true
    error.value = null
    try {
      const response = await datasourcesApi.list()
      datasources.value = response.datasources
    } catch (e: any) {
      error.value = e.message || 'Failed to fetch data sources'
      datasources.value = []
    } finally {
      loading.value = false
    }
  }
  
  async function checkHealth(name: string): Promise<HealthCheckResult> {
    try {
      const result = await datasourcesApi.checkHealth(name)
      // 해당 데이터소스에 헬스 정보 업데이트
      const ds = datasources.value.find(d => d.name === name)
      if (ds) {
        ds.health = result
      }
      return result
    } catch (e: any) {
      return {
        name,
        status: 'unknown',
        message: e.message || 'Health check failed',
        db_connected: false,
        mindsdb_connected: false
      }
    }
  }
  
  async function checkAllHealth() {
    // 모든 데이터소스의 헬스 체크를 병렬로 실행
    const promises = datasources.value.map(ds => checkHealth(ds.name))
    await Promise.all(promises)
  }

  async function createDatasource(
    name: string, 
    engine: string, 
    parameters: Record<string, any>,
    registerTo = 'both'
  ): Promise<boolean> {
    loading.value = true
    error.value = null
    try {
      const newDatasource = await datasourcesApi.create({ name, engine, parameters }, registerTo)
      datasources.value.push(newDatasource)
      return true
    } catch (e: any) {
      error.value = e.message || 'Failed to create data source'
      return false
    } finally {
      loading.value = false
    }
  }

  async function deleteDatasource(name: string): Promise<boolean> {
    loading.value = true
    error.value = null
    try {
      await datasourcesApi.delete(name)
      datasources.value = datasources.value.filter(ds => ds.name !== name)
      if (selectedDatasource.value?.name === name) {
        selectedDatasource.value = null
        schemas.value = []
        tables.value = []
      }
      return true
    } catch (e: any) {
      error.value = e.message || 'Failed to delete data source'
      return false
    } finally {
      loading.value = false
    }
  }

  async function selectDatasource(datasource: DataSource) {
    selectedDatasource.value = datasource
    selectedSchema.value = null
    tables.value = []
    await fetchSchemas(datasource.name)
  }

  async function fetchSchemas(datasourceName: string) {
    loading.value = true
    error.value = null
    try {
      const response = await datasourcesApi.getSchemas(datasourceName)
      schemas.value = response.schemas
    } catch (e: any) {
      error.value = e.message || 'Failed to fetch schemas'
      schemas.value = []
    } finally {
      loading.value = false
    }
  }

  async function selectSchema(schema: DataSourceSchema) {
    if (!selectedDatasource.value) return
    
    selectedSchema.value = schema
    loading.value = true
    error.value = null
    
    try {
      const response = await datasourcesApi.getTables(
        selectedDatasource.value.name, 
        schema.name
      )
      tables.value = response.tables
    } catch (e: any) {
      error.value = e.message || 'Failed to fetch tables'
      tables.value = []
    } finally {
      loading.value = false
    }
  }

  async function testConnection(name: string): Promise<{ success: boolean; message: string }> {
    try {
      return await datasourcesApi.testConnection(name)
    } catch (e: any) {
      return { success: false, message: e.message || 'Connection test failed' }
    }
  }

  async function testConnectionWithParams(params: { engine: string; host: string; port?: number; user?: string; password?: string; database?: string }): Promise<{ success: boolean; message: string }> {
    try {
      return await datasourcesApi.testConnectionWithParams(params)
    } catch (e: any) {
      return { success: false, message: e.message || 'Connection test failed' }
    }
  }

  function clearError() {
    error.value = null
  }

  function getDefaultTypes(): DataSourceTypeConfig[] {
    return getAllDataSourceTypes()
  }

  // ========================================
  // 메타데이터 추출 기능
  // ========================================
  
  const extractionProgress = ref<ExtractionProgress | null>(null)
  const isExtracting = ref(false)
  const supportedEngines = ref<string[]>([])
  
  async function fetchSupportedEngines() {
    try {
      const response = await datasourcesApi.getSupportedEngines()
      supportedEngines.value = response.engines
    } catch (e: any) {
      console.error('Failed to fetch supported engines:', e)
      // 기본값
      supportedEngines.value = ['postgres', 'postgresql', 'mysql', 'mariadb']
    }
  }
  
  function isEngineSupported(engine: string): boolean {
    return supportedEngines.value.includes(engine.toLowerCase())
  }
  
  async function extractMetadata(
    name: string,
    schemas?: string[],
    password?: string,
    onProgress?: (progress: ExtractionProgress) => void
  ): Promise<boolean> {
    isExtracting.value = true
    extractionProgress.value = null
    error.value = null
    
    try {
      const response = await datasourcesApi.extractMetadata(name, schemas, password)
      
      if (!response.ok) {
        throw new Error('Failed to start extraction')
      }
      
      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('No response body')
      }
      
      const decoder = new TextDecoder()
      let buffer = ''
      
      while (true) {
        const { done, value } = await reader.read()
        
        if (done) break
        
        buffer += decoder.decode(value, { stream: true })
        
        // Parse SSE events
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6)) as ExtractionProgress
              extractionProgress.value = data
              onProgress?.(data)
              
              if (data.phase === 'error') {
                error.value = data.error || data.message
                return false
              }
            } catch (e) {
              console.error('Failed to parse SSE event:', e)
            }
          }
        }
      }
      
      // 완료 후 데이터 새로고침
      await fetchDatasources()
      if (selectedDatasource.value?.name === name) {
        await fetchSchemas(name)
      }
      
      return extractionProgress.value?.phase === 'complete'
    } catch (e: any) {
      error.value = e.message || 'Extraction failed'
      return false
    } finally {
      isExtracting.value = false
    }
  }
  
  async function extractMetadataSync(
    name: string,
    schemas?: string[],
    password?: string
  ): Promise<{ success: boolean; message: string; schemas?: number; tables?: number }> {
    isExtracting.value = true
    error.value = null
    
    try {
      const result = await datasourcesApi.extractMetadataSync(name, schemas, password)
      
      // 완료 후 데이터 새로고침
      await fetchDatasources()
      if (selectedDatasource.value?.name === name) {
        await fetchSchemas(name)
      }
      
      return result
    } catch (e: any) {
      error.value = e.message || 'Extraction failed'
      return { success: false, message: e.message }
    } finally {
      isExtracting.value = false
    }
  }
  
  function resetExtractionProgress() {
    extractionProgress.value = null
    isExtracting.value = false
  }

  return {
    // State
    datasources,
    datasourceTypes,
    selectedDatasource,
    schemas,
    selectedSchema,
    tables,
    loading,
    error,
    extractionProgress,
    isExtracting,
    supportedEngines,
    // Getters
    hasDatasources,
    sortedDatasources,
    typesByCategory,
    categoryLabels,
    // Actions
    fetchTypes,
    fetchDatasources,
    createDatasource,
    deleteDatasource,
    selectDatasource,
    fetchSchemas,
    selectSchema,
    testConnection,
    testConnectionWithParams,
    checkHealth,
    checkAllHealth,
    clearError,
    getDefaultTypes,
    getAllDataSourceTypes,
    // Extraction
    fetchSupportedEngines,
    isEngineSupported,
    extractMetadata,
    extractMetadataSync,
    resetExtractionProgress,
  }
})
