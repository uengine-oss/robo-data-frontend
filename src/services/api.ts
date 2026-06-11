/**
 * api.ts
 * API 서비스 모듈
 * 
 * 주요 기능:
 * - ANTLR Server API (파일 업로드, 파싱)
 * - ROBO Analyzer API (소스 분석, 데이터 삭제)
 * - NDJSON 스트림 처리
 */

import type { 
  BackendRequestMetadata, 
  FileUploadResponse, 
  ParseResponse,
  StreamEvent
} from '@/types'
import { getNormalizedUploadPath } from '@/utils/upload'

// ============================================================================
// 상수 정의
// ============================================================================

// API Gateway URL - 모든 마이크로서비스 요청의 단일 진입점
// Vite 프록시를 통해 /api/gateway/* 경로로 요청
const API_GATEWAY_URL = import.meta.env.VITE_API_GATEWAY_URL ?? '/api/gateway'

const ANTLR_BASE_URL = `${API_GATEWAY_URL}/antlr`
const ROBO_BASE_URL = `${API_GATEWAY_URL}/robo`

// ============================================================================
// 타입 정의
// ============================================================================

type StreamCallback = (event: StreamEvent) => void
type Headers = Record<string, string>

// ============================================================================
// HTTP 유틸리티
// ============================================================================

/**
 * HTTP 에러 처리
 * 서버에서 반환하는 JSON 오류 응답을 파싱하여 정확한 메시지 추출
 */
async function handleHttpError(response: Response): Promise<never> {
  const errorText = await response.text().catch(() => '')
  
  // 서버 에러 상세 정보를 콘솔에 출력 (디버깅용)
  console.error(`[API Error] ${response.status} ${response.statusText}`)
  console.error(`[API Error] URL: ${response.url}`)
  console.error(`[API Error] Response body:`, errorText)
  
  // 서비스별 친절한 에러 메시지
  const url = response.url
  
  // ANTLR 서비스 관련 에러 처리
  if (url.includes('/antlr/')) {
    if (response.status === 404 || response.status === 502 || response.status === 503) {
      throw new Error(
        '🔧 ANTLR 파서 서비스가 동작하지 않습니다.\n\n' +
        '다음을 확인해주세요:\n' +
        '• ANTLR 서비스가 실행 중인지 확인 (포트 8081)\n' +
        '• API Gateway가 정상 동작하는지 확인 (포트 9000)\n\n' +
        '서비스 시작 명령어:\n' +
        'cd antlr-code-parser && mvn spring-boot:run'
      )
    }
  }
  
  // ROBO Analyzer 서비스 관련 에러 처리
  if (url.includes('/robo/')) {
    if (response.status === 404 || response.status === 502 || response.status === 503) {
      throw new Error(
        '🔧 ROBO Analyzer 서비스가 동작하지 않습니다.\n\n' +
        '다음을 확인해주세요:\n' +
        '• robo-analyzer 서비스가 실행 중인지 확인 (포트 5502)\n' +
        '• API Gateway가 정상 동작하는지 확인 (포트 9000)'
      )
    }
  }
  
  // Text2SQL 서비스 관련 에러 처리
  if (url.includes('/text2sql/')) {
    if (response.status === 404 || response.status === 502 || response.status === 503) {
      throw new Error(
        '🔧 Text2SQL 서비스가 동작하지 않습니다.\n\n' +
        '다음을 확인해주세요:\n' +
        '• neo4j-text2sql 서비스가 실행 중인지 확인 (포트 8000)\n' +
        '• API Gateway가 정상 동작하는지 확인 (포트 9000)'
      )
    }
  }
  
  // JSON 응답에서 detail 필드 추출 시도
  let errorMessage = `HTTP ${response.status}`
  try {
    const errorJson = JSON.parse(errorText)
    if (errorJson.detail) {
      // FastAPI 스타일 오류 응답
      errorMessage = errorJson.detail
      if (errorJson.error_type) {
        errorMessage = `[${errorJson.error_type}] ${errorMessage}`
      }
    } else if (errorJson.message) {
      // 일반 오류 응답
      errorMessage = errorJson.message
    } else {
      errorMessage = errorText || `HTTP ${response.status}`
    }
  } catch {
    // JSON 파싱 실패 시 원본 텍스트 사용
    errorMessage = errorText || `HTTP ${response.status}`
  }
  
  throw new Error(errorMessage)
}

/**
 * JSON POST 요청
 */
async function postJson<T>(
  url: string, 
  body: unknown, 
  headers: Headers
): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  })
  
  if (!response.ok) {
    await handleHttpError(response)
  }
  
  return response.json()
}

/**
 * FormData POST 요청
 */
