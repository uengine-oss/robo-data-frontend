/**
 * classDiagram.ts
 * VueFlow 기반 클래스 다이어그램 유틸리티
 * 
 * Neo4j 그래프 데이터를 VueFlow 노드/엣지로 변환하고
 * 깊이 기반 필터링, 노이즈 제거 등을 수행합니다.
 */

import type { GraphNode, GraphLink } from '@/types'

// ============================================================================
// 상수 정의
// ============================================================================

/** 클래스/인터페이스 라벨 */
export const CLASS_LABELS = ['CLASS', 'Class', 'INTERFACE', 'Interface', 'ENUM', 'Enum']

/** 클래스 관계 타입 */
export const CLASS_RELATION_TYPES = ['EXTENDS', 'IMPLEMENTS', 'ASSOCIATION', 'AGGREGATION', 'COMPOSITION', 'DEPENDENCY']

/** 소유 관계 타입 (상속 체인 필터링에 사용) */
export const OWNERSHIP_TYPES = new Set(['COMPOSITION', 'ASSOCIATION'])

/** 관계 강도 (중복 제거 시 사용)
 * 우선순위: EXTENDS/IMPLEMENTS > COMPOSITION > ASSOCIATION > DEPENDENCY
 */
export const RELATION_STRENGTH: Record<string, number> = {
  EXTENDS: 4,
  IMPLEMENTS: 4,
  COMPOSITION: 3,
  AGGREGATION: 3,
  ASSOCIATION: 2,
  DEPENDENCY: 1
}

/** UML 표기법 접근제어자 매핑 */
export const VISIBILITY_MAP: Record<string, string> = {
  public: '+',
  private: '-',
  protected: '#',
  default: '~'
}

/** 관계 화살표 스타일 (머메이드 스타일) */
export const ARROW_STYLES: Record<string, { markerEnd: string; style: string; label?: string }> = {
  EXTENDS: { markerEnd: 'arrowclosed', style: 'stroke: #333333; stroke-width: 2px;' },
  IMPLEMENTS: { markerEnd: 'arrowclosed', style: 'stroke: #333333; stroke-width: 2px; stroke-dasharray: 6 4;' },
  ASSOCIATION: { markerEnd: 'arrow', style: 'stroke: #333333; stroke-width: 1.5px;' },
  AGGREGATION: { markerEnd: 'arrow', style: 'stroke: #333333; stroke-width: 1.5px;' },
  COMPOSITION: { markerEnd: 'arrow', style: 'stroke: #333333; stroke-width: 2px;' },
  DEPENDENCY: { markerEnd: 'arrow', style: 'stroke: #666666; stroke-width: 1.5px; stroke-dasharray: 4 3;' }
}

// ============================================================================
// 타입 정의
// ============================================================================

/** UML 클래스 정보 */
export interface UmlClass {
  id: string
  className: string
  directory: string
  classType: 'class' | 'interface' | 'enum'
  isAbstract: boolean
  fields: UmlField[]
  methods: UmlMethod[]
}

/** UML 필드 정보 */
export interface UmlField {
  name: string
  type: string
  visibility: 'public' | 'private' | 'protected' | 'default'
}

/** UML 메서드 정보 */
export interface UmlMethod {
  name: string
  returnType: string
  visibility: 'public' | 'private' | 'protected' | 'default'
  parameters: UmlParameter[]
  isConstructor: boolean
}

/** UML 파라미터 정보 */
export interface UmlParameter {
  name: string
  type: string
}

/** UML 관계 정보 */
export interface UmlRelationship {
  id: string
  source: string
  target: string
  sourceClassName: string
  targetClassName: string
  type: string
  label?: string
  multiplicity?: string
}

/** VueFlow 노드 데이터 */
export interface ClassNodeData {
  umlClass: UmlClass
  isExpanded: boolean
  isSelected: boolean
  depth: number
}

/** VueFlow 엣지 데이터 */
export interface ClassEdgeData {
  relationship: UmlRelationship
}

// ============================================================================
// 유틸리티 함수 - 노드 정보 추출
// ============================================================================

/**
 * GraphNode에서 클래스명 추출
 */
export function getClassName(node: GraphNode): string {
  return (node.properties?.class_name as string) 
    || (node.properties?.name as string) 
    || ''
}

/**
 * GraphNode에서 디렉토리 추출
 */
export function getDirectory(node: GraphNode): string {
  return (node.properties?.directory as string)
    || (node.properties?.package_name as string)
    || ''
}

