<script setup lang="ts">
import { ref, computed, watch, nextTick, onUnmounted } from 'vue'
import type { StreamMessage } from '@/types'
import { IconSettings, IconX, IconCheck, IconUpload, IconCode, IconBrain, IconLayers, IconBarChart, IconAlertTriangle, IconDatabase, IconLink } from '@/components/icons'

interface Props {
  visible: boolean
  messages: StreamMessage[]
  currentStep: string
  isProcessing: boolean
  totalPhases: number
  currentPhase: number
  currentPhaseProgress: number
  /** 그래프 이벤트 (노드/관계 생성 정보) */
  graphEvents?: GraphEvent[]
}

/** 그래프 이벤트 타입 */
export interface GraphEvent {
  id: string
  type: 'node' | 'relationship'
  action: 'created' | 'updated' | 'deleted'
  nodeType?: string
  nodeName?: string
  relType?: string
  source?: string
  target?: string
  timestamp: string
}

const props = withDefaults(defineProps<Props>(), {
  graphEvents: () => []
})

const emit = defineEmits<{
  close: []
}>()

// 자동 스크롤 관련
const logContainerRef = ref<HTMLElement>()
const graphContainerRef = ref<HTMLElement>()
const shouldAutoScroll = ref(true)
const shouldAutoScrollGraph = ref(true)

// 진행률 계산
const progress = computed(() => {
  return props.currentPhaseProgress
})

// 탭 상태
const activeTab = ref<'log' | 'graph'>('graph')

// 단계 정의
const stepIcons = {
  1: IconUpload,
  2: IconCode,
  3: IconBrain,
  4: IconLayers
}

// 단계 상태
const steps = computed(() => [
  { id: 1, name: '업로드', icon: stepIcons[1], status: getStepStatus(1) },
  { id: 2, name: '파싱', icon: stepIcons[2], status: getStepStatus(2) },
  { id: 3, name: 'AI 분석', icon: stepIcons[3], status: getStepStatus(3) },
  { id: 4, name: '인제스천', icon: stepIcons[4], status: getStepStatus(4) }
])

function getStepStatus(stepId: number): 'pending' | 'active' | 'completed' | 'error' {
  if (props.currentPhase >= stepId) return 'completed'
  if (props.currentPhase === stepId - 1 && props.isProcessing) return 'active'
  if (props.currentStep.includes('실패') || props.currentStep.includes('에러')) {
    if (props.currentPhase === stepId - 1) return 'error'
  }
  return 'pending'
}

// 완료 여부
const isCompleted = computed(() => 
  props.currentPhase >= props.totalPhases && !props.isProcessing
)

// 에러 여부
const hasError = computed(() => 
  props.currentStep.includes('실패') || props.currentStep.includes('에러')
)

// 닫기 가능 여부 (완료 또는 에러 시에만)
const canClose = computed(() => isCompleted.value || hasError.value)

// 그래프 통계
const graphStats = computed(() => {
  const nodes = props.graphEvents?.filter(e => e.type === 'node') || []
  const rels = props.graphEvents?.filter(e => e.type === 'relationship') || []
  
  // 노드 타입별 집계
  const nodeTypes: Record<string, number> = {}
  nodes.forEach(n => {
    const type = n.nodeType || 'Unknown'
    nodeTypes[type] = (nodeTypes[type] || 0) + 1
  })
  
  // 관계 타입별 집계
  const relTypes: Record<string, number> = {}
  rels.forEach(r => {
    const type = r.relType || 'Unknown'
    relTypes[type] = (relTypes[type] || 0) + 1
  })
  
  return {
    totalNodes: nodes.length,
    totalRels: rels.length,
    nodeTypes,
    relTypes
  }
})

// 최근 10개 이벤트만 표시 (애니메이션 효과)
const recentEvents = computed(() => {
  return [...(props.graphEvents || [])].slice(-50)
})

// 시간 포맷
function formatTime(timestamp: string): string {
  if (!timestamp) return ''
  return new Date(timestamp).toLocaleTimeString('ko-KR', { 
    hour: '2-digit', minute: '2-digit', second: '2-digit' 
  })
}

// 메시지가 추가될 때 자동 스크롤
watch(() => props.messages.length, async () => {
  if (shouldAutoScroll.value && activeTab.value === 'log') {
    await nextTick()
    scrollToBottom()
  }
})

