import { chromium } from '../../../robo-architect/frontend/node_modules/playwright/index.mjs'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const out = resolve(here, 'verification')
await mkdir(out, { recursive: true })

const structuralNodes = /^(IF|ELSE|LOOP|SWITCH|CASE|TRY|CATCH|FUNCTION_CALL|NEW_INSTANCE|IMPORT|INCLUDE)(?:\s|\[|$)/i
const structuralLinks = /^(PARENT_OF|NEXT|BELONGS_TO)\s*\(/i
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })
const consoleErrors = []
const failedRequests = []
page.on('console', message => {
  if (message.type() === 'error') consoleErrors.push(message.text())
})
page.on('requestfailed', request => failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`))

const readState = async label => {
  await page.getByTitle('모두 펼치기').click().catch(() => {})
  await page.waitForTimeout(1200)
  const navigatorNames = await page.locator('.nav-tree-label .name').allTextContents()
  const nodeBadges = await page.locator('.stats-section').filter({ hasText: 'Node labels' }).locator('.stat-badge').allTextContents()
  const relBadges = await page.locator('.stats-section').filter({ hasText: 'Relationship types' }).locator('.stat-badge').allTextContents()
  await page.screenshot({ path: resolve(out, `${label}.png`), fullPage: false })
  return {
    navigatorStructural: navigatorNames.filter(name => structuralNodes.test(name.trim())),
    nodeStructural: nodeBadges.filter(text => structuralNodes.test(text.trim())),
    relStructural: relBadges.filter(text => structuralLinks.test(text.trim())),
  }
}

try {
  await page.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle', timeout: 60_000 })
  const codeGraph = page.locator('button.nav-child[title="코드 그래프"]')
  if (await codeGraph.count()) await codeGraph.first().click()
  await page.waitForTimeout(5000)
  const panelToggle = page.locator('button.panel-toggle.right')
  if (await panelToggle.count()) await panelToggle.click()
  await page.waitForTimeout(800)

  const initial = await readState('default-hidden')

  await page.getByTitle('필터 — 노드·관계 종류 끄고/켜기').click()
  await page.getByText('숨긴 요소까지 모두 보기', { exact: true }).click()
  await page.waitForTimeout(2500)
  const revealed = await readState('hidden-revealed')

  await page.getByTitle('필터 — 노드·관계 종류 끄고/켜기').click()
  await page.getByText('숨긴 요소까지 모두 보기', { exact: true }).click()
  await page.waitForTimeout(2500)
  const restored = await readState('default-restored')

  const result = { initial, revealed, restored, consoleErrors, failedRequests }
  console.log(JSON.stringify(result, null, 2))
  if (initial.navigatorStructural.length || initial.nodeStructural.length || initial.relStructural.length) process.exitCode = 2
  if (!revealed.navigatorStructural.length || !revealed.nodeStructural.length || !revealed.relStructural.length) process.exitCode = 3
  if (restored.navigatorStructural.length || restored.nodeStructural.length || restored.relStructural.length) process.exitCode = 4
} finally {
  await browser.close()
}
