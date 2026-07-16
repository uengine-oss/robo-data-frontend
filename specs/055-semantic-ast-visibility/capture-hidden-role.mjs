import { chromium } from '../../../robo-architect/frontend/node_modules/playwright/index.mjs'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const out = resolve(here, 'verification')
const screenshot = resolve(out, 'hidden-on-role-query.png')
await mkdir(out, { recursive: true })

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })

try {
  await page.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle', timeout: 60_000 })
  const codeGraph = page.locator('button.nav-child[title="코드 그래프"]')
  if (await codeGraph.count()) await codeGraph.first().click()
  await page.waitForTimeout(5000)

  const panelToggle = page.locator('button.panel-toggle.right')
  if (await panelToggle.count()) await panelToggle.click()
  await page.waitForTimeout(800)

  const filterButton = page.getByTitle('필터 — 노드·관계 종류 끄고/켜기')
  await filterButton.click()
  await page.getByText('숨긴 요소까지 모두 보기', { exact: true }).click()
  await page.waitForTimeout(2500)
  await filterButton.click()
  await page.waitForTimeout(500)

  const queryBadge = page.locator('.stat-badge').filter({ hasText: /^QUERY \(\d+\)/ }).first()
  const badgeText = (await queryBadge.textContent())?.trim() ?? ''
  await queryBadge.click()
  await page.waitForTimeout(8000)

  const totalText = (await page.locator('.display-summary').textContent().catch(() => ''))?.trim() ?? ''
  const activeBadges = await page.locator('.stat-badge.active').allTextContents()
  await page.screenshot({ path: screenshot, fullPage: false })
  console.log(JSON.stringify({ screenshot, clicked: badgeText, activeBadges, totalText }, null, 2))
} finally {
  await browser.close()
}
