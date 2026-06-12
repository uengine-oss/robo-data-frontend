<script setup lang="ts">
/**
 * EventDetection.vue
 * 이벤트 감지 및 조치 - 대화형 인터페이스
 * 
 * 사용자가 자연어로 이벤트 상황을 설명하면
 * AI가 대화를 통해 감지 조건, 조치 방법 등을 설정합니다.
 */
import { ref, nextTick, onMounted } from 'vue'
import { 
  IconPlay, 
  IconRefresh,
  IconTrash,
  IconBell,
  IconCheck
} from '@/shared/icons'
import { eventApi } from '@/features/observability/api'
import type { EventRule as ApiEventRule, SimulationRequest, SimulationResult } from '@/features/observability/api'

// 대화 메시지 타입
interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  eventConfig?: Partial<EventConfig>
  isStreaming?: boolean
  showConfirm?: boolean  // 확정 버튼 표시 여부
}

// 이벤트 설정 타입
interface EventConfig {
  name: string
  description: string
  condition: string
  sql: string
  interval: number
  threshold: string
  actionType: 'alert' | 'process'
  alertChannels?: string[]
  processName?: string
  confirmed: boolean
}

// 채팅 상태
const messages = ref<ChatMessage[]>([])
const inputText = ref('')
const isProcessing = ref(false)
const chatContainerRef = ref<HTMLElement | null>(null)

// 현재 설정 중인 이벤트
const currentEventConfig = ref<Partial<EventConfig>>({})
const configStep = ref<'initial' | 'analyzing' | 'confirm' | 'done'>('initial')

// 등록된 이벤트 목록
const events = ref<ApiEventRule[]>([])
const showEventList = ref(true)

// 시뮬레이션 상태
const isSimulating = ref(false)
const simulationResult = ref<SimulationResult | null>(null)
const showSimulationResult = ref(false)

// 메시지 ID 생성
const generateId = () => `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

// 메시지 추가
const addMessage = (role: 'user' | 'assistant' | 'system', content: string, options?: {
  eventConfig?: Partial<EventConfig>
  showConfirm?: boolean
}) => {
  const message: ChatMessage = {
    id: generateId(),
    role,
    content,
    timestamp: new Date(),
    eventConfig: options?.eventConfig,
    showConfirm: options?.showConfirm
  }
  messages.value.push(message)
  scrollToBottom()
  return message
}

// 스크롤 하단으로
const scrollToBottom = async () => {
  await nextTick()
  if (chatContainerRef.value) {
    chatContainerRef.value.scrollTop = chatContainerRef.value.scrollHeight
  }
}

// AI 대화 처리 (백엔드 API 호출)
const processWithAI = async (userMessage: string) => {
  isProcessing.value = true
  
  // 스트리밍 메시지 추가
  const assistantMessage = addMessage('assistant', '')
  assistantMessage.isStreaming = true
  
  try {
    const response = await fetch('/api/gateway/text2sql/events/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: userMessage,
        history: messages.value.slice(0, -1).map(m => ({
          role: m.role,
          content: m.content
        })),
        current_config: currentEventConfig.value,
        step: configStep.value
      })
    })

    if (!response.ok) {
      throw new Error('API 오류')
    }

    const data = await response.json()
    
    // 응답 업데이트
    assistantMessage.content = data.response
    assistantMessage.isStreaming = false
    
    // 추출된 설정 업데이트
    if (data.extracted_config) {
      currentEventConfig.value = { ...currentEventConfig.value, ...data.extracted_config }
      assistantMessage.eventConfig = data.extracted_config
    }
    
    // 확정 요청 시 버튼 표시
    if (data.ready_to_confirm) {
      assistantMessage.showConfirm = true
      configStep.value = 'confirm'
    }
    
    // 이벤트 생성 완료
    if (data.event_created) {
      await refreshEvents()
      configStep.value = 'done'
    }
    
  } catch (error) {
    // 폴백: 로컬 처리
    const result = await processLocally(userMessage)
    assistantMessage.content = result.response
    assistantMessage.isStreaming = false
    assistantMessage.eventConfig = result.config
    assistantMessage.showConfirm = result.showConfirm
    
    if (result.config) {
      currentEventConfig.value = { ...currentEventConfig.value, ...result.config }
    }
  }
  
  isProcessing.value = false
  scrollToBottom()
}

// 로컬 처리 (API 없을 때 폴백)
const processLocally = async (userMessage: string): Promise<{
  response: string
  config?: Partial<EventConfig>
  showConfirm?: boolean
}> => {
  // 자연어에서 핵심 정보 추출
  const extracted = extractEventInfo(userMessage)
  
  // 초기 단계 또는 새 이벤트
  if (configStep.value === 'initial' || configStep.value === 'done') {
    configStep.value = 'confirm'  // 'analyzing' → 'confirm'으로 변경하여 버튼 표시
    
    return {
      response: `이해했습니다! 다음과 같이 이벤트를 설정하겠습니다.

