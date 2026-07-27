import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../../..')
const require = createRequire(join(repoRoot, '.unittest/package.json'))
const { chromium } = require('playwright')
const evidenceDir = resolve(here, '../evidence')
await mkdir(evidenceDir, { recursive: true })

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
const pageErrors = []
const consoleErrors = []
let datasourceListRequests = 0
let datasourceCreateRequests = 0
const datasourceCreateBodies = []
page.on('pageerror', (error) => pageErrors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text())
})

await page.route('**/api/gateway/robo/graph/', async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ Nodes: [], Relationships: [] }),
  })
})

await page.route('**/api/gateway/data-fabric/api/datasources', async (route) => {
  const request = route.request()
  if (request.method() === 'GET') {
    datasourceListRequests += 1
    if (datasourceListRequests === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'datasource catalog unavailable' }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        datasources: [{ name: 'shopmall', engine: 'postgres', display_name: 'Shop Mall' }],
      }),
    })
    return
  }

  if (request.method() === 'POST') {
    datasourceCreateRequests += 1
    datasourceCreateBodies.push(request.postDataJSON())
    if (datasourceCreateRequests === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'connector registration unavailable' }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        name: 'contract-db',
        engine: 'postgres',
        display_name: 'Contract DB',
      }),
    })
    return
  }

  await route.continue()
})

