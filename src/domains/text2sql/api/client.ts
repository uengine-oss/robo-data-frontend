/** text2sql api — 자연어 질의(ReAct)·메타·직접SQL·머티리얼라이즈드뷰. 공유 http 코어 사용. */
import type { ReactRequest, ReactStreamEvent, Text2SqlTableInfo, Text2SqlColumnInfo } from '../model/react'
import type { Headers } from '@/shared/services/http'
import { TEXT2SQL_BASE_URL } from './baseUrl'
import { text2SqlHttp } from './http'
import { useRuntimeStore } from '@/shared/stores/runtime'
import {
  parseAskResponse,
  parseColumnInfoList,
  parseDirectSqlResponse,
  parseDirectSqlStreamEvent,
  parseFeedbackResponse,
  parseMaterializedViewListResponse,
  parseMaterializedViewRefreshResponse,
  parseMaterializedViewResponse,
  parseMetaObjectTypeList,
  parseQueryHistoryItem,
  parseQueryHistoryResponse,
  parseReactStreamEvent,
  parseStringList,
  parseTableInfoList,
  parseText2SqlHealthResponse,
  type AskResponse,
  type DirectSqlResponse,
  type DirectSqlStreamEvent,
  type FeedbackResponse,
  type MaterializedViewListResponse,
  type MaterializedViewRefreshResponse,
  type MaterializedViewResponse,
  type QueryHistoryItem,
  type QueryHistoryResponse,
  type SaveQueryHistoryRequest,
  type Text2SqlMetaObjectType,
  type Text2SqlHealthResponse,
} from './contracts.ts'

const postJson = text2SqlHttp.postJson
const handleHttpError = text2SqlHttp.handleError

async function readJson<T>(response: Response, parser: (value: unknown) => T): Promise<T> {
  return parser(await response.json())
}

function requireSuccess<T extends { status: 'success' | 'error'; error_message?: string | null }>(
  result: T,
  fallbackMessage: string,
): T {
  if (result.status === 'error') {
    throw new Error(result.error_message || fallbackMessage)
  }
  return result
}

const sessionHeaders = (): Headers => useRuntimeStore().getHeaders()
const jsonSessionHeaders = (): Headers => ({ 'Content-Type': 'application/json', ...sessionHeaders() })

export function parseReactStreamLine(rawLine: string, final = false): ReactStreamEvent {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawLine)
  } catch {
    throw new Error(final
      ? 'ReAct 마지막 스트림 JSON 형식이 올바르지 않습니다.'
      : 'ReAct 스트림 JSON 형식이 올바르지 않습니다.')
  }
  return parseReactStreamEvent(parsed)
}

export function parseDirectSqlStreamLine(rawLine: string): DirectSqlStreamEvent | null {
  const line = rawLine.trim()
  if (!line) return null
  const jsonLine = line.startsWith('data:') ? line.slice(5).trimStart() : line
  if (!jsonLine) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonLine)
  } catch {
    throw new Error('Direct SQL 스트림 JSON 형식이 올바르지 않습니다.')
  }
  return parseDirectSqlStreamEvent(parsed)
}

// ============================================================================
// Text2SQL API (ReAct)
// ============================================================================


