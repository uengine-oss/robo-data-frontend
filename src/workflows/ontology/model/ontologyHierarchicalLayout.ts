import {
  ONTOLOGY_CANVAS_LAYERS,
  getOntologyCanvasLayerRank,
} from './ontologyGraphElements'

export interface OntologyLayoutNode {
  id: string
  layer: string
}

export interface OntologyLayoutEdge {
  source: string
  target: string
}

export interface OntologyLayoutPosition {
  x: number
  y: number
}

interface OntologyLayoutNodeInfo {
  id: string
  layer: string
  layerRank: number
  incomingEdges: string[]
  outgoingEdges: string[]
  depth: number
}

const LAYER_BASE_Y = 80
const LAYER_SPACING = 180
const DEPTH_SPACING = 80
const NODE_X_SPACING = 160
const PROCESS_X_SPACING = 180
const DRIVER_PULL_ITERATIONS = 3
const CANONICAL_LAYER_IDS = ONTOLOGY_CANVAS_LAYERS.map(layer => layer.id)
const CANONICAL_LAYER_ID_SET = new Set<string>(CANONICAL_LAYER_IDS)

function resolveLayoutLayer(layer: string): string {
  return CANONICAL_LAYER_ID_SET.has(layer) ? layer : 'Process'
}

function calculateDepth(
  nodeId: string,
  nodeInfoById: Readonly<Record<string, OntologyLayoutNodeInfo>>,
  visited: Set<string>,
  currentDepth: number,
): void {
  if (visited.has(nodeId)) return
  visited.add(nodeId)

  const info = nodeInfoById[nodeId]
  if (!info) return

  info.depth = Math.max(info.depth, currentDepth)

  for (const sourceId of info.incomingEdges) {
    const sourceInfo = nodeInfoById[sourceId]
    if (sourceInfo && sourceInfo.layerRank === info.layerRank) {
      calculateDepth(
        sourceId,
        nodeInfoById,
        visited,
        currentDepth + 1,
      )
    }
  }
}

