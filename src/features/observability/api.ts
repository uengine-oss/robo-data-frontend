/** observability api — 이벤트 감지·규칙·알림·템플릿(text2sql 백엔드). 공유 http 코어 사용. */
import { TEXT2SQL_BASE_URL, handleHttpError } from '@/shared/services/http'

// ============================================================================
// Event Detection API (이벤트 감지 및 조치)
// ============================================================================

export interface AlertConfig {
  channels: string[]
  message: string
}

export interface ProcessConfig {
  process_name: string
  process_params: Record<string, unknown>
}

export interface EventRule {
  id: string
  name: string
  description: string
  natural_language_condition: string
  sql: string
  check_interval_minutes: number
  condition_threshold: string
  action_type: 'alert' | 'process'
  alert_config?: AlertConfig
  process_config?: ProcessConfig
  is_active: boolean
  last_checked_at: string | null
  last_triggered_at: string | null
  trigger_count: number
  created_at: string
  updated_at: string
}

export interface EventRuleCreate {
  name: string
  description?: string
  natural_language_condition: string
  sql: string
  check_interval_minutes?: number
  condition_threshold?: string
  action_type?: 'alert' | 'process'
  alert_config?: AlertConfig
  process_config?: ProcessConfig
}

export interface EventRuleUpdate {
  name?: string
  description?: string
  natural_language_condition?: string
  sql?: string
  check_interval_minutes?: number
  condition_threshold?: string
  action_type?: 'alert' | 'process'
  alert_config?: AlertConfig
  process_config?: ProcessConfig
  is_active?: boolean
}

export interface EventExecutionResult {
  event_id: string
  executed_at: string
  sql_result: Record<string, unknown>
  condition_met: boolean
  action_taken?: string
  error?: string
}

export interface EventNotification {
  id: string
  event_id: string
  event_name: string
  message: string
  triggered_at: string
  acknowledged: boolean
  data?: Record<string, unknown>
}

export interface SchedulerStatus {
  running: boolean
  active_tasks: number
  scheduled_events: string[]
}

// 대화형 이벤트 설정 타입
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface ExtractedEventConfig {
  name?: string
  description?: string
  condition?: string
  interval?: number
  threshold?: string
  action_type?: 'alert' | 'process'
  process_name?: string
}

export interface EventChatRequest {
  message: string
  history?: ChatMessage[]
  current_config?: Record<string, unknown>
  step?: string
}

export interface EventChatResponse {
  response: string
  extracted_config?: ExtractedEventConfig
  ready_to_confirm: boolean
  event_created: boolean
  next_step?: string
}

// CEP 상태 타입
export interface CEPStatus {
  cep_available: boolean
  cep_status?: {
    status: string
    activeRules?: number
    engine?: string
    error?: string
  }
  local_scheduler_running: boolean
  local_active_tasks: number
}

// 시뮬레이션 요청 타입
export interface SimulationRequest {
  rule_name: string
  natural_language_condition: string
  field_name?: string
  threshold: number
  duration_minutes?: number
  simulated_value: number
  simulated_duration_minutes?: number
  station_id?: string
}

// 시뮬레이션 결과 타입
export interface SimulationResult {
  rule_id: string
  rule_name: string
  events_generated: number
  alarms_triggered: number
  alarms: Array<{
    rule_id: string
    rule_name: string
    triggered_at: string
    duration: string
    matching_events: number
  }>
  condition_details: {
    field: string
    operator: string
    threshold: number
    required_duration_minutes: number
    simulated_value: number
    simulated_duration_minutes: number
  }
}

// SimpleCEP 상태 타입
export interface SimpleCEPStatus {
  available: boolean
  status?: string
  active_rules?: number
  total_rules?: number
  buffered_events?: number
  engine?: string
}

