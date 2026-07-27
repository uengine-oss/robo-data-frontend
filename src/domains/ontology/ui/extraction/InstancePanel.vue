<script setup lang="ts">
/**
 * InstancePanel.vue
 * 선택된 온톨로지 노드의 실제 인스턴스 데이터 표시
 * 데이터 소스 바인딩 및 Text2SQL 에이전트를 통한 인스턴스 조회
 */
import { ref, watch, computed } from 'vue'
import { useOntologyStore } from '../../state/extraction'
import type { OntologyNode } from '../../model/schema'
import { storeToRefs } from 'pinia'
import { IconX, IconRefresh, IconDatabase, IconSearch } from '@/shared/icons'
import { useOntologyDataSourceCatalog } from '../../application/useOntologyDataSourceCatalog'
import { ontologyDataSourceCatalogClient } from '../../application/schemaClients'

const props = defineProps<{
  node: OntologyNode
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'open-instance-explorer'): void
}>()

defineSlots<{
  query(props: { refreshInstances: () => Promise<void> }): unknown
}>()

const store = useOntologyStore()
const { instanceData, instanceLoading, instanceError } = storeToRefs(store)

// 로딩 상태 alias
const isLoadingInstances = instanceLoading

// 데이터 제한
const limit = ref(20)

// 데이터 소스 바인딩 상태
const dataSourceCatalog = useOntologyDataSourceCatalog(ontologyDataSourceCatalogClient)
const {
  tables: availableTables,
  loading: isLoadingTables,
  error: dataSourceCatalogError,
} = dataSourceCatalog
const selectedTableKey = ref('')
const tableSearchQuery = ref('')
const isBinding = ref(false)
const isUnbinding = ref(false)
const bindingError = ref<string | null>(null)

// Text2SQL 자동 검색 (더 이상 로컬 상태 필요 없음 - 탭 이동 방식)

// 현재 노드의 인스턴스 데이터
const currentInstances = computed(() => {
  return instanceData.value
})

// 필터된 테이블 목록
const filteredTables = computed(() => {
  if (!tableSearchQuery.value) return availableTables.value
  const query = tableSearchQuery.value.toLowerCase()
  return availableTables.value.filter(table =>
    `${table.schema}.${table.name} ${table.description ?? ''}`.toLowerCase().includes(query),
  )
})
const selectedTable = computed(() =>
  availableTables.value.find(table => tableKey(table) === selectedTableKey.value) ?? null,
)
const dataSourceCatalogErrorMessage = computed(() => {
  if (!dataSourceCatalogError.value) return null
  const retained = availableTables.value.length > 0 ? ' 이전 목록을 유지합니다.' : ''
  return `사용 가능한 테이블을 불러오지 못했습니다: ${dataSourceCatalogError.value}${retained}`
})
const bindingBusy = computed(() =>
  isBinding.value || isUnbinding.value || isLoadingTables.value,
)

// 노드 라벨에 따른 아이콘
const nodeIcon = computed(() => {
  const label = props.node.label.toLowerCase()
  if (label.includes('asset')) return '📦'
  if (label.includes('system')) return '🖥️'
  if (label.includes('event') || label.includes('alarm')) return '⚡'
  return '🔧'
})

// 데이터 로드
async function loadData(dataSource = props.node.dataSource) {
  if (dataSource) {
    await store.loadInstanceData({ ...props.node, dataSource }, limit.value)
  }
}

async function refreshInstances() {
  await loadData()
}

// 사용 가능한 테이블 목록 로드
async function loadAvailableTables() {
  await dataSourceCatalog.refresh()
}

function tableKey(table: { schema: string; name: string }): string {
  return `${table.schema}\u0000${table.name}`
}

function selectTable(table: { schema: string; name: string }) {
  if (bindingBusy.value) return
  bindingError.value = null
  selectedTableKey.value = tableKey(table)
}

