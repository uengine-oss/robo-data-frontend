import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createNativeRecordingSession,
} from '../../../../../goal-verify/e2e/recording-contract.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../../..')
const require = createRequire(join(repoRoot, '.unittest/package.json'))
const { chromium } = require('playwright')

const baseUrl = process.env.FRONTEND_URL ?? 'http://127.0.0.1:3000'
const gatewayUrl = process.env.GATEWAY_URL ?? 'http://127.0.0.1:9000'
const evidenceDir = resolve(here, '../evidence')
const screenshotDir = join(evidenceDir, 'screenshots', 'checkpoint')
const recordingPath = process.env.RECORD_VIDEO_PATH
  ? resolve(process.env.RECORD_VIDEO_PATH)
  : null
const recordingEvents = []
let recordingStartedAt = 0
const database = 'neo4j'
const cartFileId = 'code:shop_mall/order/cart.c'
const cartAddId = 'code:shop_mall/order/cart.c:cart_add_item'
const countCartId = 'code:shop_mall/order/cart.c:count_cart_items'
const removableNodeId = 'code:shop_mall/order/cart.c:load_cart_rows'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function graphInventory(request) {
  const response = await request.get(`${gatewayUrl}/api/gateway/robo/graph/`, {
    headers: { 'X-Neo4j-Database': database },
    timeout: 120_000,
  })
  assert(response.ok(), `graph inventory HTTP ${response.status()}`)
  const body = await response.json()
  const nodes = Array.isArray(body.Nodes) ? body.Nodes : []
  const relationships = Array.isArray(body.Relationships) ? body.Relationships : []
  return {
    nodes: nodes.length,
    relationships: relationships.length,
    ids: new Set(nodes.map(node => String(node.Properties?.id ?? node.id ?? ''))),
    relationshipTypes: new Set(
      relationships.map(relationship => String(relationship.Type ?? relationship.type ?? '').toUpperCase()),
    ),
    riskNode: nodes
      .map(node => ({
        id: String(node.Properties?.id ?? node.id ?? ''),
        name: String(node.Properties?.name ?? ''),
        labels: (node.Labels ?? []).map(String),
        risk: String(node.Properties?.risk_level ?? ''),
      }))
      .find(node => node.id && node.name && node.labels.includes('FUNCTION') && node.risk),
  }
}

async function graphSnapshot(page) {
  return page.evaluate(() => {
    const host = document.querySelector('.nvl-graph')
    if (!host) return null
    let vm = host.__vueParentComponent
    let nvl = null
    for (let depth = 0; vm && depth < 8; depth += 1, vm = vm.parent) {
      if (typeof vm.exposed?.getAutomationSnapshot === 'function') {
        return vm.exposed.getAutomationSnapshot()
      }
      const candidate = vm.setupState?.nvlInstance || vm.devtoolsRawSetupState?.nvlInstance
      if (candidate) {
        nvl = candidate?.value || candidate
        if (typeof nvl?.getNodePositions === 'function') break
      }
    }
    if (!nvl || typeof nvl.getNodePositions !== 'function') return null
    return {
      ids: nvl.getNodePositions().map(item => String(item.id)),
      scale: Number(nvl.getScale()),
    }
  })
}

async function clusterSeparationSnapshot(page) {
  return page.evaluate(() => {
    const host = document.querySelector('.nvl-graph')
    if (!host) return null
    const read = name => Number(host.dataset[name])
    const status = host.dataset.clusterSeparationStatus || ''
    if (host.dataset.clusterSevereBefore === '') {
      return status ? { status } : null
    }
    return {
      status,
      adjustedPairCount: read('clusterAdjustments'),
      severeBefore: read('clusterSevereBefore'),
      severeAfter: read('clusterSevereAfter'),
      maxOverlapBefore: read('clusterMaxOverlapBefore'),
      maxOverlapAfter: read('clusterMaxOverlapAfter'),
      maxTranslation: read('clusterMaxTranslation'),
    }
  })
}

