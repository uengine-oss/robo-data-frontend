/** Analyzer final phases in the order presented to the user. */
export const ANALYSIS_PHASES = [
  'DDL 파싱',
  '소스 적재',
  '프로젝트 스캔',
  '관계 연결',
  '분석 컨텍스트 구성',
  '코드 분석',
  '후처리',
] as const

// 분석기 백엔드 pipeline/strategies.py 의 steps 와 같은 이름 · 순서여야 한다. 없는 단계가 남아 있으면
// 그 단계가 영영 끝나지 않아 진행 창이 그 단계에 머문다(예전 discover_datasource_step).
export const STEP_TO_PHASE: Record<string, number> = {
  parse_ddl_step: 0,
  load_ast_step: 1,
  load_external_step: 1,
  resolve_data_objects_step: 2,
  scan_codebase_step: 2,
  scan_external_step: 2,
  link_deterministic_step: 3,
  link_calls_by_name_step: 3,
  link_calls_by_ast_step: 3,
  link_residual_patterns_step: 3,
  link_dbms_tables_step: 3,
  link_external_step: 3,
  build_context_step: 4,
  fetch_table_samples_step: 4,
  analyze_code_step: 5,
  summarize_module_step: 6,
  build_components_step: 6,
  build_glossary_step: 6,
  enrich_table_description_step: 6,
  enrich_lineage_from_catalog_step: 6,
  health_metrics_step: 6,
  embed_step: 6,
}

export const FRAMEWORK_LEAVES = [
  'parse_ddl_step', 'load_ast_step', 'load_external_step',
  'scan_codebase_step', 'scan_external_step',
  'link_deterministic_step', 'link_calls_by_name_step', 'link_residual_patterns_step', 'link_external_step',
  'build_context_step', 'fetch_table_samples_step', 'analyze_code_step',
  'summarize_module_step', 'build_components_step', 'build_glossary_step',
  'enrich_table_description_step', 'health_metrics_step', 'embed_step',
] as const

export const DBMS_LEAVES = [
  'parse_ddl_step', 'load_ast_step', 'load_external_step', 'scan_external_step',
  'link_dbms_tables_step', 'link_calls_by_ast_step', 'link_external_step',
  'build_context_step', 'fetch_table_samples_step', 'analyze_code_step',
  'summarize_module_step', 'build_components_step', 'build_glossary_step',
  'enrich_table_description_step', 'enrich_lineage_from_catalog_step', 'health_metrics_step', 'embed_step',
] as const

export function nextRunningLeaf(
  completedLeaves: Set<string>,
  strategy: string | undefined,
): string | null {
  const order = strategy === 'dbms' ? DBMS_LEAVES : FRAMEWORK_LEAVES
  return order.find((leaf) => !completedLeaves.has(leaf)) ?? null
}

export function runningPhaseIndex(
  completedLeaves: Set<string>,
  strategy: string | undefined,
): number {
  const leaf = nextRunningLeaf(completedLeaves, strategy)
  return leaf === null ? ANALYSIS_PHASES.length : (STEP_TO_PHASE[leaf] ?? 0)
}

export const STEP_SUBLABEL: Record<string, string> = {
  parse_ddl_step: '테이블 정의 읽는 중',
  load_ast_step: '코드 구조 불러오는 중',
  load_external_step: '외부 파일 읽는 중',
  discover_datasource_step: '데이터소스 확인 중',
  resolve_data_objects_step: '데이터 객체 확인 중',
  scan_codebase_step: '소스 훑어보는 중',
  scan_external_step: '외부 파일 형식 확인 중',
  link_deterministic_step: '확실한 관계 잇는 중',
  link_calls_by_name_step: '함수 호출 연결 중',
  link_calls_by_ast_step: '함수 호출 연결 중',
  link_residual_patterns_step: '남은 관계 보완 중',
  link_dbms_tables_step: '테이블 사용 연결 중',
  link_external_step: '외부 파일 연결하는 중',
  build_context_step: '분석 맥락 만드는 중',
  fetch_table_samples_step: '테이블 예시 데이터 가져오는 중',
  analyze_code_step: 'AI가 코드 의미 분석 중',
  summarize_module_step: '모듈 요약하는 중',
  build_components_step: '구성 요소 묶는 중',
  build_glossary_step: '용어집 만드는 중',
  enrich_table_description_step: '테이블 설명 보강 중',
  enrich_lineage_from_catalog_step: '데이터 흐름 보강 중',
  health_metrics_step: '코드 건강 지표 계산 중',
  embed_step: '검색 색인 만드는 중',
}

export const NODE_KIND_LABELS: Record<string, string> = {
  FUNCTION: '함수',
  METHOD: '메서드',
  PROCEDURE: '프로시저',
  TRIGGER: '트리거',
  FILE: '파일',
  PACKAGE: '패키지',
  MODULE: '모듈',
  GLOBAL_VARIABLE: '전역변수',
  TABLE: '테이블',
  COLUMN: '컬럼',
  EXTERNAL_CHUNK: '외부 청크',
}

export const PROCESSING_STEP_VERBS: Record<string, string> = {
  'step3.load_external': '읽는 중',
  'step4.scan_external': '형식 확인 중',
  'step5.link_external': '연결 중',
  'step6.build_context': '분석 중',
  'step7.analyze_code': '분석 중',
  'step7.module_pre_analysis': '살펴보는 중',
  'step8.enrich_table_description': '설명 채우는 중',
  'step8.build_search_embeddings': '검색 색인 만드는 중',
}

export const NODE_KIND_EMOJI: Record<string, string> = {
  함수: '🧠',
  메서드: '🧠',
  프로시저: '🧠',
  트리거: '🧠',
  코드: '🧠',
  '코드 묶음': '🧠',
  모듈: '📦',
  패키지: '📦',
  파일: '📄',
  테이블: '🗂️',
  컬럼: '🗂️',
  전역변수: '🔧',
  '외부 청크': '📌',
}
