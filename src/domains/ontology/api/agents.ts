/** Ontology agent, behavior, and visual-effect APIs. */
import { postJson, handleHttpError } from '@/shared/services/http'
import { ONTOLOGY_BASE_URL } from './baseUrl'
import { useRuntimeStore } from '@/shared/stores/runtime'
import {
  parseBehaviorExecutionResult,
  type BehaviorConfig,
  type BehaviorExecutionResult,
  type BehaviorType,
  type OntologyBehavior,
} from '../model/behavior.ts'

const sessionHeaders = () => useRuntimeStore().getHeaders()

function fetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(sessionHeaders())
  new Headers(init.headers).forEach((value, key) => headers.set(key, value))
  return globalThis.fetch(input, { ...init, headers })
}

export interface AgentContextField {
  name: string
  type: string
  description: string
}

export interface AgentContextMethod {
  name: string
  behaviorType: string
  description: string
}

export interface AgentContextObject {
  name: string
  type: string
  relationship: string
}

export interface AgentContextResponse {
  nodeTypeName: string
  description: string
  dataSource: string
  fields: AgentContextField[]
  methods: AgentContextMethod[]
  connectedObjects: AgentContextObject[]
}

export interface AgentsMdResponse {
  nodeTypeName: string
  content: string
  enabled: boolean
}

export interface AgentsMdMutationResponse {
  success: true
}

export interface AgentsMdRewriteResponse {
  rewrittenContent: string
}

export interface BehaviorMutationResponse {
  success: true
  message: string
  behavior?: OntologyBehavior
}

export interface BehaviorCodeGenerationResponse {
  success: true
  code: string
  language: string
}

function requiredRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} 응답이 객체가 아닙니다.`)
  }
  return value as Record<string, unknown>
}

function requiredString(
  value: Record<string, unknown>,
  key: string,
  label: string,
): string {
  const field = value[key]
  if (typeof field !== 'string') {
    throw new Error(`${label} 응답의 ${key}가 문자열이 아닙니다.`)
  }
  return field
}

function optionalString(value: Record<string, unknown>, key: string): string {
  const field = value[key]
  return typeof field === 'string' ? field : ''
}

export function parseAgentContextResponse(value: unknown): AgentContextResponse {
  const response = requiredRecord(value, 'Agents.md context')
  const fields = response.fields
  const methods = response.methods
  const connectedObjects = response.connectedObjects
  if (!Array.isArray(fields) || !Array.isArray(methods) || !Array.isArray(connectedObjects)) {
    throw new Error('Agents.md context 응답의 fields, methods, connectedObjects가 배열이 아닙니다.')
  }

  return {
    nodeTypeName: requiredString(response, 'nodeTypeName', 'Agents.md context'),
    description: optionalString(response, 'description'),
    dataSource: optionalString(response, 'dataSource'),
    fields: fields.map((entry, index) => {
      const field = requiredRecord(entry, `Agents.md context fields[${index}]`)
      return {
        name: requiredString(field, 'name', `Agents.md context fields[${index}]`),
        type: requiredString(field, 'type', `Agents.md context fields[${index}]`),
        description: optionalString(field, 'description'),
      }
    }),
    methods: methods.map((entry, index) => {
      const method = requiredRecord(entry, `Agents.md context methods[${index}]`)
      return {
        name: requiredString(method, 'name', `Agents.md context methods[${index}]`),
        behaviorType: requiredString(method, 'behaviorType', `Agents.md context methods[${index}]`),
        description: optionalString(method, 'description'),
      }
    }),
    connectedObjects: connectedObjects.map((entry, index) => {
      const object = requiredRecord(entry, `Agents.md context connectedObjects[${index}]`)
      return {
        name: requiredString(object, 'name', `Agents.md context connectedObjects[${index}]`),
        type: optionalString(object, 'type'),
        relationship: requiredString(
          object,
          'relationship',
          `Agents.md context connectedObjects[${index}]`,
        ),
      }
    }),
  }
}

export function parseAgentsMdResponse(value: unknown): AgentsMdResponse {
  const response = requiredRecord(value, 'Agents.md')
  if (typeof response.enabled !== 'boolean') {
    throw new Error('Agents.md 응답의 enabled가 boolean이 아닙니다.')
  }
  return {
    nodeTypeName: requiredString(response, 'nodeTypeName', 'Agents.md'),
    content: requiredString(response, 'content', 'Agents.md'),
    enabled: response.enabled,
  }
}

export function parseAgentsMdMutationResponse(value: unknown): AgentsMdMutationResponse {
  const response = requiredRecord(value, 'Agents.md mutation')
  if (response.success !== true) {
    throw new Error('Agents.md mutation 응답의 success가 true가 아닙니다.')
  }
  return { success: true }
}

export function parseAgentsMdRewriteResponse(value: unknown): AgentsMdRewriteResponse {
  const response = requiredRecord(value, 'Agents.md rewrite')
  return {
    rewrittenContent: requiredString(response, 'rewrittenContent', 'Agents.md rewrite'),
  }
}

function parseBehaviorType(value: unknown, label: string): BehaviorType {
  if (
    value !== 'rest_api'
    && value !== 'javascript'
    && value !== 'python'
    && value !== 'dmn'
    && value !== 'processGPT'
  ) {
    throw new Error(`${label} 응답의 behaviorType이 지원되는 값이 아닙니다.`)
  }
  return value
}

function strictOptionalString(
  value: Record<string, unknown>,
  key: string,
  label: string,
): string | undefined {
  const field = value[key]
  if (field === undefined) return undefined
  if (typeof field !== 'string') {
    throw new Error(`${label} 응답의 ${key}가 문자열이 아닙니다.`)
  }
  return field
}

function requiredConfigString(
  config: Record<string, unknown>,
  key: string,
  label: string,
): string {
  const value = requiredString(config, key, label).trim()
  if (!value) {
    throw new Error(`${label} 응답의 ${key}가 비어 있습니다.`)
  }
  return value
}

function parseBehaviorConfig(
  value: unknown,
  behaviorType: BehaviorType,
  label: string,
): BehaviorConfig {
  const config = requiredRecord(value, label)
  const parameters = config.parameters
  if (
    parameters !== undefined
    && (
      typeof parameters !== 'object'
      || parameters === null
      || Array.isArray(parameters)
    )
  ) {
    throw new Error(`${label} 응답의 parameters가 객체가 아닙니다.`)
  }

  const parsed: BehaviorConfig = {
    ...(parameters ? { parameters: { ...parameters } } : {}),
  }
  if (behaviorType === 'rest_api') {
    parsed.endpoint = requiredConfigString(config, 'endpoint', label)
    parsed.method = requiredConfigString(config, 'method', label)
  } else if (behaviorType === 'python' || behaviorType === 'javascript') {
    parsed.code = requiredConfigString(config, 'code', label)
  } else if (behaviorType === 'dmn') {
    parsed.dmnXml = requiredConfigString(config, 'dmnXml', label)
  } else {
    parsed.processId = requiredConfigString(config, 'processId', label)
    parsed.processName = requiredConfigString(config, 'processName', label)
    parsed.triggerCondition = strictOptionalString(
      config,
      'triggerCondition',
      label,
    )
  }
  return parsed
}

function parseOntologyBehavior(value: unknown, label: string): OntologyBehavior {
  const behavior = requiredRecord(value, label)
  const behaviorType = parseBehaviorType(behavior.behaviorType, label)
  const inputFields = behavior.inputFields
  if (inputFields !== undefined && !Array.isArray(inputFields)) {
    throw new Error(`${label} 응답의 inputFields가 배열이 아닙니다.`)
  }
  const parsedInputFields = inputFields?.map((field, index) => {
    if (typeof field !== 'string' || !field.trim()) {
      throw new Error(`${label} 응답의 inputFields[${index}]가 유효한 문자열이 아닙니다.`)
    }
    return field
  })
  return {
    name: requiredString(behavior, 'name', label),
    description: strictOptionalString(behavior, 'description', label) || undefined,
    behaviorType,
    config: parseBehaviorConfig(behavior.config, behaviorType, `${label}.config`),
    inputFields: parsedInputFields?.length ? parsedInputFields : undefined,
    outputField: strictOptionalString(behavior, 'outputField', label) || undefined,
  }
}

export function parseBehaviorMutationResponse(
  value: unknown,
  label: string,
  expectedBehavior?: OntologyBehavior,
): BehaviorMutationResponse {
  const response = requiredRecord(value, label)
  if (response.success !== true) {
    throw new Error(`${label} 응답의 success가 true가 아닙니다.`)
  }
  const message = requiredString(response, 'message', label)
  if (expectedBehavior && response.behavior === undefined) {
    throw new Error(`${label} 응답의 behavior가 없습니다.`)
  }
  const behavior = response.behavior === undefined
    ? undefined
    : parseOntologyBehavior(response.behavior, `${label}.behavior`)
  if (
    behavior
    && expectedBehavior
    && (
      behavior.name !== expectedBehavior.name
      || behavior.behaviorType !== expectedBehavior.behaviorType
    )
  ) {
    throw new Error(`${label} 응답의 Behavior identity가 요청과 일치하지 않습니다.`)
  }
  return {
    success: true,
    message,
    ...(behavior ? { behavior } : {}),
  }
}

export function parseBehaviorCodeGenerationResponse(
  value: unknown,
  expectedLanguage: string,
): BehaviorCodeGenerationResponse {
  const response = requiredRecord(value, 'Behavior 코드 생성')
  if (response.success !== true) {
    throw new Error('Behavior 코드 생성 응답의 success가 true가 아닙니다.')
  }
  const language = requiredString(response, 'language', 'Behavior 코드 생성')
  if (language !== expectedLanguage) {
    throw new Error('Behavior 코드 생성 응답의 language가 요청과 일치하지 않습니다.')
  }
  const code = requiredString(response, 'code', 'Behavior 코드 생성').trim()
  if (!code) {
    throw new Error('Behavior 코드 생성 응답의 code가 비어 있습니다.')
  }
  return { success: true, code, language }
}

export const agentsMdApi = {
  /**
   * Get context metadata for Agents.md editor (fields, methods, connected objects)
   */
  async getContext(objectTypeName: string, signal?: AbortSignal): Promise<AgentContextResponse> {
    const response = await fetch(
      `${ONTOLOGY_BASE_URL}/object-types/${encodeURIComponent(objectTypeName)}/agent-context`,
      { signal },
    )
    if (!response.ok) {
      await handleHttpError(response)
    }
    return parseAgentContextResponse(await response.json() as unknown)
  },

  /**
   * Get existing Agents.md content (404 if not created yet)
   */
  async getContent(objectTypeName: string, signal?: AbortSignal): Promise<AgentsMdResponse | null> {
    const response = await fetch(
      `${ONTOLOGY_BASE_URL}/object-types/${encodeURIComponent(objectTypeName)}/agents-md`,
      { signal },
    )
    if (response.status === 404) {
      return null
    }
    if (!response.ok) {
      await handleHttpError(response)
    }
    return parseAgentsMdResponse(await response.json() as unknown)
  },

  /**
   * Create Agents.md from template (auto-populated with context)
   */
  async create(
    objectTypeName: string,
    customContent?: string,
    signal?: AbortSignal,
  ): Promise<AgentsMdResponse> {
    const body = customContent ? { customContent } : {}
    const response = await fetch(`${ONTOLOGY_BASE_URL}/object-types/${encodeURIComponent(objectTypeName)}/agents-md`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return parseAgentsMdResponse(await response.json() as unknown)
  },

  /**
   * Save/update Agents.md content
   */
  async save(
    objectTypeName: string,
    content: string,
    enabled?: boolean,
    signal?: AbortSignal,
  ): Promise<AgentsMdMutationResponse> {
    const body: Record<string, unknown> = { content }
    if (enabled !== undefined) body.enabled = enabled
    const response = await fetch(`${ONTOLOGY_BASE_URL}/object-types/${encodeURIComponent(objectTypeName)}/agents-md`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return parseAgentsMdMutationResponse(await response.json() as unknown)
  },

  /**
   * Delete Agents.md content and disable agent
   */
  async remove(objectTypeName: string, signal?: AbortSignal): Promise<AgentsMdMutationResponse> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/object-types/${encodeURIComponent(objectTypeName)}/agents-md`, {
      method: 'DELETE',
      signal,
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return parseAgentsMdMutationResponse(await response.json() as unknown)
  },

  /**
   * LLM을 사용하여 사용자 프롬프트에 따라 Agents.md 재작성
   */
  async rewrite(
    objectTypeName: string,
    currentContent: string,
    prompt: string,
    signal?: AbortSignal,
  ): Promise<AgentsMdRewriteResponse> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/object-types/${encodeURIComponent(objectTypeName)}/agents-md/rewrite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentContent, prompt }),
      signal,
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(text || `HTTP ${response.status}`)
    }
    return parseAgentsMdRewriteResponse(await response.json() as unknown)
  }
}

