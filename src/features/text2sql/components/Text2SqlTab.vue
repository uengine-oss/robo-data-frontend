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

          <!-- 기본 예시 -->
          <div class="examples">
            <p class="examples-label">예시 질문</p>
            <button v-for="example in defaultExamples" :key="example" class="example-btn" @click="setQuestion(example)">
              {{ example }}
            </button>
          </div>
        </div>

        <!-- 채팅 메시지들 (윈도우링 적용 - 최근 N개만 렌더링) -->
        <div v-if="hiddenMessageCount > 0" class="hidden-messages-indicator" @click="showAllMessages = true">
          <span>{{ hiddenMessageCount }}개의 이전 메시지 보기...</span>
        </div>

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
                      @click="submitFeedbackFromMsg(msg, true)">
                      맞아요
                    </button>
                    <button class="feedback-btn reject" :disabled="isFeedbackDisabled(msg)"
                      @click="submitFeedbackFromMsg(msg, false)">
                      틀려요
                    </button>
                  </template>
                  <button v-if="getResultSql(msg)" class="ontology-export-btn" @click="exportToOntologyFromMsg(msg)">
                    🧩 온톨로지
                  </button>
                  <button v-if="getResultSql(msg)" class="olap-export-btn" @click="exportToOlapFromMsg(msg)">
                    📊 OLAP
                  </button>
                  <button v-if="getResultSql(msg)" class="ontology-instance-btn" @click="openOntologyInstanceModal(msg)">
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
        <div class="settings-toggle" @click="showSettings = !showSettings">
          <IconSettings :size="12" />
          <span>고급 설정</span>
          <IconChevronDown :size="12" :class="{ rotated: showSettings }" />
        </div>

        <transition name="slide">
          <div v-if="showSettings" class="settings-panel">
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
  
  <!-- 온톨로지 인스턴스 생성 모달 -->
  <Teleport to="body">
    <div v-if="showOntologyModal" class="ontology-modal-overlay" @click.self="showOntologyModal = false">
      <div class="ontology-modal">
        <div class="modal-header">
          <h3>🔮 감시 에이전트 등록</h3>
          <button class="close-btn" @click="showOntologyModal = false">✕</button>
        </div>
        
        <div class="modal-body">
          <!-- 쿼리 정보 -->
          <div class="info-section">
            <div class="info-row">
              <span class="info-label">질문:</span>
              <span class="info-value">{{ ontologyModalData?.question }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">결과 행 수:</span>
              <span class="info-value">{{ ontologyModalData?.rowCount }}개</span>
            </div>
          </div>
          
          <!-- 온톨로지 스키마 선택 -->
          <div class="form-section">
            <label>온톨로지 스키마</label>
            <select v-model="selectedSchemaId">
              <option value="">스키마 선택...</option>
              <option v-for="schema in ontologySchemas" :key="schema.id" :value="schema.id">
                {{ schema.name }} ({{ schema.nodeCount }}개 노드)
              </option>
            </select>
          </div>
          
          <!-- 노드 타입 선택 -->
          <div class="form-section" v-if="selectedSchemaId">
            <label>노드 타입 (인스턴스 종류)</label>
            <select v-model="selectedNodeType">
              <option value="">노드 타입 선택...</option>
              <option v-for="node in availableNodeTypes" :key="node.id" :value="node.name">
                {{ node.name }} - {{ node.description }}
              </option>
            </select>
          </div>
          
          <!-- 컬럼 매핑 -->
          <div class="form-section" v-if="selectedNodeType && ontologyModalData?.columns.length">
            <label>ID 컬럼 (인스턴스 식별자)</label>
            <select v-model="selectedIdColumn">
              <option value="">컬럼 선택...</option>
              <option v-for="col in ontologyModalData.columns" :key="col" :value="col">
                {{ col }}
              </option>
            </select>
          </div>
          
          <div class="form-section" v-if="selectedIdColumn">
            <label>이름 컬럼 (표시 이름)</label>
            <select v-model="selectedNameColumn">
              <option value="">ID 컬럼과 동일</option>
              <option v-for="col in ontologyModalData?.columns" :key="col" :value="col">
                {{ col }}
              </option>
            </select>
          </div>
          
          <!-- Materialized View 옵션 -->
          <div class="form-section mv-section">
            <label class="checkbox-label">
              <input type="checkbox" v-model="createMaterializedView" />
              <span>Materialized View 생성 (데이터 동기화용)</span>
            </label>
            <input 
              v-if="createMaterializedView"
              v-model="mvViewName"
              type="text"
              placeholder="뷰 이름 (예: mv_plant_list)"
              class="mv-name-input"
            />
            <p class="hint" v-if="createMaterializedView">
              MV를 생성하면 정기적으로 데이터를 동기화하여 인스턴스를 최신 상태로 유지할 수 있습니다.
            </p>
          </div>
          
          <!-- 샘플 데이터 미리보기 -->
          <div class="sample-preview" v-if="ontologyModalData?.sampleData?.length">
            <label>샘플 데이터 (상위 5개)</label>
            <div class="sample-table-wrapper">
              <table class="sample-table">
                <thead>
                  <tr>
                    <th v-for="col in ontologyModalData.columns" :key="col">{{ col }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, idx) in ontologyModalData.sampleData" :key="idx">
                    <td v-for="col in ontologyModalData.columns" :key="col">{{ row[col] }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
        
        <div class="modal-footer">
          <button class="cancel-btn" @click="showOntologyModal = false">취소</button>
          <button 
            class="create-btn" 
            @click="createOntologyInstances"
            :disabled="!selectedSchemaId || !selectedNodeType || !selectedIdColumn || isCreatingInstances"
          >
            <span v-if="isCreatingInstances">생성 중...</span>
            <span v-else>🔮 인스턴스 생성</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useReactStore, useHistoryStore, type QueryHistoryItem } from '@/features/text2sql/text2sql'
import { useSessionStore } from '@/shared/stores/session'
import { useDatasourcesStore } from '@/features/datasources/datasources'
import ResultTable from './ResultTable.vue'
import HistoryPanel from './HistoryPanel.vue'
import DirectSqlInput from './DirectSqlInput.vue'
import type { ReactExecutionResult } from '@/types'
import { buildSqlLineDiff, type PreviousSqlLine, type SqlDiffLine } from '@/utils/sqlLineDiff'
import { getText2SqlStageLabelKo } from '@/utils/text2sqlProgress'
import { text2sqlApi } from '@/features/text2sql/api'
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
const sessionStore = useSessionStore()
const datasourcesStore = useDatasourcesStore()

// 모드: 'react' | 'direct'
type QueryMode = 'react' | 'direct'
const mode = ref<QueryMode>('react')

const modeOptions: { value: QueryMode; label: string; icon: string; desc: string }[] = [
  { value: 'react', label: '자연어 검색', icon: '🧠', desc: '정밀한 AI 분석' },
  { value: 'direct', label: 'SQL', icon: '📝', desc: '직접 입력' },
]

// 복잡한 쿼리 판별 (1개 이상 JOIN, 서브쿼리 등)
function isComplexQuery(sql: string | null): boolean {
  if (!sql) return false
  const upperSql = sql.toUpperCase()

  const joinCount = (upperSql.match(/\bJOIN\b/g) || []).length

  return (
    joinCount >= 1 ||  // 1개 이상 JOIN
    (upperSql.match(/SELECT/g) || []).length > 1 || // 서브쿼리
    upperSql.includes('GROUP BY') ||  // 집계 쿼리
    upperSql.includes('HAVING') ||
    upperSql.includes('UNION') ||
    upperSql.includes('WITH ')  // CTE
  )
}

// OLAP으로 내보내기
function exportToOlap() {
  if (!reactStore.finalSql) return
  sessionStore.navigateToOlapWithSQL(reactStore.currentQuestion, reactStore.finalSql)
}

// 메시지에서 SQL 가져오기 (store 또는 msg.sql)
function getResultSql(msg: ChatMessage): string | null {
  return msg.sql || reactStore.finalSql || null
}

// 메시지에서 OLAP으로 내보내기
function exportToOlapFromMsg(msg: ChatMessage) {
  const sql = getResultSql(msg)
  const question = msg.question || reactStore.currentQuestion

  console.log('[OLAP Export from Result] msg:', msg)
  console.log('[OLAP Export from Result] sql:', sql)
  console.log('[OLAP Export from Result] question:', question)

  if (!sql) {
    alert('SQL 쿼리가 없습니다.')
    return
  }
  sessionStore.navigateToOlapWithSQL(question, sql)
}

// 메시지에서 온톨로지(도메인 스키마)로 내보내기
function exportToOntologyFromMsg(msg: ChatMessage) {
  const sql = getResultSql(msg)
  const question = msg.question || reactStore.currentQuestion

  console.log('[Ontology Export] sql:', sql)
  console.log('[Ontology Export] question:', question)

  if (!sql) {
    alert('SQL 쿼리가 없습니다.')
    return
  }
  sessionStore.navigateToOntologyWithSQL(question, sql)
}

// ============================================================================
// Feedback (정답/오답) - 오염 방지 목적
// ============================================================================

const feedbackSubmitting = ref(false)
const submittedFeedbackKeys = ref<Set<string>>(new Set())

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
  if (feedbackSubmitting.value) return true
  return submittedFeedbackKeys.value.has(_feedbackKey(msg))
}

