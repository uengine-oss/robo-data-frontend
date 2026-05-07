<template>
  <div class="mermaid-er-view">
    <!-- Toolbar -->
    <div class="toolbar">
      <div class="toolbar-left">
        <h3>
          <span class="icon">📊</span>
          Mermaid ER Diagram
        </h3>
        <span class="table-count">{{ store.allTables.length }}개 테이블</span>
      </div>
      
      <div class="toolbar-controls">
        <div class="search-wrapper">
          <input 
            v-model="searchQuery"
            @input="debouncedRender"
            type="text" 
            placeholder="테이블 검색..."
            class="search-input"
          />
          <button v-if="searchQuery" class="clear-btn" @click="clearSearch">×</button>
        </div>
        
        <div class="filter-group">
          <label class="checkbox-label">
            <input 
              type="checkbox" 
              v-model="showRelationsOnly"
              @change="renderDiagram"
            />
            <span>연결된 테이블만</span>
          </label>
          
          <select v-model="maxTables" @change="renderDiagram" class="table-limit-select">
            <option :value="20">최대 20개</option>
            <option :value="50">최대 50개</option>
            <option :value="100">최대 100개</option>
            <option :value="999">전체</option>
          </select>
        </div>
        
        <button @click="renderDiagram" class="btn btn--primary btn--sm" :disabled="isRendering">
          {{ isRendering ? '렌더링...' : '🔄 새로고침' }}
        </button>
        
        <button @click="downloadSvg" class="btn btn--secondary btn--sm" :disabled="!hasDiagram">
          💾 SVG 다운로드
        </button>
      </div>
    </div>
    
    <!-- Diagram Container -->
    <div class="diagram-wrapper" ref="diagramWrapperRef">
      <div v-if="isRendering" class="loading-state">
        <div class="spinner"></div>
        <p>ER 다이어그램 생성 중...</p>
      </div>
      
      <div v-else-if="store.allTables.length === 0" class="empty-state">
        <div class="empty-icon">📭</div>
        <h3>테이블 데이터가 없습니다</h3>
        <p>스키마 데이터 소스를 선택하고 데이터를 로드해주세요</p>
      </div>
      
      <div v-else-if="!hasDiagram && !isRendering" class="empty-state">
        <div class="empty-icon">📊</div>
        <h3>ER 다이어그램을 생성하세요</h3>
        <p>🔄 새로고침 버튼을 클릭하면 다이어그램이 생성됩니다</p>
      </div>
      
      <div 
        ref="diagramEl" 
        class="diagram-container"
        :class="{ hidden: !hasDiagram || isRendering }"
      ></div>
    </div>
    
    <!-- Info Panel -->
    <div class="info-panel" v-if="diagramStats">
      <div class="stat-item">
        <span class="stat-label">테이블</span>
        <span class="stat-value">{{ diagramStats.tables }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">관계</span>
        <span class="stat-value">{{ diagramStats.relationships }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">컬럼</span>
        <span class="stat-value">{{ diagramStats.columns }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { logger } from '@/utils/logger'
import mermaid from 'mermaid'
import { ref, onMounted, watch, nextTick } from 'vue'
import { useSchemaCanvasStore } from '@/stores/schemaCanvas'
import type { Text2SqlColumnInfo } from '@/types'

const props = defineProps<{
  isActive?: boolean
}>()

const store = useSchemaCanvasStore()

const diagramEl = ref<HTMLElement | null>(null)
const diagramWrapperRef = ref<HTMLElement | null>(null)
const searchQuery = ref('')
const showRelationsOnly = ref(false)
const maxTables = ref(50)
const isRendering = ref(false)
const hasDiagram = ref(false)
const diagramStats = ref<{ tables: number; relationships: number; columns: number } | null>(null)
const isMermaidInitialized = ref(false)

// Mermaid 초기화
onMounted(() => {
  mermaid.initialize({ 
    startOnLoad: false,
    theme: 'dark',
    er: {
      layoutDirection: 'TB',
      minEntityWidth: 100,
      minEntityHeight: 75,
      entityPadding: 15,
      useMaxWidth: false
    },
    themeVariables: {
      primaryColor: '#228be6',
      primaryTextColor: '#e9ecef',
      primaryBorderColor: '#373a40',
      lineColor: '#868e96',
      secondaryColor: '#373a40',
      tertiaryColor: '#25262b'
    }
  })
  isMermaidInitialized.value = true
})

// 탭이 활성화되면 렌더링
watch(() => props.isActive, async (active) => {
  if (active && isMermaidInitialized.value && store.allTables.length > 0) {
    await nextTick()
    // 약간의 딜레이를 주어 DOM이 완전히 표시된 후 렌더링
    setTimeout(() => {
      renderDiagram()
    }, 100)
  }
}, { immediate: true })

// 테이블 데이터가 변경되면 다이어그램 다시 렌더링 (활성화된 경우에만)
watch(() => store.allTables, () => {
  if (props.isActive && store.allTables.length > 0 && isMermaidInitialized.value) {
    renderDiagram()
  }
}, { deep: true })

let debounceTimer: ReturnType<typeof setTimeout> | null = null

function debouncedRender() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    renderDiagram()
  }, 300)
}

