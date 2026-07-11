import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'; import { dirname, join } from 'node:path'
const SHOTS = join(dirname(fileURLToPath(import.meta.url)), 'screenshots')
const log=(...a)=>console.log('[fix]',...a)
const b = await chromium.launch({ headless: true })
const page = await b.newPage({ viewport: { width: 1680, height: 1000 }, deviceScaleFactor: 2 })
const errs=[]; page.on('pageerror',e=>errs.push(String(e).slice(0,120)))
try {
  await page.goto('http://localhost:3000', { waitUntil:'networkidle', timeout:60000 }); await page.waitForTimeout(2500)
  await page.evaluate(()=>{document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('session').activeTab='schema'}); await page.waitForTimeout(2000)
  await page.evaluate(async()=>{const s=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas'); if(s.loadAllTables&&!s.allTables?.length)await s.loadAllTables(); s.showLogicalNames=false})
  await page.waitForTimeout(600)
  // 이미 스키마탭에 있는 상태에서 상단 전체검색 입력 → Enter
  const top = page.locator('input.search-input').first()
  await top.click(); await top.fill('au'); await top.press('Enter'); await page.waitForTimeout(1500)
  // 사이드바 검색 input 값 + 검색결과 행 수 확인(같은탭 동작)
  const r = await page.evaluate(()=>{
    const sideInput = document.querySelector('.search-box input')
    const rows = [...document.querySelectorAll('.search-results .search-row')].length
    return { sideInputVal: sideInput?.value, rows }
  })
  log('after TOP search @schema:', JSON.stringify(r))
  await page.screenshot({path:join(SHOTS,'fix-topsearch-schema.png'), clip:{x:0,y:60,width:380,height:560}})
  log('pageerror', errs.length, errs.slice(0,3))
} catch(e){ log('FATAL', e.message) }
finally { await b.close() }
