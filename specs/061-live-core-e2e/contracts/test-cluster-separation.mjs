import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const sourceUrl = new URL(
  '../../../src/features/code-analysis/components/graph/clusterGeometry.ts',
  import.meta.url,
)
const source = await readFile(sourceUrl, 'utf8')
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  fileName: sourceUrl.pathname,
}).outputText
const moduleUrl = `data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`
const { planSevereClusterSeparation } = await import(moduleUrl)

const rectangle = (key, x, y, width, height) => ({
  key,
  points: [
    { id: `${key}:1`, x, y },
    { id: `${key}:2`, x: x + width, y },
    { id: `${key}:3`, x: x + width, y: y + height },
    { id: `${key}:4`, x, y: y + height },
  ],
})

const clusters = [
  rectangle('a', 0, 0, 100, 100),
  rectangle('b', 20, 10, 100, 100),
  rectangle('c', 250, 0, 100, 100),
]
const plan = planSevereClusterSeparation(clusters, {
  severeOverlapRatio: 0.35,
  gap: 24,
})

assert.equal(plan.before.length, 1)
assert(plan.before[0].ratioToSmaller > 0.7)
assert.equal(plan.adjustedPairCount, 1)
assert(plan.after.every(overlap => overlap.ratioToSmaller < 0.35))

const originalById = new Map(clusters.flatMap(cluster => cluster.points).map(point => [point.id, point]))
for (const cluster of clusters) {
  const moved = plan.positions.filter(point => point.id?.startsWith(`${cluster.key}:`))
  assert.equal(moved.length, cluster.points.length)
  const firstOriginal = originalById.get(moved[0].id)
  const dx = moved[0].x - firstOriginal.x
  const dy = moved[0].y - firstOriginal.y
  for (const point of moved) {
    const original = originalById.get(point.id)
    assert(Math.abs((point.x - original.x) - dx) < 1e-7)
    assert(Math.abs((point.y - original.y) - dy) < 1e-7)
    assert.equal('pinned' in point, false)
  }
}

const fullSeparationDistance = 124
const maxTranslation = Math.max(
  ...plan.translations.map(translation => Math.hypot(translation.dx, translation.dy)),
)
assert(
  maxTranslation < fullSeparationDistance,
  `threshold-limited movement unexpectedly used full separation: ${maxTranslation}`,
)

const repeated = planSevereClusterSeparation(clusters, {
  severeOverlapRatio: 0.35,
  gap: 24,
})
assert.deepEqual(repeated, plan)

console.log('OK - severe cluster overlap is reduced once by rigid, unpinned, threshold-limited translation')