/**
 * 노드가 클래스/인터페이스인지 확인
 */
export function isClassNode(node: GraphNode): boolean {
  return node.labels?.some(label => CLASS_LABELS.includes(label)) ?? false
}

/**
 * 노드의 클래스 타입 추출
 */
export function getClassType(node: GraphNode): 'class' | 'interface' | 'enum' {
  const labels = node.labels || []
  if (labels.some(l => l.toUpperCase() === 'INTERFACE')) return 'interface'
  if (labels.some(l => l.toUpperCase() === 'ENUM')) return 'enum'
  return 'class'
}

// ============================================================================
// 유틸리티 함수 - 관계 필터링
// ============================================================================

/**
 * GraphLink가 클래스 관계인지 확인
 */
export function isClassRelation(link: GraphLink): boolean {
  return CLASS_RELATION_TYPES.includes(link.type?.toUpperCase() || '')
}

/**
 * DEPENDENCY가 value object인지 확인
 * (is_value_object가 true이면 제외)
 */
export function isValueObjectDependency(link: GraphLink): boolean {
  if (link.type?.toUpperCase() !== 'DEPENDENCY') return false
  return link.properties?.is_value_object === true
}

// ============================================================================
// 상속 체인 분석
// ============================================================================

/**
 * 상속 관계 맵 생성: {childId: [parentId1, parentId2, ...]}
 */
