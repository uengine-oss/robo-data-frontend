/** object-explorer api — 도메인 레이어 오브젝트 탐색(온톨로지 백엔드). 공유 http 코어 사용. */
import { postJson, handleHttpError } from '@/shared/services/http'
import { ONTOLOGY_BASE_URL } from './baseUrl'
import {
  parseOntologyBehaviorList,
  type OntologyBehavior,
} from '../model/behavior.ts'
import {
  parseCausalIncomingNetwork,
  parseCausalAnalysisResult,
  parseCausalAnalysisStreamEvent,
  type CausalAnalysisProgress,
  type CausalAnalysisResult,
  type CausalIncomingNetwork,
} from '../model/causalAnalysis.ts'
import type { OntologyNode, OntologyRelationship, OntologySchema } from '../model/schema'
import { useRuntimeStore } from '@/shared/stores/runtime'

const sessionHeaders = () => useRuntimeStore().getHeaders()

function fetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(sessionHeaders())
  new Headers(init.headers).forEach((value, key) => headers.set(key, value))
  return globalThis.fetch(input, { ...init, headers })
}

export type JsonObject = Record<string, unknown>

export interface MultiLayerProgressDetail {
  chunkCurrent?: number
  chunkTotal?: number
  substepCurrent?: number
  substepTotal?: number
  completedSteps?: number
  totalSteps?: number
  substepLabel?: string
}

export interface MultiLayerSynonymSuggestion {
  termId: string
  termName: string
  glossaryId: string
  glossaryName: string
  suggestedSynonym: string
  similarity: number
  sourceNodeName: string
  sourceLayer: string
}

export interface MultiLayerGeneratedSchema {
  id?: string
  name?: string
  nodes: OntologyNode[]
  relationships: OntologyRelationship[]
}

export interface OntologyNodeDataResult {
  nodeId?: string
  nodeName?: string
  layer?: string
  unit?: string
  hasDataSource: boolean
  dataSource?: string
  isObjectType?: boolean
  columns: string[]
  rows: Array<Record<string, unknown>>
  rowCount: number
  timeColumns: string[]
  numericColumns: string[]
  businessDayFiltered?: boolean
  chartRecommendation?: {
    type: 'line' | 'bar' | 'table'
    xAxis: string | null
    yAxis: string[]
  }
  message?: string
}

export interface OntologyNodeFilterValues {
  distinctValues: Record<string, Array<string | number | boolean>>
}

export interface GenerateFromSchemaResponse {
  success: boolean
  error?: string
  tablesProcessed?: number
  relationshipsInferred?: number
  schema?: OntologySchema
}

export type MultiLayerGenerationEvent =
  | { event: 'start' }
  | {
    event: 'layer_progress'
    layer: string
    progress: number
    message: string
    detail?: MultiLayerProgressDetail
  }
  | {
    event: 'layer_complete'
    layer: string
    nodeCount: number
    relationCount: number
  }
  | {
    event: 'complete'
    data: {
      success: boolean
      schema?: MultiLayerGeneratedSchema
      synonymSuggestions: MultiLayerSynonymSuggestion[]
      error?: string
    }
  }
  | { event: 'error'; message: string }

export interface NodeSearchCandidate {
  table_name: string
  datasource?: string
  full_table_name?: string
  columns: string[]
  sample_data: Array<Record<string, unknown>>
  row_count: number | null
  row_count_approx: boolean
  /** Backend-provided relevance. null means the source did not provide a score. */
  relevance_score: number | null
  match_reason: string
  suggested_sql: string
  materializedView?: string
}

export interface DatasourceMapping {
  node_id: string
  node_name: string
  node_layer: string
  search_query: string
  candidates: NodeSearchCandidate[]
  selected_candidate: NodeSearchCandidate | null
  status: string
}

export type AutoLinkDatasourceEvent =
  | {
    type: 'progress'
    node_id: string
    status: string
    message: string
    completed?: number
  }
  | { type: 'result'; data: { mappings?: Record<string, DatasourceMapping> } }
  | { type: 'error'; message: string }

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseJsonObject(value: unknown, contract: string): JsonObject {
  if (!isRecord(value)) throw new Error(`${contract} 응답 형식이 올바르지 않습니다.`)
  return value
}

function optionalFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function isOntologyNode(value: unknown): value is OntologyNode {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.label === 'string'
}

function isOntologyRelationship(value: unknown): value is OntologyRelationship {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.source === 'string'
    && typeof value.target === 'string'
    && typeof value.type === 'string'
}

export function parseOntologyNodeFilterValues(
  value: unknown,
): OntologyNodeFilterValues {
  const response = parseJsonObject(value, 'Ontology 노드 필터값')
  const rawValues = response.distinctValues
  if (!isRecord(rawValues)) {
    throw new Error('Ontology 노드 필터값 응답에 distinctValues 객체가 없습니다.')
  }

  const distinctValues: OntologyNodeFilterValues['distinctValues'] = {}
  for (const [column, values] of Object.entries(rawValues)) {
    if (
      !Array.isArray(values)
      || !values.every(item =>
        typeof item === 'string'
        || typeof item === 'number'
        || typeof item === 'boolean')
    ) {
      throw new Error(`Ontology 노드 필터값 ${column} 목록 형식이 올바르지 않습니다.`)
    }
    distinctValues[column] = [...values]
  }
  return { distinctValues }
}

