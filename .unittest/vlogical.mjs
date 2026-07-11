import { chromium } from 'playwright'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const SHOTS = join(dirname(fileURLToPath(import.meta.url)), 'screenshots')
const b = await chromium.launch({ headless: true })
const page = await b.newPage({ viewport: { width: 1500, height: 1000 } })
const errs=[]; page.on('pageerror',e=>errs.push(e.message))
try {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 60000 }); await page.waitForTimeout(2000)
  await page.evaluate(() => { const s = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('session'); s.setActiveTab ? s.setActiveTab('schema') : (s.activeTab='schema') })
  let ok=false; for(let i=0;i<12;i++){await page.waitForTimeout(1000); ok=await page.evaluate(()=>{try{return !!document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas')}catch{return false}}); if(ok)break}
  const r = await page.evaluate(async () => {
    const s=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas')
    if(s.loadAllTables&&(!s.allTables||!s.allTables.length))await s.loadAllTables()
    if('showLogicalNames' in s)s.showLogicalNames=true
    const t=(s.allTables||[]).find(x=>x.name==='zord_acnt')||(s.allTables||[])[0]
    if(t&&s.addTableToCanvas)await s.addTableToCanvas(t)
    return { added:t?.name, logical:(t)?.logical_name }
  })
  await page.waitForTimeout(1500)
  const title = await page.locator('.vue-flow__node .table-node__name').first().innerText().catch(()=> '')
  console.log('added', r.added, '| store.logical_name', JSON.stringify(r.logical), '| CARD TITLE:', JSON.stringify(title))
  await page.screenshot({ path: join(SHOTS, '510-logical-name.png') })
  console.log('pageerrors', errs.length)
} catch(e){ console.log('FATAL', e.message) } finally { await b.close() }
