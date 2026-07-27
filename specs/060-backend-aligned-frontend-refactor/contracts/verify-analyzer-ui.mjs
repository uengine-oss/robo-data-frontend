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
  await button.waitFor({ state: 'visible', timeout: 15_000 })
  await button.click()
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })

try {
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  await openFeature(page, '코드')
  await page.locator('.upload-tab').waitFor()
  await page.getByText('프로젝트 폴더 업로드', { exact: true }).waitFor()
  await page.screenshot({
    path: join(evidenceDir, 'analyzer-upload-1920x1080.png'),
    fullPage: true,
  })

  await openFeature(page, '코드 그래프')
  await page.locator('.graph-tab').waitFor()
  const graphState = page.locator('.graph-tab .empty-state h3, .graph-tab canvas').first()
  await graphState.waitFor({ state: 'visible', timeout: 30_000 })
  const graphStateText = await page.locator('.graph-tab .empty-state h3').first().textContent()
  await page.screenshot({
    path: join(evidenceDir, 'analyzer-graph-empty-1920x1080.png'),
    fullPage: true,
  })

  assert(pageErrors.length === 0, `Analyzer page errors: ${pageErrors.join(' | ')}`)

  console.log(JSON.stringify({
    result: 'passed',
    viewport: '1920x1080',
    verified: [
      'Analyzer workflow lazy loading',
      'upload guidance remains visible',
      `graph surface is visible (${graphStateText?.trim() || 'rendered graph'})`,
      'workflow store move has no browser runtime errors',
    ],
  }, null, 2))
} finally {
  await context.close()
  await browser.close()
}
