/**
 * analyzer.ts
 * 코드 분석 파이프라인 + 그래프 데이터 + 콘솔 메시지 + 그래프 이벤트 통합 스토어.
 *
 * 책임:
 * - 프로젝트 메타데이터 (sourceType, ddl, nameCase 등)
 * - 파일 업로드/파싱/분석 (순차 파이프라인) — antlrApi + roboApi 호출
 * - 그래프 데이터 누적 (Neo4j 응답 → nodeMap/linkMap)
 * - 통합 콘솔 메시지 (파이프라인 진행 로그)
 * - 그래프 이벤트 피드 (노드/관계 생성 실시간 표시)
 * - 파이프라인 제어 (pause/resume/stop)
 * - 데이터 확인 모달 (기존 데이터 발견 시 사용자 선택)
 *
 * 모든 사용처는 `useAnalyzerStore()` 로 접근.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { logger } from '@/shared/utils/logger'
import { STORAGE_KEYS } from '@/shared/config/storageKeys'
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
  NameCaseOption,
  AnalyzeEvent,
} from '@/shared/types'
import { useSessionStore } from '@/shared/stores/session'
import { antlrApi, roboApi } from '@/features/code-analysis/api'

// ============================================================================
// 라벨 분류 — 멀티라벨에서 sub-label 우선 (역할 라벨은 후순위)
// ============================================================================

const PRIMARY_LABELS = new Set([
  'MODULE', 'FUNCTION', 'VARIABLE', 'CONSTANT', 'PACKAGE', 'FIELD',
  'INTERNAL', 'EXTERNAL',
  'Endpoint', 'Query', 'Command', 'Getter', 'Setter', 'Lifecycle',
  'Scheduled', 'EventHandler', 'Init', 'Transactional', 'Validation', 'BusinessLogic',
])

function extractSubLabel(labels: readonly string[]): string {
  return labels.find(l => !PRIMARY_LABELS.has(l)) ?? labels[0] ?? 'Unknown'
}

// ============================================================================
// 그래프 이벤트 (피드) 타입
// ============================================================================

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

const MAX_GRAPH_EVENTS = 500

type MessageType = StreamMessage['type']

function createTimestamp(): string {
  return new Date().toISOString()
}

// ============================================================================
// Neo4j 변환 유틸
// ============================================================================

function convertNeo4jNode(node: Neo4jNode): GraphNode {
  const labels = node['Labels'] || []
  const properties = node['Properties'] || {}
  return {
    id: node['Node ID'],
    labels,
    properties,
  }
}

function convertNeo4jRelationship(rel: Neo4jRelationship): GraphLink {
  return {
    id: rel['Relationship ID'],
    source: rel['Start Node ID'],
    target: rel['End Node ID'],
    type: rel['Type'],
    properties: rel['Properties'],
  }
}

/**
 * analyzer step 함수명 → 진행 표시용 한글 라벨. 표시 전용(백엔드 순서는 모름).
 * 미등록 step 은 generic 변환(_step 제거·언더스코어→공백)으로 폴백 → 백엔드가 step 추가해도 안 깨짐.
 */
const STEP_LABELS: Record<string, string> = {
  parse_ddl_step: 'DDL 파싱',
  load_ast_step: 'AST 적재',
  scan_codebase_step: '코드베이스 스캔',
  link_deterministic_step: '결정론 연결',
  link_calls_by_name_step: '호출 이름 분류',
  link_residual_patterns_step: '잔여 패턴 연결',
  link_dbms_tables_step: 'DBMS 테이블 연결',
  link_calls_by_ast_step: 'AST 호출 분류',
  build_context_step: '분석 컨텍스트 구성',
  fetch_table_samples_step: '테이블 샘플 조회',
  analyze_function_step: '함수 분석',
  summarize_module_step: '모듈 요약',
  enrich_table_description_step: '테이블 설명 강화',
  enrich_lineage_from_catalog_step: '리니지 보강',
  build_components_step: '컴포넌트 군집화',
  health_metrics_step: '건강 지표',
  embed_step: '임베딩',
}

