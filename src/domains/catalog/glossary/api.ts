/** glossary api — 용어집·영업일 캘린더·용어 일괄업로드. 공유 http 코어 사용. */
import type { Headers } from '@/shared/services/http'
import { CATALOG_BASE_URL as ROBO_BASE_URL } from '@/domains/catalog/api/baseUrl'
import { catalogHttp } from '@/domains/catalog/api/http'

const handleHttpError = catalogHttp.handleError
const postJson = catalogHttp.postJson
const postFormData = catalogHttp.postFormData
const streamSseFetch = catalogHttp.streamSse

// ============================================================================
// Glossary API (용어 관리)
// ============================================================================

export interface Glossary {
  id: string
  name: string
  description: string
  type: string
  termCount: number
  createdAt?: string
  updatedAt?: string
}

export interface Term {
  id: string
  name: string
  description: string
  status: 'Draft' | 'Pending' | 'Approved' | 'Deprecated'
  synonyms: string[]
  owners: { id: string; name: string; email?: string }[]
  reviewers?: { id: string; name: string; email?: string }[]
  domains: { id: string; name: string }[]
  tags: { id: string; name: string; color: string }[]
  relatedTerms?: { id: string; name: string }[]
  glossaryId?: string
  glossaryName?: string
  createdAt?: string
  updatedAt?: string
}

export interface GlossaryDomain {
  id: string
  name: string
  description?: string
  termCount?: number
}

export interface GlossaryOwner {
  id: string
  name: string
  email?: string
}

export interface GlossaryTag {
  id: string
  name: string
  color: string
  termCount?: number
}

export interface CreateGlossaryRequest {
  name: string
  description?: string
  type?: string
}

export interface CreateTermRequest {
  name: string
  description?: string
  status?: string
  synonyms?: string[]
  relatedTerms?: string[]
  domains?: string[]
  owners?: string[]
  reviewers?: string[]
  tags?: string[]
}

export interface UpdateTermRequest {
  name?: string
  description?: string
  status?: string
  synonyms?: string[]
  relatedTerms?: string[]
  domains?: string[]
  owners?: string[]
  reviewers?: string[]
  tags?: string[]
}

export type BulkFileRole = 'term_source' | 'word_dictionary' | 'domain_dictionary' | 'code_dictionary' | 'unknown'

export interface BulkColumnReference {
  source: 'joined'
  file: string
  column: string
  join_rule_index?: number
}

export type BulkColumnSelection = string | BulkColumnReference | null

export interface BulkFileAnalysis {
  filename: string
  headers: string[]
  sample_rows: string[][]
  total_rows: number
  detected_encoding?: string | null
  parse_status: string
  role?: BulkFileRole
  confidence?: number
  column_mapping?: Record<string, string | null>
  unmapped_columns?: string[]
}

export interface BulkJoinRule {
  left_file: string
  left_column: string
  right_file: string
  right_column: string
  join_type: string
  purpose?: string
  confidence?: number
}

export interface BulkUploadResponse {
  session_id: string
  files: BulkFileAnalysis[]
  join_rules: BulkJoinRule[]
  term_source_file: string | null
  no_term_source: boolean
}

export interface BulkConfirmedMapping {
  term_source_file: string
  term_name_column: BulkColumnSelection
  term_description_column: BulkColumnSelection
  term_status_column: BulkColumnSelection
  term_status_fixed: 'Draft' | 'Pending' | 'Approved' | 'Deprecated' | null
  term_synonyms_column: BulkColumnSelection
  term_domains_column: BulkColumnSelection
}

export interface BulkExtractRequest {
  session_id: string
  confirmed_mapping: BulkConfirmedMapping
  confirmed_joins: BulkJoinRule[]
  value_transforms: Record<string, Record<string, string>>
  use_ai_enrichment: boolean
}

export interface BulkTermCandidate {
  row_index: number
  name: string
  description: string
  status: 'Draft' | 'Pending' | 'Approved' | 'Deprecated'
  synonyms: string[]
  domains: string[]
  tags: string[]
  owners?: string[]
  reviewers?: string[]
}

export interface BulkJoinStatistic {
  rule: string
  matched: number
  unmatched: number
  total: number
}

export interface BulkFieldStatistic {
  filled: number
  empty: number
  distribution?: Record<string, number>
}

export interface BulkExtractResponse {
  term_candidates: BulkTermCandidate[]
  total: number
  enriched: boolean
  join_statistics: BulkJoinStatistic[]
  field_statistics: Record<string, BulkFieldStatistic>
  unmapped_columns: string[]
}

