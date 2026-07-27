<script setup lang="ts">
interface LayerPanelNode {
  id: string
  name: string
}

interface LayerPanelGroup {
  id: string
  name: string
  icon: string
  color: string
  collapsed: boolean
  nodes: readonly LayerPanelNode[]
}

defineProps<{
  collapsed: boolean
  groups: readonly LayerPanelGroup[]
  selectedNodeId: string | null
}>()

const emit = defineEmits<{
  togglePanel: []
  toggleLayer: [layerId: string]
  activateNode: [nodeId: string]
  openNodeMenu: [event: MouseEvent, nodeId: string]
}>()

function layerNodesId(layerId: string): string {
  return `ontology-layer-${encodeURIComponent(layerId)}-nodes`
}
</script>

<template>
  <aside class="layer-panel" :class="{ 'layer-panel-collapsed': collapsed }">
    <h3 class="layer-panel-header">
      <span v-if="!collapsed">📊 레이어별 노드</span>
      <button
        type="button"
        class="layer-panel-toggle-btn"
        :title="collapsed ? '패널 펼치기' : '패널 접기'"
        :aria-label="collapsed ? '레이어 패널 펼치기' : '레이어 패널 접기'"
        :aria-expanded="!collapsed"
        @click="emit('togglePanel')"
      >
        {{ collapsed ? '▶' : '◀' }}
      </button>
    </h3>

    <div v-if="!collapsed" class="layer-list">
      <div
        v-for="group in groups"
        :key="group.id"
        class="layer-item"
        :class="{ collapsed: group.collapsed }"
      >
        <button
          type="button"
          class="layer-header"
          :style="{ borderLeftColor: group.color }"
          :aria-label="`${group.name} 레이어 ${group.collapsed ? '펼치기' : '접기'}`"
          :aria-expanded="!group.collapsed"
          :aria-controls="layerNodesId(group.id)"
          @click="emit('toggleLayer', group.id)"
        >
          <span class="layer-icon">{{ group.icon }}</span>
          <span class="layer-name">{{ group.name }}</span>
          <span class="layer-count">{{ group.nodes.length }}</span>
          <span class="collapse-icon">{{ group.collapsed ? '▶' : '▼' }}</span>
        </button>
        <div
          v-if="!group.collapsed"
          :id="layerNodesId(group.id)"
          class="layer-nodes"
        >
          <button
            v-for="node in group.nodes"
            :key="node.id"
            type="button"
            class="node-item"
            :class="{ selected: selectedNodeId === node.id }"
            :aria-pressed="selectedNodeId === node.id"
            @click="emit('activateNode', node.id)"
            @contextmenu.prevent="emit('openNodeMenu', $event, node.id)"
          >
            <span class="node-name">{{ node.name }}</span>
          </button>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.layer-panel {
  width: 280px;
  min-width: 280px;
  flex-shrink: 0;
  overflow-y: auto;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%);
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.2);
  transition: width 0.3s ease, min-width 0.3s ease;
}

.layer-panel.layer-panel-collapsed {
  width: 44px;
  min-width: 44px;
  overflow: hidden;
}

.layer-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  margin: 0;
  color: rgba(255, 255, 255, 0.95);
  font-size: 0.9375rem;
  font-weight: 600;
  white-space: nowrap;
  background: rgba(30, 30, 40, 0.4);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.layer-panel-collapsed .layer-panel-header {
  justify-content: center;
  padding: 16px 0;
}

.layer-panel-toggle-btn {
  flex-shrink: 0;
  padding: 4px 8px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.75rem;
  line-height: 1;
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.layer-panel-toggle-btn:hover {
  color: rgba(255, 255, 255, 0.95);
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.3);
}

.layer-list {
  padding: 12px;
  background: transparent;
}

