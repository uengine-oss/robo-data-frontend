import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../../..')
const require = createRequire(join(repoRoot, '.unittest/package.json'))
const { chromium } = require('playwright')
const baseUrl = process.env.FRONTEND_URL ?? 'http://127.0.0.1:3000'
const evidenceDir = resolve(here, '../evidence')
await mkdir(evidenceDir, { recursive: true })

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const tables = [
  {
    name: 'orders',
    table_schema: 'public',
    datasource: 'fixture',
    logical_name: '주문',
    description: '주문 원장',
    column_count: 4,
  },
  {
    name: 'customers',
    table_schema: 'public',
    datasource: 'fixture',
    logical_name: '고객',
    description: '고객 원장',
    column_count: 2,
  },
]

function schemaTableNodeId({ datasource = '', table_schema = 'public', name }) {
  return `table-${encodeURIComponent(JSON.stringify([datasource, table_schema, name]))}`
}

const ordersNodeId = schemaTableNodeId(tables[0])
const customersNodeId = schemaTableNodeId(tables[1])

const columns = {
  orders: [
    { name: 'id', table_name: 'orders', data_type: 'bigint', nullable: false, description: '' },
    { name: 'customer_id', table_name: 'orders', data_type: 'bigint', nullable: false, description: '' },
    { name: 'created_by', table_name: 'orders', data_type: 'bigint', nullable: true, description: '' },
    { name: 'unverified_id', table_name: 'orders', data_type: 'bigint', nullable: true, description: '' },
  ],
  customers: [
    { name: 'id', table_name: 'customers', data_type: 'bigint', nullable: false, description: '' },
    { name: 'name', table_name: 'customers', data_type: 'varchar', nullable: false, description: '' },
  ],
}

