/** Runtime-validated client for ontology node-local agent execution. */
import { useRuntimeStore } from '@/shared/stores/runtime'
import {
  API_GATEWAY_URL,
  handleHttpError,
  postJson,
  streamSseFetch,
  type Headers,
} from '@/shared/services/http'

const NODE_AGENT_SCHEDULER_URL = `${API_GATEWAY_URL}/node-agent-scheduler`

export type NodeAgentStatus = 'idle' | 'running' | 'paused' | 'stopped' | 'failed' | 'completed'
export type NodeAgentLogLevel = 'info' | 'warn' | 'error' | 'debug'

export interface NodeAgentState {
  nodeTypeName: string
  status: NodeAgentStatus
  startedAt?: string
  lastRunAt?: string
  runCount: number
  lastError?: string
  feedbackQueueSize: number
  logCount: number
}

export interface NodeAgentLog {
  timestamp: string
  level: NodeAgentLogLevel
  message: string
  data?: Record<string, unknown>
}

export interface NodeAgentFeedback {
  id: string
  createdAt: string
  content: string
  applied: boolean
}

function sessionHeaders(): Headers {
  return useRuntimeStore().getHeaders()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} 응답 형식이 올바르지 않습니다.`)
  return value
}

function requiredString(record: Record<string, unknown>, key: string, label: string): string {
  const value = record[key]
  if (typeof value !== 'string' || !value) throw new Error(`${label} 응답에 ${key} 필드가 없습니다.`)
  return value
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' && value ? value : undefined
}

function requiredNumber(record: Record<string, unknown>, key: string, label: string): number {
  const value = record[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} 응답의 ${key} 필드가 숫자가 아닙니다.`)
  }
  return value
}

function requiredBoolean(record: Record<string, unknown>, key: string, label: string): boolean {
  const value = record[key]
  if (typeof value !== 'boolean') throw new Error(`${label} 응답의 ${key} 필드가 불리언이 아닙니다.`)
  return value
}

export function parseNodeAgentState(value: unknown): NodeAgentState {
  const record = requiredRecord(value, '노드 에이전트 상태')
  const status = record.status
  if (status !== 'idle' && status !== 'running' && status !== 'paused'
    && status !== 'stopped' && status !== 'failed' && status !== 'completed') {
    throw new Error('노드 에이전트 상태 응답의 status가 올바르지 않습니다.')
  }
  return {
    nodeTypeName: requiredString(record, 'node_type_name', '노드 에이전트 상태'),
    status,
    startedAt: optionalString(record, 'started_at'),
    lastRunAt: optionalString(record, 'last_run_at'),
    runCount: requiredNumber(record, 'run_count', '노드 에이전트 상태'),
    lastError: optionalString(record, 'last_error'),
    feedbackQueueSize: requiredNumber(record, 'feedback_queue_size', '노드 에이전트 상태'),
    logCount: requiredNumber(record, 'log_count', '노드 에이전트 상태'),
  }
}

export function parseNodeAgentLog(value: unknown): NodeAgentLog {
  const record = requiredRecord(value, '노드 에이전트 로그')
  const level = record.level
  if (level !== 'info' && level !== 'warn' && level !== 'error' && level !== 'debug') {
    throw new Error('노드 에이전트 로그 응답의 level이 올바르지 않습니다.')
  }
  return {
    timestamp: requiredString(record, 'timestamp', '노드 에이전트 로그'),
    level,
    message: requiredString(record, 'message', '노드 에이전트 로그'),
    data: isRecord(record.data) ? record.data : undefined,
  }
}

export function parseNodeAgentFeedback(value: unknown): NodeAgentFeedback {
  const record = requiredRecord(value, '노드 에이전트 피드백')
  return {
    id: requiredString(record, 'id', '노드 에이전트 피드백'),
    createdAt: requiredString(record, 'created_at', '노드 에이전트 피드백'),
    content: requiredString(record, 'content', '노드 에이전트 피드백'),
    applied: requiredBoolean(record, 'applied', '노드 에이전트 피드백'),
  }
}

async function requestJson(url: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...sessionHeaders(),
      ...init.headers,
    },
  })
  if (!response.ok) await handleHttpError(response)
  return response.json()
}

function parseActionStatus(value: unknown, expectedNodeType: string): NodeAgentStatus {
  const record = requiredRecord(value, '노드 에이전트 제어')
  const nodeType = requiredString(record, 'node_type', '노드 에이전트 제어')
  if (nodeType !== expectedNodeType) throw new Error('노드 에이전트 제어 응답의 node_type이 요청과 다릅니다.')
  return parseNodeAgentState({
    node_type_name: nodeType,
    status: record.status,
    run_count: 0,
    feedback_queue_size: 0,
    log_count: 0,
  }).status
}

export const nodeAgentSchedulerApi = {
  async listAgents(): Promise<NodeAgentState[]> {
    const value = await requestJson(`${NODE_AGENT_SCHEDULER_URL}/agents`)
    if (!Array.isArray(value)) throw new Error('노드 에이전트 목록 응답이 배열이 아닙니다.')
    return value.map(parseNodeAgentState)
  },

  async getAgentState(nodeType: string): Promise<NodeAgentState> {
    return parseNodeAgentState(await requestJson(
      `${NODE_AGENT_SCHEDULER_URL}/agents/${encodeURIComponent(nodeType)}`,
    ))
  },

  async triggerRun(nodeType: string): Promise<NodeAgentStatus> {
    return parseActionStatus(await requestJson(
      `${NODE_AGENT_SCHEDULER_URL}/agents/${encodeURIComponent(nodeType)}/run`,
      { method: 'POST' },
    ), nodeType)
  },

  async control(nodeType: string, action: 'stop' | 'pause' | 'resume'): Promise<NodeAgentStatus> {
    const value = await postJson<unknown>(
      `${NODE_AGENT_SCHEDULER_URL}/agents/${encodeURIComponent(nodeType)}/control`,
      { action },
      sessionHeaders(),
    )
    return parseActionStatus(value, nodeType)
  },

  async submitFeedback(nodeType: string, content: string): Promise<NodeAgentFeedback> {
    const value = await postJson<unknown>(
      `${NODE_AGENT_SCHEDULER_URL}/agents/${encodeURIComponent(nodeType)}/feedback`,
      { content },
      sessionHeaders(),
    )
    return parseNodeAgentFeedback(value)
  },

  async getLogs(nodeType: string, limit = 50): Promise<NodeAgentLog[]> {
    if (!Number.isInteger(limit) || limit < 1) throw new Error('로그 조회 개수는 1 이상의 정수여야 합니다.')
    const value = await requestJson(
      `${NODE_AGENT_SCHEDULER_URL}/agents/${encodeURIComponent(nodeType)}/logs?limit=${limit}`,
    )
    if (!Array.isArray(value)) throw new Error('노드 에이전트 로그 응답이 배열이 아닙니다.')
    return value.map(parseNodeAgentLog)
  },

  async streamLogs(
    nodeType: string,
    onLog: (log: NodeAgentLog) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    await streamSseFetch<NodeAgentLog>(
      `${NODE_AGENT_SCHEDULER_URL}/agents/${encodeURIComponent(nodeType)}/logs/stream`,
      sessionHeaders(),
      event => onLog(event.data),
      value => parseNodeAgentLog(value),
      signal,
    )
  },
}
