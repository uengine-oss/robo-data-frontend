// 코드 그래프 뷰 집중 검증 — catalog 재기동 후 308노드 렌더 + 보기(view)모드 순회.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const HERE = dirname(fileURLToPath(import.meta.url))
const SHOTS = join(HERE, 'screenshots')
mkdirSync(SHOTS, { recursive: true })
const log = (...a) => console.log('[g]', ...a)
let n = 50
const shot = async (p, name) => { await p.screenshot({ path: join(SHOTS, `${n++}-${name.replace(/[^\w가-힣-]/g, '_')}.png`) }).catch(() => {}); log('shot', name) }

const b = await chromium.launch({ headless: true })
const page = await b.newPage({ viewport: { width: 1600, height: 1000 } })
const net = []
page.on('response', r => { if (/\/robo\/graph/.test(r.url())) net.push(`${r.status()} graph`) })
try {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2000)
  await page.locator('button.nav-child[title="코드 그래프"]').first().click({ timeout: 5000 })
  await page.waitForTimeout(5000)  // 그래프 fetch+렌더 대기
  log('graph net:', JSON.stringify(net))
  // Navigator 모듈/테이블 수, 그래프 캔버스
  const navCounts = await page.$$eval('.nav-section-count, [class*=count], [class*=badge]',
    e => e.map(x => (x.innerText || '').trim()).filter(Boolean).slice(0, 8)).catch(() => [])
  log('nav counts:', JSON.stringify(navCounts))
  log('canvas/svg:', await page.locator('canvas, svg').count())
  await shot(page, 'graph-loaded')

  // 보기(view) 드롭다운
  const vb = page.locator('text=/보기/').first()
  if (await vb.count()) {
    await vb.click({ timeout: 4000 }).catch(() => {})
    await page.waitForTimeout(700)
    await shot(page, 'view-menu')
    const opts = await page.$$eval('[role=option],[role=menuitem],[class*=view-menu] *,[class*=dropdown] *,li',
      e => [...new Set(e.map(x => (x.innerText || '').trim()).filter(t => t && t.length < 12))].slice(0, 12)).catch(() => [])
    log('보기 옵션:', JSON.stringify(opts))
    for (const o of opts) {
      const el = page.locator(`[role=option]:has-text("${o}"), [role=menuitem]:has-text("${o}"), li:has-text("${o}")`).first()
      if (await el.count()) {
        await el.click({ timeout: 2500, force: true }).catch(() => {})
        await page.waitForTimeout(1600)
        await shot(page, `view-${o}`)
        const v2 = page.locator('text=/보기/').first()
        if (await v2.count()) await v2.click({ timeout: 1500, force: true }).catch(() => {})
        await page.waitForTimeout(300)
      }
    }
  } else log('보기 없음')

  // Navigator 첫 모듈 클릭 (그래프에 노드 표시)
  const item = page.locator('[class*=navigator] [class*=item], aside [class*=node], aside li').first()
  if (await item.count()) { await item.click({ force: true, timeout: 3000 }).catch(() => {}); await page.waitForTimeout(2000); await shot(page, 'node-on-canvas') }
} catch (e) { log('FATAL', e.message); await shot(page, 'err') }
finally { await b.close(); log('DONE') }
