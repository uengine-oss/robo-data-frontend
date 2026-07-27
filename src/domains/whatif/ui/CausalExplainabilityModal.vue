<template>
  <Teleport to="body">
    <div v-if="open" class="modal-root" @click.self="requestClose">
      <section
        ref="modalPanel"
        class="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="causal-modal-title"
        tabindex="-1"
      >
        <header class="modal-header">
          <div>
            <h3 id="causal-modal-title">인과관계 상세 그래프</h3>
            <p>실제 Causal Discovery 응답에 포함된 관계만 표시합니다.</p>
          </div>
          <div class="modal-actions">
            <button type="button" class="secondary-button" :disabled="animating || graph.edges.length === 0" @click="animateGraph">
              {{ animating ? '재생 중…' : '경로 재생' }}
            </button>
            <button ref="closeButton" type="button" class="close-button" aria-label="인과관계 그래프 닫기" @click="requestClose">×</button>
          </div>
        </header>

        <div v-if="graph.edges.length === 0" class="empty-state" role="status">
          표시할 실제 인과관계가 없습니다.
        </div>

        <div v-else class="modal-body">
          <div ref="graphContainer" class="graph-canvas" aria-label="인과관계 그래프"></div>

          <aside class="details-panel">
            <template v-if="selected?.kind === 'node'">
              <span class="detail-kicker">{{ roleLabel(selected.node.role) }}</span>
              <h4>{{ selected.node.label }}</h4>
              <dl>
                <div><dt>변수 ID</dt><dd>{{ selected.node.id }}</dd></div>
                <div><dt>들어오는 관계</dt><dd>{{ selected.node.incomingCount }}</dd></div>
                <div><dt>나가는 관계</dt><dd>{{ selected.node.outgoingCount }}</dd></div>
              </dl>
            </template>

            <template v-else-if="selected?.kind === 'edge'">
              <span class="detail-kicker">인과관계</span>
              <h4>{{ nodeLabel(selected.edge.source) }} → {{ nodeLabel(selected.edge.target) }}</h4>
              <dl>
                <div><dt>방향·강도</dt><dd :class="selected.edge.signedStrength < 0 ? 'negative' : 'positive'">{{ formatSignedStrength(selected.edge.signedStrength) }}</dd></div>
                <div><dt>분석 방법</dt><dd>{{ selected.edge.method || '제공되지 않음' }}</dd></div>
                <div><dt>p-value</dt><dd>{{ formatMetric(selected.edge.p_value) }}</dd></div>
                <div><dt>R²</dt><dd>{{ formatMetric(selected.edge.r_squared) }}</dd></div>
                <div><dt>관계식</dt><dd class="formula">{{ selected.edge.formula || '제공되지 않음' }}</dd></div>
              </dl>

              <div class="prediction-chart">
                <canvas v-if="selectedChart" ref="chartCanvas"></canvas>
                <p v-else>이 관계의 실제 비교 예측 데이터가 제공되지 않았습니다.</p>
              </div>
            </template>

            <div v-else class="selection-hint">
              노드나 연결선을 선택하면 실제 응답의 상세 정보가 표시됩니다.
            </div>
          </aside>
        </div>

        <footer v-if="graph.edges.length > 0" class="legend">
          <span><i class="dot input"></i>원인 변수</span>
          <span><i class="dot intermediate"></i>중간 변수</span>
          <span><i class="dot output"></i>결과 변수</span>
          <span><i class="line positive"></i>양의 영향</span>
          <span><i class="line negative"></i>음의 영향</span>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import Chart from 'chart.js/auto'
import cytoscape from 'cytoscape'
import type { CausalDiscoveryResult, ComparisonResult, PredictionChartData } from '../model/contracts'
import {
  buildExplainabilityGraph,
  formatSignedStrength,
  type CausalNodeRole,
  type ExplainabilityEdge,
  type ExplainabilityNode,
} from '../model/explainability'
import { useDialogFocusLifecycle } from '@/shared/composables/useDialogFocusLifecycle'

const props = defineProps<{
  open: boolean
  causalResult: CausalDiscoveryResult | null
  comparisonResult: ComparisonResult | null
}>()

const emit = defineEmits<{
  (event: 'close'): void
}>()

type SelectedElement =
  | { kind: 'node'; node: ExplainabilityNode }
  | { kind: 'edge'; edge: ExplainabilityEdge }

