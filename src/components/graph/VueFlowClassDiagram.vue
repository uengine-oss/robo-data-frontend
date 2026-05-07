<script setup lang="ts">
/**
 * VueFlowClassDiagram.vue
 * VueFlow 기반 UML 클래스 다이어그램 컴포넌트
 * 
 * 주요 기능:
 * - Neo4j 데이터를 기반으로 UML 클래스 다이어그램 렌더링
 * - 깊이 기반 노드 필터링
 * - 클래스 노드 확장 기능
 * - 드래그/줌 인터랙션
 */

import { logger } from '@/utils/logger'
import { ref, computed, watch, nextTick } from 'vue'
import { VueFlow, useVueFlow, Handle, Position } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import type { Node, Edge, NodeMouseEvent } from '@vue-flow/core'
import type { GraphNode, GraphLink } from '@/types'
import {
  buildClassDiagramData,
  findNodeIdsByClassNames,
  ARROW_STYLES,
  VISIBILITY_MAP,
  type UmlClass,
  type ClassDiagramData
} from '@/utils/classDiagram'
import ELK from 'elkjs'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'

// ============================================================================
// Props & Emits
// ============================================================================

interface Props {
  /** 전체 그래프 노드 */
  graphNodes: GraphNode[]
  /** 전체 그래프 링크 */
  graphLinks: GraphLink[]
  /** 선택된 클래스 정보 */
  selectedClasses: Array<{ className: string; directory: string }>
  /** 탐색 깊이 */
  depth: number
}

const props = withDefaults(defineProps<Props>(), {
  depth: 3
})

const emit = defineEmits<{
  /** 클래스 노드 클릭 */
  (e: 'class-click', nodeId: string): void
  /** 클래스 노드 더블클릭 (확장) */
  (e: 'class-expand', className: string, directory: string): void
}>()

// ============================================================================
// VueFlow 설정
// ============================================================================

const { fitView } = useVueFlow()

// ============================================================================
// ELK 레이아웃 엔진
// ============================================================================

const elk = new ELK()

// ============================================================================
// 상태
// ============================================================================

/** VueFlow 노드 */
const nodes = ref<Node[]>([])

/** VueFlow 엣지 */
const edges = ref<Edge[]>([])

/** 선택된 노드 ID */
const selectedNodeId = ref<string | null>(null)

/** 다이어그램 데이터 */
const diagramData = ref<ClassDiagramData | null>(null)

// ============================================================================
// Computed
// ============================================================================

/** 다이어그램이 비어있는지 */
const isEmpty = computed(() => nodes.value.length === 0)

function isInheritance(type: string): boolean {
  return type === 'EXTENDS' || type === 'IMPLEMENTS'
}

/** 노드 크기 정보 */
interface NodeSize {
  width: number
  height: number
}

/**
 * 두 노드가 겹치는지 확인 (마진 포함)
 */
function checkOverlap(
  pos1: { x: number; y: number }, size1: NodeSize,
  pos2: { x: number; y: number }, size2: NodeSize,
  margin: number
): boolean {
  return !(
    pos1.x + size1.width + margin < pos2.x ||
    pos2.x + size2.width + margin < pos1.x ||
    pos1.y + size1.height + margin < pos2.y ||
    pos2.y + size2.height + margin < pos1.y
  )
}

/**
 * 겹침 해소: 겹치는 노드들을 밀어내기
 */
