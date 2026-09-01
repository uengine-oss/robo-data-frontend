/**
 * 그래프 노드/관계 패널 표시용 — 기술명(함수명·테이블명 등) 우선, 논리명은 괄호 병기.
 */

import type { GraphLink, GraphNode } from '@/shared/types'
import { nodeTypeLabel, logicalModeName } from './nodeClassify'

/**
 * 이름 없는 노드의 표시 — `타입` 또는 `타입 [line]`.
 * 트리·캔버스·패널 세 표시이름이 공유하던 줄번호 조립의 단일 처리처(복붙 제거).
 * `withLine`이 화면별 차이: 패널·트리=true, 캔버스=false(현 동작 보존).
 */
export function typeWithLine(typeLabel: string, startLine: unknown, withLine: boolean): string {
  return withLine && startLine != null && startLine !== 0 ? `${typeLabel} [${startLine}]` : typeLabel
}

/**
 * 논리명 모드면 `logicalModeName`(논리명→구조한글→물리)에 위임, 아니면 물리명 그대로.
 * 트리·캔버스가 공유하던 `showLogical ? logicalModeName : physical` 분기의 단일 처리처.
 */
export function applyLogicalMode(node: GraphNode, physical: string, logical: boolean): string {
  return logical ? logicalModeName(node, physical) : physical
}

export function technicalNodeName(node: GraphNode | undefined): string {
  if (!node) return ''
  const p = node.properties || {}
  const labels = node.labels || []
  if (labels.includes('RULE')) {
    const condition = typeof p.condition_description === 'string'
      ? p.condition_description.trim()
      : typeof p.condition === 'string' ? p.condition.trim() : ''
    if (condition) return condition.length > 100 ? `${condition.slice(0, 97)}…` : condition
    const h = p._id
    return typeof h === 'string' && h ? h : node.id
  }
  const name = p.name as string | undefined
  if (name) return String(name)
  // 표시명 없는 DB 노드(TABLE/COLUMN)는 id("db.schema.name")의 마지막 세그먼트.
  const idVal = p._id as string | undefined
  // TABLE/COLUMN 만: 점 구분 경로("db.schema.name") → 마지막 세그먼트.
  // 이름 없는 DBMS 구문(콜론 id)은 `타입 [라인]` — 긴 raw 식별자 노출 금지.
  const line = p.start_line
  const kind = nodeTypeLabel(node)
  if (kind) return typeWithLine(kind, line, true)
  // 구체 타입 라벨이 없어도(예: :FUNCTION 단독) raw 콜론-id 는 절대 노출하지 않는다 —
  // 첫 라벨 + 라인으로 깨끗하게(`FUNCTION [6]`). 점 구분 fqn 만 그대로 허용(이미 위에서 처리).
  if (labels[0]) return typeWithLine(labels[0], line, true)
  if (idVal && !idVal.includes(':')) return idVal
  return node.id
}

/** 노드에 저장된 논리명 (비어 있으면 빈 문자열) */
export function logicalNodeName(node: GraphNode | undefined): string {
  const ln = node?.properties?.logical_name
  return typeof ln === 'string' ? ln.trim() : ''
}

/**
 * 리스트/관계 줄 — `기술명 (논리명)`. 논리명 없거나 동일하면 기술명만.
 */
export function formatPeerListLabel(node: GraphNode | undefined): string {
  const tech = technicalNodeName(node)
  const log = logicalNodeName(node)
  if (log && log !== tech) return `${tech} (${log})`
  return tech || log
}

export function linkDetail(link: GraphLink): string {
  const operations = link.properties?.operations
  if (Array.isArray(operations)) {
    const names = operations
      .filter((value): value is string => typeof value === 'string')
      .map(value => value.trim())
      .filter(Boolean)
    if (names.length) return names.join(', ')
  }
  const description = link.properties?.description
  return typeof description === 'string' ? description.trim() : ''
}

/** 그래프 엣지 타입(기계어) → 비개발자용 한글 이름. 없으면 원본 유지. 단일 진실(DRY). */
const EDGE_LABELS_KO: Record<string, string> = {
  HAS_COLUMN: '컬럼', PARENT_OF: '하위', CALLS: '호출',
  READS: '읽기', WRITES: '쓰기', REFERENCES: '참조', INIT_BY: '초기화', FK: '외래키',
  NEXT: '다음', HAS_RULE: '규칙', EXTENDS: '상속', IMPLEMENTS: '구현',
  DATA_FLOWS_TO: '데이터 흐름',
}
export function friendlyEdgeLabel(type: string): string {
  return EDGE_LABELS_KO[type] || type
}

/** 관계 타입명과 선택적 설명을 함께 표시한다. */
export function formatRelationshipLabel(link: GraphLink): string {
  const base = friendlyEdgeLabel(link.type)
  const detail = linkDetail(link)
  if (detail) return `${base}(${detail})`
  return base
}

function peerFallbackCaption(node: GraphNode | undefined, tech: string): string {
  if (!node?.properties) return ''
  const p = node.properties
  const candidates = [p.summary, p.description]
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) {
      const line = c.trim().split(/\n/)[0].trim()
      if (!line || line === tech) continue
      return line.length > 96 ? `${line.slice(0, 93)}…` : line
    }
  }
  return ''
}

/**
 * 연결 패널 한 행 — 관계 뱃지 / 피어 기술명 / 사람이 읽기 좋은 캡션(논리명 또는 설명 한 줄).
 */
export function relationshipRowParts(link: GraphLink, peerNode: GraphNode | undefined): {
  edge: string
  peerTech: string
  peerCaption: string
} {
  const edge = formatRelationshipLabel(link)
  const tech = technicalNodeName(peerNode)
  const log = logicalNodeName(peerNode)
  const peerCaption = log && log !== tech ? log : peerFallbackCaption(peerNode, tech)
  return { edge, peerTech: tech, peerCaption }
}

/** 한 줄: 관계 타입과 설명 → 상대 노드 `기술명 (논리명)`. */
export function formatRelationshipLine(link: GraphLink, peerNode: GraphNode | undefined): string {
  const { edge, peerTech, peerCaption } = relationshipRowParts(link, peerNode)
  return peerCaption ? `${edge} → ${peerTech} — ${peerCaption}` : `${edge} → ${peerTech}`
}
