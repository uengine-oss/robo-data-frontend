<template>
  <div class="data-literacy">
    <h3 class="section-title">🎯 What-If 시뮬레이션 및 결과 해석</h3>
    <p class="section-desc">
      시나리오 조건을 설정하고 각 모델의 미래 예측을 비교 분석합니다.
    </p>
    
    <!-- ========== 시나리오 입력 섹션 ========== -->
    <div class="scenario-section">
      <h4 class="subsection-title">📊 시나리오 조건 설정</h4>
      
      <!-- 추천 시나리오 카드 -->
      <div class="recommended-scenarios">
        <div 
          v-for="scenario in recommendedScenarios"
          :key="scenario.id"
          class="scenario-card"
          :class="{ active: selectedScenario?.id === scenario.id }"
          @click="selectScenario(scenario)"
        >
          <div class="scenario-icon">{{ scenario.icon }}</div>
          <div class="scenario-info">
            <h5>{{ scenario.name }}</h5>
            <p>{{ scenario.description }}</p>
          </div>
          <div class="scenario-badge">{{ scenario.impact }}</div>
        </div>
      </div>
      
      <!-- 시나리오 상세 입력 -->
      <div v-if="selectedScenario" class="scenario-inputs">
        <div class="input-header">
          <span class="input-title">{{ selectedScenario.name }} 파라미터</span>
          <button class="reset-btn" @click="resetToDefault">
            🔄 기본값으로 초기화
          </button>
        </div>
        
        <div class="input-grid">
          <div 
            v-for="param in selectedScenario.parameters"
            :key="param.id"
            class="input-item"
          >
            <label :for="param.id">{{ param.label }}</label>
            <div class="input-with-unit">
              <input 
                :id="param.id"
                v-model="scenarioValues[param.id]"
                :type="param.type === 'number' ? 'number' : 'text'"
                :min="param.min"
                :max="param.max"
                :step="param.step"
                class="param-input"
              />
              <span class="unit">{{ param.unit }}</span>
            </div>
            <span class="param-range">범위: {{ param.min }} ~ {{ param.max }}</span>
          </div>
          
          <!-- 예측 기간 설정 -->
          <div class="input-item">
            <label for="forecastPeriod">예측 기간</label>
            <div class="input-with-unit">
              <input 
                id="forecastPeriod"
                v-model="forecastPeriod"
                type="number"
                min="1"
                max="12"
                step="1"
                class="param-input"
              />
              <span class="unit">개월</span>
            </div>
            <span class="param-range">1 ~ 12개월</span>
          </div>
          
          <!-- 시작 날짜 -->
          <div class="input-item">
            <label for="startDate">시작 날짜</label>
            <input 
              id="startDate"
              v-model="startDate"
              type="date"
              class="param-input date-input"
            />
          </div>
        </div>
        
        <!-- 시뮬레이션 실행 버튼 -->
        <div class="simulation-actions">
          <button 
            class="simulate-btn"
            :disabled="loading"
            @click="runSimulation"
          >
            <svg v-if="loading" class="spinner" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="30 70"/>
            </svg>
            <span v-else>🚀</span>
            {{ loading ? '시뮬레이션 실행 중...' : 'What-If 시뮬레이션 실행' }}
          </button>
          <button 
            class="add-profile-btn"
            :disabled="loading || !simulationResult"
            @click="saveAsProfile"
          >
            ➕ 프로필로 저장
          </button>
        </div>
      </div>
    </div>
    
    <!-- ========== A/B 테스트 프로필 섹션 ========== -->
    <div v-if="savedProfiles.length > 0" class="profiles-section">
      <h4 class="subsection-title">🔬 시나리오 프로필 비교 (A/B 테스트)</h4>
      
      <div class="profiles-grid">
        <div 
          v-for="(profile, idx) in savedProfiles"
          :key="profile.id"
          class="profile-card"
          :class="{ selected: selectedProfiles.includes(profile.id) }"
          :style="{ borderColor: profileColors[idx % profileColors.length] }"
        >
          <div class="profile-header">
            <span class="profile-label" :style="{ background: profileColors[idx % profileColors.length] }">
              {{ getProfileLabel(idx) }}
            </span>
            <button class="delete-profile-btn" @click="deleteProfile(profile.id)">🗑️</button>
          </div>
          <div class="profile-name">{{ profile.scenarioName }}</div>
          <div class="profile-params">
            <span v-for="(value, key) in profile.params" :key="key" class="param-tag">
              {{ key }}: {{ value }}
            </span>
          </div>
          <div class="profile-meta">
            <span>{{ profile.targetVariable }} 예측</span>
            <span>{{ formatDate(profile.createdAt) }}</span>
          </div>
          <div class="profile-result">
            <span class="result-label">최종 예측:</span>
            <span class="result-value">{{ formatValue(profile.finalValue) }} {{ profile.targetUnit }}</span>
            <span class="result-change" :class="profile.totalChange > 0 ? 'positive' : 'negative'">
              {{ profile.totalChange > 0 ? '+' : '' }}{{ profile.totalChange.toFixed(1) }}%
            </span>
          </div>
          <label class="profile-checkbox">
            <input 
              type="checkbox" 
              :checked="selectedProfiles.includes(profile.id)"
              @change="toggleProfileSelection(profile.id)"
            />
            비교에 포함
          </label>
        </div>
      </div>
      
      <!-- 프로필 비교 차트 -->
      <div v-if="selectedProfiles.length > 1" class="comparison-chart-section">
        <h5>📊 선택된 프로필 비교 차트</h5>
        <div class="comparison-chart-container">
          <canvas ref="comparisonChartRef"></canvas>
        </div>
        
        <!-- 비교 요약 테이블 -->
        <div class="comparison-summary">
          <table>
            <thead>
              <tr>
                <th>프로필</th>
                <th>시나리오</th>
                <th>주요 변수</th>
                <th>최종 예측</th>
                <th>변화율</th>
              </tr>
            </thead>
            <tbody>
              <tr 
                v-for="(profile, idx) in getSelectedProfileData()"
                :key="profile.id"
                :style="{ borderLeft: `4px solid ${profileColors[savedProfiles.findIndex(p => p.id === profile.id) % profileColors.length]}` }"
              >
                <td class="profile-label-cell">
                  <span :style="{ background: profileColors[savedProfiles.findIndex(p => p.id === profile.id) % profileColors.length] }">
                    {{ getProfileLabel(savedProfiles.findIndex(p => p.id === profile.id)) }}
                  </span>
                </td>
                <td>{{ profile.scenarioName }}</td>
                <td>{{ Object.entries(profile.params).map(([k,v]) => `${k}: ${v}`).join(', ') }}</td>
                <td class="value-cell">{{ formatValue(profile.finalValue) }} {{ profile.targetUnit }}</td>
                <td :class="profile.totalChange > 0 ? 'positive' : 'negative'">
                  {{ profile.totalChange > 0 ? '+' : '' }}{{ profile.totalChange.toFixed(1) }}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
    
    <!-- ========== 시뮬레이션 결과 섹션 ========== -->
    <div v-if="simulationResult" class="results-section">
      <h4 class="subsection-title">
        📈 미래 예측 결과: <span class="target-variable">{{ selectedScenario?.targetVariable }}</span>
        <span class="target-unit">({{ selectedScenario?.targetUnit }})</span>
      </h4>
      
      <!-- 시나리오 요약 -->
      <div class="scenario-summary">
        <div class="summary-item">
          <span class="summary-label">시나리오</span>
          <span class="summary-value">{{ selectedScenario?.name }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">예측 기간</span>
          <span class="summary-value">{{ startDate }} ~ {{ endDate }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">주요 변화</span>
          <span class="summary-value highlight">{{ getMainChange() }}</span>
        </div>
      </div>
      
      <!-- 예측 결과 차트 -->
      <div class="forecast-chart-container">
        <canvas ref="forecastChartRef"></canvas>
      </div>
      
      <!-- 모델별 예측 요약 테이블 -->
      <div class="model-forecast-table">
        <h5>📋 모델별 {{ selectedScenario?.targetVariable }} 예측 상세 (단위: {{ selectedScenario?.targetUnit }})</h5>
        <table>
          <thead>
            <tr>
              <th>날짜</th>
              <th v-for="model in availableModels" :key="model.id">
                {{ model.icon }} {{ model.name }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, idx) in forecastTable" :key="idx">
              <td class="date-cell">{{ row.date }}</td>
              <td 
                v-for="model in availableModels" 
                :key="model.id"
                :class="getCellClass(row[model.id], idx)"
              >
                {{ formatValue(row[model.id]) }}
                <span v-if="idx > 0" class="change-badge" :class="getChangeClass(row[model.id], forecastTable[idx-1]?.[model.id])">
                  {{ getChangePercent(row[model.id], forecastTable[idx-1]?.[model.id]) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      
      <!-- 온톨로지 기반 인과 경로 설명 -->
      <div class="causal-explanation">
        <div class="explanation-header">
          <h5>🔗 온톨로지 기반 예측 경로 분석</h5>
          <button class="expand-btn" @click="openExplainabilityModal" title="전체 화면으로 보기">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
            </svg>
            그래프로 보기
          </button>
        </div>
        <p class="causal-intro">
          <strong>{{ selectedScenario?.name }}</strong>에서 <strong class="target-highlight">{{ selectedScenario?.targetVariable }}</strong>가 
          어떻게 영향을 받는지 인과관계 경로를 분석합니다.
        </p>
        
        <!-- 인과 경로 시각화 -->
        <div class="causal-path-flow">
          <div v-for="(path, idx) in getCausalPaths()" :key="idx" class="causal-path">
            <div class="path-header">
              <span class="path-number">경로 {{ idx + 1 }}</span>
              <span class="path-strength" :class="path.strength">{{ path.strengthLabel }}</span>
            </div>
            <div class="path-nodes">
              <template v-for="(node, nodeIdx) in path.nodes" :key="nodeIdx">
                <div class="path-node" :class="{ 'start': nodeIdx === 0, 'end': nodeIdx === path.nodes.length - 1 }">
                  <span class="node-icon">{{ node.icon }}</span>
                  <span class="node-name">{{ node.name }}</span>
                  <span v-if="node.change" class="node-change" :class="node.changeClass">{{ node.change }}</span>
                </div>
                <div v-if="nodeIdx < path.nodes.length - 1" class="path-arrow">
                  <span class="arrow-label">{{ path.effects[nodeIdx] }}</span>
                  →
                </div>
              </template>
            </div>
            <div class="path-explanation">
              {{ path.explanation }}
            </div>
          </div>
        </div>
        
        <!-- 종합 영향 분석 -->
        <div class="impact-summary">
          <div class="impact-header">📊 종합 영향 분석</div>
          <div class="impact-content" v-html="getImpactAnalysis()"></div>
        </div>
      </div>
      
      <!-- 핵심 인사이트 -->
      <div class="key-insights">
        <h5>💡 핵심 인사이트</h5>
        <div class="insights-grid">
          <div class="insight-card positive" v-if="simulationResult.insights?.best_model">
            <div class="insight-icon">🏆</div>
            <div class="insight-content">
              <div class="insight-title">가장 정확한 모델</div>
              <div class="insight-value">{{ simulationResult.insights.best_model }}</div>
            </div>
          </div>
          <div class="insight-card" :class="getTrendClass(simulationResult.insights?.trend)">
            <div class="insight-icon">📈</div>
            <div class="insight-content">
              <div class="insight-title">예측 추세</div>
              <div class="insight-value">{{ simulationResult.insights?.trend || '분석 중' }}</div>
            </div>
          </div>
          <div class="insight-card warning" v-if="simulationResult.insights?.risk_level">
            <div class="insight-icon">⚠️</div>
            <div class="insight-content">
              <div class="insight-title">리스크 수준</div>
              <div class="insight-value">{{ simulationResult.insights.risk_level }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- ========== AI 해석 섹션 ========== -->
    <div class="literacy-section">
      <h4 class="subsection-title">🤖 AI 데이터 리터러시</h4>
      
      <!-- 리포트 타입 선택 -->
      <div class="report-types">
        <button 
          v-for="type in reportTypes"
          :key="type.id"
          class="report-type-btn"
          :class="{ active: selectedReportType === type.id }"
          @click="selectedReportType = type.id"
        >
          <span class="type-icon">{{ type.icon }}</span>
          <span class="type-name">{{ type.name }}</span>
        </button>
      </div>
      
      <!-- 생성 버튼 -->
      <div class="action-area">
        <button 
          class="generate-btn"
          :disabled="loading || !sessionId"
          @click="$emit('generate', selectedReportType)"
        >
          <svg v-if="loading" class="spinner" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="30 70"/>
          </svg>
          <span v-else>✨</span>
          {{ loading ? 'AI 분석 중...' : `${getTypeName(selectedReportType)} 생성` }}
        </button>
        
        <div class="language-toggle">
          <button 
            :class="{ active: language === 'ko' }"
            @click="language = 'ko'"
          >한국어</button>
          <button 
            :class="{ active: language === 'en' }"
            @click="language = 'en'"
          >English</button>
        </div>
      </div>
      
      <!-- 설명 결과 -->
      <div v-if="explanation" class="explanation-result">
        <div class="result-header">
          <h4 class="result-title">
            {{ getTypeName(explanation.report_type) }}
          </h4>
          <div class="result-actions">
            <button class="action-btn" @click="copyToClipboard">
              📋 복사
            </button>
            <button class="action-btn" @click="downloadAsMd">
              ⬇️ 다운로드
            </button>
          </div>
        </div>
        
        <div class="explanation-content" v-html="renderMarkdown(explanation.explanation)">
        </div>
      </div>
    </div>
    
    <!-- ========== Explainability 모달 (Cytoscape 그래프) ========== -->
    <Teleport to="body">
      <div v-if="showExplainabilityModal" class="explainability-modal">
        <div class="modal-backdrop" @click="closeExplainabilityModal"></div>
        <div class="modal-container">
          <div class="modal-header">
            <h3>🔬 시뮬레이션 인과관계 분석</h3>
            <div class="modal-controls">
              <button class="play-btn" @click="startAnimation" :disabled="isAnimating">
                {{ isAnimating ? '⏹️ 애니메이션 중...' : '▶️ 애니메이션 재생' }}
              </button>
              <button class="close-btn" @click="closeExplainabilityModal">✕</button>
            </div>
          </div>
          
          <div class="modal-body">
            <!-- 왼쪽: 타임라인 패널 -->
            <div class="timeline-panel">
              <div class="timeline-header">
                <h4>📅 시뮬레이션 타임라인</h4>
              </div>
              <div class="timeline-list">
                <div 
                  v-for="(step, idx) in simulationTimeline" 
                  :key="idx"
                  class="timeline-item"
                  :class="{ active: selectedTimeStep === idx, future: step.isFuture }"
                  @click="selectTimeStep(idx)"
                >
                  <div class="timeline-dot" :class="{ pulse: step.isFuture }"></div>
                  <div class="timeline-content">
                    <span class="timeline-date">{{ step.date }}</span>
                    <span class="timeline-label">{{ step.label }}</span>
                    <div class="timeline-values">
                      <span v-for="(val, key) in step.keyValues" :key="key" class="timeline-value">
                        {{ key }}: <strong :class="val.class">{{ val.display }}</strong>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- 중앙: Cytoscape 그래프 영역 -->
            <div class="graph-container" ref="explainGraphContainer"></div>
            
            <!-- 오른쪽: 선택된 엣지/노드 정보 -->
            <div class="info-panel" :class="{ active: selectedElement }">
              <div v-if="selectedElement" class="element-info">
                <div class="info-header">
                  <span class="info-icon">{{ selectedElement.icon }}</span>
                  <span class="info-title">{{ selectedElement.title }}</span>
                </div>
                
                <!-- 노드 정보 -->
                <div v-if="selectedElement.type === 'node'" class="node-details">
                  <div class="detail-row">
                    <span class="label">변수명</span>
                    <span class="value">{{ selectedElement.name }}</span>
                  </div>
                  <div class="detail-row">
                    <span class="label">현재 값</span>
                    <span class="value">{{ selectedElement.currentValue }}</span>
                  </div>
                  <div class="detail-row">
                    <span class="label">시뮬레이션 값</span>
                    <span class="value highlight">{{ selectedElement.simulatedValue }}</span>
                  </div>
                  <div class="detail-row">
                    <span class="label">변화율</span>
                    <span class="value" :class="selectedElement.changeClass">{{ selectedElement.change }}</span>
                  </div>
                </div>
                
                <!-- 엣지 정보 -->
                <div v-if="selectedElement.type === 'edge'" class="edge-details">
                  <div class="connection-flow">
                    <span class="source">{{ selectedElement.source }}</span>
                    <span class="arrow">→</span>
                    <span class="target">{{ selectedElement.target }}</span>
                  </div>
                  <div class="detail-row">
                    <span class="label">영향도</span>
                    <span class="value">{{ selectedElement.influence }}</span>
                  </div>
                  <div class="detail-row">
                    <span class="label">모델 R²</span>
                    <span class="value">{{ selectedElement.r2 }}</span>
                  </div>
                  <div class="detail-row">
                    <span class="label">관계 함수</span>
                    <span class="value formula">{{ selectedElement.formula }}</span>
                  </div>
                  
                  <!-- 미니 차트 -->
                  <div class="mini-chart">
                    <canvas ref="miniChartCanvas"></canvas>
                  </div>
                </div>
              </div>
              
              <div v-else class="no-selection">
                <p>노드나 연결선을 클릭하면<br/>상세 정보가 표시됩니다</p>
              </div>
            </div>
          </div>
          
          <!-- 범례 -->
          <div class="modal-legend">
            <div class="legend-item">
              <span class="legend-dot input"></span>
              <span>입력 변수 (시나리오)</span>
            </div>
            <div class="legend-item">
              <span class="legend-dot intermediate"></span>
              <span>중간 변수</span>
            </div>
            <div class="legend-item">
              <span class="legend-dot output"></span>
              <span>출력 변수 (예측 대상)</span>
            </div>
            <div class="legend-item">
              <span class="legend-line positive"></span>
              <span>양의 영향 (+)</span>
            </div>
            <div class="legend-item">
              <span class="legend-line negative"></span>
              <span>음의 영향 (-)</span>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { whatifApi, type LiteracyExplanation } from '@/features/whatif/whatif-api'
import Chart from 'chart.js/auto'
import cytoscape from 'cytoscape'

const props = defineProps<{
  sessionId: string | null
  explanation: LiteracyExplanation | null
  loading: boolean
  causalResult?: any  // Neo4j에서 가져온 온톨로지 데이터
  comparisonResult?: any  // 모델 비교 결과
}>()

const emit = defineEmits<{
  (e: 'generate', reportType: 'summary' | 'discovery' | 'validation' | 'comparison'): void
}>()

// 차트 ref
const forecastChartRef = ref<HTMLCanvasElement | null>(null)
const comparisonChartRef = ref<HTMLCanvasElement | null>(null)
let forecastChart: Chart | null = null
let comparisonChart: Chart | null = null

// Explainability 모달 관련
const showExplainabilityModal = ref(false)
const explainGraphContainer = ref<HTMLDivElement | null>(null)
const miniChartCanvas = ref<HTMLCanvasElement | null>(null)
const selectedElement = ref<any>(null)
const isAnimating = ref(false)
const selectedTimeStep = ref(0)
const simulationTimeline = ref<any[]>([])
const trackedPath = ref<string[]>([])  // 추적된 경로의 노드/엣지 ID들
let cyExplain: any = null
let miniChart: Chart | null = null

// 시나리오 관련 상태
const selectedScenario = ref<RecommendedScenario | null>(null)
const scenarioValues = ref<Record<string, number>>({})
const forecastPeriod = ref(6)
const startDate = ref(new Date().toISOString().split('T')[0])

// 시뮬레이션 결과
const simulationResult = ref<SimulationResult | null>(null)

// A/B 테스트 프로필 관리
interface SimulationProfile {
  id: string
  scenarioId: string
  scenarioName: string
  params: Record<string, number>
  targetVariable: string
  targetUnit: string
  forecasts: { date: string; ontology: number; ttm: number; mindsdb: number }[]
  finalValue: number
  totalChange: number
  createdAt: string
}

const savedProfiles = ref<SimulationProfile[]>([])
const selectedProfiles = ref<string[]>([])
const profileColors = ['#00d9ff', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#ec4899']

// AI 리터러시
const selectedReportType = ref<'summary' | 'discovery' | 'validation' | 'comparison'>('summary')
const language = ref<'ko' | 'en'>('ko')

// 타입 정의
interface ScenarioParameter {
  id: string
  label: string
  type: 'number' | 'text'
  default: number
  min: number
  max: number
  step: number
  unit: string
}

interface RecommendedScenario {
  id: string
  name: string
  icon: string
  description: string
  impact: string
  targetVariable: string  // 예측 대상 변수 (예: 매출액, 영업이익)
  targetUnit: string      // 단위 (예: 백만원, %)
  baseValue: number       // 기준값
  parameters: ScenarioParameter[]
}

interface SimulationResult {
  forecasts: {
    date: string
    ontology: number
    ttm: number
    mindsdb: number
  }[]
  insights: {
    best_model: string
    trend: string
    risk_level: string
    summary: string
  }
}

// 추천 시나리오 (타겟 변수 명시)
const recommendedScenarios: RecommendedScenario[] = [
  {
    id: 'exchange_shock',
    name: '환율 충격 시나리오',
    icon: '💱',
    description: '급격한 환율 변동이 매출액에 미치는 영향 분석',
    impact: '고위험',
    targetVariable: '매출액',
    targetUnit: '백만원',
    baseValue: 1000,
    parameters: [
      { id: 'exchange_change', label: '환율 변동률', type: 'number', default: 10, min: -30, max: 30, step: 1, unit: '%' },
      { id: 'duration', label: '영향 지속 기간', type: 'number', default: 3, min: 1, max: 12, step: 1, unit: '개월' }
    ]
  },
  {
    id: 'demand_increase',
    name: '수요 증가 시나리오',
    icon: '📈',
    description: '시장 수요 증가에 따른 매출액 영향 분석',
    impact: '성장',
    targetVariable: '매출액',
    targetUnit: '백만원',
    baseValue: 1000,
    parameters: [
      { id: 'demand_change', label: '수요 변동률', type: 'number', default: 15, min: 0, max: 50, step: 5, unit: '%' },
      { id: 'ramp_up', label: '증가 속도', type: 'number', default: 2, min: 1, max: 6, step: 1, unit: '개월' }
    ]
  },
  {
    id: 'cost_pressure',
    name: '원가 상승 시나리오',
    icon: '💰',
    description: '원자재 가격 상승이 영업이익에 미치는 영향',
    impact: '압박',
    targetVariable: '영업이익',
    targetUnit: '백만원',
    baseValue: 200,
    parameters: [
      { id: 'cost_increase', label: '원가 상승률', type: 'number', default: 8, min: 0, max: 30, step: 1, unit: '%' },
      { id: 'pass_through', label: '가격 전가율', type: 'number', default: 50, min: 0, max: 100, step: 10, unit: '%' }
    ]
  }
]

// 사용 가능한 모델
const availableModels = [
  { id: 'ontology', name: '온톨로지', icon: '🔬', color: '#00d9ff' },
  { id: 'ttm', name: 'TTM', icon: '🧠', color: '#f59e0b' },
  { id: 'mindsdb', name: 'MindsDB', icon: '💡', color: '#8b5cf6' }
]

// 리포트 타입
const reportTypes = [
  { id: 'summary', name: '종합 요약', icon: '📋' },
  { id: 'discovery', name: '인과관계', icon: '🔗' },
  { id: 'validation', name: '검증 결과', icon: '✅' },
  { id: 'comparison', name: '모델 비교', icon: '⚖️' }
]

// 계산된 속성
const endDate = computed(() => {
  if (!startDate.value) return ''
  const date = new Date(startDate.value)
  date.setMonth(date.getMonth() + forecastPeriod.value)
  return date.toISOString().split('T')[0]
})

const forecastTable = computed(() => {
  if (!simulationResult.value?.forecasts) return []
  return simulationResult.value.forecasts
})

// 메서드
function selectScenario(scenario: RecommendedScenario) {
  selectedScenario.value = scenario
  resetToDefault()
}

function resetToDefault() {
  if (!selectedScenario.value) return
  const values: Record<string, number> = {}
  selectedScenario.value.parameters.forEach(p => {
    values[p.id] = p.default
  })
  scenarioValues.value = values
}

async function runSimulation() {
  if (!selectedScenario.value || !props.sessionId) return
  
  try {
    // 시뮬레이션 API 호출 (실제 구현 시 API 연동)
    // 현재는 목업 데이터 생성
    const forecasts = generateMockForecast()
    
    simulationResult.value = {
      forecasts,
      insights: {
        best_model: '온톨로지 모델',
        trend: getMainChange(),
        risk_level: selectedScenario.value.impact,
        summary: `${selectedScenario.value.name}에 따른 분석 결과입니다.`
      }
    }
    
    await nextTick()
    createForecastChart()
  } catch (error) {
    console.error('시뮬레이션 오류:', error)
  }
}

function generateMockForecast() {
  const forecasts = []
  const baseDate = new Date(startDate.value)
  const changeRate = (scenarioValues.value['exchange_change'] || scenarioValues.value['demand_change'] || scenarioValues.value['cost_increase'] || 10) / 100
  
  // 시나리오별 기준값 사용
  const baseValue = selectedScenario.value?.baseValue || 1000
  
  for (let i = 0; i <= forecastPeriod.value; i++) {
    const date = new Date(baseDate)
    date.setMonth(date.getMonth() + i)
    
    // 노이즈는 기준값에 비례
    const noise = () => (Math.random() - 0.5) * (baseValue * 0.05)
    // 시간에 따른 변화 추세
    const trend = 1 + (changeRate * i / forecastPeriod.value)
    
    // 각 모델별 약간 다른 예측 (현실적 시뮬레이션)
    const ontologyVal = baseValue * trend + noise()
    const ttmVal = baseValue * trend * (1 + (Math.random() - 0.5) * 0.08) + noise()
    const mindsdbVal = baseValue * trend * (1 + (Math.random() - 0.5) * 0.12) + noise()
    
    forecasts.push({
      date: date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short' }),
      ontology: Math.round(ontologyVal * 100) / 100,
      ttm: Math.round(ttmVal * 100) / 100,
      mindsdb: Math.round(mindsdbVal * 100) / 100
    })
  }
  
  return forecasts
}

function createForecastChart() {
  if (!forecastChartRef.value || !simulationResult.value) return
  
  if (forecastChart) {
    forecastChart.destroy()
  }
  
  const forecasts = simulationResult.value.forecasts
  
  forecastChart = new Chart(forecastChartRef.value, {
    type: 'line',
    data: {
      labels: forecasts.map(f => f.date),
      datasets: [
        {
          label: '🔬 온톨로지',
          data: forecasts.map(f => f.ontology),
          borderColor: '#00d9ff',
          backgroundColor: 'rgba(0, 217, 255, 0.1)',
          borderWidth: 3,
          pointRadius: 5,
          fill: true,
          tension: 0.3
        },
        {
          label: '🧠 TTM',
          data: forecasts.map(f => f.ttm),
          borderColor: '#f59e0b',
          backgroundColor: 'transparent',
          borderWidth: 3,
          pointRadius: 5,
          borderDash: [5, 5],
          tension: 0.3
        },
        {
          label: '💡 MindsDB',
          data: forecasts.map(f => f.mindsdb),
          borderColor: '#8b5cf6',
          backgroundColor: 'transparent',
          borderWidth: 3,
          pointRadius: 5,
          borderDash: [10, 5],
          tension: 0.3
        }
      ]
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
            padding: 20
          }
        },
        title: {
          display: true,
          text: `${selectedScenario.value?.name} → ${selectedScenario.value?.targetVariable} 예측 (${startDate.value} ~ ${endDate.value})`,
          color: '#fff',
          font: { size: 16, weight: 'bold' }
        }
      },
      scales: {
        x: {
          title: { display: true, text: '예측 기간', color: '#94a3b8' },
          ticks: { color: '#94a3b8' },
          grid: { color: 'rgba(255,255,255,0.05)' }
        },
        y: {
          title: { display: true, text: `${selectedScenario.value?.targetVariable} (${selectedScenario.value?.targetUnit})`, color: '#94a3b8' },
          ticks: { color: '#94a3b8' },
          grid: { color: 'rgba(255,255,255,0.1)' }
        }
      }
    }
  })
}

function getMainChange(): string {
  if (!selectedScenario.value) return ''
  const param = selectedScenario.value.parameters[0]
  const value = scenarioValues.value[param.id] || param.default
  return `${param.label} ${value > 0 ? '+' : ''}${value}${param.unit}`
}

// 온톨로지 기반 인과 경로 생성
interface CausalNode {
  name: string
  icon: string
  change?: string
  changeClass?: string
}

interface CausalPath {
  nodes: CausalNode[]
  effects: string[]
  strength: string
  strengthLabel: string
  explanation: string
}

function getCausalPaths(): CausalPath[] {
  if (!selectedScenario.value) return []
  
  const changeValue = scenarioValues.value[selectedScenario.value.parameters[0].id] || 
                      selectedScenario.value.parameters[0].default
  const isPositive = changeValue > 0
  
  // 시나리오별 인과 경로 정의
  if (selectedScenario.value.id === 'exchange_shock') {
    return [
      {
        nodes: [
          { name: 'USD/KRW 환율', icon: '💱', change: `${isPositive ? '+' : ''}${changeValue}%`, changeClass: isPositive ? 'up' : 'down' },
          { name: '수입 원자재 비용', icon: '📦', change: isPositive ? '상승' : '하락', changeClass: isPositive ? 'up' : 'down' },
          { name: '제품 원가', icon: '🏭', change: isPositive ? '증가' : '감소', changeClass: isPositive ? 'up' : 'down' },
          { name: '판매 가격', icon: '💰', change: isPositive ? '인상 압력' : '인하 여력', changeClass: isPositive ? 'up' : 'down' },
          { name: '매출액', icon: '📈', change: isPositive ? '증가 예상' : '감소 예상', changeClass: isPositive ? 'up' : 'down' }
        ],
        effects: ['+' + Math.abs(changeValue*0.8).toFixed(1) + '%', '+' + Math.abs(changeValue*0.6).toFixed(1) + '%', '+' + Math.abs(changeValue*0.4).toFixed(1) + '%', '+' + Math.abs(changeValue*0.5).toFixed(1) + '%'],
        strength: 'high',
        strengthLabel: '주요 경로',
        explanation: `환율이 ${changeValue}% ${isPositive ? '상승' : '하락'}하면 수입 원자재 비용이 ${isPositive ? '증가' : '감소'}하고, 이는 제품 원가와 판매 가격에 순차적으로 영향을 미쳐 최종적으로 매출액이 ${isPositive ? '증가' : '감소'}합니다.`
      },
      {
        nodes: [
          { name: 'USD/KRW 환율', icon: '💱', change: `${isPositive ? '+' : ''}${changeValue}%`, changeClass: isPositive ? 'up' : 'down' },
          { name: '수출 경쟁력', icon: '🌍', change: isPositive ? '강화' : '약화', changeClass: isPositive ? 'up' : 'down' },
          { name: '해외 매출', icon: '🚢', change: isPositive ? '증가' : '감소', changeClass: isPositive ? 'up' : 'down' },
          { name: '매출액', icon: '📈', change: isPositive ? '추가 증가' : '추가 감소', changeClass: isPositive ? 'up' : 'down' }
        ],
        effects: ['+' + Math.abs(changeValue*0.5).toFixed(1) + '%', '+' + Math.abs(changeValue*0.7).toFixed(1) + '%', '+' + Math.abs(changeValue*0.3).toFixed(1) + '%'],
        strength: 'medium',
        strengthLabel: '보조 경로',
        explanation: `원화 약세(환율 상승)는 수출 경쟁력을 강화시켜 해외 매출 증가로 이어질 수 있습니다.`
      }
    ]
  } else if (selectedScenario.value.id === 'demand_increase') {
    return [
      {
        nodes: [
          { name: '시장 수요', icon: '📊', change: `+${changeValue}%`, changeClass: 'up' },
          { name: '판매량', icon: '📦', change: '증가', changeClass: 'up' },
          { name: '생산량', icon: '🏭', change: '확대', changeClass: 'up' },
          { name: '매출액', icon: '📈', change: '증가', changeClass: 'up' }
        ],
        effects: ['+' + (changeValue*0.9).toFixed(1) + '%', '+' + (changeValue*0.85).toFixed(1) + '%', '+' + (changeValue*0.8).toFixed(1) + '%'],
        strength: 'high',
        strengthLabel: '주요 경로',
        explanation: `시장 수요가 ${changeValue}% 증가하면 판매량과 생산량이 비례하여 증가하고, 매출액도 함께 상승합니다.`
      }
    ]
  } else if (selectedScenario.value.id === 'cost_pressure') {
    const passThrough = scenarioValues.value['pass_through'] || 50
    return [
      {
        nodes: [
          { name: '원자재 가격', icon: '📦', change: `+${changeValue}%`, changeClass: 'up' },
          { name: '제조 원가', icon: '🏭', change: '상승', changeClass: 'up' },
          { name: '판매 가격', icon: '💰', change: `+${(changeValue * passThrough / 100).toFixed(1)}% 전가`, changeClass: 'neutral' },
          { name: '영업이익', icon: '💵', change: '압박', changeClass: 'down' }
        ],
        effects: ['+' + (changeValue*0.9).toFixed(1) + '%', `${passThrough}% 전가`, '-' + (changeValue * (100 - passThrough) / 100).toFixed(1) + '%'],
        strength: 'high',
        strengthLabel: '주요 경로',
        explanation: `원자재 가격이 ${changeValue}% 상승하고 ${passThrough}%만 가격에 전가할 경우, 영업이익은 약 ${(changeValue * (100 - passThrough) / 100).toFixed(1)}% 감소합니다.`
      }
    ]
  }
  
  return []
}

// 종합 영향 분석 생성
function getImpactAnalysis(): string {
  if (!selectedScenario.value || !simulationResult.value) return ''
  
  const forecasts = simulationResult.value.forecasts
  const firstVal = forecasts[0]?.ontology || 0
  const lastVal = forecasts[forecasts.length - 1]?.ontology || 0
  const totalChange = ((lastVal - firstVal) / firstVal * 100).toFixed(1)
  const changeValue = scenarioValues.value[selectedScenario.value.parameters[0].id] || 
                      selectedScenario.value.parameters[0].default
  
  return `
    <div class="analysis-block">
      <div class="analysis-title">📌 시나리오 조건</div>
      <div class="analysis-text">
        <strong>${selectedScenario.value.parameters[0].label}</strong>이 
        <span class="highlight-change">${changeValue > 0 ? '+' : ''}${changeValue}%</span> 변동하는 상황을 가정합니다.
      </div>
    </div>
    <div class="analysis-block">
      <div class="analysis-title">📈 예측 결과</div>
      <div class="analysis-text">
        온톨로지 모델 기준, <strong>${selectedScenario.value.targetVariable}</strong>은 
        ${forecastPeriod.value}개월 후 
        <span class="highlight-value">${formatValue(lastVal)} ${selectedScenario.value.targetUnit}</span>으로 
        총 <span class="highlight-change ${Number(totalChange) > 0 ? 'positive' : 'negative'}">${totalChange}%</span> 
        ${Number(totalChange) > 0 ? '증가' : '감소'}할 것으로 예측됩니다.
      </div>
    </div>
    <div class="analysis-block">
      <div class="analysis-title">🔍 인과관계 해석</div>
      <div class="analysis-text">
        이 예측은 위에서 분석한 <strong>인과 경로</strong>를 통해 도출되었습니다.
        ${selectedScenario.value.id === 'exchange_shock' ? 
          '환율 변동은 수입 비용과 수출 경쟁력에 동시에 영향을 미치며, 두 효과의 합산으로 최종 매출이 결정됩니다.' :
          selectedScenario.value.id === 'demand_increase' ?
          '수요 증가는 판매량 증가로 직접 연결되어 매출 성장을 견인합니다.' :
          '원가 상승분 중 가격 전가율에 따라 이익 압박 정도가 결정됩니다.'}
      </div>
    </div>
    <div class="analysis-block">
      <div class="analysis-title">💡 의사결정 제안</div>
      <div class="analysis-text">
        ${selectedScenario.value.id === 'exchange_shock' ? 
          '환율 변동에 대비하여 <strong>헤징 전략</strong> 및 <strong>원자재 공급망 다변화</strong>를 고려하세요.' :
          selectedScenario.value.id === 'demand_increase' ?
          '수요 증가에 대응하여 <strong>생산 능력 확충</strong> 및 <strong>재고 관리 최적화</strong>가 필요합니다.' :
          '원가 상승 시 <strong>가격 전가 전략</strong>과 <strong>원가 절감 방안</strong>을 병행하세요.'}
      </div>
    </div>
  `
}

function formatValue(val: number): string {
  if (val === undefined || val === null) return 'N/A'
  return val.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function getCellClass(val: number, idx: number): string {
  return idx === 0 ? 'base-value' : ''
}

function getChangeClass(current: number, previous: number): string {
  if (!previous) return ''
  const change = (current - previous) / previous
  if (change > 0.02) return 'positive'
  if (change < -0.02) return 'negative'
  return 'neutral'
}

function getChangePercent(current: number, previous: number): string {
  if (!previous) return ''
  const change = ((current - previous) / previous) * 100
  const sign = change > 0 ? '+' : ''
  return `${sign}${change.toFixed(1)}%`
}

function getTrendClass(trend: string): string {
  if (trend?.includes('상승') || trend?.includes('+')) return 'positive'
  if (trend?.includes('하락') || trend?.includes('-')) return 'negative'
  return 'neutral'
}

function getTypeName(type: string): string {
  const found = reportTypes.find(t => t.id === type)
  return found ? found.name : type
}

// ========== Explainability 모달 함수들 ==========
function openExplainabilityModal() {
  showExplainabilityModal.value = true
  selectedElement.value = null
  selectedTimeStep.value = 0
  
  // 타임라인 초기화
  initTimeline()
  
  nextTick(() => {
    initExplainGraph()
  })
}

function initTimeline() {
  const result = simulationResult.value
  const startDateVal = new Date(startDate.value)
  const periods = forecastPeriod.value || 6
  
  const timeline: any[] = []
  
  // 과거 데이터 (최근 3개월)
  for (let i = -3; i <= 0; i++) {
    const date = new Date(startDateVal)
    date.setMonth(date.getMonth() + i)
    
    timeline.push({
      date: formatDateShort(date),
      label: i === 0 ? '현재 (기준)' : `t${i}`,
      isFuture: false,
      keyValues: generateTimeStepValues(i, false),
      values: generateNodeValues(i, false)
    })
  }
  
  // 미래 예측 (시뮬레이션)
  for (let i = 1; i <= periods; i++) {
    const date = new Date(startDateVal)
    date.setMonth(date.getMonth() + i)
    
    timeline.push({
      date: formatDateShort(date),
      label: `t+${i} (예측)`,
      isFuture: true,
      keyValues: generateTimeStepValues(i, true),
      values: generateNodeValues(i, true)
    })
  }
  
  simulationTimeline.value = timeline
  selectedTimeStep.value = 3  // 현재 시점 선택
}

function generateTimeStepValues(offset: number, isFuture: boolean): Record<string, any> {
  const scenario = selectedScenario.value
  const baseChange = scenarioValues.value[scenario?.parameters?.[0]?.id] || 10
  
  // 시간에 따른 누적 효과
  const multiplier = isFuture ? 1 + (offset * 0.1) : 1 - (Math.abs(offset) * 0.05)
  
  return {
    '환율': {
      display: `${(baseChange * multiplier).toFixed(1)}%`,
      class: baseChange > 0 ? 'positive' : 'negative'
    },
    '매출': {
      display: `${(baseChange * multiplier * 0.5).toFixed(1)}%`,
      class: baseChange > 0 ? 'positive' : 'negative'
    }
  }
}

function generateNodeValues(offset: number, isFuture: boolean): Record<string, any> {
  const baseChange = scenarioValues.value[selectedScenario.value?.parameters?.[0]?.id] || 10
  const multiplier = isFuture ? 1 + (offset * 0.1) : 1 - (Math.abs(offset) * 0.05)
  
  return {
    exchange_rate: { actual: 1200, predicted: 1200 * (1 + baseChange/100 * multiplier), change: baseChange * multiplier },
    import_cost: { actual: 500, predicted: 500 * (1 + baseChange/100 * 0.8 * multiplier), change: baseChange * 0.8 * multiplier },
    product_cost: { actual: 800, predicted: 800 * (1 + baseChange/100 * 0.6 * multiplier), change: baseChange * 0.6 * multiplier },
    selling_price: { actual: 1000, predicted: 1000 * (1 + baseChange/100 * 0.4 * multiplier), change: baseChange * 0.4 * multiplier },
    sales_revenue: { actual: 10000, predicted: 10000 * (1 + baseChange/100 * 0.5 * multiplier), change: baseChange * 0.5 * multiplier }
  }
}

function formatDateShort(date: Date): string {
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}`
}

function selectTimeStep(idx: number) {
  selectedTimeStep.value = idx
  
  // 그래프 업데이트
  if (cyExplain) {
    updateGraphForTimeStep()
  }
}

function updateGraphForTimeStep() {
  const timeData = simulationTimeline.value[selectedTimeStep.value]
  if (!timeData || !cyExplain) return
  
  // 노드 라벨과 스타일 업데이트
  cyExplain.nodes().forEach((node: any) => {
    const id = node.id()
    const nodeValue = timeData.values?.[id]
    
    if (nodeValue) {
      const change = nodeValue.change || 0
      const changeLabel = change !== 0 ? `${change > 0 ? '+' : ''}${change.toFixed(1)}%` : ''
      const originalLabel = node.data('originalLabel') || id
      
      node.data('label', `${originalLabel}${changeLabel ? '\n' + changeLabel : ''}`)
      node.data('currentValue', nodeValue.actual)
      node.data('simulatedValue', nodeValue.predicted)
      node.data('change', change)
    }
  })
  
  // 미래 시점이면 예측 강조
  if (timeData.isFuture) {
    cyExplain.nodes('.tracked').addClass('future-prediction')
  } else {
    cyExplain.nodes().removeClass('future-prediction')
  }
}

function closeExplainabilityModal() {
  showExplainabilityModal.value = false
  isAnimating.value = false
  if (cyExplain) {
    cyExplain.destroy()
    cyExplain = null
  }
  if (miniChart) {
    miniChart.destroy()
    miniChart = null
  }
}

function initExplainGraph() {
  if (!explainGraphContainer.value) return
  
  // 시뮬레이션 결과 기반으로 노드/엣지 생성
  const elements = generateGraphElements()
  
  cyExplain = cytoscape({
    container: explainGraphContainer.value,
    elements: elements,
    style: [
      {
        selector: 'node',
        style: {
          'background-color': '#374151',
          'label': 'data(label)',
          'color': '#fff',
          'font-size': '12px',
          'text-wrap': 'wrap',
          'text-max-width': '100px',
          'text-valign': 'bottom',
          'text-margin-y': 8,
          'width': 50,
          'height': 50,
          'border-width': 3,
          'border-color': '#4b5563',
          'opacity': 0
        }
      },
      {
        selector: 'node.input',
        style: {
          'background-color': '#b45309',
          'border-color': '#f59e0b'
        }
      },
      {
        selector: 'node.intermediate',
        style: {
          'background-color': '#1e40af',
          'border-color': '#3b82f6'
        }
      },
      {
        selector: 'node.output',
        style: {
          'background-color': '#065f46',
          'border-color': '#10b981'
        }
      },
      {
        selector: 'node.highlighted',
        style: {
          'border-width': 5,
          'border-color': '#fff'
        }
      },
      {
        selector: 'node.faded',
        style: {
          'opacity': 0.25
        }
      },
      {
        selector: 'node.tracked',
        style: {
          'opacity': 1,
          'border-width': 4
        }
      },
      {
        selector: 'node.future-prediction',
        style: {
          'border-style': 'dashed',
          'border-color': '#fbbf24'
        }
      },
      {
        selector: 'edge',
        style: {
          'width': 3,
          'line-color': '#6b7280',
          'target-arrow-color': '#6b7280',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          'label': 'data(influence)',
          'font-size': '10px',
          'color': '#9ca3af',
          'text-rotation': 'autorotate',
          'text-margin-y': -10,
          'opacity': 0
        }
      },
      {
        selector: 'edge.positive',
        style: {
          'line-color': '#10b981',
          'target-arrow-color': '#10b981'
        }
      },
      {
        selector: 'edge.negative',
        style: {
          'line-color': '#ef4444',
          'target-arrow-color': '#ef4444'
        }
      },
      {
        selector: 'edge.animated',
        style: {
          'line-style': 'dashed',
          'line-dash-pattern': [6, 3]
        }
      },
      {
        selector: 'edge.faded',
        style: {
          'opacity': 0.15
        }
      },
      {
        selector: 'edge.tracked',
        style: {
          'opacity': 1,
          'width': 4
        }
      }
    ],
    layout: {
      name: 'breadthfirst',
      directed: true,
      spacingFactor: 1.5,
      padding: 50
    },
    userZoomingEnabled: true,
    userPanningEnabled: true,
    boxSelectionEnabled: false
  })
  
  // 클릭 이벤트
  cyExplain.on('tap', 'node', (evt: any) => {
    const node = evt.target
    selectNode(node)
  })
  
  cyExplain.on('tap', 'edge', (evt: any) => {
    const edge = evt.target
    selectEdge(edge)
  })
  
  // 초기 애니메이션 실행
  startAnimation()
}

function generateGraphElements() {
  const causal = props.causalResult
  const scenario = selectedScenario.value
  const result = simulationResult.value
  const timeStep = selectedTimeStep.value
  const timeData = simulationTimeline.value[timeStep]
  
  const nodes: any[] = []
  const edges: any[] = []
  
  // Neo4j에서 가져온 온톨로지 데이터가 있으면 사용
  if (causal?.nodes && causal?.edges) {
    // 입력 변수 (시나리오 파라미터) 찾기
    const inputVars = scenario?.parameters?.map((p: any) => p.id) || ['exchange_rate', 'fx_rate']
    const outputVars = [scenario?.targetVariable || 'sales_revenue', 'final_profit', 'gross_profit']
    
    // 추적 경로 계산 (입력 → 출력 경로)
    const tracked = calculateTrackedPath(causal.edges, inputVars, outputVars)
    trackedPath.value = tracked
    
    // 노드 생성 - Neo4j 데이터 기반
    for (const node of causal.nodes) {
      const isInput = inputVars.some((v: string) => node.id.toLowerCase().includes(v.toLowerCase()))
      const isOutput = outputVars.some((v: string) => node.id.toLowerCase().includes(v.toLowerCase()))
      const isTracked = tracked.includes(node.id)
      
      // 타임스텝 데이터에서 값 가져오기
      const nodeValue = timeData?.values?.[node.id]
      const changeValue = nodeValue?.change || 0
      const changeLabel = changeValue !== 0 ? `${changeValue > 0 ? '+' : ''}${changeValue.toFixed(1)}%` : ''
      
      nodes.push({
        data: {
          id: node.id,
          label: `${node.label || node.id}${changeLabel ? '\n' + changeLabel : ''}`,
          originalLabel: node.label || node.id,
          type: isInput ? 'input' : isOutput ? 'output' : 'intermediate',
          isTracked: isTracked,
          currentValue: nodeValue?.actual || 0,
          simulatedValue: nodeValue?.predicted || 0,
          change: changeValue
        },
        classes: [
          isInput ? 'input' : isOutput ? 'output' : 'intermediate',
          isTracked ? 'tracked' : 'faded'
        ].join(' ')
      })
    }
    
    // 엣지 생성 - Neo4j 데이터 기반
    for (const edge of causal.edges) {
      const isTracked = tracked.includes(`${edge.source}-${edge.target}`)
      const influence = edge.coefficient || edge.influence || 0
      const influenceLabel = `${influence >= 0 ? '+' : ''}${(influence * 100).toFixed(1)}%`
      
      edges.push({
        data: {
          id: `${edge.source}-${edge.target}`,
          source: edge.source,
          target: edge.target,
          influence: influenceLabel,
          coefficient: influence,
          r2: edge.r2 || 0.85,
          formula: edge.formula || `y = ${influence.toFixed(2)}x`,
          isTracked: isTracked
        },
        classes: [
          influence >= 0 ? 'positive' : 'negative',
          isTracked ? 'tracked' : 'faded'
        ].join(' ')
      })
    }
  } else {
    // 기본 예시 데이터 (Neo4j 데이터가 없을 때)
    const defaultNodes = [
      { id: 'exchange_rate', label: 'USD/KRW 환율', type: 'input' },
      { id: 'import_cost', label: '수입 원자재 비용', type: 'intermediate' },
      { id: 'product_cost', label: '제품 원가', type: 'intermediate' },
      { id: 'selling_price', label: '판매 가격', type: 'intermediate' },
      { id: 'sales_revenue', label: '매출액', type: 'output' },
      { id: 'export_comp', label: '수출 경쟁력', type: 'intermediate' },
      { id: 'overseas_sales', label: '해외 매출', type: 'intermediate' }
    ]
    
    const defaultEdges = [
      { source: 'exchange_rate', target: 'import_cost', influence: 0.08 },
      { source: 'import_cost', target: 'product_cost', influence: 0.06 },
      { source: 'product_cost', target: 'selling_price', influence: 0.04 },
      { source: 'selling_price', target: 'sales_revenue', influence: 0.05 },
      { source: 'exchange_rate', target: 'export_comp', influence: 0.05 },
      { source: 'export_comp', target: 'overseas_sales', influence: 0.07 },
      { source: 'overseas_sales', target: 'sales_revenue', influence: 0.03 }
    ]
    
    // 추적 경로 (기본: 메인 경로)
    const mainPath = ['exchange_rate', 'import_cost', 'product_cost', 'selling_price', 'sales_revenue']
    trackedPath.value = mainPath
    
    for (const node of defaultNodes) {
      const isTracked = mainPath.includes(node.id)
      const change = isTracked ? (Math.random() * 10).toFixed(1) : '0'
      
      nodes.push({
        data: {
          id: node.id,
          label: `${node.label}\n${isTracked ? '+' + change + '%' : ''}`,
          originalLabel: node.label,
          type: node.type,
          isTracked,
          currentValue: 100,
          simulatedValue: 100 + parseFloat(change),
          change: parseFloat(change)
        },
        classes: `${node.type} ${isTracked ? 'tracked' : 'faded'}`
      })
    }
    
    for (const edge of defaultEdges) {
      const isTracked = mainPath.includes(edge.source) && mainPath.includes(edge.target)
      nodes.push({
        data: {
          id: `${edge.source}-${edge.target}`,
          source: edge.source,
          target: edge.target,
          influence: `${edge.influence >= 0 ? '+' : ''}${(edge.influence * 100).toFixed(1)}%`,
          coefficient: edge.influence,
          isTracked
        },
        classes: `${edge.influence >= 0 ? 'positive' : 'negative'} ${isTracked ? 'tracked' : 'faded'}`
      })
    }
  }
  
  return [...nodes, ...edges]
}

// 입력에서 출력까지의 경로 계산
function calculateTrackedPath(edges: any[], inputVars: string[], outputVars: string[]): string[] {
  const tracked: string[] = []
  const adjacency: Record<string, string[]> = {}
  
  // 인접 리스트 생성
  for (const edge of edges) {
    if (!adjacency[edge.source]) adjacency[edge.source] = []
    adjacency[edge.source].push(edge.target)
  }
  
  // BFS로 경로 찾기
  function findPath(start: string, goals: string[]): string[] {
    const queue: { node: string; path: string[] }[] = [{ node: start, path: [start] }]
    const visited = new Set<string>()
    
    while (queue.length > 0) {
      const { node, path } = queue.shift()!
      if (visited.has(node)) continue
      visited.add(node)
      
      if (goals.some(g => node.toLowerCase().includes(g.toLowerCase()))) {
        return path
      }
      
      for (const next of (adjacency[node] || [])) {
        queue.push({ node: next, path: [...path, next] })
      }
    }
    return []
  }
  
  // 각 입력에서 출력까지 경로 찾기
  for (const input of inputVars) {
    const matchingNodes = edges.filter(e => 
      e.source.toLowerCase().includes(input.toLowerCase())
    ).map(e => e.source)
    
    for (const startNode of [...new Set(matchingNodes)]) {
      const path = findPath(startNode, outputVars)
      tracked.push(...path)
      // 엣지도 추가
      for (let i = 0; i < path.length - 1; i++) {
        tracked.push(`${path[i]}-${path[i + 1]}`)
      }
    }
  }
  
  return [...new Set(tracked)]
}

async function startAnimation() {
  if (!cyExplain || isAnimating.value) return
  
  isAnimating.value = true
  
  const nodes = cyExplain.nodes()
  const edges = cyExplain.edges()
  
  // 모든 요소 숨기기
  nodes.style('opacity', 0)
  edges.style('opacity', 0)
  
  // BFS 순서로 노드 표시
  const inputNodes = nodes.filter('[type = "input"]')
  const intermediateNodes = nodes.filter('[type = "intermediate"]')
  const outputNodes = nodes.filter('[type = "output"]')
  
  // 입력 노드 먼저 표시
  for (let i = 0; i < inputNodes.length; i++) {
    await animateElement(inputNodes[i], 300)
  }
  
  // 엣지와 중간 노드를 순차적으로
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i]
    await animateEdge(edge, 400)
    
    // 타겟 노드 표시
    const targetId = edge.data('target')
    const targetNode = cyExplain.$id(targetId)
    if (targetNode.length && targetNode.style('opacity') === '0') {
      await animateElement(targetNode, 300)
    }
  }
  
  isAnimating.value = false
}

function animateElement(ele: any, duration: number): Promise<void> {
  return new Promise(resolve => {
    ele.animate({
      style: { opacity: 1 },
      duration: duration,
      easing: 'ease-out-cubic'
    })
    setTimeout(resolve, duration + 50)
  })
}

function animateEdge(edge: any, duration: number): Promise<void> {
  return new Promise(resolve => {
    edge.addClass('animated')
    edge.animate({
      style: { opacity: 1 },
      duration: duration,
      easing: 'ease-out-cubic'
    })
    setTimeout(() => {
      edge.removeClass('animated')
      resolve()
    }, duration + 50)
  })
}

function selectNode(node: any) {
  cyExplain.nodes().removeClass('highlighted')
  node.addClass('highlighted')
  
  const data = node.data()
  selectedElement.value = {
    type: 'node',
    icon: data.type === 'input' ? '📥' : data.type === 'output' ? '📤' : '⚙️',
    title: data.type === 'input' ? '입력 변수' : data.type === 'output' ? '출력 변수' : '중간 변수',
    name: data.label?.split('\n')[0] || data.id,
    currentValue: data.currentValue || '기준값',
    simulatedValue: data.simulatedValue || '시뮬레이션값',
    change: data.label?.split('\n')[1] || '+0%',
    changeClass: (data.simulatedValue || 0) >= 0 ? 'positive' : 'negative'
  }
}

function selectEdge(edge: any) {
  cyExplain.edges().removeClass('highlighted')
  edge.addClass('highlighted')
  
  const data = edge.data()
  const sourceNode = cyExplain.$id(data.source)
  const targetNode = cyExplain.$id(data.target)
  
  selectedElement.value = {
    type: 'edge',
    icon: '🔗',
    title: '인과관계',
    source: sourceNode.data('label')?.split('\n')[0] || data.source,
    target: targetNode.data('label')?.split('\n')[0] || data.target,
    influence: data.influence || '+0%',
    r2: (Math.random() * 0.3 + 0.7).toFixed(3),
    formula: `y = ${(Math.random() * 0.5 + 0.5).toFixed(2)}x + ${(Math.random() * 10).toFixed(1)}`
  }
  
  // 미니 차트 업데이트
  nextTick(() => {
    updateMiniChart()
  })
}

function updateMiniChart() {
  if (!miniChartCanvas.value) return
  
  if (miniChart) {
    miniChart.destroy()
  }
  
  const labels = ['t-5', 't-4', 't-3', 't-2', 't-1', 't', 't+1', 't+2']
  const actual = [100, 102, 105, 103, 108, 110, null, null]
  const predicted = [null, null, null, null, null, 110, 115, 118]
  
  miniChart = new Chart(miniChartCanvas.value, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: '실측값',
          data: actual,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          tension: 0.3,
          fill: true
        },
        {
          label: '예측값',
          data: predicted,
          borderColor: '#10b981',
          borderDash: [5, 5],
          tension: 0.3,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: { color: '#9ca3af', font: { size: 10 } }
        }
      },
      scales: {
        x: { ticks: { color: '#6b7280', font: { size: 9 } }, grid: { color: 'rgba(75, 85, 99, 0.3)' } },
        y: { ticks: { color: '#6b7280', font: { size: 9 } }, grid: { color: 'rgba(75, 85, 99, 0.3)' } }
      }
    }
  })
}

// 모달 cleanup
onUnmounted(() => {
  closeExplainabilityModal()
})

function renderMarkdown(text: string): string {
  if (!text) return ''
  
  // 줄 단위로 처리
  const lines = text.split('\n')
  let inList = false
  let html = ''
  
  for (let line of lines) {
    // 헤더 처리
    if (line.startsWith('### ')) {
      if (inList) { html += '</ul>'; inList = false }
      html += `<h3 class="md-h3">${line.slice(4)}</h3>`
    } else if (line.startsWith('## ')) {
      if (inList) { html += '</ul>'; inList = false }
      html += `<h2 class="md-h2">${line.slice(3)}</h2>`
    } else if (line.startsWith('# ')) {
      if (inList) { html += '</ul>'; inList = false }
      html += `<h1 class="md-h1">${line.slice(2)}</h1>`
    }
    // 리스트 처리
    else if (line.startsWith('- ')) {
      if (!inList) { html += '<ul class="md-list">'; inList = true }
      const content = line.slice(2)
        .replace(/\*\*(.*?)\*\*/g, '<strong class="md-bold">$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code class="md-code">$1</code>')
      html += `<li>${content}</li>`
    }
    // 빈 줄
    else if (line.trim() === '') {
      if (inList) { html += '</ul>'; inList = false }
      html += '<div class="md-spacer"></div>'
    }
    // 일반 텍스트
    else {
      if (inList) { html += '</ul>'; inList = false }
      const content = line
        .replace(/\*\*(.*?)\*\*/g, '<strong class="md-bold">$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code class="md-code">$1</code>')
      html += `<p class="md-paragraph">${content}</p>`
    }
  }
  
  if (inList) html += '</ul>'
  return html
}

function copyToClipboard() {
  if (props.explanation?.explanation) {
    navigator.clipboard.writeText(props.explanation.explanation)
  }
}

function downloadAsMd() {
  if (!props.explanation) return
  const blob = new Blob([props.explanation.explanation], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `whatif-report-${Date.now()}.md`
  a.click()
}

// ===== A/B 테스트 프로필 관리 =====
function getProfileLabel(idx: number): string {
  const labels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
  return labels[idx] || `#${idx + 1}`
}

function saveAsProfile() {
  if (!selectedScenario.value || !simulationResult.value) return
  
  const forecasts = simulationResult.value.forecasts
  const firstVal = forecasts[0]?.ontology || 0
  const lastVal = forecasts[forecasts.length - 1]?.ontology || 0
  const totalChange = ((lastVal - firstVal) / firstVal) * 100
  
  const profile: SimulationProfile = {
    id: `profile_${Date.now()}`,
    scenarioId: selectedScenario.value.id,
    scenarioName: selectedScenario.value.name,
    params: { ...scenarioValues.value },
    targetVariable: selectedScenario.value.targetVariable,
    targetUnit: selectedScenario.value.targetUnit,
    forecasts: forecasts,
    finalValue: lastVal,
    totalChange: totalChange,
    createdAt: new Date().toISOString()
  }
  
  savedProfiles.value.push(profile)
  
  // 자동으로 비교에 포함
  if (savedProfiles.value.length <= 3) {
    selectedProfiles.value.push(profile.id)
  }
  
  // localStorage에 저장
  saveProfilesToStorage()
  
  // 비교 차트 업데이트
  if (selectedProfiles.value.length > 1) {
    nextTick(() => createComparisonChart())
  }
}

function deleteProfile(profileId: string) {
  savedProfiles.value = savedProfiles.value.filter(p => p.id !== profileId)
  selectedProfiles.value = selectedProfiles.value.filter(id => id !== profileId)
  saveProfilesToStorage()
  
  if (selectedProfiles.value.length > 1) {
    nextTick(() => createComparisonChart())
  }
}

function toggleProfileSelection(profileId: string) {
  const idx = selectedProfiles.value.indexOf(profileId)
  if (idx >= 0) {
    selectedProfiles.value.splice(idx, 1)
  } else {
    selectedProfiles.value.push(profileId)
  }
  
  if (selectedProfiles.value.length > 1) {
    nextTick(() => createComparisonChart())
  }
}

function getSelectedProfileData(): SimulationProfile[] {
  return savedProfiles.value.filter(p => selectedProfiles.value.includes(p.id))
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleString('ko-KR', { 
    month: 'short', 
    day: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit' 
  })
}

function saveProfilesToStorage() {
  try {
    localStorage.setItem('whatif_profiles', JSON.stringify(savedProfiles.value))
  } catch (e) {
    console.error('프로필 저장 실패:', e)
  }
}

function loadProfilesFromStorage() {
  try {
    const data = localStorage.getItem('whatif_profiles')
    if (data) {
      savedProfiles.value = JSON.parse(data)
    }
  } catch (e) {
    console.error('프로필 로드 실패:', e)
  }
}

function createComparisonChart() {
  if (!comparisonChartRef.value || selectedProfiles.value.length < 2) return
  
  if (comparisonChart) {
    comparisonChart.destroy()
  }
  
  const selectedData = getSelectedProfileData()
  const firstProfile = selectedData[0]
  if (!firstProfile) return
  
  const labels = firstProfile.forecasts.map(f => f.date)
  
  const datasets = selectedData.map((profile, idx) => {
    const colorIdx = savedProfiles.value.findIndex(p => p.id === profile.id) % profileColors.length
    return {
      label: `${getProfileLabel(savedProfiles.value.findIndex(p => p.id === profile.id))} - ${profile.scenarioName}`,
      data: profile.forecasts.map(f => f.ontology),
      borderColor: profileColors[colorIdx],
      backgroundColor: `${profileColors[colorIdx]}20`,
      borderWidth: 3,
      pointRadius: 5,
      fill: false,
      tension: 0.3
    }
  })
  
  comparisonChart = new Chart(comparisonChartRef.value, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: { color: '#94a3b8', font: { size: 12, weight: 'bold' } }
        },
        title: {
          display: true,
          text: 'A/B 테스트 시나리오 비교',
          color: '#fff',
          font: { size: 16, weight: 'bold' }
        }
      },
      scales: {
        x: {
          ticks: { color: '#94a3b8' },
          grid: { color: 'rgba(255,255,255,0.05)' }
        },
        y: {
          ticks: { color: '#94a3b8' },
          grid: { color: 'rgba(255,255,255,0.1)' }
        }
      }
    }
  })
}

