<script setup lang="ts">
import { ref, watch } from 'vue'
import { useDialogFocusLifecycle } from '@/shared/composables/useDialogFocusLifecycle'

const props = defineProps<{
  open: boolean
  approved: boolean
  question: string
  pending: boolean
  error: string | null
}>()

const emit = defineEmits<{
  close: []
  submit: [notes: string]
}>()

const dialog = ref<HTMLElement | null>(null)
const notesInput = ref<HTMLTextAreaElement | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)
const notes = ref('')

function requestClose(): void {
  if (!props.pending) emit('close')
}

function submit(): void {
  if (!props.pending) emit('submit', notes.value.trim())
}

useDialogFocusLifecycle({
  active: () => props.open,
  dialog,
  requestClose,
  initialFocus: () => props.approved ? closeButton.value : notesInput.value,
  canClose: () => !props.pending,
})

watch(() => props.open, open => {
  if (open) notes.value = ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="feedback-dialog">
      <div v-if="open" class="feedback-dialog-overlay" @click.self="requestClose">
        <section
          ref="dialog"
          class="feedback-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="feedback-dialog-title"
          :aria-busy="pending"
          tabindex="-1"
        >
          <header>
            <div>
              <h3 id="feedback-dialog-title">
                {{ approved ? '피드백 다시 시도' : '틀린 이유 보내기' }}
              </h3>
              <p>{{ question || '현재 SQL 결과' }}</p>
            </div>
            <button ref="closeButton" type="button" aria-label="피드백 닫기" :disabled="pending" @click="requestClose">×</button>
          </header>

          <div class="feedback-dialog-body">
            <label v-if="!approved" for="feedback-notes">틀린 이유 또는 추가 정보 (선택)</label>
            <textarea
              v-if="!approved"
              id="feedback-notes"
              ref="notesInput"
              v-model="notes"
              rows="4"
              placeholder="더 정확한 결과를 위해 보완할 내용을 입력하세요."
              :disabled="pending"
              @keydown.ctrl.enter.prevent="submit"
              @keydown.meta.enter.prevent="submit"
            />
            <p v-else>맞아요 피드백 저장에 실패했습니다. 같은 피드백을 다시 보낼 수 있습니다.</p>
            <div v-if="error" class="feedback-error" role="alert">{{ error }}</div>
          </div>

          <footer>
            <button type="button" class="secondary" :disabled="pending" @click="requestClose">취소</button>
            <button type="button" class="primary" :disabled="pending" @click="submit">
              {{ pending ? '저장 중…' : error ? '다시 시도' : '보내기' }}
            </button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.feedback-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 1250;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(4px);
}

.feedback-dialog {
  display: flex;
  flex-direction: column;
  width: min(480px, 100%);
  max-height: calc(100dvh - 32px);
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: var(--color-bg-secondary);
  box-shadow: var(--shadow-lg);
  color: var(--color-text);
}

header,
footer {
  display: flex;
  align-items: center;
  padding: 16px 18px;
}

header {
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--color-border);

  h3 { margin: 0; color: var(--color-text-bright); font-size: 17px; }
  p { margin: 5px 0 0; color: var(--color-text-muted); font-size: 12px; }
  button { border: 0; background: transparent; color: var(--color-text-muted); font-size: 20px; cursor: pointer; }
}

.feedback-dialog-body {
  display: grid;
  min-height: 0;
  gap: 9px;
  padding: 18px;
  overflow-y: auto;

  label { color: var(--color-text-light); font-size: 13px; font-weight: 600; }
  p { margin: 0; line-height: 1.6; }
  textarea {
    width: 100%;
    resize: vertical;
    padding: 11px 12px;
    border: 1px solid var(--color-border);
    border-radius: 9px;
    background: var(--color-bg-tertiary);
    color: var(--color-text);
    font: inherit;
  }
}

.feedback-error {
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--color-error) 50%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-error) 12%, transparent);
  color: var(--color-error);
  font-size: 13px;
}

footer {
  justify-content: flex-end;
  gap: 9px;
  border-top: 1px solid var(--color-border);

  button {
    padding: 9px 16px;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
  }
  .secondary { border: 1px solid var(--color-border); background: var(--color-bg-tertiary); color: var(--color-text); }
  .primary {
    border: 0;
    background: linear-gradient(135deg, #00d4aa, #0891b2);
    color: #fff;
  }
}

button:disabled,
textarea:disabled { cursor: not-allowed; opacity: 0.55; }

.feedback-dialog-enter-active,
.feedback-dialog-leave-active { transition: opacity 0.18s ease; }
.feedback-dialog-enter-from,
.feedback-dialog-leave-to { opacity: 0; }

@media (max-width: 480px) {
  .feedback-dialog-overlay { padding: 8px; }
  .feedback-dialog { max-height: calc(100dvh - 16px); }
  footer {
    align-items: stretch;
    flex-direction: column-reverse;
    button { width: 100%; }
  }
}
</style>
