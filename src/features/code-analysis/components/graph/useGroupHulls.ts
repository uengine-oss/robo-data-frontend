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
import type { GraphNode, GraphLink } from '@/shared/types'
import { getNodeSize, getRelationshipColor } from '@/shared/config/graphStyles'

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
  /**
   * 오버레이에 직접 그릴 관계(spec 022) — 클러스터 보기는 R/W 등 실엣지를 NVL force 에서 빼고
   * (그래야 앵커로 군집 분리) 여기서 그린다. 비클러스터 보기는 NVL 이 그리므로 빈 배열.
   */
  getEdges: () => GraphLink[] = () => [],
  /**
   * 그룹 앵커(spec 022) — {id, key(=헐 그룹키와 일치), label, size}. 앵커를 ①헐 영역의 일원으로
   * 포함(움직이면 헐이 따라 확장) ②그룹 이름을 **고정크기 칩**으로 그린다(줌해도 안 커짐).
   */
  getAnchors: () => Array<{ id: string; key: string; label: string; size: number }> = () => [],
) {
  let overlay: HTMLCanvasElement | null = null
  let ctx: CanvasRenderingContext2D | null = null
  let resizeObserver: ResizeObserver | null = null
  let rafId = 0
  let interacting = false   // 컨테이너에 마우스 버튼이 눌린 동안(노드드래그/팬) = true
  let wakeUntil = 0         // 휠 줌 등 버튼 없는 전이를 잠깐 추종하는 마감 시각(ms)
  let downHandler: ((e: MouseEvent) => void) | null = null
  let upHandler: (() => void) | null = null
  // 헐 합성용 오프스크린 버퍼 — 헐을 솔리드로 그린 뒤 한 번에 반투명 합성해 밴드/채움 겹침으로
  // 안쪽에 진한 윤곽선이 생기는 걸 없앤다(균일 투명도).
  let buffer: HTMLCanvasElement | null = null
  let bctx: CanvasRenderingContext2D | null = null
  const HULL_ALPHA = 0.18

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
    buffer = document.createElement('canvas')
    bctx = buffer.getContext('2d')

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
    buffer = null
    bctx = null
  }

  function sizeCanvas(): void {
    if (!overlay || !containerRef.value) return
    const dpr = window.devicePixelRatio || 1
    const { clientWidth: w, clientHeight: h } = containerRef.value
    const pw = Math.max(1, Math.round(w * dpr)), ph = Math.max(1, Math.round(h * dpr))
    overlay.width = pw; overlay.height = ph
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0) // 그리기는 CSS 픽셀 좌표로
    if (buffer) { buffer.width = pw; buffer.height = ph }
    bctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
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

    // 클러스터 보기 실엣지(R/W·CALL 등) — NVL force 에서 뺀 관계를 직접 그린다. 노드 테두리~테두리로
    // 트림해 노드 면을 안 가리고, 타입색으로 종류를 구분(READS/WRITES 다른 색). 화살표로 방향 표시.
    const edges = getEdges()
    if (edges.length) {
      const radById = new Map<string, number>()
      for (const n of nodes) radById.set(n.id, (getNodeSize(n.labels || []) / 2) * scale)
      // 노드 테두리에서 GAP 만큼 떨어뜨려(찌름 방지) 선·화살표를 그리고, 중간에 타입 글자.
      const GAP = 8
      const labels: Array<{ x: number; y: number; text: string; col: string }> = []
      ctx.save()
      ctx.lineWidth = 1.4
      ctx.lineCap = 'round'
      for (const e of edges) {
        const a = posById.get(e.source), b = posById.get(e.target)
        if (!a || !b) continue
        const sa = toScreen(a.x, a.y), sb = toScreen(b.x, b.y)
        const dx = sb.x - sa.x, dy = sb.y - sa.y
        const len = Math.hypot(dx, dy) || 1
        const ux = dx / len, uy = dy / len
        const rs = (radById.get(e.source) || 0) + GAP
        const rt = (radById.get(e.target) || 0) + GAP
        if (len <= rs + rt + 4) continue   // 두 노드가 너무 가까우면 선 생략(찌름·뭉개짐 방지)
        const x1 = sa.x + ux * rs, y1 = sa.y + uy * rs
        const x2 = sb.x - ux * rt, y2 = sb.y - uy * rt
        const col = getRelationshipColor(e.type)
        ctx.globalAlpha = 0.5
        ctx.strokeStyle = col
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
        // 화살촉(방향) — 타깃 노드 앞에서 멈춤
        const ah = 7
        ctx.globalAlpha = 0.7
        ctx.fillStyle = col
        ctx.beginPath()
        ctx.moveTo(x2, y2)
        ctx.lineTo(x2 - ux * ah - uy * ah * 0.55, y2 - uy * ah + ux * ah * 0.55)
        ctx.lineTo(x2 - ux * ah + uy * ah * 0.55, y2 - uy * ah - ux * ah * 0.55)
        ctx.closePath(); ctx.fill()
        labels.push({ x: (x1 + x2) / 2, y: (y1 + y2) / 2, text: e.type, col })
      }
      // 관계 타입 글자(중간점, 고정 11px) — 선 위에 또렷하게.
      ctx.globalAlpha = 1
      ctx.font = '600 11px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      for (const l of labels) {
        ctx.lineWidth = 3
        ctx.strokeStyle = 'rgba(18,18,24,0.85)'   // 어두운 외곽선으로 가독성
        ctx.strokeText(l.text, l.x, l.y)
        ctx.fillStyle = l.col
        ctx.fillText(l.text, l.x, l.y)
      }
      ctx.restore()
    }

    // 헐 도형은 **버퍼에 솔리드로** 그린 뒤 한 번에 반투명 합성한다 → 밴드(2R)+내부채움이 가장자리에서
    // 겹쳐 안쪽에 진한 윤곽선이 생기던 부작용 제거(균일 투명도). 라벨은 합성 뒤 또렷하게 위에.
    if (!bctx || !buffer) return
    const anchors = getAnchors()
    const anchorByKey = new Map(anchors.map(a => [a.key, a]))

    bctx.clearRect(0, 0, w, h)
    bctx.save(); bctx.lineJoin = 'round'; bctx.lineCap = 'round'
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
        // ★줌해도 절대 안 삐져나오게: padding = 고정여백 + 노드 스크린 반지름((size/2)·scale, dpr 미분할).
        let nodeR = 0
        for (const n of g.nodes) {
          const r = (getNodeSize(n.labels || []) / 2) * scale
          if (r > nodeR) nodeR = r
        }
        // 앵커도 이 영역의 일원 — 헐 점에 포함(움직이면 헐이 따라 확장) + 반지름도 밴드에 반영.
        const anc = anchorByKey.get(key)
        if (anc) {
          const ap = posById.get(anc.id)
          if (ap) { g.pts.push(toScreen(ap.x, ap.y)); nodeR = Math.max(nodeR, (anc.size / 2) * scale) }
        }
        drawHullShape(bctx, g.pts, hashColor(key), level.padding + nodeR * 1.08 + 4)
      }
    }
    bctx.restore()
    ctx.save(); ctx.globalAlpha = HULL_ALPHA; ctx.drawImage(buffer, 0, 0, w, h); ctx.restore()

    // 그룹 이름 칩 = **앵커 노드 바로 위**(모든 군집 일관). 앵커가 곧 대표라 이름이 앵커에 붙는다.
    for (const a of anchors) {
      if (!a.label) continue
      const ap = posById.get(a.id)
      if (!ap) continue
      const s = toScreen(ap.x, ap.y)
      drawChip(ctx, s.x, s.y - (a.size / 2) * scale - 16, a.label)
    }
  }

  /**
   * 그룹 영역 도형(★Minkowski 합 — 절대 안 삐져나옴)을 **솔리드로** 그린다. 노드 중심 볼록헐을
   * 두께 2R 둥근선 + 내부채움으로 칠하면 영역 = 모든 노드 중심에서 반경 R 이내. 투명도는 호출측이
   * 버퍼 합성에서 한 번에 입혀 균일하게 한다. 라벨 앵커(맨위 가로중앙)를 반환.
   */
  function drawHullShape(c: CanvasRenderingContext2D, pts: Pt[], color: string, R: number): { labelX: number; topY: number } {
    c.fillStyle = color
    c.strokeStyle = color
    if (pts.length === 1) {
      const p = pts[0]
      c.beginPath(); c.arc(p.x, p.y, R, 0, Math.PI * 2); c.fill()
      return { labelX: p.x, topY: p.y }
    }
    const hull = pts.length >= 3 ? convexHull(pts) : pts
    const closed = hull.length >= 3
    const buildPath = () => {
      c.beginPath()
      c.moveTo(hull[0].x, hull[0].y)
      for (let i = 1; i < hull.length; i++) c.lineTo(hull[i].x, hull[i].y)
      if (closed) c.closePath()
    }
    buildPath(); c.lineWidth = 2 * R; c.stroke()
    if (closed) { buildPath(); c.fill() }
    return { labelX: hull.reduce((s, p) => s + p.x, 0) / hull.length, topY: Math.min(...hull.map(p => p.y)) }
  }

  /**
   * 그룹 이름 칩(spec 022) — 줌 무관 **고정 14px**, 다크 글래스 알약 + 옅은 테두리 + 부드러운 그림자.
   * (x, y) 를 칩 중심으로. 과거 진한 색 알약보다 가독성·세련도↑.
   */
  function drawChip(c: CanvasRenderingContext2D, x: number, y: number, text: string): void {
    c.save()
    c.font = '600 14px -apple-system, system-ui, "Segoe UI", sans-serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    const tw = c.measureText(text).width
    const padX = 11, h = 24
    const w = tw + padX * 2
    const left = x - w / 2, top = y - h / 2
    c.shadowColor = 'rgba(0,0,0,0.38)'
    c.shadowBlur = 10
    c.shadowOffsetY = 2
    c.fillStyle = 'rgba(26,28,36,0.9)'   // 다크 글래스
    roundRect(c, left, top, w, h, h / 2)
    c.fill()
    c.shadowColor = 'transparent'
    c.lineWidth = 1
    c.strokeStyle = 'rgba(255,255,255,0.14)'
    roundRect(c, left, top, w, h, h / 2)
    c.stroke()
    c.fillStyle = '#eef0f3'
    c.fillText(text, x, y + 0.5)
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

  return { attach, detach, redraw, kick, sizeCanvas }
}
