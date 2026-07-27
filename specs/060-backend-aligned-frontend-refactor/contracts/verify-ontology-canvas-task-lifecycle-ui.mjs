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
  await button.waitFor({ state: 'attached', timeout: 15_000 })
  if (!(await button.isVisible())) {
    await button
      .locator('xpath=ancestor::div[contains(@class,"nav-group")]')
      .locator('button.nav-group-header')
      .click()
  }
  await button.waitFor({ state: 'visible', timeout: 5_000 })
  await button.click()
}

function schemaDetail(id, name, nodeId, nodeName) {
  return {
    id,
    name,
    nodes: [{
      id: nodeId,
      name: nodeName,
      label: 'KPI',
      layer: 'KPI',
      position: { x: 180, y: 160 },
    }],
    relationships: [],
    labels: [],
  }
}

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  const pageErrors = []
  const consoleErrors = []
  const schemaRequests = []
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('request', request => {
    if (request.url().includes('/api/gateway/ontology/schemas/')) {
      schemaRequests.push(`${request.method()} ${request.url()}`)
    }
  })

  await page.addInitScript(() => {
    localStorage.setItem('robo-analyzer-recent-schemas', '[]')
    localStorage.setItem('robo-analyzer-selected-nodes', JSON.stringify([
      { schemaId: 'schema-a', nodeId: 'node-a', timestamp: 2 },
      { schemaId: 'schema-b', nodeId: 'node-b', timestamp: 1 },
    ]))
  })
  await page.route(/\/api\/gateway\/robo\/graph\/?$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '{"nodes":[],"relationships":[]}',
  }))
  await page.route(/\/api\/gateway\/ontology\/schemas$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      schemas: [
        {
          id: 'schema-a',
          name: 'A 온톨로지',
          nodeCount: 1,
          updatedAt: '2026-07-24T01:00:00Z',
          hasSchemaJson: true,
        },
        {
          id: 'schema-b',
          name: 'B 온톨로지',
          nodeCount: 1,
          updatedAt: '2026-07-24T02:00:00Z',
          hasSchemaJson: true,
        },
      ],
      activeSchemaId: null,
    }),
  }))
  await page.route(/\/api\/gateway\/ontology\/schemas\/schema-(a|b)\/activate$/, route => {
    const id = route.request().url().includes('schema-a') ? 'schema-a' : 'schema-b'
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        schemaId: id,
        name: id === 'schema-a' ? 'A 온톨로지' : 'B 온톨로지',
      }),
    })
  })
  await page.route(/\/api\/gateway\/ontology\/schemas\/schema-a$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(schemaDetail('schema-a', 'A 온톨로지', 'node-a', 'A 지표')),
  }))
  await page.route(/\/api\/gateway\/ontology\/schemas\/schema-b$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(schemaDetail('schema-b', 'B 온톨로지', 'node-b', 'B 지표')),
  }))
  await page.route(/\/api\/gateway\/node-agent-scheduler\/agents$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '[]',
  }))
  await page.route(/\/api\/gateway\/ontology\/visual-effects$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '{"effects":{}}',
  }))

  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  await openFeature(page, '온톨로지 관리')
  const viewer = page.locator('.multi-layer-ontology-viewer')
  await viewer.waitFor({ timeout: 30_000 })
  const listTrigger = page.getByRole('button', { name: /온톨로지 목록/ })
  await listTrigger.click()
  await page.getByRole('button', { name: 'A 온톨로지', exact: true }).click()
  await page.getByRole('button', { name: 'A 지표', exact: true }).waitFor()

  await listTrigger.waitFor({ state: 'visible' })
  await listTrigger.click()
  await page.getByRole('button', { name: 'B 온톨로지', exact: true }).click()
  const bNode = page.getByRole('button', { name: 'B 지표', exact: true })
  await bNode.waitFor()
  await page.waitForTimeout(1_000)

  assert(
    !(await page.getByRole('button', { name: 'A 지표', exact: true }).isVisible().catch(() => false)),
    'Stale schema A canvas task restored A after schema B commit',
  )
  assert(await bNode.getAttribute('aria-pressed') === 'true', 'Schema B saved selection was not restored')
  assert(!(await viewer.locator('.loading-overlay').isVisible()), 'Stale loading task left the final schema loading')
  const graphBox = await viewer.locator('.graph-panel').boundingBox()
  const detailBox = await viewer.locator('.detail-panel').boundingBox()
  assert(graphBox && detailBox, 'Selected node detail layout did not render')
  assert(
    graphBox.x + graphBox.width <= detailBox.x + 1,
    `Graph and detail panel overlap: graph=${JSON.stringify(graphBox)} detail=${JSON.stringify(detailBox)}`,
  )
  assert(
    graphBox.width >= 320,
    `Detail panel left no usable ontology canvas width: ${JSON.stringify(graphBox)}`,
  )
  assert(
    schemaRequests.filter(request => request.includes('/activate')).length === 2,
    `Expected two schema activations, got ${schemaRequests.join(' | ')}`,
  )
  assert(pageErrors.length === 0, `Ontology canvas task page errors: ${pageErrors.join(' | ')}`)
  assert(consoleErrors.length === 0, `Ontology canvas task console errors: ${consoleErrors.join(' | ')}`)

  await page.screenshot({
    path: join(evidenceDir, 'ontology-canvas-latest-task-1280x720.png'),
    fullPage: true,
  })
  console.log('Ontology rapid schema canvas task lifecycle passed')
} finally {
  await browser.close()
}
