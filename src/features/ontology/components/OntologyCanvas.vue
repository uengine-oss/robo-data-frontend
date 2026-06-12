<script setup lang="ts">
/**
 * OntologyCanvas.vue
 * VueFlow 기반 온톨로지 스키마 시각화 캔버스
 */
import { ref, computed, onMounted, watch, markRaw, type Ref } from 'vue'
import { VueFlow, type Node, type Edge, type VueFlowStore } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import type { OntologySchema, OntologyNode } from '@/types'
import { useOntologyStore } from '@/features/ontology/ontology'
import { storeToRefs } from 'pinia'

// 커스텀 노드 컴포넌트
import AssetNode from './nodes/AssetNode.vue'
import SystemNode from './nodes/SystemNode.vue'
import ComponentNode from './nodes/ComponentNode.vue'
import EventNode from './nodes/EventNode.vue'
import InstanceNode from './nodes/InstanceNode.vue'

import { IconZoomIn, IconZoomOut, IconMaximize, IconRefresh } from '@/shared/icons'

const ontologyStore = useOntologyStore()
const { canvasInstances } = storeToRefs(ontologyStore)

const props = defineProps<{
  schema: OntologySchema | null
}>()

const emit = defineEmits<{
  (e: 'node-select', nodeId: string): void
}>()

// VueFlow 인스턴스 ref
const vueFlowRef = ref<VueFlowStore | null>(null)

// VueFlow 제어 함수
function zoomIn() {
  vueFlowRef.value?.zoomIn()
}

function zoomOut() {
  vueFlowRef.value?.zoomOut()
}

function fitView(options?: { padding?: number }) {
  vueFlowRef.value?.fitView(options)
}

// 커스텀 노드 타입 등록
const nodeTypes = {
  asset: markRaw(AssetNode),
  system: markRaw(SystemNode),
  component: markRaw(ComponentNode),
  event: markRaw(EventNode),
  instance: markRaw(InstanceNode),
}

// 선택된 노드 ID
const selectedNodeId = ref<string | null>(null)

// VueFlow 노드/엣지 변환
const nodes = computed<Node[]>(() => {
  if (!props.schema?.nodes) return []
  
  // 스키마 노드
  const schemaNodes = props.schema.nodes.map((node, index) => {
    // 그리드 레이아웃 계산
    const cols = 4
    const col = index % cols
    const row = Math.floor(index / cols)
    
    return {
      id: node.id,
      type: getNodeType(node.label),
      position: node.position || { x: col * 280 + 50, y: row * 200 + 50 },
      data: {
        ...node,
        isSelected: selectedNodeId.value === node.id,
        hasInstances: (node.instanceCount || 0) > 0,
      },
    }
  })
  
  // 인스턴스 노드 (부모 노드 아래에 배치)
  const instanceNodes: Node[] = []
  const parentPositions = new Map<string, { x: number; y: number }>()
  
  // 부모 노드 위치 저장
  schemaNodes.forEach(node => {
    parentPositions.set(node.id, node.position)
  })
  
  // 인스턴스를 부모 노드별로 그룹화
  const instancesByParent = new Map<string, typeof canvasInstances.value>()
  canvasInstances.value.forEach(inst => {
    const list = instancesByParent.get(inst.parentNodeId) || []
    list.push(inst)
    instancesByParent.set(inst.parentNodeId, list)
  })
  
  // 각 부모 노드 아래에 인스턴스 배치
  instancesByParent.forEach((instances, parentId) => {
    const parentPos = parentPositions.get(parentId)
    if (!parentPos) return
    
    const cols = 5
    instances.slice(0, 20).forEach((inst, idx) => {  // 최대 20개만 표시
      const col = idx % cols
      const row = Math.floor(idx / cols)
      
      instanceNodes.push({
        id: `inst-${inst.id}`,
        type: 'instance',
        position: {
          x: parentPos.x - 80 + col * 60,
          y: parentPos.y + 180 + row * 50
        },
        data: {
          id: inst.id,
          name: inst.name,
          parentNodeId: inst.parentNodeId,
          parentNodeName: inst.parentNodeName,
        },
      })
    })
  })
  
  return [...schemaNodes, ...instanceNodes]
})

