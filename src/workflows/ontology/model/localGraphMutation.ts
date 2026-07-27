export interface LocalGraphNode {
  id: string
  name: string
  label?: string
  layer?: string
}

export interface LocalGraphRelationship {
  id: string
  source: string
  target: string
  type: string
  description?: string
  fromField?: string
  toField?: string
}

export interface LocalGraphPosition {
  x: number
  y: number
}

export interface LocalGraphCreatedNode extends LocalGraphNode {
  label: string
  layer: string
  description: string
  position: LocalGraphPosition
}

export interface LocalGraphRelationshipDraft extends LocalGraphRelationship {
  description: undefined
  fromField: undefined
  toField: undefined
}

export type LocalGraphMutationReason =
  | 'changed'
  | 'blank'
  | 'duplicate'
  | 'invalid'
  | 'not-found'
  | 'self-relation'
  | 'unchanged'

export interface LocalGraphNodeMutationResult<TNode extends LocalGraphNode> {
  nodes: TNode[]
  node: TNode | null
  changed: boolean
  reason: LocalGraphMutationReason
}

export interface LocalGraphNodeCreationResult<TNode extends LocalGraphNode> {
  nodes: Array<TNode | LocalGraphCreatedNode>
  node: LocalGraphCreatedNode | null
  changed: boolean
  reason: LocalGraphMutationReason
}

export interface LocalGraphRelationshipDraftResult {
  relationship: LocalGraphRelationshipDraft | null
  reason: LocalGraphMutationReason
}

export interface LocalGraphRelationshipMutationResult<
  TRelationship extends LocalGraphRelationship,
> {
  relationships: TRelationship[]
  relationship: TRelationship | null
  changed: boolean
  reason: LocalGraphMutationReason
}

export interface LocalGraphRelationshipPatch {
  type: string
  description?: string | null
  fromField?: string | null
  toField?: string | null
}

export type LocalGraphDeleteTarget =
  | {
      kind: 'node'
      id: string
      name: string
      relationshipCount: number
    }
  | {
      kind: 'relationship'
      id: string
      sourceName: string
      targetName: string
      relationshipType: string
    }

export interface LocalGraphDeleteResult<
  TNode extends LocalGraphNode,
  TRelationship extends LocalGraphRelationship,
> {
  nodes: TNode[]
  relationships: TRelationship[]
  removedNodeId: string | null
  removedRelationshipId: string | null
}

function normalizeRequiredText(value: string): string {
  return value.trim()
}

function normalizeOptionalText(value: string | null | undefined): string | undefined {
  const normalized = value?.trim() ?? ''
  return normalized || undefined
}

function isFinitePosition(position: LocalGraphPosition): boolean {
  return Number.isFinite(position.x) && Number.isFinite(position.y)
}

export function createLocalGraphNode<TNode extends LocalGraphNode>(
  nodes: readonly TNode[],
  input: {
    layerId: string
    layerName: string
    position: LocalGraphPosition
    now: number
  },
): LocalGraphNodeCreationResult<TNode> {
  const layerId = normalizeRequiredText(input.layerId)
  const layerName = normalizeRequiredText(input.layerName)
  if (!layerId || !layerName || !Number.isFinite(input.now) || !isFinitePosition(input.position)) {
    return {
      nodes: [...nodes],
      node: null,
      changed: false,
      reason: 'invalid',
    }
  }

  const sequence = nodes.filter(node => (node.layer || node.label) === layerId).length + 1
  const node: LocalGraphCreatedNode = {
    id: `${layerId.toLowerCase()}_${sequence}_${input.now}`,
    name: `새 ${layerName} ${sequence}`,
    label: layerId,
    layer: layerId,
    description: '',
    position: { ...input.position },
  }

  if (nodes.some(existing => existing.id === node.id)) {
    return {
      nodes: [...nodes],
      node: null,
      changed: false,
      reason: 'duplicate',
    }
  }

  return {
    nodes: [...nodes, node],
    node,
    changed: true,
    reason: 'changed',
  }
}

export function renameLocalGraphNode<TNode extends LocalGraphNode>(
  nodes: readonly TNode[],
  nodeId: string,
  rawName: string,
): LocalGraphNodeMutationResult<TNode> {
  const name = normalizeRequiredText(rawName)
  if (!name) {
    return {
      nodes: [...nodes],
      node: null,
      changed: false,
      reason: 'blank',
    }
  }

  const current = nodes.find(node => node.id === nodeId)
  if (!current) {
    return {
      nodes: [...nodes],
      node: null,
      changed: false,
      reason: 'not-found',
    }
  }
  if (current.name === name) {
    return {
      nodes: [...nodes],
      node: current,
      changed: false,
      reason: 'unchanged',
    }
  }

  const node = { ...current, name }
  return {
    nodes: nodes.map(candidate => candidate.id === nodeId ? node : candidate),
    node,
    changed: true,
    reason: 'changed',
  }
}

