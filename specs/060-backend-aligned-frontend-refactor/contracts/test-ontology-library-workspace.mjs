import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { effectScope, ref } from 'vue'

class MemoryStorage {
  #values = new Map()

  get length() {
    return this.#values.size
  }

  clear() {
    this.#values.clear()
  }

  getItem(key) {
    return this.#values.get(key) ?? null
  }

  key(index) {
    return [...this.#values.keys()][index] ?? null
  }

  removeItem(key) {
    this.#values.delete(key)
  }

  setItem(key, value) {
    this.#values.set(key, String(value))
  }
}

globalThis.localStorage = new MemoryStorage()

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

function listEntry(id, name = id, overrides = {}) {
  return {
    id,
    name,
    nodeCount: 1,
    updatedAt: '2026-07-24T00:00:00.000Z',
    hasSchemaJson: true,
    ...overrides,
  }
}

function schema(id, name = id) {
  return {
    id,
    name,
    nodes: [{ id: `${id}-node`, name: name, label: 'KPI' }],
    relationships: [],
    labels: [],
  }
}

function defaultClient(overrides = {}) {
  return {
    async listSchemas() {
      return { schemas: [], activeSchemaId: null }
    },
    async updateSchemaName() {},
    async deleteSchemaById() {
      return { success: true }
    },
    async activateSchema(schemaId) {
      return { success: true, schemaId, name: schemaId }
    },
    async getSchemaById(schemaId) {
      return schema(schemaId)
    },
    ...overrides,
  }
}

function createWorkflow(useOntologyLibraryWorkspace, overrides = {}) {
  const scope = effectScope()
  const currentSchemaId = overrides.currentSchemaId || ref(null)
  const currentSchemaName = overrides.currentSchemaName || ref('')
  const applications = []
  const deleted = []
  const loadingStates = []
  let focusCount = 0
  const workflow = scope.run(() => useOntologyLibraryWorkspace({
    currentSchemaId,
    currentSchemaName,
    client: overrides.client || defaultClient(),
    async applySchema(schemaId, value) {
      applications.push({ schemaId, schema: structuredClone(value) })
      if (overrides.applySchema) {
        return overrides.applySchema(schemaId, value)
      }
      currentSchemaId.value = schemaId
      currentSchemaName.value = value.name || ''
    },
    clearDeletedSchema(schemaId) {
      deleted.push(schemaId)
      overrides.clearDeletedSchema?.(schemaId)
    },
    setLoadingState(pending, message) {
      loadingStates.push({ pending, message })
    },
    focusRenameInput() {
      focusCount += 1
    },
  }))
  assert(workflow)
  return {
    scope,
    workflow,
    currentSchemaId,
    currentSchemaName,
    applications,
    deleted,
    loadingStates,
    get focusCount() {
      return focusCount
    },
  }
}

try {
  const policy = await vite.ssrLoadModule(
    '/src/workflows/ontology/application/ontologyLibraryWorkspace.ts',
  )
  const { useOntologyLibraryWorkspace } = await vite.ssrLoadModule(
    '/src/workflows/ontology/composables/useOntologyLibraryWorkspace.ts',
  )
  const history = await vite.ssrLoadModule(
    '/src/workflows/ontology/model/ontologyHistory.ts',
  )

  const entry = listEntry('schema-a', 'Original')
  const deleteTarget = policy.createOntologyLibraryDeleteTarget(entry)
  entry.name = 'Mutated'
  assert.deepEqual(deleteTarget, { id: 'schema-a', name: 'Original' })

  const entries = [listEntry('schema-a', 'A'), listEntry('schema-b', 'B')]
  const entriesSnapshot = structuredClone(entries)
  const renamed = policy.projectRenamedOntologyLibraryEntries(
    entries,
    'schema-a',
    'Renamed',
  )
  assert.deepEqual(entries, entriesSnapshot)
  assert.deepEqual(renamed.map(item => item.name), ['Renamed', 'B'])
  assert.notEqual(renamed[0], entries[0])
  assert.notEqual(renamed[1], entries[1])

  const retrySchema = schema('schema-a', 'Original')
  const retryTarget = policy.createOntologyLibraryApplicationRetry(
    'schema-a',
    retrySchema,
  )
  retrySchema.name = 'Mutated'
  retrySchema.nodes[0].name = 'Mutated'
  assert.equal(retryTarget.schema.name, 'Original')
  assert.equal(retryTarget.schema.nodes[0].name, 'Original')
  assert.match(
    policy.ontologyLibraryListFailureMessage(new Error('offline'), 2),
    /offline.*유지합니다/,
  )
  assert.match(
    policy.ontologyLibraryLoadFailureMessage(null, {
      action: 'load',
      stage: 'detail',
      schemaId: 'schema-a',
      message: 'detail failed',
      activationCompleted: true,
    }),
    /활성화는 완료.*detail failed/,
  )

  const listCalls = []
  const listClient = defaultClient({
    listSchemas() {
      const pending = deferred()
      listCalls.push(pending)
      return pending.promise
    },
  })
  const listRace = createWorkflow(useOntologyLibraryWorkspace, {
    client: listClient,
  })
  const listA = listRace.workflow.loadOntologyList({ autoLoadRecent: false })
  const listB = listRace.workflow.loadOntologyList({ autoLoadRecent: false })
  listCalls[1].resolve({
    schemas: [listEntry('schema-b', 'B')],
    activeSchemaId: null,
  })
  await listB
  listCalls[0].resolve({
    schemas: [listEntry('schema-a', 'A')],
    activeSchemaId: null,
  })
  await listA
  assert.deepEqual(
    listRace.workflow.ontologyLibraryEntries.value.map(item => item.id),
    ['schema-b'],
    'A late list response overwrote the newer B list',
  )
  listRace.scope.stop()

  let listAttempt = 0
  const retained = createWorkflow(useOntologyLibraryWorkspace, {
    client: defaultClient({
      async listSchemas() {
        listAttempt += 1
        if (listAttempt === 1) {
          return {
            schemas: [
              listEntry('valid', 'Valid'),
              listEntry('damaged', 'Damaged', { hasSchemaJson: false }),
            ],
            activeSchemaId: null,
          }
        }
        throw new Error('catalog unavailable')
      },
    }),
  })
  await retained.workflow.loadOntologyList({ autoLoadRecent: false })
  assert.deepEqual(
    retained.workflow.ontologyLibraryEntries.value.map(item => item.id),
    ['valid'],
  )
  assert.match(retained.workflow.ontologyListNotice.value, /1개를 제외/)
  await retained.workflow.loadOntologyList({ autoLoadRecent: false })
  assert.deepEqual(
    retained.workflow.ontologyLibraryEntries.value.map(item => item.id),
    ['valid'],
  )
  assert.match(retained.workflow.ontologyListError.value, /catalog unavailable.*유지합니다/)
  retained.scope.stop()

  let persistedName = 'Original'
  let renameCalls = 0
  let renameAttempt = 0
  const renamePending = deferred()
  const rename = createWorkflow(useOntologyLibraryWorkspace, {
    currentSchemaId: ref('schema-a'),
    currentSchemaName: ref('Original'),
    client: defaultClient({
      async listSchemas() {
        return {
          schemas: [listEntry('schema-a', persistedName)],
          activeSchemaId: 'schema-a',
        }
      },
      async updateSchemaName(_schemaId, name) {
        renameCalls += 1
        renameAttempt += 1
        if (renameAttempt === 1) throw new Error('rename unavailable')
        if (renameAttempt === 2) {
          await renamePending.promise
        }
        persistedName = name
      },
    }),
  })
  await rename.workflow.loadOntologyList({ autoLoadRecent: false })
  rename.workflow.startEditSchemaName('schema-a', 'Original')
  await Promise.resolve()
  assert.equal(rename.focusCount, 1)
  rename.workflow.editingSchemaName.value = 'Original'
  await rename.workflow.saveSchemaName('schema-a')
  assert.equal(renameCalls, 0, 'No-op rename called the backend')

  rename.workflow.startEditSchemaName('schema-a', 'Original')
  rename.workflow.editingSchemaName.value = 'Renamed'
  await rename.workflow.saveSchemaName('schema-a')
  assert.equal(rename.workflow.ontologyLibraryEntries.value[0].name, 'Original')
  assert.match(rename.workflow.renameError.value.message, /rename unavailable/)

  const successfulRename = rename.workflow.saveSchemaName('schema-a')
  await Promise.resolve()
  const duplicateBlur = rename.workflow.saveSchemaName('schema-a')
  assert.equal(renameCalls, 2, 'Enter and blur submitted duplicate rename requests')
  renamePending.resolve()
  await successfulRename
  await duplicateBlur
  assert.equal(rename.workflow.ontologyLibraryEntries.value[0].name, 'Renamed')
  assert.equal(rename.currentSchemaName.value, 'Renamed')
  rename.scope.stop()

  localStorage.clear()
  history.saveRecentSchemaId('schema-a')
  let deleteAttempt = 0
  const deleteCalls = []
  let deleteList = [listEntry('schema-a', 'Delete Me')]
  const deletion = createWorkflow(useOntologyLibraryWorkspace, {
    currentSchemaId: ref('schema-a'),
    currentSchemaName: ref('Delete Me'),
    client: defaultClient({
      async listSchemas() {
        return { schemas: deleteList, activeSchemaId: 'schema-a' }
      },
      async deleteSchemaById(schemaId) {
        deleteCalls.push(schemaId)
        deleteAttempt += 1
        if (deleteAttempt === 1) throw new Error('delete unavailable')
        deleteList = []
        return { success: true }
      },
    }),
  })
  await deletion.workflow.loadOntologyList({ autoLoadRecent: false })
  const deleteEntry = deletion.workflow.ontologyLibraryEntries.value[0]
  deletion.workflow.requestDeleteSchema(deleteEntry)
  deleteEntry.name = 'Mutated after dialog'
  await deletion.workflow.confirmDeleteSchema()
  assert.equal(deletion.workflow.ontologyLibraryEntries.value.length, 1)
  assert.deepEqual(deletion.deleted, [])
  assert.deepEqual(history.getRecentSchemaIds(), ['schema-a'])
  await deletion.workflow.confirmDeleteSchema()
  assert.deepEqual(deleteCalls, ['schema-a', 'schema-a'])
  assert.deepEqual(deletion.deleted, ['schema-a'])
  assert.deepEqual(history.getRecentSchemaIds(), [])
  assert.match(deletion.workflow.ontologyOperationNotice.value, /Delete Me/)
  deletion.scope.stop()

  localStorage.clear()
  let activateCalls = 0
  let detailCalls = 0
  const detailRetry = createWorkflow(useOntologyLibraryWorkspace, {
    client: defaultClient({
      async activateSchema(schemaId) {
        activateCalls += 1
        return { success: true, schemaId, name: schemaId }
      },
      async getSchemaById(schemaId) {
        detailCalls += 1
        if (detailCalls === 1) throw new Error('detail unavailable')
        return schema(schemaId, 'Loaded')
      },
    }),
  })
  await detailRetry.workflow.loadSchema('schema-a')
  assert.equal(detailRetry.workflow.loadError.value.stage, 'detail')
  assert.equal(detailRetry.workflow.loadError.value.activationCompleted, true)
  assert.deepEqual(detailRetry.applications, [])
  assert.deepEqual(history.getRecentSchemaIds(), [])
  await detailRetry.workflow.retryLoadSchema()
  assert.equal(activateCalls, 1, 'Detail retry repeated successful activation')
  assert.equal(detailCalls, 2)
  assert.equal(detailRetry.applications.length, 1)
  assert.deepEqual(history.getRecentSchemaIds(), ['schema-a'])
  assert.deepEqual(detailRetry.loadingStates.map(state => state.pending), [
    true,
    false,
    true,
    false,
  ])
  detailRetry.scope.stop()

  localStorage.clear()
  let exactActivateCalls = 0
  let exactDetailCalls = 0
  let applyAttempt = 0
  const applyInputs = []
  const applicationRetry = createWorkflow(useOntologyLibraryWorkspace, {
    client: defaultClient({
      async activateSchema(schemaId) {
        exactActivateCalls += 1
        return { success: true, schemaId, name: schemaId }
      },
      async getSchemaById(schemaId) {
        exactDetailCalls += 1
        return schema(schemaId, 'Frozen')
      },
    }),
    async applySchema(schemaId, value) {
      applyInputs.push({ schemaId, schema: structuredClone(value) })
      applyAttempt += 1
      if (applyAttempt === 1) {
        value.name = 'Mutation by failed renderer'
        value.nodes[0].name = 'Mutation by failed renderer'
        throw new Error('canvas apply unavailable')
      }
    },
  })
  await applicationRetry.workflow.loadSchema('schema-frozen')
  assert.match(
    applicationRetry.workflow.schemaApplicationError.value,
    /canvas apply unavailable/,
  )
  assert.deepEqual(history.getRecentSchemaIds(), [])
  await applicationRetry.workflow.retryLoadSchema()
  assert.equal(exactActivateCalls, 1)
  assert.equal(exactDetailCalls, 1)
  assert.equal(applyInputs.length, 2)
  assert.deepEqual(applyInputs[0], applyInputs[1])
  assert.equal(applyInputs[1].schema.name, 'Frozen')
  assert.equal(applyInputs[1].schema.nodes[0].name, 'Frozen')
  assert.deepEqual(history.getRecentSchemaIds(), ['schema-frozen'])
  applicationRetry.scope.stop()

  const disposeList = deferred()
  const disposed = createWorkflow(useOntologyLibraryWorkspace, {
    client: defaultClient({
      listSchemas() {
        return disposeList.promise
      },
    }),
  })
  const disposedLoad = disposed.workflow.loadOntologyList({ autoLoadRecent: false })
  disposed.scope.stop()
  disposeList.resolve({
    schemas: [listEntry('late', 'Late')],
    activeSchemaId: null,
  })
  await disposedLoad
  assert.deepEqual(disposed.workflow.ontologyLibraryEntries.value, [])

  console.log('Ontology library workspace lifecycle contract passed')
} finally {
  await vite.close()
}
