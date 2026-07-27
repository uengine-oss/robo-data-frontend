<template>
  <div class="validation-compare">
    <h3 class="section-title">✅ 모델 검증 및 예측 비교</h3>

    <!-- 검증 요약 -->
    <div v-if="validationResult" class="validation-summary">
      <h4 class="subsection-title">📊 검증 결과 요약</h4>

      <div class="summary-grid">
        <div class="summary-stat">
          <div class="stat-value">{{ validationResult.total_validated }}</div>
          <div class="stat-label">검증된 모델</div>
        </div>
        <div class="summary-stat good">
          <div class="stat-value">{{ validationResult.valid_count }}</div>
          <div class="stat-label">유효한 모델</div>
        </div>
        <div class="summary-stat warning">
          <div class="stat-value">{{ validationResult.overfit_count }}</div>
          <div class="stat-label">과적합 의심</div>
        </div>
        <div class="summary-stat" :class="getR2Class(validationResult.mean_r_squared)">
          <div class="stat-value">{{ (validationResult.mean_r_squared * 100).toFixed(1) }}%</div>
          <div class="stat-label">평균 R²</div>
        </div>
      </div>
    </div>

    <!-- 실제 모델 비교 및 예측 -->
    <div class="mindsdb-compare">
      <h4 class="subsection-title">⚖️ {{ comparisonHeading }}</h4>
      <p class="compare-desc">{{ comparisonDescription }}</p>
      <div
        v-if="comparisonResult?.warning"
        class="comparison-warning"
        role="status"
      >
        {{ comparisonResult.warning }}
      </div>

      <button
        class="compare-btn"
        :class="{ 'rerun': hasComparisonResult }"
        :disabled="loading || !sessionId"
        @click="handleComparisonClick"
      >
        <svg v-if="loading" class="spinner" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="30 70"/>
        </svg>
        <svg v-else-if="hasComparisonResult" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="currentColor">
          <path d="M9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>
        </svg>
        {{ loading ? '비교 분석 중...' : (hasComparisonResult ? '🔄 재실행' : '🔮 예측 비교 실행') }}
      </button>

      <!-- 진행 상태 표시 -->
      <div v-if="loading" class="progress-panel">
        <div class="progress-header">
          <span class="progress-icon">⏳</span>
          <span class="progress-title">예측 비교 분석 중</span>
        </div>

        <!-- 현재 작업 상세 표시 -->
        <div class="current-action">
          <div class="action-animation">
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
          </div>
          <span class="action-text">실제 비교 서비스의 응답을 기다리고 있습니다.</span>
        </div>
      </div>

      <!-- 비교 결과 시각화 -->
      <div v-if="comparisonResult" class="comparison-results">

        <!-- 응답에 포함된 모델만 표시 -->
        <div class="model-compare-grid">
          <!-- 실제값 카드 -->
          <div v-if="hasActualSeries" class="model-card actual">
            <div class="model-header">
              <span class="model-icon">📊</span>
              <h4>실제값</h4>
              <span class="model-badge baseline">Baseline</span>
            </div>
            <div class="model-stats">
              <div class="stat-row">
                <span class="label">데이터 포인트</span>
                <span class="value">{{ predictionCharts[0]?.actual.length || 0 }}개</span>
              </div>
              <div class="stat-row">
                <span class="label">역할</span>
                <span class="value good">✓ 비교 기준</span>
              </div>
            </div>
            <div class="model-desc">예측 모델의 정확도를 측정하는 기준값</div>
          </div>

          <!-- 온톨로지 모델 카드 -->
          <div class="model-card ontology">
            <div class="model-header">
              <span class="model-icon">🔬</span>
              <h4>온톨로지 모델</h4>
            </div>
            <div class="model-stats">
              <div class="stat-row">
                <span class="label">평균 R²</span>
                <span class="value" :class="getR2Class(getOntologyR2())">
                  {{ formatPercent(getOntologyR2()) }}
                </span>
              </div>
              <div class="stat-row">
                <span class="label">승리 횟수</span>
                <span class="value">{{ comparisonResult.summary.causal_wins || comparisonResult.summary.ontology_wins || 0 }}회</span>
              </div>
              <div class="stat-row">
                <span class="label">설명 가능성</span>
                <span class="value good">✓ 높음</span>
              </div>
            </div>
            <div class="model-desc">인과관계 기반 해석 가능한 예측</div>
          </div>

          <!-- IBM Granite TTM 카드 -->
          <div
            v-if="showTtmModel"
            class="model-card ttm"
            :class="{ unavailable: !comparisonResult.summary.ttm_available }"
          >
            <div class="model-header">
              <span class="model-icon">🧠</span>
              <h4>IBM Granite TTM</h4>
              <span v-if="comparisonResult.summary.ttm_available" class="model-badge">FM</span>
            </div>
            <div class="model-stats">
              <div class="stat-row">
                <span class="label">평균 R²</span>
                <span class="value" :class="getR2Class(getTTMR2())">
                  {{ formatPercent(getTTMR2()) }}
                </span>
              </div>
              <div class="stat-row">
                <span class="label">승리 횟수</span>
                <span class="value">{{ comparisonResult.summary.ttm_wins || 0 }}회</span>
              </div>
              <div class="stat-row">
                <span class="label">상태</span>
                <span class="value" :class="comparisonResult.summary.ttm_available ? 'good' : 'low'">
                  {{ comparisonResult.summary.ttm_available ? '✓ 활성' : '✗ 비활성' }}
                </span>
              </div>
            </div>
            <div class="model-desc">사전훈련된 시계열 FM</div>
          </div>

          <!-- MindsDB 모델 카드 -->
          <div
            v-if="showMindsDbModel"
            class="model-card mindsdb"
            :class="{ unavailable: !comparisonResult.summary.mindsdb_available }"
          >
            <div class="model-header">
              <span class="model-icon">💡</span>
              <h4>MindsDB AutoML</h4>
              <span v-if="comparisonResult.summary.mindsdb_available" class="model-badge mindsdb-badge">AutoML</span>
            </div>
            <div class="model-stats">
              <div class="stat-row">
                <span class="label">평균 R²</span>
                <span class="value" :class="getR2Class(getMindsDBR2())">
                  {{ formatPercent(getMindsDBR2()) }}
                </span>
              </div>
              <div class="stat-row">
                <span class="label">승리 횟수</span>
                <span class="value">{{ comparisonResult.summary.mindsdb_wins || 0 }}회</span>
              </div>
              <div class="stat-row">
                <span class="label">상태</span>
                <span class="value" :class="comparisonResult.summary.mindsdb_available ? 'good' : 'low'">
                  {{ comparisonResult.summary.mindsdb_available ? '✓ 활성' : '✗ 비활성' }}
                </span>
              </div>
            </div>
            <div class="model-desc">자동화된 머신러닝 예측</div>
          </div>
        </div>

        <!-- 승자 표시 -->
        <div class="winner-announcement" :class="getWinnerClass()">
          <div class="winner-content">
            <span class="winner-icon">🏆</span>
            <div class="winner-text">
              <div class="winner-title">더 나은 예측 모델</div>
              <div class="winner-name">
                {{ getWinnerName() }}
              </div>
            </div>
            <div class="winner-score">
              {{ winnerScoreText }}
            </div>
          </div>
        </div>

        <!-- ========== 핵심 분석 결과 ========== -->
        <div class="main-analysis">
          <h4 class="subsection-title">🎯 모델 비교 분석 결과</h4>

          <!-- 시나리오 요약 카드 -->
          <div class="scenario-summary-card">
            <div class="scenario-header">
              <span class="scenario-icon">📊</span>
              <div class="scenario-text">
                <h5>{{ comparisonTitle }}</h5>
                <p class="scenario-desc">응답에 포함된 실제 모델 지표와 예측값을 비교합니다.</p>
              </div>
            </div>

            <!-- 핵심 지표 - 두 모델 비교 -->
            <div class="key-metrics dual-model">
              <div class="metric-item">
                <span class="metric-value">{{ comparisonResult.comparisons?.length || 0 }}</span>
                <span class="metric-label">분석된 관계</span>
              </div>
              <div class="metric-item highlight ontology">
                <span class="metric-label-top">🔬 온톨로지</span>
                <span class="metric-value">{{ formatPercent(getOntologyR2()) }}</span>
                <span class="metric-label">R²</span>
              </div>
              <div v-if="showTtmModel" class="metric-item highlight ttm">
                <span class="metric-label-top">🧠 TTM</span>
                <span class="metric-value">{{ formatPercent(getTTMR2()) }}</span>
                <span class="metric-label">R²</span>
              </div>
              <div v-if="showMindsDbModel" class="metric-item highlight mindsdb">
                <span class="metric-label-top">💡 MindsDB</span>
                <span class="metric-value">{{ formatPercent(getMindsDBR2()) }}</span>
                <span class="metric-label">R²</span>
              </div>
            </div>

            <!-- 두 모델 정보 -->
            <div class="models-info-row">
              <div class="model-info-box ontology">
                <span class="info-icon">🔬</span>
                <div class="info-content">
                  <strong>온톨로지 모델</strong>
                  <p>서비스가 반환한 인과·온톨로지 예측</p>
                </div>
                <span
                  v-if="getOntologyWins() > Math.max(getTTMWins(), getMindsDBWins())"
                  class="win-badge"
                >
                  승리 {{ getOntologyWins() }}회
                </span>
              </div>
              <div v-if="showTtmModel" class="model-info-box ttm">
                <span class="info-icon">🧠</span>
                <div class="info-content">
                  <strong>IBM Granite TTM</strong>
                  <p>{{ comparisonResult.summary.ttm_model || '모델명 미제공' }}</p>
                  <p v-if="!comparisonResult.summary.ttm_available" class="warning">⚠️ 모델 미설치</p>
                </div>
                <span class="win-badge" v-if="getTTMWins() > getOntologyWins()">승리 {{ getTTMWins() }}회</span>
              </div>
              <div v-if="showMindsDbModel" class="model-info-box mindsdb">
                <span class="info-icon">💡</span>
                <div class="info-content">
                  <strong>MindsDB AutoML</strong>
                  <p>서비스가 반환한 AutoML 예측</p>
                </div>
                <span class="win-badge" v-if="getMindsDBWins() > getOntologyWins()">승리 {{ getMindsDBWins() }}회</span>
              </div>
            </div>
          </div>

          <!-- 대표 차트 (첫 번째 차트만 크게) -->
          <div v-if="predictionCharts.length" class="main-chart-section">
            <div class="main-chart-container">
              <h5 class="main-chart-title">
                {{ predictionCharts[0].edge }}
              </h5>
              <canvas ref="mainPredictionChartRef"></canvas>
              <!-- Chart.js 자체 범례 사용 -->
            </div>

            <!-- AI 해석 -->
            <div class="ai-interpretation">
              <div class="interpretation-header">
                <span class="ai-icon">🤖</span>
                <h5>분석 해석</h5>
              </div>
              <div class="interpretation-content">
                <p v-if="mainChartInterpretation">{{ mainChartInterpretation }}</p>
                <p v-else class="generating">
                  {{ getAutoInterpretation() }}
                </p>
              </div>
            </div>
          </div>

          <!-- 검증 요약 정보 -->
          <div v-if="hasValidationSummary" class="validation-info compact">
            <div class="info-row">
              <span v-if="comparisonResult.summary.train_ratio || comparisonResult.summary.test_ratio">
                📐 학습/테스트:
                {{ comparisonResult.summary.train_ratio || '미제공' }} /
                {{ comparisonResult.summary.test_ratio || '미제공' }}
              </span>
              <span v-if="comparisonResult.summary.good_fits !== undefined">
                ✅ 양호한 모델: {{ comparisonResult.summary.good_fits }}개
              </span>
            </div>
          </div>
        </div>

        <!-- ========== 세부 분석 (접이식) ========== -->
        <div class="detail-analysis">
          <button
            type="button"
            class="subsection-title toggle-header"
            :aria-expanded="showDetailCharts"
            @click="showDetailCharts = !showDetailCharts"
          >
            📈 세부 관계 분석 {{ showDetailCharts ? '▼' : '▶' }}
            <span class="detail-count">{{ predictionCharts.length }}개 관계</span>
          </button>

          <div v-if="showDetailCharts" class="detail-content">
            <!-- 개별 예측 차트들 -->
            <div v-if="predictionCharts.length > 1" class="prediction-chart-grid">
              <div
                v-for="(chart, idx) in predictionCharts.slice(1)"
                :key="idx"
                class="prediction-chart-item"
              >
                <h5 class="chart-title">{{ chart.edge }}</h5>
                <canvas :ref="(element) => setPredictionChartRef(element, idx)"></canvas>
                <div class="chart-legend">
                  <span class="legend-actual">● 실제값</span>
                  <span class="legend-predicted">● 예측값</span>
                </div>
              </div>
            </div>

            <!-- R² 비교 바 차트 -->
            <div class="r2-comparison-bars">
              <h5>관계별 예측 정확도 (R²)</h5>
              <div v-for="comp in comparisonResult.comparisons.slice(0, 10)" :key="comp.edge" class="bar-row">
                <div class="bar-label">{{ formatEdgeName(comp.edge) }}</div>
                <div class="bar-container">
                  <div class="bar-group">
                    <div
                      class="bar ontology"
                      :style="{ width: Math.max(0, Math.min(100, comp.causal_r2 * 100)) + '%' }"
                      :class="{ negative: comp.causal_r2 < 0 }"
                    >
                      <span class="bar-value">{{ (comp.causal_r2 * 100).toFixed(0) }}%</span>
                    </div>
                  </div>
                </div>
                <div class="bar-mape">
                  <span>오차 {{ (comp.causal_mape || 0).toFixed(1) }}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 상세 테이블 (접이식) -->
        <div class="detail-section">
          <button
            type="button"
            class="subsection-title toggle toggle-header"
            :aria-expanded="showDetailTable"
            @click="showDetailTable = !showDetailTable"
          >
            📋 상세 비교 데이터 {{ showDetailTable ? '▼' : '▶' }}
          </button>
          <div v-if="showDetailTable" class="comparison-table">
            <table>
              <thead>
                <tr>
                  <th>관계</th>
                  <th>온톨로지 R²</th>
                  <th v-if="showTtmModel">TTM R²</th>
                  <th v-if="showMindsDbModel">MindsDB R²</th>
                  <th>차이</th>
                  <th>승자</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="comp in comparisonResult.comparisons" :key="comp.edge">
                  <td class="edge">{{ formatEdgeName(comp.edge) }}</td>
                  <td :class="getR2Class(comp.causal_r2)">{{ (comp.causal_r2 * 100).toFixed(1) }}%</td>
                  <td v-if="showTtmModel" :class="getR2Class(comp.ttm?.r2)">
                    {{ formatPercent(comp.ttm?.r2) }}
                  </td>
                  <td v-if="showMindsDbModel" :class="getR2Class(comp.mindsdb_r2)">
                    {{ comp.mindsdb_r2 !== null ? (comp.mindsdb_r2 * 100).toFixed(1) + '%' : 'N/A' }}
                  </td>
                  <td :class="getDiffClass(comp.difference)">
                    {{ comp.difference !== undefined ? (comp.difference > 0 ? '+' : '') + (comp.difference * 100).toFixed(1) + '%' : '-' }}
                  </td>
                  <td>
                    <span v-if="comp.better" class="winner-badge" :class="comp.better.toLowerCase()">
                      {{ comparisonWinnerLabel(comp.better) }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- 다음 단계 버튼 -->
      <div v-if="comparisonResult && !loading" class="next-step-section">
        <div class="completion-message">
          <span class="completion-icon">✅</span>
          <span class="completion-text">예측 비교 분석이 완료되었습니다!</span>
        </div>
        <button class="next-step-btn" @click="goToNextStep">
          <span>결과 해석 단계로 이동</span>
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
            <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type ComponentPublicInstance,
} from 'vue'
import { Chart, registerables, type ChartDataset } from 'chart.js'
import type { ComparisonResult, ValidationResult } from '../model/contracts'

