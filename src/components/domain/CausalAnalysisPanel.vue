<script setup lang="ts">
/**
 * CausalAnalysisPanel.vue
 * KPI/Measure 노드 원인 분석 결과 표시
 */
import { computed, ref, watch, nextTick } from 'vue'

type TopCauseItem = {
  source: string
  name: string
  score: number
  display_score: number
  grade: string
  method: string
  method_hint: string
  method_count: number
}

const props = defineProps<{
  node: { id: string; name: string; layer?: string; label?: string; dataSource?: string }
  schemaId: string | null
  nodeDataResult: {
    hasDataSource?: boolean
    chartRecommendation?: { type: string; xAxis?: string | null; yAxis?: string[] }
    numericColumns?: string[]
    timeColumns?: string[]
    columns?: string[]
    rows?: Record<string, unknown>[]
  } | null
  analysisProgress?: { step: string; message: string; detail?: unknown } | null
  streamingReport?: string | null
  analysisResult?: {
    success: boolean
    target_node_id: string
    target_metric: string
    analysis_type: string
    time_range: { start: string; end: string }
    edges: Array<{ source: string; target: string; method: string; strength: number; p_value: number; lag?: number; direction: string }>
    impact_scores: Record<string, number>
    impact_metadata?: {
      source_methods?: Record<string, string>
      method_counts?: Record<string, number>
    }
    top_causes: TopCauseItem[]
    report: string
    data_summary?: { total_nodes: number; nodes_with_data: number; data_points: number; variables: number; target_variable?: string }
    interpolation_info?: { applied: boolean; original_length: number; final_length: number; min_required: number; warning?: string | null }
    error?: {
      type: string
      message: string
      detail: string
      user_friendly_message: string
      node_status?: Record<string, {
        node_id: string
        node_name: string
        has_data_source: boolean
        data_source: string | null
        status: string
        reason: string | null
        row_count: number
        column_count: number
        numeric_column_count: number
      }>
    }
    node_status?: Record<string, {
      node_id: string
      node_name: string
      has_data_source: boolean
      data_source: string | null
      status: string
      reason: string | null
      row_count: number
      column_count: number
      numeric_column_count: number
    }>
  } | null
  analysisLoading?: boolean
  analysisError?: string | null
}>()

defineEmits<{ (e: 'analysis-complete', result: unknown): void }>()

const hasResult = computed(() => !!props.analysisResult && props.analysisResult.success)
const hasError = computed(() => !!props.analysisResult && !props.analysisResult.success && !!props.analysisResult.error)
const topCauses = computed(() => props.analysisResult?.top_causes ?? [])
const reportText = computed(() => {
  if (props.analysisResult?.error?.user_friendly_message) {
    return props.analysisResult.error.user_friendly_message
  }
  return props.analysisResult?.report ?? ''
})
const errorInfo = computed(() => props.analysisResult?.error)

/** 데이터 수집 실패가 ReadError(Text2SQL 응답 읽기 오류)인지 여부 */
const isReadError = computed(() => {
  const ns = props.analysisResult?.error?.node_status ?? props.analysisResult?.node_status
  if (!ns || typeof ns !== 'object') return false
  return Object.values(ns).some(
    (s: { reason?: string | null }) => typeof s?.reason === 'string' && s.reason.includes('ReadError')
  )
})

