<script setup lang="ts">
/**
 * FloatingProgressPanel.vue
 * 인제스천 진행 상태를 플로팅 팝업으로 표시
 * 메타데이터 관련 탭 전체에서 보임
 */
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useProjectStore } from '@/stores/project'
import { useDrag } from '@/composables/useDrag'
import { IconX, IconChevronDown } from '@/components/icons'
import type { PipelinePhaseInfo } from '@/services/api'

const projectStore = useProjectStore()
const {
  isProcessing,
  currentStep,
  totalPhases,
  currentPhase,
  currentPhaseProgress,
  isPipelinePaused,
  graphEvents,
  consoleMessages,
  pipelinePhases,
  pipelineStatus,
} = storeToRefs(projectStore)

const { pausePipeline, resumePipeline, clearMessages } = projectStore

// phases 메타 로드 + 진행 중 500ms 폴링
onMounted(async () => {
  if (pipelinePhases.value.length === 0) {
    await projectStore.fetchPipelinePhases()
  }
})
let statusPollingId: ReturnType<typeof setInterval> | null = null
watch(isProcessing, (processing) => {
  if (processing) {
    statusPollingId = setInterval(() => projectStore.fetchPipelineStatus(), 500)
  } else if (statusPollingId) {
    clearInterval(statusPollingId)
    statusPollingId = null
  }
}, { immediate: true })
onUnmounted(() => {
  if (statusPollingId) clearInterval(statusPollingId)
})

const currentPhaseOrder = computed(() => pipelineStatus.value?.phaseOrder ?? -1)

function phaseStatusClass(phase: PipelinePhaseInfo): string {
  if (phase.order < currentPhaseOrder.value) return 'done'
  if (phase.order === currentPhaseOrder.value) {
    return isPipelinePaused.value ? 'paused' : 'active'
  }
  return 'pending'
}

function phaseStatusIcon(phase: PipelinePhaseInfo): string {
  if (phase.order < currentPhaseOrder.value) return '✓'
  if (phase.order === currentPhaseOrder.value) {
    return isPipelinePaused.value ? '⏸' : '▶'
  }
  return '○'
}

// 드래그 기능
const { x, y, isDragging, startDrag } = useDrag({
  initialX: window.innerWidth - 420,
  initialY: 80,
  boundToWindow: true
})

// 패널 상태
const isCollapsed = ref(false)
const isMinimized = ref(false)
const activeTab = ref<'phases' | 'progress' | 'console'>('phases')

// 진행률 계산 — Phase별 독립 0-100%
const progress = computed(() => currentPhaseProgress.value)

const isCompleted = computed(() =>
  currentPhase.value >= totalPhases.value - 1 && currentPhaseProgress.value >= 100
)

// 최근 오류 메시지 확인 (오류가 있으면 패널 유지)
const hasRecentError = computed(() => {
  if (!consoleMessages.value.length) return false
  // 최근 10개 메시지 중 오류가 있는지 확인
  const recentMessages = consoleMessages.value.slice(-10)
  return recentMessages.some(msg => msg.type === 'error')
})

// 패널 표시 여부: 처리 중이거나 최근 오류가 있으면 표시
const shouldShowPanel = computed(() => {
  return isProcessing.value || hasRecentError.value
})

// 그래프 통계
const graphStats = computed(() => {
  const nodes = projectStore.graphData?.nodes || []
  const rels = projectStore.graphData?.links || []
  return {
    totalNodes: nodes.length,
    totalRels: rels.length
  }
})

// 일시정지/재개 토글
const togglePause = async () => {
  if (isPipelinePaused.value) {
    await resumePipeline()
  } else {
    await pausePipeline()
  }
}

// 패널 닫기 (처리 중이 아닐 때, 또는 오류 상태에서도 닫기 가능)
const closePanel = () => {
  if (!isProcessing.value || isCompleted.value || hasRecentError.value) {
    isMinimized.value = true
    // 오류 상태에서 닫을 때 콘솔 메시지 초기화하여 패널이 다시 뜨지 않도록
    if (hasRecentError.value && !isProcessing.value) {
      clearMessages()
    }
  }
}

// 패널 다시 열기
const openPanel = () => {
  isMinimized.value = false
}

// 처리 시작 시 자동으로 패널 열기
watch(isProcessing, (processing) => {
  if (processing) {
    isMinimized.value = false
    isCollapsed.value = false
  }
})

