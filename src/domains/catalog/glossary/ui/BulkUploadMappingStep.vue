<script setup lang="ts">
import { computed } from 'vue'
import { IconAlertTriangle, IconChevronDown, IconRefresh, IconX } from '@/shared/icons'
import type {
  BulkColumnSelection,
  BulkConfirmedMapping,
  BulkJoinRule,
  BulkUploadResponse,
} from '../api.ts'
import {
  createJoinedColumnSelection,
  decodeColumnSelection,
  encodeColumnSelection,
  isBulkTermStatus,
} from '../application/bulkUploadDraft.ts'
import {
  BULK_MAPPING_HELP_TEXT,
  BULK_TERM_STATUS_OPTIONS,
  getBulkConfidenceLabel,
} from './bulkUploadPresentation.ts'

type EnabledJoinRule = BulkJoinRule & { enabled: boolean }
type ValueTransform = { source: string; target: string }

const props = defineProps<{
  uploadResponse: BulkUploadResponse | null
  mapping: BulkConfirmedMapping
  joins: EnabledJoinRule[]
  valueTransforms: ValueTransform[]
  useAiEnrichment: boolean
  extracting: boolean
  extractionProgress: {
    processed: number
    total: number
    estimated_remaining_seconds?: number
  } | null
}>()

const emit = defineEmits<{
  'update:mapping': [mapping: BulkConfirmedMapping]
  'update:joins': [joins: EnabledJoinRule[]]
  'update:valueTransforms': [transforms: ValueTransform[]]
  'update:useAiEnrichment': [enabled: boolean]
  cancelExtraction: []
}>()

const sourceFileTotalRows = computed(() => {
  const file = props.uploadResponse?.files.find(
    candidate => candidate.filename === props.mapping.term_source_file,
  )
  return file?.total_rows ?? 0
})

const estimatedAiMinutes = computed(() => Math.ceil((sourceFileTotalRows.value * 2) / 60))

const aggregatedUnmappedColumns = computed(() => {
  const columns = props.uploadResponse?.files.flatMap(file => file.unmapped_columns ?? []) ?? []
  return Array.from(new Set(columns))
})

const activeJoinRules = computed(() => props.joins.filter(rule => rule.enabled))

const sourceColumnOptions = computed(() => {
  if (!props.uploadResponse || !props.mapping.term_source_file) return []
  const sourceFile = props.uploadResponse.files.find(
    file => file.filename === props.mapping.term_source_file,
  )
  return (sourceFile?.headers ?? []).map(header => ({ label: header, value: header }))
})

const joinedColumnOptions = computed(() => {
  if (!props.uploadResponse || !props.mapping.term_source_file) return []

  return activeJoinRules.value.flatMap(rule => {
    const relatedFileName =
      rule.left_file === props.mapping.term_source_file
        ? rule.right_file
        : rule.right_file === props.mapping.term_source_file
          ? rule.left_file
          : ''
    if (!relatedFileName) return []

    const relatedFile = props.uploadResponse?.files.find(file => file.filename === relatedFileName)
    if (!relatedFile) return []

    return relatedFile.headers.map(header => ({
      label: `📎 ${relatedFileName} > ${header}`,
      value: createJoinedColumnSelection(
        relatedFileName,
        header,
        props.joins.findIndex(
          candidate =>
            candidate.left_file === rule.left_file &&
            candidate.left_column === rule.left_column &&
            candidate.right_file === rule.right_file &&
            candidate.right_column === rule.right_column,
        ),
      ),
    }))
  })
})

const columnOptions = computed(() => [
  { label: '(사용 안 함)', value: null },
  ...sourceColumnOptions.value,
  ...joinedColumnOptions.value,
])

function controlValue(event: Event): string {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) {
    return event.target.value
  }
  return ''
}

function controlChecked(event: Event): boolean {
  return event.target instanceof HTMLInputElement && event.target.checked
}

function updateMapping(patch: Partial<BulkConfirmedMapping>) {
  emit('update:mapping', { ...props.mapping, ...patch })
}

function setMappingValue(key: keyof BulkConfirmedMapping, rawValue: string) {
  updateMapping({ [key]: decodeColumnSelection(rawValue) })
}

function setFixedStatus(rawValue: string) {
  updateMapping({ term_status_fixed: isBulkTermStatus(rawValue) ? rawValue : null })
}

function toggleJoinRule(index: number, enabled: boolean) {
  emit(
    'update:joins',
    props.joins.map((rule, ruleIndex) => (ruleIndex === index ? { ...rule, enabled } : rule)),
  )
}

function addValueTransformRow() {
  emit('update:valueTransforms', [...props.valueTransforms, { source: '', target: 'Draft' }])
}

