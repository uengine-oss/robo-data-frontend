<script setup lang="ts">
/**
 * SchemaSelector.vue
 * 저장된 온톨로지 스키마 목록 및 선택기
 */
import { ref, onMounted, computed } from 'vue'
import { ontologyApi, type SchemaListItem } from '@/services/api'
import { useOntologyStore } from '@/stores/ontology'
import { IconRefresh, IconTrash, IconCheck, IconPlus } from '@/components/icons'

const emit = defineEmits<{
  (e: 'new-schema'): void
  (e: 'schema-selected', schema: any): void
}>()

const store = useOntologyStore()

// 스키마 목록
const schemas = ref<SchemaListItem[]>([])
const activeSchemaId = ref<string | null>(null)
const isLoading = ref(false)
const isOpen = ref(false)
const error = ref<string | null>(null)

// 현재 선택된 스키마
const currentSchema = computed(() => {
  return schemas.value.find(s => s.id === activeSchemaId.value)
})

// 스키마 목록 로드
async function loadSchemas() {
  isLoading.value = true
  error.value = null
  
  try {
    const response = await ontologyApi.listSchemas()
    schemas.value = response.schemas || []
    activeSchemaId.value = response.activeSchemaId
  } catch (err) {
    error.value = err instanceof Error ? err.message : '목록 조회 실패'
    schemas.value = []
  } finally {
    isLoading.value = false
  }
}

// 스키마 선택
async function selectSchema(schemaId: string) {
  if (schemaId === activeSchemaId.value) {
    isOpen.value = false
    return
  }
  
  isLoading.value = true
  
  try {
    await ontologyApi.activateSchema(schemaId)
    const schema = await ontologyApi.getSchemaById(schemaId)
    if (schema) {
      activeSchemaId.value = schemaId
      emit('schema-selected', schema)
    }
    isOpen.value = false
  } catch (err) {
    error.value = err instanceof Error ? err.message : '스키마 선택 실패'
  } finally {
    isLoading.value = false
  }
}

// 스키마 삭제
async function deleteSchema(schemaId: string, e: Event) {
  e.stopPropagation()
  
  if (!confirm('이 온톨로지를 삭제하시겠습니까?')) return
  
  try {
    await ontologyApi.deleteSchemaById(schemaId)
    await loadSchemas()
    
    // 활성 스키마가 삭제되었으면 리셋
    if (schemaId === activeSchemaId.value) {
      store.reset()
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '삭제 실패'
  }
}

// 새 스키마 생성
function createNew() {
  isOpen.value = false
  emit('new-schema')
}

// 날짜 포맷
function formatDate(dateStr?: string): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleDateString('ko-KR', { 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 드롭다운 외부 클릭 시 닫기
function handleClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.schema-selector')) {
    isOpen.value = false
  }
}

onMounted(() => {
  loadSchemas()
  document.addEventListener('click', handleClickOutside)
})
</script>

<template>
  <div class="schema-selector">
    <!-- 선택기 버튼 -->
    <button 
      class="selector-trigger"
      @click.stop="isOpen = !isOpen"
      :disabled="isLoading"
    >
      <span class="trigger-icon">📚</span>
      <span class="trigger-text">
        {{ currentSchema?.name || '온톨로지 선택' }}
      </span>
      <span class="trigger-arrow" :class="{ open: isOpen }">▼</span>
    </button>
    
    <!-- 드롭다운 메뉴 -->
    <Transition name="dropdown">
      <div v-if="isOpen" class="selector-dropdown">
        <!-- 헤더 -->
        <div class="dropdown-header">
          <span class="header-title">저장된 온톨로지</span>
          <button class="refresh-btn" @click="loadSchemas" :disabled="isLoading">
            <IconRefresh :size="14" :class="{ spinning: isLoading }" />
          </button>
        </div>
        
        <!-- 새로 만들기 버튼 -->
        <button class="create-new-btn" @click="createNew">
          <IconPlus :size="16" />
          <span>새 온톨로지 만들기</span>
        </button>
        
        <!-- 목록 -->
        <div class="schema-list">
          <div v-if="isLoading" class="loading-state">
            <span class="spinner"></span>
            <span>로딩 중...</span>
          </div>
          
          <div v-else-if="schemas.length === 0" class="empty-state">
            <span>저장된 온톨로지가 없습니다</span>
          </div>
          
          <div 
            v-else
            v-for="schema in schemas"
            :key="schema.id"
            :class="['schema-item', { active: schema.id === activeSchemaId }]"
            @click="selectSchema(schema.id)"
          >
            <div class="item-main">
              <div class="item-header">
                <span class="item-name">{{ schema.name }}</span>
                <IconCheck v-if="schema.id === activeSchemaId" :size="14" class="active-check" />
              </div>
              <div class="item-meta">
                <span class="meta-nodes">{{ schema.nodeCount || 0 }} 노드</span>
                <span class="meta-date">{{ formatDate(schema.updatedAt) }}</span>
              </div>
            </div>
            <button 
              class="delete-btn"
              @click="deleteSchema(schema.id, $event)"
              title="삭제"
            >
              <IconTrash :size="14" />
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped lang="scss">
.schema-selector {
  position: relative;
}

.selector-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text);
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
  
  &:hover {
    background: var(--color-bg-hover);
    border-color: var(--color-accent);
  }
  
  .trigger-icon {
    font-size: 1rem;
  }
  
  .trigger-text {
    font-weight: 500;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  .trigger-arrow {
    font-size: 0.6rem;
    transition: transform 0.2s;
    
    &.open {
      transform: rotate(180deg);
    }
  }
}

.selector-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  width: 320px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  z-index: 100;
  overflow: hidden;
}

.dropdown-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border);
  
  .header-title {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  
  .refresh-btn {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.2s;
    
    &:hover {
      background: var(--color-bg-hover);
      color: var(--color-text);
    }
    
    .spinning {
      animation: spin 1s linear infinite;
    }
  }
}

.create-new-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 12px 16px;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--color-border);
  color: var(--color-accent);
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  
  &:hover {
    background: rgba(34, 139, 230, 0.1);
  }
}

.schema-list {
  max-height: 300px;
  overflow-y: auto;
}

.loading-state,
.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  color: var(--color-text-muted);
  font-size: 0.85rem;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.schema-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
  transition: all 0.15s;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  
  &:last-child {
    border-bottom: none;
  }
  
  &:hover {
    background: var(--color-bg-hover);
  }
  
  &.active {
    background: rgba(34, 139, 230, 0.1);
    
    .item-name {
      color: var(--color-accent);
    }
  }
  
  .item-main {
    flex: 1;
    min-width: 0;
  }
  
  .item-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }
  
  .item-name {
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--color-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  .active-check {
    color: var(--color-accent);
    flex-shrink: 0;
  }
  
  .item-meta {
    display: flex;
    gap: 12px;
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }
  
  .meta-nodes {
    color: #34d399;
  }
  
  .delete-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    border-radius: 6px;
    opacity: 0;
    transition: all 0.2s;
    
    &:hover {
      background: rgba(248, 113, 113, 0.2);
      color: #f87171;
    }
  }
  
  &:hover .delete-btn {
    opacity: 1;
  }
}

// 드롭다운 애니메이션
.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
