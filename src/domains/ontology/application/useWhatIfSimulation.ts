import {
  computed,
  onScopeDispose,
  ref,
  toValue,
  watch,
  type MaybeRefOrGetter,
} from 'vue'
import { useManagedTimeouts } from '@/shared/composables/useManagedTimeouts'
import {
  whatifDomainApi,
  type CreateScenarioProfileRequest,
  type SimulateResponse,
  type SnapshotResponse,
  type WhatIfScenarioProfileResponse,
} from '../api/whatIfModeling'
import {
  cloneWhatIfFilters,
  createProfileSaveSnapshot,
  createSimulationRequestSnapshot,
  projectChangedSimulationVariables,
  whatIfFilterFingerprint,
  type ProfileSaveSnapshot,
  type SimulationRequestSnapshot,
  type WhatIfFilters,
} from './simulationPolicy'

export interface WhatIfSimulationDependencies {
  snapshot: (
    schemaId: string,
    date: string | undefined,
    filters: WhatIfFilters,
    signal: AbortSignal,
  ) => Promise<SnapshotResponse>
  simulate: (
    request: SimulationRequestSnapshot,
    signal: AbortSignal,
  ) => Promise<SimulateResponse>
  saveProfile: (
    request: CreateScenarioProfileRequest,
    signal: AbortSignal,
  ) => Promise<WhatIfScenarioProfileResponse>
}

interface SnapshotRequestTarget {
  schemaId: string
  date?: string
  filters: WhatIfFilters
  filterFingerprint: string
}

const defaultDependencies: WhatIfSimulationDependencies = {
  snapshot: (schemaId, date, filters, signal) =>
    whatifDomainApi.getSnapshot(schemaId, date, filters, signal),
  simulate: (request, signal) =>
    whatifDomainApi.simulate(
      request.schemaId,
      request.scenarioName,
      request.interventions,
      request.snapshotDate,
      request.filters,
      signal,
    ),
  saveProfile: (request, signal) =>
    whatifDomainApi.createScenarioProfile(request, signal),
}

function isAbort(cause: unknown): boolean {
  return cause instanceof Error && cause.name === 'AbortError'
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback
}

