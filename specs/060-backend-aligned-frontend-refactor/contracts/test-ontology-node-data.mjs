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

function ontologyResult(nodeId, value) {
  return {
    nodeId,
    nodeName: nodeId,
    hasDataSource: true,
    dataSource: `warehouse.public.${nodeId}`,
    columns: ['day', 'amount'],
    rows: [{ day: '2026-07-23', amount: value }],
    rowCount: 1,
    timeColumns: ['day'],
    numericColumns: ['amount'],
    chartRecommendation: {
      type: 'line',
      xAxis: 'day',
      yAxis: ['amount'],
    },
  }
}

try {
  const retrieval = await vite.ssrLoadModule(
    '/src/workflows/ontology/application/nodeDataRetrieval.ts',
  )
  const { useOntologyNodeData } = await vite.ssrLoadModule(
    '/src/workflows/ontology/composables/useOntologyNodeData.ts',
  )

  const metadata = {
    datasource: 'warehouse',
    sql: 'SELECT day, amount FROM public.sales;',
    columns: ['day', 'amount'],
  }
  const target = retrieval.createOntologyNodeDataTarget({
    id: 'sales',
    name: 'Sales',
    label: 'Measure',
    dataSource: 'warehouse.public.sales',
    dataSourceSchema: metadata,
  })
  metadata.columns.push('mutated')
  assert.deepEqual(target.dataSourceSchema.columns, ['day', 'amount'])
  assert.equal(
    retrieval.buildOntologyNodeDataQuery(
      { region: 'east', empty: '', count: 0, disabled: null },
      true,
    ),
    'limit=500&filter_region=east&filter_count=0&apply_business_day_filter=true',
  )
  assert.deepEqual(retrieval.buildText2SqlNodeDataRequest(target), {
    sql: 'SELECT day, amount FROM public.sales LIMIT 200',
    datasource: 'warehouse',
  })
  assert.equal(
    retrieval.buildText2SqlNodeDataRequest({
      ...target,
      dataSourceSchema: {
        ...target.dataSourceSchema,
        sql: 'SELECT * FROM public.sales LIMIT 50 OFFSET 5;',
      },
    }).sql,
    'SELECT * FROM public.sales LIMIT 50 OFFSET 5',
  )
  assert.throws(
    () => retrieval.buildText2SqlNodeDataRequest({
      ...target,
      dataSource: 'public.sales',
      dataSourceSchema: null,
    }),
    /데이터소스/,
  )

  const raceRequests = []
  const raceDeferred = new Map()
  const raceGateway = {
    getNodeData(nodeId, query, signal) {
      const pending = deferred()
      raceDeferred.set(nodeId, pending)
      raceRequests.push({ nodeId, query, signal })
      return pending.promise
    },
    async directSql() {
      throw new Error('not used')
    },
  }
  const raceTargets = {
    a: {
      id: 'a',
      name: 'A',
      label: 'Measure',
      dataSource: 'warehouse.public.a',
      dataSourceSchema: { datasource: 'warehouse' },
    },
    b: {
      id: 'b',
      name: 'B',
      label: 'Measure',
      dataSource: 'warehouse.public.b',
      dataSourceSchema: { datasource: 'warehouse' },
    },
  }
  const raceScope = effectScope()
  const raceWorkflow = raceScope.run(() => useOntologyNodeData({
    resolveTarget: nodeId => raceTargets[nodeId] ?? null,
    getEffectiveFilters: () => ({}),
    businessDayFilterEnabled: ref(false),
    gateway: raceGateway,
  }))
  assert(raceWorkflow)
  const loadA = raceWorkflow.load('a')
  await Promise.resolve()
  const loadB = raceWorkflow.load('b')
  await Promise.resolve()
  assert.equal(raceRequests[0].signal.aborted, true)
  raceDeferred.get('b').resolve(ontologyResult('b', 20))
  await loadB
  assert.equal(raceWorkflow.nodeDataResult.value.nodeId, 'b')
  raceDeferred.get('a').resolve(ontologyResult('a', 10))
  await loadA
  assert.equal(
    raceWorkflow.nodeDataResult.value.nodeId,
    'b',
    'A late response must not overwrite B',
  )
  raceScope.stop()

  let filters = { region: 'east' }
  const businessDay = ref(false)
  const ontologyQueries = []
  let ontologyAttempt = 0
  const retryGateway = {
    async getNodeData(nodeId, query, signal) {
      ontologyQueries.push({ nodeId, query, signal })
      ontologyAttempt += 1
      if (ontologyAttempt === 1) throw new Error('ontology unavailable')
      return ontologyResult(nodeId, 30)
    },
    async directSql() {
      throw new Error('not used')
    },
  }
  const retryScope = effectScope()
  const retryWorkflow = retryScope.run(() => useOntologyNodeData({
    resolveTarget: nodeId => raceTargets[nodeId] ?? null,
    getEffectiveFilters: () => filters,
    businessDayFilterEnabled: businessDay,
    gateway: retryGateway,
  }))
  await retryWorkflow.load('a')
  assert.equal(retryWorkflow.nodeDataState.value.phase, 'failure')
  assert.equal(retryWorkflow.text2SqlFallbackAvailable.value, true)
  filters = { region: 'west' }
  businessDay.value = true
  await retryWorkflow.retry()
  assert.equal(retryWorkflow.nodeDataState.value.phase, 'result')
  assert.equal(ontologyQueries[0].query, ontologyQueries[1].query)
  assert.match(ontologyQueries[1].query, /filter_region=east/)
  assert.doesNotMatch(ontologyQueries[1].query, /business_day/)
  retryScope.stop()

  const text2SqlRequests = []
  let text2SqlAttempt = 0
  const fallbackGateway = {
    async getNodeData(nodeId) {
      return {
        ...ontologyResult(nodeId, 0),
        hasDataSource: false,
        rows: [],
        rowCount: 0,
        message: 'ontology mapping unavailable',
      }
    },
    async directSql(request, signal) {
      text2SqlRequests.push({ request: { ...request }, signal })
      text2SqlAttempt += 1
      if (text2SqlAttempt === 1) throw new Error('direct SQL unavailable')
      return {
        status: 'success',
        columns: ['day', 'amount'],
        rows: [['2026-07-23', 40]],
      }
    },
  }
  const fallbackScope = effectScope()
  const fallbackWorkflow = fallbackScope.run(() => useOntologyNodeData({
    resolveTarget: nodeId => raceTargets[nodeId] ?? null,
    getEffectiveFilters: () => ({}),
    businessDayFilterEnabled: ref(false),
    gateway: fallbackGateway,
  }))
  await fallbackWorkflow.load('a')
  assert.equal(fallbackWorkflow.nodeDataState.value.phase, 'unavailable')
  await fallbackWorkflow.loadViaText2Sql()
  assert.equal(fallbackWorkflow.nodeDataState.value.phase, 'failure')
  await fallbackWorkflow.retry()
  assert.equal(fallbackWorkflow.nodeDataState.value.phase, 'result')
  assert.deepEqual(text2SqlRequests[0].request, text2SqlRequests[1].request)
  assert.equal(fallbackWorkflow.nodeDataResult.value.rows[0].amount, 40)
  fallbackScope.stop()

  const resetPending = deferred()
  let resetSignal
  const resetScope = effectScope()
  const resetWorkflow = resetScope.run(() => useOntologyNodeData({
    resolveTarget: nodeId => raceTargets[nodeId] ?? null,
    getEffectiveFilters: () => ({}),
    businessDayFilterEnabled: ref(false),
    gateway: {
      getNodeData(_nodeId, _query, signal) {
        resetSignal = signal
        return resetPending.promise
      },
      async directSql() {
        throw new Error('not used')
      },
    },
  }))
  const resetLoad = resetWorkflow.load('a')
  await Promise.resolve()
  resetWorkflow.reset()
  assert.equal(resetSignal.aborted, true)
  resetPending.resolve(ontologyResult('a', 50))
  await resetLoad
  assert.equal(resetWorkflow.nodeDataState.value.phase, 'idle')
  assert.equal(resetWorkflow.nodeDataResult.value, null)
  resetScope.stop()

  console.log('Ontology node-data retrieval contract passed')
} finally {
  await vite.close()
}
