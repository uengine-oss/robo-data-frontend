import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../../..')
const require = createRequire(join(repoRoot, '.unittest/package.json'))
const { chromium } = require('playwright')

const baseUrl = process.env.FRONTEND_URL ?? 'http://127.0.0.1:3000'
const evidenceDir = resolve(here, '../evidence')
const screenshotPath = join(
  evidenceDir,
  'screenshots/checkpoint/12-analyzer-business-unit-view-1920x1080.png',
)
const resultPath = join(evidenceDir, 'analyzer-cluster-overlap-checkpoint.json')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function nvlSnapshot(page) {
  return page.evaluate(() => {
    const host = document.querySelector('.nvl-graph')
    if (!host) return null
    let vm = host.__vueParentComponent
    let nvl = null
    for (let depth = 0; vm && depth < 8; depth += 1, vm = vm.parent) {
      const candidate = vm.setupState?.nvlInstance || vm.devtoolsRawSetupState?.nvlInstance
      if (candidate) {
        nvl = candidate?.value || candidate
        if (typeof nvl?.getNodePositions === 'function') break
      }
    }
    if (!nvl) return null
    return {
      positions: nvl.getNodePositions().map(node => ({
        id: String(node.id),
        x: Number(node.x),
        y: Number(node.y),
      })),
      pinned: nvl.getNodes()
        .filter(node => node.pinned === true)
        .map(node => String(node.id)),
      scale: Number(nvl.getScale()),
      pan: nvl.getPan(),
      moving: Boolean(nvl.isLayoutMoving()),
    }
  })
}

async function separationSnapshot(page) {
  return page.locator('.nvl-graph').evaluate(host => {
    const read = name => Number(host.dataset[name])
    if (host.dataset.clusterSevereBefore === '') return null
    return {
      status: host.dataset.clusterSeparationStatus,
      adjustedPairCount: read('clusterAdjustments'),
      severeBefore: read('clusterSevereBefore'),
      severeAfter: read('clusterSevereAfter'),
      maxOverlapBefore: read('clusterMaxOverlapBefore'),
      maxOverlapAfter: read('clusterMaxOverlapAfter'),
      maxTranslation: read('clusterMaxTranslation'),
      settleP95MovementCss: read('clusterSettleP95Css'),
    }
  })
}

async function clientPoint(page, worldPoint) {
  return page.locator('.nvl-graph').evaluate((host, point) => {
    let vm = host.__vueParentComponent
    let nvl = null
    for (let depth = 0; vm && depth < 8; depth += 1, vm = vm.parent) {
      const candidate = vm.setupState?.nvlInstance || vm.devtoolsRawSetupState?.nvlInstance
      if (candidate) {
        nvl = candidate?.value || candidate
        if (typeof nvl?.getScale === 'function') break
      }
    }
    if (!nvl) return null
    const rect = host.getBoundingClientRect()
    const scale = nvl.getScale()
    const pan = nvl.getPan()
    const dpr = window.devicePixelRatio || 1
    return {
      x: rect.left + (point.x - pan.x) * scale / dpr + host.clientWidth / 2,
      y: rect.top + (point.y - pan.y) * scale / dpr + host.clientHeight / 2,
    }
  }, worldPoint)
}

await mkdir(dirname(screenshotPath), { recursive: true })
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  locale: 'ko-KR',
})
const page = await context.newPage()
const pageErrors = []
const consoleErrors = []
const requestFailures = []
const httpFailures = []

page.on('pageerror', error => pageErrors.push(error.message))
page.on('console', message => {
  if (message.type() === 'error') consoleErrors.push(message.text())
})
page.on('requestfailed', request => {
  requestFailures.push({ url: request.url(), error: request.failure()?.errorText })
})
page.on('response', response => {
  if (response.status() >= 500) {
    httpFailures.push({
      status: response.status(),
      method: response.request().method(),
      url: response.url(),
    })
  }
})

