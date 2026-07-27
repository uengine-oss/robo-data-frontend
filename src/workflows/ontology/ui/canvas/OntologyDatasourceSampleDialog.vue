<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDialogFocusLifecycle } from '@/shared/composables/useDialogFocusLifecycle'

const props = defineProps<{
  open: boolean
  loading: boolean
  error: string | null
  rows: readonly Record<string, unknown>[]
}>()

const emit = defineEmits<{
  close: []
}>()

const dialogRef = ref<HTMLElement | null>(null)
const closeButtonRef = ref<HTMLButtonElement | null>(null)
const columns = computed(() => Object.keys(props.rows[0] || {}))

useDialogFocusLifecycle({
  active: () => props.open,
  dialog: dialogRef,
  requestClose: () => emit('close'),
  initialFocus: () => closeButtonRef.value,
})
</script>

<template>
  <div v-if="open" class="dialog-overlay" @click.self="emit('close')">
    <div
      ref="dialogRef"
      class="sample-data-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ontology-sample-data-title"
      tabindex="-1"
    >
      <div class="dialog-header">
        <h3 id="ontology-sample-data-title">📊 샘플 데이터</h3>
        <button
          ref="closeButtonRef"
          type="button"
          class="close-btn"
          aria-label="샘플 데이터 닫기"
          @click="emit('close')"
        >
          ✕
        </button>
      </div>
      <div class="dialog-body">
        <div v-if="loading" class="loading-state" role="status">
          <div class="loading-spinner"></div>
          <p>데이터 로딩 중...</p>
        </div>
        <div v-else-if="error" class="operation-error" role="alert">{{ error }}</div>
        <div v-else-if="rows.length > 0" class="sample-data-table">
          <table>
            <thead>
              <tr>
                <th v-for="column in columns" :key="column">{{ column }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, rowIndex) in rows" :key="rowIndex">
                <td v-for="column in columns" :key="column">{{ row[column] }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="no-data"><p>데이터가 없습니다.</p></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
}
.sample-data-dialog {
  display: flex;
  width: min(900px, 95vw);
  max-height: 80vh;
  flex-direction: column;
  overflow: hidden;
  border-radius: var(--radius-lg);
  background: var(--color-bg-elevated);
  box-shadow: var(--shadow-lg);
}
.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
}
.dialog-header h3 { margin: 0; color: var(--color-text-bright); font-size: 1rem; }
.close-btn { padding: 4px 8px; border: 0; background: none; color: var(--color-text-light); cursor: pointer; font-size: 1.25rem; }
.dialog-body { min-height: 180px; padding: 20px; overflow: auto; }
.loading-state,
.no-data { display: flex; min-height: 140px; align-items: center; justify-content: center; flex-direction: column; color: var(--color-text-light); }
.operation-error { padding: 10px 12px; border: 1px solid rgba(248, 113, 113, 0.45); border-radius: 8px; background: rgba(248, 113, 113, 0.1); color: #fca5a5; overflow-wrap: anywhere; }
.sample-data-table { overflow: auto; }
table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
th,
td { padding: 10px 12px; border-bottom: 1px solid var(--color-border); color: var(--color-text); text-align: left; white-space: nowrap; }
th { position: sticky; top: 0; background: var(--color-bg-secondary); color: var(--color-text-bright); }
button:focus-visible { outline: 2px solid #93c5fd; outline-offset: 2px; }
:global(.light-mode) .dialog-overlay { background: rgba(0, 0, 0, 0.4); }
:global(.light-mode) .sample-data-dialog { border: 1px solid rgba(0, 0, 0, 0.1); background: #fff; }
@media (max-width: 640px) {
  .sample-data-dialog { width: calc(100vw - 24px); max-height: calc(100dvh - 24px); }
  .dialog-header,
  .dialog-body { padding-inline: 12px; }
}
</style>
