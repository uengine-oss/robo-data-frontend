<template>
  <section class="data-literacy">
    <header class="page-header">
      <div>
        <h3>What-If 분석 결과 해석</h3>
        <p>발견된 인과관계와 모델 비교 결과를 확인하고 AI 설명 보고서를 생성합니다.</p>
      </div>
    </header>

    <section class="result-section" aria-labelledby="causal-result-title">
      <div class="section-header">
        <div>
          <h4 id="causal-result-title">실제 인과관계 경로</h4>
          <p>Causal Discovery 응답의 관계 강도와 분석 방법을 그대로 표시합니다.</p>
        </div>
        <button
          type="button"
          class="graph-button"
          :disabled="causalGraph.edges.length === 0"
          :title="causalGraph.edges.length > 0 ? '인과관계 상세 그래프 열기' : '실제 인과관계 결과가 필요합니다'"
          @click="graphOpen = true"
        >
          상세 그래프
        </button>
      </div>

      <div v-if="causalResult" class="summary-grid">
        <article><span>전체 관계</span><strong>{{ causalResult.summary.total_edges }}</strong></article>
        <article><span>강한 관계</span><strong>{{ causalResult.summary.strong_edges }}</strong></article>
        <article><span>양의 영향</span><strong class="positive">{{ causalResult.summary.positive_count }}</strong></article>
        <article><span>음의 영향</span><strong class="negative">{{ causalResult.summary.negative_count }}</strong></article>
      </div>

      <div v-if="causalGraph.paths.length > 0" class="path-list">
        <article v-for="(path, pathIndex) in causalGraph.paths" :key="path.edgeIds.join('|')" class="path-card">
          <div class="path-header">
            <strong>경로 {{ pathIndex + 1 }}</strong>
            <span :class="['strength-badge', path.strength]">
              평균 강도 {{ formatUnsignedStrength(path.averageStrength) }}
            </span>
          </div>

          <div class="path-flow">
            <template v-for="(nodeId, nodeIndex) in path.nodeIds" :key="`${pathIndex}-${nodeId}`">
              <div class="path-node">
                <span>{{ nodeRoleIcon(nodeId) }}</span>
                <strong>{{ nodeLabel(nodeId) }}</strong>
              </div>
              <div v-if="nodeIndex < path.edgeIds.length" class="path-edge">
                <span :class="edgeStrengthClass(path.edgeIds[nodeIndex])">
                  {{ formatSignedStrength(edgeFor(path.edgeIds[nodeIndex] ?? '')?.signedStrength ?? 0) }}
                </span>
                <small>{{ edgeFor(path.edgeIds[nodeIndex] ?? '')?.method || '분석 방법 미제공' }}</small>
                <i aria-hidden="true">→</i>
              </div>
            </template>
          </div>
        </article>
      </div>

      <div v-else class="empty-state" role="status">
        <strong>표시할 인과관계 결과가 없습니다.</strong>
        <span>앞 단계에서 Causal Discovery가 성공하면 실제 관계 경로가 여기에 표시됩니다.</span>
      </div>
    </section>

    <section class="report-section" aria-labelledby="literacy-report-title">
      <div class="section-header">
        <div>
          <h4 id="literacy-report-title">AI 데이터 리터러시 보고서</h4>
          <p>선택한 범위와 언어가 실제 설명 API 요청에 전달됩니다.</p>
        </div>
      </div>

      <div class="report-controls">
        <div class="report-types" role="group" aria-label="보고서 종류">
          <button
            v-for="type in reportTypes"
            :key="type.id"
            type="button"
            :class="{ active: selectedReportType === type.id }"
            @click="selectedReportType = type.id"
          >
            <span>{{ type.icon }}</span>{{ type.name }}
          </button>
        </div>

        <div class="generate-controls">
          <div class="language-toggle" role="group" aria-label="보고서 언어">
            <button type="button" :class="{ active: language === 'ko' }" @click="language = 'ko'">한국어</button>
            <button type="button" :class="{ active: language === 'en' }" @click="language = 'en'">English</button>
          </div>
          <button
            type="button"
            class="generate-button"
            :disabled="loading || !sessionId"
            @click="emit('generate', selectedReportType, language)"
          >
            {{ loading ? '보고서 생성 중…' : `${reportTypeName(selectedReportType)} 생성` }}
          </button>
        </div>
      </div>

      <div v-if="!sessionId" class="inline-notice" role="status">
        실제 분석 세션이 있어야 보고서를 생성할 수 있습니다.
      </div>

      <article v-if="explanation" class="report-result">
        <header>
          <div>
            <span>{{ languageLabel(explanation.language) }}</span>
            <h5>{{ reportTypeName(explanation.report_type) }}</h5>
          </div>
          <div class="result-actions">
            <button type="button" @click="copyReport">복사</button>
            <button type="button" @click="downloadReport">Markdown 저장</button>
          </div>
        </header>
        <div class="report-content" v-html="renderedExplanation"></div>
        <p v-if="copyStatus" class="copy-status" role="status">{{ copyStatus }}</p>
      </article>
    </section>

    <CausalExplainabilityModal
      :open="graphOpen"
      :causal-result="causalResult"
      :comparison-result="comparisonResult"
      @close="graphOpen = false"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { CausalDiscoveryResult, ComparisonResult, LiteracyExplanation } from '../model/contracts'