export function buildInheritanceMap(links: GraphLink[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  
  for (const link of links) {
    const type = link.type?.toUpperCase()
    if (type === 'EXTENDS' || type === 'IMPLEMENTS') {
      const parents = map.get(link.source) || []
      parents.push(link.target)
      map.set(link.source, parents)
    }
  }
  
  return map
}

/**
 * 모든 조상 노드 ID 조회 (재귀적)
 */
export function getAllAncestors(nodeId: string, inheritanceMap: Map<string, string[]>): Set<string> {
  const ancestors = new Set<string>()
  const parents = inheritanceMap.get(nodeId)
  
  if (!parents) return ancestors
  
  for (const parent of parents) {
    ancestors.add(parent)
    const grandAncestors = getAllAncestors(parent, inheritanceMap)
    grandAncestors.forEach(a => ancestors.add(a))
  }
  
  return ancestors
}

/**
 * 소유 관계 맵 생성: {sourceId: {targetId: relationType}}
 */
export function buildOwnershipMap(links: GraphLink[]): Map<string, Map<string, string>> {
  const map = new Map<string, Map<string, string>>()
  
  for (const link of links) {
    const type = link.type?.toUpperCase() || ''
    if (OWNERSHIP_TYPES.has(type)) {
      let targetMap = map.get(link.source)
      if (!targetMap) {
        targetMap = new Map()
        map.set(link.source, targetMap)
      }
      targetMap.set(link.target, type)
    }
  }
  
  return map
}

/**
 * 노이즈 DEPENDENCY인지 판단
 * 1. 상위 클래스에서 이미 소유 관계가 있는 타겟으로의 DEPENDENCY는 노이즈
 * 2. 상속/구현 관계가 있으면 DEPENDENCY는 노이즈 (더 강한 관계가 있음)
 */
export function isNoiseDependency(
  sourceId: string,
  targetId: string,
  inheritanceMap: Map<string, string[]>,
  ownershipMap: Map<string, Map<string, string>>,
  allLinks: GraphLink[]
): boolean {
  // 1) 상속/구현 관계가 있으면 DEPENDENCY는 노이즈
  const hasInheritance = allLinks.some(link => {
    const type = link.type?.toUpperCase()
    return (type === 'EXTENDS' || type === 'IMPLEMENTS') &&
           link.source === sourceId &&
           link.target === targetId
  })
  if (hasInheritance) return true
  
  // 2) 상위 클래스에서 이미 소유 관계가 있는 타겟으로의 DEPENDENCY는 노이즈
  const ancestors = getAllAncestors(sourceId, inheritanceMap)
  
  for (const ancestor of ancestors) {
    const ownershipTargets = ownershipMap.get(ancestor)
    if (ownershipTargets?.has(targetId)) {
      return true
    }
  }
  
  return false
}

// ============================================================================
// 관계 필터링 및 중복 제거
// ============================================================================

/**
 * 노이즈 DEPENDENCY 제거
 */
export function filterNoiseDependencies(
  links: GraphLink[],
  inheritanceMap: Map<string, string[]>,
  ownershipMap: Map<string, Map<string, string>>
): GraphLink[] {
  return links.filter(link => {
    const type = link.type?.toUpperCase()
    
    // DEPENDENCY가 아니면 유지
    if (type !== 'DEPENDENCY') return true
    
    // value object DEPENDENCY 제외
    if (isValueObjectDependency(link)) return false
    
    // 노이즈 DEPENDENCY 제외 (allLinks 전달)
    return !isNoiseDependency(link.source, link.target, inheritanceMap, ownershipMap, links)
  })
}

/**
 * 관계 중복 제거 및 병합
 * 
 * - 같은 노드 쌍 간 가장 강한 관계만 유지 (EXTENDS/IMPLEMENTS는 둘 다 유지)
 * - source_members 병합
 * - 양방향 관계 감지
 * 
 * 우선순위: EXTENDS/IMPLEMENTS (4) > COMPOSITION (3) > ASSOCIATION (2) > DEPENDENCY (1)
 */
export function dedupeRelationships(links: GraphLink[]): GraphLink[] {
  // 1. 노드 쌍 + 타입별로 그룹화
  const groups = new Map<string, GraphLink[]>()
  for (const link of links) {
    const key = `${link.source}::${link.target}::${link.type?.toUpperCase() || ''}`
    const arr = groups.get(key) || []
    arr.push(link)
    groups.set(key, arr)
  }
  
  // 2. 같은 타입의 링크들을 병합 (source_members 수집)
  const merged = new Map<string, GraphLink>()
  for (const [key, groupLinks] of groups) {
    const base = groupLinks[0]
    const mergedLink = { 
      ...base, 
      properties: base.properties ? { ...base.properties } : {} 
    }
    
    // source_members 병합
    const allMembers = new Set<string>()
    for (const link of groupLinks) {
      const members = link.properties?.source_members
      if (!members) continue
      const arr = Array.isArray(members) ? members : [members]
      arr.filter(Boolean).forEach(m => allMembers.add(String(m)))
    }
    mergedLink.properties.source_members = Array.from(allMembers)
    merged.set(key, mergedLink)
  }
  
  // 3. 노드 쌍별로 가장 강한 관계만 선택
  const pairGroups = new Map<string, GraphLink[]>()
  for (const link of merged.values()) {
    const pairKey = `${link.source}::${link.target}`
    const arr = pairGroups.get(pairKey) || []
    arr.push(link)
    pairGroups.set(pairKey, arr)
  }
  
  // 4. 양방향 관계 감지용 키 세트
  const processedBidirectional = new Set<string>()
  
  const result: GraphLink[] = []
  for (const [pairKey, pairLinks] of pairGroups) {
    // 최대 강도 찾기
    const maxStrength = Math.max(...pairLinks.map(l => RELATION_STRENGTH[l.type?.toUpperCase() || ''] || 0))
    
    // 최대 강도인 관계만 선택 (EXTENDS/IMPLEMENTS는 둘 다 유지)
    const selected = pairLinks.filter(l => {
      const type = l.type?.toUpperCase() || ''
      const strength = RELATION_STRENGTH[type] || 0
      return strength === maxStrength
    })
    
    for (const link of selected) {
      const type = link.type?.toUpperCase() || ''
      const [source, target] = pairKey.split('::')
      const reverseKey = `${target}::${source}`
      
      // 양방향 관계 확인
      const reverseLinks = pairGroups.get(reverseKey)
      const isBidirectional = reverseLinks?.some(r => r.type?.toUpperCase() === type) ?? false
      
      if (isBidirectional) {
        // 양방향은 한 번만 추가
        const biKey = source < target ? `${source}::${target}::${type}` : `${target}::${source}::${type}`
        if (processedBidirectional.has(biKey)) continue
        processedBidirectional.add(biKey)
        link.properties.is_bidirectional = true
      }
      
      result.push(link)
    }
  }
  
  return result
}

// ============================================================================
// 깊이 기반 필터링
// ============================================================================

/**
 * BFS로 특정 깊이까지의 관련 노드 ID 수집
 * 
 * @param startNodeIds 시작 노드 ID 목록
 * @param links 클래스 관계 링크 목록
 * @param maxDepth 최대 탐색 깊이 (1이면 시작 노드 + 1단계 연결만)
 */
export function getNodesWithinDepth(
  startNodeIds: string[],
  links: GraphLink[],
  maxDepth: number
): Set<string> {
  // 시작 노드가 없으면 빈 집합 반환
  if (startNodeIds.length === 0) {
    return new Set()
  }
  
  const visited = new Set<string>(startNodeIds)
  
  // maxDepth가 0이면 시작 노드만 반환
  if (maxDepth <= 0) {
    return visited
  }
  
  const queue: { id: string; depth: number }[] = startNodeIds.map(id => ({ id, depth: 0 }))
  
  // 양방향 인접 리스트 생성 (클래스 관계만)
  const adjacency = new Map<string, Set<string>>()
  for (const link of links) {
    if (!isClassRelation(link)) continue
    
    // source -> target
    let fromSource = adjacency.get(link.source)
    if (!fromSource) {
      fromSource = new Set()
      adjacency.set(link.source, fromSource)
    }
    fromSource.add(link.target)
    
    // target -> source (양방향)
    let fromTarget = adjacency.get(link.target)
    if (!fromTarget) {
      fromTarget = new Set()
      adjacency.set(link.target, fromTarget)
    }
    fromTarget.add(link.source)
  }
  
  // BFS 탐색
  while (queue.length > 0) {
    const { id, depth } = queue.shift()!
    
    // 현재 깊이가 maxDepth에 도달하면 더 이상 이웃 탐색하지 않음
    if (depth >= maxDepth) continue
    
    const neighbors = adjacency.get(id)
    if (!neighbors) continue
    
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor)
        queue.push({ id: neighbor, depth: depth + 1 })
      }
    }
  }
  
  return visited
}

