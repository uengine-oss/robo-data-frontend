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
  mindsdb_predicted?: number[]
  source_values?: number[]
}

export interface TTMComparisonResult {
  comparisons: Array<{
    source: string
    target: string
    source_label?: string
    target_label?: string
    ontology?: ModelComparison
    ttm?: ModelComparison & {
      rmse?: number
      model_name?: string
      available?: boolean
      note?: string
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

export interface ModelComparison {
  r2: number
  mape: number
  predictions: number[]
  actual: number[]
  error?: string
}

export interface ComparisonResult {
  comparison_source?: 'ttm' | 'mindsdb'
  warning?: string
  comparisons: Array<{
    edge: string
    source?: string
    target?: string
    source_label?: string
    target_label?: string
    ontology?: ModelComparison
    ttm?: ModelComparison & {
      rmse?: number
      model_name?: string
      available?: boolean
      note?: string
    }
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
    better?: 'MindsDB' | 'TTM' | 'Causal'
    error?: string
    note?: string
  }>
  prediction_charts?: PredictionChartData[]
  summary: {
    total_compared: number
    mean_causal_r2: number
    mean_mindsdb_r2?: number
    ontology_mean_r2?: number
    ttm_mean_r2?: number
    mindsdb_mean_r2?: number
    avg_mape?: number
    good_fits?: number
    mindsdb_wins: number
    causal_wins: number
    ontology_wins?: number
    ttm_wins?: number
    ttm_available?: boolean
    mindsdb_available?: boolean
    ttm_model?: string
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

export interface TTMInfo {
  available: boolean
  model_name?: string
  context_length?: number
  prediction_length?: number
}

export interface MindsDbModelCreationResult {
  model_name: string
  target: string
  features: string[]
  result: unknown
}

export interface PresentationResult {
  slides: PresentationSlide[]
}

export interface Neo4jSaveResult {
  saved: boolean
  nodes_count: number
  edges_count: number
  message: string
}

export interface Neo4jGraphResult {
  nodes: Array<{ id: string; label: string; type: string }>
  edges: Array<{ source: string; target: string; strength: number; direction: string }>
}

export interface SessionListResult {
  sessions: Array<{ session_id: string; created_at: string; query: string }>
}

export interface DeleteSessionResult {
  deleted: boolean
}

export interface WhatIfHealth {
  status: string
  service: string
  version: string
}
