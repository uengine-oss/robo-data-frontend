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

const metadata = cubeName => ({
  name: cubeName,
  fact_table: `dw.fact_${cubeName.toLowerCase()}`,
  dimensions: [{
    name: 'Time',
    table: 'dw.dim_time',
    foreign_key: 'time_id',
    levels: [{ name: 'Month', column: 'month' }],
  }],
  measures: [{ name: 'Revenue', column: 'revenue', agg: 'SUM' }],
  joins: [],
})

const etlConfig = cubeName => ({
  cube_name: cubeName,
  fact_table: `dw.fact_${cubeName.toLowerCase()}`,
  dimension_tables: ['dw.dim_time'],
  source_tables: ['public.orders'],
  mappings: [],
  dw_schema: 'dw',
  sync_mode: 'full',
  incremental_column: null,
})

async function installShellRoutes(page) {
  await page.route(/\/api\/gateway\/robo\/graph\/?$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '{"nodes":[],"relationships":[]}',
  }))
}

async function openOlap(page) {
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  const button = page.locator('button[title="OLAP 분석"]').first()
  await button.waitFor({ state: 'visible', timeout: 15_000 })
  await button.click()
  await page.getByRole('heading', { name: 'OLAP 분석' }).waitFor()
}

async function verifyDeletion(context) {
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await installShellRoutes(page)

  let cubes = ['SalesCube', 'InventoryCube']
  let singleDeleteCalls = 0
  let allDeleteCalls = 0
  let singleEtlCleanupCalls = 0
  let allEtlCleanupCalls = 0
  let dwDeleteCalls = 0
  let dwDeleteBody = null

  await page.route(/\/api\/gateway\/olap\/api\/cubes$/, async route => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ cubes }),
      })
    }
    allDeleteCalls += 1
    if (allDeleteCalls === 1) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"success":false,"message":"all cube mutation rejected"}',
      })
    }
    cubes = []
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"success":true}',
    })
  })
  await page.route(/\/api\/gateway\/olap\/api\/cube\/([^/]+)\/metadata$/, route => {
    const cubeName = decodeURIComponent(route.request().url().match(/\/cube\/([^/]+)\/metadata$/)[1])
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(metadata(cubeName)),
    })
  })
  await page.route(/\/api\/gateway\/olap\/api\/cube\/SalesCube$/, route => {
    singleDeleteCalls += 1
    if (singleDeleteCalls === 1) {
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"detail":"single cube fixture outage"}',
      })
    }
    cubes = cubes.filter(cube => cube !== 'SalesCube')
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"success":true}',
    })
  })
  await page.route(/\/api\/gateway\/olap\/api\/etl\/config\/SalesCube$/, route => {
    singleEtlCleanupCalls += 1
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"success":false,"message":"ETL cleanup fixture rejected"}',
    })
  })
  await page.route(/\/api\/gateway\/olap\/api\/etl\/configs$/, route => {
    allEtlCleanupCalls += 1
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"success":true}',
    })
  })
  await page.route(/\/api\/gateway\/olap\/api\/etl\/dw\/tables\/delete$/, async route => {
    dwDeleteCalls += 1
    dwDeleteBody = route.request().postDataJSON()
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"success":true}',
    })
  })

  await openOlap(page)
  const managerTrigger = page.locator('.btn-manage')
  await managerTrigger.click()
  const manager = page.getByRole('dialog', { name: '큐브 관리' })
  await manager.waitFor()
  assert(
    await manager.getByRole('button', { name: '큐브 관리 닫기' })
      .evaluate(element => element === document.activeElement),
    'cube manager did not own initial focus',
  )
  const salesItem = manager.locator('.cube-item').filter({ hasText: 'SalesCube' })
  const salesDelete = salesItem.getByRole('button', { name: /삭제/ })
  await salesDelete.click()
  let action = page.getByRole('alertdialog', { name: /SalesCube.*삭제/ })
  await action.getByRole('button', { name: '취소' }).click()
  assert(singleDeleteCalls === 0, 'single-cube cancel sent a DELETE request')
  assert(await salesDelete.evaluate(element => element === document.activeElement),
    'single-cube cancel did not restore delete trigger focus')
  await page.keyboard.press('Escape')
  await manager.waitFor({ state: 'hidden' })
  assert(
    await managerTrigger.evaluate(element => element === document.activeElement),
    'cube manager Escape did not restore its toolbar trigger focus',
  )
  await managerTrigger.click()
  await manager.waitFor()

  await salesDelete.click()
  action = page.getByRole('alertdialog', { name: /SalesCube.*삭제/ })
  await action.getByRole('button', { name: '삭제' }).click()
  await action.getByRole('button', { name: '다시 시도' }).waitFor()
  assert(singleDeleteCalls === 1, 'single-cube failure request count is incorrect')
  assert(await salesItem.isVisible(), 'cube disappeared before primary deletion succeeded')
  assert(singleEtlCleanupCalls === 0, 'ETL cleanup ran after failed primary deletion')
  assert(dwDeleteCalls === 0, 'single-cube deletion inferred and sent a DW deletion')
  await page.screenshot({
    path: join(evidenceDir, 'olap-delete-error-390x844.png'),
    fullPage: true,
  })

  await action.getByRole('button', { name: '다시 시도' }).click()
  await action.waitFor({ state: 'detached' })
  await page.getByRole('alert').filter({ hasText: '일부 후속 작업에 실패' }).waitFor()
  assert(singleDeleteCalls === 2, 'single-cube retry did not preserve the exact target')
  assert(singleEtlCleanupCalls === 1, 'single-cube ETL cleanup count is incorrect')
  assert(dwDeleteCalls === 0, 'single-cube deletion sent a DW deletion after success')
  assert(!(await salesItem.isVisible().catch(() => false)), 'deleted cube remains in the manager')

  await manager.getByRole('button', { name: /모든 큐브 삭제/ }).click()
  action = page.getByRole('alertdialog', { name: '모든 큐브 삭제' })
  const deleteDwOption = action.getByRole('checkbox', { name: /DW 스키마의 모든 테이블/ })
  await deleteDwOption.check()
  await action.getByRole('button', { name: '삭제' }).click()
  await action.getByRole('button', { name: '다시 시도' }).waitFor()
  assert(allDeleteCalls === 1, 'all-cube success:false was not retained as a failed mutation')
  assert(allEtlCleanupCalls === 0 && dwDeleteCalls === 0,
    'cleanup ran before all-cube primary mutation success')
  await action.getByRole('button', { name: '다시 시도' }).click()
  await action.waitFor({ state: 'detached' })
  assert(allDeleteCalls === 2, 'all-cube retry count is incorrect')
  assert(allEtlCleanupCalls === 1, 'all ETL config cleanup count is incorrect')
  assert(dwDeleteCalls === 1, 'explicit all-DW cleanup did not run exactly once')
  assert(JSON.stringify(dwDeleteBody) === JSON.stringify({ tables: [], schema_name: 'dw' }),
    `all-DW cleanup payload changed: ${JSON.stringify(dwDeleteBody)}`)
  assert(!(await manager.isVisible().catch(() => false)), 'manager stayed open after successful all-cube deletion')

  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - window.innerWidth,
    body: document.body.scrollWidth - window.innerWidth,
  }))
  assert(overflow.document <= 1 && overflow.body <= 1,
    `OLAP mobile deletion overflow: ${JSON.stringify(overflow)}`)
  await page.screenshot({
    path: join(evidenceDir, 'olap-delete-success-390x844.png'),
    fullPage: true,
  })
  assert(pageErrors.length === 0, `OLAP deletion page errors: ${pageErrors.join(' | ')}`)
  await page.close()

  return {
    singleDeleteCalls,
    singleEtlCleanupCalls,
    singleDwDeleteCalls: 0,
    allDeleteCalls,
    allEtlCleanupCalls,
    dwDeleteCalls,
  }
}

