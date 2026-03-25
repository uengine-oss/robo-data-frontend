<script setup lang="ts">
import { computed } from 'vue'
import type { PropType } from 'vue'
import type { UploadTreeNode } from '@/utils/upload'

const props = defineProps({
  node: { type: Object as PropType<UploadTreeNode>, required: true },
  level: { type: Number, required: true },
  selectedRelPath: { type: String as PropType<string | null | undefined>, default: null },
  expanded: { type: Object as PropType<Set<string>>, required: true },
  enableDnD: { type: Boolean, default: false },
  showRemoveButton: { type: Boolean, default: true }
})

const emit = defineEmits<{
  toggle: [relPath: string]
  select: [relPath: string]
  remove: [relPath: string]
  move: [payload: { sourceRelPath: string; targetFolderRelPath: string }]
}>()

const hasChildren = computed(() => (props.node.children?.length || 0) > 0)
const isExpanded = computed(() => props.expanded.has(props.node.relPath))
const isSelected = computed(() => (props.selectedRelPath || '') === props.node.relPath)

const iconFor = (node: UploadTreeNode) => {
  if (node.type === 'folder') return '📁'
  const ext = node.name.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'java': return '☕'
    case 'py': return '🐍'
    case 'c': case 'h': return '⚙️'
    case 'sql': return '🗄️'
    case 'xml': return '📋'
    case 'json': return '📊'
    case 'properties': return '⚙️'
    default: return '📄'
  }
}

const indentStyle = computed(() => ({
  paddingLeft: `${props.level * 10 + 6}px`
}))

const onToggle = () => emit('toggle', props.node.relPath)
const onSelect = () => emit('select', props.node.relPath)
const onRemove = () => emit('remove', props.node.relPath)

const onDragStart = (e: DragEvent) => {
  if (!props.enableDnD) return
  if (props.node.type !== 'file') return
  e.dataTransfer?.setData('text/plain', props.node.relPath)
  e.dataTransfer?.setData('application/x-upload-relpath', props.node.relPath)
  e.dataTransfer?.setDragImage?.((e.currentTarget as HTMLElement), 10, 10)
}

const onDragOver = (e: DragEvent) => {
  if (!props.enableDnD) return
  if (props.node.type !== 'folder') return
  e.preventDefault()
}

const onDrop = (e: DragEvent) => {
  if (!props.enableDnD) return
  if (props.node.type !== 'folder') return
  e.preventDefault()
  const sourceRelPath =
    e.dataTransfer?.getData('application/x-upload-relpath') ||
    e.dataTransfer?.getData('text/plain') ||
    ''
  if (!sourceRelPath) return
  emit('move', { sourceRelPath, targetFolderRelPath: props.node.relPath })
}
</script>

<template>
  <li class="node">
    <div
      class="row"
      :class="{ selected: isSelected }"
      :style="indentStyle"
      @click="onSelect"
      :draggable="enableDnD && node.type === 'file'"
      @dragstart="onDragStart"
      @dragover="onDragOver"
      @drop="onDrop"
    >
      <button
        v-if="node.type === 'folder'"
        class="twisty"
        @click.stop="onToggle"
        :title="isExpanded ? '접기' : '펼치기'"
      >
        {{ hasChildren ? (isExpanded ? '▾' : '▸') : '·' }}
      </button>
      <span v-else class="twisty placeholder"></span>

      <span class="icon">{{ iconFor(node) }}</span>
      <span class="name" :title="node.relPath">{{ node.name }}</span>

      <button v-if="showRemoveButton" class="remove" @click.stop="onRemove" title="제거">×</button>
    </div>

    <ul v-if="node.type === 'folder' && hasChildren && isExpanded" class="children">
      <UploadTreeNode
        v-for="child in node.children"
        :key="child.type + ':' + child.relPath"
        :node="child"
        :level="level + 1"
        :selected-rel-path="selectedRelPath"
        :expanded="expanded"
        :enable-dn-d="enableDnD"
        :show-remove-button="showRemoveButton"
        @toggle="$emit('toggle', $event)"
        @select="$emit('select', $event)"
        @remove="$emit('remove', $event)"
        @move="$emit('move', $event)"
      />
    </ul>
  </li>
</template>

<style scoped lang="scss">
.node {
  list-style: none;
  min-width: fit-content;
  width: max-content;
}

.row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s;
  min-width: fit-content;

  &:hover {
    background: var(--color-bg-hover);
  }

  &.selected {
    background: rgba(59, 130, 246, 0.12);
  }
}

.twisty {
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 0;
  border-radius: var(--radius-sm);
  flex-shrink: 0;

  &:hover {
    background: rgba(255, 255, 255, 0.06);
    color: var(--color-text-primary);
  }

  &.placeholder {
    cursor: default;
    pointer-events: none;
  }
}

.icon {
  width: 16px;
  display: inline-flex;
  justify-content: center;
  font-size: 14px;
  flex-shrink: 0;
}

.name {
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-text-primary);
  min-width: 0;
}

.remove {
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  border-radius: var(--radius-sm);
  font-size: 16px;
  line-height: 1;

  &:hover {
    color: var(--color-danger);
    background: rgba(239, 68, 68, 0.1);
  }
}

.children {
  list-style: none;
  margin: 0;
  padding: 0;
}
</style>


