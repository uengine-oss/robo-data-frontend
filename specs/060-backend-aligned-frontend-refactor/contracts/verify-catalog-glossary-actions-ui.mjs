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
    await button
      .locator('xpath=ancestor::div[contains(@class,"nav-group")]')
      .locator('button.nav-group-header')
      .click()
  }
  await button.click()
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
const page = await context.newPage()
const pageErrors = []
let glossaryListRequests = 0
let termListRequests = 0
let termDetailRequests = 0
let termDeleteRequests = 0
let glossaryDeleteRequests = 0
let domainMetadataRequests = 0
let termDeleted = false
let glossaryDeleted = false

page.on('pageerror', error => pageErrors.push(error.message))
await page.route(/\/api\/gateway\/robo\/graph\/$/, route => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ nodes: [], relationships: [] }),
}))
await page.route(/\/api\/gateway\/robo\/glossary\/$/, route => {
  glossaryListRequests += 1
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      glossaries: [
        ...(glossaryDeleted
          ? []
          : [{
              id: 'g1',
              name: '표준 용어',
              description: '계약 검증 용어집',
              type: 'Business',
              termCount: termDeleted ? 1 : 2,
            }]),
        {
          id: 'g2',
          name: '기술 용어',
          description: '삭제 후 선택 검증',
          type: 'Technical',
          termCount: 0,
        },
      ],
    }),
  })
})
await page.route(/\/api\/gateway\/robo\/glossary\/g1\/terms$/, route => {
  termListRequests += 1
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      terms: [
        ...(termDeleted
          ? []
          : [{
              id: 't1',
              name: '고객',
              description: '상품을 구매하는 개인 또는 법인을 뜻하는 긴 표준 설명입니다. 이 문장은 개별 확장과 전체 펼치기 동작을 실제로 검증하기 위해 충분히 길게 작성했습니다.',
              status: 'Approved',
              synonyms: ['구매자'],
              owners: [{ id: 'o1', name: '영업팀' }],
              reviewers: [],
              domains: [{ id: 'd1', name: '영업' }],
              tags: [],
            }]),
        {
          id: 't2',
          name: '주문',
          description: '판매 기록',
          status: 'Draft',
          synonyms: [],
          owners: [],
          reviewers: [],
          domains: [],
          tags: [],
        },
      ],
    }),
  })
})
await page.route(/\/api\/gateway\/robo\/glossary\/g2\/terms$/, route => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ terms: [] }),
}))
await page.route(/\/api\/gateway\/robo\/glossary\/g1\/terms\/t1$/, async route => {
  if (route.request().method() === 'DELETE') {
    termDeleteRequests += 1
    if (termDeleteRequests === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Term delete verification outage' }),
      })
      return
    }
    termDeleted = true
    await route.fulfill({ status: 204 })
    return
  }

  termDetailRequests += 1
  if (termDetailRequests === 1) {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Term detail verification outage' }),
    })
    return
  }
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      id: 't1',
      name: '고객',
      description: '복구된 상세 설명',
      status: 'Approved',
      synonyms: ['구매자'],
      owners: [{ id: 'o1', name: '영업팀' }],
      reviewers: [{ id: 'o2', name: '검토팀' }],
      domains: [{ id: 'd1', name: '영업' }],
      tags: [{ id: 'tag1', name: '핵심', color: '#3b82f6' }],
    }),
  })
})
await page.route(/\/api\/gateway\/robo\/glossary\/g1$/, async route => {
  assert(route.request().method() === 'DELETE', 'Unexpected glossary detail request')
  glossaryDeleteRequests += 1
  if (glossaryDeleteRequests === 1) {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Glossary delete verification outage' }),
    })
    return
  }
  glossaryDeleted = true
  await route.fulfill({ status: 204 })
})
await page.route(/\/api\/gateway\/robo\/glossary\/meta\/domains$/, async route => {
  domainMetadataRequests += 1
  if (domainMetadataRequests === 1) {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Domain metadata verification outage' }),
    })
    return
  }
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ domains: [{ id: 'd1', name: '영업' }] }),
  })
})
await page.route(/\/api\/gateway\/robo\/glossary\/meta\/owners$/, route => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ owners: [{ id: 'o1', name: '영업팀' }] }),
}))
await page.route(/\/api\/gateway\/robo\/glossary\/meta\/tags$/, route => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ tags: [{ id: 'tag1', name: '핵심', color: '#3b82f6' }] }),
}))