// 그래프 이벤트가 추가될 때 자동 스크롤
watch(() => props.graphEvents?.length, async () => {
  if (shouldAutoScrollGraph.value && activeTab.value === 'graph') {
    await nextTick()
    scrollGraphToBottom()
  }
})

function scrollToBottom() {
  if (logContainerRef.value) {
    logContainerRef.value.scrollTop = logContainerRef.value.scrollHeight
  }
}

function scrollGraphToBottom() {
  if (graphContainerRef.value) {
    graphContainerRef.value.scrollTop = graphContainerRef.value.scrollHeight
  }
}

// 스크롤 이벤트로 자동 스크롤 활성화/비활성화
function handleScroll() {
  if (!logContainerRef.value) return
  const { scrollTop, scrollHeight, clientHeight } = logContainerRef.value
  shouldAutoScroll.value = scrollHeight - scrollTop - clientHeight < 50
}

function handleGraphScroll() {
  if (!graphContainerRef.value) return
  const { scrollTop, scrollHeight, clientHeight } = graphContainerRef.value
  shouldAutoScrollGraph.value = scrollHeight - scrollTop - clientHeight < 50
}

// 닫기 핸들러
function handleClose() {
  if (canClose.value) {
    emit('close')
  }
}

// ESC 키로 닫기
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && canClose.value) {
    emit('close')
  }
}

// 노드 타입별 색상
function getNodeColor(nodeType: string): string {
  const colors: Record<string, string> = {
    'CLASS': '#60a5fa',      // blue
    'METHOD': '#34d399',     // green
    'INTERFACE': '#a78bfa',  // purple
    'PROCEDURE': '#f472b6',  // pink
    'FUNCTION': '#fbbf24',   // yellow
    'Table': '#22d3ee',      // cyan
    'Column': '#94a3b8',     // gray
    'UserStory': '#fb923c',  // orange
    'TRIGGER': '#ef4444',    // red
  }
  return colors[nodeType] || '#6b7280'
}

// 관계 타입별 색상
function getRelColor(relType: string): string {
  const colors: Record<string, string> = {
    'CALLS': '#60a5fa',
    'EXTENDS': '#a78bfa',
    'IMPLEMENTS': '#f472b6',
    'HAS_COLUMN': '#22d3ee',
    'FK_TO': '#fbbf24',
    'READS': '#34d399',
    'WRITES': '#ef4444',
    'PARENT_OF': '#94a3b8',
  }
  return colors[relType] || '#6b7280'
}