let result
try {
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.getByTitle('코드 그래프', { exact: true }).click()
  const graph = page.locator('.graph-tab .nvl-graph')
  await graph.waitFor({ state: 'visible', timeout: 60_000 })

  const clear = page.getByRole('button', { name: /캔버스 비우기/ })
  if (await clear.isVisible().catch(() => false)) await clear.click()
  await page.locator('.view-menu-btn').filter({ hasText: /보기:/ }).click()
  await page.locator('.view-menu-item').filter({ hasText: '실제 업무 단위' }).click()

  await page.waitForFunction(() => {
    const host = document.querySelector('.nvl-graph')
    return host?.dataset.clusterSevereBefore !== ''
  }, null, { timeout: 45_000 }).catch(() => undefined)
  await page.waitForTimeout(1_000)
  const separation = await separationSnapshot(page)
  const settled = await nvlSnapshot(page)
  if (!separation) {
    await page.waitForTimeout(3_000)
    const later = await nvlSnapshot(page)
    const beforeById = new Map((settled?.positions ?? []).map(node => [node.id, node]))
    const movements = (later?.positions ?? [])
      .map(node => {
        const before = beforeById.get(node.id)
        return before ? Math.hypot(node.x - before.x, node.y - before.y) : 0
      })
      .sort((a, b) => a - b)
    throw new Error(`cluster separation diagnostics were not produced; movement=${JSON.stringify({
      count: movements.length,
      median: movements[Math.floor(movements.length * 0.5)] ?? null,
      p90: movements[Math.floor(movements.length * 0.9)] ?? null,
      p95: movements[Math.floor(movements.length * 0.95)] ?? null,
      p99: movements[Math.floor(movements.length * 0.99)] ?? null,
      max: movements.at(-1) ?? null,
    })}`)
  }
  assert(separation.severeAfter === 0, `severe overlap remained: ${JSON.stringify(separation)}`)
  assert(separation.status === 'measured', `cluster separation was not measured: ${JSON.stringify(separation)}`)
  assert(
    separation.severeBefore === 0 || separation.adjustedPairCount > 0,
    `severe overlap was not adjusted: ${JSON.stringify(separation)}`,
  )
  assert(settled, 'NVL snapshot was unavailable after one-shot adjustment')
  assert(settled.pinned.length === 0, `nodes were pinned: ${settled.pinned.join(', ')}`)

  await page.waitForTimeout(3_000)
  const stable = await nvlSnapshot(page)
  assert(stable, 'NVL snapshot was unavailable during stability verification')
  assert(
    Math.abs(stable.scale - settled.scale) <= 0.0001,
    `camera scale drifted after settling: ${settled.scale} -> ${stable.scale}`,
  )
  const settledById = new Map(settled.positions.map(node => [node.id, node]))
  const idleMovements = stable.positions
    .map(node => {
      const before = settledById.get(node.id)
      return before ? Math.hypot(node.x - before.x, node.y - before.y) : 0
    })
    .sort((first, second) => first - second)
  const maxIdleMovement = Math.max(0, ...idleMovements)
  const idleP95CssPerSample = (
    idleMovements[Math.floor(idleMovements.length * 0.95)] ?? 0
  ) * stable.scale * (450 / 3_000)
  assert(
    idleP95CssPerSample <= Math.max(1, separation.settleP95MovementCss * 2),
    `one-shot adjustment increased layout motion: ${JSON.stringify({
      beforeP95Css: separation.settleP95MovementCss,
      afterP95Css: idleP95CssPerSample,
    })}`,
  )

  await page.screenshot({ path: screenshotPath, fullPage: true })

  const anchor = stable.positions.find(node => node.id.startsWith('__anchor__:'))
  assert(anchor, 'business-unit anchor was not available for drag verification')
  const anchorClient = await clientPoint(page, anchor)
  assert(anchorClient, 'anchor client coordinates were unavailable')
  await page.mouse.move(anchorClient.x, anchorClient.y)
  await page.mouse.down()
  await page.mouse.move(anchorClient.x + 60, anchorClient.y + 20, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(4_000)
  const afterDrag = await nvlSnapshot(page)
  const draggedAnchor = afterDrag?.positions.find(node => node.id === anchor.id)
  assert(draggedAnchor, 'dragged anchor disappeared')
  assert(
    Math.hypot(draggedAnchor.x - anchor.x, draggedAnchor.y - anchor.y) > 5,
    'native NVL cluster drag did not move the anchor',
  )
  assert(
    Math.abs(afterDrag.scale - stable.scale) <= 0.0001,
    `cluster drag triggered an automatic camera refit: ${stable.scale} -> ${afterDrag.scale}`,
  )
  assert(afterDrag.pinned.length === 0, 'cluster drag left pinned nodes behind')
  assert(
    JSON.stringify(await separationSnapshot(page)) === JSON.stringify(separation),
    'cluster drag triggered a repeated overlap correction',
  )

  assert(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`)
  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(' | ')}`)
  assert(requestFailures.length === 0, `request failures: ${JSON.stringify(requestFailures)}`)
  assert(httpFailures.length === 0, `HTTP 5xx: ${JSON.stringify(httpFailures)}`)

  result = {
    status: 'passed',
    separation,
    scale: stable.scale,
    maxIdleMovement,
    idleP95CssPerSample,
    nativeClusterDrag: {
      movedWorldDistance: Math.hypot(draggedAnchor.x - anchor.x, draggedAnchor.y - anchor.y),
      scaleBefore: stable.scale,
      scaleAfter: afterDrag.scale,
      pinnedNodes: afterDrag.pinned.length,
      repeatedCorrection: false,
    },
    screenshotPath,
    pageErrors,
    consoleErrors,
    requestFailures,
    httpFailures,
  }
} catch (error) {
  result = {
    status: 'failed',
    error: String(error?.stack || error),
    pageErrors,
    consoleErrors,
    requestFailures,
    httpFailures,
  }
} finally {
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
  await browser.close()
}

console.log(JSON.stringify(result, null, 2))
if (result.status !== 'passed') process.exitCode = 1