// 초기화
onMounted(() => {
  // 첫 번째 시나리오 자동 선택
  if (recommendedScenarios.length > 0) {
    selectScenario(recommendedScenarios[0])
  }
  
  // 저장된 프로필 로드
  loadProfilesFromStorage()
})

// 결과 변경 시 차트 업데이트
watch(() => simulationResult.value, async () => {
  if (simulationResult.value) {
    await nextTick()
    createForecastChart()
  }
})
</script>

<style scoped>
.data-literacy {
  padding: 1.5rem;
}

.section-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: 0.5rem;
}

.section-desc {
  color: var(--color-text-secondary);
  margin-bottom: 1.5rem;
}

.subsection-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 1.5rem 0 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.target-variable {
  color: #10b981;
  font-weight: 700;
}

.target-unit {
  color: var(--color-text-secondary);
  font-weight: 400;
  font-size: 0.9rem;
}

/* 시나리오 카드 */
.recommended-scenarios {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.scenario-card {
  background: var(--color-bg-tertiary);
  border: 2px solid var(--color-border);
  border-radius: 12px;
  padding: 1.25rem;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  gap: 1rem;
  align-items: flex-start;
}

.scenario-card:hover {
  border-color: var(--color-primary);
  transform: translateY(-2px);
}

.scenario-card.active {
  border-color: #00d9ff;
  background: linear-gradient(135deg, rgba(0, 217, 255, 0.1) 0%, transparent 100%);
  box-shadow: 0 0 20px rgba(0, 217, 255, 0.2);
}

.scenario-icon {
  font-size: 2rem;
}

.scenario-info h5 {
  margin: 0 0 0.25rem;
  font-weight: 600;
  color: var(--color-text-primary);
}

.scenario-info p {
  margin: 0;
  font-size: 0.85rem;
  color: var(--color-text-secondary);
}

.scenario-badge {
  margin-left: auto;
  padding: 0.25rem 0.75rem;
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
}

/* 시나리오 입력 */
.scenario-inputs {
  background: var(--color-bg-tertiary);
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}

.input-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.25rem;
}