try {
  await openFeature(page, '용어 관리')
  await page.getByRole('heading', { name: '표준 용어', exact: true }).waitFor()

  await page.getByTitle('새 용어집').click()
  let editorDialog = page.getByRole('dialog', { name: '새 용어집 만들기' })
  assert(
    await editorDialog.getByLabel('용어집 이름 *').evaluate(
      element => element === document.activeElement,
    ),
    'Glossary editor did not focus its name input',
  )
  await page.keyboard.press('Escape')
  await editorDialog.waitFor({ state: 'hidden' })

  await page.getByRole('button', { name: '사용자 지정' }).click()
  editorDialog = page.getByRole('dialog', { name: '새 용어 추가' })
  assert(
    await editorDialog.getByLabel('용어 이름 *').evaluate(
      element => element === document.activeElement,
    ),
    'Term editor did not focus its name input',
  )
  const metadataStatus = editorDialog.getByRole('status').filter({
    hasText: '일부 메타데이터 선택 항목을 불러오지 못했습니다.',
  })
  await metadataStatus.waitFor()
  await metadataStatus.getByRole('button', { name: '다시 시도' }).click()
  await metadataStatus.waitFor({ state: 'hidden' })
  assert(domainMetadataRequests === 2, 'Term metadata retry did not recover the failed source')
  await editorDialog.getByLabel('용어 이름 *').press('Escape')
  await editorDialog.waitFor({ state: 'hidden' })

  let customerRow = page.locator('.term-row').filter({ hasText: '고객' })
  const expandButton = customerRow.getByRole('button', { name: '더 보기' })
  await expandButton.click()
  assert(
    await customerRow.locator('.term-description').evaluate(element =>
      element.classList.contains('expanded'),
    ),
    'Individual term description expansion remained a no-op',
  )

  await customerRow.focus()
  await page.keyboard.press('Enter')
  const errorToast = page.getByRole('alert').filter({
    hasText: 'ROBO 백엔드 서비스가 동작하지 않습니다.',
  })
  await errorToast.waitFor()
  const listRequestsBeforeRetry = glossaryListRequests
  await errorToast.getByRole('button', { name: '다시 시도' }).click()
  await page.getByText('복구된 상세 설명').waitFor()
  assert(termDetailRequests === 2, 'Term detail retry did not repeat the failed detail request')
  assert(
    glossaryListRequests === listRequestsBeforeRetry,
    'Term detail retry incorrectly reloaded the glossary list',
  )

  await page.setViewportSize({ width: 390, height: 844 })
  const mobileGeometry = await page.evaluate(() => {
    const root = document.querySelector('.glossary-tab')
    if (!(root instanceof HTMLElement)) throw new Error('Glossary root missing')
    return {
      documentOverflow:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      rootOverflow: root.scrollWidth - root.clientWidth,
      width: root.getBoundingClientRect().width,
    }
  })
  assert(
    mobileGeometry.documentOverflow <= 1
      && mobileGeometry.rootOverflow <= 1
      && mobileGeometry.width <= 390,
    `Glossary mobile layout overflowed: ${JSON.stringify(mobileGeometry)}`,
  )
  await page.screenshot({
    path: join(evidenceDir, 'catalog-glossary-390x844.png'),
    fullPage: true,
  })
  await page.setViewportSize({ width: 1920, height: 1080 })

  customerRow = page.locator('.term-row').filter({ hasText: '고객' })
  await customerRow.getByTitle('삭제').click()
  let dialog = page.getByRole('alertdialog', { name: '용어 삭제' })
  assert(
    await dialog.getByRole('button', { name: '용어 삭제' }).evaluate(
      element => element === document.activeElement,
    ),
    'Term delete dialog did not receive initial focus',
  )
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden' })
  assert(termDeleteRequests === 0, 'Term delete Escape issued a request')

  await customerRow.getByTitle('삭제').click()
  dialog = page.getByRole('alertdialog', { name: '용어 삭제' })
  await dialog.getByRole('button', { name: '용어 삭제' }).click()
  await dialog.getByRole('alert').waitFor()
  assert(termDeleteRequests === 1, 'Term delete failure request count drifted')
  await dialog.getByRole('button', { name: '용어 삭제' }).click()
  await dialog.waitFor({ state: 'hidden' })
  await customerRow.waitFor({ state: 'hidden' })
  assert(termDeleteRequests === 2, 'Term delete retry did not issue exactly two requests')

  const glossaryDeleteButton = page.getByTitle('용어집 삭제')
  await glossaryDeleteButton.click()
  dialog = page.getByRole('alertdialog', { name: '용어집 삭제' })
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden' })
  assert(glossaryDeleteRequests === 0, 'Glossary delete Escape issued a request')

  await glossaryDeleteButton.click()
  dialog = page.getByRole('alertdialog', { name: '용어집 삭제' })
  await dialog.getByRole('button', { name: '용어집 삭제' }).click()
  await dialog.getByRole('alert').waitFor()
  await dialog.getByRole('button', { name: '용어집 삭제' }).click()
  await dialog.waitFor({ state: 'hidden' })
  await page.getByRole('heading', { name: '기술 용어', exact: true }).waitFor()
  assert(glossaryDeleteRequests === 2, 'Glossary delete retry did not issue exactly two requests')
  assert(termListRequests >= 2, 'Term list was not refreshed after a successful term deletion')
  assert(pageErrors.length === 0, `Glossary page errors: ${pageErrors.join(' | ')}`)

  console.log('Catalog glossary UI: exact retry + keyboard selection + delete recovery + mobile passed')
} finally {
  await context.close()
  await browser.close()
}
