<template>
  <div class="whatif-simulator-layout">
    <!-- 왼쪽 세션 사이드바 -->
    <aside class="session-sidebar" :class="{ collapsed: sidebarCollapsed }">
      <div class="sidebar-header">
        <h3 v-if="!sidebarCollapsed">🔬 What-If 시뮬레이터</h3>
        <button class="collapse-btn" @click="sidebarCollapsed = !sidebarCollapsed">
          {{ sidebarCollapsed ? '▶' : '◀' }}
        </button>
      </div>
      
      <button v-if="!sidebarCollapsed" class="new-session-sidebar-btn" @click="startNewSession">
        ➕ 새 분석 시작
      </button>
      
      <div v-if="!sidebarCollapsed" class="session-cards">
        <div v-if="savedSessions.length === 0" class="no-sessions-msg">
          <p>저장된 세션이 없습니다.</p>
          <p class="hint">분석을 시작하면 자동으로 저장됩니다.</p>
        </div>
        <div 
          v-for="session in savedSessions" 
          :key="session.id"
          class="session-card"
          :class="{ active: session.id === sessionId }"
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
          <div v-if="session.data?.discoveredTables?.length || session.data?.causalEdges?.length" class="card-summary">
            <span v-if="session.data?.discoveredTables?.length" class="summary-tag">
              📊 {{ session.data.discoveredTables.length }}
            </span>
            <span v-if="session.data?.causalEdges?.length" class="summary-tag">
              🔗 {{ session.data.causalEdges.length }}
            </span>
          </div>
          
          <button class="card-delete-btn" @click.stop="deleteSession(session.id)">🗑️</button>
        </div>
      </div>
    </aside>
    
    <!-- 메인 콘텐츠 영역 -->
    <div class="main-content" ref="mainContentRef" @scroll="handleScroll">
    <!-- 워크플로우 스텝 (스크롤 시 상단 고정) -->
    <div class="workflow-steps" :class="{ 'sticky-active': isSticky }">
      <div 
        v-for="(step, index) in steps" 
        :key="step.id"
        class="step"
        :class="{ 
          active: currentStep === index, 
          completed: index < currentStep,
          disabled: index > currentStep && !canProceed(index)
        }"
        @click="goToStep(index)"
      >
        <div class="step-number">{{ index + 1 }}</div>
        <div class="step-info">
          <span class="step-title">{{ step.title }}</span>
          <span class="step-desc">{{ step.description }}</span>
        </div>
        <div v-if="index < steps.length - 1" class="step-connector"></div>
      </div>
    </div>

    <!-- 메인 컨텐츠 -->
    <div class="main-content">
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
            <button class="toggle-btn" @click="showLogs = !showLogs">
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
          @run-comparison="runMindsDbComparison"
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

    <!-- 에러 메시지 -->
    <div v-if="error" class="error-message">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
      </svg>
      <span>{{ error }}</span>
      <button @click="error = null">✕</button>
    </div>
    </div><!-- main-content 닫기 -->
  </div><!-- whatif-simulator-layout 닫기 -->
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, watch } from 'vue'
import { whatifApi, type DataDiscoveryResult, type CausalDiscoveryResult, type ValidationResult, type ComparisonResult, type LiteracyExplanation, type AgentAnalysisResult } from '@/services/whatif-api'
import ScenarioInput from './ScenarioInput.vue'
import DataSelector from './DataSelector.vue'
import CausalDiscovery from './CausalDiscovery.vue'
import ValidationCompare from './ValidationCompare.vue'
import DataLiteracy from './DataLiteracy.vue'

// localStorage 키
const STORAGE_KEY = 'whatif_sessions'
const CURRENT_SESSION_KEY = 'whatif_current_session'

// 워크플로우 스텝 정의
const steps = [
  { id: 'scenario', title: '시나리오 정의', description: '예측하고자 하는 내용 서술' },
  { id: 'data', title: '데이터 선택', description: '관련 데이터 발견 및 수집' },
  { id: 'discovery', title: '온톨로지 발견', description: 'Ontology Discovery 실행' },
  { id: 'validation', title: '검증 및 비교', description: '모델 검증 및 MindsDB 비교' },
  { id: 'simulation', title: '시뮬레이션 실행', description: 'What-If 시나리오 실행 및 해석' }
]

// 저장된 세션 타입
interface SavedSession {
  id: string
  scenario: string
  currentStep: number
  createdAt: string
  updatedAt: string
  data: {
    agentResult?: AgentAnalysisResult
    discoveryResult?: DataDiscoveryResult
    selectedTables?: string[]
    customSql?: string
    causalResult?: CausalDiscoveryResult
    validationResult?: ValidationResult
    comparisonResult?: ComparisonResult
    literacyExplanation?: LiteracyExplanation
  }
}

