import assert from 'node:assert/strict'
import { createServer } from 'vite'

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

function node(id, overrides = {}) {
  return {
    id,
    name: id,
    label: 'KPI',
    layer: 'KPI',
    position: { x: 10, y: 20 },
    filterFields: [{
      column: 'region',
      label: 'Region',
      type: 'select',
      dataType: 'string',
    }],
    dataSourceSchema: {
      columns: ['id'],
      datasource: 'warehouse',
    },
    thresholds: { warning: 10 },
    ...overrides,
  }
}

try {
  const canvas = await vite.ssrLoadModule(
    '/src/workflows/ontology/application/ontologyCanvasSchema.ts',
  )

  const documentInput = {
    name: 'Multi-Layer Ontology',
    nodes: [
      node('a'),
      node('b', { label: 'Measure', layer: 'Measure' }),
    ],
    relationships: [
      {
        id: 'duplicate',
        source: 'a',
        target: 'b',
        type: 'MEASURED_AS',
        properties: { weight: 1 },
      },
      {
        id: 'duplicate',
        source: 'b',
        target: 'a',
        type: 'CAUSES',
      },
      {
        id: 'missing-target',
        source: 'a',
        target: 'missing',
        type: 'CAUSES',
      },
      {
        id: '   ',
        source: 'a',
        target: 'b',
        type: '',
      },
    ],
  }
  const documentSnapshot = structuredClone(documentInput)
  const documentProjection = canvas.projectOntologyCanvasSchema(
    documentInput,
    { kind: 'document' },
    {
      synonymSuggestionCount: 2,
      now: new Date('2026-07-24T00:00:00.000Z'),
    },
  )
  assert.deepEqual(documentInput, documentSnapshot)
  assert.equal(documentProjection.schemaId, null)
  assert.equal(documentProjection.schemaName, 'KPI_a_b_온톨로지')
  assert.equal(documentProjection.autoNamed, true)
  assert.equal(documentProjection.skippedRelationshipCount, 1)
  assert.equal(documentProjection.rekeyedRelationshipCount, 1)
  assert.deepEqual(
    documentProjection.relationships.map(relationship => relationship.id),
    ['duplicate', 'duplicate__2', 'rel_4'],
  )
  assert.equal(documentProjection.relationships[2].type, 'RELATED_TO')
  assert.deepEqual(documentProjection.summary, {
    nodeCount: 2,
    relationshipCount: 3,
    layerBreakdown: { KPI: 1, Measure: 1 },
    synonymSuggestionCount: 2,
  })
  assert.notEqual(documentProjection.nodes[0], documentInput.nodes[0])
  assert.notEqual(
    documentProjection.nodes[0].filterFields,
    documentInput.nodes[0].filterFields,
  )
  assert.notEqual(
    documentProjection.nodes[0].dataSourceSchema.columns,
    documentInput.nodes[0].dataSourceSchema.columns,
  )
  assert.notEqual(
    documentProjection.relationships[0].properties,
    documentInput.relationships[0].properties,
  )

  const databaseInput = {
    id: 'generated-schema',
    name: 'Warehouse Ontology',
    nodes: [{
      id: 'order',
      name: 'Order',
      label: 'Entity',
      layer: '',
    }],
    relationships: [{
      id: 'order-self',
      source: 'order',
      target: 'order',
      type: '',
      from_field: 'order_id',
      to_field: 'parent_order_id',
    }],
  }
  const databaseSnapshot = structuredClone(databaseInput)
  const databaseProjection = canvas.projectOntologyCanvasSchema(
    databaseInput,
    { kind: 'database' },
  )
  assert.deepEqual(databaseInput, databaseSnapshot)
  assert.equal(databaseProjection.schemaId, 'generated-schema')
  assert.equal(databaseProjection.schemaName, 'Warehouse Ontology')
  assert.equal(databaseProjection.nodes[0].label, 'Resource')
  assert.equal(databaseProjection.nodes[0].layer, 'Resource')
  assert.equal(databaseProjection.nodes[0].description, '')
  assert.equal(databaseProjection.nodes[0].dataSource, '')
  assert.deepEqual(databaseProjection.nodes[0].filterFields, [])
  assert.deepEqual(databaseProjection.relationships[0], {
    id: 'order-self',
    source: 'order',
    target: 'order',
    type: 'RELATED_TO',
    properties: undefined,
    description: '',
    fromField: 'order_id',
    toField: 'parent_order_id',
  })
  assert.equal('from_field' in databaseProjection.relationships[0], false)
  assert.equal('to_field' in databaseProjection.relationships[0], false)

  const libraryProjection = canvas.projectOntologyCanvasSchema(
    {
      id: 'stale-response-id',
      name: 'Saved Ontology',
      nodes: [node('saved')],
      relationships: [],
    },
    { kind: 'library', schemaId: 'requested-schema-id' },
  )
  assert.equal(libraryProjection.schemaId, 'requested-schema-id')
  assert.equal(libraryProjection.schemaName, 'Saved Ontology')
  assert.equal(libraryProjection.autoNamed, false)

  assert.equal(
    canvas.generateOntologyCanvasName(
      [],
      new Date('2026-07-24T00:00:00.000Z'),
    ),
    '온톨로지_2026-07-24',
  )

  console.log(
    'Ontology canvas schema: source projection + immutable clone + deterministic relationship sanitation + identity passed',
  )
} finally {
  await vite.close()
}
