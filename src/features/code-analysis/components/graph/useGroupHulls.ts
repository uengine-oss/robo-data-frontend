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

// ============================================================================
// 타입
// ============================================================================

export interface GroupHullConfig {
  /**
   * 그룹 기준.
   *  - 'label'        → 노드의 대표 라벨(labels 마지막 의미 라벨)로 묶음
   *  - 그 외 문자열   → properties[key] 값으로 묶음 (기본 'component_id')
   *  - null           → 영역 표시 끔
   */
  groupBy: string | null
  /** 영역 바깥 여백(px, 스크린 기준). 기본 30 */
  padding?: number
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

/** 무게중심(단순 평균 — 항상 유한)에서 바깥으로 padding 만큼 밀어 여백을 준다. */
function expandFromCentroid(hull: Pt[], padding: number): Pt[] {
  const c = hull.reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y }), { x: 0, y: 0 })
  c.x /= hull.length
  c.y /= hull.length
  return hull.map(p => {
    const dx = p.x - c.x
    const dy = p.y - c.y
    const len = Math.hypot(dx, dy) || 1
    return { x: p.x + (dx / len) * padding, y: p.y + (dy / len) * padding }
  })
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

  // 노드 → 그룹 키
  function groupKeyOf(node: GraphNode, groupBy: string): string | null {
    if (groupBy === 'label') {
      const labels = node.labels || []
      const named = [...labels].reverse().find(l => l && l !== '_Placeholder')
      return named ?? null
    }
    const v = node.properties?.[groupBy]
    if (v === undefined || v === null || v === '') return null
    return String(v)
  }

  /** 그룹 라벨 텍스트 — component_id면 component_name, file_path면 파일명(basename). */
  function groupLabelOf(groupBy: string, key: string, nodes: GraphNode[]): string {
    if (groupBy === 'component_id') {
      const named = nodes.find(n => n.properties?.component_name)?.properties?.component_name
      if (named) return String(named)
    }
    if (groupBy === 'file_path') {
      return key.replace(/\\/g, '/').split('/').filter(Boolean).pop() || key
    }
    return key
  }

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

    startLoop()
  }

  function detach(): void {
    stopLoop()
    const host = containerRef.value
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

  // ── 상시 rAF 추종 (reference.html 프로토타입 동일 기법) ───────────────
  // NVL 변환을 매 프레임 미러링 → 팬·줌·드래그·forceDirected 정착 중 어떤 위치 변화든
  // 항상 따라간다(이벤트 트리거 누락에 의한 desync 0). groupBy 없으면 redraw 가 즉시
  // 클리어 후 반환이라 비용 미미.
  function startLoop(): void {
    if (rafId) return
    const tick = () => {
      redraw()
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
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

    const nvl = nvlInstance.value
    const cfg = getConfig()
    if (!nvl || !cfg.groupBy) return

    const padding = cfg.padding ?? 30
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

    // id → world 좌표
    const posById = new Map<string, Pt>()
    for (const p of nvl.getNodePositions()) {
      if (typeof p.x === 'number' && typeof p.y === 'number' && !Number.isNaN(p.x)) {
        posById.set(p.id, { x: p.x, y: p.y })
      }
    }

    // 그룹 키 → { 스크린 점들, 원본 노드들 }
    const groups = new Map<string, { pts: Pt[]; nodes: GraphNode[] }>()
    for (const node of getNodes()) {
      const key = groupKeyOf(node, cfg.groupBy)
      if (key === null) continue
      const world = posById.get(node.id)
      if (!world) continue
      const screen = toScreen(world.x, world.y)
      const g = groups.get(key)
      if (g) { g.pts.push(screen); g.nodes.push(node) }
      else groups.set(key, { pts: [screen], nodes: [node] })
    }

    // 큰 그룹 먼저 → 작은 그룹이 위에 보이도록
    const ordered = [...groups.entries()].sort((a, b) => b[1].pts.length - a[1].pts.length)
    for (const [key, g] of ordered) {
      const color = hashColor(key)
      const label = groupLabelOf(cfg.groupBy, key, g.nodes)
      drawGroup(ctx, g.pts, color, label, padding)
    }
  }

  function drawGroup(c: CanvasRenderingContext2D, pts: Pt[], color: string, label: string, padding: number): void {
    if (pts.length === 0) return
    const fill = hexToRgba(color, 0.13)
    const stroke = hexToRgba(color, 0.85)

    c.save()
    c.lineJoin = 'round'
    c.lineWidth = 2

    let anchor: Pt
    if (pts.length === 1) {
      const p = pts[0]
      c.beginPath()
      c.arc(p.x, p.y, padding + 18, 0, Math.PI * 2)
      c.fillStyle = fill
      c.fill()
      c.strokeStyle = stroke
      c.stroke()
      anchor = { x: p.x, y: p.y - (padding + 18) }
    } else if (pts.length === 2) {
      // 캡슐: 굵은 둥근 선으로 두 점을 감싼다
      c.beginPath()
      c.moveTo(pts[0].x, pts[0].y)
      c.lineTo(pts[1].x, pts[1].y)
      c.strokeStyle = fill
      c.lineCap = 'round'
      c.lineWidth = (padding + 14) * 2
      c.stroke()
      c.beginPath()
      c.moveTo(pts[0].x, pts[0].y)
      c.lineTo(pts[1].x, pts[1].y)
      c.strokeStyle = stroke
      c.lineWidth = 2
      c.stroke()
      anchor = { x: (pts[0].x + pts[1].x) / 2, y: Math.min(pts[0].y, pts[1].y) - (padding + 14) }
    } else {
      const hull = expandFromCentroid(convexHull(pts), padding)
      const n = hull.length
      const mid = (a: Pt, b: Pt) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
      // 변(중점)을 지나며 정점을 제어점으로 → 둥근 blob
      c.beginPath()
      const start = mid(hull[n - 1], hull[0])
      c.moveTo(start.x, start.y)
      for (let i = 0; i < n; i++) {
        const cur = hull[i]
        const m = mid(cur, hull[(i + 1) % n])
        c.quadraticCurveTo(cur.x, cur.y, m.x, m.y)
      }
      c.closePath()
      c.fillStyle = fill
      c.fill()
      c.strokeStyle = stroke
      c.stroke()
      const top = hull.reduce((t, p) => (p.y < t.y ? p : t), hull[0])
      anchor = { x: top.x, y: top.y - 4 }
    }

    drawLabel(c, anchor.x, anchor.y, label, color)
    c.restore()
  }

  function drawLabel(c: CanvasRenderingContext2D, x: number, y: number, text: string, color: string): void {
    c.save()
    c.font = '600 12px system-ui, sans-serif'
    c.textAlign = 'center'
    c.textBaseline = 'bottom'
    const tw = c.measureText(text).width
    const px = 8
    const ph = 16
    c.fillStyle = hexToRgba(color, 0.92)
    roundRect(c, x - tw / 2 - px, y - ph, tw + px * 2, ph, 8)
    c.fill()
    c.fillStyle = '#ffffff'
    c.fillText(text, x, y - 2)
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

  return { attach, detach, redraw, sizeCanvas }
}
