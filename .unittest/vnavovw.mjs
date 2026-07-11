import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'; import { dirname, join } from 'node:path'
const SHOTS = join(dirname(fileURLToPath(import.meta.url)), 'screenshots')
const b = await chromium.launch({ headless: true })
const page = await b.newPage({ viewport: { width: 1680, height: 1000 }, deviceScaleFactor: 1.5 })
try {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2500)
  await page.evaluate(()=>{document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('session').activeTab='graph'})
  await page.waitForTimeout(3500)
  // 검색 안 한 기본 오버뷰
  await page.screenshot({path:join(SHOTS,'nav-overview.png'), clip:{x:80,y:60,width:460,height:900}})
  console.log('DONE')
} catch(e){ console.log('FATAL', e.message) }
finally { await b.close() }
