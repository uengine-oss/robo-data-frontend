import { chromium } from 'playwright'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const SHOTS = join(dirname(fileURLToPath(import.meta.url)), 'screenshots')
const b = await chromium.launch({ headless: true })
const page = await b.newPage({ viewport: { width: 1500, height: 1000 } })
const errs = []; page.on('pageerror', e => errs.push(e.message))
let n = 490
const shot = async (name) => { await page.screenshot({ path: join(SHOTS, `${n++}-${name}.png`) }); console.log('shot', name) }
try {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 60000 }); await page.waitForTimeout(2000)
  await page.evaluate(() => { const s = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('session'); s.setActiveTab ? s.setActiveTab('schema') : (s.activeTab = 'schema') })
  let ok = false; for (let i = 0; i < 12; i++) { await page.waitForTimeout(1000); ok = await page.evaluate(() => { try { return !!document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas') } catch { return false } }); if (ok) break }
  await page.evaluate(async () => { const s = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas'); if (s.loadAllTables && (!s.allTables || !s.allTables.length)) await s.loadAllTables(); const t = (s.allTables || []).find(x => x.name === 'zngm_comm_cd_dtl'); if (t && s.addTableToCanvas) await s.addTableToCanvas(t) })
  await page.waitForTimeout(1500)
  // 논리명(기본)
  await shot('card-logical')
  // 물리명으로 토글
  await page.locator('.floating-controls .name-toggle').click(); await page.waitForTimeout(700)
  await shot('card-physical')
  // 카드 1장 크롭 영역
  const card = page.locator('.vue-flow__node').first()
  await card.screenshot({ path: join(SHOTS, '492-card-only-physical.png') }).catch(()=>{})
  console.log('pageerrors', errs.length, errs.slice(0,3))
} catch (e) { console.log('FATAL', e.message) } finally { await b.close() }