async function submitFeedbackFromMsg(msg: ChatMessage, approved: boolean) {
  const sql = getResultSql(msg)
  const q = (msg.question || reactStore.currentQuestion || '').trim()

  if (!sql) {
    alert('SQL 쿼리가 없습니다.')
    return
  }

  const key = _feedbackKey(msg)
  if (submittedFeedbackKeys.value.has(key)) return

  let notes: string | undefined
  if (!approved) {
    const v = window.prompt('틀린 이유/추가 정보를 간단히 적어주세요 (선택)')
    notes = v !== null ? v : undefined
  }

  // Optimistic UI: 클릭 즉시 버튼 숨김(실패 시 롤백)
  submittedFeedbackKeys.value.add(key)
  feedbackSubmitting.value = true
  try {
    await text2sqlApi.submitFeedback({
      question: q || undefined,
      conversation_state: reactStore.conversationState || undefined,
      original_sql: sql,
      rating: approved ? 5 : 1,
      notes: notes || undefined,
      approved,
      source: 'react_ui'
    })
    addMessage({
      type: 'system',
      content: approved ? '피드백(맞아요)이 저장되었습니다.' : '피드백(틀려요)이 저장되었습니다.'
    })
  } catch (e) {
    console.error('Failed to submit feedback:', e)
    submittedFeedbackKeys.value.delete(key)
    alert('피드백 저장에 실패했습니다.')
  } finally {
    feedbackSubmitting.value = false
  }
}

// ========================================================================
// 온톨로지 인스턴스 생성 (감시 에이전트)
// ========================================================================
const showOntologyModal = ref(false)
const ontologyModalData = ref<{
  sql: string
  question: string
  rowCount: number
  columns: string[]
  sampleData: any[]
} | null>(null)

const ontologySchemas = ref<any[]>([])
const selectedSchemaId = ref('')
const selectedNodeType = ref('')
const selectedIdColumn = ref('')
const selectedNameColumn = ref('')
const createMaterializedView = ref(true)
const mvViewName = ref('')
const isCreatingInstances = ref(false)

// 온톨로지 인스턴스 모달 열기
async function openOntologyInstanceModal(msg: ChatMessage) {
  const sql = getResultSql(msg)
  if (!sql || !msg.data) {
    alert('SQL 쿼리 또는 결과 데이터가 없습니다.')
    return
  }

  // 결과에서 컬럼 추출
  const columns = msg.data.columns || []
  const sampleData = (msg.data.rows || []).slice(0, 5)

  ontologyModalData.value = {
    sql,
    question: msg.question || reactStore.currentQuestion,
    rowCount: msg.rowCount || 0,
    columns,
    sampleData
  }

  // 스키마 목록 로드
  try {
    const response = await fetch('/api/gateway/ontology/schemas')
    if (response.ok) {
      const data = await response.json()
      ontologySchemas.value = data.schemas || []
    }
  } catch (err) {
    console.error('스키마 목록 로드 실패:', err)
  }

  // 기본 뷰 이름 생성
  mvViewName.value = `mv_${Date.now()}`

  showOntologyModal.value = true
}

// 선택된 스키마의 노드 타입 목록
const availableNodeTypes = ref<any[]>([])

// 스키마 선택 시 상세 정보 로드
watch(selectedSchemaId, async (schemaId) => {
  if (!schemaId) {
    availableNodeTypes.value = []
    return
  }

  try {
    const response = await fetch(`/api/gateway/ontology/schemas/${schemaId}`)
    if (response.ok) {
      const schema = await response.json()
      availableNodeTypes.value = schema.nodes || []
    }
  } catch (err) {
    console.error('스키마 상세 로드 실패:', err)
    availableNodeTypes.value = []
  }
})

// 온톨로지 인스턴스 생성 실행
async function createOntologyInstances() {
  if (!ontologyModalData.value || !selectedNodeType.value || !selectedIdColumn.value) {
    alert('필수 항목을 선택해주세요.')
    return
  }

  isCreatingInstances.value = true

  try {
    const selectedDs = datasourcesStore.selectedDatasource
    if (!selectedDs?.name) {
      throw new Error('데이터소스를 선택해주세요')
    }
    // 1. Materialized View 생성 (선택된 경우)
    let viewFullName = null
    if (createMaterializedView.value && mvViewName.value) {
      const mvResponse = await fetch('/api/gateway/text2sql/direct-sql/materialized-view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datasource: selectedDs.name,
          view_name: mvViewName.value,
          sql_query: ontologyModalData.value.sql,
          schema_name: 'public',
          description: `온톨로지 인스턴스 동기화: ${selectedNodeType.value}`,
          refresh_on_create: true
        })
      })

      if (mvResponse.ok) {
        const mvData = await mvResponse.json()
        viewFullName = mvData.full_name
        console.log('Materialized View 생성됨:', viewFullName)
      }
    }

    // 2. Neo4j에 온톨로지 인스턴스 생성
    const instanceResponse = await fetch('/api/gateway/ontology/instances/bulk-create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schema_id: selectedSchemaId.value,
        node_type: selectedNodeType.value,
        sql_query: ontologyModalData.value.sql,
        id_column: selectedIdColumn.value,
        name_column: selectedNameColumn.value || selectedIdColumn.value,
        materialized_view: viewFullName,
        source_question: ontologyModalData.value.question
      })
    })

    if (instanceResponse.ok) {
      const result = await instanceResponse.json()
      alert(`${result.created_count || 0}개의 인스턴스가 생성되었습니다.`)
      showOntologyModal.value = false
    } else {
      const errData = await instanceResponse.json()
      alert(`인스턴스 생성 실패: ${errData.detail || '알 수 없는 오류'}`)
    }
  } catch (err) {
    console.error('온톨로지 인스턴스 생성 실패:', err)
    alert('인스턴스 생성 중 오류가 발생했습니다.')
  } finally {
    isCreatingInstances.value = false
  }
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

