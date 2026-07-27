<script setup lang="ts">
/**
 * MapChart.vue
 * 고급스러운 ECharts 기반 한국 지도 차트 컴포넌트
 * - 네온 글로우 마커
 * - 부드러운 리플 효과
 * - 다크 테마 지도
 */
import { ref, computed, watch, onMounted, onUnmounted, shallowRef } from 'vue'
import * as echarts from 'echarts'
import koreaGeoJson from '@/assets/geo/korea.json'

interface ChartConfig {
  chartType: string
  latitudeField?: string
  longitudeField?: string
  regionField?: string
  labelField?: string
  valueField?: string
}

const props = defineProps<{
  data: Record<string, unknown>[]
  config: ChartConfig
  title?: string
  height?: number
}>()

const chartRef = ref<HTMLElement>()
const chartInstance = shallowRef<echarts.ECharts | null>(null)
const mapRegistered = ref(false)

// 주요 도시/지역 좌표 (지역명 → 좌표 매핑)
const regionCoordinates: Record<string, [number, number]> = {
  '서울': [126.9780, 37.5665],
  '부산': [129.0756, 35.1796],
  '대구': [128.6014, 35.8714],
  '인천': [126.7052, 37.4563],
  '광주': [126.8526, 35.1595],
  '대전': [127.3845, 36.3504],
  '울산': [129.3114, 35.5384],
  '세종': [127.2894, 36.4800],
  '경기': [127.0000, 37.2750],
  '강원': [128.2093, 37.8228],
  '충북': [127.4914, 36.6357],
  '충남': [126.6731, 36.5184],
  '전북': [127.1088, 35.8203],
  '전남': [126.4629, 34.8161],
  '경북': [128.5055, 36.4919],
  '경남': [128.2132, 35.4606],
  '제주': [126.5312, 33.4996],
  '고산': [127.0912, 35.8831],
  '고산정수장': [127.0912, 35.8831],
  '수지': [127.0983, 37.3219],
  '수지정수장': [127.0983, 37.3219],
  '청주': [127.4898, 36.6424],
  '청주정수장': [127.4898, 36.6424],
  '전주': [127.1480, 35.8242],
  '전주정수장': [127.1480, 35.8242],
}

// 지역명에서 좌표 추출
function getCoordinates(regionName: string): [number, number] | null {
  if (regionCoordinates[regionName]) {
    return regionCoordinates[regionName]
  }
  
  for (const [key, coords] of Object.entries(regionCoordinates)) {
    if (regionName.includes(key) || key.includes(regionName)) {
      return coords
    }
  }
  
  return null
}

// 마커 색상 팔레트
const markerColors = [
  { main: '#06b6d4', glow: 'rgba(6, 182, 212, 0.6)' },
  { main: '#8b5cf6', glow: 'rgba(139, 92, 246, 0.6)' },
  { main: '#ec4899', glow: 'rgba(236, 72, 153, 0.6)' },
  { main: '#f59e0b', glow: 'rgba(245, 158, 11, 0.6)' },
  { main: '#10b981', glow: 'rgba(16, 185, 129, 0.6)' },
]

