import { chromium } from 'playwright'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const SHOTS = join(dirname(fileURLToPath(import.meta.url)), 'screenshots')
const b = await chromium.launch({ headless: true })
const page = await b.newPage({ viewport: { width: 1500, height: 1000 } })
try {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 60000 }); await page.waitForTimeout(2000)
  await page.evaluate(() => { const s = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('session'); s.setActiveTab ? s.setActiveTab('schema') : (s.activeTab='schema') })
  let ok=false; for(let i=0;i<12;i++){await page.waitForTimeout(1000); ok=await page.evaluate(()=>{try{return !!document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas')}catch{return false}}); if(ok)break}
  await page.evaluate(async () => { const s=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas'); if(s.loadAllTables&&(!s.allTables||!s.allTables.length))await s.loadAllTables(); const t=(s.allTables||[]).find(x=>x.name==='zngm_comm_cd_dtl'); if(t&&s.addTableToCanvas)await s.addTableToCanvas(t) })
  await page.waitForTimeout(1200)
  // datasource 펼침 보장(접혀있으면 클릭)
  const dsExpanded = await page.locator('.datasource-header--expanded').count()
  if (!dsExpanded) { await page.locator('.datasource-header').first().click().catch(()=>{}); await page.waitForTimeout(300) }
  // schema 펼치기
  await page.locator('.schema-header').first().click().catch(()=>{}); await page.waitForTimeout(600)
  console.log('leaves', await page.locator('.schema-tables .table-item').count(), '| on-canvas', await page.locator('.table-item.is-on-canvas').count(), '| add-hint', await page.locator('.table-item__add-hint').count())
  await page.screenshot({ path: join(SHOTS, '497-sidebar-expanded.png') })
} catch(e){ console.log('FATAL', e.message) } finally { await b.close() }
