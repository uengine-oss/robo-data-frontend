import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../../..')
const require = createRequire(join(repoRoot, '.unittest/package.json'))
const { chromium } = require('playwright')

const baseUrl = process.env.FRONTEND_URL ?? 'http://127.0.0.1:3000'
const gatewayUrl = process.env.GATEWAY_URL ?? 'http://127.0.0.1:9000'
const evidenceDir = resolve(here, '../evidence')
const screenshotDir = join(evidenceDir, 'screenshots', 'checkpoint')
const outputPath = join(evidenceDir, 'schema-checkpoint-interactions.json')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function graphInventory(request) {
  const response = await request.get(`${gatewayUrl}/api/gateway/robo/graph/`, {
    headers: { 'X-Neo4j-Database': 'neo4j' },
    timeout: 120_000,
  })
  assert(response.ok(), `graph inventory HTTP ${response.status()}`)
  const payload = await response.json()
  return {
    nodes: Array.isArray(payload.Nodes) ? payload.Nodes.length : -1,
    relationships: Array.isArray(payload.Relationships) ? payload.Relationships.length : -1,
    fkRelationships: Array.isArray(payload.Relationships)
      ? payload.Relationships.filter(item => item.Type === 'FK').length
      : -1,
  }
}

async function activateSchema(page) {
  await page.getByTitle('데이터 스키마', { exact: true }).click()
  await page.locator('.schema-view').waitFor({ state: 'visible', timeout: 60_000 })
}

function tableNode(page, physicalName) {
  return page.locator('.vue-flow__node').filter({
    has: page.locator('.table-node__name', { hasText: new RegExp(`^${physicalName}$`) }),
  }).first()
}

async function setPhysicalNames(page) {
  const toggle = page.locator('.schema-view .name-toggle')
  await toggle.waitFor({ state: 'visible', timeout: 15_000 })
  if ((await toggle.locator('.toggle-text').textContent())?.trim() !== '물리명') {
    await toggle.click()
  }
  assert(
    (await toggle.locator('.toggle-text').textContent())?.trim() === '물리명',
    'schema name mode did not switch to physical names',
  )
}

async function screenshot(page, name) {
  await page.screenshot({ path: join(screenshotDir, name), fullPage: true })
}

async function clickNodeAction(node, title) {
  await node.locator('.table-node__header').hover()
  const action = node.getByTitle(title, { exact: true })
  await action.waitFor({ state: 'visible', timeout: 10_000 })
  await action.click()
}

await mkdir(screenshotDir, { recursive: true })
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  locale: 'ko-KR',
})
const page = await context.newPage()
const pageErrors = []
const consoleErrors = []
const requestFailures = []
const httpFailures = []
const requests = []
const blockedMutations = []
const expectedFailures = []
let injectChannelFailure = false
let channelFailureInjected = false

page.on('pageerror', error => pageErrors.push(error.message))
page.on('console', message => {
  if (message.type() === 'error') consoleErrors.push(message.text())
})
page.on('requestfailed', request => {
  if (request.failure()?.errorText !== 'net::ERR_BLOCKED_BY_CLIENT') {
    requestFailures.push({ url: request.url(), error: request.failure()?.errorText })
  }
})
page.on('response', response => {
  const item = {
    method: response.request().method(),
    status: response.status(),
    url: response.url(),
  }
  if (item.url.includes('/api/gateway/')) requests.push(item)
  if (item.status >= 500) httpFailures.push(item)
})
await page.route('**/api/gateway/**', async route => {
  const request = route.request()
  const url = request.url()
  const method = request.method()
  if (
    injectChannelFailure
    && !channelFailureInjected
    && method === 'GET'
    && url.includes('/schema/tables/orders/references')
    && url.includes('column_name=channel_cd')
  ) {
    channelFailureInjected = true
    expectedFailures.push({ method, status: 503, url })
    return route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'injected column-reference checkpoint failure' }),
    })
  }

  const safeMethod = ['GET', 'HEAD', 'OPTIONS'].includes(method)
  const readOnlyPost = method === 'POST' && (
    url.includes('/schema/semantic-search')
    || url.includes('/data-fabric/api/query')
  )
  if (safeMethod || readOnlyPost) return route.continue()
  blockedMutations.push({ method, url })
  return route.abort('blockedbyclient')
})

