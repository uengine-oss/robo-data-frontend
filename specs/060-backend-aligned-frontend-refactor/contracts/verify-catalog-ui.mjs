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

async function openFeature(page, title) {
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  const button = page.locator(`button[title="${title}"]`).first()
  await button.waitFor({ state: 'visible', timeout: 15_000 })
  await button.click()
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })

try {
  const schemaPage = await context.newPage()
  const schemaPageErrors = []
  schemaPage.on('pageerror', (error) => schemaPageErrors.push(error.message))

  const tableResponse = schemaPage.waitForResponse(
    (response) => /\/api\/gateway\/robo\/schema\/tables\?/.test(response.url()),
    { timeout: 30_000 },
  )
  await openFeature(schemaPage, '데이터 스키마')
  assert((await tableResponse).status() === 200, 'Catalog table list did not return 200')

  const search = schemaPage.getByPlaceholder('테이블 검색...')
  await search.waitFor()
  await search.fill('audit_log')
  const row = schemaPage.locator('.search-row').filter({ hasText: 'audit_log' }).first()
  await row.waitFor()

  const columnsResponse = schemaPage.waitForResponse(
    (response) => /\/schema\/tables\/audit_log\/columns\?/.test(response.url()),
    { timeout: 30_000 },
  )
  await row.dblclick()
  assert((await columnsResponse).status() === 200, 'Catalog audit_log columns did not return 200')
  await schemaPage.locator('.vue-flow__node[data-id="table-audit_log"]').waitFor()

  await schemaPage.screenshot({
    path: join(evidenceDir, 'catalog-schema-1920x1080.png'),
    fullPage: true,
  })
  assert(schemaPageErrors.length === 0, `Schema page errors: ${schemaPageErrors.join(' | ')}`)

  const lineagePage = await context.newPage()
  const lineagePageErrors = []
  lineagePage.on('pageerror', (error) => lineagePageErrors.push(error.message))
  const lineageResponse = lineagePage.waitForResponse(
    (response) => /\/api\/gateway\/robo\/lineage\/$/.test(response.url()),
    { timeout: 30_000 },
  )
  await openFeature(lineagePage, '데이터 리니지')
  assert((await lineageResponse).status() === 200, 'Catalog lineage did not return 200')
  await lineagePage.getByRole('heading', { name: /데이터 리니지/ }).waitFor()
  const etlCount = Number(await lineagePage.locator('.stat-card.etl .stat-value').innerText())
  assert(etlCount > 0, 'Catalog lineage ETL count is empty')
  await lineagePage.locator('.vue-flow__node').first().waitFor({ timeout: 30_000 })
  await lineagePage.screenshot({
    path: join(evidenceDir, 'catalog-lineage-1920x1080.png'),
    fullPage: true,
  })
  assert(lineagePageErrors.length === 0, `Lineage page errors: ${lineagePageErrors.join(' | ')}`)

  const failurePage = await context.newPage()
  await failurePage.route(/\/api\/gateway\/robo\/lineage\/$/, (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{"detail":"Catalog verification outage"}' }),
  )
  await failurePage.route(/\/api\/gateway\/olap\/api\/etl\/lineage\/overview$/, (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{"detail":"OLAP verification outage"}' }),
  )
  await openFeature(failurePage, '데이터 리니지')
  const errorMessage = failurePage.locator('.error-message')
  await errorMessage.waitFor()
  assert((await errorMessage.innerText()).includes('다시 시도'), 'Lineage retry action is missing')
  assert(
    !(await failurePage.getByRole('heading', { name: '데이터 리니지 없음' }).isVisible().catch(() => false)),
    'Total service failure is incorrectly shown as empty lineage data',
  )
  await failurePage.screenshot({
    path: join(evidenceDir, 'catalog-lineage-failure-1920x1080.png'),
    fullPage: true,
  })

  console.log(JSON.stringify({
    result: 'passed',
    viewport: '1920x1080',
    schemaTable: 'audit_log',
    lineageEtlCount: etlCount,
    verified: [
      'catalog table list and column detail',
      'schema canvas rendering',
      'catalog lineage graph rendering',
      'honest total lineage outage with retry',
    ],
  }, null, 2))
} finally {
  await context.close()
  await browser.close()
}
