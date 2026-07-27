import type {
  DatasourceMapping,
} from '@/domains/ontology'
import {
  cloneNodeSearchCandidate,
  createDatasourceConfirmationTarget,
  type DatasourceConfirmationTarget,
} from './datasourceConfirmation'

export interface DatasourceMappingNodeSnapshot {
  id: string
  name: string
  layer: string
  description: string
}

export interface DatasourceMappingNodeStatus {
  status: string
  message: string
}

export interface DatasourceLinkingProgress {
  completed: number
  total: number
  currentNode: string
  nodeStatuses: Record<string, DatasourceMappingNodeStatus>
}

export interface DatasourceMappingStats {
  total: number
  found: number
  notFound: number
  error: number
  confirmed: number
}

function cloneMapping(mapping: DatasourceMapping): DatasourceMapping {
  const candidates = mapping.candidates.map(cloneNodeSearchCandidate)
  const selectedCandidate = mapping.selected_candidate
    ? cloneNodeSearchCandidate(mapping.selected_candidate)
    : null
  return {
    ...mapping,
    candidates,
    selected_candidate: selectedCandidate,
  }
}

export function createDatasourceMappingNodeSnapshots(
  nodes: ReadonlyArray<{
    id: string
    name: string
    label: string
    layer?: string
    description?: string
  }>,
): DatasourceMappingNodeSnapshot[] {
  return nodes.map(node => ({
    id: node.id,
    name: node.name,
    layer: node.layer || node.label,
    description: node.description || '',
  }))
}

export function createDatasourceLinkingProgress(
  nodes: readonly DatasourceMappingNodeSnapshot[],
): DatasourceLinkingProgress {
  return {
    completed: 0,
    total: nodes.length,
    currentNode: '',
    nodeStatuses: Object.fromEntries(nodes.map(node => [
      node.id,
      { status: 'pending', message: '대기 중' },
    ])),
  }
}

export function projectDatasourceLinkingProgress(
  current: DatasourceLinkingProgress,
  event: {
    node_id: string
    status: string
    message: string
    completed?: number
  },
): DatasourceLinkingProgress {
  return {
    completed: event.completed ?? current.completed,
    total: current.total,
    currentNode: event.node_id,
    nodeStatuses: {
      ...current.nodeStatuses,
      [event.node_id]: {
        status: event.status,
        message: event.message,
      },
    },
  }
}

export function cloneDatasourceMappings(
  mappings: Readonly<Record<string, DatasourceMapping>>,
): Record<string, DatasourceMapping> {
  return Object.fromEntries(
    Object.entries(mappings).map(([nodeId, mapping]) => [
      nodeId,
      cloneMapping(mapping),
    ]),
  )
}

export function projectConfirmedDatasourceMapping(
  mappings: Readonly<Record<string, DatasourceMapping>>,
  target: DatasourceConfirmationTarget,
): Record<string, DatasourceMapping> {
  const current = mappings[target.nodeId]
  if (!current) return cloneDatasourceMappings(mappings)
  return {
    ...cloneDatasourceMappings(mappings),
    [target.nodeId]: {
      ...cloneMapping(current),
      status: 'confirmed',
      selected_candidate: cloneNodeSearchCandidate(target.candidate),
    },
  }
}

export function datasourceConfirmationTargetKey(
  target: DatasourceConfirmationTarget,
): string {
  const frozen = createDatasourceConfirmationTarget(
    target.nodeId,
    target.candidate,
  )
  return JSON.stringify(frozen)
}

export function sameDatasourceConfirmationTarget(
  left: DatasourceConfirmationTarget,
  right: DatasourceConfirmationTarget,
): boolean {
  return datasourceConfirmationTargetKey(left)
    === datasourceConfirmationTargetKey(right)
}

export function toggleExpandedDatasourceCandidate(
  expanded: ReadonlySet<string>,
  nodeId: string,
  candidateIndex: number,
): Set<string> {
  const key = `${nodeId}-${candidateIndex}`
  const next = new Set(expanded)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  return next
}

export function getDatasourceMappingStats(
  mappings: Readonly<Record<string, DatasourceMapping>>,
): DatasourceMappingStats {
  const values = Object.values(mappings)
  return {
    total: values.length,
    found: values.filter(mapping =>
      mapping.status === 'found' || mapping.status === 'confirmed').length,
    notFound: values.filter(mapping => mapping.status === 'not_found').length,
    error: values.filter(mapping => mapping.status === 'error').length,
    confirmed: values.filter(mapping => mapping.status === 'confirmed').length,
  }
}

export function datasourceMappingStatusIcon(status: string): string {
  switch (status) {
    case 'confirmed': return '✅'
    case 'found': return '🔍'
    case 'not_found': return '❌'
    case 'error': return '⚠️'
    case 'searching': return '⏳'
    default: return '⏸️'
  }
}

export function formatDatasourceSampleValue(value: unknown): string {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'number') return value.toLocaleString('ko-KR')
  if (typeof value === 'string' && value.length > 20) {
    return `${value.substring(0, 20)}...`
  }
  return String(value)
}
