import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'; import { dirname, join } from 'node:path'
const SHOTS = join(dirname(fileURLToPath(import.meta.url)), 'screenshots')
const b = await chromium.launch({ headless: true })
const page = await b.newPage({ viewport: { width: 1680, height: 1000 }, deviceScaleFactor: 2 })
const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0,120)))
try {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2500)
  await page.evaluate(() => { document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('session').activeTab = 'schema' })
  await page.waitForTimeout(2000)
  await page.evaluate(async () => {
    const s = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas')
    if (typeof s.loadAllTables === 'function' && (!s.allTables || !s.allTables.length)) await s.loadAllTables()
    s.showLogicalNames = false
    for (const nm of ['zord_acnt','zpay_ap_rltm_auth_hst']) { const t = (s.allTables||[]).find(x=>x.name===nm); if (t) await s.addTableToCanvas(t) }
    if (s.selectNode) s.selectNode('table-zord_acnt')
  })
  await page.waitForTimeout(1500)
  // 사이드바 영역 캡처
  const aside = page.locator('aside, .table-panel, [class*=panel]').first()
  await page.screenshot({ path: join(SHOTS, 'sidebar-dots.png'), clip: { x: 0, y: 80, width: 360, height: 700 } })
  // 점 위치 측정
  const m = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.table-item.is-on-canvas')].slice(0,4).map(it => {
      const dot = it.querySelector('.table-item__on-dot')
      const r = it.getBoundingClientRect(); const dr = dot ? dot.getBoundingClientRect() : null
      return { name: it.querySelector('.table-item__name')?.textContent, itemRight: Math.round(r.right), dotRight: dr ? Math.round(dr.right) : null, dotFromRight: dr ? Math.round(r.right - dr.right) : null }
    })
    return items
  })
  console.log('on-canvas dots:', JSON.stringify(m, null, 1))
  console.log('pageerror:', errs.length, errs.slice(0,3))
} catch (e) { console.log('FATAL', e.message) }
finally { await b.close() }
