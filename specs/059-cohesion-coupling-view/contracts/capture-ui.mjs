/**
 * 059 화면 검증 캡처 — 원칙 §6("실제 화면을 띄워 캡처를 직접 보고")을 채우는 도구.
 *
 * 실행:
 *   node specs/059-cohesion-coupling-view/contracts/capture-ui.mjs
 *   node specs/059-cohesion-coupling-view/contracts/capture-ui.mjs --url http://127.0.0.1:3000 --out /tmp/shots
 *
 * 설계 원칙:
 *  - **하드코딩 금지.** 접속 주소·출력 경로·대기 시간을 전부 인자/환경변수로 받고, 값이 없을 때만
 *    저장소 기본값을 쓴다. 다른 세션·다른 에이전트가 그대로 실행할 수 있어야 한다.
 *  - **특정 데이터에 기대지 않는다.** 영역 이름·노드 개수를 코드에 박지 않고, 화면에서 읽어
 *    결과 JSON 으로 보고한다. 데이터가 바뀌어도 스크립트를 고칠 일이 없다.
 *  - **사람 속도.** goal-verify 촬영 계약과 같은 이유로 그래프가 정착할 때까지 기다린 뒤 찍는다.
 *    기다림 없이 찍은 장면은 레이아웃이 흔들려 증거가 되지 못한다.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1]
  return process.env[`CAPTURE_${name.toUpperCase()}`] ?? fallback
}

const URL = arg('url', 'http://127.0.0.1:3000')
const OUT = resolve(arg('out', join(process.cwd(), 'specs/059-cohesion-coupling-view/screenshots')))
const SETTLE_MS = Number(arg('settle', '9000'))       // goal-verify humanTiming.graphSettleMs 와 동일 기본값
const VIEW_SETTLE_MS = Number(arg('view-settle', '12000'))
const HEADLESS = arg('headless', 'true') !== 'false'
/** 영상 녹화 — `--video <디렉터리>` 를 주면 조작 전 과정을 mp4/webm 으로 남긴다. */
const VIDEO_DIR = arg('video', null)

/**
 * Playwright 해석 — 이 저장소에는 설치돼 있지 않다. 설치된 곳을 인자/환경변수로 받고,
 * 없으면 워크스페이스 안에서 실제로 설치된 위치를 순서대로 시도한다.
 * 특정 경로를 코드에 못 박지 않아 다른 PC·다른 세션에서도 그대로 돌아간다.
 */
async function loadPlaywright() {
  const explicit = arg('playwright-from', null)
  const { createRequire } = await import('node:module')
  const candidates = [
    explicit,
    process.cwd(),
    resolve(process.cwd(), '../robo-architect/frontend'),
    resolve(process.cwd(), '../../goal-verify/e2e'),
  ].filter(Boolean)

  for (const base of candidates) {
    try {
      const req = createRequire(join(resolve(base), 'package.json'))
      return req('playwright')
    } catch { /* 다음 후보 */ }
  }
  throw new Error(
    'playwright 를 찾지 못했습니다. --playwright-from <설치된 프로젝트 경로> 로 지정하거나 '
    + '이 저장소에 설치하세요.',
  )
}

const { chromium } = await loadPlaywright()

mkdirSync(OUT, { recursive: true })
const report = { url: URL, out: OUT, startedAt: new Date().toISOString(), steps: [], consoleErrors: [] }

const browser = await chromium.launch({ headless: HEADLESS })
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  // 촬영 계약(goal-verify)과 같은 규격: 원본부터 1920x1080. 업스케일로 대신하지 않는다.
  ...(VIDEO_DIR ? { recordVideo: { dir: resolve(VIDEO_DIR), size: { width: 1920, height: 1080 } } } : {}),
})
const page = await context.newPage()

page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 300)) })
page.on('pageerror', e => report.consoleErrors.push(`pageerror: ${String(e).slice(0, 300)}`))

const recordStart = Date.now()
async function shot(name, note) {
  const file = join(OUT, `${name}.png`)
  await page.screenshot({ path: file, fullPage: false })
  // 녹화 시작 기준 경과 초 — 내레이션을 고정 시간이 아니라 **실제 동작 시점**에 붙이기 위해 남긴다.
  const atSec = Number(((Date.now() - recordStart) / 1000).toFixed(2))
  report.steps.push({ name, note, file, atSec })
  console.log(`  캡처: ${name}  (t=${atSec}s) ${note}`)
}

