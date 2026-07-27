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

async function openText2Sql(page) {
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  const button = page.locator('button[title="자연어 질의"]').first()
  await button.waitFor({ state: 'visible', timeout: 15_000 })
  await button.click()
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })

try {
  const actualPage = await context.newPage()
  const [actualHistoryResponse] = await Promise.all([
    actualPage.waitForResponse(
      response => /\/api\/gateway\/text2sql\/history\?/.test(response.url()),
      { timeout: 30_000 },
    ),
    openText2Sql(actualPage),
  ])
  const actualStatus = actualHistoryResponse.status()

  if (actualStatus >= 400) {
    const error = actualPage.locator('.history-error')
    await error.waitFor()
    assert((await error.innerText()).includes('다시 시도'), 'Text2SQL history retry is missing')
    assert(
      !(await actualPage.getByText('히스토리가 없습니다', { exact: true }).isVisible().catch(() => false)),
      'Text2SQL history failure is shown as empty data',
    )
  }

  await actualPage.locator('button[title="직접 입력"]').click()
  await actualPage.getByPlaceholder('SELECT * FROM your_table WHERE condition...').waitFor()
  await actualPage.screenshot({
    path: join(evidenceDir, 'text2sql-actual-direct-mode-1920x1080.png'),
    fullPage: true,
  })

  const emptyPage = await context.newPage()
  let emptyHistoryHeaders
  await emptyPage.route(/\/api\/gateway\/text2sql\/history\?/, route => {
    emptyHistoryHeaders = route.request().headers()
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"items":[],"total":0,"page":1,"page_size":20}',
    })
  })
  await openText2Sql(emptyPage)
  await emptyPage.getByText('히스토리가 없습니다', { exact: true }).waitFor()
  assert(
    !(await emptyPage.locator('.history-error').isVisible().catch(() => false)),
    'Successful empty Text2SQL history is shown as an error',
  )
  assert(emptyHistoryHeaders?.['accept-language'] === 'ko', 'Text2SQL history request is missing session headers')
  const settingsToggle = emptyPage.getByRole('button', { name: '고급 설정' })
  await settingsToggle.focus()
  await emptyPage.keyboard.press('Enter')
  assert(
    await settingsToggle.getAttribute('aria-expanded') === 'true'
      && await emptyPage.locator('#text2sql-advanced-settings').isVisible(),
    'Text2SQL advanced settings did not open from the native keyboard disclosure',
  )
  await emptyPage.keyboard.press('Space')
  await emptyPage.locator('#text2sql-advanced-settings').waitFor({ state: 'detached' })
  assert(
    await settingsToggle.getAttribute('aria-expanded') === 'false'
      && await emptyPage.locator('#text2sql-advanced-settings').count() === 0,
    'Text2SQL advanced settings did not close from the native keyboard disclosure',
  )

  const historyPage = await context.newPage()
  await historyPage.setViewportSize({ width: 390, height: 844 })
  let historyDeleteRequests = 0
  await historyPage.route(/\/api\/gateway\/text2sql\/history\?/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      items: [{
        id: 'history-delete',
        question: '삭제 재시도 대상 주문 조회',
        final_sql: 'SELECT * FROM orders',
        validated_sql: 'SELECT * FROM orders',
        execution_result: null,
        row_count: 1,
        status: 'completed',
        error_message: null,
        steps_count: 1,
        execution_time_ms: 12,
        created_at: '2026-07-23T00:00:00Z',
        updated_at: '2026-07-23T00:00:00Z',
        metadata: null,
        steps: [{ iteration: 1, reasoning: '주문 조회', tool_name: 'query' }],
        tables_used: ['orders'],
      }],
      total: 1,
      page: 1,
      page_size: 20,
    }),
  }))
  await historyPage.route(/\/api\/gateway\/text2sql\/history\/history-delete$/, async route => {
    historyDeleteRequests += 1
    if (historyDeleteRequests === 1) {
      await new Promise(resolve => setTimeout(resolve, 160))
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'history delete unavailable' }),
      })
      return
    }
    await route.fulfill({ status: 204, body: '' })
  })
  await openText2Sql(historyPage)

  const historySelect = historyPage.locator('.item-select')
  await historySelect.focus()
  await historySelect.press('Enter')
  assert(await historySelect.getAttribute('aria-pressed') === 'true', 'history item keyboard selection failed')
  const detailButton = historyPage.locator('.detail-btn')
  await detailButton.focus()
  await detailButton.press('Enter')
  assert(await detailButton.getAttribute('aria-expanded') === 'true', 'history detail keyboard expansion failed')

  const clearAllTrigger = historyPage.locator('[data-history-action="delete-all"]')
  await clearAllTrigger.click()
  const clearAllDialog = historyPage.getByRole('alertdialog', { name: '모든 쿼리 히스토리 삭제' })
  await clearAllDialog.waitFor({ state: 'visible' })
  await historyPage.keyboard.press('Escape')
  await clearAllDialog.waitFor({ state: 'hidden' })
  assert(historyDeleteRequests === 0, 'history delete-all cancel issued a mutation')
  assert(
    await clearAllTrigger.evaluate(element => document.activeElement === element),
    'history delete-all cancel did not restore trigger focus',
  )

  const itemDeleteTrigger = historyPage.locator('[data-history-action="delete-history-delete"]')
  await itemDeleteTrigger.click()
  const itemDeleteDialog = historyPage.getByRole('alertdialog', { name: '쿼리 히스토리 삭제' })
  await itemDeleteDialog.waitFor({ state: 'visible' })
  await historyPage.waitForTimeout(220)
  await historyPage.screenshot({
    path: join(evidenceDir, 'text2sql-history-delete-390x844.png'),
    fullPage: true,
  })
  const overflow = await historyPage.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  assert(overflow <= 1, `Text2SQL history mobile document overflowed by ${overflow}px`)

  await itemDeleteDialog.getByRole('button', { name: '삭제' }).click()
  await historyPage.keyboard.press('Escape')
  assert(
    await itemDeleteDialog.isVisible(),
    'history DELETE pending state allowed Escape to discard the mutation dialog',
  )
  await itemDeleteDialog.getByRole('alert').waitFor({ state: 'visible' })
  assert(historyDeleteRequests === 1, 'history delete failure did not issue exactly one DELETE')
  assert(await historySelect.isVisible(), 'history item changed before delete success')
  await itemDeleteDialog.getByRole('button', { name: '다시 시도' }).click()
  await itemDeleteDialog.waitFor({ state: 'hidden' })
  await historyPage.getByText('히스토리가 없습니다', { exact: true }).waitFor()
  assert(historyDeleteRequests === 2, 'history delete retry did not repeat the same DELETE once')

  const partialPage = await context.newPage()
  const partialPageErrors = []
  const partialConsoleErrors = []
  const partialFailedApiRequests = []
  const partialErrorResponses = []
  let materializedViewRequest
  let bulkCreateRequest
  let schemaListRequestCount = 0
  let schemaDetailRequestCount = 0
  let materializedViewRequestCount = 0
  let bulkCreateRequestCount = 0

  partialPage.on('pageerror', error => partialPageErrors.push(error.message))
  partialPage.on('console', message => {
    if (message.type() === 'error') partialConsoleErrors.push(message.text())
  })
  partialPage.on('requestfailed', request => {
    if (request.url().includes('/api/')) partialFailedApiRequests.push(request.url())
  })
  partialPage.on('response', response => {
    if (response.url().includes('/api/') && response.status() >= 400) {
      partialErrorResponses.push({ status: response.status(), url: response.url() })
    }
  })
  await partialPage.route(/\/api\/gateway\/robo\/graph\/$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ nodes: [], relationships: [] }),
  }))
  await partialPage.route(/\/api\/gateway\/text2sql\/history\?/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      items: [{
        id: 'history-order-monitor',
        question: '최근 주문을 보여줘',
        final_sql: 'SELECT order_id, order_name FROM public.orders ORDER BY order_id',
        validated_sql: 'SELECT order_id, order_name FROM public.orders ORDER BY order_id',
        execution_result: {
          columns: ['order_id', 'order_name'],
          rows: [[101, '첫 주문'], [102, '두 번째 주문']],
          row_count: 2,
          execution_time_ms: 18,
        },
        row_count: 2,
        status: 'completed',
        error_message: null,
        steps_count: 1,
        execution_time_ms: 18,
        created_at: '2026-07-22T00:00:00Z',
        updated_at: '2026-07-22T00:00:00Z',
        metadata: null,
        steps: [{ iteration: 1, reasoning: '주문 목록 조회' }],
        tables_used: ['public.orders'],
      }],
      total: 1,
      page: 1,
      page_size: 20,
    }),
  }))
  await partialPage.route(/\/api\/gateway\/data-fabric\/api\/datasources$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ datasources: [{ name: 'shopmall', engine: 'postgres' }] }),
  }))
  await partialPage.route(/\/api\/gateway\/data-fabric\/api\/datasources\/shopmall\/tables$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ tables: [{ name: 'orders', column_count: 2 }] }),
  }))
  await partialPage.route(/\/api\/gateway\/ontology\/schemas$/, async route => {
    schemaListRequestCount += 1
    if (schemaListRequestCount === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'schema list verification outage' }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        schemas: [{ id: 'commerce-schema', name: 'Commerce', nodeCount: 1 }],
        activeSchemaId: null,
      }),
    })
  })
  await partialPage.route(/\/api\/gateway\/ontology\/schemas\/commerce-schema$/, async route => {
    schemaDetailRequestCount += 1
    if (schemaDetailRequestCount === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'schema detail verification outage' }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'commerce-schema',
        name: 'Commerce',
        nodes: [{ id: 'order-node', name: 'Order', label: 'Entity', description: '주문' }],
        relationships: [],
        labels: [],
      }),
    })
  })
  await partialPage.route(/\/api\/gateway\/text2sql\/direct-sql\/materialized-view$/, async route => {
    materializedViewRequestCount += 1
    materializedViewRequest = route.request().postDataJSON()
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Materialized View verification outage' }),
    })
  })
  await partialPage.route(/\/api\/gateway\/ontology\/instances\/bulk-create$/, async route => {
    bulkCreateRequestCount += 1
    bulkCreateRequest = route.request().postDataJSON()
    if (bulkCreateRequestCount === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'bulk create verification outage' }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ created_count: 2 }),
    })
  })

  await openText2Sql(partialPage)
  await partialPage.locator('.history-item').click()
  const instanceTrigger = partialPage.locator('.ontology-instance-btn')
  await instanceTrigger.click()
  const ontologyModal = partialPage.locator('.ontology-modal')
  await ontologyModal.getByRole('heading', { name: '🔮 감시 에이전트 등록' }).waitFor()
  const closeInstanceDialog = ontologyModal.getByRole('button', { name: '감시 에이전트 등록 닫기' })
  assert(
    await closeInstanceDialog.evaluate(element => document.activeElement === element),
    'Ontology instance dialog did not focus its close action',
  )
  const schemaListError = ontologyModal.locator('.inline-error')
  await schemaListError.waitFor({ state: 'visible' })
  await schemaListError.getByRole('button', { name: '다시 시도' }).click()
  await schemaListError.waitFor({ state: 'hidden' })
  assert(schemaListRequestCount === 2, 'Ontology schema list retry did not repeat the failed read once')
  await partialPage.keyboard.press('Escape')
  await ontologyModal.waitFor({ state: 'hidden' })
  assert(
    await instanceTrigger.evaluate(element => document.activeElement === element),
    'Ontology instance dialog did not restore its trigger focus',
  )

  await instanceTrigger.click()
  await ontologyModal.getByRole('heading', { name: '🔮 감시 에이전트 등록' }).waitFor()

  const selects = ontologyModal.locator('.form-section select')
  await selects.nth(0).selectOption('commerce-schema')
  const schemaDetailError = ontologyModal.locator('.inline-error')
  await schemaDetailError.waitFor({ state: 'visible' })
  await schemaDetailError.getByRole('button', { name: '다시 시도' }).click()
  await schemaDetailError.waitFor({ state: 'hidden' })
  assert(schemaDetailRequestCount === 2, 'Ontology schema detail retry did not repeat the failed read once')
  await selects.nth(1).selectOption('Order')
  await selects.nth(2).selectOption('order_id')
  await selects.nth(3).selectOption('order_name')
  await partialPage.screenshot({
    path: join(evidenceDir, 'text2sql-ontology-instance-1920x1080.png'),
    fullPage: true,
  })

  await partialPage.setViewportSize({ width: 390, height: 844 })
  await partialPage.screenshot({
    path: join(evidenceDir, 'text2sql-ontology-instance-390x844.png'),
    fullPage: true,
  })
  const mobileOverflow = await partialPage.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  assert(mobileOverflow <= 1, `Ontology instance mobile document overflowed by ${mobileOverflow}px`)
  const mobileDialogBox = await ontologyModal.boundingBox()
  assert(
    mobileDialogBox
      && mobileDialogBox.x >= 0
      && mobileDialogBox.x + mobileDialogBox.width <= 391
      && mobileDialogBox.y >= 0
      && mobileDialogBox.y + mobileDialogBox.height <= 845,
    `Ontology instance dialog escaped the mobile viewport: ${JSON.stringify(mobileDialogBox)}`,
  )

  await ontologyModal.getByRole('button', { name: '🔮 인스턴스 생성' }).click()
  const bulkCreateError = ontologyModal.getByRole('alert')
  await bulkCreateError.waitFor({ state: 'visible' })
  assert(
    (await bulkCreateError.innerText()).includes('bulk create verification outage'),
    'Ontology bulk-create failure is not visible in the workflow dialog',
  )
  assert(
    !(await ontologyModal.getByRole('status').isVisible().catch(() => false)),
    'Ontology workflow reported success before bulk-create succeeded',
  )
  await ontologyModal.getByRole('button', { name: '다시 시도' }).click()
  const resultStatus = ontologyModal.getByRole('status')
  await resultStatus.waitFor({ state: 'visible' })
  const resultMessage = await resultStatus.innerText()
  assert(
    resultMessage.includes('2개의 인스턴스가 생성되었습니다.'),
    `Ontology instance success count is missing: ${resultMessage}`,
  )
  assert(
    resultMessage.includes('Materialized View는 생성하지 못했습니다:'),
    `Materialized View partial-failure warning is missing: ${resultMessage}`,
  )
  await ontologyModal.getByRole('button', { name: '완료' }).click()
  await ontologyModal.waitFor({ state: 'hidden' })
  assert(
    await instanceTrigger.evaluate(element => document.activeElement === element),
    'Ontology instance completion did not restore its trigger focus',
  )

  assert(materializedViewRequestCount === 2, `Expected two Materialized View attempts, got ${materializedViewRequestCount}`)
  assert(bulkCreateRequestCount === 2, `Expected one failed and one successful bulk-create, got ${bulkCreateRequestCount}`)
  assert(materializedViewRequest?.datasource === 'shopmall', 'Materialized View request lost the selected datasource')
  assert(
    materializedViewRequest?.source_sql === 'SELECT order_id, order_name FROM public.orders ORDER BY order_id',
    'Materialized View request lost the history SQL',
  )
  assert(bulkCreateRequest?.schema_id === 'commerce-schema', 'Bulk create request lost the ontology schema')
  assert(bulkCreateRequest?.node_type === 'Order', 'Bulk create request lost the ontology node type')
  assert(bulkCreateRequest?.id_column === 'order_id', 'Bulk create request lost the ID mapping')
  assert(bulkCreateRequest?.name_column === 'order_name', 'Bulk create request lost the name mapping')
  assert(bulkCreateRequest?.materialized_view === null, 'Bulk create must explicitly omit the failed Materialized View')
  assert(partialPageErrors.length === 0, `Partial-success page errors: ${partialPageErrors.join(' | ')}`)
  assert(partialFailedApiRequests.length === 0, `Unexpected failed API requests: ${partialFailedApiRequests.join(' | ')}`)
  assert(
    partialErrorResponses.length === 5
      && partialErrorResponses.every(response => response.status === 503)
      && partialErrorResponses.filter(response =>
        response.url.endsWith('/api/gateway/text2sql/direct-sql/materialized-view')).length === 2
      && partialErrorResponses.some(response =>
        response.url.endsWith('/api/gateway/ontology/schemas'))
      && partialErrorResponses.some(response =>
        response.url.endsWith('/api/gateway/ontology/schemas/commerce-schema'))
      && partialErrorResponses.some(response =>
        response.url.endsWith('/api/gateway/ontology/instances/bulk-create')),
    `Unexpected error responses: ${JSON.stringify(partialErrorResponses)}`,
  )
  assert(
    partialConsoleErrors.some(message => message.includes('/api/gateway/text2sql/direct-sql/materialized-view')),
    `Materialized View failure was not observable in the console: ${partialConsoleErrors.join(' | ')}`,
  )

  const feedbackPage = await context.newPage()
  await feedbackPage.setViewportSize({ width: 390, height: 844 })
  await feedbackPage.addInitScript(key => {
    localStorage.setItem(key, '{"unexpected":"shape"}')
  }, 'text2sql_recent_queries')
  let feedbackRequestCount = 0
  let feedbackRequestBody
  await feedbackPage.route(/\/api\/gateway\/robo\/graph\/$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ nodes: [], relationships: [] }),
  }))
  await feedbackPage.route(/\/api\/gateway\/text2sql\/history\?/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ items: [], total: 0, page: 1, page_size: 20 }),
  }))
  let feedbackHistorySaveCount = 0
  await feedbackPage.route(/\/api\/gateway\/text2sql\/history$/, async route => {
    feedbackHistorySaveCount += 1
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'history save verification outage' }),
    })
  })
  await feedbackPage.route(/\/api\/gateway\/data-fabric\/api\/datasources$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ datasources: [{ name: 'shopmall', engine: 'postgres' }] }),
  }))
  await feedbackPage.route(/\/api\/gateway\/data-fabric\/api\/datasources\/shopmall\/tables$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ tables: [{ name: 'orders', column_count: 2 }] }),
  }))
  await feedbackPage.route(/\/api\/gateway\/text2sql\/react$/, route => route.fulfill({
    status: 200,
    contentType: 'application/x-ndjson',
    body: `${JSON.stringify({
      event: 'completed',
      response: {
        status: 'completed',
        final_sql: 'SELECT order_id, order_name FROM public.orders',
        validated_sql: 'SELECT order_id, order_name FROM public.orders',
        execution_result: {
          columns: ['order_id', 'order_name'],
          rows: [[101, '첫 주문']],
          row_count: 1,
          execution_time_ms: 14,
        },
        steps: [],
        collected_metadata: '',
        partial_sql: '',
        remaining_tool_calls: 0,
        session_state: null,
        conversation_state: null,
        question_to_user: null,
        warnings: [],
        from_cache: false,
        feedback_required: true,
      },
      state: {},
    })}\n`,
  }))
  await feedbackPage.route(/\/api\/gateway\/text2sql\/feedback$/, async route => {
    feedbackRequestCount += 1
    feedbackRequestBody = route.request().postDataJSON()
    if (feedbackRequestCount === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'feedback verification outage' }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ feedback_id: 'feedback-1', message: 'saved' }),
    })
  })

  const datasourceResponse = feedbackPage.waitForResponse(
    response => response.url().endsWith('/api/gateway/data-fabric/api/datasources'),
  )
  await openText2Sql(feedbackPage)
  await datasourceResponse
  const feedbackHistoryToggle = feedbackPage.locator('.history-panel .toggle-btn')
  if (await feedbackHistoryToggle.getAttribute('aria-expanded') === 'true') {
    await feedbackHistoryToggle.click()
  }
  await feedbackPage.getByText('저장된 최근 질문을 불러오지 못했습니다.', { exact: true }).waitFor()
  const queryInput = feedbackPage.locator('.chat-input-area textarea')
  await queryInput.fill('최근 주문을 보여줘')
  await queryInput.press('Enter')
  const rejectFeedback = feedbackPage.getByRole('button', { name: '틀려요' })
  await rejectFeedback.waitFor({ state: 'visible' })
  await feedbackPage.getByText(/쿼리는 완료됐지만 히스토리에 저장하지 못했습니다:/).waitFor()
  assert(feedbackHistorySaveCount === 1, 'Completed query did not issue exactly one history save')

  await rejectFeedback.click()
  const feedbackDialog = feedbackPage.getByRole('dialog', { name: '틀린 이유 보내기' })
  await feedbackDialog.waitFor({ state: 'visible' })
  const notesInput = feedbackDialog.getByLabel('틀린 이유 또는 추가 정보 (선택)')
  assert(
    await notesInput.evaluate(element => document.activeElement === element),
    'Feedback dialog did not focus the notes field',
  )
  await feedbackPage.keyboard.press('Escape')
  await feedbackDialog.waitFor({ state: 'hidden' })
  assert(feedbackRequestCount === 0, 'Feedback dialog cancel issued a mutation')
  assert(
    await rejectFeedback.evaluate(element => document.activeElement === element),
    'Feedback dialog cancel did not restore trigger focus',
  )

  await rejectFeedback.click()
  await notesInput.fill('주문 상태 조건이 빠졌습니다.')
  await feedbackPage.waitForTimeout(220)
  await feedbackPage.screenshot({
    path: join(evidenceDir, 'text2sql-feedback-390x844.png'),
    fullPage: true,
  })
  const feedbackOverflow = await feedbackPage.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  assert(feedbackOverflow <= 1, `Text2SQL feedback mobile document overflowed by ${feedbackOverflow}px`)
  const feedbackDialogBox = await feedbackDialog.boundingBox()
  assert(
    feedbackDialogBox
      && feedbackDialogBox.x >= 0
      && feedbackDialogBox.x + feedbackDialogBox.width <= 391
      && feedbackDialogBox.y >= 0
      && feedbackDialogBox.y + feedbackDialogBox.height <= 845,
    `Text2SQL feedback dialog escaped the mobile viewport: ${JSON.stringify(feedbackDialogBox)}`,
  )
  await feedbackDialog.getByRole('button', { name: '보내기' }).click()
  const feedbackError = feedbackDialog.getByRole('alert')
  await feedbackError.waitFor({ state: 'visible' })
  assert(
    (await feedbackError.innerText()).trim().length > 0,
    'Feedback API failure did not produce a visible dialog message',
  )
  assert(await rejectFeedback.isVisible(), 'Feedback was committed before the API succeeded')
  await feedbackDialog.getByRole('button', { name: '다시 시도' }).click()
  await feedbackDialog.waitFor({ state: 'hidden' })
  await feedbackPage.getByText('피드백(틀려요)이 저장되었습니다.', { exact: true }).waitFor()
  assert(feedbackRequestCount === 2, 'Feedback retry did not repeat the same mutation once')
  assert(feedbackRequestBody?.original_sql === 'SELECT order_id, order_name FROM public.orders', 'Feedback lost SQL')
  assert(feedbackRequestBody?.question === '최근 주문을 보여줘', 'Feedback lost the original question')
  assert(feedbackRequestBody?.notes === '주문 상태 조건이 빠졌습니다.', 'Feedback retry lost the notes')
  assert(feedbackRequestBody?.approved === false && feedbackRequestBody?.rating === 1, 'Feedback identity changed')

  console.log(JSON.stringify({
    result: 'passed',
    viewport: '1920x1080',
    actualHistoryStatus: actualStatus,
    verified: [
      'Text2SQL domain lazy loading',
      'history failure differs from empty history',
      'history retry action',
      'history session headers',
      'advanced settings native disclosure Enter/Space and expanded state',
      'history keyboard selection and details',
      'history delete-all cancel identity',
      'history item DELETE failure and exact retry',
      'history mobile overlay geometry',
      'direct SQL mode switch',
      'history result to Ontology instance request mapping',
      'Ontology schema list and detail failure with exact retry',
      'Ontology workflow dialog Escape and focus restoration',
      'Ontology workflow dialog desktop and mobile geometry',
      'Ontology bulk-create failure remains visible until retry succeeds',
      'Materialized View failure continues with null materialized_view',
      'partial success reports both created count and warning without native alert',
      'malformed recent-query storage is visible and safely reset',
      'history-save failure remains a visible non-destructive query warning',
      'feedback cancel, mobile geometry, 503, exact retry, and success commit',
    ],
  }, null, 2))
} finally {
  await context.close()
  await browser.close()
}
