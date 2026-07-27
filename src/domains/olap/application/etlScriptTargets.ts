export type EtlScriptGenerationMode = 'agent' | 'template'
export type EtlScriptSyncMode = 'full' | 'incremental'

export interface EtlScriptGenerationTarget {
  readonly cubeName: string
  readonly mode: EtlScriptGenerationMode
}

export interface EtlScriptSaveTarget {
  readonly cubeName: string
  readonly code: string
  readonly filename: string
}

export interface EtlScriptExecutionTarget {
  readonly cubeName: string
  readonly syncMode: EtlScriptSyncMode
  readonly maxRetries: number
}

function requireText(value: string, message: string): string {
  if (!value.trim()) throw new Error(message)
  return value
}

export function defaultEtlScriptFilename(cubeName: string): string {
  return `etl_${requireText(cubeName, '큐브를 선택해주세요')}.py`
}

export function createEtlScriptGenerationTarget(
  cubeName: string,
  mode: EtlScriptGenerationMode,
): EtlScriptGenerationTarget {
  return Object.freeze({
    cubeName: requireText(cubeName, '큐브를 선택해주세요'),
    mode,
  })
}

export function createEtlScriptSaveTarget(
  cubeName: string,
  code: string,
  filename: string,
): EtlScriptSaveTarget {
  const frozenCubeName = requireText(cubeName, '큐브를 선택해주세요')
  const frozenCode = requireText(code, '저장할 ETL 스크립트가 없습니다.')
  return Object.freeze({
    cubeName: frozenCubeName,
    code: frozenCode,
    filename: filename || defaultEtlScriptFilename(frozenCubeName),
  })
}

export function createEtlScriptExecutionTarget(
  cubeName: string,
  syncMode: EtlScriptSyncMode,
  maxRetries = 3,
): EtlScriptExecutionTarget {
  if (!Number.isInteger(maxRetries) || maxRetries < 0) {
    throw new Error('ETL 실행 재시도 횟수가 올바르지 않습니다.')
  }
  return Object.freeze({
    cubeName: requireText(cubeName, '큐브를 선택해주세요'),
    syncMode,
    maxRetries,
  })
}
