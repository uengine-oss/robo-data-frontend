<script setup lang="ts">
/**
 * PieChart.vue
 * 고급스러운 ECharts 기반 파이 차트 컴포넌트
 * - 그라디언트 색상
 * - 글로우 효과
 * - 부드러운 애니메이션
 */
import { ref, computed, watch, onMounted, onUnmounted, shallowRef } from 'vue'
import * as echarts from 'echarts'

interface ChartData {
  labels: string[]
  values: number[]
  rawData: Record<string, unknown>[]
}

const props = defineProps<{
  data: ChartData
  title?: string
  height?: number
}>()

const chartRef = ref<HTMLElement>()
const chartInstance = shallowRef<echarts.ECharts | null>(null)

// 고급스러운 색상 팔레트 (그라디언트용)
const colorPalette = [
  { start: '#667eea', end: '#764ba2' },  // Purple gradient
  { start: '#f093fb', end: '#f5576c' },  // Pink gradient
  { start: '#4facfe', end: '#00f2fe' },  // Blue gradient
  { start: '#43e97b', end: '#38f9d7' },  // Green gradient
  { start: '#fa709a', end: '#fee140' },  // Coral gradient
  { start: '#a8edea', end: '#fed6e3' },  // Pastel gradient
  { start: '#ff9a9e', end: '#fecfef' },  // Rose gradient
  { start: '#ffecd2', end: '#fcb69f' },  // Peach gradient
]

// 파이 차트 데이터 변환
const pieData = computed(() => 
  props.data.labels.map((label, i) => ({
    name: label,
    value: props.data.values[i],
    itemStyle: {
      color: new echarts.graphic.LinearGradient(0, 0, 1, 1, [
        { offset: 0, color: colorPalette[i % colorPalette.length].start },
        { offset: 1, color: colorPalette[i % colorPalette.length].end }
      ]),
      shadowBlur: 20,
      shadowColor: colorPalette[i % colorPalette.length].start + '80'
    }
  }))
)

// 차트 옵션
const chartOptions = computed(() => ({
  backgroundColor: 'transparent',
  title: props.title ? {
    text: props.title,
    left: 'center',
    top: 10,
    textStyle: {
      fontSize: 14,
      fontWeight: 600,
      color: '#e0e0e0'
    }
  } : undefined,
  tooltip: {
    trigger: 'item',
    backgroundColor: 'rgba(30, 30, 46, 0.95)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    padding: [12, 16],
    textStyle: {
      color: '#fff',
      fontSize: 13
    },
    formatter: (params: any) => {
      return `<div style="font-weight:600;margin-bottom:4px;">${params.name}</div>
              <div style="color:#a0a0a0;">값: <span style="color:#fff;font-weight:600;">${params.value.toLocaleString()}</span></div>
              <div style="color:#a0a0a0;">비율: <span style="color:#60a5fa;font-weight:600;">${params.percent}%</span></div>`
    },
    extraCssText: 'border-radius: 8px; box-shadow: 0 8px 32px rgba(0,0,0,0.3);'
  },
  legend: {
    orient: 'vertical',
    left: 10,
    top: 'middle',
    icon: 'circle',
    itemWidth: 10,
    itemHeight: 10,
    itemGap: 12,
    textStyle: {
      fontSize: 12,
      color: '#b0b0b0',
      padding: [0, 0, 0, 4]
    }
  },
  series: [{
    type: 'pie',
    radius: ['45%', '75%'],
    center: ['60%', '50%'],
    avoidLabelOverlap: true,
    padAngle: 2,
    itemStyle: {
      borderRadius: 8,
      borderColor: 'rgba(0, 0, 0, 0.3)',
      borderWidth: 2
    },
    label: {
      show: false
    },
    emphasis: {
      scale: true,
      scaleSize: 12,
      label: {
        show: true,
        fontSize: 14,
        fontWeight: 'bold',
        color: '#fff',
        formatter: '{b}\n{d}%'
      },
      itemStyle: {
        shadowBlur: 30,
        shadowOffsetX: 0,
        shadowColor: 'rgba(0, 0, 0, 0.5)'
      }
    },
    labelLine: {
      show: false
    },
    animationType: 'scale',
    animationEasing: 'elasticOut',
    animationDelay: (idx: number) => idx * 100,
    data: pieData.value
  }]
}))

// 차트 초기화
function initChart() {
  if (!chartRef.value) return
  
  if (chartInstance.value) {
    chartInstance.value.dispose()
  }
  
  chartInstance.value = echarts.init(chartRef.value, 'dark')
  chartInstance.value.setOption(chartOptions.value)
}

// 차트 리사이즈
function handleResize() {
  chartInstance.value?.resize()
}

// 데이터 변경 시 업데이트
watch(() => props.data, () => {
  if (chartInstance.value) {
    chartInstance.value.setOption(chartOptions.value)
  }
}, { deep: true })

onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chartInstance.value?.dispose()
})
</script>

<template>
  <div 
    ref="chartRef" 
    class="pie-chart"
    :style="{ height: `${height || 280}px` }"
  ></div>
</template>

<style lang="scss" scoped>
.pie-chart {
  width: 100%;
  background: linear-gradient(180deg, rgba(30, 30, 46, 0.5) 0%, rgba(20, 20, 30, 0.5) 100%);
  border-radius: 12px;
}
</style>
