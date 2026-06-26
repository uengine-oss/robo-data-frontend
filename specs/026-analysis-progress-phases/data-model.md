# Data Model: 분석 진행 표시 7단계

> 영속 데이터 아님 — 진행 표시용 런타임 상수/상태. 진실 출처 = analyzer `analysis_flow/step1~step7`.

## 1. 상위 단계 (PHASES) — 고정 7개, 순서 그대로

| idx | 단계명(초안, clarify서 확정) | 의미(부제 후보) |
|---|---|---|
| 0 | DDL 파싱 | 테이블 정의 읽기 |
| 1 | AST 적재 | 코드 구조 불러오기 |
| 2 | 코드베이스 스캔 | 소스 훑어보기 |
| 3 | 관계 연결 | 호출·테이블 관계 잇기 |
| 4 | 분석 컨텍스트 구성 | 분석 맥락 준비 |
| 5 | 코드 분석 | AI 코드 의미 분석 |
| 6 | 후처리 | 요약·보강·마무리 |

## 2. leaf 노드명 → 단계 인덱스 (STEP_TO_PHASE)

> ★ 키는 analyzer가 실제 emit하는 노드명(`*_step`). `analyze_function_step`(죽은 키) 아님 = `analyze_code_step`.

| leaf 노드명 (실제 emit) | 단계 idx | 단계 |
|---|---|---|
| `parse_ddl_step` | 0 | DDL 파싱 |
| `load_ast_step` | 1 | AST 적재 |
| `scan_codebase_step` | 2 | 코드베이스 스캔 |
| `link_deterministic_step` | 3 | 관계 연결 |
| `link_calls_by_name_step` | 3 | 관계 연결 |
| `link_residual_patterns_step` | 3 | 관계 연결 |
| `link_dbms_tables_step` | 3 | 관계 연결 |
| `link_calls_by_ast_step` | 3 | 관계 연결 |
| `build_context_step` | 4 | 분석 컨텍스트 구성 |
| `fetch_table_samples_step` | 4 | 분석 컨텍스트 구성 |
| `analyze_code_step` | 5 | 코드 분석 |
| `summarize_module_step` | 6 | 후처리 |
| `enrich_table_description_step` | 6 | 후처리 |
| `enrich_lineage_from_catalog_step` | 6 | 후처리 |
| `build_components_step` | 6 | 후처리 |
| `health_metrics_step` | 6 | 후처리 |
| `embed_step` | 6 | 후처리 |

매핑에 없는 노드명 → 무해 흡수(현재 maxPhaseSeen 유지, research R3).

## 3. leaf 노드명 → active 단계 세부문구 (STEP_SUBLABEL) — 사용자 표현 초안

> active 단계 한 줄(US2)에만 쓰임. 내부어 제거. 문구는 clarify서 확정.

| leaf 노드명 | 세부문구(초안) |
|---|---|
| `parse_ddl_step` | 테이블 정의 읽는 중 |
| `load_ast_step` | 코드 구조 불러오는 중 |
| `scan_codebase_step` | 소스 훑어보는 중 |
| `link_deterministic_step` | 확실한 관계 잇는 중 |
| `link_calls_by_name_step` | 함수 호출 분석 중 |
| `link_residual_patterns_step` | 남은 관계 보완 중 |
| `link_dbms_tables_step` | 테이블 사용 연결 중 |
| `link_calls_by_ast_step` | 호출 구조 분석 중 |
| `build_context_step` | 분석 맥락 만드는 중 |
| `fetch_table_samples_step` | 테이블 예시 수집 중 |
| `analyze_code_step` | AI가 코드 의미 분석 중 |
| `summarize_module_step` | 모듈 요약 중 |
| `enrich_table_description_step` | 테이블 설명 보강 중 |
| `enrich_lineage_from_catalog_step` | 데이터 흐름 보강 중 |
| `build_components_step` | 컴포넌트 묶는 중 |
| `health_metrics_step` | 품질 지표 계산 중 |
| `embed_step` | 검색 색인 만드는 중 |

## 4. 진행 상태 (런타임 store state)

| 상태 | 의미 | 파생/갱신 |
|---|---|---|
| `maxPhaseSeen: number` | 지금까지 본 최고 단계 인덱스 | leaf 이벤트마다 `max(현재, STEP_TO_PHASE[node])`. `start`서 0, `complete`서 6. |
| `currentLeafLabel: string` | active 단계 세부 한 줄 | leaf 이벤트마다 `STEP_SUBLABEL[node]`. |
| 단계 상태(파생) | done/active/pending | idx<max=done, ==max=active, >max=pending(research R2). |

기존 `dynamicSteps`·`totalPhases`(=6)는 위 상태로 대체 후 폐기(미사용 시).
