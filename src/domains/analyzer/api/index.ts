import type { AnalyzeEvent, BackendRequestMetadata, FileUploadResponse, SearchEvent } from '@/shared/types'
import type { Headers, StreamCallback } from '@/shared/services/http'
import { ANALYZER_BASE_URL as ROBO_BASE_URL } from './baseUrl'
import { analyzerHttp } from './http'
import { toAnalyzeRequestBody } from './analyzeRequest'

export interface PipelinePhaseInfo {
  phase: string
  name: string
  description: string
  order: number
  canPause: boolean
}

export interface PipelineStatus {
  currentPhase: string
  phaseName: string
  phaseOrder: number
  isPaused: boolean
  isStopped: boolean
  phaseProgress: number
  phaseMessage: string
  phases: PipelinePhaseInfo[]
}

export interface PipelineControlResponse {
  success: boolean
  action: string
  status: PipelineStatus
}

/** 이 프로젝트에 올린 소스 — 업로드 응답과 같은 칸 + 상한에 걸려 잘렸는지. */
export interface UploadedSourcesResponse extends FileUploadResponse {
  truncated?: boolean
}

export const analyzerApi = {
  /**
   * 서버에 남은 업로드 소스(analyzer `GET /robo/analyze/source-files`).
   * 「코드」 화면 목록이 이 브라우저에 없을 때(다른 PC·브라우저) 되살리는 데 쓴다.
   */
  async getUploadedSources(headers: Headers): Promise<UploadedSourcesResponse> {
    const response = await fetch(`${ROBO_BASE_URL}/analyze/source-files`, {
      method: 'GET',
      headers,
    })
    if (!response.ok) await analyzerHttp.handleError(response)
    return response.json()
  },

  async analyze(
    metadata: BackendRequestMetadata,
    headers: Headers,
    onEvent: (event: AnalyzeEvent) => void,
  ): Promise<void> {
    await analyzerHttp.stream(
      `${ROBO_BASE_URL}/analyze`,
      toAnalyzeRequestBody(metadata),
      headers,
      onEvent as unknown as StreamCallback,
    )
  },

  async searchSemantic(
    body: { query: string; limit?: number },
    headers: Headers,
    onEvent: (event: SearchEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    await analyzerHttp.stream(
      `${ROBO_BASE_URL}/search/semantic`,
      body,
      headers,
      onEvent as unknown as StreamCallback,
      signal,
    )
  },

  async controlPipeline(
    action: 'pause' | 'resume' | 'stop',
    headers: Headers,
  ): Promise<PipelineControlResponse> {
    const response = await fetch(`${ROBO_BASE_URL}/analyze/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ action }),
    })
    if (!response.ok) await analyzerHttp.handleError(response)
    return response.json()
  },
}
