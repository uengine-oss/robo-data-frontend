export type FieldMappingStatus = 'no_datasource' | 'loading' | 'ready' | 'error'

export interface RelationFieldMapping {
  id: string
  source: string
  target: string
  fromField?: string
  toField?: string
}

export interface FieldMappingColumnState {
  status: FieldMappingStatus
  columns: readonly string[]
  error?: string
}

export interface RelationFieldMappingDraft {
  fromField: string
  toField: string
}

export interface ClearedRelationField {
  relationId: string
  source: string
  target: string
  side: 'from' | 'to'
  field: string
  reason: 'missing-column' | 'unpaired'
}

function validateField(
  side: 'From' | 'To',
  field: string,
  state: FieldMappingColumnState,
): string | null {
  const normalizedField = field.trim()
  if (!normalizedField) return null
  if (state.status !== 'ready') {
    return state.error
      || `${side} 노드의 컬럼 정보를 확인할 수 없어 필드 매핑을 저장할 수 없습니다.`
  }
  if (!state.columns.includes(normalizedField)) {
    return `${side} 필드 '${normalizedField}'은(는) 현재 데이터 소스 컬럼에 없습니다.`
  }
  return null
}

export function validateRelationFieldMapping(
  draft: RelationFieldMappingDraft,
  source: FieldMappingColumnState,
  target: FieldMappingColumnState,
): string | null {
  const fromField = draft.fromField.trim()
  const toField = draft.toField.trim()
  if ((fromField && !toField) || (!fromField && toField)) {
    return 'From 필드와 To 필드는 함께 설정하거나 함께 비워야 합니다.'
  }
  return validateField('From', draft.fromField, source)
    || validateField('To', draft.toField, target)
}

/**
 * 컬럼 목록이 확인된 경우에만 기존 매핑을 정리한다.
 * `null`은 "컬럼을 확인하지 못함"이며 빈 컬럼 목록으로 추론하지 않는다.
 */
export function reconcileRelationFieldMappings<T extends RelationFieldMapping>(
  relationships: readonly T[],
  nodeId: string,
  verifiedColumns: readonly string[] | null,
): {
  relationships: T[]
  cleared: ClearedRelationField[]
} {
  if (verifiedColumns === null) {
    return {
      relationships: [...relationships],
      cleared: [],
    }
  }

  const columnSet = new Set(verifiedColumns)
  const cleared: ClearedRelationField[] = []
  const nextRelationships = relationships.map(relationship => {
    if (relationship.source !== nodeId && relationship.target !== nodeId) {
      return relationship
    }

    let next = relationship
    if (
      relationship.source === nodeId
      && relationship.fromField
      && !columnSet.has(relationship.fromField)
    ) {
      cleared.push({
        relationId: relationship.id,
        source: relationship.source,
        target: relationship.target,
        side: 'from',
        field: relationship.fromField,
        reason: 'missing-column',
      })
      next = { ...next, fromField: undefined }
    }
    if (
      relationship.target === nodeId
      && relationship.toField
      && !columnSet.has(relationship.toField)
    ) {
      cleared.push({
        relationId: relationship.id,
        source: relationship.source,
        target: relationship.target,
        side: 'to',
        field: relationship.toField,
        reason: 'missing-column',
      })
      next = { ...next, toField: undefined }
    }

    if ((next.fromField && !next.toField) || (!next.fromField && next.toField)) {
      if (next.fromField) {
        cleared.push({
          relationId: relationship.id,
          source: relationship.source,
          target: relationship.target,
          side: 'from',
          field: next.fromField,
          reason: 'unpaired',
        })
      }
      if (next.toField) {
        cleared.push({
          relationId: relationship.id,
          source: relationship.source,
          target: relationship.target,
          side: 'to',
          field: next.toField,
          reason: 'unpaired',
        })
      }
      next = {
        ...next,
        fromField: undefined,
        toField: undefined,
      }
    }

    return next
  })

  return {
    relationships: nextRelationships,
    cleared,
  }
}
