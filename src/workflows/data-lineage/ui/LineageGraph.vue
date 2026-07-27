<script setup lang="ts">
/**
 * LineageGraph.vue
 * Vue Flow 기반 데이터 리니지 시각화 컴포넌트
 * 
 * 첨부 이미지 참고 스타일:
 * - 소스 테이블 (파란색) → ETL 프로세스 (보라색) → 타겟 테이블 (초록색)
 * - 컬럼 수 표시, 검색, 확장 기능
 */
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { VueFlow, useVueFlow, Handle, MarkerType, Position } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import type { Node, Edge } from '@vue-flow/core'
import { useManagedTimeouts } from '@/shared/composables/useManagedTimeouts'
import type { LineageEdge, LineageNode } from '../model/graph.ts'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'

interface Props {
  nodes: LineageNode[]
  edges: LineageEdge[]
  isLoading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  nodes: () => [],
  edges: () => [],
  isLoading: false
})

const emit = defineEmits<{
  'node-select': [node: LineageNode | null]
}>()

// ============================================================================
// Vue Flow 설정
// ============================================================================

const { fitView, setViewport } = useVueFlow()

const FIT_ALL_NODE_LIMIT = 30
const LARGE_GRAPH_ZOOM = 0.72
const ESTIMATED_NODE_HALF_WIDTH = 100

// ============================================================================
// 상태
// ============================================================================

const vueFlowNodes = ref<Node[]>([])
const vueFlowEdges = ref<Edge[]>([])
const selectedNodeId = ref<string | null>(null)
const graphContainer = ref<HTMLElement | null>(null)
const timers = useManagedTimeouts()

// ============================================================================
// Computed - 실제 데이터 사용
// ============================================================================

const effectiveNodes = computed(() => props.nodes ?? [])
const effectiveEdges = computed(() => props.edges ?? [])
const isLargeGraph = computed(() => effectiveNodes.value.length > FIT_ALL_NODE_LIMIT)

// ============================================================================
// 레이아웃 계산
// ============================================================================

function calculateLayout(): void {
  const nodes = effectiveNodes.value
  const edges = effectiveEdges.value
  
  if (nodes.length === 0) {
    vueFlowNodes.value = []
    vueFlowEdges.value = []
    return
  }
  
  // 노드를 타입별로 분류
  const sources = nodes.filter(n => n.type === 'SOURCE')
  const etls = nodes.filter(n => n.type === 'ETL')
  const targets = nodes.filter(n => n.type === 'TARGET')
  
  // 레이아웃 설정
  const containerWidth = graphContainer.value?.clientWidth ?? 1440
  const columnGap = isLargeGraph.value
    ? containerWidth / (3 * LARGE_GRAPH_ZOOM)
    : 350
  const rowGap = 120
  const startX = 80
  const startY = 80
  
  // 각 컬럼의 시작 Y 위치 계산 (중앙 정렬)
  const maxCount = Math.max(sources.length, etls.length, targets.length)
  const getStartY = (count: number) => isLargeGraph.value
    ? startY
    : startY + ((maxCount - count) * rowGap) / 2
  
  const flowNodes: Node[] = []
  
  // 소스 노드들 (왼쪽)
  sources.forEach((node, i) => {
    flowNodes.push({
      id: node.id,
      type: 'lineageNode',
      position: { x: startX, y: getStartY(sources.length) + i * rowGap },
      data: {
        ...node,
        nodeType: 'SOURCE',
        isSelected: selectedNodeId.value === node.id
      }
    })
  })
  
  // ETL 노드들 (중앙)
  etls.forEach((node, i) => {
    flowNodes.push({
      id: node.id,
      type: 'lineageNode',
      position: { x: startX + columnGap, y: getStartY(etls.length) + i * rowGap },
      data: {
        ...node,
        nodeType: 'ETL',
        isSelected: selectedNodeId.value === node.id
      }
    })
  })
  
  // 타겟 노드들 (오른쪽)
  targets.forEach((node, i) => {
    flowNodes.push({
      id: node.id,
      type: 'lineageNode',
      position: { x: startX + columnGap * 2, y: getStartY(targets.length) + i * rowGap },
      data: {
        ...node,
        nodeType: 'TARGET',
        isSelected: selectedNodeId.value === node.id
      }
    })
  })
  
  // 엣지 생성
  const flowEdges: Edge[] = edges.map(edge => {
    const isDirectFlow = edge.type === 'TRANSFORMS_TO'
    
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'smoothstep',
      animated: !isDirectFlow,
      style: {
        stroke: isDirectFlow ? '#f59e0b' : '#64748b',
        strokeWidth: isDirectFlow ? 2 : 1.5
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: isDirectFlow ? '#f59e0b' : '#64748b'
      }
    }
  })
  
  vueFlowNodes.value = flowNodes
  vueFlowEdges.value = flowEdges
  
  nextTick(() => {
    timers.schedule('viewport', () => {
      if (isLargeGraph.value) {
        const firstColumnCenter = containerWidth / 6
        setViewport({
          x: firstColumnCenter - LARGE_GRAPH_ZOOM * (startX + ESTIMATED_NODE_HALF_WIDTH),
          y: 24,
          zoom: LARGE_GRAPH_ZOOM
        })
      } else if (typeof fitView === 'function') {
        fitView({ padding: 0.15 })
      }
    }, 100)
  })
}

