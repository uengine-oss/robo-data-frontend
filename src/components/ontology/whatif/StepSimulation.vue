<script setup lang="ts">
/**
 * StepSimulation.vue (Redesigned)
 * 
 * 시점 기반 스냅샷 + 단일 변수 변경 + 증분 전파 애니메이션 + Lag 타임라인
 * 
 * 1. 시계열 라인차트에서 날짜 클릭 → 스냅샷 로드
 * 2. 스냅샷의 특정 값 하나만 수정
 * 3. 시뮬레이션 실행 → 모델 체인 단계별 애니메이션
 * 4. Day 0, +1, +2 별 결과 리포트
 */
import { ref, computed, onMounted } from 'vue'
import { VueFlow, type Node, type Edge } from '@vue-flow/core'
import {
  whatifDomainApi,
  type SnapshotResponse,
  type SimulateResponse,
  type SimulationTrace,
  type TimelineEntry,
} from '@/services/whatif-domain-api'

const props = defineProps<{
  schemaId: string
  loading: boolean
  filters?: Record<string, Record<string, any>>
}>()

// ── State ──
const isLoadingSnapshot = ref(false)
const isSimulating = ref(false)
const error = ref('')

// Snapshot data
const snapshotData = ref<SnapshotResponse | null>(null)
const selectedDate = ref<string>('')
const availableDates = ref<string[]>([])

// 시계열 변수 목록 (차트 표시용)
const timeseriesKeys = computed(() => {
  if (!snapshotData.value?.timeseries) return []
  return Object.keys(snapshotData.value.timeseries).filter(k => k !== 'dates')
})

// 스냅샷 값 (편집 가능)
const editableSnapshot = ref<Record<string, number>>({})
const originalSnapshot = ref<Record<string, number>>({})

// 변경된 변수 추적
const changedVars = computed(() => {
  const changed: Array<{ key: string; original: number; current: number }> = []
  for (const [key, val] of Object.entries(editableSnapshot.value)) {
    const orig = originalSnapshot.value[key]
    if (orig !== undefined && Math.abs(val - orig) > 1e-6) {
      changed.push({ key, original: orig, current: val })
    }
  }
  return changed
})

// 시뮬레이션 결과
const simResult = ref<SimulateResponse | null>(null)

// 애니메이션 상태
const animationStep = ref(-1) // -1 = 미시작, 0+ = 현재 표시 중인 trace index
const isAnimating = ref(false)

// Timeline days (정렬됨)
const timelineDays = computed(() => {
  if (!simResult.value?.timeline) return []
  return Object.keys(simResult.value.timeline)
    .map(Number)
    .sort((a, b) => a - b)
})

// ── VueFlow DAG ──
// 3종류 노드: 입력변수(주황), 모델(보라), 출력변수(초록/빨강)
// 같은 입력변수는 1개 노드에서 여러 모델로 분기

