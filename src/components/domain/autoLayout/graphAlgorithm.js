/**
 * 그래프 관련 코어 클래스 (ES module)
 * 데이터 구조와 레이아웃 알고리즘을 포함합니다.
 *
 * Ported from process-gpt-vue3/src/components/autoLayout/graph-algorithm.js
 */

// Module-level horizontal layout flag (set by bpmnAutoLayout before running)
let _isHorizontalLayout = false

export function setHorizontalLayout(value) {
  _isHorizontalLayout = !!value
}

/**
 * 그래프 데이터 구조 클래스
 * 노드와 엣지를 관리하며 그룹화 기능을 제공합니다.
 */
export class Graph {
  constructor() {
    this.nodes = []
    this.edges = []
    this.groups = []
    this.groupOrder = []
  }

  addNode(id, label) {
    this.nodes.push({
      id,
      label,
      x: 0,
      y: 0,
      layer: 0,
      order: 0,
      group: null,
      width: 0,
      height: 0,
    })
    return this
  }

  addEdge(source, target) {
    this.edges.push({ source, target })
    return this
  }

  getNode(id) {
    return this.nodes.find((node) => node.id === id)
  }

  getNodeIndex(id) {
    return this.nodes.findIndex((node) => node.id === id)
  }

  getOutgoingEdges(nodeId) {
    return this.edges.filter((edge) => edge.source === nodeId)
  }

  getIncomingEdges(nodeId) {
    return this.edges.filter((edge) => edge.target === nodeId)
  }

  createGroup(groupId, nodeIds) {
    nodeIds.forEach((nodeId) => {
      const node = this.getNode(nodeId)
      if (node) {
        node.group = groupId
      }
    })

    this.groups.push({
      id: groupId,
      nodes: nodeIds,
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
    })

    this.groupOrder.push(groupId)

    const isHorizontalLayout = _isHorizontalLayout

    const getGroupAveragePosition = (gId) => {
      const nodesInGroup = this.getNodesInGroup(gId)
      if (!nodesInGroup || nodesInGroup.length === 0) return { x: 0, y: 0 }

      let sumX = 0
      let sumY = 0
      nodesInGroup.forEach((node) => {
        sumX += node.x || 0
        sumY += node.y || 0
      })

      return {
        x: sumX / nodesInGroup.length,
        y: sumY / nodesInGroup.length,
      }
    }

    this.groupOrder.sort((a, b) => {
      const posA = getGroupAveragePosition(a)
      const posB = getGroupAveragePosition(b)

      if (isHorizontalLayout) {
        return posA.y - posB.y
      } else {
        return posA.x - posB.x
      }
    })

    return this
  }

  getNodesInGroup(groupId) {
    return this.nodes.filter((node) => node.group === groupId)
  }

  getGroup(groupId) {
    return this.groups.find((group) => group.id === groupId)
  }
}

/**
 * 스기야마(Sugiyama) 레이아웃 알고리즘 클래스
 * 계층적 그래프 레이아웃을 생성합니다.
 */
export class SugiyamaLayout {
  constructor(graph) {
    this.graph = graph
    this.layers = []
  }

  assignLayers() {
    this.graph.nodes.forEach((node) => {
      node.layer = 0
    })

    const assigned = new Set()
    const queue = []

    this.graph.nodes.forEach((node) => {
      if (this.graph.getIncomingEdges(node.id).length === 0) {
        queue.push(node.id)
        assigned.add(node.id)
        node.layer = 0
      }
    })

    while (queue.length > 0) {
      const currentId = queue.shift()
      const currentNode = this.graph.getNode(currentId)

      this.graph
        .getOutgoingEdges(currentId)
        .filter((e) => !e.feedback)
        .forEach((edge) => {
          const targetNode = this.graph.getNode(edge.target)
          targetNode.layer = Math.max(
            targetNode ? targetNode.layer : 0,
            currentNode.layer + 1
          )

          if (!assigned.has(edge.target)) {
            queue.push(edge.target)
            assigned.add(edge.target)
          }
        })
    }

    this.layers = []
    let maxLayer = 0

    this.graph.nodes.forEach((node) => {
      maxLayer = Math.max(maxLayer, node.layer)
    })

    for (let i = 0; i <= maxLayer; i++) {
      this.layers[i] = this.graph.nodes.filter((node) => node.layer === i)
    }

    return this
  }

