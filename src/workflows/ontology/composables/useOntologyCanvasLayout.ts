import { ref, type Ref } from 'vue'
import type cytoscape from 'cytoscape'

import { limitOntologyAutoFitZoom } from '../model/graphViewport'
import { projectOntologyHierarchicalLayout } from '../model/ontologyHierarchicalLayout'

type OntologyCanvasLayout = 'hierarchical' | 'cose' | 'circle' | 'grid'

interface OntologyCanvasLayoutOptions {
  getCanvas: () => cytoscape.Core | null
  nodeCount: () => number
  selectedNodeId: Ref<string | null>
  currentGeneration: () => number
  isCurrentGeneration: (generation: number) => boolean
}

export function useOntologyCanvasLayout(options: OntologyCanvasLayoutOptions) {
  const currentLayout = ref<OntologyCanvasLayout>('cose')

  function fit(padding = 50): void {
    const canvas = options.getCanvas()
    if (!canvas) return

    canvas.fit(undefined, padding)
    const limitedZoom = limitOntologyAutoFitZoom(canvas.zoom())
    if (limitedZoom !== canvas.zoom()) {
      canvas.zoom(limitedZoom)
      canvas.center(canvas.nodes())
    }
  }

  function applyHierarchicalLayout(): null {
    const canvas = options.getCanvas()
    if (!canvas) return null

    const positions = projectOntologyHierarchicalLayout(
      canvas.nodes().map(node => ({
        id: node.id(),
        layer: String(node.data('layer') || ''),
      })),
      canvas.edges().map(edge => ({
        source: String(edge.data('source') || ''),
        target: String(edge.data('target') || ''),
      })),
    )

    canvas.nodes().forEach(node => {
      const position = positions[node.id()]
      if (position) node.position(position)
    })
    fit()
    return null
  }

  function applyLayout(): cytoscape.Layouts | null {
    const canvas = options.getCanvas()
    if (!canvas) return null
    if (currentLayout.value === 'hierarchical') return applyHierarchicalLayout()

    let layoutOptions: cytoscape.LayoutOptions
    switch (currentLayout.value) {
      case 'circle':
        layoutOptions = {
          name: 'circle',
          animate: true,
          animationDuration: 500,
        }
        break
      case 'grid':
        layoutOptions = {
          name: 'grid',
          animate: true,
          animationDuration: 500,
          rows: Math.ceil(Math.sqrt(options.nodeCount())),
        }
        break
      case 'cose':
      default:
        layoutOptions = {
          name: 'cose',
          animate: true,
          animationDuration: 500,
          nodeRepulsion: () => 8000,
          idealEdgeLength: () => 100,
        }
        break
    }

    const layout = canvas.layout(layoutOptions)
    layout.one('layoutstop', () => fit())
    return layout.run()
  }

  function updateLayout(value: string): void {
    if (!['hierarchical', 'cose', 'circle', 'grid'].includes(value)) return
    currentLayout.value = value as OntologyCanvasLayout
    applyLayout()
  }

  function syncAfterPanelChange(
    generation: number = options.currentGeneration(),
  ): void {
    const canvas = options.getCanvas()
    if (!canvas || !options.isCurrentGeneration(generation)) return

    const zoom = canvas.zoom()
    canvas.resize()
    if (options.getCanvas() !== canvas || !options.isCurrentGeneration(generation)) return

    canvas.zoom(zoom)
    const selectedElement = options.selectedNodeId.value
      ? canvas.getElementById(options.selectedNodeId.value)
      : canvas.collection()
    canvas.center(selectedElement.nonempty() ? selectedElement : canvas.nodes())
  }

  return {
    currentLayout,
    applyLayout,
    fit,
    syncAfterPanelChange,
    updateLayout,
  }
}