function resolveOverlaps(
  positions: Map<string, { x: number; y: number }>,
  sizes: Map<string, NodeSize>,
  margin: number = 60
): void {
  const ids = Array.from(positions.keys())
  
  for (let iter = 0; iter < 100; iter++) {
    let hasOverlap = false
    
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const posA = positions.get(ids[i])!
        const posB = positions.get(ids[j])!
        const sizeA = sizes.get(ids[i])!
        const sizeB = sizes.get(ids[j])!
        
        if (checkOverlap(posA, sizeA, posB, sizeB, margin)) {
          hasOverlap = true
          
          // 중심점 계산
          const cx1 = posA.x + sizeA.width / 2
          const cy1 = posA.y + sizeA.height / 2
          const cx2 = posB.x + sizeB.width / 2
          const cy2 = posB.y + sizeB.height / 2
          
          // 방향 벡터
          let dx = cx2 - cx1
          let dy = cy2 - cy1
          const dist = Math.sqrt(dx * dx + dy * dy)
          
          if (dist < 1) {
            // 같은 위치면 랜덤 방향
            const angle = Math.random() * Math.PI * 2
            dx = Math.cos(angle)
            dy = Math.sin(angle)
          } else {
            dx /= dist
            dy /= dist
          }
          
          // 밀어내기 (강하게)
          const push = 100
          posA.x -= dx * push
          posA.y -= dy * push
          posB.x += dx * push
          posB.y += dy * push
        }
      }
    }
    
    if (!hasOverlap) break
  }
}

/**
 * 방사형 레이아웃 계산
 * - ELK stress 알고리즘으로 균등 분포
 * - 겹침 후처리로 완전 분리
 */
async function calculateElkLayout(
  classes: UmlClass[],
  relationships: Array<{ id: string; source: string; target: string; type: string; label?: string }>
): Promise<Map<string, { x: number; y: number }>> {
  const positions = new Map<string, { x: number; y: number }>()
  
  if (classes.length === 0) return positions
  
  // 노드 크기 계산
  const NODE_WIDTH = 300
  const nodeSizes = new Map<string, NodeSize>()
  for (const cls of classes) {
    nodeSizes.set(cls.id, { width: NODE_WIDTH, height: calculateNodeHeight(cls) })
  }
  
  // 아주 넓은 간격 (직선 엣지가 노드 사이를 통과하지 않도록)
  const maxHeight = Math.max(...Array.from(nodeSizes.values()).map(s => s.height))
  const baseSpacing = Math.max(NODE_WIDTH, maxHeight) + 250
  
  // ELK 그래프 모델
  const elkGraph = {
    id: 'root',
    children: classes.map(cls => ({
      id: cls.id,
      width: nodeSizes.get(cls.id)!.width,
      height: nodeSizes.get(cls.id)!.height
    })),
    edges: relationships.map(rel => ({
      id: rel.id,
      sources: [rel.source],
      targets: [rel.target]
    }))
  }
  
  // ELK stress 알고리즘 - 아주 넓게 펼치기
  const layoutOptions: Record<string, string> = {
    'elk.algorithm': 'stress',
    'elk.stress.desiredEdgeLength': String(baseSpacing * 2),
    'elk.stress.epsilon': '0.000001',
    'elk.stress.iterationLimit': '1500',
    'elk.spacing.nodeNode': String(baseSpacing * 1.5),
    'elk.separateConnectedComponents': 'true',
    'elk.spacing.componentComponent': String(baseSpacing * 2.5)
  }
  
  try {
    const result = await elk.layout(elkGraph, { layoutOptions })
    
    if (result.children) {
      for (const child of result.children) {
        positions.set(child.id, { x: child.x || 0, y: child.y || 0 })
      }
    }
    
    // 겹침 후처리 (큰 마진으로 확실히 분리)
    resolveOverlaps(positions, nodeSizes, 180)
    
  } catch (error) {
    logger.error('ELK 레이아웃 오류, 그리드 배치:', error)
    
    // 그리드 배치 (fallback)
    const cols = Math.ceil(Math.sqrt(classes.length))
    classes.forEach((cls, i) => {
      const size = nodeSizes.get(cls.id)!
      positions.set(cls.id, {
        x: (i % cols) * (NODE_WIDTH + 300),
        y: Math.floor(i / cols) * (size.height + 200)
      })
    })
  }
  
  return positions
}

/**
 * 노드 높이 계산 (필드/메서드 수에 따라)
 */
