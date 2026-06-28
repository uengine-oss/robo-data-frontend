/**
 * features/graph/stores/navigator.ts
 *
 * Navigator 사이드 패널의 모든 상태를 관리한다:
 *   - UI 상태        : 패널 열림/닫힘
 *   - 트리 상태      : 섹션 확장, 노드 확장, 검색어
 *   - 파생 트리 뷰   : MODULES / TABLES (projectStore 기반 computed)
 *
 * projectStore.nodeMap / linkMap 을 단일 진실 소스로 삼으며, 분석 스트림으로 데이터가
 * 쌓이는 동안 Pinia 반응성으로 트리가 자동 갱신된다.
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useAnalyzerStore } from '@/features/code-analysis/analyzer'
import type { GraphLink, GraphNode } from '@/shared/types'
import { ROUTINE_LABELS } from '@/shared/utils/nodeRelationships'
import { isContainerNode } from '@/shared/utils/nodeClassify'
import { typeWithLine, applyLogicalMode } from '@/shared/utils/graphDisplay'

// ═══════════════════════════════════════════════════════════════════════════
// 타입 정의
// ═══════════════════════════════════════════════════════════════════════════

export type NavigatorSection = 'MODULES' | 'TABLES'

export interface NavigatorTreeItem {
  id: string
  name: string
  nodeType: string        // 표시용 서브라벨 (CLASS/FUNCTION/Table 등)
  labels: string[]
  children: NavigatorTreeItem[]
}

// ═══════════════════════════════════════════════════════════════════════════
// 논리명/물리명 표시 전환 (모듈 레벨 — store + 헬퍼 함수 모두 접근)
// ═══════════════════════════════════════════════════════════════════════════

const showLogicalNames = ref(false)

// ═══════════════════════════════════════════════════════════════════════════
// 트리 빌드 헬퍼 (순수 함수)
// ═══════════════════════════════════════════════════════════════════════════

/** 종류(antlr type)=labels[0]. stereotype 은 위치(labels[1:])로 가르므로 하드코딩 안 함
 *  (드리프트 0 — nodeClassify.ts 와 동일 계약). 제외 대상은 외부 stub 마커뿐. */
const ROLE_LABELS = new Set(['INTERNAL', 'EXTERNAL'])

/** 트리에서 제외할 라벨 — 변수/상수(antlr type 전부)·EM 노드는 트리에 안 보인다. */
const EXCLUDED_LABELS = new Set([
  'VARIABLE', 'CONSTANT', 'GLOBAL_VARIABLE', 'DEFINE',
  'FIELD', 'MEMBER', 'PARAMETER', 'PACKAGE_VARIABLE', 'CURSOR_VARIABLE', 'CONSTANT_FIELD',
  'RULE', 'EXAMPLE', 'QUESTION',
])

/** 자식으로 확장할 관계 타입 (컨테이너 → 자식).
 *  HAS_MEMBER = 그릇(FILE/CLASS) → 멤버. 트리엔 **루틴만** 넣는다(데이터 멤버 변수·상수는
 *  노드패널 카드에서 표시 — 트리 노이즈 방지). 종류 구분 = 노드 라벨(buildChildIndexes). */
const CHILD_REL_TYPES = new Set([
  'HAS_MEMBER',           // 그릇 → 루틴 (PROCEDURE/FUNCTION/METHOD/TRIGGER)
  'HAS_METHOD', 'HAS_CLASS', 'HAS_INTERFACE',
  'CONTAINS',
  'HAS_COLUMN',           // Table → Column
  'HAS_BUSINESS_LOGIC',   // Function → BusinessLogic
])

// 비즈니스로직 메타(규칙·예시·질문) — 평소엔 트리에서 숨김, "숨김 요소 표시" 켜면 자식으로 펼침.
// FUNCTION-[HAS_RULE]->RULE-[HAS_EXAMPLE]->EXAMPLE, FUNCTION-[HAS_QUESTION]->QUESTION 계층.
const META_CHILD_RELS = new Set(['HAS_RULE', 'HAS_EXAMPLE', 'HAS_QUESTION'])

