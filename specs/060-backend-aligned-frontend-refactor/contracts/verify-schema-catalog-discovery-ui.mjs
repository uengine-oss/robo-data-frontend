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
    table_schema: 'sales',
    datasource: 'warehouse',
    logical_name: '주문',
    description: '고객 주문',
    description_source: 'ddl',
    analyzed_description: '판매 주문 원장',
    column_count: 2,
  },
  {
    name: 'customers',
    table_schema: 'sales',
    datasource: 'lakehouse',
    logical_name: '고객',
    description: '고객 기준 정보',
    description_source: 'ddl',
    analyzed_description: '판매 고객 마스터',
    column_count: 1,
  },
]

const columns = [
  {
    name: 'id',
    table_name: 'orders',
    dtype: 'bigint',
    nullable: false,
    logical_name: '주문 ID',
    description: '주문 식별자',
    description_source: 'ddl',
    analyzed_description: '주문의 기본 키',
  },
  {
    name: 'customer_id',
    table_name: 'orders',
    dtype: 'bigint',
    nullable: false,
    logical_name: '고객 ID',
    description: '고객 식별자',
    description_source: 'ddl',
    analyzed_description: '주문 고객 참조',
  },
]
const ordersNodeId = `table-${encodeURIComponent(JSON.stringify(['warehouse', 'sales', 'orders']))}`

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await context.addInitScript(() => {
  localStorage.setItem('robo-analyzer-api-key', 'schema-discovery-key')
})

