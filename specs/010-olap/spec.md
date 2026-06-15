# Feature Specification: OLAP

**Feature Branch**: `010-olap`

**Created**: 2026-06-15

**Status**: Backfilled (reverse-engineered)

**Input**: 기존 `src/features/olap/` 코드에서 역설계. OLAP/다차원 분석 UI — `data-platform-olap` 백엔드(API Gateway `/olap/api/*` 경유)의 프론트엔드. 큐브 설계(스타 스키마·ETL), 피벗 분석(드래그앤드롭), 자연어 질의, Airflow ETL 파이프라인을 다룬다.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 피벗 테이블로 큐브 데이터 분석 (Priority: P1)

분석가는 좌측 패널의 사이드 탭에서 'OLAP 분석'(`features.ts` id=`olap`, label='OLAP 분석')을 열고, 등록된 큐브를 셀렉터로 고른 뒤 차원/측정값 필드를 행·열·측정값 드롭존에 드래그앤드롭(또는 더블클릭)하여 피벗을 구성하고 '실행'으로 결과 표와 생성 SQL을 본다. 행/열 값을 펼치면 다음 레벨로 드릴다운된다.

**Why this priority**: 큐브를 만들지 않아도 이미 등록된 큐브가 있으면 즉시 가치(분석 결과)를 제공하는 핵심 MVP. `OlapTab`이 기본으로 `analysis` 서브탭을 연다.

**Independent Test**: 큐브가 1개 이상 등록된 상태에서 PivotAnalysis 탭만으로 차원·측정값 배치→실행→결과 표/SQL 확인까지 독립 검증 가능.

**Acceptance Scenarios**:

1. **Given** 등록된 큐브가 있고 선택된 상태, **When** 측정값을 측정값 드롭존에 넣고 '실행'을 누르면, **Then** `POST /olap/api/pivot/query`가 호출되어 결과 표(`columns`/`data`)와 생성 SQL이 표시된다.
2. **Given** 피벗 구성이 비어있지 않음, **When** 행/열/측정값이 변경되면, **Then** `POST /olap/api/pivot/preview-sql`로 SQL이 자동 미리보기된다.
3. **Given** 결과가 표시됨, **When** 행/열 항목을 펼치면, **Then** 해당 차원의 다음 레벨로 드릴다운된 쿼리가 재실행된다(`buildDrillDownConfig`).

---

### User Story 2 - AI로 스타 스키마 큐브 설계 및 배포 (Priority: P2)

사용자는 '큐브 설계' 서브탭의 'AI 설계'에서 자연어로 분석 의도를 입력해 AI가 팩트/디멘전/측정값과 ETL 전략을 추천받고, 스타 스키마·리니지 다이어그램(Mermaid)을 확인한 뒤 '큐브 업로드 & Airflow 배포'로 DW 스키마 생성·테이블 프로비저닝·Mondrian XML 등록·ETL 설정·Airflow DAG 배포까지 일괄 수행한다. 'Visual Modeler' 탭에서 폼으로 직접 설계할 수도 있다.

**Why this priority**: 큐브가 없을 때 큐브를 생성하는 진입 경로. P1 분석의 선행 데이터를 만들지만, 기존 큐브가 있으면 P1만으로도 가치가 성립하므로 P2.

**Independent Test**: 자연어 설명 입력→AI 추천 수신→다이어그램 렌더→업로드&배포 호출 체인을 독립 검증 가능.

**Acceptance Scenarios**:

1. **Given** 큐브 설명이 입력됨, **When** 'AI 스타 스키마 생성'을 누르면, **Then** `POST /olap/api/etl/suggest`로 추천을 받아 차원/측정값 폼과 스타 스키마 다이어그램이 채워진다.
2. **Given** 큐브 이름·팩트 테이블이 설정됨, **When** '큐브 업로드 & Airflow 배포'를 누르면, **Then** `etl/schema/create` → `etl/provision` → `schema/upload-text` → `etl/config` → `airflow/etl/{cube}/deploy` → `airflow/etl/{cube}/run` 순서로 호출된다.

---

### User Story 3 - 자연어 질의 및 Text2SQL 연계 (Priority: P3)

사용자는 자연어 질문을 입력해 `nl2sql`로 결과를 얻거나, Text2SQL 히스토리에서 'OLAP으로 전달'(`navigateToOlapWithSQL`)을 통해 넘어온 질문·SQL을 큐브 설계 입력으로 자동 채운다.

**Why this priority**: 부가 진입 경로이자 타 기능(Text2SQL) 연계. 없어도 P1/P2는 독립 동작.

