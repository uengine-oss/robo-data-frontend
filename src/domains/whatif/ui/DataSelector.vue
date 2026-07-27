<template>
  <div class="data-selector">
    <h3 class="section-title">📂 데이터 선택 및 수집</h3>
    
    <!-- 발견된 테이블 목록 -->
    <div v-if="discoveryResult && discoveryResult.tables.length > 0" class="discovered-tables">
      <h4 class="subsection-title">발견된 테이블</h4>
      <div class="table-grid">
        <label
          v-for="table in discoveryResult.tables" 
          :key="table.table_name"
          class="table-card"
          :class="{ selected: selectedTables.includes(table.table_name) }"
        >
          <div class="table-header">
            <input 
              type="checkbox" 
              :checked="selectedTables.includes(table.table_name)"
              :aria-label="`${table.table_name} 테이블 선택`"
              @change="toggleTable(table.table_name)"
            />
            <span class="table-name">{{ table.table_name }}</span>
            <span class="relevance-badge">{{ (table.relevance_score * 100).toFixed(0) }}%</span>
          </div>
          <div class="table-meta">
            <span>{{ table.columns.length }} 컬럼</span>
            <span>{{ table.row_count.toLocaleString() }} 행</span>
          </div>
          <div class="table-columns">
            <span 
              v-for="col in table.columns.slice(0, 5)" 
              :key="col"
              class="column-tag"
            >
              {{ col }}
            </span>
            <span v-if="table.columns.length > 5" class="more-columns">
              +{{ table.columns.length - 5 }}
            </span>
          </div>
        </label>
      </div>
    </div>
    
    <!-- SQL 편집기 -->
    <div class="sql-editor">
      <h4 class="subsection-title">SQL 쿼리</h4>
      <div class="editor-container">
        <textarea
          v-model="localSql"
          @input="$emit('update:customSql', localSql)"
          class="sql-textarea"
          rows="6"
          placeholder="SELECT * FROM table_name LIMIT 1000"
        ></textarea>
        <button 
          class="run-sql-btn"
          :disabled="!localSql.trim() || loading"
          @click="$emit('collect', localSql)"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z"/>
          </svg>
          실행
        </button>
      </div>
    </div>
    
    <!-- 파일 업로드 -->
    <div class="file-upload">
      <h4 class="subsection-title">또는 파일 업로드</h4>
      <input
        ref="fileInput"
        class="file-input"
        type="file"
        accept=".csv,.xlsx"
        @change="handleFileSelect"
      />
      <button
        type="button"
        class="dropzone"
        :class="{ dragover: isDragging }"
        :disabled="loading"
        :aria-busy="loading"
        aria-describedby="whatif-file-requirements"
        @drop.prevent="handleDrop"
        @dragover.prevent="handleDragOver"
        @dragleave="isDragging = false"
        @click="triggerFileInput"
      >
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
        </svg>
        <span id="whatif-file-requirements">CSV 또는 Excel 파일을 드래그하거나 클릭하여 선택</span>
      </button>
      <div v-if="fileError" class="file-error" role="alert">
        {{ fileError }}
      </div>
      <div v-if="selectedFile" class="selected-file" role="status">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/>
        </svg>
        <span>선택된 파일: {{ selectedFile.name }}</span>
        <button
          type="button"
          class="retry-upload-btn"
          :disabled="loading"
          @click="uploadSelectedFile"
        >
          다시 업로드
        </button>
      </div>
    </div>
    
    <!-- 로딩 -->
    <div v-if="loading" class="loading-overlay">
      <div class="loading-content">
        <div class="loading-spinner"></div>
        <span>데이터 수집 중...</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { DataDiscoveryResult } from '../model/contracts'

const props = defineProps<{
  discoveryResult: DataDiscoveryResult | null
  sessionId: string | null
  selectedTables: string[]
  customSql: string
  loading: boolean
}>()

const emit = defineEmits<{
  (e: 'update:selectedTables', value: string[]): void
  (e: 'update:customSql', value: string): void
  (e: 'collect', sql: string): void
  (e: 'upload', file: File): void
}>()

const localSql = ref(props.customSql)
const fileInput = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)
const selectedFile = ref<File | null>(null)
const fileError = ref<string | null>(null)

watch(() => props.customSql, (newVal) => {
  localSql.value = newVal
})

function toggleTable(tableName: string) {
  const current = [...props.selectedTables]
  const index = current.indexOf(tableName)
  
  if (index === -1) {
    current.push(tableName)
  } else {
    current.splice(index, 1)
  }
  
  emit('update:selectedTables', current)
  
  // SQL 자동 생성
  if (current.length > 0) {
    localSql.value = current.map(t => `SELECT * FROM ${t}`).join(' UNION ALL ') + ' LIMIT 1000'
    emit('update:customSql', localSql.value)
  }
}

