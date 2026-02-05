/**
 * types/index.ts
 * 애플리케이션 전역 타입 정의
 */

// ============================================================================
// 기본 타입
// ============================================================================

/** 소스 코드 타입 */
export type SourceType = 'oracle' | 'postgresql' | 'java' | 'python'

/** 백엔드 전략 타입 */
export type Strategy = 'dbms' | 'framework'

// ============================================================================
// 프로젝트 메타데이터
// ============================================================================

/** 프로젝트 메타데이터 (프론트엔드용) */
export interface ProjectMetadata {
  sourceType: SourceType
  /** ddl 폴더 하위 상대경로 목록 (예: 'tables/a.sql') */
  ddl: string[]
}

/** 백엔드 API 요청용 메타데이터 */
export type NameCaseOption = 'original' | 'uppercase' | 'lowercase'

export interface BackendRequestMetadata {
  strategy: Strategy
  target: SourceType
  nameCase?: NameCaseOption
  datasourceName?: string | null  // 타겟 데이터 소스 이름
  inferFkRelations?: boolean  // FK 관계 자동 추론 여부 (기본: false)
}

// ============================================================================
// 파일
// ============================================================================

/** 업로드된 파일 */
export interface UploadedFile {
  fileName: string
  fileContent: string
}

// 파싱 결과는 더 이상 JSON으로 받지 않음 (파싱 완료만 표시)

// ============================================================================
// Neo4j 응답 (백엔드 원본 형식)
// ============================================================================

/** Neo4j 노드 */
export interface Neo4jNode {
  'Node ID': string
  'Labels': string[]
  'Properties': Record<string, unknown>
}

/** Neo4j 관계 */
export interface Neo4jRelationship {
  'Relationship ID': string
  'Type': string
  'Properties': Record<string, unknown>
  'Start Node ID': string
  'End Node ID': string
}

/** Neo4j 그래프 응답 */
export interface Neo4jGraphResponse {
  Nodes: Neo4jNode[]
  Relationships: Neo4jRelationship[]
}

// ============================================================================
// 내부 그래프 데이터
// ============================================================================

/** 그래프 노드 */
export interface GraphNode {
  id: string
  labels: string[]
  properties: Record<string, unknown>
}

/** 그래프 링크 */
export interface GraphLink {
  id: string
  source: string
  target: string
  type: string
  properties: Record<string, unknown>
}

/** 그래프 데이터 */
export interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}

// ============================================================================
// NVL (Neo4j Visualization Library)
// ============================================================================

/** NVL 노드 */
export interface NvlNode {
  id: string
  caption?: string
  color?: string
  size?: number
  selected?: boolean  // NVL이 지원하는 selected 속성
  properties?: Record<string, unknown>
}

/** NVL 관계 */
export interface NvlRelationship {
  id: string
  from: string
  to: string
  caption?: string
  color?: string
  selected?: boolean  // NVL이 지원하는 selected 속성
  properties?: Record<string, unknown>
}

// ============================================================================
// 다이어그램 (VueFlow 기반)
// ============================================================================

/** 클래스 정보 (다이어그램 검색용) */
export interface ClassInfo {
  className: string
  directory: string
  fileName: string
  type: 'CLASS' | 'INTERFACE'
}

// ============================================================================
// 스트리밍
// ============================================================================

/** 스트림 메시지 타입 */
export type StreamMessageType = 'message' | 'error' | 'data' | 'status'

/** 스트림 이벤트 타입 */
export type StreamEventType = 'message' | 'data' | 'status' | 'complete' | 'error' | 'phase_event' | 'canvas_update'

/** 스트림 메시지 (UI 표시용) */
export interface StreamMessage {
  type: StreamMessageType
  content: string
  timestamp: string
}

/** 스트림 이벤트 (백엔드 응답) */
export interface StreamEvent {
  type: StreamEventType
  content?: string
  
  // Neo4j 그래프 데이터
  Nodes?: Neo4jNode[]
  Relationships?: Neo4jRelationship[]
  graph?: Neo4jGraphResponse
  
  // 파일 데이터
  file_type?: string
  file_name?: string
  directory?: string
  code?: string
  
  // 진행 상태 (status 이벤트용)
  step?: number
  done?: boolean
  
  // Phase 이벤트 (phase_event 용)
  phase?: number
  name?: string
  status?: 'started' | 'in_progress' | 'completed' | 'skipped' | 'error'
  progress?: number
  details?: Record<string, unknown>
  
