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
const listEndpoint = /\/api\/gateway\/data-fabric\/api\/datasources$/
const healthEndpoint = /\/api\/gateway\/data-fabric\/api\/datasources\/shopmall\/health$/
const tablesEndpoint = /\/api\/gateway\/data-fabric\/api\/datasources\/shopmall\/tables$/

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function openDataSources(page) {
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  const navigation = page.locator('button.nav-child[title="데이터 소스"]').first()
  await navigation.waitFor({ state: 'visible', timeout: 15_000 })
  await navigation.click()
}

async function graphCounts(request) {
  const response = await request.get(`${gatewayUrl}/api/gateway/robo/graph/`, {
    headers: { 'X-Neo4j-Database': 'neo4j' },
    timeout: 120_000,
  })
  assert(response.ok(), `graph inventory HTTP ${response.status()}`)
  const body = await response.json()
  return {
    nodes: Array.isArray(body.Nodes) ? body.Nodes.length : 0,
    relationships: Array.isArray(body.Relationships) ? body.Relationships.length : 0,
  }
}

function observe(page) {
  const state = {
    pageErrors: [],
    consoleErrors: [],
    requestFailures: [],
    responses: [],
  }
  page.on('pageerror', error => state.pageErrors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error') state.consoleErrors.push(message.text())
  })
  page.on('requestfailed', request => {
    state.requestFailures.push({ url: request.url(), error: request.failure()?.errorText })
  })
  page.on('response', response => {
    if (response.url().includes('/api/gateway/data-fabric/')) {
      state.responses.push({
        method: response.request().method(),
        status: response.status(),
        url: response.url(),
      })
    }
  })
  return state
}

await mkdir(screenshotDir, { recursive: true })
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'ko-KR' })
let result