**Independent Test**: 세션 store에 transfer 데이터를 주입한 뒤 CubeDesigner 마운트 시 배너/설명 자동 채움을 검증 가능.

**Acceptance Scenarios**:

1. **Given** 큐브가 선택됨, **When** 자연어 질문을 실행하면, **Then** `POST /olap/api/nl2sql`로 결과·SQL을 받는다.
2. **Given** Text2SQL에서 SQL과 함께 전달됨, **When** CubeDesigner가 마운트되면, **Then** `consumeOlapTransferData()`로 데이터를 소비해 ETL 설명란을 자동 구성한다.

---

### Edge Cases

- 등록된 큐브가 없을 때(`hasCubes=false`): 셀렉터/관리 버튼이 숨겨지고 필드 목록은 '큐브를 선택하세요' 빈 상태 표시.
- 측정값이 비어있으면 '실행' 버튼 비활성화(피벗 쿼리는 측정값 필수).
- 큐브 삭제 시 DW 테이블(`dw.fact_*`/`dw.dim_*`)·ETL config 동반 삭제 여부를 confirm으로 분기, ETL config 미존재는 무시.
- Airflow 미가용 시 ETL 동기화는 `airflow/etl/{cube}/run` 실패 후 직접 동기화(`etl/sync/{cube}`)로 폴백.
- 저장 안 된 스크립트는 실행 불가('스크립트를 먼저 저장해주세요').
- SSE 연결 오류(`executeScriptWithRetry`/`createAgentEventSource`) 시 오류 이벤트 후 EventSource 종료.
- 큐브 메타데이터/ETL config 로드 실패 시 빈 템플릿으로 대체.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 시스템은 `OlapTab`에서 '피벗 테이블(analysis)'·'큐브 설계(design)' 서브탭을 제공하며 기본으로 analysis를 연다.
- **FR-002**: 시스템은 마운트 시 `GET /olap/api/cubes`로 큐브 목록을 로드하고, 첫 큐브를 자동 선택하며 `GET /olap/api/cube/{name}/metadata`로 차원·측정값을 가져온다.
- **FR-003**: 사용자는 차원 레벨/측정값을 행·열·측정값 드롭존에 드래그앤드롭 또는 더블클릭으로 배치할 수 있어야 한다.
- **FR-004**: 시스템은 피벗 구성 변경 시 `POST /olap/api/pivot/preview-sql`로 SQL을 자동 미리보기하고, '실행' 시 `POST /olap/api/pivot/query`로 결과를 받는다.
- **FR-005**: 시스템은 차원 계층(`levels`)을 따라 드릴다운(다음 레벨 추가 + 필터 누적)하여 쿼리를 재구성해야 한다.
- **FR-006**: 시스템은 'AI 설계'에서 `POST /olap/api/etl/suggest`로 팩트/디멘전/측정값/ETL 전략을 추천받아 폼과 Mermaid 스타 스키마·리니지 다이어그램에 채운다.
- **FR-007**: 시스템은 'Visual Modeler'에서 큐브명·팩트 테이블·디멘전(레벨 포함)·측정값(집계자)을 폼으로 편집하고 Mondrian XML/다이어그램을 미리보기해야 한다.
- **FR-008**: 시스템은 큐브 업로드 시 Mondrian XML을 `POST /olap/api/schema/upload-text`로(또는 파일 `schema/upload`) 등록한다.
- **FR-009**: 시스템은 전체 프로비저닝 시 `etl/schema/create`→`etl/provision`→`schema/upload-text`→`etl/config`→`airflow/etl/{cube}/deploy`→`airflow/etl/{cube}/run` 순서로 호출해야 한다.
- **FR-010**: 시스템은 큐브 편집 모달에서 큐브 스키마·ETL 설정(`etl/config`)·ETL 스크립트(생성/저장/실행) 탭을 제공한다.
- **FR-011**: 시스템은 ETL 스크립트를 SSE 스트리밍으로 생성(`etl/generate-script-stream/{cube}`)하고, 자동 재시도와 함께 실행(`etl/script/execute-with-retry/{cube}`)하며 실시간 로그/진행 상태를 표시해야 한다.
- **FR-012**: 사용자는 자연어 질문을 `POST /olap/api/nl2sql`로 실행할 수 있어야 한다.
- **FR-013**: 시스템은 Text2SQL에서 전달된 질문·SQL(`consumeOlapTransferData`)을 큐브 설계 입력으로 자동 채워야 한다.
- **FR-014**: 사용자는 단일/전체 큐브를 삭제(`cube/{name}`, `cubes`)할 수 있고, 선택 시 관련 DW 테이블(`etl/dw/tables/delete`)·ETL config(`etl/configs`)를 동반 삭제할 수 있어야 한다.
- **FR-015**: 시스템은 데이터 카탈로그(`GET /olap/api/etl/catalog`)를 좌측 패널에 표시해야 한다.
- **FR-016**: 시스템은 ETL 동기화 시 Airflow 실행을 우선 시도하고 실패하면 직접 동기화(`etl/sync/{cube}`)로 폴백해야 한다.
- **FR-017**: 모든 OLAP 백엔드 호출은 API Gateway base `${API_GATEWAY_URL}/olap/api`를 통해 이뤄져야 한다(`fetch` 기반).

