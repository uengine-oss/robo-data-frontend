<template>
  <div class="causal-discovery">
    <h3 class="section-title">🔬 온톨로지 발견 (Ontology Discovery)</h3>
    
    <!-- 설정 옵션 -->
    <div class="discovery-options">
      <div class="option-group">
        <label>분석 방법</label>
        <div class="checkbox-group">
          <label class="checkbox-item">
            <input type="checkbox" v-model="methods" value="correlation" />
            <span>Correlation</span>
          </label>
          <label class="checkbox-item">
            <input type="checkbox" v-model="methods" value="granger" />
            <span>Granger Causality</span>
          </label>
          <label class="checkbox-item">
            <input type="checkbox" v-model="methods" value="partial" />
            <span>Partial Correlation</span>
          </label>
        </div>
      </div>
      
      <div class="option-group">
        <label>최대 시차 (Lag)</label>
        <input type="number" v-model="maxLag" min="1" max="10" class="lag-input" />
      </div>
      
      <button 
        class="run-btn"
        :disabled="loading || methods.length === 0"
        @click="$emit('run-discovery', methods, maxLag)"
      >
        <svg v-if="loading" class="spinner" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="30 70"/>
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 9l-7 7-7-7"/>
        </svg>
        {{ loading ? '분석 중...' : '온톨로지 발견 실행' }}
      </button>
    </div>
    
    <!-- 결과 표시 -->
    <div v-if="causalResult" class="results">
      <!-- 요약 -->
      <div class="summary-cards">
        <div class="summary-card">
          <div class="card-value">{{ causalResult.edges_count }}</div>
          <div class="card-label">발견된 엣지</div>
        </div>
        <div class="summary-card positive">
          <div class="card-value">{{ causalResult.summary.positive_count }}</div>
          <div class="card-label">정(+) 관계</div>
        </div>
        <div class="summary-card negative">
          <div class="card-value">{{ causalResult.summary.negative_count }}</div>
          <div class="card-label">부(-) 관계</div>
        </div>
        <div class="summary-card">
          <div class="card-value">{{ causalResult.summary.strong_edges }}</div>
          <div class="card-label">강한 관계 (>0.5)</div>
        </div>
      </div>
      
      <!-- Neo4j 저장 버튼 -->
      <div class="neo4j-actions">
        <button 
          class="save-neo4j-btn"
          :disabled="savingToNeo4j"
          @click="saveToNeo4j"
        >
          <svg v-if="savingToNeo4j" class="spinner" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="30 70"/>
          </svg>
          <span v-else>🗄️</span>
          {{ savingToNeo4j ? 'Neo4j 저장 중...' : 'Neo4j에 온톨로지 저장' }}
        </button>
        <span v-if="neo4jSaved" class="saved-badge">✅ 저장됨</span>
      </div>
      
      <!-- Cytoscape 온톨로지 그래프 -->
      <div class="causal-graph-visual">
        <div class="graph-header">
          <h4 class="subsection-title">🔗 온톨로지 네트워크 시각화</h4>
          <button class="edit-btn" @click="openEditor">
            ✏️ 편집
          </button>
        </div>
        <div class="graph-controls">
          <button class="control-btn" @click="fitGraph">🔍 전체 보기</button>
          <button class="control-btn" @click="toggleLayout">🔄 레이아웃 변경</button>
          <select v-model="selectedLayout" class="layout-select">
            <option value="cose">Cose (물리 기반)</option>
            <option value="dagre">Dagre (계층형)</option>
            <option value="circle">Circle (원형)</option>
            <option value="grid">Grid (격자)</option>
          </select>
        </div>
        <div ref="cytoscapeContainer" class="cytoscape-container"></div>
      </div>
      
      <!-- 온톨로지 리스트 (접이식) -->
      <div class="causal-graph">
        <h4 class="subsection-title" @click="showEdgeList = !showEdgeList" style="cursor: pointer;">
          📊 발견된 온톨로지 관계 {{ showEdgeList ? '▼' : '▶' }}
        </h4>
        <div v-show="showEdgeList" class="edge-list">
          <div 
            v-for="edge in causalResult.edges" 
            :key="`${edge.source}_${edge.target}`"
            class="edge-item"
            :class="{ positive: edge.direction === 'positive', negative: edge.direction === 'negative' }"
          >
            <div class="edge-main">
              <span class="source">{{ edge.source }}</span>
              <span class="arrow" :class="edge.direction">
                {{ edge.direction === 'positive' ? '→ (+)' : '→ (-)' }}
              </span>
              <span class="target">{{ edge.target }}</span>
            </div>
            <div class="edge-details">
              <span class="strength">
                강도: {{ (edge.strength * 100).toFixed(1) }}%
              </span>
              <span class="method">{{ edge.method }}</span>
              <span v-if="edge.lag && edge.lag > 0" class="lag">Lag: {{ edge.lag }}</span>
              <span v-if="edge.r_squared" class="r2">R²: {{ (edge.r_squared * 100).toFixed(1) }}%</span>
            </div>
            <div v-if="edge.formula" class="formula">
              <code>{{ edge.formula }}</code>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 핵심 원인/결과 -->
      <div class="key-variables">
        <div class="variable-section">
          <h4 class="subsection-title">🎯 핵심 원인 변수</h4>
          <div class="variable-list">
            <div 
              v-for="[name, count] in causalResult.summary.root_causes" 
              :key="name"
              class="variable-item cause"
            >
              <span class="name">{{ name }}</span>
              <span class="count">{{ count }}개 영향</span>
            </div>
          </div>
        </div>
        
        <div class="variable-section">
          <h4 class="subsection-title">📈 핵심 결과 변수</h4>
          <div class="variable-list">
            <div 
              v-for="[name, count] in causalResult.summary.final_effects" 
              :key="name"
              class="variable-item effect"
            >
              <span class="name">{{ name }}</span>
              <span class="count">{{ count }}개 영향 받음</span>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 영향 함수 -->
      <div v-if="causalResult.influence_functions.length > 0" class="influence-functions">
        <h4 class="subsection-title">📐 추정된 영향 함수</h4>
        <div class="function-table">
          <table>
            <thead>
              <tr>
                <th>관계</th>
                <th>함수</th>
                <th>R²</th>
                <th>p-value</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="func in causalResult.influence_functions" :key="`${func.source}_${func.target}`">
                <td class="relation">{{ func.source }} → {{ func.target }}</td>
                <td class="formula"><code>{{ func.formula }}</code></td>
                <td class="r2" :class="getR2Class(func.r_squared)">
                  {{ (func.r_squared * 100).toFixed(1) }}%
                </td>
                <td class="pvalue">{{ func.p_value.toExponential(2) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
    
    <!-- 전체 화면 온톨로지 편집기 -->
    <div v-if="isEditorOpen" class="editor-overlay">
      <div class="editor-fullscreen">
        <!-- 헤더 -->
        <div class="editor-header">
          <div class="header-left">
            <h2>🔧 온톨로지 편집기</h2>
            <input type="text" v-model="editingOntology.name" class="ontology-name-input" placeholder="온톨로지 이름" />
          </div>
          <div class="header-right">
            <button class="action-btn test" @click="showTestPanel = !showTestPanel">
              🧪 {{ showTestPanel ? '테스트 닫기' : '시뮬레이션 테스트' }}
            </button>
            <button class="action-btn save" @click="saveOntology" :disabled="saving">
              {{ saving ? '저장 중...' : '💾 저장' }}
            </button>
            <button class="action-btn close" @click="closeEditor">✕</button>
          </div>
        </div>
        
        <div class="editor-main">
          <!-- 왼쪽: Cytoscape 그래프 -->
          <div class="editor-graph-panel">
            <div class="graph-toolbar">
              <button class="tool-btn" @click="editorFitGraph">🔍 맞춤</button>
              <button class="tool-btn" @click="editorToggleLayout">🔄 레이아웃</button>
              <button class="tool-btn add" @click="startAddNode">➕ 노드 추가</button>
              <button class="tool-btn add" @click="startAddEdge">🔗 엣지 추가</button>
              <button class="tool-btn delete" v-if="selectedElement" @click="deleteSelected">🗑️ 삭제</button>
            </div>
            <div ref="editorCytoscapeContainer" class="editor-cytoscape"></div>
            <div class="graph-legend">
              <span class="legend-item cause">🟠 원인 변수</span>
              <span class="legend-item effect">🟣 결과 변수</span>
              <span class="legend-item intermediate">🔵 중간 변수</span>
              <span class="legend-item positive">→ 정(+) 관계</span>
              <span class="legend-item negative">→ 부(-) 관계</span>
            </div>
          </div>
          
          <!-- 오른쪽: 속성 편집 패널 -->
          <div class="editor-property-panel">
            <!-- 선택된 노드 편집 -->
            <div v-if="selectedNode" class="property-section">
              <h3>🔵 노드 속성</h3>
              <div class="property-group">
                <label>ID</label>
                <input type="text" v-model="selectedNode.id" class="prop-input" readonly />
              </div>
              <div class="property-group">
                <label>라벨</label>
                <input type="text" v-model="selectedNode.label" class="prop-input" @input="updateNodeLabel" />
              </div>
              <div class="property-group">
                <label>타입</label>
                <select v-model="selectedNode.type" class="prop-select" @change="updateNodeType">
                  <option value="cause">원인 (Cause)</option>
                  <option value="effect">결과 (Effect)</option>
                  <option value="intermediate">중간 (Intermediate)</option>
                </select>
              </div>
              <div class="property-group">
                <label>데이터 소스</label>
                <input type="text" v-model="selectedNode.dataSource" class="prop-input" placeholder="테이블.컬럼" />
              </div>
            </div>
            
            <!-- 선택된 엣지 편집 -->
            <div v-else-if="selectedEdge" class="property-section">
              <h3>🔗 관계 속성</h3>
              <div class="property-group">
                <label>관계</label>
                <div class="edge-relation">
                  {{ selectedEdge.source }} → {{ selectedEdge.target }}
                </div>
              </div>
              <div class="property-group">
                <label>방향</label>
                <select v-model="selectedEdge.direction" class="prop-select" @change="updateEdgeDirection">
                  <option value="positive">정(+) 관계</option>
                  <option value="negative">부(-) 관계</option>
                </select>
              </div>
              <div class="property-group">
                <label>강도 (%)</label>
                <input type="range" v-model.number="selectedEdge.strength" min="0" max="100" class="prop-range" @input="updateEdgeStrength" />
                <span class="range-value">{{ selectedEdge.strength }}%</span>
              </div>
              
              <!-- 영향 함수 편집 -->
              <div class="property-group function-group">
                <label>📐 영향 함수</label>
                <textarea v-model="selectedEdge.formula" class="prop-formula" rows="2" placeholder="y = a * x + b"></textarea>
                <div class="function-params">
                  <div class="param-row">
                    <label>R²</label>
                    <input type="number" v-model.number="selectedEdge.r_squared" class="param-input" min="0" max="1" step="0.01" />
                  </div>
                  <div class="param-row">
                    <label>Lag</label>
                    <input type="number" v-model.number="selectedEdge.lag" class="param-input" min="0" max="10" />
                  </div>
                </div>
              </div>
            </div>
            
            <!-- 선택 없음 -->
            <div v-else class="no-selection">
              <p>📌 노드나 엣지를 클릭하여 속성을 편집하세요</p>
              <div class="instructions">
                <div>• 노드 클릭: 변수 속성 편집</div>
                <div>• 엣지 클릭: 관계 및 함수 편집</div>
                <div>• 드래그: 노드 위치 이동</div>
              </div>
            </div>
            
            <!-- 시뮬레이션 테스트 패널 -->
            <div v-if="showTestPanel" class="test-section">
              <h3>🧪 시뮬레이션 테스트</h3>
              <div class="test-inputs">
                <div v-for="node in getInputNodes()" :key="node.id" class="test-input-row">
                  <label>{{ node.label }}</label>
                  <input type="number" v-model.number="testInputs[node.id]" class="test-value" placeholder="값 입력" />
                </div>
              </div>
              <button class="run-test-btn" @click="runSimulationTest">▶ 시뮬레이션 실행</button>
              <div v-if="testResults" class="test-results">
                <h4>📊 결과</h4>
                <div v-for="(value, key) in testResults" :key="key" class="result-row">
                  <span class="result-name">{{ key }}</span>
                  <span class="result-value">{{ typeof value === 'number' ? value.toFixed(2) : value }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from 'vue'
import cytoscape from 'cytoscape'
import edgehandles from 'cytoscape-edgehandles'
import type { CausalDiscoveryResult } from '@/features/whatif/whatif-api'
import { whatifApi } from '@/features/whatif/whatif-api'

// Edgehandles 확장 등록
cytoscape.use(edgehandles)

const props = defineProps<{
  sessionId: string | null
  causalResult: CausalDiscoveryResult | null
  loading: boolean
}>()

defineEmits<{
  (e: 'run-discovery', methods: string[], maxLag: number): void
}>()

const methods = ref(['correlation', 'granger'])
const maxLag = ref(2)
const showEdgeList = ref(false)

// Cytoscape
const cytoscapeContainer = ref<HTMLElement | null>(null)
let cy: cytoscape.Core | null = null
const selectedLayout = ref('cose')

// Neo4j 저장 상태
const savingToNeo4j = ref(false)
const neo4jSaved = ref(false)

// 편집기 상태
const isEditorOpen = ref(false)
const saving = ref(false)
const showTestPanel = ref(false)

// 편집기용 Cytoscape
const editorCytoscapeContainer = ref<HTMLElement | null>(null)
let editorCy: cytoscape.Core | null = null

interface OntologyNode {
  id: string
  label: string
  type: 'cause' | 'effect' | 'intermediate'
  dataSource?: string
}

interface OntologyLink {
  source: string
  target: string
  direction: 'positive' | 'negative'
  strength: number
  formula?: string
  r_squared?: number
  lag?: number
}

interface EditingOntology {
  name: string
  dataSource: string
  description: string
  nodes: OntologyNode[]
  links: OntologyLink[]
}

const editingOntology = ref<EditingOntology>({
  name: '',
  dataSource: '',
  description: '',
  nodes: [],
  links: []
})

// 선택된 요소
const selectedElement = ref<'node' | 'edge' | null>(null)
const selectedNode = ref<OntologyNode | null>(null)
const selectedEdge = ref<OntologyLink | null>(null)

// 시뮬레이션 테스트
const testInputs = ref<Record<string, number>>({})
const testResults = ref<Record<string, number> | null>(null)
const isDraggingHandle = ref(false)
const hoveredNodeId = ref<string | null>(null)  // 현재 호버된 노드 ID

function getR2Class(r2: number): string {
  if (r2 >= 0.7) return 'good'
  if (r2 >= 0.5) return 'moderate'
  return 'low'
}

// Cytoscape 그래프 초기화
function initCytoscape() {
  if (!cytoscapeContainer.value || !props.causalResult) return
  
  // 기존 인스턴스 제거
  if (cy) {
    cy.destroy()
    cy = null
  }
  
  // 노드와 엣지 생성
  const nodes = new Set<string>()
  const elements: cytoscape.ElementDefinition[] = []
  
  // 노드 추출
  props.causalResult.edges.forEach(edge => {
    nodes.add(edge.source)
    nodes.add(edge.target)
  })
  
  // 핵심 원인/결과 변수 확인
  const rootCauses = new Set(props.causalResult.summary.root_causes?.map(([name]) => name) || [])
  const finalEffects = new Set(props.causalResult.summary.final_effects?.map(([name]) => name) || [])
  
  // 라벨 추적 초기화
  resetLabelTracking()
  
  // 백엔드에서 제공하는 라벨 매핑 생성
  const nodeLabelMap = new Map<string, string>()
  props.causalResult.edges.forEach(edge => {
    if (edge.source_label) nodeLabelMap.set(edge.source, edge.source_label)
    if (edge.target_label) nodeLabelMap.set(edge.target, edge.target_label)
  })
  
  // 노드 추가 - 중복 라벨 추적
  nodes.forEach(node => {
    let nodeType = 'intermediate'
    if (rootCauses.has(node)) nodeType = 'cause'
    else if (finalEffects.has(node)) nodeType = 'effect'
    
    // 백엔드 라벨 우선 사용, 없으면 프론트엔드에서 변환 (중복 추적 활성화)
    const label = nodeLabelMap.get(node) || formatNodeLabel(node, true)
    
    elements.push({
      data: { 
        id: node, 
        label: label,
        type: nodeType
      }
    })
  })
  
  // 엣지 추가
  props.causalResult.edges.forEach((edge, idx) => {
    elements.push({
      data: {
        id: `edge_${idx}`,
        source: edge.source,
        target: edge.target,
        strength: edge.strength,
        direction: edge.direction,
        label: `${(edge.strength * 100).toFixed(0)}%`,
        r_squared: edge.r_squared || 0
      }
    })
  })
  
  // Cytoscape 인스턴스 생성
  cy = cytoscape({
    container: cytoscapeContainer.value,
    elements,
    style: [
      {
        selector: 'node',
        style: {
          'background-color': '#3b82f6',
          'label': 'data(label)',
          'color': '#fff',
          'text-valign': 'center',
          'text-halign': 'center',
          'font-size': '11px',
          'font-weight': 'bold',
          'width': 70,
          'height': 70,
          'border-width': 3,
          'border-color': '#1e40af',
          'text-wrap': 'wrap',
          'text-max-width': '60px'
        }
      },
      {
        selector: 'node[type="cause"]',
        style: {
          'background-color': '#f59e0b',
          'border-color': '#d97706',
          'width': 85,
          'height': 85
        }
      },
      {
        selector: 'node[type="effect"]',
        style: {
          'background-color': '#8b5cf6',
          'border-color': '#7c3aed',
          'width': 85,
          'height': 85
        }
      },
      {
        selector: 'edge',
        style: {
          'width': 'mapData(strength, 0, 1, 2, 8)',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          'arrow-scale': 1.2,
          'label': 'data(label)',
          'font-size': '9px',
          'color': '#94a3b8',
          'text-background-color': '#1a1b1e',
          'text-background-opacity': 0.8,
          'text-background-padding': '2px'
        }
      },
      {
        selector: 'edge[direction="positive"]',
        style: {
          'line-color': '#10b981',
          'target-arrow-color': '#10b981'
        }
      },
      {
        selector: 'edge[direction="negative"]',
        style: {
          'line-color': '#ef4444',
          'target-arrow-color': '#ef4444'
        }
      },
      {
        selector: 'node:selected',
        style: {
          'border-width': 5,
          'border-color': '#00d9ff',
          'box-shadow': '0 0 20px #00d9ff'
        }
      },
      {
        selector: 'edge:selected',
        style: {
          'width': 6,
          'line-color': '#00d9ff',
          'target-arrow-color': '#00d9ff'
        }
      }
    ],
    layout: getLayoutConfig(selectedLayout.value),
    minZoom: 0.3,
    maxZoom: 3,
    wheelSensitivity: 0.3
  })
  
  // 노드 클릭 이벤트
  cy.on('tap', 'node', (evt) => {
    const node = evt.target
    console.log('Node clicked:', node.id(), node.data())
  })
}

// 변수명을 의미 있는 한글 라벨로 변환하는 매핑
const variableLabelMap: Record<string, string> = {
  // 환율 관련
  'usd_krw': 'USD/KRW\n환율',
  'eur_krw': 'EUR/KRW\n환율',
  'jpy_krw': 'JPY/KRW\n환율',
  'fx_rate': '외환\n환율',
  'exchange_rate': '환율',
  
  // 비용 관련
  'import_cost': '수입\n비용',
  'material_cost': '원자재\n비용',
  'product_cost': '제품\n원가',
  'total_cost': '총\n비용',
  'monthly_cogs': '월간\n매출원가',
  'labor_cost': '인건비',
  'logistics_cost': '물류비',
  
  // 수익 관련
  'final_profit': '최종\n수익',
  'monthly_profit': '월간\n수익',
  'gross_profit': '총\n이익',
  'net_profit': '순\n이익',
  'revenue': '매출',
  'sales_revenue': '판매\n매출',
  
  // 판매 관련
  'selling_price': '판매\n가격',
  'unit_price': '단가',
  'sales_volume': '판매량',
  'market_demand': '시장\n수요',
  'demand': '수요',
  
  // 기타
  'inventory': '재고',
  'production': '생산량',
  'market_share': '시장\n점유율',
  'customer_satisfaction': '고객\n만족도'
}

// 사용된 라벨 추적 (중복 방지)
const usedLabels = new Map<string, string[]>()  // label -> [id1, id2, ...]

// 영어 키워드를 한글로 변환하는 사전
const translations: Record<string, string> = {
  'rate': '환율',
  'cost': '비용',
  'price': '가격',
  'profit': '수익',
  'revenue': '매출',
  'sales': '판매',
  'demand': '수요',
  'supply': '공급',
  'volume': '판매량',
  'total': '총',
  'monthly': '월간',
  'daily': '일간',
  'annual': '연간',
  'import': '수입',
  'export': '수출',
  'material': '원자재',
  'raw': '원',
  'product': '제품',
  'market': '시장',
  'exchange': '환율',
  'fx': '외환',
  'usd': 'USD',
  'eur': 'EUR',
  'jpy': 'JPY',
  'krw': 'KRW',
  'cny': 'CNY',
  'gross': '총',
  'net': '순',
  'unit': '단위',
  'selling': '판매',
  'avg': '평균',
  'buying': '구매',
  'cogs': '매출원가',
  'inventory': '재고',
  'production': '생산',
  'labor': '인건',
  'operating': '영업',
  'final': '최종',
  'size': '규모',
  'target': '목표',
  'our': '',
  'segment': '세그먼트',
  'brand': '브랜드',
  'equity': '가치',
  'kpi': 'KPI',
  'goods': '상품',
  'sold': '판매'
}

function formatNodeLabel(name: string, trackDuplicate: boolean = false): string {
  const lowerName = name.toLowerCase()
  const parts = name.split('_')
  
  // 1. 통화 코드가 있으면 환율 형식
  const currencyPattern = /(usd|eur|jpy|cny|krw)/i
  const currencies = parts.filter(p => currencyPattern.test(p)).map(c => c.toUpperCase())
  
  let label = ''
  
  if (currencies.length >= 2) {
    label = `${currencies[0]}/${currencies[1]}\n환율`
  } else if (currencies.length === 1 && lowerName.includes('rate')) {
    label = `${currencies[0]}\n환율`
  } else {
    // 2. 테이블명_컬럼명 형식 처리
    // 테이블명 (첫 번째 파트)
    const tableName = parts[0]
    const tableLabel = translations[tableName.toLowerCase()] || ''
    
    // 나머지 파트들 번역
    const restParts = parts.slice(1).filter(p => !currencyPattern.test(p))
    const translatedRest = restParts
      .map(p => translations[p.toLowerCase()] || p)
      .filter(p => p && p.length > 0)
    
    // 의미 있는 조합 생성
    if (translatedRest.length >= 2) {
      // 마지막 2개 조합
      label = translatedRest.slice(-2).join(' ')
    } else if (translatedRest.length === 1) {
      label = translatedRest[0]
    } else {
      label = tableLabel || tableName
    }
    
    // 테이블 구분이 필요한 경우 접두어 추가
    if (tableLabel && !label.includes(tableLabel)) {
      label = `${tableLabel}\n${label}`
    }
  }
  
  // 3. 중복 체크 및 구분자 추가
  if (trackDuplicate && label) {
    const baseLabel = label.replace(/\n/g, ' ').trim()
    const existingIds = usedLabels.get(baseLabel) || []
    
    if (existingIds.length > 0 && !existingIds.includes(name)) {
      // 이미 같은 라벨이 있으면 테이블명을 추가
      const tableName = parts[0]
      const tableLabel = translations[tableName.toLowerCase()] || tableName
      if (!label.includes(tableLabel)) {
        label = `${label}\n(${tableLabel})`
      } else {
        // 더 구체적인 구분자 추가
        const uniquePart = parts.find(p => !translations[p.toLowerCase()] && p.length > 2) || parts[1]
        if (uniquePart) {
          label = `${label}\n(${uniquePart})`
        }
      }
    }
    
    existingIds.push(name)
    usedLabels.set(baseLabel, existingIds)
  }
  
  return label || name
}

// 라벨 추적 초기화
function resetLabelTracking() {
  usedLabels.clear()
}

function getLayoutConfig(layout: string): cytoscape.LayoutOptions {
  const configs: Record<string, cytoscape.LayoutOptions> = {
    cose: {
      name: 'cose',
      animate: true,
      animationDuration: 500,
      nodeRepulsion: () => 8000,
      idealEdgeLength: () => 150,
      gravity: 0.25
    },
    dagre: {
      name: 'dagre',
      rankDir: 'LR',
      nodeSep: 80,
      rankSep: 150,
      animate: true
    } as cytoscape.LayoutOptions,
    circle: {
      name: 'circle',
      animate: true,
      animationDuration: 500
    },
    grid: {
      name: 'grid',
      animate: true,
      animationDuration: 500
    }
  }
  return configs[layout] || configs.cose
}

function fitGraph() {
  cy?.fit(undefined, 30)
}

function toggleLayout() {
  const layouts = ['cose', 'dagre', 'circle', 'grid']
  const currentIdx = layouts.indexOf(selectedLayout.value)
  selectedLayout.value = layouts[(currentIdx + 1) % layouts.length]
  applyLayout()
}

function applyLayout() {
  if (cy) {
    cy.layout(getLayoutConfig(selectedLayout.value)).run()
  }
}

// Neo4j에 온톨로지 저장
async function saveToNeo4j() {
  if (!props.sessionId || !props.causalResult) return
  
  savingToNeo4j.value = true
  neo4jSaved.value = false
  
  try {
    await whatifApi.saveToNeo4j(props.sessionId)
    neo4jSaved.value = true
  } catch (error) {
    console.error('Neo4j 저장 실패:', error)
    alert('Neo4j 저장에 실패했습니다.')
  } finally {
    savingToNeo4j.value = false
  }
}

// 편집기 열기
function openEditor() {
  if (!props.causalResult) return
  
  // 현재 결과를 편집 가능한 형태로 변환
  const nodes = new Set<string>()
  props.causalResult.edges.forEach(edge => {
    nodes.add(edge.source)
    nodes.add(edge.target)
  })
  
  const rootCauses = new Set(props.causalResult.summary.root_causes?.map(([name]) => name) || [])
  const finalEffects = new Set(props.causalResult.summary.final_effects?.map(([name]) => name) || [])
  
  // 라벨 추적 초기화
  resetLabelTracking()
  
  // 백엔드에서 제공하는 라벨 매핑 생성
  const nodeLabelMap = new Map<string, string>()
  props.causalResult.edges.forEach(edge => {
    if (edge.source_label) nodeLabelMap.set(edge.source, edge.source_label)
    if (edge.target_label) nodeLabelMap.set(edge.target, edge.target_label)
  })
  
  editingOntology.value = {
    name: `온톨로지_${props.sessionId?.substring(0, 8) || 'new'}`,
    dataSource: 'mysql_sample',
    description: '데이터 기반 자동 발견된 온톨로지',
    nodes: Array.from(nodes).map(n => ({
      id: n,
      label: nodeLabelMap.get(n) || formatNodeLabel(n, true),
      type: rootCauses.has(n) ? 'cause' : finalEffects.has(n) ? 'effect' : 'intermediate',
      dataSource: ''
    })),
    links: props.causalResult.edges.map(edge => ({
      source: edge.source,
      target: edge.target,
      direction: edge.direction as 'positive' | 'negative',
      strength: Math.round(edge.strength * 100),
      formula: edge.formula || '',
      r_squared: edge.r_squared || 0,
      lag: edge.lag || 0
    }))
  }
  
  // 선택 초기화
  selectedElement.value = null
  selectedNode.value = null
  selectedEdge.value = null
  testResults.value = null
  
  isEditorOpen.value = true
  
  // 편집기 그래프 초기화
  nextTick(() => initEditorCytoscape())
}

// 편집기 닫기
function closeEditor() {
  isEditorOpen.value = false
  showTestPanel.value = false
  if (edgehandlesInstance) {
    edgehandlesInstance.destroy()
    edgehandlesInstance = null
  }
  if (editorCy) {
    editorCy.destroy()
    editorCy = null
  }
}

// 편집기용 edgehandles 인스턴스
let edgehandlesInstance: any = null

// 편집기 Cytoscape 초기화
function initEditorCytoscape() {
  if (!editorCytoscapeContainer.value) return
  
  if (editorCy) {
    editorCy.destroy()
  }
  
  const elements: cytoscape.ElementDefinition[] = []
  
  // 노드 추가
  editingOntology.value.nodes.forEach(node => {
    elements.push({
      data: { 
        id: node.id, 
        label: node.label,
        type: node.type
      }
    })
  })
  
  // 엣지 추가
  editingOntology.value.links.forEach((link, idx) => {
    elements.push({
      data: {
        id: `edge_${idx}`,
        source: link.source,
        target: link.target,
        direction: link.direction,
        strength: link.strength,
        label: `${link.strength}%`
      }
    })
  })
  
  editorCy = cytoscape({
    container: editorCytoscapeContainer.value,
    elements,
    style: [
      {
        selector: 'node',
        style: {
          'background-color': '#3b82f6',
          'label': 'data(label)',
          'color': '#fff',
          'text-valign': 'center',
          'text-halign': 'center',
          'font-size': '12px',
          'font-weight': 'bold',
          'width': 80,
          'height': 80,
          'shape': 'ellipse',
          'border-width': 3,
          'border-color': '#1e40af',
          'text-wrap': 'wrap',
          'text-max-width': '70px'
        }
      },
      {
        selector: 'node[type="cause"]',
        style: {
          'background-color': '#f59e0b',
          'border-color': '#d97706'
        }
      },
      {
        selector: 'node[type="effect"]',
        style: {
          'background-color': '#8b5cf6',
          'border-color': '#7c3aed'
        }
      },
      // 마우스 호버 시 밝은 외곽 링 - 연결 가능 표시
      {
        selector: '.eh-hover',
        style: {
          'border-width': 12,
          'border-color': 'rgba(255, 255, 255, 0.9)',
          'border-opacity': 1,
          'shape': 'ellipse',
          'width': 80,
          'height': 80
        }
      },
      // 핸들 - 노드 외곽에 표시되는 드래그 가능한 원
      {
        selector: '.eh-handle',
        style: {
          'background-color': '#00d9ff',
          'width': 22,
          'height': 22,
          'shape': 'ellipse',
          'overlay-opacity': 0,
          'border-width': 5,
          'border-color': '#ffffff',
          'border-opacity': 1,
          'opacity': 1,
          'z-index': 9999
        }
      },
      // 드래그 소스 노드 - 연결 시작점
      {
        selector: '.eh-source',
        style: {
          'border-width': 10,
          'border-color': '#00d9ff',
          'border-opacity': 1,
          'background-opacity': 0.9,
          'shape': 'ellipse',
          'width': 80,
          'height': 80
        }
      },
      // 드래그 타겟 노드 (스냅 대상)
      {
        selector: '.eh-target',
        style: {
          'border-width': 10,
          'border-color': '#10b981',
          'border-opacity': 1,
          'shape': 'ellipse',
          'width': 80,
          'height': 80
        }
      },
      // 추정 대상 - 근처에 접근 시 강조 (스냅 효과)
      {
        selector: '.eh-presumptive-target',
        style: {
          'border-width': 14,
          'border-color': '#10b981',
          'border-opacity': 1,
          'background-opacity': 1,
          'shape': 'ellipse',
          'width': 80,
          'height': 80,
          'z-index': 9998
        }
      },
      // 미리보기 엣지 - 드래그 중 연결선
      {
        selector: '.eh-preview',
        style: {
          'line-color': '#00d9ff',
          'target-arrow-color': '#00d9ff',
          'target-arrow-shape': 'triangle',
          'line-style': 'dashed',
          'width': 4,
          'opacity': 0.85,
          'z-index': 9999
        }
      },
      // 고스트 엣지
      {
        selector: '.eh-ghost-edge',
        style: {
          'line-color': '#00d9ff',
          'target-arrow-color': '#00d9ff',
          'line-style': 'dashed',
          'opacity': 0.7,
          'width': 3
        }
      },
      // 드래그 중인 가상의 원 (Ghost) - 마우스를 따라 이동
      {
        selector: '.eh-ghost',
        style: {
          'background-color': '#00d9ff',
          'width': 36,
          'height': 36,
          'shape': 'ellipse',
          'border-width': 6,
          'border-color': 'rgba(255, 255, 255, 0.95)',
          'opacity': 0.95,
          'z-index': 10000
        }
      },
      // 활성화된 노드
      {
        selector: 'node:active',
        style: {
          'overlay-opacity': 0
        }
      },
      {
        selector: 'edge',
        style: {
          'width': 3,
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          'arrow-scale': 1.3,
          'label': 'data(label)',
          'font-size': '10px',
          'color': '#fff',
          'text-background-color': '#1a1b1e',
          'text-background-opacity': 0.9,
          'text-background-padding': '3px'
        }
      },
      {
        selector: 'edge[direction="positive"]',
        style: {
          'line-color': '#10b981',
          'target-arrow-color': '#10b981'
        }
      },
      {
        selector: 'edge[direction="negative"]',
        style: {
          'line-color': '#ef4444',
          'target-arrow-color': '#ef4444'
        }
      },
      {
        selector: ':selected',
        style: {
          'border-width': 5,
          'border-color': '#00d9ff',
          'line-color': '#00d9ff',
          'target-arrow-color': '#00d9ff'
        }
      }
    ],
    layout: getLayoutConfig('cose'),
    minZoom: 0.3,
    maxZoom: 3
  })
  
  // 노드 클릭 이벤트
  editorCy.on('tap', 'node', (evt) => {
    const node = evt.target
    const nodeId = node.id()
    const nodeData = editingOntology.value.nodes.find(n => n.id === nodeId)
    if (nodeData) {
      selectedElement.value = 'node'
      selectedNode.value = { ...nodeData }
      selectedEdge.value = null
    }
  })
  
  // 엣지 클릭 이벤트
  editorCy.on('tap', 'edge', (evt) => {
    const edge = evt.target
    const edgeData = edge.data()
    const linkData = editingOntology.value.links.find(
      l => l.source === edgeData.source && l.target === edgeData.target
    )
    if (linkData) {
      selectedElement.value = 'edge'
      selectedEdge.value = { ...linkData }
      selectedNode.value = null
    }
  })
  
  // 배경 클릭 시 선택 해제
  editorCy.on('tap', (evt) => {
    if (evt.target === editorCy) {
      selectedElement.value = null
      selectedNode.value = null
      selectedEdge.value = null
    }
  })
  
  // Edgehandles 초기화 - 테두리 핸들 활성화 시 드래그로 링크 생성
  edgehandlesInstance = editorCy.edgehandles({
    preview: true,
    hoverDelay: 0,
    handleNodes: 'node',
    handlePosition: () => 'middle top',
    handleInDrawMode: true,
    edgeType: () => 'flat',
    loopAllowed: () => false,
    nodeLoopOffset: -50,
    snap: true,
    snapThreshold: 80,
    snapFrequency: 10,
    noEdgeEventsInDraw: false,
    disableBrowserGestures: true,
    handleColor: '#00d9ff',
    handleOutlineColor: '#ffffff',
    handleOutlineWidth: 3,
    handleSize: 14,
    handleHitThreshold: 50,
    edgeParams: () => ({
      data: { direction: 'positive' }
    }),
    complete: (sourceNode: any, targetNode: any) => {
      // 새 엣지 생성 완료 시
      const sourceId = sourceNode.id()
      const targetId = targetNode.id()
      
      // 중복 체크
      const exists = editingOntology.value.links.some(
        l => l.source === sourceId && l.target === targetId
      )
      
      if (!exists && sourceId !== targetId) {
        // 새 링크 추가
        const newLink: OntologyLink = {
          source: sourceId,
          target: targetId,
          direction: 'positive',
          strength: 50,
          formula: '',
          r_squared: 0,
          lag: 0
        }
        editingOntology.value.links.push(newLink)
        
        // 그래프에 엣지 추가
        editorCy?.add({
          data: {
            id: `edge_${Date.now()}`,
            source: sourceId,
            target: targetId,
            direction: 'positive',
            strength: 50,
            label: '50%'
          }
        })
        
        // 새로 생성된 엣지 선택
        selectedElement.value = 'edge'
        selectedEdge.value = { ...newLink }
        selectedNode.value = null
      }
    }
  })
  
  // 드래그 시작 시 - zoom 미세 조절로 렌더링 문제 회피
  editorCy.on('ehstart', () => {
    isDraggingHandle.value = true
    // 브라우저 zoom 레벨에 따른 찌그러짐 방지를 위해 zoom 미세 조절
    const currentZoom = editorCy?.zoom() || 1
    editorCy?.zoom(currentZoom * 1.001)
    setTimeout(() => {
      editorCy?.zoom(currentZoom)
    }, 50)
  })
  
  // 드래그 종료 시 - 모든 상태 초기화
  editorCy.on('ehstop ehcomplete ehcancel', () => {
    isDraggingHandle.value = false
    hoveredNodeId.value = null
    // 모든 노드에서 모든 관련 클래스 제거 + 이동 다시 활성화
    editorCy?.nodes().removeClass('eh-presumptive-target eh-hover eh-source eh-target')
    editorCy?.nodes().grabify()
    // 모든 노드 크기 복원 (찌그러짐 방지)
    editorCy?.nodes().style({
      'width': 80,
      'height': 80,
      'shape': 'ellipse'
    })
    // drawMode 비활성화
    edgehandlesInstance?.disableDrawMode()
  })
  
  // 다른 노드 위에 올라갔을 때 (스냅 대상)
  editorCy.on('ehshow', (evt, targetNode) => {
    editorCy?.nodes().removeClass('eh-presumptive-target')
    targetNode.addClass('eh-presumptive-target')
    // 크기 고정 - 찌그러짐 방지
    targetNode.style({
      'width': 80,
      'height': 80,
      'shape': 'ellipse'
    })
    // zoom 미세 조절로 렌더링 새로고침
    const currentZoom = editorCy?.zoom() || 1
    editorCy?.zoom(currentZoom * 0.9999)
    requestAnimationFrame(() => {
      editorCy?.zoom(currentZoom)
    })
  })
  
  // 노드에서 벗어났을 때 (스냅 해제)
  editorCy.on('ehhide', (evt, targetNode) => {
    targetNode.removeClass('eh-presumptive-target')
    // 크기 복원
    targetNode.style({
      'width': 80,
      'height': 80,
      'shape': 'ellipse'
    })
  })
  
  // 테두리 영역 판별 함수 (노드 반지름의 65% 이상이면 테두리 영역)
  const isOnBorder = (node: any, mousePos: { x: number, y: number }) => {
    const pos = node.position()
    const width = node.width()
    const radius = width / 2
    const distance = Math.sqrt(Math.pow(mousePos.x - pos.x, 2) + Math.pow(mousePos.y - pos.y, 2))
    const borderThreshold = radius * 0.65  // 65% 이상이면 테두리 영역
    return distance >= borderThreshold
  }
  
  // 노드 위에서 마우스 이동 - 테두리 영역 체크
  editorCy.on('mousemove', 'node', (evt) => {
    if (isDraggingHandle.value) return
    
    const node = evt.target
    const nodeId = node.id()
    const mousePos = evt.position
    
    if (isOnBorder(node, mousePos)) {
      // 테두리 영역 - 연결 모드 활성화
      if (hoveredNodeId.value !== nodeId) {
        // 이전 호버 정리
        if (hoveredNodeId.value) {
          const prevNode = editorCy?.getElementById(hoveredNodeId.value)
          prevNode?.removeClass('eh-hover')
          prevNode?.grabify()
        }
        
        hoveredNodeId.value = nodeId
        node.addClass('eh-hover')
        node.ungrabify()
        edgehandlesInstance?.enableDrawMode()
      }
    } else {
      // 중앙 영역 - 이동 모드
      if (hoveredNodeId.value === nodeId) {
        hoveredNodeId.value = null
        node.removeClass('eh-hover')
        node.grabify()
        edgehandlesInstance?.disableDrawMode()
      }
    }
  })
  
  // 노드 마우스 아웃 - 상태 정리
  editorCy.on('mouseout', 'node', (evt) => {
    if (isDraggingHandle.value) return
    
    const node = evt.target
    const nodeId = node.id()
    
    if (hoveredNodeId.value === nodeId) {
      hoveredNodeId.value = null
      node.removeClass('eh-hover')
      node.grabify()
      edgehandlesInstance?.disableDrawMode()
    }
  })
  
  // 배경 클릭 시 모든 상태 초기화
  editorCy.on('tap', (evt) => {
    if (evt.target === editorCy && !isDraggingHandle.value) {
      hoveredNodeId.value = null
      editorCy?.nodes().removeClass('eh-hover').grabify()
      edgehandlesInstance?.disableDrawMode()
    }
  })
  
  // 초기 상태: drawMode 비활성화 (노드 이동 가능)
  edgehandlesInstance.disableDrawMode()
}

// 편집기 그래프 컨트롤
function editorFitGraph() {
  editorCy?.fit(undefined, 30)
}

function editorToggleLayout() {
  if (editorCy) {
    const layouts = ['cose', 'dagre', 'circle', 'grid']
    const current = layouts.indexOf(selectedLayout.value)
    selectedLayout.value = layouts[(current + 1) % layouts.length]
    editorCy.layout(getLayoutConfig(selectedLayout.value)).run()
  }
}

// 노드 추가
function startAddNode() {
  const newId = `node_${Date.now()}`
  const newNode: OntologyNode = {
    id: newId,
    label: '새 변수',
    type: 'intermediate',
    dataSource: ''
  }
  editingOntology.value.nodes.push(newNode)
  
  if (editorCy) {
    editorCy.add({
      data: { id: newId, label: '새 변수', type: 'intermediate' }
    })
    editorCy.layout(getLayoutConfig(selectedLayout.value)).run()
  }
}

// 엣지 추가
function startAddEdge() {
  if (editingOntology.value.nodes.length < 2) {
    alert('엣지를 추가하려면 최소 2개의 노드가 필요합니다.')
    return
  }
  
  const source = editingOntology.value.nodes[0].id
  const target = editingOntology.value.nodes[1].id
  
  const newLink: OntologyLink = {
    source,
    target,
    direction: 'positive',
    strength: 50,
    formula: '',
    r_squared: 0,
    lag: 0
  }
  editingOntology.value.links.push(newLink)
  
  if (editorCy) {
    editorCy.add({
      data: {
        id: `edge_${Date.now()}`,
        source,
        target,
        direction: 'positive',
        strength: 50,
        label: '50%'
      }
    })
  }
}

// 선택된 요소 삭제
function deleteSelected() {
  if (selectedNode.value) {
    const nodeId = selectedNode.value.id
    editingOntology.value.nodes = editingOntology.value.nodes.filter(n => n.id !== nodeId)
    editingOntology.value.links = editingOntology.value.links.filter(
      l => l.source !== nodeId && l.target !== nodeId
    )
    editorCy?.getElementById(nodeId).remove()
    selectedNode.value = null
    selectedElement.value = null
  } else if (selectedEdge.value) {
    const edge = selectedEdge.value
    editingOntology.value.links = editingOntology.value.links.filter(
      l => !(l.source === edge.source && l.target === edge.target)
    )
    editorCy?.edges().filter(e => 
      e.data('source') === edge.source && e.data('target') === edge.target
    ).remove()
    selectedEdge.value = null
    selectedElement.value = null
  }
}

// 노드 속성 업데이트
function updateNodeLabel() {
  if (selectedNode.value && editorCy) {
    const node = editorCy.getElementById(selectedNode.value.id)
    node.data('label', selectedNode.value.label)
    
    const idx = editingOntology.value.nodes.findIndex(n => n.id === selectedNode.value!.id)
    if (idx >= 0) {
      editingOntology.value.nodes[idx].label = selectedNode.value.label
    }
  }
}

function updateNodeType() {
  if (selectedNode.value && editorCy) {
    const node = editorCy.getElementById(selectedNode.value.id)
    node.data('type', selectedNode.value.type)
    
    const idx = editingOntology.value.nodes.findIndex(n => n.id === selectedNode.value!.id)
    if (idx >= 0) {
      editingOntology.value.nodes[idx].type = selectedNode.value.type
    }
  }
}

// 엣지 속성 업데이트
function updateEdgeDirection() {
  if (selectedEdge.value && editorCy) {
    const edge = editorCy.edges().filter(e => 
      e.data('source') === selectedEdge.value!.source && 
      e.data('target') === selectedEdge.value!.target
    )
    edge.data('direction', selectedEdge.value.direction)
    
    const idx = editingOntology.value.links.findIndex(
      l => l.source === selectedEdge.value!.source && l.target === selectedEdge.value!.target
    )
    if (idx >= 0) {
      editingOntology.value.links[idx].direction = selectedEdge.value.direction
    }
  }
}

function updateEdgeStrength() {
  if (selectedEdge.value && editorCy) {
    const edge = editorCy.edges().filter(e => 
      e.data('source') === selectedEdge.value!.source && 
      e.data('target') === selectedEdge.value!.target
    )
    edge.data('strength', selectedEdge.value.strength)
    edge.data('label', `${selectedEdge.value.strength}%`)
    
    const idx = editingOntology.value.links.findIndex(
      l => l.source === selectedEdge.value!.source && l.target === selectedEdge.value!.target
    )
    if (idx >= 0) {
      editingOntology.value.links[idx].strength = selectedEdge.value.strength
    }
  }
}

// 입력 노드 가져오기 (원인 변수들)
function getInputNodes(): OntologyNode[] {
  return editingOntology.value.nodes.filter(n => n.type === 'cause')
}

// 시뮬레이션 테스트 실행
function runSimulationTest() {
  const results: Record<string, number> = {}
  
  // 입력값 복사
  for (const [key, value] of Object.entries(testInputs.value)) {
    results[key] = value
  }
  
  // 토폴로지 정렬하여 순서대로 계산
  const processed = new Set(Object.keys(testInputs.value))
  let changed = true
  let iterations = 0
  
  while (changed && iterations < 100) {
    changed = false
    iterations++
    
    for (const link of editingOntology.value.links) {
      if (processed.has(link.source) && !processed.has(link.target)) {
        // 간단한 선형 함수 적용
        const sourceVal = results[link.source] || 0
        const strength = link.strength / 100
        const direction = link.direction === 'positive' ? 1 : -1
        
        results[link.target] = (results[link.target] || 0) + sourceVal * strength * direction
        processed.add(link.target)
        changed = true
      }
    }
  }
  
  testResults.value = results
}

// 온톨로지 저장
async function saveOntology() {
  saving.value = true
  
  try {
    console.log('저장할 온톨로지:', editingOntology.value)
    
    if (props.sessionId) {
      await whatifApi.saveToNeo4j(props.sessionId)
    }
    
    alert('온톨로지가 저장되었습니다.')
    closeEditor()
  } catch (error) {
    console.error('온톨로지 저장 실패:', error)
    alert('저장에 실패했습니다.')
  } finally {
    saving.value = false
  }
}

// causalResult 변경 시 그래프 업데이트
watch(() => props.causalResult, async (newResult) => {
  if (newResult) {
    neo4jSaved.value = false
    await nextTick()
    initCytoscape()
  }
}, { immediate: true })

// 레이아웃 변경 감지
watch(selectedLayout, () => {
  applyLayout()
})

onMounted(() => {
  if (props.causalResult) {
    nextTick(() => initCytoscape())
  }
})
</script>

<style scoped>
.causal-discovery {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
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
  margin: 0 0 0.875rem 0;
}

/* Neo4j 저장 */
.neo4j-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.save-neo4j-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1.25rem;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text-bright);
  font-family: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.save-neo4j-btn:hover:not(:disabled) {
  background: var(--color-bg-elevated);
  border-color: #10b981;
  color: #10b981;
}

.save-neo4j-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.saved-badge {
  color: #10b981;
  font-size: 0.85rem;
  font-weight: 600;
}

/* Cytoscape 그래프 */
.causal-graph-visual {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 1rem;
}

.graph-controls {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.control-btn {
  padding: 0.4rem 0.75rem;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text-light);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;
}

.control-btn:hover {
  background: var(--color-bg-elevated);
  border-color: var(--color-accent);
  color: var(--color-accent);
}

.layout-select {
  padding: 0.4rem 0.6rem;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text);
  font-size: 0.75rem;
}

.cytoscape-container {
  width: 100%;
  height: 400px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 8px;
}

/* 옵션 */
.discovery-options {
  display: flex;
  align-items: flex-end;
  gap: 1.5rem;
  flex-wrap: wrap;
  padding: 1.25rem;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 10px;
}

.option-group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.option-group > label {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.checkbox-group {
  display: flex;
  gap: 0.875rem;
}

.checkbox-item {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  cursor: pointer;
  color: var(--color-text-light);
  font-size: 0.85rem;
}

.checkbox-item input {
  accent-color: var(--color-accent);
}

.lag-input {
  width: 55px;
  padding: 0.4rem;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text-bright);
  font-family: inherit;
  text-align: center;
}

.run-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1.25rem;
  background: var(--color-accent);
  border: none;
  border-radius: 8px;
  color: white;
  font-family: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.run-btn:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
}

