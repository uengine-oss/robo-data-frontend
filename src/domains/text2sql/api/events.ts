/** Text2SQL 이벤트 감지·규칙·알림·템플릿 API. */
import { TEXT2SQL_BASE_URL } from './baseUrl'
import { text2SqlHttp } from './http'
import { useRuntimeStore } from '@/shared/stores/runtime'
import {
  parseAlarmStreamEvent,
  parseCategories,
  parseCepStatus,
  parseEventChatResponse,
  parseEventExecutionResult,
  parseEventNotificationList,
  parseEventRule,
  parseEventRuleList,
  parseEventTemplate,
  parseEventTemplateList,
  parseGroupedEventTemplates,
  parseMessage,
  parseMessageWithActiveRules,
  parseSchedulerStatus,
  parseSimpleCepStatus,
  parseSimulationResult,
  parseToggleResponse,
  type AlarmStreamEvent,
  type CepStatus,
  type EventChatRequest,
  type EventChatResponse,
  type EventExecutionResult,
  type EventNotification,
  type EventRule,
  type EventRuleCreate,
  type EventRuleUpdate,
  type EventTemplate,
  type SchedulerStatus,
  type SimpleCepStatus,
  type SimulationRequest,
  type SimulationResult,
} from './eventContracts.ts'

const handleHttpError = text2SqlHttp.handleError
const streamSseFetch = text2SqlHttp.streamSse

export type {
  AlarmPayload,
  AlarmStreamEvent,
  AlertConfig,
  CepStatus,
  ChatMessage,
  EventChatRequest,
  EventChatResponse,
  EventExecutionResult,
  EventNotification,
  EventRule,
  EventRuleCreate,
  EventRuleUpdate,
  EventTemplate,
  ExtractedEventConfig,
  ProcessConfig,
  SchedulerStatus,
  SimpleCepEngineStatus,
  SimpleCepStatus,
  SimulationAlarm,
  SimulationRequest,
  SimulationResult,
} from './eventContracts.ts'

interface EventApiDependencies {
  baseUrl: string
  getHeaders: () => Record<string, string>
  fetchImpl?: typeof fetch
}