export interface BulkImportRequest {
  terms: BulkTermCandidate[]
  unmapped_columns_reminder?: string[]
}

export interface BulkImportResponse {
  batch_id: string
  created: number
  skipped: number
  errors: Array<{ name: string; reason: string }>
  domains_created: number
  domains_existing: number
  unmapped_columns_reminder: string[]
  next_steps: string[]
}

export interface BulkRollbackResponse {
  deleted: number
  batch_id: string
}

export interface BulkExtractProgress {
  processed: number
  total: number
  estimated_remaining_seconds?: number
}

export type BulkExtractStreamEvent =
  | { event: 'progress'; data: BulkExtractProgress }
  | { event: 'complete'; data: BulkExtractResponse }

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {}

const normalizeStringList = (value: unknown): string[] => {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error('Catalog glossary term 문자열 목록 응답 계약 오류')
  }

  return value
    .map(item => item.trim())
    .filter(Boolean)
}

const normalizeDomainList = (value: unknown): Term['domains'] => {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) {
    throw new Error('Catalog glossary term domains 응답 계약 오류: 배열이 필요합니다.')
  }

  return value.map((item, index) => {
    if (typeof item === 'string') {
      const name = item.trim()
      if (!name) {
        throw new Error(`Catalog glossary term domains[${index}] 응답 계약 오류: 이름이 비어 있습니다.`)
      }
      return { id: name, name }
    }

    const record = asRecord(item)
    const name = typeof record.name === 'string' ? record.name.trim() : ''
    if (!name) {
      throw new Error(`Catalog glossary term domains[${index}] 응답 계약 오류: 이름이 필요합니다.`)
    }

    return {
      id: typeof record.id === 'string' && record.id ? record.id : name,
      name
    }
  })
}

const normalizeOwnerList = (value: unknown): GlossaryOwner[] => {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) {
    throw new Error('Catalog glossary term owners/reviewers 응답 계약 오류: 배열이 필요합니다.')
  }

  return value.map((item, index) => {
    if (typeof item === 'string') {
      const name = item.trim()
      if (!name) {
        throw new Error(`Catalog glossary term owner[${index}] 응답 계약 오류: 이름이 비어 있습니다.`)
      }
      return { id: name, name, email: '' }
    }

    const record = asRecord(item)
    const name = typeof record.name === 'string' ? record.name.trim() : ''
    if (!name) {
      throw new Error(`Catalog glossary term owner[${index}] 응답 계약 오류: 이름이 필요합니다.`)
    }

    return {
      id: typeof record.id === 'string' && record.id ? record.id : name,
      name,
      email: typeof record.email === 'string' ? record.email : ''
    }
  })
}

const normalizeTagList = (value: unknown): GlossaryTag[] => {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) {
    throw new Error('Catalog glossary term tags 응답 계약 오류: 배열이 필요합니다.')
  }

  return value.map((item, index) => {
    if (typeof item === 'string') {
      const name = item.trim()
      if (!name) {
        throw new Error(`Catalog glossary term tags[${index}] 응답 계약 오류: 이름이 비어 있습니다.`)
      }
      return { id: name, name, color: '#3498db' }
    }

    const record = asRecord(item)
    const name = typeof record.name === 'string' ? record.name.trim() : ''
    if (!name) {
      throw new Error(`Catalog glossary term tags[${index}] 응답 계약 오류: 이름이 필요합니다.`)
    }

    return {
      id: typeof record.id === 'string' && record.id ? record.id : name,
      name,
      color: typeof record.color === 'string' && record.color ? record.color : '#3498db'
    }
  })
}

const normalizeRelatedTerms = (value: unknown): NonNullable<Term['relatedTerms']> => {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) {
    throw new Error('Catalog glossary term relatedTerms 응답 계약 오류: 배열이 필요합니다.')
  }

  return value.map((item, index) => {
    const record = asRecord(item)
    const id = typeof record.id === 'string' ? record.id : ''
    const name = typeof record.name === 'string' ? record.name.trim() : ''
    if (!id || !name) {
      throw new Error(
        `Catalog glossary term relatedTerms[${index}] 응답 계약 오류: id와 name이 필요합니다.`,
      )
    }
    return { id, name }
  })
}

