<script setup lang="ts">
/**
 * StepTrainModels.vue
 * Step 3: 모델 학습 + Neo4j OntologyBehavior:Model 등록
 * - 기존 모델이 있으면 교체/추가 선택 다이얼로그
 */
import { computed, ref, onMounted } from 'vue'
import { whatifDomainApi, type ModelSpec, type TrainModelsResponse, type RegisteredModel } from '@/services/whatif-domain-api'

const props = defineProps<{
  schemaId: string
  modelSpecs: ModelSpec[]
  featureViewSql: string
  loading: boolean
}>()

const emit = defineEmits<{
  (e: 'models-trained', result: TrainModelsResponse): void
}>()

const isTraining = ref(false)
const result = ref<TrainModelsResponse | null>(null)
const error = ref('')

// 기존 모델 확인
const existingModels = ref<RegisteredModel[]>([])
const showConfirmDialog = ref(false)
const isCheckingExisting = ref(true)

const hasPreparedTrainingInput = computed(() => {
  return props.modelSpecs.length > 0 && props.featureViewSql.trim().length > 0
})

const missingTrainingInputMessage = computed(() => {
  if (props.modelSpecs.length === 0) {
    return '학습할 모델 구성이 없습니다. 먼저 `관계 발견`과 `모델 구성` 단계를 다시 실행해주세요.'
  }
  return '학습용 Feature View SQL이 비어 있습니다. `관계 발견` 단계부터 다시 실행해주세요.'
})

onMounted(async () => {
  if (!hasPreparedTrainingInput.value) {
    isCheckingExisting.value = false
    return
  }

  // 기존 모델 확인
  try {
    const status = await whatifDomainApi.getModelStatus(props.schemaId)
    existingModels.value = status.models || []
  } catch { /* 무시 */ }
  isCheckingExisting.value = false

  if (existingModels.value.length > 0) {
    // 기존 모델 있음 → 다이얼로그 표시
    showConfirmDialog.value = true
  } else {
    // 기존 모델 없음 → 바로 학습
    await trainModels()
  }
})

async function handleReplaceAll() {
  // 기존 모델 전부 삭제 후 학습
  showConfirmDialog.value = false
  for (const m of existingModels.value) {
    try { await whatifDomainApi.deleteModel(props.schemaId, m.modelId) } catch { /* 무시 */ }
  }
  existingModels.value = []
  await trainModels()
}

async function handleAddNew() {
  // 기존 모델 유지 + 새 모델 추가 (upsert)
  showConfirmDialog.value = false
  await trainModels()
}

async function trainModels() {
  if (!hasPreparedTrainingInput.value) {
    error.value = missingTrainingInputMessage.value
    return
  }

  isTraining.value = true
  error.value = ''
  try {
    result.value = await whatifDomainApi.trainModels(
      props.schemaId,
      props.modelSpecs,
      props.featureViewSql,
    )
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    isTraining.value = false
  }
}

function confirmTraining() {
  if (result.value) {
    emit('models-trained', result.value)
  }
}
</script>

<template>
  <div class="step-train">
    <div class="step-header">
      <h4>⚙️ 모델 학습 및 Neo4j 등록</h4>
      <p class="step-desc">MindsDB AutoML로 모델을 학습하고, Neo4j 온톨로지에 OntologyBehavior:Model 노드와 READS_FIELD/PREDICTS_FIELD 관계를 등록합니다.</p>
    </div>

    <div v-if="!hasPreparedTrainingInput" class="warning-msg">
      {{ missingTrainingInputMessage }}
    </div>

    <!-- 기존 모델 확인 다이얼로그 -->
    <div v-if="showConfirmDialog" class="confirm-dialog">
      <div class="confirm-icon">🧠</div>
      <h5>기존 학습 모델 {{ existingModels.length }}개 발견</h5>
      <p class="confirm-desc">이 스키마에 이미 학습된 모델이 있습니다. 어떻게 하시겠습니까?</p>
      <div class="existing-model-list">
        <div v-for="m in existingModels.slice(0, 5)" :key="m.modelId" class="existing-model-row">
          <span class="em-name">{{ m.name }}</span>
          <span class="em-status" :class="m.status">{{ m.status }}</span>
        </div>
        <div v-if="existingModels.length > 5" class="em-more">
          ... 외 {{ existingModels.length - 5 }}개
        </div>
      </div>
      <div class="confirm-actions">
        <button class="replace-btn" @click="handleReplaceAll">
          🔄 전체 교체 (기존 삭제 후 새로 학습)
        </button>
        <button class="add-btn" @click="handleAddNew">
          ➕ 추가 등록 (기존 유지 + 새 모델 추가)
        </button>
      </div>
    </div>

    <!-- 기존 모델 확인 중 -->
    <div v-else-if="isCheckingExisting" class="loading">
      <div class="spinner"></div>
      <p>기존 모델 확인 중...</p>
    </div>

    <div v-else-if="isTraining" class="loading">
      <div class="spinner"></div>
      <p>{{ modelSpecs.length }}개 모델 학습 및 등록 중...</p>
    </div>

    <div v-if="error" class="error-msg">{{ error }}</div>

    <div v-if="result" class="results">
      <div class="summary">
        <span class="badge" :class="result.mindsdb_available ? 'success' : 'warn'">
          MindsDB {{ result.mindsdb_available ? '연결됨' : '미연결 (fallback)' }}
        </span>
        <span class="registered">{{ result.models_registered }}개 모델 등록 완료</span>
      </div>

      <div class="model-results">
        <div v-for="r in result.results" :key="r.model_id" class="result-row">
          <span class="model-name">{{ r.name }}</span>
          <span class="status-badge" :class="r.neo4j_saved ? 'ok' : 'fail'">
            {{ r.neo4j_saved ? '✓ Neo4j' : '✗ Neo4j' }}
          </span>
          <span class="links-count">{{ r.links_created }} links</span>
          <span class="status-label">{{ r.status }}</span>
        </div>
      </div>

      <button class="confirm-btn" @click="confirmTraining">
        검증 단계로 →
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.step-train { max-width: 800px; }