  minimizeCrossings() {
    for (let i = 1; i < this.layers.length; i++) {
      this.orderLayer(i)
    }
    this.ensureGroupsAdjacentInLayers()
    return this
  }

  ensureGroupsAdjacentInLayers() {
    for (let layerIndex = 0; layerIndex < this.layers.length; layerIndex++) {
      const layer = this.layers[layerIndex]

      const groupedNodes = {}
      layer.forEach((node) => {
        if (node.group !== null) {
          if (!groupedNodes[node.group]) {
            groupedNodes[node.group] = []
          }
          groupedNodes[node.group].push(node)
        }
      })

      if (Object.keys(groupedNodes).length > 0) {
        let currentPos = 0
        const newOrder = []

        layer
          .filter((node) => node.group === null)
          .forEach((node) => {
            node.order = currentPos++
            newOrder.push(node)
          })

        for (const groupId in groupedNodes) {
          const groupNodes = groupedNodes[groupId]
          groupNodes.sort((a, b) => a.barycenter - b.barycenter)

          groupNodes.forEach((node) => {
            node.order = currentPos++
            newOrder.push(node)
          })
        }

        this.layers[layerIndex] = newOrder
      }
    }
  }

  orderLayer(layerIndex) {
    if (layerIndex <= 0 || layerIndex >= this.layers.length) return

    const currentLayer = this.layers[layerIndex]
    const prevLayer = this.layers[layerIndex - 1]

    currentLayer.forEach((node) => {
      const incomingEdges = this.graph
        .getIncomingEdges(node.id)
        .filter((e) => !e.feedback)
      if (incomingEdges.length === 0) {
        node.barycenter = 0
        return
      }

      let sum = 0
      incomingEdges.forEach((edge) => {
        const sourceNode = this.graph.getNode(edge.source)
        const sourceIndex = prevLayer.findIndex((n) => n.id === sourceNode.id)
        if (sourceIndex >= 0) {
          sum += sourceIndex
        }
      })

      node.barycenter = sum / incomingEdges.length
    })

    currentLayer.sort((a, b) => a.barycenter - b.barycenter)

    currentLayer.forEach((node, index) => {
      node.order = index
    })
  }

  assignCoordinates() {
    const defaultNodeWidth = 100
    const defaultNodeHeight = 40
    const layerHeight = 150
    const horizontalSpacing = 20
    const minNodeMargin = 10

    this.initializeGroupBoundaries()

    const groupOrderMap = {}
    this.graph.groupOrder.forEach((groupId, index) => {
      groupOrderMap[groupId] = index
    })

    const groupHorizontalRanges = this.calculateGroupHorizontalRanges(0, 0)

    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i]

      const nodesPerGroup = {}
      layer.forEach((node) => {
        if (!nodesPerGroup[node.group]) {
          nodesPerGroup[node.group] = []
        }
        nodesPerGroup[node.group].push(node)
      })

