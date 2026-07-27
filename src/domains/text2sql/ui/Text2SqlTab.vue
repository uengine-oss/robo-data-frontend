<template>
  <div class="text2sql-tab" :class="{ embedded: props.embedded }">
    <!-- 히스토리 패널 (임베드 모드에서는 숨김) -->
    <HistoryPanel
      v-if="!props.embedded"
      :is-open="historyOpen"
      @toggle="historyOpen = !historyOpen"
      @select="handleHistorySelect"
    />

    <!-- Direct SQL 모드 -->
    <DirectSqlInput v-if="mode === 'direct'" class="direct-sql-full" @change-mode="(m) => mode = m" />

    <!-- 채팅 컨테이너 (자연어 모드) -->
    <div v-else class="chat-container">
      <!-- 우상단 모드 선택기 및 새 쿼리 버튼 -->
      <div class="top-controls">
        <button v-if="chatMessages.length > 0 || reactStore.isRunning" class="new-query-btn"
          @click="startNewQuery" title="새 쿼리 시작">
          <span class="btn-icon">✨</span>
          <span class="btn-label">새 쿼리</span>
        </button>

        <div class="mode-selector-container">
          <button v-for="opt in modeOptions" :key="opt.value" :class="['mode-option', { active: mode === opt.value }]"
            @click="mode = opt.value" :title="opt.desc">
            <span class="opt-icon">{{ opt.icon }}</span>
            <span class="opt-label">{{ opt.label }}</span>
          </button>
        </div>
      </div>
      <!-- 채팅 메시지 영역 -->
      <div class="chat-messages" ref="chatContainer" @scroll="handleScroll">
        <!-- 초기 안내 메시지 -->
        <div v-if="chatMessages.length === 0 && !reactStore.isRunning" class="welcome-message">
          <h1 class="gradient-title">
            {{ props.domainLayerMode ? '도메인 레이어 데이터 분석' : '자연어로 데이터를 분석하세요' }}
          </h1>
          <p class="subtitle">
            {{ props.domainLayerMode
              ? 'ObjectType(Materialized View) 테이블만 대상으로 AI가 쿼리를 생성합니다'
              : '질문을 입력하면 AI가 최적의 SQL 쿼리를 생성합니다' }}
          </p>
          <!-- 최근 쿼리가 있으면 표시 -->
          <div v-if="recentQueries.length > 0" class="examples recent">
            <p class="examples-label">최근 질문</p>
            <button v-for="query in recentQueries.slice(0, 5)" :key="query" class="example-btn recent"
              @click="setQuestion(query)">
              {{ query.length > 40 ? query.slice(0, 40) + '...' : query }}
            </button>
          </div>
          <p v-if="recentQueriesWarning" class="recent-queries-warning" role="status">
            {{ recentQueriesWarning }}
          </p>

          <!-- 기본 예시 -->
          <div class="examples">
            <p class="examples-label">예시 질문</p>
            <button v-for="example in defaultExamples" :key="example" class="example-btn" @click="setQuestion(example)">
              {{ example }}
            </button>
          </div>
        </div>

        <!-- 채팅 메시지들 (윈도우링 적용 - 최근 N개만 렌더링) -->
        <button
          v-if="hiddenMessageCount > 0"
          type="button"
          class="hidden-messages-indicator"
          @click="showAllMessages = true"
        >
          <span>{{ hiddenMessageCount }}개의 이전 메시지 보기...</span>
        </button>

        <div v-for="msg in visibleMessages" :key="msg.id" :class="['chat-message', msg.type]"
          v-memo="[
            msg.id,
            msg.type,
            msg.content,
            msg.isStreaming,
            msg.isExecuting,
            expandedMessages.has(msg.id),
            msg.type === 'result' ? (msg.feedbackRequired === true) : false,
            msg.type === 'result' ? (msg.fromCache === true) : false,
            msg.type === 'result' ? hasFeedbackSubmitted(msg) : false,
            msg.type === 'result' ? isFeedbackDisabled(msg) : false
          ]">
          <!-- 사용자 메시지 -->
          <template v-if="msg.type === 'user'">
            <div class="message-avatar user">👤</div>
            <div class="message-content">
              <div class="message-text">{{ msg.content }}</div>
            </div>
          </template>

          <!-- AI 사고 과정 - 간소화 -->
          <template v-else-if="msg.type === 'thinking'">
            <div class="message-avatar ai">🧠</div>
            <div class="message-content">
              <span class="step-badge">Step {{ msg.step }}</span>
              <span class="phase-label thinking">사고 중...</span>
              <span class="typing-dots"><span></span><span></span><span></span></span>
            </div>
          </template>

          <!-- AI 추론 -->
          <template v-else-if="msg.type === 'reasoning'">
            <div class="message-avatar ai">💡</div>
            <div class="message-content reasoning-content">
              <div class="message-header">
                <span class="step-badge">Step {{ msg.step }}</span>
                <span class="phase-label reasoning">{{ msg.toolInfo?.name || '추론' }}</span>
                <!-- 세부 정보 토글 버튼 -->
                <button v-if="msg.toolInfo" class="details-toggle-btn" @click="toggleMessageExpand(msg.id)">
                  {{ expandedMessages.has(msg.id) ? '세부 정보 접기' : '세부 정보 보기' }}
                </button>
              </div>
              <div class="reasoning-text">{{ msg.content }}</div>
              <!-- SQL이 있으면 표시 -->
              <div v-if="msg.sql" class="reasoning-sql">
                <pre class="sql-code"><code>{{ msg.sql }}</code></pre>
              </div>
              <!-- 세부 정보 (도구 호출 정보) - 확장 시에만 표시 -->
              <div v-if="msg.toolInfo && expandedMessages.has(msg.id)" class="tool-details">
                <div class="tool-details-header">🔧 도구 호출 정보</div>
                <div class="tool-detail-item">
                  <span class="label">도구:</span>
                  <span class="value">{{ msg.toolInfo.name }}</span>
                </div>
                <div v-if="msg.toolInfo.params" class="tool-detail-item">
                  <span class="label">파라미터:</span>
                  <code class="value">{{ msg.toolInfo.params }}</code>
                </div>
                <div v-if="msg.toolInfo.result" class="tool-detail-item">
                  <span class="label">결과:</span>
                  <pre class="result-preview"><code>{{ truncateResult(msg.toolInfo.result, 500) }}</code></pre>
                </div>
              </div>
            </div>
          </template>

          <!-- 도구 실행 -->
          <template v-else-if="msg.type === 'tool'">
            <div class="message-avatar ai">⚡</div>
            <div class="message-content">
              <div class="message-header">
                <span class="step-badge">Step {{ msg.step }}</span>
                <span class="phase-label tool">{{ msg.toolName }}</span>
                <span v-if="msg.isExecuting" class="spinner-small"></span>
                <span v-else class="completed-indicator">✓</span>
              </div>

              <!-- 파라미터 -->
              <code v-if="msg.params" class="tool-params-compact">{{ msg.params }}</code>

              <!-- 결과 - 항상 표시 -->
              <div v-if="msg.result" class="tool-result-display">
                <pre class="result-code"><code>{{ truncateResult(msg.result, 800) }}</code></pre>
              </div>
            </div>
          </template>

          <!-- AI 질문 -->
          <template v-else-if="msg.type === 'question'">
            <div class="message-avatar ai">❓</div>
            <div class="message-content question-content">
              <span class="phase-label question">질문</span>
              <div class="message-text">{{ msg.content }}</div>
            </div>
          </template>

          <!-- SQL 결과 -->
          <template v-else-if="msg.type === 'sql'">
            <div class="message-avatar ai">📝</div>
            <div class="message-content sql-content">
              <div class="message-header">
                <span class="phase-label sql">최종 SQL</span>
                <button class="copy-btn" @click="copySql(msg.content)">📋</button>
              </div>
              <pre class="sql-code"><code>{{ msg.content }}</code></pre>
            </div>
          </template>

          <!-- 실행 결과 -->
          <template v-else-if="msg.type === 'result'">
            <div class="message-avatar ai">📊</div>
            <div class="message-content result-content">
              <div class="message-header">
                <span class="phase-label result">실행 결과</span>
                <span class="result-meta">{{ msg.rowCount }}행 · {{ msg.execTime }}ms</span>
                <div class="result-actions">
                  <template v-if="shouldShowFeedbackButtons(msg) && !hasFeedbackSubmitted(msg)">
                    <button class="feedback-btn approve" :disabled="isFeedbackDisabled(msg)"
                      @click="requestFeedback(msg, true)">
                      맞아요
                    </button>
                    <button class="feedback-btn reject" :disabled="isFeedbackDisabled(msg)"
                      @click="requestFeedback(msg, false)">
                      틀려요
                    </button>
                  </template>
                  <button v-if="getResultSql(msg)" class="ontology-export-btn" @click="exportToOntologyFromMsg(msg)">
                    🧩 온톨로지
                  </button>
                  <button v-if="getResultSql(msg)" class="olap-export-btn" @click="exportToOlapFromMsg(msg)">
                    📊 OLAP
                  </button>
                  <button v-if="getResultSql(msg)" class="ontology-instance-btn" @click="requestOntologyInstanceExport(msg)">
                    🔮 감시 에이전트
                  </button>
                </div>
              </div>
              <ResultTable v-if="msg.data" :data="msg.data" :max-rows="20" />
            </div>
          </template>

          <!-- 에러 -->
          <template v-else-if="msg.type === 'error'">
            <div class="message-avatar error">⚠️</div>
            <div class="message-content error-content">{{ msg.content }}</div>
          </template>

          <!-- 시스템 메시지 (일시정지/재개 등) -->
          <template v-else-if="msg.type === 'system'">
            <div class="message-avatar system">ℹ️</div>
            <div class="message-content system-content">{{ msg.content }}</div>
          </template>
        </div>

        <!-- 진행 상황 카드 (문맥 수집/보강) - 요약 기본, 세부 토글 -->
        <div v-if="reactStore.isRunning && progressHeadline" class="chat-message ai progress">
          <div class="message-avatar ai">⏳</div>
          <div class="message-content progress-content">
            <div class="message-header">
              <span class="phase-label thinking">진행 상황</span>
              <span class="progress-headline">{{ progressHeadline }}</span>
              <span v-if="estimatedProgressPercent" class="progress-percent">추정 {{ estimatedProgressPercent }}%</span>
              <button class="progress-toggle-btn" @click="progressExpanded = !progressExpanded">
                {{ progressExpanded ? '세부 정보 접기' : '세부 정보 보기' }}
              </button>
            </div>

            <div class="progress-bar" aria-hidden="true">
              <div class="progress-bar-fill" :style="{ width: `${estimatedProgressPercent}%` }"></div>
            </div>

            <div v-if="progressDetails.length" class="progress-details">
              <span v-for="(d, idx) in progressDetails" :key="idx" class="progress-detail-chip">
                {{ d }}
              </span>
            </div>

            <div v-if="progressExpanded" class="progress-expanded">
              <details v-if="progressDetailsHiddenCount > 0" class="progress-counts-more">
                <summary class="progress-counts-summary">
                  전체 지표 보기 ({{ progressDetailsAll.length }}개)
                </summary>
                <div v-if="progressDetailsAll.length" class="progress-details progress-details-all">
                  <span v-for="(d, idx) in progressDetailsAll" :key="idx" class="progress-detail-chip">
                    {{ d }}
                  </span>
                </div>
              </details>
              <div v-if="reactStore.visiblePipelineStageList.length" class="progress-stages">
                <div v-for="st in reactStore.visiblePipelineStageList" :key="st.stage" class="progress-stage-row">
                  <span class="stage-name">{{ getStageLabel(st.stage) }}</span>
                  <span :class="['stage-status', st.status]">
                    {{ st.status === 'start' ? '진행 중' : st.status === 'done' ? '완료' : '오류' }}
                  </span>
                  <span v-if="typeof st.elapsed_ms === 'number'" class="stage-elapsed">
                    {{ (st.elapsed_ms / 1000).toFixed(1) }}초
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Live 스트리밍 패널 - 추론 + SQL 중심 -->
        <div v-if="reactStore.isRunning && liveCurrent" class="chat-message ai live">
          <div class="message-avatar ai">🧩</div>
          <div class="message-content live-content">
            <div class="message-header">
              <span class="step-badge">Step {{ reactStore.currentIteration }}</span>
              <span class="phase-label thinking">생성 중</span>
            </div>

            <!-- 추론 + SQL만 표시 -->
            <div class="live-summary">
              <!-- 추론 내용 -->
              <div v-if="liveReasoning" class="live-reasoning-text">
                {{ liveReasoning }}
                <span class="cursor" v-if="reactStore.currentPhase === 'thinking'">▌</span>
              </div>
              <!-- SQL 프리뷰 -->
              <div v-if="livePartialSql" class="live-sql-preview">
                <pre class="sql-code"><code>{{ livePartialSql }}</code></pre>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 입력 영역 -->
      <div class="chat-input-area">
        <!-- 일시정지 상태 -->
        <div v-if="reactStore.isPaused" class="status-bar paused-bar">
          <span class="status-dot paused"></span>
          <span>⏸️ 일시정지됨 - 피드백을 입력하고 재개하거나 바로 재개하세요</span>
          <button class="resume-btn" @click="handleResume">▶ 재개</button>
          <button class="cancel-btn" @click="handleCancel">✕ 취소</button>
        </div>
        <!-- 진행 중 상태 표시 -->
        <div v-else-if="isAnyRunning && !reactStore.isWaitingUser" class="status-bar">
          <span class="status-dot running"></span>
          <span>{{ runningStatusText }}</span>
          <button class="pause-btn" @click="handlePause">⏸ 잠시 멈춤</button>
          <button class="cancel-btn" @click="handleCancel">✕ 중단</button>
        </div>

        <!-- 입력창 -->
        <div class="input-wrapper">
          <textarea v-model="inputText" :placeholder="pausedPlaceholder"
            :disabled="reactStore.isRunning && !reactStore.isWaitingUser && !reactStore.isPaused" rows="1"
            @keydown.enter.exact.prevent="handleSubmit" @keydown.shift.enter="handleNewline" @input="autoResize"
            ref="inputRef"></textarea>
          <button class="send-btn" :disabled="!canSubmitOrResume" @click="handleSubmit">
            <IconPlay v-if="!reactStore.isRunning && !reactStore.isPaused" :size="18" />
            <IconUpload v-else :size="18" />
          </button>
        </div>

        <!-- 고급 설정 토글 -->
        <button
          type="button"
          class="settings-toggle"
          aria-controls="text2sql-advanced-settings"
          :aria-expanded="showSettings"
          @click="showSettings = !showSettings"
        >
          <IconSettings :size="12" />
          <span>고급 설정</span>
          <IconChevronDown :size="12" :class="{ rotated: showSettings }" />
        </button>

        <transition name="slide">
          <div v-if="showSettings" id="text2sql-advanced-settings" class="settings-panel">
            <div class="setting-row">
              <label>최대 도구 호출</label>
              <input v-model.number="maxToolCalls" type="number" min="1" max="100" />
            </div>
            <div class="setting-row">
              <label>SQL 실행 제한(초)</label>
              <input v-model.number="maxSqlSeconds" type="number" min="1" max="3600" />
            </div>
            <div class="setting-row">
              <label>캐시 사용</label>
              <input v-model="useCache" type="checkbox" />
              <span class="setting-hint">동일 질문 시 빠른 응답</span>
            </div>
            <div class="setting-row">
              <label>DW 스키마만 검색</label>
              <input v-model="dwOnlySearch" type="checkbox" />
              <span class="setting-hint">OLAP 큐브 데이터만 검색</span>
            </div>
            <div class="setting-row">
              <label>Raw XML(디버그)</label>
              <input v-model="debugRawXml" type="checkbox" />
            </div>
          </div>
        </transition>
      </div>
    </div>

    <!-- 우측 SQL 패널 (선택적) -->
    <div v-if="reactStore.hasSteps" class="sql-side-panel">
      <div class="panel-header">
        <h3>현재 SQL</h3>
        <button v-if="displaySql" class="copy-btn" @click="copySql(displaySql)">
          <IconCopy :size="14" />
        </button>
      </div>
      <div class="sql-preview">
        <TransitionGroup v-if="sqlDisplayLines.length" name="sql-line" tag="pre" class="sql-diff">
          <code v-for="line in sqlDisplayLines" :key="line.id"
            :class="['sql-line', line.status]">{{ line.content }}</code>
        </TransitionGroup>

        <!-- fallback: diff 라인 생성 전/타이머 중 안전장치 -->
        <pre v-else-if="displaySql"><code>{{ displaySql }}</code></pre>

        <div v-else class="sql-placeholder">SQL 생성 대기 중...</div>
      </div>
      <div v-if="latestCompleteness" class="completeness-bar">
        <span>완성도:</span>
        <span :class="['level', getConfidenceClass(latestCompleteness.confidence_level)]">
          {{ latestCompleteness.confidence_level }}
        </span>
      </div>
    </div>
  </div>
  <FeedbackDialog
    :open="Boolean(feedbackDraft)"
    :approved="feedbackDraft?.approved ?? false"
    :question="feedbackDraft?.question ?? ''"
    :pending="feedbackPending"
    :error="feedbackDraft?.error ?? null"
    @close="feedbackDraft = null"
    @submit="submitFeedbackDraft"
  />
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted } from 'vue'
import { useReactStore } from '../state/query.ts'
import { useHistoryStore } from '../state/history.ts'
import { toRecordRows, type QueryHistoryItem } from '../api/contracts.ts'
import { useFeatureNavigation } from '@/shared/navigation/featureNavigation'
import { useDatasourcesStore } from '@/domains/data-fabric'
import ResultTable from './ResultTable.vue'
import HistoryPanel from './HistoryPanel.vue'
import DirectSqlInput from './DirectSqlInput.vue'
import FeedbackDialog from './FeedbackDialog.vue'
import type { ReactExecutionResult } from '../model/react'
import type { SqlResultInstanceExport } from '../model/instanceExport'
import { buildSqlLineDiff, type PreviousSqlLine, type SqlDiffLine } from '../model/sqlLineDiff'
import { getText2SqlStageLabelKo } from '../model/progress'
import { submitText2SqlFeedback } from '../application/feedback'
import {
  persistRecentQuery,
  readRecentQueries,
} from '../application/recentQueries'
import { projectChatMessageWindow } from '../application/messageWindow'
import { useManagedTimeouts } from '@/shared/composables/useManagedTimeouts'
import { STORAGE_KEYS } from '@/shared/config/storageKeys'
import {
  IconPlay, IconUpload, IconSettings, IconChevronDown, IconCopy
} from '@/shared/icons'

