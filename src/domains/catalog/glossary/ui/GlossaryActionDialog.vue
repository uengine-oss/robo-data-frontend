<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'

defineProps<{
  title: string
  message: string
  confirmLabel: string
  danger?: boolean
  pending: boolean
  error: string | null
}>()

const emit = defineEmits<{
  cancel: []
  confirm: []
}>()

const confirmRef = ref<HTMLButtonElement>()

onMounted(async () => {
  await nextTick()
  confirmRef.value?.focus()
})
</script>

<template>
  <div class="confirmation-overlay">
    <section
      class="confirmation-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="glossary-action-title"
      aria-describedby="glossary-action-message"
      :aria-busy="pending"
      tabindex="-1"
      @keydown.esc.stop.prevent="!pending && emit('cancel')"
    >
      <h2 id="glossary-action-title">{{ title }}</h2>
      <p id="glossary-action-message">{{ message }}</p>
      <p v-if="error" class="confirmation-error" role="alert">{{ error }}</p>
      <div class="confirmation-actions">
        <button type="button" :disabled="pending" @click="emit('cancel')">
          취소
        </button>
        <button
          ref="confirmRef"
          type="button"
          :class="{ danger }"
          :disabled="pending"
          @click="emit('confirm')"
        >
          {{ pending ? '처리 중...' : confirmLabel }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.confirmation-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.62);
  backdrop-filter: blur(4px);
}

.confirmation-dialog {
  width: min(100%, 460px);
  padding: 24px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.3);

  h2 {
    margin: 0 0 12px;
    font-size: 1.2rem;
  }

  p {
    margin: 0;
    color: var(--color-text-muted);
    line-height: 1.6;
    overflow-wrap: anywhere;
  }
}

.confirmation-error {
  padding: 10px 12px;
  margin-top: 16px !important;
  color: #f87171 !important;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
}

.confirmation-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 24px;

  button {
    min-width: 88px;
    padding: 10px 16px;
    color: var(--color-text);
    font-weight: 600;
    cursor: pointer;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 10px;

    &:focus-visible {
      outline: 3px solid rgba(99, 102, 241, 0.55);
      outline-offset: 2px;
    }
  }

  .danger {
    color: white;
    background: #dc2626;
    border-color: #dc2626;
  }
}
</style>
