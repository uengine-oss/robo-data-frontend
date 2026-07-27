import { onScopeDispose, ref, type Ref } from 'vue'
import { whatifDomainApi } from '@/domains/ontology'

export interface OntologyNodeBehavior {
  modelId: string
  name: string
  description: string
  status: string
  role: 'input' | 'output'
  metrics: string
  inputs: Array<{ sourceId: string; field: string }>
  outputs: Array<{ targetId: string; field: string }>
}

interface BehaviorLoadAttempt {
  schemaId: string
  nodeId: string
}

interface OntologyNodeBehaviorClient {
  listModels: typeof whatifDomainApi.listModels
}

function targetKey(target: BehaviorLoadAttempt): string {
  return JSON.stringify([target.schemaId, target.nodeId])
}

function isAbortError(cause: unknown): boolean {
  return cause instanceof Error && cause.name === 'AbortError'
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error && cause.message.trim()
    ? cause.message
    : '알 수 없는 오류'
}

export function useOntologyNodeBehaviors(
  currentSchemaId: Ref<string | null>,
  selectedNodeId: Ref<string | null>,
  client: OntologyNodeBehaviorClient = whatifDomainApi,
) {
  const loading = ref(false)
  const loadError = ref('')
  const behaviors = ref<OntologyNodeBehavior[]>([])
  const loadAttempt = ref<BehaviorLoadAttempt | null>(null)
  let loadSequence = 0
  let loadController: AbortController | null = null
  let loadedTargetKey = ''

  async function load(nodeId: string, frozenSchemaId?: string): Promise<void> {
    const schemaId = frozenSchemaId ?? currentSchemaId.value
    if (!schemaId) {
      loadError.value = '활성 온톨로지 없이 Behavior 모델을 조회할 수 없습니다.'
      return
    }

    const target = { schemaId, nodeId }
    const nextTargetKey = targetKey(target)
    loadAttempt.value = target
    loadError.value = ''
    if (loadedTargetKey !== nextTargetKey) behaviors.value = []

    loadController?.abort()
    const controller = new AbortController()
    loadController = controller
    const sequence = ++loadSequence
    loading.value = true

    try {
      const data = await client.listModels(schemaId, controller.signal)
      if (
        sequence !== loadSequence
        || currentSchemaId.value !== schemaId
        || selectedNodeId.value !== nodeId
      ) return

      behaviors.value = (data.models || []).flatMap(model => {
        const isInput = (model.inputs || []).some(input => input.sourceId === nodeId)
        const isOutput = (model.outputs || []).some(output => output.targetId === nodeId)
        if (!isInput && !isOutput) return []
        return [{
          modelId: model.modelId,
          name: model.name || model.modelId,
          description: model.description || '',
          status: model.status || 'pending',
          role: isOutput ? 'output' as const : 'input' as const,
          metrics: model.metrics || '{}',
          inputs: (model.inputs || []).map(input => ({
            sourceId: input.sourceId,
            field: input.field,
          })),
          outputs: (model.outputs || []).map(output => ({
            targetId: output.targetId,
            field: output.field,
          })),
        }]
      })
      loadedTargetKey = nextTargetKey
    } catch (cause: unknown) {
      if (isAbortError(cause) || sequence !== loadSequence) return
      loadError.value = `Behavior 모델을 불러오지 못했습니다. ${errorMessage(cause)}`
    } finally {
      if (sequence === loadSequence) {
        loading.value = false
        if (loadController === controller) loadController = null
      }
    }
  }

  function retry(): void {
    const target = loadAttempt.value
    if (
      !target
      || currentSchemaId.value !== target.schemaId
      || selectedNodeId.value !== target.nodeId
    ) return
    void load(target.nodeId, target.schemaId)
  }

  function reset(): void {
    loadController?.abort()
    loadController = null
    loadSequence += 1
    loading.value = false
    loadError.value = ''
    loadAttempt.value = null
    loadedTargetKey = ''
    behaviors.value = []
  }

  onScopeDispose(reset)

  return {
    loading,
    loadError,
    behaviors,
    load,
    retry,
    reset,
  }
}
