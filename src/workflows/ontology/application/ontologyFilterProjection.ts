export type OntologyDirectFilters = Record<string, Record<string, unknown>>

export interface OntologyFilterRelationship {
  id: string
  source: string
  target: string
  fromField?: string
  toField?: string
}

export interface OntologyCascadingFilter {
  field: string
  value: unknown
  fromNode: string
  fromField: string
  relationshipId: string
}

export interface OntologyFilterConflict {
  nodeId: string
  field: string
  keptValue: unknown
  rejectedValue: unknown
  fromNode: string
  fromField: string
  relationshipId: string
}

export interface OntologyFilterProjection {
  direct: OntologyDirectFilters
  effective: OntologyDirectFilters
  cascading: Record<string, OntologyCascadingFilter[]>
  conflicts: OntologyFilterConflict[]
}

interface PropagationStep {
  nodeId: string
  field: string
  value: unknown
}

interface PropagationTarget {
  nodeId: string
  field: string
  fromNode: string
  fromField: string
  relationshipId: string
}

export function isActiveOntologyFilterValue(value: unknown): boolean {
  return value !== '' && value !== null && value !== undefined
}

function cloneFilterFields(filters: Record<string, unknown> | undefined) {
  return Object.fromEntries(
    Object.entries(filters ?? {}).filter(([, value]) =>
      isActiveOntologyFilterValue(value)),
  )
}

export function normalizeOntologyDirectFilters(
  filters: OntologyDirectFilters,
): OntologyDirectFilters {
  const normalized: OntologyDirectFilters = {}
  for (const [nodeId, nodeFilters] of Object.entries(filters)) {
    const active = cloneFilterFields(nodeFilters)
    if (Object.keys(active).length > 0) normalized[nodeId] = active
  }
  return normalized
}

export function createOntologyFilterDraft(
  nodeId: string,
  directFilters: OntologyDirectFilters,
): Record<string, unknown> {
  return { ...(directFilters[nodeId] ?? {}) }
}

export function commitOntologyFilterDraft(
  current: OntologyDirectFilters,
  nodeId: string,
  draft: Record<string, unknown>,
): OntologyDirectFilters {
  const next = normalizeOntologyDirectFilters(current)
  const committed = cloneFilterFields(draft)
  if (Object.keys(committed).length === 0) {
    delete next[nodeId]
  } else {
    next[nodeId] = committed
  }
  return next
}

function mappedTargets(
  step: PropagationStep,
  relationships: readonly OntologyFilterRelationship[],
): PropagationTarget[] {
  const targets: PropagationTarget[] = []
  for (const relationship of relationships) {
    if (!relationship.fromField || !relationship.toField) continue
    if (
      relationship.source === step.nodeId
      && relationship.fromField === step.field
    ) {
      targets.push({
        nodeId: relationship.target,
        field: relationship.toField,
        fromNode: step.nodeId,
        fromField: step.field,
        relationshipId: relationship.id,
      })
    }
    if (
      relationship.target === step.nodeId
      && relationship.toField === step.field
    ) {
      targets.push({
        nodeId: relationship.source,
        field: relationship.fromField,
        fromNode: step.nodeId,
        fromField: step.field,
        relationshipId: relationship.id,
      })
    }
  }
  return targets
}

function fieldIdentity(nodeId: string, field: string): string {
  return JSON.stringify([nodeId, field])
}

export function projectOntologyFilters(
  directInput: OntologyDirectFilters,
  relationships: readonly OntologyFilterRelationship[],
): OntologyFilterProjection {
  const direct = normalizeOntologyDirectFilters(directInput)
  const effective: OntologyDirectFilters = {}
  const cascading: Record<string, OntologyCascadingFilter[]> = {}
  const conflicts: OntologyFilterConflict[] = []
  const directFields = new Set<string>()
  const queue: PropagationStep[] = []

  for (const [nodeId, nodeFilters] of Object.entries(direct)) {
    effective[nodeId] = { ...nodeFilters }
    for (const [field, value] of Object.entries(nodeFilters)) {
      directFields.add(fieldIdentity(nodeId, field))
      queue.push({ nodeId, field, value })
    }
  }

  for (let index = 0; index < queue.length; index += 1) {
    const step = queue[index]
    for (const target of mappedTargets(step, relationships)) {
      const targetFilters = effective[target.nodeId] ?? {}
      const currentValue = targetFilters[target.field]
      const identity = fieldIdentity(target.nodeId, target.field)

      if (isActiveOntologyFilterValue(currentValue)) {
        if (!Object.is(currentValue, step.value)) {
          conflicts.push({
            nodeId: target.nodeId,
            field: target.field,
            keptValue: currentValue,
            rejectedValue: step.value,
            fromNode: target.fromNode,
            fromField: target.fromField,
            relationshipId: target.relationshipId,
          })
        }
        continue
      }

      if (directFields.has(identity)) continue
      effective[target.nodeId] = {
        ...targetFilters,
        [target.field]: step.value,
      }
      const item: OntologyCascadingFilter = {
        field: target.field,
        value: step.value,
        fromNode: target.fromNode,
        fromField: target.fromField,
        relationshipId: target.relationshipId,
      }
      cascading[target.nodeId] = [...(cascading[target.nodeId] ?? []), item]
      queue.push({
        nodeId: target.nodeId,
        field: target.field,
        value: step.value,
      })
    }
  }

  return { direct, effective, cascading, conflicts }
}

export function getOntologyNodeFilterChips(
  nodeId: string,
  projection: OntologyFilterProjection,
): Array<{
  label: string
  value: unknown
  type: 'direct' | 'cascade'
  fromNode?: string
}> {
  const direct = Object.entries(projection.direct[nodeId] ?? {}).map(
    ([label, value]) => ({ label, value, type: 'direct' as const }),
  )
  const cascading = (projection.cascading[nodeId] ?? []).map(item => ({
    label: item.field,
    value: item.value,
    type: 'cascade' as const,
    fromNode: item.fromNode,
  }))
  return [...direct, ...cascading]
}
