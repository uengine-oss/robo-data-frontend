<script setup lang="ts">
/**
 * StepSimulation.vue (Redesigned)
 * 
 * 시점 기반 스냅샷 + 변수 변경 + 모델 전파 결과 + Lag 타임라인
 * 
 * 1. 시계열 라인차트에서 날짜 클릭 → 스냅샷 로드
 * 2. 스냅샷의 특정 값 하나만 수정
 * 3. 시뮬레이션 실행 → 모델 체인 결과
 * 4. Day 0, +1, +2 별 결과 리포트
 */
import { computed, toRef } from 'vue'
import { VueFlow, type Node, type Edge } from '@vue-flow/core'
import { useWhatIfSimulation } from '../../../application/useWhatIfSimulation'
import {
  dedupeSimulationTimeline,
  dedupeSimulationTraces,
  projectSimulationDeltas,
  simulationTimelineDays,
  type WhatIfFilters,
} from '../../../application/simulationPolicy'

const props = defineProps<{
  schemaId: string
  loading: boolean
  filters?: WhatIfFilters
}>()

const {
  snapshotData,
  selectedDate,
  availableDates,
  originalSnapshot,
  editableSnapshot,
  changedVariables: changedVars,
  snapshotPending: isLoadingSnapshot,
  snapshotError,
  snapshotCanRetry,
  simulationResult: simResult,
  simulationPending: isSimulating,
  simulationError,
  simulationCanRetry,
  showZeroDeltaTraces,
  showProfileForm,
  profileName,
  profileDescription,
  profilePending: isSavingProfile,
  profileError,
  profileSuccess,
  profileCanRetry,
  loadSnapshot,
  retrySnapshot,
  setSnapshotValue,
  resetSnapshot,
  runSimulation,
  retrySimulation,
  openProfileEditor,
  closeProfileEditor,
  saveProfile: saveAsProfile,
} = useWhatIfSimulation({
  schemaId: toRef(props, 'schemaId'),
  filters: toRef(props, 'filters'),
})

// 시계열 변수 목록 (차트 표시용)
const timeseriesKeys = computed(() => {
  if (!snapshotData.value?.timeseries) return []
  return Object.keys(snapshotData.value.timeseries).filter(k => k !== 'dates')
})

// Timeline days (정렬됨)
const timelineDays = computed(() => {
  if (!simResult.value?.timeline) return []
  return simulationTimelineDays(simResult.value.timeline)
})

const allDagTraces = computed(() => {
  if (!simResult.value?.traces) return []
  return dedupeSimulationTraces(simResult.value.traces)
})

const impactDagTraces = computed(() => (
  allDagTraces.value.filter(t => Math.abs(t.delta) > 1e-6)
))

const zeroDeltaTraceCount = computed(() => (
  allDagTraces.value.filter(t => Math.abs(t.delta) <= 1e-6).length
))

const visibleDagTraces = computed(() => (
  showZeroDeltaTraces.value ? allDagTraces.value : impactDagTraces.value
))

const dagEmptyMessage = computed(() => {
  if (!simResult.value) return ''
  if (allDagTraces.value.length === 0) {
    return '실행된 모델 trace가 없습니다.'
  }
  if (impactDagTraces.value.length === 0 && !showZeroDeltaTraces.value) {
    return '모델은 실행됐지만 전파 결과 변화가 0이라 DAG에 표시할 항목이 없습니다.'
  }
  return ''
})

// ── VueFlow DAG ──
// 3종류 노드: 입력변수(주황), 모델(보라), 출력변수(초록/빨강)
// 같은 입력변수는 1개 노드에서 여러 모델로 분기

