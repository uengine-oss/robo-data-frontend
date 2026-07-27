/** OLAP backend contracts derived from data-platform-olap FastAPI models. */

export type OlapScalar = string | number | boolean | null
export type OlapRow = Record<string, unknown>

export interface OlapLevel {
  name: string
  column: string
  order_column?: string | null
  caption?: string | null
}

export interface OlapDimension {
  name: string
  table: string
  foreign_key?: string | null
  primary_key?: string | null
  levels: OlapLevel[]
  caption?: string | null
}

export interface OlapMeasure {
  name: string
  column: string
  /** FastAPI Cube model uses `agg`, not the UI-only `aggregator` spelling. */
  agg: string
  format_string?: string | null
  caption?: string | null
}

export interface OlapJoin {
  left_table: string
  left_key: string
  right_table: string
  right_key: string
}

export interface OlapCubeMetadata {
  name: string
  fact_table: string
  dimensions: OlapDimension[]
  measures: OlapMeasure[]
  joins: OlapJoin[]
  caption?: string | null
}

export interface OlapCubeCollection {
  cubes: OlapCubeMetadata[]
  schema_name?: string | null
}

export interface OlapCubeList {
  cubes: string[]
}

export interface PivotField {
  dimension: string
  level: string
}

export interface PivotMeasure {
  name: string
}

export interface PivotFilter {
  dimension: string
  level: string
  operator: string
  values: OlapScalar[]
}

export interface PivotQuery {
  cube_name: string
  rows: PivotField[]
  columns: PivotField[]
  measures: PivotMeasure[]
  filters: PivotFilter[]
  limit?: number
}

export interface OlapQueryResult {
  sql: string
  columns: string[]
  rows: OlapRow[]
  row_count: number
  execution_time_ms: number
  error?: string | null
}

export interface OlapNaturalQueryResult {
  question: string
  sql: string | null
  columns: string[]
  rows: OlapRow[]
  row_count: number
  execution_time_ms: number
  error?: string | null
}

export interface OlapSqlPreview {
  sql: string | null
  error?: string | null
}

export interface OlapSchemaDescription {
  description: string
}

export interface OlapMutationResult {
  success: boolean
  message?: string
}

export interface OlapCatalogColumn extends Record<string, unknown> {
  name: string
  type?: string
  data_type?: string
  description?: string
}

export interface OlapCatalogTable extends Record<string, unknown> {
  name: string
  schema?: string
  description?: string
  columns: OlapCatalogColumn[]
}

export interface OlapCatalogResponse {
  tables: OlapCatalogTable[]
  relationships: OlapRow[]
  schemas: Array<string | OlapRow>
  total_tables?: number
}

export interface OlapSuggestionMapping extends Record<string, unknown> {
  source?: string
  target?: string
  transformation?: string
  description?: string
}

export interface OlapSuggestedDimension extends Record<string, unknown> {
  name: string
  name_korean?: string
  description?: string
  description_korean?: string
  source_table?: string | null
  source_columns?: string[]
  target_columns?: string[]
  columns?: OlapCatalogColumn[]
  column_mappings?: OlapSuggestionMapping[]
  generation_strategy?: string
  generate_sql?: string
}

export interface OlapSuggestedMeasure extends Record<string, unknown> {
  name: string
  name_korean?: string
  description?: string
  column?: string
  aggregator?: string
}

export interface OlapAiSuggestion extends Record<string, unknown> {
  cube_name?: string
  fact_table_name?: string
  fact_sources?: string[]
  dimension_sources?: Record<string, string[]>
  dimensions?: OlapSuggestedDimension[]
  measures?: OlapSuggestedMeasure[]
  fact_mappings?: OlapSuggestionMapping[]
  suggested_mappings?: OlapSuggestionMapping[]
  sync_strategy?: string
  incremental_column?: string | null
  reasoning?: string
  generalization?: {
    original_query?: string
    generalized_query?: string
    generalized_query_korean?: string
    pivot_capabilities?: string[]
    pivot_examples?: string[]
    identified_dimensions?: Array<{
      name: string
      source_hint?: string
      description?: string
    }>
    reasoning?: string
  }
  error?: string
}

