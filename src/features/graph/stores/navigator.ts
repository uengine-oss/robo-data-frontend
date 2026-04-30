/**
 * features/graph/stores/navigator.ts
 *
 * Navigator 사이드 패널의 모든 상태를 관리한다:
 *   - UI 상태        : 패널 열림/닫힘, 현재 Graph 하위 뷰(schema/uml/graph)
 *   - 트리 상태      : 섹션 확장, 노드 확장, 검색어
 *   - 파생 트리 뷰   : MODULES / TABLES (projectStore 기반 computed)
 *
 * projectStore.nodeMap / linkMap 을 단일 진실 소스로 삼으며, 분석 스트림으로 데이터가
 * 쌓이는 동안 Pinia 반응성으로 트리가 자동 갱신된다.
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useProjectStore } from '@/stores/project'
import type { GraphLink, GraphNode } from '@/types'

// ═══════════════════════════════════════════════════════════════════════════
// 타입 정의
// ═══════════════════════════════════════════════════════════════════════════

export type NavigatorSection = 'MODULES' | 'TABLES'
export type GraphSubView = 'schema' | 'uml' | 'graph'

export interface NavigatorTreeItem {
  id: string
  name: string
  nodeType: string        // 표시용 서브라벨 (CLASS/FUNCTION/Table 등)
  labels: string[]
  children: NavigatorTreeItem[]
}

// ═══════════════════════════════════════════════════════════════════════════
// 트리 빌드 헬퍼 (순수 함수)
// ═══════════════════════════════════════════════════════════════════════════

/** 역할 라벨 — 이 라벨들을 제외한 첫 번째 라벨이 실제 kind. */
const ROLE_LABELS = new Set([
  'MODULE', 'FUNCTION', 'VARIABLE', 'CONSTANT', 'PACKAGE', 'FILE',
  'INTERNAL', 'EXTERNAL',
  'Endpoint', 'Query', 'Command', 'Getter', 'Setter', 'Lifecycle',
  'Scheduled', 'EventHandler', 'Init', 'Transactional', 'Validation',
  'BusinessLogic',
])

/** 트리에서 제외할 라벨 — 변수/상수는 트리에 안 보인다. */
const EXCLUDED_LABELS = new Set([
  'VARIABLE', 'CONSTANT', 'GLOBAL_VARIABLE', 'DEFINE',
])

/** 자식으로 확장할 관계 타입.
 *  같은 의미 (컨테이너 → 자식) 의 다른 이름들 — backend 의 의미 enum 을 그대로 인지.
 *  HAS_FUNCTION 은 framework 의 module/class → function (프로그래밍 함수),
 *  HAS_PROCEDURE 는 dbms 의 file → stored procedure/function/trigger 로 의미가 다름. */
const CHILD_REL_TYPES = new Set([
  'HAS_METHOD', 'HAS_FUNCTION', 'HAS_CLASS', 'HAS_INTERFACE',
  'HAS_PROCEDURE',        // FILE → PROCEDURE/FUNCTION/TRIGGER (dbms)
  'CONTAINS',
  'HAS_COLUMN',           // Table → Column
  'HAS_BUSINESS_LOGIC',   // Function → BusinessLogic
])

/**
 * 노드의 표시용 sublabel 을 결정한다.
 * 1) 역할 라벨 제외한 첫 번째 (가장 구체적인 서브라벨)
 * 2) 없으면 우선순위 기반으로 의미 있는 역할 라벨 선택
 *    (예: ['FILE','MODULE'] → 'MODULE' 반환, 'FILE' 아님)
 */
function pickDisplayLabel(labels: string[]): string {
  for (const label of labels) {
    if (!ROLE_LABELS.has(label)) return label
  }
  const ROLE_PRIORITY = [
    'PACKAGE', 'MODULE', 'BusinessLogic',
    'Query', 'Command', 'Validation', 'Endpoint',
    'FUNCTION', 'FILE',
  ]
  for (const pref of ROLE_PRIORITY) {
    if (labels.includes(pref)) return pref
  }
  return labels[0] ?? 'Unknown'
}

