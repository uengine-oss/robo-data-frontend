export interface OlapOperationResult {
  success: boolean
  message?: string
  error?: string
}

export function requireSuccessfulOperation<T extends OlapOperationResult>(
  result: T,
  operationLabel: string,
): T {
  if (result.success) return result
  throw new Error(result.error || result.message || `${operationLabel}에 실패했습니다.`)
}
