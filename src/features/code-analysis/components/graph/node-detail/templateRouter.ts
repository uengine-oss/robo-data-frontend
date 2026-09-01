/**
 * templateRouter.ts
 * 노드 디테일 패널 — 노드 라벨 → 적절한 카드 컴포넌트 결정.
 *
 * 백엔드 라벨:
 *   - CLASS/INTERFACE/FILE : 메서드나 함수를 품는 컨테이너
 *   - STRUCT/UNION/ENUM : C 데이터 컨테이너
 *   - FUNCTION : 함수/메서드/프로시저
 *   - VARIABLE / CONSTANT : 변수/상수
 *   - PACKAGE  : Framework 패키지
 *   - DBMS DML : SELECT/INSERT/UPDATE/DELETE/MERGE/UNION/...
 *   - DBMS    : PROCEDURE/FUNCTION/TRIGGER (DBMS 의 코드 단위)
 *   - 공통     : TABLE/COLUMN/RULE
 *   - 기타     : EXTERNAL_CHUNK
 */

import type { GraphNode } from '@/shared/types'
import { CALLABLE_LABELS, DATATYPE_LABELS, VARIABLE_LABELS } from '@/shared/utils/nodeClassify'

export type TemplateType =
  | 'module'
  | 'file'
  | 'datatype'
  | 'function'
  | 'sqlStatement'
  | 'table'
  | 'column'
  | 'variable'
  | 'package'
  | 'attached'
  | 'nonCode'
  | 'fallback'

const ATTACHED_LABELS = new Set(['RULE'])
// 변수/상수·데이터타입 집합은 `nodeClassify` 가 단일 진실 — 여기서 다시 정의하지 않는다
// (종전엔 여기·nodeIdentity 가 각자 목록을 들어 서로 달랐다 — spec 045 FR-012).
const NON_CODE_LABELS = new Set(['EXTERNAL_CHUNK'])
const DML_LABELS = new Set([
  'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'UNION',
  'EXECUTE_IMMEDIATE', 'CTE', 'FETCH',
])

const CLASS_CONTAINER_LABELS = new Set(['CLASS', 'INTERFACE'])

/**
 * 노드 라벨 + sub-label 보고 어느 카드 컴포넌트를 쓸지 결정.
 */
export function pickTemplate(node: GraphNode): TemplateType {
  const labels = node.labels || []
  const primary = labels[0] || ''

  // 1. 규칙 노드
  if (labels.some(l => ATTACHED_LABELS.has(l))) return 'attached'

  // 2. 공통 노드
  if (labels.includes('TABLE')) return 'table'
  if (labels.includes('COLUMN')) return 'column'

  // 3. 컨테이너
  if (labels.includes('FILE')) return 'file'
  if (labels.some(l => CLASS_CONTAINER_LABELS.has(l))) return 'module'

  // 4. 데이터타입 (C STRUCT/UNION/ENUM)
  if (labels.some(l => DATATYPE_LABELS.has(l))) return 'datatype'

  // 5. 호출가능(루틴) — METHOD/FUNCTION/PROCEDURE/TRIGGER (타입집합)
  if (labels.some(l => CALLABLE_LABELS.has(l))) return 'function'

  // 6. SQL DML
  if (DML_LABELS.has(primary)) return 'sqlStatement'

  // 7. 변수/상수 (타입집합)
  if (labels.some(l => VARIABLE_LABELS.has(l))) return 'variable'

  // 8. Framework 패키지
  if (primary === 'PACKAGE') return 'package'

  // 9. 비코드 청크 (Framework)
  if (NON_CODE_LABELS.has(primary)) return 'nonCode'

  // DML 외 DBMS 구문(IF/LOOP/CASE…)도 코드 노드면 구문 카드로 (raw fallback 방지).
  if (node.properties?.start_line != null || node.properties?.code_text) return 'sqlStatement'

  return 'fallback'
}
