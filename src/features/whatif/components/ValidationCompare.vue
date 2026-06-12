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
    
    <!-- MindsDB 비교 및 예측 -->
    <div class="mindsdb-compare">
      <h4 class="subsection-title">⚖️ 온톨로지 vs TTM Foundation Model 비교</h4>
      <p class="compare-desc">
        온톨로지 기반 모델과 IBM Granite TTM 시계열 예측 모델을 비교합니다.
      </p>
      
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
          <span class="progress-icon">{{ currentProgressStep >= 2 ? '🧠' : '⏳' }}</span>
          <span class="progress-title">{{ progressTitle }}</span>
        </div>
        
        <!-- 현재 작업 상세 표시 -->
        <div class="current-action">
          <div class="action-animation">
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
          </div>
          <span class="action-text">{{ currentActionText }}</span>
        </div>
        
        <div class="progress-steps">
          <div 
            v-for="(step, idx) in progressSteps" 
            :key="idx"
            class="progress-step"
            :class="{ 
              completed: idx < currentProgressStep, 
              active: idx === currentProgressStep,
              pending: idx > currentProgressStep
            }"
          >
            <span class="step-indicator">
              <span v-if="idx < currentProgressStep">✓</span>
              <span v-else-if="idx === currentProgressStep" class="loading-dot">●</span>
              <span v-else>○</span>
            </span>
            <span class="step-text">{{ step.text }}</span>
            <span v-if="step.model" class="step-model">{{ step.model }}</span>
          </div>
        </div>
        <div class="progress-bar-container">
          <div class="progress-bar" :style="{ width: progressPercent + '%' }"></div>
        </div>
        <div class="progress-footer">
          <span class="progress-percent">{{ Math.round(progressPercent) }}%</span>
          <span class="progress-eta">{{ estimatedTime }}</span>
        </div>
      </div>
      
      <!-- 비교 결과 시각화 -->
      <div v-if="comparisonResult" class="comparison-results">
        
        <!-- 4개 모델 비교 카드 -->
        <div class="model-compare-grid">
          <!-- 실제값 카드 -->
          <div class="model-card actual">
            <div class="model-header">
              <span class="model-icon">📊</span>
              <h4>실제값</h4>
              <span class="model-badge baseline">Baseline</span>
            </div>
            <div class="model-stats">
              <div class="stat-row">
                <span class="label">데이터 포인트</span>
                <span class="value">{{ comparisonResult.prediction_charts?.[0]?.actual?.length || 0 }}개</span>
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
              온톨로지 {{ getOntologyWins() }} | TTM {{ getTTMWins() }} | MindsDB {{ getMindsDBWins() }}
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
                <h5>환율 변화 → 수익 영향 분석</h5>
                <p class="scenario-desc">
                  온톨로지 모델(선형 회귀)과 IBM Granite TTM 시계열 모델의 예측 결과를 비교합니다.
                </p>
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
              <div class="metric-item highlight ttm">
                <span class="metric-label-top">🧠 TTM</span>
                <span class="metric-value">{{ formatPercent(getTTMR2()) }}</span>
                <span class="metric-label">R²</span>
              </div>
            </div>
            
            <!-- 두 모델 정보 -->
            <div class="models-info-row">
              <div class="model-info-box ontology">
                <span class="info-icon">🔬</span>
                <div class="info-content">
                  <strong>온톨로지 모델</strong>
                  <p>선형 회귀 기반 인과관계 모델</p>
                </div>
                <span class="win-badge" v-if="getOntologyWins() > getTTMWins()">승리 {{ getOntologyWins() }}회</span>
              </div>
              <div class="model-info-box ttm">
                <span class="info-icon">🧠</span>
                <div class="info-content">
                  <strong>IBM Granite TTM</strong>
                  <p>{{ comparisonResult.summary.ttm_model || 'granite-timeseries-ttm-v1' }}</p>
                  <p v-if="!comparisonResult.summary.ttm_available" class="warning">⚠️ 모델 미설치</p>
                </div>
                <span class="win-badge" v-if="getTTMWins() > getOntologyWins()">승리 {{ getTTMWins() }}회</span>
              </div>
            </div>
          </div>
          
          <!-- 대표 차트 (첫 번째 차트만 크게) -->
          <div v-if="comparisonResult.prediction_charts?.length" class="main-chart-section">
            <div class="main-chart-container">
              <h5 class="main-chart-title">
                {{ comparisonResult.prediction_charts[0].edge }}
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
          <div class="validation-info compact">
            <div class="info-row">
              <span>📐 학습/테스트: {{ comparisonResult.summary.train_ratio || '80%' }} / {{ comparisonResult.summary.test_ratio || '20%' }}</span>
              <span>✅ 양호한 모델: {{ comparisonResult.summary.good_fits || 0 }}개</span>
            </div>
          </div>
        </div>
        
        <!-- ========== 세부 분석 (접이식) ========== -->
        <div class="detail-analysis">
          <h4 class="subsection-title toggle-header" @click="showDetailCharts = !showDetailCharts">
            📈 세부 관계 분석 {{ showDetailCharts ? '▼' : '▶' }}
            <span class="detail-count">{{ comparisonResult.prediction_charts?.length || 0 }}개 관계</span>
          </h4>
          
          <div v-if="showDetailCharts" class="detail-content">
            <!-- 개별 예측 차트들 -->
            <div v-if="comparisonResult.prediction_charts?.length > 1" class="prediction-chart-grid">
              <div 
                v-for="(chart, idx) in comparisonResult.prediction_charts.slice(1)" 
                :key="idx"
                class="prediction-chart-item"
              >
                <h5 class="chart-title">{{ chart.edge }}</h5>
                <canvas :ref="el => predictionChartRefs[idx] = el"></canvas>
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
          <h4 class="subsection-title toggle" @click="showDetailTable = !showDetailTable">
            📋 상세 비교 데이터 {{ showDetailTable ? '▼' : '▶' }}
          </h4>
          <div v-if="showDetailTable" class="comparison-table">
            <table>
              <thead>
                <tr>
                  <th>관계</th>
                  <th>온톨로지 R²</th>
                  <th>MindsDB R²</th>
                  <th>차이</th>
                  <th>승자</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="comp in comparisonResult.comparisons" :key="comp.edge">
                  <td class="edge">{{ formatEdgeName(comp.edge) }}</td>
                  <td :class="getR2Class(comp.causal_r2)">{{ (comp.causal_r2 * 100).toFixed(1) }}%</td>
                  <td :class="comp.mindsdb_r2 !== null ? getR2Class(comp.mindsdb_r2) : ''">
                    {{ comp.mindsdb_r2 !== null ? (comp.mindsdb_r2 * 100).toFixed(1) + '%' : 'N/A' }}
                  </td>
                  <td :class="getDiffClass(comp.difference)">
                    {{ comp.difference !== undefined ? (comp.difference > 0 ? '+' : '') + (comp.difference * 100).toFixed(1) + '%' : '-' }}
                  </td>
                  <td>
                    <span v-if="comp.better" class="winner-badge" :class="comp.better.toLowerCase()">
                      {{ comp.better === 'Causal' ? '온톨로지' : 'MindsDB' }}
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
import { ref, watch, nextTick, onMounted, computed } from 'vue'
import { Chart, registerables } from 'chart.js'
import type { ValidationResult, ComparisonResult } from '@/features/whatif/whatif-api'

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
const comparisonChartRef = ref<HTMLCanvasElement | null>(null)
const mainPredictionChartRef = ref<HTMLCanvasElement | null>(null)
const predictionChartRefs = ref<(HTMLCanvasElement | null)[]>([])
const mainChartInterpretation = ref('')

