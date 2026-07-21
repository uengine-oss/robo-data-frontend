/**
 * graphStyles.ts
 * Neo4j Graph 스타일 설정
 * 
 * 노드 및 관계의 색상, 크기 등 시각적 스타일 정의
 * 
 * NOTE: 추후 노드/관계 스타일을 사용자가 커스터마이징할 수 있는
 * UI를 제공할 예정이며, 해당 설정은 로컬 스토리지에 캐싱됩니다.
 */

// ============================================================================
// 관계 색상 설정
// ============================================================================

/**
 * 관계 타입별 색상
 */
export const RELATIONSHIP_COLORS: Record<string, string> = {
  HAS_MEMBER: '#9CA3AB',
  LINKS_TO: '#9CA3AB',
  PARENT_OF: '#9CA3AB',
  NEXT: '#9CA3AB',
  FROM: '#9CA3AB',
  HAS_COLUMN: '#9CA3AB',
  DB_LINK: '#9CA3AB',
  FK_TO_TABLE: '#9CA3AB',
  FK_TO_COLUMN: '#9CA3AB',
  SCOPE: '#9CA3AB',
  EXTENDS: '#9CA3AB',
  IMPLEMENTS: '#9CA3AB',
  BELONGS_TO: '#9CA3AB',
  DECLARES: '#9CA3AB',
  HAS_AC: '#9CA3AB',
  HAS_USER_STORY: '#9CA3AB',
  VIRTUAL_USES: '#8B5CF6',
  DEFAULT: '#9CA3AB'
}

/**
 * 결합 관계 3종의 색 (spec 059) — **색상 = 관계 종류**, **진하기 = 영역을 넘는지**.
 *
 * 위험 순서는 남의 데이터에 `쓰기` > `읽기` > `호출`이다. 따뜻한 색이 데이터를 만지는 것,
 * 차가운 색이 정상적인 기능 호출이라 의미 그룹과 색 그룹이 일치한다.
 * 노랑을 쓰지 않는 이유: 어두운 배경에서 가장 튀어 "가장 안전한 것"이 먼저 눈에 들어오고,
 * 주황(읽기)과 인접해 구분이 어렵다.
 *
 * 영역 안의 관계는 회색으로 뭉개지 않고 **같은 색상의 저채도**로 낮춘다 — 가독성을 지키면서
 * 눈이 진한 선(영역을 넘는 것)부터 보게 한다.
 */
export const RELATION_KIND_COLORS: Record<string, { crossing: string; inside: string }> = {
  WRITES: { crossing: '#E5484D', inside: '#8C4A4C' },
  READS: { crossing: '#F5A524', inside: '#8A6636' },
  CALLS: { crossing: '#4EA8DE', inside: '#3F6B8A' },
}

/**
 * 관계 종류의 화면 표시명 (spec 059). 선 위 캡션에 쓴다.
 * 색약(남성 약 8%)에서 빨강·주황이 붙어 보일 수 있어 글자가 이중 부호화 역할을 한다.
 * 표에 없는 타입은 원래 이름을 그대로 쓴다 — 모르는 타입이 조용히 사라지지 않게.
 */
const RELATIONSHIP_DISPLAY_NAMES: Record<string, string> = {
  WRITES: '쓰기',
  READS: '읽기',
  CALLS: '호출',
}

export function getRelationshipDisplayName(type: string): string {
  return RELATIONSHIP_DISPLAY_NAMES[type.toUpperCase()] ?? type
}

// ============================================================================
// 관계 두께 설정
// ============================================================================

/**
 * 관계 타입별 두께 (기본값)
 */
export const RELATIONSHIP_WIDTHS: Record<string, number> = {
  VIRTUAL_USES: 3,
  DEFAULT: 2
}

// ============================================================================
// 노드 크기 설정
// ============================================================================

/**
 * 노드 타입별 크기
 */
export const NODE_SIZES: Record<string, number> = {
  SYSTEM: 45,
  FILE: 35,
  PROCEDURE: 40,
  FUNCTION: 40,
  METHOD: 40,
  MODULE: 40,
  Table: 38,
  CLASS: 40,
  Class: 40,
  INTERFACE: 38,
  Interface: 38,
  STRUCT: 38,
  ENUM: 35,
  Enum: 35,
  DEFAULT: 30
}

// ============================================================================
// 유틸리티 함수
// ============================================================================

import { getNodeStyle, getRelationshipStyle } from '@/shared/utils/graphStyleStorage'
import { kindOf } from '@/shared/utils/nodeLabels'

/**
 * 라벨별 결정적 distinct 색 (spec 018) — golden-angle(137.508°) hue 분산으로
 * 라벨이 20종+ 여도 인접/유사색 충돌을 최소화. 같은 라벨 → 항상 같은 색(재현성).
 * 어두운 배경 대비 위해 채도/명도 고정.
 */
