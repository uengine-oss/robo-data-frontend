/**
 * whatif-domain-api.ts
 * Domain Layer What-if Simulation API 클라이언트
 *
 * domain-layer 서비스 (포트 8002)의 /whatif/* 엔드포인트를 호출합니다.
 * API Gateway 경로: /api/gateway/ontology/../whatif/* → 8002/whatif/*
 */

import { API_GATEWAY_URL } from '@/shared/services/http'
import { useRuntimeStore } from '@/shared/stores/runtime'

function fetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(useRuntimeStore().getHeaders())
  new Headers(init.headers).forEach((value, key) => headers.set(key, value))
  return globalThis.fetch(input, { ...init, headers })
}

// domain-layer의 whatif 경로
// Gateway 라우트: /api/gateway/domain-whatif/** → http://127.0.0.1:8002/whatif/**
// Vite 프록시가 /api/gateway/* → localhost:9000 으로 전달
const WHATIF_DOMAIN_URL = `${API_GATEWAY_URL}/domain-whatif`

// ============================================================================
// Types
// ============================================================================

export interface EdgeCandidate {
  sourceNodeId: string
  sourceNodeName: string
  sourceField: string
  targetNodeId: string
  targetNodeName: string
  targetField: string
  lag: number
  score: number
  pearson: number
  spearman: number
  lagCorrelation: number
  grangerPValue: number
  direction: 'positive' | 'negative'
}

export interface ExcludedInfo {
  nodeId: string
  nodeName: string
  reason: string  // "load_failed" | "no_time_column" | "not_timeseries" | "no_numeric" | "non_numeric_field"
  detail: string
  fields: string[]
}

export interface DataPreview {
  columns: string[]
  rows: unknown[][]
  total_rows: number
  date_range: { start: string; end: string }
}

export interface DiscoverEdgesResponse {
  success: boolean
  schema_id: string
  data_rows: number
  variables_count: number
  edges_count: number
  edges: EdgeCandidate[]
  feature_view_sql: string
  included_nodes: Array<{ nodeId: string; nodeName: string; fieldsCount: number }>
  excluded: ExcludedInfo[]
  field_descriptions: Record<string, string>  // "field_name" -> "한국어 설명"
  applied_filters: Record<string, Record<string, unknown>>
  data_preview: DataPreview
}

export interface CorrelationMatrixResponse {
  success: boolean
  method: string
  columns: string[]
  matrix: number[][]
}

export interface ModelFeature {
  nodeId: string
  field: string
  lag: number
  featureName: string
  score: number
  direction: string
  pearson: number
  granger_pvalue: number
}

export interface ModelSpec {
  model_id: string
  name: string
  target_node_id: string
  target_field: string
  features: ModelFeature[]
  execution_order: number
}

export interface BuildModelGraphResponse {
  success: boolean
  schema_id: string
  models_count: number
  models: ModelSpec[]
}

export interface TrainResult {
  model_id: string
  name: string
  mindsdb_model: string
  status: string
  neo4j_saved: boolean
  links_created: number
}

export interface TrainModelsResponse {
  success: boolean
  mindsdb_available: boolean
  models_registered: number
  results: TrainResult[]
}

export interface ModelInput {
  sourceId: string
  sourceName: string
  field: string
  lag: number
  featureName: string
  importance: number
  correlationScore: number
}

export interface ModelOutput {
  targetId: string
  targetName: string
  field: string
  confidence: number
}

export interface RegisteredModel {
  modelId: string
  name: string
  status: string
  mindsdbModel: string
  modelType: string
  metrics: string
  version: number
  trainedAt: string
  description: string
  inputs: ModelInput[]
  outputs: ModelOutput[]
}

export interface ModelStatusResponse {
  success: true
  schema_id: string
  models_count: number
  models: RegisteredModel[]
}

export interface DeleteModelResponse {
  success: true
  model_id: string
}

function requiredRecord(value: unknown, context: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${context} 응답이 객체가 아닙니다.`)
  }
  return value as Record<string, unknown>
}

function requiredString(value: unknown, field: string, context: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${context} 응답의 ${field}가 유효한 문자열이 아닙니다.`)
  }
  return value
}

function optionalString(value: unknown, field: string, context: string): string {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') {
    throw new Error(`${context} 응답의 ${field}가 문자열이 아닙니다.`)
  }
  return value
}

