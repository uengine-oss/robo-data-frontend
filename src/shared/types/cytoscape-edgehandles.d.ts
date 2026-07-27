declare module 'cytoscape-edgehandles' {
  import cytoscape from 'cytoscape'
  
  export interface EdgehandlesOptions {
    preview?: boolean
    hoverDelay?: number
    handleNodes?: string
    handlePosition?: (node: cytoscape.NodeSingular) => string
    handleInDrawMode?: boolean
    edgeType?: (sourceNode: cytoscape.NodeSingular, targetNode: cytoscape.NodeSingular) => string
    loopAllowed?: (node: cytoscape.NodeSingular) => boolean
    nodeLoopOffset?: number
    snap?: boolean
    snapThreshold?: number
    snapFrequency?: number
    noEdgeEventsInDraw?: boolean
    disableBrowserGestures?: boolean
    handleColor?: string
    handleOutlineColor?: string
    handleOutlineWidth?: number
    handleSize?: number
    handleHitThreshold?: number
    edgeParams?: (sourceNode: cytoscape.NodeSingular, targetNode: cytoscape.NodeSingular) => object
    ghostEdgeParams?: () => object
    complete?: (sourceNode: cytoscape.NodeSingular, targetNode: cytoscape.NodeSingular, addedEdge: cytoscape.EdgeSingular) => void
  }
  
  export interface EdgehandlesInstance {
    enable: () => void
    disable: () => void
    enableDrawMode: () => void
    disableDrawMode: () => void
    start: (sourceNode: string) => void
    stop: () => void
    destroy: () => void
  }

  export type EdgehandlesEventHandler = (event: cytoscape.EventObject) => void
  export type EdgehandlesCompleteHandler = (
    event: cytoscape.EventObject,
    sourceNode: cytoscape.NodeSingular,
    targetNode: cytoscape.NodeSingular,
    addedElements: cytoscape.CollectionReturnValue,
  ) => void
  export type EdgehandlesTargetHandler = (
    event: cytoscape.EventObject,
    targetNode: cytoscape.NodeSingular,
  ) => void
  
  const edgehandles: cytoscape.Ext
  export default edgehandles
  
  declare global {
    namespace cytoscape {
      interface Core {
        edgehandles(options?: EdgehandlesOptions): EdgehandlesInstance
      }
    }
  }
}
