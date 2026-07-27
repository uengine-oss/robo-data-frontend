import type {
  BehaviorType,
  OntologyBehavior,
} from '../model/behavior'

export const CUSTOM_OUTPUT_FIELD = '__custom__'

export type BehaviorHttpMethod = 'GET' | 'POST' | 'PUT'

export interface RelatedBehaviorObjectType {
  name: string
  relationName?: string
  columns?: string[]
}

export interface BehaviorEditorDraft {
  name: string
  description: string
  behaviorType: BehaviorType
  endpoint: string
  httpMethod: BehaviorHttpMethod
  pythonCode: string
  javascriptCode: string
  dmnXml: string
  processId: string
  processName: string
  triggerCondition: string
  inputFields: string[]
  outputSelection: string
  customOutputField: string
  testInstanceJson: string
}

export interface BehaviorCodeGenerationSnapshot {
  prompt: string
  language: 'python'
}

export interface BehaviorExternalTestSnapshot {
  endpoint: string
  method: BehaviorHttpMethod
  body: {
    behavior_name: string
    instance_data: Record<string, unknown>
  }
}

function cloneStrings(values?: readonly string[]): string[] {
  return values ? [...values] : []
}

function isBehaviorHttpMethod(value: string | undefined): value is BehaviorHttpMethod {
  return value === 'GET' || value === 'POST' || value === 'PUT'
}

export function createBehaviorEditorDraft(
  behavior: OntologyBehavior | undefined,
  columns: readonly string[],
): BehaviorEditorDraft {
  const outputField = behavior?.outputField ?? ''
  const outputIsExisting = Boolean(outputField) && columns.includes(outputField)
  const code = behavior?.config?.code ?? ''
  return {
    name: behavior?.name ?? '',
    description: behavior?.description ?? '',
    behaviorType: behavior?.behaviorType ?? 'rest_api',
    endpoint: behavior?.config?.endpoint ?? '',
    httpMethod: isBehaviorHttpMethod(behavior?.config?.method)
      ? behavior.config.method
      : 'POST',
    pythonCode: code,
    javascriptCode: code,
    dmnXml: behavior?.config?.dmnXml ?? '',
    processId: behavior?.config?.processId ?? '',
    processName: behavior?.config?.processName ?? '',
    triggerCondition: behavior?.config?.triggerCondition ?? '',
    inputFields: cloneStrings(behavior?.inputFields),
    outputSelection: outputIsExisting
      ? outputField
      : outputField
        ? CUSTOM_OUTPUT_FIELD
        : '',
    customOutputField: outputIsExisting ? '' : outputField,
    testInstanceJson: '{}',
  }
}

export function toggleBehaviorInputField(
  fields: readonly string[],
  field: string,
): string[] {
  return fields.includes(field)
    ? fields.filter(candidate => candidate !== field)
    : [...fields, field]
}

export function resolveBehaviorOutputField(
  draft: Readonly<BehaviorEditorDraft>,
): string {
  return (
    draft.outputSelection === CUSTOM_OUTPUT_FIELD
      ? draft.customOutputField
      : draft.outputSelection
  ).trim()
}

export function buildOntologyBehavior(
  draft: Readonly<BehaviorEditorDraft>,
  dmnXmlOverride?: string,
): OntologyBehavior {
  const name = draft.name.trim().replace(/\s+/g, '_')
  if (!name) throw new Error('Behavior 이름을 입력해주세요')

  let config: OntologyBehavior['config']
  if (draft.behaviorType === 'rest_api') {
    const endpoint = draft.endpoint.trim()
    if (!endpoint) throw new Error('API 엔드포인트를 입력해주세요')
    config = { endpoint, method: draft.httpMethod }
  } else if (draft.behaviorType === 'dmn') {
    const dmnXml = (dmnXmlOverride ?? draft.dmnXml).trim()
    if (!dmnXml) throw new Error('DMN 규칙을 정의해주세요')
    config = { dmnXml }
  } else if (draft.behaviorType === 'python') {
    const code = draft.pythonCode.trim()
    if (!code) throw new Error('Python 코드를 입력해주세요')
    config = { code }
  } else if (draft.behaviorType === 'javascript') {
    const code = draft.javascriptCode.trim()
    if (!code) throw new Error('JavaScript 코드를 입력해주세요')
    config = { code }
  } else {
    const processId = draft.processId.trim()
    const processName = draft.processName.trim()
    if (!processId || !processName) {
      throw new Error('ProcessGPT 프로세스 identity가 없습니다.')
    }
    const triggerCondition = draft.triggerCondition.trim()
    config = {
      processId,
      processName,
      ...(triggerCondition ? { triggerCondition } : {}),
    }
  }

  const description = draft.description.trim()
  const outputField = resolveBehaviorOutputField(draft)
  return {
    name,
    ...(description ? { description } : {}),
    behaviorType: draft.behaviorType,
    config,
    ...(draft.inputFields.length ? { inputFields: cloneStrings(draft.inputFields) } : {}),
    ...(outputField ? { outputField } : {}),
  }
}

