/**
 * nodeIdentity.ts
 * 노드 식별 정보(라벨+값 행) 단일 생성처 — NodeDetailBase 가 종류 무관하게 렌더한다.
 *
 * 기존엔 카드 11종이 각자 subInfo 문자열을 조립 → 종류마다 보이는 게 달라 누락·중복이 생겼다.
 * 여기 한 곳에서 **노드 종류별 실제 저장 속성**(Neo4j 실측 기준)을 빠짐없이, 값 있는 것만 행으로 만든다.
 */

import type { GraphNode } from '@/shared/types'

export interface IdentityRow {
  /** 행 라벨(예: '논리명', '경로') */
  k: string
  /** 표시 값(빈 값이면 행 자체를 만들지 않음) */
  v: string
}

// stereotype(설계 분류) 영문 → 한글 곁들임. 매핑 없으면 원문 그대로.
const STEREOTYPE_KO: Record<string, string> = {
  Aggregation: '집계',
  BatchProcessor: '배치 처리',
  MetadataLookup: '메타 조회',
  Validator: '검증',
  Transformer: '변환',
  Calculator: '계산',
  Loader: '적재',
  Reader: '조회',
  Writer: '기록',
}

/**
 * 절대경로에서 프로젝트 루트(`…/data/source/` 또는 `…/data/`)를 잘라 **상대경로**만 남긴다.
 * 예: `D:\…\data\source\RWIS\FN.sql` → `RWIS/FN.sql`. data 접두·OS 구분자 노이즈 제거.
 */
export function relativeSourcePath(raw: unknown): string {
  if (typeof raw !== 'string' || !raw) return ''
  const norm = raw.replace(/\\/g, '/')
  const m = norm.match(/\/data\/source\/(.+)$/) || norm.match(/\/data\/(.+)$/)
  if (m) return m[1]
  // data 접두가 없으면 마지막 2단계만(과한 경로 노출 방지)
  const parts = norm.split('/').filter(Boolean)
  return parts.slice(-2).join('/') || norm
}

/**
 * 노드 → 식별 행 목록. 값 없는 항목은 생략. 종류별 추가 필드까지 빠짐없이.
 */
export function buildIdentityRows(node: GraphNode): IdentityRow[] {
  const p = node.properties || {}
  const labels = (node.labels || []).map(l => l.toUpperCase())
  const has = (...ls: string[]) => ls.some(l => labels.includes(l))
  const rows: IdentityRow[] = []
  const push = (k: string, v: unknown): void => {
    const s = v === null || v === undefined ? '' : String(v).trim()
    if (s) rows.push({ k, v: s })
  }

  // ── 공통 ─────────────────────────────────────────────
  push('논리명', p.logical_name)
  push('경로', relativeSourcePath(p.file_path))
  const sl = Number(p.start_line), el = Number(p.end_line)
  if (sl || el) push('라인', sl === el ? `${sl}` : `${sl} ~ ${el}`)
  if (p.stereotype) {
    const st = String(p.stereotype)
    push('분류', STEREOTYPE_KO[st] ? `${STEREOTYPE_KO[st]} (${st})` : st)
  }

  // ── 루틴(함수/프로시저/트리거) ───────────────────────
  if (has('FUNCTION', 'PROCEDURE', 'TRIGGER')) {
    push('파라미터', p.params)
    push('반환', p.return_type)
    push('협력 군집', p.component_name)   // 위험도는 건강 배지(NodeDetailBase)가 색으로 표시 — 중복 제외
  }

  // ── 테이블 ───────────────────────────────────────────
  if (has('TABLE')) {
    push('스키마', p.schema)
    push('DB', p.db)
    push('테이블 종류', p.table_type)
  }

  // ── 컬럼 ─────────────────────────────────────────────
  if (has('COLUMN')) {
    push('타입', p.dtype)
    if (p.is_primary_key === true || p.is_primary_key === 'true') push('PK', '예')
    if (p.is_unique === true || p.is_unique === 'true') push('유니크', '예')
    if (p.nullable === false || p.nullable === 'false') push('NULL', '불가')
    push('기본값', p.default_value)
  }

  // ── 변수/파라미터/커서변수 ───────────────────────────
  if (has('VARIABLE', 'PARAMETER', 'CURSOR_VARIABLE')) {
    push('타입', p.var_type)
    push('초기값', p.init_value)
  }

  // ── 비코드 청크(framework ARTIFACT/CONFIG) ───────────
  push('청크 타입', p.chunk_type)
  push('키 경로', p.config_key_path)

  return rows
}
