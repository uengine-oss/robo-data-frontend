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

const successfulResult = {
  success: true,
  target_node_id: 'sales-kpi',
  target_metric: 'sales',
  analysis_type: 'increase',
  time_range: { start: '2026-07-01', end: '2026-07-03' },
  top_causes: [],
  report: 'fixture report',
}

try {
  const lifecycle = await vite.ssrLoadModule(
    '/src/workflows/ontology/application/causalAnalysisLifecycle.ts',
  )
  const causalDomain = await vite.ssrLoadModule(
    '/src/domains/ontology/model/causalAnalysis.ts',
  )
  const { useCausalAnalysis } = await vite.ssrLoadModule(
    '/src/workflows/ontology/composables/useCausalAnalysis.ts',
  )
  const selection = {
    start: '2026-07-01',
    end: '2026-07-03',
    targetMetric: 'sales',
    analysisType: 'increase',
  }
  assert.deepEqual(lifecycle.buildCausalAnalysisRequest(selection), {
    time_range: { start: '2026-07-01', end: '2026-07-03' },
    target_metric: 'sales',
    analysis_type: 'increase',
    max_lag: 7,
  })

  const running = lifecycle.createRunningCausalAnalysisState()
  const afterChunk = lifecycle.applyCausalAnalysisProgress(running, {
    step: 'report_chunk',
    message: '첫 문단',
    detail: { index: 1 },
  })
  assert.equal(afterChunk.progress.message, '보고서 생성 중...')
  assert.equal(afterChunk.streamingReport, '첫 문단')
  const afterSecondChunk = lifecycle.applyCausalAnalysisProgress(afterChunk, {
    step: 'report_chunk',
    message: ' 둘째 문단',
  })
  assert.equal(afterSecondChunk.streamingReport, '첫 문단 둘째 문단')
  assert.equal(lifecycle.cancelCausalAnalysis(afterSecondChunk).phase, 'cancelled')
  assert.equal(lifecycle.failCausalAnalysis(afterSecondChunk, 'failure').phase, 'failure')
  assert.equal(
    lifecycle.completeCausalAnalysis(afterSecondChunk, successfulResult).phase,
    'result',
  )

  assert.deepEqual(
    causalDomain.parseCausalIncomingNetwork({
      nodes: [{ id: 'sales-kpi' }, { id: '' }, { name: 'invalid' }],
      relationships: [
        { source: 'driver', target: 'sales-kpi' },
        { source: 'driver' },
      ],
    }),
    {
      nodes: [{ id: 'sales-kpi' }],
      relationships: [{ source: 'driver', target: 'sales-kpi' }],
    },
  )
  assert.throws(
    () => causalDomain.parseCausalIncomingNetwork([]),
    /네트워크 응답 형식/,
  )
  assert.deepEqual(
    lifecycle.projectCausalHighlight({
      nodes: [{ id: 'sales-kpi' }, { id: 'sales-kpi' }, { id: 'driver' }],
      relationships: [
        { source: 'driver', target: 'sales-kpi' },
        { source: 'driver', target: 'sales-kpi' },
      ],
    }),
    {
      nodeIds: ['sales-kpi', 'driver'],
      edgePairs: [['driver', 'sales-kpi']],
    },
  )

  const rows = [
    { day: '2026-07-01', sales: 10 },
    { day: '2026-07-02', sales: 15 },
    { day: '2026-07-03', sales: 21 },
  ]
  assert.deepEqual(
    lifecycle.createCausalBrushSelection(rows, 'day', 0, 2, 'sales'),
    selection,
  )
  assert.deepEqual(
    lifecycle.resolveCausalMetricOptions({
      chartRecommendation: { type: 'line', xAxis: 'day', yAxis: ['sales'] },
      numericColumns: ['sales', 'orders'],
    }),
    ['sales', 'orders'],
  )
  assert.equal(
    lifecycle.resolvePreferredCausalMetric('orders', ['sales', 'orders'], ['profit']),
    'orders',
  )

  const selectedNodeId = ref('sales-kpi')
  const schemaId = ref('library-valid')
  const nodeDataResult = ref({
    hasDataSource: true,
    columns: ['day', 'sales'],
    rows,
    rowCount: rows.length,
    timeColumns: ['day'],
    numericColumns: ['sales'],
    chartRecommendation: { type: 'line', xAxis: 'day', yAxis: ['sales'] },
  })

  const calls = []
  const delayedResult = deferred()
  let analysisAttempt = 0
  const gateway = {
    async getIncomingNetwork(targetSchemaId, nodeId, body, signal) {
      calls.push({ kind: 'network', targetSchemaId, nodeId, body, signal })
      return {
        nodes: [{ id: nodeId }, { id: 'driver' }],
        relationships: [{ source: 'driver', target: nodeId }],
      }
    },
    async runCausalAnalysis(targetSchemaId, nodeId, body, onProgress, signal) {
      analysisAttempt += 1
      calls.push({ kind: 'analysis', targetSchemaId, nodeId, body, signal })
      onProgress({ step: 'report_chunk', message: `chunk-${analysisAttempt}` })
      if (analysisAttempt === 1) return delayedResult.promise
      return successfulResult
    },
  }

  const scope = effectScope()
  const workflow = scope.run(() => useCausalAnalysis({
    selectedNodeId,
    schemaId,
    nodeDataResult,
    gateway,
  }))
  assert(workflow, 'Causal workflow was not created inside its Vue scope')
  assert(workflow.selectBrushRange(0, 2, ['sales']))
  const firstRun = workflow.run()
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(workflow.analysisLoading.value, true)
  assert.deepEqual(workflow.causalHighlight.value, {
    nodeIds: ['sales-kpi', 'driver'],
    edgePairs: [['driver', 'sales-kpi']],
  })
  assert.equal(workflow.analysisState.value.streamingReport, 'chunk-1')

  selectedNodeId.value = 'other-node'
  workflow.reset()
  delayedResult.resolve(successfulResult)
  assert.equal(await firstRun, false)
  assert.equal(workflow.analysisState.value.phase, 'idle')
  assert.equal(workflow.analysisResult.value, null)

  selectedNodeId.value = 'sales-kpi'
  assert(workflow.selectBrushRange(0, 2, ['sales']))
  assert.equal(await workflow.run(), true)
  assert.equal(workflow.analysisState.value.phase, 'result')
  assert.equal(workflow.analysisResult.value.target_node_id, 'sales-kpi')
  assert.deepEqual(calls.at(-1).body, {
    time_range: { start: '2026-07-01', end: '2026-07-03' },
    target_metric: 'sales',
    analysis_type: 'increase',
    max_lag: 7,
  })

  const cancelSignal = deferred()
  const cancelGateway = {
    async getIncomingNetwork() {
      return { nodes: [], relationships: [] }
    },
    async runCausalAnalysis(_targetSchemaId, _nodeId, _body, _onProgress, signal) {
      signal.addEventListener('abort', () => {
        cancelSignal.resolve(signal.aborted)
      }, { once: true })
      return new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => {
          const error = new Error('cancelled')
          error.name = 'AbortError'
          reject(error)
        }, { once: true })
      })
    },
  }
  const cancelWorkflow = scope.run(() => useCausalAnalysis({
    selectedNodeId,
    schemaId,
    nodeDataResult,
    gateway: cancelGateway,
  }))
  assert(cancelWorkflow.selectBrushRange(0, 2, ['sales']))
  const cancelledRun = cancelWorkflow.run()
  await Promise.resolve()
  await Promise.resolve()
  cancelWorkflow.cancel()
  assert.equal(await cancelSignal.promise, true)
  assert.equal(await cancelledRun, false)
  assert.equal(cancelWorkflow.analysisState.value.phase, 'cancelled')
  assert.match(cancelWorkflow.analysisNotice.value, /다시 실행/)
  assert.deepEqual(cancelWorkflow.causalBrushSelection.value, selection)

  const partialGateway = {
    async getIncomingNetwork() {
      throw new Error('network unavailable')
    },
    async runCausalAnalysis() {
      return successfulResult
    },
  }
  const partialWorkflow = scope.run(() => useCausalAnalysis({
    selectedNodeId,
    schemaId,
    nodeDataResult,
    gateway: partialGateway,
  }))
  assert(partialWorkflow.selectBrushRange(0, 2, ['sales']))
  assert.equal(await partialWorkflow.run(), true)
  assert.equal(partialWorkflow.analysisState.value.phase, 'result')
  assert.match(partialWorkflow.analysisWarning.value, /분석은 계속합니다/)
  scope.stop()

  console.log('Ontology causal-analysis lifecycle contracts passed')
} finally {
  await vite.close()
}
