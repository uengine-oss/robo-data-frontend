<script setup lang="ts">
import { ref } from 'vue'

interface FileItem {
  fileName: string
  fileContent?: string
}

interface Props {
  files: FileItem[]
}

defineProps<Props>()

const emit = defineEmits<{
  select: [file: FileItem]
}>()

const selectedIndex = ref<number | null>(null)

const handleSelect = (file: FileItem, index: number) => {
  selectedIndex.value = index
  emit('select', file)
}

const getFileIcon = (fileName: string): string => {
  const ext = fileName.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'java': return '☕'
    case 'py': return '🐍'
    case 'c': case 'h': return '⚙️'
    case 'sql': return '📝'  // 문서 형태 아이콘
    case 'xml': return '📋'
    case 'json': return '📊'
    case 'properties': return '⚙️'
    default: return '📄'
  }
}
</script>

<template>
  <div class="file-list">
    <button 
      v-for="(file, index) in files" 
      :key="index"
      class="file-item"
      :class="{ selected: selectedIndex === index }"
      @click="handleSelect(file, index)"
    >
      <span class="file-icon">{{ getFileIcon(file.fileName) }}</span>
      <span class="file-info">
        <span class="file-name" :title="file.fileName">{{ file.fileName }}</span>
      </span>
    </button>
  </div>
</template>

<style lang="scss" scoped>
.file-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.file-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  text-align: left;
  transition: all var(--transition-fast);
  
  &:hover {
    background: var(--color-bg-elevated);
  }
  
  &.selected {
    background: rgba(59, 130, 246, 0.1);
    
    .file-name {
      color: var(--color-accent-primary);
    }
  }
}

.file-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.file-info {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.file-name {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

</style>

