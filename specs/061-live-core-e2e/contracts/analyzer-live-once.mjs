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
const screenshotDir = join(evidenceDir, 'screenshots')
const sourceDir = join(workspaceRoot, 'project/data/source/shop_mall')
const ddlPath = join(workspaceRoot, 'project/data/ddl/shopmall_schema.sql')
const expectedSourceFiles = [
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
].sort()
const expectedTableNames = new Set([
  'comm_code', 'audit_log', 'member', 'member_auth_hst', 'member_grade_pol',
  'member_ship_addr', 'product', 'product_stock', 'product_price_hst', 'cart',
  'orders', 'order_item', 'order_chk_hst', 'payment', 'pg_company', 'settlement',
  'shipping', 'delivery_company', 'shipping_trace', 'review', 'point_hst',
  'point_policy',
])
const datasource = {
  name: 'shopmall',
  engine: 'PostgreSQL',
  host: '127.0.0.1',
  port: '55432',
  username: 'shopmall',
  password: process.env.E2E_POSTGRES_PASSWORD ?? '',
  database: 'shopmall',
}

assert(
  datasource.password,
  'E2E_POSTGRES_PASSWORD is required for the one-shot live datasource registration',
)

await mkdir(screenshotDir, { recursive: true })

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function normalizedPath(value) {
  return String(value).replaceAll('\\', '/')
}

async function fillFormGroup(page, label, value) {
  const group = page.locator('.connection-form .form-group').filter({ hasText: label }).first()
  await group.locator('input').fill(String(value))
}

async function selectUploadInputs(dialog) {
  const directoryInputs = dialog.locator('input[type="file"][webkitdirectory]')
  const fileInputs = dialog.locator('input[type="file"]:not([webkitdirectory])')
  return {
    source: directoryInputs.first(),
    ddl: fileInputs.last(),
  }
}

async function waitForFileTotal(dialog, count) {
  await dialog.getByText(`총 ${count}개 파일`, { exact: true }).waitFor({
    state: 'visible',
    timeout: 30_000,
  })
}

async function removeTreeRow(panel, name) {
  const row = panel.locator('.row').filter({ hasText: name }).first()
  await row.waitFor({ state: 'visible', timeout: 15_000 })
  await row.getByTitle('제거', { exact: true }).click()
}

function parseMultipartFileNames(buffer) {
  if (!buffer) return []
  const text = buffer.toString('latin1')
  return [...text.matchAll(/filename="([^"]+)"/g)]
    .map(match => normalizedPath(match[1]))
    .sort()
}

async function readLiveSnapshot(page) {
  return page.evaluate(({ expectedTables }) => {
    const text = (selector) =>
      document.querySelector(selector)?.textContent?.trim() ?? ''
    const number = (value) => {
      const match = String(value).match(/\d+/)
      return match ? Number(match[0]) : 0
    }
    const phaseRows = [...document.querySelectorAll('.floating-progress-panel .phase-row')]
      .map(row => ({
        name: row.querySelector('.phase-name')?.textContent?.trim() ?? '',
        status: [...row.classList].find(name => ['pending', 'active', 'done', 'paused'].includes(name)) ?? '',
      }))
    const statValues = [...document.querySelectorAll('.floating-progress-panel .stat-value')]
      .map(node => number(node.textContent))
    const tabCounts = [...document.querySelectorAll('.floating-progress-panel .tab-btn')]
      .map(node => ({
        text: node.textContent?.trim() ?? '',
        count: number(node.querySelector('.tab-count')?.textContent),
      }))
    const streams = Array.isArray(window.__roboE2EStreams) ? window.__roboE2EStreams : []
    const analyze = streams.filter(record => record.kind === 'analyze')
    const parsing = streams.filter(record => record.kind === 'parsing')
    const parsedFiles = parsing
      .filter(record => record.event?.event === 'file_result')
      .map(record => String(record.event?.file ?? '').replaceAll('\\', '/'))
      .sort()
    const analyzerNodes = analyze
      .filter(record => record.event?.type === 'node_event')
      .map(record => record.event)
    const expectedTableSet = new Set(expectedTables)
    const unexpectedTable = analyzerNodes.find(node =>
      (node.label === 'TABLE' || node.labels?.includes('TABLE'))
      && !expectedTableSet.has(String(node.props?.name ?? '')),
    )
    const unexpectedFileNode = analyzerNodes.find(node => {
      const candidate = String(
        node.props?.file_path ?? node.props?.path ?? node.props?.relative_path ?? '',
      ).replaceAll('\\', '/')
      return candidate && !candidate.includes('shop_mall/')
    })
    return {
      at: Date.now(),
      percent: number(text('.floating-progress-panel .progress-percent')),
      step: text('.floating-progress-panel .step-label'),
      phaseRows,
      graphEventCount: tabCounts.find(tab => tab.text.startsWith('진행'))?.count ?? 0,
      consoleCount: tabCounts.find(tab => tab.text.startsWith('콘솔'))?.count ?? 0,
      navigatorCount: document.querySelectorAll('.navigator-panel .nav-tree-label').length,
      graphNodes: statValues[0] ?? 0,
      graphRelationships: statValues[1] ?? 0,
      analyzeEventCount: analyze.length,
      analyzeComplete: analyze.some(record =>
        record.event?.type === 'phase_event' && record.event?.event === 'complete'),
      analyzeStreamDone: Boolean(window.__roboE2EStreamDone?.analyze),
      parsingStreamDone: Boolean(window.__roboE2EStreamDone?.parsing),
      parsedFiles,
      identityViolation: unexpectedTable
        ? `unexpected table ${unexpectedTable.props?.name} (${unexpectedTable.id})`
        : unexpectedFileNode
          ? `unexpected file path ${JSON.stringify(unexpectedFileNode)}`
          : null,
    }
  }, { expectedTables: [...expectedTableNames] })
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
})

