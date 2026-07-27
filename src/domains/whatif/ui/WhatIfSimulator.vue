<template>
  <div class="whatif-simulator-layout" @keydown.esc="closeMobileSidebar()">
    <!-- 왼쪽 세션 사이드바 -->
    <aside
      id="whatif-session-sidebar"
      class="session-sidebar"
      :class="{ collapsed: sidebarCollapsed, 'mobile-open': mobileSidebarOpen }"
      :aria-hidden="isMobileViewport && !mobileSidebarOpen ? 'true' : undefined"
    >
      <div class="sidebar-header">
        <h3 v-if="!sidebarCollapsed || isMobileViewport">🔬 What-If 시뮬레이터</h3>
        <button
          class="collapse-btn desktop-collapse-btn"
          :aria-expanded="!sidebarCollapsed"
          :aria-label="sidebarCollapsed ? '세션 사이드바 펼치기' : '세션 사이드바 접기'"
          @click="sidebarCollapsed = !sidebarCollapsed"
        >
          {{ sidebarCollapsed ? '▶' : '◀' }}
        </button>
        <button
          ref="sidebarCloseRef"
          type="button"
          class="collapse-btn mobile-sidebar-close"
          aria-label="세션 목록 닫기"
          @click="closeMobileSidebar()"
        >
          ✕
        </button>
      </div>
      
      <button
        v-if="!sidebarCollapsed || isMobileViewport"
        class="new-session-sidebar-btn"
        @click="startNewSession"
      >
        ➕ 새 분석 시작
      </button>
      
      <div v-if="!sidebarCollapsed || isMobileViewport" class="session-cards">
        <div v-if="savedSessions.length === 0" class="no-sessions-msg">
          <p>저장된 세션이 없습니다.</p>
          <p class="hint">분석을 시작하면 자동으로 저장됩니다.</p>
        </div>
        <div 
          v-for="session in savedSessions" 
          :key="session.id"
          class="session-card"
          :class="{ active: session.id === sessionId }"
        >
          <button
            type="button"
            class="session-card-select"
            :aria-pressed="session.id === sessionId"
            @click="restoreSession(session)"
          >
          <div class="card-header">
            <span class="card-icon">📋</span>
            <span class="card-step">{{ session.currentStep + 1 }}/{{ steps.length }}</span>
          </div>
          <div class="card-title">
            {{ session.scenario?.substring(0, 25) || '새 분석' }}{{ session.scenario?.length > 25 ? '...' : '' }}
          </div>
          <div class="card-meta">
            <span class="meta-date">{{ formatDate(session.updatedAt) }}</span>
          </div>
          
          <!-- 미리보기: 차트 또는 진행 상태 칩 -->
          <div class="card-preview">
            <!-- 차트 데이터가 있으면 스파크라인 표시 -->
            <div v-if="session.data?.comparisonResult?.prediction_charts?.length" class="sparkline-preview">
              <svg viewBox="0 0 100 30" class="sparkline-svg">
                <polyline 
                  :points="getSparklinePoints(session.data.comparisonResult.prediction_charts[0])"
                  fill="none"
                  stroke="#00d9ff"
                  stroke-width="2"
                />
              </svg>
              <span class="preview-label">예측 결과</span>
            </div>
            <!-- 차트가 없으면 진행 단계 칩 -->
            <div v-else class="status-chips">
              <span class="status-chip" :class="{ done: session.currentStep >= 0 }">시나리오</span>
              <span class="status-chip" :class="{ done: session.currentStep >= 1 }">데이터</span>
              <span class="status-chip" :class="{ done: session.currentStep >= 2 }">온톨로지</span>
              <span class="status-chip" :class="{ done: session.currentStep >= 3, current: session.currentStep === 3 }">검증</span>
              <span class="status-chip" :class="{ done: session.currentStep >= 4 }">완료</span>
            </div>
          </div>
          
          <!-- 요약 태그 -->
          <div v-if="session.data.discoveryResult?.tables.length || session.data.causalResult?.edges.length" class="card-summary">
            <span v-if="session.data.discoveryResult?.tables.length" class="summary-tag">
              📊 {{ session.data.discoveryResult.tables.length }}
            </span>
            <span v-if="session.data.causalResult?.edges.length" class="summary-tag">
              🔗 {{ session.data.causalResult.edges.length }}
            </span>
          </div>
          </button>

          <button
            type="button"
            class="card-delete-btn"
            :aria-label="`${session.scenario || '새 분석'} 세션 삭제`"
            @click="deleteSession(session.id)"
          >
            🗑️
          </button>
        </div>
      </div>
    </aside>

    <button
      v-if="isMobileViewport && mobileSidebarOpen"
      type="button"
      class="mobile-session-backdrop"
      aria-label="세션 목록 닫기"
      @click="closeMobileSidebar()"
    ></button>
    
    <!-- 메인 콘텐츠 영역 -->
    <div ref="mainContentRef" class="workflow-scroll" @scroll="handleScroll">
    <button
      ref="mobileSidebarTriggerRef"
      type="button"
      class="mobile-session-trigger"
      aria-controls="whatif-session-sidebar"
      :aria-expanded="mobileSidebarOpen"
      @click="openMobileSidebar"
    >
      📋 세션 목록
    </button>
    <!-- 워크플로우 스텝 (스크롤 시 상단 고정) -->
    <div class="workflow-steps" :class="{ 'sticky-active': isSticky }">
      <button
        v-for="(step, index) in steps" 
        :key="step.id"
        type="button"
        class="step"
        :class="{ 
          active: currentStep === index, 
          completed: index < currentStep,
          disabled: index > currentStep && !canProceed(index)
        }"
        :disabled="index > currentStep && !canProceed(index)"
        :aria-current="currentStep === index ? 'step' : undefined"
        @click="goToStep(index)"
      >
        <div class="step-number">{{ index + 1 }}</div>
        <div class="step-info">
          <span class="step-title">{{ step.title }}</span>
          <span class="step-desc">{{ step.description }}</span>
        </div>
        <div v-if="index < steps.length - 1" class="step-connector"></div>
      </button>
    </div>

    <!-- 메인 컨텐츠 -->
    <div class="workflow-content">
      <!-- Step 1: 시나리오 입력 -->
      <div v-if="currentStep === 0" class="step-content">
        <ScenarioInput 
          v-model="scenario"
          @discover="handleDiscovery"
          :loading="loading"
        />
      </div>

      <!-- Step 2: 데이터 선택 -->
      <div v-if="currentStep === 1" class="step-content">
        <!-- 에이전트 진행 상황 패널 -->
        <div v-if="progressLogs.length > 0" class="progress-panel">
          <div class="progress-header">
            <span class="progress-title">🔍 에이전트 진행 상황</span>
            <button
              class="toggle-btn"
              :aria-expanded="showLogs"
              @click="showLogs = !showLogs"
            >
              {{ showLogs ? '접기' : '펼치기' }}
            </button>
          </div>
          <div v-if="showLogs" class="progress-logs" ref="logsContainer">
            <div 
              v-for="(log, idx) in progressLogs" 
              :key="idx"
              class="log-entry"
              :class="log.type"
            >
              <span class="log-icon">{{ log.icon }}</span>
              <span class="log-time">{{ log.time }}</span>
              <span class="log-message">{{ log.message }}</span>
            </div>
          </div>
        </div>
        
        <DataSelector
          :discovery-result="discoveryResult"
          :session-id="sessionId"
          v-model:selectedTables="selectedTables"
          v-model:customSql="customSql"
          @collect="handleDataCollection"
          @upload="handleFileUpload"
          :loading="loading"
        />
      </div>

      <!-- Step 3: Causal Discovery -->
      <div v-if="currentStep === 2" class="step-content">
        <CausalDiscovery
          :session-id="sessionId"
          :causal-result="causalResult"
          @run-discovery="runCausalDiscovery"
          :loading="loading"
        />
      </div>

      <!-- Step 4: 검증 및 비교 -->
      <div v-if="currentStep === 3" class="step-content">
        <ValidationCompare
          :session-id="sessionId"
          :validation-result="validationResult"
          :comparison-result="comparisonResult"
          @run-comparison="runModelComparison"
          @next-step="goToLiteracyStep"
          @clear-comparison="clearComparisonResult"
          :loading="loading"
        />
      </div>

      <!-- Step 5: 데이터 리터러시 -->
      <div v-if="currentStep === 4" class="step-content">
        <DataLiteracy
          :session-id="sessionId"
          :explanation="literacyExplanation"
          :causal-result="causalResult"
          :comparison-result="comparisonResult"
          @generate="generateExplanation"
          :loading="loading"
        />
      </div>
    </div>

    <!-- 네비게이션 -->
    <div class="navigation">
      <button 
        class="nav-btn prev"
        :disabled="currentStep === 0"
        @click="prevStep"
      >
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
        </svg>
        이전
      </button>
      
      <div class="step-indicator">
        {{ currentStep + 1 }} / {{ steps.length }}
      </div>
      
      <button 
        class="nav-btn next"
        :disabled="!canProceed(currentStep + 1)"
        @click="nextStep"
      >
        다음
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"/>
        </svg>
      </button>
    </div>

    <div class="message-stack" aria-live="polite">
      <div v-if="error" class="error-message" role="alert">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
        </svg>
        <span>{{ error }}</span>
        <button aria-label="오류 메시지 닫기" @click="error = null">✕</button>
      </div>
      <div v-if="persistenceWarning" class="error-message warning" role="status">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M1 21h22L12 2 1 21zm12-3h-2v2h2v-2zm0-2h-2v-4h2v4z"/>
        </svg>
        <span>{{ persistenceWarning }}</span>
        <button aria-label="세션 경고 닫기" @click="persistenceWarning = null">✕</button>
      </div>
    </div>
    </div><!-- workflow-scroll 닫기 -->
  </div><!-- whatif-simulator-layout 닫기 -->
