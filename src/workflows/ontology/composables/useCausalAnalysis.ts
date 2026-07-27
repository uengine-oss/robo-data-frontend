import {
  computed,
  onScopeDispose,
  ref,
  watchEffect,
  type Ref,
} from 'vue'
import {
  objectExplorerApi,
  type CausalAnalysisProgress,
  type CausalAnalysisResult,
  type CausalIncomingNetwork,
  type OntologyNodeDataResult,
} from '@/domains/ontology'
import { logger } from '@/shared/utils/logger'
import { resolveBrushRowRange, inferAnalysisTypeFromRange } from '../model/causalBrush'
import {
  EMPTY_CAUSAL_HIGHLIGHT,
  applyCausalAnalysisProgress,
  buildCausalAnalysisRequest,
  cancelCausalAnalysis,
  completeCausalAnalysis,
  createCausalBrushSelection,
  createIdleCausalAnalysisState,
  createRunningCausalAnalysisState,
  failCausalAnalysis,
  projectCausalHighlight,
  resolveCausalMetricOptions,
  resolveCausalXAxis,
  resolvePreferredCausalMetric,
  withCausalHighlightWarning,
  type CausalAnalysisType,
  type CausalAnalysisViewState,
  type CausalHighlightProjection,
} from '../application/causalAnalysisLifecycle'
import { ONTOLOGY_CHART_PALETTE } from '../model/ontologyChart'

interface CausalAnalysisGateway {
  getIncomingNetwork: (
    schemaId: string,
    nodeId: string,
    body: unknown,
    signal?: AbortSignal,
  ) => Promise<CausalIncomingNetwork>
  runCausalAnalysis: (
    schemaId: string,
    nodeId: string,
    body: unknown,
    onProgress: (progress: CausalAnalysisProgress) => void,
    signal?: AbortSignal,
  ) => Promise<CausalAnalysisResult>
}

interface UseCausalAnalysisOptions {
  selectedNodeId: Readonly<Ref<string | null>>
  schemaId: Readonly<Ref<string | null>>
  nodeDataResult: Readonly<Ref<OntologyNodeDataResult | null>>
  gateway?: CausalAnalysisGateway
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : '인과 분석 중 알 수 없는 오류가 발생했습니다.'
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError'
}

