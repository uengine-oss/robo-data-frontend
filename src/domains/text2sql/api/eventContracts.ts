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
  alert_config: AlertConfig | null
  process_config: ProcessConfig | null
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
  alert_config?: AlertConfig | null
  process_config?: ProcessConfig | null
  is_active?: boolean
}

export interface EventExecutionResult {
  event_id: string
  executed_at: string
  sql_result: Record<string, unknown>
  condition_met: boolean
  action_taken: string | null
  error: string | null
}

export interface EventNotification {
  id: string
  event_id: string
  event_name: string
  message: string
  triggered_at: string
  acknowledged: boolean
  data: Record<string, unknown> | null
}

export interface SchedulerStatus {
  running: boolean
  active_tasks: number
  scheduled_events: string[]
}

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
  extracted_config: ExtractedEventConfig | null
  ready_to_confirm: boolean
  event_created: boolean
  next_step: string | null
}

export type SimpleCepEngineStatus =
  | { status: 'error'; error: string }
  | {
      status: string
      active_rules: number
      total_rules: number
      buffered_events: number
      engine: string
    }

export interface CepStatus {
  local_scheduler_running: boolean
  local_active_tasks: number
  simple_cep_status?: SimpleCepEngineStatus
  esper_cep_available: boolean
  esper_cep_status?: Record<string, unknown>
}

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

export interface SimulationAlarm {
  rule_id: string
  rule_name: string
  triggered_at: string
  duration: string
  matching_events: number
}

export interface SimulationResult {
  rule_id: string
  rule_name: string
  events_generated: number
  alarms_triggered: number
  alarms: SimulationAlarm[]
  condition_details: {
    field: string
    operator: string
    threshold: number
    required_duration_minutes: number
    simulated_value: number
    simulated_duration_minutes: number
  }
}

export type SimpleCepStatus = { available: false } | ({ available: true } & SimpleCepEngineStatus)

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
  suggested_process: string | null
}

export interface AlarmPayload {
  id: string
  rule_name: string
  message: string
  severity: string
  triggered_at: string
  acknowledged: boolean
  duration?: string
  matching_events?: number
}

export type AlarmStreamEvent =
  | { event: 'connected'; data: { message: string; timestamp: string } }
  | { event: 'heartbeat'; data: { timestamp: string } }
  | { event: 'alarm'; data: AlarmPayload }

type JsonRecord = Record<string, unknown>

function record(value: unknown, context: string): JsonRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`이벤트 ${context} 응답 계약 오류: 객체가 필요합니다.`)
  }
  return value as JsonRecord
}

function string(value: unknown, context: string): string {
  if (typeof value !== 'string') throw new Error(`이벤트 ${context} 응답 계약 오류: 문자열이 필요합니다.`)
  return value
}

function number(value: unknown, context: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`이벤트 ${context} 응답 계약 오류: 숫자가 필요합니다.`)
  }
  return value
}

function boolean(value: unknown, context: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`이벤트 ${context} 응답 계약 오류: 불리언이 필요합니다.`)
  return value
}

function nullableString(value: unknown, context: string): string | null {
  return value === null || value === undefined ? null : string(value, context)
}

function stringArray(value: unknown, context: string): string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error(`이벤트 ${context} 응답 계약 오류: 문자열 배열이 필요합니다.`)
  }
  return value
}

function literal<T extends string>(value: unknown, allowed: readonly T[], context: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new Error(`이벤트 ${context} 응답 계약 오류: 지원하지 않는 값입니다.`)
  }
  return value as T
}

function optionalRecord(value: unknown, context: string): JsonRecord | undefined {
  return value === undefined ? undefined : record(value, context)
}

function parseAlertConfig(value: unknown, context: string): AlertConfig | null {
  if (value === null || value === undefined) return null
  const data = record(value, context)
  return { channels: stringArray(data.channels, `${context}.channels`), message: string(data.message, `${context}.message`) }
}

function parseProcessConfig(value: unknown, context: string): ProcessConfig | null {
  if (value === null || value === undefined) return null
  const data = record(value, context)
  return {
    process_name: string(data.process_name, `${context}.process_name`),
    process_params: record(data.process_params, `${context}.process_params`),
  }
}

