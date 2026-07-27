<script setup lang="ts">
import { computed, ref } from 'vue'
import type { NodeSearchCandidate } from '@/domains/ontology'
import { useDialogFocusLifecycle } from '@/shared/composables/useDialogFocusLifecycle'
import {
  OBJECT_TYPE_SOURCE,
  type NodeDataSourceCatalogError,
  type NodeDataSourceCatalogTable,
} from '../../composables/useNodeDataSourceCatalog'
import { getOntologyCanvasLayerColor } from '../../model/ontologyGraphElements'

interface DatasourceNode {
  id: string
  name: string
  label: string
  layer?: string
  description?: string
}

const props = defineProps<{
  open: boolean
  pending: boolean
  confirmError: string | null
  currentNode: DatasourceNode | null
  tab: 'search' | 'manual'
  catalogError: NodeDataSourceCatalogError | null
  availableDatasources: readonly string[]
  availableSchemas: readonly string[]
  searchDatasource: string
  searchQuery: string
  searchLoading: boolean
  searchStatus: string
  searchError: string | null
  searchResults: readonly NodeSearchCandidate[]
  selectedSearchResult: number | null
  manualSource: string
  selectedSchema: string
  objectTypeDatasource: string
  tableSearchQuery: string
  loadingTables: boolean
  tables: readonly NodeDataSourceCatalogTable[]
  selectedManualTable: string | null
  nestedDialogOpen: boolean
}>()

const emit = defineEmits<{
  close: []
  retryCatalog: []
  search: []
  preview: [result: NodeSearchCandidate]
  selectResult: [result: NodeSearchCandidate]
  confirm: []
  loadObjectTypes: [datasource: string]
  'update:tab': [value: 'search' | 'manual']
  'update:searchDatasource': [value: string]
  'update:searchQuery': [value: string]
  'update:manualSource': [value: string]
  'update:selectedSchema': [value: string]
  'update:tableSearchQuery': [value: string]
  'update:selectedManualTable': [value: string]
}>()

const dialogRef = ref<HTMLElement | null>(null)
const closeButtonRef = ref<HTMLButtonElement | null>(null)
const layerName = computed(
  () => props.currentNode?.layer || props.currentNode?.label || '',
)
const showCatalogError = computed(
  () => props.catalogError
    && (props.catalogError.stage === 'datasources' || props.tab === 'manual'),
)

function requestClose(): void {
  if (!props.pending) emit('close')
}

function selectValue(event: Event): string {
  return (event.target as HTMLSelectElement).value
}

function inputValue(event: Event): string {
  return (event.target as HTMLInputElement).value
}

useDialogFocusLifecycle({
  active: () => props.open,
  suspended: () => props.nestedDialogOpen,
  dialog: dialogRef,
  requestClose,
  initialFocus: () => closeButtonRef.value,
})
</script>