.input-title {
  font-weight: 600;
  color: var(--color-text-primary);
}

.reset-btn {
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  padding: 0.5rem 1rem;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.85rem;
}

.reset-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.input-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.25rem;
}

.input-item {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.input-item label {
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.input-with-unit {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.param-input {
  flex: 1;
  padding: 0.75rem;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text-primary);
  font-size: 1rem;
}

.param-input:focus {
  outline: none;
  border-color: #00d9ff;
}

.date-input {
  width: 100%;
}

.unit {
  font-size: 0.85rem;
  color: var(--color-text-secondary);
  min-width: 40px;
}

.param-range {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.simulation-actions {
  margin-top: 1.5rem;
  display: flex;
  justify-content: center;
}

.simulate-btn {
  padding: 1rem 2rem;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 1.1rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  transition: all 0.3s ease;
}

.simulate-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(16, 185, 129, 0.4);
}

.simulate-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.add-profile-btn {
  padding: 1rem 1.5rem;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.add-profile-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(99, 102, 241, 0.4);
}

.add-profile-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* A/B 테스트 프로필 섹션 */
.profiles-section {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(139, 92, 246, 0.05) 100%);
  border: 1px solid rgba(99, 102, 241, 0.3);
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}

.profiles-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.profile-card {
  background: var(--color-bg-secondary);
  border: 2px solid var(--color-border);
  border-radius: 10px;
  padding: 1rem;
  position: relative;
  transition: all 0.2s ease;
}

.profile-card:hover {
  transform: translateY(-2px);
}

.profile-card.selected {
  box-shadow: 0 0 15px rgba(99, 102, 241, 0.3);
}

.profile-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.profile-label {
  font-size: 0.8rem;
  font-weight: 700;
  color: white;
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
}

.delete-profile-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 0.9rem;
  opacity: 0.5;
  transition: opacity 0.2s;
}

