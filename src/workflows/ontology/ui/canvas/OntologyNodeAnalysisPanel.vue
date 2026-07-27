<template>
  <div
    id="ontology-node-panel-analysis"
    class="ontology-node-analysis-panel"
    role="tabpanel"
    aria-labelledby="ontology-node-tab-analysis"
  >
    <div v-if="analysisResult?.success && !analysisLoading" class="analysis-result-header">
      <div class="result-summary">
        <span class="result-metric">{{ analysisResult.target_metric }}</span>
        <span class="result-range">
          {{ analysisResult.time_range?.start }} ~ {{ analysisResult.time_range?.end }}
        </span>
        <span class="result-type">
          {{ analysisResult.analysis_type === 'increase' ? '📈 상승' : '📉 하락' }}
        </span>
      </div>
      <div class="result-reanalyze">
        <div v-if="brushSelection" class="config-metric-control">
          <span
            class="config-color-dot"
            :style="{ background: metricColor(brushSelection.targetMetric) }"
          ></span>
          <select
            :value="brushSelection.targetMetric"
            class="result-metric-select"
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
        <button type="button" class="reanalyze-btn" @click="emit('reanalyze')">재분석</button>
        <button type="button" class="reconfigure-btn" @click="emit('reconfigure')">구간 변경</button>
      </div>
    </div>

    <div v-if="!hasAnalysisState" class="analysis-empty">
      <p>데이터 탭의 추이 차트에서 분석할 구간을 드래그한 후,<br />설정 바에서 "분석 시작"을 클릭하세요.</p>
      <button type="button" class="goto-data-btn" @click="emit('reconfigure')">
        📊 데이터 탭으로 이동
      </button>
    </div>

    <CausalAnalysisPanel
      v-if="hasAnalysisState"
      :node="node"
      :schema-id="schemaId"
      :node-data-result="nodeDataResult"
      :analysis-result="analysisResult"
      :analysis-loading="analysisLoading"
      :analysis-error="analysisError"
      :analysis-notice="analysisNotice"
      :analysis-warning="analysisWarning"
      :analysis-progress="analysisProgress"
      :streaming-report="streamingReport"
      @cancel-analysis="emit('cancel')"
      @retry-analysis="emit('reanalyze')"
    />
  </div>
</template>

<script setup lang="ts">
import { CausalAnalysisPanel } from '@/domains/ontology/ui/modeling'
import type {
  CausalAnalysisProgress,
  CausalAnalysisResult,
  OntologyNodeDataResult,
} from '@/domains/ontology'
import type { CausalBrushSelection } from '../../application/causalAnalysisLifecycle'
import type { OntologyCanvasNode } from '../../application/ontologyCanvasSchema'

defineProps<{
  node: OntologyCanvasNode
  schemaId: string | null
  nodeDataResult: OntologyNodeDataResult | null
  analysisResult: CausalAnalysisResult | null
  analysisLoading: boolean
  analysisError: string | null
  analysisNotice: string | null
  analysisWarning: string | null
  analysisProgress: CausalAnalysisProgress | null
  streamingReport: string | null
  hasAnalysisState: boolean
  brushSelection: CausalBrushSelection | null
  metricOptions: readonly string[]
  metricColor: (metric: string) => string
}>()

const emit = defineEmits<{
  (event: 'update-metric', metric: string): void
  (event: 'reanalyze' | 'reconfigure' | 'cancel'): void
}>()
</script>

<style scoped>
.ontology-node-analysis-panel {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
}

.analysis-result-header,
.result-summary,
.result-reanalyze,
.config-metric-control {
  display: flex;
  align-items: center;
}

.analysis-result-header {
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.result-summary,
.result-reanalyze,
.config-metric-control {
  gap: 8px;
  flex-wrap: wrap;
}

.result-summary {
  color: rgba(255, 255, 255, 0.72);
  font-size: 0.76rem;
}

.result-metric {
  color: #c7d2fe;
  font-weight: 700;
}

.config-color-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.result-metric-select,
button {
  min-height: 32px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.86);
}

.result-metric-select {
  padding: 5px 9px;
}

button {
  padding: 6px 10px;
  cursor: pointer;
}

.analysis-empty {
  padding: 28px 16px;
  color: rgba(255, 255, 255, 0.58);
  text-align: center;
  line-height: 1.6;
}

button:focus-visible,
select:focus-visible {
  outline: 2px solid #93c5fd;
  outline-offset: 2px;
}

:global(.light-mode) .result-summary,
:global(.light-mode) .analysis-empty {
  color: #64748b;
}

:global(.light-mode) .result-metric-select,
:global(.light-mode) button {
  border-color: rgba(15, 23, 42, 0.14);
  background: rgba(15, 23, 42, 0.04);
  color: #334155;
}
</style>