export function parseEventRule(value: unknown): EventRule {
  const data = record(value, 'rule')
  return {
    id: string(data.id, 'rule.id'),
    name: string(data.name, 'rule.name'),
    description: string(data.description, 'rule.description'),
    natural_language_condition: string(data.natural_language_condition, 'rule.natural_language_condition'),
    sql: string(data.sql, 'rule.sql'),
    check_interval_minutes: number(data.check_interval_minutes, 'rule.check_interval_minutes'),
    condition_threshold: string(data.condition_threshold, 'rule.condition_threshold'),
    action_type: literal(data.action_type, ['alert', 'process'] as const, 'rule.action_type'),
    alert_config: parseAlertConfig(data.alert_config, 'rule.alert_config'),
    process_config: parseProcessConfig(data.process_config, 'rule.process_config'),
    is_active: boolean(data.is_active, 'rule.is_active'),
    last_checked_at: nullableString(data.last_checked_at, 'rule.last_checked_at'),
    last_triggered_at: nullableString(data.last_triggered_at, 'rule.last_triggered_at'),
    trigger_count: number(data.trigger_count, 'rule.trigger_count'),
    created_at: string(data.created_at, 'rule.created_at'),
    updated_at: string(data.updated_at, 'rule.updated_at'),
  }
}

export function parseEventRuleList(value: unknown): EventRule[] {
  if (!Array.isArray(value)) throw new Error('이벤트 rule 목록 응답 계약 오류: 배열이 필요합니다.')
  return value.map(parseEventRule)
}

export function parseEventExecutionResult(value: unknown): EventExecutionResult {
  const data = record(value, 'execution')
  return {
    event_id: string(data.event_id, 'execution.event_id'),
    executed_at: string(data.executed_at, 'execution.executed_at'),
    sql_result: record(data.sql_result, 'execution.sql_result'),
    condition_met: boolean(data.condition_met, 'execution.condition_met'),
    action_taken: nullableString(data.action_taken, 'execution.action_taken'),
    error: nullableString(data.error, 'execution.error'),
  }
}

export function parseEventNotification(value: unknown): EventNotification {
  const data = record(value, 'notification')
  return {
    id: string(data.id, 'notification.id'),
    event_id: string(data.event_id, 'notification.event_id'),
    event_name: string(data.event_name, 'notification.event_name'),
    message: string(data.message, 'notification.message'),
    triggered_at: string(data.triggered_at, 'notification.triggered_at'),
    acknowledged: boolean(data.acknowledged, 'notification.acknowledged'),
    data: data.data === null || data.data === undefined ? null : record(data.data, 'notification.data'),
  }
}

export function parseEventNotificationList(value: unknown): EventNotification[] {
  if (!Array.isArray(value)) throw new Error('이벤트 notification 목록 응답 계약 오류: 배열이 필요합니다.')
  return value.map(parseEventNotification)
}

export function parseSchedulerStatus(value: unknown): SchedulerStatus {
  const data = record(value, 'scheduler')
  return {
    running: boolean(data.running, 'scheduler.running'),
    active_tasks: number(data.active_tasks, 'scheduler.active_tasks'),
    scheduled_events: stringArray(data.scheduled_events, 'scheduler.scheduled_events'),
  }
}

function parseExtractedEventConfig(value: unknown): ExtractedEventConfig | null {
  if (value === null || value === undefined) return null
  const data = record(value, 'chat.extracted_config')
  return {
    name: data.name === null || data.name === undefined ? undefined : string(data.name, 'chat.extracted_config.name'),
    description: data.description === null || data.description === undefined ? undefined : string(data.description, 'chat.extracted_config.description'),
    condition: data.condition === null || data.condition === undefined ? undefined : string(data.condition, 'chat.extracted_config.condition'),
    interval: data.interval === null || data.interval === undefined ? undefined : number(data.interval, 'chat.extracted_config.interval'),
    threshold: data.threshold === null || data.threshold === undefined ? undefined : string(data.threshold, 'chat.extracted_config.threshold'),
    action_type: data.action_type === null || data.action_type === undefined
      ? undefined
      : literal(data.action_type, ['alert', 'process'] as const, 'chat.extracted_config.action_type'),
    process_name: data.process_name === null || data.process_name === undefined
      ? undefined
      : string(data.process_name, 'chat.extracted_config.process_name'),
  }
}

