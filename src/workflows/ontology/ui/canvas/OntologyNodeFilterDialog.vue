<script setup lang="ts">
import { ref } from 'vue'
import type { OntologyFilterField } from '@/domains/ontology'
import { useDialogFocusLifecycle } from '@/shared/composables/useDialogFocusLifecycle'

export interface OntologyCascadingFilterRow {
  field: string
  value: unknown
  fromNodeName: string
  fromField: string
}

const props = defineProps<{
  open: boolean
  targetName: string
  fields: readonly OntologyFilterField[]
  draft: Readonly<Record<string, unknown>>
  distinctValues: Readonly<Record<string, unknown[]>>
  distinctLoading: boolean
  distinctError: string | null
  cascadingFilters: readonly OntologyCascadingFilterRow[]
  conflictCount: number
  hasActiveFilters: boolean
}>()

const emit = defineEmits<{
  close: []
  confirm: []
  clear: []
  retry: []
  'update-field': [field: string, value: unknown]
}>()

const dialogRef = ref<HTMLElement | null>(null)
const closeButtonRef = ref<HTMLButtonElement | null>(null)

useDialogFocusLifecycle({
  active: () => props.open,
  dialog: dialogRef,
  requestClose: () => emit('close'),
  initialFocus: () => closeButtonRef.value,
})

function inputValue(event: Event): string {
  return (event.currentTarget as HTMLInputElement).value
}

function selectValue(event: Event): unknown {
  const select = event.currentTarget as HTMLSelectElement
  const option = select.options[select.selectedIndex] as HTMLOptionElement & {
    _value?: unknown
  }
  return '_value' in option ? option._value : select.value
}
</script>

<template>
  <div
    v-if="open"
    class="dialog-overlay"
    @click.self="emit('close')"
  >
    <div
      ref="dialogRef"
      class="filter-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ontology-filter-dialog-title"
      :aria-busy="distinctLoading"
      tabindex="-1"
    >
      <div class="filter-dialog-header">
        <div id="ontology-filter-dialog-title" class="filter-dialog-title">
          <span class="filter-dialog-icon">🔍</span>
          <span>{{ targetName }} 필터</span>
        </div>
        <div class="filter-dialog-actions-top">
          <button
            v-if="hasActiveFilters"
            type="button"
            class="clear-all-filters-btn"
            @click="emit('clear')"
          >
            모두 초기화
          </button>
          <button
            ref="closeButtonRef"
            type="button"
            class="filter-dialog-close"
            aria-label="필터 편집 취소"
            @click="emit('close')"
          >
            ✕
          </button>
        </div>
      </div>

      <div class="filter-dialog-body">
        <div v-if="cascadingFilters.length > 0" class="cascading-filters-info">
          <h5>🔗 상위 노드에서 상속된 필터</h5>
          <div
            v-for="filter in cascadingFilters"
            :key="`${filter.fromNodeName}:${filter.fromField}:${filter.field}`"
            class="cascading-filter-item"
          >
            <span class="cf-from">{{ filter.fromNodeName }}.{{ filter.fromField }}</span>
            <span class="cf-arrow">→</span>
            <span class="cf-field">{{ filter.field }}</span>
            <span class="cf-equals">=</span>
            <code class="cf-value">{{ filter.value }}</code>
          </div>
        </div>
        <div v-if="conflictCount > 0" class="filter-conflict-notice" role="status">
          서로 다른 관계 필터 {{ conflictCount }}건이 겹쳐 직접 입력한 값 또는 먼저 도달한
          관계값을 유지합니다.
        </div>

        <div v-if="fields.length === 0" class="no-filter-fields">
          <span>📋 이 노드에는 필터 가능한 필드가 없습니다.</span>
          <span class="hint">(DB 스키마에서 새로 생성한 온톨로지에만 필터 필드가 포함됩니다)</span>
        </div>

        <div v-else class="filter-dialog-fields">
          <div v-if="distinctError" class="filter-distinct-error" role="alert">
            <span>필터 선택값 조회 실패: {{ distinctError }}</span>
            <button
              type="button"
              :disabled="distinctLoading"
              @click="emit('retry')"
            >
              다시 시도
            </button>
          </div>
          <div
            v-for="field in fields"
            :key="field.column"
            class="filter-field-row"
          >
            <label :for="`ontology-filter-${field.column}`">{{ field.label }}</label>

            <div v-if="field.type === 'date_range'" class="unsupported-filter">
              <div class="date-range-filter">
                <input :id="`ontology-filter-${field.column}`" type="date" disabled aria-label="시작일 필터 계약 미확인" />
                <span>~</span>
                <input type="date" disabled aria-label="종료일 필터 계약 미확인" />
              </div>
              <span class="unsupported-filter-reason">
                백엔드 날짜 범위 계약이 확인되지 않아 현재 사용할 수 없습니다.
              </span>
            </div>

            <div v-else-if="field.type === 'select' || field.type === 'category'" class="select-filter-wrapper">
              <select
                :id="`ontology-filter-${field.column}`"
                class="select-filter"
                :value="draft[field.column]"
                :disabled="distinctLoading"
                @change="emit('update-field', field.column, selectValue($event))"
              >
                <option value="">전체</option>
                <option
                  v-for="value in (distinctValues[field.column] || [])"
                  :key="String(value)"
                  :value="value"
                >
                  {{ value }}
                </option>
              </select>
              <span
                v-if="distinctLoading && (!distinctValues[field.column] || distinctValues[field.column].length === 0)"
                class="filter-loading-hint"
              >
                로딩 중...
              </span>
              <span v-else-if="distinctValues[field.column]" class="filter-count-hint">
                {{ distinctValues[field.column].length }}개 항목
              </span>
            </div>

            <div v-else-if="field.type === 'range'" class="unsupported-filter">
              <div class="range-filter">
                <input :id="`ontology-filter-${field.column}`" type="number" disabled placeholder="최소" aria-label="최솟값 필터 계약 미확인" />
                <span>~</span>
                <input type="number" disabled placeholder="최대" aria-label="최댓값 필터 계약 미확인" />
              </div>
              <span class="unsupported-filter-reason">
                백엔드 숫자 범위 계약이 확인되지 않아 현재 사용할 수 없습니다.
              </span>
            </div>

            <div v-else-if="field.type === 'search'" class="search-filter-wrapper">
              <input
                :id="`ontology-filter-${field.column}`"
                type="text"
                :value="String(draft[field.column] ?? '')"
                :list="distinctValues[field.column]?.length ? `datalist-${field.column}` : undefined"
                placeholder="검색..."
                class="search-filter"
                @input="emit('update-field', field.column, inputValue($event))"
              />
              <datalist v-if="distinctValues[field.column]?.length" :id="`datalist-${field.column}`">
                <option v-for="value in distinctValues[field.column]" :key="String(value)" :value="String(value)" />
              </datalist>
            </div>
          </div>
        </div>
      </div>

      <div class="filter-dialog-footer">
        <button type="button" class="cancel-btn" @click="emit('close')">취소</button>
        <button type="button" class="filter-apply-btn" @click="emit('confirm')">확인</button>
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

