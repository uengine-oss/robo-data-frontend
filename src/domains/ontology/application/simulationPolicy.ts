import type {
  CreateScenarioProfileRequest,
  SimulateResponse,
  SimulationTrace,
  TimelineEntry,
} from '../api/whatIfModeling'

export type WhatIfFilters = Record<string, Record<string, unknown>>

export interface ChangedSimulationVariable {
  key: string
  original: number
  current: number
}

export interface SimulationIntervention {
  nodeId: string
  field: string
  value: number
  description: string
}

export interface SimulationRequestSnapshot {
  schemaId: string
  scenarioName: string
  interventions: SimulationIntervention[]
  snapshotDate: string
  filters: WhatIfFilters
}

export interface ProfileSaveSnapshot {
  request: CreateScenarioProfileRequest
  resultExecutedAt: string
}

export interface SimulationDeltaRow {
  key: string
  rawField: string
  fieldLabel: string
  nodeLabel: string
  baseline: number
  predicted: number
  delta: number
  pct: number
}

function cloneUnknown(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneUnknown)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneUnknown(item)]),
    )
  }
  return value
}

export function cloneWhatIfFilters(filters?: WhatIfFilters): WhatIfFilters {
  return (cloneUnknown(filters ?? {}) as WhatIfFilters)
}

export function whatIfFilterFingerprint(filters?: WhatIfFilters): string {
  function normalize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(normalize)
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => [key, normalize(item)]),
      )
    }
    return value
  }
  return JSON.stringify(normalize(filters ?? {}))
}

export function projectChangedSimulationVariables(
  original: Readonly<Record<string, number>>,
  editable: Readonly<Record<string, number>>,
): ChangedSimulationVariable[] {
  const changed: ChangedSimulationVariable[] = []
  for (const [key, current] of Object.entries(editable)) {
    const initial = original[key]
    if (
      initial !== undefined
      && Number.isFinite(current)
      && Math.abs(current - initial) > 1e-6
    ) {
      changed.push({ key, original: initial, current })
    }
  }
  return changed
}

export function createSimulationInterventions(
  changedVariables: readonly ChangedSimulationVariable[],
): SimulationIntervention[] {
  return changedVariables.map(variable => {
    const separator = variable.key.indexOf('::')
    const nodeId = separator < 0 ? '' : variable.key.slice(0, separator)
    const field = separator < 0 ? '' : variable.key.slice(separator + 2)
    if (!nodeId || !field || field.includes('::')) {
      throw new Error(`시뮬레이션 변수 키가 nodeId::field 형식이 아닙니다: ${variable.key}`)
    }
    if (!Number.isFinite(variable.original) || !Number.isFinite(variable.current)) {
      throw new Error(`시뮬레이션 변수 값이 유한한 숫자가 아닙니다: ${variable.key}`)
    }
    return {
      nodeId,
      field,
      value: variable.current,
      description: `${field}: ${variable.original} → ${variable.current}`,
    }
  })
}

export function createSimulationRequestSnapshot(input: {
  schemaId: string
  snapshotDate: string
  filters?: WhatIfFilters
  changedVariables: readonly ChangedSimulationVariable[]
}): SimulationRequestSnapshot {
  if (!input.schemaId || !input.snapshotDate) {
    throw new Error('시뮬레이션 schema와 snapshot date가 필요합니다.')
  }
  const interventions = createSimulationInterventions(input.changedVariables)
  if (!interventions.length) {
    throw new Error('최소 1개 이상의 값을 변경해주세요.')
  }
  return {
    schemaId: input.schemaId,
    scenarioName: `What-if @ ${input.snapshotDate}`,
    interventions,
    snapshotDate: input.snapshotDate,
    filters: cloneWhatIfFilters(input.filters),
  }
}

export function createProfileSaveSnapshot(input: {
  name: string
  description: string
  result: SimulateResponse
}): ProfileSaveSnapshot {
  const name = input.name.trim()
  if (!name) throw new Error('프로필 이름을 입력해주세요.')
  const result = input.result
  const request: CreateScenarioProfileRequest = {
    name,
    ...(input.description.trim() ? { description: input.description.trim() } : {}),
    schemaId: result.schema_id,
    interventions: result.interventions.map(intervention => ({
      nodeId: intervention.node_id,
      field: intervention.field,
      value: intervention.value,
      ...(intervention.description
        ? { description: intervention.description }
        : {}),
    })),
    last_simulation_results: {
      final_state: { ...result.final_state },
      baseline_state: { ...result.baseline_state },
      deltas: { ...result.deltas },
      propagation_waves: result.propagation_waves,
      executed_at: result.executed_at,
      traces: result.traces.map(trace => ({
        ...trace,
        inputs: { ...trace.inputs },
        triggered_by: [...trace.triggered_by],
      })),
    },
    outputFields: Object.entries(result.final_state).map(([key, value]) => ({
      key,
      label: key.replace('::', ' → '),
      lastValue: value,
      baselineValue: result.baseline_state[key] ?? null,
    })),
  }
  return {
    request,
    resultExecutedAt: result.executed_at,
  }
}

export function dedupeSimulationTraces(
  traces: readonly SimulationTrace[],
): SimulationTrace[] {
  const seen = new Set<string>()
  return traces.filter(trace => {
    if (seen.has(trace.model_id)) return false
    seen.add(trace.model_id)
    return true
  })
}

export function simulationTimelineDays(
  timeline: Readonly<Record<string, TimelineEntry[]>>,
): number[] {
  return Object.keys(timeline)
    .map(Number)
    .filter(Number.isInteger)
    .sort((left, right) => left - right)
}

export function dedupeSimulationTimeline(
  entries: readonly TimelineEntry[],
): TimelineEntry[] {
  const seen = new Set<string>()
  return entries.filter(entry => {
    if (seen.has(entry.model_id)) return false
    seen.add(entry.model_id)
    return true
  })
}

export function projectSimulationDeltas(
  result: SimulateResponse,
  fieldLabel: (key: string) => string,
  nodeLabel: (key: string) => string,
): SimulationDeltaRow[] {
  return Object.entries(result.deltas)
    .map(([key, delta]) => {
      const baseline = result.baseline_state[key] ?? 0
      const predicted = result.final_state[key] ?? 0
      return {
        key,
        rawField: key.split('::').pop() || key,
        fieldLabel: fieldLabel(key),
        nodeLabel: nodeLabel(key),
        baseline,
        predicted,
        delta,
        pct: baseline === 0 ? 0 : (delta / baseline) * 100,
      }
    })
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta))
}
