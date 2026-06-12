<script setup lang="ts">
/**
 * LangChainTab.vue
 * LangChain ReAct 기반 Text2SQL 인터페이스
 */
import { ref, computed, watch, nextTick } from 'vue'
import { useLangChainStore } from '@/features/langchain/langchain'
import FormattedResult from './FormattedResult.vue'

const langchainStore = useLangChainStore()

// Refs
const inputText = ref('')
const chatContainer = ref<HTMLElement | null>(null)
const maxIterations = ref(30)
const maxSqlSeconds = ref(60)
const showSettings = ref(false)

// Messages for chat display
interface ChatMessage {
  id: string
  type: 'user' | 'thinking' | 'action' | 'result' | 'final' | 'error'
  content: string
  tool?: string
  input?: string
  step?: number
}
const chatMessages = ref<ChatMessage[]>([])
let messageIdCounter = 0

// Computed
const canSubmit = computed(() => inputText.value.trim() && !langchainStore.isRunning)

// Functions
function addMessage(msg: Omit<ChatMessage, 'id'>) {
  const id = `msg-${++messageIdCounter}-${Date.now()}`
  chatMessages.value.push({ ...msg, id })
  scrollToBottom()
  return id
}

function removeThinkingMessages(step?: number) {
  // Remove thinking messages (optionally filtered by step)
  chatMessages.value = chatMessages.value.filter(msg => {
    if (msg.type !== 'thinking') return true
    if (step !== undefined) return msg.step !== step
    return false
  })
}

// 사용자가 스크롤을 위로 올렸는지 추적
const isUserScrolledUp = ref(false)

function handleScroll() {
  if (!chatContainer.value) return
  const { scrollTop, scrollHeight, clientHeight } = chatContainer.value
  // 바닥에서 50px 이내면 바닥으로 간주
  isUserScrolledUp.value = scrollHeight - scrollTop - clientHeight > 50
}

function scrollToBottom(force = false) {
  // 사용자가 위로 스크롤한 경우 자동 스크롤 안함 (force가 아닌 경우)
  if (isUserScrolledUp.value && !force) return
  
  nextTick(() => {
    if (chatContainer.value) {
      chatContainer.value.scrollTop = chatContainer.value.scrollHeight
    }
  })
}

async function handleSubmit() {
  if (!canSubmit.value) return
  
  const question = inputText.value.trim()
  inputText.value = ''
  chatMessages.value = []
  
  addMessage({ type: 'user', content: question })
  
  await langchainStore.start(question, {
    maxIterations: maxIterations.value,
    maxSqlSeconds: maxSqlSeconds.value,
  })
}

function handleCancel() {
  langchainStore.cancel()
  addMessage({ type: 'error', content: '작업이 중단되었습니다.' })
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSubmit()
  }
}

// Watch for phase changes
watch(() => langchainStore.currentPhase, (phase) => {
  const currentStep = langchainStore.currentStep
  
  if (phase === 'thinking') {
    // Remove previous thinking messages before adding new one
    removeThinkingMessages()
    addMessage({
      type: 'thinking',
      content: 'LLM이 사고 중입니다...',
      step: currentStep,
    })
  } else if (phase === 'acting' && langchainStore.currentTool) {
    // Remove thinking message when action starts
    removeThinkingMessages(currentStep)
    addMessage({
      type: 'action',
      content: `Tool: ${langchainStore.currentTool}`,
      tool: langchainStore.currentTool,
      input: langchainStore.currentToolInput || '',
      step: currentStep,
    })
  } else if (phase === 'idle') {
    // Remove any remaining thinking messages when idle
    removeThinkingMessages()
  }
})

// Watch for tool results
watch(() => langchainStore.currentToolResult, (result) => {
  if (result) {
    addMessage({
      type: 'result',
      content: result,
      step: langchainStore.currentStep,
    })
  }
})

// Watch for completion
watch(() => langchainStore.status, (status) => {
  // Clear thinking messages when completed or error
  if (status === 'completed' || status === 'error') {
    removeThinkingMessages()
  }
  
  if (status === 'completed' && langchainStore.finalOutput) {
    addMessage({
      type: 'final',
      content: langchainStore.finalOutput,
    })
  } else if (status === 'error' && langchainStore.error) {
    addMessage({
      type: 'error',
      content: langchainStore.error,
    })
  }
})

// Watch streaming text for scroll
watch(() => langchainStore.streamingText, () => {
  scrollToBottom()
})
</script>