const dagNodes = computed<Node[]>(() => {
  if (!simResult.value?.traces) return []

  const nodes: Node[] = []
  const addedInputs = new Set<string>()
  const addedModels = new Set<string>()
  const addedOutputs = new Set<string>()

  // 중복 모델 제거
  const seen = new Set<string>()
  const traces = simResult.value.traces.filter(t => {
    if (seen.has(t.model_id)) return false
    seen.add(t.model_id)
    return Math.abs(t.delta) > 1e-6
  })

  // wave별 모델 수 카운트 (Y 위치 결정)
  const waveModelCount = new Map<number, number>()

  for (const t of traces) {
    const wave = t.wave
    const yIdx = waveModelCount.get(wave) || 0
    waveModelCount.set(wave, yIdx + 1)

    const modelX = 300 + wave * 500
    const modelY = yIdx * 140 + 40

    // 1) 입력 변수 노드 (유니크 — 한 번만 생성)
    for (const tv of t.triggered_by) {
      if (!addedInputs.has(tv)) {
        addedInputs.add(tv)
        const val = (simResult.value!.final_state as Record<string, number>)[tv]
          ?? (simResult.value!.baseline_state as Record<string, number>)[tv] ?? 0
        nodes.push({
          id: `in-${tv}`,
          position: { x: 20, y: modelY },
          data: { label: `${shortKey(tv)}\n${val.toFixed(2)}` },
          style: {
            background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
            border: 'none', borderRadius: '12px',
            padding: '10px 16px', color: '#78350f',
            fontSize: '12px', fontWeight: '700',
            boxShadow: '0 4px 12px rgba(245,158,11,0.3)',
            whiteSpace: 'pre-line', textAlign: 'center',
            minWidth: '120px',
          },
        })
      }
    }

    // 2) 모델 노드
    if (!addedModels.has(t.model_id)) {
      addedModels.add(t.model_id)
      nodes.push({
        id: `mdl-${t.model_id}`,
        position: { x: modelX, y: modelY },
        data: { label: t.model_name },
        style: {
          background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
          border: 'none', borderRadius: '14px',
          padding: '14px 20px', color: '#fff',
          fontSize: '13px', fontWeight: '700',
          boxShadow: '0 6px 20px rgba(99,102,241,0.4)',
          textAlign: 'center', minWidth: '140px',
        },
      })
    }

    // 3) 출력 변수 노드
    const outKey = t.output_field
    if (!addedOutputs.has(outKey)) {
      addedOutputs.add(outKey)
      const isUp = t.delta > 0
      const bg = isUp ? 'linear-gradient(135deg, #dcfce7, #bbf7d0)' : 'linear-gradient(135deg, #fef2f2, #fecaca)'
      const color = isUp ? '#166534' : '#991b1b'
      const shadow = isUp ? '0 4px 12px rgba(34,197,94,0.2)' : '0 4px 12px rgba(239,68,68,0.2)'
      const border = isUp ? '2px solid #22c55e' : '2px solid #ef4444'
      const pctStr = `${isUp ? '⬆' : '⬇'} ${t.pct_change > 0 ? '+' : ''}${t.pct_change.toFixed(1)}%`

      nodes.push({
        id: `out-${outKey}`,
        position: { x: modelX + 220, y: modelY },
        data: { label: `${shortKey(outKey)}\n${t.baseline_value.toFixed(1)} → ${t.predicted_value.toFixed(1)}\n${pctStr}` },
        style: {
          background: bg, border, borderRadius: '12px',
          padding: '10px 14px', color,
          fontSize: '11px', fontWeight: '700',
          boxShadow: shadow,
          whiteSpace: 'pre-line', textAlign: 'center',
          minWidth: '140px',
        },
      })
    }
  }

  return nodes
})

const dagEdges = computed<Edge[]>(() => {
  if (!simResult.value?.traces) return []

  const edges: Edge[] = []
  const addedEdges = new Set<string>()

  const seen = new Set<string>()
  const traces = simResult.value.traces.filter(t => {
    if (seen.has(t.model_id)) return false
    seen.add(t.model_id)
    return Math.abs(t.delta) > 1e-6
  })

  // 어떤 output이 어떤 out-노드에 매핑되는지
  const outputToOutNode = new Map<string, string>()
  for (const t of traces) {
    outputToOutNode.set(t.output_field, `out-${t.output_field}`)
  }

  for (const t of traces) {
    // 입력 → 모델
    for (const tv of t.triggered_by) {
      // tv가 다른 모델의 출력이면 out-노드에서, 아니면 in-노드에서
      const sourceId = outputToOutNode.has(tv) ? outputToOutNode.get(tv)! : `in-${tv}`
      const edgeKey = `${sourceId}-mdl-${t.model_id}`
      if (!addedEdges.has(edgeKey)) {
        addedEdges.add(edgeKey)
        edges.push({
          id: edgeKey,
          source: sourceId,
          target: `mdl-${t.model_id}`,
          animated: true,
          style: { stroke: '#f59e0b', strokeWidth: 2.5 },
          type: 'smoothstep',
        })
      }
    }

    // 모델 → 출력
    const outEdgeKey = `mdl-${t.model_id}-out-${t.output_field}`
    if (!addedEdges.has(outEdgeKey)) {
      addedEdges.add(outEdgeKey)
      edges.push({
        id: outEdgeKey,
        source: `mdl-${t.model_id}`,
        target: `out-${t.output_field}`,
        animated: true,
        style: { stroke: t.delta > 0 ? '#22c55e' : '#ef4444', strokeWidth: 2.5 },
        type: 'smoothstep',
      })
    }
  }

  return edges
})

// 중복 제거된 traces (model_id 유니크)
const uniqueTraces = computed(() => {
  if (!simResult.value?.traces) return []
  const seen = new Set<string>()
  return simResult.value.traces.filter(t => {
    if (seen.has(t.model_id)) return false
    seen.add(t.model_id)
    return true
  })
})

// timeline 내 중복 제거
function deduplicatedTimeline(day: number) {
  const entries = simResult.value?.timeline?.[String(day)] || []
  const seen = new Set<string>()
  return entries.filter(e => {
    if (seen.has(e.model_id)) return false
    seen.add(e.model_id)
    return true
  })
}

