<script setup lang="ts">
import { computed, ref } from 'vue'
import { IconChevronDown } from '@/shared/icons'
import type {
  BulkExtractResponse,
  BulkFieldStatistic,
  BulkImportResponse,
  BulkTermCandidate,
} from '../api.ts'
import {
  filterAndSortBulkCandidates,
  updateBulkCandidate,
  type BulkCandidateEditableField,
  type BulkCandidateSortDirection,
  type BulkCandidateSortKey,
} from '../application/bulkUploadDraft.ts'
import { BULK_TERM_STATUS_OPTIONS } from './bulkUploadPresentation.ts'

const props = defineProps<{
  extractResult: BulkExtractResponse | null
  importResult: BulkImportResponse | null
  candidates: BulkTermCandidate[]
  selectedRowIndexes: number[]
  searchQuery: string
  statusFilter: string
  emptyOnly: boolean
  sortKey: BulkCandidateSortKey
  sortDirection: BulkCandidateSortDirection
  rollingBack: boolean
}>()

const emit = defineEmits<{
  'update:candidates': [candidates: BulkTermCandidate[]]
  'update:selectedRowIndexes': [indexes: number[]]
  'update:searchQuery': [query: string]
  'update:statusFilter': [status: string]
  'update:emptyOnly': [enabled: boolean]
  'update:sortKey': [key: BulkCandidateSortKey]
  'update:sortDirection': [direction: BulkCandidateSortDirection]
  rollback: []
  close: []
}>()

const rowHeight = 58
const overscan = 6
const previewViewportHeight = 420
const previewScrollTop = ref(0)

const filteredCandidates = computed(() =>
  filterAndSortBulkCandidates(props.candidates, {
    searchQuery: props.searchQuery,
    status: props.statusFilter,
    emptyOnly: props.emptyOnly,
    sortKey: props.sortKey,
    sortDirection: props.sortDirection,
  }),
)
const selectedRowSet = computed(() => new Set(props.selectedRowIndexes))
const selectedCount = computed(() => props.selectedRowIndexes.length)
const totalPreviewHeight = computed(() => filteredCandidates.value.length * rowHeight)
const virtualStartIndex = computed(() =>
  Math.max(0, Math.floor(previewScrollTop.value / rowHeight) - overscan),
)
const visibleRowCount = computed(
  () => Math.ceil(previewViewportHeight / rowHeight) + overscan * 2,
)
const visibleRows = computed(() =>
  filteredCandidates.value
    .slice(virtualStartIndex.value, virtualStartIndex.value + visibleRowCount.value)
    .map((item, localIndex) => ({
      item,
      top: (virtualStartIndex.value + localIndex) * rowHeight,
    })),
)

const fieldStatisticsSummary = computed(() => {
  if (!props.extractResult) return []
  const fields = props.extractResult.field_statistics
  return [
    buildFieldSummary('name', fields.name),
    buildFieldSummary('description', fields.description),
    buildFieldSummary('status', fields.status),
    buildFieldSummary('synonyms', fields.synonyms),
    buildFieldSummary('domains', fields.domains),
  ].filter(Boolean)
})

function buildFieldSummary(label: string, stat?: BulkFieldStatistic) {
  if (!stat) return ''
  if (label === 'status' && stat.distribution) {
    const distribution = Object.entries(stat.distribution)
      .map(([key, value]) => `${key} ${value}건`)
      .join(', ')
    return `${label} ${stat.filled}건 (${distribution || '분포 없음'})`
  }
  return `${label} ${stat.filled}건 (${stat.empty}건 빈값)`
}

function controlValue(event: Event): string {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) {
    return event.target.value
  }
  return ''
}

function controlChecked(event: Event): boolean {
  return event.target instanceof HTMLInputElement && event.target.checked
}

function updateSortKey(rawValue: string) {
  if (
    rawValue === 'name' ||
    rawValue === 'description' ||
    rawValue === 'status' ||
    rawValue === 'domains'
  ) {
    emit('update:sortKey', rawValue)
  }
}

function onPreviewScroll(event: Event) {
  if (!(event.target instanceof HTMLElement)) return
  previewScrollTop.value = event.target.scrollTop
}

function toggleRowSelection(rowIndex: number, checked: boolean) {
  const next = new Set(props.selectedRowIndexes)
  if (checked) next.add(rowIndex)
  else next.delete(rowIndex)
  emit('update:selectedRowIndexes', [...next])
}

function toggleAllFilteredRows(checked: boolean) {
  emit(
    'update:selectedRowIndexes',
    checked ? filteredCandidates.value.map(candidate => candidate.row_index) : [],
  )
}

function updateCandidateField(
  rowIndex: number,
  key: BulkCandidateEditableField,
  value: string,
) {
  emit('update:candidates', updateBulkCandidate(props.candidates, rowIndex, key, value))
}
</script>

