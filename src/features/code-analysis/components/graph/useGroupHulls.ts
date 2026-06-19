/**
 * useGroupHulls.ts
 * NVL 캔버스 위에 "같은 그룹(바운디드 컨텍스트) 노드끼리 감싸는 색 영역"을 그려주는 오버레이.
 *
 * ── 왜 별도 오버레이인가 ───────────────────────────────────────────────
 * NVL(@neo4j-nvl/base)에는 노드를 속성값 기준으로 묶어 영역/경계를 그리는 기능이 없다.
 * 그래서 NVL 컨테이너 위에 투명 <canvas> 한 장을 덧대고 직접 그린다.
 *
 * ── 동기화 원칙 (오버레이가 NVL 과 어긋나지 않게) ──────────────────────
 * 오버레이는 "자기 줌/팬"을 절대 갖지 않고, 매 프레임 NVL 변환을 그대로 따라 그린다.
 * NVL base.mjs 의 mapToRelativePosition 과 100% 동일한 world→screen(CSS px) 변환:
 *     screenX = (worldX − panX) · zoom / dpr + cssWidth / 2
 *     screenY = (worldY − panY) · zoom / dpr + cssHeight / 2
 *   (zoom = nvl.getScale(), pan = nvl.getPan(), dpr = devicePixelRatio)
 * ※ 흔한 실수(=desync 원인): pan 은 더하는 게 아니라 빼고, dpr 로 나누며, 원점은
 *   좌상단이 아니라 캔버스 중앙(+크기/2)이다. 셋 중 하나만 틀려도 어긋난다.
 *
 * ── 다시 그리는 시점(트리거) ───────────────────────────────────────────
 *   - ZoomInteraction.onZoom / PanInteraction.onPan  (휠 줌·캔버스 이동)
 *   - NVL onLayoutStep / onLayoutDone                (초기 레이아웃 정착)
 *   - 컨테이너 mousedown→mouseup 사이 rAF 루프         (노드 드래그 — 전용 이벤트 없음)
 *   - ResizeObserver                                 (컨테이너 크기 변경)
 */

import type { NVL } from '@neo4j-nvl/base'
import type { Ref } from 'vue'
import type { GraphNode } from '@/shared/types'
import { getNodeSize } from '@/shared/config/graphStyles'

// ============================================================================
// 타입
// ============================================================================

/**
 * 한 겹의 영역(헐) 레벨. 여러 겹을 바깥→안 순서로 쌓아 **중첩 헐(원 안의 원)** 을 만든다(spec 021).
 * 예: [패키지 레벨(padding 큼), 파일 레벨(padding 작음)] → 패키지 원 안에 파일 원들.
 */
export interface HullLevel {
  /** 노드 → 이 레벨의 그룹 키. null 이면 이 레벨에서 제외. */
  keyOf: (node: GraphNode) => string | null
  /** 그룹 키 → 표시 라벨. */
  labelOf: (key: string, nodes: GraphNode[]) => string
  /** 영역 바깥 여백(px, 스크린 기준 고정). 노드 반지름은 useGroupHulls 가 줌비례로 별도 가산. */
  padding: number
  /** 이 레벨에서 헐을 그릴 최소 그룹 노드 수(기본 1). 예: 파일레벨 2 = 1노드 파일 링 생략. */
  minSize?: number
}

export interface GroupHullConfig {
  /** 바깥→안 순서의 헐 레벨들. 빈 배열이면 영역 표시 끔. */
  levels: HullLevel[]
}

interface Pt { x: number; y: number }

// ============================================================================
// 색상 — 임의 그룹 값에 안정적 팔레트 해시 (같은 값 → 항상 같은 색)
// ============================================================================

const PALETTE = [
  '#4dabf7', '#69db7c', '#ffd43b', '#ff8787', '#b197fc',
  '#3bc9db', '#ffa94d', '#f783ac', '#a9e34b', '#63e6be',
  '#748ffc', '#ffe066', '#e599f7', '#66d9e8', '#ffc078',
]

