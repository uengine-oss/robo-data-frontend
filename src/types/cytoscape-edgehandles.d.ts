declare module 'cytoscape-edgehandles' {
  import cytoscape from 'cytoscape'
  
  interface EdgehandlesOptions {
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
    ghostEdgeParams?: () => object
    complete?: (sourceNode: cytoscape.NodeSingular, targetNode: cytoscape.NodeSingular, addedEdge: cytoscape.EdgeSingular) => void
  }
  
  interface EdgehandlesInstance {
    enable: () => void
    disable: () => void
    enableDrawMode: () => void
    disableDrawMode: () => void
    start: (sourceNode: string) => void
    stop: () => void
    destroy: () => void
  }
  
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