export function createEventClients({ baseUrl, getHeaders, fetchImpl = fetch }: EventApiDependencies) {
  async function requestJson<T>(
    path: string,
    parser: (value: unknown) => T,
    options: RequestInit = {},
  ): Promise<T> {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...options,
      headers: {
        ...getHeaders(),
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...options.headers,
      },
    })
    if (!response.ok) await handleHttpError(response)
    return parser(await response.json())
  }

  async function requestWithoutBody(path: string, options: RequestInit): Promise<void> {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...options,
      headers: { ...getHeaders(), ...options.headers },
    })
    if (!response.ok) await handleHttpError(response)
  }

  const eventApi = {
    listRules: (): Promise<EventRule[]> => requestJson('/events/rules', parseEventRuleList),

    getRule: (eventId: string): Promise<EventRule> =>
      requestJson(`/events/rules/${encodeURIComponent(eventId)}`, parseEventRule),

    createRule: (data: EventRuleCreate): Promise<EventRule> =>
      requestJson('/events/rules', parseEventRule, { method: 'POST', body: JSON.stringify(data) }),

    updateRule: (eventId: string, data: EventRuleUpdate): Promise<EventRule> =>
      requestJson(`/events/rules/${encodeURIComponent(eventId)}`, parseEventRule, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    deleteRule: (eventId: string): Promise<void> =>
      requestWithoutBody(`/events/rules/${encodeURIComponent(eventId)}`, { method: 'DELETE' }),

    toggleRule: (eventId: string): Promise<{ message: string; is_active: boolean }> =>
      requestJson(`/events/rules/${encodeURIComponent(eventId)}/toggle`, parseToggleResponse, { method: 'POST' }),

    runRule: (eventId: string): Promise<EventExecutionResult> =>
      requestJson(`/events/rules/${encodeURIComponent(eventId)}/run`, parseEventExecutionResult, { method: 'POST' }),

    listNotifications(options?: { limit?: number; unacknowledged_only?: boolean }): Promise<EventNotification[]> {
      const params = new URLSearchParams()
      if (options?.limit !== undefined) params.set('limit', String(options.limit))
      if (options?.unacknowledged_only !== undefined) {
        params.set('unacknowledged_only', String(options.unacknowledged_only))
      }
      const query = params.size > 0 ? `?${params}` : ''
      return requestJson(`/events/notifications${query}`, parseEventNotificationList)
    },

    acknowledgeNotification: (notificationId: string): Promise<void> =>
      requestWithoutBody(`/events/notifications/${encodeURIComponent(notificationId)}/acknowledge`, { method: 'POST' }),

    deleteNotification: (notificationId: string): Promise<void> =>
      requestWithoutBody(`/events/notifications/${encodeURIComponent(notificationId)}`, { method: 'DELETE' }),

    startScheduler: (): Promise<{ message: string; active_rules: number }> =>
      requestJson('/events/scheduler/start', parseMessageWithActiveRules, { method: 'POST' }),

    stopScheduler: (): Promise<{ message: string }> =>
      requestJson('/events/scheduler/stop', parseMessage, { method: 'POST' }),

    getSchedulerStatus: (): Promise<SchedulerStatus> =>
      requestJson('/events/scheduler/status', parseSchedulerStatus),

    chat: (request: EventChatRequest): Promise<EventChatResponse> =>
      requestJson('/events/chat', parseEventChatResponse, { method: 'POST', body: JSON.stringify(request) }),

    getCepStatus: (): Promise<CepStatus> => requestJson('/events/cep/status', parseCepStatus),

    runSimulation: (request: SimulationRequest): Promise<SimulationResult> =>
      requestJson('/events/simulate', parseSimulationResult, { method: 'POST', body: JSON.stringify(request) }),

    getSimpleCepStatus: (): Promise<SimpleCepStatus> =>
      requestJson('/events/simple-cep/status', parseSimpleCepStatus),

    streamAlarms(onEvent: (event: AlarmStreamEvent) => void, signal?: AbortSignal): Promise<void> {
      return streamSseFetch(
        `${baseUrl}/events/stream/alarms`,
        getHeaders(),
        event => onEvent(event.data),
        parseAlarmStreamEvent,
        signal,
      )
    },
  }

  const eventTemplateApi = {
    listTemplates(category?: string): Promise<EventTemplate[]> {
      const query = category ? `?category=${encodeURIComponent(category)}` : ''
      return requestJson(`/events/templates${query}`, parseEventTemplateList)
    },

    listCategories: (): Promise<{ categories: string[] }> =>
      requestJson('/events/templates/categories', parseCategories),

    getTemplatesGrouped: (): Promise<Record<string, EventTemplate[]>> =>
      requestJson('/events/templates/by-category', parseGroupedEventTemplates),

    getTemplate: (templateId: string): Promise<EventTemplate> =>
      requestJson(`/events/templates/${encodeURIComponent(templateId)}`, parseEventTemplate),

    createRuleFromTemplate(
      templateId: string,
      options?: { name?: string; description?: string; check_interval_minutes?: number },
    ): Promise<EventRule> {
      const params = new URLSearchParams()
      if (options?.name) params.set('name', options.name)
      if (options?.description) params.set('description', options.description)
      if (options?.check_interval_minutes !== undefined) {
        params.set('check_interval_minutes', String(options.check_interval_minutes))
      }
      const query = params.size > 0 ? `?${params}` : ''
      return requestJson(
        `/events/templates/${encodeURIComponent(templateId)}/create-rule${query}`,
        parseEventRule,
        { method: 'POST' },
      )
    },
  }

  return { eventApi, eventTemplateApi }
}

const clients = createEventClients({
  baseUrl: TEXT2SQL_BASE_URL,
  getHeaders: () => useRuntimeStore().getHeaders(),
})

export const eventApi = clients.eventApi
export const eventTemplateApi = clients.eventTemplateApi
