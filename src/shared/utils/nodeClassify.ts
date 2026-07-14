/**
 * nodeClassify.ts — 노드 배지(글자·색) 단일 판정처.
 *
 * 노드 라벨 = 자기 antlr type 하나 (spec 019, 예외 0):
 *  - DBMS: :SELECT / :PROCEDURE / :IF / :FILE …
 *  - Framework: :METHOD / :CLASS / :FIELD …  (역할 라벨 폐기)
 *  - 외부 호출 stub 만 :FUNCTION:EXTERNAL / :MODULE:EXTERNAL (실타입 미상 fallback)
 * 역할(그릇/호출가능)은 타입집합으로 파생. labels 만 읽어 배지를 정한다(파싱 없음).
 * 트리·노드패널이 이 한 곳을 공유 — 컴포넌트에 분기 산발 금지(DRY).
 */
import type { GraphNode } from '@/shared/types'
import { kindOfNode } from '@/shared/utils/nodeLabels'

export type NodeRole = 'container' | 'callable' | 'statement' | 'table' | 'column' | 'other'

export interface NodeClass {
  /** 구조적 역할. */
  role: NodeRole
  /** 트리 배지 글자. */
  badgeChar: string
  /** 트리 배지 색 클래스(NavigatorTreeNode scss 와 일치). */
  badgeClass: string
}

/** 부가 라벨(stub 역할·검색 마커) — 실제 종류 판정 시 스킵(나머지는 전부 antlr type=실타입). */

/** 역할 라벨을 뺀 첫 구체 라벨(= antlr type, 예 SELECT/METHOD/CLASS/FILE). 없으면 ''. */

/** 그릇(컨테이너) 타입집합 — spec 019: 그릇 = 실제 종류(antlr type). MODULE 은 외부 stub(:MODULE:EXTERNAL) 호환.
 *  PACKAGE 는 네임스페이스라 별도 취급(여기 제외). */
export const CONTAINER_LABELS: ReadonlySet<string> = new Set([
  'FILE', 'CLASS', 'INTERFACE', 'RECORD', 'MODULE',
])

/** 호출가능(루틴) 타입집합 — 메서드/함수/프로시저/트리거. 역할 라벨 대신 타입으로 판정. */
export const CALLABLE_LABELS: ReadonlySet<string> = new Set([
  'METHOD', 'FUNCTION', 'PROCEDURE', 'TRIGGER',
])

/** 변수/상수 타입집합 (antlr type — 역할 라벨 폐기). 카드 라우팅·식별행이 **같은 집합**을 본다. */
export const VARIABLE_LABELS: ReadonlySet<string> = new Set([
  'VARIABLE', 'CONSTANT', 'FIELD', 'MEMBER', 'GLOBAL_VARIABLE',
  'PARAMETER', 'PACKAGE_VARIABLE', 'CURSOR_VARIABLE', 'DEFINE', 'CONSTANT_FIELD',
])

/** 데이터타입 타입집합 (C struct/union/enum). */
export const DATATYPE_LABELS: ReadonlySet<string> = new Set([
  'STRUCT', 'UNION', 'ENUM', 'DATA_TYPE',
])

/** 이 노드가 그릇(파일/클래스 등 코드 컨테이너)인가 — 소비처가 MODULE 역할 대신 타입으로 식별. */
export function isContainerNode(labels: string[]): boolean {
  return (labels || []).some(l => CONTAINER_LABELS.has(l))
}

/**
 * 노드 → 배지. **labels 직독**(파싱 0).
 * - 컨테이너/테이블/컬럼/콜러블(FUNCTION)은 고정 배지.
 * - DBMS 구문(:SELECT/:IF/:UPDATE/:UNION_ALL…)·기타는 **구체 라벨 첫 글자**(S/I/U/…).
 */
