/**
 * nodeRelationships.ts
 * 노드 디테일 패널용 — 관계(GraphLink)를 의미 그룹별로 분류/조회.
 *
 * 백엔드 관계 타입 매트릭스:
 *   - 데이터 입력 (테이블 읽기)  : FROM / READS / REFER_TO / REFERS_TO
 *   - 데이터 출력 (테이블 쓰기)  : WRITES
 *   - 호출                       : CALLS / USES / CALLS_SQL
 *   - 부착                       : HAS_FUNCTION / HAS_VARIABLE / HAS_COLUMN /
 *                                  HAS_RULE / HAS_EXAMPLE / HAS_QUESTION /
 *                                  HAS_PROCEDURE
 *   - FK                         : FK_TO_TABLE / FK_TO_COLUMN
 *   - 변수 참조 (테이블 X, 변수)  : REFERENCES
 *   - 구조 (UI 표시 X)            : PARENT_OF / NEXT / BELONGS_TO_PACKAGE / BELONGS_TO
 *   - UML (Framework)             : EXTENDS / IMPLEMENTS / DEPENDENCY / COMPOSITION /
 *                                  AGGREGATION / ASSOCIATION
 *   - Actor                      : ROLE
 *   - Example→Table              : AFFECTS_TABLE
 *   - DB 링크                    : LINKS_TO / DB_LINK
 */

import type { GraphLink, GraphNode } from '@/shared/types'

// ─────────────────────────────────────────────────────────────────────────
// 의미 그룹 정의 — 백엔드 `report.py` 의 ENTITY_*_REL_TYPES 와 일치
// ─────────────────────────────────────────────────────────────────────────

/** 데이터 입력 — 이 노드가 어느 테이블/리소스를 읽는가. */
export const INPUT_RELS: ReadonlySet<string> = new Set([
  'FROM', 'READS', 'REFER_TO', 'REFERS_TO',
])

/** 데이터 출력 — 이 노드가 어느 테이블에 쓰는가. */
export const OUTPUT_RELS: ReadonlySet<string> = new Set(['WRITES'])

/** 호출 — 이 노드가 어느 함수/모듈을 부르는가. */
export const CALL_RELS: ReadonlySet<string> = new Set([
  'CALLS', 'USES', 'CALLS_SQL', 'USES_CONFIG',
])

/** 부착 (HAS_*) — 이 노드가 자식으로 가진 노드들. */
export const HAS_RELS: ReadonlySet<string> = new Set([
  'HAS_FUNCTION', 'HAS_VARIABLE', 'HAS_COLUMN',
  'HAS_RULE', 'HAS_EXAMPLE', 'HAS_QUESTION', 'HAS_PROCEDURE',
])

/** FK — 외래키 관계 (방향 무관). */
export const FK_RELS: ReadonlySet<string> = new Set([
  'FK_TO_TABLE', 'FK_TO_COLUMN',
])

/** UML — Framework 의 클래스 간 관계. */
export const UML_RELS: ReadonlySet<string> = new Set([
  'EXTENDS', 'IMPLEMENTS', 'DEPENDENCY',
  'COMPOSITION', 'AGGREGATION', 'ASSOCIATION',
])

/**
 * UI 에서 제외할 관계 타입.
 * - 트리/그룹화 내부용 (PARENT_OF, BELONGS_TO*)
 * - 정렬·추적용으로 그래프를 어지럽게 만드는 흐름 메타 (NEXT, BRANCH)
 * - 메타 문서/규칙성 (HAS_RULE/EXAMPLE/QUESTION) — 대응 노드도 숨김.
 * - 의미가 모호하거나 양이 많아 시각화 노이즈인 보조 링크 (REFERENCES, AFFECTS_TABLE)
 */
export const EXCLUDED_RELS: ReadonlySet<string> = new Set([
  'PARENT_OF', 'BELONGS_TO', 'BELONGS_TO_PACKAGE',
  'NEXT', 'BRANCH',
  'REFERENCES', 'AFFECTS_TABLE',
  'HAS_RULE', 'HAS_EXAMPLE', 'HAS_QUESTION',
])

// ─────────────────────────────────────────────────────────────────────────
// 노드 ID 기반 관계 조회 — 그룹별 incoming/outgoing 분리
// ─────────────────────────────────────────────────────────────────────────

export interface RelationshipGroups {
  /** 입력 — 이 노드가 읽는 대상 (outgoing: source=this) */
  inputs: GraphLink[]
  /** 출력 — 이 노드가 쓰는 대상 (outgoing: source=this) */
  outputs: GraphLink[]
  /** 호출 — 이 노드가 부르는 대상 (outgoing) */
  calls: GraphLink[]
  /** 부착 자식 — 이 노드 아래 자식 (outgoing) */
  attached: GraphLink[]
  /** FK — 양방향 (테이블/컬럼 간) */
  fk: GraphLink[]
  /** UML — 양방향 (Framework 클래스 간) */
  uml: GraphLink[]
  /** 변수 참조 — 이 노드가 참조하는 변수 (outgoing) */
  variableRefs: GraphLink[]
  /** 역참조 — 이 노드를 부르는/쓰는/읽는 외부 노드 (incoming) */
  incomingCalls: GraphLink[]
  incomingInputs: GraphLink[]
  incomingOutputs: GraphLink[]
}

/** 빈 그룹 — null-safe 렌더링용. */
export const EMPTY_GROUPS: RelationshipGroups = {
  inputs: [],
  outputs: [],
  calls: [],
  attached: [],
  fk: [],
  uml: [],
  variableRefs: [],
  incomingCalls: [],
  incomingInputs: [],
  incomingOutputs: [],
}

