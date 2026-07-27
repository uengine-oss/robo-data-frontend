import * as echarts from 'echarts'
import { escapeTooltipHtml } from './causalBrush'
import type { ChartRecommendation } from './nodeDataProjection'

export const ONTOLOGY_CHART_PALETTE = [
  '#06b6d4', '#8b5cf6', '#ec4899', '#f59e0b',
  '#10b981', '#3b82f6', '#ef4444', '#14b8a6',
] as const

interface ChartInput {
  rows: Array<Record<string, unknown>>
  chartRecommendation: ChartRecommendation
  timeColumns: string[]
  numericColumns: string[]
  dark: boolean
}

export interface OntologyChartModel {
  option: echarts.EChartsOption
  xAxis: string
  yAxes: string[]
  xData: string[]
}

function formatXAxisValue(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string' && /\d{4}-\d{1,2}-\d{1,2}/.test(value)) {
    const timestamp = Date.parse(value)
    if (Number.isFinite(timestamp)) {
      return new Date(timestamp).toLocaleDateString('ko-KR', {
        month: 'short',
        day: 'numeric',
        ...(value.includes('T') ? { hour: '2-digit', minute: '2-digit' } : {}),
      })
    }
  }
  return String(value)
}

function metricValue(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export function buildOntologyChartModel(input: ChartInput): OntologyChartModel | null {
  const { rows, chartRecommendation, timeColumns, numericColumns, dark } = input
  const xAxis = chartRecommendation.xAxis ?? timeColumns[0] ?? null
  const yAxes = chartRecommendation.yAxis.length > 0
    ? chartRecommendation.yAxis
    : numericColumns.slice(0, 5)
  if (!xAxis || yAxes.length === 0 || rows.length === 0 || chartRecommendation.type === 'table') return null

  const xData = rows.map(row => formatXAxisValue(row[xAxis]))
  const series: Array<echarts.LineSeriesOption | echarts.BarSeriesOption> = yAxes.map((column, index) => {
    const color = ONTOLOGY_CHART_PALETTE[index % ONTOLOGY_CHART_PALETTE.length]
    const data = rows.map(row => metricValue(row[column]))
    if (chartRecommendation.type === 'line') {
      return {
        name: column,
        type: 'line',
        data,
        smooth: 0.4,
        symbol: 'circle',
        symbolSize: 6,
        showSymbol: rows.length <= 20,
        lineStyle: { width: 2.5, color },
        itemStyle: { color, borderColor: dark ? '#fff' : '#000', borderWidth: 1.5 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: `${color}40` },
            { offset: 1, color: `${color}05` },
          ]),
        },
        emphasis: { focus: 'series', lineStyle: { width: 3.5 } },
      }
    }
    return {
      name: column,
      type: 'bar',
      data,
      itemStyle: { color, borderRadius: [4, 4, 0, 0] },
    }
  })

  const option: echarts.EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross', label: { backgroundColor: dark ? 'rgba(30, 30, 46, 0.95)' : 'rgba(255, 255, 255, 0.95)' } },
      backgroundColor: dark ? 'rgba(30, 30, 46, 0.95)' : 'rgba(255, 255, 255, 0.95)',
      borderColor: dark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
      textStyle: { color: dark ? '#fff' : '#333' },
      formatter: (params: echarts.TooltipComponentFormatterCallbackParams) => {
        if (!Array.isArray(params)) return ''
        const axisValue = typeof params[0] === 'object' && params[0] !== null && 'axisValue' in params[0]
          ? params[0].axisValue
          : ''
        const values = params.map(param => {
          const color = typeof param.color === 'string' ? param.color : '#64748b'
          const value = typeof param.value === 'number' ? param.value.toLocaleString() : param.value
          return `<div style="display:flex;align-items:center;gap:8px;margin:4px 0"><span style="display:inline-block;width:10px;height:10px;background:${color};border-radius:50%"></span><span style="font-weight:500">${escapeTooltipHtml(param.seriesName)}:</span><span style="font-weight:600;color:${color}">${escapeTooltipHtml(value)}</span></div>`
        }).join('')
        return `<div style="font-weight:600;margin-bottom:8px">${escapeTooltipHtml(axisValue)}</div>${values}`
      },
    },
    legend: { data: yAxes, bottom: 0, left: 'center', itemGap: 20, textStyle: { color: dark ? '#fff' : '#333', fontSize: 12 }, icon: 'circle', type: 'scroll' },
    grid: { left: '3%', right: '4%', top: 40, bottom: '15%', containLabel: true },
    xAxis: { type: 'category', data: xData, axisLine: { lineStyle: { color: dark ? '#555' : '#ccc' } }, axisLabel: { color: dark ? '#aaa' : '#666', rotate: 45 } },
    yAxis: { type: 'value', axisLine: { lineStyle: { color: dark ? '#555' : '#ccc' } }, axisLabel: { color: dark ? '#aaa' : '#666' }, splitLine: { lineStyle: { color: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' } } },
    series,
  }

  if (chartRecommendation.type === 'line') {
    option.brush = { toolbox: ['rect', 'keep', 'clear'], xAxisIndex: 0, brushType: 'lineX' }
  }
  return { option, xAxis, yAxes, xData }
}
