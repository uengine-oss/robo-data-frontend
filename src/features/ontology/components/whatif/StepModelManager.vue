<script setup lang="ts">
/**
 * StepModelManager.vue
 * 모델 관리 — 등록된 모델 목록, 상세 보기, 삭제
 */
import { ref, onMounted } from 'vue'
import { whatifDomainApi, type RegisteredModel } from '@/features/ontology/whatif-domain-api'

const props = defineProps<{
  schemaId: string
}>()

const models = ref<RegisteredModel[]>([])
const isLoading = ref(false)
const expandedModel = ref<string | null>(null)

onMounted(loadModels)

async function loadModels() {
  isLoading.value = true
  try {
    const result = await whatifDomainApi.getModelStatus(props.schemaId)
    models.value = result.models || []
  } catch { /* 무시 */ }
  isLoading.value = false
}

async function deleteModel(modelId: string, modelName: string) {
  if (!confirm(`"${modelName}" 모델을 삭제하시겠습니까?`)) return
  try {
    await whatifDomainApi.deleteModel(props.schemaId, modelId)
    models.value = models.value.filter(m => m.modelId !== modelId)
  } catch (e) {
    alert('삭제 실패: ' + (e instanceof Error ? e.message : e))
  }
}

async function deleteAllModels() {
  if (!confirm(`전체 ${models.value.length}개 모델을 삭제하시겠습니까?`)) return
  for (const m of models.value) {
    try { await whatifDomainApi.deleteModel(props.schemaId, m.modelId) } catch { /* 무시 */ }
  }
  models.value = []
}

function toggleDetail(modelId: string) {
  expandedModel.value = expandedModel.value === modelId ? null : modelId
}

function statusLabel(s: string) {
  const map: Record<string, string> = { trained: '학습 완료', pending: '대기', training: '학습 중', failed: '실패', disabled: '비활성' }
  return map[s] || s
}
</script>

