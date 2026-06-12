<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useSessionStore } from '@/stores/session'
import {
  glossaryApi,
  type BulkColumnSelection,
  type BulkConfirmedMapping,
  type BulkExtractRequest,
  type BulkExtractResponse,
  type BulkFieldStatistic,
  type BulkImportResponse,
  type BulkJoinRule,
  type BulkTermCandidate,
  type BulkUploadResponse
} from '@/services/api'
import { IconAlertTriangle, IconCheck, IconChevronDown, IconRefresh, IconUpload, IconX } from '@/shared/icons'

const props = defineProps<{
  glossaryId: string
}>()

const emit = defineEmits<{
  close: []
  imported: []
}>()

const sessionStore = useSessionStore()

const step = ref<1 | 2 | 3>(1)
const files = ref<File[]>([])
const uploadResponse = ref<BulkUploadResponse | null>(null)
const confirmedMapping = ref<BulkConfirmedMapping>({
  term_source_file: '',
  term_name_column: null,
  term_description_column: null,
  term_status_column: null,
  term_status_fixed: null,
  term_synonyms_column: null,
  term_domains_column: null
})
const confirmedJoins = ref<Array<BulkJoinRule & { enabled: boolean }>>([])
const valueTransforms = ref<Array<{ source: string; target: string }>>([])
const useAiEnrichment = ref(false)
const extractResult = ref<BulkExtractResponse | null>(null)
const editableCandidates = ref<BulkTermCandidate[]>([])
const importResult = ref<BulkImportResponse | null>(null)
const selectedRowIndexes = ref<number[]>([])
const uploading = ref(false)
const extracting = ref(false)
const importing = ref(false)
const rollingBack = ref(false)
const extractAbortController = ref<AbortController | null>(null)
const persistenceDisabled = ref(false)
const uploadPhaseMessage = ref('')
const error = ref<string | null>(null)
const extractionProgress = ref<{ processed: number; total: number; estimated_remaining_seconds?: number } | null>(null)
const searchQuery = ref('')
const statusFilter = ref('')
const emptyOnly = ref(false)
const sortKey = ref<'name' | 'description' | 'status' | 'domains'>('name')
const sortDirection = ref<'asc' | 'desc'>('asc')
const previewScrollTop = ref(0)

const rowHeight = 58
const overscan = 6
const previewViewportHeight = 420
const storageKey = computed(() => `glossary-bulk-upload:${props.glossaryId}`)

const stepMeta = [
  { id: 1, label: '파일 업로드' },
  { id: 2, label: 'AI 분석 확인' },
  { id: 3, label: '미리보기 & 가져오기' }
]

const activeSourceFile = computed(() => {
  if (!uploadResponse.value) return null
  return uploadResponse.value.files.find(file => file.filename === confirmedMapping.value.term_source_file) ?? null
})

const sourceFileTotalRows = computed(() => activeSourceFile.value?.total_rows ?? 0)
const estimatedAiMinutes = computed(() => Math.ceil((sourceFileTotalRows.value * 2) / 60))

const aggregatedUnmappedColumns = computed(() => {
  const columns = uploadResponse.value?.files.flatMap(file => file.unmapped_columns ?? []) ?? []
  return Array.from(new Set(columns))
})

const activeJoinRules = computed(() => confirmedJoins.value.filter(rule => rule.enabled))
const selectedRowSet = computed(() => new Set(selectedRowIndexes.value))
const selectedCount = computed(() => selectedRowIndexes.value.length)

const mappingHelpText: Record<string, string> = {
  name: '용어 자체를 식별하는 대표 이름입니다.',
  description: '용어의 의미를 설명하는 문장입니다.',
  status: '용어의 승인 상태입니다. 초안, 검토중, 승인됨, 폐기됨 중 하나로 들어갑니다.',
  synonyms: '같은 뜻을 가지는 다른 표현들의 목록입니다.',
  domains: '용어가 속하는 업무 분류 카테고리입니다.'
}

const sourceColumnOptions = computed(() => {
  if (!uploadResponse.value || !confirmedMapping.value.term_source_file) return []
  const sourceFile = uploadResponse.value.files.find(file => file.filename === confirmedMapping.value.term_source_file)
  return (sourceFile?.headers ?? []).map(header => ({
    label: header,
    value: header as BulkColumnSelection
  }))
})

const joinedColumnOptions = computed(() => {
  if (!uploadResponse.value || !confirmedMapping.value.term_source_file) return []

  return activeJoinRules.value.flatMap(rule => {
    const relatedFileName =
      rule.left_file === confirmedMapping.value.term_source_file
        ? rule.right_file
        : rule.right_file === confirmedMapping.value.term_source_file
          ? rule.left_file
          : ''

    if (!relatedFileName) return []

    const relatedFile = uploadResponse.value?.files.find(file => file.filename === relatedFileName)
    if (!relatedFile) return []

    return relatedFile.headers.map(header => ({
      label: `📎 ${relatedFileName} > ${header}`,
      value: {
        source: 'joined',
        file: relatedFileName,
        column: header,
        join_rule_index: confirmedJoins.value.findIndex(
          candidate =>
            candidate.left_file === rule.left_file &&
            candidate.left_column === rule.left_column &&
            candidate.right_file === rule.right_file &&
            candidate.right_column === rule.right_column
        )
      } as BulkColumnSelection
    }))
  })
})

const columnOptions = computed(() => [
  { label: '(사용 안 함)', value: null as BulkColumnSelection },
  ...sourceColumnOptions.value,
  ...joinedColumnOptions.value
])

