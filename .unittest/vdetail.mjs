// 상세패널(노드패널) NOT NULL 텍스트 확인 (읽기 전용)
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const HERE = dirname(fileURLToPath(import.meta.url))
const SHOTS = join(HERE, 'screenshots')
const log = (...a) => console.log('[detail]', ...a)
const b = await chromium.launch({ headless: true })
const page = await b.newPage({ viewport: { width: 1680, height: 1000 }, deviceScaleFactor: 2 })
const errors = []
page.on('pageerror', e => errors.push('pageerror: ' + String(e).slice(0, 160)))
try {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2500)
  await page.evaluate(() => { const s = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('session'); s.activeTab = 'schema' })
  await page.waitForTimeout(2500)
  await page.evaluate(async () => {
    const s = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas')
    if (typeof s.loadAllTables === 'function' && (!s.allTables || !s.allTables.length)) await s.loadAllTables()
    const t = (s.allTables || []).find(x => x.name === 'zord_jncard')
    if (t) await s.addTableToCanvas(t)
    if (s.selectNode) s.selectNode('table-zord_jncard')
  })
  await page.waitForTimeout(2000)
  // 우측 상세패널 영역 캡처
  const panel = page.locator('.table-detail-panel, [class*=detail-panel], aside.detail').first()
  if (await panel.count()) {
    const box = await panel.boundingBox()
    if (box) await page.screenshot({ path: join(SHOTS, 'detail-notnull.png'), clip: box })
    else await page.screenshot({ path: join(SHOTS, 'detail-notnull.png'), clip: { x: 1180, y: 80, width: 500, height: 900 } })
  } else {
    await page.screenshot({ path: join(SHOTS, 'detail-notnull.png'), clip: { x: 1180, y: 80, width: 500, height: 900 } })
  }
  log('ERRORS', errors.length, errors.slice(0, 5))
  log('DONE')
} catch (e) { log('FATAL', e.message) }
finally { await b.close() }