function calculateNodeHeight(umlClass: UmlClass): number {
  const headerHeight = 56  // 헤더 (스테레오타입 + 클래스명)
  const sectionPadding = 8 // 섹션 패딩
  const memberHeight = 22  // 멤버 한 줄 높이
  const dividerHeight = 2  // 구분선
  const minSectionHeight = 24 // 빈 섹션 최소 높이
  
  // 필드 섹션 높이
  const fieldCount = Math.min(umlClass.fields.length, 8)
  const fieldsHeight = fieldCount > 0 
    ? (fieldCount * memberHeight) + sectionPadding + dividerHeight
    : minSectionHeight + dividerHeight
  
  // 메서드 섹션 높이
  const methodCount = Math.min(umlClass.methods.length, 8)
  const methodsHeight = methodCount > 0 
    ? (methodCount * memberHeight) + sectionPadding + dividerHeight
    : minSectionHeight + dividerHeight
  
  return headerHeight + fieldsHeight + methodsHeight + 20
}

// ============================================================================
// 유틸리티 함수 - 포맷팅 (UML 클래스 다이어그램 표준)
// 참고: https://brownbears.tistory.com/577
// ============================================================================

/**
 * 접근제어자 기호 변환
 * + public, - private, # protected, ~ default
 */
function formatVisibility(visibility: string): string {
  return VISIBILITY_MAP[visibility] || VISIBILITY_MAP['private']
}

/**
 * 필드 문자열 생성 (UML 표준: {접근제어자}{필드명}: {타입})
 */
function formatField(field: { name: string; type: string; visibility: string }): string {
  const vis = VISIBILITY_MAP[field.visibility] || '-'
  return field.type ? `${vis}${field.name}: ${field.type}` : `${vis}${field.name}`
}

/**
 * 파라미터 목록 문자열 생성
 */
function formatParams(params: Array<{ name: string; type: string }>): string {
  if (!params || params.length === 0) return ''
  return params
    .map(p => {
      if (p.type && p.name) return `${p.name}: ${p.type}`
      return p.name || p.type || ''
    })
    .filter(Boolean)
    .join(', ')
}

/**
 * 메서드 전체 문자열 생성 (툴팁용)
 */
function formatMethodFull(method: { 
  name: string
  returnType: string
  visibility: string
  parameters: Array<{ name: string; type: string }>
  isConstructor: boolean
}): string {
  const vis = VISIBILITY_MAP[method.visibility] || '+'
  const params = formatParams(method.parameters)
  
  if (method.isConstructor) {
    return `${vis}${method.name}(${params})`
  }
  return `${vis}${method.name}(${params}): ${method.returnType}`
}

/**
 * 메서드 문자열 생성 (UML 표준: {접근제어자}{메서드명}({파라미터}): {반환타입})
 */
function formatMethod(method: { 
  name: string
  returnType: string
  visibility: string
  parameters: Array<{ name: string; type: string }>
  isConstructor: boolean
}): string {
  return formatMethodFull(method)
}

// ============================================================================
// 다이어그램 생성
// ============================================================================

/**
 * 다이어그램 데이터 생성 및 VueFlow 노드/엣지 변환 (ELK 레이아웃 사용)
 */