const filteredCandidates = computed(() => {
  let result = editableCandidates.value

  if (searchQuery.value.trim()) {
    const query = searchQuery.value.trim().toLowerCase()
    result = result.filter(candidate =>
      candidate.name.toLowerCase().includes(query) ||
      candidate.description.toLowerCase().includes(query)
    )
  }

  if (statusFilter.value) {
    result = result.filter(candidate => candidate.status === statusFilter.value)
  }

  if (emptyOnly.value) {
    result = result.filter(candidate => !candidate.name || !candidate.description)
  }

  const sorted = [...result]
  sorted.sort((left, right) => {
    const leftValue =
      sortKey.value === 'domains'
        ? left.domains.join(', ')
        : String(left[sortKey.value] ?? '')
    const rightValue =
      sortKey.value === 'domains'
        ? right.domains.join(', ')
        : String(right[sortKey.value] ?? '')

    const compareResult = leftValue.localeCompare(rightValue, 'ko')
    return sortDirection.value === 'asc' ? compareResult : -compareResult
  })

  return sorted
})

const totalPreviewHeight = computed(() => filteredCandidates.value.length * rowHeight)
const virtualStartIndex = computed(() => Math.max(0, Math.floor(previewScrollTop.value / rowHeight) - overscan))
const visibleRowCount = computed(() => Math.ceil(previewViewportHeight / rowHeight) + overscan * 2)
const visibleRows = computed(() =>
  filteredCandidates.value
    .slice(virtualStartIndex.value, virtualStartIndex.value + visibleRowCount.value)
    .map((item, localIndex) => ({
      item,
      top: (virtualStartIndex.value + localIndex) * rowHeight
    }))
)

