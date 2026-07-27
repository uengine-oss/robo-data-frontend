import {
  ontologyApi,
  projectOntologyLibrary,
  useOntologySchemaLifecycle,
  type OntologyLibraryEntry,
  type OntologySchemaLifecycleClient,
  type OntologySchemaRecord,
  type SchemaListItem,
} from '@/domains/ontology'
import {
  computed,
  nextTick,
  onScopeDispose,
  ref,
  shallowRef,
  type Ref,
} from 'vue'
import { logger } from '@/shared/utils/logger'
import {
  getRecentSchemaIds,
  removeRecentSchemaId,
  saveRecentSchemaId,
} from '../model/ontologyHistory'
import {
  createOntologyLibraryApplicationRetry,
  createOntologyLibraryDeleteTarget,
  ontologyLibraryListFailureMessage,
  ontologyLibraryLoadFailureMessage,
  projectRenamedOntologyLibraryEntries,
  type OntologyLibraryApplicationRetry,
  type OntologyLibraryDeleteTarget,
} from '../application/ontologyLibraryWorkspace'

export interface OntologyLibraryWorkspaceClient<
  Schema extends OntologySchemaRecord,
> extends OntologySchemaLifecycleClient<Schema> {
  listSchemas(): Promise<{
    schemas: SchemaListItem[]
    activeSchemaId: string | null
  }>
}

interface UseOntologyLibraryWorkspaceInput<
  Schema extends OntologySchemaRecord,
> {
  currentSchemaId: Ref<string | null>
  currentSchemaName: Ref<string>
  applySchema: (schemaId: string, schema: Schema) => Promise<void>
  clearDeletedSchema: (schemaId: string) => void
  setLoadingState: (pending: boolean, message?: string) => void
  focusRenameInput?: () => void
  client?: OntologyLibraryWorkspaceClient<Schema>
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback
}

export function useOntologyLibraryWorkspace<
  Schema extends OntologySchemaRecord,