// AI 인스턴스 탐색 모달 열기
function openInstanceExplorer() {
  emit('open-instance-explorer')
}

// 데이터 소스 바인딩
async function bindDataSource() {
  const target = selectedTable.value
  if (!target || bindingBusy.value) return

  isBinding.value = true
  bindingError.value = null

  try {
    await store.bindDataSource(props.node.id, target.name, target.schema)
    await loadData(target.name)
  } catch (err) {
    bindingError.value = err instanceof Error ? err.message : '바인딩 실패'
  } finally {
    isBinding.value = false
  }
}

// 데이터 소스 바인딩 해제
async function unbindDataSource() {
  if (bindingBusy.value) return
  isUnbinding.value = true
  bindingError.value = null
  try {
    await store.unbindDataSource(props.node.id)
    selectedTableKey.value = ''
    await loadAvailableTables()
  } catch (err) {
    bindingError.value = err instanceof Error ? err.message : '바인딩 해제 실패'
  } finally {
    isUnbinding.value = false
  }
}

// 노드 변경 시 데이터 로드
watch(() => props.node.id, () => {
  selectedTableKey.value = ''
  bindingError.value = null
  if (props.node.dataSource) {
    void loadData()
  } else {
    void loadAvailableTables()
  }
}, { immediate: true })

// 셀 값 포맷팅
function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'boolean') return value ? '✓' : '✗'
  if (typeof value === 'number') return value.toLocaleString()
  if (value instanceof Date) return value.toLocaleString()
  const str = String(value)
  return str.length > 50 ? str.substring(0, 50) + '...' : str
}

</script>