export function classifyNode(node: GraphNode): NodeClass {
  const labels = node.labels || []
  if (labels.includes('PACKAGE')) return { role: 'container', badgeChar: 'P', badgeClass: 'badge-package' }
  // 컨테이너(그릇) — 타입으로 식별(spec 019). 배지는 **실제 종류**로(파일=F·클래스=C·인터페이스=I).
  if (isContainerNode(labels)) {
    const kind = kindOfNode(node)
    if (/Interface|INTERFACE/.test(kind)) return { role: 'container', badgeChar: 'I', badgeClass: 'badge-interface' }
    if (/Class|CLASS/.test(kind)) return { role: 'container', badgeChar: 'C', badgeClass: 'badge-class' }
    return { role: 'container', badgeChar: kind ? kind.charAt(0).toUpperCase() : 'M', badgeClass: 'badge-module' }
  }
  if (labels.includes('TABLE')) return { role: 'table', badgeChar: 'T', badgeClass: 'badge-table' }
  if (labels.includes('COLUMN')) return { role: 'column', badgeChar: 'C', badgeClass: 'badge-column' }
  // 콜러블(루틴) — 타입집합으로 판정. 배지 = 실제 종류 첫 글자(메서드 M·함수 F·프로시저 P·트리거 T).
  {
    const kind = kindOfNode(node)
    if (CALLABLE_LABELS.has(kind)) return { role: 'callable', badgeChar: kind.charAt(0).toUpperCase(), badgeClass: 'badge-function' }
  }
  if (labels.includes('BusinessLogic')) return { role: 'other', badgeChar: 'B', badgeClass: 'badge-bl' }

  // 그 외 = 자기 타입 라벨(DBMS 구문 SELECT/IF/… 또는 DBMS PROCEDURE/TRIGGER, Framework CLASS 등).
  const kind = kindOfNode(node)
  if (/Class|CLASS/.test(kind)) return { role: 'other', badgeChar: kind.charAt(0).toUpperCase(), badgeClass: 'badge-class' }
  if (/Interface|INTERFACE/.test(kind)) return { role: 'other', badgeChar: kind.charAt(0).toUpperCase(), badgeClass: 'badge-interface' }
  return { role: kind ? 'statement' : 'other', badgeChar: kind ? kind.charAt(0).toUpperCase() : '?', badgeClass: 'badge-default' }
}

/** 노드의 구체 타입 라벨(표시용 — 예 'SELECT', 'PROCEDURE', 'METHOD'). 없으면 ''. */
export function nodeTypeLabel(node: GraphNode): string {
  return kindOfNode(node)
}

/** LLM 분석 제외(구조) 노드의 한글 라벨 — 단일 하드코딩 맵(DRY). LLM 논리명이 없는 자리를 채운다. */
const STRUCTURE_LABELS_KO: Record<string, string> = {
  DECLARE: '변수 선언부',
  TRY: '예외 처리',
  TRIGGER_BLOCK: '트리거 본문',
}

/**
 * 구조 노드(DECLARE/TRY/TRIGGER_BLOCK)면 한글 라벨('변수 선언부' 등), 아니면 ''.
 * 논리명 모드에서 LLM 논리명이 비었을 때 폴백 — 한글 라벨 자체가 "구조"임을 전달
 * (분석된 노드는 논리명 없으면 영문 기술명으로 떠서 자연 구분, 별도 꼬리표 불필요).
 */
export function structureLogicalName(node: GraphNode): string {
  const type = kindOfNode(node)
  return STRUCTURE_LABELS_KO[type] || ''
}

/**
 * 논리명 모드 표시값 — 단일 결정처(canvas·tree 공유, DRY).
 *   1) LLM 논리명 있으면 그것(한글 업무명)
 *   2) 구조 노드면 한글 라벨('변수 선언부' 등)
 *   3) 둘 다 없으면 **물리명 그대로**(예 PRC_XXX / SELECT[12]).
 *      논리명(한글 산문) vs 물리명(영문 식별자)은 한눈에 자연 구분되므로 "논리명 없음"
 *      꼬리표를 붙이지 않는다 — 외부 stub·테이블 등에 "없음"이 도배돼 분석 실패처럼
 *      보이던 혼란 제거(사용자 피드백). 물리명을 논리명인 척 강조하는 것도 아니다(그냥 이름).
 * @param physical 호출측이 계산한 물리 식별자(이름 또는 `타입[라인]`).
 */
export function logicalModeName(node: GraphNode, physical: string): string {
  const ln = node.properties?.logical_name
  if (typeof ln === 'string' && ln.trim()) return ln.trim()
  const struct = structureLogicalName(node)
  if (struct) return struct
  return physical || '이름 없음'
}
