// lite L-1 (2026-11-19): catalog 가 FK `_owner` 가 비어 있을 때 보내는 source 'ddl'
// (또는 다른 값) 때문에 관련 테이블 응답 전체를 버리던 것.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const sourceUrl = new URL('../src/domains/catalog/api/schemaContracts.ts', import.meta.url)
const source = await readFile(sourceUrl, 'utf8')
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  fileName: sourceUrl.pathname,
}).outputText
const moduleUrl = `data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`
const { parseRelatedTables } = await import(moduleUrl)

const rel = (from, to, src) => ({
  from_table: from,
  to_table: to,
  type: 'FK',
  source: src,
  column_pairs: [{ source: 'id', target: `${to}_id` }],
})

const parsed = parseRelatedTables({
  base_table: 'EMP',
  tables: [
    { name: 'EMP', schema: 'public' },
    { name: 'DEPT', schema: 'public' },
    { name: 'JOB', schema: 'public' },
    { name: 'LOC', schema: 'public' },
  ],
  relationships: [
    rel('EMP', 'DEPT', 'ddl'),
    rel('EMP', 'JOB', 'analyzer'),
    rel('DEPT', 'LOC', 'inferred'),
    rel('EMP', 'LOC', null),
  ],
})

assert.equal(parsed.relationships.length, 4, '관계 하나 때문에 전체를 버리지 않는다')
assert.deepEqual(
  parsed.relationships.map(r => r.source),
  ['ddl', 'analyzer', undefined, undefined],
)
assert.equal(parsed.relationships[0].column_pairs[0].target, 'DEPT_id')

// 형식 자체가 틀린 것은 여전히 거부한다
assert.throws(() =>
  parseRelatedTables({
    base_table: 'EMP',
    tables: [],
    relationships: [{ ...rel('EMP', 'DEPT', 'ddl'), type: 'CALLS' }],
  }),
)

console.log('related-tables contract: ok')