await context.addInitScript(() => {
  window.__roboE2EStreams = []
  window.__roboE2EStreamDone = { parsing: false, analyze: false }
  const originalFetch = window.fetch.bind(window)
  window.fetch = async (...args) => {
    const response = await originalFetch(...args)
    const requestUrl = typeof args[0] === 'string'
      ? args[0]
      : args[0] instanceof Request
        ? args[0].url
        : String(args[0])
    const kind = requestUrl.includes('/robo/analyze')
      ? 'analyze'
      : requestUrl.includes('/antlr/parsing')
        ? 'parsing'
        : null
    if (!kind || !response.body) return response

    const clone = response.clone()
    void (async () => {
      const reader = clone.body.getReader()
      const decoder = new TextDecoder()
      let pending = ''
      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          pending += decoder.decode(value, { stream: true })
          const lines = pending.split(/\r?\n/)
          pending = lines.pop() ?? ''
          for (const raw of lines) {
            const line = raw.trim()
            if (!line) continue
            let event = null
            try {
              event = JSON.parse(line.startsWith('data:') ? line.slice(5).trim() : line)
            } catch {
              event = { type: 'unparsed', raw: line.slice(0, 1000) }
            }
            window.__roboE2EStreams.push({
              kind,
              at: Date.now(),
              elapsedMs: Math.round(performance.now()),
              event,
            })
          }
        }
        const tail = pending.trim()
        if (tail) {
          let event = null
          try {
            event = JSON.parse(tail.startsWith('data:') ? tail.slice(5).trim() : tail)
          } catch {
            event = { type: 'unparsed', raw: tail.slice(0, 1000) }
          }
          window.__roboE2EStreams.push({
            kind,
            at: Date.now(),
            elapsedMs: Math.round(performance.now()),
            event,
          })
        }
      } finally {
        window.__roboE2EStreamDone[kind] = true
      }
    })()
    return response
  }
})

const page = await context.newPage()
const pageErrors = []
const consoleErrors = []
const requestFailures = []
const httpFailures = []
const requests = []
let uploadFileNames = []

page.on('pageerror', error => pageErrors.push(error.message))
page.on('console', message => {
  if (message.type() === 'error') consoleErrors.push(message.text())
})
page.on('requestfailed', request => {
  requestFailures.push({
    url: request.url(),
    method: request.method(),
    error: request.failure()?.errorText ?? 'request failed',
  })
})
page.on('request', request => {
  const url = request.url()
  if (!url.includes('/api/gateway/')) return
  requests.push({
    at: Date.now(),
    method: request.method(),
    url,
    database: request.headers()['x-neo4j-database'] ?? null,
  })
  if (url.includes('/antlr/fileUpload') && request.method() === 'POST') {
    uploadFileNames = parseMultipartFileNames(request.postDataBuffer())
  }
})
page.on('response', response => {
  if (response.status() >= 400) {
    httpFailures.push({
      at: Date.now(),
      status: response.status(),
      method: response.request().method(),
      url: response.url(),
    })
  }
})

