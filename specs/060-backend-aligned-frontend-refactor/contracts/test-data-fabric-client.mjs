import assert from 'node:assert/strict'
import { createDataFabricClient } from '../../../src/domains/data-fabric/api/client.ts'

const calls = []
const responseBody = { ok: true }
const client = createDataFabricClient({
  baseUrl: '/api/gateway/data-fabric',
  getHeaders: () => ({ 'Accept-Language': 'ko', 'X-Neo4j-Database': 'test-db' }),
  fetchImpl: async (url, options = {}) => {
    calls.push({ url, options })
    return {
      ok: true,
      statusText: 'OK',
      json: async () => responseBody,
    }
  },
})

await client.list()
await client.create({ name: 'sample', engine: 'postgres', parameters: { host: 'db' } })
await client.get('sample')
await client.delete('sample')
await client.getTables('sample')
await client.testConnection('sample')
await client.testConnectionWithParams({ engine: 'postgres', host: 'db', port: 5432 })
await client.checkHealth('sample')
await client.query({ datasource: 'sample', query: 'SELECT 1', max_rows: 25 })

const expected = [
  ['GET', '/api/gateway/data-fabric/api/datasources'],
  ['POST', '/api/gateway/data-fabric/api/datasources'],
  ['GET', '/api/gateway/data-fabric/api/datasources/sample'],
  ['DELETE', '/api/gateway/data-fabric/api/datasources/sample'],
  ['GET', '/api/gateway/data-fabric/api/datasources/sample/tables'],
  ['POST', '/api/gateway/data-fabric/api/datasources/sample/test?source=mindsdb'],
  ['POST', '/api/gateway/data-fabric/api/datasources/test-connection'],
  ['GET', '/api/gateway/data-fabric/api/datasources/sample/health'],
  ['POST', '/api/gateway/data-fabric/api/query'],
]

assert.equal(calls.length, expected.length)
calls.forEach((call, index) => {
  assert.equal(call.options.method ?? 'GET', expected[index][0])
  assert.equal(call.url, expected[index][1])
  assert.equal(call.options.headers['Content-Type'], 'application/json')
  assert.equal(call.options.headers['Accept-Language'], 'ko')
  assert.equal(call.options.headers['X-Neo4j-Database'], 'test-db')
})

assert.equal(
  calls[1].options.body,
  JSON.stringify({ name: 'sample', engine: 'postgres', parameters: { host: 'db' } }),
)
assert.equal(
  calls[6].options.body,
  JSON.stringify({ engine: 'postgres', host: 'db', port: 5432 }),
)
assert.equal(
  calls[8].options.body,
  JSON.stringify({ datasource: 'sample', query: 'SELECT 1', max_rows: 25 }),
)

const failingClient = createDataFabricClient({
  baseUrl: '/api/gateway/data-fabric',
  getHeaders: () => ({}),
  fetchImpl: async () => ({
    ok: false,
    statusText: 'Bad Gateway',
    json: async () => ({ detail: 'fabric unavailable' }),
  }),
})

await assert.rejects(() => failingClient.list(), /fabric unavailable/)
console.log('Data Fabric client contract: 9 endpoints + session headers + error propagation passed')
