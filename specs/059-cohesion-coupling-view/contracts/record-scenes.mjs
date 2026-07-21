/**
 * 059 장면별 촬영 — 원테이크가 아니라 **장면 단위**로 찍고 이어붙인다(사용자 지시 2026-07-21).
 *
 * 왜 장면별인가: 원테이크로 찍으면 대사 길이와 화면 체류 시간을 맞추기 위해 오디오를 뒤로 밀게
 * 되고, 그러면 화면은 이미 다음 장면인데 앞 장면 설명이 나온다(실제로 21초까지 어긋났다).
 * 장면별로 찍으면 **각 장면 길이 = 그 장면 대사 길이**라 싱크가 어긋날 수 없다.
 *
 * 실행:
 *   node specs/059-cohesion-coupling-view/contracts/record-scenes.mjs \
 *     --narration <tts디렉터리> --out <출력디렉터리>
 *
 * 설계 원칙: 주소·경로·대기시간·탭이름을 전부 인자로 받는다(하드코딩 0).
 * 산출 파일명은 ASCII 로만 짓는다 — 한글 파일명이 ffmpeg/OS 레이어에서 깨졌다(실측).
 * 사람이 읽을 이름은 `label` 로 따로 둔다.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1]
  return process.env[`REC_${name.toUpperCase()}`] ?? fallback
}

const URL = arg('url', 'http://127.0.0.1:3000')
const OUT = resolve(arg('out', join(process.cwd(), 'specs/059-cohesion-coupling-view/recording')))
const NARRATION = arg('narration', null)
const TAB = arg('tab', '코드 그래프')
const SETTLE = Number(arg('settle', '9000'))        // 그래프가 정착할 때까지
const RECOGNITION = Number(arg('recognition', '2200'))  // 대사 끝난 뒤 인지 시간
const MODULE_BADGE = arg('module-badge', 'F')
const CHAPTER_MS = Number(arg('chapter', '3000'))   // 챕터 제목이 화면에 머무는 시간

async function loadPlaywright() {
  const { createRequire } = await import('node:module')
  for (const base of [arg('playwright-from', null), process.cwd(),
    resolve(process.cwd(), '../robo-architect/frontend')].filter(Boolean)) {
    try { return createRequire(join(resolve(base), 'package.json'))('playwright') } catch { /* 다음 */ }
  }
  throw new Error('playwright 를 찾지 못했습니다. --playwright-from 으로 지정하세요.')
}
const { chromium } = await loadPlaywright()

const durationOf = f => Number(execFileSync('ffprobe',
  ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim())

/**
 * 장면 정의 — 보기 모드부터 시작한다(앱 로드·탭 이동은 설명할 내용이 없어 뺀다, 사용자 지시).
 * `act` 는 그 장면에서 **보여줄 동작**만 한다. 체류 시간은 대사 길이가 정한다.
 */
const SCENES = [
  {
    id: 's3', name: '01-view-modes', label: '보기 모드',
    chapter: '레거시를 보는 두 가지 시선',
    subtitle: '구조로 볼 것인가, 실제 움직임으로 볼 것인가',
    async act(page) {
      await openViewMenu(page)
    },
  },
  {
    id: 's4', name: '02-module-interaction', label: '모듈간 상호작용',
    chapter: '업무 영역과 그 경계',
    subtitle: '테이블은 데이터를 바꾸는 쪽이 주인이다',
    async act(page) {
      await openViewMenu(page)
      await selectViewMode(page, 0)
    },
  },
  {
    id: 's5s6', name: '03-colors-bad-case', label: '색과 나쁜 사례',
    chapter: '경계를 넘는 선이 문제다',
    subtitle: '남의 데이터에 쓰는 순간 책임이 갈린다',
    async act(page) {
      await openViewMenu(page)
      await selectViewMode(page, 0)
      await zoom(page, 2)
    },
  },
  {
    id: 's7', name: '04-expand-module', label: '더블클릭 펼침',
    chapter: '원인을 함수까지 좁힌다',
    subtitle: '어느 코드가 남의 재고를 건드리는가',
    async act(page) {
      await openViewMenu(page)
      await selectViewMode(page, 0)
      await zoom(page, 1)
      await expandFirstModule(page)
    },
  },
  {
    id: 's8', name: '05-work-units', label: '실제 업무 단위',
    chapter: '코드가 스스로 그린 업무 지도',
    subtitle: '폴더가 아니라 호출이 말해주는 경계',
    async act(page) {
      await openViewMenu(page)
      await selectViewMode(page, 1)
    },
  },
]

/**
 * 챕터 제목을 화면 중앙 아래에 잠깐 띄운다(사용자 지시 2026-07-21).
 *
 * ffmpeg drawtext 대신 DOM 오버레이를 쓴다 — 한글 폰트 경로에 의존하지 않고, 화면 폭에 맞춰
 * 자동으로 줄어들어 **삐져나오지 않는다**. 그래프를 가리지 않도록 하단에 두고 곧 사라진다.
 */
async function showChapter(page, index, title, subtitle) {
  await page.evaluate(({ index, title, subtitle, ms }) => {
    document.querySelector('#e2e-chapter')?.remove()
    const el = document.createElement('div')
    el.id = 'e2e-chapter'
    el.style.cssText = [
      'position:fixed', 'left:50%', 'bottom:8%', 'transform:translateX(-50%)',
      'z-index:99999', 'pointer-events:none',
      'max-width:78vw', 'box-sizing:border-box',
      'padding:18px 34px', 'border-radius:14px',
      'background:rgba(16,18,22,0.88)', 'border:1px solid rgba(255,255,255,0.10)',
      'box-shadow:0 10px 40px rgba(0,0,0,0.45)',
      'font-family:system-ui,"Malgun Gothic",sans-serif', 'text-align:center',
      'opacity:0', 'transition:opacity 480ms ease',
    ].join(';')
    el.innerHTML =
      `<div style="font-size:13px;letter-spacing:.16em;color:#7f8b9c;margin-bottom:8px">`
      + `CHAPTER ${String(index).padStart(2, '0')}</div>`
      + `<div style="font-size:34px;font-weight:700;color:#f2f4f8;line-height:1.25;`
      + `white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${title}</div>`
      + (subtitle
        ? `<div style="font-size:15px;color:#9aa6b6;margin-top:10px;line-height:1.5">${subtitle}</div>`
        : '')
    document.body.appendChild(el)
    requestAnimationFrame(() => { el.style.opacity = '1' })
    setTimeout(() => {
      el.style.opacity = '0'
      setTimeout(() => el.remove(), 520)
    }, ms)
  }, { index, title, subtitle, ms: CHAPTER_MS })
  await page.waitForTimeout(CHAPTER_MS + 700)   // 제목이 완전히 사라진 뒤 대사가 시작된다
}

async function gotoGraphTab(page) {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForTimeout(4000)
  const tab = page.locator(`button[title="${TAB}"]`).first()
  if (!(await tab.count())) throw new Error(`'${TAB}' 탭을 찾지 못했습니다`)
  await tab.click()
  await page.waitForTimeout(SETTLE)
}

async function openViewMenu(page) {
  const btn = page.locator('button', { hasText: '보기' }).first()
  if (!(await btn.count())) throw new Error('보기 버튼을 찾지 못했습니다')
  await btn.click()
  await page.waitForTimeout(1200)
}

/** 보기 모드는 토글이라 이미 켜져 있으면 누르지 않는다(눌러서 꺼버리는 사고를 막는다). */
async function selectViewMode(page, index) {
  const item = page.locator('.view-menu-item').nth(index)
  if (!(await item.count())) throw new Error(`보기 모드 ${index} 번을 찾지 못했습니다`)
  const on = ((await item.textContent()) ?? '').includes('✓')
  if (on) await page.locator('button', { hasText: '보기' }).first().click()
  else await item.click()
  await page.waitForTimeout(SETTLE)
}

async function zoom(page, steps) {
  const canvas = page.locator('canvas').first()
  if (!(await canvas.count())) return
  const box = await canvas.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, -240); await page.waitForTimeout(900) }
  await page.waitForTimeout(SETTLE)
}

