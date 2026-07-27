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

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })

try {
  const page = await context.newPage()
  const pageErrors = []
  const agentsRequests = []
  let content = '# 판매 지표 에이전트'
  let enabled = false
  let saveAttempts = 0
  let resetAttempts = 0
  let deleteAttempts = 0
  let rewriteAttempts = 0
  let contextAttempts = 0
  let processListAttempts = 0
  let processBehaviorAttempts = 0

  page.on('pageerror', error => pageErrors.push(error.message))
  await page.addInitScript(() => {
    localStorage.setItem('robo-analyzer-api-key', 'agents-md-test-key')
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
          id: 'agents-schema',
          name: '판매 온톨로지',
          updatedAt: '2026-07-24T09:00:00Z',
          hasSchemaJson: true,
        }],
        activeSchemaId: null,
      }),
    }),
  )
  await page.route(
    /\/api\/gateway\/ontology\/schemas\/agents-schema\/activate$/,
    route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"success":true,"schemaId":"agents-schema","name":"판매 온톨로지"}',
    }),
  )
  await page.route(
    /\/api\/gateway\/ontology\/schemas\/agents-schema$/,
    route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'agents-schema',
        name: '판매 온톨로지',
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
    /\/api\/gateway\/domain-whatif\/models\/agents-schema$/,
    route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        schema_id: 'agents-schema',
        models_count: 1,
        models: [{
          modelId: 'sales-score',
          name: '판매 점수 모델',
          status: 'trained',
          metrics: '{"accuracy":0.94}',
          description: '판매 지표 입력 모델',
          inputs: [{
            sourceId: 'sales-kpi',
            sourceName: '판매 지표',
            field: 'region',
          }],
          outputs: [{
            targetId: 'sales-score-output',
            targetName: '판매 점수',
            field: 'score',
          }],
        }],
      }),
    }),
  )
  await page.route(
    /\/api\/gateway\/ontology\/object-types\/[^/]+\/agent-context$/,
    route => {
      contextAttempts += 1
      if (contextAttempts === 1) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"detail":"Agents context fixture outage"}',
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          nodeTypeName: '판매 지표',
          description: '판매 지표 context',
          dataSource: 'warehouse.sales',
          fields: [{ name: 'region', type: 'string', description: '판매 지역' }],
          methods: processBehaviorAttempts >= 2
            ? [{
                name: 'approve_order',
                behaviorType: 'processGPT',
                description: '주문 승인',
              }]
            : [],
          connectedObjects: [],
        }),
      })
    },
  )
  await page.route(
    /\/api\/gateway\/ontology\/object-types\/[^/]+\/agents-md(?:\/rewrite)?$/,
    route => {
      const request = route.request()
      const method = request.method()
      const url = request.url()
      agentsRequests.push({
        method,
        url,
        headers: request.headers(),
        body: request.postDataJSON?.(),
      })
      if (url.endsWith('/rewrite')) {
        rewriteAttempts += 1
        if (rewriteAttempts === 1) {
          return route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: '{"detail":"Agents rewrite fixture outage"}',
          })
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            rewrittenContent: `${request.postDataJSON().currentContent}\n- AI 재작성 완료`,
          }),
        })
      }
      if (method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            nodeTypeName: '판매 지표',
            content,
            enabled,
          }),
        })
      }
      if (method === 'PUT') {
        saveAttempts += 1
        if (saveAttempts === 1) {
          return route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: '{"detail":"Agents save fixture outage"}',
          })
        }
        const body = request.postDataJSON()
        content = body.content
        enabled = body.enabled
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: '{"success":true}',
        })
      }
      if (method === 'POST') {
        resetAttempts += 1
        if (resetAttempts === 1) {
          return route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: '{"detail":"Agents reset fixture outage"}',
          })
        }
        content = '# 서버 템플릿'
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            nodeTypeName: '판매 지표',
            content,
            enabled,
          }),
        })
      }
      deleteAttempts += 1
      if (deleteAttempts === 1) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"detail":"Agents delete fixture outage"}',
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"success":true}',
      })
    },
  )
  await page.route(
    /\/api\/gateway\/agent-scheduler\/profiles\/processgpt\/processes$/,
    route => {
      processListAttempts += 1
      if (processListAttempts === 1) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"detail":"ProcessGPT list fixture outage"}',
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          processes: [{
            id: 'process-approve',
            name: 'Approve Order',
            description: '주문 승인',
          }],
        }),
      })
    },
  )
  await page.route(
    /\/api\/gateway\/ontology\/object-types\/[^/]+\/behaviors$/,
    route => {
      processBehaviorAttempts += 1
      if (processBehaviorAttempts === 1) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"detail":"ProcessGPT Behavior fixture outage"}',
        })
      }
      const behavior = route.request().postDataJSON()
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'ProcessGPT Behavior created',
          behavior,
        }),
      })
    },
  )

  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  await openFeature(page, '온톨로지 관리')
  await page.locator('.multi-layer-ontology-viewer').waitFor({ timeout: 30_000 })
  await page.getByRole('button', { name: /온톨로지 목록/ }).click()
  await page.getByRole('button', { name: '판매 온톨로지', exact: true }).click()
  const node = page.locator('.layer-panel .node-item', { hasText: '판매 지표' })
  await node.waitFor({ state: 'visible' })
  await node.click()
  await page.getByRole('button', { name: /Behavior/ }).click()

  const editor = page.locator('.agents-md-editor')
  const textarea = editor.locator('textarea.md-textarea')
  await textarea.waitFor({ state: 'visible' })
  const contextError = editor.locator('.sidebar-error')
  await contextError.waitFor({ state: 'visible' })
  await contextError.getByRole('button', { name: '다시 시도' }).click()
  await editor.getByText('region', { exact: true }).waitFor()
  assert(contextAttempts === 2, 'Context retry did not repeat only the failed request')

  const connectedModelsGroup = editor.locator('.section-subgroup', {
    hasText: '연결된 모델',
  })
  await connectedModelsGroup.getByText('판매 점수 모델', { exact: true }).waitFor()
  assert(
    await connectedModelsGroup.locator('.subgroup-header').evaluate(element =>
      element.tagName === 'DIV' && !element.hasAttribute('role'),
    )
      && await connectedModelsGroup.getByRole('button', { name: /연결된 모델/ }).count() === 0,
    'Always-visible connected models retained a dead disclosure affordance',
  )

  const visualizationToggle = editor.locator('.builtin-group').filter({
    hasText: 'Visualization',
  }).locator('.subgroup-disclosure')
  const visualizationContentId = await visualizationToggle.getAttribute('aria-controls')
  await visualizationToggle.focus()
  await page.keyboard.press('Enter')
  assert(
    await visualizationToggle.getAttribute('aria-expanded') === 'true'
      && visualizationContentId
      && await editor.locator(`#${visualizationContentId}`).isVisible(),
    'Built-in method disclosure did not open from Enter',
  )
  await page.screenshot({
    path: join(evidenceDir, 'ontology-agents-md-context-disclosures-1920x1080.png'),
    fullPage: true,
  })
  await page.keyboard.press('Space')
  assert(
    await visualizationToggle.getAttribute('aria-expanded') === 'false'
      && visualizationContentId
      && await editor.locator(`#${visualizationContentId}`).count() === 0,
    'Built-in method disclosure did not close from Space',
  )

  const processGroupToggle = editor.locator('.processgpt-group .subgroup-disclosure')
  const processGroupContentId = await processGroupToggle.getAttribute('aria-controls')
  await processGroupToggle.focus()
  await page.keyboard.press('Space')
  assert(
    await processGroupToggle.getAttribute('aria-expanded') === 'true'
      && processGroupContentId
      && await editor.locator(`#${processGroupContentId}`).isVisible(),
    'ProcessGPT disclosure did not open from Space',
  )
  await page.keyboard.press('Enter')
  assert(
    await processGroupToggle.getAttribute('aria-expanded') === 'false'
      && processGroupContentId
      && await editor.locator(`#${processGroupContentId}`).count() === 0,
    'ProcessGPT disclosure did not close from Enter',
  )

  const enabledSwitch = editor.getByRole('switch')
  await enabledSwitch.click()
  const saveError = editor.locator('.error-banner', {
    hasText: 'Agents save fixture outage',
  })
  await saveError.waitFor({ state: 'visible' })
  assert(
    await enabledSwitch.getAttribute('aria-checked') === 'false',
    'Failed enabled save did not restore the switch',
  )
  await saveError.getByRole('button', { name: '다시 시도' }).click()
  await page.waitForFunction(() =>
    document.querySelector('.agents-md-editor .enabled-toggle')
      ?.getAttribute('aria-checked') === 'true',
  )
  const savePayloads = agentsRequests
    .filter(request => request.method === 'PUT')
    .slice(0, 2)
    .map(request => request.body)
  assert(
    saveAttempts === 2
      && savePayloads.every(body =>
        body.content === '# 판매 지표 에이전트' && body.enabled === true),
    'Enabled retry changed the frozen save payload',
  )

  await textarea.fill('# 저장할 판매 지표 에이전트')
  const saveButton = editor.getByRole('button', { name: '💾 저장', exact: true })
  await saveButton.waitFor({ state: 'visible' })
  assert(!(await saveButton.isDisabled()), 'Content save remained disabled after editing')
  await saveButton.click()
  await page.waitForFunction(() =>
    document.querySelector('.agents-md-editor .success-msg')?.textContent
      ?.includes('저장되었습니다'),
  )
  await textarea.fill('# 저장하지 않은 초안')
  const resetButton = editor.getByRole('button', { name: /초기화/ })
  await resetButton.click()
  const resetDialog = page.getByRole('alertdialog', {
    name: 'Agents.md 템플릿 초기화',
  })
  await page.keyboard.press('Escape')
  await resetDialog.waitFor({ state: 'hidden' })
  assert(resetAttempts === 0, 'Reset cancellation issued a request')
  assert(
    await resetButton.evaluate(element => document.activeElement === element),
    'Reset cancellation did not restore trigger focus',
  )
  await resetButton.click()
  const resetConfirm = resetDialog.locator('button.danger')
  assert(
    (await resetConfirm.textContent())?.trim() === '변경 버리고 초기화',
    'Reset dialog exposed the wrong primary action',
  )
  await resetConfirm.click()
  await resetDialog.getByText('Agents reset fixture outage', { exact: true }).waitFor()
  assert(
    await textarea.inputValue() === '# 저장하지 않은 초안',
    'Failed reset discarded the editor draft',
  )
  await resetConfirm.click()
  await resetDialog.waitFor({ state: 'hidden' })
  assert(
    resetAttempts === 2 && await textarea.inputValue() === '# 서버 템플릿',
    'Reset retry did not commit the server template',
  )

  const chatInput = editor.locator('.chat-input')
  await chatInput.fill('점검 규칙을 추가해줘')
  await editor.getByRole('button', { name: '전송', exact: true }).click()
  const rewriteError = editor.locator('.chat-error')
  await rewriteError.waitFor({ state: 'visible' })
  await rewriteError.getByRole('button', { name: '같은 요청 다시 시도' }).click()
  await page.getByText('✅ Agents.md가 수정되었습니다.', { exact: true }).waitFor()
  const rewritePayloads = agentsRequests
    .filter(request => request.url.endsWith('/rewrite'))
    .map(request => request.body)
  assert(
    rewriteAttempts === 2
      && rewritePayloads.every(body =>
        body.prompt === '점검 규칙을 추가해줘'
        && body.currentContent === '# 서버 템플릿')
      && (await textarea.inputValue()).includes('AI 재작성 완료'),
    'Rewrite retry changed the frozen prompt/content',
  )

  const processDialogTrigger = editor.getByTitle('프로세스 메서드 추가')
  await processDialogTrigger.click()
  const processDialog = page.getByRole('dialog', {
    name: '⚙️ ProcessGPT 프로세스 연결',
  })
  assert(
    await processDialog.getByRole('button', { name: 'ProcessGPT 프로세스 연결 닫기' })
      .evaluate(element => element === document.activeElement),
    'ProcessGPT dialog did not own initial focus',
  )
  await processDialog.getByRole('button', { name: '다시 시도' }).click()
  await processDialog.getByRole('button', { name: /Approve Order/ }).click()
  await processDialog.getByLabel(/트리거 조건/).fill('total > 100')
  await processDialog.getByRole('button', { name: /메서드로 추가/ }).click()
  await processDialog.getByText('ProcessGPT Behavior fixture outage', { exact: true }).waitFor()
  assert(
    !(await editor.getByText('process.approve_order', { exact: true }).isVisible().catch(() => false)),
    'Failed Behavior creation committed a local method',
  )
  await processDialog.getByRole('button', { name: '다시 시도' }).click()
  await processDialog.waitFor({ state: 'hidden' })
  assert(
    processListAttempts === 2
      && processBehaviorAttempts === 2
      && (await textarea.inputValue()).includes('@method:process.approve_order'),
    'ProcessGPT retry changed the selected process or trigger condition',
  )

  await processDialogTrigger.click()
  await processDialog.waitFor({ state: 'visible' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(300)
  const geometry = await page.evaluate(() => {
    const dialog = document.querySelector('.process-selector-dialog')?.getBoundingClientRect()
    const viewer = document.querySelector('.multi-layer-ontology-viewer')?.getBoundingClientRect()
    const detail = document.querySelector('.detail-panel')?.getBoundingClientRect()
    const title = document.querySelector('.viewer-header h2')?.getBoundingClientRect()
    return {
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      viewer: viewer && { left: viewer.left, right: viewer.right },
      detail: detail && { left: detail.left, right: detail.right },
      title: title && { width: title.width, height: title.height },
      dialog: dialog && {
        left: dialog.left,
        top: dialog.top,
        right: dialog.right,
        bottom: dialog.bottom,
      },
    }
  })
  assert(
    geometry.documentWidth <= geometry.viewportWidth + 1
      && geometry.dialog
      && geometry.dialog.left >= 0
      && geometry.dialog.top >= 0
      && geometry.dialog.right <= geometry.viewportWidth + 1
      && geometry.dialog.bottom <= geometry.viewportHeight + 1
      && geometry.viewer
      && geometry.detail
      && geometry.detail.left >= geometry.viewer.left - 1
      && geometry.detail.right <= geometry.viewer.right + 1
      && geometry.title
      && geometry.title.width >= 120
      && geometry.title.height <= 32,
    'ProcessGPT dialog or its responsive Ontology shell is clipped on mobile',
  )
  await page.screenshot({
    path: join(evidenceDir, 'ontology-agents-md-process-390x844.png'),
    fullPage: true,
  })
  await page.keyboard.press('Escape')
  await processDialog.waitFor({ state: 'hidden' })
  assert(
    await processDialogTrigger.evaluate(element => element === document.activeElement),
    'ProcessGPT Escape did not restore its trigger focus',
  )
  await page.setViewportSize({ width: 1920, height: 1080 })

  const deleteButton = editor.getByRole('button', { name: /삭제/ })
  await deleteButton.click()
  const deleteDialog = page.getByRole('alertdialog', { name: 'Agents.md 삭제' })
  await page.keyboard.press('Escape')
  await deleteDialog.waitFor({ state: 'hidden' })
  assert(deleteAttempts === 0, 'Delete cancellation issued a request')
  await deleteButton.click()
  const deleteConfirm = deleteDialog.locator('button.danger')
  assert(
    (await deleteConfirm.textContent())?.trim() === 'Agents.md 삭제',
    'Delete dialog exposed the wrong primary action',
  )
  await deleteConfirm.click()
  await deleteDialog.getByText('Agents delete fixture outage', { exact: true }).waitFor()
  await deleteConfirm.click()
  await deleteDialog.waitFor({ state: 'hidden' })
  await editor.getByRole('heading', { name: 'Agents.md 없음' }).waitFor()
  assert(deleteAttempts === 2, 'Delete retry did not preserve its frozen target')

  assert(
    agentsRequests.every(request =>
      request.headers['accept-language'] === 'ko'
      && request.headers['x-llm-api-key'] === 'agents-md-test-key'),
    'Agents.md requests are missing runtime session headers',
  )
  assert(pageErrors.length === 0, `Agents.md page errors: ${pageErrors.join(' | ')}`)
  await page.screenshot({
    path: join(evidenceDir, 'ontology-agents-md-lifecycle-1920x1080.png'),
    fullPage: true,
  })

  await page.setViewportSize({ width: 390, height: 844 })
  const detailPanel = page.locator('.detail-panel')
  await detailPanel.getByRole('button', { name: '노드 상세 닫기' }).click()
  await detailPanel.waitFor({ state: 'hidden' })
  const layerToggle = page.locator('.layer-panel-toggle-btn')
  assert(
    await layerToggle.getAttribute('aria-label') === '레이어 패널 접기',
    'Mobile Ontology layer panel did not expose its collapse action',
  )
  await layerToggle.click()
  await page.waitForFunction(() =>
    document.querySelector('.layer-panel')?.getBoundingClientRect().width <= 45,
  )
  await page.waitForTimeout(200)
  const mobileShell = await page.evaluate(() => {
    const viewer = document.querySelector('.multi-layer-ontology-viewer')?.getBoundingClientRect()
    const layer = document.querySelector('.layer-panel')?.getBoundingClientRect()
    const graph = document.querySelector('.graph-panel')?.getBoundingClientRect()
    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      viewer: viewer && { left: viewer.left, right: viewer.right },
      layer: layer && { left: layer.left, right: layer.right, width: layer.width },
      graph: graph && { left: graph.left, right: graph.right, width: graph.width },
    }
  })
  assert(
    await layerToggle.getAttribute('aria-expanded') === 'false'
      && mobileShell.documentWidth <= mobileShell.viewportWidth + 1
      && mobileShell.viewer
      && mobileShell.layer
      && mobileShell.graph
      && Math.abs(mobileShell.layer.width - 44) <= 1
      && mobileShell.graph.left >= mobileShell.viewer.left - 1
      && mobileShell.graph.right <= mobileShell.viewer.right + 1
      && mobileShell.graph.width >= mobileShell.viewer.right - mobileShell.viewer.left - 1,
    `Mobile Ontology shell did not restore a full-width canvas after closing detail: ${JSON.stringify(mobileShell)}`,
  )
  await page.screenshot({
    path: join(evidenceDir, 'ontology-responsive-shell-390x844.png'),
    fullPage: true,
  })
  await page.setViewportSize({ width: 1920, height: 1080 })

  console.log('Agents.md browser contracts passed')
} finally {
  await context.close()
  await browser.close()
}