const graphContainer = ref<HTMLDivElement | null>(null)
const chartCanvas = ref<HTMLCanvasElement | null>(null)
const modalPanel = ref<HTMLElement | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)
const selected = ref<SelectedElement | null>(null)
const selectedChart = ref<PredictionChartData | null>(null)
const animating = ref(false)
const graph = computed(() => props.causalResult
  ? buildExplainabilityGraph(props.causalResult)
  : { nodes: [], edges: [], paths: [], inputIds: [], outputIds: [] })

let cy: cytoscape.Core | null = null
let chart: Chart | null = null
let animationGeneration = 0

function requestClose(): void {
  emit('close')
}

useDialogFocusLifecycle({
  active: () => props.open,
  dialog: modalPanel,
  requestClose,
  initialFocus: () => closeButton.value,
})

watch(
  () => props.open,
  async isOpen => {
    if (!isOpen) {
      disposeVisuals()
      return
    }
    selected.value = null
    selectedChart.value = null
    await nextTick()
    initializeGraph()
  },
)

watch(
  () => props.causalResult,
  async () => {
    if (!props.open) return
    await nextTick()
    initializeGraph()
  },
)

watch(selectedChart, async prediction => {
  destroyChart()
  if (!prediction) return
  await nextTick()
  if (!chartCanvas.value) return
  chart = new Chart(chartCanvas.value, {
    type: 'line',
    data: {
      labels: prediction.labels,
      datasets: [
        {
          label: '실측값',
          data: prediction.actual,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.12)',
          fill: true,
          tension: 0.3,
        },
        {
          label: '인과 예측값',
          data: prediction.causal_predicted,
          borderColor: '#10b981',
          borderDash: [5, 5],
          tension: 0.3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#cbd5e1', boxWidth: 12 } },
      },
      scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,.12)' } },
        y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,.12)' } },
      },
    },
  })
})

function initializeGraph() {
  cy?.destroy()
  cy = null
  if (!graphContainer.value || graph.value.edges.length === 0) return

  const elements: cytoscape.ElementDefinition[] = [
    ...graph.value.nodes.map(node => ({
      data: { ...node },
      classes: node.role,
    })),
    ...graph.value.edges.map(edge => ({
      data: { ...edge },
      classes: edge.signedStrength < 0 ? 'negative' : 'positive',
    })),
  ]

  cy = cytoscape({
    container: graphContainer.value,
    elements,
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
          width: 52,
          height: 52,
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
          width: 3,
          'curve-style': 'bezier',
          'target-arrow-shape': 'triangle',
          'line-color': '#22c55e',
          'target-arrow-color': '#22c55e',
          label: 'data(signedStrength)',
          color: '#cbd5e1',
          'font-size': 10,
          'text-background-color': '#0f172a',
          'text-background-opacity': 0.85,
          'text-background-padding': '3px',
        },
      },
      { selector: 'edge.negative', style: { 'line-color': '#ef4444', 'target-arrow-color': '#ef4444' } },
      { selector: ':selected', style: { 'overlay-color': '#38bdf8', 'overlay-opacity': 0.16, 'overlay-padding': 8 } },
    ],
    layout: {
      name: 'breadthfirst',
      directed: true,
      padding: 48,
      spacingFactor: 1.35,
      roots: graph.value.inputIds,
    },
  })

  cy.edges().forEach(edge => {
    edge.data('signedStrength', formatSignedStrength(Number(edge.data('signedStrength'))))
  })
  cy.on('tap', 'node', (event: cytoscape.EventObjectNode) => selectNode(event.target.id()))
  cy.on('tap', 'edge', (event: cytoscape.EventObjectEdge) => selectEdge(event.target.id()))
}

function selectNode(nodeId: string) {
  const node = graph.value.nodes.find(candidate => candidate.id === nodeId)
  if (!node) return
  selected.value = { kind: 'node', node }
  selectedChart.value = null
}

function selectEdge(edgeId: string) {
  const edge = graph.value.edges.find(candidate => candidate.id === edgeId)
  if (!edge) return
  selected.value = { kind: 'edge', edge }
  selectedChart.value = props.comparisonResult?.prediction_charts?.find(
    prediction => prediction.source === edge.source && prediction.target === edge.target,
  ) ?? null
}

async function animateGraph() {
  if (!cy || animating.value) return
  const generation = ++animationGeneration
  animating.value = true
  cy.elements().style('opacity', 0)

  const roots = graph.value.inputIds.length > 0
    ? graph.value.inputIds
    : graph.value.nodes.filter(node => node.incomingCount === 0).map(node => node.id)
  const initialNodes = roots.length > 0 ? roots : graph.value.nodes.map(node => node.id)

  for (const nodeId of initialNodes) {
    if (generation !== animationGeneration || !cy) return
    await reveal(cy.$id(nodeId), 180)
  }
  for (const edge of graph.value.edges) {
    if (generation !== animationGeneration || !cy) return
    await reveal(cy.$id(edge.id), 180)
    await reveal(cy.$id(edge.target), 140)
  }
  if (generation === animationGeneration) animating.value = false
}