// 상태
const currentStep = ref(0)
const loading = ref(false)
const error = ref<string | null>(null)

// 저장된 세션 관리
const savedSessions = ref<SavedSession[]>([])
const showSessionPanel = ref(false)
const sidebarCollapsed = ref(false)
const isSticky = ref(false)
const mainContentRef = ref<HTMLElement | null>(null)

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

// 세션 및 데이터
const sessionId = ref<string | null>(null)
const scenario = ref('')
const agentResult = ref<AgentAnalysisResult | null>(null)
const discoveryResult = ref<DataDiscoveryResult | null>(null)
const selectedTables = ref<string[]>([])
const customSql = ref('')
const causalResult = ref<CausalDiscoveryResult | null>(null)
const validationResult = ref<ValidationResult | null>(null)
const comparisonResult = ref<ComparisonResult | null>(null)
const literacyExplanation = ref<LiteracyExplanation | null>(null)

// ==================== 세션 저장/복원 ====================

// localStorage에서 세션 목록 로드
function loadSavedSessions() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      savedSessions.value = JSON.parse(stored)
    }
  } catch (e) {
    console.error('세션 로드 실패:', e)
  }
}

// 현재 세션을 localStorage에 저장
function saveCurrentSession() {
  if (!sessionId.value) return
  
  const session: SavedSession = {
    id: sessionId.value,
    scenario: scenario.value,
    currentStep: currentStep.value,
    createdAt: savedSessions.value.find(s => s.id === sessionId.value)?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
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
  }
  
  // 기존 세션 업데이트 또는 새로 추가
  const existingIdx = savedSessions.value.findIndex(s => s.id === sessionId.value)
  if (existingIdx >= 0) {
    savedSessions.value[existingIdx] = session
  } else {
    savedSessions.value.unshift(session)
  }
  
  // 최대 10개 세션만 유지
  if (savedSessions.value.length > 10) {
    savedSessions.value = savedSessions.value.slice(0, 10)
  }
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedSessions.value))
    localStorage.setItem(CURRENT_SESSION_KEY, sessionId.value)
  } catch (e) {
    console.error('세션 저장 실패:', e)
  }
}

// 저장된 세션 복원
function restoreSession(session: SavedSession) {
  sessionId.value = session.id
  scenario.value = session.scenario
  currentStep.value = session.currentStep
  
  if (session.data.agentResult) agentResult.value = session.data.agentResult
  if (session.data.discoveryResult) discoveryResult.value = session.data.discoveryResult
  if (session.data.selectedTables) selectedTables.value = session.data.selectedTables
  if (session.data.customSql) customSql.value = session.data.customSql
  if (session.data.causalResult) causalResult.value = session.data.causalResult
  if (session.data.validationResult) validationResult.value = session.data.validationResult
  if (session.data.comparisonResult) comparisonResult.value = session.data.comparisonResult
  if (session.data.literacyExplanation) literacyExplanation.value = session.data.literacyExplanation
  
  showSessionPanel.value = false
  addLog('📂', 'success', `세션 "${session.scenario.substring(0, 30)}..." 복원됨`)
}

// 세션 삭제
function deleteSession(sessionIdToDelete: string) {
  savedSessions.value = savedSessions.value.filter(s => s.id !== sessionIdToDelete)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedSessions.value))
  } catch (e) {
    console.error('세션 삭제 실패:', e)
  }
}

// 새 세션 시작
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
  showSessionPanel.value = false
  
  localStorage.removeItem(CURRENT_SESSION_KEY)
}

// 마지막 세션 자동 복원
function restoreLastSession() {
  const lastSessionId = localStorage.getItem(CURRENT_SESSION_KEY)
  if (lastSessionId) {
    const session = savedSessions.value.find(s => s.id === lastSessionId)
    if (session) {
      restoreSession(session)
      addLog('🔄', 'info', '이전 작업 상태가 복원되었습니다.')
    }
  }
}

// 세션 상태 변경 감지 및 자동 저장
watch([currentStep, scenario, discoveryResult, causalResult, validationResult], () => {
  if (sessionId.value) {
    saveCurrentSession()
  }
}, { deep: true })

// 날짜 포맷
function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr)
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
  loadSavedSessions()
  restoreLastSession()
})

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

