# Feature Specification: Object Explorer

**Feature Branch**: `005-object-explorer`

**Created**: 2026-06-15

**Status**: Backfilled (reverse-engineered)

**Input**: 기존 구현으로부터 역설계. 대상 코드: `src/features/object-explorer/` (ObjectExplorerTab, ObjectExplorerGraph, ObjectSearchPanel, ObjectDetailPanel, ChildSelectDialog, ObjectChartPanel, api.ts), `src/shared/services/http.ts`(ONTOLOGY_BASE_URL), `src/shared/config/features.ts`(탭 등록). 단독 라우트 없음 — 탭 ID `object-explorer`(라벨 "오브젝트 탐색기", 그룹 domain)로 등록되어 `session.activeTab` 으로 활성화됨.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Object Type 선택해 인스턴스 그래프 보기 (Priority: P1)

분석가는 좌측 패널의 Object Type 목록(예: Plant, ProcessUnit, Sensor 등 도메인 오브젝트 타입)에서 하나를 고른다. 시스템은 해당 타입의 Materialized View 데이터를 인스턴스 노드로 변환해 중앙 그래프에 색상별로 시각화한다. 인스턴스가 5개를 넘으면 먼저 선택 다이얼로그를 띄워 그래프에 올릴 노드를 고르게 한다.

**Why this priority**: 이 기능의 핵심 진입점. 이 한 흐름만 있어도 "도메인 오브젝트를 골라 그래프로 본다"는 가치를 단독으로 전달한다.

**Independent Test**: 탭 진입 → 좌측 목록에 Object Type 이 로드됨 → 항목 클릭 → 그래프에 노드 렌더(또는 5개 초과 시 선택 다이얼로그) 까지로 검증 가능.

**Acceptance Scenarios**:

1. **Given** 탭이 열려 Object Type 목록이 로드된 상태, **When** 사용자가 한 타입을 클릭, **Then** 해당 타입의 인스턴스가 그래프 노드로 렌더되고 우측 차트 패널에 타입별 차트가 표시된다.
2. **Given** 선택한 타입의 인스턴스가 5개를 초과, **When** 타입을 클릭, **Then** 하위 노드 선택 다이얼로그가 뜨고, 사용자가 고른 노드들만 새 그래프로 그려진다.
3. **Given** 그래프에 노드가 없는 초기 상태, **When** 탭 진입, **Then** 빈 상태 안내("Object Type을 선택하거나 검색")가 표시된다.

---

### User Story 2 - 노드 더블클릭 드릴다운으로 하위 오브젝트 확장 (Priority: P2)

사용자는 그래프의 노드를 더블클릭하여 스키마 정의에 따른 하위(자식) 오브젝트를 가져온다. 하위 노드는 기존 그래프에 관계선(예: HAS_CHILD)과 함께 추가된다. 하위가 5개를 넘으면 선택 다이얼로그로 추릴 수 있다.

**Why this priority**: 단일 타입 조회를 넘어 오브젝트 간 관계를 탐색하게 해주지만, P1 없이는 시작점이 없으므로 후순위.

**Independent Test**: 그래프에 노드가 있는 상태에서 노드 더블클릭 → 자식 노드와 관계선이 추가되는지로 검증.

**Acceptance Scenarios**:

1. **Given** 그래프에 노드가 있는 상태, **When** 노드를 더블클릭(또는 상세 패널에서 "하위 항목 탐색" 클릭), **Then** 스키마 기반 자식 노드가 부모와의 관계선과 함께 그래프에 추가된다.
2. **Given** 드릴다운 결과가 5개 초과, **When** 더블클릭, **Then** 선택 다이얼로그에서 고른 자식들만 부모에 연결되어 추가된다.
3. **Given** 이미 그래프에 존재하는 노드가 자식으로 반환됨, **When** 추가, **Then** 중복 노드는 제거되고 관계선만 갱신된다.

---

### User Story 3 - 이름 검색 및 노드 상세 확인 (Priority: P3)

사용자는 검색창에 오브젝트 이름을 입력해 타입에 무관하게 오브젝트를 찾아 그래프로 본다. 노드를 클릭하면 좌측이 상세 탭으로 전환되어 속성 테이블과 Object Type 정보(타입/설명/MV)를 보여준다.

**Why this priority**: 탐색 편의 기능. 핵심 그래프 흐름의 보조 역할.

**Independent Test**: 검색어 입력+엔터 → 결과 노드 그래프 렌더, 노드 클릭 → 상세 탭에 속성 표시까지로 검증.

**Acceptance Scenarios**:

1. **Given** 탭이 열린 상태, **When** 검색어 입력 후 검색 실행, **Then** 매칭 오브젝트가 그래프 노드로 렌더된다.
2. **Given** 그래프에 노드가 있는 상태, **When** 노드를 단일 클릭, **Then** 좌측 패널이 상세 탭으로 전환되며 id/name/__typename 을 제외한 속성과 타입 정보가 표시된다.

---

### Edge Cases