// ============================================================================
// Neo4j 데이터 → UML 변환
// ============================================================================

/** FIELD 노드 라벨 */
const FIELD_LABELS = ['FIELD', 'Field']

/** METHOD/CONSTRUCTOR 노드 라벨 */
const METHOD_LABELS = ['METHOD', 'Method', 'CONSTRUCTOR', 'Constructor']

/** Parameter 노드 라벨 */
const PARAMETER_LABELS = ['Parameter', 'PARAMETER']

/**
 * 노드가 FIELD인지 확인
 */
export function isFieldNode(node: GraphNode): boolean {
  return node.labels?.some(label => FIELD_LABELS.includes(label)) ?? false
}

/**
 * 노드가 METHOD/CONSTRUCTOR인지 확인
 */
export function isMethodNode(node: GraphNode): boolean {
  return node.labels?.some(label => METHOD_LABELS.includes(label)) ?? false
}

/**
 * 노드가 Parameter인지 확인
 */
export function isParameterNode(node: GraphNode): boolean {
  return node.labels?.some(label => PARAMETER_LABELS.includes(label)) ?? false
}

/**
 * 노드가 CONSTRUCTOR인지 확인
 */
export function isConstructorNode(node: GraphNode): boolean {
  return node.labels?.some(label => 
    label.toUpperCase() === 'CONSTRUCTOR'
  ) ?? false
}

/**
 * HAS_FIELD / HAS_METHOD 관계를 통해 클래스별 필드/메서드 맵 생성
 */
export function buildClassMembersMap(
  nodes: GraphNode[],
  links: GraphLink[]
): Map<string, { fields: GraphNode[]; methods: GraphNode[] }> {
  const map = new Map<string, { fields: GraphNode[]; methods: GraphNode[] }>()
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  
  // HAS_FIELD / HAS_METHOD 관계 처리
  for (const link of links) {
    const type = (link.type || '').toUpperCase()
    if (type !== 'HAS_FIELD' && type !== 'HAS_METHOD') continue
    
    const parentNode = nodeMap.get(link.source)
    const childNode = nodeMap.get(link.target)
    
    if (!parentNode || !childNode) continue
    if (!isClassNode(parentNode)) continue
    
    let members = map.get(parentNode.id)
    if (!members) {
      members = { fields: [], methods: [] }
      map.set(parentNode.id, members)
    }
    
    if (type === 'HAS_FIELD' && isFieldNode(childNode)) {
      members.fields.push(childNode)
    } else if (type === 'HAS_METHOD' && isMethodNode(childNode)) {
      members.methods.push(childNode)
    }
  }
  
  return map
}

/**
 * HAS_PARAMETER 관계를 통해 메서드별 파라미터 맵 생성
 */