const fieldStatisticsSummary = computed(() => {
  if (!extractResult.value) return []
  const fields = extractResult.value.field_statistics
  return [
    buildFieldSummary('name', fields.name),
    buildFieldSummary('description', fields.description),
    buildFieldSummary('status', fields.status),
    buildFieldSummary('synonyms', fields.synonyms),
    buildFieldSummary('domains', fields.domains)
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

function selectionToString(value: BulkColumnSelection): string {
  return value == null ? '' : JSON.stringify(value)
}

function stringToSelection(value: string): BulkColumnSelection {
  if (!value) return null
  try {
    return JSON.parse(value) as BulkColumnSelection
  } catch {
    return value
  }
}

function setMappingValue(key: keyof BulkConfirmedMapping, rawValue: string) {
  confirmedMapping.value = {
    ...confirmedMapping.value,
    [key]: stringToSelection(rawValue)
  }
}

function setFixedStatus(rawValue: string) {
  confirmedMapping.value = {
    ...confirmedMapping.value,
    term_status_fixed: rawValue
      ? rawValue as NonNullable<BulkConfirmedMapping['term_status_fixed']>
      : null
  }
}

function setFilesFromInput(event: Event) {
  const target = event.target as HTMLInputElement
  files.value = Array.from(target.files ?? [])
}

function onPreviewScroll(event: Event) {
  previewScrollTop.value = (event.target as HTMLElement).scrollTop
}

function getConfidenceLabel(confidence = 0) {
  if (confidence >= 0.85) return '높음'
  if (confidence >= 0.6) return '중간'
  return '낮음'
}

function getStatusOptions() {
  return [
    { value: 'Draft', label: '초안' },
    { value: 'Pending', label: '검토중' },
    { value: 'Approved', label: '승인됨' },
    { value: 'Deprecated', label: '폐기됨' }
  ]
}

function hydrateFromUploadResult(result: BulkUploadResponse) {
  uploadResponse.value = result
  step.value = 2

  const sourceFileName = result.term_source_file ?? result.files[0]?.filename ?? ''
  const sourceFile = result.files.find(file => file.filename === sourceFileName)
  const sourceMapping = sourceFile?.column_mapping ?? {}

  const wordFile = result.files.find(file => file.role === 'word_dictionary')
  const wordJoinIndex = result.join_rules.findIndex(
    joinRule =>
      joinRule.left_file === sourceFileName &&
      joinRule.right_file === wordFile?.filename
  )

  confirmedMapping.value = {
    term_source_file: sourceFileName,
    term_name_column: sourceMapping.term_name ?? null,
    term_description_column: sourceMapping.term_description ?? null,
    term_status_column: sourceMapping.term_status ?? null,
    term_status_fixed: null,
    term_synonyms_column:
      sourceMapping.term_synonyms ??
      (wordFile?.column_mapping?.word_synonyms && wordJoinIndex >= 0
        ? {
            source: 'joined',
            file: wordFile.filename,
            column: wordFile.column_mapping.word_synonyms,
            join_rule_index: wordJoinIndex
          }
        : null),
    term_domains_column: sourceMapping.term_domains ?? null
  }

  confirmedJoins.value = result.join_rules.map(rule => ({ ...rule, enabled: true }))
}

function buildExtractRequest(): BulkExtractRequest {
  const transforms = valueTransforms.value.reduce<Record<string, Record<string, string>>>((acc, row) => {
    if (!row.source || !row.target) return acc
    if (!acc.term_status) acc.term_status = {}
    acc.term_status[row.source] = row.target
    return acc
  }, {})

  return {
    session_id: uploadResponse.value?.session_id ?? '',
    confirmed_mapping: confirmedMapping.value,
    confirmed_joins: activeJoinRules.value.map(({ enabled, ...rule }) => rule),
    value_transforms: transforms,
    use_ai_enrichment: useAiEnrichment.value
  }
}

async function uploadFiles() {
  if (files.value.length === 0) {
    error.value = '업로드할 파일을 선택해주세요.'
    return
  }

  uploading.value = true
  error.value = null
  uploadPhaseMessage.value = '파일을 읽고 있습니다...'
  const phaseTimer = window.setTimeout(() => {
    uploadPhaseMessage.value = 'AI가 파일 구조를 분석하고 있습니다...'
  }, 700)

  try {
    const headers = sessionStore.getHeaders()
    const result = await glossaryApi.bulkUploadTerms(headers, props.glossaryId, files.value)
    hydrateFromUploadResult(result)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '파일 업로드에 실패했습니다.'
  } finally {
    window.clearTimeout(phaseTimer)
    uploadPhaseMessage.value = ''
    uploading.value = false
  }
}

function initializeEditableCandidates(result: BulkExtractResponse) {
  extractResult.value = result
  editableCandidates.value = result.term_candidates.map(candidate => ({
    ...candidate,
    synonyms: [...candidate.synonyms],
    domains: [...candidate.domains],
    tags: [...candidate.tags]
  }))
  selectedRowIndexes.value = editableCandidates.value.map(candidate => candidate.row_index)
  importResult.value = null
  previewScrollTop.value = 0
  step.value = 3
}

async function restorePreviewFromServer() {
  if (!uploadResponse.value?.session_id) {
    step.value = 2
    return
  }

  try {
    const headers = sessionStore.getHeaders()
    const restored = await glossaryApi.bulkExtractTerms(headers, props.glossaryId, buildExtractRequest())
    initializeEditableCandidates(restored)
  } catch (e) {
    step.value = 2
    error.value = e instanceof Error ? e.message : '이전 프리뷰를 복구하지 못했습니다. 다시 추출해주세요.'
  }
}

async function startExtraction() {
  if (!uploadResponse.value?.session_id) {
    error.value = '업로드 세션 정보가 없습니다.'
    return
  }
  if (!confirmedMapping.value.term_source_file || !confirmedMapping.value.term_name_column) {
    error.value = '용어 소스 파일과 용어 이름 칼럼을 먼저 지정해주세요.'
    return
  }

  extracting.value = true
  extractionProgress.value = null
  error.value = null
  const headers = sessionStore.getHeaders()
  const payload = buildExtractRequest()

  try {
    if (useAiEnrichment.value) {
      extractAbortController.value = new AbortController()
      extractionProgress.value = {
        processed: 0,
        total: sourceFileTotalRows.value
      }
      await glossaryApi.bulkExtractStream(
        headers,
        props.glossaryId,
        payload,
        event => {
          if (event.event === 'progress') {
            extractionProgress.value = event.data
            return
          }
          if (event.event === 'complete') {
            initializeEditableCandidates(event.data as BulkExtractResponse)
          }
        },
        { signal: extractAbortController.value.signal }
      )
    } else {
      const result = await glossaryApi.bulkExtractTerms(headers, props.glossaryId, payload)
      initializeEditableCandidates(result)
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      try {
        const partial = await glossaryApi.bulkExtractTerms(headers, props.glossaryId, payload)
        initializeEditableCandidates(partial)
        error.value = 'AI 보강을 취소했고, 현재까지 처리된 결과를 불러왔습니다.'
      } catch {
        error.value = 'AI 보강을 취소했습니다. 필요하면 다시 추출을 시작해주세요.'
      }
    } else {
      error.value = e instanceof Error ? e.message : '용어 추출에 실패했습니다.'
    }
  } finally {
    extractAbortController.value = null
    extracting.value = false
  }
}

function cancelExtraction() {
  extractAbortController.value?.abort()
}

function toggleJoinRule(index: number, enabled: boolean) {
  confirmedJoins.value = confirmedJoins.value.map((rule, ruleIndex) =>
    ruleIndex === index ? { ...rule, enabled } : rule
  )
}

function addValueTransformRow() {
  valueTransforms.value = [...valueTransforms.value, { source: '', target: 'Draft' }]
}

function removeValueTransformRow(index: number) {
  valueTransforms.value = valueTransforms.value.filter((_, rowIndex) => rowIndex !== index)
}

function updateValueTransform(index: number, key: 'source' | 'target', value: string) {
  valueTransforms.value = valueTransforms.value.map((row, rowIndex) =>
    rowIndex === index ? { ...row, [key]: value } : row
  )
}

function toggleRowSelection(rowIndex: number, checked: boolean) {
  const next = new Set(selectedRowIndexes.value)
  if (checked) next.add(rowIndex)
  else next.delete(rowIndex)
  selectedRowIndexes.value = [...next]
}

function toggleAllFilteredRows(checked: boolean) {
  if (checked) {
    selectedRowIndexes.value = filteredCandidates.value.map(candidate => candidate.row_index)
    return
  }
  selectedRowIndexes.value = []
}

function updateCandidateField(rowIndex: number, key: keyof BulkTermCandidate, value: any) {
  editableCandidates.value = editableCandidates.value.map(candidate =>
    candidate.row_index === rowIndex ? { ...candidate, [key]: value } : candidate
  )
}

async function importSelectedTerms() {
  if (selectedCount.value === 0) {
    error.value = '가져올 용어를 하나 이상 선택해주세요.'
    return
  }
  if (!confirm(`정말로 ${selectedCount.value}건을 가져오시겠습니까?`)) {
    return
  }

  importing.value = true
  error.value = null

  try {
    const headers = sessionStore.getHeaders()
    const selectedTerms = editableCandidates.value.filter(candidate => selectedRowSet.value.has(candidate.row_index))
    importResult.value = await glossaryApi.bulkImportTerms(headers, props.glossaryId, {
      terms: selectedTerms,
      unmapped_columns_reminder: extractResult.value?.unmapped_columns ?? []
    })
    persistenceDisabled.value = true
    clearPersistedState()
    emit('imported')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '일괄 가져오기에 실패했습니다.'
  } finally {
    importing.value = false
  }
}

async function rollbackImportedBatch() {
  if (!importResult.value?.batch_id) return
  if (!confirm('이 배치를 전체 되돌리시겠습니까?')) return

  rollingBack.value = true
  error.value = null
  try {
    const headers = sessionStore.getHeaders()
    const result = await glossaryApi.bulkRollback(headers, props.glossaryId, importResult.value.batch_id)
    importResult.value = {
      ...importResult.value,
      next_steps: [`${result.deleted}건이 일괄 삭제되었습니다.`]
    }
    persistenceDisabled.value = true
    clearPersistedState()
    emit('imported')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '일괄 롤백에 실패했습니다.'
  } finally {
    rollingBack.value = false
  }
}

function persistState() {
  if (persistenceDisabled.value) return
  const shouldPersistPreviewData = editableCandidates.value.length > 0 && editableCandidates.value.length <= 200
  const snapshot: Record<string, unknown> = {
    step: step.value,
    uploadResponse: uploadResponse.value,
    confirmedMapping: confirmedMapping.value,
    confirmedJoins: confirmedJoins.value,
    valueTransforms: valueTransforms.value,
    useAiEnrichment: useAiEnrichment.value,
    importResult: importResult.value,
    searchQuery: searchQuery.value,
    statusFilter: statusFilter.value,
    emptyOnly: emptyOnly.value,
    sortKey: sortKey.value,
    sortDirection: sortDirection.value,
    hasPreviewData: shouldPersistPreviewData,
    needsPreviewRestore: step.value === 3 && !shouldPersistPreviewData
  }

  if (shouldPersistPreviewData) {
    snapshot.extractResult = extractResult.value
    snapshot.editableCandidates = editableCandidates.value
    snapshot.selectedRowIndexes = selectedRowIndexes.value
  }

  sessionStorage.setItem(storageKey.value, JSON.stringify(snapshot))
}

function clearPersistedState() {
  sessionStorage.removeItem(storageKey.value)
}

async function restorePersistedState() {
  const raw = sessionStorage.getItem(storageKey.value)
  if (!raw) return

  try {
    const parsed = JSON.parse(raw)
    if (!confirm('이전 용어 일괄 업로드 작업을 이어서 진행하시겠습니까?')) {
      clearPersistedState()
      return
    }

    step.value = parsed.step ?? 1
    uploadResponse.value = parsed.uploadResponse ?? null
    confirmedMapping.value = {
      ...confirmedMapping.value,
      ...(parsed.confirmedMapping ?? {})
    }
    confirmedJoins.value = parsed.confirmedJoins ?? []
    valueTransforms.value = parsed.valueTransforms ?? []
    useAiEnrichment.value = Boolean(parsed.useAiEnrichment)
    extractResult.value = parsed.hasPreviewData ? (parsed.extractResult ?? null) : null
    editableCandidates.value = parsed.hasPreviewData ? (parsed.editableCandidates ?? []) : []
    importResult.value = parsed.importResult ?? null
    selectedRowIndexes.value = parsed.hasPreviewData ? (parsed.selectedRowIndexes ?? []) : []
    searchQuery.value = parsed.searchQuery ?? ''
    statusFilter.value = parsed.statusFilter ?? ''
    emptyOnly.value = Boolean(parsed.emptyOnly)
    sortKey.value = parsed.sortKey ?? 'name'
    sortDirection.value = parsed.sortDirection ?? 'asc'

    if (parsed.needsPreviewRestore && uploadResponse.value?.session_id) {
      await restorePreviewFromServer()
    }
  } catch {
    clearPersistedState()
  }
}

watch(
  [
    step,
    uploadResponse,
    confirmedMapping,
    confirmedJoins,
    valueTransforms,
    useAiEnrichment,
    extractResult,
    editableCandidates,
    importResult,
    selectedRowIndexes,
    searchQuery,
    statusFilter,
    emptyOnly,
    sortKey,
    sortDirection
  ],
  () => {
    persistState()
  },
  { deep: true }
)

watch(
  () => confirmedMapping.value.term_source_file,
  fileName => {
    if (!uploadResponse.value || !fileName) return
    const sourceFile = uploadResponse.value.files.find(file => file.filename === fileName)
    if (!sourceFile) return
    confirmedMapping.value = {
      ...confirmedMapping.value,
      term_name_column: confirmedMapping.value.term_name_column ?? sourceFile.column_mapping?.term_name ?? null,
      term_description_column: confirmedMapping.value.term_description_column ?? sourceFile.column_mapping?.term_description ?? null,
      term_status_column: confirmedMapping.value.term_status_column ?? sourceFile.column_mapping?.term_status ?? null,
      term_domains_column: confirmedMapping.value.term_domains_column ?? sourceFile.column_mapping?.term_domains ?? null
    }
  }
)

onMounted(async () => {
  persistenceDisabled.value = false
  await restorePersistedState()
})

function closeModal() {
  if (!uploadResponse.value || importResult.value) {
    clearPersistedState()
  }
  emit('close')
}
</script>

<template>
  <div class="modal-overlay" @click.self="closeModal">
    <div class="modal-container">
      <header class="modal-header">
        <div>
          <h2>표준 용어 사전 일괄 업로드</h2>
          <p>CSV/XLSX 파일을 업로드하고, 매핑을 확인한 뒤 미리보기 후 가져옵니다.</p>
        </div>
        <button class="btn-icon" @click="closeModal">
          <IconX :size="18" />
        </button>
      </header>

      <div class="step-indicator">
        <div
          v-for="meta in stepMeta"
          :key="meta.id"
          class="step-item"
          :class="{ active: step === meta.id, done: step > meta.id }"
        >
          <span class="step-number">
            <IconCheck v-if="step > meta.id" :size="12" />
            <template v-else>{{ meta.id }}</template>
          </span>
          <span>{{ meta.label }}</span>
        </div>
      </div>

      <div class="modal-body">
        <div v-if="error" class="alert error">
          <IconAlertTriangle :size="16" />
          <span>{{ error }}</span>
        </div>

        <section v-if="step === 1" class="step-section">
          <div class="upload-panel">
            <div class="upload-dropzone">
              <IconUpload :size="36" />
              <p>`.csv`, `.xlsx`, `.xls` 파일을 1개 이상 선택하세요.</p>
              <input type="file" multiple accept=".csv,.xlsx,.xls" @change="setFilesFromInput" />
            </div>

            <div v-if="files.length > 0" class="selected-files">
              <p class="section-label">선택한 파일</p>
              <div class="chip-list">
                <span v-for="file in files" :key="file.name" class="chip">{{ file.name }}</span>
              </div>
            </div>

            <div v-if="uploadPhaseMessage" class="progress-line">
              <IconRefresh :size="14" class="spinning" />
              <span>{{ uploadPhaseMessage }}</span>
            </div>

            <button class="btn-primary" :disabled="uploading || files.length === 0" @click="uploadFiles">
              {{ uploading ? '분석 중...' : '업로드 시작' }}
            </button>
          </div>

          <div v-if="uploadResponse" class="summary-card-list">
            <div v-for="file in uploadResponse.files" :key="file.filename" class="summary-card">
              <div class="summary-card-header">
                <strong>{{ file.filename }}</strong>
                <span class="badge success">정상</span>
              </div>
              <p>{{ file.total_rows }}행, {{ file.headers.length }}칼럼{{ file.detected_encoding ? `, ${file.detected_encoding}` : '' }}</p>
            </div>
          </div>
        </section>

        <section v-else-if="step === 2" class="step-section">
          <div v-if="uploadResponse?.no_term_source" class="alert warn">
            <IconAlertTriangle :size="16" />
            <span>용어 전용 파일이 자동 감지되지 않았습니다. 어떤 파일을 용어 소스로 사용할지 지정해주세요.</span>
          </div>

          <div class="mapping-layout">
            <div class="mapping-panel">
              <div class="field-group">
                <label>용어 소스 파일</label>
                <div class="select-wrapper">
                  <select v-model="confirmedMapping.term_source_file">
                    <option v-for="file in uploadResponse?.files ?? []" :key="file.filename" :value="file.filename">
                      {{ file.filename }}
                    </option>
                  </select>
                  <IconChevronDown :size="14" />
                </div>
              </div>

              <div class="field-grid">
                <div class="field-group">
                  <label>용어 이름 <span class="help" :title="mappingHelpText.name">?</span></label>
                  <div class="select-wrapper">
                    <select :value="selectionToString(confirmedMapping.term_name_column)" @change="setMappingValue('term_name_column', ($event.target as HTMLSelectElement).value)">
                      <option v-for="option in columnOptions" :key="option.label + selectionToString(option.value)" :value="selectionToString(option.value)">
                        {{ option.label }}
                      </option>
                    </select>
                    <IconChevronDown :size="14" />
                  </div>
                </div>

                <div class="field-group">
                  <label>용어 설명 <span class="help" :title="mappingHelpText.description">?</span></label>
                  <div class="select-wrapper">
                    <select :value="selectionToString(confirmedMapping.term_description_column)" @change="setMappingValue('term_description_column', ($event.target as HTMLSelectElement).value)">
                      <option v-for="option in columnOptions" :key="'desc-' + option.label + selectionToString(option.value)" :value="selectionToString(option.value)">
                        {{ option.label }}
                      </option>
                    </select>
                    <IconChevronDown :size="14" />
                  </div>
                </div>

                <div class="field-group">
                  <label>상태 <span class="help" :title="mappingHelpText.status">?</span></label>
                  <div class="select-wrapper">
                    <select
                      :value="selectionToString(confirmedMapping.term_status_column)"
                      :disabled="Boolean(confirmedMapping.term_status_fixed)"
                      @change="setMappingValue('term_status_column', ($event.target as HTMLSelectElement).value)"
                    >
                      <option v-for="option in columnOptions" :key="'status-' + option.label + selectionToString(option.value)" :value="selectionToString(option.value)">
                        {{ option.label }}
                      </option>
                    </select>
                    <IconChevronDown :size="14" />
                  </div>
                  <p class="muted">파일 칼럼 값을 상태로 사용합니다.</p>
                </div>

                <div class="field-group">
                  <label>상태 고정값</label>
                  <div class="select-wrapper">
                    <select :value="confirmedMapping.term_status_fixed ?? ''" @change="setFixedStatus(($event.target as HTMLSelectElement).value)">
                      <option value="">컬럼 값 사용</option>
                      <option v-for="status in getStatusOptions()" :key="`fixed-status-${status.value}`" :value="status.value">
                        {{ status.label }}
                      </option>
                    </select>
                    <IconChevronDown :size="14" />
                  </div>
                  <p class="muted">고정값을 선택하면 모든 행에 같은 상태를 적용합니다.</p>
                </div>

                <div class="field-group">
                  <label>동의어 <span class="help" :title="mappingHelpText.synonyms">?</span></label>
                  <div class="select-wrapper">
                    <select :value="selectionToString(confirmedMapping.term_synonyms_column)" @change="setMappingValue('term_synonyms_column', ($event.target as HTMLSelectElement).value)">
                      <option v-for="option in columnOptions" :key="'syn-' + option.label + selectionToString(option.value)" :value="selectionToString(option.value)">
                        {{ option.label }}
                      </option>
                    </select>
                    <IconChevronDown :size="14" />
                  </div>
                </div>

                <div class="field-group">
                  <label>도메인 <span class="help" :title="mappingHelpText.domains">?</span></label>
                  <div class="select-wrapper">
                    <select :value="selectionToString(confirmedMapping.term_domains_column)" @change="setMappingValue('term_domains_column', ($event.target as HTMLSelectElement).value)">
                      <option v-for="option in columnOptions" :key="'dom-' + option.label + selectionToString(option.value)" :value="selectionToString(option.value)">
                        {{ option.label }}
                      </option>
                    </select>
                    <IconChevronDown :size="14" />
                  </div>
                </div>
              </div>

              <div class="subsection">
                <div class="subsection-header">
                  <h3>값 변환 규칙</h3>
                  <button class="btn-text" type="button" :disabled="Boolean(confirmedMapping.term_status_fixed)" @click="addValueTransformRow">규칙 추가</button>
                </div>
                <p class="muted">
                  {{ confirmedMapping.term_status_fixed ? '상태 고정값 사용 중이라 이 규칙은 적용되지 않습니다.' : '상태 코드처럼 원본 값과 시스템 값이 다를 때만 지정하세요.' }}
                </p>
                <div v-if="valueTransforms.length === 0" class="empty-box">아직 추가된 값 변환 규칙이 없습니다.</div>
                <div v-for="(row, index) in valueTransforms" :key="index" class="transform-row">
                  <input
                    :value="row.source"
                    :disabled="Boolean(confirmedMapping.term_status_fixed)"
                    type="text"
                    placeholder="원본 값"
                    @input="updateValueTransform(index, 'source', ($event.target as HTMLInputElement).value)"
                  />
                  <span>→</span>
                  <div class="select-wrapper compact">
                    <select
                      :value="row.target"
                      :disabled="Boolean(confirmedMapping.term_status_fixed)"
                      @change="updateValueTransform(index, 'target', ($event.target as HTMLSelectElement).value)"
                    >
                      <option v-for="status in getStatusOptions()" :key="status.value" :value="status.value">
                        {{ status.label }}
                      </option>
                    </select>
                    <IconChevronDown :size="14" />
                  </div>
                  <button class="btn-icon small" type="button" :disabled="Boolean(confirmedMapping.term_status_fixed)" @click="removeValueTransformRow(index)">
                    <IconX :size="12" />
                  </button>
                </div>
              </div>
            </div>

            <div class="side-panel">
              <div class="subsection">
                <h3>파일별 요약</h3>
                <div v-for="file in uploadResponse?.files ?? []" :key="file.filename" class="summary-mini-card">
                  <div class="summary-mini-top">
                    <strong>{{ file.filename }}</strong>
                    <span class="confidence" :class="`confidence-${getConfidenceLabel(file.confidence).toLowerCase()}`">
                      {{ getConfidenceLabel(file.confidence) }}
                    </span>
                  </div>
                  <p>{{ file.total_rows }}행 / {{ file.headers.length }}칼럼</p>
                </div>
              </div>

              <div class="subsection" v-if="aggregatedUnmappedColumns.length > 0">
                <h3>매핑되지 않은 칼럼</h3>
                <div class="alert warn">
                  <IconAlertTriangle :size="16" />
                  <span>현재 스키마에서 지원하지 않는 필드입니다. 가져오기 시 제외됩니다.</span>
                </div>
                <div class="chip-list">
                  <span v-for="column in aggregatedUnmappedColumns" :key="column" class="chip warn">{{ column }}</span>
                </div>
              </div>

              <div class="subsection" v-if="(uploadResponse?.files.length ?? 0) > 1">
                <h3>조인 규칙</h3>
                <div v-if="confirmedJoins.length === 0" class="empty-box">감지된 조인 규칙이 없습니다.</div>
                <label v-for="(rule, index) in confirmedJoins" :key="`${rule.left_file}-${rule.left_column}-${rule.right_file}-${rule.right_column}`" class="join-rule">
                  <input :checked="rule.enabled" type="checkbox" @change="toggleJoinRule(index, ($event.target as HTMLInputElement).checked)" />
                  <div>
                    <strong>{{ rule.left_file }}[{{ rule.left_column }}] = {{ rule.right_file }}[{{ rule.right_column }}]</strong>
                    <p>{{ rule.purpose || '보조 데이터 조인' }}</p>
                  </div>
                  <span class="confidence" :class="`confidence-${getConfidenceLabel(rule.confidence).toLowerCase()}`">
                    {{ getConfidenceLabel(rule.confidence) }}
                  </span>
                </label>
              </div>

              <div class="subsection">
                <h3>AI 보강 옵션</h3>
                <label class="choice-card">
                  <input v-model="useAiEnrichment" :value="false" type="radio" />
                  <div>
                    <strong>직접 매핑 사용</strong>
                    <p>파일 데이터를 확정된 매핑대로 바로 추출합니다. 즉시 완료됩니다.</p>
                  </div>
                </label>
                <label class="choice-card">
                  <input v-model="useAiEnrichment" :value="true" type="radio" />
                  <div>
                    <strong>AI 보강 사용</strong>
                    <p>행별로 설명과 동의어를 보강합니다. 약 {{ estimatedAiMinutes }}분 소요 예상입니다.</p>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <div v-if="extracting && extractionProgress" class="progress-box">
            <IconRefresh :size="14" class="spinning" />
            <span>
              {{ extractionProgress.processed }}/{{ extractionProgress.total }} 처리 완료
              <template v-if="extractionProgress.estimated_remaining_seconds">
                (잔여: 약 {{ extractionProgress.estimated_remaining_seconds }}초)
              </template>
            </span>
            <button v-if="useAiEnrichment" class="btn-text" type="button" @click="cancelExtraction">취소</button>
          </div>
        </section>

        <section v-else class="step-section preview-step">
          <div class="summary-panel" v-if="extractResult">
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
            <input v-model="searchQuery" type="text" class="search-input" placeholder="name / description 검색" />

            <div class="select-wrapper compact">
              <select v-model="statusFilter">
                <option value="">모든 상태</option>
                <option v-for="status in getStatusOptions()" :key="status.value" :value="status.value">
                  {{ status.label }}
                </option>
              </select>
              <IconChevronDown :size="14" />
            </div>

            <label class="checkbox-inline">
              <input v-model="emptyOnly" type="checkbox" />
              빈 값만 보기
            </label>

            <div class="select-wrapper compact">
              <select v-model="sortKey">
                <option value="name">이름 정렬</option>
                <option value="description">설명 정렬</option>
                <option value="status">상태 정렬</option>
                <option value="domains">도메인 정렬</option>
              </select>
              <IconChevronDown :size="14" />
            </div>

            <button class="btn-text" type="button" @click="sortDirection = sortDirection === 'asc' ? 'desc' : 'asc'">
              {{ sortDirection === 'asc' ? '오름차순' : '내림차순' }}
            </button>

            <button class="btn-text" type="button" @click="toggleAllFilteredRows(true)">전체 선택</button>
            <button class="btn-text" type="button" @click="toggleAllFilteredRows(false)">전체 해제</button>
          </div>

          <div class="preview-header-row">
            <span class="col-check"><input type="checkbox" :checked="selectedCount > 0 && selectedCount === filteredCandidates.length" @change="toggleAllFilteredRows(($event.target as HTMLInputElement).checked)" /></span>
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
                    @change="toggleRowSelection(row.item.row_index, ($event.target as HTMLInputElement).checked)"
                  />
                </span>
                <span class="col-name">
                  <input
                    :value="row.item.name"
                    type="text"
                    @input="updateCandidateField(row.item.row_index, 'name', ($event.target as HTMLInputElement).value)"
                  />
                </span>
                <span class="col-description">
                  <input
                    :value="row.item.description"
                    type="text"
                    @input="updateCandidateField(row.item.row_index, 'description', ($event.target as HTMLInputElement).value)"
                  />
                </span>
                <span class="col-status">
                  <div class="select-wrapper compact">
                    <select :value="row.item.status" @change="updateCandidateField(row.item.row_index, 'status', ($event.target as HTMLSelectElement).value)">
                      <option v-for="status in getStatusOptions()" :key="status.value" :value="status.value">
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
            <p>{{ importResult.created }}건 생성, {{ importResult.skipped }}건 스킵, 신규 도메인 {{ importResult.domains_created }}개</p>
            <p v-if="importResult.unmapped_columns_reminder.length > 0">
              매핑되지 않은 칼럼: {{ importResult.unmapped_columns_reminder.join(', ') }}
            </p>
            <div class="result-actions">
              <button class="btn-secondary" type="button" :disabled="rollingBack" @click="rollbackImportedBatch">
                {{ rollingBack ? '되돌리는 중...' : '이 배치 되돌리기' }}
              </button>
              <button class="btn-primary" type="button" @click="closeModal">닫기</button>
            </div>
            <div class="next-steps">
              <p v-for="(item, index) in importResult.next_steps" :key="index">{{ item }}</p>
            </div>
          </div>
        </section>
      </div>

      <footer class="modal-footer">
        <button class="btn-secondary" type="button" @click="step === 1 ? closeModal() : step--">
          {{ step === 1 ? '취소' : '이전' }}
        </button>

        <button
          v-if="step === 2"
          class="btn-primary"
          type="button"
          :disabled="extracting"
          @click="startExtraction"
        >
          {{ extracting ? '추출 중...' : '추출 시작' }}
        </button>

        <button
          v-else-if="step === 3 && !importResult"
          class="btn-primary"
          type="button"
          :disabled="importing"
          @click="importSelectedTerms"
        >
          {{ importing ? '가져오는 중...' : `가져오기 (${selectedCount})` }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped lang="scss">
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
  padding: 24px;
}

.modal-container {
  width: min(1200px, 100%);
  height: min(88vh, 980px);
  background: var(--color-bg);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding: 24px 28px 16px;
  border-bottom: 1px solid var(--color-border);

  h2 {
    margin: 0 0 8px;
    font-size: 22px;
  }

  p {
    margin: 0;
    color: var(--color-text-light);
    font-size: 14px;
  }
}

.step-indicator {
  display: flex;
  gap: 12px;
  padding: 16px 28px;
  border-bottom: 1px solid var(--color-border);
}

.step-item {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--color-text-light);
  font-size: 13px;

  &.active,
  &.done {
    color: var(--color-text);
  }
}

.step-number {
  width: 24px;
  height: 24px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
}

.step-item.active .step-number,
.step-item.done .step-number {
  background: var(--color-accent-bg);
  border-color: var(--color-accent);
  color: var(--color-accent);
}

.modal-body {
  flex: 1;
  overflow: auto;
  padding: 24px 28px;
}

.step-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.upload-panel,
.mapping-panel,
.side-panel,
.summary-panel,
.result-panel {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-secondary);
  padding: 20px;
}

.upload-dropzone {
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-lg);
  padding: 32px 16px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;

  p {
    margin: 0;
    color: var(--color-text-light);
  }
}

