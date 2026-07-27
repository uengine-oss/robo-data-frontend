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
  const nodeSchedulerRequests = []
  const ontologyRequests = []
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('request', request => {
    if (/\/api\/gateway\/(?:ontology|domain-whatif)\//.test(request.url())) {
      ontologyRequests.push(request.headers())
    }
  })
  await page.addInitScript(() => localStorage.setItem('robo-analyzer-api-key', 'node-agent-test-key'))
  await page.route(/\/api\/gateway\/node-agent-scheduler\/agents$/, async route => {
    const request = route.request()
    nodeSchedulerRequests.push(request.headers())
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        node_type_name: 'WaterPlant',
        status: 'running',
        started_at: '2026-07-22T10:00:00',
        last_run_at: null,
        run_count: 1,
        last_error: null,
        feedback_queue_size: 0,
        log_count: 2,
      }]),
    })
  })
  await page.route(/\/api\/gateway\/ontology\/visual-effects$/, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"effects":{}}',
    }),
  )
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })

  await openFeature(page, '도메인 스키마')
  await page.locator('.object-type-modeler').waitFor({ timeout: 30_000 }).catch(error => {
    console.error('Captured page errors before ObjectType modeler:', pageErrors)
    throw error
  })
  await page.getByText('ObjectTypes', { exact: true }).waitFor()

  await openFeature(page, '온톨로지 관리')
  await page.locator('.multi-layer-ontology-viewer').waitFor({ timeout: 30_000 })
  await page.getByRole('heading', { name: /온톨로지 관리/ }).waitFor()
  await page.getByText('1개 노드 에이전트 감지', { exact: true }).waitFor()
  await page.screenshot({
    path: join(evidenceDir, 'ontology-workflow-1920x1080.png'),
    fullPage: true,
  })

  await openFeature(page, '오브젝트 탐색기')
  await page.locator('.object-explorer-tab').waitFor({ timeout: 30_000 })

  await openFeature(page, '데이터 품질')
  await page.locator('.capability-page').waitFor({ timeout: 30_000 })
  await page.getByRole('heading', { name: '서비스 연결이 필요합니다', exact: true }).waitFor()

  await openFeature(page, '감시 에이전트')
  await page.locator('.watch-agent-page').waitFor({ timeout: 30_000 })
  await page.screenshot({
    path: join(evidenceDir, 'observability-workflow-1920x1080.png'),
    fullPage: true,
  })

  assert(nodeSchedulerRequests.length > 0, 'Node-local scheduler request was not observed')
  assert(
    nodeSchedulerRequests.every(headers => headers['accept-language'] === 'ko'
      && headers['x-llm-api-key'] === 'node-agent-test-key'),
    'Node-local scheduler request is missing current session headers',
  )
  assert(ontologyRequests.length > 0, 'Ontology API requests were not observed')
  assert(
    ontologyRequests.every(headers => headers['accept-language'] === 'ko'
      && headers['x-llm-api-key'] === 'node-agent-test-key'),
    'Ontology API request is missing current session headers',
  )
  assert(pageErrors.length === 0, `Moved workflow page errors: ${pageErrors.join(' | ')}`)

  const objectTypeFailurePage = await context.newPage()
  const objectTypePageErrors = []
  let objectTypeRequests = 0
  objectTypeFailurePage.on('pageerror', error => objectTypePageErrors.push(error.message))
  await objectTypeFailurePage.route(/\/api\/gateway\/robo\/schema\/tables(?:\?.*)?$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )
  await objectTypeFailurePage.route(/\/api\/gateway\/robo\/schema\/relationships(?:\?.*)?$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )
  await objectTypeFailurePage.route(/\/api\/gateway\/ontology\/object-types$/, route => {
    objectTypeRequests += 1
    if (objectTypeRequests === 1) {
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"detail":"ObjectType fixture outage"}',
      })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        objectTypes: [{
          id: 'order-type',
          name: 'Order',
          description: 'Order contract fixture',
          columns: [{ name: 'id', type: 'integer', description: 'identifier' }],
          behaviors: [],
        }],
        total: 1,
      }),
    })
  })
  await objectTypeFailurePage.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  await openFeature(objectTypeFailurePage, '도메인 스키마')
  const objectTypeError = objectTypeFailurePage.locator('.object-type-list .load-error')
  await objectTypeError.waitFor({ state: 'visible', timeout: 30_000 })
  assert(
    !(await objectTypeFailurePage.getByText('ObjectType이 없습니다', { exact: true }).isVisible().catch(() => false)),
    'ObjectType transport failure is presented as a successful empty list',
  )
  await objectTypeFailurePage.screenshot({
    path: join(evidenceDir, 'object-type-failure-1920x1080.png'),
    fullPage: true,
  })
  await objectTypeError.getByRole('button', { name: '다시 시도' }).click()
  await objectTypeFailurePage.locator('.object-type-item .ot-name', { hasText: 'Order' }).waitFor()
  assert(objectTypeRequests === 2, 'ObjectType retry did not issue exactly one new request')
  assert(objectTypePageErrors.length === 0, `ObjectType failure page errors: ${objectTypePageErrors.join(' | ')}`)
  await objectTypeFailurePage.screenshot({
    path: join(evidenceDir, 'object-type-retry-1920x1080.png'),
    fullPage: true,
  })

  const objectTypeCreationPage = await context.newPage()
  const objectTypeCreationErrors = []
  let objectTypeCreated = false
  let objectTypeListRequests = 0
  let objectTypeCreateRequests = 0
  let relationshipCreateRequests = 0
  let objectTypeCreatePayload
  let relationshipCreatePayload
  let objectTypeReactPayload
  let objectTypeDirectSqlRequests = 0
  let objectTypeDirectSqlPayload
  objectTypeCreationPage.on('pageerror', error => objectTypeCreationErrors.push(error.message))
  await objectTypeCreationPage.route(/\/api\/gateway\/robo\/schema\/tables(?:\?.*)?$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )
  await objectTypeCreationPage.route(/\/api\/gateway\/robo\/schema\/relationships(?:\?.*)?$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )
  await objectTypeCreationPage.route(
    /\/api\/gateway\/data-fabric\/api\/datasources$/,
    route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        datasources: [{ name: 'shopmall', engine: 'postgres', status: 'connected' }],
      }),
    }),
  )
  await objectTypeCreationPage.route(/\/api\/gateway\/ontology\/object-types$/, async route => {
    if (route.request().method() === 'POST') {
      objectTypeCreateRequests += 1
      objectTypeCreatePayload = route.request().postDataJSON()
      objectTypeCreated = true
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'created-order-type',
          name: 'Order',
          description: '주문',
          columns: [
            { name: 'order_id', type: 'string' },
            { name: 'customer_id', type: 'string' },
          ],
        }),
      })
    }

    objectTypeListRequests += 1
    if (objectTypeListRequests === 2) {
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"detail":"ObjectType relation catalog fixture outage"}',
      })
    }
    const objectTypes = [{
      id: 'customer-type',
      name: 'Customer',
      description: '고객',
      columns: [{ name: 'id', type: 'integer' }],
    }]
    if (objectTypeCreated) {
      objectTypes.push({
        id: 'created-order-type',
        name: 'Order',
        description: '주문',
        columns: [
          { name: 'order_id', type: 'string' },
          { name: 'customer_id', type: 'string' },
        ],
      })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ objectTypes, total: objectTypes.length }),
    })
  })
  await objectTypeCreationPage.route(/\/api\/gateway\/ontology\/relationships$/, async route => {
    relationshipCreateRequests += 1
    relationshipCreatePayload = route.request().postDataJSON()
    if (relationshipCreateRequests === 1) {
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"detail":"ObjectType relationship fixture outage"}',
      })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ relationship: relationshipCreatePayload }),
    })
  })
  await objectTypeCreationPage.route(/\/api\/gateway\/text2sql\/react$/, async route => {
    objectTypeReactPayload = route.request().postDataJSON()
    const event = {
      event: 'complete',
      response: {
        status: 'completed',
        final_sql: 'SELECT order_id, customer_id FROM public.orders',
        validated_sql: 'SELECT order_id, customer_id FROM public.orders',
        execution_result: {
          columns: ['order_id', 'customer_id'],
          rows: [[101, 7]],
          row_count: 1,
          execution_time_ms: 12,
        },
        steps: [],
        collected_metadata: '',
        partial_sql: '',
        remaining_tool_calls: 0,
        session_state: null,
        conversation_state: null,
        question_to_user: null,
        warnings: null,
      },
      state: {},
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/x-ndjson',
      body: `${JSON.stringify(event)}\n`,
    })
  })
  await objectTypeCreationPage.route(
    /\/api\/gateway\/text2sql\/direct-sql\/stream$/,
    async route => {
      objectTypeDirectSqlRequests += 1
      objectTypeDirectSqlPayload = route.request().postDataJSON()
      if (objectTypeDirectSqlRequests === 1) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"detail":"ObjectType direct SQL fixture outage"}',
        })
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/x-ndjson',
        body: [
          JSON.stringify({ type: 'columns', data: ['order_id', 'status'] }),
          JSON.stringify({ type: 'row', data: [301, 'paid'] }),
          '',
        ].join('\n'),
      })
    },
  )
  await objectTypeCreationPage.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  await openFeature(objectTypeCreationPage, '도메인 스키마')
  await objectTypeCreationPage.getByTitle('새 ObjectType 생성').click()
  const createObjectTypeDialog = objectTypeCreationPage.getByRole('dialog', {
    name: '새 ObjectType 생성',
  })
  await createObjectTypeDialog.waitFor({ state: 'visible' })
  await createObjectTypeDialog.getByRole('button', {
    name: /자연어로 피지컬 레이어 검색/,
  }).click()
  await createObjectTypeDialog.getByRole('button', {
    name: /연결할 ObjectType 선택/,
  }).click()
  const relationCatalogFailure = createObjectTypeDialog.locator('.object-type-list .catalog-error')
  await relationCatalogFailure.waitFor({ state: 'visible' })
  assert(
    !(await createObjectTypeDialog.getByText(
      '등록된 ObjectType이 없습니다.',
      { exact: true },
    ).isVisible().catch(() => false)),
    'Create ObjectType relation catalog failure was presented as an empty list',
  )
  await objectTypeCreationPage.screenshot({
    path: join(evidenceDir, 'object-type-create-catalog-failure-1920x1080.png'),
    fullPage: true,
  })
  await relationCatalogFailure.getByRole('button', { name: '다시 시도' }).click()
  await createObjectTypeDialog.getByRole('checkbox', { name: /Customer/ }).check()
  const embeddedText2SqlInput = createObjectTypeDialog.locator('.input-wrapper textarea')
  await embeddedText2SqlInput.fill('고객별 주문을 조회해줘')
  await embeddedText2SqlInput.press('Enter')
  await createObjectTypeDialog.locator('.configure-step').waitFor({ state: 'visible' })
  await createObjectTypeDialog.getByLabel(/이름/).fill('Order')
  const relationSelects = createObjectTypeDialog.locator('.relation-config-item select')
  await relationSelects.nth(0).selectOption('id')
  await relationSelects.nth(1).selectOption('customer_id')
  await createObjectTypeDialog.getByRole('button', {
    name: 'ObjectType 생성',
    exact: true,
  }).click()
  await createObjectTypeDialog.getByText(
    'ObjectType은 생성되었지만 관계 1건이 실패했습니다.',
    { exact: true },
  ).waitFor()
  assert(
    objectTypeCreateRequests === 1 && relationshipCreateRequests === 1,
    'Relationship failure repeated the primary ObjectType creation',
  )
  assert(
    await createObjectTypeDialog.getByRole('button', {
      name: 'ObjectType 생성',
      exact: true,
    }).count() === 0,
    'Primary ObjectType creation remained available after partial success',
  )
  await objectTypeCreationPage.screenshot({
    path: join(evidenceDir, 'object-type-relationship-partial-failure-1920x1080.png'),
    fullPage: true,
  })
  await createObjectTypeDialog.getByRole('button', {
    name: '실패한 관계 다시 생성',
  }).click()
  await createObjectTypeDialog.waitFor({ state: 'hidden' })
  await objectTypeCreationPage.locator('.object-type-item .ot-name', {
    hasText: 'Order',
  }).waitFor()
  assert(
    objectTypeCreateRequests === 1
      && relationshipCreateRequests === 2
      && objectTypeReactPayload?.datasource === 'shopmall'
      && objectTypeReactPayload?.linked_object_types?.[0]?.name === 'Customer'
      && objectTypeCreatePayload?.name === 'Order'
      && objectTypeCreatePayload?.dataSourceType === 'natural-language'
      && objectTypeCreatePayload?.query === 'SELECT order_id, customer_id FROM public.orders'
      && objectTypeCreatePayload?.sourceQuestion === '고객별 주문을 조회해줘'
      && relationshipCreatePayload?.sourceType === 'Customer'
      && relationshipCreatePayload?.targetType === 'Order'
      && relationshipCreatePayload?.sourceColumn === 'id'
      && relationshipCreatePayload?.targetColumn === 'customer_id'
      && relationshipCreatePayload?.cardinality === 'ONE_TO_MANY',
    'ObjectType creation or failed-relationship retry changed the workflow payload',
  )
  assert(
    objectTypeCreationErrors.length === 0,
    `ObjectType creation page errors: ${objectTypeCreationErrors.join(' | ')}`,
  )
  await objectTypeCreationPage.screenshot({
    path: join(evidenceDir, 'object-type-relationship-retry-success-1920x1080.png'),
    fullPage: true,
  })

  await objectTypeCreationPage.getByTitle('새 ObjectType 생성').click()
  await createObjectTypeDialog.waitFor({ state: 'visible' })
  await createObjectTypeDialog.getByRole('button', {
    name: /SELECT 문 직접 입력/,
  }).click()
  const objectTypeDatasourceFailure = createObjectTypeDialog.locator(
    '.datasource-selector .catalog-error',
  )
  assert(
    await objectTypeDatasourceFailure.count() === 0,
    'Direct SQL opened with an unrelated Data Fabric error',
  )
  const objectTypeSql = 'SELECT order_id, status FROM shopmall.public.orders'
  await createObjectTypeDialog.getByLabel('ObjectType 생성 SQL').fill(objectTypeSql)
  await createObjectTypeDialog.getByRole('button', {
    name: 'SQL 실행',
    exact: true,
  }).click()
  const objectTypeDirectSqlFailure = createObjectTypeDialog.locator(
    '.sql-input-step .error-message',
  )
  await objectTypeDirectSqlFailure.waitFor({ state: 'visible' })
  assert(
    (await objectTypeDirectSqlFailure.textContent())?.includes(
      'Text2SQL 서비스가 동작하지 않습니다.',
    ),
    `Direct SQL error lost its owning-service context: ${await objectTypeDirectSqlFailure.textContent()}`,
  )
  assert(
    await createObjectTypeDialog.locator('.sql-input-step').isVisible(),
    'Direct SQL failure advanced the ObjectType workflow',
  )
  await objectTypeCreationPage.screenshot({
    path: join(evidenceDir, 'object-type-direct-sql-failure-1920x1080.png'),
    fullPage: true,
  })
  await createObjectTypeDialog.getByRole('button', {
    name: 'SQL 실행',
    exact: true,
  }).click()
  await createObjectTypeDialog.locator('.configure-step').waitFor({ state: 'visible' })
  await createObjectTypeDialog.locator('#object-type-name').fill('DirectOrder')
  await objectTypeCreationPage.screenshot({
    path: join(evidenceDir, 'object-type-direct-sql-result-1920x1080.png'),
    fullPage: true,
  })
  await createObjectTypeDialog.getByRole('button', {
    name: 'ObjectType 생성',
    exact: true,
  }).click()
  await createObjectTypeDialog.waitFor({ state: 'hidden' })
  assert(
    objectTypeDirectSqlRequests === 2
      && objectTypeDirectSqlPayload?.sql === objectTypeSql
      && objectTypeDirectSqlPayload?.datasource === 'shopmall'
      && objectTypeCreateRequests === 2
      && objectTypeCreatePayload?.name === 'DirectOrder'
      && objectTypeCreatePayload?.dataSourceType === 'direct-sql'
      && objectTypeCreatePayload?.query === objectTypeSql
      && objectTypeCreatePayload?.columns?.[0]?.name === 'order_id'
      && objectTypeCreatePayload?.columns?.[1]?.name === 'status',
    'ObjectType direct SQL retry changed datasource, query, result columns, or creation payload',
  )
  assert(
    objectTypeCreationErrors.length === 0,
    `ObjectType direct SQL page errors: ${objectTypeCreationErrors.join(' | ')}`,
  )

  const schemaGenerationPage = await context.newPage()
  const schemaGenerationErrors = []
  let schemaGenerationDatasourceRequests = 0
  let schemaGenerationSchemaRequests = 0
  let schemaGenerationRequests = 0
  let schemaGenerationPayload
  schemaGenerationPage.on('pageerror', error => schemaGenerationErrors.push(error.message))
  await schemaGenerationPage.route(/\/api\/gateway\/node-agent-scheduler\/agents$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )
  await schemaGenerationPage.route(/\/api\/gateway\/ontology\/schemas$/, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"schemas":[],"activeSchemaId":null}',
    }),
  )
  await schemaGenerationPage.route(
    /\/api\/gateway\/text2sql\/meta\/datasources$/,
    route => {
      schemaGenerationDatasourceRequests += 1
      if (schemaGenerationDatasourceRequests === 1) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"detail":"Schema generator datasource fixture outage"}',
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '["warehouse"]',
      })
    },
  )
  await schemaGenerationPage.route(
    /\/api\/gateway\/text2sql\/meta\/datasources\/warehouse\/schemas$/,
    route => {
      schemaGenerationSchemaRequests += 1
      if (schemaGenerationSchemaRequests === 1) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"detail":"Schema generator schema fixture outage"}',
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '["public"]',
      })
    },
  )
  await schemaGenerationPage.route(
    /\/api\/gateway\/ontology\/generate-from-schema$/,
    async route => {
      schemaGenerationRequests += 1
      schemaGenerationPayload = route.request().postDataJSON()
      if (schemaGenerationRequests === 1) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: '{"success":true,"tablesProcessed":1,"relationshipsInferred":0}',
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          tablesProcessed: 1,
          relationshipsInferred: 0,
          schema: {
            id: 'generated-schema',
            name: 'Warehouse Ontology',
            nodes: [{
              id: 'order-node',
              name: 'Order',
              label: 'Entity',
              description: '주문',
            }],
            relationships: [],
            labels: [],
          },
        }),
      })
    },
  )
  await schemaGenerationPage.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  await openFeature(schemaGenerationPage, '온톨로지 관리')
  await schemaGenerationPage.locator('.multi-layer-ontology-viewer').waitFor({ timeout: 30_000 })
  await schemaGenerationPage.getByRole('button', { name: /DB 스키마에서 생성/ }).click()
  const schemaGenerator = schemaGenerationPage.locator('.schema-based-generator')
  await schemaGenerator.waitFor({ state: 'visible' })
  assert(
    await schemaGenerationPage.locator('.generate-dialog > .dialog-footer').count() === 0,
    'Schema generation rendered the document workflow action footer',
  )
  const datasourceFailure = schemaGenerator.locator('.catalog-error')
  await datasourceFailure.waitFor({ state: 'visible' })
  assert(
    !(await schemaGenerator.getByText(
      '사용 가능한 데이터 소스가 없습니다.',
      { exact: true },
    ).isVisible().catch(() => false)),
    'Schema generator datasource failure was presented as an empty list',
  )
  await schemaGenerationPage.screenshot({
    path: join(evidenceDir, 'ontology-schema-generation-datasource-failure-1920x1080.png'),
    fullPage: true,
  })
  await datasourceFailure.getByRole('button', { name: '다시 시도' }).click()
  const warehouseButton = schemaGenerator.getByRole('button', { name: /warehouse/ })
  await warehouseButton.waitFor({ state: 'visible' })
  await warehouseButton.focus()
  await warehouseButton.press('Enter')
  const schemaFailure = schemaGenerator.locator('.catalog-error')
  await schemaFailure.waitFor({ state: 'visible' })
  assert(
    !(await schemaGenerator.getByText(
      '사용 가능한 스키마가 없습니다.',
      { exact: true },
    ).isVisible().catch(() => false)),
    'Schema generator schema failure was presented as an empty list',
  )
  await schemaGenerationPage.screenshot({
    path: join(evidenceDir, 'ontology-schema-generation-schema-failure-1920x1080.png'),
    fullPage: true,
  })
  await schemaFailure.getByRole('button', { name: '다시 시도' }).click()
  const publicSchemaButton = schemaGenerator.getByRole('button', { name: /public/ })
  await publicSchemaButton.waitFor({ state: 'visible' })
  await publicSchemaButton.focus()
  await publicSchemaButton.press('Enter')
  await schemaGenerator.getByLabel('온톨로지 이름').fill('Warehouse Ontology')
  await schemaGenerator.getByRole('button', { name: /온톨로지 생성/ }).click()
  await schemaGenerator.getByText(
    '온톨로지 생성 응답에 적용할 스키마가 없습니다',
    { exact: true },
  ).waitFor()
  assert(
    await schemaGenerationPage.evaluate(() => {
      const app = document.querySelector('#app').__vue_app__
      return app.config.globalProperties.$pinia._s.get('ontology').schema
    }) === null,
    'Schema-less generation success mutated the ontology store',
  )
  await schemaGenerationPage.screenshot({
    path: join(evidenceDir, 'ontology-schema-generation-response-failure-1920x1080.png'),
    fullPage: true,
  })
  await schemaGenerator.getByRole('button', { name: /온톨로지 생성/ }).click()
  await schemaGenerationPage.locator('.generate-dialog').waitFor({ state: 'hidden' })
  assert(
    schemaGenerationDatasourceRequests === 2
      && schemaGenerationSchemaRequests === 2
      && schemaGenerationRequests === 2
      && schemaGenerationPayload?.dbName === 'warehouse'
      && schemaGenerationPayload?.schemaName === 'public'
      && schemaGenerationPayload?.ontologyName === 'Warehouse Ontology'
      && schemaGenerationPayload?.inferCausalRelations === true,
    'Schema generator retry counts or final payload changed',
  )
  assert(
    await schemaGenerationPage.evaluate(() => {
      const app = document.querySelector('#app').__vue_app__
      return app.config.globalProperties.$pinia._s.get('ontology').schema?.name
    }) === 'Warehouse Ontology',
    'Successful schema generation did not apply the returned ontology schema',
  )
  assert(
    !(await schemaGenerationPage
      .getByRole('button', { name: /What-if 분석/ })
      .isDisabled()),
    'Successful schema generation did not commit the returned schema identity to the canvas',
  )
  const generatedResourceLayer = schemaGenerationPage
    .locator('.layer-item')
    .filter({ has: schemaGenerationPage.locator('.layer-name', { hasText: 'Resource' }) })
  assert(
    (await generatedResourceLayer.locator('.layer-count').textContent())?.trim() === '1'
      && await generatedResourceLayer.getByRole('button', { name: 'Order' }).isVisible(),
    'DB schema generation left an unsupported Entity node outside the MultiLayer Resource list',
  )
  assert(
    schemaGenerationErrors.length === 0,
    `Schema generation page errors: ${schemaGenerationErrors.join(' | ')}`,
  )
  await schemaGenerationPage.waitForTimeout(700)
  await schemaGenerationPage.screenshot({
    path: join(evidenceDir, 'ontology-schema-generation-success-1920x1080.png'),
    fullPage: true,
  })

  const ontologyLibraryPage = await context.newPage()
  const ontologyLibraryErrors = []
  let ontologyLibraryRequests = 0
  let ontologyLibraryActivateRequests = 0
  let ontologyLibraryDetailRequests = 0
  let ontologyLibraryRenameRequests = 0
  let ontologyLibraryDeleteRequests = 0
  let ontologyLibrarySchemaName = '판매 온톨로지'
  let ontologyLibrarySchemaDeleted = false
  let nodeDatasourceListRequests = 0
  const objectTypeMetadataRequests = []
  let confirmedNodeDatasource
  let autoLinkDatasourceRequests = 0
  let nodeDatasourceSearchRequests = 0
  const nodeDatasourceDirectSqlRequests = []
  const datasourceConfirmationRequests = []
  const measureObjectTypeRequests = []
  let measureObjectTypeDataRequests = 0
  const ontologySaveRequests = []
  const causalNetworkRequests = []
  const causalAnalysisRequests = []
  const cancelledCausalRequests = []
  const ontologyNodeDataRequests = []
  const cancelledOntologyNodeDataRequests = []
  const ontologyFilterValueRequests = []
  const relationColumnRequests = []
  let relationMeasureColumnAttempts = 0
  let ontologyFilterValueAttempts = 0
  let salesNodeDataAttempts = 0
  let behaviorModelRequests = 0
  const behaviorModelRequestUrls = []
  let releaseCancelledSalesNodeDataRequest
  let releaseCancelledCausalRequest
  let generationGlossaryAttempts = 0
  const documentGenerationRequests = []
  const generationSaveRequests = []
  ontologyLibraryPage.on('pageerror', error => ontologyLibraryErrors.push(error.message))
  ontologyLibraryPage.on('requestfailed', request => {
    if (
      /\/ontology-nodes\/sales-kpi\/data\?/.test(request.url())
      && new URL(request.url()).searchParams.get('limit') !== '1'
    ) {
      cancelledOntologyNodeDataRequests.push(request.url())
      releaseCancelledSalesNodeDataRequest?.()
      releaseCancelledSalesNodeDataRequest = undefined
    }
    if (/\/causal-analysis\/stream$/.test(request.url())) {
      cancelledCausalRequests.push(request.url())
      releaseCancelledCausalRequest?.()
      releaseCancelledCausalRequest = undefined
    }
  })
  await ontologyLibraryPage.route(/\/api\/gateway\/node-agent-scheduler\/agents$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )
  await ontologyLibraryPage.route(
    /\/api\/gateway\/domain-whatif\/models\/library-valid$/,
    route => {
      behaviorModelRequests += 1
      behaviorModelRequestUrls.push(route.request().url())
      if (behaviorModelRequests === 1 || behaviorModelRequests === 3) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"detail":"Behavior model fixture outage"}',
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          schema_id: 'library-valid',
          models_count: 1,
          models: [{
            modelId: 'sales-forecast-model',
            name: '판매 예측 모델',
            status: 'ready',
            mindsdbModel: 'sales_forecast',
            modelType: 'regression',
            metrics: '{"r2":0.91}',
            version: 1,
            trainedAt: '2026-07-23T09:00:00Z',
            description: '판매 KPI 예측',
            inputs: [{
              sourceId: 'sales-driver',
              sourceName: '판매 동인',
              field: 'driver_value',
              lag: 0,
              featureName: 'driver_value',
              importance: 0.8,
              correlationScore: 0.7,
            }],
            outputs: [{
              targetId: 'sales-kpi',
              targetName: '판매 지표',
              field: 'sales',
              confidence: 0.91,
            }],
          }],
        }),
      })
    },
  )
  await ontologyLibraryPage.route(
    /\/api\/gateway\/ontology\/object-types\/%ED%8C%90%EB%A7%A4%20%EC%A7%80%ED%91%9C\/agents-md$/,
    route => route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }),
  )
  await ontologyLibraryPage.route(
    /\/api\/gateway\/ontology\/object-types\/%ED%8C%90%EB%A7%A4%20%EC%A7%80%ED%91%9C\/agent-context$/,
    route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        nodeTypeName: '판매 지표',
        description: '',
        dataSource: '',
        fields: [],
        methods: [],
        connectedObjects: [],
      }),
    }),
  )
  await ontologyLibraryPage.route(
    /\/api\/gateway\/agent-scheduler\/profiles\/processgpt\/processes$/,
    route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"processes":[]}',
    }),
  )
  await ontologyLibraryPage.route(/\/api\/gateway\/robo\/glossary\/(?:\?.*)?$/, route => {
    generationGlossaryAttempts += 1
    if (generationGlossaryAttempts === 1) {
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"detail":"Generation glossary fixture outage"}',
      })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        glossaries: [{
          id: 'generation-glossary',
          name: '생성 표준 용어집',
          description: 'fixture',
          type: 'business',
          termCount: 3,
        }],
      }),
    })
  })
  await ontologyLibraryPage.route(
    /\/api\/gateway\/ontology\/generate-multi-layer$/,
    async route => {
      documentGenerationRequests.push({
        body: route.request().postDataJSON(),
        headers: route.request().headers(),
      })
      if (documentGenerationRequests.length === 1) {
        await new Promise(resolvePromise => setTimeout(resolvePromise, 350))
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"detail":"Document generation fixture outage"}',
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/x-ndjson',
        body: [
          JSON.stringify({ event: 'start' }),
          JSON.stringify({
            event: 'complete',
            data: {
              success: true,
              schema: {
                name: 'Generated Fixture',
                nodes: [
                  {
                    id: 'sales-kpi',
                    name: '판매 지표',
                    label: 'KPI',
                    layer: 'KPI',
                    position: { x: 120, y: 120 },
                  },
                  {
                    id: 'sales-measure',
                    name: '매출 측정',
                    label: 'Measure',
                    layer: 'Measure',
                    description: '일별 매출 측정값',
                    unit: 'KRW',
                    position: { x: 120, y: 280 },
                  },
                  {
                    id: 'sales-driver',
                    name: '판매 동인',
                    label: 'Driver',
                    layer: 'Driver',
                    position: { x: 320, y: 280 },
                    filterFields: [
                      {
                        column: 'region',
                        label: '지역',
                        type: 'select',
                        dataType: 'string',
                      },
                      {
                        column: 'event_date',
                        label: '이벤트 날짜',
                        type: 'date_range',
                        dataType: 'date',
                      },
                      {
                        column: 'driver_value',
                        label: '동인 값',
                        type: 'range',
                        dataType: 'number',
                      },
                    ],
                  },
                  {
                    id: 'sales-resource',
                    name: '판매 자원',
                    label: 'Resource',
                    layer: 'Resource',
                    position: { x: 320, y: 440 },
                  },
                ],
                relationships: [{
                  id: 'rel-sales-measure',
                  source: 'sales-kpi',
                  target: 'sales-measure',
                  type: 'MEASURED_AS',
                  fromField: 'order_id',
                  toField: 'metric_id',
                }],
              },
              synonymSuggestions: [],
            },
          }),
          '',
        ].join('\n'),
      })
    },
  )
  await ontologyLibraryPage.route(/\/api\/gateway\/ontology\/schemas$/, route => {
    ontologyLibraryRequests += 1
    if (ontologyLibraryRequests <= 2) {
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"detail":"Ontology library fixture outage"}',
      })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        schemas: ontologyLibrarySchemaDeleted ? [] : [
          {
            id: 'library-valid',
            name: ontologyLibrarySchemaName,
            updatedAt: '2026-07-23T09:00:00Z',
            hasSchemaJson: true,
          },
          {
            id: 'library-missing-json',
            name: '손상 온톨로지',
            updatedAt: '2026-07-23T10:00:00Z',
            hasSchemaJson: false,
          },
        ],
        activeSchemaId: null,
      }),
    })
  })
  await ontologyLibraryPage.route(
    /\/api\/gateway\/ontology\/schemas\/library-valid\/activate$/,
    route => {
      ontologyLibraryActivateRequests += 1
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          schemaId: 'library-valid',
          name: '판매 온톨로지',
        }),
      })
    },
  )
  await ontologyLibraryPage.route(
    /\/api\/gateway\/ontology\/schemas\/library-valid$/,
    async route => {
      const method = route.request().method()
      if (method === 'PATCH') {
        ontologyLibraryRenameRequests += 1
        if (ontologyLibraryRenameRequests === 1) {
          return route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: '{"detail":"Ontology rename fixture outage"}',
          })
        }
        ontologyLibrarySchemaName = route.request().postDataJSON()?.name
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        })
      }
      if (method === 'DELETE') {
        ontologyLibraryDeleteRequests += 1
        if (ontologyLibraryDeleteRequests === 1) {
          return route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: '{"detail":"Ontology delete fixture outage"}',
          })
        }
        ontologyLibrarySchemaDeleted = true
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        })
      }

      ontologyLibraryDetailRequests += 1
      if (ontologyLibraryDetailRequests === 1) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"detail":"Ontology detail fixture outage"}',
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'library-valid',
          name: ontologyLibrarySchemaName,
          nodes: [
            {
              id: 'sales-kpi',
              name: '판매 지표',
              label: 'KPI',
              layer: 'KPI',
              position: { x: 120, y: 120 },
            },
            {
              id: 'sales-measure',
              name: '매출 측정',
              label: 'Measure',
              layer: 'Measure',
              description: '일별 매출 측정값',
              unit: 'KRW',
              position: { x: 120, y: 280 },
            },
            {
              id: 'sales-driver',
              name: '판매 동인',
              label: 'Driver',
              layer: 'Driver',
              position: { x: 320, y: 280 },
              filterFields: [
                {
                  column: 'region',
                  label: '지역',
                  type: 'select',
                  dataType: 'string',
                },
                {
                  column: 'event_date',
                  label: '이벤트 날짜',
                  type: 'date_range',
                  dataType: 'date',
                },
                {
                  column: 'driver_value',
                  label: '동인 값',
                  type: 'range',
                  dataType: 'number',
                },
              ],
            },
            {
              id: 'sales-resource',
              name: '판매 자원',
              label: 'Resource',
              layer: 'Resource',
              position: { x: 320, y: 440 },
            },
          ],
          relationships: [{
            id: 'rel-sales-measure',
            source: 'sales-kpi',
            target: 'sales-measure',
            type: 'MEASURED_AS',
            fromField: 'order_id',
            toField: 'metric_id',
          }],
          labels: [],
        }),
      })
    },
  )
  await ontologyLibraryPage.route(
    /\/api\/gateway\/text2sql\/meta\/datasources$/,
    route => {
      nodeDatasourceListRequests += 1
      if (nodeDatasourceListRequests === 1) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"detail":"Node datasource catalog fixture outage"}',
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(['warehouse', 'lake']),
      })
    },
  )
  await ontologyLibraryPage.route(
    /\/api\/gateway\/text2sql\/meta\/objecttypes\?.*$/,
    route => {
      objectTypeMetadataRequests.push(route.request().url())
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          name: 'Order',
          schema: 'dw',
          datasource: 'warehouse',
          materialized_view: 'mv_order',
          description: 'Order object type fixture',
          column_count: 4,
        }]),
      })
    },
  )
  await ontologyLibraryPage.route(
    /\/api\/gateway\/ontology\/confirm-datasource$/,
    async route => {
      const body = route.request().postDataJSON()
      datasourceConfirmationRequests.push({
        body,
        headers: route.request().headers(),
      })
      const tableName = body?.candidate?.table_name
      const sameTargetAttempts = datasourceConfirmationRequests.filter(
        request => request.body?.candidate?.table_name === tableName,
      ).length
      if (
        sameTargetAttempts === 1
        && (
          tableName === 'dw.kpi_metrics'
          || tableName === 'dw.resource_capacity'
          || tableName === 'mv_order'
        )
      ) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"detail":"Datasource confirmation fixture outage"}',
        })
      }
      if (tableName === 'mv_order') confirmedNodeDatasource = body
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"success":true}',
      })
    },
  )
  await ontologyLibraryPage.route(
    /\/api\/gateway\/ontology\/auto-link-datasource\/stream$/,
    route => {
      autoLinkDatasourceRequests += 1
      if (autoLinkDatasourceRequests === 1) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"detail":"Auto-link fixture outage"}',
        })
      }
      const candidate = (table_name, columns) => ({
        table_name,
        datasource: 'warehouse',
        full_table_name: table_name,
        columns,
        sample_data: [],
        row_count: 10,
        row_count_approx: false,
        relevance_score: 0.9,
        match_reason: 'Auto-link fixture',
        suggested_sql: `SELECT * FROM ${table_name}`,
      })
      const mappings = {
        'sales-kpi': {
          node_id: 'sales-kpi',
          node_name: '판매 지표',
          node_layer: 'KPI',
          search_query: '판매 지표',
          candidates: [candidate('dw.kpi_metrics', ['order_id'])],
          selected_candidate: candidate('dw.kpi_metrics', ['order_id']),
          status: 'found',
        },
        'sales-measure': {
          node_id: 'sales-measure',
          node_name: '매출 측정',
          node_layer: 'Measure',
          search_query: '매출 측정',
          candidates: [],
          selected_candidate: null,
          status: 'not_found',
        },
        'sales-driver': {
          node_id: 'sales-driver',
          node_name: '판매 동인',
          node_layer: 'Driver',
          search_query: '판매 동인',
          candidates: [candidate('dw.driver_signal', ['driver_id'])],
          selected_candidate: candidate('dw.driver_signal', ['driver_id']),
          status: 'found',
        },
        'sales-resource': {
          node_id: 'sales-resource',
          node_name: '판매 자원',
          node_layer: 'Resource',
          search_query: '판매 자원',
          candidates: [candidate('dw.resource_capacity', ['resource_id'])],
          selected_candidate: candidate('dw.resource_capacity', ['resource_id']),
          status: 'found',
        },
      }
      return route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: `data: ${JSON.stringify({ type: 'result', data: { mappings } })}\n\n`,
      })
    },
  )
  await ontologyLibraryPage.route(
    /\/api\/gateway\/text2sql\/ask$/,
    route => {
      nodeDatasourceSearchRequests += 1
      if (nodeDatasourceSearchRequests === 1) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"detail":"Node datasource search fixture outage"}',
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sql: 'SELECT order_id FROM dw.kpi_metrics',
          table: {
            columns: ['order_id'],
            rows: [[101]],
            row_count: 1,
            execution_time_ms: 8,
          },
          charts: [],
          provenance: {
            tables: ['dw.kpi_metrics'],
            columns: ['order_id'],
            neo4j_paths: [],
            vector_matches: [],
            prompt_snapshot_id: 'node-datasource-search-fixture',
          },
          perf: {
            embedding_ms: 1,
            graph_search_ms: 1,
            llm_ms: 1,
            sql_ms: 8,
            total_ms: 11,
          },
          warnings: null,
        }),
      })
    },
  )
  await ontologyLibraryPage.route(
    /\/api\/gateway\/text2sql\/direct-sql$/,
    async route => {
      const body = route.request().postDataJSON()
      nodeDatasourceDirectSqlRequests.push(body)
      if (nodeDatasourceDirectSqlRequests.length <= 2) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            detail: nodeDatasourceDirectSqlRequests.length === 1
              ? 'Node datasource probe fixture outage'
              : 'Node datasource sample fixture outage',
          }),
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'success',
          sql: body.sql,
          validated_sql: body.sql,
          columns: ['order_id'],
          rows: [[101]],
          row_count: 1,
          execution_time_ms: 4,
        }),
      })
    },
  )
  await ontologyLibraryPage.route(
    /\/api\/gateway\/ontology\/ontology-nodes\/[^/]+\/create-objecttype$/,
    async route => {
      measureObjectTypeRequests.push({
        body: route.request().postDataJSON(),
        headers: route.request().headers(),
      })
      if (measureObjectTypeRequests.length === 1) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"detail":"Measure ObjectType fixture outage"}',
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"objectTypeName":"SalesMeasure"}',
      })
    },
  )
  await ontologyLibraryPage.route(
    /\/api\/gateway\/ontology\/ontology-nodes\/measure_\d+_\d+\/data(?:\?.*)?$/,
    route => {
      measureObjectTypeDataRequests += 1
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"detail":"Measure data refresh fixture outage"}',
      })
    },
  )
  await ontologyLibraryPage.route(
    /\/api\/gateway\/ontology\/ontology-nodes\/sales-measure\/data(?:\?.*)?$/,
    route => {
      const url = new URL(route.request().url())
      if (url.searchParams.get('limit') === '1') {
        relationMeasureColumnAttempts += 1
        relationColumnRequests.push({
          nodeId: 'sales-measure',
          headers: route.request().headers(),
        })
        if (relationMeasureColumnAttempts === 1) {
          return route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: '{"detail":"Relation column fixture outage"}',
          })
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            nodeId: 'sales-measure',
            nodeName: '매출 측정',
            hasDataSource: true,
            dataSource: 'dw.sales_measure',
            columns: ['metric_id'],
            rows: [{ metric_id: 501 }],
          }),
        })
      }
      measureObjectTypeDataRequests += 1
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"detail":"Measure data refresh fixture outage"}',
      })
    },
  )
  await ontologyLibraryPage.route(
    /\/api\/gateway\/ontology\/ontology-nodes\/sales-kpi\/data(?:\?.*)?$/,
    async route => {
      const url = new URL(route.request().url())
      if (url.searchParams.get('limit') === '1') {
        relationColumnRequests.push({
          nodeId: 'sales-kpi',
          headers: route.request().headers(),
        })
        await new Promise(resolve => setTimeout(resolve, 1_500))
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            nodeId: 'sales-kpi',
            nodeName: '판매 지표',
            hasDataSource: true,
            dataSource: 'mv_order',
            columns: ['order_id'],
            rows: [{ order_id: 101 }],
          }),
        })
      }
      salesNodeDataAttempts += 1
      ontologyNodeDataRequests.push({
        nodeId: 'sales-kpi',
        url: route.request().url(),
        headers: route.request().headers(),
      })
      if (salesNodeDataAttempts === 1) {
        await new Promise(resolve => {
          releaseCancelledSalesNodeDataRequest = resolve
        })
        if (route.request().failure()) return
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          nodeId: 'sales-kpi',
          nodeName: '판매 지표',
          hasDataSource: true,
          dataSource: 'mv_order',
          columns: ['day', 'sales', 'orders'],
          rows: [
            { day: '2026-07-01', sales: 10, orders: 4 },
            { day: '2026-07-02', sales: 14, orders: 6 },
            { day: '2026-07-03', sales: 18, orders: 8 },
            { day: '2026-07-04', sales: 21, orders: 9 },
            { day: '2026-07-05', sales: 27, orders: 12 },
            { day: '2026-07-06', sales: 31, orders: 14 },
          ],
          rowCount: 6,
          timeColumns: ['day'],
          numericColumns: ['sales', 'orders'],
          chartRecommendation: {
            type: 'line',
            xAxis: 'day',
            yAxis: ['sales', 'orders'],
          },
        }),
      })
    },
  )
  await ontologyLibraryPage.route(
    /\/api\/gateway\/ontology\/ontology-nodes\/sales-driver\/filter-values(?:\?.*)?$/,
    route => {
      ontologyFilterValueAttempts += 1
      ontologyFilterValueRequests.push({
        url: route.request().url(),
        headers: route.request().headers(),
      })
      if (ontologyFilterValueAttempts === 1) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"detail":"Ontology filter values fixture outage"}',
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          distinctValues: { region: ['east', 'west'] },
        }),
      })
    },
  )
  await ontologyLibraryPage.route(
    /\/api\/gateway\/ontology\/ontology-nodes\/sales-driver\/data(?:\?.*)?$/,
    route => {
      ontologyNodeDataRequests.push({
        nodeId: 'sales-driver',
        url: route.request().url(),
        headers: route.request().headers(),
      })
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          nodeId: 'sales-driver',
          nodeName: '판매 동인',
          hasDataSource: true,
          dataSource: 'dw.driver_signal',
          columns: ['day', 'driver_value'],
          rows: [
            { day: '2026-07-01', driver_value: 2 },
            { day: '2026-07-02', driver_value: 4 },
          ],
          rowCount: 2,
          timeColumns: ['day'],
          numericColumns: ['driver_value'],
          chartRecommendation: {
            type: 'line',
            xAxis: 'day',
            yAxis: ['driver_value'],
          },
        }),
      })
    },
  )
  await ontologyLibraryPage.route(
    /\/api\/gateway\/ontology\/schemas\/library-valid\/nodes\/sales-kpi\/incoming-network$/,
    route => {
      causalNetworkRequests.push({
        body: route.request().postDataJSON(),
        headers: route.request().headers(),
      })
      if (causalNetworkRequests.length === 1) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"detail":"Causal network fixture outage"}',
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          nodes: [{ id: 'sales-kpi' }, { id: 'sales-driver' }],
          relationships: [{ source: 'sales-driver', target: 'sales-kpi' }],
        }),
      })
    },
  )
  await ontologyLibraryPage.route(
    /\/api\/gateway\/ontology\/schemas\/library-valid\/nodes\/sales-kpi\/causal-analysis\/stream$/,
    async route => {
      const requestBody = route.request().postDataJSON()
      causalAnalysisRequests.push({
        body: requestBody,
        headers: route.request().headers(),
      })
      const attempt = causalAnalysisRequests.length
      if (attempt === 1) {
        await new Promise(resolve => {
          releaseCancelledCausalRequest = resolve
        })
        if (route.request().failure()) return
        return route.abort()
      }
      if (attempt === 2) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"detail":"Causal analysis fixture outage"}',
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/x-ndjson',
        body: [
          JSON.stringify({
            type: 'progress',
            step: 'data_collection',
            message: '데이터 수집 완료',
          }),
          JSON.stringify({
            type: 'progress',
            step: 'report_chunk',
            message: '판매 지표 상승의 주요 원인은 ',
          }),
          JSON.stringify({
            type: 'progress',
            step: 'report_chunk',
            message: '판매 동인입니다.',
          }),
          JSON.stringify({
            type: 'result',
            data: {
              success: true,
              target_node_id: 'sales-kpi',
              target_metric: requestBody.target_metric,
              analysis_type: requestBody.analysis_type,
              time_range: requestBody.time_range,
              top_causes: [{
                source: 'sales-driver',
                name: '판매 동인',
                score: 0.82,
                display_score: 0.82,
                grade: '높음',
                method: 'granger',
                method_hint: 'Granger',
                method_count: 1,
              }],
              report: '판매 지표 상승의 주요 원인은 판매 동인입니다.',
              data_summary: {
                total_nodes: 2,
                nodes_with_data: 2,
                data_points: 6,
                variables: 2,
                target_variable: 'sales',
              },
            },
          }),
          '',
        ].join('\n'),
      })
    },
  )
  await ontologyLibraryPage.route(
    /\/api\/gateway\/ontology\/schema$/,
    async route => {
      if (route.request().method() !== 'POST') {
        return route.fallback()
      }
      ontologySaveRequests.push({
        body: route.request().postDataJSON(),
        headers: route.request().headers(),
      })
      if (ontologySaveRequests.at(-1).body?.name === 'Generated Fixture') {
        generationSaveRequests.push(ontologySaveRequests.pop())
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: '{"success":true,"id":"library-valid"}',
        })
      }
      if (ontologySaveRequests.length === 1) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"detail":"Ontology save fixture outage"}',
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"success":true,"id":"library-valid"}',
      })
    },
  )
  await ontologyLibraryPage.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  await openFeature(ontologyLibraryPage, '온톨로지 관리')
  await ontologyLibraryPage.locator('.multi-layer-ontology-viewer').waitFor({ timeout: 30_000 })
  const ontologyLibraryTrigger = ontologyLibraryPage.getByRole('button', { name: /온톨로지 목록/ })
  await ontologyLibraryTrigger.focus()
  await ontologyLibraryTrigger.press('Enter')
  const ontologyLibraryError = ontologyLibraryPage.locator('#ontology-library-menu .dropdown-state.error')
  await ontologyLibraryError.waitFor({ state: 'visible', timeout: 30_000 })
  assert(
    !(await ontologyLibraryPage.getByText('저장된 온톨로지가 없습니다.', { exact: true }).isVisible().catch(() => false)),
    'Ontology library transport failure is presented as a successful empty list',
  )
  assert(
    await ontologyLibraryTrigger.getAttribute('aria-expanded') === 'true',
    'Ontology library trigger does not expose its expanded state',
  )
  await ontologyLibraryPage.screenshot({
    path: join(evidenceDir, 'ontology-library-failure-1920x1080.png'),
    fullPage: true,
  })
  await ontologyLibraryError.getByRole('button', { name: '다시 시도' }).click()
  await ontologyLibraryPage.getByText(
    '스키마 데이터가 없는 온톨로지 1개를 제외했습니다.',
    { exact: true },
  ).waitFor()
  const validOntologyButton = ontologyLibraryPage.getByRole('button', {
    name: '판매 온톨로지',
    exact: true,
  })
  await validOntologyButton.waitFor()
  await ontologyLibraryPage.getByText('0 노드', { exact: true }).waitFor()
  assert(
    !(await ontologyLibraryPage.getByText('손상 온톨로지', { exact: true }).isVisible().catch(() => false)),
    'Ontology library retained an entry without schema data',
  )
  assert(ontologyLibraryRequests === 3, 'Ontology library retry did not issue exactly one new request')
  await ontologyLibraryPage.screenshot({
    path: join(evidenceDir, 'ontology-library-retry-1920x1080.png'),
    fullPage: true,
  })
  await validOntologyButton.focus()
  await validOntologyButton.press('Enter')
  const partialLoadError = ontologyLibraryPage.locator(
    '#ontology-library-menu .dropdown-state.load-error',
  )
  await partialLoadError.waitFor({ state: 'visible' })
  assert(
    ontologyLibraryActivateRequests === 1 && ontologyLibraryDetailRequests === 1,
    'Initial schema selection did not issue one activation and one detail request',
  )
  assert(
    await ontologyLibraryPage.evaluate(() =>
      localStorage.getItem('robo-analyzer-recent-schemas'),
    ) === null,
    'A partially loaded ontology was committed to recent history',
  )
  assert(
    !(await ontologyLibraryPage.getByText('판매 지표', { exact: true }).isVisible().catch(() => false)),
    'Detail failure replaced the previous viewer canvas',
  )
  await ontologyLibraryPage.screenshot({
    path: join(evidenceDir, 'ontology-schema-detail-failure-1920x1080.png'),
    fullPage: true,
  })
  await partialLoadError.getByRole('button', { name: '다시 시도' }).click()
  await ontologyLibraryPage.waitForFunction(() =>
    document.querySelector('#ontology-library-menu') === null,
  )
  assert(
    ontologyLibraryActivateRequests === 1 && ontologyLibraryDetailRequests === 2,
    'Detail retry repeated the activation mutation or did not retry detail exactly once',
  )
  assert(
    JSON.stringify(await ontologyLibraryPage.evaluate(() =>
      JSON.parse(localStorage.getItem('robo-analyzer-recent-schemas') ?? '[]'),
    )) === JSON.stringify(['library-valid']),
    'Recent history was not committed after the complete schema load',
  )
  const salesNode = ontologyLibraryPage.locator('.layer-panel .node-item', {
    hasText: '판매 지표',
  })
  await salesNode.waitFor({ state: 'visible', timeout: 30_000 })
  const measureNode = ontologyLibraryPage.locator('.layer-panel .node-item', {
    hasText: '매출 측정',
  })
  const driverNode = ontologyLibraryPage.locator('.layer-panel .node-item', {
    hasText: '판매 동인',
  })
  const resourceNode = ontologyLibraryPage.locator('.layer-panel .node-item', {
    hasText: '판매 자원',
  })

  const layerPanelToggle = ontologyLibraryPage.getByRole('button', {
    name: '레이어 패널 접기',
  })
  await layerPanelToggle.click()
  const collapsedLayerPanelToggle = ontologyLibraryPage.getByRole('button', {
    name: '레이어 패널 펼치기',
  })
  assert(
    await collapsedLayerPanelToggle.getAttribute('aria-expanded') === 'false'
      && (await ontologyLibraryPage.locator('.layer-panel').getAttribute('class'))
        ?.includes('layer-panel-collapsed')
      && !(await salesNode.isVisible().catch(() => false)),
    'Ontology layer panel did not preserve its collapsed disclosure result',
  )
  await ontologyLibraryPage.locator('.layer-panel').evaluate(async element => {
    await Promise.all(element.getAnimations().map(animation => animation.finished))
  })
  await ontologyLibraryPage.waitForFunction(() => {
    const container = document.querySelector('.cytoscape-container')
    const canvas = container?.querySelector('canvas')
    if (!(container instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) return false
    return Math.abs(
      canvas.getBoundingClientRect().width - container.getBoundingClientRect().width,
    ) <= 1
  })
  await ontologyLibraryPage.screenshot({
    path: join(evidenceDir, 'ontology-layer-panel-collapsed-1920x1080.png'),
    fullPage: true,
  })
  await collapsedLayerPanelToggle.click()
  await salesNode.waitFor({ state: 'visible' })
  await ontologyLibraryPage.locator('.layer-panel').evaluate(async element => {
    await Promise.all(element.getAnimations().map(animation => animation.finished))
  })
  await ontologyLibraryPage.waitForFunction(() => {
    const container = document.querySelector('.cytoscape-container')
    const canvas = container?.querySelector('canvas')
    if (!(container instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) return false
    return Math.abs(
      canvas.getBoundingClientRect().width - container.getBoundingClientRect().width,
    ) <= 1
  })
  assert(
    await layerPanelToggle.getAttribute('aria-expanded') === 'true',
    'Ontology layer panel did not restore its expanded disclosure result',
  )

  const kpiLayerDisclosure = ontologyLibraryPage.locator(
    'button.layer-header[aria-controls="ontology-layer-KPI-nodes"]',
  )
  await kpiLayerDisclosure.focus()
  await kpiLayerDisclosure.press('Space')
  assert(
    await kpiLayerDisclosure.getAttribute('aria-expanded') === 'false'
      && !(await salesNode.isVisible().catch(() => false)),
    'Ontology layer Space disclosure did not collapse only its node list',
  )
  await kpiLayerDisclosure.press('Enter')
  await salesNode.waitFor({ state: 'visible' })
  assert(
    await kpiLayerDisclosure.getAttribute('aria-expanded') === 'true',
    'Ontology layer Enter disclosure did not reopen its controlled node list',
  )

  await salesNode.focus()
  await salesNode.press('Enter')
  const layerSelector = ontologyLibraryPage.getByRole('button', { name: '노드 레이어 변경' })
  await layerSelector.press('Enter')
  const measureLayerOption = ontologyLibraryPage.getByRole('button', { name: /📏.*Measure/ })
  await measureLayerOption.press('Space')
  assert(
    (await layerSelector.textContent()).includes('Measure'),
    'Ontology node layer option did not use the existing layer mutation result',
  )
  await layerSelector.press('Space')
  const kpiLayerOption = ontologyLibraryPage.getByRole('button', { name: /📊.*KPI/ })
  assert(
    await measureLayerOption.getAttribute('aria-pressed') === 'true'
      && await kpiLayerOption.getAttribute('aria-pressed') === 'false',
    'Ontology layer options did not expose their current pressed state',
  )
  await kpiLayerOption.press('Enter')
  assert(
    (await layerSelector.textContent()).includes('KPI'),
    'Ontology node layer was not restored after keyboard mutation verification',
  )

  const behaviorTab = ontologyLibraryPage.getByRole('tab', { name: /Behavior/ })
  await behaviorTab.press('Enter')
  const behaviorLoadError = ontologyLibraryPage.locator('.behavior-load-state.error')
  await behaviorLoadError.waitFor({ state: 'visible' })
  assert(
    !(await ontologyLibraryPage.getByText('판매 예측 모델', { exact: true }).isVisible().catch(() => false)),
    'Behavior model failure was presented as a successful model list',
  )
  await behaviorLoadError.getByRole('button', { name: '다시 시도' }).press('Space')
  const behaviorModel = ontologyLibraryPage.getByText('판매 예측 모델', { exact: true })
  await behaviorModel.waitFor({ state: 'visible' })
  assert(behaviorModelRequests === 2, 'Behavior model retry did not repeat one frozen target')

  await behaviorTab.press('Space')
  await behaviorLoadError.waitFor({ state: 'visible' })
  assert(
    await behaviorModel.isVisible(),
    'Same-target Behavior refresh failure discarded the last valid model list',
  )
  await ontologyLibraryPage.screenshot({
    path: join(evidenceDir, 'ontology-behavior-model-retry-1920x1080.png'),
    fullPage: true,
  })
  await behaviorLoadError.getByRole('button', { name: '다시 시도' }).press('Enter')
  await behaviorLoadError.waitFor({ state: 'detached' })
  assert(
    behaviorModelRequests === 4
      && new Set(behaviorModelRequestUrls).size === 1,
    'Behavior model exact retry changed schema/node URL or request count',
  )
  await behaviorTab.press('Home')
  assert(
    await ontologyLibraryPage.getByRole('tab', { name: /정보/ }).getAttribute('aria-selected') === 'true',
    'Node detail tablist did not move to the first enabled tab with Home',
  )

  const detailPanelSeparator = ontologyLibraryPage.getByRole('separator', {
    name: '상세 패널 너비 조절',
  })
  await detailPanelSeparator.waitFor({ state: 'visible' })
  assert(
    await detailPanelSeparator.getAttribute('aria-valuenow') === '440',
    'Detail panel separator did not expose its initial width',
  )
  await detailPanelSeparator.focus()
  await detailPanelSeparator.press('ArrowLeft')
  assert(
    await detailPanelSeparator.getAttribute('aria-valuenow') === '456',
    'Detail panel keyboard resize did not increase the width',
  )
  await detailPanelSeparator.press('Home')
  assert(
    await detailPanelSeparator.getAttribute('aria-valuenow') === '440',
    'Detail panel Home key did not restore its default width',
  )
  await ontologyLibraryPage.waitForFunction(() => {
    const panel = document.querySelector('.detail-panel')
    return panel && Math.abs(panel.getBoundingClientRect().width - 440) <= 0.5
  })
  const detailSeparatorBox = await detailPanelSeparator.boundingBox()
  assert(detailSeparatorBox, 'Detail panel separator has no measurable geometry')
  await ontologyLibraryPage.mouse.move(
    detailSeparatorBox.x + detailSeparatorBox.width / 2,
    detailSeparatorBox.y + Math.min(80, detailSeparatorBox.height / 2),
  )
  await ontologyLibraryPage.mouse.down()
  await ontologyLibraryPage.mouse.move(detailSeparatorBox.x - 80, detailSeparatorBox.y + 80)
  await ontologyLibraryPage.waitForFunction(() => {
    const separator = document.querySelector(
      '[role="separator"][aria-label="상세 패널 너비 조절"]',
    )
    return Number(separator?.getAttribute('aria-valuenow')) > 440
  }, undefined, { timeout: 2_000 })
  assert(
    Number(await detailPanelSeparator.getAttribute('aria-valuenow')) > 440,
    'Pointer drag did not resize the detail panel',
  )
  await ontologyLibraryPage.keyboard.press('Escape')
  await ontologyLibraryPage.mouse.up()
  assert(
    await detailPanelSeparator.getAttribute('aria-valuenow') === '440',
    'Escape did not restore the detail panel drag-start width',
  )
  assert(
    await ontologyLibraryPage.evaluate(() =>
      document.body.style.cursor === '' && document.body.style.userSelect === '',
    ),
    'Cancelled panel resize did not restore document interaction styles',
  )

  const whatIfToggle = ontologyLibraryPage.getByRole('button', {
    name: /What-if 분석/,
  })
  await whatIfToggle.click()
  const whatIfPanelSeparator = ontologyLibraryPage.getByRole('separator', {
    name: 'What-if 패널 높이 조절',
  })
  await whatIfPanelSeparator.waitFor({ state: 'visible' })
  await whatIfPanelSeparator.focus()
  await whatIfPanelSeparator.press('ArrowUp')
  assert(
    await whatIfPanelSeparator.getAttribute('aria-valuenow') === '366',
    'What-if panel keyboard resize did not increase the height',
  )
  await ontologyLibraryPage.screenshot({
    path: join(evidenceDir, 'ontology-managed-panel-resize-1920x1080.png'),
    fullPage: true,
  })
  await whatIfPanelSeparator.press('Home')
  assert(
    await whatIfPanelSeparator.getAttribute('aria-valuenow') === '350',
    'What-if panel Home key did not restore its default height',
  )
  await whatIfToggle.click()
  await whatIfPanelSeparator.waitFor({ state: 'hidden' })

  await ontologyLibraryPage.getByRole('button', { name: /문서에서 생성/ }).click()
  const documentGenerationDialog = ontologyLibraryPage.getByRole('dialog', {
    name: /문서에서 온톨로지 생성/,
  })
  const generationGlossaryError = documentGenerationDialog.locator('.glossary-load-error')
  await generationGlossaryError.waitFor({ state: 'visible' })
  assert(
    !(await documentGenerationDialog.getByText(
      '등록된 용어집이 없습니다.',
      { exact: true },
    ).isVisible().catch(() => false)),
    'Generation glossary failure was presented as a successful empty list',
  )
  await generationGlossaryError.getByRole('button', { name: '다시 시도' }).click()
  await documentGenerationDialog.getByText(
    '전체 용어집 사용 (1개)',
    { exact: true },
  ).waitFor()
  await documentGenerationDialog.getByRole('button', { name: /PDF 업로드/ }).click()
  const pdfInput = documentGenerationDialog.locator('input[type="file"]')
  const pdfPicker = documentGenerationDialog.locator('button.drop-zone-content')
  assert(
    await pdfPicker.evaluate(element =>
      element.tagName === 'BUTTON'
        && element.getAttribute('aria-controls') === 'ontology-generation-pdf-input'),
    'Document PDF picker is not a native control bound to the file input',
  )
  const invalidPdfChooserPromise = ontologyLibraryPage.waitForEvent('filechooser')
  await pdfPicker.focus()
  await ontologyLibraryPage.keyboard.press('Enter')
  const invalidPdfChooser = await invalidPdfChooserPromise
  await invalidPdfChooser.setFiles({
    name: 'not-a-pdf.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not a pdf'),
  })
  await documentGenerationDialog.getByRole('alert').waitFor({ state: 'visible' })
  assert(
    !(await documentGenerationDialog.getByText('not-a-pdf.txt', { exact: true }).isVisible().catch(() => false)),
    'Invalid document upload was committed as the selected PDF',
  )
  await ontologyLibraryPage.screenshot({
    path: join(evidenceDir, 'ontology-document-pdf-validation-1920x1080.png'),
    fullPage: true,
  })
  await pdfInput.setInputFiles({
    name: 'ontology-fixture.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 fixture'),
  })
  await documentGenerationDialog.getByText('ontology-fixture.pdf', { exact: true }).waitFor()
  assert(
    !(await documentGenerationDialog.getByRole('alert').isVisible().catch(() => false)),
    'Valid PDF selection did not clear the format error',
  )
  const removePdfButton = documentGenerationDialog.locator('button.remove-file-btn')
  await removePdfButton.focus()
  await ontologyLibraryPage.keyboard.press('Space')
  await pdfPicker.waitFor({ state: 'visible' })
  assert(
    await pdfInput.inputValue() === '',
    'Removing a PDF did not reset the native input for same-file reselection',
  )
  const samePdfChooserPromise = ontologyLibraryPage.waitForEvent('filechooser')
  await pdfPicker.focus()
  await ontologyLibraryPage.keyboard.press('Space')
  const samePdfChooser = await samePdfChooserPromise
  await samePdfChooser.setFiles({
    name: 'ontology-fixture.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 fixture'),
  })
  await documentGenerationDialog.getByText('ontology-fixture.pdf', { exact: true }).waitFor()
  await documentGenerationDialog.getByRole('button', {
    name: '생성 대화상자 닫기',
  }).click()
  await documentGenerationDialog.waitFor({ state: 'hidden' })

  await ontologyLibraryPage.getByRole('button', { name: /문서에서 생성/ }).click()
  await documentGenerationDialog.waitFor({ state: 'visible' })
  await documentGenerationDialog.getByRole('button', { name: /텍스트 입력/ }).click()
  await documentGenerationDialog.locator('textarea').fill('판매 지표 문서 fixture')
  await documentGenerationDialog.getByRole('button', {
    name: /온톨로지 생성/,
  }).click()
  const generationLogsToggle = documentGenerationDialog.getByRole('button', {
    name: /추출 로그/,
  })
  await generationLogsToggle.waitFor({ state: 'visible' })
  await generationLogsToggle.focus()
  await ontologyLibraryPage.keyboard.press('Enter')
  assert(
    await generationLogsToggle.getAttribute('aria-expanded') === 'true'
      && await documentGenerationDialog.locator('#ontology-generation-log-list').isVisible(),
    'Generation log disclosure did not open from Enter',
  )
  await ontologyLibraryPage.screenshot({
    path: join(evidenceDir, 'ontology-generation-log-disclosure-1920x1080.png'),
    fullPage: true,
  })
  await ontologyLibraryPage.keyboard.press('Space')
  await documentGenerationDialog.locator('#ontology-generation-log-list').waitFor({
    state: 'detached',
  })
  assert(
    await generationLogsToggle.getAttribute('aria-expanded') === 'false',
    'Generation log disclosure did not close from Space',
  )
  await documentGenerationDialog.getByText(
    'Document generation fixture outage',
    { exact: true },
  ).waitFor()
  await ontologyLibraryPage.screenshot({
    path: join(evidenceDir, 'ontology-document-generation-failure-1920x1080.png'),
    fullPage: true,
  })
  await documentGenerationDialog.getByRole('button', {
    name: '같은 요청 다시 시도',
    exact: true,
  }).click()
  await documentGenerationDialog.getByText(
    '온톨로지 생성 완료',
    { exact: true },
  ).waitFor()
  await documentGenerationDialog.getByText(
    'Neo4j에 저장 완료',
    { exact: true },
  ).waitFor()
  assert(
    generationGlossaryAttempts >= 3
      && documentGenerationRequests.length === 2
      && JSON.stringify(documentGenerationRequests[0].body)
        === JSON.stringify(documentGenerationRequests[1].body)
      && documentGenerationRequests[0].body.text === '판매 지표 문서 fixture'
      && documentGenerationRequests.every(request =>
        request.headers['accept-language'] === 'ko'
          && request.headers['x-llm-api-key'] === 'node-agent-test-key')
      && generationSaveRequests.length === 1
      && generationSaveRequests[0].body?.id === undefined,
    'Document generation glossary retry, frozen payload, runtime headers, or follow-up save changed',
  )
  await ontologyLibraryPage.screenshot({
    path: join(evidenceDir, 'ontology-document-generation-success-1920x1080.png'),
    fullPage: true,
  })
  await documentGenerationDialog.getByRole('button', {
    name: '온톨로지 보기',
    exact: true,
  }).click()
  await documentGenerationDialog.waitFor({ state: 'hidden' })

  await measureNode.focus()
  await measureNode.press('Enter')
  await ontologyLibraryPage
    .locator('.detail-tabs')
    .getByRole('tab', { name: /데이터/ })
    .click()
  await ontologyLibraryPage
    .locator('.no-data-actions')
    .getByRole('button', { name: /데이터 소스 연결/ })
    .click()
  const autoLinkDialog = ontologyLibraryPage.getByRole('dialog', {
    name: /데이터 소스 자동 연결/,
  })
  await autoLinkDialog.getByRole('button', { name: /다시 검색/ }).click()
  const autoLinkFailure = autoLinkDialog.locator('.datasource-operation-status.error')
  await autoLinkFailure.waitFor({ state: 'visible' })
  assert(
    !(await autoLinkDialog.getByText('관련 데이터 소스를 찾지 못했습니다.', { exact: true }).isVisible().catch(() => false)),
    'Auto-link transport failure was presented as a successful empty mapping result',
  )
  await ontologyLibraryPage.screenshot({
    path: join(evidenceDir, 'ontology-datasource-auto-link-failure-1920x1080.png'),
    fullPage: true,
  })
  await autoLinkFailure.getByRole('button', { name: '다시 시도' }).click()
  const kpiMapping = autoLinkDialog.locator('.mapping-item', { hasText: '판매 지표' })
  await kpiMapping.waitFor({ state: 'visible' })
  const kpiMappingToggle = kpiMapping.locator('button.mapping-header')
  assert(
    await kpiMappingToggle.evaluate(element => element.tagName === 'BUTTON'),
    'Datasource mapping disclosure is not a native button',
  )
  if (await kpiMappingToggle.getAttribute('aria-expanded') === 'true') {
    await kpiMappingToggle.focus()
    await ontologyLibraryPage.keyboard.press('Space')
  }
  await kpiMappingToggle.focus()
  await ontologyLibraryPage.keyboard.press('Enter')
  assert(
    await kpiMappingToggle.getAttribute('aria-expanded') === 'true'
      && await kpiMapping.locator('.mapping-details').isVisible(),
    'Datasource mapping details did not open from the native keyboard disclosure',
  )
  const kpiCandidate = kpiMapping.locator('.candidate-item', {
    hasText: 'dw.kpi_metrics',
  })
  const kpiCandidateToggle = kpiCandidate.getByRole('button', {
    name: 'dw.kpi_metrics 후보 상세',
  })
  await kpiCandidateToggle.focus()
  await ontologyLibraryPage.keyboard.press('Enter')
  assert(
    await kpiCandidateToggle.getAttribute('aria-expanded') === 'true'
      && await kpiCandidate.locator('.candidate-details').isVisible(),
    'Candidate detail did not open from the native keyboard disclosure',
  )
  const candidateDetailGeometry = await kpiCandidate.locator('.candidate-details').evaluate(element => {
    const detail = element.getBoundingClientRect()
    const mappingList = element.closest('.mapping-list')?.getBoundingClientRect()
    return {
      height: detail.height,
      scrollHeight: element.scrollHeight,
      mappingListTop: mappingList?.top ?? 0,
      mappingListBottom: mappingList?.bottom ?? 0,
      detailTop: detail.top,
    }
  })
  assert(
    candidateDetailGeometry.height >= 80
      && candidateDetailGeometry.height + 1 >= candidateDetailGeometry.scrollHeight
      && candidateDetailGeometry.detailTop >= candidateDetailGeometry.mappingListTop,
    `Candidate detail remained flex-compressed: ${JSON.stringify(candidateDetailGeometry)}`,
  )
  await ontologyLibraryPage.screenshot({
    path: join(evidenceDir, 'ontology-candidate-disclosure-1920x1080.png'),
    fullPage: true,
  })
  await ontologyLibraryPage.keyboard.press('Space')
  await kpiCandidate.locator('.candidate-details').waitFor({ state: 'detached' })
  assert(
    await kpiCandidateToggle.getAttribute('aria-expanded') === 'false',
    'Candidate detail did not close from the native keyboard disclosure',
  )
  const kpiCandidateConfirm = kpiCandidate.getByRole('button', {
    name: /선택/,
  })
  await kpiCandidateConfirm.click()
  await kpiCandidate.locator('.datasource-operation-inline-error').waitFor({
    state: 'visible',
  })
  assert(
    datasourceConfirmationRequests.filter(
      request => request.body?.candidate?.table_name === 'dw.kpi_metrics',
    ).length === 1,
    'Failed candidate confirmation duplicated its request',
  )
  await kpiCandidate.getByRole('button', { name: '다시 시도' }).click()
  await kpiCandidate.getByText('✅ 확정됨', { exact: true }).waitFor()

  const bulkConfirmTrigger = autoLinkDialog.getByRole('button', {
    name: /선택된 후보 모두 확정/,
  })
  await bulkConfirmTrigger.click()
  const bulkConfirmDialog = ontologyLibraryPage.getByRole('alertdialog', {
    name: '데이터 소스 일괄 확정',
  })
  await bulkConfirmDialog.waitFor({ state: 'visible' })
  await ontologyLibraryPage.setViewportSize({ width: 390, height: 844 })
  await ontologyLibraryPage.waitForTimeout(200)
  const mobileBulkGeometry = await ontologyLibraryPage.evaluate(() => {
    const dialog = document.querySelector('.action-dialog')?.getBoundingClientRect()
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      dialog: dialog && {
        left: dialog.left,
        top: dialog.top,
        right: dialog.right,
        bottom: dialog.bottom,
      },
    }
  })
  assert(
    mobileBulkGeometry.documentWidth <= mobileBulkGeometry.viewportWidth + 1
      && mobileBulkGeometry.dialog
      && mobileBulkGeometry.dialog.left >= 0
      && mobileBulkGeometry.dialog.top >= 0
      && mobileBulkGeometry.dialog.right <= mobileBulkGeometry.viewportWidth
      && mobileBulkGeometry.dialog.bottom <= mobileBulkGeometry.viewportHeight,
    'Bulk datasource confirmation dialog is clipped or creates overflow at 390x844',
  )
  await ontologyLibraryPage.screenshot({
    path: join(evidenceDir, 'ontology-datasource-bulk-confirm-390x844.png'),
    fullPage: true,
  })
  await ontologyLibraryPage.setViewportSize({ width: 1920, height: 1080 })
  await ontologyLibraryPage.waitForTimeout(200)
  const confirmationCountBeforeCancel = datasourceConfirmationRequests.length
  await bulkConfirmDialog.press('Escape')
  await bulkConfirmDialog.waitFor({ state: 'hidden' })
  assert(
    datasourceConfirmationRequests.length === confirmationCountBeforeCancel,
    'Cancelling bulk datasource confirmation sent mutation requests',
  )
  await bulkConfirmTrigger.click()
  await bulkConfirmDialog.getByRole('button', { name: '모두 확정' }).click()
  await bulkConfirmDialog.getByRole('alert').waitFor({ state: 'visible' })
  await bulkConfirmDialog.getByText(
    /1개 노드는 확정되었습니다.*실패한 1개 노드만 다시 확정/s,
  ).waitFor()
  await ontologyLibraryPage.screenshot({
    path: join(evidenceDir, 'ontology-datasource-bulk-partial-failure-1920x1080.png'),
    fullPage: true,
  })
  await bulkConfirmDialog.getByRole('button', { name: '다시 시도' }).click()
  await bulkConfirmDialog.waitFor({ state: 'hidden' })
  assert(
    datasourceConfirmationRequests
      .filter(request => ['dw.driver_signal', 'dw.resource_capacity'].includes(
        request.body?.candidate?.table_name,
      ))
      .map(request => request.body.candidate.table_name)
      .join(',') === 'dw.driver_signal,dw.resource_capacity,dw.resource_capacity',
    'Bulk datasource retry repeated a successful node or changed the failed target',
  )
  assert(autoLinkDatasourceRequests === 2, 'Auto-link retry count differs from one')
  assert(
    datasourceConfirmationRequests.every(request =>
      request.headers['accept-language'] === 'ko'
        && request.headers['x-llm-api-key'] === 'node-agent-test-key'),
    'Datasource confirmation requests are missing runtime session headers',
  )
  await autoLinkDialog.getByRole('button', { name: '닫기', exact: true }).click()

  await driverNode.click({ button: 'right' })
  const driverContextMenu = ontologyLibraryPage.getByRole('menu', {
    name: '판매 동인 작업',
  })
  await driverContextMenu.getByRole('menuitem', { name: '필터 적용' }).click()
  const driverFilterDialog = ontologyLibraryPage.getByRole('dialog', {
    name: '판매 동인 필터',
  })
  const filterDistinctError = driverFilterDialog.getByRole('alert')
  await filterDistinctError.waitFor({ state: 'visible' })
  assert(
    ontologyFilterValueRequests.length === 1
      && new URL(ontologyFilterValueRequests[0].url).searchParams.get('columns') === 'region',
    'Initial distinct-filter request changed its node or columns',
  )
  assert(
    ontologyFilterValueRequests[0].headers['accept-language'] === 'ko'
      && ontologyFilterValueRequests[0].headers['x-llm-api-key'] === 'node-agent-test-key',
    'Distinct-filter request is missing runtime session headers',
  )
  await filterDistinctError.getByRole('button', { name: '다시 시도' }).click()
  const regionFilter = driverFilterDialog.getByLabel('지역')
  await regionFilter.selectOption('east')
  assert(
    ontologyFilterValueRequests.length === 2
      && ontologyFilterValueRequests[0].url === ontologyFilterValueRequests[1].url,
    'Distinct-filter retry changed its frozen target request',
  )
  assert(
    await driverFilterDialog.locator('input:disabled').count() === 4
      && await driverFilterDialog.getByText(/백엔드 날짜 범위 계약이 확인되지 않아/).isVisible()
      && await driverFilterDialog.getByText(/백엔드 숫자 범위 계약이 확인되지 않아/).isVisible(),
    'Unverified range filters still look operational',
  )
  await ontologyLibraryPage.screenshot({
    path: join(evidenceDir, 'ontology-node-filter-contract-1920x1080.png'),
    fullPage: true,
  })
  const driverDataCountBeforeCancel = ontologyNodeDataRequests
    .filter(request => request.nodeId === 'sales-driver').length
  await driverFilterDialog.getByRole('button', { name: '필터 편집 취소' }).click()
  await driverFilterDialog.waitFor({ state: 'hidden' })
  assert(
    ontologyNodeDataRequests.filter(request => request.nodeId === 'sales-driver').length
      === driverDataCountBeforeCancel,
    'Cancelling a filter draft reloaded node data',
  )

  await driverNode.click({ button: 'right' })
  await ontologyLibraryPage
    .getByRole('menu', { name: '판매 동인 작업' })
    .getByRole('menuitem', { name: '필터 적용' })
    .click()
  await driverFilterDialog.getByLabel('지역').selectOption('east')
  const driverDataCountBeforeConfirm = ontologyNodeDataRequests
    .filter(request => request.nodeId === 'sales-driver').length
  const filteredResponse = ontologyLibraryPage.waitForResponse(response => {
    const url = new URL(response.url())
    return /\/ontology-nodes\/sales-driver\/data$/.test(url.pathname)
      && url.searchParams.get('filter_region') === 'east'
  })
  await driverFilterDialog.getByRole('button', { name: '확인', exact: true }).click()
  await filteredResponse
  assert(
    ontologyNodeDataRequests.filter(request => request.nodeId === 'sales-driver').length
      === driverDataCountBeforeConfirm + 1,
    'Filter confirmation did not issue exactly one node-data request',
  )
  await ontologyLibraryPage.locator('.filter-chip.direct', {
    hasText: /region\s*=\s*east/,
  }).waitFor()
  await ontologyLibraryPage.screenshot({
    path: join(evidenceDir, 'ontology-node-filter-lifecycle-1920x1080.png'),
    fullPage: true,
  })

  await driverNode.click({ button: 'right' })
  await ontologyLibraryPage
    .getByRole('menu', { name: '판매 동인 작업' })
    .getByRole('menuitem', { name: '필터 적용' })
    .click()
  const clearResponse = ontologyLibraryPage.waitForResponse(response => {
    const url = new URL(response.url())
    return /\/ontology-nodes\/sales-driver\/data$/.test(url.pathname)
      && !url.searchParams.has('filter_region')
  })
  await driverFilterDialog.getByRole('button', { name: '모두 초기화' }).click()
  await clearResponse
  assert(
    !(await ontologyLibraryPage.locator('.filter-chip.direct').isVisible().catch(() => false)),
    'Clearing filters left the direct filter chip visible',
  )
  await driverFilterDialog.getByRole('button', { name: '취소', exact: true }).click()

  await ontologyLibraryPage.setViewportSize({ width: 390, height: 844 })
  const mobileDetailClose = ontologyLibraryPage.getByRole('button', {
    name: '노드 상세 닫기',
  })
  if (await mobileDetailClose.isVisible().catch(() => false)) {
    await mobileDetailClose.click()
    await ontologyLibraryPage.locator('.detail-panel').waitFor({ state: 'hidden' })
  }
  await driverNode.click({ button: 'right' })
  await ontologyLibraryPage
    .getByRole('menu', { name: '판매 동인 작업' })
    .getByRole('menuitem', { name: '필터 적용' })
    .click()
  await driverFilterDialog.waitFor({ state: 'visible' })
  await ontologyLibraryPage.waitForTimeout(300)
  const mobileFilterGeometry = await ontologyLibraryPage.evaluate(() => {
    const dialog = document.querySelector('.filter-dialog')?.getBoundingClientRect()
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      dialog: dialog && {
        left: dialog.left,
        top: dialog.top,
        right: dialog.right,
        bottom: dialog.bottom,
      },
    }
  })
  assert(
    mobileFilterGeometry.documentWidth <= mobileFilterGeometry.viewportWidth + 1,
    'Mobile filter dialog caused document horizontal overflow',
  )
  assert(
    mobileFilterGeometry.dialog
      && mobileFilterGeometry.dialog.left >= 0
      && mobileFilterGeometry.dialog.top >= 0
      && mobileFilterGeometry.dialog.right <= mobileFilterGeometry.viewportWidth + 1
      && mobileFilterGeometry.dialog.bottom <= mobileFilterGeometry.viewportHeight + 1,
    'Mobile filter dialog escaped the viewport',
  )
  await ontologyLibraryPage.screenshot({
    path: join(evidenceDir, 'ontology-node-filter-390x844.png'),
    fullPage: true,
  })
  await ontologyLibraryPage.keyboard.press('Escape')
  await driverFilterDialog.waitFor({ state: 'hidden' })
  await ontologyLibraryPage.setViewportSize({ width: 1920, height: 1080 })

  if (await ontologyLibraryTrigger.getAttribute('aria-expanded') !== 'true') {
    await ontologyLibraryTrigger.click()
  }
  const loadedOntologyRow = ontologyLibraryPage.locator('.dropdown-item.active')
  await loadedOntologyRow.waitFor()
  await loadedOntologyRow
    .getByRole('button', { name: /온톨로지 이름 편집$/ })
    .click()
  const renameInput = loadedOntologyRow.locator('.schema-name-input')
  await renameInput.fill('판매 핵심 온톨로지')
  await renameInput.press('Enter')
  const renameError = loadedOntologyRow.locator('.schema-inline-error')
  await renameError.waitFor({ state: 'visible' })
  assert(
    await renameInput.inputValue() === '판매 핵심 온톨로지',
    'Failed rename did not preserve the attempted name',
  )
  assert(ontologyLibraryRenameRequests === 1, 'Failed rename was submitted more than once')
  await ontologyLibraryPage.screenshot({
    path: join(evidenceDir, 'ontology-schema-rename-failure-1920x1080.png'),
    fullPage: true,
  })
  await renameInput.press('Enter')
  const renamedOntologyButton = ontologyLibraryPage.getByRole('button', {
    name: '판매 핵심 온톨로지',
    exact: true,
  })
  await renamedOntologyButton.waitFor()
  assert(
    ontologyLibraryRenameRequests === 2,
    'Enter and blur submitted a duplicate rename request after success',
  )
  await ontologyLibraryTrigger.click()

  await salesNode.focus()
  await salesNode.press('Enter')
  assert(await salesNode.getAttribute('aria-pressed') === 'true', 'Keyboard node selection is not exposed')
  await ontologyLibraryPage.getByRole('button', { name: /연결하기|재설정/ }).click()
  const nodeDatasourceDialog = ontologyLibraryPage.locator('.node-datasource-dialog')
  await nodeDatasourceDialog.waitFor({ state: 'visible' })
  const nodeDatasourceError = nodeDatasourceDialog.locator('.catalog-load-error')
  await nodeDatasourceError.waitFor({ state: 'visible' })
  assert(
    !(await nodeDatasourceDialog.getByText('테이블을 찾을 수 없습니다.', { exact: true }).isVisible().catch(() => false)),
    'Node datasource catalog failure is presented as a successful empty table list',
  )
  await ontologyLibraryPage.screenshot({
    path: join(evidenceDir, 'ontology-node-datasource-failure-1920x1080.png'),
    fullPage: true,
  })
  await nodeDatasourceError.getByRole('button', { name: '다시 시도' }).click()
  await nodeDatasourceDialog
    .getByRole('option', { name: 'warehouse', exact: true })
    .first()
    .waitFor({ state: 'attached' })
  await nodeDatasourceDialog.locator('.search-datasource-select').selectOption('warehouse')
  await nodeDatasourceDialog.locator('.search-btn').click()
  const nodeDatasourceSearchError = nodeDatasourceDialog.locator(
    '.datasource-operation-status.error',
  )
  await nodeDatasourceSearchError.waitFor({ state: 'visible' })
  await nodeDatasourceSearchError.getByRole('button', { name: '다시 시도' }).click()
  await nodeDatasourceDialog.locator('.result-item', {
    hasText: 'dw.kpi_metrics',
  }).waitFor({ state: 'visible' })
  assert(
    nodeDatasourceSearchRequests === 2,
    'Node datasource search retry did not preserve one exact retry',
  )
  const searchResult = nodeDatasourceDialog.locator('.result-item', {
    hasText: 'dw.kpi_metrics',
  })
  const searchPreviewButton = searchResult.locator('button.preview-btn')
  await searchPreviewButton.focus()
  await ontologyLibraryPage.keyboard.press('Enter')
  const nodeDatasourceSampleDialog = ontologyLibraryPage.locator('.sample-data-dialog')
  await nodeDatasourceSampleDialog.waitFor({ state: 'visible' })
  await nodeDatasourceSampleDialog
    .locator('.datasource-operation-status.error')
    .waitFor({ state: 'visible' })
  assert(
    nodeDatasourceDirectSqlRequests[0]?.sql === 'SELECT * FROM dw.kpi_metrics LIMIT 11'
      && nodeDatasourceDirectSqlRequests[1]?.sql === 'SELECT * FROM dw.kpi_metrics LIMIT 10',
    'Node datasource probe and sample requests did not preserve their bounded table identity',
  )
  await ontologyLibraryPage.screenshot({
    path: join(evidenceDir, 'ontology-node-datasource-sample-failure-1920x1080.png'),
    fullPage: true,
  })
  await nodeDatasourceSampleDialog.locator('.close-btn').click()
  await searchPreviewButton.focus()
  await ontologyLibraryPage.keyboard.press('Space')
  await nodeDatasourceSampleDialog.locator('tbody').getByText('101', { exact: true }).waitFor()
  assert(
    nodeDatasourceDirectSqlRequests.length === 3
      && JSON.stringify(nodeDatasourceDirectSqlRequests[1])
        === JSON.stringify(nodeDatasourceDirectSqlRequests[2]),
    'Node datasource sample retry changed its frozen request',
  )
  await nodeDatasourceSampleDialog.locator('.close-btn').click()
  const searchSelectButton = searchResult.locator('button.select-btn')
  await searchSelectButton.focus()
  await ontologyLibraryPage.keyboard.press('Space')
  assert(
    await searchSelectButton.getAttribute('aria-pressed') === 'true'
      && await searchResult.evaluate(element => element.classList.contains('selected')),
    'Node datasource result selection did not expose its pressed state',
  )
  await ontologyLibraryPage.setViewportSize({ width: 390, height: 844 })
  const mobileNodeDatasourceGeometry = await ontologyLibraryPage.evaluate(() => {
    const dialog = document.querySelector('.node-datasource-dialog')?.getBoundingClientRect()
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      dialog: dialog && {
        left: dialog.left,
        top: dialog.top,
        right: dialog.right,
        bottom: dialog.bottom,
      },
    }
  })
  assert(
    mobileNodeDatasourceGeometry.documentWidth
      <= mobileNodeDatasourceGeometry.viewportWidth + 1
      && mobileNodeDatasourceGeometry.dialog
      && mobileNodeDatasourceGeometry.dialog.left >= 0
      && mobileNodeDatasourceGeometry.dialog.top >= 0
      && mobileNodeDatasourceGeometry.dialog.right
        <= mobileNodeDatasourceGeometry.viewportWidth + 1
      && mobileNodeDatasourceGeometry.dialog.bottom
        <= mobileNodeDatasourceGeometry.viewportHeight + 1,
    'Node datasource dialog is clipped or creates overflow at 390x844',
  )
  await ontologyLibraryPage.screenshot({
    path: join(evidenceDir, 'ontology-node-datasource-search-390x844.png'),
    fullPage: true,
  })
  await ontologyLibraryPage.setViewportSize({ width: 1920, height: 1080 })
  await nodeDatasourceDialog.getByRole('button', { name: /테이블 선택/ }).click()
  await nodeDatasourceDialog.locator('.datasource-selector select').selectOption('__ontology__')
  await nodeDatasourceDialog.getByText(
    'ObjectType을 실행할 데이터 소스를 선택하세요.',
    { exact: true },
  ).waitFor()
  await nodeDatasourceDialog.locator('.schema-selector select').selectOption('warehouse')
  const orderObjectType = nodeDatasourceDialog.locator('.table-item', { hasText: 'Order' })
  await orderObjectType.waitFor()
  assert(objectTypeMetadataRequests.length === 1, 'ObjectType metadata request count differs from one')
  assert(
    objectTypeMetadataRequests[0].includes('datasource=warehouse')
      && !objectTypeMetadataRequests[0].includes('datasource=__ontology__'),
    'ObjectType metadata request sent the UI sentinel instead of the execution datasource',
  )
  await ontologyLibraryPage.screenshot({
    path: join(evidenceDir, 'ontology-node-datasource-objecttype-1920x1080.png'),
    fullPage: true,
  })
  await orderObjectType.focus()
  await orderObjectType.press('Enter')
  assert(
    await orderObjectType.getAttribute('aria-pressed') === 'true',
    'Keyboard ObjectType selection is not exposed',
  )
  await nodeDatasourceDialog.getByRole('button', { name: /연결 확정/ }).click()
  const nodeDatasourceConfirmError = nodeDatasourceDialog.locator(
    '.datasource-confirm-result.error',
  )
  await nodeDatasourceConfirmError.waitFor({ state: 'visible' })
  assert(
    await nodeDatasourceDialog.isVisible(),
    'Failed node datasource confirmation closed its dialog',
  )
  await ontologyLibraryPage.screenshot({
    path: join(evidenceDir, 'ontology-node-datasource-confirmation-failure-1920x1080.png'),
    fullPage: true,
  })
  await nodeDatasourceDialog.getByRole('button', {
    name: '다시 연결 확정',
    exact: true,
  }).click()
  await nodeDatasourceDialog.waitFor({ state: 'hidden' })
  assert(nodeDatasourceListRequests === 2, 'Node datasource retry did not issue exactly one new request')
  assert(confirmedNodeDatasource?.node_id === 'sales-kpi', 'Node datasource confirmation lost the node ID')
  assert(confirmedNodeDatasource?.candidate?.table_name === 'mv_order', 'ObjectType confirmation lost the materialized view')
  assert(confirmedNodeDatasource?.candidate?.datasource === 'warehouse', 'ObjectType confirmation lost the execution datasource')
  assert(confirmedNodeDatasource?.candidate?.materializedView === 'mv_order', 'ObjectType confirmation lost materialized-view metadata')
  const nodeConfirmAttempts = datasourceConfirmationRequests.filter(
    request => request.body?.candidate?.table_name === 'mv_order',
  )
  assert(
    nodeConfirmAttempts.length === 2
      && JSON.stringify(nodeConfirmAttempts[0].body)
        === JSON.stringify(nodeConfirmAttempts[1].body),
    'Node datasource confirmation retry changed its frozen target payload',
  )

  await measureNode.focus()
  await measureNode.press('Enter')
  await ontologyLibraryPage
    .getByRole('tabpanel', { name: /정보/ })
    .getByRole('button', { name: /연결하기|재설정/ })
    .click()
  await nodeDatasourceDialog.waitFor({ state: 'visible' })
  await nodeDatasourceDialog.getByRole('button', { name: /테이블 선택/ }).click()
  await nodeDatasourceDialog.locator('.datasource-selector select').selectOption('__ontology__')
  await nodeDatasourceDialog.locator('.schema-selector select').selectOption('warehouse')
  const measureOrderObjectType = nodeDatasourceDialog.locator('.table-item', {
    hasText: 'Order',
  })
  await measureOrderObjectType.waitFor()
  await measureOrderObjectType.focus()
  await measureOrderObjectType.press('Enter')
  await nodeDatasourceDialog.getByRole('button', { name: /연결 확정/ }).click()
  await nodeDatasourceDialog.waitFor({ state: 'hidden' })
  assert(
    datasourceConfirmationRequests.at(-1)?.body?.node_id === 'sales-measure'
      && datasourceConfirmationRequests.at(-1)?.body?.candidate?.table_name === 'mv_order',
    'Relation target datasource setup lost its exact node or ObjectType target',
  )

  await salesNode.focus()
  await salesNode.press('Enter')
  await ontologyLibraryPage
    .locator('.detail-tabs')
    .getByRole('tab', { name: /데이터/ })
    .click()
  await ontologyLibraryPage.locator('.data-loading').waitFor({ state: 'visible' })
  await driverNode.focus()
  await driverNode.press('Enter')
  await ontologyLibraryPage
    .locator('.detail-tabs')
    .getByRole('tab', { name: /데이터/ })
    .click()
  await ontologyLibraryPage
    .locator('.data-source-info code')
    .getByText('dw.driver_signal', { exact: true })
    .waitFor()
  await ontologyLibraryPage.waitForFunction(() => {
    const button = document.querySelector('.brush-mode-btn')
    return button instanceof HTMLButtonElement && !button.disabled
  })
  await ontologyLibraryPage.screenshot({
    path: join(evidenceDir, 'ontology-node-data-race-1920x1080.png'),
    fullPage: true,
  })
  assert(
    cancelledOntologyNodeDataRequests.length === 1,
    'Switching nodes did not cancel the stale ontology node-data request',
  )
  assert(
    ontologyNodeDataRequests.some(request => request.nodeId === 'sales-driver')
      && ontologyNodeDataRequests.every(request =>
        request.headers['accept-language'] === 'ko'
          && request.headers['x-llm-api-key'] === 'node-agent-test-key'),
    'Ontology node-data requests lost the selected target or runtime session headers',
  )

  await salesNode.focus()
  await salesNode.press('Enter')
  await ontologyLibraryPage
    .locator('.detail-tabs')
    .getByRole('tab', { name: /데이터/ })
    .click()
  const brushModeButton = ontologyLibraryPage.getByRole('button', {
    name: '구간 선택',
    exact: true,
  })
  await brushModeButton.waitFor({ state: 'visible' })
  await brushModeButton.click()
  assert(
    await brushModeButton.getAttribute('aria-pressed') === 'true',
    'Causal brush mode did not expose its active state',
  )
  const causalChart = ontologyLibraryPage.locator('.chart-container')
  const causalChartBox = await causalChart.boundingBox()
  assert(causalChartBox, 'Causal chart has no measurable geometry')
  const brushY = causalChartBox.y + causalChartBox.height * 0.5
  await ontologyLibraryPage.mouse.move(causalChartBox.x + 55, brushY)
  await ontologyLibraryPage.mouse.down()
  await ontologyLibraryPage.mouse.move(
    causalChartBox.x + causalChartBox.width - 40,
    brushY,
    { steps: 8 },
  )
  await ontologyLibraryPage.mouse.up()
  const analysisConfigBar = ontologyLibraryPage.locator('.analysis-config-bar')
  await analysisConfigBar.waitFor({ state: 'visible' })
  assert(
    await brushModeButton.getAttribute('aria-pressed') === 'false',
    'Completed causal brush selection left the global cursor active',
  )
  const selectedCausalRange = (
    await analysisConfigBar.locator('.config-value').textContent()
  ) ?? ''
  await analysisConfigBar.getByRole('button', { name: /분석 시작/ }).click()

  const causalPanel = ontologyLibraryPage.locator('.causal-analysis-panel')
  const causalHighlightWarning = causalPanel.locator('.analysis-warning')
  await causalHighlightWarning.waitFor({ state: 'visible' })
  assert(
    await causalHighlightWarning.getByText(/분석은 계속합니다/).isVisible(),
    'Incoming-network partial failure was hidden instead of continuing with a warning',
  )
  await ontologyLibraryPage.screenshot({
    path: join(evidenceDir, 'ontology-causal-analysis-partial-warning-1920x1080.png'),
    fullPage: true,
  })
  await causalPanel.getByRole('button', { name: '분석 취소', exact: true }).click()
  await causalPanel.getByText(/인과 분석을 취소했습니다/).waitFor()
  await ontologyLibraryPage.screenshot({
    path: join(evidenceDir, 'ontology-causal-analysis-cancelled-1920x1080.png'),
    fullPage: true,
  })
  await causalPanel.getByRole('button', {
    name: '같은 조건으로 다시 분석',
    exact: true,
  }).click()
  const causalTransportError = causalPanel.locator('.analysis-error')
  await causalTransportError.waitFor({ state: 'visible' })
  assert(
    await causalTransportError.getByText('Causal analysis fixture outage', {
      exact: true,
    }).isVisible(),
    'Causal transport failure lost the backend detail or was shown as a result',
  )
  await ontologyLibraryPage.screenshot({
    path: join(evidenceDir, 'ontology-causal-analysis-failure-1920x1080.png'),
    fullPage: true,
  })
  await causalTransportError.getByRole('button', {
    name: '다시 분석',
    exact: true,
  }).click()
  await causalPanel.getByRole('heading', {
    name: '원인 분석 결과',
    exact: true,
  }).waitFor()
  await causalPanel.getByText('판매 동인', { exact: true }).waitFor()
  await ontologyLibraryPage.screenshot({
    path: join(evidenceDir, 'ontology-causal-analysis-lifecycle-1920x1080.png'),
    fullPage: true,
  })
  assert(
    causalNetworkRequests.length === 3
      && causalAnalysisRequests.length === 3
      && cancelledCausalRequests.length === 1,
    `Causal cancel/retry request counts differ from the expected lifecycle: network=${causalNetworkRequests.length}, analysis=${causalAnalysisRequests.length}, cancelled=${cancelledCausalRequests.length}`,
  )
  assert(
    causalAnalysisRequests.every(request =>
      JSON.stringify(request.body) === JSON.stringify(causalAnalysisRequests[0].body)
        && request.headers['accept-language'] === 'ko'
        && request.headers['x-llm-api-key'] === 'node-agent-test-key'),
    'Causal retry changed the selected request or lost runtime session headers',
  )
  assert(
    causalAnalysisRequests[0].body.target_metric === 'sales'
      && causalAnalysisRequests[0].body.max_lag === 7
      && selectedCausalRange.includes(causalAnalysisRequests[0].body.time_range.start)
      && selectedCausalRange.includes(causalAnalysisRequests[0].body.time_range.end),
    'Causal brush request lost its selected range, metric, or backend-supported lag',
  )
  await ontologyLibraryPage
    .locator('.detail-tabs')
    .getByRole('tab', { name: /정보/ })
    .click()

  const relationItem = ontologyLibraryPage.locator('.related-section .relation-item', {
    hasText: 'MEASURED_AS',
  })
  const relationEditButton = relationItem.locator('button.relation-edit-btn')
  await relationEditButton.focus()
  await ontologyLibraryPage.keyboard.press('Space')
  await ontologyLibraryPage.getByRole('heading', { name: /릴레이션 속성/ }).waitFor()
  await ontologyLibraryPage
    .locator('.detail-panel .form-select')
    .first()
    .selectOption('CAUSES')
  const relationEditorError = ontologyLibraryPage.locator('.relation-editor-error')
  const relationEndpointError = ontologyLibraryPage.locator('.field-status.error')
  await relationEndpointError.waitFor({ state: 'visible' })
  assert(
    ((await relationEndpointError.textContent()) ?? '').trim().length > 0,
    'Relation endpoint failure was merged into validation or shown as empty data',
  )
  const relationColumnRetry = ontologyLibraryPage.getByRole('button', {
    name: '같은 관계 컬럼 다시 시도',
    exact: true,
  })
  await relationColumnRetry.waitFor({ state: 'visible' })
  await relationColumnRetry.click()
  const relationFieldSelects = ontologyLibraryPage.locator(
    '.field-mapping-section .form-select',
  )
  await relationFieldSelects.nth(1).waitFor({ state: 'visible' })
  assert(
    await relationFieldSelects.nth(0).inputValue() === 'order_id'
      && await relationFieldSelects.nth(1).inputValue() === 'metric_id',
    'Relation-column retry did not preserve the existing field-mapping draft',
  )
  assert(
    relationColumnRequests.length === 4
      && relationColumnRequests.map(request => request.nodeId).join(',')
        === 'sales-kpi,sales-measure,sales-kpi,sales-measure'
      && relationColumnRequests.every(request =>
        request.headers['accept-language'] === 'ko'
          && request.headers['x-llm-api-key'] === 'node-agent-test-key'),
    'Relation-column retry changed its endpoints or lost runtime session headers',
  )
  await ontologyLibraryPage
    .locator('.detail-panel .form-select')
    .first()
    .selectOption('MEASURED_AS')
  assert(
    !(await relationEndpointError.isVisible().catch(() => false))
      && !(await relationEditorError.isVisible().catch(() => false)),
    'Successful relation-column retry left a stale endpoint or validation error visible',
  )
  await ontologyLibraryPage.screenshot({
    path: join(evidenceDir, 'ontology-relation-column-retry-1920x1080.png'),
    fullPage: true,
  })
  await ontologyLibraryPage.setViewportSize({ width: 390, height: 844 })
  await ontologyLibraryPage.waitForTimeout(200)
  const mobileRelationGeometry = await ontologyLibraryPage.evaluate(() => {
    const panel = document.querySelector('.detail-panel')?.getBoundingClientRect()
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      panel: panel && {
        left: panel.left,
        top: panel.top,
        right: panel.right,
        bottom: panel.bottom,
      },
    }
  })
  assert(
    mobileRelationGeometry.documentWidth <= mobileRelationGeometry.viewportWidth + 1
      && mobileRelationGeometry.panel
      && mobileRelationGeometry.panel.left >= 0
      && mobileRelationGeometry.panel.top >= 0
      && mobileRelationGeometry.panel.right <= mobileRelationGeometry.viewportWidth + 1
      && mobileRelationGeometry.panel.bottom <= mobileRelationGeometry.viewportHeight + 1,
    'Relation editor is clipped or creates overflow at 390x844',
  )
  await ontologyLibraryPage.screenshot({
    path: join(evidenceDir, 'ontology-relation-column-retry-390x844.png'),
    fullPage: true,
  })
  await ontologyLibraryPage.setViewportSize({ width: 1920, height: 1080 })
  await ontologyLibraryPage.waitForTimeout(200)

  const relationDeleteTrigger = ontologyLibraryPage.getByTitle('릴레이션 삭제', {
    exact: true,
  })
  await relationDeleteTrigger.focus()
  await relationDeleteTrigger.click()
  const relationDeleteDialog = ontologyLibraryPage.getByRole('alertdialog', {
    name: '관계 삭제',
  })
  await relationDeleteDialog.waitFor({ state: 'visible' })
  assert(
    await relationDeleteDialog.getByText(/판매 지표.*매출 측정.*MEASURED_AS/s).isVisible(),
    'Relation delete confirmation did not freeze its endpoints and type',
  )
  await relationDeleteDialog.press('Escape')
  await relationDeleteDialog.waitFor({ state: 'hidden' })
  assert(
    await relationDeleteTrigger.evaluate(element => document.activeElement === element),
    'Cancelling relation deletion did not restore focus to its trigger',
  )
  await relationDeleteTrigger.click()
  await relationDeleteDialog.getByRole('button', { name: '삭제', exact: true }).click()
  await relationDeleteDialog.waitFor({ state: 'hidden' })
  await ontologyLibraryPage.keyboard.press('Control+z')
  await salesNode.focus()
  await salesNode.press('Enter')
  await ontologyLibraryPage
    .locator('.related-section .relation-item', { hasText: 'MEASURED_AS' })
    .waitFor({ state: 'visible' })

  await measureNode.focus()
  await measureNode.press('Enter')
  const localNodeDeleteTrigger = ontologyLibraryPage.locator('.detail-header .delete-node-btn')
  await localNodeDeleteTrigger.focus()
  await localNodeDeleteTrigger.click()
  const localNodeDeleteDialog = ontologyLibraryPage.getByRole('alertdialog', {
    name: '노드 삭제',
  })
  await localNodeDeleteDialog.waitFor({ state: 'visible' })
  assert(
    await localNodeDeleteDialog.getByText(/1개의 관계도 함께 삭제/).isVisible(),
    'Local node delete confirmation did not freeze its connected relationship count',
  )
  await localNodeDeleteDialog.press('Escape')
  await localNodeDeleteDialog.waitFor({ state: 'hidden' })
  assert(await measureNode.isVisible(), 'Cancelling local node deletion removed its target')
  assert(
    await localNodeDeleteTrigger.evaluate(element => document.activeElement === element),
    'Cancelling local node deletion did not restore focus to its trigger',
  )

  await localNodeDeleteTrigger.click()
  await localNodeDeleteDialog.getByRole('button', { name: '삭제', exact: true }).click()
  await localNodeDeleteDialog.waitFor({ state: 'hidden' })
  await measureNode.waitFor({ state: 'hidden' })
  await ontologyLibraryPage.keyboard.press('Control+z')
  await measureNode.waitFor({ state: 'visible' })
  await ontologyLibraryPage.keyboard.press('Control+Shift+z')
  await measureNode.waitFor({ state: 'hidden' })
  await ontologyLibraryPage.keyboard.press('Control+z')
  await measureNode.waitFor({ state: 'visible' })
  await ontologyLibraryPage.keyboard.press('Control+y')
  await measureNode.waitFor({ state: 'hidden' })
  await ontologyLibraryPage.keyboard.press('Control+z')
  await measureNode.waitFor({ state: 'visible' })

  await measureNode.focus()
  await measureNode.press('Enter')
  await ontologyLibraryPage.getByRole('button', { name: /노드 이름 편집$/ }).click()
  const nodeNameEditor = ontologyLibraryPage.locator('.node-name-edit-input')
  await nodeNameEditor.waitFor({ state: 'visible' })
  await ontologyLibraryPage.keyboard.type('임시 이름')
  const typedNodeName = await nodeNameEditor.inputValue()
  await nodeNameEditor.press('Control+z')
  const nativeUndoneName = await nodeNameEditor.inputValue()
  assert(
    typedNodeName === '임시 이름'
      && nativeUndoneName !== typedNodeName
      && await nodeNameEditor.isVisible()
      && await measureNode.isVisible(),
    `Graph history shortcut intercepted the node-name input native undo: ${nativeUndoneName}`,
  )
  await nodeNameEditor.press('Escape')

  await measureNode.focus()
  await measureNode.press('Enter')
  await ontologyLibraryPage.getByRole('button', { name: /노드 이름 편집$/ }).click()
  await nodeNameEditor.fill('  매출 측정 수정  ')
  await nodeNameEditor.press('Enter')
  const renamedMeasureNode = ontologyLibraryPage.locator('.layer-panel .node-item', {
    hasText: '매출 측정 수정',
  })
  await renamedMeasureNode.waitFor({ state: 'visible' })
  await ontologyLibraryPage.keyboard.press('Control+z')
  await measureNode.waitFor({ state: 'visible' })
  await ontologyLibraryPage.keyboard.press('Control+y')
  await renamedMeasureNode.waitFor({ state: 'visible' })
  await ontologyLibraryPage.keyboard.press('Control+z')
  await measureNode.waitFor({ state: 'visible' })

  await measureNode.press('Enter')
  await ontologyLibraryPage.locator('.layer-badge-clickable').click()
  await ontologyLibraryPage.locator('.layer-selector-item', { hasText: 'Driver' }).click()
  const movedMeasureNode = ontologyLibraryPage
    .locator('.layer-item', { hasText: 'Driver' })
    .locator('.node-item', { hasText: '매출 측정' })
  await movedMeasureNode.waitFor({ state: 'visible' })
  await ontologyLibraryPage.keyboard.press('Control+z')
  await measureNode.waitFor({ state: 'visible' })

  const relationshipModeToggle = ontologyLibraryPage.getByRole('button', {
    name: /연결 모드 켜기/,
  })
  assert(
    await relationshipModeToggle.getAttribute('aria-pressed') === 'false',
    'Ontology relationship mode did not expose its initial pressed state',
  )
  await relationshipModeToggle.click()
  const activeRelationshipModeToggle = ontologyLibraryPage.getByRole('button', {
    name: /연결 모드 끄기/,
  })
  assert(
    await activeRelationshipModeToggle.getAttribute('aria-pressed') === 'true',
    'Ontology relationship mode did not expose its active pressed state',
  )
  await activeRelationshipModeToggle.click()
  assert(
    await relationshipModeToggle.getAttribute('aria-pressed') === 'false',
    'Ontology relationship mode did not return to node movement mode',
  )
  const graphLegend = ontologyLibraryPage.getByRole('group', {
    name: '온톨로지 그래프 범례',
  })
  await graphLegend.waitFor({ state: 'visible' })
  assert(
    (await graphLegend.innerText()).includes('KPI')
      && (await graphLegend.innerText()).includes('MEASURED_AS'),
    'Ontology graph legend lost its layer or relationship presentation',
  )

  await driverNode.click({ button: 'right' })
  await driverContextMenu.getByRole('menuitem', { name: /관계 생성/ }).click()
  await ontologyLibraryPage.locator('.detail-panel').waitFor({ state: 'hidden' })
  const pendingRelationshipBanner = ontologyLibraryPage.locator('.relation-pending-banner')
  await pendingRelationshipBanner.waitFor({ state: 'visible' })
  assert(
    (await pendingRelationshipBanner.innerText()).includes('판매 동인')
      && (await pendingRelationshipBanner.innerText()).includes('연결할 노드를 클릭하세요'),
    'Ontology pending relationship banner lost its source identity',
  )
  await pendingRelationshipBanner.evaluate(async element => {
    await Promise.all(element.getAnimations().map(animation => animation.finished))
  })
  await ontologyLibraryPage.screenshot({
    path: join(evidenceDir, 'ontology-graph-overlay-pending-1920x1080.png'),
    fullPage: true,
  })
  await ontologyLibraryPage.setViewportSize({ width: 390, height: 844 })
  const pendingBannerGeometry = await pendingRelationshipBanner.evaluate(element => {
    const rect = element.getBoundingClientRect()
    const topmost = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    )
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      isTopmost: topmost === element || (topmost instanceof Node && element.contains(topmost)),
    }
  })
  assert(
    pendingBannerGeometry.documentWidth <= pendingBannerGeometry.viewportWidth + 1
      && pendingBannerGeometry.left >= 0
      && pendingBannerGeometry.top >= 0
      && pendingBannerGeometry.right <= pendingBannerGeometry.viewportWidth + 1
      && pendingBannerGeometry.bottom <= pendingBannerGeometry.viewportHeight + 1,
    `Ontology pending relationship banner escaped mobile viewport: ${JSON.stringify(pendingBannerGeometry)}`,
  )
  assert(
    pendingBannerGeometry.isTopmost,
    'Ontology pending relationship banner remained covered by a mobile detail or layer overlay',
  )
  await ontologyLibraryPage.screenshot({
    path: join(evidenceDir, 'ontology-graph-overlay-pending-390x844.png'),
    fullPage: true,
  })
  await ontologyLibraryPage.setViewportSize({ width: 1920, height: 1080 })
  await pendingRelationshipBanner.getByRole('button', { name: '관계 생성 취소' }).click()
  await pendingRelationshipBanner.waitFor({ state: 'hidden' })
  await ontologyLibraryPage.locator('.detail-panel').waitFor({ state: 'visible' })

  await driverNode.click({ button: 'right' })
  await driverContextMenu.getByRole('menuitem', { name: /관계 생성/ }).click()
  await resourceNode.click()
  const newRelationDialog = ontologyLibraryPage.locator('.new-relation-dialog')
  await newRelationDialog.waitFor({ state: 'visible' })
  await newRelationDialog.locator('.form-select').selectOption('INFLUENCES')
  await newRelationDialog.locator('.form-input').fill('  판매 자원 영향  ')
  await newRelationDialog.getByRole('button', { name: '취소', exact: true }).click()
  await newRelationDialog.waitFor({ state: 'hidden' })
  await driverNode.press('Enter')
  const localInfluenceRelation = ontologyLibraryPage.locator(
    '.related-section .relation-item',
    { hasText: 'INFLUENCES' },
  )
  assert(
    await localInfluenceRelation.count() === 0,
    'Cancelling a local relationship draft committed it to the graph',
  )

  await driverNode.click({ button: 'right' })
  await driverContextMenu.getByRole('menuitem', { name: /관계 생성/ }).click()
  await resourceNode.click()
  await newRelationDialog.waitFor({ state: 'visible' })
  const relationTypeSelect = newRelationDialog.locator('.form-select')
  assert(
    await relationTypeSelect.evaluate(element => document.activeElement === element),
    'Local relationship dialog did not focus the controlled relationship type',
  )
  await ontologyLibraryPage.screenshot({
    path: join(evidenceDir, 'ontology-new-relation-dialog-1920x1080.png'),
    fullPage: true,
  })
  await newRelationDialog.locator('.form-select').selectOption('INFLUENCES')
  await newRelationDialog.locator('.form-input').fill('  판매 자원 영향  ')
  await newRelationDialog.getByRole('button', { name: /관계 생성/ }).click()
  await newRelationDialog.waitFor({ state: 'hidden' })
  await localInfluenceRelation.waitFor({ state: 'visible' })
  await ontologyLibraryPage.screenshot({
    path: join(evidenceDir, 'ontology-local-graph-mutation-1920x1080.png'),
    fullPage: true,
  })
  await ontologyLibraryPage.keyboard.press('Control+z')
  await localInfluenceRelation.waitFor({ state: 'hidden' })
  await ontologyLibraryPage.keyboard.press('Control+y')
  await localInfluenceRelation.waitFor({ state: 'visible' })
  await ontologyLibraryPage.keyboard.press('Control+z')
  await localInfluenceRelation.waitFor({ state: 'hidden' })

  const graphCanvas = ontologyLibraryPage.locator('.cytoscape-container')
  const graphCanvasBox = await graphCanvas.boundingBox()
  assert(graphCanvasBox, 'Ontology graph canvas has no measurable bounds')
  await ontologyLibraryPage.mouse.click(
    graphCanvasBox.x + graphCanvasBox.width - 40,
    graphCanvasBox.y + graphCanvasBox.height - 40,
    { button: 'right' },
  )
  const canvasContextMenu = ontologyLibraryPage.locator('.canvas-context-menu', {
    hasText: '새 노드 추가',
  })
  await canvasContextMenu.waitFor({ state: 'visible' })
  const contextMenuGeometry = await canvasContextMenu.evaluate(element => {
    const rect = element.getBoundingClientRect()
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    }
  })
  assert(
    contextMenuGeometry.left >= 0
      && contextMenuGeometry.top >= 0
      && contextMenuGeometry.right <= contextMenuGeometry.viewportWidth + 1
      && contextMenuGeometry.bottom <= contextMenuGeometry.viewportHeight + 1,
    `Ontology canvas context menu escaped the viewport: ${JSON.stringify(contextMenuGeometry)}`,
  )
  await ontologyLibraryPage.screenshot({
    path: join(evidenceDir, 'ontology-canvas-context-menu-1920x1080.png'),
    fullPage: true,
  })
  const processMenuItem = canvasContextMenu.getByRole('menuitem', { name: /Process/ })
  await processMenuItem.focus()
  await ontologyLibraryPage.keyboard.press('Enter')
  const createdProcessNode = ontologyLibraryPage.locator('.layer-panel .node-item', {
    hasText: '새 Process 1',
  })
  await createdProcessNode.waitFor({ state: 'visible' })
  await ontologyLibraryPage.keyboard.press('Control+z')
  await createdProcessNode.waitFor({ state: 'hidden' })
  await ontologyLibraryPage.keyboard.press('Control+y')
  await createdProcessNode.waitFor({ state: 'visible' })
  await ontologyLibraryPage.keyboard.press('Control+z')
  await createdProcessNode.waitFor({ state: 'hidden' })

  await ontologyLibraryPage.mouse.click(
    graphCanvasBox.x + graphCanvasBox.width - 70,
    graphCanvasBox.y + graphCanvasBox.height - 70,
    { button: 'right' },
  )
  await ontologyLibraryPage.locator('.canvas-context-menu', {
    hasText: '새 노드 추가',
  }).getByRole('menuitem', { name: /Measure/ }).click()
  const objectTypeMeasureNode = ontologyLibraryPage.locator(
    '.layer-panel .node-item',
    { hasText: '새 Measure 2' },
  )
  await objectTypeMeasureNode.waitFor({ state: 'visible' })
  await objectTypeMeasureNode.focus()
  await objectTypeMeasureNode.press('Enter')
  const measureDataTab = ontologyLibraryPage
    .locator('.detail-tabs')
    .getByRole('tab', { name: /데이터/ })
  assert(
    !(await measureDataTab.isDisabled()),
    'Measure ObjectType creation is unreachable because its data tab is disabled',
  )
  await measureDataTab.click()
  const createMeasureObjectTypeButton = ontologyLibraryPage
    .locator('.no-data-actions')
    .getByRole('button', { name: /ObjectType 생성/ })
  await createMeasureObjectTypeButton.click()
  const measureObjectTypeDialog = ontologyLibraryPage.getByRole('alertdialog', {
    name: 'ObjectType 생성',
  })
  await measureObjectTypeDialog.waitFor({ state: 'visible' })
  await measureObjectTypeDialog
    .getByRole('button', { name: 'ObjectType 생성', exact: true })
    .click()
  await measureObjectTypeDialog.getByRole('alert').waitFor({ state: 'visible' })
  assert(
    measureObjectTypeRequests.length === 1
      && await createMeasureObjectTypeButton.isVisible(),
    'Failed Measure ObjectType creation committed a local datasource',
  )
  await measureObjectTypeDialog
    .getByRole('button', { name: '다시 시도', exact: true })
    .click()
  await measureObjectTypeDialog.waitFor({ state: 'hidden' })
  await ontologyLibraryPage.getByText(
    "ObjectType 'SalesMeasure'이(가) 생성되었습니다.",
    { exact: true },
  ).waitFor()
  await ontologyLibraryPage.getByText(
    /ObjectType은 생성됐지만 노드 데이터를 다시 불러오지 못했습니다/,
  ).waitFor()
  assert(
    measureObjectTypeRequests.length === 2
      && JSON.stringify(measureObjectTypeRequests[0].body)
        === JSON.stringify(measureObjectTypeRequests[1].body),
    'Measure ObjectType retry did not preserve the exact target and payload',
  )
  assert(
    JSON.stringify(measureObjectTypeRequests[1].body) === JSON.stringify({
      node_id: measureObjectTypeRequests[1].body.node_id,
      node_name: '새 Measure 2',
      description: '',
    }),
    `Measure ObjectType creation payload differs from the selected node snapshot: ${JSON.stringify(measureObjectTypeRequests[1].body)}`,
  )
  assert(
    /^measure_2_\d+$/.test(measureObjectTypeRequests[1].body.node_id),
    'Measure ObjectType creation lost the selected local node identity',
  )
  assert(
    measureObjectTypeRequests.every(request =>
      request.headers['accept-language'] === 'ko'
        && request.headers['x-llm-api-key'] === 'node-agent-test-key'),
    'Measure ObjectType requests are missing runtime session headers',
  )
  assert(
    measureObjectTypeDataRequests === 1,
    'ObjectType success did not issue exactly one separate node-data refresh',
  )

  const ontologySaveButton = ontologyLibraryPage
    .locator('.header-actions')
    .getByRole('button', { name: /^💾?\s*저장$/ })
  await ontologySaveButton.click()
  const ontologySaveError = ontologyLibraryPage.locator('.ontology-operation-status.error')
  await ontologySaveError.waitFor({ state: 'visible' })
  assert(ontologySaveRequests.length === 1, 'Failed ontology save was submitted more than once')
  await ontologySaveError.getByRole('button', { name: '다시 시도' }).click()
  await ontologySaveError.waitFor({ state: 'hidden' })
  await ontologyLibraryPage.getByText(
    '온톨로지가 Neo4j에 저장되었습니다.',
    { exact: true },
  ).waitFor()
  assert(
    ontologySaveRequests.length === 2
      && JSON.stringify(ontologySaveRequests[0].body)
        === JSON.stringify(ontologySaveRequests[1].body),
    'Ontology save retry did not preserve the exact graph payload',
  )
  assert(
    ontologySaveRequests[1].body?.nodes?.some(node => node.id === 'sales-measure')
      && ontologySaveRequests[1].body?.relationships?.some(
        relationship => relationship.id === 'rel-sales-measure',
      ),
    'Local graph undo did not restore the deleted node and relationship before save',
  )
  assert(
    ontologySaveRequests.every(request =>
      request.headers['accept-language'] === 'ko'
        && request.headers['x-llm-api-key'] === 'node-agent-test-key'),
    'Ontology save requests are missing runtime session headers',
  )
  await ontologyLibraryPage.screenshot({
    path: join(evidenceDir, 'ontology-local-graph-mutation-lifecycle-1920x1080.png'),
    fullPage: true,
  })

  await ontologyLibraryPage.setViewportSize({ width: 390, height: 844 })
  await ontologyLibraryPage.waitForTimeout(250)
  const mobileNodeDeleteTrigger = ontologyLibraryPage.locator('.detail-header .delete-node-btn')
  await mobileNodeDeleteTrigger.click()
  const mobileGraphDeleteDialog = ontologyLibraryPage.getByRole('alertdialog', {
    name: '노드 삭제',
  })
  await mobileGraphDeleteDialog.waitFor({ state: 'visible' })
  const mobileGeometry = await ontologyLibraryPage.evaluate(() => {
    const dialog = document.querySelector('.action-dialog')?.getBoundingClientRect()
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      dialog: dialog && {
        left: dialog.left,
        top: dialog.top,
        right: dialog.right,
        bottom: dialog.bottom,
      },
    }
  })
  assert(
    mobileGeometry.documentWidth <= mobileGeometry.viewportWidth + 1,
    'Ontology graph workflow creates document-level horizontal overflow at 390px',
  )
  assert(
    mobileGeometry.dialog
      && mobileGeometry.dialog.left >= 0
      && mobileGeometry.dialog.top >= 0
      && mobileGeometry.dialog.right <= mobileGeometry.viewportWidth
      && mobileGeometry.dialog.bottom <= mobileGeometry.viewportHeight,
    'Ontology graph action dialog is clipped at 390x844',
  )
  await ontologyLibraryPage.screenshot({
    path: join(evidenceDir, 'ontology-local-graph-action-390x844.png'),
    fullPage: true,
  })
  await mobileGraphDeleteDialog.press('Escape')
  await mobileGraphDeleteDialog.waitFor({ state: 'hidden' })
  await ontologyLibraryPage.setViewportSize({ width: 1920, height: 1080 })
  await ontologyLibraryPage.waitForTimeout(250)

  await ontologyLibraryTrigger.click()
  const renamedOntologyRow = ontologyLibraryPage.locator('.dropdown-item', {
    hasText: '판매 핵심 온톨로지',
  })
  await renamedOntologyRow.getByTitle('온톨로지 삭제').click()
  const deleteDialog = ontologyLibraryPage.getByRole('dialog', {
    name: '온톨로지 삭제 확인',
  })
  await deleteDialog.waitFor({ state: 'visible' })
  await deleteDialog.getByRole('button', { name: '삭제', exact: true }).click()
  const deleteError = deleteDialog.locator('.delete-confirm-error')
  await deleteError.waitFor({ state: 'visible' })
  assert(ontologyLibraryDeleteRequests === 1, 'Failed delete was submitted more than once')
  assert(
    await deleteDialog.getByText('「판매 핵심 온톨로지」', { exact: true }).isVisible(),
    'Delete failure closed the confirmation or lost the target name',
  )
  await ontologyLibraryPage.screenshot({
    path: join(evidenceDir, 'ontology-schema-delete-failure-1920x1080.png'),
    fullPage: true,
  })
  await deleteDialog.getByRole('button', { name: '다시 삭제' }).click()
  await deleteDialog.waitFor({ state: 'hidden' })
  await ontologyLibraryPage.getByText(
    '온톨로지 「판매 핵심 온톨로지」이(가) 삭제되었습니다.',
    { exact: true },
  ).waitFor()
  assert(ontologyLibraryDeleteRequests === 2, 'Delete retry count differs from one')
  assert(
    await ontologyLibraryPage.evaluate(() =>
      localStorage.getItem('robo-analyzer-recent-schemas'),
    ) === '[]',
    'Deleted ontology remained in recent history',
  )
  assert(
    !(await ontologyLibraryPage.getByText('판매 지표', { exact: true }).isVisible().catch(() => false)),
    'Deleting the active ontology did not clear its viewer canvas',
  )
  await ontologyLibraryPage.waitForTimeout(300)
  await ontologyLibraryPage.screenshot({
    path: join(evidenceDir, 'ontology-schema-delete-success-1920x1080.png'),
    fullPage: true,
  })
  assert(
    ontologyLibraryErrors.length === 0,
    `Ontology library page errors: ${ontologyLibraryErrors.join(' | ')}`,
  )

  const sqlInstancePage = await context.newPage()
  const sqlInstancePageErrors = []
  let sqlInstanceMvRequest
  let sqlInstanceBulkRequest
  const sqlInstanceMvRequests = []
  const sqlInstanceBulkRequests = []
  const sqlReactRequests = []
  let schemaListRequests = 0
  let wizardActivateRequests = 0
  let wizardDetailRequests = 0
  let selectorActivateRequests = 0
  let selectorDetailRequests = 0
  let selectorDeleteRequests = 0
  let selectorSchemaDeleted = false
  let instanceCatalogRequests = 0
  let instanceBindRequests = 0
  let instanceUnbindRequests = 0
  let instanceDataRequests = 0
  let instanceBindPayload
  const instanceDataUrls = []
  sqlInstancePage.on('pageerror', error => sqlInstancePageErrors.push(error.message))
  await sqlInstancePage.route(/\/api\/gateway\/robo\/graph\/$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ nodes: [], relationships: [] }),
  }))
  await sqlInstancePage.route(/\/api\/gateway\/ontology\/schemas$/, route => {
    schemaListRequests += 1
    if (schemaListRequests === 1) {
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"detail":"Ontology wizard list fixture outage"}',
      })
    }
    if (schemaListRequests === 3) {
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"detail":"Schema selector list fixture outage"}',
      })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        schemas: selectorSchemaDeleted ? [{
          id: 'commerce-schema',
          name: 'Commerce',
          nodeCount: 1,
          hasSchemaJson: true,
        }] : [
          {
            id: 'commerce-schema',
            name: 'Commerce',
            nodeCount: 1,
            hasSchemaJson: true,
          },
          {
            id: 'archive-schema',
            name: 'Archive Commerce',
            nodeCount: 1,
            hasSchemaJson: true,
          },
        ],
        activeSchemaId: selectorSchemaDeleted ? null : 'commerce-schema',
      }),
    })
  })
  await sqlInstancePage.route(
    /\/api\/gateway\/ontology\/schemas\/commerce-schema\/activate$/,
    route => {
      wizardActivateRequests += 1
      if (wizardActivateRequests === 1) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"detail":"Ontology wizard activation fixture outage"}',
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          schemaId: 'commerce-schema',
          name: 'Commerce',
        }),
      })
    },
  )
  await sqlInstancePage.route(
    /\/api\/gateway\/ontology\/schemas\/commerce-schema$/,
    route => {
      wizardDetailRequests += 1
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'commerce-schema',
          name: 'Commerce',
          nodes: [{
            id: 'order-node',
            name: 'Order',
            label: 'Entity',
            description: '주문',
            position: { x: 120, y: 120 },
          }],
          relationships: [],
          labels: [],
        }),
      })
    },
  )
  await sqlInstancePage.route(
    /\/api\/gateway\/ontology\/schemas\/archive-schema\/activate$/,
    route => {
      selectorActivateRequests += 1
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          schemaId: 'archive-schema',
          name: 'Archive Commerce',
        }),
      })
    },
  )
  await sqlInstancePage.route(
    /\/api\/gateway\/ontology\/schemas\/archive-schema$/,
    route => {
      if (route.request().method() === 'DELETE') {
        selectorDeleteRequests += 1
        if (selectorDeleteRequests === 1) {
          return route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: '{"detail":"Schema selector delete fixture outage"}',
          })
        }
        selectorSchemaDeleted = true
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: '{"success":true}',
        })
      }

      selectorDetailRequests += 1
      if (selectorDetailRequests === 1) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"detail":"Schema selector detail fixture outage"}',
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'archive-schema',
          name: 'Archive Commerce',
          nodes: [{
            id: 'order-node',
            name: 'Order',
            label: 'Entity',
            description: '주문',
            position: { x: 120, y: 120 },
          }],
          relationships: [],
          labels: [],
        }),
      })
    },
  )
  await sqlInstancePage.route(/\/api\/gateway\/ontology\/datasources$/, route => {
    instanceCatalogRequests += 1
    if (instanceCatalogRequests === 1) {
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"detail":"Ontology datasource catalog fixture outage"}',
      })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        tables: [
          { name: 'orders', schema: 'public', description: '현재 주문' },
          { name: 'orders', schema: 'archive', description: '보관 주문' },
        ],
      }),
    })
  })
  await sqlInstancePage.route(
    /\/api\/gateway\/ontology\/nodes\/order-node\/datasource$/,
    async route => {
      if (route.request().method() === 'PUT') {
        instanceBindRequests += 1
        instanceBindPayload = route.request().postDataJSON()
        if (instanceBindRequests === 1) {
          return route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: '{"detail":"Ontology datasource binding fixture outage"}',
          })
        }
        return route.fulfill({ status: 204 })
      }
      if (route.request().method() === 'DELETE') {
        instanceUnbindRequests += 1
        if (instanceUnbindRequests === 1) {
          return route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: '{"detail":"Ontology datasource unbinding fixture outage"}',
          })
        }
        return route.fulfill({ status: 204 })
      }
      return route.abort()
    },
  )
  await sqlInstancePage.route(
    /\/api\/gateway\/ontology\/nodes\/order-node\/instances(?:\?.*)?$/,
    route => {
      instanceDataRequests += 1
      instanceDataUrls.push(route.request().url())
      if (instanceDataRequests === 1) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"detail":"Ontology instance data fixture outage"}',
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          nodeId: 'order-node',
          nodeName: 'Order',
          dataSource: 'orders',
          previewData: {
            columns: ['order_id', 'order_name'],
            rows: [[101, instanceDataRequests === 2 ? '재시도 주문' : '제한 변경 주문']],
          },
          totalCount: 1,
        }),
      })
    },
  )
  await sqlInstancePage.route(/\/api\/gateway\/text2sql\/ask$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      sql: 'SELECT order_id, order_name FROM public.orders ORDER BY order_id',
      table: {
        columns: ['order_id', 'order_name'],
        rows: [[101, '첫 주문'], [102, '두 번째 주문']],
        row_count: 2,
        execution_time_ms: 18,
      },
      charts: [],
      provenance: {
        tables: ['public.orders'],
        columns: ['order_id', 'order_name'],
        neo4j_paths: [],
        vector_matches: [],
        prompt_snapshot_id: 'ontology-sql-instance-fixture',
      },
      perf: { embedding_ms: 1, graph_search_ms: 1, llm_ms: 1, sql_ms: 18, total_ms: 21 },
      warnings: null,
    }),
  }))
  await sqlInstancePage.route(/\/api\/gateway\/text2sql\/react$/, async route => {
    sqlReactRequests.push(route.request().postDataJSON())
    const event = {
      event: 'complete',
      response: {
        status: 'completed',
        final_sql: 'SELECT order_id, order_name FROM public.orders ORDER BY order_id',
        validated_sql: 'SELECT order_id, order_name FROM public.orders ORDER BY order_id',
        execution_result: {
          columns: ['order_id', 'order_name'],
          rows: [[101, '첫 주문'], [102, '두 번째 주문']],
          row_count: 2,
          execution_time_ms: 18,
        },
        steps: [],
        collected_metadata: '',
        partial_sql: '',
        remaining_tool_calls: 0,
        session_state: null,
        conversation_state: null,
        question_to_user: null,
        warnings: null,
      },
      state: {},
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/x-ndjson',
      body: `${JSON.stringify(event)}\n`,
    })
  })
  await sqlInstancePage.route(/\/api\/gateway\/text2sql\/direct-sql\/materialized-view$/, async route => {
    sqlInstanceMvRequest = route.request().postDataJSON()
    sqlInstanceMvRequests.push(sqlInstanceMvRequest)
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Entity query Materialized View fixture outage' }),
    })
  })
  await sqlInstancePage.route(/\/api\/gateway\/ontology\/instances\/bulk-create$/, async route => {
    sqlInstanceBulkRequest = route.request().postDataJSON()
    sqlInstanceBulkRequests.push(sqlInstanceBulkRequest)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ created_count: 2 }),
    })
  })
  await sqlInstancePage.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  await sqlInstancePage.evaluate(() => {
    const app = document.querySelector('#app').__vue_app__
    app.config.globalProperties.$pinia._s.get('app-navigation').setActiveFeature('ontology')
  })
  await sqlInstancePage.locator('.ontology-tab').waitFor({ timeout: 30_000 })
  const ontologyWizard = sqlInstancePage.locator('.ontology-wizard')
  const wizardListError = ontologyWizard.locator('.schema-library-state.list-error')
  await wizardListError.waitFor({ state: 'visible' })
  assert(
    !(await ontologyWizard.getByText('저장된 온톨로지가 없습니다', { exact: true }).isVisible().catch(() => false)),
    'Ontology wizard list failure was presented as an empty list',
  )
  await sqlInstancePage.screenshot({
    path: join(evidenceDir, 'ontology-wizard-list-failure-1920x1080.png'),
    fullPage: true,
  })
  await wizardListError.getByRole('button', { name: '다시 시도' }).click()
  const wizardCommerceButton = ontologyWizard.locator('.schema-card').filter({
    has: sqlInstancePage.locator('.schema-name').filter({ hasText: /^Commerce$/ }),
  })
  await wizardCommerceButton.waitFor({ state: 'visible' })
  await wizardCommerceButton.focus()
  await wizardCommerceButton.press('Enter')
  const wizardSelectionError = ontologyWizard.locator('.schema-library-state.selection-error')
  await wizardSelectionError.waitFor({ state: 'visible' })
  assert(
    await sqlInstancePage.evaluate(() => {
      const app = document.querySelector('#app').__vue_app__
      return app.config.globalProperties.$pinia._s.get('ontology').schema
    }) === null,
    'Ontology wizard activation failure committed a schema to the store',
  )
  await sqlInstancePage.screenshot({
    path: join(evidenceDir, 'ontology-wizard-selection-failure-1920x1080.png'),
    fullPage: true,
  })
  await wizardSelectionError.getByRole('button', { name: '다시 시도' }).click()
  await sqlInstancePage.getByRole('heading', { name: /Commerce/ }).waitFor()
  await sqlInstancePage.locator('.ontology-content').waitFor({ state: 'visible' })
  assert(
    await ontologyWizard.count() === 0,
    'Ontology wizard remained mounted after the binding transition',
  )
  assert(
    wizardActivateRequests === 2 && wizardDetailRequests === 1,
    `Ontology wizard retry requests were activation=${wizardActivateRequests}, detail=${wizardDetailRequests}`,
  )
  assert(
    await sqlInstancePage.evaluate(() => {
      const app = document.querySelector('#app').__vue_app__
      const ontologyStore = app.config.globalProperties.$pinia._s.get('ontology')
      return ontologyStore.schema?.name === 'Commerce' && ontologyStore.wizard.step === 'binding'
    }),
    'Ontology wizard did not commit the fully loaded schema before entering binding',
  )
  const schemaSelector = sqlInstancePage.locator('.schema-selector')
  const schemaSelectorTrigger = schemaSelector.locator('.selector-trigger')
  await schemaSelectorTrigger.waitFor({ state: 'visible' })
  await schemaSelectorTrigger.focus()
  await schemaSelectorTrigger.press('Enter')
  const selectorListError = schemaSelector.locator('.selector-state.list-error')
  await selectorListError.waitFor({ state: 'visible' })
  assert(
    !(await schemaSelector.getByText('저장된 온톨로지가 없습니다', { exact: true }).isVisible().catch(() => false)),
    'Schema selector list failure was presented as an empty list',
  )
  await sqlInstancePage.waitForTimeout(300)
  await sqlInstancePage.screenshot({
    path: join(evidenceDir, 'ontology-schema-selector-list-failure-1920x1080.png'),
    fullPage: true,
  })
  await selectorListError.getByRole('button', { name: '다시 시도' }).click()
  const archiveSchemaButton = schemaSelector.locator('.item-main', {
    hasText: 'Archive Commerce',
  })
  await archiveSchemaButton.waitFor({ state: 'visible' })
  await archiveSchemaButton.focus()
  await archiveSchemaButton.press('Enter')
  const selectorLoadError = schemaSelector.locator('.selector-state.load-error')
  await selectorLoadError.waitFor({ state: 'visible' })
  assert(
    await sqlInstancePage.evaluate(() => {
      const app = document.querySelector('#app').__vue_app__
      return app.config.globalProperties.$pinia._s.get('ontology').schema.name
    }) === 'Commerce',
    'Schema selector detail failure replaced the previous store schema',
  )
  await sqlInstancePage.screenshot({
    path: join(evidenceDir, 'ontology-schema-selector-detail-failure-1920x1080.png'),
    fullPage: true,
  })
  await selectorLoadError.getByRole('button', { name: '다시 시도' }).click()
  await sqlInstancePage.getByRole('heading', { name: /Archive Commerce/ }).waitFor()
  assert(
    selectorActivateRequests === 1 && selectorDetailRequests === 2,
    'Schema selector detail retry repeated activation or did not retry detail once',
  )

  const orderNode = sqlInstancePage.locator('.ontology-canvas .ontology-node', { hasText: 'Order' })
  await orderNode.waitFor({ state: 'visible', timeout: 30_000 })
  await orderNode.locator('.node-name').click()
  await sqlInstancePage.locator('.ontology-canvas .ontology-node.selected', { hasText: 'Order' }).waitFor()
  const instancePanel = sqlInstancePage.locator('.instance-panel')
  await instancePanel.waitFor({ state: 'visible', timeout: 30_000 })
  const entityQueryPanel = sqlInstancePage.locator('.entity-query-panel')
  await entityQueryPanel.waitFor({ state: 'visible', timeout: 30_000 })

  const instanceCatalogError = instancePanel.locator('.catalog-error')
  await instanceCatalogError.waitFor({ state: 'visible' })
  assert(
    !(await instancePanel.getByText('사용 가능한 테이블이 없습니다', { exact: true }).isVisible().catch(() => false)),
    'InstancePanel datasource catalog failure was presented as an empty list',
  )
  assert(instanceCatalogRequests === 1, 'InstancePanel duplicated its initial datasource catalog request')
  await sqlInstancePage.screenshot({
    path: join(evidenceDir, 'ontology-instance-catalog-failure-1920x1080.png'),
    fullPage: true,
  })
  await instanceCatalogError.getByRole('button', { name: '다시 시도' }).click()
  const publicOrdersButton = instancePanel.getByRole('button', { name: 'public.orders', exact: true })
  const archiveOrdersButton = instancePanel.getByRole('button', { name: 'archive.orders', exact: true })
  await publicOrdersButton.waitFor({ state: 'visible' })
  await archiveOrdersButton.waitFor({ state: 'visible' })
  assert(
    await instancePanel.locator('.table-item').count() === 2,
    'InstancePanel collapsed same-name tables from different schemas',
  )
  await archiveOrdersButton.focus()
  await archiveOrdersButton.press('Enter')
  assert(
    await archiveOrdersButton.getAttribute('aria-pressed') === 'true',
    'InstancePanel table selection did not work from the keyboard',
  )
  await instancePanel.getByRole('button', { name: /데이터 소스 연결$/ }).click()
  const instanceBindError = instancePanel.locator('.binding-error')
  await instanceBindError.waitFor({ state: 'visible' })
  assert(instanceBindRequests === 1, 'InstancePanel duplicated the failed binding request')
  assert(
    await sqlInstancePage.evaluate(() => {
      const app = document.querySelector('#app').__vue_app__
      return app.config.globalProperties.$pinia._s.get('ontology').selectedNode.dataSource
    }) === undefined,
    'Failed datasource binding mutated the local ontology node',
  )
  await sqlInstancePage.screenshot({
    path: join(evidenceDir, 'ontology-instance-bind-failure-1920x1080.png'),
    fullPage: true,
  })
  await instancePanel.getByRole('button', { name: /데이터 소스 연결$/ }).click()
  const instanceDataError = instancePanel.locator('.instance-error')
  await instanceDataError.waitFor({ state: 'visible' })
  assert(
    instanceBindRequests === 2
      && instanceBindPayload?.dataSource === 'orders'
      && instanceBindPayload?.schema === 'archive',
    'InstancePanel binding retry did not preserve the selected schema/table identity',
  )
  assert(
    instanceDataRequests === 1 && /[?&]limit=20(?:&|$)/.test(instanceDataUrls[0]),
    'InstancePanel did not send its visible default instance limit',
  )
  assert(
    !(await instancePanel.getByText('인스턴스 데이터가 없습니다', { exact: true }).isVisible().catch(() => false)),
    'InstancePanel instance request failure was presented as empty data',
  )
  await sqlInstancePage.screenshot({
    path: join(evidenceDir, 'ontology-instance-data-failure-1920x1080.png'),
    fullPage: true,
  })
  await instanceDataError.getByRole('button', { name: '다시 시도' }).click()
  await instancePanel.getByText('재시도 주문', { exact: true }).waitFor()
  await instancePanel.getByLabel('인스턴스 조회 개수').selectOption('10')
  await instancePanel.getByText('제한 변경 주문', { exact: true }).waitFor()
  assert(
    instanceDataRequests === 3 && /[?&]limit=10(?:&|$)/.test(instanceDataUrls[2]),
    'InstancePanel limit change did not issue the selected numeric limit',
  )

  await sqlInstancePage.evaluate(() => {
    const app = document.querySelector('#app').__vue_app__
    const datasource = { name: 'shopmall', engine: 'postgres' }
    const datasourceStore = app.config.globalProperties.$pinia._s.get('datasources')
    datasourceStore.datasources = [datasource]
    datasourceStore.selectedDatasource = datasource
  })
  await entityQueryPanel.locator('textarea').fill('최근 주문을 보여줘')
  await entityQueryPanel.getByRole('button', { name: '검색', exact: true }).click()
  await entityQueryPanel.locator('.generated-sql').waitFor()
  await entityQueryPanel.getByRole('button', { name: /이 데이터를 Order 인스턴스로 채택/ }).click()
  await entityQueryPanel.locator('.instance-config').waitFor()
  await entityQueryPanel.getByRole('button', { name: '2개 인스턴스 생성' }).click()
  await entityQueryPanel.getByText('2개의 Order 인스턴스가 생성되었습니다!', { exact: true }).waitFor()
  await entityQueryPanel.getByText(/Materialized View는 생성하지 못했습니다:/).waitFor()
  assert(sqlInstanceMvRequest?.datasource === 'shopmall', 'Entity query MV request lost the datasource')
  assert(sqlInstanceBulkRequest?.schema_id === 'archive-schema', 'Entity query bulk request lost the schema')
  assert(sqlInstanceBulkRequest?.node_type === 'Order', 'Entity query bulk request lost the node type')
  assert(sqlInstanceBulkRequest?.id_column === 'order_id', 'Entity query bulk request lost the ID mapping')
  assert(sqlInstanceBulkRequest?.name_column === 'order_name', 'Entity query bulk request lost the name mapping')
  assert(sqlInstanceBulkRequest?.materialized_view === null, 'Entity query bulk request retained a failed MV')
  assert(sqlInstancePageErrors.length === 0, `Entity query page errors: ${sqlInstancePageErrors.join(' | ')}`)
  await sqlInstancePage.screenshot({
    path: join(evidenceDir, 'ontology-entity-query-partial-success-1920x1080.png'),
    fullPage: true,
  })

  await instancePanel.getByRole('button', { name: 'Order 데이터 소스 바인딩 해제' }).click()
  const instanceUnbindError = instancePanel.locator('.binding-error')
  await instanceUnbindError.waitFor({ state: 'visible' })
  assert(instanceUnbindRequests === 1, 'InstancePanel duplicated the failed unbind request')
  assert(
    await sqlInstancePage.evaluate(() => {
      const app = document.querySelector('#app').__vue_app__
      const ontologyStore = app.config.globalProperties.$pinia._s.get('ontology')
      return ontologyStore.selectedNode.dataSource === 'orders'
        && ontologyStore.instanceData?.previewData?.rows?.length > 0
    }),
    'Failed datasource unbind cleared the binding or instance data',
  )
  await sqlInstancePage.screenshot({
    path: join(evidenceDir, 'ontology-instance-unbind-failure-1920x1080.png'),
    fullPage: true,
  })
  await instancePanel.getByRole('button', { name: 'Order 데이터 소스 바인딩 해제' }).click()
  await instancePanel.locator('.binding-section').waitFor({ state: 'visible' })
  assert(
    await sqlInstancePage.evaluate(() => {
      const app = document.querySelector('#app').__vue_app__
      const ontologyStore = app.config.globalProperties.$pinia._s.get('ontology')
      return ontologyStore.selectedNode.dataSource === undefined
        && ontologyStore.instanceData === null
        && ontologyStore.instanceError === null
    }),
    'Successful datasource unbind did not clear the selected node instance state',
  )
  assert(instanceUnbindRequests === 2, 'InstancePanel unbind retry count differs from one')

  const sqlInstanceTrigger = instancePanel.getByRole('button', {
    name: 'AI 인스턴스 탐색',
    exact: true,
  })
  await sqlInstanceTrigger.click()
  const sqlInstanceExplorer = sqlInstancePage.getByRole('dialog', {
    name: 'AI 인스턴스 탐색 - Order',
  })
  await sqlInstanceExplorer.waitFor({ state: 'visible' })
  assert(
    await sqlInstanceExplorer.getByRole('button', { name: 'AI 인스턴스 탐색 닫기' })
      .evaluate(element => element === document.activeElement),
    'SQL instance explorer did not own initial focus',
  )
  await sqlInstanceExplorer.getByText(/검색 결과:\s*2건/).waitFor({ state: 'visible' })
  assert(
    sqlReactRequests.length === 1
      && sqlReactRequests[0]?.question === 'Order(주문)에 해당하는 모든 데이터를 조회해줘'
      && sqlReactRequests[0]?.datasource === 'shopmall',
    'SQL instance explorer did not preserve its generated question or selected datasource',
  )
  await sqlInstanceExplorer.getByRole('button', {
    name: '이 결과를 Order 인스턴스로 채택',
  }).click()
  await sqlInstanceExplorer.getByLabel('ID 컬럼').waitFor({ state: 'visible' })
  await sqlInstanceExplorer.getByRole('button', { name: '취소', exact: true }).click()
  await sqlInstanceExplorer.getByRole('button', {
    name: '이 결과를 Order 인스턴스로 채택',
  }).waitFor({ state: 'visible' })
  await sqlInstanceExplorer.getByRole('button', {
    name: '이 결과를 Order 인스턴스로 채택',
  }).click()
  await sqlInstanceExplorer.getByRole('button', { name: '2개 인스턴스 생성' }).click()
  await sqlInstanceExplorer.getByText(
    '2개의 Order 인스턴스가 생성되었습니다!',
    { exact: true },
  ).waitFor()
  await sqlInstanceExplorer.getByText(/Materialized View는 생성하지 못했습니다:/).waitFor()
  assert(
    sqlInstanceMvRequests.length === 2
      && sqlInstanceBulkRequests.length === 2
      && sqlInstanceBulkRequest?.schema_id === 'archive-schema'
      && sqlInstanceBulkRequest?.node_type === 'Order'
      && sqlInstanceBulkRequest?.source_question
        === 'Order(주문)에 해당하는 모든 데이터를 조회해줘'
      && sqlInstanceBulkRequest?.materialized_view === null,
    'SQL instance explorer changed the MV partial-success or bulk-create payload',
  )
  await sqlInstancePage.screenshot({
    path: join(evidenceDir, 'ontology-sql-instance-explorer-partial-success-1920x1080.png'),
    fullPage: true,
  })
  await sqlInstanceExplorer.getByRole('button', {
    name: 'AI 인스턴스 탐색 닫기',
  }).press('Escape')
  await sqlInstanceExplorer.waitFor({ state: 'hidden' })
  assert(
    await sqlInstanceTrigger.evaluate(element => element === document.activeElement),
    'SQL instance explorer Escape did not restore its trigger focus',
  )

  await schemaSelectorTrigger.click()
  const activeArchiveRow = schemaSelector.locator('.schema-item.active')
  await activeArchiveRow.getByTitle('삭제').click()
  const selectorDeleteDialog = sqlInstancePage.getByRole('dialog', {
    name: '저장된 온톨로지 삭제',
  })
  await selectorDeleteDialog.waitFor({ state: 'visible' })
  await selectorDeleteDialog.getByRole('button', { name: '삭제', exact: true }).click()
  await selectorDeleteDialog.locator('.selector-delete-error').waitFor({ state: 'visible' })
  assert(selectorDeleteRequests === 1, 'Schema selector delete failure duplicated the request')
  await sqlInstancePage.screenshot({
    path: join(evidenceDir, 'ontology-schema-selector-delete-failure-1920x1080.png'),
    fullPage: true,
  })
  await selectorDeleteDialog.getByRole('button', { name: '다시 삭제' }).click()
  await sqlInstancePage.locator('.ontology-wizard .step-input').waitFor({ state: 'visible' })
  assert(
    await sqlInstancePage.evaluate(() => {
      const app = document.querySelector('#app').__vue_app__
      return app.config.globalProperties.$pinia._s.get('ontology').schema
    }) === null,
    'Deleting the active selector schema did not reset the ontology store',
  )
  assert(selectorDeleteRequests === 2, 'Schema selector delete retry count differs from one')
  await sqlInstancePage.screenshot({
    path: join(evidenceDir, 'ontology-schema-selector-delete-success-1920x1080.png'),
    fullPage: true,
  })

  const failurePage = await context.newPage()
  const failureErrors = []
  failurePage.on('pageerror', error => failureErrors.push(error.message))
  await failurePage.route(/\/api\/gateway\/node-agent-scheduler\/agents$/, route =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{"detail":"node scheduler unavailable"}' }),
  )
  await failurePage.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  await openFeature(failurePage, '온톨로지 관리')
  await failurePage.getByText('노드 에이전트 모니터 연결 안 됨', { exact: true }).waitFor()
  assert(failureErrors.length === 0, `Node scheduler failure page errors: ${failureErrors.join(' | ')}`)
  console.log(JSON.stringify({
    result: 'passed',
    viewport: '1920x1080',
    verified: [
      'ontology modeling workflow lazy loading',
      'multi-layer ontology workflow lazy loading',
      'ontology object explorer domain lazy loading',
      'observability workflow lazy loading',
      'node-local scheduler runtime contract and session headers',
      'ontology and domain-whatif requests carry current session headers',
      'ObjectType failure differs from empty data and retry restores the list',
      'ObjectType creation keeps primary success distinct from relationship failure and retries only failed relationships',
      'ObjectType direct SQL preserves detected datasource, failure state, retry, result columns, and creation payload',
      'DB schema generation keeps datasource/schema failures distinct and commits only a real returned schema',
      'Ontology library failure differs from empty data and retry excludes damaged entries',
      'Ontology library trigger and schema selection work from the keyboard',
      'Ontology detail retry resumes after activation and recent history commits only after full load',
      'Ontology layer groups and selected-node layer options preserve native keyboard state ownership',
      'Behavior model failure, frozen retry, and same-target last-valid preservation remain explicit',
      'Ontology rename failure preserves the attempted name and Enter/blur do not duplicate the request',
      'Ontology delete failure preserves the dialog and retry clears canvas and recent history',
      'Ontology wizard list failure differs from empty data and retry restores saved schemas',
      'Ontology wizard activation failure preserves the store and retry commits only after full load',
      'Ontology binding transition exits the wizard and exposes the real canvas workflow',
      'Ontology extraction selector keeps list/load failures distinct and resumes detail without reactivation',
      'Ontology extraction selector active delete retry resets the store and returns to the wizard',
      'Node datasource catalog failure differs from empty data and retry restores choices',
      'ObjectType selection sends and persists an actual execution datasource instead of a UI sentinel',
      'datasource auto-link and node search failures remain visible with exact retry',
      'datasource mappings use keyboard disclosures and node datasource results keep preview and pressed selection as sibling actions',
      'node datasource probe failure preserves its candidate, sample failure keeps exact retry, and the dialog remains bounded at 390x844',
      'candidate confirmation commits only after validated success and preserves exact retry payload',
      'bulk datasource confirmation supports Escape, partial success, and failed-target-only retry at desktop and mobile',
      'node datasource confirmation failure preserves its dialog and frozen candidate until retry success',
      'node-filter draft cancel, distinct retry, single commit reload, clear, disabled range contracts, and session headers remain explicit',
      'node-data selection aborts stale requests, preserves runtime headers, and renders only the latest node',
      'local graph mutation preserves native canvas menu create, rename/layer/relation commit-cancel, undo/redo, frozen delete targets, renderer sync, and native input undo',
      'relation field-mapping opens from a labelled keyboard edit action and validation remains inline without discarding the editor',
      'Measure ObjectType creation preserves its snapshot across failure and separates refresh warning from primary success',
      'ontology graph save preserves the exact payload and runtime headers across failure and retry',
      'sparse graph auto-fit and the shared action dialog remain bounded at desktop and 390x844',
      'document generation preserves native PDF picker validation and same-file reselection, visible glossary retry, frozen stream retry, runtime headers, successful graph commit, and separate follow-up save',
      'producer-less model-overlay code is absent',
      'detail and What-if panel resizing supports keyboard, pointer, cancellation, reset, and accessible bounds',
      'causal analysis preserves brush input across partial warning, cancellation, exact retry, transport failure, and streamed success',
      'hidden Ontology feature-id opens the SQL-backed instance workflow',
      'InstancePanel catalog failure differs from empty data and preserves schema-qualified table identity',
      'InstancePanel bind failure preserves the node and retry sends schema plus table',
      'InstancePanel instance failure differs from empty data and retries with the selected limit',
      'InstancePanel unbind failure preserves binding and data while retry clears both',
      'Entity query MV failure keeps bulk-created instances and exposes a warning',
      'SQL instance explorer remains workflow-owned and preserves query, cancel, partial-success, and Escape behavior',
      'node-local scheduler failure is visible instead of silently ignored',
      'no browser runtime errors after physical module moves',
    ],
  }, null, 2))
} finally {
  await context.close()
  await browser.close()
}
