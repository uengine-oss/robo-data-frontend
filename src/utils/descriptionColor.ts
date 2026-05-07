/**
 * descriptionColor.ts
 * 테이블/컬럼 설명의 출처(source) 별 색상/라벨.
 *
 * 동일 매핑이 여러 컴포넌트에 복붙되어있던 것을 단일 소스로 통합.
 * 출처 색은 범례와 일치해야 한다.
 */

/** 출처 → 색상 (배지/텍스트 색에 동시 사용). procedure 와 code 는 동일 의미. */
const SOURCE_COLORS: Record<string, string> = {
  procedure: '#38bdf8', // 하늘색 — 코드 분석
  code: '#38bdf8',      // 하늘색 — 코드 분석 (procedure alias)
  ddl: '#22c55e',       // 초록색 — DDL 추출
  user: '#f59e0b',      // 주황색 — 사용자 입력
}

/** 출처 → 표시 라벨 */
const SOURCE_LABELS: Record<string, string> = {
  ddl: 'DDL',
  procedure: '코드 분석',
  code: '코드 분석',
  user: '사용자',
}

/** 출처 미상/미매핑 시의 기본 텍스트 색 */
export const DESCRIPTION_DEFAULT_COLOR = '#c1c2c5'

export function getDescriptionColor(source?: string): string {
  if (!source) return DESCRIPTION_DEFAULT_COLOR
  return SOURCE_COLORS[source] ?? DESCRIPTION_DEFAULT_COLOR
}

export function getDescriptionSourceLabel(source?: string): string {
  if (!source) return ''
  return SOURCE_LABELS[source] ?? ''
}