async function graphPoint(page, nodeId, timeout = 30_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const point = await page.evaluate((wantedId) => {
      const host = document.querySelector('.nvl-graph')
      if (!host) return null
      let vm = host.__vueParentComponent
      let nvl = null
      for (let depth = 0; vm && depth < 8; depth += 1, vm = vm.parent) {
        if (typeof vm.exposed?.getNodeClientPoint === 'function') {
          return vm.exposed.getNodeClientPoint(wantedId)
        }
        const candidate = vm.setupState?.nvlInstance || vm.devtoolsRawSetupState?.nvlInstance
        if (candidate) {
          nvl = candidate?.value || candidate
          if (typeof nvl?.getNodePositions === 'function') break
        }
      }
      if (!nvl || typeof nvl.getNodePositions !== 'function') return null
      const position = nvl.getNodePositions().find(item => String(item.id) === String(wantedId))
      if (!position) return null
      const scale = nvl.getScale()
      const pan = nvl.getPan()
      const dpr = window.devicePixelRatio || 1
      const rect = host.getBoundingClientRect()
      return {
        x: rect.left + (position.x - pan.x) * scale / dpr + host.clientWidth / 2,
        y: rect.top + (position.y - pan.y) * scale / dpr + host.clientHeight / 2,
      }
    }, nodeId)
    if (point) return point
    await page.waitForTimeout(250)
  }
  throw new Error(`graph node did not become measurable: ${nodeId}`)
}

async function visibleGraphPoint(page, nodeId) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const point = await graphPoint(page, nodeId)
    const geometry = await page.evaluate(({ x, y }) => {
      const graph = document.querySelector('.nvl-graph')
      const panel = document.querySelector('.floating-panel.right')
      if (!(graph instanceof HTMLElement)) return { visible: false, center: null }
      const rect = graph.getBoundingClientRect()
      const panelRect = panel instanceof HTMLElement ? panel.getBoundingClientRect() : null
      const right = panelRect && panelRect.x > rect.x ? panelRect.x : rect.right
      return {
        visible: x >= rect.left + 40 && x <= right - 40 && y >= rect.top + 40 && y <= rect.bottom - 40,
        center: { x: rect.left + (right - rect.left) / 2, y: rect.top + rect.height / 2 },
      }
    }, point)
    if (geometry.visible) return point
    assert(geometry.center, 'graph visible geometry is unavailable')
    await page.mouse.move(geometry.center.x, geometry.center.y)
    await page.mouse.wheel(0, 300)
    await page.waitForTimeout(1_200)
  }
  throw new Error(`graph node could not be brought into the visible canvas: ${nodeId}`)
}

async function waitForGraphIds(page, expectedIds, timeout = 30_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const snapshot = await graphSnapshot(page)
    if (snapshot && expectedIds.every(id => snapshot.ids.includes(id))) return snapshot
    await page.waitForTimeout(300)
  }
  const snapshot = await graphSnapshot(page)
  throw new Error(
    `graph ids missing: ${expectedIds.filter(id => !snapshot?.ids?.includes(id)).join(', ')}; `
    + `snapshot=${JSON.stringify(snapshot)?.slice(0, 4000)}`,
  )
}

async function waitForStableGraph(page, timeout = 20_000) {
  const deadline = Date.now() + timeout
  let previous = await graphSnapshot(page)
  let stableSamples = 0
  while (Date.now() < deadline) {
    await page.waitForTimeout(1_000)
    const current = await graphSnapshot(page)
    if (
      current
      && previous
      && current.ids.length === previous.ids.length
      && Math.abs(current.scale - previous.scale) <= 0.0001
    ) {
      stableSamples += 1
      if (stableSamples >= 3) return current
    } else {
      stableSamples = 0
    }
    previous = current
  }
  throw new Error('graph did not reach a stable scale')
}

async function navigatorLabel(page, name, idPattern = null) {
  const labels = page.locator('.navigator-panel .nav-tree-label')
  await labels.first().waitFor({ state: 'visible', timeout: 60_000 })
  const count = await labels.count()
  for (let index = 0; index < count; index += 1) {
    const label = labels.nth(index)
    const visibleName = ((await label.locator('.name').textContent().catch(() => '')) ?? '').trim()
    const title = await label.getAttribute('title')
    if (visibleName === name && (!idPattern || idPattern.test(title ?? ''))) return label
  }
  throw new Error(`Navigator label not found: ${name}`)
}

async function dragToCanvas(page, source) {
  const sourceBox = await source.boundingBox()
  const canvas = page.locator('.nvl-graph').first()
  const canvasBox = await canvas.boundingBox()
  assert(sourceBox && canvasBox, 'Navigator drag geometry is unavailable')
  const start = { x: sourceBox.x + sourceBox.width / 2, y: sourceBox.y + sourceBox.height / 2 }
  const end = { x: canvasBox.x + canvasBox.width * 0.42, y: canvasBox.y + canvasBox.height * 0.52 }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  for (let step = 1; step <= 20; step += 1) {
    const ratio = step / 20
    await page.mouse.move(
      start.x + (end.x - start.x) * ratio,
      start.y + (end.y - start.y) * ratio,
    )
  }
  await page.mouse.up()
}