- Object Type 목록 로드 실패 시: 그래프 상단에 에러 배너 표시, 닫기 버튼으로 해제 가능.
- 빈 검색어로 검색 실행 시: 아무 동작도 하지 않음(요청 전송 안 함).
- ONTOLOGY 서비스 다운(404/502/503): 공유 `handleHttpError` 가 친절 안내 메시지로 변환(서비스/포트 안내).
- 드릴다운 결과가 0개: 그래프 변동 없음.
- 그래프 데이터가 직전 대비 50% 이상 급변하거나 처음 로드: NVL 인스턴스를 재초기화, 그 외에는 증분 업데이트.
- 차트 설정(chartConfig)이 없는 타입: 타입 이름 키워드로 차트 종류 추론(정수장/위치→map, 탁도/수질→line, 그 외→bar).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 시스템은 탭 진입 시 Object Type 목록을 자동 로드해 좌측 검색 패널에 표시해야 한다(이름/설명, 컬럼, MV 배지 포함).
- **FR-002**: 사용자는 좌측 목록에서 Object Type 필터(이름/설명 부분일치)로 목록을 좁힐 수 있어야 한다.
- **FR-003**: 사용자가 Object Type 을 선택하면, 시스템은 해당 타입의 데이터(행)를 인스턴스 그래프 노드로 변환해 표시해야 한다.
- **FR-004**: 선택/드릴다운 결과 노드가 5개를 초과하면, 시스템은 선택 다이얼로그(검색·전체선택·개별선택)를 먼저 제시해야 한다.
- **FR-005**: 사용자는 노드를 더블클릭(또는 상세 패널의 "하위 항목 탐색")하여 스키마 기반 자식 노드를 부모와의 관계선과 함께 그래프에 추가할 수 있어야 한다.
- **FR-006**: 시스템은 그래프에 노드를 추가할 때 동일 id 중복 노드를 제거해야 한다.
- **FR-007**: 사용자는 이름 검색으로 타입 무관 오브젝트를 찾아 그래프로 볼 수 있어야 한다.
- **FR-008**: 노드 단일 클릭 시 좌측 패널을 상세 탭으로 전환하고, id/name/__typename 을 제외한 속성과 Object Type 정보를 표시해야 한다.
- **FR-009**: 시스템은 Object Type 별로 동적 색상을 할당하고 그래프에 범례를 표시해야 한다.
- **FR-010**: 우측 차트 패널은 현재 그래프의 타입별 노드 그룹을, 각 타입의 chartConfig(없으면 이름 기반 추론)에 따라 차트로 렌더해야 한다.
- **FR-011**: 사용자는 좌·우 패널을 토글/리사이즈하고, 그래프를 초기화할 수 있어야 한다.
- **FR-012**: 시스템은 로딩 오버레이/스피너와, 해제 가능한 에러 배너로 비동기 상태를 알려야 한다.
- **FR-013**: 모든 백엔드 호출은 공유 HTTP 코어(ONTOLOGY_BASE_URL, `handleHttpError`)를 경유해 일관된 에러 처리를 해야 한다.

### Key Entities *(include if feature involves data)*

- **ObjectType**: 도메인 오브젝트 타입 정의. 속성 = id, name, description, columns[{name,type}], materializedView, query, chartConfig. 좌측 목록의 항목 단위이자 노드 색상/차트의 그룹 키.
- **ObjectNode(인스턴스 노드)**: 그래프에 그려지는 오브젝트 인스턴스. 속성 = id, name, type(=ObjectType 이름), labels[], properties{}. modules/functions/components 등 분석 그래프의 코드 오브젝트가 이 형태로 표현됨.
- **ObjectRelation(관계선)**: 부모→자식 드릴다운으로 생기는 엣지. 속성 = id, source, target, type(예: HAS_CHILD/RELATES_TO/ONE_TO_MANY).
- **ChartConfig**: 타입별 차트 표현 설정(chartType: bar/line/pie/map/none + 축·필드 매핑).
- **백엔드 엔드포인트(ONTOLOGY_BASE_URL = `/api/gateway/ontology`)**: 이 기능이 직접 호출하는 것 —
  - `GET /object-types` — Object Type 목록 (FR-001)
  - `GET /object-types/{name}/data?limit=` — 타입 인스턴스 데이터(MV) (FR-003)
  - `POST /object-explorer/search` — 이름 검색 (FR-007)
  - `POST /object-explorer/children` — 스키마 기반 하위 노드 드릴다운 (FR-005)
  - `GET /object-explorer/relationships/{name}` — 스키마 관계 정보(보조)
  - (참고: 동일 api 모듈은 `/object-types/{name}/chart-config`(PATCH) 등 다수 ObjectType/관계 CRUD 도 노출하나, Object Explorer 탭 UI 흐름의 직접 호출은 위 4종이 핵심)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 탭 진입 후 Object Type 목록이 자동으로 채워지고, 사용자는 추가 설정 없이 한 번의 클릭으로 인스턴스 그래프를 띄울 수 있다.
- **SC-002**: 5개를 초과하는 인스턴스/자식의 경우 100%의 경우에 선택 다이얼로그가 먼저 떠 한 번에 폭주하지 않는다.
- **SC-003**: 노드 더블클릭으로 추가 코드 작성 없이 관계 기반 하위 탐색(드릴다운)을 이어갈 수 있다.
- **SC-004**: 백엔드/네트워크 오류 시 사용자는 빈 화면이 아닌, 해제 가능한 안내 배너를 통해 원인(서비스 다운 등)을 인지한다.

## Assumptions

- 단독 브라우저 라우트가 없으며, 이 기능은 features 레지스트리의 탭(`object-explorer`)으로만 진입한다(메모리 히스토리, host 임베드 전제).
- 모든 데이터는 ONTOLOGY 백엔드(API Gateway `/api/gateway/ontology`)가 제공하며, 그래프 노드는 해당 응답을 변환한 것이다(프론트는 영속화하지 않음).
- 그래프 시각화는 Neo4j NVL(@neo4j-nvl) 캔버스 렌더러에 의존한다.
- 5개 초과 시 다이얼로그 제시는 의도된 UX 임계값(과밀 방지)이며 사용자 설정값이 아니다.
- 차트 종류는 타입의 chartConfig 가 우선, 없으면 한국어 이름 키워드(정수장/탁도 등)로 추론된다(수처리 도메인 가정).