.delete-profile-btn:hover {
  opacity: 1;
}

.profile-name {
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 0.5rem;
}

.profile-params {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-bottom: 0.5rem;
}

.param-tag {
  font-size: 0.7rem;
  padding: 0.2rem 0.5rem;
  background: var(--color-bg-tertiary);
  border-radius: 4px;
  color: var(--color-text-secondary);
}

.profile-meta {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: var(--color-text-muted);
  margin-bottom: 0.75rem;
}

.profile-result {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  background: var(--color-bg-tertiary);
  border-radius: 6px;
  margin-bottom: 0.75rem;
}

.result-label {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.result-value {
  font-weight: 600;
  color: var(--color-text-primary);
}

.result-change {
  font-size: 0.8rem;
  font-weight: 600;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
}

.result-change.positive {
  background: rgba(16, 185, 129, 0.2);
  color: #10b981;
}

.result-change.negative {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

.profile-checkbox {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  color: var(--color-text-secondary);
  cursor: pointer;
}

.profile-checkbox input {
  accent-color: #6366f1;
}

/* 비교 차트 */
.comparison-chart-section {
  background: var(--color-bg-secondary);
  border-radius: 10px;
  padding: 1.5rem;
}

.comparison-chart-section h5 {
  margin-bottom: 1rem;
  color: var(--color-text-primary);
}

.comparison-chart-container {
  height: 350px;
  margin-bottom: 1.5rem;
}

/* 비교 요약 테이블 */
.comparison-summary table {
  width: 100%;
  border-collapse: collapse;
}

.comparison-summary th,
.comparison-summary td {
  padding: 0.75rem 1rem;
  text-align: left;
  border-bottom: 1px solid var(--color-border);
}

.comparison-summary th {
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  font-weight: 600;
  font-size: 0.85rem;
}

.comparison-summary td {
  color: var(--color-text-primary);
  font-size: 0.9rem;
}

.profile-label-cell span {
  display: inline-block;
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
  font-weight: 600;
  font-size: 0.8rem;
  color: white;
}

.comparison-summary .value-cell {
  font-weight: 600;
}

.comparison-summary .positive {
  color: #10b981;
}

.comparison-summary .negative {
  color: #f87171;
}

/* 결과 섹션 */
.results-section {
  background: var(--color-bg-tertiary);
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}

.scenario-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 2rem;
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: var(--color-bg-secondary);
  border-radius: 8px;
}

.summary-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.summary-label {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
}

.summary-value {
  font-weight: 600;
  color: var(--color-text-primary);
}

.summary-value.highlight {
  color: #00d9ff;
}

.forecast-chart-container {
  height: 350px;
  margin-bottom: 1.5rem;
}

/* 테이블 */
.model-forecast-table {
  overflow-x: auto;
  margin-bottom: 1.5rem;
}

.model-forecast-table h5 {
  margin-bottom: 1rem;
  color: var(--color-text-primary);
}

.model-forecast-table table {
  width: 100%;
  border-collapse: collapse;
}

.model-forecast-table th,
.model-forecast-table td {
  padding: 0.75rem 1rem;
  text-align: right;
  border-bottom: 1px solid var(--color-border);
}

.model-forecast-table th {
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
  font-weight: 600;
  font-size: 0.85rem;
}

.model-forecast-table td {
  color: var(--color-text-primary);
}

.date-cell {
  text-align: left !important;
  font-weight: 500;
}

.change-badge {
  margin-left: 0.5rem;
  font-size: 0.75rem;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
}

.change-badge.positive {
  background: rgba(16, 185, 129, 0.2);
  color: #10b981;
}

.change-badge.negative {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

.change-badge.neutral {
  background: rgba(148, 163, 184, 0.2);
  color: #94a3b8;
}

/* 인사이트 */
.insights-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}

.insight-card {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  background: var(--color-bg-secondary);
  border-radius: 10px;
  border-left: 4px solid var(--color-border);
}

.insight-card.positive {
  border-left-color: #10b981;
}

.insight-card.negative {
  border-left-color: #ef4444;
}

.insight-card.warning {
  border-left-color: #f59e0b;
}

.insight-icon {
  font-size: 1.5rem;
}

.insight-title {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
}

.insight-value {
  font-weight: 600;
  color: var(--color-text-primary);
}

/* AI 리터러시 */
.literacy-section {
  background: var(--color-bg-tertiary);
  border-radius: 12px;
  padding: 1.5rem;
}

.report-types {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}

.report-type-btn {
  padding: 0.75rem 1.25rem;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  transition: all 0.2s ease;
}

.report-type-btn:hover {
  border-color: var(--color-primary);
}

.report-type-btn.active {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(139, 92, 246, 0.2) 100%);
  border-color: #8b5cf6;
  color: #a78bfa;
}