try {
  const normalPage = await context.newPage()
  const normal = observe(normalPage)
  const attemptedMutations = []
  await normalPage.route('**/api/gateway/data-fabric/**', route => {
    const method = route.request().method()
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return route.continue()
    attemptedMutations.push({ method, url: route.request().url() })
    return route.abort('blockedbyclient')
  })

  const inventoryBefore = await graphCounts(normalPage.request)
  const listResponse = normalPage.waitForResponse(response => listEndpoint.test(response.url()))
  const healthResponse = normalPage.waitForResponse(response => healthEndpoint.test(response.url()))
  await openDataSources(normalPage)
  assert((await listResponse).status() === 200, 'live datasource list did not return 200')
  assert((await healthResponse).status() === 200, 'live shopmall health did not return 200')
  await normalPage.getByRole('heading', { name: 'shopmall', exact: true }).waitFor()
  await normalPage.locator('[aria-label="연결 정상"]').waitFor({ state: 'visible', timeout: 30_000 })

  const tableResponse = normalPage.waitForResponse(response => tablesEndpoint.test(response.url()))
  await normalPage.getByRole('button', { name: 'shopmall 데이터 소스 선택' }).click()
  assert((await tableResponse).status() === 200, 'live shopmall tables did not return 200')
  const detail = normalPage.locator('.detail-panel')
  await detail.getByRole('heading', { name: /실제 DB 테이블/ }).waitFor()
  await detail.getByText('orders', { exact: true }).waitFor()
  const liveTableCount = await detail.locator('.table-item').count()
  assert(liveTableCount === 22, `shopmall table count was ${liveTableCount}, expected 22`)

  await normalPage.getByRole('button', { name: '새 연결 추가' }).click()
  const addDialog = normalPage.getByRole('dialog')
  await addDialog.getByRole('heading', { name: '새 데이터 소스', exact: true }).waitFor()
  assert(
    /\d+개의 데이터 소스 유형 사용 가능/.test(await addDialog.locator('.type-count').innerText()),
    'connector catalog count is missing',
  )
  await normalPage.keyboard.press('Escape')
  await addDialog.waitFor({ state: 'hidden' })
  assert(
    await normalPage.getByRole('button', { name: '새 연결 추가' }).evaluate(
      element => element === document.activeElement,
    ),
    'add dialog did not return focus to its trigger',
  )

  const shopmallCard = normalPage.getByRole('article').filter({ hasText: 'shopmall' })
  await shopmallCard.hover()
  const deleteButton = shopmallCard.getByRole('button', { name: 'shopmall 데이터 소스 삭제' })
  await deleteButton.click()
  const deleteDialog = normalPage.getByRole('alertdialog', { name: '데이터 소스 삭제' })
  await deleteDialog.waitFor({ state: 'visible' })
  await normalPage.keyboard.press('Escape')
  await deleteDialog.waitFor({ state: 'hidden' })
  assert(
    await deleteButton.evaluate(element => element === document.activeElement),
    'delete cancellation did not return focus to its trigger',
  )
  assert(attemptedMutations.length === 0, `normal UI attempted mutation: ${JSON.stringify(attemptedMutations)}`)
  await normalPage.screenshot({
    path: join(screenshotDir, '16-data-fabric-live-1920x1080.png'),
    fullPage: true,
  })
  assert(normal.pageErrors.length === 0, `normal page errors: ${normal.pageErrors.join(' | ')}`)
  assert(normal.consoleErrors.length === 0, `normal console errors: ${normal.consoleErrors.join(' | ')}`)
  assert(normal.requestFailures.length === 0, `normal request failures: ${JSON.stringify(normal.requestFailures)}`)

  const listFailurePage = await context.newPage()
  const listFailure = observe(listFailurePage)
  let failListOnce = true
  await listFailurePage.route(listEndpoint, route => {
    if (failListOnce) {
      failListOnce = false
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"detail":"Data Fabric checkpoint outage"}',
      })
    }
    return route.continue()
  })
  await openDataSources(listFailurePage)
  const listAlert = listFailurePage.getByRole('alert')
  await listAlert.getByRole('heading', { name: '데이터 소스를 불러오지 못했습니다' }).waitFor()
  assert(
    !(await listFailurePage.getByText('등록된 데이터 소스가 없습니다', { exact: true }).isVisible().catch(() => false)),
    'list failure was shown as a successful empty state',
  )
  const retryListResponse = listFailurePage.waitForResponse(response =>
    listEndpoint.test(response.url()) && response.status() === 200,
  )
  await listAlert.getByRole('button', { name: '다시 시도' }).click()
  await retryListResponse
  await listFailurePage.getByRole('heading', { name: 'shopmall', exact: true }).waitFor()

  const tableFailurePage = await context.newPage()
  const tableFailure = observe(tableFailurePage)
  let failTablesOnce = true
  await tableFailurePage.route(tablesEndpoint, route => {
    if (failTablesOnce) {
      failTablesOnce = false
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"detail":"Table checkpoint outage"}',
      })
    }
    return route.continue()
  })
  await openDataSources(tableFailurePage)
  await tableFailurePage.getByRole('button', { name: 'shopmall 데이터 소스 선택' }).click()
  const failureDetail = tableFailurePage.locator('.detail-panel')
  const tableAlert = failureDetail.getByRole('alert')
  await tableAlert.waitFor()
  assert((await tableAlert.innerText()).includes('Table checkpoint outage'), 'table failure detail was hidden')
  assert(
    !(await failureDetail.getByText('테이블이 없습니다', { exact: true }).isVisible().catch(() => false)),
    'table failure was shown as a successful empty state',
  )
  const retryTableResponse = tableFailurePage.waitForResponse(response =>
    tablesEndpoint.test(response.url()) && response.status() === 200,
  )
  await tableAlert.getByRole('button', { name: '다시 시도' }).click()
  await retryTableResponse
  await failureDetail.getByText('orders', { exact: true }).waitFor()
  await tableFailurePage.screenshot({
    path: join(screenshotDir, '17-data-fabric-table-recovered-1920x1080.png'),
    fullPage: true,
  })

  const emptyListPage = await context.newPage()
  await emptyListPage.route(listEndpoint, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '{"datasources":[]}',
  }))
  await openDataSources(emptyListPage)
  await emptyListPage.getByText('등록된 데이터 소스가 없습니다', { exact: true }).waitFor()

  const emptyTablesPage = await context.newPage()
  await emptyTablesPage.route(listEndpoint, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '{"datasources":[{"name":"shopmall","engine":"postgres"}]}',
  }))
  await emptyTablesPage.route(healthEndpoint, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '{"name":"shopmall","status":"healthy","message":"empty boundary","db_connected":true,"mindsdb_connected":true}',
  }))
  await emptyTablesPage.route(tablesEndpoint, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '{"tables":[]}',
  }))
  await openDataSources(emptyTablesPage)
  await emptyTablesPage.getByRole('button', { name: 'shopmall 데이터 소스 선택' }).click()
  await emptyTablesPage.locator('.detail-panel').getByText('테이블이 없습니다', { exact: true }).waitFor()

  const inventoryAfter = await graphCounts(normalPage.request)
  assert(
    inventoryAfter.nodes === inventoryBefore.nodes
      && inventoryAfter.relationships === inventoryBefore.relationships,
    `Neo4j checkpoint changed: ${JSON.stringify({ inventoryBefore, inventoryAfter })}`,
  )
  for (const [name, state] of [['list failure', listFailure], ['table failure', tableFailure]]) {
    assert(state.pageErrors.length === 0, `${name} page errors: ${state.pageErrors.join(' | ')}`)
    assert(state.requestFailures.length === 0, `${name} request failures: ${JSON.stringify(state.requestFailures)}`)
  }

  result = {
    status: 'passed',
    database: 'neo4j',
    inventoryBefore,
    inventoryAfter,
    live: {
      datasource: 'shopmall',
      health: 'healthy',
      tables: liveTableCount,
      responses: normal.responses,
    },
    safety: {
      attemptedMutations,
      createRequests: normal.responses.filter(item => item.method === 'POST').length,
      deleteRequests: normal.responses.filter(item => item.method === 'DELETE').length,
    },
    failureRecovery: {
      listResponses: listFailure.responses,
      tableResponses: tableFailure.responses,
      expectedConsoleErrors: [
        ...listFailure.consoleErrors,
        ...tableFailure.consoleErrors,
      ],
    },
    emptyStates: ['datasource list', 'selected datasource tables'],
  }
} catch (error) {
  result = {
    status: 'failed',
    error: error instanceof Error ? error.stack ?? error.message : String(error),
  }
  process.exitCode = 1
} finally {
  await writeFile(
    join(evidenceDir, 'data-fabric-checkpoint-interactions.json'),
    `${JSON.stringify(result, null, 2)}\n`,
    'utf8',
  )
  console.log(JSON.stringify(result, null, 2))
  await context.close()
  await browser.close()
}
