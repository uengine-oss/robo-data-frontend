import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { effectScope, ref } from 'vue'

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function askResponse(tables, {
  columns = ['id', 'amount'],
  vectorMatches = [],
  sql = 'SELECT id, amount FROM public.orders',
} = {}) {
  return {
    sql,
    table: {
      columns,
      rows: [],
      row_count: 0,
    },
    charts: [],
    provenance: {
      tables,
      columns,
      neo4j_paths: [],
      vector_matches: vectorMatches,
      prompt_snapshot_id: 'node-datasource-contract',
    },
    perf: {
      embedding_ms: 1,
      graph_search_ms: 1,
      llm_ms: 1,
      sql_ms: 1,
      total_ms: 4,
    },
    warnings: null,
  }
}

function directSqlResponse(rows, columns = ['id', 'amount']) {
  return {
    status: 'success',
    sql: '',
    validated_sql: null,
    columns,
    rows,
    row_count: rows.length,
    execution_time_ms: 1,
  }
}

function catalogClient(datasources = ['warehouse']) {
  return {
    async getDatasources() {
      return [...datasources]
    },
    async getDatasourceSchemas() {
      return ['public']
    },
    async getSchemaTables() {
      return []
    },
    async getMetaObjectTypes() {
      return []
    },
  }
}

function createWorkflow(useNodeDatasourceDiscovery, overrides = {}) {
  const scope = effectScope()
  const confirmed = []
  const commits = []
  const workflow = scope.run(() => useNodeDatasourceDiscovery({
    nodes: overrides.nodes || ref([
      { id: 'node-a', name: 'Orders', layer: 'Measure' },
      { id: 'node-b', name: 'Revenue', layer: 'KPI' },
    ]),
    catalogClient: overrides.catalogClient || catalogClient(),
    dependencies: overrides.dependencies,
    async commitMapping(target) {
      commits.push(structuredClone(target))
      return overrides.commitMapping
        ? overrides.commitMapping(target)
        : null
    },
    onConfirmed(nodeId, warning) {
      confirmed.push({ nodeId, warning })
      overrides.onConfirmed?.(nodeId, warning)
    },
  }))
  assert(workflow)
  return { scope, workflow, confirmed, commits }
}

