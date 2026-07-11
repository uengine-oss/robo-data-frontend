import { chromium } from 'playwright'
const b = await chromium.launch({ headless: true })
const page = await b.newPage({ viewport: { width: 1500, height: 1000 } })
try {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 60000 }); await page.waitForTimeout(2000)
  await page.evaluate(() => { const s = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('session'); s.setActiveTab ? s.setActiveTab('schema') : (s.activeTab='schema') })
  let ok=false; for(let i=0;i<12;i++){await page.waitForTimeout(1000); ok=await page.evaluate(()=>{try{return !!document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas')}catch{return false}}); if(ok)break}
  const r = await page.evaluate(async () => {
    const s=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas')
    if(s.loadAllTables&&(!s.allTables||!s.allTables.length))await s.loadAllTables()
    const t=(s.allTables||[]).find(x=>x.name==='zngm_comm_cd_dtl'); if(t&&s.addTableToCanvas)await s.addTableToCanvas(t)
    await new Promise(r=>setTimeout(r,800))
    const tbd = s.tablesByDatasource
    const allNames = []
    for (const ds in tbd) for (const sc in tbd[ds]) for (const tb of tbd[ds][sc]) allNames.push(tb.name)
    return { onCanvas: [...(s.tablesOnCanvas||[])], treeHasZngm: allNames.includes('zngm_comm_cd_dtl'), treeCount: allNames.length, datasources: [...(s.datasources||[])] }
  })
  console.log(JSON.stringify(r))
} catch(e){ console.log('FATAL', e.message) } finally { await b.close() }
