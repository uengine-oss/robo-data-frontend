import assert from 'node:assert/strict'
import { createParserClient } from '../../../src/domains/parser/api/client.ts'

const calls = []
const logs = []
const metadata = {
  strategy: 'dbms',
  target: 'postgresql',
  nameCase: 'lowercase',
  inferFkRelations: true,
}
const headers = { 'X-Neo4j-Database': 'contract-db' }

const source = new File(['select 1'], 'table.sql', { type: 'text/plain' })
Object.defineProperty(source, 'webkitRelativePath', { value: 'source/table.sql' })
const ddl = new File(['create table t(id int)'], 't.sql', { type: 'text/plain' })
Object.defineProperty(ddl, 'webkitRelativePath', { value: 'ddl/t.sql' })

const client = createParserClient({
  baseUrl: '/api/gateway/antlr',
  normalizeUploadPath: (file) => file.webkitRelativePath || file.name,
  postJson: async (url, body, requestHeaders) => {
    calls.push({ kind: 'json', url, body, headers: requestHeaders })
    return { status: 'complete' }
  },
  postFormData: async (url, body, requestHeaders) => {
    calls.push({ kind: 'form', url, body, headers: requestHeaders })
    return { files: [], ddlFiles: [] }
  },
  stream: async (url, body, requestHeaders, onEvent) => {
    calls.push({ kind: 'stream', url, body, headers: requestHeaders })
    onEvent({ type: 'detected', content: '{"target":"postgresql"}' })
  },
  log: (...values) => logs.push(values.join(' ')),
})

await client.uploadFiles(metadata, [source, ddl], headers)
await client.parse(metadata, headers)
const events = []
await client.parseStream(metadata, headers, (event) => events.push(event))

assert.deepEqual(calls.map(({ kind, url }) => [kind, url]), [
  ['form', '/api/gateway/antlr/fileUpload'],
  ['json', '/api/gateway/antlr/parsing'],
  ['stream', '/api/gateway/antlr/parsing'],
])
assert.equal(calls[0].body.get('metadata'), JSON.stringify(metadata))
assert.deepEqual(calls[0].body.getAll('files').map((file) => file.name), [
  'source/table.sql',
  'ddl/t.sql',
])
assert.equal(calls[0].headers, headers)
assert.equal(calls[1].body, metadata)
assert.equal(calls[1].headers, headers)
assert.equal(calls[2].body, metadata)
assert.equal(calls[2].headers, headers)
assert.deepEqual(events, [{ type: 'detected', content: '{"target":"postgresql"}' }])
assert(logs.some((line) => line.includes('DDL 파일 수: 1개')))

console.log('Parser client contract: upload form + JSON parse + stream parse passed')
