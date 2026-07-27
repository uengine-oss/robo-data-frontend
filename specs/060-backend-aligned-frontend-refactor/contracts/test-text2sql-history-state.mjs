import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../../..')
const require = createRequire(join(repoRoot, '.unittest/package.json'))
const { createServer: createViteServer } = require('vite')

const probe = createServer()
await new Promise(resolveListening => probe.listen(0, '127.0.0.1', resolveListening))
const address = probe.address()
assert(address && typeof address === 'object')
const port = address.port
await new Promise(resolveClosed => probe.close(resolveClosed))

const vite = await createViteServer({
  root: repoRoot,
  server: { middlewareMode: true, hmr: false, port },
  appType: 'custom',
})

function historyItem(id, question = `question-${id}`) {
  return {
    id,
    question,
    final_sql: `SELECT '${id}'`,
    validated_sql: `SELECT '${id}'`,
    execution_result: null,
    row_count: 1,
    status: 'completed',
    error_message: null,
    steps_count: 1,
    execution_time_ms: 10,
    created_at: '2026-07-23T00:00:00Z',
    updated_at: '2026-07-23T00:00:00Z',
    metadata: null,
    steps: [],
    tables_used: [],
  }
}

function response(items, page = 1, total = items.length) {
  return { items, page, total, page_size: 20 }
}

try {
  const [{ useHistoryStore }, { text2sqlApi }, { createPinia }] = await Promise.all([
    vite.ssrLoadModule('/src/domains/text2sql/state/history.ts'),
    vite.ssrLoadModule('/src/domains/text2sql/api/client.ts'),
    vite.ssrLoadModule('/node_modules/pinia/dist/pinia.mjs'),
  ])
  const store = useHistoryStore(createPinia())

  const pending = []
  text2sqlApi.getHistory = options => new Promise(resolveRequest => {
    pending.push({ options, resolveRequest })
  })
  const oldRequest = store.fetchHistory({ page: 1, search: 'old' })
  const newRequest = store.fetchHistory({ page: 1, search: 'new' })
  pending[1].resolveRequest(response([historyItem('new')], 1, 41))
  await newRequest
  pending[0].resolveRequest(response([historyItem('old')], 1, 1))
  await oldRequest
  assert.deepEqual(store.items.map(item => item.id), ['new'])
  assert.equal(store.activeSearch, 'new')
  assert.equal(store.total, 41)

  let pageRequest
  text2sqlApi.getHistory = async options => {
    pageRequest = options
    return response([historyItem('page-2')], 2, 41)
  }
  await store.nextPage()
  assert.deepEqual(pageRequest, {
    page: 2,
    pageSize: 20,
    search: 'new',
    status: undefined,
  })
  assert.equal(store.page, 2)

  store.items = [historyItem('one'), historyItem('two')]
  store.total = 2
  store.selectItem(store.items[0])
  text2sqlApi.deleteHistory = async () => {
    throw new Error('delete failed')
  }
  await assert.rejects(() => store.deleteHistory('one'), /delete failed/)
  assert.deepEqual(store.items.map(item => item.id), ['one', 'two'])
  assert.equal(store.total, 2)
  assert.equal(store.selectedItem?.id, 'one')

  text2sqlApi.deleteHistory = async () => {}
  await store.deleteHistory('one')
  assert.deepEqual(store.items.map(item => item.id), ['two'])
  assert.equal(store.total, 1)
  assert.equal(store.selectedItem, null)

  store.selectItem(store.items[0])
  text2sqlApi.deleteAllHistory = async () => {
    throw new Error('delete all failed')
  }
  await assert.rejects(() => store.deleteAllHistory(), /delete all failed/)
  assert.deepEqual(store.items.map(item => item.id), ['two'])
  assert.equal(store.selectedItem?.id, 'two')

  text2sqlApi.deleteAllHistory = async () => {}
  await store.deleteAllHistory()
  assert.deepEqual(store.items, [])
  assert.equal(store.total, 0)
  assert.equal(store.selectedItem, null)

  console.log('Text2SQL history state: request race + filter pagination + mutation commit/rollback passed')
} finally {
  await vite.close()
}
