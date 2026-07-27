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
  await button.waitFor({ state: 'visible', timeout: 5_000 })
  await button.click()
}

function snapshot(date = '2026-07-24', value = 10) {
  return {
    success: true,
    date,
    available_dates: ['2026-07-24', '2026-07-25'],
    snapshot: {
      'sales-kpi::amount': value,
      'sales-kpi::volume': 20,
    },
    snapshot_by_node: {
      'sales-kpi': {
        nodeName: '판매 지표(KPI)',
        fields: { amount: value, volume: 20 },
      },
    },
    timeseries: {
      dates: ['2026-07-24', '2026-07-25'],
      'sales-kpi::amount': [10, 12],
      'sales-kpi::volume': [18, 20],
    },
    field_descriptions: {
      amount: '판매 금액',
      volume: '판매량',
      forecast: '예측 매출',
    },
    applied_filters: {},
  }
}

function simulation() {
  return {
    success: true,
    schema_id: 'simulation-schema',
    scenario_name: 'What-if @ 2026-07-25',
    interventions: [{
      node_id: 'sales-kpi',
      field: 'amount',
      value: 15,
      description: 'amount: 12 → 15',
    }],
    traces: [{
      model_id: 'sales-model',
      model_name: '판매 예측 모델',
      inputs: { 'sales-kpi::amount': 15 },
      output_field: 'sales-kpi::forecast',
      baseline_value: 30,
      predicted_value: 36,
      delta: 6,
      pct_change: 20,
      wave: 0,
      effective_day: 0,
      triggered_by: ['sales-kpi::amount'],
    }],
    timeline: {
      0: [{
        model_id: 'sales-model',
        model_name: '판매 예측 모델',
        output_field: 'sales-kpi::forecast',
        baseline_value: 30,
        predicted_value: 36,
        delta: 6,
        pct_change: 20,
        triggered_by: ['sales-kpi::amount'],
      }],
    },
    final_state: { 'sales-kpi::forecast': 36 },
    baseline_state: { 'sales-kpi::forecast': 30 },
    deltas: { 'sales-kpi::forecast': 6 },
    executed_at: '2026-07-24T12:00:00Z',
    propagation_waves: 1,
  }
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })

