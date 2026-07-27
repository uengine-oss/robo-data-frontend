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
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  const pageErrors = []
  let objectDataRequests = 0
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.route(/\/api\/gateway\/ontology\/object-types$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      objectTypes: [{
        id: 'order-type',
        name: 'Order',
        description: 'Order chart fixture',
        columns: [
          { name: 'name', type: 'string' },
          { name: 'amount', type: 'number' },
        ],
        chartConfig: {
          chartType: 'bar',
          xAxis: 'name',
          yAxis: 'amount',
        },
      }],
      total: 1,
    }),
  }))
  await page.route(
    /\/api\/gateway\/ontology\/object-types\/Order\/data\?limit=100$/,
    route => {
      objectDataRequests += 1
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          objectType: 'Order',
          columns: ['id', 'name', 'amount'],
          rows: [
            { id: 1, name: 'Order A', amount: 120 },
            { id: 2, name: 'Order B', amount: 240 },
            { id: 3, name: 'Order C', amount: 360 },
            { id: 4, name: 'Order D', amount: 480 },
            { id: 5, name: 'Order E', amount: 600 },
            { id: 6, name: 'Order F', amount: 720 },
          ],
          rowCount: 6,
          usingMaterializedView: true,
        }),
      })
    },
  )

  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.evaluate(() => {
    const button = document.querySelector('[data-feature-id="object-explorer"]')
    if (!(button instanceof HTMLButtonElement)) throw new Error('Object Explorer feature is missing')
    button.click()
  })
  const objectType = page.locator('.type-item', { hasText: 'Order' })
  await objectType.waitFor({ timeout: 15_000 })
  const typeExpand = objectType.getByRole('button', { name: 'Order 세부정보' })
  const typeSelect = objectType.getByRole('button', { name: 'Order 선택' })
  const typeDetailsId = await typeExpand.getAttribute('aria-controls')
  assert(typeDetailsId, 'ObjectType detail disclosure does not control a content ID')
  await typeExpand.focus()
  await page.keyboard.press('Enter')
  await page.locator(`#${typeDetailsId}`).waitFor({ state: 'visible' })
  assert(
    await typeExpand.getAttribute('aria-expanded') === 'true'
      && await typeSelect.getAttribute('aria-pressed') === 'false'
      && objectDataRequests === 0,
    'ObjectType detail expansion changed selection or requested object data',
  )
  await page.waitForTimeout(250)
  await page.screenshot({
    path: join(evidenceDir, 'object-search-row-ownership-1280x720.png'),
    fullPage: true,
  })
  await page.keyboard.press('Space')
  await page.locator(`#${typeDetailsId}`).waitFor({ state: 'detached' })
  assert(
    await typeExpand.getAttribute('aria-expanded') === 'false'
      && objectDataRequests === 0,
    'ObjectType detail collapse changed the data request boundary',
  )
  await typeSelect.focus()
  await page.keyboard.press('Space')

  const childDialog = page.getByRole('dialog', { name: '하위 노드 선택' })
  await childDialog.waitFor()
  assert(
    await childDialog.getByRole('textbox', { name: '하위 노드 검색' })
      .evaluate(element => element === document.activeElement),
    'Child selection dialog did not focus its search input',
  )
  assert(objectDataRequests === 1, 'ObjectType selection did not issue exactly one data request')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(250)
  const childDialogGeometry = await childDialog.evaluate(element => {
    const rect = element.getBoundingClientRect()
    return {
      left: rect.left,
      right: rect.right,
      bottom: rect.bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentWidth: document.documentElement.scrollWidth,
    }
  })
  assert(
    childDialogGeometry.left >= 0
      && childDialogGeometry.right <= childDialogGeometry.viewportWidth
      && childDialogGeometry.bottom <= childDialogGeometry.viewportHeight
      && childDialogGeometry.documentWidth <= childDialogGeometry.viewportWidth,
    `Child selection dialog overflowed the mobile viewport: ${JSON.stringify(childDialogGeometry)}`,
  )
  const firstChild = childDialog.getByRole('checkbox', { name: 'Order A 선택' })
  await firstChild.focus()
  await page.keyboard.press('Space')
  assert(
    await firstChild.isChecked()
      && await childDialog.getByRole('button', { name: '1개 추가' }).isEnabled(),
    'Child selection checkbox did not own keyboard selection',
  )
  await page.screenshot({
    path: join(evidenceDir, 'object-child-selection-390x844.png'),
    fullPage: true,
  })
  await childDialog.getByRole('button', { name: '1개 추가' }).press('Enter')
  await childDialog.waitFor({ state: 'detached' })
  await page.setViewportSize({ width: 1280, height: 720 })

  const chartSection = page.locator('.chart-section', { hasText: 'Order' })
  await chartSection.waitFor({ timeout: 15_000 })
  assert(
    await typeSelect.getAttribute('aria-pressed') === 'true'
      && objectDataRequests === 1,
    'ObjectType selection did not issue exactly one object-data request',
  )
  const toggle = chartSection.locator('.section-toggle')
  const controlledId = await toggle.getAttribute('aria-controls')
  assert(controlledId, 'Object chart disclosure does not control a section ID')
  assert(
    await toggle.getAttribute('aria-expanded') === 'true'
      && await page.locator(`#${controlledId}`).isVisible(),
    'Object chart section did not start expanded',
  )
  assert(
    await chartSection.locator('.config-btn').count() === 0,
    'Object chart retained the unconsumed configuration control',
  )

  await toggle.focus()
  await page.keyboard.press('Space')
  await page.waitForFunction(id => {
    const control = document.querySelector('.chart-section .section-toggle')
    const content = document.getElementById(id)
    return control?.getAttribute('aria-expanded') === 'false'
      && content instanceof HTMLElement
      && getComputedStyle(content).display === 'none'
  }, controlledId)
  assert(
    await toggle.getAttribute('aria-expanded') === 'false'
      && !(await page.locator(`#${controlledId}`).isVisible()),
    'Object chart section did not collapse from Space',
  )
  await page.keyboard.press('Enter')
  await page.waitForFunction(id => {
    const control = document.querySelector('.chart-section .section-toggle')
    const content = document.getElementById(id)
    return control?.getAttribute('aria-expanded') === 'true'
      && content instanceof HTMLElement
      && getComputedStyle(content).display !== 'none'
  }, controlledId)
  await page.locator(`#${controlledId}`).waitFor({ state: 'visible' })
  assert(
    await toggle.getAttribute('aria-expanded') === 'true'
      && await page.locator(`#${controlledId}`).isVisible(),
    'Object chart section did not expand from Enter',
  )
  await page.screenshot({
    path: join(evidenceDir, 'object-chart-disclosure-1280x720.png'),
    fullPage: true,
  })
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    'Object chart disclosure introduced horizontal overflow',
  )
  assert(pageErrors.length === 0, `Object chart page errors: ${pageErrors.join(' | ')}`)

  console.log(JSON.stringify({
    result: 'passed',
    viewport: '1280x720',
    controlledId,
    verified: [
      'ObjectType detail expansion is independent from selection and data requests',
      'ObjectType keyboard selection issues exactly one object-data request',
      'real ObjectType data projects an Object chart section',
      'Space collapse and Enter expansion preserve the section projection',
      'expanded and controls state match the actual chart content',
      'unconsumed chart configuration control is absent',
      'zero document horizontal overflow',
    ],
  }, null, 2))
} finally {
  await browser.close()
}
