<script setup lang="ts">
/**
 * ChildSelectDialog.vue
 * 드릴다운 시 하위 노드가 5개 이상일 때 표시되는 선택 다이얼로그
 * 사용자가 그래프에 추가할 노드를 선택할 수 있음
 */
import { ref, computed, watch } from 'vue'
import { IconX, IconCheck, IconSearch } from '@/shared/icons'
import { useDialogFocusLifecycle } from '@/shared/composables/useDialogFocusLifecycle'

interface ChildNode {
  id: string
  name: string
  type: string
  labels?: string[]
  properties: Record<string, unknown>
}

const props = defineProps<{
  visible: boolean
  children: ChildNode[]
  parentName: string
  childType: string
}>()

const emit = defineEmits<{
  'close': []
  'confirm': [selectedChildren: ChildNode[]]
}>()

// 상태
const searchQuery = ref('')
const selectedIds = ref<Set<string>>(new Set())
const dialog = ref<HTMLElement | null>(null)
const searchInput = ref<HTMLInputElement | null>(null)

// 검색 필터링된 children
const filteredChildren = computed(() => {
  if (!searchQuery.value.trim()) return props.children
  const query = searchQuery.value.toLowerCase()
  return props.children.filter(child => 
    child.name.toLowerCase().includes(query) ||
    child.id.toLowerCase().includes(query) ||
    Object.values(child.properties).some(v => 
      String(v).toLowerCase().includes(query)
    )
  )
})

// 전체 선택 여부
const isAllSelected = computed(() => {
  return filteredChildren.value.length > 0 && 
    filteredChildren.value.every(c => selectedIds.value.has(c.id))
})

// 부분 선택 여부
const isPartialSelected = computed(() => {
  const selected = filteredChildren.value.filter(c => selectedIds.value.has(c.id))
  return selected.length > 0 && selected.length < filteredChildren.value.length
})

// 선택된 개수
const selectedCount = computed(() => selectedIds.value.size)

// 다이얼로그 열릴 때 초기화
watch(() => props.visible, (visible) => {
  if (visible) {
    searchQuery.value = ''
    selectedIds.value = new Set()
  }
})

// 개별 항목 토글
function toggleItem(child: ChildNode) {
  const newSet = new Set(selectedIds.value)
  if (newSet.has(child.id)) {
    newSet.delete(child.id)
  } else {
    newSet.add(child.id)
  }
  selectedIds.value = newSet
}

// 전체 선택/해제
function toggleAll() {
  if (isAllSelected.value) {
    // 전체 해제
    const newSet = new Set(selectedIds.value)
    filteredChildren.value.forEach(c => newSet.delete(c.id))
    selectedIds.value = newSet
  } else {
    // 전체 선택
    const newSet = new Set(selectedIds.value)
    filteredChildren.value.forEach(c => newSet.add(c.id))
    selectedIds.value = newSet
  }
}

// 확인
function handleConfirm() {
  const selected = props.children.filter(c => selectedIds.value.has(c.id))
  emit('confirm', selected)
}

// 닫기
function handleClose() {
  emit('close')
}

useDialogFocusLifecycle({
  active: () => props.visible,
  dialog,
  requestClose: handleClose,
  initialFocus: () => searchInput.value,
})

// 속성 표시 (최대 3개)
function getDisplayProperties(properties: Record<string, unknown>): string {
  const entries = Object.entries(properties)
    .filter(([key]) => !['id', 'type'].includes(key.toLowerCase()))
    .slice(0, 3)
  return entries.map(([k, v]) => `${k}: ${v}`).join(' | ')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="dialog-overlay" @click.self="handleClose">
        <div
          ref="dialog"
          class="dialog-container"
          role="dialog"
          aria-modal="true"
          aria-labelledby="child-select-dialog-title"
          tabindex="-1"
        >
          <!-- 헤더 -->
          <div class="dialog-header">
            <div class="header-content">
              <h3 id="child-select-dialog-title">하위 노드 선택</h3>
              <p class="subtitle">
                <template v-if="parentName">"{{ parentName }}"의 </template>{{ childType }} 목록 ({{ children.length }}개)
              </p>
            </div>
            <button type="button" class="close-btn" aria-label="하위 노드 선택 닫기" @click="handleClose">
              <IconX :size="20" />
            </button>
          </div>
          
          <!-- 검색 및 전체 선택 -->
          <div class="dialog-toolbar">
            <div class="search-box">
              <IconSearch :size="16" class="search-icon" />
              <input
                ref="searchInput"
                v-model="searchQuery"
                type="text"
                aria-label="하위 노드 검색"
                placeholder="검색..."
                class="search-input"
              />
            </div>
            <div class="selection-info">
              <span class="count">{{ selectedCount }}개 선택됨</span>
              <button type="button" class="select-all-btn" @click="toggleAll">
                {{ isAllSelected ? '전체 해제' : '전체 선택' }}
              </button>
            </div>
          </div>
          
          <!-- 테이블 -->
          <div class="dialog-body">
            <table class="children-table">
              <thead>
                <tr>
                  <th class="col-check">
                    <input
                      type="checkbox"
                      aria-label="검색 결과 전체 선택"
                      :checked="isAllSelected"
                      :indeterminate="isPartialSelected"
                      @change="toggleAll"
                    />
                  </th>
                  <th class="col-name">이름</th>
                  <th class="col-props">속성</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="child in filteredChildren"
                  :key="child.id"
                  :class="{ selected: selectedIds.has(child.id) }"
                >
                  <td class="col-check">
                    <input
                      type="checkbox"
                      :aria-label="`${child.name} 선택`"
                      :checked="selectedIds.has(child.id)"
                      @change="toggleItem(child)"
                    />
                  </td>
                  <td class="col-name">
                    <span class="node-name">{{ child.name }}</span>
                  </td>
                  <td class="col-props">
                    <span class="props-text">{{ getDisplayProperties(child.properties) }}</span>
                  </td>
                </tr>
                <tr v-if="filteredChildren.length === 0">
                  <td colspan="3" class="empty-row">
                    검색 결과가 없습니다
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          
          <!-- 푸터 -->
          <div class="dialog-footer">
            <button type="button" class="btn btn-secondary" @click="handleClose">
              취소
            </button>
            <button 
              type="button"
              class="btn btn-primary" 
              :disabled="selectedCount === 0"
              @click="handleConfirm"
            >
              <IconCheck :size="16" />
              {{ selectedCount }}개 추가
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog-container {
  background: var(--color-bg-secondary);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  width: 700px;
  max-width: 90vw;
  max-height: min(80dvh, 760px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border);
  
  .header-content {
    h3 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: var(--color-text);
    }
    
    .subtitle {
      margin: 4px 0 0;
      font-size: 13px;
      color: var(--color-text-light);
    }
  }
  
  .close-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
    color: var(--color-text-light);
    border-radius: 4px;
    
    &:hover {
      background: var(--color-bg-hover);
      color: var(--color-text);
    }
  }
}

