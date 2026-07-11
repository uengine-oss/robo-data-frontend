// 043 스키마 탭 소스뷰 검증 — 참조 클릭 → 진짜 코드 / ✓ 없음 / 브라우저 HTTP 경로.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const HERE = dirname(fileURLToPath(import.meta.url))
const SHOTS = join(HERE, 'screenshots')
mkdirSync(SHOTS, { recursive: true })
const log = (...a) => console.log('[s]', ...a)
let n = 430
const shot = async (p, name) => { await p.screenshot({ path: join(SHOTS, `${n++}-${name}.png`) }).catch(() => {}); log('shot', name) }

const b = await chromium.launch({ headless: true })
const page = await b.newPage({ viewport: { width: 1600, height: 1000 } })
const R = {}
try {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2500)

  // (1) 브라우저 컨텍스트에서 실제 /source HTTP 경로 (프론트가 쓰는 그 경로)
  R.http = await page.evaluate(async () => {
    try {
      const r = await fetch('/api/gateway/robo/source?file_path=' + encodeURIComponent('/zapamcom10060.c') + '&start_line=1&end_line=0')
      if (!r.ok) return { ok: false, status: r.status }
      const j = await r.json()
      return { ok: true, found: j.found, lines: j.line_count, len: (j.content || '').length, head: (j.content || '').split('\n')[0].slice(0, 40) }
    } catch (e) { return { ok: false, err: String(e) } }
  })
  log('HTTP /source:', JSON.stringify(R.http))

  // (2) 스키마 탭으로 — id='schema' (features.ts:82). lazy 마운트 대기.
  const tabSet = await page.evaluate(() => {
    try {
      const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
      const ses = pinia._s.get('session')
      if (typeof ses.setActiveTab === 'function') ses.setActiveTab('schema'); else ses.activeTab = 'schema'
      return { activeTab: ses?.activeTab }
    } catch (e) { return { err: String(e) } }
  })
  log('tabSet:', JSON.stringify(tabSet))
  // schemaCanvas store 가 뜰 때까지 대기(최대 12s)
  let storeReady = false
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(1000)
    storeReady = await page.evaluate(() => {
      try { return !!document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas') } catch { return false }
    })
    if (storeReady) break
  }
  log('schemaCanvas store ready:', storeReady)
  await shot(page, 'schema-tab')

  // (3) 테이블 로드 + 참조 있는 테이블 캔버스에 추가
  const setup = await page.evaluate(async () => {
    try {
      const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
      const s = pinia._s.get('schemaCanvas')
      if (!s) return { err: 'no schemaCanvas store', stores: [...pinia._s.keys()] }
      if (typeof s.loadAllTables === 'function' && (!s.allTables || s.allTables.length === 0)) {
        await s.loadAllTables()
      }
      const names = (s.allTables || []).map(t => t.name)
      // 참조 많은 공통코드 테이블 우선, 없으면 첫번째
      const target = (s.allTables || []).find(t => t.name === 'zngm_comm_cd_dtl') || (s.allTables || [])[0]
      if (target && typeof s.addTableToCanvas === 'function') await s.addTableToCanvas(target)
      return { tableCount: names.length, names: names.slice(0, 10), added: target?.name, onCanvas: [...(s.tablesOnCanvas || [])] }
    } catch (e) { return { err: String(e) } }
  })
  log('setup:', JSON.stringify(setup))
  await page.waitForTimeout(2500)
  await shot(page, 'table-on-canvas')

  // (4) 테이블 노드 DOM 구조 덤프(소스 칩 셀렉터 찾기용)
  R.nodeHtml = await page.evaluate(() => {
    const node = document.querySelector('.vue-flow__node')
    if (!node) return 'NO .vue-flow__node'
    // 클릭가능 후보 클래스 수집
    const clickables = [...node.querySelectorAll('[class]')].map(e => e.className).filter(c => typeof c === 'string' && /chip|source|desc|ref|badge/i.test(c))
    return { has: true, clickableHints: [...new Set(clickables)].slice(0, 20) }
  })
  log('nodeHtml:', JSON.stringify(R.nodeHtml))

  // 물리명 모드 강제(배지는 !showLogicalNames 일 때만 렌더) + 노드 데이터 진단
  const diag = await page.evaluate(() => {
    try {
      const s = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas')
      if ('showLogicalNames' in s) s.showLogicalNames = false
      const t = (s.allTables || []).find(x => x.name === 'zngm_comm_cd_dtl')
      return { showLogicalNames: s.showLogicalNames, desc_source: t?.description_source, hasDesc: !!t?.description }
    } catch (e) { return { err: String(e) } }
  })
  log('diag:', JSON.stringify(diag))
  await page.waitForTimeout(1200)
  const badgeCount = await page.locator('.vue-flow__node .table-node__description-badge').count()
  log('description-badge count:', badgeCount)

  // (5) 소스 칩 클릭 → 참조 팝업 → 첫 참조 클릭
  const chipSelectors = ['.table-node__description-badge', '.table-node__column-desc', '.table-node__desc-source-dot']
  let popupOpened = false
  for (const sel of chipSelectors) {
    const el = page.locator(`.vue-flow__node ${sel}`).first()
    if (await el.count()) { await el.click({ timeout: 2500, force: true }).catch(() => {}); await page.waitForTimeout(900); if (await page.locator('.references-popup').count()) { popupOpened = true; log('popup via', sel); break } }
  }
  R.popupOpened = popupOpened
  await shot(page, 'references-popup')

  // ✓ 방문마커 없는지 (B 검증)
  R.visitedMarkers = await page.locator('.references-popup__item.visited').count()
  log('visited markers (B, 0이어야):', R.visitedMarkers)

  if (popupOpened) {
    await page.waitForTimeout(2000)  // loadProcedureReferences(getTableReferences) 비동기 로드 대기
    R.refItemCount = await page.locator('.references-popup__item').count()
    R.refPopupText = (await page.locator('.references-popup').first().innerText().catch(() => '')).slice(0, 160)
    log('reference items:', R.refItemCount, '| popup text:', R.refPopupText.replace(/\n/g, ' | '))
    const item = page.locator('.references-popup__item').first()
    if (await item.count()) {
      await item.click({ timeout: 3000 }).catch(() => {})
      await page.waitForTimeout(2200)
    }
  }

  // (6) 소스 패널 상태 — 진짜 코드인지 / notFound 아닌지
  R.sourcePanel = await page.evaluate(() => {
    try {
      const s = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas')
      const p = s.sourceCodePanel || {}
      return { isOpen: p.isOpen, notFound: p.notFound, fileName: p.fileName, contentLen: (p.fileContent || '').length, head: (p.fileContent || '').split('\n')[0].slice(0, 40) }
    } catch (e) { return { err: String(e) } }
  })
  log('sourcePanel:', JSON.stringify(R.sourcePanel))
  await shot(page, 'source-panel')

  log('RESULT', JSON.stringify(R))
} catch (e) { log('FATAL', e.message); await shot(page, 'err') }
finally { await b.close(); log('DONE') }
