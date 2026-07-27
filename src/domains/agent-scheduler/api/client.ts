/** Runtime-validated API client for the scheduler-owned watch-agent profile model. */
import { useRuntimeStore } from '@/shared/stores/runtime'
import {
  API_GATEWAY_URL,
  handleHttpError,
  postJson,
  type Headers,
} from '@/shared/services/http'

const AGENT_SCHEDULER_URL = `${API_GATEWAY_URL}/agent-scheduler`

export interface ProcessGptProcess {
  id: string
  name: string
  description?: string
}

export interface AgentProfile {
  id: string
  name: string
  description: string
  naturalLanguageQuery: string
  generatedSql: string
  checkIntervalMinutes: number
  conditionExpression: string
  processId: string
  processName: string
  processParams?: Record<string, string>
  isActive: boolean
  createdAt: string
  updatedAt?: string
  lastExecutedAt?: string
  executionCount: number
  lastResult?: 'success' | 'triggered' | 'error'
  dataSourceType: 'sql' | 'whatif_scenario'
  whatifScenarioId?: string
  whatifScenarioName?: string
  whatifSchemaId?: string
  whatifOutputField?: string
}

export interface CreateAgentProfileRequest {
  name: string
  description: string
  natural_language_query: string
  generated_sql: string
  check_interval_minutes: number
  condition_expression: string
  process_id: string
  process_name: string
  process_params?: Record<string, string>
  data_source_type: 'sql' | 'whatif_scenario'
  whatif_scenario_id?: string
  whatif_scenario_name?: string
  whatif_schema_id?: string
  whatif_output_field?: string
}

export interface AgentTestResult {
  success: boolean
  rowCount: number
  executionTimeMs: number
  sampleData: Array<Record<string, unknown>>
  columns: string[]
  conditionMet: boolean
  error?: string
}

export interface AgentDebugStep {
  step: string
  status: 'success' | 'error' | 'skipped' | 'running'
  title: string
  description: string
  startedAt: string
  completedAt?: string
  durationMs?: number
  details?: Record<string, unknown>
}

export interface AgentDebugResult {
  profileId: string
  profileName: string
  startedAt: string
  completedAt: string
  totalDurationMs: number
  steps: AgentDebugStep[]
  finalResult: 'success' | 'triggered' | 'error'
  conditionMet: boolean
  wouldTriggerAction: boolean
  sqlResult?: Record<string, unknown>
  actionPreview?: Record<string, unknown>
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
  if (typeof value !== 'string' || !value) {
    throw new Error(`${label} 응답에 ${key} 필드가 없습니다.`)
  }
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
  if (typeof value !== 'boolean') {
    throw new Error(`${label} 응답의 ${key} 필드가 불리언이 아닙니다.`)
  }
  return value
}

function parseStringMap(value: unknown, label: string): Record<string, string> | undefined {
  if (value === null || value === undefined) return undefined
  const record = requiredRecord(value, label)
  const entries = Object.entries(record)
  if (entries.some(([, entry]) => typeof entry !== 'string')) {
    throw new Error(`${label} 응답 값은 모두 문자열이어야 합니다.`)
  }
  return Object.fromEntries(entries) as Record<string, string>
}

function parseRecordList(value: unknown, label: string): Array<Record<string, unknown>> {
  if (value === null || value === undefined) return []
  if (!Array.isArray(value) || value.some(item => !isRecord(item))) {
    throw new Error(`${label} 응답 형식이 올바르지 않습니다.`)
  }
  return value as Array<Record<string, unknown>>
}

function parseStringList(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error(`${label} 응답 형식이 올바르지 않습니다.`)
  }
  return value
}