// 연결된 ObjectType 정보 타입
interface LinkedObjectType {
  name: string
  columns: Array<{ name: string; type: string }>
  description?: string
}

// Props for embedded mode
const props = withDefaults(defineProps<{
  embedded?: boolean       // 임베드 모드 (히스토리 숨김, 심플 UI)
  initialQuery?: string    // 초기 검색어 (자동 실행)
  autoExecute?: boolean    // 초기 검색어 자동 실행 여부
  domainLayerMode?: boolean  // 도메인 레이어 모드 (ObjectType 테이블만 검색)
  linkedObjectTypes?: LinkedObjectType[]  // 연결할 ObjectType 정보 (프롬프트 확장용)
}>(), {
  embedded: false,
  initialQuery: '',
  autoExecute: false,
  domainLayerMode: false,
  linkedObjectTypes: () => []
})

const emit = defineEmits<{
  'request-instance-export': [payload: SqlResultInstanceExport]
}>()

// Types
interface ToolInfo {
  name: string
  params?: string
  result?: string
}

interface ChatMessage {
  id: string
  type: 'user' | 'thinking' | 'reasoning' | 'tool' | 'question' | 'sql' | 'result' | 'error' | 'system'
  content: string
  step?: number
  isStreaming?: boolean
  nextTool?: string
  toolName?: string
  params?: string
  result?: string
  isExecuting?: boolean
  rowCount?: number
  execTime?: number
  data?: ReactExecutionResult
  icon?: string
  sql?: string  // 결과에 연결된 SQL (히스토리 선택 시 사용)
  question?: string  // 원본 질문 (OLAP 내보내기 시 사용)
  // UI feedback gating (backend query-quality gate)
  feedbackRequired?: boolean
  fromCache?: boolean
  toolInfo?: ToolInfo  // 도구 호출 세부 정보 (디버깅용)
}

