# Feature Specification: Lineage Visualization

**Feature Branch**: `003-lineage-visualization`

**Created**: 2026-06-15

**Status**: Backfilled (reverse-engineered)

**Input**: Existing feature reverse-engineered from `src/features/lineage/` — 데이터 리니지(ETL 데이터 흐름)를 그래프로 시각화하고, ETL SQL을 업로드해 분석하는 UI. robo-data-catalog의 `/robo/lineage/*` 엔드포인트와 OLAP `/olap/api/etl/lineage/overview`를 소비한다.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 데이터 리니지 그래프 조회 (Priority: P1)

사용자는 리니지 탭을 열어 소스 테이블 → ETL 프로세스 → 타겟 테이블로 이어지는 데이터 흐름을 좌→우 3컬럼 그래프로 본다. 상단 통계 카드에는 소스/ETL/타겟/흐름 개수가 표시된다.

**Why this priority**: 리니지의 핵심 가치이자 MVP. 데이터가 어디서 와서 어디로 흐르는지 한눈에 파악하는 것이 본 기능의 존재 이유.

**Independent Test**: 탭 진입(`onMounted`) 시 자동 로드되어, OLAP 개요와 Neo4j 그래프가 병합된 노드/엣지가 그래프에 렌더되고 통계 카드 숫자가 갱신되면 통과.

**Acceptance Scenarios**:

1. **Given** ETL 설정과 Neo4j 리니지 데이터가 존재할 때, **When** 탭을 연다, **Then** 소스/ETL/타겟 노드가 3컬럼으로 배치되고 데이터 흐름 엣지(애니메이션)가 그려진다.
2. **Given** 그래프가 그려진 상태에서, **When** 노드를 클릭한다, **Then** 우측 상세 패널이 열려 입력원/출력 연결과 속성을 보여준다.
3. **Given** 데이터가 하나도 없을 때, **When** 탭을 연다, **Then** 빈 상태(empty-state) 안내와 "ETL 파일 업로드" CTA가 표시된다.

---

### User Story 2 - ETL SQL 코드 분석 (Priority: P2)

사용자는 `.sql/.pls/.pck` 파일을 업로드하여 ETL 코드 리니지 분석을 트리거하고, 분석 후 그래프가 자동 새로고침되어 새 리니지가 반영되는 것을 본다.

**Why this priority**: 기존 카탈로그에 없던 ETL을 코드로부터 새로 추출하는 입력 경로. 그래프 조회(P1)를 풍부하게 하지만, 그래프 자체 없이는 의미가 없으므로 P2.

**Independent Test**: SQL 파일을 업로드해 `/robo/lineage/analyze/`가 호출되고, 성공 시 `loadLineageData()`가 재실행되어 그래프가 갱신되면 통과.

**Acceptance Scenarios**:

1. **Given** 리니지 탭에서, **When** "ETL 분석" 버튼으로 SQL 파일을 선택한다, **Then** 파일 내용이 `{ sqlContent, fileName, dbms:'oracle' }`로 분석 엔드포인트에 POST된다.
2. **Given** 분석이 끝났을 때, **When** 응답이 성공한다, **Then** 리니지 데이터가 자동 재로드되어 그래프에 반영된다.

---

### User Story 3 - 노드 상세 + Airflow 재배포 (Priority: P3)

사용자는 노드 상세 패널에서 인바운드/아웃바운드 연결과 속성을 확인하고, ETL 노드인 경우 해당 큐브의 Airflow DAG를 재생성하거나 Airflow UI로 이동한다.

**Why this priority**: 조회·분석 이후의 운영 보조 기능. 핵심 시각화와 독립적이며 부가가치 영역이라 P3.

**Independent Test**: ETL 노드를 선택해 "DAG 재생성" 시 `/airflow/etl/{cube}/deploy?force=true`가 호출되고 결과 메시지가 표시되면 통과.

**Acceptance Scenarios**:

1. **Given** ETL 노드를 선택했을 때, **When** "DAG 재생성"을 확인한다, **Then** 큐브명으로 Airflow 배포가 호출되고 성공/실패 메시지가 표시된다.
2. **Given** 임의 노드를 선택했을 때, **When** 검색어를 입력한다, **Then** 이름 일치 노드만 그래프에 표시된다(`filteredNodes`).

---

### Edge Cases