async function verifyProvisioning(context) {
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await installShellRoutes(page)

  let cubes = []
  const counts = {
    dwSchema: 0,
    provision: 0,
    schemaUpload: 0,
    etlConfig: 0,
    deploy: 0,
    run: 0,
  }

  await page.route(/\/api\/gateway\/olap\/api\/cubes$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ cubes }),
  }))
  await page.route(/\/api\/gateway\/olap\/api\/cube\/([^/]+)\/metadata$/, route => {
    const cubeName = decodeURIComponent(route.request().url().match(/\/cube\/([^/]+)\/metadata$/)[1])
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(metadata(cubeName)),
    })
  })
  await page.route(/\/api\/gateway\/olap\/api\/etl\/catalog(?:\?.*)?$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '{"tables":[],"relationships":[],"schemas":[],"total_tables":0}',
  }))
  await page.route(/\/api\/gateway\/olap\/api\/etl\/schema\/create$/, route => {
    counts.dwSchema += 1
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' })
  })
  await page.route(/\/api\/gateway\/olap\/api\/etl\/provision$/, route => {
    counts.provision += 1
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"success":true,"steps":[],"errors":[],"tables_created":["fact_sales"]}',
    })
  })
  await page.route(/\/api\/gateway\/olap\/api\/schema\/upload-text$/, route => {
    counts.schemaUpload += 1
    cubes = ['SalesCube']
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ schema_name: 'SalesCubeSchema', cubes: [metadata('SalesCube')] }),
    })
  })
  await page.route(/\/api\/gateway\/olap\/api\/etl\/config$/, route => {
    counts.etlConfig += 1
    const config = route.request().postDataJSON()
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: counts.etlConfig > 1,
        config,
      }),
    })
  })
  await page.route(/\/api\/gateway\/olap\/api\/airflow\/etl\/SalesCube\/deploy$/, route => {
    counts.deploy += 1
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"success":true,"cube_name":"SalesCube","dag_id":"sales-dag","airflow_url":"http://airflow.local/dags/sales-dag"}',
    })
  })
  await page.route(/\/api\/gateway\/olap\/api\/airflow\/etl\/SalesCube\/run$/, route => {
    counts.run += 1
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: counts.run === 1
        ? '{"success":false,"error":"initial run fixture rejected"}'
        : '{"success":true,"dag_id":"sales-dag","state":"queued"}',
    })
  })

  await openOlap(page)
  await page.getByRole('button', { name: '큐브 설계' }).click()
  await page.getByRole('button', { name: 'Visual Modeler' }).click()
  await page.getByRole('button', { name: /샘플 템플릿/ }).click()
  const provisionButton = page.getByRole('button', { name: /큐브 업로드.*배포/ }).last()

  await provisionButton.click()
  await page.locator('.designer-messages .message.error').filter({ hasText: 'ETL 설정 저장' }).waitFor()
  assert(JSON.stringify(counts) === JSON.stringify({
    dwSchema: 1,
    provision: 1,
    schemaUpload: 1,
    etlConfig: 1,
    deploy: 0,
    run: 0,
  }), `provisioning continued after success:false: ${JSON.stringify(counts)}`)

  await provisionButton.click()
  await page.locator('.designer-messages .message.warning')
    .filter({ hasText: 'initial run fixture rejected' }).waitFor()
  assert(JSON.stringify(counts) === JSON.stringify({
    dwSchema: 1,
    provision: 1,
    schemaUpload: 1,
    etlConfig: 2,
    deploy: 1,
    run: 1,
  }), `checkpoint retry repeated completed provisioning: ${JSON.stringify(counts)}`)

  await provisionButton.click()
  await page.locator('.designer-messages .message.success')
    .filter({ hasText: '프로비저닝 완료' }).waitFor()
  assert(counts.run === 2, 'initial ETL retry did not run exactly once')
  assert(counts.dwSchema === 1 && counts.provision === 1 && counts.schemaUpload === 1
    && counts.etlConfig === 2 && counts.deploy === 1,
  `initial ETL retry repeated prior mutations: ${JSON.stringify(counts)}`)
  assert(await page.locator('.provision-progress li.completed').count() === 6,
    'provision progress does not show all six completed steps')
  await page.screenshot({
    path: join(evidenceDir, 'olap-provision-resume-1920x1080.png'),
    fullPage: true,
  })
  assert(pageErrors.length === 0, `OLAP provisioning page errors: ${pageErrors.join(' | ')}`)
  await page.close()
  return counts
}

