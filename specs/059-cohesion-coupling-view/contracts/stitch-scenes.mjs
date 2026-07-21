/**
 * 059 장면 결합 — 장면별 클립의 **대사 구간**만 잘라 이어붙이고 내레이션을 얹는다.
 *
 * 촬영 클립은 [준비 동작] + [대사 길이만큼 유지] 로 구성된다. 준비 동작(로드·탭이동·메뉴열기)은
 * 설명할 내용이 없어 잘라내고 뒤의 유지 구간만 남긴다. 그러면 **장면 길이 = 대사 길이**가 되어
 * 오디오를 뒤로 밀 필요가 없고 싱크가 어긋날 수 없다.
 *
 * 실행:
 *   node specs/059-cohesion-coupling-view/contracts/stitch-scenes.mjs \
 *     --scenes <scenes.json> --narration <tts디렉터리> --out <결과.mp4>
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1]
  return process.env[`STITCH_${name.toUpperCase()}`] ?? fallback
}

const SCENES_JSON = resolve(arg('scenes', 'recording/scenes.json'))
const TTS = resolve(arg('narration', 'recording/tts'))
const OUT = resolve(arg('out', 'recording/final.mp4'))
const TAIL_PAD = Number(arg('tail-pad', '1.5'))   // 대사 뒤 여유(초)
const WORK = join(dirname(OUT), 'stitch-work')

const report = JSON.parse(readFileSync(SCENES_JSON, 'utf8'))
rmSync(WORK, { recursive: true, force: true })
mkdirSync(WORK, { recursive: true })

const durationOf = file => Number(execFileSync('ffprobe',
  ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file],
  { encoding: 'utf8' }).trim())

const parts = []
const timeline = []
let cursor = 0

for (const scene of report.scenes) {
  const audio = join(TTS, `${scene.id}.mp3`)
  const audioLen = durationOf(audio)
  const videoLen = durationOf(scene.file)
  // 챕터 제목 구간 + 대사 구간을 남긴다. 제목이 잘리면 챕터가 화면에 안 나온다.
  const chapterSec = Number(scene.chapterSec ?? 0)
  const keep = Math.min(videoLen, chapterSec + audioLen + TAIL_PAD)
  const start = Math.max(0, videoLen - keep)
  const cut = join(WORK, `${scene.name}.mp4`)

  execFileSync('ffmpeg', [
    '-y', '-v', 'error',
    '-ss', start.toFixed(3), '-i', scene.file, '-t', keep.toFixed(3),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '25',
    '-an', cut,
  ], { stdio: 'inherit' })

  parts.push(cut)
  timeline.push({
    id: scene.id, name: scene.name, label: scene.label ?? scene.name,
    chapter: scene.chapter ?? '',
    // 대사는 챕터 제목이 사라진 **뒤**에 시작한다.
    at: Number((cursor + chapterSec).toFixed(2)),
    sceneAt: Number(cursor.toFixed(2)),
    len: Number(keep.toFixed(2)), narration: Number(audioLen.toFixed(2)),
  })
  console.log(`${scene.label ?? scene.name}: 원본 ${videoLen.toFixed(1)}s → ${keep.toFixed(1)}s `
    + `(챕터 ${chapterSec.toFixed(1)}s + 대사 ${audioLen.toFixed(1)}s) @ ${cursor.toFixed(1)}s`)
  cursor += keep
}

// 영상 이어붙이기 — 같은 코덱·해상도·fps 라 재인코딩 없이 붙인다.
const listFile = join(WORK, 'concat.txt')
writeFileSync(listFile, parts.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n'), 'utf8')
const silent = join(WORK, 'silent.mp4')
execFileSync('ffmpeg',
  ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', silent],
  { stdio: 'inherit' })

// 대사를 각 장면 **시작 시점**에 얹는다. 장면 길이가 대사 길이라 밀 필요가 없다.
const inputs = ['-i', silent, ...timeline.flatMap(t => ['-i', join(TTS, `${t.id}.mp3`)])]
const delays = timeline
  .map((t, i) => `[${i + 1}:a]adelay=${Math.round(t.at * 1000)}|${Math.round(t.at * 1000)}[a${i}]`)
  .join(';')
const mixIn = timeline.map((_, i) => `[a${i}]`).join('')

execFileSync('ffmpeg', [
  '-y', '-v', 'error', ...inputs,
  '-filter_complex', `${delays};${mixIn}amix=inputs=${timeline.length}:normalize=0[a]`,
  '-map', '0:v', '-map', '[a]',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-shortest', OUT,
], { stdio: 'inherit' })

writeFileSync(join(dirname(OUT), 'scene-timeline.json'),
  JSON.stringify({ timeline, totalSec: Number(cursor.toFixed(2)) }, null, 2), 'utf8')

console.log(`\n총 ${cursor.toFixed(1)}s → ${OUT}`)
