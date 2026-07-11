import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'; import { dirname, join } from 'node:path'
const SHOTS = join(dirname(fileURLToPath(import.meta.url)), 'screenshots')
const log=(...a)=>console.log('[ov]',...a)
const b = await chromium.launch({ headless: true })
const page = await b.newPage({ viewport: { width: 1680, height: 1000 }, deviceScaleFactor: 1.5 })
const errs=[]; page.on('pageerror',e=>errs.push(String(e).slice(0,120)))
try {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2500)
  await page.evaluate(()=>{document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('session').activeTab='graph'})
  await page.waitForTimeout(4000)
  // 노드 하나 캔버스에 → Overview 열림
  await page.evaluate(async()=>{ const ps=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia; const a=ps._s.get('analyzer'); const gc=ps._s.get('canvas'); const id=a?.nodeMap?[...a.nodeMap.keys()][0]:null; if(gc?.addNodeToCanvas&&id)gc.addNodeToCanvas(id) })
  await page.waitForTimeout(2000)
  const inp = page.locator('input[placeholder*="노드 이름으로 검색"]').first()
  if (await inp.count()) {
    await inp.click(); await inp.fill('auth'); await page.waitForTimeout(1800)
    // 우측 Overview 패널 영역 캡처
    await page.screenshot({path:join(SHOTS,'ovw-search.png'), clip:{x:1180,y:60,width:500,height:900}})
    log('overview search ok')
    // 결과 DOM 구조 덤프
    const dump = await page.evaluate(()=>{
      const panel = document.querySelector('[class*=overview],[class*=Overview]') || document.body
      const results = [...document.querySelectorAll('[class*=result],[class*=preview],[class*=search-item],[class*=node-item]')].slice(0,5).map(e=>({cls:e.className, txt:(e.textContent||'').trim().slice(0,40)}))
      return results
    })
    log('result nodes:', JSON.stringify(dump))
  } else log('overview search input NOT FOUND')
  log('pageerror', errs.length, errs.slice(0,3))
} catch(e){ log('FATAL', e.message) }
finally { await b.close() }