/** Navigator 에서 이름으로 모듈을 지목해 펼친다 — 캔버스의 작은 원을 좌표로 겨누지 않는다. */
async function expandFirstModule(page) {
  const rows = page.locator('.nav-tree-label')
  const count = await rows.count()
  for (let i = 0; i < Math.min(count, 200); i++) {
    const row = rows.nth(i)
    const badge = (await row.locator('.badge').first().textContent().catch(() => '')) ?? ''
    if (badge.trim() === MODULE_BADGE) {
      await row.dblclick()
      await page.waitForTimeout(SETTLE)
      return
    }
  }
  throw new Error(`Navigator 에서 모듈 행(배지 '${MODULE_BADGE}')을 찾지 못했습니다`)
}

mkdirSync(OUT, { recursive: true })
const report = { url: URL, out: OUT, scenes: [], consoleErrors: [] }
const browser = await chromium.launch({ headless: arg('headless', 'true') !== 'false' })

for (const scene of SCENES) {
  const hold = NARRATION ? durationOf(join(resolve(NARRATION), `${scene.id}.mp3`)) * 1000 + RECOGNITION : 6000
  const dir = join(OUT, `raw-${scene.name}`)
  mkdirSync(dir, { recursive: true })

  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir, size: { width: 1920, height: 1080 } },
  })
  const page = await ctx.newPage()
  page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(`${scene.name}: ${m.text().slice(0, 200)}`) })

  console.log(`[${scene.label}] 준비 → 대사 ${(hold / 1000).toFixed(1)}s 만큼 유지`)
  await gotoGraphTab(page)
  await scene.act(page)
  // 챕터 제목은 화면이 정착한 **뒤** 띄운다 — 레이아웃이 흔들리는 중에 겹치면 읽히지 않는다.
  await showChapter(page, SCENES.indexOf(scene) + 1, scene.chapter, scene.subtitle)
  await page.screenshot({ path: join(OUT, `${scene.name}.png`) })
  await page.waitForTimeout(hold)          // ★ 장면 길이 = 대사 길이. 여기서 싱크가 결정된다.

  const video = page.video()
  await page.close()
  await ctx.close()

  const raw = video ? await video.path() : null
  if (raw) {
    const dest = join(OUT, `${scene.name}.webm`)
    renameSync(raw, dest)
    rmSync(dir, { recursive: true, force: true })
    report.scenes.push({ id: scene.id, name: scene.name, label: scene.label, chapter: scene.chapter,
      chapterSec: Number(((CHAPTER_MS + 700) / 1000).toFixed(2)), file: dest, holdSec: Number((hold / 1000).toFixed(2)) })
    console.log(`  → ${scene.name}.webm`)
  }
}

await browser.close()
writeFileSync(join(OUT, 'scenes.json'), JSON.stringify(report, null, 2), 'utf8')
console.log(`\n장면 ${report.scenes.length}개 · 콘솔 오류 ${report.consoleErrors.length}건`)
console.log(`목록: ${join(OUT, 'scenes.json')}`)
