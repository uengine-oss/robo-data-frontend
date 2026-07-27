import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../../..')
const require = createRequire(join(repoRoot, '.unittest/package.json'))
const { chromium } = require('playwright')
const baseUrl = process.env.FRONTEND_URL ?? 'http://127.0.0.1:3000'
const harnessUrl = `${baseUrl}/specs/060-backend-aligned-frontend-refactor/contracts/modeling-dialog-lifecycle-harness.html`
const evidenceDir = resolve(here, '../evidence')
await mkdir(evidenceDir, { recursive: true })

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function objectType(id, name, columnName) {
  return {
    id,
    name,
    columns: [{ name: columnName, type: 'string' }],
    behaviors: [],
  }
}

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  const pageErrors = []
  const consoleErrors = []
  const relationshipBodies = []
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  await page.route(/\/api\/gateway\/ontology\/object-types$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      objectTypes: [
        objectType('customer', 'Customer', 'id'),
        objectType('order', 'Order', 'customer_id'),
      ],
      total: 2,
    }),
  }))
  await page.route(/\/api\/gateway\/ontology\/object-types\/Customer$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(objectType('customer', 'Customer', 'id')),
  }))
  await page.route(/\/api\/gateway\/ontology\/object-types\/Order$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(objectType('order', 'Order', 'customer_id')),
  }))
  await page.route(/\/api\/gateway\/ontology\/relationships$/, async route => {
    relationshipBodies.push(await route.request().postDataJSON())
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        relationship: {
          id: 'customer-orders',
          sourceType: 'Customer',
          targetType: 'Order',
          sourceColumn: 'id',
          targetColumn: 'customer_id',
          matchStrategy: 'EXACT_MATCH',
          cardinality: 'ONE_TO_MANY',
          name: 'customer_orders',
        },
      }),
    })
  })

  await page.goto(harnessUrl, { waitUntil: 'networkidle', timeout: 60_000 })

  const actionTrigger = page.getByRole('button', { name: '공용 삭제 열기' })
  await actionTrigger.click()
  const actionDialog = page.getByRole('alertdialog', { name: '공용 삭제' })
  const actionCancel = actionDialog.getByRole('button', { name: '취소' })
  assert(
    await actionCancel.evaluate(element => element === document.activeElement),
    'Shared action dialog initial focus drifted',
  )
  await actionDialog.getByRole('button', { name: '삭제', exact: true }).click()
  await page.keyboard.press('Escape')
  assert(await actionDialog.isVisible(), 'Shared action dialog closed while its mutation was pending')
  await actionDialog.getByRole('alert').waitFor()
  await actionDialog.getByRole('button', { name: '다시 시도' }).click()
  await actionDialog.waitFor({ state: 'hidden' })
  assert(
    await actionTrigger.evaluate(element => element === document.activeElement),
    'Shared action dialog did not restore trigger focus',
  )

  const cardinalityTrigger = page.getByRole('button', { name: '카디널리티 열기' })
  await cardinalityTrigger.click()
  const cardinalityDialog = page.getByRole('dialog', { name: '릴레이션 설정' })
  const oneToMany = cardinalityDialog.getByRole('button', { name: /일대다 \(1:N\)/ })
  const firstCardinality = cardinalityDialog.getByRole('button', { name: /일대일 \(1:1\)/ })
  assert(
    await firstCardinality.evaluate(element => element === document.activeElement),
    'Cardinality dialog initial focus drifted',
  )
  await oneToMany.click()
  const cardinalityDescription = cardinalityDialog.getByLabel('설명 (선택사항)')
  await cardinalityDescription.fill('주문별 고객')
  await cardinalityDialog.getByRole('button', { name: '릴레이션 생성' }).click()
  await page.keyboard.press('Escape')
  assert(await cardinalityDialog.isVisible(), 'Cardinality dialog closed while create was pending')
  await cardinalityDialog.getByRole('alert').waitFor()
  assert(await oneToMany.getAttribute('aria-pressed') === 'true', 'Cardinality retry lost the selected value')
  assert(
    await cardinalityDescription.inputValue() === '주문별 고객',
    'Cardinality retry lost the exact description draft',
  )
  await cardinalityDialog.getByRole('button', { name: '같은 설정 다시 시도' }).click()
  await cardinalityDialog.waitFor({ state: 'hidden' })
  assert(
    await cardinalityTrigger.evaluate(element => element === document.activeElement),
    'Cardinality dialog did not restore trigger focus',
  )
  assert(
    await page.locator('#modeling-dialog-event').innerText() === 'cardinality:1:N:주문별 고객',
    'Cardinality emitted result changed',
  )

  const ontologyTrigger = page.getByRole('button', { name: 'Ontology 관계 열기' })
  await ontologyTrigger.click()
  let ontologyDialog = page.getByRole('dialog', { name: '관계 생성' })
  const relationshipName = ontologyDialog.locator('input[type="text"]').first()
  await ontologyDialog.waitFor()
  assert(
    await relationshipName.evaluate(element => element === document.activeElement),
    'Ontology relationship dialog initial focus drifted',
  )
  await page.keyboard.press('Escape')
  await ontologyDialog.waitFor({ state: 'hidden' })
  assert(
    await ontologyTrigger.evaluate(element => element === document.activeElement),
    'Ontology relationship dialog did not restore trigger focus',
  )

  await ontologyTrigger.click()
  ontologyDialog = page.getByRole('dialog', { name: '관계 생성' })
  await ontologyDialog.locator('select').nth(0).waitFor()
  await ontologyDialog.locator('input[type="text"]').first().fill('customer_orders')
  await ontologyDialog.getByRole('button', { name: '관계 생성', exact: true }).click()
  await ontologyDialog.waitFor({ state: 'hidden' })
  assert(relationshipBodies.length === 1, `Ontology relationship request count changed: ${relationshipBodies.length}`)
  assert(
    JSON.stringify(relationshipBodies[0]) === JSON.stringify({
      sourceType: 'Customer',
      targetType: 'Order',
      sourceColumn: 'id',
      targetColumn: 'customer_id',
      matchStrategy: 'EXACT_MATCH',
      cardinality: 'ONE_TO_MANY',
      name: 'customer_orders',
    }),
    `Ontology relationship payload changed: ${JSON.stringify(relationshipBodies[0])}`,
  )

  const catalogTrigger = page.getByRole('button', { name: 'Catalog 관계 열기' })
  await catalogTrigger.click()
  const catalogDialog = page.getByRole('dialog', { name: 'Catalog 관계' })
  assert(
    await catalogDialog.evaluate(element => element === document.activeElement),
    'Catalog relationship dialog initial focus drifted',
  )
  const catalogDelete = catalogDialog.getByRole('button', { name: '관계 삭제' })
  await catalogDelete.focus()
  await page.keyboard.press('Tab')
  assert(
    await catalogDialog.getByRole('button', { name: '닫기' }).first()
      .evaluate(element => element === document.activeElement),
    'Catalog relationship Tab trap escaped',
  )
  await page.keyboard.press('Escape')
  await catalogDialog.waitFor({ state: 'hidden' })
  assert(
    await catalogTrigger.evaluate(element => element === document.activeElement),
    'Catalog relationship dialog did not restore trigger focus',
  )

  await page.setViewportSize({ width: 390, height: 844 })
  await cardinalityTrigger.click()
  await cardinalityDialog.waitFor({ state: 'visible' })
  await page.waitForTimeout(350)
  const box = await cardinalityDialog.boundingBox()
  assert(box, 'Mobile cardinality dialog has no layout box')
  assert(
    box.x >= 0 && box.y >= 0 && box.x + box.width <= 390 && box.y + box.height <= 844,
    `Mobile cardinality dialog escaped the viewport: ${JSON.stringify(box)}`,
  )
  assert(
    await page.evaluate(() =>
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= window.innerWidth),
    'Modeling dialog harness introduced document horizontal overflow',
  )
  await page.screenshot({
    path: join(evidenceDir, 'modeling-dialog-lifecycle-390x844.png'),
    fullPage: true,
  })

  assert(pageErrors.length === 0, `Modeling dialog page errors: ${pageErrors.join(' | ')}`)
  assert(consoleErrors.length === 0, `Modeling dialog console errors: ${consoleErrors.join(' | ')}`)
  console.log('Modeling dialog focus, retry, payload, and mobile lifecycle passed')
} finally {
  await browser.close()
}
