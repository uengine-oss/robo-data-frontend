/**
 * templateRouter.ts
 * 노드 디테일 패널 — 노드 라벨 → 적절한 카드 컴포넌트 결정.
 *
 * 백엔드 라벨 (primary):
 *   - MODULE   : CLASS/INTERFACE/ENUM/RECORD/FILE 등 컨테이너 (메서드 품음)
 *   - DATATYPE : C STRUCT/UNION/ENUM (메서드 못 품는 데이터 컨테이너)
 *   - FUNCTION : 함수/메서드/프로시저
 *   - VARIABLE / CONSTANT : 변수/상수
 *   - PACKAGE  : Framework 패키지
 *   - DBMS DML : SELECT/INSERT/UPDATE/DELETE/MERGE/UNION/...
 *   - DBMS    : PROCEDURE/FUNCTION/TRIGGER (DBMS 의 코드 단위)
 *   - 공통     : Table/Column/Schema/DBLink/Rule/Example/Question/Actor
 *   - 기타     : ARTIFACT_CHUNK/CONFIG_SECTION/SQL_STATEMENT
 *
 * sub-label (`type` 속성) 추가 분기:
 *   - MODULE.FILE / MODULE.DEFINE → 파일 카드 (모듈 아닌 물리 파일)
 */

import type { GraphNode } from '@/shared/types'

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

const ATTACHED_LABELS = new Set(['RULE', 'EXAMPLE', 'QUESTION', 'Actor'])
const FUNCTION_LABELS = new Set(['PROCEDURE', 'FUNCTION', 'TRIGGER'])
const VARIABLE_LABELS = new Set(['VARIABLE', 'CONSTANT'])
const NON_CODE_LABELS = new Set(['ARTIFACT_CHUNK', 'CONFIG_SECTION'])
const DML_LABELS = new Set([
  'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'UNION',
  'EXECUTE_IMMEDIATE', 'CTE', 'FETCH',
])

/** sub-label 이 파일인지 (Framework MODULE.FILE / MODULE.DEFINE). */
const FILE_SUB_LABELS = new Set(['FILE', 'DEFINE'])

/**
 * 노드 라벨 + sub-label 보고 어느 카드 컴포넌트를 쓸지 결정.
 */
export function pickTemplate(node: GraphNode): TemplateType {
  const labels = node.labels || []
  const primary = labels[0] || ''
  const sub = (node.properties?.type as string) || ''

  // 1. 부착 노드 (Rule/Example/Question/Actor 단독 표시)
  if (labels.some(l => ATTACHED_LABELS.has(l))) return 'attached'

  // 2. 공통 노드
  if (labels.includes('TABLE')) return 'table'
  if (labels.includes('COLUMN')) return 'column'

  // 3. MODULE — sub-label 로 file/module 분기
  if (primary === 'MODULE') {
    return FILE_SUB_LABELS.has(sub) ? 'file' : 'module'
  }
  // DBMS 의 FILE 라벨 (그래프 루트)
  if (primary === 'FILE') return 'file'

  // 4. DATATYPE (C STRUCT/UNION/ENUM)
  if (primary === 'DATATYPE') return 'datatype'

  // 5. FUNCTION/PROCEDURE/TRIGGER
  if (FUNCTION_LABELS.has(primary)) return 'function'

  // 6. SQL DML
  if (DML_LABELS.has(primary)) return 'sqlStatement'
  if (primary === 'SQL_STATEMENT') return 'sqlStatement'

  // 7. 변수/상수
  if (VARIABLE_LABELS.has(primary)) return 'variable'

  // 8. Framework 패키지
  if (primary === 'PACKAGE') return 'package'

  // 9. 비코드 청크 (Framework)
  if (NON_CODE_LABELS.has(primary)) return 'nonCode'

  return 'fallback'
}
