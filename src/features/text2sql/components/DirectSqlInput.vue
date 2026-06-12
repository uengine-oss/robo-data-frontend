<template>
  <div class="direct-sql-container">
    <!-- 우상단 모드 선택기 -->
    <div class="mode-selector-container">
      <button class="mode-option" @click="$emit('change-mode', 'react')" title="정밀한 AI 분석">
        <span class="opt-icon">🧠</span>
        <span class="opt-label">자연어 검색</span>
      </button>
      <button class="mode-option active" title="SQL 직접 입력">
        <span class="opt-icon">📝</span>
        <span class="opt-label">SQL</span>
      </button>
    </div>

    <!-- SQL 입력 영역 -->
    <div class="sql-input-section">
      <div class="section-header">
        <span class="section-icon">📝</span>
        <span class="section-title">SQL 쿼리 직접 입력</span>
      </div>
      
      <div class="sql-editor-wrapper">
        <textarea 
          v-model="sqlText" 
          class="sql-editor"
          placeholder="SELECT * FROM your_table WHERE condition..."
          @keydown.ctrl.enter="executeSql"
          @keydown.meta.enter="executeSql"
          spellcheck="false"
        ></textarea>
        
        <div class="editor-footer">
          <div class="shortcuts">
            <span class="shortcut">Ctrl+Enter로 실행</span>
          </div>
          
          <div class="actions">
            <label class="ai-format-toggle">
              <input type="checkbox" v-model="formatWithAi" />
              <span class="toggle-label">AI 결과 요약</span>
            </label>
            
            <button 
              class="execute-btn" 
              :disabled="!canExecute || isExecuting"
              @click="executeSql"
            >
              <span v-if="isExecuting" class="spinner"></span>
              <IconPlay v-else :size="16" />
              <span>{{ isExecuting ? '실행 중...' : '실행' }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 결과 영역 -->
    <div v-if="hasResult || error || isExecuting" class="result-section">
      <div class="section-header">
        <span class="section-icon">📊</span>
        <span class="section-title">실행 결과</span>
        <span v-if="result" class="result-meta">
          {{ result.row_count }}개 행 · {{ result.execution_time_ms.toFixed(0) }}ms
        </span>
      </div>

      <!-- 자동 교정 정보 (백엔드가 autocorrect 이벤트를 보낸 경우) -->
      <div v-if="autocorrectInfo?.prepared_sql" class="autocorrect-card">
        <div class="autocorrect-header">
          <div class="autocorrect-title">
            <span class="badge">자동 교정</span>
            <span class="meta">
              <span v-if="autocorrectInfo.mode">{{ autocorrectInfo.mode }}</span>
              <span v-if="autocorrectInfo.reason">· {{ autocorrectInfo.reason }}</span>
              <span v-if="autocorrectInfo.llm_model" class="llm-meta">
                · {{ autocorrectInfo.llm_model }}
                <span v-if="typeof autocorrectInfo.llm_elapsed_ms === 'number'">
                  ({{ autocorrectInfo.llm_elapsed_ms.toFixed(0) }}ms)
                </span>
              </span>
            </span>
          </div>
          <div class="autocorrect-actions">
            <button class="mini-btn" @click="applyAutocorrectedSql">편집기에 적용</button>
            <button class="mini-btn" @click="copyAutocorrectedSql">복사</button>
            <button class="mini-btn ghost" @click="showAutocorrectDetails = !showAutocorrectDetails">
              {{ showAutocorrectDetails ? '접기' : '자세히' }}
            </button>
          </div>
        </div>

        <div v-if="showAutocorrectDetails" class="autocorrect-body">
          <div class="sql-pair">
            <div class="sql-col">
              <div class="sql-label">요청 SQL</div>
              <pre class="sql-block"><code>{{ originalSqlForDisplay }}</code></pre>
            </div>
            <div class="sql-col">
              <div class="sql-label">교정 후 SQL(실행)</div>
              <pre class="sql-block"><code>{{ autocorrectInfo.prepared_sql }}</code></pre>
            </div>
          </div>
        </div>
      </div>

      <!-- 로딩 상태 -->
      <div v-if="isExecuting" class="loading-state">
        <div class="loading-spinner"></div>
        <p>{{ loadingMessage }}</p>
      </div>

      <!-- 에러 -->
      <div v-else-if="error" class="error-state">
        <span class="error-icon">⚠️</span>
        <p>{{ error }}</p>
      </div>

      <!-- 결과 테이블 -->
      <template v-else-if="result">
        <div class="result-content">
          <!-- AI 요약 -->
          <div v-if="showAiSummaryCard" class="ai-summary">
            <div class="summary-header">
              <span class="ai-icon">🤖</span>
              <span>AI 분석</span>
              <span v-if="isStreamingSummary" class="streaming-indicator">●</span>
              <span v-else-if="isAiSummaryPending" class="pending-indicator">요청중</span>
            </div>
            <div class="summary-content">
              <p v-if="aiSummary" class="streaming-text" :class="{ streaming: isStreamingSummary }">{{ aiSummary }}</p>
              <p v-else class="pending-text">AI 분석 요청중...</p>
            </div>
          </div>

          <!-- 결과 테이블 -->
          <div class="result-table-container">
            <ResultTable :data="resultData" />
          </div>
        </div>
      </template>
    </div>

    <!-- 빈 상태 -->
    <div v-else class="empty-state">
      <div class="empty-icon">💡</div>
      <p>SQL 쿼리를 입력하고 실행하세요</p>
      <div class="example-queries">
        <span class="label">예시:</span>
        <button 
          v-for="example in exampleQueries" 
          :key="example.label" 
          class="example-btn"
          @click="setExample(example.sql)"
        >
          {{ example.label }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { IconPlay } from '@/shared/icons'
import ResultTable from './ResultTable.vue'
import type { ReactExecutionResult } from '@/shared/types'
import { useDatasourcesStore } from '@/features/datasources/datasources'

defineEmits<{
  (e: 'change-mode', mode: 'react' | 'langchain' | 'direct'): void
}>()

const API_GATEWAY_URL = import.meta.env.VITE_API_GATEWAY_URL ?? '/api/gateway'
const API_BASE = import.meta.env.VITE_TEXT2SQL_API_URL || `${API_GATEWAY_URL}/text2sql`

// State
const sqlText = ref('')
const isExecuting = ref(false)
const loadingMessage = ref('SQL 검증 중...')
const error = ref<string | null>(null)
const result = ref<{
  columns: string[]
  rows: any[][]
  row_count: number
  execution_time_ms: number
} | null>(null)
const aiSummary = ref('')
const isStreamingSummary = ref(false)
const requestedAiSummary = ref(false)
const isAiSummaryPending = ref(false)
const formatWithAi = ref(true)
const datasourcesStore = useDatasourcesStore()

type AutocorrectInfo = {
  mode?: string
  reason?: string
  prepared_sql?: string
  llm_model?: string
  llm_elapsed_ms?: number
}

// Autocorrect UX state
const submittedSql = ref('')
const validatedSqlFromServer = ref('')
const autocorrectInfo = ref<AutocorrectInfo | null>(null)
const showAutocorrectDetails = ref(false)

// Computed
const canExecute = computed(() => sqlText.value.trim().length > 0)
const hasResult = computed(() => result.value !== null)
const showAiSummaryCard = computed(() => (
  requestedAiSummary.value
  && result.value !== null
  && (isAiSummaryPending.value || isStreamingSummary.value || aiSummary.value.trim().length > 0)
))
const originalSqlForDisplay = computed(() => validatedSqlFromServer.value || submittedSql.value || sqlText.value)
const resultData = computed<ReactExecutionResult>(() => {
  if (!result.value) {
    return { columns: [], rows: [], row_count: 0, execution_time_ms: 0 }
  }
  return {
    columns: result.value.columns,
    rows: result.value.rows,
    row_count: result.value.row_count,
    execution_time_ms: result.value.execution_time_ms
  }
})

// Example queries
const exampleQueries = [
  { label: '테이블 목록', sql: 'SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema NOT IN (\'pg_catalog\', \'information_schema\') LIMIT 20' },
  { label: '회의실 예약', sql: 'SELECT * FROM public.reservations ORDER BY reservation_date DESC LIMIT 10' },
  { label: '정수장 목록', sql: 'SELECT "BPLC_CODE", "BPLC_NM" FROM rwis.rdisaup_tb LIMIT 20' },
]

function setExample(sql: string) {
  sqlText.value = sql
}

function applyAutocorrectedSql() {
  const s = autocorrectInfo.value?.prepared_sql?.trim()
  if (!s) return
  sqlText.value = s
}

async function copyAutocorrectedSql() {
  const s = autocorrectInfo.value?.prepared_sql?.trim()
  if (!s) return
  try {
    await navigator.clipboard.writeText(s)
  } catch (e) {
    // best-effort fallback
    const ta = document.createElement('textarea')
    ta.value = s
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    try {
      document.execCommand('copy')
    } finally {
      document.body.removeChild(ta)
    }
  }
}

async function executeSql() {
  if (!canExecute.value || isExecuting.value) return
  
  isExecuting.value = true
  error.value = null
  result.value = null
  aiSummary.value = ''
  isStreamingSummary.value = false
  requestedAiSummary.value = formatWithAi.value
  isAiSummaryPending.value = formatWithAi.value
  loadingMessage.value = 'SQL 검증 중...'
  submittedSql.value = sqlText.value
  validatedSqlFromServer.value = ''
  autocorrectInfo.value = null
  showAutocorrectDetails.value = false
  
  try {
    const selectedDs = datasourcesStore.selectedDatasource
    if (!selectedDs?.name) {
      throw new Error('데이터소스를 선택해주세요')
    }
    const response = await fetch(`${API_BASE}/direct-sql/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sql: sqlText.value,
        datasource: selectedDs.name,
        max_sql_seconds: 60,
        format_with_ai: formatWithAi.value
      })
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    
    const reader = response.body?.getReader()
    if (!reader) throw new Error('스트림을 읽을 수 없습니다')
    
    const decoder = new TextDecoder()
    let buffer = ''

    const handleEvent = (event: any) => {
      switch (event.event) {
        case 'validating':
          loadingMessage.value = 'SQL 검증 중...'
          break
        case 'validated':
          if (typeof event.validated_sql === 'string') {
            validatedSqlFromServer.value = event.validated_sql
          }
          break
        case 'executing':
          loadingMessage.value = 'SQL 실행 중...'
          break
        case 'autocorrect':
          // backend may emit: { mode, reason, prepared_sql, llm_model, llm_elapsed_ms }
          autocorrectInfo.value = {
            mode: event.mode,
            reason: event.reason,
            prepared_sql: event.prepared_sql,
            llm_model: event.llm_model,
            llm_elapsed_ms: typeof event.llm_elapsed_ms === 'number' ? event.llm_elapsed_ms : undefined
          }
          showAutocorrectDetails.value = true
          break
        case 'formatting':
          loadingMessage.value = 'AI가 결과 분석 중...'
          if (requestedAiSummary.value && aiSummary.value.trim().length === 0) {
            isAiSummaryPending.value = true
          }
          isStreamingSummary.value = true
          break
        case 'result':
          result.value = {
            columns: event.columns,
            rows: event.rows,
            row_count: event.row_count,
            execution_time_ms: event.execution_time_ms
          }
          isExecuting.value = false
          break
        case 'format_token':
          if (typeof event.token === 'string' && event.token.length > 0) {
            aiSummary.value += event.token
            isAiSummaryPending.value = false
          }
          break
        case 'format_done':
          isStreamingSummary.value = false
          isAiSummaryPending.value = false
          break
        case 'error':
          error.value = event.message
          isStreamingSummary.value = false
          isAiSummaryPending.value = false
          isExecuting.value = false
          break
        case 'completed':
          isStreamingSummary.value = false
          isAiSummaryPending.value = false
          isExecuting.value = false
          break
      }
    }

    const parseAndHandleLine = (rawLine: string) => {
      const line = rawLine.trim()
      if (!line) return
      const jsonLine = line.startsWith('data:') ? line.slice(5).trimStart() : line
      if (!jsonLine) return
      try {
        handleEvent(JSON.parse(jsonLine))
      } catch (e) {
        // 불완전한 JSON 라인은 다음 청크에서 이어서 처리
      }
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) parseAndHandleLine(line)
    }

    // decoder 내부 잔여 버퍼 및 마지막 미처리 라인 반영
    buffer += decoder.decode()
    if (buffer.trim()) parseAndHandleLine(buffer)
    
  } catch (e) {
    error.value = e instanceof Error ? e.message : '알 수 없는 오류'
    isStreamingSummary.value = false
    isAiSummaryPending.value = false
    isExecuting.value = false
  }
}
</script>

<style scoped lang="scss">
$primary: #00d4aa;
$primary-dim: rgba(0, 212, 170, 0.15);
// Theme-aware variables using CSS custom properties
$bg-dark: var(--color-bg);
$bg-card: var(--chat-card-bg, rgba(255, 255, 255, 0.03));
$border: var(--color-border);
$text-primary: var(--color-text-bright);
$text-secondary: var(--color-text-light);
$text-muted: var(--color-text-muted);
$error: #f87171;

.direct-sql-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 24px;
  padding: 24px;
  padding-top: 56px;
  overflow-y: auto;
  position: relative;
}

// ═══════════════════════════════════════════════════════════════
// Mode Selector (우상단 세그먼트 버튼)
// ═══════════════════════════════════════════════════════════════
.mode-selector-container {
  position: absolute;
  top: 12px;
  right: 24px;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
}

.mode-option {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  background: transparent;
  border: none;
  border-radius: 7px;
  color: #64748b;
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
    background: rgba(255, 255, 255, 0.08);
    color: #94a3b8;
  }
  
  &.active {
    background: linear-gradient(135deg, rgba(0, 212, 170, 0.2) 0%, rgba(0, 168, 204, 0.2) 100%);
    color: #00d4aa;
    box-shadow: 0 2px 8px rgba(0, 212, 170, 0.15);
    
    .opt-icon {
      filter: drop-shadow(0 0 3px rgba(0, 212, 170, 0.5));
    }
  }
}

.section-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  
  .section-icon {
    font-size: 18px;
  }
  
  .section-title {
    font-size: 15px;
    font-weight: 600;
    color: $text-primary;
  }
  
  .result-meta {
    margin-left: auto;
    font-size: 12px;
    color: $text-muted;
    font-family: 'JetBrains Mono', monospace;
  }
}

.autocorrect-card {
  margin-bottom: 16px;
  padding: 12px 12px;
  border: 1px solid rgba(0, 212, 170, 0.25);
  background: linear-gradient(135deg, rgba(0, 212, 170, 0.10) 0%, rgba(0, 168, 204, 0.06) 100%);
  border-radius: 12px;
}

.autocorrect-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.autocorrect-title {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;

  .badge {
    font-size: 11px;
    font-weight: 700;
    padding: 4px 8px;
    border-radius: 999px;
    background: rgba(0, 212, 170, 0.15);
    border: 1px solid rgba(0, 212, 170, 0.35);
    color: $primary;
    flex-shrink: 0;
  }

  .meta {
    font-size: 12px;
    color: $text-muted;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.autocorrect-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.mini-btn {
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.10);
  background: rgba(0, 0, 0, 0.25);
  color: $text-secondary;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.06);
    color: $text-primary;
  }

  &.ghost {
    background: transparent;
  }
}

.autocorrect-body {
  margin-top: 12px;
}

.sql-pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
}

.sql-col {
  min-width: 0;
}

.sql-label {
  font-size: 11px;
  color: $text-muted;
  margin-bottom: 6px;
}

.sql-block {
  margin: 0;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.25);
  color: $text-primary;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 12px;
  line-height: 1.5;
  max-height: 200px;
  overflow: auto;
  white-space: pre;
}

.sql-input-section {
  flex-shrink: 0;
}

.sql-editor-wrapper {
  background: $bg-card;
  border: 1px solid $border;
  border-radius: 12px;
  overflow: hidden;
}

.sql-editor {
  width: 100%;
  min-height: 160px;
  max-height: 300px;
  padding: 16px;
  background: transparent;
  border: none;
  color: $text-primary;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 13px;
  line-height: 1.6;
  resize: vertical;
  
  &::placeholder {
    color: $text-muted;
  }
  
  &:focus {
    outline: none;
  }
}

.editor-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.2);
  border-top: 1px solid $border;
}

.shortcuts {
  .shortcut {
    font-size: 11px;
    color: $text-muted;
    padding: 4px 8px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 4px;
  }
}

.actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.ai-format-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  
  input {
    width: 16px;
    height: 16px;
    accent-color: $primary;
  }
  
  .toggle-label {
    font-size: 12px;
    color: $text-secondary;
  }
}

.execute-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: linear-gradient(135deg, #00d4aa 0%, #00a8cc 100%);
  border: none;
  border-radius: 8px;
  color: #0a1628;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 16px rgba(0, 212, 170, 0.3);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(10, 22, 40, 0.3);
    border-top-color: #0a1628;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.result-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.result-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.result-table-container {
  flex: 1;
  min-height: 260px;
}

.loading-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: $text-secondary;
  
  .loading-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid rgba(0, 212, 170, 0.2);
    border-top-color: $primary;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  
  p {
    margin: 0;
    font-size: 14px;
  }
}

.error-state {
  padding: 20px;
  background: rgba($error, 0.1);
  border: 1px solid rgba($error, 0.3);
  border-radius: 12px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  
  .error-icon {
    font-size: 20px;
  }
  
  p {
    margin: 0;
    color: $error;
    font-size: 13px;
    line-height: 1.5;
  }
}

.ai-summary {
  margin-bottom: 20px;
  padding: 16px;
  background: $primary-dim;
  border: 1px solid rgba($primary, 0.3);
  border-radius: 12px;
  flex-shrink: 0;
  
  .summary-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    
    .ai-icon {
      font-size: 16px;
    }
    
    span {
      font-size: 12px;
      font-weight: 600;
      color: $primary;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    
    .streaming-indicator {
      animation: pulse 1s ease-in-out infinite;
      color: $primary;
    }

    .pending-indicator {
      margin-left: auto;
      padding: 2px 8px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      background: rgba(255, 255, 255, 0.06);
      color: $text-secondary;
      text-transform: none;
      letter-spacing: 0;
      font-size: 11px;
      font-weight: 600;
    }
  }
  
  .summary-content {
    max-height: none;
    overflow: visible;
    padding-right: 0;

    p {
      margin: 0;
      color: $text-primary;
      font-size: 14px;
      line-height: 1.7;
      overflow-wrap: anywhere;
    }
    
    .streaming-text {
      white-space: pre-wrap;
      
      &.streaming::after {
        content: '▌';
        animation: blink 0.7s infinite;
        color: $primary;
        margin-left: 2px;
      }
    }

    .pending-text {
      color: $text-secondary;
      font-style: italic;
    }
  }
}

:deep(.result-table) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

:deep(.result-table .table-wrapper) {
  flex: 1;
  min-height: 260px;
  max-height: none;
  overflow: auto;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  
  .empty-icon {
    font-size: 48px;
    opacity: 0.8;
  }
  
  p {
    margin: 0;
    color: $text-muted;
    font-size: 15px;
  }
  
  .example-queries {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    margin-top: 12px;
    
    .label {
      font-size: 12px;
      color: $text-muted;
    }
    
    .example-btn {
      padding: 8px 16px;
      background: $bg-card;
      border: 1px solid $border;
      border-radius: 20px;
      color: $text-primary;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s ease;
      
      &:hover {
        background: rgba(255, 255, 255, 0.06);
        border-color: rgba($primary, 0.3);
      }
    }
  }
}
</style>

