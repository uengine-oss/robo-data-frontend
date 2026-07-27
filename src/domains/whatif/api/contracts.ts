import type {
  AgentAnalysisResult,
  AgentDataSource,
  AgentRelationship,
  AgentVariable,
  CausalDiscoveryResult,
  CausalEdge,
  CollectedData,
  ComparisonResult,
  DataDiscoveryResult,
  DeleteSessionResult,
  DiscoveredTable,
  LiteracyExplanation,
  MindsDbModelCreationResult,
  ModelComparison,
  Neo4jGraphResult,
  Neo4jSaveResult,
  PredictionChartData,
  PresentationResult,
  PresentationSlide,
  SessionInfo,
  SessionListResult,
  TTMComparisonResult,
  TTMInfo,
  UploadedFile,
  ValidationResult,
  WhatIfHealth,
} from '../model/contracts'

type JsonObject = Record<string, unknown>

export function parseAgentAnalysisResult(value: unknown): AgentAnalysisResult {
  const object = objectValue(value, '에이전트 분석')
  const variables = arrayValue(object.variables, 'variables').map(parseAgentVariable)
  const relationships = arrayValue(object.relationships, 'relationships').map(parseAgentRelationship)
  const dataSources = arrayValue(object.data_sources, 'data_sources').map(parseAgentDataSource)
  const summary = objectValue(object.validation_summary, 'validation_summary')
  return {
    session_id: stringValue(object.session_id, 'session_id'),
    scenario: stringValue(object.scenario, 'scenario'),
    variables,
    relationships,
    data_sources: dataSources,
    validation_summary: {
      total_variables: numberValue(summary.total_variables, 'total_variables'),
      total_data_sources: numberValue(summary.total_data_sources, 'total_data_sources'),
      timeseries_ready: numberValue(summary.timeseries_ready, 'timeseries_ready'),
      sufficient_data: numberValue(summary.sufficient_data, 'sufficient_data'),
      total_numeric_columns: numberValue(summary.total_numeric_columns, 'total_numeric_columns'),
    },
    is_ready_for_causal: booleanValue(object.is_ready_for_causal, 'is_ready_for_causal'),
    recommendations: stringArray(object.recommendations, 'recommendations'),
  }
}

export function parseDataDiscoveryResult(value: unknown): DataDiscoveryResult {
  const object = objectValue(value, '데이터 발견')
  return {
    session_id: stringValue(object.session_id, 'session_id'),
    query: stringValue(object.query, 'query'),
    tables: arrayValue(object.tables, 'tables').map(parseDiscoveredTable),
    suggested_sql: stringValue(object.suggested_sql, 'suggested_sql'),
  }
}

export function parseCollectedData(value: unknown): CollectedData {
  const object = objectValue(value, '수집 데이터')
  const dtypes = objectValue(object.dtypes, 'dtypes')
  return {
    rows: numberValue(object.rows, 'rows'),
    columns: stringArray(object.columns, 'columns'),
    data: recordArray(object.data, 'data'),
    dtypes: Object.fromEntries(
      Object.entries(dtypes).map(([key, dataType]) => [key, stringValue(dataType, `dtypes.${key}`)]),
    ),
  }
}

export function parseUploadedFile(value: unknown): UploadedFile {
  const object = objectValue(value, '업로드')
  return {
    session_id: stringValue(object.session_id, 'session_id'),
    filename: stringValue(object.filename, 'filename'),
    rows: numberValue(object.rows, 'rows'),
    columns: stringArray(object.columns, 'columns'),
    sample_data: recordArray(object.sample_data, 'sample_data'),
  }
}

