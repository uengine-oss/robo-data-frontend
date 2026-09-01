import type { AnalyzeEvent, BackendRequestMetadata, SearchEvent } from '@/shared/types'
import type { Headers, StreamCallback } from '@/shared/services/http'
import { ANALYZER_BASE_URL as ROBO_BASE_URL } from './baseUrl'
import { analyzerHttp } from './http'

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

export const analyzerApi = {
  async analyze(
    metadata: BackendRequestMetadata,
    headers: Headers,
    onEvent: (event: AnalyzeEvent) => void,
  ): Promise<void> {
    await analyzerHttp.stream(
      `${ROBO_BASE_URL}/analyze`,
      metadata,
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