.selected-files,
.subsection {
  margin-top: 18px;
}

.section-label,
.subsection h3 {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 600;
}

.chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 999px;
  background: var(--color-bg-tertiary);
  font-size: 12px;
}

.chip.warn {
  background: rgba(245, 158, 11, 0.14);
  color: #b45309;
}

.summary-card-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.summary-card,
.summary-mini-card {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  padding: 14px;

  p {
    margin: 8px 0 0;
    font-size: 13px;
    color: var(--color-text-light);
  }
}

.summary-card-header,
.summary-mini-top,
.subsection-header,
.result-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.mapping-layout {
  display: grid;
  grid-template-columns: 1.7fr 1fr;
  gap: 18px;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 8px;

  label {
    font-size: 13px;
    font-weight: 500;
  }
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-top: 16px;
}

.help {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--color-bg-tertiary);
  color: var(--color-text-light);
  font-size: 11px;
  cursor: help;
}

.select-wrapper {
  position: relative;

  select {
    width: 100%;
    appearance: none;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg);
    color: var(--color-text);
    padding: 10px 34px 10px 12px;
    font-size: 13px;
  }

  svg {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    pointer-events: none;
    color: var(--color-text-light);
  }
}

.select-wrapper.compact select {
  padding-top: 8px;
  padding-bottom: 8px;
}

