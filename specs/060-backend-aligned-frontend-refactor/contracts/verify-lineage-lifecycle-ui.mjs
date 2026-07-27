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

async function openLineage(page) {
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  const button = page.locator('button[title="데이터 리니지"]').first()
  await button.waitFor({ state: 'visible', timeout: 15_000 })
  await button.click()
  await page.getByRole('heading', { name: '데이터 리니지' }).waitFor()
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
await context.addInitScript(() => {
  localStorage.setItem('robo-analyzer-api-key', 'lineage-contract-key')
  window.open = url => {
    window.__lineageOpenedUrl = String(url)
    return null
  }
})

try {
  const page = await context.newPage()
  const pageErrors = []
  const deployRequests = []
  page.on('pageerror', error => pageErrors.push(error.message))

  await page.route(/\/api\/gateway\/robo\/graph\/$/, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"nodes":[],"edges":[]}',
    }),
  )
  await page.route(/\/api\/gateway\/olap\/api\/etl\/lineage\/overview$/, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        source_tables: [{ id: 'source-sales', name: 'orders', columns: ['id'], schema: 'public' }],
        etl_processes: [{
          id: 'etl-sales',
          name: 'ETL_SALES',
          cube_name: 'SalesCube',
          operation: 'copy',
        }],
        target_tables: [{ id: 'target-sales', name: 'fact_sales', columns: ['id'], schema: 'dw' }],
        data_flows: [
          { from: 'source-sales', to: 'etl-sales', type: 'extract' },
          { from: 'etl-sales', to: 'target-sales', type: 'load' },
        ],
        summary: { total_sources: 1, total_etl_processes: 1, total_targets: 1, total_flows: 2 },
      }),
    }),
  )
  await page.route(/\/api\/gateway\/robo\/lineage\/$/, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        nodes: [{ id: 'catalog-etl', name: 'CATALOG_ONLY_ETL', type: 'ETL', properties: {} }],
        edges: [],
        stats: { sourceCount: 0, etlCount: 1, targetCount: 0, flowCount: 0 },
      }),
    }),
  )
  await page.route(/\/api\/gateway\/olap\/api\/airflow\/etl\/SalesCube\/deploy\?force=true$/, route => {
    deployRequests.push({
      url: route.request().url(),
      method: route.request().method(),
      headers: route.request().headers(),
    })
    const attempt = deployRequests.length
    if (attempt === 1) {
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"detail":"lineage DAG fixture outage"}',
      })
    }
    if (attempt === 2) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"success":false,"error":"lineage DAG backend rejected"}',
      })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        cube_name: 'SalesCube',
        dag_id: 'sales-lineage-dag',
        airflow_url: 'https://airflow.example.test/dags/sales-lineage-dag/grid',
      }),
    })
  })

  await openLineage(page)
  await page.locator('.lineage-node.etl', { hasText: 'ETL_SALES' }).click()
  const panel = page.locator('.detail-panel')
  await panel.waitFor({ state: 'visible' })
  const trigger = panel.getByRole('button', { name: 'DAG 재생성' })
  await trigger.click()

  let dialog = page.getByRole('alertdialog', { name: 'Airflow DAG 재생성' })
  await dialog.getByText('SalesCube').waitFor()
  await dialog.getByRole('button', { name: '취소' }).click()
  assert(deployRequests.length === 0, 'Lineage DAG cancel sent a mutation')
  assert(
    await trigger.evaluate(element => element === document.activeElement),
    'Lineage DAG cancel did not restore trigger focus',
  )

  await trigger.click()
  dialog = page.getByRole('alertdialog', { name: 'Airflow DAG 재생성' })
  await dialog.getByRole('button', { name: 'DAG 재생성' }).click()
  await dialog.getByRole('button', { name: '다시 시도' }).waitFor()
  assert(deployRequests.length === 1, 'Lineage DAG HTTP failure request count is incorrect')
  assert(
    (await dialog.innerText()).includes('lineage DAG fixture outage'),
    'Lineage DAG HTTP failure is not visible in the action dialog',
  )
  await page.screenshot({
    path: join(evidenceDir, 'lineage-dag-redeploy-error-390x844.png'),
    fullPage: true,
  })

  await dialog.getByRole('button', { name: '다시 시도' }).click()
  await dialog.getByRole('button', { name: '다시 시도' }).waitFor()
  assert(deployRequests.length === 2, 'Lineage DAG success:false request count is incorrect')
  assert(
    (await dialog.innerText()).includes('lineage DAG backend rejected'),
    'Lineage DAG success:false was announced as success',
  )

  await dialog.getByRole('button', { name: '다시 시도' }).click()
  await dialog.waitFor({ state: 'detached' })
  assert(deployRequests.length === 3, 'Lineage DAG exact retry did not keep the same target request')
  assert(
    deployRequests.every(request =>
      request.method === 'POST'
      && request.url.endsWith('/api/gateway/olap/api/airflow/etl/SalesCube/deploy?force=true')
      && request.headers['x-llm-api-key'] === 'lineage-contract-key',
    ),
    'Lineage DAG retry changed method, target, force flag, or runtime headers',
  )

  const success = panel.locator('.dag-result.success')
  await success.filter({ hasText: 'sales-lineage-dag' }).waitFor()
  const airflowButton = panel.getByRole('button', { name: 'Airflow UI' })
  assert(!(await airflowButton.isDisabled()), 'Backend Airflow URL did not enable the Airflow action')
  await airflowButton.click()
  assert(
    await page.evaluate(() => window.__lineageOpenedUrl)
      === 'https://airflow.example.test/dags/sales-lineage-dag/grid',
    'Lineage Airflow action did not use the backend-provided URL',
  )

  const panelBox = await panel.boundingBox()
  assert(panelBox, 'Lineage detail panel geometry is unavailable')
  assert(
    panelBox.x >= 0
      && panelBox.y >= 0
      && panelBox.x + panelBox.width <= 390
      && panelBox.y + panelBox.height <= 844,
    `Lineage detail panel escapes mobile viewport: ${JSON.stringify(panelBox)}`,
  )
  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }))
  assert(overflow.document <= 0 && overflow.body <= 0, `Lineage page overflows: ${JSON.stringify(overflow)}`)
  const headerGeometry = await page.evaluate(() => {
    const title = document.querySelector('.lineage-header .title')?.getBoundingClientRect()
    const search = document.querySelector('.lineage-header .search-box')?.getBoundingClientRect()
    const actions = [...document.querySelectorAll('.lineage-header .action-btn')]
      .map(element => element.getBoundingClientRect())
    return {
      title: title && { x: title.x, y: title.y, width: title.width, height: title.height },
      search: search && { x: search.x, y: search.y, width: search.width, height: search.height },
      actions: actions.map(box => ({ x: box.x, y: box.y, width: box.width, height: box.height })),
    }
  })
  for (const [name, box, minimumHeight] of [
    ['title', headerGeometry.title, 20],
    ['search', headerGeometry.search, 32],
    ...headerGeometry.actions.map((box, index) => [`action-${index}`, box, 32]),
  ]) {
    assert(
      box && box.x >= 0 && box.x + box.width <= 390 && box.height >= minimumHeight,
      `Lineage mobile header ${name} is clipped: ${JSON.stringify(box)}`,
    )
  }
  assert(pageErrors.length === 0, `Lineage page errors: ${pageErrors.join(' | ')}`)

  await page.screenshot({
    path: join(evidenceDir, 'lineage-dag-redeploy-success-390x844.png'),
    fullPage: true,
  })

  await panel.getByRole('button', { name: '상세 패널 닫기' }).click()
  await page.locator('.lineage-node.etl', { hasText: 'CATALOG_ONLY_ETL' }).click()
  const unavailableTrigger = page.locator('.detail-panel').getByRole('button', { name: 'DAG 재생성' })
  assert(await unavailableTrigger.isDisabled(), 'Lineage node without cube_name still allows an inferred DAG target')
  assert(
    (await unavailableTrigger.getAttribute('title'))?.includes('cube_name'),
    'Missing cube_name reason is not exposed on the disabled DAG action',
  )
  assert(deployRequests.length === 3, 'Missing cube_name node sent an inferred DAG request')

  console.log(JSON.stringify({
    result: 'passed',
    viewport: '390x844',
    deployRequests: deployRequests.length,
    verified: [
      'ETL node detail selection',
      'DAG cancel with zero mutation and focus return',
      'HTTP 503 and success:false stay in the same dialog',
      'exact same cube/force/header retry',
      'success commits DAG id and backend Airflow URL',
      'missing cube_name remains disabled without node-name inference',
      'mobile detail/dialog geometry and document overflow',
    ],
  }, null, 2))
} finally {
  await context.close()
  await browser.close()
}
