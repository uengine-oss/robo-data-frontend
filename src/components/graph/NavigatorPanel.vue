<script setup lang="ts">
/**
 * NavigatorPanel.vue
 * 좌측 SideNav 옆에 붙는 고정 사이드 패널.
 * 분석 스트림으로 채워지는 nodeMap 을 소스로 MODULES / TABLES 트리를 렌더.
 * 노드 드래그 → GraphTab 캔버스에 drop 하면 1-hop 확장 누적.
 */
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAnalyzerStore } from '@/stores/analyzer'
import {
  useNavigatorStore,
  type NavigatorSection,
  type NavigatorTreeItem,
} from '@/stores/navigator'
import { useResize } from '@/composables/useResize'
import NavigatorTreeNode from './NavigatorTreeNode.vue'

const projectStore = useAnalyzerStore()
const navigatorStore = useNavigatorStore()

const { isPanelOpen } = storeToRefs(navigatorStore)
const { isProcessing, nodeMap } = storeToRefs(projectStore)
const { moduleTree, tableList, expandedSections, searchQuery } =
  storeToRefs(navigatorStore)

const totalNodeCount = computed(() => nodeMap.value.size)

interface Section {
  id: NavigatorSection
  label: string
  items: NavigatorTreeItem[]
}

const sections = computed<Section[]>(() => [
  { id: 'MODULES', label: 'MODULES', items: moduleTree.value },
  { id: 'TABLES', label: 'TABLES', items: tableList.value },
])

function isSectionOpen(id: NavigatorSection): boolean {
  return expandedSections.value.has(id)
}

// --- 리사이즈 ---
// SideNav 오른쪽에 붙는 패널이므로 panel-left origin 사용 (cursorX - panelRef.left).
const panelRef = ref<HTMLElement | null>(null)
const { value: panelWidth, isResizing, startResize } = useResize({
  direction: 'horizontal',
  initialValue: 300,
  min: 220,
  max: 560,
  origin: 'panel-left',
  panelRef,
})
</script>

<template>
  <aside
    v-show="isPanelOpen"
    ref="panelRef"
    class="navigator-panel"
    :style="{ width: `${panelWidth}px` }"
  >
    <header class="nav-header">
      <span class="nav-title">
        📂 Navigator
        <span v-if="isProcessing" class="spinner" title="분석 진행 중" />
      </span>
      <div class="nav-actions">
        <span class="count">{{ totalNodeCount }}</span>
        <button class="icon-btn" title="모두 접기" @click="navigatorStore.collapseAll()">⇱</button>
        <button class="icon-btn close" title="닫기" @click="navigatorStore.setPanelOpen(false)">✕</button>
      </div>
    </header>

    <div class="nav-search">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="🔍 Search modules / classes / tables..."
      />
    </div>

    <div class="nav-scroll">
      <section
        v-for="sec in sections"
        :key="sec.id"
        class="nav-section"
      >
        <header
          class="section-header"
          @click="navigatorStore.toggleSection(sec.id)"
        >
          <span class="chev">{{ isSectionOpen(sec.id) ? '▾' : '▸' }}</span>
          <span class="section-label">{{ sec.label }}</span>
          <span class="section-count">{{ sec.items.length }}</span>
        </header>
        <div v-if="isSectionOpen(sec.id)" class="section-body">
          <div v-if="sec.items.length === 0" class="empty-placeholder">
            항목 없음
          </div>
          <NavigatorTreeNode
            v-for="item in sec.items"
            :key="item.id"
            :node="item"
            :depth="0"
          />
        </div>
      </section>
    </div>

    <div
      class="resize-handle"
      :class="{ resizing: isResizing }"
      @mousedown="startResize"
    />
  </aside>
</template>

<style lang="scss" scoped>
.navigator-panel {
  position: relative;
  background: var(--color-bg-secondary, #1e1f23);
  border-right: 1px solid var(--color-border, #373a40);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-shrink: 0;
  user-select: none;
}

.nav-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--color-border, #373a40);
  background: var(--color-bg-tertiary, #1a1b1e);
}

.nav-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--color-text, #c1c2c5);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.spinner {
  width: 10px;
  height: 10px;
  border: 2px solid var(--color-border, #373a40);
  border-top-color: var(--color-accent, #228be6);
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

.nav-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.count {
  font-size: 10px;
  color: var(--color-text-secondary, #868e96);
  margin-right: 4px;
}

.icon-btn {
  background: transparent;
  border: none;
  color: var(--color-text-secondary, #868e96);
  width: 22px;
  height: 22px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 11px;

  &:hover {
    background: var(--color-bg-hover, #2c2e33);
    color: var(--color-text, #c1c2c5);
  }
}

.nav-search {
  padding: 6px 10px;
  border-bottom: 1px solid var(--color-border, #373a40);

  input {
    width: 100%;
    background: var(--color-bg, #25262b);
    border: 1px solid var(--color-border, #373a40);
    padding: 5px 8px;
    color: var(--color-text, #c1c2c5);
    font-size: 11px;
    border-radius: 3px;
    outline: none;

    &:focus {
      border-color: var(--color-accent, #4263eb);
    }
  }
}

.nav-scroll {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;

  &::-webkit-scrollbar {
    width: 8px;
  }
  &::-webkit-scrollbar-thumb {
    background: var(--color-border, #373a40);
    border-radius: 4px;
  }
}

.nav-section {
  border-bottom: 1px solid var(--color-border-subtle, #2c2e33);
}

.section-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--color-text-secondary, #868e96);
  cursor: pointer;

  &:hover {
    background: var(--color-bg-hover, #2c2e33);
    color: var(--color-text, #c1c2c5);
  }
}

.chev {
  width: 10px;
  font-size: 9px;
}

.section-label {
  flex: 1;
}

.section-count {
  background: var(--color-border, #373a40);
  color: var(--color-text, #c1c2c5);
  font-size: 9px;
  padding: 1px 6px;
  border-radius: 8px;
}

.section-body {
  padding: 2px 0 4px;
}

.empty-placeholder {
  padding: 8px 12px;
  color: var(--color-text-subtle, #495057);
  font-size: 11px;
  font-style: italic;
}

.resize-handle {
  position: absolute;
  top: 0;
  right: -2px;
  bottom: 0;
  width: 4px;
  cursor: ew-resize;
  z-index: 10;

  &:hover,
  &.resizing {
    background: rgba(116, 192, 252, 0.3);
  }
}
</style>
