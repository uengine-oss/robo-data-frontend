/**
 * nodeIdentity.ts
 * 노드 식별 정보(라벨+값 행) 단일 생성처 — NodeDetailBase 가 종류 무관하게 렌더한다.
 *
 * 기존엔 카드 11종이 각자 subInfo 문자열을 조립 → 종류마다 보이는 게 달라 누락·중복이 생겼다.
 * 여기 한 곳에서 **노드 종류별 실제 저장 속성**(Neo4j 실측 기준)을 빠짐없이, 값 있는 것만 행으로 만든다.
 */

import type { GraphNode } from '@/shared/types'
import { semanticRoleLabels } from '@/shared/utils/nodeLabels'
import { VARIABLE_LABELS } from '@/shared/utils/nodeClassify'

export interface IdentityRow {
  /** 행 라벨(예: '논리명', '경로') */
  k: string
  /** 표시 값(빈 값이면 행 자체를 만들지 않음) */
  v: string
}

export interface IdentityContext {
  ownerName?: string
  packageName?: string
}

// stereotype(역할) 영문 → 한글 곁들임. 매핑 없으면 원문 그대로.
const STEREOTYPE_KO: Record<string, string> = {
  ApplicationService: '응용 서비스',
  DomainService: '도메인 서비스',
  Repository: '저장소',
  Factory: '팩토리',
  Command: '명령',
  Query: '조회',
  Validator: '검증',
  Translator: '변환',
  Adapter: '어댑터',
  Strategy: '전략',
  EventHandler: '이벤트 처리',
  Scheduler: '스케줄러',
  Helper: '보조',
  Controller: '컨트롤러',
  Initializer: '초기화',
  Service: '서비스',
  DataMutator: '데이터 변경',
  DataQuery: '데이터 조회',
  BatchProcessor: '배치 처리',
  MetadataLookup: '메타 조회',
  EventTrigger: '이벤트 트리거',
  Aggregator: '집계',
  ReportGenerator: '리포트 생성',
  DataMigrator: '데이터 이관',
  CursorLooper: '커서 순회',
  PackageInitializer: '패키지 초기화',
}

/** 역할(stereotype) 라벨 → 한글 곁들임 표시. */
function roleDisplay(role: string): string {
  return STEREOTYPE_KO[role] ? `${STEREOTYPE_KO[role]} (${role})` : role
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

/** 명시된 소스 경로에서 확장자를 포함한 실제 파일명만 반환한다. */
export function sourceFileName(raw: unknown): string {
  if (typeof raw !== 'string' || !raw) return ''
  const parts = raw.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts.at(-1) || ''
}

/**
 * 노드 → 식별 행 목록. 값 없는 항목은 생략. 종류별 추가 필드까지 빠짐없이.
 */
export function buildIdentityRows(node: GraphNode, context: IdentityContext = {}): IdentityRow[] {
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
  push('원본 파일', sourceFileName(p.file_path))
  push('경로', relativeSourcePath(p.file_path))
  const sl = Number(p.start_line), el = Number(p.end_line)
  if (sl || el) push('라인', sl === el ? `${sl}` : `${sl} ~ ${el}`)
  push('소속', context.ownerName)
  push('패키지', context.packageName)
  // 역할(stereotype) 표시 = 속성 p.stereotype(PascalCase) 우선 — 라벨은 UPPER_SNAKE(네임스페이스
  // 분리 spec 036)라 STEREOTYPE_KO 키와 표기가 달라 라벨로는 한글이 안 잡힌다. 라벨은 색·필터용.
  if (p.stereotype) push('역할', roleDisplay(String(p.stereotype)))
  else {
    const roles = semanticRoleLabels(node)
    if (roles.length) push('역할', roles.map(roleDisplay).join(', '))
  }

  // ── 테이블 ───────────────────────────────────────────
  if (has('TABLE')) {
    push('스키마', p.schema)
    push('DB', p.database)
    push('테이블 종류', p.table_type)
  }

  // ── 컬럼 ─────────────────────────────────────────────
  if (has('COLUMN')) {
    push('타입', p.data_type)
    if (p.primary_key === true || p.primary_key === 'true') push('PK', '예')
    if (p.unique === true || p.unique === 'true') push('유니크', '예')
    if (p.nullable === false || p.nullable === 'false') push('NULL', '불가')
    push('기본값', p.default_value)
  }

  // ── 변수/상수 (FIELD/MEMBER/GLOBAL_VARIABLE/DEFINE/CONSTANT_FIELD 포함) ──
  // ★ 공용 VARIABLE_LABELS — 종전엔 3종만 들어서 필드·멤버·전역변수·상수의 타입이 안 보였다.
  //   값: 변수와 상수 모두 value.
  if ((node.labels || []).some(l => VARIABLE_LABELS.has(l))) {
    push('타입', p.data_type)
    push('값', p.value)
  }

  push('외부 종류', p.kind)
  push('외부 키', Array.isArray(p.key) ? p.key.join(', ') : p.key)

  return rows
}