- OLAP 개요 호출 실패 시 → `console.warn`으로 무시하고 Neo4j 데이터만으로 진행(부분 실패 허용).
- Neo4j 리니지 호출 실패 시 → 마찬가지로 무시하고 OLAP 데이터만으로 진행.
- 두 소스 모두 실패 또는 빈 결과 → 빈 상태 화면 + 업로드 CTA.
- 노드 중복(같은 id 또는 같은 name) → Neo4j 병합 시 기존 노드와 중복되면 건너뜀.
- 빈 SQL 내용 업로드 → `analyzeEtlCode`가 즉시 반환(무동작).
- ETL 노드에 `cube_name`이 없으면 노드 이름(`ETL_xxx` 접두 제거)에서 큐브명 추론.
- Electron 모드 → 세션 스토어의 `X-Neo4j-*` 헤더가 없으면 Neo4j 리니지 조회가 백엔드 기본 연결로 폴백.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST 탭 진입 시 자동으로 리니지 데이터를 로드한다(`onMounted` → `loadLineageData`).
- **FR-002**: System MUST OLAP ETL 개요(`/olap/api/etl/lineage/overview`)와 Neo4j 리니지(`/robo/lineage/`) 두 소스를 모두 조회해 노드/엣지/통계를 병합한다.
- **FR-003**: System MUST OLAP 응답의 `source_tables`/`etl_processes`/`target_tables`를 각각 SOURCE/ETL/TARGET 노드로, `data_flows`를 엣지(extract→`DATA_FLOW_TO`, 그 외→`TRANSFORMS_TO`)로 변환한다.
- **FR-004**: System MUST 한 소스의 조회가 실패해도 다른 소스 데이터만으로 계속 렌더한다(부분 실패 허용).
- **FR-005**: System MUST 노드를 SOURCE(좌)/ETL(중)/TARGET(우) 3컬럼으로 배치하고 컬럼 내 세로 중앙 정렬한다.
- **FR-006**: System MUST 소스/ETL/타겟/흐름 개수 통계 카드를 표시한다.
- **FR-007**: Users MUST be able to 이름 기준으로 노드를 검색·필터링한다.
- **FR-008**: Users MUST be able to 노드를 클릭해 상세 패널(인바운드/아웃바운드 연결, 속성)을 열고 닫는다.
- **FR-009**: Users MUST be able to `.sql/.pls/.pck` 파일을 업로드해 ETL 코드 분석(`/robo/lineage/analyze/`, dbms=`oracle`)을 트리거하고, 분석 후 자동 새로고침한다.
- **FR-010**: System MUST Neo4j 관련 요청(`getNeo4jLineage`, `analyzeEtlCode`)에 세션 스토어의 `X-Neo4j-*` override 헤더를 전달한다.
- **FR-011**: Users MUST be able to ETL 노드 상세에서 큐브의 Airflow DAG를 재생성(`/airflow/etl/{cube}/deploy?force=true`)하거나 Airflow UI를 새 탭으로 연다.
- **FR-012**: System MUST 데이터가 없을 때 빈 상태 화면과 업로드 CTA를, 에러 시 에러 메시지와 "다시 시도" 버튼을 표시한다.
- **FR-013**: System MUST 로딩 중 그래프 위에 로딩 오버레이를, 새로고침/업로드 버튼에 비활성·스피너 상태를 표시한다.

### Key Entities *(include if feature involves data)*

- **LineageGraphData**: 화면 상태의 루트. `nodes[]`, `edges[]`, `stats{etlCount, sourceCount, targetCount, flowCount}`.
- **LineageNode**: `id`, `name`, `type`(`SOURCE`|`TARGET`|`ETL`), `properties`(columns/schema/operation/cube_name 등). DataSource(소스/타겟 테이블)와 ETLProcess의 통합 표현.
- **LineageEdge**: `id`, `source`, `target`, `type`(`DATA_FLOW_TO`|`TRANSFORMS_TO`), `properties`. 데이터 흐름 1건.
- **LineageTab** (`features/lineage` 공개 진입점): 데이터 로딩·검색·업로드·선택 상태를 소유하는 탭 컨테이너.
- **LineageGraph** (내부): Vue Flow 기반 3컬럼 그래프 렌더러. 커스텀 `lineageNode` 노드, 미니맵/컨트롤/배경/레전드.
- **LineageDetailPanel** (내부): 선택 노드의 연결·속성·Airflow 액션 패널.
- **Backend `/robo/lineage/*`**: `GET /robo/lineage/`(Neo4j 그래프), `POST /robo/lineage/analyze/`(ETL 코드 분석) — robo-data-catalog 제공.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 탭 진입 후 별도 조작 없이 리니지 그래프와 통계가 자동 표시된다(수동 로드 0회).
- **SC-002**: 두 백엔드 소스 중 하나가 다운되어도 화면은 깨지지 않고 나머지 데이터로 정상 렌더된다.
- **SC-003**: 노드 클릭 시 해당 노드의 모든 인바운드·아웃바운드 연결이 상세 패널에 누락 없이 나열된다.
- **SC-004**: SQL 파일 업로드 후 그래프가 자동 갱신되어, 추가 새로고침 조작 없이 분석 결과가 반영된다.

## Assumptions

- API Gateway(`/api/gateway`)가 단일 진입점이며 `/robo`(catalog), `/olap`(OLAP) 라우팅을 제공한다.
- ETL 코드 분석의 DBMS는 항상 `oracle`로 하드코딩되어 있다(다중 DBMS는 범위 외).
- 이 SPA는 라우터 네비게이션이 아닌 `session.activeTab`으로 탭이 전환되며, 단일 `/` 라우트로 host(robo-architect)에 임베드된다.
- Neo4j 연결은 세션 스토어의 `X-Neo4j-*` 헤더로 override되며, 미설정 시 백엔드 기본 연결로 폴백한다(Electron/단독 실행 호환).
- 그래프 렌더링은 Vue Flow 및 그 minimap/controls/background 애드온에 의존한다.
- Airflow UI는 기본 `http://localhost:8080`을 가정한다.
