/**
 * Charts components index
 */
export { default as ChartRenderer } from './ChartRenderer.vue'
export { default as BarChart } from './BarChart.vue'
export { default as LineChart } from './LineChart.vue'
export { default as PieChart } from './PieChart.vue'
export { default as MapChart } from './MapChart.vue'

export interface ChartConfig {
  chartType: 'bar' | 'line' | 'pie' | 'map' | 'none'
  xAxis?: string
  yAxis?: string
  valueField?: string
  labelField?: string
  latitudeField?: string
  longitudeField?: string
  regionField?: string
}
