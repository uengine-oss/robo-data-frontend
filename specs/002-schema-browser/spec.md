# Feature Specification: Schema Browser

**Feature Branch**: `002-schema-browser`

**Created**: 2026-06-15

**Status**: Backfilled (reverse-engineered) · **Reconciled 2026-06-16** (commit 4574254 — 스키마 툴바 통일)

**Input**: Existing code under `src/features/schema/` (SchemaView/SchemaCanvas/MermaidERView/TableDetailPanel + `schemaCanvas` Pinia store + `api.ts`), consuming robo-data-catalog(robo-analyzer) schema endpoints via the API Gateway. 역설계로 작성된 명세.

> 🔄 **2026-06-16 정합(commit 4574254 + 미커밋 아이콘)**: 스키마 캔버스/Mermaid 전환 토글을 SchemaView 내부에서 **GraphTab의 통합 툴바로 이전**했다. SchemaView는 **순수 콘텐츠 컴포넌트**가 되어 로컬 상태를 버리고 `mode`('canvas'|'mermaid') prop만 받는다(상태=GraphTab `schemaMode`). 메인 뷰 스위처(Graph/UML/스키마)와 **같은 자리·스타일**로 일관화. 메뉴 아이콘은 `IconDatabase`→`IconTable`(features.ts SSoT). 기능·백엔드 계약 불변(순수 UI 리팩토링). FR-009·View modes·Assumptions 참조.

## User Scenarios & Testing *(mandatory)*

분석된 데이터베이스 스키마(테이블 / 컬럼 / 관계)를 시각적으로 탐색하고, 사람이 읽을 수 있는 설명을 직접 보강하는 화면이다. 데이터 분석가·도메인 전문가가 ERD를 보며 메타데이터를 이해·개선하는 것이 목적이다.

### User Story 1 - 테이블 ERD 캔버스 탐색 (Priority: P1)

사용자가 좌측 테이블 목록(데이터소스 > 스키마 > 테이블 3단 그룹)에서 테이블을 선택하면, 그 테이블이 캔버스에 노드로 추가되고 FK 관계로 연결된 인접 테이블이 자동으로 함께 그려진다. 노드를 클릭하면 우측 상세 패널에 컬럼 목록(타입·nullable·설명)이 나타난다.

**Why this priority**: 스키마를 "본다"는 행위 자체가 이 기능의 핵심 가치이며, 나머지 기능(편집·관계관리)은 모두 이 탐색 위에서 일어난다. 이것만 있어도 카탈로그 열람 MVP가 성립한다.

**Independent Test**: robo-analyzer가 분석한 데이터셋에서 테이블 하나를 캔버스에 올려 컬럼과 인접 FK 테이블이 표시되는지 확인.

**Acceptance Scenarios**:

1. **Given** 분석 완료된 스키마, **When** 좌측 목록에서 테이블을 클릭, **Then** 해당 노드와 FK로 연결된 테이블들이 캔버스에 자동 배치(ELK 레이아웃)된다.
2. **Given** 캔버스의 테이블 노드, **When** 노드를 클릭, **Then** 우측 패널에 컬럼·타입·설명과 설명 출처(ddl/procedure/code/user) 색상 배지가 표시된다.
3. **Given** 캔버스에 두 테이블이 있고 FK 관계가 존재, **When** 화면을 보면, **Then** 출처별 스타일(ddl=초록 실선, code=하늘색 점선, user=주황 실선)과 카디널리티 마커(1:1·1:N·N:1·N:N)의 엣지가 그려진다.

---

### User Story 2 - 설명(메타데이터) 편집 (Priority: P2)

사용자가 상세 패널에서 테이블 설명 또는 개별 컬럼 설명을 인라인으로 편집·저장한다. 저장 시 백엔드에 영속화되고 캔버스 노드/캐시에도 즉시 반영된다.

**Why this priority**: 단순 열람을 넘어 카탈로그 품질을 개선하는 핵심 쓰기 동작. 탐색(P1) 다음으로 가치가 크다.

**Independent Test**: 임의 테이블의 설명을 수정·저장 후 새로고침하여 값이 유지되는지 확인.

**Acceptance Scenarios**:

1. **Given** 노드를 선택한 상태, **When** 테이블 설명을 편집하고 저장, **Then** `PUT /robo/schema/tables/{table}/description` 호출 후 패널·노드 모두 새 값으로 갱신된다.
2. **Given** 컬럼 행, **When** 컬럼 설명을 편집·저장, **Then** `PUT /robo/schema/tables/{table}/columns/{column}/description` 호출 후 캐시·노드·선택 컬럼이 갱신된다.
3. **Given** 편집 요청, **When** 저장, **Then** 세션 헤더(`sessionStore.getHeaders()`)가 함께 전송되어 사용자 출처(user)로 기록된다.

