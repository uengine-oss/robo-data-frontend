/** Text2SQL metadata returned by the service. */
export interface Text2SqlTableInfo {
  name: string
  schema: string
  datasource?: string
  logical_name?: string
  description: string
  description_source?: 'ddl' | 'procedure' | 'user' | 'code' | ''
  analyzed_description?: string
  column_count: number
}

export interface Text2SqlColumnInfo {
  name: string
  table_name: string
  dtype: string
  nullable: boolean
  logical_name?: string
  description: string
  description_source?: 'ddl' | 'procedure' | 'user' | 'code' | ''
  analyzed_description?: string
}

export interface ReactSQLCompleteness {
  is_complete: boolean
  missing_info: string
  confidence_level: string
}

export interface ReactToolCallModel {
  name: string
  raw_parameters_xml: string
  parameters: Record<string, unknown>
}

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

export interface ReactExecutionResult {
  columns: string[]
  rows: unknown[][]
  row_count: number
  execution_time_ms: number
}

export interface QueryQualityGateRound {
  accept: boolean
  confidence: number
  reasons: string[]
  risk_flags: string[]
  summary: string
}

export interface QueryQualityGate {
  policy: string
  threshold: number
  rounds: number
  ok: boolean
  verified_confidence?: number | null
  results: QueryQualityGateRound[]
  error?: string | null
}

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
  conversation_state?: string | null
  question_to_user?: string | null
  warnings?: string[] | null
  from_cache?: boolean
  quality_gate?: QueryQualityGate | null
  feedback_required?: boolean
}

export interface ReactRequest {
  question: string
  datasource: string
  dbms?: string | null
  max_tool_calls?: number
  execute_final_sql?: boolean
  max_iterations?: number | null
  session_state?: string | null
  user_response?: string | null
  conversation_state?: string | null
  max_sql_seconds?: number
  prefer_language?: string
  debug_stream_xml_tokens?: boolean
  use_cache?: boolean
  schema_filter?: string[]
  object_type_only?: boolean
  linked_object_types?: Array<{
    name: string
    columns: Array<{ name: string; type: string }>
    description?: string
  }>
}

export interface ReactPhaseData {
  reasoning?: string
  partial_sql?: string
  sql_completeness?: ReactSQLCompleteness
  tool_name?: string
  tool_parameters?: Record<string, unknown>
  tool_result_preview?: string
}

export type ReactStreamEvent =
  | { event: 'token'; iteration: number; token: string }
  | {
      event: 'prefetch'
      tool_name: 'build_sql_context' | string
      elapsed_ms: number
      remaining_tool_calls: number
    }
  | {
      event: 'prefetch_error'
      tool_name: 'build_sql_context' | string
      elapsed_ms: number
      error: string
    }
  | {
      event: 'context_refresh'
      tool_name: 'build_sql_context' | string
      elapsed_ms: number
      remaining_tool_calls: number
      mode?: 'auto' | 'manual' | string
      enrichment_index?: number
      context_parse_mode?: string
      context_hash_changed?: boolean
      context_delta?: {
        tables_added?: number
        values_added?: number
        relationships_added?: number
      }
    }
  | {
      event: 'context_refresh_error'
      tool_name: 'build_sql_context' | string
      elapsed_ms?: number
      remaining_tool_calls?: number
      mode?: 'auto' | 'manual' | string
      error: string
    }
  | {
      event: 'pipeline_stage'
      pipeline: 'build_sql_context' | string
      stage: string
      status: 'start' | 'done' | 'error'
      seq: number
      iteration: number
      elapsed_ms?: number
      counts?: Record<string, number>
      notes?: string[]
      error?: string
      ts_ms?: number
    }
  | {
      event: 'pipeline_item'
      pipeline: 'build_sql_context' | string
      stage: 'light_queries' | string
      item_type: 'query_preview' | string
      iteration: number
      index: number
      total: number
      verdict?: 'PASS' | 'FAIL' | string
      row_count?: number
      elapsed_ms?: number
      ts_ms?: number
    }
  | { event: 'section_delta'; iteration: number; section: string; delta: string }
  | {
      event: 'metadata_item'
      iteration: number
      item_type: 'table' | 'column' | 'value' | 'relationship' | 'constraint'
      item: Record<string, unknown>
    }
  | { event: 'format_repair'; iteration: number; reason: string }
  | {
      event: 'phase'
      phase: 'thinking' | 'reasoning' | 'acting' | 'observing'
      iteration: number
      data: ReactPhaseData
      state: Record<string, unknown>
    }
  | { event: 'step'; step: ReactStepModel; state: Record<string, unknown> }
  | { event: 'completed'; response: ReactResponseModel; state: Record<string, unknown> }
  | { event: 'complete'; response: ReactResponseModel; state: Record<string, unknown> }
  | { event: 'needs_user_input'; response: ReactResponseModel; state: Record<string, unknown> }
  | { event: 'cache_hit'; message?: string; hit_count?: number }
  | { event: 'error'; message: string }

export type ReactStatus = 'idle' | 'running' | 'needs_user_input' | 'completed' | 'error'
export type ReactPhase = 'idle' | 'thinking' | 'reasoning' | 'acting' | 'observing'
