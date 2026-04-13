/**
 * navigator.ts
 * Navigator 사이드 패널 상태 및 파생 트리 뷰를 관리한다.
 *
 * - projectStore.nodeMap / linkMap 을 단일 진실 소스로 삼아
 *   섹션별(MODULES / TABLES / UNRESOLVED) 트리·리스트를 computed 로 파생한다.
 * - 사용자 상호작용 상태(섹션 확장, 노드 확장, 검색어)를 보관한다.
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useProjectStore } from './project'
import type { GraphLink, GraphNode } from '@/types'

export type NavigatorSection = 'MODULES' | 'TABLES' | 'UNRESOLVED'

export interface NavigatorTreeItem {
  id: string              // GraphNode.id
  name: string            // 표시용 이름
  nodeType: string        // 서브라벨 (CLASS/FUNCTION/Table/Column 등)
  labels: string[]        // 원본 라벨 배열
  children: NavigatorTreeItem[]
}

/** 라벨 우선순위 — MODULE 같은 역할 라벨을 제외한 실제 kind 를 뽑는다. */
const ROLE_LABELS = new Set([
  'MODULE', 'FUNCTION', 'VARIABLE', 'CONSTANT', 'PACKAGE',
  'INTERNAL', 'EXTERNAL',
  'Endpoint', 'Query', 'Command', 'Getter', 'Setter', 'Lifecycle',
  'Scheduled', 'EventHandler', 'Init', 'Transactional', 'Validation', 'BusinessLogic'
])

function pickDisplayLabel(labels: string[]): string {
  for (const label of labels) {
    if (!ROLE_LABELS.has(label)) return label
  }
  return labels[0] ?? 'Unknown'
}

function pickDisplayName(node: GraphNode): string {
  const p = node.properties
  return String(
    p['name'] ??
    p['fqn'] ??
    p['procedure_name'] ??
    p['class_name'] ??
    p['fileName'] ??
    node.id
  )
}

/** 특정 라벨을 가진 노드들을 평면 리스트로 수집. */
function listByLabel(nodeMap: Map<string, GraphNode>, label: string): NavigatorTreeItem[] {
  const items: NavigatorTreeItem[] = []
  for (const node of nodeMap.values()) {
    if (!node.labels.includes(label)) continue
    items.push({
      id: node.id,
      name: pickDisplayName(node),
      nodeType: pickDisplayLabel(node.labels),
      labels: node.labels,
      children: []
    })
  }
  items.sort((a, b) => a.name.localeCompare(b.name))
  return items
}

/**
 * MODULE 노드를 루트로, 특정 관계 타입으로 이어진 하위 노드들을 자식으로 가져온다.
 * 기본 관계: HAS_METHOD, HAS_FIELD, HAS_CONSTANT, HAS_FUNCTION, CONTAINS.
 */
const CHILD_REL_TYPES = new Set([
  'HAS_METHOD', 'HAS_FIELD', 'HAS_CONSTANT', 'HAS_FUNCTION',
  'CONTAINS', 'HAS_CLASS', 'HAS_INTERFACE'
])

function buildModuleTree(
  nodeMap: Map<string, GraphNode>,
  linkMap: Map<string, GraphLink>
): NavigatorTreeItem[] {
  // source -> [target] 인덱스
  const childIndex = new Map<string, string[]>()
  for (const link of linkMap.values()) {
    if (!CHILD_REL_TYPES.has(link.type)) continue
    const list = childIndex.get(link.source) ?? []
    list.push(link.target)
    childIndex.set(link.source, list)
  }

  const visited = new Set<string>()

  function buildItem(nodeId: string, depth: number): NavigatorTreeItem | null {
    if (visited.has(nodeId)) return null
    if (depth > 8) return null
    const node = nodeMap.get(nodeId)
    if (!node) return null
    visited.add(nodeId)

    const children: NavigatorTreeItem[] = []
    const childIds = childIndex.get(nodeId) ?? []
    for (const cid of childIds) {
      const child = buildItem(cid, depth + 1)
      if (child) children.push(child)
    }
    children.sort((a, b) => a.name.localeCompare(b.name))

    return {
      id: node.id,
      name: pickDisplayName(node),
      nodeType: pickDisplayLabel(node.labels),
      labels: node.labels,
      children
    }
  }

  // 루트: MODULE 라벨을 가진 노드들
  const roots: NavigatorTreeItem[] = []
  for (const node of nodeMap.values()) {
    if (!node.labels.includes('MODULE')) continue
    const item = buildItem(node.id, 0)
    if (item) roots.push(item)
  }
  roots.sort((a, b) => a.name.localeCompare(b.name))
  return roots
}

/** 미해결 참조: EXTERNAL 라벨을 가진 placeholder 노드들. */
function buildUnresolvedList(nodeMap: Map<string, GraphNode>): NavigatorTreeItem[] {
  const items: NavigatorTreeItem[] = []
  for (const node of nodeMap.values()) {
    if (!node.labels.includes('EXTERNAL')) continue
    items.push({
      id: node.id,
      name: pickDisplayName(node),
      nodeType: pickDisplayLabel(node.labels),
      labels: node.labels,
      children: []
    })
  }
  items.sort((a, b) => a.name.localeCompare(b.name))
  return items
}

/** 검색어 필터 (재귀, 매칭된 노드의 조상까지 유지). */
function filterTree(items: NavigatorTreeItem[], query: string): NavigatorTreeItem[] {
  if (!query) return items
  const q = query.toLowerCase()
  const out: NavigatorTreeItem[] = []
  for (const item of items) {
    const selfMatch = item.name.toLowerCase().includes(q) || item.id.toLowerCase().includes(q)
    const filteredChildren = filterTree(item.children, query)
    if (selfMatch || filteredChildren.length > 0) {
      out.push({ ...item, children: filteredChildren })
    }
  }
  return out
}

export const useNavigatorStore = defineStore('navigator', () => {
  const projectStore = useProjectStore()

  const expandedSections = ref<Set<NavigatorSection>>(new Set(['MODULES', 'TABLES']))
  const expandedNodes = ref<Set<string>>(new Set())
  const searchQuery = ref('')

  const moduleTree = computed(() =>
    filterTree(
      buildModuleTree(projectStore.nodeMap, projectStore.linkMap),
      searchQuery.value
    )
  )

  const tableList = computed(() =>
    filterTree(listByLabel(projectStore.nodeMap, 'Table'), searchQuery.value)
  )

  const unresolvedList = computed(() =>
    filterTree(buildUnresolvedList(projectStore.nodeMap), searchQuery.value)
  )

  function toggleSection(section: NavigatorSection): void {
    const next = new Set(expandedSections.value)
    if (next.has(section)) next.delete(section)
    else next.add(section)
    expandedSections.value = next
  }

  function toggleNode(nodeId: string): void {
    const next = new Set(expandedNodes.value)
    if (next.has(nodeId)) next.delete(nodeId)
    else next.add(nodeId)
    expandedNodes.value = next
  }

  function collapseAll(): void {
    expandedNodes.value = new Set()
  }

  return {
    expandedSections,
    expandedNodes,
    searchQuery,
    moduleTree,
    tableList,
    unresolvedList,
    toggleSection,
    toggleNode,
    collapseAll
  }
})