/**
 * 관계 3종 색이 차지한 hue 구역 (spec 059). 노드 자동 배색은 여기를 피한다 —
 * 노드가 관계와 같은 색을 쓰면 "빨강 = 위험"이라는 규칙이 깨진다.
 * 각 관계색(쓰기 358° · 읽기 38° · 호출 203°)의 좌우 15°를 잡는다.
 */
const RESERVED_HUE_BANDS: ReadonlyArray<readonly [number, number]> = [
  [338, 378],   // 쓰기 358° ±20 — 360 을 넘어가므로 아래에서 잘라 정규화한다
  [18, 58],     // 읽기 38° ±20
  [183, 223],   // 호출 203° ±20
]

/** 예약 구역을 뺀 사용 가능한 hue 구간들. 모듈 로드 시 한 번만 만든다. */
const ALLOWED_HUE_SEGMENTS: ReadonlyArray<readonly [number, number]> = (() => {
  const blocked: Array<[number, number]> = []
  for (const [start, end] of RESERVED_HUE_BANDS) {
    if (end <= 360) blocked.push([start, end])
    else { blocked.push([start, 360]); blocked.push([0, end - 360]) }
  }
  blocked.sort((a, b) => a[0] - b[0])
  const allowed: Array<[number, number]> = []
  let cursor = 0
  for (const [start, end] of blocked) {
    if (start > cursor) allowed.push([cursor, start])
    cursor = Math.max(cursor, end)
  }
  if (cursor < 360) allowed.push([cursor, 360])
  return allowed
})()

const ALLOWED_HUE_TOTAL = ALLOWED_HUE_SEGMENTS.reduce((sum, [s, e]) => sum + (e - s), 0)

/** 예약 구역을 건너뛴 hue. 입력은 0 이상 ALLOWED_HUE_TOTAL 미만. */
function hueSkippingReserved(offset: number): number {
  let remaining = offset
  for (const [start, end] of ALLOWED_HUE_SEGMENTS) {
    const width = end - start
    if (remaining < width) return start + remaining
    remaining -= width
  }
  return ALLOWED_HUE_SEGMENTS[ALLOWED_HUE_SEGMENTS.length - 1][1] - 1
}

/**
 * 라벨 → 색 배정기 (spec 059).
 *
 * 예전 방식(문자열 해시 → hue)은 **라벨끼리 색이 겹쳤다.** golden-angle 분산은 순번으로 배정할 때만
 * 분리가 보장되는데 임의 문자열 해시는 가까운 값을 뽑을 수 있어, 실화면에서 FUNCTION·TABLE·FILE 이
 * 거의 같은 초록으로 나왔다.
 *
 * 그래서 **슬롯을 순서대로 소진**한다:
 *  - 사용 가능한 hue 구간(관계색 예약 제외)을 golden-angle 순서로 미리 늘어놓고,
 *  - 라벨이 처음 등장할 때 다음 슬롯을 준다. 한 번 준 색은 **절대 바뀌지 않는다**(append-only).
 *  - 슬롯을 다 쓰면 명도 단계를 한 칸 내려 같은 hue 순서를 다시 돈다 → 두 축이 동시에 같아야만
 *    겹치므로 실질적으로 겹치지 않는다.
 *
 * 배정 순서를 재현 가능하게 하려면 소비처가 `registerLabelColors(전체 라벨)` 로 한 번에 등록한다.
 * 등록하지 않아도 동작하지만 그때는 화면에서 처음 만난 순서가 배정 순서가 된다.
 */
const HUE_SLOT_COUNT = 24
const LIGHTNESS_TIERS = [58, 48, 68]

/** golden-angle 순서로 늘어놓은 hue 슬롯 — 인접 순번끼리 가장 멀다. */
const HUE_SLOTS: readonly number[] = (() => {
  const step = ALLOWED_HUE_TOTAL / HUE_SLOT_COUNT
  const out: number[] = []
  for (let i = 0; i < HUE_SLOT_COUNT; i++) {
    out.push(hueSkippingReserved(((i * 137.508) % HUE_SLOT_COUNT) * step))
  }
  return out
})()

const assignedColors = new Map<string, string>()

function nextColor(): string {
  const index = assignedColors.size
  const hue = Math.floor(HUE_SLOTS[index % HUE_SLOT_COUNT])
  const light = LIGHTNESS_TIERS[Math.floor(index / HUE_SLOT_COUNT) % LIGHTNESS_TIERS.length]
  return hslToHex(hue, 62, light)
}

