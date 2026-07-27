import { computed, ref, type ComputedRef, type Ref } from 'vue'

export interface OntologySchemaRecord {
  id?: string
  name?: string
  nodes?: unknown[]
  relationships?: unknown[]
  labels?: unknown[]
}

export interface OntologySchemaLifecycleClient<Schema extends OntologySchemaRecord> {
  updateSchemaName(schemaId: string, name: string): Promise<unknown>
  deleteSchemaById(schemaId: string): Promise<{ success: boolean }>
  activateSchema(schemaId: string): Promise<{
    success: boolean
    schemaId: string
    name: string
  }>
  getSchemaById(schemaId: string): Promise<Schema | null>
}

export type OntologySchemaLifecycleStage =
  | 'validate'
  | 'rename'
  | 'delete'
  | 'activate'
  | 'detail'

export interface OntologySchemaLifecycleError {
  action: 'rename' | 'delete' | 'load'
  stage: OntologySchemaLifecycleStage
  schemaId: string
  message: string
  activationCompleted: boolean
}

export type OntologySchemaLifecycleResult<Value> =
  | { status: 'success'; value: Value }
  | { status: 'failure'; error: OntologySchemaLifecycleError }
  | { status: 'ignored' }

export interface OntologySchemaLifecycle<Schema extends OntologySchemaRecord> {
  renamePendingId: Ref<string | null>
  renameError: Ref<OntologySchemaLifecycleError | null>
  deletePendingId: Ref<string | null>
  deleteError: Ref<OntologySchemaLifecycleError | null>
  loadPendingId: Ref<string | null>
  loadError: Ref<OntologySchemaLifecycleError | null>
  isBusy: ComputedRef<boolean>
  renameSchema(schemaId: string, requestedName: string): Promise<OntologySchemaLifecycleResult<string>>
  deleteSchema(schemaId: string): Promise<OntologySchemaLifecycleResult<string>>
  retryDelete(): Promise<OntologySchemaLifecycleResult<string>>
  loadSchema(schemaId: string): Promise<OntologySchemaLifecycleResult<Schema>>
  retryLoad(): Promise<OntologySchemaLifecycleResult<Schema>>
  clearRenameError(): void
  clearDeleteError(): void
  clearLoadError(): void
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback
}

function lifecycleError(
  action: OntologySchemaLifecycleError['action'],
  stage: OntologySchemaLifecycleStage,
  schemaId: string,
  cause: unknown,
  activationCompleted = false,
): OntologySchemaLifecycleError {
  return {
    action,
    stage,
    schemaId,
    message: errorMessage(cause, `${action} 작업에 실패했습니다.`),
    activationCompleted,
  }
}

export function useOntologySchemaLifecycle<Schema extends OntologySchemaRecord>(
  client: OntologySchemaLifecycleClient<Schema>,
): OntologySchemaLifecycle<Schema> {
  const renamePendingId = ref<string | null>(null)
  const renameError = ref<OntologySchemaLifecycleError | null>(null)
  const deletePendingId = ref<string | null>(null)
  const deleteError = ref<OntologySchemaLifecycleError | null>(null)
  const loadPendingId = ref<string | null>(null)
  const loadError = ref<OntologySchemaLifecycleError | null>(null)
  const isBusy = computed(() =>
    renamePendingId.value !== null
    || deletePendingId.value !== null
    || loadPendingId.value !== null,
  )

  function ignored<Value>(): OntologySchemaLifecycleResult<Value> {
    return { status: 'ignored' }
  }

  function failure<Value>(
    error: OntologySchemaLifecycleError,
  ): OntologySchemaLifecycleResult<Value> {
    return { status: 'failure', error }
  }

  async function renameSchema(
    schemaId: string,
    requestedName: string,
  ): Promise<OntologySchemaLifecycleResult<string>> {
    if (isBusy.value) return ignored()

    const name = requestedName.trim()
    if (!name) {
      const error = lifecycleError(
        'rename',
        'validate',
        schemaId,
        new Error('온톨로지 이름을 입력해 주세요.'),
      )
      renameError.value = error
      return failure(error)
    }

    renamePendingId.value = schemaId
    renameError.value = null
    try {
      await client.updateSchemaName(schemaId, name)
      return { status: 'success', value: name }
    } catch (cause) {
      const error = lifecycleError('rename', 'rename', schemaId, cause)
      renameError.value = error
      return failure(error)
    } finally {
      renamePendingId.value = null
    }
  }

  async function deleteSchema(
    schemaId: string,
  ): Promise<OntologySchemaLifecycleResult<string>> {
    if (isBusy.value) return ignored()

    deletePendingId.value = schemaId
    deleteError.value = null
    try {
      const result = await client.deleteSchemaById(schemaId)
      if (!result.success) {
        throw new Error('서버가 온톨로지를 삭제하지 못했습니다.')
      }
      return { status: 'success', value: schemaId }
    } catch (cause) {
      const error = lifecycleError('delete', 'delete', schemaId, cause)
      deleteError.value = error
      return failure(error)
    } finally {
      deletePendingId.value = null
    }
  }

  async function retryDelete(): Promise<OntologySchemaLifecycleResult<string>> {
    const schemaId = deleteError.value?.schemaId
    return schemaId ? deleteSchema(schemaId) : ignored()
  }

  async function loadSchemaInternal(
    schemaId: string,
    activationCompleted: boolean,
  ): Promise<OntologySchemaLifecycleResult<Schema>> {
    if (isBusy.value) return ignored()

    loadPendingId.value = schemaId
    loadError.value = null
    let didActivate = activationCompleted

    try {
      if (!didActivate) {
        try {
          const activation = await client.activateSchema(schemaId)
          if (!activation.success || activation.schemaId !== schemaId) {
            throw new Error('서버가 요청한 온톨로지를 활성화하지 못했습니다.')
          }
          didActivate = true
        } catch (cause) {
          const error = lifecycleError('load', 'activate', schemaId, cause)
          loadError.value = error
          return failure(error)
        }
      }

      try {
        const schema = await client.getSchemaById(schemaId)
        if (!schema) {
          throw new Error('온톨로지 상세 데이터가 비어 있습니다.')
        }
        if (typeof schema.id !== 'string' || schema.id !== schemaId) {
          throw new Error('온톨로지 상세 응답의 ID가 요청한 ID와 일치하지 않습니다.')
        }
        return { status: 'success', value: schema }
      } catch (cause) {
        const error = lifecycleError('load', 'detail', schemaId, cause, didActivate)
        loadError.value = error
        return failure(error)
      }
    } finally {
      loadPendingId.value = null
    }
  }

  function loadSchema(schemaId: string): Promise<OntologySchemaLifecycleResult<Schema>> {
    return loadSchemaInternal(schemaId, false)
  }

  function retryLoad(): Promise<OntologySchemaLifecycleResult<Schema>> {
    const previousError = loadError.value
    if (!previousError) return Promise.resolve(ignored())
    return loadSchemaInternal(
      previousError.schemaId,
      previousError.stage === 'detail' && previousError.activationCompleted,
    )
  }

  return {
    renamePendingId,
    renameError,
    deletePendingId,
    deleteError,
    loadPendingId,
    loadError,
    isBusy,
    renameSchema,
    deleteSchema,
    retryDelete,
    loadSchema,
    retryLoad,
    clearRenameError: () => {
      renameError.value = null
    },
    clearDeleteError: () => {
      deleteError.value = null
    },
    clearLoadError: () => {
      loadError.value = null
    },
  }
}
