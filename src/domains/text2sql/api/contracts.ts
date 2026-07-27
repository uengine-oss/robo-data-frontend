import type {
  ReactExecutionResult,
  ReactResponseModel,
  ReactStepModel,
  ReactStreamEvent,
  Text2SqlColumnInfo,
  Text2SqlTableInfo,
} from '../model/react'

export interface QueryStep {
  iteration?: number
  reasoning?: string
  tool_name?: string
  tool_result_preview?: string
}

export interface QueryHistoryItem {
  /** Neo4j query hash. The backend contract is a string, not a numeric SQLite id. */
  id: string
  question: string
  final_sql: string | null
  validated_sql: string | null
  execution_result: ReactExecutionResult | null
  row_count: number | null
  status: 'pending' | 'completed' | 'error'
  error_message: string | null
  steps_count: number | null
  execution_time_ms: number | null
  created_at: string | null
  updated_at: string | null
  metadata: Record<string, unknown> | null
  steps: QueryStep[] | null
  tables_used: string[]
}

export interface QueryHistoryResponse {
  items: QueryHistoryItem[]
  total: number
  page: number
  page_size: number
}

export interface SaveQueryHistoryRequest {
  question: string
  final_sql?: string | null
  validated_sql?: string | null
  execution_result?: ReactExecutionResult | null
  row_count?: number | null
  status?: 'completed' | 'error'
  error_message?: string | null
  steps_count?: number | null
  execution_time_ms?: number | null
  metadata?: Record<string, unknown> | null
  steps?: QueryStep[] | null
}

export interface AskTableResult {
  columns: string[]
  rows: unknown[][]
  row_count: number
  execution_time_ms?: number
  truncated?: boolean
  returned_row_count?: number
  max_rows_cap?: number
}

export interface AskResponse {
  sql: string
  table: AskTableResult
  charts: Array<Record<string, unknown>>
  provenance: {
    tables: string[]
    columns: string[]
    neo4j_paths: string[]
    vector_matches: Array<Record<string, unknown>>
    prompt_snapshot_id: string
  }
  perf: {
    embedding_ms: number
    graph_search_ms: number
    llm_ms: number
    sql_ms: number
    total_ms: number
  }
  warnings: string[] | null
}

export interface FeedbackResponse {
  feedback_id: string
  message: string
}

export interface DirectSqlStreamEvent {
  event?: string
  type?: string
  columns?: string[]
  rows?: unknown[]
  row?: unknown
  data?: unknown
  message?: string
  validated_sql?: string
  mode?: string
  reason?: string
  prepared_sql?: string
  llm_model?: string
  llm_elapsed_ms?: number
  row_count?: number
  execution_time_ms?: number
  token?: string
}

export interface Text2SqlMetaObjectType {
  name: string
  schema?: string
  datasource?: string
  description?: string
  materialized_view?: string
  column_count?: number
}

export interface DirectSqlResponse {
  status: 'success' | 'error'
  sql: string
  validated_sql: string | null
  columns: string[]
  rows: unknown[][]
  row_count: number
  execution_time_ms: number
  truncated?: boolean
  returned_row_count?: number
  max_rows_cap?: number
  error_message?: string | null
  formatted_summary?: string | null
}

export interface MaterializedViewResponse {
  status: 'success' | 'error'
  view_name: string
  full_name: string
  row_count: number
  message: string
  error_message?: string | null
}

export interface MaterializedViewRefreshResponse {
  status: 'success' | 'error'
  view_name: string
  row_count?: number
  message?: string
  error_message?: string | null
}

export interface MaterializedViewListResponse {
  status: 'success' | 'error'
  views: Array<{
    schema: string
    name: string
    owner: string
    is_populated: boolean
    size: string
    description: string | null
  }>
  count: number
  error_message?: string | null
}

export type Text2SqlHealthResponse =
  | {
      status: 'healthy'
      neo4j: 'connected'
      config: {
        llm_provider: string
        llm_model: string
        embedding_provider: string
        embedding_model: string
        target_db: string
      }
    }
  | {
      status: 'unhealthy'
      error: string
    }

type JsonRecord = Record<string, unknown>

