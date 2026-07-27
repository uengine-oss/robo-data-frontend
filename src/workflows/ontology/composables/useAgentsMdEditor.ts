import {
  computed,
  onScopeDispose,
  reactive,
  ref,
  watch,
  type Ref,
} from 'vue'
import {
  agentsMdApi,
  behaviorApi,
  type AgentContextResponse,
  type AgentsMdResponse,
  type AgentsMdRewriteResponse,
  type OntologyBehavior,
} from '@/domains/ontology'
import {
  processGptApi,
  type ProcessGptProcess,
} from '@/domains/agent-scheduler'
import {
  appendProcessGptReference,
  commitAgentsMdSave,
  createAgentsMdRewriteSnapshot,
  createAgentsMdSaveSnapshot,
  createProcessGptBehaviorSnapshot,
  emptyAgentsMdDocument,
  isAgentsMdContentDirty,
  isAgentsMdDirty,
  loadedAgentsMdDocument,
  projectProcessGptMethods,
  type AgentsMdDocument,
  type AgentsMdRewriteSnapshot,
  type AgentsMdSaveSnapshot,
  type ProcessGptBehaviorSnapshot,
} from '../application/agentsMdEditorPolicy'

interface OperationState {
  pending: boolean
  error: string
}

export interface AgentsMdEditorDependencies {
  getContent: (nodeTypeName: string, signal?: AbortSignal) => Promise<AgentsMdResponse | null>
  getContext: (nodeTypeName: string, signal?: AbortSignal) => Promise<AgentContextResponse>
  create: (
    nodeTypeName: string,
    customContent?: string,
    signal?: AbortSignal,
  ) => Promise<AgentsMdResponse>
  save: (
    nodeTypeName: string,
    content: string,
    enabled?: boolean,
    signal?: AbortSignal,
  ) => Promise<{ success: true }>
  remove: (nodeTypeName: string, signal?: AbortSignal) => Promise<{ success: true }>
  rewrite: (
    nodeTypeName: string,
    content: string,
    prompt: string,
    signal?: AbortSignal,
  ) => Promise<AgentsMdRewriteResponse>
  listProcesses: (signal?: AbortSignal) => Promise<ProcessGptProcess[]>
  createBehavior: (
    nodeTypeName: string,
    body: OntologyBehavior,
    signal?: AbortSignal,
  ) => Promise<unknown>
}

export interface AgentsMdEditorEvents {
  onCreated?: () => void
  onDeleted?: () => void
}

const defaultDependencies: AgentsMdEditorDependencies = {
  getContent: (nodeTypeName, signal) => agentsMdApi.getContent(nodeTypeName, signal),
  getContext: (nodeTypeName, signal) => agentsMdApi.getContext(nodeTypeName, signal),
  create: (nodeTypeName, customContent, signal) =>
    agentsMdApi.create(nodeTypeName, customContent, signal),
  save: (nodeTypeName, content, enabled, signal) =>
    agentsMdApi.save(nodeTypeName, content, enabled, signal),
  remove: (nodeTypeName, signal) => agentsMdApi.remove(nodeTypeName, signal),
  rewrite: (nodeTypeName, content, prompt, signal) =>
    agentsMdApi.rewrite(nodeTypeName, content, prompt, signal),
  listProcesses: signal => processGptApi.listProcesses(signal),
  createBehavior: (nodeTypeName, body, signal) =>
    behaviorApi.create(nodeTypeName, body, signal),
}

function operationState(): OperationState {
  return reactive({ pending: false, error: '' })
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback
}

function isAbort(cause: unknown): boolean {
  return cause instanceof DOMException
    ? cause.name === 'AbortError'
    : cause instanceof Error && cause.name === 'AbortError'
}

