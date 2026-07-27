export type PivotDropPayload =
  | { type: 'dimension'; dimension: string; level: string }
  | { type: 'measure'; name: string }

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} 값이 올바르지 않습니다.`)
  }
  return value
}

export function parsePivotDropPayload(serialized: string): PivotDropPayload {
  let value: unknown
  try {
    value = JSON.parse(serialized)
  } catch {
    throw new Error('드래그한 OLAP 필드의 JSON 형식이 올바르지 않습니다.')
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('드래그한 OLAP 필드가 객체가 아닙니다.')
  }
  const record = value as Record<string, unknown>
  if (record.type === 'dimension') {
    return {
      type: 'dimension',
      dimension: requiredString(record.dimension, 'dimension'),
      level: requiredString(record.level, 'level'),
    }
  }
  if (record.type === 'measure') {
    return {
      type: 'measure',
      name: requiredString(record.name, 'measure name'),
    }
  }
  throw new Error('지원하지 않는 OLAP 필드 종류입니다.')
}