export function buildMethodParametersMap(
  nodes: GraphNode[],
  links: GraphLink[]
): Map<string, GraphNode[]> {
  const map = new Map<string, GraphNode[]>()
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  
  for (const link of links) {
    if (link.type !== 'HAS_PARAMETER') continue
    
    const methodNode = nodeMap.get(link.source)
    const paramNode = nodeMap.get(link.target)
    
    if (!methodNode || !paramNode) continue
    if (!isMethodNode(methodNode)) continue
    
    let params = map.get(methodNode.id)
    if (!params) {
      params = []
      map.set(methodNode.id, params)
    }
    
    params.push(paramNode)
  }
  
  // 파라미터 index 순으로 정렬
  for (const params of map.values()) {
    params.sort((a, b) => {
      const indexA = (a.properties?.index as number) || 0
      const indexB = (b.properties?.index as number) || 0
      return indexA - indexB
    })
  }
  
  return map
}

/**
 * FIELD 노드를 UmlField로 변환
 */
export function convertFieldNode(node: GraphNode): UmlField {
  return {
    name: (node.properties?.name as string) || '',
    type: (node.properties?.field_type as string) 
      || (node.properties?.type as string) 
      || '',
    visibility: ((node.properties?.visibility as string) || 'private') as UmlField['visibility']
  }
}

/**
 * METHOD 노드를 UmlMethod로 변환
 */
export function convertMethodNode(
  node: GraphNode,
  parametersMap: Map<string, GraphNode[]>
): UmlMethod {
  const params = parametersMap.get(node.id) || []
  
  return {
    name: (node.properties?.name as string) || '',
    returnType: (node.properties?.return_type as string) 
      || (node.properties?.returnType as string) 
      || 'void',
    visibility: ((node.properties?.visibility as string) || 'public') as UmlMethod['visibility'],
    parameters: params.map(p => ({
      name: (p.properties?.name as string) || '',
      type: (p.properties?.type as string) || ''
    })),
    isConstructor: isConstructorNode(node)
  }
}

/**
 * GraphNode를 UmlClass로 변환 (멤버 정보 포함)
 */
export function convertToUmlClass(
  node: GraphNode,
  membersMap?: Map<string, { fields: GraphNode[]; methods: GraphNode[] }>,
  parametersMap?: Map<string, GraphNode[]>
): UmlClass | null {
  if (!isClassNode(node)) return null
  
  const className = getClassName(node)
  if (!className) return null
  
  // 멤버 맵에서 필드/메서드 추출
  const members = membersMap?.get(node.id)
  
  let fields: UmlField[] = []
  let methods: UmlMethod[] = []
  
  if (members) {
    // PARENT_OF 관계를 통해 연결된 FIELD/METHOD 노드 사용
    fields = members.fields.map(convertFieldNode).filter(f => f.name)
    methods = members.methods
      .map(m => convertMethodNode(m, parametersMap || new Map()))
      .filter(m => m.name)
  } else {
    // fallback: properties에서 직접 추출 (이전 방식)
    const rawFields = (node.properties?.fields as any[]) || []
    fields = rawFields
      .filter(f => f && f.name)
      .map(f => ({
        name: f.name || '',
        type: f.type || f.field_type || '',
        visibility: (f.visibility || 'private') as UmlField['visibility']
      }))
    
    const rawMethods = (node.properties?.methods as any[]) || []
    methods = rawMethods
      .filter(m => m && m.name)
      .map(m => ({
        name: m.name || '',
        returnType: m.return_type || m.returnType || 'void',
        visibility: (m.visibility || 'public') as UmlMethod['visibility'],
        parameters: (m.parameters || []).map((p: any) => ({
          name: p.name || '',
          type: p.type || ''
        })),
        isConstructor: m.kind === 'constructor' || m.isConstructor === true
      }))
  }
  
  return {
    id: node.id,
    className,
    directory: getDirectory(node),
    classType: getClassType(node),
    isAbstract: (node.properties?.is_abstract as boolean) || false,
    fields,
    methods
  }
}

/**
 * GraphLink를 UmlRelationship으로 변환
 */