async function buildDiagram(): Promise<void> {
  if (!props.selectedClasses.length || !props.graphNodes.length) {
    nodes.value = []
    edges.value = []
    diagramData.value = null
    return
  }
  
  // 1. 선택된 클래스의 노드 ID 찾기
  const selectedNodeIds = findNodeIdsByClassNames(
    props.graphNodes,
    props.selectedClasses
  )
  
  if (selectedNodeIds.length === 0) {
    nodes.value = []
    edges.value = []
    diagramData.value = null
    return
  }
  
  // 2. 클래스 다이어그램 데이터 생성
  const data = buildClassDiagramData(
    props.graphNodes,
    props.graphLinks,
    selectedNodeIds,
    props.depth
  )
  
  diagramData.value = data
  
  // 원본 GraphLink 맵 생성 (properties 접근용 - is_bidirectional 등)
  const originalLinkMap = new Map<string, GraphLink>()
  for (const rel of data.relationships) {
    const originalLink = props.graphLinks.find(l => l.id === rel.id)
    if (originalLink) {
      originalLinkMap.set(rel.id, originalLink)
    }
  }
  
  // 3. ELK 레이아웃 계산 (비동기)
  const positions = await calculateElkLayout(data.classes, data.relationships)
  
  // 4. VueFlow 노드 생성
  nodes.value = data.classes.map(cls => {
    const pos = positions.get(cls.id) || { x: 0, y: 0 }
    const isSelected = props.selectedClasses.some(
      s => s.className === cls.className && s.directory === cls.directory
    )
    
    return {
      id: cls.id,
      type: 'classNode',
      position: pos,
      data: {
        umlClass: cls,
        isExpanded: isSelected,
        isSelected,
        // UML 포맷팅 함수들
        formatVisibility,
        formatField,
        formatParams,
        formatMethod,
        formatMethodFull
      },
      style: {
        width: '300px',
        height: `${calculateNodeHeight(cls)}px`
      }
    }
  })
  
  // 5. VueFlow 엣지 생성 (모두 직각, 시작점 분산)
  
  // 같은 source+handle에서 나가는 엣지 카운트 (오프셋용)
  const handleEdges = new Map<string, number>()  // "nodeId:handle" -> count
  const handleIndex = new Map<string, number>()  // "nodeId:handle" -> current index
  
  // 1차: 각 엣지의 handle 방향 먼저 결정
  const edgeHandles = data.relationships.map(rel => {
    const sourcePos = positions.get(rel.source)
    const targetPos = positions.get(rel.target)
    let sourceHandle = 'right'
    let targetHandle = 'left'
    
    if (sourcePos && targetPos) {
      const dx = Math.abs(targetPos.x - sourcePos.x)
      const dy = Math.abs(targetPos.y - sourcePos.y)
      
      if (dx > dy) {
        sourceHandle = targetPos.x > sourcePos.x ? 'right' : 'left'
        targetHandle = targetPos.x > sourcePos.x ? 'left' : 'right'
      } else {
        sourceHandle = targetPos.y > sourcePos.y ? 'bottom' : 'top'
        targetHandle = targetPos.y > sourcePos.y ? 'top' : 'bottom'
      }
    }
    
    // 카운트 증가
    const sourceKey = `${rel.source}:${sourceHandle}`
    handleEdges.set(sourceKey, (handleEdges.get(sourceKey) || 0) + 1)
    
    return { rel, sourceHandle, targetHandle }
  })
  
  // 2차: 오프셋 적용하여 엣지 생성
  edges.value = edgeHandles.map(({ rel, sourceHandle, targetHandle }) => {
    const isInherit = isInheritance(rel.type)
    const isDep = rel.type === 'DEPENDENCY'
    const arrowStyle = ARROW_STYLES[rel.type] || ARROW_STYLES.ASSOCIATION
    const lineColor = isInherit ? '#444' : (isDep ? '#999' : '#666')
    
    // 라벨
    const typeLabels: Record<string, string> = {
      'EXTENDS': 'extends',
      'IMPLEMENTS': 'implements',
      'ASSOCIATION': 'association',
      'AGGREGATION': 'aggregation',
      'COMPOSITION': 'composition',
      'DEPENDENCY': 'dependency'
    }
    const label = rel.label || typeLabels[rel.type] || rel.type.toLowerCase()
    
    // 스타일
    const styleObj: Record<string, string> = {}
    for (const part of arrowStyle.style.split(';').filter(Boolean)) {
      const [key, value] = part.split(':').map(s => s.trim())
      if (key && value) {
        styleObj[key.replace(/-([a-z])/g, (_, l) => l.toUpperCase())] = value
      }
    }
    
    // 마커
    const markerEnd = { type: arrowStyle.markerEnd as any, color: lineColor }
    const originalLink = originalLinkMap.get(rel.id)
    const isBidirectional = originalLink?.properties?.is_bidirectional === true
    const markerStart = isBidirectional && !isInherit 
      ? { type: arrowStyle.markerEnd as any, color: lineColor } 
      : undefined
    
    // 오프셋 계산 (같은 handle에서 나가는 여러 엣지 분산)
    const sourceKey = `${rel.source}:${sourceHandle}`
    const totalFromHandle = handleEdges.get(sourceKey) || 1
    const currentIdx = handleIndex.get(sourceKey) || 0
    handleIndex.set(sourceKey, currentIdx + 1)
    
    // 오프셋: 중앙 기준으로 ±20px씩 분산
    const offset = totalFromHandle > 1 
      ? (currentIdx - (totalFromHandle - 1) / 2) * 25
      : 0
    
    return {
      id: rel.id,
      source: rel.source,
      target: rel.target,
      sourceHandle,
      targetHandle,
      type: 'smoothstep',
      pathOptions: { offset },
      animated: false,
      label,
      labelStyle: { fontSize: 10, fill: '#555', fontWeight: 500 },
      labelBgStyle: { fill: '#fff', fillOpacity: 0.9 },
      style: styleObj,
      markerEnd,
      markerStart,
      data: { relationship: rel }
    } as unknown as Edge
  })
  
  // 6. 뷰 맞추기
  nextTick(() => {
    setTimeout(() => fitView({ padding: 0.2 }), 100)
  })
}

