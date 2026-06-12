/** ontology api — 도메인 온톨로지 스키마 CRUD·생성·피드백. 공유 http 코어 사용. */
import type { OntologySchema, GenerateSchemaRequest, GenerateSchemaResponse, ApplyFeedbackRequest, ApplyFeedbackResponse, NodeInstanceData } from '@/shared/types'
import { ONTOLOGY_BASE_URL } from '@/shared/services/http'

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
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
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
      throw new Error(`HTTP ${response.status}`)
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
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },

  /**
   * 특정 스키마 삭제
   */
  async deleteSchemaById(schemaId: string): Promise<{ success: boolean }> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/schemas/${schemaId}`, {
      method: 'DELETE'
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
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
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },

  /**
   * 온톨로지 스키마 저장
   */
  async saveSchema(schema: OntologySchema): Promise<{ success: boolean; id: string }> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/schema`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(schema)
    })
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(errorText || `HTTP ${response.status}`)
    }
    return response.json()
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
              console.warn('Failed to parse progress event:', line)
            } else {
              throw e
            }
          }
        }
        newlineIndex = buffer.indexOf('\n')
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
      const errorText = await response.text()
      throw new Error(errorText || `HTTP ${response.status}`)
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
      const errorText = await response.text()
      throw new Error(errorText || `HTTP ${response.status}`)
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
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
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
      const errorText = await response.text()
      throw new Error(errorText || `HTTP ${response.status}`)
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
      throw new Error(`HTTP ${response.status}`)
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
      const errorText = await response.text()
      throw new Error(errorText || `HTTP ${response.status}`)
    }
    return response.json()
  },

  /**
   * 사용 가능한 데이터 소스 목록 조회
   */
  async getAvailableDataSources(): Promise<{ tables: Array<{ name: string; schema: string; description?: string }> }> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/datasources`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },

  /**
   * Neo4j에 온톨로지 스키마 동기화
   */
  async syncToNeo4j(): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/sync-neo4j`, {
      method: 'POST'
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  }
}
