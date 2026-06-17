/**
 * 그래프 노드/관계 패널 표시용 — 기술명(함수명·테이블명 등) 우선, 논리명은 괄호 병기.
 */

import type { GraphLink, GraphNode } from '@/shared/types'
import { nodeTypeLabel } from './nodeClassify'

/** C 계열 소스에서 블록/행 주석을 제거해 디테일 패널에 표시 (문자열 리터럴 내부는 미세 조정 안 함). */
export function stripCStyleComments(source: string): string {
  if (!source) return ''
  let s = source.replace(/\/\*[\s\S]*?\*\//g, '')
  const lines = s.split('\n')
  const out: string[] = []
  for (const line of lines) {
    const t = line.trimStart()
    if (t.startsWith('//')) continue
    out.push(line)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()
}

export function technicalNodeName(node: GraphNode | undefined): string {
  if (!node) return ''
  const p = node.properties || {}
  const labels = node.labels || []
  if (labels.includes('RULE')) {
    const st = typeof p.statement === 'string' ? p.statement.trim() : ''
    if (st) return st.length > 100 ? `${st.slice(0, 97)}…` : st
    const h = p.id
    return typeof h === 'string' && h ? h : node.id
  }
  if (labels.includes('QUESTION')) {
    const tx = typeof p.text === 'string' ? p.text.trim() : ''
    if (tx) return tx.length > 120 ? `${tx.slice(0, 117)}…` : tx
    const qid = p.id
    return typeof qid === 'string' && qid ? qid : node.id
  }
  if (labels.includes('EXAMPLE')) {
    const d = typeof p.description === 'string' ? p.description.trim() : ''
    if (d) return d.length > 80 ? `${d.slice(0, 77)}…` : d
    const eid = p.id
    return typeof eid === 'string' && eid ? eid : node.id
  }
  const name = p.name as string | undefined
  if (name) return String(name)
  // 표시명 없는 DB 노드(TABLE/COLUMN)는 id("db.schema.name")의 마지막 세그먼트.
  const idVal = p.id as string | undefined
  if (idVal) return idVal.split('.').pop() || idVal
  // 이름 없는 DBMS 구문은 `타입[라인]`. raw id(elementId)는 표시하지 않는다.
  const kind = nodeTypeLabel(node)
  const line = p.start_line
  if (kind) return line != null && line !== 0 ? `${kind} [${line}]` : kind
  return labels[0] || node.id
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

export function linkEdgeOp(link: GraphLink): string {
  const op = link.properties?.op
  return typeof op === 'string' ? op.trim() : ''
}

/** 관계 타입명 그대로 + 선택적 op (예: WRITES / WRITES(UPDATE)). */
export function formatRelWithOp(link: GraphLink): string {
  const base = link.type
  const op = linkEdgeOp(link)
  if (op) return `${base}(${op})`
  return base
}

function peerFallbackCaption(node: GraphNode | undefined, tech: string): string {
  if (!node?.properties) return ''
  const p = node.properties
  const candidates = [p.analyzed_description, p.description, p.summary, p.intent, p.comment]
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
  const edge = formatRelWithOp(link)
  const tech = technicalNodeName(peerNode)
  const log = logicalNodeName(peerNode)
  const peerCaption = log && log !== tech ? log : peerFallbackCaption(peerNode, tech)
  return { edge, peerTech: tech, peerCaption }
}

/** 한 줄: 관계 타입(op 포함) → 상대 노드 `기술명 (논리명)`. */
export function formatRelationshipLine(link: GraphLink, peerNode: GraphNode | undefined): string {
  const { edge, peerTech, peerCaption } = relationshipRowParts(link, peerNode)
  return peerCaption ? `${edge} → ${peerTech} — ${peerCaption}` : `${edge} → ${peerTech}`
}
