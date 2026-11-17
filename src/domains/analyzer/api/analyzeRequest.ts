import type { BackendRequestMetadata } from '@/shared/types'

/**
 * analyzer `POST /robo/analyze` 가 받는 본문 — **이 넷만** 보낸다.
 *
 * analyzer 는 `AnalyzeRequest(extra="forbid")` 라 모르는 칸이 하나라도 있으면 422 로 거절한다
 * (robo-data-analyzer `api/analyze_router.py`, 2026-08-29 `0b225b73` 부터).
 * 화면 쪽 메타데이터에는 파서·화면용 칸(`target`·`nameCase`·`inferFkRelations`·`targetFolder`·
 * `project_root`)이 함께 있어서 그대로 보내면 **화면에서 분석을 시작하자마자 거절**된다(2026-11-17 확인).
 *
 * 칸을 더하려면 analyzer 의 `AnalyzeRequest` 에 먼저 더하고 여기에 같이 적는다.
 */
export interface AnalyzeRequestBody {
  strategy: BackendRequestMetadata['strategy']
  locale?: string
  selected_source_ids?: string[]
  datasource?: string | null
}

export function toAnalyzeRequestBody(
  metadata: BackendRequestMetadata & { locale?: string; selected_source_ids?: string[] },
): AnalyzeRequestBody {
  const body: AnalyzeRequestBody = { strategy: metadata.strategy }
  if (metadata.locale) body.locale = metadata.locale
  if (metadata.selected_source_ids?.length) body.selected_source_ids = [...metadata.selected_source_ids]
  if (metadata.datasource !== undefined) body.datasource = metadata.datasource
  return body
}
