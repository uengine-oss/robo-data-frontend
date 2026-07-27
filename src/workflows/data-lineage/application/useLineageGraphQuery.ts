import { ref } from 'vue'
import {
  catalogLineageApi,
  type CatalogLineageResponse,
} from '@/domains/catalog'
import {
  olapLineageApi,
  type OlapLineageOverview,
} from '@/domains/olap'
import { useRuntimeStore } from '@/shared/stores/runtime'
import {
  emptyLineageGraph,
  type LineageEdge,
  type LineageGraphData,
  type LineageNode,
} from '../model/graph.ts'

export interface LineageGraphQueryDependencies {
  loadOlap: () => Promise<OlapLineageOverview>
  loadCatalog: () => Promise<CatalogLineageResponse>
}

export interface LineageGraphLoadResult {
  data: LineageGraphData
  warnings: string[]
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback
}

function projectOlapLineage(data: OlapLineageOverview): LineageGraphData {
  const graph = emptyLineageGraph()

  for (const source of data.source_tables ?? []) {
    graph.nodes.push({
      id: source.id,
      name: source.name,
      type: 'SOURCE',
      properties: {
        columns: source.columns,
        schema: source.schema || 'public',
      },
    })
  }
  for (const etl of data.etl_processes ?? []) {
    graph.nodes.push({
      id: etl.id,
      name: etl.name,
      type: 'ETL',
      properties: {
        operation: etl.operation,
        cube_name: etl.cube_name,
        sync_mode: etl.sync_mode,
        mappings_count: etl.mappings_count,
      },
    })
  }
  for (const target of data.target_tables ?? []) {
    graph.nodes.push({
      id: target.id,
      name: target.name,
      type: 'TARGET',
      properties: {
        columns: target.columns,
        schema: target.schema,
        table_type: target.type,
        cube_name: target.cube_name,
      },
    })
  }
  for (const flow of data.data_flows ?? []) {
    graph.edges.push({
      id: `flow_${flow.from}_${flow.to}`,
      source: flow.from,
      target: flow.to,
      type: flow.type === 'extract' ? 'DATA_FLOW_TO' : 'TRANSFORMS_TO',
      properties: { flowType: flow.type },
    })
  }

  graph.stats = {
    etlCount: data.summary?.total_etl_processes ?? 0,
    sourceCount: data.summary?.total_sources ?? 0,
    targetCount: data.summary?.total_targets ?? 0,
    flowCount: data.summary?.total_flows ?? 0,
  }
  return graph
}

function projectCatalogLineage(data: CatalogLineageResponse): LineageGraphData {
  return {
    nodes: [...data.nodes],
    edges: [...data.edges],
    stats: {
      etlCount: data.stats?.etlCount ?? 0,
      sourceCount: data.stats?.sourceCount ?? 0,
      targetCount: data.stats?.targetCount ?? 0,
      flowCount: data.stats?.flowCount ?? 0,
    },
  }
}

export function mergeLineageGraphs(
  olap: LineageGraphData | null,
  catalog: LineageGraphData | null,
): LineageGraphData {
  const merged = emptyLineageGraph()

  function addNodes(nodes: LineageNode[], dedupeByName: boolean): void {
    for (const node of nodes) {
      const duplicate = merged.nodes.some(existing =>
        existing.id === node.id || (dedupeByName && existing.name === node.name),
      )
      if (!duplicate) merged.nodes.push(node)
    }
  }

  function addEdges(edges: LineageEdge[]): void {
    for (const edge of edges) {
      if (!merged.edges.some(existing => existing.id === edge.id)) merged.edges.push(edge)
    }
  }

  if (olap) {
    addNodes(olap.nodes, false)
    addEdges(olap.edges)
    merged.stats = { ...olap.stats }
  }
  if (catalog) {
    addNodes(catalog.nodes, true)
    addEdges(catalog.edges)
    merged.stats = {
      etlCount: merged.stats.etlCount + catalog.stats.etlCount,
      sourceCount: merged.stats.sourceCount + catalog.stats.sourceCount,
      targetCount: merged.stats.targetCount + catalog.stats.targetCount,
      flowCount: merged.stats.flowCount + catalog.stats.flowCount,
    }
  }

  return merged
}

export async function loadLineageGraph(
  dependencies: LineageGraphQueryDependencies,
): Promise<LineageGraphLoadResult> {
  const [olapResult, catalogResult] = await Promise.allSettled([
    dependencies.loadOlap(),
    dependencies.loadCatalog(),
  ])
  const warnings: string[] = []

  const olap = olapResult.status === 'fulfilled'
    ? projectOlapLineage(olapResult.value)
    : null
  if (olapResult.status === 'rejected') {
    warnings.push(errorMessage(olapResult.reason, 'OLAP 리니지 조회 실패'))
  }

  const catalog = catalogResult.status === 'fulfilled'
    ? projectCatalogLineage(catalogResult.value)
    : null
  if (catalogResult.status === 'rejected') {
    warnings.push(errorMessage(catalogResult.reason, 'Catalog 리니지 조회 실패'))
  }

  if (!olap && !catalog) {
    throw new Error(warnings.join('\n') || '데이터 리니지 서비스를 사용할 수 없습니다.')
  }

  return {
    data: mergeLineageGraphs(olap, catalog),
    warnings,
  }
}

function defaultDependencies(): LineageGraphQueryDependencies {
  const runtimeStore = useRuntimeStore()
  return {
    loadOlap: () => olapLineageApi.getOverview(),
    loadCatalog: () => catalogLineageApi.getOverview(runtimeStore.getHeaders()),
  }
}

export function useLineageGraphQuery(
  dependencies: LineageGraphQueryDependencies = defaultDependencies(),
) {
  const data = ref<LineageGraphData>(emptyLineageGraph())
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const warnings = ref<string[]>([])
  let sequence = 0

  async function refresh(): Promise<'committed' | 'stale' | 'failed'> {
    const currentSequence = ++sequence
    isLoading.value = true
    error.value = null
    warnings.value = []

    try {
      const result = await loadLineageGraph(dependencies)
      if (currentSequence !== sequence) return 'stale'
      data.value = result.data
      warnings.value = result.warnings
      return 'committed'
    } catch (cause: unknown) {
      if (currentSequence !== sequence) return 'stale'
      error.value = errorMessage(cause, '데이터 로드 실패')
      return 'failed'
    } finally {
      if (currentSequence === sequence) isLoading.value = false
    }
  }

  return {
    data,
    isLoading,
    error,
    warnings,
    refresh,
  }
}
