/** domain api — Agents.md 에디터·노드 비주얼이펙트·에이전트 스케줄러·ProcessGPT. 공유 http 코어 사용. */
import { ONTOLOGY_BASE_URL, API_GATEWAY_URL } from '@/shared/services/http'

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
