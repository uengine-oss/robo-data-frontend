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

try {
  const { commitMutationThenRefresh } = await vite.ssrLoadModule(
    '/src/workflows/observability/application/commitMutationThenRefresh.ts',
  )
  const original = [{ id: 'one', active: true }, { id: 'two', active: false }]

  let mutationCalls = 0
  const deleted = await commitMutationThenRefresh({
    currentItems: original,
    mutate: async () => {
      mutationCalls += 1
    },
    commit: items => items.filter(item => item.id !== 'one'),
    refresh: async () => {
      throw new Error('refresh unavailable')
    },
    describeRefreshError: cause => `목록 갱신 실패: ${cause.message}`,
  })
  assert.equal(mutationCalls, 1)
  assert.deepEqual(deleted.items, [{ id: 'two', active: false }])
  assert.equal(deleted.refreshError, '목록 갱신 실패: refresh unavailable')

  const toggled = await commitMutationThenRefresh({
    currentItems: original,
    mutate: async () => false,
    commit: (items, active) => items.map(item => item.id === 'one' ? { ...item, active } : item),
    refresh: async () => [{ id: 'server', active: true }],
    describeRefreshError: () => 'unused',
  })
  assert.deepEqual(toggled, {
    items: [{ id: 'server', active: true }],
    refreshError: null,
  })

  let commitCalled = false
  await assert.rejects(
    commitMutationThenRefresh({
      currentItems: original,
      mutate: async () => {
        throw new Error('primary mutation failed')
      },
      commit: items => {
        commitCalled = true
        return [...items]
      },
      refresh: async () => [],
      describeRefreshError: () => 'unused',
    }),
    /primary mutation failed/,
  )
  assert.equal(commitCalled, false)
  assert.deepEqual(original, [{ id: 'one', active: true }, { id: 'two', active: false }])

  console.log('Observability mutations: primary commit, refresh warning, and failure invariance passed')
} finally {
  await vite.close()
}
