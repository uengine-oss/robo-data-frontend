import type { GraphLink, GraphNode } from '@/shared/types'

export const INPUT_RELS: ReadonlySet<string> = new Set(['READS'])
export const OUTPUT_RELS: ReadonlySet<string> = new Set(['WRITES'])
export const CALL_RELS: ReadonlySet<string> = new Set(['CALLS'])
export const HAS_RELS: ReadonlySet<string> = new Set([
  'PARENT_OF', 'HAS_COLUMN', 'HAS_RULE',
])
export const ROUTINE_LABELS: ReadonlySet<string> = new Set([
  'PROCEDURE', 'FUNCTION', 'METHOD', 'TRIGGER',
])
export const DATA_MEMBER_LABELS: ReadonlySet<string> = new Set([
  'VARIABLE', 'CONSTANT', 'FIELD', 'MEMBER', 'GLOBAL_VARIABLE',
  'PARAMETER', 'PACKAGE_VARIABLE', 'CURSOR_VARIABLE', 'DEFINE', 'CONSTANT_FIELD',
])
export const FK_RELS: ReadonlySet<string> = new Set(['FK'])
export const UML_RELS: ReadonlySet<string> = new Set(['EXTENDS', 'IMPLEMENTS'])
export const EXCLUDED_RELS: ReadonlySet<string> = new Set(['NEXT'])

export interface RelationshipGroups {
  inputs: GraphLink[]
  outputs: GraphLink[]
  calls: GraphLink[]
  attached: GraphLink[]
  fk: GraphLink[]
  uml: GraphLink[]
  variableRefs: GraphLink[]
  incomingCalls: GraphLink[]
  incomingInputs: GraphLink[]
  incomingOutputs: GraphLink[]
}

export const EMPTY_GROUPS: RelationshipGroups = {
  inputs: [],
  outputs: [],
  calls: [],
  attached: [],
  fk: [],
  uml: [],
  variableRefs: [],
  incomingCalls: [],
  incomingInputs: [],
  incomingOutputs: [],
}

export function getRelationshipGroups(
  nodeId: string,
  links: Iterable<GraphLink>,
): RelationshipGroups {
  const groups: RelationshipGroups = {
    inputs: [],
    outputs: [],
    calls: [],
    attached: [],
    fk: [],
    uml: [],
    variableRefs: [],
    incomingCalls: [],
    incomingInputs: [],
    incomingOutputs: [],
  }

  for (const link of links) {
    const outgoing = link.source === nodeId
    const incoming = link.target === nodeId
    if (!outgoing && !incoming) continue

    if (FK_RELS.has(link.type)) {
      groups.fk.push(link)
      continue
    }
    if (UML_RELS.has(link.type)) {
      groups.uml.push(link)
      continue
    }
    if (EXCLUDED_RELS.has(link.type)) continue

    if (outgoing) {
      if (INPUT_RELS.has(link.type)) groups.inputs.push(link)
      else if (OUTPUT_RELS.has(link.type)) groups.outputs.push(link)
      else if (CALL_RELS.has(link.type)) groups.calls.push(link)
      else if (HAS_RELS.has(link.type)) groups.attached.push(link)
      else if (link.type === 'REFERENCES' || link.type === 'INIT_BY') {
        groups.variableRefs.push(link)
      }
    }
    if (incoming) {
      if (INPUT_RELS.has(link.type)) groups.incomingInputs.push(link)
      else if (OUTPUT_RELS.has(link.type)) groups.incomingOutputs.push(link)
      else if (CALL_RELS.has(link.type)) groups.incomingCalls.push(link)
    }
  }

  return groups
}

export function getAttachedByType(
  groups: RelationshipGroups,
  relType: string,
): GraphLink[] {
  return groups.attached.filter(link => link.type === relType)
}

export function getMembersByLabels(
  groups: RelationshipGroups,
  nodes: Map<string, GraphNode>,
  labels: ReadonlySet<string>,
): GraphLink[] {
  return groups.attached.filter(link => {
    if (link.type !== 'PARENT_OF') return false
    const node = nodes.get(link.target)
    return Boolean(node && node.labels.some(label => labels.has(label)))
  })
}

export interface SemanticRule {
  node: GraphNode
}

export interface SemanticReport {
  rules: SemanticRule[]
}

export const EMPTY_SEMANTIC_REPORT: SemanticReport = { rules: [] }

export function getSemanticReport(
  nodeId: string,
  links: Iterable<GraphLink>,
  nodes: Map<string, GraphNode>,
): SemanticReport {
  const selected = nodes.get(nodeId)
  const isRoutine = Boolean(
    selected?.labels.some(label => ROUTINE_LABELS.has(label)),
  )
  const prefix = `${nodeId}:`
  const rules: SemanticRule[] = []
  const seen = new Set<string>()

  for (const link of links) {
    if (link.type !== 'HAS_RULE') continue
    const belongsToSelection = link.source === nodeId
      || (isRoutine && link.source.startsWith(prefix))
    if (!belongsToSelection || seen.has(link.target)) continue
    const node = nodes.get(link.target)
    if (!node) continue
    seen.add(link.target)
    rules.push({ node })
  }

  rules.sort((left, right) => {
    const leftLine = Number(left.node.properties.line ?? 0)
    const rightLine = Number(right.node.properties.line ?? 0)
    return leftLine - rightLine
  })
  return { rules }
}
