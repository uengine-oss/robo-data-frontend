import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'; import { dirname, join } from 'node:path'
const SHOTS = join(dirname(fileURLToPath(import.meta.url)), 'screenshots')
const log=(...a)=>console.log('[gt]',...a)
const b = await chromium.launch({ headless: true })
const page = await b.newPage({ viewport: { width: 1680, height: 1000 }, deviceScaleFactor: 1 })
try {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2500)
  await page.evaluate(()=>{document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('session').activeTab='graph'})
  await page.waitForTimeout(4000)
  // 그래프 탭 전체
  await page.screenshot({path:join(SHOTS,'gtab-full.png')})
  // 스토어/노드 선택 시도
  const info = await page.evaluate(async()=>{
    const ps = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
    const stores = [...ps._s.keys()]
    const gc = ps._s.get('graphCanvas') || ps._s.get('canvas')
    let picked=null
    try {
      const a = ps._s.get('analyzer')
      const firstId = a?.nodeMap ? [...a.nodeMap.keys()][0] : null
      if (gc?.addNodeToCanvas && firstId) gc.addNodeToCanvas(firstId)
      if (gc?.selectNode && firstId) gc.selectNode(firstId)
      picked = firstId
    } catch(e){}
    return { stores, picked, canvasNodes: gc?.canvasNodeIds ? gc.canvasNodeIds.size : null }
  })
  log('info:', JSON.stringify(info))
  await page.waitForTimeout(2500)
  await page.screenshot({path:join(SHOTS,'gtab-selected.png')})
  log('DONE')
} catch(e){ log('FATAL', e.message) }
finally { await b.close() }
