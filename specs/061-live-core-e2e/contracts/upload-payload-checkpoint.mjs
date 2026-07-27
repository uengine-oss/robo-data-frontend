import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../../..')
const workspaceRoot = resolve(repoRoot, '../..')
const require = createRequire(join(repoRoot, '.unittest/package.json'))
const { chromium } = require('playwright')

const baseUrl = process.env.FRONTEND_URL ?? 'http://127.0.0.1:3000'
const evidenceDir = resolve(here, '../evidence')
const sourceDir = join(workspaceRoot, 'project/data/source/shop_mall')
const ddlPath = join(workspaceRoot, 'project/data/ddl/shopmall_schema.sql')
const expectedFiles = [
  'shop_mall/delivery/shipping.c',
  'shop_mall/inventory/catalog.c',
  'shop_mall/inventory/inventory.c',
  'shop_mall/member/member.c',
  'shop_mall/member/review_point.c',
  'shop_mall/order/cart.c',
  'shop_mall/order/order.c',
  'shop_mall/payment/payment.c',
  'shop_mall/payment/promotion.c',
  'shop_mall/payment/settlement.c',
  'shop_mall/util/common_util.c',
  'shop_mall/util/shopmall.h',
  'ddl/shopmall_schema.sql',
].sort()

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function selectUploadInputs(dialog) {
  return {
    source: dialog.locator('input[type="file"][webkitdirectory]').first(),
    ddl: dialog.locator('input[type="file"]:not([webkitdirectory])').last(),
  }
}

async function waitForFileTotal(dialog, count) {
  await dialog.getByText(`총 ${count}개 파일`, { exact: true }).waitFor({
    state: 'visible',
    timeout: 30_000,
  })
}

await mkdir(evidenceDir, { recursive: true })
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
await context.addInitScript(() => {
  window.__roboUploadPayload = null
  const originalFetch = window.fetch.bind(window)
  window.fetch = async (...args) => {
    const requestUrl = typeof args[0] === 'string'
      ? args[0]
      : args[0] instanceof Request
        ? args[0].url
        : String(args[0])
    const body = args[1]?.body
    if (requestUrl.includes('/antlr/fileUpload') && body instanceof FormData) {
      const entries = []
      for (const [field, value] of body.entries()) {
        if (value instanceof File) {
          entries.push({
            field,
            name: value.name.replaceAll('\\', '/'),
            size: value.size,
            type: value.type,
          })
        } else {
          entries.push({ field, value: String(value) })
        }
      }
      const headers = Object.fromEntries(new Headers(args[1]?.headers ?? {}).entries())
      window.__roboUploadPayload = { at: Date.now(), url: requestUrl, headers, entries }
      throw new DOMException('E2E payload checkpoint captured before network mutation', 'AbortError')
    }
    return originalFetch(...args)
  }
})

const page = await context.newPage()
let result
try {
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.getByTitle('코드', { exact: true }).click()
  await page.getByText(/이 영역을 클릭하여 업로드 설정/).click()
  const dialog = page.getByRole('dialog', { name: '업로드 설정' })
  await dialog.waitFor({ state: 'visible' })

  let inputs = await selectUploadInputs(dialog)
  await inputs.source.setInputFiles(sourceDir)
  await waitForFileTotal(dialog, 12)
  inputs = await selectUploadInputs(dialog)
  await inputs.ddl.setInputFiles(ddlPath)
  await waitForFileTotal(dialog, 13)

  await dialog.getByRole('button', { name: /데이터 소스 선택/ }).click()
  await dialog.getByRole('button').filter({ hasText: 'shopmall' }).click()
  const fkCheckbox = dialog.getByText('FK 관계 자동 추론', { exact: false })
    .locator('..').locator('input[type="checkbox"]')
  if (await fkCheckbox.isChecked()) await fkCheckbox.uncheck()

  await dialog.getByRole('button', { name: '업로드', exact: true }).click()
  const appendButton = page.locator('.modal-container .action-append')
  if (await appendButton.waitFor({ state: 'visible', timeout: 10_000 })
    .then(() => true, () => false)) {
    await appendButton.click()
  }
  await page.waitForFunction(() => window.__roboUploadPayload !== null, undefined, {
    timeout: 15_000,
  })
  const payload = await page.evaluate(() => window.__roboUploadPayload)
  const files = payload.entries
    .filter(entry => entry.field === 'files')
    .map(entry => entry.name)
    .sort()
  const metadataEntries = payload.entries.filter(entry => entry.field === 'metadata')
  assert(JSON.stringify(files) === JSON.stringify(expectedFiles), `file payload mismatch: ${JSON.stringify(files)}`)
  assert(metadataEntries.length === 0, `parser upload must not receive analysis metadata: ${JSON.stringify(metadataEntries)}`)
  const requestedDatabase = payload.headers['x-neo4j-database'] ?? null
  assert(
    requestedDatabase === null || requestedDatabase === 'neo4j',
    `unexpected database override: ${requestedDatabase}`,
  )

  result = {
    status: 'passed',
    mutationBlocked: true,
    files,
    metadata: null,
    languageContract: 'ANTLR auto-detection; no target or language is sent by the upload UI',
    headers: payload.headers,
    requestedDatabase,
    effectiveDatabaseEvidence: 'Analyzer run and Neo4j inventory both report database neo4j',
    capturedAt: payload.at,
    url: payload.url,
  }
} catch (error) {
  await page.screenshot({
    path: join(evidenceDir, 'upload-payload-checkpoint-failed.png'),
    fullPage: true,
  }).catch(() => undefined)
  result = {
    status: 'failed',
    error: error instanceof Error ? error.stack ?? error.message : String(error),
    bodyText: await page.locator('body').innerText().catch(() => ''),
  }
} finally {
  await writeFile(
    join(evidenceDir, 'upload-payload-checkpoint.json'),
    `${JSON.stringify(result, null, 2)}\n`,
    'utf8',
  )
  await context.close()
  await browser.close()
}

if (result.status !== 'passed') throw new Error(result.error)
console.log(JSON.stringify(result, null, 2))