export function parseGenerateFromSchemaResponse(
  value: unknown,
): GenerateFromSchemaResponse {
  const response = parseJsonObject(value, 'DB schema 기반 Ontology 생성')
  if (typeof response.success !== 'boolean') {
    throw new Error('DB schema 기반 Ontology 생성 success는 boolean이어야 합니다.')
  }
  if (response.error !== undefined && typeof response.error !== 'string') {
    throw new Error('DB schema 기반 Ontology 생성 error는 문자열이어야 합니다.')
  }
  for (const key of ['tablesProcessed', 'relationshipsInferred'] as const) {
    const count = response[key]
    if (
      count !== undefined
      && (
        typeof count !== 'number'
        || !Number.isInteger(count)
        || count < 0
      )
    ) {
      throw new Error(`DB schema 기반 Ontology 생성 ${key}는 0 이상의 정수여야 합니다.`)
    }
  }
  if (response.schema !== undefined) {
    if (
      !isRecord(response.schema)
      || typeof response.schema.name !== 'string'
      || !Array.isArray(response.schema.nodes)
      || !response.schema.nodes.every(isOntologyNode)
      || !Array.isArray(response.schema.relationships)
      || !response.schema.relationships.every(isOntologyRelationship)
      || !Array.isArray(response.schema.labels)
    ) {
      throw new Error('DB schema 기반 Ontology 생성 schema 구조가 올바르지 않습니다.')
    }
  }

  const parsed: GenerateFromSchemaResponse = {
    success: response.success,
  }
  if (response.error !== undefined) parsed.error = response.error
  if (response.tablesProcessed !== undefined) {
    parsed.tablesProcessed = response.tablesProcessed as number
  }
  if (response.relationshipsInferred !== undefined) {
    parsed.relationshipsInferred = response.relationshipsInferred as number
  }
  if (response.schema !== undefined) {
    parsed.schema = response.schema as unknown as OntologySchema
  }
  return parsed
}

function parseProgressDetail(value: unknown): MultiLayerProgressDetail | undefined {
  if (!isRecord(value)) return undefined
  return {
    chunkCurrent: optionalFiniteNumber(value.chunkCurrent),
    chunkTotal: optionalFiniteNumber(value.chunkTotal),
    substepCurrent: optionalFiniteNumber(value.substepCurrent),
    substepTotal: optionalFiniteNumber(value.substepTotal),
    completedSteps: optionalFiniteNumber(value.completedSteps),
    totalSteps: optionalFiniteNumber(value.totalSteps),
    substepLabel: optionalString(value.substepLabel),
  }
}