async function postFormData<T>(
  url: string, 
  formData: FormData, 
  headers: Headers
): Promise<T> {
  // 디버깅: FormData 내용 확인
  console.log(`[API] POST ${url}`)
  console.log('[API] Headers:', headers)
  console.log('[API] Full URL:', window.location.origin + url)
  
  try {
    const requestHeaders = { ...headers }
    delete requestHeaders['Content-Type']

    // FormData 전송 시 브라우저가 자동으로 Content-Type을 설정하므로 명시하지 않음
    const response = await fetch(url, {
      method: 'POST',
      headers: requestHeaders,
      body: formData
    })
    
    console.log(`[API] Response status: ${response.status} ${response.statusText}`)
    console.log(`[API] Response headers:`, Object.fromEntries(response.headers.entries()))
    
    if (!response.ok) {
      await handleHttpError(response)
    }
    
    return response.json()
  } catch (error) {
    // 네트워크 오류 처리
    console.error('[API] Network error:', error)
    
    if (error instanceof TypeError && error.message.includes('fetch')) {
      const serviceLabel = url.includes('/robo/') ? 'ROBO Analyzer' : 'ANTLR Server'
      throw new Error(
        `서버에 연결할 수 없습니다. ${serviceLabel} 서비스가 실행 중인지 확인해주세요.\n` +
        `원본 오류: ${error.message}`
      )
    }
    
    if (error instanceof Error) {
      throw new Error(
        `파일 업로드 중 오류가 발생했습니다: ${error.message}\n` +
        `서버 상태를 확인해주세요.`
      )
    }
    
    throw error
  }
}

// ============================================================================
// NDJSON 스트림 처리
// ============================================================================

/**
 * NDJSON 스트림 fetch 유틸리티
 */
async function streamFetch(
  url: string,
  body: unknown,
  headers: Headers,
  onEvent: StreamCallback
): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  })
  
  if (!response.ok) {
    await handleHttpError(response)
  }
  
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Response body is not readable')
  }
  
  await processStream(reader, onEvent)
}

/**
 * 스트림 데이터 처리
 */
async function processStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent: StreamCallback
): Promise<void> {
  const decoder = new TextDecoder()
  let buffer = ''
  
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      
      buffer += decoder.decode(value, { stream: true })
      buffer = processBuffer(buffer, onEvent)
    }
    
    // 남은 버퍼 처리
    processFinalBuffer(buffer, onEvent)
  } finally {
    reader.releaseLock()
  }
}

/**
 * 버퍼에서 완전한 JSON 라인 추출 및 처리
 */
function processBuffer(buffer: string, onEvent: StreamCallback): string {
  const lines = buffer.split('\n')
  const remaining = lines.pop() || ''
  
  for (const line of lines) {
    if (!line.trim()) continue
    
    const event = parseJsonLine(line)
    onEvent(event)
    if (event.type === 'complete' || event.type === 'error') {
      return ''
    }
  }
  
  return remaining
}

/**
 * 최종 버퍼 처리
 */
function processFinalBuffer(buffer: string, onEvent: StreamCallback): void {
  if (!buffer.trim()) return
  
  const event = parseJsonLine(buffer)
  onEvent(event)
}

/**
 * JSON 라인 파싱
 */
function parseJsonLine(line: string): StreamEvent {
  return JSON.parse(line)
}

// ============================================================================
// ANTLR Server API
// ============================================================================

export const antlrApi = {
  /**
   * 파일 업로드
   */
  async uploadFiles(
    metadata: BackendRequestMetadata,
    files: File[],
    headers: Headers
  ): Promise<FileUploadResponse> {
    const formData = new FormData()
    formData.append('metadata', JSON.stringify(metadata))
    
    // 디버그: 업로드 파일 경로 로깅
    console.log('[API] uploadFiles - 업로드할 파일 목록:')
    for (const file of files) {
      // 서버가 폴더 구조를 그대로 저장/복원할 수 있도록 "파일명" 자리에 상대경로를 넣어 전송
      const path = getNormalizedUploadPath(file)
      console.log(`  - ${path} (webkitRelativePath: ${(file as any).webkitRelativePath}, name: ${file.name})`)
      formData.append('files', file, path)
    }
    
    const ddlFiles = files.filter(f => getNormalizedUploadPath(f).startsWith('ddl/'))
    console.log(`[API] DDL 파일 수: ${ddlFiles.length}개`)
    
    return postFormData<FileUploadResponse>(
      `${ANTLR_BASE_URL}/fileUpload`, 
      formData, 
      headers
    )
  },
  
  /**
   * ANTLR 파싱 (일반 JSON 응답)
   */
  async parse(
    metadata: BackendRequestMetadata,
    headers: Headers
  ): Promise<ParseResponse> {
    return postJson<ParseResponse>(
      `${ANTLR_BASE_URL}/parsing`, 
      metadata, 
      headers
    )
  },
  
  /**
   * ANTLR 파싱 (스트림 방식)
   * ANTLR 서버가 스트림을 지원할 때 사용
   */
  async parseStream(
    metadata: BackendRequestMetadata,
    headers: Headers,
    onEvent: StreamCallback
  ): Promise<void> {
    await streamFetch(
      `${ANTLR_BASE_URL}/parsing`,
      metadata,
      headers,
      onEvent
    )
  }
}