.run-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.run-btn svg {
  width: 16px;
  height: 16px;
}

.spinner {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 요약 카드 */
.summary-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 0.875rem;
}

.summary-card {
  padding: 1rem;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-accent);
  border-radius: 10px;
  text-align: center;
}

.summary-card.positive {
  border-color: #10b981;
}

.summary-card.negative {
  border-color: #ef4444;
}

.card-value {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--color-text-bright);
}

.summary-card.positive .card-value {
  color: #10b981;
}

.summary-card.negative .card-value {
  color: #ef4444;
}

.card-label {
  font-size: 0.8rem;
  color: var(--color-text-muted);
  margin-top: 0.2rem;
}

/* 엣지 리스트 */
.edge-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-height: 400px;
  overflow-y: auto;
}

.edge-item {
  padding: 1rem;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  border-left: 4px solid #888;
}

.edge-item.positive {
  border-left-color: #00ff88;
}

.edge-item.negative {
  border-left-color: #ff6384;
}

.edge-main {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.source, .target {
  padding: 0.25rem 0.5rem;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  font-weight: 500;
  color: #fff;
}

.arrow {
  color: #888;
  font-weight: 600;
}

.arrow.positive {
  color: #00ff88;
}

.arrow.negative {
  color: #ff6384;
}

.edge-details {
  display: flex;
  gap: 1rem;
  font-size: 0.8rem;
  color: #888;
}

.strength {
  color: #00d9ff;
}

.edge-item .formula {
  margin-top: 0.5rem;
}

.edge-item .formula code {
  background: rgba(0, 0, 0, 0.3);
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.8rem;
  color: #00ff88;
}

/* 핵심 변수 */
.key-variables {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1.5rem;
}

.variable-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.variable-item {
  display: flex;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 6px;
}

.variable-item.cause {
  border-left: 3px solid #ff9f43;
}

.variable-item.effect {
  border-left: 3px solid #a29bfe;
}

.variable-item .name {
  color: #fff;
  font-weight: 500;
}

.variable-item .count {
  color: #888;
  font-size: 0.85rem;
}

/* 함수 테이블 */
.function-table {
  overflow-x: auto;
}

.function-table table {
  width: 100%;
  border-collapse: collapse;
}

.function-table th,
.function-table td {
  padding: 0.75rem 1rem;
  text-align: left;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.function-table th {
  background: rgba(0, 0, 0, 0.3);
  color: #888;
  font-size: 0.85rem;
  font-weight: 500;
}

.function-table .relation {
  color: #fff;
}

.function-table .formula code {
  background: rgba(0, 0, 0, 0.3);
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
  font-size: 0.8rem;
  color: #00ff88;
}

.function-table .r2.good {
  color: #00ff88;
}

.function-table .r2.moderate {
  color: #ffc107;
}

.function-table .r2.low {
  color: #ff6384;
}

.function-table .pvalue {
  color: #888;
  font-size: 0.85rem;
}

@media (max-width: 768px) {
  .key-variables {
    grid-template-columns: 1fr;
  }
  
  .discovery-options {
    flex-direction: column;
    align-items: stretch;
  }
}

/* 그래프 헤더 */
.graph-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.graph-header .subsection-title {
  margin: 0;
}

.edit-btn {
  padding: 0.5rem 1rem;
  background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
  border: none;
  border-radius: 8px;
  color: white;
  font-family: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.edit-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4);
}

/* 전체 화면 편집기 */
.editor-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--color-bg);
  z-index: 1000;
}