export function changeLocalGraphNodeLayer<TNode extends LocalGraphNode>(
  nodes: readonly TNode[],
  nodeId: string,
  rawLayerId: string,
): LocalGraphNodeMutationResult<TNode> {
  const layerId = normalizeRequiredText(rawLayerId)
  if (!layerId) {
    return {
      nodes: [...nodes],
      node: null,
      changed: false,
      reason: 'blank',
    }
  }

  const current = nodes.find(node => node.id === nodeId)
  if (!current) {
    return {
      nodes: [...nodes],
      node: null,
      changed: false,
      reason: 'not-found',
    }
  }
  if ((current.layer || current.label) === layerId) {
    return {
      nodes: [...nodes],
      node: current,
      changed: false,
      reason: 'unchanged',
    }
  }

  const node = { ...current, layer: layerId, label: layerId }
  return {
    nodes: nodes.map(candidate => candidate.id === nodeId ? node : candidate),
    node,
    changed: true,
    reason: 'changed',
  }
}

export function moveLocalGraphNode<
  TNode extends LocalGraphNode & { position?: LocalGraphPosition },
>(
  nodes: readonly TNode[],
  nodeId: string,
  position: LocalGraphPosition,
): LocalGraphNodeMutationResult<TNode> {
  if (!isFinitePosition(position)) {
    return {
      nodes: [...nodes],
      node: null,
      changed: false,
      reason: 'invalid',
    }
  }

  const current = nodes.find(node => node.id === nodeId)
  if (!current) {
    return {
      nodes: [...nodes],
      node: null,
      changed: false,
      reason: 'not-found',
    }
  }
  if (current.position?.x === position.x && current.position?.y === position.y) {
    return {
      nodes: [...nodes],
      node: current,
      changed: false,
      reason: 'unchanged',
    }
  }

  const node = { ...current, position: { ...position } }
  return {
    nodes: nodes.map(candidate => candidate.id === nodeId ? node : candidate),
    node,
    changed: true,
    reason: 'changed',
  }
}

export function createLocalGraphRelationshipDraft(
  nodes: readonly LocalGraphNode[],
  relationships: readonly LocalGraphRelationship[],
  input: {
    sourceId: string
    targetId: string
    now: number
  },
): LocalGraphRelationshipDraftResult {
  const sourceId = normalizeRequiredText(input.sourceId)
  const targetId = normalizeRequiredText(input.targetId)
  if (!sourceId || !targetId || !Number.isFinite(input.now)) {
    return { relationship: null, reason: 'invalid' }
  }
  if (sourceId === targetId) {
    return { relationship: null, reason: 'self-relation' }
  }
  if (!nodes.some(node => node.id === sourceId) || !nodes.some(node => node.id === targetId)) {
    return { relationship: null, reason: 'not-found' }
  }
  if (relationships.some(
    relationship => relationship.source === sourceId && relationship.target === targetId,
  )) {
    return { relationship: null, reason: 'duplicate' }
  }

  const id = `rel_${input.now}`
  if (relationships.some(relationship => relationship.id === id)) {
    return { relationship: null, reason: 'duplicate' }
  }

  return {
    relationship: {
      id,
      source: sourceId,
      target: targetId,
      type: 'CAUSES',
      description: undefined,
      fromField: undefined,
      toField: undefined,
    },
    reason: 'changed',
  }
}

function projectRelationshipPatch<TRelationship extends LocalGraphRelationship>(
  relationship: TRelationship,
  patch: LocalGraphRelationshipPatch,
): TRelationship | null {
  const type = normalizeRequiredText(patch.type)
  if (!type) return null

  return {
    ...relationship,
    type,
    description: normalizeOptionalText(patch.description),
    fromField: normalizeOptionalText(patch.fromField),
    toField: normalizeOptionalText(patch.toField),
  }
}

function sameEditableRelationship(
  left: LocalGraphRelationship,
  right: LocalGraphRelationship,
): boolean {
  return left.type === right.type
    && left.description === right.description
    && left.fromField === right.fromField
    && left.toField === right.toField
}

export function commitLocalGraphRelationship<
  TRelationship extends LocalGraphRelationship,