.confirm-dialog {
  text-align: center; padding: 20px; background: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: 12px;
  .confirm-icon { font-size: 2rem; margin-bottom: 8px; }
  h5 { margin: 0 0 4px; font-size: 1rem; color: var(--color-text-bright); }
  .confirm-desc { margin: 0 0 12px; font-size: 0.85rem; color: var(--color-text-muted); }
}
.existing-model-list { margin-bottom: 16px; }
.existing-model-row {
  display: flex; justify-content: space-between; padding: 4px 12px;
  background: var(--color-bg); border-radius: 4px; margin: 2px 0; font-size: 0.8rem;
  .em-name { font-weight: 600; color: var(--color-text-bright); }
  .em-status { font-size: 0.7rem; padding: 1px 6px; border-radius: 4px;
    &.trained { background: rgba(34,197,94,0.15); color: #22c55e; }
    &.pending, &.training { background: rgba(99,102,241,0.15); color: #a5b4fc; }
  }
}
.em-more { font-size: 0.75rem; color: var(--color-text-muted); margin-top: 4px; }
.confirm-actions {
  display: flex; gap: 10px; justify-content: center;
  button { padding: 10px 20px; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 0.85rem; }
  .replace-btn { background: #ef4444; color: #fff; }
  .add-btn { background: #6366f1; color: #fff; }
}
.step-header {
  margin-bottom: 16px;
  h4 { margin: 0 0 4px; color: var(--color-text-bright); }
  .step-desc { margin: 0; font-size: 0.85rem; color: var(--color-text-muted); }
}

.loading {
  display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 40px;
  .spinner {
    width: 32px; height: 32px; border: 3px solid var(--color-border);
    border-top-color: var(--color-primary, #6366f1); border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  p { color: var(--color-text-muted); }
}
@keyframes spin { to { transform: rotate(360deg); } }

.error-msg { padding: 12px; background: #fef2f2; border: 1px solid #fca5a5; border-radius: 8px; color: #dc2626; margin-bottom: 16px; }
.warning-msg { padding: 12px; background: #fff7ed; border: 1px solid #fdba74; border-radius: 8px; color: #c2410c; margin-bottom: 16px; }

.summary {
  display: flex; align-items: center; gap: 12px; margin-bottom: 16px;
  .badge { padding: 4px 12px; border-radius: 12px; font-size: 0.75rem; font-weight: 600;
    &.success { background: #dcfce7; color: #166534; }
    &.warn { background: #fef3c7; color: #92400e; }
  }
  .registered { font-size: 0.9rem; color: var(--color-text-bright); font-weight: 600; }
}

.model-results { display: flex; flex-direction: column; gap: 6px; }

.result-row {
  display: flex; align-items: center; gap: 12px; padding: 8px 12px;
  background: var(--color-bg-secondary); border-radius: 6px; font-size: 0.8rem;
  .model-name { font-weight: 600; color: var(--color-text-bright); flex: 1; }
  .status-badge { padding: 2px 8px; border-radius: 8px; font-size: 0.7rem; font-weight: 600;
    &.ok { background: #dcfce7; color: #166534; }
    &.fail { background: #fef2f2; color: #dc2626; }
  }
  .links-count { font-size: 0.75rem; color: var(--color-text-muted); }
  .status-label { font-size: 0.75rem; color: var(--color-primary, #6366f1); }
}

.confirm-btn {
  margin-top: 16px; padding: 10px 24px; background: var(--color-success, #22c55e); color: #fff;
  border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.85rem;
}
</style>
