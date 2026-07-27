<template>
  <div class="ontology-relation-detail">
    <div class="detail-header">
      <h3>🔗 릴레이션 속성</h3>
      <div class="detail-header-actions">
        <button class="delete-relation-btn" type="button" title="릴레이션 삭제" @click="emit('delete')">
          🗑️ 삭제
        </button>
        <button
          type="button"
          class="detail-close-btn"
          aria-label="릴레이션 상세 닫기"
          @click="emit('close')"
        >
          ✕
        </button>
      </div>
    </div>

    <div class="detail-content">
      <div class="relation-preview-panel">
        <div class="rel-endpoint">
          <span class="rel-dot" :style="{ backgroundColor: sourceColor }"></span>
          <span class="rel-name">{{ sourceName }}</span>
        </div>
        <div class="rel-arrow-panel">→</div>
        <div class="rel-endpoint">
          <span class="rel-dot" :style="{ backgroundColor: targetColor }"></span>
          <span class="rel-name">{{ targetName }}</span>
        </div>
      </div>

      <div class="detail-row">
        <label for="ontology-relation-type">관계 유형</label>
        <select
          id="ontology-relation-type"
          :value="form.type"
          class="form-select"
          @change="updateAndSave('type', readInputValue($event))"
        >
          <option v-for="option in relationTypeOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </div>

      <div class="detail-row">
        <label for="ontology-relation-description">설명</label>
        <input
          id="ontology-relation-description"
          :value="form.description"
          type="text"
          class="form-input"
          placeholder="관계에 대한 설명"
          @input="emit('update-field', 'description', readInputValue($event))"
          @blur="emit('save')"
          @keyup.enter="emit('save')"
        />
      </div>

      <div class="field-mapping-section">
        <h4>📌 필드 매핑</h4>
        <p class="field-mapping-hint">상위 노드 필터 → 하위 노드 자동 필터링</p>

        <RelationColumnField
          side="from"
          :node-name="sourceName"
          :value="form.fromField"
          :status="sourceColumnStatus"
          :error="sourceColumnError"
          :columns="sourceNodeColumns"
          @update="updateAndSave('fromField', $event)"
          @connect-datasource="emit('connect-datasource', 'source')"
        />
        <RelationColumnField
          side="to"
          :node-name="targetName"
          :value="form.toField"
          :status="targetColumnStatus"
          :error="targetColumnError"
          :columns="targetNodeColumns"
          @update="updateAndSave('toField', $event)"
          @connect-datasource="emit('connect-datasource', 'target')"
        />

        <button
          v-if="canRetryRelationColumns"
          type="button"
          class="link-datasource-btn-sm relation-column-retry"
          @click="emit('retry-columns')"
        >
          같은 관계 컬럼 다시 시도
        </button>
      </div>

      <div class="relation-panel-actions">
        <button class="cancel-btn" type="button" @click="emit('close')">닫기</button>
      </div>
      <p v-if="relationEditorError" class="relation-editor-error" role="alert">
        {{ relationEditorError }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import RelationColumnField from './RelationColumnField.vue'
import type { OntologyRelationEditorForm } from '../../application/relationEditorLifecycle'
import type { FieldMappingStatus } from '../../model/relationFieldMapping'

interface RelationTypeOption {
  value: string
  label: string
}

defineProps<{
  sourceName: string
  targetName: string
  sourceColor: string
  targetColor: string
  form: OntologyRelationEditorForm
  relationTypeOptions: readonly RelationTypeOption[]
  sourceNodeColumns: readonly string[]
  targetNodeColumns: readonly string[]
  sourceColumnStatus: FieldMappingStatus
  targetColumnStatus: FieldMappingStatus
  sourceColumnError: string
  targetColumnError: string
  canRetryRelationColumns: boolean
  relationEditorError: string
}>()

const emit = defineEmits<{
  (event: 'update-field', field: keyof OntologyRelationEditorForm, value: string): void
  (event: 'save'): void
  (event: 'connect-datasource', endpoint: 'source' | 'target'): void
  (event: 'retry-columns' | 'delete' | 'close'): void
}>()

function readInputValue(event: Event): string {
  return (event.target as HTMLInputElement | HTMLSelectElement).value
}

function updateAndSave(field: keyof OntologyRelationEditorForm, value: string): void {
  emit('update-field', field, value)
  emit('save')
}
</script>

<style scoped>
.ontology-relation-detail {
  display: contents;
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
  flex-shrink: 0;
}

.detail-header h3 {
  margin: 0;
  padding: 14px 20px;
  font-size: 1.05rem;
  color: #fff;
}

.detail-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-right: 12px;
}

