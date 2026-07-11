import { chromium } from 'playwright'
const b = await chromium.launch({ headless: true })
const page = await b.newPage({ viewport: { width: 1680, height: 1000 } })
try {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2500)
  await page.evaluate(()=>{document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('session').activeTab='graph'})
  await page.waitForTimeout(4000)
  const r = await page.evaluate(()=>{
    const a=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('analyzer')
    const nodes = a?.nodeMap ? [...a.nodeMap.values()] : []
    const pick = (lbl)=>nodes.find(n=>(n.labels||[]).includes(lbl))
    const samp = (n)=> n ? ({ id:n.id, labels:n.labels, propKeys:Object.keys(n.properties||{}), props:n.properties }) : null
    return {
      total: nodes.length,
      column: samp(pick('COLUMN')),
      func: samp(pick('FUNCTION')) || samp(pick('PROCEDURE')) || samp(pick('METHOD')),
      table: samp(pick('TABLE')),
      hasLinks: !!(a?.links || a?.edges || a?.relationships),
      linkKeys: a?.links ? 'links' : (a?.edges?'edges':(a?.relationships?'relationships':'none')),
    }
  })
  console.log(JSON.stringify(r, null, 1))
} catch(e){ console.log('FATAL', e.message) }
finally { await b.close() }