async function scrollDown(page, locator, total = 420) {
  await locator.waitFor({ state: 'visible', timeout: 10_000 })
  const box = await locator.boundingBox()
  assert(box, 'scroll target geometry is unavailable')
  await page.mouse.move(box.x + box.width * 0.78, box.y + box.height * 0.72, { steps: 14 })
  const steps = 8
  for (let index = 0; index < steps; index += 1) {
    await page.mouse.wheel(0, total / steps)
    await page.waitForTimeout(120)
  }
  await page.waitForTimeout(1_200)
}

async function zoomGraphIn(page, total = 420) {
  const before = await waitForStableGraph(page)
  const center = await page.evaluate(() => {
    const graph = document.querySelector('.nvl-graph')
    const panel = document.querySelector('.floating-panel.right')
    if (!(graph instanceof HTMLElement)) return null
    const graphRect = graph.getBoundingClientRect()
    const panelRect = panel instanceof HTMLElement ? panel.getBoundingClientRect() : null
    const visibleRight = panelRect && panelRect.left > graphRect.left
      ? panelRect.left
      : graphRect.right
    return {
      x: graphRect.left + (visibleRight - graphRect.left) / 2,
      y: graphRect.top + graphRect.height / 2,
    }
  })
  assert(center, 'graph zoom geometry is unavailable')
  await page.mouse.move(center.x, center.y, { steps: 18 })
  const steps = 6
  for (let index = 0; index < steps; index += 1) {
    await page.mouse.wheel(0, -total / steps)
    await page.waitForTimeout(180)
  }
  const after = await waitForStableGraph(page)
  assert(
    after.scale > before.scale,
    `graph wheel zoom-in did not increase scale: ${before.scale} -> ${after.scale}`,
  )
  return { before: before.scale, after: after.scale }
}

async function selectOverviewBadge(page, label) {
  const badge = page.locator('.stat-badge.clickable')
    .filter({ hasText: new RegExp(`^${label}\\s*\\(`, 'i') })
    .first()
  await badge.waitFor({ state: 'visible', timeout: 30_000 })
  if (!(await badge.evaluate(element => element.classList.contains('active')))) {
    await badge.click()
    await page.waitForTimeout(3_000)
  }
  return badge
}

async function setStyle(page, selector, label, color, sizeTitle) {
  const badge = page.locator(selector).filter({ hasText: new RegExp(`^${label}\\s*\\(`, 'i') }).first()
  await badge.click({ button: 'right' })
  const panel = page.locator('.graph-style-panel').filter({ hasText: label }).first()
  await panel.waitFor({ state: 'visible', timeout: 10_000 })
  await panel.locator(`.color-swatch[title="${color}"]`).click()
  await panel.locator(`.size-swatch[title="${sizeTitle}"]`).click()
  await panel.getByTitle('닫기', { exact: true }).click()
  await page.waitForTimeout(1_500)
}

async function setRelationshipShown(page, type, shown) {
  const button = page.getByTitle(/필터.*노드.*관계/)
  await button.click()
  const menu = page.locator('.view-menu-pop:visible').last()
  const chip = menu.locator('.vm-chips').last().locator('.vm-chip')
    .filter({ hasText: new RegExp(`^${type}\\s*\\d*$`, 'i') })
    .first()
  await chip.waitFor({ state: 'visible', timeout: 10_000 })
  const current = !(await chip.evaluate(element => element.classList.contains('off')))
  if (current !== shown) {
    await chip.click()
    await page.waitForTimeout(2_000)
  }
  const finalState = !(await chip.evaluate(element => element.classList.contains('off')))
  assert(finalState === shown, `${type} filter did not become ${shown ? 'shown' : 'hidden'}`)
  await button.click()
}

async function selectViewMode(page, name) {
  await page.locator('.view-menu-btn').filter({ hasText: /보기:/ }).click()
  await page.locator('.view-menu-item').filter({ hasText: name }).click()
  await page.waitForTimeout(4_000)
  const snapshot = await graphSnapshot(page)
  assert(snapshot?.ids?.length > 0, `${name} produced an empty graph`)
  return { name, nodes: snapshot.ids.length, scale: snapshot.scale }
}