/**
 * 화면에 나타날 라벨을 한 번에 등록해 배정 순서를 고정한다(재현성).
 * 이미 색을 받은 라벨은 건드리지 않는다 — 스트리밍 중 라벨이 늘어도 기존 색은 그대로다.
 */
export function registerLabelColors(labels: readonly string[]): void {
  for (const label of [...labels].sort()) {
    const key = label || 'DEFAULT'
    if (!assignedColors.has(key)) assignedColors.set(key, nextColor())
  }
}

export function distinctColorForLabel(label: string): string {
  const key = label || 'DEFAULT'
  const existing = assignedColors.get(key)
  if (existing) return existing
  const color = nextColor()
  assignedColors.set(key, color)
  return color
}

/** HSL → #rrggbb. NVL/canvas 가 공통으로 읽는 포맷. */
function hslToHex(h: number, s: number, l: number): string {
  const sf = s / 100
  const lf = l / 100
  const a = sf * Math.min(lf, 1 - lf)
  const f = (n: number): string => {
    const k = (n + h / 30) % 12
    const c = lf - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(255 * c).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

export function getNodeColor(labels: string[]): string {
  // 색 기준 = 노드의 종류(labels[0], spec 033 위치 계약). stereotype 라벨(labels[1:])은
  // 색에 영향 없음 — "노드 1개 = 종류색 1개". 사용자가 종류/역할 어느 라벨에 색을 줬으면 그걸 우선.
  const kind = kindOf(labels)

  // 1. 사용자 커스텀 설정 우선 (그래프 스타일 패널에서 지정한 색). 종류 먼저, 그다음 나머지 라벨.
  try {
    for (const label of [kind, ...labels]) {
      const style = getNodeStyle(label)
      if (style?.color) return style.color
      const upperStyle = getNodeStyle(label.toUpperCase())
      if (upperStyle?.color) return upperStyle.color
    }
  } catch (e) {
    // graphStyleStorage 없으면 기본 로직
  }

  // 종류별 고유색(기본값). 캔버스·노드패널 배지 동일 소스.
  return distinctColorForLabel(kind === 'Unknown' ? 'DEFAULT' : kind)
}

/**
 * 관계 타입에 따른 색상 반환.
 * 사용자 설정 > 결합 3종(2축) > 타입 매칭 > 기본값 순서.
 *
 * @param crossesArea 이 관계가 영역을 넘는가(spec 059). 영역을 아는 곳(캔버스 렌더·교차엣지
 *   오버레이)만 넘긴다. 범례·통계·스타일 패널처럼 타입만 아는 곳은 기본값(대표색=영역을 넘는 쪽)을
 *   그대로 쓴다 — 기존 호출부를 깨지 않으면서 같은 색 체계를 공유한다.
 */
export function getRelationshipColor(type: string, crossesArea = true): string {
  try {
    const style = getRelationshipStyle(type)
    if (style?.color) return style.color
  } catch (e) {
    // graphStyleStorage가 없으면 기본 로직 사용
  }
  const kind = RELATION_KIND_COLORS[type.toUpperCase()]
  if (kind) return crossesArea ? kind.crossing : kind.inside
  return RELATIONSHIP_COLORS[type] || RELATIONSHIP_COLORS.DEFAULT
}

/**
 * 관계 타입에 따른 두께 반환
 * 사용자 설정 > 타입 매칭 > 기본값 순서로 반환
 */
export function getRelationshipWidth(type: string): number {
  try {
    const style = getRelationshipStyle(type)
    if (style?.size) return style.size
  } catch (e) {
    // graphStyleStorage가 없으면 기본 로직 사용
  }
  return RELATIONSHIP_WIDTHS[type] || RELATIONSHIP_WIDTHS.DEFAULT
}

/**
 * 노드 라벨에 따른 크기 반환
 * 사용자 설정 > 라벨 매칭 > 기본값 순서로 반환
 */
export function getNodeSize(labels: string[]): number {
  // 1. 사용자 커스텀 설정 확인 (종류 먼저, 그다음 나머지 라벨)
  try {
    for (const label of [kindOf(labels), ...labels]) {
      const style = getNodeStyle(label)
      if (style?.size) return style.size
      const upperStyle = getNodeStyle(label.toUpperCase())
      if (upperStyle?.size) return upperStyle.size
    }
  } catch (e) {
    // graphStyleStorage 없으면 기본 로직
  }

  // 2. 명시 크기 매핑 — labels[0]=antlr type 이라 NODE_SIZES 에 정의된 종류는 그 크기 사용.
  for (const label of labels) {
    const up = label.toUpperCase()
    if (NODE_SIZES[label]) return NODE_SIZES[label]
    if (NODE_SIZES[up]) return NODE_SIZES[up]
    if (up === 'TABLE') return NODE_SIZES.Table
  }

  return NODE_SIZES.DEFAULT
}
