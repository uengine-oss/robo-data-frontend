<script setup lang="ts">
import { computed, toRef } from 'vue'
import ActionDialog from '@/shared/components/ActionDialog.vue'
import { useWhatIfModelManager } from '../../../application/useWhatIfModelManager'
import {
  formatMetricValue,
  modelStatusLabel,
  projectModelMetrics,
  shortModelNodeName,
} from '../../../application/modelManagerPolicy'

const props = defineProps<{
  schemaId: string
}>()

const {
  models,
  expandedModelId,
  loading,
  loadError,
  deletePending,
  deleteError,
  deleteDialogOpen,
  deleteDialogTitle,
  deleteDialogMessage,
  deleteConfirmLabel,
  loadModels,
  toggleDetail,
  requestDeleteModel,
  requestDeleteAll,
  closeDeleteDialog,
  confirmDelete,
} = useWhatIfModelManager(toRef(props, 'schemaId'))

const presentedModels = computed(() =>
  models.value.map(model => ({
    model,
    metrics: projectModelMetrics(model.metrics),
  })),
)

function detailId(modelId: string): string {
  return `whatif-model-${modelId.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}
</script>

<template>
  <div class="step-model-manager">
    <div class="manager-header">
      <h4>🧠 모델 관리</h4>
      <div class="header-actions">
        <span class="model-count">{{ models.length }}개 모델</span>
        <button
          type="button"
          class="refresh-btn"
          :disabled="loading || deletePending"
          @click="loadModels"
        >
          {{ loading ? '새로고침 중…' : '🔄 새로고침' }}
        </button>
        <button
          type="button"
          class="delete-all-btn"
          :disabled="models.length === 0 || deletePending"
          @click="requestDeleteAll"
        >
          🗑️ 전체 삭제
        </button>
      </div>
    </div>

    <div v-if="loadError" class="error-msg" role="alert">
      <span>{{ loadError }}</span>
      <button
        type="button"
        class="refresh-btn"
        :disabled="loading || deletePending"
        @click="loadModels"
      >
        다시 시도
      </button>
    </div>

    <div v-if="loading && models.length === 0" class="loading-state" role="status">
      모델 목록 로드 중…
    </div>

    <div
      v-else-if="!loadError && models.length === 0"
      class="empty-state"
    >
      <p>등록된 모델이 없습니다.</p>
      <p class="hint">관계 발견 → 모델 구성 → 학습/등록 단계를 진행해주세요.</p>
    </div>

    <div v-if="models.length > 0" class="model-list" :aria-busy="loading">
      <div
        v-for="item in presentedModels"
        :key="item.model.modelId"
        class="model-item"
        :class="{ expanded: expandedModelId === item.model.modelId }"
      >
        <div class="model-row">
          <button
            type="button"
            class="model-expand-button"
            :aria-expanded="expandedModelId === item.model.modelId"
            :aria-controls="detailId(item.model.modelId)"
            @click="toggleDetail(item.model.modelId)"
          >
            <span class="model-name">
              {{ item.model.name || item.model.modelId }}
            </span>
            <span class="model-status" :class="item.model.status">
              {{ modelStatusLabel(item.model.status) }}
            </span>
            <span class="model-io-summary">
              입력 {{ item.model.inputs.length }} · 출력 {{ item.model.outputs.length }}
            </span>
            <span class="expand-icon" aria-hidden="true">
              {{ expandedModelId === item.model.modelId ? '▼' : '▶' }}
            </span>
          </button>
          <button
            type="button"
            class="row-delete-btn"
            :aria-label="`${item.model.name || item.model.modelId} 모델 삭제`"
            :disabled="deletePending"
            @click="requestDeleteModel(item.model)"
          >
            🗑️
          </button>
        </div>

        <div
          v-if="expandedModelId === item.model.modelId"
          :id="detailId(item.model.modelId)"
          class="model-detail"
        >
          <div v-if="item.model.description" class="detail-desc">
            {{ item.model.description }}
          </div>

          <div class="detail-section">
            <span class="section-label">📥 입력 (READS_FIELD)</span>
            <div class="field-tags">
              <span
                v-for="input in item.model.inputs"
                :key="`${input.sourceId}:${input.field}:${input.lag}`"
                class="field-tag input"
              >
                {{ shortModelNodeName(input.sourceName) }}.{{ input.field }}
              </span>
            </div>
          </div>

          <div class="detail-section">
            <span class="section-label">📤 출력 (PREDICTS_FIELD)</span>
            <div class="field-tags">
              <span
                v-for="output in item.model.outputs"
                :key="`${output.targetId}:${output.field}`"
                class="field-tag output"
              >
                {{ shortModelNodeName(output.targetName) }}.{{ output.field }}
              </span>
            </div>
          </div>

          <div class="detail-section">
            <span class="section-label">⚙️ 알고리즘 / 설정</span>
            <div class="algo-info">
              <span class="algo-chip">엔진: {{ item.model.modelType || '정보 없음' }}</span>
              <span v-if="item.model.mindsdbModel" class="algo-chip">
                MindsDB: {{ item.model.mindsdbModel }}
              </span>
              <span class="algo-chip">학습 분할: 시간 기반 80:20</span>
              <span class="algo-chip">정규화: 없음 (기본값)</span>
            </div>
          </div>

          <div
            v-if="item.metrics.entries.length || item.metrics.warning"
            class="detail-section"
          >
            <span class="section-label">📊 검증 메트릭</span>
            <div v-if="item.metrics.entries.length" class="metrics-row">
              <span
                v-for="metric in item.metrics.entries"
                :key="metric.key"
                class="metric-chip"
              >
                {{ metric.key }}: {{ formatMetricValue(metric.value) }}
              </span>
            </div>
            <p v-if="item.metrics.warning" class="metrics-warning" role="alert">
              {{ item.metrics.warning }}
            </p>
          </div>

          <div class="detail-meta">
            <span v-if="item.model.trainedAt">
              학습: {{ item.model.trainedAt.split('T')[0] }}
            </span>
            <span>버전: v{{ item.model.version }}</span>
            <span>ID: {{ item.model.modelId }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <ActionDialog
    :open="deleteDialogOpen"
    dialog-id="whatif-model-delete"
    :title="deleteDialogTitle"
    :message="deleteDialogMessage"
    :confirm-label="deleteConfirmLabel"
    pending-label="삭제 중…"
    :pending="deletePending"
    :error="deleteError || null"
    @cancel="closeDeleteDialog"
    @confirm="confirmDelete"
  />
</template>

<style scoped lang="scss">
.step-model-manager {
  width: 100%;
  max-width: 900px;
}

.error-msg {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  margin-bottom: 16px;
  border: 1px solid #fca5a5;
  border-radius: 8px;
  color: #dc2626;
  background: #fef2f2;

  span {
    min-width: 0;
    overflow-wrap: anywhere;
  }
}

.manager-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;

  h4 {
    margin: 0;
    color: var(--color-text-bright);
    font-size: 1rem;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .model-count {
    color: var(--color-text-muted);
    font-size: 0.85rem;
    font-weight: 600;
  }
}

.refresh-btn,
.delete-all-btn {
  min-height: 32px;
  padding: 5px 12px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: none;
  color: var(--color-text-muted);
  font-size: 0.75rem;
  cursor: pointer;

  &:hover:not(:disabled) {
    border-color: var(--color-text);
    color: var(--color-text);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.delete-all-btn {
  border-color: rgba(239, 68, 68, 0.3);
  color: #ef4444;

  &:hover:not(:disabled) {
    border-color: #ef4444;
  }
}

.loading-state,
.empty-state {
  padding: 40px 20px;
  color: var(--color-text-muted);
  text-align: center;

  .hint {
    font-size: 0.8rem;
    opacity: 0.6;
  }
}

.model-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.model-item {
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-bg-secondary);
  transition: border-color 0.2s;

  &.expanded {
    border-color: #6366f1;
  }
}

.model-row {
  display: flex;
  align-items: stretch;
}

.model-expand-button {
  display: grid;
  flex: 1;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  align-items: center;
  gap: 10px;
  min-width: 0;
  min-height: 44px;
  padding: 10px 6px 10px 14px;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--color-bg-tertiary);
  }
}

.model-name {
  min-width: 0;
  overflow: hidden;
  color: var(--color-text-bright);
  font-size: 0.9rem;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-status {
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 0.7rem;
  font-weight: 600;

  &.trained { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
  &.pending,
  &.training { background: rgba(99, 102, 241, 0.15); color: #a5b4fc; }
  &.failed { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
  &.disabled { background: rgba(100, 100, 100, 0.15); color: #94a3b8; }
}

.model-io-summary,
.expand-icon {
  color: var(--color-text-muted);
  font-size: 0.7rem;
}

.row-delete-btn {
  width: 44px;
  min-height: 44px;
  border: 0;
  background: transparent;
  font-size: 0.8rem;
  opacity: 0.45;
  cursor: pointer;

  &:hover:not(:disabled),
  &:focus-visible {
    background: rgba(239, 68, 68, 0.1);
    opacity: 1;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.25;
  }
}

.model-detail {
  padding: 10px 14px;
  overflow-wrap: anywhere;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg);

  .detail-desc {
    margin-bottom: 8px;
    color: var(--color-text-muted);
    font-size: 0.8rem;
  }
}

.detail-section {
  margin-bottom: 8px;

  .section-label {
    display: block;
    margin-bottom: 4px;
    color: var(--color-text-muted);
    font-size: 0.7rem;
    font-weight: 600;
  }
}

.field-tags,
.algo-info,
.metrics-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.field-tag {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 600;

  &.input { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
  &.output { background: rgba(34, 197, 94, 0.1); color: #22c55e; }
}

.algo-chip,
.metric-chip {
  padding: 2px 8px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 0.65rem;
}

.algo-chip {
  background: rgba(100, 100, 100, 0.12);
  color: var(--color-text-muted);
}

.metric-chip {
  background: rgba(99, 102, 241, 0.1);
  color: #a5b4fc;
}

.metrics-warning {
  margin: 4px 0 0;
  color: #f87171;
  font-size: 0.72rem;
}

.detail-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin-top: 8px;
  color: var(--color-text-muted);
  font-size: 0.65rem;
  opacity: 0.7;
}

@media (max-width: 720px) {
  .manager-header {
    align-items: stretch;
    flex-direction: column;

    .header-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }

    .model-count {
      grid-column: 1 / -1;
    }
  }

  .refresh-btn,
  .delete-all-btn {
    min-height: 44px;
  }

  .error-msg {
    align-items: stretch;
    flex-direction: column;
  }

  .model-expand-button {
    grid-template-areas:
      "name status icon"
      "summary summary summary";
    grid-template-columns: minmax(0, 1fr) auto auto;
    row-gap: 5px;
  }

  .model-name { grid-area: name; }
  .model-status { grid-area: status; }
  .model-io-summary { grid-area: summary; }
  .expand-icon { grid-area: icon; }
}
</style>