const visibleMessages = computed(() => {
  let messages = chatMessages.value

  // tool, thinking 메시지는 항상 숨김 (reasoning + SQL만 표시)
  messages = messages.filter(msg => {
    // tool과 thinking 타입은 제외
    if (msg.type === 'tool' || msg.type === 'thinking') {
      return false
    }
    return true
  })

  if (showAllMessages.value || messages.length <= MAX_VISIBLE_MESSAGES) {
    return messages
  }
  // 최근 N개만 표시
  return messages.slice(-MAX_VISIBLE_MESSAGES)
})

const hiddenMessageCount = computed(() => {
  if (showAllMessages.value) return 0
  return Math.max(0, chatMessages.value.length - MAX_VISIBLE_MESSAGES)
})

// 파라미터 축소 표시
function truncateParams(params: string, maxLen = 80): string {
  if (params.length <= maxLen) return params
  return params.slice(0, maxLen) + '...'
}

// Chat messages
const chatMessages = ref<ChatMessage[]>([])
let messageIdCounter = 0

// Example queries (기본 예시)
const defaultExamples = [
  '회의실 예약 현황을 보여줘',
  '오늘 예약된 회의 목록',
  '가장 많이 사용되는 회의실 Top 5'
]

// 로컬 스토리지에서 최근 쿼리 불러오기
const RECENT_QUERIES_KEY = 'text2sql_recent_queries'
const MAX_RECENT_QUERIES = 10

const recentQueries = ref<string[]>([])

function loadRecentQueries() {
  try {
    const stored = localStorage.getItem(RECENT_QUERIES_KEY)
    if (stored) {
      recentQueries.value = JSON.parse(stored)
    }
  } catch (e) {
    console.warn('Failed to load recent queries:', e)
  }
}

function saveRecentQuery(query: string) {
  if (!query || query.trim().length < 3) return

  const trimmed = query.trim()
  // 중복 제거
  const filtered = recentQueries.value.filter(q => q !== trimmed)
  // 맨 앞에 추가
  filtered.unshift(trimmed)
  // 최대 개수 제한
  recentQueries.value = filtered.slice(0, MAX_RECENT_QUERIES)

  try {
    localStorage.setItem(RECENT_QUERIES_KEY, JSON.stringify(recentQueries.value))
  } catch (e) {
    console.warn('Failed to save recent queries:', e)
  }
}

// 표시할 예시 쿼리 (최근 쿼리 우선, 없으면 기본 예시)
const exampleQueries = computed(() => {
  if (recentQueries.value.length > 0) {
    return recentQueries.value.slice(0, 5)
  }
  return defaultExamples
})

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
const diffTimers = ref<number[]>([])

function clearDiffTimers() {
  diffTimers.value.forEach(t => window.clearTimeout(t))
  diffTimers.value = []
}

watch(
  () => displaySql.value,
  (newSql) => {
    clearDiffTimers()

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
    diffTimers.value.push(window.setTimeout(() => {
      sqlDisplayLines.value = sqlDisplayLines.value.filter(l => l.status !== 'removed')
    }, 1000))

    // added/modified 하이라이트를 잠시 후 해제
    diffTimers.value.push(window.setTimeout(() => {
      sqlDisplayLines.value = sqlDisplayLines.value.map(l => ({
        ...l,
        status: l.status === 'added' || l.status === 'modified' ? 'unchanged' : l.status
      }))
    }, 2500))
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  clearDiffTimers()
})

// DOM 최적화: 라이브 스트리밍 데이터 (간소화)
const liveCurrent = computed(() => reactStore.liveByIteration[reactStore.currentIteration] ?? null)
const liveReasoning = computed(() => liveCurrent.value?.sections?.reasoning ?? '')
const livePartialSql = computed(() => liveCurrent.value?.sections?.partial_sql ?? '')
const liveToolName = computed(() => liveCurrent.value?.sections?.['tool_call.tool_name'] ?? '')
const liveToolParams = computed(() => liveCurrent.value?.sections?.['tool_call.parameters'] ?? '')

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

        console.log(`[Reasoning] Adding step ${prevIteration}:`, { reasoning: reasoning.slice(0, 50), toolName })

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
      console.log(`[Reasoning from steps] Adding step ${step.iteration}`)
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
    setTimeout(() => {
      handleSubmit()
    }, 100)
    return
  }
  
  // 상단 검색창에서 전달된 자연어 질문 처리
  const pendingQuery = sessionStore.consumeNLSearch()
  if (pendingQuery) {
    inputText.value = pendingQuery
    // 약간의 딜레이 후 자동 검색 시작
    setTimeout(() => {
      handleSubmit()
    }, 100)
  }
})

// 탭 전환 시에도 pendingNLSearch 체크
watch(() => sessionStore.activeTab, (tab) => {
  if (tab === 'text2sql') {
    const pendingQuery = sessionStore.consumeNLSearch()
    if (pendingQuery) {
      inputText.value = pendingQuery
      setTimeout(() => {
        handleSubmit()
      }, 100)
    }
  }
})
</script>

<style scoped lang="scss">
// ═══════════════════════════════════════════════════════════════
// Design System Variables - Cohesive Theme (using CSS vars)
// ═══════════════════════════════════════════════════════════════
$primary-gradient: linear-gradient(135deg, #00d4aa 0%, #00a8cc 50%, #7c3aed 100%);
$accent-glow: rgba(0, 212, 170, 0.4);
$card-glass: var(--chat-card-bg, rgba(255, 255, 255, 0.03));
$card-glass-hover: var(--chat-card-hover, rgba(255, 255, 255, 0.06));
$border-subtle: var(--chat-border, rgba(255, 255, 255, 0.08));
$border-active: rgba(0, 212, 170, 0.3);
$text-primary: var(--color-text-bright, #f0f4f8);
$text-secondary: var(--color-text-light, #94a3b8);
$text-muted: var(--color-text-muted, #64748b);

// Unified Badge Colors
$badge-reasoning: #a78bfa;
$badge-tool: #38bdf8;
$badge-success: #34d399;
$badge-warning: #fbbf24;
$badge-error: #f87171;

.text2sql-tab {
  display: flex;
  height: 100%;
  background: var(--color-bg);
  overflow: hidden;
  font-family: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  color: var(--color-text);
  
  // 임베드 모드 스타일
  &.embedded {
    .top-controls {
      display: none;  // 모드 선택기 숨김
    }
    
    .sql-side-panel {
      display: none;  // 우측 SQL 패널 숨김
    }
    
    .settings-toggle,
    .settings-panel {
      display: none;  // 고급 설정 숨김
    }
  }
}

// Direct SQL 전체 화면
.direct-sql-full {
  flex: 1;
  display: flex;
  flex-direction: column;
}

// ═══════════════════════════════════════════════════════════════
// Top Controls (우상단 컨트롤 영역)
// ═══════════════════════════════════════════════════════════════
.top-controls {
  position: absolute;
  top: 12px;
  right: 24px;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 12px;
}

.new-query-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  border-radius: 20px;
  color: white;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);

  .btn-icon {
    font-size: 14px;
  }

  .btn-label {
    font-size: 12px;
  }

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4);
  }

  &:active {
    transform: translateY(0);
  }
}