async function verifyPivotLifecycle(context) {
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await installShellRoutes(page)

  let configLoads = 0
  let scriptLoads = 0
  let scriptSaves = 0
  let dagDeploys = 0
  let scriptExecutions = 0
  let agentGenerations = 0
  const saveBodies = []
  const saveHeaders = []
  const streamHeaders = []
  const agentHeaders = []

  await page.route(/\/api\/gateway\/olap\/api\/cubes$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '{"cubes":["SalesCube"]}',
  }))
  await page.route(/\/api\/gateway\/olap\/api\/cube\/SalesCube\/metadata$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(metadata('SalesCube')),
  }))
  await page.route(/\/api\/gateway\/olap\/api\/etl\/config\/SalesCube$/, route => {
    configLoads += 1
    return route.fulfill({
      status: configLoads === 1 ? 503 : 200,
      contentType: 'application/json',
      body: configLoads === 1
        ? '{"detail":"ETL config fixture outage"}'
        : JSON.stringify(etlConfig('SalesCube')),
    })
  })
  await page.route(/\/api\/gateway\/olap\/api\/etl\/script\/load\/SalesCube$/, route => {
    scriptLoads += 1
    return route.fulfill({
      status: scriptLoads === 1 ? 503 : 200,
      contentType: 'application/json',
      body: scriptLoads === 1
        ? '{"detail":"saved script fixture outage"}'
        : '{"exists":true,"code":"print(1)","filename":"etl_sales.py","saved_at":"2026-07-23T00:00:00Z"}',
    })
  })
  await page.route(/\/api\/gateway\/olap\/api\/etl\/script\/save\/SalesCube$/, async route => {
    scriptSaves += 1
    saveBodies.push(route.request().postDataJSON())
    saveHeaders.push(route.request().headers())
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: scriptSaves === 1
        ? '{"success":false}'
        : '{"success":true,"metadata":{"saved_at":"2026-07-24T00:00:00Z"}}',
    })
  })
  await page.route(
    /\/api\/gateway\/olap\/api\/etl\/generate-script-stream\/SalesCube$/,
    async route => {
      agentGenerations += 1
      agentHeaders.push(route.request().headers())
      await new Promise(resolvePromise => setTimeout(resolvePromise, 350))
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: [
          'data: {"type":"code","code":"print(\\"late generation\\")","complete":true}',
          '',
          'data: {"type":"complete","message":"late generation complete"}',
          '',
          '',
        ].join('\n'),
      }).catch(() => {})
    },
  )
  await page.route(/\/api\/gateway\/olap\/api\/airflow\/etl\/SalesCube\/deploy\?force=true$/, route => {
    dagDeploys += 1
    return route.fulfill({
      status: dagDeploys === 1 ? 503 : 200,
      contentType: 'application/json',
      body: dagDeploys === 1
        ? '{"detail":"DAG deploy fixture outage"}'
        : '{"success":true,"cube_name":"SalesCube","dag_id":"sales-dag"}',
    })
  })
  await page.route(
    /\/api\/gateway\/olap\/api\/etl\/script\/execute-with-retry\/SalesCube\?.*$/,
    route => {
      scriptExecutions += 1
      streamHeaders.push(route.request().headers())
      if (scriptExecutions === 1) {
        return new Promise(resolvePromise => {
          setTimeout(resolvePromise, 350)
        }).then(() => route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: 'data: {"type":"complete","message":"late execution complete","success":true}\n\n',
        }).catch(() => {}))
      }
      return route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: 'data: {"type":"log","message":"execution started"}\n\n',
      })
    },
  )

  await openOlap(page)
  const editTrigger = page.getByRole('button', { name: /큐브 편집/ })
  await editTrigger.click()
  const editor = page.getByRole('dialog', { name: /SalesCube/ })
  await editor.waitFor()
  assert(
    await editor.getByRole('button', { name: '큐브 편집기 닫기' })
      .evaluate(element => element === document.activeElement),
    'OLAP editor did not own initial focus',
  )
  await editor.getByRole('button', { name: /ETL 설정/ }).click()
  const etlLoadError = editor.locator('.etl-load-error')
  await etlLoadError.filter({ hasText: 'ETL config fixture outage' }).waitFor()
  await etlLoadError.getByRole('button', { name: '다시 시도' }).click()
  await etlLoadError.waitFor({ state: 'detached' })
  assert(configLoads === 2, 'ETL config retry count is incorrect')

  await editor.getByRole('button', { name: /ETL 스크립트/ }).click()
  const scriptLoadError = editor.locator('.script-load-error')
  await scriptLoadError.filter({ hasText: 'saved script fixture outage' }).waitFor()
  await scriptLoadError.getByRole('button', { name: '다시 시도' }).click()
  await scriptLoadError.waitFor({ state: 'detached' })
  assert(scriptLoads === 2, 'saved script retry count is incorrect')

  const saveButton = editor.locator('.btn-save')
  await saveButton.click()
  const saveRetry = editor.getByRole('button', { name: '같은 저장 다시 시도' })
  await saveRetry.waitFor()
  assert(scriptSaves === 1, 'script save failure request count is incorrect')
  await saveRetry.click()
  await saveRetry.waitFor({ state: 'detached' })
  assert(scriptSaves === 2, 'script save exact retry count is incorrect')
  assert(JSON.stringify(saveBodies[0]) === JSON.stringify(saveBodies[1]),
    `script save retry changed body: ${JSON.stringify(saveBodies)}`)
  assert(saveHeaders.every(headers =>
    headers['x-llm-api-key'] === 'olap-contract-key'
    && headers['accept-language'] === 'ko'),
  `script save runtime headers missing: ${JSON.stringify(saveHeaders)}`)

  const dagTrigger = editor.getByRole('button', { name: /DAG 배포/ })
  await dagTrigger.click()
  let action = page.getByRole('alertdialog', { name: 'Airflow DAG 재배포' })
  await action.getByRole('button', { name: '취소' }).click()
  assert(dagDeploys === 0, 'DAG cancel sent a mutation')
  assert(await dagTrigger.evaluate(element => element === document.activeElement),
    'DAG cancel did not restore trigger focus')

  await dagTrigger.click()
  action = page.getByRole('alertdialog', { name: 'Airflow DAG 재배포' })
  await action.getByRole('button', { name: 'DAG 재배포' }).click()
  await action.getByRole('button', { name: '다시 시도' }).waitFor()
  assert(dagDeploys === 1, 'DAG failure request count is incorrect')
  await action.getByRole('button', { name: '다시 시도' }).click()
  await action.waitFor({ state: 'detached' })
  assert(dagDeploys === 2, 'DAG retry request count is incorrect')

  const executeButton = editor.locator('.btn-execute-main')
  await executeButton.click()
  await editor.getByRole('button', { name: /전체 재적재/ }).click()
  action = page.getByRole('alertdialog', { name: 'ETL 전체 재적재' })
  await action.getByRole('button', { name: '취소' }).click()
  assert(scriptExecutions === 0, 'full reload cancel opened a stream')

  await executeButton.click()
  await editor.getByRole('button', { name: /전체 재적재/ }).click()
  action = page.getByRole('alertdialog', { name: 'ETL 전체 재적재' })
  await action.getByRole('button', { name: '전체 재적재' }).click()
  await editor.locator('.script-execution .btn-cancel').click()
  await editor.locator('.execution-result.cancelled').waitFor()
  await page.waitForTimeout(450)
  assert(scriptExecutions === 1, 'cancelled execution request count is incorrect')
  assert(await editor.locator('.execution-result.cancelled').isVisible(),
    'late execution complete replaced the cancelled result')
  assert(!(await editor.getByText('late execution complete', { exact: true }).isVisible().catch(() => false)),
    'late execution complete was rendered after cancellation')

  await executeButton.click()
  await editor.getByRole('button', { name: /전체 재적재/ }).click()
  action = page.getByRole('alertdialog', { name: 'ETL 전체 재적재' })
  await action.getByRole('button', { name: '전체 재적재' }).click()
  await editor.locator('.message.error')
    .filter({ hasText: '완료 이벤트 없이 종료' }).waitFor()
  assert(scriptExecutions === 2, 'full reload terminal-less stream request count is incorrect')
  assert(await editor.locator('.log-status.failed').isVisible(),
    'terminal-less stream stayed running or was shown as completed')
  assert(streamHeaders.every(headers =>
    headers['x-llm-api-key'] === 'olap-contract-key'
    && headers['accept-language'] === 'ko'),
  `OLAP fetch-SSE headers missing: ${JSON.stringify(streamHeaders)}`)

  const generationRequest = page.waitForRequest(
    /\/api\/gateway\/olap\/api\/etl\/generate-script-stream\/SalesCube$/,
  )
  await editor.getByRole('button', { name: /ETL 스크립트 생성/ }).click()
  await generationRequest
  await editor.getByRole('button', { name: '생성 취소' }).click()
  await editor.locator('.status-badge.cancelled').waitFor()
  await page.waitForTimeout(450)
  assert(agentGenerations === 1, 'agent generation cancel request count is incorrect')
  assert((await editor.locator('.status-badge').textContent()) === 'CANCELLED',
    'late generation complete replaced cancelled status')
  assert(!(await editor.getByText('late generation complete', { exact: true }).isVisible().catch(() => false)),
    'late generation complete log was rendered after cancellation')
  assert(agentHeaders[0]['x-llm-api-key'] === 'olap-contract-key'
    && agentHeaders[0]['accept-language'] === 'ko',
  `OLAP agent stream headers missing: ${JSON.stringify(agentHeaders[0])}`)

  await page.setViewportSize({ width: 390, height: 844 })
  const editorBox = await editor.boundingBox()
  assert(editorBox && editorBox.x >= 0 && editorBox.y >= 0
    && editorBox.x + editorBox.width <= 391
    && editorBox.y + editorBox.height <= 845,
  `OLAP editor exceeds mobile viewport: ${JSON.stringify(editorBox)}`)
  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - window.innerWidth,
    body: document.body.scrollWidth - window.innerWidth,
  }))
  assert(overflow.document <= 1 && overflow.body <= 1,
    `OLAP editor mobile overflow: ${JSON.stringify(overflow)}`)
  const editorHeaderLayout = await editor.locator('.modal-header').evaluate((header) => {
    const titleElement = header.querySelector('#olap-cube-editor-title')
    const title = titleElement?.getBoundingClientRect()
    const tabs = [...header.querySelectorAll('.editor-tab')].map(tab => {
      const box = tab.getBoundingClientRect()
      return { left: box.left, right: box.right, top: box.top, width: box.width }
    })
    const headerBox = header.getBoundingClientRect()
    return {
      header: { left: headerBox.left, right: headerBox.right },
      titleBottom: title?.bottom ?? 0,
      titleText: titleElement?.textContent?.trim() ?? '',
      titleWidth: title?.width ?? 0,
      titleScrollWidth: titleElement?.scrollWidth ?? 0,
      titleColor: titleElement ? getComputedStyle(titleElement).color : '',
      tabs,
    }
  })
  assert(editorHeaderLayout.tabs.length === 3
    && editorHeaderLayout.tabs.every(tab =>
      tab.left >= editorHeaderLayout.header.left
      && tab.right <= editorHeaderLayout.header.right + 1
      && tab.width >= 90
      && tab.top >= editorHeaderLayout.titleBottom),
  `OLAP editor tabs are clipped or collapse on mobile: ${JSON.stringify(editorHeaderLayout)}`)
  assert(editorHeaderLayout.titleText === '✏️ SalesCube'
    && editorHeaderLayout.titleWidth + 1 >= editorHeaderLayout.titleScrollWidth
    && editorHeaderLayout.titleColor !== 'rgba(0, 0, 0, 0)',
  `OLAP editor title is missing or clipped on mobile: ${JSON.stringify(editorHeaderLayout)}`)
  const scriptSectionLayout = await editor.evaluate((dialog) => {
    const box = selector => dialog.querySelector(selector)?.getBoundingClientRect()
    const codePanel = box('.code-panel')
    const actions = box('.code-panel .script-actions')
    const execution = box('.script-execution')
    const executionLog = box('.execution-live-log')
    return {
      codePanel: codePanel && {
        left: codePanel.left,
        right: codePanel.right,
        top: codePanel.top,
        bottom: codePanel.bottom,
      },
      actions: actions && {
        left: actions.left,
        right: actions.right,
        top: actions.top,
        bottom: actions.bottom,
      },
      execution: execution && {
        left: execution.left,
        right: execution.right,
        top: execution.top,
        bottom: execution.bottom,
      },
      executionLog: executionLog && {
        left: executionLog.left,
        right: executionLog.right,
        top: executionLog.top,
        bottom: executionLog.bottom,
      },
    }
  })
  assert(scriptSectionLayout.codePanel
    && scriptSectionLayout.actions
    && scriptSectionLayout.execution
    && scriptSectionLayout.executionLog,
  `OLAP script mobile sections are missing: ${JSON.stringify(scriptSectionLayout)}`)
  assert(scriptSectionLayout.actions.left >= scriptSectionLayout.codePanel.left
    && scriptSectionLayout.actions.right <= scriptSectionLayout.codePanel.right + 1
    && scriptSectionLayout.actions.bottom <= scriptSectionLayout.codePanel.bottom + 1,
  `OLAP script actions escape the code panel: ${JSON.stringify(scriptSectionLayout)}`)
  assert(scriptSectionLayout.codePanel.bottom <= scriptSectionLayout.execution.top + 1,
    `OLAP code panel overlaps execution section: ${JSON.stringify(scriptSectionLayout)}`)
  assert(scriptSectionLayout.executionLog.left >= scriptSectionLayout.execution.left
    && scriptSectionLayout.executionLog.right <= scriptSectionLayout.execution.right + 1
    && scriptSectionLayout.executionLog.bottom <= scriptSectionLayout.execution.bottom + 1,
  `OLAP execution log escapes its section: ${JSON.stringify(scriptSectionLayout)}`)
  await page.screenshot({
    path: join(evidenceDir, 'olap-editor-stream-failure-390x844.png'),
    fullPage: true,
  })

  await page.keyboard.press('Escape')
  await editor.waitFor({ state: 'detached' })
  assert(await editTrigger.evaluate(element => element === document.activeElement),
    'OLAP editor Escape did not restore trigger focus')
  assert(pageErrors.length === 0, `OLAP pivot page errors: ${pageErrors.join(' | ')}`)
  await page.close()
  return {
    configLoads,
    scriptLoads,
    scriptSaves,
    dagDeploys,
    scriptExecutions,
    agentGenerations,
  }
}