<template>
  <div class="step-model-manager">
    <div class="manager-header">
      <h4>🧠 모델 관리</h4>
      <div class="header-actions">
        <span class="model-count">{{ models.length }}개 모델</span>
        <button class="refresh-btn" @click="loadModels" :disabled="isLoading">🔄 새로고침</button>
        <button class="delete-all-btn" @click="deleteAllModels" :disabled="models.length === 0">🗑️ 전체 삭제</button>
      </div>
    </div>

    <div v-if="isLoading" class="loading-state">모델 목록 로드 중...</div>

    <div v-else-if="models.length === 0" class="empty-state">
      <p>등록된 모델이 없습니다.</p>
      <p class="hint">관계 발견 → 모델 구성 → 학습/등록 단계를 진행해주세요.</p>
    </div>

    <div v-else class="model-list">
      <div
        v-for="model in models"
        :key="model.modelId"
        class="model-item"
        :class="{ expanded: expandedModel === model.modelId }"
      >
        <!-- 기본 정보 행 -->
        <div class="model-row" @click="toggleDetail(model.modelId)">
          <span class="model-name">{{ model.name || model.modelId }}</span>
          <span class="model-status" :class="model.status">{{ statusLabel(model.status) }}</span>
          <span class="model-io-summary">
            입력 {{ model.inputs.length }} · 출력 {{ model.outputs.length }}
          </span>
          <span class="expand-icon">{{ expandedModel === model.modelId ? '▼' : '▶' }}</span>
          <button class="row-delete-btn" @click.stop="deleteModel(model.modelId, model.name)" title="삭제">🗑️</button>
        </div>

        <!-- 상세 정보 (펼침) -->
        <div v-if="expandedModel === model.modelId" class="model-detail">
          <div v-if="model.description" class="detail-desc">{{ model.description }}</div>

          <!-- 입력 필드 -->
          <div class="detail-section">
            <span class="section-label">📥 입력 (READS_FIELD)</span>
            <div class="field-tags">
              <span v-for="inp in model.inputs" :key="inp.field" class="field-tag input">
                {{ inp.sourceName ? inp.sourceName.split('(')[0].trim() : '' }}.{{ inp.field }}
              </span>
            </div>
          </div>

          <!-- 출력 필드 -->
          <div class="detail-section">
            <span class="section-label">📤 출력 (PREDICTS_FIELD)</span>
            <div class="field-tags">
              <span v-for="out in model.outputs" :key="out.field" class="field-tag output">
                {{ out.targetName ? out.targetName.split('(')[0].trim() : '' }}.{{ out.field }}
              </span>
            </div>
          </div>

          <!-- 알고리즘/엔진 정보 -->
          <div class="detail-section">
            <span class="section-label">⚙️ 알고리즘 / 설정</span>
            <div class="algo-info">
              <span class="algo-chip">엔진: {{ model.modelType || 'LinearRegression (fallback)' }}</span>
              <span v-if="model.mindsdbModel" class="algo-chip">MindsDB: {{ model.mindsdbModel }}</span>
              <span class="algo-chip">학습 분할: 시간 기반 80:20</span>
              <span class="algo-chip">정규화: 없음 (기본값)</span>
            </div>
          </div>

          <!-- 메트릭 -->
          <div v-if="model.metrics && model.metrics !== '{}'" class="detail-section">
            <span class="section-label">📊 검증 메트릭</span>
            <div class="metrics-row">
              <span v-for="(val, key) in JSON.parse(model.metrics || '{}')" :key="key" class="metric-chip">
                {{ key }}: {{ typeof val === 'number' ? val.toFixed(4) : val }}
              </span>
            </div>
          </div>

          <div class="detail-meta">
            <span v-if="model.trainedAt">학습: {{ model.trainedAt.split('T')[0] }}</span>
            <span>버전: v{{ model.version || 1 }}</span>
            <span>ID: {{ model.modelId }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.step-model-manager { max-width: 900px; }

.manager-header {
  display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;
  h4 { margin: 0; font-size: 1rem; color: var(--color-text-bright); }
  .header-actions { display: flex; align-items: center; gap: 8px; }
  .model-count { font-size: 0.85rem; color: var(--color-text-muted); font-weight: 600; }
}

.refresh-btn, .delete-all-btn {
  padding: 5px 12px; border: 1px solid var(--color-border); border-radius: 6px;
  background: none; cursor: pointer; font-size: 0.75rem; color: var(--color-text-muted);
  &:hover { border-color: var(--color-text); color: var(--color-text); }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
}
.delete-all-btn { border-color: rgba(239,68,68,0.3); color: #ef4444; &:hover { border-color: #ef4444; } }

.loading-state, .empty-state {
  text-align: center; padding: 40px 20px; color: var(--color-text-muted);
  .hint { font-size: 0.8rem; opacity: 0.6; }
}

.model-list { display: flex; flex-direction: column; gap: 6px; }

.model-item {
  background: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: 10px;
  overflow: hidden; transition: all 0.2s;
  &.expanded { border-color: #6366f1; }
}

.model-row {
  display: flex; align-items: center; gap: 10px; padding: 10px 14px; cursor: pointer;
  &:hover { background: var(--color-bg-tertiary); }
  .model-name { font-weight: 600; font-size: 0.9rem; color: var(--color-text-bright); flex: 1; }
  .model-status {
    font-size: 0.7rem; padding: 2px 8px; border-radius: 6px; font-weight: 600;
    &.trained { background: rgba(34,197,94,0.15); color: #22c55e; }
    &.pending, &.training { background: rgba(99,102,241,0.15); color: #a5b4fc; }
    &.failed { background: rgba(239,68,68,0.15); color: #ef4444; }
    &.disabled { background: rgba(100,100,100,0.15); color: #94a3b8; }
  }
  .model-io-summary { font-size: 0.7rem; color: var(--color-text-muted); }
  .expand-icon { font-size: 0.7rem; color: var(--color-text-muted); }
  .row-delete-btn { background: none; border: none; cursor: pointer; font-size: 0.8rem; opacity: 0.3; &:hover { opacity: 1; } }
}

.model-detail {
  padding: 10px 14px; border-top: 1px solid var(--color-border); background: var(--color-bg);
  .detail-desc { font-size: 0.8rem; color: var(--color-text-muted); margin-bottom: 8px; }
}

.detail-section {
  margin-bottom: 8px;
  .section-label { font-size: 0.7rem; font-weight: 600; color: var(--color-text-muted); display: block; margin-bottom: 4px; }
}

.field-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.field-tag {
  font-size: 0.7rem; padding: 2px 8px; border-radius: 4px; font-weight: 600;
  &.input { background: rgba(245,158,11,0.1); color: #f59e0b; }
  &.output { background: rgba(34,197,94,0.1); color: #22c55e; }
}

.algo-info { display: flex; flex-wrap: wrap; gap: 4px; }
.algo-chip { font-size: 0.65rem; padding: 2px 8px; border-radius: 4px; background: rgba(100,100,100,0.12); color: var(--color-text-muted); font-family: monospace; }

.metrics-row { display: flex; flex-wrap: wrap; gap: 4px; }
.metric-chip { font-size: 0.65rem; padding: 2px 6px; border-radius: 4px; background: rgba(99,102,241,0.1); color: #a5b4fc; font-family: monospace; }

.detail-meta {
  display: flex; gap: 16px; font-size: 0.65rem; color: var(--color-text-muted); margin-top: 8px; opacity: 0.6;
}
</style>