export function projectOntologyHierarchicalLayout(
  nodes: readonly OntologyLayoutNode[],
  edges: readonly OntologyLayoutEdge[],
): Record<string, OntologyLayoutPosition> {
  const nodeInfoById: Record<string, OntologyLayoutNodeInfo> = Object.create(null)

  for (const node of nodes) {
    const layer = resolveLayoutLayer(node.layer)
    nodeInfoById[node.id] = {
      id: node.id,
      layer,
      layerRank: getOntologyCanvasLayerRank(layer),
      incomingEdges: [],
      outgoingEdges: [],
      depth: 0,
    }
  }

  for (const edge of edges) {
    if (nodeInfoById[edge.source]) {
      nodeInfoById[edge.source].outgoingEdges.push(edge.target)
    }
    if (nodeInfoById[edge.target]) {
      nodeInfoById[edge.target].incomingEdges.push(edge.source)
    }
  }

  for (const layer of CANONICAL_LAYER_IDS) {
    const nodesInLayer = Object.values(nodeInfoById)
      .filter(node => node.layer === layer)
    const terminalNodes = nodesInLayer.filter(node => (
      !node.outgoingEdges.some(targetId => (
        nodeInfoById[targetId]?.layer === layer
      ))
    ))

    for (const node of terminalNodes) {
      calculateDepth(node.id, nodeInfoById, new Set(), 0)
    }
  }

  const positions: Record<string, OntologyLayoutPosition> = Object.create(null)
  const nodeIdsByLayer = Object.fromEntries(
    CANONICAL_LAYER_IDS.map(layer => [layer, [] as string[]]),
  ) as Record<string, string[]>

  for (const info of Object.values(nodeInfoById)) {
    nodeIdsByLayer[info.layer].push(info.id)
  }

  const processY = (
    LAYER_BASE_Y
    + getOntologyCanvasLayerRank('Process') * LAYER_SPACING
  )
  const processNodeIds = nodeIdsByLayer.Process

  if (processNodeIds.length > 0) {
    const processOrder: string[] = []
    const processIdSet = new Set(processNodeIds)
    const visited = new Set<string>()
    const startNodeIds = processNodeIds.filter(nodeId => (
      !nodeInfoById[nodeId].incomingEdges.some(sourceId => (
        processIdSet.has(sourceId)
      ))
    ))

    function traverseProcess(nodeId: string): void {
      if (visited.has(nodeId) || !processIdSet.has(nodeId)) return
      visited.add(nodeId)
      processOrder.push(nodeId)

      for (const targetId of nodeInfoById[nodeId].outgoingEdges) {
        if (processIdSet.has(targetId)) {
          traverseProcess(targetId)
        }
      }
    }

    for (const startNodeId of startNodeIds) {
      traverseProcess(startNodeId)
    }
    for (const nodeId of processNodeIds) {
      if (!visited.has(nodeId)) processOrder.push(nodeId)
    }

    processOrder.forEach((nodeId, index) => {
      positions[nodeId] = {
        x: 100 + index * PROCESS_X_SPACING,
        y: processY,
      }
    })
  }

  for (const layer of ['KPI', 'Measure']) {
    const nodeIds = nodeIdsByLayer[layer]
    if (nodeIds.length === 0) continue

    const baseY = (
      LAYER_BASE_Y
      + getOntologyCanvasLayerRank(layer) * LAYER_SPACING
    )
    const nodeIdsByDepth: Record<number, string[]> = Object.create(null)

    for (const nodeId of nodeIds) {
      const depth = nodeInfoById[nodeId].depth
      if (!nodeIdsByDepth[depth]) nodeIdsByDepth[depth] = []
      nodeIdsByDepth[depth].push(nodeId)
    }

    const sortedDepths = Object.keys(nodeIdsByDepth)
      .map(Number)
      .sort((left, right) => left - right)

    sortedDepths.forEach((depth, depthIndex) => {
      nodeIdsByDepth[depth].forEach((nodeId, index) => {
        positions[nodeId] = {
          x: 100 + (index + 1) * NODE_X_SPACING,
          y: baseY + depthIndex * DEPTH_SPACING,
        }
      })
    })
  }

  const resourceNodeIds = nodeIdsByLayer.Resource
  if (resourceNodeIds.length > 0) {
    const resourceY = (
      LAYER_BASE_Y
      + getOntologyCanvasLayerRank('Resource') * LAYER_SPACING
    )

    resourceNodeIds.forEach((nodeId, index) => {
      positions[nodeId] = {
        x: 100 + (index + 1) * NODE_X_SPACING,
        y: resourceY,
      }
    })
  }

  const driverNodeIds = nodeIdsByLayer.Driver
  const driverY = (
    LAYER_BASE_Y
    + getOntologyCanvasLayerRank('Driver') * LAYER_SPACING
  )

  if (driverNodeIds.length > 0) {
    const driverTargetX: Record<string, number> = Object.create(null)

    for (const driverId of driverNodeIds) {
      const info = nodeInfoById[driverId]
      const connectedXs: number[] = []

      for (const targetId of info.outgoingEdges) {
        if (positions[targetId]) {
          connectedXs.push(positions[targetId].x)
        }
      }
      for (const sourceId of info.incomingEdges) {
        if (positions[sourceId]) {
          connectedXs.push(positions[sourceId].x)
        }
      }

      driverTargetX[driverId] = connectedXs.length > 0
        ? connectedXs.reduce((sum, x) => sum + x, 0) / connectedXs.length
        : 100 + Object.keys(driverTargetX).length * NODE_X_SPACING
    }

    const sortedDriverIds = [...driverNodeIds].sort((left, right) => (
      (driverTargetX[left] ?? 0) - (driverTargetX[right] ?? 0)
    ))
    const initialMinimumSpacing = NODE_X_SPACING * 0.8
    let lastX = Number.NEGATIVE_INFINITY

    for (const driverId of sortedDriverIds) {
      let targetX = driverTargetX[driverId]
      if (targetX < lastX + initialMinimumSpacing) {
        targetX = lastX + initialMinimumSpacing
      }
      positions[driverId] = { x: targetX, y: driverY }
      lastX = targetX
    }
  }

  for (let iteration = 0; iteration < DRIVER_PULL_ITERATIONS; iteration++) {
    for (const driverId of driverNodeIds) {
      const info = nodeInfoById[driverId]
      if (!positions[driverId]) continue

      let pullX = 0
      let pullCount = 0
      const connectedNodeIds = [
        ...info.outgoingEdges,
        ...info.incomingEdges,
      ]

      for (const connectedId of connectedNodeIds) {
        if (!positions[connectedId]) continue
        pullX += (positions[connectedId].x - positions[driverId].x) * 0.1
        pullCount += 1
      }

      if (pullCount > 0) {
        positions[driverId].x += pullX / pullCount
      }
    }

    const sortedDriverIds = [...driverNodeIds].sort((left, right) => (
      (positions[left]?.x ?? 0) - (positions[right]?.x ?? 0)
    ))
    const relaxedMinimumSpacing = NODE_X_SPACING * 0.7

    for (let index = 1; index < sortedDriverIds.length; index++) {
      const previous = sortedDriverIds[index - 1]
      const current = sortedDriverIds[index]
      if (
        positions[current]
        && positions[previous]
        && positions[current].x < positions[previous].x + relaxedMinimumSpacing
      ) {
        positions[current].x = (
          positions[previous].x
          + relaxedMinimumSpacing
        )
      }
    }
  }

  return positions
}
