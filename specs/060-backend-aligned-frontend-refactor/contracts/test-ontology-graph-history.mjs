import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { effectScope, ref } from 'vue'

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

function shortcutEvent(overrides = {}) {
  let prevented = false
  return {
    key: 'z',
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    defaultPrevented: false,
    target: null,
    preventDefault() {
      prevented = true
    },
    wasPrevented() {
      return prevented
    },
    ...overrides,
  }
}

try {
  const policy = await vite.ssrLoadModule(
    '/src/workflows/ontology/model/graphHistory.ts',
  )
  const { useOntologyGraphHistory } = await vite.ssrLoadModule(
    '/src/workflows/ontology/composables/useOntologyGraphHistory.ts',
  )

  const sourceNodes = [{
    id: 'a',
    position: { x: 10, y: 20 },
    fields: [{ name: 'amount' }],
  }]
  const sourceRelationships = [{
    id: 'r1',
    properties: { nested: { weight: 0.5 } },
  }]
  const snapshot = policy.cloneOntologyGraphHistorySnapshot(
    sourceNodes,
    sourceRelationships,
  )
  sourceNodes[0].position.x = 999
  sourceNodes[0].fields[0].name = 'changed'
  sourceRelationships[0].properties.nested.weight = 1
  assert.equal(snapshot.nodes[0].position.x, 10)
  assert.equal(snapshot.nodes[0].fields[0].name, 'amount')
  assert.equal(snapshot.relationships[0].properties.nested.weight, 0.5)

  assert.deepEqual(policy.appendBoundedHistory([1, 2], 3, 2), [2, 3])
  assert.throws(() => policy.appendBoundedHistory([], 1, 0), /1 이상의 정수/)
  assert.equal(
    policy.resolveGraphHistoryShortcut(shortcutEvent()),
    'undo',
  )
  assert.equal(
    policy.resolveGraphHistoryShortcut(shortcutEvent({ shiftKey: true })),
    'redo',
  )
  assert.equal(
    policy.resolveGraphHistoryShortcut(shortcutEvent({ key: 'y' })),
    'redo',
  )
  assert.equal(
    policy.resolveGraphHistoryShortcut(shortcutEvent({ altKey: true })),
    null,
  )

  const nodes = ref([{ id: 'a', nested: { value: 1 } }])
  const relationships = ref([])
  let renderCount = 0
  const scope = effectScope()
  const history = scope.run(() => useOntologyGraphHistory({
    nodes,
    relationships,
    maximumSize: 2,
    onRestore: () => {
      renderCount += 1
    },
  }))
  assert(history)

  const emptyEvent = shortcutEvent()
  assert.equal(history.handleShortcut(emptyEvent), false)
  assert.equal(emptyEvent.wasPrevented(), false)
  assert.equal(renderCount, 0)

  history.checkpoint()
  nodes.value[0].nested.value = 2
  nodes.value.push({ id: 'b', nested: { value: 2 } })
  const undoEvent = shortcutEvent()
  assert.equal(history.handleShortcut(undoEvent), true)
  assert.equal(undoEvent.wasPrevented(), true)
  assert.deepEqual(nodes.value, [{ id: 'a', nested: { value: 1 } }])
  assert.equal(renderCount, 1)
  assert.equal(history.canRedo.value, true)

  assert.equal(history.redo(), true)
  assert.equal(nodes.value.length, 2)
  assert.equal(nodes.value[0].nested.value, 2)
  assert.equal(renderCount, 2)

  assert.equal(history.undo(), true)
  history.checkpoint()
  nodes.value.push({ id: 'c', nested: { value: 3 } })
  assert.equal(history.canRedo.value, false)
  assert.equal(history.redo(), false)

  history.clear()
  nodes.value = [{ id: 'state-0', nested: { value: 0 } }]
  history.checkpoint()
  nodes.value = [{ id: 'state-1', nested: { value: 1 } }]
  history.checkpoint()
  nodes.value = [{ id: 'state-2', nested: { value: 2 } }]
  history.checkpoint()
  nodes.value = [{ id: 'state-3', nested: { value: 3 } }]
  assert.equal(history.undo(), true)
  assert.equal(nodes.value[0].id, 'state-2')
  assert.equal(history.undo(), true)
  assert.equal(nodes.value[0].id, 'state-1')
  assert.equal(history.undo(), false, 'evicted history entry remained restorable')

  const PreviousElement = globalThis.Element
  class EditableElement {
    closest() {
      return this
    }
  }
  globalThis.Element = EditableElement
  history.checkpoint()
  nodes.value = [{ id: 'should-stay', nested: { value: 4 } }]
  const editableEvent = shortcutEvent({ target: new EditableElement() })
  assert.equal(history.handleShortcut(editableEvent), false)
  assert.equal(editableEvent.wasPrevented(), false)
  assert.equal(nodes.value[0].id, 'should-stay')
  if (PreviousElement === undefined) delete globalThis.Element
  else globalThis.Element = PreviousElement

  history.clear()
  assert.equal(history.canUndo.value, false)
  assert.equal(history.canRedo.value, false)
  scope.stop()

  console.log('Ontology graph history contracts passed')
} finally {
  await vite.close()
}