export function convertToUmlRelationship(
  link: GraphLink,
  nodeMap: Map<string, GraphNode>
): UmlRelationship | null {
  if (!isClassRelation(link)) return null
  
  const sourceNode = nodeMap.get(link.source)
  const targetNode = nodeMap.get(link.target)
  
  if (!sourceNode || !targetNode) return null
  
  const sourceClassName = getClassName(sourceNode)
  const targetClassName = getClassName(targetNode)
  
  if (!sourceClassName || !targetClassName) return null
  
  const linkType = link.type?.toUpperCase() || 'ASSOCIATION'
  
  // label 처리: source_members를 우선 사용, 없으면 label 사용
  let label: string | undefined = undefined
  const rawLabel = link.properties?.source_members || link.properties?.label
  if (Array.isArray(rawLabel)) {
    label = rawLabel.filter(Boolean).join(', ')
  } else if (rawLabel) {
    label = String(rawLabel)
  }
  
  return {
    id: link.id,
    source: link.source,
    target: link.target,
    sourceClassName,
    targetClassName,
    type: linkType,
    label: label,
    multiplicity: (link.properties?.multiplicity as string) || undefined
  }
}

// ============================================================================
// 메인 변환 함수
// ============================================================================

export interface ClassDiagramData {
  classes: UmlClass[]
  relationships: UmlRelationship[]
}

/**
 * Neo4j 그래프 데이터에서 클래스 다이어그램 데이터 생성
 * 
 * @param nodes 전체 노드 목록
 * @param links 전체 링크 목록
 * @param selectedNodeIds 선택된 시작 노드 ID 목록
 * @param depth 탐색 깊이 (기본 3)
 */
export function buildClassDiagramData(
  nodes: GraphNode[],
  links: GraphLink[],
  selectedNodeIds: string[],
  depth: number = 3
): ClassDiagramData {
  // 1. 클래스/인터페이스 노드만 필터링
  const classNodes = nodes.filter(isClassNode)
  const nodeMap = new Map(classNodes.map(n => [n.id, n]))
  const allNodeMap = new Map(nodes.map(n => [n.id, n]))
  
  // 2. 클래스 멤버(필드/메서드) 맵 생성 (PARENT_OF 관계 활용)
  const membersMap = buildClassMembersMap(nodes, links)
  
  // 3. 메서드 파라미터 맵 생성 (HAS_PARAMETER 관계 활용)
  const parametersMap = buildMethodParametersMap(nodes, links)
  
  // 4. 클래스 관계만 필터링
  const classLinks = links.filter(link => {
    if (!isClassRelation(link)) return false
    // 양쪽 노드가 클래스/인터페이스인 경우만
    return nodeMap.has(link.source) && nodeMap.has(link.target)
  })
  
  // 5. 상속/소유 관계 맵 생성
  const inheritanceMap = buildInheritanceMap(classLinks)
  const ownershipMap = buildOwnershipMap(classLinks)
  
  // 6. 노이즈 DEPENDENCY 제거
  const filteredLinks = filterNoiseDependencies(classLinks, inheritanceMap, ownershipMap)
  
  // 7. 관계 중복 제거
  const dedupedLinks = dedupeRelationships(filteredLinks)
  
  // 8. 깊이 기반 노드 필터링
  const validNodeIds = getNodesWithinDepth(selectedNodeIds, dedupedLinks, depth)
  
  // 9. 유효한 노드/관계만 추출
  const validNodes = classNodes.filter(n => validNodeIds.has(n.id))
  const validLinks = dedupedLinks.filter(
    l => validNodeIds.has(l.source) && validNodeIds.has(l.target)
  )
  
  // 10. UML 형식으로 변환 (멤버 맵 활용)
  const classes = validNodes
    .map(n => convertToUmlClass(n, membersMap, parametersMap))
    .filter((c): c is UmlClass => c !== null)
  
  const relationships = validLinks
    .map(l => convertToUmlRelationship(l, allNodeMap))
    .filter((r): r is UmlRelationship => r !== null)
  
  return { classes, relationships }
}

/**
 * 클래스명으로 노드 ID 찾기
 */
export function findNodeIdByClassName(
  nodes: GraphNode[],
  className: string,
  directory?: string
): string | null {
  const node = nodes.find(n => {
    if (!isClassNode(n)) return false
    const nodeName = getClassName(n)
    const nodeDir = getDirectory(n)
    
    if (directory) {
      return nodeName === className && nodeDir === directory
    }
    return nodeName === className
  })
  
  return node?.id || null
}

/**
 * 여러 클래스의 노드 ID 찾기
 */
export function findNodeIdsByClassNames(
  nodes: GraphNode[],
  classInfos: Array<{ className: string; directory?: string }>
): string[] {
  return classInfos
    .map(info => findNodeIdByClassName(nodes, info.className, info.directory))
    .filter((id): id is string => id !== null)
}