export function parseEventChatResponse(value: unknown): EventChatResponse {
  const data = record(value, 'chat')
  return {
    response: string(data.response, 'chat.response'),
    extracted_config: parseExtractedEventConfig(data.extracted_config),
    ready_to_confirm: boolean(data.ready_to_confirm, 'chat.ready_to_confirm'),
    event_created: boolean(data.event_created, 'chat.event_created'),
    next_step: nullableString(data.next_step, 'chat.next_step'),
  }
}

function parseSimpleCepEngineStatus(value: unknown, context: string): SimpleCepEngineStatus {
  const data = record(value, context)
  const status = string(data.status, `${context}.status`)
  if (status === 'error') {
    return { status, error: string(data.error, `${context}.error`) }
  }
  return {
    status,
    active_rules: number(data.active_rules, `${context}.active_rules`),
    total_rules: number(data.total_rules, `${context}.total_rules`),
    buffered_events: number(data.buffered_events, `${context}.buffered_events`),
    engine: string(data.engine, `${context}.engine`),
  }
}

export function parseCepStatus(value: unknown): CepStatus {
  const data = record(value, 'cep')
  const simple = data.simple_cep_status === undefined
    ? undefined
    : parseSimpleCepEngineStatus(data.simple_cep_status, 'cep.simple_cep_status')
  return {
    local_scheduler_running: boolean(data.local_scheduler_running, 'cep.local_scheduler_running'),
    local_active_tasks: number(data.local_active_tasks, 'cep.local_active_tasks'),
    simple_cep_status: simple,
    esper_cep_available: boolean(data.esper_cep_available, 'cep.esper_cep_available'),
    esper_cep_status: optionalRecord(data.esper_cep_status, 'cep.esper_cep_status'),
  }
}

export function parseSimulationResult(value: unknown): SimulationResult {
  const data = record(value, 'simulation')
  if (!Array.isArray(data.alarms)) throw new Error('이벤트 simulation.alarms 응답 계약 오류: 배열이 필요합니다.')
  const details = record(data.condition_details, 'simulation.condition_details')
  return {
    rule_id: string(data.rule_id, 'simulation.rule_id'),
    rule_name: string(data.rule_name, 'simulation.rule_name'),
    events_generated: number(data.events_generated, 'simulation.events_generated'),
    alarms_triggered: number(data.alarms_triggered, 'simulation.alarms_triggered'),
    alarms: data.alarms.map((value, index) => {
      const alarm = record(value, `simulation.alarms[${index}]`)
      return {
        rule_id: string(alarm.rule_id, `simulation.alarms[${index}].rule_id`),
        rule_name: string(alarm.rule_name, `simulation.alarms[${index}].rule_name`),
        triggered_at: string(alarm.triggered_at, `simulation.alarms[${index}].triggered_at`),
        duration: string(alarm.duration, `simulation.alarms[${index}].duration`),
        matching_events: number(alarm.matching_events, `simulation.alarms[${index}].matching_events`),
      }
    }),
    condition_details: {
      field: string(details.field, 'simulation.condition_details.field'),
      operator: string(details.operator, 'simulation.condition_details.operator'),
      threshold: number(details.threshold, 'simulation.condition_details.threshold'),
      required_duration_minutes: number(details.required_duration_minutes, 'simulation.condition_details.required_duration_minutes'),
      simulated_value: number(details.simulated_value, 'simulation.condition_details.simulated_value'),
      simulated_duration_minutes: number(details.simulated_duration_minutes, 'simulation.condition_details.simulated_duration_minutes'),
    },
  }
}

