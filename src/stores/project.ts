/**
 * project.ts
 * 프로젝트 상태 관리 스토어
 * 
 * 주요 기능:
 * - 프로젝트 메타데이터 관리
 * - 파일 업로드/파싱/분석/인제스천 (순차 파이프라인)
 * - 통합 콘솔 메시지
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { 
  ProjectMetadata,
  BackendRequestMetadata,
  SourceType,
  UploadedFile, 
  GraphData,
  GraphNode,
  GraphLink,
  Neo4jNode,
  Neo4jRelationship,
  StreamMessage,
  NameCaseOption
} from '@/types'

// 그래프 이벤트 타입 (노드/관계 생성 정보)
export interface GraphEvent {
  id: string
  type: 'node' | 'relationship'
  action: 'created' | 'updated' | 'deleted'
  nodeType?: string
  nodeName?: string
  relType?: string
  source?: string
  target?: string
  timestamp: string
}

import { useSessionStore } from './session'
import { useSchemaCanvasStore } from './schemaCanvas'
import { antlrApi, roboApi, ingestApi, type PipelineStatus, type PipelinePhaseInfo } from '@/services/api'

// ============================================================================
// 타입 정의
// ============================================================================

type MessageType = StreamMessage['type']

// ============================================================================
// 유틸리티 함수
// ============================================================================

/**
 * Neo4j 노드를 내부 형식으로 변환
 */
function convertNeo4jNode(node: Neo4jNode): GraphNode {
  return {
  id: node['Node ID'],
  labels: node['Labels'],
  properties: node['Properties']
  }
}

/**
 * Neo4j 관계를 내부 형식으로 변환
 */
function convertNeo4jRelationship(rel: Neo4jRelationship): GraphLink {
  return {
  id: rel['Relationship ID'],
  source: rel['Start Node ID'],
  target: rel['End Node ID'],
  type: rel['Type'],
  properties: rel['Properties']
  }
}

/**
 * 현재 타임스탬프 생성
 */
function createTimestamp(): string {
  return new Date().toISOString()
}

// [REMOVED] deduplicateClasses - UML은 이제 VueFlow로 로컬 처리

// ============================================================================
// 스토어 정의
// ============================================================================