function clearSearch() {
  searchQuery.value = ''
  renderDiagram()
}

async function renderDiagram() {
  if (!diagramEl.value || store.allTables.length === 0) {
    hasDiagram.value = false
    return
  }
  
  isRendering.value = true
  
  try {
    // 테이블 필터링
    let tables = [...store.allTables]
    
    // 검색 필터
    if (searchQuery.value.trim()) {
      const query = searchQuery.value.toLowerCase()
      tables = tables.filter(t => 
        t.name.toLowerCase().includes(query) ||
        (t.description && t.description.toLowerCase().includes(query))
      )
    }
    
    // 연결된 테이블만 표시
    if (showRelationsOnly.value) {
      tables = await getConnectedTables(tables)
    }
    
    // 최대 테이블 수 제한
    tables = tables.slice(0, maxTables.value)
    
    if (tables.length === 0) {
      diagramEl.value.innerHTML = '<div class="no-data">표시할 테이블이 없습니다.</div>'
      hasDiagram.value = false
      diagramStats.value = null
      return
    }
    
    // 컬럼 데이터 로드
    const allColumnsMap: Record<string, Text2SqlColumnInfo[]> = {}
    for (const table of tables) {
      const columns = await store.loadTableColumns(table.name, table.schema)
      allColumnsMap[table.name] = columns
    }
    
    // Mermaid 코드 생성
    const { code, stats } = generateMermaidER(tables, allColumnsMap)
    diagramStats.value = stats
    
    // 렌더링
    diagramEl.value.innerHTML = ''
    const uniqueId = `er-${Date.now()}`
    const { svg } = await mermaid.render(uniqueId, code)
    diagramEl.value.innerHTML = svg
    hasDiagram.value = true
    
  } catch (err) {
    logger.error('Mermaid render error:', err)
    if (diagramEl.value) {
      diagramEl.value.innerHTML = `
        <div class="error-state">
          <p>다이어그램 렌더링 중 오류가 발생했습니다.</p>
          <pre>${err}</pre>
        </div>
      `
    }
    hasDiagram.value = false
  } finally {
    isRendering.value = false
  }
}

