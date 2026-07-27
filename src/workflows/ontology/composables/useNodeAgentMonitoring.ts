import { ref } from 'vue'
import type { Core } from 'cytoscape'
import { nodeAgentSchedulerApi, type NodeAgentState } from '@/domains/node-agent-scheduler'
import { nodeVisualEffectsApi, type NodeVisualEffects } from '@/domains/ontology'

const POLL_INTERVAL_MS = 5_000
type VisualEffectNode = ReturnType<Core['nodes']>[number]

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback
}

/** Reset the previous frame before applying the current server-owned effect. */
export function applyNodeVisualEffect(node: VisualEffectNode, effect?: NodeVisualEffects): void {
  node.removeClass('fx-alert fx-badge')
  node.removeStyle('background-color opacity')
  node.removeData('badgeText')
  node.removeData('badgeColor')
  const originalLabel = node.data('originalLabel')
  if (originalLabel) {
    node.data('label', originalLabel)
    node.removeData('originalLabel')
  }
  if (!effect) return

  const label = String(node.data('label') ?? '')
  if (effect.color) node.style('background-color', effect.color)
  if (effect.alert) node.addClass('fx-alert')
  if (effect.badge) {
    node.addClass('fx-badge')
    node.data('originalLabel', label)
    node.data('label', `${effect.badge} ${label}`)
  }
  if (effect.opacity != null) node.style('opacity', effect.opacity)
}

export function useNodeAgentMonitoring(getCanvas: () => Core | null) {
  const agentStates = ref(new Map<string, NodeAgentState>())
  const agentMonitorError = ref('')
  const visualEffectsError = ref('')
  const nodeVisualEffects = ref<Record<string, NodeVisualEffects>>({})
  let pollInterval: ReturnType<typeof setInterval> | null = null

  function applyAgentStates(): void {
    const canvas = getCanvas()
    if (!canvas) return
    canvas.nodes().forEach(node => {
      const state = agentStates.value.get(String(node.data('label') ?? ''))
      node.removeClass('agent-active agent-running')
      if (state?.status === 'running') node.addClass('agent-running')
      else if (state?.status === 'idle' || state?.status === 'paused') node.addClass('agent-active')
    })
  }

  function applyVisualEffects(): void {
    const canvas = getCanvas()
    if (!canvas) return
    canvas.nodes().forEach(node => {
      const label = String(node.data('originalLabel') ?? node.data('label') ?? '')
      applyNodeVisualEffect(node, nodeVisualEffects.value[label])
    })
  }

  async function pollAgentStates(): Promise<void> {
    try {
      const states = await nodeAgentSchedulerApi.listAgents()
      agentStates.value = new Map(states.map(state => [state.nodeTypeName, state]))
      agentMonitorError.value = ''
      applyAgentStates()
    } catch (cause: unknown) {
      agentMonitorError.value = errorMessage(cause, '노드 에이전트 모니터에 연결할 수 없습니다.')
    }
  }

  async function pollVisualEffects(): Promise<void> {
    try {
      const result = await nodeVisualEffectsApi.getAll()
      nodeVisualEffects.value = result.effects ?? {}
      visualEffectsError.value = ''
      applyVisualEffects()
    } catch (cause: unknown) {
      visualEffectsError.value = errorMessage(cause, '노드 시각효과 서비스에 연결할 수 없습니다.')
    }
  }

  function startMonitoring(): void {
    if (pollInterval) return
    void pollAgentStates()
    void pollVisualEffects()
    pollInterval = setInterval(() => {
      void pollAgentStates()
      void pollVisualEffects()
    }, POLL_INTERVAL_MS)
  }

  function stopMonitoring(): void {
    if (!pollInterval) return
    clearInterval(pollInterval)
    pollInterval = null
  }

  return {
    agentStates,
    agentMonitorError,
    visualEffectsError,
    startMonitoring,
    stopMonitoring,
    applyAgentStates,
    applyVisualEffects,
  }
}
