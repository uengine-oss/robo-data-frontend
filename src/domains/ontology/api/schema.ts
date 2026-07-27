/** ontology api — 도메인 온톨로지 스키마 CRUD·생성·피드백. 공유 http 코어 사용. */
import type {
  ApplyFeedbackRequest,
  ApplyFeedbackResponse,
  GenerateSchemaRequest,
  GenerateSchemaResponse,
  NodeInstanceData,
  OntologySchema,
} from '../model/schema'
import { handleHttpError } from '@/shared/services/http'
import { ONTOLOGY_BASE_URL } from './baseUrl'
import { useRuntimeStore } from '@/shared/stores/runtime'

function fetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(useRuntimeStore().getHeaders())
  new Headers(init.headers).forEach((value, key) => headers.set(key, value))
  return globalThis.fetch(input, { ...init, headers })
}

export interface SchemaListItem {
  id: string
  name: string
  domain?: string
  description?: string
  createdAt?: string
  updatedAt?: string
  version?: number
  nodeCount?: number
  hasSchemaJson?: boolean
  schemaJson?: unknown
}

export interface SchemaListResponse {
  schemas: SchemaListItem[]
  activeSchemaId: string | null
}

export interface OntologyDataSourceTable {
  name: string
  schema: string
  description?: string
}

export interface OntologyDataSourceCatalogResponse {
  tables: OntologyDataSourceTable[]
}