export interface OlapSuggestionResponse {
  suggestion: OlapAiSuggestion | null
  available_tables?: number
  error?: string
}

export interface OlapDesignerLevel {
  id: number
  name: string
  column: string
}

export interface OlapDesignerDimension {
  id: number
  name: string
  table: string
  foreignKey: string
  levels: OlapDesignerLevel[]
  nameKorean?: string
  etlStrategy?: string
  sourceTable?: string | null
}

export interface OlapDesignerMeasure {
  id: number
  name: string
  column: string
  aggregator: string
  nameKorean?: string
}

export interface EtlMapping {
  source_table: string
  source_column: string
  target_table: string
  target_column: string
  transformation: string
}

export interface EtlConfig {
  cube_name: string
  fact_table: string
  dimension_tables: string[]
  source_tables: string[]
  mappings: EtlMapping[]
  dw_schema: string
  created_at?: string
  last_sync?: string | null
  sync_mode: string
  incremental_column: string | null
}

export interface CreateEtlConfigResult {
  success: boolean
  config: EtlConfig
}

export interface EtlConfigList {
  configs: EtlConfig[]
}

export interface EtlSyncResult {
  status: 'pending' | 'running' | 'completed' | 'failed'
  rows_inserted?: number
  rows_updated?: number
  rows_deleted?: number
  duration_ms?: number
  error?: string | null
  details?: OlapRow
}

export interface StarSchemaColumn {
  name: string
  dtype?: string
  description?: string
}

export interface StarSchemaDimension {
  name: string
  table_name: string
  columns: StarSchemaColumn[]
}

export interface StarSchemaDdlRequest {
  cube_name: string
  fact_table_name: string
  fact_columns: StarSchemaColumn[]
  dimensions: StarSchemaDimension[]
  dw_schema: string
}

export interface DdlResult extends Record<string, unknown> {
  success?: boolean
  ddl?: string
  error?: string | null
  message?: string
}

export interface ProvisionResult extends Record<string, unknown> {
  success: boolean
  steps: OlapRow[]
  errors: string[]
  cube_name?: string
  tables_created?: string[]
}

export interface AirflowRunResult extends Record<string, unknown> {
  success: boolean
  cube_name?: string
  dag_id?: string
  dag_run_id?: string
  state?: string
  airflow_url?: string
  message?: string
  error?: string
}

export interface AirflowDagList {
  dags: OlapRow[]
  total: number
}

export interface DwTableList {
  tables: string[]
}

export interface GeneratedEtlScript {
  code: string
  filename?: string
}

export interface SavedEtlScript {
  exists: boolean
  code: string
  filename: string
  saved_at: string
}

export interface SaveEtlScriptResult {
  success: boolean
  metadata?: { saved_at?: string }
}

export interface ScriptExecutionEvent {
  type: 'progress' | 'log' | 'error' | 'regenerating' | 'agent_reasoning' | 'script_updated' | 'success' | 'complete' | 'warning'
  message: string
  attempt?: number
  maxRetries?: number
  success?: boolean
  output?: string
  terminal?: boolean
}

export type AgentStreamEventType =
  | 'start'
  | 'log'
  | 'reasoning'
  | 'code'
  | 'script'
  | 'sql'
  | 'status'
  | 'dimensions'
  | 'test'
  | 'complete'
  | 'error'

export interface AgentStreamEvent extends Record<string, unknown> {
  type: AgentStreamEventType
  message?: string
  timestamp?: string
  status?: string
  node?: string
  code?: string
  complete?: boolean
  name?: string
  success?: boolean
  strategies?: unknown[]
}

export interface AgentStreamCallbacks {
  onStart?: (data: AgentStreamEvent) => void
  onLog?: (data: AgentStreamEvent) => void
  onCode?: (data: AgentStreamEvent) => void
  onSql?: (data: AgentStreamEvent) => void
  onStatus?: (data: AgentStreamEvent) => void
  onDimensions?: (data: AgentStreamEvent) => void
  onTest?: (data: AgentStreamEvent) => void
  onComplete?: (data: AgentStreamEvent) => void
  onError?: (error: AgentStreamEvent) => void
}