function triggerFileInput() {
  if (!fileInput.value || props.loading) return
  fileInput.value.value = ''
  fileInput.value.click()
}

function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    selectFile(input.files[0])
  }
}

function handleDrop(event: DragEvent) {
  isDragging.value = false
  if (props.loading) return
  const files = event.dataTransfer?.files
  if (files && files.length > 0) {
    selectFile(files[0])
  }
}

function handleDragOver() {
  if (!props.loading) isDragging.value = true
}

function selectFile(file: File) {
  if (!/\.(?:csv|xlsx)$/i.test(file.name)) {
    fileError.value = 'CSV 또는 Excel(.xlsx) 파일만 선택할 수 있습니다.'
    return
  }

  fileError.value = null
  selectedFile.value = file
  emit('upload', file)
}

function uploadSelectedFile() {
  if (!selectedFile.value || props.loading) return
  fileError.value = null
  emit('upload', selectedFile.value)
}
</script>

<style scoped>
.data-selector {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.section-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-accent);
  margin: 0;
}

.subsection-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-text-bright);
  margin: 0 0 0.875rem 0;
}

/* 테이블 그리드 */
.table-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 0.875rem;
}

.table-card {
  padding: 0.875rem;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.table-card:hover {
  border-color: var(--color-accent);
}

.table-card:focus-within {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.table-card.selected {
  background: var(--color-bg-elevated);
  border-color: var(--color-accent);
  box-shadow: 0 0 0 1px var(--color-accent);
}

.table-header {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.6rem;
}

.table-header input[type="checkbox"] {
  accent-color: var(--color-accent);
  width: 16px;
  height: 16px;
}

.table-name {
  flex: 1;
  font-weight: 600;
  color: var(--color-text-bright);
  font-size: 0.9rem;
}

.relevance-badge {
  padding: 0.15rem 0.5rem;
  background: rgba(16, 185, 129, 0.15);
  border-radius: 10px;
  font-size: 0.7rem;
  font-weight: 600;
  color: #10b981;
}

.table-meta {
  display: flex;
  gap: 0.875rem;
  font-size: 0.75rem;
  color: var(--color-text-muted);
  margin-bottom: 0.6rem;
}

.table-columns {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.column-tag {
  padding: 0.15rem 0.4rem;
  background: var(--color-bg-hover);
  border-radius: 4px;
  font-size: 0.7rem;
  color: var(--color-text-light);
}

.more-columns {
  color: var(--color-text-muted);
  font-size: 0.7rem;
}

/* SQL 편집기 */
.editor-container {
  position: relative;
}

.sql-textarea {
  width: 100%;
  padding: 0.875rem;
  padding-right: 4.5rem;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: #10b981;
  font-family: var(--font-mono);
  font-size: 0.85rem;
  line-height: 1.5;
  resize: vertical;
}

.sql-textarea:focus {
  outline: none;
  border-color: var(--color-accent);
}

.run-sql-btn {
  position: absolute;
  right: 0.6rem;
  top: 0.6rem;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.875rem;
  background: #10b981;
  border: none;
  border-radius: 6px;
  color: white;
  font-family: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.run-sql-btn:hover:not(:disabled) {
  background: #059669;
}

.run-sql-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.run-sql-btn svg {
  width: 14px;
  height: 14px;
}

/* 파일 업로드 */
.file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.dropzone {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 1.5rem;
  background: var(--color-bg-tertiary);
  border: 2px dashed var(--color-border);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  color: inherit;
  font-family: inherit;
}

.dropzone:hover,
.dropzone.dragover {
  border-color: var(--color-accent);
  background: var(--color-bg-elevated);
}

.dropzone:focus-visible,
.retry-upload-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.dropzone:disabled {
  cursor: wait;
  opacity: 0.65;
}

.dropzone svg {
  width: 32px;
  height: 32px;
  color: var(--color-text-muted);
}

.dropzone span {
  color: var(--color-text-light);
  font-size: 0.85rem;
}

.selected-file {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.75rem;
  color: var(--color-text-light);
  font-size: 0.85rem;
}

.selected-file svg {
  width: 18px;
  height: 18px;
  color: #10b981;
}

.selected-file span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.retry-upload-btn {
  margin-left: auto;
  padding: 0.35rem 0.65rem;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text-bright);
  background: var(--color-bg-tertiary);
  font: inherit;
  cursor: pointer;
}

.retry-upload-btn:disabled {
  cursor: wait;
  opacity: 0.6;
}

.file-error {
  margin-top: 0.6rem;
  color: #fca5a5;
  font-size: 0.8rem;
}

/* 로딩 */
.loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(26, 27, 30, 0.85);
  border-radius: 12px;
}

.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.875rem;
}

.loading-spinner {
  width: 36px;
  height: 36px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
