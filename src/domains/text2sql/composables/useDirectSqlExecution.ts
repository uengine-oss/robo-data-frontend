import { computed, ref, type Ref } from 'vue'
import { text2sqlApi } from '../api/client'
import { toTabularRows, type DirectSqlStreamEvent } from '../api/contracts'

interface DirectSqlExecutionInput {
  sqlText: Ref<string>
  formatWithAi: Ref<boolean>
  getDatasourceName: () => string | null | undefined
}

export interface DirectSqlAutocorrectInfo {
  mode?: string
  reason?: string
  prepared_sql?: string
  llm_model?: string
  llm_elapsed_ms?: number
}

export function useDirectSqlExecution(input: DirectSqlExecutionInput) {
  const isExecuting = ref(false)
  const loadingMessage = ref('SQL 검증 중...')
  const error = ref<string | null>(null)
  const result = ref<{
    columns: string[]
    rows: unknown[][]
    row_count: number
    execution_time_ms: number
  } | null>(null)
  const aiSummary = ref('')
  const isStreamingSummary = ref(false)
  const requestedAiSummary = ref(false)
  const isAiSummaryPending = ref(false)
  const submittedSql = ref('')
  const validatedSqlFromServer = ref('')
  const autocorrectInfo = ref<DirectSqlAutocorrectInfo | null>(null)
  const showAutocorrectDetails = ref(false)
  const canExecute = computed(() => input.sqlText.value.trim().length > 0)

  function resetExecution() {
    error.value = null
    result.value = null
    aiSummary.value = ''
    isStreamingSummary.value = false
    requestedAiSummary.value = input.formatWithAi.value
    isAiSummaryPending.value = input.formatWithAi.value
    loadingMessage.value = 'SQL 검증 중...'
    submittedSql.value = input.sqlText.value
    validatedSqlFromServer.value = ''
    autocorrectInfo.value = null
    showAutocorrectDetails.value = false
  }

  function finishStreaming() {
    isStreamingSummary.value = false
    isAiSummaryPending.value = false
  }

  function handleEvent(event: DirectSqlStreamEvent) {
    switch (event.event) {
      case 'validating':
        loadingMessage.value = 'SQL 검증 중...'
        break
      case 'validated':
        if (typeof event.validated_sql === 'string') {
          validatedSqlFromServer.value = event.validated_sql
        }
        break
      case 'executing':
        loadingMessage.value = 'SQL 실행 중...'
        break
      case 'autocorrect':
        autocorrectInfo.value = {
          mode: event.mode,
          reason: event.reason,
          prepared_sql: event.prepared_sql,
          llm_model: event.llm_model,
          llm_elapsed_ms: typeof event.llm_elapsed_ms === 'number'
            ? event.llm_elapsed_ms
            : undefined,
        }
        showAutocorrectDetails.value = true
        break
      case 'formatting':
        loadingMessage.value = 'AI가 결과 분석 중...'
        if (requestedAiSummary.value && aiSummary.value.trim().length === 0) {
          isAiSummaryPending.value = true
        }
        isStreamingSummary.value = true
        break
      case 'result': {
        const columns = event.columns ?? []
        const rows = toTabularRows(event.rows, columns)
        result.value = {
          columns,
          rows,
          row_count: event.row_count ?? rows.length,
          execution_time_ms: event.execution_time_ms ?? 0,
        }
        isExecuting.value = false
        break
      }
      case 'format_token':
        if (event.token) {
          aiSummary.value += event.token
          isAiSummaryPending.value = false
        }
        break
      case 'format_done':
        finishStreaming()
        break
      case 'completed':
        finishStreaming()
        isExecuting.value = false
        break
      case 'error':
        error.value = event.message || 'SQL 실행 오류'
        finishStreaming()
        isExecuting.value = false
        break
    }
  }

  async function execute() {
    if (!canExecute.value || isExecuting.value) return
    isExecuting.value = true
    resetExecution()
    try {
      const datasource = input.getDatasourceName()
      if (!datasource) throw new Error('데이터소스를 선택해주세요')
      await text2sqlApi.directSqlStream({
        sql: input.sqlText.value,
        datasource,
        max_sql_seconds: 60,
        format_with_ai: input.formatWithAi.value,
      }, handleEvent)
    } catch (cause: unknown) {
      error.value = cause instanceof Error ? cause.message : '알 수 없는 오류'
      finishStreaming()
      isExecuting.value = false
    }
  }

  return {
    canExecute,
    isExecuting,
    loadingMessage,
    error,
    result,
    aiSummary,
    isStreamingSummary,
    requestedAiSummary,
    isAiSummaryPending,
    submittedSql,
    validatedSqlFromServer,
    autocorrectInfo,
    showAutocorrectDetails,
    execute,
  }
}