.mode-selector-container {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  background: var(--color-bg-secondary);
  // backdrop-filter 제거 - 성능 최적화
  border: 1px solid var(--color-border);
  border-radius: 10px;
  box-shadow: var(--shadow-md);
}

.mode-option {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  background: transparent;
  border: none;
  border-radius: 7px;
  color: var(--color-text-muted);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;

  .opt-icon {
    font-size: 12px;
  }

  .opt-label {
    font-size: 11px;
  }

  &:hover {
    background: var(--color-bg-hover);
    color: var(--color-text);
  }

  &.active {
    background: var(--color-accent);
    color: white;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);

    .opt-icon {
      filter: drop-shadow(0 0 3px rgba(0, 212, 170, 0.5));
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Chat Container
// ═══════════════════════════════════════════════════════════════
.chat-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  position: relative;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 600px;
    height: 400px;
    background: radial-gradient(ellipse, rgba(0, 212, 170, 0.08) 0%, transparent 70%);
    pointer-events: none;
    z-index: 0;
  }
}

// ═══════════════════════════════════════════════════════════════
// Messages Area
// ═══════════════════════════════════════════════════════════════
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 32px;
  padding-top: 56px; // 모드 스위치 공간 확보
  display: flex;
  flex-direction: column;
  gap: 20px;
  position: relative;
  z-index: 1;
  // 렌더링 성능 최적화
  contain: layout style;
  will-change: scroll-position;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;

    &:hover {
      background: rgba(255, 255, 255, 0.2);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Welcome Message
// ═══════════════════════════════════════════════════════════════
@keyframes gradient-flow {
  0% {
    background-position: 0% 50%;
  }

  50% {
    background-position: 100% 50%;
  }

  100% {
    background-position: 0% 50%;
  }
}

.welcome-message {
  text-align: center;
  padding: 100px 32px 60px;
  animation: fadeInUp 0.6s ease-out;

  .gradient-title {
    margin: 0 0 16px 0;
    font-size: 36px;
    font-weight: 600;
    letter-spacing: -0.03em;
    line-height: 1.3;
    background: linear-gradient(90deg,
        #667eea 0%,
        #764ba2 15%,
        #f093fb 30%,
        #f5576c 45%,
        #fda085 60%,
        #f6d365 75%,
        #667eea 100%);
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    animation: gradient-flow 4s ease infinite;
  }

  .subtitle {
    margin: 0 0 48px 0;
    font-size: 16px;
    color: var(--color-text-muted);
    font-weight: 400;
    letter-spacing: 0.01em;
  }

  .examples {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    justify-content: center;
    align-items: center;
    margin-bottom: 16px;
    flex-direction: column;
  }

  .examples-label {
    font-size: 11px;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 8px;
    width: 100%;
    text-align: center;
  }

  .examples.recent .example-btn {
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(168, 85, 247, 0.15));
    border-color: rgba(99, 102, 241, 0.3);
  }

  .examples>div {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    justify-content: center;
  }

  .example-btn {
    padding: 10px 20px;
    background: var(--chat-card-bg);
    border: 1px solid var(--color-border);
    border-radius: 24px;
    color: var(--color-text);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: var(--shadow-sm);

    &:hover {
      background: var(--chat-card-hover);
      border-color: var(--color-accent);
      box-shadow: var(--shadow-md);
      transform: translateY(-2px);
    }
  }
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

// ═══════════════════════════════════════════════════════════════
// Chat Messages - Unified Card System
// ═══════════════════════════════════════════════════════════════
.chat-message {
  display: flex;
  gap: 14px;
  max-width: 88%;
  animation: messageSlide 0.35s cubic-bezier(0.4, 0, 0.2, 1);

  &.user {
    align-self: flex-end;
    flex-direction: row-reverse;

    .message-content {
      background: var(--chat-user-msg-bg);
      border: none;
      border-radius: 20px 20px 6px 20px;
      box-shadow: 0 4px 24px rgba(0, 212, 170, 0.25);
    }

    .message-text {
      color: var(--chat-user-msg-text);
      font-weight: 500;
    }
  }

  &.ai,
  &.thinking,
  &.reasoning,
  &.tool,
  &.tool,
  &.question,
  &.sql,
  &.result {
    align-self: flex-start;

    .message-content {
      background: var(--chat-msg-bg);
      border: 1px solid var(--chat-msg-border);
      border-radius: 6px 20px 20px 20px;
      box-shadow: var(--chat-msg-shadow);
    }
  }

  &.error {
    align-self: flex-start;

    .message-content {
      background: rgba(248, 113, 113, 0.08);
      border: 1px solid rgba(248, 113, 113, 0.3);
      border-radius: 6px 20px 20px 20px;
    }
  }

  &.live {
    max-width: 95%;

    .message-content {
      border-color: $border-active;
      box-shadow: 0 4px 32px rgba(0, 212, 170, 0.12);
    }
  }

  &.progress {
    // UX: keep the progress card width stable across stages.
    // Otherwise, the bubble width changes with chip/headline text length.
    align-self: stretch;
    width: 66%;
    max-width: 66%;

    .message-content {
      border-color: rgba(56, 189, 248, 0.25);
      box-shadow: 0 4px 24px rgba(56, 189, 248, 0.08);
    }
  }
}

@keyframes messageSlide {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.98);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

// ═══════════════════════════════════════════════════════════════
// Message Avatar
// ═══════════════════════════════════════════════════════════════
.message-avatar {
  width: 40px;
  height: 40px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
  transition: transform 0.2s ease;

  &.user {
    background: linear-gradient(135deg, #00d4aa 0%, #00a8cc 100%);
    box-shadow: 0 4px 16px rgba(0, 212, 170, 0.3);
  }

  &.ai {
    background: var(--chat-msg-bg);
    border: 1px solid var(--chat-msg-border);
    box-shadow: var(--chat-msg-shadow);
  }

  &.error {
    background: rgba(248, 113, 113, 0.15);
    border: 1px solid rgba(248, 113, 113, 0.3);
  }
}

// ═══════════════════════════════════════════════════════════════
// Message Content
// ═══════════════════════════════════════════════════════════════
.message-content {
  padding: 16px 20px;
  min-width: 120px;
}

.progress-content {
  width: 100%;
}

.progress-headline {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
}

.progress-percent {
  font-size: 11px;
  color: var(--color-text-muted);
  font-family: 'JetBrains Mono', monospace;
}

.progress-bar {
  width: 100%;
  height: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--color-border);
  overflow: hidden;
  margin-top: 10px;
}

.progress-bar-fill {
  height: 100%;
  width: 0%;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(0, 212, 170, 0.9), rgba(56, 189, 248, 0.9));
  transition: width 0.25s ease;
}

.progress-toggle-btn {
  margin-left: auto;
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-text-muted);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    color: var(--color-text);
  }
}

