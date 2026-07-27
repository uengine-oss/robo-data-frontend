import {
  computed,
  onScopeDispose,
  ref,
  type Ref,
} from 'vue'
import {
  objectExplorerApi,
  type OntologyNodeDataResult,
} from '@/domains/ontology'
import {
  text2sqlApi,
  type DirectSqlResponse,
} from '@/domains/text2sql'
import {
  buildOntologyNodeDataQuery,
  buildText2SqlNodeDataRequest,
  createOntologyNodeDataTarget,
  createUnavailableNodeDataResult,
  projectText2SqlNodeData,
  type OntologyNodeDataTarget,
  type OntologyNodeDataTargetInput,
  type Text2SqlNodeDataRequest,
} from '../application/nodeDataRetrieval'

export type OntologyNodeDataPhase =
  | 'idle'
  | 'loading'
  | 'result'
  | 'unavailable'
  | 'failure'

export interface OntologyNodeDataViewState {
  phase: OntologyNodeDataPhase
  source: 'ontology' | 'text2sql' | null
  targetId: string | null
  result: OntologyNodeDataResult | null
  error: string | null
  text2SqlFallbackAvailable: boolean
}

export interface OntologyNodeDataGateway {
  getNodeData: (
    nodeId: string,
    query?: string,
    signal?: AbortSignal,
  ) => Promise<OntologyNodeDataResult>
  directSql: (
    request: Text2SqlNodeDataRequest,
    signal?: AbortSignal,
  ) => Promise<DirectSqlResponse>
}

interface UseOntologyNodeDataOptions {
  resolveTarget: (nodeId: string) => OntologyNodeDataTargetInput | null
  getEffectiveFilters: (nodeId: string) => Record<string, unknown>
  businessDayFilterEnabled: Readonly<Ref<boolean>>
  gateway?: OntologyNodeDataGateway
}

interface OntologyRetryAttempt {
  source: 'ontology'
  target: OntologyNodeDataTarget
  query: string
}

interface Text2SqlRetryAttempt {
  source: 'text2sql'
  target: OntologyNodeDataTarget
  request: Text2SqlNodeDataRequest
}

type RetryAttempt = OntologyRetryAttempt | Text2SqlRetryAttempt

const gatewayDefaults: OntologyNodeDataGateway = {
  getNodeData: (nodeId, query, signal) =>
    objectExplorerApi.getNodeData(nodeId, query, signal),
  directSql: (request, signal) =>
    text2sqlApi.directSql(request, signal),
}

