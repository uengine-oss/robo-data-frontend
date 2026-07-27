/**
 * What-if service API client.
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
import { API_GATEWAY_URL } from '@/shared/services/http'
import { useRuntimeStore } from '@/shared/stores/runtime'
import {
  whatIfHttp,
  whatIfMindsDbComparisonHttp,
  whatIfTtmComparisonHttp,
} from './http'
import type {
  AgentAnalysisResult,
  CausalDiscoveryResult,
  CausalEdge,
  CollectedData,
  ComparisonResult,
  DataDiscoveryResult,
  DeleteSessionResult,
  LiteracyExplanation,
  MindsDbModelCreationResult,
  Neo4jGraphResult,
  Neo4jSaveResult,
  PresentationResult,
  SessionInfo,
  SessionListResult,
  TTMComparisonResult,
  TTMInfo,
  UploadedFile,
  ValidationResult,
  WhatIfHealth,
} from '../model/contracts'
import {
  parseAgentAnalysisResult,
  parseCausalDiscoveryResult,
  parseCollectedData,
  parseComparisonResult,
  parseDataDiscoveryResult,
  parseDeleteSessionResult,
  parseLiteracyExplanation,
  parseMindsDbModelCreationResult,
  parseNeo4jGraphResult,
  parseNeo4jSaveResult,
  parsePresentationResult,
  parseSessionInfo,
  parseSessionListResult,
  parseTTMComparisonResult,
  parseTTMInfo,
  parseUploadedFile,
  parseValidationResult,
  parseWhatIfHealth,
} from './contracts'

const handleHttpError = whatIfHttp.handleError

export interface WhatIfClientDependencies {
  baseUrl?: string
  getHeaders?: () => Record<string, string>
  fetchImpl?: typeof fetch
}

async function parseJsonResponse<T>(
  response: Response,
  parser: (value: unknown) => T,
  errorHandler: (response: Response) => Promise<never> = handleHttpError,
): Promise<T> {
  if (!response.ok) await errorHandler(response)
  return parser(await response.json())
}

export function createWhatIfClient(
  dependencies: WhatIfClientDependencies = {},
) {
  const baseUrl = dependencies.baseUrl ?? `${API_GATEWAY_URL}/whatif`
  const getHeaders = dependencies.getHeaders ?? (() => ({}))
  const fetchImpl = dependencies.fetchImpl ?? fetch
  const sessionHeaders = () => ({ ...getHeaders() })
  const jsonSessionHeaders = () => ({
    ...getHeaders(),
    'Content-Type': 'application/json',
  })

  return {
  // ========== 에이전트 분석 ==========

  /**
   * What-If 에이전트를 통한 시나리오 분석
   * Text2SQL 에이전트를 서브 에이전트로 활용
   */
  async analyzeScenario(scenario: string, useText2sql: boolean = true): Promise<AgentAnalysisResult> {
    const response = await fetchImpl(`${baseUrl}/agent/analyze`, {
      method: 'POST',
      headers: jsonSessionHeaders(),
      body: JSON.stringify({ scenario, use_text2sql: useText2sql })
    })

    return parseJsonResponse(response, parseAgentAnalysisResult)
  },

  // ========== 데이터 발견 ==========

  /**
   * 자연어 쿼리로 관련 데이터 발견
   */
  async discoverData(query: string, maxTables: number = 10): Promise<DataDiscoveryResult> {
    const response = await fetchImpl(`${baseUrl}/discovery/search`, {
      method: 'POST',
      headers: jsonSessionHeaders(),
      body: JSON.stringify({ query, max_tables: maxTables })
    })

    return parseJsonResponse(response, parseDataDiscoveryResult)
  },

  /**
   * SQL 실행하여 데이터 수집
   */
  async collectData(sql: string, useMindsdb: boolean = false): Promise<CollectedData> {
    const response = await fetchImpl(`${baseUrl}/data/collect`, {
      method: 'POST',
      headers: jsonSessionHeaders(),
      body: JSON.stringify({ sql, use_mindsdb: useMindsdb })
    })

    return parseJsonResponse(response, parseCollectedData)
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

    const response = await fetchImpl(`${baseUrl}/data/upload`, {
      method: 'POST',
      headers: sessionHeaders(),
      body: formData
    })

    return parseJsonResponse(response, parseUploadedFile)
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

    const response = await fetchImpl(`${baseUrl}/causal/discover`, {
      method: 'POST',
      headers: sessionHeaders(),
      body: formData
    })

    return parseJsonResponse(response, parseCausalDiscoveryResult)
  },

  /**
   * 모델 검증 상세 결과 조회
   */
  async getValidation(sessionId: string): Promise<ValidationResult> {
    const response = await fetchImpl(`${baseUrl}/causal/validate`, {
      method: 'POST',
      headers: jsonSessionHeaders(),
      body: JSON.stringify({ session_id: sessionId })
    })

    return parseJsonResponse(response, parseValidationResult)
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
    const response = await fetchImpl(`${baseUrl}/mindsdb/compare`, {
      method: 'POST',
      headers: jsonSessionHeaders(),
      body: JSON.stringify({
        session_id: sessionId,
        causal_edges: causalEdges,
        discovered_tables: discoveredTables
      })
    })

    return parseJsonResponse(
      response,
      parseComparisonResult,
      whatIfMindsDbComparisonHttp.handleError,
    )
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
    const response = await fetchImpl(`${baseUrl}/ttm/compare`, {
      method: 'POST',
      headers: jsonSessionHeaders(),
      body: JSON.stringify({
        session_id: sessionId,
        causal_edges: causalEdges,
        discovered_tables: discoveredTables,
        include_ttm: includeTTM
      })
    })

    return parseJsonResponse(
      response,
      parseTTMComparisonResult,
      whatIfTtmComparisonHttp.handleError,
    )
  },

  /**
   * TTM 모델 정보 조회
   */
  async getTTMInfo(): Promise<TTMInfo> {
    const response = await fetchImpl(`${baseUrl}/ttm/info`, {
      headers: sessionHeaders(),
    })
    if (!response.ok) {
      return { available: false }
    }
    return parseJsonResponse(response, parseTTMInfo)
  },

  /**
   * MindsDB 모델 생성
   */
  async createMindsdbModel(
    sessionId: string,
    modelName: string,
    target: string,
    features: string[]
  ): Promise<MindsDbModelCreationResult> {
    const formData = new FormData()
    formData.append('session_id', sessionId)
    formData.append('model_name', modelName)
    formData.append('target', target)
    formData.append('features', features.join(','))

    const response = await fetchImpl(`${baseUrl}/mindsdb/create-model`, {
      method: 'POST',
      headers: sessionHeaders(),
      body: formData
    })

    return parseJsonResponse(response, parseMindsDbModelCreationResult)
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
    const response = await fetchImpl(`${baseUrl}/literacy/explain`, {
      method: 'POST',
      headers: jsonSessionHeaders(),
      body: JSON.stringify({ session_id: sessionId, report_type: reportType, language })
    })

    return parseJsonResponse(response, parseLiteracyExplanation)
  },

  /**
   * 프레젠테이션 슬라이드 생성
   */
  async generatePresentation(
    sessionId: string,
    slidesCount: number = 5,
    language: 'ko' | 'en' = 'ko'
  ): Promise<PresentationResult> {
    const formData = new FormData()
    formData.append('session_id', sessionId)
    formData.append('slides_count', slidesCount.toString())
    formData.append('language', language)

    const response = await fetchImpl(`${baseUrl}/literacy/presentation`, {
      method: 'POST',
      headers: sessionHeaders(),
      body: formData
    })

    return parseJsonResponse(response, parsePresentationResult)
  },

  // ========== Neo4j 저장 ==========

  /**
   * 발견된 인과관계를 Neo4j에 온톨로지로 저장
   */
  async saveToNeo4j(sessionId: string): Promise<Neo4jSaveResult> {
    const response = await fetchImpl(`${baseUrl}/neo4j/save`, {
      method: 'POST',
      headers: jsonSessionHeaders(),
      body: JSON.stringify({ session_id: sessionId })
    })

    return parseJsonResponse(response, parseNeo4jSaveResult)
  },

  /**
   * Neo4j에서 인과관계 그래프 조회
   */
  async getFromNeo4j(sessionId: string): Promise<Neo4jGraphResult> {
    const response = await fetchImpl(`${baseUrl}/neo4j/graph/${sessionId}`, {
      headers: sessionHeaders(),
    })

    return parseJsonResponse(response, parseNeo4jGraphResult)
  },

  // ========== 세션 관리 ==========

  /**
   * 세션 정보 조회
   */
  async getSession(sessionId: string): Promise<SessionInfo> {
    const response = await fetchImpl(`${baseUrl}/sessions/${sessionId}`, {
      headers: sessionHeaders(),
    })

    return parseJsonResponse(response, parseSessionInfo)
  },

  /**
   * 모든 세션 목록
   */
  async listSessions(): Promise<SessionListResult> {
    const response = await fetchImpl(`${baseUrl}/sessions`, {
      headers: sessionHeaders(),
    })

    return parseJsonResponse(response, parseSessionListResult)
  },

  /**
   * 세션 삭제
   */
  async deleteSession(sessionId: string): Promise<DeleteSessionResult> {
    const response = await fetchImpl(`${baseUrl}/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: sessionHeaders(),
    })

    return parseJsonResponse(response, parseDeleteSessionResult)
  },

  /**
   * API 상태 확인
   */
  async healthCheck(): Promise<WhatIfHealth> {
    const response = await fetchImpl(`${baseUrl}/`, {
      headers: sessionHeaders(),
    })

    return parseJsonResponse(response, parseWhatIfHealth)
  }
  }
}

export const whatifApi = createWhatIfClient({
  getHeaders: () => useRuntimeStore().getHeaders(),
})
