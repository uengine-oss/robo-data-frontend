/** glossary api — 용어집·영업일 캘린더·용어 일괄업로드. 공유 http 코어 사용. */
import { ROBO_BASE_URL, handleHttpError, postJson, postFormData, streamSseFetch, type Headers } from '@/shared/services/http'

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

export interface BulkExtractStreamEvent {
  event: 'progress' | 'complete'
  data: any
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' ? value as Record<string, unknown> : {}

const normalizeStringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []

  return value
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean)
}

const normalizeDomainList = (value: unknown): Term['domains'] => {
  if (!Array.isArray(value)) return []

  return value.flatMap(item => {
    if (typeof item === 'string') {
      const name = item.trim()
      return name ? [{ id: name, name }] : []
    }

    const record = asRecord(item)
    const name = typeof record.name === 'string' ? record.name.trim() : ''
    if (!name) return []

    return [{
      id: typeof record.id === 'string' && record.id ? record.id : name,
      name
    }]
  })
}

const normalizeOwnerList = (value: unknown): GlossaryOwner[] => {
  if (!Array.isArray(value)) return []

  return value.flatMap(item => {
    if (typeof item === 'string') {
      const name = item.trim()
      return name ? [{ id: name, name, email: '' }] : []
    }

    const record = asRecord(item)
    const name = typeof record.name === 'string' ? record.name.trim() : ''
    if (!name) return []

    return [{
      id: typeof record.id === 'string' && record.id ? record.id : name,
      name,
      email: typeof record.email === 'string' ? record.email : ''
    }]
  })
}

const normalizeTagList = (value: unknown): GlossaryTag[] => {
  if (!Array.isArray(value)) return []

  return value.flatMap(item => {
    if (typeof item === 'string') {
      const name = item.trim()
      return name ? [{ id: name, name, color: '#3498db' }] : []
    }

    const record = asRecord(item)
    const name = typeof record.name === 'string' ? record.name.trim() : ''
    if (!name) return []

    return [{
      id: typeof record.id === 'string' && record.id ? record.id : name,
      name,
      color: typeof record.color === 'string' && record.color ? record.color : '#3498db'
    }]
  })
}

const normalizeRelatedTerms = (value: unknown): NonNullable<Term['relatedTerms']> => {
  if (!Array.isArray(value)) return []

  return value.flatMap(item => {
    const record = asRecord(item)
    const id = typeof record.id === 'string' ? record.id : ''
    const name = typeof record.name === 'string' ? record.name.trim() : ''
    return id && name ? [{ id, name }] : []
  })
}

const normalizeTerm = (value: unknown): Term => {
  const record = asRecord(value)
  const rawStatus = typeof record.status === 'string' ? record.status : 'Draft'
  const status: Term['status'] =
    rawStatus === 'Pending' || rawStatus === 'Approved' || rawStatus === 'Deprecated'
      ? rawStatus
      : 'Draft'

  return {
    id: typeof record.id === 'string' ? record.id : '',
    name: typeof record.name === 'string' ? record.name : '',
    description: typeof record.description === 'string' ? record.description : '',
    status,
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

export const glossaryApi = {
  /**
   * 용어집 목록 조회
   */
  async getGlossaries(headers: Headers): Promise<{ glossaries: Glossary[] }> {
    const response = await fetch(`${ROBO_BASE_URL}/glossary/`, {
      method: 'GET',
      headers
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
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
    return response.json()
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
    return response.json()
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
    const data = await response.json()
    return {
      terms: Array.isArray(data.terms) ? data.terms.map(normalizeTerm) : []
    }
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
    return response.json()
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
    return normalizeTerm(await response.json())
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
    return postFormData<BulkUploadResponse>(
      `${ROBO_BASE_URL}/glossary/${glossaryId}/terms/bulk-upload`,
      formData,
      headers
    )
  },

  async bulkExtractTerms(headers: Headers, glossaryId: string, data: BulkExtractRequest): Promise<BulkExtractResponse> {
    return postJson<BulkExtractResponse>(
      `${ROBO_BASE_URL}/glossary/${glossaryId}/terms/bulk-extract`,
      data,
      headers
    )
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
      event => onEvent(event as BulkExtractStreamEvent),
      options.signal
    )
  },

  async bulkImportTerms(headers: Headers, glossaryId: string, data: BulkImportRequest): Promise<BulkImportResponse> {
    return postJson<BulkImportResponse>(
      `${ROBO_BASE_URL}/glossary/${glossaryId}/terms/bulk-import`,
      data,
      headers
    )
  },

  async bulkRollback(headers: Headers, glossaryId: string, batchId: string): Promise<BulkRollbackResponse> {
    const response = await fetch(`${ROBO_BASE_URL}/glossary/${glossaryId}/terms/bulk-rollback/${batchId}`, {
      method: 'DELETE',
      headers
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
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
    return response.json()
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
    return response.json()
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
    return response.json()
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
    return response.json()
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
    return response.json()
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
    return response.json()
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
    return response.json()
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
    return response.json()
  }
}
