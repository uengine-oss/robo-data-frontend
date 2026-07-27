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

async function activateFeature(page, featureId) {
  await page.evaluate(id => {
    const button = document.querySelector(`[data-feature-id="${id}"]`)
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error(`Feature button ${id} is missing`)
    }
    button.click()
  }, featureId)
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1280, height: 520 } })

try {
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.route(/\/api\/gateway\/robo\/graph\/$/, route => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: '{"detail":"Analyzer graph is outside this scroll scenario"}',
  }))

  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  await activateFeature(page, 'whatif')
  const scrollOwner = page.locator('.whatif-simulator-layout > .workflow-scroll')
  await scrollOwner.waitFor({ timeout: 15_000 })

  const ownership = await page.evaluate(() => {
    const owner = document.querySelector('.workflow-scroll')
    const content = document.querySelector('.workflow-content')
    if (!(owner instanceof HTMLElement) || !(content instanceof HTMLElement)) {
      throw new Error('What-If scroll contract elements are missing')
    }
    return {
      ownerOverflowY: getComputedStyle(owner).overflowY,
      ownerClientHeight: owner.clientHeight,
      ownerScrollHeight: owner.scrollHeight,
      contentOverflowY: getComputedStyle(content).overflowY,
      nestedLegacyOwners: document.querySelectorAll(
        '.whatif-simulator-layout .main-content',
      ).length,
    }
  })
  assert(
    ownership.ownerOverflowY === 'auto'
      && ownership.ownerScrollHeight > ownership.ownerClientHeight,
    `What-If workflow owner was not independently scrollable: ${JSON.stringify(ownership)}`,
  )
  assert(
    ownership.contentOverflowY === 'visible',
    `What-If width container remained a nested scroll owner: ${ownership.contentOverflowY}`,
  )
  assert(
    ownership.nestedLegacyOwners === 0,
    `What-If retained ${ownership.nestedLegacyOwners} legacy main-content owners`,
  )

  await scrollOwner.evaluate(element => {
    element.scrollTop = element.scrollHeight
    element.dispatchEvent(new Event('scroll'))
  })
  await page.locator('.workflow-steps.sticky-active').waitFor()
  assert(await scrollOwner.evaluate(element => element.scrollTop > 150), 'What-If owner did not scroll')

  await page.getByRole('button', { name: '새 분석 시작' }).click()
  await page.waitForFunction(() => {
    const owner = document.querySelector('.workflow-scroll')
    return owner instanceof HTMLElement && owner.scrollTop === 0
  })
  assert(
    await page.locator('.workflow-steps.sticky-active').count() === 0,
    'New What-If session retained stale sticky state',
  )

  await scrollOwner.evaluate(element => {
    element.scrollTop = element.scrollHeight
    element.dispatchEvent(new Event('scroll'))
  })
  const sideNavScroll = await page.locator('.side-nav').evaluate(element => {
    element.scrollTop = Math.min(120, element.scrollHeight - element.clientHeight)
    return element.scrollTop
  })
  await activateFeature(page, 'schema')
  await page.locator('.schema-canvas').waitFor({ timeout: 15_000 })
  await activateFeature(page, 'whatif')
  await scrollOwner.waitFor({ timeout: 15_000 })
  assert(
    await scrollOwner.evaluate(element => element.scrollTop) === 0,
    'What-If feature re-entry restored a stale workflow scroll position',
  )
  assert(
    await page.locator('.side-nav').evaluate(element => element.scrollTop) === sideNavScroll,
    'Feature switching reset the independent app navigation scroll',
  )
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    'What-If single-owner layout introduced document horizontal overflow',
  )

  await page.screenshot({
    path: join(evidenceDir, 'whatif-single-scroll-owner-1280x520.png'),
    fullPage: true,
  })
  assert(pageErrors.length === 0, `What-If scroll page errors: ${pageErrors.join(' | ')}`)

  console.log(JSON.stringify({
    result: 'passed',
    viewport: '1280x520',
    ownership,
    verified: [
      'one workflow vertical scroll owner and non-scroll width container',
      'sticky state derives from the semantic workflow owner',
      'new session resets top and sticky state',
      'feature re-entry creates a top-zero workflow owner',
      'feature switching preserves independent SideNav scroll',
      'document horizontal overflow remains zero',
    ],
  }, null, 2))
} finally {
  await context.close()
  await browser.close()
}