export interface AgentReasoningLog {
  timestamp: string
  type: string
  message: string
  node?: string
}

function record(value: unknown, context: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${context} 응답이 객체가 아닙니다.`)
  }
  return value as Record<string, unknown>
}

function stringValue(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`${field}가 문자열이 아닙니다.`)
  return value
}

function numberValue(value: unknown, field: string, fallback = 0): number {
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${field}가 유효한 숫자가 아닙니다.`)
  }
  return value
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error(`${field}가 문자열 배열이 아닙니다.`)
  }
  return value
}

function optionalString(value: unknown, field: string): string | null | undefined {
  if (value === undefined || value === null) return value
  return stringValue(value, field)
}

function parseLevel(value: unknown): OlapLevel {
  const data = record(value, 'OLAP level')
  return {
    name: stringValue(data.name, 'level.name'),
    column: stringValue(data.column, 'level.column'),
    order_column: optionalString(data.order_column, 'level.order_column'),
    caption: optionalString(data.caption, 'level.caption')
  }
}

function parseDimension(value: unknown): OlapDimension {
  const data = record(value, 'OLAP dimension')
  if (!Array.isArray(data.levels)) throw new Error('dimension.levels가 배열이 아닙니다.')
  return {
    name: stringValue(data.name, 'dimension.name'),
    table: stringValue(data.table, 'dimension.table'),
    foreign_key: optionalString(data.foreign_key, 'dimension.foreign_key'),
    primary_key: optionalString(data.primary_key, 'dimension.primary_key'),
    levels: data.levels.map(parseLevel),
    caption: optionalString(data.caption, 'dimension.caption')
  }
}

function parseMeasure(value: unknown): OlapMeasure {
  const data = record(value, 'OLAP measure')
  return {
    name: stringValue(data.name, 'measure.name'),
    column: stringValue(data.column, 'measure.column'),
    agg: data.agg === undefined ? 'SUM' : stringValue(data.agg, 'measure.agg'),
    format_string: optionalString(data.format_string, 'measure.format_string'),
    caption: optionalString(data.caption, 'measure.caption')
  }
}

function parseJoin(value: unknown): OlapJoin {
  const data = record(value, 'OLAP join')
  return {
    left_table: stringValue(data.left_table, 'join.left_table'),
    left_key: stringValue(data.left_key, 'join.left_key'),
    right_table: stringValue(data.right_table, 'join.right_table'),
    right_key: stringValue(data.right_key, 'join.right_key')
  }
}

export function parseCubeMetadata(value: unknown): OlapCubeMetadata {
  const data = record(value, 'OLAP cube metadata')
  if (!Array.isArray(data.dimensions) || !Array.isArray(data.measures)) {
    throw new Error('큐브 dimensions/measures 계약이 올바르지 않습니다.')
  }
  const joins = data.joins === undefined ? [] : data.joins
  if (!Array.isArray(joins)) throw new Error('cube.joins가 배열이 아닙니다.')
  return {
    name: stringValue(data.name, 'cube.name'),
    fact_table: stringValue(data.fact_table, 'cube.fact_table'),
    dimensions: data.dimensions.map(parseDimension),
    measures: data.measures.map(parseMeasure),
    joins: joins.map(parseJoin),
    caption: optionalString(data.caption, 'cube.caption')
  }
}

export function parseCubeCollection(value: unknown): OlapCubeCollection {
  const data = record(value, 'OLAP schema upload')
  if (!Array.isArray(data.cubes)) throw new Error('schema.cubes가 배열이 아닙니다.')
  return {
    cubes: data.cubes.map(parseCubeMetadata),
    schema_name: optionalString(data.schema_name, 'schema.schema_name')
  }
}

export function parseCubeList(value: unknown): OlapCubeList {
  const data = record(value, 'OLAP cube list')
  return { cubes: stringArray(data.cubes, 'cubes') }
}

