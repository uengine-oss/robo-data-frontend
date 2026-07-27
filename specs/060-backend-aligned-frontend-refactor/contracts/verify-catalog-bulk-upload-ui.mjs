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
let uploadRequests = 0
let extractRequests = 0
let importRequests = 0
let rollbackRequests = 0
const importPayloads = []

page.on('pageerror', error => pageErrors.push(error.message))
await page.route(/\/api\/gateway\/robo\/graph\/$/, route => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ nodes: [], relationships: [] }),
}))
await page.route(/\/api\/gateway\/robo\/glossary\/$/, route => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({
    glossaries: [{
      id: 'g1',
      name: '표준 용어',
      description: '계약 검증 용어집',
      type: 'Business',
      termCount: 0,
    }],
  }),
}))
await page.route(/\/api\/gateway\/robo\/glossary\/g1\/terms$/, route => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ terms: [] }),
}))
await page.route(
  /\/api\/gateway\/robo\/glossary\/g1\/terms\/bulk-upload$/,
  async route => {
    uploadRequests += 1
    if (uploadRequests === 1) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          session_id: 7,
          files: [],
          join_rules: [],
          term_source_file: null,
          no_term_source: true,
        }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        session_id: 'session-1',
        files: [{
          filename: 'terms.csv',
          headers: ['용어', '설명', '상태'],
          sample_rows: [['고객', '구매 주체', 'Approved']],
          total_rows: 2,
          parse_status: 'parsed',
          role: 'term_source',
          confidence: 0.99,
          column_mapping: {
            term_name: '용어',
            term_description: '설명',
            term_status: '상태',
          },
          unmapped_columns: [],
        }],
        join_rules: [],
        term_source_file: 'terms.csv',
        no_term_source: false,
      }),
    })
  },
)
await page.route(
  /\/api\/gateway\/robo\/glossary\/g1\/terms\/bulk-extract$/,
  async route => {
    extractRequests += 1
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        term_candidates: [
          {
            row_index: 0,
            name: '고객',
            description: '구매 주체',
            status: 'Approved',
            synonyms: ['구매자'],
            domains: ['영업'],
            tags: [],
          },
          {
            row_index: 1,
            name: '주문',
            description: '판매 기록',
            status: 'Draft',
            synonyms: [],
            domains: ['판매'],
            tags: [],
          },
        ],
        total: 2,
        enriched: false,
        join_statistics: [],
        field_statistics: {
          name: { filled: 2, empty: 0 },
          description: { filled: 2, empty: 0 },
          status: { filled: 2, empty: 0, distribution: { Approved: 1, Draft: 1 } },
          synonyms: { filled: 1, empty: 1 },
          domains: { filled: 2, empty: 0 },
        },
        unmapped_columns: [],
      }),
    })
  },
)
await page.route(
  /\/api\/gateway\/robo\/glossary\/g1\/terms\/bulk-import$/,
  async route => {
    importRequests += 1
    importPayloads.push(route.request().postDataJSON())
    if (importRequests === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Bulk import verification outage' }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        batch_id: 'batch-1',
        created: 2,
        skipped: 0,
        errors: [],
        domains_created: 1,
        domains_existing: 1,
        unmapped_columns_reminder: [],
        next_steps: ['검토하세요.'],
      }),
    })
  },
)
await page.route(
  /\/api\/gateway\/robo\/glossary\/g1\/terms\/bulk-rollback\/batch-1$/,
  async route => {
    rollbackRequests += 1
    if (rollbackRequests === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Bulk rollback verification outage' }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ deleted: 2, batch_id: 'batch-1' }),
    })
  },
)

