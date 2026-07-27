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
  await button.waitFor({ state: 'attached', timeout: 15_000 })
  if (!(await button.isVisible())) {
    await button
      .locator('xpath=ancestor::div[contains(@class,"nav-group")]')
      .locator('button.nav-group-header')
      .click()
  }
  await button.click()
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
const page = await context.newPage()
const pageErrors = []
let loadRequests = 0
let saveRequests = 0
const savePayloads = []

page.on('pageerror', error => pageErrors.push(error.message))
await page.route(/\/api\/gateway\/robo\/graph\/$/, route => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ nodes: [], relationships: [] }),
}))
await page.route(/\/api\/gateway\/robo\/business-calendar\/\d{4}$/, async route => {
  loadRequests += 1
  if (loadRequests === 1) {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Calendar load verification outage' }),
    })
    return
  }
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      businessDays: [],
      holidays: [],
      settings: { excludeWeekends: true },
    }),
  })
})
await page.route(/\/api\/gateway\/robo\/business-calendar\/$/, async route => {
  assert(route.request().method() === 'POST', 'Unexpected business calendar collection method')
  saveRequests += 1
  savePayloads.push(route.request().postDataJSON())
  if (saveRequests === 1) {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Calendar save verification outage' }),
    })
    return
  }
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true }),
  })
})

try {
  await openFeature(page, '영업일 캘린더')
  const loadError = page.getByRole('alert').filter({
    hasText: 'ROBO 백엔드 서비스가 동작하지 않습니다.',
  })
  await loadError.waitFor()
  await loadError.getByRole('button', { name: '다시 시도' }).click()
  await page.getByRole('heading', { name: '영업일 캘린더' }).waitFor()
  const saveButton = page.getByRole('button', { name: '설정 저장' })
  await saveButton.waitFor()
  const saveButtonHandle = await saveButton.elementHandle()
  await page.waitForFunction(
    button => button instanceof HTMLButtonElement && !button.disabled,
    saveButtonHandle,
  )
  assert(await saveButton.isEnabled(), 'Calendar did not recover after load retry')
  assert(loadRequests === 2, 'Calendar load retry request count drifted')

  const editableDay = page.locator('.calendar-cell:enabled').filter({ has: page.locator('.cell-day') }).first()
  await editableDay.click()
  assert(
    await editableDay.getAttribute('aria-pressed') === 'true',
    'Calendar day selection did not update aria-pressed',
  )

  const addHolidayTrigger = page.getByTitle('공휴일 추가', { exact: true })
  await addHolidayTrigger.click()
  let dialog = page.getByRole('dialog', { name: '공휴일 추가' })
  const dateInput = dialog.locator('input[type="date"]')
  assert(
    await dateInput.evaluate(element => element === document.activeElement),
    'Holiday dialog date input did not receive initial focus',
  )
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden' })
  assert(
    await addHolidayTrigger.evaluate(element => element === document.activeElement),
    'Holiday dialog Escape did not restore trigger focus',
  )

  await addHolidayTrigger.click()
  dialog = page.getByRole('dialog', { name: '공휴일 추가' })
  const displayedYear = Number((await page.locator('.current-month').innerText()).slice(0, 4))
  await dialog.locator('input[type="date"]').fill(`${displayedYear}-07-23`)
  await dialog.getByLabel('공휴일명').fill('계약 검증일')
  await dialog.getByRole('button', { name: '추가' }).click()
  await dialog.waitFor({ state: 'hidden' })
  await page.locator('.holiday-name').filter({ hasText: '계약 검증일' }).waitFor()

  await saveButton.click()
  const saveError = page.getByRole('alert').filter({
    hasText: 'ROBO 백엔드 서비스가 동작하지 않습니다.',
  })
  await saveError.waitFor()
  const loadsBeforeSaveRetry = loadRequests
  await saveError.getByRole('button', { name: '다시 시도' }).click()
  await page.getByRole('status').filter({ hasText: '영업일 설정이 저장되었습니다.' }).waitFor()
  assert(saveRequests === 2, 'Calendar save retry did not repeat the failed save request')
  assert(
    loadRequests === loadsBeforeSaveRetry + 1,
    'Calendar save retry issued an unrelated load before mutation success',
  )
  assert(
    savePayloads[1].holidays.some(holiday => holiday.name === '계약 검증일')
      && savePayloads[1].nonBusinessDays.length >= 1,
    `Calendar save payload drifted: ${JSON.stringify(savePayloads[1])}`,
  )

  await page.setViewportSize({ width: 390, height: 844 })
  const geometry = await page.evaluate(() => {
    const root = document.querySelector('.business-calendar-tab')
    if (!(root instanceof HTMLElement)) throw new Error('Business calendar root missing')
    return {
      documentOverflow:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      rootOverflow: root.scrollWidth - root.clientWidth,
      width: root.getBoundingClientRect().width,
    }
  })
  assert(
    geometry.documentOverflow <= 1 && geometry.rootOverflow <= 1 && geometry.width <= 390,
    `Business calendar mobile layout overflowed: ${JSON.stringify(geometry)}`,
  )
  await page.screenshot({
    path: join(evidenceDir, 'catalog-business-calendar-390x844.png'),
    fullPage: true,
  })
  assert(pageErrors.length === 0, `Business calendar page errors: ${pageErrors.join(' | ')}`)

  console.log('Catalog business calendar UI: exact load/save retry + dialog + mobile passed')
} finally {
  await context.close()
  await browser.close()
}
