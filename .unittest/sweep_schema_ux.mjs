// 스키마 탭 전체 UI/UX read-only 스윕 — 주요 화면 열어 스샷 + 콘솔에러 수집(쓰기 없음).
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const HERE = dirname(fileURLToPath(import.meta.url))
const SHOTS = join(HERE, 'screenshots')
mkdirSync(SHOTS, { recursive: true })
const log = (...a) => console.log('[ux]', ...a)
let n = 500
const shot = async (p, name) => { await p.screenshot({ path: join(SHOTS, `ux-${n++}-${name}.png`), fullPage: false }).catch(() => {}); log('shot', name) }
const $store = (p, id) => p.evaluate((id) => { try { return document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get(id) ? true : false } catch { return false } }, id)

const b = await chromium.launch({ headless: true })
const page = await b.newPage({ viewport: { width: 1680, height: 1000 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)) })
page.on('pageerror', e => errors.push('pageerror: ' + String(e).slice(0, 160)))

const sec = async (name, fn) => { try { await fn() } catch (e) { log('SECTION FAIL', name, e.message) } }

try {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2500)
  // 스키마 탭
  await page.evaluate(() => { const s = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('session'); s.activeTab = 'schema' })
  for (let i = 0; i < 12 && !(await $store(page, 'schemaCanvas')); i++) await page.waitForTimeout(1000)
  await page.waitForTimeout(1500)
  await shot(page, 'schema-overview')

  // 테이블 로드 + 2개 캔버스에
  const setup = await page.evaluate(async () => {
    const s = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas')
    if (typeof s.loadAllTables === 'function' && (!s.allTables || !s.allTables.length)) await s.loadAllTables()
    if ('showLogicalNames' in s) s.showLogicalNames = false
    const ts = (s.allTables || [])
    for (const nm of ['zngm_comm_cd_dtl', 'zord_jncard']) { const t = ts.find(x => x.name === nm); if (t) await s.addTableToCanvas(t) }
    return { tables: ts.length, onCanvas: [...(s.tablesOnCanvas || [])] }
  })
  log('setup:', JSON.stringify(setup))
  await page.waitForTimeout(2500)
  await shot(page, 'tables-on-canvas')

  // 사이드바 푸터(상위10/전체보기) + 보기컨트롤 영역
  await sec('sidebar-footer', async () => {
    const footer = page.locator('.panel-footer, [class*=footer]').first()
    if (await footer.count()) await footer.scrollIntoViewIfNeeded().catch(() => {})
    await shot(page, 'sidebar')
  })

  // 테이블 참조 팝업 (table-level)
  await sec('table-refs', async () => {
    const badge = page.locator('.vue-flow__node .table-node__description-badge').first()
    if (await badge.count()) { await badge.click({ force: true }).catch(() => {}); await page.waitForTimeout(2000); await shot(page, 'table-references-popup') }
  })
  // 닫기버튼 스타일 인벤토리(일관성 평가용)
  const closeBtns = await page.evaluate(() => {
    const out = []
    for (const sel of ['.references-popup__close', '.source-panel-close', '.detail-panel__close', '.modal-close', '.close-btn', '.close-popup-btn', '.search-clear', '.table-item__remove']) {
      const el = document.querySelector(sel)
      if (el) { const cs = getComputedStyle(el); out.push({ sel, text: (el.textContent || '').trim().slice(0, 3), w: cs.width, h: cs.height, hasSvg: !!el.querySelector('svg'), bg: cs.backgroundColor }) }
    }
    return out
  })
  log('CLOSE BUTTONS:', JSON.stringify(closeBtns))

  // 참조 클릭 → 소스 패널(성공 경로)
  await sec('source-panel', async () => {
    const item = page.locator('.references-popup__item').first()
    if (await item.count()) { await item.click().catch(() => {}); await page.waitForTimeout(2200); await shot(page, 'source-panel-success') }
    // 소스 패널 닫기
    await page.locator('.source-panel-close').first().click().catch(() => {})
    await page.waitForTimeout(500)
  })

  // 테이블 상세 패널
  await sec('detail-panel', async () => {
    await page.evaluate(() => { const s = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas'); if (s.selectNode) s.selectNode('table-zngm_comm_cd_dtl') })
    await page.waitForTimeout(1500)
    await shot(page, 'detail-panel')
  })

  // 테이블 데이터 조회 패널 (읽기)
  await sec('table-data', async () => {
    await page.evaluate(() => { const s = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas'); if (s.queryTableData) s.queryTableData('zngm_comm_cd_dtl', 'public', 25) })
    await page.waitForTimeout(2500)
    await shot(page, 'table-data-panel')
    await page.evaluate(() => { const s = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas'); if (s.closeTableDataPanel) s.closeTableDataPanel() })
  })

  // 논리명/물리명 토글 둘 다
  await sec('name-toggle', async () => {
    await page.evaluate(() => { const s = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas'); s.showLogicalNames = true })
    await page.waitForTimeout(1200); await shot(page, 'logical-names')
    await page.evaluate(() => { const s = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas'); s.showLogicalNames = false })
  })

  log('CONSOLE ERRORS (', errors.length, '):')
  for (const e of [...new Set(errors)].slice(0, 25)) log('  ', e)
  log('DONE')
} catch (e) { log('FATAL', e.message); await shot(page, 'fatal') }
finally { await b.close() }
