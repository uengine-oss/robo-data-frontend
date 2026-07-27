import type cytoscape from 'cytoscape'

export type OntologyCanvasContextMenuRequest =
  | {
      mode: 'node'
      position: { x: number; y: number }
      nodeId: string
      nodeName: string
    }
  | {
      mode: 'edge'
      position: { x: number; y: number }
      edgeId: string
      edgeLabel: string
    }
  | {
      mode: 'canvas'
      position: { x: number; y: number }
      graphPosition: { x: number; y: number }
    }

interface BindOntologyCanvasEventsOptions {
  canvas: cytoscape.Core
  container: HTMLElement
  getNodeName: (nodeId: string) => string
  hasNode: (nodeId: string) => boolean
  hasPendingRelation: () => boolean
  hasOpenRelationEditor: () => boolean
  resetEdgehandles: () => void
  suspendEdgehandlesHover: (ms: number) => void
  selectNode: (nodeId: string) => void
  deselectNode: () => void
  completePendingRelation: (nodeId: string) => void
  cancelPendingRelation: () => void
  closeRelationEditor: () => void
  moveNode: (nodeId: string, position: { x: number; y: number }) => void
  openRelationEditor: (edgeId: string) => void
  openContextMenu: (request: OntologyCanvasContextMenuRequest) => void
}

export function bindOntologyCanvasEvents(options: BindOntologyCanvasEventsOptions): void {
  const { canvas, container } = options

  canvas.on('tap', 'node', event => {
    const nodeId = event.target.id()
    options.resetEdgehandles()
    options.suspendEdgehandlesHover(150)
    if (options.hasPendingRelation()) {
      options.completePendingRelation(nodeId)
    } else {
      options.selectNode(nodeId)
    }
  })

  canvas.on('tap', event => {
    if (event.target !== canvas) return
    if (options.hasPendingRelation()) {
      options.cancelPendingRelation()
      return
    }
    if (options.hasOpenRelationEditor()) options.closeRelationEditor()
    options.deselectNode()
  })

  canvas.on('cxttap', 'node', event => {
    const nodeId = event.target.id()
    if (!options.hasNode(nodeId)) return

    const graphRect = container.parentElement?.getBoundingClientRect()
      ?? container.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    const position = event.target.renderedPosition()
    options.openContextMenu({
      mode: 'node',
      position: {
        x: containerRect.left + position.x - graphRect.left,
        y: containerRect.top + position.y - graphRect.top,
      },
      nodeId,
      nodeName: options.getNodeName(nodeId),
    })
  })

  canvas.on('cxttap', 'edge', event => {
    const edge = event.target
    const graphRect = container.parentElement?.getBoundingClientRect()
      ?? container.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    const midpoint = edge.renderedMidpoint ? edge.renderedMidpoint() : edge.midpoint()
    const sourceName = options.getNodeName(String(edge.data('source')))
    const targetName = options.getNodeName(String(edge.data('target')))

    options.openContextMenu({
      mode: 'edge',
      position: {
        x: containerRect.left + midpoint.x - graphRect.left,
        y: containerRect.top + midpoint.y - graphRect.top,
      },
      edgeId: edge.id(),
      edgeLabel: `${sourceName} → ${targetName}`,
    })
  })

  canvas.on('cxttap', event => {
    if (event.target !== canvas) return

    const graphRect = container.parentElement?.getBoundingClientRect()
      ?? container.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    const originalEvent = event.originalEvent as MouseEvent
    const zoom = canvas.zoom()
    const pan = canvas.pan()

    options.openContextMenu({
      mode: 'canvas',
      position: {
        x: originalEvent.clientX - graphRect.left,
        y: originalEvent.clientY - graphRect.top,
      },
      graphPosition: {
        x: (originalEvent.clientX - containerRect.left - pan.x) / zoom,
        y: (originalEvent.clientY - containerRect.top - pan.y) / zoom,
      },
    })
  })

  canvas.on('dragfree', 'node', event => {
    const position = event.target.position()
    options.moveNode(event.target.id(), { x: position.x, y: position.y })
  })

  canvas.on('dblclick', 'edge', event => options.openRelationEditor(event.target.id()))
}