function hashColor(key: string): string {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0
  return PALETTE[Math.abs(h) % PALETTE.length]
}

function hexToRgba(hex: string, alpha: number): string {
  const m = hex.replace('#', '')
  const full = m.length === 3 ? m.split('').map(c => c + c).join('') : m
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// ============================================================================
// 볼록 껍질(convex hull) — Andrew's monotone chain. 외부 의존성 없음.
// 반환: 반시계 정점 배열 (점 ≤2 면 그대로)
// ============================================================================

function convexHull(points: Pt[]): Pt[] {
  if (points.length <= 2) return points.slice()
  const pts = points.slice().sort((a, b) => (a.x - b.x) || (a.y - b.y))
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: Pt[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: Pt[] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

/** 점이 폴리곤 내부인가 (ray-casting). 헐 드래그 hit-test 용. */
function pointInPolygon(x: number, y: number, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y
    const intersect = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/** 점에서 선분(a-b)까지 최단거리. 2노드 캡슐 hit-test 용. */
function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

// ============================================================================
// 컴포저블
// ============================================================================

export function useGroupHulls(
  containerRef: Ref<HTMLElement | undefined>,
  nvlInstance: Ref<NVL | null>,
  /** 현재 캔버스에 표시 중인 원본 노드 (props.graphData.nodes) */
  getNodes: () => GraphNode[],
  /** 그룹/색 설정 getter */
  getConfig: () => GroupHullConfig,
) {
  let overlay: HTMLCanvasElement | null = null
  let ctx: CanvasRenderingContext2D | null = null
  let resizeObserver: ResizeObserver | null = null
  let rafId = 0
  let interacting = false   // 컨테이너에 마우스 버튼이 눌린 동안(노드드래그/팬) = true
  let wakeUntil = 0         // 휠 줌 등 버튼 없는 전이를 잠깐 추종하는 마감 시각(ms)
  let downHandler: ((e: MouseEvent) => void) | null = null
  let upHandler: (() => void) | null = null

  // 헐 드래그 hit-test 용 — redraw 시 그린 그룹 지오메트리/노드 스크린좌표(반지름 포함) 기록.
  let drawnGroups: { pts: Pt[]; padding: number; nodeIds: string[] }[] = []
  let nodeScreens: { id: string; x: number; y: number; r: number }[] = []

  // ── 오버레이 캔버스 부착/해제 ─────────────────────────────────────────
  function attach(): void {
    const host = containerRef.value
    if (!host || overlay) return
    overlay = document.createElement('canvas')
    overlay.className = 'group-hull-overlay'
    Object.assign(overlay.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none', // 클릭은 아래 NVL 캔버스로 통과
      zIndex: '1',
    })
    host.appendChild(overlay)
    ctx = overlay.getContext('2d')

    resizeObserver = new ResizeObserver(() => { sizeCanvas(); redraw() })
    resizeObserver.observe(host)
    sizeCanvas()

    // 상호작용 중에만 rAF 추종(아래 startLoop 주석). idle 엔 루프가 자기 정지 → CPU 0.
    downHandler = () => { interacting = true; ensureLoop() }
    upHandler = () => { interacting = false }   // 루프는 다음 프레임에 스스로 멈춤
    host.addEventListener('mousedown', downHandler)
    window.addEventListener('mouseup', upHandler)
    redraw()   // 최초 1회 그리기(이후는 이벤트/상호작용 때만)
  }

  function detach(): void {
    stopLoop()
    const host = containerRef.value
    if (downHandler && host) host.removeEventListener('mousedown', downHandler)
    if (upHandler) window.removeEventListener('mouseup', upHandler)
    downHandler = null
    upHandler = null
    interacting = false
    if (host && overlay && overlay.parentElement === host) host.removeChild(overlay)
    resizeObserver?.disconnect()
    resizeObserver = null
    overlay = null
    ctx = null
  }

  function sizeCanvas(): void {
    if (!overlay || !containerRef.value) return
    const dpr = window.devicePixelRatio || 1
    const { clientWidth: w, clientHeight: h } = containerRef.value
    overlay.width = Math.max(1, Math.round(w * dpr))
    overlay.height = Math.max(1, Math.round(h * dpr))
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0) // 그리기는 CSS 픽셀 좌표로
  }

  // ── 상호작용 중에만 rAF 추종 (idle 정지로 반응성·CPU 확보, spec 022 FR-007) ──────
  // 과거엔 상시 rAF 무한루프(60fps redraw)라 아무것도 안 움직여도 CPU 를 계속 먹었다.
  // 이제 컨테이너 mousedown~mouseup(노드드래그·팬) 동안만, 그리고 휠 줌 직후 짧은 구간만
  // 루프를 돌려 NVL 변환을 따라가고, idle 이 되면 루프가 스스로 멈춘다.
  // 버튼 없는 전이(휠 줌)는 NvlGraph 의 onZoom/onPan 이 kick() 으로 잠깐 깨운다.
  function ensureLoop(): void {
    if (rafId) return
    const tick = () => {
      redraw()
      if (interacting || performance.now() < wakeUntil) {
        rafId = requestAnimationFrame(tick)
      } else {
        rafId = 0   // idle → 정지
      }
    }
    rafId = requestAnimationFrame(tick)
  }

  /** 휠 줌/팬 등 짧은 전이를 ms 동안 추종(그 뒤 자동 정지). */
  function kick(ms = 240): void {
    wakeUntil = performance.now() + ms
    ensureLoop()
  }

  function stopLoop(): void {
    if (rafId) cancelAnimationFrame(rafId)
    rafId = 0
  }

  // ── 핵심: 그룹별 영역 그리기 ──────────────────────────────────────────
  function redraw(): void {
    if (!ctx || !overlay || !containerRef.value) return
    const w = containerRef.value.clientWidth
    const h = containerRef.value.clientHeight
    ctx.clearRect(0, 0, w, h)
    drawnGroups = []
    nodeScreens = []

    const nvl = nvlInstance.value
    const cfg = getConfig()
    if (!nvl || !cfg.levels || cfg.levels.length === 0) return

    const scale = nvl.getScale()
    const pan = nvl.getPan()
    const dpr = window.devicePixelRatio || 1
    const cx = w / 2
    const cy = h / 2

    // world → screen(CSS px). NVL mapToRelativePosition 과 동일.
    const toScreen = (wx: number, wy: number): Pt => ({
      x: (wx - pan.x) * scale / dpr + cx,
      y: (wy - pan.y) * scale / dpr + cy,
    })

    // id → world 좌표 (레벨 공통)
    const posById = new Map<string, Pt>()
    for (const p of nvl.getNodePositions()) {
      if (typeof p.x === 'number' && typeof p.y === 'number' && !Number.isNaN(p.x)) {
        posById.set(p.id, { x: p.x, y: p.y })
      }
    }
    const nodes = getNodes()

    // 노드 스크린 좌표+반지름 기록(헐 드래그 시 "노드 위 클릭이면 노드드래그 양보" 판정용).
    for (const node of nodes) {
      const world = posById.get(node.id)
      if (world) {
        const s = toScreen(world.x, world.y)
        nodeScreens.push({ id: node.id, x: s.x, y: s.y, r: (getNodeSize(node.labels || []) / 2) * scale })
      }
    }

    // 바깥 레벨(패키지)부터 안 레벨(파일)까지 순서대로 그린다 → 중첩 헐(원 안의 원).
    // 안 레벨은 바깥 레벨의 부분집합 그룹이라 같은 좌표 기준상 자연히 안쪽에 들어간다.
    for (const level of cfg.levels) {
      const groups = new Map<string, { pts: Pt[]; nodes: GraphNode[] }>()
      for (const node of nodes) {
        const key = level.keyOf(node)
        if (key === null) continue
        const world = posById.get(node.id)
        if (!world) continue
        const screen = toScreen(world.x, world.y)
        const g = groups.get(key)
        if (g) { g.pts.push(screen); g.nodes.push(node) }
        else groups.set(key, { pts: [screen], nodes: [node] })
      }
      // 큰 그룹 먼저 → 작은 그룹이 위에 보이도록
      const minSize = level.minSize ?? 1
      const ordered = [...groups.entries()].sort((a, b) => b[1].pts.length - a[1].pts.length)
      for (const [key, g] of ordered) {
        if (g.nodes.length < minSize) continue   // 1노드 파일 등은 링 생략(도배 방지)
        // ★줌해도 절대 안 삐져나오게: padding = 고정여백(level.padding) + 노드 스크린 반지름.
        // 헐은 노드 중심 기준으로 그려지므로, 노드 원(반지름=size/2·줌비례)을 감싸려면
        // 그 반지름만큼 더 확장해야 한다(줌인하면 노드가 커지니 반지름도 scale 비례로 증가).
        // ★NVL 노드 화면반지름 = (size/2)·scale (dpr 미분할 — 노드 렌더는 CSS px 에서 scale 만 적용).
        //  과거 /dpr 로 나눠 레티나(dpr=2)서 밴드가 노드의 절반이던 버그 제거. 위치(toScreen)는 /dpr 유지.
        let nodeR = 0
        for (const n of g.nodes) {
          const r = (getNodeSize(n.labels || []) / 2) * scale
          if (r > nodeR) nodeR = r
        }
        // 밴드 반폭 R = 고정여백 + 정확반지름×1.08(테두리/링) + 4px(AA 고정안전). 타이트하면서 절대 안삐짐.
        const effPad = level.padding + nodeR * 1.08 + 4
        drawGroup(ctx, g.pts, hashColor(key), level.labelOf(key, g.nodes), effPad, nodeR)
        // hit-test 기록(드래그 대상 = 폴리곤 내부 가장 안쪽 그룹). 안 레벨일수록 배열 뒤 → 역순탐색.
        drawnGroups.push({ pts: g.pts.slice(), padding: effPad, nodeIds: g.nodes.map(n => n.id) })
      }
    }
  }

  /** 점이 한 그룹의 그려진 영역 안인가 — drawGroup(Minkowski 합)과 동일: 헐에서 거리 ≤ R. */
  function pointInGroup(x: number, y: number, g: { pts: Pt[]; padding: number }): boolean {
    const { pts, padding: R } = g
    if (pts.length === 0) return false
    if (pts.length === 1) return (pts[0].x - x) ** 2 + (pts[0].y - y) ** 2 <= R * R
    const hull = pts.length >= 3 ? convexHull(pts) : pts
    if (pts.length >= 3 && pointInPolygon(x, y, hull)) return true
    const edges = pts.length >= 3 ? hull.length : hull.length - 1
    for (let i = 0; i < edges; i++) {
      if (distToSegment({ x, y }, hull[i], hull[(i + 1) % hull.length]) <= R) return true
    }
    return false
  }

  /** 커서가 어떤 헐 내부면 그 그룹 멤버 node ids(가장 안쪽 우선), 아니면 null. */
  function hitTest(x: number, y: number): string[] | null {
    for (let i = drawnGroups.length - 1; i >= 0; i--) {
      if (pointInGroup(x, y, drawnGroups[i])) return drawnGroups[i].nodeIds
    }
    return null
  }

  /** 커서가 노드 위인가 — 노드 드래그에 양보하기 위한 판정. ★줌비례 실반지름 사용(고정28px 폐기). */
  function isNearNode(x: number, y: number): boolean {
    return nodeScreens.some(n => (n.x - x) ** 2 + (n.y - y) ** 2 < (n.r + 6) ** 2)
  }

  /**
   * 그룹 영역 그리기 — ★Minkowski 합 방식(절대 안 삐져나옴).
   * 노드 중심들의 볼록헐(폴리곤)을 **두께 2R 둥근 선**으로 칠하면, 그 영역 = 모든 노드 중심에서
   * 반경 R 이내. R = padding(=고정여백+노드반지름·줌비례)이라 노드 원이 수학적으로 반드시 내부.
   * (과거의 무게중심 방사확장 + 베지어 코너깎임이 길쭉배치·꼭짓점 노드를 밖으로 흘리던 근본결함 제거.)
   */
  function drawGroup(c: CanvasRenderingContext2D, pts: Pt[], color: string, label: string, R: number, nodeR: number): void {
    if (pts.length === 0) return
    // 반투명 채움 — 둥근 굵은선(2R)의 바깥 가장자리가 자연히 크리스프 경계가 된다.
    const fill = hexToRgba(color, 0.16)

    c.save()
    c.lineJoin = 'round'
    c.lineCap = 'round'

    let labelX: number, topCenterY: number

    if (pts.length === 1) {
      const p = pts[0]
      c.beginPath(); c.arc(p.x, p.y, R, 0, Math.PI * 2); c.fillStyle = fill; c.fill()
      labelX = p.x; topCenterY = p.y
    } else {
      const hull = pts.length >= 3 ? convexHull(pts) : pts
      const closed = hull.length >= 3
      const buildPath = () => {
        c.beginPath()
        c.moveTo(hull[0].x, hull[0].y)
        for (let i = 1; i < hull.length; i++) c.lineTo(hull[i].x, hull[i].y)
        if (closed) c.closePath()
      }
      // 채움 밴드(두께 2R 둥근선 = Minkowski 합) + 내부 채움(닫힌 폴리곤 가운데).
      buildPath(); c.strokeStyle = fill; c.lineWidth = 2 * R; c.stroke()
      if (closed) { buildPath(); c.fillStyle = fill; c.fill() }
      labelX = hull.reduce((s, p) => s + p.x, 0) / hull.length
      topCenterY = Math.min(...hull.map(p => p.y))
    }

    c.restore()
    // 라벨 = 영역 맨 위 바깥·가로중앙. 밴드 위(R)에 두되, 극단 줌서 너무 멀어지지 않게 상한(노드 바로 위 수준)으로 캡.
    const labelGap = Math.min(R, nodeR * 1.3 + 26)
    drawLabel(c, labelX, topCenterY - labelGap - 6, label, color)
  }

  function drawLabel(c: CanvasRenderingContext2D, x: number, y: number, text: string, color: string): void {
    c.save()
    // 폰트는 고정 px(줌해도 크기 그대로 = 항상 읽기 좋음). 가독성 위해 14px 볼드 + 진한 알약 + 그림자.
    c.font = '700 14px system-ui, sans-serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    const tw = c.measureText(text).width
    const px = 9
    const ph = 20
    const cy = y - ph / 2
    c.shadowColor = 'rgba(0,0,0,0.45)'
    c.shadowBlur = 6
    c.shadowOffsetY = 1
    c.fillStyle = hexToRgba(color, 0.96)
    roundRect(c, x - tw / 2 - px, cy - ph / 2, tw + px * 2, ph, 9)
    c.fill()
    c.shadowColor = 'transparent'
    c.fillStyle = '#ffffff'
    c.fillText(text, x, cy + 0.5)
    c.restore()
  }

  function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    const rr = Math.min(r, h / 2, w / 2)
    c.beginPath()
    c.moveTo(x + rr, y)
    c.arcTo(x + w, y, x + w, y + h, rr)
    c.arcTo(x + w, y + h, x, y + h, rr)
    c.arcTo(x, y + h, x, y, rr)
    c.arcTo(x, y, x + w, y, rr)
    c.closePath()
  }

  return { attach, detach, redraw, kick, sizeCanvas, hitTest, isNearNode }
}
