import type {
  CausalAnalysisProgress,
  CausalAnalysisResult,
  CausalIncomingNetwork,
} from '@/domains/ontology'
import type { OntologyNodeDataResult } from '@/domains/ontology'
import { inferAnalysisTypeFromRange } from '../model/causalBrush'

export type CausalAnalysisPhase = 'idle' | 'running' | 'result' | 'failure' | 'cancelled'
export type CausalAnalysisType = 'increase' | 'decrease'

export interface CausalBrushSelection {
  start: string
  end: string
  targetMetric: string
  analysisType: CausalAnalysisType
}

export interface CausalAnalysisRequest {
  time_range: {
    start: string
    end: string
  }
  target_metric: string
  analysis_type: CausalAnalysisType
  max_lag: number
}

export interface CausalAnalysisViewState {
  phase: CausalAnalysisPhase
  result: CausalAnalysisResult | null
  error: string | null
  notice: string | null
  highlightWarning: string | null
  progress: CausalAnalysisProgress | null
  streamingReport: string
}

export interface CausalHighlightProjection {
  nodeIds: string[]
  edgePairs: Array<readonly [string, string]>
}

export const EMPTY_CAUSAL_HIGHLIGHT: CausalHighlightProjection = {
  nodeIds: [],
  edgePairs: [],
}

export function createIdleCausalAnalysisState(): CausalAnalysisViewState {
  return {
    phase: 'idle',
    result: null,
    error: null,
    notice: null,
    highlightWarning: null,
    progress: null,
    streamingReport: '',
  }
}

export function createRunningCausalAnalysisState(): CausalAnalysisViewState {
  return {
    ...createIdleCausalAnalysisState(),
    phase: 'running',
  }
}

export function applyCausalAnalysisProgress(
  state: CausalAnalysisViewState,
  progress: CausalAnalysisProgress,
): CausalAnalysisViewState {
  if (state.phase !== 'running') return state
  return {
    ...state,
    progress: {
      ...progress,
      message: progress.step === 'report_chunk'
        ? '보고서 생성 중...'
        : progress.message,
    },
    streamingReport: progress.step === 'report_chunk'
      ? state.streamingReport + progress.message
      : state.streamingReport,
  }
}

export function completeCausalAnalysis(
  state: CausalAnalysisViewState,
  result: CausalAnalysisResult,
): CausalAnalysisViewState {
  return {
    ...state,
    phase: 'result',
    result,
    error: null,
    notice: null,
    progress: null,
  }
}

export function failCausalAnalysis(
  state: CausalAnalysisViewState,
  error: string,
): CausalAnalysisViewState {
  return {
    ...state,
    phase: 'failure',
    result: null,
    error,
    notice: null,
    progress: null,
  }
}

export function cancelCausalAnalysis(state: CausalAnalysisViewState): CausalAnalysisViewState {
  return {
    ...state,
    phase: 'cancelled',
    result: null,
    error: null,
    notice: '인과 분석을 취소했습니다. 같은 구간과 메트릭으로 다시 실행할 수 있습니다.',
    progress: null,
  }
}

export function withCausalHighlightWarning(
  state: CausalAnalysisViewState,
  warning: string,
): CausalAnalysisViewState {
  return {
    ...state,
    highlightWarning: warning,
  }
}

export function buildCausalAnalysisRequest(
  selection: CausalBrushSelection,
  analysisType: CausalAnalysisType = selection.analysisType,
): CausalAnalysisRequest {
  return {
    time_range: {
      start: selection.start,
      end: selection.end,
    },
    target_metric: selection.targetMetric,
    analysis_type: analysisType,
    max_lag: 7,
  }
}

export function projectCausalHighlight(
  network: CausalIncomingNetwork,
): CausalHighlightProjection {
  return {
    nodeIds: Array.from(new Set(network.nodes.map(node => node.id))),
    edgePairs: Array.from(
      new Map(
        network.relationships.map(relationship => [
          `${relationship.source}\t${relationship.target}`,
          [relationship.source, relationship.target] as const,
        ]),
      ).values(),
    ),
  }
}

export function resolveCausalMetricOptions(
  data: OntologyNodeDataResult | null,
): string[] {
  const preferred = data?.chartRecommendation?.yAxis ?? []
  const numeric = data?.numericColumns ?? []
  return Array.from(new Set([...preferred, ...numeric].filter(Boolean)))
}

export function resolvePreferredCausalMetric(
  currentMetric: string | null,
  configuredMetrics: string[],
  candidateMetrics: string[],
): string | null {
  const available = Array.from(new Set([
    ...configuredMetrics,
    ...candidateMetrics,
  ].filter(Boolean)))
  if (currentMetric && available.includes(currentMetric)) return currentMetric
  return available[0] ?? null
}

export function resolveCausalXAxis(data: OntologyNodeDataResult | null): string | null {
  return data?.chartRecommendation?.xAxis
    || data?.timeColumns?.[0]
    || data?.columns?.[0]
    || null
}

export function createCausalBrushSelection(
  rows: Array<Record<string, unknown>>,
  xAxis: string,
  startIndex: number,
  endIndex: number,
  targetMetric: string,
): CausalBrushSelection | null {
  if (startIndex < 0 || endIndex <= startIndex || endIndex >= rows.length) return null
  const startRaw = rows[startIndex]?.[xAxis]
  const endRaw = rows[endIndex]?.[xAxis]
  if (startRaw == null || endRaw == null) return null

  return {
    start: startRaw instanceof Date ? startRaw.toISOString() : String(startRaw),
    end: endRaw instanceof Date ? endRaw.toISOString() : String(endRaw),
    targetMetric,
    analysisType: inferAnalysisTypeFromRange(rows, targetMetric, startIndex, endIndex),
  }
}