export function parseCausalDiscoveryResult(value: unknown): CausalDiscoveryResult {
  const object = objectValue(value, 'Causal Discovery')
  const summary = objectValue(object.summary, 'summary')
  const validation = objectValue(object.validation, 'validation')
  const edges = arrayValue(object.edges, 'edges').map(parseCausalEdge)
  return {
    session_id: stringValue(object.session_id, 'session_id'),
    edges_count: numberValue(object.edges_count, 'edges_count'),
    edges,
    summary: {
      total_edges: numberValue(summary.total_edges, 'summary.total_edges'),
      strong_edges: numberValue(summary.strong_edges, 'summary.strong_edges'),
      positive_count: numberValue(summary.positive_count, 'summary.positive_count'),
      negative_count: numberValue(summary.negative_count, 'summary.negative_count'),
      root_causes: pairArray(summary.root_causes, 'summary.root_causes'),
      final_effects: pairArray(summary.final_effects, 'summary.final_effects'),
    },
    influence_functions: arrayValue(object.influence_functions, 'influence_functions').map((entry, index) => {
      const influence = objectValue(entry, `influence_functions[${index}]`)
      return {
        source: stringValue(influence.source, 'source'),
        target: stringValue(influence.target, 'target'),
        formula: stringValue(influence.formula, 'formula'),
        slope: numberValue(influence.slope, 'slope'),
        intercept: numberValue(influence.intercept, 'intercept'),
        r_squared: numberValue(influence.r_squared, 'r_squared'),
        p_value: numberValue(influence.p_value, 'p_value'),
      }
    }),
    validation: {
      total_validated: numberValue(validation.total_validated, 'validation.total_validated'),
      valid_count: numberValue(validation.valid_count, 'validation.valid_count'),
      overfit_count: numberValue(validation.overfit_count, 'validation.overfit_count'),
      mean_r_squared: numberValue(validation.mean_r_squared, 'validation.mean_r_squared'),
    },
  }
}

export function parseValidationResult(value: unknown): ValidationResult {
  const object = objectValue(value, '검증 결과')
  return {
    total_validated: numberValue(object.total_validated, 'total_validated'),
    valid_count: numberValue(object.valid_count, 'valid_count'),
    overfit_count: numberValue(object.overfit_count, 'overfit_count'),
    mean_r_squared: numberValue(object.mean_r_squared, 'mean_r_squared'),
    results: arrayValue(object.results, 'results').map((entry, index) => {
      const result = objectValue(entry, `results[${index}]`)
      return {
        edge_id: stringValue(result.edge_id, 'edge_id'),
        r_squared: numberValue(result.r_squared, 'r_squared'),
        train_r2: numberValue(result.train_r2, 'train_r2'),
        test_r2: numberValue(result.test_r2, 'test_r2'),
        rmse: numberValue(result.rmse, 'rmse'),
        mape: numberValue(result.mape, 'mape'),
        is_valid: booleanValue(result.is_valid, 'is_valid'),
        is_overfit: booleanValue(result.is_overfit, 'is_overfit'),
        notes: stringArray(result.notes, 'notes'),
      }
    }),
  }
}