.action-area {
  display: flex;
  gap: 1rem;
  align-items: center;
  margin-bottom: 1.5rem;
}

.generate-btn {
  padding: 0.75rem 1.5rem;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  color: white;
  border: none;
  border-radius: 10px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  transition: all 0.3s ease;
}

.generate-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(99, 102, 241, 0.4);
}

.language-toggle {
  display: flex;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
}

.language-toggle button {
  padding: 0.5rem 1rem;
  background: transparent;
  border: none;
  color: var(--color-text-secondary);
  cursor: pointer;
}

.language-toggle button.active {
  background: var(--color-primary);
  color: white;
}

.explanation-result {
  background: var(--color-bg-secondary);
  border-radius: 10px;
  padding: 1.5rem;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--color-border);
}

.result-title {
  margin: 0;
  font-size: 1.1rem;
  color: var(--color-text-primary);
}

.result-actions {
  display: flex;
  gap: 0.5rem;
}

.action-btn {
  padding: 0.5rem 1rem;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: 0.85rem;
}

.action-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.explanation-content {
  color: var(--color-text-primary);
  line-height: 1.7;
}

/* 마크다운 스타일 */
.explanation-content :deep(.md-h1) {
  font-size: 1.5rem;
  font-weight: 700;
  color: #fff;
  margin: 1.5rem 0 1rem;
  border-bottom: 2px solid var(--color-border);
  padding-bottom: 0.5rem;
}

