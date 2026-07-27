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

async function waitFor(predicate, message, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw new Error(message)
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

function objectTypesResponse(behaviors = []) {
  return {
    objectTypes: [{
      id: 'customer-type',
      name: 'Customer',
      description: 'Behavior browser contract fixture',
      columns: [
        { name: 'age', type: 'integer', description: '나이' },
        { name: 'name', type: 'string', description: '이름' },
        { name: 'email', type: 'string', description: '이메일' },
        { name: 'phone', type: 'string', description: '전화번호' },
        { name: 'status', type: 'string', description: '상태' },
        { name: 'grade', type: 'string', description: '등급' },
        { name: 'joined_at', type: 'datetime', description: '가입일' },
        { name: 'updated_at', type: 'datetime', description: '수정일' },
        { name: 'memo', type: 'string', description: '메모' },
      ],
      behaviors,
    }],
    total: 1,
  }
}

async function installFixture(page) {
  const state = {
    generationRequests: [],
    externalRequests: [],
    saveRequests: [],
    generationAttempts: 0,
    externalAttempts: 0,
    saveAttempts: 0,
    deleteAttempts: 0,
    deleteRequests: [],
    objectTypeDeleteAttempts: 0,
    objectTypeDeleteRequests: [],
    objectTypeDeleted: false,
    executionRequests: [],
    savedBehavior: null,
    objectTypeListRequests: 0,
  }

  await page.addInitScript(() => {
    localStorage.setItem('robo-analyzer-api-key', 'behavior-browser-key')
  })

  await page.route('**/api/gateway/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const method = request.method()

    if (path.endsWith('/api/gateway/ontology/object-types') && method === 'GET') {
      state.objectTypeListRequests += 1
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(state.objectTypeDeleted
          ? { objectTypes: [], total: 0 }
          : objectTypesResponse(state.savedBehavior ? [state.savedBehavior] : [])),
      })
    }
    if (
      path.endsWith('/api/gateway/ontology/object-types/Customer')
      && method === 'GET'
    ) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...objectTypesResponse(
            state.savedBehavior ? [state.savedBehavior] : [],
          ).objectTypes[0],
          query: 'SELECT age, name FROM customer',
          datasource: 'behavior-fixture',
        }),
      })
    }
    if (
      path.endsWith('/api/gateway/ontology/object-types/Customer')
      && method === 'DELETE'
    ) {
      state.objectTypeDeleteAttempts += 1
      state.objectTypeDeleteRequests.push({
        body: request.postDataJSON(),
        headers: request.headers(),
      })
      if (state.objectTypeDeleteAttempts === 1) {
        await new Promise(resolve => setTimeout(resolve, 160))
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"detail":"ObjectType delete browser fixture outage"}',
        })
      }
      state.objectTypeDeleted = true
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"success":true,"message":"ObjectType 삭제 완료"}',
      })
    }
    if (
      path.endsWith('/api/gateway/data-fabric/api/query')
      && method === 'POST'
    ) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          type: 'result',
          columns: ['age', 'name'],
          data: [[42, 'Ada']],
          row_count: 1,
          execution_time: 0.003,
        }),
      })
    }
    if (
      path.endsWith('/api/gateway/ontology/object-types/Customer/behaviors/risk_check/execute')
      && method === 'POST'
    ) {
      state.executionRequests.push({
        body: request.postDataJSON(),
        headers: request.headers(),
      })
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          result: { risk: 'LOW' },
          inputData: { age: 42, name: 'Ada' },
          code: 'result = {"risk": "LOW"}',
          attempts: [
            {
              attempt: 1,
              status: 'error',
              error: { errorType: 'NameError', error: 'risk is not defined' },
            },
            { attempt: 2, status: 'success' },
          ],
          message: 'Behavior 실행 완료',
        }),
      })
    }
    if (path.endsWith('/api/gateway/ontology/generate-code') && method === 'POST') {
      state.generationRequests.push({
        body: request.postDataJSON(),
        headers: request.headers(),
      })
      state.generationAttempts += 1
      if (state.generationAttempts === 1) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"detail":"generation browser fixture outage"}',
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          code: '```python\nresult = {"risk": "LOW"}\n```',
          language: 'python',
        }),
      })
    }
    if (
      path.endsWith('/api/gateway/ontology/object-types/Customer/behaviors')
      && method === 'POST'
    ) {
      const body = request.postDataJSON()
      state.saveRequests.push({ body, headers: request.headers() })
      state.saveAttempts += 1
      if (state.saveAttempts === 1) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"detail":"save browser fixture outage"}',
        })
      }
      state.savedBehavior = body
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Behavior 생성 완료',
          behavior: body,
        }),
      })
    }
    if (
      path.endsWith('/api/gateway/ontology/object-types/Customer/behaviors/risk_check')
      && method === 'DELETE'
    ) {
      state.deleteRequests.push({
        url: request.url(),
        headers: request.headers(),
      })
      state.deleteAttempts += 1
      if (state.deleteAttempts === 1) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"detail":"delete browser fixture outage"}',
        })
      }
      state.savedBehavior = null
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"success":true,"message":"Behavior 삭제 완료"}',
      })
    }
    if (path.includes('/api/gateway/robo/schema/tables')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '[]',
      })
    }
    if (path.includes('/api/gateway/robo/schema/relationships')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '[]',
      })
    }
    if (path.endsWith('/api/gateway/ontology/relationships')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '[]',
      })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{}',
    })
  })

  await page.route('https://external.fixture/behavior', route => {
    const request = route.request()
    state.externalRequests.push({
      body: request.postDataJSON(),
      headers: request.headers(),
      method: request.method(),
    })
    state.externalAttempts += 1
    if (state.externalAttempts === 1) {
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"detail":"external browser fixture outage"}',
      })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"success":true,"risk":"LOW"}',
    })
  })

  return state
}

