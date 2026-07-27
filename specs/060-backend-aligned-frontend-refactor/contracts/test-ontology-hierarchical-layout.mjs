import assert from 'node:assert/strict'
import { createServer } from 'vite'

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

function assertFinitePositions(positions) {
  for (const [nodeId, position] of Object.entries(positions)) {
    assert.equal(Number.isFinite(position.x), true, `${nodeId} x is not finite`)
    assert.equal(Number.isFinite(position.y), true, `${nodeId} y is not finite`)
  }
}

try {
  const layout = await vite.ssrLoadModule(
    '/src/workflows/ontology/model/ontologyHierarchicalLayout.ts',
  )

  const nodes = [
    { id: 'kpi-source', layer: 'KPI' },
    { id: 'kpi-terminal', layer: 'KPI' },
    { id: 'measure', layer: 'Measure' },
    { id: 'process-a', layer: 'Process' },
    { id: 'process-b', layer: 'Process' },
    { id: 'driver-a', layer: 'Driver' },
    { id: 'driver-b', layer: 'Driver' },
    { id: 'resource', layer: 'Resource' },
    { id: 'unknown', layer: 'Unrecognized' },
  ]
  const edges = [
    { source: 'kpi-source', target: 'kpi-terminal' },
    { source: 'process-a', target: 'process-b' },
    { source: 'driver-a', target: 'process-a' },
    { source: 'driver-a', target: 'kpi-terminal' },
    { source: 'driver-b', target: 'process-b' },
    { source: 'resource', target: 'driver-b' },
  ]
  const snapshot = structuredClone({ nodes, edges })
  const positions = layout.projectOntologyHierarchicalLayout(nodes, edges)

  assert.deepEqual({ nodes, edges }, snapshot)
  assert.deepEqual(positions['kpi-terminal'], { x: 260, y: 80 })
  assert.deepEqual(positions['kpi-source'], { x: 260, y: 160 })
  assert.deepEqual(positions.measure, { x: 260, y: 260 })
  assert.deepEqual(positions['process-a'], { x: 100, y: 440 })
  assert.deepEqual(positions['process-b'], { x: 280, y: 440 })
  assert.deepEqual(positions.unknown, { x: 460, y: 440 })
  assert.deepEqual(positions.resource, { x: 260, y: 800 })
  assert.deepEqual(positions['driver-a'], { x: 180, y: 620 })
  assert.deepEqual(positions['driver-b'], { x: 297.702, y: 620 })
  assertFinitePositions(positions)

  const processCycle = layout.projectOntologyHierarchicalLayout(
    [
      { id: 'process-1', layer: 'Process' },
      { id: 'process-2', layer: 'Process' },
    ],
    [
      { source: 'process-1', target: 'process-2' },
      { source: 'process-2', target: 'process-1' },
    ],
  )
  assert.deepEqual({ ...processCycle }, {
    'process-1': { x: 100, y: 440 },
    'process-2': { x: 280, y: 440 },
  })

  const depthCycle = layout.projectOntologyHierarchicalLayout(
    [
      { id: 'kpi-1', layer: 'KPI' },
      { id: 'kpi-2', layer: 'KPI' },
    ],
    [
      { source: 'kpi-1', target: 'kpi-2' },
      { source: 'kpi-2', target: 'kpi-1' },
    ],
  )
  assert.deepEqual({ ...depthCycle }, {
    'kpi-1': { x: 260, y: 80 },
    'kpi-2': { x: 420, y: 80 },
  })

  const driverOnly = layout.projectOntologyHierarchicalLayout(
    [
      { id: 'driver-1', layer: 'Driver' },
      { id: 'driver-2', layer: 'Driver' },
      { id: 'driver-disconnected', layer: 'Driver' },
    ],
    [{ source: 'driver-1', target: 'driver-2' }],
  )
  assert.equal(Object.keys(driverOnly).length, 3)
  assertFinitePositions(driverOnly)
  const sortedDriverXs = Object.values(driverOnly)
    .map(position => position.x)
    .sort((left, right) => left - right)
  assert.ok(sortedDriverXs[1] - sortedDriverXs[0] >= 112)
  assert.ok(sortedDriverXs[2] - sortedDriverXs[1] >= 112)

  const missingEndpoints = layout.projectOntologyHierarchicalLayout(
    [
      { id: 'known-process', layer: 'Process' },
      { id: 'known-resource', layer: 'Resource' },
    ],
    [
      { source: 'known-process', target: 'missing-target' },
      { source: 'missing-source', target: 'known-resource' },
    ],
  )
  assert.deepEqual({ ...missingEndpoints }, {
    'known-process': { x: 100, y: 440 },
    'known-resource': { x: 260, y: 800 },
  })
  assert.deepEqual({
    ...layout.projectOntologyHierarchicalLayout([], []),
  }, {})

  const prototypeNamedNode = layout.projectOntologyHierarchicalLayout(
    [{ id: '__proto__', layer: 'Process' }],
    [],
  )
  assert.deepEqual(prototypeNamedNode.__proto__, { x: 100, y: 440 })

  console.log('PASS ontology hierarchical layout projection contract')
} finally {
  await vite.close()
}