.explanation-content :deep(.md-h2) {
  font-size: 1.25rem;
  font-weight: 600;
  color: #00d9ff;
  margin: 1.25rem 0 0.75rem;
}

.explanation-content :deep(.md-h3) {
  font-size: 1.1rem;
  font-weight: 600;
  color: #10b981;
  margin: 1rem 0 0.5rem;
}

.explanation-content :deep(.md-paragraph) {
  margin: 0.5rem 0;
  line-height: 1.8;
}

.explanation-content :deep(.md-list) {
  margin: 0.5rem 0;
  padding-left: 1.5rem;
}

.explanation-content :deep(.md-list li) {
  margin: 0.4rem 0;
  line-height: 1.7;
}

.explanation-content :deep(.md-bold) {
  color: #f59e0b;
  font-weight: 600;
}

.explanation-content :deep(.md-code) {
  background: rgba(0, 217, 255, 0.1);
  color: #00d9ff;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  font-family: monospace;
}

.explanation-content :deep(.md-spacer) {
  height: 0.75rem;
}

/* 인과 경로 스타일 */
.causal-explanation {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, rgba(0, 217, 255, 0.05) 100%);
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}

.causal-explanation h5 {
  color: #10b981;
  margin-bottom: 1rem;
}

.causal-intro {
  color: var(--color-text-secondary);
  margin-bottom: 1.5rem;
  font-size: 0.95rem;
}