const dagNodes = computed<Node[]>(() => {
  const result = simResult.value
  if (!result || visibleDagTraces.value.length === 0) return []

  const nodes: Node[] = []
  const addedInputs = new Set<string>()
  const addedModels = new Set<string>()
  const addedOutputs = new Set<string>()

  // wave별 모델 수 카운트 (Y 위치 결정)
  const waveModelCount = new Map<number, number>()

  for (const t of visibleDagTraces.value) {
    const wave = t.wave
    const yIdx = waveModelCount.get(wave) || 0
    waveModelCount.set(wave, yIdx + 1)

    const modelX = 300 + wave * 500
    const modelY = yIdx * 140 + 40

    // 1) 입력 변수 노드 (유니크 — 한 번만 생성)
    for (const tv of t.triggered_by) {
      if (!addedInputs.has(tv)) {
        addedInputs.add(tv)
        const val = result.final_state[tv] ?? result.baseline_state[tv] ?? 0
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
      const isNeutral = Math.abs(t.delta) <= 1e-6
      const isUp = t.delta > 0
      const bg = isNeutral
        ? 'linear-gradient(135deg, #e5e7eb, #d1d5db)'
        : isUp ? 'linear-gradient(135deg, #dcfce7, #bbf7d0)' : 'linear-gradient(135deg, #fef2f2, #fecaca)'
      const color = isNeutral ? '#374151' : isUp ? '#166534' : '#991b1b'
      const shadow = isNeutral
        ? '0 4px 12px rgba(107,114,128,0.18)'
        : isUp ? '0 4px 12px rgba(34,197,94,0.2)' : '0 4px 12px rgba(239,68,68,0.2)'
      const border = isNeutral ? '2px solid #9ca3af' : isUp ? '2px solid #22c55e' : '2px solid #ef4444'
      const pctStr = isNeutral
        ? '변화 없음'
        : `${isUp ? '⬆' : '⬇'} ${t.pct_change > 0 ? '+' : ''}${t.pct_change.toFixed(1)}%`

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
  if (visibleDagTraces.value.length === 0) return []

  const edges: Edge[] = []
  const addedEdges = new Set<string>()

  // 어떤 output이 어떤 out-노드에 매핑되는지
  const outputToOutNode = new Map<string, string>()
  for (const t of visibleDagTraces.value) {
    outputToOutNode.set(t.output_field, `out-${t.output_field}`)
  }

  for (const t of visibleDagTraces.value) {
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
      const stroke = Math.abs(t.delta) <= 1e-6 ? '#9ca3af' : t.delta > 0 ? '#22c55e' : '#ef4444'
      edges.push({
        id: outEdgeKey,
        source: `mdl-${t.model_id}`,
        target: `out-${t.output_field}`,
        animated: true,
        style: { stroke, strokeWidth: 2.5 },
        type: 'smoothstep',
      })
    }
  }

  return edges
})

// timeline 내 중복 제거
function deduplicatedTimeline(day: number) {
  const entries = simResult.value?.timeline?.[String(day)] || []
  return dedupeSimulationTimeline(entries)
}

// 최종 요약 테이블 데이터 (delta 크기 순 정렬)
const sortedDeltas = computed(() => {
  if (!simResult.value) return []
  return projectSimulationDeltas(simResult.value, shortKey, shortNodeName)
})

function onDateSelect(date: string) {
  void loadSnapshot(date)
}

function onDateChange(event: Event): void {
  const target = event.target
  if (target instanceof HTMLSelectElement) onDateSelect(target.value)
}

function onSnapshotInput(key: string, event: Event): void {
  const target = event.target
  if (target instanceof HTMLInputElement) setSnapshotValue(key, target.value)
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
  if (!ts) return ''
  const series = ts[varKey]
  if (!series || !series.every((value): value is number => typeof value === 'number')) {
    return ''
  }
  const values = series
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
  const dates = snapshotData.value?.timeseries?.dates
  if (!dates) return 0
  const idx = dates.indexOf(selectedDate.value)
  if (idx < 0) return 0
  return chartPadding + (idx / (dates.length - 1)) * (chartWidth - 2 * chartPadding)
}

function onChartClick(event: MouseEvent) {
  const target = event.currentTarget as SVGElement
  const rect = target.getBoundingClientRect()
  const x = event.clientX - rect.left
  const dates = snapshotData.value?.timeseries?.dates
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
    <div v-if="isLoadingSnapshot && !snapshotData" class="loading-center" role="status">
      <div class="spinner"></div>
      <p>스냅샷 로드 중...</p>
    </div>

    <div v-if="snapshotError" class="operation-status error-msg" role="alert">
      <span>{{ snapshotError }}</span>
      <button
        v-if="snapshotCanRetry"
        type="button"
        class="status-action"
        :disabled="isLoadingSnapshot"
        @click="retrySnapshot"
      >
        같은 스냅샷 다시 시도
      </button>
    </div>

    <div v-if="simulationError" class="operation-status error-msg" role="alert">
      <span>{{ simulationError }}</span>
      <button
        v-if="simulationCanRetry"
        type="button"
        class="status-action"
        :disabled="isSimulating"
        @click="retrySimulation"
      >
        같은 요청 다시 시도
      </button>
    </div>

    <div
      v-if="isLoadingSnapshot && snapshotData"
      class="refresh-status"
      role="status"
    >
      선택한 시점의 스냅샷을 갱신하고 있습니다…
    </div>

    <template v-if="snapshotData">
      <!-- ═══ 1. 시계열 차트 ═══ -->
      <div class="chart-section">
        <div class="chart-header">
          <h5>📈 시계열 데이터</h5>
          <span class="date-badge">선택 시점: {{ selectedDate }}</span>
          <label class="sr-only" for="whatif-snapshot-date">스냅샷 시점</label>
          <select
            id="whatif-snapshot-date"
            class="date-select"
            :value="selectedDate"
            :disabled="isLoadingSnapshot || isSimulating"
            @change="onDateChange"
          >
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
          <button
            v-if="changedVars.length > 0"
            type="button"
            class="reset-btn"
            :disabled="isLoadingSnapshot || isSimulating"
            @click="resetSnapshot"
          >
            ↩ 초기화
          </button>
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
                <label
                  class="field-label"
                  :for="`whatif-field-${nodeId}-${String(fieldName)}`"
                  :title="String(fieldName)"
                >
                  {{ fieldLabel(String(fieldName)) }}
                </label>
                <input
                  :id="`whatif-field-${nodeId}-${String(fieldName)}`"
                  type="number"
                  step="any"
                  class="field-input"
                  :value="editableSnapshot[`${nodeId}::${fieldName}`]"
                  :disabled="isLoadingSnapshot || isSimulating"
                  @input="onSnapshotInput(`${nodeId}::${String(fieldName)}`, $event)"
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
            type="button"
            class="run-btn"
            :disabled="
              isLoadingSnapshot
                || isSimulating
                || (!simulationCanRetry && changedVars.length === 0)
            "
            @click="simulationCanRetry ? retrySimulation() : runSimulation()"
          >
            {{
              isSimulating
                ? '⏳ 실행 중...'
                : simulationCanRetry
                  ? '같은 요청 다시 시도'
                  : '🚀 시뮬레이션 실행'
            }}
          </button>
        </div>
      </div>

      <!-- ═══ 3. 결과: DAG + 실행 로그 + 요약 테이블 ═══ -->
      <div v-if="simResult" class="result-section">

        <!-- ① DAG 모델 체인 시각화 (VueFlow) -->
        <div class="dag-section">
          <h5>🔗 모델 체인 DAG ({{ simResult.propagation_waves }}단계 전파)</h5>
          <div v-if="allDagTraces.length > 0" class="dag-toolbar">
            <span class="dag-meta">
              {{ visibleDagTraces.length }}개 표시 / {{ allDagTraces.length }}개 실행
            </span>
            <label v-if="zeroDeltaTraceCount > 0" class="dag-toggle">
              <input v-model="showZeroDeltaTraces" type="checkbox" />
              변화 없는 실행도 보기 ({{ zeroDeltaTraceCount }}건)
            </label>
          </div>
          <div class="dag-canvas">
            <div v-if="dagEmptyMessage" class="dag-empty-state">
              <p>{{ dagEmptyMessage }}</p>
              <button
                v-if="zeroDeltaTraceCount > 0 && !showZeroDeltaTraces"
                type="button"
                class="dag-empty-btn"
                @click="showZeroDeltaTraces = true"
              >
                변화 없는 실행 보기
              </button>
            </div>
            <VueFlow
              v-else
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
                  {{ Math.abs(entry.delta) <= 1e-6 ? '변화 없음 0.0%' : `${deltaIcon(entry.delta)}${entry.pct_change > 0 ? '+' : ''}${entry.pct_change.toFixed(1)}%` }}
                </span>
              </div>
            </template>
          </div>
        </details>

        <!-- ③ 최종 변화 요약 테이블 -->
        <div v-if="Object.keys(simResult.deltas).length > 0" class="summary-section">
          <h6>📊 최종 변화 요약</h6>
          <div class="summary-table-scroll" tabindex="0" aria-label="최종 변화 요약 표">
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
        </div>

        <!-- ④ 프로필로 저장 -->
        <div class="save-profile-section">
          <div class="save-profile-header">
            <h6>💾 Watch Agent 프로필로 저장</h6>
            <p class="save-hint">이 시뮬레이션 시나리오를 Watch Agent에서 감시 데이터 소스로 사용할 수 있습니다.</p>
          </div>
          <div v-if="!showProfileForm" class="save-profile-actions">
            <button type="button" class="save-profile-btn" @click="openProfileEditor">
              🔮 프로필로 저장
            </button>
          </div>
          <div v-else class="profile-form">
            <div class="form-field">
              <label for="whatif-profile-name">프로필 이름</label>
              <input
                id="whatif-profile-name"
                v-model="profileName"
                type="text"
                placeholder="예: 비용 상승 시뮬레이션"
                class="form-input"
                :disabled="isSavingProfile || Boolean(profileSuccess)"
              />
            </div>
            <div class="form-field">
              <label for="whatif-profile-description">설명</label>
              <input
                id="whatif-profile-description"
                v-model="profileDescription"
                type="text"
                placeholder="시나리오 설명 (선택)"
                class="form-input"
                :disabled="isSavingProfile || Boolean(profileSuccess)"
              />
            </div>
            <div v-if="profileError" class="save-message error" role="alert">
              {{ profileError }}
            </div>
            <div v-if="profileSuccess" class="save-message success" role="status">
              {{ profileSuccess }}
            </div>
            <div class="form-actions">
              <button
                type="button"
                class="cancel-btn"
                :disabled="isSavingProfile"
                @click="closeProfileEditor"
              >
                취소
              </button>
              <button
                type="button"
                class="confirm-save-btn"
                :disabled="!profileName.trim() || isSavingProfile || Boolean(profileSuccess)"
                @click="saveAsProfile"
              >
                {{
                  isSavingProfile
                    ? '저장 중...'
                    : profileCanRetry
                      ? '같은 요청 다시 시도'
                      : '저장'
                }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.step-simulation {
  width: 100%;
  max-width: 1100px;
  min-width: 0;
}

.loading-center { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 40px;
  .spinner { width: 32px; height: 32px; border: 3px solid var(--color-border); border-top-color: #6366f1; border-radius: 50%; animation: spin 0.8s linear infinite; }
}
@keyframes spin { to { transform: rotate(360deg); } }
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.operation-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.error-msg { padding: 12px; background: #fef2f2; border: 1px solid #fca5a5; border-radius: 8px; color: #dc2626; margin-bottom: 12px; }
.status-action {
  flex: none;
  min-height: 34px;
  padding: 6px 12px;
  border: 1px solid currentColor;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font-weight: 600;
  cursor: pointer;
  &:disabled { opacity: 0.5; cursor: wait; }
}
.refresh-status {
  padding: 8px 12px;
  margin-bottom: 12px;
  border: 1px solid rgba(99, 102, 241, 0.35);
  border-radius: 8px;
  background: rgba(99, 102, 241, 0.1);
  color: var(--color-text);
  font-size: 0.8rem;
}

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
.dag-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin: -4px 0 10px;
  flex-wrap: wrap;
}
.dag-meta {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}
.dag-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  color: var(--color-text);
  cursor: pointer;
  input { accent-color: #6366f1; }
}
.dag-canvas {
  height: 400px;
  border-radius: 10px;
  overflow: hidden;
  background: linear-gradient(135deg, rgba(15,15,35,0.6), rgba(20,20,50,0.4));
  border: 1px solid rgba(99,102,241,0.15);
}
.dag-empty-state {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px;
  text-align: center;
  color: var(--color-text-muted);
  p {
    margin: 0;
    max-width: 420px;
    line-height: 1.5;
  }
}
.dag-empty-btn {
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid rgba(99,102,241,0.35);
  background: rgba(99,102,241,0.16);
  color: var(--color-text-bright);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  &:hover {
    background: rgba(99,102,241,0.24);
  }
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
.summary-table-scroll {
  max-width: 100%;
  overflow-x: auto;
  border-radius: 6px;
  &:focus-visible {
    outline: 2px solid #6366f1;
    outline-offset: 2px;
  }
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
  &:disabled { opacity: 0.5; cursor: wait; }
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
  &:disabled { opacity: 0.5; cursor: wait; }
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

@media (max-width: 720px) {
  .operation-status {
    align-items: stretch;
    flex-direction: column;
  }

  .status-action {
    width: 100%;
    min-height: 44px;
  }

  .chart-section {
    .chart-header {
      align-items: stretch;
      flex-direction: column;

      .date-badge {
        align-self: flex-start;
      }

      .date-select {
        width: 100%;
        min-height: 40px;
        margin-left: 0;
      }
    }
  }

  .snapshot-header {
    align-items: flex-start;
    justify-content: space-between;
  }

  .snapshot-cards {
    grid-template-columns: minmax(0, 1fr);
  }

  .field-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(80px, 110px);
    align-items: center;

    .field-label {
      min-width: 0;
      overflow-wrap: anywhere;
    }

    .field-input {
      width: 100%;
      min-height: 36px;
      box-sizing: border-box;
    }

    .field-original {
      grid-column: 1 / -1;
    }
  }

  .action-row {
    align-items: stretch;
    flex-direction: column;
  }

  .run-btn {
    width: 100%;
    min-height: 44px;
    margin-left: 0;
  }

  .dag-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .dag-canvas {
    height: 300px;
  }

  .log-entry {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 4px 8px;
    padding: 8px;

    .log-trigger,
    .log-model,
    .log-output,
    .log-values {
      min-width: 0;
      max-width: none;
      overflow-wrap: anywhere;
      white-space: normal;
    }

    .log-arrow {
      display: none;
    }

    .log-delta {
      grid-column: 2;
      grid-row: 1 / span 4;
      align-self: center;
      margin-left: 0;
    }
  }

  .summary-section,
  .save-profile-section {
    padding: 12px;
  }

  .summary-table {
    min-width: 680px;
  }

  .save-profile-btn {
    width: 100%;
    min-height: 44px;
  }

  .form-actions {
    flex-direction: column-reverse;

    button {
      width: 100%;
      min-height: 44px;
    }
  }
}
</style>
