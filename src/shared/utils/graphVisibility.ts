/**
 * graphVisibility.ts
 * 그래프 "기본 숨김" 단일 정의 (single source of truth).
 *
 * 노드/링크는 nodeMap·linkMap 한 곳에 **날것 그대로 전부** 저장하고, 무엇을 가릴지는
 * 오직 표시 단계에서 이 정의로 판단한다. 모든 표시 소비처(analyzer graphData·canvas
 * canvasGraphData)가 이 하나를 공유 → 정의가 흩어져 생기던 불일치 제거.
 *
 * "숨김 요소 표시"(showHidden) 토글이 켜지면 이 숨김을 적용하지 않고 전부 노출한다.
 */
import type { GraphNode } from '@/shared/types'

/** 화면 기본 숨김 노드 라벨 — 메타 노드(RULE/EXAMPLE/QUESTION) + 시각 노이즈(전역변수). */
export const HIDDEN_NODE_LABELS: ReadonlySet<string> = new Set([
  'RULE', 'EXAMPLE', 'QUESTION', 'GLOBAL_VARIABLE',
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

export function isLinkHidden(type: string): boolean {
  return HIDDEN_LINK_TYPES.has(type)
}