📊 **감지 조건**
${extracted.condition ? `"${extracted.condition}"` : userMessage}

⏱️ **감지 간격**: ${extracted.interval || 10}분마다 확인

${extracted.actionType === 'process' ? '⚡ **조치**: 자동 프로세스 실행' : '🔔 **조치**: 알림 발송'}

${extracted.processName ? `🔧 **실행 프로세스**: ${extracted.processName}` : ''}

이대로 설정을 완료할까요? 수정이 필요하면 말씀해 주세요.`,
      config: {
        ...extracted,
        description: userMessage
      },
      showConfirm: true
    }
  }
  
  // 확정 단계에서 수정 요청
  if (configStep.value === 'confirm') {
    const lowerMsg = userMessage.toLowerCase()
    
    // 수정 요청 감지
    if (lowerMsg.includes('수정') || lowerMsg.includes('변경') || lowerMsg.includes('바꿔')) {
      const newExtracted = extractEventInfo(userMessage)
      
      return {
        response: `수정 사항을 반영했습니다.

📊 **감지 조건**
"${newExtracted.condition || currentEventConfig.value.condition}"

⏱️ **감지 간격**: ${newExtracted.interval || currentEventConfig.value.interval || 10}분

${(newExtracted.actionType || currentEventConfig.value.actionType) === 'process' ? '⚡ **조치**: 자동 프로세스 실행' : '🔔 **조치**: 알림 발송'}

이대로 진행할까요?`,
        config: newExtracted,
        showConfirm: true
      }
    }
    
    // 간격 변경
    const intervalMatch = userMessage.match(/(\d+)\s*(분|시간)/)
    if (intervalMatch) {
      let interval = parseInt(intervalMatch[1])
      if (intervalMatch[2] === '시간') interval *= 60
      
      return {
        response: `감지 간격을 **${interval}분**으로 변경했습니다. 다른 수정 사항이 있으신가요?`,
        config: { interval },
        showConfirm: true
      }
    }
    
    // 조치 방법 변경
    if (lowerMsg.includes('알림') || lowerMsg.includes('알려')) {
      return {
        response: `조치 방법을 **알림 발송**으로 변경했습니다.`,
        config: { actionType: 'alert' },
        showConfirm: true
      }
    }
    
    if (lowerMsg.includes('프로세스') || lowerMsg.includes('자동') || lowerMsg.includes('실행')) {
      const processMatch = userMessage.match(/프로세스[:\s]*([가-힣\w_]+)/i)
      return {
        response: `조치 방법을 **프로세스 실행**으로 변경했습니다.${processMatch ? ` (${processMatch[1]})` : ''}`,
        config: { 
          actionType: 'process',
          processName: processMatch?.[1]
        },
        showConfirm: true
      }
    }
  }
  
  return {
    response: '말씀하신 내용을 이해했습니다. 조금 더 자세히 설명해 주시겠어요?'
  }
}

// 자연어에서 이벤트 정보 추출
const extractEventInfo = (text: string): Partial<EventConfig> => {
  const config: Partial<EventConfig> = {}
  
  // 조건 추출 (숫자 + 단위 패턴)
  const conditionPatterns = [
    /(수위|온도|유량|탁도|압력|수량).{0,20}(\d+(?:\.\d+)?)\s*(m|미터|도|°C|%|퍼센트|이상|이하|초과|미만)/gi,
    /(\d+(?:\.\d+)?)\s*(m|미터|도|°C|%)\s*(이상|이하|초과|미만)/gi
  ]
  
  for (const pattern of conditionPatterns) {
    const match = text.match(pattern)
    if (match) {
      config.condition = match[0]
      break
    }
  }
  
  if (!config.condition && text.length < 100) {
    config.condition = text
  }
  
  // 이름 추출
  const namePatterns = [
    /(수위|온도|유량|탁도|압력).{0,5}(이상|급증|급감|경고|감지)/gi,
    /(이상|급증|급감).{0,5}(감지|경고|알림)/gi
  ]
  
  for (const pattern of namePatterns) {
    const match = text.match(pattern)
    if (match) {
      config.name = match[0]
      break
    }
  }
  
  if (!config.name) {
    config.name = text.substring(0, 30) + (text.length > 30 ? '...' : '')
  }
  
  // 시간 간격 추출
  const intervalMatch = text.match(/(\d+)\s*(분|시간|초)/i)
  if (intervalMatch) {
    let interval = parseInt(intervalMatch[1])
    if (intervalMatch[2] === '시간') interval *= 60
    if (intervalMatch[2] === '초') interval = Math.max(1, Math.ceil(interval / 60))
    config.interval = interval
  } else {
    config.interval = 10  // 기본값
  }
  
  // 조치 타입 추출
  if (text.includes('프로세스') || text.includes('자동') || text.includes('실행') || text.includes('조치')) {
    config.actionType = 'process'
    
    // 프로세스 이름 추출
    const processMatch = text.match(/(?:프로세스|실행)[:\s]*([가-힣\w_]+)/i)
    if (processMatch) {
      config.processName = processMatch[1]
    }
  } else {
    config.actionType = 'alert'
  }
  
  // 지속 시간 조건
  if (text.includes('지속') || text.includes('계속')) {
    const durationMatch = text.match(/(\d+)\s*(분|시간).{0,5}(지속|계속)/i)
    if (durationMatch) {
      config.threshold = `duration >= ${durationMatch[1]}${durationMatch[2] === '시간' ? 'h' : 'm'}`
    }
  }
  
  return config
}

// 이벤트 확정 등록
const confirmEvent = async () => {
  isProcessing.value = true
  
  try {
    // SQL 생성 (간단한 템플릿)
    const sql = `-- 자연어 조건: ${currentEventConfig.value.condition}