// DAG 노드 클래스 (애니메이션 상태)
function dagNodeClass(trace: SimulationTrace, idx: number) {
  if (animationStep.value < 0) return 'idle'
  if (idx <= animationStep.value) return trace.delta > 0.01 ? 'done-positive' : trace.delta < -0.01 ? 'done-negative' : 'done-neutral'
  return 'idle'
}

// 최종 요약 테이블 데이터 (delta 크기 순 정렬)
const sortedDeltas = computed(() => {
  if (!simResult.value) return []
  const rows: Array<{ key: string; rawField: string; fieldLabel: string; nodeLabel: string; baseline: number; predicted: number; delta: number; pct: number }> = []
  for (const [key, delta] of Object.entries(simResult.value.deltas)) {
    const baseline = simResult.value.baseline_state[key] || 0
    const predicted = (simResult.value.final_state as Record<string, number>)[key] || 0
    const pct = baseline !== 0 ? (delta / baseline) * 100 : 0
    const rawField = key.split('::').pop() || key
    rows.push({
      key,
      rawField,
      fieldLabel: shortKey(key),
      nodeLabel: shortNodeName(key),
      baseline,
      predicted,
      delta,
      pct,
    })
  }
  return rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
})

// ── 초기 로드 ──
onMounted(async () => {
  await loadSnapshot()
})

async function loadSnapshot(date?: string) {
  isLoadingSnapshot.value = true
  error.value = ''
  try {
    snapshotData.value = await whatifDomainApi.getSnapshot(
      props.schemaId, date || undefined, props.filters || undefined
    )
    selectedDate.value = snapshotData.value.date
    availableDates.value = snapshotData.value.available_dates
    // 스냅샷 값을 editable로 복사
    originalSnapshot.value = { ...snapshotData.value.snapshot }
    editableSnapshot.value = { ...snapshotData.value.snapshot }
    // 결과 초기화
    simResult.value = null
    animationStep.value = -1
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    isLoadingSnapshot.value = false
  }
}

function onDateSelect(date: string) {
  loadSnapshot(date)
}

function resetSnapshot() {
  editableSnapshot.value = { ...originalSnapshot.value }
}

// ── 시뮬레이션 실행 ──
async function runSimulation() {
  if (changedVars.value.length === 0) {
    error.value = '최소 1개 이상의 값을 변경해주세요.'
    return
  }

  isSimulating.value = true
  isAnimating.value = true
  animationStep.value = -1
  simResult.value = null
  error.value = ''

  try {
    const interventions = changedVars.value.map(cv => {
      const [nodeId, field] = cv.key.split('::')
      return { nodeId, field, value: cv.current, description: `${field}: ${cv.original} → ${cv.current}` }
    })

    simResult.value = await whatifDomainApi.simulate(
      props.schemaId,
      `What-if @ ${selectedDate.value}`,
      interventions,
    )

    // 애니메이션 시작 — trace를 0.5초 간격으로 하나씩 표시
    if (simResult.value.traces.length > 0) {
      animationStep.value = 0
      for (let i = 1; i <= simResult.value.traces.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 500))
        animationStep.value = i
      }
    }
    isAnimating.value = false
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : String(e)
    isAnimating.value = false
  } finally {
    isSimulating.value = false
  }
}

// ── 프로필 저장 ──
const showProfileForm = ref(false)
const profileName = ref('')
const profileDescription = ref('')
const isSavingProfile = ref(false)
const profileSaveMessage = ref<{ type: 'success' | 'error', text: string } | null>(null)

