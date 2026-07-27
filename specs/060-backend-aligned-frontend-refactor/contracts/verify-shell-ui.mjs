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

const featureIds = [
  'upload', 'datasources', 'graph', 'schema', 'text2sql', 'security-guard',
  'schema-modeling', 'multi-layer-ontology', 'object-explorer', 'ontology-viewer',
  'domain-text2sql', 'whatif', 'data-quality', 'incident-manager', 'alerts',
  'event-detection', 'watch-agent', 'glossary', 'business-calendar', 'lineage', 'olap',
]

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function openFeature(page, featureId) {
  const button = page.locator(`[data-feature-id="${featureId}"]`)
  await button.waitFor({ state: 'attached', timeout: 15_000 })
  if (!(await button.isVisible())) {
    const header = button
      .locator('xpath=ancestor::div[contains(@class,"nav-group")]')
      .locator('button.nav-group-header')
    await header.click()
  }
  await button.click()
  await page.waitForFunction(
    id => document.querySelector(`[data-feature-id="${id}"]`)?.getAttribute('aria-current') === 'page',
    featureId,
  )
  await page.waitForTimeout(150)
}

async function inspectViewport(browser, viewport) {
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  const pageErrors = []
  let deleteRequests = 0
  await page.route('**/api/gateway/robo/delete/', async route => {
    if (route.request().method() !== 'DELETE') {
      await route.continue()
      return
    }
    deleteRequests += 1
    if (deleteRequests === 1) {
      await new Promise(resolve => setTimeout(resolve, 160))
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'catalog unavailable' }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'deleted' }),
    })
  })
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.locator('.home-view').waitFor({ timeout: 20_000 })

  if (viewport.width > 720) {
    const initialTheme = await page.locator('html').getAttribute('data-theme')
    await page.locator('.theme-toggle').click()
    const toggledTheme = await page.locator('html').getAttribute('data-theme')
    assert(toggledTheme && toggledTheme !== initialTheme, 'runtime theme state did not update the document')
    await page.locator('.theme-toggle').click()

    const globalSearch = page.locator('.top-header .search-input')
    await globalSearch.fill('orders')
    await globalSearch.press('Enter')
    await page.waitForFunction(
      () => document.querySelector('[data-feature-id="schema"]')?.getAttribute('aria-current') === 'page',
    )
    const schemaSearch = page.locator('input[placeholder="테이블 검색..."]')
    await schemaSearch.waitFor({ state: 'visible' })
    assert(
      await schemaSearch.inputValue() === 'orders',
      'schema search handoff was not consumed',
    )

    await openFeature(page, 'upload')
    const naturalLanguageQuery = '모든 주문의 합계를 보여줘'
    await globalSearch.fill(naturalLanguageQuery)
    await globalSearch.press('Enter')
    await page.waitForFunction(
      () => document.querySelector('[data-feature-id="text2sql"]')?.getAttribute('aria-current') === 'page',
    )
    await page.locator('.chat-message.user .message-text', { hasText: naturalLanguageQuery }).waitFor()
    await openFeature(page, 'upload')
  }

  const firstNavigationButton = page.locator('.side-nav .nav-item').first()
  await firstNavigationButton.focus()
  const focusedNavWidth = await page.locator('.side-nav').evaluate(element => element.getBoundingClientRect().width)
  if (viewport.width <= 720) {
    assert(focusedNavWidth === 52, `${viewport.width}px: compact navigation changed content ratio`)
  } else {
    assert(focusedNavWidth >= 170, `${viewport.width}px: keyboard focus does not expand navigation`)
  }
  await page.locator('.main-content').focus().catch(() => {})

  let scrollCandidate = null
  for (const featureId of featureIds) {
    await openFeature(page, featureId)
    const layout = await page.evaluate(() => {
      const main = document.querySelector('.main-content')
      const home = document.querySelector('.home-view')
      const mainRect = main?.getBoundingClientRect()
      const homeRect = home?.getBoundingClientRect()
      const scrollables = home
        ? [...home.querySelectorAll('*')].filter(element => {
            const style = getComputedStyle(element)
            const rect = element.getBoundingClientRect()
            return rect.width > 0 && rect.height > 0
              && /(auto|scroll)/.test(style.overflowY)
              && element.scrollHeight - element.clientHeight > 80
          }).map(element => ({
            className: typeof element.className === 'string' ? element.className : '',
            maxScroll: element.scrollHeight - element.clientHeight,
          }))
        : []
      return {
        documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        mainWidth: mainRect?.width ?? 0,
        mainHeight: mainRect?.height ?? 0,
        homeWidth: homeRect?.width ?? 0,
        homeHeight: homeRect?.height ?? 0,
        scrollables,
      }
    })
    assert(layout.documentOverflow <= 1, `${viewport.width}px ${featureId}: document has horizontal overflow`)
    assert(layout.mainWidth > 0 && layout.mainHeight > 0, `${viewport.width}px ${featureId}: main content collapsed`)
    assert(layout.homeWidth > 0 && layout.homeHeight > 0, `${viewport.width}px ${featureId}: feature viewport collapsed`)
    if (!scrollCandidate && featureId !== 'upload' && layout.scrollables.length > 0) {
      scrollCandidate = { featureId, className: layout.scrollables[0].className }
    }
  }

  if (scrollCandidate) {
    await openFeature(page, scrollCandidate.featureId)
    const probe = await page.evaluate(() => {
      const home = document.querySelector('.home-view')
      const element = home && [...home.querySelectorAll('*')].find(candidate => {
        const style = getComputedStyle(candidate)
        return /(auto|scroll)/.test(style.overflowY)
          && candidate.scrollHeight - candidate.clientHeight > 80
      })
      if (!element) return null
      element.scrollTop = Math.min(100, element.scrollHeight - element.clientHeight)
      return { className: typeof element.className === 'string' ? element.className : '', scrollTop: element.scrollTop }
    })
    assert(probe?.scrollTop > 0, `${scrollCandidate.featureId}: scroll setup failed`)
    await openFeature(page, 'upload')
    await openFeature(page, scrollCandidate.featureId)
    const resetScrollTop = await page.evaluate(className => {
      const home = document.querySelector('.home-view')
      const elements = home ? [...home.querySelectorAll('*')] : []
      const sameClass = elements.find(element => element.className === className)
      const element = sameClass ?? elements.find(candidate => {
        const style = getComputedStyle(candidate)
        return /(auto|scroll)/.test(style.overflowY)
          && candidate.scrollHeight - candidate.clientHeight > 80
      })
      return element?.scrollTop ?? null
    }, probe.className)
    assert(resetScrollTop === 0, `${scrollCandidate.featureId}: scroll was not reset`)
  }

  await openFeature(page, viewport.width <= 480 ? 'security-guard' : 'whatif')
  const settingsButton = page.locator('button[title="설정"]')
  await settingsButton.click()
  const settingsDialog = page.getByRole('dialog', { name: '설정' })
  await settingsDialog.waitFor({ state: 'visible' })
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '설정 닫기')
  await page.waitForTimeout(300)
  const settingsBounds = await settingsDialog.evaluate(element => {
    const rect = element.getBoundingClientRect()
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
  })
  assert(settingsBounds.left >= 0 && settingsBounds.top >= 0, `${viewport.width}px: settings dialog starts off-screen`)
  assert(
    settingsBounds.right <= viewport.width && settingsBounds.bottom <= viewport.height,
    `${viewport.width}px: settings dialog extends off-screen`,
  )
  if (viewport.width <= 480) {
    await page.screenshot({
      path: join(evidenceDir, `shell-settings-${viewport.width}x${viewport.height}.png`),
      fullPage: true,
    })
  }

  await settingsDialog.getByRole('button', { name: '데이터 관리' }).click()
  const newSessionTrigger = settingsDialog.locator('[data-settings-action="new-session"]')
  await newSessionTrigger.click()
  const newSessionDialog = page.getByRole('alertdialog', { name: '새 세션 시작' })
  await newSessionDialog.waitFor({ state: 'visible' })
  await page.waitForFunction(() => document.activeElement?.textContent?.trim() === '새 세션 시작')
  if (viewport.width <= 480) {
    await page.waitForTimeout(250)
    await page.screenshot({
      path: join(evidenceDir, `shell-settings-action-${viewport.width}x${viewport.height}.png`),
      fullPage: true,
    })
  }
  await page.keyboard.press('Escape')
  await newSessionDialog.waitFor({ state: 'hidden' })
  assert(
    await newSessionTrigger.evaluate(element => document.activeElement === element),
    `${viewport.width}px: new-session cancel did not restore trigger focus`,
  )

  await newSessionTrigger.click()
  await newSessionDialog.getByRole('button', { name: '새 세션 시작' }).click()
  await newSessionDialog.waitFor({ state: 'hidden' })
  await settingsDialog.waitFor({ state: 'hidden' })
  await page.waitForFunction(
    () => document.querySelector('[data-feature-id="upload"]')?.getAttribute('aria-current') === 'page',
  )
  await page.waitForFunction(() => document.activeElement?.getAttribute('title') === '설정')

  await settingsButton.click()
  await settingsDialog.waitFor({ state: 'visible' })
  await settingsDialog.getByRole('button', { name: '데이터 관리' }).click()

  if (viewport.width > 720) {
    const deleteTrigger = settingsDialog.locator('[data-settings-action="delete-all"]')
    await deleteTrigger.click()
    const deleteDialog = page.getByRole('alertdialog', { name: '모든 서버 데이터 삭제' })
    await deleteDialog.getByRole('button', { name: '전체 삭제' }).click()
    await page.keyboard.press('Escape')
    assert(
      await deleteDialog.isVisible(),
      'settings DELETE pending state allowed Escape to discard the mutation dialog',
    )
    await deleteDialog.getByRole('alert').waitFor({ state: 'visible' })
    assert(deleteRequests === 1, 'delete failure did not issue exactly one DELETE')
    assert(await settingsDialog.isVisible(), 'settings modal closed after failed delete')
    assert(await deleteDialog.isVisible(), 'delete dialog closed after failed delete')

    await deleteDialog.getByRole('button', { name: '다시 시도' }).click()
    await deleteDialog.waitFor({ state: 'hidden' })
    await settingsDialog.waitFor({ state: 'hidden' })
    assert(deleteRequests === 2, 'delete retry did not repeat exactly one DELETE')
    await page.waitForFunction(() => document.activeElement?.getAttribute('title') === '설정')

    await settingsButton.click()
    await settingsDialog.waitFor({ state: 'visible' })
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '설정 닫기')
  } else {
    assert(deleteRequests === 0, 'mobile cancel path unexpectedly deleted data')
  }

  await page.keyboard.press('Shift+Tab')
  const focusStayedInDialog = await settingsDialog.evaluate(element => element.contains(document.activeElement))
  assert(focusStayedInDialog, `${viewport.width}px: settings dialog focus escaped on backward tab`)
  await page.keyboard.press('Escape')
  await settingsDialog.waitFor({ state: 'hidden' })
  await page.waitForFunction(() => document.activeElement?.getAttribute('title') === '설정')
  await page.screenshot({
    path: join(evidenceDir, `shell-${viewport.width}x${viewport.height}.png`),
    fullPage: true,
  })
  assert(pageErrors.length === 0, `${viewport.width}px page errors: ${pageErrors.join(' | ')}`)
  await context.close()
  return { viewport: `${viewport.width}x${viewport.height}`, scrollCandidate }
}

const browser = await chromium.launch({ headless: true })
try {
  const results = []
  results.push(await inspectViewport(browser, { width: 1280, height: 720 }))
  results.push(await inspectViewport(browser, { width: 390, height: 844 }))
  console.log(JSON.stringify({ result: 'passed', features: featureIds.length, results }, null, 2))
} finally {
  await browser.close()
}
