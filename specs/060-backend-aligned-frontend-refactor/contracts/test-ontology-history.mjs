import assert from 'node:assert/strict'
import { createServer } from 'vite'

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

const RECENT_KEY = 'robo-analyzer-recent-schemas'
const SELECTED_KEY = 'robo-analyzer-selected-nodes'
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' })

try {
  const history = await vite.ssrLoadModule('/src/workflows/ontology/model/ontologyHistory.ts')
  const storage = new MemoryStorage()

  assert.deepEqual(history.getRecentSchemaIds(storage), [])
  for (let index = 0; index < 55; index += 1) {
    history.saveRecentSchemaId(`schema-${index}`, storage)
  }
  assert.equal(history.getRecentSchemaIds(storage).length, 50)
  assert.equal(history.getRecentSchemaIds(storage)[0], 'schema-54')
  assert.equal(history.getRecentSchemaIds(storage).at(-1), 'schema-5')

  history.saveRecentSchemaId('schema-20', storage)
  assert.equal(history.getRecentSchemaIds(storage)[0], 'schema-20')
  assert.equal(history.getRecentSchemaIds(storage).filter(id => id === 'schema-20').length, 1)
  history.removeRecentSchemaId('schema-20', storage)
  assert.equal(history.getRecentSchemaIds(storage).includes('schema-20'), false)

  for (let index = 0; index < 105; index += 1) {
    history.saveSelectedNode(`schema-${index % 3}`, `node-${index}`, storage, index)
  }
  assert.equal(history.getSelectedNodes(storage).length, 100)
  assert.equal(history.getSelectedNodes(storage)[0].nodeId, 'node-104')
  assert.equal(history.getSelectedNodes(storage).at(-1).nodeId, 'node-5')
  assert.equal(history.getSelectedNodeIdForSchema('schema-2', storage), 'node-104')

  history.saveSelectedNode('schema-2', 'node-104', storage, 999)
  const selected = history.getSelectedNodes(storage)
  assert.equal(selected[0].timestamp, 999)
  assert.equal(selected.filter(item => item.schemaId === 'schema-2' && item.nodeId === 'node-104').length, 1)

  history.removeSelectedNode('schema-2', 'node-104', storage)
  assert.equal(history.getSelectedNodes(storage).some(item => item.nodeId === 'node-104'), false)
  history.removeSelectedNodesForSchema('schema-1', storage)
  assert.equal(history.getSelectedNodes(storage).some(item => item.schemaId === 'schema-1'), false)

  storage.setItem(RECENT_KEY, JSON.stringify(['valid', 1, null, {}]))
  assert.deepEqual(history.getRecentSchemaIds(storage), ['valid'])
  storage.setItem(SELECTED_KEY, JSON.stringify([
    { schemaId: 'valid', nodeId: 'node', timestamp: 1 },
    { schemaId: 'invalid', nodeId: 2, timestamp: 1 },
  ]))
  assert.deepEqual(history.getSelectedNodes(storage), [
    { schemaId: 'valid', nodeId: 'node', timestamp: 1 },
  ])

  const originalWarn = console.warn
  console.warn = () => {}
  try {
    storage.setItem(RECENT_KEY, '{invalid json')
    storage.setItem(SELECTED_KEY, '{invalid json')
    assert.deepEqual(history.getRecentSchemaIds(storage), [])
    assert.deepEqual(history.getSelectedNodes(storage), [])
  } finally {
    console.warn = originalWarn
  }

  console.log('Ontology history contract passed')
} finally {
  await vite.close()
}
