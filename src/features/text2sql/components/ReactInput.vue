<template>
  <div class="react-input">
    <div v-if="!waitingForUser" class="input-container">
      <textarea 
        v-model="question" 
        @keydown.ctrl.enter.prevent="submitQuestion"
        placeholder="질문을 입력하세요... 예: '지난 분기 매출 Top 5 제품을 보여줘'" 
        rows="3" 
        :disabled="loading"
      ></textarea>
      <div class="action-buttons">
        <button v-if="!loading" class="btn btn--primary" @click="submitQuestion" :disabled="!canSubmitQuestion">
          <IconPlay :size="16" />
          <span>실행</span>
        </button>
        <button v-if="loading" class="btn btn--secondary" type="button" @click="emit('cancel')">
          <IconX :size="16" />
          <span>중단</span>
        </button>
      </div>
    </div>

    <!-- 고급 설정 -->
    <div v-if="!waitingForUser" class="settings-section">
      <button class="settings-toggle" type="button" @click="showSettings = !showSettings">
        <IconSettings :size="14" />
        <span>고급 설정</span>
        <IconChevronDown :size="14" :class="['toggle-arrow', { expanded: showSettings }]" />
      </button>
      <transition name="slide">
        <div v-if="showSettings" class="settings-panel">
          <div class="setting-item">
            <label for="maxToolCalls">
              <span class="setting-label">최대 도구 호출 횟수</span>
              <span class="setting-hint">에이전트가 사용할 수 있는 도구 호출 수 (1~100)</span>
            </label>
            <div class="setting-input-group">
              <input 
                id="maxToolCalls" 
                v-model.number="maxToolCalls" 
                type="number" 
                min="1" 
                max="100"
                :disabled="loading" 
              />
              <span class="setting-unit">회</span>
            </div>
          </div>
          <div class="setting-item">
            <label for="maxSqlSeconds">
              <span class="setting-label">SQL 실행 제한 시간</span>
              <span class="setting-hint">최종 SQL 실행 최대 허용 시간 (1~3600초)</span>
            </label>
            <div class="setting-input-group">
              <input 
                id="maxSqlSeconds" 
                v-model.number="maxSqlSeconds" 
                type="number" 
                min="1" 
                max="3600"
                :disabled="loading" 
              />
              <span class="setting-unit">초</span>
            </div>
          </div>
        </div>
      </transition>
    </div>

    <div v-else class="follow-up-wrapper">
      <div class="follow-up-question">
        <IconAlertTriangle :size="16" />
        <div class="follow-up-content">
          <strong>에이전트 질문:</strong>
          <p>{{ questionToUser }}</p>
        </div>
      </div>
      <div class="follow-up-container">
        <textarea 
          v-model="userResponse" 
          @keydown.ctrl.enter.prevent="submitUserResponse"
          placeholder="추가 정보를 입력해주세요. (Ctrl+Enter 전송)" 
          rows="3" 
          :disabled="loading"
        ></textarea>
        <div class="action-buttons">
          <button class="btn btn--secondary" type="button" @click="emit('cancel')">
            <IconX :size="16" />
            <span>중단</span>
          </button>
          <button class="btn btn--primary" @click="submitUserResponse" :disabled="!canSubmitUserResponse">
            <IconUpload :size="16" />
            <span>{{ loading ? '전송 중...' : '답변 보내기' }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { IconPlay, IconX, IconSettings, IconChevronDown, IconAlertTriangle, IconUpload } from '@/components/icons'

export interface ReactStartOptions {
  maxToolCalls: number
  maxSqlSeconds: number
}

const emit = defineEmits<{
  start: [question: string, options: ReactStartOptions]
  respond: [answer: string]
  cancel: []
}>()

const props = defineProps<{
  loading: boolean
  waitingForUser: boolean
  questionToUser: string | null
  currentQuestion: string
}>()

const question = ref(props.currentQuestion ?? '')
const userResponse = ref('')
const showSettings = ref(false)
const maxToolCalls = ref(30)
const maxSqlSeconds = ref(60)

const waitingForUser = computed(() => props.waitingForUser)

const canSubmitQuestion = computed(() => !!question.value.trim() && !props.loading)
const canSubmitUserResponse = computed(() => !!userResponse.value.trim() && !props.loading)

watch(
  () => props.currentQuestion,
  newVal => {
    if (!props.loading && !waitingForUser.value) {
      question.value = newVal
    }
  }
)

watch(waitingForUser, isWaiting => {
  if (!isWaiting) {
    userResponse.value = ''
  }
})

function submitQuestion() {
  if (!canSubmitQuestion.value) return
  const trimmed = question.value.trim()
  question.value = trimmed
  emit('start', trimmed, {
    maxToolCalls: maxToolCalls.value,
    maxSqlSeconds: maxSqlSeconds.value
  })
}

function submitUserResponse() {
  if (!canSubmitUserResponse.value) return
  const trimmed = userResponse.value.trim()
  userResponse.value = trimmed
  emit('respond', trimmed)
}
</script>

<style scoped lang="scss">
.react-input {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
}

.input-container,
.follow-up-container {
  display: flex;
  flex-direction: row;
  gap: 12px;
  align-items: stretch;
}

.follow-up-wrapper {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

textarea {
  flex: 1;
  padding: 12px 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: 14px;
  font-family: var(--font-main);
  resize: none;
  min-height: 80px;
  transition: all 0.15s;
  background: var(--color-bg-secondary);
  color: var(--color-text);
  
  &::placeholder {
    color: var(--color-text-muted);
  }
  
  &:focus {
    outline: none;
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px rgba(34, 139, 230, 0.15);
    background: var(--color-bg-tertiary);
  }
  
  &:disabled {
    background: var(--color-bg-tertiary);
    cursor: not-allowed;
    opacity: 0.7;
  }
}

.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 120px;
  
  .btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
}

.follow-up-question {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  background: rgba(251, 191, 36, 0.15);
  border: 1px solid rgba(251, 191, 36, 0.3);
  border-left: 3px solid var(--color-warning);
  padding: 12px 16px;
  border-radius: var(--radius-md);
  color: var(--color-warning);
  
  .follow-up-content {
    flex: 1;
    
    strong {
      font-size: 13px;
      color: var(--color-text);
    }
    
    p {
      margin: 8px 0 0 0;
      white-space: pre-wrap;
      font-size: 14px;
      color: var(--color-text);
    }
  }
}

.settings-section {
  margin-top: 4px;
}

.settings-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: transparent;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-light);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
  width: 100%;
  justify-content: center;
  
  &:hover {
    background: var(--color-bg-tertiary);
    border-color: var(--color-text-muted);
  }
  
  .toggle-arrow {
    margin-left: auto;
    transition: transform 0.2s;
    
    &.expanded {
      transform: rotate(180deg);
    }
  }
}

.settings-panel {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  margin-top: 12px;
  padding: 16px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.setting-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.setting-item label {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.setting-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
}

.setting-hint {
  font-size: 11px;
  color: var(--color-text-light);
}

.setting-input-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.setting-input-group input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: 14px;
  max-width: 100px;
  background: var(--color-bg);
  color: var(--color-text);
  
  &:focus {
    outline: none;
    border-color: var(--color-accent);
  }
}

.setting-unit {
  font-size: 13px;
  color: var(--color-text-light);
}

.slide-enter-active,
.slide-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  max-height: 0;
}

.slide-enter-to,
.slide-leave-from {
  opacity: 1;
  max-height: 200px;
}
</style>