.transform-row {
  display: grid;
  grid-template-columns: 1fr auto 1fr auto;
  gap: 10px;
  align-items: center;
  margin-top: 10px;

  input {
    width: 100%;
  }
}

.summary-mini-card + .summary-mini-card,
.join-rule + .join-rule,
.choice-card + .choice-card {
  margin-top: 10px;
}

.join-rule,
.choice-card {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 12px;
  align-items: start;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  padding: 12px;

  p {
    margin: 6px 0 0;
    color: var(--color-text-light);
    font-size: 12px;
  }
}

.choice-card {
  cursor: pointer;
}

.confidence,
.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}

.confidence-높음,
.badge.success {
  background: rgba(16, 185, 129, 0.14);
  color: #059669;
}

.confidence-중간 {
  background: rgba(245, 158, 11, 0.16);
  color: #b45309;
}

.confidence-낮음 {
  background: rgba(239, 68, 68, 0.12);
  color: #dc2626;
}

.alert {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px 14px;
  border-radius: var(--radius-md);
  font-size: 13px;
}

.alert.error {
  background: rgba(239, 68, 68, 0.12);
  color: #dc2626;
}

.alert.warn {
  background: rgba(245, 158, 11, 0.14);
  color: #b45309;
}

.progress-line,
.progress-box {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text-light);
}