---

### User Story 3 - 관계 관리 및 보조 뷰 (Priority: P3)

사용자가 두 컬럼을 연결해 새 FK 관계를 추가(카디널리티·매칭전략 지정)하거나 기존 관계를 삭제한다. 또한 캔버스 대신 Mermaid ER 텍스트 다이어그램 뷰로 전환해 전체 구조를 한눈에 본다. 의미 기반 테이블 검색, 테이블 데이터 미리보기, 프로시저 참조 추적 등의 보조 기능을 사용한다.

**Why this priority**: 고급/보조 기능으로, 핵심 열람·편집 흐름이 없어도 독립적으로 의미가 없다. 마지막 우선순위.

**Independent Test**: 두 테이블 간 관계를 추가→캔버스 엣지 표시→삭제까지 수행해 백엔드 반영을 확인.

**Acceptance Scenarios**:

1. **Given** 상세 패널의 관계 추가 폼, **When** from/to 컬럼·카디널리티 지정 후 저장, **Then** `POST /robo/schema/relationships` 호출 후 관계 목록이 재로딩된다.
2. **Given** 사용자 정의 관계, **When** 삭제, **Then** `DELETE /robo/schema/relationships` 호출되고 삭제 개수가 0이면 경고한다.
3. **Given** 캔버스 뷰, **When** "Mermaid ER" 탭으로 전환, **Then** 동일 스키마가 Mermaid 텍스트 ERD로 렌더된다.

### Edge Cases

- 테이블 컬럼 조회가 0건이면 캐시하지 않고(일시적 0건 영속 방지), 상세 패널 진입 시 schema 비운 fallback으로 재시도한다.
- FK 관계 API가 빈 결과면 컬럼명 `_id` 패턴 기반 추론(fallback)으로 인접 테이블을 유추한다.
- robo-analyzer 서비스 다운(404/502/503) 시 `/robo/` 매칭 안내 메시지(포트 5502, Gateway 9000 확인)를 표시한다.
- 관계 삭제 결과 `deleted === 0`이면 "삭제된 관계가 없습니다" 경고를 띄운다.
- 대문자 식별자 테이블 데이터 조회 시 PostgreSQL/MySQL 식별자 따옴표 규칙에 맞춰 SQL을 감싼다.
- 데이터소스를 확인할 수 없으면 데이터 미리보기 패널에 명시적 오류를 표시한다.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST 테이블 목록을 `GET /robo/schema/tables`(search·schema·limit 옵션)로 조회하고 데이터소스 > 스키마 > 테이블 3단으로 그룹·정렬하여 표시한다.
- **FR-002**: System MUST 노드 선택 시 컬럼 목록을 `GET /robo/schema/tables/{table}/columns`로 조회해 이름·dtype·nullable·설명·설명출처를 표시한다.
- **FR-003**: System MUST FK/관계를 `GET /robo/schema/relationships` 및 `GET /robo/graph/related-tables/{table}`로 조회하여 캔버스 엣지로 렌더한다.
- **FR-004**: System MUST 관계 엣지를 출처(ddl/code/user)별 스타일과 카디널리티(1:1·1:N·N:1·N:N) 마커로 구분 표시하고, 출처별 범례 체크박스로 표시/숨김을 토글한다.
- **FR-005**: Users MUST be able to 테이블 설명을 `PUT /robo/schema/tables/{table}/description`로 편집·저장한다.
- **FR-006**: Users MUST be able to 컬럼 설명을 `PUT /robo/schema/tables/{table}/columns/{column}/description`로 편집·저장한다.
- **FR-007**: System MUST 설명 저장 요청에 세션 헤더를 포함하여 사용자 작성 출처(user)로 기록되게 한다.
- **FR-008**: Users MUST be able to FK 관계를 `POST /robo/schema/relationships`로 추가(카디널리티·매칭전략 포함)하고 `DELETE /robo/schema/relationships`로 삭제한다.
- **FR-009**: System MUST 캔버스 뷰와 Mermaid ER 뷰 간 전환을 제공한다. 전환 토글은 **GraphTab 통합 툴바**(메인 Graph/UML/스키마 스위처와 같은 자리·스타일, `activeView==='schema'`일 때만 노출)에 두고, SchemaView는 `mode` prop만 받는 순수 콘텐츠로 둔다(두 자식은 v-show로 항상 마운트해 전환 시 상태 보존).
- **FR-010**: System MUST 의미 기반 테이블 검색을 `POST /robo/schema/semantic-search`로 제공한다(robo 데이터소스 한정).
- **FR-011**: System MUST 테이블/컬럼이 참조된 프로시저를 `GET /robo/schema/tables/{table}/references`로, 프로시저 statement·AI 설명을 `GET /robo/schema/procedures/{proc}/statements`로 조회한다.
- **FR-012**: System MUST 테이블 데이터 미리보기를 Text2SQL `POST /text2sql/direct-sql/stream`(NDJSON 스트림)으로 실행하여 행/컬럼/실행시간을 표시한다.
- **FR-013**: System MUST 'robo'(Neo4j 분석결과)와 'text2sql'(PostgreSQL 인제스천) 두 데이터소스를 전환할 수 있어야 하며, 전환 시 캔버스를 초기화하고 재로딩한다.
- **FR-014**: System MUST 모든 백엔드 호출을 API Gateway base URL(`/api/gateway`, `ROBO_BASE_URL=/api/gateway/robo`)을 통해 보낸다.