export function parseQueryResult(value: unknown): OlapQueryResult {
  const data = record(value, 'OLAP query result')
  if (!Array.isArray(data.rows) || data.rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
    throw new Error('query.rows가 객체 배열이 아닙니다.')
  }
  return {
    sql: stringValue(data.sql, 'query.sql'),
    columns: stringArray(data.columns ?? [], 'query.columns'),
    rows: data.rows as OlapRow[],
    row_count: numberValue(data.row_count, 'query.row_count'),
    execution_time_ms: numberValue(data.execution_time_ms, 'query.execution_time_ms'),
    error: optionalString(data.error, 'query.error')
  }
}

export function parseNaturalQueryResult(value: unknown): OlapNaturalQueryResult {
  const data = record(value, 'OLAP natural query result')
  if (!Array.isArray(data.rows) || data.rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
    throw new Error('natural query.rows가 객체 배열이 아닙니다.')
  }
  return {
    question: stringValue(data.question, 'query.question'),
    sql: optionalString(data.sql, 'query.sql') ?? null,
    columns: stringArray(data.columns ?? [], 'query.columns'),
    rows: data.rows as OlapRow[],
    row_count: numberValue(data.row_count, 'query.row_count'),
    execution_time_ms: numberValue(data.execution_time_ms, 'query.execution_time_ms'),
    error: optionalString(data.error, 'query.error')
  }
}

export function parseSqlPreview(value: unknown): OlapSqlPreview {
  const data = record(value, 'OLAP SQL preview')
  return {
    sql: optionalString(data.sql, 'preview.sql') ?? null,
    error: optionalString(data.error, 'preview.error')
  }
}

function parseCatalogColumn(value: unknown): OlapCatalogColumn {
  const data = record(value, 'OLAP catalog column')
  return { ...data, name: stringValue(data.name, 'catalog.column.name') }
}

function parseCatalogTable(value: unknown): OlapCatalogTable {
  const data = record(value, 'OLAP catalog table')
  const columns = data.columns ?? []
  if (!Array.isArray(columns)) throw new Error('catalog.table.columns가 배열이 아닙니다.')
  return {
    ...data,
    name: stringValue(data.name, 'catalog.table.name'),
    columns: columns.map(parseCatalogColumn)
  }
}

export function parseCatalogResponse(value: unknown): OlapCatalogResponse {
  const data = record(value, 'OLAP catalog')
  if (!Array.isArray(data.tables) || !Array.isArray(data.relationships) || !Array.isArray(data.schemas)) {
    throw new Error('OLAP catalog tables/relationships/schemas 계약이 올바르지 않습니다.')
  }
  return {
    tables: data.tables.map(parseCatalogTable),
    relationships: data.relationships.map(item => record(item, 'catalog relationship')),
    schemas: data.schemas.map(item => typeof item === 'string' ? item : record(item, 'catalog schema')),
    total_tables: data.total_tables === undefined ? undefined : numberValue(data.total_tables, 'catalog.total_tables')
  }
}

function parseSuggestionMapping(value: unknown): OlapSuggestionMapping {
  const data = record(value, 'OLAP suggestion mapping')
  return {
    ...data,
    source: data.source === undefined ? undefined : stringValue(data.source, 'mapping.source'),
    target: data.target === undefined ? undefined : stringValue(data.target, 'mapping.target'),
    transformation: data.transformation === undefined ? undefined : stringValue(data.transformation, 'mapping.transformation'),
    description: data.description === undefined ? undefined : stringValue(data.description, 'mapping.description')
  }
}