// 진행 상태
const progressSteps = [
  { text: 'MySQL 데이터 로드', model: null },
  { text: '온톨로지 모델 분석', model: '🔬 Linear Regression' },
  { text: 'IBM Granite TTM 초기화', model: '🧠 Foundation Model' },
  { text: '시계열 예측 수행', model: '📈 Time Series' },
  { text: '결과 비교 및 생성', model: null }
]
const currentProgressStep = ref(0)
const progressPercent = ref(0)
let progressInterval: ReturnType<typeof setInterval> | null = null

// 현재 진행 상태 텍스트
const progressTitle = computed(() => {
  if (currentProgressStep.value >= 2) {
    return 'IBM Granite TTM 모델 실행 중'
  }
  return '예측 비교 분석 중'
})

const currentActionText = computed(() => {
  const actions = [
    'exchange_rate, import_cost, product_cost 테이블에서 데이터 조회 중...',
    '변수 간 인과관계 기반 선형 회귀 모델 학습 중...',
    'ibm-granite/granite-timeseries-ttm-v1 모델 초기화 중...',
    '512 컨텍스트 윈도우로 96스텝 예측 수행 중...',
    'R², MAPE 메트릭 계산 및 차트 데이터 생성 중...'
  ]
  return actions[currentProgressStep.value] || '처리 중...'
})

const estimatedTime = computed(() => {
  const remaining = 100 - progressPercent.value
  const seconds = Math.ceil(remaining / 10)
  return `약 ${seconds}초 남음`
})

// 선택된 모델
const selectedModel = ref<'ontology' | 'ttm'>('ontology')

function selectModel(model: 'ontology' | 'ttm') {
  selectedModel.value = model
}

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