<template>
  <aside class="instance-panel">
    <!-- 헤더 -->
    <div class="panel-header">
      <div class="header-title">
        <span class="node-icon">{{ nodeIcon }}</span>
        <div class="title-info">
          <h3>{{ node.name }}</h3>
          <span class="node-label-badge">{{ node.label }}</span>
        </div>
      </div>
      <button type="button" class="close-btn" aria-label="인스턴스 패널 닫기" @click="emit('close')">
        <IconX :size="18" />
      </button>
    </div>

    <!-- 노드 정보 -->
    <div class="node-info">
      <div v-if="node.description" class="info-item">
        <span class="info-label">설명</span>
        <span class="info-value">{{ node.description }}</span>
      </div>

      <!-- 데이터 소스가 바인딩된 경우 -->
      <div v-if="node.dataSource" class="info-item">
        <span class="info-label">데이터 소스</span>
        <div class="data-source-bound">
          <span class="info-value data-source">
            <IconDatabase :size="14" />
            {{ node.dataSource }}
          </span>
          <button
            type="button"
            class="unbind-btn"
            :disabled="bindingBusy"
            :aria-busy="isUnbinding"
            :aria-label="`${node.name} 데이터 소스 바인딩 해제`"
            @click="unbindDataSource"
            title="바인딩 해제"
          >
            <span v-if="isUnbinding" class="spinner-small"></span>
            <IconX v-else :size="12" />
          </button>
        </div>
      </div>
      <div
        v-if="node.dataSource && bindingError"
        class="binding-error"
        role="alert"
        aria-live="assertive"
      >
        {{ bindingError }}
      </div>

      <div class="info-item">
        <span class="info-label">인스턴스 수</span>
        <span class="info-value count">{{ node.instanceCount || 0 }}</span>
      </div>
    </div>

    <!-- 데이터 소스 바인딩 UI (바인딩되지 않은 경우) -->
    <div v-if="!node.dataSource" class="binding-section">
      <div class="binding-header">
        <span class="binding-title">🔗 데이터 소스 연결</span>
        <button
          class="auto-search-btn"
          @click="openInstanceExplorer"
          title="AI로 인스턴스 데이터 탐색 및 생성"
        >
          <IconSearch :size="14" />
          AI 인스턴스 탐색
        </button>
      </div>

      <!-- 테이블 검색 -->
      <div class="table-search">
        <input
          v-model="tableSearchQuery"
          type="text"
          :disabled="bindingBusy"
          placeholder="테이블 검색..."
          class="search-input"
        />
      </div>

      <!-- 테이블 목록 -->
      <div v-if="isLoadingTables && availableTables.length === 0" class="loading-tables" role="status">
        <span class="spinner-small"></span>
        <span>테이블 목록 로딩 중...</span>
      </div>

      <div
        v-if="dataSourceCatalogErrorMessage"
        class="catalog-error"
        role="alert"
        aria-live="assertive"
      >
        <span>{{ dataSourceCatalogErrorMessage }}</span>
        <button type="button" class="reload-btn" :disabled="bindingBusy" @click="loadAvailableTables">
          <IconRefresh :size="12" /> 다시 시도
        </button>
      </div>

      <div
        v-else-if="!isLoadingTables && filteredTables.length === 0"
        class="no-tables"
        role="status"
      >
        <span>사용 가능한 테이블이 없습니다</span>
        <button type="button" class="reload-btn" :disabled="bindingBusy" @click="loadAvailableTables">
          <IconRefresh :size="12" /> 새로고침
        </button>
      </div>

      <div v-if="filteredTables.length > 0" class="table-list">
        <button
          v-for="table in filteredTables"
          :key="tableKey(table)"
          type="button"
          :disabled="bindingBusy"
          :class="['table-item', { selected: selectedTableKey === tableKey(table) }]"
          :aria-pressed="selectedTableKey === tableKey(table)"
          @click="selectTable(table)"
        >
          <IconDatabase :size="14" />
          <span>{{ table.schema }}.{{ table.name }}</span>
        </button>
      </div>

      <!-- 바인딩 버튼 -->
      <div class="binding-actions">
        <button
          class="bind-btn"
          :disabled="!selectedTable || bindingBusy"
          :aria-busy="isBinding"
          @click="bindDataSource"
        >
          <span v-if="isBinding" class="spinner-small"></span>
          <span v-else>🔗</span>
          {{ isBinding ? '연결 중...' : '데이터 소스 연결' }}
        </button>
      </div>

      <!-- 에러 메시지 -->
      <div
        v-if="!node.dataSource && bindingError"
        class="binding-error"
        role="alert"
        aria-live="assertive"
      >
        {{ bindingError }}
      </div>
    </div>

    <!-- 데이터 테이블 (바인딩된 경우만 표시) -->
    <div v-if="node.dataSource" class="data-section">
      <div class="section-header">
        <span class="section-title">인스턴스 데이터</span>
        <div class="section-actions">
          <select v-model="limit" aria-label="인스턴스 조회 개수" @change="loadData()">
            <option :value="10">10건</option>
            <option :value="20">20건</option>
            <option :value="50">50건</option>
            <option :value="100">100건</option>
          </select>
          <button
            type="button"
            class="refresh-btn"
            aria-label="인스턴스 데이터 새로고침"
            @click="loadData()"
            :disabled="isLoadingInstances"
          >
            <IconRefresh :size="14" :class="{ spinning: isLoadingInstances }" />
          </button>
        </div>
      </div>

      <!-- 로딩 -->
      <div v-if="isLoadingInstances" class="loading-state">
        <span class="spinner"></span>
        <span>데이터 조회 중...</span>
      </div>

      <!-- 데이터 없음 -->
      <div
        v-else-if="instanceError"
        class="instance-error"
        role="alert"
        aria-live="assertive"
      >
        <span>{{ instanceError }}</span>
        <button type="button" :disabled="isLoadingInstances" @click="loadData()">
          다시 시도
        </button>
      </div>

      <!-- 데이터 없음 -->
      <div v-else-if="!currentInstances || currentInstances.previewData.rows.length === 0" class="empty-state">
        <span class="empty-icon">📭</span>
        <span>인스턴스 데이터가 없습니다</span>
      </div>

      <!-- 데이터 테이블 -->
      <div v-else class="data-table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th v-for="col in currentInstances.previewData.columns" :key="col">{{ col }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, idx) in currentInstances.previewData.rows" :key="idx">
              <td v-for="(cell, cidx) in row" :key="cidx" :title="String(cell)">
                {{ formatCell(cell) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 실행 정보 -->
      <div v-if="currentInstances && currentInstances.totalCount" class="exec-info">
        <span>{{ currentInstances.totalCount }}건 조회</span>
      </div>
    </div>

    <!-- 데이터 소스 미연결 안내 -->
    <div v-else class="no-datasource-hint">
      <span class="hint-icon">💡</span>
      <span>위에서 데이터 소스를 연결하면 실제 인스턴스 데이터를 조회할 수 있습니다.</span>
    </div>

    <!-- 자연어 검색 및 인스턴스 생성 -->
    <div class="query-section">
      <slot name="query" :refresh-instances="refreshInstances"></slot>
    </div>
  </aside>
</template>

<style scoped lang="scss">
.instance-panel {
  width: 400px;
  min-width: 350px;
  max-width: 500px;
  background: var(--color-bg-secondary);
  border-left: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-tertiary);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 12px;

  .node-icon {
    font-size: 24px;
  }

  .title-info {
    display: flex;
    flex-direction: column;
    gap: 4px;

    h3 {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
      color: var(--color-text-bright);
    }

    .node-label-badge {
      font-size: 0.7rem;
      padding: 2px 8px;
      background: var(--color-accent);
      color: white;
      border-radius: 10px;
      width: fit-content;
    }
  }
}

.close-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: var(--color-bg-hover);
    color: var(--color-text);
  }
}