.progress-details {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.progress-detail-chip {
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(56, 189, 248, 0.08);
  border: 1px solid rgba(56, 189, 248, 0.18);
  color: #38bdf8;
}

.progress-counts-more {
  margin-top: 10px;
}

.progress-counts-summary {
  cursor: pointer;
  font-size: 11px;
  color: var(--color-text-muted);
  user-select: none;
  outline: none;

  &:hover {
    color: var(--color-text);
  }
}

.progress-counts-summary::-webkit-details-marker {
  display: none;
}

.progress-details-all {
  margin-top: 8px;
}

.progress-expanded {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.progress-stages {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.progress-stage-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
}

.stage-name {
  color: var(--color-text);
  flex: 1;
  min-width: 0;
}

.stage-status {
  font-size: 10px;
  padding: 3px 8px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  color: var(--color-text-muted);

  &.start {
    background: rgba(251, 191, 36, 0.10);
    border-color: rgba(251, 191, 36, 0.25);
    color: #fbbf24;
  }

  &.done {
    background: rgba(52, 211, 153, 0.10);
    border-color: rgba(52, 211, 153, 0.25);
    color: #34d399;
  }

  &.error {
    background: rgba(248, 113, 113, 0.10);
    border-color: rgba(248, 113, 113, 0.25);
    color: #f87171;
  }
}

.stage-elapsed {
  font-size: 11px;
  color: var(--color-text-muted);
  font-family: 'JetBrains Mono', monospace;
}


.live-content {
  width: 100%;
}

.message-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

// ═══════════════════════════════════════════════════════════════
// Unified Badge System
// ═══════════════════════════════════════════════════════════════
.step-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 4px 10px;
  background: linear-gradient(135deg, rgba(0, 212, 170, 0.2) 0%, rgba(0, 168, 204, 0.2) 100%);
  color: #00d4aa;
  border-radius: 20px;
  border: 1px solid rgba(0, 212, 170, 0.3);
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.phase-label {
  font-size: 11px;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 6px;
  letter-spacing: 0.02em;

  &.thinking {
    background: rgba($badge-warning, 0.12);
    color: $badge-warning;
    border: 1px solid rgba($badge-warning, 0.25);
  }

  &.reasoning {
    background: rgba($badge-reasoning, 0.12);
    color: $badge-reasoning;
    border: 1px solid rgba($badge-reasoning, 0.25);
  }
}

.reasoning-content {
  .reasoning-text {
    font-size: 14px;
    line-height: 1.7;
    color: var(--color-text);
    margin-top: 10px;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .reasoning-sql {
    margin-top: 12px;

    .sql-code {
      margin: 0;
      padding: 12px;
      background: var(--chat-code-bg);
      border-radius: 8px;
      overflow-x: auto;

      code {
        font-family: 'JetBrains Mono', monospace;
        font-size: 12px;
        color: var(--chat-code-text);
        white-space: pre-wrap;
      }
    }
  }

  .details-toggle-btn {
    margin-left: auto;
    padding: 4px 10px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    color: var(--color-text-muted);
    font-size: 11px;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      background: rgba(255, 255, 255, 0.1);
      color: var(--color-text);
    }
  }

  .tool-details {
    margin-top: 16px;
    padding: 12px;
    background: rgba(56, 189, 248, 0.05);
    border: 1px solid rgba(56, 189, 248, 0.2);
    border-radius: 8px;

    .tool-details-header {
      font-size: 12px;
      font-weight: 600;
      color: #38bdf8;
      margin-bottom: 10px;
    }

    .tool-detail-item {
      display: flex;
      gap: 8px;
      margin-bottom: 8px;
      font-size: 12px;

      .label {
        color: var(--color-text-muted);
        flex-shrink: 0;
      }

      .value {
        color: var(--color-text);
        word-break: break-all;
      }

      code.value {
        font-family: 'JetBrains Mono', monospace;
        background: rgba(0, 0, 0, 0.2);
        padding: 2px 6px;
        border-radius: 4px;
      }
    }

    .result-preview {
      margin: 4px 0 0;
      padding: 8px;
      background: rgba(0, 0, 0, 0.2);
      border-radius: 4px;
      max-height: 150px;
      overflow: auto;

      code {
        font-family: 'JetBrains Mono', monospace;
        font-size: 11px;
        color: var(--chat-code-text);
        white-space: pre-wrap;
      }
    }
  }

  &.tool {
    background: rgba($badge-tool, 0.12);
    color: $badge-tool;
    border: 1px solid rgba($badge-tool, 0.25);
  }

  &.question {
    background: rgba($badge-warning, 0.12);
    color: $badge-warning;
    border: 1px solid rgba($badge-warning, 0.25);
  }

  &.sql,
  &.result {
    background: rgba($badge-success, 0.12);
    color: $badge-success;
    border: 1px solid rgba($badge-success, 0.25);
  }
}

.repair-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 6px;
  background: rgba($badge-warning, 0.12);
  color: $badge-warning;
  border: 1px solid rgba($badge-warning, 0.25);
  animation: pulse-soft 2s ease-in-out infinite;
}

@keyframes pulse-soft {

  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.7;
  }
}

// ═══════════════════════════════════════════════════════════════
// Message Text
// ═══════════════════════════════════════════════════════════════
.message-text {
  font-size: 14px;
  line-height: 1.65;
  color: $text-primary;
  white-space: pre-wrap;
  word-break: break-word;
  letter-spacing: 0.01em;
}

.cursor {
  color: #00d4aa;
  animation: cursor-blink 1s step-end infinite;
  font-weight: 400;
}

@keyframes cursor-blink {

  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0;
  }
}

// ═══════════════════════════════════════════════════════════════
// Typing Animation
// ═══════════════════════════════════════════════════════════════
.typing-effect {
  display: flex;
  align-items: center;
  gap: 12px;
  color: $text-secondary;
}

.typing-dots {
  display: flex;
  gap: 5px;

  span {
    width: 7px;
    height: 7px;
    background: linear-gradient(135deg, #00d4aa, #00a8cc);
    border-radius: 50%;
    animation: typing-wave 1.4s ease-in-out infinite;

    &:nth-child(2) {
      animation-delay: 0.15s;
    }

    &:nth-child(3) {
      animation-delay: 0.3s;
    }
  }
}

@keyframes typing-wave {

  0%,
  80%,
  100% {
    transform: scale(0.8);
    opacity: 0.4;
  }

  40% {
    transform: scale(1.1);
    opacity: 1;
  }
}

// ═══════════════════════════════════════════════════════════════
// Tool & Result Cards (Unified Style)
// ═══════════════════════════════════════════════════════════════
.next-action-badge {
  margin-top: 12px;
  padding: 6px 14px;
  background: rgba($badge-tool, 0.08);
  border: 1px solid rgba($badge-tool, 0.25);
  border-radius: 20px;
  font-size: 11px;
  font-weight: 500;
  color: $badge-tool;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.tool-params-inline {
  margin-top: 12px;
  padding: 12px 14px;
  background: var(--chat-tool-bg);
  border-radius: 10px;
  border: 1px solid var(--chat-tool-border);

  code {
    font-size: 12px;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    color: var(--chat-badge-tool);
    word-break: break-all;
    line-height: 1.5;
  }
}

.tool-result-inline {
  margin-top: 12px;

  .result-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    font-weight: 600;
    color: $text-muted;
    cursor: pointer;
    margin-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 0.05em;

    svg {
      transition: transform 0.25s ease;

      &.rotated {
        transform: rotate(180deg);
      }
    }

    &:hover {
      color: $text-secondary;
    }
  }

  pre {
    margin: 0;
    padding: 12px 14px;
    background: var(--chat-code-bg);
    border-radius: 10px;
    border: 1px solid var(--chat-tool-border);
    max-height: 180px;
    overflow: auto;

    &::-webkit-scrollbar {
      width: 4px;
      height: 4px;
    }

    &::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.2);
      border-radius: 2px;
    }
  }

  code {
    font-size: 11px;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    color: var(--chat-code-text);
    line-height: 1.5;
  }
}

