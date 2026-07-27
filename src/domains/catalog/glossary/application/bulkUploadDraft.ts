import type {
  BulkColumnReference,
  BulkColumnSelection,
  BulkConfirmedMapping,
  BulkExtractRequest,
  BulkExtractResponse,
  BulkImportRequest,
  BulkImportResponse,
  BulkJoinRule,
  BulkTermCandidate,
  BulkUploadResponse,
} from '../api.ts'
import {
  parseBulkExtractResponse,
  parseBulkImportResponse,
  parseBulkJoinRule,
  parseBulkUploadResponse,
} from '../api.ts'

export type EnabledBulkJoinRule = BulkJoinRule & { enabled: boolean }
export type BulkTermStatus = BulkTermCandidate['status']
export type BulkCandidateSortKey = 'name' | 'description' | 'status' | 'domains'
export type BulkCandidateSortDirection = 'asc' | 'desc'
export type BulkCandidateEditableField = 'name' | 'description' | 'status'

export interface BulkValueTransform {
  source: string
  target: string
}

export interface BulkCandidateFilter {
  searchQuery: string
  status: string
  emptyOnly: boolean
  sortKey: BulkCandidateSortKey
  sortDirection: BulkCandidateSortDirection
}

export interface HydratedBulkUpload {
  mapping: BulkConfirmedMapping
  joins: EnabledBulkJoinRule[]
}

export interface BulkUploadSnapshot {
  version: 1
  step: 1 | 2 | 3
  uploadResponse: BulkUploadResponse | null
  confirmedMapping: BulkConfirmedMapping
  confirmedJoins: EnabledBulkJoinRule[]
  valueTransforms: BulkValueTransform[]
  useAiEnrichment: boolean
  extractResult: BulkExtractResponse | null
  editableCandidates: BulkTermCandidate[]
  importResult: BulkImportResponse | null
  selectedRowIndexes: number[]
  searchQuery: string
  statusFilter: string
  emptyOnly: boolean
  sortKey: BulkCandidateSortKey
  sortDirection: BulkCandidateSortDirection
  hasPreviewData: boolean
  needsPreviewRestore: boolean
}

export function createEmptyBulkMapping(): BulkConfirmedMapping {
  return {
    term_source_file: '',
    term_name_column: null,
    term_description_column: null,
    term_status_column: null,
    term_status_fixed: null,
    term_synonyms_column: null,
    term_domains_column: null,
  }
}

export function hydrateBulkUpload(result: BulkUploadResponse): HydratedBulkUpload {
  const sourceFileName = result.term_source_file ?? result.files[0]?.filename ?? ''
  const sourceFile = result.files.find(file => file.filename === sourceFileName)
  const sourceMapping = sourceFile?.column_mapping ?? {}
  const wordFile = result.files.find(file => file.role === 'word_dictionary')
  const wordJoinIndex = result.join_rules.findIndex(joinRule =>
    joinRule.left_file === sourceFileName
    && joinRule.right_file === wordFile?.filename,
  )

  return {
    mapping: {
      term_source_file: sourceFileName,
      term_name_column: sourceMapping.term_name ?? null,
      term_description_column: sourceMapping.term_description ?? null,
      term_status_column: sourceMapping.term_status ?? null,
      term_status_fixed: null,
      term_synonyms_column:
        sourceMapping.term_synonyms
        ?? (
          wordFile?.column_mapping?.word_synonyms && wordJoinIndex >= 0
            ? {
                source: 'joined',
                file: wordFile.filename,
                column: wordFile.column_mapping.word_synonyms,
                join_rule_index: wordJoinIndex,
              }
            : null
        ),
      term_domains_column: sourceMapping.term_domains ?? null,
    },
    joins: result.join_rules.map(rule => ({ ...rule, enabled: true })),
  }
}

function isJoinedColumnReference(value: unknown): value is BulkColumnReference {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const source = Reflect.get(value, 'source')
  const file = Reflect.get(value, 'file')
  const column = Reflect.get(value, 'column')
  const joinRuleIndex = Reflect.get(value, 'join_rule_index')
  return source === 'joined'
    && typeof file === 'string'
    && typeof column === 'string'
    && typeof joinRuleIndex === 'number'
    && Number.isInteger(joinRuleIndex)
    && joinRuleIndex >= 0
}

export function isBulkColumnSelection(value: unknown): value is BulkColumnSelection {
  return value === null || typeof value === 'string' || isJoinedColumnReference(value)
}

export function createJoinedColumnSelection(
  file: string,
  column: string,
  joinRuleIndex: number,
): BulkColumnReference {
  return {
    source: 'joined',
    file,
    column,
    join_rule_index: joinRuleIndex,
  }
}

export function encodeColumnSelection(value: BulkColumnSelection): string {
  return value === null ? '' : JSON.stringify(value)
}

