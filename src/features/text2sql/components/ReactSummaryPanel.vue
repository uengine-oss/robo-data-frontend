<template>
  <div class="summary-panel">
    <div class="status-banner">
      <div class="status-text">
        <span :class="['status-label', statusClass]">
          <span class="status-icon">{{ statusIcon }}</span>
          {{ statusLabel }}
        </span>
        <span v-if="currentStep" class="step-indicator">Step {{ currentStep }}</span>
      </div>
      <div class="status-meta">
        <div class="meta-item">
          <span>남은 호출: <strong>{{ remainingToolCalls }}</strong></span>
        </div>
        <div v-if="latestToolName" class="meta-item tool-name">
          <span>최근 도구: <strong>{{ latestToolName }}</strong></span>
        </div>
        <div v-if="sqlCompleteness" class="meta-item completeness">
          <span>완성도: <strong>{{ sqlCompleteness.confidence_level }}</strong></span>
        </div>
        <div v-if="warnings.length" class="meta-item warning">
          <span>경고: <strong>{{ warnings.length }}</strong>건</span>
        </div>
      </div>
    </div>

    <div class="sql-section" v-if="partialSql">
      <div class="section-header">
        <h3>현재 SQL 스냅샷</h3>
        <button class="btn-copy" type="button" @click="copyPartialSql">
          <IconCopy :size="12" />
          복사
        </button>
      </div>
      <div class="sql-content">
        <pre><code>{{ partialSql }}</code></pre>
      </div>
    </div>

    <div class="sql-section" v-if="finalSql">
      <div class="section-header final">
        <h3>최종 SQL</h3>
        <button class="btn-copy" type="button" @click="copyFinalSql">
          <IconCopy :size="12" />
          복사
        </button>
      </div>
      <div class="sql-content">
        <pre><code>{{ finalSql }}</code></pre>
      </div>
    </div>

    <div class="sql-section" v-if="validatedSql && validatedSql !== finalSql">
      <div class="section-header validated">
        <h3>검증된 SQL</h3>
        <button class="btn-copy" type="button" @click="copyValidatedSql">
          <IconCopy :size="12" />
          복사
        </button>
      </div>
      <div class="sql-content">
        <pre><code>{{ validatedSql }}</code></pre>
      </div>
    </div>

    <div class="warning-section" v-if="warnings.length">
      <h3>
        <IconAlertTriangle :size="14" />
        경고
      </h3>
      <ul>
        <li v-for="warning in warnings" :key="warning">{{ warning }}</li>
      </ul>
    </div>

    <div class="metadata-section" v-if="collectedMetadata">
      <details>
        <summary>수집된 메타데이터 보기</summary>
        <pre><code>{{ collectedMetadata }}</code></pre>
      </details>
    </div>

    <div class="result-section" v-if="executionResult">
      <ResultTable :data="executionResult" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import ResultTable from './ResultTable.vue'
import type { ReactExecutionResult, ReactStepModel } from '@/types'
import { IconCopy, IconAlertTriangle } from '@/components/icons'

const props = defineProps<{
  status: 'idle' | 'running' | 'needs_user_input' | 'completed' | 'error'
  partialSql: string | null
  finalSql: string | null
  validatedSql: string | null
  warnings: string[]
  executionResult: ReactExecutionResult | null
  collectedMetadata: string
  remainingToolCalls: number
  currentStep?: number
  isRunning?: boolean
  latestStep?: ReactStepModel | null
}>()

const statusLabel = computed(() => {
  switch (props.status) {
    case 'running': return '에이전트 실행 중'
    case 'needs_user_input': return '추가 입력 대기 중'
    case 'completed': return '완료'
    case 'error': return '오류 발생'
    default: return '대기'
  }
})

const statusClass = computed(() => {
  switch (props.status) {
    case 'running': return 'running'
    case 'needs_user_input': return 'waiting'
    case 'completed': return 'completed'
    case 'error': return 'error'
    default: return 'idle'
  }
})

const statusIcon = computed(() => {
  switch (props.status) {
    case 'running': return '⚡'
    case 'needs_user_input': return '💬'
    case 'completed': return '✓'
    case 'error': return '✕'
    default: return '○'
  }
})