export function parseAgentProfile(value: unknown): AgentProfile {
  const record = requiredRecord(value, '감시 에이전트 프로필')
  const dataSourceType = record.data_source_type
  if (dataSourceType !== 'sql' && dataSourceType !== 'whatif_scenario') {
    throw new Error('감시 에이전트 프로필의 data_source_type이 올바르지 않습니다.')
  }
  const lastResult = record.last_result
  if (lastResult !== null && lastResult !== undefined
    && lastResult !== 'success' && lastResult !== 'triggered' && lastResult !== 'error') {
    throw new Error('감시 에이전트 프로필의 last_result가 올바르지 않습니다.')
  }

  return {
    id: requiredString(record, 'id', '감시 에이전트 프로필'),
    name: requiredString(record, 'name', '감시 에이전트 프로필'),
    description: typeof record.description === 'string' ? record.description : '',
    naturalLanguageQuery: typeof record.natural_language_query === 'string' ? record.natural_language_query : '',
    generatedSql: typeof record.generated_sql === 'string' ? record.generated_sql : '',
    checkIntervalMinutes: requiredNumber(record, 'check_interval_minutes', '감시 에이전트 프로필'),
    conditionExpression: requiredString(record, 'condition_expression', '감시 에이전트 프로필'),
    processId: typeof record.process_id === 'string' ? record.process_id : '',
    processName: typeof record.process_name === 'string' ? record.process_name : '',
    processParams: parseStringMap(record.process_params, '감시 에이전트 process_params'),
    isActive: requiredBoolean(record, 'is_active', '감시 에이전트 프로필'),
    createdAt: requiredString(record, 'created_at', '감시 에이전트 프로필'),
    updatedAt: optionalString(record, 'updated_at'),
    lastExecutedAt: optionalString(record, 'last_executed_at'),
    executionCount: requiredNumber(record, 'execution_count', '감시 에이전트 프로필'),
    lastResult: lastResult ?? undefined,
    dataSourceType,
    whatifScenarioId: optionalString(record, 'whatif_scenario_id'),
    whatifScenarioName: optionalString(record, 'whatif_scenario_name'),
    whatifSchemaId: optionalString(record, 'whatif_schema_id'),
    whatifOutputField: optionalString(record, 'whatif_output_field'),
  }
}

export function parseAgentTestResult(value: unknown): AgentTestResult {
  const record = requiredRecord(value, '감시 에이전트 테스트')
  return {
    success: requiredBoolean(record, 'success', '감시 에이전트 테스트'),
    rowCount: requiredNumber(record, 'row_count', '감시 에이전트 테스트'),
    executionTimeMs: requiredNumber(record, 'execution_time_ms', '감시 에이전트 테스트'),
    sampleData: parseRecordList(record.sample_data, '감시 에이전트 sample_data'),
    columns: parseStringList(record.columns, '감시 에이전트 columns'),
    conditionMet: requiredBoolean(record, 'condition_met', '감시 에이전트 테스트'),
    error: optionalString(record, 'error'),
  }
}

function parseDebugStep(value: unknown): AgentDebugStep {
  const record = requiredRecord(value, '감시 에이전트 디버그 단계')
  const status = record.status
  if (status !== 'success' && status !== 'error' && status !== 'skipped' && status !== 'running') {
    throw new Error('감시 에이전트 디버그 단계의 status가 올바르지 않습니다.')
  }
  return {
    step: requiredString(record, 'step', '감시 에이전트 디버그 단계'),
    status,
    title: requiredString(record, 'title', '감시 에이전트 디버그 단계'),
    description: requiredString(record, 'description', '감시 에이전트 디버그 단계'),
    startedAt: requiredString(record, 'started_at', '감시 에이전트 디버그 단계'),
    completedAt: optionalString(record, 'completed_at'),
    durationMs: typeof record.duration_ms === 'number' && Number.isFinite(record.duration_ms)
      ? record.duration_ms
      : undefined,
    details: isRecord(record.details) ? record.details : undefined,
  }
}