>(input: UseOntologyLibraryWorkspaceInput<Schema>) {
  const client: OntologyLibraryWorkspaceClient<Schema> = input.client ?? {
    listSchemas: () => ontologyApi.listSchemas(),
    updateSchemaName: (schemaId, name) =>
      ontologyApi.updateSchemaName(schemaId, name),
    deleteSchemaById: schemaId => ontologyApi.deleteSchemaById(schemaId),
    activateSchema: schemaId => ontologyApi.activateSchema(schemaId),
    getSchemaById: schemaId =>
      ontologyApi.getSchemaById(schemaId) as Promise<Schema | null>,
  }
  const schemaLifecycle = useOntologySchemaLifecycle<Schema>(client)

  const showOntologyListDropdown = ref(false)
  const ontologyLibraryEntries = ref<OntologyLibraryEntry[]>([])
  const ontologyListLoading = ref(false)
  const ontologyListError = ref<string | null>(null)
  const ontologyListNotice = ref<string | null>(null)
  const schemaToDelete = shallowRef<OntologyLibraryDeleteTarget | null>(null)
  const ontologyOperationNotice = ref<string | null>(null)
  const schemaApplicationError = ref<string | null>(null)
  const editingSchemaId = ref<string | null>(null)
  const editingSchemaName = ref('')

  let listSequence = 0
  let disposed = false
  let pendingSchemaApplicationRetry:
    OntologyLibraryApplicationRetry<Schema> | null = null

  const {
    renamePendingId,
    renameError,
    deletePendingId,
    deleteError,
    loadPendingId,
    loadError,
    isBusy: schemaLifecycleBusy,
  } = schemaLifecycle

  const ontologyLoadErrorMessage = computed(() =>
    ontologyLibraryLoadFailureMessage(
      schemaApplicationError.value,
      loadError.value,
    ))

  function startEditSchemaName(schemaId: string, currentName: string): void {
    if (schemaLifecycleBusy.value) return
    schemaLifecycle.clearRenameError()
    ontologyOperationNotice.value = null
    editingSchemaId.value = schemaId
    editingSchemaName.value = currentName
    void nextTick(() => input.focusRenameInput?.())
  }

  async function saveSchemaName(schemaId: string): Promise<void> {
    if (
      disposed
      || editingSchemaId.value !== schemaId
      || renamePendingId.value !== null
    ) return

    const schema = ontologyLibraryEntries.value.find(entry => entry.id === schemaId)
    if (!schema) {
      editingSchemaId.value = null
      editingSchemaName.value = ''
      return
    }
    const requestedName = editingSchemaName.value.trim()
    if (schema.name === requestedName) {
      schemaLifecycle.clearRenameError()
      editingSchemaId.value = null
      editingSchemaName.value = ''
      return
    }

    const result = await schemaLifecycle.renameSchema(
      schemaId,
      editingSchemaName.value,
    )
    if (disposed || result.status !== 'success') return

    ontologyLibraryEntries.value = projectRenamedOntologyLibraryEntries(
      ontologyLibraryEntries.value,
      schemaId,
      result.value,
    )
    if (input.currentSchemaId.value === schemaId) {
      input.currentSchemaName.value = result.value
    }
    editingSchemaId.value = null
    editingSchemaName.value = ''
    ontologyOperationNotice.value =
      `온톨로지 「${result.value}」의 이름을 변경했습니다.`
    logger.debug('[saveSchemaName] 업데이트 성공:', {
      schemaId,
      name: result.value,
    })
    await loadOntologyList({ autoLoadRecent: false })
  }

  function clearSchemaRenameError(): void {
    schemaLifecycle.clearRenameError()
  }

  function cancelEditSchemaName(): void {
    if (renamePendingId.value !== null) return
    schemaLifecycle.clearRenameError()
    editingSchemaId.value = null
    editingSchemaName.value = ''
  }

  function toggleOntologyListDropdown(): void {
    showOntologyListDropdown.value = !showOntologyListDropdown.value
    if (
      showOntologyListDropdown.value
      && ontologyLibraryEntries.value.length === 0
    ) {
      void loadOntologyList()
    }
  }

  function requestDeleteSchema(
    schema: Pick<OntologyLibraryEntry, 'id' | 'name'>,
  ): void {
    if (schemaLifecycleBusy.value) return
    schemaLifecycle.clearDeleteError()
    ontologyOperationNotice.value = null
    schemaToDelete.value = createOntologyLibraryDeleteTarget(schema)
  }

  function closeDeleteSchemaDialog(): void {
    if (deletePendingId.value !== null) return
    schemaLifecycle.clearDeleteError()
    schemaToDelete.value = null
  }

  async function confirmDeleteSchema(): Promise<void> {
    const target = schemaToDelete.value
    if (disposed || !target || deletePendingId.value !== null) return

    const result = await schemaLifecycle.deleteSchema(target.id)
    if (disposed || result.status !== 'success') return

    ontologyLibraryEntries.value = ontologyLibraryEntries.value
      .filter(schema => schema.id !== target.id)
      .map(schema => ({ ...schema }))
    removeRecentSchemaId(target.id)
    if (input.currentSchemaId.value === target.id) {
      input.clearDeletedSchema(target.id)
    }
    schemaToDelete.value = null
    showOntologyListDropdown.value = true
    ontologyOperationNotice.value =
      `온톨로지 「${target.name}」이(가) 삭제되었습니다.`
    await loadOntologyList({ autoLoadRecent: false })
  }

  async function loadOntologyList(
    options: { autoLoadRecent?: boolean } = {},
  ): Promise<void> {
    const { autoLoadRecent = true } = options
    const sequence = ++listSequence
    ontologyListLoading.value = true
    ontologyListError.value = null

    try {
      const result = await client.listSchemas()
      if (disposed || sequence !== listSequence) return
      const projection = projectOntologyLibrary(
        result.schemas ?? [],
        getRecentSchemaIds(),
      )
      ontologyLibraryEntries.value = projection.entries
      ontologyListNotice.value = projection.excludedWithoutSchemaJson > 0
        ? `스키마 데이터가 없는 온톨로지 ${projection.excludedWithoutSchemaJson}개를 제외했습니다.`
        : null

      if (projection.excludedWithoutSchemaJson > 0) {
        logger.warn(
          `스키마 데이터가 없는 온톨로지 ${projection.excludedWithoutSchemaJson}개를 목록에서 제외했습니다.`,
        )
      }
      logger.debug(`유효한 스키마 ${projection.entries.length}개 로드됨`)

      if (
        autoLoadRecent
        && projection.recentSchemaId
        && !input.currentSchemaId.value
      ) {
        logger.debug(
          `최근 접속한 온톨로지 자동 로드: ${projection.recentSchemaId}`,
        )
        await loadSchema(projection.recentSchemaId)
      }
    } catch (error: unknown) {
      if (disposed || sequence !== listSequence) return
      logger.error('Neo4j 스키마 목록 조회 오류:', error)
      ontologyListError.value = ontologyLibraryListFailureMessage(
        error,
        ontologyLibraryEntries.value.length,
      )
    } finally {
      if (!disposed && sequence === listSequence) {
        ontologyListLoading.value = false
      }
    }
  }

  async function commitLoadedSchema(
    schemaId: string,
    schema: Schema,
  ): Promise<void> {
    const retryTarget = createOntologyLibraryApplicationRetry(schemaId, schema)
    pendingSchemaApplicationRetry = retryTarget
    const applicationInput = createOntologyLibraryApplicationRetry(
      retryTarget.schemaId,
      retryTarget.schema,
    )
    await input.applySchema(applicationInput.schemaId, applicationInput.schema)
    if (disposed) return

    pendingSchemaApplicationRetry = null
    schemaApplicationError.value = null
    schemaLifecycle.clearLoadError()
    saveRecentSchemaId(schemaId)
    showOntologyListDropdown.value = false
    ontologyOperationNotice.value =
      `온톨로지 「${schema.name ?? ''}」을(를) 불러왔습니다.`
  }

  async function loadSchema(schemaId: string): Promise<void> {
    if (disposed || schemaLifecycleBusy.value) return

    input.setLoadingState(true, 'Neo4j에서 온톨로지 로딩 중...')
    ontologyOperationNotice.value = null
    schemaApplicationError.value = null
    pendingSchemaApplicationRetry = null

    try {
      const result = await schemaLifecycle.loadSchema(schemaId)
      if (disposed || result.status === 'ignored') return
      if (result.status === 'failure') {
        showOntologyListDropdown.value = true
        return
      }
      await commitLoadedSchema(schemaId, result.value)
    } catch (error: unknown) {
      if (disposed) return
      logger.error('스키마 화면 적용 오류:', error)
      schemaApplicationError.value = errorMessage(
        error,
        '화면 적용 중 알 수 없는 오류가 발생했습니다.',
      )
      showOntologyListDropdown.value = true
    } finally {
      if (!disposed) input.setLoadingState(false)
    }
  }

  async function retryLoadSchema(): Promise<void> {
    if (disposed || schemaLifecycleBusy.value) return

    input.setLoadingState(true, 'Neo4j에서 온톨로지 다시 로딩 중...')
    ontologyOperationNotice.value = null
    try {
      if (pendingSchemaApplicationRetry) {
        const pending = createOntologyLibraryApplicationRetry(
          pendingSchemaApplicationRetry.schemaId,
          pendingSchemaApplicationRetry.schema,
        )
        await commitLoadedSchema(pending.schemaId, pending.schema)
        return
      }

      const result = await schemaLifecycle.retryLoad()
      if (disposed || result.status !== 'success') return
      await commitLoadedSchema(result.value.id as string, result.value)
    } catch (error: unknown) {
      if (disposed) return
      logger.error('스키마 재시도 화면 적용 오류:', error)
      schemaApplicationError.value = errorMessage(
        error,
        '화면 적용 중 알 수 없는 오류가 발생했습니다.',
      )
      showOntologyListDropdown.value = true
    } finally {
      if (!disposed) input.setLoadingState(false)
    }
  }

  onScopeDispose(() => {
    disposed = true
    listSequence += 1
  })

  return {
    showOntologyListDropdown,
    ontologyLibraryEntries,
    ontologyListLoading,
    ontologyListError,
    ontologyListNotice,
    schemaToDelete,
    ontologyOperationNotice,
    schemaApplicationError,
    editingSchemaId,
    editingSchemaName,
    renamePendingId,
    renameError,
    deletePendingId,
    deleteError,
    loadPendingId,
    loadError,
    schemaLifecycleBusy,
    ontologyLoadErrorMessage,
    startEditSchemaName,
    saveSchemaName,
    clearSchemaRenameError,
    cancelEditSchemaName,
    toggleOntologyListDropdown,
    requestDeleteSchema,
    closeDeleteSchemaDialog,
    confirmDeleteSchema,
    loadOntologyList,
    loadSchema,
    retryLoadSchema,
  }
}
