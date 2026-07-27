import {
  computed,
  onScopeDispose,
  ref,
  toValue,
  watch,
  type MaybeRefOrGetter,
} from 'vue'
import {
  whatifDomainApi,
  type DeleteModelResponse,
  type ModelStatusResponse,
  type RegisteredModel,
} from '../api/whatIfModeling'
import {
  createAllModelsDeleteSnapshot,
  createSingleModelDeleteSnapshot,
  projectModelDeleteResults,
  type ModelDeleteSnapshot,
  type ModelDeleteTarget,
} from './modelManagerPolicy'

export interface ModelManagerDependencies {
  list: (schemaId: string, signal: AbortSignal) => Promise<ModelStatusResponse>
  remove: (
    schemaId: string,
    modelId: string,
    signal: AbortSignal,
  ) => Promise<DeleteModelResponse>
}

const defaultDependencies: ModelManagerDependencies = {
  list: (schemaId, signal) => whatifDomainApi.getModelStatus(schemaId, signal),
  remove: (schemaId, modelId, signal) =>
    whatifDomainApi.deleteModel(schemaId, modelId, signal),
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback
}

function isAbort(cause: unknown): boolean {
  return cause instanceof Error && cause.name === 'AbortError'
}

export function useWhatIfModelManager(
  schemaId: MaybeRefOrGetter<string>,
  dependencies: ModelManagerDependencies = defaultDependencies,
) {
  const models = ref<RegisteredModel[]>([])
  const expandedModelId = ref<string | null>(null)
  const loading = ref(false)
  const loadError = ref('')
  const deletePending = ref(false)
  const deleteError = ref('')
  const deleteSnapshot = ref<ModelDeleteSnapshot | null>(null)

  let loadSequence = 0
  let loadController: AbortController | null = null
  let deleteSequence = 0
  let deleteController: AbortController | null = null

  const deleteDialogOpen = computed(() => deleteSnapshot.value !== null)
  const deleteDialogTitle = computed(() =>
    deleteSnapshot.value?.mode === 'all' ? '전체 모델 삭제' : '모델 삭제',
  )
  const deleteDialogMessage = computed(() => {
    const snapshot = deleteSnapshot.value
    if (!snapshot) return ''
    if (snapshot.mode === 'single') {
      return `"${snapshot.targets[0]?.modelName ?? ''}" 모델을 삭제합니다.`
    }
    return `${snapshot.targets.length}개 모델을 삭제합니다.${
      deleteError.value ? '\n실패한 모델만 다시 시도합니다.' : ''
    }`
  })
  const deleteConfirmLabel = computed(() =>
    deleteSnapshot.value?.mode === 'all' ? '전체 모델 삭제' : '모델 삭제',
  )

  function currentSchemaId(): string {
    return toValue(schemaId)
  }

  function cancelLoad(): void {
    loadController?.abort()
    loadController = null
    loadSequence += 1
    loading.value = false
  }

  function cancelDeleteRequest(): void {
    deleteController?.abort()
    deleteController = null
    deleteSequence += 1
    deletePending.value = false
  }

  async function loadModels(): Promise<boolean> {
    const targetSchemaId = currentSchemaId()
    if (!targetSchemaId) return false
    loadController?.abort()
    const controller = new AbortController()
    loadController = controller
    const sequence = ++loadSequence
    loading.value = true
    loadError.value = ''
    try {
      const response = await dependencies.list(targetSchemaId, controller.signal)
      if (
        sequence !== loadSequence
        || targetSchemaId !== currentSchemaId()
      ) return false
      models.value = response.models
      if (
        expandedModelId.value
        && !models.value.some(model => model.modelId === expandedModelId.value)
      ) {
        expandedModelId.value = null
      }
      return true
    } catch (cause: unknown) {
      if (
        !isAbort(cause)
        && sequence === loadSequence
        && targetSchemaId === currentSchemaId()
      ) {
        loadError.value = errorMessage(
          cause,
          '모델 목록 조회에 실패했습니다.',
        )
      }
      return false
    } finally {
      if (sequence === loadSequence) {
        loading.value = false
        if (loadController === controller) loadController = null
      }
    }
  }

  function toggleDetail(modelId: string): void {
    expandedModelId.value = expandedModelId.value === modelId ? null : modelId
  }

  function requestDeleteModel(model: RegisteredModel): void {
    if (!currentSchemaId()) return
    deleteError.value = ''
    deleteSnapshot.value = createSingleModelDeleteSnapshot(
      currentSchemaId(),
      model,
    )
  }

  function requestDeleteAll(): void {
    if (!currentSchemaId() || !models.value.length) return
    deleteError.value = ''
    deleteSnapshot.value = createAllModelsDeleteSnapshot(
      currentSchemaId(),
      models.value,
    )
  }

  function closeDeleteDialog(): void {
    if (deletePending.value) return
    deleteSnapshot.value = null
    deleteError.value = ''
  }

  async function confirmDelete(): Promise<boolean> {
    const snapshot = deleteSnapshot.value
    if (
      !snapshot
      || deletePending.value
      || snapshot.schemaId !== currentSchemaId()
    ) return false

    const controller = new AbortController()
    deleteController = controller
    const sequence = ++deleteSequence
    deletePending.value = true
    deleteError.value = ''
    const succeededIds = new Set<string>()
    const failedTargets: ModelDeleteTarget[] = []
    const failedMessages: string[] = []

    try {
      for (const target of snapshot.targets) {
        try {
          await dependencies.remove(
            snapshot.schemaId,
            target.modelId,
            controller.signal,
          )
          succeededIds.add(target.modelId)
        } catch (cause: unknown) {
          if (isAbort(cause)) return false
          failedTargets.push(target)
          failedMessages.push(
            `${target.modelName}: ${errorMessage(cause, '삭제에 실패했습니다.')}`,
          )
        }
      }

      if (
        sequence !== deleteSequence
        || snapshot.schemaId !== currentSchemaId()
      ) return false

      const projection = projectModelDeleteResults(
        models.value,
        snapshot,
        succeededIds,
        failedTargets,
      )
      models.value = projection.models
      if (
        expandedModelId.value
        && succeededIds.has(expandedModelId.value)
      ) {
        expandedModelId.value = null
      }
      deleteSnapshot.value = projection.failedSnapshot
      if (projection.failedSnapshot) {
        deleteError.value = `삭제하지 못한 모델:\n${failedMessages.join('\n')}`
        return false
      }
      deleteError.value = ''
      return true
    } finally {
      if (sequence === deleteSequence) {
        deletePending.value = false
        if (deleteController === controller) deleteController = null
      }
    }
  }

  watch(
    () => currentSchemaId(),
    (nextSchemaId, previousSchemaId) => {
      cancelLoad()
      cancelDeleteRequest()
      deleteSnapshot.value = null
      deleteError.value = ''
      expandedModelId.value = null
      if (nextSchemaId !== previousSchemaId) models.value = []
      if (nextSchemaId) void loadModels()
    },
    { immediate: true },
  )

  onScopeDispose(() => {
    cancelLoad()
    cancelDeleteRequest()
  })

  return {
    models,
    expandedModelId,
    loading,
    loadError,
    deletePending,
    deleteError,
    deleteDialogOpen,
    deleteDialogTitle,
    deleteDialogMessage,
    deleteConfirmLabel,
    loadModels,
    toggleDetail,
    requestDeleteModel,
    requestDeleteAll,
    closeDeleteDialog,
    confirmDelete,
  }
}
