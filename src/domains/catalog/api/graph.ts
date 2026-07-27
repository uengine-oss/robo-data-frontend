import type { Headers } from '@/shared/services/http'
import { CATALOG_BASE_URL as ROBO_BASE_URL } from './baseUrl'
import { catalogHttp } from './http'

const handleHttpError = catalogHttp.handleError

export interface CatalogGraphResponse {
  Nodes: Array<{
    'Node ID': string
    Labels: string[]
    Properties: Record<string, unknown>
  }>
  Relationships: Array<{
    'Relationship ID': string
    'Start Node ID': string
    'End Node ID': string
    Type: string
    Properties: Record<string, unknown>
  }>
}

export const catalogGraphApi = {
  async checkData(headers: Headers): Promise<{ hasData: boolean; nodeCount: number }> {
    const response = await fetch(`${ROBO_BASE_URL}/check-data/`, { method: 'GET', headers })
    if (!response.ok) await handleHttpError(response)
    return response.json()
  },

  async getGraphData(headers: Headers): Promise<CatalogGraphResponse> {
    const response = await fetch(`${ROBO_BASE_URL}/graph/`, { method: 'GET', headers })
    if (!response.ok) await handleHttpError(response)
    return response.json()
  },

  async deleteAll(headers: Headers): Promise<{ message: string }> {
    const response = await fetch(`${ROBO_BASE_URL}/delete/`, { method: 'DELETE', headers })
    if (!response.ok) await handleHttpError(response)
    return response.json()
  },
}
