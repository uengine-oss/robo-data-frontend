import { watch, type Ref } from 'vue'
import type cytoscape from 'cytoscape'

import type { CausalHighlightProjection } from '../application/causalAnalysisLifecycle'
import type {
  OntologyCanvasNode,
  OntologyCanvasRelationship,
} from '../application/ontologyCanvasSchema'

interface OntologyCanvasHighlightsOptions {
  getCanvas: () => cytoscape.Core | null
  causalHighlight: Ref<CausalHighlightProjection>
  getNodes: () => OntologyCanvasNode[]
  getRelationships: () => OntologyCanvasRelationship[]
  getDirectFilters: () => Record<string, unknown>
  getNodeFilters: () => Record<string, Record<string, unknown>>
}

export function useOntologyCanvasHighlights(options: OntologyCanvasHighlightsOptions) {
  function applyCausalHighlight(): void {
    const canvas = options.getCanvas()
    if (!canvas) return

    canvas.elements().removeClass('causal-highlight causal-faded')
    const { nodeIds, edgePairs } = options.causalHighlight.value
    if (nodeIds.length === 0) return

    canvas.nodes().addClass('causal-faded')
    nodeIds.forEach(nodeId => {
      const node = canvas.getElementById(nodeId)
      if (node.length > 0) {
        node.removeClass('causal-faded')
        node.addClass('causal-highlight')
      }
    })

    canvas.edges().addClass('causal-faded')
    edgePairs.forEach(([source, target]) => {
      const edges = canvas.edges().filter(edge => (
        edge.data('source') === source && edge.data('target') === target
      ))
      if (edges.length > 0) {
        edges.removeClass('causal-faded')
        edges.addClass('causal-highlight')
      }
    })
  }

  function clearCausalHighlight(): void {
    options.getCanvas()?.elements().removeClass('causal-highlight causal-faded')
  }

  function applyFilterHighlights(): void {
    const canvas = options.getCanvas()
    if (!canvas) return

    canvas.elements().removeClass(
      'filtered-direct filtered-cascade filtered-edge filtered-dimmed',
    )

    const nodeIds = new Set(options.getNodes().map(node => node.id))
    const directNodeIds = new Set(
      Object.keys(options.getDirectFilters()).filter(nodeId => nodeIds.has(nodeId)),
    )
    const cascadingNodeIds = new Set<string>()
    Object.entries(options.getNodeFilters()).forEach(([nodeId, filters]) => {
      if (directNodeIds.has(nodeId) || !nodeIds.has(nodeId)) return
      if (Object.values(filters).some(value => (
        value !== '' && value !== null && value !== undefined
      ))) {
        cascadingNodeIds.add(nodeId)
      }
    })

    if (directNodeIds.size === 0) return

    const filteredNodeIds = new Set([...directNodeIds, ...cascadingNodeIds])
    const filteredEdgeIds = options.getRelationships()
      .filter(relationship => (
        relationship.fromField
        && relationship.toField
        && filteredNodeIds.has(relationship.source)
        && filteredNodeIds.has(relationship.target)
      ))
      .map(relationship => relationship.id)

    canvas.nodes().addClass('filtered-dimmed')
    canvas.edges().addClass('filtered-dimmed')
    directNodeIds.forEach(nodeId => {
      canvas.getElementById(nodeId)
        .removeClass('filtered-dimmed')
        .addClass('filtered-direct')
    })
    cascadingNodeIds.forEach(nodeId => {
      canvas.getElementById(nodeId)
        .removeClass('filtered-dimmed')
        .addClass('filtered-cascade')
    })
    filteredEdgeIds.forEach(edgeId => {
      canvas.getElementById(edgeId)
        .removeClass('filtered-dimmed')
        .addClass('filtered-edge')
    })
  }

  watch(options.causalHighlight, applyCausalHighlight, { deep: true })

  return {
    applyCausalHighlight,
    applyFilterHighlights,
    clearCausalHighlight,
  }
}
