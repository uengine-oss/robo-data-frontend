/**
 * 그래프 노드/관계 패널 표시용 — 기술명(함수명·테이블명 등) 우선, 논리명은 괄호 병기.
 */

import type { GraphLink, GraphNode } from '@/types'

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
  if (labels.includes('Rule')) {
    const st = typeof p.statement === 'string' ? p.statement.trim() : ''
    if (st) return st.length > 100 ? `${st.slice(0, 97)}…` : st
    const h = p.rule_hash
    return typeof h === 'string' && h ? h : node.id
  }
  if (labels.includes('Question')) {
    const tx = typeof p.text === 'string' ? p.text.trim() : ''
    if (tx) return tx.length > 120 ? `${tx.slice(0, 117)}…` : tx
    const qid = p.question_id
    return typeof qid === 'string' && qid ? qid : node.id
  }
  if (labels.includes('Example')) {
    const d = typeof p.description === 'string' ? p.description.trim() : ''
    if (d) return d.length > 80 ? `${d.slice(0, 77)}…` : d
    const eid = p.example_id
    return typeof eid === 'string' && eid ? eid : node.id
  }
  const name = p.name as string | undefined
  if (name) return String(name)
  const fqn = p.fqn as string | undefined
  if (fqn) return fqn.split('.').pop() || fqn
  const tn = p.table_id ?? p.procedure_name ?? p.class_name
  if (tn) return String(tn)
  return node.id
}

/** 노드에 저장된 논리명 (비어 있으면 빈 문자열) */
export function logicalNodeName(node: GraphNode | undefined): string {
  if (!node) return ''
  const p: any = node.properties || {}
  const candidates = [
    p.logical_name,
    p.logicalName,
    p.logical_nm,
    p.logicalNm,
    p.logical,
    p.caption_ko,
    p.name_ko,
    p.ko_name,
  ]
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim()
  }
  return ''
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