// ============================================================================
// 이벤트 핸들러
// ============================================================================

function onNodeClick(event: { node: Node }): void {
  const nodeId = event.node.id
  selectedNodeId.value = selectedNodeId.value === nodeId ? null : nodeId
  
  // 선택 상태 업데이트
  vueFlowNodes.value = vueFlowNodes.value.map(n => ({
    ...n,
    data: {
      ...n.data,
      isSelected: n.id === selectedNodeId.value
    }
  }))
  
  const originalNode = effectiveNodes.value.find(n => n.id === nodeId)
  emit('node-select', selectedNodeId.value && originalNode ? originalNode : null)
}

function onPaneClick(): void {
  selectedNodeId.value = null
  vueFlowNodes.value = vueFlowNodes.value.map(n => ({
    ...n,
    data: { ...n.data, isSelected: false }
  }))
  emit('node-select', null)
}

// ============================================================================
// 워처
// ============================================================================

watch([() => props.nodes, () => props.edges], () => {
  calculateLayout()
}, { deep: true, immediate: true })

onMounted(() => {
  calculateLayout()
})

// ============================================================================
// 노드 스타일 헬퍼
// ============================================================================

function getNodeStyle(type: string): { bg: string; border: string; icon: string; gradient: string } {
  switch (type) {
    case 'SOURCE':
      return {
        bg: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
        border: '#1d4ed8',
        icon: '📥',
        gradient: 'rgba(59, 130, 246, 0.1)'
      }
    case 'ETL':
      return {
        bg: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
        border: '#6d28d9',
        icon: '⚙️',
        gradient: 'rgba(139, 92, 246, 0.1)'
      }
    case 'TARGET':
      return {
        bg: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        border: '#047857',
        icon: '📤',
        gradient: 'rgba(16, 185, 129, 0.1)'
      }
    default:
      return {
        bg: 'linear-gradient(135deg, #64748b 0%, #475569 100%)',
        border: '#334155',
        icon: '📦',
        gradient: 'rgba(100, 116, 139, 0.1)'
      }
  }
}
</script>

