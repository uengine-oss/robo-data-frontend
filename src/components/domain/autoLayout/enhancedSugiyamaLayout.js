/**
 * 향상된 Sugiyama 레이아웃 모듈 (ES module)
 * BPMN 자동 레이아웃을 위한 확장된 Sugiyama 알고리즘 구현
 *
 * Ported from process-gpt-vue3/src/components/autoLayout/enhancedSugiyamaLayout.js
 */

import { SugiyamaLayout } from './graphAlgorithm.js'

/**
 * EnhancedSugiyamaLayout - SugiyamaLayout을 확장한 향상된 레이아웃 클래스
 * 계층 할당 최적화 및 가로/세로 방향 레이아웃 지원
 */
export class EnhancedSugiyamaLayout extends SugiyamaLayout {
  /**
   * @param {Object} graph - 레이아웃을 적용할 그래프 객체
   * @param {boolean} horizontal - 가로 방향 레이아웃 사용 여부
   */
  constructor(graph, horizontal = false) {
    super(graph)
    this.horizontal = horizontal
  }

  /**
   * 계층 할당 단계를 오버라이드
   */
  assignLayers() {
    super.assignLayers()
    this.optimizeLayers()
    return this
  }

  /**
   * 추가 최적화: 게이트웨이 출력 노드 레이어링 개선
   */
  optimizeLayers() {
    let changed = true
    let iterations = 0
    const maxIterations = 100

    let previousChangesCount = 0
    let currentChangesCount = 0
    let stabilityCounter = 0

    while (changed && iterations < maxIterations && stabilityCounter < 3) {
      changed = false
      currentChangesCount = 0
      iterations++

      for (const node of this.graph.nodes) {
        const outgoingEdges = this.graph
          .getOutgoingEdges(node.id)
          .filter((e) => !e.feedback)

        for (const edge of outgoingEdges) {
          const targetNode = this.graph.getNode(edge.target)

          if (targetNode.layer <= node.layer) {
            targetNode.layer = node.layer + 1
            changed = true
            currentChangesCount++
          }
        }
      }

      if (
        currentChangesCount === previousChangesCount &&
        currentChangesCount > 0
      ) {
        stabilityCounter++
      } else {
        stabilityCounter = 0
      }

      previousChangesCount = currentChangesCount
    }

    if (iterations >= maxIterations) {
      console.warn(
        `optimizeLayers: 최대 반복 횟수(${maxIterations})에 도달했습니다.`
      )
    }

    // 레이어 배열 재구성
    this.layers = []
    let maxLayer = 0

    this.graph.nodes.forEach((node) => {
      maxLayer = Math.max(maxLayer, node.layer)
    })

    for (let i = 0; i <= maxLayer; i++) {
      this.layers[i] = this.graph.nodes.filter((node) => node.layer === i)
    }
  }

  /**
   * 레이아웃 실행 - 가로/세로 방향 처리
   */
  run() {
    super.run()

    // 가로 배치 모드인 경우 x, y 좌표 교환
    if (this.horizontal) {
      this.graph.nodes.forEach((node) => {
        const tempX = node.x
        node.x = node.y
        node.y = tempX

        const tempWidth = node.width
        node.width = node.height
        node.height = tempWidth
      })

      this.graph.edges.forEach((edge) => {
        if (edge.waypoints && edge.waypoints.length > 0) {
          edge.waypoints.forEach((point) => {
            const tempX = point.x
            point.x = point.y
            point.y = tempX
          })
        }
      })
    }

    return this
  }
}