// API 핸들러
async function handleDiscovery() {
  if (!scenario.value.trim()) {
    error.value = '분석 시나리오를 입력해주세요.'
    return
  }
  
  loading.value = true
  error.value = null
  clearLogs()
  
  try {
    // 진행 로그 시작
    addLog('🚀', 'info', '에이전트 분석 시작...')
    addLog('📝', 'info', `시나리오: "${scenario.value.substring(0, 50)}..."`)
    
    // 시나리오에서 키워드 추출 시뮬레이션
    await delay(300)
    addLog('🔍', 'search', '시나리오에서 핵심 변수 추출 중...')
    await delay(200)
    
    const keywords = extractKeywords(scenario.value)
    keywords.forEach(kw => {
      addLog('📌', 'info', `변수 후보: ${kw}`)
    })
    
    await delay(300)
    addLog('🗄️', 'search', 'MySQL 데이터베이스에서 관련 테이블 검색 중...')
    
    // What-If 에이전트로 시나리오 분석
    const result = await whatifApi.analyzeScenario(scenario.value)
    agentResult.value = result
    sessionId.value = result.session_id
    
    // 검색 결과 로그
    if (result.data_sources.length > 0) {
      addLog('✅', 'success', `${result.data_sources.length}개 테이블 발견!`)
      
      result.data_sources.forEach(ds => {
        const scorePercent = Math.round(ds.relevance_score * 100)
        if (scorePercent >= 70) {
          addLog('🎯', 'success', `[적합] ${ds.table_name}: ${ds.row_count}행, 관련도 ${scorePercent}%`)
        } else if (scorePercent >= 40) {
          addLog('⚠️', 'warning', `[검토필요] ${ds.table_name}: ${ds.row_count}행, 관련도 ${scorePercent}%`)
        } else {
          addLog('❌', 'error', `[부적합] ${ds.table_name}: 관련도 ${scorePercent}% (제외됨)`)
        }
      })
      
      // 시계열 데이터 검증
      await delay(200)
      addLog('📊', 'info', '시계열 데이터 특성 검증 중...')
      result.data_sources.forEach(ds => {
        if (ds.has_time_column) {
          addLog('⏱️', 'success', `${ds.table_name}: 시간 컬럼 발견 (${ds.time_column})`)
        }
        if (ds.numeric_columns.length >= 2) {
          addLog('🔢', 'success', `${ds.table_name}: 숫자 컬럼 ${ds.numeric_columns.length}개 (인과분석 가능)`)
        }
      })
      
      // 에이전트 결과를 discoveryResult 형식으로 변환
      const source = result.data_sources[0]
      discoveryResult.value = {
        session_id: result.session_id,
        query: result.scenario,
        tables: result.data_sources.map(s => ({
          table_name: s.table_name,
          columns: s.columns,
          row_count: s.row_count,
          sample_data: s.sample_data,
          relevance_score: s.relevance_score,
          description: s.validation_notes.join(', ')
        })),
        suggested_sql: `SELECT * FROM ${source.table_name}`
      }
      customSql.value = `SELECT * FROM ${source.table_name}`
      
      addLog('🎉', 'success', '데이터 발견 완료! 다음 단계로 진행하세요.')
    } else {
      addLog('⚠️', 'warning', '관련 테이블을 찾지 못했습니다.')
      addLog('💡', 'info', '시나리오를 더 구체적으로 작성하거나 직접 테이블을 선택해주세요.')
    }
    
    currentStep.value = 1
  } catch (e) {
    addLog('❌', 'error', `오류 발생: ${e instanceof Error ? e.message : '알 수 없는 오류'}`)
    error.value = e instanceof Error ? e.message : '시나리오 분석 중 오류가 발생했습니다.'
  } finally {
    loading.value = false
  }
}

// 딜레이 유틸리티
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// 키워드 추출 (간단한 시뮬레이션)
function extractKeywords(text: string): string[] {
  const koreanKeywords: Record<string, string> = {
    '환율': 'exchange_rate',
    '원가': 'product_cost',
    '비용': 'import_cost',
    '수익': 'final_profit',
    '판매': 'sales_volume',
    '수요': 'market_demand',
    '가격': 'price',
    '매출': 'revenue'
  }
  
  const found: string[] = []
  for (const [ko, en] of Object.entries(koreanKeywords)) {
    if (text.includes(ko)) {
      found.push(`${ko} → ${en}`)
    }
  }
  return found.length > 0 ? found : ['일반 검색어']
}

async function handleDataCollection(sql: string) {
  if (!sql.trim()) {
    error.value = 'SQL을 입력해주세요.'
    return
  }
  
  loading.value = true
  error.value = null
  
  try {
    await whatifApi.collectData(sql)
    currentStep.value = 2
  } catch (e) {
    error.value = e instanceof Error ? e.message : '데이터 수집 중 오류가 발생했습니다.'
  } finally {
    loading.value = false
  }
}

