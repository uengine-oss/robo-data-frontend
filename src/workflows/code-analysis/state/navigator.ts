import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { GraphLink, GraphNode } from '@/shared/types'
import { applyLogicalMode, typeWithLine } from '@/shared/utils/graphDisplay'
import { isNodeHidden, isSystemNode } from '@/shared/utils/graphVisibility'
import { kindOfNode } from '@/shared/utils/nodeLabels'
import { useAnalyzerStore } from './analyzer'

export type NavigatorSection = 'MODULES' | 'TABLES'

export interface NavigatorTreeItem {
  id: string
  name: string
  nodeType: string
  labels: string[]
  children: NavigatorTreeItem[]
}

const showLogicalNames = ref(false)
// 부모 → 자식 관계. HAS_MEMBER(클래스 → 메서드) · HAS_EXAMPLE(규칙 → 예시)이 빠지면 Java 분석의
// 메서드와 규칙 예시가 모두 맨 위에 늘어선다.
const CHILD_RELATIONS = new Set(['PARENT_OF', 'HAS_COLUMN', 'HAS_RULE', 'HAS_MEMBER', 'HAS_EXAMPLE'])
// 자식 → 부모 관계 (CLASS -BELONGS_TO-> PACKAGE)
const PARENT_RELATIONS = new Set(['BELONGS_TO'])

function clip(text: string): string {
  return text.length > 40 ? `${text.slice(0, 40)}…` : text
}

function displayName(node: GraphNode): string {
  const properties = node.properties
  if (node.labels.includes('RULE')) {
    const value = properties.condition_description ?? properties.condition ?? properties.statement
    const text = typeof value === 'string' ? value.trim() : ''
    if (text) return clip(text)
  }
  if (node.labels.includes('EXAMPLE')) {
    const value = properties.when_ ?? properties.given
    const text = typeof value === 'string' ? value.trim() : ''
    if (text) return clip(text)
  }
  const physical = properties.name
    ? String(properties.name)
    : typeWithLine(kindOfNode(node), properties.start_line, true)
  return applyLogicalMode(node, physical || node.id, showLogicalNames.value)
}

function visible(node: GraphNode, showHidden: boolean): boolean {
  return !isSystemNode(node) && (showHidden || !isNodeHidden(node))
}

function childIndexes(links: Iterable<GraphLink>): {
  children: Map<string, string[]>
  parents: Map<string, string>
} {
  const children = new Map<string, string[]>()
  const parents = new Map<string, string>()
  for (const link of links) {
    const down = CHILD_RELATIONS.has(link.type)
    if (!down && !PARENT_RELATIONS.has(link.type)) continue
    const [parent, child] = down ? [link.source, link.target] : [link.target, link.source]
    const current = children.get(parent) ?? []
    current.push(child)
    children.set(parent, current)
    if (!parents.has(child)) parents.set(child, parent)
  }
  return { children, parents }
}

function buildTree(
  nodeId: string,
  nodes: Map<string, GraphNode>,
  children: Map<string, string[]>,
  showHidden: boolean,
  accepted: (node: GraphNode) => boolean,
  visited: Set<string>,
): NavigatorTreeItem | null {
  if (visited.has(nodeId)) return null
  const node = nodes.get(nodeId)
  if (!node || !accepted(node) || !visible(node, showHidden)) return null
  visited.add(nodeId)

  const childItems = (children.get(nodeId) ?? [])
    .map(childId => buildTree(
      childId,
      nodes,
      children,
      showHidden,
      accepted,
      visited,
    ))
    .filter((item): item is NavigatorTreeItem => Boolean(item))
    .sort((left, right) => {
      const leftLine = Number(nodes.get(left.id)?.properties.start_line ?? 0)
      const rightLine = Number(nodes.get(right.id)?.properties.start_line ?? 0)
      if (leftLine !== rightLine) return leftLine - rightLine
      return left.name.localeCompare(right.name)
    })

  return {
    id: node.id,
    name: displayName(node),
    nodeType: kindOfNode(node),
    labels: node.labels,
    children: childItems,
  }
}

