/** schema api — ERD/스키마 메타데이터 (Neo4j 직접 조회). 공유 http 코어(base URL) 사용. */
import { ROBO_BASE_URL, handleHttpError } from '@/shared/services/http'

// ============================================================================
// ROBO Schema API (ERD 모델링용 - Neo4j 직접 조회)
// ============================================================================

export interface RoboSchemaTableInfo {
  name: string
  table_schema: string  // Renamed from 'schema' in backend
  datasource: string  // 데이터소스명 (예: robo_postgres, ontology)
  description: string
  description_source?: string  // 설명 출처: ddl, procedure, user
  analyzed_description?: string  // 프로시저 분석에서 도출된 설명
  column_count: number
}

export interface RoboSchemaColumnInfo {
  name: string
  table_name: string
  dtype: string
  nullable: boolean
  description: string
  description_source?: string  // 설명 출처: ddl, procedure, user
  analyzed_description?: string  // 프로시저 분석에서 도출된 설명
}

export interface RoboSchemaRelationship {
  from_table: string
  from_schema: string
  from_column: string
  to_table: string
  to_schema: string
  to_column: string
  relationship_type: string
  description: string
}

/**
 * ROBO Analyzer Schema API
 * Neo4j에서 DDL 분석 결과(테이블, 컬럼, 관계)를 조회
 */