// 선택된 모델의 예측 결과
function getSelectedModelPredictions() {
  if (!props.comparisonResult?.comparisons) return []
  return props.comparisonResult.comparisons.filter(c => {
    if (selectedModel.value === 'ontology') {
      return c.ontology && c.ontology.r2 !== undefined
    } else {
      return c.ttm && c.ttm.r2 !== undefined
    }
  })
}

// 승리 횟수
function getOntologyWins(): number {
  if (!props.comparisonResult?.summary) return 0
  return props.comparisonResult.summary.causal_wins ?? props.comparisonResult.summary.ontology_wins ?? 0
}

function getTTMWins(): number {
  if (!props.comparisonResult?.summary) return 0
  return props.comparisonResult.summary.ttm_wins ?? props.comparisonResult.summary.mindsdb_wins ?? 0
}

function getWinnerName(): string {
  const ontologyWins = getOntologyWins()
  const ttmWins = getTTMWins()
  const mindsdbWins = getMindsDBWins()
  
  const winners = [
    { name: '온톨로지 모델', wins: ontologyWins },
    { name: 'IBM Granite TTM', wins: ttmWins },
    { name: 'MindsDB AutoML', wins: mindsdbWins }
  ].sort((a, b) => b.wins - a.wins)
  
  if (winners[0].wins === 0) return '비교 대기 중'
  if (winners[0].wins === winners[1].wins) return '무승부'
  return winners[0].name
}

function getMindsDBWins(): number {
  return props.comparisonResult?.summary?.mindsdb_wins || 0
}

// 선택된 모델의 평균 R²
function getSelectedModelR2(): number {
  return selectedModel.value === 'ontology' ? getOntologyR2() : getTTMR2()
}

// 선택된 모델의 MAPE
function getSelectedModelMAPE(): number {
  if (!props.comparisonResult?.summary) return 0
  if (selectedModel.value === 'ontology') {
    return props.comparisonResult.summary.avg_mape ?? 0
  } else {
    // TTM MAPE (comparisons에서 평균 계산)
    const comparisons = props.comparisonResult.comparisons || []
    const ttmMapes = comparisons
      .filter(c => c.ttm && typeof c.ttm.mape === 'number')
      .map(c => c.ttm!.mape)
    return ttmMapes.length > 0 ? ttmMapes.reduce((a, b) => a + b, 0) / ttmMapes.length : 0
  }
}

let chartInstance: Chart | null = null
let mainChartInstance: Chart | null = null
const predictionChartInstances: Chart[] = []

function runComparison() {
  // 진행 상태 시작
  startProgress()
  emit('run-comparison')
}

function startProgress() {
  currentProgressStep.value = 0
  progressPercent.value = 0
  
  // 진행 애니메이션
  progressInterval = setInterval(() => {
    if (progressPercent.value < 95) {
      progressPercent.value += Math.random() * 8 + 2
      
      // 단계 업데이트
      if (progressPercent.value > 20 && currentProgressStep.value < 1) {
        currentProgressStep.value = 1
      } else if (progressPercent.value > 40 && currentProgressStep.value < 2) {
        currentProgressStep.value = 2
      } else if (progressPercent.value > 60 && currentProgressStep.value < 3) {
        currentProgressStep.value = 3
      } else if (progressPercent.value > 80 && currentProgressStep.value < 4) {
        currentProgressStep.value = 4
      }
    }
  }, 300)
}

function stopProgress() {
  if (progressInterval) {
    clearInterval(progressInterval)
    progressInterval = null
  }
  progressPercent.value = 100
  currentProgressStep.value = progressSteps.length
}

