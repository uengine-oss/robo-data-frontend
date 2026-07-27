<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDialogFocusLifecycle } from '@/shared/composables/useDialogFocusLifecycle'

export interface HistoryActionTarget {
  kind: 'delete-item' | 'delete-all'
  id?: string
  question?: string
}

const props = defineProps<{
  target: HistoryActionTarget | null
  pending: boolean
  error: string | null
}>()

const emit = defineEmits<{
  cancel: []
  confirm: []
}>()

const dialog = ref<HTMLElement | null>(null)
const confirmButton = ref<HTMLButtonElement | null>(null)

const title = computed(() =>
  props.target?.kind === 'delete-all' ? '모든 쿼리 히스토리 삭제' : '쿼리 히스토리 삭제',
)

const description = computed(() => {
  if (props.target?.kind === 'delete-all') {
    return '저장된 모든 Text2SQL 쿼리 히스토리를 삭제합니다. 이 작업은 되돌릴 수 없습니다.'
  }
  const question = props.target?.question?.trim()
  return question
    ? `“${question}” 히스토리를 삭제합니다.`
    : '선택한 쿼리 히스토리를 삭제합니다.'
})

function requestCancel(): void {
  if (!props.pending) emit('cancel')
}

useDialogFocusLifecycle({
  active: () => props.target !== null,
  dialog,
  requestClose: requestCancel,
  initialFocus: () => confirmButton.value,
  canClose: () => !props.pending,
})
</script>

<template>
  <Teleport to="body">
    <Transition name="history-action">
      <div
        v-if="target"
        class="history-action-overlay"
        @click.self="requestCancel"
      >
        <section
          ref="dialog"
          class="history-action-dialog"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="history-action-title"
          aria-describedby="history-action-description"
          :aria-busy="pending"
          tabindex="-1"
        >
          <h3 id="history-action-title">{{ title }}</h3>
          <p id="history-action-description">{{ description }}</p>
          <p v-if="error" class="history-action-error" role="alert">{{ error }}</p>
          <div class="history-action-buttons">
            <button type="button" class="cancel-action" :disabled="pending" @click="requestCancel">
              취소
            </button>
            <button
              ref="confirmButton"
              type="button"
              class="confirm-action"
              :disabled="pending"
              @click="emit('confirm')"
            >
              {{ pending ? '삭제 중…' : error ? '다시 시도' : '삭제' }}
            </button>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.history-action-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.68);
}

.history-action-dialog {
  width: min(440px, 100%);
  padding: 24px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-secondary);
  box-shadow: var(--shadow-lg);
  color: var(--color-text);

  h3 {
    margin: 0 0 12px;
    color: var(--color-text-bright);
    font-size: 18px;
  }

  p {
    margin: 0;
    line-height: 1.6;
  }
}

.history-action-error {
  margin-top: 16px !important;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--color-error) 55%, transparent);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-error) 12%, transparent);
  color: var(--color-error);
  font-size: 13px;
}

.history-action-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 24px;

  button {
    padding: 9px 16px;
    border-radius: var(--radius-md);
    font-weight: 600;
    cursor: pointer;
  }
}

.cancel-action {
  border: 1px solid var(--color-border);
  background: var(--color-bg-tertiary);
  color: var(--color-text);
}

.confirm-action {
  border: 1px solid var(--color-error);
  background: color-mix(in srgb, var(--color-error) 12%, transparent);
  color: var(--color-error);
}

.history-action-enter-active,
.history-action-leave-active {
  transition: opacity 0.18s ease;
}

.history-action-enter-from,
.history-action-leave-to {
  opacity: 0;
}

@media (max-width: 480px) {
  .history-action-dialog {
    padding: 20px;
  }

  .history-action-buttons {
    align-items: stretch;
    flex-direction: column-reverse;

    button {
      width: 100%;
    }
  }
}
</style>
