<script setup lang="ts">
/**
 * ChartRenderer.vue
 * ECharts 기반 동적 차트 렌더링 컴포넌트
 * chartType에 따라 적절한 차트를 렌더링
 */
import { computed } from 'vue'
import BarChart from './BarChart.vue'
import LineChart from './LineChart.vue'
import PieChart from './PieChart.vue'
import MapChart from './MapChart.vue'

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

export interface ChartData {
  labels: string[]
  values: number[]
  rawData: Record<string, unknown>[]
}

const props = defineProps<{
  config: ChartConfig
  data: Record<string, unknown>[]
  title?: string
  height?: number
}>()

// 차트 데이터 가공
const chartData = computed<ChartData>(() => {
  const { config, data } = props
  
  if (!data || data.length === 0) {
    return { labels: [], values: [], rawData: [] }
  }
  
  const labelField = config.labelField || config.xAxis || Object.keys(data[0])[0]
  const valueField = config.valueField || config.yAxis || Object.keys(data[0])[1]
  
  const labels = data.map(d => String(d[labelField] || ''))
  const values = data.map(d => Number(d[valueField]) || 0)
  
  return {
    labels,
    values,
    rawData: data
  }
})

// 차트 높이
const chartHeight = computed(() => props.height || 200)
</script>

<template>
  <div class="chart-renderer">
    <div v-if="config.chartType === 'none' || !config.chartType" class="no-chart">
      <span>차트 설정 없음</span>
    </div>
    
    <BarChart
      v-else-if="config.chartType === 'bar'"
      :data="chartData"
      :title="title"
      :height="chartHeight"
    />
    
    <LineChart
      v-else-if="config.chartType === 'line'"
      :data="chartData"
      :title="title"
      :height="chartHeight"
    />
    
    <PieChart
      v-else-if="config.chartType === 'pie'"
      :data="chartData"
      :title="title"
      :height="chartHeight"
    />
    
    <MapChart
      v-else-if="config.chartType === 'map'"
      :data="data"
      :config="config"
      :title="title"
      :height="chartHeight"
    />
  </div>
</template>

<style lang="scss" scoped>
.chart-renderer {
  width: 100%;
  height: 100%;
}

.no-chart {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-muted);
  font-size: 12px;
}
</style>
