export interface CausalAnalysisNodeStatus {
  node_id: string
  node_name: string
  has_data_source: boolean
  data_source: string | null
  status: string
  reason: string | null
  row_count: number
  column_count: number
  numeric_column_count: number
}

export interface CausalAnalysisTopCause {
  source: string
  name: string
  score: number
  display_score: number
  grade: string
  method: string
  method_hint: string
  method_count: number
}

export interface CausalAnalysisResult {
  success: boolean
  target_node_id?: string
  target_metric?: string
  analysis_type?: string
  time_range?: { start: string; end: string }
  edges?: Array<{
    source: string
    target: string
    method: string
    strength: number
    p_value: number
    lag?: number
    direction: string
  }>
  impact_scores?: Record<string, number>
  impact_metadata?: {
    source_methods?: Record<string, string>
    method_counts?: Record<string, number>
  }
  top_causes?: CausalAnalysisTopCause[]
  report?: string
  data_summary?: {
    total_nodes: number
    nodes_with_data: number
    data_points: number
    variables: number
    target_variable?: string
  }
  interpolation_info?: {
    applied: boolean
    original_length: number
    final_length: number
    min_required: number
    warning?: string | null
  }
  error?: {
    type: string
    message: string
    detail: string
    user_friendly_message: string
    node_status?: Record<string, CausalAnalysisNodeStatus>
  }
  node_status?: Record<string, CausalAnalysisNodeStatus>
}

export interface CausalAnalysisProgress {
  step: string
  message: string
  detail?: unknown
}

export interface CausalIncomingNetwork {
  nodes: Array<{ id: string }>
  relationships: Array<{ source: string; target: string }>
}

export type CausalAnalysisStreamEvent =
  | { type: 'progress'; progress: CausalAnalysisProgress }
  | { type: 'result'; result: CausalAnalysisResult }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function stringRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  )
}

function numberRecord(value: unknown): Record<string, number> | undefined {
  if (!isRecord(value)) return undefined
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, number] => (
      typeof entry[1] === 'number' && Number.isFinite(entry[1])
    )),
  )
}

function parseNodeStatus(value: unknown): Record<string, CausalAnalysisNodeStatus> | undefined {
  if (!isRecord(value)) return undefined
  const statuses: Record<string, CausalAnalysisNodeStatus> = {}
  for (const [id, raw] of Object.entries(value)) {
    if (!isRecord(raw)) continue
    statuses[id] = {
      node_id: optionalString(raw.node_id) ?? id,
      node_name: optionalString(raw.node_name) ?? id,
      has_data_source: raw.has_data_source === true,
      data_source: typeof raw.data_source === 'string' ? raw.data_source : null,
      status: optionalString(raw.status) ?? 'unknown',
      reason: typeof raw.reason === 'string' ? raw.reason : null,
      row_count: finiteNumber(raw.row_count),
      column_count: finiteNumber(raw.column_count),
      numeric_column_count: finiteNumber(raw.numeric_column_count),
    }
  }
  return statuses
}

export function parseCausalIncomingNetwork(value: unknown): CausalIncomingNetwork {
  if (!isRecord(value)) {
    throw new Error('인과관계 네트워크 응답 형식이 올바르지 않습니다.')
  }

  const nodes = Array.isArray(value.nodes)
    ? value.nodes.flatMap(raw => (
      isRecord(raw) && typeof raw.id === 'string' && raw.id
        ? [{ id: raw.id }]
        : []
    ))
    : []
  const relationships = Array.isArray(value.relationships)
    ? value.relationships.flatMap(raw => (
      isRecord(raw)
        && typeof raw.source === 'string'
        && raw.source
        && typeof raw.target === 'string'
        && raw.target
        ? [{ source: raw.source, target: raw.target }]
        : []
    ))
    : []

  return { nodes, relationships }
}

