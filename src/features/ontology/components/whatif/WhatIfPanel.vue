<script setup lang="ts">
/**
 * WhatIfPanel.vue
 * 온톨로지 탭 하단에 슬라이드-업으로 표시되는 What-if 분석 패널
 * 위저드 스텝 내비게이션 포함
 */
import { ref, computed, onMounted } from 'vue'
import StepEdgeDiscovery from './StepEdgeDiscovery.vue'
import StepModelGraph from './StepModelGraph.vue'
import StepTrainModels from './StepTrainModels.vue'
import StepValidation from './StepValidation.vue'
import StepSimulation from './StepSimulation.vue'
import StepModelManager from './StepModelManager.vue'
import { whatifDomainApi, type EdgeCandidate, type ModelSpec, type TrainModelsResponse, type ValidateResponse } from '@/features/ontology/whatif-domain-api'

const props = defineProps<{
  schemaId: string
  filters?: Record<string, Record<string, any>>  // nodeId -> {field: value}
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'models-updated', models: unknown[]): void
}>()

// 위저드 스텝
const steps = [
  { id: 'discovery', label: '관계 발견', icon: '🔍' },
  { id: 'model-graph', label: '모델 구성', icon: '🧩' },
  { id: 'train', label: '학습/등록', icon: '⚙️' },
  { id: 'validation', label: '검증', icon: '✅' },
  { id: 'simulation', label: '시뮬레이션', icon: '🎯' },
  { id: 'models', label: '모델 관리', icon: '🧠' },
]

const currentStep = ref(0)
const loading = ref(false)
const reusingExistingModels = ref(false)

// 기존 학습된 모델 존재 여부
const existingModelsCount = ref(0)
const showReuseDialog = ref(false)

// 스텝 간 공유 데이터
const discoveredEdges = ref<EdgeCandidate[]>([])
const featureViewSql = ref('')
const fieldDescriptions = ref<Record<string, string>>({})
const modelSpecs = ref<ModelSpec[]>([])
const trainResult = ref<TrainModelsResponse | null>(null)
const validationResult = ref<ValidateResponse | null>(null)

// 초기 로드: 기존 학습된 모델이 있는지 확인
onMounted(async () => {
  try {
    const status = await whatifDomainApi.getModelStatus(props.schemaId)
    existingModelsCount.value = status.models_count || 0
    if (existingModelsCount.value > 0) {
      showReuseDialog.value = true
    }
  } catch {
    // 무시
  }
})

function reuseExistingModels() {
  // 기존 모델 재사용 → 스냅샷/시뮬레이션만 바로 허용
  showReuseDialog.value = false
  reusingExistingModels.value = true
  trainResult.value = null
  validationResult.value = null
  currentStep.value = 4 // 시뮬레이션 탭으로 바로 이동
}

function retrainModels() {
  // 처음부터 다시 학습
  showReuseDialog.value = false
  reusingExistingModels.value = false
  discoveredEdges.value = []
  featureViewSql.value = ''
  fieldDescriptions.value = {}
  modelSpecs.value = []
  trainResult.value = null
  validationResult.value = null
  currentStep.value = 0
}

// 현재 스텝 완료 여부
const stepCompleted = computed(() => {
  return [
    discoveredEdges.value.length > 0,
    modelSpecs.value.length > 0,
    trainResult.value !== null,
    validationResult.value !== null,
    false, // simulation
    false, // models — 항상 접근 가능
  ]
})

function canGoToStep(idx: number): boolean {
  if (idx === 0) return true
  if (idx === 5) return true  // 모델 관리 탭은 항상 접근 가능
  if (reusingExistingModels.value && idx === 4) return true
  if (trainResult.value !== null && idx === 4) return true
  return stepCompleted.value[idx - 1]
}

function goToStep(idx: number) {
  if (canGoToStep(idx)) {
    if (reusingExistingModels.value && idx < 4) {
      reusingExistingModels.value = false
    }
    currentStep.value = idx
  }
}

function nextStep() {
  if (currentStep.value < steps.length - 1) {
    currentStep.value++
  }
}

// Step 1 완료 핸들러
function handleEdgesDiscovered(edges: EdgeCandidate[], sql: string, descs?: Record<string, string>) {
  reusingExistingModels.value = false
  discoveredEdges.value = edges
  featureViewSql.value = sql
  if (descs) fieldDescriptions.value = descs
  modelSpecs.value = []
  trainResult.value = null
  validationResult.value = null
  nextStep()
}

// Step 2 완료 핸들러
function handleModelsBuilt(specs: ModelSpec[]) {
  reusingExistingModels.value = false
  modelSpecs.value = specs
  trainResult.value = null
  validationResult.value = null
  nextStep()
}

// Step 3 완료 핸들러
function handleModelsTrained(result: TrainModelsResponse) {
  reusingExistingModels.value = false
  trainResult.value = result
  emit('models-updated', result.results)
  validationResult.value = null
  nextStep()
}

// Step 4 완료 핸들러
function handleValidated(result: ValidateResponse) {
  reusingExistingModels.value = false
  validationResult.value = result
  nextStep()
}
</script>

