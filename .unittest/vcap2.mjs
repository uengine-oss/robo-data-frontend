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
  await page.waitForTimeout(1500)
  // 상단 floating 크롭
  await page.locator('.floating-controls').screenshot({ path: join(SHOTS, '502-floating.png') }).catch(()=>{})
  // 상세패널 — 노드 클릭
  await page.locator('.vue-flow__node .table-node__name').first().click().catch(()=>{}); await page.waitForTimeout(1200)
  await page.locator('.detail-panel').screenshot({ path: join(SHOTS, '503-detail.png') }).catch(()=>{})
  console.log('done; sourceBadge', await page.locator('.detail-field__source-badge').count())
} catch(e){ console.log('FATAL', e.message) } finally { await b.close() }
