/** object-explorer api — 도메인 레이어 오브젝트 탐색(온톨로지 백엔드). 공유 http 코어 사용. */
import { ONTOLOGY_BASE_URL, postJson, handleHttpError } from '@/shared/services/http'

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
  columns: Array<{ name: string; type: string }>
  materializedView?: string
  query?: string
  createdAt?: string
  chartConfig?: ChartConfig
}

export interface ObjectTypeDataResponse {
  objectType: string
  columns: string[]
  rows: Array<Record<string, unknown>>
  rowCount: number
  usingMaterializedView: boolean
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
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },

  /**
   * Object Type 데이터 조회 (Materialized View에서)
   */
  async getObjectTypeData(objectTypeName: string, limit: number = 100): Promise<ObjectTypeDataResponse> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/object-types/${encodeURIComponent(objectTypeName)}/data?limit=${limit}`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
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
      throw new Error(`HTTP ${response.status}`)
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
      throw new Error(`HTTP ${response.status}`)
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
      throw new Error(`HTTP ${response.status}`)
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
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },

  /** 단일 ObjectType 조회 (컬럼 포함) — 관계 편집 등에서 컬럼 확보용 */
  async getObjectType(objectTypeName: string): Promise<{ columns?: Array<{ name: string; type?: string }> } & Record<string, any>> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/object-types/${encodeURIComponent(objectTypeName)}`)
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  /** ObjectType 생성 */
  async createObjectType(body: unknown): Promise<any> {
    return postJson(`${ONTOLOGY_BASE_URL}/object-types`, body, {})
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
  async generateObjectTypeName(body: unknown): Promise<{ korean_name?: string; english_name?: string; description?: string }> {
    return postJson(`${ONTOLOGY_BASE_URL}/generate-object-type-name`, body, {})
  },

  /** ObjectType 인스턴스 일괄 생성 — /ontology/instances/bulk-create */
  async bulkCreateInstances(body: unknown): Promise<{ created_count?: number } & Record<string, any>> {
    return postJson(`${ONTOLOGY_BASE_URL}/instances/bulk-create`, body, {})
  },

  /** DB 스키마로부터 온톨로지 생성 — /ontology/generate-from-schema. 응답은 {success, error?, tablesProcessed, relationshipsInferred, schema} 형태(필드 옵셔널이라 any 로 노출). */
  async generateFromSchema(body: unknown): Promise<Record<string, any>> {
    return postJson(`${ONTOLOGY_BASE_URL}/generate-from-schema`, body, {})
  },

  /** 온톨로지 노드 데이터 조회 — /ontology-nodes/{id}/data (query 예: 'limit=1') */
  async getNodeData(nodeId: string, query: string = ''): Promise<Record<string, any>> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/ontology-nodes/${encodeURIComponent(nodeId)}/data${query ? `?${query}` : ''}`)
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  /** 노드 컬럼 distinct 값 — /ontology-nodes/{id}/filter-values?columns=... */
  async getNodeFilterValues(nodeId: string, columnsParam: string): Promise<Record<string, any>> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/ontology-nodes/${encodeURIComponent(nodeId)}/filter-values?columns=${encodeURIComponent(columnsParam)}`)
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  /** 노드 샘플 데이터 — /node/{id}/sample-data?limit=... */
  async getNodeSampleData(nodeId: string, limit: number = 10): Promise<Record<string, any>> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/node/${encodeURIComponent(nodeId)}/sample-data?limit=${limit}`)
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  /** 노드로부터 ObjectType 생성 — /ontology-nodes/{id}/create-objecttype */
  async createObjectTypeFromNode(nodeId: string, body: unknown): Promise<any> {
    return postJson(`${ONTOLOGY_BASE_URL}/ontology-nodes/${encodeURIComponent(nodeId)}/create-objecttype`, body, {})
  },

  /** 노드 incoming 네트워크 — /schemas/{id}/nodes/{nodeId}/incoming-network */
  async getIncomingNetwork(schemaId: string, nodeId: string, body: unknown): Promise<Record<string, any>> {
    return postJson(`${ONTOLOGY_BASE_URL}/schemas/${encodeURIComponent(schemaId)}/nodes/${encodeURIComponent(nodeId)}/incoming-network`, body, {})
  },

  /** 데이터소스 매핑 확정 — /confirm-datasource */
  async confirmDatasource(body: unknown): Promise<any> {
    return postJson(`${ONTOLOGY_BASE_URL}/confirm-datasource`, body, {})
  },

  /** 스키마 부분 수정 — /schemas/{id} (PATCH) */
  async updateSchema(schemaId: string, body: unknown): Promise<any> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/schemas/${encodeURIComponent(schemaId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json().catch(() => ({}))
  },

  /**
   * 데이터소스 자동연결 (SSE 스트림, `data:` 라인) — /auto-link-datasource/stream.
   * 소비처는 onEvent(event) 에서 event.type(progress/result/error) 분기.
   */
  async autoLinkDatasourceStream(body: unknown, onEvent: (event: any) => void): Promise<void> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/auto-link-datasource/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!response.ok) {
      throw new Error('스트리밍 연결 실패')
    }
    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('스트리밍 리더 없음')
    }
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            onEvent(JSON.parse(line.slice(6)))
          } catch (e) {
            console.warn('SSE 파싱 오류:', e)
          }
        }
      }
    }
  },

  /** 데이터소스 자동연결 (비스트림 폴백) — /auto-link-datasource */
  async autoLinkDatasource(body: unknown): Promise<{ mappings?: Record<string, any> } & Record<string, any>> {
    return postJson(`${ONTOLOGY_BASE_URL}/auto-link-datasource`, body, {})
  },

  /** 다층 온톨로지 생성 (NDJSON 스트림, abort 지원) — /generate-multi-layer */
  async generateMultiLayer(body: unknown, onEvent: (event: any) => void, signal?: AbortSignal): Promise<void> {
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
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          onEvent(JSON.parse(line))
        } catch {
          console.warn('Failed to parse stream event:', line)
        }
      }
    }
    if (buffer.trim()) {
      try {
        onEvent(JSON.parse(buffer))
      } catch {
        console.warn('Failed to parse final event:', buffer)
      }
    }
  },

  /**
   * 노드 인과분석 스트림 요청 — /schemas/{id}/nodes/{n}/causal-analysis/stream.
   * Response 를 반환(404 폴백·content-type 협상·NDJSON 파싱은 호출처가 오케스트레이션).
   */
  async causalAnalysisStreamRequest(schemaId: string, nodeId: string, body: unknown): Promise<Response> {
    return fetch(`${ONTOLOGY_BASE_URL}/schemas/${encodeURIComponent(schemaId)}/nodes/${encodeURIComponent(nodeId)}/causal-analysis/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  },

  /** 노드 인과분석 (비스트림 폴백, Response 반환) — /schemas/{id}/nodes/{n}/causal-analysis */
  async causalAnalysisRequest(schemaId: string, nodeId: string, body: unknown): Promise<Response> {
    return fetch(`${ONTOLOGY_BASE_URL}/schemas/${encodeURIComponent(schemaId)}/nodes/${encodeURIComponent(nodeId)}/causal-analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
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

export const relationshipApi = {
  /** 관계 조회 (없으면 null) */
  async get(params: RelationshipParams): Promise<(Record<string, any>) | null> {
    const qs = new URLSearchParams(params as unknown as Record<string, string>)
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
  async create(body: unknown): Promise<{ relationship?: any } & Record<string, any>> {
    return postJson(`${ONTOLOGY_BASE_URL}/relationships`, body, {})
  },

  /** 관계 수정 */
  async update(params: RelationshipParams, body: unknown): Promise<void> {
    const qs = new URLSearchParams(params as unknown as Record<string, string>)
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