function parseSuggestedDimension(value: unknown): OlapSuggestedDimension {
  const data = record(value, 'OLAP suggested dimension')
  const columns = data.columns === undefined ? undefined : data.columns
  const columnMappings = data.column_mappings === undefined ? undefined : data.column_mappings
  if (columns !== undefined && !Array.isArray(columns)) throw new Error('suggestion dimension.columns가 배열이 아닙니다.')
  if (columnMappings !== undefined && !Array.isArray(columnMappings)) {
    throw new Error('suggestion dimension.column_mappings가 배열이 아닙니다.')
  }
  return {
    ...data,
    name: stringValue(data.name, 'suggestion dimension.name'),
    name_korean: data.name_korean === undefined ? undefined : stringValue(data.name_korean, 'dimension.name_korean'),
    description: data.description === undefined ? undefined : stringValue(data.description, 'dimension.description'),
    description_korean: data.description_korean === undefined ? undefined : stringValue(data.description_korean, 'dimension.description_korean'),
    source_table: optionalString(data.source_table, 'dimension.source_table'),
    source_columns: data.source_columns === undefined ? undefined : stringArray(data.source_columns, 'dimension.source_columns'),
    target_columns: data.target_columns === undefined ? undefined : stringArray(data.target_columns, 'dimension.target_columns'),
    columns: columns?.map(parseCatalogColumn),
    column_mappings: columnMappings?.map(parseSuggestionMapping),
    generation_strategy: data.generation_strategy === undefined ? undefined : stringValue(data.generation_strategy, 'dimension.generation_strategy'),
    generate_sql: data.generate_sql === undefined ? undefined : stringValue(data.generate_sql, 'dimension.generate_sql')
  }
}

function parseSuggestedMeasure(value: unknown): OlapSuggestedMeasure {
  const data = record(value, 'OLAP suggested measure')
  return {
    ...data,
    name: stringValue(data.name, 'suggestion measure.name'),
    name_korean: data.name_korean === undefined ? undefined : stringValue(data.name_korean, 'measure.name_korean'),
    description: data.description === undefined ? undefined : stringValue(data.description, 'measure.description'),
    column: data.column === undefined ? undefined : stringValue(data.column, 'measure.column'),
    aggregator: data.aggregator === undefined ? undefined : stringValue(data.aggregator, 'measure.aggregator')
  }
}

function parseGeneralization(value: unknown): NonNullable<OlapAiSuggestion['generalization']> {
  const data = record(value, 'OLAP suggestion generalization')
  let identifiedDimensions: NonNullable<OlapAiSuggestion['generalization']>['identified_dimensions']
  if (data.identified_dimensions !== undefined) {
    if (!Array.isArray(data.identified_dimensions)) throw new Error('generalization.identified_dimensions가 배열이 아닙니다.')
    identifiedDimensions = data.identified_dimensions.map(item => {
      const dimension = record(item, 'identified dimension')
      return {
        name: stringValue(dimension.name, 'identified dimension.name'),
        source_hint: dimension.source_hint === undefined ? undefined : stringValue(dimension.source_hint, 'identified dimension.source_hint'),
        description: dimension.description === undefined ? undefined : stringValue(dimension.description, 'identified dimension.description')
      }
    })
  }
  return {
    original_query: data.original_query === undefined ? undefined : stringValue(data.original_query, 'generalization.original_query'),
    generalized_query: data.generalized_query === undefined ? undefined : stringValue(data.generalized_query, 'generalization.generalized_query'),
    generalized_query_korean: data.generalized_query_korean === undefined ? undefined : stringValue(data.generalized_query_korean, 'generalization.generalized_query_korean'),
    pivot_capabilities: data.pivot_capabilities === undefined ? undefined : stringArray(data.pivot_capabilities, 'generalization.pivot_capabilities'),
    pivot_examples: data.pivot_examples === undefined ? undefined : stringArray(data.pivot_examples, 'generalization.pivot_examples'),
    identified_dimensions: identifiedDimensions,
    reasoning: data.reasoning === undefined ? undefined : stringValue(data.reasoning, 'generalization.reasoning')
  }
}

