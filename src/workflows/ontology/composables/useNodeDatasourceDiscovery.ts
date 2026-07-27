import {
  objectExplorerApi,
  type NodeSearchCandidate,
} from '@/domains/ontology'
import {
  text2sqlApi,
  type AskResponse,
  type DirectSqlResponse,
  type Text2SqlColumnInfo,
} from '@/domains/text2sql'
import {
  computed,
  onScopeDispose,
  ref,
  shallowRef,
  type Ref,
} from 'vue'
import {
  createManualNodeDatasourceCandidate,
  createNodeDatasourceProbeRequest,
  createNodeDatasourceQuery,
  createSelectedSearchCandidate,
  projectNodeDatasourceCandidates,
  projectNodeDatasourceProbe,
  projectNodeDatasourceProbeFailure,
  toNodeDatasourceRows,
  type NodeDatasourceDiscoveryNode,
} from '../application/nodeDatasourceDiscovery'
import {
  OBJECT_TYPE_SOURCE,
  useNodeDataSourceCatalog,
  type NodeDataSourceCatalogClient,
} from './useNodeDataSourceCatalog'
import {
  createDatasourceConfirmationTarget,
  type DatasourceConfirmationTarget,
} from '../application/datasourceConfirmation'

interface NodeDatasourceDiscoveryDependencies {
  ask: (
    question: string,
    datasource: string,
    limit: number,
    signal: AbortSignal,
  ) => Promise<AskResponse>
  directSql: (
    request: {
      sql: string
      datasource: string
      max_sql_seconds?: number
      format_with_ai?: boolean
    },
    signal: AbortSignal,
  ) => Promise<DirectSqlResponse>
  getTableColumns: (
    datasource: string,
    tableName: string,
    schema: string,
    signal: AbortSignal,
  ) => Promise<Text2SqlColumnInfo[]>
  getNodeSampleData: (
    nodeId: string,
    limit: number,
    signal: AbortSignal,
  ) => Promise<{
    data?: {
      data?: unknown[]
      rows?: unknown[]
      columns?: string[]
    }
  }>
}

interface UseNodeDatasourceDiscoveryInput<
  TNode extends NodeDatasourceDiscoveryNode,
> {
  nodes: Ref<TNode[]>
  commitMapping: (
    target: DatasourceConfirmationTarget,
  ) => Promise<string | null>
  onConfirmed: (
    nodeId: string,
    warning: string | null,
  ) => void
  selectedMappingNodeId?: Ref<string | null>
  catalogClient?: NodeDataSourceCatalogClient
  dependencies?: Partial<NodeDatasourceDiscoveryDependencies>
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError'
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback
}

export function useNodeDatasourceDiscovery<
  TNode extends NodeDatasourceDiscoveryNode,