.filter-dialog {
  display: flex;
  width: 560px;
  max-width: 90vw;
  max-height: 80vh;
  flex-direction: column;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  background: rgba(25, 25, 40, 0.98);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(20px);
  animation: dialog-fade-in 0.2s ease;
}

@keyframes dialog-fade-in {
  from { opacity: 0; transform: scale(0.95) translateY(-10px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.filter-dialog-header,
.filter-dialog-actions-top,
.cascading-filter-item,
.filter-distinct-error,
.filter-conflict-notice,
.date-range-filter,
.range-filter {
  display: flex;
  align-items: center;
}

.filter-dialog-header {
  justify-content: space-between;
  padding: 20px 24px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.filter-dialog-title {
  display: flex;
  align-items: center;
  gap: 10px;
  color: rgba(255, 255, 255, 0.95);
  font-size: 1.05rem;
  font-weight: 600;
}

.filter-dialog-icon { font-size: 1.2rem; }
.filter-dialog-actions-top { gap: 10px; }

.filter-dialog-close {
  display: flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  font-size: 1rem;
  transition: all 0.2s ease;
}

.filter-dialog-close:hover {
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.9);
}

.filter-dialog-close:focus-visible,
.filter-dialog-footer button:focus-visible,
.filter-distinct-error button:focus-visible {
  outline: 2px solid #93c5fd;
  outline-offset: 2px;
}

.filter-dialog-body {
  flex: 1;
  padding: 20px 24px;
  overflow-y: auto;
}

.filter-dialog-fields,
.filter-field-row,
.unsupported-filter,
.select-filter-wrapper,
.search-filter-wrapper,
.no-filter-fields {
  display: flex;
  flex-direction: column;
}

.filter-dialog-fields { gap: 16px; }
.filter-field-row { gap: 6px; }

.filter-field-row label {
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.8rem;
  font-weight: 500;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.filter-field-row input[type="date"],
.filter-field-row input[type="number"],
.filter-field-row input[type="text"],
.filter-field-row select {
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  outline: none;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.9);
  font-size: 0.85rem;
  transition: border-color 0.2s ease;
}

.filter-field-row input:focus,
.filter-field-row select:focus {
  border-color: rgba(99, 179, 237, 0.5);
  box-shadow: 0 0 0 2px rgba(99, 179, 237, 0.1);
}

.filter-field-row input:disabled,
.filter-field-row select:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.unsupported-filter,
.select-filter-wrapper,
.search-filter-wrapper,
.no-filter-fields { gap: 6px; }

.unsupported-filter-reason {
  color: #fbbf24;
  font-size: 0.72rem;
  line-height: 1.4;
}

.filter-distinct-error,
.filter-conflict-notice {
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid rgba(248, 113, 113, 0.35);
  border-radius: 8px;
  background: rgba(127, 29, 29, 0.2);
  color: #fecaca;
  font-size: 0.78rem;
  line-height: 1.4;
}

.filter-distinct-error button {
  flex: 0 0 auto;
  padding: 6px 10px;
  border: 1px solid rgba(248, 113, 113, 0.5);
  border-radius: 6px;
  background: rgba(248, 113, 113, 0.16);
  color: inherit;
  cursor: pointer;
}

.filter-conflict-notice {
  justify-content: flex-start;
  margin-bottom: 16px;
  border-color: rgba(251, 191, 36, 0.35);
  background: rgba(120, 53, 15, 0.2);
  color: #fde68a;
}

.date-range-filter,
.range-filter { gap: 8px; }
.date-range-filter input,
.range-filter input { min-width: 0; flex: 1; }
.date-range-filter span,
.range-filter span { color: rgba(255, 255, 255, 0.4); font-size: 0.85rem; }

.filter-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.cancel-btn,
.clear-all-filters-btn,
.filter-apply-btn {
  padding: 8px 16px;
  border: 0;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.85rem;
}

.cancel-btn,
.clear-all-filters-btn {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.8);
}

.filter-apply-btn {
  padding-inline: 24px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  font-weight: 500;
  transition: all 0.2s ease;
}

.filter-apply-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.select-filter-wrapper .select-filter,
.search-filter-wrapper .search-filter { width: 100%; }
.filter-loading-hint { color: rgba(255, 255, 255, 0.35); font-size: 0.7rem; font-style: italic; }
.filter-count-hint { color: rgba(255, 255, 255, 0.3); font-size: 0.65rem; text-align: right; }

.no-filter-fields {
  gap: 4px;
  padding: 8px 12px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.2);
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.85rem;
}

.no-filter-fields .hint { color: rgba(255, 255, 255, 0.4); font-size: 0.75rem; }

.cascading-filters-info {
  margin-bottom: 16px;
  padding: 12px 16px;
  border: 1px solid rgba(167, 139, 250, 0.2);
  border-radius: 10px;
  background: rgba(167, 139, 250, 0.08);
}

.cascading-filters-info h5 {
  margin: 0 0 10px;
  color: #a78bfa;
  font-size: 0.8rem;
  font-weight: 600;
}

.cascading-filter-item { flex-wrap: wrap; gap: 6px; padding: 4px 0; font-size: 0.8rem; }
.cf-from { color: rgba(255, 255, 255, 0.5); font-size: 0.75rem; }
.cf-arrow,
.cf-equals { color: rgba(255, 255, 255, 0.3); }
.cf-field { color: #a78bfa; font-weight: 500; }
.cf-value { padding: 2px 8px; border-radius: 4px; background: rgba(167, 139, 250, 0.15); color: #c4b5fd; font-size: 0.75rem; }

:global(.light-mode) .filter-dialog {
  border-color: rgba(0, 0, 0, 0.1);
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
}

:global(.light-mode) .filter-dialog-header,
:global(.light-mode) .filter-dialog-footer { border-color: rgba(0, 0, 0, 0.06); }
:global(.light-mode) .filter-dialog-title { color: #0f172a; }
:global(.light-mode) .filter-dialog-close { background: rgba(0, 0, 0, 0.04); color: #94a3b8; }
:global(.light-mode) .filter-dialog-close:hover { background: rgba(0, 0, 0, 0.08); color: #475569; }
:global(.light-mode) .filter-field-row label { color: #64748b; }
:global(.light-mode) .filter-field-row input,
:global(.light-mode) .filter-field-row select { border-color: rgba(0, 0, 0, 0.1); background: white; color: #1e293b; }
:global(.light-mode) .unsupported-filter-reason { color: #b45309; }
:global(.light-mode) .filter-distinct-error { border-color: #fecaca; background: #fef2f2; color: #b91c1c; }
:global(.light-mode) .filter-conflict-notice { border-color: #fde68a; background: #fffbeb; color: #92400e; }
:global(.light-mode) .filter-loading-hint,
:global(.light-mode) .filter-count-hint { color: #94a3b8; }
:global(.light-mode) .no-filter-fields { background: #f1f5f9; color: #475569; }
:global(.light-mode) .no-filter-fields .hint { color: #94a3b8; }

@media (max-width: 640px) {
  .filter-dialog {
    width: calc(100vw - 24px);
    max-width: none;
    max-height: calc(100dvh - 24px);
  }

  .filter-dialog-header,
  .filter-dialog-body,
  .filter-dialog-footer { padding-inline: 14px; }
  .filter-dialog-header { align-items: flex-start; gap: 10px; }
  .filter-dialog-title { min-width: 0; }
  .filter-dialog-actions-top { flex: 0 0 auto; }
  .filter-distinct-error { align-items: flex-start; flex-direction: column; }
}
</style>