try {
  await page.addInitScript(() => {
    sessionStorage.setItem('glossary-bulk-upload:g1', '{broken')
  })
  await openFeature(page, '용어 관리')
  await page.getByRole('heading', { name: '표준 용어', exact: true }).waitFor()
  await page.getByRole('button', { name: '일괄 업로드' }).click()
  let modal = page.getByRole('dialog', { name: '표준 용어 사전 일괄 업로드' })
  await modal.getByText('손상되었거나 현재 형식과 맞지 않아 폐기했습니다.').waitFor()
  await modal.getByRole('button', { name: '용어 일괄 업로드 닫기' }).click()
  await modal.waitFor({ state: 'hidden' })

  await page.evaluate(() => {
    sessionStorage.setItem('glossary-bulk-upload:g1', JSON.stringify({
      version: 1,
      step: 1,
      uploadResponse: null,
      confirmedMapping: {
        term_source_file: '',
        term_name_column: null,
        term_description_column: null,
        term_status_column: null,
        term_status_fixed: null,
        term_synonyms_column: null,
        term_domains_column: null,
      },
      confirmedJoins: [],
      valueTransforms: [],
      useAiEnrichment: false,
      extractResult: null,
      editableCandidates: [],
      importResult: null,
      selectedRowIndexes: [],
      searchQuery: '',
      statusFilter: '',
      emptyOnly: false,
      sortKey: 'name',
      sortDirection: 'asc',
      hasPreviewData: false,
      needsPreviewRestore: false,
    }))
  })
  await page.getByRole('button', { name: '일괄 업로드' }).click()
  let confirmation = page.getByRole('alertdialog', { name: '이전 작업 이어서 진행' })
  await confirmation.waitFor()
  assert(
    await confirmation.getByRole('button', { name: '이어하기' }).evaluate(
      element => element === document.activeElement,
    ),
    'Resume confirmation did not receive initial focus',
  )
  await page.keyboard.press('Escape')
  await confirmation.waitFor({ state: 'hidden' })
  modal = page.getByRole('dialog', { name: '표준 용어 사전 일괄 업로드' })
  await modal.locator('input[type="file"]').waitFor()
  await modal.getByRole('button', { name: '용어 일괄 업로드 닫기' }).click()
  await modal.waitFor({ state: 'hidden' })

  await page.evaluate(() => {
    sessionStorage.setItem('glossary-bulk-upload:g1', JSON.stringify({
      version: 1,
      step: 2,
      uploadResponse: {
        session_id: 'restored-session',
        files: [{
          filename: 'restored.csv',
          headers: ['용어', '설명'],
          sample_rows: [['고객', '복원 데이터']],
          total_rows: 1,
          parse_status: 'parsed',
          role: 'term_source',
          confidence: 0.95,
          column_mapping: {
            term_name: '용어',
            term_description: '설명',
          },
          unmapped_columns: [],
        }],
        join_rules: [],
        term_source_file: 'restored.csv',
        no_term_source: false,
      },
      confirmedMapping: {
        term_source_file: 'restored.csv',
        term_name_column: '용어',
        term_description_column: '설명',
        term_status_column: null,
        term_status_fixed: null,
        term_synonyms_column: null,
        term_domains_column: null,
      },
      confirmedJoins: [],
      valueTransforms: [],
      useAiEnrichment: false,
      extractResult: null,
      editableCandidates: [],
      importResult: null,
      selectedRowIndexes: [],
      searchQuery: '',
      statusFilter: '',
      emptyOnly: false,
      sortKey: 'name',
      sortDirection: 'asc',
      hasPreviewData: false,
      needsPreviewRestore: false,
    }))
  })
  await page.getByRole('button', { name: '일괄 업로드' }).click()
  confirmation = page.getByRole('alertdialog', { name: '이전 작업 이어서 진행' })
  await confirmation.getByRole('button', { name: '이어하기' }).click()
  modal = page.getByRole('dialog', { name: '표준 용어 사전 일괄 업로드' })
  const restoredSourceSelect = modal.locator('.field-group select').first()
  await restoredSourceSelect.waitFor()
  assert(
    await restoredSourceSelect.inputValue() === 'restored.csv',
    'Accepted resume snapshot did not restore the source file mapping',
  )
  await modal.getByRole('button', { name: '용어 일괄 업로드 닫기' }).click()
  await modal.waitFor({ state: 'hidden' })
  await page.evaluate(() => sessionStorage.removeItem('glossary-bulk-upload:g1'))

  await page.getByRole('button', { name: '일괄 업로드' }).click()
  modal = page.getByRole('dialog', { name: '표준 용어 사전 일괄 업로드' })
  await modal.locator('input[type="file"]').setInputFiles({
    name: 'terms.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('용어,설명,상태\n고객,구매 주체,Approved\n주문,판매 기록,Draft'),
  })
  await modal.getByRole('button', { name: '업로드 시작' }).click()
  await modal.getByText(/upload\.session_id/).waitFor()
  await modal.getByRole('button', { name: '업로드 시작' }).click()
  await modal.getByText('용어 소스 파일').waitFor()
  assert(uploadRequests === 2, 'Malformed upload response did not allow one exact retry')

  await modal.getByRole('button', { name: '추출 시작' }).click()
  const firstPreviewRow = modal.locator('.preview-row').first()
  await firstPreviewRow.waitFor()
  assert(
    await firstPreviewRow.locator('input[type="text"]').first().inputValue() === '고객',
    'Extracted candidate was not projected into the editable preview',
  )
  assert(extractRequests === 1, 'Direct extraction request count drifted')

  await page.setViewportSize({ width: 390, height: 844 })
  const geometry = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]')
    if (!(dialog instanceof HTMLElement)) throw new Error('Bulk upload dialog missing')
    const rect = dialog.getBoundingClientRect()
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }
  })
  assert(
    geometry.left >= 0
      && geometry.right <= 390
      && geometry.top >= 0
      && geometry.bottom <= 844
      && geometry.pageOverflow <= 1,
    `Mobile bulk preview overflowed: ${JSON.stringify(geometry)}`,
  )
  await firstPreviewRow.scrollIntoViewIfNeeded()
  await page.screenshot({
    path: join(evidenceDir, 'catalog-bulk-preview-390x844.png'),
    fullPage: true,
  })

  await modal.getByRole('button', { name: '가져오기 (2)' }).click()
  confirmation = page.getByRole('alertdialog', { name: '선택 용어 가져오기' })
  await page.keyboard.press('Escape')
  await confirmation.waitFor({ state: 'hidden' })
  assert(importRequests === 0, 'Import confirmation Escape issued a request')

  await modal.getByRole('button', { name: '가져오기 (2)' }).click()
  confirmation = page.getByRole('alertdialog', { name: '선택 용어 가져오기' })
  await confirmation.getByRole('button', { name: '가져오기', exact: true }).click()
  await confirmation.getByRole('alert').waitFor()
  assert(
    (await confirmation.getByRole('alert').innerText()).includes('ROBO 백엔드 서비스가 동작하지 않습니다.'),
    'Import failure was hidden or confirmation closed',
  )
  await confirmation.getByRole('button', { name: '가져오기', exact: true }).click()
  await confirmation.waitFor({ state: 'hidden' })
  await modal.getByRole('heading', { name: '가져오기 완료' }).waitFor()
  assert(importRequests === 2, 'Import retry did not issue exactly two requests')
  assert(
    importPayloads[1].terms.length === 2
      && importPayloads[1].terms[0].name === '고객'
      && importPayloads[1].terms[1].name === '주문',
    `Import payload drifted: ${JSON.stringify(importPayloads[1])}`,
  )

  await modal.getByRole('button', { name: '이 배치 되돌리기' }).click()
  confirmation = page.getByRole('alertdialog', { name: '업로드 배치 되돌리기' })
  await page.keyboard.press('Escape')
  await confirmation.waitFor({ state: 'hidden' })
  assert(rollbackRequests === 0, 'Rollback confirmation Escape issued a request')

  await modal.getByRole('button', { name: '이 배치 되돌리기' }).click()
  confirmation = page.getByRole('alertdialog', { name: '업로드 배치 되돌리기' })
  await confirmation.getByRole('button', { name: '전체 되돌리기' }).click()
  await confirmation.getByRole('alert').waitFor()
  assert(
    (await confirmation.getByRole('alert').innerText()).includes('ROBO 백엔드 서비스가 동작하지 않습니다.'),
    'Rollback failure was hidden or confirmation closed',
  )
  await confirmation.getByRole('button', { name: '전체 되돌리기' }).click()
  await confirmation.waitFor({ state: 'hidden' })
  await modal.getByText('2건이 일괄 삭제되었습니다.').waitFor()
  assert(rollbackRequests === 2, 'Rollback retry did not issue exactly two requests')
  assert(pageErrors.length === 0, `Bulk upload page errors: ${pageErrors.join(' | ')}`)

  console.log('Catalog bulk upload UI: snapshot resume + malformed response retry + preview + import/rollback confirmations + mobile passed')
} finally {
  await context.close()
  await browser.close()
}
