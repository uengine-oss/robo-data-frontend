import {
  computed,
  onScopeDispose,
  ref,
  type Ref,
} from 'vue'
import {
  objectExplorerApi,
  type OntologyFilterField,
  type OntologyNodeFilterValues,
} from '@/domains/ontology'
import {
  commitOntologyFilterDraft,
  createOntologyFilterDraft,
  getOntologyNodeFilterChips,
  projectOntologyFilters,
  type OntologyDirectFilters,
  type OntologyFilterRelationship,
} from '../application/ontologyFilterProjection'

export interface OntologyFilterTarget {
  id: string
  name: string
  dataSource?: string
  filterFields?: OntologyFilterField[]
}

export interface OntologyFilterValuesGateway {
  getNodeFilterValues: (
    nodeId: string,
    columns: readonly string[],
    signal?: AbortSignal,
  ) => Promise<OntologyNodeFilterValues>
}

export interface OntologyDistinctValuesState {
  phase: 'idle' | 'loading' | 'result' | 'failure'
  values: Record<string, Array<string | number | boolean>>
  error: string | null
}

interface DistinctValuesAttempt {
  nodeId: string
  columns: string[]
}

interface UseOntologyNodeFiltersOptions {
  relationships: Readonly<Ref<readonly OntologyFilterRelationship[]>>
  gateway?: OntologyFilterValuesGateway
}

const defaultGateway: OntologyFilterValuesGateway = {
  getNodeFilterValues: (nodeId, columns, signal) =>
    objectExplorerApi.getNodeFilterValues(nodeId, columns, signal),
}

function idleDistinctState(): OntologyDistinctValuesState {
  return { phase: 'idle', values: {}, error: null }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : '필터 선택값을 불러오지 못했습니다.'
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError'
}

function cloneTarget(target: OntologyFilterTarget): OntologyFilterTarget {
  return {
    ...target,
    filterFields: target.filterFields?.map(field => ({ ...field })),
  }
}

function distinctColumns(target: OntologyFilterTarget): string[] {
  if (!target.dataSource) return []
  return [...new Set(
    (target.filterFields ?? [])
      .filter(field =>
        field.type === 'select'
        || field.type === 'category'
        || field.type === 'search')
      .map(field => field.column)
      .filter(Boolean),
  )]
}

export function useOntologyNodeFilters({
  relationships,
  gateway = defaultGateway,
}: UseOntologyNodeFiltersOptions) {
  const directFilters = ref<OntologyDirectFilters>({})
  const target = ref<OntologyFilterTarget | null>(null)
  const draft = ref<Record<string, unknown>>({})
  const distinctState = ref<OntologyDistinctValuesState>(idleDistinctState())
  let requestVersion = 0
  let activeController: AbortController | null = null
  let retryAttempt: DistinctValuesAttempt | null = null

  const projection = computed(() =>
    projectOntologyFilters(directFilters.value, relationships.value))

  const cancelDistinctRequest = () => {
    activeController?.abort()
    activeController = null
    requestVersion += 1
  }

  const runDistinctAttempt = async (
    attemptInput: DistinctValuesAttempt,
  ): Promise<void> => {
    cancelDistinctRequest()
    const attempt = {
      nodeId: attemptInput.nodeId,
      columns: [...attemptInput.columns],
    }
    retryAttempt = attempt
    const controller = new AbortController()
    activeController = controller
    const version = requestVersion
    distinctState.value = {
      phase: 'loading',
      values: distinctState.value.values,
      error: null,
    }

    try {
      const result = await gateway.getNodeFilterValues(
        attempt.nodeId,
        attempt.columns,
        controller.signal,
      )
      if (
        requestVersion !== version
        || activeController !== controller
        || controller.signal.aborted
        || target.value?.id !== attempt.nodeId
      ) return
      distinctState.value = {
        phase: 'result',
        values: Object.fromEntries(
          Object.entries(result.distinctValues).map(([column, values]) => [
            column,
            [...values],
          ]),
        ),
        error: null,
      }
    } catch (error: unknown) {
      if (
        requestVersion !== version
        || activeController !== controller
        || controller.signal.aborted
        || isAbortError(error)
      ) return
      distinctState.value = {
        phase: 'failure',
        values: distinctState.value.values,
        error: getErrorMessage(error),
      }
    } finally {
      if (requestVersion === version && activeController === controller) {
        activeController = null
      }
    }
  }

  const open = async (targetInput: OntologyFilterTarget): Promise<void> => {
    cancelDistinctRequest()
    const nextTarget = cloneTarget(targetInput)
    target.value = nextTarget
    draft.value = createOntologyFilterDraft(
      nextTarget.id,
      directFilters.value,
    )
    distinctState.value = idleDistinctState()
    retryAttempt = null

    const columns = distinctColumns(nextTarget)
    if (columns.length > 0) {
      await runDistinctAttempt({ nodeId: nextTarget.id, columns })
    }
  }

  const close = (): void => {
    cancelDistinctRequest()
    retryAttempt = null
    target.value = null
    draft.value = {}
    distinctState.value = idleDistinctState()
  }

  const confirm = (): string | null => {
    const targetId = target.value?.id ?? null
    if (!targetId) return null
    directFilters.value = commitOntologyFilterDraft(
      directFilters.value,
      targetId,
      draft.value,
    )
    close()
    return targetId
  }

  const clearAll = (): string | null => {
    const targetId = target.value?.id ?? null
    directFilters.value = {}
    draft.value = {}
    return targetId
  }

  const removeNode = (nodeId: string): void => {
    if (!(nodeId in directFilters.value)) return
    const next = { ...directFilters.value }
    delete next[nodeId]
    directFilters.value = next
    if (target.value?.id === nodeId) close()
  }

  const retryDistinctValues = async (): Promise<void> => {
    if (!retryAttempt || target.value?.id !== retryAttempt.nodeId) return
    await runDistinctAttempt(retryAttempt)
  }

  const reset = (): void => {
    close()
    directFilters.value = {}
  }

  onScopeDispose(reset)

  return {
    directFilters,
    filterTarget: target,
    filterDraft: draft,
    filterProjection: projection,
    nodeFilters: computed(() => projection.value.effective),
    cascadingFilters: computed(() => projection.value.cascading),
    filterConflicts: computed(() => projection.value.conflicts),
    hasActiveFilters: computed(
      () => Object.keys(projection.value.direct).length > 0,
    ),
    distinctState,
    filterDistinctValues: computed(() => distinctState.value.values),
    filterDistinctLoading: computed(
      () => distinctState.value.phase === 'loading',
    ),
    filterDistinctError: computed(() => distinctState.value.error),
    open,
    close,
    confirm,
    clearAll,
    removeNode,
    retryDistinctValues,
    reset,
    getNodeFilterChips: (nodeId: string) =>
      getOntologyNodeFilterChips(nodeId, projection.value),
  }
}