async function installCatalogFixture(
  page,
  { failRelated = false, failDataQuery = false, failTableDescriptionOnce = false } = {},
) {
  const requestCounts = {
    analyzerGraph: 0,
    dataQueries: [],
    statementRequests: 0,
    tableReferenceRequests: 0,
    catalogRelationshipDeletes: 0,
    catalogRelationshipCreates: [],
    tableDescriptionRequests: [],
    columnDescriptionRequests: [],
    ontologyRelationshipRequests: 0,
  }
  let catalogRelationshipDeleted = false
  let tableDescriptionAttempt = 0
  const createdRelationships = []
  await page.route(/\/api\/gateway\/robo\/graph\/$/, route => {
    requestCounts.analyzerGraph += 1
    return route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"detail":"Analyzer graph fixture outage"}',
    })
  })
  await page.route(/\/api\/gateway\/robo\/schema\/tables\?/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(tables) }),
  )
  await page.route(/\/api\/gateway\/robo\/schema\/relationships(?:\?.*)?$/, route => {
    if (route.request().method() === 'DELETE') {
      requestCounts.catalogRelationshipDeletes += 1
      catalogRelationshipDeleted = true
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"deleted":1,"message":"deleted"}',
      })
    }
    if (route.request().method() === 'POST') {
      const relationship = route.request().postDataJSON()
      requestCounts.catalogRelationshipCreates.push(relationship)
      createdRelationships.push(relationship)
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"created":true,"message":"created"}',
      })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        ...(catalogRelationshipDeleted ? [] : [{
          from_table: 'orders',
          from_schema: 'public',
          from_column: 'customer_id',
          to_table: 'customers',
          to_schema: 'public',
          to_column: 'id',
          relationship_type: 'ONE_TO_MANY',
          description: '[1:N] owns',
        }]),
        ...createdRelationships,
      ]),
    })
  })
  await page.route(/\/api\/gateway\/robo\/schema\/tables\/orders\/description$/, route => {
    tableDescriptionAttempt += 1
    requestCounts.tableDescriptionRequests.push({
      body: route.request().postDataJSON(),
      headers: route.request().headers(),
    })
    if (failTableDescriptionOnce && tableDescriptionAttempt === 1) {
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"detail":"Catalog description fixture outage"}',
      })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"message":"updated","updated":true,"embedding_updated":true}',
    })
  })
  await page.route(
    /\/api\/gateway\/robo\/schema\/tables\/orders\/columns\/([^/]+)\/description$/,
    route => {
      requestCounts.columnDescriptionRequests.push({
        body: route.request().postDataJSON(),
        headers: route.request().headers(),
      })
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"message":"updated","updated":true}',
      })
    },
  )
  await page.route(/\/api\/gateway\/ontology\/relationships(?:\?.*)?$/, route => {
    requestCounts.ontologyRelationshipRequests += 1
    return route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: '{"detail":"Ontology relationship API must not serve Catalog edges"}',
    })
  })
  await page.route(/\/api\/gateway\/robo\/schema\/tables\/([^/]+)\/columns\?/, route => {
    const tableName = new URL(route.request().url()).pathname.split('/').at(-2)
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(columns[tableName] ?? []),
    })
  })
  await page.route(/\/api\/gateway\/robo\/schema\/semantic-search$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )
  await page.route(/\/api\/gateway\/robo\/graph\/related-tables\/orders$/, route => {
    if (failRelated) {
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"detail":"Catalog relationship fixture outage"}',
      })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        base_table: 'orders',
        tables: [{ name: 'customers', schema: 'public', description: '고객 원장' }],
        relationships: [
          {
            from_table: 'orders',
            to_table: 'customers',
            type: 'FK',
            source: 'analyzer',
            column_pairs: [{ source: 'customer_id', target: 'id', name: 'Order customer' }],
          },
          {
            from_table: 'orders',
            to_table: 'customers',
            type: 'FK',
            source: 'catalog',
            column_pairs: [{ source: 'created_by', target: 'id', name: 'Code owner' }],
          },
        ],
      }),
    })
  })
  await page.route(/\/api\/gateway\/data-fabric\/api\/query$/, route => {
    requestCounts.dataQueries.push(route.request().postDataJSON())
    if (failDataQuery) {
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"detail":"Data Fabric fixture outage"}',
      })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        type: 'result',
        columns: ['id', 'customer_id'],
        data: [[1, 7]],
        row_count: 1,
        execution_time: 0.01,
      }),
    })
  })
  await page.route(/\/api\/gateway\/robo\/schema\/procedures\/load_orders\/statements\?/, route => {
    requestCounts.statementRequests += 1
    if (requestCounts.statementRequests === 1) {
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"detail":"Catalog statement fixture outage"}',
      })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        statements: [{
          start_line: 2,
          end_line: 2,
          statement_type: 'SELECT',
          summary: 'Reads order rows',
        }],
      }),
    })
  })
  await page.route(/\/api\/gateway\/robo\/schema\/tables\/orders\/references\?/, route => {
    requestCounts.tableReferenceRequests += 1
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        references: [{
          procedure_name: 'load_orders',
          procedure_type: 'PROCEDURE',
          start_line: 1,
          end_line: 3,
          access_type: 'READS',
          statement_type: 'SELECT',
          statement_line: 2,
          evidence_line: 2,
          file_name: 'orders.sql',
          file_path: '/workspace/sql/orders.sql',
          code_text: '1 | BEGIN\n2 | SELECT * FROM orders;\n3 | END',
        }],
      }),
    })
  })
  return requestCounts
}

async function openSchema(page) {
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  const feature = page.locator('button[title="데이터 스키마"]').first()
  await feature.waitFor({ state: 'visible', timeout: 15_000 })
  await feature.click()
  const search = page.getByPlaceholder('테이블 검색...')
  if (!await search.isVisible()) {
    await page.getByRole('button', { name: '테이블 목록 열기' }).click()
  }
  await search.waitFor()
}

async function addOrders(page) {
  const search = page.getByPlaceholder('테이블 검색...')
  if (!await search.isVisible()) {
    await page.getByRole('button', { name: '테이블 목록 열기' }).click()
  }
  await search.fill('orders')
  const row = page.locator('.search-row').filter({ hasText: 'orders' }).first()
  await row.waitFor()
  await row.getByRole('button', { name: '주문 테이블 캔버스에 추가' }).click()
  await page.locator(`.vue-flow__node[data-id="${ordersNodeId}"]`).waitFor({ timeout: 15_000 })
}

