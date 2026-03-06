/**
 * BPMN 자동 레이아웃 모듈 (ES module)
 * bpmn-js Modeler 인스턴스에 Sugiyama 기반 자동 레이아웃을 적용합니다.
 *
 * Ported from process-gpt-vue3/src/components/autoLayout/bpmn-auto-layout.js
 */

import { Graph, setHorizontalLayout } from './graphAlgorithm.js'
import { EnhancedSugiyamaLayout } from './enhancedSugiyamaLayout.js'

/**
 * BPMN 다이어그램에 자동 레이아웃 적용
 * @param {Object} bpmnModeler - BPMN-JS 모델러 인스턴스
 * @param {Object} options - 레이아웃 옵션
 * @param {boolean} options.horizontal - 가로 방향 레이아웃 사용 여부
 */
export function applyAutoLayout(bpmnModeler, options = {}) {
  const { horizontal = false } = options

  // Set module-level horizontal flag for graphAlgorithm
  setHorizontalLayout(horizontal)

  if (!bpmnModeler) {
    throw new Error('BPMN 모델러가 제공되지 않았습니다.')
  }

  try {
    const graph = new Graph()

    // BPMN 모델에서 요소 가져오기
    const elements = bpmnModeler.get('elementRegistry').getAll()

    // 서브프로세스가 있으면 레이아웃 적용하지 않음
    let isSubprocessImported = false
    elements.forEach((element) => {
      if (element.type === 'bpmn:SubProcess') {
        isSubprocessImported = true
      }
    })
    if (isSubprocessImported) {
      return
    }

    // 노드 맵 생성
    const nodeMap = {}

    const validNodeTypes = [
      'bpmn:Task',
      'bpmn:UserTask',
      'bpmn:ServiceTask',
      'bpmn:ScriptTask',
      'bpmn:BusinessRuleTask',
      'bpmn:SendTask',
      'bpmn:ReceiveTask',
      'bpmn:ManualTask',
      'bpmn:StartEvent',
      'bpmn:EndEvent',
      'bpmn:IntermediateThrowEvent',
      'bpmn:IntermediateCatchEvent',
      'bpmn:ExclusiveGateway',
      'bpmn:ParallelGateway',
      'bpmn:InclusiveGateway',
      'bpmn:EventBasedGateway',
      'bpmn:SubProcess',
      'bpmn:CallActivity',
    ]

    function getTypeLabel(elementType) {
      const typeMap = {
        'bpmn:Task': '작업',
        'bpmn:UserTask': '사용자 작업',
        'bpmn:ServiceTask': '서비스 작업',
        'bpmn:SendTask': '전송 작업',
        'bpmn:ReceiveTask': '수신 작업',
        'bpmn:ManualTask': '수동 작업',
        'bpmn:BusinessRuleTask': '업무 규칙 작업',
        'bpmn:ScriptTask': '스크립트 작업',
        'bpmn:StartEvent': '시작 이벤트',
        'bpmn:EndEvent': '종료 이벤트',
        'bpmn:IntermediateThrowEvent': '중간 이벤트(발생)',
        'bpmn:IntermediateCatchEvent': '중간 이벤트(수신)',
        'bpmn:ExclusiveGateway': '배타 게이트웨이',
        'bpmn:ParallelGateway': '병렬 게이트웨이',
        'bpmn:InclusiveGateway': '포괄 게이트웨이',
        'bpmn:EventBasedGateway': '이벤트 기반 게이트웨이',
        'bpmn:SubProcess': '서브프로세스',
        'bpmn:Participant': '참여자',
        'bpmn:Lane': '레인',
        'bpmn:TextAnnotation': '텍스트 주석',
        'bpmn:DataObjectReference': '데이터 객체',
        'bpmn:DataStoreReference': '데이터 저장소',
      }
      return typeMap[elementType] || elementType.replace('bpmn:', '')
    }

    // 노드 추가
    elements.forEach((element) => {
      if (
        element.businessObject &&
        element.businessObject.$type &&
        !element.labelTarget &&
        validNodeTypes.includes(element.businessObject.$type)
      ) {
        const id = element.id
        const type = getTypeLabel(element.businessObject.$type)
        const label = element.businessObject.name || type

        graph.addNode(id, label)
        const node = graph.getNode(id)
        node.width = element.width || 100
        node.height = element.height || 80
        node.nodeType = element.businessObject.$type

        nodeMap[id] = element
      }
    })

    // 엣지 추가 (SequenceFlow만)
    elements.forEach((element) => {
      if (
        element.businessObject &&
        element.businessObject.$type === 'bpmn:SequenceFlow' &&
        element.source &&
        element.target &&
        nodeMap[element.source.id] &&
        nodeMap[element.target.id]
      ) {
        graph.addEdge(element.source.id, element.target.id)
      }
    })

    // 그룹화 처리
    const participantsWithLanes = new Set()

    elements.forEach((element) => {
      if (
        element.businessObject &&
        element.businessObject.$type === 'bpmn:Lane'
      ) {
        if (
          element.parent &&
          element.parent.businessObject &&
          element.parent.businessObject.$type === 'bpmn:Participant'
        ) {
          participantsWithLanes.add(element.parent.id)
        }
      }
    })

    function sortGroupsAndOrder(g, els) {
      g.groupOrder.sort((a, b) => {
        const elA = els.find((el) => el.id === a)
        const elB = els.find((el) => el.id === b)
        if (!elA || !elB) return 0
        if (horizontal) {
          return elA.y - elB.y
        } else {
          return elA.x - elB.x
        }
      })

      g.groups = g.groupOrder
        .map((id) => g.groups.find((gr) => gr.id === id))
        .filter(Boolean)
    }

    function isElementInLane(element, lane) {
      if (!element || !lane) return false
      const elementMidX = element.x + element.width / 2
      const elementMidY = element.y + element.height / 2

      return (
        elementMidX >= lane.x &&
        elementMidX <= lane.x + lane.width &&
        elementMidY >= lane.y &&
        elementMidY <= lane.y + lane.height
      )
    }

    elements.forEach((element) => {
      if (element.businessObject && element.businessObject.$type) {
        if (element.businessObject.$type === 'bpmn:SubProcess') {
          const childElements = []
          elements.forEach((child) => {
            if (
              child.parent &&
              child.parent.id === element.id &&
              child.businessObject &&
              !child.labelTarget
            ) {
              childElements.push(child.id)
            }
          })
          if (childElements.length > 0) {
            graph.createGroup(element.id, childElements)
          }
        } else if (element.businessObject.$type === 'bpmn:Lane') {
          const childElements = []
          elements.forEach((child) => {
            if (
              child.id !== element.id &&
              child.businessObject &&
              !child.labelTarget &&
              isElementInLane(child, element)
            ) {
              childElements.push(child.id)
            }
          })
          if (element.businessObject.flowNodeRef) {
            element.businessObject.flowNodeRef.forEach((ref) => {
              const childElement = elements.find(
                (el) =>
                  el.businessObject && el.businessObject.id === ref.id
              )
              if (childElement && !childElements.includes(childElement.id)) {
                childElements.push(childElement.id)
              }
            })
          }
          if (childElements.length > 0) {
            graph.createGroup(element.id, childElements)
          }
        } else if (
          element.businessObject.$type === 'bpmn:Participant' &&
          !participantsWithLanes.has(element.id)
        ) {
          const childElements = []
          elements.forEach((child) => {
            if (
              child.parent &&
              child.parent.id === element.id &&
              child.businessObject &&
              !child.labelTarget
            ) {
              childElements.push(child.id)
            }
          })
          if (childElements.length > 0) {
            graph.createGroup(element.id, childElements)
          }
        }
      }
    })

    sortGroupsAndOrder(graph, elements)

    // ── 그룹 미할당 노드를 연결 기반으로 추론 배정 ──
    // 게이트웨이 등이 어떤 레인에도 배정되지 않으면
    // assignCoordinates에서 좌표가 (0,0)으로 남아 공중에 뜨는 버그 수정
    let changed = true
    while (changed) {
      changed = false
      graph.nodes.forEach((node) => {
        if (node.group !== null) return

        // 연결된 노드들의 그룹을 수집
        const neighborGroups = {}
        const outEdges = graph.getOutgoingEdges(node.id)
        const inEdges = graph.getIncomingEdges(node.id)
        ;[...outEdges, ...inEdges].forEach((edge) => {
          const neighborId = edge.source === node.id ? edge.target : edge.source
          const neighbor = graph.getNode(neighborId)
          if (neighbor && neighbor.group !== null) {
            neighborGroups[neighbor.group] = (neighborGroups[neighbor.group] || 0) + 1
          }
        })

        // 가장 많이 연결된 그룹에 배정
        let bestGroup = null
        let bestCount = 0
        for (const [gId, count] of Object.entries(neighborGroups)) {
          if (count > bestCount) {
            bestCount = count
            bestGroup = gId
          }
        }

        if (bestGroup !== null) {
          node.group = bestGroup
          const group = graph.getGroup(bestGroup)
          if (group && !group.nodes.includes(node.id)) {
            group.nodes.push(node.id)
          }
          changed = true
        }
      })
    }

    // ── Boundary Event 사전 캡처 ──

    function captureBoundaryAttachments(els) {
      const map = new Map()
      els.forEach((el) => {
        if (
          !el.businessObject ||
          el.businessObject.$type !== 'bpmn:BoundaryEvent'
        )
          return

        let host = el.host
        if (!host && el.businessObject.attachedToRef) {
          const hostBoId = el.businessObject.attachedToRef.id
          host = els.find(
            (e) => e.businessObject && e.businessObject.id === hostBoId
          )
        }
        if (!host) return
        if (typeof host.x !== 'number' || typeof host.y !== 'number') return

        const bw = el.width || 36
        const bh = el.height || 36
        const centerX = el.x + bw / 2
        const centerY = el.y + bh / 2

        const hostLeft = host.x
        const hostRight = host.x + host.width
        const hostTop = host.y
        const hostBottom = host.y + host.height

        const dLeft = Math.abs(centerX - hostLeft)
        const dRight = Math.abs(centerX - hostRight)
        const dTop = Math.abs(centerY - hostTop)
        const dBottom = Math.abs(centerY - hostBottom)

        let side = 'left'
        let min = dLeft
        if (dRight < min) { min = dRight; side = 'right' }
        if (dTop < min) { min = dTop; side = 'top' }
        if (dBottom < min) { side = 'bottom' }

        let t = 0.5
        const hostWidth = host.width || 100
        const hostHeight = host.height || 80

        if ((side === 'left' || side === 'right') && hostHeight > 0) {
          t = (centerY - hostTop) / hostHeight
        } else if ((side === 'top' || side === 'bottom') && hostWidth > 0) {
          t = (centerX - hostLeft) / hostWidth
        }
        t = Math.min(1, Math.max(0, t))

        const labels = []
        if (el.labels && el.labels.length > 0) {
          el.labels.forEach((label) => {
            if (!label || typeof label.x !== 'number' || typeof label.y !== 'number') return
            const lw = label.width || 0
            const lh = label.height || 0
            const labelCenterX = label.x + lw / 2
            const labelCenterY = label.y + lh / 2
            labels.push({
              labelId: label.id,
              dx: labelCenterX - centerX,
              dy: labelCenterY - centerY,
              width: lw,
              height: lh,
            })
          })
        }

        map.set(el.id, {
          boundaryId: el.id,
          hostId: host.id,
          side,
          t,
          labels,
        })
      })
      return map
    }

    function getElementAttachmentFromPoint(point, element) {
      if (
        !point || !element ||
        typeof element.x !== 'number' || typeof element.y !== 'number' ||
        typeof element.width !== 'number' || typeof element.height !== 'number'
      ) {
        return null
      }

      const left = element.x
      const right = element.x + element.width
      const top = element.y
      const bottom = element.y + element.height

      const dLeft = Math.abs(point.x - left)
      const dRight = Math.abs(point.x - right)
      const dTop = Math.abs(point.y - top)
      const dBottom = Math.abs(point.y - bottom)

      let side = 'left'
      let min = dLeft
      if (dRight < min) { min = dRight; side = 'right' }
      if (dTop < min) { min = dTop; side = 'top' }
      if (dBottom < min) { side = 'bottom' }

      let t = 0.5
      if ((side === 'left' || side === 'right') && element.height > 0) {
        t = (point.y - top) / element.height
      } else if ((side === 'top' || side === 'bottom') && element.width > 0) {
        t = (point.x - left) / element.width
      }
      t = Math.min(1, Math.max(0, t))

      return { side, t }
    }

    function captureBoundaryFlowEndpoints(els) {
      const map = new Map()
      els.forEach((el) => {
        if (
          !el.businessObject ||
          el.businessObject.$type !== 'bpmn:SequenceFlow' ||
          !el.waypoints || !Array.isArray(el.waypoints) || el.waypoints.length < 2
        ) {
          return
        }

        const source = el.source
        const target = el.target

        const isSourceBoundary =
          source && source.businessObject && source.businessObject.$type === 'bpmn:BoundaryEvent'
        const isTargetBoundary =
          target && target.businessObject && target.businessObject.$type === 'bpmn:BoundaryEvent'

        if (!isSourceBoundary && !isTargetBoundary) return

        const startPoint = el.waypoints[0]
        const endPoint = el.waypoints[el.waypoints.length - 1]

        const sourceAttach = getElementAttachmentFromPoint(startPoint, source)
        const targetAttach = getElementAttachmentFromPoint(endPoint, target)

        const innerPoints = el.waypoints.slice(1, el.waypoints.length - 1)

        let minX = Math.min(startPoint.x, endPoint.x)
        let maxX = Math.max(startPoint.x, endPoint.x)
        let minY = Math.min(startPoint.y, endPoint.y)
        let maxY = Math.max(startPoint.y, endPoint.y)

        innerPoints.forEach((p) => {
          if (typeof p.x === 'number' && typeof p.y === 'number') {
            if (p.x < minX) minX = p.x
            if (p.x > maxX) maxX = p.x
            if (p.y < minY) minY = p.y
            if (p.y > maxY) maxY = p.y
          }
        })

        const width = maxX - minX || 1
        const height = maxY - minY || 1

        const innerNormalized = innerPoints.map((p) => ({
          nx: (p.x - minX) / width,
          ny: (p.y - minY) / height,
        }))

        map.set(el.id, {
          source: sourceAttach,
          target: targetAttach,
          inner: innerNormalized,
        })
      })
      return map
    }

    function applyBoundaryAttachments(attachments, els, modeling) {
      if (!attachments || attachments.size === 0) return

      attachments.forEach((info) => {
        const boundary = els.find((e) => e.id === info.boundaryId)
        const host = els.find((e) => e.id === info.hostId)

        if (
          !boundary || !host ||
          typeof host.x !== 'number' || typeof host.y !== 'number' ||
          typeof host.width !== 'number' || typeof host.height !== 'number'
        ) {
          return
        }

        const bw = boundary.width || 36
        const bh = boundary.height || 36

        const hostLeft = host.x
        const hostRight = host.x + host.width
        const hostTop = host.y
        const hostBottom = host.y + host.height

        let centerX = hostLeft + host.width / 2
        let centerY = hostTop + host.height / 2

        const t = typeof info.t === 'number' ? info.t : 0.5

        if (info.side === 'left') {
          centerX = hostLeft; centerY = hostTop + host.height * t
        } else if (info.side === 'right') {
          centerX = hostRight; centerY = hostTop + host.height * t
        } else if (info.side === 'top') {
          centerX = hostLeft + host.width * t; centerY = hostTop
        } else if (info.side === 'bottom') {
          centerX = hostLeft + host.width * t; centerY = hostBottom
        }

        const newX = centerX - bw / 2
        const newY = centerY - bh / 2
        const dx = newX - boundary.x
        const dy = newY - boundary.y

        if (Math.abs(dx) >= 0.5 || Math.abs(dy) >= 0.5) {
          try {
            modeling.moveShape(boundary, { x: dx, y: dy })
          } catch (err) {
            console.warn(`Boundary ${boundary.id} 위치 보정 오류:`, err)
          }
        }

        const labelsInfo = info.labels || []
        labelsInfo.forEach((li) => {
          const labelEl = els.find((e) => e.id === li.labelId)
          if (!labelEl || typeof labelEl.x !== 'number' || typeof labelEl.y !== 'number') return

          const lw = labelEl.width || li.width || 0
          const lh = labelEl.height || li.height || 0

          const newLabelCenterX = centerX + li.dx
          const newLabelCenterY = centerY + li.dy

          const ldx = newLabelCenterX - lw / 2 - labelEl.x
          const ldy = newLabelCenterY - lh / 2 - labelEl.y

          if (Math.abs(ldx) < 0.5 && Math.abs(ldy) < 0.5) return

          try {
            modeling.moveShape(labelEl, { x: ldx, y: ldy })
          } catch (err) {
            console.warn(`Boundary 라벨 ${labelEl.id} 위치 보정 오류:`, err)
          }
        })
      })
    }

    function snapPointToElementCorner(point, element) {
      if (
        !point || !element ||
        typeof element.x !== 'number' || typeof element.y !== 'number'
      ) {
        return
      }

      const left = element.x
      const right = element.x + element.width
      const top = element.y
      const bottom = element.y + element.height

      const clampedX = Math.min(Math.max(point.x, left), right)
      const clampedY = Math.min(Math.max(point.y, top), bottom)

      const candidates = [
        { x: left, y: clampedY },
        { x: right, y: clampedY },
        { x: clampedX, y: top },
        { x: clampedX, y: bottom },
      ]

      let best = candidates[0]
      let bestDist = Infinity

      candidates.forEach((c) => {
        const dx = c.x - point.x
        const dy = c.y - point.y
        const dist = dx * dx + dy * dy
        if (dist < bestDist) {
          bestDist = dist
          best = c
        }
      })

      point.x = best.x
      point.y = best.y
    }

    // ── 레이아웃 전에 캡처 ──
    const boundaryAttachments = captureBoundaryAttachments(elements)
    const boundaryFlowEndpoints = captureBoundaryFlowEndpoints(elements)

    // ── Sugiyama 레이아웃 실행 ──
    const layout = new EnhancedSugiyamaLayout(graph, horizontal)
    layout.run()

    // ── 모델러 API로 요소 이동 ──
    const canvas = bpmnModeler.get('canvas')
    const modeling = bpmnModeler.get('modeling')

    graph.nodes.forEach((node) => {
      const element = nodeMap[node.id]
      if (!element) return

      const newPosition = {
        x: node.x - element.width / 2,
        y: node.y - element.height / 2,
      }

      const dx = newPosition.x - element.x
      const dy = newPosition.y - element.y

      if (!isFinite(dx) || !isFinite(dy) || isNaN(dx) || isNaN(dy)) return
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return

      if (!element.waypoints) {
        let elementToMove = element

        if (element.labels && element.children) {
          const childrenWithShape = element.children.filter(
            (child) =>
              child.type && !child.waypoints && child.type.includes('bpmn:')
          )
          if (childrenWithShape.length > 0) {
            elementToMove = childrenWithShape[0]
          }
        }

        if (
          elementToMove &&
          elementToMove.id &&
          typeof elementToMove.x === 'number'
        ) {
          try {
            modeling.moveShape(elementToMove, { x: dx, y: dy })

            if (
              elementToMove.attachers &&
              elementToMove.attachers.length > 0
            ) {
              elementToMove.attachers.forEach((attacher) => {
                if (attacher && typeof attacher.x === 'number') {
                  try {
                    modeling.moveShape(attacher, { x: dx, y: dy })
                  } catch (attErr) {
                    console.warn(`경계 이벤트 ${attacher.id} 이동 오류:`, attErr)
                  }
                }
              })
            }

            if (element.labels && element.labels.length > 0) {
              element.labels.forEach((label) => {
                if (label && label.id && typeof label.x === 'number') {
                  try {
                    modeling.moveShape(label, { x: dx, y: dy })
                  } catch (labelErr) {
                    console.warn(`라벨 ${label.id} 이동 오류:`, labelErr)
                  }
                }
              })
            }
          } catch (err) {
            console.warn(`요소 ${elementToMove.id} 이동 오류:`, err)
          }
        }
      }
    })

    // ── 그룹(레인/참가자) 크기 조정 ──
    const participantChildrenMap = {}

    graph.groups.forEach((group) => {
      const element = elements.find((e) => e.id === group.id)
      if (!element) return

      if (
        element.type === 'bpmn:Lane' &&
        element.parent?.type === 'bpmn:Participant'
      ) {
        const parentId = element.parent.id
        if (!participantChildrenMap[parentId]) {
          participantChildrenMap[parentId] = []
        }
        participantChildrenMap[parentId].push(group.id)
      }
    })

    graph.groups.forEach((group) => {
      const element = elements.find((el) => el.id === group.id)
      if (!element || element.type === 'bpmn:Participant') return

      const minX = group.minX ?? Infinity
      const maxX = group.maxX ?? -Infinity
      const minY = group.minY ?? Infinity
      const maxY = group.maxY ?? -Infinity
      const margin = 0

      if (horizontal) {
        modeling.resizeShape(element, {
          x: minY - margin,
          y: minX - margin,
          width: maxY - minY + margin * 2,
          height: maxX - minX + margin * 2,
        })
      } else {
        modeling.resizeShape(element, {
          x: minX - margin,
          y: minY - margin,
          width: maxX - minX + margin * 2,
          height: maxY - minY + margin * 2,
        })
      }
    })

    Object.entries(participantChildrenMap).forEach(
      ([participantId, laneIds]) => {
        const laneBounds = laneIds
          .map((id) => graph.getGroup(id))
          .filter(Boolean)

        if (laneBounds.length === 0) return

        let minX = Math.min(...laneBounds.map((g) => g.minX))
        let maxX = Math.max(...laneBounds.map((g) => g.maxX))
        let minY = Math.min(...laneBounds.map((g) => g.minY))
        let maxY = Math.max(...laneBounds.map((g) => g.maxY))

        const margin = 0
        const participantElement = elements.find(
          (el) => el.id === participantId
        )
        if (participantElement) {
          if (participantElement.type === 'bpmn:Participant') {
            minY = minY - 30
          }

          if (horizontal) {
            modeling.resizeShape(participantElement, {
              x: minY - margin,
              y: minX - margin,
              width: maxY - minY + margin * 2,
              height: maxX - minX + margin * 2,
            })
          } else {
            modeling.resizeShape(participantElement, {
              x: minX - margin,
              y: minY - margin,
              width: maxX - minX + margin * 2,
              height: maxY - minY + margin * 2,
            })
          }
        }
      }
    )

    // ── Boundary 최종 보정 ──
    applyBoundaryAttachments(boundaryAttachments, elements, modeling)

    // ── Waypoints 적용 ──
    applyGraphWaypointsToBpmnModeler(graph, bpmnModeler)

    // ── 일반 시퀀스 플로우 레이아웃 재적용 ──
    const sequenceFlows = elements.filter((el) => {
      if (
        !el.businessObject ||
        el.businessObject.$type !== 'bpmn:SequenceFlow' ||
        !el.waypoints ||
        !Array.isArray(el.waypoints)
      ) {
        return false
      }

      const source = el.source
      const target = el.target

      const isSourceBoundary =
        source &&
        source.businessObject &&
        source.businessObject.$type === 'bpmn:BoundaryEvent'
      const isTargetBoundary =
        target &&
        target.businessObject &&
        target.businessObject.$type === 'bpmn:BoundaryEvent'

      return !isSourceBoundary && !isTargetBoundary
    })

    sequenceFlows.forEach((flow) => {
      try {
        modeling.layoutConnection(flow)
      } catch (e) {
        console.warn('시퀀스 플로우 레이아웃 실패:', flow.id, e)
      }
    })

    // ── Boundary 시퀀스 플로우 재계산 ──
    const boundaryFlows = elements.filter((el) => {
      if (
        !el.businessObject ||
        el.businessObject.$type !== 'bpmn:SequenceFlow' ||
        !el.waypoints ||
        !Array.isArray(el.waypoints)
      ) {
        return false
      }

      const source = el.source
      const target = el.target

      const isSourceBoundary =
        source &&
        source.businessObject &&
        source.businessObject.$type === 'bpmn:BoundaryEvent'
      const isTargetBoundary =
        target &&
        target.businessObject &&
        target.businessObject.$type === 'bpmn:BoundaryEvent'

      return isSourceBoundary || isTargetBoundary
    })

    boundaryFlows.forEach((flow) => {
      try {
        const source = flow.source
        const target = flow.target
        const endpointInfo = boundaryFlowEndpoints.get(flow.id) || {}
        const innerInfo = endpointInfo.inner || []

        if (
          !source || !target ||
          typeof source.x !== 'number' || typeof source.y !== 'number' ||
          typeof source.width !== 'number' || typeof source.height !== 'number' ||
          typeof target.x !== 'number' || typeof target.y !== 'number' ||
          typeof target.width !== 'number' || typeof target.height !== 'number'
        ) {
          return
        }

        function computeEndpoint(element, attachInfo) {
          const centerFallback = {
            x: element.x + element.width / 2,
            y: element.y + element.height / 2,
          }

          if (!attachInfo || !attachInfo.side) {
            const p = { ...centerFallback }
            snapPointToElementCorner(p, element)
            return p
          }

          const side = attachInfo.side
          const t =
            typeof attachInfo.t === 'number'
              ? Math.min(1, Math.max(0, attachInfo.t))
              : 0.5

          let cx = element.x + element.width / 2
          let cy = element.y + element.height / 2

          if (side === 'left') {
            cx = element.x; cy = element.y + element.height * t
          } else if (side === 'right') {
            cx = element.x + element.width; cy = element.y + element.height * t
          } else if (side === 'top') {
            cx = element.x + element.width * t; cy = element.y
          } else if (side === 'bottom') {
            cx = element.x + element.width * t; cy = element.y + element.height
          }

          return { x: cx, y: cy }
        }

        const start = computeEndpoint(source, endpointInfo.source)
        const end = computeEndpoint(target, endpointInfo.target)

        let minX = Math.min(start.x, end.x)
        let maxX = Math.max(start.x, end.x)
        let minY = Math.min(start.y, end.y)
        let maxY = Math.max(start.y, end.y)

        const width = maxX - minX || 1
        const height = maxY - minY || 1

        const restoredInner = innerInfo.map((p) => ({
          x: minX + p.nx * width,
          y: minY + p.ny * height,
        }))

        const newWaypoints = [start, ...restoredInner, end]

        modeling.updateWaypoints(flow, newWaypoints)
      } catch (e) {
        console.warn('Boundary 시퀀스 플로우 레이아웃 실패:', flow.id, e)
      }
    })
  } catch (error) {
    console.error('자동 레이아웃 적용 중 오류:', error)
    throw error
  }
}

/**
 * 그래프의 waypoints를 BPMN 모델에 적용
 */
function applyGraphWaypointsToBpmnModeler(graph, bpmnModeler) {
  const modeling = bpmnModeler.get('modeling')
  const elementRegistry = bpmnModeler.get('elementRegistry')

  if (!graph || !graph.edges || graph.edges.length === 0) return

  graph.edges.forEach((edge) => {
    const source = graph.getNode(edge.source)
    const target = graph.getNode(edge.target)
    const waypoints = edge.waypoints

    if (
      !source ||
      !target ||
      !Array.isArray(waypoints) ||
      waypoints.length < 2
    )
      return

    const connectionElement = elementRegistry.filter((el) => {
      return (
        el.businessObject &&
        el.businessObject.$type === 'bpmn:SequenceFlow' &&
        el.source &&
        el.target &&
        el.source.id === source.id &&
        el.target.id === target.id
      )
    })[0]

    if (!connectionElement) return

    try {
      modeling.updateWaypoints(connectionElement, waypoints)
    } catch (err) {
      console.warn(
        `연결선(${source.id} -> ${target.id}) waypoints 적용 실패`,
        err
      )
    }
  })
}