.editor-fullscreen {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1.25rem;
  background: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.header-left h2 {
  margin: 0;
  font-size: 1.1rem;
  color: var(--color-text-bright);
}

.ontology-name-input {
  padding: 0.4rem 0.75rem;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-accent);
  font-size: 0.9rem;
  font-weight: 600;
  width: 250px;
}

.header-right {
  display: flex;
  gap: 0.5rem;
}

.action-btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 8px;
  font-family: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn.test {
  background: #8b5cf6;
  color: white;
}

.action-btn.test:hover {
  background: #7c3aed;
}

.action-btn.save {
  background: #10b981;
  color: white;
}

.action-btn.save:hover:not(:disabled) {
  background: #059669;
}

.action-btn.save:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.action-btn.close {
  background: var(--color-bg-elevated);
  color: var(--color-text-muted);
  border: 1px solid var(--color-border);
  padding: 0.5rem 0.75rem;
}

.action-btn.close:hover {
  background: #ef4444;
  color: white;
  border-color: #ef4444;
}

.editor-main {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* 왼쪽: 그래프 패널 */
.editor-graph-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--color-border);
}

.graph-toolbar {
  display: flex;
  gap: 0.5rem;
  padding: 0.75rem;
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
}

.tool-btn {
  padding: 0.4rem 0.75rem;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text-light);
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s;
}

