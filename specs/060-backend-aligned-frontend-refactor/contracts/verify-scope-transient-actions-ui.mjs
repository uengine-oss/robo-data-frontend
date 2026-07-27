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

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const pageErrors = []
page.on('pageerror', error => pageErrors.push(error.message))

await page.addInitScript(() => {
  const root = 'C:\\fixture'
  const file = { name: 'orders.sql', path: `${root}\\orders.sql`, type: 'file', size: 24 }
  let filePresent = true
  let trashAttempts = 0
  window.__scopeTrashCalls = []
  window.desktop = {
    fs: {
      async listDir({ path }) {
        return { ok: true, data: path === root && filePresent ? [file] : [] }
      },
      async readFile() {
        return { ok: true, data: { kind: 'text', content: 'SELECT * FROM orders;\r\n' } }
      },
      async writeFile() { return { ok: true, data: { ok: true } } },
      async rename() { return { ok: true, data: { ok: true } } },
      async copy() { return { ok: true, data: { ok: true } } },
      async mkdir() { return { ok: true, data: { ok: true } } },
      async trash(input) {
        window.__scopeTrashCalls.push({ ...input })
        trashAttempts += 1
        if (trashAttempts === 1) {
          return { ok: false, error: { message: '휴지통 서비스 일시 장애' } }
        }
        filePresent = false
        return { ok: true, data: { ok: true } }
      },
    },
  }
})

try {
  await page.route(/\/api\/gateway\/robo\/graph\/?$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '{"nodes":[],"relationships":[]}',
  }))
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.evaluate(async () => {
    const bootstrap = await import('/src/bootstrap.ts')
    bootstrap.unmount()
    bootstrap.mount('#app', { projectRoot: 'C:\\fixture' })
  })

  const row = page.getByRole('treeitem', { name: /orders\.sql/ })
  await row.waitFor({ timeout: 15_000 })
  await page.setViewportSize({ width: 390, height: 844 })
  const mobileGeometry = await page.evaluate(() => {
    const scope = document.querySelector('.scope-browser')
    const tree = document.querySelector('.tree-pane')
    const preview = document.querySelector('.preview-pane')
    if (!(scope instanceof HTMLElement) || !(tree instanceof HTMLElement) || !(preview instanceof HTMLElement)) {
      throw new Error('Scope responsive surfaces are missing')
    }
    const scopeBox = scope.getBoundingClientRect()
    const treeBox = tree.getBoundingClientRect()
    const previewBox = preview.getBoundingClientRect()
    return {
      rootOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      scopeWidth: scopeBox.width,
      treeWidth: treeBox.width,
      previewWidth: previewBox.width,
      stacked: previewBox.top >= treeBox.bottom,
    }
  })
  assert(
    mobileGeometry.rootOverflow <= 1
      && mobileGeometry.treeWidth <= mobileGeometry.scopeWidth + 1
      && mobileGeometry.previewWidth <= mobileGeometry.scopeWidth + 1
      && mobileGeometry.stacked,
    `Scope mobile geometry is invalid: ${JSON.stringify(mobileGeometry)}`,
  )
  await page.screenshot({
    path: join(evidenceDir, 'scope-browser-390x844.png'),
    fullPage: true,
  })
  await page.setViewportSize({ width: 1280, height: 720 })
  await row.focus()
  await page.keyboard.press('Shift+F10')

  const menu = page.getByRole('menu', { name: '파일 작업' })
  await menu.waitFor()
  const firstItem = page.getByRole('menuitem', { name: '이름변경' })
  assert(await firstItem.evaluate(element => element === document.activeElement), 'Context menu did not focus its first action')
  const menuBox = await menu.boundingBox()
  assert(
    menuBox
      && menuBox.x >= 8
      && menuBox.y >= 8
      && menuBox.x + menuBox.width <= 1272
      && menuBox.y + menuBox.height <= 712,
    'Context menu escaped the viewport gutter',
  )
  await page.keyboard.press('ArrowDown')
  assert(
    await page.getByRole('menuitem', { name: '복사' }).evaluate(element => element === document.activeElement),
    'Context menu ArrowDown did not move focus',
  )
  await page.keyboard.press('Escape')
  await menu.waitFor({ state: 'detached' })
  assert(await row.evaluate(element => element === document.activeElement), 'Escape did not restore tree-row focus')

  async function openTrashConfirmation() {
    await row.focus()
    await page.keyboard.press('Shift+F10')
    await menu.waitFor()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('alertdialog', { name: '휴지통으로 이동' })
    await dialog.waitFor()
    return dialog
  }

  let dialog = await openTrashConfirmation()
  assert(
    await dialog.getByRole('button', { name: '취소' }).evaluate(element => element === document.activeElement),
    'Shared confirmation did not own initial focus',
  )
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'detached' })
  assert(await row.evaluate(element => element === document.activeElement), 'Confirmation cancel did not restore row focus')
  assert((await page.evaluate(() => window.__scopeTrashCalls)).length === 0, 'Cancel issued a trash IPC request')

  dialog = await openTrashConfirmation()
  await dialog.getByRole('button', { name: '휴지통으로 이동' }).click()
  const toast = page.getByRole('status').filter({ hasText: '휴지통 서비스 일시 장애' })
  await toast.waitFor()
  let calls = await page.evaluate(() => window.__scopeTrashCalls)
  assert(
    calls.length === 1 && calls[0].root === 'C:\\fixture' && calls[0].path === 'C:\\fixture\\orders.sql',
    'Failed trash request lost its exact root/path identity',
  )
  assert(await row.isVisible(), 'Failed trash request removed the file row')
  await page.screenshot({
    path: join(evidenceDir, 'scope-trash-failure-1280x720.png'),
    fullPage: true,
  })
  await toast.getByRole('button', { name: '알림 닫기' }).click()
  await toast.waitFor({ state: 'detached' })

  dialog = await openTrashConfirmation()
  await dialog.getByRole('button', { name: '휴지통으로 이동' }).click()
  await row.waitFor({ state: 'detached' })
  calls = await page.evaluate(() => window.__scopeTrashCalls)
  assert(
    calls.length === 2
      && calls.every(call => call.root === 'C:\\fixture' && call.path === 'C:\\fixture\\orders.sql'),
    'Retry did not preserve the exact trash target',
  )
  assert(pageErrors.length === 0, `Scope transient-action page errors: ${pageErrors.join(' | ')}`)

  console.log('Scope keyboard menu, viewport clamp, focus restoration, shared confirmation, toast close, and exact retry passed')
} finally {
  await browser.close()
}