>(
  relationships: readonly TRelationship[],
  draft: TRelationship,
  patch: LocalGraphRelationshipPatch,
): LocalGraphRelationshipMutationResult<TRelationship> {
  if (relationships.some(relationship =>
    relationship.id === draft.id
    || (
      relationship.source === draft.source
      && relationship.target === draft.target
    ),
  )) {
    return {
      relationships: [...relationships],
      relationship: null,
      changed: false,
      reason: 'duplicate',
    }
  }

  const relationship = projectRelationshipPatch(draft, patch)
  if (!relationship) {
    return {
      relationships: [...relationships],
      relationship: null,
      changed: false,
      reason: 'blank',
    }
  }

  return {
    relationships: [...relationships, relationship],
    relationship,
    changed: true,
    reason: 'changed',
  }
}

export function updateLocalGraphRelationship<
  TRelationship extends LocalGraphRelationship,
>(
  relationships: readonly TRelationship[],
  relationshipId: string,
  patch: LocalGraphRelationshipPatch,
): LocalGraphRelationshipMutationResult<TRelationship> {
  const current = relationships.find(relationship => relationship.id === relationshipId)
  if (!current) {
    return {
      relationships: [...relationships],
      relationship: null,
      changed: false,
      reason: 'not-found',
    }
  }

  const relationship = projectRelationshipPatch(current, patch)
  if (!relationship) {
    return {
      relationships: [...relationships],
      relationship: null,
      changed: false,
      reason: 'blank',
    }
  }
  if (sameEditableRelationship(current, relationship)) {
    return {
      relationships: [...relationships],
      relationship: current,
      changed: false,
      reason: 'unchanged',
    }
  }

  return {
    relationships: relationships.map(
      candidate => candidate.id === relationshipId ? relationship : candidate,
    ),
    relationship,
    changed: true,
    reason: 'changed',
  }
}

export function createNodeDeleteTarget<
  TNode extends LocalGraphNode,
  TRelationship extends LocalGraphRelationship,
>(
  node: TNode,
  relationships: readonly TRelationship[],
): LocalGraphDeleteTarget {
  return {
    kind: 'node',
    id: node.id,
    name: node.name,
    relationshipCount: relationships.filter(
      relationship => relationship.source === node.id || relationship.target === node.id,
    ).length,
  }
}

export function createRelationshipDeleteTarget<
  TNode extends LocalGraphNode,
  TRelationship extends LocalGraphRelationship,
>(
  relationship: TRelationship,
  nodes: readonly TNode[],
): LocalGraphDeleteTarget {
  return {
    kind: 'relationship',
    id: relationship.id,
    sourceName: nodes.find(node => node.id === relationship.source)?.name || relationship.source,
    targetName: nodes.find(node => node.id === relationship.target)?.name || relationship.target,
    relationshipType: relationship.type,
  }
}

export function localGraphDeleteTitle(target: LocalGraphDeleteTarget | null): string {
  if (!target) return ''
  return target.kind === 'node' ? '노드 삭제' : '관계 삭제'
}

export function localGraphDeleteMessage(target: LocalGraphDeleteTarget | null): string {
  if (!target) return ''
  if (target.kind === 'relationship') {
    return [
      `'${target.sourceName}' → '${target.targetName}' (${target.relationshipType}) 관계를 삭제하시겠습니까?`,
      '삭제 후 Ctrl+Z로 실행 취소할 수 있습니다.',
    ].join('\n\n')
  }

  const relationshipMessage = target.relationshipCount > 0
    ? `이 노드와 연결된 ${target.relationshipCount}개의 관계도 함께 삭제됩니다.\n\n`
    : ''
  return [
    `'${target.name}' 노드를 삭제하시겠습니까?`,
    `${relationshipMessage}삭제 후 Ctrl+Z로 실행 취소할 수 있습니다.`,
  ].join('\n\n')
}

export function applyLocalGraphDelete<
  TNode extends LocalGraphNode,
  TRelationship extends LocalGraphRelationship,
>(
  nodes: readonly TNode[],
  relationships: readonly TRelationship[],
  target: LocalGraphDeleteTarget,
): LocalGraphDeleteResult<TNode, TRelationship> {
  if (target.kind === 'node') {
    return {
      nodes: nodes.filter(node => node.id !== target.id),
      relationships: relationships.filter(
        relationship => relationship.source !== target.id && relationship.target !== target.id,
      ),
      removedNodeId: target.id,
      removedRelationshipId: null,
    }
  }

  return {
    nodes: [...nodes],
    relationships: relationships.filter(relationship => relationship.id !== target.id),
    removedNodeId: null,
    removedRelationshipId: target.id,
  }
}
