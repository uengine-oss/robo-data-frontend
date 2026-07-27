import type {
  ObjectTypeCreateRequest,
  ObjectTypeRelationshipCardinality,
  ObjectTypeRelationshipMatchStrategy,
} from '@/domains/ontology'

export type ObjectTypeCreationSource =
  | 'natural-language'
  | 'direct-sql'
  | 'manual-input'

export interface ObjectTypeCreationColumn {
  name: string
  type: string
}

export type ObjectTypeInitialRecord = Record<
  string,
  string | number | boolean | null
>

export interface ObjectTypeCreationDraft {
  name: string
  description: string
  source: ObjectTypeCreationSource
  columns: ObjectTypeCreationColumn[]
  query?: string
  sourceQuestion?: string
  createMindsDbView: boolean
  viewName?: string
  initialRecords?: ObjectTypeInitialRecord[]
}

export interface ObjectTypeRelationshipRequest {
  sourceType: string
  targetType: string
  sourceColumn: string
  targetColumn: string
  matchStrategy: ObjectTypeRelationshipMatchStrategy
  cardinality: Exclude<ObjectTypeRelationshipCardinality, 'MANY_TO_ONE'>
}

export interface ObjectTypeCreationDependencies<TObjectType = unknown> {
  createObjectType: (request: ObjectTypeCreateRequest) => Promise<TObjectType>
  createRelationship: (request: ObjectTypeRelationshipRequest) => Promise<unknown>
}

export interface ObjectTypeRelationshipFailure {
  request: ObjectTypeRelationshipRequest
  message: string
}

export interface ObjectTypeCreationOutcome<TObjectType = unknown> {
  objectType: TObjectType
  relationshipFailures: ObjectTypeRelationshipFailure[]
}

function messageOf(cause: unknown): string {
  return cause instanceof Error && cause.message
    ? cause.message
    : '관계 생성에 실패했습니다'
}

export function buildObjectTypeCreationRequest(
  draft: ObjectTypeCreationDraft,
): ObjectTypeCreateRequest {
  const name = draft.name.trim()
  if (!name) throw new Error('ObjectType 이름을 입력해주세요')
  if (draft.columns.length === 0) {
    throw new Error('ObjectType 컬럼이 없습니다')
  }

  const common = {
    name,
    description: draft.description,
    columns: draft.columns,
    createMaterializedView: false as const,
  }

  if (draft.source === 'manual-input') {
    return {
      ...common,
      dataSourceType: 'manual',
      createMindsDbView: false,
      initialRecords: draft.initialRecords ?? [],
    }
  }

  const query = draft.query?.trim()
  if (!query) throw new Error('SQL 쿼리가 없습니다')

  return {
    ...common,
    dataSourceType: draft.source,
    query,
    sourceQuestion: draft.source === 'natural-language'
      ? draft.sourceQuestion
      : undefined,
    createMindsDbView: draft.createMindsDbView,
    viewName: draft.viewName || undefined,
  }
}

export async function createObjectTypeRelationships(
  createRelationship: ObjectTypeCreationDependencies['createRelationship'],
  requests: ObjectTypeRelationshipRequest[],
): Promise<ObjectTypeRelationshipFailure[]> {
  const failures: ObjectTypeRelationshipFailure[] = []

  for (const request of requests) {
    try {
      await createRelationship(request)
    } catch (cause: unknown) {
      failures.push({ request, message: messageOf(cause) })
    }
  }

  return failures
}

export async function createObjectTypeWithRelationships<TObjectType>(
  dependencies: ObjectTypeCreationDependencies<TObjectType>,
  request: ObjectTypeCreateRequest,
  relationships: ObjectTypeRelationshipRequest[],
): Promise<ObjectTypeCreationOutcome<TObjectType>> {
  const objectType = await dependencies.createObjectType(request)
  const relationshipFailures = await createObjectTypeRelationships(
    dependencies.createRelationship,
    relationships,
  )

  return { objectType, relationshipFailures }
}
