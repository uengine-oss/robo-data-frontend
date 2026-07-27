<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import type { DataSource } from '../api/contracts.ts'

defineProps<{
  datasource: DataSource
  pending: boolean
  error: string | null
}>()

const emit = defineEmits<{
  cancel: []
  confirm: []
}>()

const confirmButtonRef = ref<HTMLButtonElement>()

onMounted(async () => {
  await nextTick()
  confirmButtonRef.value?.focus()
})
</script>

<template>
  <Teleport to="body">
    <div class="confirm-overlay">
      <section
        class="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-datasource-title"
        aria-describedby="delete-datasource-description"
        :aria-busy="pending"
        tabindex="-1"
        @keydown.esc.stop.prevent="!pending && emit('cancel')"
      >
        <h2 id="delete-datasource-title">데이터 소스 삭제</h2>
        <p id="delete-datasource-description">
          “{{ datasource.display_name || datasource.name }}” 데이터 소스를 삭제하시겠습니까?
        </p>
        <p v-if="error" class="confirm-error" role="alert">{{ error }}</p>
        <div class="confirm-actions">
          <button type="button" :disabled="pending" @click="emit('cancel')">
            취소
          </button>
          <button
            ref="confirmButtonRef"
            type="button"
            class="danger"
            :disabled="pending"
            @click="emit('confirm')"
          >
            {{ pending ? '삭제 중...' : '삭제' }}
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
}

.confirm-dialog {
  width: min(100%, 440px);
  padding: 24px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.25);

  h2 {
    margin: 0 0 12px;
    font-size: 1.2rem;
  }

  p {
    margin: 0;
    color: var(--color-text-muted);
    overflow-wrap: anywhere;
  }
}

.confirm-error {
  padding: 10px 12px;
  margin-top: 16px !important;
  color: #f87171 !important;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
}

.confirm-actions {
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
  }

  .danger {
    color: white;
    background: #dc2626;
    border-color: #dc2626;
  }
}
</style>