function getR2Class(r2: number): string {
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
  if (!props.comparisonResult) return ''
  const { mindsdb_wins, causal_wins } = props.comparisonResult.summary
  if (mindsdb_wins > causal_wins) return 'mindsdb'
  if (causal_wins > mindsdb_wins) return 'ontology'
  return 'tie'
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
  const goodFits = props.comparisonResult.summary.good_fits || 0
  
  // 가장 강한 관계 찾기
  const strongest = comps.reduce((max, c) => c.causal_r2 > max.causal_r2 ? c : max, comps[0])
  
  let interpretation = ''
  
  // 전체 모델 품질 평가
  if (avgR2 > 0.7) {
    interpretation = `📊 분석 결과, 환율 변화와 수익 간의 인과관계가 매우 명확하게 나타났습니다 (평균 설명력 ${(avgR2 * 100).toFixed(0)}%). `
  } else if (avgR2 > 0.4) {
    interpretation = `📊 분석 결과, 환율 변화가 수익에 중간 정도의 영향을 미치는 것으로 나타났습니다 (평균 설명력 ${(avgR2 * 100).toFixed(0)}%). `
  } else if (avgR2 > 0) {
    interpretation = `📊 분석 결과, 환율 변화와 수익 간의 관계가 약하게 나타났습니다 (평균 설명력 ${(avgR2 * 100).toFixed(0)}%). 다른 요인들이 더 큰 영향을 미칠 수 있습니다. `
  } else {
    interpretation = `📊 현재 데이터에서는 환율 변화와 수익 간의 선형적 관계가 약합니다. 비선형 관계이거나 시차 효과가 있을 수 있습니다. `
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
  const datasets: any[] = [
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
            generateLabels: (chart) => {
              const datasets = chart.data.datasets
              return datasets.map((ds, i) => ({
                text: ds.label,
                fillStyle: ds.borderColor,
                strokeStyle: ds.borderColor,
                lineWidth: ds.borderWidth || 3,
                lineDash: ds.borderDash || [],
                hidden: !chart.isDatasetVisible(i),
                datasetIndex: i
              }))
            }
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
            label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
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

// R² 비교 차트 생성
function createComparisonChart() {
  if (!comparisonChartRef.value || !props.comparisonResult) return
  
  if (chartInstance) {
    chartInstance.destroy()
  }
  
  const comparisons = props.comparisonResult.comparisons
  const labels = comparisons.map(c => formatEdgeName(c.edge).substring(0, 20) + '...')
  const causalData = comparisons.map(c => c.causal_r2 * 100)
  const mindsdbData = comparisons.map(c => (c.mindsdb_r2 || 0) * 100)
  
  chartInstance = new Chart(comparisonChartRef.value, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: '온톨로지 모델 R²',
          data: causalData,
          backgroundColor: 'rgba(0, 217, 255, 0.7)',
          borderColor: '#00d9ff',
          borderWidth: 2,
          borderRadius: 4
        },
        {
          label: 'MindsDB R²',
          data: mindsdbData,
          backgroundColor: 'rgba(139, 92, 246, 0.7)',
          borderColor: '#8b5cf6',
          borderWidth: 2,
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            color: '#94a3b8',
            font: { size: 12 }
          }
        },
        title: {
          display: true,
          text: '모델별 R² 성능 비교 (%)',
          color: '#fff',
          font: { size: 14, weight: 'bold' }
        }
      },
      scales: {
        x: {
          ticks: { color: '#94a3b8', font: { size: 10 } },
          grid: { color: 'rgba(255,255,255,0.1)' }
        },
        y: {
          beginAtZero: true,
          max: 100,
          ticks: { color: '#94a3b8' },
          grid: { color: 'rgba(255,255,255,0.1)' }
        }
      }
    }
  })
}

// 비교 결과 변경 시 차트 업데이트
watch(() => props.comparisonResult, async (newResult) => {
  if (newResult) {
    // 진행 상태 완료
    stopProgress()
    
    await nextTick()
    createMainPredictionChart()  // 메인 차트 먼저
    createComparisonChart()
    // 세부 차트는 접이식이므로 나중에
  }
}, { immediate: true })

// 로딩 상태 변경 시 진행 초기화
watch(() => props.loading, (isLoading) => {
  if (!isLoading) {
    stopProgress()
  }
})

// 세부 차트 표시 시 생성
watch(showDetailCharts, async (show) => {
  if (show && props.comparisonResult) {
    await nextTick()
    setTimeout(() => createPredictionCharts(), 100)
  }
})

onMounted(() => {
  if (props.comparisonResult) {
    nextTick(() => {
      createMainPredictionChart()
      createComparisonChart()
    })
  }
})
</script>

<style scoped>
.validation-compare {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.section-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-accent);
  margin: 0;
}

.subsection-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-text-bright);
  margin: 0 0 1rem 0;
}

.subsection-title.toggle {
  cursor: pointer;
}

.subsection-title.toggle:hover {
  color: var(--color-accent);
}

/* 검증 요약 */
.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 0.875rem;
  margin-bottom: 1.5rem;
}

.summary-stat {
  padding: 1rem;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  text-align: center;
}

.summary-stat.good {
  border-color: rgba(16, 185, 129, 0.4);
  background: rgba(16, 185, 129, 0.1);
}

.summary-stat.warning {
  border-color: rgba(245, 158, 11, 0.4);
  background: rgba(245, 158, 11, 0.1);
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-text-bright);
}

.summary-stat.good .stat-value { color: #10b981; }
.summary-stat.warning .stat-value { color: #f59e0b; }

.stat-label {
  font-size: 0.8rem;
  color: var(--color-text-muted);
  margin-top: 0.2rem;
}

/* MindsDB 비교 */
.compare-desc {
  color: var(--color-text-muted);
  font-size: 0.85rem;
  margin-bottom: 1rem;
}

.compare-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
  border: none;
  border-radius: 10px;
  color: white;
  font-family: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.compare-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(139, 92, 246, 0.4);
}

.compare-btn.rerun {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
}

.compare-btn.rerun:hover:not(:disabled) {
  background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
  box-shadow: 0 6px 20px rgba(245, 158, 11, 0.4);
}

.compare-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.compare-btn svg {
  width: 18px;
  height: 18px;
}

.spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 좌우 비교 카드 */
.side-by-side-compare {
  display: flex;
  gap: 1.5rem;
  margin-top: 1.5rem;
  margin-bottom: 1.5rem;
}

.model-compare-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
  margin-bottom: 1.5rem;
}