const contractError = (context: string, detail: string): never => {
  throw new Error(`Text2SQL ${context} 응답 계약 오류: ${detail}`)
}

const asRecord = (value: unknown, context: string): JsonRecord => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return contractError(context, '객체가 필요합니다.')
  }
  return value as JsonRecord
}

const asString = (value: unknown, context: string): string =>
  typeof value === 'string' ? value : contractError(context, '문자열이 필요합니다.')

const asOneOf = <T extends string>(
  value: unknown,
  allowed: readonly T[],
  context: string,
): T => {
  const parsed = asString(value, context)
  const matched = allowed.find(candidate => candidate === parsed)
  return matched ?? contractError(context, `지원하지 않는 값 '${parsed}'입니다.`)
}

const asNumber = (value: unknown, context: string): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? value
    : contractError(context, '유한한 숫자가 필요합니다.')

const asBoolean = (value: unknown, context: string): boolean =>
  typeof value === 'boolean' ? value : contractError(context, '불리언이 필요합니다.')

const asNullableString = (value: unknown, context: string): string | null =>
  value === null || value === undefined ? null : asString(value, context)

const asNullableNumber = (value: unknown, context: string): number | null =>
  value === null || value === undefined ? null : asNumber(value, context)

const asStringArray = (value: unknown, context: string): string[] => {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    return contractError(context, '문자열 배열이 필요합니다.')
  }
  return value
}

const asRecordArray = (value: unknown, context: string): JsonRecord[] => {
  if (!Array.isArray(value)) return contractError(context, '객체 배열이 필요합니다.')
  return value.map((item, index) => asRecord(item, `${context}[${index}]`))
}

const optionalNumber = (record: JsonRecord, key: string, context: string): number | undefined =>
  record[key] === undefined || record[key] === null
    ? undefined
    : asNumber(record[key], `${context}.${key}`)

const optionalString = (record: JsonRecord, key: string, context: string): string | undefined =>
  record[key] === undefined || record[key] === null
    ? undefined
    : asString(record[key], `${context}.${key}`)

const optionalBoolean = (record: JsonRecord, key: string, context: string): boolean | undefined =>
  record[key] === undefined || record[key] === null
    ? undefined
    : asBoolean(record[key], `${context}.${key}`)

const parseExecutionResult = (value: unknown, context: string): ReactExecutionResult => {
  const record = asRecord(value, context)
  const rows = record.rows
  if (!Array.isArray(rows) || rows.some(row => !Array.isArray(row))) {
    return contractError(`${context}.rows`, '행 배열이 필요합니다.')
  }
  return {
    columns: asStringArray(record.columns, `${context}.columns`),
    rows,
    row_count: asNumber(record.row_count, `${context}.row_count`),
    execution_time_ms: asNumber(record.execution_time_ms, `${context}.execution_time_ms`),
  }
}

const parseQueryStep = (value: unknown, index: number): QueryStep => {
  const context = `history.steps[${index}]`
  const record = asRecord(value, context)
  return {
    iteration: optionalNumber(record, 'iteration', context),
    reasoning: optionalString(record, 'reasoning', context),
    tool_name: optionalString(record, 'tool_name', context),
    tool_result_preview: optionalString(record, 'tool_result_preview', context),
  }
}

export function parseQueryHistoryItem(value: unknown): QueryHistoryItem {
  const record = asRecord(value, 'history item')
  const status = asString(record.status, 'history.status')
  if (status !== 'pending' && status !== 'completed' && status !== 'error') {
    return contractError('history.status', `지원하지 않는 상태 '${status}'입니다.`)
  }
  if (record.execution_result !== null && record.execution_result !== undefined) {
    parseExecutionResult(record.execution_result, 'history.execution_result')
  }
  if (record.steps !== null && record.steps !== undefined && !Array.isArray(record.steps)) {
    return contractError('history.steps', '배열 또는 null이 필요합니다.')
  }
  const metadata = record.metadata === null || record.metadata === undefined
    ? null
    : asRecord(record.metadata, 'history.metadata')
  return {
    id: asString(record.id, 'history.id'),
    question: asString(record.question, 'history.question'),
    final_sql: asNullableString(record.final_sql, 'history.final_sql'),
    validated_sql: asNullableString(record.validated_sql, 'history.validated_sql'),
    execution_result: record.execution_result === null || record.execution_result === undefined
      ? null
      : parseExecutionResult(record.execution_result, 'history.execution_result'),
    row_count: asNullableNumber(record.row_count, 'history.row_count'),
    status,
    error_message: asNullableString(record.error_message, 'history.error_message'),
    steps_count: asNullableNumber(record.steps_count, 'history.steps_count'),
    execution_time_ms: asNullableNumber(record.execution_time_ms, 'history.execution_time_ms'),
    created_at: asNullableString(record.created_at, 'history.created_at'),
    updated_at: asNullableString(record.updated_at, 'history.updated_at'),
    metadata,
    steps: Array.isArray(record.steps) ? record.steps.map(parseQueryStep) : null,
    tables_used: record.tables_used === undefined
      ? []
      : asStringArray(record.tables_used, 'history.tables_used'),
  }
}