// Chart.js 등록
Chart.register(...registerables)

const props = defineProps<{
  sessionId: string | null
  validationResult: ValidationResult | null
  comparisonResult: ComparisonResult | null
  loading: boolean
}>()

const emit = defineEmits<{
  (e: 'run-comparison'): void
  (e: 'next-step'): void
  (e: 'clear-comparison'): void
}>()

const predictionCharts = computed(
  () => props.comparisonResult?.prediction_charts ?? [],
)

const hasActualSeries = computed(
  () => (predictionCharts.value[0]?.actual.length ?? 0) > 0,
)

const showTtmModel = computed(() => {
  const result = props.comparisonResult
  if (!result) return false
  return result.comparison_source === 'ttm'
    || result.summary.ttm_available !== undefined
    || result.summary.ttm_mean_r2 !== undefined
    || result.comparisons.some(comparison => comparison.ttm !== undefined)
})

const showMindsDbModel = computed(() => {
  const result = props.comparisonResult
  if (!result) return false
  return result.comparison_source === 'mindsdb'
    || result.summary.mindsdb_available !== undefined
    || result.summary.mindsdb_mean_r2 !== undefined
    || result.summary.mean_mindsdb_r2 !== undefined
    || result.comparisons.some(comparison => comparison.mindsdb_r2 !== null)
})