// ============================================================================
// 이벤트 핸들러
// ============================================================================

/**
 * 노드 클릭 핸들러
 */
function onNodeClick(event: NodeMouseEvent): void {
  const nodeId = event.node.id
  selectedNodeId.value = nodeId
  emit('class-click', nodeId)
}

/**
 * 노드 더블클릭 핸들러 (확장)
 */
function onNodeDoubleClick(event: NodeMouseEvent): void {
  const umlClass = (event.node.data as any)?.umlClass as UmlClass
  if (umlClass) {
    emit('class-expand', umlClass.className, umlClass.directory)
  }
}

// ============================================================================
// 워처 (async 호출 처리 + race 방지)
// ============================================================================

let layoutRunId = 0

async function rebuildSafely(): Promise<void> {
  const myId = ++layoutRunId
  try {
    await buildDiagram()
  } catch (error) {
    logger.error('다이어그램 빌드 오류:', error)
  }
  // 최신 호출만 적용되도록 (race 방지)
  if (myId !== layoutRunId) {
    return
  }
}

// selectedClasses 변경 시 다이어그램 재생성
watch(
  () => props.selectedClasses,
  () => {
    rebuildSafely()
  },
  { deep: true, immediate: true }
)

// depth 변경 시 다이어그램 재생성
watch(
  () => props.depth,
  () => {
    if (props.selectedClasses.length > 0) {
      rebuildSafely()
    }
  }
)

// graphNodes 변경 시 다이어그램 재생성
watch(
  () => props.graphNodes.length,
  () => {
    if (props.selectedClasses.length > 0) {
      rebuildSafely()
    }
  }
)

// ============================================================================
// 라이프사이클
// ============================================================================

// watch가 immediate: true로 초기 렌더링 처리
</script>