export function parseQueryHistoryResponse(value: unknown): QueryHistoryResponse {
  const record = asRecord(value, 'history list')
  if (!Array.isArray(record.items)) return contractError('history.items', '배열이 필요합니다.')
  return {
    items: record.items.map(parseQueryHistoryItem),
    total: asNumber(record.total, 'history.total'),
    page: asNumber(record.page, 'history.page'),
    page_size: asNumber(record.page_size, 'history.page_size'),
  }
}

export function parseStringList(value: unknown, context: string): string[] {
  return asStringArray(value, context)
}

export function parseTableInfoList(value: unknown): Text2SqlTableInfo[] {
  if (!Array.isArray(value)) return contractError('table list', '배열이 필요합니다.')
  return value.map((item, index) => {
    const context = `table[${index}]`
    const record = asRecord(item, context)
    return {
      name: asString(record.name, `${context}.name`),
      schema: asString(record.schema, `${context}.schema`),
      datasource: optionalString(record, 'datasource', context),
      description: asString(record.description, `${context}.description`),
      column_count: asNumber(record.column_count, `${context}.column_count`),
    }
  })
}

export function parseColumnInfoList(value: unknown): Text2SqlColumnInfo[] {
  if (!Array.isArray(value)) return contractError('column list', '배열이 필요합니다.')
  return value.map((item, index) => {
    const context = `column[${index}]`
    const record = asRecord(item, context)
    return {
      name: asString(record.name, `${context}.name`),
      table_name: asString(record.table_name, `${context}.table_name`),
      dtype: asString(record.dtype, `${context}.dtype`),
      nullable: asBoolean(record.nullable, `${context}.nullable`),
      description: asString(record.description, `${context}.description`),
    }
  })
}

export function parseMetaObjectTypeList(value: unknown): Text2SqlMetaObjectType[] {
  if (!Array.isArray(value)) return contractError('ObjectType list', '배열이 필요합니다.')
  return value.map((item, index) => {
    const context = `object type[${index}]`
    const record = asRecord(item, context)
    return {
      name: asString(record.name, `${context}.name`),
      schema: optionalString(record, 'schema', context),
      datasource: optionalString(record, 'datasource', context),
      description: optionalString(record, 'description', context),
      materialized_view: optionalString(record, 'materialized_view', context),
      column_count: optionalNumber(record, 'column_count', context),
    }
  })
}