const comparisonHeading = computed(() => {
  if (showTtmModel.value) return '온톨로지 vs TTM Foundation Model 비교'
  if (showMindsDbModel.value) return '온톨로지 vs MindsDB AutoML 비교'
  return '온톨로지 모델 비교'
})

const comparisonDescription = computed(() => {
  if (showTtmModel.value) {
    return '온톨로지 기반 모델과 서비스가 반환한 IBM Granite TTM 결과를 비교합니다.'
  }
  if (showMindsDbModel.value) {
    return '온톨로지 기반 모델과 서비스가 반환한 MindsDB AutoML 결과를 비교합니다.'
  }
  return '온톨로지 기반 모델과 사용 가능한 예측 서비스의 실제 응답을 비교합니다.'
})

const comparisonTitle = computed(() => {
  const comparison = props.comparisonResult?.comparisons[0]
  if (!comparison) return '모델 비교 결과'
  const source = comparison.source_label ?? comparison.source
  const target = comparison.target_label ?? comparison.target
  if (source && target) return `${source} → ${target} 모델 비교`
  return `${formatEdgeName(comparison.edge)} 모델 비교`
})

const winnerScoreText = computed(() => {
  const scores = [`온톨로지 ${getOntologyWins()}`]
  if (showTtmModel.value) scores.push(`TTM ${getTTMWins()}`)
  if (showMindsDbModel.value) scores.push(`MindsDB ${getMindsDBWins()}`)
  return scores.join(' | ')
})

