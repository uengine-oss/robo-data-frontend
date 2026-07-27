export type EditableBehaviorType = 'rest_api' | 'javascript' | 'python' | 'dmn'
export type BehaviorType = EditableBehaviorType | 'processGPT'

export interface BehaviorConfig {
  endpoint?: string
  method?: string
  parameters?: Record<string, unknown>
  code?: string
  dmnXml?: string
  processId?: string
  processName?: string
  triggerCondition?: string
}

export interface OntologyBehavior {
  name: string
  description?: string
  behaviorType: BehaviorType
  config?: BehaviorConfig
  inputFields?: string[]
  outputField?: string
}

export interface BehaviorExecutionAttempt {
  attempt?: number
  status: 'success' | 'error' | 'pending' | string
  error?: {
    errorType?: string
    error?: string
  }
}

export interface BehaviorExecutionResult {
  success?: boolean
  result?: unknown
  inputData?: unknown
  message?: string
  code?: string
  originalCode?: string
  autoFixed?: boolean
  attempts?: BehaviorExecutionAttempt[]
  error?: string
  errorType?: string
  errorLine?: number
  errorLineContent?: string
  traceback?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalString(
  value: unknown,
  contract: string,
): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string') {
    throw new Error(`${contract}가 문자열이 아닙니다.`)
  }
  return value
}

function parseBehaviorType(value: unknown, contract: string): BehaviorType {
  if (
    value === 'rest_api'
    || value === 'javascript'
    || value === 'python'
    || value === 'dmn'
    || value === 'processGPT'
  ) {
    return value
  }
  throw new Error(`${contract}이 지원하는 Behavior 유형이 아닙니다.`)
}

function parseBehaviorConfig(
  value: unknown,
  contract: string,
): BehaviorConfig | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) {
    throw new Error(`${contract} 구조가 올바르지 않습니다.`)
  }
  if (value.parameters !== undefined && !isRecord(value.parameters)) {
    throw new Error(`${contract}.parameters 구조가 올바르지 않습니다.`)
  }

  return {
    endpoint: optionalString(value.endpoint, `${contract}.endpoint`),
    method: optionalString(value.method, `${contract}.method`),
    parameters: value.parameters === undefined
      ? undefined
      : { ...value.parameters },
    code: optionalString(value.code, `${contract}.code`),
    dmnXml: optionalString(value.dmnXml, `${contract}.dmnXml`),
    processId: optionalString(value.processId, `${contract}.processId`),
    processName: optionalString(value.processName, `${contract}.processName`),
    triggerCondition: optionalString(
      value.triggerCondition,
      `${contract}.triggerCondition`,
    ),
  }
}

export function parseOntologyBehaviorList(
  value: unknown,
  contract = 'Ontology behaviors',
): OntologyBehavior[] {
  if (!Array.isArray(value)) {
    throw new Error(`${contract}가 배열이 아닙니다.`)
  }

  return value.map((item, index) => {
    const itemContract = `${contract}[${index}]`
    if (!isRecord(item) || typeof item.name !== 'string') {
      throw new Error(`${itemContract} 구조가 올바르지 않습니다.`)
    }
    if (
      item.inputFields !== undefined
      && (
        !Array.isArray(item.inputFields)
        || !item.inputFields.every(field => typeof field === 'string')
      )
    ) {
      throw new Error(`${itemContract}.inputFields 구조가 올바르지 않습니다.`)
    }

    return {
      name: item.name,
      description: optionalString(
        item.description,
        `${itemContract}.description`,
      ),
      behaviorType: parseBehaviorType(
        item.behaviorType,
        `${itemContract}.behaviorType`,
      ),
      config: parseBehaviorConfig(item.config, `${itemContract}.config`),
      inputFields: item.inputFields === undefined
        ? undefined
        : [...item.inputFields],
      outputField: optionalString(
        item.outputField,
        `${itemContract}.outputField`,
      ),
    }
  })
}

export function parseBehaviorExecutionResult(value: unknown): BehaviorExecutionResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Behavior 실행 응답 형식이 올바르지 않습니다.')
  }
  return value as BehaviorExecutionResult
}