<template>
  <div class="langchain-tab">
    <div class="header">
      <h2>🦜 LangChain Text2SQL</h2>
      <span class="badge">LangChain ReAct Agent</span>
    </div>
    
    <!-- Chat Container -->
    <div class="chat-container" ref="chatContainer" @scroll="handleScroll">
      <div v-if="chatMessages.length === 0" class="empty-state">
        <div class="empty-icon">🦜⛓️</div>
        <h3>LangChain ReAct Agent</h3>
        <p>자연어로 질문하면 LangChain이 SQL로 변환합니다.</p>
        <p class="hint">기존 Text2SQL과 비교해보세요!</p>
      </div>
      
      <TransitionGroup name="chat" tag="div" class="messages">
        <div
          v-for="msg in chatMessages"
          :key="msg.id"
          class="message"
          :class="msg.type"
        >
          <!-- User message -->
          <template v-if="msg.type === 'user'">
            <div class="message-avatar user">👤</div>
            <div class="message-content user-content">
              {{ msg.content }}
            </div>
          </template>
          
          <!-- Thinking -->
          <template v-else-if="msg.type === 'thinking'">
            <div class="message-avatar ai">🧠</div>
            <div class="message-content thinking-content">
              <span class="step-badge" v-if="msg.step">Step {{ msg.step }}</span>
              {{ msg.content }}
              <span class="loading-dots"><span></span><span></span><span></span></span>
            </div>
          </template>
          
          <!-- Action -->
          <template v-else-if="msg.type === 'action'">
            <div class="message-avatar ai">⚡</div>
            <div class="message-content action-content">
              <span class="step-badge" v-if="msg.step">Step {{ msg.step }}</span>
              <FormattedResult 
                :content="msg.content" 
                type="action" 
                :tool="msg.tool" 
                :input="msg.input" 
              />
            </div>
          </template>
          
          <!-- Result -->
          <template v-else-if="msg.type === 'result'">
            <div class="message-avatar ai">📋</div>
            <div class="message-content result-content">
              <FormattedResult :content="msg.content" type="result" />
            </div>
          </template>
          
          <!-- Final -->
          <template v-else-if="msg.type === 'final'">
            <div class="message-avatar ai">✅</div>
            <div class="message-content final-content">
              <FormattedResult :content="msg.content" type="final" />
            </div>
          </template>
          
          <!-- Error -->
          <template v-else-if="msg.type === 'error'">
            <div class="message-avatar error">❌</div>
            <div class="message-content error-content">
              {{ msg.content }}
            </div>
          </template>
        </div>
      </TransitionGroup>
      
      <!-- Streaming text display -->
      <div v-if="langchainStore.isRunning && langchainStore.streamingText" class="streaming-message">
        <div class="message-avatar ai">🧠</div>
        <div class="message-content streaming-content">
          <span class="step-badge">Step {{ langchainStore.currentStep }}</span>
          <div class="streaming-text">
            {{ langchainStore.streamingText }}<span class="cursor">▌</span>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Input Area -->
    <div class="input-area">
      <div v-if="langchainStore.isRunning" class="status-bar">
        <span class="status-dot running"></span>
        <span>LangChain Agent 실행 중... (Step {{ langchainStore.currentStep }})</span>
        <button class="cancel-btn" @click="handleCancel">중단</button>
      </div>
      
      <div class="input-row">
        <button class="settings-btn" @click="showSettings = !showSettings" :class="{ active: showSettings }">
          ⚙️
        </button>
        
        <textarea
          v-model="inputText"
          :disabled="langchainStore.isRunning"
          placeholder="자연어로 질문하세요... (Enter로 전송)"
          rows="1"
          @keydown="handleKeydown"
        ></textarea>
        
        <button
          class="send-btn"
          :disabled="!canSubmit"
          @click="handleSubmit"
        >
          🚀
        </button>
      </div>
      
      <Transition name="slide">
        <div v-if="showSettings" class="settings-panel">
          <div class="setting-item">
            <label>최대 반복 횟수</label>
            <input type="number" v-model="maxIterations" min="1" max="50" />
          </div>
          <div class="setting-item">
            <label>SQL 타임아웃 (초)</label>
            <input type="number" v-model="maxSqlSeconds" min="10" max="300" />
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.langchain-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg);
}

.header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 24px;
  border-bottom: 1px solid var(--color-border);
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(34, 197, 94, 0.05) 100%);
  
  h2 {
    margin: 0;
    font-size: 18px;
    color: var(--color-text);
  }
  
  .badge {
    background: linear-gradient(135deg, #10b981 0%, #22c55e 100%);
    color: white;
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
  }
}