const hasValidationSummary = computed(() => {
  const summary = props.comparisonResult?.summary
  return summary !== undefined && (
    summary.train_ratio !== undefined
    || summary.test_ratio !== undefined
    || summary.good_fits !== undefined
  )
})

// 비교 결과 존재 여부
const hasComparisonResult = computed(() => {
  return props.comparisonResult &&
         props.comparisonResult.comparisons &&
         props.comparisonResult.comparisons.length > 0
})

// 비교 버튼 클릭 처리
function handleComparisonClick() {
  if (hasComparisonResult.value) {
    // 재실행: 기존 데이터 삭제 요청 후 실행
    emit('clear-comparison')
  }
  runComparison()
}

function goToNextStep() {
  emit('next-step')
}

const showDetailTable = ref(false)
const showDetailCharts = ref(false)
const mainPredictionChartRef = ref<HTMLCanvasElement | null>(null)
const predictionChartRefs = ref<(HTMLCanvasElement | null)[]>([])
const mainChartInterpretation = ref('')

// 안전한 R² 값 추출
function getOntologyR2(): number {
  if (!props.comparisonResult?.summary) return 0
  const summary = props.comparisonResult.summary
  return summary.mean_causal_r2 ?? summary.ontology_mean_r2 ?? 0
}

function getTTMR2(): number {
  if (!props.comparisonResult?.summary) return 0
  const summary = props.comparisonResult.summary
  return summary.ttm_mean_r2 ?? 0
}