function parseSynonymSuggestions(value: unknown): MultiLayerSynonymSuggestion[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(raw => {
    if (!isRecord(raw)) return []
    return [{
      termId: optionalString(raw.termId) ?? optionalString(raw.term_id) ?? '',
      termName: optionalString(raw.termName) ?? optionalString(raw.term_name) ?? '',
      glossaryId: optionalString(raw.glossaryId) ?? optionalString(raw.glossary_id) ?? '',
      glossaryName: optionalString(raw.glossaryName) ?? optionalString(raw.glossary_name) ?? '',
      suggestedSynonym: optionalString(raw.suggestedSynonym) ?? optionalString(raw.suggested_synonym) ?? '',
      similarity: optionalFiniteNumber(raw.similarity) ?? 0,
      sourceNodeName: optionalString(raw.sourceNodeName) ?? optionalString(raw.source_node_name) ?? '',
      sourceLayer: optionalString(raw.sourceLayer) ?? optionalString(raw.source_layer) ?? '',
    }]
  })
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

export function parseOntologyNodeDataResult(value: unknown): OntologyNodeDataResult {
  const raw = parseJsonObject(value, '온톨로지 노드 데이터')
  if (typeof raw.hasDataSource !== 'boolean') {
    throw new Error('온톨로지 노드 데이터 응답에 hasDataSource가 없습니다.')
  }

  const columns = stringArray(raw.columns)
  const rows = Array.isArray(raw.rows)
    ? raw.rows.filter(isRecord)
    : []
  const rawChart = isRecord(raw.chartRecommendation) ? raw.chartRecommendation : null
  const chartType = rawChart?.type === 'line' || rawChart?.type === 'bar' || rawChart?.type === 'table'
    ? rawChart.type
    : null

  if (raw.hasDataSource && (!Array.isArray(raw.columns) || !Array.isArray(raw.rows))) {
    throw new Error('온톨로지 노드 데이터 성공 응답에 컬럼 또는 행 배열이 없습니다.')
  }

  return {
    nodeId: optionalString(raw.nodeId),
    nodeName: optionalString(raw.nodeName),
    layer: optionalString(raw.layer),
    unit: optionalString(raw.unit),
    hasDataSource: raw.hasDataSource,
    dataSource: optionalString(raw.dataSource),
    isObjectType: typeof raw.isObjectType === 'boolean' ? raw.isObjectType : undefined,
    columns,
    rows,
    rowCount: optionalFiniteNumber(raw.rowCount) ?? rows.length,
    timeColumns: stringArray(raw.timeColumns),
    numericColumns: stringArray(raw.numericColumns),
    businessDayFiltered: typeof raw.businessDayFiltered === 'boolean'
      ? raw.businessDayFiltered
      : undefined,
    chartRecommendation: rawChart && chartType ? {
      type: chartType,
      xAxis: typeof rawChart.xAxis === 'string' ? rawChart.xAxis : null,
      yAxis: stringArray(rawChart.yAxis),
    } : undefined,
    message: optionalString(raw.message),
  }
}

export function parseDatasourceConfirmationResponse(
  value: unknown,
): { success: true } {
  const raw = parseJsonObject(value, '데이터 소스 확정')
  if (raw.success !== true) {
    throw new Error('데이터 소스 확정 응답의 success가 true가 아닙니다.')
  }
  return { success: true }
}

export function parseMultiLayerGenerationEvent(value: unknown): MultiLayerGenerationEvent {
  const raw = parseJsonObject(value, '다층 온톨로지 스트림')
  if (raw.event === 'start') return { event: 'start' }

  if (raw.event === 'layer_progress'
    && typeof raw.layer === 'string'
    && typeof raw.message === 'string') {
    return {
      event: 'layer_progress',
      layer: raw.layer,
      progress: optionalFiniteNumber(raw.progress) ?? 0,
      message: raw.message,
      detail: parseProgressDetail(raw.detail),
    }
  }

  if (raw.event === 'layer_complete'
    && typeof raw.layer === 'string'
    && typeof raw.nodeCount === 'number') {
    return {
      event: 'layer_complete',
      layer: raw.layer,
      nodeCount: raw.nodeCount,
      relationCount: optionalFiniteNumber(raw.relationCount) ?? 0,
    }
  }

  if (raw.event === 'complete' && isRecord(raw.data) && typeof raw.data.success === 'boolean') {
    const schema = raw.data.schema
    const parsedSchema = isRecord(schema)
      && Array.isArray(schema.nodes)
      && schema.nodes.every(isOntologyNode)
      && Array.isArray(schema.relationships)
      && schema.relationships.every(isOntologyRelationship)
      ? {
        id: optionalString(schema.id),
        name: optionalString(schema.name),
        nodes: schema.nodes,
        relationships: schema.relationships,
      }
      : undefined

    if (raw.data.success && !parsedSchema) {
      throw new Error('다층 온톨로지 완료 응답에 유효한 스키마가 없습니다.')
    }
    return {
      event: 'complete',
      data: {
        success: raw.data.success,
        schema: parsedSchema,
        synonymSuggestions: parseSynonymSuggestions(raw.data.synonymSuggestions),
        error: optionalString(raw.data.error),
      },
    }
  }

  if (raw.event === 'error') {
    return {
      event: 'error',
      message: optionalString(raw.message) ?? '온톨로지 생성 중 오류가 발생했습니다.',
    }
  }

  throw new Error('다층 온톨로지 스트림 이벤트 형식이 올바르지 않습니다.')
}

function parseNodeSearchCandidate(
  value: unknown,
  contract: string,
): NodeSearchCandidate {
  const candidate = parseJsonObject(value, contract)
  if (
    typeof candidate.table_name !== 'string'
    || !Array.isArray(candidate.columns)
    || !candidate.columns.every(column => typeof column === 'string')
    || !Array.isArray(candidate.sample_data)
    || !candidate.sample_data.every(isRecord)
    || !(
      candidate.row_count === null
      || (
        typeof candidate.row_count === 'number'
        && Number.isFinite(candidate.row_count)
      )
    )
    || typeof candidate.row_count_approx !== 'boolean'
    || !(
      candidate.relevance_score === null
      || (
        typeof candidate.relevance_score === 'number'
        && Number.isFinite(candidate.relevance_score)
      )
    )
    || typeof candidate.match_reason !== 'string'
    || typeof candidate.suggested_sql !== 'string'
    || (
      candidate.datasource !== undefined
      && typeof candidate.datasource !== 'string'
    )
    || (
      candidate.full_table_name !== undefined
      && typeof candidate.full_table_name !== 'string'
    )
    || (
      candidate.materializedView !== undefined
      && typeof candidate.materializedView !== 'string'
    )
  ) {
    throw new Error(`${contract} 후보 형식이 올바르지 않습니다.`)
  }
  return {
    table_name: candidate.table_name,
    datasource: candidate.datasource,
    full_table_name: candidate.full_table_name,
    columns: [...candidate.columns],
    sample_data: candidate.sample_data.map(row => ({ ...row })),
    row_count: candidate.row_count,
    row_count_approx: candidate.row_count_approx,
    relevance_score: candidate.relevance_score,
    match_reason: candidate.match_reason,
    suggested_sql: candidate.suggested_sql,
    materializedView: candidate.materializedView,
  }
}

function parseDatasourceMapping(
  nodeId: string,
  value: unknown,
): DatasourceMapping {
  const contract = `데이터소스 자동연결 ${nodeId}`
  const mapping = parseJsonObject(value, contract)
  if (
    mapping.node_id !== nodeId
    || typeof mapping.node_name !== 'string'
    || typeof mapping.node_layer !== 'string'
    || typeof mapping.search_query !== 'string'
    || !Array.isArray(mapping.candidates)
    || typeof mapping.status !== 'string'
    || !(
      mapping.selected_candidate === null
      || isRecord(mapping.selected_candidate)
    )
  ) {
    throw new Error(`${contract} 매핑 형식이 올바르지 않습니다.`)
  }
  return {
    node_id: mapping.node_id,
    node_name: mapping.node_name,
    node_layer: mapping.node_layer,
    search_query: mapping.search_query,
    candidates: mapping.candidates.map((candidate, index) =>
      parseNodeSearchCandidate(candidate, `${contract} ${index + 1}번`)),
    selected_candidate: mapping.selected_candidate
      ? parseNodeSearchCandidate(
        mapping.selected_candidate,
        `${contract} 선택`,
      )
      : null,
    status: mapping.status,
  }
}

export function parseAutoLinkDatasourceMappings(
  value: unknown,
): Record<string, DatasourceMapping> {
  const mappings = parseJsonObject(value, '데이터소스 자동연결 mappings')
  return Object.fromEntries(
    Object.entries(mappings).map(([nodeId, mapping]) => [
      nodeId,
      parseDatasourceMapping(nodeId, mapping),
    ]),
  )
}

export function parseAutoLinkDatasourceEvent(value: unknown): AutoLinkDatasourceEvent {
  const event = parseJsonObject(value, '데이터소스 자동연결')
  if (event.type === 'progress'
    && typeof event.node_id === 'string'
    && typeof event.status === 'string'
    && typeof event.message === 'string') {
    return {
      type: 'progress',
      node_id: event.node_id,
      status: event.status,
      message: event.message,
      completed: typeof event.completed === 'number' ? event.completed : undefined,
    }
  }
  if (event.type === 'result' && isRecord(event.data)) {
    return {
      type: 'result',
      data: {
        mappings: event.data.mappings === undefined
          ? undefined
          : parseAutoLinkDatasourceMappings(event.data.mappings),
      },
    }
  }
  if (event.type === 'error' && typeof event.message === 'string') {
    return { type: 'error', message: event.message }
  }
  throw new Error('데이터소스 자동연결 이벤트 형식이 올바르지 않습니다.')
}

// ============================================================================
// Object Explorer API (도메인 레이어 오브젝트 탐색기)
// ============================================================================

export interface ChartConfig {
  chartType: 'bar' | 'line' | 'pie' | 'map' | 'none'
  xAxis?: string
  yAxis?: string
  valueField?: string
  labelField?: string
  latitudeField?: string
  longitudeField?: string
  regionField?: string
}

export interface ObjectTypeInfo {
  id: string
  name: string
  description?: string
  columns: ObjectTypeColumn[]
  materializedView?: string
  query?: string
  createdAt?: string
  chartConfig?: ChartConfig
  behaviors?: OntologyBehavior[]
}

export interface ObjectTypeCreateRequest {
  name: string
  description: string
  dataSourceType: 'natural-language' | 'direct-sql' | 'manual'
  columns: ObjectTypeColumn[]
  query?: string
  sourceQuestion?: string
  createMindsDbView: boolean
  createMaterializedView: false
  viewName?: string
  initialRecords?: Array<Record<string, string | number | boolean | null>>
}

export interface ObjectTypeNameSuggestionRequest {
  question: string
  sql: string
  columns: string[]
}

export interface ObjectTypeNameSuggestion {
  korean_name?: string
  english_name?: string
  description?: string
}

export interface ObjectTypeColumn {
  name: string
  type: string
  description?: string
}

export interface ObjectTypeDetailColumn {
  name: string
  type?: string
  description?: string
}

export interface ObjectTypeDetail extends Record<string, unknown> {
  columns?: ObjectTypeDetailColumn[]
  description?: string
  materializedView?: string
  query?: string
  datasource?: string
  dataSource?: string
}

export type ObjectTypeRelationshipMatchStrategy =
  | 'EXACT_MATCH'
  | 'CONTAINS'
  | 'STARTS_WITH'
  | 'ENDS_WITH'

export type ObjectTypeRelationshipCardinality =
  | 'ONE_TO_ONE'
  | 'ONE_TO_MANY'
  | 'MANY_TO_ONE'
  | 'MANY_TO_MANY'

export interface ObjectTypeRelationship extends Record<string, unknown> {
  name?: string
  matchStrategy?: ObjectTypeRelationshipMatchStrategy
  cardinality?: ObjectTypeRelationshipCardinality
  description?: string
}

export interface ObjectTypeDataResponse {
  objectType: string
  columns: string[]
  rows: Array<Record<string, unknown>>
  rowCount: number
  usingMaterializedView: boolean
}

export function parseObjectTypeDataResponse(value: unknown): ObjectTypeDataResponse {
  const raw = parseJsonObject(value, '오브젝트 타입 데이터')
  if (typeof raw.objectType !== 'string'
    || !Array.isArray(raw.columns)
    || !raw.columns.every(column => typeof column === 'string')
    || !Array.isArray(raw.rows)
    || !raw.rows.every(isRecord)
    || typeof raw.rowCount !== 'number'
    || !Number.isFinite(raw.rowCount)
    || typeof raw.usingMaterializedView !== 'boolean') {
    throw new Error('오브젝트 타입 데이터 응답 형식이 올바르지 않습니다.')
  }
  return {
    objectType: raw.objectType,
    columns: raw.columns as string[],
    rows: raw.rows as Array<Record<string, unknown>>,
    rowCount: raw.rowCount,
    usingMaterializedView: raw.usingMaterializedView,
  }
}

function isChartType(value: unknown): value is ChartConfig['chartType'] {
  return value === 'bar'
    || value === 'line'
    || value === 'pie'
    || value === 'map'
    || value === 'none'
}

function parseObjectTypeChartConfig(value: unknown): ChartConfig | undefined {
  if (value === undefined) return undefined
  const record = parseJsonObject(value, 'ObjectType chartConfig')
  if (!isChartType(record.chartType)) {
    throw new Error('ObjectType chartConfig의 chartType이 올바르지 않습니다.')
  }
  const config: ChartConfig = { chartType: record.chartType }
  for (const field of [
    'xAxis',
    'yAxis',
    'valueField',
    'labelField',
    'latitudeField',
    'longitudeField',
    'regionField',
  ] as const) {
    if (record[field] !== undefined && typeof record[field] !== 'string') {
      throw new Error(`ObjectType chartConfig의 ${field}가 문자열이 아닙니다.`)
    }
    const fieldValue = optionalString(record[field])
    if (fieldValue !== undefined) config[field] = fieldValue
  }
  return config
}

function parseObjectTypeBehaviors(value: unknown): OntologyBehavior[] | undefined {
  if (value === undefined) return undefined
  return parseOntologyBehaviorList(value, 'ObjectType behaviors')
}

function parseObjectTypeInfo(value: unknown): ObjectTypeInfo {
  const record = parseJsonObject(value, 'ObjectType')
  if (typeof record.id !== 'string' || typeof record.name !== 'string') {
    throw new Error('ObjectType 응답에 유효한 id와 name이 없습니다.')
  }
  if (!Array.isArray(record.columns)) {
    throw new Error(`ObjectType ${record.name} 응답의 columns가 배열이 아닙니다.`)
  }
  const columns = record.columns.map((column, index) => {
    const item = parseJsonObject(column, `ObjectType ${record.name} columns[${index}]`)
    if (typeof item.name !== 'string' || typeof item.type !== 'string') {
      throw new Error(`ObjectType ${record.name} columns[${index}] 구조가 올바르지 않습니다.`)
    }
    return {
      name: item.name,
      type: item.type,
      description: optionalString(item.description),
    }
  })

  for (const field of ['description', 'materializedView', 'query', 'createdAt'] as const) {
    if (record[field] !== undefined && typeof record[field] !== 'string') {
      throw new Error(`ObjectType ${record.name} 응답의 ${field}가 문자열이 아닙니다.`)
    }
  }

  const objectType: ObjectTypeInfo = {
    id: record.id,
    name: record.name,
    columns,
  }
  const description = optionalString(record.description)
  const materializedView = optionalString(record.materializedView)
  const query = optionalString(record.query)
  const createdAt = optionalString(record.createdAt)
  const chartConfig = parseObjectTypeChartConfig(record.chartConfig)
  const behaviors = parseObjectTypeBehaviors(record.behaviors)
  if (description !== undefined) objectType.description = description
  if (materializedView !== undefined) objectType.materializedView = materializedView
  if (query !== undefined) objectType.query = query
  if (createdAt !== undefined) objectType.createdAt = createdAt
  if (chartConfig !== undefined) objectType.chartConfig = chartConfig
  if (behaviors !== undefined) objectType.behaviors = behaviors
  return objectType
}

export function parseObjectTypeListResponse(
  value: unknown,
): { objectTypes: ObjectTypeInfo[]; total: number } {
  const response = parseJsonObject(value, 'ObjectType 목록')
  if (!Array.isArray(response.objectTypes)) {
    throw new Error('ObjectType 목록 응답의 objectTypes가 배열이 아닙니다.')
  }
  if (!Number.isInteger(response.total) || Number(response.total) < 0) {
    throw new Error('ObjectType 목록 응답의 total이 0 이상의 정수가 아닙니다.')
  }
  return {
    objectTypes: response.objectTypes.map(parseObjectTypeInfo),
    total: Number(response.total),
  }
}

export function parseObjectTypeNameSuggestion(
  value: unknown,
): ObjectTypeNameSuggestion {
  const response = parseJsonObject(value, 'ObjectType 이름 생성')
  for (const field of ['korean_name', 'english_name', 'description'] as const) {
    if (response[field] !== undefined && typeof response[field] !== 'string') {
      throw new Error(`ObjectType 이름 생성 응답의 ${field}가 문자열이 아닙니다.`)
    }
  }
  return {
    korean_name: optionalString(response.korean_name),
    english_name: optionalString(response.english_name),
    description: optionalString(response.description),
  }
}

export interface ObjectSearchResult {
  id: string
  name: string
  objectType: string
  properties: Record<string, unknown>
}

export interface ChildNodesResponse {
  parentId: string
  parentType: string
  relationshipType: string
  children: Array<{
    id: string
    name: string
    type: string
    properties: Record<string, unknown>
  }>
}

export const objectExplorerApi = {
  /**
   * Object Type 목록 조회
   */
  async getObjectTypes(): Promise<{ objectTypes: ObjectTypeInfo[]; total: number }> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/object-types`)
    if (!response.ok) {
      await handleHttpError(response)
    }
    return parseObjectTypeListResponse(await response.json())
  },

  /**
   * Object Type 데이터 조회 (Materialized View에서)
   */
  async getObjectTypeData(objectTypeName: string, limit: number = 100): Promise<ObjectTypeDataResponse> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/object-types/${encodeURIComponent(objectTypeName)}/data?limit=${limit}`)
    if (!response.ok) {
      await handleHttpError(response)
    }
    return parseObjectTypeDataResponse(await response.json() as unknown)
  },

  /**
   * 오브젝트 검색
   */
  async searchObjects(query: string, limit: number = 50): Promise<{ results: ObjectSearchResult[] }> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/object-explorer/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit })
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  /**
   * 스키마 기반으로 하위 노드 조회 (드릴다운)
   */
  async getChildNodes(parentType: string, parentId: string, parentProperties?: Record<string, unknown>): Promise<ChildNodesResponse> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/object-explorer/children`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentType, parentId, parentProperties })
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  /**
   * 스키마 정의에서 관계 정보 조회
   */
  async getSchemaRelationships(objectTypeName: string): Promise<{
    relationships: Array<{
      sourceType: string
      targetType: string
      relationshipName: string
      direction: 'outgoing' | 'incoming'
    }>
  }> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/object-explorer/relationships/${encodeURIComponent(objectTypeName)}`)
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  /**
   * ObjectType 차트 설정 업데이트
   */
  async updateChartConfig(objectTypeName: string, chartConfig: {
    chartType: 'bar' | 'line' | 'pie' | 'map' | 'none'
    xAxis?: string
    yAxis?: string
    valueField?: string
    labelField?: string
    latitudeField?: string
    longitudeField?: string
    regionField?: string
  }): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/object-types/${encodeURIComponent(objectTypeName)}/chart-config`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chartConfig })
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  /** 단일 ObjectType 조회 (컬럼 포함) — 관계 편집 등에서 컬럼 확보용 */
  async getObjectType(objectTypeName: string): Promise<ObjectTypeDetail> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/object-types/${encodeURIComponent(objectTypeName)}`)
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  /** ObjectType 생성 */
  async createObjectType(body: ObjectTypeCreateRequest): Promise<unknown> {
    return postJson<unknown>(`${ONTOLOGY_BASE_URL}/object-types`, body, sessionHeaders())
  },

  /** ObjectType 삭제 (confirmName 확인) */
  async deleteObjectType(objectTypeName: string, confirmName: string): Promise<void> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/object-types/${encodeURIComponent(objectTypeName)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmName })
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
  },

  /** ObjectType 이름 변경 */
  async renameObjectType(objectTypeName: string, newName: string): Promise<void> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/object-types/${encodeURIComponent(objectTypeName)}/rename`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newName })
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
  },

  /** SQL 결과로부터 ObjectType 이름 제안 (LLM) */
  async generateObjectTypeName(
    body: ObjectTypeNameSuggestionRequest,
  ): Promise<ObjectTypeNameSuggestion> {
    return parseObjectTypeNameSuggestion(
      await postJson<unknown>(
        `${ONTOLOGY_BASE_URL}/generate-object-type-name`,
        body,
        sessionHeaders(),
      ),
    )
  },

  /** ObjectType 인스턴스 일괄 생성 — /ontology/instances/bulk-create */
  async bulkCreateInstances(body: unknown): Promise<{ created_count?: number } & JsonObject> {
    return postJson(`${ONTOLOGY_BASE_URL}/instances/bulk-create`, body, sessionHeaders())
  },

  /** DB 스키마로부터 온톨로지 생성 — /ontology/generate-from-schema. */
  async generateFromSchema(body: unknown): Promise<GenerateFromSchemaResponse> {
    return parseGenerateFromSchemaResponse(
      await postJson<unknown>(
        `${ONTOLOGY_BASE_URL}/generate-from-schema`,
        body,
        sessionHeaders(),
      ),
    )
  },

  /** 온톨로지 노드 데이터 조회 — /ontology-nodes/{id}/data (query 예: 'limit=1') */
  async getNodeData(
    nodeId: string,
    query: string = '',
    signal?: AbortSignal,
  ): Promise<OntologyNodeDataResult> {
    const response = await fetch(
      `${ONTOLOGY_BASE_URL}/ontology-nodes/${encodeURIComponent(nodeId)}/data${query ? `?${query}` : ''}`,
      {
        headers: sessionHeaders(),
        signal,
      },
    )
    if (!response.ok) {
      await handleHttpError(response)
    }
    return parseOntologyNodeDataResult(await response.json())
  },

  /** 노드 컬럼 distinct 값 — /ontology-nodes/{id}/filter-values?columns=... */
  async getNodeFilterValues(
    nodeId: string,
    columns: readonly string[],
    signal?: AbortSignal,
  ): Promise<OntologyNodeFilterValues> {
    if (columns.length === 0) {
      throw new Error('Ontology 노드 필터값 조회에 컬럼이 필요합니다.')
    }
    const response = await fetch(
      `${ONTOLOGY_BASE_URL}/ontology-nodes/${encodeURIComponent(nodeId)}/filter-values?columns=${encodeURIComponent(columns.join(','))}`,
      { signal },
    )
    if (!response.ok) {
      await handleHttpError(response)
    }
    return parseOntologyNodeFilterValues(await response.json())
  },

  /** 노드 샘플 데이터 — /node/{id}/sample-data?limit=... */
  async getNodeSampleData(
    nodeId: string,
    limit: number = 10,
    signal?: AbortSignal,
  ): Promise<{
    data?: {
      data?: unknown[]
      rows?: unknown[]
      columns?: string[]
    }
  }> {
    const response = await fetch(
      `${ONTOLOGY_BASE_URL}/node/${encodeURIComponent(nodeId)}/sample-data?limit=${limit}`,
      {
        headers: sessionHeaders(),
        signal,
      },
    )
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  /** 노드로부터 ObjectType 생성 — /ontology-nodes/{id}/create-objecttype */
  async createObjectTypeFromNode(nodeId: string, body: unknown): Promise<{ objectTypeName: string }> {
    const result = await postJson<unknown>(`${ONTOLOGY_BASE_URL}/ontology-nodes/${encodeURIComponent(nodeId)}/create-objecttype`, body, sessionHeaders())
    const record = parseJsonObject(result, 'ObjectType 생성')
    if (typeof record.objectTypeName !== 'string' || !record.objectTypeName) {
      throw new Error('ObjectType 생성 응답에 objectTypeName이 없습니다.')
    }
    return { objectTypeName: record.objectTypeName }
  },

  /** 노드 incoming 네트워크 — /schemas/{id}/nodes/{nodeId}/incoming-network */
  async getIncomingNetwork(
    schemaId: string,
    nodeId: string,
    body: unknown,
    signal?: AbortSignal,
  ): Promise<CausalIncomingNetwork> {
    const response = await fetch(
      `${ONTOLOGY_BASE_URL}/schemas/${encodeURIComponent(schemaId)}/nodes/${encodeURIComponent(nodeId)}/incoming-network`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      },
    )
    if (!response.ok) await handleHttpError(response)
    return parseCausalIncomingNetwork(await response.json())
  },

  /** 데이터소스 매핑 확정 — /confirm-datasource */
  async confirmDatasource(body: unknown): Promise<{ success: true }> {
    return parseDatasourceConfirmationResponse(
      await postJson<unknown>(
        `${ONTOLOGY_BASE_URL}/confirm-datasource`,
        body,
        sessionHeaders(),
      ),
    )
  },

  /**
   * 데이터소스 자동연결 (SSE 스트림, `data:` 라인) — /auto-link-datasource/stream.
   * 소비처는 onEvent(event) 에서 event.type(progress/result/error) 분기.
   */
  async autoLinkDatasourceStream(
    body: unknown,
    onEvent: (event: AutoLinkDatasourceEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/auto-link-datasource/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
    if (!response.ok) await handleHttpError(response)
    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('스트리밍 리더 없음')
    }
    const decoder = new TextDecoder()
    let buffer = ''
    let receivedResult = false
    const consume = (line: string) => {
      if (!line.startsWith('data:')) return
      const json = line.slice(5).trim()
      if (!json) return
      let raw: unknown
      try {
        raw = JSON.parse(json)
      } catch {
        throw new Error('데이터소스 자동연결 스트림에 올바르지 않은 JSON이 포함되어 있습니다.')
      }
      const event = parseAutoLinkDatasourceEvent(raw)
      if (event.type === 'result') receivedResult = true
      if (event.type === 'error') throw new Error(event.message)
      onEvent(event)
    }
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop() || ''
        lines.forEach(consume)
      }
      if (buffer.trim()) consume(buffer)
      if (!receivedResult) {
        throw new Error('데이터소스 자동연결 완료 응답을 받지 못했습니다.')
      }
    } finally {
      reader.releaseLock()
    }
  },

  /** 데이터소스 자동연결 (비스트림 폴백) — /auto-link-datasource */
  async autoLinkDatasource(body: unknown): Promise<{ mappings?: Record<string, DatasourceMapping> } & JsonObject> {
    return postJson(`${ONTOLOGY_BASE_URL}/auto-link-datasource`, body, sessionHeaders())
  },

  /** 다층 온톨로지 생성 (NDJSON 스트림, abort 지원) — /generate-multi-layer */
  async generateMultiLayer(body: unknown, onEvent: (event: MultiLayerGenerationEvent) => void, signal?: AbortSignal): Promise<void> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/generate-multi-layer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response body')
    const decoder = new TextDecoder()
    let buffer = ''
    let receivedTerminalEvent = false
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (!line.trim()) continue
        let parsed: unknown
        try {
          parsed = JSON.parse(line)
        } catch {
          throw new Error('다층 온톨로지 스트림에 올바르지 않은 JSON이 포함되어 있습니다.')
        }
        const event = parseMultiLayerGenerationEvent(parsed)
        if (event.event === 'complete' || event.event === 'error') receivedTerminalEvent = true
        onEvent(event)
      }
    }
    if (buffer.trim()) {
      let parsed: unknown
      try {
        parsed = JSON.parse(buffer)
      } catch {
        throw new Error('다층 온톨로지 스트림의 마지막 이벤트가 올바른 JSON이 아닙니다.')
      }
      const event = parseMultiLayerGenerationEvent(parsed)
      if (event.event === 'complete' || event.event === 'error') receivedTerminalEvent = true
      onEvent(event)
    }
    if (!receivedTerminalEvent) {
      throw new Error('다층 온톨로지 스트림이 완료 이벤트 없이 종료되었습니다.')
    }
  },

  /** 인과분석 실행. 스트림 미지원 서버는 동일 계약의 일반 JSON 엔드포인트로 폴백한다. */
  async runCausalAnalysis(
    schemaId: string,
    nodeId: string,
    body: unknown,
    onProgress: (progress: CausalAnalysisProgress) => void,
    signal?: AbortSignal,
  ): Promise<CausalAnalysisResult> {
    const request = (suffix: string) => fetch(
      `${ONTOLOGY_BASE_URL}/schemas/${encodeURIComponent(schemaId)}/nodes/${encodeURIComponent(nodeId)}/causal-analysis${suffix}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      },
    )

    let response = await request('/stream')
    if (response.status === 404) response = await request('')

    if (!response.ok) await handleHttpError(response)

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('ndjson') && !contentType.includes('stream')) {
      return parseCausalAnalysisResult(await response.json())
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('인과분석 스트림 응답 본문이 없습니다.')

    const decoder = new TextDecoder()
    let buffer = ''
    let finalResult: CausalAnalysisResult | null = null

    const consumeLine = (line: string) => {
      const trimmed = line.trim()
      if (!trimmed) return
      let payload: unknown
      try {
        payload = JSON.parse(trimmed)
      } catch {
        throw new Error('인과분석 스트림에 올바르지 않은 JSON이 포함되어 있습니다.')
      }
      const event = parseCausalAnalysisStreamEvent(payload)
      if (event.type === 'progress') onProgress(event.progress)
      else finalResult = event.result
    }

    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) consumeLine(line)
        if (finalResult) break
      }
      buffer += decoder.decode()
      if (buffer.trim() && !finalResult) consumeLine(buffer)
    } finally {
      if (finalResult) {
        await reader.cancel().catch(() => undefined)
      }
      reader.releaseLock()
    }

    if (!finalResult) {
      throw new Error('인과분석 스트림이 최종 결과 없이 종료되었습니다.')
    }
    return finalResult
  }
}