<template>
  <div class="vueflow-class-diagram">
    <!-- 빈 상태 -->
    <div v-if="isEmpty" class="empty-state">
      <div class="empty-icon">📊</div>
      <h3>클래스를 선택하세요</h3>
      <p>검색창에서 클래스를 검색하고 선택하면<br>UML 다이어그램이 표시됩니다</p>
    </div>
    
    <!-- VueFlow 다이어그램 -->
    <VueFlow 
      v-else
      :nodes="nodes"
      :edges="edges"
      :default-viewport="{ zoom: 1 }"
      :min-zoom="0.1"
      :max-zoom="2"
      fit-view-on-init
      @node-click="onNodeClick"
      @node-double-click="onNodeDoubleClick"
    >
      <!-- 배경 -->
      <Background pattern-color="#e2e8f0" :gap="20" />
      
      <!-- 컨트롤 -->
      <Controls position="bottom-right" />
      
      <!-- 미니맵 -->
      <MiniMap 
        position="bottom-left"
        :node-stroke-width="3"
        pannable
        zoomable
      />
      
      <!-- 커스텀 클래스 노드 (UML 클래스 다이어그램 표준) -->
      <!-- 
        UML 클래스 다이어그램 표기법:
        - 접근제어자: + (public), - (private), # (protected), ~ (default)
        - 속성: {접근제어자} {필드명}: {타입}
        - 메서드: {접근제어자} {메서드명}({파라미터타입}): {반환타입}
        - 스테레오타입: «interface», «abstract», «enumeration»
        - 밑줄: static, {readonly}: final
        참고: https://brownbears.tistory.com/577
      -->
      <template #node-classNode="{ data }">
        <div 
          class="class-node"
          :class="{
            'is-interface': data.umlClass.classType === 'interface',
            'is-enum': data.umlClass.classType === 'enum',
            'is-abstract': data.umlClass.isAbstract,
            'is-selected': data.isSelected
          }"
        >
          <Handle id="top" type="source" :position="Position.Top" class="connection-handle" />
          <Handle id="bottom" type="target" :position="Position.Bottom" class="connection-handle" />
          <Handle id="right" type="source" :position="Position.Right" class="connection-handle" />
          <Handle id="left" type="target" :position="Position.Left" class="connection-handle" />
          
          <!-- 헤더 (클래스명 + 스테레오타입) -->
          <div class="class-header">
            <div class="stereotype" v-if="data.umlClass.classType !== 'class' || data.umlClass.isAbstract">
              {{ data.umlClass.classType === 'interface' ? '«interface»' : 
                 data.umlClass.classType === 'enum' ? '«enumeration»' : 
                 data.umlClass.isAbstract ? '«abstract»' : '' }}
            </div>
            <div class="class-name" :class="{ 'italic': data.umlClass.isAbstract }">
              {{ data.umlClass.className }}
            </div>
          </div>
          
          <!-- 속성(필드) 섹션 -->
          <div class="class-section fields">
            <div class="section-divider"></div>
            <template v-if="data.umlClass.fields.length > 0">
              <div 
                v-for="(field, idx) in data.umlClass.fields.slice(0, 8)" 
                :key="'f-' + idx"
                class="member field-member"
                :title="`${field.visibility} ${field.type} ${field.name}`"
              >
                <span class="visibility">{{ data.formatVisibility(field.visibility) }}</span>
                <span class="member-name">{{ field.name }}</span>
                <span class="member-type" v-if="field.type">: {{ field.type }}</span>
              </div>
              <div v-if="data.umlClass.fields.length > 8" class="more">
                ... +{{ data.umlClass.fields.length - 8 }} more
              </div>
            </template>
            <div v-else class="empty-section">─</div>
          </div>
          
          <!-- 메서드 섹션 -->
          <div class="class-section methods">
            <div class="section-divider"></div>
            <template v-if="data.umlClass.methods.length > 0">
              <div 
                v-for="(method, idx) in data.umlClass.methods.slice(0, 8)" 
                :key="'m-' + idx"
                class="member method-member"
                :class="{ 'constructor': method.isConstructor }"
                :title="data.formatMethodFull(method)"
              >
                <span class="visibility">{{ data.formatVisibility(method.visibility) }}</span>
                <span class="member-name">{{ method.name }}</span>
                <span class="params">({{ data.formatParams(method.parameters) }})</span>
                <span class="return-type" v-if="!method.isConstructor">: {{ method.returnType }}</span>
              </div>
              <div v-if="data.umlClass.methods.length > 8" class="more">
                ... +{{ data.umlClass.methods.length - 8 }} more
              </div>
            </template>
            <div v-else class="empty-section">─</div>
          </div>
          
          <!-- 확장 힌트 -->
          <div class="expand-hint">더블클릭하여 확장</div>
        </div>
      </template>
    </VueFlow>
    
    <!-- 범례 (간소화) -->
    <div class="legend" v-if="!isEmpty && diagramData">
      <div class="legend-items">
        <div class="legend-item">
          <span class="line solid"></span>
          <span>상속/구현</span>
        </div>
        <div class="legend-item">
          <span class="line dashed"></span>
          <span>의존</span>
        </div>
      </div>
      <div class="legend-stats">
        {{ diagramData.classes.length }}개 클래스 · {{ diagramData.relationships.length }}개 관계
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
// ============================================================================
// 컨테이너
// ============================================================================