function getMindsDBR2(): number {
  if (!props.comparisonResult?.summary) return 0
  const summary = props.comparisonResult.summary
  return summary.mindsdb_mean_r2 ?? summary.mean_mindsdb_r2 ?? 0
}

// 퍼센트 포맷 (NaN 방지)
function formatPercent(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(value)) return 'N/A'
  return `${(value * 100).toFixed(1)}%`
}

// 승리 횟수
function getOntologyWins(): number {
  if (!props.comparisonResult?.summary) return 0
  return props.comparisonResult.summary.causal_wins ?? props.comparisonResult.summary.ontology_wins ?? 0
}

function getTTMWins(): number {
  if (!props.comparisonResult?.summary) return 0
  return props.comparisonResult.summary.ttm_wins ?? 0
}

function getWinnerName(): string {
  const winners = [{ name: '온톨로지 모델', wins: getOntologyWins() }]
  if (showTtmModel.value) {
    winners.push({ name: 'IBM Granite TTM', wins: getTTMWins() })
  }
  if (showMindsDbModel.value) {
    winners.push({ name: 'MindsDB AutoML', wins: getMindsDBWins() })
  }
  winners.sort((a, b) => b.wins - a.wins)

  if (winners[0].wins === 0) return '비교 대기 중'
  if (winners[1] && winners[0].wins === winners[1].wins) return '무승부'
  return winners[0].name
}

