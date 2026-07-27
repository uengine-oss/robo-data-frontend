import {
  computed,
  onScopeDispose,
  ref,
  toValue,
  watch,
  type MaybeRefOrGetter,
} from 'vue'
import {
  behaviorApi,
  type BehaviorCodeGenerationResponse,
  type BehaviorMutationResponse,
} from '../api/agents'
import type { OntologyBehavior } from '../model/behavior'
import {
  buildBehaviorCodeGenerationSnapshot,
  buildBehaviorExternalTestSnapshot,
  buildOntologyBehavior,
  createBehaviorEditorDraft,
  formatBehaviorTestResult,
  normalizeGeneratedPythonCode,
  toggleBehaviorInputField,
  type BehaviorCodeGenerationSnapshot,
  type BehaviorEditorDraft,
  type BehaviorExternalTestSnapshot,
  type RelatedBehaviorObjectType,
} from './behaviorDraft'

export type BehaviorEditorMode = 'create' | 'edit'

export interface BehaviorEditorDependencies {
  generate: (
    target: BehaviorCodeGenerationSnapshot,
    signal: AbortSignal,
  ) => Promise<BehaviorCodeGenerationResponse>
  create: (
    objectTypeName: string,
    behavior: OntologyBehavior,
    signal: AbortSignal,
  ) => Promise<BehaviorMutationResponse>
  update: (
    objectTypeName: string,
    behaviorName: string,
    behavior: OntologyBehavior,
    signal: AbortSignal,
  ) => Promise<BehaviorMutationResponse>
  remove: (
    objectTypeName: string,
    behaviorName: string,
    signal: AbortSignal,
  ) => Promise<BehaviorMutationResponse>
  test: (
    target: BehaviorExternalTestSnapshot,
    signal: AbortSignal,
  ) => Promise<unknown>
}

interface GenerationTarget {
  editorIdentity: number
  request: BehaviorCodeGenerationSnapshot
}

interface SaveTarget {
  editorIdentity: number
  mode: BehaviorEditorMode
  objectTypeName: string
  originalBehaviorName: string
  behavior: OntologyBehavior
}

interface TestTarget {
  editorIdentity: number
  request: BehaviorExternalTestSnapshot
}

interface DeleteTarget {
  editorIdentity: number
  objectTypeName: string
  behaviorName: string
}

const defaultDependencies: BehaviorEditorDependencies = {
  generate: (target, signal) =>
    behaviorApi.generateCode(target.prompt, target.language, signal),
  create: (objectTypeName, behavior, signal) =>
    behaviorApi.create(objectTypeName, behavior, signal),
  update: (objectTypeName, behaviorName, behavior, signal) =>
    behaviorApi.update(objectTypeName, behaviorName, behavior, signal),
  remove: (objectTypeName, behaviorName, signal) =>
    behaviorApi.remove(objectTypeName, behaviorName, signal),
  test: (target, signal) =>
    behaviorApi.testExternalEndpoint(
      target.endpoint,
      target.method,
      target.body,
      signal,
    ),
}

function isAbort(cause: unknown): boolean {
  return cause instanceof Error && cause.name === 'AbortError'
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback
}

