import type { BulkTermStatus } from '../application/bulkUploadDraft.ts'

export const BULK_TERM_STATUS_OPTIONS: ReadonlyArray<{
  value: BulkTermStatus
  label: string
}> = [
  { value: 'Draft', label: '초안' },
  { value: 'Pending', label: '검토중' },
  { value: 'Approved', label: '승인됨' },
  { value: 'Deprecated', label: '폐기됨' },
]

export const BULK_MAPPING_HELP_TEXT = {
  name: '용어 자체를 식별하는 대표 이름입니다.',
  description: '용어의 의미를 설명하는 문장입니다.',
  status: '용어의 승인 상태입니다. 초안, 검토중, 승인됨, 폐기됨 중 하나로 들어갑니다.',
  synonyms: '같은 뜻을 가지는 다른 표현들의 목록입니다.',
  domains: '용어가 속하는 업무 분류 카테고리입니다.',
} as const

export function getBulkConfidenceLabel(confidence = 0): '높음' | '중간' | '낮음' {
  if (confidence >= 0.85) return '높음'
  if (confidence >= 0.6) return '중간'
  return '낮음'
}
