<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

interface MenuPosition {
  x: number
  y: number
}

interface CanvasLayerPresentation {
  id: string
  name: string
  color: string
  icon: string
}

const props = defineProps<{
  visible: boolean
  mode: 'canvas' | 'node' | 'edge'
  position: MenuPosition
  layers: readonly CanvasLayerPresentation[]
  nodeName: string
  relationshipLabel: string
}>()

const emit = defineEmits<{
  addNode: [layerId: string]
  startRelationship: []
  applyFilter: []
  openWhatIf: []
  renameNode: []
  deleteNode: []
  editRelationship: []
  deleteRelationship: []
}>()

const menuRef = ref<HTMLElement | null>(null)
const resolvedPosition = ref<MenuPosition>({ x: 0, y: 0 })

function clampMenuPosition() {
  const menu = menuRef.value
  const container = menu?.offsetParent
  if (!(menu instanceof HTMLElement) || !(container instanceof HTMLElement)) return

  resolvedPosition.value = {
    x: Math.min(
      Math.max(8, props.position.x),
      Math.max(8, container.clientWidth - menu.offsetWidth - 8),
    ),
    y: Math.min(
      Math.max(8, props.position.y),
      Math.max(8, container.clientHeight - menu.offsetHeight - 8),
    ),
  }
}

watch(
  () => [props.visible, props.mode, props.position.x, props.position.y] as const,
  async ([visible]) => {
    if (!visible) return
    resolvedPosition.value = { ...props.position }
    await nextTick()
    clampMenuPosition()
  },
  { immediate: true },
)
</script>

<template>
  <div
    v-if="visible && mode === 'canvas'"
    ref="menuRef"
    class="canvas-context-menu"
    :style="{ left: `${resolvedPosition.x}px`, top: `${resolvedPosition.y}px` }"
    role="menu"
    aria-label="새 노드 추가"
  >
    <div class="context-menu-header">새 노드 추가</div>
    <button
      v-for="layer in layers"
      :key="layer.id"
      type="button"
      class="context-menu-item"
      role="menuitem"
      @click="emit('addNode', layer.id)"
    >
      <span class="context-menu-icon" :style="{ color: layer.color }">{{ layer.icon }}</span>
      <span class="context-menu-label">{{ layer.name }}</span>
      <span class="context-menu-dot" :style="{ backgroundColor: layer.color }"></span>
    </button>
  </div>

  <div
    v-else-if="visible && mode === 'node'"
    ref="menuRef"
    class="canvas-context-menu"
    :style="{ left: `${resolvedPosition.x}px`, top: `${resolvedPosition.y}px` }"
    role="menu"
    :aria-label="`${nodeName} 작업`"
  >
    <div class="context-menu-header">{{ nodeName }}</div>
    <button
      type="button"
      class="context-menu-item"
      role="menuitem"
      @click="emit('startRelationship')"
    >
      <span class="context-menu-icon relationship-icon">🔗</span>
      <span class="context-menu-label">관계 생성</span>
    </button>
    <button
      type="button"
      class="context-menu-item"
      role="menuitem"
      @click="emit('applyFilter')"
    >
      <span class="context-menu-icon filter-icon">🔍</span>
      <span class="context-menu-label">필터 적용</span>
    </button>
    <button
      type="button"
      class="context-menu-item"
      role="menuitem"
      @click="emit('openWhatIf')"
    >
      <span class="context-menu-icon whatif-icon">🔬</span>
      <span class="context-menu-label">What-if 분석 (현재 필터)</span>
    </button>
    <button
      type="button"
      class="context-menu-item"
      role="menuitem"
      @click="emit('renameNode')"
    >
      <span class="context-menu-icon edit-icon">✏️</span>
      <span class="context-menu-label">이름 변경</span>
    </button>
    <div class="context-menu-divider"></div>
    <button
      type="button"
      class="context-menu-item context-menu-danger"
      role="menuitem"
      @click="emit('deleteNode')"
    >
      <span class="context-menu-icon">🗑️</span>
      <span class="context-menu-label">삭제</span>
    </button>
  </div>

  <div
    v-else-if="visible && mode === 'edge'"
    ref="menuRef"
    class="canvas-context-menu"
    :style="{ left: `${resolvedPosition.x}px`, top: `${resolvedPosition.y}px` }"
    role="menu"
    :aria-label="`${relationshipLabel} 관계 작업`"
  >
    <div class="context-menu-header">{{ relationshipLabel }}</div>
    <button
      type="button"
      class="context-menu-item"
      role="menuitem"
      @click="emit('editRelationship')"
    >
      <span class="context-menu-icon edit-icon">⚙️</span>
      <span class="context-menu-label">속성 편집</span>
    </button>
    <div class="context-menu-divider"></div>
    <button
      type="button"
      class="context-menu-item context-menu-danger"
      role="menuitem"
      @click="emit('deleteRelationship')"
    >
      <span class="context-menu-icon">🗑️</span>
      <span class="context-menu-label">삭제</span>
    </button>
  </div>