function optionalFiniteNumber(
  value: unknown,
  field: string,
  context: string,
  fallback = 0,
): number {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${context} 응답의 ${field}가 유한한 숫자가 아닙니다.`)
  }
  return value
}

function requiredFiniteNumber(
  value: unknown,
  field: string,
  context: string,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${context} 응답의 ${field}가 유한한 숫자가 아닙니다.`)
  }
  return value
}

function parseModelInput(value: unknown, index: number): ModelInput {
  const context = `What-If model input[${index}]`
  const input = requiredRecord(value, context)
  return {
    sourceId: requiredString(input.sourceId, 'sourceId', context),
    sourceName: optionalString(input.sourceName, 'sourceName', context),
    field: requiredString(input.field, 'field', context),
    lag: optionalFiniteNumber(input.lag, 'lag', context),
    featureName: optionalString(input.featureName, 'featureName', context),
    importance: optionalFiniteNumber(input.importance, 'importance', context),
    correlationScore: optionalFiniteNumber(
      input.correlationScore,
      'correlationScore',
      context,
    ),
  }
}

function parseModelOutput(value: unknown, index: number): ModelOutput {
  const context = `What-If model output[${index}]`
  const output = requiredRecord(value, context)
  return {
    targetId: requiredString(output.targetId, 'targetId', context),
    targetName: optionalString(output.targetName, 'targetName', context),
    field: requiredString(output.field, 'field', context),
    confidence: optionalFiniteNumber(output.confidence, 'confidence', context),
  }
}

function parseRegisteredModel(value: unknown, index: number): RegisteredModel {
  const context = `What-If model[${index}]`
  const model = requiredRecord(value, context)
  if (!Array.isArray(model.inputs) || !Array.isArray(model.outputs)) {
    throw new Error(`${context} 응답의 inputs/outputs가 배열이 아닙니다.`)
  }
  return {
    modelId: requiredString(model.modelId, 'modelId', context),
    name: optionalString(model.name, 'name', context),
    status: requiredString(model.status, 'status', context),
    mindsdbModel: optionalString(model.mindsdbModel, 'mindsdbModel', context),
    modelType: optionalString(model.modelType, 'modelType', context),
    metrics: optionalString(model.metrics, 'metrics', context),
    version: optionalFiniteNumber(model.version, 'version', context, 1),
    trainedAt: optionalString(model.trainedAt, 'trainedAt', context),
    description: optionalString(model.description, 'description', context),
    inputs: model.inputs.map(parseModelInput),
    outputs: model.outputs.map(parseModelOutput),
  }
}

export function parseModelStatusResponse(value: unknown): ModelStatusResponse {
  const response = requiredRecord(value, 'What-If model status')
  if (response.success !== true) {
    throw new Error('What-If model status 응답의 success가 true가 아닙니다.')
  }
  if (!Array.isArray(response.models)) {
    throw new Error('What-If model status 응답의 models가 배열이 아닙니다.')
  }
  const models = response.models.map(parseRegisteredModel)
  const modelsCount = requiredFiniteNumber(
    response.models_count,
    'models_count',
    'What-If model status',
  )
  if (!Number.isInteger(modelsCount) || modelsCount < 0 || modelsCount !== models.length) {
    throw new Error('What-If model status 응답의 models_count가 models 배열과 일치하지 않습니다.')
  }
  return {
    success: true,
    schema_id: requiredString(
      response.schema_id,
      'schema_id',
      'What-If model status',
    ),
    models_count: modelsCount,
    models,
  }
}

export function parseDeleteModelResponse(value: unknown): DeleteModelResponse {
  const response = requiredRecord(value, 'What-If model delete')
  if (response.success !== true) {
    throw new Error('What-If model delete 응답의 success가 true가 아닙니다.')
  }
  return {
    success: true,
    model_id: requiredString(response.model_id, 'model_id', 'What-If model delete'),
  }
}

export interface ModelMetrics {
  rmse: number
  mae: number
  mape: number
  r2: number
}

export interface SensitivityResult {
  feature: string
  baseline_mean: number
  perturbed_mean: number
  delta: number
  pct_change: number
  direction: string
}

