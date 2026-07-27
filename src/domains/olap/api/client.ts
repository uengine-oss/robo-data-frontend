/**
 * OLAP API Service
 * data-platform-olap 백엔드와 통신하는 API 서비스 (fetch 기반)
 * API Gateway를 통해 연결됨
 */

// API Gateway URL - 모든 마이크로서비스 요청의 단일 진입점(공유 코어)
import {
  API_GATEWAY_URL,
  handleHttpError,
  streamSseFetch,
} from '@/shared/services/http'
import { useRuntimeStore } from '@/shared/stores/runtime'
import {
  parseAgentStreamEvent,
  parseAirflowDagList,
  parseAirflowRunResult,
  parseCatalogResponse,
  parseCreateEtlConfigResult,
  parseCubeCollection,
  parseCubeList,
  parseCubeMetadata,
  parseDdlResult,
  parseDwTableList,
  parseEtlConfig,
  parseEtlConfigList,
  parseEtlSyncResult,
  parseGeneratedEtlScript,
  parseMutationResult,
  parseNaturalQueryResult,
  parseOlapObject,
  parseProvisionResult,
  parseQueryResult,
  parseSavedEtlScript,
  parseSaveEtlScriptResult,
  parseSchemaDescription,
  parseScriptExecutionEvent,
  parseSqlPreview,
  parseSuggestionResponse,
  type AgentStreamCallbacks,
  type AgentStreamEvent,
  type AirflowDagList,
  type AirflowRunResult,
  type CreateEtlConfigResult,
  type DdlResult,
  type DwTableList,
  type EtlConfig,
  type EtlConfigList,
  type EtlSyncResult,
  type GeneratedEtlScript,
  type OlapAiSuggestion,
  type OlapCatalogResponse,
  type OlapCubeCollection,
  type OlapCubeList,
  type OlapCubeMetadata,
  type OlapDesignerDimension,
  type OlapDesignerMeasure,
  type OlapMutationResult,
  type OlapNaturalQueryResult,
  type OlapQueryResult,
  type OlapRow,
  type OlapSchemaDescription,
  type OlapSqlPreview,
  type OlapSuggestionResponse,
  type PivotQuery,
  type ProvisionResult,
  type SavedEtlScript,
  type SaveEtlScriptResult,
  type ScriptExecutionEvent,
  type StarSchemaColumn,
  type StarSchemaDimension
} from '../model/contracts.ts'

const OLAP_API_BASE = `${API_GATEWAY_URL}/olap/api`
const OLAP_ERROR_CONTEXT = {
  serviceName: 'OLAP',
  unavailableMessage: 'OLAP 서비스에 연결할 수 없습니다.',
}

function fetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(useRuntimeStore().getHeaders())
  new Headers(init.headers).forEach((value, key) => headers.set(key, value))
  return globalThis.fetch(input, { ...init, headers })
}

type Decoder<T> = (value: unknown) => T