.vueflow-class-diagram {
  width: 100%;
  height: 100%;
  position: relative;
  background: #f8fafc;
}

// ============================================================================
// 빈 상태
// ============================================================================

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  color: #64748b;
  
  .empty-icon {
    font-size: 56px;
    margin-bottom: 16px;
    opacity: 0.5;
  }
  
  h3 {
    font-size: 16px;
    color: #475569;
    margin-bottom: 8px;
    font-weight: 500;
  }
  
  p {
    font-size: 13px;
    line-height: 1.6;
  }
}

// ============================================================================
// 클래스 노드 (머메이드 스타일 UML 클래스 다이어그램)
// ============================================================================

// 머메이드 스타일 클래스 노드
.connection-handle {
  width: 8px;
  height: 8px;
  border: 2px solid #1a192b;
  background: white;
  border-radius: 50%;
}

.class-node {
  background: #ffffde;
  border: 2px solid #333333;
  border-radius: 0;
  min-width: 200px;
  max-width: 340px;
  font-size: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: box-shadow 0.2s, transform 0.15s;
  position: relative;
  
  &:hover {
    box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.15);
    transform: translate(-1px, -1px);
    
    .expand-hint {
      opacity: 1;
    }
  }
  
  // 인터페이스: 주황색 배경 + 사선 패턴 (머메이드 스타일)
  &.is-interface {
    background: 
      repeating-linear-gradient(
        135deg,
        transparent,
        transparent 4px,
        rgba(255, 140, 0, 0.15) 4px,
        rgba(255, 140, 0, 0.15) 8px
      ),
      #fff4e6;
    border-color: #ff8c00;
    
    .class-header {
      background: 
        repeating-linear-gradient(
          135deg,
          transparent,
          transparent 4px,
          rgba(255, 140, 0, 0.2) 4px,
          rgba(255, 140, 0, 0.2) 8px
        ),
        #ffe4c4;
      border-color: #ff8c00;
    }
    
    .class-section {
      background: 
        repeating-linear-gradient(
          135deg,
          transparent,
          transparent 4px,
          rgba(255, 140, 0, 0.1) 4px,
          rgba(255, 140, 0, 0.1) 8px
        ),
        #fff8f0;
    }
  }
  
  // Enum: 노란색 점선 테두리 (머메이드 스타일)
  &.is-enum {
    background: #fffacd;
    border-style: dashed;
    border-color: #b8860b;
    
    .class-header {
      background: #fff8dc;
      border-style: dashed;
      border-color: #b8860b;
    }
    
    .class-section {
      background: #fffacd;
    }
  }
  
  // 추상 클래스: 파란색 배경 + 사선 패턴 (머메이드 스타일)
  &.is-abstract {
    background: 
      repeating-linear-gradient(
        135deg,
        transparent,
        transparent 4px,
        rgba(100, 149, 237, 0.12) 4px,
        rgba(100, 149, 237, 0.12) 8px
      ),
      #e6f0ff;
    border-color: #4682b4;
    
    .class-header {
      background: 
        repeating-linear-gradient(
          135deg,
          transparent,
          transparent 4px,
          rgba(100, 149, 237, 0.18) 4px,
          rgba(100, 149, 237, 0.18) 8px
        ),
        #cce0ff;
      border-color: #4682b4;
    }
    
    .class-section {
      background: 
        repeating-linear-gradient(
          135deg,
          transparent,
          transparent 4px,
          rgba(100, 149, 237, 0.08) 4px,
          rgba(100, 149, 237, 0.08) 8px
        ),
        #f0f6ff;
    }
    
    .class-name {
      font-style: italic;
    }
  }
  
  // 선택된 클래스
  &.is-selected {
    border-width: 3px;
    box-shadow: 0 0 0 4px rgba(255, 165, 0, 0.5);
  }
}