export function parseComparisonResult(value: unknown): ComparisonResult {
  const object = objectValue(value, 'MindsDB 비교')
  const summary = objectValue(object.summary, 'summary')
  return {
    comparison_source: optionalEnum(
      object.comparison_source,
      ['ttm', 'mindsdb'],
      'comparison_source',
    ),
    warning: optionalString(object.warning, 'warning'),
    comparisons: arrayValue(object.comparisons, 'comparisons').map((entry, index) => {
      const comparison = objectValue(entry, `comparisons[${index}]`)
      return {
        edge: stringValue(comparison.edge, 'edge'),
        source: optionalString(comparison.source, 'source'),
        target: optionalString(comparison.target, 'target'),
        source_label: optionalString(comparison.source_label, 'source_label'),
        target_label: optionalString(comparison.target_label, 'target_label'),
        ontology: optionalModelComparison(comparison.ontology, 'ontology'),
        ttm: optionalModelComparison(comparison.ttm, 'ttm'),
        causal_r2: numberValue(comparison.causal_r2, 'causal_r2'),
        causal_mape: optionalNumber(comparison.causal_mape, 'causal_mape'),
        causal_strength: optionalNumber(comparison.causal_strength, 'causal_strength'),
        coefficient: optionalNumber(comparison.coefficient, 'coefficient'),
        intercept: optionalNumber(comparison.intercept, 'intercept'),
        train_samples: optionalNumber(comparison.train_samples, 'train_samples'),
        test_samples: optionalNumber(comparison.test_samples, 'test_samples'),
        mindsdb_r2: nullableNumber(comparison.mindsdb_r2, 'mindsdb_r2'),
        mindsdb_mape: optionalNullableNumber(comparison.mindsdb_mape, 'mindsdb_mape'),
        difference: optionalNumber(comparison.difference, 'difference'),
        better: optionalEnum(comparison.better, ['MindsDB', 'TTM', 'Causal'], 'better'),
        error: optionalString(comparison.error, 'error'),
        note: optionalString(comparison.note, 'note'),
      }
    }),
    prediction_charts: object.prediction_charts === undefined
      ? undefined
      : arrayValue(object.prediction_charts, 'prediction_charts').map(parsePredictionChart),
    summary: {
      total_compared: numberValue(summary.total_compared, 'summary.total_compared'),
      mean_causal_r2: numberValue(summary.mean_causal_r2, 'summary.mean_causal_r2'),
      mean_mindsdb_r2: optionalNumber(summary.mean_mindsdb_r2, 'summary.mean_mindsdb_r2'),
      ontology_mean_r2: optionalNumber(summary.ontology_mean_r2, 'summary.ontology_mean_r2'),
      ttm_mean_r2: optionalNumber(summary.ttm_mean_r2, 'summary.ttm_mean_r2'),
      mindsdb_mean_r2: optionalNumber(summary.mindsdb_mean_r2, 'summary.mindsdb_mean_r2'),
      avg_mape: optionalNumber(summary.avg_mape, 'summary.avg_mape'),
      good_fits: optionalNumber(summary.good_fits, 'summary.good_fits'),
      mindsdb_wins: numberValue(summary.mindsdb_wins, 'summary.mindsdb_wins'),
      causal_wins: numberValue(summary.causal_wins, 'summary.causal_wins'),
      ontology_wins: optionalNumber(summary.ontology_wins, 'summary.ontology_wins'),
      ttm_wins: optionalNumber(summary.ttm_wins, 'summary.ttm_wins'),
      ttm_available: optionalBoolean(summary.ttm_available, 'summary.ttm_available'),
      mindsdb_available: optionalBoolean(summary.mindsdb_available, 'summary.mindsdb_available'),
      ttm_model: optionalString(summary.ttm_model, 'summary.ttm_model'),
      train_ratio: optionalString(summary.train_ratio, 'summary.train_ratio'),
      test_ratio: optionalString(summary.test_ratio, 'summary.test_ratio'),
      note: optionalString(summary.note, 'summary.note'),
    },
  }
}

export function parseTTMComparisonResult(value: unknown): TTMComparisonResult {
  const object = objectValue(value, 'TTM 비교')
  const summary = objectValue(object.summary, 'summary')
  return {
    comparisons: arrayValue(object.comparisons, 'comparisons').map((entry, index) => {
      const comparison = objectValue(entry, `comparisons[${index}]`)
      return {
        source: stringValue(comparison.source, 'source'),
        target: stringValue(comparison.target, 'target'),
        source_label: optionalString(comparison.source_label, 'source_label'),
        target_label: optionalString(comparison.target_label, 'target_label'),
        ontology: optionalModelComparison(comparison.ontology, 'ontology'),
        ttm: optionalModelComparison(comparison.ttm, 'ttm'),
      }
    }),
    prediction_charts: arrayValue(object.prediction_charts, 'prediction_charts').map(parsePredictionChart),
    summary: {
      total_compared: numberValue(summary.total_compared, 'summary.total_compared'),
      ttm_available: booleanValue(summary.ttm_available, 'summary.ttm_available'),
      ttm_model: optionalString(summary.ttm_model, 'summary.ttm_model'),
      ontology_mean_r2: numberValue(summary.ontology_mean_r2, 'summary.ontology_mean_r2'),
      ttm_mean_r2: numberValue(summary.ttm_mean_r2, 'summary.ttm_mean_r2'),
      ontology_wins: numberValue(summary.ontology_wins, 'summary.ontology_wins'),
      ttm_wins: numberValue(summary.ttm_wins, 'summary.ttm_wins'),
    },
  }
}