export function useAgentsMdEditor(
  nodeTypeName: Ref<string>,
  dependencies: AgentsMdEditorDependencies = defaultDependencies,
  events: AgentsMdEditorEvents = {},
) {
  const document = ref<AgentsMdDocument>(emptyAgentsMdDocument())
  const context = ref<AgentContextResponse | null>(null)
  const processList = ref<ProcessGptProcess[]>([])
  const localProcessMethods = ref<ReturnType<typeof projectProcessGptMethods>>([])

  const contentLoad = operationState()
  const contextLoad = operationState()
  const processListLoad = operationState()
  const createOperation = operationState()
  const saveOperation = operationState()
  const deleteOperation = operationState()
  const resetOperation = operationState()
  const rewriteOperation = operationState()
  const processAddOperation = operationState()

  let contentController: AbortController | null = null
  let contextController: AbortController | null = null
  let processListController: AbortController | null = null
  let mutationController: AbortController | null = null
  let rewriteController: AbortController | null = null
  let contentSequence = 0
  let contextSequence = 0
  let processListSequence = 0
  let mutationSequence = 0
  let rewriteSequence = 0

  let lastSaveSnapshot: AgentsMdSaveSnapshot | null = null
  let lastDeleteTarget = ''
  let lastResetTarget = ''
  let lastRewriteSnapshot: AgentsMdRewriteSnapshot | null = null
  let lastProcessSnapshot: ProcessGptBehaviorSnapshot | null = null

  const content = computed({
    get: () => document.value.content,
    set: value => {
      document.value = { ...document.value, content: value }
    },
  })
  const enabled = computed(() => document.value.enabled)
  const hasAgent = computed(() => document.value.hasAgent)
  const isDirty = computed(() => isAgentsMdDirty(document.value))
  const isContentDirty = computed(() => isAgentsMdContentDirty(document.value))
  const anyMutationPending = computed(() => [
    createOperation,
    saveOperation,
    deleteOperation,
    resetOperation,
    rewriteOperation,
    processAddOperation,
  ].some(state => state.pending))
  const processGptMethods = computed(() => {
    const byName = new Map(
      [...projectProcessGptMethods(context.value), ...localProcessMethods.value]
        .map(method => [method.name, method]),
    )
    return [...byName.values()]
  })

  function isCurrentTarget(target: string): boolean {
    return nodeTypeName.value === target
  }

  function abortAll(): void {
    contentController?.abort()
    contextController?.abort()
    processListController?.abort()
    mutationController?.abort()
    rewriteController?.abort()
    contentController = null
    contextController = null
    processListController = null
    mutationController = null
    rewriteController = null
    contentSequence += 1
    contextSequence += 1
    processListSequence += 1
    mutationSequence += 1
    rewriteSequence += 1
  }

  async function loadContent(target = nodeTypeName.value): Promise<void> {
    if (!target) return
    contentController?.abort()
    const controller = new AbortController()
    contentController = controller
    const sequence = ++contentSequence
    contentLoad.pending = true
    contentLoad.error = ''
    try {
      const response = await dependencies.getContent(target, controller.signal)
      if (sequence !== contentSequence || !isCurrentTarget(target)) return
      document.value = loadedAgentsMdDocument(response)
    } catch (cause: unknown) {
      if (isAbort(cause) || sequence !== contentSequence || !isCurrentTarget(target)) return
      contentLoad.error = errorMessage(cause, 'Agents.md 조회에 실패했습니다.')
    } finally {
      if (sequence === contentSequence) {
        contentLoad.pending = false
        if (contentController === controller) contentController = null
      }
    }
  }

  async function loadContext(target = nodeTypeName.value): Promise<void> {
    if (!target) return
    contextController?.abort()
    const controller = new AbortController()
    contextController = controller
    const sequence = ++contextSequence
    contextLoad.pending = true
    contextLoad.error = ''
    try {
      const response = await dependencies.getContext(target, controller.signal)
      if (sequence !== contextSequence || !isCurrentTarget(target)) return
      context.value = response
      localProcessMethods.value = []
    } catch (cause: unknown) {
      if (isAbort(cause) || sequence !== contextSequence || !isCurrentTarget(target)) return
      contextLoad.error = errorMessage(cause, 'Agents.md context 조회에 실패했습니다.')
    } finally {
      if (sequence === contextSequence) {
        contextLoad.pending = false
        if (contextController === controller) contextController = null
      }
    }
  }

  async function loadProcesses(): Promise<boolean> {
    processListController?.abort()
    const controller = new AbortController()
    processListController = controller
    const sequence = ++processListSequence
    processListLoad.pending = true
    processListLoad.error = ''
    try {
      const processes = await dependencies.listProcesses(controller.signal)
      if (sequence !== processListSequence) return false
      processList.value = processes
      return true
    } catch (cause: unknown) {
      if (isAbort(cause) || sequence !== processListSequence) return false
      processListLoad.error = errorMessage(cause, 'ProcessGPT 프로세스 조회에 실패했습니다.')
      return false
    } finally {
      if (sequence === processListSequence) {
        processListLoad.pending = false
        if (processListController === controller) processListController = null
      }
    }
  }

  function cancelProcessList(): void {
    processListController?.abort()
    processListController = null
    processListSequence += 1
    processListLoad.pending = false
  }

  function startMutation(state: OperationState): {
    controller: AbortController
    sequence: number
  } | null {
    if (anyMutationPending.value) return null
    mutationController?.abort()
    const controller = new AbortController()
    mutationController = controller
    const sequence = ++mutationSequence
    state.pending = true
    state.error = ''
    return { controller, sequence }
  }

  function finishMutation(
    state: OperationState,
    controller: AbortController,
    sequence: number,
  ): void {
    if (sequence !== mutationSequence) return
    state.pending = false
    if (mutationController === controller) mutationController = null
  }

  async function createAgent(): Promise<boolean> {
    const target = nodeTypeName.value
    if (!target) return false
    const started = startMutation(createOperation)
    if (!started) return false
    try {
      const response = await dependencies.create(target, undefined, started.controller.signal)
      if (started.sequence !== mutationSequence || !isCurrentTarget(target)) return false
      document.value = loadedAgentsMdDocument(response)
      events.onCreated?.()
      return true
    } catch (cause: unknown) {
      if (!isAbort(cause) && started.sequence === mutationSequence && isCurrentTarget(target)) {
        createOperation.error = errorMessage(cause, 'Agents.md 생성에 실패했습니다.')
      }
      return false
    } finally {
      finishMutation(createOperation, started.controller, started.sequence)
    }
  }

  async function executeSave(
    snapshot: AgentsMdSaveSnapshot,
    rollbackEnabled?: boolean,
  ): Promise<boolean> {
    lastSaveSnapshot = { ...snapshot }
    const started = startMutation(saveOperation)
    if (!started) return false
    try {
      await dependencies.save(
        snapshot.nodeTypeName,
        snapshot.content,
        snapshot.enabled,
        started.controller.signal,
      )
      if (
        started.sequence !== mutationSequence
        || !isCurrentTarget(snapshot.nodeTypeName)
      ) return false
      const current = document.value
      document.value = {
        ...commitAgentsMdSave(current, snapshot),
        enabled: snapshot.enabled,
      }
      return true
    } catch (cause: unknown) {
      if (
        !isAbort(cause)
        && started.sequence === mutationSequence
        && isCurrentTarget(snapshot.nodeTypeName)
      ) {
        saveOperation.error = errorMessage(cause, 'Agents.md 저장에 실패했습니다.')
        if (rollbackEnabled !== undefined) {
          document.value = { ...document.value, enabled: rollbackEnabled }
        }
      }
      return false
    } finally {
      finishMutation(saveOperation, started.controller, started.sequence)
    }
  }

  async function saveAgent(): Promise<boolean> {
    if (!isDirty.value) return false
    return executeSave(createAgentsMdSaveSnapshot(nodeTypeName.value, document.value))
  }

  async function toggleEnabled(nextEnabled: boolean): Promise<boolean> {
    const previousEnabled = document.value.enabled
    document.value = { ...document.value, enabled: nextEnabled }
    return executeSave(
      createAgentsMdSaveSnapshot(nodeTypeName.value, document.value),
      previousEnabled,
    )
  }

  async function retrySave(): Promise<boolean> {
    if (!lastSaveSnapshot || !isCurrentTarget(lastSaveSnapshot.nodeTypeName)) return false
    return executeSave(lastSaveSnapshot)
  }

  async function executeDelete(target: string): Promise<boolean> {
    lastDeleteTarget = target
    const started = startMutation(deleteOperation)
    if (!started) return false
    try {
      await dependencies.remove(target, started.controller.signal)
      if (started.sequence !== mutationSequence || !isCurrentTarget(target)) return false
      document.value = emptyAgentsMdDocument()
      context.value = null
      localProcessMethods.value = []
      events.onDeleted?.()
      return true
    } catch (cause: unknown) {
      if (!isAbort(cause) && started.sequence === mutationSequence && isCurrentTarget(target)) {
        deleteOperation.error = errorMessage(cause, 'Agents.md 삭제에 실패했습니다.')
      }
      return false
    } finally {
      finishMutation(deleteOperation, started.controller, started.sequence)
    }
  }

  function deleteAgent(): Promise<boolean> {
    return executeDelete(nodeTypeName.value)
  }

  function retryDelete(): Promise<boolean> {
    return lastDeleteTarget && isCurrentTarget(lastDeleteTarget)
      ? executeDelete(lastDeleteTarget)
      : Promise.resolve(false)
  }

  async function executeReset(target: string): Promise<boolean> {
    lastResetTarget = target
    const started = startMutation(resetOperation)
    if (!started) return false
    try {
      const response = await dependencies.create(target, undefined, started.controller.signal)
      if (started.sequence !== mutationSequence || !isCurrentTarget(target)) return false
      document.value = {
        ...document.value,
        content: response.content,
      }
      return true
    } catch (cause: unknown) {
      if (!isAbort(cause) && started.sequence === mutationSequence && isCurrentTarget(target)) {
        resetOperation.error = errorMessage(cause, 'Agents.md 템플릿 초기화에 실패했습니다.')
      }
      return false
    } finally {
      finishMutation(resetOperation, started.controller, started.sequence)
    }
  }

  function resetToTemplate(): Promise<boolean> {
    return executeReset(nodeTypeName.value)
  }

  function retryReset(): Promise<boolean> {
    return lastResetTarget && isCurrentTarget(lastResetTarget)
      ? executeReset(lastResetTarget)
      : Promise.resolve(false)
  }

  async function executeRewrite(
    snapshot: AgentsMdRewriteSnapshot,
  ): Promise<{ oldContent: string; newContent: string } | null> {
    lastRewriteSnapshot = { ...snapshot }
    rewriteController?.abort()
    const controller = new AbortController()
    rewriteController = controller
    const sequence = ++rewriteSequence
    rewriteOperation.pending = true
    rewriteOperation.error = ''
    try {
      const response = await dependencies.rewrite(
        snapshot.nodeTypeName,
        snapshot.content,
        snapshot.prompt,
        controller.signal,
      )
      if (sequence !== rewriteSequence || !isCurrentTarget(snapshot.nodeTypeName)) return null
      const oldContent = document.value.content
      document.value = {
        ...document.value,
        content: response.rewrittenContent,
      }
      return { oldContent, newContent: response.rewrittenContent }
    } catch (cause: unknown) {
      if (!isAbort(cause) && sequence === rewriteSequence && isCurrentTarget(snapshot.nodeTypeName)) {
        rewriteOperation.error = errorMessage(cause, 'Agents.md AI 재작성에 실패했습니다.')
      }
      return null
    } finally {
      if (sequence === rewriteSequence) {
        rewriteOperation.pending = false
        if (rewriteController === controller) rewriteController = null
      }
    }
  }

  function rewrite(prompt: string) {
    const snapshot = createAgentsMdRewriteSnapshot(
      nodeTypeName.value,
      document.value,
      prompt,
    )
    if (!snapshot.prompt) return Promise.resolve(null)
    return executeRewrite(snapshot)
  }

  function retryRewrite() {
    return lastRewriteSnapshot && isCurrentTarget(lastRewriteSnapshot.nodeTypeName)
      ? executeRewrite(lastRewriteSnapshot)
      : Promise.resolve(null)
  }

  function cancelRewrite(): void {
    rewriteController?.abort()
    rewriteController = null
    rewriteSequence += 1
    rewriteOperation.pending = false
  }

  async function executeProcessAdd(
    snapshot: ProcessGptBehaviorSnapshot,
  ): Promise<boolean> {
    lastProcessSnapshot = {
      ...snapshot,
      process: { ...snapshot.process },
      body: {
        ...snapshot.body,
        config: { ...snapshot.body.config },
        inputFields: [],
      },
    }
    const started = startMutation(processAddOperation)
    if (!started) return false
    try {
      await dependencies.createBehavior(
        snapshot.nodeTypeName,
        snapshot.body,
        started.controller.signal,
      )
      if (
        started.sequence !== mutationSequence
        || !isCurrentTarget(snapshot.nodeTypeName)
      ) return false
      localProcessMethods.value = [
        ...localProcessMethods.value,
        {
          name: `process.${snapshot.behaviorName}`,
          processId: snapshot.process.id,
          processName: snapshot.process.name,
          description: snapshot.process.description ?? '',
        },
      ]
      document.value = {
        ...document.value,
        content: appendProcessGptReference(document.value.content, snapshot),
      }
      void loadContext(snapshot.nodeTypeName)
      return true
    } catch (cause: unknown) {
      if (
        !isAbort(cause)
        && started.sequence === mutationSequence
        && isCurrentTarget(snapshot.nodeTypeName)
      ) {
        processAddOperation.error = errorMessage(
          cause,
          'ProcessGPT 메서드 추가에 실패했습니다.',
        )
      }
      return false
    } finally {
      finishMutation(processAddOperation, started.controller, started.sequence)
    }
  }

  function addProcess(process: ProcessGptProcess, triggerCondition: string) {
    return executeProcessAdd(
      createProcessGptBehaviorSnapshot(nodeTypeName.value, process, triggerCondition),
    )
  }

  function retryProcessAdd(): Promise<boolean> {
    return lastProcessSnapshot && isCurrentTarget(lastProcessSnapshot.nodeTypeName)
      ? executeProcessAdd(lastProcessSnapshot)
      : Promise.resolve(false)
  }

  function clearOperationError(state: OperationState): void {
    state.error = ''
  }

  watch(nodeTypeName, target => {
    abortAll()
    document.value = emptyAgentsMdDocument()
    context.value = null
    processList.value = []
    localProcessMethods.value = []
    for (const state of [
      contentLoad,
      contextLoad,
      processListLoad,
      createOperation,
      saveOperation,
      deleteOperation,
      resetOperation,
      rewriteOperation,
      processAddOperation,
    ]) {
      state.pending = false
      state.error = ''
    }
    lastSaveSnapshot = null
    lastDeleteTarget = ''
    lastResetTarget = ''
    lastRewriteSnapshot = null
    lastProcessSnapshot = null
    if (target) {
      void loadContent(target)
      void loadContext(target)
    }
  }, { immediate: true })

  onScopeDispose(abortAll)

  return {
    document,
    content,
    enabled,
    hasAgent,
    isDirty,
    isContentDirty,
    context,
    processList,
    processGptMethods,
    contentLoad,
    contextLoad,
    processListLoad,
    createOperation,
    saveOperation,
    deleteOperation,
    resetOperation,
    rewriteOperation,
    processAddOperation,
    anyMutationPending,
    loadContent,
    loadContext,
    loadProcesses,
    cancelProcessList,
    createAgent,
    saveAgent,
    toggleEnabled,
    retrySave,
    deleteAgent,
    retryDelete,
    resetToTemplate,
    retryReset,
    rewrite,
    retryRewrite,
    cancelRewrite,
    addProcess,
    retryProcessAdd,
    clearOperationError,
  }
}