export function useCausalAnalysis({
  selectedNodeId,
  schemaId,
  nodeDataResult,
  gateway = objectExplorerApi,
}: UseCausalAnalysisOptions) {
  const analysisState = ref<CausalAnalysisViewState>(createIdleCausalAnalysisState())
  const causalBrushSelection = ref<ReturnType<typeof createCausalBrushSelection>>(null)
  const causalHighlight = ref<CausalHighlightProjection>(EMPTY_CAUSAL_HIGHLIGHT)
  const streamingRevealedLength = ref(0)
  let activeController: AbortController | null = null
  let runSequence = 0

  const analysisMetricOptions = computed(() =>
    resolveCausalMetricOptions(nodeDataResult.value),
  )
  const analysisLoading = computed(() => analysisState.value.phase === 'running')
  const analysisResult = computed(() => analysisState.value.result)
  const analysisError = computed(() => analysisState.value.error)
  const analysisNotice = computed(() => analysisState.value.notice)
  const analysisWarning = computed(() => analysisState.value.highlightWarning)
  const analysisProgress = computed(() => analysisState.value.progress)
  const hasAnalysisState = computed(() => analysisState.value.phase !== 'idle')
  const displayedStreamingReport = computed(() => {
    const full = analysisState.value.streamingReport
    return analysisLoading.value
      ? full.slice(0, streamingRevealedLength.value)
      : full
  })

  watchEffect(onCleanup => {
    if (!analysisLoading.value) return
    const interval = setInterval(() => {
      const fullLength = analysisState.value.streamingReport.length
      const currentLength = streamingRevealedLength.value
      if (currentLength < fullLength) {
        streamingRevealedLength.value = Math.min(currentLength + 10, fullLength)
      }
    }, 25)
    onCleanup(() => clearInterval(interval))
  })

  function reset(): void {
    runSequence += 1
    activeController?.abort()
    activeController = null
    analysisState.value = createIdleCausalAnalysisState()
    causalBrushSelection.value = null
    causalHighlight.value = EMPTY_CAUSAL_HIGHLIGHT
    streamingRevealedLength.value = 0
  }

  function clearResultForReconfiguration(): void {
    analysisState.value = createIdleCausalAnalysisState()
  }

  function cancel(): void {
    if (!analysisLoading.value) return
    const previousState = analysisState.value
    runSequence += 1
    activeController?.abort()
    activeController = null
    analysisState.value = cancelCausalAnalysis(previousState)
    causalHighlight.value = EMPTY_CAUSAL_HIGHLIGHT
  }

  function getAnalysisXAxis(): string | null {
    return resolveCausalXAxis(nodeDataResult.value)
  }

  function getMetricOptionColor(metric: string): string {
    const index = analysisMetricOptions.value.indexOf(metric)
    return ONTOLOGY_CHART_PALETTE[
      (index < 0 ? 0 : index) % ONTOLOGY_CHART_PALETTE.length
    ]
  }

  function selectBrushRange(
    startIndex: number,
    endIndex: number,
    candidateMetrics: string[],
  ): boolean {
    const rows = nodeDataResult.value?.rows ?? []
    const xAxis = getAnalysisXAxis()
    if (!xAxis) return false
    const targetMetric = resolvePreferredCausalMetric(
      causalBrushSelection.value?.targetMetric ?? null,
      analysisMetricOptions.value,
      candidateMetrics,
    )
    if (!targetMetric) return false
    const selection = createCausalBrushSelection(
      rows,
      xAxis,
      startIndex,
      endIndex,
      targetMetric,
    )
    if (!selection) return false

    causalBrushSelection.value = selection
    analysisState.value = createIdleCausalAnalysisState()
    causalHighlight.value = EMPTY_CAUSAL_HIGHLIGHT
    return true
  }

  function recalculateAnalysisType(): void {
    const selection = causalBrushSelection.value
    const rows = nodeDataResult.value?.rows
    const xAxis = getAnalysisXAxis()
    if (!selection || !rows?.length || !xAxis) return
    const range = resolveBrushRowRange(rows, xAxis, selection.start, selection.end)
    if (!range) return
    causalBrushSelection.value = {
      ...selection,
      analysisType: inferAnalysisTypeFromRange(
        rows,
        selection.targetMetric,
        range.startIdx,
        range.endIdx,
      ),
    }
  }

  function setAnalysisType(analysisType: CausalAnalysisType): void {
    const selection = causalBrushSelection.value
    if (!selection) return
    causalBrushSelection.value = {
      ...selection,
      analysisType,
    }
  }

  async function run(analysisType?: CausalAnalysisType): Promise<boolean> {
    if (analysisLoading.value) return false

    const selection = causalBrushSelection.value
    const nodeId = selectedNodeId.value
    const currentSchemaId = schemaId.value
    if (!selection || !nodeId || !currentSchemaId) return false

    const target = {
      schemaId: currentSchemaId,
      nodeId,
      request: buildCausalAnalysisRequest(selection, analysisType),
    }
    const controller = new AbortController()
    activeController = controller
    const sequence = ++runSequence
    streamingRevealedLength.value = 0
    causalHighlight.value = EMPTY_CAUSAL_HIGHLIGHT
    analysisState.value = createRunningCausalAnalysisState()

    let reportChunkCount = 0
    let firstReportChunkAt: number | null = null
    try {
      try {
        const network = await gateway.getIncomingNetwork(
          target.schemaId,
          target.nodeId,
          { max_depth: 3 },
          controller.signal,
        )
        if (sequence !== runSequence) return false
        causalHighlight.value = projectCausalHighlight(network)
      } catch (error: unknown) {
        if (isAbortError(error)) throw error
        if (sequence !== runSequence) return false
        analysisState.value = withCausalHighlightWarning(
          analysisState.value,
          `인과 경로 강조를 불러오지 못했지만 분석은 계속합니다: ${errorMessage(error)}`,
        )
      }

      const result = await gateway.runCausalAnalysis(
        target.schemaId,
        target.nodeId,
        target.request,
        progress => {
          if (sequence !== runSequence) return
          if (progress.step === 'report_chunk') {
            reportChunkCount += 1
            if (firstReportChunkAt == null) firstReportChunkAt = Date.now()
          }
          analysisState.value = applyCausalAnalysisProgress(
            analysisState.value,
            progress,
          )
        },
        controller.signal,
      )
      if (sequence !== runSequence) return false

      if (reportChunkCount > 0 && firstReportChunkAt != null) {
        const elapsedMs = Date.now() - firstReportChunkAt
        logger.debug(
          `[causal-stream] ${reportChunkCount} report chunks over ${elapsedMs}ms`,
        )
      }
      analysisState.value = completeCausalAnalysis(analysisState.value, result)
      return true
    } catch (error: unknown) {
      if (sequence !== runSequence) return false
      if (isAbortError(error)) {
        analysisState.value = cancelCausalAnalysis(analysisState.value)
      } else {
        analysisState.value = failCausalAnalysis(
          analysisState.value,
          errorMessage(error),
        )
      }
      causalHighlight.value = EMPTY_CAUSAL_HIGHLIGHT
      return false
    } finally {
      if (sequence === runSequence) activeController = null
    }
  }

  onScopeDispose(() => {
    runSequence += 1
    activeController?.abort()
    activeController = null
  })

  return {
    analysisState,
    analysisLoading,
    analysisResult,
    analysisError,
    analysisNotice,
    analysisWarning,
    analysisProgress,
    hasAnalysisState,
    displayedStreamingReport,
    analysisMetricOptions,
    causalBrushSelection,
    causalHighlight,
    getAnalysisXAxis,
    getMetricOptionColor,
    selectBrushRange,
    recalculateAnalysisType,
    setAnalysisType,
    run,
    cancel,
    reset,
    clearResultForReconfiguration,
  }
}
