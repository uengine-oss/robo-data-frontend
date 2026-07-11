import { chromium } from 'playwright'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const SHOTS = join(dirname(fileURLToPath(import.meta.url)), 'screenshots')
const b = await chromium.launch({ headless: true })
const page = await b.newPage({ viewport: { width: 1500, height: 1000 } })
const errs=[]; page.on('pageerror',e=>errs.push(e.message))
const setTab = (tab) => page.evaluate((t)=>{const s=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('session'); s.setActiveTab?s.setActiveTab(t):(s.activeTab=t)}, tab)
try {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 60000 }); await page.waitForTimeout(2000)
  // ===== 스키마 탭 검색 =====
  await setTab('schema')
  let ok=false; for(let i=0;i<12;i++){await page.waitForTimeout(1000); ok=await page.evaluate(()=>{try{return !!document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas')}catch{return false}}); if(ok)break}
  await page.evaluate(async () => { const s=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas'); if(s.loadAllTables&&(!s.allTables||!s.allTables.length))await s.loadAllTables() })
  await page.waitForTimeout(800)
  const schemaSearch = page.locator('.search-box input, input[placeholder*="검색"]').first()
  await schemaSearch.fill('zord').catch(e=>console.log('schema fill err', e.message))
  await page.waitForTimeout(1500)
  const schemaResults = await page.locator('.table-item, .semantic-result-item, .table-item--search-result').count()
  console.log('SCHEMA search "zord" → results:', schemaResults)
  await page.screenshot({ path: join(SHOTS, '530-schema-search.png') })
  await schemaSearch.fill('').catch(()=>{})
  // ===== 그래프 탭 검색 =====
  await setTab('analysis')
  await page.waitForTimeout(1500)
  // 그래프 탭 검색 input 찾기
  const ginput = page.locator('.search-panel input, .graph-search input, input[placeholder*="검색"], input[placeholder*="Search"]')
  const gcount = await ginput.count()
  console.log('graph tab search inputs:', gcount)
  if (gcount) {
    await ginput.first().fill('auth').catch(e=>console.log('graph fill err', e.message))
    await page.waitForTimeout(1500)
    console.log('graph search-results visible:', await page.locator('.search-results, .search-result, .search-dropdown').count())
  }
  await page.screenshot({ path: join(SHOTS, '531-graph-search.png') })
  console.log('pageerrors', errs.length, errs.slice(0,2))
} catch(e){ console.log('FATAL', e.message); await page.screenshot({ path: join(SHOTS, '532-search-err.png') }) } finally { await b.close() }