// 오류 발생 시 자동으로 패널 열기 및 콘솔 탭으로 전환
watch(hasRecentError, (hasError) => {
  if (hasError) {
    isMinimized.value = false
    isCollapsed.value = false
    activeTab.value = 'console' // 오류가 있으면 콘솔 탭으로 자동 전환
  }
})
</script>

<template>
  <!-- 최소화된 상태: 작은 배지만 표시 -->
  <Transition name="fade">
    <button 
      v-if="isMinimized && shouldShowPanel"
      class="minimized-badge"
      :class="{ 'has-error': hasRecentError }"
      @click="openPanel"
    >
      <span v-if="isProcessing" class="pulse-dot"></span>
      <span v-else-if="hasRecentError" class="error-dot">⚠️</span>
      <span class="badge-icon">📊</span>
      <span class="badge-text">{{ isProcessing ? '인제스천 중...' : '오류 발생' }}</span>
    </button>
  </Transition>

  <!-- 플로팅 패널 -->
  <Transition name="slide-fade">
    <div 
      v-if="!isMinimized && shouldShowPanel"
      class="floating-progress-panel"
      :class="{ 
        'is-collapsed': isCollapsed, 
        'is-dragging': isDragging,
        'is-completed': isCompleted && !isProcessing,
        'is-paused': isPipelinePaused
      }"
      :style="{ left: `${x}px`, top: `${y}px` }"
    >
      <!-- 헤더 (드래그 영역) -->
      <div 
        class="panel-header"
        @mousedown="startDrag"
      >
        <div class="header-left">
          <span v-if="isProcessing" class="status-indicator pulse"></span>
          <span v-else-if="hasRecentError" class="status-indicator error">⚠</span>
          <span v-else-if="isCompleted" class="status-indicator completed">✓</span>
          <span class="header-title">
            {{ isProcessing ? '📦 인제스천 진행 중' : hasRecentError ? '⚠️ 오류 발생' : '📊 분석 완료' }}
          </span>
        </div>
        <div class="header-actions">
          <button 
            class="action-btn"
            @click.stop="isCollapsed = !isCollapsed"
            :title="isCollapsed ? '펼치기' : '접기'"
          >
            <IconChevronDown 
              :size="14" 
              :style="{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }"
            />
          </button>
          <button 
            class="action-btn close-btn"
            @click.stop="closePanel"
            title="닫기"
          >
            <IconX :size="14" />
          </button>
        </div>
      </div>

      <!-- 컨텐츠 (접힌 상태가 아닐 때) -->
      <div v-show="!isCollapsed" class="panel-content">
        <!-- 진행 바 -->
        <div class="progress-section">
          <div class="progress-info">
            <span class="step-label">
              {{ isPipelinePaused ? '⏸ 일시정지됨' : currentStep || '대기 중' }}
            </span>
            <span class="progress-percent">{{ progress }}%</span>
          </div>
          <div class="progress-track">
            <div 
              class="progress-fill"
              :class="{ completed: isCompleted, paused: isPipelinePaused }"
              :style="{ width: `${progress}%` }"
            ></div>
          </div>
          
          <!-- 일시정지/재개 버튼 -->
          <button 
            v-if="isProcessing"
            class="pause-btn"
            @click="togglePause"
          >
            {{ isPipelinePaused ? '▶ 재개' : '⏸ 일시정지' }}
          </button>
        </div>

        <!-- 통계 -->
        <div class="stats-section">
          <div class="stat-item">
            <span class="stat-icon">📦</span>
            <span class="stat-value">{{ graphStats.totalNodes }}</span>
            <span class="stat-label">노드</span>
          </div>
          <div class="stat-item">
            <span class="stat-icon">🔗</span>
            <span class="stat-value">{{ graphStats.totalRels }}</span>
            <span class="stat-label">관계</span>
          </div>
        </div>

        <!-- 탭 -->
        <div class="tabs">
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'phases' }"
            @click="activeTab = 'phases'"
          >
            단계
            <span class="tab-count">{{ pipelinePhases.length }}</span>
          </button>
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'progress' }"
            @click="activeTab = 'progress'"
          >
            그래프 객체
            <span class="tab-count">{{ graphEvents?.length || 0 }}</span>
          </button>
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'console' }"
            @click="activeTab = 'console'"
          >
            콘솔
            <span class="tab-count">{{ consoleMessages.length }}</span>
          </button>
        </div>

        <!-- 단계 타임라인 -->
        <div v-show="activeTab === 'phases'" class="phase-timeline">
          <div
            v-for="phase in pipelinePhases"
            :key="phase.phase"
            class="phase-row"
            :class="phaseStatusClass(phase)"
          >
            <span class="phase-icon">{{ phaseStatusIcon(phase) }}</span>
            <div class="phase-info">
              <span class="phase-name">{{ phase.name }}</span>
              <span class="phase-desc">{{ phase.description }}</span>
            </div>
          </div>
          <div v-if="pipelinePhases.length === 0" class="empty-hint">
            대기 중
          </div>
        </div>

        <!-- 이벤트 스트림 -->
        <div v-show="activeTab === 'progress'" class="event-stream">
          <div 
            v-for="event in (graphEvents || []).slice(-30).reverse()" 
            :key="event.id"
            class="event-item"
            :class="event.type"
          >
            <span class="event-icon">
              {{ event.type === 'node' ? '🔹' : '🔗' }}
            </span>
            <span class="event-source">{{ event.source || event.nodeName }}</span>
            <span v-if="event.target" class="event-arrow">→</span>
            <span v-if="event.target" class="event-target">{{ event.target }}</span>
          </div>
          <div v-if="!graphEvents?.length" class="empty-state">
            이벤트 대기 중...
          </div>
        </div>

        <!-- 콘솔 로그 -->
        <div v-show="activeTab === 'console'" class="console-stream">
          <div 
            v-for="(msg, idx) in consoleMessages.slice(-50).reverse()" 
            :key="idx"
            class="console-item"
            :class="msg.type"
          >
            {{ msg.content }}
          </div>
          <div v-if="!consoleMessages.length" class="empty-state">
            로그가 없습니다
          </div>
          <!-- 오류가 있을 때 자동으로 콘솔 탭으로 전환 -->
          <div v-if="hasRecentError && activeTab !== 'console'" class="error-notice">
            ⚠️ 오류 메시지를 확인하려면 콘솔 탭을 클릭하세요
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped lang="scss">
.floating-progress-panel {
  position: fixed;
  z-index: 1000;
  width: 380px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05);
  overflow: hidden;
  transition: box-shadow 0.2s ease;

  &.is-dragging {
    cursor: grabbing;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
  }

  &.is-completed {
    border-color: var(--color-success);
    box-shadow: 0 0 0 2px rgba(64, 192, 87, 0.2), 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  &.is-paused {
    border-color: var(--color-warning);
  }

  &:has(.status-indicator.error) {
    border-color: var(--color-error);
    box-shadow: 0 0 0 2px rgba(255, 59, 48, 0.2), 0 8px 32px rgba(0, 0, 0, 0.4);
  }
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border);
  cursor: grab;
  user-select: none;

  &:active {
    cursor: grabbing;
  }
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-accent);

  &.pulse {
    animation: pulse 1.5s ease-in-out infinite;
  }

  &.completed {
    background: var(--color-success);
    color: white;
    width: auto;
    height: auto;
    padding: 2px;
    font-size: 0.6rem;
  }

  &.error {
    background: var(--color-error);
    color: white;
    width: auto;
    height: auto;
    padding: 2px 4px;
    font-size: 0.7rem;
    border-radius: 4px;
  }
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(0.9); }
}

