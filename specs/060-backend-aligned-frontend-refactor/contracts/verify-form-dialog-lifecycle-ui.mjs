import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../../..')
const require = createRequire(join(repoRoot, '.unittest/package.json'))
const { chromium } = require('playwright')
const baseUrl = process.env.FRONTEND_URL ?? 'http://127.0.0.1:3000'
const harnessUrl = `${baseUrl}/specs/060-backend-aligned-frontend-refactor/contracts/form-dialog-lifecycle-harness.html`
const evidenceDir = resolve(here, '../evidence')
await mkdir(evidenceDir, { recursive: true })

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  const pageErrors = []
  const consoleErrors = []
  const permissionPayloads = []
  const synonymPayloads = []
  let permissionSaveAttempts = 0

  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  await page.route(/\/api\/gateway\/security\/users$/, route => route.fulfill({
    status: 200, contentType: 'application/json', body: '[]',
  }))
  await page.route(/\/api\/gateway\/security\/roles$/, route => route.fulfill({
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
  await page.route(/\/api\/gateway\/security\/tables$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([{ name: 'orders', schema: 'sales', db: 'warehouse', column_count: 3 }]),
  }))
  await page.route(/\/api\/gateway\/security\/access-rules$/, async route => {
    if (route.request().method() === 'POST') {
      permissionSaveAttempts += 1
      permissionPayloads.push(await route.request().postDataJSON())
      if (permissionSaveAttempts === 1) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"detail":"권한 저장 실패"}',
        })
      }
      return route.fulfill({ status: 204, body: '' })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.route(/\/api\/gateway\/robo\/glossary\/commerce\/terms\/term-order$/, async route => {
    if (route.request().method() === 'PUT') {
      synonymPayloads.push(await route.request().postDataJSON())
      return route.fulfill({ status: 204, body: '' })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'term-order',
        name: '주문',
        description: '',
        status: 'Approved',
        synonyms: [],
        owners: [],
        reviewers: [],
        domains: [],
        tags: [],
        relatedTerms: [],
      }),
    })
  })

  await page.goto(harnessUrl, { waitUntil: 'networkidle', timeout: 60_000 })

  const dataTrigger = page.getByRole('button', { name: '기존 데이터 처리 열기' })
  await dataTrigger.click()
  const dataDialog = page.getByRole('dialog', { name: '기존 데이터 감지' })
  const originalChoice = dataDialog.getByRole('radio', { name: /원본 유지/ })
  await originalChoice.waitFor()
  assert(await originalChoice.evaluate(element => element === document.activeElement), 'Data dialog initial focus drifted')
  await dataDialog.getByRole('button', { name: '취소' }).focus()
  await page.keyboard.press('Tab')
  const dataClose = dataDialog.getByRole('button', { name: '기존 데이터 처리 닫기' })
  assert(await dataClose.evaluate(element => element === document.activeElement), 'Data dialog Tab trap escaped')
  await page.keyboard.press('Escape')
  await dataDialog.waitFor({ state: 'hidden' })
  assert(await dataTrigger.evaluate(element => element === document.activeElement), 'Data dialog did not restore trigger focus')

  await dataTrigger.click()
  await dataDialog.getByRole('radio', { name: /대문자/ }).press('Space')
  await dataDialog.getByRole('button', { name: /기존 데이터에 추가/ }).click()
  assert(await page.locator('#harness-event').innerText() === 'data:append:uppercase', 'Data result payload drifted')

  const feedbackTrigger = page.getByRole('button', { name: '스키마 피드백 열기' })
  await feedbackTrigger.click()
  const feedbackDialog = page.getByRole('dialog', { name: '스키마 수정 요청' })
  const feedbackInput = feedbackDialog.getByRole('textbox')
  assert(await feedbackInput.evaluate(element => element === document.activeElement), 'Feedback initial focus drifted')
  await page.keyboard.press('Escape')
  assert(await feedbackTrigger.evaluate(element => element === document.activeElement), 'Feedback trigger focus was not restored')
  await feedbackTrigger.click()
  await feedbackInput.fill('Order에 상태 속성을 추가해주세요')
  await feedbackDialog.locator('button.btn-primary').click()
  assert(
    await page.locator('#harness-event').innerText() === 'feedback:Order에 상태 속성을 추가해주세요',
    'Feedback submit result drifted',
  )

  const synonymTrigger = page.getByRole('button', { name: '동의어 제안 열기' })
  await synonymTrigger.click()
  let synonymDialog = page.getByRole('dialog', { name: '동의어 제안' })
  const selectAll = synonymDialog.getByRole('button', { name: '모두 선택' })
  assert(await selectAll.evaluate(element => element === document.activeElement), 'Synonym initial focus drifted')
  await page.keyboard.press('Escape')
  assert(await synonymTrigger.evaluate(element => element === document.activeElement), 'Synonym trigger focus was not restored')
  await synonymTrigger.click()
  synonymDialog = page.getByRole('dialog', { name: '동의어 제안' })
  await synonymDialog.getByRole('button', { name: '모두 선택' }).click()
  await synonymDialog.getByRole('button', { name: '1개 동의어 추가' }).click()
  await synonymDialog.waitFor({ state: 'hidden' })
  assert(synonymPayloads.length === 1 && synonymPayloads[0].synonyms[0] === '오더', 'Synonym update payload drifted')
  assert(await page.locator('#harness-event').innerText() === 'synonyms:1', 'Synonym applied result drifted')

  const datasourceSelect = page.getByRole('button', { name: 'warehouse 데이터소스 권한 선택' })
  await datasourceSelect.click()
  const permissionTrigger = page.getByRole('button', { name: '권한 추가' })
  await permissionTrigger.click()
  const permissionDialog = page.getByRole('dialog', { name: 'warehouse에 권한 추가' })
  const roleChoice = permissionDialog.getByRole('radio', { name: '역할' })
  assert(await roleChoice.evaluate(element => element === document.activeElement), 'Permission initial focus drifted')
  await page.keyboard.press('Escape')
  assert(await permissionTrigger.evaluate(element => element === document.activeElement), 'Permission trigger focus was not restored')

  await permissionTrigger.click()
  await permissionDialog.getByRole('combobox').selectOption('analyst')
  await permissionDialog.getByRole('button', { name: '추가', exact: true }).click()
  const permissionError = permissionDialog.getByRole('alert')
  await permissionError.waitFor()
  assert((await permissionError.innerText()).includes('권한을 저장하지 못했습니다'), 'Permission failure is not visible in dialog')
  assert(await permissionDialog.isVisible(), 'Permission failure closed the retryable dialog')
  await permissionDialog.getByRole('button', { name: '추가', exact: true }).click()
  await permissionDialog.waitFor({ state: 'hidden' })
  assert(permissionPayloads.length === 2, `Expected exact permission retry, got ${permissionPayloads.length}`)
  assert(
    JSON.stringify(permissionPayloads[0]) === JSON.stringify(permissionPayloads[1]),
    'Permission retry payload changed',
  )
  assert(await permissionTrigger.evaluate(element => element === document.activeElement), 'Permission success did not restore trigger focus')

  await page.setViewportSize({ width: 390, height: 844 })
  await synonymTrigger.click()
  synonymDialog = page.getByRole('dialog', { name: '동의어 제안' })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  assert(overflow <= 1, `Form dialog harness overflowed mobile viewport by ${overflow}px`)
  const dialogBox = await synonymDialog.boundingBox()
  assert(dialogBox && dialogBox.y >= 0 && dialogBox.y + dialogBox.height <= 844, 'Synonym dialog escaped mobile viewport')
  await page.screenshot({
    path: join(evidenceDir, 'form-dialog-lifecycle-390x844.png'),
    fullPage: true,
  })

  assert(pageErrors.length === 0, `Form dialog page errors: ${pageErrors.join(' | ')}`)
  const unexpectedConsoleErrors = consoleErrors.filter(message =>
    !message.includes('503')
    && !message.includes('/api/gateway/security/access-rules')
    && !message.includes('권한 저장 실패'),
  )
  assert(unexpectedConsoleErrors.length === 0, `Form dialog console errors: ${unexpectedConsoleErrors.join(' | ')}`)
  console.log('Shared form dialog focus, payload, exact retry, and mobile geometry passed')
} finally {
  await browser.close()
}
