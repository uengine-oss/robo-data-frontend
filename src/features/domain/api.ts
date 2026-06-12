/** domain api — Agents.md 에디터·노드 비주얼이펙트·에이전트 스케줄러·ProcessGPT·Behavior. 공유 http 코어 사용. */
import { ONTOLOGY_BASE_URL, API_GATEWAY_URL, postJson, handleHttpError } from '@/shared/services/http'

// ============================================================================
// Agents.md Editor API (Node-type Agent CRUD + Context)
// ============================================================================

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

export const agentsMdApi = {
  /**
   * Get context metadata for Agents.md editor (fields, methods, connected objects)
   */
  async getContext(objectTypeName: string): Promise<AgentContextResponse> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/object-types/${encodeURIComponent(objectTypeName)}/agent-context`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },

  /**
   * Get existing Agents.md content (404 if not created yet)
   */
  async getContent(objectTypeName: string): Promise<AgentsMdResponse | null> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/object-types/${encodeURIComponent(objectTypeName)}/agents-md`)
    if (response.status === 404) {
      return null
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },

  /**
   * Create Agents.md from template (auto-populated with context)
   */
  async create(objectTypeName: string, customContent?: string): Promise<AgentsMdResponse> {
    const body = customContent ? { customContent } : {}
    const response = await fetch(`${ONTOLOGY_BASE_URL}/object-types/${encodeURIComponent(objectTypeName)}/agents-md`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },

  /**
   * Save/update Agents.md content
   */
  async save(objectTypeName: string, content: string, enabled?: boolean): Promise<{ success: boolean }> {
    const body: Record<string, any> = { content }
    if (enabled !== undefined) body.enabled = enabled
    const response = await fetch(`${ONTOLOGY_BASE_URL}/object-types/${encodeURIComponent(objectTypeName)}/agents-md`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },

  /**
   * Delete Agents.md content and disable agent
   */
  async remove(objectTypeName: string): Promise<{ success: boolean }> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/object-types/${encodeURIComponent(objectTypeName)}/agents-md`, {
      method: 'DELETE'
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },

  /**
   * LLM을 사용하여 사용자 프롬프트에 따라 Agents.md 재작성
   */
  async rewrite(objectTypeName: string, currentContent: string, prompt: string): Promise<{ rewrittenContent: string }> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/object-types/${encodeURIComponent(objectTypeName)}/agents-md/rewrite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentContent, prompt })
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(text || `HTTP ${response.status}`)
    }
    return response.json()
  }
}

// ============================================================================
// Node Visual Effects API (agent-driven visualization)
// ============================================================================

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
  async setEffect(nodeTypeName: string, effect: string, value?: any): Promise<any> {
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
  async clear(nodeTypeName: string): Promise<any> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/object-types/${encodeURIComponent(nodeTypeName)}/visual-effects`, {
      method: 'DELETE'
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json()
  }
}

// ============================================================================
// Node-Local Agent Scheduler API (live monitoring)
// ============================================================================

const NODE_AGENT_SCHEDULER_URL = `${API_GATEWAY_URL}/node-agent-scheduler`

export interface NodeAgentState {
  node_type_name: string
  status: string
  started_at: string | null
  last_run_at: string | null
  run_count: number
  last_error: string | null
  feedback_queue_size: number
  log_count: number
}

export interface NodeAgentLog {
  timestamp: string
  level: string
  message: string
  data?: Record<string, any>
}

export const nodeAgentSchedulerApi = {
  /**
   * List all discovered agent states
   */
  async listAgents(): Promise<NodeAgentState[]> {
    const response = await fetch(`${NODE_AGENT_SCHEDULER_URL}/agents`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },

  /**
   * Get state for a specific agent
   */
  async getAgentState(nodeType: string): Promise<NodeAgentState> {
    const response = await fetch(`${NODE_AGENT_SCHEDULER_URL}/agents/${encodeURIComponent(nodeType)}`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },

  /**
   * Manually trigger an agent run
   */
  async triggerRun(nodeType: string): Promise<{ status: string }> {
    const response = await fetch(`${NODE_AGENT_SCHEDULER_URL}/agents/${encodeURIComponent(nodeType)}/run`, {
      method: 'POST'
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },

  /**
   * Control agent: stop/pause/resume
   */
  async control(nodeType: string, action: 'stop' | 'pause' | 'resume'): Promise<{ status: string }> {
    const response = await fetch(`${NODE_AGENT_SCHEDULER_URL}/agents/${encodeURIComponent(nodeType)}/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },

  /**
   * Submit feedback for next cycle
   */
  async submitFeedback(nodeType: string, content: string): Promise<any> {
    const response = await fetch(`${NODE_AGENT_SCHEDULER_URL}/agents/${encodeURIComponent(nodeType)}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },

  /**
   * Get recent logs
   */
  async getLogs(nodeType: string, limit: number = 50): Promise<NodeAgentLog[]> {
    const response = await fetch(`${NODE_AGENT_SCHEDULER_URL}/agents/${encodeURIComponent(nodeType)}/logs?limit=${limit}`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },

  /**
   * Create SSE log stream connection
   */
  createLogStream(nodeType: string): EventSource {
    return new EventSource(`${NODE_AGENT_SCHEDULER_URL}/agents/${encodeURIComponent(nodeType)}/logs/stream`)
  }
}

// ============================================================================
// ProcessGPT Process List API (via agent-scheduler)
// ============================================================================

const AGENT_SCHEDULER_URL = `${API_GATEWAY_URL}/agent-scheduler`

export interface ProcessGPTProcess {
  id: string
  name: string
  description?: string
}

export const processGptApi = {
  /**
   * ProcessGPT 프로세스 정의 목록 조회
   */
  async getProcessList(): Promise<ProcessGPTProcess[]> {
    const response = await fetch(`${AGENT_SCHEDULER_URL}/profiles/processgpt/processes`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const data = await response.json()
    // The endpoint returns { success, processes } or { success, response (from ReAct agent) }
    if (data.processes && Array.isArray(data.processes)) {
      return data.processes
    }
    // Fallback: parse from ReAct agent response
    return []
  }
}

// ============================================================================
// Object-Type Behavior API — /ontology/object-types/{name}/behaviors/*
// ============================================================================

export const behaviorApi = {
  /**
   * Behavior 실행. body 는 호출처별 페이로드를 그대로 전달한다
   * (백엔드 계약 보존 — instanceData / instance_data 등 키 차이는 호출처가 책임).
   */
  async execute(objectTypeName: string, behaviorName: string, body: unknown): Promise<any> {
    return postJson(
      `${ONTOLOGY_BASE_URL}/object-types/${encodeURIComponent(objectTypeName)}/behaviors/${encodeURIComponent(behaviorName)}/execute`,
      body,
      {}
    )
  },

  /** Behavior 생성 */
  async create(objectTypeName: string, behavior: unknown): Promise<any> {
    return postJson(`${ONTOLOGY_BASE_URL}/object-types/${encodeURIComponent(objectTypeName)}/behaviors`, behavior, {})
  },

  /** Behavior 수정 */
  async update(objectTypeName: string, behaviorName: string, behavior: unknown): Promise<any> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/object-types/${encodeURIComponent(objectTypeName)}/behaviors/${encodeURIComponent(behaviorName)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(behavior)
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json().catch(() => ({}))
  },

  /** Behavior 삭제 */
  async remove(objectTypeName: string, behaviorName: string): Promise<void> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/object-types/${encodeURIComponent(objectTypeName)}/behaviors/${encodeURIComponent(behaviorName)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
  },

  /** Behavior 용 코드 생성 (LLM) — /ontology/generate-code */
  async generateCode(prompt: string, language: string = 'python'): Promise<{ code?: string; result?: string } & Record<string, any>> {
    return postJson(`${ONTOLOGY_BASE_URL}/generate-code`, { prompt, language }, {})
  },

  /** Behavior 실행 결과를 테이블로 저장 — /ontology/save-result-to-table */
  async saveResultToTable(body: unknown): Promise<{ rows_inserted?: number } & Record<string, any>> {
    return postJson(`${ONTOLOGY_BASE_URL}/save-result-to-table`, body, {})
  }
}

// ============================================================================
// Agent-Scheduler API — /agent-scheduler/* (그래프 pipelines 신 시스템 + profiles 레거시 폴백)
// ============================================================================

export const agentSchedulerApi = {
  // --- pipelines (그래프 기반) ---
  async listPipelines(): Promise<any[]> {
    const response = await fetch(`${AGENT_SCHEDULER_URL}/pipelines`)
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  async createPipeline(body: unknown): Promise<any> {
    return postJson(`${AGENT_SCHEDULER_URL}/pipelines`, body, {})
  },

  async deletePipeline(id: string): Promise<void> {
    const response = await fetch(`${AGENT_SCHEDULER_URL}/pipelines/${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!response.ok) {
      await handleHttpError(response)
    }
  },

  async togglePipeline(id: string): Promise<void> {
    const response = await fetch(`${AGENT_SCHEDULER_URL}/pipelines/${encodeURIComponent(id)}/toggle`, { method: 'POST' })
    if (!response.ok) {
      await handleHttpError(response)
    }
  },

  async savePositions(
    pipelineId: string,
    positions: Array<{ step_id: string; position_x: number; position_y: number }>
  ): Promise<void> {
    const response = await fetch(`${AGENT_SCHEDULER_URL}/pipelines/${encodeURIComponent(pipelineId)}/positions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ positions })
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
  },

  // --- profiles (레거시 폴백) ---
  async listProfiles(): Promise<any[]> {
    const response = await fetch(`${AGENT_SCHEDULER_URL}/profiles`)
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  async deleteProfile(id: string): Promise<void> {
    const response = await fetch(`${AGENT_SCHEDULER_URL}/profiles/${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!response.ok) {
      await handleHttpError(response)
    }
  },

  async toggleProfile(id: string): Promise<void> {
    const response = await fetch(`${AGENT_SCHEDULER_URL}/profiles/${encodeURIComponent(id)}/toggle`, { method: 'POST' })
    if (!response.ok) {
      await handleHttpError(response)
    }
  },

  async testProfile(profileId: string): Promise<any> {
    const response = await fetch(`${AGENT_SCHEDULER_URL}/profiles/${encodeURIComponent(profileId)}/test`, { method: 'POST' })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  // --- ProcessGPT 실행 (SSE 스트림, POST — EventSource 미지원) ---
  async executeProcessGptStream(
    body: { process_name: string; process_id: string; form_values: Record<string, any>; dry_run: boolean },
    onEvent: (event: string, data: any) => void
  ): Promise<void> {
    const response = await fetch(`${AGENT_SCHEDULER_URL}/profiles/processgpt/execute-stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!response.ok) {
      let errorDetail = `HTTP ${response.status}`
      try {
        const errorBody = await response.json()
        if (response.status === 500 && errorBody?.path?.includes('agent-scheduler')) {
          errorDetail = 'agent-scheduler 서비스가 실행되지 않고 있습니다 (포트 8089). 서비스를 먼저 시작해주세요.'
        } else if (errorBody?.error) {
          errorDetail = `HTTP ${response.status}: ${errorBody.error}`
        }
      } catch { /* ignore parse error */ }
      throw new Error(errorDetail)
    }
    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response body')
    const decoder = new TextDecoder()
    let buffer = ''
    let currentEvent = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.substring(7)
        } else if (line.startsWith('data: ')) {
          const currentData = line.substring(6)
          if (currentEvent && currentData) {
            try {
              onEvent(currentEvent, JSON.parse(currentData))
            } catch (e) {
              console.warn('SSE 파싱 오류:', e)
            }
            currentEvent = ''
          }
        }
      }
    }
  }
}
