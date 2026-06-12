/** text2sql api — 자연어 질의(ReAct)·메타·직접SQL·머티리얼라이즈드뷰. 공유 http 코어 사용. */
import type { ReactRequest, ReactStreamEvent, Text2SqlTableInfo, Text2SqlColumnInfo } from '@/types'
import { TEXT2SQL_BASE_URL, ROBO_BASE_URL, postJson, type Headers } from '@/shared/services/http'

// ============================================================================
// Text2SQL API (ReAct)
// ============================================================================


export const text2sqlApi = {
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
    
    const response = await fetch(`${TEXT2SQL_BASE_URL}/meta/tables?${params}`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },

  /**
   * 테이블 컬럼 조회
   */
  async getTableColumns(datasource: string, tableName: string, schema: string = 'public'): Promise<Text2SqlColumnInfo[]> {
    if (!datasource) {
      throw new Error('datasource is required')
    }
    const params = new URLSearchParams({ schema })
    params.append('datasource', datasource)
    const response = await fetch(`${TEXT2SQL_BASE_URL}/meta/tables/${tableName}/columns?${params}`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
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
    const response = await fetch(`${TEXT2SQL_BASE_URL}/meta/columns?${params}`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },

  /**
   * 테이블 설명 수정 (robo-analyzer 사용)
   */
  async updateTableDescription(
    tableName: string, 
    schema: string, 
    description: string,
    headers: Headers = {}
  ): Promise<void> {
    const response = await fetch(`${ROBO_BASE_URL}/schema/tables/${tableName}/description`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ name: tableName, schema, description })
    })
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(errorText || `HTTP ${response.status}`)
    }
  },

  /**
   * 컬럼 설명 수정 (robo-analyzer 사용)
   */
  async updateColumnDescription(
    tableName: string, 
    columnName: string, 
    schema: string, 
    description: string,
    headers: Headers = {}
  ): Promise<void> {
    const response = await fetch(
      `${ROBO_BASE_URL}/schema/tables/${tableName}/columns/${columnName}/description`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          table_name: tableName,
          table_schema: schema,
          column_name: columnName,
          description
        })
      }
    )
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(errorText || `HTTP ${response.status}`)
    }
  },

  /**
   * 릴레이션 추가 (robo-analyzer 사용)
   */
  async addRelationship(
    relationship: {
      from_table: string
      from_schema: string
      from_column: string
      to_table: string
      to_schema: string
      to_column: string
      relationship_type: string
      description?: string
    },
    headers: Headers = {}
  ): Promise<void> {
    const response = await fetch(`${ROBO_BASE_URL}/schema/relationships`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(relationship)
    })
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(errorText || `HTTP ${response.status}`)
    }
  },

  /**
   * 릴레이션 삭제 (robo-analyzer 사용)
   */
  async removeRelationship(
    params: {
      from_table: string
      from_schema: string
      from_column: string
      to_table: string
      to_schema: string
      to_column: string
    },
    headers: Headers = {}
  ): Promise<void> {
    const searchParams = new URLSearchParams(params as Record<string, string>)
    const response = await fetch(`${ROBO_BASE_URL}/schema/relationships?${searchParams}`, {
      method: 'DELETE',
      headers
    })
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(errorText || `HTTP ${response.status}`)
    }
  },

  /**
   * 사용자 추가 릴레이션 목록 (robo-analyzer 사용)
   */
  async getUserRelationships(headers: Headers = {}): Promise<{ relationships: unknown[] }> {
    const response = await fetch(`${ROBO_BASE_URL}/schema/relationships`, { headers })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: options.signal
    })

    if (!response.ok || !response.body) {
      const message = await response.text()
      throw new Error(message || 'ReAct 요청에 실패했습니다.')
    }

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
          
          if (rawLine) {
            try {
              const parsed = JSON.parse(rawLine) as ReactStreamEvent
              yield parsed
            } catch (error) {
              console.warn('ReAct 이벤트 파싱 실패', error, rawLine)
            }
          }
          newlineIndex = buffer.indexOf('\n')
        }
      }

      const remaining = buffer.trim()
      if (remaining) {
        try {
          const parsed = JSON.parse(remaining) as ReactStreamEvent
          yield parsed
        } catch (error) {
          console.warn('ReAct 마지막 이벤트 파싱 실패', error, remaining)
        }
      }
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
  }): Promise<{ feedback_id: string; message: string }> {
    return postJson(`${TEXT2SQL_BASE_URL}/feedback`, payload, {})
  },

  /**
   * 헬스체크
   */
  async healthCheck(): Promise<unknown> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/health`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
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
  }): Promise<{
    status: string
    view_name: string
    full_name: string
    row_count: number
    message: string
    error_message?: string
  }> {
    if (!request.datasource) {
      throw new Error('datasource is required')
    }
    const response = await fetch(`${TEXT2SQL_BASE_URL}/direct-sql/materialized-view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },

  /**
   * Materialized View 새로고침
   */
  async refreshMaterializedView(
    viewName: string, 
    datasource: string,
    schemaName: string = 'public'
  ): Promise<{
    status: string
    view_name: string
    row_count: number
    message: string
    error_message?: string
  }> {
    if (!datasource) {
      throw new Error('datasource is required')
    }
    const response = await fetch(
      `${TEXT2SQL_BASE_URL}/direct-sql/materialized-view/${viewName}/refresh?datasource=${encodeURIComponent(datasource)}&schema_name=${schemaName}`,
      { method: 'POST' }
    )
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },

  /**
   * Materialized View 목록 조회
   */
  async listMaterializedViews(schemaName: string = 'public'): Promise<{
    status: string
    views: Array<{
      schema: string
      name: string
      owner: string
      is_populated: boolean
      size: string
      description: string | null
    }>
    count: number
    error_message?: string
  }> {
  // NOTE: datasource is required by backend; call sites must provide it via the overload below.
    throw new Error('Use listMaterializedViewsForDatasource(datasource, schemaName)')
  },

  async listMaterializedViewsForDatasource(datasource: string, schemaName: string = 'public'): Promise<{
    status: string
    views: Array<{
      schema: string
      name: string
      owner: string
      is_populated: boolean
      size: string
      description: string | null
    }>
    count: number
    error_message?: string
  }> {
    if (!datasource) {
      throw new Error('datasource is required')
    }
    const response = await fetch(
      `${TEXT2SQL_BASE_URL}/direct-sql/materialized-views?datasource=${encodeURIComponent(datasource)}&schema_name=${schemaName}`
    )
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  }
}
