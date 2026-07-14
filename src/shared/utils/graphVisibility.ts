/**
 * graphVisibility.ts
 * 그래프 "기본 숨김" 단일 정의 (single source of truth).
 *
 * 노드/링크는 nodeMap·linkMap 한 곳에 **날것 그대로 전부** 저장하고, 무엇을 가릴지는
 * 오직 표시 단계에서 이 정의로 판단한다. 모든 표시 소비처(analyzer graphData·canvas
 * canvasGraphData)가 이 하나를 공유 → 정의가 흩어져 생기던 불일치 제거.
 *
 * 시스템 노드는 항상 제외한다. "숨김 요소 표시"(showHidden)는 사용자 그래프의 기본
 * 숨김만 해제하며 시스템 노드에는 영향을 주지 않는다.
 */
import type { GraphNode } from '@/shared/types'

/** 검색·분석 런타임 전용 저장 노드 — UI에 어떤 경우에도 노출하지 않는다. */
export const SYSTEM_NODE_LABELS: ReadonlySet<string> = new Set([
  'GLOSSARY', 'EMBED_META',
])

/**
 * 화면 기본 숨김 노드 라벨.
 *
 * 지원 전략의 "보이지 않아야 하는 타입"만 명시한다. 여기에 없는 새 언어/전략 타입은
 * 기본 표시해 조용히 사라지지 않게 한다. summary는 스트리밍 후반에 채워지는 분석 결과라
 * 표시 정책에 사용하지 않는다.
 */
export const HIDDEN_NODE_LABELS: ReadonlySet<string> = new Set([
  // 분석 대상 내부에 정의가 없는 외부 참조 stub.
  'EXTERNAL',
  // 변수·상수 선언 — 상세 패널/전체 보기에서 확인.
  'VARIABLE', 'CONSTANT', 'GLOBAL_VARIABLE', 'DEFINE',
  'FIELD', 'MEMBER', 'PARAMETER', 'PACKAGE_VARIABLE', 'CURSOR_VARIABLE', 'CONSTANT_FIELD',
  // 자료형 구조 — 전체 보기에서 확인.
  'STRUCT', 'UNION', 'ENUM', 'DATA_TYPE',
  // Example Mapping 메타.
  'RULE', 'EXAMPLE', 'QUESTION',
])

/**
 * 화면 기본 숨김 관계 타입.
 * - 메타·문서성 (HAS_RULE/EXAMPLE/QUESTION) — 노드패널 보고서로만 표시.
 * - 정렬/추적용 (NEXT, BRANCH) — 호출 흐름 아님, 그래프 어지럽힘.
 * - 코드 참조 보조 (REFERENCES, INIT_BY, AFFECTS_TABLE) — 의미 모호 + 양 많음.
 */
export const HIDDEN_LINK_TYPES: ReadonlySet<string> = new Set([
  'NEXT', 'REFERENCES', 'INIT_BY',
  'HAS_RULE', 'HAS_EXAMPLE', 'HAS_QUESTION',
  'AFFECTS_TABLE', 'BRANCH',
])

export function isNodeHidden(node: GraphNode): boolean {
  return (node.labels || []).some(l => HIDDEN_NODE_LABELS.has(l))
}

export function isSystemNode(node: GraphNode): boolean {
  return (node.labels || []).some(l => SYSTEM_NODE_LABELS.has(l.toUpperCase()))
}

export function isLinkHidden(type: string): boolean {
  return HIDDEN_LINK_TYPES.has(type)
}
