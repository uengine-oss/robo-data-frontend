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
import { CALLABLE_LABELS } from '@/shared/utils/nodeClassify'

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
// 변수/상수 = antlr type 집합 (역할 라벨 폐기 — FIELD/MEMBER/DEFINE 등 자기 타입).
const VARIABLE_LABELS = new Set([
  'VARIABLE', 'CONSTANT', 'FIELD', 'MEMBER', 'GLOBAL_VARIABLE',
  'PARAMETER', 'PACKAGE_VARIABLE', 'CURSOR_VARIABLE', 'DEFINE', 'CONSTANT_FIELD',
])
const DATATYPE_LABELS = new Set(['STRUCT', 'UNION', 'ENUM', 'DATA_TYPE'])
const NON_CODE_LABELS = new Set(['ARTIFACT_CHUNK', 'CONFIG_SECTION'])
const DML_LABELS = new Set([
  'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'UNION',
  'EXECUTE_IMMEDIATE', 'CTE', 'FETCH',
])

/** 외부 stub(:MODULE:EXTERNAL) 의 sub-label 이 파일인지 (properties.type). */
const FILE_SUB_LABELS = new Set(['FILE', 'DEFINE'])

/** 클래스형 그릇(모듈 카드) — spec 019: 그릇 = 실제 종류 라벨 CLASS/INTERFACE/RECORD.
 *  (enum 은 DATA_TYPE 라 그릇 아님 — 제외.) */
const CLASS_CONTAINER_LABELS = new Set(['CLASS', 'INTERFACE', 'RECORD'])

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

  // 3. 컨테이너(그릇) — **실제 종류**로 (라벨 순서 무관: `:FILE:MODULE` / `:CLASS:MODULE`).
  if (labels.includes('FILE')) return 'file'                                  // 파일(C/Python/DBMS .sql)
  if (labels.some(l => CLASS_CONTAINER_LABELS.has(l))) return 'module'        // 클래스/인터페이스/레코드
  // 종류 미상 그릇(외부 stub :MODULE:EXTERNAL) 폴백 — sub-label 로 file/module 분기.
  if (labels.includes('MODULE')) return FILE_SUB_LABELS.has(sub) ? 'file' : 'module'

  // 4. 데이터타입 (C STRUCT/UNION/ENUM)
  if (labels.some(l => DATATYPE_LABELS.has(l))) return 'datatype'

  // 5. 호출가능(루틴) — METHOD/FUNCTION/PROCEDURE/TRIGGER (타입집합)
  if (labels.some(l => CALLABLE_LABELS.has(l))) return 'function'

  // 6. SQL DML
  if (DML_LABELS.has(primary)) return 'sqlStatement'
  if (primary === 'SQL_STATEMENT') return 'sqlStatement'

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
