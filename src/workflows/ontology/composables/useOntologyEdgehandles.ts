import { ref, type Ref } from 'vue'
import cytoscape from 'cytoscape'
import edgehandles, {
  type EdgehandlesCompleteHandler,
  type EdgehandlesEventHandler,
  type EdgehandlesInstance,
  type EdgehandlesTargetHandler,
} from 'cytoscape-edgehandles'

import type { OntologyCanvasRelationship } from '../application/ontologyCanvasSchema'

cytoscape.use(edgehandles)

interface OntologyEdgehandlesOptions {
  getCanvas: () => cytoscape.Core | null
  relationships: Ref<OntologyCanvasRelationship[]>
  showRelationDialog: Ref<boolean>
  loading: Ref<boolean>
  loadingSchema: Ref<boolean>
  closeContextMenu: () => void
  openRelationDraft: (sourceId: string, targetId: string) => boolean
  schedule: (key: string, callback: () => void, delay: number) => void
}

export function useOntologyEdgehandles(options: OntologyEdgehandlesOptions) {
  const isDraggingHandle = ref(false)
  const hoveredNodeId = ref<string | null>(null)
  const isRelationDrawModeEnabled = ref(false)

  let instance: EdgehandlesInstance | null = null
  let temporaryEdge: cytoscape.CollectionReturnValue | null = null
  let boundCanvas: cytoscape.Core | null = null
  let startHandler: EdgehandlesEventHandler | null = null
  let completeHandler: EdgehandlesCompleteHandler | null = null
  let stopHandler: EdgehandlesEventHandler | null = null
  let showHandler: EdgehandlesTargetHandler | null = null
  let hideHandler: EdgehandlesTargetHandler | null = null
  let mousemoveHandler: ((event: cytoscape.EventObjectNode) => void) | null = null
  let mouseoutHandler: ((event: cytoscape.EventObjectNode) => void) | null = null
  let hoverSuspendUntil = 0

  function removeTransientEdges(): void {
    const canvas = options.getCanvas()
    if (!canvas) return

    const relationshipIds = new Set(options.relationships.value.map(relationship => relationship.id))
    canvas.edges().forEach(edge => {
      if (!relationshipIds.has(edge.id())) edge.remove()
    })
  }

  function reset(optionsOverride?: { removeTransientEdges?: boolean }): void {
    const canvas = options.getCanvas()
    hoveredNodeId.value = null
    isDraggingHandle.value = false
    temporaryEdge = null

    if (!canvas) return

    canvas.nodes().removeClass('eh-presumptive-target eh-hover eh-source eh-target')
    canvas.nodes().grabify()
    instance?.disableDrawMode()

    if (optionsOverride?.removeTransientEdges) removeTransientEdges()
  }

  function detachCanvasEvents(): void {
    if (!boundCanvas) return

    if (startHandler) boundCanvas.off('ehstart', startHandler)
    if (completeHandler) boundCanvas.off('ehcomplete', completeHandler)
    if (stopHandler) {
      boundCanvas.off('ehstop', stopHandler)
      boundCanvas.off('ehcancel', stopHandler)
    }
    if (showHandler) boundCanvas.off('ehshow', showHandler)
    if (hideHandler) boundCanvas.off('ehhide', hideHandler)
    if (mousemoveHandler) boundCanvas.off('mousemove', 'node', mousemoveHandler)
    if (mouseoutHandler) boundCanvas.off('mouseout', 'node', mouseoutHandler)

    boundCanvas = null
    startHandler = null
    completeHandler = null
    stopHandler = null
    showHandler = null
    hideHandler = null
    mousemoveHandler = null
    mouseoutHandler = null
  }

  function suspendHover(ms: number): void {
    hoverSuspendUntil = Date.now() + ms
  }

  function setDrawMode(enabled: boolean): void {
    isRelationDrawModeEnabled.value = enabled
    options.closeContextMenu()
    reset({ removeTransientEdges: true })
    if (enabled) suspendHover(150)
  }

  function upsertRelationship(relationship: OntologyCanvasRelationship): void {
    const canvas = options.getCanvas()
    if (!canvas) return

    const existingEdge = canvas.getElementById(relationship.id)
    if (existingEdge.length > 0) {
      existingEdge.data({
        source: relationship.source,
        target: relationship.target,
        type: relationship.type,
        label: relationship.type,
      })
      return
    }

    canvas.add({
      data: {
        id: relationship.id,
        source: relationship.source,
        target: relationship.target,
        type: relationship.type,
        label: relationship.type,
      },
    })
  }

  function removeRelationship(relationId: string): void {
    options.getCanvas()?.getElementById(relationId).remove()
  }

  function initialize(): void {
    const canvas = options.getCanvas()
    if (!canvas) return

    detachCanvasEvents()
    instance?.destroy()
    instance = canvas.edgehandles({
      preview: true,
      hoverDelay: 0,
      handleNodes: 'node',
      handlePosition: () => 'middle top',
      handleInDrawMode: true,
      edgeType: () => 'flat',
      loopAllowed: () => false,
      nodeLoopOffset: -50,
      snap: true,
      snapThreshold: 80,
      snapFrequency: 10,
      noEdgeEventsInDraw: false,
      disableBrowserGestures: true,
      handleColor: '#00d9ff',
      handleOutlineColor: '#ffffff',
      handleOutlineWidth: 3,
      handleSize: 14,
      handleHitThreshold: 50,
      edgeParams: () => ({ data: { type: 'CAUSES' } }),
    })
    boundCanvas = canvas

    startHandler = () => {
      isDraggingHandle.value = true
      const activeCanvas = options.getCanvas()
      if (!activeCanvas) return

      const currentZoom = activeCanvas.zoom()
      activeCanvas.zoom(currentZoom * 1.001)
      options.schedule('edgehandles-zoom-restore', () => {
        if (options.getCanvas() === activeCanvas) activeCanvas.zoom(currentZoom)
      }, 50)
    }
    canvas.on('ehstart', startHandler)

    completeHandler = (_event, sourceNode, targetNode, addedElements) => {
      temporaryEdge = addedElements
      const sourceId = sourceNode.id()
      const targetId = targetNode.id()
      temporaryEdge?.remove()
      temporaryEdge = null
      if (sourceId && targetId) options.openRelationDraft(sourceId, targetId)
    }
    canvas.on('ehcomplete', completeHandler)

    stopHandler = () => reset({ removeTransientEdges: true })
    canvas.on('ehstop', stopHandler)
    canvas.on('ehcancel', stopHandler)

    showHandler = (_event, targetNode) => {
      options.getCanvas()?.nodes().removeClass('eh-presumptive-target')
      targetNode.addClass('eh-presumptive-target')
    }
    canvas.on('ehshow', showHandler)

    hideHandler = (_event, targetNode) => targetNode.removeClass('eh-presumptive-target')
    canvas.on('ehhide', hideHandler)

    mousemoveHandler = event => {
      if (isDraggingHandle.value) return

      const node = event.target
      const nodeId = node.id()
      const nodePosition = node.position()
      const mousePosition = event.position
      const radius = node.width() / 2
      const distance = Math.hypot(
        mousePosition.x - nodePosition.x,
        mousePosition.y - nodePosition.y,
      )
      const hoverSuspended = Date.now() < hoverSuspendUntil
      const wantsConnectionMode = (
        isRelationDrawModeEnabled.value
        && !hoverSuspended
        && !options.showRelationDialog.value
        && !options.loading.value
        && !options.loadingSchema.value
      )

      if (!wantsConnectionMode) {
        if (hoveredNodeId.value) reset()
        return
      }

      if (distance >= radius * 0.65) {
        if (hoveredNodeId.value === nodeId) return

        if (hoveredNodeId.value) {
          const previousNode = options.getCanvas()?.getElementById(hoveredNodeId.value)
          previousNode?.removeClass('eh-hover')
          previousNode?.grabify()
        }
        hoveredNodeId.value = nodeId
        node.addClass('eh-hover')
        node.ungrabify()
        instance?.enableDrawMode()
        return
      }

      if (hoveredNodeId.value === nodeId) reset()
    }
    canvas.on('mousemove', 'node', mousemoveHandler)

    mouseoutHandler = event => {
      if (!isDraggingHandle.value && hoveredNodeId.value === event.target.id()) reset()
    }
    canvas.on('mouseout', 'node', mouseoutHandler)
    reset({ removeTransientEdges: true })
  }

  function destroy(): void {
    detachCanvasEvents()
    instance?.destroy()
    instance = null
    temporaryEdge = null
    isDraggingHandle.value = false
    hoveredNodeId.value = null
  }

  return {
    hoveredNodeId,
    isDraggingHandle,
    isRelationDrawModeEnabled,
    initialize,
    destroy,
    reset,
    suspendHover,
    setDrawMode,
    upsertRelationship,
    removeRelationship,
  }
}
