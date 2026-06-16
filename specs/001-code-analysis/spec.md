# Feature Specification: Code Analysis

**Feature Branch**: `001-code-analysis`

**Created**: 2026-06-15

**Status**: Backfilled (reverse-engineered) · **Reconciled 2026-06-16** (commit 4574254 — 진행바 실배선 + 그래프 영역/건강/테이블 보기)

**Input**: Reverse-engineered from existing code in `src/features/code-analysis/` (analyzer store, api, upload/graph components), `src/shared/services/http.ts` (gateway client), `src/shared/config/features.ts` (탭 정의), and `src/router/index.ts`. 이 기능은 robo-data-analyzer(robo) + antlr-code-parser(antlr) 백엔드의 프론트엔드 UI다.

> 🔄 **2026-06-16 정합(commit 4574254)**: ① 진행바를 **실제 백엔드 wire**(`event`=start/node_done/complete… + `node`=완료 step 함수명)에 배선 — 기존 문서의 `phase_event(started/in_progress/completed)`는 옛 표현이라 실제로 정정(FR-007·US2). ② 그래프에 **영역 보기**(component_id 색영역)·**건강 보기**(risk 색)·**테이블 전체** 추가(FR-021~023·US3). 자세한 wire·step·강결합은 FR-007 주석과 "Cross-Service 강결합" 절 참조.

## User Scenarios & Testing *(mandatory)*

레거시 코드(자바 프레임워크, Oracle/PostgreSQL 저장프로시저·DDL, 파이썬 등)를 가진 사용자가, 코드를 올리거나 로컬 폴더를 가리켜 **분석을 실행**하고, 분석이 진행되는 동안 **실시간 진행/그래프**를 지켜보고, 끝난 뒤 **지식 그래프·함수 요약·비즈니스 규칙**을 탐색하는 흐름이다. 앱은 단일 SPA로 '코드'(업로드) 탭과 '스키마 관리'(그래프) 탭을 메모리 라우터의 한 화면 안에서 탭 전환(`session.activeTab`)으로 보여준다. host(robo-architect) Electron에 임베드될 수도 있고 단독 실행될 수도 있다.

### User Story 1 - 코드를 올려 분석을 실행한다 (Priority: P1)

사용자는 '코드' 탭에서 프로젝트 폴더/파일을 드롭존에 끌어다 놓거나(브라우저 업로드 모드), Electron에서 host가 넘긴 로컬 폴더 절대경로를 그대로 분석한다(경로 모드, 업로드 없음). 업로드 모드면 업로드 모달에서 데이터소스/ FK 추론 옵션을 정한 뒤 "인제스천 시작"을 누른다. 그러면 **업로드 → 파싱(antlr 자동 언어감지) → 분석(robo)** 의 순차 파이프라인이 한 번에 돌고, 화면은 자동으로 그래프 탭으로 전환된다.

**Why this priority**: 이 기능의 존재 이유. 분석을 시작할 수 없으면 나머지(진행 표시·그래프 탐색)는 의미가 없다. 가장 작은 MVP = "파일을 올리면 분석이 끝까지 돈다".

**Independent Test**: 샘플 자바/SP 폴더를 드롭 → 모달 확인 → 파이프라인이 3단계를 끝내고 그래프가 채워지는지로 단독 검증 가능.

**Acceptance Scenarios**:

1. **Given** 빈 상태의 '코드' 탭, **When** 폴더를 드롭하고 업로드 모달에서 확인을 누르면, **Then** 업로드→파싱→분석이 순차 실행되고 그래프 탭으로 자동 이동하며 완료 메시지가 콘솔에 뜬다.
2. **Given** 이미 Neo4j에 데이터가 있는 상태, **When** 새 업로드/재시작을 시도하면, **Then** "기존 데이터 N개" 확인 모달이 떠 삭제/추가/취소와 이름 케이스(원본/대문자/소문자)를 선택할 수 있다.
3. **Given** Electron 경로 모드(host가 projectRoot 전달), **When** "분석 시작"을 누르면, **Then** 업로드 없이 해당 로컬 폴더를 바로 파싱·분석한다.

---

### User Story 2 - 분석 진행을 실시간으로 지켜본다 (Priority: P1)