<template>
  <div ref="graphContainer" class="lineage-graph-container">
    <!-- 로딩 오버레이 -->
    <div v-if="isLoading" class="loading-overlay">
      <div class="loading-spinner"></div>
      <span>데이터 로딩 중...</span>
    </div>
    
    <!-- Vue Flow 그래프 -->
    <VueFlow
      v-model:nodes="vueFlowNodes"
      v-model:edges="vueFlowEdges"
      :default-viewport="{ zoom: 1 }"
      :min-zoom="0.2"
      :max-zoom="2"
      fit-view-on-init
      @node-click="onNodeClick"
      @pane-click="onPaneClick"
    >
      <!-- 배경 -->
      <Background 
        :pattern-color="'#373a40'" 
        :gap="24" 
        :size="1"
      />
      
      <!-- 컨트롤 -->
      <Controls position="bottom-right" />
      
      <!-- 미니맵 -->
      <MiniMap 
        position="bottom-left"
        :node-stroke-width="3"
        pannable
        zoomable
        :node-color="(node: Node) => {
          const type = node.data?.nodeType
          if (type === 'SOURCE') return '#3b82f6'
          if (type === 'ETL') return '#8b5cf6'
          if (type === 'TARGET') return '#10b981'
          return '#64748b'
        }"
      />
      
      <!-- 커스텀 리니지 노드 -->
      <template #node-lineageNode="{ data }">
        <div 
          class="lineage-node"
          :class="{ 
            'source': data.nodeType === 'SOURCE',
            'etl': data.nodeType === 'ETL',
            'target': data.nodeType === 'TARGET',
            'selected': data.isSelected
          }"
        >
          <!-- 연결 핸들 -->
          <Handle id="left" type="target" :position="Position.Left" class="handle" />
          <Handle id="right" type="source" :position="Position.Right" class="handle" />
          
          <!-- 노드 콘텐츠 -->
          <div class="node-header">
            <span class="node-icon">{{ getNodeStyle(data.nodeType).icon }}</span>
            <div class="node-info">
              <span class="node-schema" v-if="data.properties?.schema">
                {{ data.properties.schema }}
              </span>
              <span class="node-name">{{ data.name }}</span>
            </div>
            <span class="node-badge" v-if="data.nodeType !== 'ETL'">
              {{ data.nodeType === 'SOURCE' ? '소스' : '타겟' }}
            </span>
          </div>
          
          <!-- 메타 정보 -->
          <div class="node-meta">
            <div class="meta-item" v-if="data.properties?.columns">
              <span class="meta-icon">📊</span>
              <span>{{ data.properties.columns }} Columns</span>
            </div>
            <div class="meta-item" v-if="data.properties?.operation">
              <span class="meta-icon">⚡</span>
              <span>{{ data.properties.operation }}</span>
            </div>
            <div class="meta-item" v-if="data.properties?.model">
              <span class="meta-icon">📈</span>
              <span>{{ data.properties.model }}</span>
            </div>
          </div>
          
          <!-- 액션 버튼 -->
          <div class="node-actions">
            <button class="action-btn" title="상세 보기">−</button>
          </div>
        </div>
      </template>
    </VueFlow>
    
    <!-- 레전드 -->
    <div class="legend">
      <div class="legend-title">Data Lineage</div>
      <div class="legend-items">
        <div class="legend-item">
          <span class="legend-dot source"></span>
          <span>소스 테이블</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot etl"></span>
          <span>ETL 프로세스</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot target"></span>
          <span>타겟 테이블</span>
        </div>
      </div>
      <div class="legend-flow">
        <span class="flow-line animated"></span>
        <span>데이터 흐름</span>
      </div>
    </div>
    
    <!-- 컬럼 헤더 -->
    <div class="column-headers" :class="{ 'large-graph': isLargeGraph }">
      <div class="column-header source">
        <span class="header-icon">📥</span>
        <span>Source Tables</span>
      </div>
      <div class="column-header etl">
        <span class="header-icon">⚙️</span>
        <span>ETL Process</span>
      </div>
      <div class="column-header target">
        <span class="header-icon">📤</span>
        <span>Target Tables</span>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.lineage-graph-container {
  width: 100%;
  height: 100%;
  position: relative;
  background: 
    radial-gradient(circle at 10% 20%, rgba(59, 130, 246, 0.08) 0%, transparent 40%),
    radial-gradient(circle at 50% 50%, rgba(139, 92, 246, 0.06) 0%, transparent 40%),
    radial-gradient(circle at 90% 80%, rgba(16, 185, 129, 0.08) 0%, transparent 40%),
    var(--color-bg);
}

// ============================================================================
// 리니지 노드 스타일
// ============================================================================

.lineage-node {
  min-width: 200px;
  max-width: 280px;
  background: var(--color-bg-secondary);
  border-radius: 12px;
  border: 2px solid var(--color-border);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    
    .node-actions {
      opacity: 1;
    }
  }
  
  &.selected {
    border-width: 3px;
    box-shadow: 0 0 0 4px rgba(251, 191, 36, 0.4);
  }
  
  &.source {
    border-color: #3b82f6;
    
    .node-header {
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(59, 130, 246, 0.1) 100%);
      border-bottom-color: rgba(59, 130, 246, 0.3);
    }
    
    .node-icon {
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
    }
    
    .node-badge {
      background: #3b82f6;
    }
  }
  
  &.etl {
    border-color: #8b5cf6;
    
    .node-header {
      background: linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(139, 92, 246, 0.1) 100%);
      border-bottom-color: rgba(139, 92, 246, 0.3);
    }
    
    .node-icon {
      background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
    }
    
    .node-badge {
      background: #8b5cf6;
    }
  }
  
  &.target {
    border-color: #10b981;
    
    .node-header {
      background: linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(16, 185, 129, 0.1) 100%);
      border-bottom-color: rgba(16, 185, 129, 0.3);
    }
    
    .node-icon {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    }
    
    .node-badge {
      background: #10b981;
    }
  }
}

