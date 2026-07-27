import assert from 'node:assert/strict'
import { createServer } from 'vite'

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

const originalFetch = globalThis.fetch

try {
  const contracts = await vite.ssrLoadModule('/src/domains/catalog/api/schemaContracts.ts')
  const schemaApi = await vite.ssrLoadModule('/src/domains/catalog/api/schema.ts')
  const identity = await vite.ssrLoadModule(
    '/src/workflows/schema-modeling/model/tableIdentity.ts',
  )
  const interaction = await vite.ssrLoadModule(
    '/src/workflows/schema-modeling/model/relationshipInteraction.ts',
  )
  const projection = await vite.ssrLoadModule(
    '/src/workflows/schema-modeling/model/relationshipEdgeProjection.ts',
  )

  assert.deepEqual(
    contracts.parseRelationshipCreate({ message: 'created', created: true }),
    { message: 'created', created: true },
  )
  assert.throws(
    () => contracts.parseRelationshipCreate({ message: 'created', success: true }),
    /created가 true/,
  )
  assert.deepEqual(
    contracts.parseRelationshipDelete({ message: 'deleted', deleted: 1 }),
    { message: 'deleted', deleted: 1 },
  )
  assert.throws(
    () => contracts.parseRelationshipDelete({ message: 'deleted', deleted: '1' }),
    /deleted.*숫자/,
  )
  assert.deepEqual(
    contracts.parseDescriptionUpdate({
      message: 'updated',
      updated: true,
      embedding_updated: false,
    }),
    { message: 'updated', updated: true, embedding_updated: false },
  )
  assert.throws(
    () => contracts.parseSchemaTables([{
      name: 'orders',
      table_schema: 'public',
      datasource: 'warehouse',
      description: '',
      column_count: '4',
    }]),
    /column_count.*숫자/,
  )

  const publicOrders = { name: 'orders', schema: 'public', datasource: 'warehouse' }
  const archiveOrders = { name: 'orders', schema: 'archive', datasource: 'warehouse' }
  const replicaOrders = { name: 'orders', schema: 'public', datasource: 'replica' }
  assert.notEqual(identity.tableNodeId(publicOrders), identity.tableNodeId(archiveOrders))
  assert.notEqual(identity.tableNodeId(publicOrders), identity.tableNodeId(replicaOrders))
  assert.equal(
    identity.resolveRelationshipTable(
      [publicOrders, archiveOrders, replicaOrders],
      'orders',
      'public',
    ).status,
    'ambiguous',
  )
  assert.equal(
    identity.resolveTableIdentity(
      [publicOrders, archiveOrders, replicaOrders],
      archiveOrders,
    ).status,
    'found',
  )
  assert.equal(
    identity.isCatalogColumnLookupAmbiguous(
      [publicOrders, archiveOrders, replicaOrders],
      publicOrders,
    ),
    true,
  )

  const sourceId = identity.tableNodeId(publicOrders)
  const targetId = identity.tableNodeId({
    name: 'customers',
    schema: 'sales',
    datasource: 'warehouse',
  })
  const nodes = [
    { id: sourceId, data: { tableName: 'orders', schema: 'public', datasource: 'warehouse' } },
    { id: targetId, data: { tableName: 'customers', schema: 'sales', datasource: 'warehouse' } },
  ]
  assert.deepEqual(
    interaction.parsePendingRelationshipConnection({
      source: sourceId,
      target: targetId,
      sourceHandle: 'fk-customer_id-source',
      targetHandle: 'pk-id',
    }, nodes),
    {
      fromTable: 'orders',
      fromSchema: 'public',
      fromColumn: 'customer_id',
      toTable: 'customers',
      toSchema: 'sales',
      toColumn: 'id',
    },
  )
  assert.deepEqual(
    interaction.parseEmptyDropSource(sourceId, 'fk-customer_id-source', nodes),
    { sourceType: 'orders', sourceColumn: 'customer_id' },
  )

  const duplicateNodes = [
    ...nodes,
    {
      id: identity.tableNodeId(replicaOrders),
      data: { tableName: 'orders', schema: 'public', datasource: 'replica' },
    },
  ]
  assert.equal(
    projection.projectRelationshipEdges({
      nodes: duplicateNodes,
      userRelationships: [{
        from_table: 'orders',
        from_schema: 'public',
        from_column: 'customer_id',
        to_table: 'customers',
        to_schema: 'sales',
        to_column: 'id',
        relationship_type: 'FK_TO_TABLE',
      }],
      catalogRelationships: [],
      visibility: { ddl: true, code: true, user: true },
    }).length,
    0,
    'A relationship without datasource identity must not be assigned to a duplicate table',
  )

  let capturedRequest = null
  globalThis.fetch = async (url, init = {}) => {
    capturedRequest = { url: String(url), init }
    return new Response(JSON.stringify({
      message: 'updated',
      updated: true,
      embedding_updated: true,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  await assert.rejects(
    schemaApi.catalogSchemaApi.updateTableDescription(
      'order details',
      'sales',
      '설명',
      { headers: { Authorization: 'Bearer session' } },
    ),
    /LLM API 키/,
  )
  assert.equal(capturedRequest, null, 'Missing API key must fail before sending a request')

  await schemaApi.catalogSchemaApi.updateTableDescription(
    'order details',
    'sales',
    '설명',
    {
      headers: { Authorization: 'Bearer session', 'X-LLM-Api-Key': 'llm-key' },
      apiKey: 'catalog-key',
    },
  )
  assert.match(capturedRequest.url, /\/schema\/tables\/order%20details\/description$/)
  assert.equal(capturedRequest.init.method, 'PUT')
  assert.equal(capturedRequest.init.headers.Authorization, 'Bearer session')
  assert.equal(capturedRequest.init.headers['X-LLM-Api-Key'], 'llm-key')
  assert.equal(capturedRequest.init.headers['X-API-Key'], 'catalog-key')
  assert.deepEqual(JSON.parse(capturedRequest.init.body), {
    name: 'order details',
    schema: 'sales',
    description: '설명',
  })

  const readRequests = []
  globalThis.fetch = async (url, init = {}) => {
    readRequests.push({ url: String(url), init })
    return new Response('[]', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const controller = new AbortController()
  const readContext = {
    headers: { Authorization: 'Bearer session' },
    apiKey: 'catalog-key',
    signal: controller.signal,
  }
  await schemaApi.catalogSchemaApi.getTables({ limit: 1000 }, readContext)
  await schemaApi.catalogSchemaApi.getTableColumns(
    'order details',
    { schema: 'sales' },
    readContext,
  )
  await schemaApi.catalogSchemaApi.semanticSearch(
    'orders',
    { limit: 10 },
    readContext,
  )
  assert.equal(readRequests.length, 3)
  assert(readRequests.every(request => request.init.signal === controller.signal),
    'Catalog discovery read did not forward its AbortSignal')
  assert(readRequests.every(request =>
    request.init.headers.Authorization === 'Bearer session'),
  'Catalog discovery read dropped the runtime session header')
  assert.equal(
    readRequests[2].init.headers['X-API-Key'],
    'catalog-key',
    'Catalog semantic search dropped the required API key',
  )

  console.log('Schema Modeling contracts passed')
} finally {
  globalThis.fetch = originalFetch
  await vite.close()
}
