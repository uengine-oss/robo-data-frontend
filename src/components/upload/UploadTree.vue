<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { UploadTreeNode } from '@/utils/upload'
import UploadTreeNodeItem from './UploadTreeNode.vue'

interface Props {
  root: UploadTreeNode
  /** relPath (상대경로) */
  selectedRelPath?: string | null
  showHeader?: boolean
  enableDnD?: boolean
  /** 루트를 트리 노드로 표시할지 여부 (기본값: false) */
  showRootAsNode?: boolean
  /** 삭제 버튼 표시 여부 (기본값: true) */
  showRemoveButton?: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  select: [relPath: string]
  remove: [relPath: string]
  move: [payload: { sourceRelPath: string; targetFolderRelPath: string }]
}>()

const expanded = ref<Set<string>>(new Set())

const collectFolderPaths = (node: UploadTreeNode, acc: Set<string>) => {
  if (node.type === 'folder') acc.add(node.relPath)
  for (const child of node.children || []) collectFolderPaths(child, acc)
}

// 기본값: 항상 전체 펼치기
watch(
  () => props.root,
  (root) => {
    const next = new Set<string>()
    collectFolderPaths(root, next)
    expanded.value = next
  },
  { immediate: true, deep: true }
)

const toggle = (relPath: string) => {
  const next = new Set(expanded.value)
  if (next.has(relPath)) next.delete(relPath)
  else next.add(relPath)
  expanded.value = next
}

const flat = computed(() => {
  if (props.showRootAsNode) {
    // 루트를 트리 노드로 표시
    return [props.root]
  }
  return props.root.children || []
})

const onSelect = (relPath: string) => emit('select', relPath)
const onRemove = (relPath: string) => emit('remove', relPath)
const onMove = (payload: { sourceRelPath: string; targetFolderRelPath: string }) => emit('move', payload)
</script>

<template>
  <div class="tree">
    <div v-if="showHeader !== false && !showRootAsNode" class="tree-root">
      <span class="root-name">{{ root.name }}</span>
    </div>

    <div v-if="flat.length === 0" class="empty">
      업로드된 파일이 없습니다
    </div>

    <ul v-else class="tree-list">
      <UploadTreeNodeItem
        v-for="child in flat"
        :key="child.type + ':' + child.relPath"
        :node="child"
        :level="0"
        :selected-rel-path="selectedRelPath"
        :expanded="expanded"
        :enable-dn-d="enableDnD"
        :show-remove-button="showRemoveButton !== false"
        @toggle="toggle"
        @select="onSelect"
        @remove="onRemove"
        @move="onMove"
      />
    </ul>
  </div>
</template>

<style scoped lang="scss">
.tree {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden; // tree 자체는 스크롤 안함
  flex: 1;
  min-height: 0;
}

.tree-root {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.root-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.empty {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-lg);
  text-align: center;
  color: var(--color-text-muted);
  font-size: 13px;
}

.tree-list {
  list-style: none;
  margin: 0;
  padding: 6px 0;
  overflow: auto; // 세로/가로 스크롤 여기서만
  flex: 1;
  min-height: 0;
  min-width: 0;
  width: 100%;
  
  // 긴 파일명이 가로 스크롤되도록
  :deep(.node-row),
  :deep(.tree-node-item) {
    width: max-content;
    min-width: 100%;
    white-space: nowrap;
  }
  
  &::-webkit-scrollbar {
    height: 8px;
    width: 8px;
  }
  
  &::-webkit-scrollbar-track {
    background: var(--color-bg-tertiary);
  }
  
  &::-webkit-scrollbar-thumb {
    background: var(--color-border);
    border-radius: 4px;
    
    &:hover {
      background: var(--color-text-muted);
    }
  }
  
  // Firefox
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
}

</style>


