/**
 * http.ts — 공유 HTTP 코어
 *
 * 모든 도메인 api 가 공유하는 것: API Gateway base URL, fetch 래퍼(JSON/FormData),
 * NDJSON·SSE 스트림 처리, 서비스별 친절 에러 메시지.
 * 도메인별 api 는 이 코어를 import 해 엔드포인트만 정의한다.
 */
import type { StreamEvent } from '@/shared/types'
import { logger } from '@/shared/utils/logger'

// ============================================================================
// Base URL — API Gateway(/api/gateway/*) 단일 진입점. Vite 프록시 → Spring Gateway(9000).
// ============================================================================
export const API_GATEWAY_URL = import.meta.env.VITE_API_GATEWAY_URL ?? '/api/gateway'
export const ANTLR_BASE_URL = `${API_GATEWAY_URL}/antlr`
export const ROBO_BASE_URL = `${API_GATEWAY_URL}/robo`
export const TEXT2SQL_BASE_URL = import.meta.env.VITE_TEXT2SQL_API_URL || `${API_GATEWAY_URL}/text2sql`
export const ONTOLOGY_BASE_URL = `${API_GATEWAY_URL}/ontology`

export type StreamCallback = (event: StreamEvent) => void
export type Headers = Record<string, string>

// ============================================================================
// HTTP 유틸리티
// ============================================================================

/**
 * 서비스 다운(404/502/503) 시 안내할 메시지 — URL 매칭 기반 dispatch.
 * if/else-if 체인 대신 테이블로 두어, 서비스 추가 시 한 항목만 늘린다.
 */
const SERVICE_DOWN_STATUSES = new Set([404, 502, 503])
const SERVICE_DOWN_GUIDANCE: ReadonlyArray<{ match: string; message: string }> = [
  {
    match: '/antlr/',
    message:
      '🔧 ANTLR 파서 서비스가 동작하지 않습니다.\n\n' +
      '다음을 확인해주세요:\n' +
      '• ANTLR 서비스가 실행 중인지 확인 (포트 8081)\n' +
      '• API Gateway가 정상 동작하는지 확인 (포트 9000)\n\n' +
      '서비스 시작 명령어:\n' +
      'cd antlr-code-parser && mvn spring-boot:run'
  },
  {
    match: '/robo/',
    message:
      '🔧 ROBO Analyzer 서비스가 동작하지 않습니다.\n\n' +
      '다음을 확인해주세요:\n' +
      '• robo-analyzer 서비스가 실행 중인지 확인 (포트 5502)\n' +
      '• API Gateway가 정상 동작하는지 확인 (포트 9000)'
  },
  {
    match: '/text2sql/',
    message:
      '🔧 Text2SQL 서비스가 동작하지 않습니다.\n\n' +
      '다음을 확인해주세요:\n' +
      '• neo4j-text2sql 서비스가 실행 중인지 확인 (포트 8000)\n' +
      '• API Gateway가 정상 동작하는지 확인 (포트 9000)'
  },
  {
    match: '/whatif/',
    message:
      '🔧 What-If 시뮬레이터 서비스가 동작하지 않습니다.\n\n' +
      '다음을 확인해주세요:\n' +
      '• What-If 서비스가 실행 중인지 확인 (포트 8005)\n' +
      '• API Gateway가 정상 동작하는지 확인 (포트 9000)'
  }
]

/**
 * HTTP 에러 처리 — 서비스 다운이면 친절 안내, 아니면 서버 JSON 오류에서 메시지 추출.
 * 모든 도메인 api 가 공유하는 단일 에러 핸들러(중복 정의 금지).
 */
export async function handleHttpError(response: Response): Promise<never> {
  const errorText = await response.text().catch(() => '')

  console.error(`[API Error] ${response.status} ${response.statusText}`)
  console.error(`[API Error] URL: ${response.url}`)
  console.error(`[API Error] Response body:`, errorText)

  // 1) 서비스 다운(404/502/503) — URL 매칭 안내
  if (SERVICE_DOWN_STATUSES.has(response.status)) {
    const guidance = SERVICE_DOWN_GUIDANCE.find(g => response.url.includes(g.match))
    if (guidance) {
      throw new Error(guidance.message)
    }
  }

  // 2) 서버 JSON 오류 응답에서 detail/message 추출
  throw new Error(parseErrorMessage(errorText, response.status))
}

/** 서버 오류 본문에서 사람이 읽을 메시지 추출 (내부) */
function parseErrorMessage(errorText: string, status: number): string {
  try {
    const errorJson = JSON.parse(errorText)
    if (errorJson.detail) {
      // FastAPI detail 은 문자열 또는 Pydantic 검증오류 배열([{msg,...}]) — 사람이 읽게 평탄화
      const detail = Array.isArray(errorJson.detail)
        ? errorJson.detail.map((e: any) => e?.msg || (typeof e === 'string' ? e : JSON.stringify(e))).join(', ')
        : (typeof errorJson.detail === 'string' ? errorJson.detail : JSON.stringify(errorJson.detail))
      return errorJson.error_type ? `[${errorJson.error_type}] ${detail}` : detail
    }
    if (errorJson.message) {
      return errorJson.message
    }
  } catch {
    // JSON 아님 — 원문 또는 상태코드로 폴백
  }
  return errorText || `HTTP ${status}`
}