function pickDisplayName(node: GraphNode): string {
  const p = node.properties
  // BL 은 sequence prefix 추가하여 흐름 파악 용이하게
  if (node.labels.includes('BusinessLogic')) {
    const seq = p['sequence']
    const title = String(p['title'] ?? p['name'] ?? node.id)
    return seq != null ? `[${seq}] ${title}` : title
  }
  return String(
    p['name'] ?? p['fqn'] ?? p['procedure_name']
      ?? p['class_name'] ?? p['title'] ?? node.id
  )
}

/** BL 의 sequence 는 "1", "2", "2-1" 형식 — 튜플 비교로 정렬. */
function blSequenceKey(node: GraphNode): [number, ...number[]] {
  const s = node.properties['sequence']
  if (s == null) return [999]
  try {
    return String(s).split('-').map(x => parseInt(x, 10)) as [number, ...number[]]
  } catch {
    return [999]
  }
}

function isExcluded(node: GraphNode): boolean {
  return node.labels.some(l => EXCLUDED_LABELS.has(l))
}

/**
 * 주어진 노드를 루트로 자식 트리를 재귀 구성.
 * - HAS_BUSINESS_LOGIC 자식은 sequence 순으로 정렬
 * - 기타 자식은 이름순 정렬
 */
function buildSubtree(
  nodeId: string,
  nodeMap: Map<string, GraphNode>,
  childIndex: Map<string, string[]>,
  relIndex: Map<string, Map<string, string>>,    // source → (target → relType)
  depth: number,
  visited: Set<string>,
): NavigatorTreeItem | null {
  if (visited.has(nodeId) || depth > 10) return null
  visited.add(nodeId)
  const node = nodeMap.get(nodeId)
  if (!node || isExcluded(node)) return null

  const childIds = childIndex.get(nodeId) ?? []
  const blChildren: NavigatorTreeItem[] = []
  const otherChildren: NavigatorTreeItem[] = []

  for (const cid of childIds) {
    const child = buildSubtree(cid, nodeMap, childIndex, relIndex, depth + 1, visited)
    if (!child) continue
    const rel = relIndex.get(nodeId)?.get(cid)
    if (rel === 'HAS_BUSINESS_LOGIC') blChildren.push(child)
    else otherChildren.push(child)
  }

  otherChildren.sort((a, b) => a.name.localeCompare(b.name))
  blChildren.sort((a, b) => {
    const na = nodeMap.get(a.id), nb = nodeMap.get(b.id)
    if (!na || !nb) return 0
    const ka = blSequenceKey(na), kb = blSequenceKey(nb)
    for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
      const d = (ka[i] ?? 0) - (kb[i] ?? 0)
      if (d !== 0) return d
    }
    return 0
  })

  return {
    id: node.id,
    name: pickDisplayName(node),
    nodeType: pickDisplayLabel(node.labels),
    labels: node.labels,
    children: [...otherChildren, ...blChildren],
  }
}

/** source → [targetIds] / source → (target → relType) 인덱스 빌드. */
function buildChildIndexes(linkMap: Map<string, GraphLink>) {
  const childIndex = new Map<string, string[]>()
  const relIndex = new Map<string, Map<string, string>>()
  for (const link of linkMap.values()) {
    if (!CHILD_REL_TYPES.has(link.type)) continue
    const list = childIndex.get(link.source) ?? []
    list.push(link.target)
    childIndex.set(link.source, list)
    const rmap = relIndex.get(link.source) ?? new Map<string, string>()
    rmap.set(link.target, link.type)
    relIndex.set(link.source, rmap)
  }
  return { childIndex, relIndex }
}

/**
 * MODULES 섹션: PACKAGE 계층 → MODULE → FUNCTION/CLASS → BusinessLogic.
 * PACKAGE 는 BELONGS_TO_PACKAGE 관계를 역방향으로 따라가 계층을 만든다.
 */
