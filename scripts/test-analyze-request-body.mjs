// analyzer `/robo/analyze` 본문 — analyzer 가 받는 넷만 나가는지(extra="forbid" 라 하나라도 더 가면 422).
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const sourceUrl = new URL('../src/domains/analyzer/api/analyzeRequest.ts', import.meta.url)
const source = await readFile(sourceUrl, 'utf8')
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  fileName: sourceUrl.pathname,
}).outputText
const moduleUrl = `data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`
const { toAnalyzeRequestBody } = await import(moduleUrl)

// analyzer AnalyzeRequest 의 칸 (robo-data-analyzer api/analyze_router.py)
const ALLOWED = new Set(['strategy', 'locale', 'selected_source_ids', 'datasource'])

// 화면이 실제로 만드는 메타데이터(code-analysis/state/analyzer.ts 의 analyzeMeta) 그대로
const uiMeta = {
  strategy: 'framework',
  target: 'java',
  nameCase: 'original',
  datasource: null,
  inferFkRelations: false,
  project_root: undefined,
  targetFolder: 'src',
}
const body = toAnalyzeRequestBody(uiMeta)
for (const key of Object.keys(body)) assert.ok(ALLOWED.has(key), `analyzer 가 모르는 칸이 나간다: ${key}`)
assert.deepEqual(body, { strategy: 'framework', datasource: null })

// datasource 를 고르면 그대로 간다
assert.deepEqual(toAnalyzeRequestBody({ ...uiMeta, datasource: 'erp' }), { strategy: 'framework', datasource: 'erp' })
// dbms 전략 · 선택한 소스
assert.deepEqual(
  toAnalyzeRequestBody({ strategy: 'dbms', target: 'oracle', selected_source_ids: ['s1'] }),
  { strategy: 'dbms', selected_source_ids: ['s1'] },
)

console.log('OK - analyze request body sends only the analyzer contract fields')