async function getConnectedTables(searchTables: typeof store.allTables) {
  const connectedTableNames = new Set<string>()
  const allTables = store.allTables
  
  // 초기 테이블 추가
  searchTables.forEach(t => connectedTableNames.add(t.name))
  
  // 관계가 있는 테이블 찾기
  for (const table of searchTables) {
    const columns = await store.loadTableColumns(table.name, table.schema)
    
    for (const col of columns) {
      if (col.name.endsWith('_id') && col.name !== 'id') {
        const baseName = col.name.replace(/_id$/, '')
        const possibleRefs = [baseName, baseName + 's', baseName.replace(/s$/, '')]
        const refTable = allTables.find(t => 
          possibleRefs.includes(t.name.toLowerCase())
        )
        if (refTable) {
          connectedTableNames.add(refTable.name)
        }
      }
    }
  }
  
  // 역방향 관계도 찾기
  for (const otherTable of allTables) {
    const otherColumns = await store.loadTableColumns(otherTable.name, otherTable.schema)
    
    for (const col of otherColumns) {
      if (col.name.endsWith('_id') && col.name !== 'id') {
        const baseName = col.name.replace(/_id$/, '')
        const possibleRefs = [baseName, baseName + 's', baseName.replace(/s$/, '')]
        
        for (const searchTable of searchTables) {
          if (possibleRefs.includes(searchTable.name.toLowerCase())) {
            connectedTableNames.add(otherTable.name)
            break
          }
        }
      }
    }
  }
  
  return allTables.filter(t => connectedTableNames.has(t.name))
}

function generateMermaidER(
  tables: typeof store.allTables, 
  allColumns: Record<string, Text2SqlColumnInfo[]>
): { code: string; stats: { tables: number; relationships: number; columns: number } } {
  let code = 'erDiagram\n'
  const relationships: string[] = []
  let totalColumns = 0
  
  // 테이블 정의
  for (const table of tables) {
    const columns = allColumns[table.name] || []
    totalColumns += columns.length
    
    // 테이블명 정규화 (특수문자 제거)
    const safeName = table.name.replace(/[^a-zA-Z0-9_]/g, '_')
    
    code += `    ${safeName} {\n`
    
    // 컬럼 추가 (최대 8개까지만 표시)
    const displayColumns = columns.slice(0, 8)
    
    for (const col of displayColumns) {
      // 타입 매핑
      let safeType = 'string'
      const dtype = (col.dtype || 'varchar').toLowerCase()
      
      if (dtype.includes('int') || dtype.includes('serial')) {
        safeType = 'int'
      } else if (dtype.includes('decimal') || dtype.includes('numeric') || dtype.includes('float') || dtype.includes('double')) {
        safeType = 'float'
      } else if (dtype.includes('date') || dtype.includes('time') || dtype.includes('timestamp')) {
        safeType = 'datetime'
      } else if (dtype.includes('bool')) {
        safeType = 'boolean'
      } else if (dtype.includes('text') || dtype.includes('clob')) {
        safeType = 'text'
      }
      
      // 컬럼명 정규화
      const safeColName = col.name
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .toLowerCase()
        .substring(0, 20)
      
      // PK/FK 표시
      let modifier = ''
      if (col.name === 'id' || col.name.toLowerCase().endsWith('_pk')) {
        modifier = ' PK'
      } else if (col.name.endsWith('_id')) {
        modifier = ' FK'
      }
      
      code += `        ${safeType} ${safeColName}${modifier}\n`
    }
    
    if (columns.length > 8) {
      code += `        string _more_${columns.length - 8}_cols\n`
    }
    
    code += `    }\n`
  }
  
  // 관계 추출
  const tableNames = new Set(tables.map(t => t.name))
  
  for (const table of tables) {
    const columns = allColumns[table.name] || []
    const safeName = table.name.replace(/[^a-zA-Z0-9_]/g, '_')
    
    for (const col of columns) {
      if (col.name.endsWith('_id') && col.name !== 'id') {
        const baseName = col.name.replace(/_id$/, '')
        const possibleRefs = [baseName, baseName + 's', baseName.replace(/s$/, '')]
        
        for (const refName of possibleRefs) {
          if (tableNames.has(refName)) {
            const safeRefName = refName.replace(/[^a-zA-Z0-9_]/g, '_')
            const relString = `    ${safeRefName} ||--o{ ${safeName} : "${baseName}"`
            
            if (!relationships.includes(relString)) {
              relationships.push(relString)
            }
            break
          }
        }
      }
    }
  }
  
  // 관계 추가
  for (const rel of relationships) {
    code += rel + '\n'
  }
  
  return {
    code,
    stats: {
      tables: tables.length,
      relationships: relationships.length,
      columns: totalColumns
    }
  }
}

