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

function createWorkflow(useOntologyRelationEditor, {
  nodes,
  relationships,
  loadNodeData,
  beforeOpen = () => {},
  beforeCommit = () => {},
  afterCommit = () => {},
}) {
  const scope = effectScope()
  const workflow = scope.run(() => useOntologyRelationEditor({
    nodes,
    relationships,
    beforeOpen,
    beforeCommit,
    afterCommit,
    dependencies: { loadNodeData },
  }))
  assert(workflow)
  return { scope, workflow }
}

try {
  const lifecycle = await vite.ssrLoadModule(
    '/src/workflows/ontology/application/relationEditorLifecycle.ts',
  )
  const { useOntologyRelationEditor } = await vite.ssrLoadModule(
    '/src/workflows/ontology/composables/useOntologyRelationEditor.ts',
  )

  const rawColumns = [' order_id ', { name: 'metric_id' }, 'order_id', null, { name: ' ' }]
  assert.deepEqual(
    lifecycle.normalizeRelationColumnNames(rawColumns),
    ['order_id', 'metric_id'],
  )
  assert.deepEqual(
    rawColumns,
    [' order_id ', { name: 'metric_id' }, 'order_id', null, { name: ' ' }],
    'Column normalization mutated its input',
  )
  assert.equal(lifecycle.readInlineRelationColumns({}), null)
  assert.deepEqual(lifecycle.readInlineRelationColumns({ columns: [] }), [])

  const baseRelationship = {
    id: 'relation-a',
    source: 'source-a',
    target: 'target-a',
    type: 'MEASURED_AS',
    description: 'original',
    fromField: 'order_id',
    toField: 'metric_id',
  }
  const compositeId = `${baseRelationship.source}-${baseRelationship.type}-${baseRelationship.target}`
  const exactResolved = lifecycle.resolveRelationEditorRelationship(
    [baseRelationship],
    baseRelationship.id,
  )
  const compositeResolved = lifecycle.resolveRelationEditorRelationship(
    [baseRelationship],
    compositeId,
  )
  assert.deepEqual(exactResolved, baseRelationship)
  assert.deepEqual(compositeResolved, baseRelationship)
  assert.notEqual(exactResolved, baseRelationship)
  assert.equal(
    lifecycle.resolveRelationEditorRelationship([baseRelationship], 'missing'),
    null,
  )

  const draft = lifecycle.createRelationEditorForm(baseRelationship)
  assert.deepEqual(
    lifecycle.projectRelationEditorFormAfterColumnLoad(
      draft,
      { status: 'error', columns: [], error: 'temporary' },
      { status: 'no_datasource', columns: [] },
    ),
    draft,
    'Unverified endpoint state must preserve the field-mapping draft',
  )
  assert.deepEqual(
    lifecycle.projectRelationEditorFormAfterColumnLoad(
      draft,
      { status: 'ready', columns: ['other'] },
      { status: 'ready', columns: ['metric_id'] },
    ),
    { ...draft, fromField: '', toField: 'metric_id' },
    'Only a verified missing column may clear its field',
  )

  const raceNodes = ref([
    { id: 'source-a', dataSource: 'warehouse.source_a' },
    { id: 'target-a', dataSource: 'warehouse.target_a' },
    { id: 'source-b', dataSource: 'warehouse.source_b' },
    { id: 'target-b', dataSource: 'warehouse.target_b' },
  ])
  const relationB = {
    id: 'relation-b',
    source: 'source-b',
    target: 'target-b',
    type: 'CAUSES',
    fromField: 'b_from',
    toField: 'b_to',
  }
  const raceRelationships = ref([baseRelationship, relationB])
  const raceRequests = []
  const racePending = new Map()
  const race = createWorkflow(useOntologyRelationEditor, {
    nodes: raceNodes,
    relationships: raceRelationships,
    loadNodeData(nodeId, signal) {
      const pending = deferred()
      raceRequests.push({ nodeId, signal })
      racePending.set(nodeId, pending)
      return pending.promise
    },
  })
  const openA = race.workflow.openRelationEditor(baseRelationship.id)
  await Promise.resolve()
  const openB = race.workflow.openRelationEditor(relationB.id)
  await Promise.resolve()
  assert.equal(raceRequests[0].signal.aborted, true)
  assert.equal(raceRequests[1].signal.aborted, true)
  racePending.get('source-b').resolve({ columns: ['b_from'] })
  racePending.get('target-b').resolve({ columns: ['b_to'] })
  await openB
  assert.equal(race.workflow.editingRelation.value.id, relationB.id)
  assert.deepEqual(race.workflow.sourceNodeColumns.value, ['b_from'])
  assert.deepEqual(race.workflow.targetNodeColumns.value, ['b_to'])
  racePending.get('source-a').resolve({ columns: ['stale_from'] })
  racePending.get('target-a').resolve({ columns: ['stale_to'] })
  await openA
  assert.equal(race.workflow.editingRelation.value.id, relationB.id)
  assert.deepEqual(
    race.workflow.sourceNodeColumns.value,
    ['b_from'],
    'A late response overwrote the B editor',
  )
  race.scope.stop()

  const closePending = new Map()
  const closeRequests = []
  const closeCase = createWorkflow(useOntologyRelationEditor, {
    nodes: raceNodes,
    relationships: raceRelationships,
    loadNodeData(nodeId, signal) {
      const pending = deferred()
      closePending.set(nodeId, pending)
      closeRequests.push({ nodeId, signal })
      return pending.promise
    },
  })
  const closingOpen = closeCase.workflow.openRelationEditor(baseRelationship.id)
  await Promise.resolve()
  closeCase.workflow.closeRelationEditor()
  assert(closeRequests.every(request => request.signal.aborted))
  closePending.get('source-a').resolve({ columns: ['late'] })
  closePending.get('target-a').resolve({ columns: ['late'] })
  await closingOpen
  assert.equal(closeCase.workflow.showRelationEditor.value, false)
  assert.equal(closeCase.workflow.editingRelation.value, null)
  closeCase.scope.stop()

  let beforeCommitCount = 0
  let afterCommitCount = 0
  const retryCalls = []
  const retryAttempts = new Map()
  const originalRelationship = structuredClone(baseRelationship)
  const editableRelationships = ref([originalRelationship])
  const retry = createWorkflow(useOntologyRelationEditor, {
    nodes: raceNodes,
    relationships: editableRelationships,
    async loadNodeData(nodeId, signal) {
      retryCalls.push({ nodeId, signal })
      const attempt = (retryAttempts.get(nodeId) || 0) + 1
      retryAttempts.set(nodeId, attempt)
      if (attempt === 1) throw new Error(`temporary ${nodeId}`)
      return {
        columns: nodeId === 'source-a' ? ['order_id'] : ['metric_id'],
      }
    },
    beforeCommit() {
      beforeCommitCount += 1
    },
    afterCommit() {
      afterCommitCount += 1
    },
  })
  await retry.workflow.openRelationEditor(baseRelationship.id)
  assert.equal(retry.workflow.sourceColumnStatus.value, 'error')
  assert.equal(retry.workflow.targetColumnStatus.value, 'error')
  assert.equal(retry.workflow.editingRelationForm.value.fromField, 'order_id')
  assert.equal(retry.workflow.editingRelationForm.value.toField, 'metric_id')
  assert.equal(retry.workflow.canRetryRelationColumns.value, true)
  await retry.workflow.retryRelationColumns()
  assert.deepEqual(
    retryCalls.map(call => call.nodeId),
    ['source-a', 'target-a', 'source-a', 'target-a'],
  )
  assert.equal(retry.workflow.sourceColumnStatus.value, 'ready')
  assert.equal(retry.workflow.targetColumnStatus.value, 'ready')
  assert.equal(retry.workflow.saveRelationEditor(), false)
  assert.equal(beforeCommitCount, 0)
  assert.equal(afterCommitCount, 0)
  retry.workflow.editingRelationForm.value.type = 'DRIVES'
  assert.equal(retry.workflow.saveRelationEditor(), true)
  assert.equal(beforeCommitCount, 1)
  assert.equal(afterCommitCount, 1)
  assert.equal(editableRelationships.value[0].type, 'DRIVES')
  assert.deepEqual(
    originalRelationship,
    baseRelationship,
    'Relationship update mutated the original relationship',
  )

  retry.workflow.editingRelationForm.value.fromField = 'order_id'
  retry.workflow.editingRelationForm.value.toField = ''
  assert.equal(retry.workflow.saveRelationEditor(), false)
  assert.notEqual(retry.workflow.relationEditorError.value, '')
  assert.equal(beforeCommitCount, 1)
  retry.workflow.editingRelationForm.value.toField = 'metric_id'
  retry.workflow.applyRelationNodeColumns('source-a', [], 'unverified')
  assert.equal(
    retry.workflow.editingRelationForm.value.fromField,
    'order_id',
    'A transient mapping error cleared the existing draft',
  )
  retry.workflow.applyRelationNodeColumns('source-a', ['different'], 'unused')
  assert.equal(retry.workflow.editingRelationForm.value.fromField, '')
  retry.scope.stop()

  let inlineNetworkCalls = 0
  const inlineRelationships = ref([structuredClone(baseRelationship)])
  const inline = createWorkflow(useOntologyRelationEditor, {
    nodes: ref([
      {
        id: 'source-a',
        dataSource: 'warehouse.source_a',
        dataSourceSchema: { columns: ['order_id'] },
      },
      {
        id: 'target-a',
        dataSource: 'warehouse.target_a',
        dataSourceSchema: { columns: [] },
      },
    ]),
    relationships: inlineRelationships,
    async loadNodeData() {
      inlineNetworkCalls += 1
      return { columns: ['unexpected'] }
    },
  })
  await inline.workflow.openRelationEditor(baseRelationship.id)
  assert.equal(inlineNetworkCalls, 0)
  assert.equal(inline.workflow.sourceColumnStatus.value, 'ready')
  assert.equal(inline.workflow.targetColumnStatus.value, 'ready')
  assert.deepEqual(inline.workflow.targetNodeColumns.value, [])
  assert.equal(inline.workflow.editingRelationForm.value.fromField, 'order_id')
  assert.equal(inline.workflow.editingRelationForm.value.toField, '')
  inline.scope.stop()

  const disposePending = new Map()
  const disposeSignals = []
  const dispose = createWorkflow(useOntologyRelationEditor, {
    nodes: raceNodes,
    relationships: raceRelationships,
    loadNodeData(nodeId, signal) {
      const pending = deferred()
      disposePending.set(nodeId, pending)
      disposeSignals.push(signal)
      return pending.promise
    },
  })
  const disposeOpen = dispose.workflow.openRelationEditor(baseRelationship.id)
  await Promise.resolve()
  dispose.scope.stop()
  assert(disposeSignals.every(signal => signal.aborted))
  disposePending.get('source-a').resolve({ columns: ['late'] })
  disposePending.get('target-a').resolve({ columns: ['late'] })
  await disposeOpen

  console.log('Ontology relation-editor lifecycle contract passed')
} finally {
  await vite.close()
}