export interface ModelValidationResult {
  model_name: string
  target: string
  features: string[]
  train_size: number
  test_size: number
  metrics: ModelMetrics
  sensitivity: SensitivityResult[]
  algorithm?: string
  intercept?: number
  coefficients?: Record<string, number>
  train_preview?: {
    columns: string[]
    rows: Array<Array<string | number | null>>
  }
  valid: boolean
  error: string | null
}

export interface ValidateResponse {
  success: boolean
  schema_id: string
  chain_length: number
  validated_count: number
  model_results: ModelValidationResult[]
  summary: {
    mean_r2: number
    mean_rmse: number
    all_valid: boolean
  }
}

export interface SnapshotResponse {
  success: true
  date: string
  available_dates: string[]
  snapshot: Record<string, number>       // "nodeId::field" -> value
  snapshot_by_node: Record<string, {     // nodeId -> {nodeName, fields: {field: value}}
    nodeName: string
    fields: Record<string, number>
  }>
  timeseries: { dates: string[] } & Record<string, string[] | number[]>
  field_descriptions: Record<string, string>  // "field_name" -> "한국어 설명"
  applied_filters: Record<string, Record<string, unknown>>
}

export interface SimulationTrace {
  model_id: string
  model_name: string
  inputs: Record<string, number>
  output_field: string
  baseline_value: number
  predicted_value: number
  delta: number
  pct_change: number
  wave: number
  effective_day: number
  triggered_by: string[]
}

export interface TimelineEntry {
  model_id: string
  model_name: string
  output_field: string
  baseline_value: number
  predicted_value: number
  delta: number
  pct_change: number
  triggered_by: string[]
}

export interface SimulateResponse {
  success: true
  schema_id: string
  scenario_name: string
  interventions: Array<{ node_id: string; field: string; value: number; description: string }>
  traces: SimulationTrace[]
  timeline: Record<string, TimelineEntry[]>  // "0" -> [...], "1" -> [...]
  final_state: Record<string, number>
  baseline_state: Record<string, number>
  deltas: Record<string, number>
  executed_at: string
  propagation_waves: number
}

export interface CompareResponse {
  success: boolean
  schema_id: string
  scenarios: SimulateResponse[]
  comparison: Record<string, Record<string, number>>
}

export interface WhatIfScenarioProfileResponse {
  id: string
  name: string
  description?: string
  schemaId: string
  interventions: Array<{ nodeId: string; field: string; value: number; description?: string }>
  created_at: string
  last_simulated_at?: string
  last_simulation_results?: Record<string, unknown>
  outputFields?: ScenarioOutputField[]
}

export interface ScenarioOutputField {
  key: string
  label: string
  lastValue?: number
  baselineValue?: number | null
}

export interface CreateScenarioProfileRequest {
  name: string
  description?: string
  schemaId: string
  interventions: Array<{
    nodeId: string
    field: string
    value: number
    description?: string
  }>
  last_simulation_results?: Record<string, unknown>
  outputFields?: ScenarioOutputField[]
}