function downloadSvg() {
  if (!diagramEl.value) return
  
  const svg = diagramEl.value.querySelector('svg')
  if (!svg) return
  
  const svgData = new XMLSerializer().serializeToString(svg)
  const blob = new Blob([svgData], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  
  const a = document.createElement('a')
  a.href = url
  a.download = `er-diagram-${new Date().toISOString().slice(0, 10)}.svg`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
</script>

<style scoped lang="scss">
.mermaid-er-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: var(--color-bg);
  overflow: hidden;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
  gap: 16px;
  flex-wrap: wrap;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
  
  h3 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text-bright);
    
    .icon {
      font-size: 16px;
    }
  }
}

.table-count {
  font-size: 12px;
  color: var(--color-text-muted);
  background: var(--color-bg-tertiary);
  padding: 4px 10px;
  border-radius: 12px;
}

.toolbar-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.search-wrapper {
  position: relative;
  
  .search-input {
    width: 180px;
    padding: 8px 30px 8px 12px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: 13px;
    background: var(--color-bg);
    color: var(--color-text);
    transition: all 0.15s;
    
    &::placeholder {
      color: var(--color-text-muted);
    }
    
    &:focus {
      outline: none;
      border-color: var(--color-accent);
      box-shadow: 0 0 0 3px rgba(34, 139, 230, 0.15);
    }
  }
  
  .clear-btn {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    
    &:hover {
      color: var(--color-text-bright);
    }
  }
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--color-text-light);
  cursor: pointer;
  
  input[type="checkbox"] {
    accent-color: var(--color-accent);
    width: 14px;
    height: 14px;
  }
}

.table-limit-select {
  padding: 6px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  color: var(--color-text);
  font-size: 12px;
  cursor: pointer;
  
  &:focus {
    outline: none;
    border-color: var(--color-accent);
  }
}

.diagram-wrapper {
  flex: 1;
  position: relative;
  overflow: auto;
  background: 
    radial-gradient(circle at 50% 50%, rgba(34, 139, 230, 0.03) 0%, transparent 50%),
    var(--color-bg-tertiary);
}

.diagram-container {
  min-height: 100%;
  padding: 24px;
  display: flex;
  justify-content: center;
  
  &.hidden {
    display: none;
  }
  
  :deep(svg) {
    max-width: 100%;
    height: auto;
  }
}

.loading-state {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  color: var(--color-text-muted);
  
  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--color-border);
    border-top-color: var(--color-accent);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.empty-state {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: var(--color-text-muted);
  
  .empty-icon {
    font-size: 64px;
    margin-bottom: 16px;
    opacity: 0.5;
  }
  
  h3 {
    font-size: 18px;
    color: var(--color-text-light);
    margin: 0 0 8px 0;
  }
  
  p {
    font-size: 14px;
    margin: 0;
  }
}

.error-state {
  padding: 24px;
  text-align: center;
  color: var(--color-error);
  
  pre {
    text-align: left;
    font-size: 12px;
    background: var(--color-bg);
    padding: 12px;
    border-radius: var(--radius-md);
    overflow-x: auto;
    margin-top: 12px;
  }
}

.no-data {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: var(--color-text-muted);
  font-style: italic;
}

.info-panel {
  display: flex;
  justify-content: center;
  gap: 32px;
  padding: 12px 16px;
  background: var(--color-bg-secondary);
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stat-label {
  font-size: 12px;
  color: var(--color-text-muted);
}

.stat-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-accent);
}
</style>

