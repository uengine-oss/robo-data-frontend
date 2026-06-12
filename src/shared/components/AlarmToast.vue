<script setup lang="ts">
/**
 * AlarmToast.vue
 * 실시간 알람 토스트/스낵바 컴포넌트
 * 
 * SSE를 통해 서버에서 알람을 수신하여 화면 우측 상단에 표시합니다.
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { IconCheck } from '@/shared/icons'
import { eventApi } from '@/features/observability/api'

// 알람 타입
interface Alarm {
  id: string
  rule_name: string
  message: string
  severity: 'info' | 'warning' | 'error' | 'success'
  triggered_at: string
  duration?: string
  matching_events?: number
  acknowledged: boolean
}

// 알람 목록
const alarms = ref<Alarm[]>([])
const isConnected = ref(false)
const eventSource = ref<EventSource | null>(null)

// SSE 연결
const connectSSE = () => {
  // 기존 연결 종료
  if (eventSource.value) {
    eventSource.value.close()
  }
  
  eventSource.value = eventApi.createAlarmStream()
  
  eventSource.value.addEventListener('connected', (event) => {
    console.log('알람 스트림 연결됨:', event.data)
    isConnected.value = true
  })
  
  eventSource.value.addEventListener('alarm', (event) => {
    const alarm = JSON.parse(event.data) as Alarm
    console.log('알람 수신:', alarm)
    addAlarm(alarm)
  })
  
  eventSource.value.addEventListener('heartbeat', () => {
    // 연결 유지 확인
  })
  
  eventSource.value.onerror = (error) => {
    console.error('SSE 오류:', error)
    isConnected.value = false
    // 5초 후 재연결
    setTimeout(connectSSE, 5000)
  }
}

// 알람 추가
const addAlarm = (alarm: Alarm) => {
  alarms.value.unshift(alarm)
  
  // 최대 5개까지만 표시
  if (alarms.value.length > 5) {
    alarms.value = alarms.value.slice(0, 5)
  }
  
  // 10초 후 자동 제거
  setTimeout(() => {
    removeAlarm(alarm.id)
  }, 10000)
}

// 알람 제거
const removeAlarm = (id: string) => {
  const index = alarms.value.findIndex(a => a.id === id)
  if (index !== -1) {
    alarms.value.splice(index, 1)
  }
}

// 알람 확인
const acknowledgeAlarm = (alarm: Alarm) => {
  alarm.acknowledged = true
  setTimeout(() => removeAlarm(alarm.id), 500)
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
  connectSSE()
})

onUnmounted(() => {
  if (eventSource.value) {
    eventSource.value.close()
  }
})

// 테스트용: 수동으로 알람 추가
const testAlarm = () => {
  addAlarm({
    id: `test-${Date.now()}`,
    rule_name: '수위 이상 감지',
    message: '수위가 3m 이상 10분 지속됨',
    severity: 'warning',
    triggered_at: new Date().toISOString(),
    duration: '0:10:00',
    matching_events: 11,
    acknowledged: false
  })
}

// 외부에서 접근 가능하도록 expose
defineExpose({
  addAlarm,
  testAlarm,
  isConnected
})
</script>

<template>
  <div class="alarm-toast-container">
    <!-- 연결 상태 표시 (디버그용) -->
    <div v-if="false" class="connection-status" :class="{ connected: isConnected }">
      {{ isConnected ? '🟢 연결됨' : '🔴 연결 중...' }}
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
            <button class="close-btn" @click="removeAlarm(alarm.id)">×</button>
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
          
          <button class="acknowledge-btn" @click="acknowledgeAlarm(alarm)">
            <IconCheck :size="14" />
            확인
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
  
  &.connected {
    color: #4ade80;
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
</style>
