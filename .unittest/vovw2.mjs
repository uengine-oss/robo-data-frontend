import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'; import { dirname, join } from 'node:path'
const SHOTS = join(dirname(fileURLToPath(import.meta.url)), 'screenshots')
const log=(...a)=>console.log('[ov2]',...a)
const b = await chromium.launch({ headless: true })
const page = await b.newPage({ viewport: { width: 1680, height: 1000 }, deviceScaleFactor: 1.5 })
try {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2500)
  await page.evaluate(()=>{document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('session').activeTab='graph'})
  await page.waitForTimeout(4000)
  await page.evaluate(async()=>{ const ps=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia; const a=ps._s.get('analyzer'); const gc=ps._s.get('canvas'); const id=a?.nodeMap?[...a.nodeMap.keys()][0]:null; if(gc?.addNodeToCanvas&&id)gc.addNodeToCanvas(id) })
  await page.waitForTimeout(2000)
  const inp = page.locator('input[placeholder*="노드 이름으로 검색"]').first()
  await inp.click(); await inp.fill('auth'); await page.waitForTimeout(1500)
  // 상단
  await page.screenshot({path:join(SHOTS,'ovw-top.png'), clip:{x:1180,y:60,width:500,height:680}})
  // 드롭다운 스크롤 → 하단 결과 도달 증명
  await page.evaluate(()=>{ const d=document.querySelector('.search-results-dropdown'); if(d) d.scrollTop = d.scrollHeight })
  await page.waitForTimeout(800)
  await page.screenshot({path:join(SHOTS,'ovw-bottom.png'), clip:{x:1180,y:60,width:500,height:680}})
  const sc = await page.evaluate(()=>{ const d=document.querySelector('.search-results-dropdown'); return d?{scrollTop:Math.round(d.scrollTop), scrollH:Math.round(d.scrollHeight), clientH:Math.round(d.clientHeight)}:null })
  log('scroll:', JSON.stringify(sc))
  log('DONE')
} catch(e){ log('FATAL', e.message) }
finally { await b.close() }
