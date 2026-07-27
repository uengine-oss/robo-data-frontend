import type {
  DatasourceMapping,
  NodeSearchCandidate,
  OntologyDataSourceSchema,
} from '@/domains/ontology'

export interface DatasourceConfirmationTarget {
  nodeId: string
  candidate: NodeSearchCandidate
}

export interface DatasourceConfirmationAttempt {
  nodeId: string
  ok: boolean
  error?: string
}

export interface BulkDatasourceConfirmationResult {
  succeededNodeIds: string[]
  failedTargets: DatasourceConfirmationTarget[]
  errors: Record<string, string>
}

export function cloneNodeSearchCandidate(
  candidate: NodeSearchCandidate,
): NodeSearchCandidate {
  return {
    ...candidate,
    columns: [...candidate.columns],
    sample_data: candidate.sample_data.map(row => ({ ...row })),
  }
}

export function createDatasourceConfirmationTarget(
  nodeId: string,
  candidate: NodeSearchCandidate,
): DatasourceConfirmationTarget {
  return {
    nodeId,
    candidate: cloneNodeSearchCandidate(candidate),
  }
}

export function projectConfirmedDatasourceSchema(
  candidate: NodeSearchCandidate,
): OntologyDataSourceSchema {
  const columns = candidate.columns
    .map(column => column.trim())
    .filter(column => column.length > 0)

  return {
    ...(columns.length > 0 ? { columns: [...new Set(columns)] } : {}),
    sql: candidate.suggested_sql || '',
    row_count:
      typeof candidate.row_count === 'number' && candidate.row_count > 0
        ? candidate.row_count
        : 0,
    datasource: candidate.datasource || '',
  }
}

export function createBulkDatasourceConfirmationTargets(
  mappings: Readonly<Record<string, DatasourceMapping>>,
): DatasourceConfirmationTarget[] {
  return Object.entries(mappings)
    .filter(([, mapping]) => mapping.status !== 'confirmed' && mapping.selected_candidate)
    .map(([nodeId, mapping]) =>
      createDatasourceConfirmationTarget(nodeId, mapping.selected_candidate!))
}

export function projectBulkDatasourceConfirmation(
  targets: readonly DatasourceConfirmationTarget[],
  attempts: readonly DatasourceConfirmationAttempt[],
): BulkDatasourceConfirmationResult {
  const attemptByNode = new Map(attempts.map(attempt => [attempt.nodeId, attempt]))
  const succeededNodeIds: string[] = []
  const failedTargets: DatasourceConfirmationTarget[] = []
  const errors: Record<string, string> = {}

  for (const target of targets) {
    const attempt = attemptByNode.get(target.nodeId)
    if (attempt?.ok) {
      succeededNodeIds.push(target.nodeId)
      continue
    }

    failedTargets.push(createDatasourceConfirmationTarget(
      target.nodeId,
      target.candidate,
    ))
    errors[target.nodeId] = attempt?.error || '데이터 소스 확정에 실패했습니다.'
  }

  return {
    succeededNodeIds,
    failedTargets,
    errors,
  }
}
