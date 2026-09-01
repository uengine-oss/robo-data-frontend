/** schema api — ERD/스키마 메타데이터 (Neo4j 직접 조회). 공유 http 코어(base URL) 사용. */
import type { Headers } from '@/shared/services/http'
import { catalogHttp } from './http'
import { CATALOG_BASE_URL as ROBO_BASE_URL } from './baseUrl'
import {
  parseDescriptionUpdate,
  parseProcedureStatements,
  parseRelatedTables,
  parseRelationshipCreate,
  parseRelationshipDelete,
  parseSchemaColumns,
  parseSchemaRelationships,
  parseSchemaTables,
  parseSemanticSearchResults,
  parseTableReferences,
  type CatalogDescriptionUpdateResponse,
  type CatalogProcedureStatementsResponse,
  type CatalogRelatedTablesResponse,
  type CatalogRelationshipCreateResponse,
  type CatalogRelationshipDeleteResponse,
  type CatalogSemanticSearchResult,
  type CatalogTableReferencesResponse,
} from './schemaContracts'

export type * from './schemaContracts'

const handleHttpError = catalogHttp.handleError

// ============================================================================
// ROBO Schema API (ERD 모델링용 - Neo4j 직접 조회)
// ============================================================================

export interface CatalogSchemaRequestContext {
  headers?: Headers
  apiKey?: string
  signal?: AbortSignal
}

function requestHeaders(
  context: CatalogSchemaRequestContext | undefined,
  requireApiKey = false,
): Headers {
  const headers = { ...(context?.headers || {}) }
  const apiKey = context?.apiKey?.trim() || headers['X-API-Key']?.trim()
  if (apiKey) headers['X-API-Key'] = apiKey
  if (requireApiKey && !apiKey) {
    throw new Error('Catalog 설명 편집과 의미 검색에는 API 키가 필요합니다.')
  }
  return headers
}

/**
 * ROBO Analyzer Schema API
 * Neo4j에서 DDL 분석 결과(테이블, 컬럼, 관계)를 조회
 */
