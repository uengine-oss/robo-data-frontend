import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { effectScope } from 'vue'

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

try {
  const targets = await vite.ssrLoadModule(
    '/src/domains/olap/application/etlScriptTargets.ts',
  )
  const { useEtlScriptLifecycle } = await vite.ssrLoadModule(
    '/src/domains/olap/composables/useEtlScriptLifecycle.ts',
  )

  const saveTarget = targets.createEtlScriptSaveTarget(
    'SalesCube',
    'print("original")',
    '',
  )
  assert.deepEqual(saveTarget, {
    cubeName: 'SalesCube',
    code: 'print("original")',
    filename: 'etl_SalesCube.py',
  })
  assert.equal(Object.isFrozen(saveTarget), true)
  const executionTarget = targets.createEtlScriptExecutionTarget(
    'SalesCube',
    'incremental',
    3,
  )
  assert.deepEqual(executionTarget, {
    cubeName: 'SalesCube',
    syncMode: 'incremental',
    maxRetries: 3,
  })
  assert.equal(Object.isFrozen(executionTarget), true)
  assert.throws(
    () => targets.createEtlScriptExecutionTarget('SalesCube', 'full', -1),
    /재시도 횟수/,
  )
  assert.throws(
    () => targets.createEtlScriptSaveTarget('SalesCube', ' ', 'empty.py'),
    /저장할 ETL 스크립트/,
  )

  let cubeName = 'SalesCube'
  let clock = 0
  const agentCalls = []
  const savedReads = []
  const saveCalls = []
  const templateCalls = []
  const executionCalls = []

  const scope = effectScope()
  const lifecycle = scope.run(() => useEtlScriptLifecycle({
    getCubeName: () => cubeName,
    dependencies: {
      now: () => `2026-07-24T00:00:${String(clock++).padStart(2, '0')}Z`,
      generateTemplate(cube, signal) {
        const request = deferred()
        templateCalls.push({ ...request, cube, signal })
        return request.promise
      },
      startAgentGeneration(cube, callbacks) {
        const call = {
          cube,
          callbacks,
          cancelled: false,
        }
        agentCalls.push(call)
        return {
          cancel() {
            call.cancelled = true
          },
        }
      },
      loadSaved(cube, signal) {
        const request = deferred()
        savedReads.push({ ...request, cube, signal })
        return request.promise
      },
      save(target, signal) {
        const request = deferred()
        saveCalls.push({ ...request, target, signal })
        return request.promise
      },
      execute(target, onEvent) {
        const call = {
          target,
          onEvent,
          cancelled: false,
        }
        executionCalls.push(call)
        return {
          cancel() {
            call.cancelled = true
          },
        }
      },
    },
  }))

  const firstReadPromise = lifecycle.loadSaved()
  const secondReadPromise = lifecycle.loadSaved()
  assert.equal(savedReads[0].signal.aborted, true)
  savedReads[1].resolve({
    exists: true,
    code: 'latest saved script',
    filename: 'latest.py',
    saved_at: 'latest-time',
  })
  await secondReadPromise
  savedReads[0].resolve({
    exists: true,
    code: 'stale script',
    filename: 'stale.py',
    saved_at: 'stale-time',
  })
  await firstReadPromise
  assert.equal(lifecycle.scriptCode.value, 'latest saved script')
  assert.equal(lifecycle.scriptFilename.value, 'latest.py')

  const failedReadPromise = lifecycle.loadSaved()
  savedReads.at(-1).reject(new Error('saved script unavailable'))
  await failedReadPromise
  assert.match(lifecycle.savedLoadError.value, /saved script unavailable/)
  assert.equal(
    lifecycle.scriptCode.value,
    'latest saved script',
    'failed saved-script read discarded the last valid script',
  )
  const retryReadPromise = lifecycle.retrySavedLoad()
  assert.equal(savedReads.at(-1).cube, 'SalesCube')
  savedReads.at(-1).resolve({
    exists: true,
    code: 'retried saved script',
    filename: 'retried.py',
    saved_at: 'retry-time',
  })
  await retryReadPromise
  assert.equal(lifecycle.scriptCode.value, 'retried saved script')

  await lifecycle.generate(true)
  const firstAgent = agentCalls[0]
  firstAgent.callbacks.onCode({
    type: 'code',
    code: 'agent code before cancel',
    complete: true,
  })
  lifecycle.cancelGeneration()
  assert.equal(firstAgent.cancelled, true)
  assert.equal(lifecycle.generationStatus.value, 'cancelled')
  firstAgent.callbacks.onComplete({
    type: 'complete',
    message: 'late success',
  })
  assert.equal(lifecycle.generationStatus.value, 'cancelled')

  await lifecycle.generate(true)
  const failedAgent = agentCalls[1]
  failedAgent.callbacks.onError({
    type: 'error',
    message: 'agent generation failed',
  })
  assert.match(lifecycle.generationError.value, /agent generation failed/)
  await lifecycle.retryGeneration()
  assert.equal(agentCalls[2].cube, 'SalesCube')
  agentCalls[2].callbacks.onCode({
    type: 'code',
    code: 'generated code',
    complete: true,
  })
  agentCalls[2].callbacks.onComplete({
    type: 'complete',
    message: 'generation complete',
  })
  assert.equal(lifecycle.scriptCode.value, 'generated code')
  assert.equal(lifecycle.scriptSaved.value, false)

  lifecycle.scriptFilename.value = 'generated.py'
  const firstSavePromise = lifecycle.saveCurrent()
  const frozenSave = saveCalls[0].target
  lifecycle.scriptCode.value = 'changed after save started'
  lifecycle.scriptFilename.value = 'changed.py'
  saveCalls[0].reject(new Error('save unavailable'))
  await firstSavePromise
  assert.match(lifecycle.saveError.value, /save unavailable/)
  const retrySavePromise = lifecycle.retrySave()
  assert.deepEqual(saveCalls[1].target, frozenSave)
  assert.equal(saveCalls[1].target.code, 'generated code')
  assert.equal(saveCalls[1].target.filename, 'generated.py')
  saveCalls[1].resolve({
    success: true,
    metadata: { saved_at: 'saved-time' },
  })
  await retrySavePromise
  assert.equal(lifecycle.scriptSaved.value, true)
  assert.equal(lifecycle.scriptSavedAt.value, 'saved-time')

  assert.equal(lifecycle.execute('full'), true)
  const cancelledExecution = executionCalls[0]
  assert.deepEqual(cancelledExecution.target, {
    cubeName: 'SalesCube',
    syncMode: 'full',
    maxRetries: 3,
  })
  lifecycle.cancelExecution()
  assert.equal(cancelledExecution.cancelled, true)
  assert.equal(lifecycle.executionResult.value.cancelled, true)
  cancelledExecution.onEvent({
    type: 'complete',
    message: 'late complete',
    success: true,
  })
  assert.equal(lifecycle.executionResult.value.cancelled, true)
  assert.notEqual(lifecycle.executionNotice.value, 'late complete')

  assert.equal(lifecycle.execute('incremental'), true)
  const terminalFailure = executionCalls[1]
  terminalFailure.onEvent({
    type: 'error',
    message: 'terminal stream failure',
    terminal: true,
  })
  assert.equal(lifecycle.executionPending.value, false)
  assert.equal(lifecycle.executionResult.value.success, false)
  assert.match(lifecycle.executionError.value, /terminal stream failure/)

  lifecycle.scriptSaved.value = true
  await lifecycle.generate(true)
  const disposalAgent = agentCalls.at(-1)
  lifecycle.scriptSaved.value = true
  lifecycle.execute('full')
  const disposalExecution = executionCalls.at(-1)
  const disposalReadPromise = lifecycle.loadSaved()
  const disposalRead = savedReads.at(-1)
  scope.stop()
  assert.equal(disposalAgent.cancelled, true)
  assert.equal(disposalExecution.cancelled, true)
  assert.equal(disposalRead.signal.aborted, true)
  disposalRead.resolve({
    exists: true,
    code: 'late after disposal',
    filename: 'late.py',
    saved_at: 'late',
  })
  await disposalReadPromise
  assert.notEqual(lifecycle.scriptCode.value, 'late after disposal')

  console.log('OLAP ETL script lifecycle contract passed')
} finally {
  await vite.close()
}