.header-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-text-bright);
}

.header-actions {
  display: flex;
  gap: 4px;
}

.action-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-text-light);
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: var(--color-bg);
    color: var(--color-text-bright);
  }

  &.close-btn:hover {
    background: var(--color-error);
    color: white;
  }

  svg {
    transition: transform 0.2s;
  }
}

.panel-content {
  max-height: 400px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.progress-section {
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
}

.progress-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.step-label {
  font-size: 0.75rem;
  color: var(--color-text-light);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 250px;
}

.progress-percent {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-accent);
}

.progress-track {
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #4dabf7, #228be6);
  border-radius: 4px;
  transition: width 0.3s ease;
  box-shadow: 0 0 8px rgba(77, 171, 247, 0.5);

  &.completed {
    background: linear-gradient(90deg, #40c057, #51cf66);
    box-shadow: 0 0 8px rgba(64, 192, 87, 0.5);
  }

  &.paused {
    background: linear-gradient(90deg, #fab005, #fcc419);
    box-shadow: 0 0 8px rgba(250, 176, 5, 0.5);
  }
}

.pause-btn {
  margin-top: 10px;
  width: 100%;
  padding: 6px 12px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: var(--color-bg-tertiary);
    border-color: var(--color-accent);
  }
}

.stats-section {
  display: flex;
  gap: 16px;
  padding: 12px 16px;
  background: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border);
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.stat-icon {
  font-size: 0.9rem;
}

.stat-value {
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-text-bright);
}