SELECT * FROM sensor_data 
WHERE condition_met = true 
  AND measured_at >= NOW() - INTERVAL '${currentEventConfig.value.interval || 10} minutes'`
    
    await eventApi.createRule({
      name: currentEventConfig.value.name || '새 이벤트',
      description: currentEventConfig.value.description || '',
      natural_language_condition: currentEventConfig.value.condition || '',
      sql: sql,
      check_interval_minutes: currentEventConfig.value.interval || 10,
      condition_threshold: currentEventConfig.value.threshold || 'rows > 0',
      action_type: currentEventConfig.value.actionType || 'alert',
      alert_config: currentEventConfig.value.actionType === 'alert' ? {
        channels: ['platform'],
        message: currentEventConfig.value.description || ''
      } : undefined,
      process_config: currentEventConfig.value.actionType === 'process' ? {
        process_name: currentEventConfig.value.processName || '',
        process_params: {}
      } : undefined
    })
    
    addMessage('assistant', `✅ **이벤트가 등록되었습니다!**

지금부터 ${currentEventConfig.value.interval || 10}분마다 조건을 확인하고,
조건 충족 시 ${currentEventConfig.value.actionType === 'alert' ? '알림을 보내' : '프로세스를 실행'}드립니다.

🎯 Esper CEP 엔진에 규칙이 등록되어 실시간 모니터링이 시작됩니다.