.detail-close-btn,
.delete-relation-btn {
  border-radius: 8px;
  cursor: pointer;
}

.detail-close-btn {
  display: inline-grid;
  width: 32px;
  height: 32px;
  padding: 0;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.8);
}

.delete-relation-btn {
  padding: 5px 12px;
  border: 1px solid rgba(239, 68, 68, 0.3);
  background: rgba(239, 68, 68, 0.1);
  color: #f87171;
  font-size: 0.75rem;
}

.detail-content {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}

.relation-preview-panel {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px;
  margin-bottom: 16px;
  flex-wrap: wrap;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
}

.rel-endpoint {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.rel-dot {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  border-radius: 50%;
}

.rel-name {
  overflow: hidden;
  color: rgba(255, 255, 255, 0.9);
  font-size: 0.85rem;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rel-arrow-panel {
  flex-shrink: 0;
  color: rgba(255, 255, 255, 0.3);
  font-size: 1.1rem;
  font-weight: bold;
}

.detail-row {
  margin-bottom: 16px;
}

.detail-row label {
  display: block;
  margin-bottom: 6px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.8rem;
  font-weight: 500;
}

.form-select,
.form-input {
  box-sizing: border-box;
  width: 100%;
  padding: 10px 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.92);
  font: inherit;
}

.form-select {
  padding-right: 36px;
  color-scheme: dark;
  cursor: pointer;
}

.field-mapping-section {
  margin-top: 20px;
  padding: 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
}

.field-mapping-section h4 {
  margin: 0 0 6px;
  color: rgba(255, 255, 255, 0.9);
  font-size: 0.9rem;
}

.field-mapping-hint {
  margin: 0 0 16px;
  color: rgba(255, 255, 255, 0.45);
  font-size: 0.75rem;
  line-height: 1.5;
}

.relation-column-retry {
  width: 100%;
  min-height: 32px;
  margin-top: 12px;
}

.link-datasource-btn-sm,
.cancel-btn {
  border-radius: 8px;
  cursor: pointer;
}

.link-datasource-btn-sm {
  padding: 4px 10px;
  border: 1px solid rgba(96, 165, 250, 0.35);
  background: rgba(59, 130, 246, 0.14);
  color: #93c5fd;
  font-size: 0.75rem;
}

.relation-panel-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.cancel-btn {
  padding: 8px 18px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.8);
}

.relation-editor-error {
  margin: 10px 0 0;
  padding: 8px 10px;
  overflow-wrap: anywhere;
  border: 1px solid rgba(239, 68, 68, 0.4);
  border-radius: 6px;
  background: rgba(239, 68, 68, 0.1);
  color: #fca5a5;
  font-size: 0.8rem;
}

:global(.light-mode) .detail-header h3,
:global(.light-mode) .rel-name {
  color: #1e293b;
}

:global(.light-mode) .relation-preview-panel,
:global(.light-mode) .field-mapping-section {
  border-color: rgba(0, 0, 0, 0.06);
  background: rgba(0, 0, 0, 0.02);
}

:global(.light-mode) .field-mapping-section h4 {
  color: #334155;
}

:global(.light-mode) .field-mapping-hint {
  color: #94a3b8;
}

:global(.light-mode) .detail-row label {
  color: #475569;
}

:global(.light-mode) .form-select,
:global(.light-mode) .form-input {
  border-color: rgba(0, 0, 0, 0.15);
  background: rgba(0, 0, 0, 0.02);
  color: #1e293b;
}

:global(.light-mode) .form-select {
  color-scheme: light;
}
</style>
