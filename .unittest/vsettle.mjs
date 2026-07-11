import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'; import { dirname, join } from 'node:path'
const SHOTS = join(dirname(fileURLToPath(import.meta.url)), 'screenshots')
const b = await chromium.launch({ headless: true })
const page = await b.newPage({ viewport: { width: 1680, height: 1100 }, deviceScaleFactor: 2 })
try {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2500)
  await page.evaluate(() => { document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('session').activeTab = 'schema' })
  await page.waitForTimeout(2500)
  await page.evaluate(async () => {
    const s = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas')
    if (typeof s.loadAllTables === 'function' && (!s.allTables || !s.allTables.length)) await s.loadAllTables()
    s.showLogicalNames = true
    const t = (s.allTables || []).find(x => x.name === 'zngm_comm_cd_dtl')
    if (t) await s.addTableToCanvas(t)
  })
  await page.waitForTimeout(4000)  // 충분히 수렴 대기
  // zoom 1 로 고정해 실제 CSS 크기로 렌더
  await page.evaluate(() => { const s = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas'); if (s.setViewport) s.setViewport({ x: 60, y: 40, zoom: 1 }) })
  await page.waitForTimeout(1200)
  const m = await page.evaluate(() => {
    const card = document.querySelector('.table-node')
    const names = [...document.querySelectorAll('.table-node__column-name')].map(el => ({ t: el.textContent.trim().slice(0,22), trunc: el.scrollWidth > el.clientWidth + 1, cw: Math.round(el.clientWidth) }))
    return { cardW: Math.round(card.getBoundingClientRect().width), names: names.slice(0,6) }
  })
  console.log(JSON.stringify(m, null, 1))
  const card = page.locator('.table-node').first(); const box = await card.boundingBox()
  if (box) await page.screenshot({ path: join(SHOTS, 'settle-card.png'), clip: { x: Math.max(0,box.x-10), y: Math.max(0,box.y-10), width: Math.min(box.width+20,1680), height: Math.min(box.height+20,1100) } })
} catch (e) { console.log('FATAL', e.message) }
finally { await b.close() }
