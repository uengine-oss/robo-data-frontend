import {
  objectExplorerApi,
  type AutoLinkDatasourceEvent,
  type DatasourceMapping,
  type NodeSearchCandidate,
} from '@/domains/ontology'
import {
  computed,
  onScopeDispose,
  ref,
  type Ref,
} from 'vue'
import { logger } from '@/shared/utils/logger'
import {
  createBulkDatasourceConfirmationTargets,
  createDatasourceConfirmationTarget,
  projectBulkDatasourceConfirmation,
  type DatasourceConfirmationAttempt,
  type DatasourceConfirmationTarget,
} from '../application/datasourceConfirmation'
import {
  cloneDatasourceMappings,
  createDatasourceLinkingProgress,
  createDatasourceMappingNodeSnapshots,
  datasourceConfirmationTargetKey,
  datasourceMappingStatusIcon,
  formatDatasourceSampleValue,
  getDatasourceMappingStats,
  projectConfirmedDatasourceMapping,
  projectDatasourceLinkingProgress,
  sameDatasourceConfirmationTarget,
  toggleExpandedDatasourceCandidate,
  type DatasourceLinkingProgress,
} from '../application/datasourceMappingWorkspace'

interface DatasourceMappingNode {
  id: string
  name: string
  label: string
  layer?: string
  description?: string
}

export interface OntologyDatasourceMappingClient {
  autoLinkDatasourceStream(
    body: unknown,
    onEvent: (event: AutoLinkDatasourceEvent) => void,
    signal?: AbortSignal,
  ): Promise<void>
  confirmDatasource(body: unknown): Promise<{ success: true }>
}

interface UseOntologyDatasourceMappingInput<
  TNode extends DatasourceMappingNode,
> {
  nodes: Ref<TNode[]>
  getNodeName: (nodeId: string) => string
  applyConfirmedMapping: (
    target: DatasourceConfirmationTarget,
  ) => Promise<string | null> | string | null
  client?: OntologyDatasourceMappingClient
}

