<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import type { DataSource } from '../api/contracts.ts'
import { useDatasourcesStore } from '../state/datasources.ts'
import AddDataSourceDialog from './AddDataSourceDialog.vue'
import DataSourceCard from './DataSourceCard.vue'
import DataSourceDetailsPanel from './DataSourceDetailsPanel.vue'
import DeleteDataSourceDialog from './DeleteDataSourceDialog.vue'

const props = withDefaults(defineProps<{
  mode?: 'full' | 'compact' | 'selector'
}>(), {
  mode: 'full',
})

const emit = defineEmits<{
  select: [datasource: DataSource]
  close: []
}>()

const store = useDatasourcesStore()
const managerRef = ref<HTMLElement>()
const addButtonRef = ref<HTMLButtonElement>()
const searchQuery = ref('')
const showAddDialog = ref(false)
const deleteCandidate = ref<DataSource | null>(null)
const deleteError = ref<string | null>(null)
let deleteReturnFocus: HTMLElement | null = null

const filteredDatasources = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase()
  if (!query) return store.sortedDatasources
  return store.sortedDatasources.filter(datasource => [
    datasource.name,
    datasource.engine,
    datasource.display_name ?? '',
  ].some(value => value.toLocaleLowerCase().includes(query)))
})

onMounted(async () => {
  store.fetchTypes()
  await reloadDatasources()
})

async function reloadDatasources() {
  await store.fetchDatasources()
  if (!store.datasourceListError) await store.checkAllHealth()
}

function selectSource(datasource: DataSource) {
  if (props.mode === 'selector') {
    emit('select', datasource)
    return
  }
  store.selectDatasource(datasource)
}

function closeDetails() {
  store.selectedDatasource = null
  store.tables = []
  store.tableListError = null
}

function openAddDialog() {
  showAddDialog.value = true
}

function requestDelete(datasource: DataSource, event: MouseEvent) {
  store.clearMutationError()
  deleteError.value = null
  deleteReturnFocus = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  deleteCandidate.value = datasource
}

function cancelDelete() {
  if (store.isMutating) return
  store.clearMutationError()
  deleteError.value = null
  deleteCandidate.value = null
  nextTick(() => deleteReturnFocus?.focus())
}

async function confirmDelete() {
  if (!deleteCandidate.value || store.isMutating) return
  store.clearMutationError()
  deleteError.value = null
  const deleted = await store.deleteDatasource(deleteCandidate.value.name)
  if (deleted) {
    deleteCandidate.value = null
    deleteReturnFocus = null
    nextTick(() => managerRef.value?.focus())
    return
  }
  deleteError.value = store.mutationError
}

function closeAddDialog() {
  showAddDialog.value = false
  nextTick(() => addButtonRef.value?.focus())
}
</script>

<template>
  <section
    ref="managerRef"
    class="datasource-manager"
    :class="{ compact: mode === 'compact', selector: mode === 'selector' }"
    aria-labelledby="datasource-manager-title"
    tabindex="-1"
  >
    <header class="hero-header">
      <div class="hero-content">
        <div class="hero-icon" aria-hidden="true">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
          </svg>
        </div>
        <div class="hero-text">
          <h1 id="datasource-manager-title">데이터 소스</h1>
          <p>외부 데이터베이스 및 API 연결을 등록하고 관리합니다</p>
        </div>
      </div>
      <div class="hero-actions">
        <button
          v-if="mode !== 'selector'"
          ref="addButtonRef"
          type="button"
          class="btn-add"
          @click="openAddDialog"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          새 연결 추가
        </button>
        <button
          v-if="mode === 'selector'"
          type="button"
          class="btn-close-selector"
          @click="emit('close')"
        >
          닫기
        </button>
      </div>
    </header>

    <div class="action-bar">
      <label class="search-box">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <span class="sr-only">데이터 소스 검색</span>
        <input v-model="searchQuery" type="search" placeholder="데이터 소스 검색..." />
      </label>
      <div class="stats" aria-live="polite">
        <span class="stat-value">{{ store.datasources.length }}</span>
        <span class="stat-label">연결됨</span>
      </div>
    </div>

    <div
      v-if="store.datasourceListError && store.hasDatasources"
      class="error-alert management-error"
      role="alert"
    >
      <span>{{ store.datasourceListError }}</span>
      <button type="button" class="btn-retry" @click="reloadDatasources">
        다시 시도
      </button>
    </div>

    <div
      v-if="store.mutationError && !showAddDialog && !deleteCandidate"
      class="error-alert management-error"
      role="alert"
    >
      {{ store.mutationError }}
    </div>

    <div class="sources-container">
      <div
        v-if="store.isLoadingDatasources && !store.hasDatasources"
        class="loading-state"
        role="status"
      >
        <div class="loading-spinner" aria-hidden="true" />
        <span>데이터 소스 불러오는 중...</span>
      </div>

      <div
        v-else-if="store.datasourceListError && !store.hasDatasources"
        class="error-state"
        role="alert"
      >
        <div class="error-illustration" aria-hidden="true">!</div>
        <h3>데이터 소스를 불러오지 못했습니다</h3>
        <p>{{ store.datasourceListError }}</p>
        <button type="button" class="btn-retry" @click="reloadDatasources">
          다시 시도
        </button>
      </div>

      <div v-else-if="!store.hasDatasources" class="empty-state">
        <div class="empty-illustration" aria-hidden="true">
          <svg
            width="120"
            height="120"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="0.5"
          >
            <path d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
          </svg>
        </div>
        <h3>등록된 데이터 소스가 없습니다</h3>
        <p>다양한 데이터베이스, API, SaaS 플랫폼과 연결하세요</p>
        <button
          v-if="mode !== 'selector'"
          type="button"
          class="btn-empty-add"
          @click="openAddDialog"
        >
          첫 번째 데이터 소스 추가
        </button>
      </div>

      <div v-else-if="filteredDatasources.length === 0" class="empty-state">
        <h3>검색 결과가 없습니다</h3>
        <p>다른 이름이나 엔진으로 검색해 보세요.</p>
      </div>

      <div v-else class="sources-grid">
        <DataSourceCard
          v-for="source in filteredDatasources"
          :key="source.name"
          :source="source"
          :selected="store.selectedDatasource?.name === source.name"
          :allow-delete="mode !== 'selector'"
          @select="selectSource"
          @delete="requestDelete"
        />
      </div>
    </div>

    <Transition name="slide-up">
      <DataSourceDetailsPanel
        v-if="mode === 'full' && store.selectedDatasource"
        :datasource="store.selectedDatasource"
        :tables="store.tables"
        :loading="store.isLoadingTables"
        :error="store.tableListError"
        @close="closeDetails"
        @retry="store.fetchTables(store.selectedDatasource.name)"
      />
    </Transition>

    <AddDataSourceDialog
      v-if="showAddDialog"
      @close="closeAddDialog"
    />

    <DeleteDataSourceDialog
      v-if="deleteCandidate"
      :datasource="deleteCandidate"
      :pending="store.isMutating"
      :error="deleteError"
      @cancel="cancelDelete"
      @confirm="confirmDelete"
    />
  </section>