.tool-btn:hover {
  background: var(--color-bg-elevated);
  border-color: var(--color-accent);
  color: var(--color-accent);
}

.tool-btn.add {
  background: rgba(16, 185, 129, 0.1);
  border-color: #10b981;
  color: #10b981;
}

.tool-btn.add:hover {
  background: #10b981;
  color: white;
}

.tool-btn.delete {
  background: rgba(239, 68, 68, 0.1);
  border-color: #ef4444;
  color: #ef4444;
}

.tool-btn.delete:hover {
  background: #ef4444;
  color: white;
}

.editor-cytoscape {
  flex: 1;
  background: var(--color-bg);
  cursor: crosshair;
}

/* 드래그 연결 힌트 */
.editor-cytoscape::after {
  content: '노드 외곽을 드래그하여 연결';
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  padding: 0.4rem 0.75rem;
  background: rgba(0, 0, 0, 0.7);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: 0.75rem;
  color: var(--color-text-muted);
  pointer-events: none;
  opacity: 0.7;
}

.graph-legend {
  display: flex;
  gap: 1rem;
  padding: 0.5rem 0.75rem;
  background: var(--color-bg-secondary);
  border-top: 1px solid var(--color-border);
  font-size: 0.75rem;
}

.legend-item {
  color: var(--color-text-muted);
}