function requiredArray(value: unknown, field: string, context: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context} 응답의 ${field}가 배열이 아닙니다.`)
  }
  return value
}

function requiredStringArray(value: unknown, field: string, context: string): string[] {
  return requiredArray(value, field, context).map((item, index) =>
    requiredString(item, `${field}[${index}]`, context),
  )
}

function finiteNumberRecord(value: unknown, field: string, context: string): Record<string, number> {
  const record = requiredRecord(value, `${context} ${field}`)
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [
      key,
      requiredFiniteNumber(item, `${field}.${key}`, context),
    ]),
  )
}

function stringRecord(value: unknown, field: string, context: string): Record<string, string> {
  const record = requiredRecord(value, `${context} ${field}`)
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [
      key,
      optionalString(item, `${field}.${key}`, context),
    ]),
  )
}

function nestedUnknownRecord(
  value: unknown,
  field: string,
  context: string,
): Record<string, Record<string, unknown>> {
  const record = requiredRecord(value, `${context} ${field}`)
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [
      key,
      requiredRecord(item, `${context} ${field}.${key}`),
    ]),
  )
}

export function parseSnapshotResponse(value: unknown): SnapshotResponse {
  const context = 'What-If snapshot'
  const response = requiredRecord(value, context)
  if (response.success !== true) {
    throw new Error(`${context} 응답의 success가 true가 아닙니다.`)
  }
  const date = requiredString(response.date, 'date', context)
  const availableDates = requiredStringArray(
    response.available_dates,
    'available_dates',
    context,
  )
  if (!availableDates.includes(date)) {
    throw new Error(`${context} 응답의 date가 available_dates에 없습니다.`)
  }
  const snapshot = finiteNumberRecord(response.snapshot, 'snapshot', context)
  const snapshotByNodeRaw = requiredRecord(
    response.snapshot_by_node,
    `${context} snapshot_by_node`,
  )
  const snapshotByNode = Object.fromEntries(
    Object.entries(snapshotByNodeRaw).map(([nodeId, item]) => {
      const node = requiredRecord(item, `${context} snapshot_by_node.${nodeId}`)
      return [nodeId, {
        nodeName: requiredString(
          node.nodeName,
          `snapshot_by_node.${nodeId}.nodeName`,
          context,
        ),
        fields: finiteNumberRecord(
          node.fields,
          `snapshot_by_node.${nodeId}.fields`,
          context,
        ),
      }]
    }),
  )
  const timeseriesRaw = requiredRecord(response.timeseries, `${context} timeseries`)
  const dates = requiredStringArray(timeseriesRaw.dates, 'timeseries.dates', context)
  const timeseries: SnapshotResponse['timeseries'] = { dates }
  for (const [key, series] of Object.entries(timeseriesRaw)) {
    if (key === 'dates') continue
    const values = requiredArray(series, `timeseries.${key}`, context).map((item, index) =>
      requiredFiniteNumber(item, `timeseries.${key}[${index}]`, context),
    )
    if (values.length !== dates.length) {
      throw new Error(`${context} 응답의 timeseries.${key} 길이가 dates와 다릅니다.`)
    }
    timeseries[key] = values
  }
  return {
    success: true,
    date,
    available_dates: availableDates,
    snapshot,
    snapshot_by_node: snapshotByNode,
    timeseries,
    field_descriptions: stringRecord(
      response.field_descriptions,
      'field_descriptions',
      context,
    ),
    applied_filters: nestedUnknownRecord(
      response.applied_filters,
      'applied_filters',
      context,
    ),
  }
}

function parseSimulationTrace(value: unknown, index: number): SimulationTrace {
  const context = `What-If simulation trace[${index}]`
  const trace = requiredRecord(value, context)
  return {
    model_id: requiredString(trace.model_id, 'model_id', context),
    model_name: requiredString(trace.model_name, 'model_name', context),
    inputs: finiteNumberRecord(trace.inputs, 'inputs', context),
    output_field: requiredString(trace.output_field, 'output_field', context),
    baseline_value: requiredFiniteNumber(trace.baseline_value, 'baseline_value', context),
    predicted_value: requiredFiniteNumber(trace.predicted_value, 'predicted_value', context),
    delta: requiredFiniteNumber(trace.delta, 'delta', context),
    pct_change: requiredFiniteNumber(trace.pct_change, 'pct_change', context),
    wave: requiredFiniteNumber(trace.wave, 'wave', context),
    effective_day: requiredFiniteNumber(trace.effective_day, 'effective_day', context),
    triggered_by: requiredStringArray(trace.triggered_by, 'triggered_by', context),
  }
}

function parseTimelineEntry(value: unknown, context: string): TimelineEntry {
  const entry = requiredRecord(value, context)
  return {
    model_id: requiredString(entry.model_id, 'model_id', context),
    model_name: requiredString(entry.model_name, 'model_name', context),
    output_field: requiredString(entry.output_field, 'output_field', context),
    baseline_value: requiredFiniteNumber(entry.baseline_value, 'baseline_value', context),
    predicted_value: requiredFiniteNumber(entry.predicted_value, 'predicted_value', context),
    delta: requiredFiniteNumber(entry.delta, 'delta', context),
    pct_change: requiredFiniteNumber(entry.pct_change, 'pct_change', context),
    triggered_by: requiredStringArray(entry.triggered_by, 'triggered_by', context),
  }
}

export function parseSimulateResponse(value: unknown): SimulateResponse {
  const context = 'What-If simulation'
  const response = requiredRecord(value, context)
  if (response.success !== true) {
    throw new Error(`${context} 응답의 success가 true가 아닙니다.`)
  }
  const timelineRaw = requiredRecord(response.timeline, `${context} timeline`)
  const timeline = Object.fromEntries(
    Object.entries(timelineRaw).map(([day, entries]) => {
      if (!/^\d+$/.test(day)) {
        throw new Error(`${context} 응답의 timeline day가 0 이상의 정수가 아닙니다.`)
      }
      return [
        day,
        requiredArray(entries, `timeline.${day}`, context).map((entry, index) =>
          parseTimelineEntry(entry, `${context} timeline.${day}[${index}]`),
        ),
      ]
    }),
  )
  const interventions = requiredArray(
    response.interventions,
    'interventions',
    context,
  ).map((item, index) => {
    const intervention = requiredRecord(item, `${context} intervention[${index}]`)
    return {
      node_id: requiredString(intervention.node_id, 'node_id', context),
      field: requiredString(intervention.field, 'field', context),
      value: requiredFiniteNumber(intervention.value, 'value', context),
      description: optionalString(intervention.description, 'description', context),
    }
  })
  const propagationWaves = requiredFiniteNumber(
    response.propagation_waves,
    'propagation_waves',
    context,
  )
  if (!Number.isInteger(propagationWaves) || propagationWaves < 0) {
    throw new Error(`${context} 응답의 propagation_waves가 0 이상의 정수가 아닙니다.`)
  }
  return {
    success: true,
    schema_id: requiredString(response.schema_id, 'schema_id', context),
    scenario_name: requiredString(response.scenario_name, 'scenario_name', context),
    interventions,
    traces: requiredArray(response.traces, 'traces', context).map(parseSimulationTrace),
    timeline,
    final_state: finiteNumberRecord(response.final_state, 'final_state', context),
    baseline_state: finiteNumberRecord(response.baseline_state, 'baseline_state', context),
    deltas: finiteNumberRecord(response.deltas, 'deltas', context),
    executed_at: requiredString(response.executed_at, 'executed_at', context),
    propagation_waves: propagationWaves,
  }
}

function parseScenarioOutputField(value: unknown, index: number): ScenarioOutputField {
  const context = `What-If scenario outputFields[${index}]`
  const field = requiredRecord(value, context)
  return {
    key: requiredString(field.key, 'key', context),
    label: requiredString(field.label, 'label', context),
    ...(field.lastValue === undefined || field.lastValue === null
      ? {}
      : { lastValue: requiredFiniteNumber(field.lastValue, 'lastValue', context) }),
    ...(field.baselineValue === undefined
      ? {}
      : {
          baselineValue: field.baselineValue === null
            ? null
            : requiredFiniteNumber(field.baselineValue, 'baselineValue', context),
        }),
  }
}

export function parseScenarioProfileResponse(
  value: unknown,
): WhatIfScenarioProfileResponse {
  const context = 'What-If scenario profile'
  const response = requiredRecord(value, context)
  const interventions = requiredArray(
    response.interventions,
    'interventions',
    context,
  ).map((item, index) => {
    const intervention = requiredRecord(item, `${context} intervention[${index}]`)
    return {
      nodeId: requiredString(intervention.nodeId, 'nodeId', context),
      field: requiredString(intervention.field, 'field', context),
      value: requiredFiniteNumber(intervention.value, 'value', context),
      ...(intervention.description === undefined || intervention.description === null
        ? {}
        : { description: optionalString(intervention.description, 'description', context) }),
    }
  })
  const lastResults = response.last_simulation_results === undefined
    || response.last_simulation_results === null
    ? undefined
    : requiredRecord(response.last_simulation_results, `${context} last_simulation_results`)
  return {
    id: requiredString(response.id, 'id', context),
    name: requiredString(response.name, 'name', context),
    ...(response.description === undefined || response.description === null
      ? {}
      : { description: optionalString(response.description, 'description', context) }),
    schemaId: requiredString(response.schemaId, 'schemaId', context),
    interventions,
    created_at: optionalString(response.created_at, 'created_at', context),
    ...(response.last_simulated_at === undefined || response.last_simulated_at === null
      ? {}
      : {
          last_simulated_at: optionalString(
            response.last_simulated_at,
            'last_simulated_at',
            context,
          ),
        }),
    ...(lastResults ? { last_simulation_results: lastResults } : {}),
    outputFields: requiredArray(
      response.outputFields,
      'outputFields',
      context,
    ).map(parseScenarioOutputField),
  }
}

// ============================================================================
// API Client
// ============================================================================

async function apiPost<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`${WHATIF_DOMAIN_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`What-if API error (${response.status}): ${text.slice(0, 200)}`)
  }
  return response.json()
}

