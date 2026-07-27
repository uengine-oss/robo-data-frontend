<script setup lang="ts">
import { ref } from 'vue'
import { useDialogFocusLifecycle } from '@/shared/composables/useDialogFocusLifecycle'

const props = withDefaults(defineProps<{
  open: boolean
  dialogId: string
  title: string
  message: string
  confirmLabel: string
  pendingLabel?: string
  pending: boolean
  error: string | null
  optionLabel?: string
  optionSelected?: boolean
}>(), {
  pendingLabel: '처리 중…',
  optionLabel: undefined,
  optionSelected: false,
})

const emit = defineEmits<{
  cancel: []
  confirm: []
  'update:optionSelected': [selected: boolean]
}>()

const dialog = ref<HTMLElement | null>(null)
const cancelButton = ref<HTMLButtonElement | null>(null)

function requestCancel(): void {
  if (!props.pending) emit('cancel')
}

useDialogFocusLifecycle({
  active: () => props.open,
  dialog,
  requestClose: requestCancel,
  initialFocus: () => cancelButton.value,
  canClose: () => !props.pending,
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="action-dialog-overlay" @click.self="requestCancel">
      <section
        ref="dialog"
        class="action-dialog"
        role="alertdialog"
        aria-modal="true"
        :aria-labelledby="`${dialogId}-title`"
        :aria-describedby="`${dialogId}-message`"
        :aria-busy="pending"
      >
        <h3 :id="`${dialogId}-title`">{{ title }}</h3>
        <p :id="`${dialogId}-message`">{{ message }}</p>
        <label v-if="optionLabel" class="action-option">
          <input
            type="checkbox"
            :checked="optionSelected"
            :disabled="pending"
            @change="$emit('update:optionSelected', ($event.target as HTMLInputElement).checked)"
          />
          <span>{{ optionLabel }}</span>
        </label>
        <div v-if="error" class="action-error" role="alert">{{ error }}</div>
        <footer>
          <button ref="cancelButton" type="button" class="secondary" :disabled="pending" @click="requestCancel">
            취소
          </button>
          <button type="button" class="danger" :disabled="pending" @click="$emit('confirm')">
            {{ pending ? pendingLabel : error ? '다시 시도' : confirmLabel }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.action-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 1400;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(4px);
}

.action-dialog {
  width: min(460px, 100%);
  max-height: calc(100dvh - 32px);
  overflow: auto;
  padding: 20px;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: var(--color-bg-secondary);
  box-shadow: var(--shadow-lg);
  color: var(--color-text);

  h3 {
    margin: 0 0 10px;
    color: var(--color-text-bright);
  }

  p {
    margin: 0;
    color: var(--color-text-muted);
    line-height: 1.6;
    white-space: pre-line;
  }

  footer {
    display: flex;
    justify-content: flex-end;
    gap: 9px;
    margin-top: 20px;
  }

  button {
    min-height: 38px;
    padding: 9px 16px;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
  }

  .secondary {
    border: 1px solid var(--color-border);
    background: var(--color-bg-tertiary);
    color: var(--color-text);
  }

  .danger {
    border: 0;
    background: #dc2626;
    color: #fff;
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
}

.action-option {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 16px;
  padding: 12px;
  border: 1px solid rgba(248, 113, 113, 0.35);
  border-radius: 9px;
  color: var(--color-text);
  line-height: 1.45;
  cursor: pointer;

  input {
    margin-top: 3px;
  }
}

.action-error {
  margin-top: 14px;
  padding: 10px 12px;
  border: 1px solid rgba(248, 113, 113, 0.45);
  border-radius: 8px;
  background: rgba(248, 113, 113, 0.1);
  color: #fca5a5;
  font-size: 13px;
  overflow-wrap: anywhere;
}

@media (max-width: 480px) {
  .action-dialog-overlay {
    padding: 8px;
  }

  .action-dialog {
    max-height: calc(100dvh - 16px);
  }

  .action-dialog footer {
    align-items: stretch;
    flex-direction: column-reverse;

    button {
      width: 100%;
    }
  }
}
</style>