export function buildBehaviorCodeGenerationSnapshot(input: {
  objectTypeName: string
  columns: readonly string[]
  relatedObjectTypes?: readonly RelatedBehaviorObjectType[]
  description: string
}): BehaviorCodeGenerationSnapshot {
  const description = input.description.trim()
  if (!description) {
    throw new Error('코드 생성을 위해 설명을 먼저 입력해주세요')
  }
  const fieldsInfo = input.columns.map(column => `  - ${column}`).join('\n')
  const relatedInfo = (input.relatedObjectTypes ?? []).map(related => {
    const heading = `### ${related.name}${related.relationName ? ` (관계명: ${related.relationName})` : ''}`
    const fields = related.columns?.length
      ? `필드:\n${related.columns.map(column => `  - ${column}`).join('\n')}`
      : ''
    return `${heading}${fields ? `\n${fields}` : ''}`
  }).join('\n\n')

  return {
    language: 'python',
    prompt: `당신은 Python 코드 생성 전문가입니다. 다음 ObjectType과 설명을 기반으로 Python 코드를 생성해주세요.

## ObjectType: ${input.objectTypeName}

## 필드 목록:
${fieldsInfo}${relatedInfo ? `\n\n## 관계된 Child ObjectType들:\n\n${relatedInfo}` : ''}

## Behavior 설명:
${description}

## 요구사항:
1. 'data' 변수에 현재 인스턴스 데이터가 dict 형태로 전달됩니다
2. 관계된 child 데이터가 있다면 data['children'] 또는 data['관계명'] 형태로 접근 가능합니다
3. 최종 결과는 'result' 변수에 저장해야 합니다
4. result는 dict 또는 list 형태로 반환해야 합니다
5. 주석으로 로직을 설명해주세요

Python 코드만 출력하세요 (마크다운 코드블록 없이):
`,
  }
}

export function buildBehaviorExternalTestSnapshot(
  draft: Readonly<BehaviorEditorDraft>,
): BehaviorExternalTestSnapshot {
  if (draft.behaviorType !== 'rest_api') {
    throw new Error('REST API 타입만 테스트할 수 있습니다')
  }
  const endpoint = draft.endpoint.trim()
  if (!endpoint) throw new Error('API 엔드포인트를 입력해주세요')

  let parsed: unknown
  try {
    parsed = JSON.parse(draft.testInstanceJson)
  } catch {
    throw new Error('테스트 입력이 올바른 JSON이 아닙니다.')
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('테스트 입력은 JSON 객체여야 합니다.')
  }
  return {
    endpoint,
    method: draft.httpMethod,
    body: {
      behavior_name: draft.name,
      instance_data: Object.fromEntries(Object.entries(parsed)),
    },
  }
}

export function formatBehaviorTestResult(value: unknown): string {
  if (typeof value === 'string') return value
  const formatted = JSON.stringify(value, null, 2)
  return formatted === undefined ? String(value) : formatted
}

export function normalizeGeneratedPythonCode(code: string): string {
  const normalized = code
    .replace(/^```python\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  if (!normalized) {
    throw new Error('코드 생성 응답의 code가 비어 있습니다.')
  }
  return normalized
}
