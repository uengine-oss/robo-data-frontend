import { chromium } from 'playwright'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const SHOTS = join(dirname(fileURLToPath(import.meta.url)), 'screenshots')
const b = await chromium.launch({ headless: true })
const page = await b.newPage({ viewport: { width: 1500, height: 1000 } })
const cropCard = async (name) => { const c = page.locator('.vue-flow__node').first(); await c.screenshot({ path: join(SHOTS, name) }).catch(()=>{}); console.log('shot', name) }
const setCss = (id, css) => page.evaluate(({id,css}) => { let el=document.getElementById(id); if(!el){el=document.createElement('style');el.id=id;document.head.appendChild(el)} el.textContent=css }, {id,css})
try {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 60000 }); await page.waitForTimeout(2000)
  await page.evaluate(() => { const s = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('session'); s.setActiveTab ? s.setActiveTab('schema') : (s.activeTab='schema') })
  let ok=false; for(let i=0;i<12;i++){await page.waitForTimeout(1000); ok=await page.evaluate(()=>{try{return !!document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas')}catch{return false}}); if(ok)break}
  await page.evaluate(async () => { const s=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas'); if(s.loadAllTables&&(!s.allTables||!s.allTables.length))await s.loadAllTables(); if('showLogicalNames' in s)s.showLogicalNames=false; const t=(s.allTables||[]).find(x=>x.name==='zngm_comm_cd_dtl'); if(t&&s.addTableToCanvas)await s.addTableToCanvas(t) })
  await page.waitForTimeout(1500)
  // A: 현재
  await setCss('vA',''); await cropCard('520-styleA-current.png')
  // B: PK/FK 왼쪽 색띠, 우측 타입만
  await setCss('vB', `.table-node__col-tag{display:none!important}
    .table-node__column.is-fk{border-left:3px solid #4dabf7!important; background:rgba(77,171,247,0.06)!important}
    .table-node__column.is-pk{border-left:3px solid #ffd43b!important; background:rgba(255,212,59,0.06)!important}`)
  await page.waitForTimeout(300); await cropCard('521-styleB-leftbar.png')
  await setCss('vB','')
  // C: 칸형 — 타입 앞 세로구분 + 행 가로구분선
  await setCss('vC', `.table-node__column{border-bottom:1px solid rgba(255,255,255,0.05)!important}
    .table-node__columns{padding:0!important}
    .table-node__column-type{border-left:1px solid var(--color-border)!important; padding-left:10px!important; margin-left:6px!important; width:42px!important}`)
  await page.waitForTimeout(300); await cropCard('522-styleC-grid.png')
  console.log('done')
} catch(e){ console.log('FATAL', e.message) } finally { await b.close() }
