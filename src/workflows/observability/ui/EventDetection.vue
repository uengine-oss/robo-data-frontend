<script setup lang="ts">
/**
 * EventDetection.vue
 * 이벤트 감지 및 조치 - 대화형 인터페이스
 * 
 * 사용자가 자연어로 이벤트 상황을 설명하면
 * Text2SQL 이벤트 서비스가 감지 조건과 조치 설정 후보를 추출합니다.
 */
import { computed, ref, nextTick, onMounted } from 'vue'
import { 
  IconPlay, 
  IconRefresh,
  IconTrash,
  IconBell,
  IconCheck
} from '@/shared/icons'
import type {
  CepStatus,
  EventRule as ApiEventRule,
  ExtractedEventConfig,
  SimulationRequest,
  SimulationResult,
} from '@/domains/text2sql'
import ActionDialog from '@/shared/components/ActionDialog.vue'
import { commitMutationThenRefresh } from '../application/commitMutationThenRefresh'
import { eventDetectionGateway } from '../application/eventDetectionGateway'

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
  processName?: string
}

interface SimulationConfig {
  fieldName: string
  threshold: number | null
  requiredDurationMinutes: number
  simulatedValue: number | null
  simulatedDurationMinutes: number
  stationId: string
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
const eventsLoading = ref(false)
const eventsError = ref('')
const eventsRefreshWarning = ref('')
const ruleActionError = ref('')
const eventDeleteTarget = ref<ApiEventRule | null>(null)
const eventDeletePending = ref(false)
const eventDeleteError = ref<string | null>(null)
const cepStatus = ref<CepStatus | null>(null)
const cepStatusError = ref('')

// 시뮬레이션 상태
const isSimulating = ref(false)
const simulationResult = ref<SimulationResult | null>(null)
const showSimulationResult = ref(false)
const simulationConfig = ref<SimulationConfig>({
  fieldName: '',
  threshold: null,
  requiredDurationMinutes: 10,
  simulatedValue: null,
  simulatedDurationMinutes: 12,
  stationId: 'TEST-STATION',
})
const simulationReady = computed(() => (
  simulationConfig.value.fieldName.trim().length > 0
  && simulationConfig.value.threshold !== null
  && Number.isFinite(simulationConfig.value.threshold)
  && simulationConfig.value.requiredDurationMinutes > 0
  && simulationConfig.value.simulatedValue !== null
  && Number.isFinite(simulationConfig.value.simulatedValue)
  && simulationConfig.value.simulatedDurationMinutes > 0
  && simulationConfig.value.stationId.trim().length > 0
))

// 메시지 ID 생성
const generateId = () => `msg-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`

const toUiEventConfig = (config: ExtractedEventConfig): Partial<EventConfig> => ({
  name: config.name,
  description: config.description,
  condition: config.condition,
  interval: config.interval,
  threshold: config.threshold,
  actionType: config.action_type,
  processName: config.process_name,
})

const toApiCurrentConfig = (config: Partial<EventConfig>): Record<string, unknown> => {
  const result: Record<string, unknown> = {}
  if (config.name !== undefined) result.name = config.name
  if (config.description !== undefined) result.description = config.description
  if (config.condition !== undefined) result.condition = config.condition
  if (config.interval !== undefined) result.interval = config.interval
  if (config.threshold !== undefined) result.threshold = config.threshold
  if (config.actionType !== undefined) result.action_type = config.actionType
  if (config.processName !== undefined) result.process_name = config.processName
  return result
}

const cepRunning = computed(() => (
  cepStatus.value?.esper_cep_available === true
  && cepStatus.value.esper_cep_status?.status === 'running'
))

const cepStatusLabel = computed(() => {
  if (cepStatusError.value) return 'CEP 상태 확인 실패'
  if (!cepStatus.value) return 'CEP 상태 확인 중'
  if (!cepStatus.value.esper_cep_available) return 'Esper CEP 사용 불가'
  const status = cepStatus.value.esper_cep_status?.status
  return status ? `Esper CEP: ${String(status)}` : 'Esper CEP 상태 미확인'
})

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

// Text2SQL 이벤트 설정 대화 API 호출
const processEventDescription = async (userMessage: string) => {
  isProcessing.value = true
  
  // 스트리밍 메시지 추가
  const assistantMessage = addMessage('assistant', '')
  assistantMessage.isStreaming = true
  
  try {
    const data = await eventDetectionGateway.chat({
      message: userMessage,
      history: messages.value.slice(0, -2).map(m => ({
        role: m.role,
        content: m.content
      })),
      current_config: toApiCurrentConfig(currentEventConfig.value),
      step: configStep.value
    })

    // 응답 업데이트
    assistantMessage.content = data.response
    assistantMessage.isStreaming = false
    
    // 추출된 설정 업데이트
    if (data.extracted_config) {
      const extractedConfig = toUiEventConfig(data.extracted_config)
      currentEventConfig.value = { ...currentEventConfig.value, ...extractedConfig }
      assistantMessage.eventConfig = extractedConfig
    }
    
    // 확정 요청 시 버튼 표시
    if (data.ready_to_confirm) {
      assistantMessage.showConfirm = true
      configStep.value = 'confirm'
    } else if (data.next_step === 'initial' || data.next_step === 'analyzing' || data.next_step === 'confirm' || data.next_step === 'done') {
      configStep.value = data.next_step
    }
    
    // 이벤트 생성 완료
    if (data.event_created) {
      await refreshEvents()
      configStep.value = 'done'
    }
    
  } catch (error) {
    assistantMessage.content = `이벤트 설정 서비스 응답을 받지 못했습니다.\n\n${error instanceof Error ? error.message : '알 수 없는 오류'}`
    assistantMessage.isStreaming = false
    assistantMessage.showConfirm = false
  } finally {
    isProcessing.value = false
    scrollToBottom()
  }
}

// 이벤트 확정 등록
const confirmEvent = async () => {
  const sql = currentEventConfig.value.sql?.trim()
  if (!currentEventConfig.value.condition || !sql) {
    addMessage('system', '이벤트를 등록하려면 감지 조건과 실제 조회 SQL을 모두 입력해야 합니다.')
    return
  }
  isProcessing.value = true
  
  try {
    await eventDetectionGateway.createRule({
      name: currentEventConfig.value.name || '새 이벤트',
      description: currentEventConfig.value.description || '',
      natural_language_condition: currentEventConfig.value.condition,
      sql,
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
    
    addMessage('assistant', `✅ **이벤트 규칙이 등록되었습니다.**

규칙은 활성 상태로 저장되었습니다. ${currentEventConfig.value.interval || 10}분 간격 점검은 이벤트 스케줄러가 실행 중일 때 수행됩니다.
조건 충족 시 ${currentEventConfig.value.actionType === 'alert' ? '플랫폼 알림을 생성' : '설정된 프로세스 실행을 요청'}합니다.

다른 이벤트를 등록하시려면 새로운 상황을 설명해 주세요.`)
    
    await Promise.all([refreshEvents(), refreshCepStatus()])
    configStep.value = 'done'
    currentEventConfig.value = {}
    simulationConfig.value = {
      fieldName: '',
      threshold: null,
      requiredDurationMinutes: 10,
      simulatedValue: null,
      simulatedDurationMinutes: 12,
      stationId: 'TEST-STATION',
    }
    
  } catch (error) {
    addMessage('system', `이벤트 등록에 실패했습니다.\n\n${error instanceof Error ? error.message : '알 수 없는 오류'}`)
  } finally {
    isProcessing.value = false
  }
}

// 메시지 전송
const sendMessage = async () => {
  const text = inputText.value.trim()
  if (!text || isProcessing.value) return
  
  inputText.value = ''
  addMessage('user', text)
  
  await processEventDescription(text)
}

// 이벤트 목록 새로고침
const refreshEvents = async () => {
  eventsLoading.value = true
  eventsError.value = ''
  eventsRefreshWarning.value = ''
  try {
    events.value = await eventDetectionGateway.listRules()
  } catch (error) {
    eventsError.value = error instanceof Error ? error.message : '이벤트 목록을 불러오지 못했습니다.'
  } finally {
    eventsLoading.value = false
  }
}

const refreshCepStatus = async () => {
  cepStatusError.value = ''
  try {
    cepStatus.value = await eventDetectionGateway.getCepStatus()
  } catch (error) {
    cepStatus.value = null
    cepStatusError.value = error instanceof Error ? error.message : 'CEP 상태를 확인하지 못했습니다.'
  }
}

const requestEventDeletion = (event: ApiEventRule) => {
  eventDeleteTarget.value = event
  eventDeleteError.value = null
}

const cancelEventDeletion = () => {
  if (eventDeletePending.value) return
  eventDeleteTarget.value = null
  eventDeleteError.value = null
}

const confirmEventDeletion = async () => {
  const target = eventDeleteTarget.value
  if (!target || eventDeletePending.value) return
  eventDeletePending.value = true
  eventDeleteError.value = null
  try {
    const outcome = await commitMutationThenRefresh({
      currentItems: events.value,
      mutate: () => eventDetectionGateway.deleteRule(target.id),
      commit: items => items.filter(item => item.id !== target.id),
      refresh: () => eventDetectionGateway.listRules(),
      describeRefreshError: cause => cause instanceof Error
        ? `삭제는 완료됐지만 목록을 새로 고치지 못했습니다. ${cause.message}`
        : '삭제는 완료됐지만 목록을 새로 고치지 못했습니다.',
    })
    events.value = outcome.items
    eventsRefreshWarning.value = outcome.refreshError ?? ''
    eventDeleteTarget.value = null
  } catch (error) {
    eventDeleteError.value = error instanceof Error ? error.message : '이벤트 삭제에 실패했습니다.'
  } finally {
    eventDeletePending.value = false
  }
}

// 이벤트 토글
const toggleEvent = async (event: ApiEventRule) => {
  ruleActionError.value = ''
  try {
    const outcome = await commitMutationThenRefresh({
      currentItems: events.value,
      mutate: () => eventDetectionGateway.toggleRule(event.id),
      commit: (items, result) => items.map(item =>
        item.id === event.id ? { ...item, is_active: result.is_active } : item,
      ),
      refresh: () => eventDetectionGateway.listRules(),
      describeRefreshError: cause => cause instanceof Error
        ? `상태는 변경되었지만 목록을 새로 고치지 못했습니다. ${cause.message}`
        : '상태는 변경되었지만 목록을 새로 고치지 못했습니다.',
    })
    events.value = outcome.items
    eventsRefreshWarning.value = outcome.refreshError ?? ''
  } catch (error) {
    ruleActionError.value = error instanceof Error ? error.message : '이벤트 상태 변경에 실패했습니다.'
  }
}

// 빠른 예시 클릭
const useExample = (example: string) => {
  inputText.value = example
}

// 시뮬레이션 실행
const runSimulation = async () => {
  const threshold = simulationConfig.value.threshold
  const simulatedValue = simulationConfig.value.simulatedValue
  if (!currentEventConfig.value.condition || !simulationReady.value || threshold === null || simulatedValue === null) {
    addMessage('system', '시뮬레이션을 실행하려면 감지 조건과 격리 테스트 입력값을 모두 입력해야 합니다.')
    return
  }
  
  isSimulating.value = true
  
  try {
    const request: SimulationRequest = {
      rule_name: currentEventConfig.value.name || '시뮬레이션 테스트',
      natural_language_condition: currentEventConfig.value.condition,
      field_name: simulationConfig.value.fieldName.trim(),
      threshold,
      duration_minutes: simulationConfig.value.requiredDurationMinutes,
      simulated_value: simulatedValue,
      simulated_duration_minutes: simulationConfig.value.simulatedDurationMinutes,
      station_id: simulationConfig.value.stationId.trim(),
    }
    
    const result = await eventDetectionGateway.runSimulation(request)
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

✅ 격리된 SimpleCEP 시뮬레이션에서 이 입력 조건의 감지가 동작했습니다.`)
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
자연어로 설명하면 이벤트 서비스가 조건과 조치 설정 후보를 추출합니다. 등록 전 실제 조회 SQL을 함께 확인해 주세요.

**예시:**
• "수위가 3m 이상이면 알려줘"
• "유량이 급격히 증가하면 유량관리 프로세스를 자동 실행해줘"
• "탁도가 10분간 상승 추세면 경고해줘"
• "수위 3m 초과가 5분 이상 지속되면 배수 프로세스 실행"`)
  
  void Promise.all([refreshEvents(), refreshCepStatus()])
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
          <p>자연어 조건을 이벤트 서비스가 분석하며, 실제 조회 SQL을 확인한 뒤 등록합니다.</p>
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
              <label class="sql-config">
                <span>감지 SQL <strong>필수</strong></span>
                <textarea
                  v-model="currentEventConfig.sql"
                  rows="5"
                  placeholder="조건을 판정할 실제 SELECT SQL을 입력하세요. 조회 결과 행 수를 기준으로 임계 조건을 평가합니다."
                  spellcheck="false"
                ></textarea>
              </label>
              <details class="simulation-config">
                <summary>격리된 SimpleCEP 시뮬레이션 입력</summary>
                <p>운영 데이터를 읽지 않고, 아래 값으로 테스트 이벤트를 생성합니다.</p>
                <div class="simulation-fields">
                  <label>
                    <span>필드명</span>
                    <input v-model.trim="simulationConfig.fieldName" placeholder="예: water_level" />
                  </label>
                  <label>
                    <span>조건 임계값</span>
                    <input v-model.number="simulationConfig.threshold" type="number" step="any" placeholder="예: 3" />
                  </label>
                  <label>
                    <span>필요 지속 시간(분)</span>
                    <input v-model.number="simulationConfig.requiredDurationMinutes" type="number" min="1" />
                  </label>
                  <label>
                    <span>테스트 값</span>
                    <input v-model.number="simulationConfig.simulatedValue" type="number" step="any" placeholder="예: 3.5" />
                  </label>
                  <label>
                    <span>테스트 지속 시간(분)</span>
                    <input v-model.number="simulationConfig.simulatedDurationMinutes" type="number" min="1" />
                  </label>
                  <label>
                    <span>관측소 ID</span>
                    <input v-model.trim="simulationConfig.stationId" />
                  </label>
                </div>
              </details>
              <button class="confirm-btn secondary" @click="inputText = '수정할게요'">
                ✏️ 수정
              </button>
              <button class="confirm-btn simulate" @click="runSimulation" :disabled="isSimulating || !simulationReady">
                <IconPlay v-if="!isSimulating" :size="16" />
                <IconRefresh v-else :size="16" class="spinning" />
                {{ isSimulating ? '시뮬레이션 중...' : '🧪 시뮬레이션' }}
              </button>
              <button class="confirm-btn primary" @click="confirmEvent" :disabled="isProcessing || !currentEventConfig.sql?.trim()">
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
        <div v-if="eventsLoading" class="no-events" role="status">
          <IconRefresh :size="24" class="spinning" />
          <p>이벤트 목록을 불러오는 중입니다.</p>
        </div>

        <div v-else-if="eventsError" class="event-list-error" role="alert">
          <strong>이벤트 목록을 불러오지 못했습니다.</strong>
          <span>{{ eventsError }}</span>
          <button @click="refreshEvents">다시 시도</button>
        </div>

        <div v-else-if="events.length === 0" class="no-events">
          <span class="empty-icon">📭</span>
          <p>등록된 이벤트가 없습니다.</p>
          <p class="hint">왼쪽에서 자연어로 이벤트를 설명해 보세요!</p>
        </div>

        <div v-if="ruleActionError || eventsRefreshWarning" class="event-list-error compact" role="alert">
          <span>{{ ruleActionError || eventsRefreshWarning }}</span>
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
            <button
              class="action-btn"
              :title="event.is_active ? '비활성화' : '활성화'"
              :aria-label="`“${event.name}” 이벤트 ${event.is_active ? '비활성화' : '활성화'}`"
              @click="toggleEvent(event)"
            >
              <IconBell :size="14" />
            </button>
            <button
              class="action-btn danger"
              :title="`“${event.name}” 삭제`"
              :aria-label="`“${event.name}” 이벤트 삭제`"
              @click="requestEventDeletion(event)"
            >
              <IconTrash :size="14" />
            </button>
          </div>
        </div>
      </div>
      
      <div class="sidebar-footer">
        <div class="cep-status" :class="{ running: cepRunning, failed: Boolean(cepStatusError) }">
          <span class="cep-dot"></span>
          <span>{{ cepStatusLabel }}</span>
          <button type="button" title="CEP 상태 다시 확인" aria-label="CEP 상태 다시 확인" @click="refreshCepStatus">
            <IconRefresh :size="13" />
          </button>
        </div>
      </div>
    </aside>

    <ActionDialog
      :open="eventDeleteTarget !== null"
      dialog-id="event-rule-delete"
      title="이벤트 규칙 삭제"
      :message="eventDeleteTarget
        ? `“${eventDeleteTarget.name}” 이벤트 규칙을 삭제합니다. 이 작업은 되돌릴 수 없습니다.`
        : ''"
      confirm-label="삭제"
      pending-label="삭제 중…"
      :pending="eventDeletePending"
      :error="eventDeleteError"
      @cancel="cancelEventDeletion"
      @confirm="confirmEventDeletion"
    />
  </div>
</template>

<script lang="ts">
// 마크다운 형식 변환
function formatMessage(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
  return escaped
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
  flex-wrap: wrap;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-md);
  padding-top: var(--spacing-md);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.sql-config {
  display: grid;
  width: 100%;
  gap: 6px;
  color: var(--color-text-light);
  font-size: 12px;

  strong {
    color: var(--color-warning);
  }

  textarea {
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: 10px;
    background: var(--color-bg);
    color: var(--color-text);
    font-family: var(--font-mono, monospace);
    font-size: 12px;
    line-height: 1.5;

    &:focus {
      outline: 2px solid color-mix(in srgb, var(--color-accent) 35%, transparent);
      border-color: var(--color-accent);
    }
  }
}

.simulation-config {
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 10px;
  background: color-mix(in srgb, var(--color-bg) 80%, transparent);
  font-size: 12px;

  summary {
    cursor: pointer;
    color: var(--color-text-bright);
    font-weight: 600;
  }

  p {
    margin: 8px 0;
    color: var(--color-text-muted);
  }
}

.simulation-fields {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;

  label {
    display: grid;
    gap: 4px;
    color: var(--color-text-light);
  }

  input {
    min-width: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: 7px 8px;
    background: var(--color-bg);
    color: var(--color-text);

    &:focus {
      outline: 2px solid color-mix(in srgb, var(--color-accent) 35%, transparent);
      border-color: var(--color-accent);
    }
  }

  @media (max-width: 1100px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
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

.event-list-error {
  display: grid;
  gap: 8px;
  margin-bottom: var(--spacing-md);
  padding: var(--spacing-md);
  border: 1px solid color-mix(in srgb, var(--color-error) 45%, transparent);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-error) 10%, transparent);
  color: var(--color-error);
  font-size: 12px;
  white-space: pre-line;

  &.compact {
    padding: var(--spacing-sm);
  }

  button {
    justify-self: start;
    border: 1px solid currentColor;
    border-radius: var(--radius-sm);
    padding: 4px 8px;
    background: transparent;
    color: inherit;
    cursor: pointer;
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
  color: var(--color-text-muted);

  .cep-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: currentColor;
  }

  &.running {
    color: var(--color-success);

    .cep-dot {
      animation: pulse 2s infinite;
    }
  }

  &.failed {
    color: var(--color-error);
  }

  button {
    display: inline-flex;
    margin-left: auto;
    border: 0;
    padding: 3px;
    background: transparent;
    color: inherit;
    cursor: pointer;
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
