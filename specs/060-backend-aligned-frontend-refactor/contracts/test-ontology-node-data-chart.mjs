import assert from 'node:assert/strict'
import { createServer } from 'vite'
import {
  effectScope,
  nextTick,
  ref,
} from 'vue'

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

function createScheduler() {
  let nextHandle = 0
  const pending = new Map()
  return {
    scheduler: {
      schedule(callback) {
        const handle = ++nextHandle
        pending.set(handle, callback)
        return handle
      },
      cancel(handle) {
        pending.delete(handle)
      },
    },
    flush() {
      const callbacks = [...pending.values()]
      pending.clear()
      callbacks.forEach(callback => callback())
    },
    pendingCount() {
      return pending.size
    },
  }
}

try {
  const { useOntologyNodeDataChart } = await vite.ssrLoadModule(
    '/src/workflows/ontology/composables/useOntologyNodeDataChart.ts',
  )
  const result = ref({
    columns: ['recorded_at', 'sales'],
    rows: [
      { recorded_at: '2026-07-01', sales: 10 },
      { recorded_at: '2026-07-02', sales: 12 },
      { recorded_at: '2026-07-03', sales: 15 },
    ],
    rowCount: 3,
    timeColumns: ['recorded_at'],
    numericColumns: ['sales'],
    chartRecommendation: {
      type: 'line',
      xAxis: 'recorded_at',
      yAxis: ['sales'],
    },
  })
  const dark = ref(true)
  const selectedNodeId = ref('sales-kpi')
  const schemaId = ref('schema-1')
  const analysisLoading = ref(false)
  const brushSelection = ref(null)
  const scheduler = createScheduler()
  const instances = []
  const selectedRanges = []

  function createChart() {
    const handlers = new Map()
    const actions = []
    const instance = {
      actions,
      disposed: false,
      resized: false,
      option: null,
      dispatchAction(action) {
        actions.push(action)
      },
      dispose() {
        this.disposed = true
      },
      off(event) {
        handlers.delete(event)
      },
      on(event, handler) {
        handlers.set(event, handler)
      },
      resize() {
        this.resized = true
      },
      setOption(option) {
        this.option = option
      },
      emit(event, payload) {
        handlers.get(event)?.(payload)
      },
    }
    instances.push(instance)
    return instance
  }

  const scope = effectScope()
  const workflow = scope.run(() => useOntologyNodeDataChart({
    result,
    dark,
    selectedNodeId,
    schemaId,
    analysisLoading,
    brushSelection,
    selectBrushRange(startIndex, endIndex, metrics) {
      selectedRanges.push({ startIndex, endIndex, metrics })
      return true
    },
    createChart,
    timeoutScheduler: scheduler.scheduler,
  }))

  workflow.setHost({})
  await nextTick()
  await nextTick()
  assert.equal(scheduler.pendingCount(), 1)
  scheduler.flush()
  assert.equal(instances.length, 1)
  assert.equal(workflow.isReady.value, true)
  assert(instances[0].option)

  workflow.activateBrushMode()
  assert.equal(workflow.isBrushModeActive.value, true)
  assert.equal(instances[0].actions.at(-1).type, 'takeGlobalCursor')

  instances[0].emit('brushSelected', {
    areas: [{ coordRange: [0, 1] }],
  })
  assert.deepEqual(selectedRanges, [{
    startIndex: 0,
    endIndex: 1,
    metrics: ['sales'],
  }])
  assert.equal(workflow.isBrushModeActive.value, false)

  workflow.resize()
  assert.equal(instances[0].resized, true)

  dark.value = false
  await nextTick()
  await nextTick()
  scheduler.flush()
  assert.equal(instances[0].disposed, true)
  assert.equal(instances.length, 2)
  assert.equal(workflow.isReady.value, true)

  result.value = {
    ...result.value,
    chartRecommendation: {
      type: 'table',
      xAxis: null,
      yAxis: [],
    },
  }
  await nextTick()
  assert.equal(instances[1].disposed, true)
  assert.equal(workflow.isReady.value, false)
  assert.equal(scheduler.pendingCount(), 0)

  scope.stop()
  assert.equal(scheduler.pendingCount(), 0)
  console.log('Ontology node-data chart runtime contracts passed')
} finally {
  await vite.close()
}
