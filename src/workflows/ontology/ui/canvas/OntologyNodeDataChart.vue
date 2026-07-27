<template>
  <div class="chart-section">
    <div class="chart-header">
      <h5>📈 {{ chartType === 'line' ? '추이 차트' : '막대 차트' }}</h5>
      <button
        v-if="chartType === 'line'"
        type="button"
        class="brush-mode-btn"
        :class="{ active: brushModeActive }"
        :aria-pressed="brushModeActive"
        :disabled="!chartReady || analysisLoading"
        @click="emit('activate-brush')"
      >
        구간 선택
      </button>
    </div>
    <div class="chart-shell">
      <div v-if="chartType === 'line' && !chartReady" class="chart-loading" role="status">
        차트 데이터 준비 중...
      </div>
      <div ref="chartHost" class="chart-container"></div>
    </div>

    <div v-if="brushSelection && isKpiOrMeasure" ref="configBar" class="analysis-config-bar">
      <div class="config-hint">분석 대상 메트릭을 확인하세요</div>
      <div class="config-row">
        <span class="config-label">구간</span>
        <span class="config-value">{{ brushSelection.start }} ~ {{ brushSelection.end }}</span>
      </div>
      <div class="config-row">
        <span class="config-label">메트릭</span>
        <div class="config-metric-control">
          <span
            class="config-color-dot"
            :style="{ background: metricColor(brushSelection.targetMetric) }"
          ></span>
          <select
            :value="brushSelection.targetMetric"
            class="config-metric-select"
            @change="emit('update-metric', ($event.target as HTMLSelectElement).value)"
          >
            <option
              v-for="metric in metricOptions"
              :key="metric"
              :value="metric"
              :style="{ color: metricColor(metric) }"
            >
              ● {{ metric }}
            </option>
          </select>
        </div>
      </div>
      <div class="config-row">
        <span class="config-label">추세</span>
        <div class="trend-toggle">
          <button
            type="button"
            class="trend-btn"
            :class="{ active: brushSelection.analysisType === 'increase' }"
            @click="emit('set-analysis-type', 'increase')"
          >
            📈 상승
          </button>
          <button
            type="button"
            class="trend-btn"
            :class="{ active: brushSelection.analysisType === 'decrease' }"
            @click="emit('set-analysis-type', 'decrease')"
          >
            📉 하락
          </button>
        </div>
      </div>
      <button
        type="button"
        class="config-analyze-btn"
        :disabled="analysisLoading"
        @click="emit('analyze')"
      >
        <template v-if="analysisLoading"><span class="btn-spinner"></span>분석 중...</template>
        <template v-else>🔍 분석 시작</template>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type {
  CausalAnalysisType,
  CausalBrushSelection,
} from '../../application/causalAnalysisLifecycle'

const props = defineProps<{
  chartType?: string
  chartReady: boolean
  brushModeActive: boolean
  analysisLoading: boolean
  brushSelection: CausalBrushSelection | null
  isKpiOrMeasure: boolean
  metricOptions: readonly string[]
  metricColor: (metric: string) => string
}>()

const emit = defineEmits<{
  (event: 'host-change', host: HTMLElement | null): void
  (event: 'activate-brush' | 'analyze'): void
  (event: 'update-metric', metric: string): void
  (event: 'set-analysis-type', analysisType: CausalAnalysisType): void
}>()

const chartHost = ref<HTMLElement | null>(null)
const configBar = ref<HTMLElement | null>(null)

onMounted(() => emit('host-change', chartHost.value))
onBeforeUnmount(() => emit('host-change', null))

watch(
  () => props.brushSelection,
  selection => {
    if (!selection) return
    void nextTick(() => {
      configBar.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  },
)
</script>

<style scoped>
.chart-section {
  margin-top: 14px;
}

.chart-header,
.config-row,
.config-metric-control,
.trend-toggle {
  display: flex;
  align-items: center;
}

.chart-header {
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}

.chart-header h5 {
  margin: 0;
  color: rgba(255, 255, 255, 0.78);
}

.chart-shell {
  position: relative;
  min-height: 240px;
}

.chart-container {
  width: 100%;
  height: 280px;
}

.chart-loading {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: grid;
  place-items: center;
  background: rgba(15, 15, 30, 0.72);
  color: rgba(255, 255, 255, 0.62);
}

.brush-mode-btn,
.trend-btn,
.config-analyze-btn,
.config-metric-select {
  min-height: 32px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.82);
}

button {
  padding: 6px 10px;
  cursor: pointer;
}

button.active {
  border-color: rgba(99, 102, 241, 0.7);
  background: rgba(99, 102, 241, 0.18);
  color: #c7d2fe;
}

.analysis-config-bar {
  display: grid;
  gap: 9px;
  margin-top: 10px;
  padding: 12px;
  border: 1px solid rgba(99, 102, 241, 0.28);
  border-radius: 10px;
  background: rgba(99, 102, 241, 0.08);
}

.config-hint {
  color: #c7d2fe;
  font-size: 0.78rem;
  font-weight: 600;
}

.config-row {
  justify-content: space-between;
  gap: 10px;
  color: rgba(255, 255, 255, 0.68);
  font-size: 0.74rem;
}

.config-metric-control,
.trend-toggle {
  gap: 6px;
}

.config-color-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.config-metric-select {
  padding: 5px 8px;
}

.config-analyze-btn {
  width: 100%;
}

button:focus-visible,
select:focus-visible {
  outline: 2px solid #93c5fd;
  outline-offset: 2px;
}
</style>
