<script setup lang="ts">
/**
 * AlarmToast.vue
 * 실시간 알람 토스트/스낵바 컴포넌트
 * 
 * SSE를 통해 서버에서 알람을 수신하여 화면 우측 상단에 표시합니다.
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { IconCheck } from '@/shared/icons'
import { useManagedTimeouts } from '@/shared/composables/useManagedTimeouts'
import { alarmGateway, type AlarmPayload } from './alarmGateway'

// 알람 목록
const alarms = ref<AlarmPayload[]>([])
const streamError = ref<string | null>(null)
const acknowledgementErrors = ref<Record<string, string>>({})
const acknowledgingIds = ref<Set<string>>(new Set())
const alarmStreamEnabled = import.meta.env.VITE_ENABLE_ALARM_STREAM === 'true'
const timers = useManagedTimeouts()
let streamController: AbortController | null = null
let stopped = false

// SSE 연결
const scheduleReconnect = () => {
  if (stopped) return
  timers.schedule('alarm-stream-reconnect', connectSSE, 5000)
}

const connectSSE = () => {
  if (!alarmStreamEnabled || stopped) return
  streamController?.abort()
  const controller = new AbortController()
  streamController = controller

  void alarmGateway.stream(event => {
    if (event.event === 'connected') {
      streamError.value = null
      return
    }
    if (event.event === 'alarm') addAlarm(event.data)
  }, controller.signal).then(() => {
    if (controller.signal.aborted || stopped) return
    streamError.value = '알람 연결이 종료되어 다시 연결하고 있습니다.'
    scheduleReconnect()
  }).catch(error => {
    if (controller.signal.aborted || stopped) return
    streamError.value = error instanceof Error
      ? `알람 연결 실패: ${error.message}`
      : '알람 연결에 실패해 다시 연결하고 있습니다.'
    scheduleReconnect()
  })
}

// 알람 추가
const addAlarm = (alarm: AlarmPayload) => {
  alarms.value.unshift(alarm)
  
  // 최대 5개까지만 표시
  if (alarms.value.length > 5) {
    alarms.value = alarms.value.slice(0, 5)
  }
  
  // 10초 후 자동 제거
  timers.schedule(`alarm-dismiss-${alarm.id}`, () => {
    removeAlarm(alarm.id)
  }, 10000)
}

// 알람 제거
const removeAlarm = (id: string) => {
  timers.cancel(`alarm-dismiss-${id}`)
  timers.cancel(`alarm-ack-dismiss-${id}`)
  const index = alarms.value.findIndex(a => a.id === id)
  if (index !== -1) {
    alarms.value.splice(index, 1)
  }
}

// 알람 확인
const acknowledgeAlarm = async (alarm: AlarmPayload) => {
  if (acknowledgingIds.value.has(alarm.id)) return
  delete acknowledgementErrors.value[alarm.id]
  acknowledgingIds.value.add(alarm.id)
  try {
    await alarmGateway.acknowledge(alarm.id)
    alarm.acknowledged = true
    timers.schedule(`alarm-ack-dismiss-${alarm.id}`, () => removeAlarm(alarm.id), 500)
  } catch (error) {
    acknowledgementErrors.value[alarm.id] = error instanceof Error ? error.message : '알람 확인 처리에 실패했습니다.'
  } finally {
    acknowledgingIds.value.delete(alarm.id)
  }
}

// severity에 따른 스타일 클래스
const getSeverityClass = (severity: string) => {
  switch (severity) {
    case 'error': return 'severity-error'
    case 'warning': return 'severity-warning'
    case 'success': return 'severity-success'
    default: return 'severity-info'
  }
}

// severity에 따른 아이콘
const getSeverityIcon = (severity: string) => {
  switch (severity) {
    case 'error': return '🚨'
    case 'warning': return '⚠️'
    case 'success': return '✅'
    default: return '🔔'
  }
}

onMounted(() => {
  stopped = false
  connectSSE()
})

onUnmounted(() => {
  stopped = true
  streamController?.abort()
  streamController = null
})
</script>

<template>
  <div class="alarm-toast-container">
    <div v-if="alarmStreamEnabled && streamError" class="connection-status error" role="status">
      {{ streamError }}
    </div>
    
    <!-- 알람 목록 -->
    <TransitionGroup name="alarm" tag="div" class="alarm-list">
      <div
        v-for="alarm in alarms"
        :key="alarm.id"
        class="alarm-item"
        :class="[getSeverityClass(alarm.severity), { acknowledged: alarm.acknowledged }]"
      >
        <div class="alarm-icon">
          {{ getSeverityIcon(alarm.severity) }}
        </div>
        
        <div class="alarm-content">
          <div class="alarm-header">
            <span class="alarm-title">{{ alarm.rule_name }}</span>
            <button class="close-btn" :aria-label="`${alarm.rule_name} 알람 닫기`" @click="removeAlarm(alarm.id)">×</button>
          </div>
          
          <div class="alarm-message">{{ alarm.message }}</div>
          
          <div class="alarm-meta">
            <span v-if="alarm.duration" class="meta-item">
              ⏱️ {{ alarm.duration }}
            </span>
            <span v-if="alarm.matching_events" class="meta-item">
              📊 {{ alarm.matching_events }}개 이벤트
            </span>
            <span class="meta-item time">
              {{ new Date(alarm.triggered_at).toLocaleTimeString() }}
            </span>
          </div>

          <div v-if="acknowledgementErrors[alarm.id]" class="alarm-error" role="alert">
            {{ acknowledgementErrors[alarm.id] }}
          </div>
          
          <button
            class="acknowledge-btn"
            :disabled="acknowledgingIds.has(alarm.id)"
            :aria-busy="acknowledgingIds.has(alarm.id)"
            @click="acknowledgeAlarm(alarm)"
          >
            <IconCheck :size="14" />
            {{ acknowledgingIds.has(alarm.id) ? '확인 중…' : acknowledgementErrors[alarm.id] ? '다시 시도' : '확인' }}
          </button>
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped lang="scss">
.alarm-toast-container {
  position: fixed;
  top: 80px;
  right: 20px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 380px;
  pointer-events: none;
}

.connection-status {
  padding: 4px 8px;
  font-size: 12px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  
  &.error {
    color: #fcd34d;
  }
}

.alarm-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.alarm-item {
  pointer-events: auto;
  display: flex;
  gap: 12px;
  padding: 16px;
  border-radius: 12px;
  background: rgba(30, 41, 59, 0.95);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  transition: all 0.3s ease;
  
  &:hover {
    transform: translateX(-4px);
  }
  
  &.acknowledged {
    opacity: 0.5;
    transform: scale(0.95);
  }
  
  // Severity colors
  &.severity-error {
    border-left: 4px solid #ef4444;
    
    .alarm-title {
      color: #fca5a5;
    }
  }
  
  &.severity-warning {
    border-left: 4px solid #f59e0b;
    
    .alarm-title {
      color: #fcd34d;
    }
  }
  
  &.severity-success {
    border-left: 4px solid #22c55e;
    
    .alarm-title {
      color: #86efac;
    }
  }
  
  &.severity-info {
    border-left: 4px solid #3b82f6;
    
    .alarm-title {
      color: #93c5fd;
    }
  }
}

.alarm-icon {
  font-size: 24px;
  flex-shrink: 0;
}

.alarm-content {
  flex: 1;
  min-width: 0;
}

.alarm-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 4px;
}

.alarm-title {
  font-weight: 600;
  font-size: 14px;
}

.close-btn {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  margin: -4px -4px 0 0;
  
  &:hover {
    color: #fff;
  }
}

.alarm-message {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: 8px;
}

.alarm-meta {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 8px;
}

.alarm-error {
  margin-bottom: 8px;
  color: #fca5a5;
  font-size: 11px;
  white-space: pre-line;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
  
  &.time {
    margin-left: auto;
  }
}

.acknowledge-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  font-size: 12px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  transition: all 0.2s;
  
  &:hover {
    background: rgba(255, 255, 255, 0.2);
    color: #fff;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
}

// Transition animations
.alarm-enter-active {
  animation: slideIn 0.3s ease-out;
}

.alarm-leave-active {
  animation: slideOut 0.3s ease-in;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(100px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes slideOut {
  from {
    opacity: 1;
    transform: translateX(0);
  }
  to {
    opacity: 0;
    transform: translateX(100px);
  }
}

@media (max-width: 480px) {
  .alarm-toast-container {
    top: 64px;
    right: 8px;
    left: 8px;
    max-width: none;
  }

  .alarm-item {
    padding: 12px;

    &:hover {
      transform: none;
    }
  }

  .alarm-meta {
    flex-wrap: wrap;
    gap: 6px 10px;
  }
}
</style>
