<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRuntimeStore } from '@/shared/stores/runtime'
import {
  type BulkConfirmedMapping,
  type BulkExtractResponse,
  type BulkImportResponse,
  type BulkJoinRule,
  type BulkTermCandidate,
  type BulkUploadResponse
} from '../api.ts'
import {
  buildBulkExtractRequest,
  buildBulkImportRequest,
  cloneBulkCandidates,
  createEmptyBulkMapping,
  hydrateBulkUpload,
  parseBulkUploadSnapshot,
  shouldPersistBulkPreview,
  type BulkCandidateSortDirection,
  type BulkCandidateSortKey,
  type BulkUploadSnapshot,
} from '../application/bulkUploadDraft.ts'
import { useBulkUploadOperations } from '../application/useBulkUploadOperations'
import { IconAlertTriangle, IconCheck, IconX } from '@/shared/icons'
import GlossaryActionDialog from './GlossaryActionDialog.vue'
import BulkUploadFileStep from './BulkUploadFileStep.vue'
import BulkUploadMappingStep from './BulkUploadMappingStep.vue'
import BulkUploadPreviewStep from './BulkUploadPreviewStep.vue'

const props = defineProps<{
  glossaryId: string
}>()

const emit = defineEmits<{
  close: []
  imported: []
}>()

const runtimeStore = useRuntimeStore()
const modalRef = ref<HTMLElement>()
const {
  uploading,
  extracting,
  importing,
  rollingBack,
  isBusy,
  uploadPhaseMessage,
  error,
  confirmationError,
  extractionProgress,
  upload,
  extract,
  cancelExtraction,
  importTerms,
  rollback,
} = useBulkUploadOperations({
  getGlossaryId: () => props.glossaryId,
  getHeaders: () => runtimeStore.getHeaders(),
})

const step = ref<1 | 2 | 3>(1)
const files = ref<File[]>([])
const uploadResponse = ref<BulkUploadResponse | null>(null)
const confirmedMapping = ref<BulkConfirmedMapping>(createEmptyBulkMapping())
const confirmedJoins = ref<Array<BulkJoinRule & { enabled: boolean }>>([])
const valueTransforms = ref<Array<{ source: string; target: string }>>([])
const useAiEnrichment = ref(false)
const extractResult = ref<BulkExtractResponse | null>(null)
const editableCandidates = ref<BulkTermCandidate[]>([])
const importResult = ref<BulkImportResponse | null>(null)
const selectedRowIndexes = ref<number[]>([])
const persistenceDisabled = ref(false)
const searchQuery = ref('')
const statusFilter = ref('')
const emptyOnly = ref(false)
const sortKey = ref<BulkCandidateSortKey>('name')
const sortDirection = ref<BulkCandidateSortDirection>('asc')
const confirmationKind = ref<'resume' | 'import' | 'rollback' | null>(null)
const pendingSnapshot = ref<BulkUploadSnapshot | null>(null)
const confirmationDetails = computed(() => {
  if (confirmationKind.value === 'resume') {
    return {
      title: '이전 작업 이어서 진행',
      message: '이전에 저장된 용어 일괄 업로드 작업을 복원하시겠습니까?',
      confirmLabel: '이어하기',
      danger: false,
      pending: false,
    }
  }
  if (confirmationKind.value === 'import') {
    return {
      title: '선택 용어 가져오기',
      message: `선택한 ${selectedCount.value}건을 용어 사전에 가져오시겠습니까?`,
      confirmLabel: '가져오기',
      danger: false,
      pending: importing.value,
    }
  }
  return {
    title: '업로드 배치 되돌리기',
    message: '이 배치로 가져온 용어를 전체 되돌리시겠습니까?',
    confirmLabel: '전체 되돌리기',
    danger: true,
    pending: rollingBack.value,
  }
})

const storageKey = computed(() => `glossary-bulk-upload:${props.glossaryId}`)

const stepMeta = [
  { id: 1, label: '파일 업로드' },
  { id: 2, label: 'AI 분석 확인' },
  { id: 3, label: '미리보기 & 가져오기' }
]

const sourceFileTotalRows = computed(() => {
  const sourceFile = uploadResponse.value?.files.find(
    file => file.filename === confirmedMapping.value.term_source_file,
  )
  return sourceFile?.total_rows ?? 0
})

const selectedCount = computed(() => selectedRowIndexes.value.length)

function hydrateFromUploadResult(result: BulkUploadResponse) {
  uploadResponse.value = result
  step.value = 2
  const hydrated = hydrateBulkUpload(result)
  confirmedMapping.value = hydrated.mapping
  confirmedJoins.value = hydrated.joins
}

function buildExtractRequest() {
  return buildBulkExtractRequest({
    sessionId: uploadResponse.value?.session_id ?? '',
    mapping: confirmedMapping.value,
    joins: confirmedJoins.value,
    transforms: valueTransforms.value,
    useAiEnrichment: useAiEnrichment.value,
  })
}