### Key Entities *(include if feature involves data)*

- **Cube(큐브)**: 분석 단위. `name`, `fact_table`, `dimensions[]`, `measures[]`. 백엔드 `cubes`/`cube/{name}/metadata`로 조회, Mondrian XML로 등록.
- **Dimension(차원)**: `name`, `type`, `levels[]`(계층). 각 level은 `name`+`column`. 피벗 행/열·드릴다운의 축.
- **Measure(측정값)**: `name`, `column`, `aggregator`(sum/count/avg/min/max). 피벗 집계 값.
- **PivotConfig/PivotView(피벗 뷰)**: `rows[]`, `columns[]`, `measures[]`, `filters[]`. Pinia `useOlapStore`가 보유, 드릴다운 상태(`expandedItems`)와 결과(`queryResult`/`generatedSQL`) 포함.
- **ETLConfig**: `cube_name`, `fact_table`, `dimension_tables[]`, `source_tables[]`, `mappings[]`, `dw_schema`, `sync_mode`(full/incremental), `incremental_column`.
- **AISuggestion**: AI 추천 결과(`fact_sources`, `dimensions`, `measures`, `suggested_mappings`, `generalization`, `reasoning`).
- **AirflowDAG**: ETL 파이프라인 배포 결과(`dag_id`, `cube_name`, `airflow_url`).
- **백엔드 엔드포인트(`/olap/api/*`)**: 큐브(`cubes`, `cube/{name}/metadata`, `cube/{name}/schema-description`), 스키마(`schema/upload`, `schema/upload-text`), 피벗(`pivot/query`, `pivot/preview-sql`), 질의(`nl2sql`), ETL(`etl/catalog`, `etl/suggest`, `etl/config(s)`, `etl/sync/{cube}`, `etl/provision`, `etl/ddl*`, `etl/schema/create`, `etl/execute-direct*`, `etl/generate-script*`, `etl/script/*`, `etl/dw/tables*`, `etl/dw/schema`), Airflow(`airflow/etl/{cube}/deploy|run`, `airflow/dag/{id}/trigger|status`, `airflow/dags`), health(`health`, `airflow/health`).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 등록된 큐브가 있을 때 사용자는 탭 진입 후 차원·측정값 배치→실행으로 1분 이내에 첫 피벗 결과를 얻을 수 있다.
- **SC-002**: 피벗 구성 변경 시 SQL 미리보기가 별도 조작 없이 자동 갱신된다.
- **SC-003**: AI 추천부터 큐브 업로드 & Airflow 배포까지 단일 버튼 흐름으로 완료되며, 각 단계 진행이 로그/메시지로 노출된다.
- **SC-004**: ETL 스크립트 실행 진행·재시도·완료/실패가 실시간 로그로 100% 표시된다.
- **SC-005**: Airflow 미가용 등 외부 실패 시에도 폴백 경로로 사용자에게 명확한 성공/실패 메시지를 제공한다.

## Assumptions

- 모든 백엔드 통신은 API Gateway(`VITE_API_GATEWAY_URL` 또는 `/api/gateway`) 하위 `/olap/api`로 라우팅되며 `data-platform-olap` 서비스가 가용하다고 가정.
- 이 앱은 host(robo-architect)에 임베드되거나 단독 실행되며, 라우팅은 메모리 히스토리 단일 `/` 라우트이고 탭 전환은 `session.activeTab`(id=`olap`)로 제어된다.
- DW는 PostgreSQL `dw` 스키마, OLAP 큐브는 Mondrian XML 스키마, ETL 오케스트레이션은 Apache Airflow를 전제로 한다.
- 다이어그램 렌더는 `mermaid`(dark 테마)에 의존한다.
- 인증/권한, 페이지네이션(결과는 50행만 표시), 모바일 지원은 본 스펙 범위 밖이다.
- ETL 스크립트 생성/실행은 백엔드 LLM 에이전트(LangGraph 기반)와 SSE 스트림에 의존한다.