export function useWhatIfSimulation(
  input: {
    schemaId: MaybeRefOrGetter<string>
    filters: MaybeRefOrGetter<WhatIfFilters | undefined>
  },
  dependencies: WhatIfSimulationDependencies = defaultDependencies,
) {
  const snapshotData = ref<SnapshotResponse | null>(null)
  const selectedDate = ref('')
  const originalSnapshot = ref<Record<string, number>>({})
  const editableSnapshot = ref<Record<string, number>>({})
  const snapshotPending = ref(false)
  const snapshotError = ref('')

  const simulationResult = ref<SimulateResponse | null>(null)
  const simulationPending = ref(false)
  const simulationError = ref('')
  const showZeroDeltaTraces = ref(false)

  const showProfileForm = ref(false)
  const profileName = ref('')
  const profileDescription = ref('')
  const profilePending = ref(false)
  const profileError = ref('')
  const profileSuccess = ref('')

  const timers = useManagedTimeouts()
  let snapshotSequence = 0
  let snapshotController: AbortController | null = null
  let simulationSequence = 0
  let simulationController: AbortController | null = null
  let profileSequence = 0
  let profileController: AbortController | null = null
  const failedSnapshotTarget = ref<SnapshotRequestTarget | null>(null)
  const failedSimulationTarget = ref<SimulationRequestSnapshot | null>(null)
  const failedProfileTarget = ref<ProfileSaveSnapshot | null>(null)

  const changedVariables = computed(() =>
    projectChangedSimulationVariables(
      originalSnapshot.value,
      editableSnapshot.value,
    ),
  )
  const availableDates = computed(() => snapshotData.value?.available_dates ?? [])
  const snapshotCanRetry = computed(() => failedSnapshotTarget.value !== null)
  const simulationCanRetry = computed(() => failedSimulationTarget.value !== null)
  const profileCanRetry = computed(() => failedProfileTarget.value !== null)
  const currentFilterFingerprint = computed(() =>
    whatIfFilterFingerprint(toValue(input.filters)),
  )
  const contextKey = computed(() =>
    `${toValue(input.schemaId)}\u0000${currentFilterFingerprint.value}`,
  )

  function currentSchemaId(): string {
    return toValue(input.schemaId)
  }

  function currentFilters(): WhatIfFilters {
    return cloneWhatIfFilters(toValue(input.filters))
  }

  function contextMatches(target: {
    schemaId: string
    filterFingerprint?: string
    filters?: WhatIfFilters
  }): boolean {
    const targetFingerprint = target.filterFingerprint
      ?? whatIfFilterFingerprint(target.filters)
    return target.schemaId === currentSchemaId()
      && targetFingerprint === currentFilterFingerprint.value
  }

  function cancelSnapshotRequest(): void {
    snapshotController?.abort()
    snapshotController = null
    snapshotSequence += 1
    snapshotPending.value = false
  }

  function cancelSimulationRequest(): void {
    simulationController?.abort()
    simulationController = null
    simulationSequence += 1
    simulationPending.value = false
  }

  function cancelProfileRequest(): void {
    profileController?.abort()
    profileController = null
    profileSequence += 1
    profilePending.value = false
  }

  function clearProfileState(): void {
    cancelProfileRequest()
    timers.cancel('whatif-profile-success')
    showProfileForm.value = false
    profileName.value = ''
    profileDescription.value = ''
    profileError.value = ''
    profileSuccess.value = ''
    failedProfileTarget.value = null
  }

  function clearContextState(): void {
    cancelSnapshotRequest()
    cancelSimulationRequest()
    clearProfileState()
    snapshotData.value = null
    selectedDate.value = ''
    originalSnapshot.value = {}
    editableSnapshot.value = {}
    snapshotError.value = ''
    simulationResult.value = null
    simulationError.value = ''
    showZeroDeltaTraces.value = false
    failedSnapshotTarget.value = null
    failedSimulationTarget.value = null
  }

  async function loadSnapshotTarget(target: SnapshotRequestTarget): Promise<boolean> {
    snapshotController?.abort()
    cancelSimulationRequest()
    cancelProfileRequest()
    const controller = new AbortController()
    snapshotController = controller
    const sequence = ++snapshotSequence
    snapshotPending.value = true
    snapshotError.value = ''
    try {
      const response = await dependencies.snapshot(
        target.schemaId,
        target.date,
        target.filters,
        controller.signal,
      )
      if (sequence !== snapshotSequence || !contextMatches(target)) return false
      snapshotData.value = response
      selectedDate.value = response.date
      originalSnapshot.value = { ...response.snapshot }
      editableSnapshot.value = { ...response.snapshot }
      simulationResult.value = null
      simulationError.value = ''
      showZeroDeltaTraces.value = false
      clearProfileState()
      failedSnapshotTarget.value = null
      failedSimulationTarget.value = null
      return true
    } catch (cause: unknown) {
      if (
        !isAbort(cause)
        && sequence === snapshotSequence
        && contextMatches(target)
      ) {
        snapshotError.value = errorMessage(
          cause,
          '시뮬레이션 스냅샷을 불러오지 못했습니다.',
        )
        failedSnapshotTarget.value = target
      }
      return false
    } finally {
      if (sequence === snapshotSequence) {
        snapshotPending.value = false
        if (snapshotController === controller) snapshotController = null
      }
    }
  }

  function loadSnapshot(date?: string): Promise<boolean> {
    const schemaId = currentSchemaId()
    if (!schemaId) return Promise.resolve(false)
    const filters = currentFilters()
    return loadSnapshotTarget({
      schemaId,
      ...(date ? { date } : {}),
      filters,
      filterFingerprint: whatIfFilterFingerprint(filters),
    })
  }

  function retrySnapshot(): Promise<boolean> {
    return failedSnapshotTarget.value
      ? loadSnapshotTarget(failedSnapshotTarget.value)
      : Promise.resolve(false)
  }

  function setSnapshotValue(key: string, rawValue: string): void {
    if (snapshotPending.value || simulationPending.value) return
    const parsed = rawValue.trim() === '' ? 0 : Number(rawValue)
    editableSnapshot.value[key] = Number.isFinite(parsed) ? parsed : 0
    simulationError.value = ''
    failedSimulationTarget.value = null
  }

  function resetSnapshot(): void {
    if (snapshotPending.value || simulationPending.value) return
    editableSnapshot.value = { ...originalSnapshot.value }
    simulationError.value = ''
    failedSimulationTarget.value = null
  }

  async function executeSimulation(
    target: SimulationRequestSnapshot,
  ): Promise<boolean> {
    simulationController?.abort()
    const controller = new AbortController()
    simulationController = controller
    const sequence = ++simulationSequence
    simulationPending.value = true
    simulationError.value = ''
    simulationResult.value = null
    showZeroDeltaTraces.value = false
    clearProfileState()
    try {
      const response = await dependencies.simulate(target, controller.signal)
      if (
        sequence !== simulationSequence
        || !contextMatches(target)
        || selectedDate.value !== target.snapshotDate
      ) return false
      simulationResult.value = response
      failedSimulationTarget.value = null
      return true
    } catch (cause: unknown) {
      if (
        !isAbort(cause)
        && sequence === simulationSequence
        && contextMatches(target)
        && selectedDate.value === target.snapshotDate
      ) {
        simulationError.value = errorMessage(
          cause,
          'What-If 시뮬레이션을 실행하지 못했습니다.',
        )
        failedSimulationTarget.value = target
      }
      return false
    } finally {
      if (sequence === simulationSequence) {
        simulationPending.value = false
        if (simulationController === controller) simulationController = null
      }
    }
  }

  function runSimulation(): Promise<boolean> {
    try {
      const target = createSimulationRequestSnapshot({
        schemaId: currentSchemaId(),
        snapshotDate: selectedDate.value,
        filters: currentFilters(),
        changedVariables: changedVariables.value,
      })
      return executeSimulation(target)
    } catch (cause: unknown) {
      simulationError.value = errorMessage(
        cause,
        'What-If 시뮬레이션 요청을 만들지 못했습니다.',
      )
      return Promise.resolve(false)
    }
  }

  function retrySimulation(): Promise<boolean> {
    return failedSimulationTarget.value
      ? executeSimulation(failedSimulationTarget.value)
      : Promise.resolve(false)
  }

  function openProfileEditor(): void {
    timers.cancel('whatif-profile-success')
    showProfileForm.value = true
    profileError.value = ''
    profileSuccess.value = ''
    failedProfileTarget.value = null
  }

  function closeProfileEditor(): void {
    if (profilePending.value) return
    timers.cancel('whatif-profile-success')
    showProfileForm.value = false
    profileError.value = ''
    profileSuccess.value = ''
    failedProfileTarget.value = null
  }

  async function executeProfileSave(target: ProfileSaveSnapshot): Promise<boolean> {
    const result = simulationResult.value
    if (
      !result
      || result.executed_at !== target.resultExecutedAt
      || result.schema_id !== currentSchemaId()
    ) return false
    profileController?.abort()
    const controller = new AbortController()
    profileController = controller
    const sequence = ++profileSequence
    profilePending.value = true
    profileError.value = ''
    profileSuccess.value = ''
    try {
      const response = await dependencies.saveProfile(
        target.request,
        controller.signal,
      )
      if (
        sequence !== profileSequence
        || simulationResult.value?.executed_at !== target.resultExecutedAt
        || response.schemaId !== currentSchemaId()
      ) return false
      profileSuccess.value =
        `✅ 프로필 "${response.name}"이(가) 저장되었습니다. Watch Agent에서 사용할 수 있습니다.`
      failedProfileTarget.value = null
      timers.schedule('whatif-profile-success', () => {
        showProfileForm.value = false
        profileSuccess.value = ''
        profileName.value = ''
        profileDescription.value = ''
      }, 3000)
      return true
    } catch (cause: unknown) {
      if (
        !isAbort(cause)
        && sequence === profileSequence
        && simulationResult.value?.executed_at === target.resultExecutedAt
      ) {
        profileError.value = errorMessage(
          cause,
          '시뮬레이션 프로필을 저장하지 못했습니다.',
        )
        failedProfileTarget.value = target
      }
      return false
    } finally {
      if (sequence === profileSequence) {
        profilePending.value = false
        if (profileController === controller) profileController = null
      }
    }
  }

  function saveProfile(): Promise<boolean> {
    if (failedProfileTarget.value && profileError.value) {
      return executeProfileSave(failedProfileTarget.value)
    }
    const result = simulationResult.value
    if (!result) return Promise.resolve(false)
    try {
      return executeProfileSave(createProfileSaveSnapshot({
        name: profileName.value,
        description: profileDescription.value,
        result,
      }))
    } catch (cause: unknown) {
      profileError.value = errorMessage(
        cause,
        '시뮬레이션 프로필 요청을 만들지 못했습니다.',
      )
      return Promise.resolve(false)
    }
  }

  watch([profileName, profileDescription], () => {
    if (profilePending.value) return
    timers.cancel('whatif-profile-success')
    profileError.value = ''
    profileSuccess.value = ''
    failedProfileTarget.value = null
  })

  watch(
    contextKey,
    nextContext => {
      clearContextState()
      if (nextContext.split('\u0000')[0]) void loadSnapshot()
    },
    { immediate: true },
  )

  onScopeDispose(() => {
    cancelSnapshotRequest()
    cancelSimulationRequest()
    cancelProfileRequest()
  })

  return {
    snapshotData,
    selectedDate,
    availableDates,
    originalSnapshot,
    editableSnapshot,
    changedVariables,
    snapshotPending,
    snapshotError,
    snapshotCanRetry,
    simulationResult,
    simulationPending,
    simulationError,
    simulationCanRetry,
    showZeroDeltaTraces,
    showProfileForm,
    profileName,
    profileDescription,
    profilePending,
    profileError,
    profileSuccess,
    profileCanRetry,
    loadSnapshot,
    retrySnapshot,
    setSnapshotValue,
    resetSnapshot,
    runSimulation,
    retrySimulation,
    openProfileEditor,
    closeProfileEditor,
    saveProfile,
  }
}
