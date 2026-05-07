<template>
  <div class="er-diagram">
    <div class="toolbar">
      <h3>
        <IconLayers :size="16" />
        ER Diagram
      </h3>
      <div class="toolbar-controls">
        <div class="search-controls">
          <div class="search-wrapper">
            <IconSearch :size="14" class="search-icon" />
            <input 
              v-model="searchQuery"
              @input="handleSearch"
              type="text" 
              placeholder="테이블 검색..."
              class="search-input"
            />
          </div>
          <button @click="clearSearch" class="btn btn--danger btn--sm">지우기</button>
        </div>
        <div class="filter-controls">
          <label class="filter-label">
            <input 
              type="checkbox" 
              v-model="showConnectedOnly"
              @change="updateDiagram"
            />
            연결된 테이블만 표시
          </label>
          <span class="table-count">{{ filteredTables.length }}개 테이블</span>
        </div>
        <button @click="refreshDiagram" class="btn btn--primary btn--sm">
          <IconRefresh :size="14" />
          새로고침
        </button>
      </div>
    </div>
    <div ref="diagramEl" class="diagram-container"></div>
  </div>
</template>

<script setup lang="ts">
import { logger } from '@/utils/logger'
import mermaid from 'mermaid'
import { computed, onMounted, ref, watch } from 'vue'
import type { Text2SqlTableInfo, Text2SqlColumnInfo } from '@/types'
import { IconLayers, IconSearch, IconRefresh } from '@/components/icons'

const props = defineProps<{
  tables: Text2SqlTableInfo[]
  allColumns: Record<string, Text2SqlColumnInfo[]>
}>()

const diagramEl = ref<HTMLElement | null>(null)
const searchQuery = ref('')
const showConnectedOnly = ref(true)

const filteredTables = computed(() => {
  let tables = props.tables
  
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase()
    tables = tables.filter(table => 
      table.name.toLowerCase().includes(query) ||
      (table.description && table.description.toLowerCase().includes(query))
    )
  }
  
  if (showConnectedOnly.value && tables.length > 0) {
    const connectedTables = getConnectedTables(tables)
    return connectedTables
  }
  
  return tables.slice(0, 20)
})

onMounted(() => {
  mermaid.initialize({ 
    startOnLoad: false,
    theme: 'dark',
    er: {
      layoutDirection: 'TB'
    }
  })
  renderDiagram()
})

watch(() => [filteredTables.value, props.allColumns], () => {
  renderDiagram()
}, { deep: true })

async function renderDiagram() {
  if (!diagramEl.value || filteredTables.value.length === 0) {
    if (diagramEl.value) {
      diagramEl.value.innerHTML = '<div class="no-data">표시할 테이블이 없습니다.</div>'
    }
    return
  }
  
  const mermaidCode = generateMermaidER()
  
  try {
    diagramEl.value.innerHTML = ''
    const { svg } = await mermaid.render('er-diagram', mermaidCode)
    diagramEl.value.innerHTML = svg
  } catch (err) {
    logger.error('Mermaid render error:', err)
    diagramEl.value.innerHTML = `<pre style="color: var(--color-error); padding: 1rem;">${err}</pre>`
  }
}

function getConnectedTables(searchTables: Text2SqlTableInfo[]): Text2SqlTableInfo[] {
  const connectedTables = new Set<string>()
  const allTables = props.tables
  
  searchTables.forEach(table => connectedTables.add(table.name))
  
  searchTables.forEach(table => {
    const columns = props.allColumns[table.name] || []
    
    columns.forEach(col => {
      if (col.name.endsWith('_id') && col.name !== 'id') {
        const baseName = col.name.replace(/_id$/, '')
        const possibleRefs = [baseName + 's', baseName, baseName.replace(/s$/, '')]
        const refTable = allTables.find(t => possibleRefs.includes(t.name))
        if (refTable) {
          connectedTables.add(refTable.name)
        }
      }
    })
    
    allTables.forEach(otherTable => {
      if (otherTable.name === table.name) return
      
      const otherColumns = props.allColumns[otherTable.name] || []
      otherColumns.forEach(col => {
        if (col.name.endsWith('_id') && col.name !== 'id') {
          const baseName = col.name.replace(/_id$/, '')
          const possibleRefs = [baseName + 's', baseName, baseName.replace(/s$/, '')]
          if (possibleRefs.includes(table.name)) {
            connectedTables.add(otherTable.name)
          }
        }
      })
    })
  })
  
  return Array.from(connectedTables)
    .map(tableName => allTables.find(t => t.name === tableName))
    .filter(Boolean)
    .slice(0, 15) as Text2SqlTableInfo[]
}