  // 캔버스 업데이트 이벤트 (canvas_update 용)
  updateType?: 'table_description' | 'column_description' | 'relationship_added' | 'column_added' | 'table_added'
  tableName?: string
  schema?: string
  field?: string
  changes?: Record<string, unknown>
  
  // 에러 정보
  errorType?: string
  traceId?: string
  summary?: string
}

// ============================================================================
// API 응답
// ============================================================================

/** 파일 업로드 응답 */
export interface FileUploadResponse {
  files: UploadedFile[]
  ddlFiles: UploadedFile[]
}

/** 파싱 응답 (단순 완료 상태만) */
export interface ParseResponse {
  status?: 'complete'
}

// ============================================================================
// VueFlow UML 클래스 다이어그램
// ============================================================================

/** UML 클래스 다이어그램에서 선택된 클래스 정보 */
export interface SelectedClassInfo {
  className: string
  directory: string
}

/** UML 클래스 다이어그램 상태 */
export interface UmlDiagramState {
  selectedClasses: SelectedClassInfo[]
  depth: number
}

// ============================================================================
// Text2SQL (ReAct)
// ============================================================================

/** Text2SQL 테이블 정보 */
export interface Text2SqlTableInfo {
  name: string
  schema: string
  datasource?: string  // 데이터소스명 (예: robo_postgres, ontology)
  description: string
  description_source?: 'ddl' | 'procedure' | 'user' | ''  // 설명 출처
  analyzed_description?: string  // 프로시저 분석에서 도출된 설명
  column_count: number
}

/** Text2SQL 컬럼 정보 */
export interface Text2SqlColumnInfo {
  name: string
  table_name: string
  dtype: string
  nullable: boolean
  description: string
  description_source?: 'ddl' | 'procedure' | 'user' | ''  // 설명 출처
  analyzed_description?: string  // 프로시저 분석에서 도출된 설명
}

/** ReAct SQL 완성도 */
export interface ReactSQLCompleteness {
  is_complete: boolean
  missing_info: string
  confidence_level: string
}

/** ReAct 도구 호출 모델 */
export interface ReactToolCallModel {
  name: string
  raw_parameters_xml: string
  parameters: Record<string, unknown>
}

/** ReAct 스텝 모델 */
export interface ReactStepModel {
  iteration: number
  reasoning: string
  metadata_xml: string
  partial_sql: string
  sql_completeness: ReactSQLCompleteness
  tool_call: ReactToolCallModel
  tool_result?: string | null
  llm_output: string
}

/** ReAct 실행 결과 */
export interface ReactExecutionResult {
  columns: string[]
  rows: unknown[][]
  row_count: number
  execution_time_ms: number
}

/** ReAct 응답 모델 */
export interface ReactResponseModel {
  status: 'completed' | 'needs_user_input'
  final_sql?: string | null
  validated_sql?: string | null
  execution_result?: ReactExecutionResult | null
  steps: ReactStepModel[]
  collected_metadata: string
  partial_sql: string
  remaining_tool_calls: number
  session_state?: string | null
  question_to_user?: string | null
  warnings?: string[] | null
}

/** ReAct 요청 */
export interface ReactRequest {
  question: string
  dbms?: string | null
  max_tool_calls?: number
  execute_final_sql?: boolean
  max_iterations?: number | null
  session_state?: string | null
  user_response?: string | null
  max_sql_seconds?: number
  prefer_language?: string
  /** 디버그용: raw XML 토큰 스트림(event=token)을 함께 받을지 */
  debug_stream_xml_tokens?: boolean
  /** 동일 질문에 대해 캐시 사용 여부 */
  use_cache?: boolean
  /** 검색 대상 스키마 제한 (예: ['dw']는 OLAP 데이터만 검색) */
  schema_filter?: string[]
  /** ObjectType(Materialized View) 테이블만 검색 (도메인 레이어 모드) */
  object_type_only?: boolean
  /** 연결된 ObjectType 정보 (프롬프트 확장용) */
  linked_object_types?: Array<{
    name: string
    columns: Array<{ name: string; type: string }>
    description?: string
  }>
  /** 계리수식/공식 우선 검색 모드 */
  prefer_formula?: boolean
}

/** ReAct Phase 데이터 */
export interface ReactPhaseData {
  reasoning?: string
  partial_sql?: string
  sql_completeness?: ReactSQLCompleteness
  tool_name?: string
  tool_parameters?: Record<string, unknown>
  tool_result_preview?: string
}