async function uploadFiles() {
  const result = await upload(files.value)
  if (result) hydrateFromUploadResult(result)
}

function initializeEditableCandidates(result: BulkExtractResponse) {
  extractResult.value = result
  editableCandidates.value = cloneBulkCandidates(result.term_candidates)
  selectedRowIndexes.value = editableCandidates.value.map(candidate => candidate.row_index)
  importResult.value = null
  step.value = 3
}

async function restorePreviewFromServer() {
  if (!uploadResponse.value?.session_id) {
    step.value = 2
    return
  }

  try {
    const restored = await extract(
      buildExtractRequest(),
      false,
      sourceFileTotalRows.value,
      '이전 프리뷰를 복구하지 못했습니다. 다시 추출해주세요.',
    )
    if (!restored) {
      step.value = 2
      return
    }
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

  const payload = buildExtractRequest()
  const result = await extract(
    payload,
    useAiEnrichment.value,
    sourceFileTotalRows.value,
  )
  if (result) initializeEditableCandidates(result)
}

async function importSelectedTerms() {
  if (selectedCount.value === 0) {
    error.value = '가져올 용어를 하나 이상 선택해주세요.'
    return
  }
  confirmationError.value = null
  confirmationKind.value = 'import'
}

async function performImport() {
  confirmationError.value = null

  const request = buildBulkImportRequest(
    editableCandidates.value,
    selectedRowIndexes.value,
    extractResult.value?.unmapped_columns ?? [],
  )
  const result = await importTerms(request)
  if (!result) return
  importResult.value = result
  persistenceDisabled.value = true
  clearPersistedState()
  emit('imported')
  confirmationKind.value = null
  await nextTick()
  modalRef.value?.focus()
}

async function rollbackImportedBatch() {
  if (!importResult.value?.batch_id) return
  confirmationError.value = null
  confirmationKind.value = 'rollback'
}

async function performRollback() {
  if (!importResult.value?.batch_id) return
  confirmationError.value = null
  const deleted = await rollback(importResult.value.batch_id)
  if (deleted === null) return
  importResult.value = {
    ...importResult.value,
    next_steps: [`${deleted}건이 일괄 삭제되었습니다.`]
  }
  persistenceDisabled.value = true
  clearPersistedState()
  emit('imported')
  confirmationKind.value = null
  await nextTick()
  modalRef.value?.focus()
}

function persistState() {
  if (persistenceDisabled.value) return
  const shouldPersistPreviewData = shouldPersistBulkPreview(editableCandidates.value.length)
  const snapshot: BulkUploadSnapshot = {
    version: 1,
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
    needsPreviewRestore: step.value === 3 && !shouldPersistPreviewData,
    extractResult: shouldPersistPreviewData ? extractResult.value : null,
    editableCandidates: shouldPersistPreviewData ? editableCandidates.value : [],
    selectedRowIndexes: shouldPersistPreviewData ? selectedRowIndexes.value : [],
  }

  sessionStorage.setItem(storageKey.value, JSON.stringify(snapshot))
}

function clearPersistedState() {
  sessionStorage.removeItem(storageKey.value)
}

async function restorePersistedState() {
  const raw = sessionStorage.getItem(storageKey.value)
  if (!raw) return

  const parsed = parseBulkUploadSnapshot(raw)
  if (!parsed) {
    clearPersistedState()
    error.value = '저장된 이전 작업이 손상되었거나 현재 형식과 맞지 않아 폐기했습니다.'
    return
  }
  pendingSnapshot.value = parsed
  confirmationError.value = null
  confirmationKind.value = 'resume'
}

async function applyPendingSnapshot() {
  const parsed = pendingSnapshot.value
  if (!parsed) return
  try {
    step.value = parsed.step
    uploadResponse.value = parsed.uploadResponse
    confirmedMapping.value = {
      ...confirmedMapping.value,
      ...parsed.confirmedMapping,
    }
    confirmedJoins.value = parsed.confirmedJoins
    valueTransforms.value = parsed.valueTransforms
    useAiEnrichment.value = parsed.useAiEnrichment
    extractResult.value = parsed.extractResult
    editableCandidates.value = parsed.editableCandidates
    importResult.value = parsed.importResult
    selectedRowIndexes.value = parsed.selectedRowIndexes
    searchQuery.value = parsed.searchQuery
    statusFilter.value = parsed.statusFilter
    emptyOnly.value = parsed.emptyOnly
    sortKey.value = parsed.sortKey
    sortDirection.value = parsed.sortDirection

    if (parsed.needsPreviewRestore && uploadResponse.value?.session_id) {
      await restorePreviewFromServer()
    }
    pendingSnapshot.value = null
    confirmationKind.value = null
    await nextTick()
    modalRef.value?.focus()
  } catch {
    clearPersistedState()
    pendingSnapshot.value = null
    confirmationKind.value = null
    error.value = '이전 작업을 복원하지 못해 저장된 상태를 폐기했습니다.'
  }
}

function cancelConfirmation() {
  if (importing.value || rollingBack.value) return
  if (confirmationKind.value === 'resume') {
    pendingSnapshot.value = null
    clearPersistedState()
  }
  confirmationError.value = null
  confirmationKind.value = null
  nextTick(() => modalRef.value?.focus())
}

async function confirmRequestedAction() {
  if (confirmationKind.value === 'resume') {
    await applyPendingSnapshot()
    return
  }
  if (confirmationKind.value === 'import') {
    await performImport()
    return
  }
  if (confirmationKind.value === 'rollback') {
    await performRollback()
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
  await nextTick()
  if (!confirmationKind.value) {
    modalRef.value?.focus()
  }
})

function closeModal() {
  if (isBusy.value) return
  if (!uploadResponse.value || importResult.value) {
    clearPersistedState()
  }
  emit('close')
}
</script>

<template>
  <div class="bulk-upload-overlay modal-overlay" @click.self="closeModal">
    <div
      ref="modalRef"
      class="modal-container"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-upload-title"
      :aria-busy="isBusy"
      tabindex="-1"
      @keydown.esc.stop.prevent="closeModal"
    >
      <header class="modal-header">
        <div>
          <h2 id="bulk-upload-title">표준 용어 사전 일괄 업로드</h2>
          <p>CSV/XLSX 파일을 업로드하고, 매핑을 확인한 뒤 미리보기 후 가져옵니다.</p>
        </div>
        <button
          type="button"
          class="btn-icon"
          aria-label="용어 일괄 업로드 닫기"
          :disabled="isBusy"
          @click="closeModal"
        >
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

        <BulkUploadFileStep
          v-if="step === 1"
          :files="files"
          :upload-response="uploadResponse"
          :uploading="uploading"
          :phase-message="uploadPhaseMessage"
          @files-change="files = $event"
          @upload="uploadFiles"
        />

        <BulkUploadMappingStep
          v-else-if="step === 2"
          :upload-response="uploadResponse"
          :mapping="confirmedMapping"
          :joins="confirmedJoins"
          :value-transforms="valueTransforms"
          :use-ai-enrichment="useAiEnrichment"
          :extracting="extracting"
          :extraction-progress="extractionProgress"
          @update:mapping="confirmedMapping = $event"
          @update:joins="confirmedJoins = $event"
          @update:value-transforms="valueTransforms = $event"
          @update:use-ai-enrichment="useAiEnrichment = $event"
          @cancel-extraction="cancelExtraction"
        />

        <BulkUploadPreviewStep
          v-else
          :extract-result="extractResult"
          :import-result="importResult"
          :candidates="editableCandidates"
          :selected-row-indexes="selectedRowIndexes"
          :search-query="searchQuery"
          :status-filter="statusFilter"
          :empty-only="emptyOnly"
          :sort-key="sortKey"
          :sort-direction="sortDirection"
          :rolling-back="rollingBack"
          @update:candidates="editableCandidates = $event"
          @update:selected-row-indexes="selectedRowIndexes = $event"
          @update:search-query="searchQuery = $event"
          @update:status-filter="statusFilter = $event"
          @update:empty-only="emptyOnly = $event"
          @update:sort-key="sortKey = $event"
          @update:sort-direction="sortDirection = $event"
          @rollback="rollbackImportedBatch"
          @close="closeModal"
        />
      </div>

      <footer class="modal-footer">
        <button
          class="btn-secondary"
          type="button"
          :disabled="isBusy"
          @click="step === 1 ? closeModal() : step--"
        >
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

    <GlossaryActionDialog
      v-if="confirmationKind"
      :title="confirmationDetails.title"
      :message="confirmationDetails.message"
      :confirm-label="confirmationDetails.confirmLabel"
      :danger="confirmationDetails.danger"
      :pending="confirmationDetails.pending"
      :error="confirmationError"
      @cancel="cancelConfirmation"
      @confirm="confirmRequestedAction"
    />
  </div>
</template>

<style lang="scss">
.bulk-upload-overlay {
&.modal-overlay {
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

@media (max-width: 600px) {
  &.modal-overlay {
    align-items: stretch;
    padding: 12px;
  }

  .modal-container {
    width: 100%;
    height: 100%;
    border-radius: 16px;
  }

  .modal-header {
    padding: 18px 18px 14px;

    h2 {
      font-size: 18px;
    }

    p {
      display: none;
    }
  }

  .step-indicator {
    gap: 8px;
    padding: 12px 18px;
    overflow-x: auto;
  }

  .step-item {
    flex: 0 0 auto;
    gap: 6px;
    font-size: 12px;
  }

  .modal-body {
    padding: 16px 18px;
  }

  .preview-toolbar {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 10px;

    .search-input,
    .checkbox-inline {
      grid-column: 1 / -1;
    }
  }

  .preview-header-row,
  .preview-row {
    min-width: 880px;
  }

  .virtual-list {
    height: 360px;
  }

  .modal-footer {
    padding: 12px 18px 18px;
  }
}
}
</style>
