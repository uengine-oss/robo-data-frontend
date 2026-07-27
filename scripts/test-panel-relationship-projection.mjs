import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const sourceUrl = new URL('../src/features/code-analysis/panelGraphProjection.ts', import.meta.url)
const source = await readFile(sourceUrl, 'utf8')
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  fileName: sourceUrl.pathname,
}).outputText
const moduleUrl = `data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`
const { buildPanelGraphProjection } = await import(moduleUrl)

const nodes = [
  { id: 'fn:a', labels: ['FUNCTION'], properties: {} },
  { id: 'table:b', labels: ['TABLE'], properties: {} },
  { id: 'fn:c', labels: ['FUNCTION'], properties: {} },
]
const links = [
  { id: 'reads:a-b', source: 'fn:a', target: 'table:b', type: 'READS', properties: {} },
  { id: 'has-rule:a-b', source: 'fn:a', target: 'table:b', type: 'HAS_RULE', properties: {} },
  { id: 'calls:a-c', source: 'fn:a', target: 'fn:c', type: 'CALLS', properties: {} },
]

const readsOnly = buildPanelGraphProjection(nodes, links, new Set(), new Set(['READS']))
assert.deepEqual([...readsOnly.nodeIds].sort(), ['fn:a', 'table:b'])
assert.deepEqual([...readsOnly.linkIds], ['reads:a-b'])

const bothRelationships = buildPanelGraphProjection(
  nodes,
  links,
  new Set(),
  new Set(['READS', 'HAS_RULE']),
)
assert.deepEqual([...bothRelationships.linkIds].sort(), ['has-rule:a-b', 'reads:a-b'])

const functionLabelAndReads = buildPanelGraphProjection(
  nodes,
  links,
  new Set(['FUNCTION']),
  new Set(['READS']),
)
assert.deepEqual([...functionLabelAndReads.nodeIds].sort(), ['fn:a', 'fn:c', 'table:b'])
assert.deepEqual([...functionLabelAndReads.linkIds].sort(), ['calls:a-c', 'reads:a-b'])

console.log('OK - panel relationship projection excludes unrelated endpoint-sharing links')
