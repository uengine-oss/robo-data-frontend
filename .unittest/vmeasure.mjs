// 카드 실제 폭 + 컬럼명 ellipsis(말줄임) 여부 측정 (논리명 모드)
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
    const cardCS = card ? getComputedStyle(card) : null
    const names = [...document.querySelectorAll('.table-node__column-name')].map(el => ({
      text: el.textContent.trim().slice(0, 30),
      clientW: Math.round(el.clientWidth),
      scrollW: Math.round(el.scrollWidth),
      truncated: el.scrollWidth > el.clientWidth + 1,
    }))
    return {
      nodeWidth: node ? Math.round(node.getBoundingClientRect().width) : null,
      cardWidth: card ? Math.round(card.getBoundingClientRect().width) : null,
      cardMaxWidth: cardCS ? cardCS.maxWidth : null,
      names: names.slice(0, 8),
    }
  })
  console.log(JSON.stringify(r, null, 1))
} catch (e) { console.log('FATAL', e.message) }
finally { await b.close() }
