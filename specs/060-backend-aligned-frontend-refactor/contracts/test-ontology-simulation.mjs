import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { effectScope, nextTick, ref } from 'vue'

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

function snapshot(date = '2026-07-24', value = 10) {
  return {
    success: true,
    date,
    available_dates: ['2026-07-24', '2026-07-25'],
    snapshot: { 'node-a::amount': value },
    snapshot_by_node: {
      'node-a': {
        nodeName: '비용(Node)',
        fields: { amount: value },
      },
    },
    timeseries: {
      dates: ['2026-07-24', '2026-07-25'],
      'node-a::amount': [10, 12],
    },
    field_descriptions: { amount: '비용' },
    applied_filters: { region: { value: '서울' } },
  }
}

function simulation(schemaId = 'schema-a') {
  return {
    success: true,
    schema_id: schemaId,
    scenario_name: 'What-if @ 2026-07-25',
    interventions: [{
      node_id: 'node-a',
      field: 'amount',
      value: 15,
      description: 'amount: 12 → 15',
    }],
    traces: [{
      model_id: 'model-a',
      model_name: '비용 예측',
      inputs: { 'node-a::amount': 15 },
      output_field: 'node-b::forecast',
      baseline_value: 20,
      predicted_value: 25,
      delta: 5,
      pct_change: 25,
      wave: 0,
      effective_day: 0,
      triggered_by: ['node-a::amount'],
    }],
    timeline: {
      0: [{
        model_id: 'model-a',
        model_name: '비용 예측',
        output_field: 'node-b::forecast',
        baseline_value: 20,
        predicted_value: 25,
        delta: 5,
        pct_change: 25,
        triggered_by: ['node-a::amount'],
      }],
    },
    final_state: { 'node-b::forecast': 25 },
    baseline_state: { 'node-b::forecast': 20 },
    deltas: { 'node-b::forecast': 5 },
    executed_at: '2026-07-24T12:00:00Z',
    propagation_waves: 1,
  }
}

function profile(schemaId = 'schema-a') {
  return {
    id: 'profile-a',
    name: '비용 상승',
    description: '회귀 계약',
    schemaId,
    interventions: [{
      nodeId: 'node-a',
      field: 'amount',
      value: 15,
      description: 'amount: 12 → 15',
    }],
    created_at: '2026-07-24T12:01:00Z',
    outputFields: [{
      key: 'node-b::forecast',
      label: 'node-b → forecast',
      lastValue: 25,
      baselineValue: 20,
    }],
  }
}