export function useBehaviorEditor(
  input: {
    visible: MaybeRefOrGetter<boolean>
    mode: MaybeRefOrGetter<BehaviorEditorMode>
    objectTypeName: MaybeRefOrGetter<string>
    columns: MaybeRefOrGetter<readonly string[]>
    relatedObjectTypes: MaybeRefOrGetter<
      readonly RelatedBehaviorObjectType[] | undefined
    >
    behavior: MaybeRefOrGetter<OntologyBehavior | undefined>
  },
  dependencies: BehaviorEditorDependencies = defaultDependencies,
) {
  const draft = ref<BehaviorEditorDraft>(
    createBehaviorEditorDraft(undefined, toValue(input.columns)),
  )
  const generationPending = ref(false)
  const generationError = ref('')
  const savePending = ref(false)
  const saveError = ref('')
  const testPending = ref(false)
  const testError = ref('')
  const testResultText = ref('')
  const deleteDialogOpen = ref(false)
  const deletePending = ref(false)
  const deleteError = ref('')

  const failedGenerationTarget = ref<GenerationTarget | null>(null)
  const failedSaveTarget = ref<SaveTarget | null>(null)
  const failedTestTarget = ref<TestTarget | null>(null)
  const failedDeleteTarget = ref<DeleteTarget | null>(null)

  let editorIdentity = 0
  let generationSequence = 0
  let generationController: AbortController | null = null
  let saveSequence = 0
  let saveController: AbortController | null = null
  let testSequence = 0
  let testController: AbortController | null = null
  let deleteSequence = 0
  let deleteController: AbortController | null = null
  let resettingDraft = false

  const generationCanRetry = computed(() => failedGenerationTarget.value !== null)
  const saveCanRetry = computed(() => failedSaveTarget.value !== null)
  const testCanRetry = computed(() => failedTestTarget.value !== null)
  const deleteCanRetry = computed(() => failedDeleteTarget.value !== null)
  const isBusy = computed(() =>
    generationPending.value
    || savePending.value
    || testPending.value
    || deletePending.value,
  )

  function targetIsCurrent(target: { editorIdentity: number }): boolean {
    return target.editorIdentity === editorIdentity && toValue(input.visible)
  }

  function cancelGeneration(): void {
    generationController?.abort()
    generationController = null
    generationSequence += 1
    generationPending.value = false
  }

  function cancelSave(): void {
    saveController?.abort()
    saveController = null
    saveSequence += 1
    savePending.value = false
  }

  function cancelTest(): void {
    testController?.abort()
    testController = null
    testSequence += 1
    testPending.value = false
  }

  function cancelDelete(): void {
    deleteController?.abort()
    deleteController = null
    deleteSequence += 1
    deletePending.value = false
  }

  function cancelAllRequests(): void {
    cancelGeneration()
    cancelSave()
    cancelTest()
    cancelDelete()
  }

  function clearOperationState(): void {
    generationError.value = ''
    saveError.value = ''
    testError.value = ''
    testResultText.value = ''
    deleteDialogOpen.value = false
    deleteError.value = ''
    failedGenerationTarget.value = null
    failedSaveTarget.value = null
    failedTestTarget.value = null
    failedDeleteTarget.value = null
  }

  function resetEditor(): void {
    editorIdentity += 1
    cancelAllRequests()
    clearOperationState()
    resettingDraft = true
    draft.value = createBehaviorEditorDraft(
      toValue(input.mode) === 'edit' ? toValue(input.behavior) : undefined,
      toValue(input.columns),
    )
    resettingDraft = false
  }

  function closeEditor(): void {
    editorIdentity += 1
    cancelAllRequests()
    clearOperationState()
  }

  function toggleInputField(field: string): void {
    if (isBusy.value) return
    draft.value.inputFields = toggleBehaviorInputField(
      draft.value.inputFields,
      field,
    )
  }

  async function executeGeneration(target: GenerationTarget): Promise<boolean> {
    generationController?.abort()
    const controller = new AbortController()
    generationController = controller
    const sequence = ++generationSequence
    generationPending.value = true
    generationError.value = ''
    try {
      const response = await dependencies.generate(target.request, controller.signal)
      if (sequence !== generationSequence || !targetIsCurrent(target)) return false
      draft.value.pythonCode = normalizeGeneratedPythonCode(response.code)
      draft.value.behaviorType = 'python'
      failedGenerationTarget.value = null
      return true
    } catch (cause: unknown) {
      if (
        !isAbort(cause)
        && sequence === generationSequence
        && targetIsCurrent(target)
      ) {
        generationError.value = errorMessage(cause, '코드 생성에 실패했습니다.')
        failedGenerationTarget.value = target
      }
      return false
    } finally {
      if (sequence === generationSequence) {
        generationPending.value = false
        if (generationController === controller) generationController = null
      }
    }
  }

  function generatePythonCode(): Promise<boolean> {
    try {
      return executeGeneration({
        editorIdentity,
        request: buildBehaviorCodeGenerationSnapshot({
          objectTypeName: toValue(input.objectTypeName),
          columns: toValue(input.columns),
          relatedObjectTypes: toValue(input.relatedObjectTypes),
          description: draft.value.description,
        }),
      })
    } catch (cause: unknown) {
      generationError.value = errorMessage(
        cause,
        '코드 생성 요청을 만들지 못했습니다.',
      )
      failedGenerationTarget.value = null
      return Promise.resolve(false)
    }
  }

  function retryGeneration(): Promise<boolean> {
    return failedGenerationTarget.value
      ? executeGeneration(failedGenerationTarget.value)
      : Promise.resolve(false)
  }

  async function executeSave(target: SaveTarget): Promise<OntologyBehavior | null> {
    saveController?.abort()
    const controller = new AbortController()
    saveController = controller
    const sequence = ++saveSequence
    savePending.value = true
    saveError.value = ''
    try {
      const response = target.mode === 'edit'
        ? await dependencies.update(
            target.objectTypeName,
            target.originalBehaviorName,
            target.behavior,
            controller.signal,
          )
        : await dependencies.create(
            target.objectTypeName,
            target.behavior,
            controller.signal,
          )
      if (sequence !== saveSequence || !targetIsCurrent(target)) return null
      failedSaveTarget.value = null
      return response.behavior ?? target.behavior
    } catch (cause: unknown) {
      if (
        !isAbort(cause)
        && sequence === saveSequence
        && targetIsCurrent(target)
      ) {
        saveError.value = errorMessage(cause, 'Behavior 저장에 실패했습니다.')
        failedSaveTarget.value = target
      }
      return null
    } finally {
      if (sequence === saveSequence) {
        savePending.value = false
        if (saveController === controller) saveController = null
      }
    }
  }

  function saveBehavior(dmnXmlOverride?: string): Promise<OntologyBehavior | null> {
    try {
      const mode = toValue(input.mode)
      const originalBehaviorName = toValue(input.behavior)?.name ?? ''
      if (mode === 'edit' && !originalBehaviorName) {
        throw new Error('편집할 Behavior identity가 없습니다.')
      }
      return executeSave({
        editorIdentity,
        mode,
        objectTypeName: toValue(input.objectTypeName),
        originalBehaviorName,
        behavior: buildOntologyBehavior(draft.value, dmnXmlOverride),
      })
    } catch (cause: unknown) {
      saveError.value = errorMessage(
        cause,
        'Behavior 저장 요청을 만들지 못했습니다.',
      )
      failedSaveTarget.value = null
      return Promise.resolve(null)
    }
  }

  function retrySave(): Promise<OntologyBehavior | null> {
    return failedSaveTarget.value
      ? executeSave(failedSaveTarget.value)
      : Promise.resolve(null)
  }

  async function executeTest(target: TestTarget): Promise<boolean> {
    testController?.abort()
    const controller = new AbortController()
    testController = controller
    const sequence = ++testSequence
    testPending.value = true
    testError.value = ''
    testResultText.value = ''
    try {
      const response = await dependencies.test(target.request, controller.signal)
      if (sequence !== testSequence || !targetIsCurrent(target)) return false
      testResultText.value = formatBehaviorTestResult(response)
      failedTestTarget.value = null
      return true
    } catch (cause: unknown) {
      if (
        !isAbort(cause)
        && sequence === testSequence
        && targetIsCurrent(target)
      ) {
        testError.value = errorMessage(cause, 'Behavior 테스트에 실패했습니다.')
        failedTestTarget.value = target
      }
      return false
    } finally {
      if (sequence === testSequence) {
        testPending.value = false
        if (testController === controller) testController = null
      }
    }
  }

  function testBehavior(): Promise<boolean> {
    try {
      return executeTest({
        editorIdentity,
        request: buildBehaviorExternalTestSnapshot(draft.value),
      })
    } catch (cause: unknown) {
      testError.value = errorMessage(
        cause,
        'Behavior 테스트 요청을 만들지 못했습니다.',
      )
      failedTestTarget.value = null
      return Promise.resolve(false)
    }
  }

  function retryTest(): Promise<boolean> {
    return failedTestTarget.value
      ? executeTest(failedTestTarget.value)
      : Promise.resolve(false)
  }

  function requestDelete(): void {
    if (toValue(input.mode) !== 'edit' || isBusy.value) return
    const behaviorName = toValue(input.behavior)?.name
    if (!behaviorName) {
      deleteError.value = '삭제할 Behavior identity가 없습니다.'
      return
    }
    deleteError.value = ''
    failedDeleteTarget.value = null
    deleteDialogOpen.value = true
  }

  function dismissDelete(): void {
    if (deletePending.value) return
    deleteDialogOpen.value = false
    deleteError.value = ''
    failedDeleteTarget.value = null
  }

  async function executeDelete(target: DeleteTarget): Promise<string | null> {
    deleteController?.abort()
    const controller = new AbortController()
    deleteController = controller
    const sequence = ++deleteSequence
    deletePending.value = true
    deleteError.value = ''
    try {
      await dependencies.remove(
        target.objectTypeName,
        target.behaviorName,
        controller.signal,
      )
      if (sequence !== deleteSequence || !targetIsCurrent(target)) return null
      failedDeleteTarget.value = null
      deleteDialogOpen.value = false
      return target.behaviorName
    } catch (cause: unknown) {
      if (
        !isAbort(cause)
        && sequence === deleteSequence
        && targetIsCurrent(target)
      ) {
        deleteError.value = errorMessage(cause, 'Behavior 삭제에 실패했습니다.')
        failedDeleteTarget.value = target
      }
      return null
    } finally {
      if (sequence === deleteSequence) {
        deletePending.value = false
        if (deleteController === controller) deleteController = null
      }
    }
  }

  function confirmDelete(): Promise<string | null> {
    if (failedDeleteTarget.value && deleteError.value) {
      return executeDelete(failedDeleteTarget.value)
    }
    const behaviorName = toValue(input.behavior)?.name
    if (!behaviorName) {
      deleteError.value = '삭제할 Behavior identity가 없습니다.'
      return Promise.resolve(null)
    }
    return executeDelete({
      editorIdentity,
      objectTypeName: toValue(input.objectTypeName),
      behaviorName,
    })
  }

  watch(
    draft,
    () => {
      if (resettingDraft || isBusy.value) return
      generationError.value = ''
      saveError.value = ''
      testError.value = ''
      testResultText.value = ''
      failedGenerationTarget.value = null
      failedSaveTarget.value = null
      failedTestTarget.value = null
    },
    { deep: true },
  )

  watch(
    [
      () => toValue(input.visible),
      () => toValue(input.mode),
      () => toValue(input.objectTypeName),
      () => toValue(input.behavior),
    ],
    ([visible]) => {
      if (visible) resetEditor()
      else closeEditor()
    },
    { immediate: true },
  )

  onScopeDispose(() => {
    editorIdentity += 1
    cancelAllRequests()
  })

  return {
    draft,
    generationPending,
    generationError,
    generationCanRetry,
    savePending,
    saveError,
    saveCanRetry,
    testPending,
    testError,
    testCanRetry,
    testResultText,
    deleteDialogOpen,
    deletePending,
    deleteError,
    deleteCanRetry,
    isBusy,
    toggleInputField,
    generatePythonCode,
    retryGeneration,
    saveBehavior,
    retrySave,
    testBehavior,
    retryTest,
    requestDelete,
    dismissDelete,
    confirmDelete,
  }
}