/**
 * 노드의 표시용 sublabel 을 결정한다.
 * 1) 부가 역할 라벨 제외한 첫 번째 = 실제 종류(antlr type, 예 [:METHOD]→'METHOD').
 * 2) 없으면(외부 stub 등) 우선순위 기반 폴백.
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
  if (node.labels.includes('BusinessLogic')) {
    const seq = p['sequence']
    const title = String(p['title'] ?? p['name'] ?? node.id)
    return seq != null ? `[${seq}] ${title}` : title
  }
  // 비즈니스로직 메타 — name 이 없어 본문 텍스트(statement/description/text)를 트리 라벨로(자르기).
  const metaText = node.labels.includes('RULE') ? p['statement']
    : node.labels.includes('EXAMPLE') ? p['description']
    : node.labels.includes('QUESTION') ? p['text'] : undefined
  if (metaText != null) {
    const s = String(metaText).trim()
    return s.length > 40 ? s.slice(0, 40) + '…' : (s || pickDisplayLabel(node.labels))
  }
  // 물리 식별자 — 이름 우선, 없으면 `타입 [라인]`(트리는 라인 표기). type 산출은 트리 고유(pickDisplayLabel).
  const name = p['name']
  const physical = name ? String(name) : typeWithLine(pickDisplayLabel(node.labels), p['start_line'], true)
  return applyLogicalMode(node, physical, showLogicalNames.value)
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
  // "숨김 요소 표시"(필터 메뉴) 켜지면 변수류도 트리에 노출 — 그래프/필터와 동일 토글.
  if (useAnalyzerStore().showHidden) return false
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
  const astChildren: NavigatorTreeItem[] = []   // DBMS 구문(PARENT_OF) — 소스 등장(라인) 순
  const otherChildren: NavigatorTreeItem[] = []

  for (const cid of childIds) {
    const child = buildSubtree(cid, nodeMap, childIndex, relIndex, depth + 1, visited)
    if (!child) continue
    const rel = relIndex.get(nodeId)?.get(cid)
    if (rel === 'HAS_BUSINESS_LOGIC') blChildren.push(child)
    else if (rel === 'PARENT_OF') {
      // DBMS 구문 — AST 중첩(소스 등장순). 배지·이름은 라벨/name 직독(classifyNode·pickDisplayName).
      astChildren.push(child)
    }
    else otherChildren.push(child)
  }

  otherChildren.sort((a, b) => a.name.localeCompare(b.name))
  // AST 구문은 실행 순서(시작 라인) — 알파벳 정렬하면 흐름이 깨짐.
  const lineOf = (id: string) => Number(nodeMap.get(id)?.properties?.start_line ?? 0)
  astChildren.sort((a, b) => lineOf(a.id) - lineOf(b.id))
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
    children: [...otherChildren, ...astChildren, ...blChildren],
  }
}

/** source → [targetIds] / source → (target → relType) 인덱스 빌드.
 *  DBMS: 구문은 PARENT_OF 로 부모(프로시저/구문) 아래 **AST 그대로 중첩**.
 *  그 구문이 모듈의 평면 자식(HAS_MEMBER 등)으로 **중복 등장하지 않도록** 억제(중첩 우선). */
function buildChildIndexes(
  linkMap: Map<string, GraphLink>,
  nodeMap: Map<string, GraphNode>,
) {
  const childIndex = new Map<string, string[]>()
  const relIndex = new Map<string, Map<string, string>>()
  const FLAT_CONTAINER_RELS = new Set(['HAS_MEMBER', 'HAS_METHOD'])
  // "숨김 요소 표시" 켜지면 데이터 멤버(변수/상수)도 트리에 — 기본은 루틴만(노이즈 방지).
  const showHidden = useAnalyzerStore().showHidden

  // 1) PARENT_OF 부모를 가진 노드(=DBMS 구문) 집합 — 평면 컨테이너 자식에서 제외 대상.
  const hasParent = new Set<string>()
  for (const link of linkMap.values()) {
    if (link.type === 'PARENT_OF') hasParent.add(link.target)
  }

  const add = (src: string, tgt: string, type: string) => {
    const list = childIndex.get(src) ?? []
    list.push(tgt)
    childIndex.set(src, list)
    const rmap = relIndex.get(src) ?? new Map<string, string>()
    rmap.set(tgt, type)
    relIndex.set(src, rmap)
  }

  for (const link of linkMap.values()) {
    if (link.type === 'PARENT_OF') { add(link.source, link.target, 'PARENT_OF'); continue }
    // 메타(규칙·예시·질문)는 "숨김 요소 표시" 켤 때만 자식으로 — 평소엔 트리 노이즈 방지.
    const isChildRel = CHILD_REL_TYPES.has(link.type) || (showHidden && META_CHILD_RELS.has(link.type))
    if (!isChildRel) continue
    // HAS_MEMBER 는 기본 루틴만 트리에(데이터 멤버는 노이즈) — 숨김 표시 켜지면 변수/상수도 포함.
    if (link.type === 'HAS_MEMBER' && !showHidden) {
      const tgt = nodeMap.get(link.target)
      if (!tgt || !tgt.labels.some(l => ROUTINE_LABELS.has(l))) continue
    }
    // 구문(PARENT_OF 부모 보유)은 모듈 평면 자식으로 넣지 않음 — 중첩 위치(부모 아래)에만.
    if (hasParent.has(link.target) && FLAT_CONTAINER_RELS.has(link.type)) continue
    add(link.source, link.target, link.type)
  }
  return { childIndex, relIndex }
}

