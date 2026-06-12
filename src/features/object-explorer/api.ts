/** object-explorer api — 도메인 레이어 오브젝트 탐색(온톨로지 백엔드). 공유 http 코어 사용. */
import { ONTOLOGY_BASE_URL } from '@/shared/services/http'

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
  }
}