사용자는 분석이 도는 동안 그래프 탭의 좌측 "그래프 오버뷰" 패널에서 현재 단계/진행률, 노드·관계 누적 카운트, 라이브 이벤트 피드, 콘솔 로그를 본다. 백엔드가 NDJSON 스트림으로 보내는 `phase_event`(단계 진행), `node_event`/`relationship_event`(그래프 단건 생성), `message`/`error`/`warning`(로그)이 실시간으로 화면에 반영된다.

**Why this priority**: AI 분석은 길게 걸리므로 진행 가시성이 핵심 가치다. 스트림이 라이브로 그래프를 그려, 끝나기 전부터 결과가 쌓이는 것을 보여준다.

**Independent Test**: 분석 실행 중 오버뷰 패널의 진행률·노드 카운트가 증가하고 이벤트 피드가 갱신되는지 관찰.

**Acceptance Scenarios**:

1. **Given** 분석 실행 중, **When** 백엔드가 `phase_event`를 보내면(`event:start` 시작 / `event:node_done`+`node:<step 함수명>` 단계완료 / `event:complete` 종료 / `paused`·`resumed`·`stopped`), **Then** 완료된 step이 누적되고 단계명(한국어 라벨)·퍼센트(완료수/총단계, complete 전까지 최대 99%)·경과시간이 갱신된다.
2. **Given** 분석 실행 중, **When** `node_event`/`relationship_event`가 도착하면, **Then** 캔버스/오버뷰에 노드·관계가 즉시 누적된다(숨김 라벨/관계 제외).
3. **Given** 진행 패널, **When** 일시정지/재개를 누르면, **Then** `/robo/analyze/control` 로 pause/resume 요청이 가고 `paused`/`resumed` 이벤트로 상태가 반영된다.
4. **Given** 분석 실행 중, **When** 시간이 흐르면, **Then** 진행 패널에 경과시간(`N분 M초`)이 1초마다 갱신된다.

---

### User Story 3 - 지식 그래프를 탐색한다 (Priority: P2)

분석이 끝나면 사용자는 그래프 탭에서 Navigator 트리의 노드를 캔버스로 드래그해 1-hop 이웃을 펼치고, 노드 더블클릭으로 이웃을 확장/접고, 검색·라벨 필터·"모듈간 상호작용 보기"(MODULE→TABLE 가상 링크 합성) 프리셋으로 탐색한다. Graph / UML / 스키마 세 뷰를 전환할 수 있고(UML은 java/python일 때만), 논리명/물리명 토글로 캡션을 바꾼다. 추가로 **영역 보기**(같은 `component_id`끼리 색 영역=convex hull로 묶기), **건강 보기**(노드 `risk`를 빨강/주황/초록 색으로 강조), **테이블 전체**(모든 TABLE과 관계 로드) 토글을 쓸 수 있다.

**Why this priority**: 분석 산출물의 실제 활용 단계. P1(실행·진행)이 있어야 데이터가 생기므로 그 다음 우선순위.

**Independent Test**: 기존 그래프를 로드한 상태에서 Navigator 노드 드롭→이웃 확장, 라벨 필터, 프리셋 토글이 동작하는지 검증.

**Acceptance Scenarios**:

1. **Given** 데이터가 로드된 그래프 탭, **When** Navigator 트리 노드를 캔버스에 드롭하면, **Then** 그 노드가 추가되고 더블클릭 시 1-hop 이웃이 누적 표시된다.
2. **Given** 캔버스에 노드들, **When** "모듈간 상호작용 보기"를 누르면, **Then** MODULE/TABLE만 남고 함수를 압축한 가상 링크가 그려진다(DB 무변경).
3. **Given** java/python 분석 결과, **When** UML 뷰로 전환하면, **Then** 클래스 다이어그램이 표시된다(oracle/postgresql은 UML 비활성).
4. **Given** 캔버스에 노드들, **When** "영역 보기"를 켜면, **Then** 같은 `component_id`(없으면 라벨)끼리 안정 색상의 convex-hull 영역으로 묶이고 그룹 라벨이 표시되며, 팬/줌/레이아웃/드래그 시 오버레이가 NVL 캔버스와 동기 재그려진다.
5. **Given** 노드에 `risk` 속성, **When** "건강 보기"를 켜면, **Then** 라벨색 대신 위험도색(high=빨강/medium=주황/low=초록/없음=회색)으로 칠해진다(공유 `getNodeColor` 불변, NvlGraph 로컬 override).
6. **Given** 그래프 탭, **When** "테이블 전체"를 누르면, **Then** 필터·프리셋을 비우고 모든 TABLE 노드와 그 관계가 로드된다.