export const parseTermResponse = (value: unknown): Term => {
  const record = asRecord(value)
  const id = typeof record.id === 'string' ? record.id.trim() : ''
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  if (!id || !name) {
    throw new Error('Catalog glossary term 응답 계약 오류: id와 name이 필요합니다.')
  }
  const rawStatus = record.status === undefined ? 'Draft' : record.status
  if (
    rawStatus !== 'Draft'
    && rawStatus !== 'Pending'
    && rawStatus !== 'Approved'
    && rawStatus !== 'Deprecated'
  ) {
    throw new Error(`Catalog glossary term.status 응답 계약 오류: '${String(rawStatus)}'`)
  }

  return {
    id,
    name,
    description: typeof record.description === 'string' ? record.description : '',
    status: rawStatus,
    synonyms: normalizeStringList(record.synonyms),
    owners: normalizeOwnerList(record.owners),
    reviewers: normalizeOwnerList(record.reviewers),
    domains: normalizeDomainList(record.domains),
    tags: normalizeTagList(record.tags),
    relatedTerms: normalizeRelatedTerms(record.relatedTerms),
    glossaryId: typeof record.glossaryId === 'string' ? record.glossaryId : undefined,
    glossaryName: typeof record.glossaryName === 'string' ? record.glossaryName : undefined,
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : undefined,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : undefined
  }
}

export function parseGlossaryResponse(value: unknown): Glossary {
  const record = asRecord(value)
  const id = typeof record.id === 'string' ? record.id.trim() : ''
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  const type = typeof record.type === 'string' ? record.type.trim() : ''
  const termCount = record.termCount
  if (!id || !name || !type) {
    throw new Error('Catalog glossary 응답 계약 오류: id, name, type이 필요합니다.')
  }
  if (!Number.isInteger(termCount) || Number(termCount) < 0) {
    throw new Error('Catalog glossary.termCount 응답 계약 오류: 0 이상의 정수가 필요합니다.')
  }
  return {
    id,
    name,
    description: typeof record.description === 'string' ? record.description : '',
    type,
    termCount: Number(termCount),
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : undefined,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : undefined,
  }
}

export function parseGlossaryListResponse(value: unknown): { glossaries: Glossary[] } {
  const record = asRecord(value)
  if (!Array.isArray(record.glossaries)) {
    throw new Error('Catalog glossary 목록 응답 계약 오류: glossaries 배열이 필요합니다.')
  }
  return {
    glossaries: record.glossaries.map(parseGlossaryResponse),
  }
}

export function parseTermListResponse(value: unknown): { terms: Term[] } {
  const record = asRecord(value)
  if (!Array.isArray(record.terms)) {
    throw new Error('Catalog glossary term 목록 응답 계약 오류: terms 배열이 필요합니다.')
  }
  return {
    terms: record.terms.map(parseTermResponse),
  }
}

export function parseCatalogEntityIdentityResponse(
  value: unknown,
): { id: string; name: string } {
  const record = asRecord(value)
  const id = typeof record.id === 'string' ? record.id.trim() : ''
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  if (!id || !name) {
    throw new Error('Catalog glossary 생성 응답 계약 오류: id와 name이 필요합니다.')
  }
  return { id, name }
}

export function parseGlossaryMetadataResponse(
  value: unknown,
  kind: 'domains',
): { domains: GlossaryDomain[] }
export function parseGlossaryMetadataResponse(
  value: unknown,
  kind: 'owners',
): { owners: GlossaryOwner[] }
export function parseGlossaryMetadataResponse(
  value: unknown,
  kind: 'tags',
): { tags: GlossaryTag[] }
export function parseGlossaryMetadataResponse(
  value: unknown,
  kind: 'domains' | 'owners' | 'tags',
): { domains: GlossaryDomain[] } | { owners: GlossaryOwner[] } | { tags: GlossaryTag[] } {
  const record = asRecord(value)
  const items = record[kind]
  if (!Array.isArray(items)) {
    throw new Error(`Catalog glossary metadata.${kind} 응답 계약 오류: 배열이 필요합니다.`)
  }

  function identity(item: unknown, index: number) {
    const metadata = asRecord(item)
    const id = typeof metadata.id === 'string' ? metadata.id.trim() : ''
    const name = typeof metadata.name === 'string' ? metadata.name.trim() : ''
    if (!id || !name) {
      throw new Error(
        `Catalog glossary metadata.${kind}[${index}] 응답 계약 오류: id와 name이 필요합니다.`,
      )
    }
    return { metadata, id, name }
  }

  if (kind === 'domains') {
    return {
      domains: items.map((item, index) => {
        const { metadata, id, name } = identity(item, index)
        return {
        id,
        name,
        description: typeof metadata.description === 'string' ? metadata.description : undefined,
        termCount: Number.isInteger(metadata.termCount) ? Number(metadata.termCount) : undefined,
        }
      }),
    }
  }
  if (kind === 'owners') {
    return {
      owners: items.map((item, index) => {
        const { metadata, id, name } = identity(item, index)
        return {
        id,
        name,
        email: typeof metadata.email === 'string' ? metadata.email : undefined,
        }
      }),
    }
  }
  return {
    tags: items.map((item, index) => {
      const { metadata, id, name } = identity(item, index)
      return {
        id,
        name,
        color: typeof metadata.color === 'string' && metadata.color ? metadata.color : '#3498db',
        termCount: Number.isInteger(metadata.termCount) ? Number(metadata.termCount) : undefined,
      }
    }),
  }
}