/**
 * MODULES 섹션: PACKAGE 계층 → MODULE → FUNCTION/CLASS → BusinessLogic.
 *
 * 견고성 원칙 (스트리밍 도중에도 0건이 되지 않도록):
 * 1. MODULE 라벨이 있는 모든 노드를 우선 트리에 등장시킨다.
 * 2. PACKAGE 계층은 부수적 — 형성되면 MODULE 을 그 안에 흡수, 안 되면 평면으로.
 * 3. 'root' 패키지 식별 실패해도 MODULE 자체는 항상 노출 (스트림 초기에도 카운트 > 0).
 */
function buildModulesTree(
  nodeMap: Map<string, GraphNode>,
  linkMap: Map<string, GraphLink>,
): NavigatorTreeItem[] {
  const { childIndex, relIndex } = buildChildIndexes(linkMap, nodeMap)

  // BELONGS_TO: source = 자식(그릇), target = 부모(PACKAGE). Table→Schema 도 같은 BELONGS_TO 라
  // **대상이 PACKAGE 인 것만** 패키지 트리에 쓴다(스키마 소속이 모듈 트리를 오염시키지 않도록).
  const belongsTo = new Map<string, string[]>()   // parentPkgId → [childId]
  const parentOf = new Map<string, string>()       // childId → parentPkgId
  for (const link of linkMap.values()) {
    if (link.type !== 'BELONGS_TO') continue
    const parent = nodeMap.get(link.target)
    if (!parent || !parent.labels.includes('PACKAGE')) continue
    parentOf.set(link.source, link.target)
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
      } else if (isContainerNode(child.labels)) {
        const mt = buildSubtree(childId, nodeMap, childIndex, relIndex, 0, new Set(visited))
        if (mt) {
          visited.add(childId)
          children.push(mt)
        }
      }
    }
    children.sort((a, b) => {
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

  const roots: NavigatorTreeItem[] = []

  // [A] PACKAGE 계층 — root 부모를 가진 최상위 패키지부터 (있으면)
  for (const pkg of nodeMap.values()) {
    if (!pkg.labels.includes('PACKAGE')) continue
    const parentPkgId = parentOf.get(pkg.id)
    const parent = parentPkgId ? nodeMap.get(parentPkgId) : null
    const isTopLevel = !parent || pickDisplayName(parent) === 'root' || !parent.labels.includes('PACKAGE')
    if (!isTopLevel) continue
    const tree = buildPkgTree(pkg.id, 0)
    if (tree) roots.push(tree)
  }

  // [B] 위에서 흡수 안 된 MODULE 은 전부 평면 루트로 노출 (스트림 초기에도 카운트 > 0).
  for (const node of nodeMap.values()) {
    if (!isContainerNode(node.labels)) continue
    if (visited.has(node.id)) continue           // 이미 PACKAGE 트리에 들어감
    const tree = buildSubtree(node.id, nodeMap, childIndex, relIndex, 0, new Set(visited))
    if (tree) {
      visited.add(node.id)
      roots.push(tree)
    }
  }

  roots.sort((a, b) => a.name.localeCompare(b.name))
  return roots
}

/** TABLES 섹션: Table → Column (HAS_COLUMN). */
function buildTablesTree(
  nodeMap: Map<string, GraphNode>,
  linkMap: Map<string, GraphLink>,
): NavigatorTreeItem[] {
  const { childIndex, relIndex } = buildChildIndexes(linkMap, nodeMap)
  const roots: NavigatorTreeItem[] = []
  for (const node of nodeMap.values()) {
    if (!node.labels.includes('TABLE')) continue
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
  const projectStore = useAnalyzerStore()

  // ── UI 상태 ──
  const isPanelOpen = ref(false)

  // ── 트리 상태 ──
  // 기본 동작: 모든 노드가 펼쳐진 상태. 사용자가 접은 것만 collapsedNodes 에 들어간다.
  const expandedSections = ref<Set<NavigatorSection>>(
    new Set(['MODULES', 'TABLES'])
  )
  const collapsedNodes = ref<Set<string>>(new Set())
  const searchQuery = ref('')

  // ── 선택 상태 ──
  // Navigator 단일 클릭 시 세팅 — GraphTab 이 watch 해서 노드 디테일 패널에 즉시 표시.
  const selectedNodeId = ref<string | null>(null)

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

  /** Navigator 트리 노드 단일 클릭 — 디테일 패널에 즉시 표시. */
  function selectNode(nodeId: string | null): void {
    selectedNodeId.value = nodeId
  }

  function toggleLogicalNames(): void {
    showLogicalNames.value = !showLogicalNames.value
  }

  return {
    // UI
    isPanelOpen,
    setPanelOpen,
    // 논리명/물리명 토글
    showLogicalNames,
    toggleLogicalNames,
    // 트리 상태
    expandedSections,
    collapsedNodes,
    searchQuery,
    toggleSection,
    toggleNode,
    isNodeExpanded,
    collapseAll,
    expandAll,
    // 선택 상태
    selectedNodeId,
    selectNode,
    // 파생 뷰
    moduleTree,
    tableList,
  }
})
