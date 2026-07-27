import { ref } from 'vue'

import {
  objectExplorerApi,
  relationshipApi,
  type ObjectTypeCreateRequest,
  type ObjectTypeInfo,
} from '@/domains/ontology'
import {
  createObjectTypeRelationships,
  createObjectTypeWithRelationships,
  type ObjectTypeRelationshipFailure,
  type ObjectTypeRelationshipRequest,
} from '../application/objectTypeCreation'

interface GeneratedObjectTypeNames {
  koreanName: string
  englishName: string
  description: string
}

export function useObjectTypeCreationLifecycle() {
  const existingObjectTypes = ref<ObjectTypeInfo[]>([])
  const existingObjectTypesLoading = ref(false)
  const existingObjectTypesError = ref<string | null>(null)
  const creating = ref(false)
  const creationError = ref<string | null>(null)
  const createdObjectType = ref<unknown | null>(null)
  const relationshipFailures = ref<ObjectTypeRelationshipFailure[]>([])
  const generatingNames = ref(false)
  const nameGenerationError = ref<string | null>(null)

  async function loadExistingObjectTypes(): Promise<void> {
    existingObjectTypesLoading.value = true
    existingObjectTypesError.value = null
    try {
      const response = await objectExplorerApi.getObjectTypes()
      existingObjectTypes.value = response.objectTypes
    } catch (error: unknown) {
      existingObjectTypesError.value = error instanceof Error
        ? error.message
        : 'ObjectType 목록을 불러오지 못했습니다.'
    } finally {
      existingObjectTypesLoading.value = false
    }
  }

  async function create(
    request: ObjectTypeCreateRequest,
    relationships: ObjectTypeRelationshipRequest[],
  ): Promise<unknown | null> {
    if (createdObjectType.value) return null

    creating.value = true
    creationError.value = null
    relationshipFailures.value = []
    try {
      const outcome = await createObjectTypeWithRelationships(
        {
          createObjectType: payload => objectExplorerApi.createObjectType(payload),
          createRelationship: payload => relationshipApi.create(payload),
        },
        request,
        relationships,
      )
      createdObjectType.value = outcome.objectType
      relationshipFailures.value = outcome.relationshipFailures
      return outcome.objectType
    } catch (error: unknown) {
      creationError.value = error instanceof Error
        ? error.message
        : 'ObjectType 생성에 실패했습니다.'
      return null
    } finally {
      creating.value = false
    }
  }

  async function retryFailedRelationships(): Promise<boolean> {
    if (!createdObjectType.value || relationshipFailures.value.length === 0) return false

    creating.value = true
    creationError.value = null
    try {
      relationshipFailures.value = await createObjectTypeRelationships(
        request => relationshipApi.create(request),
        relationshipFailures.value.map(failure => failure.request),
      )
      return relationshipFailures.value.length === 0
    } catch (error: unknown) {
      creationError.value = error instanceof Error
        ? error.message
        : 'ObjectType 관계 생성 재시도에 실패했습니다.'
      return false
    } finally {
      creating.value = false
    }
  }

  async function generateNames(
    question: string,
    sql: string,
    columns: string[],
  ): Promise<GeneratedObjectTypeNames | null> {
    if (!question || generatingNames.value) return null

    generatingNames.value = true
    nameGenerationError.value = null
    try {
      const result = await objectExplorerApi.generateObjectTypeName({
        question,
        sql,
        columns,
      })
      return {
        koreanName: result.korean_name ?? '',
        englishName: result.english_name ?? '',
        description: result.description ?? '',
      }
    } catch (error: unknown) {
      nameGenerationError.value = error instanceof Error
        ? error.message
        : 'AI 이름 생성에 실패했습니다.'
      return null
    } finally {
      generatingNames.value = false
    }
  }

  return {
    existingObjectTypes,
    existingObjectTypesLoading,
    existingObjectTypesError,
    creating,
    creationError,
    createdObjectType,
    relationshipFailures,
    generatingNames,
    nameGenerationError,
    loadExistingObjectTypes,
    create,
    retryFailedRelationships,
    generateNames,
  }
}