@media (max-width: 1200px) {
  .model-compare-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .model-compare-grid {
    grid-template-columns: 1fr;
  }
}

.model-card {
  flex: 1;
  padding: 1.25rem;
  background: var(--color-bg-tertiary);
  border: 2px solid var(--color-border);
  border-radius: 12px;
  transition: all 0.3s ease;
}

.model-card.actual {
  border-color: rgba(16, 185, 129, 0.5);
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, transparent 100%);
}

.model-card.actual .model-badge.baseline {
  background: #10b981;
}

.model-card.ontology {
  border-color: rgba(0, 217, 255, 0.4);
  background: linear-gradient(135deg, rgba(0, 217, 255, 0.05) 0%, transparent 100%);
}

.model-card.mindsdb {
  border-color: rgba(139, 92, 246, 0.4);
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.05) 0%, transparent 100%);
}

.model-card.mindsdb .model-badge.mindsdb-badge {
  background: linear-gradient(135deg, #8b5cf6, #6366f1);
}

.model-card.ttm {
  border-color: rgba(245, 158, 11, 0.4);
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(236, 72, 153, 0.05) 100%);
}

.model-card.ttm.unavailable {
  opacity: 0.6;
  border-color: rgba(100, 116, 139, 0.3);
  background: linear-gradient(135deg, rgba(100, 116, 139, 0.05) 0%, transparent 100%);
}

.model-badge {
  font-size: 0.65rem;
  padding: 0.2rem 0.5rem;
  background: linear-gradient(135deg, #f59e0b, #ec4899);
  border-radius: 10px;
  color: #fff;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* 진행 상태 패널 */
.progress-panel {
  margin-top: 1.5rem;
  padding: 1.5rem;
  background: linear-gradient(135deg, rgba(0, 217, 255, 0.08) 0%, rgba(139, 92, 246, 0.08) 100%);
  border: 1px solid rgba(0, 217, 255, 0.2);
  border-radius: 12px;
  animation: fadeIn 0.3s ease;
}

.progress-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}

.progress-icon {
  font-size: 1.5rem;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.progress-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--color-text-primary);
}

.progress-steps {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}

.progress-step {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  border-radius: 8px;
  transition: all 0.3s ease;
}

.progress-step.completed {
  color: #10b981;
}

.progress-step.active {
  background: rgba(0, 217, 255, 0.15);
  color: #00d9ff;
}

.progress-step.pending {
  color: var(--color-text-tertiary);
  opacity: 0.6;
}

.step-indicator {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.9rem;
}

.loading-dot {
  animation: blink 1s ease-in-out infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.step-text {
  font-size: 0.9rem;
}

.progress-bar-container {
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 0.5rem;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #00d9ff 0%, #8b5cf6 50%, #ec4899 100%);
  border-radius: 3px;
  transition: width 0.3s ease;
}

/* 현재 작업 상세 */
.current-action {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  margin-bottom: 1rem;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  border-left: 3px solid #00d9ff;
}

.action-animation {
  display: flex;
  gap: 4px;
}

.action-animation .dot {
  width: 8px;
  height: 8px;
  background: #00d9ff;
  border-radius: 50%;
  animation: bounce 1.4s ease-in-out infinite;
}

.action-animation .dot:nth-child(2) {
  animation-delay: 0.2s;
}

.action-animation .dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes bounce {
  0%, 80%, 100% {
    transform: translateY(0);
    opacity: 0.5;
  }
  40% {
    transform: translateY(-8px);
    opacity: 1;
  }
}

.action-text {
  font-size: 0.9rem;
  color: #00d9ff;
  font-family: 'SF Mono', 'Fira Code', monospace;
}

.step-model {
  margin-left: auto;
  font-size: 0.75rem;
  padding: 0.2rem 0.5rem;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  color: var(--color-text-tertiary);
}

.progress-step.active .step-model {
  background: rgba(0, 217, 255, 0.2);
  color: #00d9ff;
}

.progress-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 0.5rem;
}

.progress-percent {
  font-size: 1rem;
  font-weight: 700;
  color: #00d9ff;
}

.progress-eta {
  font-size: 0.8rem;
  color: var(--color-text-tertiary);
}

/* 모델 카드 선택 스타일 */
.model-card {
  cursor: pointer;
  transition: all 0.3s ease;
}

