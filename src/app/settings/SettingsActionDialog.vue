<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDialogFocusLifecycle } from '@/shared/composables/useDialogFocusLifecycle'

export type SettingsDangerAction = 'new-session' | 'delete-all'

const props = defineProps<{
  action: SettingsDangerAction | null
  pending: boolean
  error: string | null
}>()

const emit = defineEmits<{
  cancel: []
  confirm: []
}>()

const dialog = ref<HTMLElement | null>(null)
const confirmButton = ref<HTMLButtonElement | null>(null)

const content = computed(() => {
  if (props.action === 'delete-all') {
    return {
      title: '모든 서버 데이터 삭제',
      description: '서버의 모든 분석 데이터를 삭제합니다. 이 작업은 되돌릴 수 없습니다.',
      confirmLabel: props.pending ? '삭제 중…' : '전체 삭제',
    }
  }
  return {
    title: '새 세션 시작',
    description: '현재 화면의 업로드 데이터와 분석 그래프를 초기화하고 업로드 화면으로 돌아갑니다.',
    confirmLabel: '새 세션 시작',
  }
})

function requestCancel(): void {
  if (!props.pending) emit('cancel')
}

useDialogFocusLifecycle({
  active: () => props.action !== null,
  dialog,
  requestClose: requestCancel,
  initialFocus: () => confirmButton.value,
  canClose: () => !props.pending,
})
</script>

<template>
  <Teleport to="body">
    <Transition name="settings-action">
      <div
        v-if="action"
        class="settings-action-overlay"
        @click.self.stop="requestCancel"
      >
        <section
          ref="dialog"
          class="settings-action-dialog"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="settings-action-title"
          aria-describedby="settings-action-description"
          :aria-busy="pending"
          tabindex="-1"
        >
          <h3 id="settings-action-title">{{ content.title }}</h3>
          <p id="settings-action-description">{{ content.description }}</p>
          <p v-if="error" class="settings-action-error" role="alert">{{ error }}</p>
          <div class="settings-action-buttons">
            <button type="button" class="btn btn--secondary" :disabled="pending" @click="requestCancel">
              취소
            </button>
            <button
              ref="confirmButton"
              type="button"
              class="btn btn--danger"
              :disabled="pending"
              @click="emit('confirm')"
            >
              {{ error && !pending ? '다시 시도' : content.confirmLabel }}
            </button>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.settings-action-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.68);
}

.settings-action-dialog {
  width: min(420px, 100%);
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

.settings-action-error {
  margin-top: 16px !important;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--color-error) 55%, transparent);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-error) 12%, transparent);
  color: var(--color-error);
  font-size: 13px;
}

.settings-action-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 24px;
}

.settings-action-enter-active,
.settings-action-leave-active {
  transition: opacity 0.18s ease;
}

.settings-action-enter-from,
.settings-action-leave-to {
  opacity: 0;
}

@media (max-width: 480px) {
  .settings-action-dialog {
    padding: 20px;
  }

  .settings-action-buttons {
    align-items: stretch;
    flex-direction: column-reverse;

    .btn {
      width: 100%;
    }
  }
}
</style>