.preview-step {
  gap: 16px;
}

.summary-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.summary-line {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 13px;
}

.warn-text {
  color: #b45309;
}

.preview-toolbar,
.preview-header-row,
.preview-row {
  display: grid;
  grid-template-columns: 44px 1.2fr 2fr 140px 1.2fr 1.2fr;
  gap: 12px;
  align-items: center;
}

.preview-toolbar {
  grid-template-columns: 1.6fr 180px 140px 180px auto auto;
}

.search-input,
.preview-row input,
.transform-row input {
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  color: var(--color-text);
  padding: 9px 12px;
  font-size: 13px;
}

.preview-header-row {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--color-bg);
  padding: 0 12px 12px;
  font-size: 12px;
  color: var(--color-text-light);
  text-transform: uppercase;
}

.virtual-list {
  height: 420px;
  overflow: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-secondary);
}

.virtual-spacer {
  position: relative;
}

.preview-row {
  position: absolute;
  left: 0;
  right: 0;
  min-height: 58px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg);

  &.warn {
    background: rgba(245, 158, 11, 0.06);
  }
}

.col-check {
  display: inline-flex;
  justify-content: center;
}

.col-domains,
.col-synonyms {
  font-size: 13px;
  color: var(--color-text-light);
}

.result-panel {
  p {
    margin: 0 0 10px;
    font-size: 13px;
  }
}

.next-steps p {
  margin: 4px 0;
  color: var(--color-text-light);
}

.modal-footer {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 28px 24px;
  border-top: 1px solid var(--color-border);
}

.btn-primary,
.btn-secondary,
.btn-text,
.btn-icon {
  border-radius: var(--radius-md);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-primary,
.btn-secondary {
  padding: 10px 16px;
}

.btn-primary {
  border: none;
  background: var(--color-accent);
  color: #fff;
}

.btn-secondary {
  border: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
  color: var(--color-text);
}

.btn-text,
.btn-icon {
  border: none;
  background: transparent;
  color: var(--color-text-light);
}

.btn-icon {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.btn-icon.small {
  width: 26px;
  height: 26px;
}

.btn-primary:disabled,
.btn-secondary:disabled,
.btn-text:disabled,
.btn-icon:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.muted,
.empty-box {
  color: var(--color-text-light);
  font-size: 13px;
}

.empty-box {
  padding: 12px;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
}

.checkbox-inline {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  font-size: 13px;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1080px) {
  .mapping-layout {
    grid-template-columns: 1fr;
  }

  .field-grid {
    grid-template-columns: 1fr;
  }

  .preview-toolbar {
    grid-template-columns: 1fr;
  }
}
</style>