.model-card:hover {
  transform: translateY(-2px);
}

.model-card.selected {
  border-width: 3px;
  box-shadow: 0 0 20px rgba(0, 217, 255, 0.3);
}

.model-card.ontology.selected {
  border-color: #00d9ff;
  box-shadow: 0 0 20px rgba(0, 217, 255, 0.4);
}

.model-card.ttm.selected {
  border-color: #f59e0b;
  box-shadow: 0 0 20px rgba(245, 158, 11, 0.4);
}

/* 모델 탭 */
.model-tabs {
  display: flex;
  gap: 1rem;
  margin: 1.5rem 0;
}

.model-tab {
  flex: 1;
  padding: 1rem 1.5rem;
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid transparent;
  border-radius: 12px;
  color: var(--color-text-secondary);
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.model-tab:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--color-text-primary);
}

.model-tab.active {
  background: linear-gradient(135deg, rgba(0, 217, 255, 0.15) 0%, rgba(139, 92, 246, 0.15) 100%);
  border-color: #00d9ff;
  color: #00d9ff;
}

.model-tab:first-child.active {
  border-color: #10b981;
  color: #10b981;
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(0, 217, 255, 0.15) 100%);
}

.model-tab:last-child.active {
  border-color: #f59e0b;
  color: #f59e0b;
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(236, 72, 153, 0.15) 100%);
}

/* 모델 정보 박스 */
.model-info-box {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-top: 1rem;
  padding: 1rem;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.model-info-box.ttm {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(236, 72, 153, 0.05) 100%);
  border-color: rgba(245, 158, 11, 0.3);
}

.model-info-box.ontology {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(0, 217, 255, 0.05) 100%);
  border-color: rgba(16, 185, 129, 0.3);
}

.model-info-box .info-icon {
  font-size: 2rem;
}

.model-info-box .info-content {
  flex: 1;
}

.model-info-box .info-content strong {
  display: block;
  margin-bottom: 0.25rem;
  color: var(--color-text-primary);
}

.model-info-box .info-content p {
  margin: 0;
  font-size: 0.85rem;
  color: var(--color-text-secondary);
}

.model-info-box .info-content p.warning {
  color: #f59e0b;
  margin-top: 0.5rem;
}

/* 시나리오 카드 모델별 스타일 */
.scenario-summary-card.ttm {
  border-color: rgba(245, 158, 11, 0.3);
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.05) 0%, transparent 100%);
}

.scenario-summary-card.ontology {
  border-color: rgba(16, 185, 129, 0.3);
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, transparent 100%);
}

/* 메트릭 아이템 모델별 스타일 */
.metric-item.highlight.ttm {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(236, 72, 153, 0.1));
  border-color: rgba(245, 158, 11, 0.5);
}

.metric-item.highlight.ontology {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(0, 217, 255, 0.1));
  border-color: rgba(16, 185, 129, 0.5);
}

