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
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  const button = page.locator(`button[title="${title}"]`).first()
  await button.waitFor({ state: 'attached', timeout: 15_000 })
  if (!(await button.isVisible())) {
    const groupHeader = button
      .locator('xpath=ancestor::div[contains(@class,"nav-group")]')
      .locator('button.nav-group-header')
    await groupHeader.click()
  }
  await button.waitFor({ state: 'visible', timeout: 5_000 })
  await button.click()
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
await context.addInitScript(() => localStorage.setItem('robo-analyzer-api-key', 'security-contract-key'))

try {
  const securityPage = await context.newPage()
  const securityRequestHeaders = []
  securityPage.on('request', request => {
    if (request.url().includes('/api/gateway/security/')) {
      securityRequestHeaders.push(request.headers())
    }
  })
  const usersResponse = securityPage.waitForResponse(
    response => /\/api\/gateway\/security\/users$/.test(response.url()),
    { timeout: 30_000 },
  )
  await openFeature(securityPage, '보안관리자')
  const securityStatus = (await usersResponse).status()
  await securityPage.getByRole('heading', { name: '보안관리자' }).waitFor()

  if (securityStatus >= 400) {
    const userError = securityPage.locator('.user-management .error-message')
    await userError.waitFor()
    assert(
      !(await securityPage.locator('.user-management .empty-state').isVisible().catch(() => false)),
      'Security service failure is shown as an empty user list',
    )
  }

  const tablesResponse = securityPage.waitForResponse(
    response => /\/api\/gateway\/security\/tables$/.test(response.url()),
    { timeout: 30_000 },
  )
  await securityPage.getByRole('button', { name: /테이블 권한/ }).click()
  const tablesStatus = (await tablesResponse).status()
  if (tablesStatus >= 400) {
    const permissionError = securityPage.locator('.permissions-error')
    await permissionError.waitFor()
    assert((await permissionError.innerText()).includes('다시 시도'), 'Table permission retry is missing')
    assert(
      !(await securityPage.getByText('데이터소스가 없습니다', { exact: true }).isVisible().catch(() => false)),
      'Security table failure is shown as empty data',
    )
  }

  await securityPage.getByRole('button', { name: /보안 정책/ }).click()
  await securityPage.getByText('정책 관리 API가 제공되지 않습니다').waitFor()
  await securityPage.screenshot({
    path: join(evidenceDir, 'security-policy-capability-1920x1080.png'),
    fullPage: true,
  })
  assert(securityRequestHeaders.length > 0, 'Security API requests were not observed')
  assert(
    securityRequestHeaders.every(headers => headers['accept-language'] === 'ko'
      && headers['x-llm-api-key'] === 'security-contract-key'),
    'Security API request is missing current session headers',
  )

  const securityCrudPage = await context.newPage()
  await securityCrudPage.setViewportSize({ width: 390, height: 844 })
  let userDeleted = false
  let roleDeleted = false
  let userDeleteRequests = 0
  let roleDeleteRequests = 0
  await securityCrudPage.route(/\/api\/gateway\/robo\/graph\/$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ nodes: [], relationships: [] }),
  }))
  await securityCrudPage.route(/\/api\/gateway\/security\/users$/, async route => {
    if (route.request().method() !== 'GET') return route.fallback()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(userDeleted ? [] : [{
        uid: 'user-1',
        email: 'analyst@example.com',
        username: 'analyst',
        status: 'active',
        roles: ['analyst'],
        created_at: '2026-07-23T00:00:00Z',
        last_login_at: null,
      }]),
    })
  })
  await securityCrudPage.route(/\/api\/gateway\/security\/users\/user-1$/, async route => {
    userDeleteRequests += 1
    if (userDeleteRequests === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'user delete verification outage' }),
      })
      return
    }
    userDeleted = true
    await route.fulfill({ status: 204, body: '' })
  })
  await securityCrudPage.route(/\/api\/gateway\/security\/roles$/, async route => {
    if (route.request().method() !== 'GET') return route.fallback()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          name: 'admin',
          description: '시스템 관리자',
          priority: 100,
          is_system: true,
          permissions: ['read:table'],
        },
        ...(!roleDeleted ? [{
          name: 'custom-analyst',
          description: '사용자 역할',
          priority: 50,
          is_system: false,
          permissions: ['read:table'],
        }] : []),
      ]),
    })
  })
  await securityCrudPage.route(/\/api\/gateway\/security\/roles\/custom-analyst$/, async route => {
    roleDeleteRequests += 1
    if (roleDeleteRequests === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'role delete verification outage' }),
      })
      return
    }
    roleDeleted = true
    await route.fulfill({ status: 204, body: '' })
  })
  await securityCrudPage.route(/\/api\/gateway\/security\/permissions$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([{
      action: 'read',
      resource_type: 'table',
      description: '테이블 읽기',
    }]),
  }))

  await openFeature(securityCrudPage, '보안관리자')
  const addUserTrigger = securityCrudPage.getByRole('button', { name: '사용자 추가' })
  await addUserTrigger.click()
  const userEditor = securityCrudPage.getByRole('dialog', { name: '사용자 추가' })
  await userEditor.waitFor({ state: 'visible' })
  const userEmail = userEditor.getByLabel('이메일')
  assert(
    await userEmail.evaluate(element => document.activeElement === element),
    'Security user editor did not focus the first field',
  )
  await securityCrudPage.keyboard.press('Escape')
  await userEditor.waitFor({ state: 'hidden' })
  assert(
    await addUserTrigger.evaluate(element => document.activeElement === element),
    'Security user editor did not restore trigger focus',
  )

  const userDeleteTrigger = securityCrudPage.getByRole('button', { name: 'analyst 삭제' })
  await userDeleteTrigger.click()
  const userDeleteDialog = securityCrudPage.getByRole('alertdialog', { name: '사용자 삭제' })
  await userDeleteDialog.waitFor({ state: 'visible' })
  await securityCrudPage.keyboard.press('Escape')
  await userDeleteDialog.waitFor({ state: 'hidden' })
  assert(userDeleteRequests === 0, 'Security user delete cancel issued a mutation')
  assert(
    await userDeleteTrigger.evaluate(element => document.activeElement === element),
    'Security user delete cancel did not restore trigger focus',
  )
  await userDeleteTrigger.click()
  await userDeleteDialog.getByRole('button', { name: '삭제' }).click()
  await userDeleteDialog.getByRole('alert').waitFor({ state: 'visible' })
  assert(await securityCrudPage.getByText('analyst@example.com').isVisible(), 'User disappeared before DELETE success')
  await securityCrudPage.waitForTimeout(220)
  await securityCrudPage.screenshot({
    path: join(evidenceDir, 'security-user-delete-390x844.png'),
    fullPage: true,
  })
  const securityOverflow = await securityCrudPage.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  assert(securityOverflow <= 1, `Security CRUD mobile document overflowed by ${securityOverflow}px`)
  await userDeleteDialog.getByRole('button', { name: '다시 시도' }).click()
  await userDeleteDialog.waitFor({ state: 'hidden' })
  await securityCrudPage.getByText('등록된 사용자가 없습니다', { exact: true }).waitFor()
  assert(userDeleteRequests === 2, 'Security user delete retry did not repeat the same UID once')

  await securityCrudPage.getByRole('button', { name: /역할 관리/ }).click()
  const roleEditorDisabled = securityCrudPage.getByRole('button', { name: '역할 수정 API 미제공' }).first()
  await roleEditorDisabled.waitFor({ state: 'visible' })
  assert(await roleEditorDisabled.isDisabled(), 'Unsupported role edit remains actionable')
  const roleDeleteTrigger = securityCrudPage.getByRole('button', { name: 'custom-analyst 삭제' })
  await roleDeleteTrigger.click()
  const roleDeleteDialog = securityCrudPage.getByRole('alertdialog', { name: '역할 삭제' })
  await roleDeleteDialog.getByRole('button', { name: '삭제' }).click()
  await roleDeleteDialog.getByRole('alert').waitFor({ state: 'visible' })
  assert(await securityCrudPage.getByRole('heading', { name: 'custom-analyst' }).isVisible(), 'Role disappeared before DELETE success')
  await roleDeleteDialog.getByRole('button', { name: '다시 시도' }).click()
  await roleDeleteDialog.waitFor({ state: 'hidden' })
  assert(roleDeleteRequests === 2, 'Security role delete retry did not repeat the same name once')
  assert(
    !(await securityCrudPage.getByRole('heading', { name: 'custom-analyst' }).isVisible().catch(() => false)),
    'Deleted Security role remains visible after success',
  )

  const glossaryPage = await context.newPage()
  const glossaryRequestHeaders = []
  glossaryPage.on('request', request => {
    if (/\/(?:robo\/glossary|business-calendar)\//.test(request.url())) {
      glossaryRequestHeaders.push(request.headers())
    }
  })
  const [glossaryResponse] = await Promise.all([
    glossaryPage.waitForResponse(
      response => /\/robo\/glossary\//.test(response.url()),
      { timeout: 30_000 },
    ),
    openFeature(glossaryPage, '용어 관리'),
  ])
  const glossaryStatus = glossaryResponse.status()
  if (glossaryStatus >= 400) {
    const error = glossaryPage.locator('.error-toast')
    await error.waitFor()
    assert((await error.innerText()).includes('다시 시도'), 'Glossary retry is missing')
    assert(
      !(await glossaryPage.getByText('용어집이 없습니다.', { exact: true }).isVisible().catch(() => false)),
      'Glossary service failure is shown as empty data',
    )
  }
  await glossaryPage.screenshot({
    path: join(evidenceDir, 'catalog-glossary-actual-1920x1080.png'),
    fullPage: true,
  })

  const calendarPage = await context.newPage()
  const calendarResponses = []
  const calendarRequestHeaders = []
  calendarPage.on('response', response => calendarResponses.push(response))
  calendarPage.on('request', request => {
    if (request.url().includes('/business-calendar/')) calendarRequestHeaders.push(request.headers())
  })
  await openFeature(calendarPage, '영업일 캘린더')
  await calendarPage.getByRole('heading', { name: /영업일 캘린더/ }).waitFor({ timeout: 15_000 })
  await calendarPage.waitForTimeout(1_000)
  const calendarResponse = calendarResponses.find(response => response.url().includes('/business-calendar/'))
  assert(calendarResponse, `Business calendar request is missing. Responses: ${calendarResponses.map(r => r.url()).join(' | ')}`)
  const calendarStatus = calendarResponse.status()
  if (calendarStatus >= 400) {
    const error = calendarPage.locator('.alert-error')
    await error.waitFor()
    assert((await error.innerText()).includes('다시 시도'), 'Business calendar retry is missing')
    assert(await calendarPage.getByRole('button', { name: /설정 저장/ }).isDisabled(), 'Calendar save stays enabled after load failure')
  }
  await calendarPage.screenshot({
    path: join(evidenceDir, 'catalog-business-calendar-actual-1920x1080.png'),
    fullPage: true,
  })
  const governanceHeaders = [...glossaryRequestHeaders, ...calendarRequestHeaders]
  assert(governanceHeaders.length > 0, 'Glossary/calendar requests were not observed')
  assert(
    governanceHeaders.every(headers => headers['accept-language'] === 'ko'
      && headers['x-llm-api-key'] === 'security-contract-key'),
    'Glossary/calendar request is missing current session headers',
  )

  console.log(JSON.stringify({
    result: 'passed',
    viewport: '1920x1080',
    actualStatuses: {
      securityUsers: securityStatus,
      securityTables: tablesStatus,
      catalogGlossary: glossaryStatus,
      catalogBusinessCalendar: calendarStatus,
    },
    verified: [
      'security failures are not empty states',
      'security requests carry current session headers',
      'table permissions use the security service boundary',
      'unsupported security policy editing is disclosed',
      'security user editor Escape and focus restoration',
      'security user and role DELETE failure, exact retry, and success commit',
      'unsupported role update is explicitly disabled',
      'security CRUD mobile geometry',
      'catalog glossary and calendar failures provide retry',
      'catalog glossary and calendar requests carry current session headers',
    ],
  }, null, 2))
} finally {
  await context.close()
  await browser.close()
}
