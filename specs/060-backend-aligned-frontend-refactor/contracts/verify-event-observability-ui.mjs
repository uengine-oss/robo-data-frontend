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

async function openEventDetection(page) {
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  const button = page.locator('button[title="이벤트 감지"]').first()
  await button.waitFor({ state: 'attached', timeout: 15_000 })
  if (!(await button.isVisible())) {
    await button
      .locator('xpath=ancestor::div[contains(@class,"nav-group")]')
      .locator('button.nav-group-header')
      .click()
  }
  await button.click()
  await page.locator('.event-chat-page').waitFor({ timeout: 30_000 })
}

const ruleFixture = {
  id: 'event-1',
  name: '수위 이상',
  description: '수위 경고',
  natural_language_condition: '수위가 3m를 초과',
  sql: 'SELECT level FROM readings WHERE level > 3',
  check_interval_minutes: 10,
  condition_threshold: 'rows > 0',
  action_type: 'alert',
  alert_config: { channels: ['platform'], message: '수위 경고' },
  process_config: null,
  is_active: true,
  last_checked_at: null,
  last_triggered_at: null,
  trigger_count: 0,
  created_at: '2026-07-22T10:00:00',
  updated_at: '2026-07-22T10:00:00',
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })

try {
  const actualPage = await context.newPage()
  const actualResponses = []
  actualPage.on('response', response => {
    if (/\/api\/gateway\/text2sql\/events\/(rules|cep\/status)/.test(response.url())) {
      actualResponses.push({ url: response.url(), status: response.status() })
    }
  })
  await openEventDetection(actualPage)
  await actualPage.waitForTimeout(1_000)
  await actualPage.screenshot({
    path: join(evidenceDir, 'event-observability-actual-1920x1080.png'),
    fullPage: true,
  })

  const successPage = await context.newPage()
  const pageErrors = []
  const requests = []
  let rules = []
  let ruleDeleteCalls = 0
  let ruleToggleCalls = 0
  let failNextRulesRefresh = false
  successPage.on('pageerror', error => pageErrors.push(error.message))
  await successPage.route(/\/api\/gateway\/text2sql\/events\//, async route => {
    const request = route.request()
    const url = new URL(request.url())
    requests.push({ path: url.pathname, method: request.method(), headers: request.headers() })

    if (url.pathname.endsWith('/events/rules') && request.method() === 'GET') {
      if (failNextRulesRefresh) {
        failNextRulesRefresh = false
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"detail":"event refresh unavailable"}',
        })
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rules) })
    }
    if (url.pathname.endsWith('/events/rules') && request.method() === 'POST') {
      const body = request.postDataJSON()
      assert(body.sql === ruleFixture.sql, 'UI replaced the operator SQL with generated placeholder SQL')
      rules = [{ ...ruleFixture, ...body }]
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rules[0]) })
    }
    if (url.pathname.endsWith('/events/rules/event-1/toggle') && request.method() === 'POST') {
      ruleToggleCalls += 1
      rules = rules.map(rule => rule.id === 'event-1' ? { ...rule, is_active: false } : rule)
      failNextRulesRefresh = true
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"message":"toggled","is_active":false}',
      })
    }
    if (url.pathname.endsWith('/events/rules/event-1') && request.method() === 'DELETE') {
      ruleDeleteCalls += 1
      if (ruleDeleteCalls === 1) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"detail":"event delete unavailable"}',
        })
      }
      rules = rules.filter(rule => rule.id !== 'event-1')
      failNextRulesRefresh = true
      return route.fulfill({ status: 204 })
    }
    if (url.pathname.endsWith('/events/cep/status')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          local_scheduler_running: true,
          local_active_tasks: 1,
          simple_cep_status: {
            status: 'running', active_rules: 1, total_rules: 1, buffered_events: 0, engine: 'SimpleCEP (Python)',
          },
          esper_cep_available: true,
          esper_cep_status: { status: 'running', activeRules: 1 },
        }),
      })
    }
    if (url.pathname.endsWith('/events/chat')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          response: '설정을 확인해 주세요. <img src=x onerror="window.__eventXss=true">',
          extracted_config: {
            name: '수위 이상', condition: '수위가 3m를 초과', interval: 10,
            threshold: 'rows > 0', action_type: 'alert', process_name: null,
          },
          ready_to_confirm: true,
          event_created: false,
          next_step: 'confirm',
        }),
      })
    }
    if (url.pathname.endsWith('/events/simulate')) {
      const body = request.postDataJSON()
      assert(body.field_name === 'turbidity', 'UI replaced the explicit simulation field')
      assert(body.threshold === 10, 'UI replaced the explicit simulation threshold')
      assert(body.simulated_value === 11.5, 'UI replaced the explicit simulated value')
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          rule_id: 'simulation-1',
          rule_name: body.rule_name,
          events_generated: 13,
          alarms_triggered: 1,
          alarms: [{
            rule_id: 'simulation-1', rule_name: body.rule_name,
            triggered_at: '2026-07-22T10:12:00', duration: '0:10:00', matching_events: 11,
          }],
          condition_details: {
            field: body.field_name,
            operator: '>',
            threshold: body.threshold,
            required_duration_minutes: body.duration_minutes,
            simulated_value: body.simulated_value,
            simulated_duration_minutes: body.simulated_duration_minutes,
          },
        }),
      })
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{"detail":"not mocked"}' })
  })

  await openEventDetection(successPage)
  await successPage.getByText('등록된 이벤트가 없습니다.', { exact: true }).waitFor()
  await successPage.getByText('Esper CEP: running', { exact: true }).waitFor()
  await successPage.getByPlaceholder(/이벤트 상황을 설명/).fill('수위가 3m를 초과하면 알려줘 <script>window.__eventXss=true</script>')
  await successPage.locator('.send-btn').click()
  await successPage.getByText(/설정을 확인해 주세요/).waitFor()
  assert(await successPage.locator('.message-text img').count() === 0, 'Backend chat HTML was executed instead of escaped')
  assert(await successPage.locator('.message-text script').count() === 0, 'User chat HTML was executed instead of escaped')
  assert(!(await successPage.evaluate(() => Boolean(window.__eventXss))), 'Event chat caused script execution')

  const sqlInput = successPage.locator('.sql-config textarea')
  await sqlInput.waitFor()
  const registerButton = successPage.getByRole('button', { name: '이대로 등록' })
  assert(await registerButton.isDisabled(), 'Register button is enabled without required SQL')
  const simulationButton = successPage.getByRole('button', { name: /시뮬레이션$/ })
  assert(await simulationButton.isDisabled(), 'Simulation button is enabled without explicit inputs')
  await successPage.locator('.simulation-config summary').click()
  await successPage.getByLabel('필드명').fill('turbidity')
  await successPage.getByLabel('조건 임계값').fill('10')
  await successPage.getByLabel('필요 지속 시간(분)').fill('10')
  await successPage.getByLabel('테스트 값').fill('11.5')
  await successPage.getByLabel('테스트 지속 시간(분)').fill('12')
  await successPage.getByLabel('관측소 ID').fill('PLANT-1')
  assert(!(await simulationButton.isDisabled()), 'Simulation button remains disabled after explicit inputs')
  await simulationButton.click()
  await successPage.getByText(/격리된 SimpleCEP 시뮬레이션에서/).waitFor()
  await sqlInput.fill(ruleFixture.sql)
  assert(!(await registerButton.isDisabled()), 'Register button remains disabled after SQL input')
  await registerButton.click()
  await successPage.getByText('이벤트 규칙이 등록되었습니다.', { exact: false }).waitFor()
  await successPage.getByText('수위 이상', { exact: true }).last().waitFor()

  await successPage.getByRole('button', { name: '“수위 이상” 이벤트 비활성화' }).click()
  await successPage.getByRole('button', { name: '“수위 이상” 이벤트 활성화' }).waitFor()
  await successPage.getByText(/상태는 변경되었지만 목록을 새로 고치지 못했습니다/).waitFor()
  assert(ruleToggleCalls === 1, 'Event toggle was repeated after refresh failure')
  assert(await successPage.locator('.event-item.inactive').count() === 1,
    'Event toggle local commit was lost after refresh failure')

  const eventDeleteButton = successPage.getByRole('button', { name: '“수위 이상” 이벤트 삭제' })
  await eventDeleteButton.click()
  let actionDialog = successPage.getByRole('alertdialog', { name: '이벤트 규칙 삭제' })
  await actionDialog.getByRole('button', { name: '취소' }).click()
  assert(ruleDeleteCalls === 0, 'Cancelling event deletion sent a backend mutation')
  assert(await eventDeleteButton.evaluate(button => document.activeElement === button),
    'Event delete cancel did not restore trigger focus')

  await successPage.setViewportSize({ width: 390, height: 844 })
  await eventDeleteButton.click()
  actionDialog = successPage.getByRole('alertdialog', { name: '이벤트 규칙 삭제' })
  await actionDialog.getByRole('button', { name: '삭제', exact: true }).click()
  await actionDialog.getByRole('button', { name: '다시 시도' }).waitFor()
  assert(ruleDeleteCalls === 1, 'Event delete failure request count is incorrect')
  assert(await successPage.locator('.event-item').filter({ hasText: '수위 이상' }).isVisible(),
    'Event disappeared before DELETE succeeded')
  const dialogBox = await actionDialog.boundingBox()
  assert(dialogBox && dialogBox.x >= 0 && dialogBox.y >= 0
    && dialogBox.x + dialogBox.width <= 391 && dialogBox.y + dialogBox.height <= 845,
  `Event deletion dialog exceeds mobile viewport: ${JSON.stringify(dialogBox)}`)
  await successPage.screenshot({
    path: join(evidenceDir, 'event-delete-error-390x844.png'),
    fullPage: true,
  })
  await actionDialog.getByRole('button', { name: '다시 시도' }).click()
  await actionDialog.waitFor({ state: 'detached' })
  await successPage.getByText(/삭제는 완료됐지만 목록을 새로 고치지 못했습니다/).waitFor()
  assert(ruleDeleteCalls === 2, 'Event deletion did not retry the exact failed DELETE once')
  assert(await successPage.locator('.event-item').count() === 0,
    'Deleted event reappeared after refresh failure')
  const overflow = await successPage.evaluate(() => ({
    document: document.documentElement.scrollWidth - window.innerWidth,
    body: document.body.scrollWidth - window.innerWidth,
  }))
  assert(overflow.document <= 1 && overflow.body <= 1,
    `Event deletion mobile overflow: ${JSON.stringify(overflow)}`)
  await successPage.setViewportSize({ width: 1920, height: 1080 })

  const eventRequests = requests.filter(request => request.path.includes('/events/'))
  assert(eventRequests.length >= 4, 'Expected event API requests were not observed')
  assert(eventRequests.every(request => request.headers['accept-language'] === 'ko'), 'Session language header is missing')
  assert(pageErrors.length === 0, `Event observability page errors: ${pageErrors.join(' | ')}`)
  await successPage.screenshot({
    path: join(evidenceDir, 'event-observability-success-1920x1080.png'),
    fullPage: true,
  })

  const failurePage = await context.newPage()
  await failurePage.route(/\/api\/gateway\/text2sql\/events\//, route =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{"detail":"service unavailable"}' }),
  )
  await openEventDetection(failurePage)
  await failurePage.locator('.event-list-error').waitFor()
  assert(
    !(await failurePage.getByText('등록된 이벤트가 없습니다.', { exact: true }).isVisible().catch(() => false)),
    'Event list failure is shown as an empty list',
  )
  await failurePage.getByPlaceholder(/이벤트 상황을 설명/).fill('수위가 3m 이상이면 알려줘')
  await failurePage.locator('.send-btn').click()
  await failurePage.getByText(/이벤트 설정 서비스 응답을 받지 못했습니다/).waitFor()
  assert(!(await failurePage.getByRole('button', { name: '이대로 등록' }).isVisible().catch(() => false)), 'Local fake fallback exposed registration after chat failure')

  console.log(JSON.stringify({
    result: 'passed',
    viewport: '1920x1080',
    actualResponses,
    verified: [
      'actual event/CEP requests observed',
      'successful empty list differs from failure',
      'snake_case event chat contract maps to UI config',
      'operator-provided SQL is required and preserved',
      'simulation field and values are explicit and preserved',
      'no local fake chat fallback',
      'chat HTML is escaped',
      'actual CEP status replaces hardcoded connected label',
      'session headers reach event API requests',
      'event deletion cancel and 503 exact retry preserve pre-success state',
      'successful event toggle and delete survive refresh failure without mutation replay',
      'mobile deletion dialog geometry and trigger focus return',
    ],
  }, null, 2))
} finally {
  await context.close()
  await browser.close()
}