### Key Entities *(include if feature involves data)*

- **Table (RoboSchemaTableInfo)**: name, table_schema, datasource, description, description_source(ddl/procedure/user), analyzed_description, column_count. 캔버스의 노드로 표현됨.
- **Column (RoboSchemaColumnInfo)**: name, table_name, dtype, nullable, description, description_source, analyzed_description. 노드 내부 행 및 상세 패널 행.
- **Relationship (RoboSchemaRelationship)**: from/to (table·schema·column), relationship_type(FK_TO_TABLE·ONE_TO_MANY 등), description, source(ddl/code/user), column_pairs. 캔버스 엣지.
- **Editable Description**: 테이블·컬럼의 사용자 편집 가능한 설명 텍스트. 저장 시 출처가 user로 기록됨.
- **View modes**: SchemaView(**순수 콘텐츠**, `mode` prop) → SchemaCanvas(VueFlow 노드/엣지) / MermaidERView(텍스트 ERD)를 v-show로 동시 마운트; 전환 상태는 GraphTab `schemaMode`가 보유하고 통합 툴바가 제어. TableDetailPanel(우측 상세·편집).

#### Backend endpoints (cross-service contract, robo-data-catalog/analyzer via Gateway)

- `GET /robo/schema/tables`, `GET /robo/schema/tables/{table}/columns`
- `GET /robo/schema/relationships`, `POST /robo/schema/relationships`, `DELETE /robo/schema/relationships`
- `GET /robo/graph/related-tables/{table}`
- `PUT /robo/schema/tables/{table}/description`, `PUT /robo/schema/tables/{table}/columns/{column}/description`
- `GET /robo/schema/tables/{table}/references`, `GET /robo/schema/procedures/{proc}/statements`
- `POST /robo/schema/semantic-search`
- 보조: `POST /text2sql/direct-sql/stream`(데이터 미리보기), `/api/gateway/ontology/*`(ObjectType 데이터)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 사용자가 테이블을 선택하면 노드·컬럼·인접 FK가 별도 조작 없이 한 번에 표시된다.
- **SC-002**: 테이블/컬럼 설명을 편집·저장하면 새로고침 후에도 값이 유지되며 출처가 user로 기록된다.
- **SC-003**: 관계 추가/삭제가 캔버스 엣지에 즉시(재로딩 후) 반영된다.
- **SC-004**: 캔버스 ↔ Mermaid ER 뷰 전환이 데이터 손실 없이 동작한다.
- **SC-005**: robo-analyzer 서비스 장애 시 사용자에게 원인·복구 안내 메시지가 표시된다.

## Assumptions

- 백엔드 robo-analyzer(robo-data-catalog)가 사전에 DDL/프로시저를 분석해 Neo4j에 테이블·컬럼·관계를 적재했다고 가정한다.
- 모든 API는 단일 진입점인 API Gateway(`/api/gateway`, Vite 프록시 → Spring Gateway 9000)를 통해 호출된다.
- 이 앱은 robo-architect 호스트에 임베드되며 memory history 라우터(`'/'` 단일 라우트)를 사용한다. 화면 전환은 라우트가 아니라 세션 탭/뷰 모드로 이루어진다. 스키마 캔버스/Mermaid 하위 전환 상태는 GraphTab의 `schemaMode`가 단일 보유(SchemaView 로컬 상태 아님).
- 메뉴·탭 아이콘은 `src/shared/config/features.ts`가 단일 진실원천(SSoT) — SideNav·HomeView 모두 여기서 파생. 스키마('graph') 아이콘=`IconTable`.
- 기본 데이터소스는 'robo'(Neo4j 분석 결과)이며, 'text2sql'(PostgreSQL 인제스천)은 컬럼 조회에 datasource가 필요하다.
- 세션/인증(Neo4j 컨텍스트 포함)은 기존 sessionStore 헤더 메커니즘을 재사용한다.