async function screenshot(page, name) {
  await page.screenshot({ path: join(screenshotDir, name), fullPage: true })
  if (recordingPath) {
    recordingEvents.push({ name, offsetMs: Date.now() - recordingStartedAt })
    await page.waitForTimeout(6_500)
  }
}

await mkdir(screenshotDir, { recursive: true })
if (recordingPath) await mkdir(dirname(recordingPath), { recursive: true })
const nativeRecording = recordingPath
  ? await createNativeRecordingSession(chromium, recordingPath)
  : null
const browser = nativeRecording
  ? nativeRecording.browser
  : await chromium.launch({ headless: true })
const context = nativeRecording
  ? nativeRecording.context
  : await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'ko-KR' })
const page = nativeRecording ? nativeRecording.page : await context.newPage()
if (recordingPath) {
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const cursor = document.createElement('div')
      cursor.id = 'e2e-recording-cursor'
      Object.assign(cursor.style, {
        position: 'fixed',
        zIndex: '2147483647',
        width: '18px',
        height: '18px',
        border: '3px solid #ffffff',
        borderRadius: '50%',
        background: '#2563eb',
        boxShadow: '0 1px 6px rgba(0,0,0,.6)',
        pointerEvents: 'none',
        transform: 'translate(-50%, -50%)',
        left: '24px',
        top: '24px',
      })
      document.documentElement.append(cursor)
      document.addEventListener('mousemove', event => {
        cursor.style.left = `${event.clientX}px`
        cursor.style.top = `${event.clientY}px`
      }, true)
      document.addEventListener('mousedown', () => {
        cursor.style.transform = 'translate(-50%, -50%) scale(.78)'
      }, true)
      document.addEventListener('mouseup', () => {
        cursor.style.transform = 'translate(-50%, -50%) scale(1)'
      }, true)
    }, { once: true })
  })
}
const pageErrors = []
const consoleErrors = []
const requestFailures = []
const httpFailures = []
const requests = []
const interactions = []
const blockedMutations = []

page.on('pageerror', error => pageErrors.push(error.message))
page.on('console', message => {
  if (message.type() === 'error') consoleErrors.push(message.text())
})
page.on('requestfailed', request => {
  requestFailures.push({ url: request.url(), error: request.failure()?.errorText })
})
page.on('response', response => {
  const item = { method: response.request().method(), status: response.status(), url: response.url() }
  if (response.url().includes('/api/gateway/')) requests.push(item)
  if (response.status() >= 500) httpFailures.push(item)
})
await page.route('**/api/gateway/**', async route => {
  const request = route.request()
  const method = request.method()
  const url = request.url()
  const semanticRead = method === 'POST' && url.includes('/robo/search/semantic')
  const safeMethod = ['GET', 'HEAD', 'OPTIONS'].includes(method)
  if (safeMethod || semanticRead) return route.continue()
  blockedMutations.push({ method, url })
  return route.abort('blockedbyclient')
})