export interface SaveOntologySchemaResponse {
  success: true
  id: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireString(
  value: unknown,
  path: string,
): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${path}은(는) 비어 있지 않은 문자열이어야 합니다.`)
  }
  return value
}

function validateOptional(
  record: Record<string, unknown>,
  key: keyof SchemaListItem,
  type: 'string' | 'number' | 'boolean',
  path: string,
) {
  const value = record[key]
  if (value !== undefined && (typeof value !== type || (type === 'number' && !Number.isFinite(value)))) {
    throw new Error(`${path}.${key}은(는) ${type === 'string' ? '문자열' : type === 'number' ? '유한한 숫자' : 'boolean'}이어야 합니다.`)
  }
}

export function parseSchemaListResponse(value: unknown): SchemaListResponse {
  if (!isRecord(value)) {
    throw new Error('온톨로지 스키마 목록 응답은 객체여야 합니다.')
  }
  if (!Array.isArray(value.schemas)) {
    throw new Error('온톨로지 스키마 목록 응답의 schemas는 배열이어야 합니다.')
  }
  if (value.activeSchemaId !== null && typeof value.activeSchemaId !== 'string') {
    throw new Error('온톨로지 스키마 목록 응답의 activeSchemaId는 문자열 또는 null이어야 합니다.')
  }

  const schemas = value.schemas.map((item, index): SchemaListItem => {
    if (!isRecord(item)) {
      throw new Error(`온톨로지 스키마 목록 schemas[${index}]는 객체여야 합니다.`)
    }
    const path = `온톨로지 스키마 목록 schemas[${index}]`
    const schema: SchemaListItem = {
      id: requireString(item.id, `${path}.id`),
      name: requireString(item.name, `${path}.name`),
    }
    for (const key of ['domain', 'description', 'createdAt', 'updatedAt'] as const) {
      validateOptional(item, key, 'string', path)
      if (item[key] !== undefined) schema[key] = item[key] as string
    }
    for (const key of ['version', 'nodeCount'] as const) {
      validateOptional(item, key, 'number', path)
      if (item[key] !== undefined) schema[key] = item[key] as number
    }
    validateOptional(item, 'hasSchemaJson', 'boolean', path)
    if (item.hasSchemaJson !== undefined) schema.hasSchemaJson = item.hasSchemaJson as boolean
    if ('schemaJson' in item) schema.schemaJson = item.schemaJson
    return schema
  })

  return {
    schemas,
    activeSchemaId: value.activeSchemaId,
  }
}

export function parseOntologyDataSourceCatalog(
  value: unknown,
): OntologyDataSourceCatalogResponse {
  if (!isRecord(value) || !Array.isArray(value.tables)) {
    throw new Error('Ontology 데이터 소스 응답의 tables는 배열이어야 합니다.')
  }
  return {
    tables: value.tables.map((item, index) => {
      if (!isRecord(item)) {
        throw new Error(`Ontology 데이터 소스 tables[${index}]는 객체여야 합니다.`)
      }
      const table: OntologyDataSourceTable = {
        name: requireString(item.name, `Ontology 데이터 소스 tables[${index}].name`),
        schema: requireString(item.schema, `Ontology 데이터 소스 tables[${index}].schema`),
      }
      if (item.description !== undefined) {
        if (typeof item.description !== 'string') {
          throw new Error(`Ontology 데이터 소스 tables[${index}].description은(는) 문자열이어야 합니다.`)
        }
        table.description = item.description
      }
      return table
    }),
  }
}

export function parseNodeInstanceData(value: unknown): NodeInstanceData {
  if (!isRecord(value)) {
    throw new Error('Ontology 노드 인스턴스 응답은 객체여야 합니다.')
  }
  if (!Number.isInteger(value.totalCount) || (value.totalCount as number) < 0) {
    throw new Error('Ontology 노드 인스턴스 totalCount는 0 이상의 정수여야 합니다.')
  }
  if (!isRecord(value.previewData)) {
    throw new Error('Ontology 노드 인스턴스 previewData는 객체여야 합니다.')
  }
  if (
    !Array.isArray(value.previewData.columns)
    || value.previewData.columns.some(column => typeof column !== 'string')
  ) {
    throw new Error('Ontology 노드 인스턴스 previewData.columns는 문자열 배열이어야 합니다.')
  }
  if (
    !Array.isArray(value.previewData.rows)
    || value.previewData.rows.some(row => !Array.isArray(row))
  ) {
    throw new Error('Ontology 노드 인스턴스 previewData.rows는 행 배열이어야 합니다.')
  }
  if (value.lastUpdated !== undefined && typeof value.lastUpdated !== 'string') {
    throw new Error('Ontology 노드 인스턴스 lastUpdated는 문자열이어야 합니다.')
  }

  const parsed: NodeInstanceData = {
    nodeId: requireString(value.nodeId, 'Ontology 노드 인스턴스 nodeId'),
    nodeName: requireString(value.nodeName, 'Ontology 노드 인스턴스 nodeName'),
    dataSource: requireString(value.dataSource, 'Ontology 노드 인스턴스 dataSource'),
    totalCount: value.totalCount as number,
    previewData: {
      columns: [...value.previewData.columns],
      rows: value.previewData.rows.map(row => [...row]),
    },
  }
  if (value.lastUpdated !== undefined) parsed.lastUpdated = value.lastUpdated
  return parsed
}

export function parseSaveOntologySchemaResponse(
  value: unknown,
): SaveOntologySchemaResponse {
  if (!isRecord(value)) {
    throw new Error('온톨로지 저장 응답은 객체여야 합니다.')
  }
  if (value.success !== true) {
    throw new Error('온톨로지 저장 응답의 success가 true가 아닙니다.')
  }
  return {
    success: true,
    id: requireString(value.id, '온톨로지 저장 응답 id'),
  }
}

export const ontologyApi = {
  // ========================================================================
  // 스키마 목록 관리 API
  // ========================================================================

  /**
   * 저장된 모든 스키마 목록 조회
   */
  async listSchemas(): Promise<SchemaListResponse> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/schemas`)
    if (!response.ok) {
      await handleHttpError(response)
    }
    return parseSchemaListResponse(await response.json())
  },

  /**
   * 특정 스키마 조회
   */
  async getSchemaById(schemaId: string): Promise<OntologySchema | null> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/schemas/${schemaId}`)
    if (response.status === 404) {
      return null
    }
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  /**
   * 스키마 활성화 (목록에서 선택)
   */
  async activateSchema(schemaId: string): Promise<{ success: boolean; schemaId: string; name: string }> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/schemas/${schemaId}/activate`, {
      method: 'POST'
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  /**
   * 저장된 스키마 이름 변경
   */
  async updateSchemaName(schemaId: string, name: string): Promise<unknown> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/schemas/${encodeURIComponent(schemaId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json().catch(() => ({}))
  },

  /**
   * 특정 스키마 삭제
   */
  async deleteSchemaById(schemaId: string): Promise<{ success: boolean }> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/schemas/${schemaId}`, {
      method: 'DELETE'
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  // ========================================================================
  // 현재 활성 스키마 API
  // ========================================================================

  /**
   * 현재 활성 온톨로지 스키마 조회
   */
  async getSchema(): Promise<OntologySchema | null> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/schema`)
    if (response.status === 404) {
      return null
    }
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  /**
   * 온톨로지 스키마 저장
   */
  async saveSchema(schema: OntologySchema): Promise<SaveOntologySchemaResponse> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/schema`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(schema)
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return parseSaveOntologySchemaResponse(await response.json())
  },

  /**
   * 텍스트/PDF에서 온톨로지 스키마 생성 (LLM 사용)
   */
  async generateSchema(
    request: GenerateSchemaRequest,
    onProgress?: (progress: number, message: string) => void
  ): Promise<GenerateSchemaResponse> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    })

    if (!response.ok || !response.body) {
      const errorText = await response.text()
      throw new Error(errorText || `HTTP ${response.status}`)
    }

    // 스트리밍 응답 처리 (progress 이벤트)
    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    let result: GenerateSchemaResponse | null = null

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      let newlineIndex = buffer.indexOf('\n')

      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)

        if (line) {
          try {
            const event = JSON.parse(line)
            if (event.event === 'progress' && onProgress) {
              onProgress(event.progress, event.message)
            } else if (event.event === 'complete') {
              result = event.data
            } else if (event.event === 'error') {
              throw new Error(event.message)
            }
          } catch (e) {
            if (e instanceof SyntaxError) {
              throw new Error('스키마 생성 스트림에 올바르지 않은 JSON이 포함되어 있습니다.')
            }
            throw e
          }
        }
        newlineIndex = buffer.indexOf('\n')
      }
    }

    if (buffer.trim()) {
      let event: unknown
      try {
        event = JSON.parse(buffer)
      } catch {
        throw new Error('스키마 생성 스트림의 마지막 이벤트가 올바른 JSON이 아닙니다.')
      }
      if (typeof event === 'object' && event !== null && 'event' in event) {
        const finalEvent = event as { event: unknown; data?: unknown; message?: unknown }
        if (finalEvent.event === 'complete') result = finalEvent.data as GenerateSchemaResponse
        if (finalEvent.event === 'error') {
          throw new Error(typeof finalEvent.message === 'string' ? finalEvent.message : '스키마 생성 중 오류가 발생했습니다.')
        }
      }
    }

    if (!result) {
      throw new Error('스키마 생성 응답을 받지 못했습니다.')
    }

    return result
  },

  /**
   * 피드백으로 스키마 수정 (LLM 사용)
   */
  async applyFeedback(request: ApplyFeedbackRequest): Promise<ApplyFeedbackResponse> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  /**
   * Process 노드의 BPMN XML 업데이트
   */
  async updateBpmnXml(nodeId: string, bpmnXml: string): Promise<{ success: boolean; nodeId: string; message: string }> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/nodes/${nodeId}/bpmn-xml`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bpmnXml })
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  /**
   * 노드 인스턴스 데이터 조회 (text2sql 서브에이전트 사용)
   */
  async getNodeInstances(nodeId: string, limit: number = 100): Promise<NodeInstanceData> {
    const params = new URLSearchParams({ limit: limit.toString() })
    const response = await fetch(`${ONTOLOGY_BASE_URL}/nodes/${nodeId}/instances?${params}`)
    if (!response.ok) {
      await handleHttpError(response)
    }
    return parseNodeInstanceData(await response.json())
  },

  /**
   * 노드에 데이터 소스 바인딩
   */
  async bindDataSource(nodeId: string, dataSource: string, schema?: string): Promise<void> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/nodes/${nodeId}/datasource`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataSource, schema })
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
  },

  /**
   * 노드 데이터 소스 바인딩 해제
   */
  async unbindDataSource(nodeId: string): Promise<void> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/nodes/${nodeId}/datasource`, {
      method: 'DELETE'
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
  },

  /**
   * Materialized View 생성
   */
  async createMaterializedView(
    nodeId: string,
    viewName?: string,
    refreshInterval?: number
  ): Promise<{ success: boolean; viewName: string }> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/nodes/${nodeId}/materialized-view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ viewName, refreshInterval })
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  /**
   * 사용 가능한 데이터 소스 목록 조회
   */
  async getAvailableDataSources(): Promise<OntologyDataSourceCatalogResponse> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/datasources`)
    if (!response.ok) {
      await handleHttpError(response)
    }
    return parseOntologyDataSourceCatalog(await response.json())
  },

  /**
   * Neo4j에 온톨로지 스키마 동기화
   */
  async syncToNeo4j(): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/sync-neo4j`, {
      method: 'POST'
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  }
}