<template>
  <section class="step-section preview-step">
    <div v-if="extractResult" class="summary-panel">
      <div class="summary-line">
        <strong>전체 {{ extractResult.total }}건</strong>
        <span v-for="summary in fieldStatisticsSummary" :key="summary">{{ summary }}</span>
      </div>
      <div v-if="extractResult.unmapped_columns.length > 0" class="summary-line warn-text">
        ⚠ 매핑되지 않은 칼럼: {{ extractResult.unmapped_columns.join(', ') }}
      </div>
      <div v-if="extractResult.join_statistics.length > 0" class="summary-line">
        🔗
        <span v-for="stat in extractResult.join_statistics" :key="stat.rule">
          {{ stat.rule }} {{ stat.matched }}건 매칭 ({{ stat.unmatched }}건 미매칭)
        </span>
      </div>
    </div>

    <div class="preview-toolbar">
      <input
        :value="searchQuery"
        type="text"
        class="search-input"
        placeholder="name / description 검색"
        @input="emit('update:searchQuery', controlValue($event))"
      />

      <div class="select-wrapper compact">
        <select
          :value="statusFilter"
          @change="emit('update:statusFilter', controlValue($event))"
        >
          <option value="">모든 상태</option>
          <option
            v-for="status in BULK_TERM_STATUS_OPTIONS"
            :key="status.value"
            :value="status.value"
          >
            {{ status.label }}
          </option>
        </select>
        <IconChevronDown :size="14" />
      </div>

      <label class="checkbox-inline">
        <input
          :checked="emptyOnly"
          type="checkbox"
          @change="emit('update:emptyOnly', controlChecked($event))"
        />
        빈 값만 보기
      </label>

      <div class="select-wrapper compact">
        <select
          :value="sortKey"
          @change="updateSortKey(controlValue($event))"
        >
          <option value="name">이름 정렬</option>
          <option value="description">설명 정렬</option>
          <option value="status">상태 정렬</option>
          <option value="domains">도메인 정렬</option>
        </select>
        <IconChevronDown :size="14" />
      </div>

      <button
        class="btn-text"
        type="button"
        @click="
          emit('update:sortDirection', sortDirection === 'asc' ? 'desc' : 'asc')
        "
      >
        {{ sortDirection === 'asc' ? '오름차순' : '내림차순' }}
      </button>

      <button class="btn-text" type="button" @click="toggleAllFilteredRows(true)">전체 선택</button>
      <button class="btn-text" type="button" @click="toggleAllFilteredRows(false)">전체 해제</button>
    </div>

    <div class="preview-header-row">
      <span class="col-check">
        <input
          type="checkbox"
          :checked="selectedCount > 0 && selectedCount === filteredCandidates.length"
          @change="toggleAllFilteredRows(controlChecked($event))"
        />
      </span>
      <span class="col-name">이름</span>
      <span class="col-description">설명</span>
      <span class="col-status">상태</span>
      <span class="col-domains">도메인</span>
      <span class="col-synonyms">동의어</span>
    </div>

    <div class="virtual-list" @scroll="onPreviewScroll">
      <div class="virtual-spacer" :style="{ height: `${totalPreviewHeight}px` }">
        <div
          v-for="row in visibleRows"
          :key="row.item.row_index"
          class="preview-row"
          :class="{ warn: !row.item.name || !row.item.description }"
          :style="{ transform: `translateY(${row.top}px)` }"
        >
          <span class="col-check">
            <input
              :checked="selectedRowSet.has(row.item.row_index)"
              type="checkbox"
              @change="toggleRowSelection(row.item.row_index, controlChecked($event))"
            />
          </span>
          <span class="col-name">
            <input
              :value="row.item.name"
              type="text"
              @input="updateCandidateField(row.item.row_index, 'name', controlValue($event))"
            />
          </span>
          <span class="col-description">
            <input
              :value="row.item.description"
              type="text"
              @input="
                updateCandidateField(row.item.row_index, 'description', controlValue($event))
              "
            />
          </span>
          <span class="col-status">
            <div class="select-wrapper compact">
              <select
                :value="row.item.status"
                @change="
                  updateCandidateField(row.item.row_index, 'status', controlValue($event))
                "
              >
                <option
                  v-for="status in BULK_TERM_STATUS_OPTIONS"
                  :key="status.value"
                  :value="status.value"
                >
                  {{ status.label }}
                </option>
              </select>
              <IconChevronDown :size="14" />
            </div>
          </span>
          <span class="col-domains">{{ row.item.domains.join(', ') || '-' }}</span>
          <span class="col-synonyms">{{ row.item.synonyms.join(', ') || '-' }}</span>
        </div>
      </div>
    </div>

    <div v-if="importResult" class="result-panel">
      <h3>가져오기 완료</h3>
      <p>
        {{ importResult.created }}건 생성, {{ importResult.skipped }}건 스킵, 신규 도메인
        {{ importResult.domains_created }}개
      </p>
      <p v-if="importResult.unmapped_columns_reminder.length > 0">
        매핑되지 않은 칼럼: {{ importResult.unmapped_columns_reminder.join(', ') }}
      </p>
      <div class="result-actions">
        <button
          class="btn-secondary"
          type="button"
          :disabled="rollingBack"
          @click="emit('rollback')"
        >
          {{ rollingBack ? '되돌리는 중...' : '이 배치 되돌리기' }}
        </button>
        <button class="btn-primary" type="button" @click="emit('close')">닫기</button>
      </div>
      <div class="next-steps">
        <p v-for="(item, index) in importResult.next_steps" :key="index">{{ item }}</p>
      </div>
    </div>
  </section>
</template>