let result
try {
  const inventoryBefore = await graphInventory(page.request)
  assert(inventoryBefore.nodes > 0 && inventoryBefore.relationships > 0, 'Neo4j checkpoint is empty')
  assert(inventoryBefore.fkRelationships === 11, 'Neo4j FK relationship count is not 11')

  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  await activateSchema(page)

  const datasourceHeader = page.getByRole('button', { name: 'shopmall 데이터소스' })
  await datasourceHeader.waitFor({ state: 'visible', timeout: 30_000 })
  assert(await datasourceHeader.getAttribute('aria-expanded') !== null, 'datasource tree is not accessible')

  const search = page.getByPlaceholder('테이블 검색...')
  await search.fill('orders')
  const ordersSearchRow = page.locator('.search-row').filter({
    has: page.locator('.search-row__sub', { hasText: /^orders/ }),
  }).first()
  await ordersSearchRow.waitFor({ state: 'visible', timeout: 15_000 })
  await ordersSearchRow.locator('.search-row__primary').click()

  await setPhysicalNames(page)
  await page.locator('.table-node').first().waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForFunction(
    () => document.querySelectorAll('.table-node').length === 6
      && document.querySelectorAll('.vue-flow__edge').length === 5,
    null,
    { timeout: 30_000 },
  )
  assert(await page.locator('.table-node').count() === 6, 'orders did not load its five FK-related tables')
  assert(await page.locator('.vue-flow__edge').count() === 5, 'five DDL FK edges were not rendered')

  const orders = tableNode(page, 'orders')
  await orders.waitFor({ state: 'visible', timeout: 15_000 })
  await ordersSearchRow.locator('.search-row__primary').click()
  assert(await page.locator('.table-node').count() === 6, 'selecting orders created a duplicate node')

  const ddlToggle = page.locator('.legend-item').filter({ hasText: 'DDL 정의' }).locator('input')
  await ddlToggle.uncheck()
  await page.waitForFunction(() => document.querySelectorAll('.vue-flow__edge').length === 0)
  await ddlToggle.check()
  await page.waitForFunction(() => document.querySelectorAll('.vue-flow__edge').length === 5)

  const expand = orders.locator('.table-node__toggle')
  if (await expand.isVisible()) await expand.click()
  assert(await orders.locator('.table-node__column').count() === 12, 'orders did not render all 12 columns')

  const tableReferenceResponsePromise = page.waitForResponse(response =>
    response.url().includes('/schema/tables/orders/references')
      && !response.url().includes('column_name=')
      && response.status() === 200,
  )
  await orders.locator('.table-node__ref-btn').click()
  const tableReferenceResponse = await tableReferenceResponsePromise
  const tableReferenceBody = await tableReferenceResponse.json()
  assert(tableReferenceBody.framework_references.length === 18, 'orders table references are not 18')
  assert(
    tableReferenceBody.framework_references.filter(item => item.access_type === 'READS').length === 9,
    'orders READS references are not 9',
  )
  assert(
    tableReferenceBody.framework_references.filter(item => item.access_type === 'WRITES').length === 9,
    'orders WRITES references are not 9',
  )
  const tablePopup = page.locator('.references-popup:visible')
  await tablePopup.locator('.references-popup__item').first().waitFor({ state: 'visible' })
  assert(await tablePopup.locator('.references-popup__item').count() === 18, 'table popup did not render 18 references')
  assert((await tablePopup.textContent()).includes('읽기'), 'table popup has no READS label')
  assert((await tablePopup.textContent()).includes('쓰기'), 'table popup has no WRITES label')
  await screenshot(page, '18-schema-orders-table-references-1920x1080.png')

  await tablePopup.locator('.references-popup__item').filter({ hasText: 'check_purchased' }).click()
  const sourcePanel = page.locator('.source-code-panel')
  await sourcePanel.waitFor({ state: 'visible', timeout: 30_000 })
  assert((await sourcePanel.locator('.source-panel-filename').textContent())?.trim() === 'review_point.c', 'source filename mismatch')
  assert((await sourcePanel.locator('.source-panel-procedure').textContent())?.trim() === 'check_purchased', 'source symbol mismatch')
  assert((await sourcePanel.locator('.source-panel-line').textContent())?.includes('117'), 'source evidence line mismatch')
  const highlightedSource = sourcePanel.locator('.source-line.highlighted')
  await highlightedSource.waitFor({ state: 'visible', timeout: 15_000 })
  assert((await highlightedSource.textContent()).includes('orders'), 'highlighted evidence does not reference orders')
  await page.waitForTimeout(400)
  await screenshot(page, '19-schema-source-evidence-1920x1080.png')
  await sourcePanel.locator('.source-panel-header button').click()
  await sourcePanel.waitFor({ state: 'hidden', timeout: 10_000 })

  const memberResponsePromise = page.waitForResponse(response =>
    response.url().includes('/schema/tables/orders/references')
      && response.url().includes('column_name=member_id')
      && response.status() === 200,
  )
  await orders.getByRole('button', { name: 'member_id 컬럼의 코드 참조 보기' }).click()
  const memberBody = await (await memberResponsePromise).json()
  assert(memberBody.framework_references.length === 4, 'member_id evidence references are not 4')
  assert(
    memberBody.framework_references.every(item => item.access_type === 'READS'),
    'member_id returned an unsupported write attribution',
  )
  const memberPopup = page.locator('.references-popup:visible')
  await memberPopup.locator('.references-popup__item').first().waitFor({ state: 'visible' })
  assert(await memberPopup.locator('.references-popup__item').count() === 4, 'member_id popup did not render 4 references')
  await page.waitForTimeout(300)
  await screenshot(page, '20-schema-member-id-column-references-1920x1080.png')
  await memberPopup.locator('.references-popup__header button').click()

  injectChannelFailure = true
  await orders.getByRole('button', { name: 'channel_cd 컬럼의 코드 참조 보기' }).click()
  const channelPopup = page.locator('.references-popup:visible')
  await channelPopup.getByRole('button', { name: '다시 시도' }).waitFor({ state: 'visible', timeout: 15_000 })
  const channelRetryPromise = page.waitForResponse(response =>
    response.url().includes('/schema/tables/orders/references')
      && response.url().includes('column_name=channel_cd')
      && response.status() === 200,
  )
  await channelPopup.getByRole('button', { name: '다시 시도' }).click()
  const channelBody = await (await channelRetryPromise).json()
  assert(channelBody.framework_references.length === 0, 'channel_cd should have no evidence-grounded reference')
  await channelPopup.getByText(/참조 없음/).waitFor({ state: 'visible', timeout: 15_000 })
  await channelPopup.locator('.references-popup__header button').click()

  await orders.locator('.table-node__header').dblclick()
  const detail = page.locator('.detail-panel')
  await detail.waitFor({ state: 'visible', timeout: 15_000 })
  assert((await detail.locator('.detail-panel__title').textContent()).includes('orders'), 'orders detail did not open')
  assert(await detail.locator('.column-item').count() === 12, 'detail panel did not render 12 columns')
  const tableEdit = detail.getByRole('button', { name: 'orders 테이블 설명 편집' })
  if (await tableEdit.isVisible().catch(() => false)) {
    await tableEdit.click()
    await detail.getByRole('button', { name: '취소' }).first().click()
  }
  const columnEdit = detail.getByRole('button', { name: 'member_id 컬럼 설명 편집' })
  await columnEdit.click()
  await detail.getByRole('button', { name: '취소' }).first().click()
  const relationshipSection = detail.locator('.detail-section').filter({
    has: page.getByRole('heading', { name: '릴레이션' }),
  })
  await relationshipSection.getByRole('button', { name: /추가/ }).click()
  await relationshipSection.getByLabel('출발 컬럼').waitFor({ state: 'visible' })
  await relationshipSection.getByRole('button', { name: '취소' }).click()
  await detail.locator('.detail-panel__header button').click()

  await clickNodeAction(orders, '테이블 데이터 조회')
  const dataPanel = page.locator('.table-data-panel')
  await dataPanel.waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForFunction(
    () => {
      const panel = document.querySelector('.table-data-panel')
      return panel && !panel.querySelector('.loading-state')
    },
    null,
    { timeout: 60_000 },
  )
  assert(await dataPanel.locator('.error-state').count() === 0, `table query failed: ${await dataPanel.textContent()}`)
  assert(await dataPanel.locator('.data-table th').count() > 0, 'table query returned no column contract')
  const dataQueryColumns = await dataPanel.locator('.data-table th').count()
  await dataPanel.getByTitle('SQL 보기').click()
  assert((await dataPanel.locator('.sql-code').textContent()).toLowerCase().includes('orders'), 'executed SQL does not target orders')
  await dataPanel.locator('.table-data-panel__header button').last().click()

  const shippingTrace = tableNode(page, 'shipping_trace')
  await clickNodeAction(shippingTrace, '캔버스에서 제거')
  await page.waitForFunction(() => document.querySelectorAll('.table-node').length === 5)
  await clickNodeAction(orders, '관련 테이블 로드')
  await page.waitForFunction(
    () => document.querySelectorAll('.table-node').length === 6
      && document.querySelectorAll('.vue-flow__edge').length === 5,
    null,
    { timeout: 30_000 },
  )

  await search.fill('definitely_missing_schema_table')
  await page.locator('.search-empty').waitFor({ state: 'visible' })
  await search.fill('')

  await page.getByRole('button', { name: '비우기' }).click()
  const clearDialog = page.getByRole('alertdialog', { name: '캔버스 비우기' })
  await clearDialog.waitFor({ state: 'visible' })
  await clearDialog.getByRole('button', { name: '취소' }).click()
  assert(await page.locator('.table-node').count() === 6, 'clear-canvas cancel removed nodes')

  const retryContext = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: 'ko-KR',
  })
  const retryPage = await retryContext.newPage()
  let tableListFailureInjected = false
  const retryResponses = []
  await retryPage.route('**/api/gateway/robo/schema/tables?*', async route => {
    if (!tableListFailureInjected) {
      tableListFailureInjected = true
      retryResponses.push({ status: 503, url: route.request().url() })
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'injected schema-table checkpoint failure' }),
      })
    }
    return route.continue()
  })
  await retryPage.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  await activateSchema(retryPage)
  const listAlert = retryPage.locator('.resource-alert--panel')
  await listAlert.waitFor({ state: 'visible', timeout: 30_000 })
  const retryListResponsePromise = retryPage.waitForResponse(response =>
    response.url().includes('/robo/schema/tables?') && response.status() === 200,
  )
  await listAlert.getByRole('button', { name: '다시 시도' }).click()
  await retryListResponsePromise
  await retryPage.getByRole('button', { name: 'shopmall 데이터소스' }).waitFor({ state: 'visible' })
  retryResponses.push({ status: 200, url: 'schema table list retry' })
  await retryContext.close()

  const inventoryAfter = await graphInventory(page.request)
  assert(
    inventoryAfter.nodes === inventoryBefore.nodes
      && inventoryAfter.relationships === inventoryBefore.relationships
      && inventoryAfter.fkRelationships === inventoryBefore.fkRelationships,
    `Neo4j inventory changed: before=${JSON.stringify(inventoryBefore)} after=${JSON.stringify(inventoryAfter)}`,
  )
  assert(blockedMutations.length === 0, `unexpected mutation attempted: ${JSON.stringify(blockedMutations)}`)
  assert(pageErrors.length === 0, `page errors: ${JSON.stringify(pageErrors)}`)
  assert(requestFailures.length === 0, `request failures: ${JSON.stringify(requestFailures)}`)
  const unexpectedHttpFailures = httpFailures.filter(item =>
    !expectedFailures.some(expected => expected.url === item.url && expected.status === item.status),
  )
  assert(unexpectedHttpFailures.length === 0, `unexpected HTTP 5xx: ${JSON.stringify(unexpectedHttpFailures)}`)
  const unexpectedConsoleErrors = consoleErrors.filter(message =>
    !message.includes('503')
    && !message.includes('Failed to load column references')
    && !message.includes('column_name=channel_cd')
    && !message.includes('injected column-reference checkpoint failure')
  )
  assert(unexpectedConsoleErrors.length === 0, `unexpected console errors: ${JSON.stringify(unexpectedConsoleErrors)}`)

  result = {
    status: 'passed',
    database: 'neo4j',
    inventoryBefore,
    inventoryAfter,
    schema: {
      tables: 22,
      ordersColumns: 12,
      relatedTables: 5,
      fkEdges: 5,
      tableReferences: { total: 18, reads: 9, writes: 9 },
      memberIdReferences: memberBody.framework_references.map(item => ({
        source: item.source_name,
        access: item.access_type,
        evidenceLine: item.evidence_line,
      })),
      channelCdReferences: 0,
      sourceEvidence: {
        file: 'review_point.c',
        symbol: 'check_purchased',
        line: 117,
      },
      dataQuery: {
        columns: dataQueryColumns,
      },
    },
    failureRecovery: {
      columnReference: expectedFailures,
      tableList: retryResponses,
    },
    safety: {
      blockedMutations,
      unexpectedHttpFailures,
      unexpectedConsoleErrors,
    },
    requests,
  }
} catch (error) {
  result = {
    status: 'failed',
    error: error instanceof Error ? error.stack : String(error),
    pageErrors,
    consoleErrors,
    requestFailures,
    httpFailures,
    blockedMutations,
  }
  await screenshot(page, 'FAILED-schema-checkpoint-1920x1080.png').catch(() => {})
  throw error
} finally {
  await writeFile(outputPath, JSON.stringify(result, null, 2), 'utf8')
  await context.close()
  await browser.close()
}

console.log(JSON.stringify(result, null, 2))