async function handleFileUpload(file: File) {
  loading.value = true
  error.value = null
  
  try {
    const result = await whatifApi.uploadFile(file, sessionId.value || undefined)
    sessionId.value = result.session_id
    currentStep.value = 2
  } catch (e) {
    error.value = e instanceof Error ? e.message : '파일 업로드 중 오류가 발생했습니다.'
  } finally {
    loading.value = false
  }
}

async function runCausalDiscovery(methods: string[], maxLag: number) {
  if (!sessionId.value) {
    error.value = '세션이 없습니다. 데이터를 먼저 로드해주세요.'
    return
  }
  
  loading.value = true
  error.value = null
  
  try {
    const result = await whatifApi.runCausalDiscovery(sessionId.value, methods, maxLag)
    causalResult.value = result
    
    // 검증 결과도 함께 가져옴
    const validation = await whatifApi.getValidation(sessionId.value)
    validationResult.value = validation
    
    currentStep.value = 3
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Causal Discovery 실행 중 오류가 발생했습니다.'
  } finally {
    loading.value = false
  }
}

function goToLiteracyStep() {
  console.log('📝 결과 해석 단계로 이동')
  currentStep.value = 4
}

// 스크롤 이벤트 핸들러 - 탭 sticky 효과
function handleScroll(event: Event) {
  const target = event.target as HTMLElement
  isSticky.value = target.scrollTop > 150
}

// 세션 카드 스파크라인 생성
function getSparklinePoints(chartData: any): string {
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

function clearComparisonResult() {
  console.log('🗑️ 비교 결과 초기화')
  comparisonResult.value = null
}

async function runMindsDbComparison() {
  console.log('🚀 runMindsDbComparison 호출됨')
  
  if (!sessionId.value) {
    // 세션 ID가 없으면 새로 생성
    sessionId.value = `whatif_${Date.now()}`
    console.log('새 세션 ID 생성:', sessionId.value)
  }
  
  loading.value = true
  error.value = null
  
  try {
    // Causal Discovery 결과와 발견된 테이블 목록을 함께 전달
    const edges = causalResult.value?.edges || []
    // tables 필드에서 table_name 추출
    let tables = discoveryResult.value?.tables?.map(t => t.table_name) || 
                   selectedTables.value || []
    
    // 테이블이 없으면 기본 테이블 사용
    if (tables.length === 0) {
      tables = ['exchange_rate', 'import_cost', 'product_cost', 'sales_revenue', 'final_profit']
      console.log('기본 테이블 사용:', tables)
    }
    
    console.log('📊 Compare request - session:', sessionId.value, 'edges:', edges.length, 'tables:', tables)
    
    // TTM 포함 비교 시도 (실패하면 기존 방식으로 폴백)
    let result
    try {
      console.log('🧠 TTM 비교 API 호출 중...')
      result = await whatifApi.compareWithTTM(sessionId.value, edges, tables, true)
      console.log('✅ TTM Compare result:', result)
    } catch (ttmError) {
      console.log('⚠️ TTM not available, falling back to standard compare:', ttmError)
      result = await whatifApi.compareWithMindsdb(sessionId.value, edges, tables)
    }
    
    // 결과 저장
    comparisonResult.value = result
    console.log('📈 비교 결과 저장됨:', result?.summary)
    
    // 탭 이동하지 않음 - 사용자가 "다음" 버튼을 눌러야 이동
    // currentStep.value = 4
  } catch (e) {
    console.error('❌ 비교 실행 오류:', e)
    error.value = e instanceof Error ? e.message : 'MindsDB 비교 중 오류가 발생했습니다.'
  } finally {
    loading.value = false
  }
}

async function generateExplanation(reportType: 'summary' | 'discovery' | 'validation' | 'comparison') {
  if (!sessionId.value) {
    error.value = '세션이 없습니다.'
    return
  }
  
  loading.value = true
  error.value = null
  
  try {
    const result = await whatifApi.getExplanation(sessionId.value, reportType, 'ko')
    literacyExplanation.value = result
  } catch (e) {
    error.value = e instanceof Error ? e.message : '설명 생성 중 오류가 발생했습니다.'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
/* 전체 레이아웃 */
.whatif-simulator-layout {
  display: flex;
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

/* 메인 콘텐츠 */
.main-content {
  flex: 1;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 1.5rem 2rem 3rem;
  scroll-behavior: smooth;
  /* 스크롤바 숨기기 */
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE/Edge */
}

.main-content::-webkit-scrollbar {
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

/* 메인 컨텐츠 */
.main-content {
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

/* 에러 메시지 */
.error-message {
  position: fixed;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.875rem 1.25rem;
  background: #ef4444;
  border-radius: 10px;
  color: white;
  font-size: 0.85rem;
  box-shadow: 0 4px 16px rgba(239, 68, 68, 0.4);
  z-index: 1000;
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
  .whatif-simulator {
    padding: 1rem;
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