/**
 * 노드 ID 기반으로 의미 그룹별 관계 분류.
 * @param nodeId 대상 노드 ID
 * @param links  전체 GraphLink 목록 (analyzerStore.linkMap 의 values)
 */
export function getRelationshipGroups(
  nodeId: string,
  links: Iterable<GraphLink>,
): RelationshipGroups {
  const groups: RelationshipGroups = {
    inputs: [],
    outputs: [],
    calls: [],
    attached: [],
    fk: [],
    uml: [],
    variableRefs: [],
    incomingCalls: [],
    incomingInputs: [],
    incomingOutputs: [],
  }

  for (const link of links) {
    const isOutgoing = link.source === nodeId
    const isIncoming = link.target === nodeId
    if (!isOutgoing && !isIncoming) continue

    const type = link.type

    if (FK_RELS.has(type)) {
      groups.fk.push(link)
      continue
    }
    if (UML_RELS.has(type)) {
      groups.uml.push(link)
      continue
    }
    if (EXCLUDED_RELS.has(type)) {
      continue
    }

    if (isOutgoing) {
      if (INPUT_RELS.has(type)) groups.inputs.push(link)
      else if (OUTPUT_RELS.has(type)) groups.outputs.push(link)
      else if (CALL_RELS.has(type)) groups.calls.push(link)
      else if (HAS_RELS.has(type)) groups.attached.push(link)
      else if (type === 'REFERENCES') groups.variableRefs.push(link)
    }
    if (isIncoming) {
      if (INPUT_RELS.has(type)) groups.incomingInputs.push(link)
      else if (OUTPUT_RELS.has(type)) groups.incomingOutputs.push(link)
      else if (CALL_RELS.has(type)) groups.incomingCalls.push(link)
    }
  }

  return groups
}

/**
 * 부착 자식 (HAS_*) 중 특정 관계 타입만 필터.
 * 예: `getAttachedByType(groups, 'HAS_FUNCTION')` — 자식 함수들.
 */
export function getAttachedByType(
  groups: RelationshipGroups,
  relType: string,
): GraphLink[] {
  return groups.attached.filter(l => l.type === relType)
}

// ─────────────────────────────────────────────────────────────────────────
// 의미데이터 보고서 — 함수→규칙→예시 + 질문 (노드패널 전용, semanticLinkMap 소스)
// 백엔드 emit 구조: FUNCTION -HAS_RULE-> RULE -HAS_EXAMPLE-> EXAMPLE,
//                  FUNCTION|RULE -HAS_QUESTION-> QUESTION.
// ─────────────────────────────────────────────────────────────────────────

/** 한 규칙 + 그 규칙에 매달린 예시들. */
export interface SemanticRule {
  node: GraphNode
  examples: GraphNode[]
}

/** 선택 함수의 의미데이터 보고서. 모두 비어있을 수 있음(데이터 없을 때 섹션 숨김). */
export interface SemanticReport {
  rules: SemanticRule[]
  questions: GraphNode[]
}

export const EMPTY_SEMANTIC_REPORT: SemanticReport = { rules: [], questions: [] }

/**
 * 선택 노드(보통 FUNCTION)의 업무규칙·예시·질문을 의미데이터 채널에서 조회.
 * @param nodeId         대상 노드 id
 * @param semanticLinks  analyzerStore.semanticLinkMap 의 values (HAS_RULE/EXAMPLE/QUESTION)
 * @param nodes          analyzerStore.nodeMap (RULE/EXAMPLE/QUESTION 노드 해석용)
 */
export function getSemanticReport(
  nodeId: string,
  semanticLinks: Iterable<GraphLink>,
  nodes: Map<string, GraphNode>,
): SemanticReport {
  // 출발지(source)별로 타입 버킷 구성 — 한 번만 순회.
  const rulesBySource = new Map<string, GraphLink[]>()
  const examplesBySource = new Map<string, GraphLink[]>()
  const questionsBySource = new Map<string, GraphLink[]>()
  const push = (m: Map<string, GraphLink[]>, k: string, l: GraphLink) => {
    const arr = m.get(k)
    if (arr) arr.push(l)
    else m.set(k, [l])
  }
  for (const link of semanticLinks) {
    if (link.type === 'HAS_RULE') push(rulesBySource, link.source, link)
    else if (link.type === 'HAS_EXAMPLE') push(examplesBySource, link.source, link)
    else if (link.type === 'HAS_QUESTION') push(questionsBySource, link.source, link)
  }

  const resolve = (links: GraphLink[] | undefined): GraphNode[] =>
    (links ?? [])
      .map(l => nodes.get(l.target))
      .filter((n): n is GraphNode => !!n)

  const ruleNodes = resolve(rulesBySource.get(nodeId))
  const rules: SemanticRule[] = ruleNodes.map(node => ({
    node,
    examples: resolve(examplesBySource.get(node.id)),
  }))

  // 질문은 함수 직속 + 각 규칙 소속 둘 다 수집(emit from 이 둘 중 하나).
  const questionNodes: GraphNode[] = [...resolve(questionsBySource.get(nodeId))]
  for (const r of ruleNodes) questionNodes.push(...resolve(questionsBySource.get(r.id)))
  const seen = new Set<string>()
  const questions = questionNodes.filter(q => (seen.has(q.id) ? false : (seen.add(q.id), true)))

  return { rules, questions }
}
