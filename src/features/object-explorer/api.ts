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