const browser = await chromium.launch({ headless: true })
const desktopContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
await desktopContext.addInitScript(() => {
  localStorage.setItem('robo-analyzer-api-key', 'olap-contract-key')
})
const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
await mobileContext.addInitScript(() => {
  localStorage.setItem('robo-analyzer-api-key', 'olap-contract-key')
})

try {
  const deletion = await verifyDeletion(mobileContext)
  const provisioning = await verifyProvisioning(desktopContext)
  const pivot = await verifyPivotLifecycle(desktopContext)
  console.log(JSON.stringify({
    result: 'passed',
    verified: [
      'single-cube cancel and 503 exact retry without inferred DW deletion',
      'all-cube success:false and explicit all-DW cleanup',
      'same-input provisioning resumes after the failed step',
      'initial ETL partial failure retries without repeating deployed resources',
      'ETL config and saved-script load failures remain visible and retryable',
      'script success:false keeps an exact frozen save retry target',
      'DAG cancel and 503 exact retry',
      'execution cancel rejects late completion and terminal-less EOF remains failure',
      'agent generation cancel rejects late completion',
      'script HTTP and fetch-SSE runtime headers',
      'OLAP destructive/editor mobile geometry and focus return',
    ],
    deletion,
    provisioning,
    pivot,
  }, null, 2))
} finally {
  await mobileContext.close()
  await desktopContext.close()
  await browser.close()
}
