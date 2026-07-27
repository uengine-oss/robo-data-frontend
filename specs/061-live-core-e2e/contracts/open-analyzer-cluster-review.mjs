import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../../..')
const require = createRequire(join(repoRoot, '.unittest/package.json'))
const { chromium } = require('playwright')

const browser = await chromium.launch({
  headless: false,
  args: ['--start-maximized'],
})
const context = await browser.newContext({
  viewport: null,
  locale: 'ko-KR',
})
const page = await context.newPage()

try {
  await page.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle', timeout: 60_000 })
  await page.getByTitle('코드 그래프', { exact: true }).click()
  await page.locator('.graph-tab .nvl-graph').waitFor({ state: 'visible', timeout: 60_000 })
  const clear = page.getByRole('button', { name: /캔버스 비우기/ })
  if (await clear.isVisible().catch(() => false)) await clear.click()
  await page.locator('.view-menu-btn').filter({ hasText: /보기:/ }).click()
  await page.locator('.view-menu-item').filter({ hasText: '실제 업무 단위' }).click()
  await page.waitForFunction(() => {
    const host = document.querySelector('.nvl-graph')
    return host?.dataset.clusterSevereBefore !== ''
  }, null, { timeout: 60_000 }).catch(() => undefined)
  await page.bringToFront()
  console.log('READY - Analyzer 실제 업무 단위 화면을 Chrome에 열었습니다.')
} catch (error) {
  console.error(error)
}

await new Promise(resolve => browser.on('disconnected', resolve))