function buildModulesTree(
  nodeMap: Map<string, GraphNode>,
  linkMap: Map<string, GraphLink>,
): NavigatorTreeItem[] {
  const { childIndex, relIndex } = buildChildIndexes(linkMap)

  // child -BELONGS_TO_PACKAGE-> parent(PACKAGE) 인덱스
  const belongsTo = new Map<string, string[]>()   // parentPkgId → [childId]
  const ownsPackage = new Set<string>()            // BELONGS_TO_PACKAGE 의 source (자식)
  for (const link of linkMap.values()) {
    if (link.type !== 'BELONGS_TO_PACKAGE') continue
    ownsPackage.add(link.source)
    const list = belongsTo.get(link.target) ?? []
    list.push(link.source)
    belongsTo.set(link.target, list)
  }

  const visited = new Set<string>()

  function buildPkgTree(pkgId: string, depth: number): NavigatorTreeItem | null {
    if (visited.has(pkgId) || depth > 8) return null
    visited.add(pkgId)
    const pkg = nodeMap.get(pkgId)
    if (!pkg) return null
    const name = pickDisplayName(pkg)
    if (name === 'root') return null            // root 패키지는 숨김

    const children: NavigatorTreeItem[] = []
    for (const childId of belongsTo.get(pkgId) ?? []) {
      const child = nodeMap.get(childId)
      if (!child) continue
      if (child.labels.includes('PACKAGE')) {
        const pt = buildPkgTree(childId, depth + 1)
        if (pt) children.push(pt)
      } else if (child.labels.includes('MODULE')) {
        const mt = buildSubtree(childId, nodeMap, childIndex, relIndex, 0, new Set(visited))
        if (mt) children.push(mt)
      }
    }
    children.sort((a, b) => {
      // PACKAGE 를 먼저, 그 다음 MODULE
      const ap = a.labels.includes('PACKAGE') ? 0 : 1
      const bp = b.labels.includes('PACKAGE') ? 0 : 1
      return ap !== bp ? ap - bp : a.name.localeCompare(b.name)
    })

    return {
      id: pkg.id,
      name,
      nodeType: 'PACKAGE',
      labels: pkg.labels,
      children,
    }
  }

  // root 패키지의 직접 자식인 PACKAGE 를 최상위 루트로
  const roots: NavigatorTreeItem[] = []
  for (const pkg of nodeMap.values()) {
    if (!pkg.labels.includes('PACKAGE')) continue
    const parents = [...(linkMap.values())]
      .filter(l => l.type === 'BELONGS_TO_PACKAGE' && l.source === pkg.id)
      .map(l => nodeMap.get(l.target))
    const hasRootParent = parents.some(p => p && pickDisplayName(p) === 'root')
    if (hasRootParent) {
      const tree = buildPkgTree(pkg.id, 0)
      if (tree) roots.push(tree)
    }
  }

  // 패키지에 속하지 않는 MODULE 도 루트로 추가
  for (const node of nodeMap.values()) {
    if (!node.labels.includes('MODULE')) continue
    if (ownsPackage.has(node.id)) continue     // 이미 PACKAGE 트리 안에 있음
    const tree = buildSubtree(node.id, nodeMap, childIndex, relIndex, 0, new Set(visited))
    if (tree) roots.push(tree)
  }

  roots.sort((a, b) => a.name.localeCompare(b.name))
  return roots
}

/** TABLES 섹션: Table → Column (HAS_COLUMN). */
function buildTablesTree(
  nodeMap: Map<string, GraphNode>,
  linkMap: Map<string, GraphLink>,
): NavigatorTreeItem[] {
  const { childIndex, relIndex } = buildChildIndexes(linkMap)
  const roots: NavigatorTreeItem[] = []
  for (const node of nodeMap.values()) {
    if (!node.labels.includes('Table')) continue
    const tree = buildSubtree(node.id, nodeMap, childIndex, relIndex, 0, new Set())
    if (tree) roots.push(tree)
  }
  roots.sort((a, b) => a.name.localeCompare(b.name))
  return roots
}