.legend-item.cause { color: #f59e0b; }
.legend-item.effect { color: #8b5cf6; }
.legend-item.intermediate { color: #3b82f6; }
.legend-item.positive { color: #10b981; }
.legend-item.negative { color: #ef4444; }

/* 오른쪽: 속성 패널 */
.editor-property-panel {
  width: 350px;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-secondary);
  overflow-y: auto;
}

.property-section, .test-section {
  padding: 1rem;
  border-bottom: 1px solid var(--color-border);
}

.property-section h3, .test-section h3 {
  margin: 0 0 1rem 0;
  font-size: 0.95rem;
  color: var(--color-accent);
}

.property-group {
  margin-bottom: 0.875rem;
}

.property-group:last-child {
  margin-bottom: 0;
}

.property-group label {
  display: block;
  margin-bottom: 0.3rem;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.prop-input, .prop-select, .prop-formula {
  width: 100%;
  padding: 0.5rem 0.75rem;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text-bright);
  font-family: inherit;
  font-size: 0.85rem;
}

.prop-formula {
  font-family: var(--font-mono);
  resize: vertical;
}

.prop-input:focus, .prop-select:focus, .prop-formula:focus {
  outline: none;
  border-color: var(--color-accent);
}

.prop-range {
  width: 100%;
  accent-color: var(--color-accent);
}

.range-value {
  display: inline-block;
  margin-top: 0.25rem;
  font-size: 0.85rem;
  color: var(--color-accent);
  font-weight: 600;
}

.edge-relation {
  padding: 0.5rem 0.75rem;
  background: var(--color-bg);
  border-radius: 6px;
  color: var(--color-text-bright);
  font-weight: 600;
}

.function-group {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--color-border);
}

.function-params {
  display: flex;
  gap: 1rem;
  margin-top: 0.75rem;
}

.param-row {
  flex: 1;
}

.param-row label {
  display: block;
  margin-bottom: 0.25rem;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.param-input {
  width: 100%;
  padding: 0.4rem;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text);
  font-size: 0.85rem;
  text-align: center;
}

.no-selection {
  padding: 2rem 1rem;
  text-align: center;
  color: var(--color-text-muted);
}

.no-selection p {
  margin: 0 0 1rem 0;
  font-size: 0.9rem;
}

.instructions {
  font-size: 0.8rem;
  line-height: 1.6;
  text-align: left;
  padding: 0.75rem;
  background: var(--color-bg);
  border-radius: 8px;
}

/* 시뮬레이션 테스트 */
.test-section {
  background: rgba(139, 92, 246, 0.05);
}

.test-inputs {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.test-input-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.test-input-row label {
  flex: 1;
  font-size: 0.85rem;
  color: var(--color-text);
}

.test-value {
  width: 100px;
  padding: 0.4rem;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-accent);
  font-size: 0.85rem;
  text-align: center;
}

.run-test-btn {
  width: 100%;
  padding: 0.6rem;
  background: #8b5cf6;
  border: none;
  border-radius: 8px;
  color: white;
  font-family: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.run-test-btn:hover {
  background: #7c3aed;
}

.test-results {
  margin-top: 1rem;
  padding: 0.75rem;
  background: var(--color-bg);
  border-radius: 8px;
}

.test-results h4 {
  margin: 0 0 0.5rem 0;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

.result-row {
  display: flex;
  justify-content: space-between;
  padding: 0.3rem 0;
  font-size: 0.85rem;
  border-bottom: 1px solid var(--color-border);
}

.result-row:last-child {
  border-bottom: none;
}

.result-name {
  color: var(--color-text);
}

.result-value {
  color: #10b981;
  font-weight: 600;
}
</style>