try {
  await page.goto(process.env.FRONTEND_URL ?? 'http://127.0.0.1:3000', {
    waitUntil: 'networkidle',
    timeout: 60_000,
  })
  await page.locator('button.nav-child[title="코드"]').first().click()
  await page.getByText('프로젝트 폴더 업로드', { exact: true }).waitFor()
  await page.locator('.drop-zone').click()
  await page.getByRole('heading', { name: '업로드 설정', exact: true }).waitFor()
  await page.getByText('파일', { exact: true }).first().waitFor()
  await page.getByText('DDL', { exact: true }).first().waitFor()
  const uploadButton = page.getByRole('button', { name: '업로드', exact: true })
  await uploadButton.waitFor()
  if (!(await uploadButton.isDisabled())) {
    throw new Error('Upload must remain disabled until at least one file is selected')
  }

  await page.getByRole('button', { name: '데이터 소스 선택', exact: false }).click()
  await page.getByText('datasource catalog unavailable', { exact: true }).waitFor()
  await page.screenshot({
    path: join(evidenceDir, 'parser-upload-datasource-list-failure-1920x1080.png'),
    fullPage: true,
  })

  await page.getByRole('button', { name: '다시 시도', exact: true }).click()
  await page.getByText('Shop Mall', { exact: true }).waitFor()
  await page.getByRole('button', { name: '+ 새 데이터 소스 추가', exact: true }).click()

  const connectorCards = page.locator('.ds-type-card')
  if (await connectorCards.count() <= 4) {
    throw new Error('Upload datasource dialog regressed to the four-connector fallback')
  }
  await connectorCards.filter({ hasText: 'PostgreSQL' }).first().click()

  const datasourceInputs = page.locator('.ds-form input')
  await datasourceInputs.nth(0).fill('contract-db')
  await datasourceInputs.nth(1).fill('db.internal')
  await datasourceInputs.nth(3).fill('contract-user')
  await datasourceInputs.nth(4).fill('contract-password')
  await datasourceInputs.nth(5).fill('contract_database')

  const createButton = page.getByRole('button', { name: '연결 생성', exact: true })
  await createButton.click()
  await page.getByText('connector registration unavailable', { exact: false }).waitFor()
  await page.screenshot({
    path: join(evidenceDir, 'parser-upload-datasource-create-failure-1920x1080.png'),
    fullPage: true,
  })

  await createButton.click()
  await page.getByText('Contract DB', { exact: true }).waitFor()

  if (datasourceListRequests !== 2) {
    throw new Error(`Unexpected datasource list request count: ${datasourceListRequests}`)
  }
  if (datasourceCreateRequests !== 2) {
    throw new Error(`Unexpected datasource create request count: ${datasourceCreateRequests}`)
  }
  const finalCreateBody = datasourceCreateBodies.at(-1)
  if (
    finalCreateBody?.name !== 'contract-db'
    || finalCreateBody?.engine !== 'postgres'
    || finalCreateBody?.parameters?.host !== 'db.internal'
  ) {
    throw new Error(`Unexpected datasource create body: ${JSON.stringify(finalCreateBody)}`)
  }

  await page.screenshot({
    path: join(evidenceDir, 'parser-upload-modal-1920x1080.png'),
    fullPage: true,
  })

  await page.getByRole('button', { name: '업로드 설정 닫기', exact: true }).click()
  await page.evaluate(() => {
    localStorage.setItem('robo-analyzer-project-state', JSON.stringify({
      sourceType: 'java',
      uploadedFiles: [{
        fileName: 'src/Test.java',
        fileContent: 'class Test {}',
      }, {
        fileName: 'src/Other.java',
        fileContent: 'class Other {}',
      }],
      uploadedDdlFiles: [],
    }))
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.locator('button.nav-child[title="코드"]').first().click()
  await page.getByText('Test.java', { exact: true }).waitFor()

  await page.locator('[role="treeitem"]').filter({ hasText: 'Test.java' }).click()
  await page.locator('[role="treeitem"]').filter({ hasText: 'Other.java' }).click()
  const testTab = page.getByRole('tab', { name: 'src/Test.java' })
  const otherTab = page.getByRole('tab', { name: 'src/Other.java' })
  assert(
    await otherTab.getAttribute('aria-selected') === 'true',
    'Opening a second upload file did not expose the active native tab',
  )
  await testTab.press('Enter')
  assert(
    await testTab.getAttribute('aria-selected') === 'true'
      && await page.locator('.viewer-content').getByText('class Test {}', { exact: true }).isVisible(),
    'Upload tab keyboard activation lost the existing active viewer projection',
  )
  await page.getByRole('button', { name: 'src/Other.java 닫기' }).press('Space')
  assert(
    await otherTab.count() === 0
      && await testTab.getAttribute('aria-selected') === 'true',
    'Closing an inactive upload tab changed the active sibling tab',
  )

  const clearFilesButton = page.locator('button.clear-all-btn[title="모든 파일 삭제"]')
  await clearFilesButton.click()
  await page.getByRole('alertdialog', { name: '모든 파일 삭제' }).waitFor()
  const focusedText = await page.evaluate(() => document.activeElement?.textContent?.trim())
  if (focusedText !== '삭제') {
    throw new Error(`Clear confirmation did not receive keyboard focus: ${focusedText}`)
  }
  await page.keyboard.press('Escape')
  await page.getByRole('alertdialog', { name: '모든 파일 삭제' }).waitFor({ state: 'detached' })
  await page.getByText('Test.java', { exact: true }).waitFor()

  await clearFilesButton.click()
  await page.getByRole('alertdialog', { name: '모든 파일 삭제' })
    .getByRole('button', { name: '삭제', exact: true })
    .click()
  await page.getByText('프로젝트 폴더 업로드', { exact: true }).waitFor()

  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('.drop-zone').click()
  await page.getByRole('heading', { name: '업로드 설정', exact: true }).waitFor()
  await page.locator('.modal').evaluate(async (element) => {
    await Promise.all(element.getAnimations().map(animation => animation.finished))
  })
  const mobileModalOverflow = await page.locator('.modal').evaluate(
    element => element.scrollWidth - element.clientWidth,
  )
  if (mobileModalOverflow > 1) {
    throw new Error(`Upload modal has ${mobileModalOverflow}px horizontal overflow at 390x844`)
  }
  const mobileLayout = await page.locator('.modal').evaluate((element) => {
    const rectOf = selector => {
      const target = element.querySelector(selector)
      if (!(target instanceof HTMLElement)) return null
      const rect = target.getBoundingClientRect()
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }
    }
    const style = getComputedStyle(element)
    return {
      modal: rectOf(':scope'),
      body: rectOf('.modal-body'),
      trees: rectOf('.tree-split'),
      footer: rectOf('.modal-footer'),
      backgroundColor: style.backgroundColor,
      opacity: style.opacity,
    }
  })
  if (
    mobileLayout.backgroundColor === 'rgba(0, 0, 0, 0)'
    || mobileLayout.opacity !== '1'
  ) {
    throw new Error(`Upload modal surface is not opaque: ${JSON.stringify(mobileLayout)}`)
  }
  if (
    !mobileLayout.body
    || !mobileLayout.footer
    || mobileLayout.body.bottom > mobileLayout.footer.top + 1
  ) {
    throw new Error(`Upload modal body overlaps its footer: ${JSON.stringify(mobileLayout)}`)
  }
  await page.screenshot({
    path: join(evidenceDir, 'parser-upload-modal-390x844.png'),
    fullPage: true,
  })

  if (pageErrors.length > 0) throw new Error(`Page errors: ${pageErrors.join(' | ')}`)
  const expectedServiceErrors = consoleErrors.filter(
    message => message === 'Failed to load resource: the server responded with a status of 503 (Service Unavailable)',
  )
  const unexpectedConsoleErrors = consoleErrors.filter(message => !expectedServiceErrors.includes(message))
  if (expectedServiceErrors.length !== 2) {
    throw new Error(`Expected two intentional 503 console records, received: ${consoleErrors.join(' | ')}`)
  }
  if (unexpectedConsoleErrors.length > 0) {
    throw new Error(`Unexpected console errors: ${unexpectedConsoleErrors.join(' | ')}`)
  }
  console.log('Parser UI contract: lazy upload + datasource failure/retry/create + accessible clear + 390x844 modal passed')
} finally {
  await page.close()
  await browser.close()
}
