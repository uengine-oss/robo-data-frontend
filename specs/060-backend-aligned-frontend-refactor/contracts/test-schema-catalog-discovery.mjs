import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { effectScope } from 'vue'

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const table = (name, schema, datasource) => ({
  name,
  table_schema: schema,
  datasource,
  logical_name: `${name} logical`,
  description: `${name} description`,
  description_source: 'ddl',
  analyzed_description: `${name} analyzed`,
  column_count: 1,
})

try {
  const projection = await vite.ssrLoadModule(
    '/src/workflows/schema-modeling/application/schemaCatalogDiscovery.ts',
  )
  const { useSchemaCatalogDiscovery } = await vite.ssrLoadModule(
    '/src/workflows/schema-modeling/composables/useSchemaCatalogDiscovery.ts',
  )

  const sourceTables = [table('orders', 'sales', 'warehouse')]
  const projectedTables = projection.projectSchemaCatalogTables(sourceTables)
  assert.deepEqual(projectedTables, [{
    name: 'orders',
    schema: 'sales',
    datasource: 'warehouse',
    logical_name: 'orders logical',
    description: 'orders description',
    description_source: 'ddl',
    analyzed_description: 'orders analyzed',
    column_count: 1,
  }])
  projectedTables[0].description = 'changed projection'
  assert.equal(sourceTables[0].description, 'orders description')

  const sourceColumns = [{
    name: 'id',
    table_name: 'orders',
    dtype: 'integer',
    nullable: false,
    logical_name: '식별자',
    description: 'primary key',
    description_source: 'ddl',
    analyzed_description: 'order identifier',
  }]
  const projectedColumns = projection.projectSchemaCatalogColumns(sourceColumns)
  assert.deepEqual(projectedColumns, sourceColumns)
  projectedColumns[0].description = 'changed column'
  assert.equal(sourceColumns[0].description, 'primary key')

  const tableReads = []
  const semanticReads = []
  const columnReads = []
  const contexts = []
  const scope = effectScope()
  const discovery = scope.run(() => useSchemaCatalogDiscovery({
    context(requireApiKey, signal) {
      contexts.push({ requireApiKey, signal })
      return {
        headers: { Authorization: 'Bearer schema-contract' },
        apiKey: requireApiKey ? 'catalog-key' : undefined,
        signal,
      }
    },
    dependencies: {
      getTables(signal) {
        const request = deferred()
        tableReads.push({ ...request, signal })
        return request.promise
      },
      semanticSearch(query, signal) {
        const request = deferred()
        semanticReads.push({ ...request, query, signal })
        return request.promise
      },
      getColumns(tableName, schema, signal) {
        const request = deferred()
        columnReads.push({ ...request, tableName, schema, signal })
        return request.promise
      },
    },
  }))

  const staleTableRead = discovery.loadAllTables()
  const latestTableRead = discovery.loadAllTables()
  assert.equal(tableReads[0].signal.aborted, true)
  tableReads[1].resolve([table('customers', 'public', 'warehouse')])
  await latestTableRead
  tableReads[0].resolve([table('stale', 'public', 'warehouse')])
  await staleTableRead
  assert.equal(discovery.allTables.value[0].name, 'customers')

  const failedTableRead = discovery.loadAllTables()
  tableReads.at(-1).reject(new Error('table list unavailable'))
  await failedTableRead
  assert.equal(discovery.tableListError.value, 'table list unavailable')
  assert.equal(
    discovery.allTables.value[0].name,
    'customers',
    'table-list failure discarded the last valid list',
  )

  const initialSemantic = discovery.performSemanticSearch('customer')
  semanticReads.at(-1).resolve([{
    name: 'customers',
    schema: 'public',
    description: 'customers',
    similarity: 0.9,
  }])
  await initialSemantic
  assert.equal(discovery.semanticSearchResults.value.length, 1)

  const failedSemantic = discovery.performSemanticSearch('orders')
  semanticReads.at(-1).reject(new Error('semantic unavailable'))
  await failedSemantic
  assert.equal(discovery.semanticSearchError.value, 'semantic unavailable')
  assert.equal(
    discovery.semanticSearchResults.value[0].name,
    'customers',
    'semantic failure discarded the last valid recommendation',
  )
  const semanticRetry = discovery.retrySemanticSearch()
  assert.equal(semanticReads.at(-1).query, 'orders')
  semanticReads.at(-1).resolve([{
    name: 'orders',
    schema: 'sales',
    description: 'orders',
    similarity: 0.8,
  }])
  await semanticRetry
  assert.equal(discovery.semanticSearchResults.value[0].name, 'orders')

  const staleSemantic = discovery.performSemanticSearch('first query')
  const latestSemantic = discovery.performSemanticSearch('second query')
  assert.equal(semanticReads.at(-2).signal.aborted, true)
  semanticReads.at(-1).resolve([{
    name: 'latest',
    schema: 'public',
    description: '',
    similarity: 0.7,
  }])
  await latestSemantic
  semanticReads.at(-2).resolve([{
    name: 'stale',
    schema: 'public',
    description: '',
    similarity: 1,
  }])
  await staleSemantic
  assert.equal(discovery.semanticSearchResults.value[0].name, 'latest')

  discovery.allTables.value = [{
    name: 'orders',
    schema: 'sales',
    datasource: 'warehouse',
    description: '',
    column_count: 0,
  }]
  const firstColumns = discovery.loadTableColumns('orders', 'sales', 'warehouse')
  const dedupedColumns = discovery.loadTableColumns('orders', 'sales', 'warehouse')
  assert.equal(columnReads.length, 1, 'same table identity sent duplicate column requests')
  columnReads[0].resolve([])
  assert.deepEqual(await firstColumns, [])
  assert.deepEqual(await dedupedColumns, [])
  await discovery.loadTableColumns('orders', 'sales', 'warehouse')
  assert.equal(columnReads.length, 1, 'successful empty columns were not cached')

  discovery.allTables.value = [
    {
      name: 'orders',
      schema: 'sales',
      datasource: 'warehouse',
      description: '',
      column_count: 1,
    },
    {
      name: 'orders',
      schema: 'sales',
      datasource: 'replica',
      description: '',
      column_count: 1,
    },
  ]
  await assert.rejects(
    discovery.loadTableColumns('orders', 'sales', ''),
    /여러 데이터소스/,
  )
  assert.equal(columnReads.length, 1, 'ambiguous identity reached the Catalog API')

  discovery.allTables.value = [{
    name: 'products',
    schema: 'public',
    datasource: 'warehouse',
    description: '',
    column_count: 1,
  }]
  const failedColumns = discovery.loadTableColumns('products', 'public', 'warehouse')
  columnReads.at(-1).reject(new Error('columns unavailable'))
  await assert.rejects(failedColumns, /columns unavailable/)
  assert.match(
    discovery.getTableColumnsError('products', 'public', 'warehouse'),
    /columns unavailable/,
  )
  assert.deepEqual(
    discovery.getCachedTableColumns('products', 'public', 'warehouse'),
    [],
  )

  const disposalList = discovery.loadAllTables()
  const disposalSemantic = discovery.performSemanticSearch('dispose query')
  const disposalColumns = discovery.loadTableColumns('products', 'public', 'warehouse')
  const disposalTableRequest = tableReads.at(-1)
  const disposalSemanticRequest = semanticReads.at(-1)
  const disposalColumnRequest = columnReads.at(-1)
  scope.stop()
  assert.equal(disposalTableRequest.signal.aborted, true)
  assert.equal(disposalSemanticRequest.signal.aborted, true)
  assert.equal(disposalColumnRequest.signal.aborted, true)
  disposalTableRequest.resolve([table('late', 'public', 'warehouse')])
  disposalSemanticRequest.resolve([])
  disposalColumnRequest.resolve([])
  await disposalList
  await disposalSemantic
  await assert.rejects(disposalColumns, /Abort/)
  assert.notEqual(discovery.allTables.value[0].name, 'late')

  assert.equal(
    contexts.length,
    0,
    'injected dependencies unexpectedly called the production context factory',
  )
  console.log('Schema Catalog discovery lifecycle contract passed')
} finally {
  await vite.close()
}