// 키보드 이벤트 등록
watch(() => props.visible, (visible) => {
  if (visible) {
    window.addEventListener('keydown', handleKeydown)
  } else {
    window.removeEventListener('keydown', handleKeydown)
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="modal-overlay" @click.self="handleClose">
        <div class="modal">
          <!-- 헤더 -->
          <div class="modal-header">
            <div class="header-left">
              <span class="header-icon">
                <IconSettings :size="22" class="spin" />
              </span>
              <h2 class="modal-title">분석 진행 중</h2>
            </div>
            <button 
              v-if="canClose" 
              class="close-btn" 
              @click="handleClose"
              title="닫기 (ESC)"
            >
              <IconX :size="16" />
            </button>
          </div>
          
          <!-- 진행 단계 표시 -->
          <div class="steps-container">
            <div class="steps">
              <div 
                v-for="step in steps" 
                :key="step.id" 
                class="step"
                :class="step.status"
              >
                <div class="step-indicator">
                  <IconCheck v-if="step.status === 'completed'" :size="16" class="check" />
                  <span v-else-if="step.status === 'active'" class="spinner"></span>
                  <span v-else-if="step.status === 'error'" class="error-icon">!</span>
                  <span v-else class="step-number">{{ step.id }}</span>
                </div>
                <div class="step-info">
                  <component :is="step.icon" :size="14" class="step-icon" />
                  <span class="step-name">{{ step.name }}</span>
                </div>
              </div>
            </div>
          </div>
          
          <!-- 진행바 -->
          <div class="progress-section">
            <div class="progress-header">
              <span class="progress-label">진행률</span>
              <span class="progress-percent">{{ progress }}%</span>
            </div>
            <div class="progress-bar">
              <div 
                class="progress-fill" 
                :class="{ error: hasError, completed: isCompleted }"
                :style="{ width: `${progress}%` }"
              ></div>
            </div>
            <div class="current-step">{{ currentStep }}</div>
          </div>
          
          <!-- 그래프 통계 요약 -->
          <div v-if="graphStats.totalNodes > 0 || graphStats.totalRels > 0" class="stats-summary">
            <div class="stat-item nodes">
              <IconDatabase :size="16" />
              <span class="stat-value">{{ graphStats.totalNodes }}</span>
              <span class="stat-label">노드</span>
            </div>
            <div class="stat-item rels">
              <IconLink :size="16" />
              <span class="stat-value">{{ graphStats.totalRels }}</span>
              <span class="stat-label">관계</span>
            </div>
            <div class="stat-types">
              <span 
                v-for="(count, type) in graphStats.nodeTypes" 
                :key="type"
                class="type-badge"
                :style="{ backgroundColor: getNodeColor(String(type)) + '30', color: getNodeColor(String(type)) }"
              >
                {{ type }} {{ count }}
              </span>
            </div>
          </div>
          
          <!-- 탭 전환 -->
          <div class="tab-header">
            <button 
              class="tab-btn" 
              :class="{ active: activeTab === 'graph' }"
              @click="activeTab = 'graph'"
            >
              <IconDatabase :size="14" />
              그래프 객체
              <span v-if="graphEvents?.length" class="tab-count">{{ graphEvents.length }}</span>
            </button>
            <button 
              class="tab-btn" 
              :class="{ active: activeTab === 'log' }"
              @click="activeTab = 'log'"
            >
              <IconBarChart :size="14" />
              로그
              <span class="tab-count">{{ messages.length }}</span>
            </button>
          </div>
          
          <!-- 그래프 객체 영역 -->
          <div v-show="activeTab === 'graph'" class="graph-section">
            <div 
              ref="graphContainerRef" 
              class="graph-container"
              @scroll="handleGraphScroll"
            >
              <TransitionGroup name="graph-item" tag="div" class="graph-list">
                <div 
                  v-for="event in recentEvents" 
                  :key="event.id"
                  class="graph-event"
                  :class="event.type"
                >
                  <span class="event-time">{{ formatTime(event.timestamp) }}</span>
                  
                  <!-- 노드 이벤트 -->
                  <template v-if="event.type === 'node'">
                    <span 
                      class="node-badge"
                      :style="{ backgroundColor: getNodeColor(event.nodeType || '') + '20', color: getNodeColor(event.nodeType || ''), borderColor: getNodeColor(event.nodeType || '') }"
                    >
                      {{ event.nodeType }}
                    </span>
                    <span class="node-name">{{ event.nodeName }}</span>
                    <span class="action-badge" :class="event.action">
                      {{ event.action === 'created' ? '생성' : event.action === 'updated' ? '수정' : '삭제' }}
                    </span>
                  </template>
                  
                  <!-- 관계 이벤트 -->
                  <template v-else>
                    <span class="rel-source">{{ event.source }}</span>
                    <span 
                      class="rel-badge"
                      :style="{ backgroundColor: getRelColor(event.relType || '') + '20', color: getRelColor(event.relType || '') }"
                    >
                      {{ event.relType }}
                    </span>
                    <span class="rel-arrow">→</span>
                    <span class="rel-target">{{ event.target }}</span>
                  </template>
                </div>
              </TransitionGroup>
              
              <div v-if="!graphEvents?.length" class="graph-empty">
                <IconDatabase :size="32" class="empty-icon" />
                <span>그래프 객체 대기 중...</span>
              </div>
            </div>
          </div>
          
          <!-- 로그 영역 -->
          <div v-show="activeTab === 'log'" class="log-section">
            <div 
              ref="logContainerRef" 
              class="log-container"
              @scroll="handleScroll"
            >
              <div 
                v-for="(msg, idx) in messages" 
                :key="idx"
                class="log-item"
                :class="msg.type"
              >
                <span class="log-time">{{ formatTime(msg.timestamp) }}</span>
                <span class="log-type-badge">
                  <IconAlertTriangle v-if="msg.type === 'error'" :size="12" />
                  <IconBarChart v-else-if="msg.type === 'data'" :size="12" />
                  <span v-else class="arrow">→</span>
                </span>
                <span class="log-content">{{ msg.content }}</span>
              </div>
              <div v-if="messages.length === 0" class="log-empty">
                로그 대기 중...
              </div>
            </div>
          </div>
          
          <!-- 푸터 -->
          <div class="modal-footer">
            <div class="footer-status">
              <template v-if="isCompleted">
                <span class="status-icon success">
                  <IconCheck :size="14" />
                </span>
                <span class="status-text">분석이 완료되었습니다!</span>
              </template>
              <template v-else-if="hasError">
                <span class="status-icon error">
                  <IconAlertTriangle :size="14" />
                </span>
                <span class="status-text">오류가 발생했습니다</span>
              </template>
              <template v-else>
                <span class="status-icon processing"></span>
                <span class="status-text">분석을 진행하고 있습니다...</span>
              </template>
            </div>
            <button 
              v-if="canClose"
              class="btn btn--primary"
              @click="handleClose"
            >
              확인
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  z-index: 2000;
}

.modal {
  width: 90%;
  max-width: 780px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, var(--color-bg-secondary) 0%, var(--color-bg) 100%);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-icon {
  color: var(--color-accent);
  display: flex;
  align-items: center;
  
  .spin {
    animation: spin 2s linear infinite;
  }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.modal-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--color-text-bright);
  margin: 0;
}

.close-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-light);
  cursor: pointer;
  transition: all 0.2s;
  
  &:hover {
    background: rgba(250, 82, 82, 0.15);
    border-color: var(--color-error);
    color: var(--color-error);
  }
}

