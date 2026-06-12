<script setup lang="ts">
/**
 * ObjectSearchPanel.vue
 * Object Type 검색 및 필터링 패널
 */

import { ref, computed } from 'vue'
import { IconSearch, IconRefresh, IconChevronRight } from '@/shared/icons'

// ============================================================================
// 타입 정의
// ============================================================================

interface ObjectType {
  id: string
  name: string
  description?: string
  columns: Array<{ name: string; type: string }>
  materializedView?: string
  query?: string
}

interface Props {
  objectTypes: ObjectType[]
  selectedType: ObjectType | null
  isLoading: boolean
}

const props = defineProps<Props>()
const searchQuery = defineModel<string>('searchQuery', { default: '' })

const emit = defineEmits<{
  'type-select': [type: ObjectType]
  'search': [query: string]
  'reset': []
}>()

// ============================================================================
// 상태
// ============================================================================

const filterText = ref('')
const expandedTypes = ref<Set<string>>(new Set())

// ============================================================================
// Computed
// ============================================================================

const filteredObjectTypes = computed(() => {
  if (!filterText.value.trim()) {
    return props.objectTypes
  }
  
  const query = filterText.value.toLowerCase()
  return props.objectTypes.filter(type => 
    type.name.toLowerCase().includes(query) ||
    type.description?.toLowerCase().includes(query)
  )
})

// ============================================================================
// 이벤트 핸들러
// ============================================================================

function handleTypeClick(type: ObjectType) {
  emit('type-select', type)
}

function handleTypeExpand(typeId: string, event: Event) {
  event.stopPropagation()
  if (expandedTypes.value.has(typeId)) {
    expandedTypes.value.delete(typeId)
  } else {
    expandedTypes.value.add(typeId)
  }
}

function handleSearch() {
  if (searchQuery.value.trim()) {
    emit('search', searchQuery.value.trim())
  }
}

function handleReset() {
  searchQuery.value = ''
  filterText.value = ''
  emit('reset')
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    handleSearch()
  }
}
</script>

<template>
  <div class="search-panel-content">
    <!-- 헤더 -->
    <div class="panel-header">
      <h3 class="panel-title">
        <span class="title-icon">🔍</span>
        오브젝트 탐색기
      </h3>
      <button 
        class="reset-btn"
        @click="handleReset"
        title="초기화"
      >
        <IconRefresh :size="16" />
      </button>
    </div>
    
    <!-- 검색 입력 -->
    <div class="search-section">
      <div class="search-input-wrapper">
        <IconSearch :size="16" class="search-icon" />
        <input
          v-model="searchQuery"
          type="text"
          class="search-input"
          placeholder="오브젝트 이름으로 검색..."
          @keydown="handleKeydown"
        />
        <button 
          v-if="searchQuery"
          class="search-btn"
          @click="handleSearch"
        >
          검색
        </button>
      </div>
    </div>
    
    <!-- Object Type 필터 -->
    <div class="filter-section">
      <input
        v-model="filterText"
        type="text"
        class="filter-input"
        placeholder="Object Type 필터..."
      />
    </div>
    
    <!-- Object Type 목록 -->
    <div class="type-list">
      <div class="list-header">
        <span class="list-title">Object Types</span>
        <span class="list-count">{{ filteredObjectTypes.length }}개</span>
      </div>
      
      <div v-if="isLoading" class="loading-state">
        <div class="spinner"></div>
        <span>로딩 중...</span>
      </div>
      
      <div v-else-if="filteredObjectTypes.length === 0" class="empty-state">
        <span>Object Type이 없습니다</span>
      </div>
      
      <div 
        v-else
        v-for="type in filteredObjectTypes"
        :key="type.id"
        class="type-item"
        :class="{ selected: selectedType?.id === type.id }"
        @click="handleTypeClick(type)"
      >
        <div class="type-main">
          <button 
            class="expand-btn"
            :class="{ expanded: expandedTypes.has(type.id) }"
            @click="handleTypeExpand(type.id, $event)"
          >
            <IconChevronRight :size="14" />
          </button>
          <span class="type-icon">📦</span>
          <span class="type-name">{{ type.name }}</span>
          <span v-if="type.materializedView" class="mv-badge" title="Materialized View">MV</span>
        </div>
        
        <Transition name="expand">
          <div v-if="expandedTypes.has(type.id)" class="type-details">
            <p v-if="type.description" class="type-description">{{ type.description }}</p>
            <div class="columns-list">
              <span class="columns-title">컬럼 ({{ type.columns?.length || 0 }})</span>
              <div class="columns-grid">
                <span 
                  v-for="col in type.columns?.slice(0, 6)" 
                  :key="col.name"
                  class="column-chip"
                  :title="col.type"
                >
                  {{ col.name }}
                </span>
                <span v-if="(type.columns?.length || 0) > 6" class="more-columns">
                  +{{ (type.columns?.length || 0) - 6 }}개
                </span>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.search-panel-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px;
  gap: 16px;
}