function idleState(): OntologyNodeDataViewState {
  return {
    phase: 'idle',
    source: null,
    targetId: null,
    result: null,
    error: null,
    text2SqlFallbackAvailable: false,
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : '알 수 없는 오류'
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError'
}

function cloneTarget(target: OntologyNodeDataTarget): OntologyNodeDataTarget {
  return {
    ...target,
    dataSourceSchema: target.dataSourceSchema
      ? {
          ...target.dataSourceSchema,
          columns: target.dataSourceSchema.columns
            ? [...target.dataSourceSchema.columns]
            : undefined,
        }
      : null,
  }
}

export function useOntologyNodeData({
  resolveTarget,
  getEffectiveFilters,
  businessDayFilterEnabled,
  gateway = gatewayDefaults,
}: UseOntologyNodeDataOptions) {
  const state = ref<OntologyNodeDataViewState>(idleState())
  let requestVersion = 0
  let activeController: AbortController | null = null
  let lastTarget: OntologyNodeDataTarget | null = null
  let retryAttempt: RetryAttempt | null = null

  const beginRequest = (
    source: 'ontology' | 'text2sql',
    target: OntologyNodeDataTarget,
  ) => {
    activeController?.abort()
    const controller = new AbortController()
    activeController = controller
    const version = ++requestVersion
    state.value = {
      phase: 'loading',
      source,
      targetId: target.id,
      result: state.value.targetId === target.id ? state.value.result : null,
      error: null,
      text2SqlFallbackAvailable:
        source === 'text2sql' && state.value.targetId === target.id,
    }
    return { controller, version }
  }

  const isCurrent = (version: number, controller: AbortController) =>
    requestVersion === version
    && activeController === controller
    && !controller.signal.aborted

  const finishRequest = (version: number, controller: AbortController) => {
    if (requestVersion === version && activeController === controller) {
      activeController = null
    }
  }

  const runOntologyAttempt = async (
    targetInput: OntologyNodeDataTarget,
    query: string,
  ): Promise<void> => {
    const target = cloneTarget(targetInput)
    lastTarget = target
    retryAttempt = { source: 'ontology', target: cloneTarget(target), query }
    const { controller, version } = beginRequest('ontology', target)

    try {
      const result = await gateway.getNodeData(target.id, query, controller.signal)
      if (!isCurrent(version, controller)) return

      if (result.hasDataSource) {
        state.value = {
          phase: 'result',
          source: 'ontology',
          targetId: target.id,
          result,
          error: null,
          text2SqlFallbackAvailable: false,
        }
        return
      }

      const message = result.message
        || '온톨로지 API가 이 노드의 데이터를 제공하지 못했습니다.'
      state.value = {
        phase: 'unavailable',
        source: 'ontology',
        targetId: target.id,
        result: { ...result, message },
        error: `온톨로지 API: ${message}`,
        text2SqlFallbackAvailable: true,
      }
    } catch (error: unknown) {
      if (!isCurrent(version, controller) || isAbortError(error)) return
      const message = errorMessage(error)
      state.value = {
        phase: 'failure',
        source: 'ontology',
        targetId: target.id,
        result: createUnavailableNodeDataResult(target, message),
        error: `온톨로지 API: ${message}`,
        text2SqlFallbackAvailable: true,
      }
    } finally {
      finishRequest(version, controller)
    }
  }

  const runText2SqlAttempt = async (
    targetInput: OntologyNodeDataTarget,
    requestInput: Text2SqlNodeDataRequest,
  ): Promise<void> => {
    const target = cloneTarget(targetInput)
    const request = { ...requestInput }
    lastTarget = target
    retryAttempt = {
      source: 'text2sql',
      target: cloneTarget(target),
      request: { ...request },
    }
    const { controller, version } = beginRequest('text2sql', target)

    try {
      const response = await gateway.directSql(request, controller.signal)
      if (!isCurrent(version, controller)) return
      state.value = {
        phase: 'result',
        source: 'text2sql',
        targetId: target.id,
        result: projectText2SqlNodeData(target, response),
        error: null,
        text2SqlFallbackAvailable: false,
      }
    } catch (error: unknown) {
      if (!isCurrent(version, controller) || isAbortError(error)) return
      const message = errorMessage(error)
      state.value = {
        phase: 'failure',
        source: 'text2sql',
        targetId: target.id,
        result: state.value.result
          ?? createUnavailableNodeDataResult(target, message),
        error: `Text2SQL: ${message}`,
        text2SqlFallbackAvailable: true,
      }
    } finally {
      finishRequest(version, controller)
    }
  }

  const load = async (nodeId: string): Promise<void> => {
    const resolved = resolveTarget(nodeId)
    activeController?.abort()
    ++requestVersion

    if (!resolved) {
      lastTarget = null
      retryAttempt = null
      state.value = {
        ...idleState(),
        phase: 'failure',
        targetId: nodeId,
        error: '선택한 노드를 찾을 수 없습니다.',
      }
      return
    }

    const target = createOntologyNodeDataTarget(resolved)
    lastTarget = target
    if (!target.dataSource) {
      retryAttempt = null
      state.value = {
        phase: 'unavailable',
        source: null,
        targetId: target.id,
        result: createUnavailableNodeDataResult(target),
        error: null,
        text2SqlFallbackAvailable: false,
      }
      return
    }

    const query = buildOntologyNodeDataQuery(
      getEffectiveFilters(nodeId),
      businessDayFilterEnabled.value,
    )
    await runOntologyAttempt(target, query)
  }

  const loadViaText2Sql = async (): Promise<void> => {
    if (!lastTarget) return
    try {
      const request = buildText2SqlNodeDataRequest(lastTarget)
      await runText2SqlAttempt(lastTarget, request)
    } catch (error: unknown) {
      state.value = {
        phase: 'failure',
        source: 'text2sql',
        targetId: lastTarget.id,
        result: state.value.result
          ?? createUnavailableNodeDataResult(lastTarget),
        error: `Text2SQL: ${errorMessage(error)}`,
        text2SqlFallbackAvailable: true,
      }
    }
  }

  const retry = async (): Promise<void> => {
    if (!retryAttempt) return
    if (retryAttempt.source === 'ontology') {
      await runOntologyAttempt(retryAttempt.target, retryAttempt.query)
      return
    }
    await runText2SqlAttempt(retryAttempt.target, retryAttempt.request)
  }

  const reset = (): void => {
    activeController?.abort()
    activeController = null
    ++requestVersion
    lastTarget = null
    retryAttempt = null
    state.value = idleState()
  }

  onScopeDispose(reset)

  return {
    nodeDataState: state,
    nodeDataLoading: computed(() => state.value.phase === 'loading'),
    nodeDataResult: computed(() => state.value.result),
    lastDataError: computed(() => state.value.error),
    text2SqlFallbackAvailable: computed(
      () => state.value.text2SqlFallbackAvailable,
    ),
    load,
    loadViaText2Sql,
    retry,
    reset,
  }
}