/** 검색 필터 — 자기 자신이나 자손 중 매칭이 있으면 유지. */
function filterTree(items: NavigatorTreeItem[], query: string): NavigatorTreeItem[] {
  if (!query) return items
  const q = query.toLowerCase()
  const out: NavigatorTreeItem[] = []
  for (const item of items) {
    const self = item.name.toLowerCase().includes(q) || item.id.toLowerCase().includes(q)
    const kids = filterTree(item.children, q)
    if (self || kids.length > 0) out.push({ ...item, children: kids })
  }
  return out
}

// ═══════════════════════════════════════════════════════════════════════════
// Pinia Store
// ═══════════════════════════════════════════════════════════════════════════

export const useNavigatorStore = defineStore('navigator', () => {
  const projectStore = useProjectStore()

  // ── UI 상태 ──
  const isPanelOpen = ref(false)
  const activeView = ref<GraphSubView>('schema')

  // ── 트리 상태 ──
  // 기본 동작: 모든 노드가 펼쳐진 상태. 사용자가 접은 것만 collapsedNodes 에 들어간다.
  const expandedSections = ref<Set<NavigatorSection>>(
    new Set(['MODULES', 'TABLES'])
  )
  const collapsedNodes = ref<Set<string>>(new Set())
  const searchQuery = ref('')

  // ── 파생 트리 ──
  const moduleTree = computed(() =>
    filterTree(
      buildModulesTree(projectStore.nodeMap, projectStore.linkMap),
      searchQuery.value,
    )
  )

  const tableList = computed(() =>
    filterTree(
      buildTablesTree(projectStore.nodeMap, projectStore.linkMap),
      searchQuery.value,
    )
  )

  // ── UI 액션 ──
  function setPanelOpen(open: boolean): void {
    isPanelOpen.value = open
  }

  function setActiveView(view: GraphSubView): void {
    activeView.value = view
  }

  function toggleSection(section: NavigatorSection): void {
    const next = new Set(expandedSections.value)
    next.has(section) ? next.delete(section) : next.add(section)
    expandedSections.value = next
  }

  /**
   * 노드 펼침/접힘 토글. 기본 동작은 전체 펼침이므로 collapsedNodes 에 넣으면 접힘.
   */
  function toggleNode(nodeId: string): void {
    const next = new Set(collapsedNodes.value)
    next.has(nodeId) ? next.delete(nodeId) : next.add(nodeId)
    collapsedNodes.value = next
  }

  /** 노드가 펼쳐져 있는지 — collapsedNodes 에 없으면 펼침. */
  function isNodeExpanded(nodeId: string): boolean {
    return !collapsedNodes.value.has(nodeId)
  }

  /** 모든 노드 접기. */
  function collapseAll(): void {
    // 모든 트리 id 를 collapsedNodes 에 넣는다.
    const all = new Set<string>()
    const walk = (items: NavigatorTreeItem[]) => {
      for (const it of items) {
        if (it.children.length > 0) {
          all.add(it.id)
          walk(it.children)
        }
      }
    }
    walk(moduleTree.value)
    walk(tableList.value)
    collapsedNodes.value = all
  }

  /** 모든 노드 펼치기 (= collapsedNodes 비우기). */
  function expandAll(): void {
    collapsedNodes.value = new Set()
  }

  return {
    // UI
    isPanelOpen,
    activeView,
    setPanelOpen,
    setActiveView,
    // 트리 상태
    expandedSections,
    collapsedNodes,
    searchQuery,
    toggleSection,
    toggleNode,
    isNodeExpanded,
    collapseAll,
    expandAll,
    // 파생 뷰
    moduleTree,
    tableList,
  }
})