let result = null
try {
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })

  // DataSource registration is the first dependent checkpoint.
  await page.locator('button.nav-child[title="데이터 소스"]').first().click()
  await page.getByRole('heading', { name: '데이터 소스', exact: true }).waitFor()
  const emptyState = page.getByText('등록된 데이터 소스가 없습니다', { exact: true })
  const existingDatasource = page.getByRole('heading', { name: datasource.name, exact: true })
  if (!await existingDatasource.isVisible().catch(() => false)) {
    await emptyState.waitFor({ state: 'visible', timeout: 30_000 })
    await page.getByRole('button', { name: /첫 번째 데이터 소스 추가|새 연결 추가/ }).first().click()
    await page.getByRole('button', {
      name: 'PostgreSQL 강력한 오픈소스 관계형 데이터베이스',
      exact: true,
    }).click()
    await page.locator('input[placeholder="my_database"]').fill(datasource.name)
    await fillFormGroup(page, 'Host', datasource.host)
    await fillFormGroup(page, 'Port', datasource.port)
    await fillFormGroup(page, 'Username', datasource.username)
    await fillFormGroup(page, 'Password', datasource.password)
    await fillFormGroup(page, 'Database', datasource.database)
    const metadataLabel = page.getByText(
      '데이터 소스 등록 후 자동으로 메타데이터 추출',
      { exact: true },
    )
    if (await metadataLabel.count()) {
      const checkbox = metadataLabel.locator('..').locator('input[type="checkbox"]')
      if (await checkbox.isChecked()) await checkbox.uncheck()
    }
    await page.getByRole('button', { name: '연결 테스트' }).click()
    await page.locator('.connection-form .test-alert.success').waitFor({
      state: 'visible',
      timeout: 45_000,
    })
    await page.getByRole('button', { name: '연결 생성' }).click()
  }
  await page.getByRole('heading', { name: datasource.name, exact: true }).waitFor({
    state: 'visible',
    timeout: 45_000,
  })
  await page.screenshot({
    path: join(screenshotDir, '01-datasource-created-1920x1080.png'),
    fullPage: true,
  })

  // Upload draft: individual deletion, whole source-folder deletion, and re-add.
  await page.getByTitle('코드', { exact: true }).click()
  await page.getByText(/이 영역을 클릭하여 업로드 설정/).click()
  const uploadDialog = page.getByRole('dialog', { name: '업로드 설정' })
  await uploadDialog.waitFor({ state: 'visible' })
  let inputs = await selectUploadInputs(uploadDialog)
  await inputs.source.setInputFiles(sourceDir)
  await waitForFileTotal(uploadDialog, 12)
  await inputs.ddl.setInputFiles(ddlPath)
  await waitForFileTotal(uploadDialog, 13)

  const sourcePanel = uploadDialog.locator('.tree-panel').first()
  await removeTreeRow(sourcePanel, 'shipping.c')
  await waitForFileTotal(uploadDialog, 12)
  inputs = await selectUploadInputs(uploadDialog)
  await inputs.source.setInputFiles(sourceDir)
  await waitForFileTotal(uploadDialog, 13)

  await removeTreeRow(sourcePanel, 'shop_mall')
  await waitForFileTotal(uploadDialog, 1)
  inputs = await selectUploadInputs(uploadDialog)
  await inputs.source.setInputFiles(sourceDir)
  await waitForFileTotal(uploadDialog, 13)

  await uploadDialog.getByRole('button', { name: /데이터 소스 선택/ }).click()
  await uploadDialog.getByRole('button').filter({ hasText: datasource.name }).click()
  const fkCheckbox = uploadDialog.getByText('FK 관계 자동 추론', { exact: false })
    .locator('..').locator('input[type="checkbox"]')
  if (await fkCheckbox.isChecked()) await fkCheckbox.uncheck()
  await page.screenshot({
    path: join(screenshotDir, '02-upload-final-draft-1920x1080.png'),
    fullPage: true,
  })

  const analyzeResponsePromise = page.waitForResponse(
    response =>
      response.url().includes('/api/gateway/robo/analyze')
      && response.request().method() === 'POST',
    { timeout: 180_000 },
  )
  await uploadDialog.getByRole('button', { name: '업로드', exact: true }).click()
  const existing = page.getByText('기존 데이터 감지', { exact: true })
  if (await existing.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await page.getByText('기존 데이터에 추가', { exact: true }).click()
  }
  const analyzeResponse = await analyzeResponsePromise
  assert(analyzeResponse.ok(), `Analyze returned HTTP ${analyzeResponse.status()}`)

  let streamFinished = false
  let streamFailure = null
  void analyzeResponse.finished().then(
    () => { streamFinished = true },
    error => { streamFailure = error; streamFinished = true },
  )

  const snapshots = []
  const milestoneScreenshots = new Set()
  let previousSignature = ''
  let lastActivityAt = Date.now()
  const deadline = Date.now() + 30 * 60_000
  while (!streamFinished && Date.now() < deadline) {
    const snapshot = await readLiveSnapshot(page)
    if (snapshot.parsingStreamDone) {
      assert(
        JSON.stringify(snapshot.parsedFiles) === JSON.stringify(expectedSourceFiles),
        `ANTLR parsed an unexpected corpus: ${JSON.stringify(snapshot.parsedFiles)}`,
      )
    }
    assert(
      !snapshot.identityViolation,
      `Analyzer consumed an unexpected corpus: ${snapshot.identityViolation}`,
    )
    const signature = JSON.stringify({
      percent: snapshot.percent,
      phases: snapshot.phaseRows,
      console: snapshot.consoleCount,
      navigator: snapshot.navigatorCount,
      nodes: snapshot.graphNodes,
      relationships: snapshot.graphRelationships,
      events: snapshot.analyzeEventCount,
    })
    if (signature !== previousSignature) {
      snapshots.push(snapshot)
      previousSignature = signature
      lastActivityAt = Date.now()
    }

    if (snapshot.analyzeEventCount > 0 && !milestoneScreenshots.has('stream-start')) {
      milestoneScreenshots.add('stream-start')
      await page.screenshot({
        path: join(screenshotDir, '03-stream-start-1920x1080.png'),
        fullPage: true,
      })
    }
    if (snapshot.consoleCount > 1 && !milestoneScreenshots.has('console-live')) {
      milestoneScreenshots.add('console-live')
      await page.locator('.floating-progress-panel .tab-btn').filter({ hasText: '콘솔' }).click()
      await page.screenshot({
        path: join(screenshotDir, '04-console-live-1920x1080.png'),
        fullPage: true,
      })
      await page.locator('.floating-progress-panel .tab-btn').filter({ hasText: '단계' }).click()
    }
    if (
      snapshot.navigatorCount > 0
      && snapshot.graphNodes > 0
      && !snapshot.analyzeComplete
      && !milestoneScreenshots.has('graph-live')
    ) {
      milestoneScreenshots.add('graph-live')
      await page.screenshot({
        path: join(screenshotDir, '05-navigator-graph-live-1920x1080.png'),
        fullPage: true,
      })
    }

    if (Date.now() - lastActivityAt > 5 * 60_000) {
      throw new Error('Analyze stream and UI made no observable progress for five minutes')
    }
    await page.waitForTimeout(250)
  }
  assert(streamFinished, 'Analyze stream did not finish within 30 minutes')
  if (streamFailure) throw streamFailure
  await page.waitForFunction(
    () => window.__roboE2EStreamDone?.analyze === true,
    undefined,
    { timeout: 30_000 },
  )

  const streamRecords = await page.evaluate(() => window.__roboE2EStreams)
  const analyzeEvents = streamRecords.filter(record => record.kind === 'analyze')
  const parsingEvents = streamRecords.filter(record => record.kind === 'parsing')
  const parsedFiles = parsingEvents
    .filter(record => record.event?.event === 'file_result')
    .map(record => normalizedPath(record.event.file))
    .sort()
  const phaseEvents = analyzeEvents.filter(record => record.event?.type === 'phase_event')
  const nodeEvents = analyzeEvents.filter(record => record.event?.type === 'node_event')
  const relationshipEvents = analyzeEvents.filter(
    record => record.event?.type === 'relationship_event',
  )
  const processingEvents = analyzeEvents.filter(
    record => record.event?.type === 'processing_event',
  )
  const fatalErrors = analyzeEvents.filter(
    record => record.event?.type === 'error' && record.event?.fatal,
  )
  const complete = phaseEvents.find(record => record.event?.event === 'complete')

  assert(parsingEvents.length > 0, 'No live ANTLR parsing events were captured')
  assert(
    JSON.stringify(parsedFiles) === JSON.stringify(expectedSourceFiles),
    `ANTLR parsed an unexpected corpus: ${JSON.stringify(parsedFiles)}`,
  )
  assert(analyzeEvents.length > 0, 'No live Analyzer events were captured')
  assert(nodeEvents.length > 0, 'No Analyzer node_event was captured')
  assert(relationshipEvents.length > 0, 'No Analyzer relationship_event was captured')
  assert(processingEvents.length > 0, 'No Analyzer processing_event was captured')
  assert(complete, 'Analyzer stream ended without phase_event complete')
  assert(fatalErrors.length === 0, `Analyzer emitted ${fatalErrors.length} fatal errors`)
  assert(
    snapshots.some(snapshot =>
      snapshot.navigatorCount > 0
      && snapshot.graphNodes > 0
      && !snapshot.analyzeComplete),
    'Navigator/graph was not populated before the complete event',
  )
  assert(
    snapshots.some(snapshot => snapshot.consoleCount > 0 && !snapshot.analyzeComplete),
    'Console did not receive messages before the complete event',
  )
  for (let index = 1; index < snapshots.length; index += 1) {
    assert(
      snapshots[index].percent >= snapshots[index - 1].percent,
      `Progress regressed ${snapshots[index - 1].percent}% -> ${snapshots[index].percent}%`,
    )
  }

  const invalidNodes = nodeEvents.filter(record =>
    !record.event?.id
    || !(record.event?.labels?.length || record.event?.label),
  )
  const invalidRelationships = relationshipEvents.filter(record =>
    !record.event?.from?.id || !record.event?.to || !record.event?.rel_type,
  )
  assert(invalidNodes.length === 0, `${invalidNodes.length} node events lack id/labels`)
  assert(
    invalidRelationships.length === 0,
    `${invalidRelationships.length} relationship events lack endpoints/type`,
  )

  await page.locator('.navigator-panel .nav-tree-label').first().waitFor({
    state: 'visible',
    timeout: 30_000,
  })
  const navigatorNode = page.locator('.navigator-panel .nav-tree-label').filter({
    has: page.locator('.name'),
  }).first()
  const navigatorNodeId = await navigatorNode.getAttribute('title')
  await navigatorNode.dblclick()
  await page.waitForTimeout(1_000)
  assert(
    await navigatorNode.evaluate(element => element.classList.contains('on-canvas')),
    `Navigator dblclick did not add ${navigatorNodeId} to the canvas`,
  )
  await page.screenshot({
    path: join(screenshotDir, '06-analysis-complete-dblclick-1920x1080.png'),
    fullPage: true,
  })

  const expectedUploadNames = [
    ...expectedSourceFiles,
    'ddl/shopmall_schema.sql',
  ].sort()
  assert(
    JSON.stringify(uploadFileNames) === JSON.stringify(expectedUploadNames),
    `Upload payload mismatch: ${JSON.stringify(uploadFileNames)}`,
  )

  result = {
    status: 'passed',
    database: 'neo4j',
    datasource,
    uploadFileNames,
    streams: {
      parsingEvents: parsingEvents.length,
      analyzeEvents: analyzeEvents.length,
      phaseEvents: phaseEvents.length,
      nodeEvents: nodeEvents.length,
      relationshipEvents: relationshipEvents.length,
      processingEvents: processingEvents.length,
      firstAnalyzeEventAt: analyzeEvents[0]?.at ?? null,
      completeAt: complete.at,
    },
    liveSnapshots: snapshots,
    navigatorDoubleClickNodeId: navigatorNodeId,
    requests,
    pageErrors,
    consoleErrors,
    requestFailures,
    httpFailures,
  }

  assert(pageErrors.length === 0, `Page errors: ${pageErrors.join(' | ')}`)
  assert(consoleErrors.length === 0, `Console errors: ${consoleErrors.join(' | ')}`)
  assert(requestFailures.length === 0, `Request failures: ${JSON.stringify(requestFailures)}`)
  assert(httpFailures.length === 0, `HTTP failures: ${JSON.stringify(httpFailures)}`)
} catch (error) {
  await page.screenshot({
    path: join(screenshotDir, 'FAILED-analyzer-live-once.png'),
    fullPage: true,
  }).catch(() => undefined)
  result = {
    status: 'failed',
    error: error instanceof Error ? error.stack ?? error.message : String(error),
    uploadFileNames,
    requests,
    pageErrors,
    consoleErrors,
    requestFailures,
    httpFailures,
    streams: await page.evaluate(() => window.__roboE2EStreams ?? []).catch(() => []),
    lastSnapshot: await readLiveSnapshot(page).catch(() => null),
  }
} finally {
  await writeFile(
    join(evidenceDir, 'analyzer-live-once-result.json'),
    `${JSON.stringify(result, null, 2)}\n`,
    'utf8',
  )
  await page.close()
  await context.close()
  await browser.close()
}

if (result?.status !== 'passed') {
  throw new Error(result?.error ?? 'Analyzer live E2E failed')
}

console.log(JSON.stringify({
  status: result.status,
  streams: result.streams,
  liveSnapshotCount: result.liveSnapshots.length,
  uploadFileCount: result.uploadFileNames.length,
  navigatorDoubleClickNodeId: result.navigatorDoubleClickNodeId,
}, null, 2))
