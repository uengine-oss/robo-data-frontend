import { onScopeDispose, ref } from 'vue'
import * as olapApi from '../api/client'
import {
  createEtlScriptExecutionTarget,
  createEtlScriptGenerationTarget,
  createEtlScriptSaveTarget,
  defaultEtlScriptFilename,
  type EtlScriptExecutionTarget,
  type EtlScriptGenerationTarget,
  type EtlScriptSaveTarget,
  type EtlScriptSyncMode,
} from '../application/etlScriptTargets'
import { requireSuccessfulOperation } from '../application/operationResults'
import {
  describeOlapError,
  type AgentReasoningLog,
  type AgentStreamCallbacks,
  type GeneratedEtlScript,
  type SavedEtlScript,
  type SaveEtlScriptResult,
  type ScriptExecutionEvent,
} from '../model/contracts'
import type { OlapStreamControl } from '../api/client'
import { useManagedTimeouts } from '@/shared/composables/useManagedTimeouts'

export interface EtlScriptExecutionSummary {
  success: boolean
  cancelled?: boolean
  error?: string
  total_rows_processed?: number
  started_at?: string
  completed_at?: string
  steps?: Array<{ status: string; step: string; message?: string }>
}

export interface EtlScriptExecutionProgress {
  attempt: number
  maxRetries: number
  phase: 'executing' | 'regenerating' | 'completed' | ''
  message: string
}

export interface EtlScriptLog {
  timestamp: string
  type: string
  message: string
}

interface EtlScriptDependencies {
  generateTemplate: (cubeName: string, signal: AbortSignal) => Promise<GeneratedEtlScript>
  startAgentGeneration: (
    cubeName: string,
    callbacks: AgentStreamCallbacks,
  ) => OlapStreamControl
  loadSaved: (cubeName: string, signal: AbortSignal) => Promise<SavedEtlScript>
  save: (
    target: EtlScriptSaveTarget,
    signal: AbortSignal,
  ) => Promise<SaveEtlScriptResult>
  execute: (
    target: EtlScriptExecutionTarget,
    onEvent: (event: ScriptExecutionEvent) => void,
  ) => OlapStreamControl
  now: () => string
}

interface UseEtlScriptLifecycleInput {
  getCubeName: () => string | null
  dependencies?: Partial<EtlScriptDependencies>
}

const defaultDependencies: EtlScriptDependencies = {
  generateTemplate: (cubeName, signal) => olapApi.generateETLScript(cubeName, signal),
  startAgentGeneration: (cubeName, callbacks) => olapApi.createAgentStream(cubeName, callbacks),
  loadSaved: (cubeName, signal) => olapApi.loadSavedScript(cubeName, signal),
  save: (target, signal) => olapApi.saveETLScript(
    target.cubeName,
    target.code,
    target.filename,
    signal,
  ),
  execute: (target, onEvent) => olapApi.executeScriptWithRetry(
    target.cubeName,
    target.syncMode,
    target.maxRetries,
    onEvent,
  ),
  now: () => new Date().toISOString(),
}

function isAbortError(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === 'AbortError'
}

