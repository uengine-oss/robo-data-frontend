<script setup lang="ts">
import { logger } from '@/shared/utils/logger'
import { ref } from 'vue'
import { IconUpload } from '@/shared/icons'

const emit = defineEmits<{
  'files-drop': [files: File[]]
  'open-modal': []
}>()

const isDragOver = ref(false)

const handleDragOver = (e: DragEvent) => {
  e.preventDefault()
  isDragOver.value = true
}

const handleDragLeave = () => {
  isDragOver.value = false
}

// 시스템/숨김 파일 필터링
const IGNORED_FILES = ['.DS_Store', 'Thumbs.db', 'desktop.ini', '.gitignore', '.gitkeep']
const IGNORED_FOLDERS = ['__MACOSX', '.git', 'node_modules', '.idea', '.vscode']

const shouldIgnoreFile = (filePath: string): boolean => {
  const parts = filePath.split('/')
  const fileName = parts[parts.length - 1] || ''
  
  // 숨김 파일 (점으로 시작) - 단, .sql 등 확장자만 있는 경우는 제외
  if (fileName.startsWith('.') && !fileName.match(/^\.[a-z]+$/i)) {
    return true
  }
  
  // 특정 파일명
  if (IGNORED_FILES.includes(fileName)) {
    return true
  }
  
  // 특정 폴더 내 파일
  for (const folder of IGNORED_FOLDERS) {
    if (parts.includes(folder)) {
      return true
    }
  }
  
  return false
}

const handleDrop = async (e: DragEvent) => {
  e.preventDefault()
  isDragOver.value = false
  
  const files: File[] = []
  
  if (e.dataTransfer?.items) {
    const items = Array.from(e.dataTransfer.items)
    
    for (const item of items) {
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry?.()
        if (entry) {
          const entryFiles = await readEntry(entry)
          files.push(...entryFiles)
        } else {
          const file = item.getAsFile()
          if (file) files.push(file)
        }
      }
    }
  } else if (e.dataTransfer?.files) {
    files.push(...Array.from(e.dataTransfer.files))
  }
  
  // 시스템/숨김 파일 필터링
  const filteredFiles = files.filter(f => {
    const filePath = f.webkitRelativePath || f.name
    return !shouldIgnoreFile(filePath)
  })
  
  if (filteredFiles.length > 0) {
    logger.debug(`[DropZone] ${files.length}개 중 ${filteredFiles.length}개 파일 (${files.length - filteredFiles.length}개 시스템 파일 제외)`)
    emit('files-drop', filteredFiles)
  }
}

const readEntry = (entry: FileSystemEntry): Promise<File[]> => {
  return new Promise((resolve) => {
    if (entry.isFile) {
      (entry as FileSystemFileEntry).file(
        (file) => {
          Object.defineProperty(file, 'webkitRelativePath', {
            value: entry.fullPath.slice(1),
            writable: true,
            configurable: true  // 재정의 가능하도록 설정
          })
          resolve([file])
        },
        () => resolve([])
      )
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader()
      const files: File[] = []
      
      const readEntries = () => {
        reader.readEntries(async (entries) => {
          if (entries.length === 0) {
            resolve(files)
          } else {
            for (const subEntry of entries) {
              const subFiles = await readEntry(subEntry)
              files.push(...subFiles)
            }
            readEntries()
          }
        }, () => resolve(files))
      }
      
      readEntries()
    } else {
      resolve([])
    }
  })
}

const handleClick = () => {
  emit('open-modal')
}
</script>

<template>
  <div 
    class="drop-zone"
    :class="{ 'drag-over': isDragOver }"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
    @click="handleClick"
  >
    <div class="drop-content">
      <div class="drop-icon">
        <IconUpload :size="56" :stroke-width="1.5" />
      </div>
      <p class="drop-text">
        프로젝트 폴더를 <strong>드래그</strong>하거나<br>
        이 영역을 <strong>클릭</strong>하여 업로드 설정
      </p>
      <p class="drop-hint">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>
        파일 내용을 분석하여 소스 타입 자동 감지
      </p>
      <div class="drop-formats">
        <span>.java</span>
        <span>.sql</span>
        <span>.py</span>
        <span>.xml</span>
      </div>
    </div>
    
    <div class="drop-overlay">
      <IconUpload :size="48" :stroke-width="1.5" />
      <span>여기에 놓으세요</span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.drop-zone {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-xl);
  background: var(--color-bg-secondary);
  border: 2px dashed var(--color-border);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all var(--transition-normal);
  box-shadow: var(--shadow-sm);
  
  &:hover {
    border-color: var(--color-accent);
    background: linear-gradient(
      135deg,
      rgba(34, 139, 230, 0.08) 0%,
      rgba(34, 139, 230, 0.02) 100%
    );
    box-shadow: var(--shadow-md);
    
    .drop-icon {
      color: var(--color-accent);
      transform: translateY(-4px);
    }
  }
  
  &.drag-over {
    border-color: var(--color-accent);
    border-style: solid;
    background: rgba(34, 139, 230, 0.12);
    
    .drop-overlay {
      opacity: 1;
    }
    
    .drop-content {
      opacity: 0;
    }
  }
}

.drop-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  transition: opacity var(--transition-fast);
}

.drop-icon {
  color: var(--color-text-muted);
  margin-bottom: var(--spacing-lg);
  transition: all var(--transition-normal);
}

.drop-text {
  font-size: 15px;
  line-height: 1.6;
  color: var(--color-text-light);
  margin-bottom: var(--spacing-sm);
  
  strong {
    color: var(--color-text-bright);
    font-weight: 600;
  }
}

.drop-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--color-success);
  margin-bottom: var(--spacing-lg);
  
  svg {
    color: var(--color-warning);
  }
}

.drop-formats {
  display: flex;
  gap: var(--spacing-sm);
  
  span {
    padding: 4px 10px;
    font-size: 12px;
    font-family: var(--font-mono);
    color: var(--color-text-light);
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    transition: all var(--transition-fast);
    
    &:hover {
      border-color: var(--color-accent);
      color: var(--color-accent);
    }
  }
}

.drop-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-md);
  color: var(--color-accent);
  background: rgba(34, 139, 230, 0.12);
  border-radius: var(--radius-lg);
  opacity: 0;
  transition: opacity var(--transition-fast);
  pointer-events: none;
  
  span {
    font-size: 16px;
    font-weight: 600;
  }
}
</style>