export const eventApi = {
  // ========== 이벤트 규칙 CRUD ==========
  
  /**
   * 이벤트 규칙 목록 조회
   */
  async listRules(): Promise<EventRule[]> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/events/rules`)
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  /**
   * 이벤트 규칙 상세 조회
   */
  async getRule(eventId: string): Promise<EventRule> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/events/rules/${eventId}`)
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  /**
   * 이벤트 규칙 생성
   */
  async createRule(data: EventRuleCreate): Promise<EventRule> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/events/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  /**
   * 이벤트 규칙 수정
   */
  async updateRule(eventId: string, data: EventRuleUpdate): Promise<EventRule> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/events/rules/${eventId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  /**
   * 이벤트 규칙 삭제
   */
  async deleteRule(eventId: string): Promise<void> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/events/rules/${eventId}`, {
      method: 'DELETE'
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
  },

  /**
   * 이벤트 규칙 활성/비활성 토글
   */
  async toggleRule(eventId: string): Promise<{ message: string; is_active: boolean }> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/events/rules/${eventId}/toggle`, {
      method: 'POST'
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  /**
   * 이벤트 규칙 수동 실행
   */
  async runRule(eventId: string): Promise<EventExecutionResult> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/events/rules/${eventId}/run`, {
      method: 'POST'
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  // ========== 알림 관리 ==========

  /**
   * 알림 목록 조회
   */
  async listNotifications(options?: { 
    limit?: number
    unacknowledged_only?: boolean 
  }): Promise<EventNotification[]> {
    const params = new URLSearchParams()
    if (options?.limit) params.append('limit', options.limit.toString())
    if (options?.unacknowledged_only) params.append('unacknowledged_only', 'true')
    
    const response = await fetch(`${TEXT2SQL_BASE_URL}/events/notifications?${params}`)
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  /**
   * 알림 확인 처리
   */
  async acknowledgeNotification(notificationId: string): Promise<void> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/events/notifications/${notificationId}/acknowledge`, {
      method: 'POST'
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
  },

  /**
   * 알림 삭제
   */
  async deleteNotification(notificationId: string): Promise<void> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/events/notifications/${notificationId}`, {
      method: 'DELETE'
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
  },

  // ========== 스케줄러 관리 ==========

  /**
   * 스케줄러 시작
   */
  async startScheduler(): Promise<{ message: string; active_rules: number }> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/events/scheduler/start`, {
      method: 'POST'
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  /**
   * 스케줄러 중지
   */
  async stopScheduler(): Promise<{ message: string }> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/events/scheduler/stop`, {
      method: 'POST'
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  /**
   * 스케줄러 상태 조회
   */
  async getSchedulerStatus(): Promise<SchedulerStatus> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/events/scheduler/status`)
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  // ========== 대화형 이벤트 설정 ==========

  /**
   * 대화형 이벤트 설정 API
   * 
   * 사용자의 자연어 설명을 분석하여 이벤트 규칙 설정을 도와줍니다.
   */
  async chat(request: EventChatRequest): Promise<EventChatResponse> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/events/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  // ========== CEP 상태 ==========

  /**
   * CEP 서비스 상태 조회
   */
  async getCepStatus(): Promise<CEPStatus> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/events/cep/status`)
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  // ========== 시뮬레이션 ==========

  /**
   * CEP 시뮬레이션 실행
   * 
   * 가짜 타임스탬프 데이터로 10분 지속 조건 등을 테스트합니다.
   */
  async runSimulation(request: SimulationRequest): Promise<SimulationResult> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/events/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  /**
   * SimpleCEP 상태 조회
   */
  async getSimpleCepStatus(): Promise<SimpleCEPStatus> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/events/simple-cep/status`)
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  /** 알람 SSE 스트림 — /text2sql/events/stream/alarms ('connected'/'alarm'/'heartbeat' 이벤트) */
  createAlarmStream(): EventSource {
    return new EventSource(`${TEXT2SQL_BASE_URL}/events/stream/alarms`)
  }
}

// ============================================================================
// Event Templates API (이벤트 템플릿)
// ============================================================================

export interface EventTemplate {
  id: string
  category: string
  name: string
  description: string
  rule_description: string
  sample_sql: string
  default_interval_minutes: number
  default_threshold: string
  recommended_action: 'alert' | 'process'
  diagnostic_questions: string[]
  simple_questions: string[]
  action_questions: string[]
  suggested_process?: string
}

export const eventTemplateApi = {
  /**
   * 템플릿 목록 조회
   */
  async listTemplates(category?: string): Promise<EventTemplate[]> {
    const params = category ? `?category=${encodeURIComponent(category)}` : ''
    const response = await fetch(`${TEXT2SQL_BASE_URL}/events/templates${params}`)
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  /**
   * 카테고리 목록 조회
   */
  async listCategories(): Promise<{ categories: string[] }> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/events/templates/categories`)
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  /**
   * 카테고리별 그룹화된 템플릿 조회
   */
  async getTemplatesGrouped(): Promise<Record<string, EventTemplate[]>> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/events/templates/by-category`)
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  /**
   * 템플릿 상세 조회
   */
  async getTemplate(templateId: string): Promise<EventTemplate> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/events/templates/${templateId}`)
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  /**
   * 템플릿으로 이벤트 규칙 생성
   */
  async createRuleFromTemplate(
    templateId: string,
    options?: {
      name?: string
      description?: string
      check_interval_minutes?: number
    }
  ): Promise<EventRule> {
    const params = new URLSearchParams()
    if (options?.name) params.append('name', options.name)
    if (options?.description) params.append('description', options.description)
    if (options?.check_interval_minutes) params.append('check_interval_minutes', options.check_interval_minutes.toString())
    
    const response = await fetch(`${TEXT2SQL_BASE_URL}/events/templates/${templateId}/create-rule?${params}`, {
      method: 'POST'
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  }
}
