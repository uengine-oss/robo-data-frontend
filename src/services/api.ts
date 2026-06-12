/**
 * api.ts
 * API 서비스 모듈
 * 
 * 주요 기능:
 * - ANTLR Server API (파일 업로드, 파싱)
 * - ROBO Analyzer API (소스 분석, 데이터 삭제)
 * - NDJSON 스트림 처리
 */

import type { 
  BackendRequestMetadata, 
  FileUploadResponse, 
  ParseResponse,
  StreamEvent,
  AnalyzeEvent,
  Text2SqlTableInfo,
  Text2SqlColumnInfo,
  ReactRequest,
  ReactStreamEvent,
  OntologySchema,
  GenerateSchemaRequest,
  GenerateSchemaResponse,
  ApplyFeedbackRequest,
  ApplyFeedbackResponse,
  NodeInstanceData
} from '@/types'
import { getNormalizedUploadPath } from '@/utils/upload'

import {
  API_GATEWAY_URL, ANTLR_BASE_URL, ROBO_BASE_URL, TEXT2SQL_BASE_URL,
  handleHttpError, postJson, postFormData, streamSseFetch, streamFetch,
  type StreamCallback, type Headers,
} from '@/shared/services/http'

// ============================================================================
// Object Explorer API (도메인 레이어 오브젝트 탐색기)
// ============================================================================

export interface ChartConfig {
  chartType: 'bar' | 'line' | 'pie' | 'map' | 'none'
  xAxis?: string
  yAxis?: string
  valueField?: string
  labelField?: string
  latitudeField?: string
  longitudeField?: string
  regionField?: string
}

export interface ObjectTypeInfo {
  id: string
  name: string
  description?: string
  columns: Array<{ name: string; type: string }>
  materializedView?: string
  query?: string
  createdAt?: string
  chartConfig?: ChartConfig
}

export interface ObjectTypeDataResponse {
  objectType: string
  columns: string[]
  rows: Array<Record<string, unknown>>
  rowCount: number
  usingMaterializedView: boolean
}

export interface ObjectSearchResult {
  id: string
  name: string
  objectType: string
  properties: Record<string, unknown>
}

export interface ChildNodesResponse {
  parentId: string
  parentType: string
  relationshipType: string
  children: Array<{
    id: string
    name: string
    type: string
    properties: Record<string, unknown>
  }>
}

export const objectExplorerApi = {
  /**
   * Object Type 목록 조회
   */
  async getObjectTypes(): Promise<{ objectTypes: ObjectTypeInfo[]; total: number }> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/object-types`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },

  /**
   * Object Type 데이터 조회 (Materialized View에서)
   */
  async getObjectTypeData(objectTypeName: string, limit: number = 100): Promise<ObjectTypeDataResponse> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/object-types/${encodeURIComponent(objectTypeName)}/data?limit=${limit}`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },

  /**
   * 오브젝트 검색
   */
  async searchObjects(query: string, limit: number = 50): Promise<{ results: ObjectSearchResult[] }> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/object-explorer/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit })
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },

  /**
   * 스키마 기반으로 하위 노드 조회 (드릴다운)
   */
  async getChildNodes(parentType: string, parentId: string, parentProperties?: Record<string, unknown>): Promise<ChildNodesResponse> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/object-explorer/children`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentType, parentId, parentProperties })
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },

  /**
   * 스키마 정의에서 관계 정보 조회
   */
  async getSchemaRelationships(objectTypeName: string): Promise<{
    relationships: Array<{
      sourceType: string
      targetType: string
      relationshipName: string
      direction: 'outgoing' | 'incoming'
    }>
  }> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/object-explorer/relationships/${encodeURIComponent(objectTypeName)}`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },

  /**
   * ObjectType 차트 설정 업데이트
   */
  async updateChartConfig(objectTypeName: string, chartConfig: {
    chartType: 'bar' | 'line' | 'pie' | 'map' | 'none'
    xAxis?: string
    yAxis?: string
    valueField?: string
    labelField?: string
    latitudeField?: string
    longitudeField?: string
    regionField?: string
  }): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${ONTOLOGY_BASE_URL}/object-types/${encodeURIComponent(objectTypeName)}/chart-config`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chartConfig })
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  }
}

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
