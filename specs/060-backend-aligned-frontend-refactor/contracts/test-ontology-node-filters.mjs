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

try {
  const projection = await vite.ssrLoadModule(
    '/src/workflows/ontology/application/ontologyFilterProjection.ts',
  )
  const { useOntologyNodeFilters } = await vite.ssrLoadModule(
    '/src/workflows/ontology/composables/useOntologyNodeFilters.ts',
  )
  const { parseOntologyNodeFilterValues } = await vite.ssrLoadModule(
    '/src/domains/ontology/api/objectExplorer.ts',
  )

  const relationships = [
    {
      id: 'parent-child',
      source: 'child.part',
      target: 'parent.node',
      fromField: 'parent_id',
      toField: 'id',
    },
    {
      id: 'child-leaf',
      source: 'child.part',
      target: 'leaf.node',
      fromField: 'parent_id',
      toField: 'root_id',
    },
    {
      id: 'cycle',
      source: 'leaf.node',
      target: 'parent.node',
      fromField: 'root_id',
      toField: 'id',
    },
  ]
  const direct = {
    'parent.node': { id: 42, ignored: '' },
    'leaf.node': { root_id: 99 },
  }
  const projected = projection.projectOntologyFilters(direct, relationships)
  assert.deepEqual(projected.direct, {
    'parent.node': { id: 42 },
    'leaf.node': { root_id: 99 },
  })
  assert.equal(projected.effective['child.part'].parent_id, 42)
  assert.equal(
    projected.effective['leaf.node'].root_id,
    99,
    'direct value must win over a derived value',
  )
  assert(projected.conflicts.length >= 1)
  assert.deepEqual(direct, {
    'parent.node': { id: 42, ignored: '' },
    'leaf.node': { root_id: 99 },
  }, 'projection must not mutate its input')
  assert.equal(
    projection.getOntologyNodeFilterChips('child.part', projected)[0].type,
    'cascade',
  )

  const cleared = projection.commitOntologyFilterDraft(
    projected.direct,
    'parent.node',
    { id: '', zero: 0, disabled: false },
  )
  assert.deepEqual(cleared['parent.node'], { zero: 0, disabled: false })
  const rebuilt = projection.projectOntologyFilters(
    { 'isolated.node': { region: 'east' } },
    relationships,
  )
  assert.equal(
    rebuilt.effective['child.part'],
    undefined,
    'a new projection must not resurrect stale cascading state',
  )

  assert.deepEqual(parseOntologyNodeFilterValues({
    distinctValues: {
      region: ['east', 'west'],
      year: [2025, 2026],
      enabled: [true, false],
    },
  }), {
    distinctValues: {
      region: ['east', 'west'],
      year: [2025, 2026],
      enabled: [true, false],
    },
  })
  assert.throws(
    () => parseOntologyNodeFilterValues({ distinctValues: { region: [null] } }),
    /region/,
  )
  assert.throws(
    () => parseOntologyNodeFilterValues({}),
    /distinctValues/,
  )

  const pending = new Map()
  const calls = []
  const gateway = {
    getNodeFilterValues(nodeId, columns, signal) {
      const request = deferred()
      pending.set(nodeId, request)
      calls.push({ nodeId, columns: [...columns], signal })
      return request.promise
    },
  }
  const relationshipRef = ref(relationships)
  const scope = effectScope()
  const filters = scope.run(() => useOntologyNodeFilters({
    relationships: relationshipRef,
    gateway,
  }))
  assert(filters)

  filters.directFilters.value = {
    'parent.node': { id: 42 },
  }
  const parentTarget = {
    id: 'parent.node',
    name: 'Parent',
    dataSource: 'warehouse.parent',
    filterFields: [
      { column: 'id', label: 'ID', type: 'select', dataType: 'number' },
    ],
  }
  const parentOpen = filters.open(parentTarget)
  await Promise.resolve()
  filters.filterDraft.value.id = 77
  filters.close()
  assert.deepEqual(filters.directFilters.value, {
    'parent.node': { id: 42 },
  }, 'cancel must discard the dialog draft')
  assert.equal(calls[0].signal.aborted, true)
  pending.get('parent.node').resolve({ distinctValues: { id: [42, 77] } })
  await parentOpen

  const aOpen = filters.open({
    id: 'a.node',
    name: 'A',
    dataSource: 'warehouse.a',
    filterFields: [
      { column: 'region', label: 'Region', type: 'select', dataType: 'string' },
    ],
  })
  await Promise.resolve()
  const bOpen = filters.open({
    id: 'b.node',
    name: 'B',
    dataSource: 'warehouse.b',
    filterFields: [
      { column: 'country', label: 'Country', type: 'search', dataType: 'string' },
    ],
  })
  await Promise.resolve()
  assert.equal(
    calls.find(call => call.nodeId === 'a.node').signal.aborted,
    true,
  )
  pending.get('b.node').resolve({
    distinctValues: { country: ['KR', 'US'] },
  })
  await bOpen
  pending.get('a.node').resolve({
    distinctValues: { region: ['late'] },
  })
  await aOpen
  assert.deepEqual(filters.filterDistinctValues.value, {
    country: ['KR', 'US'],
  }, 'late distinct values must not overwrite the current target')

  filters.filterDraft.value.country = 'KR'
  assert.equal(filters.confirm(), 'b.node')
  assert.deepEqual(filters.directFilters.value['b.node'], { country: 'KR' })
  assert.equal(filters.filterTarget.value, null)

  let retryAttempt = 0
  const retryCalls = []
  const retryGateway = {
    async getNodeFilterValues(nodeId, columns, signal) {
      retryCalls.push({ nodeId, columns: [...columns], signal })
      retryAttempt += 1
      if (retryAttempt === 1) throw new Error('distinct outage')
      return { distinctValues: { region: ['east'] } }
    },
  }
  const retryScope = effectScope()
  const retryFilters = retryScope.run(() => useOntologyNodeFilters({
    relationships: ref([]),
    gateway: retryGateway,
  }))
  const retryTarget = {
    id: 'sales.node',
    name: 'Sales',
    dataSource: 'warehouse.sales',
    filterFields: [
      { column: 'region', label: 'Region', type: 'select', dataType: 'string' },
    ],
  }
  await retryFilters.open(retryTarget)
  assert.match(retryFilters.filterDistinctError.value, /distinct outage/)
  retryTarget.filterFields[0].column = 'mutated'
  await retryFilters.retryDistinctValues()
  assert.deepEqual(
    retryCalls.map(call => [call.nodeId, call.columns]),
    [
      ['sales.node', ['region']],
      ['sales.node', ['region']],
    ],
    'retry must use the frozen node and columns',
  )
  assert.deepEqual(retryFilters.filterDistinctValues.value, {
    region: ['east'],
  })

  retryScope.stop()
  scope.stop()
  console.log('ontology node filter contracts passed')
} finally {
  await vite.close()
}
