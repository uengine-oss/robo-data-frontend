import { API_GATEWAY_URL, handleHttpError } from '@/shared/services/http'
import { useRuntimeStore } from '@/shared/stores/runtime'

function fetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(useRuntimeStore().getHeaders())
  new Headers(init.headers).forEach((value, key) => headers.set(key, value))
  return globalThis.fetch(input, { ...init, headers })
}

export interface OlapLineageOverview {
  source_tables?: Array<{ id: string; name: string; columns?: unknown; schema?: string }>
  etl_processes?: Array<{
    id: string
    name: string
    operation?: unknown
    cube_name?: unknown
    sync_mode?: unknown
    mappings_count?: unknown
  }>
  target_tables?: Array<{
    id: string
    name: string
    columns?: unknown
    schema?: string
    type?: unknown
    cube_name?: unknown
  }>
  data_flows?: Array<{ from: string; to: string; type: string }>
  summary?: {
    total_etl_processes?: number
    total_sources?: number
    total_targets?: number
    total_flows?: number
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseNamedNode(value: unknown, context: string): { id: string; name: string } & Record<string, unknown> {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string') {
    throw new Error(`${context} 노드 계약이 올바르지 않습니다.`)
  }
  return { ...value, id: value.id, name: value.name }
}

export function parseOlapLineageOverview(value: unknown): OlapLineageOverview {
  if (!isRecord(value)) throw new Error('OLAP lineage 응답이 객체가 아닙니다.')
  const sourceTables = value.source_tables
  const processes = value.etl_processes
  const targetTables = value.target_tables
  const flows = value.data_flows
  if (!Array.isArray(sourceTables) || !Array.isArray(processes) || !Array.isArray(targetTables) || !Array.isArray(flows)) {
    throw new Error('OLAP lineage의 노드·흐름 배열 계약이 올바르지 않습니다.')
  }
  const parsedFlows = flows.map(flow => {
    if (!isRecord(flow) || typeof flow.from !== 'string' || typeof flow.to !== 'string' || typeof flow.type !== 'string') {
      throw new Error('OLAP lineage data flow 계약이 올바르지 않습니다.')
    }
    return { from: flow.from, to: flow.to, type: flow.type }
  })
  let summary: OlapLineageOverview['summary']
  if (value.summary !== undefined) {
    if (!isRecord(value.summary)) throw new Error('OLAP lineage summary 계약이 올바르지 않습니다.')
    const summaryData = value.summary
    const numeric = (field: string): number | undefined => {
      const item = summaryData[field]
      if (item === undefined) return undefined
      if (typeof item !== 'number') throw new Error(`OLAP lineage summary.${field}가 숫자가 아닙니다.`)
      return item
    }
    summary = {
      total_etl_processes: numeric('total_etl_processes'),
      total_sources: numeric('total_sources'),
      total_targets: numeric('total_targets'),
      total_flows: numeric('total_flows')
    }
  }
  return {
    source_tables: sourceTables.map(node => parseNamedNode(node, 'source')),
    etl_processes: processes.map(node => parseNamedNode(node, 'ETL')),
    target_tables: targetTables.map(node => parseNamedNode(node, 'target')),
    data_flows: parsedFlows,
    summary
  }
}

export const olapLineageApi = {
  async getOverview(): Promise<OlapLineageOverview> {
    const response = await fetch(`${API_GATEWAY_URL}/olap/api/etl/lineage/overview`)
    if (!response.ok) await handleHttpError(response)
    return parseOlapLineageOverview(await response.json())
  },
}
