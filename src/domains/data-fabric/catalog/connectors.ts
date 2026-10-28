/** Data Fabric connector form catalog. Runtime support is owned by the backend. */
import type { DataSourceTypeConfig } from '../api/contracts.ts'

// ============================================================================
// ⚠ **고를 수 있는 것과 실제로 붙는 것이 다르다**
// ============================================================================
//
// 아래 목록은 **MindsDB 시절의 전체 목록**(87종)이다. 2026-10-27 에 데이터 소스
// 연합이 MindsDB 에서 **Ontological 의 virtual fabric** 으로 바뀌었고, 그쪽은
// PostgreSQL 의 **외부 데이터 래퍼(FDW)** 로 붙는다 — 종류마다 그 DB 용 FDW 확장이
// 엔진 이미지에 들어 있어야 한다.
//
// 2026-10-29 실측:
//
//     엔진이 받는 engine 문자열   postgres · postgresql · mysql · mindsdb
//     엔진 이미지에 든 FDW        file_fdw · postgres_fdw   ← **mysql_fdw 가 없다**
//     ⇒ 실제로 붙는 것은 **PostgreSQL 하나**
//
// 그래서 화면에는 **붙는 것만** 보인다(`getSupportedDataSourceTypes`). 고르게 해
// 놓고 **고른 뒤에 실패하는 것**이 제일 나쁘다 — 쓰는 사람은 자기 접속값을 의심한다.
//
// ⚠ **여기를 늘리기 전에 엔진부터 늘린다.** `mysql_fdw` 를 이미지에 넣고 fabric 이
//   `mariadb`→`mysql` 이름을 맞추면 그때 이 목록에 더한다. 순서를 거꾸로 하면
//   화면이 다시 거짓말을 한다.
// ⚠ 목록 자체는 **지우지 않는다.** 엔진이 넓어질 때 쓸 양식이고, 지우면 87종을
//   다시 적어야 한다.
//
// 짝: `robo-data-fabric` 의 `fabric/gateway.py` · 엔진의
//     `engine/src/fabric/mod.rs` 의 engine 분기.

/** 지금 **실제로 붙는** engine 문자열. 위 주석의 실측이 근거다. */
export const SUPPORTED_ENGINES: readonly string[] = ['postgres']

/** 화면에 보일 것 — 붙는 것만 고른다. */
export function getSupportedDataSourceTypes(): DataSourceTypeConfig[] {
  return getAllDataSourceTypes().filter((t) => SUPPORTED_ENGINES.includes(t.type))
}

// ============================================================================
// 전체 목록 (양식 정의 — 엔진이 넓어지면 여기서 꺼내 쓴다)
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
        { name: 'schema', label: 'Schema', type: 'text', required: false, default: '', placeholder: '비우면 public 을 가져옵니다' }
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
        { name: 'schema', label: 'Schema', type: 'text', required: false, default: '', placeholder: '비워 두세요 — MySQL 계열은 Database 를 씁니다' }
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
        { name: 'schema', label: 'Schema', type: 'text', required: false, default: '', placeholder: '비워 두세요 — MySQL 계열은 Database 를 씁니다' }
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
        { name: 'schema', label: 'Schema', type: 'text', required: false, default: '', placeholder: '비워 두세요 — MySQL 계열은 Database 를 씁니다' }
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