function deferred() {
  let resolve
  const promise = new Promise(resolvePromise => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
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
    '/src/domains/ontology/application/simulationPolicy.ts',
  )
  const { useWhatIfSimulation } = await vite.ssrLoadModule(
    '/src/domains/ontology/application/useWhatIfSimulation.ts',
  )

  assert.equal(api.parseSnapshotResponse(snapshot()).date, '2026-07-24')
  assert.throws(
    () => api.parseSnapshotResponse({
      ...snapshot(),
      timeseries: {
        dates: ['2026-07-24', '2026-07-25'],
        'node-a::amount': [10],
      },
    }),
    /길이가 dates와 다릅니다/,
  )
  assert.throws(
    () => api.parseSnapshotResponse({ ...snapshot(), success: false }),
    /success/,
  )
  assert.equal(api.parseSimulateResponse(simulation()).traces[0].wave, 0)
  assert.throws(
    () => api.parseSimulateResponse({
      ...simulation(),
      propagation_waves: 1.5,
    }),
    /0 이상의 정수/,
  )
  assert.throws(
    () => api.parseSimulateResponse({
      ...simulation(),
      timeline: { tomorrow: [] },
    }),
    /timeline day/,
  )
  assert.equal(api.parseScenarioProfileResponse(profile()).id, 'profile-a')
  assert.throws(
    () => api.parseScenarioProfileResponse({
      ...profile(),
      outputFields: [{ key: 'forecast' }],
    }),
    /label/,
  )

  const filters = { region: { value: '서울', nested: { active: true } } }
  const changed = policy.projectChangedSimulationVariables(
    { 'node-a::amount': 10, stable: 1 },
    { 'node-a::amount': 15, stable: 1, unknown: 4 },
  )
  assert.deepEqual(changed, [{
    key: 'node-a::amount',
    original: 10,
    current: 15,
  }])
  const request = policy.createSimulationRequestSnapshot({
    schemaId: 'schema-a',
    snapshotDate: '2026-07-24',
    filters,
    changedVariables: changed,
  })
  filters.region.nested.active = false
  changed[0].current = 999
  assert.equal(request.filters.region.nested.active, true)
  assert.equal(request.interventions[0].value, 15)
  assert.throws(
    () => policy.createSimulationInterventions([{
      key: 'invalid',
      original: 1,
      current: 2,
    }]),
    /nodeId::field/,
  )

  const result = simulation()
  const saveSnapshot = policy.createProfileSaveSnapshot({
    name: '  비용 상승  ',
    description: '  설명  ',
    result,
  })
  result.interventions[0].value = 999
  result.final_state['node-b::forecast'] = 999
  assert.equal(saveSnapshot.request.name, '비용 상승')
  assert.equal(saveSnapshot.request.interventions[0].value, 15)
  assert.equal(saveSnapshot.request.outputFields[0].lastValue, 25)

  let dateAttempts = 0
  let simulateAttempts = 0
  let profileAttempts = 0
  const simulationCalls = []
  const profileCalls = []
  const lifecycleScope = effectScope()
  const manager = lifecycleScope.run(() => useWhatIfSimulation(
    {
      schemaId: ref('schema-a'),
      filters: ref({ region: { value: '서울' } }),
    },
    {
      snapshot: async (_schemaId, date) => {
        if (date === '2026-07-25') {
          dateAttempts += 1
          if (dateAttempts === 1) throw new Error('snapshot fixture outage')
          return snapshot('2026-07-25', 12)
        }
        return snapshot()
      },
      simulate: async requestTarget => {
        simulationCalls.push(cloneJson(requestTarget))
        simulateAttempts += 1
        if (simulateAttempts === 1) throw new Error('simulation fixture outage')
        return simulation(requestTarget.schemaId)
      },
      saveProfile: async requestTarget => {
        profileCalls.push(cloneJson(requestTarget))
        profileAttempts += 1
        if (profileAttempts === 1) throw new Error('profile fixture outage')
        return {
          ...profile(requestTarget.schemaId),
          name: requestTarget.name,
          description: requestTarget.description,
          interventions: requestTarget.interventions,
          outputFields: requestTarget.outputFields,
        }
      },
    },
  ))
  assert(manager)
  await settle()
  assert.equal(manager.selectedDate.value, '2026-07-24')
  manager.setSnapshotValue('node-a::amount', '15')
  assert.equal(await manager.loadSnapshot('2026-07-25'), false)
  assert.equal(manager.selectedDate.value, '2026-07-24')
  assert.equal(manager.editableSnapshot.value['node-a::amount'], 15)
  assert.equal(manager.snapshotCanRetry.value, true)
  assert.equal(await manager.retrySnapshot(), true)
  assert.equal(manager.selectedDate.value, '2026-07-25')
  assert.equal(manager.editableSnapshot.value['node-a::amount'], 12)

  manager.setSnapshotValue('node-a::amount', '15')
  assert.equal(await manager.runSimulation(), false)
  assert.equal(manager.simulationCanRetry.value, true)
  assert.equal(await manager.retrySimulation(), true)
  assert.deepEqual(
    simulationCalls[1],
    simulationCalls[0],
    'simulation retry changed the failed request snapshot',
  )
  assert.equal(manager.simulationResult.value?.executed_at, result.executed_at)

  manager.openProfileEditor()
  manager.profileName.value = '비용 상승'
  manager.profileDescription.value = '회귀 계약'
  await nextTick()
  assert.equal(await manager.saveProfile(), false)
  assert.equal(manager.profileCanRetry.value, true)
  assert.equal(await manager.saveProfile(), true)
  assert.deepEqual(
    profileCalls[1],
    profileCalls[0],
    'profile retry changed the failed request snapshot',
  )
  assert.match(manager.profileSuccess.value, /비용 상승/)
  lifecycleScope.stop()

  const lateSnapshot = deferred()
  const schema = ref('schema-late-a')
  const abortCalls = []
  const abortScope = effectScope()
  const abortManager = abortScope.run(() => useWhatIfSimulation(
    { schemaId: schema, filters: ref({}) },
    {
      snapshot: async (schemaId, _date, _filters, signal) => {
        abortCalls.push({ schemaId, signal })
        if (schemaId === 'schema-late-a') return lateSnapshot.promise
        return snapshot()
      },
      simulate: async requestTarget => simulation(requestTarget.schemaId),
      saveProfile: async requestTarget => ({
        ...profile(requestTarget.schemaId),
        name: requestTarget.name,
      }),
    },
  ))
  assert(abortManager)
  await settle()
  schema.value = 'schema-late-b'
  await settle()
  assert.equal(abortCalls[0].signal.aborted, true)
  assert.equal(abortManager.snapshotData.value?.date, '2026-07-24')
  lateSnapshot.resolve(snapshot('2026-07-25', 12))
  await settle()
  assert.equal(
    abortManager.snapshotData.value?.date,
    '2026-07-24',
    'late snapshot replaced the current schema state',
  )
  abortScope.stop()

  console.log('Ontology What-If simulation contracts passed')
} finally {
  await vite.close()
}
