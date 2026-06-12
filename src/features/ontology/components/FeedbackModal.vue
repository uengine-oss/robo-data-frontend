<script setup lang="ts">
/**
 * FeedbackModal.vue
 * 온톨로지 스키마 수정 피드백 모달
 */
import { IconX } from '@/shared/icons'

const props = defineProps<{
  isOpen: boolean
  isLoading: boolean
  feedback: string
}>()

const emit = defineEmits<{
  (e: 'update:feedback', value: string): void
  (e: 'close'): void
  (e: 'submit'): void
}>()

// 피드백 예시
const feedbackExamples = [
  '센서(Sensor) 노드를 설비(Equipment) 하위로 이동해주세요',
  '알람(Alarm) 노드와 이벤트(Event) 노드를 합쳐주세요',
  '배포(Deployment) 노드에 환경(dev/staging/prod) 속성을 추가해주세요',
  '정수장(Plant)과 공정(ProcessUnit) 사이에 1:N 관계를 추가해주세요',
]

function setExample(example: string) {
  emit('update:feedback', example)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="isOpen" class="modal-overlay" @click.self="emit('close')">
        <div class="modal-content">
          <div class="modal-header">
            <h3>
              <span class="header-icon">💬</span>
              스키마 수정 요청
            </h3>
            <button class="close-btn" @click="emit('close')">
              <IconX :size="18" />
            </button>
          </div>
          
          <div class="modal-body">
            <p class="description">
              변경하고 싶은 내용을 자연어로 설명해주세요.
              AI가 피드백을 반영하여 스키마를 수정합니다.
            </p>
            
            <div class="examples">
              <span class="examples-label">예시:</span>
              <div class="example-chips">
                <button 
                  v-for="example in feedbackExamples" 
                  :key="example"
                  class="example-chip"
                  @click="setExample(example)"
                >
                  {{ example.length > 40 ? example.substring(0, 40) + '...' : example }}
                </button>
              </div>
            </div>
            
            <textarea
              :value="feedback"
              @input="emit('update:feedback', ($event.target as HTMLTextAreaElement).value)"
              placeholder="예: ProcessUnit 노드에 '운영상태' 속성을 추가하고, Equipment와 1:N 관계를 설정해주세요..."
              rows="5"
              :disabled="isLoading"
            ></textarea>
          </div>
          
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="emit('close')" :disabled="isLoading">
              취소
            </button>
            <button 
              class="btn btn-primary" 
              @click="emit('submit')"
              :disabled="!feedback.trim() || isLoading"
            >
              <span v-if="isLoading" class="spinner"></span>
              <span v-else>🔮</span>
              {{ isLoading ? '수정 중...' : '스키마 수정' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.modal-content {
  width: 90%;
  max-width: 560px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-tertiary);
  
  h3 {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--color-text-bright);
    
    .header-icon {
      font-size: 1.2rem;
    }
  }
  
  .close-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all 0.2s;
    
    &:hover {
      background: var(--color-bg-hover);
      color: var(--color-text);
    }
  }
}

.modal-body {
  padding: 24px;
  
  .description {
    margin: 0 0 16px 0;
    color: var(--color-text-muted);
    font-size: 0.9rem;
    line-height: 1.5;
  }
  
  .examples {
    margin-bottom: 16px;
    
    .examples-label {
      display: block;
      font-size: 0.8rem;
      color: var(--color-text-muted);
      margin-bottom: 8px;
    }
    
    .example-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    
    .example-chip {
      padding: 6px 12px;
      background: var(--color-bg-tertiary);
      border: 1px solid var(--color-border);
      border-radius: 20px;
      color: var(--color-text-light);
      font-size: 0.8rem;
      cursor: pointer;
      transition: all 0.2s;
      
      &:hover {
        background: var(--color-bg-hover);
        border-color: var(--color-accent);
        color: var(--color-accent);
      }
    }
  }
  
  textarea {
    width: 100%;
    padding: 14px 16px;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    color: var(--color-text);
    font-size: 0.95rem;
    font-family: inherit;
    resize: vertical;
    transition: border-color 0.2s;
    
    &::placeholder {
      color: var(--color-text-muted);
    }
    
    &:focus {
      outline: none;
      border-color: var(--color-accent);
    }
    
    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-tertiary);
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.btn-primary {
  background: linear-gradient(135deg, #a78bfa, #7c3aed);
  color: white;
  
  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(167, 139, 250, 0.4);
  }
}

.btn-secondary {
  background: var(--color-bg);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  
  &:hover:not(:disabled) {
    background: var(--color-bg-hover);
  }
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

// 모달 애니메이션
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .modal-content,
.modal-leave-active .modal-content {
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.modal-enter-from .modal-content,
.modal-leave-to .modal-content {
  transform: scale(0.95);
  opacity: 0;
}
</style>