function reveal(element: cytoscape.SingularElementReturnValue, duration: number): Promise<void> {
  return new Promise(resolve => {
    element.animate({ style: { opacity: 1 }, duration, complete: resolve })
  })
}

function nodeLabel(nodeId: string): string {
  return graph.value.nodes.find(node => node.id === nodeId)?.label ?? nodeId
}

function roleLabel(role: CausalNodeRole): string {
  if (role === 'input') return '원인 변수'
  if (role === 'output') return '결과 변수'
  return '중간 변수'
}

function formatMetric(value: number | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(4) : '제공되지 않음'
}

function destroyChart() {
  chart?.destroy()
  chart = null
}

function disposeVisuals() {
  animationGeneration += 1
  animating.value = false
  cy?.destroy()
  cy = null
  destroyChart()
}

onBeforeUnmount(() => {
  disposeVisuals()
})
</script>

<style scoped>
.modal-root {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(2, 6, 23, 0.78);
}

.modal-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(1380px, 96vw);
  height: min(860px, calc(100dvh - 48px));
  overflow: hidden;
  border: 1px solid #334155;
  border-radius: 16px;
  background: #0f172a;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 18px 22px;
  border-bottom: 1px solid #334155;
}

.modal-header h3 { margin: 0; color: #f8fafc; font-size: 20px; }
.modal-header p { margin: 5px 0 0; color: #94a3b8; font-size: 13px; }
.modal-actions { display: flex; align-items: center; gap: 10px; }
.secondary-button, .close-button {
  border: 1px solid #475569;
  border-radius: 8px;
  background: #1e293b;
  color: #e2e8f0;
  cursor: pointer;
}
.secondary-button { padding: 8px 13px; }
.secondary-button:disabled { cursor: not-allowed; opacity: .5; }
.close-button { width: 36px; height: 36px; font-size: 24px; line-height: 1; }

.modal-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  min-height: 0;
  flex: 1;
}
.graph-canvas { min-width: 0; min-height: 0; background: #020617; }
.details-panel {
  overflow: auto;
  padding: 22px;
  border-left: 1px solid #334155;
  background: #111827;
  color: #e2e8f0;
}
.detail-kicker { color: #38bdf8; font-size: 12px; font-weight: 700; letter-spacing: .05em; }
.details-panel h4 { margin: 8px 0 20px; overflow-wrap: anywhere; font-size: 17px; }
.details-panel dl { display: grid; gap: 12px; margin: 0; }
.details-panel dl div { display: grid; gap: 4px; padding-bottom: 10px; border-bottom: 1px solid #263449; }
.details-panel dt { color: #94a3b8; font-size: 12px; }
.details-panel dd { margin: 0; overflow-wrap: anywhere; }
.details-panel .positive { color: #34d399; }
.details-panel .negative { color: #f87171; }
.formula { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
.selection-hint, .empty-state { display: grid; place-items: center; height: 100%; color: #94a3b8; text-align: center; }
.prediction-chart { height: 220px; margin-top: 22px; }
.prediction-chart p { display: grid; place-items: center; height: 100%; margin: 0; color: #94a3b8; font-size: 13px; text-align: center; }
.legend { display: flex; flex-wrap: wrap; gap: 18px; padding: 12px 22px; border-top: 1px solid #334155; color: #cbd5e1; font-size: 12px; }
.legend span { display: inline-flex; align-items: center; gap: 7px; }
.dot { width: 10px; height: 10px; border-radius: 50%; background: #64748b; }
.dot.input { background: #22d3ee; }
.dot.output { background: #34d399; }
.line { width: 20px; height: 3px; background: #22c55e; }
.line.negative { background: #ef4444; }

@media (max-width: 900px) {
  .modal-root { padding: 8px; }
  .modal-panel { width: 100%; height: 96vh; }
  .modal-body { grid-template-columns: 1fr; grid-template-rows: minmax(360px, 1fr) auto; overflow: auto; }
  .graph-canvas { min-height: 420px; }
  .details-panel { max-height: 300px; border-top: 1px solid #334155; border-left: 0; }
  .modal-header p { display: none; }
}
</style>
