/**
 * Node kind/role contract shared by Overview, canvas, and Node detail.
 *
 * The Analyzer normally stores `[kind, ...roles, ...markers]`, but Neo4j label
 * order is not a safe business contract. Explicit `properties.type` and
 * `properties.stereotype` therefore win when present; position is only the
 * compatibility fallback for older analysis data.
 */

export interface NodeLabelSource {
  labels?: readonly string[]
  properties?: Record<string, unknown>
}

/** Labels that describe storage/runtime state, not a user-selectable role. */
const SYSTEM_MARKERS: ReadonlySet<string> = new Set(['INTERNAL', 'EXTERNAL'])
const HIDDEN_MARKERS: ReadonlySet<string> = new Set(['EMBEDDED'])
const MARKER_LABELS: ReadonlySet<string> = new Set([...SYSTEM_MARKERS, ...HIDDEN_MARKERS])

function normalizedLabel(value: unknown): string {
  return typeof value === 'string' ? value.replace(/[^a-z0-9]/gi, '').toUpperCase() : ''
}

function visibleLabels(node: NodeLabelSource): string[] {
  return (node.labels ?? []).filter(label => !MARKER_LABELS.has(label))
}

/** Neo4j label order independent node kind. */
export function kindOfNode(node: NodeLabelSource): string {
  const labels = visibleLabels(node)
  const explicitType = normalizedLabel(node.properties?.type)
  if (explicitType) {
    const match = labels.find(label => normalizedLabel(label) === explicitType)
    if (match) return match
  }

  // Compatibility data may have stereotype but no explicit type. Exclude the
  // stereotype before taking the positional kind fallback.
  const stereotype = normalizedLabel(node.properties?.stereotype)
  if (stereotype) {
    const nonRole = labels.find(label => normalizedLabel(label) !== stereotype)
    if (nonRole) return nonRole
  }
  return labels[0] ?? 'Unknown'
}

/** Semantic role labels, with kind and system/storage markers excluded once. */
export function semanticRoleLabels(node: NodeLabelSource): string[] {
  const kind = kindOfNode(node)
  const seen = new Set<string>()
  return visibleLabels(node).filter(label => {
    if (label === kind || seen.has(label)) return false
    seen.add(label)
    return true
  })
}

/** Compatibility helpers for label-only consumers. Production lens code uses node-aware APIs below. */
export function kindOf(labels: readonly string[] | undefined): string {
  return kindOfNode({ labels })
}

export function rolesOf(labels: readonly string[] | undefined): string[] {
  return semanticRoleLabels({ labels })
}

export function isStubMarker(label: string): boolean {
  return label === 'EXTERNAL'
}

export function isHiddenMarker(label: string): boolean {
  return HIDDEN_MARKERS.has(label)
}

/**
 * Resolve the visual label for a node under cumulative Overview selection.
 *
 * Priority is intentionally hierarchical:
 * 1. the most recently activated matching semantic role;
 * 2. the node kind (whether explicitly active or merely the fallback).
 *
 * Consequently FUNCTION + QUERY keeps ordinary functions in FUNCTION color
 * while only the QUERY subset uses QUERY color. Different kinds and roles can
 * remain visually distinct on the same canvas.
 */
export function colorLabelOfNode(
  node: NodeLabelSource,
  activeLabels?: readonly string[] | ReadonlySet<string>,
): string {
  const kind = kindOfNode(node)
  if (!activeLabels) return kind

  const active = Array.from(activeLabels)
  if (active.length === 0) return kind
  const roles = new Set(semanticRoleLabels(node))
  for (let index = active.length - 1; index >= 0; index -= 1) {
    const label = active[index]
    if (roles.has(label)) return label
  }
  return kind
}