export const catalogSchemaApi = {
  /**
   * 테이블 목록 조회 (Neo4j)
   */
  async getTables(
    options?: { search?: string; schema?: string; limit?: number },
    context?: CatalogSchemaRequestContext,
  ) {
    const params = new URLSearchParams()
    if (options?.search) params.append('search', options.search)
    if (options?.schema) params.append('schema', options.schema)
    if (options?.limit) params.append('limit', options.limit.toString())

    const response = await fetch(`${ROBO_BASE_URL}/schema/tables?${params}`, {
      headers: requestHeaders(context),
      signal: context?.signal,
    })

    if (!response.ok) {
      await handleHttpError(response)
    }
    return parseSchemaTables(await response.json())
  },

  /**
   * 테이블 컬럼 목록 조회 (Neo4j)
   */
  async getTableColumns(
    tableName: string,
    options?: { schema?: string },
    context?: CatalogSchemaRequestContext,
  ) {
    const params = new URLSearchParams()
    if (options?.schema) params.append('schema', options.schema)

    const response = await fetch(
      `${ROBO_BASE_URL}/schema/tables/${encodeURIComponent(tableName)}/columns?${params}`,
      {
        headers: requestHeaders(context),
        signal: context?.signal,
      },
    )

    if (!response.ok) {
      await handleHttpError(response)
    }
    return parseSchemaColumns(await response.json())
  },

  /**
   * 테이블 관계 목록 조회 (Neo4j)
   * 백엔드는 배열을 직접 반환하므로 래핑하여 반환
   */
  async getRelationships(
    context?: CatalogSchemaRequestContext,
  ) {
    const response = await fetch(`${ROBO_BASE_URL}/schema/relationships`, {
      headers: requestHeaders(context),
    })

    if (!response.ok) {
      await handleHttpError(response)
    }
    return { relationships: parseSchemaRelationships(await response.json()) }
  },

  /**
   * 특정 테이블과 연결된 모든 테이블 조회 (Neo4j Cypher)
   */
  async getRelatedTables(
    tableName: string,
    context?: CatalogSchemaRequestContext,
  ): Promise<CatalogRelatedTablesResponse> {
    const response = await fetch(
      `${ROBO_BASE_URL}/graph/related-tables/${encodeURIComponent(tableName)}`,
      { headers: requestHeaders(context) },
    )

    if (!response.ok) {
      await handleHttpError(response)
    }
    return parseRelatedTables(await response.json())
  },

  /**
   * 테이블/컬럼이 참조된 프로시저 목록 조회
   */
  async getTableReferences(
    tableName: string,
    options?: { schema?: string; columnName?: string },
    context?: CatalogSchemaRequestContext,
  ): Promise<CatalogTableReferencesResponse> {
    const params = new URLSearchParams()
    if (options?.schema) params.append('schema', options.schema)
    if (options?.columnName) params.append('column_name', options.columnName)

    const response = await fetch(
      `${ROBO_BASE_URL}/schema/tables/${encodeURIComponent(tableName)}/references?${params}`,
      { headers: requestHeaders(context) },
    )

    if (!response.ok) {
      await handleHttpError(response)
    }
    return parseTableReferences(await response.json())
  },

  /**
   * 프로시저의 모든 Statement와 AI 설명 조회
   */
  async getProcedureStatements(
    procedureName: string,
    filePath?: string,
    context?: CatalogSchemaRequestContext,
  ): Promise<CatalogProcedureStatementsResponse> {
    const params = new URLSearchParams()
    if (filePath) params.append('file_path', filePath)

    const response = await fetch(
      `${ROBO_BASE_URL}/schema/procedures/${encodeURIComponent(procedureName)}/statements?${params}`,
      { headers: requestHeaders(context) },
    )

    if (!response.ok) {
      await handleHttpError(response)
    }
    return parseProcedureStatements(await response.json())
  },

  /**
   * 테이블 설명 수정 (Neo4j)
   */
  async updateTableDescription(
    tableName: string,
    schema: string,
    description: string,
    context?: CatalogSchemaRequestContext,
  ): Promise<CatalogDescriptionUpdateResponse> {
    const response = await fetch(`${ROBO_BASE_URL}/schema/tables/${encodeURIComponent(tableName)}/description`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...requestHeaders(context, true) },
      body: JSON.stringify({ name: tableName, schema, description })
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return parseDescriptionUpdate(await response.json())
  },

  /**
   * 컬럼 설명 수정 (Neo4j)
   */
  async updateColumnDescription(
    tableName: string,
    columnName: string,
    schema: string,
    description: string,
    context?: CatalogSchemaRequestContext,
  ): Promise<CatalogDescriptionUpdateResponse> {
    const response = await fetch(
      `${ROBO_BASE_URL}/schema/tables/${encodeURIComponent(tableName)}/columns/${encodeURIComponent(columnName)}/description`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...requestHeaders(context, true) },
        body: JSON.stringify({
          table_name: tableName,
          table_schema: schema,
          column_name: columnName,
          description
        })
      }
    )
    if (!response.ok) {
      await handleHttpError(response)
    }
    return parseDescriptionUpdate(await response.json())
  },

  /**
   * 테이블 관계 추가 (Neo4j)
   */
  async addRelationship(
    relationship: {
      from_table: string
      from_schema?: string
      from_column: string
      to_table: string
      to_schema?: string
      to_column: string
      relationship_type: 'FK'
      description?: string
    },
    context?: CatalogSchemaRequestContext,
  ): Promise<CatalogRelationshipCreateResponse> {
    const response = await fetch(`${ROBO_BASE_URL}/schema/relationships`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...requestHeaders(context),
      },
      body: JSON.stringify(relationship)
    })

    if (!response.ok) {
      await handleHttpError(response)
    }
    return parseRelationshipCreate(await response.json())
  },

  /**
   * 테이블 관계 삭제 (Neo4j)
   */
  async deleteRelationship(
    params: {
      from_table: string
      from_column: string
      to_table: string
      to_column: string
      from_schema?: string
      to_schema?: string
    },
    context?: CatalogSchemaRequestContext,
  ): Promise<CatalogRelationshipDeleteResponse> {
    // 스키마 정보도 포함하여 전달
    const searchParams = new URLSearchParams({
      from_table: params.from_table,
      from_column: params.from_column,
      to_table: params.to_table,
      to_column: params.to_column,
      ...(params.from_schema && { from_schema: params.from_schema }),
      ...(params.to_schema && { to_schema: params.to_schema })
    })

    const response = await fetch(`${ROBO_BASE_URL}/schema/relationships?${searchParams}`, {
      method: 'DELETE',
      headers: requestHeaders(context),
    })

    if (!response.ok) {
      await handleHttpError(response)
    }
    return parseRelationshipDelete(await response.json())
  },

  /**
   * 시멘틱 검색: 테이블 설명의 의미적 유사도 기반 검색
   */
  async semanticSearch(
    query: string,
    options?: { limit?: number },
    context?: CatalogSchemaRequestContext,
  ): Promise<CatalogSemanticSearchResult[]> {
    const response = await fetch(`${ROBO_BASE_URL}/schema/semantic-search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...requestHeaders(context, true),
      },
      body: JSON.stringify({
        query,
        limit: options?.limit || 10
      }),
      signal: context?.signal,
    })

    if (!response.ok) {
      await handleHttpError(response)
    }
    return parseSemanticSearchResults(await response.json())
  }
}
