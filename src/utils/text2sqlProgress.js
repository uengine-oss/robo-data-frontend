/**
 * text2sqlProgress.js
 *
 * Text2SQL(ReAct) 진행 상황을 "비기술 사용자" 기준으로 요약하기 위한 순수 로직 모음.
 * - Node.js 단발성 테스트에서 그대로 import 해서 검증한다.
 * - 프론트 런타임에서도 동일 함수를 사용한다.
 */

const STAGE_LABEL_KO = {
  embedding: '질문을 해석하는 중',
  enrich: '문맥을 확장하는 중',
  table_search: '관련 데이터를 찾는 중',
  column_search: '필드 후보를 고르는 중',
  fk_relationships: '데이터 관계를 확인하는 중',
  resolved_values: '필터 후보를 확인하는 중',
  suggestions: '정리 중',
  light_queries: '샘플로 빠르게 검증 중',
  // Controller (post-context): LLM-heavy parts after light_queries
  controller_requirements: '요구사항을 정리하는 중',
  controller_candidates: '여러 답안을 만드는 중',
  controller_validate: '최종 안전 검증',
  controller_rubric: '정확도를 점검하는 중',
  controller_repair: '답안을 다듬는 중',
  runtime_repair_cold_start: '초기 메타데이터를 준비하는 중',
  finalize: '정리 중'
}

/**
 * @param {string} stage
 * @returns {string}
 */
export function getText2SqlStageLabelKo(stage) {
  const key = String(stage || '').trim()
  if (!key) return '진행 중'
  return STAGE_LABEL_KO[key] || `진행 중(${key})`
}

/**
 * @param {Record<string, number> | undefined} counts
 * @returns {string[]}
 */
export function formatCountsSummaryKo(counts) {
  const c = counts && typeof counts === 'object' ? counts : null
  if (!c) return []

  /** @type {string[]} */
  const out = []
  const pushIf = (label, key) => {
    const v = c[key]
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
      out.push(`${label} ${v}개`)
    }
  }

  pushIf('후보 테이블', 'table_candidates')
  pushIf('선정 테이블', 'selected_tables')
  pushIf('후보 컬럼', 'column_candidates')
  pushIf('해결된 값', 'resolved_values')
  pushIf('관계', 'fk_relationships')
  pushIf('샘플 쿼리', 'light_queries_total')
  pushIf('샘플 통과', 'light_queries_pass')
  pushIf('요구사항', 'requirements_total')
  pushIf('후보 답안', 'candidates_total')
  pushIf('수정 라운드', 'repair_rounds_total')

  return out
}

/**
 * @param {{
 *   stage?: string,
 *   status?: string,
 *   elapsed_ms?: number,
 *   light?: { index?: number, total?: number } | null,
 * }} args
 * @returns {string}
 */
export function buildProgressHeadlineKo(args) {
  const stage = String(args?.stage || '').trim()
  const base = stage ? getText2SqlStageLabelKo(stage) : '진행 중'

  const idx = args?.light?.index
  const total = args?.light?.total
  if (typeof idx === 'number' && typeof total === 'number' && total > 0) {
    return `${base} (${Math.min(idx, total)}/${total})`
  }
  return base
}

/**
 * Heuristic progress estimation.
 * - Uses stage completion ratio (done/total) as the primary signal.
 * - For light_queries: uses item progress (index/total) when available.
 * - For other in-progress stages: uses a small fixed partial (default 0.3).
 *
 * @param {{
 *   stageOrder: string[],
 *   stagesByName: Record<string, { status?: 'start'|'done'|'error' } | undefined>,
 *   currentStage?: string | null,
 *   light?: { index?: number, total?: number } | null,
 *   inProgressPartial?: number
 * }} args
 * @returns {number} percent 0..100
 */
export function estimateProgressPercent(args) {
  const order = Array.isArray(args?.stageOrder) ? args.stageOrder : []
  const stagesByName = args?.stagesByName && typeof args.stagesByName === 'object' ? args.stagesByName : {}
  if (!order.length) return 0

  let done = 0
  for (const st of order) {
    const s = stagesByName?.[st]?.status
    if (s === 'done') done += 1
  }

  const cur = String(args?.currentStage || '').trim()
  let partial = 0
  if (cur) {
    if (cur === 'light_queries' || cur === 'controller_validate' || cur === 'controller_repair') {
      const idx = args?.light?.index
      const total = args?.light?.total
      if (typeof idx === 'number' && typeof total === 'number' && total > 0) {
        partial = Math.max(0, Math.min(1, idx / total))
      } else if (stagesByName?.[cur]?.status === 'start') {
        partial = typeof args?.inProgressPartial === 'number' ? args.inProgressPartial : 0.3
      }
    } else if (stagesByName?.[cur]?.status === 'start') {
      partial = typeof args?.inProgressPartial === 'number' ? args.inProgressPartial : 0.3
    }
  }

  const raw = (done + partial) / order.length
  const pct = Math.round(Math.max(0, Math.min(1, raw)) * 100)
  // Avoid showing 100% before completion in running state (caller can override on completed).
  return Math.max(0, Math.min(100, pct))
}

