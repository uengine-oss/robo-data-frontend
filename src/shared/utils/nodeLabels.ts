/**
 * Node kind/role contract shared by Overview, canvas, and Node detail.
 *
 * Analyzer product nodes have one concrete kind label. Semantic role is the
 * explicit `stereotype` property and is not duplicated as a label.
 */

export interface NodeLabelSource {
  labels?: readonly string[]
  properties?: Record<string, unknown>
}

/** Labels that describe storage/runtime state, not a user-selectable role. */
const SYSTEM_MARKERS: ReadonlySet<string> = new Set(['INTERNAL', 'EXTERNAL'])
/**
 * Storage markers that are never a kind or a role.
 * - ANALYZER_OWNED: common parent label of every analyzer node. Ontological DB
 *   returns labels as an inheritance chain (parent → child), so it is always
 *   labels[0] there; Neo4j may also put it first.
 * - EMBEDDED: legacy search-vector marker label (now the `embedded` property).
 */
const HIDDEN_MARKERS: ReadonlySet<string> = new Set(['ANALYZER_OWNED', 'EMBEDDED'])
const MARKER_LABELS: ReadonlySet<string> = new Set([...SYSTEM_MARKERS, ...HIDDEN_MARKERS])

function visibleLabels(node: NodeLabelSource): string[] {
  return (node.labels ?? []).filter(label => !MARKER_LABELS.has(label))
}

/** Neo4j label order independent node kind. */
export function kindOfNode(node: NodeLabelSource): string {
  const labels = visibleLabels(node)
  return labels[0] ?? 'Unknown'
}

/** Semantic role labels, with kind and system/storage markers excluded once. */
export function semanticRoleLabels(node: NodeLabelSource): string[] {
  const kind = kindOfNode(node)
  const seen = new Set<string>()
  const roles = visibleLabels(node).filter(label => {
    if (label === kind || seen.has(label)) return false
    seen.add(label)
    return true
  })
  const stereotype = typeof node.properties?.stereotype === 'string'
    ? node.properties.stereotype.trim()
    : ''
  if (stereotype && stereotype !== kind && !seen.has(stereotype)) roles.push(stereotype)
  return roles
}

/** Label-only helpers for consumers that do not have the property map. */
export function kindOf(labels: readonly string[] | undefined): string {
  return kindOfNode({ labels })
}

export function rolesOf(labels: readonly string[] | undefined): string[] {
  return semanticRoleLabels({ labels })
}

export function isStubMarker(label: string): boolean {
  return label === 'EXTERNAL'
}

/**
 * External call stub (callee outside the analysed code). The analyzer marks it
 * with the `external: true` property; older graphs used an `EXTERNAL` label.
 */
export function isExternalStub(node: NodeLabelSource): boolean {
  return node.properties?.external === true || (node.labels ?? []).some(isStubMarker)
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
