import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { effectScope, ref } from 'vue'

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

function candidate(tableName, overrides = {}) {
  return {
    table_name: tableName,
    datasource: 'warehouse',
    full_table_name: tableName,
    columns: ['id'],
    sample_data: [{ id: 1 }],
    row_count: 1,
    row_count_approx: false,
    relevance_score: 0.9,
    match_reason: 'contract',
    suggested_sql: `SELECT * FROM ${tableName}`,
    ...overrides,
  }
}

function mapping(nodeId, selectedCandidate, status = 'found') {
  return {
    node_id: nodeId,
    node_name: nodeId,
    node_layer: 'KPI',
    search_query: nodeId,
    candidates: selectedCandidate ? [selectedCandidate] : [],
    selected_candidate: selectedCandidate,
    status,
  }
}

function defaultClient(overrides = {}) {
  return {
    async autoLinkDatasourceStream(_body, onEvent) {
      onEvent({ type: 'result', data: { mappings: {} } })
    },
    async confirmDatasource() {
      return { success: true }
    },
    ...overrides,
  }
}

function createWorkflow(useOntologyDatasourceMapping, overrides = {}) {
  const scope = effectScope()
  const applications = []
  const workflow = scope.run(() => useOntologyDatasourceMapping({
    nodes: overrides.nodes || ref([
      {
        id: 'node-a',
        name: 'Node A',
        label: 'KPI',
        description: 'A',
      },
    ]),
    getNodeName: nodeId => `name:${nodeId}`,
    client: overrides.client || defaultClient(),
    async applyConfirmedMapping(target) {
      applications.push(structuredClone(target))
      return overrides.applyConfirmedMapping?.(target) ?? null
    },
  }))
  assert(workflow)
  return { scope, workflow, applications }
}