export interface NodeVisualEffects {
  badge?: string
  badgeColor?: string
  color?: string
  alert?: boolean
  tooltip?: string
  opacity?: number
}

export const nodeVisualEffectsApi = {
  /**
   * Get all active visual effects (for polling)
   */
  async getAll(): Promise<{ effects: Record<string, NodeVisualEffects> }> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/visual-effects`)
    if (!response.ok) return { effects: {} }
    return response.json()
  },

  /**
   * Set a visual effect on a node
   */
  async setEffect(nodeTypeName: string, effect: string, value?: unknown): Promise<unknown> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/object-types/${encodeURIComponent(nodeTypeName)}/visual-effects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ effect, value })
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json()
  },

  /**
   * Clear all effects for a node
   */
  async clear(nodeTypeName: string): Promise<unknown> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/object-types/${encodeURIComponent(nodeTypeName)}/visual-effects`, {
      method: 'DELETE'
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json()
  }
}

export const behaviorApi = {
  async testExternalEndpoint(
    endpoint: string,
    method: string,
    body: unknown,
    signal?: AbortSignal,
  ): Promise<unknown> {
    // This is an operator-supplied external URL. Never forward ROBO session,
    // LLM, or Neo4j headers outside the configured service boundary.
    const response = await globalThis.fetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method.toUpperCase() === 'GET' ? undefined : JSON.stringify(body),
      signal,
    })
    const responseText = await response.text()
    let data: unknown = responseText
    if (responseText) {
      try {
        data = JSON.parse(responseText)
      } catch {
        // Non-JSON response bodies remain visible to the caller.
      }
    }
    if (!response.ok) {
      const detail = data && typeof data === 'object' && 'detail' in data
        ? String(data.detail)
        : response.statusText
      throw new Error(`테스트 실패: ${detail || `HTTP ${response.status}`}`)
    }
    return data
  },

  /**
   * Behavior 실행. body 는 호출처별 페이로드를 그대로 전달한다
   * (백엔드 계약 보존 — instanceData / instance_data 등 키 차이는 호출처가 책임).
   */
  async execute(
    objectTypeName: string,
    behaviorName: string,
    body: unknown,
  ): Promise<BehaviorExecutionResult> {
    const result = await postJson<unknown>(
      `${ONTOLOGY_BASE_URL}/object-types/${encodeURIComponent(objectTypeName)}/behaviors/${encodeURIComponent(behaviorName)}/execute`,
      body,
      sessionHeaders()
    )
    return parseBehaviorExecutionResult(result)
  },

  /** Behavior 생성 */
  async create(
    objectTypeName: string,
    behavior: OntologyBehavior,
    signal?: AbortSignal,
  ): Promise<BehaviorMutationResponse> {
    const response = await fetch(
      `${ONTOLOGY_BASE_URL}/object-types/${encodeURIComponent(objectTypeName)}/behaviors`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(behavior),
        signal,
      },
    )
    if (!response.ok) {
      await handleHttpError(response)
    }
    return parseBehaviorMutationResponse(
      await response.json() as unknown,
      'Behavior 생성',
      behavior,
    )
  },

  /** Behavior 수정 */
  async update(
    objectTypeName: string,
    behaviorName: string,
    behavior: OntologyBehavior,
    signal?: AbortSignal,
  ): Promise<BehaviorMutationResponse> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/object-types/${encodeURIComponent(objectTypeName)}/behaviors/${encodeURIComponent(behaviorName)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(behavior),
      signal,
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return parseBehaviorMutationResponse(
      await response.json() as unknown,
      'Behavior 수정',
    )
  },

  /** Behavior 삭제 */
  async remove(
    objectTypeName: string,
    behaviorName: string,
    signal?: AbortSignal,
  ): Promise<BehaviorMutationResponse> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/object-types/${encodeURIComponent(objectTypeName)}/behaviors/${encodeURIComponent(behaviorName)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      signal,
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return parseBehaviorMutationResponse(
      await response.json() as unknown,
      'Behavior 삭제',
    )
  },

  /** Behavior 용 코드 생성 (LLM) — /ontology/generate-code */
  async generateCode(
    prompt: string,
    language: string = 'python',
    signal?: AbortSignal,
  ): Promise<BehaviorCodeGenerationResponse> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/generate-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, language }),
      signal,
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return parseBehaviorCodeGenerationResponse(
      await response.json() as unknown,
      language,
    )
  },

  /** Behavior 실행 결과를 테이블로 저장 — /ontology/save-result-to-table */
  async saveResultToTable(body: unknown): Promise<{ rows_inserted?: number } & Record<string, unknown>> {
    return postJson(`${ONTOLOGY_BASE_URL}/save-result-to-table`, body, sessionHeaders())
  }
}