---

### User Story 4 - 함수 요약·비즈니스 규칙을 본다 (Priority: P2)

사용자는 노드를 선택하면 우측 상세 패널에서 라벨별 전용 카드(FUNCTION/TABLE/COLUMN/MODULE/SQL 등)를 본다. 함수 카드는 역할(actor)·개요·원문 코드(주석 제거)·파일/라인 위치를 보여주고, 원문 라인으로 점프해 '코드' 탭에서 해당 라인을 하이라이트한다. 비즈니스 규칙(Rule/Example/Question)은 메타 라벨로 그래프에는 숨기되 데이터로 유지된다.

**Why this priority**: 레거시 이해의 핵심 가치(요약·규칙)지만, 그래프 탐색(P2)에 종속된 상세 뷰라 같은 우선순위로 둔다.

**Independent Test**: FUNCTION 노드를 선택해 상세 카드가 역할/코드/위치를 표시하고, 코드 점프가 '코드' 탭의 해당 라인을 하이라이트하는지 검증.

**Acceptance Scenarios**:

1. **Given** FUNCTION 노드 선택, **When** 상세 패널이 열리면, **Then** 역할·원문 코드·모듈·파일·라인 정보가 표시된다.
2. **Given** 노드 상세에서 원문 위치, **When** 코드 점프를 하면, **Then** '코드' 탭이 해당 파일을 열고 라인을 하이라이트한다.

### Edge Cases

