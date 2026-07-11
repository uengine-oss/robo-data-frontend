import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'; import { dirname, join } from 'node:path'
const SHOTS = join(dirname(fileURLToPath(import.meta.url)), 'screenshots')
const log=(...a)=>console.log('[g]',...a)
const b = await chromium.launch({ headless: true })
const page = await b.newPage({ viewport: { width: 1680, height: 1000 }, deviceScaleFactor: 1.5 })
const errs=[]; page.on('pageerror',e=>errs.push(String(e).slice(0,120)))
try {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2500)
  await page.evaluate(()=>{document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('session').activeTab='graph'})
  await page.waitForTimeout(3500)
  const ld = await page.evaluate(async()=>{ const a=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('analyzer'); return { nodes: a?.nodeMap?.size ?? null, hasNav: !!document.querySelector('.nav-search') } })
  log('state:', JSON.stringify(ld))
  await page.screenshot({path:join(SHOTS,'graph-nav-before.png'), clip:{x:0,y:60,width:400,height:880}})
  const nav = page.locator('input[placeholder*="Search modules"]').first()
  if (await nav.count()) {
    await nav.click(); await nav.fill('proc'); await page.waitForTimeout(1500)
    await page.screenshot({path:join(SHOTS,'graph-nav-search.png'), clip:{x:0,y:60,width:400,height:880}})
    log('nav search ok')
  } else log('nav input NOT FOUND (hasNav=' + ld.hasNav + ')')
  log('pageerror', errs.length, errs.slice(0,3))
} catch(e){ log('FATAL', e.message) }
finally { await b.close() }