const requireRecord = (value: unknown, context: string): Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`용어 추출 ${context} 응답 계약 오류: 객체가 필요합니다.`)
  }
  return Object.fromEntries(Object.entries(value))
}

const requireString = (value: unknown, context: string): string => {
  if (typeof value !== 'string') {
    throw new Error(`용어 추출 ${context} 응답 계약 오류: 문자열이 필요합니다.`)
  }
  return value
}

const requireNumber = (value: unknown, context: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`용어 추출 ${context} 응답 계약 오류: 숫자가 필요합니다.`)
  }
  return value
}

const requireBoolean = (value: unknown, context: string): boolean => {
  if (typeof value !== 'boolean') {
    throw new Error(`용어 추출 ${context} 응답 계약 오류: 불리언이 필요합니다.`)
  }
  return value
}

const requireStringArray = (value: unknown, context: string): string[] => {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error(`용어 추출 ${context} 응답 계약 오류: 문자열 배열이 필요합니다.`)
  }
  return value
}

const optionalNumber = (value: unknown, context: string): number | undefined =>
  value === undefined || value === null ? undefined : requireNumber(value, context)

const optionalString = (value: unknown, context: string): string | undefined =>
  value === undefined || value === null ? undefined : requireString(value, context)

export const parseBulkJoinRule = (value: unknown, context: string): BulkJoinRule => {
  const record = requireRecord(value, context)
  return {
    left_file: requireString(record.left_file, `${context}.left_file`),
    left_column: requireString(record.left_column, `${context}.left_column`),
    right_file: requireString(record.right_file, `${context}.right_file`),
    right_column: requireString(record.right_column, `${context}.right_column`),
    join_type: requireString(record.join_type, `${context}.join_type`),
    purpose: optionalString(record.purpose, `${context}.purpose`),
    confidence: optionalNumber(record.confidence, `${context}.confidence`),
  }
}

export function parseBulkUploadResponse(value: unknown): BulkUploadResponse {
  const record = requireRecord(value, 'upload')
  if (!Array.isArray(record.files) || !Array.isArray(record.join_rules)) {
    throw new Error('용어 일괄 업로드 응답 계약 오류: files와 join_rules 배열이 필요합니다.')
  }
  return {
    session_id: requireString(record.session_id, 'upload.session_id'),
    files: record.files.map((item, index) => {
      const context = `upload.files[${index}]`
      const file = requireRecord(item, context)
      if (!Array.isArray(file.sample_rows)) {
        throw new Error(`용어 일괄 업로드 ${context}.sample_rows 응답 계약 오류: 배열이 필요합니다.`)
      }
      const rawMapping = file.column_mapping === undefined
        ? undefined
        : requireRecord(file.column_mapping, `${context}.column_mapping`)
      const role = optionalString(file.role, `${context}.role`)
      if (
        role !== undefined
        && role !== 'term_source'
        && role !== 'word_dictionary'
        && role !== 'domain_dictionary'
        && role !== 'code_dictionary'
        && role !== 'unknown'
      ) {
        throw new Error(`용어 일괄 업로드 ${context}.role 응답 계약 오류: 지원하지 않는 역할입니다.`)
      }
      return {
        filename: requireString(file.filename, `${context}.filename`),
        headers: requireStringArray(file.headers, `${context}.headers`),
        sample_rows: file.sample_rows.map((row, rowIndex) =>
          requireStringArray(row, `${context}.sample_rows[${rowIndex}]`),
        ),
        total_rows: requireNumber(file.total_rows, `${context}.total_rows`),
        detected_encoding: file.detected_encoding === null
          ? null
          : optionalString(file.detected_encoding, `${context}.detected_encoding`),
        parse_status: requireString(file.parse_status, `${context}.parse_status`),
        role,
        confidence: optionalNumber(file.confidence, `${context}.confidence`),
        column_mapping: rawMapping && Object.fromEntries(
          Object.entries(rawMapping).map(([key, entry]) => [
            key,
            entry === null ? null : requireString(entry, `${context}.column_mapping.${key}`),
          ]),
        ),
        unmapped_columns: file.unmapped_columns === undefined
          ? undefined
          : requireStringArray(file.unmapped_columns, `${context}.unmapped_columns`),
      }
    }),
    join_rules: record.join_rules.map((item, index) =>
      parseBulkJoinRule(item, `upload.join_rules[${index}]`),
    ),
    term_source_file: record.term_source_file === null
      ? null
      : requireString(record.term_source_file, 'upload.term_source_file'),
    no_term_source: requireBoolean(record.no_term_source, 'upload.no_term_source'),
  }
}

