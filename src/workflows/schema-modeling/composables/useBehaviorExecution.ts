import { computed, ref } from 'vue'
import { behaviorApi, type BehaviorExecutionResult } from '@/domains/ontology'
import { logger } from '@/shared/utils/logger'
import type { useSchemaCanvasStore } from '../state/schemaCanvas'

type SchemaCanvasStore = ReturnType<typeof useSchemaCanvasStore>

export function rowToObject(row: unknown[], columns: string[]): Record<string, unknown> {
  return Object.fromEntries(columns.map((column, index) => [column, row[index]]))
}

export function useBehaviorExecution(
  store: SchemaCanvasStore,
  execute = behaviorApi.execute,
) {
  const showBehaviorResultPopup = ref(false)
  const behaviorResultData = ref<BehaviorExecutionResult | null>(null)
  const behaviorResultError = ref<string | null>(null)
  const executingRowIndex = ref<number | null>(null)
  const showOriginalCode = ref(false)
  const selectedAttemptIndex = ref(0)
  let executionRequestId = 0

  const displayedCode = computed(() => {
    if (!behaviorResultData.value) return ''
    if (showOriginalCode.value && behaviorResultData.value.originalCode) {
      return behaviorResultData.value.originalCode
    }
    return behaviorResultData.value.code || ''
  })

  function resetResult() {
    executionRequestId += 1
    showBehaviorResultPopup.value = false
    behaviorResultData.value = null
    behaviorResultError.value = null
    executingRowIndex.value = null
    showOriginalCode.value = false
    selectedAttemptIndex.value = 0
  }

  function cancelBehaviorMode() {
    store.cancelBehaviorMode()
    resetResult()
  }

  async function executeBehaviorForRow(rowIndex: number) {
    const behavior = store.tableDataPanel.activeBehavior
    const row = store.tableDataPanel.rows[rowIndex]
    if (!behavior || !row) return

    const requestId = ++executionRequestId
    const instanceData = rowToObject(row, store.tableDataPanel.columns)
    executingRowIndex.value = rowIndex
    store.tableDataPanel.isExecutingBehavior = true
    behaviorResultError.value = null

    try {
      const result = await execute(behavior.objectTypeName, behavior.name, { instanceData })
      if (requestId !== executionRequestId) return
      behaviorResultData.value = result
      showBehaviorResultPopup.value = true
      logger.debug(`[Behavior] Row ${rowIndex} 실행 완료:`, result)
    } catch (error) {
      if (requestId !== executionRequestId) return
      logger.error(`[Behavior] Row ${rowIndex} 실행 오류:`, error)
      behaviorResultError.value = error instanceof Error ? error.message : '실행 오류'
      behaviorResultData.value = null
      showBehaviorResultPopup.value = true
    } finally {
      if (requestId === executionRequestId) {
        store.tableDataPanel.isExecutingBehavior = false
        executingRowIndex.value = null
      }
    }
  }

  function closeBehaviorResultPopup() {
    resetResult()
    store.tableDataPanel.isExecutingBehavior = false
  }

  return {
    showBehaviorResultPopup,
    behaviorResultData,
    behaviorResultError,
    executingRowIndex,
    showOriginalCode,
    selectedAttemptIndex,
    displayedCode,
    cancelBehaviorMode,
    executeBehaviorForRow,
    closeBehaviorResultPopup,
  }
}