// 단계 표시
.steps-container {
  padding: 16px 20px;
  background: var(--color-bg-tertiary);
}

.steps {
  display: flex;
  justify-content: space-between;
  position: relative;
  
  &::before {
    content: '';
    position: absolute;
    top: 16px;
    left: 36px;
    right: 36px;
    height: 2px;
    background: var(--color-border);
  }
}

.step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  position: relative;
  z-index: 1;
}

.step-indicator {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-secondary);
  border: 2px solid var(--color-border);
  border-radius: 50%;
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text-muted);
  transition: all 0.3s;
  
  .step.completed & {
    background: var(--color-success);
    border-color: var(--color-success);
    color: white;
  }
  
  .step.active & {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: white;
  }
  
  .step.error & {
    background: var(--color-error);
    border-color: var(--color-error);
    color: white;
  }
}

.check {
  flex-shrink: 0;
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.error-icon {
  font-size: 16px;
  font-weight: 700;
}

.step-number {
  font-size: 13px;
}

.step-info {
  display: flex;
  align-items: center;
  gap: 5px;
  
  .step.pending & {
    opacity: 0.5;
  }
}

.step-icon {
  flex-shrink: 0;
}

.step-name {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-light);
  
  .step.completed &,
  .step.active & {
    color: var(--color-text);
  }
}

// 진행바
.progress-section {
  padding: 12px 20px 16px;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.progress-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-light);
}

.progress-percent {
  font-size: 13px;
  font-weight: 700;
  color: var(--color-accent);
}

.progress-bar {
  height: 6px;
  background: var(--color-bg-tertiary);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--color-accent) 0%, var(--color-accent-hover) 100%);
  border-radius: 3px;
  transition: width 0.3s ease;
  
  &.completed {
    background: linear-gradient(90deg, var(--color-success) 0%, #4ade80 100%);
  }
  
  &.error {
    background: linear-gradient(90deg, var(--color-error) 0%, #f87171 100%);
  }
}

.current-step {
  margin-top: 8px;
  font-size: 12px;
  color: var(--color-text);
  text-align: center;
}

// 통계 요약
.stats-summary {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 20px;
  background: var(--color-bg-tertiary);
  border-top: 1px solid var(--color-border);
  flex-wrap: wrap;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 6px;
  
  &.nodes {
    color: var(--color-accent);
  }
  
  &.rels {
    color: #22d3ee;
  }
}

.stat-value {
  font-size: 18px;
  font-weight: 700;
}

.stat-label {
  font-size: 11px;
  color: var(--color-text-muted);
}

.stat-types {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-left: auto;
}

.type-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
}

