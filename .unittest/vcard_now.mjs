// 현재 테이블 카드 클로즈업 캡처 (읽기 전용) — 사용자 지적(별표 정렬·FK·타입 공백) 확인용.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const HERE = dirname(fileURLToPath(import.meta.url))
const SHOTS = join(HERE, 'screenshots')
mkdirSync(SHOTS, { recursive: true })
const log = (...a) => console.log('[card]', ...a)

const b = await chromium.launch({ headless: true })
const page = await b.newPage({ viewport: { width: 1680, height: 1000 }, deviceScaleFactor: 2 })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)) })
page.on('pageerror', e => errors.push('pageerror: ' + String(e).slice(0, 160)))

try {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2500)
  await page.evaluate(() => { const s = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('session'); s.activeTab = 'schema' })
  await page.waitForTimeout(2500)

  const setup = await page.evaluate(async () => {
    const s = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas')
    if (typeof s.loadAllTables === 'function' && (!s.allTables || !s.allTables.length)) await s.loadAllTables()
    if ('showLogicalNames' in s) s.showLogicalNames = true   // 논리명(긴 한글) 모드로 ellipsis 확인
    const ts = (s.allTables || [])
    // 긴 논리명 테이블 우선
    const picks = ['zngm_comm_cd_dtl', 'zpay_ap_auth_req_tmp', 'zord_acnt']
    // FK(deal_id) + NOT NULL 동시 케이스 시연용: 첫 테이블의 한 FK 컬럼을 강제로 not-null 로
    const forceTbl = ts.find(x => x.name === 'zpay_ap_auth_req_tmp')
    for (const nm of picks) { const t = ts.find(x => x.name === nm); if (t) await s.addTableToCanvas(t) }
    // 첫 테이블 selected 로
    if (s.selectNode) s.selectNode('table-' + picks[0])
    return { tables: ts.length, onCanvas: [...(s.tablesOnCanvas || [])] }
  })
  log('setup:', JSON.stringify(setup))
  await page.waitForTimeout(2500)

  // fit view
  await page.evaluate(() => { const s = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas'); if (s.fitView) s.fitView() })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: join(SHOTS, 'cardnow-overview.png'), fullPage: false })

  // 첫 노드 클로즈업
  const node = page.locator('.vue-flow__node').first()
  if (await node.count()) {
    const box = await node.boundingBox()
    if (box) {
      const pad = 20
      await page.screenshot({
        path: join(SHOTS, 'cardnow-closeup.png'),
        clip: { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: Math.min(box.width + pad * 2, 1680), height: Math.min(box.height + pad * 2, 1000) }
      })
      log('closeup box:', JSON.stringify(box))
    }
  }
  // 컬럼 행 구조 덤프 (정렬 확인)
  const rows = await page.evaluate(() => {
    const out = []
    const cols = document.querySelectorAll('.table-node__column-info')
    for (const ci of [...cols].slice(0, 12)) {
      const kids = [...ci.children].map(c => ({ cls: c.className.replace(/table-node__/g, ''), x: Math.round(c.getBoundingClientRect().left), w: Math.round(c.getBoundingClientRect().width), txt: (c.textContent || '').trim().slice(0, 10) }))
      out.push(kids)
    }
    return out
  })
  log('ROWS:', JSON.stringify(rows, null, 1))
  log('ERRORS', errors.length, [...new Set(errors)].slice(0, 8))
  log('DONE')
} catch (e) { log('FATAL', e.message) }
finally { await b.close() }