export function decodeColumnSelection(rawValue: string): BulkColumnSelection {
  if (!rawValue) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(rawValue)
  } catch {
    return null
  }
  if (typeof parsed === 'string') return parsed
  return isJoinedColumnReference(parsed) ? parsed : null
}

export function isBulkTermStatus(value: string): value is BulkTermStatus {
  return value === 'Draft'
    || value === 'Pending'
    || value === 'Approved'
    || value === 'Deprecated'
}

export function buildBulkExtractRequest(input: {
  sessionId: string
  mapping: BulkConfirmedMapping
  joins: EnabledBulkJoinRule[]
  transforms: BulkValueTransform[]
  useAiEnrichment: boolean
}): BulkExtractRequest {
  const valueTransforms: Record<string, Record<string, string>> = {}
  for (const transform of input.transforms) {
    if (!transform.source || !transform.target) continue
    valueTransforms.term_status ??= {}
    valueTransforms.term_status[transform.source] = transform.target
  }

  return {
    session_id: input.sessionId,
    confirmed_mapping: input.mapping,
    confirmed_joins: input.joins
      .filter(rule => rule.enabled)
      .map(({ enabled: _enabled, ...rule }) => rule),
    value_transforms: valueTransforms,
    use_ai_enrichment: input.useAiEnrichment,
  }
}

export function cloneBulkCandidates(candidates: BulkTermCandidate[]): BulkTermCandidate[] {
  return candidates.map(candidate => ({
    ...candidate,
    synonyms: [...candidate.synonyms],
    domains: [...candidate.domains],
    tags: [...candidate.tags],
    owners: candidate.owners ? [...candidate.owners] : undefined,
    reviewers: candidate.reviewers ? [...candidate.reviewers] : undefined,
  }))
}

export function filterAndSortBulkCandidates(
  candidates: BulkTermCandidate[],
  filter: BulkCandidateFilter,
): BulkTermCandidate[] {
  const query = filter.searchQuery.trim().toLocaleLowerCase()
  const filtered = candidates.filter(candidate => {
    if (
      query
      && !candidate.name.toLocaleLowerCase().includes(query)
      && !candidate.description.toLocaleLowerCase().includes(query)
    ) return false
    if (filter.status && candidate.status !== filter.status) return false
    if (filter.emptyOnly && candidate.name && candidate.description) return false
    return true
  })

  return [...filtered].sort((left, right) => {
    const leftValue = filter.sortKey === 'domains'
      ? left.domains.join(', ')
      : left[filter.sortKey]
    const rightValue = filter.sortKey === 'domains'
      ? right.domains.join(', ')
      : right[filter.sortKey]
    const result = leftValue.localeCompare(rightValue, 'ko')
    return filter.sortDirection === 'asc' ? result : -result
  })
}

export function updateBulkCandidate(
  candidates: BulkTermCandidate[],
  rowIndex: number,
  field: BulkCandidateEditableField,
  value: string,
): BulkTermCandidate[] {
  if (field === 'status') {
    if (!isBulkTermStatus(value)) return candidates
    return candidates.map(candidate =>
      candidate.row_index === rowIndex ? { ...candidate, status: value } : candidate,
    )
  }
  return candidates.map(candidate => {
    if (candidate.row_index !== rowIndex) return candidate
    if (field === 'name') return { ...candidate, name: value }
    return { ...candidate, description: value }
  })
}

export function buildBulkImportRequest(
  candidates: BulkTermCandidate[],
  selectedRowIndexes: Iterable<number>,
  unmappedColumns: string[],
): BulkImportRequest {
  const selection = new Set(selectedRowIndexes)
  return {
    terms: candidates.filter(candidate => selection.has(candidate.row_index)),
    unmapped_columns_reminder: [...unmappedColumns],
  }
}

export function shouldPersistBulkPreview(candidateCount: number): boolean {
  return candidateCount > 0 && candidateCount <= 200
}

function requiredRecord(value: unknown, context: string): object {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${context}: 객체가 필요합니다.`)
  }
  return value
}

function requiredString(value: unknown, context: string): string {
  if (typeof value !== 'string') throw new Error(`${context}: 문자열이 필요합니다.`)
  return value
}

function requiredBoolean(value: unknown, context: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${context}: 불리언이 필요합니다.`)
  return value
}