async function fetchJson<T>(url: string, decoder: Decoder<T>, options?: RequestInit): Promise<T> {
  const response = await fetch(`${OLAP_API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers
    }
  })
  if (!response.ok) {
    await handleHttpError(response)
  }
  return decoder(await response.json())
}

// Schema Management
export const uploadSchema = async (file: File): Promise<OlapCubeCollection> => {
  const formData = new FormData()
  formData.append('file', file)
  const response = await fetch(`${OLAP_API_BASE}/schema/upload`, {
    method: 'POST',
    body: formData
  })
  if (!response.ok) await handleHttpError(response)
  return parseCubeCollection(await response.json())
}

export const uploadSchemaText = async (xmlContent: string): Promise<OlapCubeCollection> => {
  return fetchJson('/schema/upload-text', parseCubeCollection, {
    method: 'POST',
    body: JSON.stringify({ xml_content: xmlContent })
  })
}

// Cube Information
export const getCubes = async (): Promise<OlapCubeList> => {
  return fetchJson('/cubes', parseCubeList)
}

export const getCubeMetadata = async (cubeName: string): Promise<OlapCubeMetadata> => {
  return fetchJson(`/cube/${encodeURIComponent(cubeName)}/metadata`, parseCubeMetadata)
}

export const getCubeSchemaDescription = async (cubeName: string): Promise<OlapSchemaDescription> => {
  return fetchJson(`/cube/${encodeURIComponent(cubeName)}/schema-description`, parseSchemaDescription)
}

export const deleteCube = async (cubeName: string): Promise<OlapMutationResult> => {
  return fetchJson(`/cube/${encodeURIComponent(cubeName)}`, parseMutationResult, {
    method: 'DELETE'
  })
}

export const deleteAllCubes = async (): Promise<OlapMutationResult> => {
  return fetchJson('/cubes', parseMutationResult, {
    method: 'DELETE'
  })
}

// Pivot Query
export const executePivotQuery = async (query: PivotQuery): Promise<OlapQueryResult> => {
  return fetchJson('/pivot/query', parseQueryResult, {
    method: 'POST',
    body: JSON.stringify(query)
  })
}

export const previewPivotSQL = async (query: PivotQuery): Promise<OlapSqlPreview> => {
  return fetchJson('/pivot/preview-sql', parseSqlPreview, {
    method: 'POST',
    body: JSON.stringify(query)
  })
}

// Natural Language Query
export const executeNL2SQL = async (question: string, cubeName: string | null = null): Promise<OlapNaturalQueryResult> => {
  return fetchJson('/nl2sql', parseNaturalQueryResult, {
    method: 'POST',
    body: JSON.stringify({ question, cube_name: cubeName })
  })
}

// ETL APIs
export const getETLCatalog = async (schema: string = 'public'): Promise<OlapCatalogResponse> => {
  return fetchJson(`/etl/catalog?schema=${encodeURIComponent(schema)}`, parseCatalogResponse)
}

export const suggestETLStrategy = async (cubeDescription: string): Promise<OlapSuggestionResponse> => {
  return fetchJson('/etl/suggest', parseSuggestionResponse, {
    method: 'POST',
    body: JSON.stringify({ cube_description: cubeDescription })
  })
}

export const createETLConfig = async (config: EtlConfig): Promise<CreateEtlConfigResult> => {
  return fetchJson('/etl/config', parseCreateEtlConfigResult, {
    method: 'POST',
    body: JSON.stringify(config)
  })
}

export const getETLConfig = async (cubeName: string): Promise<EtlConfig> => {
  return fetchJson(`/etl/config/${encodeURIComponent(cubeName)}`, parseEtlConfig)
}

export const deleteETLConfig = async (cubeName: string): Promise<OlapMutationResult> => {
  return fetchJson(`/etl/config/${encodeURIComponent(cubeName)}`, parseMutationResult, {
    method: 'DELETE'
  })
}

export const getETLConfigs = async (): Promise<EtlConfigList> => {
  return fetchJson('/etl/configs', parseEtlConfigList)
}

export const deleteAllETLConfigs = async (): Promise<OlapMutationResult> => {
  return fetchJson('/etl/configs', parseMutationResult, {
    method: 'DELETE'
  })
}

export const executeETLSync = async (cubeName: string, forceFull: boolean = false): Promise<EtlSyncResult> => {
  return fetchJson(`/etl/sync/${encodeURIComponent(cubeName)}`, parseEtlSyncResult, {
    method: 'POST',
    body: JSON.stringify({ force_full: forceFull })
  })
}

// Create DW Schema
export const createDWSchema = async (): Promise<OlapMutationResult> => {
  return fetchJson('/etl/schema/create', parseMutationResult, {
    method: 'POST'
  })
}

// Generate Star Schema DDL
export const generateStarSchemaDDL = async (
  cubeName: string,
  factTableName: string,
  factColumns: StarSchemaColumn[],
  dimensions: StarSchemaDimension[],
  dwSchema: string = 'dw'
): Promise<DdlResult> => {
  return fetchJson('/etl/ddl/generate', parseDdlResult, {
    method: 'POST',
    body: JSON.stringify({
      cube_name: cubeName,
      fact_table_name: factTableName,
      fact_columns: factColumns,
      dimensions: dimensions,
      dw_schema: dwSchema
    })
  })
}

// Execute DDL
export const executeDDL = async (ddl: string): Promise<DdlResult> => {
  return fetchJson('/etl/ddl/execute', parseDdlResult, {
    method: 'POST',
    body: JSON.stringify({ ddl })
  })
}

// Full provisioning: create schema, tables, and initial data
export const provisionCube = async (
  cubeName: string,
  _aiSuggestion: OlapAiSuggestion | null,
  dimensions: OlapDesignerDimension[],
  measures: OlapDesignerMeasure[],
  factTable: string,
  dwSchema: string = 'dw'
): Promise<ProvisionResult> => {
  return fetchJson('/etl/provision', parseProvisionResult, {
    method: 'POST',
    body: JSON.stringify({
      cube_name: cubeName,
      fact_table: factTable,
      dimensions: dimensions.map(dim => ({
        name: dim.name,
        table: dim.table,
        foreignKey: dim.foreignKey,
        levels: dim.levels || [],
        etlStrategy: dim.etlStrategy || 'etl',
        sourceTable: dim.sourceTable || null
      })),
      measures: measures.map(m => ({
        name: m.name,
        column: m.column,
        aggregator: m.aggregator || 'sum'
      })),
      dw_schema: dwSchema,
      generate_sample_data: true
    })
  })
}

// Health Check
export const healthCheck = async (): Promise<OlapRow> => {
  return fetchJson('/health', value => parseOlapObject(value, 'OLAP health'))
}

// ============== Airflow APIs ==============

export const deployETLPipeline = async (cubeName: string, force: boolean = false): Promise<AirflowRunResult> => {
  const params = force ? '?force=true' : ''
  return fetchJson(`/airflow/etl/${encodeURIComponent(cubeName)}/deploy${params}`, parseAirflowRunResult, {
    method: 'POST'
  })
}

export const runETLPipeline = async (cubeName: string): Promise<AirflowRunResult> => {
  return fetchJson(`/airflow/etl/${encodeURIComponent(cubeName)}/run`, parseAirflowRunResult, {
    method: 'POST'
  })
}

export const triggerDAG = async (dagId: string): Promise<AirflowRunResult> => {
  return fetchJson(`/airflow/dag/${encodeURIComponent(dagId)}/trigger`, parseAirflowRunResult, {
    method: 'POST'
  })
}

export const getDAGStatus = async (dagId: string): Promise<OlapRow> => {
  return fetchJson(`/airflow/dag/${encodeURIComponent(dagId)}/status`, value => parseOlapObject(value, 'Airflow DAG status'))
}

export const listDAGs = async (): Promise<AirflowDagList> => {
  return fetchJson('/airflow/dags', parseAirflowDagList)
}

export const deleteDAG = async (dagId: string): Promise<OlapMutationResult> => {
  return fetchJson(`/airflow/dag/${encodeURIComponent(dagId)}`, parseMutationResult, {
    method: 'DELETE'
  })
}

export const checkAirflowHealth = async (): Promise<OlapRow> => {
  return fetchJson('/airflow/health', value => parseOlapObject(value, 'Airflow health'))
}

// ============== DW Tables Management ==============

export const listDWTables = async (schemaName: string = 'dw'): Promise<DwTableList> => {
  return fetchJson(`/etl/dw/tables?schema_name=${encodeURIComponent(schemaName)}`, parseDwTableList)
}

export const deleteDWTables = async (tables: string[] = [], schemaName: string = 'dw'): Promise<OlapMutationResult> => {
  return fetchJson('/etl/dw/tables/delete', parseMutationResult, {
    method: 'POST',
    body: JSON.stringify({ tables, schema_name: schemaName })
  })
}

export const dropDWSchema = async (schemaName: string = 'dw'): Promise<OlapMutationResult> => {
  return fetchJson(`/etl/dw/schema?schema_name=${encodeURIComponent(schemaName)}`, parseMutationResult, {
    method: 'DELETE'
  })
}


export const generateETLScript = async (
  cubeName: string,
  signal?: AbortSignal,
): Promise<GeneratedEtlScript> => {
  return fetchJson(
    `/etl/generate-script/${encodeURIComponent(cubeName)}`,
    parseGeneratedEtlScript,
    { signal },
  )
}


// ============== ETL Script Management ==============

export const saveETLScript = async (
  cubeName: string,
  code: string,
  filename?: string,
  signal?: AbortSignal,
): Promise<SaveEtlScriptResult> => {
  return fetchJson(`/etl/script/save/${encodeURIComponent(cubeName)}`, parseSaveEtlScriptResult, {
    method: 'POST',
    body: JSON.stringify({ code, filename }),
    signal,
  })
}

export const loadSavedScript = async (
  cubeName: string,
  signal?: AbortSignal,
): Promise<SavedEtlScript> => {
  return fetchJson(
    `/etl/script/load/${encodeURIComponent(cubeName)}`,
    parseSavedEtlScript,
    { signal },
  )
}

export interface OlapStreamControl {
  cancel: () => void
}

function isAbortError(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === 'AbortError'
}

function streamHeaders(): Record<string, string> {
  return useRuntimeStore().getHeaders()
}

export const executeScriptWithRetry = (
  cubeName: string,
  syncMode: 'full' | 'incremental' = 'full',
  maxRetries: number = 3,
  onEvent: (event: ScriptExecutionEvent) => void
): OlapStreamControl => {
  const url = `${OLAP_API_BASE}/etl/script/execute-with-retry/${encodeURIComponent(cubeName)}?sync_mode=${syncMode}&max_retries=${maxRetries}`
  const controller = new AbortController()
  let terminal = false

  void streamSseFetch<ScriptExecutionEvent>(
    url,
    streamHeaders(),
    event => {
      const data = event.data
      onEvent(data)
      if (data.type === 'complete') terminal = true
    },
    value => parseScriptExecutionEvent(value),
    controller.signal,
    OLAP_ERROR_CONTEXT,
  ).then(() => {
    if (!controller.signal.aborted && !terminal) {
      onEvent({
        type: 'error',
        message: 'ETL 실행 stream이 완료 이벤트 없이 종료되었습니다.',
        terminal: true,
      })
    }
  }).catch((cause: unknown) => {
    if (controller.signal.aborted || isAbortError(cause)) return
    onEvent({
      type: 'error',
      message: `ETL 실행 stream 오류: ${cause instanceof Error ? cause.message : String(cause)}`,
      terminal: true,
    })
  })

  return {
    cancel: () => controller.abort(),
  }
}

export const createAgentStream = (
  cubeName: string,
  callbacks: AgentStreamCallbacks
): OlapStreamControl => {
  const url = `${OLAP_API_BASE}/etl/generate-script-stream/${encodeURIComponent(cubeName)}`
  const controller = new AbortController()
  let terminal = false

  void streamSseFetch<AgentStreamEvent>(
    url,
    streamHeaders(),
    event => {
      const data = event.data
      switch (data.type) {
        case 'start':
          callbacks.onStart?.(data)
          break
        case 'log':
        case 'reasoning':
          callbacks.onLog?.(data)
          break
        case 'code':
        case 'script':
          callbacks.onCode?.(data)
          break
        case 'sql':
          callbacks.onSql?.(data)
          break
        case 'status':
          callbacks.onStatus?.(data)
          break
        case 'dimensions':
          callbacks.onDimensions?.(data)
          break
        case 'test':
          callbacks.onTest?.(data)
          break
        case 'complete':
          terminal = true
          callbacks.onComplete?.(data)
          break
        case 'error':
          terminal = true
          callbacks.onError?.(data)
          break
      }
    },
    value => parseAgentStreamEvent(value),
    controller.signal,
    OLAP_ERROR_CONTEXT,
  ).then(() => {
    if (!controller.signal.aborted && !terminal) {
      callbacks.onError?.({
        type: 'error',
        message: 'ETL 생성 stream이 완료 이벤트 없이 종료되었습니다.',
      })
    }
  }).catch((cause: unknown) => {
    if (controller.signal.aborted || isAbortError(cause)) return
    callbacks.onError?.({
      type: 'error',
      message: `ETL 생성 stream 오류: ${cause instanceof Error ? cause.message : String(cause)}`,
    })
  })

  return {
    cancel: () => controller.abort(),
  }
}
