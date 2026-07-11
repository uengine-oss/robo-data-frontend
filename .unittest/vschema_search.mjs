import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'; import { dirname, join } from 'node:path'
const SHOTS = join(dirname(fileURLToPath(import.meta.url)), 'screenshots')
const log=(...a)=>console.log('[ss]',...a)
const b = await chromium.launch({ headless: true })
const page = await b.newPage({ viewport: { width: 1680, height: 1000 }, deviceScaleFactor: 1.5 })
const errs=[]; page.on('pageerror',e=>errs.push(String(e).slice(0,120)))
try {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2500)
  await page.evaluate(()=>{document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('session').activeTab='schema'})
  await page.waitForTimeout(2000)
  await page.evaluate(async()=>{const s=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas'); if(s.loadAllTables&&!s.allTables?.length)await s.loadAllTables(); s.showLogicalNames=false})
  await page.waitForTimeout(600)
  const sch = page.locator(".search-box input").first()
  await sch.click(); await sch.fill('au')
  await page.waitForTimeout(2800)
  await page.screenshot({path:join(SHOTS,'us5-schema-search.png'), clip:{x:0,y:60,width:380,height:820}})
  const dump = await page.evaluate(()=>{
    return [...document.querySelectorAll('.search-row')].slice(0,6).map(r=>({badge:r.querySelector('.search-row__badge')?.textContent, name:r.querySelector('.search-row__name')?.textContent, sub:r.querySelector('.search-row__sub')?.textContent}))
  })
  log('rows:', JSON.stringify(dump))
  log('pageerror', errs.length, errs.slice(0,3))
} catch(e){ log('FATAL', e.message) }
finally { await b.close() }