function requiredArray(value: unknown, context: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${context}: 배열이 필요합니다.`)
  return value
}

function property(record: object, key: string): unknown {
  return Reflect.get(record, key)
}

function parseStoredMapping(value: unknown): BulkConfirmedMapping {
  const record = requiredRecord(value, 'confirmedMapping')
  const status = property(record, 'term_status_fixed')
  if (status !== null && (typeof status !== 'string' || !isBulkTermStatus(status))) {
    throw new Error('confirmedMapping.term_status_fixed: 지원하지 않는 상태입니다.')
  }
  const selection = (key: string): BulkColumnSelection => {
    const candidate = property(record, key)
    if (!isBulkColumnSelection(candidate)) {
      throw new Error(`confirmedMapping.${key}: 지원하지 않는 column selection입니다.`)
    }
    return candidate
  }
  return {
    term_source_file: requiredString(
      property(record, 'term_source_file'),
      'confirmedMapping.term_source_file',
    ),
    term_name_column: selection('term_name_column'),
    term_description_column: selection('term_description_column'),
    term_status_column: selection('term_status_column'),
    term_status_fixed: status,
    term_synonyms_column: selection('term_synonyms_column'),
    term_domains_column: selection('term_domains_column'),
  }
}

export function parseBulkUploadSnapshot(raw: string): BulkUploadSnapshot | null {
  try {
    const value: unknown = JSON.parse(raw)
    const record = requiredRecord(value, 'snapshot')
    const rawVersion = property(record, 'version')
    if (rawVersion !== undefined && rawVersion !== 1) return null
    const step = property(record, 'step')
    if (step !== 1 && step !== 2 && step !== 3) return null

    const rawUpload = property(record, 'uploadResponse')
    const uploadResponse = rawUpload === null
      ? null
      : parseBulkUploadResponse(rawUpload)
    if (step > 1 && !uploadResponse) return null

    const confirmedJoins = requiredArray(
      property(record, 'confirmedJoins'),
      'confirmedJoins',
    ).map((item, index) => {
      const join = parseBulkJoinRule(item, `snapshot.confirmedJoins[${index}]`)
      const joinRecord = requiredRecord(item, `confirmedJoins[${index}]`)
      return {
        ...join,
        enabled: requiredBoolean(
          property(joinRecord, 'enabled'),
          `confirmedJoins[${index}].enabled`,
        ),
      }
    })
    const valueTransforms = requiredArray(
      property(record, 'valueTransforms'),
      'valueTransforms',
    ).map((item, index) => {
      const transform = requiredRecord(item, `valueTransforms[${index}]`)
      return {
        source: requiredString(property(transform, 'source'), `valueTransforms[${index}].source`),
        target: requiredString(property(transform, 'target'), `valueTransforms[${index}].target`),
      }
    })

    const hasPreviewData = requiredBoolean(property(record, 'hasPreviewData'), 'hasPreviewData')
    const rawExtract = property(record, 'extractResult')
    const extractResult = rawExtract === null || rawExtract === undefined
      ? null
      : parseBulkExtractResponse(rawExtract)
    const rawCandidates = property(record, 'editableCandidates')
    const editableCandidates = hasPreviewData
      ? parseBulkExtractResponse({
          ...(extractResult ?? {
            total: 0,
            enriched: false,
            join_statistics: [],
            field_statistics: {},
            unmapped_columns: [],
          }),
          term_candidates: requiredArray(rawCandidates, 'editableCandidates'),
        }).term_candidates
      : []
    if (hasPreviewData && !extractResult) return null

    const rawImport = property(record, 'importResult')
    const selectedRowIndexes = requiredArray(
      property(record, 'selectedRowIndexes') ?? [],
      'selectedRowIndexes',
    )
    if (selectedRowIndexes.some(index => !Number.isInteger(index) || Number(index) < 0)) return null
    const sortKey = property(record, 'sortKey')
    const sortDirection = property(record, 'sortDirection')
    if (
      sortKey !== 'name'
      && sortKey !== 'description'
      && sortKey !== 'status'
      && sortKey !== 'domains'
    ) return null
    if (sortDirection !== 'asc' && sortDirection !== 'desc') return null

    return {
      version: 1,
      step,
      uploadResponse,
      confirmedMapping: parseStoredMapping(property(record, 'confirmedMapping')),
      confirmedJoins,
      valueTransforms,
      useAiEnrichment: requiredBoolean(
        property(record, 'useAiEnrichment'),
        'useAiEnrichment',
      ),
      extractResult,
      editableCandidates,
      importResult: rawImport === null || rawImport === undefined
        ? null
        : parseBulkImportResponse(rawImport),
      selectedRowIndexes: selectedRowIndexes.map(Number),
      searchQuery: requiredString(property(record, 'searchQuery'), 'searchQuery'),
      statusFilter: requiredString(property(record, 'statusFilter'), 'statusFilter'),
      emptyOnly: requiredBoolean(property(record, 'emptyOnly'), 'emptyOnly'),
      sortKey,
      sortDirection,
      hasPreviewData,
      needsPreviewRestore: requiredBoolean(
        property(record, 'needsPreviewRestore'),
        'needsPreviewRestore',
      ),
    }
  } catch {
    return null
  }
}
