import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../../..')
const require = createRequire(join(repoRoot, '.unittest/package.json'))
const { chromium } = require('playwright')

const baseUrl = process.env.FRONTEND_URL ?? 'http://127.0.0.1:3000'
const deterministic = process.env.DETERMINISTIC_DATA_FABRIC === '1'
const evidenceDir = resolve(here, '../evidence')
const listEndpoint = /\/api\/gateway\/data-fabric\/api\/datasources$/
const tablesEndpoint = /\/api\/gateway\/data-fabric\/api\/datasources\/shopmall\/tables$/

await mkdir(evidenceDir, { recursive: true })

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function waitForAnimations(page) {
  await page.evaluate(async () => {
    const animations = document.getAnimations()
    await Promise.all(animations.map(animation => animation.finished.catch(() => undefined)))
  })
}

async function openDataSources(page) {
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  const navigation = page.locator('button.nav-child[title="데이터 소스"]').first()
  await navigation.waitFor({ state: 'visible', timeout: 15_000 })
  await navigation.click()
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })

try {
  const normalPage = await context.newPage()
  const normalPageErrors = []
  const normalConsoleErrors = []
  const normalResponses = []
  const normalRequestFailures = []
  const createPayloads = []
  const testPayloads = []
  let createRequests = 0
  let deleteRequests = 0
  let testRequests = 0
  let normalDatasources = [{ name: 'shopmall', engine: 'postgres' }]

  normalPage.on('pageerror', (error) => normalPageErrors.push(error.message))
  normalPage.on('console', (message) => {
    if (message.type() === 'error') normalConsoleErrors.push(message.text())
  })
  normalPage.on('response', (response) => {
    if (response.status() >= 400) {
      normalRequestFailures.push({
        status: response.status(),
        url: response.url(),
      })
    }
    if (response.url().includes('/api/gateway/data-fabric/')) {
      normalResponses.push({ status: response.status(), url: response.url() })
    }
  })
  normalPage.on('requestfailed', request => {
    normalRequestFailures.push({
      status: request.failure()?.errorText ?? 'requestfailed',
      url: request.url(),
    })
  })
  if (deterministic) {
    await normalPage.route(/\/api\/gateway\/robo\/graph\/$/, route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ nodes: [], relationships: [] }),
    }))
    await normalPage.route(
      /\/api\/gateway\/data-fabric\/api\/datasources\/shopmall\/health$/,
      route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          name: 'shopmall',
          status: 'healthy',
          message: 'fixture healthy',
          db_connected: true,
          mindsdb_connected: true,
        }),
      }),
    )
    await normalPage.route(
      /\/api\/gateway\/data-fabric\/api\/datasources\/test-connection$/,
      async route => {
        testRequests += 1
        testPayloads.push(route.request().postDataJSON())
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Connection test verification outage' }),
        })
      },
    )
    await normalPage.route(
      /\/api\/gateway\/data-fabric\/api\/datasources\/shopmall$/,
      async route => {
        assert(route.request().method() === 'DELETE', 'Unexpected shopmall detail request')
        deleteRequests += 1
        if (deleteRequests === 1) {
          await route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ detail: 'Delete verification outage' }),
          })
          return
        }
        normalDatasources = normalDatasources.filter(datasource => datasource.name !== 'shopmall')
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'deleted' }),
        })
      },
    )
    await normalPage.route(listEndpoint, async route => {
      if (route.request().method() === 'POST') {
        createRequests += 1
        const payload = route.request().postDataJSON()
        createPayloads.push(payload)
        if (createRequests === 1) {
          await route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ detail: 'Create verification outage' }),
          })
          return
        }
        const datasource = {
          name: payload.name,
          engine: payload.engine,
          display_name: payload.name,
          host: payload.parameters.host,
          database: payload.parameters.database,
        }
        normalDatasources.push(datasource)
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(datasource),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ datasources: normalDatasources }),
      })
    })
    await normalPage.route(tablesEndpoint, route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        tables: [{ name: 'orders', column_count: 2 }],
      }),
    }))
  }

  const listResponse = normalPage.waitForResponse(
    (response) => listEndpoint.test(response.url()),
    { timeout: 20_000 },
  )
  await openDataSources(normalPage)
  assert((await listResponse).status() === 200, 'Data Fabric list request did not return 200')

  await normalPage.getByRole('heading', { name: '데이터 소스', exact: true }).waitFor()
  await normalPage.getByRole('heading', { name: 'shopmall', exact: true }).waitFor()

  const tablesResponse = normalPage.waitForResponse(
    (response) => tablesEndpoint.test(response.url()),
    { timeout: 20_000 },
  )
  const sourceSelect = normalPage.getByRole('button', { name: 'shopmall 데이터 소스 선택' })
  await sourceSelect.focus()
  await normalPage.keyboard.press('Enter')
  assert((await tablesResponse).status() === 200, 'shopmall table request did not return 200')
  await normalPage.getByRole('heading', { name: '실제 DB 테이블', exact: false }).waitFor()

  await normalPage.getByRole('button', { name: '새 연결 추가' }).click()
  await normalPage.getByRole('heading', { name: '새 데이터 소스', exact: true }).waitFor()
  const connectorCount = await normalPage.locator('.type-count').innerText()
  assert(/\d+개의 데이터 소스 유형 사용 가능/.test(connectorCount), 'Connector catalog count is missing')

  await normalPage.screenshot({
    path: join(evidenceDir, 'data-fabric-normal-1920x1080.png'),
    fullPage: true,
  })

  assert(normalPageErrors.length === 0, `Normal page errors: ${normalPageErrors.join(' | ')}`)
  assert(
    normalConsoleErrors.length === 0,
    `Normal console errors: ${normalConsoleErrors.join(' | ')}; requests: ${JSON.stringify(normalRequestFailures)}`,
  )

  const addDialog = normalPage.getByRole('dialog')
  await addDialog.getByRole('button', {
    name: 'PostgreSQL 강력한 오픈소스 관계형 데이터베이스',
    exact: true,
  }).click()
  await addDialog.getByLabel('연결 이름').fill('Contract DB')
  await addDialog.getByLabel('Host').fill('db.internal')
  await addDialog.getByLabel('Port').fill('5544')
  await addDialog.getByLabel('Username').fill('reader')
  await addDialog.getByLabel('Password').fill('secret')
  await addDialog.getByLabel('Database').fill('shop')

  await addDialog.getByRole('button', { name: '연결 테스트' }).click()
  const testFailure = addDialog.getByRole('status')
  await testFailure.waitFor({ state: 'visible' })
  assert(
    (await testFailure.innerText()).includes('Connection test verification outage'),
    'Connection test failure was hidden or replaced',
  )
  assert(testRequests === 1, 'Connection test did not issue exactly one request')
  assert(
    JSON.stringify(testPayloads[0]) === JSON.stringify({
      engine: 'postgres',
      host: 'db.internal',
      port: 5544,
      user: 'reader',
      password: 'secret',
      database: 'shop',
    }),
    `Connection test payload drifted: ${JSON.stringify(testPayloads[0])}`,
  )

  await addDialog.getByRole('button', { name: '연결 생성' }).click()
  const createFailure = addDialog.getByRole('alert')
  await createFailure.waitFor({ state: 'visible' })
  assert(
    (await createFailure.innerText()).includes('Create verification outage'),
    'Create failure was hidden or replaced',
  )
  await addDialog.getByRole('button', { name: '연결 생성' }).click()
  await addDialog.getByRole('heading', { name: '연결 완료!' }).waitFor()
  assert(createRequests === 2, 'Create retry did not issue exactly two POST requests')
  assert(
    JSON.stringify(createPayloads[0]) === JSON.stringify(createPayloads[1]),
    'Create retry changed the submitted payload',
  )
  assert(
    createPayloads[1].name === 'Contract DB'
      && createPayloads[1].engine === 'postgres'
      && createPayloads[1].parameters.host === 'db.internal'
      && createPayloads[1].parameters.port === 5544,
    `Create payload drifted: ${JSON.stringify(createPayloads[1])}`,
  )
  await addDialog.waitFor({ state: 'hidden', timeout: 5_000 })
  assert(
    await normalPage.getByRole('button', { name: '새 연결 추가' }).evaluate(
      element => element === document.activeElement,
    ),
    'Add dialog did not return focus to its trigger',
  )
  await normalPage.getByRole('heading', { name: 'Contract DB', exact: true }).waitFor()

  const shopmallCard = normalPage.getByRole('article').filter({ hasText: 'shopmall' })
  await shopmallCard.hover()
  await shopmallCard.getByRole('button', { name: 'shopmall 데이터 소스 삭제' }).click()
  let deleteDialog = normalPage.getByRole('alertdialog', { name: '데이터 소스 삭제' })
  await deleteDialog.waitFor({ state: 'visible' })
  assert(
    await deleteDialog.getByRole('button', { name: '삭제', exact: true }).evaluate(
      element => element === document.activeElement,
    ),
    'Delete confirmation did not focus the destructive action',
  )
  await normalPage.keyboard.press('Escape')
  await deleteDialog.waitFor({ state: 'hidden' })
  assert(
    await shopmallCard.getByRole('button', { name: 'shopmall 데이터 소스 삭제' }).evaluate(
      element => element === document.activeElement,
    ),
    'Delete cancellation did not return focus to its trigger',
  )
  assert(deleteRequests === 0, 'Escape from delete confirmation issued a DELETE request')

  await shopmallCard.hover()
  await shopmallCard.getByRole('button', { name: 'shopmall 데이터 소스 삭제' }).click()
  deleteDialog = normalPage.getByRole('alertdialog', { name: '데이터 소스 삭제' })
  await deleteDialog.getByRole('button', { name: '삭제', exact: true }).click()
  const deleteFailure = deleteDialog.getByRole('alert')
  await deleteFailure.waitFor({ state: 'visible' })
  assert(
    (await deleteFailure.innerText()).includes('Delete verification outage'),
    'Delete failure was hidden or closed the confirmation',
  )
  await deleteDialog.getByRole('button', { name: '삭제', exact: true }).click()
  await deleteDialog.waitFor({ state: 'hidden' })
  assert(deleteRequests === 2, 'Delete failure retry did not issue exactly two requests')
  await normalPage.locator('.source-card .source-name', { hasText: 'shopmall' }).waitFor({
    state: 'hidden',
  })

  await normalPage.setViewportSize({ width: 390, height: 844 })
  await normalPage.getByRole('button', { name: '새 연결 추가' }).click()
  const mobileDialog = normalPage.getByRole('dialog')
  await mobileDialog.waitFor({ state: 'visible' })
  await waitForAnimations(normalPage)
  const catalogGeometry = await normalPage.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]')
    if (!(dialog instanceof HTMLElement)) throw new Error('Mobile add dialog missing')
    const rect = dialog.getBoundingClientRect()
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      dialogOverflow: dialog.scrollWidth - dialog.clientWidth,
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }
  })
  assert(
    catalogGeometry.left >= 0
      && catalogGeometry.right <= 390
      && catalogGeometry.top >= 0
      && catalogGeometry.bottom <= 844
      && catalogGeometry.dialogOverflow <= 1
      && catalogGeometry.pageOverflow <= 1,
    `Mobile connector dialog overflowed: ${JSON.stringify(catalogGeometry)}`,
  )
  await normalPage.screenshot({
    path: join(evidenceDir, 'data-fabric-catalog-390x844.png'),
    fullPage: true,
  })

  await mobileDialog.getByRole('button', {
    name: 'PostgreSQL 강력한 오픈소스 관계형 데이터베이스',
    exact: true,
  }).click()
  const mobileActions = mobileDialog.locator('.form-actions')
  await mobileActions.scrollIntoViewIfNeeded()
  const formGeometry = await normalPage.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]')
    const actions = dialog?.querySelector('.form-actions')
    if (!(dialog instanceof HTMLElement) || !(actions instanceof HTMLElement)) {
      throw new Error('Mobile connection form missing')
    }
    const dialogRect = dialog.getBoundingClientRect()
    const actionRect = actions.getBoundingClientRect()
    return {
      dialogLeft: dialogRect.left,
      dialogRight: dialogRect.right,
      actionLeft: actionRect.left,
      actionRight: actionRect.right,
      actionTop: actionRect.top,
      actionBottom: actionRect.bottom,
      viewportHeight: window.innerHeight,
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }
  })
  assert(
    formGeometry.actionLeft >= formGeometry.dialogLeft
      && formGeometry.actionRight <= formGeometry.dialogRight
      && formGeometry.actionTop >= 0
      && formGeometry.actionBottom <= formGeometry.viewportHeight
      && formGeometry.pageOverflow <= 1,
    `Mobile connection actions were clipped: ${JSON.stringify(formGeometry)}`,
  )
  await normalPage.screenshot({
    path: join(evidenceDir, 'data-fabric-form-390x844.png'),
    fullPage: true,
  })
  await normalPage.keyboard.press('Escape')
  await mobileDialog.waitFor({ state: 'hidden' })
  assert(
    await normalPage.getByRole('button', { name: '새 연결 추가' }).evaluate(
      element => element === document.activeElement,
    ),
    'Mobile add dialog did not return focus to its trigger',
  )

  const failurePage = await context.newPage()
  const failurePageErrors = []
  failurePage.on('pageerror', (error) => failurePageErrors.push(error.message))
  await failurePage.route(listEndpoint, async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Data Fabric verification outage' }),
    })
  })

  await openDataSources(failurePage)
  const alert = failurePage.getByRole('alert')
  await alert.getByRole('heading', { name: '데이터 소스를 불러오지 못했습니다' }).waitFor()
  assert(
    (await alert.innerText()).includes('Data Fabric verification outage'),
    'Failure detail is not visible to the user',
  )
  assert(
    !(await failurePage.getByText('등록된 데이터 소스가 없습니다', { exact: true }).isVisible().catch(() => false)),
    'Failure is incorrectly presented as an empty data source list',
  )

  await failurePage.screenshot({
    path: join(evidenceDir, 'data-fabric-failure-1920x1080.png'),
    fullPage: true,
  })

  await failurePage.unroute(listEndpoint)
  if (deterministic) {
    await failurePage.route(listEndpoint, route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        datasources: [{ name: 'shopmall', engine: 'postgres' }],
      }),
    }))
  }
  const retryResponse = failurePage.waitForResponse(
    (response) => listEndpoint.test(response.url()),
    { timeout: 20_000 },
  )
  await alert.getByRole('button', { name: '다시 시도' }).click()
  assert((await retryResponse).status() === 200, 'Retry request did not recover with 200')
  await failurePage.getByRole('heading', { name: 'shopmall', exact: true }).waitFor()
  assert(failurePageErrors.length === 0, `Failure page errors: ${failurePageErrors.join(' | ')}`)

  const tableFailurePage = await context.newPage()
  const tableFailurePageErrors = []
  let tableRequests = 0
  tableFailurePage.on('pageerror', error => tableFailurePageErrors.push(error.message))
  await tableFailurePage.route(listEndpoint, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      datasources: [{ name: 'shopmall', engine: 'postgres' }],
    }),
  }))
  await tableFailurePage.route(
    /\/api\/gateway\/data-fabric\/api\/datasources\/shopmall\/health$/,
    route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        name: 'shopmall',
        status: 'healthy',
        message: 'fixture healthy',
        db_connected: true,
        mindsdb_connected: true,
      }),
    }),
  )
  await tableFailurePage.route(tablesEndpoint, route => {
    tableRequests += 1
    if (tableRequests === 1) {
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Table catalog verification outage' }),
      })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        tables: [{ name: 'orders', column_count: 2 }],
      }),
    })
  })
  await openDataSources(tableFailurePage)
  await tableFailurePage.getByRole('button', { name: 'shopmall 데이터 소스 선택' }).click()
  const detailPanel = tableFailurePage.locator('.detail-panel')
  const tableFailureAlert = detailPanel.getByRole('alert')
  await tableFailureAlert.waitFor({ state: 'visible' })
  assert(
    (await tableFailureAlert.innerText()).includes('Table catalog verification outage'),
    'Table failure lost its operation-specific detail',
  )
  assert(
    await tableFailurePage.locator('.source-card .source-name', {
      hasText: 'shopmall',
    }).isVisible(),
    'Table failure replaced the successful datasource catalog',
  )
  assert(
    !(await detailPanel.getByText('테이블이 없습니다', {
      exact: true,
    }).isVisible().catch(() => false)),
    'Table failure was presented as a successful empty table list',
  )
  await tableFailurePage.waitForTimeout(400)
  await tableFailurePage.screenshot({
    path: join(evidenceDir, 'data-fabric-table-failure-1920x1080.png'),
    fullPage: true,
  })
  await tableFailureAlert.getByRole('button', { name: '다시 시도' }).click()
  await detailPanel.getByText('orders', { exact: true }).waitFor()
  assert(tableRequests === 2, 'Table retry did not issue exactly one new request')
  assert(
    tableFailurePageErrors.length === 0,
    `Table failure page errors: ${tableFailurePageErrors.join(' | ')}`,
  )

  console.log(JSON.stringify({
    result: 'passed',
    viewports: ['1920x1080', '390x844'],
    normalMode: deterministic ? 'deterministic' : 'live',
    connectorCount,
    normalResponses,
    verified: [
      'gateway list response and shopmall rendering',
      'shopmall table detail request',
      'connector modal catalog',
      'keyboard datasource selection and focus restoration',
      'connection test failure with exact payload',
      'create failure and same-form retry with exact payload',
      'delete Escape, failure, retry, and success',
      'mobile connector catalog and connection form geometry',
      'honest 503 failure state',
      'successful retry recovery',
      'table failure remains separate from datasource list and retries in place',
    ],
  }, null, 2))
} finally {
  await context.close()
  await browser.close()
}