// ============================================================================
// ROBO Analyzer API
// ============================================================================

export const roboApi = {
  /**
   * 소스 파일 분석 → Neo4j 그래프 생성
   * 
   * Request Body:
   *   strategy: "framework" | "dbms" (기본: framework)
   *   target: "java" | "oracle" | ... (기본: java)
   * 
   * Response: NDJSON 스트림
   */
  async analyze(
    metadata: BackendRequestMetadata,
    headers: Headers,
    onEvent: StreamCallback
  ): Promise<void> {
    await streamFetch(
      `${ROBO_BASE_URL}/analyze`,
      metadata,
      headers,
      onEvent
    )
  },
  
  /**
   * Neo4j에 기존 데이터 존재 여부 확인
   * 
   * Response: JSON { hasData: boolean, nodeCount: number }
   */
  async checkData(headers: Headers): Promise<{ hasData: boolean; nodeCount: number }> {
    const response = await fetch(`${ROBO_BASE_URL}/check-data/`, {
      method: 'GET',
      headers
    })
    
    if (!response.ok) {
      await handleHttpError(response)
    }
    
    return response.json()
  },
  
  /**
   * Neo4j에서 기존 그래프 데이터 조회
   * 
   * Response: JSON { Nodes: [...], Relationships: [...] }
   */
  async getGraphData(headers: Headers): Promise<{ 
    Nodes: Array<{ 'Node ID': string; Labels: string[]; Properties: Record<string, unknown> }>;
    Relationships: Array<{ 'Relationship ID': string; 'Start Node ID': string; 'End Node ID': string; Type: string; Properties: Record<string, unknown> }>;
  }> {
    const response = await fetch(`${ROBO_BASE_URL}/graph/`, {
      method: 'GET',
      headers
    })
    
    if (!response.ok) {
      await handleHttpError(response)
    }
    
    return response.json()
  },
  
  /**
   * 사용자 데이터 전체 삭제 (임시 파일 + Neo4j 그래프)
   * 
   * Response: JSON
   */
  async delete(headers: Headers): Promise<{ message: string }> {
    const response = await fetch(`${ROBO_BASE_URL}/delete/`, {
      method: 'DELETE',
      headers
    })
    
    if (!response.ok) {
      await handleHttpError(response)
    }
    
    return response.json()
  },

  // ========== 파이프라인 제어 API ==========
  // 진행 상태/단계는 분석 NDJSON 스트림의 phase_event 단일 채널 (폴링 엔드포인트 폐기).

  /**
   * 파이프라인 제어 (일시정지/재개/중단)
   */
  async controlPipeline(
    action: 'pause' | 'resume' | 'stop',
    headers: Headers
  ): Promise<PipelineControlResponse> {
    const response = await fetch(`${ROBO_BASE_URL}/analyze/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ action })
    })
    
    if (!response.ok) {
      await handleHttpError(response)
    }
    
    return response.json()
  }
}

// 파이프라인 제어 응답 — 백엔드 control 은 일시정지/중단 플래그만 반환
export interface PipelineControlResponse {
  success: boolean
  action: string
  status: { isPaused: boolean; isStopped: boolean }
}

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
      throw new Error(`HTTP ${response.status}`)
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
      throw new Error(`HTTP ${response.status}`)
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
      throw new Error(`HTTP ${response.status}`)
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
      throw new Error(`HTTP ${response.status}`)
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
      file_directory?: string  // 파일 경로
    }>
    framework_references?: Array<{
      source_name: string
      source_type: string   // "FUNCTION" | "MODULE"
      access_type: string   // "READS" | "WRITES" | "REFER_TO"
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
      throw new Error(`HTTP ${response.status}`)
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
      throw new Error(`HTTP ${response.status}`)
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
      throw new Error(`HTTP ${response.status}`)
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
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },

  /**
   * 테이블 설명 수정 (Neo4j)
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
   * 컬럼 설명 수정 (Neo4j)
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
  }
}

// Text2SQL/DataSources 모드(`dataSource !== 'robo'`)는 임베디드에서 미사용 — 진입점(setDataSource)
// 호출 0 인 죽은 분기였음. 관련 클라이언트 전부 폐기. 설명 수정은 roboSchemaApi 로 이전.
