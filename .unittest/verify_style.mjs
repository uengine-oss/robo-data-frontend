// 044 스타일 일관화 검증 — floating 컨트롤·참조 버튼·상세패널(분석된 의미).
import { chromium } from 'playwright'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const SHOTS = join(dirname(fileURLToPath(import.meta.url)), 'screenshots')
const b = await chromium.launch({ headless: true })
const page = await b.newPage({ viewport: { width: 1500, height: 1000 } })
const errs = []; page.on('pageerror', e => errs.push(e.message))
let n = 480
const shot = async (name) => { await page.screenshot({ path: join(SHOTS, `${n++}-${name}.png`) }); console.log('shot', name) }
const S = `document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas')`
try {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 60000 }); await page.waitForTimeout(2000)
  await page.evaluate(() => { const s = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('session'); s.setActiveTab ? s.setActiveTab('schema') : (s.activeTab = 'schema') })
  let ok = false; for (let i = 0; i < 12; i++) { await page.waitForTimeout(1000); ok = await page.evaluate(() => { try { return !!document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas') } catch { return false } }); if (ok) break }
  await page.evaluate(async () => { const s = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas'); if (s.loadAllTables && (!s.allTables || !s.allTables.length)) await s.loadAllTables(); const t = (s.allTables || []).find(x => x.name === 'zngm_comm_cd_dtl'); if (t && s.addTableToCanvas) await s.addTableToCanvas(t) })
  await page.waitForTimeout(1500)
  await shot('style-floating-node')
  console.log('tvBtn', await page.locator('.floating-controls .tv-btn').count(), '| nameToggle', await page.locator('.floating-controls .name-toggle').count(), '| floatingText', JSON.stringify((await page.locator('.floating-controls').innerText()).replace(/\n/g, ' ')))
  console.log('refTrigger svg', await page.locator('.table-node__ref-trigger svg').count(), '| label', JSON.stringify((await page.locator('.table-node__ref-trigger').first().innerText().catch(() => ''))))
  await page.locator('.floating-controls .tv-btn').click(); await page.waitForTimeout(400); await shot('style-addmenu')
  console.log('menuItems', JSON.stringify(await page.locator('.table-view-menu__item').allInnerTexts()))
  await page.mouse.click(750, 500); await page.waitForTimeout(300)
  // 상세패널 — 노드 헤더 클릭(선택)
  await page.locator('.vue-flow__node .table-node__name').first().click().catch(() => {}); await page.waitForTimeout(1200)
  const labels = await page.evaluate(() => [...document.querySelectorAll('.detail-panel .detail-field label')].map(l => l.textContent.trim().split('\n')[0].trim()))
  console.log('detailPanel', await page.locator('.detail-panel').count(), '| analyzedBlock', await page.locator('.detail-field__analyzed').count(), '| labels', JSON.stringify(labels))
  await shot('style-detail-panel')
  console.log('pageerrors', errs.length, errs.slice(0, 3))
} catch (e) { console.log('FATAL', e.message); await shot('style-fatal') }
finally { await b.close() }
