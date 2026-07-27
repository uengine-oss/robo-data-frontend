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

export type StreamCallback = (event: StreamEvent) => void
export type Headers = Record<string, string>
export interface HttpErrorContext {
  serviceName: string
  unavailableMessage?: string
}
export interface SseEvent<T = unknown> {
  event: string
  data: T
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// ============================================================================
// HTTP 유틸리티
// ============================================================================

const SERVICE_DOWN_STATUSES = new Set([404, 502, 503])

/**
 * HTTP 에러 처리 — 서비스 다운이면 친절 안내, 아니면 서버 JSON 오류에서 메시지 추출.
 * 모든 도메인 api 가 공유하는 단일 에러 핸들러(중복 정의 금지).
 */
export async function handleHttpError(
  response: Response,
  context?: HttpErrorContext,
): Promise<never> {
  const errorText = await response.text().catch(() => '')

  logger.error(`[API Error] ${response.status} ${response.statusText}`)
  logger.error(`[API Error] URL: ${response.url}`)
  logger.error('[API Error] Response body:', errorText)

  // 서비스별 문구는 URL로 추론하지 않고 owning domain이 명시적으로 제공한다.
  if (SERVICE_DOWN_STATUSES.has(response.status) && context?.unavailableMessage) {
    throw new Error(context.unavailableMessage)
  }

  // 2) 서버 JSON 오류 응답에서 detail/message 추출
  throw new Error(parseErrorMessage(errorText, response.status))
}

/** 서버 오류 본문에서 사람이 읽을 메시지 추출 (내부) */
function parseErrorMessage(errorText: string, status: number): string {
  try {
    const parsed: unknown = JSON.parse(errorText)
    if (!isRecord(parsed)) return errorText || `HTTP ${status}`
    if (parsed.detail) {
      // FastAPI detail 은 문자열 또는 Pydantic 검증오류 배열([{msg,...}]) — 사람이 읽게 평탄화
      const detail = Array.isArray(parsed.detail)
        ? parsed.detail.map(entry => {
            if (typeof entry === 'string') return entry
            if (isRecord(entry) && typeof entry.msg === 'string') return entry.msg
            return JSON.stringify(entry)
          }).join(', ')
        : (typeof parsed.detail === 'string' ? parsed.detail : JSON.stringify(parsed.detail))
      return typeof parsed.error_type === 'string' ? `[${parsed.error_type}] ${detail}` : detail
    }
    if (typeof parsed.message === 'string') {
      return parsed.message
    }
    if (parsed.error) {
      return typeof parsed.error === 'string'
        ? parsed.error
        : JSON.stringify(parsed.error)
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
  headers: Headers,
  context?: HttpErrorContext,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    await handleHttpError(response, context)
  }

  return response.json()
}

/** FormData POST 요청 */
export async function postFormData<T>(
  url: string,
  formData: FormData,
  headers: Headers,
  context?: HttpErrorContext,
): Promise<T> {
  logger.debug(`[API] POST ${url}`)
  logger.debug('[API] Headers:', headers)
  logger.debug('[API] Full URL:', window.location.origin + url)

  try {
    const requestHeaders = { ...headers }
    delete requestHeaders['Content-Type']

    // FormData 전송 시 브라우저가 자동으로 Content-Type을 설정하므로 명시하지 않음
    const response = await fetch(url, {
      method: 'POST',
      headers: requestHeaders,
      body: formData
    })

    logger.debug(`[API] Response status: ${response.status} ${response.statusText}`)
    logger.debug('[API] Response headers:', Object.fromEntries(response.headers.entries()))

    if (!response.ok) {
      await handleHttpError(response, context)
    }

    return response.json()
  } catch (error) {
    logger.error('[API] Network error:', error)

    if (error instanceof TypeError && error.message.includes('fetch')) {
      const serviceLabel = context?.serviceName ?? 'API'
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
export async function streamSseFetch<T = unknown>(
  url: string,
  headers: Headers,
  onEvent: (event: SseEvent<T>) => void,
  parseData: (value: unknown, eventName: string) => T,
  signal?: AbortSignal,
  context?: HttpErrorContext,
): Promise<void> {
  const response = await fetch(url, {
    method: 'GET',
    headers,
    signal
  })

  if (!response.ok) {
    await handleHttpError(response, context)
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
    let parsed: unknown
    try {
      parsed = JSON.parse(rawData)
    } catch {
      throw new Error(`SSE '${currentEvent}' 이벤트의 JSON 형식이 올바르지 않습니다.`)
    }
    onEvent({ event: currentEvent, data: parseData(parsed, currentEvent) })
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
  signal?: AbortSignal,
  context?: HttpErrorContext,
): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal
  })

  if (!response.ok) {
    await handleHttpError(response, context)
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Response body is not readable')
  }

  await processStream(reader, onEvent)
}

/** 도메인이 자기 서비스의 오류 문맥을 소유하면서 공통 transport를 재사용하는 경계. */
export function createHttpClient(context: HttpErrorContext) {
  return {
    handleError: (response: Response) => handleHttpError(response, context),
    postJson: <T>(
      url: string,
      body: unknown,
      headers: Headers,
      signal?: AbortSignal,
    ) => postJson<T>(url, body, headers, context, signal),
    postFormData: <T>(url: string, body: FormData, headers: Headers) =>
      postFormData<T>(url, body, headers, context),
    streamSse: <T = unknown>(
      url: string,
      headers: Headers,
      onEvent: (event: SseEvent<T>) => void,
      parseData: (value: unknown, eventName: string) => T,
      signal?: AbortSignal,
    ) => streamSseFetch(url, headers, onEvent, parseData, signal, context),
    stream: (
      url: string,
      body: unknown,
      headers: Headers,
      onEvent: StreamCallback,
      signal?: AbortSignal,
    ) => streamFetch(url, body, headers, onEvent, signal, context),
  }
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