async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${WHATIF_DOMAIN_URL}${path}`, { signal })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`What-if API error (${response.status}): ${text.slice(0, 200)}`)
  }
  return response.json()
}

async function apiDelete<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${WHATIF_DOMAIN_URL}${path}`, { method: 'DELETE', signal })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`What-if API error (${response.status}): ${text.slice(0, 200)}`)
  }
  return response.json()
}

export const whatifDomainApi = {
  /**
   * Step 1: Edge Discovery — 상관/인과 관계 자동 발견
   */
  async discoverEdges(
    schemaId: string,
    options?: {
      maxLag?: number
      minCorrelation?: number
      significanceLevel?: number
      filters?: Record<string, Record<string, unknown>>
    }
  ): Promise<DiscoverEdgesResponse> {
    return apiPost('/discover-edges', {
      schema_id: schemaId,
      max_lag: options?.maxLag ?? 3,
      min_correlation: options?.minCorrelation ?? 0.3,
      significance_level: options?.significanceLevel ?? 0.05,
      filters: options?.filters ?? null,
    })
  },

  /**
   * Step 1b: Correlation Matrix — 히트맵용
   */
  async getCorrelationMatrix(
    schemaId: string,
    method: 'pearson' | 'spearman' | 'kendall' = 'pearson',
    filters?: Record<string, Record<string, unknown>>
  ): Promise<CorrelationMatrixResponse> {
    return apiPost('/correlation-matrix', {
      schema_id: schemaId,
      method,
      filters: filters ?? null,
    })
  },

  /**
   * Step 2: Build Model Graph — 모델 DAG 구성
   */
  async buildModelGraph(
    schemaId: string,
    edgeCandidates: EdgeCandidate[],
    options?: { vifThreshold?: number; maxFeaturesPerModel?: number }
  ): Promise<BuildModelGraphResponse> {
    return apiPost('/build-model-graph', {
      schema_id: schemaId,
      edge_candidates: edgeCandidates,
      vif_threshold: options?.vifThreshold ?? 10.0,
      max_features_per_model: options?.maxFeaturesPerModel ?? 10,
    })
  },

  /**
   * Step 3: Train Models — MindsDB 모델 생성 + Neo4j 등록
   */
  async trainModels(
    schemaId: string,
    modelSpecs: ModelSpec[],
    featureViewSql?: string
  ): Promise<TrainModelsResponse> {
    return apiPost('/train-models', {
      schema_id: schemaId,
      model_specs: modelSpecs,
      feature_view_sql: featureViewSql ?? '',
    })
  },

  /**
   * Step 3b: Model Status — 학습 상태 폴링
   */
  async getModelStatus(
    schemaId: string,
    signal?: AbortSignal,
  ): Promise<ModelStatusResponse> {
    const response = parseModelStatusResponse(
      await apiGet<unknown>(`/model-status/${schemaId}`, signal),
    )
    if (response.schema_id !== schemaId) {
      throw new Error('What-If model status 응답의 schema_id가 요청과 일치하지 않습니다.')
    }
    return response
  },

  /**
   * Step 4: Validate — 백테스팅
   */
  async validate(schemaId: string, testRatio: number = 0.2): Promise<ValidateResponse> {
    return apiPost('/validate', {
      schema_id: schemaId,
      test_ratio: testRatio,
    })
  },

  /**
   * Filter Edges — LLM으로 의미 없는 상관관계 자동 제외 추천
   */
  async filterEdges(
    schemaId: string,
    edges: EdgeCandidate[],
    fieldDescriptions?: Record<string, string>
  ): Promise<{
    success: boolean
    exclude_count: number
    exclude_indices: number[]
    reasons: Record<string, string>
  }> {
    return apiPost('/filter-edges', {
      schema_id: schemaId,
      edges,
      field_descriptions: fieldDescriptions,
    })
  },

  /**
   * Snapshot — 특정 시점의 전체 변수 스냅샷 + 시계열 데이터
   */
  async getSnapshot(
    schemaId: string,
    date?: string,
    filters?: Record<string, Record<string, unknown>>,
    signal?: AbortSignal,
  ): Promise<SnapshotResponse> {
    return parseSnapshotResponse(await apiPost<unknown>('/snapshot', {
      schema_id: schemaId,
      date: date ?? null,
      filters: filters ?? null,
    }, signal))
  },

  /**
   * Step 5: Simulate — What-if 시뮬레이션 (증분 전파)
   */
  async simulate(
    schemaId: string,
    scenarioName: string,
    interventions: Array<{ nodeId: string; field: string; value: number; description?: string }>,
    snapshotDate?: string,
    filters?: Record<string, Record<string, unknown>>,
    signal?: AbortSignal,
  ): Promise<SimulateResponse> {
    const response = parseSimulateResponse(await apiPost<unknown>('/simulate', {
      schema_id: schemaId,
      scenario_name: scenarioName,
      interventions,
      snapshot_date: snapshotDate ?? null,
      filters: filters ?? null,
    }, signal))
    if (response.schema_id !== schemaId) {
      throw new Error('What-If simulation 응답의 schema_id가 요청과 일치하지 않습니다.')
    }
    return response
  },

  /**
   * Step 5b: Compare Scenarios
   */
  async compareScenarios(
    schemaId: string,
    scenarios: Array<{
      name: string
      interventions: Array<{ nodeId: string; field: string; value: number; description?: string }>
    }>
  ): Promise<CompareResponse> {
    return apiPost('/compare-scenarios', {
      schema_id: schemaId,
      scenarios,
    })
  },

  /**
   * List registered models
   */
  async listModels(schemaId: string, signal?: AbortSignal): Promise<ModelStatusResponse> {
    const response = parseModelStatusResponse(
      await apiGet<unknown>(`/models/${schemaId}`, signal),
    )
    if (response.schema_id !== schemaId) {
      throw new Error('What-If model list 응답의 schema_id가 요청과 일치하지 않습니다.')
    }
    return response
  },

  /**
   * Delete a model
   */
  async deleteModel(
    schemaId: string,
    modelId: string,
    signal?: AbortSignal,
  ): Promise<DeleteModelResponse> {
    const response = parseDeleteModelResponse(
      await apiDelete<unknown>(`/models/${schemaId}/${modelId}`, signal),
    )
    if (response.model_id !== modelId) {
      throw new Error('What-If model delete 응답의 model_id가 요청과 일치하지 않습니다.')
    }
    return response
  },

  // ========== What-If Scenario Profiles ==========

  /**
   * 시나리오 프로필 생성
   */
  async createScenarioProfile(
    profile: CreateScenarioProfileRequest,
    signal?: AbortSignal,
  ): Promise<WhatIfScenarioProfileResponse> {
    const response = parseScenarioProfileResponse(
      await apiPost<unknown>('/scenarios', profile, signal),
    )
    if (response.schemaId !== profile.schemaId) {
      throw new Error('What-If scenario profile 응답의 schemaId가 요청과 일치하지 않습니다.')
    }
    return response
  },

  /**
   * 시나리오 프로필 목록 조회
   */
  async listScenarioProfiles(schemaId?: string): Promise<WhatIfScenarioProfileResponse[]> {
    const path = schemaId ? `/scenarios?schema_id=${encodeURIComponent(schemaId)}` : '/scenarios'
    return apiGet(path)
  },

  /**
   * 시나리오 프로필 상세 조회
   */
  async getScenarioProfile(profileId: string): Promise<WhatIfScenarioProfileResponse> {
    return apiGet(`/scenarios/${profileId}`)
  },

  /**
   * 시나리오 프로필 업데이트
   */
  async updateScenarioProfile(profileId: string, update: {
    name?: string
    description?: string
    interventions?: Array<{ nodeId: string; field: string; value: number; description?: string }>
    last_simulated_at?: string
    last_simulation_results?: Record<string, unknown>
  }): Promise<WhatIfScenarioProfileResponse> {
    const response = await fetch(`${WHATIF_DOMAIN_URL}/scenarios/${profileId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`What-if API error (${response.status}): ${text.slice(0, 200)}`)
    }
    return response.json()
  },

  /**
   * 시나리오 프로필 삭제
   */
  async deleteScenarioProfile(profileId: string): Promise<{ message: string; id: string }> {
    return apiDelete(`/scenarios/${profileId}`)
  },
}
