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

const profileFixture = {
  id: 'profile-1',
  name: '수위 감시',
  description: '수위 감시 프로필',
  natural_language_query: '수위 이상 데이터가 있는지 확인',
  generated_sql: 'SELECT level FROM readings WHERE level > 3',
  check_interval_minutes: 10,
  condition_expression: 'rows > 0',
  process_id: 'process-1',
  process_name: '수위 대응',
  process_params: null,
  is_active: true,
  created_at: '2026-07-22T10:00:00',
  updated_at: null,
  last_executed_at: null,
  execution_count: 2,
  last_result: 'triggered',
  data_source_type: 'sql',
  whatif_scenario_id: null,
  whatif_scenario_name: null,
  whatif_schema_id: null,
  whatif_output_field: null,
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })

try {
  const page = await context.newPage()
  const pageErrors = []
  const schedulerRequests = []
  let profiles = [profileFixture]
  let profileDeleteCalls = 0
  let profileToggleCalls = 0
  let failNextProfileRefresh = false
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.addInitScript(() => localStorage.setItem('robo-analyzer-api-key', 'watch-agent-test-key'))

  await page.route(/\/api\/gateway\/agent-scheduler\//, async route => {
    const request = route.request()
    const url = new URL(request.url())
    schedulerRequests.push({
      path: url.pathname,
      method: request.method(),
      headers: request.headers(),
    })

    if (url.pathname.endsWith('/profiles/processgpt/processes')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          processes: [{ id: 'process-1', name: '수위 대응', description: '수위 이상 대응' }],
        }),
      })
    }
    if (url.pathname.endsWith('/profiles') && request.method() === 'GET') {
      if (failNextProfileRefresh) {
        failNextProfileRefresh = false
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"detail":"profile refresh unavailable"}',
        })
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(profiles) })
    }
    if (url.pathname.endsWith('/profiles') && request.method() === 'POST') {
      const body = request.postDataJSON()
      assert(body.name === '신규 감시', 'Profile name was changed before reaching the backend')
      assert(body.generated_sql === 'SELECT value FROM metrics', 'SQL was changed before reaching the backend')
      assert(body.condition_expression === 'rows > 0', 'Condition expression was changed before reaching the backend')
      assert(body.process_id === 'process-1', 'Selected ProcessGPT id was not preserved')
      assert(body.data_source_type === 'sql', 'Profile data source contract is incorrect')
      assert(!('steps' in body), 'Frontend sent the disconnected graph-pipeline contract')
      const created = {
        ...profileFixture,
        ...body,
        id: 'profile-2',
        natural_language_query: body.natural_language_query,
        generated_sql: body.generated_sql,
        check_interval_minutes: body.check_interval_minutes,
        condition_expression: body.condition_expression,
        process_id: body.process_id,
        process_name: body.process_name,
        data_source_type: body.data_source_type,
        name: body.name,
        description: body.description,
        execution_count: 0,
        last_result: null,
      }
      profiles = [created, ...profiles]
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(created) })
    }
    if (url.pathname.endsWith('/profiles/profile-1') && request.method() === 'DELETE') {
      profileDeleteCalls += 1
      if (profileDeleteCalls === 1) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"detail":"profile delete unavailable"}',
        })
      }
      profiles = profiles.filter(profile => profile.id !== 'profile-1')
      failNextProfileRefresh = true
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' })
    }
    if (url.pathname.endsWith('/profiles/profile-2/toggle') && request.method() === 'POST') {
      profileToggleCalls += 1
      profiles = profiles.map(profile =>
        profile.id === 'profile-2' ? { ...profile, is_active: false } : profile,
      )
      failNextProfileRefresh = true
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"is_active":false}',
      })
    }
    if (url.pathname.endsWith('/profiles/profile-1/test')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          row_count: 1,
          execution_time_ms: 4.2,
          sample_data: [{ level: 3.4 }],
          condition_met: true,
          columns: ['level'],
          error: null,
        }),
      })
    }
    if (url.pathname.endsWith('/profiles/profile-1/debug')) {
      assert(request.postDataJSON().simulate_action === false, 'Debug request could execute a real action')
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          profile_id: 'profile-1',
          profile_name: '수위 감시',
          started_at: '2026-07-22T10:00:00',
          completed_at: '2026-07-22T10:00:01',
          total_duration_ms: 1000,
          steps: [
            { step: 'sql_execution', status: 'success', title: '1단계: SQL 쿼리 실행', description: '1행 반환', started_at: '2026-07-22T10:00:00', completed_at: '2026-07-22T10:00:01', duration_ms: 900 },
            { step: 'condition_evaluation', status: 'success', title: '2단계: 조건 평가', description: '조건 충족', started_at: '2026-07-22T10:00:01', completed_at: '2026-07-22T10:00:01', duration_ms: 10 },
            { step: 'action_simulation', status: 'success', title: '3단계: 조치 시뮬레이션', description: '실행 준비됨 (시뮬레이션 모드)', started_at: '2026-07-22T10:00:01', completed_at: '2026-07-22T10:00:01', duration_ms: 10 },
          ],
          final_result: 'triggered',
          condition_met: true,
          would_trigger_action: true,
          sql_result: { status: 'success', row_count: 1 },
          action_preview: { process_name: '수위 대응', simulation_only: true },
        }),
      })
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{"detail":"not mocked"}' })
  })

  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  await openFeature(page, '감시 에이전트')
  try {
    await page.locator('.watch-agent-page').waitFor({ timeout: 15_000 })
  } catch (error) {
    console.error('Watch Agent render diagnostics:', {
      url: page.url(),
      pageErrors,
      body: (await page.locator('body').innerText()).slice(0, 4_000),
    })
    throw error
  }
  await page.getByText('수위 감시', { exact: true }).first().waitFor()

  await page.getByRole('button', { name: 'SQL 테스트' }).click()
  await page.getByText('SQL 테스트 결과', { exact: true }).waitFor()
  await page.getByText('3.4', { exact: true }).waitFor()

  await page.getByRole('button', { name: '전체 디버그' }).click()
  await page.getByText('서버 디버그 결과', { exact: true }).waitFor()
  await page.getByText('3단계: 조치 시뮬레이션', { exact: true }).waitFor()

  await page.getByTitle('새 감시 에이전트').click()
  await page.getByLabel('이름', { exact: true }).fill('신규 감시')
  await page.getByLabel('감시 목적', { exact: true }).fill('신규 값 감시')
  await page.getByLabel('SQL', { exact: true }).fill('SELECT value FROM metrics')
  await page.locator('.profile-form section').filter({ hasText: '3단계 · ProcessGPT 조치' }).locator('select').selectOption('process-1')
  await page.getByRole('button', { name: '에이전트 저장' }).click()
  await page.getByText('“신규 감시” 감시 에이전트를 저장했습니다.', { exact: true }).waitFor()
  await page.getByText('신규 감시', { exact: true }).first().waitFor()
  await page.locator('.vue-flow__node').nth(2).waitFor()
  assert(await page.locator('.vue-flow__node').count() === 3, 'Saved profile graph does not render all three scheduler steps')

  const profileDeleteButton = page.getByRole('button', { name: '“수위 감시” 감시 에이전트 삭제' })
  await profileDeleteButton.click()
  let actionDialog = page.getByRole('alertdialog', { name: '감시 에이전트 삭제' })
  await actionDialog.getByRole('button', { name: '취소' }).click()
  assert(profileDeleteCalls === 0, 'Cancelling profile deletion sent a backend mutation')
  assert(await profileDeleteButton.evaluate(button => document.activeElement === button),
    'Profile delete cancel did not restore trigger focus')

  await page.setViewportSize({ width: 390, height: 844 })
  await profileDeleteButton.click()
  actionDialog = page.getByRole('alertdialog', { name: '감시 에이전트 삭제' })
  await actionDialog.getByRole('button', { name: '삭제', exact: true }).click()
  await actionDialog.getByRole('button', { name: '다시 시도' }).waitFor()
  assert(profileDeleteCalls === 1, 'Profile delete failure request count is incorrect')
  assert(await page.getByText('수위 감시', { exact: true }).first().isVisible(),
    'Profile disappeared before DELETE succeeded')
  const dialogBox = await actionDialog.boundingBox()
  assert(dialogBox && dialogBox.x >= 0 && dialogBox.y >= 0
    && dialogBox.x + dialogBox.width <= 391 && dialogBox.y + dialogBox.height <= 845,
  `Profile deletion dialog exceeds mobile viewport: ${JSON.stringify(dialogBox)}`)
  await page.screenshot({
    path: join(evidenceDir, 'watch-agent-delete-error-390x844.png'),
    fullPage: true,
  })
  await actionDialog.getByRole('button', { name: '다시 시도' }).click()
  await actionDialog.waitFor({ state: 'detached' })
  await page.getByText(/삭제는 완료됐지만 목록을 새로 고치지 못했습니다/).waitFor()
  assert(profileDeleteCalls === 2, 'Profile deletion did not retry the exact failed DELETE once')
  assert(!(await page.getByText('수위 감시', { exact: true }).first().isVisible().catch(() => false)),
    'Deleted profile reappeared after refresh failure')

  const profileToggleButton = page.getByRole('button', { name: '“신규 감시” 감시 에이전트 비활성화' })
  await profileToggleButton.click()
  await page.getByRole('button', { name: '“신규 감시” 감시 에이전트 활성화' }).waitFor()
  await page.getByText(/상태는 변경되었지만 목록을 새로 고치지 못했습니다/).waitFor()
  assert(profileToggleCalls === 1, 'Profile toggle was repeated after refresh failure')
  await page.setViewportSize({ width: 1920, height: 1080 })

  const apiRequests = schedulerRequests.filter(request => request.path.includes('/agent-scheduler/'))
  assert(apiRequests.length >= 6, 'Expected scheduler requests were not observed')
  assert(apiRequests.every(request => request.headers['accept-language'] === 'ko'), 'Session language header is missing')
  assert(apiRequests.every(request => request.headers['x-llm-api-key'] === 'watch-agent-test-key'), 'Session API key header is missing')
  assert(pageErrors.length === 0, `Watch Agent page errors: ${pageErrors.join(' | ')}`)

  await page.screenshot({
    path: join(evidenceDir, 'watch-agent-profile-success-1920x1080.png'),
    fullPage: true,
  })

  for (const feature of [
    { navigation: '데이터 품질', heading: '데이터 품질' },
    { navigation: '사고 관리자', heading: '인시던트 관리' },
    { navigation: '알림들', heading: '알림 설정' },
  ]) {
    await openFeature(page, feature.navigation)
    await page.getByRole('heading', { name: feature.heading, exact: true }).waitFor()
    await page.getByRole('heading', { name: '서비스 연결이 필요합니다', exact: true }).waitFor()
  }
  assert(await page.getByText('sample_snowflake', { exact: false }).count() === 0, 'Dummy quality data is still visible')

  const failurePage = await context.newPage()
  await failurePage.route(/\/api\/gateway\/agent-scheduler\//, route =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{"detail":"scheduler unavailable"}' }),
  )
  await failurePage.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  await openFeature(failurePage, '감시 에이전트')
  await failurePage.locator('.inline-message.error').waitFor()
  assert(
    !(await failurePage.getByText('저장된 감시 에이전트가 없습니다.', { exact: true }).isVisible().catch(() => false)),
    'Scheduler failure is shown as a successful empty list',
  )

  console.log(JSON.stringify({
    result: 'passed',
    viewport: '1920x1080',
    verified: [
      'watch profiles use the scheduler-owned /profiles contract',
      'SQL test and dry-run debug use backend results',
      'profile creation preserves explicit operator input',
      'disconnected graph-pipeline payload is not sent',
      'session headers reach every scheduler request',
      'scheduler failure differs from an empty profile list',
      'profile deletion cancel and 503 exact retry preserve pre-success state',
      'successful delete and toggle remain locally committed after refresh failure',
      'mobile deletion dialog geometry and trigger focus return',
      'unwired observability tabs do not present dummy operational data',
      'no browser runtime errors',
    ],
  }, null, 2))
} finally {
  await context.close()
  await browser.close()
}
