import type cytoscape from 'cytoscape'

export interface OntologyCanvasLayer {
  id: string
  name: string
  color: string
  icon: string
  rank: number
}

export const ONTOLOGY_CANVAS_LAYERS = [
  { id: 'KPI', name: 'KPI', color: '#ef4444', icon: '📊', rank: 0 },
  { id: 'Measure', name: 'Measure', color: '#f97316', icon: '📏', rank: 1 },
  { id: 'Process', name: 'Process', color: '#22c55e', icon: '⚙️', rank: 2 },
  { id: 'Driver', name: 'Driver', color: '#eab308', icon: '🔧', rank: 3 },
  { id: 'Resource', name: 'Resource', color: '#3b82f6', icon: '💾', rank: 4 },
] as const satisfies readonly OntologyCanvasLayer[]

const DEFAULT_LAYER_COLOR = '#888'
const DEFAULT_LAYER_RANK = 2

const RELATION_TYPE_INVERSION: Readonly<Record<string, string>> = {
  CAUSES: 'CAUSED_BY',
  CAUSED_BY: 'CAUSES',
  AFFECTS: 'AFFECTED_BY',
  AFFECTED_BY: 'AFFECTS',
  EFFECTS: 'EFFECTED_BY',
  EFFECTED_BY: 'EFFECTS',
  NEXT: 'NEXT',
  PREV: 'PREV',
  MEASURED_AS: 'MEASURES',
  MEASURES: 'MEASURED_AS',
  PRODUCES: 'PRODUCED_BY',
  PRODUCED_BY: 'PRODUCES',
  GENERATES: 'GENERATED_BY',
  GENERATED_BY: 'GENERATES',
  INFLUENCES: 'INFLUENCED_BY',
  INFLUENCED_BY: 'INFLUENCES',
  IMPACTS: 'IMPACTED_BY',
  IMPACTED_BY: 'IMPACTS',
  EXECUTES: 'EXECUTED_BY',
  EXECUTED_BY: 'EXECUTES',
  RUNS: 'RUN_BY',
  RUN_BY: 'RUNS',
  USED_WHEN: 'SUPPORTS',
  SUPPORTS: 'USED_WHEN',
  NEEDS: 'PROVIDES',
  PROVIDES: 'NEEDS',
  PRECEDES: 'FOLLOWS',
  FOLLOWS: 'PRECEDES',
  TRIGGERS: 'TRIGGERED_BY',
  TRIGGERED_BY: 'TRIGGERS',
  BELONGS_TO: 'HAS_PROCEDURE',
  HAS_PROCEDURE: 'BELONGS_TO',
  LINKS_TO: 'LINKED_FROM',
  USES: 'USED_BY',
  USED_BY: 'USES',
  UTILIZES: 'UTILIZED_BY',
  UTILIZED_BY: 'UTILIZES',
  ENABLES: 'ENABLED_BY',
  ENABLED_BY: 'ENABLES',
  CONTRIBUTES_TO: 'CONTRIBUTED_BY',
  CONTRIBUTED_BY: 'CONTRIBUTES_TO',
}

const UPWARD_RELATION_TYPES = new Set([
  'CAUSES',
  'PRODUCES',
  'INFLUENCES',
  'EXECUTES',
  'SUPPORTS',
  'TRIGGERS',
  'ENABLES',
  'CONTRIBUTES_TO',
  'LEADS_TO',
  'AFFECTS',
  'EFFECTS',
])

const HORIZONTAL_RELATION_TYPES = new Set([
  'NEXT',
  'PREV',
  'PRECEDES',
  'FOLLOWS',
])

export interface OntologyGraphNode {
  id: string
  name: string
  label: string
  layer?: string
  position?: {
    x?: number
    y?: number
  } | null
}

export interface OntologyGraphRelationship {
  id: string
  source: string
  target: string
  type: string
  weight?: number
  sourceLayer?: string
  targetLayer?: string
}

export interface OntologyGraphElementProjection {
  elements: cytoscape.ElementDefinition[]
  hasCompletePositions: boolean
}

export function getOntologyCanvasLayerColor(layerId: string): string {
  return ONTOLOGY_CANVAS_LAYERS.find(layer => layer.id === layerId)?.color
    ?? DEFAULT_LAYER_COLOR
}

export function getOntologyCanvasLayerRank(layerId: string): number {
  return ONTOLOGY_CANVAS_LAYERS.find(layer => layer.id === layerId)?.rank
    ?? DEFAULT_LAYER_RANK
}

function hasFinitePosition(
  node: OntologyGraphNode,
): node is OntologyGraphNode & { position: { x: number; y: number } } {
  return (
    typeof node.position?.x === 'number'
    && Number.isFinite(node.position.x)
    && typeof node.position.y === 'number'
    && Number.isFinite(node.position.y)
  )
}

function invertRelationshipType(type: string): string {
  return RELATION_TYPE_INVERSION[type] ?? `REV_${type}`
}

function projectRelationshipDirection(
  relationship: OntologyGraphRelationship,
  nodeLayerById: ReadonlyMap<string, string>,
): {
  source: string
  target: string
  type: string
  sourceLayer: string
  targetLayer: string
} {
  const sourceLayer = relationship.sourceLayer
    || nodeLayerById.get(relationship.source)
    || 'Process'
  const targetLayer = relationship.targetLayer
    || nodeLayerById.get(relationship.target)
    || 'Process'
  const sourceRank = getOntologyCanvasLayerRank(sourceLayer)
  const targetRank = getOntologyCanvasLayerRank(targetLayer)

  let source = relationship.source
  let target = relationship.target
  let type = relationship.type

  if (HORIZONTAL_RELATION_TYPES.has(type)) {
    if (type === 'PRECEDES') {
      type = 'NEXT'
    } else if (type === 'FOLLOWS') {
      source = relationship.target
      target = relationship.source
      type = 'NEXT'
    }
  } else if (sourceRank < targetRank) {
    source = relationship.target
    target = relationship.source
    type = invertRelationshipType(type)
  } else if (sourceRank === targetRank && !UPWARD_RELATION_TYPES.has(type)) {
    source = relationship.target
    target = relationship.source
    type = invertRelationshipType(type)
  }

  return {
    source,
    target,
    type,
    sourceLayer,
    targetLayer,
  }
}

export function projectOntologyGraphElements(
  nodes: readonly OntologyGraphNode[],
  relationships: readonly OntologyGraphRelationship[],
): OntologyGraphElementProjection {
  const nodeLayerById = new Map<string, string>()
  const elements: cytoscape.ElementDefinition[] = nodes.map(node => {
    const layer = node.layer || node.label
    nodeLayerById.set(node.id, layer)

    const element: cytoscape.ElementDefinition = {
      data: {
        id: node.id,
        label: node.name,
        layer,
        color: getOntologyCanvasLayerColor(layer),
      },
    }

    if (hasFinitePosition(node)) {
      element.position = {
        x: node.position.x,
        y: node.position.y,
      }
    }

    return element
  })

  for (const relationship of relationships) {
    const projected = projectRelationshipDirection(
      relationship,
      nodeLayerById,
    )

    elements.push({
      data: {
        id: relationship.id,
        source: projected.source,
        target: projected.target,
        type: projected.type,
        label: projected.type,
        weight: relationship.weight || 0.5,
        sourceLayer: projected.sourceLayer,
        targetLayer: projected.targetLayer,
      },
    })
  }

  return {
    elements,
    hasCompletePositions: (
      nodes.length > 0
      && nodes.every(hasFinitePosition)
    ),
  }
}