export function parseAskResponse(value: unknown): AskResponse {
  const record = asRecord(value, 'ask')
  const table = asRecord(record.table, 'ask.table')
  const rows = table.rows
  if (!Array.isArray(rows) || rows.some(row => !Array.isArray(row))) {
    return contractError('ask.table.rows', '행 배열이 필요합니다.')
  }
  const provenance = asRecord(record.provenance, 'ask.provenance')
  const perf = asRecord(record.perf, 'ask.perf')
  return {
    sql: asString(record.sql, 'ask.sql'),
    table: {
      columns: asStringArray(table.columns, 'ask.table.columns'),
      rows,
      row_count: asNumber(table.row_count, 'ask.table.row_count'),
      execution_time_ms: optionalNumber(table, 'execution_time_ms', 'ask.table'),
      truncated: optionalBoolean(table, 'truncated', 'ask.table'),
      returned_row_count: optionalNumber(table, 'returned_row_count', 'ask.table'),
      max_rows_cap: optionalNumber(table, 'max_rows_cap', 'ask.table'),
    },
    charts: asRecordArray(record.charts, 'ask.charts'),
    provenance: {
      tables: asStringArray(provenance.tables, 'ask.provenance.tables'),
      columns: asStringArray(provenance.columns, 'ask.provenance.columns'),
      neo4j_paths: asStringArray(provenance.neo4j_paths, 'ask.provenance.neo4j_paths'),
      vector_matches: asRecordArray(provenance.vector_matches, 'ask.provenance.vector_matches'),
      prompt_snapshot_id: asString(provenance.prompt_snapshot_id, 'ask.provenance.prompt_snapshot_id'),
    },
    perf: {
      embedding_ms: asNumber(perf.embedding_ms, 'ask.perf.embedding_ms'),
      graph_search_ms: asNumber(perf.graph_search_ms, 'ask.perf.graph_search_ms'),
      llm_ms: asNumber(perf.llm_ms, 'ask.perf.llm_ms'),
      sql_ms: asNumber(perf.sql_ms, 'ask.perf.sql_ms'),
      total_ms: asNumber(perf.total_ms, 'ask.perf.total_ms'),
    },
    warnings: record.warnings === null || record.warnings === undefined
      ? null
      : asStringArray(record.warnings, 'ask.warnings'),
  }
}

export function parseFeedbackResponse(value: unknown): FeedbackResponse {
  const record = asRecord(value, 'feedback')
  return {
    feedback_id: asString(record.feedback_id, 'feedback.feedback_id'),
    message: asString(record.message, 'feedback.message'),
  }
}

export function parseText2SqlHealthResponse(value: unknown): Text2SqlHealthResponse {
  const record = asRecord(value, 'health')
  const status = asString(record.status, 'health.status')
  if (status === 'unhealthy') {
    return { status, error: asString(record.error, 'health.error') }
  }
  if (status !== 'healthy') {
    return contractError('health.status', `지원하지 않는 상태 '${status}'입니다.`)
  }
  const config = asRecord(record.config, 'health.config')
  const neo4j = asString(record.neo4j, 'health.neo4j')
  if (neo4j !== 'connected') {
    return contractError('health.neo4j', `지원하지 않는 상태 '${neo4j}'입니다.`)
  }
  return {
    status,
    neo4j,
    config: {
      llm_provider: asString(config.llm_provider, 'health.config.llm_provider'),
      llm_model: asString(config.llm_model, 'health.config.llm_model'),
      embedding_provider: asString(config.embedding_provider, 'health.config.embedding_provider'),
      embedding_model: asString(config.embedding_model, 'health.config.embedding_model'),
      target_db: asString(config.target_db, 'health.config.target_db'),
    },
  }
}

export function parseDirectSqlResponse(value: unknown): DirectSqlResponse {
  const record = asRecord(value, 'direct SQL')
  const status = asString(record.status, 'direct SQL.status')
  if (status !== 'success' && status !== 'error') {
    return contractError('direct SQL.status', `지원하지 않는 상태 '${status}'입니다.`)
  }
  const rows = record.rows
  if (!Array.isArray(rows) || rows.some(row => !Array.isArray(row))) {
    return contractError('direct SQL.rows', '행 배열이 필요합니다.')
  }
  return {
    status,
    sql: asString(record.sql, 'direct SQL.sql'),
    validated_sql: asNullableString(record.validated_sql, 'direct SQL.validated_sql'),
    columns: asStringArray(record.columns, 'direct SQL.columns'),
    rows,
    row_count: asNumber(record.row_count, 'direct SQL.row_count'),
    execution_time_ms: asNumber(record.execution_time_ms, 'direct SQL.execution_time_ms'),
    truncated: optionalBoolean(record, 'truncated', 'direct SQL'),
    returned_row_count: optionalNumber(record, 'returned_row_count', 'direct SQL'),
    max_rows_cap: optionalNumber(record, 'max_rows_cap', 'direct SQL'),
    error_message: asNullableString(record.error_message, 'direct SQL.error_message'),
    formatted_summary: asNullableString(record.formatted_summary, 'direct SQL.formatted_summary'),
  }
}

