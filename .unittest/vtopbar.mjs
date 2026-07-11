import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'; import { dirname, join } from 'node:path'
const SHOTS = join(dirname(fileURLToPath(import.meta.url)), 'screenshots')
const log=(...a)=>console.log('[tb]',...a)
const b = await chromium.launch({ headless: true })
const page = await b.newPage({ viewport: { width: 1680, height: 1000 }, deviceScaleFactor: 2 })
const errs=[]; page.on('pageerror',e=>errs.push(String(e).slice(0,120)))
const tab=(t)=>page.evaluate(t=>{document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('session').activeTab=t},t)
const top=()=>page.locator('input.search-input').first()
try {
  await page.goto('http://localhost:3000', { waitUntil:'networkidle', timeout:60000 }); await page.waitForTimeout(2500)
  // 스키마탭: 상단바 placeholder + 입력→스키마 검색
  await tab('schema'); await page.waitForTimeout(2000)
  await page.evaluate(async()=>{const s=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas'); if(s.loadAllTables&&!s.allTables?.length)await s.loadAllTables(); s.showLogicalNames=false})
  log('placeholder@schema:', await top().getAttribute('placeholder'))
  // 상단바 클로즈업(빈 상태)
  await page.screenshot({path:join(SHOTS,'topbar-schema-empty.png'), clip:{x:430,y:0,width:820,height:112}})
  // 상단바에 입력 → Enter → 스키마탭 검색 동작
  await top().click(); await top().fill('au'); await top().press('Enter'); await page.waitForTimeout(2000)
  await page.screenshot({path:join(SHOTS,'topbar-schema-routed.png'), clip:{x:0,y:0,width:780,height:600}})
  // 그래프탭: 상단바 placeholder + 입력→노드검색
  await tab('graph'); await page.waitForTimeout(3500)
  log('placeholder@graph:', await top().getAttribute('placeholder'))
  await page.screenshot({path:join(SHOTS,'topbar-graph-empty.png'), clip:{x:430,y:0,width:820,height:112}})
  await top().click(); await top().fill('auth'); await top().press('Enter'); await page.waitForTimeout(1500)
  await page.screenshot({path:join(SHOTS,'topbar-graph-routed.png'), clip:{x:0,y:0,width:1100,height:500}})
  log('pageerror', errs.length)
} catch(e){ log('FATAL', e.message) }
finally { await b.close() }