const edges = computed<Edge[]>(() => {
  const result: Edge[] = []
  
  // 스키마 관계 엣지
  if (props.schema?.relationships) {
    props.schema.relationships.forEach((rel, index) => {
      result.push({
        id: `edge-${index}`,
        source: rel.source,
        target: rel.target,
        label: rel.type,
        type: 'smoothstep',
        animated: true,
        style: {
          stroke: getEdgeColor(rel.type),
          strokeWidth: 2,
        },
        labelStyle: {
          fill: 'var(--color-text-light)',
          fontSize: 11,
        },
        labelBgStyle: {
          fill: 'var(--color-bg-secondary)',
        },
      })
    })
  }
  
  // 인스턴스 엣지 (부모 노드 → 인스턴스)
  canvasInstances.value.forEach((inst, index) => {
    result.push({
      id: `inst-edge-${index}`,
      source: inst.parentNodeId,
      target: `inst-${inst.id}`,
      type: 'smoothstep',
      animated: false,
      style: {
        stroke: 'rgba(167, 139, 250, 0.4)',
        strokeWidth: 1,
        strokeDasharray: '4 2',
      },
    })
  })
  
  return result
})

// 노드 라벨에 따른 타입 결정
function getNodeType(label: string): string {
  const labelLower = label.toLowerCase()
  if (labelLower.includes('asset') || labelLower.includes('data')) return 'asset'
  if (labelLower.includes('system') || labelLower.includes('platform')) return 'system'
  if (labelLower.includes('event') || labelLower.includes('alarm') || labelLower.includes('log')) return 'event'
  return 'component' // 기본값
}

// 관계 타입에 따른 엣지 색상
function getEdgeColor(type: string): string {
  const typeUpper = type.toUpperCase()
  if (typeUpper.includes('HAS')) return '#38bdf8'
  if (typeUpper.includes('USES')) return '#a78bfa'
  if (typeUpper.includes('IMPLEMENTS')) return '#34d399'
  if (typeUpper.includes('DEPLOYS')) return '#fbbf24'
  return '#6b7280'
}

// MiniMap 노드 색상
function getNodeColor(node: Node): string {
  switch (node.type) {
    case 'asset': return '#fbbf24'
    case 'system': return '#38bdf8'
    case 'event': return '#f87171'
    case 'component':
    default: return '#34d399'
  }
}

// 노드 클릭 핸들러
function handleNodeClick(event: { node: Node }) {
  selectedNodeId.value = event.node.id
  emit('node-select', event.node.id)
}

// 패널 클릭 (선택 해제)
function handlePaneClick() {
  selectedNodeId.value = null
}

// VueFlow 초기화 핸들러
function onVueFlowInit(instance: VueFlowStore) {
  vueFlowRef.value = instance
  refreshLayout()
}

// 레이아웃 새로고침
function refreshLayout() {
  setTimeout(() => {
    if (vueFlowRef.value) {
      vueFlowRef.value.fitView({ padding: 0.2 })
    }
  }, 100)
}

// 스키마 변경 시 레이아웃 재조정
watch(() => props.schema, () => {
  refreshLayout()
}, { deep: true })
</script>

<template>
  <div class="ontology-canvas">
    <!-- 빈 상태 -->
    <div v-if="!schema || nodes.length === 0" class="canvas-empty">
      <div class="empty-icon">🔮</div>
      <div class="empty-text">온톨로지 스키마가 없습니다</div>
      <div class="empty-hint">위저드를 통해 도메인 문서에서 스키마를 생성하세요</div>
    </div>
    
    <!-- VueFlow 캔버스 -->
    <VueFlow
      v-else
      :nodes="nodes"
      :edges="edges"
      :node-types="nodeTypes"
      :default-viewport="{ zoom: 0.8, x: 50, y: 50 }"
      :min-zoom="0.2"
      :max-zoom="2"
      :snap-to-grid="true"
      :snap-grid="[20, 20]"
      :nodes-draggable="true"
      :pan-on-drag="true"
      :zoom-on-scroll="true"
      :fit-view-on-init="true"
      @init="onVueFlowInit"
      @node-click="handleNodeClick"
      @pane-click="handlePaneClick"
    >
      <Background pattern-color="#2a2a3a" :gap="20" />
      <Controls position="bottom-left" />
      <MiniMap 
        :node-color="getNodeColor"
        :node-stroke-width="3"
        pannable
        zoomable
      />
    </VueFlow>
    
    <!-- 캔버스 툴바 -->
    <div v-if="schema && nodes.length > 0" class="canvas-toolbar">
      <button class="toolbar-btn" @click="zoomIn()" title="확대">
        <IconZoomIn :size="18" />
      </button>
      <button class="toolbar-btn" @click="zoomOut()" title="축소">
        <IconZoomOut :size="18" />
      </button>
      <button class="toolbar-btn" @click="fitView({ padding: 0.2 })" title="전체 보기">
        <IconMaximize :size="18" />
      </button>
      <div class="toolbar-divider"></div>
      <button class="toolbar-btn" @click="refreshLayout()" title="레이아웃 새로고침">
        <IconRefresh :size="18" />
      </button>
    </div>
    
    <!-- 범례 -->
    <div v-if="schema && nodes.length > 0" class="canvas-legend">
      <div class="legend-title">노드 유형</div>
      <div class="legend-item">
        <span class="legend-dot asset"></span>
        <span>Asset (자산)</span>
      </div>
      <div class="legend-item">
        <span class="legend-dot system"></span>
        <span>System (시스템)</span>
      </div>
      <div class="legend-item">
        <span class="legend-dot component"></span>
        <span>Component (구성요소)</span>
      </div>
      <div class="legend-item">
        <span class="legend-dot event"></span>
        <span>Event (이벤트)</span>
      </div>
    </div>
  </div>