.node-info {
  padding: 16px;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;

  .info-label {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .info-value {
    font-size: 0.9rem;
    color: var(--color-text);

    &.data-source {
      display: flex;
      align-items: center;
      gap: 6px;
      font-family: 'JetBrains Mono', monospace;
      color: #38bdf8;
    }

    &.count {
      font-weight: 600;
      color: #34d399;
    }
  }
}

.data-source-bound {
  display: flex;
  align-items: center;
  gap: 8px;

  .unbind-btn {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      background: var(--color-error);
      border-color: var(--color-error);
      color: white;
    }
  }
}

// 데이터 소스 바인딩 섹션
.binding-section {
  padding: 16px;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.binding-header {
  display: flex;
  align-items: center;
  justify-content: space-between;

  .binding-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--color-text);
  }
}

.auto-search-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: linear-gradient(135deg, #a78bfa, #7c3aed);
  border: none;
  border-radius: 6px;
  color: white;
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(167, 139, 250, 0.4);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .spinning {
    animation: spin 1s linear infinite;
  }
}

.auto-search-result {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: rgba(52, 211, 153, 0.1);
  border: 1px solid rgba(52, 211, 153, 0.3);
  border-radius: 8px;
  font-size: 0.85rem;
  color: #34d399;

  .result-icon {
    font-size: 1rem;
  }

  strong {
    font-family: 'JetBrains Mono', monospace;
  }
}

.table-search {
  .search-input {
    width: 100%;
    padding: 10px 12px;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    color: var(--color-text);
    font-size: 0.85rem;

    &::placeholder {
      color: var(--color-text-muted);
    }

    &:focus {
      outline: none;
      border-color: var(--color-accent);
    }
  }
}

.loading-tables,
.no-tables {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
  color: var(--color-text-muted);
  font-size: 0.85rem;
}

.reload-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-text);
  font-size: 0.75rem;
  cursor: pointer;

  &:hover {
    border-color: var(--color-accent);
  }

  &:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.55;
    cursor: wait;
  }
}