다른 이벤트를 등록하시려면 새로운 상황을 설명해 주세요.`)
    
    await refreshEvents()
    configStep.value = 'done'
    currentEventConfig.value = {}
    
  } catch (error) {
    addMessage('system', '⚠️ 이벤트 등록 중 오류가 발생했습니다. 다시 시도해 주세요.')
  }
  
  isProcessing.value = false
}

// 메시지 전송
const sendMessage = async () => {
  const text = inputText.value.trim()
  if (!text || isProcessing.value) return
  
  inputText.value = ''
  addMessage('user', text)
  
  await processWithAI(text)
}

// 이벤트 목록 새로고침
const refreshEvents = async () => {
  try {
    events.value = await eventApi.listRules()
  } catch (error) {
    console.error('이벤트 목록 조회 오류:', error)
  }
}

// 이벤트 삭제
const deleteEvent = async (id: string) => {
  if (confirm('이 이벤트를 삭제하시겠습니까?')) {
    try {
      await eventApi.deleteRule(id)
      await refreshEvents()
    } catch (error) {
      console.error('삭제 오류:', error)
    }
  }
}

// 이벤트 토글
const toggleEvent = async (event: ApiEventRule) => {
  try {
    await eventApi.toggleRule(event.id)
    await refreshEvents()
  } catch (error) {
    console.error('토글 오류:', error)
  }
}

// 빠른 예시 클릭
const useExample = (example: string) => {
  inputText.value = example
}

// 시뮬레이션 실행
const runSimulation = async () => {
  if (!currentEventConfig.value.condition) {
    addMessage('system', '⚠️ 먼저 감지 조건을 설정해주세요.')
    return
  }
  
  isSimulating.value = true
  
  try {
    // 조건에서 임계값 추출 (간단한 패턴 매칭)
    let threshold = 3.0
    const thresholdMatch = currentEventConfig.value.condition?.match(/(\d+(?:\.\d+)?)\s*(m|미터|%|도)?/)
    if (thresholdMatch) {
      threshold = parseFloat(thresholdMatch[1])
    }
    
    const request: SimulationRequest = {
      rule_name: currentEventConfig.value.name || '시뮬레이션 테스트',
      natural_language_condition: currentEventConfig.value.condition || '',
      field_name: 'water_level',
      threshold: threshold,
      duration_minutes: currentEventConfig.value.interval || 10,
      simulated_value: threshold + 0.5,  // 임계값보다 약간 높은 값
      simulated_duration_minutes: (currentEventConfig.value.interval || 10) + 2,  // 필요 시간보다 약간 더
      station_id: '시뮬레이션관측소'
    }
    
    const result = await eventApi.runSimulation(request)
    simulationResult.value = result
    showSimulationResult.value = true
    
    // 결과 메시지 추가
    if (result.alarms_triggered > 0) {
      addMessage('assistant', `🎉 **시뮬레이션 성공!**

조건이 충족되어 알람이 트리거되었습니다.

📊 **시뮬레이션 결과**
- 생성된 이벤트: ${result.events_generated}개
- 트리거된 알람: ${result.alarms_triggered}개
- 조건: ${result.condition_details.field} ${result.condition_details.operator} ${result.condition_details.threshold}
- 필요 지속 시간: ${result.condition_details.required_duration_minutes}분
- 시뮬레이션 지속 시간: ${result.condition_details.simulated_duration_minutes}분

✅ 이벤트 감지 시스템이 정상 동작합니다!`)
    } else {
      addMessage('assistant', `ℹ️ **시뮬레이션 완료**

조건이 충족되지 않아 알람이 트리거되지 않았습니다.

📊 **시뮬레이션 상세**
- 생성된 이벤트: ${result.events_generated}개
- 조건: ${result.condition_details.field} ${result.condition_details.operator} ${result.condition_details.threshold}
- 필요 지속 시간: ${result.condition_details.required_duration_minutes}분

조건을 확인하고 다시 시도해주세요.`)
    }
    
  } catch (error) {
    addMessage('system', `⚠️ 시뮬레이션 오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`)
  } finally {
    isSimulating.value = false
  }
}

// 초기 환영 메시지
onMounted(() => {
  addMessage('assistant', `안녕하세요! 👋 **이벤트 감지 도우미**입니다.

어떤 상황을 감지하고 싶으신가요? 
자연어로 편하게 설명해 주시면, 제가 필요한 설정을 알아서 추출해 드릴게요.

