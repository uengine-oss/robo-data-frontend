import assert from 'node:assert/strict'
import { createServer } from 'vite'

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

function olapFixture(name = 'orders', count = 1) {
  return {
    source_tables: [{ id: `olap-${name}`, name }],
    etl_processes: [{ id: `etl-${name}`, name: `ETL_${name}`, cube_name: name }],
    target_tables: [{ id: `target-${name}`, name: `fact_${name}` }],
    data_flows: [
      { from: `olap-${name}`, to: `etl-${name}`, type: 'extract' },
      { from: `etl-${name}`, to: `target-${name}`, type: 'load' },
    ],
    summary: {
      total_sources: count,
      total_etl_processes: count,
      total_targets: count,
      total_flows: count * 2,
    },
  }
}

try {
  const catalog = await vite.ssrLoadModule('/src/domains/catalog/api/lineage.ts')
  const workflow = await vite.ssrLoadModule(
    '/src/workflows/data-lineage/application/useLineageGraphQuery.ts',
  )
  const graphModel = await vite.ssrLoadModule('/src/workflows/data-lineage/model/graph.ts')

  const parsedCatalog = catalog.parseCatalogLineageResponse({
    nodes: [
      { id: 'catalog-orders', name: 'orders', type: 'SOURCE', properties: { schema: 'public' } },
      { id: 'catalog-customer', name: 'customers', type: 'SOURCE' },
    ],
    edges: [
      { id: 'catalog-flow', source: 'catalog-customer', target: 'etl-orders', type: 'READS_FROM' },
    ],
    stats: { sourceCount: 2, etlCount: 0, targetCount: 0, flowCount: 1 },
  })
  assert.deepEqual(parsedCatalog.nodes[1].properties, {})
  assert.deepEqual(parsedCatalog.edges[0].properties, {})
  assert.throws(
    () => catalog.parseCatalogLineageResponse({
      nodes: [{ id: 'broken', name: 'broken', type: 'UNKNOWN' }],
      edges: [],
    }),
    /nodes\[0\]\.type/,
  )
  assert.throws(
    () => catalog.parseCatalogLineageResponse({ nodes: [], edges: {}, stats: {} }),
    /edges가 배열/,
  )
  assert.throws(
    () => catalog.parseCatalogLineageResponse({ stats: {} }),
    /nodes가 배열/,
  )
  assert.throws(
    () => catalog.parseCatalogLineageResponse({
      nodes: [],
      edges: [],
      stats: { flowCount: 'one' },
    }),
    /flowCount가 숫자/,
  )

  const merged = await workflow.loadLineageGraph({
    loadOlap: async () => olapFixture(),
    loadCatalog: async () => parsedCatalog,
  })
  assert.deepEqual(
    merged.data.nodes.map(node => node.id),
    ['olap-orders', 'etl-orders', 'target-orders', 'catalog-customer'],
    'Catalog nodes must keep the existing OLAP-first id/name dedupe behavior',
  )
  assert.deepEqual(
    merged.data.edges.map(edge => edge.id),
    ['flow_olap-orders_etl-orders', 'flow_etl-orders_target-orders', 'catalog-flow'],
  )
  assert.deepEqual(merged.data.stats, {
    sourceCount: 3,
    etlCount: 1,
    targetCount: 1,
    flowCount: 3,
  })

  const partial = await workflow.loadLineageGraph({
    loadOlap: async () => olapFixture(),
    loadCatalog: async () => {
      throw new Error('Catalog fixture outage')
    },
  })
  assert.equal(partial.data.nodes.length, 3)
  assert.deepEqual(partial.warnings, ['Catalog fixture outage'])

  await assert.rejects(
    workflow.loadLineageGraph({
      loadOlap: async () => {
        throw new Error('OLAP fixture outage')
      },
      loadCatalog: async () => {
        throw new Error('Catalog fixture outage')
      },
    }),
    /OLAP fixture outage\nCatalog fixture outage/,
  )

  let olapCalls = 0
  let releaseFirstOlap
  const firstOlap = new Promise(resolve => {
    releaseFirstOlap = resolve
  })
  const query = workflow.useLineageGraphQuery({
    loadOlap: () => {
      olapCalls += 1
      return olapCalls === 1 ? firstOlap : Promise.resolve(olapFixture('latest', 2))
    },
    loadCatalog: async () => ({ nodes: [], edges: [], stats: {} }),
  })
  const staleRefresh = query.refresh()
  const currentRefresh = query.refresh()
  assert.equal(await currentRefresh, 'committed')
  releaseFirstOlap(olapFixture('stale', 9))
  assert.equal(await staleRefresh, 'stale')
  assert.equal(query.data.value.nodes[0].name, 'latest')
  assert.equal(query.data.value.stats.sourceCount, 2)
  assert.equal(query.isLoading.value, false)

  assert.equal(
    graphModel.resolveLineageCubeName({
      id: 'etl-sales',
      name: 'ETL_SALES_DAILY',
      type: 'ETL',
      properties: {},
    }),
    null,
  )
  assert.equal(
    graphModel.resolveLineageCubeName({
      id: 'etl-property',
      name: 'ETL_IGNORED',
      type: 'ETL',
      properties: { cube_name: 'SalesCube' },
    }),
    'SalesCube',
  )

  console.log('Data Lineage workflow contracts passed')
} finally {
  await vite.close()
}