const reactStore = useReactStore()
const historyStore = useHistoryStore()
const featureNavigation = useFeatureNavigation()
const datasourcesStore = useDatasourcesStore()
const timers = useManagedTimeouts()

// 모드: 'react' | 'direct'
type QueryMode = 'react' | 'direct'
const mode = ref<QueryMode>('react')

const modeOptions: { value: QueryMode; label: string; icon: string; desc: string }[] = [
  { value: 'react', label: '자연어 검색', icon: '🧠', desc: '정밀한 AI 분석' },
  { value: 'direct', label: 'SQL', icon: '📝', desc: '직접 입력' },
]

// 메시지에서 SQL 가져오기 (store 또는 msg.sql)
function getResultSql(msg: ChatMessage): string | null {
  return msg.sql || reactStore.finalSql || null
}

// 메시지에서 OLAP으로 내보내기
function exportToOlapFromMsg(msg: ChatMessage) {
  const sql = getResultSql(msg)
  const question = msg.question || reactStore.currentQuestion

  if (!sql) return
  featureNavigation.open('olap', { question, sql, fromHistory: true })
}

// 메시지에서 온톨로지(도메인 스키마)로 내보내기
function exportToOntologyFromMsg(msg: ChatMessage) {
  const sql = getResultSql(msg)
  const question = msg.question || reactStore.currentQuestion

  if (!sql) return
  featureNavigation.open('schema-modeling', { question, sql })
}

