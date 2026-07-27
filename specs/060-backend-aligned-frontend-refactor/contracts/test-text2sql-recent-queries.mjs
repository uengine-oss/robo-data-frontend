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
  const module = await vite.ssrLoadModule('/src/domains/text2sql/application/recentQueries.ts')
  const values = new Map()
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }

  values.set('recent', JSON.stringify(['  첫 질문  ', '첫 질문', 3, '두 번째 질문']))
  assert.deepEqual(module.readRecentQueries(storage, 'recent'), {
    queries: ['첫 질문', '두 번째 질문'],
    warning: null,
  })

  values.set('recent', '{"broken":true}')
  assert.equal(module.readRecentQueries(storage, 'recent').warning, '저장된 최근 질문을 불러오지 못했습니다.')

  const appended = module.appendRecentQuery(['기존 질문', '중복 질문'], ' 중복 질문 ')
  assert.deepEqual(appended, ['중복 질문', '기존 질문'])

  const writeFailure = module.persistRecentQuery({
    getItem: storage.getItem,
    setItem: () => { throw new Error('quota') },
  }, 'recent', ['기존 질문'], '새 질문')
  assert.deepEqual(writeFailure.queries, ['새 질문', '기존 질문'])
  assert.equal(writeFailure.warning, '최근 질문을 이 브라우저에 저장하지 못했습니다.')

  console.log('Text2SQL recent-query parser, normalization, deduplication, and persistence warning passed')
} finally {
  await vite.close()
}