/** ReAct 스트림 이벤트 */
export type ReactStreamEvent =
  | {
      event: 'token'
      iteration: number
      token: string
    }
  | {
      event: 'section_delta'
      iteration: number
      /** extractor가 추출한 섹션/필드 키 (예: reasoning, partial_sql, tool_call.tool_name 등) */
      section: string
      /** 해당 섹션에 append 할 델타 */
      delta: string
    }
  | {
      event: 'metadata_item'
      iteration: number
      item_type: 'table' | 'column' | 'value' | 'relationship' | 'constraint'
      item: Record<string, unknown>
    }
  | {
      event: 'format_repair'
      iteration: number
      reason: string
    }
  | {
      event: 'phase'
      phase: 'thinking' | 'reasoning' | 'acting' | 'observing'
      iteration: number
      data: ReactPhaseData
      state: Record<string, unknown>
    }
  | {
      event: 'step'
      step: ReactStepModel
      state: Record<string, unknown>
    }
  | {
      event: 'completed'
      response: ReactResponseModel
      state: Record<string, unknown>
    }
  | {
      event: 'needs_user_input'
      response: ReactResponseModel
      state: Record<string, unknown>
    }
  | {
      event: 'error'
      message: string
    }

/** ReAct 상태 */
export type ReactStatus = 'idle' | 'running' | 'needs_user_input' | 'completed' | 'error'

/** ReAct Phase 상태 */
export type ReactPhase = 'idle' | 'thinking' | 'reasoning' | 'acting' | 'observing'

// ============================================================================
// 도메인 온톨로지 스키마
// ============================================================================

/** 온톨로지 라벨 타입 (PRD 정의) */
export type OntologyLabelType = 'Asset' | 'System' | 'Component' | 'Event' | string

/** 온톨로지 라벨 정의 */
export interface OntologyLabel {
  name: string
  description?: string
  icon?: string
  color?: string
}

/** 온톨로지 노드 속성 */
export interface OntologyNodeProperty {
  name: string
  type: 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'json'
  description?: string
  required?: boolean
}

/** 온톨로지 노드 */
export interface OntologyNode {
  id: string
  name: string
  label: OntologyLabelType
  description?: string
  properties?: OntologyNodeProperty[]
  dataSource?: string  // 바인딩된 테이블/뷰 이름
  dataSourceSchema?: string  // 스키마명
  materializedView?: string  // 생성된 Materialized View 이름
  instanceCount?: number  // 인스턴스 수 (실시간)
  position?: { x: number; y: number }  // VueFlow 위치
}

/** 온톨로지 관계 타입 */
export type OntologyRelationshipType = 
  | 'CONTAINS'
  | 'OPERATES'
  | 'GENERATES'
  | 'BELONGS_TO'
  | 'MONITORS'
  | 'TRIGGERS'
  | string

/** 온톨로지 관계 */
export interface OntologyRelationship {
  id: string
  source: string  // source node id
  target: string  // target node id
  type: OntologyRelationshipType
  description?: string
  properties?: Record<string, unknown>
}

/** 온톨로지 스키마 (전체) */
export interface OntologySchema {
  id?: string
  name: string
  description?: string
  domain?: string  // 예: "스마트 정수장 운영 관리"
  nodes: OntologyNode[]
  relationships: OntologyRelationship[]
  labels: OntologyLabel[]
  createdAt?: string
  updatedAt?: string
  version?: number
}

/** 노드 인스턴스 데이터 */
export interface NodeInstanceData {
  nodeId: string
  nodeName: string
  dataSource: string
  totalCount: number
  previewData: {
    columns: string[]
    rows: unknown[][]
  }
  lastUpdated?: string
}

/** 스키마 생성 요청 */
export interface GenerateSchemaRequest {
  inputType: 'text' | 'pdf'
  text?: string
  pdfUrl?: string
  pdfContent?: string  // Base64 encoded
  domainHint?: string
}

/** 스키마 생성 응답 */
export interface GenerateSchemaResponse {
  success: boolean
  schema?: OntologySchema
  error?: string
  warnings?: string[]
}

/** 피드백 적용 요청 */
export interface ApplyFeedbackRequest {
  currentSchema: OntologySchema
  feedback: string
}

/** 피드백 적용 응답 */
export interface ApplyFeedbackResponse {
  success: boolean
  schema?: OntologySchema
  changes?: string[]
  error?: string
}

/** 데이터 소스 바인딩 요청 */
export interface BindDataSourceRequest {
  nodeId: string
  dataSource: string
  schema?: string
}

/** Materialized View 생성 요청 */
export interface CreateMaterializedViewRequest {
  nodeId: string
  viewName?: string
  refreshInterval?: number  // 분 단위
}