async function saveAsProfile() {
  if (!profileName.value || !simResult.value || !props.schemaId) return

  isSavingProfile.value = true
  profileSaveMessage.value = null

  try {
    const interventions = changedVars.value.map(cv => {
      const [nodeId, field] = cv.key.split('::')
      return { nodeId, field, value: cv.current, description: `${field}: ${cv.original} → ${cv.current}` }
    })

    // outputFields 생성: 시뮬레이션 결과의 final_state 키들을 출력 필드로 매핑
    const outputFields = Object.entries(simResult.value.final_state || {}).map(([key, value]) => ({
      key,
      label: key.replace('::', ' → '),
      lastValue: value,
      baselineValue: (simResult.value!.baseline_state || {})[key] ?? null,
    }))

    const response = await whatifDomainApi.createScenarioProfile({
      name: profileName.value,
      description: profileDescription.value || undefined,
      schemaId: props.schemaId,
      interventions,
      last_simulation_results: {
        final_state: simResult.value.final_state,
        baseline_state: simResult.value.baseline_state,
        deltas: simResult.value.deltas,
        propagation_waves: simResult.value.propagation_waves,
        executed_at: simResult.value.executed_at,
        traces: simResult.value.traces,
      },
      outputFields,
    })

    profileSaveMessage.value = {
      type: 'success',
      text: `✅ 프로필 "${response.name}"이(가) 저장되었습니다. Watch Agent에서 사용할 수 있습니다.`
    }
    
    // 3초 후 폼 숨기기
    setTimeout(() => {
      showProfileForm.value = false
      profileSaveMessage.value = null
      profileName.value = ''
      profileDescription.value = ''
    }, 3000)
  } catch (e: unknown) {
    profileSaveMessage.value = {
      type: 'error',
      text: `❌ 저장 실패: ${e instanceof Error ? e.message : String(e)}`
    }
  } finally {
    isSavingProfile.value = false
  }
}

// ── 헬퍼 ──
function fieldLabel(fieldName: string): string {
  const raw = fieldName.includes('::') ? fieldName.split('::').pop()! : fieldName
  return snapshotData.value?.field_descriptions?.[raw] || raw
}

function shortKey(key: string): string {
  // "nodeId::field" → description or raw field
  const raw = key.split('::').pop() || key
  return snapshotData.value?.field_descriptions?.[raw] || raw
}

function shortNodeName(key: string): string {
  // snapshotByNode에서 노드 이름 찾기
  const nodeId = key.split('::')[0]
  const nodeInfo = snapshotData.value?.snapshot_by_node?.[nodeId]
  if (nodeInfo?.nodeName) {
    const name = nodeInfo.nodeName
    const p = name.indexOf('(')
    return p > 0 ? name.slice(0, p).trim() : name
  }
  return nodeId.split('_').pop() || nodeId
}

function deltaIcon(delta: number): string {
  if (delta > 0.01) return '⬆'
  if (delta < -0.01) return '⬇'
  return '━'
}

function deltaClass(delta: number): string {
  if (delta > 0.01) return 'positive'
  if (delta < -0.01) return 'negative'
  return 'neutral'
}

// 차트 데이터 (간소화 — 날짜별 값을 SVG polyline으로 그리기)
const chartWidth = 700
const chartHeight = 120
const chartPadding = 30

function getChartPath(varKey: string): string {
  const ts = snapshotData.value?.timeseries
  if (!ts || !ts.dates || !ts[varKey]) return ''
  const values = ts[varKey] as number[]
  const n = values.length
  if (n < 2) return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const points = values.map((v, i) => {
    const x = chartPadding + (i / (n - 1)) * (chartWidth - 2 * chartPadding)
    const y = chartHeight - chartPadding - ((v - min) / range) * (chartHeight - 2 * chartPadding)
    return `${x},${y}`
  })
  return points.join(' ')
}

function getSelectedDateX(): number {
  const dates = snapshotData.value?.timeseries?.dates as string[] | undefined
  if (!dates) return 0
  const idx = dates.indexOf(selectedDate.value)
  if (idx < 0) return 0
  return chartPadding + (idx / (dates.length - 1)) * (chartWidth - 2 * chartPadding)
}

function onChartClick(event: MouseEvent) {
  const target = event.currentTarget as SVGElement
  const rect = target.getBoundingClientRect()
  const x = event.clientX - rect.left
  const dates = snapshotData.value?.timeseries?.dates as string[] | undefined
  if (!dates || dates.length < 2) return
  const ratio = (x - chartPadding) / (chartWidth - 2 * chartPadding)
  const idx = Math.round(Math.max(0, Math.min(dates.length - 1, ratio * (dates.length - 1))))
  onDateSelect(dates[idx])
}

// 차트 색상 (변수별)
const chartColors = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#8b5cf6', '#14b8a6']
function getColor(i: number): string {
  return chartColors[i % chartColors.length]
}
</script>