interface ActiveConfirmation {
  key: string
  promise: Promise<string | null>
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function useOntologyDatasourceMapping<
  TNode extends DatasourceMappingNode,
>(input: UseOntologyDatasourceMappingInput<TNode>) {
  const client = input.client ?? objectExplorerApi

  const showDataSourceDialog = ref(false)
  const linkingDataSources = ref(false)
  const autoLinkError = ref<string | null>(null)
  const dataSourceMappingNotice = ref<string | null>(null)
  const dataSourceMappingWarning = ref<string | null>(null)
  const dataSourceMappings = ref<Record<string, DatasourceMapping>>({})
  const linkingProgress = ref<DatasourceLinkingProgress>(
    createDatasourceLinkingProgress([]),
  )
  const selectedMappingNodeId = ref<string | null>(null)
  const expandedCandidates = ref<Set<string>>(new Set())
  const mappingConfirmPendingIds = ref<Set<string>>(new Set())
  const mappingConfirmErrors = ref<Record<string, string>>({})
  const bulkConfirmTargets = ref<DatasourceConfirmationTarget[]>([])
  const bulkConfirmOriginalCount = ref(0)
  const bulkConfirmSucceededCount = ref(0)
  const bulkConfirmPending = ref(false)
  const bulkConfirmError = ref<string | null>(null)

  let disposed = false
  let autoLinkSequence = 0
  let autoLinkController: AbortController | null = null
  const applicationRetryTargets =
    new Map<string, DatasourceConfirmationTarget>()
  const activeConfirmations = new Map<string, ActiveConfirmation>()

  const bulkConfirmDialogMessage = computed(() => {
    const remaining = bulkConfirmTargets.value.length
    if (bulkConfirmSucceededCount.value > 0) {
      return `${bulkConfirmSucceededCount.value}개 노드는 확정되었습니다.\n실패한 ${remaining}개 노드만 다시 확정하시겠습니까?`
    }
    return `${remaining}개 노드의 선택된 데이터 소스를 확정하시겠습니까?`
  })
  const dataSourceDialogBusy = computed(
    () => linkingDataSources.value
      || mappingConfirmPendingIds.value.size > 0,
  )
  const dataSourceDialogCloseBlocked = computed(
    () => mappingConfirmPendingIds.value.size > 0,
  )

  function invalidateAutoLink(): void {
    autoLinkSequence += 1
    autoLinkController?.abort()
    autoLinkController = null
    linkingDataSources.value = false
  }

  function openDataSourceMappingDialog(nodeId: string | null = null): void {
    showDataSourceDialog.value = true
    if (nodeId) selectedMappingNodeId.value = nodeId
  }

  function closeDataSourceMappingDialog(): void {
    if (dataSourceDialogCloseBlocked.value) return
    invalidateAutoLink()
    showDataSourceDialog.value = false
  }

  async function autoLinkDataSources(): Promise<void> {
    openDataSourceMappingDialog()
    invalidateAutoLink()
    autoLinkError.value = null
    dataSourceMappingNotice.value = null
    dataSourceMappingWarning.value = null
    expandedCandidates.value = new Set()

    const nodeSnapshots = createDatasourceMappingNodeSnapshots(
      input.nodes.value,
    )
    if (nodeSnapshots.length === 0) {
      dataSourceMappings.value = {}
      linkingProgress.value = createDatasourceLinkingProgress([])
      autoLinkError.value = '먼저 온톨로지를 생성하거나 로드하세요.'
      return
    }

    const sequence = ++autoLinkSequence
    const controller = new AbortController()
    autoLinkController = controller
    linkingDataSources.value = true
    dataSourceMappings.value = {}
    linkingProgress.value = createDatasourceLinkingProgress(nodeSnapshots)

    try {
      await client.autoLinkDatasourceStream(
        { nodes: nodeSnapshots },
        event => {
          if (
            disposed
            || controller.signal.aborted
            || sequence !== autoLinkSequence
          ) return
          if (event.type === 'progress') {
            linkingProgress.value = projectDatasourceLinkingProgress(
              linkingProgress.value,
              event,
            )
          } else if (event.type === 'result') {
            dataSourceMappings.value = cloneDatasourceMappings(
              event.data.mappings ?? {},
            )
          }
        },
        controller.signal,
      )
    } catch (error: unknown) {
      if (
        disposed
        || controller.signal.aborted
        || sequence !== autoLinkSequence
        || isAbortError(error)
      ) return
      logger.error('Auto-link error:', error)
      autoLinkError.value = errorMessage(
        error,
        '데이터 소스 자동 연결 중 오류가 발생했습니다.',
      )
    } finally {
      if (!disposed && sequence === autoLinkSequence) {
        linkingDataSources.value = false
        autoLinkController = null
      }
    }
  }

  function toggleCandidateExpanded(
    nodeId: string,
    candidateIndex: number,
  ): void {
    expandedCandidates.value = toggleExpandedDatasourceCandidate(
      expandedCandidates.value,
      nodeId,
      candidateIndex,
    )
  }

  function setMappingConfirmPending(
    nodeId: string,
    pending: boolean,
  ): void {
    const next = new Set(mappingConfirmPendingIds.value)
    if (pending) next.add(nodeId)
    else next.delete(nodeId)
    mappingConfirmPendingIds.value = next
  }

  function setMappingConfirmError(
    nodeId: string,
    message: string | null,
  ): void {
    const next = { ...mappingConfirmErrors.value }
    if (message) next[nodeId] = message
    else delete next[nodeId]
    mappingConfirmErrors.value = next
  }

  async function runConfirmation(
    targetInput: DatasourceConfirmationTarget,
  ): Promise<string | null> {
    const target = createDatasourceConfirmationTarget(
      targetInput.nodeId,
      targetInput.candidate,
    )
    const key = datasourceConfirmationTargetKey(target)
    const active = activeConfirmations.get(target.nodeId)
    if (active) {
      if (active.key === key) return active.promise
      throw new Error(
        `${input.getNodeName(target.nodeId)}의 다른 데이터 소스 확정이 진행 중입니다.`,
      )
    }

    const promise = (async () => {
      const applicationRetry = applicationRetryTargets.get(target.nodeId)
      const retryApplicationOnly = applicationRetry
        && sameDatasourceConfirmationTarget(applicationRetry, target)

      if (!retryApplicationOnly) {
        await client.confirmDatasource({
          node_id: target.nodeId,
          candidate: target.candidate,
        })
      }
      if (disposed) {
        throw new Error('데이터 소스 확정 화면이 종료되었습니다.')
      }

      try {
        const warning = await input.applyConfirmedMapping(target)
        applicationRetryTargets.delete(target.nodeId)
        dataSourceMappings.value = projectConfirmedDatasourceMapping(
          dataSourceMappings.value,
          target,
        )
        return warning
      } catch (error: unknown) {
        applicationRetryTargets.set(
          target.nodeId,
          createDatasourceConfirmationTarget(
            target.nodeId,
            target.candidate,
          ),
        )
        throw new Error(
          `서버 확정은 완료됐지만 화면 반영에 실패했습니다. ${errorMessage(
            error,
            '같은 대상을 다시 시도해주세요.',
          )}`,
        )
      }
    })()

    activeConfirmations.set(target.nodeId, { key, promise })
    try {
      return await promise
    } finally {
      const current = activeConfirmations.get(target.nodeId)
      if (current?.promise === promise) {
        activeConfirmations.delete(target.nodeId)
      }
    }
  }

  function reportConfirmationSuccess(
    nodeId: string,
    warning: string | null,
  ): void {
    dataSourceMappingNotice.value =
      `${input.getNodeName(nodeId)}의 데이터 소스가 확정되었습니다.`
    dataSourceMappingWarning.value = warning
  }

  async function confirmMappingTarget(
    target: DatasourceConfirmationTarget,
  ): Promise<string | null> {
    const warning = await runConfirmation(target)
    if (!disposed) reportConfirmationSuccess(target.nodeId, warning)
    return warning
  }

  async function confirmMappingCandidate(
    nodeId: string,
    candidate: NodeSearchCandidate,
  ): Promise<void> {
    if (mappingConfirmPendingIds.value.has(nodeId)) return

    const target = createDatasourceConfirmationTarget(nodeId, candidate)
    setMappingConfirmPending(nodeId, true)
    setMappingConfirmError(nodeId, null)
    dataSourceMappingNotice.value = null
    dataSourceMappingWarning.value = null
    try {
      const warning = await runConfirmation(target)
      if (!disposed) reportConfirmationSuccess(nodeId, warning)
    } catch (error: unknown) {
      if (!disposed) {
        setMappingConfirmError(
          nodeId,
          errorMessage(error, '데이터 소스 확정에 실패했습니다.'),
        )
      }
    } finally {
      if (!disposed) setMappingConfirmPending(nodeId, false)
    }
  }

  function openBulkDatasourceConfirmation(): void {
    const targets = createBulkDatasourceConfirmationTargets(
      dataSourceMappings.value,
    )
    if (targets.length === 0) {
      dataSourceMappingNotice.value = '확정할 후보가 없습니다.'
      return
    }

    bulkConfirmTargets.value = targets
    bulkConfirmOriginalCount.value = targets.length
    bulkConfirmSucceededCount.value = 0
    bulkConfirmError.value = null
  }

  function closeBulkDatasourceConfirmation(): void {
    if (bulkConfirmPending.value) return
    bulkConfirmTargets.value = []
    bulkConfirmOriginalCount.value = 0
    bulkConfirmSucceededCount.value = 0
    bulkConfirmError.value = null
  }

  async function confirmBulkDatasourceMappings(): Promise<void> {
    if (
      bulkConfirmPending.value
      || bulkConfirmTargets.value.length === 0
    ) return

    const targets = bulkConfirmTargets.value.map(target =>
      createDatasourceConfirmationTarget(target.nodeId, target.candidate))
    const attempts: DatasourceConfirmationAttempt[] = []
    const warnings: string[] = []
    bulkConfirmPending.value = true
    bulkConfirmError.value = null
    dataSourceMappingNotice.value = null
    dataSourceMappingWarning.value = null

    try {
      for (const target of targets) {
        try {
          const warning = await runConfirmation(target)
          attempts.push({ nodeId: target.nodeId, ok: true })
          if (warning) warnings.push(warning)
        } catch (error: unknown) {
          attempts.push({
            nodeId: target.nodeId,
            ok: false,
            error: errorMessage(
              error,
              '데이터 소스 확정에 실패했습니다.',
            ),
          })
        }
      }

      if (disposed) return
      const result = projectBulkDatasourceConfirmation(targets, attempts)
      bulkConfirmSucceededCount.value += result.succeededNodeIds.length
      dataSourceMappingWarning.value = warnings.length > 0
        ? warnings.join(' / ')
        : null

      if (result.failedTargets.length > 0) {
        bulkConfirmTargets.value = result.failedTargets
        bulkConfirmError.value =
          `${result.failedTargets.length}개 노드 확정에 실패했습니다: ${Object.values(result.errors).join(' / ')}`
      } else {
        const confirmedCount = bulkConfirmOriginalCount.value
        bulkConfirmTargets.value = []
        bulkConfirmOriginalCount.value = 0
        bulkConfirmSucceededCount.value = 0
        dataSourceMappingNotice.value =
          `${confirmedCount}개 노드의 데이터 소스가 확정되었습니다.`
      }
    } finally {
      if (!disposed) bulkConfirmPending.value = false
    }
  }

  function getMappingStats() {
    return getDatasourceMappingStats(dataSourceMappings.value)
  }

  onScopeDispose(() => {
    disposed = true
    invalidateAutoLink()
  })

  return {
    showDataSourceDialog,
    linkingDataSources,
    autoLinkError,
    dataSourceMappingNotice,
    dataSourceMappingWarning,
    dataSourceMappings,
    linkingProgress,
    selectedMappingNodeId,
    expandedCandidates,
    mappingConfirmPendingIds,
    mappingConfirmErrors,
    bulkConfirmTargets,
    bulkConfirmPending,
    bulkConfirmError,
    bulkConfirmDialogMessage,
    dataSourceDialogBusy,
    dataSourceDialogCloseBlocked,
    openDataSourceMappingDialog,
    closeDataSourceMappingDialog,
    autoLinkDataSources,
    toggleCandidateExpanded,
    confirmMappingTarget,
    confirmMappingCandidate,
    openBulkDatasourceConfirmation,
    closeBulkDatasourceConfirmation,
    confirmBulkDatasourceMappings,
    getMappingStats,
    getStatusIcon: datasourceMappingStatusIcon,
    formatSampleValue: formatDatasourceSampleValue,
  }
}
