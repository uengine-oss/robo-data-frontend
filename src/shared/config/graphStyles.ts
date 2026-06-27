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
  CALLS: '#9CA3AB',
  FROM: '#9CA3AB',
  WRITES: '#9CA3AB',
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
export function distinctColorForLabel(label: string): string {
  const s = label || 'DEFAULT'
  // 두 독립 해시 → hue(색상환) + lightness(명도). 서로 다른 라벨이 색을 공유하려면
  // 두 차원이 동시에 충돌해야 해 사실상 불가능 — "모든 라벨 고유색"을 기본값으로 보장.
  // 무상태(해시) — 같은 라벨은 항상 같은 색(재현성), 스트림 중 라벨이 늘어도 기존 색 불변.
  let h1 = 0
  let h2 = 0
  for (let i = 0; i < s.length; i++) {
    h1 = (h1 * 31 + s.charCodeAt(i)) >>> 0
    h2 = (h2 * 131 + s.charCodeAt(i) * 7) >>> 0
  }
  const hue = Math.round((h1 * 137.508) % 360)   // golden-angle 분산 = 인접 라벨도 색 멀어짐
  const light = 50 + (h2 % 18)                    // 50~67% — 어두운 배경 대비 유지 + 변별 차원
  // ★ hex 로 반환 — NVL 색상 파서(color-string get.rgb)는 hsl() 문자열을 못 읽어 null→크래시.
  //   hue/명도 알고리즘은 불변, 출력 포맷만 hex 로(NVL·캔버스 배지 모두 안전).
  return hslToHex(hue, 62, light)
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
 * 관계 타입에 따른 색상 반환
 * 사용자 설정 > 타입 매칭 > 기본값 순서로 반환
 */
export function getRelationshipColor(type: string): string {
  try {
    const style = getRelationshipStyle(type)
    if (style?.color) return style.color
  } catch (e) {
    // graphStyleStorage가 없으면 기본 로직 사용
  }
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