function generateMermaidER(): string {
  let code = 'erDiagram\n'
  const tablesToRender = filteredTables.value
  
  tablesToRender.forEach(table => {
    const columns = props.allColumns[table.name] || []
    
    code += `    ${table.name} {\n`
    
    const displayColumns = columns.slice(0, 5)
    
    displayColumns.forEach(col => {
      let safeType = 'string'
      const dtype = col.dtype.toLowerCase()
      if (dtype.includes('int') || dtype.includes('serial')) {
        safeType = 'int'
      } else if (dtype.includes('decimal') || dtype.includes('numeric') || dtype.includes('float')) {
        safeType = 'float'
      } else if (dtype.includes('date') || dtype.includes('time')) {
        safeType = 'datetime'
      } else if (dtype.includes('bool')) {
        safeType = 'boolean'
      }
      
      const safeName = col.name
        .replace(/[^a-zA-Z0-9]/g, '_')
        .toLowerCase()
        .substring(0, 15)
      
      code += `        ${safeType} ${safeName}\n`
    })
    
    if (columns.length > 5) {
      code += `        string more_columns\n`
    }
    
    code += `    }\n`
  })
  
  const relationships: string[] = []
  
  tablesToRender.forEach(table => {
    const columns = props.allColumns[table.name] || []
    
    columns.forEach(col => {
      if (col.name.endsWith('_id') && col.name !== 'id') {
        const baseName = col.name.replace(/_id$/, '')
        const possibleRefs = [baseName + 's', baseName, baseName.replace(/s$/, '')]
        const refTable = tablesToRender.find(t => possibleRefs.includes(t.name))
        if (refTable) {
          const relString = `    ${refTable.name} ||--o{ ${table.name} : "${baseName}"`
          if (!relationships.includes(relString)) {
            relationships.push(relString)
          }
        }
      }
    })
  })
  
  relationships.slice(0, 8).forEach(rel => {
    code += rel + '\n'
  })
  
  return code
}

function refreshDiagram() {
  renderDiagram()
}

function handleSearch() {
  renderDiagram()
}

function clearSearch() {
  searchQuery.value = ''
  renderDiagram()
}

function updateDiagram() {
  renderDiagram()
}
</script>

<style scoped lang="scss">
.er-diagram {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 16px;
}

.toolbar {
  margin-bottom: 16px;
}

.toolbar h3 {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 12px 0;
  color: var(--color-text);
  font-size: 14px;
  font-weight: 600;
}

.toolbar-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.search-controls {
  display: flex;
  gap: 8px;
  align-items: center;
  flex: 1;
  max-width: 300px;
}

.search-wrapper {
  position: relative;
  flex: 1;
  
  .search-icon {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--color-text-muted);
    pointer-events: none;
  }
}

.search-input {
  width: 100%;
  padding: 8px 12px 8px 34px;
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

.filter-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.filter-label {
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

.table-count {
  font-size: 12px;
  color: var(--color-text-muted);
  font-weight: 600;
  padding: 4px 10px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-sm);
}

.diagram-container {
  overflow-x: auto;
  min-height: 300px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 12px;
  background: var(--color-bg-tertiary);
}

.diagram-container :deep(svg) {
  max-width: 100%;
  height: auto;
}

.no-data {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 150px;
  color: var(--color-text-light);
  font-style: italic;
  font-size: 14px;
}
</style>
