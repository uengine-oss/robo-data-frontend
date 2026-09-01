import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { effectScope } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' })

try {
  const directSql = await vite.ssrLoadModule('/src/domains/text2sql/api/contracts.ts')
  const text2SqlClient = await vite.ssrLoadModule('/src/domains/text2sql/api/client.ts')
  const text2SqlEvents = await vite.ssrLoadModule('/src/domains/text2sql/api/eventContracts.ts')
  const glossary = await vite.ssrLoadModule('/src/domains/catalog/glossary/api.ts')
  const behavior = await vite.ssrLoadModule('/src/domains/ontology/model/behavior.ts')
  const causalAnalysis = await vite.ssrLoadModule('/src/domains/ontology/model/causalAnalysis.ts')
  const causalBrush = await vite.ssrLoadModule('/src/workflows/ontology/model/causalBrush.ts')
  const nodeDataProjection = await vite.ssrLoadModule('/src/workflows/ontology/model/nodeDataProjection.ts')
  const ontologyChart = await vite.ssrLoadModule('/src/workflows/ontology/model/ontologyChart.ts')
  const nodeAgentMonitoring = await vite.ssrLoadModule('/src/workflows/ontology/composables/useNodeAgentMonitoring.ts')
  const ontologyGenerationProgress = await vite.ssrLoadModule('/src/workflows/ontology/composables/useOntologyGenerationProgress.ts')
  const objectTypeProjection = await vite.ssrLoadModule('/src/workflows/ontology/model/objectTypeProjection.ts')
  const instanceCanvasLayout = await vite.ssrLoadModule('/src/domains/ontology/model/instanceCanvasLayout.ts')
  const ontologyLibrary = await vite.ssrLoadModule('/src/domains/ontology/model/schemaLibrary.ts')
  const nodeDataSourceCatalog = await vite.ssrLoadModule('/src/workflows/ontology/composables/useNodeDataSourceCatalog.ts')
  const ontologySchemaApi = await vite.ssrLoadModule('/src/domains/ontology/api/schema.ts')
  const ontologyDataSourceCatalog = await vite.ssrLoadModule('/src/domains/ontology/application/useOntologyDataSourceCatalog.ts')
  const ontologySchemaLibrary = await vite.ssrLoadModule('/src/domains/ontology/application/useOntologySchemaLibrary.ts')
  const ontologySchemaLifecycle = await vite.ssrLoadModule('/src/domains/ontology/application/useOntologySchemaLifecycle.ts')
  const ontologyStoreModule = await vite.ssrLoadModule('/src/domains/ontology/state/extraction.ts')
  const relationshipEdges = await vite.ssrLoadModule('/src/workflows/schema-modeling/model/relationshipEdgeProjection.ts')
  const relationshipInteraction = await vite.ssrLoadModule('/src/workflows/schema-modeling/model/relationshipInteraction.ts')
  const expiringMap = await vite.ssrLoadModule('/src/workflows/schema-modeling/model/expiringMap.ts')
  const tableDataQuery = await vite.ssrLoadModule('/src/workflows/schema-modeling/application/tableDataQuery.ts')
  const sourceCodePanel = await vite.ssrLoadModule('/src/workflows/schema-modeling/application/sourceCodePanel.ts')
  const behaviorExecution = await vite.ssrLoadModule('/src/workflows/schema-modeling/composables/useBehaviorExecution.ts')
  const sourceCodePanelView = await vite.ssrLoadModule('/src/workflows/schema-modeling/composables/useSourceCodePanelView.ts')
  const tableReferences = await vite.ssrLoadModule('/src/workflows/schema-modeling/composables/useTableReferences.ts')
  const objectExplorer = await vite.ssrLoadModule('/src/domains/ontology/api/objectExplorer.ts')
  const objectTypeCreation = await vite.ssrLoadModule('/src/workflows/ontology/application/objectTypeCreation.ts')
  const objectTypeDirectSql = await vite.ssrLoadModule('/src/workflows/ontology/application/objectTypeDirectSql.ts')
  const dataFabricApiModule = await vite.ssrLoadModule('/src/domains/data-fabric/api/index.ts')
  const datasourceStoreModule = await vite.ssrLoadModule('/src/domains/data-fabric/state/datasources.ts')
  const sqlInstanceCreation = await vite.ssrLoadModule('/src/domains/ontology/application/createInstancesFromSql.ts')
  const scheduler = await vite.ssrLoadModule('/src/domains/agent-scheduler/api/client.ts')
  const nodeScheduler = await vite.ssrLoadModule('/src/domains/node-agent-scheduler/api/client.ts')
  const security = await vite.ssrLoadModule('/src/domains/security/api/contracts.ts')
  const olap = await vite.ssrLoadModule('/src/domains/olap/model/contracts.ts')
  const olapLineage = await vite.ssrLoadModule('/src/domains/olap/api/lineage.ts')
  const externalHttpUrl = await vite.ssrLoadModule('/src/shared/browser/externalHttpUrl.ts')
  const managedTimeoutsModule = await vite.ssrLoadModule('/src/shared/composables/useManagedTimeouts.ts')
  const whatifExplainability = await vite.ssrLoadModule('/src/domains/whatif/model/explainability.ts')
  const whatifReport = await vite.ssrLoadModule('/src/domains/whatif/model/reportMarkdown.ts')
  const whatifContracts = await vite.ssrLoadModule('/src/domains/whatif/api/contracts.ts')
  const whatifComparisonApplication = await vite.ssrLoadModule('/src/domains/whatif/application/compareModels.ts')
  const whatifClientModule = await vite.ssrLoadModule('/src/domains/whatif/api/client.ts')
  const whatifSessionRepository = await vite.ssrLoadModule('/src/domains/whatif/application/sessionRepository.ts')

  const ontologyLibrarySource = [
    {
      id: 'recent-schema',
      name: '최근 온톨로지',
      updatedAt: '2025-01-01T00:00:00Z',
      nodeCount: 4,
      hasSchemaJson: true,
    },
    {
      id: 'new-schema',
      name: '신규 온톨로지',
      updatedAt: '2026-07-23T00:00:00Z',
      hasSchemaJson: true,
    },
    {
      id: 'invalid-date-schema',
      name: '날짜 미상 온톨로지',
      updatedAt: 'not-a-date',
      nodeCount: 2,
      hasSchemaJson: true,
    },
    {
      id: 'missing-json-schema',
      name: '본문 없는 온톨로지',
      hasSchemaJson: false,
    },
    {
      id: 'unknown-json-schema',
      name: '본문 여부 미상 온톨로지',
    },
  ]
  const ontologyLibrarySourceSnapshot = structuredClone(ontologyLibrarySource)
  const ontologyLibraryProjection = ontologyLibrary.projectOntologyLibrary(
    ontologyLibrarySource,
    ['missing-recent-schema', 'recent-schema', 'recent-schema'],
  )
  assert.deepEqual(
    ontologyLibraryProjection.entries.map(schema => schema.id),
    ['recent-schema', 'new-schema', 'invalid-date-schema'],
  )
  assert.equal(ontologyLibraryProjection.entries[1].nodeCount, 0)
  assert.equal(ontologyLibraryProjection.entries[0].hasSchemaJson, true)
  assert.equal(ontologyLibraryProjection.excludedWithoutSchemaJson, 2)
  assert.equal(ontologyLibraryProjection.recentSchemaId, 'recent-schema')
  assert.deepEqual(ontologyLibrarySource, ontologyLibrarySourceSnapshot)
  assert.deepEqual(
    ontologyLibrary.projectOntologyLibrary([], ['missing-schema']),
    {
      entries: [],
      excludedWithoutSchemaJson: 0,
      recentSchemaId: null,
    },
  )

  assert.deepEqual(
    ontologySchemaApi.parseSchemaListResponse({
      schemas: [{
        id: 'schema-1',
        name: '판매 온톨로지',
        nodeCount: 2,
        hasSchemaJson: true,
      }],
      activeSchemaId: 'schema-1',
    }),
    {
      schemas: [{
        id: 'schema-1',
        name: '판매 온톨로지',
        nodeCount: 2,
        hasSchemaJson: true,
      }],
      activeSchemaId: 'schema-1',
    },
  )
  assert.throws(
    () => ontologySchemaApi.parseSchemaListResponse({ activeSchemaId: null }),
    /schemas.*배열/,
  )
  assert.throws(
    () => ontologySchemaApi.parseSchemaListResponse({
      schemas: [{ id: 'schema-1', name: '판매', nodeCount: '2' }],
      activeSchemaId: null,
    }),
    /nodeCount.*숫자/,
  )

  assert.deepEqual(
    ontologySchemaApi.parseOntologyDataSourceCatalog({
      tables: [
        { schema: 'public', name: 'orders', description: '현재 주문' },
        { schema: 'archive', name: 'orders' },
      ],
    }),
    {
      tables: [
        { schema: 'public', name: 'orders', description: '현재 주문' },
        { schema: 'archive', name: 'orders' },
      ],
    },
  )
  assert.throws(
    () => ontologySchemaApi.parseOntologyDataSourceCatalog({ tables: ['orders'] }),
    /tables\[0\].*객체/,
  )
  assert.throws(
    () => ontologySchemaApi.parseOntologyDataSourceCatalog({
      tables: [{ name: 'orders' }],
    }),
    /schema.*문자열/,
  )
  assert.deepEqual(
    ontologySchemaApi.parseNodeInstanceData({
      nodeId: 'order-node',
      nodeName: 'Order',
      dataSource: 'orders',
      totalCount: 1,
      previewData: { columns: ['id'], rows: [[101]] },
    }),
    {
      nodeId: 'order-node',
      nodeName: 'Order',
      dataSource: 'orders',
      totalCount: 1,
      previewData: { columns: ['id'], rows: [[101]] },
    },
  )
  assert.throws(
    () => ontologySchemaApi.parseNodeInstanceData({
      nodeId: 'order-node',
      nodeName: 'Order',
      dataSource: 'orders',
      totalCount: 1,
      previewData: { columns: ['id'], rows: [{ id: 101 }] },
    }),
    /previewData\.rows.*행 배열/,
  )
  assert.deepEqual(
    ontologySchemaApi.parseSaveOntologySchemaResponse({
      success: true,
      id: 'sales-ontology',
    }),
    {
      success: true,
      id: 'sales-ontology',
    },
  )
  assert.throws(
    () => ontologySchemaApi.parseSaveOntologySchemaResponse({
      success: false,
      id: 'sales-ontology',
    }),
    /success/,
  )
  assert.throws(
    () => ontologySchemaApi.parseSaveOntologySchemaResponse({
      success: true,
      id: '',
    }),
    /id/,
  )
  assert.deepEqual(
    objectExplorer.parseDatasourceConfirmationResponse({ success: true }),
    { success: true },
  )
  assert.throws(
    () => objectExplorer.parseDatasourceConfirmationResponse({ success: false }),
    /success/,
  )
  assert.deepEqual(
    objectExplorer.parseGenerateFromSchemaResponse({
      success: true,
      tablesProcessed: 1,
      relationshipsInferred: 0,
      schema: {
        id: 'generated-schema',
        name: 'Generated Commerce',
        nodes: [{
          id: 'order-node',
          name: 'Order',
          label: 'Entity',
        }],
        relationships: [],
        labels: [],
      },
    }),
    {
      success: true,
      tablesProcessed: 1,
      relationshipsInferred: 0,
      schema: {
        id: 'generated-schema',
        name: 'Generated Commerce',
        nodes: [{
          id: 'order-node',
          name: 'Order',
          label: 'Entity',
        }],
        relationships: [],
        labels: [],
      },
    },
  )
  assert.throws(
    () => objectExplorer.parseGenerateFromSchemaResponse({
      success: true,
      tablesProcessed: -1,
    }),
    /tablesProcessed.*0 이상의 정수/,
  )
  assert.throws(
    () => objectExplorer.parseGenerateFromSchemaResponse({
      success: true,
      schema: { name: 'Broken', nodes: [], relationships: [] },
    }),
    /schema 구조/,
  )
  assert.deepEqual(
    objectExplorer.parseObjectTypeListResponse({
      objectTypes: [{
        id: 'order-type',
        name: 'Order',
        description: '주문',
        columns: [{ name: 'id', type: 'integer' }],
      }],
      total: 1,
    }),
    {
      objectTypes: [{
        id: 'order-type',
        name: 'Order',
        description: '주문',
        columns: [{ name: 'id', type: 'integer', description: undefined }],
      }],
      total: 1,
    },
  )
  assert.throws(
    () => objectExplorer.parseObjectTypeListResponse({
      objectTypes: [{ id: 'broken', name: 'Broken', columns: 'id' }],
      total: 1,
    }),
    /columns가 배열/,
  )
  assert.throws(
    () => objectExplorer.parseObjectTypeNameSuggestion({ korean_name: 7 }),
    /korean_name가 문자열/,
  )

  assert.equal(
    objectTypeDirectSql.detectDatasourceFromSql(
      'SELECT * FROM `warehouse`.`public`.`orders`',
    ),
    'warehouse',
  )
  assert.equal(
    objectTypeDirectSql.detectDatasourceFromSql(
      'SELECT * FROM "analytics" (SELECT id FROM orders)',
    ),
    'analytics',
  )
  assert.equal(
    objectTypeDirectSql.detectDatasourceFromSql('SELECT * FROM orders'),
    null,
  )
  assert.deepEqual(
    objectTypeDirectSql.buildObjectTypeSqlDatasourceOptions(
      'SELECT * FROM `warehouse`.`public`.`orders`',
      ['warehouse', 'archive', ''],
    ),
    [
      { name: 'warehouse', label: 'warehouse (SQL에서 감지됨)' },
      { name: 'archive', label: 'archive' },
    ],
  )
  assert.equal(
    objectTypeDirectSql.resolveObjectTypeSqlDatasource({
      selected: ' manual ',
      sql: 'SELECT * FROM `detected`.`public`.`orders`',
      storeSelected: 'store',
      available: ['only'],
    }),
    'manual',
  )
  assert.equal(
    objectTypeDirectSql.resolveObjectTypeSqlDatasource({
      sql: 'SELECT * FROM orders',
      available: ['only'],
    }),
    'only',
  )
  assert.equal(
    objectTypeDirectSql.resolveObjectTypeSqlDatasource({
      sql: 'SELECT * FROM orders',
      available: ['first', 'second'],
    }),
    '',
  )
  assert.deepEqual(
    await objectTypeDirectSql.executeObjectTypeDirectSql(
      async (request, onEvent) => {
        assert.deepEqual(request, {
          sql: 'SELECT id, status FROM orders',
          datasource: 'warehouse',
        })
        onEvent({ type: 'columns', data: ['id', 'status', 7] })
        onEvent({ type: 'row', data: [1, 'paid'] })
        onEvent({ type: 'row', data: { id: 2, status: 'pending' } })
      },
      {
        sql: 'SELECT id, status FROM orders',
        datasource: 'warehouse',
      },
    ),
    {
      columns: ['id', 'status'],
      rows: [
        { id: 1, status: 'paid' },
        { id: 2, status: 'pending' },
      ],
    },
  )
  await assert.rejects(
    objectTypeDirectSql.executeObjectTypeDirectSql(
      async (_request, onEvent) => onEvent({
        event: 'error',
        message: 'direct sql fixture outage',
      }),
      { sql: 'SELECT 1', datasource: 'warehouse' },
    ),
    /direct sql fixture outage/,
  )
  await assert.rejects(
    objectTypeDirectSql.executeObjectTypeDirectSql(
      async () => undefined,
      { sql: 'SELECT 1', datasource: 'warehouse' },
    ),
    /결과 컬럼을 파싱할 수 없습니다/,
  )

  const dataFabricApi = dataFabricApiModule.dataFabricApi
  const originalDataFabricMethods = {
    list: dataFabricApi.list,
    getTables: dataFabricApi.getTables,
    create: dataFabricApi.create,
    delete: dataFabricApi.delete,
  }
  try {
    setActivePinia(createPinia())
    const datasourceStore = datasourceStoreModule.useDatasourcesStore()
    dataFabricApi.list = async () => ({
      datasources: [{ name: 'warehouse', engine: 'postgres' }],
    })
    await datasourceStore.fetchDatasources()
    assert.deepEqual(
      datasourceStore.datasources.map(datasource => datasource.name),
      ['warehouse'],
    )
    assert.equal(datasourceStore.datasourceListError, null)

    dataFabricApi.getTables = async () => {
      throw new Error('table catalog fixture outage')
    }
    await datasourceStore.selectDatasource({
      name: 'warehouse',
      engine: 'postgres',
    })
    assert.equal(datasourceStore.tableListError, 'table catalog fixture outage')
    assert.equal(datasourceStore.datasourceListError, null)
    assert.deepEqual(
      datasourceStore.datasources.map(datasource => datasource.name),
      ['warehouse'],
    )

    dataFabricApi.list = async () => {
      throw new Error('datasource list fixture outage')
    }
    await datasourceStore.fetchDatasources()
    assert.equal(
      datasourceStore.datasourceListError,
      'datasource list fixture outage',
    )
    assert.equal(datasourceStore.tableListError, 'table catalog fixture outage')
    assert.deepEqual(
      datasourceStore.datasources.map(datasource => datasource.name),
      ['warehouse'],
    )

    dataFabricApi.create = async () => {
      throw new Error('datasource create fixture outage')
    }
    assert.equal(
      await datasourceStore.createDatasource('archive', 'postgres', {}),
      null,
    )
    assert.equal(
      datasourceStore.mutationError,
      'datasource create fixture outage',
    )
    assert.equal(
      datasourceStore.datasourceListError,
      'datasource list fixture outage',
    )
    dataFabricApi.create = async request => ({
      name: request.name,
      engine: request.engine,
      display_name: 'Archive',
    })
    assert.deepEqual(
      await datasourceStore.createDatasource('archive', 'postgres', {}),
      {
        name: 'archive',
        engine: 'postgres',
        display_name: 'Archive',
      },
    )
    assert.equal(datasourceStore.mutationError, null)
    assert.deepEqual(
      datasourceStore.datasources.map(datasource => datasource.name),
      ['warehouse', 'archive'],
    )

    let resolveWarehouseTables
    dataFabricApi.getTables = datasourceName => {
      if (datasourceName === 'warehouse') {
        return new Promise(resolve => {
          resolveWarehouseTables = resolve
        })
      }
      return Promise.resolve({
        tables: [{ name: 'current_orders' }],
      })
    }
    const staleTableRequest = datasourceStore.selectDatasource({
      name: 'warehouse',
      engine: 'postgres',
    })
    await datasourceStore.selectDatasource({
      name: 'archive',
      engine: 'postgres',
    })
    resolveWarehouseTables({
      tables: [{ name: 'stale_orders' }],
    })
    await staleTableRequest
    assert.equal(datasourceStore.selectedDatasource.name, 'archive')
    assert.deepEqual(
      datasourceStore.tables.map(table => table.name),
      ['current_orders'],
    )
    assert.equal(datasourceStore.tableListError, null)
  } finally {
    Object.assign(dataFabricApi, originalDataFabricMethods)
  }

  assert.deepEqual(
    objectTypeCreation.buildObjectTypeCreationRequest({
      name: ' ManualOrder ',
      description: '수동 주문',
      source: 'manual-input',
      columns: [{ name: 'id', type: 'number' }],
      createMindsDbView: true,
      initialRecords: [{ id: 7 }],
    }),
    {
      name: 'ManualOrder',
      description: '수동 주문',
      dataSourceType: 'manual',
      columns: [{ name: 'id', type: 'number' }],
      createMindsDbView: false,
      createMaterializedView: false,
      initialRecords: [{ id: 7 }],
    },
  )
  assert.deepEqual(
    objectTypeCreation.buildObjectTypeCreationRequest({
      name: 'Order',
      description: '주문',
      source: 'natural-language',
      columns: [{ name: 'id', type: 'string' }],
      query: ' SELECT id FROM shopmall.orders ',
      sourceQuestion: '주문 조회',
      createMindsDbView: true,
      viewName: 'order_view',
    }),
    {
      name: 'Order',
      description: '주문',
      dataSourceType: 'natural-language',
      columns: [{ name: 'id', type: 'string' }],
      query: 'SELECT id FROM shopmall.orders',
      sourceQuestion: '주문 조회',
      createMindsDbView: true,
      createMaterializedView: false,
      viewName: 'order_view',
    },
  )
  assert.throws(
    () => objectTypeCreation.buildObjectTypeCreationRequest({
      name: 'Order',
      description: '',
      source: 'direct-sql',
      columns: [],
      createMindsDbView: false,
    }),
    /컬럼이 없습니다/,
  )

  const creationCallOrder = []
  const relationshipRequests = [
    {
      sourceType: 'Customer',
      targetType: 'Order',
      sourceColumn: 'id',
      targetColumn: 'customer_id',
      matchStrategy: 'EXACT_MATCH',
      cardinality: 'ONE_TO_MANY',
    },
    {
      sourceType: 'Product',
      targetType: 'Order',
      sourceColumn: 'id',
      targetColumn: 'product_id',
      matchStrategy: 'EXACT_MATCH',
      cardinality: 'ONE_TO_MANY',
    },
  ]
  const partialObjectTypeCreation = await objectTypeCreation.createObjectTypeWithRelationships(
    {
      createObjectType: async request => {
        creationCallOrder.push(`object:${request.name}`)
        return { id: 'order-type', name: request.name, columns: request.columns }
      },
      createRelationship: async request => {
        creationCallOrder.push(`relationship:${request.sourceType}`)
        if (request.sourceType === 'Product') throw new Error('relationship fixture outage')
      },
    },
    objectTypeCreation.buildObjectTypeCreationRequest({
      name: 'Order',
      description: '주문',
      source: 'direct-sql',
      columns: [{ name: 'id', type: 'string' }],
      query: 'SELECT id FROM orders',
      createMindsDbView: false,
    }),
    relationshipRequests,
  )
  assert.deepEqual(creationCallOrder, [
    'object:Order',
    'relationship:Customer',
    'relationship:Product',
  ])
  assert.equal(partialObjectTypeCreation.objectType.name, 'Order')
  assert.deepEqual(
    partialObjectTypeCreation.relationshipFailures.map(failure => ({
      sourceType: failure.request.sourceType,
      message: failure.message,
    })),
    [{ sourceType: 'Product', message: 'relationship fixture outage' }],
  )
  const retriedRelationshipSources = []
  const remainingRelationshipFailures = await objectTypeCreation.createObjectTypeRelationships(
    async request => retriedRelationshipSources.push(request.sourceType),
    partialObjectTypeCreation.relationshipFailures.map(failure => failure.request),
  )
  assert.deepEqual(retriedRelationshipSources, ['Product'])
  assert.deepEqual(remainingRelationshipFailures, [])

  let dataSourceCatalogAttempts = 0
  const dataSourceCatalogScope = effectScope()
  const dataSourceCatalogQuery = dataSourceCatalogScope.run(() =>
    ontologyDataSourceCatalog.useOntologyDataSourceCatalog({
      getAvailableDataSources: async () => {
        dataSourceCatalogAttempts += 1
        if (dataSourceCatalogAttempts > 1) throw new Error('catalog fixture outage')
        return {
          tables: [
            { schema: 'public', name: 'orders' },
            { schema: 'archive', name: 'orders' },
          ],
        }
      },
    }),
  )
  assert(dataSourceCatalogQuery)
  assert.equal((await dataSourceCatalogQuery.refresh()).status, 'success')
  assert.equal(dataSourceCatalogQuery.tables.value.length, 2)
  assert.equal((await dataSourceCatalogQuery.refresh()).status, 'failure')
  assert.match(dataSourceCatalogQuery.error.value, /catalog fixture outage/)
  assert.deepEqual(
    dataSourceCatalogQuery.tables.value.map(table => `${table.schema}.${table.name}`),
    ['public.orders', 'archive.orders'],
  )
  dataSourceCatalogScope.stop()

  let releaseDataSourceCatalog
  const pendingDataSourceCatalogScope = effectScope()
  const pendingDataSourceCatalogQuery = pendingDataSourceCatalogScope.run(() =>
    ontologyDataSourceCatalog.useOntologyDataSourceCatalog({
      getAvailableDataSources: () => new Promise(resolve => {
        releaseDataSourceCatalog = resolve
      }),
    }),
  )
  assert(pendingDataSourceCatalogQuery)
  const pendingDataSourceCatalogRefresh = pendingDataSourceCatalogQuery.refresh()
  assert.equal((await pendingDataSourceCatalogQuery.refresh()).status, 'ignored')
  releaseDataSourceCatalog({ tables: [] })
  assert.equal((await pendingDataSourceCatalogRefresh).status, 'success')
  pendingDataSourceCatalogScope.stop()

  const originalGetNodeInstances = ontologySchemaApi.ontologyApi.getNodeInstances
  let releaseOldInstances
  let releaseLatestInstances
  try {
    ontologySchemaApi.ontologyApi.getNodeInstances = (_nodeId, limit) =>
      new Promise(resolve => {
        if (limit === 10) releaseOldInstances = resolve
        if (limit === 20) releaseLatestInstances = resolve
      })
    setActivePinia(createPinia())
    const ontologyStore = ontologyStoreModule.useOntologyStore()
    const ontologyNode = {
      id: 'order-node',
      name: 'Order',
      label: 'Asset',
      dataSource: 'orders',
    }
    const oldInstanceRequest = ontologyStore.loadInstanceData(ontologyNode, 10)
    const latestInstanceRequest = ontologyStore.loadInstanceData(ontologyNode, 20)
    releaseLatestInstances({
      nodeId: 'order-node',
      nodeName: 'Order',
      dataSource: 'orders',
      previewData: { columns: ['id'], rows: [['latest']] },
      totalCount: 1,
    })
    await latestInstanceRequest
    releaseOldInstances({
      nodeId: 'order-node',
      nodeName: 'Order',
      dataSource: 'orders',
      previewData: { columns: ['id'], rows: [['stale']] },
      totalCount: 1,
    })
    await oldInstanceRequest
    assert.equal(ontologyStore.instanceData.previewData.rows[0][0], 'latest')
    assert.equal(ontologyStore.instanceLoading, false)
    assert.equal(ontologyStore.instanceError, null)
  } finally {
    ontologySchemaApi.ontologyApi.getNodeInstances = originalGetNodeInstances
  }

  let libraryAttempts = 0
  const schemaLibraryScope = effectScope()
  const schemaLibraryQuery = schemaLibraryScope.run(() =>
    ontologySchemaLibrary.useOntologySchemaLibrary({
      listSchemas: async () => {
        libraryAttempts += 1
        if (libraryAttempts > 1) throw new Error('library fixture outage')
        return {
          schemas: [{ id: 'schema-1', name: '판매 온톨로지', hasSchemaJson: true }],
          activeSchemaId: 'schema-1',
        }
      },
    }),
  )
  assert(schemaLibraryQuery)
  assert.equal((await schemaLibraryQuery.refresh()).status, 'success')
  assert.equal(schemaLibraryQuery.schemas.value[0].id, 'schema-1')
  assert.equal(schemaLibraryQuery.activeSchemaId.value, 'schema-1')
  const retainedFailure = await schemaLibraryQuery.refresh()
  assert.equal(retainedFailure.status, 'failure')
  assert.match(schemaLibraryQuery.error.value, /library fixture outage/)
  assert.equal(schemaLibraryQuery.schemas.value[0].id, 'schema-1')
  assert.equal(schemaLibraryQuery.activeSchemaId.value, 'schema-1')
  schemaLibraryQuery.removeSchema('schema-1')
  assert.deepEqual(schemaLibraryQuery.schemas.value, [])
  assert.equal(schemaLibraryQuery.activeSchemaId.value, null)
  schemaLibraryScope.stop()

  let releaseLibraryRefresh
  const pendingLibraryScope = effectScope()
  const pendingLibraryQuery = pendingLibraryScope.run(() =>
    ontologySchemaLibrary.useOntologySchemaLibrary({
      listSchemas: () => new Promise(resolve => {
        releaseLibraryRefresh = resolve
      }),
    }),
  )
  assert(pendingLibraryQuery)
  const pendingLibraryRefresh = pendingLibraryQuery.refresh()
  assert.equal((await pendingLibraryQuery.refresh()).status, 'ignored')
  releaseLibraryRefresh({ schemas: [], activeSchemaId: null })
  assert.equal((await pendingLibraryRefresh).status, 'success')
  pendingLibraryScope.stop()

  let renameCalls = 0
  let resolveRename
  let deleteCalls = 0
  let activateCalls = 0
  let detailCalls = 0
  const lifecycleScope = effectScope()
  const schemaLifecycle = lifecycleScope.run(() =>
    ontologySchemaLifecycle.useOntologySchemaLifecycle({
      updateSchemaName: async () => {
        renameCalls += 1
        await new Promise(resolve => {
          resolveRename = resolve
        })
      },
      deleteSchemaById: async () => {
        deleteCalls += 1
        return { success: deleteCalls > 1 }
      },
      activateSchema: async schemaId => {
        activateCalls += 1
        if (schemaId === 'activate-failure' && activateCalls === 1) {
          throw new Error('activation fixture outage')
        }
        return { success: true, schemaId, name: '판매 온톨로지' }
      },
      getSchemaById: async schemaId => {
        detailCalls += 1
        return { id: schemaId, name: '판매 온톨로지', nodes: [], relationships: [], labels: [] }
      },
    }),
  )
  assert(schemaLifecycle)

  const firstRename = schemaLifecycle.renameSchema('schema-1', ' 변경 이름 ')
  const duplicateRename = await schemaLifecycle.renameSchema('schema-1', ' 변경 이름 ')
  assert.equal(duplicateRename.status, 'ignored')
  assert.equal(renameCalls, 1)
  resolveRename()
  assert.deepEqual(await firstRename, { status: 'success', value: '변경 이름' })
  assert.equal(schemaLifecycle.renamePendingId.value, null)

  const blankRename = await schemaLifecycle.renameSchema('schema-1', '   ')
  assert.equal(blankRename.status, 'failure')
  assert.equal(blankRename.error.stage, 'validate')
  assert.equal(renameCalls, 1)

  const rejectedDelete = await schemaLifecycle.deleteSchema('schema-1')
  assert.equal(rejectedDelete.status, 'failure')
  assert.equal(rejectedDelete.error.stage, 'delete')
  assert.equal(schemaLifecycle.deleteError.value.schemaId, 'schema-1')
  const successfulDelete = await schemaLifecycle.retryDelete()
  assert.deepEqual(successfulDelete, { status: 'success', value: 'schema-1' })
  assert.equal(deleteCalls, 2)

  const failedActivation = await schemaLifecycle.loadSchema('activate-failure')
  assert.equal(failedActivation.status, 'failure')
  assert.equal(failedActivation.error.stage, 'activate')
  assert.equal(failedActivation.error.activationCompleted, false)
  assert.equal(activateCalls, 1)
  assert.equal(detailCalls, 0)
  const retriedActivation = await schemaLifecycle.retryLoad()
  assert.equal(retriedActivation.status, 'success')
  assert.equal(activateCalls, 2)
  assert.equal(detailCalls, 1)
  lifecycleScope.stop()

  let partialActivateCalls = 0
  let partialDetailCalls = 0
  const partialLoadScope = effectScope()
  const partialLoadLifecycle = partialLoadScope.run(() =>
    ontologySchemaLifecycle.useOntologySchemaLifecycle({
      updateSchemaName: async () => ({}),
      deleteSchemaById: async () => ({ success: true }),
      activateSchema: async schemaId => {
        partialActivateCalls += 1
        return { success: true, schemaId, name: '부분 성공 온톨로지' }
      },
      getSchemaById: async schemaId => {
        partialDetailCalls += 1
        if (partialDetailCalls === 1) throw new Error('detail fixture outage')
        return { id: schemaId, name: '부분 성공 온톨로지', nodes: [], relationships: [], labels: [] }
      },
    }),
  )
  assert(partialLoadLifecycle)
  const partialFailure = await partialLoadLifecycle.loadSchema('partial-schema')
  assert.equal(partialFailure.status, 'failure')
  assert.equal(partialFailure.error.stage, 'detail')
  assert.equal(partialFailure.error.activationCompleted, true)
  const resumedDetail = await partialLoadLifecycle.retryLoad()
  assert.equal(resumedDetail.status, 'success')
  assert.equal(partialActivateCalls, 1)
  assert.equal(partialDetailCalls, 2)
  partialLoadScope.stop()

  let datasourceAttempts = 0
  const schemaDatasourceCalls = []
  const objectTypeDatasourceCalls = []
  const catalogScope = effectScope()
  const dataSourceCatalog = catalogScope.run(() =>
    nodeDataSourceCatalog.useNodeDataSourceCatalog({
      getDatasources: async () => {
        datasourceAttempts += 1
        if (datasourceAttempts === 1) throw new Error('catalog fixture outage')
        return ['warehouse']
      },
      getDatasourceSchemas: async datasource => {
        schemaDatasourceCalls.push(datasource)
        return ['public']
      },
      getSchemaTables: async (datasource, schema) => [{
        name: 'orders',
        schema,
        datasource,
        description: '',
        column_count: 3,
      }],
      getMetaObjectTypes: async datasource => {
        objectTypeDatasourceCalls.push(datasource)
        return [{
          name: 'Order',
          schema: 'dw',
          datasource,
          materialized_view: 'mv_order',
          column_count: 4,
        }]
      },
    }),
  )
  assert(dataSourceCatalog)
  await dataSourceCatalog.loadDatasources()
  assert.equal(dataSourceCatalog.loadError.value.stage, 'datasources')
  assert.match(dataSourceCatalog.loadError.value.message, /catalog fixture outage/)
  await dataSourceCatalog.retry()
  assert.deepEqual(dataSourceCatalog.availableDatasources.value, ['warehouse'])
  assert.equal(dataSourceCatalog.searchDatasource.value, 'warehouse')
  assert.equal(dataSourceCatalog.manualSource.value, 'warehouse')
  assert.equal(dataSourceCatalog.objectTypeDatasource.value, 'warehouse')
  assert.deepEqual(schemaDatasourceCalls, ['warehouse'])
  await dataSourceCatalog.loadTablesForSchema('warehouse', 'public')
  assert.deepEqual(dataSourceCatalog.availableTables.value[0], {
    name: 'orders',
    schema: 'public',
    datasource: 'warehouse',
    executionDatasource: 'warehouse',
    fullName: '"warehouse"."public"."orders"',
    columnCount: 3,
    sourceKind: 'table',
  })
  await dataSourceCatalog.loadSchemasForDatasource(nodeDataSourceCatalog.OBJECT_TYPE_SOURCE)
  assert.deepEqual(objectTypeDatasourceCalls, ['warehouse'])
  assert.equal(
    objectTypeDatasourceCalls.includes(nodeDataSourceCatalog.OBJECT_TYPE_SOURCE),
    false,
  )
  assert.deepEqual(dataSourceCatalog.availableTables.value[0], {
    name: 'Order',
    schema: 'dw',
    datasource: 'warehouse',
    executionDatasource: 'warehouse',
    fullName: '"mv_order"',
    columnCount: 4,
    materializedView: 'mv_order',
    sourceKind: 'object-type',
  })
  dataSourceCatalog.tableSearchQuery.value = 'WARE'
  assert.deepEqual(
    dataSourceCatalog.filteredTables.value.map(table => table.name),
    ['Order'],
  )
  catalogScope.stop()

  let resolveSlowSchemas
  const slowSchemas = new Promise(resolve => {
    resolveSlowSchemas = resolve
  })
  const raceScope = effectScope()
  const racingCatalog = raceScope.run(() =>
    nodeDataSourceCatalog.useNodeDataSourceCatalog({
      getDatasources: async () => ['slow', 'fast'],
      getDatasourceSchemas: datasource =>
        datasource === 'slow' ? slowSchemas : Promise.resolve(['fast_schema']),
      getSchemaTables: async () => [],
      getMetaObjectTypes: async () => [],
    }),
  )
  const slowLoad = racingCatalog.loadSchemasForDatasource('slow')
  await racingCatalog.loadSchemasForDatasource('fast')
  resolveSlowSchemas(['stale_schema'])
  await slowLoad
  assert.deepEqual(racingCatalog.availableSchemas.value, ['fast_schema'])
  raceScope.stop()

  const objectType = {
    id: 'order-type',
    name: 'Order',
    description: 'Order aggregate',
    columns: [
      { name: 'id', type: 'integer', description: 'identifier' },
      { name: 'status', type: '', description: undefined },
    ],
    behaviors: [{ name: 'approve', behaviorType: 'javascript' }],
  }
  const customerType = {
    id: 'customer-type',
    name: 'Customer',
    columns: [{ name: 'customer_id', type: 'uuid' }],
    behaviors: [],
  }
  const objectTypeCanvas = objectTypeProjection.projectObjectTypeToCanvas(objectType)
  assert.deepEqual(objectTypeCanvas.tableInfo, {
    name: 'Order',
    schema: 'ObjectType',
    description: 'Order aggregate',
    column_count: 2,
  })
  assert.deepEqual(objectTypeCanvas.columns, [
    { name: 'id', table_name: 'Order', data_type: 'integer', description: 'identifier', nullable: true },
    { name: 'status', table_name: 'Order', data_type: 'string', description: '', nullable: true },
  ])
  assert.deepEqual(objectTypeCanvas.dragData, {
    ...objectTypeCanvas.tableInfo,
    columns: objectTypeCanvas.columns,
    isObjectType: true,
    behaviors: objectType.behaviors,
  })
  assert.deepEqual(
    objectTypeProjection.collectRelatedObjectTypes('Order', [objectType, customerType], [
      { source: 'Order', target: 'Customer', label: 'CUSTOMER', data: { name: 'orderedBy' } },
      { source: 'Missing', target: 'Order', label: 'UNKNOWN' },
      { source: 'Other', target: 'Missing', label: 'IGNORED' },
    ]),
    [{ name: 'Customer', relationName: 'orderedBy', columns: ['customer_id'] }],
  )

  const instanceRequest = {
    datasource: 'warehouse',
    sourceSql: 'select id, name from orders',
    schemaId: 'commerce',
    nodeType: 'Order',
    idColumn: 'id',
    nameColumn: 'name',
    sourceQuestion: 'orders',
    materializedView: {
      enabled: true,
      viewName: 'mv_orders',
      description: 'Order sync',
    },
  }
  let successfulBulkRequest
  assert.deepEqual(
    await sqlInstanceCreation.createInstancesFromSql(instanceRequest, {
      createMaterializedView: async request => {
        assert.equal(request.schema_name, 'public')
        assert.equal(request.refresh_on_create, true)
        return { full_name: 'public.mv_orders' }
      },
      bulkCreateInstances: async request => {
        successfulBulkRequest = request
        return { created_count: 3 }
      },
    }),
    { createdCount: 3, materializedView: 'public.mv_orders', warning: null },
  )
  assert.equal(successfulBulkRequest.materialized_view, 'public.mv_orders')

  let degradedBulkRequest
  assert.deepEqual(
    await sqlInstanceCreation.createInstancesFromSql(instanceRequest, {
      createMaterializedView: async () => { throw new Error('MV unavailable') },
      bulkCreateInstances: async request => {
        degradedBulkRequest = request
        return { created_count: 2 }
      },
    }),
    {
      createdCount: 2,
      materializedView: null,
      warning: 'Materialized View는 생성하지 못했습니다: MV unavailable',
    },
  )
  assert.equal(degradedBulkRequest.materialized_view, null)

  const positionedInstances = instanceCanvasLayout.layoutCanvasInstances(
    Array.from({ length: 22 }, (_, index) => ({ id: index + 1 })),
    { x: 120, y: 80 },
  )
  assert.equal(positionedInstances.length, 20)
  assert.deepEqual(positionedInstances.slice(0, 2), [
    { instance: { id: 1 }, position: { x: -84, y: 260 } },
    { instance: { id: 2 }, position: { x: 40, y: 260 } },
  ])
  assert.deepEqual(positionedInstances[5], {
    instance: { id: 6 },
    position: { x: -84, y: 306 },
  })
  assert.equal(
    positionedInstances[1].position.x
      - positionedInstances[0].position.x
      - instanceCanvasLayout.INSTANCE_NODE_WIDTH,
    instanceCanvasLayout.INSTANCE_NODE_GAP,
  )
  assert.deepEqual(
    instanceCanvasLayout.layoutCanvasInstances([], { x: 120, y: 80 }),
    [],
  )

  await assert.rejects(
    () => sqlInstanceCreation.createInstancesFromSql(instanceRequest, {
      createMaterializedView: async () => ({ full_name: 'public.mv_orders' }),
      bulkCreateInstances: async () => { throw new Error('Ontology write failed') },
    }),
    /Ontology write failed/,
  )

  const relationshipNodes = [
    { id: 'table-orders', position: { x: 0, y: 0 }, data: { tableName: 'orders' } },
    { id: 'table-customers', position: { x: 200, y: 0 }, data: { tableName: 'customers' } },
  ]
  const userRelationshipBase = {
    from_table: 'orders',
    from_schema: 'public',
    to_table: 'customers',
    to_schema: 'public',
  }
  const initialCatalogRelationships = [{
    from_table: 'orders',
    to_table: 'customers',
    type: 'FK',
    source: 'analyzer',
    column_pairs: [{ source: 'customer_id', target: 'id', name: 'Old name' }],
  }]
  const mergedCatalogRelationships = relationshipEdges.mergeCatalogRelationships(
    initialCatalogRelationships,
    [
      {
        from_table: 'orders',
        to_table: 'customers',
        type: 'FK',
        source: 'catalog',
        column_pairs: [{ source: 'created_by', target: 'id' }],
      },
      {
        from_table: 'orders',
        to_table: 'customers',
        type: 'FK',
        source: 'analyzer',
        column_pairs: [
          { source: 'customer_id', target: 'id', name: 'Current name' },
          { source: 'billing_customer_id', target: 'id' },
        ],
      },
    ],
  )
  assert.equal(mergedCatalogRelationships.length, 2)
  assert.deepEqual(mergedCatalogRelationships.map(relationship => relationship.source), ['analyzer', 'catalog'])
  assert.deepEqual(mergedCatalogRelationships[0].column_pairs, [
    { source: 'customer_id', target: 'id', name: 'Current name' },
    { source: 'billing_customer_id', target: 'id' },
  ])
  assert.equal(initialCatalogRelationships[0].column_pairs[0].name, 'Old name')

  const projectedRelationshipEdges = relationshipEdges.projectRelationshipEdges({
    nodes: relationshipNodes,
    userRelationships: [
      { ...userRelationshipBase, from_column: 'one', to_column: 'one', description: '[1:1] ', relationship_type: 'FK' },
      { ...userRelationshipBase, from_column: 'many', to_column: 'many', description: '[1:N] owns', relationship_type: 'FK' },
      { ...userRelationshipBase, from_column: 'reverse', to_column: 'reverse', description: '[N:1]', relationship_type: 'FK' },
      { ...userRelationshipBase, from_column: 'both', to_column: 'both', description: '[N:N] Peers', relationship_type: 'FK' },
      { ...userRelationshipBase, from_table: 'missing', from_column: 'id', to_column: 'id', relationship_type: 'FK' },
    ],
    catalogRelationships: [
      {
        from_table: 'orders',
        to_table: 'customers',
        type: 'FK',
        source: 'analyzer',
        name: 'Order customer',
        column_pairs: [
          { source: 'customer_id', target: 'id' },
          { source: ' ', target: 'invalid' },
        ],
      },
      {
        from_table: 'orders',
        to_table: 'customers',
        type: 'FK',
        source: 'catalog',
        column_pairs: [{ source: 'customer_id', target: 'id', name: 'Duplicate must not replace' }],
      },
      {
        from_table: 'customers',
        to_table: 'orders',
        type: 'FK',
        source: 'analyzer',
        column_pairs: [{ source: 'last_order_id', target: 'id', name: 'Procedure reference' }],
      },
      {
        from_table: 'customers',
        to_table: 'orders',
        type: 'FK',
        source: 'catalog',
        column_pairs: [{ source: 'favorite_order_id', target: 'id' }],
      },
    ],
    visibility: { ddl: true, code: true, user: true },
  })
  assert.deepEqual(projectedRelationshipEdges.map(edge => edge.id), [
    'rel-orders-one-customers-one',
    'rel-orders-many-customers-many',
    'rel-orders-reverse-customers-reverse',
    'rel-orders-both-customers-both',
    'neo4j-orders-customer_id-customers-id',
    'neo4j-customers-last_order_id-orders-id',
    'neo4j-customers-favorite_order_id-orders-id',
  ])
  assert.deepEqual(
    projectedRelationshipEdges.slice(0, 4).map(edge => [edge.label, edge.markerStart, edge.markerEnd]),
    [
      ['1:1', 'url(#erd-one-green)', 'url(#erd-one-green)'],
      ['owns', 'url(#erd-one)', 'url(#crowfoot-many)'],
      ['N:1', 'url(#crowfoot-many)', 'url(#erd-one)'],
      ['Peers', 'url(#crowfoot-many-purple)', 'url(#crowfoot-many-purple)'],
    ],
  )
  assert.equal(projectedRelationshipEdges[0].sourceHandle, 'fk-one-source')
  assert.equal(projectedRelationshipEdges[5].sourceHandle, 'fk-last_order_id-source-left')
  assert.equal(projectedRelationshipEdges[4].label, 'Order customer')
  assert.equal(projectedRelationshipEdges[4].style.stroke, '#22c55e')
  assert.equal(projectedRelationshipEdges[5].style.stroke, '#22c55e')
  assert.equal(projectedRelationshipEdges[6].style.stroke, '#f59e0b')

  const hiddenRelationshipEdges = relationshipEdges.projectRelationshipEdges({
    nodes: relationshipNodes,
    userRelationships: [{
      ...userRelationshipBase,
      from_column: 'customer_id',
      to_column: 'id',
      relationship_type: 'FK',
    }],
    catalogRelationships: [{
      from_table: 'orders',
      to_table: 'customers',
      type: 'FK',
      source: 'analyzer',
      column_pairs: [{ source: 'customer_id', target: 'id' }],
    }],
    visibility: { ddl: false, code: true, user: false },
  })
  assert.deepEqual(hiddenRelationshipEdges, [])

  const fallbackHandleEdge = relationshipEdges.projectRelationshipEdges({
    nodes: [
      { id: 'custom-orders', position: { x: 500, y: 0 }, data: { tableName: 'orders' } },
      relationshipNodes[1],
    ],
    userRelationships: [{
      ...userRelationshipBase,
      from_column: 'customer_id',
      to_column: 'id',
      relationship_type: 'FK',
    }],
    catalogRelationships: [],
    visibility: { ddl: true, code: true, user: true },
  })[0]
  assert.equal(fallbackHandleEdge.sourceHandle, 'fk-customer_id-source-left')
  assert.equal(fallbackHandleEdge.targetHandle, 'pk-id-right')

  assert.equal(
    relationshipInteraction.extractColumnNameFromHandle('fk-billing-customer-id-source-left'),
    'billing-customer-id',
  )
  assert.equal(relationshipInteraction.extractColumnNameFromHandle('pk-order-id-right'), 'order-id')
  const relationshipInteractionNodes = [
    { id: 'table-order-items', data: { tableName: 'order-items', schema: 'sales' } },
    { id: 'table-products', data: { tableName: 'products', schema: 'catalog' } },
  ]
  assert.deepEqual(
    relationshipInteraction.parsePendingRelationshipConnection({
      source: 'table-order-items',
      target: 'table-products',
      sourceHandle: 'fk-product-id-source-left',
      targetHandle: 'pk-id-right',
    }, relationshipInteractionNodes),
    {
      fromTable: 'order-items',
      fromSchema: 'sales',
      fromColumn: 'product-id',
      toTable: 'products',
      toSchema: 'catalog',
      toColumn: 'id',
    },
  )
  assert.deepEqual(
    relationshipInteraction.parseEditingRelationship({
      id: 'edge-1',
      source: 'table-order-items',
      target: 'table-products',
      label: 'product_id → id',
    }, relationshipInteractionNodes),
    {
      id: 'edge-1',
      sourceType: 'order-items',
      targetType: 'products',
      sourceColumn: 'product_id',
      targetColumn: 'id',
      fromSchema: 'sales',
      toSchema: 'catalog',
      source: 'unknown',
    },
  )
  assert.deepEqual(
    relationshipInteraction.parseEmptyDropSource(
      'table-order-items',
      'fk-billing-customer-id-source-right',
      relationshipInteractionNodes,
    ),
    { sourceType: 'order-items', sourceColumn: 'billing-customer-id' },
  )

  assert.equal(
    tableDataQuery.extractDatasourceFromSql('SELECT * FROM warehouse (SELECT * FROM public.orders)'),
    'warehouse',
  )
  assert.equal(
    tableDataQuery.extractDatasourceFromSql('SELECT * FROM `warehouse`.`public`.`orders`'),
    'warehouse',
  )
  assert.equal(tableDataQuery.extractDatasourceFromSql('SELECT * FROM public.orders'), '')
  assert.equal(
    tableDataQuery.toTargetDatabaseSql(
      'SELECT * FROM warehouse (SELECT * FROM warehouse.public.orders WHERE active = 1);',
      'warehouse',
    ),
    'SELECT * FROM public.orders WHERE active = 1',
  )
  assert.equal(tableDataQuery.withRowLimit('SELECT * FROM orders LIMIT 500;', 25), 'SELECT * FROM orders LIMIT 25')

  const directTablePlan = await tableDataQuery.buildTableDataQueryPlan({
    tableName: 'RDITAG_TB',
    schema: 'RWIS',
    limit: 25,
    tables: [{ name: 'RDITAG_TB', schema: 'RWIS', datasource: 'warehouse' }],
  }, async () => { throw new Error('ObjectType lookup must not run for a direct table') })
  assert.equal(directTablePlan.ok, true)
  assert.equal(directTablePlan.plan.datasource, 'warehouse')
  assert.equal(directTablePlan.plan.primarySql, 'SELECT * FROM `RWIS`.`RDITAG_TB` LIMIT 25')

  const disconnectedTablePlan = await tableDataQuery.buildTableDataQueryPlan({
    tableName: 'Orders',
    schema: 'Sales',
    limit: 10,
    tables: [],
  }, async () => { throw new Error('ObjectType lookup must not run for a direct table') })
  assert.equal(disconnectedTablePlan.ok, true)
  assert.equal(disconnectedTablePlan.plan.datasource, '')
  assert.equal(disconnectedTablePlan.plan.primarySql, 'SELECT * FROM "Sales"."Orders" LIMIT 10')

  const objectTypePlan = await tableDataQuery.buildTableDataQueryPlan({
    tableName: 'Order',
    schema: 'ObjectType',
    limit: 25,
    tables: [],
  }, async () => ({
    columns: [],
    materializedView: 'warehouse.public.order_mv',
    query: 'SELECT * FROM warehouse.public.orders WHERE active = 1 LIMIT 500',
  }))
  assert.equal(objectTypePlan.ok, true)
  assert.equal(objectTypePlan.plan.datasource, 'warehouse')
  assert.deepEqual(objectTypePlan.plan.candidateSqls, [
    'SELECT * FROM public.order_mv LIMIT 25',
    'SELECT * FROM public.orders WHERE active = 1 LIMIT 25',
  ])

  const missingObjectTypePlan = await tableDataQuery.buildTableDataQueryPlan({
    tableName: 'EmptyObject',
    schema: 'ObjectType',
    limit: 25,
    tables: [],
  }, async () => ({ columns: [] }))
  assert.equal(missingObjectTypePlan.ok, false)
  assert.match(missingObjectTypePlan.error, /조회 가능한 데이터/)

  const attemptedQueries = []
  const objectTypeRows = await tableDataQuery.executeTableDataQueryPlan(
    objectTypePlan.plan,
    async request => {
      attemptedQueries.push(request)
      if (attemptedQueries.length === 1) return { type: 'error', error: 'materialized view unavailable' }
      return {
        type: 'result',
        columns: ['id'],
        data: [[7]],
        row_count: 1,
        execution_time: 0.0124,
      }
    },
  )
  assert.deepEqual(attemptedQueries.map(request => request.query), objectTypePlan.plan.candidateSqls)
  assert.equal(attemptedQueries[0].datasource, 'warehouse')
  assert.equal(attemptedQueries[0].max_rows, 25)
  assert.deepEqual(objectTypeRows, {
    ok: true,
    executedSql: 'SELECT * FROM public.orders WHERE active = 1 LIMIT 25',
    columns: ['id'],
    rows: [[7]],
    rowCount: 1,
    executionTimeMs: 12,
  })

  const failedRows = await tableDataQuery.executeTableDataQueryPlan(
    objectTypePlan.plan,
    async request => {
      if (request.query.includes('order_mv')) return { type: 'error', error: 'first failure' }
      throw new Error('second failure')
    },
  )
  assert.deepEqual(failedRows, {
    ok: false,
    executedSql: 'SELECT * FROM public.orders WHERE active = 1 LIMIT 25',
    error: 'second failure',
  })

  assert.deepEqual(sourceCodePanel.createClosedSourceCodePanel(), {
    isOpen: false,
    fileName: '',
    filePath: '',
    fileContent: '',
    startLine: 1,
    highlightedLine: 0,
    procedureName: '',
    statements: [],
    isLoadingStatements: false,
    statementError: null,
    notFound: false,
  })
  const missingSourcePanel = sourceCodePanel.createOpenSourceCodePanel({
    fileName: 'orders.sql',
    filePath: '/missing/orders.sql',
    fileContent: 'fabricated content must not render',
    highlightedLine: 12,
    procedureName: 'load_orders',
    startLine: 10,
    found: false,
  })
  assert.equal(missingSourcePanel.fileContent, '')
  assert.equal(missingSourcePanel.notFound, true)
  assert.equal(missingSourcePanel.isLoadingStatements, false)

  const statementResult = await sourceCodePanel.loadProcedureStatements(
    'load_orders',
    '/workspace/sql',
    async (procedureName, directory) => {
      assert.equal(procedureName, 'load_orders')
      assert.equal(directory, '/workspace/sql')
      return { statements: [{ start_line: 12, statement_type: 'SELECT', summary: 'Reads orders' }] }
    },
  )
  assert.deepEqual(statementResult, {
    ok: true,
    statements: [{ start_line: 12, statement_type: 'SELECT', summary: 'Reads orders' }],
  })
  assert.deepEqual(
    await sourceCodePanel.loadProcedureStatements('load_orders', '', async () => ({ statements: {} })),
    { ok: false, error: 'Statement 설명 응답 형식이 올바르지 않습니다.' },
  )
  assert.deepEqual(
    await sourceCodePanel.loadProcedureStatements('load_orders', '', async () => { throw new Error('Catalog unavailable') }),
    { ok: false, error: 'Catalog unavailable' },
  )
  let emptyProcedureRequests = 0
  assert.deepEqual(
    await sourceCodePanel.loadProcedureStatements('', '', async () => {
      emptyProcedureRequests += 1
      return { statements: [] }
    }),
    { ok: true, statements: [] },
  )
  assert.equal(emptyProcedureRequests, 0)
  assert.deepEqual(
    sourceCodePanelView.findStatementForLine(
      [
        { start_line: 4, statement_type: 'SELECT' },
        { start_line: 8, statement_type: 'UPDATE', ai_description: 'Updates order state' },
      ],
      8,
    ),
    { start_line: 8, statement_type: 'UPDATE', ai_description: 'Updates order state' },
  )
  assert.equal(
    sourceCodePanelView.findStatementForLine([{ start_line: 4, statement_type: 'SELECT' }], 4),
    null,
  )
  assert.equal(tableReferences.clampReferencePopupY(-20, 1080), 12)
  assert.equal(tableReferences.clampReferencePopupY(900, 1080), 720)
  assert.equal(tableReferences.getAccessTypeLabel('READS'), '읽기')
  assert.equal(tableReferences.getAccessTypeLabel('CUSTOM'), 'CUSTOM')
  assert.equal(tableReferences.getAccessTypeColor('WRITES'), '#f59e0b')
  assert.equal(tableReferences.getAccessTypeColor('READS'), '#38bdf8')

  const highlightValues = new Map()
  const scheduledHighlights = []
  const highlightController = expiringMap.createExpiringMapController(
    highlightValues,
    5000,
    {
      schedule(callback, delayMs) {
        const handle = { callback, delayMs, cancelled: false }
        scheduledHighlights.push(handle)
        return handle
      },
      cancel(handle) {
        handle.cancelled = true
      },
    },
  )
  highlightController.mark('table-orders', 1)
  highlightController.mark('table-orders', 2)
  assert.equal(scheduledHighlights[0].cancelled, true)
  assert.equal(highlightValues.get('table-orders'), 2)
  scheduledHighlights[0].callback()
  assert.equal(highlightValues.get('table-orders'), 2)
  scheduledHighlights[1].callback()
  assert.equal(highlightValues.has('table-orders'), false)
  assert.equal(highlightController.pendingCount(), 0)
  highlightController.mark('table-customers', 3)
  highlightController.clear()
  assert.equal(scheduledHighlights[2].cancelled, true)
  assert.equal(highlightValues.size, 0)

  const scheduledTimeouts = []
  const timeoutScope = effectScope()
  const managedTimeouts = timeoutScope.run(() => managedTimeoutsModule.useManagedTimeouts({
    schedule(callback, delayMs) {
      const handle = { callback, delayMs, cancelled: false }
      scheduledTimeouts.push(handle)
      return handle
    },
    cancel(handle) {
      handle.cancelled = true
    },
  }))
  let timeoutExecutions = 0
  managedTimeouts.schedule('fit-view', () => { timeoutExecutions += 1 }, 150)
  managedTimeouts.schedule('fit-view', () => { timeoutExecutions += 10 }, 200)
  assert.equal(scheduledTimeouts[0].cancelled, true)
  scheduledTimeouts[0].callback()
  assert.equal(timeoutExecutions, 0)
  scheduledTimeouts[1].callback()
  assert.equal(timeoutExecutions, 10)
  managedTimeouts.schedule('search', () => { timeoutExecutions += 100 }, 500)
  timeoutScope.stop()
  assert.equal(scheduledTimeouts[2].cancelled, true)
  assert.equal(managedTimeouts.pendingCount(), 0)

  assert.deepEqual(
    behaviorExecution.rowToObject([7, 'paid'], ['id', 'status']),
    { id: 7, status: 'paid' },
  )
  let resolveBehavior
  const behaviorStore = {
    tableDataPanel: {
      activeBehavior: { objectTypeName: 'Order', name: 'approve', behaviorType: 'command' },
      rows: [[7, 'pending']],
      columns: ['id', 'status'],
      isExecutingBehavior: false,
    },
    cancelBehaviorMode() {
      this.tableDataPanel.activeBehavior = null
    },
  }
  const behaviorState = behaviorExecution.useBehaviorExecution(
    behaviorStore,
    async () => new Promise(resolve => { resolveBehavior = resolve }),
  )
  const staleBehaviorRequest = behaviorState.executeBehaviorForRow(0)
  assert.equal(behaviorStore.tableDataPanel.isExecutingBehavior, true)
  behaviorState.closeBehaviorResultPopup()
  resolveBehavior({ success: true, code: 'return approved' })
  await staleBehaviorRequest
  assert.equal(behaviorState.showBehaviorResultPopup.value, false)
  assert.equal(behaviorState.behaviorResultData.value, null)
  assert.equal(behaviorStore.tableDataPanel.isExecutingBehavior, false)

  behaviorStore.tableDataPanel.activeBehavior = {
    objectTypeName: 'Order',
    name: 'approve',
    behaviorType: 'command',
  }
  const successfulBehaviorState = behaviorExecution.useBehaviorExecution(
    behaviorStore,
    async (_objectTypeName, _behaviorName, payload) => ({
      success: true,
      code: JSON.stringify(payload.instanceData),
    }),
  )
  await successfulBehaviorState.executeBehaviorForRow(0)
  assert.equal(successfulBehaviorState.showBehaviorResultPopup.value, true)
  assert.equal(successfulBehaviorState.behaviorResultData.value.code, '{"id":7,"status":"pending"}')

  assert.deepEqual(
    causalBrush.extractBrushXAxisRange({ areas: [{ coordRange: [[8, 2], [0, 1]] }] }),
    [2, 8],
  )
  assert.deepEqual(
    causalBrush.extractBrushXAxisRange({ batch: [{ selected: [{ areas: [{ coordRange: [1, 4] }] }] }] }),
    [1, 4],
  )
  assert.deepEqual(
    causalBrush.extractBrushXAxisRange({ batch: [{ range: [[90, 4], [20, 9]] }] }),
    [20, 90],
  )
  assert.deepEqual(
    causalBrush.extractBrushXAxisRange({ batch: [{ range: { start: 7, end: 3 } }] }),
    [3, 7],
  )
  assert.equal(causalBrush.extractBrushXAxisRange({ batch: [{ range: ['bad', 2] }] }), null)
  const trendRows = [
    { day: '2026-01-01', amount: 1 },
    { day: '2026-01-02', amount: '2' },
    { day: '2026-01-03', amount: 5 },
  ]
  assert.deepEqual(
    causalBrush.resolveBrushRowRange(trendRows, 'day', '2026-01-01', '2026-01-03'),
    { startIdx: 0, endIdx: 2 },
  )
  assert.equal(causalBrush.inferAnalysisTypeFromRange(trendRows, 'amount', 0, 2), 'increase')
  assert.equal(causalBrush.inferAnalysisTypeFromRange([...trendRows].reverse(), 'amount', 0, 2), 'decrease')
  assert.equal(causalBrush.escapeTooltipHtml('<script>"x" & y</script>'), '&lt;script&gt;&quot;x&quot; &amp; y&lt;/script&gt;')

  const generationProgressScope = effectScope()
  generationProgressScope.run(() => {
    const progress = ontologyGenerationProgress.useOntologyGenerationProgress()
    progress.reset('text')
    assert.deepEqual(progress.activePipelineStages.value, ['Normalization', 'Chunking', 'Sanitize', 'Unified', 'MergeRefine'])
    assert.equal(progress.totalStageCount.value, 5)
    assert.equal(progress.overallProgressPercent.value, 0)

    progress.applyLayerProgress({
      event: 'layer_progress', layer: 'Normalization', progress: 120, message: '정규화 완료',
    })
    assert.equal(progress.pipelineProgress.value.Normalization.progress, 100)
    assert.equal(progress.pipelineProgress.value.Normalization.status, 'completed')

    progress.applyLayerProgress({
      event: 'layer_progress', layer: 'BPMN', progress: 25, message: 'BPMN 처리 중',
    })
    assert.deepEqual(progress.activePipelineStages.value, ['Normalization', 'BPMN', 'Chunking', 'Sanitize', 'Unified', 'MergeRefine'])

    progress.applyLayerProgress({
      event: 'layer_progress', layer: 'Merge', progress: 100, message: '병합 완료',
    })
    assert.deepEqual(
      { status: progress.pipelineProgress.value.MergeRefine.status, progress: progress.pipelineProgress.value.MergeRefine.progress },
      { status: 'in_progress', progress: 50 },
    )
    progress.applyLayerProgress({
      event: 'layer_progress', layer: 'Refinement', progress: 40, message: '정제 중',
    })
    assert.equal(progress.pipelineProgress.value.MergeRefine.progress, 70)

    progress.applyLayerProgress({
      event: 'layer_progress',
      layer: 'Unified',
      progress: 50,
      message: '청크 2/4 · 단계 3/5 · 엔티티 추출',
      detail: {
        chunkCurrent: 2,
        chunkTotal: 4,
        substepCurrent: 3,
        substepTotal: 5,
        completedSteps: 7,
        totalSteps: 10,
        substepLabel: '엔티티 추출',
      },
    })
    assert.deepEqual(progress.chunkProgress.value, {
      current: 2, total: 4, substepCurrent: 3, substepTotal: 5, completedSteps: 7, totalSteps: 10,
    })
    assert.equal(progress.getStageDisplayMessage('Unified'), '엔티티 추출')

    progress.recordLayerComplete({
      event: 'layer_complete', layer: 'Resource', nodeCount: 3, relationCount: 2,
    })
    assert.equal(progress.totalExtractedNodes.value, 3)
    progress.markFailed('fixture failure')
    assert.equal(progress.pipelineProgress.value.Unified.status, 'failed')
    assert.equal(progress.currentStep.value, '오류 발생')
    progress.markComplete()
    assert.equal(progress.completedStageCount.value, progress.totalStageCount.value)
    assert.equal(progress.currentStep.value, '완료')

    progress.reset('pdf')
    assert.equal(progress.activePipelineStages.value.includes('BPMN'), true)
  })
  generationProgressScope.stop()

  assert.deepEqual(
    nodeDataProjection.projectNodeData(
      ['created_at', 'amount', 'label'],
      [
        ['2026-07-22T10:00:00Z', '10.5', 'first'],
        ['2026-07-23T10:00:00Z', 12, 'second'],
      ],
    ),
    {
      rows: [
        { created_at: '2026-07-22T10:00:00Z', amount: '10.5', label: 'first' },
        { created_at: '2026-07-23T10:00:00Z', amount: 12, label: 'second' },
      ],
      timeColumns: ['created_at'],
      numericColumns: ['amount'],
      chartRecommendation: { type: 'line', xAxis: 'created_at', yAxis: ['amount'] },
    },
  )
  assert.deepEqual(
    nodeDataProjection.projectNodeData(['invalid_date', 'label'], [['2026-99-99 nope', 'x']]),
    {
      rows: [{ invalid_date: '2026-99-99 nope', label: 'x' }],
      timeColumns: [],
      numericColumns: [],
      chartRecommendation: { type: 'table', xAxis: null, yAxis: [] },
    },
  )
  const chartModel = ontologyChart.buildOntologyChartModel({
    rows: [
      { created_at: '2026-07-22T10:00:00Z', amount: '10.5' },
      { created_at: '2026-07-23T10:00:00Z', amount: 12 },
    ],
    chartRecommendation: { type: 'line', xAxis: 'created_at', yAxis: ['amount'] },
    timeColumns: ['created_at'],
    numericColumns: ['amount'],
    dark: true,
  })
  assert.equal(chartModel?.xAxis, 'created_at')
  assert.deepEqual(chartModel?.yAxes, ['amount'])
  assert.equal(chartModel?.xData.length, 2)
  assert.equal(chartModel?.option.series?.[0].type, 'line')
  assert.equal(chartModel?.option.brush?.brushType, 'lineX')
  assert.equal(ontologyChart.buildOntologyChartModel({
    rows: [{ label: 'x' }],
    chartRecommendation: { type: 'table', xAxis: null, yAxis: [] },
    timeColumns: [],
    numericColumns: [],
    dark: false,
  }), null)

  const visualNodeData = new Map([['label', 'Order']])
  const nodeClasses = new Set()
  const nodeStyles = new Map()
  const visualNode = {
    data(key, value) {
      if (arguments.length === 2) {
        visualNodeData.set(key, value)
        return this
      }
      return visualNodeData.get(key)
    },
    removeData(key) { visualNodeData.delete(key); return this },
    addClass(names) { names.split(/\s+/).forEach(name => nodeClasses.add(name)); return this },
    removeClass(names) { names.split(/\s+/).forEach(name => nodeClasses.delete(name)); return this },
    style(name, value) { nodeStyles.set(name, value); return this },
    removeStyle(names) { names.split(/\s+/).forEach(name => nodeStyles.delete(name)); return this },
  }
  nodeAgentMonitoring.applyNodeVisualEffect(visualNode, {
    badge: 'LIVE', color: '#f00', opacity: 0.4, alert: true,
  })
  assert.equal(visualNodeData.get('label'), 'LIVE Order')
  assert.equal(visualNodeData.get('originalLabel'), 'Order')
  assert.equal(nodeStyles.get('background-color'), '#f00')
  assert.equal(nodeClasses.has('fx-alert'), true)
  nodeAgentMonitoring.applyNodeVisualEffect(visualNode)
  assert.equal(visualNodeData.get('label'), 'Order')
  assert.equal(visualNodeData.has('originalLabel'), false)
  assert.equal(nodeStyles.size, 0)
  assert.equal(nodeClasses.size, 0)

  const event = directSql.parseDirectSqlStreamEvent({
    event: 'result',
    columns: ['id', 'name'],
    rows: [[1, 'one'], { id: 2, name: 'two' }],
    row_count: 2,
    execution_time_ms: 4.5,
  })
  assert.deepEqual(event.columns, ['id', 'name'])
  assert.equal(event.row_count, 2)
  assert.deepEqual(directSql.toTabularRows(event.rows, event.columns), [
    [1, 'one'],
    [2, 'two'],
  ])
  assert.deepEqual(directSql.toRecordRows(event.rows, event.columns), [
    { id: 1, name: 'one' },
    { id: 2, name: 'two' },
  ])
  assert.deepEqual(directSql.toTabularRows([null, 1, 'invalid'], event.columns), [])
  assert.deepEqual(directSql.toRecordRows([null, 1, 'invalid'], event.columns), [])
  assert.throws(
    () => directSql.parseDirectSqlStreamEvent('not-an-event'),
    /응답 계약 오류/,
  )
  assert.throws(
    () => directSql.parseDirectSqlStreamEvent({ event: 'result', columns: ['id', 3] }),
    /columns.*문자열 배열/,
  )

  const history = directSql.parseQueryHistoryResponse({
    items: [{
      id: 'query-hash-1',
      question: '매출은?',
      final_sql: 'SELECT amount FROM sales',
      validated_sql: 'SELECT amount FROM sales',
      execution_result: null,
      row_count: 1,
      status: 'completed',
      error_message: null,
      steps_count: 1,
      execution_time_ms: 12.5,
      created_at: '2026-07-22T10:00:00Z',
      updated_at: null,
      metadata: null,
      steps: [{ iteration: 1, tool_name: 'execute_sql', tool_result_preview: '1 row' }],
      tables_used: ['sales'],
    }],
    total: 1,
    page: 1,
    page_size: 20,
  })
  assert.equal(history.items[0].id, 'query-hash-1')
  assert.equal(history.items[0].steps[0].tool_result_preview, '1 row')
  assert.throws(
    () => directSql.parseQueryHistoryItem({ id: 123, question: 'broken', status: 'completed' }),
    /history.id.*문자열/,
  )

  const ask = directSql.parseAskResponse({
    sql: 'SELECT amount FROM sales',
    table: { columns: ['amount'], rows: [[10]], row_count: 1, execution_time_ms: 3.2 },
    charts: [],
    provenance: {
      tables: ['public.sales'],
      columns: ['sales.amount'],
      neo4j_paths: [],
      vector_matches: [{ node: 'Table:sales', score: 0.91 }],
      prompt_snapshot_id: 'ps-1',
    },
    perf: { embedding_ms: 1, graph_search_ms: 2, llm_ms: 3, sql_ms: 4, total_ms: 10 },
    warnings: null,
  })
  assert.deepEqual(ask.table.rows, [[10]])
  assert.equal(ask.provenance.vector_matches[0].score, 0.91)
  assert.throws(
    () => directSql.parseAskResponse({ sql: 'SELECT 1', table: { columns: [], rows: {} } }),
    /ask.table.rows/,
  )

  assert.deepEqual(directSql.parseText2SqlHealthResponse({
    status: 'healthy',
    neo4j: 'connected',
    config: {
      llm_provider: 'openai',
      llm_model: 'model',
      embedding_provider: 'openai',
      embedding_model: 'embedding-model',
      target_db: 'postgresql',
    },
  }), {
    status: 'healthy',
    neo4j: 'connected',
    config: {
      llm_provider: 'openai',
      llm_model: 'model',
      embedding_provider: 'openai',
      embedding_model: 'embedding-model',
      target_db: 'postgresql',
    },
  })
  assert.deepEqual(
    directSql.parseText2SqlHealthResponse({ status: 'unhealthy', error: 'neo4j unavailable' }),
    { status: 'unhealthy', error: 'neo4j unavailable' },
  )
  assert.throws(
    () => directSql.parseText2SqlHealthResponse({ status: 'ok' }),
    /health.status.*지원하지 않는 상태/,
  )

  assert.equal(text2SqlClient.parseReactStreamLine('{"event":"token","iteration":1,"token":"S"}').token, 'S')
  assert.throws(
    () => text2SqlClient.parseReactStreamLine('{malformed'),
    /ReAct 스트림 JSON 형식/,
  )
  assert.equal(
    text2SqlClient.parseDirectSqlStreamLine('data: {"event":"result","columns":[],"rows":[],"row_count":0}').row_count,
    0,
  )
  assert.throws(
    () => text2SqlClient.parseDirectSqlStreamLine('data: {malformed'),
    /Direct SQL 스트림 JSON 형식/,
  )

  const eventRule = text2SqlEvents.parseEventRule({
    id: 'event-1',
    name: 'High level',
    description: 'Water level alert',
    natural_language_condition: '수위 3m 초과',
    sql: 'SELECT level FROM readings WHERE level > 3',
    check_interval_minutes: 10,
    condition_threshold: 'rows > 0',
    action_type: 'alert',
    alert_config: { channels: ['platform'], message: '수위 경고' },
    process_config: null,
    is_active: true,
    last_checked_at: null,
    last_triggered_at: null,
    trigger_count: 0,
    created_at: '2026-07-22T10:00:00',
    updated_at: '2026-07-22T10:00:00',
  })
  assert.equal(eventRule.alert_config.channels[0], 'platform')
  assert.equal(eventRule.process_config, null)
  assert.throws(
    () => text2SqlEvents.parseEventRule({ id: 'broken', check_interval_minutes: '10' }),
    /rule.name.*문자열/,
  )

  const eventChat = text2SqlEvents.parseEventChatResponse({
    response: '설정을 확인해 주세요.',
    extracted_config: {
      name: '수위 이상',
      condition: '수위 3m 초과',
      interval: 10,
      threshold: 'rows > 0',
      action_type: 'process',
      process_name: '배수_제어',
    },
    ready_to_confirm: true,
    event_created: false,
    next_step: 'confirm',
  })
  assert.equal(eventChat.extracted_config.action_type, 'process')
  assert.equal(eventChat.extracted_config.process_name, '배수_제어')
  assert.throws(
    () => text2SqlEvents.parseEventChatResponse({ response: 'broken', ready_to_confirm: 'yes' }),
    /chat.ready_to_confirm.*불리언/,
  )

  const cepStatus = text2SqlEvents.parseCepStatus({
    local_scheduler_running: false,
    local_active_tasks: 0,
    simple_cep_status: {
      status: 'running',
      active_rules: 2,
      total_rules: 3,
      buffered_events: 4,
      engine: 'SimpleCEP (Python)',
    },
    esper_cep_available: true,
    esper_cep_status: { status: 'running', activeRules: 2 },
  })
  assert.equal(cepStatus.esper_cep_status.activeRules, 2)
  assert.throws(
    () => text2SqlEvents.parseCepStatus({
      cep_available: true,
      local_scheduler_running: false,
      local_active_tasks: 0,
    }),
    /esper_cep_available.*불리언/,
  )
  assert.deepEqual(
    text2SqlEvents.parseSimpleCepStatus({ available: false }),
    { available: false },
  )

  const simulation = text2SqlEvents.parseSimulationResult({
    rule_id: 'simulation-1',
    rule_name: '수위 테스트',
    events_generated: 13,
    alarms_triggered: 1,
    alarms: [{
      rule_id: 'simulation-1',
      rule_name: '수위 테스트',
      triggered_at: '2026-07-22T10:12:00',
      duration: '0:10:00',
      matching_events: 11,
    }],
    condition_details: {
      field: 'water_level',
      operator: '>',
      threshold: 3,
      required_duration_minutes: 10,
      simulated_value: 3.5,
      simulated_duration_minutes: 12,
    },
  })
  assert.equal(simulation.alarms[0].matching_events, 11)
  assert.throws(
    () => text2SqlEvents.parseSimulationResult({
      rule_id: 'broken',
      rule_name: 'broken',
      events_generated: 1,
      alarms_triggered: 0,
      alarms: {},
    }),
    /simulation.alarms.*배열/,
  )

  const alarm = text2SqlEvents.parseAlarmStreamEvent({
    id: 'alarm-1',
    rule_name: '수위 이상',
    message: '조건 충족',
    severity: 'warning',
    triggered_at: '2026-07-22T10:12:00',
    acknowledged: false,
  }, 'alarm')
  assert.equal(alarm.event, 'alarm')
  assert.equal(alarm.data.severity, 'warning')
  assert.throws(
    () => text2SqlEvents.parseAlarmStreamEvent({}, 'unknown'),
    /지원하지 않는 alarm SSE 이벤트/,
  )

  const glossaryProgress = glossary.parseBulkExtractStreamEvent('progress', {
    processed: 3,
    total: 10,
    estimated_remaining_seconds: 4,
  })
  assert.equal(glossaryProgress.data.processed, 3)
  assert.throws(
    () => glossary.parseBulkExtractStreamEvent('progress', { processed: '3', total: 10 }),
    /progress.processed.*숫자/,
  )
  assert.throws(
    () => glossary.parseBulkExtractStreamEvent('mystery', {}),
    /지원하지 않는 용어 추출 SSE 이벤트/,
  )

  assert.deepEqual(behavior.parseBehaviorExecutionResult({ success: true, result: { id: 1 } }), {
    success: true,
    result: { id: 1 },
  })
  assert.throws(
    () => behavior.parseBehaviorExecutionResult([]),
    /응답 형식/,
  )
  assert.throws(
    () => behavior.parseBehaviorExecutionResult(null),
    /응답 형식/,
  )

  assert.deepEqual(objectExplorer.parseAutoLinkDatasourceEvent({
    type: 'progress',
    node_id: 'node-1',
    status: 'searching',
    message: '검색 중',
    completed: 1,
  }), {
    type: 'progress',
    node_id: 'node-1',
    status: 'searching',
    message: '검색 중',
    completed: 1,
  })
  assert.throws(
    () => objectExplorer.parseAutoLinkDatasourceEvent({ type: 'progress' }),
    /이벤트 형식/,
  )
  const autoLinkCandidate = {
    table_name: 'dw.orders',
    datasource: 'warehouse',
    full_table_name: 'dw.orders',
    columns: ['id'],
    sample_data: [{ id: 1 }],
    row_count: 1,
    row_count_approx: false,
    relevance_score: 0.9,
    match_reason: 'match',
    suggested_sql: 'SELECT * FROM dw.orders',
  }
  const autoLinkMappings = objectExplorer.parseAutoLinkDatasourceMappings({
    'node-1': {
      node_id: 'node-1',
      node_name: 'Orders',
      node_layer: 'KPI',
      search_query: 'orders',
      candidates: [autoLinkCandidate],
      selected_candidate: autoLinkCandidate,
      status: 'found',
    },
  })
  assert.equal(
    autoLinkMappings['node-1'].selected_candidate.table_name,
    'dw.orders',
  )
  autoLinkCandidate.columns.push('mutated')
  assert.deepEqual(autoLinkMappings['node-1'].candidates[0].columns, ['id'])
  assert.throws(
    () => objectExplorer.parseAutoLinkDatasourceEvent({
      type: 'result',
      data: {
        mappings: {
          'node-1': {
            node_id: 'different-node',
            candidates: [],
          },
        },
      },
    }),
    /매핑 형식/,
  )

  const causalResult = causalAnalysis.parseCausalAnalysisResult({
    success: true,
    target_node_id: 'sales',
    target_metric: 'amount',
    analysis_type: 'increase',
    time_range: { start: '2026-01-01', end: '2026-01-31' },
    top_causes: [{ source: 'orders', score: 0.8 }],
  })
  assert.equal(causalResult.target_metric, 'amount')
  assert.equal(causalResult.top_causes[0].name, 'orders')
  assert.throws(
    () => causalAnalysis.parseCausalAnalysisResult({ success: true }),
    /대상·지표·기간/,
  )
  assert.deepEqual(causalAnalysis.parseCausalAnalysisStreamEvent({
    type: 'progress',
    step: 'report_chunk',
    message: 'chunk',
  }), {
    type: 'progress',
    progress: { step: 'report_chunk', message: 'chunk', detail: undefined },
  })
  assert.throws(
    () => causalAnalysis.parseCausalAnalysisStreamEvent({ type: 'result', data: null }),
    /응답 형식/,
  )

  const nodeData = objectExplorer.parseOntologyNodeDataResult({
    hasDataSource: true,
    columns: ['date', 'amount'],
    rows: [{ date: '2026-01-01', amount: 10 }],
    rowCount: 1,
    timeColumns: ['date'],
    numericColumns: ['amount'],
    chartRecommendation: { type: 'line', xAxis: 'date', yAxis: ['amount'] },
  })
  assert.equal(nodeData.rows[0].amount, 10)
  assert.equal(nodeData.chartRecommendation.type, 'line')
  assert.throws(
    () => objectExplorer.parseOntologyNodeDataResult({ hasDataSource: true }),
    /컬럼 또는 행 배열/,
  )
  assert.deepEqual(objectExplorer.parseObjectTypeDataResponse({
    objectType: 'Order',
    columns: ['id', 'amount'],
    rows: [{ id: 1, amount: 42 }],
    rowCount: 1,
    usingMaterializedView: true,
  }).rows, [{ id: 1, amount: 42 }])
  assert.throws(
    () => objectExplorer.parseObjectTypeDataResponse({ objectType: 'Order', columns: ['id'], rows: ['fake'] }),
    /오브젝트 타입 데이터 응답 형식/,
  )

  const generationEvent = objectExplorer.parseMultiLayerGenerationEvent({
    event: 'complete',
    data: {
      success: true,
      schema: {
        id: 'schema-1',
        name: 'Sales ontology',
        nodes: [{ id: 'sales', name: 'Sales', label: 'Measure' }],
        relationships: [],
      },
      synonymSuggestions: [{
        term_id: 'term-1',
        term_name: '매출',
        suggested_synonym: '판매액',
        similarity: 0.92,
      }],
    },
  })
  assert.equal(generationEvent.data.schema.nodes[0].id, 'sales')
  assert.equal(generationEvent.data.synonymSuggestions[0].suggestedSynonym, '판매액')
  assert.throws(
    () => objectExplorer.parseMultiLayerGenerationEvent({
      event: 'complete',
      data: { success: true, schema: { nodes: [], relationships: 'invalid' } },
    }),
    /유효한 스키마/,
  )

  const agentProfile = scheduler.parseAgentProfile({
    id: 'profile-1',
    name: '수위 감시',
    description: '수위 데이터 감시',
    natural_language_query: '수위 이상을 감시해줘',
    generated_sql: 'SELECT level FROM readings',
    check_interval_minutes: 10,
    condition_expression: 'rows > 0',
    process_id: 'process-1',
    process_name: '수위 대응',
    process_params: { level: 'level' },
    is_active: true,
    created_at: '2026-07-22T10:00:00',
    updated_at: null,
    last_executed_at: null,
    execution_count: 2,
    last_result: 'triggered',
    data_source_type: 'sql',
    whatif_scenario_id: null,
    whatif_scenario_name: null,
    whatif_schema_id: null,
    whatif_output_field: null,
  })
  assert.equal(agentProfile.generatedSql, 'SELECT level FROM readings')
  assert.equal(agentProfile.processParams.level, 'level')
  assert.equal(agentProfile.lastResult, 'triggered')
  assert.throws(
    () => scheduler.parseAgentProfile({ id: 'broken', data_source_type: 'pipeline' }),
    /data_source_type/,
  )

  const agentTest = scheduler.parseAgentTestResult({
    success: true,
    row_count: 1,
    execution_time_ms: 4.2,
    sample_data: [{ level: 3.4 }],
    condition_met: true,
    columns: ['level'],
    error: null,
  })
  assert.equal(agentTest.sampleData[0].level, 3.4)
  assert.throws(
    () => scheduler.parseAgentTestResult({ success: true, row_count: '1' }),
    /row_count.*숫자/,
  )

  const agentDebug = scheduler.parseAgentDebugResult({
    profile_id: 'profile-1',
    profile_name: '수위 감시',
    started_at: '2026-07-22T10:00:00',
    completed_at: '2026-07-22T10:00:01',
    total_duration_ms: 1000,
    steps: [{
      step: 'sql_execution',
      status: 'success',
      title: 'SQL 실행',
      description: '1행 반환',
      started_at: '2026-07-22T10:00:00',
      completed_at: '2026-07-22T10:00:01',
      duration_ms: 1000,
      details: { row_count: 1 },
    }],
    final_result: 'triggered',
    condition_met: true,
    would_trigger_action: true,
    sql_result: { status: 'success' },
    action_preview: { process_name: '수위 대응' },
  })
  assert.equal(agentDebug.steps[0].durationMs, 1000)
  assert.equal(agentDebug.wouldTriggerAction, true)
  assert.throws(
    () => scheduler.parseAgentDebugResult({ steps: [], final_result: 'unknown' }),
    /final_result/,
  )

  const nodeAgentState = nodeScheduler.parseNodeAgentState({
    node_type_name: 'WaterPlant',
    status: 'running',
    started_at: '2026-07-22T10:00:00',
    last_run_at: null,
    run_count: 3,
    last_error: null,
    feedback_queue_size: 1,
    log_count: 12,
  })
  assert.equal(nodeAgentState.nodeTypeName, 'WaterPlant')
  assert.equal(nodeAgentState.feedbackQueueSize, 1)
  assert.throws(
    () => nodeScheduler.parseNodeAgentState({ node_type_name: 'broken', status: 'unknown' }),
    /status/,
  )

  const nodeAgentLog = nodeScheduler.parseNodeAgentLog({
    timestamp: '2026-07-22T10:00:00',
    level: 'warn',
    message: 'Agent paused by user',
    data: { source: 'operator' },
  })
  assert.equal(nodeAgentLog.data.source, 'operator')
  assert.throws(
    () => nodeScheduler.parseNodeAgentLog({ timestamp: 'now', level: 'notice', message: 'broken' }),
    /level/,
  )

  const nodeAgentFeedback = nodeScheduler.parseNodeAgentFeedback({
    id: 'fb-1',
    created_at: '2026-07-22T10:00:00',
    content: '다음 실행에서 임계값 확인',
    applied: false,
  })
  assert.equal(nodeAgentFeedback.applied, false)

  const cube = olap.parseCubeMetadata({
    name: 'Sales',
    fact_table: 'dw.fact_sales',
    dimensions: [{
      name: 'Time',
      table: 'dw.dim_time',
      foreign_key: 'time_id',
      levels: [{ name: 'Year', column: 'year' }],
    }],
    measures: [{ name: 'Amount', column: 'amount', agg: 'AVG' }],
    joins: [],
  })
  assert.equal(cube.measures[0].agg, 'AVG')
  assert.equal(cube.dimensions[0].foreign_key, 'time_id')
  assert.throws(
    () => olap.parseCubeMetadata({ name: 'broken', fact_table: 'fact', dimensions: [], measures: 'invalid' }),
    /dimensions\/measures 계약/,
  )

  const queryResult = olap.parseQueryResult({
    sql: 'SELECT year, AVG(amount) FROM sales GROUP BY year',
    columns: ['year', 'avg_amount'],
    rows: [{ year: 2026, avg_amount: 12.5 }],
    row_count: 1,
    execution_time_ms: 4.2,
  })
  assert.equal(queryResult.rows[0].avg_amount, 12.5)
  assert.equal('data' in queryResult, false)
  assert.throws(
    () => olap.parseQueryResult({ sql: 'SELECT 1', columns: ['value'], rows: [[1]] }),
    /객체 배열/,
  )

  const naturalFailure = olap.parseNaturalQueryResult({
    question: '매출은?',
    sql: null,
    columns: [],
    rows: [],
    error: 'generation failed',
  })
  assert.equal(naturalFailure.sql, null)
  assert.equal(naturalFailure.error, 'generation failed')

  assert.deepEqual(olap.parseScriptExecutionEvent({
    type: 'complete',
    message: 'done',
    success: true,
  }), {
    type: 'complete',
    message: 'done',
    attempt: undefined,
    maxRetries: undefined,
    success: true,
    output: undefined,
  })
  assert.throws(
    () => olap.parseScriptExecutionEvent({ type: 'mystery', message: 'unknown' }),
    /지원하지 않는 OLAP script event/,
  )

  const suggestion = olap.parseSuggestionResponse({
    suggestion: {
      cube_name: 'sales_cube',
      dimensions: [{
        name: 'dim_time',
        generation_strategy: 'generate',
        columns: [{ name: 'year', type: 'INTEGER' }],
      }],
      measures: [{ name: 'amount', column: 'amount', aggregator: 'sum' }],
      dimension_sources: { dim_time: ['calendar'] },
    },
    available_tables: 3,
  })
  assert.equal(suggestion.suggestion.dimensions[0].columns[0].name, 'year')
  assert.throws(
    () => olap.parseSuggestionResponse({ suggestion: { dimensions: [{ name: 'broken', columns: {} }] } }),
    /dimension.columns가 배열/,
  )

  const lineage = olapLineage.parseOlapLineageOverview({
    source_tables: [{ id: 'src_orders', name: 'orders' }],
    etl_processes: [{ id: 'etl_sales', name: 'ETL_SALES' }],
    target_tables: [{ id: 'tgt_sales', name: 'fact_sales' }],
    data_flows: [{ from: 'src_orders', to: 'etl_sales', type: 'extract' }],
    summary: { total_sources: 1, total_etl_processes: 1, total_targets: 1, total_flows: 1 },
  })
  assert.equal(lineage.data_flows[0].type, 'extract')
  assert.throws(
    () => olapLineage.parseOlapLineageOverview({ source_tables: [], etl_processes: [], target_tables: [], data_flows: [{}] }),
    /data flow 계약/,
  )
  assert.equal(
    externalHttpUrl.resolveExternalHttpUrl('/dags/etl_sales/grid', 'https://airflow.example.test/app/'),
    'https://airflow.example.test/dags/etl_sales/grid',
  )
  assert.equal(externalHttpUrl.resolveExternalHttpUrl('javascript:alert(1)', 'https://airflow.example.test/'), null)

  const parsedWhatIfCausal = whatifContracts.parseCausalDiscoveryResult({
    session_id: 'session-1',
    edges_count: 2,
    edges: [
      {
        source: 'exchange_rate',
        target: 'cost',
        source_label: '환율',
        target_label: '원가',
        strength: 0.8,
        direction: 'positive',
        method: 'granger',
        p_value: 0.01,
      },
      {
        source: 'cost',
        target: 'profit',
        source_label: '원가',
        target_label: '이익',
        strength: 0.5,
        direction: 'negative',
        method: 'correlation',
        p_value: 0.02,
      },
    ],
    summary: {
      total_edges: 2,
      strong_edges: 1,
      positive_count: 1,
      negative_count: 1,
      root_causes: [['환율', 0.8]],
      final_effects: [['이익', 0.5]],
    },
    influence_functions: [],
    validation: { total_validated: 2, valid_count: 2, overfit_count: 0, mean_r_squared: 0.7 },
  })
  const whatifGraph = whatifExplainability.buildExplainabilityGraph(parsedWhatIfCausal)
  assert.deepEqual(whatifGraph.inputIds, ['exchange_rate'])
  assert.deepEqual(whatifGraph.outputIds, ['profit'])
  assert.deepEqual(whatifGraph.paths[0].nodeIds, ['exchange_rate', 'cost', 'profit'])
  assert.equal(whatifGraph.edges[1].signedStrength, -0.5)
  assert.equal(whatifExplainability.formatSignedStrength(-0.5), '-50.0%')
  assert.throws(
    () => whatifContracts.parseCausalDiscoveryResult({ session_id: 'broken', edges: 'invalid' }),
    /What-If 응답 계약 오류/,
  )

  const whatifComparison = whatifContracts.parseComparisonResult({
    comparisons: [{ edge: 'a → b', source: 'a', target: 'b', causal_r2: 0.7, mindsdb_r2: null }],
    prediction_charts: [{
      edge: 'a → b', source: 'a', target: 'b', labels: [1, 2], actual: [2, 3], causal_predicted: [2.1, 2.9],
    }],
    summary: { total_compared: 1, mean_causal_r2: 0.7, mean_mindsdb_r2: 0, mindsdb_wins: 0, causal_wins: 1 },
  })
  assert.equal(whatifComparison.prediction_charts[0].actual[1], 3)
  assert.throws(
    () => whatifContracts.parseComparisonResult({ comparisons: [], summary: { total_compared: 'one' } }),
    /What-If 응답 계약 오류/,
  )

  const comparisonRequest = {
    sessionId: 'session-1',
    causalEdges: [{ source: 'orders', target: 'revenue', strength: 0.8, direction: 'positive' }],
    discoveredTables: ['orders'],
  }
  let mindsdbCalls = 0
  const ttmComparison = await whatifComparisonApplication.compareModelsWithFallback(
    comparisonRequest,
    {
      compareWithTTM: async () => ({
        comparisons: [{
          source: 'orders',
          target: 'revenue',
          source_label: '주문',
          target_label: '매출',
          ontology: { r2: 0.72, mape: 8 },
          ttm: { r2: 0.81, mape: 6, model_name: 'granite-ttm' },
        }],
        prediction_charts: [],
        summary: {
          total_compared: 1,
          ttm_available: true,
          ttm_model: 'granite-ttm',
          ontology_mean_r2: 0.72,
          ttm_mean_r2: 0.81,
          ontology_wins: 0,
          ttm_wins: 1,
        },
      }),
      compareWithMindsdb: async () => {
        mindsdbCalls += 1
        throw new Error('MindsDB should not be called')
      },
    },
  )
  assert.equal(ttmComparison.comparison_source, 'ttm')
  assert.equal(ttmComparison.comparisons[0].mindsdb_r2, null)
  assert.equal(ttmComparison.comparisons[0].better, 'TTM')
  assert.equal(ttmComparison.summary.mindsdb_wins, 0)
  assert.equal(ttmComparison.summary.mindsdb_available, false)
  assert.equal(mindsdbCalls, 0)

  const fallbackComparison = await whatifComparisonApplication.compareModelsWithFallback(
    comparisonRequest,
    {
      compareWithTTM: async () => {
        throw new Error('TTM service unavailable')
      },
      compareWithMindsdb: async () => ({
        comparisons: [{
          edge: 'orders → revenue',
          source: 'orders',
          target: 'revenue',
          source_label: '주문',
          target_label: '매출',
          causal_r2: 0.72,
          mindsdb_r2: 0.78,
          difference: -0.06,
          better: 'MindsDB',
        }],
        prediction_charts: [],
        summary: {
          total_compared: 1,
          mean_causal_r2: 0.72,
          mean_mindsdb_r2: 0.78,
          mindsdb_wins: 1,
          causal_wins: 0,
          mindsdb_available: true,
        },
      }),
    },
  )
  assert.equal(fallbackComparison.comparison_source, 'mindsdb')
  assert.match(fallbackComparison.warning, /TTM service unavailable/)
  assert.equal(fallbackComparison.comparisons[0].mindsdb_r2, 0.78)

  await assert.rejects(
    () => whatifComparisonApplication.compareModelsWithFallback(
      comparisonRequest,
      {
        compareWithTTM: async () => {
          throw new Error('TTM down')
        },
        compareWithMindsdb: async () => {
          throw new Error('MindsDB down')
        },
      },
    ),
    /TTM: TTM down; MindsDB: MindsDB down/,
  )

  const whatifCalls = []
  const whatifClient = whatifClientModule.createWhatIfClient({
    baseUrl: '/api/gateway/whatif-contract',
    getHeaders: () => ({
      'Accept-Language': 'ko',
      'X-Neo4j-Database': 'contract-db',
    }),
    fetchImpl: async (url, options = {}) => {
      whatifCalls.push({ url, options })
      throw new Error('contract stop')
    },
  })
  const sourceFile = new File(['a,b\n1,2'], 'source.csv', { type: 'text/csv' })
  const expectContractStop = (operation) => assert.rejects(operation, /contract stop/)

  await expectContractStop(() => whatifClient.analyzeScenario('시나리오', true))
  await expectContractStop(() => whatifClient.discoverData('주문', 5))
  await expectContractStop(() => whatifClient.collectData('select 1', false))
  await expectContractStop(() => whatifClient.uploadFile(sourceFile, 'session-1'))
  await expectContractStop(() => whatifClient.runCausalDiscovery('session-1', ['granger'], 2, sourceFile))
  await expectContractStop(() => whatifClient.getValidation('session-1'))
  await expectContractStop(() => whatifClient.compareWithMindsdb('session-1', [], ['orders']))
  await expectContractStop(() => whatifClient.compareWithTTM('session-1', [], ['orders'], true))
  await expectContractStop(() => whatifClient.getTTMInfo())
  await expectContractStop(() => whatifClient.createMindsdbModel('session-1', 'sales-model', 'revenue', ['orders']))
  await expectContractStop(() => whatifClient.getExplanation('session-1', 'comparison', 'ko'))
  await expectContractStop(() => whatifClient.generatePresentation('session-1', 3, 'ko'))
  await expectContractStop(() => whatifClient.saveToNeo4j('session-1'))
  await expectContractStop(() => whatifClient.getFromNeo4j('session-1'))
  await expectContractStop(() => whatifClient.getSession('session-1'))
  await expectContractStop(() => whatifClient.listSessions())
  await expectContractStop(() => whatifClient.deleteSession('session-1'))
  await expectContractStop(() => whatifClient.healthCheck())

  assert.deepEqual(
    whatifCalls.map(call => [
      call.options.method ?? 'GET',
      call.url.replace('/api/gateway/whatif-contract', ''),
    ]),
    [
      ['POST', '/agent/analyze'],
      ['POST', '/discovery/search'],
      ['POST', '/data/collect'],
      ['POST', '/data/upload'],
      ['POST', '/causal/discover'],
      ['POST', '/causal/validate'],
      ['POST', '/mindsdb/compare'],
      ['POST', '/ttm/compare'],
      ['GET', '/ttm/info'],
      ['POST', '/mindsdb/create-model'],
      ['POST', '/literacy/explain'],
      ['POST', '/literacy/presentation'],
      ['POST', '/neo4j/save'],
      ['GET', '/neo4j/graph/session-1'],
      ['GET', '/sessions/session-1'],
      ['GET', '/sessions'],
      ['DELETE', '/sessions/session-1'],
      ['GET', '/'],
    ],
  )
  for (const call of whatifCalls) {
    assert.equal(call.options.headers['Accept-Language'], 'ko')
    assert.equal(call.options.headers['X-Neo4j-Database'], 'contract-db')
  }
  const jsonCallIndexes = new Set([0, 1, 2, 5, 6, 7, 10, 12])
  whatifCalls.forEach((call, index) => {
    assert.equal(
      call.options.headers['Content-Type'],
      jsonCallIndexes.has(index) ? 'application/json' : undefined,
    )
  })
  assert.equal(JSON.parse(whatifCalls[7].options.body).include_ttm, true)
  assert.equal(whatifCalls[3].options.body.get('session_id'), 'session-1')
  assert.equal(whatifCalls[4].options.body.get('methods'), 'granger')

  const memoryStorage = (initial = {}) => {
    const values = new Map(Object.entries(initial))
    return {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: key => values.delete(key),
      values,
    }
  }
  const malformedSessions = whatifSessionRepository.loadSavedWhatIfSessions(memoryStorage({
    whatif_sessions: '{broken',
  }))
  assert.deepEqual(malformedSessions.value, [])
  assert.match(malformedSessions.warning, /JSON이 손상되어 복원하지 않았습니다/)

  const storedTtmSession = {
    id: 'ttm-session',
    scenario: 'TTM 복원',
    currentStep: 3,
    createdAt: '2026-07-23T00:00:00.000Z',
    updatedAt: '2026-07-23T00:01:00.000Z',
    data: {
      comparisonResult: {
        comparison_source: 'ttm',
        comparisons: [],
        prediction_charts: [],
        summary: {
          total_compared: 0,
          mean_causal_r2: 0.7,
          mindsdb_wins: 0,
          causal_wins: 1,
          ontology_mean_r2: 0.7,
          ttm_mean_r2: 0.8,
          ontology_wins: 0,
          ttm_wins: 1,
          ttm_available: true,
          mindsdb_available: false,
        },
      },
    },
  }
  const partiallyInvalidSession = {
    ...storedTtmSession,
    id: 'partial-session',
    scenario: '부분 복원',
    data: { comparisonResult: { invalid: true } },
  }
  const restoredSessions = whatifSessionRepository.loadSavedWhatIfSessions(memoryStorage({
    whatif_sessions: JSON.stringify([
      storedTtmSession,
      'not-an-object',
      partiallyInvalidSession,
    ]),
  }))
  assert.equal(restoredSessions.value.length, 2)
  assert.equal(restoredSessions.value[0].data.comparisonResult.comparison_source, 'ttm')
  assert.equal(restoredSessions.value[0].data.comparisonResult.summary.mean_mindsdb_r2, undefined)
  assert.equal(restoredSessions.value[1].data.comparisonResult, undefined)
  assert.match(restoredSessions.warning, /일부 저장 세션을 완전히 복원하지 못했습니다/)
  assert.match(restoredSessions.warning, /sessions\[1\]/)
  assert.match(restoredSessions.warning, /partial-session\.comparisonResult/)

  const previousSession = storedTtmSession
  const updatedSession = whatifSessionRepository.createSavedWhatIfSession({
    id: 'ttm-session',
    scenario: '갱신된 TTM 복원',
    currentStep: 4,
    data: {},
  }, previousSession, '2026-07-23T00:02:00.000Z')
  assert.equal(updatedSession.createdAt, previousSession.createdAt)
  assert.equal(updatedSession.updatedAt, '2026-07-23T00:02:00.000Z')
  const manySessions = Array.from({ length: 12 }, (_, index) => ({
    ...storedTtmSession,
    id: `session-${index}`,
  }))
  const limitedSessions = whatifSessionRepository.upsertSavedWhatIfSession(
    manySessions,
    updatedSession,
  )
  assert.equal(limitedSessions.length, 10)
  assert.equal(limitedSessions[0].id, 'ttm-session')

  const persistedStorage = memoryStorage()
  assert.equal(
    whatifSessionRepository.persistWhatIfSessions(
      persistedStorage,
      [updatedSession],
      updatedSession.id,
    ),
    undefined,
  )
  assert.equal(
    whatifSessionRepository.readCurrentWhatIfSessionId(persistedStorage).value,
    updatedSession.id,
  )
  assert.equal(
    JSON.parse(persistedStorage.values.get('whatif_sessions'))[0].scenario,
    '갱신된 TTM 복원',
  )
  assert.equal(
    whatifSessionRepository.clearCurrentWhatIfSession(persistedStorage),
    undefined,
  )
  assert.equal(
    whatifSessionRepository.readCurrentWhatIfSessionId(persistedStorage).value,
    null,
  )
  const failingStorage = {
    getItem: () => {
      throw new Error('storage denied')
    },
    setItem: () => {
      throw new Error('storage full')
    },
    removeItem: () => {
      throw new Error('storage denied')
    },
  }
  assert.match(
    whatifSessionRepository.loadSavedWhatIfSessions(failingStorage).warning,
    /storage denied/,
  )
  assert.match(
    whatifSessionRepository.persistWhatIfSessions(failingStorage, [], 'session').toString(),
    /storage full/,
  )

  const safeReport = whatifReport.renderReportMarkdown('# 결과\n- **강조** <img src=x onerror=alert(1)>')
  assert.match(safeReport, /<h1 class="md-h1">결과<\/h1>/)
  assert.match(safeReport, /&lt;img src=x onerror=alert\(1\)&gt;/)
  assert.doesNotMatch(safeReport, /<img/)

  const securityUsers = security.parseSecurityUsers([{
    uid: 'user/1',
    email: 'analyst@example.com',
    username: 'analyst',
    status: 'active',
    roles: ['analyst'],
    created_at: '2026-07-22T00:00:00Z',
    last_login_at: null,
  }])
  assert.equal(securityUsers[0].status, 'active')
  assert.equal(securityUsers[0].last_login_at, undefined)
  assert.deepEqual(security.parseSecurityAccessRules([{
    path: 'warehouse/public/orders',
    target_type: 'role',
    target_name: 'analyst',
    level: 'read',
    inherited_from: null,
  }])[0], {
    path: 'warehouse/public/orders',
    target_type: 'role',
    target_name: 'analyst',
    level: 'read',
    inherited_from: undefined,
  })
  assert.throws(
    () => security.parseSecurityUsers([{ uid: 'broken', status: 'enabled', roles: [] }]),
    /user.email.*문자열/,
  )
  assert.throws(
    () => security.parseSecurityAuditLogs([{ status: 'success' }]),
    /audit_log.log_id.*문자열/,
  )

  console.log('Domain contract parser tests passed')
} finally {
  await vite.close()
}
