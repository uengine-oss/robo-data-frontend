import type { CausalDiscoveryResult, CausalEdge } from './contracts'

export type CausalNodeRole = 'input' | 'intermediate' | 'output'
export type CausalPathStrength = 'high' | 'medium' | 'low'

export interface ExplainabilityNode {
  id: string
  label: string
  role: CausalNodeRole
  incomingCount: number
  outgoingCount: number
}

export interface ExplainabilityEdge extends CausalEdge {
  id: string
  signedStrength: number
}

export interface ExplainabilityPath {
  nodeIds: string[]
  edgeIds: string[]
  strength: CausalPathStrength
  averageStrength: number
}

export interface ExplainabilityGraph {
  nodes: ExplainabilityNode[]
  edges: ExplainabilityEdge[]
  paths: ExplainabilityPath[]
  inputIds: string[]
  outputIds: string[]
}

const MAX_DISPLAY_PATHS = 8

export function buildExplainabilityGraph(result: CausalDiscoveryResult): ExplainabilityGraph {
  const labels = new Map<string, string>()
  const incoming = new Map<string, number>()
  const outgoing = new Map<string, number>()

  const edges = result.edges.map((edge, index): ExplainabilityEdge => {
    labels.set(edge.source, edge.source_label?.trim() || edge.source)
    labels.set(edge.target, edge.target_label?.trim() || edge.target)
    outgoing.set(edge.source, (outgoing.get(edge.source) ?? 0) + 1)
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1)

    return {
      ...edge,
      id: `${edge.source}→${edge.target}#${index}`,
      signedStrength: edge.direction === 'negative'
        ? -Math.abs(edge.strength)
        : Math.abs(edge.strength),
    }
  })

  const nodeIds = [...labels.keys()]
  const topologyInputs = nodeIds.filter(id => !incoming.has(id))
  const topologyOutputs = nodeIds.filter(id => !outgoing.has(id))
  const summaryInputs = resolveSummaryNodeIds(result.summary.root_causes, labels)
  const summaryOutputs = resolveSummaryNodeIds(result.summary.final_effects, labels)
  const inputIds = summaryInputs.length > 0 ? summaryInputs : topologyInputs
  const outputIds = summaryOutputs.length > 0 ? summaryOutputs : topologyOutputs
  const inputSet = new Set(inputIds)
  const outputSet = new Set(outputIds)

  const nodes = nodeIds.map((id): ExplainabilityNode => ({
    id,
    label: labels.get(id) ?? id,
    role: inputSet.has(id) ? 'input' : outputSet.has(id) ? 'output' : 'intermediate',
    incomingCount: incoming.get(id) ?? 0,
    outgoingCount: outgoing.get(id) ?? 0,
  }))

  return {
    nodes,
    edges,
    paths: findDisplayPaths(edges, inputIds, outputIds, nodeIds.length),
    inputIds,
    outputIds,
  }
}

function resolveSummaryNodeIds(
  summaryEntries: Array<[string, number]>,
  labels: ReadonlyMap<string, string>,
): string[] {
  const normalizedIds = new Map<string, string>()
  for (const [id, label] of labels) {
    normalizedIds.set(normalizeNodeName(id), id)
    normalizedIds.set(normalizeNodeName(label), id)
  }

  const resolved = summaryEntries
    .map(([name]) => normalizedIds.get(normalizeNodeName(name)))
    .filter((id): id is string => id !== undefined)
  return [...new Set(resolved)]
}

function normalizeNodeName(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function findDisplayPaths(
  edges: ExplainabilityEdge[],
  inputIds: string[],
  outputIds: string[],
  nodeCount: number,
): ExplainabilityPath[] {
  const adjacency = new Map<string, ExplainabilityEdge[]>()
  for (const edge of edges) {
    const adjacent = adjacency.get(edge.source) ?? []
    adjacent.push(edge)
    adjacency.set(edge.source, adjacent)
  }

  const outputSet = new Set(outputIds)
  const discovered: ExplainabilityPath[] = []
  const maxDepth = Math.max(nodeCount, 1)

  const visit = (
    nodeId: string,
    nodePath: string[],
    edgePath: ExplainabilityEdge[],
    visited: Set<string>,
  ) => {
    if (discovered.length >= MAX_DISPLAY_PATHS * 4) return
    if (edgePath.length > 0 && outputSet.has(nodeId)) {
      discovered.push(toPath(nodePath, edgePath))
      return
    }
    if (nodePath.length >= maxDepth) return

    for (const edge of adjacency.get(nodeId) ?? []) {
      if (visited.has(edge.target)) continue
      visit(
        edge.target,
        [...nodePath, edge.target],
        [...edgePath, edge],
        new Set([...visited, edge.target]),
      )
    }
  }

  for (const inputId of inputIds) {
    visit(inputId, [inputId], [], new Set([inputId]))
  }

  const paths = discovered.length > 0
    ? discovered
    : edges.map(edge => toPath([edge.source, edge.target], [edge]))

  return paths
    .sort((left, right) => right.averageStrength - left.averageStrength)
    .slice(0, MAX_DISPLAY_PATHS)
}

function toPath(nodeIds: string[], edges: ExplainabilityEdge[]): ExplainabilityPath {
  const averageStrength = edges.reduce(
    (sum, edge) => sum + Math.abs(edge.signedStrength),
    0,
  ) / edges.length

  return {
    nodeIds,
    edgeIds: edges.map(edge => edge.id),
    strength: averageStrength >= 0.7 ? 'high' : averageStrength >= 0.4 ? 'medium' : 'low',
    averageStrength,
  }
}

export function formatSignedStrength(value: number): string {
  const percentage = value * 100
  return `${percentage >= 0 ? '+' : ''}${percentage.toFixed(1)}%`
}