      for (const groupId in nodesPerGroup) {
        const groupNodes = nodesPerGroup[groupId]
        let groupRange = groupHorizontalRanges[groupId]

        // Fallback: 그룹이 없거나(null) 범위를 못 찾는 노드도 좌표 배정
        if (!groupRange) {
          // 전체 그룹 범위의 끝에 이어서 배치하거나, 그룹이 아예 없으면 0부터 시작
          let fallbackStart = 0
          for (const gId in groupHorizontalRanges) {
            fallbackStart = Math.max(fallbackStart, groupHorizontalRanges[gId].maxX)
          }
          const fallbackWidth = 120 * Math.max(groupNodes.length, 1)
          groupRange = {
            minX: fallbackStart,
            maxX: fallbackStart + fallbackWidth,
          }
        }

        const totalNodesWidth = groupNodes.length * defaultNodeWidth
        const totalSpacing = horizontalSpacing * (groupNodes.length - 1)

        let actualSpacing = horizontalSpacing
        const availableWidth =
          groupRange.maxX - groupRange.minX - 2 * minNodeMargin
        if (totalNodesWidth + totalSpacing > availableWidth) {
          actualSpacing = Math.max(
            5,
            (availableWidth - totalNodesWidth) / (groupNodes.length - 1 || 1)
          )
        }

        let startX = groupRange.minX + minNodeMargin
        startX = Math.max(groupRange.minX + minNodeMargin, startX)

        let currentX = startX

        groupNodes.sort((a, b) => a.order - b.order)

        groupNodes.forEach((node) => {
          const width = defaultNodeWidth
          let nodeX = currentX + width / 2

          const leftBound = groupRange.minX + minNodeMargin
          if (nodeX - width / 2 < leftBound) {
            nodeX = leftBound + width / 2
          }

          const rightBound = groupRange.maxX - minNodeMargin
          if (nodeX + width / 2 > rightBound) {
            nodeX = rightBound - width / 2
          }

          node.x = nodeX
          node.y = i * layerHeight + 40

          currentX = nodeX + width / 2 + actualSpacing
        })
      }
    }

    this.updateGroupBoundaries(layerHeight)

    return this
  }

  calculateGroupHorizontalRanges(totalWidth, spacing) {
    const ranges = {}
    const groupCount = this.graph.groupOrder.length

    if (groupCount === 0) return ranges

    const groupLayerDensity = {}

    this.graph.groupOrder.forEach((groupId) => {
      const nodesInGroup = this.graph.getNodesInGroup(groupId)

      const layerCounts = {}
      let maxNodesInLayer = 0

      nodesInGroup.forEach((node) => {
        const layer = node.layer || 0
        if (!layerCounts[layer]) layerCounts[layer] = 0
        layerCounts[layer]++
        maxNodesInLayer = Math.max(maxNodesInLayer, layerCounts[layer])
      })

      groupLayerDensity[groupId] = {
        layerCounts,
        maxNodesInLayer,
      }
    })

    let currentX = 0
    Object.keys(groupLayerDensity).forEach((groupId) => {
      const group = groupLayerDensity[groupId]
      const baseWidth = 120
      const groupWidth = baseWidth * group.maxNodesInLayer
      ranges[groupId] = {
        minX: currentX,
        maxX: currentX + groupWidth,
      }
      currentX += groupWidth
    })

    return ranges
  }

  initializeGroupBoundaries() {
    this.graph.groups.forEach((group) => {
      group.minX = Infinity
      group.maxX = -Infinity
      group.minY = Infinity
      group.maxY = -Infinity
    })
  }

  updateGroupBoundaries(layerHeight) {
    let globalMaxLayer = 0
    this.graph.nodes.forEach((node) => {
      globalMaxLayer = Math.max(globalMaxLayer, node.layer || 0)
    })

    const groupHorizontalRanges = this.calculateGroupHorizontalRanges(0, 0)

    this.graph.groupOrder.forEach((groupId) => {
      const group = this.graph.getGroup(groupId)
      if (group) {
        const groupRange = groupHorizontalRanges[groupId]
        if (!groupRange) return

        const laneMinX = groupRange.minX
        const laneMaxX = groupRange.maxX

        group.minX = laneMinX
        group.maxX = laneMaxX

        const totalHeight = (globalMaxLayer + 1) * layerHeight
        group.minY = 0
        group.maxY = totalHeight
        group.height = group.maxY - group.minY

        const nodeMargin = 10
        this.graph.nodes.forEach((node) => {
          if (node.group === groupId) {
            this.ensureNodeWithinLaneBounds(node, laneMinX, laneMaxX, nodeMargin)
          }
        })
      }
    })

    return this
  }

  calculateGroupBoundaries() {
    return this
  }

  adjustGroupsToAvoidOverlaps(spacing = 20) {
    return this
  }

  adjustNodePositionsForGroups() {
    this.graph.nodes.forEach((node) => {
      if (node.group) {
        const group = this.graph.getGroup(node.group)
        if (group) {
          const nodeMargin = 10
          this.ensureNodeWithinLaneBounds(node, group.minX, group.maxX, nodeMargin)
        }
      }
    })
    return this
  }

  calculateGroupHeights(layerHeight = 120) {
    return this
  }

  generateEdgeCoordinates() {
    const spacing = 20
    const gridSize = 20
    const maxSteps = 300

    const getBoundaryPoint = (node, to, allObstacles, isStart) => {
      const testLength = 60
      const directions = {
        right: { dx: 1, dy: 0 },
        left: { dx: -1, dy: 0 },
        top: { dx: 0, dy: -1 },
        bottom: { dx: 0, dy: 1 },
      }

      const isHorizontalLayout = _isHorizontalLayout

      const defaultNodeWidth = 100
      const defaultNodeHeight = 40

      const halfWidth = isHorizontalLayout
        ? (node.height || defaultNodeHeight) / 2
        : (node.width || defaultNodeWidth) / 2
      const halfHeight = isHorizontalLayout
        ? (node.width || defaultNodeWidth) / 2
        : (node.height || defaultNodeHeight) / 2

      const portPoints = {
        left: { x: node.x - halfWidth, y: node.y, direction: 'left' },
        right: { x: node.x + halfWidth, y: node.y, direction: 'right' },
        top: { x: node.x, y: node.y - halfHeight, direction: 'top' },
        bottom: { x: node.x, y: node.y + halfHeight, direction: 'bottom' },
      }

      const priority = { free: 3, group: 2, node: 1 }

      const checkDirection = (dirKey) => {
        const { x, y } = portPoints[dirKey]
        const { dx, dy } = directions[dirKey]
        let status = 'free'

        for (let d = 0; d < testLength; d += 10) {
          const px = x + dx * d
          const py = y + dy * d
          for (const obs of allObstacles) {
            const left = obs.x - obs.width / 2
            const right = obs.x + obs.width / 2
            const top = obs.y - obs.height / 2
            const bottom = obs.y + obs.height / 2

            if (px >= left && px <= right && py >= top && py <= bottom) {
              if (obs.type === 'node') return 'node'
              if (obs.type === 'group' && status !== 'node') status = 'group'
            }
          }
        }

        return status
      }

      const dx = to.x - node.x
      const dy = to.y - node.y

      const toDirs = []
      if (dy < 0) toDirs.push('top')
      if (dy > 0) toDirs.push('bottom')
      if (dx > 0) toDirs.push('right')
      if (dx < 0) toDirs.push('left')

      const allDirs = ['top', 'right', 'bottom', 'left']
      let orderedDirs = [
        ...toDirs,
        ...allDirs.filter((d) => !toDirs.includes(d)),
      ]

      if (isStart) {
        orderedDirs = orderedDirs.filter((d) => d !== 'top')
      } else {
        orderedDirs = orderedDirs.filter((d) => d !== 'left')
      }

      const directionScores = {}
      for (const dir of orderedDirs) {
        directionScores[dir] = checkDirection(dir)
      }

      const bestDir = Object.entries(directionScores).sort(
        (a, b) => priority[b[1]] - priority[a[1]]
      )[0][0]

      return portPoints[bestDir]
    }

    const getAllObstacles = () => {
      return this.graph.nodes
        .filter((node) => node.id && node.width && node.height)
        .map((node) => ({
          id: node.id,
          x: node.x,
          y: node.y,
          width: node.width + spacing,
          height: node.height + spacing,
        }))
    }

    const intersectsObstacle = (p, obstacles) => {
      return obstacles.some((obs) => {
        const left = obs.x - obs.width / 2
        const right = obs.x + obs.width / 2
        const top = obs.y - obs.height / 2
        const bottom = obs.y + obs.height / 2

        return p.x >= left && p.x <= right && p.y >= top && p.y <= bottom
      })
    }

    const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)

    const optimizePath = (path) => {
      if (path.length <= 2) return path

      const epsilon = 0.5

      const areColinear = (p1, p2, p3) => {
        const dx1 = p2.x - p1.x
        const dy1 = p2.y - p1.y
        const dx2 = p3.x - p2.x
        const dy2 = p3.y - p2.y
        return Math.abs(dx1 * dy2 - dy1 * dx2) < epsilon
      }

      const result = [path[0]]
      let prev = path[0]

      for (let i = 1; i < path.length - 1; i++) {
        const curr = path[i]
        const next = path[i + 1]
        if (!areColinear(prev, curr, next)) {
          result.push(curr)
          prev = curr
        }
      }

      result.push(path[path.length - 1])
      return result
    }

    const findOrthogonalPath = (start, end, obstacles) => {
      const canDrawDirectLine = (p1, p2) => {
        if (p1.x === p2.x || p1.y === p2.y) {
          const steps = 10
          const dx = (p2.x - p1.x) / steps
          const dy = (p2.y - p1.y) / steps

          for (let i = 0; i <= steps; i++) {
            const x = p1.x + dx * i
            const y = p1.y + dy * i
            if (intersectsObstacle({ x, y }, obstacles)) {
              return false
            }
          }
          return true
        }
        return false
      }

      if (canDrawDirectLine(start, end)) {
        return optimizePath([start, end])
      }

      const midPoint1 = { x: end.x, y: start.y }
      const midPoint2 = { x: start.x, y: end.y }

      if (
        canDrawDirectLine(start, midPoint1) &&
        canDrawDirectLine(midPoint1, end)
      ) {
        return optimizePath([start, midPoint1, end])
      }

      if (
        canDrawDirectLine(start, midPoint2) &&
        canDrawDirectLine(midPoint2, end)
      ) {
        return optimizePath([start, midPoint2, end])
      }

      const visited = new Set()
      const queue = [{ point: start, path: [start], turns: 0 }]
      const serialize = (p) => `${p.x},${p.y}`

      const directDistance = manhattan(start, end)
      if (directDistance > 2000) {
        const midPoint = {
          x: (start.x + end.x) / 2,
          y: (start.y + end.y) / 2,
        }
        return optimizePath([start, midPoint, end])
      }

      const getDirectionPriority = (curr, target, currDirection) => {
        const dx = target.x - curr.x
        const dy = target.y - curr.y
        const dirs = []

        if (currDirection) {
          if (currDirection.dx !== 0) {
            const continuedX =
              dx > 0
                ? { dx: gridSize, dy: 0 }
                : { dx: -gridSize, dy: 0 }
            dirs.push(continuedX)
          } else if (currDirection.dy !== 0) {
            const continuedY =
              dy > 0
                ? { dx: 0, dy: gridSize }
                : { dx: 0, dy: -gridSize }
            dirs.push(continuedY)
          }
        }

        if (Math.abs(dx) > Math.abs(dy)) {
          dirs.push({ dx: dx > 0 ? gridSize : -gridSize, dy: 0 })
          dirs.push({ dx: 0, dy: dy > 0 ? gridSize : -gridSize })
        } else {
          dirs.push({ dx: 0, dy: dy > 0 ? gridSize : -gridSize })
          dirs.push({ dx: dx > 0 ? gridSize : -gridSize, dy: 0 })
        }

        return [
          ...new Map(dirs.map((d) => [`${d.dx},${d.dy}`, d])).values(),
        ]
      }

      let bestPath = null
      let bestTurns = Infinity

      for (let steps = 0; steps < maxSteps; steps++) {
        if (queue.length > 1000) {
          queue.sort((a, b) => {
            const scoreA = a.turns * 10 + manhattan(a.point, end)
            const scoreB = b.turns * 10 + manhattan(b.point, end)
            return scoreA - scoreB
          })
          queue.splice(100)
        }

        if (queue.length === 0) break

        queue.sort((a, b) => {
          if (a.turns !== b.turns) return a.turns - b.turns
          return manhattan(a.point, end) - manhattan(b.point, end)
        })

        const { point, path, turns } = queue.shift()

        if (bestPath && turns >= bestTurns) continue

        if (manhattan(point, end) < gridSize) {
          const fullPath = [...path, end]

          let pathTurns = 0
          for (let i = 1; i < fullPath.length - 1; i++) {
            const prev = fullPath[i - 1]
            const curr = fullPath[i]
            const next = fullPath[i + 1]

            if (
              !(
                (prev.x === curr.x && curr.x === next.x) ||
                (prev.y === curr.y && curr.y === next.y)
              )
            ) {
              pathTurns++
            }
          }

          if (pathTurns < bestTurns) {
            bestPath = fullPath
            bestTurns = pathTurns
          }

          if (pathTurns <= 2) {
            return bestPath
          }

          continue
        }

        const currDirection =
          path.length > 1
            ? {
                dx: point.x - path[path.length - 2].x,
                dy: point.y - path[path.length - 2].y,
              }
            : null

        const priorityDirections = getDirectionPriority(
          point,
          end,
          currDirection
        )
        for (const direction of priorityDirections) {
          const next = {
            x:
              Math.round((point.x + direction.dx) / gridSize) *
              gridSize,
            y:
              Math.round((point.y + direction.dy) / gridSize) *
              gridSize,
          }
          const key = serialize(next)
          if (visited.has(key)) continue
          visited.add(key)

          if (!intersectsObstacle(next, obstacles)) {
            if (path.length > maxSteps / 2) continue

            let newTurns = turns
            if (path.length > 1) {
              const prev = path[path.length - 2]
              const curr = point

              const prevDx = curr.x - prev.x
              const prevDy = curr.y - prev.y

              if (
                (prevDx !== 0 && direction.dx === 0) ||
                (prevDy !== 0 && direction.dy === 0)
              ) {
                newTurns++
              }
            }

            queue.push({
              point: next,
              path: [...path, next],
              turns: newTurns,
            })
          }
        }
      }

      if (bestPath) {
        return optimizePath(bestPath)
      }

      const horizontal =
        Math.abs(end.x - start.x) > Math.abs(end.y - start.y)
      const midPoint = horizontal
        ? { x: end.x, y: start.y }
        : { x: start.x, y: end.y }

      return optimizePath([start, midPoint, end])
    }

    const obstacles = getAllObstacles()
    const baseStep = 15

    const adjustInitialStep = (point) => {
      const { x, y, direction } = point
      switch (direction) {
        case 'left':
          return { x: x - baseStep, y, direction }
        case 'right':
          return { x: x + baseStep, y, direction }
        case 'top':
          return { x, y: y - baseStep, direction }
        case 'bottom':
          return { x, y: y + baseStep, direction }
        default:
          return point
      }
    }

    this.graph.edges.forEach((edge) => {
      const source = this.graph.getNode(edge.source)
      const target = this.graph.getNode(edge.target)
      if (!source || !target) return

      const rawStart = getBoundaryPoint(source, target, obstacles, true)
      const rawEnd = getBoundaryPoint(target, source, obstacles, false)

      const startPoint = adjustInitialStep(rawStart)
      const endPoint = adjustInitialStep(rawEnd)

      const filteredObstacles = obstacles.filter(
        (o) => o.id !== source.id && o.id !== target.id
      )
      const path = findOrthogonalPath(startPoint, endPoint, filteredObstacles)

      edge.waypoints = [
        { x: rawStart.x, y: rawStart.y },
        ...path,
        { x: rawEnd.x, y: rawEnd.y },
      ]
    })

    return this
  }

  simplifyAllEdgePaths() {
    const epsilon = 0.5

    const areColinear = (p1, p2, p3) => {
      const dx1 = p2.x - p1.x
      const dy1 = p2.y - p1.y
      const dx2 = p3.x - p2.x
      const dy2 = p3.y - p2.y
      return Math.abs(dx1 * dy2 - dy1 * dx2) < epsilon
    }

    this.graph.edges.forEach((edge) => {
      const wp = edge.waypoints
      if (!wp || wp.length <= 2) return

      const result = [wp[0]]
      let prev = wp[0]

      for (let i = 1; i < wp.length - 1; i++) {
        const curr = wp[i]
        const next = wp[i + 1]
        if (!areColinear(prev, curr, next)) {
          result.push(curr)
          prev = curr
        }
      }

      result.push(wp[wp.length - 1])
      edge.waypoints = result
    })
    return this
  }

  ensureNodeWithinLaneBounds(node, laneMinX, laneMaxX, nodeMargin) {
    if (!node || !node.width) return node

    const nodeHalfWidth = node.width / 2
    const leftBoundary = laneMinX + nodeMargin
    const rightBoundary = laneMaxX - nodeMargin
    const leftEdge = node.x - nodeHalfWidth
    const rightEdge = node.x + nodeHalfWidth

    if (leftEdge < leftBoundary) {
      node.x = leftBoundary + nodeHalfWidth
    }

    if (rightEdge > rightBoundary) {
      node.x = rightBoundary - nodeHalfWidth
    }

    return node
  }

  markFeedbackEdges() {
    const visited = new Set()
    const stack = new Set()

    const dfs = (nodeId) => {
      if (stack.has(nodeId)) return
      if (visited.has(nodeId)) return
      visited.add(nodeId)
      stack.add(nodeId)

      const outEdges = this.graph.getOutgoingEdges(nodeId)

      outEdges.forEach((edge) => {
        const targetId = edge.target
        if (stack.has(targetId)) {
          edge.feedback = true
        } else {
          dfs(targetId)
        }
      })

      stack.delete(nodeId)
    }

    this.graph.nodes.forEach((node) => dfs(node.id))

    return this
  }

  run() {
    this.markFeedbackEdges()
      .assignLayers()
      .assignCoordinates()
      .calculateGroupHeights()
      .adjustNodePositionsForGroups()
      .generateEdgeCoordinates()
      .simplifyAllEdgePaths()
    return this.graph
  }
}