.target-highlight {
  color: #10b981;
}

.causal-path-flow {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  margin-bottom: 1.5rem;
}

.causal-path {
  background: var(--color-bg-secondary);
  border-radius: 10px;
  padding: 1.25rem;
  border-left: 4px solid #00d9ff;
}

.path-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.path-number {
  font-weight: 600;
  color: var(--color-text-primary);
}

.path-strength {
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
}

.path-strength.high {
  background: rgba(16, 185, 129, 0.2);
  color: #10b981;
}

.path-strength.medium {
  background: rgba(245, 158, 11, 0.2);
  color: #f59e0b;
}

.path-nodes {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.path-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.75rem 1rem;
  background: var(--color-bg-tertiary);
  border-radius: 8px;
  min-width: 100px;
  border: 1px solid var(--color-border);
}

.path-node.start {
  border-color: #f59e0b;
  background: rgba(245, 158, 11, 0.1);
}

.path-node.end {
  border-color: #10b981;
  background: rgba(16, 185, 129, 0.1);
}

.node-icon {
  font-size: 1.5rem;
  margin-bottom: 0.25rem;
}

.node-name {
  font-size: 0.8rem;
  color: var(--color-text-primary);
  font-weight: 500;
  text-align: center;
}

.node-change {
  font-size: 0.7rem;
  margin-top: 0.25rem;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
}