export function parseTTMInfo(value: unknown): TTMInfo {
  const object = objectValue(value, 'TTM 정보')
  return {
    available: booleanValue(object.available, 'available'),
    model_name: optionalString(object.model_name, 'model_name'),
    context_length: optionalNumber(object.context_length, 'context_length'),
    prediction_length: optionalNumber(object.prediction_length, 'prediction_length'),
  }
}

export function parseMindsDbModelCreationResult(value: unknown): MindsDbModelCreationResult {
  const object = objectValue(value, 'MindsDB 모델 생성')
  return {
    model_name: stringValue(object.model_name, 'model_name'),
    target: stringValue(object.target, 'target'),
    features: stringArray(object.features, 'features'),
    result: object.result,
  }
}

export function parseLiteracyExplanation(value: unknown): LiteracyExplanation {
  const object = objectValue(value, '리터러시 설명')
  return {
    report_type: stringValue(object.report_type, 'report_type'),
    language: stringValue(object.language, 'language'),
    explanation: stringValue(object.explanation, 'explanation'),
  }
}

export function parsePresentationResult(value: unknown): PresentationResult {
  const object = objectValue(value, '프레젠테이션')
  return { slides: arrayValue(object.slides, 'slides').map(parsePresentationSlide) }
}

export function parseNeo4jSaveResult(value: unknown): Neo4jSaveResult {
  const object = objectValue(value, 'Neo4j 저장')
  return {
    saved: booleanValue(object.saved, 'saved'),
    nodes_count: numberValue(object.nodes_count, 'nodes_count'),
    edges_count: numberValue(object.edges_count, 'edges_count'),
    message: stringValue(object.message, 'message'),
  }
}

export function parseNeo4jGraphResult(value: unknown): Neo4jGraphResult {
  const object = objectValue(value, 'Neo4j 그래프')
  return {
    nodes: arrayValue(object.nodes, 'nodes').map((entry, index) => {
      const node = objectValue(entry, `nodes[${index}]`)
      return {
        id: stringValue(node.id, 'id'),
        label: stringValue(node.label, 'label'),
        type: stringValue(node.type, 'type'),
      }
    }),
    edges: arrayValue(object.edges, 'edges').map((entry, index) => {
      const edge = objectValue(entry, `edges[${index}]`)
      return {
        source: stringValue(edge.source, 'source'),
        target: stringValue(edge.target, 'target'),
        strength: numberValue(edge.strength, 'strength'),
        direction: stringValue(edge.direction, 'direction'),
      }
    }),
  }
}

export function parseSessionInfo(value: unknown): SessionInfo {
  const object = objectValue(value, '세션 정보')
  return {
    session_id: stringValue(object.session_id, 'session_id'),
    created_at: stringValue(object.created_at, 'created_at'),
    query: optionalString(object.query, 'query'),
    has_data: booleanValue(object.has_data, 'has_data'),
    data_rows: numberValue(object.data_rows, 'data_rows'),
    columns: stringArray(object.columns, 'columns'),
    has_causal_result: booleanValue(object.has_causal_result, 'has_causal_result'),
    has_validation: booleanValue(object.has_validation, 'has_validation'),
    has_comparison: booleanValue(object.has_comparison, 'has_comparison'),
  }
}

export function parseSessionListResult(value: unknown): SessionListResult {
  const object = objectValue(value, '세션 목록')
  return {
    sessions: arrayValue(object.sessions, 'sessions').map((entry, index) => {
      const session = objectValue(entry, `sessions[${index}]`)
      return {
        session_id: stringValue(session.session_id, 'session_id'),
        created_at: stringValue(session.created_at, 'created_at'),
        query: stringValue(session.query, 'query'),
      }
    }),
  }
}

export function parseDeleteSessionResult(value: unknown): DeleteSessionResult {
  const object = objectValue(value, '세션 삭제')
  return { deleted: booleanValue(object.deleted, 'deleted') }
}