export function useEtlScriptLifecycle(input: UseEtlScriptLifecycleInput) {
  const dependencies = { ...defaultDependencies, ...input.dependencies }
  const timeouts = useManagedTimeouts()

  const scriptCode = ref('')
  const scriptFilename = ref('')
  const scriptSaved = ref(false)
  const scriptSavedAt = ref<string | null>(null)

  const generationPending = ref(false)
  const generationError = ref<string | null>(null)
  const generationStatus = ref('')
  const generationLogs = ref<AgentReasoningLog[]>([])
  const failedGenerationTarget = ref<EtlScriptGenerationTarget | null>(null)

  const savedLoadPending = ref(false)
  const savedLoadError = ref<string | null>(null)
  const failedSavedLoadCube = ref<string | null>(null)

  const savePending = ref(false)
  const saveError = ref<string | null>(null)
  const saveNotice = ref<string | null>(null)
  const failedSaveTarget = ref<EtlScriptSaveTarget | null>(null)

  const downloadPending = ref(false)
  const downloadError = ref<string | null>(null)

  const executionPending = ref(false)
  const executionError = ref<string | null>(null)
  const executionNotice = ref<string | null>(null)
  const executionResult = ref<EtlScriptExecutionSummary | null>(null)
  const executionProgress = ref<EtlScriptExecutionProgress>({
    attempt: 0,
    maxRetries: 3,
    phase: '',
    message: '',
  })
  const executionLogs = ref<EtlScriptLog[]>([])

  let generationSequence = 0
  let generationControl: OlapStreamControl | null = null
  let generationController: AbortController | null = null
  let savedLoadSequence = 0
  let savedLoadController: AbortController | null = null
  let saveSequence = 0
  let saveController: AbortController | null = null
  let downloadSequence = 0
  let downloadController: AbortController | null = null
  let executionSequence = 0
  let completedExecutionSequence = 0
  let executionControl: OlapStreamControl | null = null

  function now() {
    return dependencies.now()
  }

  function pushGenerationLog(type: string, message: string, node?: string) {
    generationLogs.value.push({ timestamp: now(), type, message, ...(node ? { node } : {}) })
  }

  function pushExecutionLog(type: string, message: string) {
    executionLogs.value.push({ timestamp: now(), type, message })
  }

  function invalidateGeneration() {
    generationSequence += 1
    generationControl?.cancel()
    generationController?.abort()
    generationControl = null
    generationController = null
    generationPending.value = false
  }

  function finishGeneration(sequence: number) {
    if (sequence !== generationSequence) return false
    generationSequence += 1
    generationControl = null
    generationController = null
    generationPending.value = false
    return true
  }

  function failGeneration(sequence: number, target: EtlScriptGenerationTarget, cause: unknown) {
    if (sequence !== generationSequence) return
    const message = describeOlapError(cause)
    generationError.value = `스크립트 생성 실패: ${message}`
    failedGenerationTarget.value = target
    generationStatus.value = 'error'
    pushGenerationLog('error', `❌ 오류: ${message}`)
    finishGeneration(sequence)
  }

  async function runGeneration(target: EtlScriptGenerationTarget) {
    invalidateGeneration()
    const sequence = generationSequence
    generationPending.value = true
    generationError.value = null
    failedGenerationTarget.value = null
    generationStatus.value = 'analyzing'
    scriptCode.value = ''
    scriptFilename.value = defaultEtlScriptFilename(target.cubeName)
    scriptSaved.value = false
    scriptSavedAt.value = null
    generationLogs.value = []

    if (target.mode === 'template') {
      const controller = new AbortController()
      generationController = controller
      try {
        const result = await dependencies.generateTemplate(target.cubeName, controller.signal)
        if (sequence !== generationSequence || controller.signal.aborted) return
        scriptCode.value = result.code
        scriptFilename.value = result.filename || defaultEtlScriptFilename(target.cubeName)
        generationLogs.value = [{
          timestamp: now(),
          type: 'complete',
          message: '📝 템플릿 기반 스크립트 생성 완료',
        }]
        generationStatus.value = 'completed'
        finishGeneration(sequence)
      } catch (cause: unknown) {
        if (sequence !== generationSequence || controller.signal.aborted || isAbortError(cause)) return
        failGeneration(sequence, target, cause)
      }
      return
    }

    pushGenerationLog('start', '🚀 AI 에이전트 기반 ETL 생성 시작...')
    const callbacks: AgentStreamCallbacks = {
      onStart: data => {
        if (sequence !== generationSequence) return
        generationStatus.value = data.status || 'analyzing'
        pushGenerationLog('start', data.message || '에이전트 시작')
      },
      onLog: data => {
        if (sequence !== generationSequence) return
        generationLogs.value.push({
          timestamp: data.timestamp || now(),
          type: 'log',
          node: data.node,
          message: data.message ?? '',
        })
      },
      onCode: data => {
        if (sequence !== generationSequence) return
        scriptCode.value = data.code || ''
        scriptSaved.value = false
        scriptSavedAt.value = null
        if (data.complete) pushGenerationLog('code', '✅ 코드 생성 완료')
      },
      onSql: data => {
        if (sequence !== generationSequence) return
        pushGenerationLog('sql', `📝 SQL 생성: ${data.name ?? 'unknown'}`)
      },
      onStatus: data => {
        if (sequence !== generationSequence) return
        generationStatus.value = data.status ?? ''
        pushGenerationLog('status', `상태: ${data.status ?? ''}`, data.node)
      },
      onDimensions: data => {
        if (sequence !== generationSequence) return
        pushGenerationLog('dimensions', `📐 ${data.strategies?.length || 0}개 디멘전 전략 생성됨`)
      },
      onTest: data => {
        if (sequence !== generationSequence) return
        pushGenerationLog('test', `${data.success ? '✅' : '❌'} 테스트: ${data.name || 'unknown'}`)
      },
      onComplete: data => {
        if (sequence !== generationSequence) return
        generationStatus.value = 'completed'
        pushGenerationLog('complete', data.message || '✅ ETL 생성 완료!')
        finishGeneration(sequence)
      },
      onError: data => {
        if (sequence !== generationSequence) return
        failGeneration(sequence, target, new Error(data.message || '알 수 없는 오류'))
      },
    }

    try {
      const control = dependencies.startAgentGeneration(target.cubeName, callbacks)
      if (sequence === generationSequence) {
        generationControl = control
      } else {
        control.cancel()
      }
    } catch (cause: unknown) {
      failGeneration(sequence, target, cause)
    }
  }

  async function generate(useAgent: boolean) {
    const cubeName = input.getCubeName()
    if (!cubeName) return
    await runGeneration(createEtlScriptGenerationTarget(
      cubeName,
      useAgent ? 'agent' : 'template',
    ))
  }

  async function retryGeneration() {
    if (!failedGenerationTarget.value) return
    await runGeneration(failedGenerationTarget.value)
  }

  function cancelGeneration(announce = true) {
    const wasPending = generationPending.value
    invalidateGeneration()
    if (!wasPending) return
    generationError.value = null
    failedGenerationTarget.value = null
    generationStatus.value = announce ? 'cancelled' : ''
    if (announce) pushGenerationLog('status', '⏹️ ETL 스크립트 생성을 취소했습니다.')
  }

  async function loadSavedForCube(cubeName: string) {
    const sequence = ++savedLoadSequence
    savedLoadController?.abort()
    const controller = new AbortController()
    savedLoadController = controller
    savedLoadPending.value = true
    savedLoadError.value = null
    failedSavedLoadCube.value = null
    try {
      const result = await dependencies.loadSaved(cubeName, controller.signal)
      if (sequence !== savedLoadSequence || controller.signal.aborted) return
      if (result.exists) {
        scriptCode.value = result.code
        scriptFilename.value = result.filename
        scriptSaved.value = true
        scriptSavedAt.value = result.saved_at
        generationLogs.value = [{
          timestamp: result.saved_at,
          type: 'complete',
          message: `💾 저장된 스크립트 로드됨 (${result.saved_at})`,
        }]
        generationStatus.value = 'completed'
      } else {
        scriptCode.value = ''
        scriptFilename.value = ''
        scriptSaved.value = false
        scriptSavedAt.value = null
        generationLogs.value = []
        generationStatus.value = ''
      }
    } catch (cause: unknown) {
      if (sequence !== savedLoadSequence || controller.signal.aborted || isAbortError(cause)) return
      savedLoadError.value = `저장된 스크립트를 불러오지 못했습니다. ${describeOlapError(cause)}`
      failedSavedLoadCube.value = cubeName
    } finally {
      if (sequence === savedLoadSequence) {
        savedLoadPending.value = false
        savedLoadController = null
      }
    }
  }

  async function loadSaved() {
    const cubeName = input.getCubeName()
    if (!cubeName) return
    await loadSavedForCube(cubeName)
  }

  async function retrySavedLoad() {
    if (!failedSavedLoadCube.value) return
    await loadSavedForCube(failedSavedLoadCube.value)
  }

  async function refreshSavedAfterExecution(cubeName: string, executionRequest: number) {
    const sequence = ++savedLoadSequence
    savedLoadController?.abort()
    const controller = new AbortController()
    savedLoadController = controller
    savedLoadError.value = null
    try {
      const result = await dependencies.loadSaved(cubeName, controller.signal)
      if (
        sequence !== savedLoadSequence
        || controller.signal.aborted
        || (
          executionRequest !== executionSequence
          && executionRequest !== completedExecutionSequence
        )
        || input.getCubeName() !== cubeName
      ) return
      if (result.exists && result.code) {
        scriptCode.value = result.code
        scriptFilename.value = result.filename
        scriptSaved.value = true
        scriptSavedAt.value = result.saved_at
      }
    } catch (cause: unknown) {
      if (sequence !== savedLoadSequence || controller.signal.aborted || isAbortError(cause)) return
      savedLoadError.value = `갱신된 스크립트를 불러오지 못했습니다. ${describeOlapError(cause)}`
      failedSavedLoadCube.value = cubeName
    } finally {
      if (sequence === savedLoadSequence) savedLoadController = null
    }
  }

  async function runSave(target: EtlScriptSaveTarget) {
    const sequence = ++saveSequence
    saveController?.abort()
    const controller = new AbortController()
    saveController = controller
    savePending.value = true
    saveError.value = null
    saveNotice.value = null
    failedSaveTarget.value = null
    try {
      const result = await dependencies.save(target, controller.signal)
      if (sequence !== saveSequence || controller.signal.aborted) return
      requireSuccessfulOperation(result, 'ETL 스크립트 저장')
      scriptSaved.value = true
      scriptSavedAt.value = result.metadata?.saved_at ?? null
      saveNotice.value = '💾 스크립트가 저장되었습니다'
      pushGenerationLog('complete', '💾 스크립트 저장 완료')
      timeouts.schedule('olap-script-save-notice', () => {
        saveNotice.value = null
      }, 3000)
    } catch (cause: unknown) {
      if (sequence !== saveSequence || controller.signal.aborted || isAbortError(cause)) return
      saveError.value = `스크립트 저장 실패: ${describeOlapError(cause)}`
      failedSaveTarget.value = target
    } finally {
      if (sequence === saveSequence) {
        savePending.value = false
        saveController = null
      }
    }
  }

  async function saveCurrent() {
    const cubeName = input.getCubeName()
    if (!cubeName) return
    try {
      await runSave(createEtlScriptSaveTarget(
        cubeName,
        scriptCode.value,
        scriptFilename.value,
      ))
    } catch (cause: unknown) {
      saveError.value = describeOlapError(cause)
    }
  }

  async function retrySave() {
    if (!failedSaveTarget.value) return
    await runSave(failedSaveTarget.value)
  }

  async function createDownload(): Promise<GeneratedEtlScript | null> {
    const cubeName = input.getCubeName()
    if (!cubeName) return null
    const sequence = ++downloadSequence
    downloadController?.abort()
    const controller = new AbortController()
    downloadController = controller
    downloadPending.value = true
    downloadError.value = null
    try {
      const result = await dependencies.generateTemplate(cubeName, controller.signal)
      if (sequence !== downloadSequence || controller.signal.aborted) return null
      return {
        code: result.code,
        filename: result.filename || defaultEtlScriptFilename(cubeName),
      }
    } catch (cause: unknown) {
      if (sequence !== downloadSequence || controller.signal.aborted || isAbortError(cause)) return null
      downloadError.value = `스크립트 생성 실패: ${describeOlapError(cause)}`
      return null
    } finally {
      if (sequence === downloadSequence) {
        downloadPending.value = false
        downloadController = null
      }
    }
  }

  function finishExecution(sequence: number) {
    if (sequence !== executionSequence) return false
    completedExecutionSequence = sequence
    executionSequence += 1
    executionControl = null
    executionPending.value = false
    return true
  }

  function handleExecutionEvent(
    sequence: number,
    target: EtlScriptExecutionTarget,
    event: ScriptExecutionEvent,
  ) {
    if (sequence !== executionSequence) return
    if (event.attempt !== undefined) executionProgress.value.attempt = event.attempt
    if (event.maxRetries !== undefined) executionProgress.value.maxRetries = event.maxRetries
    executionProgress.value.message = event.message

    switch (event.type) {
      case 'progress':
        executionProgress.value.phase = 'executing'
        pushExecutionLog('info', event.message)
        break
      case 'log':
        pushExecutionLog('info', event.message)
        break
      case 'error':
        pushExecutionLog('error', event.message)
        if (event.terminal) {
          executionProgress.value.phase = ''
          executionError.value = event.message
          executionResult.value = { success: false, error: event.message }
          finishExecution(sequence)
        }
        break
      case 'regenerating':
        executionProgress.value.phase = 'regenerating'
        pushExecutionLog('warning', `🔄 ${event.message}`)
        break
      case 'agent_reasoning':
        pushExecutionLog('reasoning', `🤖 ${event.message}`)
        break
      case 'script_updated':
        pushExecutionLog('success', `✏️ ${event.message}`)
        void refreshSavedAfterExecution(target.cubeName, sequence)
        break
      case 'success':
        executionNotice.value = event.message
        pushExecutionLog('success', event.message)
        break
      case 'warning':
        pushExecutionLog('warning', `⚠️ ${event.message}`)
        break
      case 'complete': {
        executionProgress.value.phase = 'completed'
        if (event.success) {
          const message = event.message || 'ETL 실행 완료!'
          executionNotice.value = message
          executionResult.value = { success: true }
          pushExecutionLog('success', `✅ ${message}`)
        } else {
          const message = event.message || 'ETL 실행 실패'
          executionError.value = message
          executionResult.value = { success: false, error: event.message }
          pushExecutionLog('error', `❌ ${message}`)
        }
        finishExecution(sequence)
        break
      }
    }
  }

  function execute(syncMode: EtlScriptSyncMode) {
    const cubeName = input.getCubeName()
    if (!cubeName) return false
    if (!scriptSaved.value) {
      executionError.value = '스크립트를 먼저 저장해주세요'
      return false
    }
    const target = createEtlScriptExecutionTarget(cubeName, syncMode, 3)
    executionSequence += 1
    completedExecutionSequence = 0
    executionControl?.cancel()
    const sequence = executionSequence
    executionPending.value = true
    executionError.value = null
    executionNotice.value = null
    executionResult.value = null
    executionProgress.value = {
      attempt: 0,
      maxRetries: target.maxRetries,
      phase: 'executing',
      message: '',
    }
    executionLogs.value = []
    pushExecutionLog(
      'start',
      syncMode === 'full'
        ? '🔄 전체 재적재 모드로 ETL 실행 시작...'
        : '📈 증분 적재 모드로 ETL 실행 시작...',
    )
    try {
      const control = dependencies.execute(
        target,
        event => handleExecutionEvent(sequence, target, event),
      )
      if (sequence === executionSequence) {
        executionControl = control
      } else {
        control.cancel()
      }
      return true
    } catch (cause: unknown) {
      if (sequence !== executionSequence) return false
      const message = `스크립트 실행 실패: ${describeOlapError(cause)}`
      executionError.value = message
      executionResult.value = { success: false, error: message }
      pushExecutionLog('error', `❌ ${message}`)
      finishExecution(sequence)
      return false
    }
  }

  function cancelExecution() {
    if (!executionPending.value) return
    executionSequence += 1
    completedExecutionSequence = 0
    executionControl?.cancel()
    executionControl = null
    executionPending.value = false
    executionProgress.value.phase = ''
    executionResult.value = {
      success: false,
      cancelled: true,
      error: '사용자가 실행을 취소했습니다.',
    }
    pushExecutionLog('info', '⏹️ 실행이 취소되었습니다.')
  }

  function clearExecutionLogs() {
    executionLogs.value = []
  }

  function resetForCubeChange() {
    cancelGeneration(false)
    executionSequence += 1
    completedExecutionSequence = 0
    executionControl?.cancel()
    executionControl = null
    executionPending.value = false
    executionProgress.value.phase = ''
    savedLoadSequence += 1
    savedLoadController?.abort()
    savedLoadController = null
    savedLoadPending.value = false
    saveSequence += 1
    saveController?.abort()
    saveController = null
    savePending.value = false
    downloadSequence += 1
    downloadController?.abort()
    downloadController = null
    downloadPending.value = false
    scriptCode.value = ''
    scriptFilename.value = ''
    scriptSaved.value = false
    scriptSavedAt.value = null
    generationError.value = null
    generationStatus.value = ''
    generationLogs.value = []
    failedGenerationTarget.value = null
    savedLoadError.value = null
    failedSavedLoadCube.value = null
    saveError.value = null
    saveNotice.value = null
    failedSaveTarget.value = null
    downloadError.value = null
    executionError.value = null
    executionNotice.value = null
    executionResult.value = null
    executionLogs.value = []
  }

  onScopeDispose(() => {
    resetForCubeChange()
  })

  return {
    scriptCode,
    scriptFilename,
    scriptSaved,
    scriptSavedAt,
    generationPending,
    generationError,
    generationStatus,
    generationLogs,
    failedGenerationTarget,
    savedLoadPending,
    savedLoadError,
    savePending,
    saveError,
    saveNotice,
    failedSaveTarget,
    downloadPending,
    downloadError,
    executionPending,
    executionError,
    executionNotice,
    executionResult,
    executionProgress,
    executionLogs,
    generate,
    retryGeneration,
    cancelGeneration,
    loadSaved,
    retrySavedLoad,
    saveCurrent,
    retrySave,
    createDownload,
    execute,
    cancelExecution,
    clearExecutionLogs,
    resetForCubeChange,
  }
}