export const roboSchemaApi = {
  /**
   * 테이블 목록 조회 (Neo4j)
   */
  async getTables(
    options?: { search?: string; schema?: string; limit?: number }
  ): Promise<RoboSchemaTableInfo[]> {
    const params = new URLSearchParams()
    if (options?.search) params.append('search', options.search)
    if (options?.schema) params.append('schema', options.schema)
    if (options?.limit) params.append('limit', options.limit.toString())
    
    const response = await fetch(`${ROBO_BASE_URL}/schema/tables?${params}`)
    
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },
  
  /**
   * 테이블 컬럼 목록 조회 (Neo4j)
   */
  async getTableColumns(
    tableName: string,
    options?: { schema?: string }
  ): Promise<RoboSchemaColumnInfo[]> {
    const params = new URLSearchParams()
    if (options?.schema) params.append('schema', options.schema)

    const response = await fetch(`${ROBO_BASE_URL}/schema/tables/${tableName}/columns?${params}`)
    
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },
  
  /**
   * 테이블 관계 목록 조회 (Neo4j)
   * 백엔드는 배열을 직접 반환하므로 래핑하여 반환
   */
  async getRelationships(): Promise<{ relationships: RoboSchemaRelationship[] }> {
    const response = await fetch(`${ROBO_BASE_URL}/schema/relationships`)
    
    if (!response.ok) {
      await handleHttpError(response)
    }
    const data = await response.json()
    // 백엔드가 배열을 직접 반환하므로 래핑
    return { relationships: Array.isArray(data) ? data : (data.relationships || []) }
  },
  
  /**
   * 특정 테이블과 연결된 모든 테이블 조회 (Neo4j Cypher)
   */
  async getRelatedTables(
    tableName: string
  ): Promise<{
    base_table: string
    tables: Array<{ name: string; schema: string; description?: string }>
    relationships: Array<{ 
      from_table: string
      to_table: string
      type: string
      source?: 'ddl' | 'procedure' | 'user'  // FK 관계 출처
      column_pairs?: Array<{ source: string; target: string; name?: string }>  // 관계 이름 포함
    }>
  }> {
    const response = await fetch(`${ROBO_BASE_URL}/graph/related-tables/${encodeURIComponent(tableName)}`)
    
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },
  
  /**
   * 테이블/컬럼이 참조된 프로시저 목록 조회
   */
  async getTableReferences(
    tableName: string,
    options?: { schema?: string; columnName?: string }
  ): Promise<{
    references: Array<{
      procedure_name: string
      procedure_type: string  // PROCEDURE, FUNCTION 등
      start_line: number
      access_type: string  // FROM (읽기), WRITES (쓰기)
      statement_type?: string  // SELECT, INSERT, UPDATE 등
      statement_line?: number
      file_name?: string  // 파일명
      file_directory?: string  // 파일 경로(디렉토리)
      file_path?: string  // 절대 파일 경로(코드뷰 소스 서빙용, spec 043)
    }>
    framework_references?: Array<{
      source_name: string
      source_type: string  // FUNCTION | MODULE 등
      access_type: string  // READS | WRITES | REFER_TO
      start_line?: number
      file_name?: string
      file_path?: string
      file_directory?: string
      module_name?: string
    }>
  }> {
    const params = new URLSearchParams()
    if (options?.schema) params.append('schema', options.schema)
    if (options?.columnName) params.append('column_name', options.columnName)

    const response = await fetch(`${ROBO_BASE_URL}/schema/tables/${encodeURIComponent(tableName)}/references?${params}`)
    
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  /**
   * 소스 파일 본문 조회 (spec 043) — analyzer 가 디스크 원본을 읽어 반환.
   * 코드뷰가 브라우저 업로드(uploadedFiles) 없이 동작하게 한다. 기본은 파일 전체.
   * 400(경로이탈)·404(없음)은 가짜 코드 대신 정직한 found:false 로 정규화한다.
   */
  async getSourceContent(
    filePath: string,
    options?: { startLine?: number; endLine?: number }
  ): Promise<{
    file_path: string
    content: string
    line_count: number
    start_line: number
    end_line: number
    found: boolean
  }> {
    const params = new URLSearchParams()
    params.append('file_path', filePath)
    if (options?.startLine) params.append('start_line', options.startLine.toString())
    if (options?.endLine) params.append('end_line', options.endLine.toString())

    const response = await fetch(`${ROBO_BASE_URL}/source?${params}`)
    if (!response.ok) {
      return { file_path: filePath, content: '', line_count: 0, start_line: 0, end_line: 0, found: false }
    }
    return response.json()
  },

  /**
   * 프로시저의 모든 Statement와 AI 설명 조회
   */
  async getProcedureStatements(
    procedureName: string,
    fileDirectory?: string
  ): Promise<{
    statements: Array<{
      start_line: number
      end_line?: number
      statement_type: string
      summary?: string
      ai_description?: string
    }>
  }> {
    const params = new URLSearchParams()
    if (fileDirectory) params.append('file_directory', fileDirectory)
    
    const response = await fetch(`${ROBO_BASE_URL}/schema/procedures/${encodeURIComponent(procedureName)}/statements?${params}`)
    
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
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
      relationship_type: string
      description?: string
    }
  ): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${ROBO_BASE_URL}/schema/relationships`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(relationship)
    })
    
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
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
    }
  ): Promise<{ success: boolean; message: string; deleted?: number }> {
    // 스키마 정보도 포함하여 전달
    const searchParams = new URLSearchParams({
      from_table: params.from_table,
      from_column: params.from_column,
      to_table: params.to_table,
      to_column: params.to_column,
      ...(params.from_schema && { from_schema: params.from_schema }),
      ...(params.to_schema && { to_schema: params.to_schema })
    })
    
    console.log('[roboSchemaApi.deleteRelationship] 호출:', Object.fromEntries(searchParams))
    
    const response = await fetch(`${ROBO_BASE_URL}/schema/relationships?${searchParams}`, {
      method: 'DELETE'
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('[roboSchemaApi.deleteRelationship] 실패:', response.status, errorText)
      throw new Error(`HTTP ${response.status}: ${errorText}`)
    }
    
    const result = await response.json()
    console.log('[roboSchemaApi.deleteRelationship] 결과:', result)
    
    // 삭제된 개수가 0이면 경고
    if (result.deleted === 0) {
      console.warn('[roboSchemaApi.deleteRelationship] 삭제된 관계가 없습니다')
    }
    
    return result
  },
  
  /**
   * 시멘틱 검색: 테이블 설명의 의미적 유사도 기반 검색
   */
  async semanticSearch(
    query: string,
    options?: { limit?: number }
  ): Promise<Array<{
    name: string
    schema: string
    description: string
    similarity: number
  }>> {
    const response = await fetch(`${ROBO_BASE_URL}/schema/semantic-search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query,
        limit: options?.limit || 10
      })
    })
    
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  }
}
