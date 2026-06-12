/**
 * whatif-api.ts
 * What-If Simulator API 서비스 모듈
 * 
 * 주요 기능:
 * - 데이터 발견/수집
 * - Causal Discovery
 * - 모델 검증
 * - MindsDB 비교
 * - LLM 기반 데이터 리터러시
 */

// API Gateway를 통한 접근
// Gateway: /api/gateway/whatif/** -> http://localhost:8005/api/**
import { API_GATEWAY_URL, handleHttpError } from '@/shared/services/http'

const WHATIF_BASE_URL = `${API_GATEWAY_URL}/whatif`

// ============================================================================
// 타입 정의
// ============================================================================

export interface DiscoveredTable {
  table_name: string
  columns: string[]
  row_count: number
  sample_data: Array<Record<string, unknown>>
  relevance_score: number
  description: string
}

export interface DataDiscoveryResult {
  session_id: string
  query: string
  tables: DiscoveredTable[]
  suggested_sql: string
}

export interface CausalEdge {
  source: string
  target: string
  strength: number
  direction: 'positive' | 'negative'
  method: string
  p_value: number
  lag?: number
  formula?: string
  r_squared?: number
  source_label?: string
  target_label?: string
}

export interface CausalDiscoveryResult {
  session_id: string
  edges_count: number
  edges: CausalEdge[]
  summary: {
    total_edges: number
    strong_edges: number
    positive_count: number
    negative_count: number
    root_causes: Array<[string, number]>
    final_effects: Array<[string, number]>
  }
  influence_functions: Array<{
    source: string
    target: string
    formula: string
    slope: number
    intercept: number
    r_squared: number
    p_value: number
  }>
  validation: {
    total_validated: number
    valid_count: number
    overfit_count: number
    mean_r_squared: number
  }
}

export interface ValidationResult {
  total_validated: number
  valid_count: number
  overfit_count: number
  mean_r_squared: number
  results: Array<{
    edge_id: string
    r_squared: number
    train_r2: number
    test_r2: number
    rmse: number
    mape: number
    is_valid: boolean
    is_overfit: boolean
    notes: string[]
  }>
}

export interface PredictionChartData {
  edge: string
  source: string
  target: string
  labels: number[]
  actual: number[]
  causal_predicted: number[]
  ontology_predicted?: number[]
  ttm_predicted?: number[]
  source_values?: number[]
}

export interface TTMComparisonResult {
  comparisons: Array<{
    source: string
    target: string
    source_label?: string
    target_label?: string
    ontology?: {
      r2: number
      mape: number
      predictions: number[]
      actual: number[]
      error?: string
    }
    ttm?: {
      r2: number
      mape: number
      rmse?: number
      predictions: number[]
      model_name?: string
      available?: boolean
      note?: string
      error?: string
    }
  }>
  prediction_charts: PredictionChartData[]
  summary: {
    total_compared: number
    ttm_available: boolean
    ttm_model?: string
    ontology_mean_r2: number
    ttm_mean_r2: number
    ontology_wins: number
    ttm_wins: number
  }
}

export interface ComparisonResult {
  comparisons: Array<{
    edge: string
    source?: string
    target?: string
    source_label?: string
    target_label?: string
    causal_r2: number
    causal_mape?: number
    causal_strength?: number
    coefficient?: number
    intercept?: number
    train_samples?: number
    test_samples?: number
    mindsdb_r2: number | null
    mindsdb_mape?: number | null
    difference?: number
    better?: 'MindsDB' | 'Causal'
    error?: string
    note?: string
  }>
  prediction_charts?: PredictionChartData[]
  summary: {
    total_compared: number
    mean_causal_r2: number
    mean_mindsdb_r2: number
    avg_mape?: number
    good_fits?: number
    mindsdb_wins: number
    causal_wins: number
    train_ratio?: string
    test_ratio?: string
    note?: string
  }
}

export interface LiteracyExplanation {
  report_type: string
  language: string
  explanation: string
}

export interface SessionInfo {
  session_id: string
  created_at: string
  query?: string
  has_data: boolean
  data_rows: number
  columns: string[]
  has_causal_result: boolean
  has_validation: boolean
  has_comparison: boolean
}

export interface CollectedData {
  rows: number
  columns: string[]
  data: Array<Record<string, unknown>>
  dtypes: Record<string, string>
}

export interface UploadedFile {
  session_id: string
  filename: string
  rows: number
  columns: string[]
  sample_data: Array<Record<string, unknown>>
}

export interface PresentationSlide {
  title: string
  bullets: string[]
  notes: string
  chart_suggestion: string
}

// ============================================================================
// What-If Simulator API
// ============================================================================

// ============================================================================
// 에이전트 분석 결과 타입
// ============================================================================

export interface AgentVariable {
  name: string
  description: string
  variable_type: 'driver' | 'state' | 'kpi'
  data_type: 'numeric' | 'categorical' | 'temporal'
}

