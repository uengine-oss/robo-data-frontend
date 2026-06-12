/**
 * elkLayout.ts
 * ELK 기반 그래프 자동 레이아웃 — 순수 유틸.
 *
 * VueFlow 노드/엣지를 받아 layered 레이아웃을 계산한 뒤 노드 position 을 mutate.
 * 분리 이전엔 schemaCanvas 스토어 안에 박혀있던 코드. 스토어 상태 외에 의존이 없어
 * 별도 유틸로 추출.
 */

import ELK from 'elkjs/lib/elk.bundled.js'
import type { Edge, Node } from '@vue-flow/core'
import { logger } from './logger'

const elk = new ELK()

const DEFAULT_LAYOUT_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.spacing.nodeNode': '80',
  'elk.layered.spacing.nodeNodeBetweenLayers': '100',
  'elk.layered.spacing.edgeNodeBetweenLayers': '50',
  'elk.padding': '[top=50,left=50,bottom=50,right=50]',
} as const

const DEFAULT_NODE_WIDTH = 280
const DEFAULT_NODE_HEIGHT = 200

/**
 * 주어진 노드/엣지에 ELK layered 레이아웃을 계산해 노드 position 을 in-place 갱신한다.
 * 노드 0개면 no-op. 실패 시 logger.error 출력 후 그대로 반환 (위치 변경 없음).
 */
export async function applyElkLayout(nodes: Node[], edges: Edge[]): Promise<void> {
  if (nodes.length === 0) return

  try {
    const elkGraph = {
      id: 'root',
      layoutOptions: { ...DEFAULT_LAYOUT_OPTIONS },
      children: nodes.map(node => ({
        id: node.id,
        width: DEFAULT_NODE_WIDTH,
        height: DEFAULT_NODE_HEIGHT,
      })),
      edges: edges.map(edge => ({
        id: edge.id,
        sources: [edge.source],
        targets: [edge.target],
      })),
    }

    const layouted = await elk.layout(elkGraph)
    if (!layouted.children) return

    for (const elkNode of layouted.children) {
      const node = nodes.find(n => n.id === elkNode.id)
      if (node && elkNode.x !== undefined && elkNode.y !== undefined) {
        node.position = { x: elkNode.x, y: elkNode.y }
      }
    }

    logger.debug('[elkLayout] auto layout 적용 완료')
  } catch (e) {
    logger.error('[elkLayout] 레이아웃 실패:', e)
  }
}
