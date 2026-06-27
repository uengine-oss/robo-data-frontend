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
import { ref, computed, watch } from 'vue'
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

// 부가 역할 라벨(외부 stub + stereotype) — 이걸 제외한 첫 라벨이 실제 종류(antlr type).
const PRIMARY_LABELS = new Set([
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
  // 식별키 = 논리 id(properties.id) 단일 — 스트림(mergeStreamNode)과 동일 키로 dedup.
  // elementId(Node ID)는 fetch 응답에만 있는 neo4j 내부키라 키로 쓰지 않는다(폴백만).
  return {
    id: (properties.id as string) || node['Node ID'],
    labels,
    properties,
  }
}

// 끝점은 elementId→논리 id 로 변환(elemToLogical), id 는 스트림 비-semantic 링크와 동일
// 형식(`type|src|tgt||`)으로 만들어 같은 엣지가 stream/fetch 양쪽서 dedup 되게 한다.
function convertNeo4jRelationship(
  rel: Neo4jRelationship,
  elemToLogical: Map<string, string>,
): GraphLink {
  const source = elemToLogical.get(rel['Start Node ID']) ?? rel['Start Node ID']
  const target = elemToLogical.get(rel['End Node ID']) ?? rel['End Node ID']
  return {
    id: `${rel['Type']}|${source}|${target}||`,
    source,
    target,
    type: rel['Type'],
    properties: rel['Properties'],
  }
}

/** 분석 진행 7단계(analyzer analysis_flow step1~step7) — 표시 순서대로. */
const PHASES = [
  'DDL 파싱',
  'AST 적재',
  '코드베이스 스캔',
  '관계 연결',
  '분석 컨텍스트 구성',
  '코드 분석',
  '후처리',
] as const

/** analyzer leaf step(node_done.node) → 7단계 인덱스. 키는 실제 emit 노드명. */
const STEP_TO_PHASE: Record<string, number> = {
  parse_ddl_step: 0,
  load_ast_step: 1,
  scan_codebase_step: 2,
  link_deterministic_step: 3,
  link_calls_by_name_step: 3,
  link_residual_patterns_step: 3,
  link_dbms_tables_step: 3,
  link_calls_by_ast_step: 3,
  build_context_step: 4,
  fetch_table_samples_step: 4,
  analyze_code_step: 5,
  summarize_module_step: 6,
  enrich_table_description_step: 6,
  enrich_lineage_from_catalog_step: 6,
  build_components_step: 6,
  health_metrics_step: 6,
  embed_step: 6,
}

/** 분석 파이프라인 leaf 실행 순서(전략별) — 단계 진행 표시의 단일 진실.
 *  "가장 최근 완료 leaf 의 *다음* leaf" 가 곧 지금 진행 중 단계 → 완료된 단계가 active 로 안 남고
 *  다음 단계가 진행중으로 표시됨. 다중 leaf 단계(관계연결/후처리)에서 overshoot 없음. */
const ORDERED_LEAVES_FRAMEWORK = [
  'parse_ddl_step', 'load_ast_step', 'scan_codebase_step',
  'link_deterministic_step', 'link_calls_by_name_step', 'link_residual_patterns_step',
  'build_context_step', 'fetch_table_samples_step', 'analyze_code_step',
  'summarize_module_step', 'enrich_table_description_step', 'build_components_step',
  'health_metrics_step', 'embed_step',
] as const
const ORDERED_LEAVES_DBMS = [
  'parse_ddl_step', 'load_ast_step',
  'link_dbms_tables_step', 'link_calls_by_ast_step',
  'build_context_step', 'fetch_table_samples_step', 'analyze_code_step',
  'summarize_module_step', 'enrich_table_description_step', 'enrich_lineage_from_catalog_step',
  'build_components_step', 'health_metrics_step', 'embed_step',
] as const

/** leaf 실행 순서에서 다음에 실행할(=현재 진행 중) leaf step 이름. 전부 완료면 null. */
function nextRunningLeaf(doneLeaves: Set<string>, strategy: string | undefined): string | null {
  const order = strategy === 'dbms' ? ORDERED_LEAVES_DBMS : ORDERED_LEAVES_FRAMEWORK
  let maxDoneIdx = -1
  for (let i = 0; i < order.length; i++) if (doneLeaves.has(order[i])) maxDoneIdx = i
  const nextIdx = maxDoneIdx + 1                    // 미상/스킵에 견고 — 최고 완료 인덱스 다음
  return nextIdx < order.length ? order[nextIdx] : null
}

/** 완료 leaf 집합 → 지금 진행 중 단계 인덱스(완료 leaf 다음 leaf 의 단계). 전부 완료면 PHASES.length. */
function runningPhaseIndex(doneLeaves: Set<string>, strategy: string | undefined): number {
  const leaf = nextRunningLeaf(doneLeaves, strategy)
  return leaf === null ? PHASES.length : (STEP_TO_PHASE[leaf] ?? 0)
}

/** leaf step → 진행 중 단계에 보일 사용자 세부 문구. */
const STEP_SUBLABEL: Record<string, string> = {
  parse_ddl_step: '테이블 정의 읽는 중',
  load_ast_step: '코드 구조 불러오는 중',
  scan_codebase_step: '소스 훑어보는 중',
  link_deterministic_step: '확실한 관계 잇는 중',
  link_calls_by_name_step: '함수 호출 분석 중',
  link_residual_patterns_step: '남은 관계 보완 중',
  link_dbms_tables_step: '테이블 사용 연결 중',
  link_calls_by_ast_step: '호출 구조 분석 중',
  build_context_step: '분석 맥락 만드는 중',
  fetch_table_samples_step: '테이블 예시 수집 중',
  analyze_code_step: 'AI가 코드 의미 분석 중',
  summarize_module_step: '모듈 요약 중',
  enrich_table_description_step: '테이블 설명 보강 중',
  enrich_lineage_from_catalog_step: '데이터 흐름 보강 중',
  build_components_step: '컴포넌트 묶는 중',
  health_metrics_step: '품질 지표 계산 중',
  embed_step: '검색 색인 만드는 중',
}

/** 노드 라벨(주 라벨) → 한국어 종류. 전략 무관 — framework FUNCTION/dbms PROCEDURE 등. */
const LABEL_KIND_KO: Record<string, string> = {
  FUNCTION: '함수', METHOD: '메서드', PROCEDURE: '프로시저', TRIGGER: '트리거',
  FILE: '파일', PACKAGE: '패키지', MODULE: '모듈', GLOBAL_VARIABLE: '전역변수',
  TABLE: '테이블', COLUMN: '컬럼',
}

/** processing_event.step → 그 단계에 맞는 사용자 동작 문구. 미등록 step 은 '처리 중' 폴백. */
const STEP_VERB: Record<string, string> = {
  'step5.build_context': '분석 중',
  'step6.analyze_code': '분석 중',
  'step6.module_pre_analysis': '살펴보는 중',
  'step7.summarize_module': '정리 중',
  'step7.enrich_table_description': '설명 채우는 중',
  'step7.build_components': '묶는 중',
}

/** 종류(한국어) → 콘솔 이모지. 미등록은 🔹. */
const KIND_EMOJI: Record<string, string> = {
  '함수': '🧠', '메서드': '🧠', '프로시저': '🧠', '트리거': '🧠', '코드': '🧠', '코드 묶음': '🧠',
  '모듈': '📦', '패키지': '📦', '파일': '📄', '테이블': '🗂️', '컬럼': '🗂️',
  '전역변수': '🔧', '구성요소': '🧩',
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

    // elementId → 논리 id 매핑(이 응답 노드로). 관계 끝점(elementId)을 논리 id 로 변환.
    const elemToLogical = new Map<string, string>()
    for (const node of nodes) {
      const converted = convertNeo4jNode(node)
      elemToLogical.set(node['Node ID'], converted.id)
      newNodeMap.set(converted.id, converted)
    }

    // 노드보다 관계가 먼저 도착하는 경우 (다른 batch · 다른 phase) 에도
    // 일단 link 는 등록. 노드는 이후 batch 에서 들어오면 자동으로 연결됨.
    // 의미데이터 링크는 semanticLinkMap 으로 분리, hidden 타입/끝점은 적재 안 함.
    for (const rel of relationships) {
      const converted = convertNeo4jRelationship(rel, elemToLogical)
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
    nodeNameCache.clear()   // 보조 캐시도 함께 — 재분석/타프로젝트 stale 표시명 방지
  }

  // ----- 콘솔 메시지 -----
  const consoleMessages = ref<StreamMessage[]>([])

  // 마지막 콘솔 메시지 시각(ms) — 무음구간 안심 메시지(heartbeat) 판단용.
  let lastMessageMs = 0

  function addMessage(type: MessageType, content: string): void {
    consoleMessages.value.push({ type, content, timestamp: createTimestamp() })
    lastMessageMs = Date.now()
  }

  function clearMessages(): void {
    consoleMessages.value = []
  }

  // ----- 진행감 집계 (US4 FR-011a) -----
  // step6(LLM 분석)은 처리 단위(processing_event)가 전부 sub_action 을 달고 와서
  // 과거엔 콘솔에 한 줄도 안 흘렀다(무음). 여기서 entity_id 단위로 dedup(한 코드노드의
  // 여러 split 을 1회로) + 종류별 throttle(K건마다 1줄) 해서 "쏟아짐 없이" 진행감만 전한다.
  /** 종류별로 이미 진행 집계에 센 entity_id (중복 방지) — framework 함수/모듈/테이블/구성요소. */
  const processedIds = new Map<string, Set<string>>()
  /** dbms 배치 누계 — 배치는 부모 id 를 공유할 수 있어 dedup 하지 않고 묶음마다 +1(건수). */
  let processedBatchCount = 0
  /** 진행감 메시지 throttle 간격(종류별 N건마다 1줄). 코드/배치가 대다수라 촘촘히. */
  const PROGRESS_THROTTLE: Record<string, number> = { CodeNode: 5, Batch: 5, Module: 1, Table: 1, Component: 1 }
  /** 진행바 라이브 보간(spec 030): 점근 계수 K, 경계 직전 여유 ε(%). 총 건수 미지에도 경계로 수렴. */
  const LIVE_FILL_K = 0.12
  const BOUNDARY_EPS = 0.5

  function resetProgressTracking(): void {
    processedIds.clear()
    processedBatchCount = 0
    doneLeaves.clear()
    lastMessageMs = Date.now()
  }

  // ----- 무음구간 안심 메시지(heartbeat) -----
  // 처리 중인데 일정 시간 콘솔이 조용하면(이벤트 사이 빈틈) "아직 잘 진행 중"이라고 안심시킨다.
  // step6 시작 직후·단계 전환 등 이벤트가 잠시 끊기는 구간에도 멈춘 듯 보이지 않게.
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined
  let reassureIdx = 0
  const REASSURE_LINES = [
    '⏳ 아직 열심히 분석하고 있어요 — 조금만 기다려 주세요 🙂',
    '⏳ 코드를 차근차근 살펴보는 중이에요. 멈춘 게 아니니 안심하세요.',
    '⏳ 복잡한 코드일수록 시간이 조금 더 걸려요 — 정상적으로 진행 중입니다.',
  ]
  const HEARTBEAT_SILENCE_MS = 12000   // 이 시간 이상 콘솔이 조용하면 안심 1줄
  const HEARTBEAT_TICK_MS = 4000

  function startHeartbeat(): void {
    stopHeartbeat()
    heartbeatTimer = setInterval(() => {
      if (!isProcessing.value) return
      if (Date.now() - lastMessageMs < HEARTBEAT_SILENCE_MS) return
      addMessage('message', REASSURE_LINES[reassureIdx % REASSURE_LINES.length])
      reassureIdx++
    }, HEARTBEAT_TICK_MS)
  }

  function stopHeartbeat(): void {
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = undefined }
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
  // 처리 시작/종료에 맞춰 무음구간 안심 heartbeat 가동(전략 무관 — isProcessing 단일 신호).
  watch(isProcessing, (proc) => { if (proc) { reassureIdx = 0; startHeartbeat() } else stopHeartbeat() })
  const currentStep = ref('')
  // 진행 중 단계 인덱스(=지금까지 본 최고 단계, -1=시작 전). 7단계 파생의 단일 신호.
  const currentPhaseIndex = ref(-1)
  const currentPhaseProgress = ref(0)
  // 진행바 % 추정용 leaf 카운트(전략별 예상 개수는 doAnalyze 에서 세팅).
  const expectedLeafCount = ref(0)
  const doneLeafCount = ref(0)
  /** 완료된 leaf step 이름 집합 — 진행 중 단계 도출(다음 leaf 의 단계)용. */
  const doneLeaves = new Set<string>()

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
    addMessage('message', `📤 파일 ${files.length}개를 안전하게 올리는 중이에요...`)

    const result = await antlrApi.uploadFiles(meta, files, sessionStore.getHeaders())

    sourceType.value = meta.target as SourceType
    uploadedFiles.value = result.files
    uploadedDdlFiles.value = result.ddlFiles

    saveToStorage()

    addMessage('message', `✅ 업로드를 마쳤어요 — 소스 ${result.files.length}개, DDL ${result.ddlFiles.length}개를 받았습니다`)
    return result
  }

  async function doParse() {
    currentStep.value = '[2단계] 파싱 중...'
    addMessage('message', '🔧 코드 구조를 찬찬히 살펴보는 중이에요...')

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

    addMessage('message', '✅ 코드 구조 파악을 마쳤어요')
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
   * tool_event → LLM 에이전트(특히 코드베이스 스캔)의 도구 활동을 콘솔에 라이브로 (spec 033).
   * 스캔 단계는 per-item(processing_event)이 없어 콘솔이 비었었음 — 에이전트가 보내는 친절 문구
   * (예: "… 디렉토리 보는 중", "… 패턴 검색 중")를 시작 시점에만 표시(결과/종료는 생략, 가독성).
   */
  function logToolEvent(event: AnalyzeEvent): void {
    if (event.event !== 'tool_start' || !event.message) return
    addMessage('message', `🔎 ${event.message}`)
  }

  /**
   * phase_event(analyzer 진행) → 진행 상태 refs 갱신.
   * 백엔드 wire 는 `event`(start/node_done/stopped/complete/paused/resumed) + 완료 step `node` 다.
   * node_done 한 건 = leaf 완료 → 그 leaf 의 단계로 currentPhaseIndex 를 올리고(7단계 파생),
   * % 는 전략별 예상 leaf 수(expectedLeafCount) 대비 추정치(완료 전 99% 상한)로 표시한다.
   */
  function applyPhaseEvent(event: AnalyzeEvent): void {
    switch (event.event) {
      case 'start':
        doneLeaves.clear()
        // 진행 중 단계 = 첫 leaf 의 단계(DDL). leaf 순서 모델 단일 진실.
        currentPhaseIndex.value = runningPhaseIndex(doneLeaves, analyzeMeta.value.strategy)
        doneLeafCount.value = 0
        currentPhaseProgress.value = 0
        currentStep.value = '분석 시작...'
        break
      case 'node_done': {
        const node = event.node ?? ''
        if (node) doneLeaves.add(node)
        const strat = analyzeMeta.value.strategy
        // ★진행 중 단계 = 방금 완료 leaf 의 *다음* leaf 의 단계 → 완료된 단계가 active 로 안 남고
        //  다음 단계가 진행중으로 표시됨(단조 증가, 다중 leaf 단계 overshoot 없음).
        const running = runningPhaseIndex(doneLeaves, strat)
        if (running > currentPhaseIndex.value) currentPhaseIndex.value = running
        // 현재 단계 세부문구 = 지금 진행 중(다음) leaf 의 라벨(없으면 방금 완료 leaf).
        const runningLeaf = nextRunningLeaf(doneLeaves, strat)
        currentStep.value = (runningLeaf && STEP_SUBLABEL[runningLeaf]) || STEP_SUBLABEL[node] || currentStep.value
        doneLeafCount.value += 1
        const pct = expectedLeafCount.value > 0
          ? Math.round(doneLeafCount.value / expectedLeafCount.value * 100)
          : 0
        currentPhaseProgress.value = Math.min(99, pct)
        break
      }
      case 'complete':
        // 마지막 단계까지 done 표시 위해 인덱스를 단계 수로(모든 idx < length = 완료).
        currentPhaseIndex.value = PHASES.length
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

  /** entity_kind → 노드 라벨을 못 찾을 때 쓸 폴백 한글 종류. 미등록은 '항목'. */
  const PROCESSING_KIND_KO: Record<string, string> = {
    CodeNode: '코드', Batch: '코드 묶음', Module: '모듈', Table: '테이블', Component: '구성요소',
  }

  /**
   * processing_event(step 안 처리 단위) → 콘솔 진행감 (US4 FR-011a, spec 029).
   *
   * 메시지 형식 = `{이모지} {종류} {개수}{단위} {동작} — '{이름}'`.
   * - 종류: 처리 대상 노드의 **라벨**(라이브 그래프에서 entity_id 로 조회)을 한글로(함수/프로시저/
   *   테이블 …). 노드를 못 찾으면 entity_kind 폴백. → 전략(framework/dbms)을 몰라도 자동 구분.
   * - 동작: 현재 step 에서 파생(분석/요약/설명 채움/묶음 …).
   * - 개수: 단조 증가 진행감. framework(CodeNode/Module/Table/Component)=대상 id dedup(같은 대상 1회),
   *   dbms(Batch)=묶음마다 1건(부모 id 공유 → dedup 안 함). 두 전략은 배타.
   * - throttle 로 도배 방지, 원시 ID 미노출, 완료(done) 신호만 집계.
   */
  function applyProcessingEvent(event: AnalyzeEvent): void {
    // 단계(currentPhaseIndex) 전진은 leaf 순서 모델(applyPhaseEvent node_done)이 단일 진실로 처리.
    // 긴 analyze_code 단계도 "다음 미완료 leaf=analyze_code" 라 그 단계가 진행중으로 자동 표시됨
    // → 과거 028 의 processing_event phase 승급 불필요(중복·overshoot 위험 제거). 여기선 바·메시지만.
    if (event.status !== 'done') return

    // 진행바 라이브 보간(spec 030): 긴 단계(node_done 공백) 동안에도 처리 신호마다 현재 단계
    // 슬롯의 다음 경계로 점근 수렴(총 건수 미지에도 경계 초과·역행 없이 "멈춤"만 해소).
    // node_done 베이스라인(applyPhaseEvent)은 그대로 — cap(<경계) 이상이라 단조 유지.
    const N = expectedLeafCount.value
    if (N > 0) {
      const cap = Math.min(99, (doneLeafCount.value + 1) / N * 100 - BOUNDARY_EPS)
      if (currentPhaseProgress.value < cap) {
        currentPhaseProgress.value += (cap - currentPhaseProgress.value) * LIVE_FILL_K
      }
    }

    const rawKind = event.entity_kind ?? ''
    const id = event.entity_id ?? ''

    // 진행 개수(단조 증가). Batch(dbms)는 묶음마다 1건, 그 외는 대상 id 로 dedup(중복 1회).
    let count: number
    if (rawKind === 'Batch') {
      count = (processedBatchCount += 1)
    } else {
      if (!id) return
      let seen = processedIds.get(rawKind)
      if (!seen) { seen = new Set(); processedIds.set(rawKind, seen) }
      if (seen.has(id)) return
      seen.add(id)
      count = seen.size
    }

    const throttle = PROGRESS_THROTTLE[rawKind] ?? 5
    // 첫 건은 바로(시작 신호), 이후엔 throttle 건마다 한 줄(플러드 방지).
    if (count !== 1 && count % throttle !== 0) return

    // 종류: Batch 는 카운트 단위가 '묶음'이라 라벨(프로시저)이 아닌 '코드 묶음'으로 고정.
    //       그 외는 노드 라벨 우선(전략 무관) → 폴백 entity_kind.
    const node = nodeMap.value.get(id)
    let kind: string
    if (rawKind === 'Batch') {
      kind = PROCESSING_KIND_KO['Batch']
    } else {
      const subLabel = node ? extractSubLabel(node.labels) : ''
      kind = LABEL_KIND_KO[subLabel] ?? PROCESSING_KIND_KO[rawKind] ?? '항목'
    }
    const verb = STEP_VERB[event.step ?? ''] ?? '처리 중'
    const unit = rawKind === 'Batch' ? '건' : '개'
    const emoji = KIND_EMOJI[kind] ?? '🔹'
    // "무엇을" 처리 중인지 — 방금 대상의 사람이름(스트림으로 nodeMap 에 이미 적재됨). 없으면 생략.
    const name = (node?.properties?.name as string) || ''
    const tail = name ? ` — '${name}'` : ''
    addMessage('message', `${emoji} ${kind} ${count}${unit} ${verb}${tail}`)
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
    resetProgressTracking()
    // % 추정용 예상 leaf 개수(전략별). 바는 추정(완료 시 100% 보정), 단계 상태는 currentPhaseIndex.
    expectedLeafCount.value = analyzeMeta.value.strategy === 'dbms' ? 13 : 14
    doneLeafCount.value = 0
    addMessage('message', '🔍 코드 분석을 시작했어요 — 차근차근 진행할게요. 잠시만 기다려 주세요 🙂')

    await roboApi.analyze(
      analyzeMeta.value,
      sessionStore.getHeaders(),
      (event) => {
        switch (event.type) {
          case 'phase_event': applyPhaseEvent(event); break
          case 'node_event':
          case 'relationship_event': applyGraphEvent(event); break
          case 'processing_event': applyProcessingEvent(event); break
          case 'message':
          case 'error':
          case 'warning': logToConsole(event); break
          case 'tool_event': logToolEvent(event); break
          // system_log·todo_update 등 미렌더 타입은 무시
        }
      }
    )

    addMessage('message', '✅ 코드 분석을 마쳤어요 — 결과를 정리하는 중이에요')
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
      addMessage('message', '📥 저장된 그래프를 불러오는 중이에요...')

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
        addMessage('message', `✅ 그래프를 불러왔어요 — 노드 ${result.Nodes.length}개, 관계 ${result.Relationships?.length || 0}개`)
        return true
      } else {
        addMessage('message', 'ℹ️ 아직 저장된 그래프가 없어요. 분석을 먼저 실행해 주세요.')
        return false
      }
    } catch (error) {
      logger.warn('기존 그래프 데이터 로드 실패:', error)
      addMessage('error', `❌ 그래프를 불러오지 못했어요: ${error}`)
      return false
    }
  }

  async function uploadFiles(files: File[], meta: BackendRequestMetadata) {
    addMessage('message', '🔍 이전에 분석한 데이터가 있는지 확인하는 중이에요...')
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
    currentPhaseIndex.value = -1
    currentPhaseProgress.value = 0
    clearMessages()

    try {
      await doUpload(files, meta)
      await doParse()
      await doAnalyze()

      currentStep.value = '전체 처리 완료'
      addMessage('message', '🎉 모든 처리가 끝났어요! 이제 그래프를 살펴보세요 😊')
    } catch (error) {
      addMessage('error', `❌ 처리 중 문제가 생겼어요: ${error}`)
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

    addMessage('message', '🔍 이전에 분석한 데이터가 있는지 확인하는 중이에요...')
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
    currentPhaseIndex.value = -1
    currentPhaseProgress.value = 0
    clearMessages()
    clearGraphData()   // 재분석 = 새 결과만 — 이전 그래프/표시명 잔재 제거(누적·혼합 방지)

    try {
      addMessage('message', '🔄 다시 분석을 시작했어요...')
      await doParse()
      await doAnalyze()

      currentStep.value = '전체 처리 완료'
      addMessage('message', '🎉 분석이 모두 끝났어요! 이제 그래프를 살펴보세요 😊')
    } catch (error) {
      logger.error('[restartPipeline] 실패:', error)
      addMessage('error', `❌ 분석 중 문제가 생겼어요: ${error}`)
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
    currentPhaseIndex.value = -1
    currentPhaseProgress.value = 0
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
    PHASES,
    currentPhaseIndex,
    currentPhaseProgress,
    expectedLeafCount,
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
