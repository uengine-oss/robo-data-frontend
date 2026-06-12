/**
 * whatif-domain-api.ts
 * Domain Layer What-if Simulation API 클라이언트
 *
 * domain-layer 서비스 (포트 8002)의 /whatif/* 엔드포인트를 호출합니다.
 * API Gateway 경로: /api/gateway/ontology/../whatif/* → 8002/whatif/*
 */

const API_GATEWAY_URL = import.meta.env.VITE_API_GATEWAY_URL ?? '/api/gateway'

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
  success: boolean
  schema_id: string
  models_count: number
  models: RegisteredModel[]
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
  success: boolean
  date: string
  available_dates: string[]
  snapshot: Record<string, number>       // "nodeId::field" -> value
  snapshot_by_node: Record<string, {     // nodeId -> {nodeName, fields: {field: value}}
    nodeName: string
    fields: Record<string, number>
  }>
  timeseries: Record<string, number[]>   // "dates" -> [...], "nodeId::field" -> [...]
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
  success: boolean
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
  last_simulation_results?: Record<string, any>
  outputFields?: Array<{ key: string; label: string; lastValue?: number }>
}

// ============================================================================
// API Client
// ============================================================================

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${WHATIF_DOMAIN_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`What-if API error (${response.status}): ${text.slice(0, 200)}`)
  }
  return response.json()
}

async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${WHATIF_DOMAIN_URL}${path}`)
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`What-if API error (${response.status}): ${text.slice(0, 200)}`)
  }
  return response.json()
}

async function apiDelete<T>(path: string): Promise<T> {
  const response = await fetch(`${WHATIF_DOMAIN_URL}${path}`, { method: 'DELETE' })
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
  async getModelStatus(schemaId: string): Promise<ModelStatusResponse> {
    return apiGet(`/model-status/${schemaId}`)
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
    filters?: Record<string, Record<string, unknown>>
  ): Promise<SnapshotResponse> {
    return apiPost('/snapshot', {
      schema_id: schemaId,
      date: date ?? null,
      filters: filters ?? null,
    })
  },

  /**
   * Step 5: Simulate — What-if 시뮬레이션 (증분 전파)
   */
  async simulate(
    schemaId: string,
    scenarioName: string,
    interventions: Array<{ nodeId: string; field: string; value: number; description?: string }>,
    snapshotDate?: string,
    filters?: Record<string, Record<string, unknown>>
  ): Promise<SimulateResponse> {
    return apiPost('/simulate', {
      schema_id: schemaId,
      scenario_name: scenarioName,
      interventions,
      snapshot_date: snapshotDate ?? null,
      filters: filters ?? null,
    })
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
  async listModels(schemaId: string): Promise<ModelStatusResponse> {
    return apiGet(`/models/${schemaId}`)
  },

  /**
   * Delete a model
   */
  async deleteModel(schemaId: string, modelId: string): Promise<{ success: boolean }> {
    return apiDelete(`/models/${schemaId}/${modelId}`)
  },

  // ========== What-If Scenario Profiles ==========

  /**
   * 시나리오 프로필 생성
   */
  async createScenarioProfile(profile: {
    name: string
    description?: string
    schemaId: string
    interventions: Array<{ nodeId: string; field: string; value: number; description?: string }>
    last_simulation_results?: Record<string, any>
    outputFields?: Array<Record<string, any>>
  }): Promise<WhatIfScenarioProfileResponse> {
    return apiPost('/scenarios', profile)
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
    last_simulation_results?: Record<string, any>
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
