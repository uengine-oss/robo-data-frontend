// 카드 컬럼 더보기(+N more) 회귀 확인 — 14열 테이블 (읽기 전용)
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const HERE = dirname(fileURLToPath(import.meta.url))
const SHOTS = join(HERE, 'screenshots')
const log = (...a) => console.log('[more]', ...a)
const b = await chromium.launch({ headless: true })
const page = await b.newPage({ viewport: { width: 1680, height: 1100 }, deviceScaleFactor: 2 })
const errors = []
page.on('pageerror', e => errors.push('pageerror: ' + String(e).slice(0, 160)))
try {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2500)
  await page.evaluate(() => { const s = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('session'); s.activeTab = 'schema' })
  await page.waitForTimeout(2500)
  await page.evaluate(async () => {
    const s = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas')
    if (typeof s.loadAllTables === 'function' && (!s.allTables || !s.allTables.length)) await s.loadAllTables()
    const t = (s.allTables || []).find(x => x.name === 'zngm_comm_cd_dtl')  // 14열
    if (t) await s.addTableToCanvas(t)
    if (s.fitView) s.fitView()
  })
  await page.waitForTimeout(2000)
  // 더보기 토글 존재/동작
  const toggle = page.locator('.table-node__toggle').first()
  const hasToggle = await toggle.count()
  log('toggle present:', hasToggle)
  const node = page.locator('.vue-flow__node').first()
  const box = await node.boundingBox()
  if (box) await page.screenshot({ path: join(SHOTS, 'more-collapsed.png'), clip: { x: Math.max(0, box.x - 15), y: Math.max(0, box.y - 15), width: Math.min(box.width + 30, 1680), height: Math.min(box.height + 30, 1100) } })
  // 펼치기 클릭
  if (hasToggle) {
    const before = await page.locator('.table-node__column').count()
    await toggle.click().catch(() => {})
    await page.waitForTimeout(800)
    const after = await page.locator('.table-node__column').count()
    log('columns before/after expand:', before, after)
    const box2 = await node.boundingBox()
    if (box2) await page.screenshot({ path: join(SHOTS, 'more-expanded.png'), clip: { x: Math.max(0, box2.x - 15), y: Math.max(0, box2.y - 15), width: Math.min(box2.width + 30, 1680), height: Math.min(box2.height + 30, 1100) } })
  }
  log('ERRORS', errors.length, errors.slice(0, 5))
  log('DONE')
} catch (e) { log('FATAL', e.message) }
finally { await b.close() }
