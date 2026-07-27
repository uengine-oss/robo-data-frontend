import { computed, ref } from 'vue'
import type { MultiLayerGenerationEvent, MultiLayerProgressDetail } from '@/domains/ontology'

export interface PipelineProgressState {
  status: string
  progress: number
  message?: string
  detail?: MultiLayerProgressDetail
}

export interface UnifiedChunkProgressState {
  current: number
  total: number
  substepCurrent: number
  substepTotal: number
  completedSteps: number
  totalSteps: number
}

type LayerProgressEvent = Extract<MultiLayerGenerationEvent, { event: 'layer_progress' }>
type LayerCompleteEvent = Extract<MultiLayerGenerationEvent, { event: 'layer_complete' }>

const DEFAULT_PIPELINE_STAGES = ['Normalization', 'Chunking', 'Sanitize', 'Unified', 'MergeRefine'] as const
const DOCUMENT_PIPELINE_STAGES = ['Normalization', 'BPMN', 'Chunking', 'Sanitize', 'Unified', 'MergeRefine']

const STAGE_WEIGHTS: Record<string, number> = {
  Normalization: 5,
  BPMN: 10,
  Chunking: 5,
  Sanitize: 10,
  Unified: 60,
  MergeRefine: 10,
}

export const ONTOLOGY_GENERATION_STAGE_LABELS: Record<string, { icon: string; label: string; color: string }> = {
  Normalization: { icon: '📄', label: '문서 정규화', color: '#6366f1' },
  BPMN: { icon: '📐', label: 'BPMN 추출', color: '#8b5cf6' },
  Chunking: { icon: '📦', label: '청크 분할', color: '#0ea5e9' },
  Sanitize: { icon: '🧹', label: '청크 정제', color: '#8b5cf6' },
  Unified: { icon: '🔍', label: '개념 추출', color: '#f59e0b' },
  MergeRefine: { icon: '🔗', label: '병합 & 정제', color: '#10b981' },
}

function emptyChunkProgress(): UnifiedChunkProgressState {
  return {
    current: 0,
    total: 0,
    substepCurrent: 0,
    substepTotal: 0,
    completedSteps: 0,
    totalSteps: 0,
  }
}

function normalizeStepMessage(message?: string): string {
  return (message || '').replace(/^\[[^\]]+\]\s*/, '').trim()
}