/** 마크다운 → HTML (XSS 방지 위해 텍스트 이스케이프 후 변환) */
function renderMarkdown(text: string): string {
  if (!text) return ''
  const escape = (s: string) =>
    String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  const inlineMd = (s: string) =>
    escape(s)
      .replace(/\*\*(.+?)\*\*/g, (_, g) => `<strong class="report-md-bold">${g}</strong>`)
      .replace(/\*(.+?)\*/g, (_, g) => `<em>${g}</em>`)
      .replace(/`(.+?)`/g, (_, g) => `<code class="report-md-code">${g}</code>`)
  const lines = text.split('\n')
  let inList = false
  let inOrderedList = false
  let html = ''
  for (let line of lines) {
    if (line.startsWith('### ')) {
      if (inList) { html += '</ul>'; inList = false }
      if (inOrderedList) { html += '</ol>'; inOrderedList = false }
      html += `<h3 class="report-md-h3">${escape(line.slice(4))}</h3>`
    } else if (line.startsWith('## ')) {
      if (inList) { html += '</ul>'; inList = false }
      if (inOrderedList) { html += '</ol>'; inOrderedList = false }
      html += `<h2 class="report-md-h2">${escape(line.slice(3))}</h2>`
    } else if (line.startsWith('# ')) {
      if (inList) { html += '</ul>'; inList = false }
      if (inOrderedList) { html += '</ol>'; inOrderedList = false }
      html += `<h1 class="report-md-h1">${escape(line.slice(2))}</h1>`
    } else if (/^\d+\.\s/.test(line)) {
      if (inList) { html += '</ul>'; inList = false }
      if (!inOrderedList) { html += '<ol class="report-md-ol">'; inOrderedList = true }
      const content = inlineMd(line.replace(/^\d+\.\s*/, ''))
      html += `<li>${content}</li>`
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      if (inOrderedList) { html += '</ol>'; inOrderedList = false }
      if (!inList) { html += '<ul class="report-md-ul">'; inList = true }
      const content = inlineMd(line.slice(2))
      html += `<li>${content}</li>`
    } else if (line.trim() === '') {
      if (inList) { html += '</ul>'; inList = false }
      if (inOrderedList) { html += '</ol>'; inOrderedList = false }
      html += '<div class="report-md-spacer"></div>'
    } else {
      if (inList) { html += '</ul>'; inList = false }
      if (inOrderedList) { html += '</ol>'; inOrderedList = false }
      const content = inlineMd(line)
      html += `<p class="report-md-p">${content}</p>`
    }
  }
  if (inList) html += '</ul>'
  if (inOrderedList) html += '</ol>'
  return html
}

const reportHtml = computed(() => renderMarkdown(reportText.value))
const streamingReportHtml = computed(() => renderMarkdown(props.streamingReport ?? ''))