function parseAiSuggestion(value: unknown): OlapAiSuggestion {
  const data = record(value, 'OLAP suggestion')
  let dimensionSources: Record<string, string[]> | undefined
  if (data.dimension_sources !== undefined) {
    const sources = record(data.dimension_sources, 'suggestion.dimension_sources')
    dimensionSources = Object.fromEntries(
      Object.entries(sources).map(([name, items]) => [name, stringArray(items, `dimension_sources.${name}`)])
    )
  }
  const array = <T>(items: unknown, field: string, parser: (item: unknown) => T): T[] | undefined => {
    if (items === undefined) return undefined
    if (!Array.isArray(items)) throw new Error(`${field}가 배열이 아닙니다.`)
    return items.map(parser)
  }
  return {
    ...data,
    cube_name: data.cube_name === undefined ? undefined : stringValue(data.cube_name, 'suggestion.cube_name'),
    fact_table_name: data.fact_table_name === undefined ? undefined : stringValue(data.fact_table_name, 'suggestion.fact_table_name'),
    fact_sources: data.fact_sources === undefined ? undefined : stringArray(data.fact_sources, 'suggestion.fact_sources'),
    dimension_sources: dimensionSources,
    dimensions: array(data.dimensions, 'suggestion.dimensions', parseSuggestedDimension),
    measures: array(data.measures, 'suggestion.measures', parseSuggestedMeasure),
    fact_mappings: array(data.fact_mappings, 'suggestion.fact_mappings', parseSuggestionMapping),
    suggested_mappings: array(data.suggested_mappings, 'suggestion.suggested_mappings', parseSuggestionMapping),
    sync_strategy: data.sync_strategy === undefined ? undefined : stringValue(data.sync_strategy, 'suggestion.sync_strategy'),
    incremental_column: optionalString(data.incremental_column, 'suggestion.incremental_column'),
    reasoning: data.reasoning === undefined ? undefined : stringValue(data.reasoning, 'suggestion.reasoning'),
    generalization: data.generalization === undefined ? undefined : parseGeneralization(data.generalization),
    error: data.error === undefined ? undefined : stringValue(data.error, 'suggestion.error')
  }
}

export function parseSuggestionResponse(value: unknown): OlapSuggestionResponse {
  const data = record(value, 'OLAP ETL suggestion')
  const suggestion = data.suggestion === null || data.suggestion === undefined
    ? null
    : parseAiSuggestion(data.suggestion)
  return {
    suggestion,
    available_tables: data.available_tables === undefined ? undefined : numberValue(data.available_tables, 'available_tables'),
    error: optionalString(data.error, 'suggestion.error') ?? undefined
  }
}

export function parseSchemaDescription(value: unknown): OlapSchemaDescription {
  const data = record(value, 'OLAP schema description')
  return { description: stringValue(data.description, 'description') }
}

export function parseMutationResult(value: unknown): OlapMutationResult {
  const data = record(value, 'OLAP mutation')
  if (typeof data.success !== 'boolean') throw new Error('mutation.success가 boolean이 아닙니다.')
  return {
    success: data.success,
    message: data.message === undefined ? undefined : stringValue(data.message, 'mutation.message')
  }
}

export function parseEtlConfig(value: unknown): EtlConfig {
  const data = record(value, 'OLAP ETL config')
  if (!Array.isArray(data.mappings)) throw new Error('etl.mappings가 배열이 아닙니다.')
  return {
    cube_name: stringValue(data.cube_name, 'etl.cube_name'),
    fact_table: stringValue(data.fact_table, 'etl.fact_table'),
    dimension_tables: stringArray(data.dimension_tables, 'etl.dimension_tables'),
    source_tables: stringArray(data.source_tables, 'etl.source_tables'),
    mappings: data.mappings.map(item => {
      const mapping = record(item, 'ETL mapping')
      return {
        source_table: stringValue(mapping.source_table, 'mapping.source_table'),
        source_column: stringValue(mapping.source_column, 'mapping.source_column'),
        target_table: stringValue(mapping.target_table, 'mapping.target_table'),
        target_column: stringValue(mapping.target_column, 'mapping.target_column'),
        transformation: mapping.transformation === undefined ? '' : stringValue(mapping.transformation, 'mapping.transformation')
      }
    }),
    dw_schema: data.dw_schema === undefined ? 'dw' : stringValue(data.dw_schema, 'etl.dw_schema'),
    created_at: data.created_at === undefined ? undefined : stringValue(data.created_at, 'etl.created_at'),
    last_sync: optionalString(data.last_sync, 'etl.last_sync'),
    sync_mode: data.sync_mode === undefined ? 'full' : stringValue(data.sync_mode, 'etl.sync_mode'),
    incremental_column: optionalString(data.incremental_column, 'etl.incremental_column') ?? null
  }
}

