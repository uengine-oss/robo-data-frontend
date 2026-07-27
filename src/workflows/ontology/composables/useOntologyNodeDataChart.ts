import * as echarts from 'echarts'
import {
  nextTick,
  onScopeDispose,
  ref,
  watch,
  type Ref,
} from 'vue'
import type { OntologyNodeDataResult } from '@/domains/ontology'
import {
  useManagedTimeouts,
  type ManagedTimeoutScheduler,
} from '@/shared/composables/useManagedTimeouts'
import { logger } from '@/shared/utils/logger'
import {
  extractBrushXAxisRange,
  resolveBrushRowRange,
} from '../model/causalBrush'
import { buildOntologyChartModel } from '../model/ontologyChart'

interface CausalBrushSelection {
  start: string
  end: string
}

export type OntologyNodeDataChartInstance = Pick<
  echarts.ECharts,
  'dispatchAction' | 'dispose' | 'off' | 'on' | 'resize' | 'setOption'
>

interface UseOntologyNodeDataChartOptions {
  result: Readonly<Ref<OntologyNodeDataResult | null>>
  dark: Readonly<Ref<boolean>>
  selectedNodeId: Readonly<Ref<string | null>>
  schemaId: Readonly<Ref<string | null>>
  analysisLoading: Readonly<Ref<boolean>>
  brushSelection: Readonly<Ref<CausalBrushSelection | null>>
  selectBrushRange: (
    startIndex: number,
    endIndex: number,
    metricOptions: string[],
  ) => boolean
  createChart?: (
    host: HTMLElement,
    theme: 'dark' | undefined,
  ) => OntologyNodeDataChartInstance
  timeoutScheduler?: ManagedTimeoutScheduler
}

const RENDER_KEY = 'ontology-node-data-chart:render'

export function useOntologyNodeDataChart({
  result,
  dark,
  selectedNodeId,
  schemaId,
  analysisLoading,
  brushSelection,
  selectBrushRange,
  createChart = (container, theme) => echarts.init(container, theme),
  timeoutScheduler,
}: UseOntologyNodeDataChartOptions) {
  const host = ref<HTMLElement | null>(null)
  const isReady = ref(false)
  const isBrushModeActive = ref(false)
  const {
    schedule,
    cancel,
  } = useManagedTimeouts(timeoutScheduler)

  let chart: OntologyNodeDataChartInstance | null = null

  function setHost(nextHost: HTMLElement | null): void {
    host.value = nextHost
  }

  function markPending(): void {
    isReady.value = false
    isBrushModeActive.value = false
  }

  function dispose(): void {
    cancel(RENDER_KEY)
    chart?.dispose()
    chart = null
    markPending()
  }

  function restoreBrush(
    activeChart: OntologyNodeDataChartInstance,
    rows: Array<Record<string, unknown>>,
    xAxis: string,
  ): void {
    const selection = brushSelection.value
    if (!selection) return
    const range = resolveBrushRowRange(
      rows,
      xAxis,
      selection.start,
      selection.end,
    )
    if (!range) return

    void nextTick(() => {
      if (chart !== activeChart) return
      activeChart.dispatchAction({
        type: 'brush',
        areas: [{
          brushType: 'lineX',
          coordRange: [range.startIdx, range.endIdx],
          xAxisIndex: 0,
        }],
      })
    })
  }

  function render(): void {
    markPending()
    const container = host.value
    const data = result.value
    if (
      !container
      || !data
      || !data.chartRecommendation
      || data.chartRecommendation.type === 'table'
      || data.rows.length === 0
    ) {
      dispose()
      return
    }

    const chartModel = buildOntologyChartModel({
      rows: data.rows,
      chartRecommendation: data.chartRecommendation,
      timeColumns: data.timeColumns,
      numericColumns: data.numericColumns,
      dark: dark.value,
    })
    if (!chartModel) {
      dispose()
      return
    }

    dispose()
    try {
      chart = createChart(container, dark.value ? 'dark' : undefined)
      chart.setOption(chartModel.option, true)
      isReady.value = true
    } catch (error) {
      logger.error('Ontology node-data chart render failed:', error)
      dispose()
      return
    }

    const activeChart = chart
    const {
      xAxis,
      yAxes,
      xData,
    } = chartModel
    if (data.chartRecommendation.type !== 'line') return

    restoreBrush(activeChart, data.rows, xAxis)
    activeChart.off('brushSelected')
    activeChart.on('brushSelected', (payload: unknown) => {
      if (
        chart !== activeChart
        || !selectedNodeId.value
        || !schemaId.value
        || analysisLoading.value
      ) return

      const xRange = extractBrushXAxisRange(payload)
      if (!xRange) return
      const startIndex = Math.max(0, Math.floor(xRange[0]))
      const endIndex = Math.min(xData.length - 1, Math.ceil(xRange[1]))
      if (startIndex >= endIndex) return
      if (!selectBrushRange(startIndex, endIndex, yAxes)) return
      isBrushModeActive.value = false
    })
  }

  function activateBrushMode(): void {
    if (!chart || !isReady.value || analysisLoading.value) return
    chart.dispatchAction({
      type: 'takeGlobalCursor',
      key: 'brush',
      brushOption: {
        brushType: 'lineX',
        brushMode: 'single',
      },
    })
    isBrushModeActive.value = true
  }

  function resize(): void {
    chart?.resize()
  }

  watch(
    [result, host, dark],
    async ([data, container]) => {
      if (
        !data
        || !container
        || data.chartRecommendation?.type === 'table'
        || data.rows.length === 0
      ) {
        dispose()
        return
      }
      await nextTick()
      schedule(RENDER_KEY, render, 100)
    },
    { deep: true, flush: 'post' },
  )

  onScopeDispose(dispose)

  return {
    isReady,
    isBrushModeActive,
    setHost,
    markPending,
    activateBrushMode,
    resize,
  }
}
