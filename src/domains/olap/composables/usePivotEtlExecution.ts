import { ref } from 'vue'
import { openExternalHttpUrl, resolveExternalHttpUrl } from '@/shared/browser/externalHttpUrl'
import { runETLPipeline } from '../api/client'
import {
  describeOlapError,
  type EtlSyncResult,
} from '../model/contracts'

export interface EtlExecutionView {
  success?: boolean
  status?: EtlSyncResult['status']
  dag_id?: string
  state?: string
  message?: string
  error?: string | null
  rows_inserted?: number
  rows_updated?: number
  duration_ms?: number
  airflow_url?: string
}

interface PivotEtlExecutionInput {
  getCubeName: () => string | null
  executeDirectSync: (cubeName: string) => Promise<EtlSyncResult>
  getCurrentUrl?: () => string
}

export function usePivotEtlExecution(input: PivotEtlExecutionInput) {
  const loading = ref(false)
  const result = ref<EtlExecutionView | null>(null)
  const resultVisible = ref(false)
  const airflowUrl = ref<string | null>(null)
  const directSyncAvailable = ref(false)
  let executionSequence = 0

  function beginExecution(): number {
    const sequence = ++executionSequence
    loading.value = true
    directSyncAvailable.value = false
    return sequence
  }

  function finishExecution(sequence: number) {
    if (sequence === executionSequence) loading.value = false
  }

  async function executeAirflow() {
    const cubeName = input.getCubeName()
    if (!cubeName) return
    const sequence = beginExecution()
    result.value = null
    resultVisible.value = true
    airflowUrl.value = null

    try {
      const response = await runETLPipeline(cubeName)
      if (sequence !== executionSequence) return
      result.value = response
      directSyncAvailable.value = response.success === false || response.status === 'failed'
      if (response.airflow_url) {
        const currentUrl = input.getCurrentUrl?.() ?? window.location.href
        airflowUrl.value = resolveExternalHttpUrl(response.airflow_url, currentUrl)
      }
    } catch (cause: unknown) {
      if (sequence !== executionSequence) return
      result.value = {
        status: 'failed',
        error: `Airflow: ${describeOlapError(cause)}`,
      }
      directSyncAvailable.value = true
    } finally {
      finishExecution(sequence)
    }
  }

  async function executeDirect() {
    const cubeName = input.getCubeName()
    if (!cubeName) return
    const sequence = beginExecution()
    try {
      const response = await input.executeDirectSync(cubeName)
      if (sequence === executionSequence) result.value = response
    } catch (cause: unknown) {
      if (sequence !== executionSequence) return
      result.value = {
        status: 'failed',
        error: `Direct: ${describeOlapError(cause)}`,
      }
      directSyncAvailable.value = true
    } finally {
      finishExecution(sequence)
    }
  }

  function openAirflow() {
    openExternalHttpUrl(airflowUrl.value)
  }

  return {
    loading,
    result,
    resultVisible,
    airflowUrl,
    directSyncAvailable,
    executeAirflow,
    executeDirect,
    openAirflow,
  }
}