const streamingReportEl = ref<HTMLElement | null>(null)
watch(
  () => props.streamingReport,
  () => {
    if (!props.streamingReport || !props.analysisLoading) return
    nextTick(() => {
      streamingReportEl.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }
)
</script>

<template>
  <div class="causal-analysis-panel">
    <div v-if="analysisLoading" class="analysis-loading">
      <div class="loading-spinner small"></div>
      <p>원인 분석 중...</p>
      <p v-if="analysisProgress?.message" class="progress-message">{{ analysisProgress.message }}</p>
      <p class="hint">인커밍 네트워크 탐색 → 데이터 수집 → VAR/Granger 분석 → 보고서 생성</p>
      <ul v-if="analysisProgress?.step" class="progress-steps">
        <li :class="{ active: analysisProgress.step === 'incoming_network' }">인커밍 네트워크 탐색</li>
        <li :class="{ active: analysisProgress.step === 'data_collection' || analysisProgress.step === 'data_collection_done' }">데이터 수집</li>
        <li :class="{ active: analysisProgress.step === 'var_analysis' }">VAR/Granger 분석</li>
        <li :class="{ active: analysisProgress.step === 'report' || analysisProgress.step === 'report_chunk' }">보고서 생성</li>
      </ul>
      <!-- 보고서 단계 진입 시 곧바로 영역 표시 → 스트리밍 내용이 실시간으로 쌓이도록 -->
      <div
        ref="streamingReportEl"
        v-if="analysisProgress?.step === 'report' || analysisProgress?.step === 'report_chunk' || streamingReport"
        class="streaming-report report-content report-md"
      >
        <span v-if="streamingReport" v-html="streamingReportHtml"></span>
        <span v-else class="streaming-placeholder">보고서를 생성하고 있습니다...</span>
        <span class="streaming-cursor" aria-hidden="true">|</span>
      </div>
    </div>

    <!-- 에러가 있는 경우 (analysisResult.error 또는 analysisError) -->
    <div v-else-if="hasError && analysisResult" class="analysis-error-detail">
      <div class="error-header">
        <span class="error-icon">⚠️</span>
        <h4>{{ errorInfo?.message || '분석 오류' }}</h4>
      </div>
      <div v-if="isReadError" class="read-error-tip">
        <strong>💡 Text2SQL 서비스 연결/응답 오류</strong> — 데이터 소스에서 조회할 때 응답 읽기에 실패했습니다.
        Text2SQL 서비스(기본 포트 8000)가 실행 중인지, 도메인 서비스에서 해당 주소로 접근 가능한지 확인하세요.
        (Docker 사용 시 <code>TEXT2SQL_API_URL</code>을 호스트 주소로 설정)
      </div>
      <div class="error-content">
        <div class="error-message report-content report-md" v-html="reportHtml"></div>
        <div v-if="analysisResult.data_summary" class="error-data-info">
          <p><strong>데이터 요약:</strong></p>
          <ul>
            <li>인커밍 네트워크 노드: {{ analysisResult.data_summary.total_nodes }}개</li>
            <li>데이터 수집 성공: {{ analysisResult.data_summary.nodes_with_data }}개</li>
            <li>데이터 포인트: {{ analysisResult.data_summary.data_points }}개</li>
            <li>변수 수: {{ analysisResult.data_summary.variables }}개</li>
            <li v-if="analysisResult.data_summary.target_variable">타겟 변수: {{ analysisResult.data_summary.target_variable }}</li>
          </ul>
        </div>
        <div v-if="analysisResult.interpolation_info?.applied" class="interpolation-info">
          <p><strong>보간 정보:</strong></p>
          <ul>
            <li>원본 데이터: {{ analysisResult.interpolation_info.original_length }}행</li>
            <li>보간 후: {{ analysisResult.interpolation_info.final_length }}행</li>
            <li v-if="analysisResult.interpolation_info.warning" class="warning-text">
              ⚠️ {{ analysisResult.interpolation_info.warning }}
            </li>
          </ul>
        </div>
        <div v-if="analysisResult.node_status && Object.keys(analysisResult.node_status).length > 0" class="node-status-info">
          <p><strong>노드별 상세 상태:</strong></p>
          <div class="node-status-list">
            <div 
              v-for="(status, nodeId) in analysisResult.node_status" 
              :key="nodeId"
              class="node-status-item"
              :class="{
                'status-success': status.status === 'success',
                'status-skipped': status.status === 'skipped',
                'status-failed': status.status === 'failed',
                'status-error': status.status === 'error'
              }"
            >
              <div class="node-status-header">
                <span class="node-name">{{ status.node_name }}</span>
                <span class="node-id">({{ status.node_id }})</span>
                <span class="status-badge" :class="'badge-' + status.status">
                  {{ status.status === 'success' ? '✅ 성공' : 
                     status.status === 'skipped' ? '⏭️ 스킵' : 
                     status.status === 'failed' ? '❌ 실패' : '⚠️ 오류' }}
                </span>
              </div>
              <div class="node-status-details">
                <div v-if="status.has_data_source" class="detail-row">
                  <span class="detail-label">데이터 소스:</span>
                  <code>{{ status.data_source }}</code>
                </div>
                <div v-if="status.status === 'success'" class="detail-row">
                  <span class="detail-label">데이터:</span>
                  <span>{{ status.row_count }}행, {{ status.numeric_column_count }}개 수치형 컬럼</span>
                </div>
                <div v-if="status.reason" class="detail-row">
                  <span class="detail-label">사유:</span>
                  <span class="reason-text">{{ status.reason }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="analysisError" class="analysis-error">
      <span class="error-icon">⚠️</span>
      <p>{{ analysisError }}</p>
    </div>

    <template v-else-if="hasResult && analysisResult">
      <div class="analysis-header">
        <h4>원인 분석 결과</h4>
        <span class="meta">
          {{ analysisResult.time_range?.start }} ~ {{ analysisResult.time_range?.end }}
          · {{ analysisResult.analysis_type === 'increase' ? '상승' : '하락' }} 구간
        </span>
      </div>

      <div class="impact-section">
        <h5>주요 원인 후보</h5>
        <div v-if="topCauses.length > 0" class="impact-bars">
          <div
            v-for="cause in topCauses.slice(0, 8)"
            :key="cause.source"
            class="impact-row"
          >
            <div class="impact-main">
              <span class="var-name">{{ cause.name }}</span>
              <span class="score">{{ Math.round(cause.display_score * 100) }}%</span>
            </div>
            <div class="bar-wrap">
              <div class="bar" :style="{ width: Math.min(100, cause.display_score * 100) + '%' }"></div>
            </div>
            <div class="impact-meta">
              <span class="grade">{{ cause.grade }}</span>
              <span class="method-hint">{{ cause.method_hint }}</span>
            </div>
          </div>
        </div>
        <p v-else class="impact-empty">우선 검토할 후보가 없습니다.</p>
      </div>

      <div class="report-section">
        <h5>분석 보고서</h5>
        <div class="report-content report-md" v-html="reportHtml"></div>
      </div>

      <div v-if="analysisResult.data_summary" class="data-summary">
        <span>노드 {{ analysisResult.data_summary.nodes_with_data }}개 데이터 사용</span>
        <span>·</span>
        <span>{{ analysisResult.data_summary.data_points }}개 시점</span>
      </div>
    </template>

    <div v-else class="analysis-empty">
      <div class="empty-icon">🔍</div>
      <p><strong>원인 분석</strong></p>
      <p class="hint">
        데이터 탭에서 라인 차트의 구간을 드래그하여 선택한 뒤, 나타나는 팝업에서
        <strong>「이 구간이 상승/하락한 이유를 분석」</strong>을 선택하세요.
      </p>
      <p class="sub">분석 결과가 이 영역에 표시됩니다.</p>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.causal-analysis-panel {
  padding: 0 4px;
  font-size: 13px;
  color: var(--color-text, #e2e8f0);
}

.analysis-loading,
.analysis-error,
.analysis-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 160px;
  text-align: center;
  color: var(--color-text-muted, #888);
}

.analysis-loading .loading-spinner,
.analysis-loading p,
.analysis-error p,
.analysis-empty p {
  margin: 6px 0;
}

.analysis-loading .hint,
.analysis-empty .hint {
  font-size: 12px;
  max-width: 280px;
  line-height: 1.4;
}

.analysis-loading .progress-message {
  font-weight: 600;
  color: var(--color-text, #333);
  margin: 4px 0 8px;
}

.analysis-loading .progress-steps {
  list-style: none;
  padding: 0;
  margin: 12px 0 0;
  text-align: left;
  font-size: 12px;
  color: var(--color-text-muted, #888);
}

.analysis-loading .progress-steps li {
  padding: 4px 0;
  padding-left: 16px;
  position: relative;
}

.analysis-loading .progress-steps li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 10px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.4;
}

.analysis-loading .progress-steps li.active {
  color: var(--color-primary, #3b82f6);
  font-weight: 500;
}

.analysis-loading .progress-steps li.active::before {
  opacity: 1;
  box-shadow: 0 0 0 2px currentColor;
}

.analysis-loading .streaming-report {
  width: 100%;
  margin-top: 12px;
  padding: 10px;
  background: var(--color-bg-subtle, #f5f5f5);
  border-radius: 6px;
  text-align: left;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  line-height: 1.5;
  /* 내부 스크롤 없음: 패널 전체 스크롤 사용 */
}

.analysis-empty .empty-icon {
  font-size: 32px;
  margin-bottom: 8px;
}

.analysis-empty .sub {
  font-size: 11px;
  opacity: 0.8;
}

.analysis-error .error-icon {
  font-size: 28px;
  margin-bottom: 4px;
}

.analysis-error p {
  color: #ef4444;
}

.analysis-error-detail {
  padding: 12px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
  margin-bottom: 12px;
}

.error-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.error-header .error-icon {
  font-size: 20px;
}

.error-header h4 {
  margin: 0;
  font-size: 14px;
  color: #ef4444;
  font-weight: 600;
}

.read-error-tip {
  margin: 8px 0 12px;
  padding: 10px 12px;
  background: rgba(234, 179, 8, 0.12);
  border: 1px solid rgba(234, 179, 8, 0.4);
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-text, #e5e7eb);
}

.read-error-tip code {
  font-size: 11px;
  padding: 2px 4px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
}

.error-content {
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text, #e2e8f0);
}

.error-message {
  margin-bottom: 12px;
  padding: 12px;
  background: rgba(0, 0, 0, 0.25);
  border-radius: 6px;
  color: #f1f5f9;
  font-size: 13px;
  font-weight: 500;
}

.error-data-info,
.interpolation-info {
  margin-top: 12px;
  padding: 12px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 6px;
  font-size: 12px;
}

.error-data-info p,
.interpolation-info p {
  margin: 0 0 6px 0;
  font-weight: 600;
  color: #cbd5e1;
  font-size: 13px;
}

.error-data-info ul,
.interpolation-info ul {
  margin: 0;
  padding-left: 20px;
  color: #e2e8f0;
  font-size: 12px;
}

.error-data-info li,
.interpolation-info li {
  margin: 4px 0;
}

.warning-text {
  color: #f59e0b;
  font-weight: 500;
}

.node-status-info {
  margin-top: 12px;
  padding: 12px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 6px;
  font-size: 12px;
}

.node-status-info p {
  margin: 0 0 8px 0;
  font-weight: 600;
  color: #cbd5e1;
  font-size: 13px;
}

.node-status-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.node-status-item {
  padding: 8px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  border-left: 3px solid #666;
}

.node-status-item.status-success {
  border-left-color: #10b981;
}

.node-status-item.status-skipped {
  border-left-color: #6b7280;
}

.node-status-item.status-failed {
  border-left-color: #f59e0b;
}

.node-status-item.status-error {
  border-left-color: #ef4444;
}

.node-status-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}

.node-name {
  font-weight: 600;
  color: #e2e8f0;
  font-size: 12px;
}

.node-id {
  font-size: 11px;
  color: #94a3b8;
  font-family: monospace;
}

.status-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 3px;
  font-weight: 500;
}

.badge-success {
  background: rgba(16, 185, 129, 0.2);
  color: #10b981;
}

.badge-skipped {
  background: rgba(107, 114, 128, 0.2);
  color: #9ca3af;
}

.badge-failed {
  background: rgba(245, 158, 11, 0.2);
  color: #f59e0b;
}

.badge-error {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.node-status-details {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #e2e8f0;
}

.detail-row {
  display: flex;
  gap: 8px;
  align-items: baseline;
}

.detail-label {
  font-weight: 600;
  color: #94a3b8;
  min-width: 80px;
  font-size: 12px;
}

.detail-row code {
  font-size: 11px;
  background: rgba(0, 0, 0, 0.3);
  padding: 2px 6px;
  border-radius: 4px;
  color: #e2e8f0;
}

.reason-text {
  color: #e2e8f0;
  flex: 1;
  font-size: 12px;
  font-weight: 500;
}

.analysis-header {
  margin-bottom: 12px;
}

.analysis-header h4 {
  margin: 0 0 4px 0;
  font-size: 14px;
}

.analysis-header .meta {
  font-size: 11px;
  color: var(--color-text-muted, #888);
}

.impact-section,
.report-section {
  margin-bottom: 14px;
}

.impact-section h5,
.report-section h5 {
  margin: 0 0 8px 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-muted, #888);
}

.impact-bars {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.impact-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.impact-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.impact-row .var-name {
  flex: 1;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.impact-row .bar-wrap {
  flex: 1;
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  overflow: hidden;
}

.impact-row .bar {
  height: 100%;
  background: linear-gradient(90deg, #06b6d4, #8b5cf6);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.impact-row .score {
  font-size: 11px;
  text-align: right;
  font-weight: 600;
}

.impact-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--color-text-muted, #888);
}

.impact-meta .grade {
  color: var(--color-text, #e2e8f0);
  font-weight: 600;
}

.impact-empty {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-muted, #888);
}

.report-content {
  padding: 14px 16px;
  background: #f2f4f6;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.85;
  letter-spacing: 0.04em;
}

.report-content.report-pre {
  white-space: pre-wrap;
  word-break: break-word;
}

/* 마크다운 포맷팅 */
.report-content.report-md {
  white-space: normal;
  word-break: break-word;
}

/* v-html 내부 마크다운에 적용 ( :deep ) */
.report-content.report-md :deep(.report-md-h1) {
  font-size: 1.25rem;
  font-weight: 700;
  margin: 0 0 0.75rem 0;
  padding-bottom: 0.35rem;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  color: var(--color-text, #1e293b);
  line-height: 1.55;
}

.report-content.report-md :deep(.report-md-h2) {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 1.2rem 0 0.6rem 0;
  color: var(--color-text, #334155);
  line-height: 1.55;
}

.report-content.report-md :deep(.report-md-h3) {
  font-size: 1rem;
  font-weight: 600;
  margin: 0.9rem 0 0.5rem 0;
  color: var(--color-text, #475569);
  line-height: 1.55;
}

.report-content.report-md :deep(.report-md-p) {
  margin: 0 0 0.75rem 0;
  color: var(--color-text-muted, #475569);
  line-height: 1.85;
  letter-spacing: 0.04em;
}

.report-content.report-md :deep(.report-md-ul),
.report-content.report-md :deep(.report-md-ol) {
  margin: 0.6rem 0 1rem 0;
  padding-left: 1.5rem;
  padding-right: 0.5rem;
  list-style-position: inside;
  color: var(--color-text-muted, #475569);
}

.report-content.report-md :deep(.report-md-ul) {
  list-style-type: disc;
}

.report-content.report-md :deep(.report-md-ol) {
  list-style-type: decimal;
}

.report-content.report-md :deep(.report-md-ul li),
.report-content.report-md :deep(.report-md-ol li) {
  margin-bottom: 0.5rem;
  line-height: 1.85;
  letter-spacing: 0.04em;
  padding-left: 0.35rem;
}

.report-content.report-md :deep(.report-md-bold) {
  font-weight: 600;
  color: var(--color-text, #1e293b);
}

.report-content.report-md :deep(.report-md-code) {
  padding: 0.15em 0.4em;
  font-size: 0.9em;
  background: rgba(0, 0, 0, 0.06);
  border-radius: 4px;
  font-family: ui-monospace, monospace;
  color: #334155;
}

.report-content.report-md :deep(.report-md-spacer) {
  height: 0.6rem;
}

.analysis-loading .streaming-report.report-md {
  background: #f2f4f6;
  min-height: 120px;
}

.analysis-loading .streaming-placeholder {
  color: var(--color-text-muted, #94a3b8);
  font-size: 0.9em;
}

.analysis-loading .streaming-cursor {
  display: inline-block;
  margin-left: 2px;
  color: var(--color-primary, #3b82f6);
  font-weight: 300;
  animation: blink 0.9s step-end infinite;
}

@keyframes blink {
  50% { opacity: 0; }
}

.data-summary {
  font-size: 11px;
  color: var(--color-text-muted, #888);
  margin-top: 8px;
}

.data-summary span + span {
  margin-left: 4px;
}
</style>