- 업로드된 파일이 하나도 없는데 인제스천/재시작 시 → 에러 메시지("업로드된 파일이 없습니다").
- 백엔드 서비스 다운(404/502/503) → URL 매칭으로 서비스별 친절 안내(antlr 8081 / robo 5502 / gateway 9000).
- 노드보다 관계가 먼저 도착(다른 batch/phase) → 링크는 일단 적재, 노드가 이후 들어오면 자동 연결.
- 분석 후 최종 정합성을 위한 `/robo/graph/` 재조회 실패 → 스트리밍으로 누적된 그래프를 그대로 유지(경고만).
- 숨김 노드 라벨(Rule/Example/Question)·숨김 관계(NEXT/REFERENCES/HAS_RULE/AFFECTS_TABLE/BRANCH 등)는 표시에서 제외하되 데이터는 보존.
- 새로고침 후에도 업로드 파일/소스타입은 localStorage(PROJECT_STATE)에서 복원.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST 사용자가 '코드' 탭에서 폴더/파일을 드래그-드롭하거나 모달로 추가해 업로드할 수 있게 한다(소스/DDL 파일 분리 표시).
- **FR-002**: System MUST Electron 경로 모드에서 host가 넘긴 로컬 폴더 절대경로(projectRoot)를 업로드 없이 바로 분석한다.
- **FR-003**: System MUST 업로드 → 파싱(antlr) → 분석(robo) 순차 파이프라인을 한 번의 시작으로 실행한다.
- **FR-004**: System MUST 파싱 단계에서 antlr가 자동 감지한 언어를 sourceType에 반영해 strategy(framework/dbms)·target을 파생한다.
- **FR-005**: System MUST 인제스천 시작 시 그래프 뷰로 자동 전환해 실시간 진행을 보여준다.
- **FR-006**: System MUST 기존 Neo4j 데이터가 있으면 확인 모달로 삭제/추가/취소와 이름 케이스(원본/대문자/소문자)를 선택받는다.
- **FR-007**: System MUST 분석 NDJSON 스트림의 `phase_event`(필드 `event`+`node`)로 진행을 갱신한다. `event:start`=초기화, `event:node_done`+`node:<step 함수명>`=그 step을 누적해 진행률 `(완료수+1)/총단계×100`(complete 전 최대 99%)·단계 한국어 라벨(STEP_LABELS 매핑) 표시, `event:complete`=100%, `paused`/`resumed`/`stopped`=상태 반영. 총단계=strategy별 고정(dbms 13 / framework 14). *(구현: analyzer.ts `applyPhaseEvent`·`STEP_LABELS`·`totalPhases`)*
- **FR-008**: System MUST `node_event`/`relationship_event`를 받아 그래프를 라이브로 누적 렌더하고 이벤트 피드를 표시한다(최대 500건).
- **FR-009**: System MUST `message`/`error`/`warning` 스트림 이벤트를 콘솔 로그 피드로 보여준다.
- **FR-010**: System MUST 파이프라인 일시정지/재개를 요청할 수 있다.
- **FR-011**: System MUST 분석 종료 후 최종 그래프를 백엔드에서 재조회해 정합성을 보강하되, 실패 시 누적분을 유지한다.
- **FR-012**: System MUST 숨김 라벨/관계를 표시에서 제외한다(데이터는 보존).
- **FR-013**: Users MUST be able to Navigator 트리 노드를 캔버스에 드롭하고, 더블클릭으로 1-hop 이웃을 확장/접을 수 있다.
- **FR-014**: System MUST 검색, 라벨 필터, "모듈간 상호작용 보기" 프리셋(MODULE→TABLE 가상 링크 합성)을 제공한다.
- **FR-015**: System MUST Graph/UML/스키마 뷰 전환을 제공하고 UML은 java/python일 때만 활성화한다.
- **FR-016**: System MUST 논리명/물리명 캡션 토글을 제공한다.
- **FR-017**: System MUST 노드 선택 시 라벨별 상세 카드(함수 역할·원문 코드·파일/라인 등)를 표시하고, 원문 위치로 코드 탭 점프·라인 하이라이트를 지원한다.
- **FR-018**: System MUST 모든 백엔드 호출을 API Gateway(`/api/gateway`) 단일 진입점으로 보내고, 세션 헤더(getHeaders, Neo4j override 포함)를 동봉한다.
- **FR-019**: System MUST 서비스 다운(404/502/503)을 서비스별 안내 메시지로 보여준다.
- **FR-020**: System MUST 업로드 파일/소스타입을 localStorage에 저장·복원한다.
- **FR-021**: System MUST 분석 진행 중 경과시간을 1초 단위(`N분 M초`)로 진행 패널에 표시한다(분석 시작 기준, 종료 시 정지). *(구현: FloatingProgressPanel.vue)*
- **FR-022**: System MUST "영역 보기" 토글을 제공한다 — 같은 `node.properties.component_id`(없으면 대표 라벨)끼리 convex-hull 색 영역으로 묶고, 그룹 라벨(`component_name` 우선)을 표시한다. 오버레이 캔버스는 `pointer-events:none`로 NVL 클릭을 통과시키고, 팬/줌/레이아웃/노드드래그 시 NVL 좌표변환을 미러링해 동기 재그린다. *(구현: useGroupHulls.ts + NvlGraph.vue 콜백)*
- **FR-023**: System MUST "건강 보기" 토글을 제공한다 — `colorMode='health'`일 때 노드를 `node.properties.risk`(high=빨강/medium=주황/low=초록/없음=회색)로 칠한다. 공유 `getNodeColor`는 변형하지 않고 NvlGraph 로컬 `resolveNodeColor`로 override한다.
- **FR-024**: System MUST "테이블 전체" 동작을 제공한다 — 라벨필터·프리셋을 비우고 `loadNodesByLabels(['Table'])`로 모든 TABLE과 그 관계를 로드한다.

### Key Entities *(include if feature involves data)*

- **코드 탭(UploadTab)**: 드롭존·업로드 모달·파일/DDL 트리·코드 뷰어(라인 하이라이트)·경로 모드 패널. session.activeTab=`upload`.
- **그래프 탭(GraphTab)**: 캔버스(NvlGraph), Graph/UML/스키마 뷰 전환, 그래프 오버뷰(진행·통계·이벤트·콘솔), 노드 상세 패널, 스타일 패널. 그래프 보기 토글 상태=`groupHullBy`('component_id'|null, 영역 보기)·`colorMode`('label'|'health', 건강 보기)·`schemaMode`('canvas'|'mermaid', 스키마 하위 전환). session.activeTab=`graph`(메뉴 라벨 "스키마 관리").
- **analyzer 스토어**: 메타데이터(sourceType/ddl/nameCase/projectRoot), 파이프라인 실행, nodeMap/linkMap(그래프 누적), 콘솔/이벤트 피드, 데이터 확인 모달, 파이프라인 제어.
- **canvas 스토어**: 캔버스 표시 부분집합·이웃 확장/접기·라벨 격리·"모듈간 상호작용" 가상 그래프.
- **그래프 데이터**: Neo4j Node(Labels/Properties)·Relationship(Type/Start/End). 노드는 MODULE/FUNCTION/TABLE/COLUMN/PACKAGE/SQL 등 멀티라벨, 비즈니스 메타는 Rule/Example/Question. UI가 소비하는 표시용 속성: `component_id`/`component_name`(영역 보기 군집), `risk`(high/medium/low, 건강 보기).
- **백엔드 엔드포인트 (gateway 경유)**:
  - `POST /api/gateway/antlr/fileUpload` — 파일 업로드(FormData, 폴더 구조 보존).
  - `POST /api/gateway/antlr/parsing` — 파싱(NDJSON 스트림, 언어 자동감지 `detected`).
  - `POST /api/gateway/robo/analyze` — 소스 분석 → Neo4j 그래프 생성(NDJSON 스트림: phase/node/relationship/message).
  - `POST /api/gateway/robo/analyze/control` — 파이프라인 pause/resume/stop.
  - `GET  /api/gateway/robo/check-data/` — 기존 데이터 존재/노드수 확인.
  - `GET  /api/gateway/robo/graph/` — 기존/최종 그래프 데이터 조회.
  - `DELETE /api/gateway/robo/delete/` — 사용자 데이터(임시파일+Neo4j) 전체 삭제.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 사용자가 폴더 드롭부터 분석 완료까지 추가 설정 없이 한 번의 "인제스천 시작"으로 끝낼 수 있다.