export function parseBulkExtractResponse(value: unknown): BulkExtractResponse {
  const record = requireRecord(value, 'complete')
  if (!Array.isArray(record.term_candidates) || !Array.isArray(record.join_statistics)) {
    throw new Error('용어 추출 complete 응답 계약 오류: 후보와 조인 통계 배열이 필요합니다.')
  }
  const fieldStatistics = requireRecord(record.field_statistics, 'complete.field_statistics')
  return {
    term_candidates: record.term_candidates.map((item, index) => {
      const context = `complete.term_candidates[${index}]`
      const candidate = requireRecord(item, context)
      const status = requireString(candidate.status, `${context}.status`)
      if (status !== 'Draft' && status !== 'Pending' && status !== 'Approved' && status !== 'Deprecated') {
        throw new Error(`용어 추출 ${context}.status 응답 계약 오류: 지원하지 않는 상태입니다.`)
      }
      return {
        row_index: requireNumber(candidate.row_index, `${context}.row_index`),
        name: requireString(candidate.name, `${context}.name`),
        description: requireString(candidate.description, `${context}.description`),
        status,
        synonyms: requireStringArray(candidate.synonyms, `${context}.synonyms`),
        domains: requireStringArray(candidate.domains, `${context}.domains`),
        tags: requireStringArray(candidate.tags, `${context}.tags`),
        owners: candidate.owners === undefined ? undefined : requireStringArray(candidate.owners, `${context}.owners`),
        reviewers: candidate.reviewers === undefined ? undefined : requireStringArray(candidate.reviewers, `${context}.reviewers`),
      }
    }),
    total: requireNumber(record.total, 'complete.total'),
    enriched: requireBoolean(record.enriched, 'complete.enriched'),
    join_statistics: record.join_statistics.map((item, index) => {
      const context = `complete.join_statistics[${index}]`
      const statistic = requireRecord(item, context)
      return {
        rule: requireString(statistic.rule, `${context}.rule`),
        matched: requireNumber(statistic.matched, `${context}.matched`),
        unmatched: requireNumber(statistic.unmatched, `${context}.unmatched`),
        total: requireNumber(statistic.total, `${context}.total`),
      }
    }),
    field_statistics: Object.fromEntries(Object.entries(fieldStatistics).map(([key, value]) => {
      const context = `complete.field_statistics.${key}`
      const statistic = requireRecord(value, context)
      const distribution = statistic.distribution === undefined
        ? undefined
        : Object.fromEntries(Object.entries(requireRecord(statistic.distribution, `${context}.distribution`)).map(([name, count]) => [
            name,
            requireNumber(count, `${context}.distribution.${name}`),
          ]))
      return [key, {
        filled: requireNumber(statistic.filled, `${context}.filled`),
        empty: requireNumber(statistic.empty, `${context}.empty`),
        distribution,
      }]
    })),
    unmapped_columns: requireStringArray(record.unmapped_columns, 'complete.unmapped_columns'),
  }
}

export function parseBulkImportResponse(value: unknown): BulkImportResponse {
  const record = requireRecord(value, 'import')
  if (!Array.isArray(record.errors)) {
    throw new Error('용어 일괄 가져오기 응답 계약 오류: errors 배열이 필요합니다.')
  }
  return {
    batch_id: requireString(record.batch_id, 'import.batch_id'),
    created: requireNumber(record.created, 'import.created'),
    skipped: requireNumber(record.skipped, 'import.skipped'),
    errors: record.errors.map((item, index) => {
      const entry = requireRecord(item, `import.errors[${index}]`)
      return {
        name: requireString(entry.name, `import.errors[${index}].name`),
        reason: requireString(entry.reason, `import.errors[${index}].reason`),
      }
    }),
    domains_created: requireNumber(record.domains_created, 'import.domains_created'),
    domains_existing: requireNumber(record.domains_existing, 'import.domains_existing'),
    unmapped_columns_reminder: requireStringArray(
      record.unmapped_columns_reminder,
      'import.unmapped_columns_reminder',
    ),
    next_steps: requireStringArray(record.next_steps, 'import.next_steps'),
  }
}