const parseResultStatus = (record: JsonRecord, context: string): 'success' | 'error' => {
  const status = asString(record.status, `${context}.status`)
  if (status !== 'success' && status !== 'error') {
    return contractError(`${context}.status`, `지원하지 않는 상태 '${status}'입니다.`)
  }
  return status
}

export function parseMaterializedViewResponse(value: unknown): MaterializedViewResponse {
  const record = asRecord(value, 'materialized view')
  return {
    status: parseResultStatus(record, 'materialized view'),
    view_name: asString(record.view_name, 'materialized view.view_name'),
    full_name: asString(record.full_name, 'materialized view.full_name'),
    row_count: asNumber(record.row_count, 'materialized view.row_count'),
    message: asString(record.message, 'materialized view.message'),
    error_message: asNullableString(record.error_message, 'materialized view.error_message'),
  }
}

export function parseMaterializedViewRefreshResponse(value: unknown): MaterializedViewRefreshResponse {
  const record = asRecord(value, 'materialized view refresh')
  return {
    status: parseResultStatus(record, 'materialized view refresh'),
    view_name: asString(record.view_name, 'materialized view refresh.view_name'),
    row_count: optionalNumber(record, 'row_count', 'materialized view refresh'),
    message: optionalString(record, 'message', 'materialized view refresh'),
    error_message: asNullableString(record.error_message, 'materialized view refresh.error_message'),
  }
}

export function parseMaterializedViewListResponse(value: unknown): MaterializedViewListResponse {
  const record = asRecord(value, 'materialized view list')
  if (!Array.isArray(record.views)) {
    return contractError('materialized view list.views', '배열이 필요합니다.')
  }
  return {
    status: parseResultStatus(record, 'materialized view list'),
    views: record.views.map((item, index) => {
      const context = `materialized view list.views[${index}]`
      const view = asRecord(item, context)
      return {
        schema: asString(view.schema, `${context}.schema`),
        name: asString(view.name, `${context}.name`),
        owner: asString(view.owner, `${context}.owner`),
        is_populated: asBoolean(view.is_populated, `${context}.is_populated`),
        size: asString(view.size, `${context}.size`),
        description: asNullableString(view.description, `${context}.description`),
      }
    }),
    count: asNumber(record.count, 'materialized view list.count'),
    error_message: asNullableString(record.error_message, 'materialized view list.error_message'),
  }
}

export function parseDirectSqlStreamEvent(value: unknown): DirectSqlStreamEvent {
  const record = asRecord(value, 'Direct SQL 스트림 이벤트')
  return {
    event: optionalString(record, 'event', 'Direct SQL 스트림 이벤트'),
    type: optionalString(record, 'type', 'Direct SQL 스트림 이벤트'),
    columns: record.columns === undefined
      ? undefined
      : asStringArray(record.columns, 'Direct SQL 스트림 이벤트.columns'),
    rows: Array.isArray(record.rows) ? record.rows : undefined,
    row: record.row,
    data: record.data,
    message: optionalString(record, 'message', 'Direct SQL 스트림 이벤트'),
    validated_sql: optionalString(record, 'validated_sql', 'Direct SQL 스트림 이벤트'),
    mode: optionalString(record, 'mode', 'Direct SQL 스트림 이벤트'),
    reason: optionalString(record, 'reason', 'Direct SQL 스트림 이벤트'),
    prepared_sql: optionalString(record, 'prepared_sql', 'Direct SQL 스트림 이벤트'),
    llm_model: optionalString(record, 'llm_model', 'Direct SQL 스트림 이벤트'),
    llm_elapsed_ms: optionalNumber(record, 'llm_elapsed_ms', 'Direct SQL 스트림 이벤트'),
    row_count: optionalNumber(record, 'row_count', 'Direct SQL 스트림 이벤트'),
    execution_time_ms: optionalNumber(record, 'execution_time_ms', 'Direct SQL 스트림 이벤트'),
    token: optionalString(record, 'token', 'Direct SQL 스트림 이벤트'),
  }
}