/* 다음 단계 섹션 */
.next-step-section {
  margin-top: 2rem;
  padding: 1.5rem;
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(0, 217, 255, 0.05) 100%);
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  animation: slideUp 0.3s ease;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.completion-message {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.completion-icon {
  font-size: 1.5rem;
}

.completion-text {
  font-size: 1rem;
  font-weight: 600;
  color: #10b981;
}

.next-step-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.875rem 1.5rem;
  background: linear-gradient(135deg, #10b981, #00d9ff);
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.next-step-btn:hover {
  transform: translateX(5px);
  box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4);
}

.next-step-btn svg {
  transition: transform 0.3s ease;
}

.next-step-btn:hover svg {
  transform: translateX(3px);
}

/* 듀얼 모델 메트릭 */
.key-metrics.dual-model {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.key-metrics.dual-model .metric-item {
  flex: 1;
  min-width: 120px;
}

.metric-label-top {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
  opacity: 0.8;
}

/* 모델 정보 행 */
.models-info-row {
  display: flex;
  gap: 1rem;
  margin-top: 1rem;
}

.models-info-row .model-info-box {
  flex: 1;
  position: relative;
}

.win-badge {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  font-size: 0.7rem;
  padding: 0.2rem 0.5rem;
  background: linear-gradient(135deg, #10b981, #00d9ff);
  border-radius: 10px;
  color: #fff;
  font-weight: 600;
}

.model-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.model-icon {
  font-size: 1.5rem;
}

.model-header h4 {
  margin: 0;
  font-size: 1rem;
  color: var(--color-text-bright);
}

.model-stats {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--color-border);
}

.stat-row .label {
  color: var(--color-text-muted);
  font-size: 0.85rem;
}

.stat-row .value {
  font-weight: 600;
  font-size: 0.9rem;
}

.model-desc {
  font-size: 0.8rem;
  color: var(--color-text-muted);
  text-align: center;
}

.vs-divider {
  display: flex;
  align-items: center;
  justify-content: center;
}

.vs-divider span {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-text-muted);
}

/* 승자 표시 */
.winner-announcement {
  padding: 1rem 1.5rem;
  background: var(--color-bg-tertiary);
  border: 2px solid var(--color-border);
  border-radius: 12px;
  margin-bottom: 1.5rem;
}

.winner-announcement.ontology {
  border-color: #00d9ff;
  background: linear-gradient(90deg, rgba(0, 217, 255, 0.1) 0%, transparent 100%);
}

.winner-announcement.mindsdb {
  border-color: #8b5cf6;
  background: linear-gradient(90deg, rgba(139, 92, 246, 0.1) 0%, transparent 100%);
}

.winner-announcement.tie {
  border-color: #f59e0b;
}

.winner-content {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.winner-icon {
  font-size: 2rem;
}

.winner-text {
  flex: 1;
}

.winner-title {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.winner-name {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-text-bright);
}

.winner-score {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-accent);
}

/* ========== 핵심 분석 섹션 ========== */
.main-analysis {
  margin-top: 1.5rem;
}

.scenario-summary-card {
  background: linear-gradient(135deg, rgba(0, 217, 255, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%);
  border: 1px solid rgba(0, 217, 255, 0.3);
  border-radius: 16px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}

.scenario-header {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.scenario-icon {
  font-size: 2rem;
}

.scenario-text h5 {
  margin: 0 0 0.5rem 0;
  font-size: 1.25rem;
  color: var(--color-text-primary);
}

.scenario-desc {
  margin: 0;
  font-size: 0.9rem;
  color: var(--color-text-secondary);
}

.key-metrics {
  display: flex;
  justify-content: space-around;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 12px;
  padding: 1rem;
}

.metric-item {
  text-align: center;
}

.metric-item.highlight {
  background: linear-gradient(135deg, rgba(0, 217, 255, 0.2) 0%, rgba(16, 185, 129, 0.2) 100%);
  border-radius: 10px;
  padding: 0.75rem 1.5rem;
}

.metric-value {
  display: block;
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--color-text-primary);
}

.metric-item.highlight .metric-value {
  color: #00d9ff;
}

.metric-label {
  display: block;
  font-size: 0.75rem;
  color: var(--color-text-tertiary);
  margin-top: 0.25rem;
}

/* 메인 차트 섹션 */
.main-chart-section {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 1.5rem;
  margin-bottom: 1.5rem;
}

@media (max-width: 1024px) {
  .main-chart-section {
    grid-template-columns: 1fr;
  }
}

.main-chart-container {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 1.25rem;
}

.main-chart-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 1rem 0;
  text-align: center;
}

.main-chart-container canvas {
  height: 280px !important;
}

.main-chart-legend {
  display: flex;
  justify-content: center;
  gap: 2rem;
  margin-top: 1rem;
  font-size: 0.85rem;
}

.main-chart-legend .legend-actual {
  color: #10b981;
}

.main-chart-legend .legend-predicted {
  color: #00d9ff;
}

/* AI 해석 */
.ai-interpretation {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(236, 72, 153, 0.1) 100%);
  border: 1px solid rgba(139, 92, 246, 0.3);
  border-radius: 12px;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
}

.interpretation-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.ai-icon {
  font-size: 1.5rem;
}

.interpretation-header h5 {
  margin: 0;
  font-size: 1rem;
  color: var(--color-text-primary);
}

.interpretation-content {
  flex: 1;
}

.interpretation-content p {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.7;
  color: var(--color-text-secondary);
  white-space: pre-line;
}

.interpretation-content .generating {
  color: var(--color-text-tertiary);
}

/* 검증 요약 정보 컴팩트 */
.validation-info.compact {
  background: var(--color-bg-tertiary);
  border-radius: 8px;
  padding: 0.75rem 1rem;
  margin-bottom: 1rem;
}

.info-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.85rem;
  color: var(--color-text-secondary);
}

/* ========== 세부 분석 (접이식) ========== */
.detail-analysis {
  margin-top: 1rem;
}

.toggle-header {
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.toggle-header:hover {
  color: #00d9ff;
}

.detail-count {
  font-size: 0.8rem;
  font-weight: 400;
  color: var(--color-text-tertiary);
  margin-left: auto;
}

.detail-content {
  margin-top: 1rem;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

.bar-mape {
  font-size: 0.75rem;
  color: var(--color-text-tertiary);
  min-width: 80px;
  text-align: right;
}

.bar.negative {
  background: linear-gradient(90deg, #ef4444 0%, rgba(239, 68, 68, 0.3) 100%) !important;
}

/* 예측 검증 섹션 */
.prediction-validation {
  margin-top: 1.5rem;
  padding: 1.5rem;
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(0, 217, 255, 0.05) 100%);
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: 12px;
}

.validation-note {
  font-size: 0.85rem;
  color: var(--color-text-tertiary);
  margin-bottom: 1rem;
}

.prediction-chart-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
  gap: 1.5rem;
}

.prediction-chart-item {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 1rem;
}

.prediction-chart-item canvas {
  height: 200px !important;
}

.prediction-chart-item .chart-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 0.75rem;
  text-align: center;
}