<template>
  <div v-if="open" class="dialog-overlay" @click.self="requestClose">
    <div
      ref="dialogRef"
      class="node-datasource-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="node-datasource-dialog-title"
      :aria-busy="pending"
      tabindex="-1"
    >
      <div class="dialog-header">
        <h3 id="node-datasource-dialog-title">🔗 데이터 소스 연결: {{ currentNode?.name }}</h3>
        <button
          ref="closeButtonRef"
          type="button"
          class="close-btn"
          aria-label="데이터 소스 연결 닫기"
          :disabled="pending"
          @click="requestClose"
        >
          ✕
        </button>
      </div>

      <div class="dialog-body">
        <div class="node-info-section">
          <div class="node-info-item">
            <span class="label">레이어:</span>
            <span
              class="layer-badge"
              :style="{ backgroundColor: currentNode ? getOntologyCanvasLayerColor(layerName) : '' }"
            >
              {{ layerName }}
            </span>
          </div>
          <div v-if="currentNode?.description" class="node-info-item">
            <span class="label">설명:</span>
            <span>{{ currentNode.description }}</span>
          </div>
        </div>

        <div class="datasource-tabs" role="tablist" aria-label="데이터 소스 연결 방식">
          <button
            type="button"
            role="tab"
            class="tab-btn"
            :class="{ active: tab === 'search' }"
            :aria-selected="tab === 'search'"
            @click="emit('update:tab', 'search')"
          >
            🔍 자연어 검색
          </button>
          <button
            type="button"
            role="tab"
            class="tab-btn"
            :class="{ active: tab === 'manual' }"
            :aria-selected="tab === 'manual'"
            @click="emit('update:tab', 'manual')"
          >
            📋 테이블 선택
          </button>
        </div>

        <div
          v-if="showCatalogError && catalogError"
          class="catalog-load-error"
          role="alert"
          aria-live="assertive"
        >
          <span>{{ catalogError.message }}</span>
          <button type="button" @click="emit('retryCatalog')">다시 시도</button>
        </div>

        <div v-if="tab === 'search'" class="search-tab" role="tabpanel">
          <div class="search-input-section">
            <label for="node-datasource-search-query">검색어 (노드 정보 기반 자동 생성)</label>
            <div class="search-input-wrapper">
              <select
                class="search-datasource-select"
                :value="searchDatasource"
                :disabled="loadingTables"
                :title="searchDatasource || '데이터 소스 선택'"
                aria-label="검색 데이터 소스"
                @change="emit('update:searchDatasource', selectValue($event))"
              >
                <option value="">데이터 소스</option>
                <option v-for="datasource in availableDatasources" :key="datasource" :value="datasource">
                  {{ datasource }}
                </option>
              </select>
              <input
                id="node-datasource-search-query"
                class="search-input"
                type="text"
                :value="searchQuery"
                placeholder="예: 탁도 측정 데이터, KPI 시계열..."
                @input="emit('update:searchQuery', inputValue($event))"
                @keyup.enter="emit('search')"
              />
              <button
                type="button"
                class="search-btn"
                :disabled="searchLoading || !searchDatasource"
                @click="emit('search')"
              >
                {{ searchLoading ? '검색 중...' : '🔍 검색' }}
              </button>
            </div>
            <div class="search-hint">
              {{ !searchDatasource
                ? '⚠️ 데이터 소스를 먼저 선택하세요.'
                : '💡 노드 이름과 레이어를 기반으로 검색어가 자동 생성됩니다. 필요시 수정하세요.' }}
            </div>
            <div v-if="searchStatus" class="search-status" role="status">
              <div v-if="searchLoading" class="search-spinner-small"></div>
              <span>{{ searchStatus }}</span>
            </div>
            <div v-if="searchError" class="operation-error with-action" role="alert">
              <span>{{ searchError }}</span>
              <button type="button" :disabled="searchLoading" @click="emit('search')">다시 시도</button>
            </div>
          </div>

          <div v-if="searchResults.length > 0" class="search-results">
            <h4>검색 결과 ({{ searchResults.length }}개)</h4>
            <div class="result-list">
              <div
                v-for="(result, index) in searchResults"
                :key="`${result.table_name}-${index}`"
                class="result-item"
                :class="{ selected: selectedSearchResult === index }"
              >
                <div class="result-header">
                  <span class="table-icon">📊</span>
                  <strong>{{ result.table_name }}</strong>
                  <span v-if="result.relevance_score !== null" class="relevance-badge">
                    {{ (result.relevance_score * 100).toFixed(0) }}%
                  </span>
                </div>
                <div class="result-meta">
                  <span v-if="result.row_count === null">... rows</span>
                  <span v-else-if="result.row_count === -1">- rows</span>
                  <span v-else-if="result.row_count_approx">{{ result.row_count.toLocaleString() }}+ rows</span>
                  <span v-else>{{ result.row_count.toLocaleString() }} rows</span>
                  <span>{{ result.columns?.length || 0 }} columns</span>
                </div>
                <div class="result-reason">{{ result.match_reason }}</div>
                <div class="result-actions">
                  <button
                    type="button"
                    class="preview-btn"
                    :aria-label="`${result.table_name} 미리보기`"
                    @click="emit('preview', result)"
                  >
                    👁️ 미리보기
                  </button>
                  <button
                    type="button"
                    class="select-btn"
                    :aria-label="`${result.table_name} 선택`"
                    :aria-pressed="selectedSearchResult === index"
                    @click="emit('selectResult', result)"
                  >
                    ✓ 선택
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div v-else-if="searchQuery && !searchLoading && !searchStatus" class="empty-state">
            검색 결과가 없습니다. 다른 검색어를 시도해보세요.
          </div>
        </div>

        <div v-if="tab === 'manual'" class="manual-tab" role="tabpanel">
          <div class="table-selector-section">
            <label>데이터 소스/스키마/테이블 선택</label>
            <div class="table-selector-wrapper">
              <label class="field">
                <span>데이터 소스:</span>
                <select
                  :value="manualSource"
                  @change="emit('update:manualSource', selectValue($event))"
                >
                  <option value="">선택하세요</option>
                  <option v-for="datasource in availableDatasources" :key="datasource" :value="datasource">
                    {{ datasource }}
                  </option>
                  <option :value="OBJECT_TYPE_SOURCE">온톨로지 (ObjectType)</option>
                </select>
              </label>
              <label v-if="manualSource && manualSource !== OBJECT_TYPE_SOURCE" class="field">
                <span>스키마:</span>
                <select
                  :value="selectedSchema"
                  :disabled="!manualSource || loadingTables"
                  @change="emit('update:selectedSchema', selectValue($event))"
                >
                  <option value="">선택하세요</option>
                  <option v-for="schema in availableSchemas" :key="schema" :value="schema">
                    {{ schema }}
                  </option>
                </select>
              </label>
              <label v-if="manualSource === OBJECT_TYPE_SOURCE" class="field">
                <span>실행 데이터 소스:</span>
                <select
                  :value="objectTypeDatasource"
                  :disabled="loadingTables"
                  @change="emit('loadObjectTypes', selectValue($event))"
                >
                  <option value="">선택하세요</option>
                  <option v-for="datasource in availableDatasources" :key="datasource" :value="datasource">
                    {{ datasource }}
                  </option>
                </select>
              </label>
              <input
                class="table-search"
                type="text"
                :value="tableSearchQuery"
                aria-label="테이블 검색"
                placeholder="테이블 검색..."
                @input="emit('update:tableSearchQuery', inputValue($event))"
              />
            </div>

            <div class="table-list-container">
              <div v-if="loadingTables" class="loading-tables" role="status">
                <div class="loading-spinner small"></div>
                <span>테이블 목록 로딩 중...</span>
              </div>
              <div v-else-if="tables.length > 0" class="table-list">
                <button
                  v-for="table in tables"
                  :key="table.fullName"
                  type="button"
                  class="table-item"
                  :class="{ selected: selectedManualTable === table.fullName }"
                  :aria-pressed="selectedManualTable === table.fullName"
                  @click="emit('update:selectedManualTable', table.fullName)"
                >
                  <span class="table-header">
                    <span class="table-icon">📊</span>
                    <strong>{{ table.name }}</strong>
                    <span v-if="table.datasource" class="datasource-badge-small">{{ table.datasource }}</span>
                    <span v-if="table.schema" class="schema-badge">{{ table.schema }}</span>
                    <span v-if="selectedManualTable === table.fullName" class="selected-check">✓</span>
                  </span>
                  <span class="table-meta">{{ table.columnCount || 0 }} 컬럼</span>
                </button>
              </div>
              <div v-else-if="!catalogError" class="empty-state">
                <span v-if="manualSource === OBJECT_TYPE_SOURCE && !objectTypeDatasource">
                  ObjectType을 실행할 데이터 소스를 선택하세요.
                </span>
                <span v-else>테이블을 찾을 수 없습니다.</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="dialog-footer">
        <div v-if="confirmError" class="operation-error confirm-error" role="alert">{{ confirmError }}</div>
        <button type="button" class="cancel-btn" :disabled="pending" @click="requestClose">취소</button>
        <button
          v-if="selectedSearchResult !== null || selectedManualTable"
          type="button"
          class="action-btn primary"
          :disabled="pending"
          @click="emit('confirm')"
        >
          {{ pending ? '연결 확정 중…' : confirmError ? '다시 연결 확정' : '✓ 연결 확정' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped src="./OntologyNodeDatasourceDialog.scss"></style>