// ═══════════════════════════════════════════════════════════════
// Step Details (Expandable Sections)
// ═══════════════════════════════════════════════════════════════
.step-details {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--color-border);
}

.step-details-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  font-weight: 600;
  color: $text-muted;
  cursor: pointer;
  user-select: none;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  transition: color 0.2s ease;

  &:hover {
    color: $text-secondary;
  }

  svg {
    transition: transform 0.25s ease;

    &.rotated {
      transform: rotate(180deg);
    }
  }
}

.step-details-body {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.meta-empty {
  font-size: 12px;
  color: $text-muted;
  padding: 12px 0;
  font-style: italic;
}

// ═══════════════════════════════════════════════════════════════
// Live Sections (Streaming Content)
// ═══════════════════════════════════════════════════════════════
.live-sections {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.live-section {
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid $border-subtle;
  border-radius: 12px;
  padding: 12px 14px;
  transition: border-color 0.2s ease;

  &[open] {
    border-color: rgba(0, 212, 170, 0.2);
  }

  summary {
    cursor: pointer;
    font-size: 12px;
    font-weight: 700;
    color: $text-primary;
    display: flex;
    align-items: center;
    gap: 10px;
    user-select: none;
    letter-spacing: 0.02em;
    list-style: none;

    &::marker,
    &::-webkit-details-marker {
      display: none;
    }

    &::before {
      content: '▸';
      font-size: 10px;
      color: $text-muted;
      transition: transform 0.2s ease;
    }
  }

  &[open]>summary::before {
    transform: rotate(90deg);
  }
}

.live-text {
  margin-top: 12px;
  font-size: 13px;
  line-height: 1.7;
  color: $text-primary;
  white-space: pre-wrap;
  word-break: break-word;
}

.live-code {
  margin: 12px 0 0 0;
  padding: 14px;
  border-radius: 10px;
  background: var(--chat-code-bg);
  border: 1px solid var(--chat-tool-border);
  overflow: auto;
  max-height: 240px;

  &::-webkit-scrollbar {
    width: 4px;
    height: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 2px;
  }

  code {
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 12px;
    color: var(--chat-code-text);
    white-space: pre;
    line-height: 1.6;
  }

  &.raw code {
    font-size: 10px;
    color: var(--color-text-muted);
  }
}

.live-kv {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.kv-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.kv-key {
  font-size: 11px;
  color: $text-muted;
  min-width: 100px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.kv-val {
  font-size: 13px;
  color: $text-primary;
  white-space: pre-wrap;
  word-break: break-word;
  flex: 1;

  &.mono {
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 12px;
    color: $badge-tool;
  }
}

// ═══════════════════════════════════════════════════════════════
// Metadata Section
// ═══════════════════════════════════════════════════════════════
.meta-counts {
  margin-left: auto;
  font-size: 10px;
  color: $text-muted;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  letter-spacing: 0.02em;
}

.meta-groups {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.meta-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid $border-subtle;
  color: $text-primary;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: var(--chat-code-bg);
    border-color: $border-active;
  }
}

.meta-badge {
  font-size: 10px;
  padding: 3px 10px;
  border-radius: 20px;
  background: rgba(0, 212, 170, 0.12);
  color: #00d4aa;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-weight: 600;
}

.meta-items {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.meta-item {
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid $border-subtle;
}

.meta-item-kv {
  display: grid;
  grid-template-columns: 130px 1fr;
  gap: 12px;
  padding: 4px 0;
}

.meta-item-key {
  font-size: 10px;
  color: $text-muted;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.meta-item-val {
  font-size: 12px;
  color: $text-primary;
  white-space: pre-wrap;
  word-break: break-word;
}

// ═══════════════════════════════════════════════════════════════
// Status Indicators
// ═══════════════════════════════════════════════════════════════
.executing-indicator {
  .spinner-small {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(0, 212, 170, 0.2);
    border-top-color: #00d4aa;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.completed-indicator {
  color: $badge-success;
  font-size: 14px;
}

// ═══════════════════════════════════════════════════════════════
// Special Content Types
// ═══════════════════════════════════════════════════════════════
.question-content {
  border-color: rgba($badge-warning, 0.3) !important;
  background: rgba($badge-warning, 0.05) !important;
}

.sql-content {
  .sql-code {
    margin: 0;
    padding: 16px;
    background: var(--chat-code-bg);
    border-radius: 12px;
    border: 1px solid var(--chat-tool-border);
    overflow-x: auto;

    code {
      font-size: 13px;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      color: var(--chat-code-text);
      line-height: 1.6;
    }
  }
}

.result-content {
  min-width: 320px;

  .result-meta {
    font-size: 11px;
    color: $text-muted;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }
}

// 온톨로지 내보내기 버튼
.ontology-export-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  padding: 8px 14px;
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(6, 182, 212, 0.15) 100%);
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: 8px;
  color: #10b981;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s ease;

  &:hover {
    background: linear-gradient(135deg, rgba(16, 185, 129, 0.25) 0%, rgba(6, 182, 212, 0.25) 100%);
    border-color: rgba(16, 185, 129, 0.5);
    box-shadow: 0 4px 16px rgba(16, 185, 129, 0.25);
    transform: translateY(-1px);
  }
}

// 실행 결과 액션 영역 (피드백/OLAP)
.result-actions {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;

  .olap-export-btn {
    margin-left: 0;
  }
}

// 결과 피드백 버튼
.feedback-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.08);
    color: var(--color-text);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.feedback-btn.approve {
  border-color: rgba(52, 211, 153, 0.25);
  color: #34d399;
}

.feedback-btn.reject {
  border-color: rgba(248, 113, 113, 0.25);
  color: #f87171;
}

// OLAP 내보내기 버튼
.olap-export-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 8px;
  padding: 8px 14px;
  background: linear-gradient(135deg, rgba(34, 139, 230, 0.15) 0%, rgba(124, 58, 237, 0.15) 100%);
  border: 1px solid rgba(34, 139, 230, 0.3);
  border-radius: 8px;
  color: #38bdf8;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s ease;
  animation: pulse-glow 2s ease-in-out infinite;

  &:hover {
    background: linear-gradient(135deg, rgba(34, 139, 230, 0.25) 0%, rgba(124, 58, 237, 0.25) 100%);
    border-color: rgba(34, 139, 230, 0.5);
    box-shadow: 0 4px 16px rgba(34, 139, 230, 0.25);
    transform: translateY(-1px);
  }

  svg {
    color: #38bdf8;
  }
}

// 온톨로지 인스턴스 버튼
.ontology-instance-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 8px;
  padding: 8px 14px;
  background: linear-gradient(135deg, rgba(167, 139, 250, 0.15) 0%, rgba(124, 58, 237, 0.15) 100%);
  border: 1px solid rgba(167, 139, 250, 0.3);
  border-radius: 8px;
  color: #a78bfa;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s ease;

  &:hover {
    background: linear-gradient(135deg, rgba(167, 139, 250, 0.25) 0%, rgba(124, 58, 237, 0.25) 100%);
    border-color: rgba(167, 139, 250, 0.5);
    box-shadow: 0 4px 16px rgba(167, 139, 250, 0.25);
    transform: translateY(-1px);
  }
}

// 온톨로지 모달 스타일
.ontology-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.ontology-modal {
  background: var(--color-bg-secondary, #1e293b);
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  border-radius: 16px;
  width: 90%;
  max-width: 600px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  
  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px;
    border-bottom: 1px solid var(--color-border);
    
    h3 {
      margin: 0;
      font-size: 1.2rem;
      font-weight: 600;
      color: var(--color-text-bright, #f0f4f8);
    }
    
    .close-btn {
      background: transparent;
      border: none;
      color: var(--color-text-muted);
      font-size: 1.2rem;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 6px;
      
      &:hover {
        background: var(--color-bg-tertiary);
        color: var(--color-text-bright);
      }
    }
  }
  
  .modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  
  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding: 16px 24px;
    border-top: 1px solid var(--color-border);
  }
  
  .info-section {
    background: var(--color-bg-tertiary, rgba(255, 255, 255, 0.05));
    border-radius: 10px;
    padding: 14px 16px;
    
    .info-row {
      display: flex;
      gap: 10px;
      margin-bottom: 8px;
      
      &:last-child {
        margin-bottom: 0;
      }
      
      .info-label {
        color: var(--color-text-muted);
        font-size: 0.85rem;
        min-width: 80px;
      }
      
      .info-value {
        color: var(--color-text-bright);
        font-size: 0.85rem;
        flex: 1;
      }
    }
  }
  
  .form-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    
    label {
      font-size: 0.85rem;
      font-weight: 500;
      color: var(--color-text-light);
    }
    
    select, input[type="text"] {
      padding: 10px 14px;
      background: var(--color-bg-tertiary);
      border: 1px solid var(--color-border);
      border-radius: 8px;
      color: var(--color-text-bright);
      font-size: 0.9rem;
      
      &:focus {
        outline: none;
        border-color: #a78bfa;
      }
    }
    
    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;
      
      input[type="checkbox"] {
        width: 18px;
        height: 18px;
        accent-color: #a78bfa;
      }
      
      span {
        font-size: 0.9rem;
        color: var(--color-text);
      }
    }
    
    .mv-name-input {
      margin-top: 8px;
    }
    
    .hint {
      font-size: 0.8rem;
      color: var(--color-text-muted);
      margin: 4px 0 0 0;
    }
  }
  
  .sample-preview {
    label {
      font-size: 0.85rem;
      font-weight: 500;
      color: var(--color-text-light);
      display: block;
      margin-bottom: 8px;
    }
    
    .sample-table-wrapper {
      overflow-x: auto;
      border-radius: 8px;
      border: 1px solid var(--color-border);
    }
    
    .sample-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.8rem;
      
      th, td {
        padding: 8px 12px;
        text-align: left;
        border-bottom: 1px solid var(--color-border);
      }
      
      th {
        background: var(--color-bg-tertiary);
        color: var(--color-text-muted);
        font-weight: 500;
      }
      
      td {
        color: var(--color-text);
        max-width: 150px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      
      tbody tr:last-child td {
        border-bottom: none;
      }
    }
  }
  
  .cancel-btn {
    padding: 10px 20px;
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    color: var(--color-text);
    font-size: 0.9rem;
    cursor: pointer;
    
    &:hover {
      background: var(--color-bg-hover);
    }
  }
  
  .create-btn {
    padding: 10px 24px;
    background: linear-gradient(135deg, #a78bfa, #7c3aed);
    border: none;
    border-radius: 8px;
    color: white;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    
    &:hover:not(:disabled) {
      box-shadow: 0 4px 16px rgba(167, 139, 250, 0.4);
      transform: translateY(-1px);
    }
    
    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
}

@keyframes pulse-glow {

  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(34, 139, 230, 0);
  }

  50% {
    box-shadow: 0 0 12px 2px rgba(34, 139, 230, 0.2);
  }
}

