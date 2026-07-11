// robo-data-frontend UI 자가검증 v4 — 아코디언 순서 보정(피지컬 자식 먼저 → 도메인 펼침).
// 코드 그래프가 기존 308노드 렌더하는지 + 보기(view)모드 + 각 뷰 콘솔에러 + 스크린샷.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const SHOTS = join(HERE, 'screenshots')
mkdirSync(SHOTS, { recursive: true })
const log = (...a) => console.log('[ui]', ...a)
let n = 0
const shot = async (page, name) => {
  await page.screenshot({ path: join(SHOTS, `${String(++n).padStart(2, '0')}-${name.replace(/[^\w가-힣-]/g, '_')}.png`) }).catch(() => {})
  log('shot', name)
}

const b = await chromium.launch({ headless: true })
const page = await b.newPage({ viewport: { width: 1600, height: 1000 } })
let cerr = []
const net = []
page.on('console', m => { if (m.type() === 'error') cerr.push(m.text().slice(0, 140)) })
page.on('response', r => { if (/\/robo\/graph|\/robo\/check-data|\/antlr|\/robo\//.test(r.url())) net.push(`${r.status()} ${r.url().split('/api/gateway')[1] || r.url()}`.slice(0, 90)) })

const expandGroup = async (g) => {
  const h = page.locator(`button.nav-group-header[title="${g}"]`).first()
  if (await h.count()) { await h.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(600) }
}
const clickChild = async (name) => {
  const btn = page.locator(`button.nav-child[title="${name}"]`).first()
  if (!(await btn.count()) || !(await btn.isVisible().catch(() => false))) return false
  await btn.click({ timeout: 5000 }).catch(e => log('click fail', name, e.message))
  return true
}

try {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2500)

  // 피지컬 레이어는 로드시 펼쳐짐 → 자식 먼저 (업로드=코드 제외)
  for (const v of ['코드 그래프', '데이터 스키마', '데이터 소스', '자연어 질의', '보안관리자']) {
    cerr = []; net.length = 0
    if (!(await clickChild(v))) { log('SKIP', v); continue }
    await page.waitForTimeout(3000)
    await shot(page, `phys-${v}`)
    log(`[${v}] errors=${cerr.length} net=${JSON.stringify(net.slice(0, 4))}`)

    if (v === '코드 그래프') {
      // 그래프 노드 렌더 여부 (svg/canvas/노드 개수 힌트)
      const cv = await page.locator('canvas, svg').count()
      const txt = (await page.locator('body').innerText().catch(() => '')).slice(0, 0)
      log('graph canvas/svg count:', cv)
      // 보기 드롭다운
      const vb = page.locator('text=/보기/').first()
      if (await vb.count()) {
        await vb.click({ timeout: 4000 }).catch(() => {})
        await page.waitForTimeout(800)
        await shot(page, 'graph-보기메뉴')
        const opts = await page.$$eval('[role=option],[role=menuitem],li',
          els => [...new Set(els.map(e => (e.innerText || '').trim()).filter(t => t && t.length < 14))].slice(0, 12)).catch(() => [])
        log('보기 옵션:', JSON.stringify(opts))
        for (const o of opts) {
          const el = page.locator(`[role=option]:has-text("${o}"), [role=menuitem]:has-text("${o}"), li:has-text("${o}")`).first()
          if (await el.count()) {
            await el.click({ timeout: 2500 }).catch(() => {})
            await page.waitForTimeout(1500)
            await shot(page, `graph-보기-${o}`)
            const vb2 = page.locator('text=/보기/').first()
            if (await vb2.count()) await vb2.click({ timeout: 1500 }).catch(() => {})
            await page.waitForTimeout(300)
          }
        }
      } else log('보기 드롭다운 없음')
    }
  }

  // 도메인 레이어 펼쳐 주요 뷰
  await expandGroup('도메인 레이어')
  for (const v of ['도메인 스키마', '오브젝트 탐색기', '온톨로지 뷰어']) {
    cerr = []; net.length = 0
    if (!(await clickChild(v))) { log('SKIP', v); continue }
    await page.waitForTimeout(3000)
    await shot(page, `dom-${v}`)
    log(`[${v}] errors=${cerr.length} net=${JSON.stringify(net.slice(0, 3))}`)
  }
  await shot(page, 'final')
} catch (e) { log('FATAL', e.message); await shot(page, 'error') }
finally { await b.close(); log('DONE shots=', n) }
