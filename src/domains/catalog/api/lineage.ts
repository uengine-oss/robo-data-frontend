import type { Headers } from '@/shared/services/http'
import { CATALOG_BASE_URL as ROBO_BASE_URL } from './baseUrl'
import { catalogHttp } from './http'

const handleHttpError = catalogHttp.handleError

export interface CatalogLineageNode {
  id: string
  name: string
  type: 'SOURCE' | 'TARGET' | 'ETL'
  properties: Record<string, unknown>
}

export interface CatalogLineageEdge {
  id: string
  source: string
  target: string
  type: string
  properties: Record<string, unknown>
}

export interface CatalogLineageResponse {
  nodes: CatalogLineageNode[]
  edges: CatalogLineageEdge[]
  stats?: {
    etlCount?: number
    sourceCount?: number
    targetCount?: number
    flowCount?: number
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseProperties(value: unknown, context: string): Record<string, unknown> {
  if (value === undefined) return {}
  if (!isRecord(value)) throw new Error(`${context}.properties가 객체가 아닙니다.`)
  return value
}

function parseLineageNode(value: unknown, index: number): CatalogLineageNode {
  if (!isRecord(value)) throw new Error(`Catalog lineage nodes[${index}]가 객체가 아닙니다.`)
  if (typeof value.id !== 'string' || !value.id) {
    throw new Error(`Catalog lineage nodes[${index}].id가 문자열이 아닙니다.`)
  }
  if (typeof value.name !== 'string') {
    throw new Error(`Catalog lineage nodes[${index}].name이 문자열이 아닙니다.`)
  }
  if (value.type !== 'SOURCE' && value.type !== 'TARGET' && value.type !== 'ETL') {
    throw new Error(`Catalog lineage nodes[${index}].type이 올바르지 않습니다.`)
  }
  return {
    id: value.id,
    name: value.name,
    type: value.type,
    properties: parseProperties(value.properties, `Catalog lineage nodes[${index}]`),
  }
}

function parseLineageEdge(value: unknown, index: number): CatalogLineageEdge {
  if (!isRecord(value)) throw new Error(`Catalog lineage edges[${index}]가 객체가 아닙니다.`)
  for (const field of ['id', 'source', 'target', 'type'] as const) {
    if (typeof value[field] !== 'string' || !value[field]) {
      throw new Error(`Catalog lineage edges[${index}].${field}가 문자열이 아닙니다.`)
    }
  }
  return {
    id: value.id as string,
    source: value.source as string,
    target: value.target as string,
    type: value.type as string,
    properties: parseProperties(value.properties, `Catalog lineage edges[${index}]`),
  }
}

function parseOptionalCount(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Catalog lineage stats.${field}가 숫자가 아닙니다.`)
  }
  return value
}

export function parseCatalogLineageResponse(value: unknown): CatalogLineageResponse {
  if (!isRecord(value)) throw new Error('Catalog lineage 응답이 객체가 아닙니다.')
  if (!Array.isArray(value.nodes)) {
    throw new Error('Catalog lineage nodes가 배열이 아닙니다.')
  }
  if (!Array.isArray(value.edges)) {
    throw new Error('Catalog lineage edges가 배열이 아닙니다.')
  }

  let stats: CatalogLineageResponse['stats']
  if (value.stats !== undefined) {
    if (!isRecord(value.stats)) throw new Error('Catalog lineage stats가 객체가 아닙니다.')
    stats = {
      etlCount: parseOptionalCount(value.stats.etlCount, 'etlCount'),
      sourceCount: parseOptionalCount(value.stats.sourceCount, 'sourceCount'),
      targetCount: parseOptionalCount(value.stats.targetCount, 'targetCount'),
      flowCount: parseOptionalCount(value.stats.flowCount, 'flowCount'),
    }
  }

  return {
    nodes: value.nodes.map(parseLineageNode),
    edges: value.edges.map(parseLineageEdge),
    stats,
  }
}

export const catalogLineageApi = {
  async getOverview(headers: Headers = {}): Promise<CatalogLineageResponse> {
    const response = await fetch(`${ROBO_BASE_URL}/lineage/`, { headers })
    if (!response.ok) await handleHttpError(response)
    return parseCatalogLineageResponse(await response.json())
  },

  async analyzeEtlCode(
    body: { sqlContent: string; fileName: string; dbms: string },
    headers: Headers = {},
  ): Promise<unknown> {
    const response = await fetch(`${ROBO_BASE_URL}/lineage/analyze/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })
    if (!response.ok) await handleHttpError(response)
    return response.json()
  },
}
