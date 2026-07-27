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

async function canvasOverlayIntersections(page) {
  return page.evaluate(() => {
    const overlays = [
      '.floating-controls',
      '.canvas-legend',
      '.canvas-toolbar',
      '.vue-flow__minimap',
    ].flatMap(selector => [...document.querySelectorAll(selector)])
      .filter(element => {
        const style = getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        return style.display !== 'none' && rect.width > 0 && rect.height > 0
      })
      .map(element => ({
        className: element.className.baseVal ?? element.className,
        rect: element.getBoundingClientRect().toJSON(),
      }))
    const nodes = [...document.querySelectorAll('.vue-flow__node')].map(element => ({
      id: element.getAttribute('data-id'),
      rect: element.getBoundingClientRect().toJSON(),
    }))
    const intersections = []
    for (const node of nodes) {
      for (const overlay of overlays) {
        const width = Math.max(
          0,
          Math.min(node.rect.right, overlay.rect.right)
            - Math.max(node.rect.left, overlay.rect.left),
        )
        const height = Math.max(
          0,
          Math.min(node.rect.bottom, overlay.rect.bottom)
            - Math.max(node.rect.top, overlay.rect.top),
        )
        if (width > 0 && height > 0) {
          intersections.push({
            node: node.id,
            overlay: overlay.className,
            area: width * height,
          })
        }
      }
    }
    return {
      intersections,
      firstNodeWidth: nodes[0]?.rect.width ?? 0,
      legendWidth: document.querySelector('.canvas-legend')?.getBoundingClientRect().width ?? 0,
    }
  })
}

const tables = Array.from({ length: 11 }, (_, index) => ({
  name: index === 0 ? 'orders' : `table_${index + 1}`,
  table_schema: 'sales',
  datasource: 'warehouse',
  logical_name: index === 0 ? '주문' : `테이블 ${index + 1}`,
  description: `batch table ${index + 1}`,
  description_source: 'ddl',
  analyzed_description: `batch projection ${index + 1}`,
  column_count: 1,
}))
const nodeId = name => `table-${encodeURIComponent(JSON.stringify(['warehouse', 'sales', name]))}`

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await context.addInitScript(() => {
  localStorage.setItem('robo-analyzer-api-key', 'schema-source-action-key')
})

