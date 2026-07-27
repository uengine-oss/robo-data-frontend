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

async function activateWhatIf(page) {
  await page.evaluate(() => {
    const button = document.querySelector('[data-feature-id="whatif"]')
    if (!(button instanceof HTMLButtonElement)) throw new Error('What-If feature button is missing')
    button.click()
  })
  await page.locator('.whatif-simulator-layout').waitFor({ timeout: 15_000 })
}

const sessions = [
  {
    id: 'mobile-session-scenario',
    scenario: '모바일 시나리오 세션',
    currentStep: 0,
    createdAt: '2026-07-24T00:00:00.000Z',
    updatedAt: '2026-07-24T00:00:00.000Z',
    data: { selectedTables: [] },
  },
  {
    id: 'mobile-session-ontology',
    scenario: '모바일 온톨로지 복원 세션',
    currentStep: 2,
    createdAt: '2026-07-24T00:00:00.000Z',
    updatedAt: '2026-07-24T00:00:00.000Z',
    data: { selectedTables: [] },
  },
]

const browser = await chromium.launch({ headless: true })

try {
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await desktop.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  await activateWhatIf(desktop)
  const desktopSidebar = desktop.locator('.session-sidebar')
  assert(
    await desktopSidebar.evaluate(element => element.getBoundingClientRect().width) === 280,
    'Desktop What-If sidebar no longer starts at 280px',
  )
  await desktop.getByRole('button', { name: '세션 사이드바 접기' }).click()
  await desktop.waitForFunction(() => {
    const element = document.querySelector('.session-sidebar')
    return element instanceof HTMLElement && element.getBoundingClientRect().width === 50
  })
  assert(
    await desktopSidebar.evaluate(element => element.getBoundingClientRect().width) === 50,
    'Desktop What-If collapsed sidebar no longer measures 50px',
  )
  assert(
    await desktop.locator('.mobile-session-trigger').evaluate(element => getComputedStyle(element).display)
      === 'none',
    'Mobile session trigger leaked into desktop presentation',
  )
  await desktop.close()

  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.addInitScript(savedSessions => {
    localStorage.setItem('whatif_sessions', JSON.stringify(savedSessions))
    localStorage.removeItem('whatif_current_session')
  }, sessions)
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  await activateWhatIf(page)

  const sidebar = page.locator('#whatif-session-sidebar')
  const workflow = page.locator('.workflow-scroll')
  const trigger = page.locator('.mobile-session-trigger')
  const initialGeometry = await page.evaluate(() => {
    const layout = document.querySelector('.whatif-simulator-layout')
    const workflowElement = document.querySelector('.workflow-scroll')
    const content = document.querySelector('.workflow-content')
    if (
      !(layout instanceof HTMLElement)
      || !(workflowElement instanceof HTMLElement)
      || !(content instanceof HTMLElement)
    ) {
      throw new Error('What-If mobile geometry elements are missing')
    }
    const layoutRect = layout.getBoundingClientRect()
    const workflowRect = workflowElement.getBoundingClientRect()
    const contentRect = content.getBoundingClientRect()
    return {
      layoutWidth: layoutRect.width,
      workflowWidth: workflowRect.width,
      contentWidth: contentRect.width,
      horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
    }
  })
  assert(initialGeometry.layoutWidth >= 330, `Unexpected app content width: ${initialGeometry.layoutWidth}`)
  assert(
    initialGeometry.workflowWidth === initialGeometry.layoutWidth,
    `Closed drawer still consumes workflow flow width: ${JSON.stringify(initialGeometry)}`,
  )
  assert(initialGeometry.contentWidth >= 300, `Mobile workflow content remained compressed: ${initialGeometry.contentWidth}`)
  assert(initialGeometry.horizontalOverflow === 0, 'Closed mobile drawer introduced horizontal overflow')
  assert(await sidebar.getAttribute('aria-hidden') === 'true', 'Closed mobile drawer is not aria-hidden')
  assert(
    await sidebar.evaluate(element => getComputedStyle(element).visibility) === 'hidden',
    'Closed mobile drawer remains visible or keyboard reachable',
  )

  await trigger.click()
  const closeButton = page.getByRole('button', { name: '세션 목록 닫기' }).first()
  await closeButton.waitFor()
  assert(await closeButton.evaluate(element => element === document.activeElement), 'Drawer open did not focus close')
  await page.waitForFunction(() => {
    const layout = document.querySelector('.whatif-simulator-layout')
    const drawer = document.querySelector('#whatif-session-sidebar')
    return layout instanceof HTMLElement
      && drawer instanceof HTMLElement
      && drawer.getBoundingClientRect().left >= layout.getBoundingClientRect().left
  })
  const openGeometry = await page.evaluate(() => {
    const layout = document.querySelector('.whatif-simulator-layout')
    const drawer = document.querySelector('#whatif-session-sidebar')
    if (!(layout instanceof HTMLElement) || !(drawer instanceof HTMLElement)) {
      throw new Error('What-If drawer geometry elements are missing')
    }
    const layoutRect = layout.getBoundingClientRect()
    const drawerRect = drawer.getBoundingClientRect()
    return {
      layoutLeft: layoutRect.left,
      layoutRight: layoutRect.right,
      drawerLeft: drawerRect.left,
      drawerRight: drawerRect.right,
      drawerWidth: drawerRect.width,
    }
  })
  assert(
    openGeometry.drawerLeft >= openGeometry.layoutLeft
      && openGeometry.drawerRight <= openGeometry.layoutRight,
    `Mobile drawer escaped app content viewport: ${JSON.stringify(openGeometry)}`,
  )
  await page.screenshot({
    path: join(evidenceDir, 'whatif-mobile-session-drawer-open-390x844.png'),
    fullPage: true,
  })

  await page.keyboard.press('Escape')
  assert(await sidebar.getAttribute('aria-hidden') === 'true', 'Escape did not hide mobile drawer')
  assert(await trigger.evaluate(element => element === document.activeElement), 'Escape did not restore trigger focus')

  await trigger.click()
  const backdrop = page.locator('.mobile-session-backdrop')
  const backdropBox = await backdrop.boundingBox()
  assert(backdropBox, 'Mobile session backdrop is missing')
  await backdrop.click({ position: { x: backdropBox.width - 8, y: backdropBox.height / 2 } })
  assert(await trigger.evaluate(element => element === document.activeElement), 'Backdrop did not restore trigger focus')

  await trigger.click()
  await page.locator('.session-card', { hasText: '모바일 온톨로지 복원 세션' })
    .locator('.session-card-select')
    .click()
  assert(await sidebar.getAttribute('aria-hidden') === 'true', 'Session restore left mobile drawer open')
  assert(
    (await page.locator('.step.active').innerText()).includes('온톨로지 발견'),
    'Session restore did not preserve the saved workflow step',
  )

  await trigger.click()
  await page.waitForFunction(() => {
    const layout = document.querySelector('.whatif-simulator-layout')
    const drawer = document.querySelector('#whatif-session-sidebar')
    return layout instanceof HTMLElement
      && drawer instanceof HTMLElement
      && drawer.getBoundingClientRect().left >= layout.getBoundingClientRect().left
  })
  await page.getByRole('button', { name: '새 분석 시작' }).click()
  assert(await sidebar.getAttribute('aria-hidden') === 'true', 'New session left mobile drawer open')
  assert(
    (await page.locator('.step.active').innerText()).includes('시나리오 정의'),
    'New session no longer resets the workflow result',
  )
  assert(
    await workflow.evaluate(element => element.getBoundingClientRect().width) === initialGeometry.layoutWidth,
    'Session actions changed the closed workflow width',
  )
  await page.waitForFunction(() => {
    const drawer = document.querySelector('#whatif-session-sidebar')
    return drawer instanceof HTMLElement && getComputedStyle(drawer).visibility === 'hidden'
  })
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    'What-If mobile drawer introduced document horizontal overflow',
  )
  await page.screenshot({
    path: join(evidenceDir, 'whatif-mobile-session-drawer-390x844.png'),
    fullPage: true,
  })
  assert(pageErrors.length === 0, `What-If mobile drawer page errors: ${pageErrors.join(' | ')}`)

  console.log(JSON.stringify({
    result: 'passed',
    viewports: ['1280x720', '390x844'],
    initialGeometry,
    openGeometry,
    verified: [
      'desktop 280px and 50px collapsed sidebar contract',
      'closed mobile drawer gives the full app content width to workflow',
      'drawer containment and close-button focus',
      'Escape and backdrop trigger-focus restoration',
      'session restore and new-session close with result preservation',
      'zero document horizontal overflow',
    ],
  }, null, 2))
  await context.close()
} finally {
  await browser.close()
}