</template>

<script setup lang="ts">
import { ref, nextTick, onBeforeUnmount, onMounted, watch } from 'vue'
import {
  clearCurrentWhatIfSession,
  createSavedWhatIfSession,
  loadSavedWhatIfSessions,
  persistSavedWhatIfSessionList,
  persistWhatIfSessions,
  readCurrentWhatIfSessionId,
  upsertSavedWhatIfSession,
} from '../application/sessionRepository'
import type {
  PredictionChartData,
} from '../model/contracts'
import type { SavedWhatIfSession } from '../model/session'
import ScenarioInput from './ScenarioInput.vue'
import DataSelector from './DataSelector.vue'
import CausalDiscovery from './CausalDiscovery.vue'
import ValidationCompare from './ValidationCompare.vue'
import DataLiteracy from './DataLiteracy.vue'
import { useWhatIfWorkflowExecution } from '../composables/useWhatIfWorkflowExecution'

// 워크플로우 스텝 정의
const steps = [
  { id: 'scenario', title: '시나리오 정의', description: '예측하고자 하는 내용 서술' },
  { id: 'data', title: '데이터 선택', description: '관련 데이터 발견 및 수집' },
  { id: 'discovery', title: '온톨로지 발견', description: 'Ontology Discovery 실행' },
  { id: 'validation', title: '검증 및 비교', description: '모델 검증 및 MindsDB 비교' },
  { id: 'interpretation', title: '결과 해석', description: '인과관계 확인 및 설명 보고서 생성' }
]