</template>

<style scoped lang="scss">
.datasource-manager {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--color-bg);
}

.hero-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 32px 40px;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(139, 92, 246, 0.05) 100%);
  border-bottom: 1px solid var(--color-border);
}

.hero-content,
.hero-actions {
  display: flex;
  align-items: center;
  gap: 20px;
  min-width: 0;
}

.hero-icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  color: white;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  border-radius: 16px;
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.25);
}

.hero-text {
  min-width: 0;

  h1 {
    margin: 0;
    color: var(--color-text);
    font-size: 1.75rem;
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  p {
    margin: 4px 0 0;
    color: var(--color-text-muted);
    font-size: 0.9rem;
  }
}

.btn-add,
.btn-empty-add,
.btn-close-selector {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  color: white;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  border: none;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(99, 102, 241, 0.25);
}

.btn-close-selector {
  color: var(--color-text);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  box-shadow: none;
}

.action-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 16px 40px;
  border-bottom: 1px solid var(--color-border);
}

.search-box {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 320px;
  max-width: 100%;
  padding: 10px 16px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 10px;

  &:focus-within {
    border-color: #6366f1;
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
  }

  svg {
    flex-shrink: 0;
    color: var(--color-text-muted);
  }

  input {
    flex: 1;
    min-width: 0;
    color: var(--color-text);
    font-size: 0.9rem;
    background: none;
    border: none;

    &:focus {
      outline: none;
    }
  }
}

.sr-only {
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

.stats {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.stat-value {
  color: #6366f1;
  font-size: 1.5rem;
  font-weight: 700;
}

.stat-label {
  color: var(--color-text-muted);
  font-size: 0.85rem;
}

.sources-container {
  flex: 1;
  min-height: 0;
  padding: 32px 40px;
  overflow-y: auto;
}

.sources-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

.loading-state,
.empty-state,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 240px;
  gap: 16px;
  color: var(--color-text-muted);
  text-align: center;

  h3,
  p {
    margin: 0;
  }

  h3 {
    color: var(--color-text);
    font-size: 1.25rem;
  }
}

.loading-spinner {
  width: 48px;
  height: 48px;
  border: 3px solid var(--color-border);
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.error-illustration {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  color: #dc2626;
  font-size: 1.75rem;
  font-weight: 700;
  background: color-mix(in srgb, #dc2626 12%, transparent);
  border-radius: 50%;
}

.empty-illustration {
  color: var(--color-text-muted);
  opacity: 0.3;
}

.error-alert {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  color: #f87171;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 10px;
}

.management-error {
  justify-content: space-between;
  margin: 0 24px 16px;

  span {
    min-width: 0;
    overflow-wrap: anywhere;
  }
}

.btn-retry {
  flex-shrink: 0;
  padding: 10px 20px;
  color: var(--color-text);
  font-weight: 600;
  cursor: pointer;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 10px;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(100%);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 600px) {
  .hero-header {
    align-items: flex-start;
    padding: 18px 16px;
  }

  .hero-content {
    gap: 12px;
  }

  .hero-icon {
    width: 44px;
    height: 44px;

    svg {
      width: 32px;
      height: 32px;
    }
  }

  .hero-text {
    h1 {
      font-size: 1.25rem;
    }

    p {
      display: none;
    }
  }

  .btn-add,
  .btn-close-selector {
    padding: 10px 12px;

    svg {
      display: none;
    }
  }

  .action-bar {
    padding: 12px 16px;
  }

  .search-box {
    flex: 1;
    width: auto;
  }

  .sources-container {
    padding: 16px;
  }

  .sources-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
  }

  .management-error {
    margin: 0 16px 12px;
  }
}
</style>
