<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import type { OntologySchema } from '../../model/schema'
import { IconRefresh, IconTrash, IconCheck, IconPlus } from '@/shared/icons'
import { useOntologySchemaLibrary } from '../../application/useOntologySchemaLibrary'
import { useOntologySchemaLifecycle } from '../../application/useOntologySchemaLifecycle'
import {
  ontologySchemaLibraryClient,
  ontologySchemaLifecycleClient,
} from '../../application/schemaClients'
import { useOntologyStore } from '../../state/extraction'

const emit = defineEmits<{
  (event: 'new-schema'): void
  (event: 'schema-selected', schema: OntologySchema): void
}>()

const store = useOntologyStore()
const schemaLibrary = useOntologySchemaLibrary(ontologySchemaLibraryClient)
const {
  schemas,
  activeSchemaId,
  excludedWithoutSchemaJson,
  loading: listLoading,
  error: listError,
} = schemaLibrary
const isOpen = ref(false)
const selectorRoot = ref<HTMLElement | null>(null)
const operationNotice = ref<string | null>(null)
const schemaToDelete = ref<{ id: string; name: string } | null>(null)
const deleteConfirmButton = ref<HTMLButtonElement | null>(null)
let deleteReturnFocus: HTMLElement | null = null

const schemaLifecycle = useOntologySchemaLifecycle<OntologySchema>(
  ontologySchemaLifecycleClient,
)
const {
  deletePendingId,
  deleteError,
  loadPendingId,
  loadError,
  isBusy: mutationPending,
} = schemaLifecycle
const isBusy = computed(() => listLoading.value || mutationPending.value)
const currentSchema = computed(() =>
  schemas.value.find(schema => schema.id === activeSchemaId.value),
)
const listErrorMessage = computed(() => {
  if (!listError.value) return null
  const retained = schemas.value.length > 0 ? ' 이전 목록을 유지합니다.' : ''
  return `저장된 온톨로지를 불러오지 못했습니다: ${listError.value}${retained}`
})
const selectionErrorMessage = computed(() => {
  const failure = loadError.value
  if (!failure) return null
  if (failure.stage === 'detail' && failure.activationCompleted) {
    return `서버 활성화는 완료됐지만 상세 데이터를 불러오지 못했습니다. 기존 온톨로지를 유지합니다: ${failure.message}`
  }
  return `온톨로지를 활성화하지 못했습니다. 기존 온톨로지를 유지합니다: ${failure.message}`
})

async function loadSchemas() {
  await schemaLibrary.refresh()
}

async function selectSchema(schemaId: string) {
  if (isBusy.value) return
  if (schemaId === activeSchemaId.value && !loadError.value) {
    isOpen.value = false
    return
  }

  operationNotice.value = null
  const result = loadError.value?.schemaId === schemaId
    ? await schemaLifecycle.retryLoad()
    : await schemaLifecycle.loadSchema(schemaId)
  if (result.status !== 'success') return

  activeSchemaId.value = schemaId
  emit('schema-selected', result.value)
  isOpen.value = false
}

function requestDeleteSchema(
  schema: { id: string; name: string },
  event: MouseEvent,
) {
  if (isBusy.value) return
  event.stopPropagation()
  schemaLifecycle.clearDeleteError()
  operationNotice.value = null
  schemaToDelete.value = { id: schema.id, name: schema.name }
  deleteReturnFocus = event.currentTarget instanceof HTMLElement
    ? event.currentTarget
    : null
  nextTick(() => deleteConfirmButton.value?.focus())
}

async function confirmDeleteSchema() {
  const target = schemaToDelete.value
  if (!target || deletePendingId.value !== null) return

  const wasActive = target.id === activeSchemaId.value
  const result = await schemaLifecycle.deleteSchema(target.id)
  if (result.status !== 'success') return

  schemaLibrary.removeSchema(target.id)
  schemaToDelete.value = null
  deleteReturnFocus = null
  operationNotice.value = `온톨로지 「${target.name}」이(가) 삭제되었습니다.`
  if (wasActive) {
    activeSchemaId.value = null
    store.reset()
    return
  }
  await loadSchemas()
}

function closeDeleteDialog() {
  if (deletePendingId.value !== null) return
  schemaLifecycle.clearDeleteError()
  schemaToDelete.value = null
  const returnFocus = deleteReturnFocus
  deleteReturnFocus = null
  nextTick(() => returnFocus?.focus())
}