/** JSON POST 요청 */
export async function postJson<T>(
  url: string,
  body: unknown,
  headers: Headers
): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    await handleHttpError(response)
  }

  return response.json()
}

/** FormData POST 요청 */
export async function postFormData<T>(
  url: string,
  formData: FormData,
  headers: Headers
): Promise<T> {
  console.log(`[API] POST ${url}`)
  console.log('[API] Headers:', headers)
  console.log('[API] Full URL:', window.location.origin + url)

  try {
    const requestHeaders = { ...headers }
    delete requestHeaders['Content-Type']

    // FormData 전송 시 브라우저가 자동으로 Content-Type을 설정하므로 명시하지 않음
    const response = await fetch(url, {
      method: 'POST',
      headers: requestHeaders,
      body: formData
    })

    console.log(`[API] Response status: ${response.status} ${response.statusText}`)
    console.log(`[API] Response headers:`, Object.fromEntries(response.headers.entries()))

    if (!response.ok) {
      await handleHttpError(response)
    }

    return response.json()
  } catch (error) {
    console.error('[API] Network error:', error)

    if (error instanceof TypeError && error.message.includes('fetch')) {
      const serviceLabel = url.includes('/robo/') ? 'ROBO Analyzer' : 'ANTLR Server'
      throw new Error(
        `서버에 연결할 수 없습니다. ${serviceLabel} 서비스가 실행 중인지 확인해주세요.\n` +
        `원본 오류: ${error.message}`
      )
    }

    if (error instanceof Error) {
      throw new Error(
        `파일 업로드 중 오류가 발생했습니다: ${error.message}\n` +
        `서버 상태를 확인해주세요.`
      )
    }

    throw error
  }
}

/** SSE 스트림 fetch (event:/data: 라인 파싱) */
export async function streamSseFetch(
  url: string,
  headers: Headers,
  onEvent: (event: { event: string; data: any }) => void,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch(url, {
    method: 'GET',
    headers,
    signal
  })

  if (!response.ok) {
    await handleHttpError(response)
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('SSE 응답 바디를 읽을 수 없습니다.')
  }

  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let currentEvent = 'message'
  let currentDataLines: string[] = []

  const flushEvent = () => {
    if (currentDataLines.length === 0) return
    const rawData = currentDataLines.join('\n')
    let data: any
    try {
      data = JSON.parse(rawData)
    } catch (e) {
      logger.warn('[stream] SSE 데이터 파싱 실패 — 이 이벤트는 건너뜁니다:', rawData, e)
      currentEvent = 'message'
      currentDataLines = []
      return
    }
    onEvent({ event: currentEvent, data })
    currentEvent = 'message'
    currentDataLines = []
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) {
          flushEvent()
          continue
        }
        if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim() || 'message'
          continue
        }
        if (line.startsWith('data:')) {
          currentDataLines.push(line.slice(5).trim())
        }
      }
    }

    if (buffer.trim()) {
      const lines = buffer.split(/\r?\n/)
      for (const line of lines) {
        if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim() || 'message'
        } else if (line.startsWith('data:')) {
          currentDataLines.push(line.slice(5).trim())
        }
      }
    }
    flushEvent()
  } finally {
    reader.releaseLock()
  }
}

// ============================================================================
// NDJSON 스트림 처리
// ============================================================================

/** NDJSON 스트림 fetch */
export async function streamFetch(
  url: string,
  body: unknown,
  headers: Headers,
  onEvent: StreamCallback,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal
  })

  if (!response.ok) {
    await handleHttpError(response)
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Response body is not readable')
  }

  await processStream(reader, onEvent)
}

/** 스트림 데이터 처리 (내부) */
async function processStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent: StreamCallback
): Promise<void> {
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      buffer = processBuffer(buffer, onEvent)
    }

    processFinalBuffer(buffer, onEvent)
  } finally {
    reader.releaseLock()
  }
}

/** 버퍼에서 완전한 JSON 라인 추출·처리 (내부) */
function processBuffer(buffer: string, onEvent: StreamCallback): string {
  const lines = buffer.split('\n')
  const remaining = lines.pop() || ''

  for (const line of lines) {
    if (!line.trim()) continue

    const event = parseJsonLine(line)
    if (!event) continue   // 손상 줄 — 이미 기록됨, 다음 줄 계속
    onEvent(event)
    // ★'error' 는 데이터성 이벤트(콘솔 표시) — 스트림 종결이 아니다(종결=HTTP done/stream_end).
    //   종결로 오인하면 같은 청크의 뒤 라인(node/relationship 등)이 유실됨(spec 031).
    if (event.type === 'complete') {
      return ''
    }
  }

  return remaining
}

/** 최종 버퍼 처리 (내부) */
function processFinalBuffer(buffer: string, onEvent: StreamCallback): void {
  if (!buffer.trim()) return

  const event = parseJsonLine(buffer)
  if (event) onEvent(event)
}

/** JSON 라인 파싱 (내부) — 손상된 줄은 기록 후 null 반환(스트림 전체를 죽이지 않는다). */
function parseJsonLine(line: string): StreamEvent | null {
  try {
    return JSON.parse(line)
  } catch (e) {
    logger.warn('[stream] NDJSON 한 줄 파싱 실패 — 이 줄은 건너뜁니다:', line, e)
    return null
  }
}
