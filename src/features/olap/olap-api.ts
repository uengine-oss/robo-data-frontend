/**
 * OLAP API Service
 * data-platform-olap 백엔드와 통신하는 API 서비스 (fetch 기반)
 * API Gateway를 통해 연결됨
 */

// API Gateway URL - 모든 마이크로서비스 요청의 단일 진입점(공유 코어)
import { API_GATEWAY_URL } from '@/shared/services/http'

const OLAP_API_BASE = `${API_GATEWAY_URL}/olap/api`

async function fetchJson(url: string, options?: RequestInit) {
  const response = await fetch(`${OLAP_API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers
    }
  })
  if (!response.ok) {
    const error = await response.text()
    throw new Error(error || response.statusText)
  }
  return response.json()
}

// Schema Management
export const uploadSchema = async (file: File) => {
  const formData = new FormData()
  formData.append('file', file)
  const response = await fetch(`${OLAP_API_BASE}/schema/upload`, {
    method: 'POST',
    body: formData
  })
  if (!response.ok) throw new Error('Upload failed')
  return response.json()
}

export const uploadSchemaText = async (xmlContent: string) => {
  return fetchJson('/schema/upload-text', {
    method: 'POST',
    body: JSON.stringify({ xml_content: xmlContent })
  })
}

// Cube Information
export const getCubes = async () => {
  return fetchJson('/cubes')
}

export const getCubeMetadata = async (cubeName: string) => {
  return fetchJson(`/cube/${encodeURIComponent(cubeName)}/metadata`)
}

export const getCubeSchemaDescription = async (cubeName: string) => {
  return fetchJson(`/cube/${encodeURIComponent(cubeName)}/schema-description`)
}

export const deleteCube = async (cubeName: string) => {
  return fetchJson(`/cube/${encodeURIComponent(cubeName)}`, {
    method: 'DELETE'
  })
}

export const deleteAllCubes = async () => {
  return fetchJson('/cubes', {
    method: 'DELETE'
  })
}

// Pivot Query
export const executePivotQuery = async (query: any) => {
  return fetchJson('/pivot/query', {
    method: 'POST',
    body: JSON.stringify(query)
  })
}

export const previewPivotSQL = async (query: any) => {
  return fetchJson('/pivot/preview-sql', {
    method: 'POST',
    body: JSON.stringify(query)
  })
}

// Natural Language Query
export const executeNL2SQL = async (question: string, cubeName: string | null = null) => {
  return fetchJson('/nl2sql', {
    method: 'POST',
    body: JSON.stringify({ question, cube_name: cubeName })
  })
}

// ETL APIs
export const getETLCatalog = async (schema: string = 'public') => {
  return fetchJson(`/etl/catalog?schema=${schema}`)
}

export const suggestETLStrategy = async (cubeDescription: string) => {
  return fetchJson('/etl/suggest', {
    method: 'POST',
    body: JSON.stringify({ cube_description: cubeDescription })
  })
}

export const createETLConfig = async (config: any) => {
  return fetchJson('/etl/config', {
    method: 'POST',
    body: JSON.stringify(config)
  })
}

export const getETLConfig = async (cubeName: string) => {
  return fetchJson(`/etl/config/${encodeURIComponent(cubeName)}`)
}

export const deleteETLConfig = async (cubeName: string) => {
  return fetchJson(`/etl/config/${encodeURIComponent(cubeName)}`, {
    method: 'DELETE'
  })
}

export const getETLConfigs = async () => {
  return fetchJson('/etl/configs')
}

export const deleteAllETLConfigs = async () => {
  return fetchJson('/etl/configs', {
    method: 'DELETE'
  })
}

export const executeETLSync = async (cubeName: string, forceFull: boolean = false) => {
  return fetchJson(`/etl/sync/${cubeName}`, {
    method: 'POST',
    body: JSON.stringify({ force_full: forceFull })
  })
}

export const generateDDL = async (schemaName: string, factTable: string, dimensions: any[]) => {
  return fetchJson('/etl/ddl', {
    method: 'POST',
    body: JSON.stringify({ schema_name: schemaName, fact_table: factTable, dimensions })
  })
}

// Create DW Schema
export const createDWSchema = async () => {
  return fetchJson('/etl/schema/create', {
    method: 'POST'
  })
}

// Generate Star Schema DDL
export const generateStarSchemaDDL = async (
  cubeName: string,
  factTableName: string,
  factColumns: any[],
  dimensions: any[],
  dwSchema: string = 'dw'
) => {
  return fetchJson('/etl/ddl/generate', {
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
export const executeDDL = async (ddl: string) => {
  return fetchJson('/etl/ddl/execute', {
    method: 'POST',
    body: JSON.stringify({ ddl })
  })
}

// Full provisioning: create schema, tables, and initial data
export const provisionCube = async (
  cubeName: string, 
  aiSuggestion: any, 
  dimensions: any[], 
  measures: any[], 
  factTable: string,
  dwSchema: string = 'dw'
) => {
  return fetchJson('/etl/provision', {
    method: 'POST',
    body: JSON.stringify({
      cube_name: cubeName,
      fact_table: factTable,
      dimensions: dimensions.map((dim: any) => ({
        name: dim.name,
        table: dim.table,
        foreignKey: dim.foreignKey,
        levels: dim.levels || [],
        etlStrategy: dim.etlStrategy || 'etl',
        sourceTable: dim.sourceTable || null
      })),
      measures: measures.map((m: any) => ({
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
export const healthCheck = async () => {
  return fetchJson('/health')
}

// ============== Airflow APIs ==============

export const deployETLPipeline = async (cubeName: string, force: boolean = false) => {
  const params = force ? '?force=true' : ''
  return fetchJson(`/airflow/etl/${encodeURIComponent(cubeName)}/deploy${params}`, {
    method: 'POST'
  })
}

export const runETLPipeline = async (cubeName: string) => {
  return fetchJson(`/airflow/etl/${encodeURIComponent(cubeName)}/run`, {
    method: 'POST'
  })
}

export const triggerDAG = async (dagId: string) => {
  return fetchJson(`/airflow/dag/${encodeURIComponent(dagId)}/trigger`, {
    method: 'POST'
  })
}

export const getDAGStatus = async (dagId: string) => {
  return fetchJson(`/airflow/dag/${encodeURIComponent(dagId)}/status`)
}

export const listDAGs = async () => {
  return fetchJson('/airflow/dags')
}

export const deleteDAG = async (dagId: string) => {
  return fetchJson(`/airflow/dag/${encodeURIComponent(dagId)}`, {
    method: 'DELETE'
  })
}

export const checkAirflowHealth = async () => {
  return fetchJson('/airflow/health')
}

// ============== DW Tables Management ==============

export const listDWTables = async (schemaName: string = 'dw') => {
  return fetchJson(`/etl/dw/tables?schema_name=${schemaName}`)
}

export const deleteDWTables = async (tables: string[] = [], schemaName: string = 'dw') => {
  return fetchJson('/etl/dw/tables/delete', {
    method: 'POST',
    body: JSON.stringify({ tables, schema_name: schemaName })
  })
}

export const dropDWSchema = async (schemaName: string = 'dw') => {
  return fetchJson(`/etl/dw/schema?schema_name=${schemaName}`, {
    method: 'DELETE'
  })
}


// ============== Direct ETL Execution (No Airflow) ==============

export const executeDirectETL = async (etlConfig: {
  cube_name: string
  fact_table: string
  dimension_tables?: string[]
  source_tables?: string[]
  mappings?: any[]
  dw_schema?: string
  sync_mode?: string
  incremental_column?: string | null
}) => {
  return fetchJson('/etl/execute-direct', {
    method: 'POST',
    body: JSON.stringify(etlConfig)
  })
}

export const executeDirectETLByCube = async (cubeName: string) => {
  return fetchJson(`/etl/execute-direct/${encodeURIComponent(cubeName)}`, {
    method: 'POST'
  })
}

export const generateETLScript = async (cubeName: string) => {
  return fetchJson(`/etl/generate-script/${encodeURIComponent(cubeName)}`)
}


// ============== ETL Script Management ==============

export const saveETLScript = async (cubeName: string, code: string, filename?: string) => {
  return fetchJson(`/etl/script/save/${encodeURIComponent(cubeName)}`, {
    method: 'POST',
    body: JSON.stringify({ code, filename })
  })
}

export const loadSavedScript = async (cubeName: string) => {
  return fetchJson(`/etl/script/load/${encodeURIComponent(cubeName)}`)
}

export const executeSavedScript = async (cubeName: string, syncMode: 'full' | 'incremental' = 'full') => {
  return fetchJson(`/etl/script/execute/${encodeURIComponent(cubeName)}`, {
    method: 'POST',
    body: JSON.stringify({ sync_mode: syncMode })
  })
}

export const deleteSavedScript = async (cubeName: string) => {
  return fetchJson(`/etl/script/${encodeURIComponent(cubeName)}`, {
    method: 'DELETE'
  })
}

/**
 * Execute ETL script with automatic retry and streaming progress.
 */
export const executeScriptWithRetry = (
  cubeName: string, 
  syncMode: 'full' | 'incremental' = 'full',
  maxRetries: number = 3,
  onEvent: (event: {
    type: 'progress' | 'log' | 'error' | 'regenerating' | 'agent_reasoning' | 'script_updated' | 'success' | 'complete' | 'warning';
    message: string;
    attempt?: number;
    maxRetries?: number;
    success?: boolean;
    output?: string;
  }) => void
): { cancel: () => void } => {
  const url = `${OLAP_API_BASE}/etl/script/execute-with-retry/${encodeURIComponent(cubeName)}?sync_mode=${syncMode}&max_retries=${maxRetries}`
  
  const eventSource = new EventSource(url)
  
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      onEvent(data)
      if (data.type === 'complete') {
        eventSource.close()
      }
    } catch (e) {
      console.error('Failed to parse SSE event:', e)
    }
  }
  
  eventSource.onerror = () => {
    onEvent({ type: 'error', message: 'SSE 연결 오류' })
    eventSource.close()
  }
  
  return {
    cancel: () => eventSource.close()
  }
}

/**
 * Create SSE event source for agent-based ETL script generation.
 * Streams real-time progress updates from the ETL agent.
 */
export const createAgentEventSource = (
  cubeName: string,
  callbacks: {
    onStart?: (data: any) => void;
    onLog?: (data: any) => void;
    onCode?: (data: any) => void;
    onSql?: (data: any) => void;
    onStatus?: (data: any) => void;
    onDimensions?: (data: any) => void;
    onTest?: (data: any) => void;
    onComplete?: (data: any) => void;
    onError?: (error: any) => void;
  }
): EventSource => {
  const url = `${OLAP_API_BASE}/etl/generate-script-stream/${encodeURIComponent(cubeName)}`
  const eventSource = new EventSource(url)
  
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      
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
          callbacks.onComplete?.(data)
          eventSource.close()
          break
        case 'error':
          callbacks.onError?.(data)
          eventSource.close()
          break
        default:
          // Handle unknown types as log
          callbacks.onLog?.(data)
      }
    } catch (e) {
      console.error('Failed to parse SSE event:', e)
      callbacks.onError?.({ message: 'Failed to parse event' })
    }
  }
  
  eventSource.onerror = (error) => {
    console.error('SSE error:', error)
    callbacks.onError?.({ message: 'SSE connection error' })
    eventSource.close()
  }
  
  return eventSource
}