async function queryOrders(page) {
  const node = page.locator(`.vue-flow__node[data-id="${ordersNodeId}"]`)
  await node.hover()
  const requestPromise = page.waitForRequest(/\/api\/gateway\/data-fabric\/api\/query$/)
  const responsePromise = page.waitForResponse(/\/api\/gateway\/data-fabric\/api\/query$/)
  await node.locator('.table-node__action-btn--query').click()
  const request = await requestPromise
  await responsePromise
  await page.locator('.table-data-panel').waitFor()
  await page.waitForFunction(() => {
    const panel = document.querySelector('.table-data-panel')
    if (!panel) return false
    const box = panel.getBoundingClientRect()
    const style = getComputedStyle(panel)
    return box.height >= 250
      && box.top < window.innerHeight - 200
      && box.bottom <= window.innerHeight + 1
      && (style.transform === 'none' || style.transform === 'matrix(1, 0, 0, 1, 0, 0)')
  })
  return request.postDataJSON()
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })

try {
  const projectionPage = await context.newPage()
  const projectionErrors = []
  projectionPage.on('pageerror', error => projectionErrors.push(error.message))
  const projectionRequests = await installCatalogFixture(projectionPage)
  await openSchema(projectionPage)
  const analyzerRequestsAtSchemaEntry = projectionRequests.analyzerGraph
  await addOrders(projectionPage)

  await projectionPage.locator(`.vue-flow__node[data-id="${customersNodeId}"]`).waitFor({ timeout: 15_000 })
  const userEdge = projectionPage.locator('.vue-flow__edge[data-id="rel-orders-customer_id-customers-id"]')
  const ddlEdge = projectionPage.locator('.vue-flow__edge[data-id="neo4j-orders-customer_id-customers-id"]')
  const codeEdge = projectionPage.locator('.vue-flow__edge[data-id="neo4j-orders-created_by-customers-id"]')
  await userEdge.waitFor()
  await ddlEdge.waitFor()
  await codeEdge.waitFor()

  assert(
    analyzerRequestsAtSchemaEntry > 0
      && projectionRequests.analyzerGraph === analyzerRequestsAtSchemaEntry,
    'Schema feature requested Analyzer graph data after navigation',
  )
  assert(
    await projectionPage.getByRole('region', { name: '분석 진행 상태' }).count() === 0
      && await projectionPage.getByRole('button', { name: '분석 진행 상태 열기' }).count() === 0,
    'Analyzer progress UI from the upload feature obscures schema controls',
  )

  assert((await userEdge.textContent()).includes('owns'), 'User relationship label was not preserved')
  assert((await ddlEdge.textContent()).includes('Order customer'), 'DDL relationship label was not preserved')
  assert((await codeEdge.textContent()).includes('Code owner'), 'Code relationship label was not preserved')

  const ddlStyle = await ddlEdge.locator('.vue-flow__edge-path').evaluate(element => ({
    stroke: getComputedStyle(element).stroke,
    dash: getComputedStyle(element).strokeDasharray,
  }))
  const codeStyle = await codeEdge.locator('.vue-flow__edge-path').evaluate(element => ({
    stroke: getComputedStyle(element).stroke,
    dash: getComputedStyle(element).strokeDasharray,
  }))
  assert(ddlStyle.stroke === 'rgb(34, 197, 94)', `Unexpected DDL edge color: ${ddlStyle.stroke}`)
  assert(ddlStyle.dash === 'none', `DDL edge must be solid: ${ddlStyle.dash}`)
  assert(codeStyle.stroke === 'rgb(56, 189, 248)', `Unexpected code edge color: ${codeStyle.stroke}`)
  assert(codeStyle.dash !== 'none', 'Code edge must be dashed')

  const firstDataQuery = await queryOrders(projectionPage)
  assert(firstDataQuery.datasource === 'fixture', 'Table query did not preserve the Catalog datasource')
  assert(
    firstDataQuery.query === 'SELECT * FROM public.orders LIMIT 25',
    `Unexpected initial table query: ${firstDataQuery.query}`,
  )
  assert(firstDataQuery.max_rows === 25, `Unexpected initial max_rows: ${firstDataQuery.max_rows}`)

  const tableDataPanel = projectionPage.locator('.table-data-panel')
  await tableDataPanel.locator('th').first().waitFor()
  assert(
    (await tableDataPanel.locator('.table-data-panel__title').textContent()).includes('public.orders'),
    'Table data panel lost the selected schema/table identity',
  )
  assert(
    await tableDataPanel.locator('th').allTextContents().then(values => values.join('|')) === 'id|customer_id',
    'Table data response columns were not preserved',
  )
  assert(
    await tableDataPanel.locator('tbody td').allTextContents().then(values => values.join('|')) === '1|7',
    'Table data response rows were not preserved',
  )

  const limitRequestPromise = projectionPage.waitForRequest(/\/api\/gateway\/data-fabric\/api\/query$/)
  const limitResponsePromise = projectionPage.waitForResponse(/\/api\/gateway\/data-fabric\/api\/query$/)
  await tableDataPanel.locator('.limit-selector select').selectOption('10')
  const limitBody = (await limitRequestPromise).postDataJSON()
  await limitResponsePromise
  assert(limitBody.query === 'SELECT * FROM public.orders LIMIT 10', `Unexpected limit query: ${limitBody.query}`)
  assert(limitBody.max_rows === 10, `Unexpected limit max_rows: ${limitBody.max_rows}`)
  assert(projectionRequests.dataQueries.length === 2, 'Limit change did not perform exactly one new query')

  await projectionPage.screenshot({
    path: join(evidenceDir, 'schema-table-data-1920x1080.png'),
    fullPage: true,
  })

  const ordersNode = projectionPage.locator(`.vue-flow__node[data-id="${ordersNodeId}"]`)
  await ordersNode.locator('.table-node__ref-btn').click()
  const referencesPopup = projectionPage.locator('.references-popup').filter({ hasText: 'load_orders' })
  await referencesPopup.waitFor()
  assert(projectionRequests.tableReferenceRequests === 1, 'Table references were not loaded exactly once')
  const referenceResult = referencesPopup.locator('.references-popup__item').filter({
    hasText: 'load_orders',
  })
  assert(
    await referenceResult.evaluate(element => element.tagName === 'BUTTON'),
    'Schema reference result is not a native button',
  )
  await projectionPage.screenshot({
    path: join(evidenceDir, 'schema-reference-result-native-button-1920x1080.png'),
    fullPage: true,
  })
  await referenceResult.focus()
  await projectionPage.keyboard.press('Enter')

  const sourcePanel = projectionPage.locator('.source-code-panel')
  await sourcePanel.waitFor()
  assert(
    (await sourcePanel.locator('.source-line-content').first().textContent()) === '1 | BEGIN',
    'Reference selection did not render Catalog code_text',
  )
  const statementError = sourcePanel.locator('.source-annotation-error')
  await statementError.waitFor()
  assert(
    (await statementError.textContent()).includes('ROBO 백엔드 서비스가 동작하지 않습니다'),
    'Statement annotation failure was hidden',
  )
  assert(await sourcePanel.locator('.source-line').count() === 3, 'Statement failure hid the source code')
  await statementError.getByRole('button').click()
  await statementError.waitFor({ state: 'detached' })
  const aiComment = sourcePanel.locator('.source-ai-comment')
  await aiComment.waitFor()
  assert((await aiComment.textContent()).includes('Reads order rows'), 'Statement retry did not render annotations')
  assert(projectionRequests.statementRequests === 2, 'Statement retry did not perform exactly one new request')
  await projectionPage.screenshot({
    path: join(evidenceDir, 'schema-source-annotation-retry-1920x1080.png'),
    fullPage: true,
  })
  await sourcePanel.locator('.source-panel-header button').click()
  await sourcePanel.waitFor({ state: 'detached' })

  await ddlEdge.dispatchEvent('dblclick')
  const derivedRelationshipDialog = projectionPage.getByRole('dialog', { name: 'Catalog 관계' })
  await derivedRelationshipDialog.waitFor()
  const derivedRelationshipText = await derivedRelationshipDialog.textContent()
  assert(
    /(?:ddl|code|procedure) 분석 결과/.test(derivedRelationshipText),
    `Derived Catalog relationship was not identified as read-only analysis output: ${derivedRelationshipText}`,
  )
  assert(
    await derivedRelationshipDialog.locator('.delete-button').count() === 0,
    'Derived Catalog relationship exposed a destructive delete action',
  )
  await projectionPage.screenshot({
    path: join(evidenceDir, 'schema-catalog-relationship-boundary-1920x1080.png'),
    fullPage: true,
  })
  await derivedRelationshipDialog.locator('.secondary-button').click()
  await derivedRelationshipDialog.waitFor({ state: 'detached' })
  assert(
    projectionRequests.ontologyRelationshipRequests === 0,
    'Catalog edge inspection called the Ontology relationship API',
  )

  const ddlToggle = projectionPage.locator('.legend-item').filter({ hasText: 'DDL 정의' }).getByRole('checkbox')
  await ddlToggle.uncheck()
  await ddlEdge.waitFor({ state: 'detached' })
  assert(await userEdge.isVisible(), 'DDL visibility toggle removed a user relationship')
  assert(await codeEdge.isVisible(), 'DDL visibility toggle removed a code relationship')

  await projectionPage.screenshot({
    path: join(evidenceDir, 'schema-relationship-projection-1920x1080.png'),
    fullPage: true,
  })

  await userEdge.dispatchEvent('dblclick')
  const userRelationshipDialog = projectionPage.getByRole('dialog', { name: 'Catalog 관계' })
  await userRelationshipDialog.waitFor()
  assert(
    (await userRelationshipDialog.textContent()).includes('생성과 삭제'),
    'User Catalog relationship did not expose its actual backend capability',
  )
  await userRelationshipDialog.locator('.delete-button').click()
  const deleteDialog = projectionPage.getByRole('alertdialog', { name: 'Catalog 관계 삭제' })
  await deleteDialog.waitFor()
  await deleteDialog.getByRole('button', { name: '관계 삭제' }).click()
  await userRelationshipDialog.waitFor({ state: 'detached' })
  await userEdge.waitFor({ state: 'detached' })
  assert(projectionRequests.catalogRelationshipDeletes === 1, 'Catalog relationship delete was not sent once')
  assert(
    projectionRequests.ontologyRelationshipRequests === 0,
    'Catalog relationship delete also called the Ontology backend',
  )
  assert(await codeEdge.isVisible(), 'Catalog user relationship deletion removed a code-derived edge')
  assert(projectionErrors.length === 0, `Schema projection page errors: ${projectionErrors.join(' | ')}`)

  const failurePage = await context.newPage()
  const failureErrors = []
  failurePage.on('pageerror', error => failureErrors.push(error.message))
  await installCatalogFixture(failurePage, { failRelated: true, failDataQuery: true })
  await openSchema(failurePage)
  await addOrders(failurePage)

  const relatedAlert = failurePage.locator('.resource-alert').filter({ hasText: '관련 릴레이션' })
  await relatedAlert.waitFor()
  assert((await relatedAlert.textContent()).includes('다시 시도'), 'Related-table failure has no retry action')
  const [alertBox, legendBox] = await Promise.all([
    relatedAlert.boundingBox(),
    failurePage.locator('.canvas-legend').boundingBox(),
  ])
  assert(alertBox && legendBox, 'Related-table alert or schema legend has no layout box')
  assert(
    alertBox.x + alertBox.width <= legendBox.x
      || legendBox.x + legendBox.width <= alertBox.x
      || alertBox.y + alertBox.height <= legendBox.y
      || legendBox.y + legendBox.height <= alertBox.y,
    'Related-table alert overlaps the schema legend',
  )
  assert(
    await failurePage.locator(`.vue-flow__node[data-id="${customersNodeId}"]`).count() === 0,
    'Catalog failure inferred and added a customer table from an _id column',
  )
  assert(
    await failurePage.locator('.vue-flow__edge').count() === 0,
    'Catalog failure rendered an inferred relationship edge',
  )
  const failedDataQuery = await queryOrders(failurePage)
  assert(failedDataQuery.datasource === 'fixture', 'Failed query lost the Catalog datasource')
  const dataQueryError = failurePage.locator('.table-data-panel .error-state')
  await dataQueryError.waitFor()
  assert(
    (await dataQueryError.textContent()).includes('Data Fabric fixture outage'),
    'Data Fabric failure was hidden or replaced with fabricated table data',
  )
  await failurePage.screenshot({
    path: join(evidenceDir, 'schema-relationship-failure-1920x1080.png'),
    fullPage: true,
  })
  assert(failureErrors.length === 0, `Schema failure page errors: ${failureErrors.join(' | ')}`)

  const mobilePage = await context.newPage()
  await mobilePage.setViewportSize({ width: 390, height: 844 })
  await mobilePage.addInitScript(() => {
    localStorage.setItem('robo-analyzer-api-key', 'fixture-catalog-key')
  })
  const mobileErrors = []
  mobilePage.on('pageerror', error => mobileErrors.push(error.message))
  const mobileRequests = await installCatalogFixture(
    mobilePage,
    { failTableDescriptionOnce: true },
  )
  await openSchema(mobilePage)
  await addOrders(mobilePage)
  const mobileOrdersNode = mobilePage.locator(
    `.vue-flow__node[data-id="${ordersNodeId}"]`,
  )
  await mobileOrdersNode.dispatchEvent('dblclick')

  const detailPanel = mobilePage.locator('.detail-panel')
  await detailPanel.waitFor()
  const tableDescription = detailPanel.locator('.detail-field').filter({ hasText: '설명' }).first()
  const tableDescriptionEdit = tableDescription.getByRole('button', { name: 'orders 테이블 설명 편집' })
  await tableDescriptionEdit.focus()
  await mobilePage.keyboard.press('Enter')
  const tableDescriptionInput = tableDescription.getByRole('textbox', { name: '테이블 설명' })
  await tableDescriptionInput.fill('모바일 주문 원장')
  await tableDescription.getByRole('button', { name: '저장' }).click()
  const tableSaveError = tableDescription.getByRole('alert')
  await tableSaveError.waitFor()
  assert(
    await tableDescriptionInput.inputValue() === '모바일 주문 원장',
    'Failed table-description save discarded the exact draft',
  )
  await tableDescription.getByRole('button', { name: '다시 시도' }).click()
  await tableDescriptionInput.waitFor({ state: 'detached' })
  assert(
    mobileRequests.tableDescriptionRequests.length === 2,
    'Table-description retry did not send exactly the same operation twice',
  )
  for (const request of mobileRequests.tableDescriptionRequests) {
    assert(request.headers['x-api-key'] === 'fixture-catalog-key', 'Catalog X-API-Key header was missing')
    assert(request.headers['x-llm-api-key'] === 'fixture-catalog-key', 'Session LLM header was lost')
    assert(
      JSON.stringify(request.body) === JSON.stringify({
        name: 'orders',
        schema: 'public',
        description: '모바일 주문 원장',
      }),
      `Unexpected table-description body: ${JSON.stringify(request.body)}`,
    )
  }

  const createdByColumn = detailPanel.locator('.column-item').filter({ hasText: 'created_by' })
  const columnDescriptionEdit = createdByColumn.getByRole('button', {
    name: 'created_by 컬럼 설명 편집',
  })
  await columnDescriptionEdit.focus()
  await mobilePage.keyboard.press('Space')
  await createdByColumn.getByRole('textbox', { name: 'created_by 컬럼 설명' }).fill('생성 사용자')
  await createdByColumn.getByRole('button', { name: '저장' }).click()
  await createdByColumn.getByRole('textbox', { name: 'created_by 컬럼 설명' }).waitFor({
    state: 'detached',
  })
  assert(
    mobileRequests.columnDescriptionRequests.length === 1,
    'Column-description mutation was not sent once',
  )
  assert(
    mobileRequests.columnDescriptionRequests[0].headers['x-api-key'] === 'fixture-catalog-key',
    'Column-description Catalog API key was missing',
  )
  assert(
    JSON.stringify(mobileRequests.columnDescriptionRequests[0].body) === JSON.stringify({
      table_name: 'orders',
      table_schema: 'public',
      column_name: 'created_by',
      description: '생성 사용자',
    }),
    `Unexpected column-description body: ${JSON.stringify(mobileRequests.columnDescriptionRequests[0].body)}`,
  )

  await detailPanel.getByRole('button', { name: '추가' }).click()
  await detailPanel.getByRole('combobox', { name: '출발 컬럼' }).selectOption('created_by')
  await detailPanel.getByRole('combobox', { name: '대상 테이블' }).selectOption({ label: 'customers' })
  await detailPanel.getByRole('combobox', { name: '대상 컬럼' }).selectOption('id')
  await detailPanel.getByRole('textbox', { name: '릴레이션 설명' }).fill('created by')
  await detailPanel.getByRole('button', { name: '릴레이션 추가' }).click()
  assert(
    mobileRequests.catalogRelationshipCreates.length === 1,
    'Relationship create was not sent once',
  )
  const createdRelationship = mobileRequests.catalogRelationshipCreates[0]
  assert(createdRelationship.from_schema === 'public', 'Source schema was not preserved')
  assert(createdRelationship.to_schema === 'public', 'Target schema was not preserved')
  assert(!('match_strategy' in createdRelationship), 'Unsupported match_strategy leaked to Catalog')
  assert(!('matchStrategy' in createdRelationship), 'Unsupported matchStrategy leaked to Catalog')

  const mobileLayout = await mobilePage.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    panel: (() => {
      const element = document.querySelector('.detail-panel')
      const box = element?.getBoundingClientRect()
      return box ? { left: box.left, right: box.right, width: box.width } : null
    })(),
  }))
  assert(mobileLayout.panel, 'Mobile detail panel has no layout box')
  assert(mobileLayout.panel.left >= 0, 'Mobile detail panel escapes the left viewport edge')
  assert(mobileLayout.panel.right <= 391, 'Mobile detail panel escapes the right viewport edge')
  assert(
    mobileLayout.documentWidth <= mobileLayout.viewportWidth + 1,
    `Schema detail created horizontal overflow: ${JSON.stringify(mobileLayout)}`,
  )
  await mobilePage.screenshot({
    path: join(evidenceDir, 'schema-detail-lifecycle-390x844.png'),
    fullPage: true,
  })
  assert(mobileErrors.length === 0, `Schema mobile page errors: ${mobileErrors.join(' | ')}`)

  console.log(JSON.stringify({
    result: 'passed',
    viewport: '1920x1080 and 390x844',
    verified: [
      'user, DDL and code relationship rendering',
      'relationship label, color and dash contracts',
      'independent relationship visibility toggles',
      'Catalog and Ontology relationship API boundary separation',
      'derived relationship read-only state and user relationship Catalog delete',
      'Data Fabric table query request and response projection',
      'table query limit refresh contract',
      'honest Data Fabric query failure state',
      'user-driven Catalog reference to Analyzer source handoff',
      'source statement failure, preserved code and successful retry',
      'Analyzer graph loading and progress UI scoped to upload/graph features',
      'honest related-table outage with retry',
      'no _id-based inferred table or edge on Catalog failure',
      'table and column description headers, exact retry, and validated success commit',
      'relationship target schema and backend-supported payload only',
      'mobile detail-panel containment without horizontal overflow',
    ],
  }, null, 2))
} finally {
  await context.close()
  await browser.close()
}