.layer-item {
  margin-bottom: 6px;
  overflow: hidden;
  background: rgba(30, 30, 40, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
}

.layer-header {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 10px 14px;
  gap: 8px;
  color: inherit;
  font: inherit;
  text-align: left;
  background: transparent;
  border-top: 0;
  border-right: 0;
  border-bottom: 0;
  border-left: 4px solid;
  cursor: pointer;
  transition: all 0.2s ease;
}

.layer-header:hover {
  background: rgba(255, 255, 255, 0.06);
}

.layer-header:focus-visible {
  outline: 2px solid var(--color-accent, #4dabf7);
  outline-offset: -2px;
}

.layer-icon {
  font-size: 1rem;
}

.layer-name {
  flex: 1;
  color: rgba(255, 255, 255, 0.95);
  font-size: 0.875rem;
  font-weight: 500;
}

.layer-count {
  padding: 3px 10px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.75rem;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 12px;
}

.collapse-icon {
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.625rem;
}

.layer-nodes {
  padding: 4px 14px 10px;
}

.node-item {
  display: block;
  width: 100%;
  padding: 8px 12px;
  margin: 3px 0;
  color: rgba(255, 255, 255, 0.85);
  font-family: inherit;
  font-size: 0.8125rem;
  text-align: left;
  background: rgba(255, 255, 255, 0.02);
  border: 0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.node-item:hover {
  color: rgba(255, 255, 255, 1);
  background: rgba(255, 255, 255, 0.08);
}

.node-item.selected {
  color: white;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.node-item:focus-visible {
  outline: 2px solid #93c5fd;
  outline-offset: 2px;
}

:global(.light-mode) .layer-panel {
  background: #ffffff !important;
  border-right-color: #e2e8f0 !important;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.04) !important;
}

:global(.light-mode) .layer-panel-header {
  color: #0f172a !important;
  background: #f8fafc !important;
  border-bottom-color: #e2e8f0 !important;
}

:global(.light-mode) .layer-panel-toggle-btn {
  color: #475569 !important;
  border-color: #cbd5e1 !important;
}

:global(.light-mode) .layer-panel-toggle-btn:hover {
  color: #0f172a !important;
  background: #e2e8f0 !important;
  border-color: #94a3b8 !important;
}

:global(.light-mode) .layer-list {
  background: #ffffff !important;
}

:global(.light-mode) .layer-item {
  background: #f8fafc !important;
  border-color: #e2e8f0 !important;
}

:global(.light-mode) .layer-header,
:global(.light-mode) .layer-header .layer-name {
  color: #0f172a !important;
}

:global(.light-mode) .layer-header .layer-icon {
  opacity: 0.9;
}

:global(.light-mode) .layer-header:hover {
  background: #f1f5f9 !important;
}

:global(.light-mode) .collapse-icon {
  color: #64748b !important;
}

:global(.light-mode) .layer-count {
  color: #475569 !important;
  background: #e2e8f0 !important;
}

:global(.light-mode) .layer-nodes {
  background: transparent !important;
}

:global(.light-mode) .node-item {
  color: #334155 !important;
  background: #ffffff !important;
  border: 1px solid transparent !important;
}

:global(.light-mode) .node-item .node-name {
  color: #334155 !important;
}

:global(.light-mode) .node-item:hover {
  color: #0f172a !important;
  background: #f1f5f9 !important;
  border-color: #e2e8f0 !important;
}

:global(.light-mode) .node-item.selected,
:global(.light-mode) .node-item.selected .node-name {
  color: white !important;
}

:global(.light-mode) .node-item.selected {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
}

@media (max-width: 720px) {
  .layer-panel {
    position: absolute;
    inset: 0 auto 0 0;
    z-index: 30;
    width: min(280px, calc(100% - 44px));
    min-width: min(280px, calc(100% - 44px));
    max-width: calc(100% - 44px);
  }

  .layer-panel.layer-panel-collapsed {
    width: 44px;
    min-width: 44px;
  }
}
</style>