async function openBehaviorDialog(page) {
  await openFeature(page, '도메인 스키마')
  await page.locator('.object-type-modeler').waitFor({ timeout: 30_000 })
  const item = page.locator('.object-type-item', { hasText: 'Customer' })
  await item.waitFor({ state: 'visible', timeout: 30_000 })
  await item.getByRole('button', { name: 'Customer ObjectType Behavior 추가' }).click()
  await page.getByRole('dialog', { name: 'Behavior 추가' }).waitFor()
}

const browser = await chromium.launch({ headless: true })

try {
  const desktop = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  const desktopErrors = []
  desktop.on('pageerror', error => desktopErrors.push(error.message))
  const state = await installFixture(desktop)
  await desktop.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  await openBehaviorDialog(desktop)

  const dialog = desktop.getByRole('dialog', { name: 'Behavior 추가' })
  const nameInput = dialog.getByLabel('이름 *')
  assert(
    await nameInput.evaluate(element => document.activeElement === element),
    'Behavior dialog did not focus its first editable field',
  )

  const closeButton = dialog.getByRole('button', { name: 'Behavior 편집기 닫기' })
  await closeButton.focus()
  await desktop.keyboard.press('Shift+Tab')
  assert(
    await dialog.getByRole('button', { name: '취소' })
      .evaluate(element => document.activeElement === element),
    'Behavior dialog focus trap did not wrap backward',
  )

  await nameInput.fill('risk check')
  await dialog.getByLabel('설명').fill('고객 위험도를 계산한다')
  await dialog.getByRole('button', { name: 'AI로 Python 코드 생성' }).click()
  const generationError = dialog.getByText('generation browser fixture outage')
  await generationError.waitFor()
  await dialog.getByRole('button', { name: '같은 요청 다시 시도' }).click()
  await dialog.getByRole('button', { name: 'Python 코드', exact: true })
    .waitFor()
  assert(state.generationRequests.length === 2, 'generation retry count is incorrect')
  assert(
    JSON.stringify(state.generationRequests[0].body)
      === JSON.stringify(state.generationRequests[1].body),
    'generation retry changed the failed request',
  )
  assert(
    state.generationRequests.every(request =>
      request.headers['x-llm-api-key'] === 'behavior-browser-key'),
    'internal Behavior generation request lost the current session headers',
  )

  await dialog.getByRole('button', { name: 'REST API 호출', exact: true }).click()
  await dialog.getByLabel('엔드포인트 URL *')
    .fill('https://external.fixture/behavior')
  await dialog.getByLabel('테스트 입력 (JSON 객체)').fill('[]')
  await dialog.getByRole('button', { name: '테스트', exact: true }).click()
  await dialog.getByText('테스트 입력은 JSON 객체여야 합니다.').waitFor()
  assert(
    state.externalRequests.length === 0,
    'invalid external test JSON reached the operator-supplied endpoint',
  )
  await dialog.getByLabel('테스트 입력 (JSON 객체)').fill('{"age":42}')
  await dialog.getByRole('button', { name: '테스트', exact: true }).click()
  await dialog.getByText('external browser fixture outage').waitFor()
  await dialog.getByRole('button', { name: '같은 요청 다시 시도' }).click()
  await dialog.getByText('"risk": "LOW"').waitFor()
  assert(state.externalRequests.length === 2, 'external retry count is incorrect')
  assert(
    JSON.stringify(state.externalRequests[0].body)
      === JSON.stringify(state.externalRequests[1].body),
    'external retry changed the failed request body',
  )
  assert(
    state.externalRequests.every(request =>
      !('x-llm-api-key' in request.headers)
      && !('x-neo4j-uri' in request.headers)
      && !('x-neo4j-user' in request.headers)),
    'operator-supplied external endpoint received ROBO session headers',
  )

  await desktop.screenshot({
    path: join(evidenceDir, 'ontology-behavior-editor-lifecycle-1920x1080.png'),
    fullPage: true,
  })

  await dialog.getByRole('button', { name: '저장', exact: true }).click()
  await dialog.getByText('save browser fixture outage').waitFor()
  await dialog.getByRole('button', { name: '같은 저장 다시 시도' }).click()
  await dialog.waitFor({ state: 'detached' })
  await waitFor(
    () => state.objectTypeListRequests >= 2,
    'Saved Behavior did not refresh the ObjectType list in time',
  )
  assert(state.saveRequests.length === 2, 'save retry count is incorrect')
  assert(state.objectTypeListRequests >= 2, 'saved Behavior did not refresh the ObjectType list')
  assert(
    JSON.stringify(state.saveRequests[0].body)
      === JSON.stringify(state.saveRequests[1].body),
    'save retry changed the failed mutation payload',
  )
  assert(
    state.saveRequests[1].body.name === 'risk_check',
    'Behavior name was not normalized',
  )
  assert(
    state.saveRequests.every(request =>
      request.headers['x-llm-api-key'] === 'behavior-browser-key'),
    'internal Behavior mutation request lost the current session headers',
  )

  const customerItem = desktop.locator('.object-type-item', { hasText: 'Customer' })
  await customerItem.locator('.behavior-count').filter({ hasText: '1' }).waitFor()
  const objectTypeActions = [
    'Customer ObjectType 캔버스에 추가',
    'Customer ObjectType Behavior 추가',
    'Customer ObjectType 편집',
    'Customer ObjectType 삭제',
  ]
  for (const actionName of objectTypeActions) {
    const action = customerItem.getByRole('button', { name: actionName })
    await action.waitFor({ state: 'visible' })
    assert(
      await action.evaluate(element => element.tagName === 'BUTTON'),
      `${actionName} is not an always-visible native button`,
    )
  }
  const objectTypeAddButton = customerItem.getByRole('button', {
    name: 'Customer ObjectType 캔버스에 추가',
  })
  const objectTypeDragPayload = await customerItem.evaluate(element => {
    const transfer = new DataTransfer()
    element.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }))
    return transfer.getData('application/json')
  })
  assert(
    JSON.parse(objectTypeDragPayload).name === 'Customer'
      && JSON.parse(objectTypeDragPayload).schema === 'ObjectType'
      && JSON.parse(objectTypeDragPayload).isObjectType === true,
    `ObjectType drag payload changed: ${objectTypeDragPayload}`,
  )
  await objectTypeAddButton.focus()
  await desktop.keyboard.press('Enter')
  const canvasNode = desktop.locator('.table-node').filter({ hasText: 'Customer' })
  await canvasNode.waitFor({ state: 'visible', timeout: 15_000 })

  const runBehavior = canvasNode.locator(
    'button.table-node__behavior-run-btn[aria-label="risk_check Behavior 실행"]',
  )
  await runBehavior.waitFor({ state: 'visible' })
  assert(
    await runBehavior.evaluate(element => element.tagName === 'BUTTON'),
    'Schema table-node Behavior run action is not a native button',
  )
  await desktop.screenshot({
    path: join(evidenceDir, 'schema-objecttype-native-actions-1920x1080.png'),
    fullPage: true,
  })
  await runBehavior.press('Enter')
  const behaviorDataPanel = desktop.locator('.table-data-panel')
  await behaviorDataPanel.waitFor()
  assert(
    (await behaviorDataPanel.innerText()).includes('ObjectType.Customer')
      && await behaviorDataPanel.locator('.row-execute-btn').isVisible(),
    'Schema table-node Behavior run did not preserve its ObjectType target and executable row',
  )
  await behaviorDataPanel.locator('.row-execute-btn').press('Enter')
  const resultPopup = desktop.locator('.behavior-result-popup')
  await resultPopup.waitFor()
  const attempts = resultPopup.locator('button.timeline-step')
  assert(
    await attempts.count() === 2
      && await attempts.nth(0).getAttribute('aria-pressed') === 'true'
      && await attempts.nth(1).getAttribute('aria-pressed') === 'false',
    'Behavior attempt selection did not expose its initial native pressed state',
  )
  await attempts.nth(1).focus()
  await desktop.keyboard.press('Space')
  assert(
    await attempts.nth(0).getAttribute('aria-pressed') === 'false'
      && await attempts.nth(1).getAttribute('aria-pressed') === 'true'
      && state.executionRequests.length === 1,
    'Behavior attempt keyboard selection changed execution count or pressed ownership',
  )
  assert(
    JSON.stringify(state.executionRequests[0].body)
      === JSON.stringify({ instanceData: { age: 42, name: 'Ada' } }),
    `Behavior execution row payload changed: ${JSON.stringify(state.executionRequests[0].body)}`,
  )
  await desktop.screenshot({
    path: join(evidenceDir, 'schema-behavior-attempt-selection-1920x1080.png'),
    fullPage: true,
  })
  await resultPopup.locator('button[title="닫기"]').click()
  await resultPopup.waitFor({ state: 'detached' })
  await behaviorDataPanel.locator('button[title="닫기"]').click()

  const nodeEditBehavior = canvasNode.locator(
    'button.table-node__behavior-edit-btn[aria-label="risk_check Behavior 편집"]',
  )
  await nodeEditBehavior.waitFor({ state: 'visible' })
  await nodeEditBehavior.press('Space')
  const nodeEditDialog = desktop.getByRole('dialog', { name: 'Behavior 편집' })
  await nodeEditDialog.waitFor()
  await nodeEditDialog.getByRole('button', { name: 'Behavior 편집기 닫기' }).click()
  await nodeEditDialog.waitFor({ state: 'detached' })

  await canvasNode.locator('.table-node__name').click()
  const behaviorItem = desktop.locator('.behavior-item', { hasText: 'risk_check' })
  await behaviorItem.waitFor({ state: 'visible', timeout: 15_000 })
  const detailEditBehavior = behaviorItem.getByRole('button', {
    name: 'risk_check Behavior 편집',
  })
  await detailEditBehavior.press('Enter')
  const editDialog = desktop.getByRole('dialog', { name: 'Behavior 편집' })
  await editDialog.waitFor()
  const behaviorDeleteTrigger = editDialog.getByRole('button', { name: '삭제', exact: true })
  await behaviorDeleteTrigger.click()
  const deleteDialog = desktop.getByRole('alertdialog', { name: 'Behavior 삭제' })
  await deleteDialog.waitFor()
  await desktop.keyboard.press('Escape')
  await deleteDialog.waitFor({ state: 'hidden' })
  assert(state.deleteRequests.length === 0, 'Escape issued a Behavior delete request')
  assert(
    await behaviorDeleteTrigger.evaluate(element => element === document.activeElement),
    'Nested Behavior delete Escape did not restore focus inside the outer dialog',
  )
  await desktop.keyboard.press('Escape')
  await editDialog.waitFor({ state: 'detached' })
  assert(
    await detailEditBehavior.evaluate(element => element === document.activeElement),
    'Outer Behavior dialog Escape did not restore its page trigger after nested cancellation',
  )

  await detailEditBehavior.press('Enter')
  await editDialog.waitFor()
  await editDialog.getByRole('button', { name: '삭제', exact: true }).click()
  await deleteDialog.getByRole('button', { name: '삭제', exact: true }).click()
  await deleteDialog.getByText('delete browser fixture outage').waitFor()
  await deleteDialog.getByRole('button', { name: '다시 시도' }).click()
  await editDialog.waitFor({ state: 'detached' })
  assert(state.deleteRequests.length === 2, 'delete retry count is incorrect')
  assert(
    state.deleteRequests[0].url === state.deleteRequests[1].url,
    'delete retry changed the frozen target',
  )
  assert(
    state.deleteRequests.every(request =>
      request.headers['x-llm-api-key'] === 'behavior-browser-key'),
    'internal Behavior delete request lost the current session headers',
  )

  const objectTypeDeleteTrigger = customerItem.getByRole('button', {
    name: 'Customer ObjectType 삭제',
  })
  await objectTypeDeleteTrigger.click()
  const objectTypeDeleteDialog = desktop.getByRole('alertdialog', {
    name: 'ObjectType 삭제',
  })
  const objectTypeDeleteConfirm = objectTypeDeleteDialog.getByLabel(/삭제를 확인하려면/)
  assert(
    await objectTypeDeleteConfirm.evaluate(element => element === document.activeElement),
    'ObjectType delete initial focus did not enter the confirmation input',
  )
  await desktop.keyboard.press('Escape')
  await objectTypeDeleteDialog.waitFor({ state: 'hidden' })
  assert(
    await objectTypeDeleteTrigger.evaluate(element => element === document.activeElement),
    'ObjectType delete Escape did not restore trigger focus',
  )

  await objectTypeDeleteTrigger.click()
  await objectTypeDeleteConfirm.fill('Customer')
  await objectTypeDeleteDialog.getByRole('button', { name: '삭제', exact: true }).click()
  await desktop.keyboard.press('Escape')
  assert(
    await objectTypeDeleteDialog.isVisible(),
    'ObjectType delete dialog discarded its target while mutation was pending',
  )
  await objectTypeDeleteDialog.getByRole('alert').waitFor()
  assert(
    await objectTypeDeleteConfirm.inputValue() === 'Customer',
    'ObjectType delete failure discarded the confirmation draft',
  )
  await objectTypeDeleteDialog.getByRole('button', { name: '같은 삭제 다시 시도' }).click()
  await objectTypeDeleteDialog.waitFor({ state: 'hidden' })
  await customerItem.waitFor({ state: 'detached' })
  assert(
    state.objectTypeDeleteRequests.length === 2
      && JSON.stringify(state.objectTypeDeleteRequests[0].body)
        === JSON.stringify(state.objectTypeDeleteRequests[1].body)
      && state.objectTypeDeleteRequests[1].body.confirmName === 'Customer',
    `ObjectType delete retry changed its frozen payload: ${JSON.stringify(state.objectTypeDeleteRequests)}`,
  )
  assert(
    state.objectTypeDeleteRequests.every(request =>
      request.headers['x-llm-api-key'] === 'behavior-browser-key'),
    'ObjectType delete request lost the current session headers',
  )
  assert(desktopErrors.length === 0, `desktop page errors: ${desktopErrors.join(' | ')}`)

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const mobileErrors = []
  mobile.on('pageerror', error => mobileErrors.push(error.message))
  await installFixture(mobile)
  await mobile.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  await openBehaviorDialog(mobile)
  const mobileDialog = mobile.getByRole('dialog', { name: 'Behavior 추가' })
  await mobileDialog.getByLabel('이름 *').fill('mobile behavior')
  await mobileDialog.getByLabel('설명').fill('모바일 레이아웃 확인')
  await mobileDialog.getByRole('button', { name: 'JavaScript 코드', exact: true }).click()
  await mobileDialog.getByRole('textbox', { name: 'JavaScript 코드' })
    .fill('return { ok: true };')
  await mobileDialog.getByText('입출력 필드').scrollIntoViewIfNeeded()

  const containment = await mobile.evaluate(() => {
    const dialogElement = document.querySelector('.behavior-dialog')
    const body = document.querySelector('.dialog-body')
    const footer = document.querySelector('.dialog-footer')
    if (!(dialogElement instanceof HTMLElement)
      || !(body instanceof HTMLElement)
      || !(footer instanceof HTMLElement)) return null
    return {
      dialogRight: dialogElement.getBoundingClientRect().right,
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyScrollable: body.scrollHeight > body.clientHeight,
      footerBottom: footer.getBoundingClientRect().bottom,
      viewportHeight: window.innerHeight,
    }
  })
  assert(containment, 'mobile Behavior dialog layout was not measurable')
  assert(
    containment.dialogRight <= containment.viewportWidth
      && containment.documentWidth <= containment.viewportWidth,
    `mobile Behavior dialog overflowed horizontally: ${JSON.stringify(containment)}`,
  )
  assert(containment.bodyScrollable, 'mobile Behavior dialog body does not own vertical scroll')
  assert(
    containment.footerBottom <= containment.viewportHeight,
    'mobile Behavior dialog footer escaped the viewport',
  )
  await mobile.screenshot({
    path: join(evidenceDir, 'ontology-behavior-editor-390x844.png'),
    fullPage: true,
  })
  await mobile.keyboard.press('Escape')
  await mobileDialog.waitFor({ state: 'detached' })
  assert(mobileErrors.length === 0, `mobile page errors: ${mobileErrors.join(' | ')}`)

  console.log('Ontology Behavior editor browser contracts passed')
} finally {
  await browser.close()
}