/** 화면에 실제로 보이는 텍스트를 읽어 보고한다 — 기대값을 코드에 박지 않는다. */
async function readVisible(selector, limit = 20) {
  return page.$$eval(selector, (els, n) => els.slice(0, n).map(e => e.textContent.trim()).filter(Boolean),
    limit).catch(() => [])
}

try {
  console.log(`접속: ${URL}`)
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForTimeout(SETTLE_MS)
  await shot('01-초기화면', '앱 로드 직후')

  // 그래프 탭으로 이동 — 좌표가 아니라 **탭 이름**으로 찾는다(레이아웃이 바뀌어도 견딘다).
  // 이름은 인자로 덮을 수 있어 다른 빌드·다른 언어 UI 에서도 그대로 쓴다.
  const TAB = arg('tab', '코드 그래프')
  report.availableTabs = await page.$$eval('button[title]', els =>
    els.map(e => e.getAttribute('title')).filter(Boolean)).catch(() => [])
  const tabButton = page.locator(`button[title="${TAB}"]`).first()
  if (await tabButton.count()) {
    await tabButton.click()
    await page.waitForTimeout(SETTLE_MS)
    await shot('02-그래프탭', `'${TAB}' 탭 진입`)
  } else {
    report.steps.push({
      name: '02-그래프탭',
      note: `'${TAB}' 탭을 찾지 못함. 사용 가능한 탭: ${report.availableTabs.join(' / ')}`,
      file: null,
    })
  }

  // 보기 ▾ 메뉴 — 라벨이 바뀌어도 찾히도록 텍스트 일부로 잡는다.
  const viewButton = page.locator('button', { hasText: '보기' }).first()
  if (await viewButton.count()) {
    await viewButton.click()
    await page.waitForTimeout(1200)
    report.viewModes = await readVisible('.view-menu-item')
    await shot('03-보기모드-목록', `제공되는 보기 모드: ${report.viewModes.join(' / ')}`)

    // 첫 번째 보기 모드를 **켠다**. 이 메뉴는 토글이라 이미 켜져 있으면 누르면 꺼진다 —
    // 활성 표시(✓)를 먼저 읽고 꺼져 있을 때만 누른다. (실제로 켜진 모드를 눌러 끄는 사고가 났다)
    const first = page.locator('.view-menu-item').first()
    if (await first.count()) {
      const alreadyOn = (await first.textContent() ?? '').includes('✓')
      if (alreadyOn) {
        await viewButton.click()          // 메뉴만 닫는다
        report.viewModeAlreadyActive = true
      } else {
        await first.click()
      }
      await page.waitForTimeout(VIEW_SETTLE_MS)
      await shot('04-모듈간-상호작용', `모듈간 상호작용 (${alreadyOn ? '이미 활성' : '켬'}, 정착 후)`)
    }
  } else {
    report.steps.push({ name: '03-보기모드-목록', note: '보기 버튼을 찾지 못함', file: null })
  }

  // ── 드릴다운 시나리오 (spec 059 US3) ──────────────────────────────────────
  // 목표: 영역 간 결합을 발견 → 나쁜 사례를 지목 → 더블클릭으로 파고들어 범인 함수까지.
  // 대상 영역은 인자로 받는다. 지정이 없으면 캔버스의 첫 영역을 연다 — 데이터가 바뀌어도 돈다.
  const TARGET = arg('expand', null)
  const ZOOM_STEPS = Number(arg('zoom', '3'))

  // 줌인 — 노드 이름이 읽히는 배율까지. 촬영 계약상 확대는 천천히 여러 번 나눠 한다.
  const canvas = page.locator('canvas').first()
  const hasCanvas = await canvas.count() > 0
  if (!hasCanvas) {
    report.steps.push({
      name: '05-줌인',
      note: '캔버스를 찾지 못해 줌·더블클릭을 수행하지 못함 — 보기 모드가 꺼져 그래프가 비었을 수 있다',
      file: null,
    })
  }
  if (hasCanvas) {
    const box = await canvas.boundingBox()
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      for (let i = 0; i < ZOOM_STEPS; i++) {
        await page.mouse.wheel(0, -240)
        await page.waitForTimeout(900)
      }
      await page.waitForTimeout(SETTLE_MS)
      await shot('05-줌인', `확대 ${ZOOM_STEPS}단계 — 영역 이름과 선이 읽히는 배율`)
    }
  }

  /** 캔버스 위 노드를 캡션으로 찾아 더블클릭한다. NVL 은 canvas 라 DOM 좌표가 없어 앱이 노출하는
   *  좌표를 쓸 수 없다 → 캔버스 중앙 기준 탐색 대신, 네비게이터 트리에서 같은 이름을 더블클릭한다.
   *  트리 더블클릭도 같은 확장 경로를 타므로 검증 가치는 동일하다. */
  async function expandByName(name) {
    const item = page.locator(`.tree-node, [class*=tree] *`, { hasText: name }).first()
    if (!(await item.count())) return false
    await item.dblclick()
    await page.waitForTimeout(VIEW_SETTLE_MS)
    return true
  }

  // 더블클릭 확장 검증 (spec 059 US3) — **Navigator 에서 이름으로 모듈을 지목**해 더블클릭한다.
  // 캔버스(NVL)는 canvas 라 노드의 DOM 좌표가 없어 격자 탐색은 확대하면 빗나간다. 트리는 이름이
  // 있으니 정확하고, 사용자도 작은 원을 겨눌 필요가 없다(같은 expandLayer 경로를 탄다).
  {
    // 모듈 배지는 nodeClassify 가 정하므로 값을 인자로 덮을 수 있게 둔다(하드코딩 회피).
    const MODULE_BADGE = arg('module-badge', 'F')
    const rows = page.locator('.nav-tree-label')
    const rowCount = await rows.count()
    let target = null
    for (let i = 0; i < Math.min(rowCount, 200); i++) {
      const row = rows.nth(i)
      const badge = (await row.locator('.badge').first().textContent().catch(() => '')) ?? ''
      if (badge.trim() === MODULE_BADGE) { target = row; break }
    }

    if (!target) {
      report.steps.push({
        name: '06-더블클릭-펼침',
        note: `Navigator 에서 모듈 행(배지 '${MODULE_BADGE}')을 찾지 못함. 트리 행 ${rowCount}개`,
        file: null,
      })
    } else {
      const name = ((await target.locator('.name').first().textContent()) ?? '').trim()
      await target.dblclick()
      await page.waitForTimeout(VIEW_SETTLE_MS)
      report.expandTarget = name
      await shot('06-더블클릭-펼침', `모듈 '${name}' 더블클릭 — 그 안의 루틴이 드러남`)
    }
  }

  // ── 두 번째 보기 모드 (spec 059: 보기 모드는 2개, 각각 한 번씩 보여준다) ──────────────
  // E2E 촬영 계약(goal-verify Ch3-D)이 "보기 모드는 각각 한 번만"을 요구한다. 첫 모드만 찍으면
  // 촬영본이 반쪽이다.
  {
    const viewBtn = page.locator('button', { hasText: '보기' }).first()
    if (await viewBtn.count()) {
      await viewBtn.click()
      await page.waitForTimeout(1200)
      const items = page.locator('.view-menu-item')
      if (await items.count() > 1) {
        const second = items.nth(1)
        const label = ((await second.textContent()) ?? '').trim().slice(0, 20)
        await second.click()
        await page.waitForTimeout(VIEW_SETTLE_MS)
        await shot('07-실제-업무-단위', `두 번째 보기 모드 (${label}) — 정착 후`)
        report.secondViewMode = label
      } else {
        report.steps.push({ name: '07-실제-업무-단위', note: '두 번째 보기 모드를 찾지 못함', file: null })
      }
    }
  }

  report.finishedAt = new Date().toISOString()
  report.result = report.consoleErrors.length === 0 ? 'captured' : 'captured-with-console-errors'
} catch (error) {
  report.result = 'failed'
  report.error = String(error).slice(0, 500)
  await shot('FAILED', '실패 시점 화면').catch(() => {})
} finally {
  if (VIDEO_DIR) {
    const video = page.video()
    await page.close()               // 영상은 페이지가 닫혀야 기록이 끝난다
    if (video) report.videoPath = await video.path()
  }
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2), 'utf8')
  await browser.close()
}

console.log(`\n결과: ${report.result}`)
console.log(`콘솔 오류: ${report.consoleErrors.length}건`)
console.log(`보고서: ${join(OUT, 'report.json')}`)
if (report.result === 'failed') process.exitCode = 1