>(input: UseNodeDatasourceDiscoveryInput<TNode>) {
  const dependencies: NodeDatasourceDiscoveryDependencies = {
    ask: (question, datasource, limit, signal) =>
      text2sqlApi.ask(question, datasource, limit, signal),
    directSql: (request, signal) =>
      text2sqlApi.directSql(request, signal),
    getTableColumns: (datasource, tableName, schema, signal) =>
      text2sqlApi.getTableColumns(datasource, tableName, schema, signal),
    getNodeSampleData: (nodeId, limit, signal) =>
      objectExplorerApi.getNodeSampleData(nodeId, limit, signal),
    ...input.dependencies,
  }
  const catalog = useNodeDataSourceCatalog(input.catalogClient)

  const showNodeDataSourceDialog = ref(false)
  const nodeDatasourceConfirmPending = ref(false)
  const nodeDatasourceConfirmError = ref<string | null>(null)
  const nodeDatasourceConfirmTarget =
    shallowRef<DatasourceConfirmationTarget | null>(null)
  const currentNodeForDataSource = shallowRef<TNode | null>(null)
  const nodeDataSourceTab = ref<'search' | 'manual'>('search')
  const nodeSearchQuery = ref('')
  const nodeSearchLoading = ref(false)
  const nodeSearchStatus = ref('')
  const nodeSearchError = ref<string | null>(null)
  const nodeSearchResults = ref<NodeSearchCandidate[]>([])
  const selectedSearchResult = ref<number | null>(null)
  const selectedManualTable = ref<string | null>(null)
  const selectedMappingNodeId =
    input.selectedMappingNodeId ?? ref<string | null>(null)
  const showSampleDataDialog = ref(false)
  const sampleDataLoading = ref(false)
  const sampleData = ref<Array<Record<string, unknown>>>([])
  const sampleDataError = ref<string | null>(null)

  let searchSequence = 0
  let searchController: AbortController | null = null
  let sampleSequence = 0
  let sampleController: AbortController | null = null
  let confirmController: AbortController | null = null

  const currentTargetId = computed(
    () => currentNodeForDataSource.value?.id || null,
  )

  function invalidateSearch(): void {
    searchSequence += 1
    searchController?.abort()
    searchController = null
    nodeSearchLoading.value = false
  }

  function invalidateSample(): void {
    sampleSequence += 1
    sampleController?.abort()
    sampleController = null
    sampleDataLoading.value = false
  }

  async function openNodeDataSourceDialog(nodeId: string): Promise<boolean> {
    const node = input.nodes.value.find(candidate => candidate.id === nodeId)
    if (!node) return false

    invalidateSearch()
    invalidateSample()
    currentNodeForDataSource.value = { ...node }
    showNodeDataSourceDialog.value = true
    nodeDatasourceConfirmTarget.value = null
    nodeDatasourceConfirmError.value = null
    nodeSearchError.value = null
    nodeDataSourceTab.value = 'search'
    nodeSearchQuery.value = createNodeDatasourceQuery(node)
    nodeSearchStatus.value = ''
    nodeSearchResults.value = []
    selectedSearchResult.value = null
    selectedManualTable.value = null
    await catalog.loadDatasources()
    return true
  }

  function closeNodeDataSourceDialog(): void {
    if (nodeDatasourceConfirmPending.value) return
    invalidateSearch()
    invalidateSample()
    confirmController?.abort()
    confirmController = null
    showNodeDataSourceDialog.value = false
    currentNodeForDataSource.value = null
    nodeDatasourceConfirmTarget.value = null
    nodeDatasourceConfirmError.value = null
    nodeSearchError.value = null
  }

  function isCurrentSearch(
    sequence: number,
    controller: AbortController,
    targetId: string,
  ): boolean {
    return (
      sequence === searchSequence
      && searchController === controller
      && !controller.signal.aborted
      && showNodeDataSourceDialog.value
      && currentTargetId.value === targetId
    )
  }

  async function probeSearchResults(
    sequence: number,
    controller: AbortController,
    targetId: string,
    candidates: readonly NodeSearchCandidate[],
  ): Promise<void> {
    const concurrency = 2
    for (let index = 0; index < candidates.length; index += concurrency) {
      if (!isCurrentSearch(sequence, controller, targetId)) return
      const batch = candidates.slice(index, index + concurrency)
      const projected = await Promise.all(batch.map(async candidate => {
        try {
          const response = await dependencies.directSql(
            createNodeDatasourceProbeRequest(candidate),
            controller.signal,
          )
          return projectNodeDatasourceProbe(candidate, response)
        } catch (error: unknown) {
          if (controller.signal.aborted || isAbortError(error)) throw error
          return projectNodeDatasourceProbeFailure(candidate)
        }
      }))
      if (!isCurrentSearch(sequence, controller, targetId)) return
      nodeSearchResults.value = [
        ...nodeSearchResults.value.slice(0, index),
        ...projected,
        ...nodeSearchResults.value.slice(index + projected.length),
      ]
    }
  }

  async function searchNodeDataSource(): Promise<void> {
    const target = currentNodeForDataSource.value
    const question = nodeSearchQuery.value.trim()
    if (!target || !question) return

    if (
      !catalog.searchDatasource.value
      && catalog.availableDatasources.value.length === 1
    ) {
      catalog.searchDatasource.value =
        catalog.availableDatasources.value[0]
    }
    const datasource = catalog.searchDatasource.value
    if (!datasource) {
      nodeSearchStatus.value = ''
      nodeSearchError.value = '데이터소스를 선택해주세요.'
      return
    }

    const sequence = ++searchSequence
    searchController?.abort()
    const controller = new AbortController()
    searchController = controller
    const targetId = target.id
    nodeSearchLoading.value = true
    nodeSearchStatus.value = '🤖 AI가 SQL 쿼리 생성 중...'
    nodeSearchError.value = null
    nodeSearchResults.value = []
    selectedSearchResult.value = null

    try {
      const response = await dependencies.ask(
        question,
        datasource,
        10,
        controller.signal,
      )
      if (!isCurrentSearch(sequence, controller, targetId)) return
      const candidates = projectNodeDatasourceCandidates(response, datasource)
      if (candidates.length === 0) {
        nodeSearchStatus.value =
          '⚠️ Text2SQL 응답에 사용 테이블 근거가 없습니다'
        return
      }
      nodeSearchResults.value = candidates
      nodeSearchStatus.value = ''
      nodeSearchLoading.value = false
      await probeSearchResults(
        sequence,
        controller,
        targetId,
        candidates,
      )
    } catch (error: unknown) {
      if (!isCurrentSearch(sequence, controller, targetId) || isAbortError(error)) {
        return
      }
      nodeSearchStatus.value = ''
      nodeSearchError.value =
        `검색 중 오류가 발생했습니다: ${errorMessage(error, '알 수 없는 오류')}`
    } finally {
      if (isCurrentSearch(sequence, controller, targetId)) {
        nodeSearchLoading.value = false
      }
      if (
        sequence === searchSequence
        && searchController === controller
      ) {
        searchController = null
      }
    }
  }

  async function handleManualSourceChange(): Promise<void> {
    selectedManualTable.value = null
    await catalog.loadSchemasForDatasource(catalog.manualSource.value)
  }

  async function handleSchemaChange(): Promise<void> {
    selectedManualTable.value = null
    if (
      catalog.manualSource.value
      && catalog.manualSource.value !== OBJECT_TYPE_SOURCE
      && catalog.selectedSchema.value
    ) {
      await catalog.loadTablesForSchema(
        catalog.manualSource.value,
        catalog.selectedSchema.value,
      )
    }
  }

  function selectSearchResult(result: NodeSearchCandidate): void {
    selectedSearchResult.value = nodeSearchResults.value.indexOf(result)
  }

  async function loadSampleData(candidate: NodeSearchCandidate): Promise<void> {
    const sequence = ++sampleSequence
    sampleController?.abort()
    const controller = new AbortController()
    sampleController = controller
    sampleDataLoading.value = true
    sampleData.value = []
    sampleDataError.value = null
    showSampleDataDialog.value = true

    try {
      if (candidate.sample_data.length > 0) {
        sampleData.value = candidate.sample_data.map(row => ({ ...row }))
      } else if (candidate.table_name && candidate.datasource) {
        const request = createNodeDatasourceProbeRequest(candidate)
        const response = await dependencies.directSql(
          {
            ...request,
            sql: request.sql.replace(/LIMIT 11$/, 'LIMIT 10'),
            max_sql_seconds: 30,
          },
          controller.signal,
        )
        if (sequence !== sampleSequence || controller.signal.aborted) return
        sampleData.value = toNodeDatasourceRows(
          response.rows,
          response.columns,
        )
      } else {
        const nodeId =
          currentTargetId.value || selectedMappingNodeId.value || ''
        if (!nodeId) throw new Error('샘플을 조회할 노드가 없습니다.')
        const response = await dependencies.getNodeSampleData(
          nodeId,
          10,
          controller.signal,
        )
        if (sequence !== sampleSequence || controller.signal.aborted) return
        const nested = response.data || {}
        sampleData.value = toNodeDatasourceRows(
          nested.data || nested.rows || [],
          nested.columns || [],
        )
      }
    } catch (error: unknown) {
      if (sequence !== sampleSequence || isAbortError(error)) return
      sampleDataError.value = errorMessage(
        error,
        '샘플 데이터를 조회하지 못했습니다.',
      )
    } finally {
      if (sequence === sampleSequence) {
        sampleDataLoading.value = false
        sampleController = null
      }
    }
  }

  function previewSearchResult(result: NodeSearchCandidate): void {
    if (currentTargetId.value) {
      selectedMappingNodeId.value = currentTargetId.value
    }
    void loadSampleData(result)
  }

  function closeSampleDataDialog(): void {
    invalidateSample()
    showSampleDataDialog.value = false
    sampleData.value = []
    sampleDataError.value = null
  }

  async function resolveConfirmationTarget(
    signal: AbortSignal,
  ): Promise<DatasourceConfirmationTarget | null> {
    const node = currentNodeForDataSource.value
    if (!node) return null
    if (nodeDatasourceConfirmTarget.value) {
      return nodeDatasourceConfirmTarget.value
    }

    if (
      nodeDataSourceTab.value === 'search'
      && selectedSearchResult.value !== null
    ) {
      const candidate = nodeSearchResults.value[selectedSearchResult.value]
      return candidate
        ? createDatasourceConfirmationTarget(
            node.id,
            createSelectedSearchCandidate(
              candidate,
              catalog.searchDatasource.value,
            ),
          )
        : null
    }

    if (
      nodeDataSourceTab.value === 'manual'
      && selectedManualTable.value
    ) {
      const table = catalog.availableTables.value.find(
        candidate => candidate.fullName === selectedManualTable.value,
      )
      if (!table) return null
      let columns: string[] = []
      if (table.sourceKind === 'table') {
        const result = await dependencies.getTableColumns(
          table.executionDatasource,
          table.name,
          table.schema || 'public',
          signal,
        )
        columns = result.map(column => column.name)
      }
      return createDatasourceConfirmationTarget(
        node.id,
        createManualNodeDatasourceCandidate(table, columns),
      )
    }
    return null
  }

  async function confirmNodeDataSource(): Promise<void> {
    if (
      !currentNodeForDataSource.value
      || nodeDatasourceConfirmPending.value
    ) return

    confirmController?.abort()
    const controller = new AbortController()
    confirmController = controller
    nodeDatasourceConfirmPending.value = true
    nodeDatasourceConfirmError.value = null
    try {
      const target = await resolveConfirmationTarget(controller.signal)
      if (!target) {
        nodeDatasourceConfirmError.value =
          '데이터 소스를 선택해주세요.'
        return
      }
      nodeDatasourceConfirmTarget.value = target
      const warning = await input.commitMapping(target)
      if (controller.signal.aborted) return
      input.onConfirmed(target.nodeId, warning)
      nodeDatasourceConfirmPending.value = false
      closeNodeDataSourceDialog()
    } catch (error: unknown) {
      if (controller.signal.aborted || isAbortError(error)) return
      nodeDatasourceConfirmError.value = errorMessage(
        error,
        '데이터 소스 확정에 실패했습니다.',
      )
    } finally {
      nodeDatasourceConfirmPending.value = false
      if (confirmController === controller) confirmController = null
    }
  }

  onScopeDispose(() => {
    invalidateSearch()
    invalidateSample()
    confirmController?.abort()
  })

  return {
    ...catalog,
    showNodeDataSourceDialog,
    nodeDatasourceConfirmPending,
    nodeDatasourceConfirmError,
    nodeDatasourceConfirmTarget,
    currentNodeForDataSource,
    nodeDataSourceTab,
    nodeSearchQuery,
    nodeSearchLoading,
    nodeSearchStatus,
    nodeSearchError,
    nodeSearchResults,
    selectedSearchResult,
    selectedManualTable,
    selectedMappingNodeId,
    showSampleDataDialog,
    sampleDataLoading,
    sampleData,
    sampleDataError,
    openNodeDataSourceDialog,
    closeNodeDataSourceDialog,
    searchNodeDataSource,
    handleManualSourceChange,
    handleSchemaChange,
    selectSearchResult,
    previewSearchResult,
    loadSampleData,
    closeSampleDataDialog,
    confirmNodeDataSource,
  }
}