export interface AgentRelationship {
  source: string
  target: string
  direction: 'positive' | 'negative'
  strength: 'strong' | 'moderate' | 'weak'
  reasoning: string
}

export interface AgentDataSource {
  table_name: string
  columns: string[]
  row_count: number
  has_time_column: boolean
  time_column: string | null
  numeric_columns: string[]
  relevance_score: number
  sample_data: Array<Record<string, unknown>>
  validation_notes: string[]
}

export interface AgentAnalysisResult {
  session_id: string
  scenario: string
  variables: AgentVariable[]
  relationships: AgentRelationship[]
  data_sources: AgentDataSource[]
  validation_summary: {
    total_variables: number
    total_data_sources: number
    timeseries_ready: number
    sufficient_data: number
    total_numeric_columns: number
  }
  is_ready_for_causal: boolean
  recommendations: string[]
}

export const whatifApi = {
  // ========== 에이전트 분석 ==========

  /**
   * What-If 에이전트를 통한 시나리오 분석
   * Text2SQL 에이전트를 서브 에이전트로 활용
   */
  async analyzeScenario(scenario: string, useText2sql: boolean = true): Promise<AgentAnalysisResult> {
    const response = await fetch(`${WHATIF_BASE_URL}/agent/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario, use_text2sql: useText2sql })
    })
    
    if (!response.ok) {
      await handleHttpError(response)
    }
    
    return response.json()
  },

  // ========== 데이터 발견 ==========

  /**
   * 자연어 쿼리로 관련 데이터 발견
   */
  async discoverData(query: string, maxTables: number = 10): Promise<DataDiscoveryResult> {
    const response = await fetch(`${WHATIF_BASE_URL}/discovery/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, max_tables: maxTables })
    })
    
    if (!response.ok) {
      await handleHttpError(response)
    }
    
    return response.json()
  },

  /**
   * SQL 실행하여 데이터 수집
   */
  async collectData(sql: string, useMindsdb: boolean = false): Promise<CollectedData> {
    const response = await fetch(`${WHATIF_BASE_URL}/data/collect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, use_mindsdb: useMindsdb })
    })
    
    if (!response.ok) {
      await handleHttpError(response)
    }
    
    return response.json()
  },

  /**
   * CSV 파일 업로드
   */
  async uploadFile(file: File, sessionId?: string): Promise<UploadedFile> {
    const formData = new FormData()
    formData.append('file', file)
    if (sessionId) {
      formData.append('session_id', sessionId)
    }
    
    const response = await fetch(`${WHATIF_BASE_URL}/data/upload`, {
      method: 'POST',
      body: formData
    })
    
    if (!response.ok) {
      await handleHttpError(response)
    }
    
    return response.json()
  },

  // ========== Causal Discovery ==========

  /**
   * Causal Discovery 실행
   */
  async runCausalDiscovery(
    sessionId: string,
    methods: string[] = ['correlation', 'granger'],
    maxLag: number = 2,
    file?: File
  ): Promise<CausalDiscoveryResult> {
    const formData = new FormData()
    formData.append('session_id', sessionId)
    formData.append('methods', methods.join(','))
    formData.append('max_lag', maxLag.toString())
    
    if (file) {
      formData.append('file', file)
    }
    
    const response = await fetch(`${WHATIF_BASE_URL}/causal/discover`, {
      method: 'POST',
      body: formData
    })
    
    if (!response.ok) {
      await handleHttpError(response)
    }
    
    return response.json()
  },

  /**
   * 모델 검증 상세 결과 조회
   */
  async getValidation(sessionId: string): Promise<ValidationResult> {
    const response = await fetch(`${WHATIF_BASE_URL}/causal/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    })
    
    if (!response.ok) {
      await handleHttpError(response)
    }
    
    return response.json()
  },

  // ========== MindsDB 비교 ==========

  /**
   * Causal Discovery 결과와 MindsDB 모델 비교
   * @param sessionId 세션 ID
   * @param causalEdges Causal Discovery에서 발견된 엣지 목록
   * @param discoveredTables 발견된 테이블 목록 (선택)
   */
  async compareWithMindsdb(
    sessionId: string, 
    causalEdges?: CausalEdge[],
    discoveredTables?: string[]
  ): Promise<ComparisonResult> {
    const response = await fetch(`${WHATIF_BASE_URL}/mindsdb/compare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        session_id: sessionId,
        causal_edges: causalEdges,
        discovered_tables: discoveredTables
      })
    })
    
    if (!response.ok) {
      await handleHttpError(response)
    }
    
    return response.json()
  },

  /**
   * TTM (Time Series Foundation Model) 포함 3-way 비교
   * @param sessionId 세션 ID
   * @param causalEdges 엣지 목록
   * @param discoveredTables 테이블 목록
   * @param includeTTM TTM 모델 포함 여부
   */
  async compareWithTTM(
    sessionId: string,
    causalEdges?: CausalEdge[],
    discoveredTables?: string[],
    includeTTM: boolean = true
  ): Promise<TTMComparisonResult> {
    const response = await fetch(`${WHATIF_BASE_URL}/ttm/compare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        causal_edges: causalEdges,
        discovered_tables: discoveredTables,
        include_ttm: includeTTM
      })
    })
    
    if (!response.ok) {
      await handleHttpError(response)
    }
    
    return response.json()
  },

  /**
   * TTM 모델 정보 조회
   */
  async getTTMInfo(): Promise<{ available: boolean; model_name?: string; context_length?: number; prediction_length?: number }> {
    const response = await fetch(`${WHATIF_BASE_URL}/ttm/info`)
    if (!response.ok) {
      return { available: false }
    }
    return response.json()
  },

  /**
   * MindsDB 모델 생성
   */
  async createMindsdbModel(
    sessionId: string,
    modelName: string,
    target: string,
    features: string[]
  ): Promise<{ model_name: string; target: string; features: string[]; result: unknown }> {
    const formData = new FormData()
    formData.append('session_id', sessionId)
    formData.append('model_name', modelName)
    formData.append('target', target)
    formData.append('features', features.join(','))
    
    const response = await fetch(`${WHATIF_BASE_URL}/mindsdb/create-model`, {
      method: 'POST',
      body: formData
    })
    
    if (!response.ok) {
      await handleHttpError(response)
    }
    
    return response.json()
  },

  // ========== 데이터 리터러시 ==========

  /**
   * LLM 기반 분석 결과 설명 생성
   */
  async getExplanation(
    sessionId: string,
    reportType: 'summary' | 'discovery' | 'validation' | 'comparison' = 'summary',
    language: 'ko' | 'en' = 'ko'
  ): Promise<LiteracyExplanation> {
    const response = await fetch(`${WHATIF_BASE_URL}/literacy/explain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, report_type: reportType, language })
    })
    
    if (!response.ok) {
      await handleHttpError(response)
    }
    
    return response.json()
  },

  /**
   * 프레젠테이션 슬라이드 생성
   */
  async generatePresentation(
    sessionId: string,
    slidesCount: number = 5,
    language: 'ko' | 'en' = 'ko'
  ): Promise<{ slides: PresentationSlide[] }> {
    const formData = new FormData()
    formData.append('session_id', sessionId)
    formData.append('slides_count', slidesCount.toString())
    formData.append('language', language)
    
    const response = await fetch(`${WHATIF_BASE_URL}/literacy/presentation`, {
      method: 'POST',
      body: formData
    })
    
    if (!response.ok) {
      await handleHttpError(response)
    }
    
    return response.json()
  },

  // ========== Neo4j 저장 ==========

  /**
   * 발견된 인과관계를 Neo4j에 온톨로지로 저장
   */
  async saveToNeo4j(sessionId: string): Promise<{ 
    saved: boolean; 
    nodes_count: number; 
    edges_count: number;
    message: string 
  }> {
    const response = await fetch(`${WHATIF_BASE_URL}/neo4j/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    })
    
    if (!response.ok) {
      await handleHttpError(response)
    }
    
    return response.json()
  },

  /**
   * Neo4j에서 인과관계 그래프 조회
   */
  async getFromNeo4j(sessionId: string): Promise<{
    nodes: Array<{ id: string; label: string; type: string }>;
    edges: Array<{ source: string; target: string; strength: number; direction: string }>;
  }> {
    const response = await fetch(`${WHATIF_BASE_URL}/neo4j/graph/${sessionId}`)
    
    if (!response.ok) {
      await handleHttpError(response)
    }
    
    return response.json()
  },

  // ========== 세션 관리 ==========

  /**
   * 세션 정보 조회
   */
  async getSession(sessionId: string): Promise<SessionInfo> {
    const response = await fetch(`${WHATIF_BASE_URL}/sessions/${sessionId}`)
    
    if (!response.ok) {
      await handleHttpError(response)
    }
    
    return response.json()
  },

  /**
   * 모든 세션 목록
   */
  async listSessions(): Promise<{ sessions: Array<{ session_id: string; created_at: string; query: string }> }> {
    const response = await fetch(`${WHATIF_BASE_URL}/sessions`)
    
    if (!response.ok) {
      await handleHttpError(response)
    }
    
    return response.json()
  },

  /**
   * 세션 삭제
   */
  async deleteSession(sessionId: string): Promise<{ deleted: boolean }> {
    const response = await fetch(`${WHATIF_BASE_URL}/sessions/${sessionId}`, {
      method: 'DELETE'
    })
    
    if (!response.ok) {
      await handleHttpError(response)
    }
    
    return response.json()
  },

  /**
   * API 상태 확인
   */
  async healthCheck(): Promise<{ status: string; service: string; version: string }> {
    const response = await fetch(`${WHATIF_BASE_URL}/`)
    
    if (!response.ok) {
      await handleHttpError(response)
    }
    
    return response.json()
  }
}
