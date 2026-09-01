import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import ts from 'typescript'

const sourcePath = resolve('src/shared/utils/nodeLabels.ts')
const source = await readFile(sourcePath, 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: sourcePath,
}).outputText
const labels = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

const plainFunction = {
  labels: ['FUNCTION'],
  properties: {},
}
const queryFunction = {
  labels: ['FUNCTION'],
  properties: { stereotype: 'QUERY' },
}
const table = {
  labels: ['TABLE'],
  properties: {},
}

assert.equal(labels.kindOfNode(queryFunction), 'FUNCTION', 'concrete graph label is the node kind')
assert.deepEqual(labels.semanticRoleLabels(queryFunction), ['QUERY'], 'stereotype is the semantic role')

const functionThenQuery = ['FUNCTION', 'QUERY']
assert.equal(labels.colorLabelOfNode(plainFunction, functionThenQuery), 'FUNCTION')
assert.equal(labels.colorLabelOfNode(queryFunction, functionThenQuery), 'QUERY')
assert.equal(labels.colorLabelOfNode(table, functionThenQuery), 'TABLE')

const tableAndQuery = ['TABLE', 'QUERY']
assert.equal(labels.colorLabelOfNode(table, tableAndQuery), 'TABLE')
assert.equal(labels.colorLabelOfNode(queryFunction, tableAndQuery), 'QUERY')
assert.equal(labels.colorLabelOfNode(plainFunction, tableAndQuery), 'FUNCTION')

const multiRole = {
  labels: ['FUNCTION', 'COMMAND', 'EXTERNAL'],
  properties: { stereotype: 'QUERY' },
}
assert.deepEqual(labels.semanticRoleLabels(multiRole), ['COMMAND', 'QUERY'])
assert.equal(labels.colorLabelOfNode(multiRole, ['COMMAND', 'QUERY']), 'QUERY', 'latest matching role wins')
assert.equal(labels.colorLabelOfNode(multiRole, ['QUERY', 'COMMAND']), 'COMMAND', 'selection order is deterministic')
assert.equal(labels.colorLabelOfNode(queryFunction, ['TABLE']), 'FUNCTION', 'unrelated selection preserves kind color')

const [nvlSource, detailSource, graphTabSource, canvasSource] = await Promise.all([
  readFile(resolve('src/features/code-analysis/components/graph/NvlGraph.vue'), 'utf8'),
  readFile(resolve('src/features/code-analysis/components/graph/node-detail/NodeDetailBase.vue'), 'utf8'),
  readFile(resolve('src/features/code-analysis/components/graph/GraphTab.vue'), 'utf8'),
  readFile(resolve('src/features/code-analysis/graphCanvas.ts'), 'utf8'),
])
assert.match(nvlSource, /colorLabelOfNode\(\{ labels, properties \}, isolatedSet\.value\)/, 'canvas must use the node-aware resolver')
assert.match(
  nvlSource,
  /const finish = \(\) => \{[\s\S]*?needsFit = false[\s\S]*?fitTimer = undefined/,
  'initial framing must release camera ownership before later style updates',
)
assert.match(detailSource, /colorLabelOfNode\(props\.node, canvasStore\.loadedLabels\)/, 'Node detail must use the same resolver')
assert.doesNotMatch(`${nvlSource}\n${detailSource}`, /colorLabelOf\(/, 'legacy label-only color resolver must not return')
assert.match(graphTabSource, /const activeNodeLoads = computed\(\(\) => \[\.\.\.loadedLabels\.value\]\)/, 'active label order must reach the canvas unchanged')
assert.match(canvasSource, /const s = new Set\(loadedLabels\.value\)[\s\S]*s\.has\(label\) \? s\.delete\(label\) : s\.add\(label\)/, 'loaded label Set must preserve activation order and exact case')

console.log('node label role lens regression: OK')