.node-change.up {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

.node-change.down {
  background: rgba(16, 185, 129, 0.2);
  color: #10b981;
}

.node-change.neutral {
  background: rgba(148, 163, 184, 0.2);
  color: #94a3b8;
}

.path-arrow {
  display: flex;
  flex-direction: column;
  align-items: center;
  color: #00d9ff;
  font-size: 1.25rem;
}

.arrow-label {
  font-size: 0.65rem;
  color: var(--color-text-muted);
}

.path-explanation {
  font-size: 0.9rem;
  color: var(--color-text-secondary);
  line-height: 1.6;
  padding: 0.75rem;
  background: rgba(0, 217, 255, 0.05);
  border-radius: 6px;
}

/* 종합 영향 분석 */
.impact-summary {
  background: var(--color-bg-secondary);
  border-radius: 10px;
  padding: 1.25rem;
}

.impact-header {
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 1rem;
  font-size: 1rem;
}

.impact-content :deep(.analysis-block) {
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--color-border);
}

.impact-content :deep(.analysis-block:last-child) {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.impact-content :deep(.analysis-title) {
  font-weight: 600;
  color: #00d9ff;
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
}

.impact-content :deep(.analysis-text) {
  color: var(--color-text-primary);
  line-height: 1.7;
  font-size: 0.95rem;
}

.impact-content :deep(.highlight-change) {
  font-weight: 700;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  background: rgba(245, 158, 11, 0.2);
  color: #f59e0b;
}

.impact-content :deep(.highlight-change.positive) {
  background: rgba(16, 185, 129, 0.2);
  color: #10b981;
}

.impact-content :deep(.highlight-change.negative) {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

.impact-content :deep(.highlight-value) {
  font-weight: 700;
  color: #00d9ff;
}

/* 스피너 */
.spinner {
  width: 20px;
  height: 20px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  100% { transform: rotate(360deg); }
}

/* ========== Explainability 모달 ========== */
.explanation-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.explanation-header h5 {
  margin: 0;
}

.expand-btn {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 1rem;
  background: linear-gradient(135deg, #3b82f6, #8b5cf6);
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.expand-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 15px rgba(59, 130, 246, 0.4);
}

.expand-btn svg {
  width: 16px;
  height: 16px;
}

/* 모달 오버레이 */
.explainability-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-backdrop {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(8px);
}

.modal-container {
  position: relative;
  width: 95vw;
  height: 90vh;
  background: #111827;
  border-radius: 16px;
  border: 1px solid #374151;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  background: #1f2937;
  border-bottom: 1px solid #374151;
}

.modal-header h3 {
  margin: 0;
  font-size: 1.2rem;
  color: #fff;
}

.modal-controls {
  display: flex;
  gap: 0.75rem;
}

.play-btn {
  padding: 0.5rem 1rem;
  background: linear-gradient(135deg, #10b981, #059669);
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.play-btn:hover:not(:disabled) {
  transform: scale(1.05);
}

.play-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.close-btn {
  width: 36px;
  height: 36px;
  background: #374151;
  border: none;
  border-radius: 8px;
  color: #9ca3af;
  font-size: 1.2rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.close-btn:hover {
  background: #4b5563;
  color: #fff;
}

/* 모달 바디 */
.modal-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.graph-container {
  flex: 1;
  background: #0d1117;
  border-right: 1px solid #374151;
}

/* 정보 패널 */
.info-panel {
  width: 300px;
  background: #1f2937;
  padding: 1.5rem;
  overflow-y: auto;
  transition: all 0.3s ease;
}

.element-info {
  animation: slideIn 0.3s ease;
}

@keyframes slideIn {
  from { opacity: 0; transform: translateX(20px); }
  to { opacity: 1; transform: translateX(0); }
}

.info-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #374151;
}

.info-icon {
  font-size: 1.5rem;
}

.info-title {
  font-size: 1rem;
  font-weight: 600;
  color: #fff;
}

.node-details,
.edge-details {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.detail-row .label {
  font-size: 0.85rem;
  color: #9ca3af;
}

.detail-row .value {
  font-size: 0.9rem;
  font-weight: 500;
  color: #fff;
}

.detail-row .value.highlight {
  color: #00d9ff;
}

.detail-row .value.positive {
  color: #10b981;
}

.detail-row .value.negative {
  color: #ef4444;
}

.detail-row .value.formula {
  font-family: 'Monaco', monospace;
  font-size: 0.8rem;
  background: #111827;
  padding: 0.3rem 0.5rem;
  border-radius: 4px;
}

.connection-flow {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 1rem;
  background: #111827;
  border-radius: 8px;
  margin-bottom: 1rem;
}

.connection-flow .source,
.connection-flow .target {
  padding: 0.4rem 0.8rem;
  background: #374151;
  border-radius: 6px;
  font-size: 0.85rem;
  color: #fff;
}

.connection-flow .arrow {
  font-size: 1.2rem;
  color: #10b981;
}

.mini-chart {
  margin-top: 1.5rem;
  height: 150px;
  padding: 0.5rem;
  background: #111827;
  border-radius: 8px;
}

.no-selection {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  text-align: center;
  color: #6b7280;
  font-size: 0.9rem;
  line-height: 1.6;
}

/* 범례 */
.modal-legend {
  display: flex;
  justify-content: center;
  gap: 2rem;
  padding: 1rem;
  background: #1f2937;
  border-top: 1px solid #374151;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
  color: #9ca3af;
}

.legend-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.legend-dot.input {
  background: #f59e0b;
}

.legend-dot.intermediate {
  background: #3b82f6;
}

.legend-dot.output {
  background: #10b981;
}

.legend-line {
  width: 24px;
  height: 3px;
  border-radius: 2px;
}

.legend-line.positive {
  background: #10b981;
}

.legend-line.negative {
  background: #ef4444;
}

/* ========== 타임라인 패널 ========== */
.timeline-panel {
  width: 280px;
  background: #1f2937;
  border-right: 1px solid #374151;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.timeline-header {
  padding: 1rem;
  border-bottom: 1px solid #374151;
}

.timeline-header h4 {
  margin: 0;
  font-size: 0.95rem;
  color: #fff;
}

.timeline-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
}

.timeline-item {
  display: flex;
  gap: 0.75rem;
  padding: 0.75rem;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-bottom: 0.25rem;
}

.timeline-item:hover {
  background: #374151;
}

.timeline-item.active {
  background: rgba(59, 130, 246, 0.2);
  border: 1px solid #3b82f6;
}

.timeline-item.future {
  border-left: 3px solid #fbbf24;
}

.timeline-item.future.active {
  border: 1px solid #fbbf24;
  background: rgba(251, 191, 36, 0.1);
}

.timeline-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #4b5563;
  margin-top: 4px;
  flex-shrink: 0;
}

.timeline-item.active .timeline-dot {
  background: #3b82f6;
}

.timeline-item.future .timeline-dot {
  background: #fbbf24;
}

.timeline-dot.pulse {
  animation: dotPulse 2s infinite;
}

@keyframes dotPulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.3); opacity: 0.7; }
}

.timeline-content {
  flex: 1;
  min-width: 0;
}

.timeline-date {
  display: block;
  font-size: 0.85rem;
  font-weight: 600;
  color: #fff;
  margin-bottom: 0.15rem;
}

.timeline-label {
  display: block;
  font-size: 0.75rem;
  color: #9ca3af;
  margin-bottom: 0.5rem;
}

.timeline-values {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.timeline-value {
  font-size: 0.7rem;
  padding: 0.2rem 0.4rem;
  background: #111827;
  border-radius: 4px;
  color: #9ca3af;
}

.timeline-value strong {
  margin-left: 0.25rem;
}

.timeline-value strong.positive {
  color: #10b981;
}

.timeline-value strong.negative {
  color: #ef4444;
}

/* 그래프 컨테이너 조정 */
.modal-body .graph-container {
  flex: 1;
}
</style>
