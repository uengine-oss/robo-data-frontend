<template>
  <div class="direct-sql-container">
    <!-- 우상단 모드 선택기 -->
    <div class="mode-selector-container">
      <button class="mode-option" @click="$emit('change-mode', 'react')" title="정밀한 AI 분석">
        <span class="opt-icon">🧠</span>
        <span class="opt-label">자연어 검색</span>
      </button>
      <button class="mode-option" @click="$emit('change-mode', 'langchain')" title="빠른 단순 검색">
        <span class="opt-icon">⚡</span>
        <span class="opt-label">빠른 검색</span>
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
        <!-- AI 요약 -->
        <div v-if="aiSummary" class="ai-summary">
          <div class="summary-header">
            <span class="ai-icon">🤖</span>
            <span>AI 분석</span>
          </div>
          <div class="summary-content">
            <TypeWriter v-if="isStreamingSummary" :text="aiSummary" :speed="15" />
            <p v-else>{{ aiSummary }}</p>
          </div>
        </div>

        <!-- 결과 테이블 -->
        <ResultTable :data="resultData" />
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
import { IconPlay } from '@/components/icons'
import ResultTable from './ResultTable.vue'
import TypeWriter from './TypeWriter.vue'
import type { ReactExecutionResult } from '@/types'

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
const formatWithAi = ref(true)

// Computed
const canExecute = computed(() => sqlText.value.trim().length > 0)
const hasResult = computed(() => result.value !== null)
const resultData = computed<ReactExecutionResult | null>(() => {
  if (!result.value) return null
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

async function executeSql() {
  if (!canExecute.value || isExecuting.value) return
  
  isExecuting.value = true
  error.value = null
  result.value = null
  aiSummary.value = ''
  isStreamingSummary.value = false
  loadingMessage.value = 'SQL 검증 중...'
  
  try {
    const response = await fetch(`${API_BASE}/direct-sql/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sql: sqlText.value,
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
    
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      
      const lines = decoder.decode(value).split('\n').filter(l => l.trim())
      
      for (const line of lines) {
        try {
          const event = JSON.parse(line)
          
          switch (event.event) {
            case 'validating':
              loadingMessage.value = 'SQL 검증 중...'
              break
            case 'executing':
              loadingMessage.value = 'SQL 실행 중...'
              break
            case 'formatting':
              loadingMessage.value = 'AI가 결과 분석 중...'
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
              aiSummary.value += event.token
              break
            case 'format_done':
              isStreamingSummary.value = false
              break
            case 'error':
              error.value = event.message
              isExecuting.value = false
              break
            case 'completed':
              isExecuting.value = false
              break
          }
        } catch (e) {
          // JSON 파싱 실패 무시
        }
      }
    }
    
  } catch (e) {
    error.value = e instanceof Error ? e.message : '알 수 없는 오류'
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
  min-height: 200px;
  display: flex;
  flex-direction: column;
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
  }
  
  .summary-content {
    p {
      margin: 0;
      color: $text-primary;
      font-size: 14px;
      line-height: 1.7;
    }
  }
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

