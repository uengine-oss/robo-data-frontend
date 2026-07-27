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

const browser = await chromium.launch({ headless: true })

try {
  const appPage = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  const appErrors = []
  const appConsoleErrors = []
  let chartSaveAttempts = 0
  appPage.on('pageerror', error => appErrors.push(error.message))
  appPage.on('console', message => {
    if (message.type() === 'error') appConsoleErrors.push(message.text())
  })
  await appPage.route(/\/api\/gateway\/robo\/graph\/?$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '{"nodes":[],"relationships":[]}',
  }))
  await appPage.route(/\/api\/gateway\/robo\/schema\/tables\?/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '[]',
  }))
  await appPage.route(/\/api\/gateway\/robo\/schema\/relationships$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '[]',
  }))
  await appPage.route(/\/api\/gateway\/ontology\/object-types$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      objectTypes: [{
        id: 'orders',
        name: 'Order',
        description: '주문',
        columns: [
          { name: 'status', type: 'string' },
          { name: 'amount', type: 'number' },
        ],
        chartConfig: { chartType: 'bar', xAxis: 'status', yAxis: 'amount' },
      }],
      total: 1,
    }),
  }))
  await appPage.route(/\/api\/gateway\/ontology\/object-types\/Order\/data\?limit=10$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      objectType: 'Order',
      columns: ['status', 'amount'],
      rows: [{ status: 'paid', amount: 120 }],
      rowCount: 1,
      usingMaterializedView: false,
    }),
  }))
  await appPage.route(/\/api\/gateway\/ontology\/object-types\/Order\/chart-config$/, route => {
    chartSaveAttempts += 1
    if (chartSaveAttempts === 1) {
      return new Promise(resolve => {
        setTimeout(() => {
          resolve(route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: '{"success":true,"message":"saved"}',
          }))
        }, 250)
      })
    }
    return route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"detail":"두 번째 차트 저장 실패"}',
    })
  })

  await appPage.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  const themeToggle = appPage.locator('.theme-toggle')
  await themeToggle.click()
  await appPage.waitForTimeout(100)
  await themeToggle.click()
  await appPage.waitForTimeout(170)
  assert(
    await appPage.locator('html').evaluate(element => element.classList.contains('theme-transitioning')),
    'The first theme timer removed the latest transition class early',
  )
  await appPage.waitForTimeout(120)
  assert(
    !(await appPage.locator('html').evaluate(element => element.classList.contains('theme-transitioning'))),
    'The latest theme transition did not settle after its full fade lifetime',
  )

  await appPage.evaluate(() => {
    const button = document.querySelector('[data-feature-id="schema-modeling"]')
    if (!(button instanceof HTMLButtonElement)) throw new Error('Schema modeling feature is missing')
    button.click()
  })
  const editButton = appPage.getByRole('button', { name: 'Order ObjectType 편집' })
  await editButton.waitFor({ timeout: 20_000 })
  await editButton.click()
  let objectDialog = appPage.getByRole('dialog', { name: 'Order 편집' })
  await objectDialog.waitFor()
  assert(
    await objectDialog.getByRole('button', { name: 'ObjectType 편집 닫기' })
      .evaluate(element => element === document.activeElement),
    'ObjectType dialog did not own initial focus',
  )
  await appPage.getByRole('tab', { name: '차트 설정' }).click()
  await appPage.getByRole('button', { name: '저장', exact: true }).click()
  await appPage.keyboard.press('Escape')
  assert(
    await objectDialog.isVisible()
      && await objectDialog.getByRole('button', { name: 'ObjectType 편집 닫기' }).isDisabled(),
    'ObjectType chart mutation allowed Escape or close while the PATCH was pending',
  )
  await objectDialog.waitFor({ state: 'detached' })
  assert(chartSaveAttempts === 1, 'The first chart save did not issue one PATCH')

  await editButton.click()
  objectDialog = appPage.getByRole('dialog', { name: 'Order 편집' })
  await objectDialog.waitFor()
  await appPage.getByRole('tab', { name: '차트 설정' }).click()
  await appPage.getByRole('button', { name: '저장', exact: true }).click()
  const chartFailure = appPage.locator('.save-message', { hasText: '두 번째 차트 저장 실패' })
  await chartFailure.waitFor()
  await appPage.waitForTimeout(3200)
  assert(
    await chartFailure.isVisible(),
    'An earlier success timer cleared the later chart save failure',
  )
  const desktopFailureGeometry = await chartFailure.boundingBox()
  const desktopDialogGeometry = await objectDialog.boundingBox()
  assert(
    desktopFailureGeometry
      && desktopDialogGeometry
      && desktopFailureGeometry.y >= desktopDialogGeometry.y
      && desktopFailureGeometry.y + desktopFailureGeometry.height
        <= desktopDialogGeometry.y + desktopDialogGeometry.height,
    `ObjectType chart failure is clipped outside the dialog: ${JSON.stringify({
      status: desktopFailureGeometry,
      dialog: desktopDialogGeometry,
    })}`,
  )
  await appPage.screenshot({
    path: join(evidenceDir, 'managed-object-chart-failure-1280x720.png'),
    fullPage: true,
  })
  await appPage.setViewportSize({ width: 390, height: 844 })
  const mobileGeometry = await appPage.evaluate(() => {
    const dialog = document.querySelector('.dialog-container')
    const chart = document.querySelector('.chart-config-tab')
    const status = document.querySelector('.save-message')
    if (!(dialog instanceof HTMLElement) || !(chart instanceof HTMLElement) || !(status instanceof HTMLElement)) {
      throw new Error('ObjectType mobile surfaces are missing')
    }
    const dialogBox = dialog.getBoundingClientRect()
    const chartBox = chart.getBoundingClientRect()
    const statusBox = status.getBoundingClientRect()
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      dialogLeft: dialogBox.left,
      dialogRight: dialogBox.right,
      chartWidth: chartBox.width,
      dialogWidth: dialogBox.width,
      statusTop: statusBox.top,
      statusBottom: statusBox.bottom,
      viewportHeight: window.innerHeight,
    }
  })
  assert(
    mobileGeometry.overflow <= 1
      && mobileGeometry.dialogLeft >= 8
      && mobileGeometry.dialogRight <= 382
      && mobileGeometry.chartWidth <= mobileGeometry.dialogWidth
      && mobileGeometry.statusTop >= 0
      && mobileGeometry.statusBottom <= mobileGeometry.viewportHeight,
    `ObjectType mobile geometry is invalid: ${JSON.stringify(mobileGeometry)}`,
  )
  await appPage.screenshot({
    path: join(evidenceDir, 'managed-object-chart-failure-390x844.png'),
    fullPage: true,
  })
  await appPage.keyboard.press('Escape')
  await objectDialog.waitFor({ state: 'detached' })
  assert(
    await editButton.evaluate(element => element === document.activeElement),
    'ObjectType Escape did not restore the edit trigger focus',
  )
  assert(appErrors.length === 0, `Managed app page errors: ${appErrors.join(' | ')}`)
  const unexpectedAppConsoleErrors = appConsoleErrors.filter(message => (
    !message.includes('503')
    && !message.includes('두 번째 차트 저장 실패')
    && !message.includes('/object-types/Order/chart-config')
  ))
  assert(
    unexpectedAppConsoleErrors.length === 0,
    `Managed app console errors: ${unexpectedAppConsoleErrors.join(' | ')}`,
  )
  await appPage.close()

  const bpmnPage = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  const bpmnErrors = []
  const bpmnConsoleErrors = []
  let bpmnSaveAttempts = 0
  bpmnPage.on('pageerror', error => bpmnErrors.push(error.message))
  bpmnPage.on('console', message => {
    if (message.type() === 'error') bpmnConsoleErrors.push(message.text())
  })
  await bpmnPage.route(/\/api\/gateway\/ontology\/nodes\/process-order\/bpmn-xml$/, route => {
    bpmnSaveAttempts += 1
    if (bpmnSaveAttempts === 1) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"success":true,"nodeId":"process-order","message":"saved"}',
      })
    }
    return route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"detail":"두 번째 BPMN 저장 실패"}',
    })
  })
  await bpmnPage.goto(
    `${baseUrl}/specs/060-backend-aligned-frontend-refactor/contracts/bpmn-lifecycle-harness.html`,
    { waitUntil: 'networkidle', timeout: 60_000 },
  )
  await bpmnPage.locator('.bpmn-canvas .djs-container').waitFor({ timeout: 20_000 })
  const inlineGeometry = await bpmnPage.locator('.bpmn-canvas').evaluate(element => ({
    height: element.getBoundingClientRect().height,
    documentHeight: document.documentElement.scrollHeight,
    viewportHeight: window.innerHeight,
  }))
  assert(
    inlineGeometry.height <= inlineGeometry.viewportHeight * 0.75 + 1
      && inlineGeometry.documentHeight <= inlineGeometry.viewportHeight + 1,
    `BPMN inline fit escaped its viewport: ${JSON.stringify(inlineGeometry)}`,
  )

  await bpmnPage.getByTitle('편집기 열기 (전체 화면)').click()
  await bpmnPage.getByTitle('닫기 (ESC)').click()
  await bpmnPage.locator('.bpmn-popup-overlay').waitFor({ state: 'detached' })
  await bpmnPage.waitForTimeout(120)
  assert(
    await bpmnPage.locator('.bpmn-popup-canvas .djs-container').count() === 0,
    'Closing during popup delay recreated the BPMN editor',
  )

  await bpmnPage.getByTitle('편집기 열기 (전체 화면)').click()
  await bpmnPage.locator('.bpmn-popup-canvas .djs-container').waitFor({ timeout: 20_000 })
  const saveButton = bpmnPage.getByTitle('저장 (Ctrl+S)')
  await saveButton.click()
  await bpmnPage.getByText('✅ 저장 완료').waitFor()
  await bpmnPage.waitForTimeout(1000)
  await saveButton.click()
  const bpmnFailure = bpmnPage.getByText(/두 번째 BPMN 저장 실패/)
  await bpmnFailure.waitFor()
  await bpmnPage.waitForTimeout(2200)
  assert(
    await bpmnFailure.isVisible(),
    'An earlier BPMN success timer cleared the later save failure',
  )
  await bpmnPage.screenshot({
    path: join(evidenceDir, 'managed-bpmn-failure-1280x720.png'),
    fullPage: false,
  })
  await bpmnPage.getByTitle('닫기 (ESC)').click()
  await bpmnPage.locator('.bpmn-popup-overlay').waitFor({ state: 'detached' })
  assert(await bpmnFailure.count() === 0, 'Closing BPMN popup retained its delayed status surface')
  assert(bpmnErrors.length === 0, `BPMN lifecycle page errors: ${bpmnErrors.join(' | ')}`)
  const unexpectedBpmnConsoleErrors = bpmnConsoleErrors.filter(message => (
    !message.includes('503')
    && !message.includes('두 번째 BPMN 저장 실패')
    && !message.includes('/nodes/process-order/bpmn-xml')
    && !message.includes('[BpmnViewer] Save failed:')
  ))
  assert(
    unexpectedBpmnConsoleErrors.length === 0,
    `BPMN lifecycle console errors: ${unexpectedBpmnConsoleErrors.join(' | ')}`,
  )
  assert(bpmnSaveAttempts === 2, 'BPMN save lifecycle did not issue exactly two PATCH requests')

  console.log('Rapid theme, ObjectType status replacement, BPMN delayed close, and save status replacement passed')
} finally {
  await browser.close()
}