try {
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))

  const requests = {
    tableList: [],
    semantic: [],
    columns: [],
  }
  let tableListAttempt = 0
  let semanticAttempt = 0
  let columnAttempt = 0

  await page.route(/\/api\/gateway\/robo\/graph\/$/, route => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: '{"detail":"Analyzer graph is outside this Catalog scenario"}',
  }))
  await page.route(/\/api\/gateway\/robo\/schema\/relationships(?:\?.*)?$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )
  await page.route(/\/api\/gateway\/robo\/graph\/related-tables\/orders$/, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ base_table: 'orders', tables: [], relationships: [] }),
    }),
  )
  await page.route(/\/api\/gateway\/robo\/schema\/tables\?/, route => {
    tableListAttempt += 1
    requests.tableList.push({
      url: route.request().url(),
      headers: route.request().headers(),
    })
    if (tableListAttempt === 1) {
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"detail":"Catalog table list fixture outage"}',
      })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(tables),
    })
  })
  await page.route(/\/api\/gateway\/robo\/schema\/semantic-search$/, route => {
    semanticAttempt += 1
    const body = route.request().postDataJSON()
    requests.semantic.push({
      body,
      headers: route.request().headers(),
    })
    if (semanticAttempt === 2) {
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"detail":"Catalog semantic fixture outage"}',
      })
    }
    const result = semanticAttempt === 1
      ? [{
          name: 'orders_archive',
          schema: 'sales',
          description: '이전 주문 보관',
          similarity: 0.91,
        }]
      : [{
          name: 'customers',
          schema: 'sales',
          description: '고객 기준 정보',
          similarity: 0.88,
        }]
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(result),
    })
  })
  await page.route(/\/api\/gateway\/robo\/schema\/tables\/orders\/columns\?/, route => {
    columnAttempt += 1
    requests.columns.push({
      url: route.request().url(),
      headers: route.request().headers(),
    })
    if (columnAttempt === 1) {
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"detail":"Catalog columns fixture outage"}',
      })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(columns),
    })
  })

  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  const feature = page.locator('button[title="데이터 스키마"]').first()
  await feature.waitFor({ state: 'visible', timeout: 15_000 })
  await feature.click()

  const tableListAlert = page.locator('.resource-alert--panel')
  await tableListAlert.waitFor()
  assert(
    (await tableListAlert.textContent()).includes('테이블 목록을 불러오지 못했습니다'),
    'Catalog table-list failure was not shown distinctly',
  )
  await tableListAlert.getByRole('button', { name: '다시 시도' }).click()

  const search = page.getByPlaceholder('테이블 검색...')
  await search.waitFor()
  await page.locator('.panel-count').filter({ hasText: '2' }).waitFor()
  assert(tableListAttempt === 2, `Table-list retry count was ${tableListAttempt}, expected 2`)
  assert(
    requests.tableList.every(request =>
      request.url.includes('limit=1000') && request.headers['accept-language'] === 'ko'),
    'Catalog table-list request lost its limit or runtime language header',
  )

  const warehouseDatasource = page.getByRole('button', { name: 'warehouse 데이터소스' })
  const lakehouseDatasource = page.getByRole('button', { name: 'lakehouse 데이터소스' })
  const warehouseSales = page.getByRole('button', { name: 'warehouse sales 스키마' })
  const lakehouseSales = page.getByRole('button', { name: 'lakehouse sales 스키마' })
  const warehouseSchemasId = await warehouseDatasource.getAttribute('aria-controls')
  const warehouseSalesId = await warehouseSales.getAttribute('aria-controls')
  const lakehouseSalesId = await lakehouseSales.getAttribute('aria-controls')
  assert(
    warehouseSchemasId && warehouseSalesId && lakehouseSalesId
      && warehouseSalesId !== lakehouseSalesId,
    'Schema tree disclosures did not expose datasource-qualified content IDs',
  )
  const ordersTreeItem = page.locator('.table-item__name', { hasText: 'orders' })
  const customersTreeItem = page.locator('.table-item__name', { hasText: 'customers' })
  await ordersTreeItem.waitFor({ state: 'visible' })
  await customersTreeItem.waitFor({ state: 'visible' })

  await warehouseSales.focus()
  await page.keyboard.press('Space')
  await page.locator(`#${warehouseSalesId}`).waitFor({ state: 'detached' })
  assert(
    await warehouseSales.getAttribute('aria-expanded') === 'false'
      && await lakehouseSales.getAttribute('aria-expanded') === 'true'
      && await customersTreeItem.isVisible(),
    'Same-name schema toggle leaked across datasource identity',
  )
  await page.keyboard.press('Enter')
  await page.locator(`#${warehouseSalesId}`).waitFor({ state: 'visible' })

  await warehouseDatasource.focus()
  await page.keyboard.press('Enter')
  await page.locator(`#${warehouseSchemasId}`).waitFor({ state: 'detached' })
  assert(
    await warehouseDatasource.getAttribute('aria-expanded') === 'false'
      && await lakehouseDatasource.getAttribute('aria-expanded') === 'true'
      && await customersTreeItem.isVisible(),
    'Datasource disclosure changed a sibling datasource subtree',
  )
  await page.keyboard.press('Space')
  await page.locator(`#${warehouseSchemasId}`).waitFor({ state: 'visible' })
  await page.screenshot({
    path: join(evidenceDir, 'schema-tree-disclosure-identity-1440x900.png'),
    fullPage: true,
  })

  await search.fill('주문')
  const firstSemantic = page.locator('.semantic-section .search-row').filter({
    hasText: 'orders_archive',
  })
  await firstSemantic.waitFor({ timeout: 15_000 })

  await search.fill('고객 의도')
  const semanticAlert = page.locator('.semantic-section [role="alert"]')
  await semanticAlert.waitFor({ timeout: 15_000 })
  assert(
    (await semanticAlert.textContent()).trim().length > 0,
    'Catalog semantic failure was rendered without an error message',
  )
  assert(
    await firstSemantic.isVisible(),
    'A failed semantic refresh discarded the last valid semantic result',
  )

  await semanticAlert.getByRole('button', { name: '같은 검색 다시 시도' }).click()
  const retriedSemantic = page.locator('.semantic-section .search-row').filter({
    hasText: 'customers',
  })
  await retriedSemantic.waitFor({ timeout: 15_000 })
  assert(requests.semantic.length === 3, 'Semantic retry did not issue exactly one request')
  assert(
    requests.semantic[1].body.query === '고객 의도'
      && requests.semantic[2].body.query === '고객 의도',
    'Semantic retry changed the failed query target',
  )
  assert(
    requests.semantic.every(request =>
      request.body.limit === 10
      && request.headers['x-api-key'] === 'schema-discovery-key'
      && request.headers['x-llm-api-key'] === 'schema-discovery-key'),
    'Catalog semantic request lost its limit or required API-key headers',
  )

  await search.fill('orders')
  const ordersRow = page.locator('.search-results > .search-row').filter({ hasText: 'orders' }).first()
  await ordersRow.waitFor()
  const canvas = page.locator('.canvas-area')
  await canvas.evaluate((element) => {
    const dataTransfer = new DataTransfer()
    dataTransfer.setData('application/json', '{')
    element.dispatchEvent(new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      clientX: 720,
      clientY: 420,
      dataTransfer,
    }))
  })
  const malformedDropAlert = page.locator('.canvas-resource-alerts [role="alert"]').filter({
    hasText: '올바른 JSON이 아닙니다',
  })
  await malformedDropAlert.waitFor()
  assert(columnAttempt === 0, 'Malformed drop issued a Catalog column request')
  assert(
    await page.locator('.vue-flow__node').count() === 0,
    'Malformed drop mutated the schema canvas',
  )
  await malformedDropAlert.getByRole('button', { name: '닫기' }).click()

  const wrappedDropPayload = JSON.stringify({
    table: {
      name: 'orders',
      schema: 'sales',
      datasource: 'warehouse',
      logical_name: '주문',
      description: '고객 주문',
      description_source: 'ddl',
      analyzed_description: '판매 주문 원장',
      column_count: 2,
    },
  })
  await canvas.evaluate((element, payload) => {
    const dataTransfer = new DataTransfer()
    dataTransfer.setData('application/json', payload)
    element.dispatchEvent(new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      clientX: 720,
      clientY: 420,
      dataTransfer,
    }))
  }, wrappedDropPayload)

  const dropRetryAlert = page.locator('.canvas-resource-alerts [role="alert"]').filter({
    hasText: '테이블 드롭에 실패했습니다',
  })
  await dropRetryAlert.waitFor({ timeout: 15_000 })
  const dropRetryText = await dropRetryAlert.locator('span').textContent()
  assert(
    dropRetryText.replace('테이블 드롭에 실패했습니다:', '').trim().length > 0,
    `Dropped-table column failure did not preserve a visible error: ${dropRetryText}`,
  )

  await dropRetryAlert.getByRole('button', { name: '같은 테이블 다시 시도' }).click()
  await page.locator(`.vue-flow__node[data-id="${ordersNodeId}"]`).waitFor({ timeout: 15_000 })
  assert(columnAttempt === 2, `Column retry count was ${columnAttempt}, expected 2`)
  assert(
    await page.locator(`.vue-flow__node[data-id="${ordersNodeId}"]`).count() === 1,
    'Dropped-table retry committed more than one schema node',
  )
  assert(
    await page.locator('.canvas-resource-alerts [role="alert"]').filter({
      hasText: '테이블 드롭에 실패했습니다',
    }).count() === 0,
    'Successful dropped-table retry left the failed target alert visible',
  )
  assert(
    requests.columns.every(request =>
      request.url.includes('schema=sales')
      && request.headers['accept-language'] === 'ko'),
    'Catalog column request lost its canonical schema identity or runtime language header',
  )

  await page.screenshot({
    path: join(evidenceDir, 'schema-catalog-discovery-retry-1440x900.png'),
    fullPage: true,
  })
  assert(pageErrors.length === 0, `Schema discovery page errors: ${pageErrors.join(' | ')}`)

  console.log(JSON.stringify({
    result: 'passed',
    viewport: '1440x900',
    requests: {
      tableList: requests.tableList.length,
      semantic: requests.semantic.map(request => request.body.query),
      columns: requests.columns.length,
    },
    verified: [
      'table-list failure and retry',
      'datasource and datasource-qualified schema keyboard disclosures',
      'same-name schemas remain independently expanded across datasources',
      'semantic failure preserves the last valid result',
      'semantic retry keeps the exact failed query',
      'malformed drag payload is visible and does not mutate or request',
      'dropped-table column failure retains a frozen target and retries to one node',
      'Catalog discovery URL, query, language, and API-key request contract',
    ],
  }, null, 2))
} finally {
  await context.close()
  await browser.close()
}