</template>

<style scoped>
.canvas-context-menu {
  position: absolute;
  z-index: 1000;
  min-width: 180px;
  padding: 6px 0;
  background: rgba(25, 25, 40, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(16px);
  animation: context-menu-fade-in 0.12s ease;
}

@keyframes context-menu-fade-in {
  from {
    opacity: 0;
    transform: scale(0.95);
  }

  to {
    opacity: 1;
    transform: scale(1);
  }
}

.context-menu-header {
  padding: 8px 16px 6px;
  margin-bottom: 4px;
  color: rgba(255, 255, 255, 0.45);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.context-menu-item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 10px 16px;
  gap: 10px;
  color: rgba(255, 255, 255, 0.9);
  font-family: inherit;
  font-size: 0.85rem;
  text-align: left;
  background: transparent;
  border: 0;
  cursor: pointer;
  transition: all 0.15s ease;
}

.context-menu-item:hover,
.context-menu-item:focus-visible {
  background: rgba(255, 255, 255, 0.1);
}

.context-menu-item:focus-visible {
  outline: 2px solid #93c5fd;
  outline-offset: -3px;
}

.context-menu-item:first-of-type {
  border-radius: 0;
}

.context-menu-item:last-child {
  border-radius: 0 0 12px 12px;
}

.context-menu-icon {
  width: 20px;
  font-size: 1rem;
  text-align: center;
}

.relationship-icon {
  color: #22d3ee;
}

.filter-icon {
  color: #a78bfa;
}

.whatif-icon {
  color: #818cf8;
}

.edit-icon {
  color: #63b3ed;
}

.context-menu-label {
  flex: 1;
  font-weight: 500;
}

.context-menu-dot {
  width: 10px;
  height: 10px;
  flex-shrink: 0;
  border-radius: 50%;
}

.context-menu-divider {
  height: 1px;
  margin: 4px 12px;
  background: rgba(255, 255, 255, 0.1);
}

.context-menu-danger {
  color: #f87171 !important;
}

.context-menu-danger:hover {
  background: rgba(239, 68, 68, 0.15) !important;
}

:global(.light-mode) .canvas-context-menu {
  background: rgba(255, 255, 255, 0.98) !important;
  border-color: rgba(0, 0, 0, 0.12) !important;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.15) !important;
}

:global(.light-mode) .context-menu-header {
  color: rgba(0, 0, 0, 0.4) !important;
  border-bottom-color: rgba(0, 0, 0, 0.06) !important;
}

:global(.light-mode) .context-menu-item {
  color: #334155 !important;
}

:global(.light-mode) .context-menu-item:hover {
  background: rgba(0, 0, 0, 0.04) !important;
}

:global(.light-mode) .context-menu-divider {
  background: rgba(0, 0, 0, 0.06) !important;
}

:global(.light-mode) .context-menu-danger {
  color: #dc2626 !important;
}

:global(.light-mode) .context-menu-danger:hover {
  background: rgba(239, 68, 68, 0.06) !important;
}
</style>
