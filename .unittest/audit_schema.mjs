// 스키마 탭 엄격 UX/UI/접근성 감사 — 겹침·클리핑·상호배타·접근성·콘솔·z-index.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const HERE = dirname(fileURLToPath(import.meta.url))
const SHOTS = join(HERE, 'screenshots')
mkdirSync(SHOTS, { recursive: true })
let n = 470
const shot = async (p, name) => { await p.screenshot({ path: join(SHOTS, `${n++}-${name}.png`) }).catch(() => {}); console.log('[shot]', `${n - 1}-${name}`) }
const FIND = []
const note = (sev, msg) => { FIND.push(`${sev}: ${msg}`); console.log(sev, msg) }
const overlap = (a, b) => a && b && !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y)
const inViewport = (r, w, h) => r && r.x >= -1 && r.y >= -1 && r.x + r.width <= w + 1 && r.y + r.height <= h + 1

const VW = 1600, VH = 1000
const b = await chromium.launch({ headless: true })
const page = await b.newPage({ viewport: { width: VW, height: VH } })
const consoleErrs = []
page.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text().slice(0, 120)) })
page.on('pageerror', e => note('FATAL', 'pageerror: ' + e.message))

const store = () => page.evaluate(() => document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas'))
const setStore = (fn) => page.evaluate(fn)
const box = (sel) => page.locator(sel).first().boundingBox().catch(() => null)

try {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2000)
  await setStore(() => { const s = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('session'); s.setActiveTab ? s.setActiveTab('schema') : (s.activeTab = 'schema') })
  let ok = false; for (let i = 0; i < 12; i++) { await page.waitForTimeout(1000); ok = await page.evaluate(() => { try { return !!document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas') } catch { return false } }); if (ok) break }
  if (!ok) note('FATAL', 'schemaCanvas store 미마운트')
  await shot(page, 'audit-empty')

  // 빈 상태 — 캔버스 비었을 때 floating 컨트롤/안내 적절한가
  const emptyFloating = await page.locator('.canvas-area .floating-controls').count()
  note('INFO', `빈 캔버스 floating 컨트롤 수=${emptyFloating}`)

  // 테이블 로드 + 전체 추가(대량 배치 → auto-layout 겹침 점검)
  await setStore(async () => { const s = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas'); if (s.loadAllTables) await s.loadAllTables() })
  await page.waitForTimeout(800)
  // "테이블 보기" 드롭다운 열고 스샷(메뉴 방향·클리핑)
  await page.locator('.floating-controls .table-view-control__btn').first().click().catch(() => {})
  await page.waitForTimeout(500)
  await shot(page, 'audit-tableview-menu')
  const menuBox = await box('.table-view-menu')
  if (menuBox && !inViewport(menuBox, VW, VH)) note('WARN', `테이블보기 메뉴 뷰포트 밖 클리핑 ${JSON.stringify(menuBox)}`)
  // 전체 테이블 추가
  await page.locator('.table-view-menu__item', { hasText: '전체' }).first().click().catch(() => {})
  await page.waitForTimeout(2500)
  await shot(page, 'audit-all-tables')

  // 노드 겹침 점검 (대량 추가 후)
  const nodeBoxes = await page.evaluate(() => [...document.querySelectorAll('.vue-flow__node')].map(n => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } }))
  let overlaps = 0
  for (let i = 0; i < nodeBoxes.length; i++) for (let j = i + 1; j < nodeBoxes.length; j++) if (overlap(nodeBoxes[i], nodeBoxes[j])) overlaps++
  note(overlaps > 0 ? 'WARN' : 'OK', `노드 ${nodeBoxes.length}개 중 겹치는 쌍=${overlaps} (대량추가 auto-layout)`)

  // floating 컨트롤 vs 범례 vs 첫 노드 겹침
  const fc = await box('.floating-controls'), lg = await box('.canvas-legend'), n0 = await box('.vue-flow__node')
  if (overlap(fc, lg)) note('WARN', 'floating 컨트롤 ↔ 범례 겹침')
  if (overlap(fc, n0)) note('WARN', `floating 컨트롤 ↔ 노드 겹침(노드가 좌상단에 오면 컨트롤이 가림) fc=${JSON.stringify(fc)} node=${JSON.stringify(n0)}`)

  // 참조 트리거 접근성 — title 있나, 양 모드 렌더
  const trgTitle = await page.locator('.table-node__ref-trigger').first().getAttribute('title').catch(() => null)
  note(trgTitle ? 'OK' : 'WARN', `참조 트리거 title="${trgTitle}"`)
  // 헤더 액션버튼 title
  const actTitles = await page.evaluate(() => [...document.querySelectorAll('.table-node__action-btn')].map(b => b.getAttribute('title')))
  note('INFO', `노드 액션버튼 titles=${JSON.stringify(actTitles)}`)

  // 참조 흐름: zngm 노드 참조 트리거 클릭 → 팝업 뷰포트 안 + 첫 항목 클릭 → 소스패널
  // (특정 테이블 캔버스 가운데로)
  await setStore(async () => { const s = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas'); s.setCanvasNodes && s.setCanvasNodes([]); const t = (s.allTables || []).find(x => x.name === 'zngm_comm_cd_dtl'); if (t && s.addTableToCanvas) await s.addTableToCanvas(t) })
  await page.waitForTimeout(1500)
  await page.locator('.vue-flow__node .table-node__ref-trigger').first().click({ force: true }).catch(() => {})
  await page.waitForTimeout(2200)
  const popBox = await box('.references-popup')
  if (popBox && !inViewport(popBox, VW, VH)) note('WARN', `참조 팝업 뷰포트 밖 클리핑 ${JSON.stringify(popBox)}`)
  else note('OK', `참조 팝업 뷰포트 내 ${popBox ? JSON.stringify({ y: Math.round(popBox.y), h: Math.round(popBox.height) }) : 'none'}`)
  await shot(page, 'audit-ref-popup')

  await page.locator('.references-popup__item').first().click().catch(() => {})
  await page.waitForTimeout(2000)
  // 소스패널: 사이드바/캔버스 침범, 닫기버튼, 하이라이트 가시성
  const sp = await box('.source-code-panel'), side = await box('.left-panel')
  if (overlap(sp, side)) note('WARN', '소스패널 ↔ 좌측 패널 겹침')
  const spClose = await page.locator('.source-code-panel .icon-x, .source-code-panel button').count()
  note(spClose ? 'OK' : 'WARN', `소스패널 닫기버튼 수=${spClose}`)
  const hlVisible = await page.evaluate(() => { const h = document.querySelector('.source-line.highlighted'); if (!h) return false; const r = h.getBoundingClientRect(); return r.y >= 0 && r.y <= window.innerHeight })
  note(hlVisible ? 'OK' : 'WARN', `강조줄 화면 내 가시=${hlVisible}`)
  await shot(page, 'audit-source-panel')

  // 패널 상호배타: 소스패널 열린 상태에서 테이블 데이터 조회 → 소스패널 닫혀야
  await page.locator('.table-node__action-btn--query').first().click({ force: true }).catch(() => {})
  await page.waitForTimeout(1500)
  const both = await page.evaluate(() => ({ src: !!document.querySelector('.source-code-panel'), data: !!document.querySelector('.table-data-panel') }))
  if (both.src && both.data) note('WARN', '소스패널·데이터패널 동시 열림(상호배타 위반)')
  else note('OK', `상호배타 유지 ${JSON.stringify(both)}`)
  await shot(page, 'audit-data-panel')

  // 논리명/물리명 토글 동작 + 토글 후 노드 즉시 반영
  const before = await page.locator('.table-node__name').first().innerText().catch(() => '')
  await page.locator('.floating-controls .name-mode-switch').first().click().catch(() => {})
  await page.waitForTimeout(800)
  const after = await page.locator('.table-node__name').first().innerText().catch(() => '')
  note(before !== after ? 'OK' : 'WARN', `논리/물리 토글 노드명 변화 "${before}"→"${after}"`)
  await shot(page, 'audit-name-toggle')

  // 범례 접기/펴기
  await page.locator('.legend-title--toggle').first().click().catch(() => {})
  await page.waitForTimeout(400)
  await shot(page, 'audit-legend-collapsed')

  // 닫기버튼 일관성 — 모든 패널/팝업 닫기 클래스 수집
  const closeKinds = await page.evaluate(() => {
    const set = {}
    document.querySelectorAll('button, .close-btn, [class*="close"]').forEach(b => {
      const t = (b.textContent || '').trim()
      if (t === '×' || t === '✕' || t === 'X' || b.querySelector('svg')) {
        const k = b.className.toString().split(' ')[0] || 'svg-btn'; set[k] = (set[k] || 0) + 1
      }
    })
    return set
  })
  note('INFO', `닫기버튼 클래스 분포=${JSON.stringify(closeKinds)}`)

  note('INFO', `콘솔 에러 ${consoleErrs.length}건: ${[...new Set(consoleErrs)].slice(0, 5).join(' || ')}`)
  console.log('\n===== FINDINGS =====')
  FIND.forEach(f => console.log(f))
} catch (e) { note('FATAL', e.message); await shot(page, 'audit-fatal') }
finally { await b.close(); console.log('DONE') }