function getMindsDBWins(): number {
  return props.comparisonResult?.summary?.mindsdb_wins || 0
}

let mainChartInstance: Chart | null = null
const predictionChartInstances: Chart[] = []

function setPredictionChartRef(
  element: Element | ComponentPublicInstance | null,
  index: number,
): void {
  predictionChartRefs.value[index] =
    element instanceof HTMLCanvasElement ? element : null
}

function runComparison() {
  emit('run-comparison')
}

function getR2Class(r2: number | null | undefined): string {
  if (r2 === null || r2 === undefined || Number.isNaN(r2)) return ''
  if (r2 >= 0.7) return 'good'
  if (r2 >= 0.5) return 'moderate'
  return 'low'
}

function getDiffClass(diff: number | undefined): string {
  if (diff === undefined) return ''
  if (diff > 0.1) return 'positive'
  if (diff < -0.1) return 'negative'
  return 'neutral'
}

function getWinnerClass(): string {
  const winner = getWinnerName()
  if (winner === '온톨로지 모델') return 'ontology'
  if (winner === 'IBM Granite TTM') return 'ttm'
  if (winner === 'MindsDB AutoML') return 'mindsdb'
  return 'tie'
}

function comparisonWinnerLabel(
  winner: NonNullable<ComparisonResult['comparisons'][number]['better']>,
): string {
  if (winner === 'Causal') return '온톨로지'
  if (winner === 'TTM') return 'TTM'
  return 'MindsDB'
}

function formatEdgeName(edge: string): string {
  return edge.replace(/_to_/g, ' → ').replace(/_/g, ' ')
}