const latestToolName = computed(() => props.latestStep?.tool_call?.name ?? null)
const sqlCompleteness = computed(() => props.latestStep?.sql_completeness ?? null)

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text)
}

function copyPartialSql() {
  if (props.partialSql) copyToClipboard(props.partialSql)
}

function copyFinalSql() {
  if (props.finalSql) copyToClipboard(props.finalSql)
}

function copyValidatedSql() {
  if (props.validatedSql) copyToClipboard(props.validatedSql)
}
</script>

<style scoped lang="scss">
.summary-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.status-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 16px 20px;
  flex-wrap: wrap;
  gap: 16px;
}

.status-text {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status-label {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: var(--radius-md);
  font-weight: 600;
  font-size: 14px;
}

.status-icon {
  font-size: 14px;
}

.status-label.idle {
  background: var(--color-bg-tertiary);
  color: var(--color-text-light);
}

.status-label.running {
  background: rgba(34, 139, 230, 0.2);
  color: var(--color-accent);
  animation: pulse 2s ease-in-out infinite;
}

.status-label.waiting {
  background: rgba(251, 191, 36, 0.2);
  color: var(--color-warning);
}

.status-label.completed {
  background: rgba(64, 192, 87, 0.2);
  color: var(--color-success);
}

.status-label.error {
  background: rgba(250, 82, 82, 0.2);
  color: var(--color-error);
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(34, 139, 230, 0.3); }
  50% { box-shadow: 0 0 0 4px rgba(34, 139, 230, 0); }
}

.step-indicator {
  padding: 6px 12px;
  background: rgba(34, 139, 230, 0.15);
  border: 1px solid var(--color-accent);
  border-radius: 12px;
  color: var(--color-accent);
  font-weight: 600;
  font-size: 12px;
}

.status-meta {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  align-items: center;
}

.meta-item {
  font-size: 13px;
  color: var(--color-text-light);
  white-space: nowrap;
}

.meta-item strong {
  color: var(--color-text);
  font-weight: 700;
}

.meta-item.warning {
  color: var(--color-warning);
}

.meta-item.tool-name {
  color: var(--color-accent-secondary);
}

.meta-item.completeness {
  color: var(--color-success);
}

.sql-section {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: linear-gradient(135deg, var(--color-accent-secondary), #5b21b6);
}

.section-header.final {
  background: linear-gradient(135deg, var(--color-success), #059669);
}

.section-header.validated {
  background: linear-gradient(135deg, var(--color-accent), #1c7ed6);
}

.section-header h3 {
  margin: 0;
  color: white;
  font-size: 14px;
  font-weight: 600;
}

.btn-copy {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.2);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  transition: all 0.15s;
}

.btn-copy:hover {
  background: rgba(255, 255, 255, 0.3);
}

.sql-content {
  background: var(--color-bg-tertiary);
  padding: 16px;
  max-height: 250px;
  overflow: auto;
}

.sql-content pre {
  margin: 0;
  color: var(--color-text);
  font-family: var(--font-mono);
  font-size: 13px;
  white-space: pre-wrap;
}

.sql-content code {
  color: var(--color-accent);
}

.warning-section {
  background: rgba(251, 191, 36, 0.1);
  border-left: 3px solid var(--color-warning);
  padding: 16px;
  border-radius: var(--radius-lg);
}

.warning-section h3 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 8px 0;
  color: var(--color-warning);
  font-size: 14px;
}

.warning-section ul {
  margin: 0;
  padding-left: 20px;
  color: var(--color-text);
  font-size: 13px;
}

.warning-section li {
  margin-bottom: 4px;
}

.metadata-section details {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.metadata-section summary {
  padding: 12px 16px;
  cursor: pointer;
  color: var(--color-accent);
  font-weight: 600;
  font-size: 13px;
  background: var(--color-bg-tertiary);
  transition: all 0.15s;
}

.metadata-section summary:hover {
  background: var(--color-bg-elevated);
}

.metadata-section pre {
  margin: 0;
  padding: 16px;
  background: var(--color-bg-tertiary);
  color: var(--color-text);
  font-family: var(--font-mono);
  font-size: 12px;
  overflow-x: auto;
  white-space: pre-wrap;
  border-top: 1px solid var(--color-border);
}

.result-section {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}
</style>