try {
  const page = await context.newPage()
  const pageErrors = []
  const snapshotRequests = []
  const simulationRequests = []
  const profileRequests = []
  let failedDateAttempts = 0
  let simulationAttempts = 0
  let profileAttempts = 0

  page.on('pageerror', error => pageErrors.push(error.message))
  await page.addInitScript(() => {
    localStorage.setItem('robo-analyzer-api-key', 'simulation-test-key')
    localStorage.removeItem('robo-analyzer-recent-schemas')
  })

  await page.route(/\/api\/gateway\/node-agent-scheduler\/agents$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )
  await page.route(/\/api\/gateway\/ontology\/visual-effects$/, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"effects":{}}',
    }),
  )
  await page.route(/\/api\/gateway\/ontology\/schemas$/, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        schemas: [{
          id: 'simulation-schema',
          name: '시뮬레이션 온톨로지',
          updatedAt: '2026-07-24T09:00:00Z',
          hasSchemaJson: true,
        }],
        activeSchemaId: null,
      }),
    }),
  )
  await page.route(
    /\/api\/gateway\/ontology\/schemas\/simulation-schema\/activate$/,
    route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"success":true,"schemaId":"simulation-schema","name":"시뮬레이션 온톨로지"}',
    }),
  )
  await page.route(
    /\/api\/gateway\/ontology\/schemas\/simulation-schema$/,
    route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'simulation-schema',
        name: '시뮬레이션 온톨로지',
        nodes: [{
          id: 'sales-kpi',
          name: '판매 지표',
          label: 'KPI',
          layer: 'KPI',
          position: { x: 160, y: 160 },
        }],
        relationships: [],
      }),
    }),
  )
  await page.route(
    /\/api\/gateway\/domain-whatif\/model-status\/simulation-schema$/,
    route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        schema_id: 'simulation-schema',
        models_count: 1,
        models: [{
          modelId: 'sales-model',
          name: '판매 예측 모델',
          status: 'trained',
          mindsdbModel: 'sales_prediction_model',
          modelType: 'lightgbm',
          metrics: '{"rmse":1.2}',
          version: 1,
          trainedAt: '2026-07-24T10:00:00Z',
          description: '판매 예측',
          inputs: [{
            sourceId: 'sales-kpi',
            sourceName: '판매 지표',
            field: 'amount',
            lag: 0,
            featureName: 'amount',
            importance: 0.8,
            correlationScore: 0.9,
          }],
          outputs: [{
            targetId: 'sales-kpi',
            targetName: '판매 지표',
            field: 'forecast',
            confidence: 0.9,
          }],
        }],
      }),
    }),
  )
  await page.route(
    /\/api\/gateway\/domain-whatif\/snapshot$/,
    route => {
      const request = route.request()
      const body = request.postDataJSON()
      snapshotRequests.push({
        body,
        headers: request.headers(),
      })
      if (body.date === '2026-07-25') {
        failedDateAttempts += 1
        if (failedDateAttempts === 1) {
          return route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: '{"detail":"snapshot fixture outage"}',
          })
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(snapshot('2026-07-25', 12)),
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(snapshot()),
      })
    },
  )
  await page.route(
    /\/api\/gateway\/domain-whatif\/simulate$/,
    route => {
      const request = route.request()
      simulationAttempts += 1
      simulationRequests.push({
        body: request.postDataJSON(),
        headers: request.headers(),
      })
      if (simulationAttempts === 1) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"detail":"simulation fixture outage"}',
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(simulation()),
      })
    },
  )
  await page.route(
    /\/api\/gateway\/domain-whatif\/scenarios$/,
    route => {
      const request = route.request()
      const body = request.postDataJSON()
      profileAttempts += 1
      profileRequests.push({
        body,
        headers: request.headers(),
      })
      if (profileAttempts === 1) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"detail":"profile fixture outage"}',
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'profile-a',
          name: body.name,
          description: body.description,
          schemaId: body.schemaId,
          interventions: body.interventions,
          created_at: '2026-07-24T12:01:00Z',
          last_simulation_results: body.last_simulation_results,
          outputFields: body.outputFields,
        }),
      })
    },
  )

  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  await openFeature(page, '온톨로지 관리')
  await page.locator('.multi-layer-ontology-viewer').waitFor({ timeout: 30_000 })
  await page.getByRole('button', { name: /온톨로지 목록/ }).click()
  await page.getByRole('button', { name: '시뮬레이션 온톨로지', exact: true }).click()
  await page.getByRole('button', { name: /What-if 분석/ }).click()
  await page.locator('.whatif-panel').waitFor({ state: 'visible' })
  await page.getByRole('button', { name: /기존 모델로 시뮬레이션/ }).click()

  const step = page.locator('.step-simulation')
  const amountInput = step.getByLabel('판매 금액')
  await amountInput.waitFor()
  await amountInput.fill('15')
  await step.getByLabel('스냅샷 시점').selectOption('2026-07-25')
  const snapshotError = step.locator('.error-msg', { hasText: 'snapshot fixture outage' })
  await snapshotError.waitFor()
  assert(
    await step.getByLabel('스냅샷 시점').inputValue() === '2026-07-24',
    'Failed date selection committed before snapshot success',
  )
  assert(
    await amountInput.inputValue() === '15',
    'Failed date selection discarded the last valid draft',
  )
  await snapshotError.getByRole('button', { name: '같은 스냅샷 다시 시도' }).click()
  await page.waitForFunction(() => {
    const select = document.querySelector('#whatif-snapshot-date')
    return select instanceof HTMLSelectElement
      && select.value === '2026-07-25'
      && !select.disabled
  })
  assert(
    await step.getByLabel('스냅샷 시점').inputValue() === '2026-07-25'
      && await amountInput.inputValue() === '12',
    'Successful snapshot retry did not commit the requested date and values',
  )
  assert(
    JSON.stringify(snapshotRequests[2].body) === JSON.stringify(snapshotRequests[1].body),
    'Snapshot retry changed the failed request payload',
  )

  await amountInput.fill('15')
  await step.getByRole('button', { name: /시뮬레이션 실행/ }).click()
  const simulationError = step.locator('.error-msg', { hasText: 'simulation fixture outage' })
  await simulationError.waitFor()
  await simulationError.getByRole('button', { name: '같은 요청 다시 시도' }).click()
  await simulationError.waitFor({ state: 'hidden' })
  await step.getByText('판매 예측 모델', { exact: true }).first().waitFor()
  assert(
    JSON.stringify(simulationRequests[1].body) === JSON.stringify(simulationRequests[0].body),
    'Simulation retry changed the failed request payload',
  )

  await step.getByRole('button', { name: '🔮 프로필로 저장' }).click()
  await step.getByLabel('프로필 이름').fill('비용 상승 감시')
  await step.getByLabel('설명').fill('판매 금액 변화 회귀 계약')
  const profileSubmit = step.locator('.confirm-save-btn')
  await profileSubmit.click()
  await step.getByText('profile fixture outage', { exact: false }).waitFor()
  assert(await profileSubmit.textContent() === '같은 요청 다시 시도', 'Profile retry action was not explicit')
  await profileSubmit.click()
  await step.getByText(/프로필 "비용 상승 감시".*저장되었습니다/).waitFor()
  assert(
    JSON.stringify(profileRequests[1].body) === JSON.stringify(profileRequests[0].body),
    'Profile retry changed the failed request payload',
  )

  await profileSubmit.scrollIntoViewIfNeeded()
  await page.screenshot({
    path: join(evidenceDir, 'ontology-simulation-lifecycle-1920x1080.png'),
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(250)
  const geometry = await page.evaluate(() => {
    const stepRect = document.querySelector('.step-simulation')?.getBoundingClientRect()
    const chartRect = document.querySelector('.chart-section')?.getBoundingClientRect()
    const formRect = document.querySelector('.profile-form')?.getBoundingClientRect()
    const tableScroll = document.querySelector('.summary-table-scroll')
    const tableRect = tableScroll?.getBoundingClientRect()
    const actions = [...document.querySelectorAll('.profile-form .form-actions button')]
      .map(button => {
        const rect = button.getBoundingClientRect()
        return { left: rect.left, right: rect.right, height: rect.height }
      })
    return {
      viewportWidth: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      step: stepRect && { left: stepRect.left, right: stepRect.right },
      chart: chartRect && { left: chartRect.left, right: chartRect.right },
      form: formRect && { left: formRect.left, right: formRect.right },
      table: tableRect && {
        left: tableRect.left,
        right: tableRect.right,
        clientWidth: tableScroll.clientWidth,
        scrollWidth: tableScroll.scrollWidth,
      },
      actions,
    }
  })
  assert(
    geometry.documentWidth <= geometry.viewportWidth + 1
      && geometry.step
      && geometry.chart
      && geometry.form
      && geometry.table
      && geometry.step.left >= 0
      && geometry.step.right <= geometry.viewportWidth + 1
      && geometry.chart.left >= 0
      && geometry.chart.right <= geometry.viewportWidth + 1
      && geometry.form.left >= 0
      && geometry.form.right <= geometry.viewportWidth + 1
      && geometry.table.left >= 0
      && geometry.table.right <= geometry.viewportWidth + 1
      && geometry.table.scrollWidth > geometry.table.clientWidth
      && geometry.actions.length === 2
      && geometry.actions.every(action =>
        action.left >= geometry.form.left - 1
        && action.right <= geometry.form.right + 1
        && action.height >= 44),
    `Simulation mobile geometry is clipped: ${JSON.stringify(geometry)}`,
  )
  await page.screenshot({
    path: join(evidenceDir, 'ontology-simulation-390x844.png'),
    fullPage: true,
  })
  await step.locator('.profile-form').scrollIntoViewIfNeeded()
  await page.screenshot({
    path: join(evidenceDir, 'ontology-simulation-profile-390x844.png'),
    fullPage: true,
  })

  for (const request of [
    ...snapshotRequests,
    ...simulationRequests,
    ...profileRequests,
  ]) {
    assert(
      request.headers['accept-language'] === 'ko'
        && request.headers['x-llm-api-key'] === 'simulation-test-key',
      'Simulation request lost runtime session headers',
    )
  }
  assert(pageErrors.length === 0, `Simulation page errors: ${pageErrors.join(' | ')}`)
  console.log('Ontology What-If simulation browser contracts passed')
} finally {
  await context.close()
  await browser.close()
}
