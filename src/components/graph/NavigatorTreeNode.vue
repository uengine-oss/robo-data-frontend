<script setup lang="ts">
/**
 * NavigatorTreeNode.vue
 * 재귀 트리 노드 — 드래그 가능, 자식 토글 가능.
 * 드래그 데이터: application/json { nodeId, nodeType, labels }
 */
import { computed } from 'vue'
import { useCanvasStore } from '@/stores/graphCanvas'
import { useNavigatorStore, type NavigatorTreeItem } from '@/stores/navigator'

interface Props {
  node: NavigatorTreeItem
  depth?: number
}
const props = withDefaults(defineProps<Props>(), { depth: 0 })

const canvasStore = useCanvasStore()
const navigatorStore = useNavigatorStore()

const hasChildren = computed(() => props.node.children.length > 0)
/** 기본 동작: 전체 펼침. navigatorStore.collapsedNodes 에 있으면 접힘. */
const isExpanded = computed(() => navigatorStore.isNodeExpanded(props.node.id))
const isOnCanvas = computed(() => canvasStore.canvasNodeIds.has(props.node.id))
const isSelected = computed(() => navigatorStore.selectedNodeId === props.node.id)

function onToggle(e: MouseEvent) {
  e.stopPropagation()
  if (!hasChildren.value) return
  navigatorStore.toggleNode(props.node.id)
}

function onSelect() {
  // Navigator 단일 클릭 = 디테일 패널에 노드 정보 표시.
  // 캔버스 동작 X (드래그/더블클릭 별개).
  navigatorStore.selectNode(props.node.id)
}

function onDragStart(e: DragEvent) {
  if (!e.dataTransfer) return
  e.dataTransfer.setData('application/json', JSON.stringify({
    nodeId: props.node.id,
    nodeType: props.node.nodeType,
    labels: props.node.labels,
  }))
  e.dataTransfer.effectAllowed = 'copy'
}

function onDoubleClick() {
  // Navigator 더블클릭 = 드래그 대체. 그 노드 하나만 캔버스에 추가.
  canvasStore.addNodeToCanvas(props.node.id)
}

/**
 * 배지 문자. labels 를 우선 보고 명시적 매핑.
 * 함수 서브타입(Query/Command/Validation)은 모두 F 로 통일 — 다양한 문자로 쪼개면
 * Validation 의 'V' 가 변수처럼 보이는 등 혼동을 유발.
 */
const badgeChar = computed(() => {
  const labels = props.node.labels
  if (labels.includes('PACKAGE')) return 'P'
  if (labels.includes('MODULE') || labels.includes('FILE')) return 'M'
  if (labels.includes('BusinessLogic')) return 'B'
  if (labels.includes('Table')) return 'T'
  if (labels.includes('Column')) return 'C'
  if (labels.includes('FUNCTION')) return 'F'
  // fallback: nodeType 앞 글자
  const t = props.node.nodeType
  return t ? t.charAt(0).toUpperCase() : '?'
})

/** 라벨별 배지 스타일 클래스 (labels 배열을 우선 보고, 없으면 nodeType 패턴). */
const badgeClass = computed(() => {
  const labels = props.node.labels
  if (labels.includes('PACKAGE')) return 'badge-package'
  if (labels.includes('MODULE') || labels.includes('FILE')) return 'badge-module'
  if (labels.includes('BusinessLogic')) return 'badge-bl'
  if (labels.includes('Table')) return 'badge-table'
  if (labels.includes('Column')) return 'badge-column'
  if (labels.includes('FUNCTION')) return 'badge-function'
  const t = props.node.nodeType
  if (/Class|CLASS/.test(t)) return 'badge-class'
  if (/Interface|INTERFACE/.test(t)) return 'badge-interface'
  if (/Function|Method|FUNCTION/.test(t)) return 'badge-function'
  return 'badge-default'
})
</script>

<template>
  <div class="nav-tree-node">
    <div
      class="nav-tree-label"
      :class="{ 'on-canvas': isOnCanvas, 'selected': isSelected }"
      :style="{ paddingLeft: `${8 + depth * 14}px` }"
      draggable="true"
      @click="onSelect"
      @dragstart="onDragStart"
      @dblclick="onDoubleClick"
      :title="node.id"
    >
      <span class="chevron" @click="onToggle">
        <template v-if="hasChildren">{{ isExpanded ? '▾' : '▸' }}</template>
      </span>
      <span class="badge" :class="badgeClass">{{ badgeChar }}</span>
      <span class="name">{{ node.name }}</span>
    </div>
    <div v-if="hasChildren && isExpanded" class="nav-tree-children">
      <NavigatorTreeNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :depth="depth + 1"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.nav-tree-node {
  user-select: none;
}

.nav-tree-label {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  font-size: 12px;
  cursor: grab;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &:hover {
    background: var(--color-bg-hover, #2c2e33);
  }

  &:active {
    cursor: grabbing;
  }

  &.on-canvas {
    opacity: 0.55;

    &::after {
      content: '●';
      color: var(--color-success, #40c057);
      font-size: 10px;
      margin-left: 4px;
    }
  }

  &.selected {
    background: var(--nav-tree-selected-bg);
    color: var(--color-text);

    &:hover {
      background: var(--nav-tree-selected-hover);
    }
  }
}

.chevron {
  width: 10px;
  color: var(--color-text-secondary, #868e96);
  font-size: 9px;
  text-align: center;
  flex-shrink: 0;
  cursor: pointer;
}

.badge {
  display: inline-block;
  width: 16px;
  font-size: 9px;
  font-weight: 700;
  padding: 1px 0;
  border-radius: 2px;
  text-align: center;
  flex-shrink: 0;
}

.badge-package   { background: rgba(121, 80, 242, 0.22); color: #b197fc; }
.badge-module    { background: rgba(66, 99, 235, 0.2);   color: #91a7ff; }
.badge-class     { background: rgba(240, 48, 99, 0.2);   color: #ffa8a8; }
.badge-interface { background: rgba(20, 184, 166, 0.2);  color: #66d9e8; }
.badge-function  { background: rgba(250, 176, 5, 0.2);   color: #ffd43b; }
.badge-bl        { background: rgba(174, 62, 201, 0.25); color: #e599f7; }
.badge-variable  { background: rgba(55, 178, 77, 0.2);   color: #8ce99a; }
.badge-table     { background: rgba(20, 184, 166, 0.25); color: #5eead4; }
.badge-column    { background: rgba(248, 113, 113, 0.22); color: #fca5a5; }
.badge-default   { background: rgba(134, 142, 150, 0.2); color: #ced4da; }

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}
</style>