let result
try {
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  const inventoryBefore = await graphInventory(page.request)
  assert(inventoryBefore.nodes > 0 && inventoryBefore.relationships > 0, 'Neo4j checkpoint is empty')
  for (const id of [cartFileId, cartAddId, countCartId, removableNodeId]) {
    assert(inventoryBefore.ids.has(id), `checkpoint node missing: ${id}`)
  }
  for (const type of ['CALLS', 'READS', 'WRITES']) {
    assert(inventoryBefore.relationshipTypes.has(type), `checkpoint relationship missing: ${type}`)
  }

  await page.getByTitle('코드 그래프', { exact: true }).click()
  await page.locator('.graph-tab .nvl-graph').waitFor({ state: 'visible', timeout: 60_000 })
  await page.locator('.navigator-panel .nav-tree-label').first().waitFor({ state: 'visible', timeout: 60_000 })
  const modulesSection = page.locator('.navigator-panel .nav-section').filter({
    has: page.locator('.section-label', { hasText: /^MODULES$/ }),
  })
  const tableSection = page.locator('.navigator-panel .nav-section').filter({
    has: page.locator('.section-label', { hasText: /^TABLES$/ }),
  })
  assert(
    (await modulesSection.locator('.section-count').textContent())?.trim() === '6',
    'checkpoint Navigator did not preserve 6 modules',
  )
  assert(
    (await tableSection.locator('.section-count').textContent())?.trim() === '22',
    'checkpoint Navigator did not preserve 22 tables',
  )
  await page.getByTitle('모두 펼치기', { exact: true }).click()
  const expandedCartFile = await navigatorLabel(page, 'cart', /order\/cart\.c$/)
  const expandedCartAddFunction = await navigatorLabel(
    page,
    'cart_add_item',
    /order\/cart\.c:cart_add_item$/,
  )
  assert(await expandedCartFile.isVisible(), 'Navigator recording did not start with all nodes expanded')
  assert(
    await expandedCartAddFunction.isVisible(),
    'Navigator recording did not start with cart functions expanded',
  )
  if (nativeRecording) {
    const recording = await nativeRecording.start()
    recordingStartedAt = recording.startedAt
  }

  const clear = page.getByRole('button', { name: /캔버스 비우기/ })
  if (await clear.isVisible().catch(() => false)) await clear.click()
  const navSearch = page.locator('.navigator-panel input[placeholder*="목록에서 좁히기"]')
  assert((await navSearch.inputValue()) === '', 'Navigator recording started with a search filter')
  const cartFile = expandedCartFile
  assert(await cartFile.getAttribute('title') === cartFileId, 'Navigator cart FILE id differs from checkpoint')
  await cartFile.scrollIntoViewIfNeeded()
  await dragToCanvas(page, cartFile)
  await waitForGraphIds(page, [cartFileId])
  interactions.push('Navigator cart FILE drag to canvas')
  await screenshot(page, '07-analyzer-navigator-file-1920x1080.png')

  const filePoint = await graphPoint(page, cartFileId)
  await page.mouse.dblclick(filePoint.x, filePoint.y)
  const expanded = await waitForGraphIds(page, [cartFileId, cartAddId, countCartId], 60_000)
  assert(expanded.ids.length > 3, 'FILE double-click did not expand related nodes')
  interactions.push('cart FILE canvas double-click expansion')

  const cartAddFunction = expandedCartAddFunction
  await cartAddFunction.dblclick({ delay: 90 })
  await page.waitForTimeout(1_500)
  assert(
    await cartAddFunction.evaluate(element =>
      element.classList.contains('selected') && element.classList.contains('on-canvas')),
    'Navigator cart_add_item double-click did not select the function on canvas',
  )
  const detail = page.locator('.floating-panel.right')
  await detail.locator('.identity-tech').filter({ hasText: /^cart_add_item$/ }).waitFor({
    state: 'visible',
    timeout: 15_000,
  })
  await detail.getByText(/cart\.c/, { exact: false }).first().waitFor({ state: 'visible' })
  await detail.getByRole('region', { name: '원문 코드' }).waitFor({ state: 'visible' })
  await scrollDown(page, detail.locator('.panel-body'), 460)
  interactions.push('Navigator cart_add_item function double-click, source detail, and downward scroll')
  await screenshot(page, '08-analyzer-function-detail-1920x1080.png')

  const countPoint = await visibleGraphPoint(page, removableNodeId)
  await page.mouse.click(countPoint.x, countPoint.y, { button: 'right' })
  const contextMenu = page.locator('.context-menu')
  await contextMenu.waitFor({ state: 'visible' })
  const [graphBox, menuBox] = await Promise.all([
    page.locator('.nvl-graph').boundingBox(),
    contextMenu.boundingBox(),
  ])
  assert(graphBox && menuBox, 'context menu geometry was not measurable')
  assert(
    menuBox.x >= graphBox.x
      && menuBox.y >= graphBox.y
      && menuBox.x + menuBox.width <= graphBox.x + graphBox.width
      && menuBox.y + menuBox.height <= graphBox.y + graphBox.height,
    `context menu escaped graph viewport: ${JSON.stringify({ graphBox, menuBox })}`,
  )
  await contextMenu.getByText('캔버스에서 제거', { exact: true }).click()
  const removalDeadline = Date.now() + 10_000
  let afterRemoval = await graphSnapshot(page)
  while (afterRemoval?.ids.includes(removableNodeId) && Date.now() < removalDeadline) {
    await page.waitForTimeout(250)
    afterRemoval = await graphSnapshot(page)
  }
  assert(!afterRemoval.ids.includes(removableNodeId), 'removed node remained on canvas')
  assert(inventoryBefore.ids.has(removableNodeId), 'canvas removal mutated persistent inventory')
  interactions.push('canvas-only node removal')

  await page.locator('.nvl-graph').click({ position: { x: 600, y: 120 } })
  await detail.getByText('Overview', { exact: true }).waitFor({ state: 'visible', timeout: 15_000 })
  await clear.click()
  await navSearch.fill('')
  await selectOverviewBadge(page, 'TABLE')
  await selectOverviewBadge(page, 'QUERY')
  const belongsTo = page.locator('.stat-badge.rel.clickable')
    .filter({ hasText: /^BELONGS_TO\s*\(/i })
    .first()
  if (await belongsTo.isVisible().catch(() => false)) {
    await belongsTo.click()
    await page.waitForTimeout(3_000)
  }
  const overview = await graphSnapshot(page)
  assert(overview.ids.length > 0, 'Overview TABLE+QUERY projection is empty')
  interactions.push('Overview TABLE + QUERY + BELONGS_TO projection')
  const overviewZoom = await zoomGraphIn(page)
  interactions.push(`Overview canvas wheel zoom-in: ${overviewZoom.before} -> ${overviewZoom.after}`)
  await screenshot(page, '09-analyzer-overview-1920x1080.png')

  const beforeStyle = await waitForStableGraph(page)
  await setStyle(page, '.stat-badge.rel', 'READS', '#87CEEB', 'Width: 4')
  await setStyle(page, '.stat-badge.rel', 'CALLS', '#CD5C5C', 'Width: 4')
  await setStyle(page, '.stat-badge.clickable', 'TABLE', '#FFD700', 'Size: 28')
  await setStyle(page, '.stat-badge.clickable', 'QUERY', '#DDA0DD', 'Size: 20')
  const afterStyle = await waitForStableGraph(page)
  assert(
    Math.abs(afterStyle.scale - beforeStyle.scale) <= 0.001,
    `style update changed graph scale: ${beforeStyle.scale} -> ${afterStyle.scale}`,
  )
  interactions.push('relationship and node style customization without refit')

  await setRelationshipShown(page, 'READS', false)
  await screenshot(page, '10-analyzer-reads-off-1920x1080.png')
  await setRelationshipShown(page, 'READS', true)
  interactions.push('READS filter off and restoration')

  const nameToggle = page.locator('.name-toggle').first()
  const beforeNameMode = (await nameToggle.textContent())?.trim()
  await nameToggle.click()
  await page.waitForTimeout(3_000)
  const afterNameMode = (await nameToggle.textContent())?.trim()
  assert(beforeNameMode !== afterNameMode, 'logical-name toggle did not change mode')
  interactions.push(`name mode toggle: ${beforeNameMode} -> ${afterNameMode}`)

  await clear.click()
  const viewModes = []
  viewModes.push(await selectViewMode(page, '모듈간 상호작용'))
  await modulesSection.locator('.section-header').click()
  await tableSection.locator('.section-header').scrollIntoViewIfNeeded()
  assert(
    (await tableSection.locator('.section-count').textContent())?.trim() === '22',
    'module view Navigator did not preserve 22 tables',
  )
  await screenshot(page, '11-analyzer-module-view-1920x1080.png')
  interactions.push('module interaction cohesion/coupling and cross-area relationship risk colors')
  viewModes.push(await selectViewMode(page, '실제 업무 단위'))
  await page.waitForFunction(() => {
    const status = document.querySelector('.nvl-graph')?.dataset.clusterSeparationStatus
    return status === 'measured' || status === 'skipped-unstable'
  }, null, { timeout: 60_000 })
  const clusterSeparation = await clusterSeparationSnapshot(page)
  assert(clusterSeparation, 'business-unit cluster separation diagnostics are unavailable')
  if (clusterSeparation.status === 'measured') {
    assert(
      clusterSeparation.severeAfter === 0,
      `severe cluster overlap remained: ${JSON.stringify(clusterSeparation)}`,
    )
    assert(
      clusterSeparation.severeBefore === 0 || clusterSeparation.adjustedPairCount > 0,
      `severe overlap was detected but not adjusted: ${JSON.stringify(clusterSeparation)}`,
    )
  } else {
    assert(
      clusterSeparation.status === 'skipped-unstable',
      `unexpected cluster separation status: ${JSON.stringify(clusterSeparation)}`,
    )
  }
  await screenshot(page, '12-analyzer-business-unit-view-1920x1080.png')

  await selectViewMode(page, '실제 업무 단위')
  assert(
    (await page.locator('.view-menu-btn').filter({ hasText: /보기:/ }).textContent())?.includes('기본'),
    'business-unit view did not toggle back to default',
  )
  await page.locator('.nvl-graph').click({ position: { x: 40, y: 600 } })
  if (await clear.isVisible().catch(() => false)) await clear.click()
  await detail.getByText('Overview', { exact: true }).waitFor({ state: 'visible', timeout: 15_000 })
  const graphSearch = page.getByPlaceholder(/노드 이름.*업무 말로 물어보기/)
  await graphSearch.fill('주문 처리 과정에서 재고 예약, 실제 재고 차감, 부족 재고 거절은 어떤 코드 흐름으로 연결되는가?')
  const semanticResponsePromise = page.waitForResponse(response =>
    response.request().method() === 'POST' && response.url().includes('/robo/search/semantic'),
  )
  await page.getByRole('button', { name: /의미로 더 찾기/ }).click()
  const semanticResponse = await semanticResponsePromise
  const semanticOutcome = page.locator('.sem-cluster, .sem-empty, .sem-error').first()
  await semanticOutcome.waitFor({ state: 'visible', timeout: 300_000 })
  const cluster = page.locator('.sem-cluster').first()
  assert(await cluster.isVisible().catch(() => false), `semantic search failed: ${await semanticOutcome.textContent()}`)
  const semanticEvents = (await semanticResponse.text())
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line))
  const resultEvent = semanticEvents.find(event => event.type === 'result')
  const firstCluster = resultEvent?.clusters?.[0]
  const semanticNodeIds = (firstCluster?.nodes ?? [])
    .map(node => String(node.id ?? ''))
    .filter(id => id && inventoryBefore.ids.has(id))
  assert(semanticNodeIds.length > 0, 'semantic result had no checkpoint-backed graph nodes')
  await cluster.click()
  await waitForGraphIds(page, semanticNodeIds, 30_000)
  interactions.push(`semantic search cluster grounded ${semanticNodeIds.length} backend node(s) on canvas`)
  await screenshot(page, '15-analyzer-semantic-search-1920x1080.png')

  const inventoryAfter = await graphInventory(page.request)
  assert(inventoryAfter.nodes === inventoryBefore.nodes, 'checkpoint node count changed')
  assert(inventoryAfter.relationships === inventoryBefore.relationships, 'checkpoint relationship count changed')
  assert(blockedMutations.length === 0, `product attempted mutations: ${JSON.stringify(blockedMutations)}`)
  assert(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`)
  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(' | ')}`)
  assert(requestFailures.length === 0, `request failures: ${JSON.stringify(requestFailures)}`)
  assert(httpFailures.length === 0, `HTTP 5xx: ${JSON.stringify(httpFailures)}`)

  result = {
    status: 'passed',
    database,
    inventoryBefore: { nodes: inventoryBefore.nodes, relationships: inventoryBefore.relationships },
    inventoryAfter: { nodes: inventoryAfter.nodes, relationships: inventoryAfter.relationships },
    interactions,
    viewModes,
    clusterSeparation,
    semanticResult: {
      title: firstCluster.title,
      nodes: semanticNodeIds,
      phases: semanticEvents.filter(event => event.type === 'progress').map(event => event.stage),
    },
    requests,
    blockedMutations,
    pageErrors,
    consoleErrors,
    requestFailures,
    httpFailures,
  }
} catch (error) {
  await screenshot(page, 'FAILED-analyzer-checkpoint-1920x1080.png').catch(() => undefined)
  result = {
    status: 'failed',
    error: error instanceof Error ? error.stack ?? error.message : String(error),
    interactions,
    requests,
    blockedMutations,
    pageErrors,
    consoleErrors,
    requestFailures,
    httpFailures,
    bodyText: await page.locator('body').innerText().catch(() => ''),
  }
  process.exitCode = 1
} finally {
  await writeFile(
    join(evidenceDir, 'analyzer-checkpoint-interactions.json'),
    `${JSON.stringify(result, null, 2)}\n`,
    'utf8',
  )
  console.log(JSON.stringify(result, null, 2))
  await nativeRecording?.stop()
  await context.close()
  if (recordingPath) {
    await writeFile(`${recordingPath}.events.json`, `${JSON.stringify(recordingEvents, null, 2)}\n`, 'utf8')
  }
  await browser.close()
}
