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

function model(modelId, name, metrics) {
  return {
    modelId,
    name,
    status: 'trained',
    mindsdbModel: `mindsdb_${modelId}`,
    modelType: 'lightgbm',
    metrics,
    version: 2,
    trainedAt: '2026-07-24T10:00:00Z',
    description: `${name} 설명`,
    inputs: [{
      sourceId: `source-${modelId}`,
      sourceName: `주문 원천 ${modelId}(Source)`,
      field: 'amount',
      lag: 1,
      featureName: `amount_lag_${modelId}`,
      importance: 0.7,
      correlationScore: 0.8,
    }],
    outputs: [{
      targetId: `target-${modelId}`,
      targetName: `수요 지표 ${modelId}(Target)`,
      field: 'forecast',
      confidence: 0.9,
    }],
  }
}

const models = [
  model('model-a', '수요 예측 A', '{"rmse":1.23456,"valid":true}'),
  model('model-b', '수요 예측 B', '{broken'),
  model('model-c', '수요 예측 C', '{"r2":0.91}'),
]

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })

try {
  const page = await context.newPage()
  const pageErrors = []
  const modelStatusRequests = []
  const deleteRequests = []
  let modelStatusAttempts = 0
  const deleteAttempts = new Map()

  page.on('pageerror', error => pageErrors.push(error.message))
  await page.addInitScript(() => {
    localStorage.setItem('robo-analyzer-api-key', 'model-manager-test-key')
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
          id: 'model-schema',
          name: '모델 관리 온톨로지',
          updatedAt: '2026-07-24T09:00:00Z',
          hasSchemaJson: true,
        }],
        activeSchemaId: null,
      }),
    }),
  )
  await page.route(
    /\/api\/gateway\/ontology\/schemas\/model-schema\/activate$/,
    route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"success":true,"schemaId":"model-schema","name":"모델 관리 온톨로지"}',
    }),
  )
  await page.route(
    /\/api\/gateway\/ontology\/schemas\/model-schema$/,
    route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'model-schema',
        name: '모델 관리 온톨로지',
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
    /\/api\/gateway\/domain-whatif\/models\/model-schema$/,
    route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        schema_id: 'model-schema',
        models_count: 0,
        models: [],
      }),
    }),
  )
  await page.route(
    /\/api\/gateway\/domain-whatif\/model-status\/model-schema$/,
    route => {
      modelStatusAttempts += 1
      modelStatusRequests.push(route.request())
      if (modelStatusAttempts === 1) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            schema_id: 'model-schema',
            models_count: 0,
            models: [],
          }),
        })
      }
      if (modelStatusAttempts === 3) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"detail":"model list fixture outage"}',
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          schema_id: 'model-schema',
          models_count: models.length,
          models,
        }),
      })
    },
  )
  await page.route(
    /\/api\/gateway\/domain-whatif\/models\/model-schema\/([^/]+)$/,
    route => {
      const modelId = new URL(route.request().url()).pathname.split('/').at(-1)
      const attempt = (deleteAttempts.get(modelId) ?? 0) + 1
      deleteAttempts.set(modelId, attempt)
      deleteRequests.push({
        modelId,
        method: route.request().method(),
        headers: route.request().headers(),
      })
      if (
        (modelId === 'model-a' && attempt === 1)
        || (modelId === 'model-c' && attempt === 1)
      ) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ detail: `${modelId} fixture outage` }),
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, model_id: modelId }),
      })
    },
  )

  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  await openFeature(page, '온톨로지 관리')
  await page.locator('.multi-layer-ontology-viewer').waitFor({ timeout: 30_000 })
  await page.getByRole('button', { name: /온톨로지 목록/ }).click()
  await page.getByRole('button', { name: '모델 관리 온톨로지', exact: true }).click()
  await page.getByRole('button', { name: /What-if 분석/ }).click()
  await page.locator('.whatif-panel').waitFor({ state: 'visible' })
  await page.getByRole('button', { name: /모델 관리/ }).click()

  const manager = page.locator('.step-model-manager')
  await manager.getByText('3개 모델', { exact: true }).waitFor()
  assert(modelStatusAttempts === 2, 'Model manager initial load issued an unexpected request count')

  const modelB = manager.locator('.model-item', { hasText: '수요 예측 B' })
  const modelBExpand = modelB.locator('.model-expand-button')
  await modelBExpand.focus()
  await modelBExpand.press('Enter')
  await modelB.getByText('검증 메트릭 형식을 해석할 수 없습니다.', { exact: true }).waitFor()
  assert(
    await modelBExpand.getAttribute('aria-expanded') === 'true',
    'Keyboard expansion did not expose the model detail',
  )

  await manager.getByRole('button', { name: /새로고침/ }).click()
  const loadError = manager.locator('.error-msg', { hasText: 'model list fixture outage' })
  await loadError.waitFor()
  assert(
    await manager.locator('.model-item').count() === 3,
    'Refresh failure replaced a valid model list',
  )
  await loadError.getByRole('button', { name: '다시 시도' }).click()
  await loadError.waitFor({ state: 'hidden' })
  assert(modelStatusAttempts === 4, 'Model list retry did not repeat only the failed read')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(250)
  await page.screenshot({
    path: join(evidenceDir, 'ontology-model-manager-list-390x844.png'),
    fullPage: true,
  })
  const deleteAllButton = manager.getByRole('button', { name: /전체 삭제/ })
  await deleteAllButton.click()
  const deleteDialog = page.getByRole('alertdialog', { name: '전체 모델 삭제' })
  await deleteDialog.waitFor()
  const mobileGeometry = await page.evaluate(() => {
    const managerRect = document.querySelector('.step-model-manager')?.getBoundingClientRect()
    const modelRect = document.querySelector('.model-item')?.getBoundingClientRect()
    const dialogRect = document.querySelector('.action-dialog')?.getBoundingClientRect()
    const stepNav = document.querySelector('.step-nav')
    const activeStepRect = document.querySelector('.step-btn.active')?.getBoundingClientRect()
    const stepNavRect = stepNav?.getBoundingClientRect()
    const stepLabels = [...document.querySelectorAll('.step-label')].map(label => {
      const rect = label.getBoundingClientRect()
      return {
        text: label.textContent?.trim(),
        width: rect.width,
        height: rect.height,
        whiteSpace: getComputedStyle(label).whiteSpace,
      }
    })
    return {
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      stepNav: stepNav && {
        clientWidth: stepNav.clientWidth,
        scrollWidth: stepNav.scrollWidth,
        left: stepNavRect.left,
        right: stepNavRect.right,
      },
      activeStep: activeStepRect && {
        left: activeStepRect.left,
        right: activeStepRect.right,
      },
      stepLabels,
      manager: managerRect && { left: managerRect.left, right: managerRect.right },
      model: modelRect && { left: modelRect.left, right: modelRect.right },
      dialog: dialogRect && {
        left: dialogRect.left,
        top: dialogRect.top,
        right: dialogRect.right,
        bottom: dialogRect.bottom,
      },
    }
  })
  assert(
    mobileGeometry.documentWidth <= mobileGeometry.viewportWidth + 1
      && mobileGeometry.manager
      && mobileGeometry.model
      && mobileGeometry.dialog
      && mobileGeometry.stepNav
      && mobileGeometry.activeStep
      && mobileGeometry.stepNav.scrollWidth > mobileGeometry.stepNav.clientWidth
      && mobileGeometry.activeStep.left >= mobileGeometry.stepNav.left - 1
      && mobileGeometry.activeStep.right <= mobileGeometry.stepNav.right + 1
      && mobileGeometry.stepLabels.length === 6
      && mobileGeometry.stepLabels.every(label =>
        label.whiteSpace === 'nowrap'
        && label.height <= 24
        && label.width > label.height)
      && mobileGeometry.manager.left >= 0
      && mobileGeometry.manager.right <= mobileGeometry.viewportWidth + 1
      && mobileGeometry.model.left >= 0
      && mobileGeometry.model.right <= mobileGeometry.viewportWidth + 1
      && mobileGeometry.dialog.left >= 0
      && mobileGeometry.dialog.top >= 0
      && mobileGeometry.dialog.right <= mobileGeometry.viewportWidth + 1
      && mobileGeometry.dialog.bottom <= mobileGeometry.viewportHeight + 1,
    `Model manager mobile geometry is clipped: ${JSON.stringify(mobileGeometry)}`,
  )
  await page.screenshot({
    path: join(evidenceDir, 'ontology-model-manager-390x844.png'),
    fullPage: true,
  })
  await page.keyboard.press('Escape')
  await deleteDialog.waitFor({ state: 'hidden' })
  assert(deleteRequests.length === 0, 'Bulk delete cancellation issued a request')
  assert(
    await deleteAllButton.evaluate(element => document.activeElement === element),
    'Bulk delete cancellation did not restore trigger focus',
  )
  await page.setViewportSize({ width: 1920, height: 1080 })

  const modelA = manager.locator('.model-item', { hasText: '수요 예측 A' })
  const modelADelete = modelA.getByRole('button', { name: '수요 예측 A 모델 삭제' })
  await modelADelete.click()
  const singleDialog = page.getByRole('alertdialog', { name: '모델 삭제' })
  await page.keyboard.press('Escape')
  await singleDialog.waitFor({ state: 'hidden' })
  assert(deleteRequests.length === 0, 'Single delete cancellation issued a request')
  assert(
    await modelADelete.evaluate(element => document.activeElement === element),
    'Single delete cancellation did not restore trigger focus',
  )
  await modelADelete.click()
  const singleConfirm = singleDialog.locator('button.danger')
  await singleConfirm.click()
  await singleDialog.getByText('model-a fixture outage', { exact: false }).waitFor()
  assert(await modelA.isVisible(), 'Failed single delete removed its model')
  await singleConfirm.click()
  await singleDialog.waitFor({ state: 'hidden' })
  await modelA.waitFor({ state: 'hidden' })

  await deleteAllButton.click()
  await deleteDialog.waitFor()
  assert(
    (await deleteDialog.locator('p').textContent()).includes('2개 모델'),
    'Bulk dialog did not freeze the remaining model targets',
  )
  const bulkConfirm = deleteDialog.locator('button.danger')
  await bulkConfirm.click()
  await deleteDialog.getByText('model-c fixture outage', { exact: false }).waitFor()
  assert(
    await manager.locator('.model-item').count() === 1
      && await manager.getByText('수요 예측 C', { exact: true }).isVisible()
      && (await deleteDialog.locator('p').textContent()).includes('1개 모델')
      && (await deleteDialog.locator('p').textContent()).includes('실패한 모델만'),
    'Partial bulk delete did not retain only the failed target',
  )
  await bulkConfirm.click()
  await deleteDialog.waitFor({ state: 'hidden' })
  await manager.getByText('등록된 모델이 없습니다.', { exact: true }).waitFor()

  assert(
    deleteRequests.map(request => request.modelId).join(',') ===
      'model-a,model-a,model-b,model-c,model-c',
    `Delete retry targets changed: ${deleteRequests.map(request => request.modelId).join(',')}`,
  )
  assert(
    deleteRequests.every(request =>
      request.method === 'DELETE'
      && request.headers['accept-language'] === 'ko'
      && request.headers['x-llm-api-key'] === 'model-manager-test-key'),
    'Model delete requests lost their method or runtime session headers',
  )
  assert(
    modelStatusRequests.every(request =>
      request.headers()['accept-language'] === 'ko'
      && request.headers()['x-llm-api-key'] === 'model-manager-test-key'),
    'Model status requests lost runtime session headers',
  )
  assert(pageErrors.length === 0, `Model manager page errors: ${pageErrors.join(' | ')}`)
  await page.screenshot({
    path: join(evidenceDir, 'ontology-model-manager-lifecycle-1920x1080.png'),
    fullPage: true,
  })

  console.log('Ontology What-If model-manager browser contracts passed')
} finally {
  await context.close()
  await browser.close()
}