// ============================================================================
// 헤더
// ============================================================================

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-bright);
  
  .title-icon {
    font-size: 18px;
  }
}

.reset-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text-light);
  cursor: pointer;
  transition: all 0.15s;
  
  &:hover {
    background: var(--color-bg-tertiary);
    color: var(--color-text);
  }
}

// ============================================================================
// 검색 섹션
// ============================================================================

.search-section {
  .search-input-wrapper {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    transition: border-color 0.15s;
    
    &:focus-within {
      border-color: var(--color-accent);
    }
    
    .search-icon {
      color: var(--color-text-muted);
      flex-shrink: 0;
    }
    
    .search-input {
      flex: 1;
      background: transparent;
      border: none;
      font-size: 13px;
      color: var(--color-text);
      
      &::placeholder {
        color: var(--color-text-muted);
      }
      
      &:focus {
        outline: none;
      }
    }
    
    .search-btn {
      padding: 4px 12px;
      background: var(--color-accent);
      border: none;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      color: white;
      cursor: pointer;
      transition: background 0.15s;
      
      &:hover {
        background: var(--color-accent-hover);
      }
    }
  }
}

// ============================================================================
// 필터 섹션
// ============================================================================

.filter-section {
  .filter-input {
    width: 100%;
    padding: 8px 12px;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    font-size: 12px;
    color: var(--color-text);
    
    &::placeholder {
      color: var(--color-text-muted);
    }
    
    &:focus {
      outline: none;
      border-color: var(--color-accent);
    }
  }
}

// ============================================================================
// Type 목록
// ============================================================================

.type-list {
  flex: 1;
  overflow-y: auto;
  margin: 0 -16px;
  padding: 0 16px;
}

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--color-border);
  
  .list-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-muted);
  }
  
  .list-count {
    font-size: 11px;
    color: var(--color-text-light);
  }
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 32px;
  color: var(--color-text-muted);
  font-size: 13px;
  
  .spinner {
    width: 24px;
    height: 24px;
    border: 2px solid rgba(255, 255, 255, 0.1);
    border-top-color: var(--color-accent);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.type-item {
  padding: 10px 12px;
  margin-bottom: 4px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
  
  &:hover {
    border-color: var(--color-accent);
    background: var(--color-bg-tertiary);
  }
  
  &.selected {
    border-color: var(--color-accent);
    background: rgba(34, 139, 230, 0.1);
  }
}

.type-main {
  display: flex;
  align-items: center;
  gap: 8px;
}

.expand-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: transform 0.2s;
  
  &.expanded {
    transform: rotate(90deg);
  }
}

.type-icon {
  font-size: 14px;
}

.type-name {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-bright);
}

.mv-badge {
  padding: 2px 6px;
  font-size: 9px;
  font-weight: 600;
  background: rgba(34, 139, 230, 0.2);
  color: var(--color-accent);
  border-radius: 4px;
}

.type-details {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--color-border);
}

.type-description {
  margin: 0 0 12px 0;
  font-size: 12px;
  color: var(--color-text-light);
  line-height: 1.5;
}

.columns-list {
  .columns-title {
    display: block;
    margin-bottom: 8px;
    font-size: 11px;
    font-weight: 600;
    color: var(--color-text-muted);
  }
}

.columns-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.column-chip {
  padding: 2px 8px;
  font-size: 10px;
  background: var(--color-bg-tertiary);
  border-radius: 4px;
  color: var(--color-text-light);
}

.more-columns {
  padding: 2px 8px;
  font-size: 10px;
  color: var(--color-text-muted);
}

// ============================================================================
// 트랜지션
// ============================================================================

.expand-enter-active,
.expand-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
  margin-top: 0;
  padding-top: 0;
}
</style>