// 자동 해석 생성
function getAutoInterpretation(): string {
  if (!props.comparisonResult?.comparisons?.length) {
    return '분석 결과를 불러오는 중...'
  }

  const comps = props.comparisonResult.comparisons
  const avgR2 = props.comparisonResult.summary.mean_causal_r2
  const avgMape = props.comparisonResult.summary.avg_mape || 0
  // 가장 강한 관계 찾기
  const strongest = comps.reduce((max, c) => c.causal_r2 > max.causal_r2 ? c : max, comps[0])

  let interpretation = ''

  // 실제 메트릭만 해석하며 특정 업무 도메인을 추정하지 않는다.
  if (avgR2 > 0.7) {
    interpretation = `📊 인과 모델의 평균 설명력은 ${(avgR2 * 100).toFixed(0)}%로 높게 측정됐습니다. `
  } else if (avgR2 > 0.4) {
    interpretation = `📊 인과 모델의 평균 설명력은 ${(avgR2 * 100).toFixed(0)}%로 중간 수준입니다. `
  } else if (avgR2 > 0) {
    interpretation = `📊 인과 모델의 평균 설명력은 ${(avgR2 * 100).toFixed(0)}%로 낮게 측정됐습니다. `
  } else {
    interpretation = '📊 현재 응답에는 해석할 수 있는 양의 평균 설명력이 없습니다. '
  }

  // 가장 강한 관계 설명
  if (strongest && strongest.causal_r2 > 0.3) {
    interpretation += `\n\n🔍 가장 강한 관계: "${formatEdgeName(strongest.edge)}" (R² ${(strongest.causal_r2 * 100).toFixed(0)}%)`
    if (strongest.coefficient) {
      const direction = strongest.coefficient > 0 ? '양의' : '음의'
      interpretation += ` - ${direction} 상관관계`
    }
  }

  // 예측 정확도 설명
  if (avgMape > 0) {
    if (avgMape < 5) {
      interpretation += `\n\n✅ 예측 오차가 평균 ${avgMape.toFixed(1)}%로 매우 정확한 예측이 가능합니다.`
    } else if (avgMape < 15) {
      interpretation += `\n\n⚠️ 예측 오차가 평균 ${avgMape.toFixed(1)}%로 중간 수준의 정확도입니다.`
    } else {
      interpretation += `\n\n❗ 예측 오차가 평균 ${avgMape.toFixed(1)}%로 변동성이 큽니다. 추가 변수 고려가 필요합니다.`
    }
  }

  return interpretation
}

