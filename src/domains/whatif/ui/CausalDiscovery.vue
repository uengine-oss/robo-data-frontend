<template>
  <section class="causal-discovery">
    <header class="page-header">
      <h3>온톨로지 발견</h3>
      <p>선택한 분석 방법으로 실제 데이터의 인과관계를 발견합니다.</p>
    </header>

    <section class="discovery-options" aria-label="인과관계 발견 설정">
      <fieldset>
        <legend>분석 방법</legend>
        <label v-for="method in methodOptions" :key="method.id">
          <input v-model="methods" type="checkbox" :value="method.id" />
          <span>{{ method.label }}</span>
        </label>
      </fieldset>

      <label class="lag-field">
        <span>최대 시차 (Lag)</span>
        <input v-model.number="maxLag" type="number" min="1" max="10" />
      </label>

      <button
        type="button"
        class="primary-button"
        :disabled="loading || !sessionId || methods.length === 0"
        @click="emit('run-discovery', [...methods], maxLag)"
      >
        {{ loading ? '분석 중…' : '온톨로지 발견 실행' }}
      </button>
    </section>

    <p v-if="!sessionId" class="inline-notice" role="status">
      실제 데이터 세션을 먼저 생성해야 분석을 실행할 수 있습니다.
    </p>

    <section v-if="causalResult" class="results">
      <div class="summary-grid">
        <article><span>발견된 관계</span><strong>{{ graph.edges.length }}</strong></article>
        <article><span>양의 영향</span><strong class="positive">{{ causalResult.summary.positive_count }}</strong></article>
        <article><span>음의 영향</span><strong class="negative">{{ causalResult.summary.negative_count }}</strong></article>
        <article><span>강한 관계</span><strong>{{ causalResult.summary.strong_edges }}</strong></article>
      </div>

      <div class="save-row">
        <button type="button" class="save-button" :disabled="savingToNeo4j || graph.edges.length === 0" @click="saveToNeo4j">
          {{ savingToNeo4j ? 'Neo4j 저장 중…' : 'Neo4j에 발견 결과 저장' }}
        </button>
        <span v-if="saveMessage" :class="saveSucceeded ? 'save-success' : 'save-error'" role="status">
          {{ saveMessage }}
        </span>
      </div>

      <section class="graph-section" aria-labelledby="causal-graph-title">
        <div class="section-header">
          <div>
            <h4 id="causal-graph-title">인과관계 네트워크</h4>
            <p>노드와 연결선은 서버가 반환한 관계만 사용합니다.</p>
          </div>
          <div class="graph-controls">
            <button type="button" @click="fitGraph">전체 보기</button>
            <select v-model="selectedLayout" aria-label="그래프 레이아웃" @change="applyLayout">
              <option value="cose">물리 기반</option>
              <option value="breadthfirst">계층형</option>
              <option value="circle">원형</option>
              <option value="grid">격자</option>
            </select>
          </div>
        </div>
        <div v-if="graph.edges.length > 0" ref="graphContainer" class="graph-canvas"></div>
        <div v-else class="empty-state">발견된 인과관계가 없습니다.</div>
      </section>

      <section class="relationship-section">
        <button type="button" class="collapse-button" :aria-expanded="showRelationships" @click="showRelationships = !showRelationships">
          발견된 관계 {{ graph.edges.length }}건 {{ showRelationships ? '접기' : '펼치기' }}
        </button>
        <div v-if="showRelationships" class="relationship-list">
          <article v-for="edge in graph.edges" :key="edge.id" :class="edge.signedStrength < 0 ? 'negative-edge' : 'positive-edge'">
            <div class="relationship-title">
              <strong>{{ nodeLabel(edge.source) }}</strong>
              <span>→</span>
              <strong>{{ nodeLabel(edge.target) }}</strong>
            </div>
            <dl>
              <div><dt>방향·강도</dt><dd>{{ formatSignedStrength(edge.signedStrength) }}</dd></div>
              <div><dt>분석 방법</dt><dd>{{ edge.method || '제공되지 않음' }}</dd></div>
              <div><dt>p-value</dt><dd>{{ formatMetric(edge.p_value) }}</dd></div>
              <div><dt>R²</dt><dd>{{ formatMetric(edge.r_squared) }}</dd></div>
              <div v-if="edge.lag !== undefined"><dt>Lag</dt><dd>{{ edge.lag }}</dd></div>
            </dl>
            <code v-if="edge.formula">{{ edge.formula }}</code>
          </article>
        </div>
      </section>

      <div class="key-variables">
        <section>
          <h4>핵심 원인 변수</h4>
          <div v-if="causalResult.summary.root_causes.length > 0" class="variable-list">
            <span v-for="[name, count] in causalResult.summary.root_causes" :key="name">{{ name }} · {{ count }}</span>
          </div>
          <p v-else>제공되지 않음</p>
        </section>
        <section>
          <h4>핵심 결과 변수</h4>
          <div v-if="causalResult.summary.final_effects.length > 0" class="variable-list">
            <span v-for="[name, count] in causalResult.summary.final_effects" :key="name">{{ name }} · {{ count }}</span>
          </div>
          <p v-else>제공되지 않음</p>
        </section>
      </div>

      <section v-if="causalResult.influence_functions.length > 0" class="function-section">
        <h4>추정된 영향 함수</h4>
        <div class="table-scroll">
          <table>
            <thead><tr><th>관계</th><th>함수</th><th>R²</th><th>p-value</th></tr></thead>
            <tbody>
              <tr v-for="func in causalResult.influence_functions" :key="`${func.source}-${func.target}`">
                <td>{{ nodeLabel(func.source) }} → {{ nodeLabel(func.target) }}</td>
                <td><code>{{ func.formula }}</code></td>
                <td>{{ formatMetric(func.r_squared) }}</td>
                <td>{{ formatMetric(func.p_value) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import cytoscape from 'cytoscape'
import { persistCausalModel } from '../application/causalModelPersistence'
import type { CausalDiscoveryResult } from '../model/contracts'
import { buildExplainabilityGraph, formatSignedStrength } from '../model/explainability'

type DiscoveryMethod = 'correlation' | 'granger' | 'partial'
type GraphLayout = 'cose' | 'breadthfirst' | 'circle' | 'grid'

const props = defineProps<{
  sessionId: string | null
  causalResult: CausalDiscoveryResult | null
  loading: boolean
}>()

const emit = defineEmits<{
  (event: 'run-discovery', methods: string[], maxLag: number): void
}>()

const methodOptions: Array<{ id: DiscoveryMethod; label: string }> = [
  { id: 'correlation', label: 'Correlation' },
  { id: 'granger', label: 'Granger Causality' },
  { id: 'partial', label: 'Partial Correlation' },
]
const methods = ref<DiscoveryMethod[]>(['correlation', 'granger'])
const maxLag = ref(2)
const selectedLayout = ref<GraphLayout>('cose')
const graphContainer = ref<HTMLDivElement | null>(null)
const showRelationships = ref(false)
const savingToNeo4j = ref(false)
const saveMessage = ref('')
const saveSucceeded = ref(false)
const graph = computed(() => props.causalResult
  ? buildExplainabilityGraph(props.causalResult)
  : { nodes: [], edges: [], paths: [], inputIds: [], outputIds: [] })

let cy: cytoscape.Core | null = null

watch(
  () => props.causalResult,
  async result => {
    saveMessage.value = ''
    if (!result) {
      destroyGraph()
      return
    }
    await nextTick()
    initializeGraph()
  },
  { immediate: true },
)

function initializeGraph() {
  destroyGraph()
  if (!graphContainer.value || graph.value.edges.length === 0) return

  cy = cytoscape({
    container: graphContainer.value,
    elements: [
      ...graph.value.nodes.map(node => ({ data: { ...node }, classes: node.role })),
      ...graph.value.edges.map(edge => ({
        data: { ...edge, strengthLabel: formatSignedStrength(edge.signedStrength) },
        classes: edge.signedStrength < 0 ? 'negative' : 'positive',
      })),
    ],
    style: [
      {
        selector: 'node',
        style: {
          label: 'data(label)',
          color: '#f8fafc',
          'font-size': 12,
          'text-wrap': 'wrap',
          'text-max-width': '110px',
          'text-valign': 'bottom',
          'text-margin-y': 8,
          width: 54,
          height: 54,
          'background-color': '#475569',
          'border-width': 3,
          'border-color': '#64748b',
        },
      },
      { selector: 'node.input', style: { 'background-color': '#0e7490', 'border-color': '#22d3ee' } },
      { selector: 'node.output', style: { 'background-color': '#047857', 'border-color': '#34d399' } },
      {
        selector: 'edge',
        style: {
          label: 'data(strengthLabel)',
          width: 3,
          'curve-style': 'bezier',
          'target-arrow-shape': 'triangle',
          'line-color': '#22c55e',
          'target-arrow-color': '#22c55e',
          color: '#cbd5e1',
          'font-size': 10,
          'text-background-color': '#020617',
          'text-background-opacity': .82,
          'text-background-padding': '3px',
        },
      },
      { selector: 'edge.negative', style: { 'line-color': '#ef4444', 'target-arrow-color': '#ef4444' } },
    ],
    layout: layoutOptions(selectedLayout.value),
  })
}

function layoutOptions(layout: GraphLayout): cytoscape.LayoutOptions {
  if (layout === 'breadthfirst') {
    return { name: 'breadthfirst', directed: true, roots: graph.value.inputIds, padding: 40, spacingFactor: 1.3 }
  }
  if (layout === 'cose') return { name: 'cose', animate: false, padding: 40 }
  if (layout === 'circle') return { name: 'circle', padding: 40 }
  return { name: 'grid', padding: 40 }
}

function applyLayout() {
  cy?.layout(layoutOptions(selectedLayout.value)).run()
}

function fitGraph() {
  cy?.fit(undefined, 40)
}

function nodeLabel(nodeId: string): string {
  return graph.value.nodes.find(node => node.id === nodeId)?.label ?? nodeId
}

function formatMetric(value: number | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(4) : '제공되지 않음'
}

async function saveToNeo4j() {
  if (!props.sessionId || graph.value.edges.length === 0) return
  savingToNeo4j.value = true
  saveMessage.value = ''
  saveSucceeded.value = false
  try {
    const message = await persistCausalModel(props.sessionId)
    saveSucceeded.value = true
    saveMessage.value = message
  } catch (error) {
    saveMessage.value = error instanceof Error ? error.message : 'Neo4j 저장에 실패했습니다.'
  } finally {
    savingToNeo4j.value = false
  }
}

function destroyGraph() {
  cy?.destroy()
  cy = null
}

onBeforeUnmount(destroyGraph)
</script>

<style scoped>
.causal-discovery { display: grid; gap: 20px; padding: clamp(16px, 2vw, 28px); color: #e2e8f0; }
.page-header h3, h4 { margin: 0; color: #f8fafc; }
.page-header p, .section-header p { margin: 7px 0 0; color: #94a3b8; }
.discovery-options {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 160px auto;
  align-items: end;
  gap: 18px;
  padding: 18px;
  border: 1px solid #334155;
  border-radius: 12px;
  background: #111827;
}
fieldset { display: flex; flex-wrap: wrap; gap: 14px; margin: 0; padding: 0; border: 0; }
legend, .lag-field > span { margin-bottom: 9px; color: #94a3b8; font-size: 12px; font-weight: 700; }
fieldset label { display: inline-flex; align-items: center; gap: 7px; }
.lag-field { display: grid; }
.lag-field input, .graph-controls select {
  min-height: 40px;
  border: 1px solid #475569;
  border-radius: 7px;
  background: #0f172a;
  color: #e2e8f0;
  padding: 0 10px;
}
.primary-button, .save-button {
  min-height: 42px;
  border: 1px solid #0891b2;
  border-radius: 8px;
  background: #0e7490;
  color: white;
  font-weight: 700;
  padding: 0 16px;
  cursor: pointer;
}
button:disabled { cursor: not-allowed; opacity: .48; }
.inline-notice { margin: 0; padding: 12px 14px; border: 1px solid #854d0e; border-radius: 8px; background: rgba(133,77,14,.16); color: #fbbf24; }
.results { display: grid; gap: 18px; }
.summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.summary-grid article { display: grid; gap: 5px; padding: 15px; border: 1px solid #334155; border-radius: 10px; background: #111827; }
.summary-grid span { color: #94a3b8; font-size: 12px; }
.summary-grid strong { font-size: 24px; }
.positive, .save-success { color: #34d399; }
.negative, .save-error { color: #f87171; }
.save-row { display: flex; align-items: center; gap: 14px; }
.graph-section, .relationship-section, .key-variables section, .function-section { overflow: hidden; border: 1px solid #334155; border-radius: 12px; background: #111827; }
.section-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 18px; border-bottom: 1px solid #334155; }
.graph-controls { display: flex; gap: 9px; }
.graph-controls button, .collapse-button { border: 1px solid #475569; border-radius: 7px; background: #1e293b; color: #e2e8f0; padding: 9px 12px; cursor: pointer; }
.graph-canvas { height: clamp(420px, 56vh, 680px); background: #020617; }
.empty-state { display: grid; place-items: center; min-height: 220px; color: #94a3b8; }
.collapse-button { width: 100%; border: 0; border-radius: 0; text-align: left; }
.relationship-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 12px; padding: 16px; }
.relationship-list article { padding: 14px; border: 1px solid #334155; border-left-width: 4px; border-radius: 8px; background: #0f172a; }
.relationship-list .positive-edge { border-left-color: #22c55e; }
.relationship-list .negative-edge { border-left-color: #ef4444; }
.relationship-title { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.relationship-list dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 0; }
.relationship-list dl div { display: grid; gap: 2px; }
dt { color: #64748b; font-size: 11px; } dd { margin: 0; overflow-wrap: anywhere; }
code { display: inline-block; max-width: 100%; overflow-wrap: anywhere; border-radius: 4px; background: #020617; color: #fbbf24; padding: 3px 6px; }
.relationship-list article > code { margin-top: 12px; }
.key-variables { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.key-variables section, .function-section { padding: 16px; }
.key-variables p { color: #94a3b8; }
.variable-list { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.variable-list span { border: 1px solid #475569; border-radius: 999px; background: #1e293b; padding: 6px 10px; font-size: 12px; }
.function-section h4 { margin-bottom: 14px; }
.table-scroll { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 10px 12px; border-bottom: 1px solid #334155; text-align: left; white-space: nowrap; }
th { color: #94a3b8; font-size: 12px; }

@media (max-width: 840px) {
  .discovery-options { grid-template-columns: 1fr; align-items: stretch; }
  .summary-grid, .key-variables { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .section-header { align-items: stretch; flex-direction: column; }
}

@media (max-width: 520px) {
  .summary-grid, .key-variables { grid-template-columns: 1fr; }
  .save-row, .graph-controls { align-items: stretch; flex-direction: column; }
}
</style>