// ============================================================================
// Feedback (정답/오답) - 오염 방지 목적
// ============================================================================

const submittedFeedbackKeys = ref<Set<string>>(new Set())
const feedbackPendingKey = ref<string | null>(null)
const feedbackPending = computed(() => feedbackPendingKey.value !== null)

interface FeedbackDraft {
  msg: ChatMessage
  key: string
  approved: boolean
  question: string
  notes: string
  error: string | null
}

const feedbackDraft = ref<FeedbackDraft | null>(null)

function _feedbackKey(msg: ChatMessage): string {
  const q = (msg.question || reactStore.currentQuestion || '').trim()
  const sql = (getResultSql(msg) || '').trim()
  return `${q}||${sql}`
}

function hasFeedbackSubmitted(msg: ChatMessage): boolean {
  return submittedFeedbackKeys.value.has(_feedbackKey(msg))
}

function shouldShowFeedbackButtons(msg: ChatMessage): boolean {
  // 정책: 자동 검증 실패(feedbackRequired=true)에서만 노출하며, 캐시/히스토리는 노출하지 않는다.
  if (msg.type !== 'result') return false
  if (msg.fromCache) return false
  return msg.feedbackRequired === true
}

function isFeedbackDisabled(msg: ChatMessage): boolean {
  const sql = getResultSql(msg)
  if (!sql) return true
  if (feedbackPendingKey.value === _feedbackKey(msg)) return true
  return submittedFeedbackKeys.value.has(_feedbackKey(msg))
}