// 상태
const currentStep = ref(0)
const persistenceWarning = ref<string | null>(null)

// 저장된 세션 관리
const savedSessions = ref<SavedWhatIfSession[]>([])
const sidebarCollapsed = ref(false)
const isMobileViewport = ref(false)
const mobileSidebarOpen = ref(false)
const isSticky = ref(false)
const mainContentRef = ref<HTMLElement | null>(null)
const mobileSidebarTriggerRef = ref<HTMLButtonElement | null>(null)
const sidebarCloseRef = ref<HTMLButtonElement | null>(null)
let mobileViewportQuery: MediaQueryList | null = null

// 진행 로그
interface ProgressLog {
  icon: string
  type: 'info' | 'success' | 'warning' | 'error' | 'search'
  time: string
  message: string
}
const progressLogs = ref<ProgressLog[]>([])
const showLogs = ref(true)
const logsContainer = ref<HTMLElement | null>(null)

function addLog(icon: string, type: ProgressLog['type'], message: string) {
  const now = new Date()
  const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`
  progressLogs.value.push({ icon, type, time, message })
  // 자동 스크롤
  nextTick(() => {
    if (logsContainer.value) {
      logsContainer.value.scrollTop = logsContainer.value.scrollHeight
    }
  })
}

function clearLogs() {
  progressLogs.value = []
}

const {
  loading,
  error,
  sessionId,
  scenario,
  agentResult,
  discoveryResult,
  selectedTables,
  customSql,
  causalResult,
  validationResult,
  comparisonResult,
  literacyExplanation,
  runScenarioDiscovery: handleDiscovery,
  collectData: handleDataCollection,
  uploadFile: handleFileUpload,
  discoverCausality: runCausalDiscovery,
  compareModels: runModelComparison,
  generateExplanation,
  clearComparison: clearComparisonResult,
} = useWhatIfWorkflowExecution({
  currentStep,
  addLog,
  clearLogs,
})

// ==================== 세션 저장/복원 ====================

function reportPersistenceWarning(warning: string | undefined) {
  if (warning) persistenceWarning.value = warning
}

function loadSavedSessions() {
  const result = loadSavedWhatIfSessions(localStorage)
  savedSessions.value = result.value
  reportPersistenceWarning(result.warning)
}

function saveCurrentSession() {
  if (!sessionId.value) return

  const previous = savedSessions.value.find(session => session.id === sessionId.value)
  const now = new Date().toISOString()
  const session = createSavedWhatIfSession({
    id: sessionId.value,
    scenario: scenario.value,
    currentStep: currentStep.value,
    data: {
      agentResult: agentResult.value || undefined,
      discoveryResult: discoveryResult.value || undefined,
      selectedTables: selectedTables.value,
      customSql: customSql.value,
      causalResult: causalResult.value || undefined,
      validationResult: validationResult.value || undefined,
      comparisonResult: comparisonResult.value || undefined,
      literacyExplanation: literacyExplanation.value || undefined
    }
  }, previous, now)

  savedSessions.value = upsertSavedWhatIfSession(savedSessions.value, session)
  reportPersistenceWarning(
    persistWhatIfSessions(localStorage, savedSessions.value, sessionId.value),
  )
}

function restoreSession(session: SavedWhatIfSession) {
  sessionId.value = session.id
  scenario.value = session.scenario
  currentStep.value = session.currentStep
  agentResult.value = session.data.agentResult ?? null
  discoveryResult.value = session.data.discoveryResult ?? null
  selectedTables.value = session.data.selectedTables ?? []
  customSql.value = session.data.customSql ?? ''
  causalResult.value = session.data.causalResult ?? null
  validationResult.value = session.data.validationResult ?? null
  comparisonResult.value = session.data.comparisonResult ?? null
  literacyExplanation.value = session.data.literacyExplanation ?? null
  
  addLog('📂', 'success', `세션 "${session.scenario.substring(0, 30)}..." 복원됨`)
  resetWorkflowScroll()
  void closeMobileSidebar()
}

function deleteSession(sessionIdToDelete: string) {
  savedSessions.value = savedSessions.value.filter(s => s.id !== sessionIdToDelete)
  reportPersistenceWarning(
    persistSavedWhatIfSessionList(localStorage, savedSessions.value),
  )
  if (sessionId.value === sessionIdToDelete) {
    startNewSession()
  }
}

function startNewSession() {
  sessionId.value = null
  scenario.value = ''
  currentStep.value = 0
  agentResult.value = null
  discoveryResult.value = null
  selectedTables.value = []
  customSql.value = ''
  causalResult.value = null
  validationResult.value = null
  comparisonResult.value = null
  literacyExplanation.value = null
  progressLogs.value = []
  reportPersistenceWarning(clearCurrentWhatIfSession(localStorage))
  resetWorkflowScroll()
  void closeMobileSidebar()
}

function restoreLastSession() {
  const result = readCurrentWhatIfSessionId(localStorage)
  reportPersistenceWarning(result.warning)
  const lastSessionId = result.value
  if (lastSessionId) {
    const session = savedSessions.value.find(s => s.id === lastSessionId)
    if (session) {
      restoreSession(session)
      addLog('🔄', 'info', '이전 작업 상태가 복원되었습니다.')
    }
  }
}

watch([
  currentStep,
  scenario,
  agentResult,
  discoveryResult,
  selectedTables,
  customSql,
  causalResult,
  validationResult,
  comparisonResult,
  literacyExplanation,
], () => {
  if (sessionId.value) {
    saveCurrentSession()
  }
}, { deep: true })

// 날짜 포맷
function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    if (Number.isNaN(date.getTime())) return ''
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    
    if (diffMins < 1) return '방금 전'
    if (diffMins < 60) return `${diffMins}분 전`
    if (diffHours < 24) return `${diffHours}시간 전`
    if (diffDays < 7) return `${diffDays}일 전`
    
    return `${date.getMonth() + 1}/${date.getDate()}`
  } catch {
    return ''
  }
}

// 컴포넌트 마운트 시 세션 로드
onMounted(() => {
  mobileViewportQuery = window.matchMedia('(max-width: 768px)')
  syncMobileViewport(mobileViewportQuery)
  mobileViewportQuery.addEventListener('change', syncMobileViewport)
  loadSavedSessions()
  restoreLastSession()
})

onBeforeUnmount(() => {
  mobileViewportQuery?.removeEventListener('change', syncMobileViewport)
})

function syncMobileViewport(viewport: MediaQueryList | MediaQueryListEvent) {
  isMobileViewport.value = viewport.matches
  if (!viewport.matches) mobileSidebarOpen.value = false
}

async function openMobileSidebar() {
  mobileSidebarOpen.value = true
  await nextTick()
  sidebarCloseRef.value?.focus()
}

async function closeMobileSidebar(restoreFocus = true) {
  if (!mobileSidebarOpen.value) return
  mobileSidebarOpen.value = false
  await nextTick()
  if (restoreFocus) mobileSidebarTriggerRef.value?.focus()
}

// 다음 스텝 진행 가능 여부
function canProceed(stepIndex: number): boolean {
  if (stepIndex <= 0) return true
  if (stepIndex === 1) return !!discoveryResult.value || !!sessionId.value
  if (stepIndex === 2) return !!sessionId.value
  if (stepIndex === 3) return !!causalResult.value
  if (stepIndex === 4) return !!validationResult.value
  return false
}

// 스텝 이동
function goToStep(index: number) {
  if (canProceed(index) || index < currentStep.value) {
    currentStep.value = index
  }
}

function nextStep() {
  if (currentStep.value < steps.length - 1 && canProceed(currentStep.value + 1)) {
    currentStep.value++
  }
}

function prevStep() {
  if (currentStep.value > 0) {
    currentStep.value--
  }
}

function goToLiteracyStep() {
  currentStep.value = 4
}

// 스크롤 이벤트 핸들러 - 탭 sticky 효과
function handleScroll(event: Event) {
  const target = event.target as HTMLElement
  isSticky.value = target.scrollTop > 150
}

function resetWorkflowScroll() {
  isSticky.value = false
  void nextTick(() => {
    mainContentRef.value?.scrollTo({ top: 0, left: 0 })
  })
}

watch(currentStep, (step, previousStep) => {
  if (step !== previousStep) resetWorkflowScroll()
})

// 세션 카드 스파크라인 생성
function getSparklinePoints(chartData: PredictionChartData): string {
  if (!chartData?.actual?.length) return '0,15 100,15'
  
  const data = chartData.actual
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  
  return data.map((val: number, i: number) => {
    const x = (i / (data.length - 1)) * 100
    const y = 28 - ((val - min) / range) * 26 // 2~28 범위
    return `${x},${y}`
  }).join(' ')
}

</script>

<style scoped>
/* 전체 레이아웃 */
.whatif-simulator-layout {
  display: flex;
  position: relative;
  height: 100vh;
  max-height: 100vh;
  background: var(--color-bg);
  overflow: hidden;
}

/* 왼쪽 세션 사이드바 */
.session-sidebar {
  width: 280px;
  min-width: 280px;
  height: 100%;
  background: var(--color-bg-secondary);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  transition: all 0.3s ease;
  overflow: hidden;
}

.session-sidebar.collapsed {
  width: 50px;
  min-width: 50px;
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid var(--color-border);
}

.sidebar-header h3 {
  margin: 0;
  font-size: 0.95rem;
  color: var(--color-text-primary);
}

.collapse-btn {
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  width: 28px;
  height: 28px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.collapse-btn:hover {
  background: var(--color-bg-tertiary);
}

.mobile-sidebar-close,
.mobile-session-trigger,
.mobile-session-backdrop {
  display: none;
}

.new-session-sidebar-btn {
  margin: 0.75rem;
  padding: 0.75rem;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.3s ease;
}

.new-session-sidebar-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
}

.session-cards {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.session-cards::-webkit-scrollbar {
  display: none;
}

.no-sessions-msg {
  text-align: center;
  padding: 2rem 1rem;
  color: var(--color-text-muted);
}

.no-sessions-msg .hint {
  font-size: 0.8rem;
  margin-top: 0.5rem;
}

.session-card {
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 0.75rem;
  margin-bottom: 0.5rem;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}

.session-card:hover {
  border-color: var(--color-primary);
  transform: translateX(2px);
}

.session-card.active {
  border-color: #00d9ff;
  background: linear-gradient(135deg, rgba(0, 217, 255, 0.1) 0%, transparent 100%);
  box-shadow: 0 0 15px rgba(0, 217, 255, 0.2);
}

.session-card-select {
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.session-card:focus-within {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.session-card-select:focus-visible {
  outline: none;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.card-icon {
  font-size: 1rem;
}

.card-step {
  font-size: 0.7rem;
  padding: 0.2rem 0.5rem;
  background: rgba(99, 102, 241, 0.2);
  color: #a5b4fc;
  border-radius: 10px;
}

.card-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 0.4rem;
  line-height: 1.3;
}

.card-meta {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  margin-bottom: 0.5rem;
}

/* 카드 미리보기 */
.card-preview {
  margin: 0.5rem 0;
  min-height: 36px;
}

/* 스파크라인 미리보기 */
.sparkline-preview {
  background: rgba(0, 217, 255, 0.1);
  border-radius: 6px;
  padding: 0.4rem;
  position: relative;
}

.sparkline-svg {
  width: 100%;
  height: 30px;
}

.preview-label {
  position: absolute;
  bottom: 2px;
  right: 4px;
  font-size: 0.6rem;
  color: #00d9ff;
  opacity: 0.7;
}

/* 상태 칩 */
.status-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.status-chip {
  font-size: 0.6rem;
  padding: 0.15rem 0.35rem;
  border-radius: 4px;
  background: var(--color-bg-secondary);
  color: var(--color-text-muted);
  border: 1px solid var(--color-border);
}

.status-chip.done {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
  border-color: rgba(16, 185, 129, 0.3);
}

.status-chip.current {
  background: rgba(0, 217, 255, 0.15);
  color: #00d9ff;
  border-color: rgba(0, 217, 255, 0.4);
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.card-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.summary-tag {
  font-size: 0.65rem;
  padding: 0.15rem 0.4rem;
  background: var(--color-bg-secondary);
  border-radius: 4px;
  color: var(--color-text-secondary);
}

.card-delete-btn {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  background: transparent;
  border: none;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s ease;
  font-size: 0.8rem;
}

.session-card:hover .card-delete-btn {
  opacity: 1;
}

.card-delete-btn:hover {
  transform: scale(1.1);
}

/* 워크플로우의 유일한 세로 스크롤 owner */
.workflow-scroll {
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 1.5rem 2rem 3rem;
  scroll-behavior: smooth;
  /* 스크롤바 숨기기 */
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE/Edge */
}

.workflow-scroll::-webkit-scrollbar {
  display: none; /* Chrome, Safari */
}

.whatif-simulator {
  height: auto;
  overflow: visible;
  background: var(--color-bg);
  color: var(--color-text);
  padding: 0;
  font-family: var(--font-main);
}

.simulator-header {
  margin-bottom: 1.25rem;
}

.header-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
}

.title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-accent);
  margin: 0;
}

.title-icon {
  width: 1.5rem;
  height: 1.5rem;
}

.header-actions {
  display: flex;
  gap: 0.5rem;
}

.session-btn, .new-session-btn {
  padding: 0.4rem 0.75rem;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.session-btn {
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  color: var(--color-text-light);
}

.session-btn:hover {
  background: var(--color-bg-elevated);
  border-color: var(--color-accent);
  color: var(--color-accent);
}

.new-session-btn {
  background: var(--color-accent);
  border: none;
  color: white;
}

.new-session-btn:hover {
  opacity: 0.9;
}

.subtitle {
  margin-top: 0.4rem;
  color: var(--color-text-light);
  font-size: 0.85rem;
  text-align: center;
}

.current-session-info {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  margin-top: 0.6rem;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.session-id {
  font-family: var(--font-mono);
}

.auto-save-badge {
  color: #10b981;
}

/* 세션 패널 */
.session-panel {
  max-width: 1200px;
  margin: 0 auto 1.25rem;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
}

.session-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  background: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border);
}

.session-panel-header h3 {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-text-bright);
}

.close-panel-btn {
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-size: 1rem;
  cursor: pointer;
}

.close-panel-btn:hover {
  color: var(--color-text-bright);
}

.no-sessions {
  padding: 2rem;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 0.85rem;
}

.session-list {
  max-height: 300px;
  overflow-y: auto;
}

.session-item {
  display: flex;
  align-items: center;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--color-border);
  transition: background 0.2s;
}

.session-item:last-child {
  border-bottom: none;
}

.session-item:hover {
  background: var(--color-bg-tertiary);
}

.session-item.active {
  background: var(--color-bg-elevated);
  border-left: 3px solid var(--color-accent);
}

.session-info {
  flex: 1;
  cursor: pointer;
}

.session-scenario {
  font-size: 0.85rem;
  color: var(--color-text-bright);
  margin-bottom: 0.25rem;
}

.session-meta {
  display: flex;
  gap: 0.75rem;
  font-size: 0.7rem;
  color: var(--color-text-muted);
}

.session-step-badge {
  padding: 0.1rem 0.4rem;
  background: var(--color-accent);
  border-radius: 4px;
  color: white;
  font-weight: 600;
}

.delete-session-btn {
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-size: 0.9rem;
  cursor: pointer;
  padding: 0.3rem;
  opacity: 0.6;
  transition: opacity 0.2s;
}

.delete-session-btn:hover {
  opacity: 1;
  color: #ef4444;
}

/* 진행 로그 패널 */
.progress-panel {
  max-width: 1200px;
  margin: 0 auto 1.5rem;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  background: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border);
}

.progress-title {
  font-weight: 600;
  color: var(--color-text-bright);
  font-size: 0.9rem;
}

.toggle-btn {
  padding: 0.3rem 0.75rem;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text-light);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;
}

.toggle-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-bright);
}

.progress-logs {
  max-height: 200px;
  overflow-y: auto;
  padding: 0.75rem;
  font-family: var(--font-mono);
  font-size: 0.8rem;
}

.log-entry {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.4rem 0.5rem;
  border-radius: 6px;
  margin-bottom: 0.25rem;
  transition: background 0.2s;
}

.log-entry:hover {
  background: var(--color-bg-tertiary);
}

.log-icon {
  flex-shrink: 0;
  width: 1.25rem;
  text-align: center;
}

.log-time {
  flex-shrink: 0;
  color: var(--color-text-muted);
  font-size: 0.7rem;
  min-width: 60px;
}

.log-message {
  flex: 1;
  color: var(--color-text);
  word-break: break-word;
}

.log-entry.info .log-message { color: var(--color-text); }
.log-entry.success .log-message { color: #10b981; }
.log-entry.warning .log-message { color: #f59e0b; }
.log-entry.error .log-message { color: #ef4444; }
.log-entry.search .log-message { color: #3b82f6; }

/* 워크플로우 스텝 - 스크롤 시 상단 고정 */
.workflow-steps {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0.3rem;
  margin-bottom: 1.5rem;
  flex-wrap: nowrap;
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--color-bg);
  padding: 0.75rem 1rem;
  margin-left: -2rem;
  margin-right: -2rem;
  border-bottom: 1px solid transparent;
  transition: all 0.2s ease;
}

.workflow-steps.sticky-active {
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-border);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.step {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.6rem;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  flex-shrink: 0;
  font-family: inherit;
  text-align: left;
}

.step:hover:not(.disabled) {
  background: var(--color-bg-tertiary);
  border-color: var(--color-accent);
}

.step.active {
  background: var(--color-bg-elevated);
  border-color: var(--color-accent);
  box-shadow: 0 0 12px rgba(var(--color-accent-rgb, 59, 130, 246), 0.3);
}

.step.completed {
  background: var(--color-bg-secondary);
  border-color: #10b981;
}

.step.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.step:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.step-number {
  width: 22px;
  height: 22px;
  min-width: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-accent);
  border-radius: 50%;
  font-weight: 600;
  font-size: 0.75rem;
  font-size: 0.8rem;
  color: white;
}

.step.completed .step-number {
  background: #10b981;
}

.step-info {
  display: flex;
  flex-direction: column;
}

.step-title {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-bright);
  line-height: 1.2;
}

.step-desc {
  font-size: 0.6rem;
  color: var(--color-text-muted);
  line-height: 1.2;
}

.step-connector {
  width: 16px;
  height: 2px;
  background: var(--color-border);
  flex-shrink: 0;
}

/* scroll을 만들지 않는 가운데 폭 제약 */
.workflow-content {
  max-width: 1200px;
  margin: 0 auto;
}

.step-content {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 1.5rem;
}

/* 네비게이션 */
.navigation {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1.5rem;
  margin-top: 1.5rem;
  padding-bottom: 1rem;
}

.nav-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1.25rem;
  background: var(--color-accent);
  border: none;
  border-radius: 8px;
  color: white;
  font-family: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.nav-btn:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
}

.nav-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.nav-btn.prev {
  background: var(--color-bg-tertiary);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}

.nav-btn svg {
  width: 18px;
  height: 18px;
}

.step-indicator {
  font-size: 0.85rem;
  color: var(--color-text-muted);
  font-weight: 500;
}

/* 오류 및 세션 영속화 메시지 */
.message-stack {
  position: fixed;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  display: flex;
  width: min(720px, calc(100vw - 2rem));
  flex-direction: column;
  gap: 0.5rem;
}

.error-message {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.875rem 1.25rem;
  background: #ef4444;
  border-radius: 10px;
  color: white;
  font-size: 0.85rem;
  box-shadow: 0 4px 16px rgba(239, 68, 68, 0.4);
}

.error-message.warning {
  background: #b45309;
  box-shadow: 0 4px 16px rgba(180, 83, 9, 0.4);
}

.error-message svg {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.error-message button {
  background: none;
  border: none;
  color: white;
  font-size: 1.1rem;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.2s;
  padding: 0;
  margin-left: 0.5rem;
}

.error-message button:hover {
  opacity: 1;
}

@media (max-width: 768px) {
  .session-sidebar,
  .session-sidebar.collapsed {
    position: absolute;
    inset: 0 auto 0 0;
    z-index: 1100;
    width: min(280px, calc(100% - 24px));
    min-width: 0;
    transform: translateX(-100%);
    visibility: hidden;
    pointer-events: none;
    box-shadow: 12px 0 32px rgba(0, 0, 0, 0.35);
    transition:
      transform 0.2s ease,
      visibility 0s linear 0.2s;
  }

  .session-sidebar.mobile-open,
  .session-sidebar.collapsed.mobile-open {
    transform: translateX(0);
    visibility: visible;
    pointer-events: auto;
    transition-delay: 0s;
  }

  .desktop-collapse-btn {
    display: none;
  }

  .mobile-sidebar-close {
    display: flex;
  }

  .mobile-session-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    min-height: 40px;
    margin-bottom: 1rem;
    padding: 0.55rem 0.8rem;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-bg-secondary);
    color: var(--color-text-primary);
    font-weight: 600;
    cursor: pointer;
  }

  .mobile-session-backdrop {
    display: block;
    position: absolute;
    inset: 0;
    z-index: 1090;
    padding: 0;
    border: 0;
    background: rgba(0, 0, 0, 0.45);
    cursor: pointer;
  }

  .workflow-scroll {
    width: 100%;
    padding: 1rem 1rem 2rem;
  }

  .whatif-simulator {
    padding: 0;
  }
  
  .workflow-steps {
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .step-connector {
    display: none;
  }
  
  .step {
    width: 100%;
    max-width: 100%;
  }
  
  .progress-logs {
    max-height: 150px;
  }
}
</style>