.stat-label {
  font-size: 0.7rem;
  color: var(--color-text-muted);
}

.tabs {
  display: flex;
  border-bottom: 1px solid var(--color-border);
}

.tab-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px;
  background: none;
  border: none;
  font-size: 0.75rem;
  color: var(--color-text-light);
  cursor: pointer;
  transition: all 0.15s;
  border-bottom: 2px solid transparent;

  &:hover {
    background: var(--color-bg-tertiary);
  }

  &.active {
    color: var(--color-accent);
    border-bottom-color: var(--color-accent);
  }
}

.tab-count {
  font-size: 0.65rem;
  background: var(--color-bg);
  padding: 1px 5px;
  border-radius: 8px;
}

.event-stream,
.console-stream {
  flex: 1;
  max-height: 200px;
  overflow-y: auto;
  padding: 8px;
}

.event-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  font-size: 0.7rem;
  color: var(--color-text-light);
  border-radius: var(--radius-sm);

  &:hover {
    background: var(--color-bg-tertiary);
  }
}

.event-icon {
  font-size: 0.65rem;
}

.event-source,
.event-target {
  color: var(--color-accent-light);
}

.event-arrow {
  color: var(--color-text-muted);
}

.console-item {
  padding: 3px 8px;
  font-size: 0.7rem;
  font-family: var(--font-mono);
  color: var(--color-text-light);
  border-radius: var(--radius-sm);
  margin-bottom: 2px;

  &.error {
    color: var(--color-error);
    background: rgba(255, 59, 48, 0.15);
    border-left: 2px solid var(--color-error);
    padding-left: 10px;
    font-weight: 500;
  }
}

.error-notice {
  padding: 8px 12px;
  margin: 8px;
  background: rgba(255, 59, 48, 0.1);
  border: 1px solid rgba(255, 59, 48, 0.3);
  border-radius: var(--radius-sm);
  color: var(--color-error);
  font-size: 0.7rem;
  text-align: center;
}

.empty-state {
  text-align: center;
  padding: 20px;
  color: var(--color-text-muted);
  font-size: 0.75rem;
  font-style: italic;
}

/* 최소화된 배지 */
.minimized-badge {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 30px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4);
    border-color: var(--color-accent);
  }

  &.has-error {
    border-color: var(--color-error);
    background: rgba(255, 59, 48, 0.1);

    &:hover {
      border-color: var(--color-error);
      box-shadow: 0 6px 24px rgba(255, 59, 48, 0.3);
    }
  }
}

.error-dot {
  font-size: 0.7rem;
}

.pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-accent);
  animation: pulse 1.5s ease-in-out infinite;
}

.badge-icon {
  font-size: 1rem;
}

.badge-text {
  font-size: 0.8rem;
  color: var(--color-text-bright);
  font-weight: 500;
}

/* 애니메이션 */
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.3s ease;
}

.slide-fade-enter-from {
  opacity: 0;
  transform: translateY(-20px) scale(0.95);
}

.slide-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.98);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* ─────────── 단계 타임라인 ─────────── */
.phase-timeline {
  max-height: 260px;
  overflow-y: auto;
  padding: 6px 4px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.phase-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 6px;
  transition: background 0.15s;
}
.phase-row .phase-icon {
  width: 18px;
  flex-shrink: 0;
  font-weight: 700;
  text-align: center;
  font-family: 'JetBrains Mono', monospace;
}
.phase-row .phase-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.phase-row .phase-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text, #c1c2c5);
}
.phase-row .phase-desc {
  font-size: 10px;
  color: var(--color-text-muted, #868e96);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.phase-row.done {
  opacity: 0.65;
  .phase-icon { color: #40c057; }
}
.phase-row.active {
  background: rgba(34, 139, 230, 0.12);
  .phase-icon { color: #74c0fc; }
  .phase-name { color: #74c0fc; }
}
.phase-row.paused {
  background: rgba(250, 176, 5, 0.1);
  .phase-icon { color: #ffd43b; }
}
.phase-row.pending {
  opacity: 0.45;
  .phase-icon { color: #868e96; }
}
.empty-hint {
  padding: 20px;
  text-align: center;
  color: var(--color-text-muted, #868e96);
  font-size: 11px;
}
</style>