function requestFeedback(msg: ChatMessage, approved: boolean): void {
  const key = _feedbackKey(msg)
  if (!key || submittedFeedbackKeys.value.has(key) || feedbackPendingKey.value === key) return
  if (!approved) {
    feedbackDraft.value = {
      msg,
      key,
      approved,
      question: (msg.question || reactStore.currentQuestion || '').trim(),
      notes: '',
      error: null,
    }
    return
  }
  void submitFeedback(msg, approved, '')
}

async function submitFeedbackDraft(notes: string): Promise<void> {
  const draft = feedbackDraft.value
  if (!draft) return
  draft.notes = notes
  draft.error = null
  await submitFeedback(draft.msg, draft.approved, notes)
}

async function submitFeedback(msg: ChatMessage, approved: boolean, notes: string): Promise<void> {
  const sql = getResultSql(msg)
  const q = (msg.question || reactStore.currentQuestion || '').trim()
  if (!sql) return

  const key = _feedbackKey(msg)
  if (submittedFeedbackKeys.value.has(key)) return
  feedbackPendingKey.value = key
  try {
    await submitText2SqlFeedback({
      question: q || undefined,
      conversationState: reactStore.conversationState || undefined,
      sql,
      notes: notes || undefined,
      approved,
    })
    submittedFeedbackKeys.value.add(key)
    if (feedbackDraft.value?.key === key) feedbackDraft.value = null
    addMessage({
      type: 'system',
      content: approved ? '피드백(맞아요)이 저장되었습니다.' : '피드백(틀려요)이 저장되었습니다.'
    })
  } catch (error: unknown) {
    feedbackDraft.value = {
      msg,
      key,
      approved,
      question: q,
      notes,
      error: error instanceof Error ? error.message : '피드백 저장에 실패했습니다.',
    }
  } finally {
    if (feedbackPendingKey.value === key) feedbackPendingKey.value = null
  }
}

function requestOntologyInstanceExport(msg: ChatMessage): void {
  const sql = getResultSql(msg)
  if (!sql || !msg.data) return

  const columns = msg.data.columns || []
  const sampleData = toRecordRows(msg.data.rows, columns).slice(0, 5)

  emit('request-instance-export', {
    sql,
    question: msg.question || reactStore.currentQuestion,
    rowCount: msg.rowCount || 0,
    columns,
    sampleData,
  })
}

// Refs
const historyOpen = ref(true)
const chatContainer = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLTextAreaElement | null>(null)
const inputText = ref('')
const showSettings = ref(false)
const maxToolCalls = ref(30)
const maxSqlSeconds = ref(60)
const useCache = ref(true)  // 캐시 사용 여부
const dwOnlySearch = ref(false)  // DW 스키마만 검색 (OLAP 전용)
const debugRawXml = ref(false)
const expandedMessages = ref<Set<string>>(new Set())

// 진행 카드(요약 기본) 토글
const progressExpanded = ref(true)

// DOM 최적화: 메시지 윈도우링
const MAX_VISIBLE_MESSAGES = 30  // 최대 표시 메시지 수
const showAllMessages = ref(false)

const messageWindow = computed(() => projectChatMessageWindow(
  chatMessages.value,
  showAllMessages.value,
  MAX_VISIBLE_MESSAGES,
))
const visibleMessages = computed(() => messageWindow.value.visibleMessages)
const hiddenMessageCount = computed(() => messageWindow.value.hiddenMessageCount)

// Chat messages
const chatMessages = ref<ChatMessage[]>([])
let messageIdCounter = 0

const defaultExamples = [
  '회의실 예약 현황을 보여줘',
  '오늘 예약된 회의 목록',
  '가장 많이 사용되는 회의실 Top 5'
]

const recentQueries = ref<string[]>([])
const recentQueriesWarning = ref<string | null>(null)

function loadRecentQueries() {
  const result = readRecentQueries(localStorage, STORAGE_KEYS.RECENT_QUERIES)
  recentQueries.value = result.queries
  recentQueriesWarning.value = result.warning
}

function saveRecentQuery(query: string) {
  const result = persistRecentQuery(
    localStorage,
    STORAGE_KEYS.RECENT_QUERIES,
    recentQueries.value,
    query,
  )
  recentQueries.value = result.queries
  recentQueriesWarning.value = result.warning
}

// Computed
const isAnyRunning = computed(() => reactStore.isRunning)
const canSubmit = computed(() =>
  inputText.value.trim() && (!isAnyRunning.value || reactStore.isWaitingUser)
)

// 일시정지 상태에서도 제출 가능 (피드백 + 재개)
const canSubmitOrResume = computed(() => {
  if (reactStore.isPaused) return true  // 일시정지 상태에서는 항상 활성화 (피드백 없어도 재개 가능)
  return canSubmit.value
})

const inputPlaceholder = computed(() =>
  reactStore.isWaitingUser
    ? '답변을 입력하세요...'
    : '질문을 입력하세요... (Enter로 전송)'
)

const pausedPlaceholder = computed(() => {
  if (reactStore.isPaused) {
    return '피드백을 입력하고 Enter로 재개... (빈 상태로 Enter시 바로 재개)'
  }
  return inputPlaceholder.value
})

// 스텝 단위 diff를 위해 latestStep.partial_sql만 사용하고,
// finalSql 도착 시에도 동일한 패널에서 마지막 diff 애니메이션을 보여준다.
const displaySql = computed(() =>
  reactStore.finalSql || reactStore.latestStep?.partial_sql || ''
)

const latestCompleteness = computed(() =>
  reactStore.latestStep?.sql_completeness ?? null
)