function buildModulesTree(
  nodes: Map<string, GraphNode>,
  links: Map<string, GraphLink>,
  showHidden: boolean,
): NavigatorTreeItem[] {
  const { children, parents } = childIndexes(links.values())
  const accepted = (node: GraphNode) =>
    !node.labels.includes('TABLE') && !node.labels.includes('COLUMN')
  const visited = new Set<string>()
  const roots: NavigatorTreeItem[] = []
  const candidates = [...nodes.values()].filter(node =>
    accepted(node)
    && (node.labels.includes('PACKAGE') || !parents.has(node.id)),
  )

  for (const node of candidates) {
    if (node.labels.includes('PACKAGE') && displayName(node) === 'root') {
      for (const childId of children.get(node.id) ?? []) {
        const child = buildTree(
          childId, nodes, children, showHidden, accepted, visited,
        )
        if (child) roots.push(child)
      }
      continue
    }
    const root = buildTree(
      node.id, nodes, children, showHidden, accepted, visited,
    )
    if (root) roots.push(root)
  }

  for (const node of nodes.values()) {
    if (visited.has(node.id) || !accepted(node)) continue
    const root = buildTree(
      node.id, nodes, children, showHidden, accepted, visited,
    )
    if (root) roots.push(root)
  }

  return roots.sort((left, right) => left.name.localeCompare(right.name))
}

function buildTablesTree(
  nodes: Map<string, GraphNode>,
  links: Map<string, GraphLink>,
  showHidden: boolean,
): NavigatorTreeItem[] {
  const { children } = childIndexes(links.values())
  const accepted = (node: GraphNode) =>
    node.labels.includes('TABLE') || node.labels.includes('COLUMN')
  return [...nodes.values()]
    .filter(node => node.labels.includes('TABLE'))
    .map(node => buildTree(
      node.id, nodes, children, showHidden, accepted, new Set<string>(),
    ))
    .filter((item): item is NavigatorTreeItem => Boolean(item))
    .sort((left, right) => left.name.localeCompare(right.name))
}

function filterTree(
  items: NavigatorTreeItem[],
  query: string,
): NavigatorTreeItem[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return items
  return items.flatMap(item => {
    const children = filterTree(item.children, normalized)
    const matches = item.name.toLowerCase().includes(normalized)
      || item.id.toLowerCase().includes(normalized)
    return matches || children.length ? [{ ...item, children }] : []
  })
}

export const useNavigatorStore = defineStore('navigator', () => {
  const analyzer = useAnalyzerStore()
  const isPanelOpen = ref(false)
  const expandedSections = ref<Set<NavigatorSection>>(
    new Set(['MODULES', 'TABLES']),
  )
  const collapsedNodes = ref<Set<string>>(new Set())
  const searchQuery = ref('')
  const selectedNodeId = ref<string | null>(null)

  const moduleTree = computed(() => filterTree(
    buildModulesTree(analyzer.nodeMap, analyzer.linkMap, analyzer.showHidden),
    searchQuery.value,
  ))
  const tableList = computed(() => filterTree(
    buildTablesTree(analyzer.nodeMap, analyzer.linkMap, analyzer.showHidden),
    searchQuery.value,
  ))

  function setPanelOpen(open: boolean): void {
    isPanelOpen.value = open
  }

  function toggleSection(section: NavigatorSection): void {
    const next = new Set(expandedSections.value)
    next.has(section) ? next.delete(section) : next.add(section)
    expandedSections.value = next
  }

  function toggleNode(nodeId: string): void {
    const next = new Set(collapsedNodes.value)
    next.has(nodeId) ? next.delete(nodeId) : next.add(nodeId)
    collapsedNodes.value = next
  }

  function isNodeExpanded(nodeId: string): boolean {
    return !collapsedNodes.value.has(nodeId)
  }

  function collapseAll(): void {
    const next = new Set<string>()
    const visit = (items: NavigatorTreeItem[]) => {
      for (const item of items) {
        if (item.children.length) next.add(item.id)
        visit(item.children)
      }
    }
    visit(moduleTree.value)
    visit(tableList.value)
    collapsedNodes.value = next
  }

  function expandAll(): void {
    collapsedNodes.value = new Set()
  }

  function selectNode(nodeId: string | null): void {
    selectedNodeId.value = nodeId
  }

  function toggleLogicalNames(): void {
    showLogicalNames.value = !showLogicalNames.value
  }

  return {
    isPanelOpen,
    setPanelOpen,
    showLogicalNames,
    toggleLogicalNames,
    expandedSections,
    collapsedNodes,
    searchQuery,
    toggleSection,
    toggleNode,
    isNodeExpanded,
    collapseAll,
    expandAll,
    selectedNodeId,
    selectNode,
    moduleTree,
    tableList,
  }
})
