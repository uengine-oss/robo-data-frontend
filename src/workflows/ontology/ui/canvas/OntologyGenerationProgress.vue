<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import {
  ONTOLOGY_GENERATION_STAGE_LABELS,
  type PipelineProgressState,
  type UnifiedChunkProgressState,
} from '../../composables/useOntologyGenerationProgress'

interface GenerationLog {
  time: string
  message: string
  type?: string
}

interface LayerResult {
  nodeCount: number
  relationCount: number
}

const props = defineProps<{
  currentStep: string
  stages: readonly string[]
  progress: Readonly<Record<string, PipelineProgressState>>
  chunkProgress: UnifiedChunkProgressState
  sanitizeChunkProgress: { current: number; total: number }
  layerResults: Readonly<Record<string, LayerResult>>
  totalStageCount: number
  completedStageCount: number
  totalExtractedNodes: number
  overallProgressPercent: number
  logs: readonly GenerationLog[]
  logsExpanded: boolean
  stageMessage: (stage: string) => string
}>()

const emit = defineEmits<{
  'update:logsExpanded': [value: boolean]
}>()

const logListRef = ref<HTMLElement | null>(null)

function statusLabel(status?: string): string {
  const labels: Record<string, string> = {
    pending: '대기',
    in_progress: '진행 중',
    completed: '완료',
    failed: '실패',
  }
  return labels[status || 'pending'] || status || '대기'
}

watch(
  () => [props.logs.length, props.logsExpanded] as const,
  async () => {
    await nextTick()
    if (logListRef.value) logListRef.value.scrollTop = logListRef.value.scrollHeight
  },
)
</script>

<template>
  <div class="progress-viewer">
    <div class="progress-header">
      <div class="progress-title-row">
        <h4>🤖 에이전트 진행 상태</h4>
        <span class="progress-step-label">{{ currentStep }}</span>
      </div>
      <div class="progress-summary-bar">
        <div class="summary-track">
          <div class="summary-fill" :style="{ width: `${overallProgressPercent}%` }"></div>
        </div>
        <div class="summary-stats">
          <span class="summary-percent">{{ overallProgressPercent }}%</span>
          <span class="summary-detail">
            {{ completedStageCount }}/{{ totalStageCount }} 단계 완료<template v-if="totalExtractedNodes > 0"> · {{ totalExtractedNodes }}개 추출</template>
          </span>
        </div>
      </div>
    </div>

    <div class="layer-progress-list">
      <div
        v-for="stage in stages"
        :key="stage"
        class="layer-progress-row"
        :class="progress[stage]?.status || 'pending'"
      >
        <span class="lp-icon" :style="{ color: ONTOLOGY_GENERATION_STAGE_LABELS[stage]?.color || '#888' }">
          {{ ONTOLOGY_GENERATION_STAGE_LABELS[stage]?.icon || '⚙️' }}
        </span>
        <span class="lp-name">{{ ONTOLOGY_GENERATION_STAGE_LABELS[stage]?.label || stage }}</span>
        <div class="lp-bar-wrap">
          <div class="lp-bar-track">
            <div
              class="lp-bar-fill"
              :style="{
                width: `${progress[stage]?.progress || 0}%`,
                backgroundColor: ONTOLOGY_GENERATION_STAGE_LABELS[stage]?.color || '#888',
              }"
            ></div>
          </div>
        </div>
        <span class="lp-badge" :class="progress[stage]?.status">
          {{ statusLabel(progress[stage]?.status) }}
        </span>
        <span class="lp-detail" :title="progress[stage]?.message || ''">
          <template v-if="stage === 'Sanitize' && sanitizeChunkProgress.total > 0">
            청크 {{ sanitizeChunkProgress.current }}/{{ sanitizeChunkProgress.total }}
          </template>
          <template v-else-if="stage === 'Unified' && chunkProgress.total > 0">
            청크 {{ chunkProgress.current }}/{{ chunkProgress.total }}
            <template v-if="chunkProgress.substepTotal > 0">
              · 단계 {{ chunkProgress.substepCurrent }}/{{ chunkProgress.substepTotal }}
            </template>
            <template v-if="chunkProgress.totalSteps > 0">
              · {{ chunkProgress.completedSteps }}/{{ chunkProgress.totalSteps }} 세부단계
            </template>
          </template>
          <template v-if="stageMessage(stage)"> · {{ stageMessage(stage) }}</template>
        </span>
      </div>
      <div
        v-if="Object.keys(layerResults).length > 0 && progress.Unified?.status !== 'pending'"
        class="layer-results-summary"
      >
        <span v-for="(result, layerName) in layerResults" :key="layerName" class="layer-result-tag">
          {{ layerName }}: {{ result.nodeCount }}개
        </span>
      </div>
    </div>

    <div class="generation-logs" :class="{ expanded: logsExpanded }">
      <button
        type="button"
        class="logs-toggle"
        aria-controls="ontology-generation-log-list"
        :aria-expanded="logsExpanded"
        @click="emit('update:logsExpanded', !logsExpanded)"
      >
        <span class="logs-toggle-icon">{{ logsExpanded ? '▼' : '▶' }}</span>
        <span class="logs-toggle-label">📝 추출 로그</span>
        <span class="logs-count">{{ logs.length }}건</span>
      </button>
      <div
        v-if="logsExpanded"
        id="ontology-generation-log-list"
        ref="logListRef"
        class="log-list"
      >
        <div v-for="(log, index) in logs" :key="index" class="log-item" :class="log.type">
          <span class="log-time">{{ log.time }}</span>
          <span class="log-message">{{ log.message }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