export function parseAgentDebugResult(value: unknown): AgentDebugResult {
  const record = requiredRecord(value, '감시 에이전트 디버그')
  if (!Array.isArray(record.steps)) {
    throw new Error('감시 에이전트 디버그 응답의 steps가 배열이 아닙니다.')
  }
  const finalResult = record.final_result
  if (finalResult !== 'success' && finalResult !== 'triggered' && finalResult !== 'error') {
    throw new Error('감시 에이전트 디버그 응답의 final_result가 올바르지 않습니다.')
  }
  return {
    profileId: requiredString(record, 'profile_id', '감시 에이전트 디버그'),
    profileName: requiredString(record, 'profile_name', '감시 에이전트 디버그'),
    startedAt: requiredString(record, 'started_at', '감시 에이전트 디버그'),
    completedAt: requiredString(record, 'completed_at', '감시 에이전트 디버그'),
    totalDurationMs: requiredNumber(record, 'total_duration_ms', '감시 에이전트 디버그'),
    steps: record.steps.map(parseDebugStep),
    finalResult,
    conditionMet: requiredBoolean(record, 'condition_met', '감시 에이전트 디버그'),
    wouldTriggerAction: requiredBoolean(record, 'would_trigger_action', '감시 에이전트 디버그'),
    sqlResult: isRecord(record.sql_result) ? record.sql_result : undefined,
    actionPreview: isRecord(record.action_preview) ? record.action_preview : undefined,
  }
}

function parseProcess(value: unknown): ProcessGptProcess {
  const record = requiredRecord(value, 'ProcessGPT 프로세스')
  return {
    id: requiredString(record, 'id', 'ProcessGPT 프로세스'),
    name: requiredString(record, 'name', 'ProcessGPT 프로세스'),
    description: optionalString(record, 'description'),
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

export const agentSchedulerApi = {
  async listProfiles(): Promise<AgentProfile[]> {
    const value = await requestJson(`${AGENT_SCHEDULER_URL}/profiles`)
    if (!Array.isArray(value)) throw new Error('감시 에이전트 목록 응답이 배열이 아닙니다.')
    return value.map(parseAgentProfile)
  },

  async createProfile(body: CreateAgentProfileRequest): Promise<AgentProfile> {
    const value = await postJson<unknown>(`${AGENT_SCHEDULER_URL}/profiles`, body, sessionHeaders())
    return parseAgentProfile(value)
  },

  async deleteProfile(profileId: string): Promise<void> {
    await requestJson(`${AGENT_SCHEDULER_URL}/profiles/${encodeURIComponent(profileId)}`, {
      method: 'DELETE',
    })
  },

  async toggleProfile(profileId: string): Promise<boolean> {
    const value = requiredRecord(await requestJson(
      `${AGENT_SCHEDULER_URL}/profiles/${encodeURIComponent(profileId)}/toggle`,
      { method: 'POST' },
    ), '감시 에이전트 상태 변경')
    return requiredBoolean(value, 'is_active', '감시 에이전트 상태 변경')
  },

  async testProfile(profileId: string): Promise<AgentTestResult> {
    const value = await requestJson(
      `${AGENT_SCHEDULER_URL}/profiles/${encodeURIComponent(profileId)}/test`,
      { method: 'POST' },
    )
    return parseAgentTestResult(value)
  },

  async debugProfile(profileId: string): Promise<AgentDebugResult> {
    const value = await postJson<unknown>(
      `${AGENT_SCHEDULER_URL}/profiles/${encodeURIComponent(profileId)}/debug`,
      { simulate_action: false },
      sessionHeaders(),
    )
    return parseAgentDebugResult(value)
  },
}

export const processGptApi = {
  async listProcesses(signal?: AbortSignal): Promise<ProcessGptProcess[]> {
    const value = requiredRecord(
      await requestJson(
        `${AGENT_SCHEDULER_URL}/profiles/processgpt/processes`,
        { signal },
      ),
      'ProcessGPT 프로세스 목록',
    )
    if (value.success !== true) {
      throw new Error(optionalString(value, 'error') || 'ProcessGPT 프로세스 목록 조회에 실패했습니다.')
    }
    if (!Array.isArray(value.processes)) {
      throw new Error('ProcessGPT 프로세스 목록 응답의 processes가 배열이 아닙니다.')
    }
    return value.processes.map(parseProcess)
  },
}