- **SC-002**: 분석 중 진행 단계·노드/관계 카운트가 스트림 도착 즉시(폴링 없이) 화면에 반영된다.
- **SC-003**: 기존 데이터가 있을 때 사용자가 의도치 않게 덮어쓰지 않도록 100% 확인 모달을 거친다.
- **SC-004**: 백엔드 서비스 다운 시 사용자가 어떤 서비스/포트를 점검해야 하는지 안내 메시지로 즉시 알 수 있다.
- **SC-005**: FUNCTION 노드 상세에서 원문 코드·파일/라인을 보고 한 번의 액션으로 원문 라인으로 점프할 수 있다.

## Cross-Service 강결합 (진행바 ↔ robo 백엔드)

진행바는 robo-data-analyzer 백엔드 wire에 **강결합**되어 있어, 백엔드 변경 시 프론트도 함께 고쳐야 한다(회귀 위험 — [[principle-no-regression-sdd]]):

- **step 함수명 계약**: `phase_event.node`로 오는 step 함수명(`parse_ddl_step`·`load_ast_step`·…·`embed_step`)을 프론트 `STEP_LABELS`가 한국어 라벨로 매핑한다. 백엔드가 step 이름을 바꾸면 라벨이 깨져 폴백(이름 그대로)으로 표시된다.
- **총단계 수 계약**: 진행률 분모(`totalPhases`)가 strategy별 **하드코딩**(dbms 13 / framework 14). 백엔드 step 개수가 바뀌면 진행률이 99%에서 멈추거나 부정확해진다. → 백엔드 파이프라인 step 추가/삭제 시 이 상수 동반 수정 필수.
- **계약 단일 진실**: 프론트 소비측 `AnalyzeEvent`(types/index.ts) + `applyPhaseEvent`(analyzer.ts). 생산측은 robo `executor.py`·`pause_controller.py`.

## Assumptions

- 진행 상태는 분석 NDJSON 스트림의 `phase_event`(필드 `event`/`node`/`run_id`) 단일 채널로만 전달된다(별도 `/pipeline/*` 폴링 엔드포인트 없음).
- 모든 백엔드 호출은 API Gateway(`/api/gateway`, Vite 프록시→Spring Gateway 9000) 단일 진입점을 거친다. antlr/robo는 게이트웨이 하위 경로.
- 앱은 vue-router 메모리 히스토리에 `'/'` 단일 라우트만 두고, 화면 전환은 라우팅이 아니라 `session.activeTab` 탭 전환으로 한다(host 임베드 시 브라우저 URL 미간섭).
- 세션/멀티테넌시·Neo4j 접속 override는 공유 session 스토어의 헤더(getHeaders, X-Neo4j-* 또는 contextvar)로 처리한다(이 기능 범위 밖).
- 비즈니스 규칙(Rule/Example/Question) 및 일부 보조 관계는 현재 화면에서 숨김 처리되어 있으나 데이터는 보존된다(정책 set만 비우면 노출 가능).
- 기존 robo-data-analyzer(robo) + antlr-code-parser(antlr) 백엔드와 Neo4j가 가용하다고 가정한다.