export function parseSimpleCepStatus(value: unknown): SimpleCepStatus {
  const data = record(value, 'simple-cep')
  const available = boolean(data.available, 'simple-cep.available')
  if (!available) return { available: false }
  return { available: true, ...parseSimpleCepEngineStatus(data, 'simple-cep') }
}

export function parseEventTemplate(value: unknown): EventTemplate {
  const data = record(value, 'template')
  return {
    id: string(data.id, 'template.id'),
    category: string(data.category, 'template.category'),
    name: string(data.name, 'template.name'),
    description: string(data.description, 'template.description'),
    rule_description: string(data.rule_description, 'template.rule_description'),
    sample_sql: string(data.sample_sql, 'template.sample_sql'),
    default_interval_minutes: number(data.default_interval_minutes, 'template.default_interval_minutes'),
    default_threshold: string(data.default_threshold, 'template.default_threshold'),
    recommended_action: literal(data.recommended_action, ['alert', 'process'] as const, 'template.recommended_action'),
    diagnostic_questions: stringArray(data.diagnostic_questions, 'template.diagnostic_questions'),
    simple_questions: stringArray(data.simple_questions, 'template.simple_questions'),
    action_questions: stringArray(data.action_questions, 'template.action_questions'),
    suggested_process: nullableString(data.suggested_process, 'template.suggested_process'),
  }
}

export function parseEventTemplateList(value: unknown): EventTemplate[] {
  if (!Array.isArray(value)) throw new Error('이벤트 template 목록 응답 계약 오류: 배열이 필요합니다.')
  return value.map(parseEventTemplate)
}

export function parseGroupedEventTemplates(value: unknown): Record<string, EventTemplate[]> {
  const data = record(value, 'template groups')
  return Object.fromEntries(Object.entries(data).map(([category, templates]) => [category, parseEventTemplateList(templates)]))
}

export function parseCategories(value: unknown): { categories: string[] } {
  const data = record(value, 'template categories')
  return { categories: stringArray(data.categories, 'template categories.categories') }
}

export function parseMessage(value: unknown): { message: string } {
  const data = record(value, 'message')
  return { message: string(data.message, 'message.message') }
}

export function parseMessageWithActiveRules(value: unknown): { message: string; active_rules: number } {
  const data = record(value, 'scheduler start')
  return {
    message: string(data.message, 'scheduler start.message'),
    active_rules: number(data.active_rules, 'scheduler start.active_rules'),
  }
}

export function parseToggleResponse(value: unknown): { message: string; is_active: boolean } {
  const data = record(value, 'toggle')
  return { message: string(data.message, 'toggle.message'), is_active: boolean(data.is_active, 'toggle.is_active') }
}

export function parseAlarmStreamEvent(value: unknown, eventName: string): AlarmStreamEvent {
  const data = record(value, `alarm stream ${eventName}`)
  if (eventName === 'connected') {
    return { event: 'connected', data: { message: string(data.message, 'alarm stream connected.message'), timestamp: string(data.timestamp, 'alarm stream connected.timestamp') } }
  }
  if (eventName === 'heartbeat') {
    return { event: 'heartbeat', data: { timestamp: string(data.timestamp, 'alarm stream heartbeat.timestamp') } }
  }
  if (eventName === 'alarm') {
    return {
      event: 'alarm',
      data: {
        id: string(data.id, 'alarm stream alarm.id'),
        rule_name: string(data.rule_name, 'alarm stream alarm.rule_name'),
        message: string(data.message, 'alarm stream alarm.message'),
        severity: string(data.severity, 'alarm stream alarm.severity'),
        triggered_at: string(data.triggered_at, 'alarm stream alarm.triggered_at'),
        acknowledged: boolean(data.acknowledged, 'alarm stream alarm.acknowledged'),
        duration: data.duration === undefined ? undefined : string(data.duration, 'alarm stream alarm.duration'),
        matching_events: data.matching_events === undefined ? undefined : number(data.matching_events, 'alarm stream alarm.matching_events'),
      },
    }
  }
  throw new Error(`지원하지 않는 alarm SSE 이벤트 '${eventName}'입니다.`)
}