export function parseWhatIfHealth(value: unknown): WhatIfHealth {
  const object = objectValue(value, 'What-If health')
  return {
    status: stringValue(object.status, 'status'),
    service: stringValue(object.service, 'service'),
    version: stringValue(object.version, 'version'),
  }
}

function parseAgentVariable(value: unknown, index: number): AgentVariable {
  const object = objectValue(value, `variables[${index}]`)
  return {
    name: stringValue(object.name, 'name'),
    description: stringValue(object.description, 'description'),
    variable_type: enumValue(object.variable_type, ['driver', 'state', 'kpi'], 'variable_type'),
    data_type: enumValue(object.data_type, ['numeric', 'categorical', 'temporal'], 'data_type'),
  }
}

function parseAgentRelationship(value: unknown, index: number): AgentRelationship {
  const object = objectValue(value, `relationships[${index}]`)
  return {
    source: stringValue(object.source, 'source'),
    target: stringValue(object.target, 'target'),
    direction: enumValue(object.direction, ['positive', 'negative'], 'direction'),
    strength: enumValue(object.strength, ['strong', 'moderate', 'weak'], 'strength'),
    reasoning: stringValue(object.reasoning, 'reasoning'),
  }
}

function parseAgentDataSource(value: unknown, index: number): AgentDataSource {
  const object = objectValue(value, `data_sources[${index}]`)
  return {
    table_name: stringValue(object.table_name, 'table_name'),
    columns: stringArray(object.columns, 'columns'),
    row_count: numberValue(object.row_count, 'row_count'),
    has_time_column: booleanValue(object.has_time_column, 'has_time_column'),
    time_column: nullableString(object.time_column, 'time_column'),
    numeric_columns: stringArray(object.numeric_columns, 'numeric_columns'),
    relevance_score: numberValue(object.relevance_score, 'relevance_score'),
    sample_data: recordArray(object.sample_data, 'sample_data'),
    validation_notes: stringArray(object.validation_notes, 'validation_notes'),
  }
}

function parseDiscoveredTable(value: unknown, index: number): DiscoveredTable {
  const object = objectValue(value, `tables[${index}]`)
  return {
    table_name: stringValue(object.table_name, 'table_name'),
    columns: stringArray(object.columns, 'columns'),
    row_count: numberValue(object.row_count, 'row_count'),
    sample_data: recordArray(object.sample_data, 'sample_data'),
    relevance_score: numberValue(object.relevance_score, 'relevance_score'),
    description: stringValue(object.description, 'description'),
  }
}

function parseCausalEdge(value: unknown, index: number): CausalEdge {
  const object = objectValue(value, `edges[${index}]`)
  return {
    source: stringValue(object.source, 'source'),
    target: stringValue(object.target, 'target'),
    strength: numberValue(object.strength, 'strength'),
    direction: enumValue(object.direction, ['positive', 'negative'], 'direction'),
    method: stringValue(object.method, 'method'),
    p_value: numberValue(object.p_value, 'p_value'),
    lag: optionalNumber(object.lag, 'lag'),
    formula: optionalString(object.formula, 'formula'),
    r_squared: optionalNumber(object.r_squared, 'r_squared'),
    source_label: optionalString(object.source_label, 'source_label'),
    target_label: optionalString(object.target_label, 'target_label'),
  }
}

function parsePredictionChart(value: unknown, index: number): PredictionChartData {
  const object = objectValue(value, `prediction_charts[${index}]`)
  return {
    edge: stringValue(object.edge, 'edge'),
    source: stringValue(object.source, 'source'),
    target: stringValue(object.target, 'target'),
    labels: numberArray(object.labels, 'labels'),
    actual: numberArray(object.actual, 'actual'),
    causal_predicted: numberArray(object.causal_predicted, 'causal_predicted'),
    ontology_predicted: optionalNumberArray(object.ontology_predicted, 'ontology_predicted'),
    ttm_predicted: optionalNumberArray(object.ttm_predicted, 'ttm_predicted'),
    mindsdb_predicted: optionalNumberArray(object.mindsdb_predicted, 'mindsdb_predicted'),
    source_values: optionalNumberArray(object.source_values, 'source_values'),
  }
}