try {
  const discovery = await vite.ssrLoadModule(
    '/src/workflows/ontology/application/nodeDatasourceDiscovery.ts',
  )
  const { useNodeDatasourceDiscovery } = await vite.ssrLoadModule(
    '/src/workflows/ontology/composables/useNodeDatasourceDiscovery.ts',
  )

  const measureQuery = discovery.createNodeDatasourceQuery({
    id: 'measure',
    name: ' Orders ',
    layer: 'Measure',
  })
  const kpiQuery = discovery.createNodeDatasourceQuery({
    id: 'kpi',
    name: 'Orders',
    layer: 'KPI',
  })
  assert(measureQuery.startsWith('Orders '))
  assert(kpiQuery.startsWith('Orders '))
  assert.notEqual(measureQuery, kpiQuery)
  assert.equal(
    discovery.normalizeDatasourceTableRef(
      '"warehouse"."public"."orders"',
      'warehouse',
    ),
    'public.orders',
  )
  assert.equal(
    discovery.normalizeDatasourceTableRef('analytics.orders', 'warehouse'),
    'analytics.orders',
  )

  const ask = askResponse(
    ['warehouse.public.orders', 'warehouse.public.order_items'],
    {
      columns: [' id ', 'amount', 'id'],
      vectorMatches: [
        { node: 'Table:warehouse.public.orders', score: 0.91 },
        { node: 'Table:order_items', score: 0.77 },
      ],
    },
  )
  const askSnapshot = structuredClone(ask)
  const candidates = discovery.projectNodeDatasourceCandidates(ask, 'warehouse')
  assert.deepEqual(ask, askSnapshot, 'Candidate projection mutated the ask response')
  assert.deepEqual(candidates.map(candidate => candidate.relevance_score), [0.91, 0.77])
  assert.deepEqual(candidates[0].columns, ['id', 'amount'])
  assert.equal(candidates[0].datasource, 'warehouse')
  assert.equal(
    discovery.createNodeDatasourceProbeRequest(candidates[0]).sql,
    'SELECT * FROM public.orders LIMIT 11',
  )

  const elevenRows = Array.from({ length: 11 }, (_, index) => [index + 1, index * 10])
  const candidateSnapshot = structuredClone(candidates[0])
  const probed = discovery.projectNodeDatasourceProbe(
    candidates[0],
    directSqlResponse(elevenRows),
  )
  assert.deepEqual(candidates[0], candidateSnapshot, 'Probe projection mutated its candidate')
  assert.equal(probed.sample_data.length, 10)
  assert.equal(probed.row_count, 10)
  assert.equal(probed.row_count_approx, true)
  assert.deepEqual(probed.sample_data[0], { id: 1, amount: 0 })
  const failedProbe = discovery.projectNodeDatasourceProbeFailure(probed)
  assert.equal(failedProbe.row_count, -1)
  assert.deepEqual(failedProbe.sample_data, probed.sample_data)
  assert.notEqual(failedProbe.sample_data[0], probed.sample_data[0])

  const physical = {
    name: 'orders',
    schema: 'public',
    executionDatasource: 'warehouse',
    fullName: '"warehouse"."public"."orders"',
    sourceKind: 'table',
  }
  const manual = discovery.createManualNodeDatasourceCandidate(
    physical,
    [' id ', 'amount', 'id'],
  )
  assert.equal(manual.table_name, 'warehouse.public.orders')
  assert.deepEqual(manual.columns, ['id', 'amount'])
  const objectType = discovery.createManualNodeDatasourceCandidate({
    name: 'Order',
    schema: 'dw',
    executionDatasource: 'warehouse',
    fullName: '"mv_order"',
    materializedView: 'mv_order',
    sourceKind: 'object-type',
  })
  assert.equal(objectType.table_name, 'mv_order')
  assert.equal(objectType.materializedView, 'mv_order')
  const selected = discovery.createSelectedSearchCandidate(
    { ...manual, datasource: '' },
    'fallback',
  )
  assert.equal(selected.datasource, 'fallback')
  assert.notEqual(selected.columns, manual.columns)

  const raceAsks = new Map()
  const raceSignals = new Map()
  const race = createWorkflow(useNodeDatasourceDiscovery, {
    dependencies: {
      ask(question, _datasource, _limit, signal) {
        const pending = deferred()
        raceAsks.set(question, pending)
        raceSignals.set(question, signal)
        return pending.promise
      },
      async directSql(request) {
        return directSqlResponse([[request.sql, 1]])
      },
    },
  })
  await race.workflow.openNodeDataSourceDialog('node-a')
  race.workflow.nodeSearchQuery.value = 'search-a'
  const searchA = race.workflow.searchNodeDataSource()
  await Promise.resolve()
  await race.workflow.openNodeDataSourceDialog('node-b')
  assert.equal(raceSignals.get('search-a').aborted, true)
  race.workflow.nodeSearchQuery.value = 'search-b'
  const searchB = race.workflow.searchNodeDataSource()
  await Promise.resolve()
  raceAsks.get('search-b').resolve(askResponse(['warehouse.public.b']))
  await searchB
  assert.equal(race.workflow.currentNodeForDataSource.value.id, 'node-b')
  assert.equal(race.workflow.nodeSearchResults.value[0].table_name, 'warehouse.public.b')
  raceAsks.get('search-a').resolve(askResponse(['warehouse.public.a']))
  await searchA
  assert.equal(
    race.workflow.nodeSearchResults.value[0].table_name,
    'warehouse.public.b',
    'A late search response overwrote the B dialog',
  )
  race.scope.stop()

  let searchAttempt = 0
  const partial = createWorkflow(useNodeDatasourceDiscovery, {
    dependencies: {
      async ask() {
        searchAttempt += 1
        if (searchAttempt === 1) throw new Error('temporary search outage')
        if (searchAttempt === 2) return askResponse([])
        return askResponse([
          'warehouse.public.good',
          'warehouse.public.bad',
        ])
      },
      async directSql(request) {
        if (request.sql.includes('.bad')) throw new Error('probe unavailable')
        return directSqlResponse([[1, 10]])
      },
    },
  })
  await partial.workflow.openNodeDataSourceDialog('node-a')
  await partial.workflow.searchNodeDataSource()
  assert.match(partial.workflow.nodeSearchError.value, /temporary search outage/)
  await partial.workflow.searchNodeDataSource()
  assert.equal(partial.workflow.nodeSearchError.value, null)
  assert.notEqual(partial.workflow.nodeSearchStatus.value, '')
  await partial.workflow.searchNodeDataSource()
  assert.deepEqual(
    partial.workflow.nodeSearchResults.value.map(candidate => candidate.row_count),
    [1, -1],
  )
  partial.scope.stop()

  const closePending = deferred()
  let closeSignal
  const closing = createWorkflow(useNodeDatasourceDiscovery, {
    dependencies: {
      ask(_question, _datasource, _limit, signal) {
        closeSignal = signal
        return closePending.promise
      },
    },
  })
  await closing.workflow.openNodeDataSourceDialog('node-a')
  const closingSearch = closing.workflow.searchNodeDataSource()
  await Promise.resolve()
  closing.workflow.closeNodeDataSourceDialog()
  assert.equal(closeSignal.aborted, true)
  closePending.resolve(askResponse(['warehouse.public.late']))
  await closingSearch
  assert.equal(closing.workflow.showNodeDataSourceDialog.value, false)
  assert.deepEqual(closing.workflow.nodeSearchResults.value, [])
  closing.scope.stop()

  let sampleAttempt = 0
  const sampleSignals = []
  const samples = createWorkflow(useNodeDatasourceDiscovery, {
    dependencies: {
      async directSql(request, signal) {
        sampleSignals.push({ request: structuredClone(request), signal })
        sampleAttempt += 1
        if (sampleAttempt === 1) throw new Error('sample unavailable')
        return directSqlResponse([[7, 70]])
      },
    },
  })
  const localSample = {
    ...manual,
    sample_data: [{ id: 5, amount: 50 }],
  }
  await samples.workflow.loadSampleData(localSample)
  assert.deepEqual(samples.workflow.sampleData.value, [{ id: 5, amount: 50 }])
  assert.equal(sampleSignals.length, 0)
  const remoteSample = { ...manual, sample_data: [] }
  await samples.workflow.loadSampleData(remoteSample)
  assert.match(samples.workflow.sampleDataError.value, /sample unavailable/)
  await samples.workflow.loadSampleData(remoteSample)
  assert.deepEqual(samples.workflow.sampleData.value, [{ id: 7, amount: 70 }])
  assert.match(sampleSignals[0].request.sql, /LIMIT 10$/)
  samples.workflow.closeSampleDataDialog()
  samples.scope.stop()

  let nodeSampleSignal
  const nodeSamplePending = deferred()
  const nodeSample = createWorkflow(useNodeDatasourceDiscovery, {
    dependencies: {
      getNodeSampleData(_nodeId, _limit, signal) {
        nodeSampleSignal = signal
        return nodeSamplePending.promise
      },
    },
  })
  nodeSample.workflow.selectedMappingNodeId.value = 'node-a'
  const loadingNodeSample = nodeSample.workflow.loadSampleData({
    table_name: '',
    columns: [],
    sample_data: [],
    row_count: null,
    row_count_approx: false,
    relevance_score: null,
    match_reason: '',
    suggested_sql: '',
  })
  await Promise.resolve()
  nodeSample.scope.stop()
  assert.equal(nodeSampleSignal.aborted, true)
  nodeSamplePending.resolve({
    data: { columns: ['id'], rows: [[99]] },
  })
  await loadingNodeSample

  let metadataAttempt = 0
  const metadataFailure = createWorkflow(useNodeDatasourceDiscovery, {
    dependencies: {
      async getTableColumns() {
        metadataAttempt += 1
        if (metadataAttempt === 1) throw new Error('metadata unavailable')
        return [{
          name: 'id',
          table_name: 'orders',
          dtype: 'integer',
          nullable: false,
          description: '',
        }]
      },
    },
  })
  await metadataFailure.workflow.openNodeDataSourceDialog('node-a')
  metadataFailure.workflow.nodeDataSourceTab.value = 'manual'
  metadataFailure.workflow.availableTables.value = [physical]
  metadataFailure.workflow.selectedManualTable.value = physical.fullName
  await metadataFailure.workflow.confirmNodeDataSource()
  assert.match(
    metadataFailure.workflow.nodeDatasourceConfirmError.value,
    /metadata unavailable/,
  )
  assert.equal(metadataFailure.commits.length, 0)
  await metadataFailure.workflow.confirmNodeDataSource()
  assert.equal(metadataFailure.commits.length, 1)
  assert.deepEqual(metadataFailure.commits[0].candidate.columns, ['id'])
  assert.deepEqual(metadataFailure.confirmed, [{ nodeId: 'node-a', warning: null }])
  metadataFailure.scope.stop()

  let commitAttempt = 0
  let columnCalls = 0
  const exactRetry = createWorkflow(useNodeDatasourceDiscovery, {
    dependencies: {
      async getTableColumns() {
        columnCalls += 1
        return [{
          name: 'id',
          table_name: 'orders',
          dtype: 'integer',
          nullable: false,
          description: '',
        }]
      },
    },
    async commitMapping() {
      commitAttempt += 1
      if (commitAttempt === 1) throw new Error('confirmation unavailable')
      return 'schema warning'
    },
  })
  await exactRetry.workflow.openNodeDataSourceDialog('node-a')
  exactRetry.workflow.nodeDataSourceTab.value = 'manual'
  exactRetry.workflow.availableTables.value = [physical]
  exactRetry.workflow.selectedManualTable.value = physical.fullName
  await exactRetry.workflow.confirmNodeDataSource()
  assert.match(
    exactRetry.workflow.nodeDatasourceConfirmError.value,
    /confirmation unavailable/,
  )
  assert(exactRetry.workflow.nodeDatasourceConfirmTarget.value)
  exactRetry.workflow.availableTables.value = [{
    ...physical,
    name: 'mutated',
    fullName: '"warehouse"."public"."mutated"',
  }]
  exactRetry.workflow.selectedManualTable.value =
    '"warehouse"."public"."mutated"'
  await exactRetry.workflow.confirmNodeDataSource()
  assert.equal(columnCalls, 1)
  assert.deepEqual(exactRetry.commits[0], exactRetry.commits[1])
  assert.deepEqual(exactRetry.confirmed, [{
    nodeId: 'node-a',
    warning: 'schema warning',
  }])
  assert.equal(exactRetry.workflow.showNodeDataSourceDialog.value, false)
  exactRetry.scope.stop()
  console.log('Ontology node datasource discovery lifecycle contract passed')
} finally {
  await vite.close()
}