export function parseCausalAnalysisResult(value: unknown): CausalAnalysisResult {
  if (!isRecord(value) || typeof value.success !== 'boolean') {
    throw new Error('인과분석 응답 형식이 올바르지 않습니다.')
  }

  const targetNodeId = optionalString(value.target_node_id)
  const targetMetric = optionalString(value.target_metric)
  const analysisType = optionalString(value.analysis_type)
  const rawTimeRange = isRecord(value.time_range) ? value.time_range : null
  const timeRange = rawTimeRange
    && typeof rawTimeRange.start === 'string'
    && typeof rawTimeRange.end === 'string'
    ? { start: rawTimeRange.start, end: rawTimeRange.end }
    : undefined

  if (value.success && (!targetNodeId || !targetMetric || !analysisType || !timeRange)) {
    throw new Error('인과분석 성공 응답에 대상·지표·기간 정보가 없습니다.')
  }

  const edges = Array.isArray(value.edges)
    ? value.edges.flatMap(raw => {
      if (!isRecord(raw)
        || typeof raw.source !== 'string'
        || typeof raw.target !== 'string'
        || typeof raw.method !== 'string'
        || typeof raw.direction !== 'string') return []
      return [{
        source: raw.source,
        target: raw.target,
        method: raw.method,
        strength: finiteNumber(raw.strength),
        p_value: finiteNumber(raw.p_value),
        lag: typeof raw.lag === 'number' && Number.isFinite(raw.lag) ? raw.lag : undefined,
        direction: raw.direction,
      }]
    })
    : undefined

  const topCauses = Array.isArray(value.top_causes)
    ? value.top_causes.flatMap(raw => {
      if (!isRecord(raw) || typeof raw.source !== 'string') return []
      return [{
        source: raw.source,
        name: optionalString(raw.name) ?? raw.source,
        score: finiteNumber(raw.score),
        display_score: finiteNumber(raw.display_score),
        grade: optionalString(raw.grade) ?? '',
        method: optionalString(raw.method) ?? '',
        method_hint: optionalString(raw.method_hint) ?? '',
        method_count: finiteNumber(raw.method_count),
      }]
    })
    : undefined

  const rawSummary = isRecord(value.data_summary) ? value.data_summary : null
  const rawInterpolation = isRecord(value.interpolation_info) ? value.interpolation_info : null
  const rawMetadata = isRecord(value.impact_metadata) ? value.impact_metadata : null
  const rawError = isRecord(value.error) ? value.error : null

  return {
    success: value.success,
    target_node_id: targetNodeId,
    target_metric: targetMetric,
    analysis_type: analysisType,
    time_range: timeRange,
    edges,
    impact_scores: numberRecord(value.impact_scores),
    impact_metadata: rawMetadata ? {
      source_methods: stringRecord(rawMetadata.source_methods),
      method_counts: numberRecord(rawMetadata.method_counts),
    } : undefined,
    top_causes: topCauses,
    report: optionalString(value.report),
    data_summary: rawSummary ? {
      total_nodes: finiteNumber(rawSummary.total_nodes),
      nodes_with_data: finiteNumber(rawSummary.nodes_with_data),
      data_points: finiteNumber(rawSummary.data_points),
      variables: finiteNumber(rawSummary.variables),
      target_variable: optionalString(rawSummary.target_variable),
    } : undefined,
    interpolation_info: rawInterpolation ? {
      applied: rawInterpolation.applied === true,
      original_length: finiteNumber(rawInterpolation.original_length),
      final_length: finiteNumber(rawInterpolation.final_length),
      min_required: finiteNumber(rawInterpolation.min_required),
      warning: typeof rawInterpolation.warning === 'string' ? rawInterpolation.warning : null,
    } : undefined,
    error: rawError ? {
      type: optionalString(rawError.type) ?? 'unknown_error',
      message: optionalString(rawError.message) ?? '인과분석에 실패했습니다.',
      detail: optionalString(rawError.detail) ?? '',
      user_friendly_message: optionalString(rawError.user_friendly_message)
        ?? optionalString(rawError.message)
        ?? '인과분석에 실패했습니다.',
      node_status: parseNodeStatus(rawError.node_status),
    } : undefined,
    node_status: parseNodeStatus(value.node_status),
  }
}

export function parseCausalAnalysisStreamEvent(value: unknown): CausalAnalysisStreamEvent {
  if (!isRecord(value)) {
    throw new Error('인과분석 스트림 이벤트 형식이 올바르지 않습니다.')
  }
  if (value.type === 'progress'
    && typeof value.step === 'string'
    && typeof value.message === 'string') {
    return {
      type: 'progress',
      progress: {
        step: value.step,
        message: value.message,
        detail: value.detail,
      },
    }
  }
  if (value.type === 'result') {
    return {
      type: 'result',
      result: parseCausalAnalysisResult(value.data),
    }
  }
  throw new Error('인과분석 스트림 이벤트 형식이 올바르지 않습니다.')
}