// ============================================================================
// Object-Type Relationship API — /ontology/relationships (object-type 간 관계 CRUD)
// (roboSchema 의 /robo/schema/relationships 와는 별개 시스템)
// ============================================================================

export interface RelationshipParams {
  sourceType: string
  targetType: string
  sourceColumn: string
  targetColumn: string
}

export interface ObjectTypeRelationshipCreateRequest extends RelationshipParams {
  matchStrategy: ObjectTypeRelationshipMatchStrategy
  cardinality: ObjectTypeRelationshipCardinality
  name?: string
  description?: string
}

function serializeRelationshipParams(params: RelationshipParams): URLSearchParams {
  return new URLSearchParams({
    sourceType: params.sourceType,
    targetType: params.targetType,
    sourceColumn: params.sourceColumn,
    targetColumn: params.targetColumn,
  })
}

export const relationshipApi = {
  /** 관계 조회 (없으면 null) */
  async get(params: RelationshipParams): Promise<ObjectTypeRelationship | null> {
    const qs = serializeRelationshipParams(params)
    const response = await fetch(`${ONTOLOGY_BASE_URL}/relationships?${qs}`)
    if (response.status === 404) {
      return null
    }
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  /** 관계 생성 */
  async create(
    body: ObjectTypeRelationshipCreateRequest,
  ): Promise<{ relationship?: ObjectTypeRelationship } & JsonObject> {
    return postJson(`${ONTOLOGY_BASE_URL}/relationships`, body, sessionHeaders())
  },

  /** 관계 수정 */
  async update(params: RelationshipParams, body: unknown): Promise<void> {
    const qs = serializeRelationshipParams(params)
    const response = await fetch(`${ONTOLOGY_BASE_URL}/relationships?${qs}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
  },

  /** 관계 삭제 */
  async remove(params: RelationshipParams): Promise<void> {
    const qs = new URLSearchParams(params as unknown as Record<string, string>)
    const response = await fetch(`${ONTOLOGY_BASE_URL}/relationships?${qs}`, { method: 'DELETE' })
    if (!response.ok) {
      await handleHttpError(response)
    }
  }
}