export function parseCreateEtlConfigResult(value: unknown): CreateEtlConfigResult {
  const data = record(value, 'OLAP ETL config creation')
  if (typeof data.success !== 'boolean') throw new Error('etl config success가 boolean이 아닙니다.')
  return { success: data.success, config: parseEtlConfig(data.config) }
}

export function parseEtlConfigList(value: unknown): EtlConfigList {
  const data = record(value, 'OLAP ETL config list')
  if (!Array.isArray(data.configs)) throw new Error('etl configs가 배열이 아닙니다.')
  return { configs: data.configs.map(parseEtlConfig) }
}

export function parseEtlSyncResult(value: unknown): EtlSyncResult {
  const data = record(value, 'OLAP ETL sync')
  const status = stringValue(data.status, 'sync.status') as EtlSyncResult['status']
  if (!['pending', 'running', 'completed', 'failed'].includes(status)) {
    throw new Error(`지원하지 않는 ETL 상태: ${status}`)
  }
  return {
    status,
    rows_inserted: data.rows_inserted === undefined ? undefined : numberValue(data.rows_inserted, 'sync.rows_inserted'),
    rows_updated: data.rows_updated === undefined ? undefined : numberValue(data.rows_updated, 'sync.rows_updated'),
    rows_deleted: data.rows_deleted === undefined ? undefined : numberValue(data.rows_deleted, 'sync.rows_deleted'),
    duration_ms: data.duration_ms === undefined ? undefined : numberValue(data.duration_ms, 'sync.duration_ms'),
    error: optionalString(data.error, 'sync.error'),
    details: data.details === undefined ? undefined : record(data.details, 'sync.details')
  }
}

export function parseDdlResult(value: unknown): DdlResult {
  const data = record(value, 'OLAP DDL result')
  return {
    ...data,
    success: data.success === undefined ? undefined : Boolean(data.success),
    ddl: data.ddl === undefined ? undefined : stringValue(data.ddl, 'ddl'),
    error: optionalString(data.error, 'ddl.error'),
    message: data.message === undefined ? undefined : stringValue(data.message, 'ddl.message')
  }
}

export function parseProvisionResult(value: unknown): ProvisionResult {
  const data = record(value, 'OLAP provision result')
  if (typeof data.success !== 'boolean' || !Array.isArray(data.steps) || !Array.isArray(data.errors)) {
    throw new Error('OLAP provision success/steps/errors 계약이 올바르지 않습니다.')
  }
  return {
    ...data,
    success: data.success,
    steps: data.steps.map(item => record(item, 'provision step')),
    errors: stringArray(data.errors, 'provision.errors'),
    cube_name: data.cube_name === undefined ? undefined : stringValue(data.cube_name, 'provision.cube_name'),
    tables_created: data.tables_created === undefined ? undefined : stringArray(data.tables_created, 'provision.tables_created')
  }
}

export function parseAirflowRunResult(value: unknown): AirflowRunResult {
  const data = record(value, 'OLAP Airflow result')
  if (typeof data.success !== 'boolean') throw new Error('airflow.success가 boolean이 아닙니다.')
  return {
    ...data,
    success: data.success,
    cube_name: data.cube_name === undefined ? undefined : stringValue(data.cube_name, 'airflow.cube_name'),
    dag_id: data.dag_id === undefined ? undefined : stringValue(data.dag_id, 'airflow.dag_id'),
    dag_run_id: data.dag_run_id === undefined ? undefined : stringValue(data.dag_run_id, 'airflow.dag_run_id'),
    state: data.state === undefined ? undefined : stringValue(data.state, 'airflow.state'),
    airflow_url: data.airflow_url === undefined ? undefined : stringValue(data.airflow_url, 'airflow.airflow_url'),
    message: data.message === undefined ? undefined : stringValue(data.message, 'airflow.message'),
    error: data.error === undefined ? undefined : stringValue(data.error, 'airflow.error')
  }
}

