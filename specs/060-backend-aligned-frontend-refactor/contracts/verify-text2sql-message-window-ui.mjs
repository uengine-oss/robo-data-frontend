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

try {
  await page.route(/\/api\/gateway\/text2sql\/history\?/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '{"items":[],"total":0,"page":1,"page_size":20}',
  }))
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.evaluate(() => {
    const button = document.querySelector('[data-feature-id="domain-text2sql"]')
    if (!(button instanceof HTMLButtonElement)) throw new Error('Text2SQL feature is missing')
    button.click()
  })
  const root = page.locator('.text2sql-tab')
  await root.waitFor({ timeout: 15_000 })

  await root.evaluate(element => {
    let component = element.__vueParentComponent
    while (component && component.type?.__name !== 'Text2SqlTab') component = component.parent
    if (!component) throw new Error('Text2SqlTab component instance is missing')
    const messages = Array.from({ length: 31 }, (_, index) => ({
      id: `fixture-${index + 1}`,
      type: 'user',
      content: `검증 메시지 ${index + 1}`,
    }))
    messages.splice(10, 0, { id: 'fixture-tool', type: 'tool', content: '표시 제외 tool' })
    messages.splice(20, 0, { id: 'fixture-thinking', type: 'thinking', content: '표시 제외 thinking' })
    component.setupState.chatMessages.splice(0, component.setupState.chatMessages.length, ...messages)
  })

  const reveal = page.getByRole('button', { name: '1개의 이전 메시지 보기...' })
  await reveal.waitFor()
  assert(
    await page.locator('.chat-message').count() === 30,
    'Text2SQL window did not render the latest 30 displayable messages',
  )
  await reveal.scrollIntoViewIfNeeded()
  await reveal.focus()
  await page.screenshot({
    path: join(evidenceDir, 'text2sql-message-window-1280x720.png'),
    fullPage: false,
  })
  await page.keyboard.press('Enter')
  await reveal.waitFor({ state: 'detached' })
  assert(
    await page.locator('.chat-message').count() === 31,
    'Text2SQL native reveal did not render all displayable messages',
  )
  assert(pageErrors.length === 0, `Text2SQL message-window page errors: ${pageErrors.join(' | ')}`)

  console.log('Text2SQL displayable count, native keyboard reveal, and rendered window passed')
} finally {
  await browser.close()
}
