<script setup lang="ts">
/**
 * BarChart.vue
 * 고급스러운 ECharts 기반 바 차트 컴포넌트
 * - 네온 그라디언트 효과
 * - 글로우 애니메이션
 * - 부드러운 호버 효과
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
    trigger: 'axis',
    backgroundColor: 'rgba(30, 30, 46, 0.95)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    padding: [12, 16],
    textStyle: {
      color: '#fff',
      fontSize: 13
    },
    axisPointer: {
      type: 'shadow',
      shadowStyle: {
        color: 'rgba(96, 165, 250, 0.1)'
      }
    },
    formatter: (params: any) => {
      const data = params[0]
      return `<div style="font-weight:600;margin-bottom:4px;">${data.name}</div>
              <div style="color:#60a5fa;font-weight:600;font-size:16px;">${data.value.toLocaleString()}</div>`
    },
    extraCssText: 'border-radius: 8px; box-shadow: 0 8px 32px rgba(0,0,0,0.3);'
  },
  grid: {
    left: '3%',
    right: '4%',
    bottom: '8%',
    top: props.title ? 50 : 30,
    containLabel: true
  },
  xAxis: {
    type: 'category',
    data: props.data.labels,
    axisLine: {
      lineStyle: {
        color: '#444'
      }
    },
    axisTick: {
      show: false
    },
    axisLabel: {
      rotate: props.data.labels.length > 5 ? 45 : 0,
      fontSize: 11,
      color: '#a0a0a0',
      margin: 12
    }
  },
  yAxis: {
    type: 'value',
    axisLine: {
      show: false
    },
    axisTick: {
      show: false
    },
    splitLine: {
      lineStyle: {
        color: 'rgba(255, 255, 255, 0.05)',
        type: 'dashed'
      }
    },
    axisLabel: {
      fontSize: 11,
      color: '#888',
      formatter: (value: number) => {
        if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M'
        if (value >= 1000) return (value / 1000).toFixed(1) + 'K'
        return value.toString()
      }
    }
  },
  series: [{
    type: 'bar',
    data: props.data.values,
    barWidth: '60%',
    itemStyle: {
      color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: '#60a5fa' },
        { offset: 0.5, color: '#3b82f6' },
        { offset: 1, color: '#1d4ed8' }
      ]),
      borderRadius: [6, 6, 0, 0],
      shadowColor: 'rgba(96, 165, 250, 0.4)',
      shadowBlur: 12,
      shadowOffsetY: 4
    },
    emphasis: {
      itemStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: '#93c5fd' },
          { offset: 0.5, color: '#60a5fa' },
          { offset: 1, color: '#3b82f6' }
        ]),
        shadowColor: 'rgba(96, 165, 250, 0.6)',
        shadowBlur: 20
      }
    },
    animationDelay: (idx: number) => idx * 50,
    animationEasing: 'elasticOut'
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
    class="bar-chart"
    :style="{ height: `${height || 280}px` }"
  ></div>
</template>

<style lang="scss" scoped>
.bar-chart {
  width: 100%;
  background: linear-gradient(180deg, rgba(30, 30, 46, 0.5) 0%, rgba(20, 20, 30, 0.5) 100%);
  border-radius: 12px;
}
</style>