export const text2sqlApi = {
  async getHistory(options: { page: number; pageSize: number; search?: string; status?: string }): Promise<QueryHistoryResponse> {
    const params = new URLSearchParams({
      page: String(options.page),
      page_size: String(options.pageSize),
    })
    if (options.search) params.set('search', options.search)
    if (options.status) params.set('status', options.status)
    const response = await fetch(`${TEXT2SQL_BASE_URL}/history?${params}`, { headers: sessionHeaders() })
    if (!response.ok) await handleHttpError(response)
    return readJson(response, parseQueryHistoryResponse)
  },

  async saveHistory(entry: SaveQueryHistoryRequest): Promise<QueryHistoryItem> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/history`, {
      method: 'POST',
      headers: jsonSessionHeaders(),
      body: JSON.stringify(entry),
    })
    if (!response.ok) await handleHttpError(response)
    return readJson(response, parseQueryHistoryItem)
  },

  async deleteHistory(id: string): Promise<void> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/history/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: sessionHeaders(),
    })
    if (!response.ok) await handleHttpError(response)
  },

  async deleteAllHistory(): Promise<void> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/history`, { method: 'DELETE', headers: sessionHeaders() })
    if (!response.ok) await handleHttpError(response)
  },

  /**
   * 테이블 목록 조회
   */
  async getTables(datasource: string, search?: string, schema?: string, limit: number = 500): Promise<Text2SqlTableInfo[]> {
    if (!datasource) {
      throw new Error('datasource is required')
    }
    const params = new URLSearchParams()
    params.append('datasource', datasource)
    if (search) params.append('search', search)
    if (schema) params.append('schema', schema)
    params.append('limit', limit.toString())
    
    const response = await fetch(`${TEXT2SQL_BASE_URL}/meta/tables?${params}`, { headers: sessionHeaders() })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return readJson(response, parseTableInfoList)
  },

  /**
   * 테이블 컬럼 조회
   */
  async getTableColumns(
    datasource: string,
    tableName: string,
    schema: string = 'public',
    signal?: AbortSignal,
  ): Promise<Text2SqlColumnInfo[]> {
    if (!datasource) {
      throw new Error('datasource is required')
    }
    const params = new URLSearchParams({ schema })
    params.append('datasource', datasource)
    const response = await fetch(`${TEXT2SQL_BASE_URL}/meta/tables/${encodeURIComponent(tableName)}/columns?${params}`, {
      headers: sessionHeaders(),
      signal,
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return readJson(response, parseColumnInfoList)
  },

  /**
   * 컬럼 검색
   */
  async searchColumns(datasource: string, search: string, limit: number = 50): Promise<Text2SqlColumnInfo[]> {
    if (!datasource) {
      throw new Error('datasource is required')
    }
    const params = new URLSearchParams({ search, limit: limit.toString() })
    params.append('datasource', datasource)
    const response = await fetch(`${TEXT2SQL_BASE_URL}/meta/columns?${params}`, { headers: sessionHeaders() })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return readJson(response, parseColumnInfoList)
  },

  /**
   * ReAct 스트리밍 실행
   */
  async *reactStream(
    request: ReactRequest,
    options: { signal?: AbortSignal } = {}
  ): AsyncGenerator<ReactStreamEvent, void, unknown> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/react`, {
      method: 'POST',
      headers: jsonSessionHeaders(),
      body: JSON.stringify(request),
      signal: options.signal
    })

    if (!response.ok) await handleHttpError(response)
    if (!response.body) throw new Error('ReAct 스트림 응답 바디를 읽을 수 없습니다.')

    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        
        buffer += decoder.decode(value, { stream: true })
        let newlineIndex = buffer.indexOf('\n')
        
        while (newlineIndex !== -1) {
          const rawLine = buffer.slice(0, newlineIndex).trim()
          buffer = buffer.slice(newlineIndex + 1)
          
          if (rawLine) yield parseReactStreamLine(rawLine)
          newlineIndex = buffer.indexOf('\n')
        }
      }

      const remaining = buffer.trim()
      if (remaining) yield parseReactStreamLine(remaining, true)
    } finally {
      reader.releaseLock()
    }
  },

  /**
   * Text2SQL 결과 피드백 제출
   */
  async submitFeedback(payload: {
    prompt_snapshot_id?: string
    question?: string
    react_run_id?: string
    conversation_state?: string
    original_sql: string
    corrected_sql?: string | null
    rating: number
    notes?: string | null
    approved: boolean
    source?: string
  }): Promise<FeedbackResponse> {
    return parseFeedbackResponse(
      await postJson<unknown>(`${TEXT2SQL_BASE_URL}/feedback`, payload, sessionHeaders())
    )
  },

  /**
   * 자연어 질의 → 결과 (단발) — /text2sql/ask
   */
  async ask(
    question: string,
    datasource: string,
    limit: number = 1000,
    signal?: AbortSignal,
  ): Promise<AskResponse> {
    return parseAskResponse(
      await postJson<unknown>(
        `${TEXT2SQL_BASE_URL}/ask`,
        { question, datasource, limit },
        sessionHeaders(),
        signal,
      ),
    )
  },

  /**
   * 데이터소스 목록 — /text2sql/meta/datasources
   */
  async getDatasources(): Promise<string[]> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/meta/datasources`, { headers: sessionHeaders() })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return readJson(response, value => parseStringList(value, 'datasource list'))
  },

  /**
   * 데이터소스의 스키마 목록 — /text2sql/meta/datasources/{ds}/schemas
   */
  async getDatasourceSchemas(datasource: string): Promise<string[]> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/meta/datasources/${encodeURIComponent(datasource)}/schemas`, {
      headers: sessionHeaders(),
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return readJson(response, value => parseStringList(value, 'schema list'))
  },

  /**
   * 스키마의 테이블 목록 — /text2sql/meta/datasources/{ds}/schemas/{schema}/tables
   */
  async getSchemaTables(datasource: string, schema: string, limit: number = 500): Promise<Text2SqlTableInfo[]> {
    const response = await fetch(
      `${TEXT2SQL_BASE_URL}/meta/datasources/${encodeURIComponent(datasource)}/schemas/${encodeURIComponent(schema)}/tables?limit=${limit}`,
      { headers: sessionHeaders() },
    )
    if (!response.ok) {
      await handleHttpError(response)
    }
    return readJson(response, parseTableInfoList)
  },

  /**
   * 데이터소스의 ObjectType(머티리얼라이즈드뷰) 목록 — /text2sql/meta/objecttypes
   */
  async getMetaObjectTypes(datasource: string, limit: number = 500): Promise<Text2SqlMetaObjectType[]> {
    const response = await fetch(
      `${TEXT2SQL_BASE_URL}/meta/objecttypes?datasource=${encodeURIComponent(datasource)}&limit=${limit}`,
      { headers: sessionHeaders() },
    )
    if (!response.ok) {
      await handleHttpError(response)
    }
    return readJson(response, parseMetaObjectTypeList)
  },

  /**
   * Direct SQL 실행 (단발, 비스트림) — /text2sql/direct-sql
   */
  async directSql(
    body: { sql: string; datasource: string; max_sql_seconds?: number; format_with_ai?: boolean },
    signal?: AbortSignal,
  ): Promise<DirectSqlResponse> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/direct-sql`, {
      method: 'POST',
      headers: jsonSessionHeaders(),
      body: JSON.stringify(body),
      signal,
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return requireSuccess(
      await readJson(response, parseDirectSqlResponse),
      'Direct SQL 실행에 실패했습니다.',
    )
  },

  /**
   * 헬스체크
   */
  async healthCheck(): Promise<Text2SqlHealthResponse> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/health`, { headers: sessionHeaders() })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return readJson(response, parseText2SqlHealthResponse)
  },

  /**
   * Direct SQL 실행 (NDJSON 스트림) — 검증·자동교정·실행·AI포맷 등 이벤트를 onEvent 로 전달.
   * 라인은 `data:` 접두가 붙을 수 있다. 소비처는 event.event(또는 event.type) 로 분기한다.
   * (DirectSqlInput·Text2SqlTab·CreateObjectTypeDialog·BehaviorExecuteDialog 공용)
   */
  async directSqlStream(
    request: { sql: string; datasource: string; max_sql_seconds?: number; format_with_ai?: boolean },
    onEvent: (event: DirectSqlStreamEvent) => void,
    headers: Headers = {}
  ): Promise<void> {
    if (!request.datasource) {
      throw new Error('datasource is required')
    }
    const response = await fetch(`${TEXT2SQL_BASE_URL}/direct-sql/stream`, {
      method: 'POST',
      headers: { ...jsonSessionHeaders(), ...headers },
      body: JSON.stringify(request)
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    const reader = response.body?.getReader()
    if (!reader) throw new Error('스트림을 읽을 수 없습니다')

    const decoder = new TextDecoder()
    let buffer = ''
    const parseAndHandleLine = (rawLine: string) => {
      const event = parseDirectSqlStreamLine(rawLine)
      if (event) onEvent(event)
    }

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) parseAndHandleLine(line)
      }
      buffer += decoder.decode()
      if (buffer.trim()) parseAndHandleLine(buffer)
    } finally {
      reader.releaseLock()
    }
  },

  // ========================================================================
  // Materialized View 관리
  // ========================================================================

  /**
   * Materialized View 생성
   */
  async createMaterializedView(request: {
    datasource: string
    view_name: string
    schema_name?: string
    source_sql: string
    refresh_on_create?: boolean
    description?: string
  }): Promise<MaterializedViewResponse> {
    if (!request.datasource) {
      throw new Error('datasource is required')
    }
    const response = await fetch(`${TEXT2SQL_BASE_URL}/direct-sql/materialized-view`, {
      method: 'POST',
      headers: jsonSessionHeaders(),
      body: JSON.stringify({
        datasource: request.datasource,
        view_name: request.view_name,
        schema_name: request.schema_name || 'public',
        source_sql: request.source_sql,
        refresh_on_create: request.refresh_on_create ?? true,
        description: request.description || ''
      })
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return requireSuccess(
      await readJson(response, parseMaterializedViewResponse),
      'Materialized View 생성에 실패했습니다.',
    )
  },

  /**
   * Materialized View 새로고침
   */
  async refreshMaterializedView(
    viewName: string, 
    datasource: string,
    schemaName: string = 'public'
  ): Promise<MaterializedViewRefreshResponse> {
    if (!datasource) {
      throw new Error('datasource is required')
    }
    const response = await fetch(
      `${TEXT2SQL_BASE_URL}/direct-sql/materialized-view/${encodeURIComponent(viewName)}/refresh?datasource=${encodeURIComponent(datasource)}&schema_name=${encodeURIComponent(schemaName)}`,
      { method: 'POST', headers: sessionHeaders() }
    )
    if (!response.ok) {
      await handleHttpError(response)
    }
    return requireSuccess(
      await readJson(response, parseMaterializedViewRefreshResponse),
      'Materialized View 새로고침에 실패했습니다.',
    )
  },

  /**
   * Materialized View 목록 조회
   */
  async listMaterializedViewsForDatasource(
    datasource: string,
    schemaName: string = 'public'
  ): Promise<MaterializedViewListResponse> {
    if (!datasource) {
      throw new Error('datasource is required')
    }
    const response = await fetch(
      `${TEXT2SQL_BASE_URL}/direct-sql/materialized-views?datasource=${encodeURIComponent(datasource)}&schema_name=${encodeURIComponent(schemaName)}`,
      { headers: sessionHeaders() },
    )
    if (!response.ok) {
      await handleHttpError(response)
    }
    return requireSuccess(
      await readJson(response, parseMaterializedViewListResponse),
      'Materialized View 목록 조회에 실패했습니다.',
    )
  }
}