**예시:**
• "수위가 3m 이상이면 알려줘"
• "유량이 급격히 증가하면 유량관리 프로세스를 자동 실행해줘"
• "탁도가 10분간 상승 추세면 경고해줘"
• "수위 3m 초과가 5분 이상 지속되면 배수 프로세스 실행"`)
  
  refreshEvents()
})
</script>

<template>
  <div class="event-chat-page">
    <!-- 메인: 대화 인터페이스 -->
    <main class="chat-main">
      <!-- 헤더 -->
      <header class="chat-header">
        <div class="header-info">
          <h1>🎯 이벤트 감지 및 조치</h1>
          <p>자연어로 감지 조건을 설명하면 AI가 설정을 도와드립니다.</p>
        </div>
        <button 
          class="toggle-list-btn"
          @click="showEventList = !showEventList"
        >
          📋 등록된 이벤트 ({{ events.length }})
        </button>
      </header>

      <!-- 대화 영역 -->
      <div class="chat-messages" ref="chatContainerRef">
        <div 
          v-for="msg in messages" 
          :key="msg.id" 
          class="message"
          :class="msg.role"
        >
          <div class="message-avatar">
            {{ msg.role === 'user' ? '👤' : msg.role === 'system' ? '⚠️' : '🤖' }}
          </div>
          <div class="message-bubble">
            <div class="message-text" v-html="formatMessage(msg.content)"></div>
            
            <!-- 추출된 설정 카드 -->
            <div v-if="msg.eventConfig && Object.keys(msg.eventConfig).length > 0" class="config-card">
              <div v-if="msg.eventConfig.condition" class="config-item">
                <span class="config-icon">📊</span>
                <span class="config-label">조건:</span>
                <span class="config-value">{{ msg.eventConfig.condition }}</span>
              </div>
              <div v-if="msg.eventConfig.interval" class="config-item">
                <span class="config-icon">⏱️</span>
                <span class="config-label">간격:</span>
                <span class="config-value">{{ msg.eventConfig.interval }}분</span>
              </div>
              <div v-if="msg.eventConfig.actionType" class="config-item">
                <span class="config-icon">{{ msg.eventConfig.actionType === 'alert' ? '🔔' : '⚡' }}</span>
                <span class="config-label">조치:</span>
                <span class="config-value">
                  {{ msg.eventConfig.actionType === 'alert' ? '알림 발송' : '프로세스 실행' }}
                  {{ msg.eventConfig.processName ? `(${msg.eventConfig.processName})` : '' }}
                </span>
              </div>
            </div>
            
            <!-- 확정 버튼 -->
            <div v-if="msg.showConfirm && configStep === 'confirm'" class="confirm-actions">
              <button class="confirm-btn secondary" @click="inputText = '수정할게요'">
                ✏️ 수정
              </button>
              <button class="confirm-btn simulate" @click="runSimulation" :disabled="isSimulating">
                <IconPlay v-if="!isSimulating" :size="16" />
                <IconRefresh v-else :size="16" class="spinning" />
                {{ isSimulating ? '시뮬레이션 중...' : '🧪 시뮬레이션' }}
              </button>
              <button class="confirm-btn primary" @click="confirmEvent" :disabled="isProcessing">
                <IconCheck :size="16" />
                이대로 등록
              </button>
            </div>
            
            <span v-if="msg.isStreaming" class="typing-indicator">
              <span></span><span></span><span></span>
            </span>
          </div>
        </div>
      </div>

      <!-- 입력 영역 -->
      <div class="chat-input-area">
        <div class="input-wrapper">
          <textarea
            v-model="inputText"
            placeholder="이벤트 상황을 설명해 주세요... (예: 수위가 3m 이상이면 알려줘)"
            :disabled="isProcessing"
            @keydown.enter.exact.prevent="sendMessage"
            @keydown.shift.enter="() => {}"
            rows="1"
          ></textarea>
          <button 
            class="send-btn" 
            @click="sendMessage"
            :disabled="!inputText.trim() || isProcessing"
          >
            <IconPlay v-if="!isProcessing" :size="18" />
            <IconRefresh v-else :size="18" class="spinning" />
          </button>
        </div>
        
        <!-- 빠른 예시 -->
        <div class="quick-examples">
          <span class="examples-label">예시:</span>
          <button @click="useExample('수위가 3m 이상이면 알려줘')">수위 감지</button>
          <button @click="useExample('유량이 급증하면 유량관리 프로세스 실행해줘')">유량 자동조치</button>
          <button @click="useExample('탁도가 30분간 상승하면 경고해줘')">탁도 상승</button>
        </div>
      </div>
    </main>

    <!-- 사이드바: 등록된 이벤트 목록 -->
    <aside class="event-sidebar" :class="{ visible: showEventList }">
      <div class="sidebar-header">
        <h3>등록된 이벤트</h3>
        <button class="close-sidebar" @click="showEventList = false">✕</button>
      </div>
      
      <div class="event-list">
        <div v-if="events.length === 0" class="no-events">
          <span class="empty-icon">📭</span>
          <p>등록된 이벤트가 없습니다.</p>
          <p class="hint">왼쪽에서 자연어로 이벤트를 설명해 보세요!</p>
        </div>
        
        <div 
          v-for="event in events" 
          :key="event.id" 
          class="event-item"
          :class="{ inactive: !event.is_active }"
        >
          <div class="event-header-row">
            <span class="event-status-dot" :class="{ active: event.is_active }"></span>
            <span class="event-name">{{ event.name }}</span>
          </div>
          
          <div class="event-condition">
            "{{ event.natural_language_condition }}"
          </div>
          
          <div class="event-meta">
            <span class="meta-badge">
              {{ event.action_type === 'alert' ? '🔔' : '⚡' }}
            </span>
            <span class="meta-text">{{ event.check_interval_minutes }}분</span>
            <span v-if="event.trigger_count > 0" class="trigger-badge">
              {{ event.trigger_count }}회 발생
            </span>
          </div>
          
          <div class="event-actions">
            <button @click="toggleEvent(event)" :title="event.is_active ? '비활성화' : '활성화'" class="action-btn">
              <IconBell :size="14" />
            </button>
            <button @click="deleteEvent(event.id)" class="action-btn danger" title="삭제">
              <IconTrash :size="14" />
            </button>
          </div>
        </div>
      </div>
      
      <div class="sidebar-footer">
        <div class="cep-status">
          <span class="cep-dot"></span>
          <span>Esper CEP 연결됨</span>
        </div>
      </div>
    </aside>
  </div>
</template>

<script lang="ts">
// 마크다운 형식 변환
function formatMessage(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>')
}

export { formatMessage }
</script>

<style lang="scss" scoped>
.event-chat-page {
  display: flex;
  height: 100%;
  background: var(--color-bg);
  overflow: hidden;
}

// 메인 채팅 영역
.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-md) var(--spacing-lg);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-secondary);

  .header-info {
    h1 {
      font-size: 18px;
      font-weight: 600;
      color: var(--color-text-bright);
      margin-bottom: 2px;
    }

    p {
      font-size: 13px;
      color: var(--color-text-light);
    }
  }

  .toggle-list-btn {
    padding: 8px 16px;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s ease;

    &:hover {
      border-color: var(--color-accent);
      color: var(--color-accent);
    }
  }
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-lg);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.message {
  display: flex;
  gap: var(--spacing-sm);
  max-width: 85%;
  animation: fadeIn 0.2s ease;

  &.user {
    align-self: flex-end;
    flex-direction: row-reverse;

    .message-bubble {
      background: var(--color-accent);
      color: white;
      border-radius: var(--radius-lg) var(--radius-lg) 4px var(--radius-lg);
    }
  }

  &.assistant {
    align-self: flex-start;

    .message-bubble {
      background: var(--color-bg-secondary);
      color: var(--color-text);
      border-radius: var(--radius-lg) var(--radius-lg) var(--radius-lg) 4px;
    }
  }

  &.system {
    align-self: center;
    max-width: 90%;

    .message-bubble {
      background: rgba(250, 176, 5, 0.15);
      color: var(--color-warning);
      border-radius: var(--radius-md);
    }
  }
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.message-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--color-bg-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
}

.message-bubble {
  padding: var(--spacing-md) var(--spacing-lg);
  max-width: 100%;
}

.message-text {
  font-size: 14px;
  line-height: 1.6;

  :deep(strong) {
    font-weight: 600;
  }
}

// 추출된 설정 카드
.config-card {
  margin-top: var(--spacing-md);
  padding: var(--spacing-md);
  background: rgba(0, 0, 0, 0.1);
  border-radius: var(--radius-md);
  border-left: 3px solid var(--color-accent);
}

.config-item {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 13px;

  &:last-child {
    margin-bottom: 0;
  }

  .config-icon {
    font-size: 14px;
  }

  .config-label {
    color: var(--color-text-muted);
  }

  .config-value {
    color: var(--color-text-bright);
    font-weight: 500;
  }
}

// 확정 버튼
.confirm-actions {
  display: flex;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-md);
  padding-top: var(--spacing-md);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.confirm-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: none;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;

  &.primary {
    background: var(--color-success);
    color: white;

    &:hover:not(:disabled) {
      background: #2fb344;
    }
  }

  &.secondary {
    background: rgba(255, 255, 255, 0.15);
    color: inherit;

    &:hover {
      background: rgba(255, 255, 255, 0.25);
    }
  }

  &.simulate {
    background: var(--color-warning, #f59e0b);
    color: #000;

    &:hover:not(:disabled) {
      background: #d97706;
    }
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.typing-indicator {
  display: inline-flex;
  gap: 4px;
  margin-left: var(--spacing-sm);

  span {
    width: 6px;
    height: 6px;
    background: currentColor;
    border-radius: 50%;
    animation: bounce 1.4s infinite ease-in-out both;

    &:nth-child(1) { animation-delay: -0.32s; }
    &:nth-child(2) { animation-delay: -0.16s; }
  }
}

@keyframes bounce {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
}

// 입력 영역
.chat-input-area {
  padding: var(--spacing-md) var(--spacing-lg);
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
}

.input-wrapper {
  display: flex;
  gap: var(--spacing-sm);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--spacing-sm);
  transition: border-color 0.15s ease;
  
  &:focus-within {
    border-color: var(--color-accent);
  }

  textarea {
    flex: 1;
    background: none;
    border: none;
    color: var(--color-text);
    font-size: 14px;
    resize: none;
    min-height: 24px;
    max-height: 120px;
    padding: var(--spacing-sm);

    &:focus {
      outline: none;
    }

    &::placeholder {
      color: var(--color-text-muted);
    }
  }

  .send-btn {
    width: 40px;
    height: 40px;
    background: var(--color-accent);
    border: none;
    border-radius: var(--radius-md);
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;

    &:hover:not(:disabled) {
      background: var(--color-accent-hover);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
}

.quick-examples {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-sm);

  .examples-label {
    font-size: 12px;
    color: var(--color-text-muted);
  }

  button {
    padding: 4px 12px;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    color: var(--color-text-light);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s ease;

    &:hover {
      border-color: var(--color-accent);
      color: var(--color-accent);
    }
  }
}

// 사이드바
.event-sidebar {
  width: 320px;
  background: var(--color-bg-secondary);
  border-left: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  transform: translateX(100%);
  transition: transform 0.3s ease;

  &.visible {
    transform: translateX(0);
  }

  @media (max-width: 768px) {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    z-index: 100;
  }
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-md) var(--spacing-lg);
  border-bottom: 1px solid var(--color-border);

  h3 {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text-bright);
  }

  .close-sidebar {
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    padding: 4px 8px;
    font-size: 16px;

    &:hover {
      color: var(--color-text);
    }
  }
}

.event-list {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-md);
}

.no-events {
  text-align: center;
  padding: var(--spacing-xl);
  color: var(--color-text-muted);

  .empty-icon {
    font-size: 48px;
    display: block;
    margin-bottom: var(--spacing-md);
    opacity: 0.5;
  }

  p {
    font-size: 14px;
    margin-bottom: var(--spacing-sm);
  }

  .hint {
    font-size: 12px;
    opacity: 0.7;
  }
}

.event-item {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
  margin-bottom: var(--spacing-sm);
  transition: all 0.15s ease;

  &:hover {
    border-color: var(--color-accent);
  }

  &.inactive {
    opacity: 0.5;
  }
}

.event-header-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.event-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-text-muted);

  &.active {
    background: var(--color-success);
  }
}

.event-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-bright);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.event-condition {
  font-size: 12px;
  color: var(--color-accent);
  font-style: italic;
  margin-bottom: 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.event-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 11px;

  .meta-badge {
    font-size: 12px;
  }

  .meta-text {
    color: var(--color-text-muted);
  }

  .trigger-badge {
    background: rgba(34, 139, 230, 0.15);
    color: var(--color-accent);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
  }
}

.event-actions {
  display: flex;
  gap: 4px;

  .action-btn {
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    padding: 4px 8px;
    border-radius: var(--radius-sm);

    &:hover {
      background: var(--color-bg-secondary);
      color: var(--color-text);
    }

    &.danger:hover {
      color: var(--color-error);
    }
  }
}

.sidebar-footer {
  padding: var(--spacing-md);
  border-top: 1px solid var(--color-border);
}

.cep-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--color-success);

  .cep-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-success);
    animation: pulse 2s infinite;
  }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