.dialog-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  background: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border);
  
  .search-box {
    position: relative;
    flex: 1;
    max-width: 300px;
    
    .search-icon {
      position: absolute;
      left: 10px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--color-text-light);
    }
    
    .search-input {
      width: 100%;
      padding: 8px 12px 8px 32px;
      border: 1px solid var(--color-border);
      border-radius: 6px;
      font-size: 13px;
      color: var(--color-text);
      background: var(--color-bg-secondary);
      
      &:focus {
        outline: none;
        border-color: var(--color-accent);
      }
    }
  }
  
  .selection-info {
    display: flex;
    align-items: center;
    gap: 12px;
    
    .count {
      font-size: 13px;
      color: var(--color-text-light);
    }
    
    .select-all-btn {
      background: none;
      border: 1px solid var(--color-border);
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
      color: var(--color-text);
      
      &:hover {
        background: var(--color-bg-hover);
      }
    }
  }
}

.dialog-body {
  flex: 1;
  overflow: auto;
  
  .children-table {
    width: 100%;
    border-collapse: collapse;
    
    th, td {
      text-align: left;
      padding: 10px 16px;
      border-bottom: 1px solid var(--color-border);
    }
    
    th {
      background: var(--color-bg-tertiary);
      font-size: 12px;
      font-weight: 600;
      color: var(--color-text-light);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      position: sticky;
      top: 0;
      z-index: 1;
    }
    
    tbody tr {
      transition: background 0.15s;
      
      &:hover {
        background: var(--color-bg-hover);
      }
      
      &.selected {
        background: color-mix(in srgb, var(--color-accent) 14%, transparent);
      }
    }
    
    .col-check {
      width: 40px;
      text-align: center;
      
      input[type="checkbox"] {
        width: 16px;
        height: 16px;
        cursor: pointer;
      }
    }
    
    .col-name {
      width: 200px;
      
      .node-name {
        font-weight: 500;
        color: var(--color-text);
      }
    }
    
    .col-props {
      .props-text {
        font-size: 12px;
        color: var(--color-text-light);
      }
    }
    
    .empty-row {
      text-align: center;
      color: var(--color-text-light);
      padding: 40px;
    }
  }
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-tertiary);
  
  .btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 20px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    
    &-secondary {
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border);
      color: var(--color-text);
      
      &:hover {
        background: var(--color-bg-hover);
      }
    }
    
    &-primary {
      background: var(--color-accent);
      border: none;
      color: white;
      
      &:hover {
        filter: brightness(1.1);
      }
      
      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }
  }
}

@media (max-width: 600px) {
  .dialog-container {
    width: calc(100vw - 24px);
    max-width: none;
    max-height: calc(100dvh - 24px);
  }

  .dialog-header {
    padding: 16px;
  }

  .dialog-toolbar {
    align-items: stretch;
    flex-direction: column;
    gap: 10px;
    padding: 12px 16px;

    .search-box {
      max-width: none;
    }

    .selection-info {
      justify-content: space-between;
    }
  }

  .dialog-body .children-table {
    min-width: 520px;
  }

  .dialog-footer {
    padding: 12px 16px;
  }
}

// 애니메이션
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
  
  .dialog-container {
    transition: transform 0.2s ease;
  }
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
  
  .dialog-container {
    transform: scale(0.95);
  }
}
</style>