export function parseBulkRollbackResponse(value: unknown): BulkRollbackResponse {
  const record = requireRecord(value, 'rollback')
  return {
    deleted: requireNumber(record.deleted, 'rollback.deleted'),
    batch_id: requireString(record.batch_id, 'rollback.batch_id'),
  }
}

export function parseBulkExtractStreamEvent(eventName: string, value: unknown): BulkExtractStreamEvent {
  if (eventName === 'progress') {
    const record = requireRecord(value, 'progress')
    return {
      event: 'progress',
      data: {
        processed: requireNumber(record.processed, 'progress.processed'),
        total: requireNumber(record.total, 'progress.total'),
        estimated_remaining_seconds: record.estimated_remaining_seconds === undefined
          ? undefined
          : requireNumber(record.estimated_remaining_seconds, 'progress.estimated_remaining_seconds'),
      },
    }
  }
  if (eventName === 'complete') {
    return { event: 'complete', data: parseBulkExtractResponse(value) }
  }
  throw new Error(`지원하지 않는 용어 추출 SSE 이벤트 '${eventName}'입니다.`)
}

export const glossaryApi = {
  /**
   * 용어집 목록 조회
   */
  async getGlossaries(headers: Headers, signal?: AbortSignal): Promise<{ glossaries: Glossary[] }> {
    const response = await fetch(`${ROBO_BASE_URL}/glossary/`, {
      method: 'GET',
      headers,
      signal,
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return parseGlossaryListResponse(await response.json())
  },

  /**
   * 용어집 생성
   */
  async createGlossary(headers: Headers, data: CreateGlossaryRequest): Promise<{ id: string; name: string }> {
    const response = await fetch(`${ROBO_BASE_URL}/glossary/`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return parseCatalogEntityIdentityResponse(await response.json())
  },

  /**
   * 용어집 상세 조회
   */
  async getGlossary(headers: Headers, glossaryId: string): Promise<Glossary> {
    const response = await fetch(`${ROBO_BASE_URL}/glossary/${glossaryId}`, {
      method: 'GET',
      headers
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return parseGlossaryResponse(await response.json())
  },

  /**
   * 용어집 수정
   */
  async updateGlossary(headers: Headers, glossaryId: string, data: Partial<CreateGlossaryRequest>): Promise<void> {
    const response = await fetch(`${ROBO_BASE_URL}/glossary/${glossaryId}`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
  },

  /**
   * 용어집 삭제
   */
  async deleteGlossary(headers: Headers, glossaryId: string): Promise<void> {
    const response = await fetch(`${ROBO_BASE_URL}/glossary/${glossaryId}`, {
      method: 'DELETE',
      headers
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
  },

  /**
   * 용어 목록 조회
   */
  async getTerms(headers: Headers, glossaryId: string, options?: { status?: string; search?: string }): Promise<{ terms: Term[] }> {
    const params = new URLSearchParams()
    if (options?.status) params.append('status', options.status)
    if (options?.search) params.append('search', options.search)

    const queryString = params.toString()
    const url = `${ROBO_BASE_URL}/glossary/${glossaryId}/terms${queryString ? '?' + queryString : ''}`

    const response = await fetch(url, {
      method: 'GET',
      headers
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return parseTermListResponse(await response.json())
  },

  /**
   * 용어 생성
   */
  async createTerm(headers: Headers, glossaryId: string, data: CreateTermRequest): Promise<{ id: string; name: string }> {
    const response = await fetch(`${ROBO_BASE_URL}/glossary/${glossaryId}/terms`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return parseCatalogEntityIdentityResponse(await response.json())
  },

  /**
   * 용어 상세 조회
   */
  async getTerm(headers: Headers, glossaryId: string, termId: string): Promise<Term> {
    const response = await fetch(`${ROBO_BASE_URL}/glossary/${glossaryId}/terms/${termId}`, {
      method: 'GET',
      headers
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return parseTermResponse(await response.json())
  },

  /**
   * 용어 수정
   */
  async updateTerm(headers: Headers, glossaryId: string, termId: string, data: UpdateTermRequest): Promise<void> {
    const response = await fetch(`${ROBO_BASE_URL}/glossary/${glossaryId}/terms/${termId}`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
  },

  /**
   * 용어 삭제
   */
  async deleteTerm(headers: Headers, glossaryId: string, termId: string): Promise<void> {
    const response = await fetch(`${ROBO_BASE_URL}/glossary/${glossaryId}/terms/${termId}`, {
      method: 'DELETE',
      headers
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
  },

  async bulkUploadTerms(headers: Headers, glossaryId: string, files: File[]): Promise<BulkUploadResponse> {
    const formData = new FormData()
    for (const file of files) {
      formData.append('files', file, file.name)
    }
    return parseBulkUploadResponse(await postFormData<unknown>(
      `${ROBO_BASE_URL}/glossary/${glossaryId}/terms/bulk-upload`,
      formData,
      headers
    ))
  },

  async bulkExtractTerms(headers: Headers, glossaryId: string, data: BulkExtractRequest): Promise<BulkExtractResponse> {
    return parseBulkExtractResponse(await postJson<unknown>(
      `${ROBO_BASE_URL}/glossary/${glossaryId}/terms/bulk-extract`,
      data,
      headers
    ))
  },

  async bulkExtractStream(
    headers: Headers,
    glossaryId: string,
    data: BulkExtractRequest,
    onEvent: (event: BulkExtractStreamEvent) => void,
    options: { signal?: AbortSignal } = {}
  ): Promise<void> {
    const params = new URLSearchParams({
      session_id: data.session_id,
      payload: JSON.stringify({
        confirmed_mapping: data.confirmed_mapping,
        confirmed_joins: data.confirmed_joins,
        value_transforms: data.value_transforms
      })
    })
    await streamSseFetch(
      `${ROBO_BASE_URL}/glossary/${glossaryId}/terms/bulk-extract/stream?${params.toString()}`,
      headers,
      event => onEvent(parseBulkExtractStreamEvent(event.event, event.data)),
      value => value,
      options.signal
    )
  },

  async bulkImportTerms(headers: Headers, glossaryId: string, data: BulkImportRequest): Promise<BulkImportResponse> {
    return parseBulkImportResponse(await postJson<unknown>(
      `${ROBO_BASE_URL}/glossary/${glossaryId}/terms/bulk-import`,
      data,
      headers
    ))
  },

  async bulkRollback(headers: Headers, glossaryId: string, batchId: string): Promise<BulkRollbackResponse> {
    const response = await fetch(`${ROBO_BASE_URL}/glossary/${glossaryId}/terms/bulk-rollback/${batchId}`, {
      method: 'DELETE',
      headers
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return parseBulkRollbackResponse(await response.json())
  },

  /**
   * 도메인 목록 조회
   */
  async getDomains(headers: Headers): Promise<{ domains: GlossaryDomain[] }> {
    const response = await fetch(`${ROBO_BASE_URL}/glossary/meta/domains`, {
      method: 'GET',
      headers
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return parseGlossaryMetadataResponse(await response.json(), 'domains')
  },

  /**
   * 소유자 목록 조회
   */
  async getOwners(headers: Headers): Promise<{ owners: GlossaryOwner[] }> {
    const response = await fetch(`${ROBO_BASE_URL}/glossary/meta/owners`, {
      method: 'GET',
      headers
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return parseGlossaryMetadataResponse(await response.json(), 'owners')
  },

  /**
   * 태그 목록 조회
   */
  async getTags(headers: Headers): Promise<{ tags: GlossaryTag[] }> {
    const response = await fetch(`${ROBO_BASE_URL}/glossary/meta/tags`, {
      method: 'GET',
      headers
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return parseGlossaryMetadataResponse(await response.json(), 'tags')
  },

  /**
   * 도메인 생성
   */
  async createDomain(headers: Headers, data: { name: string; description?: string }): Promise<{ id: string; name: string }> {
    const response = await fetch(`${ROBO_BASE_URL}/glossary/meta/domains`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  /**
   * 소유자 생성
   */
  async createOwner(headers: Headers, data: { name: string; email?: string }): Promise<{ id: string; name: string }> {
    const response = await fetch(`${ROBO_BASE_URL}/glossary/meta/owners`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  /**
   * 태그 생성
   */
  async createTag(headers: Headers, data: { name: string; color?: string }): Promise<{ id: string; name: string; color: string }> {
    const response = await fetch(`${ROBO_BASE_URL}/glossary/meta/tags`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  }
}

// ============================================================================
// Business Day Calendar API (영업일 캘린더)
// ============================================================================

export interface BusinessDay {
  date: string         // YYYY-MM-DD
  isBusinessDay: boolean
  reason?: string
}

export interface BusinessDayCalendarSettings {
  excludeWeekends: boolean
}

export interface SaveBusinessDaysRequest {
  year: number
  nonBusinessDays: Array<{ date: string; isBusinessDay: boolean; reason?: string }>
  holidays: Array<{ date: string; name: string }>
  settings: BusinessDayCalendarSettings
}

export interface BusinessDaysResponse {
  businessDays: BusinessDay[]
  holidays: Array<{ date: string; name: string }>
  settings: BusinessDayCalendarSettings
}

function requireCalendarDate(value: unknown, context: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Catalog business calendar ${context} 응답 계약 오류: YYYY-MM-DD 날짜가 필요합니다.`)
  }
  return value
}

export function parseBusinessDaysResponse(value: unknown): BusinessDaysResponse {
  const record = asRecord(value)
  if (!Array.isArray(record.businessDays) || !Array.isArray(record.holidays)) {
    throw new Error('Catalog business calendar 응답 계약 오류: businessDays와 holidays 배열이 필요합니다.')
  }
  const settings = asRecord(record.settings)
  if (typeof settings.excludeWeekends !== 'boolean') {
    throw new Error('Catalog business calendar settings.excludeWeekends 응답 계약 오류')
  }
  return {
    businessDays: record.businessDays.map((item, index) => {
      const day = asRecord(item)
      if (typeof day.isBusinessDay !== 'boolean') {
        throw new Error(
          `Catalog business calendar businessDays[${index}].isBusinessDay 응답 계약 오류`,
        )
      }
      return {
        date: requireCalendarDate(day.date, `businessDays[${index}].date`),
        isBusinessDay: day.isBusinessDay,
        reason: typeof day.reason === 'string' ? day.reason : undefined,
      }
    }),
    holidays: record.holidays.map((item, index) => {
      const holiday = asRecord(item)
      const name = typeof holiday.name === 'string' ? holiday.name.trim() : ''
      if (!name) {
        throw new Error(
          `Catalog business calendar holidays[${index}].name 응답 계약 오류`,
        )
      }
      return {
        date: requireCalendarDate(holiday.date, `holidays[${index}].date`),
        name,
      }
    }),
    settings: { excludeWeekends: settings.excludeWeekends },
  }
}

export function parseBusinessCalendarMutationResponse(value: unknown): { success: boolean } {
  const record = asRecord(value)
  if (typeof record.success !== 'boolean') {
    throw new Error('Catalog business calendar mutation.success 응답 계약 오류')
  }
  if (!record.success) {
    throw new Error('Catalog business calendar mutation이 success=false를 반환했습니다.')
  }
  return { success: true }
}

export const businessCalendarApi = {
  /**
   * 영업일 데이터 조회
   */
  async getBusinessDays(headers: Headers, year: number): Promise<BusinessDaysResponse> {
    const response = await fetch(`${ROBO_BASE_URL}/business-calendar/${year}`, {
      method: 'GET',
      headers
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return parseBusinessDaysResponse(await response.json())
  },

  /**
   * 영업일 설정 저장
   */
  async saveBusinessDays(headers: Headers, data: SaveBusinessDaysRequest): Promise<{ success: boolean }> {
    const response = await fetch(`${ROBO_BASE_URL}/business-calendar/`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return parseBusinessCalendarMutationResponse(await response.json())
  },

  /**
   * 특정 날짜가 영업일인지 확인
   */
  async isBusinessDay(headers: Headers, date: string): Promise<{ date: string; isBusinessDay: boolean }> {
    const response = await fetch(`${ROBO_BASE_URL}/business-calendar/check/${date}`, {
      method: 'GET',
      headers
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    const result = asRecord(await response.json())
    if (typeof result.isBusinessDay !== 'boolean') {
      throw new Error('Catalog business calendar check.isBusinessDay 응답 계약 오류')
    }
    return {
      date: requireCalendarDate(result.date, 'check.date'),
      isBusinessDay: result.isBusinessDay,
    }
  },

  /**
   * 영업일 설정 삭제 (특정 연도)
   */
  async deleteBusinessDays(headers: Headers, year: number): Promise<{ success: boolean }> {
    const response = await fetch(`${ROBO_BASE_URL}/business-calendar/${year}`, {
      method: 'DELETE',
      headers
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return parseBusinessCalendarMutationResponse(await response.json())
  },

  /**
   * 비영업일 날짜 목록만 조회 (필터용)
   */
  async getNonBusinessDates(headers: Headers, startDate: string, endDate: string): Promise<{ dates: string[] }> {
    const params = new URLSearchParams({ start: startDate, end: endDate })
    const response = await fetch(`${ROBO_BASE_URL}/business-calendar/non-business-dates?${params}`, {
      method: 'GET',
      headers
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    const result = asRecord(await response.json())
    if (!Array.isArray(result.dates)) {
      throw new Error('Catalog business calendar non-business-dates 응답 계약 오류')
    }
    return {
      dates: result.dates.map((date, index) =>
        requireCalendarDate(date, `non-business-dates[${index}]`),
      ),
    }
  }
}