.catalog-error,
.instance-error {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  background: color-mix(in srgb, var(--color-error) 12%, var(--color-bg-secondary));
  border: 1px solid color-mix(in srgb, var(--color-error) 55%, var(--color-border));
  border-radius: 8px;
  color: var(--color-error);
  font-size: 0.82rem;
  line-height: 1.4;

  > span {
    flex: 1 1 auto;
    min-width: 0;
    overflow-wrap: anywhere;
  }
}

.instance-error {
  margin: 16px;

  button {
    flex: 0 0 auto;
    padding: 5px 9px;
    border: 1px solid currentColor;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
}

.table-list {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid var(--color-border);
  border-radius: 8px;

  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--color-border);
    border-radius: 2px;
  }
}

.table-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  font-size: 0.85rem;
  font-family: 'JetBrains Mono', monospace;
  color: var(--color-text);
  background: transparent;
  border: 0;
  cursor: pointer;
  transition: all 0.15s;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  text-align: left;

  &:last-child {
    border-bottom: none;
  }

  &:hover:not(:disabled) {
    background: var(--color-bg-hover);
  }

  &.selected {
    background: rgba(56, 189, 248, 0.15);
    color: #38bdf8;
  }

  &:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: -2px;
  }

  &:disabled {
    opacity: 0.6;
    cursor: wait;
  }
}

.binding-actions {
  display: flex;
  justify-content: flex-end;
}

.bind-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  background: linear-gradient(135deg, #38bdf8, #0ea5e9);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(56, 189, 248, 0.4);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.binding-error {
  padding: 10px 12px;
  background: color-mix(in srgb, var(--color-error) 12%, var(--color-bg-secondary));
  border: 1px solid color-mix(in srgb, var(--color-error) 55%, var(--color-border));
  border-radius: 8px;
  font-size: 0.85rem;
  color: var(--color-error);
  overflow-wrap: anywhere;
}

.spinner-small {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.no-datasource-hint {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 0.85rem;
  line-height: 1.5;

  .hint-icon {
    font-size: 24px;
  }
}

.data-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--color-bg-tertiary);

  .section-title {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--color-text-light);
  }

  .section-actions {
    display: flex;
    align-items: center;
    gap: 8px;

    select {
      padding: 4px 8px;
      background: var(--color-bg);
      border: 1px solid var(--color-border);
      border-radius: 6px;
      color: var(--color-text);
      font-size: 0.8rem;
      cursor: pointer;
    }

    .refresh-btn {
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-bg);
      border: 1px solid var(--color-border);
      border-radius: 6px;
      color: var(--color-text);
      cursor: pointer;
      transition: all 0.2s;

      &:hover:not(:disabled) {
        border-color: var(--color-accent);
        color: var(--color-accent);
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .spinning {
        animation: spin 1s linear infinite;
      }
    }
  }
}

.loading-state,
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--color-text-muted);
  font-size: 0.9rem;
}

.empty-icon {
  font-size: 32px;
  opacity: 0.5;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.data-table-wrapper {
  flex: 1;
  overflow: auto;

  &::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--color-border);
    border-radius: 3px;
  }
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;

  thead {
    position: sticky;
    top: 0;
    background: var(--color-bg-tertiary);
    z-index: 1;
  }

  th {
    padding: 10px 12px;
    text-align: left;
    font-weight: 600;
    color: var(--color-text-muted);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    border-bottom: 1px solid var(--color-border);
    white-space: nowrap;
  }

  td {
    padding: 8px 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    color: var(--color-text);
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  tbody tr {
    transition: background 0.15s;

    &:hover {
      background: rgba(56, 189, 248, 0.05);
    }
  }
}

.exec-info {
  padding: 8px 16px;
  background: var(--color-bg-tertiary);
  border-top: 1px solid var(--color-border);
  font-size: 0.75rem;
  color: var(--color-text-muted);
  display: flex;
  gap: 4px;
}

.query-section {
  padding: 16px;
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
