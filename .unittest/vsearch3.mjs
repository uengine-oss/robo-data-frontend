import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'; import { dirname, join } from 'node:path'
const SHOTS = join(dirname(fileURLToPath(import.meta.url)), 'screenshots')
const log=(...a)=>console.log('[s3]',...a)
const b = await chromium.launch({ headless: true })
const page = await b.newPage({ viewport: { width: 1680, height: 1000 }, deviceScaleFactor: 1.5 })
const errs=[]; page.on('pageerror',e=>errs.push(String(e).slice(0,120)))
const tab = (t)=>page.evaluate((t)=>{document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('session').activeTab=t}, t)
try {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2500)

  // 1) 상단 전체검색
  const top = page.locator('input[placeholder*="Search for"]').first()
  if (await top.count()) { await top.click(); await top.fill('card'); await page.waitForTimeout(800); await page.screenshot({path:join(SHOTS,'srch-top.png'), clip:{x:500,y:0,width:1000,height:260}}); log('top search ok') } else log('top input NOT FOUND')
  await top.fill('').catch(()=>{})

  // 2) 스키마탭 검색
  await tab('schema'); await page.waitForTimeout(2000)
  await page.evaluate(async()=>{const s=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas'); if(s.loadAllTables&&!s.allTables?.length)await s.loadAllTables()})
  await page.waitForTimeout(800)
  const sch = page.locator('input[placeholder*="테이블 검색"], input[placeholder*="검색"]').first()
  if (await sch.count()) { await sch.click(); await sch.fill('card'); await page.waitForTimeout(2500); await page.screenshot({path:join(SHOTS,'srch-schema.png'), clip:{x:0,y:60,width:380,height:820}}); log('schema search ok') } else log('schema input NOT FOUND')

  // 3) 그래프탭 검색
  await tab('analysis'); await page.waitForTimeout(2500)
  const ld = await page.evaluate(async()=>{ const a=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('analyzer'); return { nodes: a?.nodeMap?.size ?? a?.nodes?.length ?? null } })
  log('graph nodes:', JSON.stringify(ld))
  await page.waitForTimeout(1500)
  const nav = page.locator('input[placeholder*="검색"], input[placeholder*="노드"]').first()
  if (await nav.count()) { await nav.click(); await nav.fill('proc'); await page.waitForTimeout(1500); await page.screenshot({path:join(SHOTS,'srch-graph.png'), clip:{x:0,y:60,width:380,height:820}}); log('graph search ok') } else { log('graph nav input NOT FOUND'); await page.screenshot({path:join(SHOTS,'srch-graph.png'), clip:{x:0,y:60,width:380,height:820}}) }

  log('pageerror', errs.length, errs.slice(0,3))
} catch(e){ log('FATAL', e.message) }
finally { await b.close() }