export const useProjectStore = defineStore('project', () => {
  const sessionStore = useSessionStore()
  
  // ==========================================================================
  // 상태 - 프로젝트 메타데이터
  // ==========================================================================
  
  const sourceType = ref<SourceType>('java')
  const ddl = ref<string[]>([])
  
  // ==========================================================================
  // 상태 - 파일
  // ==========================================================================
  
  const uploadedFiles = ref<UploadedFile[]>([])
  const uploadedDdlFiles = ref<UploadedFile[]>([])
  
  // 메타데이터 대소문자 변환 옵션
  const nameCaseOption = ref<'original' | 'uppercase' | 'lowercase'>('original')
  
  // ==========================================================================
  // LocalStorage 키
  // ==========================================================================
  
  const STORAGE_KEY = 'robo-analyzer-project-state'
  
  /**
   * 프로젝트 상태를 LocalStorage에 저장
   */
  function saveToStorage() {
    try {
      const state = {
        sourceType: sourceType.value,
        uploadedFiles: uploadedFiles.value,
        uploadedDdlFiles: uploadedDdlFiles.value
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch (e) {
      console.warn('LocalStorage 저장 실패:', e)
    }
  }
  
  /**
   * LocalStorage에서 프로젝트 상태 복원
   */
  function restoreFromStorage() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const state = JSON.parse(saved)
        if (state.sourceType) sourceType.value = state.sourceType
        if (state.uploadedFiles) uploadedFiles.value = state.uploadedFiles
        if (state.uploadedDdlFiles) uploadedDdlFiles.value = state.uploadedDdlFiles
        console.log('[projectStore] 상태 복원됨')
      }
    } catch (e) {
      console.warn('LocalStorage 복원 실패:', e)
    }
  }
  
  // 초기화 시 복원
  restoreFromStorage()
  // 파싱 결과는 더 이상 JSON으로 받지 않음
  
  // ==========================================================================
  // 상태 - 그래프 (Map으로 관리하여 ID 기반 덮어쓰기)
  // ==========================================================================
  
  const nodeMap = ref<Map<string, GraphNode>>(new Map())
  const linkMap = ref<Map<string, GraphLink>>(new Map())
  
  // ==========================================================================
  // 상태 - 프로세스
  // ==========================================================================
  
  const isProcessing = ref(false)
  const currentStep = ref('')
  const totalSteps = ref(5) // DDL 처리, AST 생성, AI 분석, 테이블 설명 보강, 벡터라이징
  const completedSteps = ref(0)
  
  // ==========================================================================
  // 상태 - 데이터 확인 모달
  // ==========================================================================
  
  const showDataConfirmModal = ref(false)
  const pendingNodeCount = ref(0)
  const pendingUploadFiles = ref<File[]>([])
  const pendingUploadMeta = ref<BackendRequestMetadata | null>(null)
  const pendingAction = ref<'upload' | 'restart' | null>(null) // 업로드 vs 인제스천 재시작 구분
  
  // ==========================================================================
  // 상태 - 통합 콘솔 메시지
  // ==========================================================================
  
  const consoleMessages = ref<StreamMessage[]>([])
  
  // ==========================================================================
  // 상태 - 그래프 이벤트 (노드/관계 생성 실시간 피드)
  // ==========================================================================
  
  const graphEvents = ref<GraphEvent[]>([])
  let graphEventIdCounter = 0
  
  // ==========================================================================
  // 상태 - 파이프라인 제어
  // ==========================================================================
  
  const pipelineStatus = ref<PipelineStatus | null>(null)
  const pipelinePhases = ref<PipelinePhaseInfo[]>([])
  const isPipelinePaused = ref(false)
  const isPipelineStopped = ref(false)
  
  // ==========================================================================
  // Computed - 그래프 데이터
  // ==========================================================================
  
  const graphData = computed<GraphData>(() => ({
    nodes: Array.from(nodeMap.value.values()),
    links: Array.from(linkMap.value.values())
  }))
  
  // ==========================================================================
  // Computed - 메타데이터
  // ==========================================================================
  
  const metadata = computed<ProjectMetadata>(() => ({
    sourceType: sourceType.value,
    ddl: ddl.value
  }))
  
  const analyzeMeta = computed<BackendRequestMetadata>(() => ({
    strategy: (sourceType.value === 'oracle' || sourceType.value === 'postgresql') ? 'dbms' : 'framework',
    target: sourceType.value,
    nameCase: nameCaseOption.value
  }))
  
  const isValidConfig = computed(() => 
    Boolean(uploadedFiles.value.length > 0 || uploadedDdlFiles.value.length > 0)
  )
  
  // ==========================================================================
  // 내부 함수 - 그래프 데이터
  // ==========================================================================
  
  /**
   * 그래프 데이터 업데이트 (점진적 추가)
   */
  function updateGraphData(nodes: Neo4jNode[], relationships: Neo4jRelationship[]): void {
    const newNodeMap = new Map(nodeMap.value)
    const newLinkMap = new Map(linkMap.value)
    
    for (const node of nodes) {
      const converted = convertNeo4jNode(node)
      newNodeMap.set(converted.id, converted)
    }
    
    for (const rel of relationships) {
      const converted = convertNeo4jRelationship(rel)
      newLinkMap.set(converted.id, converted)
    }
    
    nodeMap.value = newNodeMap
    linkMap.value = newLinkMap
  }
  
  /**
   * 그래프 데이터 초기화
   */
  function clearGraphData(): void {
    nodeMap.value = new Map()
    linkMap.value = new Map()
  }
  
  /**
   * 노드와 연결된 관계 삭제
   */
  function deleteNodeAndRelationships(nodeId: string): void {
    const newNodeMap = new Map(nodeMap.value)
    const newLinkMap = new Map(linkMap.value)
    
    // 노드 삭제
    newNodeMap.delete(nodeId)
    
    // 연결된 관계 삭제
    for (const [linkId, link] of linkMap.value.entries()) {
      if (link.source === nodeId || link.target === nodeId) {
        newLinkMap.delete(linkId)
      }
    }
    
    nodeMap.value = newNodeMap
    linkMap.value = newLinkMap
  }
  
  // ==========================================================================
  // 내부 함수 - 통합 콘솔 메시지
  // ==========================================================================
  
  function addMessage(type: MessageType, content: string): void {
    consoleMessages.value.push({ type, content, timestamp: createTimestamp() })
  }
  
  function clearMessages(): void {
    consoleMessages.value = []
  }
  
  /**
   * 그래프 이벤트 추가 (노드/관계 생성 시)
   */
  function addGraphEvent(event: Omit<GraphEvent, 'id' | 'timestamp'>): void {
    graphEventIdCounter++
    graphEvents.value.push({
      ...event,
      id: `ge-${graphEventIdCounter}`,
      timestamp: createTimestamp()
    })
    
    // 최대 500개만 유지
    if (graphEvents.value.length > 500) {
      graphEvents.value = graphEvents.value.slice(-500)
    }
  }
  
  /**
   * 그래프 이벤트 초기화
   */
  function clearGraphEvents(): void {
    graphEvents.value = []
    graphEventIdCounter = 0
  }
  
  /**
   * Neo4j 그래프에서 이벤트 추출 및 추가
   */
  function extractAndAddGraphEvents(nodes: Neo4jNode[], relationships: Neo4jRelationship[]): void {
    // 노드 이벤트 추가
    for (const node of nodes) {
      const labels = node['Labels'] || []
      const properties = node['Properties'] || {}
      const nodeType = labels[0] || 'Unknown'
      
      // 노드 이름 결정 (우선순위: name, procedure_name, class_name, fileName)
      const nodeName = String(
        properties['name'] || 
        properties['procedure_name'] || 
        properties['class_name'] ||
        properties['fileName'] ||
        node['Node ID']
      )
      
      addGraphEvent({
        type: 'node',
        action: 'created',
        nodeType,
        nodeName
      })
    }
    
    // 관계 이벤트 추가
    for (const rel of relationships) {
      const relType = rel['Type'] || 'Unknown'
      
      // 소스/타겟 노드 이름 찾기
      const sourceNode = nodes.find(n => n['Node ID'] === rel['Start Node ID'])
      const targetNode = nodes.find(n => n['Node ID'] === rel['End Node ID'])
      
      const sourceName = sourceNode 
        ? String(sourceNode['Properties']?.['name'] || sourceNode['Properties']?.['procedure_name'] || rel['Start Node ID'])
        : rel['Start Node ID']
      const targetName = targetNode
        ? String(targetNode['Properties']?.['name'] || targetNode['Properties']?.['procedure_name'] || rel['End Node ID'])
        : rel['End Node ID']
      
      addGraphEvent({
        type: 'relationship',
        action: 'created',
        relType,
        source: sourceName,
        target: targetName
      })
    }
  }
  
  
  // ==========================================================================
  // Actions - Setters
  // ==========================================================================
  
  function setSourceType(type: SourceType): void {
    sourceType.value = type
  }
  
  function setDdl(d: string[]): void {
    ddl.value = d
  }
  
  // ==========================================================================
  // Actions - 개별 단계 함수
  // ==========================================================================
  
  /**
   * 파일 업로드 (내부용)
   */
  async function doUpload(files: File[], meta: BackendRequestMetadata) {
    currentStep.value = '[1단계] 파일 업로드 중...'
    addMessage('message', `🚀 파일 업로드 시작 (${files.length}개 파일)`)
    
    const result = await antlrApi.uploadFiles(meta, files, sessionStore.getHeaders())
    
    sourceType.value = meta.target as SourceType
    uploadedFiles.value = result.files
    uploadedDdlFiles.value = result.ddlFiles
    
    // LocalStorage에 저장
    saveToStorage()
    
    addMessage('message', `✅ 업로드 완료: 소스 ${result.files.length}개, DDL ${result.ddlFiles.length}개`)
    completedSteps.value = 1
    return result
  }
  
  /**
   * 파싱 요청 (내부용)
   */
  async function doParse() {
    currentStep.value = '[2단계] 파싱 중...'
    addMessage('message', '🔧 파싱 시작...')
    
    await antlrApi.parseStream(
      analyzeMeta.value,
      sessionStore.getHeaders(),
      (event) => {
        if (event.content) {
          addMessage(event.type === 'error' ? 'error' : 'message', event.content)
        }
      }
    )
    
    addMessage('message', '✅ 파싱 완료')
    completedSteps.value = 2
  }
  
  /**
   * 분석 실행 (내부용)
   */
  async function doAnalyze(): Promise<void> {
    currentStep.value = '[3단계] 🧠 AI 분석 진행 중...'
    clearGraphData()
    clearGraphEvents()
    addMessage('message', '🔍 분석 시작...')
    
    // 캔버스 스토어 가져오기 (실시간 업데이트용)
    const schemaCanvasStore = useSchemaCanvasStore()
    
    await roboApi.analyze(
      analyzeMeta.value,
      sessionStore.getHeaders(),
      (event) => {
        if (event.content) {
          addMessage(event.type === 'error' ? 'error' : 'message', event.content)
        }
        
        // Phase 이벤트 처리 - 진행 상태 업데이트 (세부 진행률 포함)
        if (event.type === 'phase_event') {
          const phaseNum = event.phase as number
          const phaseName = event.name || ''
          const phaseProgress = (event.progress as number) || 0  // 단계 내 세부 진행률 (0-100)
          const details = event.details || {}
          
          if (event.status === 'started') {
            // 시작 상태 - 현재 단계 표시
            currentStep.value = `[${phaseNum + 1}단계] ${phaseName} 시작...`
            completedSteps.value = phaseNum
          } else if (event.status === 'in_progress') {
            // 진행 중 상태 - 세부 진행률 표시
            // 각 단계는 totalSteps로 나눠진 범위를 가짐
            // phaseNum이 0이면 0~20%, 1이면 20~40%, 2이면 40~60%, 3이면 60~80%, 4이면 80~100%
            const phaseWeight = 100 / totalSteps.value  // 각 단계가 차지하는 비율 (예: 20%)
            const phaseStart = phaseNum * phaseWeight
            const phaseContribution = (phaseProgress / 100) * phaseWeight
            completedSteps.value = (phaseStart + phaseContribution) / (100 / totalSteps.value)
            
            // 상세 정보가 있으면 표시
            if (details.step) {
              const stepName = details.step === 'saving_to_neo4j' ? 'Neo4j 저장 중' :
                              details.step === 'batch_saving' ? `배치 저장 중 (${details.batch}/${details.total_batches})` :
                              details.step === 'table_embedding' ? `테이블 임베딩 (${details.batch}/${details.total_batches})` :
                              details.step === 'column_embedding' ? `컬럼 임베딩 (${details.batch}/${details.total_batches})` :
                              details.step
              currentStep.value = `[${phaseNum + 1}단계] ${phaseName} - ${stepName} (${phaseProgress}%)`
            } else if (details.completed && details.total) {
              currentStep.value = `[${phaseNum + 1}단계] ${phaseName} (${details.completed}/${details.total}) ${phaseProgress}%`
            } else {
              currentStep.value = `[${phaseNum + 1}단계] ${phaseName} 진행 중... (${phaseProgress}%)`
            }
          } else if (event.status === 'completed') {
            // 완료 상태
            completedSteps.value = phaseNum + 1
            currentStep.value = `[${phaseNum + 1}단계] ${phaseName} 완료 ✓`
          } else if (event.status === 'skipped') {
            // 건너뜀 상태
            currentStep.value = `[${phaseNum + 1}단계] ${phaseName} 건너뜀`
          }
        }
        
        // 캔버스 업데이트 이벤트 처리 (실시간 반영)
        if (event.type === 'canvas_update' && event.updateType && event.tableName) {
          schemaCanvasStore.handleCanvasUpdate({
            updateType: event.updateType,
            tableName: event.tableName,
            schema: event.schema,
            field: event.field,
            changes: event.changes
          })
        }
        
        const graph = event.graph
        if (graph?.Nodes || graph?.Relationships) {
          // 그래프 데이터 업데이트
          updateGraphData(graph.Nodes || [], graph.Relationships || [])
          
          // 그래프 이벤트 추출 (실시간 피드용)
          extractAndAddGraphEvents(graph.Nodes || [], graph.Relationships || [])
          
          // 그래프 데이터에서 테이블/컬럼/릴레이션 업데이트 감지 → 캔버스에 실시간 반영
          for (const node of graph.Nodes || []) {
            const labels = node.Labels || []
            const props = node.Properties || {}
            
            if (labels.includes('Table') && props.name) {
              // 새 테이블 추가 또는 설명 업데이트
              const tableName = props.name as string
              const schema = (props.schema as string) || 'public'
              
              // 먼저 table_added 이벤트로 새 테이블 추가 시도
              schemaCanvasStore.handleCanvasUpdate({
                updateType: 'table_added',
                tableName,
                schema,
                changes: {
                  description: props.description || props.analyzed_description,
                  column_count: props.column_count
                }
              })
              
              // 그 다음 설명 업데이트
              if (props.description || props.analyzed_description) {
                schemaCanvasStore.handleCanvasUpdate({
                  updateType: 'table_description',
                  tableName,
                  schema,
                  changes: {
                    description: props.description || props.analyzed_description
                  }
                })
              }
            }
            
            if (labels.includes('Column') && props.name && props.table_name) {
              schemaCanvasStore.handleCanvasUpdate({
                updateType: 'column_description',
                tableName: props.table_name as string,
                field: props.name as string,
                changes: {
                  description: props.description || props.analyzed_description,
                  dtype: props.dtype,
                  nullable: props.nullable
                }
              })
            }
          }
          
          // 릴레이션 업데이트 감지 (FK_TO_TABLE)
          for (const rel of graph.Relationships || []) {
            const relType = rel.Type || ''
            const relProps = rel.Properties || {}
            
            // FK_TO_TABLE 관계에서 테이블 정보 추출
            if (relType === 'FK_TO_TABLE') {
              const fromTable = (relProps.from_table as string) || ''
              const toTable = (relProps.to_table as string) || ''
              const sourceColumn = (relProps.sourceColumn as string) || (relProps.source_column as string) || ''
              const targetColumn = (relProps.targetColumn as string) || (relProps.target_column as string) || ''
              
              if (fromTable && toTable) {
                schemaCanvasStore.handleCanvasUpdate({
                  updateType: 'relationship_added',
                  tableName: fromTable,
                  changes: {
                    from_column: sourceColumn,
                    to_table: toTable,
                    to_column: targetColumn,
                    source: relProps.source || 'procedure'
                  }
                })
              }
            }
          }
        }
      }
    )
    
    addMessage('message', '✅ 분석 완료')
    completedSteps.value = totalSteps.value  // 전체 단계 완료
  }
  
  /**
   * 인제스천 실행 (내부용)
   */
  async function doIngest(): Promise<void> {
    currentStep.value = '[4단계] 인제스천 중...'
    addMessage('message', '📦 스키마 인제스천 시작...')
    
    const result = await ingestApi.ingest({
      db_name: 'postgres',
      schema: 'rwis',
      clear_existing: false
    })
    
    addMessage('message', `✅ 인제스천 완료: 테이블 ${result.tables_loaded}개, 컬럼 ${result.columns_loaded}개, FK ${result.fks_loaded}개`)
    completedSteps.value = 4
  }
  
  // ==========================================================================
  // Actions - 통합 파이프라인
  // ==========================================================================
  
  /**
   * 기존 데이터 존재 여부 확인
   */
  async function checkExistingData(): Promise<{ hasData: boolean; nodeCount: number }> {
    try {
      return await roboApi.checkData(sessionStore.getHeaders())
    } catch (error) {
      console.warn('기존 데이터 확인 실패:', error)
      return { hasData: false, nodeCount: 0 }
    }
  }
  
  /**
   * Neo4j에서 기존 그래프 데이터 로드
   */
  async function loadExistingGraphData(): Promise<boolean> {
    try {
      addMessage('message', '📥 기존 그래프 데이터 로드 중...')
      
      const result = await roboApi.getGraphData(sessionStore.getHeaders())
      
      // 디버깅: 로드된 데이터 상세 분석
      console.log('[loadExistingGraphData] 백엔드 응답:', {
        노드수: result.Nodes?.length || 0,
        관계수: result.Relationships?.length || 0
      })
      
      if (result.Relationships && result.Relationships.length > 0) {
        // 관계 타입별 개수 분석
        const relTypeCounts: Record<string, number> = {}
        for (const rel of result.Relationships) {
          const type = rel.Type || 'UNKNOWN'
          relTypeCounts[type] = (relTypeCounts[type] || 0) + 1
        }
        console.log('[loadExistingGraphData] 관계 타입별 개수:', relTypeCounts)
      }
      
      if (result.Nodes && result.Nodes.length > 0) {
        // 노드 라벨별 개수 분석
        const labelCounts: Record<string, number> = {}
        for (const node of result.Nodes) {
          const labels = node.Labels || ['UNKNOWN']
          for (const label of labels) {
            labelCounts[label] = (labelCounts[label] || 0) + 1
          }
        }
        console.log('[loadExistingGraphData] 노드 라벨별 개수:', labelCounts)
        
        updateGraphData(result.Nodes, result.Relationships || [])
        addMessage('message', `✅ 그래프 데이터 로드 완료: ${result.Nodes.length}개 노드, ${result.Relationships?.length || 0}개 관계`)
        return true
      } else {
        addMessage('message', 'ℹ️ 기존 그래프 데이터가 없습니다.')
        return false
      }
    } catch (error) {
      console.warn('기존 그래프 데이터 로드 실패:', error)
      addMessage('error', `❌ 그래프 데이터 로드 실패: ${error}`)
      return false
    }
  }
  
  /**
   * 파일 업로드 후 파싱 → 분석 → 인제스천 순차 실행
   * 기존 데이터가 있으면 모달을 통해 처리 방법을 선택합니다.
   */
  async function uploadFiles(files: File[], meta: BackendRequestMetadata) {
    // 업로드 전에 기존 데이터 확인
    addMessage('message', '🔍 기존 데이터 확인 중...')
    const { hasData, nodeCount } = await checkExistingData()
    
    if (hasData) {
      // 모달 표시를 위해 상태 저장
      pendingNodeCount.value = nodeCount
      pendingUploadFiles.value = files
      pendingUploadMeta.value = meta
      pendingAction.value = 'upload' // 업로드 액션으로 표시
      showDataConfirmModal.value = true
      return // 모달에서 사용자 선택을 기다림
    }
    
    // 기존 데이터가 없으면 바로 진행
    await executeUploadPipeline(files, meta)
  }
  
  /**
   * 데이터 확인 모달에서 사용자 선택 처리
   */
  async function handleDataConfirmAction(
    action: 'delete' | 'append' | 'cancel',
    nameCase: NameCaseOption = 'original'
  ) {
    showDataConfirmModal.value = false
    const currentAction = pendingAction.value
    
    // 대소문자 옵션 저장
    nameCaseOption.value = nameCase
    
    if (action === 'cancel') {
      addMessage('message', currentAction === 'restart' ? '⏹️ 인제스천이 취소되었습니다.' : '⏹️ 업로드가 취소되었습니다.')
      pendingUploadFiles.value = []
      pendingUploadMeta.value = null
      pendingAction.value = null
      return
    }
    
    if (action === 'delete') {
      // 기존 데이터 삭제
      addMessage('message', '🗑️ 기존 데이터 삭제 중...')
      try {
        await roboApi.delete(sessionStore.getHeaders())
        addMessage('message', '✅ 기존 데이터 삭제 완료')
        // 로컬 그래프 데이터도 초기화
        nodeMap.value.clear()
        linkMap.value.clear()
      } catch (error) {
        addMessage('error', `❌ 기존 데이터 삭제 실패: ${error}`)
        pendingUploadFiles.value = []
        pendingUploadMeta.value = null
        pendingAction.value = null
        throw error
      }
    } else if (action === 'append') {
      addMessage('message', '📎 기존 데이터에 추가합니다...')
    }
    
    // 대소문자 옵션 로그
    if (nameCase !== 'original') {
      addMessage('message', `🔤 메타데이터 ${nameCase === 'uppercase' ? '대문자' : '소문자'} 변환 적용`)
    }
    
    // pendingAction에 따라 분기 처리
    if (currentAction === 'restart') {
      // 인제스천 재시작
      pendingAction.value = null
      await executeRestartPipeline()
    } else {
      // 업로드 파이프라인 실행
      const files = pendingUploadFiles.value
      const meta = pendingUploadMeta.value
      pendingUploadFiles.value = []
      pendingUploadMeta.value = null
      pendingAction.value = null
      
      if (files.length > 0 && meta) {
        await executeUploadPipeline(files, meta)
      }
    }
  }
  
  /**
   * 실제 업로드 파이프라인 실행 (업로드 → 파싱 → 분석)
   */
  async function executeUploadPipeline(files: File[], meta: BackendRequestMetadata) {
    isProcessing.value = true
    completedSteps.value = 0
    clearMessages()
    
    try {
      // 1. 업로드
      await doUpload(files, meta)
      
      // 2. 파싱
      await doParse()
      
      // 3. 분석 (DDL 파싱 및 Neo4j 저장 포함)
      await doAnalyze()
      
      // 참고: 4단계 인제스천(doIngest)은 robo-analyzer에서 불필요
      // robo-analyzer는 분석 과정에서 이미 DDL을 파싱하여 Neo4j에 저장함
      
      currentStep.value = '전체 처리 완료'
      addMessage('message', '🎉 전체 처리가 완료되었습니다!')
    } catch (error) {
      addMessage('error', `❌ 처리 실패: ${error}`)
      currentStep.value = '처리 실패'
      throw error
    } finally {
      isProcessing.value = false
    }
  }
  
  // ==========================================================================
  // Actions - 파이프라인 제어
  // ==========================================================================
  
  /**
   * 파이프라인 재시작 (이미 업로드된 파일로 파싱 → 분석 재실행)
   * 기존 데이터가 있으면 모달을 통해 처리 방법을 선택합니다.
   */
  async function restartPipeline(): Promise<void> {
    console.log('[restartPipeline] 시작', { 
      sourceType: sourceType.value,
      filesCount: uploadedFiles.value.length,
      ddlCount: uploadedDdlFiles.value.length
    })
    
    if (uploadedFiles.value.length === 0 && uploadedDdlFiles.value.length === 0) {
      addMessage('error', '❌ 업로드된 파일이 없습니다.')
      return
    }
    
    // 인제스천 전에 기존 데이터 확인
    addMessage('message', '🔍 기존 데이터 확인 중...')
    const { hasData, nodeCount } = await checkExistingData()
    
    if (hasData) {
      // 모달 표시를 위해 상태 저장
      pendingNodeCount.value = nodeCount
      pendingAction.value = 'restart' // 인제스천 재시작 액션으로 표시
      showDataConfirmModal.value = true
      return // 모달에서 사용자 선택을 기다림
    }
    
    // 기존 데이터가 없으면 바로 진행
    await executeRestartPipeline()
  }
  
  /**
   * 실제 인제스천 재시작 파이프라인 실행 (파싱 → 분석)
   */
  async function executeRestartPipeline(): Promise<void> {
    isProcessing.value = true
    completedSteps.value = 0
    clearMessages()
    
    try {
      addMessage('message', `🔄 인제스천 재시작... (타입: ${sourceType.value})`)
      
      // 파싱부터 재실행
      await doParse()
      
      // 분석 (DDL 파싱 및 Neo4j 저장 포함)
      await doAnalyze()
      
      currentStep.value = '전체 처리 완료'
      addMessage('message', '🎉 인제스천이 완료되었습니다!')
    } catch (error) {
      console.error('[restartPipeline] 실패:', error)
      addMessage('error', `❌ 인제스천 실패: ${error}`)
      currentStep.value = '처리 실패'
      throw error
    } finally {
      isProcessing.value = false
    }
  }
  
  /**
   * 업로드된 파일 삭제
   * @param relPath 삭제할 파일의 상대 경로
   * @param type 파일 타입 ('file' | 'ddl')
   */
  function removeFile(relPath: string, type: 'file' | 'ddl' = 'file'): void {
    console.log(`[removeFile] 파일 삭제: ${relPath}, 타입: ${type}`)
    
    if (type === 'ddl') {
      uploadedDdlFiles.value = uploadedDdlFiles.value.filter(
        f => f.fileName !== relPath
      )
    } else {
      uploadedFiles.value = uploadedFiles.value.filter(
        f => f.fileName !== relPath
      )
    }
    
    // LocalStorage에 즉시 저장
    saveToStorage()
    
    addMessage('message', `🗑️ 파일 삭제됨: ${relPath}`)
  }
  
  /**
   * 모든 업로드된 파일 삭제
   * @param type 삭제할 파일 타입 ('file' | 'ddl' | 'all')
   */
  function clearAllFiles(type: 'file' | 'ddl' | 'all' = 'all'): void {
    console.log(`[clearAllFiles] 전체 파일 삭제: 타입=${type}`)
    
    let deletedCount = 0
    
    if (type === 'all' || type === 'file') {
      deletedCount += uploadedFiles.value.length
      uploadedFiles.value = []
    }
    
    if (type === 'all' || type === 'ddl') {
      deletedCount += uploadedDdlFiles.value.length
      uploadedDdlFiles.value = []
    }
    
    // LocalStorage에 즉시 저장
    saveToStorage()
    
    addMessage('message', `🗑️ ${deletedCount}개 파일 전체 삭제됨`)
  }
  
  /**
   * 파이프라인 상태 조회
   */
  async function fetchPipelineStatus(): Promise<void> {
    try {
      pipelineStatus.value = await roboApi.getPipelineStatus(sessionStore.getHeaders())
      isPipelinePaused.value = pipelineStatus.value?.isPaused || false
      isPipelineStopped.value = pipelineStatus.value?.isStopped || false
    } catch (error) {
      console.error('파이프라인 상태 조회 실패:', error)
    }
  }
  
  /**
   * 파이프라인 단계 정보 조회
   */
  async function fetchPipelinePhases(): Promise<void> {
    try {
      pipelinePhases.value = await roboApi.getPipelinePhases()
    } catch (error) {
      console.error('파이프라인 단계 정보 조회 실패:', error)
    }
  }
  
  /**
   * 파이프라인 일시정지
   */
  async function pausePipeline(): Promise<void> {
    try {
      const result = await roboApi.controlPipeline('pause', sessionStore.getHeaders())
      pipelineStatus.value = result.status
      isPipelinePaused.value = result.status.isPaused
      if (result.success) {
        addMessage('message', '⏸️ 파이프라인 일시정지 요청됨')
      }
    } catch (error) {
      addMessage('error', `⏸️ 일시정지 실패: ${error}`)
    }
  }
  
  /**
   * 파이프라인 재개
   */
  async function resumePipeline(): Promise<void> {
    try {
      const result = await roboApi.controlPipeline('resume', sessionStore.getHeaders())
      pipelineStatus.value = result.status
      isPipelinePaused.value = result.status.isPaused
      if (result.success) {
        addMessage('message', '▶️ 파이프라인 재개됨')
      }
    } catch (error) {
      addMessage('error', `▶️ 재개 실패: ${error}`)
    }
  }
  
  /**
   * 파이프라인 중단
   */
  async function stopPipeline(): Promise<void> {
    try {
      const result = await roboApi.controlPipeline('stop', sessionStore.getHeaders())
      pipelineStatus.value = result.status
      isPipelineStopped.value = result.status.isStopped
      if (result.success) {
        addMessage('message', '⏹️ 파이프라인 중단됨')
      }
    } catch (error) {
      addMessage('error', `⏹️ 중단 실패: ${error}`)
    }
  }
  
  // ==========================================================================
  // Actions - 기타
  // ==========================================================================
  
  /**
   * 모든 데이터 삭제
   */
  async function deleteAllData(): Promise<void> {
    try {
      await roboApi.delete(sessionStore.getHeaders())
      reset()
    } catch (error) {
      console.error('삭제 실패:', error)
      throw error
    }
  }
  
  /**
   * 전체 상태 리셋
   */
  function reset(): void {
    // 메타데이터
    ddl.value = []
    
    // 파일
    uploadedFiles.value = []
    uploadedDdlFiles.value = []
    
    // 그래프
    clearGraphData()
    
    // 프로세스
    isProcessing.value = false
    currentStep.value = ''
    
    // 메시지
    consoleMessages.value = []
    
    // LocalStorage 삭제
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch (e) {
      console.warn('LocalStorage 삭제 실패:', e)
    }
  }
  
  // ==========================================================================
  // Return
  // ==========================================================================
  
  return {
    // State
    sourceType,
    ddl,
    uploadedFiles,
    uploadedDdlFiles,
    graphData,
    isProcessing,
    currentStep,
    totalSteps,
    completedSteps,
    consoleMessages,
    graphEvents,
    
    // State - 데이터 확인 모달
    showDataConfirmModal,
    pendingNodeCount,
    
    // State - 파이프라인 제어
    pipelineStatus,
    pipelinePhases,
    isPipelinePaused,
    isPipelineStopped,
    
    // Computed (하위호환성: uploadMessages로도 접근 가능)
    uploadMessages: consoleMessages,
    metadata,
    analyzeMeta,
    isValidConfig,
    
    // Actions - Setters
    setSourceType,
    setDdl,
    
    // Actions - Messages
    addMessage,
    clearMessages,
    
    // Actions - Graph Events
    addGraphEvent,
    clearGraphEvents,
    
    // Actions - Pipeline
    uploadFiles,
    handleDataConfirmAction,
    loadExistingGraphData,
    restartPipeline,
    removeFile,
    clearAllFiles,
    
    // Actions - Pipeline Control
    fetchPipelineStatus,
    fetchPipelinePhases,
    pausePipeline,
    resumePipeline,
    stopPipeline,
    
    // Actions - Misc
    deleteAllData,
    deleteNodeAndRelationships,
    reset
  }
})
