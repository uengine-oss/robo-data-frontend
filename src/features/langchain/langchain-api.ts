/**
 * LangChain Text2SQL API Service
 * API Gateway를 통해 연결됨
 */

// API Gateway URL - 모든 마이크로서비스 요청의 단일 진입점
const API_GATEWAY_URL = import.meta.env.VITE_API_GATEWAY_URL ?? 'http://localhost:9000'
const LANGCHAIN_API_URL = `${API_GATEWAY_URL}/langchain/api`

export interface LangChainRequest {
  question: string
  max_iterations?: number
  max_sql_seconds?: number
}

export interface LangChainStep {
  tool: string
  input: string
  output: string
}

export interface LangChainResponse {
  output: string
  steps: LangChainStep[]
}

export interface LangChainStreamEvent {
  type: 'phase' | 'token' | 'action' | 'complete' | 'error' | 'finish'
  phase?: 'thinking' | 'reasoning' | 'acting' | 'observing'
  step?: number
  token?: string
  tool?: string
  input?: string
  result?: string
  content?: string
  output?: string
  message?: string
}

/**
 * Run LangChain ReAct agent (non-streaming)
 */
export async function runLangChain(request: LangChainRequest): Promise<LangChainResponse> {
  const response = await fetch(`${LANGCHAIN_API_URL}/react/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  })
  
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }
  
  return response.json()
}

/**
 * Stream LangChain ReAct agent execution
 */
export async function* streamLangChain(
  request: LangChainRequest,
  options?: { signal?: AbortSignal }
): AsyncGenerator<LangChainStreamEvent> {
  const response = await fetch(`${LANGCHAIN_API_URL}/react/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
    signal: options?.signal,
  })
  
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }
  
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('No response body')
  }
  
  const decoder = new TextDecoder()
  let buffer = ''
  
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      
      for (const line of lines) {
        if (line.trim()) {
          try {
            yield JSON.parse(line)
          } catch {
            console.warn('Failed to parse event:', line)
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}