try {
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))

  const columnRequests = []
  const columnReferenceRequests = []
  const relatedRequests = []
  let tableTwoRelatedAttempt = 0
  let tableElevenColumnAttempt = 0

  await page.route(/\/api\/gateway\/robo\/graph\/$/, route => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: '{"detail":"Analyzer graph is outside this batch scenario"}',
  }))
  await page.route(/\/api\/gateway\/robo\/schema\/relationships(?:\?.*)?$/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )
  await page.route(/\/api\/gateway\/robo\/schema\/semantic-search$/, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        name: 'semantic_orders',
        schema: 'sales',
        description: 'semantic fixture',
        similarity: 0.91,
      }]),
    }),
  )
  await page.route(/\/api\/gateway\/robo\/schema\/tables\?/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(tables),
  }))
  await page.route(/\/api\/gateway\/robo\/schema\/tables\/([^/]+)\/columns\?/, route => {
    const url = new URL(route.request().url())
    const name = decodeURIComponent(url.pathname.split('/').at(-2))
    columnRequests.push({ name, schema: url.searchParams.get('schema') })
    if (name === 'table_11') {
      tableElevenColumnAttempt += 1
      if (tableElevenColumnAttempt === 1) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"detail":"table_11 column fixture outage"}',
        })
      }
    }
    const fixtureColumns = name === 'orders'
      ? Array.from({ length: 9 }, (_, index) => ({
          name: index === 0 ? 'id' : `field_${index + 1}`,
          table_name: name,
          dtype: index === 0 ? 'bigint' : 'varchar',
          nullable: index !== 0,
          logical_name: index === 0 ? 'ID' : `필드 ${index + 1}`,
          description: `${name} field ${index + 1}`,
          description_source: 'ddl',
        }))
      : [{
          name: 'id',
          table_name: name,
          dtype: 'bigint',
          nullable: false,
          logical_name: 'ID',
          description: `${name} identifier`,
          description_source: 'ddl',
        }]
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fixtureColumns),
    })
  })
  await page.route(/\/api\/gateway\/robo\/schema\/tables\/orders\/references\?/, route => {
    columnReferenceRequests.push(route.request().url())
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"references":[],"framework_references":[]}',
    })
  })
  await page.route(/\/api\/gateway\/robo\/graph\/related-tables\/([^/?]+)(?:\?.*)?$/, route => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-1))
    relatedRequests.push(name)
    if (name === 'table_2') {
      tableTwoRelatedAttempt += 1
      if (tableTwoRelatedAttempt === 1) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"detail":"table_2 relationship fixture outage"}',
        })
      }
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ base_table: name, tables: [], relationships: [] }),
    })
  })

  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.locator('button[title="데이터 스키마"]').first().click()
  await page.locator('.panel-count').filter({ hasText: '11' }).waitFor()

  const addMenu = page.locator('.tv-btn').filter({ hasText: '테이블 추가' })
  await addMenu.click()
  await page.locator('.table-view-menu__item').filter({ hasText: '상위 10개' }).click()

  const batchAlert = page.locator('.canvas-resource-alerts [role="alert"]').filter({
    hasText: '테이블 묶음 추가에 실패했습니다',
  })
  await batchAlert.waitFor({ timeout: 20_000 }).catch(async error => {
    throw new Error(
      `${error.message}; nodes=${await page.locator('.vue-flow__node').count()}; `
      + `related=${relatedRequests.join(',')}; columns=${columnRequests.map(request => request.name).join(',')}`,
    )
  })
  assert(
    await page.locator('.vue-flow__node').count() === 0,
    'Top-table batch left partially added nodes after its second related-table request failed',
  )
  assert(
    tableTwoRelatedAttempt === 1,
    `Top-table failure target was not reached exactly once: ${tableTwoRelatedAttempt}`,
  )

  await batchAlert.getByRole('button', { name: '같은 테이블 묶음 다시 시도' }).click()
  await page.waitForFunction(() => document.querySelectorAll('.vue-flow__node').length === 10)
  assert(
    tableTwoRelatedAttempt === 2,
    'Top-table retry did not preserve and replay the failed table identity',
  )
  assert(
    relatedRequests.slice(0, 3).join(',') === 'orders,table_2,orders',
    `Top-table retry order was not frozen: ${relatedRequests.slice(0, 3).join(',')}`,
  )
  assert(
    await batchAlert.count() === 0,
    'Successful top-table retry left its visible error behind',
  )

  await page.getByRole('button', { name: '비우기', exact: true }).click()
  const clearDialog = page.getByRole('alertdialog', { name: '캔버스 비우기' })
  await clearDialog.waitFor()
  await clearDialog.getByRole('button', { name: '캔버스 비우기' }).click()
  await page.waitForFunction(() => document.querySelectorAll('.vue-flow__node').length === 0)

  await page.getByPlaceholder('테이블 검색...').fill('orders')
  const ordersRow = page.locator('.search-results > .search-row').filter({ hasText: 'orders' }).first()
  const catalogDragPayload = await ordersRow.evaluate(element => {
    const transfer = new DataTransfer()
    element.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }))
    return transfer.getData('application/json')
  })
  assert(
    JSON.parse(catalogDragPayload).table.name === 'orders'
      && JSON.parse(catalogDragPayload).table.datasource === 'warehouse',
    `Schema catalog drag payload changed: ${catalogDragPayload}`,
  )
  const ordersAddButton = ordersRow.getByRole('button', {
    name: '주문 테이블 캔버스에 추가',
  })
  await ordersAddButton.focus()
  await page.keyboard.press('Enter')
  const ordersNode = page.locator(`.vue-flow__node[data-id="${nodeId('orders')}"]`)
  await ordersNode.waitFor()
  const ordersSelectButton = ordersRow.getByRole('button', {
    name: '주문 테이블 선택',
  })
  await ordersSelectButton.focus()
  await page.keyboard.press('Space')
  assert(
    await ordersSelectButton.getAttribute('aria-pressed') === 'true',
    'Schema catalog table selection did not expose its pressed state',
  )
  const expandColumns = ordersNode.locator('button.table-node__toggle')
  await expandColumns.waitFor({ state: 'visible' })
  assert(
    await expandColumns.evaluate(element =>
      element.tagName === 'BUTTON'
        && element.getAttribute('aria-label') === 'orders 나머지 컬럼 1개 펼치기'),
    'Schema table-node column disclosure is not a native button',
  )
  await expandColumns.press('Enter')
  assert(
    await expandColumns.getAttribute('aria-expanded') === 'true'
      && await ordersNode.locator('.table-node__column').count() === 9,
    'Schema table-node native disclosure did not preserve its full column projection',
  )
  await expandColumns.press('Space')
  assert(
    await expandColumns.getAttribute('aria-expanded') === 'false'
      && await ordersNode.locator('.table-node__column').count() === 8,
    'Schema table-node native disclosure did not restore its collapsed projection',
  )
  const columnReferenceButton = ordersNode.locator('button.table-node__column-name').first()
  await columnReferenceButton.waitFor({ state: 'visible' })
  assert(
    await columnReferenceButton.evaluate(element =>
      element.tagName === 'BUTTON'
        && (element.getAttribute('aria-label') ?? '').endsWith('컬럼의 코드 참조 보기')),
    'Schema column reference control lost its native button or accessible target name',
  )
  await columnReferenceButton.press('Enter')
  await page.getByText('참조 없음 — 이 컬럼을 읽고/쓰는 코드가 없습니다.', {
    exact: true,
  }).waitFor()
  const referencePopupGeometry = await page.locator('.references-popup').evaluate(element => {
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
    referencePopupGeometry.left >= 0
      && referencePopupGeometry.top >= 0
      && referencePopupGeometry.right <= referencePopupGeometry.viewportWidth
      && referencePopupGeometry.bottom <= referencePopupGeometry.viewportHeight,
    `Keyboard-opened reference popup escaped the viewport: ${JSON.stringify(referencePopupGeometry)}`,
  )
  assert(
    columnReferenceRequests.length === 1
      && columnReferenceRequests[0].includes('schema=sales')
      && columnReferenceRequests[0].includes('column_name=id'),
    `Schema column reference activation changed its request identity: ${columnReferenceRequests.join(',')}`,
  )
  await page.screenshot({
    path: join(evidenceDir, 'schema-table-node-native-actions-1440x900.png'),
    fullPage: true,
  })
  await page.locator('.references-popup button[title="닫기"]').click()
  await page.waitForTimeout(300)
  const viewport = page.locator('.vue-flow__transformationpane')
  const transformBeforeAllFailure = await viewport.getAttribute('style')

  await addMenu.click()
  await page.locator('.table-view-menu__item').filter({ hasText: '전체' }).click()
  await batchAlert.waitFor({ timeout: 20_000 })
  assert(
    await page.locator('.vue-flow__node').count() === 1
      && await page.locator(`.vue-flow__node[data-id="${nodeId('orders')}"]`).count() === 1,
    'All-table failure deleted or partially replaced the pre-existing canvas',
  )
  assert(
    await viewport.getAttribute('style') === transformBeforeAllFailure,
    'Failed all-table attempt changed the viewport even though it did not commit',
  )
  assert(
    tableElevenColumnAttempt === 1,
    'All-table fixture did not fail at the last uncached table as intended',
  )

  await batchAlert.getByRole('button', { name: '같은 테이블 묶음 다시 시도' }).click()
  await page.waitForFunction(() => document.querySelectorAll('.vue-flow__node').length === 11)
  assert(
    tableElevenColumnAttempt === 2,
    'All-table retry did not replay the frozen last-table identity',
  )
  assert(
    await batchAlert.count() === 0,
    'Successful all-table retry left its visible error behind',
  )
  assert(
    columnRequests.every(request => request.schema === 'sales'),
    'Batch column requests lost their frozen schema identity',
  )
  await page.waitForTimeout(800)
  const expandedGeometry = await canvasOverlayIntersections(page)
  assert(
    expandedGeometry.intersections.length === 0,
    `Expanded legend fit left node/overlay intersections: ${JSON.stringify(expandedGeometry.intersections)}`,
  )

  await page.screenshot({
    path: join(evidenceDir, 'schema-canvas-batch-retry-1440x900.png'),
    fullPage: true,
  })

  await page.getByRole('button', { name: '메타데이터 출처' }).click()
  await page.locator('.canvas-toolbar__btn[title="Fit View"]').click()
  await page.waitForTimeout(800)
  const collapsedGeometry = await canvasOverlayIntersections(page)
  assert(
    collapsedGeometry.intersections.length === 0,
    `Collapsed legend fit left node/overlay intersections: ${JSON.stringify(collapsedGeometry.intersections)}`,
  )
  assert(
    collapsedGeometry.legendWidth < expandedGeometry.legendWidth,
    'Collapsed legend did not expose a smaller measured right extent to the manual fit path',
  )
  await page.screenshot({
    path: join(evidenceDir, 'schema-canvas-overlay-safe-collapsed-1440x900.png'),
    fullPage: true,
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload({ waitUntil: 'networkidle', timeout: 60_000 })
  const mobileFeature = page.locator('button[title="데이터 스키마"]').first()
  await mobileFeature.waitFor({ state: 'visible', timeout: 15_000 })
  await mobileFeature.click()
  const mobileCanvas = page.locator('.canvas-area')
  await mobileCanvas.waitFor()
  const initialMobileGeometry = await page.evaluate(() => {
    const canvas = document.querySelector('.canvas-area')?.getBoundingClientRect()
    const panel = document.querySelector('.left-panel')
    const legend = document.querySelector('.canvas-legend')
    const minimap = document.querySelector('.vue-flow__minimap')
    return {
      canvasWidth: canvas?.width ?? 0,
      panelVisibility: panel ? getComputedStyle(panel).visibility : 'missing',
      legendCollapsed: legend?.classList.contains('canvas-legend--collapsed') ?? false,
      minimapDisplay: minimap ? getComputedStyle(minimap).display : 'missing',
      rootOverflow: document.documentElement.scrollWidth - window.innerWidth,
    }
  })
  assert(
    initialMobileGeometry.canvasWidth >= 300,
    `Mobile fixed table panel still compressed the canvas to ${initialMobileGeometry.canvasWidth}px`,
  )
  assert(
    initialMobileGeometry.panelVisibility === 'hidden',
    `Mobile table drawer was not closed initially: ${initialMobileGeometry.panelVisibility}`,
  )
  assert(initialMobileGeometry.legendCollapsed, 'Mobile legend did not start collapsed')
  assert(
    initialMobileGeometry.minimapDisplay === 'none'
      || initialMobileGeometry.minimapDisplay === 'missing',
    `Mobile minimap still consumed canvas space: ${initialMobileGeometry.minimapDisplay}`,
  )
  assert(
    initialMobileGeometry.rootOverflow <= 0,
    `Mobile schema page had ${initialMobileGeometry.rootOverflow}px horizontal overflow`,
  )

  const mobilePanelTrigger = page.getByRole('button', { name: '테이블 목록 열기' })
  await mobilePanelTrigger.click()
  const mobilePanel = page.locator('#schema-table-panel')
  await page.waitForFunction(() => getComputedStyle(
    document.querySelector('#schema-table-panel'),
  ).visibility === 'visible')
  await page.waitForTimeout(250)
  const mobilePanelGeometry = await mobilePanel.evaluate(element => {
    const rect = element.getBoundingClientRect()
    return {
      left: rect.left,
      right: rect.right,
      viewportWidth: window.innerWidth,
      activeLabel: document.activeElement?.getAttribute('aria-label'),
    }
  })
  assert(
    mobilePanelGeometry.left >= 0
      && mobilePanelGeometry.right <= mobilePanelGeometry.viewportWidth,
    `Mobile drawer escaped the viewport: ${JSON.stringify(mobilePanelGeometry)}`,
  )
  assert(
    mobilePanelGeometry.activeLabel === '테이블 목록 닫기',
    `Mobile drawer did not focus its close control: ${mobilePanelGeometry.activeLabel}`,
  )
  await page.screenshot({
    path: join(evidenceDir, 'schema-canvas-mobile-drawer-open-390x844.png'),
    fullPage: true,
  })
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => getComputedStyle(
    document.querySelector('#schema-table-panel'),
  ).visibility === 'hidden')
  assert(
    await mobilePanelTrigger.evaluate(element => document.activeElement === element),
    'Escape did not restore focus to the mobile table-list trigger',
  )

  await mobilePanelTrigger.click()
  await page.getByPlaceholder('테이블 검색...').fill('orders')
  await page.getByRole('button', { name: '주문 테이블 캔버스에 추가' }).press('Space')
  await page.locator(`.vue-flow__node[data-id="${nodeId('orders')}"]`).waitFor()
  await page.waitForFunction(() => getComputedStyle(
    document.querySelector('#schema-table-panel'),
  ).visibility === 'hidden')
  await page.waitForTimeout(600)
  const mobileGeometry = await canvasOverlayIntersections(page)
  assert(
    mobileGeometry.intersections.length === 0,
    `Mobile fitted node intersected floating UI: ${JSON.stringify(mobileGeometry.intersections)}`,
  )
  assert(
    mobileGeometry.firstNodeWidth >= 100,
    `Mobile fitted node was not usable after drawer/minimap correction: ${mobileGeometry.firstNodeWidth}px`,
  )
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    'Mobile table search/add introduced document horizontal overflow',
  )
  await page.screenshot({
    path: join(evidenceDir, 'schema-canvas-mobile-drawer-390x844.png'),
    fullPage: true,
  })
  await mobilePanelTrigger.click()
  await page.waitForFunction(() => getComputedStyle(
    document.querySelector('#schema-table-panel'),
  ).visibility === 'visible')
  await page.waitForTimeout(250)
  await page.getByPlaceholder('테이블 검색...').fill('orders')
  const mobileOrdersRemove = page.getByRole('button', {
    name: '주문 테이블 캔버스에서 제거',
  })
  await mobileOrdersRemove.focus()
  await page.keyboard.press('Enter')
  await page.locator(`.vue-flow__node[data-id="${nodeId('orders')}"]`).waitFor({ state: 'detached' })
  const mobileSearchInput = page.getByPlaceholder('테이블 검색...')
  await mobileSearchInput.fill('')
  await mobileSearchInput.fill('orders')
  const semanticState = await page.evaluate(async () => {
    const app = document.querySelector('#app').__vue_app__
    const store = app.config.globalProperties.$pinia._s.get('schemaCanvas')
    await store.performSemanticSearch('orders')
    return {
      error: store.semanticSearchError,
      names: store.semanticSearchResults.map(result => result.name),
    }
  })
  assert(
    semanticState.error === null && semanticState.names.includes('semantic_orders'),
    `Schema semantic fixture did not reach the workflow store: ${JSON.stringify(semanticState)}`,
  )
  const semanticAdd = page.getByRole('button', {
    name: 'semantic_orders 의미 검색 결과를 캔버스에 추가',
  })
  await semanticAdd.waitFor({ state: 'visible' })
  const semanticDragPayload = await semanticAdd.locator('xpath=..').evaluate(element => {
    const transfer = new DataTransfer()
    element.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }))
    return transfer.getData('application/json')
  })
  assert(
    JSON.parse(semanticDragPayload).table.name === 'semantic_orders'
      && JSON.parse(semanticDragPayload).table.schema === 'sales',
    `Schema semantic drag payload changed: ${semanticDragPayload}`,
  )
  await page.screenshot({
    path: join(evidenceDir, 'schema-modeling-source-actions-390x844.png'),
    fullPage: true,
  })
  await semanticAdd.press('Space')
  await page.locator('.table-node', { hasText: 'semantic_orders' }).waitFor()
  assert(pageErrors.length === 0, `Schema batch page errors: ${pageErrors.join(' | ')}`)

  console.log(JSON.stringify({
    result: 'passed',
    viewport: '1440x900',
    requests: {
      columns: columnRequests.map(request => request.name),
      related: relatedRequests,
    },
    verified: [
      'top-10 related failure rolls back every partially added node',
      'top-10 retry preserves target identity and order',
      'all-table last-column failure preserves the existing canvas and viewport',
      'all-table retry commits all projected nodes once',
      'batch errors remain visible until retry succeeds',
      'table-node column disclosure preserves the 8-to-9 column projection from Enter and Space',
      'column reference keyboard activation preserves schema and physical-column request identity',
      'catalog and semantic drag payloads remain stable while native add/select/remove actions preserve exact canvas results',
      'expanded legend, controls, toolbar and minimap do not intersect fitted nodes',
      'collapsed legend releases right inset on the shared manual fit path',
      'mobile table panel is a focused Escape-safe drawer instead of fixed canvas width',
      'mobile search/add returns to a usable overlay-safe canvas without horizontal overflow',
    ],
  }, null, 2))
} finally {
  await context.close()
  await browser.close()
}
