import type { RegisteredModel } from '../api/whatIfModeling'

export interface ModelMetricEntry {
  key: string
  value: string | number | boolean
}

export interface ModelMetricsProjection {
  entries: ModelMetricEntry[]
  warning: string
}

export interface ModelDeleteTarget {
  modelId: string
  modelName: string
}

export interface ModelDeleteSnapshot {
  schemaId: string
  mode: 'single' | 'all'
  targets: ModelDeleteTarget[]
}

export interface ModelDeleteProjection {
  models: RegisteredModel[]
  failedSnapshot: ModelDeleteSnapshot | null
}

function displayModelName(model: RegisteredModel): string {
  return model.name || model.modelId
}

export function projectModelMetrics(metrics: string): ModelMetricsProjection {
  if (!metrics || metrics.trim() === '{}') return { entries: [], warning: '' }
  try {
    const parsed: unknown = JSON.parse(metrics)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('metrics root is not an object')
    }
    const entries: ModelMetricEntry[] = []
    for (const [key, value] of Object.entries(parsed)) {
      if (
        (typeof value === 'number' && Number.isFinite(value))
        || typeof value === 'string'
        || typeof value === 'boolean'
      ) {
        entries.push({ key, value })
        continue
      }
      throw new Error(`unsupported metric value: ${key}`)
    }
    return { entries, warning: '' }
  } catch {
    return {
      entries: [],
      warning: '검증 메트릭 형식을 해석할 수 없습니다.',
    }
  }
}

export function formatMetricValue(value: ModelMetricEntry['value']): string {
  return typeof value === 'number' ? value.toFixed(4) : String(value)
}

export function shortModelNodeName(name: string): string {
  return name.split('(')[0]?.trim() || ''
}

export function modelStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    trained: '학습 완료',
    pending: '대기',
    training: '학습 중',
    failed: '실패',
    disabled: '비활성',
  }
  return labels[status] || status
}

export function createSingleModelDeleteSnapshot(
  schemaId: string,
  model: RegisteredModel,
): ModelDeleteSnapshot {
  return {
    schemaId,
    mode: 'single',
    targets: [{
      modelId: model.modelId,
      modelName: displayModelName(model),
    }],
  }
}

export function createAllModelsDeleteSnapshot(
  schemaId: string,
  models: readonly RegisteredModel[],
): ModelDeleteSnapshot {
  return {
    schemaId,
    mode: 'all',
    targets: models.map(model => ({
      modelId: model.modelId,
      modelName: displayModelName(model),
    })),
  }
}

export function projectModelDeleteResults(
  models: readonly RegisteredModel[],
  snapshot: ModelDeleteSnapshot,
  succeededIds: ReadonlySet<string>,
  failedTargets: readonly ModelDeleteTarget[],
): ModelDeleteProjection {
  const failedIds = new Set(failedTargets.map(target => target.modelId))
  return {
    models: models.filter(model => !succeededIds.has(model.modelId)),
    failedSnapshot: failedTargets.length
      ? {
          schemaId: snapshot.schemaId,
          mode: snapshot.mode,
          targets: snapshot.targets.filter(target => failedIds.has(target.modelId)),
        }
      : null,
  }
}