<template>
  <div class="step-simulation">
    <div v-if="isLoadingSnapshot" class="loading-center">
      <div class="spinner"></div>
      <p>스냅샷 로드 중...</p>
    </div>

    <div v-if="error" class="error-msg">{{ error }}</div>

    <template v-if="snapshotData && !isLoadingSnapshot">
      <!-- ═══ 1. 시계열 차트 ═══ -->
      <div class="chart-section">
        <div class="chart-header">
          <h5>📈 시계열 데이터</h5>
          <span class="date-badge">선택 시점: {{ selectedDate }}</span>
          <select class="date-select" v-model="selectedDate" @change="onDateSelect(selectedDate)">
            <option v-for="d in availableDates" :key="d" :value="d">{{ d }}</option>
          </select>
        </div>
        <svg
          class="ts-chart"
          :viewBox="`0 0 ${chartWidth} ${chartHeight}`"
          @click="onChartClick"
        >
          <!-- 라인들 -->
          <polyline
            v-for="(varKey, i) in timeseriesKeys.slice(0, 6)"
            :key="varKey"
            :points="getChartPath(varKey)"
            fill="none"
            :stroke="getColor(i)"
            stroke-width="1.5"
            opacity="0.7"
          />
          <!-- 선택 시점 수직선 -->
          <line
            :x1="getSelectedDateX()" :y1="5"
            :x2="getSelectedDateX()" :y2="chartHeight - 5"
            stroke="#fff" stroke-width="1.5" stroke-dasharray="4"
          />
          <circle :cx="getSelectedDateX()" :cy="10" r="4" fill="#6366f1" />
        </svg>
        <!-- 범례 -->
        <div class="chart-legend">
          <span v-for="(varKey, i) in timeseriesKeys.slice(0, 6)" :key="varKey" class="legend-item">
            <span class="legend-dot" :style="{ background: getColor(i) }"></span>
            {{ shortKey(varKey) }}
          </span>
        </div>
      </div>

      <!-- ═══ 2. 스냅샷 파라미터 카드 ═══ -->
      <div class="snapshot-section">
        <div class="snapshot-header">
          <h5>📋 {{ selectedDate }} 시점 스냅샷</h5>
          <button class="reset-btn" @click="resetSnapshot" v-if="changedVars.length > 0">↩ 초기화</button>
        </div>

        <div class="snapshot-cards">
          <div
            v-for="(nodeInfo, nodeId) in snapshotData.snapshot_by_node"
            :key="nodeId"
            class="node-card"
          >
            <div class="node-card-header">{{ nodeInfo.nodeName.split('(')[0].trim() }}</div>
            <div class="node-card-fields">
              <div
                v-for="(val, fieldName) in nodeInfo.fields"
                :key="`${nodeId}::${fieldName}`"
                class="field-row"
                :class="{ changed: Math.abs((editableSnapshot[`${nodeId}::${fieldName}`] || 0) - (originalSnapshot[`${nodeId}::${fieldName}`] || 0)) > 1e-6 }"
              >
                <label class="field-label" :title="String(fieldName)">{{ fieldLabel(String(fieldName)) }}</label>
                <input
                  type="number"
                  step="any"
                  class="field-input"
                  :value="editableSnapshot[`${nodeId}::${fieldName}`]"
                  @input="(e) => editableSnapshot[`${nodeId}::${fieldName}`] = parseFloat((e.target as HTMLInputElement).value) || 0"
                />
                <span class="field-original" v-if="Math.abs((editableSnapshot[`${nodeId}::${fieldName}`] || 0) - (originalSnapshot[`${nodeId}::${fieldName}`] || 0)) > 1e-6">
                  원래: {{ typeof val === 'number' ? val.toFixed(2) : val }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- 변경 요약 + 실행 버튼 -->
        <div class="action-row">
          <div v-if="changedVars.length > 0" class="changes-summary">
            <span class="changes-badge">{{ changedVars.length }}개 변수 변경됨</span>
            <span v-for="cv in changedVars" :key="cv.key" class="change-tag">
              {{ shortKey(cv.key) }}: {{ cv.original.toFixed(2) }} → {{ cv.current.toFixed(2) }}
            </span>
          </div>
          <button
            class="run-btn"
            @click="runSimulation"
            :disabled="isSimulating || changedVars.length === 0"
          >
            {{ isSimulating ? '⏳ 실행 중...' : '🚀 시뮬레이션 실행' }}
          </button>
        </div>
      </div>

      <!-- ═══ 3. 결과: DAG + 실행 로그 + 요약 테이블 ═══ -->
      <div v-if="simResult" class="result-section">

        <!-- ① DAG 모델 체인 시각화 (VueFlow) -->
        <div class="dag-section">
          <h5>🔗 모델 체인 DAG ({{ simResult.propagation_waves }}단계 전파)</h5>
          <div class="dag-canvas">
            <VueFlow
              :nodes="dagNodes"
              :edges="dagEdges"
              :default-viewport="{ x: 10, y: 10, zoom: 0.85 }"
              fit-view-on-init
              :nodes-draggable="true"
              :nodes-connectable="false"
              :zoom-on-scroll="true"
              :pan-on-scroll="true"
              :default-edge-options="{ type: 'smoothstep', animated: true }"
            />
          </div>
        </div>

        <!-- ② 컴팩트 실행 로그 -->
        <details class="exec-log-section" open>
          <summary class="log-toggle">📋 실행 로그</summary>
          <div class="exec-log">
            <template v-for="day in timelineDays" :key="day">
              <div class="log-day-header">
                {{ day === 0 ? 'Day 0 (즉시)' : `Day +${day}` }}
              </div>
              <div
                v-for="entry in deduplicatedTimeline(day)"
                :key="`${day}-${entry.model_id}`"
                class="log-entry"
              >
                <span class="log-trigger" :title="entry.triggered_by.join(', ')">
                  {{ entry.triggered_by.map(t => shortKey(t)).join(', ') }}
                </span>
                <span class="log-arrow">→</span>
                <span class="log-model">{{ entry.model_name }}</span>
                <span class="log-arrow">→</span>
                <span class="log-output" :title="entry.output_field">{{ shortKey(entry.output_field) }}:</span>
                <span class="log-values">
                  {{ entry.baseline_value.toFixed(2) }} → {{ entry.predicted_value.toFixed(2) }}
                </span>
                <span class="log-delta" :class="deltaClass(entry.delta)">
                  {{ deltaIcon(entry.delta) }}{{ entry.pct_change > 0 ? '+' : '' }}{{ entry.pct_change.toFixed(1) }}%
                </span>
              </div>
            </template>
          </div>
        </details>

        <!-- ③ 최종 변화 요약 테이블 -->
        <div v-if="Object.keys(simResult.deltas).length > 0" class="summary-section">
          <h6>📊 최종 변화 요약</h6>
          <table class="summary-table">
            <thead>
              <tr>
                <th>항목</th>
                <th>소속</th>
                <th class="num">변경 전</th>
                <th class="num">변경 후</th>
                <th class="num">변화량</th>
                <th class="num">변화율</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in sortedDeltas"
                :key="row.key"
                :class="deltaClass(row.delta)"
              >
                <td class="item-name" :title="row.rawField">{{ row.fieldLabel }}</td>
                <td class="item-node">{{ row.nodeLabel }}</td>
                <td class="num">{{ row.baseline.toFixed(2) }}</td>
                <td class="num" :class="deltaClass(row.delta)">{{ row.predicted.toFixed(2) }}</td>
                <td class="num" :class="deltaClass(row.delta)">{{ row.delta > 0 ? '+' : '' }}{{ row.delta.toFixed(2) }}</td>
                <td class="num pct" :class="deltaClass(row.delta)">
                  {{ deltaIcon(row.delta) }} {{ row.pct > 0 ? '+' : '' }}{{ row.pct.toFixed(1) }}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- ④ 프로필로 저장 -->
        <div class="save-profile-section">
          <div class="save-profile-header">
            <h6>💾 Watch Agent 프로필로 저장</h6>
            <p class="save-hint">이 시뮬레이션 시나리오를 Watch Agent에서 감시 데이터 소스로 사용할 수 있습니다.</p>
          </div>
          <div v-if="!showProfileForm" class="save-profile-actions">
            <button class="save-profile-btn" @click="showProfileForm = true">
              🔮 프로필로 저장
            </button>
          </div>
          <div v-else class="profile-form">
            <div class="form-field">
              <label>프로필 이름</label>
              <input v-model="profileName" type="text" placeholder="예: 비용 상승 시뮬레이션" class="form-input" />
            </div>
            <div class="form-field">
              <label>설명</label>
              <input v-model="profileDescription" type="text" placeholder="시나리오 설명 (선택)" class="form-input" />
            </div>
            <div class="form-actions">
              <button class="cancel-btn" @click="showProfileForm = false">취소</button>
              <button 
                class="confirm-save-btn" 
                @click="saveAsProfile" 
                :disabled="!profileName || isSavingProfile"
              >
                {{ isSavingProfile ? '저장 중...' : '저장' }}
              </button>
            </div>
            <div v-if="profileSaveMessage" class="save-message" :class="profileSaveMessage.type">
              {{ profileSaveMessage.text }}
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.step-simulation { max-width: 1100px; }

.loading-center { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 40px;
  .spinner { width: 32px; height: 32px; border: 3px solid var(--color-border); border-top-color: #6366f1; border-radius: 50%; animation: spin 0.8s linear infinite; }
}
@keyframes spin { to { transform: rotate(360deg); } }
.error-msg { padding: 12px; background: #fef2f2; border: 1px solid #fca5a5; border-radius: 8px; color: #dc2626; margin-bottom: 12px; }

/* ═══ 1. 시계열 차트 ═══ */
.chart-section {
  margin-bottom: 16px; background: var(--color-bg-secondary); border-radius: 10px; padding: 12px; border: 1px solid var(--color-border);
  .chart-header { display: flex; align-items: center; gap: 12px; margin-bottom: 8px;
    h5 { margin: 0; font-size: 0.9rem; color: var(--color-text-bright); }
    .date-badge { padding: 3px 10px; background: #6366f1; color: #fff; border-radius: 10px; font-size: 0.75rem; font-weight: 600; }
    .date-select { margin-left: auto; padding: 4px 8px; border: 1px solid var(--color-border); border-radius: 6px; background: var(--color-bg); color: var(--color-text); font-size: 0.75rem; }
  }
}
.ts-chart { width: 100%; height: 120px; cursor: crosshair; background: rgba(0,0,0,0.15); border-radius: 6px; }
.chart-legend { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 6px;
  .legend-item { display: flex; align-items: center; gap: 4px; font-size: 0.7rem; color: var(--color-text-muted); }
  .legend-dot { width: 8px; height: 8px; border-radius: 50%; }
}

/* ═══ 2. 스냅샷 ═══ */
.snapshot-section { margin-bottom: 16px; }
.snapshot-header { display: flex; align-items: center; gap: 12px; margin-bottom: 10px;
  h5 { margin: 0; font-size: 0.9rem; color: var(--color-text-bright); }
  .reset-btn { padding: 4px 12px; background: none; border: 1px solid var(--color-border); border-radius: 6px; color: var(--color-text-muted); font-size: 0.75rem; cursor: pointer;
    &:hover { border-color: #f59e0b; color: #f59e0b; }
  }
}
.snapshot-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; }
.node-card {
  background: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: 8px; overflow: hidden;
  .node-card-header { padding: 6px 12px; background: var(--color-bg-tertiary); font-size: 0.75rem; font-weight: 600; color: var(--color-text-bright); }
  .node-card-fields { padding: 6px 12px; }
}
.field-row {
  display: flex; align-items: center; gap: 6px; padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,0.04);
  &.changed { background: rgba(99, 102, 241, 0.08); border-radius: 4px; padding: 3px 6px; margin: 0 -6px;
    .field-input { border-color: #6366f1; color: #a5b4fc; }
  }
  .field-label { font-size: 0.7rem; color: var(--color-text-muted); min-width: 90px; }
  .field-input { width: 80px; padding: 2px 6px; border: 1px solid var(--color-border); border-radius: 4px; background: var(--color-bg); color: var(--color-text); font-size: 0.75rem; text-align: right; font-family: monospace; }
  .field-original { font-size: 0.65rem; color: #f59e0b; }
}

.action-row { display: flex; align-items: center; gap: 12px; margin-top: 12px; flex-wrap: wrap; }
.changes-summary { display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  .changes-badge { padding: 3px 10px; background: rgba(99,102,241,0.2); color: #a5b4fc; border-radius: 10px; font-size: 0.75rem; font-weight: 600; }
  .change-tag { padding: 2px 8px; background: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: 6px; font-size: 0.7rem; color: var(--color-text); font-family: monospace; }
}
.run-btn {
  padding: 10px 28px; background: #6366f1; color: #fff; border: none; border-radius: 8px;
  cursor: pointer; font-weight: 600; font-size: 0.9rem; margin-left: auto;
  &:disabled { opacity: 0.4; cursor: not-allowed; }
  &:hover:not(:disabled) { background: #4f46e5; }
}

/* ═══ 3. 결과 ═══ */
.result-section { h5, h6 { margin: 0 0 12px; font-size: 0.95rem; color: var(--color-text-bright); } }

/* ① DAG 체인 시각화 (VueFlow) */
.dag-section {
  margin-bottom: 16px; background: var(--color-bg-secondary); border-radius: 10px; border: 1px solid var(--color-border); padding: 12px;
}
.dag-canvas {
  height: 400px;
  border-radius: 10px;
  overflow: hidden;
  background: linear-gradient(135deg, rgba(15,15,35,0.6), rgba(20,20,50,0.4));
  border: 1px solid rgba(99,102,241,0.15);
}
.dag-canvas :deep(.vue-flow__node) {
  cursor: default;
}
.dag-canvas :deep(.vue-flow__edge-path) {
  stroke-linecap: round;
}
.dag-canvas :deep(.vue-flow__background) {
  background: transparent;
}

/* ② 컴팩트 실행 로그 */
.exec-log-section { margin-bottom: 16px; }
.log-toggle { font-size: 0.85rem; color: var(--color-text-muted); cursor: pointer; padding: 4px 0; &:hover { color: var(--color-text-bright); } }
.exec-log { margin-top: 8px; }
.log-day-header {
  font-size: 0.75rem; font-weight: 700; color: var(--color-text-bright);
  padding: 4px 8px; background: var(--color-bg-tertiary); border-radius: 4px; margin: 6px 0 2px;
}
.log-entry {
  display: flex; align-items: center; gap: 4px; padding: 3px 8px 3px 16px; font-size: 0.75rem;
  border-left: 2px solid var(--color-border);
  .log-trigger { color: #f59e0b; font-weight: 600; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .log-arrow { color: var(--color-text-muted); }
  .log-model { color: #a5b4fc; font-weight: 600; }
  .log-output { color: var(--color-text-bright); font-weight: 600; }
  .log-values { color: var(--color-text-muted); font-family: monospace; font-size: 0.7rem; }
  .log-delta { font-weight: 700; font-size: 0.7rem; margin-left: auto;
    &.positive { color: #22c55e; }
    &.negative { color: #ef4444; }
    &.neutral { color: var(--color-text-muted); }
  }
}

/* ③ 요약 테이블 */
.summary-section {
  margin-top: 16px; padding: 14px; background: var(--color-bg-secondary); border-radius: 10px; border: 1px solid var(--color-border);
}
.summary-table {
  width: 100%; border-collapse: collapse; font-size: 0.8rem;
  th { background: var(--color-bg-tertiary); padding: 8px; text-align: left; font-weight: 600;
       border-bottom: 2px solid var(--color-border); color: var(--color-text-bright);
       &.num { text-align: right; }
  }
  td { padding: 6px 8px; border-bottom: 1px solid var(--color-border);
    &.num { text-align: right; font-family: monospace; }
    &.pct { font-weight: 700; }
  }
  tr.positive td.num { &.positive, &.pct { color: #22c55e; } }
  tr.negative td.num { &.negative, &.pct { color: #ef4444; } }
  .item-name { font-weight: 600; color: var(--color-text-bright); }
  .item-node { font-size: 0.7rem; color: var(--color-text-muted); }
}

/* ═══ 4. 프로필 저장 ═══ */
.save-profile-section {
  margin-top: 16px;
  padding: 16px;
  background: var(--color-bg-secondary);
  border-radius: 10px;
  border: 1px solid var(--color-border);
  border-left: 3px solid #a855f7;
}

.save-profile-header {
  h6 { margin: 0 0 4px; font-size: 0.9rem; color: var(--color-text-bright); }
  .save-hint { font-size: 0.75rem; color: var(--color-text-muted); margin: 0 0 12px; }
}

.save-profile-btn {
  padding: 10px 24px;
  background: linear-gradient(135deg, #a855f7, #7c3aed);
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.85rem;
  transition: all 0.2s ease;
  &:hover { background: linear-gradient(135deg, #9333ea, #6d28d9); transform: translateY(-1px); box-shadow: 0 4px 12px rgba(168, 85, 247, 0.3); }
}

.profile-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.form-field {
  label { display: block; font-size: 0.75rem; font-weight: 600; color: var(--color-text-bright); margin-bottom: 4px; }
  .form-input {
    width: 100%;
    padding: 8px 12px;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    color: var(--color-text);
    font-size: 0.85rem;
    box-sizing: border-box;
    &:focus { border-color: #a855f7; outline: none; box-shadow: 0 0 0 2px rgba(168, 85, 247, 0.15); }
  }
}

.form-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 4px;
}

.cancel-btn {
  padding: 8px 16px;
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text-muted);
  font-size: 0.8rem;
  cursor: pointer;
  &:hover { border-color: var(--color-text); color: var(--color-text); }
}

.confirm-save-btn {
  padding: 8px 20px;
  background: #a855f7;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.8rem;
  cursor: pointer;
  &:disabled { opacity: 0.5; cursor: not-allowed; }
  &:hover:not(:disabled) { background: #9333ea; }
}

.save-message {
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 0.8rem;
  &.success { background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3); color: #22c55e; }
  &.error { background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444; }
}
</style>