// 메인 차트 생성 (대표 차트) - 3개의 선: 실측치, 온톨로지 예측, TTM 예측
function createMainPredictionChart() {
  if (!mainPredictionChartRef.value || !props.comparisonResult?.prediction_charts?.length) return

  if (mainChartInstance) {
    mainChartInstance.destroy()
  }

  const chartData = props.comparisonResult.prediction_charts[0]

  // 데이터셋 구성: 실측치, 온톨로지, TTM, MindsDB
  const datasets: ChartDataset<'line', number[]>[] = [
    {
      label: '📊 실측값',
      data: chartData.actual,
      borderColor: '#10b981',
      backgroundColor: 'rgba(16, 185, 129, 0.1)',
      borderWidth: 3,
      pointRadius: 6,
      pointBackgroundColor: '#10b981',
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
      borderDash: [],  // 실선
      fill: true,
      tension: 0.3
    },
    {
      label: '🔬 온톨로지',
      data: chartData.ontology_predicted || chartData.causal_predicted,
      borderColor: '#00d9ff',
      backgroundColor: 'transparent',
      borderWidth: 3,
      pointRadius: 5,
      pointBackgroundColor: '#00d9ff',
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
      borderDash: [8, 4],  // 대시선
      fill: false,
      tension: 0.3
    }
  ]

  // TTM 예측값이 있으면 추가
  if (chartData.ttm_predicted && chartData.ttm_predicted.length > 0) {
    datasets.push({
      label: '🧠 TTM',
      data: chartData.ttm_predicted,
      borderColor: '#f59e0b',
      backgroundColor: 'transparent',
      borderWidth: 3,
      pointRadius: 5,
      pointBackgroundColor: '#f59e0b',
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
      borderDash: [3, 3],  // 짧은 점선
      fill: false,
      tension: 0.3
    })
  }

  // MindsDB 예측값이 있으면 추가
  if (chartData.mindsdb_predicted && chartData.mindsdb_predicted.length > 0) {
    datasets.push({
      label: '💡 MindsDB',
      data: chartData.mindsdb_predicted,
      borderColor: '#8b5cf6',
      backgroundColor: 'transparent',
      borderWidth: 3,
      pointRadius: 5,
      pointBackgroundColor: '#8b5cf6',
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
      borderDash: [12, 4],  // 긴 대시선
      fill: false,
      tension: 0.3
    })
  }

  mainChartInstance = new Chart(mainPredictionChartRef.value, {
    type: 'line',
    data: {
      labels: chartData.labels.map((_, i) => `T${i + 1}`),
      datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            color: '#94a3b8',
            font: { size: 12, weight: 'bold' },
            padding: 20,
            usePointStyle: false,
            boxWidth: 40,
            boxHeight: 3,
          }
        },
        title: {
          display: false
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
          titleFont: { size: 14 },
          bodyFont: { size: 13 },
          padding: 12,
          callbacks: {
            label: (ctx) => {
              const value = ctx.parsed.y
              return `${ctx.dataset.label}: ${value == null ? 'N/A' : value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
            }
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: '테스트 데이터 포인트 (시간순)', color: '#94a3b8', font: { size: 12 } },
          ticks: { color: '#94a3b8', font: { size: 11 } },
          grid: { color: 'rgba(255,255,255,0.05)' }
        },
        y: {
          title: { display: true, text: '값', color: '#94a3b8', font: { size: 12 } },
          ticks: { color: '#94a3b8', font: { size: 11 } },
          grid: { color: 'rgba(255,255,255,0.1)' }
        }
      },
      interaction: {
        intersect: false,
        mode: 'index'
      }
    }
  })
}

// 예측 vs 실제 차트 생성
function createPredictionCharts() {
  if (!props.comparisonResult?.prediction_charts) return

  // 기존 차트 정리
  predictionChartInstances.forEach(c => c.destroy())
  predictionChartInstances.length = 0

  props.comparisonResult.prediction_charts.forEach((chartData, idx) => {
    const canvas = predictionChartRefs.value[idx]
    if (!canvas) return

    const chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: chartData.labels.map((_, i) => `T${i + 1}`),
        datasets: [
          {
            label: '실제값',
            data: chartData.actual,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            borderWidth: 2,
            pointRadius: 4,
            pointBackgroundColor: '#10b981',
            fill: false,
            tension: 0.1
          },
          {
            label: '예측값',
            data: chartData.causal_predicted,
            borderColor: '#00d9ff',
            backgroundColor: 'rgba(0, 217, 255, 0.1)',
            borderWidth: 2,
            pointRadius: 4,
            pointBackgroundColor: '#00d9ff',
            borderDash: [5, 5],
            fill: false,
            tension: 0.1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#94a3b8', font: { size: 11 } }
          },
          title: {
            display: false
          }
        },
        scales: {
          x: {
            title: { display: true, text: '테스트 데이터 포인트', color: '#94a3b8' },
            ticks: { color: '#94a3b8', font: { size: 10 } },
            grid: { color: 'rgba(255,255,255,0.05)' }
          },
          y: {
            title: { display: true, text: '값', color: '#94a3b8' },
            ticks: { color: '#94a3b8' },
            grid: { color: 'rgba(255,255,255,0.1)' }
          }
        }
      }
    })

    predictionChartInstances.push(chart)
  })
}

// 비교 결과 변경 시 차트 업데이트
watch(() => props.comparisonResult, async (newResult) => {
  if (newResult) {
    await nextTick()
    createMainPredictionChart()
    // 세부 차트는 접이식이므로 나중에
  }
}, { immediate: true })

// 세부 차트 표시 시 생성
watch(showDetailCharts, async (show) => {
  if (show && props.comparisonResult) {
    await nextTick()
    createPredictionCharts()
  }
})

onMounted(() => {
  if (props.comparisonResult) {
    nextTick(() => {
      createMainPredictionChart()
    })
  }
})

onBeforeUnmount(() => {
  mainChartInstance?.destroy()
  mainChartInstance = null
  predictionChartInstances.forEach(chart => chart.destroy())
  predictionChartInstances.length = 0
})
</script>

<style scoped src="./ValidationCompare.css"></style>
