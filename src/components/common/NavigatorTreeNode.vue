<script setup lang="ts">
/**
 * NavigatorTreeNode.vue
 * 재귀 트리 노드 — 드래그 가능, 자식 토글 가능.
 * 드래그 데이터: application/json { nodeId, nodeType, labels }
 */
import { computed } from 'vue'
import { useProjectStore } from '@/stores/project'
import { useNavigatorStore, type NavigatorTreeItem } from '@/stores/navigator'

interface Props {
  node: NavigatorTreeItem
  depth?: number
}
const props = withDefaults(defineProps<Props>(), { depth: 0 })

const projectStore = useProjectStore()
const navigatorStore = useNavigatorStore()

const hasChildren = computed(() => props.node.children.length > 0)
const isExpanded = computed(() => navigatorStore.expandedNodes.has(props.node.id))
const isOnCanvas = computed(() => projectStore.canvasNodeIds.has(props.node.id))

function onToggle(e: MouseEvent) {
  e.stopPropagation()
  if (!hasChildren.value) return
  navigatorStore.toggleNode(props.node.id)
}

function onDragStart(e: DragEvent) {
  if (!e.dataTransfer) return
  e.dataTransfer.setData('application/json', JSON.stringify({
    nodeId: props.node.id,
    nodeType: props.node.nodeType,
    labels: props.node.labels
  }))
  e.dataTransfer.effectAllowed = 'copy'
}

function onDoubleClick() {
  // 더블클릭은 드래그 대체 수단 — 바로 캔버스에 확장
  projectStore.expandNodeOnCanvas(props.node.id)
}

/** 라벨별 배지 문자 (단일 글자) */
const badgeChar = computed(() => {
  const t = props.node.nodeType
  if (!t) return '?'
  return t.charAt(0).toUpperCase()
})

/** 라벨별 배지 스타일 클래스 */
const badgeClass = computed(() => {
  const t = props.node.nodeType
  if (/Class|CLASS/.test(t)) return 'badge-class'
  if (/Interface|INTERFACE/.test(t)) return 'badge-interface'
  if (/Function|Method|FUNCTION/.test(t)) return 'badge-function'
  if (/Variable|Field|Constant/.test(t)) return 'badge-variable'
  if (/Table|TABLE/.test(t)) return 'badge-table'
  if (/Column|COLUMN/.test(t)) return 'badge-column'
  if (props.node.labels.includes('MODULE')) return 'badge-module'
  return 'badge-default'
})
</script>

<template>
  <div class="nav-tree-node">
    <div
      class="nav-tree-label"
      :class="{ 'on-canvas': isOnCanvas }"
      :style="{ paddingLeft: `${8 + depth * 14}px` }"
      draggable="true"
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

.badge-module    { background: rgba(66, 99, 235, 0.2);  color: #91a7ff; }
.badge-class     { background: rgba(240, 48, 99, 0.2);  color: #ffa8a8; }
.badge-interface { background: rgba(20, 184, 166, 0.2); color: #66d9e8; }
.badge-function  { background: rgba(250, 176, 5, 0.2);  color: #ffd43b; }
.badge-variable  { background: rgba(55, 178, 77, 0.2);  color: #8ce99a; }
.badge-table     { background: rgba(20, 184, 166, 0.2); color: #66d9e8; }
.badge-column    { background: rgba(16, 152, 173, 0.2); color: #66d9e8; }
.badge-default   { background: rgba(134, 142, 150, 0.2); color: #ced4da; }

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}
</style>