export function parseReactStreamEvent(value: unknown): ReactStreamEvent {
  const record = asRecord(value, 'ReAct 스트림 이벤트')
  const event = asString(record.event, 'ReAct 스트림 이벤트.event')
  const context = `ReAct ${event}`
  const requiredRecord = (key: string): JsonRecord => asRecord(record[key], `${context}.${key}`)
  const optionalRecord = (key: string): JsonRecord | undefined =>
    record[key] === undefined || record[key] === null
      ? undefined
      : asRecord(record[key], `${context}.${key}`)
  const optionalStringArray = (key: string): string[] | undefined =>
    record[key] === undefined || record[key] === null
      ? undefined
      : asStringArray(record[key], `${context}.${key}`)
  const numberRecord = (value: unknown, childContext: string): Record<string, number> => {
    const source = asRecord(value, childContext)
    return Object.fromEntries(Object.entries(source).map(([key, entry]) => [
      key,
      asNumber(entry, `${childContext}.${key}`),
    ]))
  }
  const parseCompleteness = (source: unknown, childContext: string) => {
    const completeness = asRecord(source, childContext)
    return {
      is_complete: asBoolean(completeness.is_complete, `${childContext}.is_complete`),
      missing_info: asString(completeness.missing_info, `${childContext}.missing_info`),
      confidence_level: asString(completeness.confidence_level, `${childContext}.confidence_level`),
    }
  }
  const parseStep = (source: unknown, childContext: string): ReactStepModel => {
    const step = asRecord(source, childContext)
    const toolCall = asRecord(step.tool_call, `${childContext}.tool_call`)
    return {
      iteration: asNumber(step.iteration, `${childContext}.iteration`),
      reasoning: asString(step.reasoning, `${childContext}.reasoning`),
      metadata_xml: asString(step.metadata_xml, `${childContext}.metadata_xml`),
      partial_sql: asString(step.partial_sql, `${childContext}.partial_sql`),
      sql_completeness: parseCompleteness(step.sql_completeness, `${childContext}.sql_completeness`),
      tool_call: {
        name: asString(toolCall.name, `${childContext}.tool_call.name`),
        raw_parameters_xml: asString(toolCall.raw_parameters_xml, `${childContext}.tool_call.raw_parameters_xml`),
        parameters: asRecord(toolCall.parameters, `${childContext}.tool_call.parameters`),
      },
      tool_result: asNullableString(step.tool_result, `${childContext}.tool_result`),
      llm_output: asString(step.llm_output, `${childContext}.llm_output`),
    }
  }
  const parseResponse = (source: unknown, childContext: string): ReactResponseModel => {
    const response = asRecord(source, childContext)
    const status = asString(response.status, `${childContext}.status`)
    if (status !== 'completed' && status !== 'needs_user_input') {
      return contractError(`${childContext}.status`, `지원하지 않는 상태 '${status}'입니다.`)
    }
    const responseStatus = status === 'completed' ? 'completed' : 'needs_user_input'
    if (!Array.isArray(response.steps)) {
      return contractError(`${childContext}.steps`, '배열이 필요합니다.')
    }
    let qualityGate
    if (response.quality_gate !== undefined && response.quality_gate !== null) {
      const gate = asRecord(response.quality_gate, `${childContext}.quality_gate`)
      if (!Array.isArray(gate.results)) {
        return contractError(`${childContext}.quality_gate.results`, '배열이 필요합니다.')
      }
      qualityGate = {
        policy: asString(gate.policy, `${childContext}.quality_gate.policy`),
        threshold: asNumber(gate.threshold, `${childContext}.quality_gate.threshold`),
        rounds: asNumber(gate.rounds, `${childContext}.quality_gate.rounds`),
        ok: asBoolean(gate.ok, `${childContext}.quality_gate.ok`),
        verified_confidence: asNullableNumber(gate.verified_confidence, `${childContext}.quality_gate.verified_confidence`),
        results: gate.results.map((round, index) => {
          const roundContext = `${childContext}.quality_gate.results[${index}]`
          const result = asRecord(round, roundContext)
          return {
            accept: asBoolean(result.accept, `${roundContext}.accept`),
            confidence: asNumber(result.confidence, `${roundContext}.confidence`),
            reasons: asStringArray(result.reasons, `${roundContext}.reasons`),
            risk_flags: asStringArray(result.risk_flags, `${roundContext}.risk_flags`),
            summary: asString(result.summary, `${roundContext}.summary`),
          }
        }),
        error: asNullableString(gate.error, `${childContext}.quality_gate.error`),
      }
    }
    return {
      status: responseStatus,
      final_sql: asNullableString(response.final_sql, `${childContext}.final_sql`),
      validated_sql: asNullableString(response.validated_sql, `${childContext}.validated_sql`),
      execution_result: response.execution_result === undefined || response.execution_result === null
        ? null
        : parseExecutionResult(response.execution_result, `${childContext}.execution_result`),
      steps: response.steps.map((step, index) => parseStep(step, `${childContext}.steps[${index}]`)),
      collected_metadata: asString(response.collected_metadata, `${childContext}.collected_metadata`),
      partial_sql: asString(response.partial_sql, `${childContext}.partial_sql`),
      remaining_tool_calls: asNumber(response.remaining_tool_calls, `${childContext}.remaining_tool_calls`),
      session_state: asNullableString(response.session_state, `${childContext}.session_state`),
      conversation_state: asNullableString(response.conversation_state, `${childContext}.conversation_state`),
      question_to_user: asNullableString(response.question_to_user, `${childContext}.question_to_user`),
      warnings: response.warnings === undefined || response.warnings === null
        ? null
        : asStringArray(response.warnings, `${childContext}.warnings`),
      from_cache: optionalBoolean(response, 'from_cache', childContext),
      quality_gate: qualityGate,
      feedback_required: optionalBoolean(response, 'feedback_required', childContext),
    }
  }

  switch (event) {
    case 'token':
      return { event, iteration: asNumber(record.iteration, `${context}.iteration`), token: asString(record.token, `${context}.token`) }
    case 'prefetch':
      return {
        event,
        tool_name: asString(record.tool_name, `${context}.tool_name`),
        elapsed_ms: asNumber(record.elapsed_ms, `${context}.elapsed_ms`),
        remaining_tool_calls: asNumber(record.remaining_tool_calls, `${context}.remaining_tool_calls`),
      }
    case 'prefetch_error':
      return {
        event,
        tool_name: asString(record.tool_name, `${context}.tool_name`),
        elapsed_ms: asNumber(record.elapsed_ms, `${context}.elapsed_ms`),
        error: asString(record.error, `${context}.error`),
      }
    case 'context_refresh': {
      const delta = optionalRecord('context_delta')
      return {
        event,
        tool_name: asString(record.tool_name, `${context}.tool_name`),
        elapsed_ms: asNumber(record.elapsed_ms, `${context}.elapsed_ms`),
        remaining_tool_calls: asNumber(record.remaining_tool_calls, `${context}.remaining_tool_calls`),
        mode: optionalString(record, 'mode', context),
        enrichment_index: optionalNumber(record, 'enrichment_index', context),
        context_parse_mode: optionalString(record, 'context_parse_mode', context),
        context_hash_changed: optionalBoolean(record, 'context_hash_changed', context),
        context_delta: delta ? {
          tables_added: optionalNumber(delta, 'tables_added', `${context}.context_delta`),
          values_added: optionalNumber(delta, 'values_added', `${context}.context_delta`),
          relationships_added: optionalNumber(delta, 'relationships_added', `${context}.context_delta`),
        } : undefined,
      }
    }
    case 'context_refresh_error':
      return {
        event,
        tool_name: asString(record.tool_name, `${context}.tool_name`),
        elapsed_ms: optionalNumber(record, 'elapsed_ms', context),
        remaining_tool_calls: optionalNumber(record, 'remaining_tool_calls', context),
        mode: optionalString(record, 'mode', context),
        error: asString(record.error, `${context}.error`),
      }
    case 'pipeline_stage':
      return {
        event,
        pipeline: asString(record.pipeline, `${context}.pipeline`),
        stage: asString(record.stage, `${context}.stage`),
        status: asOneOf(record.status, ['start', 'done', 'error'] as const, `${context}.status`),
        seq: asNumber(record.seq, `${context}.seq`),
        iteration: asNumber(record.iteration, `${context}.iteration`),
        elapsed_ms: optionalNumber(record, 'elapsed_ms', context),
        counts: record.counts === undefined ? undefined : numberRecord(record.counts, `${context}.counts`),
        notes: optionalStringArray('notes'),
        error: optionalString(record, 'error', context),
        ts_ms: optionalNumber(record, 'ts_ms', context),
      }
    case 'pipeline_item':
      return {
        event,
        pipeline: asString(record.pipeline, `${context}.pipeline`),
        stage: asString(record.stage, `${context}.stage`),
        item_type: asString(record.item_type, `${context}.item_type`),
        iteration: asNumber(record.iteration, `${context}.iteration`),
        index: asNumber(record.index, `${context}.index`),
        total: asNumber(record.total, `${context}.total`),
        verdict: optionalString(record, 'verdict', context),
        row_count: optionalNumber(record, 'row_count', context),
        elapsed_ms: optionalNumber(record, 'elapsed_ms', context),
        ts_ms: optionalNumber(record, 'ts_ms', context),
      }
    case 'section_delta':
      return {
        event,
        iteration: asNumber(record.iteration, `${context}.iteration`),
        section: asString(record.section, `${context}.section`),
        delta: asString(record.delta, `${context}.delta`),
      }
    case 'metadata_item':
      return {
        event,
        iteration: asNumber(record.iteration, `${context}.iteration`),
        item_type: asOneOf(
          record.item_type,
          ['table', 'column', 'value', 'relationship', 'constraint'] as const,
          `${context}.item_type`,
        ),
        item: requiredRecord('item'),
      }
    case 'format_repair':
      return { event, iteration: asNumber(record.iteration, `${context}.iteration`), reason: asString(record.reason, `${context}.reason`) }
    case 'phase': {
      const data = requiredRecord('data')
      return {
        event,
        phase: asOneOf(
          record.phase,
          ['thinking', 'reasoning', 'acting', 'observing'] as const,
          `${context}.phase`,
        ),
        iteration: asNumber(record.iteration, `${context}.iteration`),
        data: {
          reasoning: optionalString(data, 'reasoning', `${context}.data`),
          partial_sql: optionalString(data, 'partial_sql', `${context}.data`),
          sql_completeness: data.sql_completeness === undefined
            ? undefined
            : parseCompleteness(data.sql_completeness, `${context}.data.sql_completeness`),
          tool_name: optionalString(data, 'tool_name', `${context}.data`),
          tool_parameters: data.tool_parameters === undefined
            ? undefined
            : asRecord(data.tool_parameters, `${context}.data.tool_parameters`),
          tool_result_preview: optionalString(data, 'tool_result_preview', `${context}.data`),
        },
        state: requiredRecord('state'),
      }
    }
    case 'step':
      return { event, step: parseStep(record.step, `${context}.step`), state: requiredRecord('state') }
    case 'completed':
    case 'complete':
    case 'needs_user_input':
      return { event, response: parseResponse(record.response, `${context}.response`), state: requiredRecord('state') }
    case 'cache_hit':
      return {
        event,
        message: optionalString(record, 'message', context),
        hit_count: optionalNumber(record, 'hit_count', context),
      }
    case 'error':
      return { event, message: asString(record.message, `${context}.message`) }
    default:
      return contractError('ReAct 스트림 이벤트.event', `지원하지 않는 이벤트 '${event}'입니다.`)
  }
}

export function toTabularRows(rows: unknown, columns: string[]): unknown[][] {
  if (!Array.isArray(rows)) return []
  return rows.flatMap(row => {
    if (Array.isArray(row)) return [row]
    if (typeof row === 'object' && row !== null) {
      const record = row as JsonRecord
      return [columns.map(column => record[column])]
    }
    return []
  })
}

export function toRecordRows(rows: unknown, columns: string[]): Array<Record<string, unknown>> {
  if (!Array.isArray(rows)) return []
  return rows.flatMap(row => {
    if (typeof row === 'object' && row !== null && !Array.isArray(row)) return [row as JsonRecord]
    if (!Array.isArray(row)) return []
    return [Object.fromEntries(columns.map((column, index) => [column, row[index]]))]
  })
}