export function useOntologyGenerationProgress() {
  const currentStep = ref('')
  const activePipelineStages = ref<string[]>([...DEFAULT_PIPELINE_STAGES])
  const pipelineProgress = ref<Record<string, PipelineProgressState>>({})
  const chunkProgress = ref<UnifiedChunkProgressState>(emptyChunkProgress())
  const sanitizeChunkProgress = ref({ current: 0, total: 0 })
  const layerResults = ref<Record<string, { nodeCount: number; relationCount: number }>>({})

  const totalStageCount = computed(() => activePipelineStages.value.length)
  const completedStageCount = computed(() =>
    activePipelineStages.value.filter(stage => pipelineProgress.value[stage]?.status === 'completed').length,
  )
  const totalExtractedNodes = computed(() =>
    Object.values(layerResults.value).reduce((sum, result) => sum + (result.nodeCount || 0), 0),
  )
  const overallProgressPercent = computed(() => {
    let weightedSum = 0
    let totalWeight = 0
    for (const stage of activePipelineStages.value) {
      const weight = STAGE_WEIGHTS[stage] || 10
      weightedSum += weight * (pipelineProgress.value[stage]?.progress || 0)
      totalWeight += weight
    }
    return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0
  })

  function getStageDisplayMessage(stage: string): string {
    const stageMessage = normalizeStepMessage(pipelineProgress.value[stage]?.message)
    if (!stageMessage) return ''
    if (stage !== 'Unified') return stageMessage

    const unifiedDetail = pipelineProgress.value[stage]?.detail
    if (unifiedDetail?.substepLabel) return unifiedDetail.substepLabel

    return stageMessage.replace(/^청크 \d+\/\d+(?:\s*·\s*단계 \d+\/\d+)?(?:\s*·\s*)?/, '').trim()
  }

  function updateCurrentStep(phase: string, message?: string): void {
    const progress = pipelineProgress.value[phase]?.progress || 0
    const label = ONTOLOGY_GENERATION_STAGE_LABELS[phase]?.label || phase
    currentStep.value = progress >= 100 ? `${label} 완료` : message || `${label} 처리 중`
  }

  function reset(inputType: string): void {
    const stages = inputType === 'pdf' || inputType === 'url'
      ? [...DOCUMENT_PIPELINE_STAGES]
      : [...DEFAULT_PIPELINE_STAGES]
    activePipelineStages.value = stages
    pipelineProgress.value = Object.fromEntries(
      stages.map(stage => [stage, { status: 'pending', progress: 0 }]),
    )
    chunkProgress.value = emptyChunkProgress()
    sanitizeChunkProgress.value = { current: 0, total: 0 }
    layerResults.value = {}
    currentStep.value = ''
  }

  function applyLayerProgress(event: LayerProgressEvent): { phaseName: string; uiPhase: string; status: string } {
    const phaseName = event.layer
    const progressDetail = event.detail

    if (phaseName === 'BPMN' && !pipelineProgress.value.BPMN) {
      activePipelineStages.value = [...DOCUMENT_PIPELINE_STAGES]
      pipelineProgress.value.BPMN = { status: 'pending', progress: 0 }
    }

    const uiPhase = phaseName === 'Merge' || phaseName === 'Refinement' ? 'MergeRefine' : phaseName
    const previousProgress = pipelineProgress.value[uiPhase]?.progress || 0
    const incomingProgress = Math.max(0, Math.min(100, event.progress || 0))

    if (phaseName === 'Merge') {
      const progress = incomingProgress >= 100 ? 50 : Math.round(incomingProgress * 0.5)
      pipelineProgress.value.MergeRefine = {
        status: 'in_progress',
        progress: Math.max(previousProgress, progress),
        message: event.message,
        detail: progressDetail,
      }
    } else if (phaseName === 'Refinement') {
      const progress = incomingProgress >= 100 ? 100 : 50 + Math.round(incomingProgress * 0.5)
      pipelineProgress.value.MergeRefine = {
        status: incomingProgress >= 100 ? 'completed' : 'in_progress',
        progress: Math.max(previousProgress, progress),
        message: event.message,
        detail: progressDetail,
      }
    } else {
      pipelineProgress.value[uiPhase] = {
        status: incomingProgress >= 100 ? 'completed' : 'in_progress',
        progress: Math.max(previousProgress, incomingProgress),
        message: event.message,
        detail: progressDetail,
      }
    }

    if (phaseName === 'Sanitize') {
      const match = event.message?.match(/청크 (\d+)\/(\d+)/)
      if (match) sanitizeChunkProgress.value = { current: Number(match[1]), total: Number(match[2]) }
    }

    if (phaseName === 'Unified') {
      if (progressDetail) {
        chunkProgress.value = {
          current: Number(progressDetail.chunkCurrent || 0),
          total: Number(progressDetail.chunkTotal || 0),
          substepCurrent: Number(progressDetail.substepCurrent || 0),
          substepTotal: Number(progressDetail.substepTotal || 0),
          completedSteps: Number(progressDetail.completedSteps || 0),
          totalSteps: Number(progressDetail.totalSteps || 0),
        }
      } else {
        const nextProgress = { ...chunkProgress.value }
        const chunkMatch = event.message?.match(/청크 (\d+)\/(\d+)/)
        if (chunkMatch) {
          nextProgress.current = Number(chunkMatch[1])
          nextProgress.total = Number(chunkMatch[2])
        }
        const substepMatch = event.message?.match(/단계 (\d+)\/(\d+)/)
        if (substepMatch) {
          nextProgress.substepCurrent = Number(substepMatch[1])
          nextProgress.substepTotal = Number(substepMatch[2])
        }
        chunkProgress.value = nextProgress
      }
    }

    updateCurrentStep(uiPhase, event.message)
    return { phaseName, uiPhase, status: pipelineProgress.value[uiPhase]?.status || 'pending' }
  }

  function recordLayerComplete(event: LayerCompleteEvent): void {
    layerResults.value[event.layer] = {
      nodeCount: event.nodeCount,
      relationCount: event.relationCount || 0,
    }
  }

  function markComplete(): void {
    activePipelineStages.value.forEach(stage => {
      if (pipelineProgress.value[stage]?.status !== 'completed') {
        pipelineProgress.value[stage] = { status: 'completed', progress: 100, message: '완료' }
      }
    })
    currentStep.value = '완료'
  }

  function markFailed(message?: string): void {
    activePipelineStages.value.forEach(stage => {
      if (pipelineProgress.value[stage]?.status === 'in_progress') {
        pipelineProgress.value[stage] = {
          ...pipelineProgress.value[stage],
          status: 'failed',
          message: message || '오류 발생',
        }
      }
    })
    currentStep.value = '오류 발생'
  }

  return {
    currentStep,
    activePipelineStages,
    pipelineProgress,
    chunkProgress,
    sanitizeChunkProgress,
    layerResults,
    totalStageCount,
    completedStageCount,
    totalExtractedNodes,
    overallProgressPercent,
    getStageDisplayMessage,
    reset,
    applyLayerProgress,
    recordLayerComplete,
    markComplete,
    markFailed,
  }
}
