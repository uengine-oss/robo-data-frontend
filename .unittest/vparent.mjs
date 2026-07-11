import { chromium } from 'playwright'
const b = await chromium.launch({ headless: true })
const page = await b.newPage({ viewport: { width: 1680, height: 1100 } })
try {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2500)
  await page.evaluate(() => { const s = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('session'); s.activeTab = 'schema' })
  await page.waitForTimeout(2500)
  const r = await page.evaluate(async () => {
    const s = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas')
    if (typeof s.loadAllTables === 'function' && (!s.allTables || !s.allTables.length)) await s.loadAllTables()
    s.showLogicalNames = true
    const t = (s.allTables || []).find(x => x.name === 'zngm_comm_cd_dtl')
    if (t) await s.addTableToCanvas(t)
    await new Promise(r => setTimeout(r, 1500))
    const node = document.querySelector('.vue-flow__node')
    const card = document.querySelector('.table-node')
    const ncs = getComputedStyle(node)
    return {
      nodeInlineStyle: node.getAttribute('style'),
      nodeDisplay: ncs.display, nodeWidth: ncs.width,
      cardParentIsNode: card.parentElement === node,
      cardParentClass: card.parentElement.className,
    }
  })
  console.log(JSON.stringify(r, null, 1))
} catch (e) { console.log('FATAL', e.message) }
finally { await b.close() }