export function parseAirflowDagList(value: unknown): AirflowDagList {
  const data = record(value, 'OLAP Airflow DAG list')
  if (!Array.isArray(data.dags)) throw new Error('airflow.dags가 배열이 아닙니다.')
  return {
    dags: data.dags.map(item => record(item, 'airflow DAG')),
    total: numberValue(data.total, 'airflow.total')
  }
}

export function parseDwTableList(value: unknown): DwTableList {
  const data = record(value, 'OLAP DW table list')
  return { tables: stringArray(data.tables, 'dw.tables') }
}

export function parseGeneratedEtlScript(value: unknown): GeneratedEtlScript {
  const data = record(value, 'OLAP generated ETL script')
  return {
    code: stringValue(data.code, 'script.code'),
    filename: data.filename === undefined ? undefined : stringValue(data.filename, 'script.filename')
  }
}

export function parseSavedEtlScript(value: unknown): SavedEtlScript {
  const data = record(value, 'OLAP saved ETL script')
  if (typeof data.exists !== 'boolean') throw new Error('script.exists가 boolean이 아닙니다.')
  return {
    exists: data.exists,
    code: data.code === undefined ? '' : stringValue(data.code, 'script.code'),
    filename: data.filename === undefined ? '' : stringValue(data.filename, 'script.filename'),
    saved_at: data.saved_at === undefined ? '' : stringValue(data.saved_at, 'script.saved_at')
  }
}

export function parseSaveEtlScriptResult(value: unknown): SaveEtlScriptResult {
  const data = record(value, 'OLAP save ETL script')
  if (typeof data.success !== 'boolean') throw new Error('script save success가 boolean이 아닙니다.')
  const metadata = data.metadata === undefined ? undefined : record(data.metadata, 'script metadata')
  return {
    success: data.success,
    metadata: metadata === undefined ? undefined : {
      saved_at: metadata.saved_at === undefined ? undefined : stringValue(metadata.saved_at, 'script metadata.saved_at')
    }
  }
}

export function parseOlapObject(value: unknown, context = 'OLAP response'): OlapRow {
  return record(value, context)
}

export function parseScriptExecutionEvent(value: unknown): ScriptExecutionEvent {
  const data = record(value, 'OLAP script execution event')
  const allowed: ScriptExecutionEvent['type'][] = [
    'progress', 'log', 'error', 'regenerating', 'agent_reasoning',
    'script_updated', 'success', 'complete', 'warning'
  ]
  const type = stringValue(data.type, 'event.type') as ScriptExecutionEvent['type']
  if (!allowed.includes(type)) throw new Error(`지원하지 않는 OLAP script event: ${type}`)
  return {
    type,
    message: stringValue(data.message, 'event.message'),
    attempt: data.attempt === undefined ? undefined : numberValue(data.attempt, 'event.attempt'),
    maxRetries: data.maxRetries === undefined ? undefined : numberValue(data.maxRetries, 'event.maxRetries'),
    success: data.success === undefined ? undefined : Boolean(data.success),
    output: data.output === undefined ? undefined : stringValue(data.output, 'event.output')
  }
}

export function parseAgentStreamEvent(value: unknown): AgentStreamEvent {
  const data = record(value, 'OLAP agent stream event')
  const allowed: AgentStreamEventType[] = [
    'start', 'log', 'reasoning', 'code', 'script', 'sql', 'status',
    'dimensions', 'test', 'complete', 'error'
  ]
  const type = stringValue(data.type, 'agent event.type') as AgentStreamEventType
  if (!allowed.includes(type)) throw new Error(`지원하지 않는 OLAP agent event: ${type}`)
  return { ...data, type }
}

export function describeOlapError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}