const progressHeadline = computed(() => reactStore.progressHeadline)
const progressDetails = computed(() => reactStore.progressDetails)
const progressDetailsAll = computed(() => reactStore.progressDetailsAll)
const progressDetailsHiddenCount = computed(() => reactStore.progressDetailsHiddenCount)
const estimatedProgressPercent = computed(() => reactStore.estimatedProgressPercent)

function getStageLabel(stage: string): string {
  return getText2SqlStageLabelKo(stage)
}

const runningStatusText = computed(() => {
  // ReAct 모드: 진행 headline이 있으면 우선 사용
  const h = progressHeadline.value
  return h ? `🧠 ${h}` : '🧠 AI가 분석 중...'
})

// ============================================================================
// Current SQL diff (right panel only)
// ============================================================================

const sqlDisplayLines = ref<SqlDiffLine[]>([])
const previousSqlLines = ref<PreviousSqlLine[]>([])

watch(
  () => displaySql.value,
  (newSql) => {
    timers.cancel('sql-diff-remove')
    timers.cancel('sql-diff-highlight')

    if (!newSql) {
      sqlDisplayLines.value = []
      previousSqlLines.value = []
      return
    }

    const { displayLines, nextPrevious } = buildSqlLineDiff(previousSqlLines.value, newSql, {
      modifiedSimilarityThreshold: 0.62,
      modifiedLookahead: 3
    })

    sqlDisplayLines.value = displayLines
    previousSqlLines.value = nextPrevious

    // 삭제 라인을 원래 위치에서 잠깐 보여준 후 제거
    timers.schedule('sql-diff-remove', () => {
      sqlDisplayLines.value = sqlDisplayLines.value.filter(l => l.status !== 'removed')
    }, 1000)

    // added/modified 하이라이트를 잠시 후 해제
    timers.schedule('sql-diff-highlight', () => {
      sqlDisplayLines.value = sqlDisplayLines.value.map(l => ({
        ...l,
        status: l.status === 'added' || l.status === 'modified' ? 'unchanged' : l.status
      }))
    }, 2500)
  },
  { immediate: true }
)

// DOM 최적화: 라이브 스트리밍 데이터 (간소화)
const liveCurrent = computed(() => reactStore.liveByIteration[reactStore.currentIteration] ?? null)
const liveReasoning = computed(() => liveCurrent.value?.sections?.reasoning ?? '')
const livePartialSql = computed(() => liveCurrent.value?.sections?.partial_sql ?? '')

// Helper functions
function generateId(): string {
  return `msg-${++messageIdCounter}-${Date.now()}`
}

function addMessage(msg: Omit<ChatMessage, 'id'>): string {
  const id = generateId()
  chatMessages.value.push({ ...msg, id })
  scrollToBottom()
  return id
}

