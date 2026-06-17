/**
 * nodeClassify.ts — 노드 배지(글자·색) 단일 판정처.
 *
 * 노드 타입 = antlr type 이 곧 라벨이다:
 *  - DBMS: :SELECT / :PROCEDURE / :IF …  (구문·콜러블 모두 자기 타입 라벨)
 *  - Framework: :FUNCTION:METHOD / :MODULE:CLASS  (역할 + ontology sub-label)
 * labels 만 읽어 배지를 정한다(signature·function_id 파싱 없음).
 * 트리·노드패널이 이 한 곳을 공유 — 컴포넌트에 분기 산발 금지(DRY).
 */
import type { GraphNode } from '@/shared/types'

export type NodeRole = 'container' | 'callable' | 'statement' | 'table' | 'column' | 'other'

export interface NodeClass {
  /** 구조적 역할. */
  role: NodeRole
  /** 트리 배지 글자. */
  badgeChar: string
  /** 트리 배지 색 클래스(NavigatorTreeNode scss 와 일치). */
  badgeClass: string
}

/** 역할 라벨(그룹) — 이 라벨들을 제외한 첫 라벨이 실제 구체 타입. */
const ROLE_LABELS = new Set([
  'MODULE', 'FUNCTION', 'VARIABLE', 'CONSTANT', 'PACKAGE', 'FILE',
  'INTERNAL', 'EXTERNAL',
])

/** 역할 라벨을 뺀 첫 구체 라벨(= antlr type, 예 SELECT/METHOD/CLASS). 없으면 ''. */
function specificLabel(labels: string[]): string {
  for (const l of labels) if (!ROLE_LABELS.has(l)) return l
  return ''
}

/**
 * 노드 → 배지. **labels 직독**(파싱 0).
 * - 컨테이너/테이블/컬럼/콜러블(FUNCTION)은 고정 배지.
 * - DBMS 구문(:SELECT/:IF/:UPDATE/:UNION_ALL…)·기타는 **구체 라벨 첫 글자**(S/I/U/…).
 */
export function classifyNode(node: GraphNode): NodeClass {
  const labels = node.labels || []
  if (labels.includes('PACKAGE')) return { role: 'container', badgeChar: 'P', badgeClass: 'badge-package' }
  if (labels.includes('MODULE') || labels.includes('FILE')) return { role: 'container', badgeChar: 'M', badgeClass: 'badge-module' }
  if (labels.includes('TABLE')) return { role: 'table', badgeChar: 'T', badgeClass: 'badge-table' }
  if (labels.includes('COLUMN')) return { role: 'column', badgeChar: 'C', badgeClass: 'badge-column' }
  // 콜러블 — Framework 메서드(:FUNCTION:METHOD) / DBMS 함수(:FUNCTION). 진짜 함수 = 'F'.
  if (labels.includes('FUNCTION')) return { role: 'callable', badgeChar: 'F', badgeClass: 'badge-function' }
  if (labels.includes('BusinessLogic')) return { role: 'other', badgeChar: 'B', badgeClass: 'badge-bl' }

  // 그 외 = 자기 타입 라벨(DBMS 구문 SELECT/IF/… 또는 DBMS PROCEDURE/TRIGGER, Framework CLASS 등).
  const kind = specificLabel(labels) || labels[0] || ''
  if (/Class|CLASS/.test(kind)) return { role: 'other', badgeChar: kind.charAt(0).toUpperCase(), badgeClass: 'badge-class' }
  if (/Interface|INTERFACE/.test(kind)) return { role: 'other', badgeChar: kind.charAt(0).toUpperCase(), badgeClass: 'badge-interface' }
  return { role: kind ? 'statement' : 'other', badgeChar: kind ? kind.charAt(0).toUpperCase() : '?', badgeClass: 'badge-default' }
}

/** 노드의 구체 타입 라벨(표시용 — 예 'SELECT', 'PROCEDURE', 'METHOD'). 없으면 ''. */
export function nodeTypeLabel(node: GraphNode): string {
  return specificLabel(node.labels || [])
}