.chat-container {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  text-align: center;
  
  .empty-icon {
    font-size: 48px;
    margin-bottom: 16px;
  }
  
  h3 {
    margin: 0 0 8px;
    color: var(--color-text);
  }
  
  .hint {
    margin-top: 16px;
    padding: 8px 16px;
    background: rgba(16, 185, 129, 0.1);
    border-radius: 8px;
    color: #10b981;
    font-size: 13px;
  }
}

.messages {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.message {
  display: flex;
  gap: 12px;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.message-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
  
  &.user {
    background: var(--color-accent);
  }
  
  &.ai {
    background: linear-gradient(135deg, #10b981 0%, #22c55e 100%);
  }
  
  &.error {
    background: var(--color-danger);
  }
}

.message-content {
  flex: 1;
  padding: 12px 16px;
  border-radius: 12px;
  background: var(--color-bg-secondary);
  
  &.user-content {
    background: var(--color-accent);
    color: white;
    margin-left: auto;
    max-width: 70%;
  }
  
  &.thinking-content {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--color-text-muted);
  }
  
  &.action-content {
    border-left: 3px solid #10b981;
    padding: 14px 16px;
  }
  
  &.result-content {
    padding: 14px 16px;
  }
  
  &.final-content {
    padding: 14px 16px;
  }
  
  &.final-content {
    border: 2px solid #10b981;
    background: rgba(16, 185, 129, 0.1);
  }
  
  &.error-content {
    background: rgba(239, 68, 68, 0.1);
    color: var(--color-danger);
  }
  
  &.streaming-content {
    .streaming-text {
      line-height: 1.6;
    }
  }
}

.step-badge {
  display: inline-block;
  background: var(--color-bg-tertiary);
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-muted);
  margin-right: 8px;
}

.loading-dots {
  display: inline-flex;
  gap: 4px;
  
  span {
    width: 6px;
    height: 6px;
    background: var(--color-text-muted);
    border-radius: 50%;
    animation: bounce 1.4s ease-in-out infinite;
    
    &:nth-child(1) { animation-delay: 0s; }
    &:nth-child(2) { animation-delay: 0.2s; }
    &:nth-child(3) { animation-delay: 0.4s; }
  }
}

@keyframes bounce {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
}

.cursor {
  animation: blink 1s step-end infinite;
  color: #10b981;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

.streaming-message {
  display: flex;
  gap: 12px;
}

.input-area {
  padding: 16px 24px;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
}

.status-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 8px 12px;
  background: rgba(16, 185, 129, 0.1);
  border-radius: 8px;
  font-size: 13px;
  
  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #10b981;
    animation: pulse 1.5s ease infinite;
  }
  
  .cancel-btn {
    margin-left: auto;
    background: var(--color-danger);
    color: white;
    border: none;
    padding: 4px 12px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
    
    &:hover {
      opacity: 0.9;
    }
  }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.input-row {
  display: flex;
  gap: 8px;
  
  textarea {
    flex: 1;
    padding: 12px 16px;
    border: 1px solid var(--color-border);
    border-radius: 12px;
    background: var(--color-bg);
    color: var(--color-text);
    font-size: 14px;
    resize: none;
    min-height: 44px;
    max-height: 120px;
    
    &:focus {
      outline: none;
      border-color: #10b981;
    }
    
    &:disabled {
      opacity: 0.6;
    }
  }
  
  .settings-btn, .send-btn {
    width: 44px;
    height: 44px;
    border: none;
    border-radius: 12px;
    cursor: pointer;
    font-size: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }
  
  .settings-btn {
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    
    &.active {
      background: var(--color-bg-tertiary);
    }
  }
  
  .send-btn {
    background: linear-gradient(135deg, #10b981 0%, #22c55e 100%);
    color: white;
    
    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    &:not(:disabled):hover {
      transform: scale(1.05);
    }
  }
}

.settings-panel {
  margin-top: 12px;
  padding: 12px;
  background: var(--color-bg);
  border-radius: 8px;
  display: flex;
  gap: 24px;
  
  .setting-item {
    display: flex;
    align-items: center;
    gap: 8px;
    
    label {
      font-size: 13px;
      color: var(--color-text-muted);
    }
    
    input {
      width: 80px;
      padding: 6px 10px;
      border: 1px solid var(--color-border);
      border-radius: 6px;
      background: var(--color-bg-secondary);
      color: var(--color-text);
      font-size: 13px;
    }
  }
}

.slide-enter-active, .slide-leave-active {
  transition: all 0.2s ease;
}
.slide-enter-from, .slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.chat-enter-active, .chat-leave-active {
  transition: all 0.3s ease;
}
.chat-enter-from {
  opacity: 0;
  transform: translateY(20px);
}
</style>

