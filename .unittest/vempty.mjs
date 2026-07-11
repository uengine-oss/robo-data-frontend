import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'; import { dirname, join } from 'node:path'
const SHOTS = join(dirname(fileURLToPath(import.meta.url)), 'screenshots')
const b = await chromium.launch({ headless: true })
const page = await b.newPage({ viewport: { width: 1680, height: 1000 }, deviceScaleFactor: 2 })
const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0,120)))
try {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2500)
  await page.evaluate(() => { document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('session').activeTab = 'schema' })
  await page.waitForTimeout(2000)
  // 테이블 로드만(캔버스엔 추가 X = 빈 캔버스)
  const st = await page.evaluate(async () => {
    const s = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas')
    if (typeof s.loadAllTables === 'function' && (!s.allTables || !s.allTables.length)) await s.loadAllTables()
    return { allTables: s.allTables?.length, nodes: s.nodes?.length, hasToggle: !!document.querySelector('.name-toggle, [class*=name-toggle]'), }
  })
  await page.waitForTimeout(800)
  console.log('state:', JSON.stringify(st))
  const fc = page.locator('.floating-controls').first()
  if (await fc.count()) { const box = await fc.boundingBox(); if (box) await page.screenshot({ path: join(SHOTS, 'empty-controls.png'), clip: { x: box.x-8, y: box.y-8, width: Math.min(box.width+16, 900), height: box.height+16 } }) }
  await page.screenshot({ path: join(SHOTS, 'empty-full.png'), clip: { x: 0, y: 0, width: 700, height: 300 } })
  console.log('pageerror:', errs.length, errs.slice(0,3))
} catch (e) { console.log('FATAL', e.message) }
finally { await b.close() }