.prediction-chart-item .chart-legend {
  display: flex;
  justify-content: center;
  gap: 1.5rem;
  margin-top: 0.75rem;
  font-size: 0.8rem;
}

.legend-actual {
  color: #10b981;
}

.legend-predicted {
  color: #00d9ff;
}

/* 검증 정보 */
.validation-info {
  margin-top: 1.5rem;
  padding: 1rem 1.5rem;
  background: var(--color-bg-tertiary);
  border-radius: 10px;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
  margin-bottom: 0.75rem;
}

.info-item {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.info-label {
  font-size: 0.75rem;
  color: var(--color-text-tertiary);
}

.info-value {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--color-text-primary);
}

.info-value.good {
  color: #10b981;
}

.info-note {
  font-size: 0.8rem;
  color: var(--color-text-tertiary);
  text-align: center;
  font-style: italic;
}

/* 차트 */
.prediction-charts {
  margin-top: 1.5rem;
}

.chart-container {
  height: 300px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 1rem;
  margin-bottom: 1.5rem;
}

/* R² 비교 바 */
.r2-comparison-bars {
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 1rem;
}

.r2-comparison-bars h5 {
  margin: 0 0 1rem 0;
  font-size: 0.9rem;
  color: var(--color-text-bright);
}

.bar-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.bar-label {
  width: 120px;
  font-size: 0.75rem;
  color: var(--color-text-muted);
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bar-container {
  flex: 1;
  background: var(--color-bg);
  border-radius: 4px;
  padding: 4px;
}

.bar-group {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.bar {
  height: 18px;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 6px;
  min-width: 35px;
  transition: width 0.5s ease;
}

.bar.ontology {
  background: linear-gradient(90deg, #00d9ff 0%, #0099cc 100%);
}

.bar.mindsdb {
  background: linear-gradient(90deg, #8b5cf6 0%, #6d28d9 100%);
}

.bar-value {
  font-size: 0.7rem;
  color: white;
  font-weight: 600;
}

.bar-winner {
  width: 70px;
  text-align: center;
}

.bar-winner span {
  font-size: 0.7rem;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
}

.bar-winner .causal {
  background: rgba(0, 217, 255, 0.2);
  color: #00d9ff;
}

.bar-winner .mindsdb {
  background: rgba(139, 92, 246, 0.2);
  color: #8b5cf6;
}

.bar-legend {
  display: flex;
  justify-content: center;
  gap: 1.5rem;
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--color-border);
}

.legend-item {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.legend-item.ontology::before {
  content: '';
  display: inline-block;
  width: 12px;
  height: 12px;
  background: #00d9ff;
  border-radius: 2px;
  margin-right: 0.4rem;
  vertical-align: middle;
}

.legend-item.mindsdb::before {
  content: '';
  display: inline-block;
  width: 12px;
  height: 12px;
  background: #8b5cf6;
  border-radius: 2px;
  margin-right: 0.4rem;
  vertical-align: middle;
}

/* 상세 테이블 */
.detail-section {
  margin-top: 1.5rem;
}

.comparison-table {
  overflow-x: auto;
  background: var(--color-bg-tertiary);
  border-radius: 10px;
}

.comparison-table table {
  width: 100%;
  border-collapse: collapse;
}

.comparison-table th,
.comparison-table td {
  padding: 0.75rem 1rem;
  text-align: left;
  border-bottom: 1px solid var(--color-border);
}

.comparison-table th {
  background: var(--color-bg);
  color: var(--color-text-muted);
  font-size: 0.8rem;
  font-weight: 500;
}

.edge {
  color: var(--color-text-bright);
  font-size: 0.85rem;
}

.good { color: #10b981; }
.moderate { color: #f59e0b; }
.low { color: #ef4444; }

.positive { color: #10b981; }
.negative { color: #ef4444; }
.neutral { color: var(--color-text-muted); }

.winner-badge {
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
}

.winner-badge.mindsdb {
  background: rgba(139, 92, 246, 0.2);
  color: #8b5cf6;
}

.winner-badge.causal {
  background: rgba(0, 217, 255, 0.2);
  color: #00d9ff;
}

@media (max-width: 768px) {
  .side-by-side-compare {
    flex-direction: column;
  }
  
  .vs-divider span {
    transform: rotate(90deg);
  }
}
</style>
