import { chromium } from 'playwright'
const b = await chromium.launch({ headless: true })
const page = await b.newPage({ viewport: { width: 1600, height: 1000 } })
try {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2000)
  await page.evaluate(() => { const s=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('session'); s.setActiveTab?s.setActiveTab('schema'):(s.activeTab='schema') })
  let ok=false; for(let i=0;i<12;i++){await page.waitForTimeout(1000); ok=await page.evaluate(()=>{try{return !!document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas')}catch{return false}}); if(ok)break}
  const setup = await page.evaluate(async () => {
    const s=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas')
    if(s.loadAllTables&&(!s.allTables||!s.allTables.length))await s.loadAllTables()
    if('showLogicalNames' in s)s.showLogicalNames=false
    const t=(s.allTables||[]).find(x=>x.name==='zngm_comm_cd_dtl')
    if(t&&s.addTableToCanvas)await s.addTableToCanvas(t)
    return {added:t?.name, schema:t?.table_schema}
  })
  console.log('setup', JSON.stringify(setup))
  await page.waitForTimeout(1500)
  await page.locator('.vue-flow__node .table-node__ref-trigger').first().click({force:true}).catch(()=>{})
  await page.waitForTimeout(2500)
  const items = await page.locator('.references-popup__item').count()
  const firstText = (await page.locator('.references-popup__item').first().innerText().catch(()=> '')).replace(/\n/g,' ')
  console.log('refItems', items, '| first:', firstText.slice(0,80))
  await page.locator('.references-popup__item').first().click().catch(()=>{})
  await page.waitForTimeout(2000)
  const panel = await page.evaluate(()=>{const p=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas').sourceCodePanel||{};return {startLine:p.startLine,highlighted:p.highlightedLine,proc:p.procedureName,lines:(p.fileContent||'').split('\n').length}})
  console.log('PANEL', JSON.stringify(panel))
} catch(e){ console.log('FATAL', e.message) } finally { await b.close() }
