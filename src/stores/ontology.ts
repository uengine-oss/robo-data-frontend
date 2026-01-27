/**
 * ontology.ts
 * 도메인 온톨로지 모델 상태 관리 스토어
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { ontologyApi } from '@/services/api'
import type {
  OntologySchema,
  OntologyNode,
  OntologyRelationship,
  OntologyLabel,
  NodeInstanceData,
  GenerateSchemaRequest,
  GenerateSchemaResponse,
  ApplyFeedbackRequest
} from '@/types'

// ============================================================================
// 위저드 상태
// ============================================================================

export type WizardStep = 'input' | 'review' | 'binding'

export interface WizardState {
  step: WizardStep
  inputMethod: 'text' | 'pdf' | null
  inputText: string
  pdfFile: File | null
  pdfFileName: string
  isGenerating: boolean
  generationError: string | null
  generationProgress: number
  progressMessage: string
}

// ============================================================================
// 온톨로지 스토어
// ============================================================================

export const useOntologyStore = defineStore('ontology', () => {
  // ========== 스키마 상태 ==========
  const schema = ref<OntologySchema | null>(null)
  const nodes = ref<OntologyNode[]>([])
  const relationships = ref<OntologyRelationship[]>([])
  const labels = ref<OntologyLabel[]>([])
  
  // ========== 선택 상태 ==========
  const selectedNodeId = ref<string | null>(null)
  const selectedNode = computed(() => 
    nodes.value.find(n => n.id === selectedNodeId.value) || null
  )
  
  // ========== 인스턴스 데이터 ==========
  const instanceData = ref<NodeInstanceData | null>(null)
  const instanceLoading = ref(false)
  const instanceError = ref<string | null>(null)
  
  // ========== 캔버스에 표시할 인스턴스 노드 ==========
  interface InstanceNode {
    id: string
    name: string
    parentNodeId: string  // 스키마 노드 ID
    parentNodeName: string  // 스키마 노드 이름
  }
  const canvasInstances = ref<InstanceNode[]>([])
  
  // ========== 위저드 상태 ==========
  const wizard = ref<WizardState>({
    step: 'input',
    inputMethod: null,
    inputText: '',
    pdfFile: null,
    pdfFileName: '',
    isGenerating: false,
    generationError: null,
    generationProgress: 0,
    progressMessage: ''
  })
  
  // ========== 피드백 상태 ==========
  const isFeedbackModalOpen = ref(false)
  const feedbackLoading = ref(false)
  const feedbackError = ref<string | null>(null)
  
  // ========== 로딩/에러 상태 ==========
  const loading = ref(false)
  const error = ref<string | null>(null)
  const hasSchema = computed(() => schema.value !== null)

  // ============================================================================
  // 스키마 관련 액션
  // ============================================================================

  /**
   * 저장된 스키마 불러오기
   */
  async function loadSchema() {
    loading.value = true
    error.value = null
    
    try {
      const response = await ontologyApi.getSchema()
      if (response) {
        applySchema(response)
        wizard.value.step = 'review'
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : '스키마 로드 실패'
      console.error('Failed to load ontology schema:', err)
    } finally {
      loading.value = false
    }
  }

  /**
   * 스키마 적용
   */
  function applySchema(newSchema: OntologySchema) {
    schema.value = newSchema
    nodes.value = newSchema.nodes || []
    relationships.value = newSchema.relationships || []
    labels.value = newSchema.labels || []
  }

  /**
   * 스키마 생성 (텍스트/PDF 입력)
   */
  async function generateSchema(request: GenerateSchemaRequest): Promise<boolean> {
    wizard.value.isGenerating = true
    wizard.value.generationError = null
    wizard.value.generationProgress = 0
    wizard.value.progressMessage = '스키마 생성 시작...'
    
    try {
      // 프로그레스 콜백 함수
      const onProgress = (progress: number, message: string) => {
        wizard.value.generationProgress = progress
        wizard.value.progressMessage = message
      }
      
      const response = await ontologyApi.generateSchema(request, onProgress)
      
      if (response.schema) {
        applySchema(response.schema)
        wizard.value.step = 'review'
        return true
      } else {
        throw new Error(response.error || '스키마 생성 실패')
      }
    } catch (err) {
      wizard.value.generationError = err instanceof Error ? err.message : '스키마 생성 중 오류 발생'
      return false
    } finally {
      wizard.value.isGenerating = false
    }
  }

  /**
   * 피드백으로 스키마 수정
   */
  async function applyFeedback(feedback: string): Promise<boolean> {
    if (!schema.value) return false
    
    feedbackLoading.value = true
    feedbackError.value = null
    
    try {
      const request: ApplyFeedbackRequest = {
        currentSchema: schema.value,
        feedback
      }
      
      const response = await ontologyApi.applyFeedback(request)
      
      if (response.schema) {
        applySchema(response.schema)
        isFeedbackModalOpen.value = false
        return true
      } else {
        throw new Error(response.error || '피드백 적용 실패')
      }
    } catch (err) {
      feedbackError.value = err instanceof Error ? err.message : '피드백 적용 중 오류 발생'
      return false
    } finally {
      feedbackLoading.value = false
    }
  }

  /**
   * 스키마 저장
   */
  async function saveSchema(): Promise<boolean> {
    if (!schema.value) return false
    
    loading.value = true
    error.value = null
    
    try {
      await ontologyApi.saveSchema(schema.value)
      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : '스키마 저장 실패'
      return false
    } finally {
      loading.value = false
    }
  }

  // ============================================================================
  // 노드 선택 및 인스턴스 데이터
  // ============================================================================

  /**
   * 노드 선택
   */
  async function selectNode(nodeId: string | null) {
    selectedNodeId.value = nodeId
    instanceData.value = null
    instanceError.value = null
    
    if (!nodeId) return
    
    const node = nodes.value.find(n => n.id === nodeId)
    if (!node?.dataSource) return
    
    await loadInstanceData(node)
  }

  /**
   * 노드의 인스턴스 데이터 로드
   */
  async function loadInstanceData(node: OntologyNode) {
    instanceLoading.value = true
    instanceError.value = null
    
    try {
      const response = await ontologyApi.getNodeInstances(node.id)
      instanceData.value = response
    } catch (err) {
      instanceError.value = err instanceof Error ? err.message : '인스턴스 데이터 로드 실패'
      console.error('Failed to load instance data:', err)
    } finally {
      instanceLoading.value = false
    }
  }

  // ============================================================================
  // 데이터 소스 바인딩
  // ============================================================================

  /**
   * 노드에 데이터 소스 바인딩
   */
  async function bindDataSource(nodeId: string, dataSource: string): Promise<boolean> {
    const nodeIndex = nodes.value.findIndex(n => n.id === nodeId)
    if (nodeIndex === -1) return false
    
    try {
      await ontologyApi.bindDataSource(nodeId, dataSource)
      
      // 로컬 상태 업데이트
      nodes.value[nodeIndex] = {
        ...nodes.value[nodeIndex],
        dataSource
      }
      
      if (schema.value) {
        schema.value.nodes = nodes.value
      }
      
      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : '데이터 소스 바인딩 실패'
      return false
    }
  }

  /**
   * 노드 데이터 소스 바인딩 해제
   */
  async function unbindDataSource(nodeId: string): Promise<boolean> {
    const nodeIndex = nodes.value.findIndex(n => n.id === nodeId)
    if (nodeIndex === -1) return false
    
    try {
      await ontologyApi.unbindDataSource(nodeId)
      
      // 로컬 상태 업데이트
      nodes.value[nodeIndex] = {
        ...nodes.value[nodeIndex],
        dataSource: undefined
      }
      
      if (schema.value) {
        schema.value.nodes = nodes.value
      }
      
      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : '데이터 소스 바인딩 해제 실패'
      return false
    }
  }

  /**
   * 노드의 인스턴스 개수 업데이트
   */
  function updateNodeInstanceCount(nodeId: string, count: number) {
    const nodeIndex = nodes.value.findIndex(n => n.id === nodeId)
    if (nodeIndex === -1) return
    
    nodes.value[nodeIndex] = {
      ...nodes.value[nodeIndex],
      instanceCount: count
    }
    
    if (schema.value) {
      schema.value.nodes = nodes.value
    }
  }

  /**
   * 노드 이름으로 인스턴스 개수 업데이트
   */
  function updateNodeInstanceCountByName(nodeName: string, count: number) {
    const nodeIndex = nodes.value.findIndex(n => n.name === nodeName)
    if (nodeIndex === -1) return
    
    const currentCount = nodes.value[nodeIndex].instanceCount || 0
    nodes.value[nodeIndex] = {
      ...nodes.value[nodeIndex],
      instanceCount: currentCount + count
    }
    
    if (schema.value) {
      schema.value.nodes = nodes.value
    }
  }

  /**
   * 캔버스에 인스턴스 노드 추가
   */
  function addCanvasInstances(parentNodeName: string, instances: { id: string; name: string }[]) {
    const parentNode = nodes.value.find(n => n.name === parentNodeName)
    if (!parentNode) return
    
    const newInstances = instances.map(inst => ({
      id: inst.id,
      name: inst.name,
      parentNodeId: parentNode.id,
      parentNodeName: parentNodeName
    }))
    
    // 기존 인스턴스 제거 후 새로 추가
    canvasInstances.value = canvasInstances.value.filter(
      i => i.parentNodeName !== parentNodeName
    )
    canvasInstances.value.push(...newInstances)
  }

  /**
   * 특정 노드의 캔버스 인스턴스 조회
   */
  function getCanvasInstancesForNode(nodeId: string) {
    return canvasInstances.value.filter(i => i.parentNodeId === nodeId)
  }

  /**
   * 캔버스 인스턴스 초기화
   */
  function clearCanvasInstances() {
    canvasInstances.value = []
  }

  // ============================================================================
  // Materialized View 관리
  // ============================================================================

  /**
   * 노드에 대한 Materialized View 생성
   */
  async function createMaterializedView(nodeId: string): Promise<boolean> {
    const node = nodes.value.find(n => n.id === nodeId)
    if (!node?.dataSource) return false
    
    try {
      await ontologyApi.createMaterializedView(nodeId)
      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Materialized View 생성 실패'
      return false
    }
  }

  // ============================================================================
  // 위저드 액션
  // ============================================================================

  function setWizardStep(step: WizardStep) {
    wizard.value.step = step
  }

  function setInputMethod(method: 'text' | 'pdf' | null) {
    wizard.value.inputMethod = method
  }

  function setInputText(text: string) {
    wizard.value.inputText = text
  }

  function setPdfFile(file: File | null) {
    wizard.value.pdfFile = file
    wizard.value.pdfFileName = file?.name || ''
  }

  function openFeedbackModal() {
    isFeedbackModalOpen.value = true
  }

  function closeFeedbackModal() {
    isFeedbackModalOpen.value = false
    feedbackError.value = null
  }

  // ============================================================================
  // 상태 초기화
  // ============================================================================

  function reset() {
    schema.value = null
    nodes.value = []
    relationships.value = []
    labels.value = []
    selectedNodeId.value = null
    instanceData.value = null
    instanceLoading.value = false
    instanceError.value = null
    loading.value = false
    error.value = null
    
    wizard.value = {
      step: 'input',
      inputMethod: null,
      inputText: '',
      pdfFile: null,
      pdfFileName: '',
      isGenerating: false,
      generationError: null,
      generationProgress: 0,
      progressMessage: ''
    }
    
    isFeedbackModalOpen.value = false
    feedbackLoading.value = false
    feedbackError.value = null
  }

  return {
    // State
    schema,
    nodes,
    relationships,
    labels,
    selectedNodeId,
    selectedNode,
    instanceData,
    instanceLoading,
    instanceError,
    wizard,
    isFeedbackModalOpen,
    feedbackLoading,
    feedbackError,
    loading,
    error,
    
    // Computed
    hasSchema,
    
    // Schema Actions
    loadSchema,
    generateSchema,
    applyFeedback,
    saveSchema,
    applySchema,
    
    // Node Actions
    selectNode,
    loadInstanceData,
    
    // Data Source Actions
    bindDataSource,
    unbindDataSource,
    createMaterializedView,
    updateNodeInstanceCount,
    updateNodeInstanceCountByName,
    canvasInstances,
    addCanvasInstances,
    getCanvasInstancesForNode,
    clearCanvasInstances,
    
    // Wizard Actions
    setWizardStep,
    setInputMethod,
    setInputText,
    setPdfFile,
    openFeedbackModal,
    closeFeedbackModal,
    
    // Reset
    reset
  }
})
