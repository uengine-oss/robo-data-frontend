<template>
  <div class="database-tree">
    <div class="tree-header">
      <span class="header-title">데이터 자산들</span>
    </div>

    <div class="tree-content">
      <!-- 데이터베이스 섹션 -->
      <div class="tree-section">
        <div class="section-header" @click="toggleSection('databases')">
          <IconChevronRight 
            class="section-icon" 
            :class="{ expanded: expandedSections.databases }" 
          />
          <IconDatabase class="type-icon" />
          <span>데이터베이스들</span>
        </div>

        <div v-if="expandedSections.databases" class="section-content">
          <!-- 현재 연결된 데이터베이스 -->
          <div 
            class="tree-item database-item"
            :class="{ active: selectedDatabase === 'postgresql' }"
            @click="selectDatabase('postgresql')"
          >
            <IconChevronRight 
              class="item-chevron" 
              :class="{ expanded: expandedDatabases.postgresql }" 
              @click.stop="toggleDatabase('postgresql')"
            />
            <span class="db-icon postgresql">🐘</span>
            <span class="item-label">postgresql</span>
          </div>

          <!-- 스키마/테이블 트리 -->
          <div v-if="expandedDatabases.postgresql" class="nested-content">
            <div 
              v-for="schema in schemas" 
              :key="schema"
              class="schema-group"
            >
              <div 
                class="tree-item schema-item"
                @click="toggleSchema(schema)"
              >
                <IconChevronRight 
                  class="item-chevron" 
                  :class="{ expanded: expandedSchemas[schema] }" 
                />
                <IconFolder class="type-icon folder" />
                <span class="item-label">{{ schema }}</span>
              </div>

              <div v-if="expandedSchemas[schema]" class="nested-content">
                <div 
                  v-for="table in getTablesForSchema(schema)" 
                  :key="table.name"
                  class="tree-item table-item"
                  :class="{ active: selectedTable?.name === table.name }"
                  @click="selectTable(table)"
                >
                  <IconTable class="type-icon table" />
                  <span class="item-label">{{ table.name }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 거버넌스 섹션 -->
      <div class="tree-section">
        <div class="section-header disabled">
          <IconChevronRight class="section-icon" />
          <span class="governance-icon">🏛️</span>
          <span>거버넌스</span>
          <span class="coming-soon">준비중</span>
        </div>
      </div>

      <!-- 도메인들 섹션 -->
      <div class="tree-section">
        <div class="section-header disabled">
          <IconChevronRight class="section-icon" />
          <span class="domain-icon">🌐</span>
          <span>도메인들</span>
          <span class="coming-soon">준비중</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch } from 'vue'
import type { Text2SqlTableInfo } from '@/types'
import IconChevronRight from '@/shared/icons/IconChevronRight.vue'
import IconDatabase from '@/shared/icons/IconDatabase.vue'
import IconFolder from '@/shared/icons/IconFolder.vue'
import IconTable from '@/shared/icons/IconTable.vue'

const props = defineProps<{
  tables: Text2SqlTableInfo[]
  selectedTable: Text2SqlTableInfo | null
}>()

const emit = defineEmits<{
  (e: 'select-table', table: Text2SqlTableInfo): void
  (e: 'filter-schema', schema: string | null): void
}>()

// 섹션 확장 상태
const expandedSections = reactive({
  databases: true
})

const expandedDatabases = reactive<Record<string, boolean>>({
  postgresql: true
})

const expandedSchemas = reactive<Record<string, boolean>>({
  public: true
})

const selectedDatabase = ref<string | null>('postgresql')

// 스키마 목록 추출
const schemas = computed(() => {
  const schemaSet = new Set<string>()
  props.tables.forEach(table => {
    schemaSet.add(table.schema || 'public')
  })
  return Array.from(schemaSet).sort()
})

// 스키마별 테이블 필터링
function getTablesForSchema(schema: string): Text2SqlTableInfo[] {
  return props.tables.filter(t => (t.schema || 'public') === schema)
}

function toggleSection(section: keyof typeof expandedSections) {
  expandedSections[section] = !expandedSections[section]
}

function toggleDatabase(db: string) {
  expandedDatabases[db] = !expandedDatabases[db]
}

function toggleSchema(schema: string) {
  expandedSchemas[schema] = !expandedSchemas[schema]
}

function selectDatabase(db: string) {
  selectedDatabase.value = db
  expandedDatabases[db] = true
}

function selectTable(table: Text2SqlTableInfo) {
  emit('select-table', table)
}

// 스키마가 새로 추가되면 자동 확장
watch(schemas, (newSchemas) => {
  newSchemas.forEach(schema => {
    if (!(schema in expandedSchemas)) {
      expandedSchemas[schema] = false
    }
  })
}, { immediate: true })
</script>

<style scoped>
.database-tree {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-secondary);
  border-right: 1px solid var(--color-border);
}

.tree-header {
  padding: 1rem 1.25rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.header-title {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(255, 255, 255, 0.5);
}

.tree-content {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem 0;
}

.tree-section {
  margin-bottom: 0.25rem;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1rem;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.85);
  font-size: 0.875rem;
  font-weight: 500;
  transition: background 0.15s ease;
}

.section-header:hover {
  background: rgba(255, 255, 255, 0.04);
}

.section-header.disabled {
  cursor: default;
  opacity: 0.5;
}

.section-header.disabled:hover {
  background: transparent;
}

.section-icon {
  width: 14px;
  height: 14px;
  color: rgba(255, 255, 255, 0.4);
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.section-icon.expanded {
  transform: rotate(90deg);
}

.type-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.type-icon.folder {
  color: #fbbf24;
}

.type-icon.table {
  color: #60a5fa;
}

.section-content {
  margin-left: 0.5rem;
}

.nested-content {
  margin-left: 1.25rem;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
}

.tree-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.75);
  font-size: 0.8125rem;
  transition: all 0.15s ease;
  border-radius: 4px;
  margin: 1px 4px;
}

.tree-item:hover {
  background: rgba(99, 102, 241, 0.12);
  color: white;
}

.tree-item.active {
  background: rgba(99, 102, 241, 0.2);
  color: #a5b4fc;
}

.item-chevron {
  width: 12px;
  height: 12px;
  color: rgba(255, 255, 255, 0.35);
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.item-chevron.expanded {
  transform: rotate(90deg);
}

.item-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.db-icon {
  font-size: 14px;
}

.db-icon.postgresql {
  filter: grayscale(0.2);
}

.governance-icon,
.domain-icon {
  font-size: 14px;
}

.coming-soon {
  font-size: 0.65rem;
  color: rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.05);
  padding: 2px 6px;
  border-radius: 8px;
  margin-left: auto;
}

/* 스크롤바 스타일 */
.tree-content::-webkit-scrollbar {
  width: 6px;
}

.tree-content::-webkit-scrollbar-track {
  background: transparent;
}

.tree-content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}

.tree-content::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}
</style>



