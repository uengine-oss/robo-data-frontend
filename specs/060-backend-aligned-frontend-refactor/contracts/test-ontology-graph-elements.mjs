import assert from 'node:assert/strict'
import { createServer } from 'vite'

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

function edgeData(projection, id) {
  const element = projection.elements.find(item => item.data.id === id)
  assert.ok(element, `missing graph element: ${id}`)
  return element.data
}

try {
  const graph = await vite.ssrLoadModule(
    '/src/workflows/ontology/model/ontologyGraphElements.ts',
  )

  assert.deepEqual(
    graph.ONTOLOGY_CANVAS_LAYERS.map(layer => ({
      id: layer.id,
      color: layer.color,
      rank: layer.rank,
    })),
    [
      { id: 'KPI', color: '#ef4444', rank: 0 },
      { id: 'Measure', color: '#f97316', rank: 1 },
      { id: 'Process', color: '#22c55e', rank: 2 },
      { id: 'Driver', color: '#eab308', rank: 3 },
      { id: 'Resource', color: '#3b82f6', rank: 4 },
    ],
  )
  assert.equal(graph.getOntologyCanvasLayerColor('unknown'), '#888')
  assert.equal(graph.getOntologyCanvasLayerRank('unknown'), 2)

  const nodes = [
    {
      id: 'kpi',
      name: 'KPI',
      label: 'KPI',
      position: { x: 10, y: 20 },
    },
    {
      id: 'resource',
      name: 'Resource',
      label: 'Resource',
      position: { x: 30, y: 40 },
    },
    {
      id: 'process-a',
      name: 'Process A',
      label: 'Process',
      position: { x: 50, y: 60 },
    },
    {
      id: 'process-b',
      name: 'Process B',
      label: 'Process',
      position: { x: 70, y: 80 },
    },
  ]
  const relationships = [
    {
      id: 'bottom-up',
      source: 'resource',
      target: 'kpi',
      type: 'CAUSES',
      weight: 0.8,
    },
    {
      id: 'top-down',
      source: 'kpi',
      target: 'resource',
      type: 'CAUSES',
    },
    {
      id: 'same-upward',
      source: 'process-a',
      target: 'process-b',
      type: 'CAUSES',
    },
    {
      id: 'same-downward',
      source: 'process-a',
      target: 'process-b',
      type: 'MEASURED_AS',
      weight: 0,
    },
    {
      id: 'precedes',
      source: 'process-a',
      target: 'process-b',
      type: 'PRECEDES',
    },
    {
      id: 'follows',
      source: 'process-a',
      target: 'process-b',
      type: 'FOLLOWS',
    },
    {
      id: 'unknown',
      source: 'kpi',
      target: 'resource',
      type: 'CUSTOM',
    },
  ]
  const snapshot = structuredClone({ nodes, relationships })
  const projection = graph.projectOntologyGraphElements(nodes, relationships)

  assert.deepEqual({ nodes, relationships }, snapshot)
  assert.equal(projection.hasCompletePositions, true)
  assert.equal(projection.elements.length, nodes.length + relationships.length)
  assert.deepEqual(projection.elements[0], {
    data: {
      id: 'kpi',
      label: 'KPI',
      layer: 'KPI',
      color: '#ef4444',
    },
    position: { x: 10, y: 20 },
  })
  assert.deepEqual(edgeData(projection, 'bottom-up'), {
    id: 'bottom-up',
    source: 'resource',
    target: 'kpi',
    type: 'CAUSES',
    label: 'CAUSES',
    weight: 0.8,
    sourceLayer: 'Resource',
    targetLayer: 'KPI',
  })
  assert.deepEqual(
    {
      source: edgeData(projection, 'top-down').source,
      target: edgeData(projection, 'top-down').target,
      type: edgeData(projection, 'top-down').type,
    },
    { source: 'resource', target: 'kpi', type: 'CAUSED_BY' },
  )
  assert.deepEqual(
    {
      source: edgeData(projection, 'same-upward').source,
      target: edgeData(projection, 'same-upward').target,
      type: edgeData(projection, 'same-upward').type,
    },
    { source: 'process-a', target: 'process-b', type: 'CAUSES' },
  )
  assert.deepEqual(
    {
      source: edgeData(projection, 'same-downward').source,
      target: edgeData(projection, 'same-downward').target,
      type: edgeData(projection, 'same-downward').type,
      weight: edgeData(projection, 'same-downward').weight,
    },
    {
      source: 'process-b',
      target: 'process-a',
      type: 'MEASURES',
      weight: 0.5,
    },
  )
  assert.deepEqual(
    {
      source: edgeData(projection, 'precedes').source,
      target: edgeData(projection, 'precedes').target,
      type: edgeData(projection, 'precedes').type,
    },
    { source: 'process-a', target: 'process-b', type: 'NEXT' },
  )
  assert.deepEqual(
    {
      source: edgeData(projection, 'follows').source,
      target: edgeData(projection, 'follows').target,
      type: edgeData(projection, 'follows').type,
    },
    { source: 'process-b', target: 'process-a', type: 'NEXT' },
  )
  assert.deepEqual(
    {
      source: edgeData(projection, 'unknown').source,
      target: edgeData(projection, 'unknown').target,
      type: edgeData(projection, 'unknown').type,
    },
    { source: 'resource', target: 'kpi', type: 'REV_CUSTOM' },
  )

  const partialPosition = graph.projectOntologyGraphElements([
    nodes[0],
    {
      id: 'partial',
      name: 'Partial',
      label: 'Process',
      position: { x: 10 },
    },
  ], [])
  assert.equal(partialPosition.hasCompletePositions, false)
  assert.equal(partialPosition.elements[1].position, undefined)

  const invalidPosition = graph.projectOntologyGraphElements([
    {
      id: 'invalid',
      name: 'Invalid',
      label: 'Process',
      position: { x: Number.NaN, y: Number.POSITIVE_INFINITY },
    },
  ], [])
  assert.equal(invalidPosition.hasCompletePositions, false)
  assert.equal(invalidPosition.elements[0].position, undefined)
  assert.equal(graph.projectOntologyGraphElements([], []).hasCompletePositions, false)

  console.log('PASS ontology graph element projection contract')
} finally {
  await vite.close()
}