// 탭 헤더
.tab-header {
  display: flex;
  gap: 4px;
  padding: 0 20px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: -1px;
  
  &:hover {
    color: var(--color-text);
  }
  
  &.active {
    color: var(--color-accent);
    border-bottom-color: var(--color-accent);
  }
}

.tab-count {
  background: var(--color-bg-tertiary);
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 10px;
}

// 그래프 영역
.graph-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0 20px;
}

.graph-container {
  flex: 1;
  min-height: 200px;
  max-height: 260px;
  overflow-y: auto;
  padding: 12px 0;
  
  &::-webkit-scrollbar {
    width: 6px;
  }
  
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  
  &::-webkit-scrollbar-thumb {
    background: var(--color-border);
    border-radius: 3px;
    
    &:hover {
      background: var(--color-text-light);
    }
  }
}

.graph-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.graph-event {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  animation: slideIn 0.3s ease;
  background: var(--color-bg-tertiary);
  
  &:hover {
    background: var(--color-bg-secondary);
  }
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

// TransitionGroup 애니메이션
.graph-item-enter-active {
  animation: slideIn 0.3s ease;
}

.graph-item-leave-active {
  animation: slideIn 0.3s ease reverse;
}

.graph-item-move {
  transition: transform 0.3s ease;
}

.event-time {
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-text-muted);
  min-width: 60px;
}

.node-badge {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid;
  text-transform: uppercase;
}

.node-name {
  flex: 1;
  color: var(--color-text);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-badge {
  flex-shrink: 0;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  
  &.created {
    background: rgba(52, 211, 153, 0.2);
    color: #34d399;
  }
  
  &.updated {
    background: rgba(96, 165, 250, 0.2);
    color: #60a5fa;
  }
  
  &.deleted {
    background: rgba(239, 68, 68, 0.2);
    color: #ef4444;
  }
}

.rel-source,
.rel-target {
  font-weight: 500;
  color: var(--color-text);
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rel-badge {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
}

.rel-arrow {
  color: var(--color-text-muted);
  font-size: 14px;
}

.graph-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 150px;
  color: var(--color-text-muted);
  font-size: 13px;
  gap: 12px;
  
  .empty-icon {
    opacity: 0.3;
    animation: pulse 2s infinite;
  }
}

@keyframes pulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.5; }
}

// 로그 영역
.log-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0 20px;
}

.log-container {
  flex: 1;
  min-height: 200px;
  max-height: 260px;
  overflow-y: auto;
  padding: 12px 0;
  
  &::-webkit-scrollbar {
    width: 6px;
  }
  
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  
  &::-webkit-scrollbar-thumb {
    background: var(--color-border);
    border-radius: 3px;
    
    &:hover {
      background: var(--color-text-light);
    }
  }
}

.log-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  animation: fadeIn 0.2s ease;
  
  &:hover {
    background: var(--color-bg-tertiary);
  }
  
  &.error {
    background: rgba(250, 82, 82, 0.1);
    
    .log-content {
      color: var(--color-error);
    }
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-2px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.log-time {
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-text-muted);
}

.log-type-badge {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  color: var(--color-text-muted);
  
  .arrow {
    font-size: 11px;
  }
}

.log-content {
  flex: 1;
  color: var(--color-text);
  line-height: 1.4;
  word-break: break-word;
}

.log-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-muted);
  font-size: 12px;
}

// 푸터
.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  background: var(--color-bg-tertiary);
  border-top: 1px solid var(--color-border);
}

.footer-status {
  display: flex;
  align-items: center;
  gap: 10px;
}

.status-icon {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  
  &.success {
    background: var(--color-success);
    color: white;
  }
  
  &.error {
    background: var(--color-error);
    color: white;
  }
  
  &.processing {
    background: var(--color-accent);
    animation: pulse 1.5s infinite;
    
    &::before {
      content: '';
      width: 7px;
      height: 7px;
      background: white;
      border-radius: 50%;
    }
  }
}

.status-text {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-light);
}

// 트랜지션
.modal-enter-active,
.modal-leave-active {
  transition: all 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
  
  .modal {
    transform: scale(0.95) translateY(20px);
  }
}

.modal-enter-to,
.modal-leave-from {
  opacity: 1;
  
  .modal {
    transform: scale(1) translateY(0);
  }
}
</style>
