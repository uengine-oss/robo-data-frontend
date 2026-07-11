// 044 US1 전체 흐름 — 참조 클릭 → 그 함수 코드만 슬라이스 + 접근줄 강조 + 오토스크롤.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const HERE = dirname(fileURLToPath(import.meta.url))
const SHOTS = join(HERE, 'screenshots')
mkdirSync(SHOTS, { recursive: true })
const log = (...a) => console.log('[us1]', ...a)
let n = 450
const shot = async (p, name) => { await p.screenshot({ path: join(SHOTS, `${n++}-${name}.png`) }).catch(() => {}); log('shot', name) }
const TARGET = 'zpay_ap_smpay_rgst_tmp'

const b = await chromium.launch({ headless: true })
const page = await b.newPage({ viewport: { width: 1600, height: 1000 } })
const errs = []
page.on('pageerror', e => errs.push('pageerror: ' + e.message))
const R = {}
try {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2000)
  await page.evaluate(() => { const ses = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('session'); ses.setActiveTab ? ses.setActiveTab('schema') : (ses.activeTab = 'schema') })
  let ready = false
  for (let i = 0; i < 12; i++) { await page.waitForTimeout(1000); ready = await page.evaluate(() => { try { return !!document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas') } catch { return false } }); if (ready) break }

  R.setup = await page.evaluate(async (target) => {
    const s = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas')
    if (typeof s.loadAllTables === 'function' && (!s.allTables || s.allTables.length === 0)) await s.loadAllTables()
    if ('showLogicalNames' in s) s.showLogicalNames = false
    const t = (s.allTables || []).find(x => x.name === target) || (s.allTables || [])[0]
    if (t && typeof s.addTableToCanvas === 'function') await s.addTableToCanvas(t)
    return { added: t?.name }
  }, TARGET)
  log('setup:', JSON.stringify(R.setup))
  await page.waitForTimeout(2000)

  // 참조 트리거 클릭 → 팝업
  const trg = page.locator('.vue-flow__node .table-node__ref-trigger').first()
  await trg.click({ force: true }).catch(() => {})
  await page.waitForTimeout(2500)
  R.refItems = await page.locator('.references-popup__item').count()
  R.popupText = (await page.locator('.references-popup').first().innerText().catch(() => '')).replace(/\n/g, ' | ').slice(0, 200)
  log('reference items:', R.refItems, '| popup:', R.popupText)
  await shot(page, 'us1-references-list')

  // 첫 참조 클릭 → 소스 패널
  const item = page.locator('.references-popup__item').first()
  await item.click({ timeout: 3000 }).catch(() => {})
  await page.waitForTimeout(2500)

  R.panel = await page.evaluate(() => {
    const s = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas')
    const p = s.sourceCodePanel || {}
    const lines = (p.fileContent || '').split('\n')
    return {
      isOpen: p.isOpen, notFound: p.notFound, loadError: p.loadError,
      startLine: p.startLine, highlightedLine: p.highlightedLine, procedureName: p.procedureName,
      linesShown: lines.length, firstLine: lines[0]?.slice(0, 50), lastLine: lines[lines.length - 1]?.slice(0, 50),
    }
  })
  log('panel:', JSON.stringify(R.panel))

  // DOM: 표시 줄번호가 실제 파일 줄(startLine 기준)인지 + 강조줄 존재
  R.dom = await page.evaluate(() => {
    const nums = [...document.querySelectorAll('.source-code-panel .source-line-number')].map(e => e.textContent.trim())
    const hl = document.querySelector('.source-code-panel .source-line.highlighted')
    return { firstNum: nums[0], lastNum: nums[nums.length - 1], count: nums.length, highlightedDataLine: hl?.getAttribute('data-line'), highlightedText: hl?.innerText?.slice(0, 60) }
  })
  log('dom:', JSON.stringify(R.dom))
  await shot(page, 'us1-source-panel-sliced')

  R.errs = errs
  log('RESULT', JSON.stringify(R))
} catch (e) { log('FATAL', e.message); await shot(page, 'fatal') }
finally { await b.close(); log('DONE') }