.error-content {
  .message-text {
    color: $badge-error;
  }
}

.system-content {
  color: #ffc864;
  font-style: italic;
  font-size: 13px;
  opacity: 0.9;
}

.message-avatar.system {
  background: linear-gradient(135deg, rgba(255, 200, 100, 0.2), rgba(255, 150, 80, 0.1));
  border: 1px solid rgba(255, 200, 100, 0.3);
}

// ═══════════════════════════════════════════════════════════════
// Copy Button
// ═══════════════════════════════════════════════════════════════
.copy-btn {
  padding: 6px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid $border-subtle;
  color: $text-muted;
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: rgba(0, 212, 170, 0.1);
    border-color: $border-active;
    color: #00d4aa;
  }
}

// ═══════════════════════════════════════════════════════════════
// Input Area
// ═══════════════════════════════════════════════════════════════
.chat-input-area {
  padding: 20px 32px;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
  position: relative;
  z-index: 10;
}

.status-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(0, 212, 170, 0.08);
  border: 1px solid rgba(0, 212, 170, 0.2);
  border-radius: 12px;
  margin-bottom: 16px;
  font-size: 13px;
  font-weight: 500;
  color: #00d4aa;

  .status-dot {
    width: 10px;
    height: 10px;
    background: #00d4aa;
    border-radius: 50%;
    animation: status-pulse 1.5s ease-in-out infinite;
    box-shadow: 0 0 12px rgba(0, 212, 170, 0.5);
  }

  .cancel-btn {
    padding: 6px 12px;
    background: transparent;
    border: 1px solid rgba(255, 100, 100, 0.5);
    border-radius: 8px;
    color: #ff6464;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      background: rgba(255, 100, 100, 0.15);
      border-color: #ff6464;
    }
  }

  .pause-btn {
    margin-left: auto;
    padding: 6px 12px;
    background: transparent;
    border: 1px solid rgba(255, 200, 100, 0.5);
    border-radius: 8px;
    color: #ffc864;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      background: rgba(255, 200, 100, 0.15);
      border-color: #ffc864;
    }
  }

  &.paused-bar {
    background: linear-gradient(135deg, rgba(255, 200, 100, 0.1), rgba(255, 150, 80, 0.05));
    border: 1px solid rgba(255, 200, 100, 0.3);
  }

  .resume-btn {
    margin-left: auto;
    padding: 8px 16px;
    background: linear-gradient(135deg, #00d4aa, #00b896);
    border: none;
    border-radius: 8px;
    color: white;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      background: linear-gradient(135deg, #00e4ba, #00c8a6);
      transform: translateY(-1px);
    }
  }

  .status-dot.paused {
    background: #ffc864;
    animation: none;
  }
}

@keyframes status-pulse {

  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }

  50% {
    opacity: 0.6;
    transform: scale(0.9);
  }
}