.node-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--color-border);
}

.node-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  border-radius: 8px;
  flex-shrink: 0;
}

.node-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.node-schema {
  font-size: 9px;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: 0.3px;
}

.node-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-bright);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.node-badge {
  font-size: 8px;
  font-weight: 600;
  color: white;
  padding: 2px 6px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.node-meta {
  padding: 8px 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--color-text-light);
  background: var(--color-bg-tertiary);
  padding: 3px 8px;
  border-radius: 6px;
  
  .meta-icon {
    font-size: 10px;
  }
}

.node-actions {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s;
  
  .action-btn {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    font-size: 14px;
    color: var(--color-text-light);
    cursor: pointer;
    
    &:hover {
      background: var(--color-bg-tertiary);
      color: var(--color-text-bright);
    }
  }
}

// 핸들 스타일
.handle {
  width: 10px;
  height: 10px;
  background: var(--color-bg-secondary);
  border: 2px solid var(--color-text-muted);
  border-radius: 50%;
  
  &:hover {
    border-color: #3b82f6;
    transform: scale(1.2);
  }
}

// ============================================================================
// 레전드
// ============================================================================

.legend {
  position: absolute;
  top: 16px;
  right: 16px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 14px 18px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 10;
  min-width: 160px;
}

.legend-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-bright);
  margin-bottom: 10px;
  letter-spacing: 0.5px;
}

.legend-items {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 10px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--color-text-light);
  
  .legend-dot {
    width: 12px;
    height: 12px;
    border-radius: 4px;
    
    &.source { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); }
    &.etl { background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); }
    &.target { background: linear-gradient(135deg, #10b981 0%, #059669 100%); }
  }
}

.legend-flow {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--color-text-light);
  padding-top: 8px;
  border-top: 1px solid var(--color-border);
  
  .flow-line {
    width: 24px;
    height: 2px;
    background: var(--color-text-muted);
    position: relative;
    
    &.animated {
      background: linear-gradient(90deg, var(--color-text-muted) 0%, var(--color-text-muted) 50%, transparent 50%, transparent 100%);
      background-size: 8px 100%;
      animation: flow 0.5s linear infinite;
    }
    
    &::after {
      content: '→';
      position: absolute;
      right: -8px;
      top: -7px;
      font-size: 12px;
    }
  }
}

@keyframes flow {
  0% { background-position: 0 0; }
  100% { background-position: 8px 0; }
}

// ============================================================================
// 컬럼 헤더
// ============================================================================

.column-headers {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 200px;
  z-index: 5;

  &.large-graph {
    left: 0;
    right: 0;
    transform: none;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0;
    pointer-events: none;

    .column-header {
      justify-self: center;
    }
  }
}

.column-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-bright);
  
  .header-icon {
    font-size: 14px;
  }
  
  &.source { border-left: 3px solid #3b82f6; }
  &.etl { border-left: 3px solid #8b5cf6; }
  &.target { border-left: 3px solid #10b981; }
}

// ============================================================================
// 로딩 오버레이
// ============================================================================

.loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgba(26, 27, 30, 0.9);
  z-index: 100;
  
  .loading-spinner {
    width: 36px;
    height: 36px;
    border: 3px solid var(--color-border);
    border-top-color: var(--color-accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  
  span {
    font-size: 13px;
    color: var(--color-text-light);
    font-weight: 500;
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

// ============================================================================
// VueFlow 커스터마이징
// ============================================================================

:deep(.vue-flow__minimap) {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

:deep(.vue-flow__controls) {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  
  button {
    background: var(--color-bg-secondary);
    border: none;
    border-bottom: 1px solid var(--color-border);
    color: var(--color-text-light);
    
    &:last-child {
      border-bottom: none;
    }
    
    &:hover {
      background: var(--color-bg-tertiary);
      color: var(--color-text-bright);
    }
    
    svg {
      fill: currentColor;
    }
  }
}

:deep(.vue-flow__edge-path) {
  stroke-width: 2;
}

:deep(.vue-flow__edge.animated path) {
  stroke-dasharray: 5;
  animation: dashdraw 0.5s linear infinite;
}

:deep(.vue-flow__background) {
  background: var(--color-bg) !important;
}

@keyframes dashdraw {
  from { stroke-dashoffset: 10; }
  to { stroke-dashoffset: 0; }
}
</style>