import {
  buildExplainabilityGraph,
  formatSignedStrength,
  type ExplainabilityEdge,
} from '../model/explainability'
import { renderReportMarkdown } from '../model/reportMarkdown'
import CausalExplainabilityModal from './CausalExplainabilityModal.vue'

type ReportType = 'summary' | 'discovery' | 'validation' | 'comparison'

const props = defineProps<{
  sessionId: string | null
  explanation: LiteracyExplanation | null
  loading: boolean
  causalResult: CausalDiscoveryResult | null
  comparisonResult: ComparisonResult | null
}>()

const emit = defineEmits<{
  (event: 'generate', reportType: ReportType, language: 'ko' | 'en'): void
}>()

const reportTypes = [
  { id: 'summary', name: '종합 요약', icon: '📋' },
  { id: 'discovery', name: '인과관계', icon: '🔗' },
  { id: 'validation', name: '검증 결과', icon: '✅' },
  { id: 'comparison', name: '모델 비교', icon: '⚖️' },
] as const

const selectedReportType = ref<ReportType>('summary')
const language = ref<'ko' | 'en'>('ko')
const graphOpen = ref(false)
const copyStatus = ref('')
const causalGraph = computed(() => props.causalResult
  ? buildExplainabilityGraph(props.causalResult)
  : { nodes: [], edges: [], paths: [], inputIds: [], outputIds: [] })
const renderedExplanation = computed(() => renderReportMarkdown(props.explanation?.explanation ?? ''))

function edgeFor(edgeId: string): ExplainabilityEdge | undefined {
  return causalGraph.value.edges.find(edge => edge.id === edgeId)
}

function edgeStrengthClass(edgeId: string | undefined): 'positive' | 'negative' {
  return edgeId && (edgeFor(edgeId)?.signedStrength ?? 0) < 0 ? 'negative' : 'positive'
}

function nodeLabel(nodeId: string): string {
  return causalGraph.value.nodes.find(node => node.id === nodeId)?.label ?? nodeId
}

function nodeRoleIcon(nodeId: string): string {
  const role = causalGraph.value.nodes.find(node => node.id === nodeId)?.role
  if (role === 'input') return '◉'
  if (role === 'output') return '◆'
  return '●'
}

function formatUnsignedStrength(value: number): string {
  return `${(Math.abs(value) * 100).toFixed(1)}%`
}

function reportTypeName(type: string): string {
  return reportTypes.find(report => report.id === type)?.name ?? type
}

function languageLabel(value: string): string {
  if (value === 'ko') return '한국어'
  if (value === 'en') return 'English'
  return value
}

async function copyReport() {
  if (!props.explanation?.explanation) return
  try {
    await navigator.clipboard.writeText(props.explanation.explanation)
    copyStatus.value = '보고서를 클립보드에 복사했습니다.'
  } catch {
    copyStatus.value = '클립보드에 복사하지 못했습니다.'
  }
}