.input-wrapper {
  display: flex;
  gap: 12px;
  align-items: flex-end;

  textarea {
    flex: 1;
    padding: 14px 20px;
    background: var(--chat-input-bg);
    border: 1px solid var(--color-border);
    border-radius: 28px;
    color: var(--color-text);
    font-size: 14px;
    font-family: inherit;
    resize: none;
    min-height: 48px;
    max-height: 140px;
    transition: all 0.25s ease;
    line-height: 1.5;
    box-shadow: var(--shadow-sm);

    &::placeholder {
      color: var(--color-text-muted);
    }

    &:focus {
      outline: none;
      border-color: var(--color-accent);
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  .send-btn {
    width: 48px;
    height: 48px;
    background: linear-gradient(135deg, #00d4aa 0%, #00a8cc 100%);
    border: none;
    border-radius: 50%;
    color: #0a1628;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 4px 20px rgba(0, 212, 170, 0.3);

    &:hover:not(:disabled) {
      transform: scale(1.08);
      box-shadow: 0 6px 28px rgba(0, 212, 170, 0.4);
    }

    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
      box-shadow: none;
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Settings Panel
// ═══════════════════════════════════════════════════════════════
.settings-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  padding: 8px 14px;
  color: $text-muted;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.05);
    color: $text-secondary;
  }

  svg {
    transition: transform 0.25s ease;

    &.rotated {
      transform: rotate(180deg);
    }
  }
}

.settings-panel {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  margin-top: 14px;
  padding: 16px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid $border-subtle;
  border-radius: 14px;

  .setting-row {
    display: flex;
    align-items: center;
    gap: 10px;

    label {
      font-size: 12px;
      font-weight: 500;
      color: $text-secondary;
    }

    input[type="number"] {
      width: 80px;
      padding: 8px 12px;
      background: var(--chat-code-bg);
      border: 1px solid $border-subtle;
      border-radius: 8px;
      color: $text-primary;
      font-size: 12px;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      transition: border-color 0.2s ease;

      &:focus {
        outline: none;
        border-color: rgba(0, 212, 170, 0.5);
      }
    }

    input[type="checkbox"] {
      width: 18px;
      height: 18px;
      accent-color: #00d4aa;
      cursor: pointer;
    }
  }
}

.slide-enter-active,
.slide-leave-active {
  transition: all 0.25s ease;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

// ═══════════════════════════════════════════════════════════════
// SQL Side Panel
// ═══════════════════════════════════════════════════════════════
.sql-side-panel {
  width: 340px;
  border-left: 1px solid var(--sql-panel-border, $border-subtle);
  background: var(--sql-panel-bg);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--sql-panel-border, $border-subtle);

    h3 {
      margin: 0;
      font-size: 14px;
      font-weight: 700;
      color: var(--color-text-bright);
      letter-spacing: 0.02em;
    }
  }

  .sql-preview {
    flex: 1;
    padding: 20px;
    overflow: auto;

    &::-webkit-scrollbar {
      width: 4px;
    }

    &::-webkit-scrollbar-thumb {
      background: var(--color-border);
      border-radius: 2px;
    }

    pre {
      margin: 0;
      padding: 16px;
      background: var(--sql-block-bg);
      border: 1px solid var(--sql-block-border);
      border-radius: 12px;
      overflow-x: auto;
      white-space: pre-wrap;
    }

    // diff view
    .sql-diff {
      margin: 0;
      padding: 16px;
      background: var(--sql-block-bg);
      border: 1px solid var(--sql-block-border);
      border-radius: 12px;
      overflow-x: auto;
      white-space: pre-wrap;
    }

    .sql-line {
      display: block;
      padding: 2px 8px;
      margin: 2px 0;
      border-radius: 6px;
      transition: all 0.25s ease;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 12px;
      line-height: 1.6;
      color: var(--sql-text);
    }

    .sql-line.added {
      background: rgba(52, 211, 153, 0.14);
      border-left: 3px solid var(--color-success);
    }

    .sql-line.removed {
      background: rgba(248, 113, 113, 0.14);
      border-left: 3px solid var(--color-error);
      text-decoration: line-through;
      opacity: 0.75;
    }

    .sql-line.modified {
      background: rgba(251, 191, 36, 0.14);
      border-left: 3px solid var(--color-warning);
    }

    // TransitionGroup name="sql-line"
    .sql-line-enter-active,
    .sql-line-leave-active,
    .sql-line-move {
      transition: all 0.25s ease;
    }

    .sql-line-enter-from {
      opacity: 0;
      transform: translateX(-8px);
    }

    .sql-line-leave-to {
      opacity: 0;
      transform: translateX(8px);
    }

    code {
      font-size: 12px;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      color: var(--sql-text);
      line-height: 1.6;
    }
  }

  .sql-placeholder {
    color: $text-muted;
    font-size: 13px;
    text-align: center;
    padding: 48px 24px;
    font-style: italic;
  }

  .completeness-bar {
    padding: 14px 20px;
    border-top: 1px solid $border-subtle;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 12px;
    font-weight: 500;
    color: $text-secondary;

    .level {
      padding: 4px 12px;
      border-radius: 6px;
      font-weight: 700;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.03em;

      &.high {
        background: rgba($badge-success, 0.12);
        color: $badge-success;
        border: 1px solid rgba($badge-success, 0.3);
      }

      &.medium {
        background: rgba($badge-warning, 0.12);
        color: $badge-warning;
        border: 1px solid rgba($badge-warning, 0.3);
      }

      &.low {
        background: rgba($badge-error, 0.12);
        color: $badge-error;
        border: 1px solid rgba($badge-error, 0.3);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Message Animations
// ═══════════════════════════════════════════════════════════════
.message-anim-enter-active {
  animation: messageSlide 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

.message-anim-leave-active {
  animation: messageFade 0.2s ease-out forwards;
}

@keyframes messageFade {
  from {
    opacity: 1;
    transform: scale(1);
  }

  to {
    opacity: 0;
    transform: scale(0.98);
  }
}

// ═══════════════════════════════════════════════════════════════
// DOM 최적화 - 간소화된 컴팩트 스타일
// ═══════════════════════════════════════════════════════════════
.hidden-messages-indicator {
  text-align: center;
  padding: 12px;
  margin-bottom: 16px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  color: var(--color-text-muted);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    color: var(--color-text);
  }
}

.tool-params-compact {
  display: block;
  margin-top: 8px;
  padding: 6px 10px;
  background: var(--chat-tool-bg);
  border-radius: 6px;
  font-size: 11px;
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.tool-result-display {
  margin-top: 8px;

  .result-code {
    margin: 0;
    padding: 10px;
    background: var(--chat-code-bg);
    border-radius: 6px;
    max-height: 300px;
    overflow: auto;
    font-size: 11px;

    code {
      font-family: 'JetBrains Mono', monospace;
      color: var(--chat-code-text);
      white-space: pre-wrap;
      word-break: break-word;
    }
  }
}

.live-summary {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}

.live-text-compact {
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-text);
}

.live-reasoning-text {
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text);
  margin-bottom: 12px;
  white-space: pre-wrap;
  word-break: break-word;
}

.live-sql-preview {
  margin-top: 12px;

  .sql-code {
    margin: 0;
    padding: 12px;
    background: var(--chat-code-bg);
    border-radius: 8px;
    overflow-x: auto;

    code {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: var(--chat-code-text);
      white-space: pre-wrap;
    }
  }
}

.live-sql-compact {
  padding: 8px 10px;
  background: var(--chat-code-bg);
  border-radius: 6px;

  code {
    font-size: 11px;
    font-family: 'JetBrains Mono', monospace;
    color: var(--chat-code-text);
  }
}

.live-tool-compact {
  font-size: 11px;
  color: var(--chat-badge-tool);
  padding: 4px 8px;
  background: rgba(56, 189, 248, 0.1);
  border-radius: 4px;
  display: inline-block;
}

.live-tool-params {
  font-size: 11px;
  color: var(--color-text-muted);
  margin-top: 6px;

  code {
    background: rgba(0, 0, 0, 0.2);
    padding: 4px 8px;
    border-radius: 4px;
    display: block;
    word-break: break-all;
  }
}

// ═══════════════════════════════════════════════════════════════
// Responsive
// ═══════════════════════════════════════════════════════════════
@media (max-width: 1024px) {
  .sql-side-panel {
    display: none;
  }

  .chat-messages {
    padding: 20px;
  }

  .chat-input-area {
    padding: 16px 20px;
  }

  .chat-message {
    max-width: 95%;
  }
}
</style>