function createNew() {
  if (isBusy.value) return
  isOpen.value = false
  emit('new-schema')
}

function formatDate(dateString?: string): string {
  if (!dateString) return '-'
  const date = new Date(dateString)
  if (!Number.isFinite(date.getTime())) return '-'
  return date.toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function handleClickOutside(event: MouseEvent) {
  const root = selectorRoot.value
  if (root && !event.composedPath().includes(root)) {
    isOpen.value = false
  }
}

onMounted(() => {
  void loadSchemas()
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div ref="selectorRoot" class="schema-selector">
    <button
      class="selector-trigger"
      @click.stop="isOpen = !isOpen"
      :disabled="isBusy"
      :aria-expanded="isOpen"
      :aria-busy="isBusy"
      aria-controls="ontology-schema-selector-list"
      aria-haspopup="true"
    >
      <span class="trigger-icon">📚</span>
      <span class="trigger-text">
        {{ currentSchema?.name || '온톨로지 선택' }}
      </span>
      <span class="trigger-arrow" :class="{ open: isOpen }">▼</span>
    </button>

    <!-- 드롭다운 메뉴 -->
    <Transition name="dropdown">
      <div
        v-if="isOpen"
        id="ontology-schema-selector-list"
        class="selector-dropdown"
        :aria-busy="isBusy"
      >
        <div class="dropdown-header">
          <span class="header-title">저장된 온톨로지</span>
          <button
            type="button"
            class="refresh-btn"
            aria-label="온톨로지 목록 새로고침"
            @click="loadSchemas"
            :disabled="isBusy"
          >
            <IconRefresh :size="14" :class="{ spinning: listLoading }" />
          </button>
        </div>

        <div
          v-if="listErrorMessage"
          class="selector-state error list-error"
          role="alert"
          aria-live="assertive"
        >
          <span>{{ listErrorMessage }}</span>
          <button type="button" :disabled="isBusy" @click="loadSchemas">다시 시도</button>
        </div>
        <div
          v-if="excludedWithoutSchemaJson > 0"
          class="selector-state warning"
          role="status"
          aria-live="polite"
        >
          상세 데이터가 없는 온톨로지 {{ excludedWithoutSchemaJson }}개는 목록에서 제외했습니다.
        </div>
        <div
          v-if="selectionErrorMessage"
          class="selector-state error load-error"
          role="alert"
          aria-live="assertive"
        >
          <span>{{ selectionErrorMessage }}</span>
          <button
            type="button"
            :disabled="isBusy"
            @click="loadError && selectSchema(loadError.schemaId)"
          >
            다시 시도
          </button>
        </div>
        <div
          v-if="operationNotice"
          class="selector-state success"
          role="status"
          aria-live="polite"
        >
          {{ operationNotice }}
        </div>

        <button type="button" class="create-new-btn" :disabled="isBusy" @click="createNew">
          <IconPlus :size="16" />
          <span>새 온톨로지 만들기</span>
        </button>

        <div class="schema-list">
          <div v-if="listLoading" class="loading-state" role="status">
            <span class="spinner"></span>
            <span>로딩 중...</span>
          </div>

          <div v-else-if="schemas.length === 0 && !listErrorMessage" class="empty-state">
            <span>저장된 온톨로지가 없습니다</span>
          </div>

          <div
            v-else
            v-for="schema in schemas"
            :key="schema.id"
            :class="['schema-item', { active: schema.id === activeSchemaId }]"
          >
            <button
              type="button"
              class="item-main"
              :disabled="isBusy"
              :aria-current="schema.id === activeSchemaId ? 'true' : undefined"
              :aria-busy="loadPendingId === schema.id"
              @click="selectSchema(schema.id)"
            >
              <div class="item-header">
                <span class="item-name">{{ schema.name }}</span>
                <IconCheck v-if="schema.id === activeSchemaId" :size="14" class="active-check" />
              </div>
              <div class="item-meta">
                <span class="meta-nodes">{{ schema.nodeCount || 0 }} 노드</span>
                <span class="meta-date">{{ formatDate(schema.updatedAt) }}</span>
              </div>
            </button>
            <button
              type="button"
              class="delete-btn"
              :disabled="isBusy"
              @click="requestDeleteSchema(schema, $event)"
              title="삭제"
              :aria-label="`${schema.name} 삭제`"
            >
              <IconTrash :size="14" />
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <Teleport to="body">
      <div
        v-if="schemaToDelete"
        class="selector-delete-overlay"
        @click.self="closeDeleteDialog"
        @keydown.esc.prevent="closeDeleteDialog"
      >
        <div
          class="selector-delete-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="selector-delete-title"
          :aria-busy="deletePendingId === schemaToDelete.id"
        >
          <h3 id="selector-delete-title">저장된 온톨로지 삭제</h3>
          <p>다음 온톨로지를 삭제하시겠습니까?</p>
          <strong>「{{ schemaToDelete.name }}」</strong>
          <p class="selector-delete-warning">삭제된 온톨로지는 복구할 수 없습니다.</p>
          <p
            v-if="deleteError?.schemaId === schemaToDelete.id"
            class="selector-delete-error"
            role="alert"
          >
            삭제 실패: {{ deleteError.message }}
          </p>
          <div class="selector-delete-actions">
            <button
              type="button"
              :disabled="deletePendingId === schemaToDelete.id"
              @click="closeDeleteDialog"
            >
              취소
            </button>
            <button
              ref="deleteConfirmButton"
              type="button"
              class="danger"
              :disabled="deletePendingId === schemaToDelete.id"
              @click="confirmDeleteSchema"
            >
              {{ deletePendingId === schemaToDelete.id ? '삭제 중…' : deleteError ? '다시 삭제' : '삭제' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
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

  &:disabled {
    opacity: 0.6;
    cursor: wait;
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

.selector-state {
  display: grid;
  gap: 8px;
  margin: 10px;
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: 8px;
  font-size: 0.78rem;
  line-height: 1.45;

  &.error {
    color: #fecaca;
    background: rgba(239, 68, 68, 0.12);
    border-color: rgba(248, 113, 113, 0.4);
  }

  &.success {
    color: #bbf7d0;
    background: rgba(34, 197, 94, 0.12);
    border-color: rgba(74, 222, 128, 0.4);
  }

  button {
    justify-self: start;
    padding: 4px 9px;
    border: 1px solid currentColor;
    border-radius: 6px;
    color: inherit;
    background: transparent;
    cursor: pointer;
  }
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

  &:disabled {
    opacity: 0.55;
    cursor: wait;
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
    padding: 0;
    border: 0;
    color: inherit;
    background: transparent;
    text-align: left;
    cursor: pointer;

    &:disabled {
      cursor: wait;
    }
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

    &:disabled {
      opacity: 0.45;
      cursor: wait;
    }
  }

  &:hover .delete-btn,
  .delete-btn:focus-visible {
    opacity: 1;
  }
}

.selector-trigger:focus-visible,
.refresh-btn:focus-visible,
.create-new-btn:focus-visible,
.item-main:focus-visible,
.delete-btn:focus-visible,
.selector-state button:focus-visible,
.selector-delete-dialog button:focus-visible {
  outline: 2px solid #93c5fd;
  outline-offset: 2px;
}

.selector-delete-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(3px);
}

.selector-delete-dialog {
  width: min(420px, 100%);
  padding: 24px;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  color: var(--color-text);
  background: var(--color-bg-elevated, var(--color-bg-secondary));
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);

  h3 {
    margin: 0 0 16px;
    font-size: 1.08rem;
  }

  p {
    margin: 0 0 10px;
    color: var(--color-text-muted);
    line-height: 1.5;
  }

  strong {
    display: block;
    margin-bottom: 12px;
    padding: 10px 12px;
    border: 1px solid rgba(248, 113, 113, 0.4);
    border-radius: 8px;
    color: #fca5a5;
    background: rgba(239, 68, 68, 0.12);
    word-break: break-word;
  }

  .selector-delete-warning {
    margin-bottom: 16px;
    font-size: 0.8rem;
  }
}

.selector-delete-error {
  padding: 10px 12px;
  border: 1px solid rgba(248, 113, 113, 0.45);
  border-radius: 8px;
  color: #fecaca !important;
  background: rgba(239, 68, 68, 0.12);
  font-size: 0.8rem;
}

.selector-delete-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;

  button {
    padding: 8px 16px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    color: var(--color-text);
    background: var(--color-bg-tertiary);
    cursor: pointer;

    &.danger {
      border-color: #ef4444;
      color: #fff;
      background: #dc2626;
    }

    &:disabled {
      opacity: 0.55;
      cursor: wait;
    }
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