function updateMessage(id: string, updates: Partial<ChatMessage>) {
  const idx = chatMessages.value.findIndex(m => m.id === id)
  if (idx !== -1) {
    chatMessages.value[idx] = { ...chatMessages.value[idx], ...updates }
  }
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

function formatParams(params: Record<string, unknown>): string {
  try {
    const entries = Object.entries(params)
    if (entries.length === 0) return ''
    return entries
      .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join(', ')
  } catch {
    return ''
  }
}

function truncateResult(result: string, maxLen = 300): string {
  const lines = result.split('\n')
  if (lines.length > 5) {
    return lines.slice(0, 5).join('\n') + '\n...'
  }
  if (result.length > maxLen) {
    return result.slice(0, maxLen) + '...'
  }
  return result
}

function toggleMessageExpand(id: string) {
  if (expandedMessages.value.has(id)) {
    expandedMessages.value.delete(id)
  } else {
    expandedMessages.value.add(id)
  }
}

function getConfidenceClass(level: string): string {
  const lower = level.toLowerCase()
  if (lower.includes('high')) return 'high'
  if (lower.includes('medium')) return 'medium'
  return 'low'
}

function copySql(sql: string) {
  navigator.clipboard.writeText(sql)
}

function setQuestion(q: string) {
  inputText.value = q
  inputRef.value?.focus()
}

// 새 쿼리 시작 - 모든 상태 초기화
function startNewQuery() {
  // 진행 중인 작업 취소
  if (reactStore.isRunning) {
    reactStore.cancel()
  }
  // 연속질문 컨텍스트 초기화 (완전한 새 대화)
  reactStore.clear()

  // 채팅 메시지 초기화
  chatMessages.value = []

  // 입력창 초기화 및 포커스
  inputText.value = ''
  nextTick(() => {
    inputRef.value?.focus()
  })

  // SQL 디스플레이 초기화
  sqlDisplayLines.value = []
  previousSqlLines.value = []

  // 스크롤 상태 초기화
  isUserScrolledUp.value = false
}

function autoResize(e: Event) {
  const target = e.target as HTMLTextAreaElement
  target.style.height = 'auto'
  target.style.height = Math.min(target.scrollHeight, 120) + 'px'
}

// Event handlers
async function handleSubmit() {
  // 일시정지 상태에서는 피드백과 함께 재개
  if (reactStore.isPaused) {
    const feedback = inputText.value.trim()
    inputText.value = ''
    if (feedback) {
      addMessage({ type: 'user', content: `[피드백] ${feedback}` })
    }
    addMessage({ type: 'system', content: '▶ 재개합니다...' })
    await reactStore.resume(feedback)
    return
  }

  if (!canSubmit.value) return

  const text = inputText.value.trim()
  inputText.value = ''

  // 최근 쿼리 저장 (사용자 응답 제외)
  if (!reactStore.isWaitingUser) {
    saveRecentQuery(text)
  }

  if (reactStore.isWaitingUser) {
    // 사용자 응답 (ReAct 모드)
    addMessage({ type: 'user', content: text })
    await reactStore.continueWithResponse(text)
  } else {
    // ReAct 자연어 검색 모드
    // NOTE: 연속질문 UX를 위해 채팅 내역은 보존한다.
    // 완전히 새 대화로 시작하고 싶으면 "새 쿼리" 버튼을 사용.
    addMessage({ type: 'user', content: text })

    // 도메인 레이어 모드면 ObjectType(Materialized View) 테이블만 검색
    const schemaFilter = props.domainLayerMode
      ? ['dw']  // ObjectType 테이블은 dw 스키마에 Materialized View로 저장됨
      : (dwOnlySearch.value ? ['dw'] : undefined)

    await reactStore.start(text, {
      maxToolCalls: maxToolCalls.value,
      maxSqlSeconds: maxSqlSeconds.value,
      debugStreamRawXmlTokens: debugRawXml.value,
      useCache: useCache.value,
      schemaFilter,
      objectTypeOnly: props.domainLayerMode,  // ObjectType 테이블만 검색
      linkedObjectTypes: props.linkedObjectTypes  // 연결된 ObjectType 정보 (프롬프트 확장용)
    })
  }
}

function handleNewline(_e: KeyboardEvent) {
  // Shift+Enter는 줄바꿈
}

function handleCancel() {
  reactStore.cancel()
  inputText.value = ''
  addMessage({ type: 'error', content: '작업이 중단되었습니다.' })
}

// 일시정지: 현재 진행을 멈추고 피드백을 받을 수 있는 상태로 전환
function handlePause() {
  reactStore.pause()
  addMessage({ type: 'system', content: '⏸️ 일시정지됨. 하단 입력창에 피드백을 입력하고 Enter 또는 재개 버튼을 누르세요.' })
  // 입력창에 포커스
  nextTick(() => inputRef.value?.focus())
}

// 재개: 하단 입력창의 피드백과 함께 계속 진행
async function handleResume() {
  const feedback = inputText.value.trim()
  inputText.value = ''
  if (feedback) {
    addMessage({ type: 'user', content: `[피드백] ${feedback}` })
  }
  addMessage({ type: 'system', content: '▶ 재개합니다...' })
  await reactStore.resume(feedback)
}

// Watch for phase changes
watch(() => reactStore.currentPhase, (phase) => {
  // 중간 단계(tool/reasoning)는 디버그 모드에서만 채팅에 남긴다.
  if (!debugRawXml.value) return
  if (phase === 'idle') {
    return
  }

  const step = reactStore.currentIteration
  const data = reactStore.currentPhaseData

  if (phase === 'acting' && data?.tool_name) {
    // validate_sql 과정은 채팅 내역에 남길 필요 없음
    if (data.tool_name === 'validate_sql') return
    addMessage({
      type: 'tool',
      content: '',
      step,
      toolName: data.tool_name,
      params: data.tool_parameters ? formatParams(data.tool_parameters) : undefined,
      isExecuting: true
    })
  } else if (phase === 'reasoning') {
    // reasoning은 토큰 스트림 대신 section_delta로 실시간 누적되므로, 빈 메시지만 먼저 두고 이후 UI에서 live 패널로 노출
    // (추가로 필요하면 chatMessages에 reasoning 요약을 넣는 방식으로 확장 가능)
  } else if (phase === 'observing' && data?.tool_result_preview) {
    // 마지막 tool 메시지 업데이트
    const toolMsg = [...chatMessages.value].reverse().find(
      m => m.type === 'tool' && m.step === step
    )
    if (toolMsg) {
      updateMessage(toolMsg.id, {
        result: data.tool_result_preview,
        isExecuting: false
      })
    }
  }
}, { immediate: true })

// Watch for streaming text (실시간 LLM 토큰)
watch(() => reactStore.streamingText, () => {
  scrollToBottom()
})

// Watch for live section deltas (섹션별 스트리밍)
watch(() => reactStore.liveByIteration, () => {
  scrollToBottom()
}, { deep: true })

// 실행 종료 시 진행 카드 접기
watch(() => reactStore.status, (s, prev) => {
  if (s === 'running' && prev !== 'running') {
    // running 시작 시 기본으로 열어둠
    progressExpanded.value = true
    return
  }
  if (s !== 'running') {
    progressExpanded.value = false
  }
})

// 이전 iteration 저장 (스텝 변경 감지용)
const previousIterationRef = ref(0)

// Watch for iteration changes - 이전 스텝의 추론 내용을 chatMessages에 저장
watch(() => reactStore.currentIteration, (newIteration) => {
  // validate_sql 등 중간 reasoning은 일반 UX에서는 채팅에 남기지 않는다.
  if (!debugRawXml.value) return
  const prevIteration = previousIterationRef.value

  if (newIteration > prevIteration && prevIteration > 0) {
    // 이전 스텝의 추론 내용을 가져와서 저장
    const prevLive = reactStore.liveByIteration[prevIteration]
    const reasoning = prevLive?.sections?.reasoning || ''

    if (reasoning) {
      // 이미 해당 스텝의 reasoning이 있는지 확인
      const existingReasoning = chatMessages.value.find(
        m => m.type === 'reasoning' && m.step === prevIteration
      )
      if (!existingReasoning) {
        // 도구 정보 수집
        const toolName = prevLive?.sections?.['tool_call.tool_name'] || ''
        const toolParams = prevLive?.sections?.['tool_call.parameters'] || ''

        // validate_sql 과정은 채팅 내역에 남길 필요 없음
        if (toolName === 'validate_sql') return

        // 해당 스텝의 tool 메시지에서 result 가져오기
        const toolMsg = chatMessages.value.find(
          m => m.type === 'tool' && m.step === prevIteration
        )

        addMessage({
          type: 'reasoning',
          content: reasoning,
          step: prevIteration,
          sql: prevLive?.sections?.partial_sql || undefined,
          toolInfo: toolName ? {
            name: toolName,
            params: toolParams,
            result: toolMsg?.result
          } : undefined,
          isStreaming: false
        })
      }
    }
  }
  previousIterationRef.value = newIteration
})

// Watch for steps completion - 완료된 스텝의 reasoning 저장 (백업)
watch(() => reactStore.steps, (steps) => {
  // validate_sql 등 중간 step은 디버그 모드에서만 노출
  if (!debugRawXml.value) return
  steps.forEach(step => {
    if (!step.reasoning) return
    if (step.tool_call?.name === 'validate_sql') return

    const existingReasoning = chatMessages.value.find(
      m => m.type === 'reasoning' && m.step === step.iteration
    )
    // reasoning이 없으면 추가
    if (!existingReasoning) {
      addMessage({
        type: 'reasoning',
        content: step.reasoning,
        step: step.iteration,
        sql: step.partial_sql || undefined,
        toolInfo: step.tool_call?.name ? {
          name: step.tool_call.name,
          params: JSON.stringify(step.tool_call.parameters),
          result: step.tool_result || undefined
        } : undefined,
        isStreaming: false
      })
    }
  })
}, { deep: true })

// Watch for ask_user
watch(() => reactStore.questionToUser, (question) => {
  if (question) {
    addMessage({
      type: 'question',
      content: question,
      isStreaming: true
    })
  }
})

// Watch for completion (ReAct)
watch(() => reactStore.status, (status) => {
  if (mode.value !== 'react') return

  if (status === 'completed') {
    if (reactStore.finalSql) {
      addMessage({
        type: 'sql',
        content: reactStore.finalSql
      })
    }

    if (reactStore.executionResult) {
      addMessage({
        type: 'result',
        content: '',
        rowCount: reactStore.executionResult.row_count,
        execTime: Math.round(reactStore.executionResult.execution_time_ms),
        data: reactStore.executionResult,
        sql: reactStore.finalSql || undefined,
        question: reactStore.currentQuestion,
        feedbackRequired: reactStore.feedbackRequired,
        fromCache: reactStore.fromCache
      })
    }
  } else if (status === 'error' && reactStore.error) {
    addMessage({
      type: 'error',
      content: reactStore.error
    })
  }
})

// 히스토리 항목 선택 핸들러
function handleHistorySelect(item: QueryHistoryItem) {
  // 선택한 히스토리의 질문과 결과를 표시
  chatMessages.value = []

  // 사용자 질문 추가
  addMessage({ type: 'user', content: item.question })

  // SQL이 있으면 표시
  if (item.final_sql) {
    addMessage({ type: 'sql', content: item.final_sql })
  }

  // 실행 결과가 있으면 표시
  if (item.execution_result) {
    addMessage({
      type: 'result',
      content: '',
      rowCount: item.execution_result.row_count,
      execTime: Math.round(item.execution_result.execution_time_ms),
      data: item.execution_result,
      sql: item.final_sql || undefined,  // OLAP 버튼용 SQL
      question: item.question  // OLAP 버튼용 질문
    })
  }

  // 에러가 있으면 표시
  if (item.status === 'error' && item.error_message) {
    addMessage({ type: 'error', content: item.error_message })
  }
}

// 쿼리 완료 시 히스토리 자동 저장
let saveStartTime = 0

watch(() => reactStore.status, async (status, oldStatus) => {
  // running 시작 시 시간 기록
  if (status === 'running' && oldStatus !== 'running') {
    saveStartTime = Date.now()
  }

  // 완료 또는 에러 시 저장
  if (status === 'completed' || status === 'error') {
    const executionTimeMs = Date.now() - saveStartTime

    try {
      await historyStore.saveToHistory({
        question: reactStore.currentQuestion,
        final_sql: reactStore.finalSql,
        validated_sql: reactStore.validatedSql,
        execution_result: reactStore.executionResult,
        row_count: reactStore.executionResult?.row_count ?? null,
        status: status === 'completed' ? 'completed' : 'error',
        error_message: reactStore.error,
        steps_count: reactStore.steps.length,
        execution_time_ms: executionTimeMs
      })
    } catch (error: unknown) {
      addMessage({
        type: 'system',
        content: error instanceof Error
          ? `쿼리는 완료됐지만 히스토리에 저장하지 못했습니다: ${error.message}`
          : '쿼리는 완료됐지만 히스토리에 저장하지 못했습니다.',
      })
    }
  }
})

onMounted(async () => {
  inputRef.value?.focus()

  // 데이터소스 자동 로드 및 선택: DataSources 탭을 거치지 않고
  // Text2SQL 탭에 직접 진입해도 정상 동작하도록 보장
  if (!datasourcesStore.hasDatasources) {
    await datasourcesStore.fetchDatasources()
  }
  if (!datasourcesStore.selectedDatasource && datasourcesStore.datasources.length > 0) {
    await datasourcesStore.selectDatasource(datasourcesStore.datasources[0])
  }

  // 로컬 스토리지에서 최근 쿼리 불러오기
  if (!props.embedded) {
    loadRecentQueries()
  }

  // 임베드 모드에서 초기 쿼리 자동 실행
  if (props.embedded && props.initialQuery && props.autoExecute) {
    inputText.value = props.initialQuery
    timers.schedule('auto-submit', () => {
      handleSubmit()
    }, 100)
    return
  }

  // 상단 검색창에서 전달된 자연어 질문 처리
  const pendingSearch = featureNavigation.consume<{ query: string }>('text2sql')
  if (pendingSearch) {
    inputText.value = pendingSearch.query
    // 약간의 딜레이 후 자동 검색 시작
    timers.schedule('auto-submit', () => {
      handleSubmit()
    }, 100)
  }
})

// 탭 전환 시에도 pendingNLSearch 체크
watch(featureNavigation.activeFeatureId, (tab) => {
  if (tab === 'text2sql') {
    const pendingSearch = featureNavigation.consume<{ query: string }>('text2sql')
    if (pendingSearch) {
      inputText.value = pendingSearch.query
      timers.schedule('auto-submit', () => {
        handleSubmit()
      }, 100)
    }
  }
})
</script>

<style scoped lang="scss" src="./Text2SqlTab.scss"></style>
