// 노드 드래그 → 그래프 렌더 → 보기모드 5종 전환 캡처.
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const HERE = dirname(fileURLToPath(import.meta.url))
const SHOTS = join(HERE, 'screenshots')
const log = (...a) => console.log('[vm]', ...a)
let n = 70
const shot = async (p, name) => { await p.screenshot({ path: join(SHOTS, `${n++}-${name.replace(/[^\w가-힣-]/g, '_')}.png`) }).catch(() => {}); log('shot', name) }

const b = await chromium.launch({ headless: true })
const page = await b.newPage({ viewport: { width: 1600, height: 1000 } })
try {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2000)
  await page.locator('button.nav-child[title="코드 그래프"]').first().click({ timeout: 5000 })
  await page.waitForTimeout(5000)

  // 캔버스 영역(메인) 박스
  const main = page.locator('main, [class*=main-content], [class*=canvas]').first()
  const box = await main.boundingBox()
  const tgt = { x: box.x + box.width * 0.55, y: box.y + box.height * 0.5 }

  // Navigator 노드 1개 드래그 → 캔버스
  const node = page.locator('text=b000_main_proc').first()
  if (await node.count()) {
    const sb = await node.boundingBox()
    // 수동 마우스 DnD (HTML5/포인터 모두 대응)
    await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2)
    await page.mouse.down()
    await page.mouse.move(tgt.x - 80, tgt.y - 40, { steps: 12 })
    await page.mouse.move(tgt.x, tgt.y, { steps: 12 })
    await page.mouse.up()
    await page.waitForTimeout(3000)
  } else log('드래그 노드 못찾음')
  log('canvas svg/canvas:', await page.locator('svg, canvas').count())
  await shot(page, 'graph-with-node')

  // 보기모드 5종 (이모지 없는 텍스트로 선택, force 클릭)
  const modes = ['기본', '모듈간 상호작용', '영역', '협력 군집', '건강 보기']
  for (const m of modes) {
    const vb = page.locator('text=/보기:/').first()
    if (!(await vb.count())) { log('보기버튼 없음'); break }
    await vb.click({ timeout: 4000, force: true }).catch(() => {})
    await page.waitForTimeout(700)
    const opt = page.getByText(m, { exact: false }).last()
    if (await opt.count()) {
      await opt.click({ timeout: 3000, force: true }).catch(e => log('mode click fail', m, e.message))
      await page.waitForTimeout(1800)
      await shot(page, `mode-${m}`)
    } else log('모드 없음', m)
  }
} catch (e) { log('FATAL', e.message); await shot(page, 'err') }
finally { await b.close(); log('DONE') }