function parsePresentationSlide(value: unknown, index: number): PresentationSlide {
  const object = objectValue(value, `slides[${index}]`)
  return {
    title: stringValue(object.title, 'title'),
    bullets: stringArray(object.bullets, 'bullets'),
    notes: stringValue(object.notes, 'notes'),
    chart_suggestion: stringValue(object.chart_suggestion, 'chart_suggestion'),
  }
}

function optionalModelComparison(value: unknown, field: string): ModelComparison | undefined {
  if (value === undefined || value === null) return undefined
  const object = objectValue(value, field)
  return {
    r2: numberValue(object.r2, `${field}.r2`),
    mape: numberValue(object.mape, `${field}.mape`),
    predictions: numberArray(object.predictions, `${field}.predictions`),
    actual: numberArray(object.actual, `${field}.actual`),
    error: optionalString(object.error, `${field}.error`),
    ...optionalTtmFields(object, field),
  }
}

function optionalTtmFields(object: JsonObject, field: string) {
  return {
    rmse: optionalNumber(object.rmse, `${field}.rmse`),
    model_name: optionalString(object.model_name, `${field}.model_name`),
    available: optionalBoolean(object.available, `${field}.available`),
    note: optionalString(object.note, `${field}.note`),
  }
}

function objectValue(value: unknown, field: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) contractError(field, '객체')
  return value as JsonObject
}

function arrayValue(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) contractError(field, '배열')
  return value
}

function stringValue(value: unknown, field: string): string {
  if (typeof value !== 'string') contractError(field, '문자열')
  return value
}

function numberValue(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) contractError(field, '유한한 숫자')
  return value
}

function booleanValue(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') contractError(field, 'boolean')
  return value
}

function enumValue<const T extends string>(value: unknown, values: readonly T[], field: string): T {
  const string = stringValue(value, field)
  if (!values.includes(string as T)) contractError(field, values.join(' | '))
  return string as T
}

function optionalEnum<const T extends string>(value: unknown, values: readonly T[], field: string): T | undefined {
  return value === undefined || value === null ? undefined : enumValue(value, values, field)
}

function optionalString(value: unknown, field: string): string | undefined {
  return value === undefined || value === null ? undefined : stringValue(value, field)
}

function nullableString(value: unknown, field: string): string | null {
  return value === null ? null : stringValue(value, field)
}

function optionalNumber(value: unknown, field: string): number | undefined {
  return value === undefined || value === null ? undefined : numberValue(value, field)
}

function nullableNumber(value: unknown, field: string): number | null {
  return value === null ? null : numberValue(value, field)
}

function optionalNullableNumber(value: unknown, field: string): number | null | undefined {
  return value === undefined ? undefined : nullableNumber(value, field)
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  return value === undefined || value === null ? undefined : booleanValue(value, field)
}

function stringArray(value: unknown, field: string): string[] {
  return arrayValue(value, field).map((entry, index) => stringValue(entry, `${field}[${index}]`))
}

function numberArray(value: unknown, field: string): number[] {
  return arrayValue(value, field).map((entry, index) => numberValue(entry, `${field}[${index}]`))
}

function optionalNumberArray(value: unknown, field: string): number[] | undefined {
  return value === undefined || value === null ? undefined : numberArray(value, field)
}

function recordArray(value: unknown, field: string): JsonObject[] {
  return arrayValue(value, field).map((entry, index) => objectValue(entry, `${field}[${index}]`))
}

function pairArray(value: unknown, field: string): Array<[string, number]> {
  return arrayValue(value, field).map((entry, index) => {
    if (!Array.isArray(entry) || entry.length !== 2) contractError(`${field}[${index}]`, '[string, number]')
    return [stringValue(entry[0], `${field}[${index}][0]`), numberValue(entry[1], `${field}[${index}][1]`)]
  })
}

function contractError(field: string, expected: string): never {
  throw new Error(`What-If 응답 계약 오류: ${field}은(는) ${expected}이어야 합니다.`)
}
