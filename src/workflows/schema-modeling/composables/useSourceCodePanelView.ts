import { nextTick, ref, watch } from 'vue'
import { useManagedTimeouts } from '@/shared/composables/useManagedTimeouts'
import { logger } from '@/shared/utils/logger'
import type { ProcedureStatement, SourceCodePanelState } from '../application/sourceCodePanel'

export function findStatementForLine(
  statements: ProcedureStatement[],
  lineNumber: number,
): ProcedureStatement | null {
  const statement = statements.find(candidate => candidate.start_line === lineNumber)
  return statement && (statement.summary || statement.ai_description) ? statement : null
}

export function useSourceCodePanelView(getPanel: () => SourceCodePanelState) {
  const sourceCodeContentRef = ref<HTMLElement | null>(null)
  const timeouts = useManagedTimeouts()

  function scrollToHighlightedLine() {
    const lineNumber = getPanel().highlightedLine
    if (!lineNumber || !sourceCodeContentRef.value) return

    const lineElement = sourceCodeContentRef.value.querySelector(`[data-line="${lineNumber}"]`)
    if (!lineElement) {
      logger.warn('[scrollToHighlightedLine] 라인 엘리먼트를 찾을 수 없음:', lineNumber)
      return
    }
    lineElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
    logger.debug('[scrollToHighlightedLine] 스크롤 완료:', lineNumber)
  }

  function scheduleScroll(delayMs: number) {
    nextTick(() => {
      timeouts.schedule('highlighted-line', scrollToHighlightedLine, delayMs)
    })
  }

  watch(
    () => [getPanel().isOpen, getPanel().highlightedLine] as const,
    ([isOpen, lineNumber]) => {
      if (isOpen && lineNumber) scheduleScroll(200)
    },
    { immediate: true },
  )

  watch(
    () => getPanel().isLoadingStatements,
    (isLoading, wasLoading) => {
      if (wasLoading && !isLoading && getPanel().isOpen) scheduleScroll(100)
    },
  )

  return {
    sourceCodeContentRef,
    getStatementForLine: (lineNumber: number) => findStatementForLine(getPanel().statements, lineNumber),
  }
}
