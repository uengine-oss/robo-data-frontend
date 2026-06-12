/**
 * LangChain Text2SQL Store
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { streamLangChain, type LangChainStreamEvent, type LangChainStep } from '@/features/langchain/langchain-api'

export type LangChainStatus = 'idle' | 'running' | 'completed' | 'error'
export type LangChainPhase = 'idle' | 'thinking' | 'reasoning' | 'acting' | 'observing'

export const useLangChainStore = defineStore('langchain', () => {
  // State
  const question = ref('')
  const status = ref<LangChainStatus>('idle')
  const currentPhase = ref<LangChainPhase>('idle')
  const currentStep = ref(0)
  const streamingText = ref('')
  const steps = ref<LangChainStep[]>([])
  const finalOutput = ref('')
  const error = ref<string | null>(null)
  const abortController = ref<AbortController | null>(null)
  
  // Current phase data
  const currentTool = ref<string | null>(null)
  const currentToolInput = ref<string | null>(null)
  const currentToolResult = ref<string | null>(null)
  
  // Computed
  const isRunning = computed(() => status.value === 'running')
  const hasSteps = computed(() => steps.value.length > 0)
  
  // Reset
  function reset() {
    steps.value = []
    finalOutput.value = ''
    error.value = null
    streamingText.value = ''
    currentPhase.value = 'idle'
    currentStep.value = 0
    currentTool.value = null
    currentToolInput.value = null
    currentToolResult.value = null
  }
  
  // Cancel
  function cancel() {
    if (abortController.value) {
      abortController.value.abort()
      abortController.value = null
    }
    status.value = 'idle'
    currentPhase.value = 'idle'
  }
  
  // Process stream event
  function processEvent(event: LangChainStreamEvent) {
    switch (event.type) {
      case 'phase':
        currentPhase.value = event.phase || 'idle'
        if (event.step) currentStep.value = event.step
        if (event.content) {
          streamingText.value = event.content
        }
        break
        
      case 'token':
        streamingText.value += event.token || ''
        break
        
      case 'action':
        currentTool.value = event.tool || null
        currentToolInput.value = event.input || null
        if (event.step) currentStep.value = event.step
        currentPhase.value = 'acting'
        break
        
      case 'finish':
      case 'complete':
        finalOutput.value = event.output || ''
        status.value = 'completed'
        currentPhase.value = 'idle'
        break
        
      case 'error':
        error.value = event.message || 'Unknown error'
        status.value = 'error'
        currentPhase.value = 'idle'
        break
    }
    
    // Extract tool result from phase events
    if (event.phase === 'observing' && event.result) {
      currentToolResult.value = event.result
      
      // Add to steps
      if (currentTool.value) {
        steps.value.push({
          tool: currentTool.value,
          input: currentToolInput.value || '',
          output: event.result,
        })
      }
    }
  }
  
  // Start
  async function start(userQuestion: string, options?: { maxIterations?: number; maxSqlSeconds?: number }) {
    cancel()
    reset()
    
    question.value = userQuestion
    status.value = 'running'
    currentPhase.value = 'thinking'
    
    const controller = new AbortController()
    abortController.value = controller
    
    try {
      for await (const event of streamLangChain(
        {
          question: userQuestion,
          max_iterations: options?.maxIterations,
          max_sql_seconds: options?.maxSqlSeconds,
        },
        { signal: controller.signal }
      )) {
        processEvent(event)
      }
      
      if (status.value === 'running') {
        status.value = 'completed'
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Cancelled
      } else {
        error.value = err instanceof Error ? err.message : 'Unknown error'
        status.value = 'error'
      }
    } finally {
      currentPhase.value = 'idle'
      if (abortController.value === controller) {
        abortController.value = null
      }
    }
  }
  
  return {
    // State
    question,
    status,
    currentPhase,
    currentStep,
    streamingText,
    steps,
    finalOutput,
    error,
    currentTool,
    currentToolInput,
    currentToolResult,
    // Computed
    isRunning,
    hasSteps,
    // Actions
    start,
    cancel,
    reset,
  }
})



