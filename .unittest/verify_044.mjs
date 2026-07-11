// 044 검증 — 참조 트리거 발견성(US2)·없음/실패 구분(US3)·캔버스 컨트롤 floating(US4)·소스 슬라이스(US1).
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const HERE = dirname(fileURLToPath(import.meta.url))
const SHOTS = join(HERE, 'screenshots')
mkdirSync(SHOTS, { recursive: true })
const log = (...a) => console.log('[044]', ...a)
let n = 440
const shot = async (p, name) => { await p.screenshot({ path: join(SHOTS, `${n++}-${name}.png`) }).catch(() => {}); log('shot', name) }

const b = await chromium.launch({ headless: true })
const page = await b.newPage({ viewport: { width: 1600, height: 1000 } })
const errs = []
page.on('pageerror', e => errs.push('pageerror: ' + e.message))
const R = {}
try {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2000)

  // schema 탭
  await page.evaluate(() => {
    const ses = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('session')
    if (typeof ses.setActiveTab === 'function') ses.setActiveTab('schema'); else ses.activeTab = 'schema'
  })
  let ready = false
  for (let i = 0; i < 12; i++) { await page.waitForTimeout(1000); ready = await page.evaluate(() => { try { return !!document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas') } catch { return false } }); if (ready) break }
  log('schemaCanvas ready:', ready)

  // 테이블 로드 + 캔버스 추가
  R.setup = await page.evaluate(async () => {
    const s = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas')
    if (typeof s.loadAllTables === 'function' && (!s.allTables || s.allTables.length === 0)) await s.loadAllTables()
    const t = (s.allTables || [])[0]
    if (t && typeof s.addTableToCanvas === 'function') await s.addTableToCanvas(t)
    return { tables: (s.allTables || []).length, added: t?.name }
  })
  log('setup:', JSON.stringify(R.setup))
  await page.waitForTimeout(2000)

  // US4 — floating controls(좌상단) 존재 + 테이블보기 + name-mode, 그리고 옛 panel-footer 부재
  R.us4 = await page.evaluate(() => ({
    floating: document.querySelectorAll('.canvas-area .floating-controls.left-top').length,
    tableViewInFloating: document.querySelectorAll('.floating-controls .table-view-control').length,
    nameModeInFloating: document.querySelectorAll('.floating-controls .name-mode-switch').length,
    deadPanelFooter: document.querySelectorAll('.left-panel .panel-footer, aside .table-view-control').length,
  }))
  log('US4 floating:', JSON.stringify(R.us4))
  await shot(page, 'us4-floating-controls')

  // US2 — 참조 트리거 항상 보임(물리명/논리명 양쪽)
  await page.evaluate(() => { const s = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas'); if ('showLogicalNames' in s) s.showLogicalNames = false })
  await page.waitForTimeout(600)
  R.triggerPhysical = await page.locator('.vue-flow__node .table-node__ref-trigger').count()
  await shot(page, 'us2-trigger-physical')
  await page.evaluate(() => { const s = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas'); if ('showLogicalNames' in s) s.showLogicalNames = true })
  await page.waitForTimeout(600)
  R.triggerLogical = await page.locator('.vue-flow__node .table-node__ref-trigger').count()
  await shot(page, 'us2-trigger-logical')
  log('US2 trigger physical/logical:', R.triggerPhysical, R.triggerLogical)

  // US3 — 트리거 클릭 → 팝업, 0참조면 "참조 없음"(에러 아님)
  const trg = page.locator('.vue-flow__node .table-node__ref-trigger').first()
  if (await trg.count()) { await trg.click({ force: true }).catch(() => {}); await page.waitForTimeout(2000) }
  R.popup = await page.locator('.references-popup').count()
  R.popupText = (await page.locator('.references-popup').first().innerText().catch(() => '')).replace(/\n/g, ' | ').slice(0, 140)
  R.retryBtn = await page.locator('.references-popup__retry').count()
  log('US3 popup:', R.popup, '| text:', R.popupText, '| retryBtn:', R.retryBtn)
  await shot(page, 'us3-references-popup')

  R.errs = errs
  log('RESULT', JSON.stringify(R))
} catch (e) { log('FATAL', e.message); await shot(page, 'fatal') }
finally { await b.close(); log('DONE') }