function removeValueTransformRow(index: number) {
  emit(
    'update:valueTransforms',
    props.valueTransforms.filter((_, rowIndex) => rowIndex !== index),
  )
}

function updateValueTransform(index: number, key: 'source' | 'target', value: string) {
  emit(
    'update:valueTransforms',
    props.valueTransforms.map((row, rowIndex) =>
      rowIndex === index ? { ...row, [key]: value } : row,
    ),
  )
}

function selectionToString(value: BulkColumnSelection): string {
  return encodeColumnSelection(value)
}
</script>

<template>
  <section class="step-section">
    <div v-if="uploadResponse?.no_term_source" class="alert warn">
      <IconAlertTriangle :size="16" />
      <span>용어 전용 파일이 자동 감지되지 않았습니다. 어떤 파일을 용어 소스로 사용할지 지정해주세요.</span>
    </div>

    <div class="mapping-layout">
      <div class="mapping-panel">
        <div class="field-group">
          <label>용어 소스 파일</label>
          <div class="select-wrapper">
            <select
              :value="mapping.term_source_file"
              @change="updateMapping({ term_source_file: controlValue($event) })"
            >
              <option
                v-for="file in uploadResponse?.files ?? []"
                :key="file.filename"
                :value="file.filename"
              >
                {{ file.filename }}
              </option>
            </select>
            <IconChevronDown :size="14" />
          </div>
        </div>

        <div class="field-grid">
          <div class="field-group">
            <label>용어 이름 <span class="help" :title="BULK_MAPPING_HELP_TEXT.name">?</span></label>
            <div class="select-wrapper">
              <select
                :value="selectionToString(mapping.term_name_column)"
                @change="setMappingValue('term_name_column', controlValue($event))"
              >
                <option
                  v-for="option in columnOptions"
                  :key="option.label + selectionToString(option.value)"
                  :value="selectionToString(option.value)"
                >
                  {{ option.label }}
                </option>
              </select>
              <IconChevronDown :size="14" />
            </div>
          </div>

          <div class="field-group">
            <label>용어 설명 <span class="help" :title="BULK_MAPPING_HELP_TEXT.description">?</span></label>
            <div class="select-wrapper">
              <select
                :value="selectionToString(mapping.term_description_column)"
                @change="setMappingValue('term_description_column', controlValue($event))"
              >
                <option
                  v-for="option in columnOptions"
                  :key="'desc-' + option.label + selectionToString(option.value)"
                  :value="selectionToString(option.value)"
                >
                  {{ option.label }}
                </option>
              </select>
              <IconChevronDown :size="14" />
            </div>
          </div>

          <div class="field-group">
            <label>상태 <span class="help" :title="BULK_MAPPING_HELP_TEXT.status">?</span></label>
            <div class="select-wrapper">
              <select
                :value="selectionToString(mapping.term_status_column)"
                :disabled="Boolean(mapping.term_status_fixed)"
                @change="setMappingValue('term_status_column', controlValue($event))"
              >
                <option
                  v-for="option in columnOptions"
                  :key="'status-' + option.label + selectionToString(option.value)"
                  :value="selectionToString(option.value)"
                >
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
              <select
                :value="mapping.term_status_fixed ?? ''"
                @change="setFixedStatus(controlValue($event))"
              >
                <option value="">컬럼 값 사용</option>
                <option
                  v-for="status in BULK_TERM_STATUS_OPTIONS"
                  :key="`fixed-status-${status.value}`"
                  :value="status.value"
                >
                  {{ status.label }}
                </option>
              </select>
              <IconChevronDown :size="14" />
            </div>
            <p class="muted">고정값을 선택하면 모든 행에 같은 상태를 적용합니다.</p>
          </div>

          <div class="field-group">
            <label>동의어 <span class="help" :title="BULK_MAPPING_HELP_TEXT.synonyms">?</span></label>
            <div class="select-wrapper">
              <select
                :value="selectionToString(mapping.term_synonyms_column)"
                @change="setMappingValue('term_synonyms_column', controlValue($event))"
              >
                <option
                  v-for="option in columnOptions"
                  :key="'syn-' + option.label + selectionToString(option.value)"
                  :value="selectionToString(option.value)"
                >
                  {{ option.label }}
                </option>
              </select>
              <IconChevronDown :size="14" />
            </div>
          </div>

          <div class="field-group">
            <label>도메인 <span class="help" :title="BULK_MAPPING_HELP_TEXT.domains">?</span></label>
            <div class="select-wrapper">
              <select
                :value="selectionToString(mapping.term_domains_column)"
                @change="setMappingValue('term_domains_column', controlValue($event))"
              >
                <option
                  v-for="option in columnOptions"
                  :key="'dom-' + option.label + selectionToString(option.value)"
                  :value="selectionToString(option.value)"
                >
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
            <button
              class="btn-text"
              type="button"
              :disabled="Boolean(mapping.term_status_fixed)"
              @click="addValueTransformRow"
            >
              규칙 추가
            </button>
          </div>
          <p class="muted">
            {{
              mapping.term_status_fixed
                ? '상태 고정값 사용 중이라 이 규칙은 적용되지 않습니다.'
                : '상태 코드처럼 원본 값과 시스템 값이 다를 때만 지정하세요.'
            }}
          </p>
          <div v-if="valueTransforms.length === 0" class="empty-box">
            아직 추가된 값 변환 규칙이 없습니다.
          </div>
          <div v-for="(row, index) in valueTransforms" :key="index" class="transform-row">
            <input
              :value="row.source"
              :disabled="Boolean(mapping.term_status_fixed)"
              type="text"
              placeholder="원본 값"
              @input="updateValueTransform(index, 'source', controlValue($event))"
            />
            <span>→</span>
            <div class="select-wrapper compact">
              <select
                :value="row.target"
                :disabled="Boolean(mapping.term_status_fixed)"
                @change="updateValueTransform(index, 'target', controlValue($event))"
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
            <button
              class="btn-icon small"
              type="button"
              aria-label="값 변환 규칙 삭제"
              :disabled="Boolean(mapping.term_status_fixed)"
              @click="removeValueTransformRow(index)"
            >
              <IconX :size="12" />
            </button>
          </div>
        </div>
      </div>

      <div class="side-panel">
        <div class="subsection">
          <h3>파일별 요약</h3>
          <div
            v-for="file in uploadResponse?.files ?? []"
            :key="file.filename"
            class="summary-mini-card"
          >
            <div class="summary-mini-top">
              <strong>{{ file.filename }}</strong>
              <span
                class="confidence"
                :class="`confidence-${getBulkConfidenceLabel(file.confidence).toLowerCase()}`"
              >
                {{ getBulkConfidenceLabel(file.confidence) }}
              </span>
            </div>
            <p>{{ file.total_rows }}행 / {{ file.headers.length }}칼럼</p>
          </div>
        </div>

        <div v-if="aggregatedUnmappedColumns.length > 0" class="subsection">
          <h3>매핑되지 않은 칼럼</h3>
          <div class="alert warn">
            <IconAlertTriangle :size="16" />
            <span>현재 스키마에서 지원하지 않는 필드입니다. 가져오기 시 제외됩니다.</span>
          </div>
          <div class="chip-list">
            <span
              v-for="column in aggregatedUnmappedColumns"
              :key="column"
              class="chip warn"
            >
              {{ column }}
            </span>
          </div>
        </div>

        <div v-if="(uploadResponse?.files.length ?? 0) > 1" class="subsection">
          <h3>조인 규칙</h3>
          <div v-if="joins.length === 0" class="empty-box">감지된 조인 규칙이 없습니다.</div>
          <label
            v-for="(rule, index) in joins"
            :key="`${rule.left_file}-${rule.left_column}-${rule.right_file}-${rule.right_column}`"
            class="join-rule"
          >
            <input
              :checked="rule.enabled"
              type="checkbox"
              @change="toggleJoinRule(index, controlChecked($event))"
            />
            <div>
              <strong>
                {{ rule.left_file }}[{{ rule.left_column }}] =
                {{ rule.right_file }}[{{ rule.right_column }}]
              </strong>
              <p>{{ rule.purpose || '보조 데이터 조인' }}</p>
            </div>
            <span
              class="confidence"
              :class="`confidence-${getBulkConfidenceLabel(rule.confidence).toLowerCase()}`"
            >
              {{ getBulkConfidenceLabel(rule.confidence) }}
            </span>
          </label>
        </div>

        <div class="subsection">
          <h3>AI 보강 옵션</h3>
          <label class="choice-card">
            <input
              :checked="!useAiEnrichment"
              type="radio"
              name="bulk-ai-enrichment"
              @change="emit('update:useAiEnrichment', false)"
            />
            <div>
              <strong>직접 매핑 사용</strong>
              <p>파일 데이터를 확정된 매핑대로 바로 추출합니다. 즉시 완료됩니다.</p>
            </div>
          </label>
          <label class="choice-card">
            <input
              :checked="useAiEnrichment"
              type="radio"
              name="bulk-ai-enrichment"
              @change="emit('update:useAiEnrichment', true)"
            />
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
      <button
        v-if="useAiEnrichment"
        class="btn-text"
        type="button"
        @click="emit('cancelExtraction')"
      >
        취소
      </button>
    </div>
  </section>
</template>
