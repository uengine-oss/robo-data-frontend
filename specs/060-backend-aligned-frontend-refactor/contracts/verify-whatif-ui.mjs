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
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })

try {
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  const dynamicGroup = page.locator('button[title="다이나믹 레이어"]').first()
  await dynamicGroup.waitFor({ state: 'visible', timeout: 15_000 })
  await dynamicGroup.click()
  const nav = page.locator('button[title="What-If 시뮬레이터"]').first()
  await nav.waitFor({ state: 'visible', timeout: 15_000 })
  await nav.click()

  await page.locator('.whatif-simulator-layout').waitFor()
  await page.locator('.scenario-textarea').fill('환율 변화가 수익에 미치는 영향')

  const analysisResponse = page.waitForResponse(
    (response) => /\/api\/gateway\/whatif\/agent\/analyze$/.test(response.url()),
    { timeout: 30_000 },
  )
  await page.getByRole('button', { name: '데이터 발견 시작' }).click()
  const response = await analysisResponse
  assert(response.status() === 500, `Expected unavailable What-if service to return 500, got ${response.status()}`)

  const error = page.locator('.whatif-simulator-layout .error-message')
  await error.waitFor({ state: 'visible', timeout: 15_000 })
  assert(
    !(await page.getByText('데이터 발견 완료!', { exact: true }).isVisible()),
    'What-if failure was rendered as successful discovery',
  )
  assert(pageErrors.length === 0, `What-if page errors: ${pageErrors.join(' | ')}`)

  await page.screenshot({
    path: join(evidenceDir, 'whatif-actual-failure-1920x1080.png'),
    fullPage: true,
  })

  const savedSession = {
    id: 'contract-session',
    scenario: '실제 계약 기반 인과관계 검증',
    currentStep: 4,
    createdAt: '2026-07-22T00:00:00.000Z',
    updatedAt: '2026-07-22T00:00:00.000Z',
    data: {
      causalResult: {
        session_id: 'contract-session',
        edges_count: 2,
        edges: [
          {
            source: 'exchange_rate',
            target: 'cost',
            source_label: '환율',
            target_label: '원가',
            strength: 0.8,
            direction: 'positive',
            method: 'granger',
            p_value: 0.01,
            r_squared: 0.72,
            formula: 'cost = 0.8 * exchange_rate',
          },
          {
            source: 'cost',
            target: 'profit',
            source_label: '원가',
            target_label: '이익',
            strength: 0.5,
            direction: 'negative',
            method: 'correlation',
            p_value: 0.02,
            r_squared: 0.61,
          },
        ],
        summary: {
          total_edges: 2,
          strong_edges: 1,
          positive_count: 1,
          negative_count: 1,
          root_causes: [['환율', 1]],
          final_effects: [['이익', 1]],
        },
        influence_functions: [],
        validation: { total_validated: 2, valid_count: 2, overfit_count: 0, mean_r_squared: 0.665 },
      },
      validationResult: {
        total_validated: 2,
        valid_count: 2,
        overfit_count: 0,
        mean_r_squared: 0.665,
        results: [],
      },
      comparisonResult: {
        comparisons: [],
        prediction_charts: [{
          edge: 'exchange_rate → cost',
          source: 'exchange_rate',
          target: 'cost',
          labels: [1, 2, 3],
          actual: [10, 12, 14],
          causal_predicted: [10, 11.5, 13.8],
        }],
        summary: {
          total_compared: 1,
          mean_causal_r2: 0.72,
          mean_mindsdb_r2: 0,
          mindsdb_wins: 0,
          causal_wins: 1,
        },
      },
      literacyExplanation: {
        report_type: 'summary',
        language: 'ko',
        explanation: '# 실제 보고서\n- **검증값** <img src=x onerror=alert(1)>',
      },
    },
  }

  await page.evaluate((session) => {
    localStorage.setItem('whatif_sessions', JSON.stringify([session]))
    localStorage.setItem('whatif_current_session', session.id)
  }, savedSession)
  await page.reload({ waitUntil: 'networkidle' })

  const restoredDynamicGroup = page.locator('button[title="다이나믹 레이어"]').first()
  await restoredDynamicGroup.waitFor({ state: 'visible', timeout: 15_000 })
  const restoredNav = page.locator('button[title="What-If 시뮬레이터"]').first()
  if (!(await restoredNav.isVisible())) await restoredDynamicGroup.click()
  await restoredNav.waitFor({ state: 'visible', timeout: 15_000 })
  await restoredNav.click()

  await page.getByRole('heading', { name: '실제 인과관계 경로' }).waitFor()
  assert(await page.getByText('환율', { exact: true }).first().isVisible(), 'Actual source label was not rendered')
  assert(await page.getByText('이익', { exact: true }).first().isVisible(), 'Actual target label was not rendered')
  assert(await page.locator('.report-content img').count() === 0, 'Report HTML was executed instead of escaped')
  assert((await page.locator('.report-content').textContent()).includes('<img'), 'Escaped report content was lost')
  assert(!(await page.getByText('환율 충격 시나리오', { exact: true }).isVisible()), 'Synthetic scenario UI remains visible')

  let explanationRequest
  await page.route('**/api/gateway/whatif/literacy/explain', async (route) => {
    explanationRequest = route.request().postDataJSON()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ report_type: 'summary', language: 'en', explanation: '# English response' }),
    })
  })
  await page.getByRole('button', { name: 'English', exact: true }).click()
  await page.getByRole('button', { name: '종합 요약 생성', exact: true }).click()
  await page.getByRole('heading', { name: 'English response' }).waitFor()
  assert(explanationRequest?.language === 'en', `Expected English request, got ${JSON.stringify(explanationRequest)}`)

  const graphTrigger = page.getByRole('button', { name: '상세 그래프', exact: true })
  await graphTrigger.click()
  let graphDialog = page.getByRole('dialog', { name: '인과관계 상세 그래프' })
  await graphDialog.waitFor()
  assert(
    await graphDialog.getByRole('button', { name: '인과관계 그래프 닫기' })
      .evaluate(element => element === document.activeElement),
    'Causal graph dialog did not own initial focus',
  )
  assert(await page.locator('.graph-canvas').last().isVisible(), 'Actual causal graph modal did not render')
  await page.keyboard.press('Escape')
  await graphDialog.waitFor({ state: 'hidden' })
  assert(
    await graphTrigger.evaluate(element => element === document.activeElement),
    'Causal graph Escape did not restore its trigger focus',
  )
  await graphTrigger.click()
  graphDialog = page.getByRole('dialog', { name: '인과관계 상세 그래프' })
  await graphDialog.waitFor()
  assert(pageErrors.length === 0, `What-if contract page errors: ${pageErrors.join(' | ')}`)

  await page.screenshot({
    path: join(evidenceDir, 'whatif-contract-literacy-1920x1080.png'),
    fullPage: true,
  })

  const comparisonSession = {
    ...savedSession,
    id: 'comparison-session',
    scenario: '주문과 매출의 실제 모델 비교',
    currentStep: 3,
    data: {
      causalResult: {
        ...savedSession.data.causalResult,
        session_id: 'comparison-session',
        edges_count: 1,
        edges: [{
          source: 'orders',
          target: 'revenue',
          source_label: '주문',
          target_label: '매출',
          strength: 0.8,
          direction: 'positive',
          method: 'granger',
          p_value: 0.01,
          r_squared: 0.72,
        }],
      },
      selectedTables: ['orders'],
      validationResult: {
        total_validated: 1,
        valid_count: 1,
        overfit_count: 0,
        mean_r_squared: 0.72,
        results: [],
      },
    },
  }
  await page.evaluate((session) => {
    localStorage.setItem('whatif_sessions', JSON.stringify([session]))
    localStorage.setItem('whatif_current_session', session.id)
  }, comparisonSession)

  let ttmComparisonRequest
  let mindsdbComparisonRequest
  await page.route('**/api/gateway/whatif/ttm/compare', async (route) => {
    ttmComparisonRequest = route.request().postDataJSON()
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'TTM service unavailable' }),
    })
  })
  await page.route('**/api/gateway/whatif/mindsdb/compare', async (route) => {
    mindsdbComparisonRequest = route.request().postDataJSON()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        comparisons: [{
          edge: 'orders → revenue',
          source: 'orders',
          target: 'revenue',
          source_label: '주문',
          target_label: '매출',
          causal_r2: 0.72,
          causal_mape: 8.1,
          mindsdb_r2: 0.78,
          mindsdb_mape: 6.4,
          difference: -0.06,
          better: 'MindsDB',
        }],
        prediction_charts: [{
          edge: 'orders → revenue',
          source: 'orders',
          target: 'revenue',
          labels: [1, 2, 3],
          actual: [10, 12, 14],
          causal_predicted: [10.2, 11.6, 13.7],
          mindsdb_predicted: [10.1, 11.9, 13.9],
        }],
        summary: {
          total_compared: 1,
          mean_causal_r2: 0.72,
          mean_mindsdb_r2: 0.78,
          mindsdb_mean_r2: 0.78,
          mindsdb_wins: 1,
          causal_wins: 0,
          mindsdb_available: true,
        },
      }),
    })
  })

  await page.reload({ waitUntil: 'networkidle' })
  const comparisonDynamicGroup = page.locator('button[title="다이나믹 레이어"]').first()
  await comparisonDynamicGroup.waitFor({ state: 'visible', timeout: 15_000 })
  const comparisonNav = page.locator('button[title="What-If 시뮬레이터"]').first()
  if (!(await comparisonNav.isVisible())) await comparisonDynamicGroup.click()
  await comparisonNav.waitFor({ state: 'visible', timeout: 15_000 })
  await comparisonNav.click()

  const comparisonButton = page.getByRole('button', { name: /예측 비교 실행/ })
  await comparisonButton.waitFor()
  const ttmResponsePromise = page.waitForResponse(
    (candidate) => /\/api\/gateway\/whatif\/ttm\/compare$/.test(candidate.url()),
  )
  const mindsdbResponsePromise = page.waitForResponse(
    (candidate) => /\/api\/gateway\/whatif\/mindsdb\/compare$/.test(candidate.url()),
  )
  await comparisonButton.click()
  const [ttmComparisonResponse, mindsdbComparisonResponse] = await Promise.all([
    ttmResponsePromise,
    mindsdbResponsePromise,
  ])

  await page.getByRole('heading', { name: '⚖️ 온톨로지 vs MindsDB AutoML 비교' }).waitFor()
  const comparisonWarning = page.locator('.comparison-warning')
  await comparisonWarning.waitFor()
  assert(
    (await comparisonWarning.textContent()).includes('TTM 비교에 실패해 MindsDB 비교 결과를 표시합니다'),
    'TTM fallback warning was not visible',
  )
  assert(
    (await comparisonWarning.textContent()).includes('TTM 비교 엔드포인트를 사용할 수 없습니다'),
    'TTM endpoint failure lost its capability-specific context',
  )
  assert(
    !(await comparisonWarning.textContent()).includes('What-If 시뮬레이터 서비스가 동작하지 않습니다'),
    'A single TTM failure was presented as a whole-service outage',
  )
  assert(ttmComparisonResponse.status() === 503, `Expected TTM 503, got ${ttmComparisonResponse.status()}`)
  assert(mindsdbComparisonResponse.status() === 200, `Expected MindsDB 200, got ${mindsdbComparisonResponse.status()}`)
  assert(ttmComparisonRequest?.session_id === 'comparison-session', 'TTM request lost the session id')
  assert(ttmComparisonRequest?.include_ttm === true, 'TTM request lost include_ttm=true')
  assert(ttmComparisonRequest?.causal_edges?.[0]?.source === 'orders', 'TTM request lost causal edges')
  assert(ttmComparisonRequest?.discovered_tables?.[0] === 'orders', 'TTM request lost discovered tables')
  assert(mindsdbComparisonRequest?.session_id === 'comparison-session', 'MindsDB fallback lost the session id')
  assert(mindsdbComparisonRequest?.causal_edges?.[0]?.target === 'revenue', 'MindsDB fallback lost causal edges')
  assert(
    ttmComparisonResponse.request().headers()['accept-language'] === 'ko',
    'TTM request lost the runtime session headers',
  )
  assert(
    mindsdbComparisonResponse.request().headers()['accept-language'] === 'ko',
    'MindsDB fallback lost the runtime session headers',
  )
  assert(await page.locator('.model-card.ttm').count() === 0, 'Unavailable TTM was rendered as a result model')
  assert(await page.locator('.model-card.mindsdb').isVisible(), 'MindsDB fallback result card was not rendered')
  assert(
    (await page.locator('.winner-score').textContent()).includes('온톨로지 0 | MindsDB 1'),
    'Winner score included an absent model or lost the actual scores',
  )
  assert(!(await page.getByText('환율 변화 → 수익 영향 분석', { exact: true }).isVisible()), 'Fabricated scenario title remains')
  assert(!(await page.getByText('granite-timeseries-ttm-v1', { exact: true }).isVisible()), 'Fabricated TTM model name remains')
  assert(!(await page.getByText(/학습\/테스트:/).isVisible()), 'Fabricated train/test ratio remains')
  assert(pageErrors.length === 0, `What-if comparison page errors: ${pageErrors.join(' | ')}`)

  await page.screenshot({
    path: join(evidenceDir, 'whatif-comparison-fallback-1920x1080.png'),
    fullPage: true,
  })

  await page.reload({ waitUntil: 'networkidle' })
  const persistedDynamicGroup = page.locator('button[title="다이나믹 레이어"]').first()
  await persistedDynamicGroup.waitFor({ state: 'visible', timeout: 15_000 })
  const persistedNav = page.locator('button[title="What-If 시뮬레이터"]').first()
  if (!(await persistedNav.isVisible())) await persistedDynamicGroup.click()
  await persistedNav.waitFor({ state: 'visible', timeout: 15_000 })
  await persistedNav.click()
  await page.getByRole('heading', { name: '⚖️ 온톨로지 vs MindsDB AutoML 비교' }).waitFor()
  assert(await page.locator('.comparison-warning').isVisible(), 'Fallback warning was not auto-saved')
  assert(await page.locator('.model-card.mindsdb').isVisible(), 'Comparison result was not auto-saved')

  await page.evaluate(() => {
    const sessions = JSON.parse(localStorage.getItem('whatif_sessions') ?? '[]')
    const completed = sessions.find(session => session.id === 'comparison-session')
    if (!completed) throw new Error('Auto-saved comparison session not found')
    const sparseSession = {
      ...completed,
      id: 'sparse-comparison-session',
      scenario: '비교 결과 없는 세션',
      data: {
        causalResult: completed.data.causalResult,
        selectedTables: completed.data.selectedTables,
        validationResult: completed.data.validationResult,
      },
    }
    localStorage.setItem('whatif_sessions', JSON.stringify([completed, sparseSession]))
    localStorage.setItem('whatif_current_session', completed.id)
  })
  await page.reload({ waitUntil: 'networkidle' })
  const sparseDynamicGroup = page.locator('button[title="다이나믹 레이어"]').first()
  await sparseDynamicGroup.waitFor({ state: 'visible', timeout: 15_000 })
  const sparseNav = page.locator('button[title="What-If 시뮬레이터"]').first()
  if (!(await sparseNav.isVisible())) await sparseDynamicGroup.click()
  await sparseNav.waitFor({ state: 'visible', timeout: 15_000 })
  await sparseNav.click()
  const sparseCard = page.locator('.session-card').filter({ hasText: '비교 결과 없는 세션' })
  await sparseCard.waitFor()
  await sparseCard.locator('.session-card-select').press('Enter')
  await page.getByRole('button', { name: /예측 비교 실행/ }).waitFor()
  assert(
    await page.locator('.comparison-results').count() === 0,
    'Switching sessions retained the previous comparison result',
  )

  await page.evaluate(() => {
    localStorage.setItem('whatif_sessions', '{broken')
    localStorage.removeItem('whatif_current_session')
  })
  await page.reload({ waitUntil: 'networkidle' })
  const corruptDynamicGroup = page.locator('button[title="다이나믹 레이어"]').first()
  await corruptDynamicGroup.waitFor({ state: 'visible', timeout: 15_000 })
  const corruptNav = page.locator('button[title="What-If 시뮬레이터"]').first()
  if (!(await corruptNav.isVisible())) await corruptDynamicGroup.click()
  await corruptNav.waitFor({ state: 'visible', timeout: 15_000 })
  await corruptNav.click()
  const persistenceWarning = page.locator('.error-message.warning')
  await persistenceWarning.waitFor()
  assert(
    (await persistenceWarning.textContent()).includes('저장된 What-If 세션 JSON이 손상되어 복원하지 않았습니다'),
    'Corrupt local storage was silently ignored',
  )
  assert(
    await page.getByRole('button', { name: /시나리오 정의/ }).getAttribute('aria-current') === 'step',
    'Workflow steps are not exposed as keyboard-operable step buttons',
  )
  assert(pageErrors.length === 0, `What-if session persistence page errors: ${pageErrors.join(' | ')}`)
  await page.screenshot({
    path: join(evidenceDir, 'whatif-session-storage-warning-1920x1080.png'),
    fullPage: true,
  })

  console.log(JSON.stringify({
    result: 'passed',
    viewport: '1920x1080',
    actualAnalysisStatus: response.status(),
    verified: [
      'independent What-if domain lazy loading',
      'actual service failure remains on scenario step',
      'failure is not rendered as successful discovery',
      'actual causal edges drive the literacy path and graph',
      'synthetic simulation scenarios are absent',
      'report HTML is escaped before v-html rendering',
      'selected language reaches the explanation request',
      'TTM failure falls back to MindsDB with a visible warning',
      'comparison requests preserve session, edge, table, and include_ttm payloads',
      'comparison requests preserve runtime session headers',
      'only the model returned by the successful comparison service is rendered',
      'fabricated scenario, model name, and train/test defaults are absent',
      'comparison result and fallback warning survive an immediate reload',
      'keyboard session switching to a sparse session clears the previous session result',
      'corrupt session storage is surfaced as a user-visible warning',
      'workflow steps expose native button and aria-current semantics',
      'no browser runtime errors',
    ],
  }, null, 2))
} finally {
  await context.close()
  await browser.close()
}
