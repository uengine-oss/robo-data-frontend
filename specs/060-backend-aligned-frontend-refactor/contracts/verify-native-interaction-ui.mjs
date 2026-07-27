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

async function activateFeature(page, featureId) {
  await page.evaluate(id => {
    const button = document.querySelector(`[data-feature-id="${id}"]`)
    if (!(button instanceof HTMLButtonElement)) throw new Error(`Feature ${id} is missing`)
    button.click()
  }, featureId)
}

const browser = await chromium.launch({ headless: true })

try {
  const textPage = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  const textErrors = []
  textPage.on('pageerror', error => textErrors.push(error.message))
  await textPage.route(/\/api\/gateway\/text2sql\/history\?/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '{"items":[],"total":0,"page":1,"page_size":20}',
  }))
  await textPage.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  await activateFeature(textPage, 'domain-text2sql')
  const settingsToggle = textPage.locator('.settings-toggle')
  await settingsToggle.waitFor({ timeout: 15_000 })
  await settingsToggle.focus()
  await textPage.keyboard.press('Enter')
  const settingsPanel = textPage.locator('#text2sql-advanced-settings')
  await settingsPanel.waitFor()
  assert(
    await settingsToggle.getAttribute('aria-expanded') === 'true'
      && await settingsToggle.getAttribute('aria-controls') === 'text2sql-advanced-settings',
    'Text2SQL settings disclosure did not expose its expanded controlled panel',
  )
  await textPage.screenshot({
    path: join(evidenceDir, 'native-text2sql-settings-1280x720.png'),
    fullPage: true,
  })
  await textPage.keyboard.press('Space')
  await settingsPanel.waitFor({ state: 'detached' })
  assert(
    await settingsToggle.getAttribute('aria-expanded') === 'false'
      && await settingsToggle.evaluate(element => element === document.activeElement),
    'Text2SQL settings disclosure did not close from Space with focus preserved',
  )
  assert(textErrors.length === 0, `Text2SQL native interaction page errors: ${textErrors.join(' | ')}`)
  await textPage.close()

  const whatIfPage = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  const whatIfErrors = []
  const uploadBodies = []
  let uploadRequests = 0
  whatIfPage.on('pageerror', error => whatIfErrors.push(error.message))
  await whatIfPage.route(/\/api\/gateway\/robo\/graph\/?$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '{"nodes":[],"relationships":[]}',
  }))
  await whatIfPage.route(/\/api\/gateway\/whatif\/agent\/analyze$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      session_id: 'interaction-session',
      scenario: '주문이 매출에 미치는 영향',
      variables: [{
        name: 'orders',
        description: '주문 수',
        variable_type: 'driver',
        data_type: 'numeric',
      }],
      relationships: [],
      data_sources: [{
        table_name: 'orders',
        columns: ['ordered_at', 'order_count', 'revenue'],
        row_count: 24,
        has_time_column: true,
        time_column: 'ordered_at',
        numeric_columns: ['order_count', 'revenue'],
        relevance_score: 0.97,
        sample_data: [{ order_count: 10, revenue: 100 }],
        validation_notes: ['월별 주문 집계'],
      }],
      validation_summary: {
        total_variables: 1,
        total_data_sources: 1,
        timeseries_ready: 1,
        sufficient_data: 1,
        total_numeric_columns: 2,
      },
      is_ready_for_causal: true,
      recommendations: [],
    }),
  }))
  await whatIfPage.route(/\/api\/gateway\/whatif\/data\/upload$/, async route => {
    uploadRequests += 1
    uploadBodies.push(route.request().postDataBuffer()?.toString('utf8') ?? '')
    if (uploadRequests === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'upload verification outage' }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        session_id: 'uploaded-interaction-session',
        filename: 'scenario.csv',
        rows: 2,
        columns: ['order_count', 'revenue'],
        sample_data: [{ order_count: 10, revenue: 100 }],
      }),
    })
  })
  await whatIfPage.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  await activateFeature(whatIfPage, 'whatif')
  await whatIfPage.locator('.scenario-textarea').fill('주문이 매출에 미치는 영향')
  await whatIfPage.getByRole('button', { name: '데이터 발견 시작' }).click()
  const tableCheckbox = whatIfPage.getByRole('checkbox', { name: 'orders 테이블 선택' })
  await tableCheckbox.waitFor({ timeout: 15_000 })
  await tableCheckbox.focus()
  await whatIfPage.keyboard.press('Space')
  assert(await tableCheckbox.isChecked(), 'What-If table checkbox did not select from Space')
  assert(
    await whatIfPage.locator('.sql-textarea').inputValue() === 'SELECT * FROM orders LIMIT 1000',
    'What-If table selection lost its existing SQL projection',
  )
  await whatIfPage.keyboard.press('Space')
  assert(!(await tableCheckbox.isChecked()), 'What-If table checkbox toggled more than once per Space activation')

  const dropzone = whatIfPage.getByRole('button', { name: /CSV 또는 Excel 파일/ })
  await dropzone.evaluate(element => {
    const transfer = new DataTransfer()
    transfer.items.add(new File(['invalid'], 'scenario.txt', { type: 'text/plain' }))
    element.dispatchEvent(new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      dataTransfer: transfer,
    }))
  })
  await whatIfPage.getByRole('alert').filter({ hasText: 'CSV 또는 Excel' }).waitFor()
  assert(uploadRequests === 0, 'Invalid What-If file drop issued an upload request')

  await whatIfPage.locator('.file-input').setInputFiles({
    name: 'scenario.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('order_count,revenue\n10,100\n12,120'),
  })
  const uploadFailure = whatIfPage.locator('.message-stack .error-message')
  await uploadFailure.waitFor({ state: 'visible' })
  assert(uploadRequests === 1, 'What-If file selection did not issue exactly one upload request')
  assert(
    await whatIfPage.getByText('선택된 파일: scenario.csv', { exact: true }).isVisible(),
    'A failed What-If upload did not preserve the selected file without claiming success',
  )
  await whatIfPage.getByText('선택된 파일: scenario.csv', { exact: true }).scrollIntoViewIfNeeded()
  await whatIfPage.screenshot({
    path: join(evidenceDir, 'native-whatif-file-retry-1280x720.png'),
    fullPage: true,
  })
  await whatIfPage.getByRole('button', { name: '다시 업로드' }).press('Enter')
  await whatIfPage.getByRole('heading', { name: '온톨로지 발견' }).waitFor()
  assert(uploadRequests === 2, 'What-If exact-file retry did not issue one additional request')
  assert(
    uploadBodies.every(body => body.includes('scenario.csv') && body.includes('order_count,revenue')),
    'What-If retry did not preserve the same file name and contents',
  )
  assert(whatIfErrors.length === 0, `What-If native interaction page errors: ${whatIfErrors.join(' | ')}`)
  await whatIfPage.close()

  const olapPage = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  const olapErrors = []
  olapPage.on('pageerror', error => olapErrors.push(error.message))
  await olapPage.route(/\/api\/gateway\/robo\/graph\/?$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '{"nodes":[],"relationships":[]}',
  }))
  await olapPage.route(/\/api\/gateway\/olap\/api\/cubes$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '{"cubes":["SalesCube"]}',
  }))
  await olapPage.route(/\/api\/gateway\/olap\/api\/cube\/SalesCube\/metadata$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      name: 'SalesCube',
      fact_table: 'dw.fact_sales',
      dimensions: [{
        name: 'Time',
        table: 'dw.dim_time',
        foreign_key: 'time_id',
        levels: [{ name: 'Month', column: 'month' }],
      }],
      measures: [{ name: 'Revenue', column: 'revenue', agg: 'SUM' }],
      joins: [],
    }),
  }))
  await olapPage.route(/\/api\/gateway\/olap\/api\/pivot\/preview-sql$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ sql: 'SELECT month, SUM(revenue) FROM fact_sales GROUP BY month' }),
  }))
  await olapPage.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  await activateFeature(olapPage, 'olap')
  const dimensionField = olapPage.locator('.field-list .tag.dimension')
  await dimensionField.waitFor({ timeout: 15_000 })
  const dimensionPayload = await dimensionField.evaluate(element => {
    const transfer = new DataTransfer()
    element.dispatchEvent(new DragEvent('dragstart', {
      bubbles: true,
      cancelable: true,
      dataTransfer: transfer,
    }))
    return transfer.getData('application/json')
  })
  assert(
    dimensionPayload === '{"type":"dimension","dimension":"Time","level":"Month"}',
    `OLAP dimension drag payload changed: ${dimensionPayload}`,
  )
  const dimensionAdd = olapPage.getByRole('button', { name: 'Time Month 행에 추가' })
  await dimensionAdd.press('Enter')
  await dimensionAdd.press('Enter')
  const removeRow = olapPage.locator('.drop-zones .tag.dimension .remove')
  await removeRow.waitFor()
  assert(
    await olapPage.locator('.drop-zones .tag.dimension').count() === 1,
    'OLAP keyboard add bypassed the existing dimension de-duplication',
  )
  assert(
    await removeRow.getAttribute('aria-label') === 'Time Month 행 제거',
    'OLAP pivot remove button lost its dimension and target name',
  )
  await removeRow.focus()
  await olapPage.screenshot({
    path: join(evidenceDir, 'native-olap-pivot-remove-1280x720.png'),
    fullPage: true,
  })
  await olapPage.keyboard.press('Space')
  await olapPage.waitForFunction(
    () => document.querySelectorAll('.drop-zones .tag.dimension').length === 0,
  )
  const measureField = olapPage.locator('.field-list .tag.measure')
  const measurePayload = await measureField.evaluate(element => {
    const transfer = new DataTransfer()
    element.dispatchEvent(new DragEvent('dragstart', {
      bubbles: true,
      cancelable: true,
      dataTransfer: transfer,
    }))
    return transfer.getData('application/json')
  })
  assert(
    measurePayload === '{"type":"measure","name":"Revenue"}',
    `OLAP measure drag payload changed: ${measurePayload}`,
  )
  const measureAdd = olapPage.getByRole('button', { name: 'Revenue 측정값에 추가' })
  await measureAdd.press('Space')
  assert(
    await olapPage.locator('.drop-zones .tag.measure').count() === 1,
    'OLAP measure was not added from Space',
  )
  assert(olapErrors.length === 0, `OLAP native interaction page errors: ${olapErrors.join(' | ')}`)
  await olapPage.close()

  const securityPage = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const securityErrors = []
  let securityRequests = 0
  securityPage.on('pageerror', error => securityErrors.push(error.message))
  securityPage.on('request', request => {
    if (request.url().includes('/api/gateway/security/')) securityRequests += 1
  })
  await securityPage.route(/\/api\/gateway\/robo\/graph\/?$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '{"nodes":[],"relationships":[]}',
  }))
  await securityPage.route(/\/api\/gateway\/security\/users$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '[]',
  }))
  await securityPage.route(/\/api\/gateway\/security\/roles$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([{
      name: 'analyst',
      description: '분석가',
      priority: 50,
      is_system: false,
      permissions: ['read:table'],
    }]),
  }))
  await securityPage.route(/\/api\/gateway\/security\/permissions$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '[]',
  }))
  await securityPage.route(/\/api\/gateway\/security\/tables$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([
      { name: 'orders', schema: 'sales', db: 'warehouse', column_count: 3 },
      { name: 'employees', schema: 'hr', db: 'warehouse', column_count: 4 },
    ]),
  }))
  await securityPage.route(/\/api\/gateway\/security\/access-rules$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([
      { path: 'warehouse', target_type: 'role', target_name: 'analyst', level: 'read' },
      { path: 'warehouse/sales', target_type: 'role', target_name: 'analyst', level: 'none' },
    ]),
  }))
  await securityPage.route(/\/api\/gateway\/security\/audit-logs\?limit=200$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([{
      log_id: 'audit-1',
      user_email: 'auditor@example.com',
      session_id: 'security-session',
      original_sql: "SELECT * FROM warehouse.sales.orders WHERE status = 'PAID'",
      rewritten_sql: "SELECT id, status FROM warehouse.sales.orders WHERE status = 'PAID'",
      status: 'rewritten',
      timestamp: '2026-07-24T10:30:00Z',
      execution_time_ms: 42,
      details: '민감 컬럼 projection이 제거되었습니다.',
    }]),
  }))
  await securityPage.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  await activateFeature(securityPage, 'security-guard')
  await securityPage.getByRole('button', { name: /테이블 권한/ }).click()
  const datasourceDisclosure = securityPage.locator(
    'button.toggle-btn[aria-controls="security-datasource-warehouse-schemas"]',
  )
  await datasourceDisclosure.waitFor({ timeout: 15_000 })
  assert(
    await datasourceDisclosure.getAttribute('aria-label') === 'warehouse 데이터소스 접기',
    'Security datasource disclosure lost its stateful accessible name',
  )
  const requestsAfterLoad = securityRequests
  await datasourceDisclosure.press('Enter')
  assert(
    await datasourceDisclosure.getAttribute('aria-expanded') === 'false',
    'Security datasource did not collapse from Enter',
  )
  assert(
    await securityPage.getByRole('button', { name: 'warehouse 데이터소스 권한 선택' }).getAttribute('aria-pressed') === 'false',
    'Security datasource disclosure also selected the node',
  )
  await datasourceDisclosure.press('Space')
  const schemaDisclosure = securityPage.locator(
    'button.toggle-btn[aria-controls="security-schema-warehouse-sales-tables"]',
  )
  assert(
    await schemaDisclosure.getAttribute('aria-label') === 'sales 스키마 펼치기',
    'Security schema disclosure lost its stateful accessible name',
  )
  await schemaDisclosure.press('Enter')
  const schemaSelect = securityPage.getByRole('button', { name: 'sales 스키마 권한 선택' })
  assert(
    await schemaSelect.getAttribute('aria-pressed') === 'false',
    'Security schema disclosure also selected the node',
  )
  await schemaSelect.press('Space')
  assert(
    await schemaDisclosure.getAttribute('aria-expanded') === 'true',
    'Security schema selection changed disclosure state',
  )
  const tableSelect = securityPage.getByRole('button', { name: 'orders 테이블 권한 선택' })
  await tableSelect.press('Enter')
  await securityPage.getByText('접근 불가 · 상속됨', { exact: true }).waitFor()
  assert(
    await securityPage.getByText('← warehouse/sales', { exact: true }).isVisible(),
    'Security table did not retain the most-specific schema inheritance source',
  )
  await securityPage.getByText('접근 불가 · 상속됨', { exact: true }).scrollIntoViewIfNeeded()
  assert(
    securityRequests === requestsAfterLoad,
    'Security tree disclosure or selection unexpectedly issued an API request',
  )
  const securityOverflow = await securityPage.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  assert(securityOverflow <= 1, `Security permission tree overflowed mobile viewport by ${securityOverflow}px`)
  await securityPage.screenshot({
    path: join(evidenceDir, 'native-security-permission-tree-390x844.png'),
    fullPage: true,
  })
  await securityPage.getByRole('button', { name: /감사 로그/ }).click()
  const auditDetailTrigger = securityPage.getByRole('button', {
    name: 'auditor@example.com 감사 로그 상세',
  })
  await auditDetailTrigger.waitFor()
  await auditDetailTrigger.click()
  const auditDialog = securityPage.getByRole('dialog', { name: '감사 로그 상세' })
  const auditClose = auditDialog.getByRole('button', { name: '감사 로그 상세 닫기' })
  assert(
    await auditClose.evaluate(element => element === document.activeElement),
    'Security audit detail did not own initial focus',
  )
  await securityPage.keyboard.press('Shift+Tab')
  assert(
    await auditDialog.evaluate(element => element.contains(document.activeElement)),
    'Security audit detail backward Tab escaped the dialog',
  )
  const auditGeometry = await auditDialog.boundingBox()
  assert(
    auditGeometry
      && auditGeometry.x >= 0
      && auditGeometry.y >= 0
      && auditGeometry.x + auditGeometry.width <= 391
      && auditGeometry.y + auditGeometry.height <= 845,
    `Security audit detail escaped the mobile viewport: ${JSON.stringify(auditGeometry)}`,
  )
  await securityPage.screenshot({
    path: join(evidenceDir, 'native-security-audit-detail-390x844.png'),
    fullPage: true,
  })
  await securityPage.keyboard.press('Escape')
  await auditDialog.waitFor({ state: 'hidden' })
  assert(
    await auditDetailTrigger.evaluate(element => element === document.activeElement),
    'Security audit detail Escape did not restore its row trigger',
  )
  assert(securityErrors.length === 0, `Security permission page errors: ${securityErrors.join(' | ')}`)
  await securityPage.close()

  console.log(JSON.stringify({
    result: 'passed',
    viewports: ['1280x720', '390x844'],
    verified: [
      'Text2SQL settings Enter/Space disclosure and focus preservation',
      'Text2SQL expanded and controls ARIA state',
      'What-If checkbox single activation and SQL projection',
      'What-If invalid file rejection and exact-file upload retry',
      'OLAP dimension and measure drag payload preservation',
      'OLAP labelled keyboard field add with store de-duplication',
      'OLAP labelled native pivot removal and Space mutation',
      'Security disclosure and selection keyboard independence',
      'Security schema-over-datasource inherited level projection',
      'Security mobile permission-tree containment',
      'Security audit detail focus trap, Escape return, and mobile containment',
    ],
  }, null, 2))
} finally {
  await browser.close()
}