// 지도 데이터 가공
const mapData = computed(() => {
  const { config, data } = props
  
  if (!data || data.length === 0) return []
  
  return data.flatMap((item, idx) => {
    let coords: [number, number] | null = null
    let name = ''
    let value = 1
    
    if (config.latitudeField && config.longitudeField) {
      const lat = Number(item[config.latitudeField])
      const lng = Number(item[config.longitudeField])
      if (!isNaN(lat) && !isNaN(lng)) {
        coords = [lng, lat]
      }
    }
    
    if (!coords && config.regionField) {
      const regionName = String(item[config.regionField] || '')
      coords = getCoordinates(regionName)
      name = regionName
    }
    
    if (config.labelField) {
      name = String(item[config.labelField] || name || `항목 ${idx + 1}`)
    }
    
    if (config.valueField && item[config.valueField] !== undefined) {
      value = Number(item[config.valueField]) || 1
    }
    
    if (!coords) return []
    
    const colorSet = markerColors[idx % markerColors.length]
    
    return [{
      name,
      value: [...coords, value],
      rawData: item,
      itemStyle: {
        color: colorSet.main,
        shadowColor: colorSet.glow,
        shadowBlur: 15
      }
    }]
  })
})

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
      return `<div style="font-weight:600;font-size:14px;margin-bottom:6px;">${params.name}</div>
              <div style="color:#a0a0a0;">값: <span style="color:#06b6d4;font-weight:600;">${params.value[2] || 1}</span></div>`
    },
    extraCssText: 'border-radius: 8px; box-shadow: 0 8px 32px rgba(0,0,0,0.3);'
  },
  geo: {
    map: 'korea',
    roam: true,
    zoom: 1.3,
    center: [127.5, 36.0],
    aspectScale: 1,
    itemStyle: {
      areaColor: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: '#1e293b' },
        { offset: 1, color: '#0f172a' }
      ]),
      borderColor: '#334155',
      borderWidth: 1,
      shadowColor: 'rgba(0, 0, 0, 0.5)',
      shadowBlur: 20
    },
    emphasis: {
      itemStyle: {
        areaColor: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: '#334155' },
          { offset: 1, color: '#1e293b' }
        ]),
        borderColor: '#60a5fa',
        borderWidth: 2
      },
      label: {
        show: true,
        color: '#e0e0e0',
        fontSize: 12
      }
    },
    select: {
      itemStyle: {
        areaColor: '#3b82f6'
      }
    },
    regions: []
  },
  series: [
    // 글로우 링 효과
    {
      type: 'effectScatter',
      coordinateSystem: 'geo',
      data: mapData.value,
      symbolSize: (val: number[]) => Math.min(Math.max(val[2] * 4, 14), 40),
      showEffectOn: 'render',
      rippleEffect: {
        brushType: 'stroke',
        color: 'inherit',
        scale: 4,
        period: 3
      },
      label: {
        show: true,
        position: 'right',
        distance: 8,
        formatter: '{b}',
        fontSize: 11,
        fontWeight: 500,
        color: '#e0e0e0',
        textBorderColor: 'rgba(0, 0, 0, 0.8)',
        textBorderWidth: 2
      },
      itemStyle: {
        shadowBlur: 20,
        shadowOffsetY: 4
      },
      emphasis: {
        scale: 1.4,
        label: {
          fontSize: 13,
          fontWeight: 'bold'
        }
      },
      zlevel: 2
    },
    // 연결선 (선택적)
    {
      type: 'lines',
      coordinateSystem: 'geo',
      data: [],
      lineStyle: {
        color: '#60a5fa',
        width: 1,
        opacity: 0.4,
        curveness: 0.3
      },
      effect: {
        show: true,
        period: 4,
        trailLength: 0.2,
        symbol: 'arrow',
        symbolSize: 6,
        color: '#60a5fa'
      },
      zlevel: 1
    }
  ],
  // 비주얼 맵 (범례)
  visualMap: mapData.value.length > 1 ? {
    show: false,
    min: 0,
    max: Math.max(...mapData.value.map(d => d.value[2] as number)),
    inRange: {
      symbolSize: [14, 40]
    }
  } : undefined
}))

// 차트 초기화
async function initChart() {
  if (!chartRef.value) return
  
  if (chartInstance.value) {
    chartInstance.value.dispose()
  }
  
  if (!mapRegistered.value) {
    echarts.registerMap('korea', koreaGeoJson as any)
    mapRegistered.value = true
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
    class="map-chart"
    :style="{ height: `${height || 350}px` }"
  ></div>
</template>

<style lang="scss" scoped>
.map-chart {
  width: 100%;
  background: linear-gradient(180deg, #0f172a 0%, #020617 100%);
  border-radius: 12px;
  overflow: hidden;
}
</style>