<template>
  <div class="whatif-panel">
    <!-- 패널 헤더 -->
    <div class="panel-header">
      <div class="header-left">
        <span class="header-icon">🔬</span>
        <h3>What-if 분석</h3>
      </div>

      <!-- 스텝 내비게이션 -->
      <div class="step-nav">
        <button
          v-for="(step, idx) in steps"
          :key="step.id"
          class="step-btn"
          :class="{
            active: currentStep === idx,
            completed: stepCompleted[idx],
            disabled: !canGoToStep(idx),
          }"
          @click="goToStep(idx)"
          :disabled="!canGoToStep(idx)"
        >
          <span class="step-icon">{{ step.icon }}</span>
          <span class="step-label">{{ step.label }}</span>
          <span v-if="stepCompleted[idx]" class="step-check">✓</span>
        </button>
      </div>

      <button class="close-btn" @click="$emit('close')" title="닫기">✕</button>
    </div>

    <!-- 기존 모델 재사용 다이얼로그 -->
    <div v-if="showReuseDialog" class="reuse-dialog-overlay">
      <div class="reuse-dialog">
        <h4>🔬 기존 학습 모델 발견</h4>
        <p>이 스키마에 학습된 모델이 <strong>{{ existingModelsCount }}개</strong> 있습니다.</p>
        <p class="reuse-hint">기존 모델을 재사용하면 바로 시뮬레이션을 실행할 수 있습니다.</p>
        <div class="reuse-actions">
          <button class="reuse-btn" @click="reuseExistingModels">
            ✅ 기존 모델로 시뮬레이션
          </button>
          <button class="retrain-btn" @click="retrainModels">
            🔄 처음부터 다시 학습
          </button>
        </div>
      </div>
    </div>

    <!-- 스텝 콘텐츠 -->
    <div class="panel-content">
      <StepEdgeDiscovery
        v-if="currentStep === 0"
        :schema-id="props.schemaId"
        :filters="props.filters"
        :loading="loading"
        @edges-discovered="handleEdgesDiscovered"
      />
      <StepModelGraph
        v-else-if="currentStep === 1"
        :schema-id="props.schemaId"
        :edges="discoveredEdges"
        :field-descriptions="fieldDescriptions"
        :loading="loading"
        @models-built="handleModelsBuilt"
      />
      <StepTrainModels
        v-else-if="currentStep === 2"
        :schema-id="props.schemaId"
        :model-specs="modelSpecs"
        :feature-view-sql="featureViewSql"
        :loading="loading"
        @models-trained="handleModelsTrained"
      />
      <StepValidation
        v-else-if="currentStep === 3"
        :schema-id="props.schemaId"
        :field-descriptions="fieldDescriptions"
        :loading="loading"
        @validated="handleValidated"
      />
      <StepSimulation
        v-else-if="currentStep === 4"
        :schema-id="props.schemaId"
        :filters="props.filters"
        :loading="loading"
      />
      <StepModelManager
        v-else-if="currentStep === 5"
        :schema-id="props.schemaId"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.whatif-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg);
  border-top: 2px solid var(--color-primary, #6366f1);
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 16px;
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;

  h3 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--color-text-bright);
  }
}

.step-nav {
  display: flex;
  gap: 2px;
  flex: 1;
  justify-content: center;
}

.step-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: none;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  color: var(--color-text-muted);
  font-size: 0.8rem;
  transition: all 0.2s;

  &.active {
    background: var(--color-primary, #6366f1);
    color: #fff;
    border-color: var(--color-primary, #6366f1);
  }

  &.completed:not(.active) {
    color: var(--color-success, #22c55e);
    border-color: var(--color-success, #22c55e);
  }

  &.disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .step-check {
    font-size: 0.7rem;
    color: var(--color-success, #22c55e);
  }
}

.close-btn {
  padding: 4px 8px;
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  font-size: 1.1rem;
  border-radius: 4px;
  flex-shrink: 0;

  &:hover {
    background: var(--color-bg-tertiary);
    color: var(--color-text-bright);
  }
}

.reuse-dialog-overlay {
  position: absolute; inset: 0; z-index: 20;
  background: rgba(0, 0, 0, 0.5);
  display: flex; align-items: center; justify-content: center;
}

.reuse-dialog {
  background: var(--color-bg-secondary); border: 1px solid var(--color-border);
  border-radius: 12px; padding: 24px 32px; max-width: 440px; text-align: center;

  h4 { margin: 0 0 8px; font-size: 1.1rem; color: var(--color-text-bright); }
  p { margin: 4px 0; font-size: 0.9rem; color: var(--color-text); }
  .reuse-hint { font-size: 0.8rem; color: var(--color-text-muted); margin-bottom: 16px; }
}

.reuse-actions {
  display: flex; gap: 10px; justify-content: center;

  button {
    padding: 10px 20px; border: none; border-radius: 8px;
    cursor: pointer; font-weight: 600; font-size: 0.85rem;
  }
  .reuse-btn { background: var(--color-primary, #6366f1); color: #fff; }
  .retrain-btn { background: var(--color-bg-tertiary); color: var(--color-text); border: 1px solid var(--color-border); }
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  position: relative;
}
</style>
