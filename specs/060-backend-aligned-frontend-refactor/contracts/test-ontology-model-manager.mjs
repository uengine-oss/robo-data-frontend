import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { effectScope, nextTick, ref } from 'vue'

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

function model(id, overrides = {}) {
  return {
    modelId: id,
    name: `모델 ${id}`,
    status: 'trained',
    mindsdbModel: `mindsdb_${id}`,
    modelType: 'lightgbm',
    metrics: '{"rmse":1.25,"valid":true}',
    version: 1,
    trainedAt: '2026-07-24T10:00:00Z',
    description: `${id} 설명`,
    inputs: [{
      sourceId: `source-${id}`,
      sourceName: `입력 ${id}(Source)`,
      field: 'amount',
      lag: 1,
      featureName: `amount_lag_${id}`,
      importance: 0.7,
      correlationScore: 0.8,
    }],
    outputs: [{
      targetId: `target-${id}`,
      targetName: `출력 ${id}(Target)`,
      field: 'forecast',
      confidence: 0.9,
    }],
    ...overrides,
  }
}

function response(schemaId, models) {
  return {
    success: true,
    schema_id: schemaId,
    models_count: models.length,
    models,
  }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function settle() {
  await nextTick()
  await new Promise(resolve => setImmediate(resolve))
}

try {
  const api = await vite.ssrLoadModule(
    '/src/domains/ontology/api/whatIfModeling.ts',
  )
  const policy = await vite.ssrLoadModule(
    '/src/domains/ontology/application/modelManagerPolicy.ts',
  )
  const { useWhatIfModelManager } = await vite.ssrLoadModule(
    '/src/domains/ontology/application/useWhatIfModelManager.ts',
  )

  const parsed = api.parseModelStatusResponse(response('schema-a', [model('a')]))
  assert.equal(parsed.success, true)
  assert.equal(parsed.schema_id, 'schema-a')
  assert.equal(parsed.models[0].inputs[0].field, 'amount')
  assert.throws(
    () => api.parseModelStatusResponse({
      ...response('schema-a', [model('a')]),
      models_count: 2,
    }),
    /models_count/,
  )
  assert.throws(
    () => api.parseModelStatusResponse({
      ...response('schema-a', [model('a')]),
      success: false,
    }),
    /success/,
  )
  assert.throws(
    () => api.parseModelStatusResponse({
      success: true,
      schema_id: 'schema-a',
      models: [],
    }),
    /models_count/,
  )
  assert.deepEqual(
    api.parseDeleteModelResponse({ success: true, model_id: 'a' }),
    { success: true, model_id: 'a' },
  )
  assert.throws(
    () => api.parseDeleteModelResponse({ success: true }),
    /model_id/,
  )

  assert.deepEqual(policy.projectModelMetrics('{"rmse":1.23456,"valid":true}'), {
    entries: [
      { key: 'rmse', value: 1.23456 },
      { key: 'valid', value: true },
    ],
    warning: '',
  })
  assert.equal(policy.formatMetricValue(1.23456), '1.2346')
  assert.match(policy.projectModelMetrics('{broken').warning, /해석할 수 없습니다/)
  assert.match(
    policy.projectModelMetrics('{"nested":{"value":1}}').warning,
    /해석할 수 없습니다/,
  )

  const sourceModels = [model('a'), model('b'), model('c')]
  const allSnapshot = policy.createAllModelsDeleteSnapshot('schema-a', sourceModels)
  sourceModels[0].name = '변경된 이름'
  sourceModels.push(model('d'))
  assert.deepEqual(allSnapshot.targets.map(target => target.modelName), [
    '모델 a',
    '모델 b',
    '모델 c',
  ])
  const partialProjection = policy.projectModelDeleteResults(
    sourceModels,
    allSnapshot,
    new Set(['a', 'c']),
    [allSnapshot.targets[1]],
  )
  assert.deepEqual(partialProjection.models.map(item => item.modelId), ['b', 'd'])
  assert.deepEqual(
    partialProjection.failedSnapshot?.targets.map(target => target.modelId),
    ['b'],
  )

  const staleSchema = ref('schema-a')
  const staleA = deferred()
  const staleCalls = []
  const staleScope = effectScope()
  const staleManager = staleScope.run(() => useWhatIfModelManager(
    staleSchema,
    {
      list: async (schemaId, signal) => {
        staleCalls.push({ schemaId, signal })
        if (schemaId === 'schema-a') return staleA.promise
        return response(schemaId, [model('b')])
      },
      remove: async (_schemaId, modelId) => ({ success: true, model_id: modelId }),
    },
  ))
  assert(staleManager)
  await settle()
  staleSchema.value = 'schema-b'
  await settle()
  assert.equal(staleCalls[0].signal.aborted, true)
  assert.deepEqual(staleManager.models.value.map(item => item.modelId), ['b'])
  staleA.resolve(response('schema-a', [model('a')]))
  await settle()
  assert.deepEqual(
    staleManager.models.value.map(item => item.modelId),
    ['b'],
    'late schema-a response replaced schema-b models',
  )
  staleScope.stop()

  let refreshAttempt = 0
  const refreshScope = effectScope()
  const refreshManager = refreshScope.run(() => useWhatIfModelManager(
    ref('schema-refresh'),
    {
      list: async schemaId => {
        refreshAttempt += 1
        if (refreshAttempt === 1) return response(schemaId, [model('keep')])
        throw new Error('refresh unavailable')
      },
      remove: async (_schemaId, modelId) => ({ success: true, model_id: modelId }),
    },
  ))
  assert(refreshManager)
  await settle()
  assert.deepEqual(refreshManager.models.value.map(item => item.modelId), ['keep'])
  assert.equal(await refreshManager.loadModels(), false)
  assert.deepEqual(refreshManager.models.value.map(item => item.modelId), ['keep'])
  assert.match(refreshManager.loadError.value, /refresh unavailable/)
  refreshScope.stop()

  const removeCalls = []
  let bAttempts = 0
  const deleteScope = effectScope()
  const deleteManager = deleteScope.run(() => useWhatIfModelManager(
    ref('schema-delete'),
    {
      list: async schemaId =>
        response(schemaId, [model('a'), model('b'), model('c')]),
      remove: async (schemaId, modelId, signal) => {
        removeCalls.push({ schemaId, modelId, signal })
        if (modelId === 'b' && bAttempts++ === 0) {
          throw new Error('b fixture outage')
        }
        return { success: true, model_id: modelId }
      },
    },
  ))
  assert(deleteManager)
  await settle()
  deleteManager.requestDeleteAll()
  assert.equal(deleteManager.deleteDialogOpen.value, true)
  assert.equal(await deleteManager.confirmDelete(), false)
  assert.equal(deleteManager.deletePending.value, false)
  assert.deepEqual(deleteManager.models.value.map(item => item.modelId), ['b'])
  assert.match(deleteManager.deleteError.value, /b fixture outage/)
  assert.match(deleteManager.deleteDialogMessage.value, /1개 모델/)
  assert.match(deleteManager.deleteDialogMessage.value, /실패한 모델만/)
  assert.equal(await deleteManager.confirmDelete(), true)
  assert.equal(deleteManager.deletePending.value, false)
  assert.equal(deleteManager.deleteDialogOpen.value, false)
  assert.deepEqual(deleteManager.models.value, [])
  assert.deepEqual(
    removeCalls.map(call => call.modelId),
    ['a', 'b', 'c', 'b'],
    'bulk retry did not preserve the failed-only target snapshot',
  )
  deleteScope.stop()

  const pendingRemoval = deferred()
  const abortSchema = ref('schema-abort-a')
  const abortScope = effectScope()
  const abortManager = abortScope.run(() => useWhatIfModelManager(
    abortSchema,
    {
      list: async schemaId => response(schemaId, [model('abort')]),
      remove: async () => pendingRemoval.promise,
    },
  ))
  assert(abortManager)
  await settle()
  abortManager.requestDeleteAll()
  const deleting = abortManager.confirmDelete()
  await settle()
  assert.equal(abortManager.deletePending.value, true)
  abortSchema.value = 'schema-abort-b'
  await settle()
  assert.equal(abortManager.deletePending.value, false)
  pendingRemoval.resolve({ success: true, model_id: 'abort' })
  assert.equal(await deleting, false)
  assert.deepEqual(
    abortManager.models.value.map(item => item.modelId),
    ['abort'],
    'late delete completion mutated the newly selected schema',
  )
  abortScope.stop()

  console.log('Ontology What-If model-manager contracts passed')
} finally {
  await vite.close()
}