// 머메이드 스타일 헤더 영역
.class-header {
  background: #ffecb3;
  color: #333333;
  padding: 10px 14px;
  text-align: center;
  border-bottom: 2px solid #333333;
  
  .stereotype {
    font-size: 11px;
    color: #555555;
    margin-bottom: 3px;
    font-weight: 500;
  }
  
  .class-name {
    font-weight: 700;
    font-size: 14px;
    word-break: break-word;
    color: #000000;
    letter-spacing: 0.3px;
    
    &.italic {
      font-style: italic;
    }
  }
}

// 머메이드 스타일 섹션
.class-section {
  padding: 6px 10px;
  min-height: 24px;
  background: #ffffde;
  
  &.methods {
    border-top: 2px solid #333333;
  }
  
  .section-divider {
    display: none;
  }
  
  .empty-section {
    text-align: center;
    color: #999999;
    font-size: 11px;
    padding: 4px 0;
  }
}

// 머메이드 스타일 멤버
.member {
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 11px;
  color: #333333;
  padding: 3px 6px;
  line-height: 1.6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border-radius: 2px;
  
  &:hover {
    background: rgba(0, 0, 0, 0.06);
  }
  
  // 접근제어자 기호
  .visibility {
    display: inline-block;
    width: 14px;
    font-weight: 700;
  }
  
  // 멤버 이름
  .member-name {
    font-weight: 600;
    color: #1a1a1a;
  }
  
  // 타입
  .member-type {
    color: #0066cc;
    font-weight: 500;
  }
  
  // 파라미터
  .params {
    color: #555555;
  }
  
  // 반환 타입
  .return-type {
    color: #0066cc;
    font-weight: 500;
  }
  
  // 생성자
  &.constructor {
    .member-name {
      color: #8b008b;
      font-weight: 700;
    }
  }
}

// 필드 멤버 - public은 초록색, private는 빨간색
.field-member .visibility {
  color: #cc0000;
}

// 메서드 멤버 - public은 초록색
.method-member .visibility {
  color: #008800;
}

// 더보기
.more {
  font-size: 10px;
  color: #6b7280;
  font-style: italic;
  padding: 4px 4px 2px;
  text-align: center;
}

// 확장 힌트
.expand-hint {
  position: absolute;
  bottom: 2px;
  right: 6px;
  font-size: 9px;
  color: #9ca3af;
  background: rgba(255, 255, 255, 0.9);
  padding: 2px 6px;
  border-radius: 3px;
  opacity: 0;
  transition: opacity 0.2s;
}

// ============================================================================
// 범례 (간소화)
// ============================================================================

.legend {
  position: absolute;
  top: 10px;
  right: 10px;
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 11px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
  z-index: 10;
  
  .legend-items {
    display: flex;
    gap: 12px;
    margin-bottom: 4px;
  }
  
  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #555;
    
    .line {
      display: inline-block;
      width: 20px;
      height: 2px;
      background: #555;
      
      &.dashed {
        background: repeating-linear-gradient(
          to right,
          #888 0px,
          #888 4px,
          transparent 4px,
          transparent 7px
        );
      }
    }
  }
  
  .legend-stats {
    color: #888;
    font-size: 10px;
  }
}

// ============================================================================
// VueFlow 커스터마이징
// ============================================================================

:deep(.vue-flow__minimap) {
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

:deep(.vue-flow__controls) {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  
  button {
    background: white;
    border: none;
    
    &:hover {
      background: #f1f5f9;
    }
  }
}
</style>

