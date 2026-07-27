import { ref, type Ref } from 'vue'

import { whatifApi } from '../api/client'
import { compareModelsWithFallback } from '../application/compareModels'
import type {
  AgentAnalysisResult,
  CausalDiscoveryResult,
  ComparisonResult,
  DataDiscoveryResult,
  LiteracyExplanation,
  ValidationResult,
} from '../model/contracts'

type ProgressLogType = 'info' | 'success' | 'warning' | 'error' | 'search'

interface WhatIfWorkflowExecutionOptions {
  currentStep: Ref<number>
  addLog: (icon: string, type: ProgressLogType, message: string) => void
  clearLogs: () => void
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function useWhatIfWorkflowExecution(options: WhatIfWorkflowExecutionOptions) {
  const loading = ref(false)
  const error = ref<string | null>(null)
  const sessionId = ref<string | null>(null)
  const scenario = ref('')
  const agentResult = ref<AgentAnalysisResult | null>(null)
  const discoveryResult = ref<DataDiscoveryResult | null>(null)
  const selectedTables = ref<string[]>([])
  const customSql = ref('')
  const causalResult = ref<CausalDiscoveryResult | null>(null)
  const validationResult = ref<ValidationResult | null>(null)
  const comparisonResult = ref<ComparisonResult | null>(null)
  const literacyExplanation = ref<LiteracyExplanation | null>(null)

  async function runScenarioDiscovery(): Promise<void> {
    if (!scenario.value.trim()) {
      error.value = '분석 시나리오를 입력해주세요.'
      return
    }

    loading.value = true
    error.value = null
    options.clearLogs()
    try {
      options.addLog('🚀', 'info', '에이전트 분석 시작...')
      options.addLog('📝', 'info', `시나리오: "${scenario.value.substring(0, 50)}..."`)
      const result = await whatifApi.analyzeScenario(scenario.value)
      agentResult.value = result
      sessionId.value = result.session_id

      if (result.data_sources.length === 0) {
        options.addLog('⚠️', 'warning', '관련 테이블을 찾지 못했습니다.')
        options.addLog('💡', 'info', '시나리오를 더 구체적으로 작성하거나 직접 테이블을 선택해주세요.')
      } else {
        options.addLog('✅', 'success', `${result.data_sources.length}개 테이블 발견!`)
        result.data_sources.forEach(source => {
          const score = Math.round(source.relevance_score * 100)
          const type = score >= 70 ? 'success' : score >= 40 ? 'warning' : 'error'
          const label = score >= 70 ? '적합' : score >= 40 ? '검토필요' : '부적합'
          options.addLog(
            score >= 70 ? '🎯' : score >= 40 ? '⚠️' : '❌',
            type,
            `[${label}] ${source.table_name}: ${source.row_count}행, 관련도 ${score}%`,
          )
          if (source.has_time_column) {
            options.addLog('⏱️', 'success', `${source.table_name}: 시간 컬럼 발견 (${source.time_column})`)
          }
          if (source.numeric_columns.length >= 2) {
            options.addLog('🔢', 'success', `${source.table_name}: 숫자 컬럼 ${source.numeric_columns.length}개 (인과분석 가능)`)
          }
        })
        discoveryResult.value = {
          session_id: result.session_id,
          query: result.scenario,
          tables: result.data_sources.map(source => ({
            table_name: source.table_name,
            columns: source.columns,
            row_count: source.row_count,
            sample_data: source.sample_data,
            relevance_score: source.relevance_score,
            description: source.validation_notes.join(', '),
          })),
          suggested_sql: '',
        }
        customSql.value = ''
        options.addLog('🎉', 'success', '데이터 발견 완료! 다음 단계로 진행하세요.')
      }
      options.currentStep.value = 1
    } catch (cause: unknown) {
      const message = messageOf(cause, '시나리오 분석 중 오류가 발생했습니다.')
      options.addLog('❌', 'error', `오류 발생: ${message}`)
      error.value = message
    } finally {
      loading.value = false
    }
  }

  async function collectData(sql: string): Promise<void> {
    if (!sql.trim()) {
      error.value = 'SQL을 입력해주세요.'
      return
    }
    loading.value = true
    error.value = null
    try {
      await whatifApi.collectData(sql)
      options.currentStep.value = 2
    } catch (cause: unknown) {
      error.value = messageOf(cause, '데이터 수집 중 오류가 발생했습니다.')
    } finally {
      loading.value = false
    }
  }

  async function uploadFile(file: File): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const result = await whatifApi.uploadFile(file, sessionId.value ?? undefined)
      sessionId.value = result.session_id
      options.currentStep.value = 2
    } catch (cause: unknown) {
      error.value = messageOf(cause, '파일 업로드 중 오류가 발생했습니다.')
    } finally {
      loading.value = false
    }
  }

  async function discoverCausality(methods: string[], maxLag: number): Promise<void> {
    if (!sessionId.value) {
      error.value = '세션이 없습니다. 데이터를 먼저 로드해주세요.'
      return
    }
    loading.value = true
    error.value = null
    try {
      causalResult.value = await whatifApi.runCausalDiscovery(
        sessionId.value,
        methods,
        maxLag,
      )
      validationResult.value = await whatifApi.getValidation(sessionId.value)
      options.currentStep.value = 3
    } catch (cause: unknown) {
      error.value = messageOf(cause, 'Causal Discovery 실행 중 오류가 발생했습니다.')
    } finally {
      loading.value = false
    }
  }

  async function compareModels(): Promise<void> {
    if (!sessionId.value) {
      error.value = '비교할 실제 분석 세션이 없습니다.'
      return
    }
    const edges = causalResult.value?.edges ?? []
    if (edges.length === 0) {
      error.value = '비교할 실제 인과관계가 없습니다.'
      return
    }
    const tables = discoveryResult.value?.tables.map(table => table.table_name)
      ?? selectedTables.value
    if (tables.length === 0) {
      error.value = '비교에 사용할 실제 데이터 테이블이 없습니다.'
      return
    }

    loading.value = true
    error.value = null
    try {
      comparisonResult.value = await compareModelsWithFallback({
        sessionId: sessionId.value,
        causalEdges: edges,
        discoveredTables: tables,
      }, {
        compareWithTTM: (id, causalEdges, discoveredTables, includeTTM) => (
          whatifApi.compareWithTTM(id, causalEdges, discoveredTables, includeTTM)
        ),
        compareWithMindsdb: (id, causalEdges, discoveredTables) => (
          whatifApi.compareWithMindsdb(id, causalEdges, discoveredTables)
        ),
      })
    } catch (cause: unknown) {
      error.value = messageOf(cause, '모델 비교 중 오류가 발생했습니다.')
    } finally {
      loading.value = false
    }
  }

  async function generateExplanation(
    reportType: 'summary' | 'discovery' | 'validation' | 'comparison',
    language: 'ko' | 'en',
  ): Promise<void> {
    if (!sessionId.value) {
      error.value = '세션이 없습니다.'
      return
    }
    loading.value = true
    error.value = null
    try {
      literacyExplanation.value = await whatifApi.getExplanation(
        sessionId.value,
        reportType,
        language,
      )
    } catch (cause: unknown) {
      error.value = messageOf(cause, '설명 생성 중 오류가 발생했습니다.')
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    error,
    sessionId,
    scenario,
    agentResult,
    discoveryResult,
    selectedTables,
    customSql,
    causalResult,
    validationResult,
    comparisonResult,
    literacyExplanation,
    runScenarioDiscovery,
    collectData,
    uploadFile,
    discoverCausality,
    compareModels,
    generateExplanation,
    clearComparison: () => { comparisonResult.value = null },
  }
}