</template>

<style>
/* VueFlow imports */
@import '@vue-flow/core/dist/style.css';
@import '@vue-flow/core/dist/theme-default.css';
@import '@vue-flow/controls/dist/style.css';
@import '@vue-flow/minimap/dist/style.css';

/* VueFlow 오버라이드 */
.vue-flow {
  width: 100% !important;
  height: 100% !important;
  background: var(--color-bg) !important;
}

.vue-flow__minimap {
  background: var(--color-bg-secondary) !important;
  border: 1px solid var(--color-border) !important;
  border-radius: 8px !important;
}

.vue-flow__controls {
  background: var(--color-bg-secondary) !important;
  border: 1px solid var(--color-border) !important;
  border-radius: 8px !important;
}

.vue-flow__controls-button {
  background: transparent !important;
  border: none !important;
  color: var(--color-text) !important;
}

.vue-flow__controls-button:hover {
  background: var(--color-bg-tertiary) !important;
}

.vue-flow__edge-path {
  stroke-width: 2 !important;
}

.vue-flow__edge.animated path {
  stroke-dasharray: 5 !important;
  animation: flowEdge 0.5s linear infinite !important;
}

@keyframes flowEdge {
  to {
    stroke-dashoffset: -10;
  }
}
</style>

<style scoped lang="scss">
.ontology-canvas {
  flex: 1;
  width: 100%;
  height: 100%;
  min-height: 300px;
  position: relative;
  background: var(--color-bg);
  overflow: hidden;
}

.canvas-empty {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: var(--color-text-muted);
  
  .empty-icon {
    font-size: 64px;
    margin-bottom: 16px;
    opacity: 0.5;
  }
  
  .empty-text {
    font-size: 1.2rem;
    font-weight: 500;
    color: var(--color-text-light);
    margin-bottom: 8px;
  }
  
  .empty-hint {
    font-size: 0.9rem;
  }
}

.canvas-toolbar {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 4px;
  padding: 6px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  z-index: 10;
  
  .toolbar-btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: var(--color-text);
    cursor: pointer;
    transition: all 0.15s ease;
    
    &:hover {
      background: var(--color-bg-tertiary);
      color: var(--color-text-bright);
    }
  }
  
  .toolbar-divider {
    width: 1px;
    background: var(--color-border);
    margin: 4px 0;
  }
}

.canvas-legend {
  position: absolute;
  top: 16px;
  right: 16px;
  padding: 14px 18px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 10;
  
  .legend-title {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted);
    margin-bottom: 10px;
  }
  
  .legend-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.8rem;
    color: var(--color-text-light);
    margin-bottom: 6px;
    
    &:last-child {
      margin-bottom: 0;
    }
  }
  
  .legend-dot {
    width: 12px;
    height: 12px;
    border-radius: 4px;
    
    &.asset {
      background: #fbbf24;
    }
    
    &.system {
      background: #38bdf8;
    }
    
    &.component {
      background: #34d399;
    }
    
    &.event {
      background: #f87171;
    }
  }
}
</style>
