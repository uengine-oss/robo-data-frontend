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

async function openOlap(page) {
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  const button = page.locator('button[title="OLAP 분석"]').first()
  await button.waitFor({ state: 'visible', timeout: 15_000 })
  await button.click()
}

async function openLineage(page) {
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  const button = page.locator('button[title="데이터 리니지"]').first()
  await button.waitFor({ state: 'visible', timeout: 15_000 })
  await button.click()
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
await context.addInitScript(() => localStorage.setItem('robo-analyzer-api-key', 'olap-contract-key'))

try {
  const actualPage = await context.newPage()
  const pageErrors = []
  const olapRequestHeaders = []
  actualPage.on('pageerror', error => pageErrors.push(error.message))
  actualPage.on('request', request => {
    if (request.url().includes('/api/gateway/olap/')) olapRequestHeaders.push(request.headers())
  })
  const cubesResponse = actualPage.waitForResponse(
    response => /\/api\/gateway\/olap\/api\/cubes$/.test(response.url()),
    { timeout: 30_000 },
  )
  await openOlap(actualPage)
  const actualStatus = (await cubesResponse).status()
  await actualPage.getByRole('heading', { name: 'OLAP 분석' }).waitFor()

  if (actualStatus >= 400) {
    const error = actualPage.locator('.olap-load-error').first()
    await error.waitFor({ state: 'visible', timeout: 15_000 })
    const errorText = await error.innerText()
    assert(errorText.includes('OLAP 큐브 목록을 불러오지 못했습니다.'), 'OLAP failure context is missing')
    assert(errorText.includes('다시 시도'), 'OLAP retry action is missing')
  }

  await actualPage.screenshot({
    path: join(evidenceDir, 'olap-actual-1920x1080.png'),
    fullPage: true,
  })
  assert(pageErrors.length === 0, `OLAP page errors: ${pageErrors.join(' | ')}`)
  assert(olapRequestHeaders.length > 0, 'OLAP API request was not observed')
  assert(
    olapRequestHeaders.every(headers => headers['accept-language'] === 'ko'
      && headers['x-llm-api-key'] === 'olap-contract-key'),
    'OLAP API request is missing current session headers',
  )

  const emptyPage = await context.newPage()
  await emptyPage.route(/\/api\/gateway\/olap\/api\/cubes$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"cubes":[]}' }),
  )
  await openOlap(emptyPage)
  await emptyPage.getByRole('heading', { name: 'OLAP 분석' }).waitFor()
  assert(
    !(await emptyPage.locator('.olap-load-error').first().isVisible().catch(() => false)),
    'Successful empty OLAP response is shown as an error',
  )
  await emptyPage.screenshot({
    path: join(evidenceDir, 'olap-empty-1920x1080.png'),
    fullPage: true,
  })

  const partialLineagePage = await context.newPage()
  let catalogLineageRequests = 0
  await partialLineagePage.route(/\/api\/gateway\/olap\/api\/etl\/lineage\/overview$/, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        source_tables: [{ id: 'source-orders', name: 'orders', columns: ['id'], schema: 'public' }],
        etl_processes: [{ id: 'etl-orders', name: 'ETL Orders', operation: 'copy' }],
        target_tables: [{ id: 'target-orders', name: 'fact_orders', columns: ['id'], schema: 'dw', type: 'table' }],
        data_flows: [
          { from: 'source-orders', to: 'etl-orders', type: 'extract' },
          { from: 'etl-orders', to: 'target-orders', type: 'load' },
        ],
        summary: { total_sources: 1, total_etl_processes: 1, total_targets: 1, total_flows: 2 },
      }),
    }),
  )
  await partialLineagePage.route(/\/api\/gateway\/robo\/lineage\/$/, route => {
    catalogLineageRequests += 1
    return route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"detail":"Catalog lineage fixture outage"}',
    })
  })
  await openLineage(partialLineagePage)
  const lineageWarning = partialLineagePage.locator('.warning-message')
  await lineageWarning.waitFor({ state: 'visible', timeout: 15_000 })
  assert(
    (await lineageWarning.innerText()).includes('일부 리니지 소스를 불러오지 못했습니다.'),
    'Partial lineage failure is hidden',
  )
  assert(
    (await partialLineagePage.locator('.stat-card .stat-value').allTextContents()).join('|') === '1|1|1|2',
    'Successful OLAP lineage data was discarded after Catalog failure',
  )
  await lineageWarning.getByRole('button', { name: '다시 시도' }).click()
  for (let attempt = 0; attempt < 100 && catalogLineageRequests < 2; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  assert(catalogLineageRequests === 2, 'Partial lineage retry did not perform exactly one new Catalog request')
  await lineageWarning.waitFor({ state: 'visible' })
  await partialLineagePage.screenshot({
    path: join(evidenceDir, 'lineage-partial-failure-1920x1080.png'),
    fullPage: true,
  })

  console.log(JSON.stringify({
    result: 'passed',
    viewport: '1920x1080',
    actualCubesStatus: actualStatus,
    verified: [
      'OLAP domain lazy loading',
      'actual service response is represented honestly',
      'OLAP requests carry current session headers',
      'successful empty cube response is not an error',
      'partial lineage failure stays visible while successful source data remains usable',
      'partial lineage retry action',
    ],
  }, null, 2))
} finally {
  await context.close()
  await browser.close()
}