function downloadReport() {
  if (!props.explanation) return
  const blob = new Blob([props.explanation.explanation], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `whatif-${props.explanation.report_type}-${props.explanation.language}.md`
  anchor.click()
  URL.revokeObjectURL(url)
}
</script>

<style scoped>
.data-literacy {
  display: grid;
  gap: 22px;
  padding: clamp(16px, 2vw, 28px);
  color: #e2e8f0;
}

.page-header h3, .section-header h4 { margin: 0; color: #f8fafc; }
.page-header h3 { font-size: clamp(20px, 2vw, 26px); }
.page-header p, .section-header p { margin: 7px 0 0; color: #94a3b8; line-height: 1.5; }
.result-section, .report-section {
  overflow: hidden;
  border: 1px solid #334155;
  border-radius: 14px;
  background: #111827;
}
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
  border-bottom: 1px solid #28364a;
}
.graph-button, .generate-button {
  min-height: 40px;
  border: 1px solid #0891b2;
  border-radius: 8px;
  background: #0e7490;
  color: white;
  font-weight: 700;
  cursor: pointer;
  padding: 0 16px;
}
.graph-button:disabled, .generate-button:disabled { cursor: not-allowed; opacity: .48; }
.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  padding: 18px 20px 0;
}
.summary-grid article { display: grid; gap: 5px; padding: 14px; border: 1px solid #334155; border-radius: 10px; background: #0f172a; }
.summary-grid span { color: #94a3b8; font-size: 12px; }
.summary-grid strong { font-size: 22px; }
.positive { color: #34d399; }
.negative { color: #f87171; }
.path-list { display: grid; gap: 12px; padding: 18px 20px 20px; }
.path-card { padding: 16px; border: 1px solid #334155; border-radius: 10px; background: #0b1220; }
.path-header { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 14px; }
.strength-badge { padding: 3px 8px; border-radius: 999px; background: #334155; color: #cbd5e1; font-size: 11px; }
.strength-badge.high { background: rgba(16, 185, 129, .16); color: #6ee7b7; }
.strength-badge.medium { background: rgba(245, 158, 11, .16); color: #fbbf24; }
.path-flow { display: flex; align-items: center; gap: 10px; overflow-x: auto; padding: 4px 2px 10px; }
.path-node { display: inline-flex; align-items: center; gap: 7px; min-width: max-content; padding: 10px 12px; border: 1px solid #475569; border-radius: 8px; background: #1e293b; }
.path-node span { color: #38bdf8; }
.path-edge { display: grid; place-items: center; min-width: 90px; gap: 2px; }
.path-edge small { color: #64748b; white-space: nowrap; }
.path-edge i { color: #94a3b8; font-size: 20px; font-style: normal; }
.empty-state { display: grid; place-items: center; gap: 7px; min-height: 170px; padding: 24px; color: #94a3b8; text-align: center; }
.empty-state strong { color: #cbd5e1; }
.report-controls { display: grid; gap: 16px; padding: 18px 20px; }
.report-types { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.report-types button, .language-toggle button, .result-actions button {
  border: 1px solid #475569;
  border-radius: 8px;
  background: #1e293b;
  color: #cbd5e1;
  cursor: pointer;
}
.report-types button { min-height: 46px; }
.report-types button.active, .language-toggle button.active { border-color: #22d3ee; background: rgba(8, 145, 178, .2); color: #67e8f9; }
.generate-controls { display: flex; justify-content: space-between; gap: 14px; }
.language-toggle { display: flex; }
.language-toggle button { min-width: 82px; padding: 8px 12px; }
.inline-notice { margin: 0 20px 18px; padding: 12px 14px; border: 1px solid #854d0e; border-radius: 8px; background: rgba(133, 77, 14, .16); color: #fbbf24; }
.report-result { margin: 0 20px 20px; overflow: hidden; border: 1px solid #334155; border-radius: 10px; background: #0f172a; }
.report-result > header { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 14px 16px; border-bottom: 1px solid #334155; }
.report-result h5 { margin: 4px 0 0; font-size: 17px; }
.report-result header span { color: #38bdf8; font-size: 11px; }
.result-actions { display: flex; gap: 8px; }
.result-actions button { padding: 8px 11px; }
.report-content { padding: 18px; color: #dbeafe; line-height: 1.7; }
.copy-status { margin: 0; padding: 0 18px 16px; color: #67e8f9; font-size: 13px; }

:deep(.md-h1), :deep(.md-h2), :deep(.md-h3) { margin: 20px 0 8px; color: #f8fafc; }
:deep(.md-h1:first-child), :deep(.md-h2:first-child), :deep(.md-h3:first-child) { margin-top: 0; }
:deep(.md-paragraph) { margin: 8px 0; }
:deep(.md-list) { margin: 8px 0; padding-left: 22px; }
:deep(.md-code) { border-radius: 4px; background: #1e293b; padding: 2px 5px; color: #fbbf24; }
:deep(.md-spacer) { height: 8px; }

@media (max-width: 760px) {
  .section-header, .generate-controls, .report-result > header { align-items: stretch; flex-direction: column; }
  .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .report-types { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .generate-button { width: 100%; }
  .result-actions button { flex: 1; }
}
</style>
