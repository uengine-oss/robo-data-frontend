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

import type { GraphLink } from '@/types'

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

/** UI 에서 제외 — 트리 구조용 내부 관계. */
export const EXCLUDED_RELS: ReadonlySet<string> = new Set([
  'PARENT_OF', 'NEXT', 'BELONGS_TO', 'BELONGS_TO_PACKAGE',
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
