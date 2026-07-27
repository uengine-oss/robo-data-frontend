<script setup lang="ts">
import { ref } from 'vue'
import { useDialogFocusLifecycle } from '@/shared/composables/useDialogFocusLifecycle'

export interface OntologyRelationTypeOption {
  value: string
  label: string
}

const props = defineProps<{
  open: boolean
  sourceName: string
  targetName: string
  relationType: string
  description: string
  relationTypeOptions: readonly OntologyRelationTypeOption[]
}>()

const emit = defineEmits<{
  close: []
  confirm: []
  'update:relation-type': [value: string]
  'update:description': [value: string]
}>()

const dialogRef = ref<HTMLElement | null>(null)
const relationTypeRef = ref<HTMLSelectElement | null>(null)

useDialogFocusLifecycle({
  active: () => props.open,
  dialog: dialogRef,
  requestClose: () => emit('close'),
  initialFocus: () => relationTypeRef.value,
})
</script>

<template>
  <div v-if="open" class="dialog-overlay" @click.self="emit('close')">
    <div
      ref="dialogRef"
      class="new-relation-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-relation-dialog-title"
      tabindex="-1"
    >
      <div class="dialog-header">
        <h3 id="new-relation-dialog-title">🔗 새 관계 생성</h3>
        <button type="button" class="close-btn" aria-label="관계 초안 취소" @click="emit('close')">✕</button>
      </div>
      <div class="dialog-body">
        <div class="relation-preview">
          <div class="node-preview source">
            <span class="node-icon">◉</span>
            <span class="node-name">{{ sourceName }}</span>
          </div>
          <div class="relation-arrow">→</div>
          <div class="node-preview target">
            <span class="node-icon">◉</span>
            <span class="node-name">{{ targetName }}</span>
          </div>
        </div>

        <div class="form-group">
          <label for="new-relation-type">관계 유형</label>
          <select
            id="new-relation-type"
            ref="relationTypeRef"
            :value="relationType"
            class="form-select"
            @change="emit('update:relation-type', ($event.currentTarget as HTMLSelectElement).value)"
          >
            <option
              v-for="option in relationTypeOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </div>

        <div class="form-group">
          <label for="new-relation-description">설명 (선택)</label>
          <input
            id="new-relation-description"
            :value="description"
            type="text"
            class="form-input"
            placeholder="관계에 대한 설명을 입력하세요"
            @input="emit('update:description', ($event.currentTarget as HTMLInputElement).value)"
          />
        </div>
      </div>
      <div class="dialog-footer">
        <button type="button" class="cancel-btn" @click="emit('close')">취소</button>
        <button type="button" class="confirm-btn" @click="emit('confirm')">✓ 관계 생성</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
}

.new-relation-dialog {
  width: 460px;
  max-width: 95vw;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-lg, 12px);
  background: var(--color-bg-elevated, #1e1e2e);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.06);
}

.dialog-header,
.dialog-footer,
.relation-preview,
.node-preview {
  display: flex;
  align-items: center;
}

.dialog-header {
  justify-content: space-between;
  padding: 18px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(0, 0, 0, 0.2);
}

.dialog-header h3 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.close-btn {
  border: 0;
  background: transparent;
  color: var(--color-text-muted, #94a3b8);
  cursor: pointer;
  font-size: 1rem;
}

.dialog-body { padding: 24px; }

.dialog-footer {
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(0, 0, 0, 0.15);
}

.relation-preview {
  justify-content: center;
  gap: 16px;
  margin-bottom: 24px;
  padding: 20px 24px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.03);
}

.node-preview {
  gap: 10px;
  padding: 10px 16px;
  border: 2px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
}

.node-preview.source { border-color: #22c55e; background: rgba(34, 197, 94, 0.06); }
.node-preview.target { border-color: #3b82f6; background: rgba(59, 130, 246, 0.06); }
.node-icon { font-size: 1.25rem; }
.node-preview.source .node-icon { color: #22c55e; }
.node-preview.target .node-icon { color: #3b82f6; }
.node-name { color: var(--color-text-bright); font-size: 0.9rem; font-weight: 500; }
.relation-arrow { color: var(--color-text-muted, var(--color-text-light)); font-size: 1.5rem; opacity: 0.6; }
.form-group { margin-bottom: 18px; }

.form-group label {
  display: block;
  margin-bottom: 8px;
  color: var(--color-text-bright);
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.form-select,
.form-input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.04);
  color: var(--color-text);
  font-size: 0.875rem;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.form-select { color-scheme: dark; }
.form-select option { background: #1e1e2e; color: #e2e8f0; }
.form-select option:checked { background: #334155; color: #f8fafc; }
.form-select:focus,
.form-input:focus { outline: 0; border-color: var(--color-accent, var(--color-primary)); box-shadow: 0 0 0 3px rgba(34, 139, 230, 0.15); }
.form-input::placeholder { color: var(--color-text-muted, rgba(255, 255, 255, 0.3)); }

.cancel-btn,
.confirm-btn {
  padding: 10px 22px;
  border: 0;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
}

.cancel-btn { background: var(--color-bg-tertiary); color: var(--color-text); }
.confirm-btn { background: #22c55e; color: white; transition: all 0.2s ease; }
.confirm-btn:hover { background: #16a34a; box-shadow: 0 2px 8px rgba(34, 197, 94, 0.3); }
button:focus-visible,
select:focus-visible,
input:focus-visible { outline: 2px solid #93c5fd; outline-offset: 2px; }

:global(.light-mode) .dialog-overlay { background: rgba(0, 0, 0, 0.4); }
:global(.light-mode) .new-relation-dialog {
  border-color: rgba(0, 0, 0, 0.1);
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05);
}
:global(.light-mode) .dialog-header,
:global(.light-mode) .dialog-footer { border-color: rgba(0, 0, 0, 0.08); background: rgba(0, 0, 0, 0.03); }
:global(.light-mode) .relation-preview { border-color: rgba(0, 0, 0, 0.08); background: rgba(0, 0, 0, 0.02); }
:global(.light-mode) .node-preview.source { background: rgba(34, 197, 94, 0.05); }
:global(.light-mode) .node-preview.target { background: rgba(59, 130, 246, 0.05); }
:global(.light-mode) .form-select,
:global(.light-mode) .form-input { border-color: rgba(0, 0, 0, 0.15); background: rgba(0, 0, 0, 0.02); }
:global(.light-mode) .form-select { color-scheme: light; }
:global(.light-mode) .form-select option { background: #fff; color: #1e293b; }
:global(.light-mode) .form-select option:checked { background: #e2e8f0; color: #0f172a; }

@media (max-width: 520px) {
  .new-relation-dialog { width: calc(100vw - 24px); }
  .relation-preview { flex-wrap: wrap; padding-inline: 12px; }
}
</style>
