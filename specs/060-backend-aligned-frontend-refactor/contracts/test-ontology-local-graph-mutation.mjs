import assert from 'node:assert/strict'
import { createServer } from 'vite'

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

try {
  const graph = await vite.ssrLoadModule(
    '/src/workflows/ontology/model/localGraphMutation.ts',
  )
  const fieldMapping = await vite.ssrLoadModule(
    '/src/workflows/ontology/model/relationFieldMapping.ts',
  )
  const graphViewport = await vite.ssrLoadModule(
    '/src/workflows/ontology/model/graphViewport.ts',
  )
  const datasourceConfirmation = await vite.ssrLoadModule(
    '/src/workflows/ontology/application/datasourceConfirmation.ts',
  )
  const resizablePanel = await vite.ssrLoadModule(
    '/src/shared/composables/useResizablePanel.ts',
  )

  const nodes = [
    { id: 'measure-sales', name: 'Sales', layer: 'Measure' },
    { id: 'process-order', name: 'Order Process', layer: 'Process' },
    { id: 'driver-price', name: 'Price', layer: 'Driver' },
  ]
  const relationships = [
    {
      id: 'rel-sales-order',
      source: 'measure-sales',
      target: 'process-order',
      type: 'MEASURED_BY',
      description: 'sales orders',
    },
    {
      id: 'rel-price-sales',
      source: 'driver-price',
      target: 'measure-sales',
      type: 'INFLUENCES',
    },
    {
      id: 'rel-price-order',
      source: 'driver-price',
      target: 'process-order',
      type: 'INFLUENCES',
    },
  ]
  const snapshot = structuredClone({ nodes, relationships })

  const unknownColumnCandidate = {
    table_name: 'mv_order',
    datasource: 'warehouse',
    full_table_name: 'mv_order',
    columns: [],
    sample_data: [],
    row_count: 0,
    row_count_approx: false,
    relevance_score: 1,
    match_reason: 'ObjectType',
    suggested_sql: 'SELECT * FROM mv_order LIMIT 100',
  }
  assert.deepEqual(
    datasourceConfirmation.projectConfirmedDatasourceSchema(
      unknownColumnCandidate,
    ),
    {
      sql: 'SELECT * FROM mv_order LIMIT 100',
      row_count: 0,
      datasource: 'warehouse',
    },
    'Unknown candidate columns were projected as a verified empty schema',
  )
  assert.deepEqual(
    datasourceConfirmation.projectConfirmedDatasourceSchema({
      ...unknownColumnCandidate,
      columns: [' order_id ', 'order_id', ' metric_id '],
      row_count: 12,
    }),
    {
      columns: ['order_id', 'metric_id'],
      sql: 'SELECT * FROM mv_order LIMIT 100',
      row_count: 12,
      datasource: 'warehouse',
    },
  )

  const createdNodeResult = graph.createLocalGraphNode(nodes, {
    layerId: 'Driver',
    layerName: '동인',
    position: { x: 120, y: 240 },
    now: 1700000000000,
  })
  assert.equal(createdNodeResult.changed, true)
  assert.equal(createdNodeResult.reason, 'changed')
  assert.deepEqual(createdNodeResult.node, {
    id: 'driver_2_1700000000000',
    name: '새 동인 2',
    label: 'Driver',
    layer: 'Driver',
    description: '',
    position: { x: 120, y: 240 },
  })
  assert.equal(createdNodeResult.nodes.length, nodes.length + 1)
  assert.deepEqual({ nodes, relationships }, snapshot, 'Node creation mutated its inputs')

  const invalidNodeResult = graph.createLocalGraphNode(nodes, {
    layerId: '',
    layerName: '동인',
    position: { x: Number.NaN, y: 240 },
    now: 1700000000000,
  })
  assert.equal(invalidNodeResult.changed, false)
  assert.equal(invalidNodeResult.reason, 'invalid')
  assert.equal(invalidNodeResult.node, null)

  const renamedNodeResult = graph.renameLocalGraphNode(nodes, 'driver-price', '  Unit Price  ')
  assert.equal(renamedNodeResult.changed, true)
  assert.equal(renamedNodeResult.node.name, 'Unit Price')
  assert.equal(nodes[2].name, 'Price')
  assert.equal(
    graph.renameLocalGraphNode(nodes, 'driver-price', ' Price ').reason,
    'unchanged',
  )
  assert.equal(graph.renameLocalGraphNode(nodes, 'driver-price', '   ').reason, 'blank')
  assert.equal(graph.renameLocalGraphNode(nodes, 'missing', 'Name').reason, 'not-found')

  const changedLayerResult = graph.changeLocalGraphNodeLayer(nodes, 'driver-price', 'Measure')
  assert.equal(changedLayerResult.changed, true)
  assert.equal(changedLayerResult.node.layer, 'Measure')
  assert.equal(changedLayerResult.node.label, 'Measure')
  assert.equal(nodes[2].layer, 'Driver')
  assert.equal(
    graph.changeLocalGraphNodeLayer(nodes, 'driver-price', ' Driver ').reason,
    'unchanged',
  )
  assert.equal(graph.changeLocalGraphNodeLayer(nodes, 'driver-price', ' ').reason, 'blank')
  assert.equal(graph.changeLocalGraphNodeLayer(nodes, 'missing', 'Measure').reason, 'not-found')

  const movedNodeResult = graph.moveLocalGraphNode(nodes, 'driver-price', { x: 15, y: 25 })
  assert.equal(movedNodeResult.changed, true)
  assert.deepEqual(movedNodeResult.node.position, { x: 15, y: 25 })
  assert.equal(
    graph.moveLocalGraphNode(movedNodeResult.nodes, 'driver-price', { x: 15, y: 25 }).reason,
    'unchanged',
  )
  assert.equal(
    graph.moveLocalGraphNode(nodes, 'driver-price', { x: Number.NaN, y: 25 }).reason,
    'invalid',
  )
  assert.equal(
    graph.moveLocalGraphNode(nodes, 'missing', { x: 15, y: 25 }).reason,
    'not-found',
  )
  assert.equal(nodes[2].position, undefined)

  const relationDraftResult = graph.createLocalGraphRelationshipDraft(nodes, relationships, {
    sourceId: 'process-order',
    targetId: 'driver-price',
    now: 1700000000001,
  })
  assert.equal(relationDraftResult.reason, 'changed')
  assert.deepEqual(relationDraftResult.relationship, {
    id: 'rel_1700000000001',
    source: 'process-order',
    target: 'driver-price',
    type: 'CAUSES',
    description: undefined,
    fromField: undefined,
    toField: undefined,
  })
  assert.equal(
    graph.createLocalGraphRelationshipDraft(nodes, relationships, {
      sourceId: 'driver-price',
      targetId: 'driver-price',
      now: 2,
    }).reason,
    'self-relation',
  )
  assert.equal(
    graph.createLocalGraphRelationshipDraft(nodes, relationships, {
      sourceId: 'missing',
      targetId: 'driver-price',
      now: 3,
    }).reason,
    'not-found',
  )
  assert.equal(
    graph.createLocalGraphRelationshipDraft(nodes, relationships, {
      sourceId: 'driver-price',
      targetId: 'measure-sales',
      now: 4,
    }).reason,
    'duplicate',
  )
  assert.deepEqual(
    { nodes, relationships },
    snapshot,
    'Relationship draft creation mutated graph inputs',
  )

  const committedRelationResult = graph.commitLocalGraphRelationship(
    relationships,
    relationDraftResult.relationship,
    {
      type: ' INFLUENCES ',
      description: '  downstream effect  ',
      fromField: '  order_id ',
      toField: ' price_id  ',
    },
  )
  assert.equal(committedRelationResult.changed, true)
  assert.deepEqual(committedRelationResult.relationship, {
    id: 'rel_1700000000001',
    source: 'process-order',
    target: 'driver-price',
    type: 'INFLUENCES',
    description: 'downstream effect',
    fromField: 'order_id',
    toField: 'price_id',
  })
  assert.equal(committedRelationResult.relationships.length, relationships.length + 1)
  assert.equal(
    graph.commitLocalGraphRelationship(
      relationships,
      { ...relationships[0], id: 'another-id' },
      { type: 'CAUSES' },
    ).reason,
    'duplicate',
  )
  assert.deepEqual({ nodes, relationships }, snapshot, 'Relationship commit mutated its inputs')

  const updatedRelationResult = graph.updateLocalGraphRelationship(
    relationships,
    'rel-sales-order',
    {
      type: ' MEASURED_BY ',
      description: '  revised mapping  ',
      fromField: ' order_id ',
      toField: ' metric_id ',
    },
  )
  assert.equal(updatedRelationResult.changed, true)
  assert.deepEqual(updatedRelationResult.relationship, {
    ...relationships[0],
    description: 'revised mapping',
    fromField: 'order_id',
    toField: 'metric_id',
  })
  assert.equal(
    graph.updateLocalGraphRelationship(
      updatedRelationResult.relationships,
      'rel-sales-order',
      {
        type: 'MEASURED_BY',
        description: 'revised mapping',
        fromField: 'order_id',
        toField: 'metric_id',
      },
    ).reason,
    'unchanged',
  )
  assert.equal(
    graph.updateLocalGraphRelationship(relationships, 'missing', { type: 'CAUSES' }).reason,
    'not-found',
  )
  assert.equal(
    graph.updateLocalGraphRelationship(relationships, 'rel-sales-order', { type: ' ' }).reason,
    'blank',
  )
  assert.deepEqual({ nodes, relationships }, snapshot, 'Relationship update mutated its inputs')

  const nodeTarget = graph.createNodeDeleteTarget(nodes[0], relationships)
  assert.deepEqual(nodeTarget, {
    kind: 'node',
    id: 'measure-sales',
    name: 'Sales',
    relationshipCount: 2,
  })
  assert.equal(graph.localGraphDeleteTitle(nodeTarget), '노드 삭제')
  assert.match(graph.localGraphDeleteMessage(nodeTarget), /2개의 관계도 함께 삭제/)

  const nodeResult = graph.applyLocalGraphDelete(nodes, relationships, nodeTarget)
  assert.deepEqual(nodeResult.nodes.map(node => node.id), ['process-order', 'driver-price'])
  assert.deepEqual(
    nodeResult.relationships.map(relationship => relationship.id),
    ['rel-price-order'],
  )
  assert.equal(nodeResult.removedNodeId, 'measure-sales')
  assert.equal(nodeResult.removedRelationshipId, null)
  assert.deepEqual({ nodes, relationships }, snapshot, 'Graph delete policy mutated its inputs')

  const relationshipTarget = graph.createRelationshipDeleteTarget(relationships[2], nodes)
  assert.deepEqual(relationshipTarget, {
    kind: 'relationship',
    id: 'rel-price-order',
    sourceName: 'Price',
    targetName: 'Order Process',
    relationshipType: 'INFLUENCES',
  })
  assert.equal(graph.localGraphDeleteTitle(relationshipTarget), '관계 삭제')
  assert.match(graph.localGraphDeleteMessage(relationshipTarget), /Price.*Order Process.*INFLUENCES/s)

  const relationshipResult = graph.applyLocalGraphDelete(
    nodes,
    relationships,
    relationshipTarget,
  )
  assert.deepEqual(relationshipResult.nodes, nodes)
  assert.deepEqual(
    relationshipResult.relationships.map(relationship => relationship.id),
    ['rel-sales-order', 'rel-price-sales'],
  )
  assert.equal(relationshipResult.removedNodeId, null)
  assert.equal(relationshipResult.removedRelationshipId, 'rel-price-order')
  assert.deepEqual({ nodes, relationships }, snapshot, 'Relationship delete mutated its inputs')

  const missingNames = graph.createRelationshipDeleteTarget(
    { id: 'orphan', source: 'missing-a', target: 'missing-b', type: 'RELATED_TO' },
    nodes,
  )
  assert.equal(missingNames.sourceName, 'missing-a')
  assert.equal(missingNames.targetName, 'missing-b')

  const mappedRelationships = [{
    id: 'rel-fields',
    source: 'measure-sales',
    target: 'process-order',
    type: 'MEASURED_BY',
    fromField: 'order_id',
    toField: 'metric_id',
  }]
  const unverifiedColumns = fieldMapping.reconcileRelationFieldMappings(
    mappedRelationships,
    'measure-sales',
    null,
  )
  assert.deepEqual(
    unverifiedColumns.relationships,
    mappedRelationships,
    'Unavailable column metadata was interpreted as an empty verified schema',
  )
  assert.deepEqual(unverifiedColumns.cleared, [])

  const verifiedColumns = fieldMapping.reconcileRelationFieldMappings(
    mappedRelationships,
    'measure-sales',
    ['customer_id'],
  )
  assert.equal(verifiedColumns.relationships[0].fromField, undefined)
  assert.equal(verifiedColumns.relationships[0].toField, undefined)
  assert.deepEqual(
    verifiedColumns.cleared.map(item => [item.side, item.field, item.reason]),
    [
      ['from', 'order_id', 'missing-column'],
      ['to', 'metric_id', 'unpaired'],
    ],
  )
  assert.deepEqual(
    mappedRelationships[0],
    {
      id: 'rel-fields',
      source: 'measure-sales',
      target: 'process-order',
      type: 'MEASURED_BY',
      fromField: 'order_id',
      toField: 'metric_id',
    },
    'Relation field reconciliation mutated its input',
  )

  const mappingDraft = { fromField: 'order_id', toField: 'metric_id' }
  assert.match(
    fieldMapping.validateRelationFieldMapping(
      mappingDraft,
      { status: 'loading', columns: [] },
      { status: 'ready', columns: ['metric_id'] },
    ),
    /From 노드의 컬럼 정보를 확인할 수 없어/,
  )
  assert.deepEqual(
    mappingDraft,
    { fromField: 'order_id', toField: 'metric_id' },
    'Relation field validation discarded the editor draft',
  )
  assert.equal(
    fieldMapping.validateRelationFieldMapping(
      mappingDraft,
      { status: 'ready', columns: ['order_id'] },
      { status: 'ready', columns: ['metric_id'] },
    ),
    null,
  )
  assert.equal(graphViewport.limitOntologyAutoFitZoom(4.2), 1.5)
  assert.equal(graphViewport.limitOntologyAutoFitZoom(0.8), 0.8)
  assert.equal(graphViewport.limitOntologyAutoFitZoom(Number.NaN), 1)

  const mappings = {
    'measure-sales': {
      node_id: 'measure-sales',
      node_name: 'Sales',
      node_layer: 'Measure',
      search_query: 'sales',
      status: 'found',
      candidates: [],
      selected_candidate: {
        table_name: 'dw.sales',
        datasource: 'warehouse',
        columns: ['order_id'],
        sample_data: [{ order_id: 101 }],
        row_count: 1,
        row_count_approx: false,
        relevance_score: 0.9,
        match_reason: 'fixture',
        suggested_sql: 'SELECT * FROM dw.sales',
      },
    },
    'process-order': {
      node_id: 'process-order',
      node_name: 'Order',
      node_layer: 'Process',
      search_query: 'orders',
      status: 'found',
      candidates: [],
      selected_candidate: {
        table_name: 'dw.orders',
        datasource: 'warehouse',
        columns: ['id'],
        sample_data: [],
        row_count: 2,
        row_count_approx: false,
        relevance_score: 0.8,
        match_reason: 'fixture',
        suggested_sql: 'SELECT * FROM dw.orders',
      },
    },
    'driver-price': {
      node_id: 'driver-price',
      node_name: 'Price',
      node_layer: 'Driver',
      search_query: 'price',
      status: 'confirmed',
      candidates: [],
      selected_candidate: {
        table_name: 'dw.price',
        columns: [],
        sample_data: [],
        row_count: 0,
        row_count_approx: false,
        relevance_score: null,
        match_reason: 'fixture',
        suggested_sql: 'SELECT * FROM dw.price',
      },
    },
  }
  const bulkTargets = datasourceConfirmation.createBulkDatasourceConfirmationTargets(mappings)
  assert.deepEqual(
    bulkTargets.map(target => target.nodeId),
    ['measure-sales', 'process-order'],
  )
  mappings['measure-sales'].selected_candidate.columns.push('mutated-after-open')
  assert.deepEqual(
    bulkTargets[0].candidate.columns,
    ['order_id'],
    'Bulk datasource target did not freeze its candidate snapshot',
  )

  const partialBulkResult = datasourceConfirmation.projectBulkDatasourceConfirmation(
    bulkTargets,
    [
      { nodeId: 'measure-sales', ok: true },
      { nodeId: 'process-order', ok: false, error: 'orders unavailable' },
    ],
  )
  assert.deepEqual(partialBulkResult.succeededNodeIds, ['measure-sales'])
  assert.deepEqual(
    partialBulkResult.failedTargets.map(target => target.nodeId),
    ['process-order'],
  )
  assert.deepEqual(partialBulkResult.errors, {
    'process-order': 'orders unavailable',
  })

  assert.equal(resizablePanel.clampPanelSize(440, 280, 800), 440)
  assert.equal(resizablePanel.clampPanelSize(120, 280, 800), 280)
  assert.equal(resizablePanel.clampPanelSize(920, 280, 800), 800)
  assert.equal(
    resizablePanel.projectPanelSize({
      startValue: 440,
      startCoordinate: 700,
      currentCoordinate: 620,
      minValue: 280,
      maxValue: 800,
      direction: 'negative',
    }),
    520,
  )
  assert.equal(
    resizablePanel.projectPanelSize({
      startValue: 350,
      startCoordinate: 600,
      currentCoordinate: -200,
      minValue: 150,
      maxValue: 600,
      direction: 'negative',
    }),
    600,
  )

  console.log('Ontology graph, field-mapping, datasource, viewport, and panel-resize contracts passed')
} finally {
  await vite.close()
}
