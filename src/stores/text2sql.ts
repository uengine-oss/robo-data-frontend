/**
 * text2sql.ts
 * Text2SQL (ReAct) 상태 관리 스토어
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { text2sqlApi } from '@/services/api'
import {
  buildProgressHeadlineKo,
  estimateProgressPercent,
  formatCountsSummaryKo,
  getText2SqlStageLabelKo
} from '@/utils/text2sqlProgress'
import type {
  ReactStatus,
  ReactPhase,
  ReactStepModel,
  ReactExecutionResult,
  ReactResponseModel,
  ReactRequest,
  ReactPhaseData,
  Text2SqlTableInfo,
  Text2SqlColumnInfo
} from '@/types'

// ============================================================================
// 헬퍼 함수
// ============================================================================

function sortSteps(steps: ReactStepModel[]): ReactStepModel[] {
  return [...steps].sort((a, b) => a.iteration - b.iteration)
}

function mergeSteps(existing: ReactStepModel[], incoming: ReactStepModel[]): ReactStepModel[] {
  const byIteration = new Map<number, ReactStepModel>()
  for (const step of existing) {
    byIteration.set(step.iteration, step)
  }
  for (const step of incoming) {
    byIteration.set(step.iteration, step)
  }
  return sortSteps(Array.from(byIteration.values()))
}

// ============================================================================
// ReAct 스토어
// ============================================================================

export const useReactStore = defineStore('react', () => {
  // 상태
  const currentQuestion = ref('')
  const status = ref<ReactStatus>('idle')
  const steps = ref<ReactStepModel[]>([])
  const partialSql = ref<string>('')
  const finalSql = ref<string | null>(null)
  const validatedSql = ref<string | null>(null)
  const executionResult = ref<ReactExecutionResult | null>(null)
  const collectedMetadata = ref<string>('')
  const warnings = ref<string[]>([])
  const error = ref<string | null>(null)
  const sessionState = ref<string | null>(null)
  // completed 이후 follow-up 연속질문용 (ask_user session_state와 분리)
  const conversationState = ref<string | null>(null)
  const questionToUser = ref<string | null>(null)
  const remainingToolCalls = ref<number>(0)
  const abortController = ref<AbortController | null>(null)
  
  // Phase 상태 (실시간 진행 표시용)
  const currentPhase = ref<ReactPhase>('idle')
  const currentIteration = ref<number>(0)
  const currentPhaseData = ref<ReactPhaseData | null>(null)
  
  // 토큰 스트리밍 상태
  const streamingText = ref<string>('') // 디버그용 raw 토큰 누적 (옵션)
  const isStreaming = ref<boolean>(false) // legacy: phase 기반 표시와 호환 유지

  // 섹션별 실시간 스트리밍 상태 (iteration 단위)
  type MetadataItemType = 'table' | 'column' | 'value' | 'relationship' | 'constraint'
  interface LiveIterationState {
    sections: Record<string, string>
    metadata: Record<MetadataItemType, Array<Record<string, unknown>>>
    isRepairing: boolean
    exploringOpen: boolean
  }

  const liveByIteration = ref<Record<number, LiveIterationState>>({})
  const debugStreamRawXmlTokens = ref<boolean>(false)

  // ============================================================================
  // 진행 상황(문맥 수집/보강) - 비기술 사용자용
  // ============================================================================

  type PipelineStageStatus = 'start' | 'done' | 'error'
  interface PipelineStageState {
    pipeline: string
    stage: string
    seq: number
    status: PipelineStageStatus
    started_at_ms?: number
    done_at_ms?: number
    elapsed_ms?: number
    counts?: Record<string, number>
    notes?: string[]
    error?: string
  }

  interface LightQueryProgressState {
    index: number
    total: number
    pass: number
    fail: number
  }

  interface ControllerCandidateProgressState {
    index: number
    total: number
    pass: number
    fail: number
  }

  interface ControllerRepairProgressState {
    index: number
    total: number
    pass: number
    fail: number
  }

  interface ProgressLogItem {
    ts_ms: number
    kind:
      | 'prefetch'
      | 'prefetch_error'
      | 'context_refresh'
      | 'context_refresh_error'
      | 'pipeline_stage'
      | 'pipeline_item'
    message: string
    details?: Record<string, unknown>
  }

  // key: `${pipeline}:${stage}`
  const pipelineStages = ref<Record<string, PipelineStageState>>({})
  const pipelineStageOrder = ref<string[]>([])
  const lightQueryProgress = ref<LightQueryProgressState | null>(null)
  const controllerCandidateProgress = ref<ControllerCandidateProgressState | null>(null)
  const controllerRepairProgress = ref<ControllerRepairProgressState | null>(null)
  // UX: sticky counts snapshot to avoid flicker when stages transition quickly.
  // This holds the latest known counts across stages within a single run.
  const stickyCounts = ref<Record<string, number>>({})
  const progressLog = ref<ProgressLogItem[]>([])
  const progressLastUpdatedMs = ref<number>(0)
  const pipelineStageOrderFixed = [
    'embedding',
    'enrich',
    'table_search',
    'column_search',
    'fk_relationships',
    'resolved_values',
    'suggestions',
    'light_queries',
    'controller_requirements',
    'controller_candidates',
    'controller_validate',
    'controller_repair'
  ]
  const pipelineDetailsMinElapsedMs = 500
  // UX: count chips can get too noisy/wide when many appear (sticky).
  // Keep only a small “primary” set by default; allow the UI to show all in details.
  const progressDetailMaxPrimary = 3
  const _countChipLabelByKey: Record<string, string> = {
    table_candidates: '후보 테이블',
    selected_tables: '선정 테이블',
    column_candidates: '후보 컬럼',
    resolved_values: '해결된 값',
    fk_relationships: '관계',
    light_queries_total: '샘플 쿼리',
    light_queries_pass: '샘플 통과',
    requirements_total: '요구사항',
    candidates_total: '후보 답안',
    repair_rounds_total: '수정 라운드'
  }
  const _countChipDefaultOrder: string[] = [
    'table_candidates',
    'selected_tables',
    'column_candidates',
    'resolved_values',
    'fk_relationships',
    'light_queries_pass',
    'light_queries_total',
    'requirements_total',
    'candidates_total',
    'repair_rounds_total'
  ]
  const _stageToPreferredCountKeys: Record<string, string[]> = {
    table_search: ['table_candidates', 'selected_tables'],
    column_search: ['column_candidates', 'selected_tables'],
    fk_relationships: ['fk_relationships'],
    resolved_values: ['resolved_values'],
    suggestions: ['selected_tables', 'column_candidates'],
    light_queries: ['light_queries_pass', 'light_queries_total'],
    controller_requirements: ['requirements_total'],
    controller_candidates: ['candidates_total'],
    controller_validate: ['candidates_total'],
    controller_repair: ['repair_rounds_total']
  }

  function _formatCountChip(counts: Record<string, number>, key: string): string | null {
    const label = _countChipLabelByKey[key]
    if (!label) return null
    const v = counts?.[key]
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null
    return `${label} ${v}개`
  }

  function _buildPrimaryCountChips(counts: Record<string, number>, stage: string | null): string[] {
    const c = counts && typeof counts === 'object' ? counts : {}
    const s = String(stage || '').trim()

    const preferred = _stageToPreferredCountKeys[s] || []
    const out: string[] = []
    const used = new Set<string>()

    for (const k of preferred) {
      const chip = _formatCountChip(c, k)
      if (chip) {
        out.push(chip)
        used.add(k)
        if (out.length >= progressDetailMaxPrimary) return out
      }
    }

    // Fill the remaining slots from the default order for stability.
    for (const k of _countChipDefaultOrder) {
      if (used.has(k)) continue
      const chip = _formatCountChip(c, k)
      if (chip) {
        out.push(chip)
        used.add(k)
        if (out.length >= progressDetailMaxPrimary) break
      }
    }

    return out
  }

  // 일시정지 상태
  const isPaused = ref<boolean>(false)
  const pausedSessionState = ref<string | null>(null)
  const pauseFeedback = ref<string>('')

  // Computed
  const isRunning = computed(() => status.value === 'running' && !isPaused.value)
  const isWaitingUser = computed(() => status.value === 'needs_user_input')
  const hasSteps = computed(() => steps.value.length > 0)
  const hasExecutionResult = computed(() => executionResult.value !== null)
  const latestStep = computed(() =>
    steps.value.length > 0 ? steps.value[steps.value.length - 1] : null
  )
  const latestPartialSql = computed(() => latestStep.value?.partial_sql || partialSql.value)

  const pipelineStageList = computed(() => {
    const out: PipelineStageState[] = []
    for (const key of pipelineStageOrder.value) {
      const st = pipelineStages.value[key]
      if (st) out.push(st)
    }
    return out
  })

  const _alwaysShowStages = new Set(['light_queries', 'controller_validate', 'controller_repair'])

  const visiblePipelineStageList = computed(() => {
    const all = pipelineStageList.value
    if (!all.length) return []

    const currentStage = currentPipelineStage.value?.stage || null
    const minMs = pipelineDetailsMinElapsedMs

    const visible = all.filter(st => {
      if (!st) return false
      if (st.status === 'error') return true
      if (st.status === 'start') return true // always show current in-progress
      if (_alwaysShowStages.has(st.stage)) return true // user-facing “검증/안전검증”은 항상 유의미
      if (typeof st.elapsed_ms === 'number') return st.elapsed_ms >= minMs
      // If elapsed is missing, default to hiding unless it’s the current stage.
      if (currentStage && st.stage === currentStage) return true
      return false
    })

    // Never show an empty list if we have progress; keep the last known stage.
    if (!visible.length) return [all[all.length - 1]]
    return visible
  })

  const hiddenPipelineStageCount = computed(() => {
    const total = pipelineStageList.value.length
    const visible = visiblePipelineStageList.value.length
    return Math.max(0, total - visible)
  })

  const currentPipelineStage = computed(() => {
    // Prefer running stage; else last stage in order.
    const ordered = pipelineStageList.value
    for (let i = ordered.length - 1; i >= 0; i--) {
      if (ordered[i]?.status === 'start') return ordered[i]
    }
    return ordered.length ? ordered[ordered.length - 1] : null
  })

  const progressHeadline = computed(() => {
    const st = currentPipelineStage.value
    if (st) {
      // Reuse headline format (i/N) for both light_queries and controller candidate/repair progress.
      const light =
        st.pipeline === 'build_sql_context' && st.stage === 'light_queries'
          ? (lightQueryProgress.value ? { index: lightQueryProgress.value.index, total: lightQueryProgress.value.total } : null)
          : st.pipeline === 'controller' && st.stage === 'controller_validate'
            ? (controllerCandidateProgress.value ? { index: controllerCandidateProgress.value.index, total: controllerCandidateProgress.value.total } : null)
            : st.pipeline === 'controller' && st.stage === 'controller_repair'
              ? (controllerRepairProgress.value ? { index: controllerRepairProgress.value.index, total: controllerRepairProgress.value.total } : null)
              : null
      return buildProgressHeadlineKo({
        stage: st.stage,
        status: st.status,
        elapsed_ms: st.elapsed_ms,
        light
      })
    }
    // Fallback for older servers (no pipeline_stage)
    return isRunning.value ? '문맥을 수집하는 중' : ''
  })

  const progressDetailsAll = computed(() => {
    // Use sticky snapshot to avoid “appears then disappears” flicker.
    return formatCountsSummaryKo(stickyCounts.value)
  })

  const progressDetails = computed(() => {
    // Primary chips only (avoid very long chip rows). Full list is available via progressDetailsAll.
    return _buildPrimaryCountChips(stickyCounts.value, currentPipelineStage.value?.stage || null)
  })

  const progressDetailsHiddenCount = computed(() => {
    return Math.max(0, progressDetailsAll.value.length - progressDetails.value.length)
  })

  const estimatedProgressPercent = computed(() => {
    // If no pipeline info yet, keep it low but non-zero to reduce “stuck” feeling.
    if (!pipelineStageOrder.value.length && isRunning.value) return 1

    const st = currentPipelineStage.value
    const currentStage = st?.stage || null
    const stagesByName: Record<string, { status?: 'start' | 'done' | 'error' } | undefined> = {}
    for (const stageName of pipelineStageOrderFixed) {
      const pipeline = stageName.startsWith('controller_') ? 'controller' : 'build_sql_context'
      const key = `${pipeline}:${stageName}`
      stagesByName[stageName] = pipelineStages.value[key]
    }
    const pct = estimateProgressPercent({
      stageOrder: pipelineStageOrderFixed,
      stagesByName,
      currentStage,
      light:
        currentStage === 'light_queries'
          ? (lightQueryProgress.value ? { index: lightQueryProgress.value.index, total: lightQueryProgress.value.total } : null)
          : currentStage === 'controller_validate'
            ? (controllerCandidateProgress.value ? { index: controllerCandidateProgress.value.index, total: controllerCandidateProgress.value.total } : null)
            : currentStage === 'controller_repair'
              ? (controllerRepairProgress.value ? { index: controllerRepairProgress.value.index, total: controllerRepairProgress.value.total } : null)
              : null,
      inProgressPartial: 0.3
    })
    // Avoid showing 100% while running.
    if (isRunning.value) return Math.min(99, Math.max(1, pct))
    return pct
  })

  // 내부 함수
  function resetState() {
    steps.value = []
    partialSql.value = ''
    finalSql.value = null
    validatedSql.value = null
    executionResult.value = null
    collectedMetadata.value = ''
    warnings.value = []
    error.value = null
    sessionState.value = null
    // NOTE: conversationState는 follow-up을 위해 유지한다.
    questionToUser.value = null
    remainingToolCalls.value = 0
    currentPhase.value = 'idle'
    currentIteration.value = 0
    currentPhaseData.value = null
    streamingText.value = ''
    isStreaming.value = false
    liveByIteration.value = {}

    pipelineStages.value = {}
    pipelineStageOrder.value = []
    lightQueryProgress.value = null
    controllerCandidateProgress.value = null
    controllerRepairProgress.value = null
    stickyCounts.value = {}
    progressLog.value = []
    progressLastUpdatedMs.value = 0
  }

  function cancelOngoing() {
    if (abortController.value) {
      abortController.value.abort()
      abortController.value = null
    }
    isPaused.value = false
    pausedSessionState.value = null
    pauseFeedback.value = ''
  }

  // 일시정지: 현재 스트림을 중단하고 상태 저장
  function pause() {
    if (abortController.value) {
      abortController.value.abort()
      abortController.value = null
    }
    isPaused.value = true
    pausedSessionState.value = sessionState.value
    status.value = 'running' // 여전히 running 상태로 유지 (UI에서 paused 표시)
  }

  // 재개: 피드백과 함께 계속 진행
  async function resume(feedback?: string) {
    isPaused.value = false
    const resumeSessionState = pausedSessionState.value || sessionState.value
    pausedSessionState.value = null
    
    const controller = new AbortController()
    abortController.value = controller
    
    // 피드백이 있으면 user_response로 전달
    const feedbackText = feedback?.trim() || pauseFeedback.value?.trim()
    pauseFeedback.value = ''
    
    // 세션 상태가 있으면 이어서, 없으면 처음부터 (피드백 포함)
    if (resumeSessionState) {
      await consumeStream(
        {
          question: currentQuestion.value,
          session_state: resumeSessionState,
          user_response: feedbackText || undefined,
          conversation_state: conversationState.value,
        },
        controller
      )
    } else {
      // 세션 상태가 없으면 원래 질문 + 피드백으로 새로 시작
      const enhancedQuestion = feedbackText 
        ? `${currentQuestion.value}\n\n[사용자 피드백: ${feedbackText}]`
        : currentQuestion.value
      await consumeStream(
        {
          question: enhancedQuestion,
          conversation_state: conversationState.value,
        },
        controller
      )
    }
    
    if (abortController.value === controller) {
      abortController.value = null
    }
  }

  function applyStateSnapshot(snapshot?: Record<string, unknown>) {
    if (!snapshot) return
    if (typeof snapshot.remaining_tool_calls === 'number') {
      remainingToolCalls.value = snapshot.remaining_tool_calls
    }
    if (typeof snapshot.partial_sql === 'string') {
      partialSql.value = snapshot.partial_sql
    }
  }

  function upsertStep(step: ReactStepModel) {
    steps.value = mergeSteps(steps.value, [step])
  }

  function applyResponse(response: ReactResponseModel) {
    steps.value = mergeSteps(steps.value, response.steps)
    collectedMetadata.value = response.collected_metadata
    partialSql.value = response.partial_sql
    remainingToolCalls.value = response.remaining_tool_calls
    sessionState.value = response.session_state ?? null
    if (response.conversation_state !== undefined) {
      conversationState.value = response.conversation_state ?? null
    }
    questionToUser.value = response.question_to_user ?? null
    warnings.value = response.warnings ?? []
    if (response.final_sql !== undefined) {
      finalSql.value = response.final_sql ?? null
    }
    if (response.validated_sql !== undefined) {
      validatedSql.value = response.validated_sql ?? null
    }
    executionResult.value = response.execution_result ?? null
  }

  function ensureLiveIteration(iter: number) {
    if (!liveByIteration.value[iter]) {
      liveByIteration.value[iter] = {
        sections: {},
        metadata: { table: [], column: [], value: [], relationship: [], constraint: [] },
        isRepairing: false,
        exploringOpen: true
      }
    }
  }

  function setExploringOpen(iteration: number, open: boolean) {
    ensureLiveIteration(iteration)
    liveByIteration.value[iteration].exploringOpen = open
  }

  function _nowMs(): number {
    return Date.now()
  }

  function _pushProgressLog(item: Omit<ProgressLogItem, 'ts_ms'> & { ts_ms?: number }) {
    const ts = typeof item.ts_ms === 'number' ? item.ts_ms : _nowMs()
    progressLog.value.push({ ...item, ts_ms: ts })
    // cap
    if (progressLog.value.length > 200) {
      progressLog.value = progressLog.value.slice(-200)
    }
    progressLastUpdatedMs.value = ts
  }

  function _upsertPipelineStage(next: PipelineStageState) {
    const key = `${next.pipeline}:${next.stage}`
    const prev = pipelineStages.value[key]
    if (!prev) {
      pipelineStageOrder.value.push(key)
      pipelineStages.value[key] = { ...next }
      return
    }
    pipelineStages.value[key] = { ...prev, ...next }
  }

  async function consumeStream(request: ReactRequest, controller: AbortController) {
    try {
      for await (const event of text2sqlApi.reactStream(request, { signal: controller.signal })) {
        switch (event.event) {
          case 'token': {
            // 디버그용 raw XML 토큰 스트리밍
            if (debugStreamRawXmlTokens.value) {
              if (!isStreaming.value) {
                isStreaming.value = true
                streamingText.value = ''
              }
              streamingText.value += event.token
              currentIteration.value = event.iteration
            }
            break
          }
          case 'prefetch': {
            _pushProgressLog({
              kind: 'prefetch',
              message: `문맥 수집 완료 (${(event.elapsed_ms / 1000).toFixed(1)}초)`,
              details: {
                tool_name: event.tool_name,
                remaining_tool_calls: event.remaining_tool_calls
              }
            })
            break
          }
          case 'prefetch_error': {
            _pushProgressLog({
              kind: 'prefetch_error',
              message: `문맥 수집 중 오류: ${event.error}`,
              details: { tool_name: event.tool_name, elapsed_ms: event.elapsed_ms }
            })
            break
          }
          case 'context_refresh': {
            const delta = event.context_delta || {}
            const deltaParts: string[] = []
            if (typeof delta.tables_added === 'number') deltaParts.push(`테이블 +${delta.tables_added}`)
            if (typeof delta.values_added === 'number') deltaParts.push(`값 +${delta.values_added}`)
            if (typeof delta.relationships_added === 'number') deltaParts.push(`관계 +${delta.relationships_added}`)

            const suffix = deltaParts.length ? ` · ${deltaParts.join(', ')}` : ''
            const idx = typeof event.enrichment_index === 'number' ? `(${event.enrichment_index})` : ''
            _pushProgressLog({
              kind: 'context_refresh',
              message: `문맥 보강 완료${idx} (${(event.elapsed_ms / 1000).toFixed(1)}초)${suffix}`,
              details: {
                tool_name: event.tool_name,
                remaining_tool_calls: event.remaining_tool_calls,
                mode: event.mode
              }
            })
            break
          }
          case 'context_refresh_error': {
            _pushProgressLog({
              kind: 'context_refresh_error',
              message: `문맥 보강 중 오류: ${event.error}`,
              details: {
                tool_name: event.tool_name,
                mode: event.mode
              }
            })
            break
          }
          case 'pipeline_stage': {
            const ts = typeof event.ts_ms === 'number' ? event.ts_ms : _nowMs()
            // A new build_sql_context run starts from embedding(seq=1). Reset progress state to avoid noisy duplicates.
            if (event.pipeline === 'build_sql_context' && event.stage === 'embedding' && event.status === 'start' && event.seq === 1) {
              pipelineStages.value = {}
              pipelineStageOrder.value = []
              lightQueryProgress.value = null
              controllerCandidateProgress.value = null
              controllerRepairProgress.value = null
              stickyCounts.value = {}
              progressLog.value = []
            }
            const key = `${event.pipeline}:${event.stage}`
            const prev = pipelineStages.value[key]
            _upsertPipelineStage({
              pipeline: event.pipeline,
              stage: event.stage,
              seq: event.seq,
              status: event.status,
              // Preserve started_at_ms on repeated "start" events (heartbeat).
              started_at_ms: event.status === 'start' ? (prev?.started_at_ms ?? ts) : prev?.started_at_ms,
              done_at_ms: event.status === 'done' || event.status === 'error' ? ts : prev?.done_at_ms,
              elapsed_ms: typeof event.elapsed_ms === 'number' ? event.elapsed_ms : prev?.elapsed_ms,
              counts: event.counts || prev?.counts,
              notes: event.notes || prev?.notes,
              error: event.error || prev?.error
            })

            // Merge counts into sticky snapshot (best-effort).
            if (event.counts && typeof event.counts === 'object') {
              const next: Record<string, number> = { ...stickyCounts.value }
              for (const [k, v] of Object.entries(event.counts)) {
                if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
                  next[String(k)] = v
                }
              }
              stickyCounts.value = next
            }

            _pushProgressLog({
              kind: 'pipeline_stage',
              ts_ms: ts,
              message:
                event.status === 'start'
                  ? `${getText2SqlStageLabelKo(event.stage)}…`
                  : event.status === 'done'
                    ? `${getText2SqlStageLabelKo(event.stage)} 완료`
                    : `${getText2SqlStageLabelKo(event.stage)} 오류`,
              details: {
                stage: event.stage,
                status: event.status,
                elapsed_ms: event.elapsed_ms,
                counts: event.counts,
                notes: event.notes,
                error: event.error
              }
            })
            break
          }
          case 'pipeline_item': {
            const ts = typeof event.ts_ms === 'number' ? event.ts_ms : _nowMs()
            if (String(event.pipeline) === 'build_sql_context' && String(event.stage) === 'light_queries') {
              const total = Math.max(1, Number(event.total || 1))
              const idx = Math.max(1, Number(event.index || 1))
              const prev = lightQueryProgress.value || { index: 0, total, pass: 0, fail: 0 }
              const verdict = String(event.verdict || '').toUpperCase()
              const passInc = verdict === 'PASS' ? 1 : 0
              const failInc = verdict === 'FAIL' ? 1 : 0
              const nextLq = {
                index: idx,
                total,
                pass: prev.pass + passInc,
                fail: prev.fail + failInc
              }
              lightQueryProgress.value = nextLq
              // Keep sticky counts stable across stage transitions.
              stickyCounts.value = {
                ...stickyCounts.value,
                light_queries_total: nextLq.total,
                light_queries_pass: nextLq.pass
              }
            } else if (
              String(event.pipeline) === 'controller' &&
              String(event.stage) === 'controller_validate' &&
              String(event.item_type) === 'candidate'
            ) {
              const total = Math.max(1, Number(event.total || 1))
              const idx = Math.max(1, Number(event.index || 1))
              const prev = controllerCandidateProgress.value || { index: 0, total, pass: 0, fail: 0 }
              const verdict = String(event.verdict || '').toUpperCase()
              const passInc = verdict === 'PASS' ? 1 : 0
              const failInc = verdict === 'FAIL' ? 1 : 0
              const nextCand = {
                index: idx,
                total,
                pass: prev.pass + passInc,
                fail: prev.fail + failInc
              }
              controllerCandidateProgress.value = nextCand
              stickyCounts.value = {
                ...stickyCounts.value,
                candidates_total: nextCand.total
              }
            } else if (
              String(event.pipeline) === 'controller' &&
              String(event.stage) === 'controller_repair' &&
              String(event.item_type) === 'repair_round'
            ) {
              const total = Math.max(1, Number(event.total || 1))
              const idx = Math.max(1, Number(event.index || 1))
              const prev = controllerRepairProgress.value || { index: 0, total, pass: 0, fail: 0 }
              const verdict = String(event.verdict || '').toUpperCase()
              const passInc = verdict === 'PASS' ? 1 : 0
              const failInc = verdict === 'FAIL' ? 1 : 0
              const nextRepair = {
                index: idx,
                total,
                pass: prev.pass + passInc,
                fail: prev.fail + failInc
              }
              controllerRepairProgress.value = nextRepair
              stickyCounts.value = {
                ...stickyCounts.value,
                repair_rounds_total: nextRepair.total
              }
            }
            _pushProgressLog({
              kind: 'pipeline_item',
              ts_ms: ts,
              message: `${getText2SqlStageLabelKo(event.stage)} (${event.index}/${event.total})`,
              details: {
                stage: event.stage,
                item_type: event.item_type,
                verdict: event.verdict,
                row_count: event.row_count,
                elapsed_ms: event.elapsed_ms
              }
            })
            break
          }
          case 'section_delta': {
            const iter = event.iteration
            ensureLiveIteration(iter)
            const wasReasoningEmpty =
              event.section === 'reasoning' &&
              ((liveByIteration.value[iter].sections['reasoning'] || '').length === 0)
            const prev = liveByIteration.value[iter].sections[event.section] || ''
            liveByIteration.value[iter].sections[event.section] = prev + (event.delta || '')
            // Auto-collapse Exploring when Reasoning starts streaming (first delta)
            if (wasReasoningEmpty && (event.delta || '').length > 0) {
              liveByIteration.value[iter].exploringOpen = false
            }
            currentIteration.value = iter
            break
          }
          case 'metadata_item': {
            const iter = event.iteration
            ensureLiveIteration(iter)
            const t = event.item_type
            if (t && liveByIteration.value[iter].metadata[t]) {
              liveByIteration.value[iter].metadata[t].push(event.item || {})
            }
            currentIteration.value = iter
            break
          }
          case 'format_repair': {
            const iter = event.iteration
            ensureLiveIteration(iter)
            liveByIteration.value[iter].isRepairing = true
            currentIteration.value = iter
            break
          }
          case 'phase': {
            // 실시간 진행 상태 업데이트
            currentPhase.value = event.phase
            currentIteration.value = event.iteration
            currentPhaseData.value = event.data
            applyStateSnapshot(event.state)
            // thinking이 아닌 다른 phase로 전환되면 스트리밍 종료
            if (event.phase !== 'thinking') {
              isStreaming.value = false
            }
            break
          }
          case 'step': {
            upsertStep(event.step)
            applyStateSnapshot(event.state)

            // 최종 step과 live 섹션 정합성 맞추기(의미 있게 다를 때만 덮어쓰기)
            const iter = event.step.iteration
            const live = liveByIteration.value[iter]
            if (live) {
              live.isRepairing = false

              const normalize = (s: string) => {
                const text = (s ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
                return text
                  .split('\n')
                  .map(line => line.replace(/[ \t]+/g, ' ').trimEnd())
                  .join('\n')
                  .trim()
              }

              const stringifyParams = (params: Record<string, unknown>) => {
                try {
                  const entries = Object.entries(params ?? {})
                  if (entries.length === 0) return ''
                  return entries
                    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
                    .join(', ')
                } catch {
                  return ''
                }
              }

              const parseMetadataXml = (metadataXml: string) => {
                try {
                  if (!metadataXml) return null
                  const parser = new DOMParser()
                  const doc = parser.parseFromString(metadataXml, 'application/xml')
                  // Basic parse error detection
                  if (doc.getElementsByTagName('parsererror')?.length) return null

                  const pickItems = (tagName: string) => {
                    const els = Array.from(doc.getElementsByTagName(tagName))
                    return els.map(el => {
                      const item: Record<string, unknown> = { _type: tagName }
                      Array.from(el.children).forEach(child => {
                        const key = child.tagName
                        const val = (child.textContent || '').trim()
                        if (val) item[key] = val
                      })
                      return item
                    })
                  }

                  return {
                    table: pickItems('table'),
                    column: pickItems('column'),
                    value: pickItems('value'),
                    relationship: pickItems('relationship'),
                    constraint: pickItems('constraint')
                  }
                } catch {
                  return null
                }
              }

              const patchIfDifferent = (key: string, finalText: string) => {
                const cur = live.sections[key] || ''
                if (normalize(cur) !== normalize(finalText)) {
                  live.sections[key] = finalText || ''
                }
              }

              patchIfDifferent('reasoning', event.step.reasoning || '')
              patchIfDifferent('partial_sql', event.step.partial_sql || '')
              patchIfDifferent('sql_completeness_check.is_complete', String(event.step.sql_completeness?.is_complete ?? ''))
              patchIfDifferent('sql_completeness_check.missing_info', event.step.sql_completeness?.missing_info || '')
              patchIfDifferent('sql_completeness_check.confidence_level', event.step.sql_completeness?.confidence_level || '')
              patchIfDifferent('tool_call.tool_name', event.step.tool_call?.name || '')
              patchIfDifferent('tool_call.parameters', stringifyParams(event.step.tool_call?.parameters ?? {}))

              // collected_metadata는 아이템 단위 스트리밍을 우선 사용하되,
              // step 완료 시점에는 metadata_xml을 파싱해 누락된 아이템을 보완(필요 시 덮어쓰기)
              const parsedMeta = parseMetadataXml(event.step.metadata_xml || '')
              if (parsedMeta) {
                // 단순히 덮어쓰기(정합성 우선). 필요하면 이후에 merge 전략으로 확장 가능.
                live.metadata.table = parsedMeta.table
                live.metadata.column = parsedMeta.column
                live.metadata.value = parsedMeta.value
                live.metadata.relationship = parsedMeta.relationship
                live.metadata.constraint = parsedMeta.constraint
              }
            }

            // 스텝 완료 후 phase 초기화 (다음 스텝 대기)
            currentPhase.value = 'idle'
            currentPhaseData.value = null
            streamingText.value = ''
            isStreaming.value = false
            break
          }
          case 'needs_user_input': {
            applyResponse(event.response)
            status.value = 'needs_user_input'
            currentPhase.value = 'idle'
            return
          }
          case 'cache_hit': {
            // 캐시 히트 알림 - 다음 이벤트(complete)에서 실제 결과 처리
            console.log('Cache hit:', event.message, 'Hit count:', event.hit_count)
            break
          }
          case 'completed': {
            applyResponse(event.response)
            status.value = 'completed'
            currentPhase.value = 'idle'
            return
          }
          case 'error': {
            error.value = event.message
            status.value = 'error'
            currentPhase.value = 'idle'
            return
          }
          default: {
            // Backward/forward compatibility: some servers may send "complete".
            const anyEv = event as unknown as { event?: string; response?: ReactResponseModel }
            if (anyEv?.event === 'complete' && anyEv.response) {
              applyResponse(anyEv.response)
              status.value = 'completed'
              currentPhase.value = 'idle'
              return
            }
            break
          }
        }
      }
    } catch (err: unknown) {
      if (controller.signal.aborted) {
        return
      }
      console.error('ReAct 스트리밍 중 오류', err)
      error.value = err instanceof Error ? err.message : 'ReAct 실행 중 오류가 발생했습니다.'
      status.value = 'error'
      currentPhase.value = 'idle'
    }
  }

  // 공개 함수
  async function start(
    question: string,
    options?: {
      maxToolCalls?: number
      maxSqlSeconds?: number
      debugStreamRawXmlTokens?: boolean
      useCache?: boolean
      schemaFilter?: string[]  // 검색 대상 스키마 제한 (예: ['dw']는 OLAP만 검색)
    }
  ) {
    cancelOngoing()
    resetState()
    currentQuestion.value = question
    status.value = 'running'
    error.value = null

    const controller = new AbortController()
    abortController.value = controller
    debugStreamRawXmlTokens.value = !!options?.debugStreamRawXmlTokens
    const isFollowup = !!conversationState.value
    await consumeStream(
      {
        question,
        max_tool_calls: options?.maxToolCalls,
        max_sql_seconds: options?.maxSqlSeconds,
        debug_stream_xml_tokens: debugStreamRawXmlTokens.value,
        // 정책: follow-up 연속질문에서는 캐시 사용하지 않음
        use_cache: isFollowup ? false : (options?.useCache ?? true),
        conversation_state: conversationState.value,
        schema_filter: options?.schemaFilter
      },
      controller
    )
    if (abortController.value === controller) {
      abortController.value = null
    }
  }

  async function continueWithResponse(userResponse: string) {
    if (!sessionState.value) {
      throw new Error('세션 상태가 없습니다.')
    }
    cancelOngoing()
    status.value = 'running'
    error.value = null
    questionToUser.value = null

    const controller = new AbortController()
    abortController.value = controller
    await consumeStream(
      {
        question: currentQuestion.value,
        session_state: sessionState.value,
        user_response: userResponse,
        conversation_state: conversationState.value,
        debug_stream_xml_tokens: debugStreamRawXmlTokens.value
      },
      controller
    )
    if (abortController.value === controller) {
      abortController.value = null
    }
  }

  function cancel() {
    cancelOngoing()
    status.value = 'idle'
  }

  function clear() {
    cancelOngoing()
    resetState()
    currentQuestion.value = ''
    conversationState.value = null
    status.value = 'idle'
  }

  // 새 대화(새 쿼리) 시작 시 명시적으로 conversationState 초기화
  function clearConversationState() {
    conversationState.value = null
  }

  return {
    currentQuestion,
    status,
    steps,
    partialSql,
    finalSql,
    validatedSql,
    executionResult,
    collectedMetadata,
    warnings,
    error,
    sessionState,
    conversationState,
    questionToUser,
    remainingToolCalls,
    // Phase 상태
    currentPhase,
    currentIteration,
    currentPhaseData,
    // 토큰 스트리밍
    streamingText,
    isStreaming,
    // 섹션별 실시간 스트리밍
    liveByIteration,
    debugStreamRawXmlTokens,
    setExploringOpen,
    // 진행 상황(문맥 수집/보강)
    pipelineStageList,
    visiblePipelineStageList,
    hiddenPipelineStageCount,
    currentPipelineStage,
    progressHeadline,
    progressDetails,
    progressDetailsAll,
    progressDetailsHiddenCount,
    estimatedProgressPercent,
    progressLog,
    progressLastUpdatedMs,
    // 일시정지 상태
    isPaused,
    pauseFeedback,
    // Computed
    isRunning,
    isWaitingUser,
    hasSteps,
    hasExecutionResult,
    latestStep,
    latestPartialSql,
    // Actions
    start,
    continueWithResponse,
    cancel,
    clear,
    clearConversationState,
    pause,
    resume
  }
})

// ============================================================================
// Schema 스토어
// ============================================================================

// ============================================================================
// History 스토어
// ============================================================================

// 스텝 상세 정보 타입
export interface QueryStep {
  tool_name?: string
  tool_input?: Record<string, unknown>
  tool_result?: string
  reasoning?: string
  timestamp?: string
  iteration?: number
}

export interface QueryHistoryItem {
  id: number
  question: string
  final_sql: string | null
  validated_sql: string | null
  execution_result: ReactExecutionResult | null
  row_count: number | null
  status: 'pending' | 'completed' | 'error'
  error_message: string | null
  steps_count: number | null
  execution_time_ms: number | null
  created_at: string
  updated_at: string
  metadata: Record<string, unknown> | null
  steps: QueryStep[] | null  // 전체 도구 호출 과정
}

export interface QueryHistoryResponse {
  items: QueryHistoryItem[]
  total: number
  page: number
  page_size: number
}

export const useHistoryStore = defineStore('text2sql-history', () => {
  const items = ref<QueryHistoryItem[]>([])
  const total = ref(0)
  const page = ref(1)
  const pageSize = ref(20)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const selectedItem = ref<QueryHistoryItem | null>(null)

  // API base URL
  const API_BASE = 'http://localhost:9000/text2sql/history'

  // 히스토리 목록 불러오기
  async function fetchHistory(options?: { page?: number; search?: string; status?: string }) {
    loading.value = true
    error.value = null

    try {
      const params = new URLSearchParams()
      params.set('page', String(options?.page || 1))
      params.set('page_size', String(pageSize.value))
      if (options?.search) params.set('search', options.search)
      if (options?.status) params.set('status', options.status)

      const response = await fetch(`${API_BASE}?${params}`)
      if (!response.ok) throw new Error('Failed to fetch history')

      const data: QueryHistoryResponse = await response.json()
      items.value = data.items
      total.value = data.total
      page.value = data.page
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch history'
      console.error('History fetch error:', err)
    } finally {
      loading.value = false
    }
  }

  // 히스토리 항목 저장
  async function saveToHistory(entry: {
    question: string
    final_sql?: string | null
    validated_sql?: string | null
    execution_result?: ReactExecutionResult | null
    row_count?: number | null
    status?: 'completed' | 'error'
    error_message?: string | null
    steps_count?: number | null
    execution_time_ms?: number | null
    metadata?: Record<string, unknown> | null
  }): Promise<QueryHistoryItem | null> {
    try {
      const response = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry)
      })

      if (!response.ok) throw new Error('Failed to save history')

      const saved: QueryHistoryItem = await response.json()
      // 최신 항목을 리스트 앞에 추가
      items.value = [saved, ...items.value]
      total.value++
      return saved
    } catch (err) {
      console.error('History save error:', err)
      return null
    }
  }

  // 히스토리 항목 삭제
  async function deleteHistory(id: number): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Failed to delete history')

      items.value = items.value.filter(item => item.id !== id)
      total.value--
      if (selectedItem.value?.id === id) {
        selectedItem.value = null
      }
      return true
    } catch (err) {
      console.error('History delete error:', err)
      return false
    }
  }

  // 전체 삭제
  async function deleteAllHistory(): Promise<boolean> {
    try {
      const response = await fetch(API_BASE, { method: 'DELETE' })
      if (!response.ok) throw new Error('Failed to delete all history')

      items.value = []
      total.value = 0
      selectedItem.value = null
      return true
    } catch (err) {
      console.error('History delete all error:', err)
      return false
    }
  }

  // 히스토리 항목 선택
  function selectItem(item: QueryHistoryItem | null) {
    selectedItem.value = item
  }

  // 다음 페이지
  async function nextPage() {
    if (page.value * pageSize.value < total.value) {
      await fetchHistory({ page: page.value + 1 })
    }
  }

  // 이전 페이지
  async function prevPage() {
    if (page.value > 1) {
      await fetchHistory({ page: page.value - 1 })
    }
  }

  return {
    items,
    total,
    page,
    pageSize,
    loading,
    error,
    selectedItem,
    fetchHistory,
    saveToHistory,
    deleteHistory,
    deleteAllHistory,
    selectItem,
    nextPage,
    prevPage
  }
})

// ============================================================================
// Schema 스토어
// ============================================================================

export const useText2SqlSchemaStore = defineStore('text2sql-schema', () => {
  // 상태
  const tables = ref<Text2SqlTableInfo[]>([])
  const selectedTable = ref<Text2SqlTableInfo | null>(null)
  const selectedTableColumns = ref<Text2SqlColumnInfo[]>([])
  const allColumnsMap = ref<Record<string, Text2SqlColumnInfo[]>>({})
  const loading = ref(false)
  const error = ref<string | null>(null)

  // 테이블 목록 로드
  async function loadTables(search?: string, schema?: string) {
    loading.value = true
    error.value = null

    try {
      tables.value = await text2sqlApi.getTables(search, schema)
    } catch (err: unknown) {
      // 에러 상태만 저장하고 다시 throw하지 않음 (조용히 처리)
      error.value = err instanceof Error ? err.message : 'Failed to load tables'
      // 빈 배열로 초기화하여 UI가 깨지지 않도록 함
      tables.value = []
    } finally {
      loading.value = false
    }
  }

  // 테이블 컬럼 로드
  async function loadTableColumns(tableName: string, schema: string = 'public') {
    loading.value = true
    error.value = null

    try {
      selectedTableColumns.value = await text2sqlApi.getTableColumns(tableName, schema)
      allColumnsMap.value[tableName] = selectedTableColumns.value
      return selectedTableColumns.value
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : 'Failed to load columns'
      throw err
    } finally {
      loading.value = false
    }
  }

  // 모든 테이블의 컬럼 로드 (ERD용)
  async function loadAllColumns() {
    for (const table of tables.value) {
      try {
        const columns = await text2sqlApi.getTableColumns(table.name, table.schema)
        allColumnsMap.value[table.name] = columns
      } catch (err) {
        console.error(`Failed to load columns for ${table.name}:`, err)
      }
    }
  }

  // 테이블 선택
  function selectTable(table: Text2SqlTableInfo) {
    selectedTable.value = table
    loadTableColumns(table.name, table.schema)
  }

  // 테이블 컬럼 가져오기 (캐시된)
  function getTableColumns(tableName: string): Text2SqlColumnInfo[] {
    return allColumnsMap.value[tableName] || []
  }

  return {
    tables,
    selectedTable,
    selectedTableColumns,
    allColumnsMap,
    loading,
    error,
    loadTables,
    loadTableColumns,
    loadAllColumns,
    selectTable,
    getTableColumns
  }
})