function stepLabel(node: string): string {
  return STEP_LABELS[node] || node.replace(/_step$/, '').replace(/_/g, ' ') || '단계'
}

/** 노드 properties + labels 에서 사람이 읽기 쉬운 이름 추출 */
function resolveNodeName(
  properties: Record<string, unknown>,
  labels: string[],
  nodeId: string,
): string {
  const name = properties['name']
  if (name) return String(name)
  const kind = extractSubLabel(labels) || (properties['type'] as string) || ''
  const line = properties['start_line']
  if (kind) return line != null && line !== 0 ? `${kind} [${line}]` : kind
  const idVal = properties['id']
  if (idVal) return String(idVal).split('.').pop() || String(idVal)
  return nodeId
}

// ============================================================================
// 스토어
// ============================================================================

export const useAnalyzerStore = defineStore('analyzer', () => {
  const sessionStore = useSessionStore()

  // ----- 프로젝트 메타데이터 -----
  const sourceType = ref<SourceType>('java')
  const ddl = ref<string[]>([])
  const nameCaseOption = ref<'original' | 'uppercase' | 'lowercase'>('original')
  // Electron 경로 모드: host(architect)가 넘긴 로컬 폴더 절대경로. null이면 브라우저 업로드 모드.
  const projectRoot = ref<string | null>(null)

  // ----- 파일 -----
  const uploadedFiles = ref<UploadedFile[]>([])
  const uploadedDdlFiles = ref<UploadedFile[]>([])

  function saveToStorage() {
    try {
      const state = {
        sourceType: sourceType.value,
        uploadedFiles: uploadedFiles.value,
        uploadedDdlFiles: uploadedDdlFiles.value,
      }
      localStorage.setItem(STORAGE_KEYS.PROJECT_STATE, JSON.stringify(state))
    } catch (e) {
      logger.warn('LocalStorage 저장 실패:', e)
    }
  }

  function restoreFromStorage() {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.PROJECT_STATE)
      if (saved) {
        const state = JSON.parse(saved)
        if (state.sourceType) sourceType.value = state.sourceType
        if (state.uploadedFiles) uploadedFiles.value = state.uploadedFiles
        if (state.uploadedDdlFiles) uploadedDdlFiles.value = state.uploadedDdlFiles
        logger.debug('[analyzer] 상태 복원됨')
      }
    } catch (e) {
      logger.warn('LocalStorage 복원 실패:', e)
    }
  }

  restoreFromStorage()

  // ----- 그래프 데이터 (Map 기반 — id 로 덮어쓰기) -----
  const nodeMap = ref<Map<string, GraphNode>>(new Map())
  const linkMap = ref<Map<string, GraphLink>>(new Map())

  /**
   * 의미데이터 전용 링크 채널 (HAS_RULE / HAS_EXAMPLE / HAS_QUESTION).
   * 시각 그래프(캔버스·트리·graphData)에는 절대 넣지 않고 여기에만 적재 →
   * 노드 디테일 패널이 함수→규칙→예시·질문을 보고서로 읽는 유일한 소스.
   * (RULE/EXAMPLE/QUESTION 노드 자체는 nodeMap 에 그대로 존재하나, 이 링크가 없으면
   *  어느 함수 소속인지 알 수 없어 과거엔 ingest 에서 통째로 버려졌음.)
   */
  const semanticLinkMap = ref<Map<string, GraphLink>>(new Map())

  /**
   * 임시: 비즈니스 로직 메타 라벨은 화면에 표시하지 않음.
   * 풀려면 이 set 을 비우고 재인제스션하면 됨.
   */
  const HIDDEN_NODE_LABELS = new Set(['RULE', 'EXAMPLE', 'QUESTION'])

  /**
   * 화면에 노출하지 않는 관계 타입.
   * - 메타·문서성 링크 (HAS_RULE/EXAMPLE/QUESTION) : 대응 노드 자체도 숨김.
   * - 정렬/추적용 링크 (NEXT, BRANCH) : 호출 흐름이 아니라서 그래프를 어지럽게 함.
   * - 코드 참조 보조 링크 (REFERENCES, AFFECTS_TABLE) : 의미가 모호하고 양이 많음.
   * 풀려면 이 set 만 비우면 됨. 데이터는 그대로 두고 표시만 차단.
   */
  const HIDDEN_LINK_TYPES = new Set([
    'NEXT',
    'REFERENCES',
    'HAS_RULE',
    'HAS_EXAMPLE',
    'HAS_QUESTION',
    'AFFECTS_TABLE',
    'BRANCH',
  ])

  /**
   * 의미데이터 링크 — 시각 그래프엔 안 넣고 semanticLinkMap 으로 따로 적재(패널 전용).
   * 과거엔 HIDDEN_LINK_TYPES 로 ingest 에서 버려졌으나, 노드패널 보고서를 위해 보존한다.
   */
  const SEMANTIC_LINK_TYPES = new Set(['HAS_RULE', 'HAS_EXAMPLE', 'HAS_QUESTION'])

  function isHiddenNode(node: GraphNode): boolean {
    return (node.labels || []).some(l => HIDDEN_NODE_LABELS.has(l))
  }

  function isHiddenLink(link: GraphLink, nodes: Map<string, GraphNode>): boolean {
    if (HIDDEN_LINK_TYPES.has(link.type)) return true
    const src = nodes.get(link.source)
    if (src && isHiddenNode(src)) return true
    const tgt = nodes.get(link.target)
    if (tgt && isHiddenNode(tgt)) return true
    return false
  }

  const graphData = computed<GraphData>(() => {
    const nodes = Array.from(nodeMap.value.values()).filter(n => !isHiddenNode(n))
    const visibleIds = new Set(nodes.map(n => n.id))
    const links = Array.from(linkMap.value.values()).filter(
      l => !HIDDEN_LINK_TYPES.has(l.type) && visibleIds.has(l.source) && visibleIds.has(l.target)
    )
    return { nodes, links }
  })

  function updateGraphData(nodes: Neo4jNode[], relationships: Neo4jRelationship[]): void {
    const newNodeMap = new Map(nodeMap.value)
    const newLinkMap = new Map(linkMap.value)
    const newSemanticMap = new Map(semanticLinkMap.value)

    for (const node of nodes) {
      const converted = convertNeo4jNode(node)
      newNodeMap.set(converted.id, converted)
    }

    // 노드보다 관계가 먼저 도착하는 경우 (다른 batch · 다른 phase) 에도
    // 일단 link 는 등록. 노드는 이후 batch 에서 들어오면 자동으로 연결됨.
    // 의미데이터 링크는 semanticLinkMap 으로 분리, hidden 타입/끝점은 적재 안 함.
    for (const rel of relationships) {
      const converted = convertNeo4jRelationship(rel)
      if (SEMANTIC_LINK_TYPES.has(converted.type)) {
        newSemanticMap.set(converted.id, converted)
        continue
      }
      if (isHiddenLink(converted, newNodeMap)) continue
      newLinkMap.set(converted.id, converted)
    }

    nodeMap.value = newNodeMap
    linkMap.value = newLinkMap
    semanticLinkMap.value = newSemanticMap
  }

  function clearGraphData(): void {
    nodeMap.value = new Map()
    linkMap.value = new Map()
    semanticLinkMap.value = new Map()
  }

  // ----- 콘솔 메시지 -----
  const consoleMessages = ref<StreamMessage[]>([])

  function addMessage(type: MessageType, content: string): void {
    consoleMessages.value.push({ type, content, timestamp: createTimestamp() })
  }

  function clearMessages(): void {
    consoleMessages.value = []
  }

  // ----- 그래프 이벤트 (피드) -----
  const graphEvents = ref<GraphEvent[]>([])
  let graphEventIdCounter = 0
  /** 같은 배치 내 노드 이름을 관계 이벤트가 재사용할 수 있도록 유지하는 캐시 */
  const nodeNameCache = new Map<string, string>()

  function addGraphEvent(event: Omit<GraphEvent, 'id' | 'timestamp'>): void {
    graphEventIdCounter++
    graphEvents.value.push({
      ...event,
      id: `ge-${graphEventIdCounter}`,
      timestamp: createTimestamp(),
    })
    if (graphEvents.value.length > MAX_GRAPH_EVENTS) {
      graphEvents.value = graphEvents.value.slice(-MAX_GRAPH_EVENTS)
    }
  }

  function clearGraphEvents(): void {
    graphEvents.value = []
    graphEventIdCounter = 0
  }

  /**
   * 스트림 단건 그래프 노드 병합 (node_event). nodeMap 갱신 + 이벤트 피드 추가.
   * 백엔드가 함수 단위로 node_event 를 누적 emit → 라이브 렌더.
   */
  function mergeStreamNode(label: string, id: string, props: Record<string, unknown>): void {
    const labels = label ? [label] : []
    const node: GraphNode = { id, labels, properties: props }
    const next = new Map(nodeMap.value)
    next.set(id, node)
    nodeMap.value = next

    const nodeName = resolveNodeName(props, labels, id)
    nodeNameCache.set(id, nodeName)
    addGraphEvent({ type: 'node', action: 'created', nodeType: extractSubLabel(labels), nodeName })
  }

  /**
   * 스트림 단건 그래프 엣지 병합 (relationship_event). Table 끝점은 id 대신 name 으로 온다.
   * hidden 타입/끝점이면 적재하지 않는다(graphData 표시 정책과 동일).
   */
  function mergeStreamRelationship(
    relType: string,
    from: { id: string; rule_id?: string },
    to: { id?: string; name?: string; rule_id?: string },
    props: Record<string, unknown>,
  ): void {
    const target = to.id ?? to.name
    if (!target) return
    const link: GraphLink = {
      id: `${relType}|${from.id}|${target}|${from.rule_id ?? ''}|${to.rule_id ?? ''}`,
      source: from.id,
      target,
      type: relType,
      properties: props,
    }
    // 의미데이터 링크(HAS_RULE/EXAMPLE/QUESTION)는 패널 전용 채널로만 — 캔버스/트리/그래프 미오염.
    if (SEMANTIC_LINK_TYPES.has(relType)) {
      const nextSem = new Map(semanticLinkMap.value)
      nextSem.set(link.id, link)
      semanticLinkMap.value = nextSem
      return
    }
    if (isHiddenLink(link, nodeMap.value)) return
    const next = new Map(linkMap.value)
    next.set(link.id, link)
    linkMap.value = next

    addGraphEvent({
      type: 'relationship', action: 'created', relType,
      source: nodeNameCache.get(from.id) ?? from.id,
      target: nodeNameCache.get(target) ?? target,
    })
  }

  // ----- 프로세스 상태 -----
  const isProcessing = ref(false)
  const currentStep = ref('')
  const totalPhases = ref(6) // 첫 phase_event 의 totalPhases 로 동적 조정됨
  const currentPhase = ref(0)
  const currentPhaseProgress = ref(0)
  const currentPhaseName = ref('')
  // backend phase_event (num, name) 누적 — strategy 별 단계 흐름 그대로 표시
  const dynamicSteps = ref<{ num: number; name: string }[]>([])

  // ----- 데이터 확인 모달 -----
  const showDataConfirmModal = ref(false)
  const pendingNodeCount = ref(0)
  const pendingUploadFiles = ref<File[]>([])
  const pendingUploadMeta = ref<BackendRequestMetadata | null>(null)
  const pendingAction = ref<'upload' | 'restart' | null>(null)

  // ----- 파이프라인 제어 (진행 상태는 분석 NDJSON 스트림의 phase_event 단일 채널) -----
  const isPipelinePaused = ref(false)

  // ----- 메타데이터 -----
  const datasourceName = ref<string | null>(null)
  const inferFkRelations = ref(false)

  const metadata = computed<ProjectMetadata>(() => ({
    sourceType: sourceType.value,
    ddl: ddl.value,
  }))

  const analyzeMeta = computed<BackendRequestMetadata>(() => ({
    strategy: (sourceType.value === 'oracle' || sourceType.value === 'postgresql') ? 'dbms' : 'framework',
    target: sourceType.value,
    nameCase: nameCaseOption.value,
    datasourceName: datasourceName.value,
    inferFkRelations: inferFkRelations.value,
    project_root: projectRoot.value || undefined,   // 경로 모드면 antlr·robo 둘 다 이 경로 사용
  }))

  /** host가 projectRoot를 넘겼는가 = Electron 경로 모드(업로드 없이 로컬 폴더 분석). */
  const isPathMode = computed(() => !!projectRoot.value)

  // ----- Setters -----
  function setProjectRoot(p: string | null): void { projectRoot.value = p }
  function setDatasourceName(name: string | null): void { datasourceName.value = name }
  function setInferFkRelations(value: boolean): void { inferFkRelations.value = value }

  // ----- 개별 단계 함수 -----

  async function doUpload(files: File[], meta: BackendRequestMetadata) {
    currentStep.value = '[1단계] 파일 업로드 중...'
    addMessage('message', `🚀 파일 업로드 시작 (${files.length}개 파일)`)

    const result = await antlrApi.uploadFiles(meta, files, sessionStore.getHeaders())

    sourceType.value = meta.target as SourceType
    uploadedFiles.value = result.files
    uploadedDdlFiles.value = result.ddlFiles

    saveToStorage()

    addMessage('message', `✅ 업로드 완료: 소스 ${result.files.length}개, DDL ${result.ddlFiles.length}개`)
    return result
  }

  async function doParse() {
    currentStep.value = '[2단계] 파싱 중...'
    addMessage('message', '🔧 파싱 시작...')

    await antlrApi.parseStream(
      analyzeMeta.value,
      sessionStore.getHeaders(),
      (event) => {
        switch (event.type) {
          case 'detected': applyDetected(event.content); break
          case 'message':
          case 'error':
          case 'warning': logToConsole(event); break
          // antlr 'complete'·system_log 등은 무시(스트림 종료로 처리)
        }
      }
    )

    addMessage('message', '✅ 파싱 완료')
  }

  /**
   * antlr 가 자동 감지한 언어를 sourceType 에 반영 — 사용자가 수동 선택하지 않아도 자동.
   * sourceType 이 analyzeMeta(strategy/target) 와 UML 탭 노출을 파생하므로, 이것만 세팅하면
   * 이어지는 doAnalyze(robo) 가 올바른 strategy 를 받는다.
   */
  function applyDetected(content?: string): void {
    if (!content) return
    try {
      const detected = JSON.parse(content) as { target?: SourceType }
      if (detected.target) {
        sourceType.value = detected.target
        saveToStorage()
      }
    } catch (e) {
      logger.warn('[analyzer] detected 이벤트 파싱 실패:', e)
    }
  }

  // ----- 스트림 이벤트 핸들러 (콜백은 type 별로 이 함수들에 디스패치만) -----

  /** message·error·warning → 콘솔 메시지 피드. */
  function logToConsole(event: AnalyzeEvent): void {
    if (event.content) addMessage(event.type === 'error' ? 'error' : 'message', event.content)
  }

  /**
   * phase_event(analyzer 진행) → 진행 상태 refs 갱신.
   * 백엔드 wire 는 `event`(start/node_done/stopped/complete/paused/resumed) + 완료 step `node` 다.
   * node_done 한 건 = step 하나 완료 → 타임라인(dynamicSteps)에 정확히 누적하고,
   * % 는 strategy 별 예상 단계수(totalPhases) 대비 추정치(완료 전까지 99% 상한)로 표시한다.
   */
  function applyPhaseEvent(event: AnalyzeEvent): void {
    switch (event.event) {
      case 'start':
        dynamicSteps.value = []
        currentPhase.value = 0
        currentPhaseProgress.value = 0
        currentStep.value = '분석 시작...'
        break
      case 'node_done': {
        const label = stepLabel(event.node ?? '')
        const num = dynamicSteps.value.length
        dynamicSteps.value = [...dynamicSteps.value, { num, name: label }]
        currentPhase.value = num
        currentPhaseName.value = label
        currentStep.value = `${label} 완료`
        currentPhaseProgress.value = Math.min(99, Math.round((num + 1) / totalPhases.value * 100))
        break
      }
      case 'complete':
        currentPhaseProgress.value = 100
        currentStep.value = '분석 완료 ✓'
        break
      case 'stopped':
        currentStep.value = '중단됨'
        break
      case 'paused':
        isPipelinePaused.value = true
        break
      case 'resumed':
        isPipelinePaused.value = false
        break
    }
  }

  /** node_event/relationship_event(라이브 그래프) → 그래프 병합. */
  function applyGraphEvent(event: AnalyzeEvent): void {
    if (event.type === 'node_event' && event.id) {
      mergeStreamNode(event.label ?? '', event.id, event.props ?? {})
    } else if (event.type === 'relationship_event' && event.from?.id && event.to && event.rel_type) {
      mergeStreamRelationship(
        event.rel_type,
        { id: event.from.id, rule_id: event.from.rule_id },
        event.to,
        event.props ?? {},
      )
    }
  }

  async function doAnalyze(): Promise<void> {
    currentStep.value = '🧠 AI 분석 진행 중...'
    clearGraphEvents()
    dynamicSteps.value = []
    // % 추정용 예상 단계수(node_done 개수). 타임라인은 정확, 바는 추정(완료 시 100% 보정).
    totalPhases.value = analyzeMeta.value.strategy === 'dbms' ? 13 : 14
    addMessage('message', '🔍 분석 시작...')

    await roboApi.analyze(
      analyzeMeta.value,
      sessionStore.getHeaders(),
      (event) => {
        switch (event.type) {
          case 'phase_event': applyPhaseEvent(event); break
          case 'node_event':
          case 'relationship_event': applyGraphEvent(event); break
          case 'message':
          case 'error':
          case 'warning': logToConsole(event); break
          // system_log·tool_event·todo_update·processing_event 등 미렌더 타입은 무시
        }
      }
    )

    addMessage('message', '✅ 분석 완료')
    currentPhaseProgress.value = 100

    // 스트리밍으로 누적된 그래프를 그대로 유지 — clearGraphData 하면 분석 중 보여주던 노드가
    // 깜빡임. 최종 정합성 확보를 위해 백엔드에서 한 번 더 fetch 하되, swap 패턴 (가져온 뒤 합치기) 으로.
    try {
      const result = await roboApi.getGraphData(sessionStore.getHeaders())
      if (result.Nodes && result.Nodes.length > 0) {
        updateGraphData(result.Nodes, result.Relationships || [])
      }
    } catch (e) {
      logger.warn('분석 후 Neo4j 데이터 재로드 실패:', e)
    }
  }

  // ----- 통합 파이프라인 -----

  async function checkExistingData(): Promise<{ hasData: boolean; nodeCount: number }> {
    try {
      return await roboApi.checkData(sessionStore.getHeaders())
    } catch (error) {
      logger.warn('기존 데이터 확인 실패:', error)
      return { hasData: false, nodeCount: 0 }
    }
  }

  async function loadExistingGraphData(): Promise<boolean> {
    try {
      addMessage('message', '📥 기존 그래프 데이터 로드 중...')

      const result = await roboApi.getGraphData(sessionStore.getHeaders())

      logger.debug('[loadExistingGraphData] 백엔드 응답:', {
        노드수: result.Nodes?.length || 0,
        관계수: result.Relationships?.length || 0,
      })

      if (result.Relationships && result.Relationships.length > 0) {
        const relTypeCounts: Record<string, number> = {}
        for (const rel of result.Relationships) {
          const type = rel.Type || 'UNKNOWN'
          relTypeCounts[type] = (relTypeCounts[type] || 0) + 1
        }
        logger.debug('[loadExistingGraphData] 관계 타입별 개수:', relTypeCounts)
      }

      if (result.Nodes && result.Nodes.length > 0) {
        const labelCounts: Record<string, number> = {}
        for (const node of result.Nodes) {
          const labels = node.Labels || ['UNKNOWN']
          for (const label of labels) {
            labelCounts[label] = (labelCounts[label] || 0) + 1
          }
        }
        logger.debug('[loadExistingGraphData] 노드 라벨별 개수:', labelCounts)

        updateGraphData(result.Nodes, result.Relationships || [])
        addMessage('message', `✅ 그래프 데이터 로드 완료: ${result.Nodes.length}개 노드, ${result.Relationships?.length || 0}개 관계`)
        return true
      } else {
        addMessage('message', 'ℹ️ 기존 그래프 데이터가 없습니다.')
        return false
      }
    } catch (error) {
      logger.warn('기존 그래프 데이터 로드 실패:', error)
      addMessage('error', `❌ 그래프 데이터 로드 실패: ${error}`)
      return false
    }
  }

  async function uploadFiles(files: File[], meta: BackendRequestMetadata) {
    addMessage('message', '🔍 기존 데이터 확인 중...')
    const { hasData, nodeCount } = await checkExistingData()

    if (hasData) {
      pendingNodeCount.value = nodeCount
      pendingUploadFiles.value = files
      pendingUploadMeta.value = meta
      pendingAction.value = 'upload'
      showDataConfirmModal.value = true
      return
    }

    await executeUploadPipeline(files, meta)
  }

  async function handleDataConfirmAction(
    action: 'delete' | 'append' | 'cancel',
    nameCase: NameCaseOption = 'original'
  ) {
    showDataConfirmModal.value = false
    const currentAction = pendingAction.value

    nameCaseOption.value = nameCase

    if (action === 'cancel') {
      addMessage('message', currentAction === 'restart' ? '⏹️ 인제스천이 취소되었습니다.' : '⏹️ 업로드가 취소되었습니다.')
      pendingUploadFiles.value = []
      pendingUploadMeta.value = null
      pendingAction.value = null
      return
    }

    if (action === 'delete') {
      addMessage('message', '🗑️ 기존 데이터 삭제 중...')
      try {
        await roboApi.delete(sessionStore.getHeaders())
        addMessage('message', '✅ 기존 데이터 삭제 완료')
        clearGraphData()
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

    if (nameCase !== 'original') {
      addMessage('message', `🔤 메타데이터 ${nameCase === 'uppercase' ? '대문자' : '소문자'} 변환 적용`)
    }

    if (currentAction === 'restart') {
      pendingAction.value = null
      await executeRestartPipeline()
    } else {
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

  async function executeUploadPipeline(files: File[], meta: BackendRequestMetadata) {
    isProcessing.value = true
    currentPhase.value = 0
    currentPhaseProgress.value = 0
    clearMessages()

    try {
      await doUpload(files, meta)
      await doParse()
      await doAnalyze()

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

  // ----- 파이프라인 제어 -----

  async function restartPipeline(): Promise<void> {
    logger.debug('[restartPipeline] 시작', {
      sourceType: sourceType.value,
      filesCount: uploadedFiles.value.length,
      ddlCount: uploadedDdlFiles.value.length,
    })

    if (uploadedFiles.value.length === 0 && uploadedDdlFiles.value.length === 0) {
      addMessage('error', '❌ 업로드된 파일이 없습니다.')
      return
    }

    addMessage('message', '🔍 기존 데이터 확인 중...')
    const { hasData, nodeCount } = await checkExistingData()

    if (hasData) {
      pendingNodeCount.value = nodeCount
      pendingAction.value = 'restart'
      showDataConfirmModal.value = true
      return
    }

    await executeRestartPipeline()
  }

  async function executeRestartPipeline(): Promise<void> {
    isProcessing.value = true
    currentPhase.value = 0
    currentPhaseProgress.value = 0
    clearMessages()

    try {
      addMessage('message', '🔄 인제스천 시작...')
      await doParse()
      await doAnalyze()

      currentStep.value = '전체 처리 완료'
      addMessage('message', '🎉 인제스천이 완료되었습니다!')
    } catch (error) {
      logger.error('[restartPipeline] 실패:', error)
      addMessage('error', `❌ 인제스천 실패: ${error}`)
      currentStep.value = '처리 실패'
      throw error
    } finally {
      isProcessing.value = false
    }
  }

  /** 경로 모드(Electron): 업로드 없이 host가 준 로컬 폴더를 바로 파싱→분석(antlr·robo가 그 경로 직접 읽음). */
  async function analyzeProjectPath(): Promise<void> {
    if (!projectRoot.value) {
      addMessage('error', '❌ 분석할 폴더 경로가 없습니다.')
      return
    }
    await executeRestartPipeline()
  }

  function removeFile(relPath: string, type: 'file' | 'ddl' = 'file'): void {
    logger.debug(`[removeFile] 파일 삭제: ${relPath}, 타입: ${type}`)

    if (type === 'ddl') {
      uploadedDdlFiles.value = uploadedDdlFiles.value.filter(f => f.fileName !== relPath)
    } else {
      uploadedFiles.value = uploadedFiles.value.filter(f => f.fileName !== relPath)
    }

    saveToStorage()
    addMessage('message', `🗑️ 파일 삭제됨: ${relPath}`)
  }

  function clearAllFiles(type: 'file' | 'ddl' | 'all' = 'all'): void {
    logger.debug(`[clearAllFiles] 전체 파일 삭제: 타입=${type}`)
    let deletedCount = 0

    if (type === 'all' || type === 'file') {
      deletedCount += uploadedFiles.value.length
      uploadedFiles.value = []
    }
    if (type === 'all' || type === 'ddl') {
      deletedCount += uploadedDdlFiles.value.length
      uploadedDdlFiles.value = []
    }

    saveToStorage()
    addMessage('message', `🗑️ ${deletedCount}개 파일 전체 삭제됨`)
  }

  async function pausePipeline(): Promise<void> {
    try {
      const result = await roboApi.controlPipeline('pause', sessionStore.getHeaders())
      isPipelinePaused.value = result.status.isPaused
      if (result.success) addMessage('message', '⏸️ 파이프라인 일시정지 요청됨')
    } catch (error) {
      addMessage('error', `⏸️ 일시정지 실패: ${error}`)
    }
  }

  async function resumePipeline(): Promise<void> {
    try {
      const result = await roboApi.controlPipeline('resume', sessionStore.getHeaders())
      isPipelinePaused.value = result.status.isPaused
      if (result.success) addMessage('message', '▶️ 파이프라인 재개됨')
    } catch (error) {
      addMessage('error', `▶️ 재개 실패: ${error}`)
    }
  }

  // ----- 기타 -----

  async function deleteAllData(): Promise<void> {
    try {
      await roboApi.delete(sessionStore.getHeaders())
      reset()
    } catch (error) {
      logger.error('삭제 실패:', error)
      throw error
    }
  }

  function reset(): void {
    ddl.value = []
    uploadedFiles.value = []
    uploadedDdlFiles.value = []
    clearGraphData()
    isProcessing.value = false
    currentStep.value = ''
    clearMessages()

    try {
      localStorage.removeItem(STORAGE_KEYS.PROJECT_STATE)
    } catch (e) {
      logger.warn('LocalStorage 삭제 실패:', e)
    }
  }

  return {
    // State
    sourceType,
    ddl,
    uploadedFiles,
    uploadedDdlFiles,
    nodeMap,
    linkMap,
    semanticLinkMap,
    graphData,
    isProcessing,
    currentStep,
    totalPhases,
    currentPhase,
    currentPhaseProgress,
    currentPhaseName,
    dynamicSteps,
    consoleMessages,
    graphEvents,

    // 데이터 확인 모달
    showDataConfirmModal,
    pendingNodeCount,

    // 파이프라인 제어
    isPipelinePaused,

    metadata,
    analyzeMeta,
    projectRoot,
    isPathMode,
    setProjectRoot,
    analyzeProjectPath,

    // Setters
    setDatasourceName,
    setInferFkRelations,

    // Messages
    addMessage,
    clearMessages,

    // Graph events
    addGraphEvent,
    clearGraphEvents,

    // Pipeline
    uploadFiles,
    handleDataConfirmAction,
    loadExistingGraphData,
    restartPipeline,
    removeFile,
    clearAllFiles,

    // Pipeline control
    pausePipeline,
    resumePipeline,

    // Misc
    deleteAllData,
    reset,
  }
})