try {
  const policy = await vite.ssrLoadModule(
    '/src/workflows/ontology/application/datasourceMappingWorkspace.ts',
  )
  const { useOntologyDatasourceMapping } = await vite.ssrLoadModule(
    '/src/workflows/ontology/composables/useOntologyDatasourceMapping.ts',
  )

  const sourceNodes = [{
    id: 'node-a',
    name: 'Node A',
    label: 'KPI',
    description: 'A',
  }]
  const snapshots = policy.createDatasourceMappingNodeSnapshots(sourceNodes)
  sourceNodes[0].name = 'mutated'
  assert.equal(snapshots[0].name, 'Node A')

  const initialProgress = policy.createDatasourceLinkingProgress(snapshots)
  const progressSnapshot = structuredClone(initialProgress)
  const nextProgress = policy.projectDatasourceLinkingProgress(
    initialProgress,
    {
      node_id: 'node-a',
      status: 'found',
      message: 'done',
      completed: 0,
    },
  )
  assert.deepEqual(initialProgress, progressSnapshot)
  assert.equal(nextProgress.completed, 0)
  assert.equal(nextProgress.nodeStatuses['node-a'].status, 'found')
  assert.notEqual(
    nextProgress.nodeStatuses['node-a'],
    initialProgress.nodeStatuses['node-a'],
  )

  const selected = candidate('dw.orders')
  const sourceMappings = { 'node-a': mapping('node-a', selected) }
  const mappingSnapshot = structuredClone(sourceMappings)
  const confirmed = policy.projectConfirmedDatasourceMapping(
    sourceMappings,
    { nodeId: 'node-a', candidate: selected },
  )
  assert.deepEqual(sourceMappings, mappingSnapshot)
  assert.equal(confirmed['node-a'].status, 'confirmed')
  assert.notEqual(confirmed['node-a'], sourceMappings['node-a'])
  assert.notEqual(
    confirmed['node-a'].selected_candidate,
    sourceMappings['node-a'].selected_candidate,
  )

  {
    const streams = []
    const { scope, workflow } = createWorkflow(
      useOntologyDatasourceMapping,
      {
        client: defaultClient({
          autoLinkDatasourceStream(body, onEvent, signal) {
            return new Promise((resolve, reject) => {
              const stream = { body, onEvent, signal, resolve, reject }
              streams.push(stream)
              signal.addEventListener('abort', () => {
                reject(new DOMException('aborted', 'AbortError'))
              }, { once: true })
            })
          },
        }),
      },
    )

    const first = workflow.autoLinkDataSources()
    await Promise.resolve()
    assert.equal(streams.length, 1)
    const second = workflow.autoLinkDataSources()
    await Promise.resolve()
    assert.equal(streams.length, 2)
    assert.equal(streams[0].signal.aborted, true)
    streams[0].onEvent({
      type: 'result',
      data: { mappings: { stale: mapping('stale', selected) } },
    })
    streams[1].onEvent({
      type: 'result',
      data: { mappings: { current: mapping('current', selected) } },
    })
    streams[1].resolve()
    await Promise.all([first, second])
    assert.deepEqual(Object.keys(workflow.dataSourceMappings.value), ['current'])
    assert.equal(workflow.autoLinkError.value, null)

    const third = workflow.autoLinkDataSources()
    await Promise.resolve()
    assert.equal(streams.length, 3)
    workflow.closeDataSourceMappingDialog()
    await third
    assert.equal(streams[2].signal.aborted, true)
    assert.equal(workflow.showDataSourceDialog.value, false)
    scope.stop()
  }

  {
    let confirmCalls = 0
    let applicationCalls = 0
    const target = { nodeId: 'node-a', candidate: selected }
    const { scope, workflow } = createWorkflow(
      useOntologyDatasourceMapping,
      {
        client: defaultClient({
          async confirmDatasource() {
            confirmCalls += 1
            return { success: true }
          },
        }),
        applyConfirmedMapping() {
          applicationCalls += 1
          if (applicationCalls === 1) throw new Error('projection failed')
          return 'projection warning'
        },
      },
    )
    workflow.dataSourceMappings.value = {
      'node-a': mapping('node-a', selected),
    }

    await assert.rejects(
      workflow.confirmMappingTarget(target),
      /서버 확정은 완료.*projection failed/,
    )
    assert.equal(confirmCalls, 1)
    assert.equal(workflow.dataSourceMappings.value['node-a'].status, 'found')
    const warning = await workflow.confirmMappingTarget(target)
    assert.equal(warning, 'projection warning')
    assert.equal(confirmCalls, 1)
    assert.equal(applicationCalls, 2)
    assert.equal(workflow.dataSourceMappings.value['node-a'].status, 'confirmed')
    scope.stop()
  }

  {
    const attempts = new Map()
    const candidateA = candidate('dw.a')
    const candidateB = candidate('dw.b')
    const { scope, workflow } = createWorkflow(
      useOntologyDatasourceMapping,
      {
        client: defaultClient({
          async confirmDatasource(body) {
            const table = body.candidate.table_name
            attempts.set(table, (attempts.get(table) || 0) + 1)
            if (table === 'dw.b' && attempts.get(table) === 1) {
              throw new Error('B unavailable')
            }
            return { success: true }
          },
        }),
      },
    )
    workflow.dataSourceMappings.value = {
      a: mapping('a', candidateA),
      b: mapping('b', candidateB),
    }
    workflow.openBulkDatasourceConfirmation()
    await workflow.confirmBulkDatasourceMappings()
    assert.equal(workflow.dataSourceMappings.value.a.status, 'confirmed')
    assert.equal(workflow.dataSourceMappings.value.b.status, 'found')
    assert.deepEqual(
      workflow.bulkConfirmTargets.value.map(target => target.nodeId),
      ['b'],
    )
    assert.match(workflow.bulkConfirmError.value, /B unavailable/)
    await workflow.confirmBulkDatasourceMappings()
    assert.equal(attempts.get('dw.a'), 1)
    assert.equal(attempts.get('dw.b'), 2)
    assert.equal(workflow.bulkConfirmTargets.value.length, 0)
    assert.equal(workflow.dataSourceMappings.value.b.status, 'confirmed')
    scope.stop()
  }

  {
    let capturedSignal
    const { scope, workflow } = createWorkflow(
      useOntologyDatasourceMapping,
      {
        client: defaultClient({
          autoLinkDatasourceStream(_body, _onEvent, signal) {
            capturedSignal = signal
            return new Promise((_resolve, reject) => {
              signal.addEventListener('abort', () => {
                reject(new DOMException('aborted', 'AbortError'))
              }, { once: true })
            })
          },
        }),
      },
    )
    const pending = workflow.autoLinkDataSources()
    await Promise.resolve()
    scope.stop()
    await pending
    assert.equal(capturedSignal.aborted, true)
  }

  console.log(
    'Ontology datasource mapping workspace: immutable progress + stale/abort + application-only retry + bulk failed-only retry passed',
  )
} finally {
  await vite.close()
}
