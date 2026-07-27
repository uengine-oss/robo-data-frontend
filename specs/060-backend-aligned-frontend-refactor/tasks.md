# Tasks: 백엔드 책임 기준 프론트 전면 리팩토링

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), `contracts/architecture-rules.md`

## Phase 1: Baseline and Governance

- [x] T001 현재 저장소 WIP와 독립 backend 경계를 재확인
- [x] T002 baseline 고정: build:docker 통과, type-check 208 errors, 057/059 계약 통과
- [x] T003 constitution 1.1.0으로 backend-aligned domain/workflow 원칙 개정
- [x] T004 060 spec·plan·architecture contract 작성
- [x] T005 구조 검증기 작성: domain 공개 경계, shared 역참조, UI raw fetch, 옛 경로 검사

## Phase 2: Data Fabric Domain

- [x] T010 이동 전 Data Fabric API method/path/header/body 계약 테스트 작성
- [x] T011 `features/datasources`를 `domains/data-fabric`으로 `git mv`
- [x] T012 API DTO와 transport를 `api/contracts.ts`, `api/client.ts`로 추출
- [x] T013 connector catalog와 Pinia state를 분리하고 `any` 제거
- [x] T014 모든 소비자와 feature registry를 새 public boundary로 동시 이동
- [x] T015 옛 `features/datasources` 경로·Data Fabric UI raw fetch 0 확인
- [x] T016 domain strict 타입검사·production bundle·057/059 회귀 통과
- [x] T017 Data Fabric request/response 계약과 mutation UI 상태 검증
  - 2026-07-22: 목록·health·테이블·87개 connector modal·503 오류·재시도는 실제 서비스와 Playwright로 통과. 기존 `shopmall`을 보존하기 위해 등록·시험·삭제 mutation은 아직 수행하지 않음.
  - 2026-07-24 범위 확정: 운영 mutation E2E는 frontend refactor 완료 조건에서 제외하고 connector
    request/response parser와 9-endpoint client contract로 닫는다.

## Phase 3: Parser, Catalog, Analyzer and Analysis Workflow

- [x] T020 Parser domain 이동과 upload/parsing stream 계약 검증
  - 2026-07-22: Parser API와 upload application 규칙을 `domains/parser`로 이동. 실제 Parser 8401 health, upload modal UI, injected upload/JSON/stream 계약 통과. 실제 upload mutation은 completion live audit에서 수행.
- [x] T021 Catalog domain에 graph/schema/lineage 계약 통합
  - 2026-07-22: Gateway의 Analyzer/Catalog 라우팅을 대조해 schema·graph·lineage를 `domains/catalog`, source/search/analyze를 `domains/analyzer`로 분리. 실제 Catalog health·schema·graph·lineage 읽기와 1920×1080 정상/전체 장애 UI, architecture contract, production build, 057/059 회귀 통과. 운영 데이터를 바꾸는 delete/analyze mutation은 수행하지 않음.
- [x] T022 Analyzer graph WIP 보호 경계 확정
  - 057/059와 `panelGraphProjection.ts`, code-analysis graph 구현은 사용자 진행 WIP이므로 이번
    재건설에서 이동·덮어쓰기하지 않는다. 착지 뒤 별도 spec에서 무-shim 이동한다.
- [x] T023 code-analysis workflow로 upload→parse→analyze→catalog 흐름 추출
  - 2026-07-23: upload UI 8개와 lazy public entry를 `workflows/code-analysis`로 무-shim 이관했다.
    Parser tree/file 정책, Analyzer pipeline state, Catalog graph 조회, Data Fabric datasource 공개 계약이
    workflow에서 직선으로 조립되며 옛 upload path는 0이다. Data Fabric 87개 connector catalog를 복제하던
    4개 하드코딩 fallback, `any` tree/datasource 흐름, 임의 부분문자열 파일 추론, 비관리 source-navigation/
    toast timer, native alert/confirm을 제거했다. 결정론 file lookup·connector 단일 진실 계약, 전체 type-check,
    349-source 구조 검사, 1920×1080 목록/생성 503→재시도→성공 payload, 포커스/Escape/삭제, 390×844
    반응형 modal, Analyzer 인접 회귀, 4,787-module production build와 lazy boundary가 통과했다.
- [x] T024 standalone/embedded 분석 정적 host contract 검증
  - 사용자 지시에 따라 실제 host/backend E2E 대신 feature id, embedded entry, mount/context와 build
    boundary를 검증한다.

## Phase 4: Remaining Backend Domains

- [x] T030 Text2SQL domain: query/history/direct-sql/observability 하위 책임 분리
  - 2026-07-22: query/history/direct SQL의 실제 응답 계약과 event rules/notifications/scheduler/chat/CEP/simulation/SSE/template
    런타임 계약을 정리했다. 잘못된 history ID, 행 인덱싱, 존재하지 않는 `/generate`, 합성 provenance/SQL,
    이벤트 로컬 성공 폴백, 하드코딩된 CEP 연결 상태, 암묵적 simulation 값을 제거했다. 전체 타입·계약·구조·빌드,
    1920×1080 정상/실패 브라우저 및 057/059 회귀는 통과했다. 실제 Text2SQL event/history upstream은 HTTP 500이며,
    이후 query client의 session header·health 계약·손상 stream line 처리까지 정리하고 재검증했다. 실제 성공
    mutation/stream은 upstream 500 때문에 T052의 미검증 항목으로 유지한다.
- [x] T031 Ontology domain: domain/ontology/object-explorer 통합, domain-whatif는 내부 하위 기능 유지
  - 2026-07-22: Ontology 요청의 세션 헤더와 stream terminal 계약을 통합하고, 외부 Behavior 테스트의
    비밀 헤더 유출·자동 가짜 payload·임의 지도 좌표·가짜 차트 샘플·빈 데이터 자동 실행을 제거했다.
- [x] T032 독립 WhatIf, OLAP, Glossary, Security 이동
  - 2026-07-22: OLAP API·state·Cube/Pivot UI를 실제 `data-platform-olap` 모델 기준으로 정리하고 명시적 `any` 0,
    계약 parser, 1920×1080 정상 빈 상태/실제 500 장애 UI, 전체 타입검사·production build를 통과했다.
    실제 OLAP upstream이 500으로 비가용하여 성공 mutation은 미검증이며 `evidence/olap.md`에 별도 기록했다.
  - 2026-07-22: 독립 WhatIf의 transport/model/UI 책임을 분리하고 17개 응답 런타임 계약, 실제 인과관계
    projection, 안전한 보고서 렌더링을 추가했다. 합성 시나리오·임의 진행률·미반영 편집 성공 경로를 제거했으며
    전체 타입검사·production build·계약·1920×1080 정상/실패 브라우저 검증을 통과했다. 실제 service가 500으로
    비가용하여 성공 mutation은 미검증이며 `evidence/whatif.md`에 기록했다.
- [x] T033 Architect/LangChain, agent scheduler, node scheduler 경계 이동
  - 2026-07-22: Gateway의 LangChain 별칭은 Architect 8001로 향하지만 현재 Architect에는 `/api/react/run`과
    `/api/react/stream`이 없고 Docker Gateway에도 해당 라우트가 없다. 숨김·비임베드 상태이며 소비자도 없던
    LangChain client/store/UI와 전용 formatter를 제거했다. Architect embedded 4개 기능과 project-root/Neo4j
    주입 경계는 보존했고 전체 type-check·구조·계약 parser·production build가 통과했다.
  - 2026-07-22: agent scheduler 클라이언트와 Watch Agent를 실제 scheduler 실행 모델인 `/profiles`
    (`WatchAgentProfile`) 계약으로 전환했다. 프론트 자체 단계 실행·임의 지연·ProcessGPT 직접 실행·하드코딩된
    프로세스 추정·연결되지 않은 `/pipelines` 그래프 모델 사용을 제거했다. 데이터 품질/인시던트/일반 알림은
    확인 가능한 backend 계약이 없어 가짜 운영 데이터를 제거하고 명시적 미연결 상태로 교체했다. 타입·계약·
    구조·production build·1920×1080 정상/실패 브라우저·057/059 보호 회귀가 통과했다. node scheduler와
    Architect/LangChain 최종 감사가 남아 있어 T033 자체는 미완료다.
  - 2026-07-22: node-local scheduler 저장소와 `/agents` REST/SSE 계약을 대조했다. 상태·로그·피드백·제어
    런타임 파서와 세션 헤더, abort 가능한 fetch SSE를 추가하고 온톨로지의 silent failure를 연결 상태로
    교체했다. 성공/503 브라우저 계약과 타입·구조 검사가 통과했으며, central scheduler와 node-local
    scheduler의 저장소 분리는 배포·실행 책임상 타당하다고 판정했다.
- [x] T034 각 domain 실제 service capability와 UI 노출 계약 대조
  - 2026-07-23: What-If의 `/ttm/compare`는 Ontology↔TTM, `/mindsdb/compare`는 Ontology↔MindsDB인
    서로 다른 capability임을 확인했다. TTM 실패 뒤 MindsDB 성공을 별도 출처·경고로 노출하고, 양쪽 결과를
    같은 모델처럼 합치던 정규화를 제거했다. 나머지 domain capability 대조는 계속 진행한다.
  - 2026-07-23: Text2SQL `/meta/datasources`·schema/table·`/meta/objecttypes` 원문을 다시 대조했다.
    ObjectType API는 실제 MindsDB datasource가 필수지만 현재 backend는 이를 필터에 사용하지 않고 응답에
    되돌려준다. Ontology workflow가 UI sentinel을 보내고 실제 값을 버리던 결함을 수정했으며, backend의
    저장 binding/filter 계약 보강 필요는 `evidence/backend-boundary-findings.md`에 별도로 기록했다.

## Phase 5: App, Shared and UI/UX

- [x] T040 app shell에서 feature registry/navigation/session workflow 분리
  - 2026-07-23: backend 요청/테마 runtime store와 app-owned feature navigation을 분리하고 lower layer는
    shared navigation port만 의존하게 했다. 옛 혼합 session store와 import는 0이며 타입·303개 구조 규칙·
    테마 DOM 반영·검색 handoff·21개 기능 데스크톱/모바일 브라우저 회귀가 통과했다.
  - 코드분석 공개 진입점을 upload/graph/schema/navigation으로 좁혀 MainLayout의 배럴 정적 import를 제거했다.
    원격 앱 시작 청크는 6,557,770B에서 2,629,144B로 감소했고, 21개 기능 데스크톱/모바일 회귀와 빌드 경계
    계약이 통과했다. 각 기능과 Cytoscape 런타임은 해당 화면 선택 시에만 로드된다.
- [x] T041 shared의 graph/text2sql 전용 로직을 소유 domain으로 이동
  - 2026-07-23: Text2SQL metadata와 ReAct 요청·스트림·응답 타입 15종을 `domains/text2sql/model/react.ts`로
    이동하고 shared 재유입을 구조 규칙으로 차단했다. Text2SQL 브라우저 계약·323개 구조 규칙·빌드가 통과했다.
    shared의 Analyzer graph 전용 타입·표시 유틸은 보호 중인 057/059 그래프 WIP 소비자와 겹쳐 아직 이동하지 않았다.
  - 2026-07-24: Ontology schema/node/relationship/filter/generation 타입을
    `domains/ontology/model/schema.ts`로 이동하고 domain 내부와 workflow 소비자를 공개 경계로 전환했다.
    shared Ontology 타입 재유입을 구조 규칙으로 차단했다. 보호 중인 Analyzer graph 타입 이동은 남아 있다.
  - Security·OLAP·Observability에서 반복된 destructive alertdialog 수명주기를 backend 지식 없는 shared
    `ActionDialog` primitive로 통합했다. 대상별 message·pending·오류/정확 재시도·Escape·focus trap·trigger
    focus 복귀·선택 checkbox·모바일 action 배치를 한 구현으로 고정하되, action identity와 mutation은 각
    소비자가 계속 소유한다. 옛 Security/OLAP/Observability dialog 파일과 이름은 0이며, 377-source 구조
    검사, Security·OLAP·Watch Agent·Event Detection 실제 브라우저 회귀, type-check, 4,838-module
    production build, 2,674,692-byte lazy remote boundary와 diff 검사가 통과했다.
- [x] T042 모든 거대 store/component를 책임 단위로 분해
  - 2026-07-24 datasource auto-link progress/stats/mapping/candidate presentation과 scoped
    dark/light/mobile style을 `OntologyDatasourceMappingDialog.vue`로 이동했다. SSE/abort와
    single/bulk confirmation/canvas commit은 기존 composable/viewer에 유지하고 nested bulk dialog
    동안 focus ownership을 suspend한다. 부모는 4,485줄에서 4,212줄, parent SCSS는 6,387줄에서
    5,662줄로 축소됐다. 447-source 구조, type, 전체 Ontology browser의 auto-link failure/exact retry/
    keyboard disclosure/preview/single·bulk partial retry/mobile, production build와 2,759,761-byte
    lazy boundary가 통과했다. 근거: `evidence/ontology-datasource-auto-link-presentation.md`.
  - [x] Node-data ECharts host/instance/render/dispose/resize와 causal brush event bridge를
    `useOntologyNodeDataChart.ts`로 분리한다. viewer의 API/Cytoscape/analysis request 책임과
    chart UI의 presentation 책임을 섞지 않고 host 교체·table/empty·theme·unmount cleanup,
    delayed render와 brush restore/select를 구조·type·전체 Ontology browser·실물·build·lazy
    boundary로 검증한다.
    dependency-injected fake chart/scheduler 계약으로 render·brush·resize·theme rerender·table/
    scope cleanup을 검증했다. 부모는 ECharts import/instance/watch를 제거해 4,631줄에서 4,485줄로
    축소됐다. 446-source 구조, type, 전체 Ontology browser, 실제 chart/causal lifecycle,
    production build와 2,759,761-byte lazy boundary가 통과했다.
    근거: `evidence/ontology-node-data-chart-runtime.md`.
  - [x] Node filter form을 `OntologyNodeFilterDialog.vue`, local relationship draft form을
    `OntologyNewRelationDialog.vue`로 분리한다. 부모의 propagation/data reload와 graph
    history/Cytoscape commit을 유지하고 controlled draft intent, modal focus lifecycle,
    unsupported 계약 안내와 geometry를 구조·type·전체 Ontology browser·실물·build·lazy
    boundary로 검증한다.
    두 자식은 API/Cytoscape를 import하지 않고 update/retry/clear/confirm/cancel intent와 공용
    focus lifecycle만 소유한다. 부모는 4,783줄에서 4,631줄로 축소됐다. 전체 browser에서
    filter cancel/distinct retry/single reload/clear와 relationship cancel/commit/undo/redo가
    통과했고 1920×1080·390×844 실물을 직접 확인했다. 445-source 구조 검사, type-check,
    production build 및 2,759,761-byte lazy remote boundary가 통과했다.
    근거: `evidence/ontology-filter-relation-dialog-presentation.md`.
  - [x] 분리된 Ontology dialog의 authoritative style만 남도록
    `MultiLayerOntologyViewer.scss`의 filter/new-relation stale selector를 제거하고 component별
    style ownership을 구조 검사로 고정한다.
    dark/light/mobile 규칙을 각 scoped component로 이동하고 부모의 미사용 filter bar/cascading/
    relation draft selector를 제거했다. parent SCSS는 6,387줄이며 해당 selector 0건을 구조 계약으로
    고정했다. type, 전체 Ontology browser, production build와 lazy boundary가 재통과했다.
  - [x] Node Data chart host/controls/config를 `OntologyNodeDataChart.vue`, raw table을
    `OntologyNodeDataTable.vue`로 분리한다. 부모의 ECharts init/dispose·brush extraction·causal
    lifecycle을 유지하고 host mount/unmount, config reveal, formatting/50-row boundary를
    구조·type·전체 Ontology browser·실물·build·lazy boundary로 검증한다.
    부모는 4,783줄로 축소됐고 chart child는 presentation·host lifecycle event·config reveal,
    table child는 기존 Korean number/date formatting·column type mark·first-50 boundary만
    소유한다. 443-source 구조 검사, type-check, 전체 Ontology browser와 실물 screenshot,
    production build 및 2,759,761-byte lazy remote boundary가 통과했다.
    근거: `evidence/ontology-node-data-chart-table-presentation.md`.
  - [x] Node Analysis 결과/empty/Causal composition, Data loading/empty actions와 source/business-day
    summary를 `OntologyNodeAnalysisPanel.vue`, `OntologyNodeDataState.vue`,
    `OntologyNodeDataSummary.vue`로 분리한다. API/ECharts/brush/causal lifecycle은 부모에 유지하고
    구조·type·전체 Ontology browser·build·lazy boundary로 검증한다.
    controlled metric/business-day event 뒤 부모가 기존 recalc/reload를 수행하며 fallback capability와
    action availability를 보존했다. 441-source 구조, type, 전체 Ontology browser, 직접 분석 결과 화면,
    production build와 2,759,761-byte lazy boundary가 통과했다.
    근거: `evidence/ontology-node-analysis-data-state-presentation.md`.
  - [x] Node detail Behavior loading/error/editor composition과 BPMN viewer/empty presentation을
    `OntologyNodeBehaviorPanel.vue`, `OntologyNodeBpmnPanel.vue`로 분리한다. 부모의 abort/retry target,
    schema/node selection·XML mutation을 유지하고 구조·type·전체 Ontology browser·build·lazy
    boundary로 검증한다.
    공유 model shape는 `nodeBehaviorPresentation.ts`로 단일화했다. 구현 중 잘못된 BPMN 상대 import가
    type-check에는 잡히지 않고 Vite lazy import를 끊는 것을 browser/build로 발견해 domain public
    entry import로 교정했다. 438-source 구조, type, 전체 Ontology browser, production build와
    2,759,761-byte lazy boundary가 통과했다.
    근거: `evidence/ontology-node-behavior-bpmn-presentation.md`.
  - [x] MultiLayer Ontology node detail의 header/tab controls를
    `ui/canvas/OntologyNodeDetailHeader.vue`, info presentation을
    `ui/canvas/OntologyNodeInfo.vue`로 분리한다. 부모의 data/analysis/Behavior/BPMN orchestration,
    rename/layer history·Cytoscape mutation과 datasource/relation lifecycle을 유지하고 tab semantics,
    controlled name focus/save/cancel, layer/filter/datasource/relationship 결과를 구조·Ontology
    browser·desktop/mobile·type·build·lazy boundary로 검증한다.
    부모는 tab intent를 기존 data/analysis/Behavior/BPMN lifecycle로 dispatch하고 info용 filter/
    relationship을 이름이 해석된 projection으로 제공한다. 자식은 roving tabindex와 좌우/Home/End
    keyboard, 이름 input focus/select 및 presentation event만 소유한다. 435-source 구조 검사,
    type-check, 전체 Ontology browser와 직접 desktop/mobile 화면 검사, production build,
    2,759,761-byte lazy remote boundary가 통과했다.
    근거: `evidence/ontology-node-detail-presentation.md`.
  - [x] MultiLayer Ontology의 relation detail preview·속성 form·source/target column 상태와
    retry/error/action presentation을 `ui/canvas/OntologyRelationDetail.vue`로 분리한다. 부모의
    abort/stale load·validation·history·graph commit을 유지하고 controlled field update/save timing,
    datasource 연결·retry·delete·close 결과를 구조·Ontology browser·type·build·lazy boundary로
    검증한다.
    반복되는 endpoint column 상태는 `RelationColumnField.vue`로 제한하고 API를 허용하지 않았다.
    예전 `delete-node-btn` CSS 이름에 결합된 browser selector는 사용자 의미인 relation delete title로
    교정했다. 433-source 구조 검사, type-check, 관계 edit/save·column failure/retry·datasource·
    delete/undo·390×844 geometry를 포함한 전체 Ontology browser 회귀, 직접 screenshot 검사,
    production build와 2,759,761-byte lazy remote boundary가 통과했다.
    근거: `evidence/ontology-relation-detail-presentation.md`.
  - [x] MultiLayer Ontology의 layer panel header/toggle·layer disclosure·node action list를
    `ui/canvas/OntologyLayerPanel.vue`로 분리한다. 부모의 pending relation·selection/detail·
    context coordinate·Cytoscape 책임을 유지하고 기존 순서/count/ARIA/keyboard, dark/light,
    collapsed/mobile geometry를 구조·Ontology browser·type·build·lazy boundary로 검증한다.
    부모는 canonical layer/node를 presentation group으로 투영하고 실제 selection·context target만
    해석하며, 자식은 panel/layer disclosure와 native button event만 소유한다. collapse 후 Cytoscape
    canvas resize 완료를 실제 geometry로 기다려 임의 sleep 없이 검증했다. 431-source 구조 검사,
    type-check, layer collapse/reopen·ARIA·desktop geometry를 포함한 전체 Ontology browser 회귀,
    production build와 2,759,761-byte lazy remote boundary가 통과했다.
    근거: `evidence/ontology-layer-panel-presentation.md`.
  - [x] MultiLayer Ontology의 관계 생성 대기 banner·연결 모드 toolbar·graph legend를
    `ui/canvas/OntologyGraphOverlay.vue`로 분리한다. 부모의 source identity·edgehandles·
    Cytoscape·relation draft 책임을 유지하고 pressed/status/group semantics, dark/light/mobile
    skin과 기존 cancel/toggle 결과를 구조·Ontology browser·type·build·lazy boundary로 검증한다.
    overlay는 presentation/event만 소유한다. 모바일 full-width detail이 관계 target을 가리던 결함은
    대기 진입 시 기존 detail selection을 snapshot+deselect하고 종료 시 복원해 교정했다. layer-list
    target 경로는 유지하면서 banner를 mobile layer overlay 위에 표시한다. 430-source 구조 검사,
    연결 모드 pressed 왕복·취소/selection 복원·관계 생성 결과·desktop/mobile geometry를 포함한 전체
    Ontology browser 회귀, type-check 포함 4,894-module production build와 2,759,761-byte lazy
    remote boundary가 통과했다. 근거: `evidence/ontology-graph-overlay-presentation.md`.
  - [x] MultiLayer Ontology의 canvas·node·relationship context menu markup/skin을
    `ui/canvas/OntologyGraphContextMenu.vue`로 분리한다. 부모의 좌표·Cytoscape·graph
    mutation/history 책임과 기존 menu/menuitem·문구·action 결과를 유지하고 구조·Ontology
    browser·type·build·lazy boundary로 검증한다.
    세 menu의 native action과 dark/light skin을 presentation-only 경계로 이동했다. 실물 캡처에서
    canvas 하단 메뉴가 viewport 밖으로 잘리던 결함을 발견해 실제 menu 크기와 offset parent 기준
    양축 clamp로 교정했다. 429-source 구조 검사, type-check, 전체 Ontology browser 회귀,
    4,891-module production build와 2,759,761-byte lazy remote boundary가 통과했다.
    근거: `evidence/ontology-graph-context-menu-presentation.md`.
  - [x] MultiLayer Ontology canvas의 arbitrary timer wrapper를 generation 기반 latest-task scope로
    교체한다. init retry·selection restore·edgehandles zoom restore·schema loading settle을 named key로
    분리하고 detail panel open/close/resize 뒤 viewport sync, schema commit/destroy/unmount, stale
    layoutstop과 canvas identity를 unit·architecture·rapid schema browser로 검증한다.
    type-check·build·lazy boundary는 배치 끝에 한 번 실행한다.
  - [x] Agents.md authoring을 `workflows/ontology`로 이동하고 API runtime parser, read/rewrite abort·
    late-response rejection, 원본/draft와 enabled-only 저장, 작업별 mutation 상태·exact retry,
    context/ProcessGPT 부분 실패, 삭제·dirty reset alertdialog, managed timer, 보조 node metadata
    갱신 중 editor 비재마운트와 지연 선택 복원의 사용자 탭 비침범, draft/dialog/focus 보존,
    desktop/mobile 실제 브라우저 회귀로 닫았다. unit contract, 395-source 구조 검사, type-check,
    기존 Ontology 46개 브라우저 회귀, 전용 desktop/mobile 브라우저 계약, 4,855-module production
    build가 통과했다.
  - [x] MultiLayer Ontology 390×844 shell의 세로 글자·화면 밖 panel을 two-column header action grid,
    overlay layer panel, full-width detail와 labeled close, mobile resize separator 제거, zoom-preserving
    Cytoscape recenter로 교정했다. 전용 mobile 조작·geometry와 직접 screenshot 검사, 기존 desktop
    Ontology 46개 회귀, 395-source 구조 검사, 4,855-module build가 통과했다.
  - [x] Ontology What-If model manager의 runtime model/delete 계약, safe metrics projection,
    schema-aware abort/stale rejection, 이전 목록 보존 refresh, 단건·전체 삭제 ActionDialog와
    partial failure의 실패 target-only retry, keyboard/mobile UI를 unit·브라우저·타입·구조·빌드로 닫는다.
    실제 `robo-insight-domain-layer` commit `11de767`의 model-status/list/delete response를 대조해
    schema/model identity와 count까지 검증했다. 모델 관리 UI의 raw API/native dialog/template JSON parse를
    제거하고, refresh 목록 보존, schema 전환 abort, 부분 삭제의 failed-only retry를 application lifecycle로
    이동했다. 390×844 캡처에서 추가 발견한 What-If 단계 label 세로 압축과 active 단계 숨김도 내부 scroll
    strip+disposed ResizeObserver로 교정했다. 전용 unit/browser, 397-source 구조 검사, 전체 type-check,
    기존 Ontology 46개와 Agents.md 브라우저 회귀, 4,857-module production build, remote boundary 검사가
    통과했다.
  - [x] Ontology What-If simulation의 snapshot/simulate/profile runtime 계약, schema/filter/date abort와
    stale rejection, 마지막 정상 snapshot 보존, simulation/profile frozen exact retry, operation별 오류,
    dead animation timer 제거, managed success 정리와 390×844 chart/form/table UI를 unit·브라우저·
    타입·구조·빌드로 닫았다. 실패 target을 일반 변수로 두면 이미 평가된 retry computed가 갱신되지 않는
    결함도 실제 브라우저에서 발견해 reactive target으로 교정했다. 전용 parser/lifecycle unit과
    503→동일 payload 재시도 브라우저, 기존 Ontology 46개 회귀, 399-source 구조 검사, 전체 type-check,
    4,859-module production build와 remote boundary가 통과했다.
  - [x] Ontology Behavior editor의 create/edit draft, 타입별 payload·AI prompt·외부 test projection,
    create/update/delete/generate runtime 계약과 AbortSignal, operation별 abort/stale/exact retry,
    ActionDialog 삭제, keyboard/focus/Escape와 390×844 body-scroll/form/action UI를 unit·브라우저·
    타입·구조·빌드로 닫았다. 실제 domain-layer create/update/delete/generate 응답과 기존 ProcessGPT
    Behavior를 함께 검증하고, 외부 endpoint에 ROBO header가 전달되지 않음을 브라우저에서 확인했다.
    전용 unit/browser, Agents.md unit/browser, 기존 Ontology 46개 회귀, 401-source 구조 검사, type-check,
    4,861-module production build와 2,724,088-byte remote boundary가 통과했다.
  - [x] MultiLayer Ontology local graph history의 deep snapshot, 50개 제한, branch mutation redo 폐기,
    schema 전환 clear, restore-render 단일 동기화와 form/contenteditable native undo를 보존하는
    Ctrl/Cmd+Z/Y shortcut을 pure model+composable로 분리했다. reactive proxy를 `structuredClone`할 때
    실제 삭제가 중단되는 문제를 브라우저에서 발견해 plain graph deep clone policy로 교정했다. 전용 unit,
    기존 Ontology 46개 undo/redo/native-input browser 회귀, 403-source 구조 검사, type-check,
    4,863-module build와 2,724,088-byte remote boundary가 통과했다.
  - [x] MultiLayer Ontology local graph mutation을 기존 삭제 model에 통합했다. node 생성·rename·layer/
    position 변경과 relation draft·confirm/cancel·편집은 입력을 바꾸지 않는 순수 정책을 사용하고,
    edgehandles와 context-menu는 같은 draft 진입점과 commit 수명주기를 사용한다. 취소는 graph/history
    무변경, 실제 confirm/edit만 단 한 번 checkpoint/Cytoscape 동기화하며 no-op은 둘 다 만들지 않는다.
    단위 계약, 403-source 구조 검사, type-check, 기존 46개 Ontology 브라우저 회귀와 실제
    create/rename/layer/relation cancel·confirm·undo/redo 조작, 4,863-module production build,
    2,724,088-byte remote boundary가 통과했고 `ontology-local-graph-mutation-1920x1080.png`를 직접
    검사했다.
  - [x] MultiLayer Ontology document generation의 input/PDF/용어집 read/generation stream 수명주기를
    application+composable로 분리했다. 용어집 실패는 기존 목록을 보존한 visible retry이며, input type별
    body와 PDF content/glossary IDs는 request target으로 고정된다. 새 실행·취소·mode 전환·unmount의
    abort/stale rejection, frozen exact retry와 별도 input edit, strict terminal error를 계약화했다.
    전용 unit, 405-source 구조 검사, type-check, 기존 Ontology 47개 브라우저 회귀와 glossary 503→retry,
    generation 503→동일 body/header retry→graph 단일 commit→별도 Neo4j save, 4,865-module build,
    2,724,088-byte remote boundary가 통과했다. 실패/성공 1920×1080 화면도 직접 검사했다.
  - [x] OLAP Pivot ETL script의 agent/template 생성, 저장본 조회, frozen 저장 exact retry, 다운로드용
    생성, 실행 stream/cancel을 cube identity·request sequence·operation별 상태를 가진 domain lifecycle로
    분리한다. UI의 script API/stream handle 직접 소유를 제거하고 unit·구조·타입·브라우저·빌드 증거로
    닫았다. 취소 뒤 late terminal 폐기, 저장 `success:false` 동일 body/header retry, 조회 실패의 마지막
    script 보존, scope dispose를 계약화했다. 390×844 실물에서 발견한 code action/execution log 겹침도
    natural flow와 3열 action grid로 교정했다. 전용 unit, 407-source 구조 검사, 전체 type-check, 기존
    OLAP lifecycle/UI 브라우저 회귀, 4,867-module production build와 2,724,088-byte remote boundary가
    통과했다. 실제 OLAP upstream의 HTTP 500은 성공한 live mutation으로 과장하지 않고 T052에 남겼다.
  - [x] Schema Modeling Catalog discovery의 테이블 목록·semantic search·canonical column cache/error/
    request identity를 application+composable로 분리한다. Text2SQL 표시 타입 의존과 store의 세 read API
    직접 호출을 제거하고 abort/stale rejection·이전 결과 보존·동일 query retry·column in-flight dedupe를
    unit·구조·타입·브라우저·빌드 증거로 닫았다. `schemaCanvas.ts`는 1,726줄에서 1,521줄로 줄었고,
    전용 unit 2종, 409-source 구조 검사, 전체 type-check, 신규 discovery lifecycle 및 기존 relationship
    브라우저 회귀, 4,869-module production build와 2,728,636-byte remote boundary가 통과했다. 실제
    Catalog 데이터 정합성은 upstream이 준비되지 않아 fixture 성공으로 과장하지 않고 T052에 유지한다.
  - Data Lineage의 Catalog+OLAP projection·dedupe·부분 실패·request sequence를 workflow application으로
    이동하고 Catalog 응답 runtime parser를 추가했다. ETL DAG 재배포는 명시적 `cube_name`을 dialog open
    시점에 고정하며 native confirm·node-name 추정·raw success/viewport timer를 제거했다. 503→`success:false`
    →동일 cube/header/force exact retry→성공, `cube_name` 없는 action 비활성, Airflow URL commit,
    390×844 header·2×2 stats·detail/dialog geometry를 실제 브라우저로 검증했다. lineage unit, 전체
    type-check, 379-source 구조 검사, 기존 1920×1080 부분 실패 회귀, 4,840-module production build,
    2,674,692-byte lazy remote boundary와 diff 검사가 통과했다.
  - 2026-07-23: schemaCanvas의 관계 identity/병합/edge projection을 순수 model로 분리했다. DDL·code
    provenance 유실과 `_id` 추정 fallback을 제거하고 타입·계약·1920×1080 정상/503 브라우저 검증을
    통과했다. 이어 테이블/ObjectType SQL 계획과 Data Fabric 실행 정규화를 application 모듈로 분리하고
    요청·Limit 재조회·응답 투영·503 오류 계약을 브라우저에서 고정했다. store의 나머지 panel/live-update/layout
    책임 중 소스 패널·Statement 재시도·실시간 highlight 수명주기를 분리하고, SchemaCanvas의 공통 타이머와
    Behavior 행 실행도 composable로 이동했다. 관계 handle 파싱과 Catalog/Ontology 편집 경계를 분리해
    서로 다른 두 backend에 중복 삭제하던 결함도 제거했다. TableNode의 Catalog 참조·Analyzer 소스 조회·팝업
    위치·요청 경합을 `useTableReferences`로 분리하고 실제 참조 버튼부터 소스 패널까지 브라우저로 고정했다.
    온톨로지 생성 단계·가중치·진행률·완료/실패 전이도 별도 composable로 분리하고 계약화했으며 중복 타이머
    관리자도 공용 생명주기로 통합했다. ObjectType 목록 실패를 빈 목록으로 위장하던 경로를 오류·재시도
    상태로 분리하고 생성 후 지연 다이얼로그도 공용 생명주기에 편입했다. Text2SQL 결과와 Ontology 패널의
    SQL 기반 인스턴스 생성도 application 경계 하나로 통합하고 MV 부분 실패·bulk 필수 실패를 분리했으며,
    실제 히스토리 선택부터 요청 본문·사용자 경고까지 브라우저로 고정했다. 숨겨진 `ontology` feature-id의
    실제 VueFlow 노드 클릭 경로도 검증해 미등록 `EntityQueryPanel` 배선을 복구했고, 인스턴스 카드 폭·간격·
    부모 중심·20개 제한을 순수 canvas layout 모델로 분리했다. 나머지 layout interaction 책임 분리는 계속
    진행한다.
  - What-If의 모델 비교 순서·출처·부분 실패를 `application/compareModels.ts`로 분리했다. TTM 결과를
    MindsDB 지표로 복제하던 결함과 죽은 R² 차트·지연 타이머를 제거하고, 정상 TTM·MindsDB fallback·양쪽
    실패 계약 및 실제 버튼 클릭 회귀를 통과했다.
  - WhatIfSimulator 내부의 저장 타입·JSON 파싱·upsert·10개 제한·storage 오류를
    `model/session.ts`와 `application/sessionRepository.ts`로 분리했다. 비교/설명 자동 저장 누락과
    세션 전환 시 이전 결과 잔류를 수정하고 손상·부분 손상·저장 실패 계약 및 새로고침/전환 회귀를 통과했다.
  - `MultiLayerOntologyViewer`의 저장 온톨로지 필터·최근 순서·날짜 정렬·노드 수 기본값을
    `domains/ontology/model/schemaLibrary.ts`의 순수 projection으로 분리했다. 목록 조회 실패를 성공한
    빈 목록으로 위장하던 경로를 오류·재시도로 교체하고, 기존 목록 유지와 schema 데이터 없는 항목 제외를
    각각 별도 상태로 표시한다. 정상·손상·중복 최근 ID·잘못된 날짜·입력 비변형 계약과 503→재시도
    브라우저 회귀가 통과했으며 거대 viewer의 나머지 책임 분리는 계속 진행한다.
  - 같은 viewer의 Text2SQL datasource→schema→table/ObjectType 로딩·projection·오류·재시도·요청 경합을
    `useNodeDataSourceCatalog`로 분리했다. 검색 datasource·수동 source kind·ObjectType 실행 datasource의
    혼합을 제거하고 실제 datasource를 메타데이터 요청과 확정 payload에 보존했다. 실패→재시도, 단일
    datasource, 물리/ObjectType projection, 늦은 응답, sentinel 비전송 계약과 브라우저 흐름이 통과했다.
  - 저장 온톨로지 rename/delete/activate/detail을 Ontology domain의 `useOntologySchemaLifecycle`로
    분리하고 schema PATCH도 object-explorer client에서 schema CRUD client로 옮겼다. Enter/blur 중복,
    실패 입력 유실, 삭제 중복, detail 실패 전 최근 기록, activate 부분 성공 뒤 mutation 반복을 제거했다.
    활성화→상세→화면 적용→최근 기록 순서와 실패/부분 실패/재시도를 계약화했으며 전체 타입·343-source
    구조 검사와 실제 키보드 load→rename→delete 브라우저 흐름이 통과했다. 거대 viewer의 나머지 책임은
    계속 분리한다.
  - extraction `SchemaSelector`도 같은 domain lifecycle을 재사용하도록 바꿨다. 목록 조회 상태만 별도로
    소유하고 activate/detail/delete 순서와 부분 성공은 더 이상 UI에서 중복 조립하지 않는다. 목록 실패를
    빈 목록으로 위장하던 경로, detail 실패 뒤 activate 반복, 삭제 후 active 판정 유실, 제거된 retry
    버튼을 외부 클릭으로 오인하던 경로를 제거했다. 타입·domain contract·343-source 구조·브라우저·
    4,779-module production build가 모두 통과했다.
  - extraction 시작 Wizard와 Selector의 목록 query를 `useOntologySchemaLibrary`로 통합했다. API 응답은
    runtime parser를 거치고, query는 상세 본문 없는 항목 제외·이전 목록/active ID 보존·동시 refresh
    차단을 소유한다. Wizard 선택도 같은 activate→detail lifecycle을 사용해 성공 뒤에만 store/binding을
    커밋하며 dead emit과 OntologyTab debug 잔재를 제거했다. 타입·domain contract·344-source 구조·
    브라우저·4,780-module production build가 통과했다.
  - 부모가 binding 전환 즉시 Wizard를 unmount한다는 실제 렌더 조건을 확인하고, 절대 도달하지 않던 Step 3
    template과 `console.log`/browser confirm만 있던 자동 검색·모니터링 placeholder를 제거했다. 실제
    datasource binding 책임은 기존 canvas/InstancePanel에 유지했다. 재유입 차단 구조 계약과 binding 뒤
    canvas 노출 브라우저 계약, 타입 검사, 4,780-module build가 통과했다.
  - `InstancePanel`의 실제 datasource catalog→bind→instance 조회→unbind 흐름을 domain 계약으로 정리했다.
    catalog 실패와 빈 목록, instance 실패와 빈 결과를 분리하고, 같은 이름의 schema별 table identity와
    선택 limit를 요청에 보존했다. PUT/DELETE 실패 때 로컬 성공 상태를 만들지 않으며 늦은 instance 응답도
    최신 결과를 덮지 않는다. runtime/domain 계약, 345-source 구조 검사, 전체 타입 검사, 실제 키보드 선택과
    네 종류 503→재시도 브라우저 흐름, 육안 검사, 4,781-module production build가 통과했다.
  - 같은 `InstancePanel`에 섞여 있던 Text2SQL·Data Fabric·Object Explorer 교차-domain 질의/인스턴스
    생성 책임을 `workflows/ontology/ui`로 이동했다. domain panel은 slot과 명시적 open event만 제공하고,
    workflow가 `EntityQueryPanel`과 `SqlInstanceExplorerModal`을 조립한다. 기존 위치·query·datasource·
    MV 부분 실패·bulk payload·canvas 결과를 보존하면서 1,500줄 panel을 1,013줄로 축소했다. 타입·
    346-source 구조·Entity query 회귀와 AI 모달 자동 검색→채택→취소→부분 성공→Escape 브라우저 흐름,
    육안 검사, 4,784-module production build가 통과했다.
  - DB schema 기반 생성기를 Text2SQL metadata와 Ontology generation을 조립하는 workflow로 이동하고
    domain re-export shim을 남기지 않았다. datasource/schema 실패·빈 결과·재시도·늦은 응답을 분리하고,
    schema가 없는 `success: true` 응답은 store를 갱신하지 않도록 runtime 계약을 고정했다. Schema와
    문서 생성 action footer 중복도 제거했다. 전체 타입·domain parser·346-source 구조·키보드
    실패→재시도→성공 브라우저 계약과 4,784-module production build가 통과했다.
  - ObjectType 생성 dialog를 Text2SQL·Data Fabric·Ontology를 조립하는 workflow로 이동하고 domain
    re-export shim을 제거했다. 요청 builder와 순차 관계 생성 application을 분리해 본체 성공/관계 실패를
    별도 상태로 유지하고 본체를 반복하지 않은 채 실패 관계만 재시도한다. ObjectType 목록·AI 이름 응답의
    runtime parser와 manual/query payload 계약, 부분 실패·재시도 계약을 추가했다. 전체 타입·domain
    parser·347-source 구조·실제 키보드 생성/503→재시도 브라우저 흐름과 4,785-module build가 통과했다.
  - ObjectType 직접 SQL의 datasource 감지·우선순위와 스트림 row/column 수집을 workflow application으로
    분리하고 정상·오류·빈 결과 계약을 추가했다. 이어 Data Fabric store의 목록/table/mutation
    `loading/error`를 작업별 상태로 분리해 Text2SQL table 실패가 datasource 목록 실패로 새는 결함을
    제거했다. 이전 목록 보존·table 선택 경합·상태 비오염 계약과 ObjectType/Data Fabric 브라우저 회귀가
    통과했으며 혼합 상태 재유입은 348-source 구조 검사로 차단했다. 최종 4,786-module build도 통과했다.
  - Parser→Analyzer upload UI를 workflow 소유로 옮기고 트리 파일 수집·source metadata lookup을 Parser
    application의 결정론 정책으로 분리했다. Data Fabric 생성 action도 성공한 실제 datasource를 반환해
    UI의 이름 재탐색·불필요한 목록 재조회를 제거했다. fallback/`any`/timer/native dialog 재유입은
    349-source 구조 검사와 전용 계약으로 차단했으며 production build가 통과했다.
  - 1,685줄 `DataSourceManager`에서 connector 표현 정책, 등록 dialog, datasource card, table 상세,
    삭제 확인, 관리 shell을 실제 책임으로 분리했다. 검색/그룹화·기본값·연결시험 payload는 순수 application
    정책과 계약으로 이동했다. shell은 100줄 미만 script의 조립 책임만 남기고 공개 API·mode별 select를
    보존했으며 Data Fabric 금지 패턴 0, 355-source 구조 검사, 4,801-module build가 통과했다.
  - 1,658줄 Catalog `TermBulkUploadModal`에서 mapping/request/후보 편집·정렬/200건 preview 영속화와
    손상·구버전 session 복원 판정을 순수 application 계약으로 분리했다. 파일 선택, 매핑·추출 설정,
    미리보기·결과를 세 단계 컴포넌트로 분리하고 shell template은 144줄의 workflow 조립만 남겼다.
    upload/extract/import/rollback 응답은 runtime parser를 통과하며 JSON 단언, 후보 `any`, native confirm
    세 곳, raw phase timer는 모두 제거했다.
  - Catalog 일반 용어 action은 실패 종류를 glossary list/term list/선택 detail/편집 detail로 분리해
    “다시 시도”가 원래 요청만 반복하도록 했다. 용어집·용어 삭제는 공용 `GlossaryActionDialog`가
    대상/pending/error를 소유하며 mutation 성공 전에는 목록을 바꾸지 않는다. 일반 glossary/term
    목록·상세도 runtime parser를 통과해 잘못된 id/name/status를 빈 값이나 가짜 Draft로 투영하지 않는다.
  - Catalog 영업일 캘린더의 42-cell projection, 주말·공휴일·수동 휴일 통계, reason 보존 save payload,
    고정일 공휴일 병합을 순수 application 정책으로 분리했다. 연도별 request sequence로 늦은 응답을
    폐기하고 load/save retry identity, save 성공·refresh 실패 분리, 중복 날짜 교체를 명시했다.
  - Glossary/Term 편집 modal에 dialog/busy/Escape/명시적 name focus를 추가했다. Term metadata는
    `Promise.allSettled`로 domain/owner/tag 성공 결과를 각각 유지하고 일부 실패를 console이 아닌
    visible status와 retry로 노출한다. 세 metadata 응답도 runtime parser를 통과한다.
  - [x] Schema Modeling Catalog 계약·mutation 수명주기: schema API runtime parser와 session/
    `X-API-Key` header를 정렬하고 datasource+schema+name identity, 비추론 column 조회, 작업별
    description/relationship pending·error·exact retry, 관계 삭제·캔버스 비우기 공용 ActionDialog,
    managed debounce/highlight timer, 390×844 detail/form/dialog를 unit·브라우저·타입·구조·빌드
    증거로 닫는다.
  - [x] MultiLayer Ontology graph 편집·mutation 수명주기: local node/relationship delete target과
    immutable graph 정책, 공용 ActionDialog, field mapping inline 오류, Measure→ObjectType exact retry,
    Neo4j save status를 unit·브라우저·타입·구조·빌드 증거로 닫는다.
    미확인 ObjectType 컬럼을 빈 schema로 추론해 기존 field mapping을 삭제하던 경로도 verified-column
    reconciliation 정책으로 분리했으며, sparse graph 자동 fit 확대 상한과 1920×1080·390×844
    clipping/overflow 증거를 추가했다.
  - [x] MultiLayer Ontology relation editor의 target/draft, endpoint별 column state, abort/stale rejection,
    mapping 보존·검증, retry, 순수 graph commit을 application+composable로 분리한다. Viewer의 분산 ref와
    직접 node-data 조회를 제거하고 unit·구조·타입·desktop/mobile 브라우저·빌드 증거로 닫는다.
    `relationEditorLifecycle.ts`와 `useOntologyRelationEditor.ts`가 id/composite target, endpoint 상태,
    AbortController/request sequence, exact retry, paired mapping validation, immutable no-op/commit을
    소유한다. A→B 전환 late response, close/scope abort, transient/no-datasource draft 보존, verified
    missing-field 제거, inline schema 무요청을 전용 계약으로 고정했다. datasource 확정의 미조회
    `columns: []` 오인도 `projectConfirmedDatasourceSchema`로 제거했다. Viewer는 6,995줄에서
    6,796줄로 줄었고, 411-source 구조 검사, type-check, 기존 graph/node-data 계약, 46-flow Ontology
    브라우저 회귀, 1920×1080·390×844 육안/geometry, 4,871-module production build와
    2,728,636-byte remote boundary가 통과했다.
  - [x] MultiLayer Ontology node datasource discovery의 dialog target, search/manual draft, provenance
    candidate, bounded probe, sample preview, abort/stale rejection, exact confirm retry를
    application+composable로 분리한다. Viewer의 직접 Text2SQL/Ontology discovery 호출과 후보 in-place
    mutation을 제거했다. Viewer는 6,436줄로 줄었고, 413-source 구조 검사, 타입/응답 파서/관계 편집
    회귀, 실제 Playwright 검색·probe 부분 실패·sample 실패/동일 요청 재시도·확정 실패/동일 payload
    재시도, 1920×1080·390×844 육안/geometry, 4,873-module production build와
    2,728,725-byte remote boundary 증거로 닫았다.
  - [x] MultiLayer Ontology library workspace의 목록/rename draft/delete target/activate-detail load/
    화면 적용 exact retry/recent history commit을 composable로 이동한다. Viewer direct schema library
    API와 mutable entry update를 제거했다. Viewer는 6,231줄로 줄었고, 415-source 구조 검사,
    workspace/history 계약, 타입, 기존 Playwright list/rename/delete/activate/detail/save 전체 회귀,
    4,875-module production build와 2,728,725-byte remote boundary 증거로 닫았다.
  - [x] MultiLayer Ontology datasource mapping workspace의 auto-link stream/progress/mapping, candidate
    expansion, 단건 transport·application retry, bulk frozen target·부분 성공·실패-only retry를
    application+composable로 분리한다. Viewer direct auto-link/confirm API와 mapping in-place mutation을
    제거하고 abort/stale/terminal/empty·API 비반복 local retry를 unit·구조·타입·기존 desktop/mobile
    브라우저·production build 증거로 닫는다. Viewer는 6,093줄로 줄었고 417-source 구조 검사,
    전체 Ontology unit, 47-flow Playwright, 4,877-module build와 2,731,729-byte remote boundary가
    통과했다.
  - [x] MultiLayer Ontology document/database/library schema→canvas projection의 node/relationship
    정규화, deterministic relation sanitation, identity/name/summary를 단일 application 정책으로
    통합한다. Viewer의 source별 map/sanitizer 중복을 제거하고 id 없는 generation의 이전 schema 덮어쓰기
    위험과 id 있는 DB generation의 후속 기능 비활성화를 unit·구조·타입·Playwright 저장 payload·
    production build 증거로 닫는다. 비지원 DB `Entity` label도 `Resource`로 정규화해 layer count와
    canvas를 일치시켰다. Viewer는 5,953줄로 줄었고 418-source 구조 검사, 전체 Ontology unit,
    47-flow Playwright, 4,878-module build와 2,731,729-byte remote boundary가 통과했다.
  - [x] MultiLayer Ontology Cytoscape presentation 규칙을 순수 canvas-style model로 이동했다.
    light/dark node·edge base, relationship type, edgehandles, agent, causal, filter selector/style의
    값과 43-selector 순서를 그대로 보존하고 Viewer의 style literal을 제거했다. Viewer는 5,567줄로
    줄었고 theme/selector/호출 간 객체 독립성 unit, 전체 16개 Ontology 계약, 419-source 구조 검사,
    타입 검사, 기존 47-flow Playwright canvas 회귀, 실물 캡처 검토, 4,879-module production build와
    2,731,729-byte remote boundary 증거로 닫았다.
  - [x] MultiLayer Ontology canonical layer catalog와 graph element projection을 순수 model로
    이동했다. node position·color와 relationship direction/inverse/weight 계약을 보존하고 일부/비유한
    position은 preset으로 오인하지 않도록 수정했다. Viewer의 중복 hierarchy/inversion/element loop를
    제거해 5,389줄로 줄였고, direction·position unit, 전체 17개 Ontology 계약, 420-source 구조 검사,
    타입 검사, 기존 47-flow Playwright, 실물 캡처 검토, 4,880-module production build와
    2,731,729-byte remote boundary 증거로 닫았다.
  - [x] MultiLayer Ontology hierarchical layout의 topology/depth/layer/Driver 위치 계산을 순수
    model로 이동했다. Viewer에는 Cytoscape snapshot·position apply·fit만 남겼고 exact coordinate,
    cycle·missing endpoint·disconnected/driver-only·unknown layer·empty graph·reserved id를 검증했다.
    Viewer는 5,115줄로 줄었고 전체 18개 Ontology 계약, 421-source 구조 검사, 타입 검사, 기존 47-flow
    Playwright, 실물 캡처 검토, 4,881-module production build와 2,731,729-byte remote boundary
    증거로 닫았다.
  - [x] Schema Modeling canvas drag intake를 runtime parser와 frozen retry lifecycle로 분리한다.
    `schemaCanvasDrop.ts`가 wrapped/direct/ObjectType payload를 검증·정규화하고, ontology behavior parser를
    API와 공유한다. `SchemaCanvas.vue`는 `currentTarget` 기준 좌표, mutation 없는 malformed 거부, 실패한
    target/position의 frozen retry, 성공당 한 번의 fit을 소유한다. 422-source 구조 검사, type-check,
    schema contract와 실제 DataTransfer drop·503·retry Playwright, 4,882-module production build 및
    2,739,744-byte remote lazy boundary를 통과했다. 근거:
    `evidence/schema-canvas-drag-intake.md`.
  - [x] Schema Modeling canvas `상위 10개`/`전체` 추가를 frozen attempt와 atomic canvas transaction으로
    분리했다. related 503의 append rollback과 마지막 column 503의 replace-before-commit을 실제
    브라우저에서 재현해 각각 0개 partial node와 기존 node/viewport 보존을 확인했고, 동일 묶음 재시도로
    정확히 10개/11개를 한 번 commit했다. 공통 node/grid projection unit, 전체 schema 계약,
    424-source 구조 검사, type-check, 3개 schema Playwright, 4,884-module build와 2,745,345-byte
    remote lazy boundary를 통과했다. 근거: `evidence/schema-canvas-batch-transaction.md`.
  - [x] Schema Modeling의 모든 자동·수동 fit을 overlay-safe 비대칭 viewport projection으로 통합했다.
    expanded/collapsed legend, floating controls, toolbar, minimap을 실측하고 11-node desktop의 모든
    overlay/node intersection 0, 실패 viewport 불변, 극단값 clamp를 확인했다. 425-source 구조 검사,
    type-check, 5개 schema unit, 3개 실제 browser verifier, 4,885-module build와 2,749,443-byte remote
    lazy boundary를 통과했다. 근거: `evidence/schema-canvas-overlay-safe-viewport.md`.
  - [x] 720px 이하 Schema Modeling table panel을 접근 가능한 overlay drawer로 전환하고 mobile 최초
    legend collapse, minimap 제거, controls wrap, 성공 후 canvas 복귀를 적용했다. 390x844에서 canvas
    usable width 300px 이상, drawer viewport containment, close focus·Escape trigger 복원, 검색·추가,
    overlay 교차 0, node width 100px 이상, horizontal overflow 0을 실제 browser로 확인했다.
    425-source 구조 검사, type-check, 기존 desktop/mobile 관계 회귀, 4,885-module build와
    2,752,143-byte remote lazy boundary를 통과했다. 근거:
    `evidence/schema-canvas-mobile-drawer.md`.
  - [x] What-If Simulator의 중첩 `.main-content`를 단일 `workflow-scroll` owner와 non-scroll
    `workflow-content`로 분리했다. step/session 전환과 feature 재진입 top 0, sticky 기준 단일화,
    SideNav scroll 보존을 1280x520 실제 browser와 기존 What-If 17개 회귀 흐름으로 확인했다.
    425-source 구조 검사, type-check, 4,885-module build와 2,752,143-byte remote lazy boundary,
    diff 검사를 통과했다. 근거: `evidence/whatif-single-scroll-owner.md`.
  - [x] 768px 이하 What-If session sidebar를 기본 닫힌 overlay drawer로 전환했다. desktop
    280px/50px collapse와 session 저장/복원 결과를 보존하고 mobile trigger/close/backdrop/Escape/focus
    복원, 닫힌 tab order 제외, action 후 close를 검증했다. 390x844에서 workflow 64px/content 0px 결함을
    workflow 338px/content 306px로 교정하고 drawer containment·horizontal overflow 0을 확인했다.
    기존 What-If 17개와 scroll 회귀, 425-source 구조 검사, type-check, 4,885-module build,
    2,752,143-byte remote lazy boundary와 diff 검사를 통과했다. 근거:
    `evidence/whatif-mobile-session-drawer.md`.
  - [x] Text2SQL advanced-settings disclosure, OLAP pivot field removal, Schema table/column-description edit의
    비-native click target을 accessible native button으로 교체했다. 기존 mouse 결과와 mutation target을
    보존하고 label·expanded/controls·Enter/Space·focus-visible을 1280x720 집중 browser와 390x844 Schema
    16개 회귀로 확인했다. 425-source 구조 검사, type-check, 4,885-module build,
    2,752,711-byte remote lazy boundary와 diff 검사를 통과했다. 실제 Text2SQL history 재검증은 upstream
    응답 timeout이라 성공으로 과장하지 않고 T052에 유지한다. 근거:
    `evidence/native-interaction-semantics.md`.
  - [x] Ontology Object chart section, generation logs, datasource candidate detail의 전체-header click을
    toggle/action 형제 native button으로 분리했다. 소비자 없는 chart config emit/control은 제거해 실제
    ObjectType modeler 책임으로 단일화했다. 대상별 expanded/controls·Enter/Space·focus-visible과 기존
    preview/confirm mutation을 보존하고 candidate detail flex 비압축·바깥 목록 scroll을 검증했다.
    425-source 구조 검사, type-check, Object chart 집중 브라우저, Ontology 47-flow 회귀, 실물 캡처,
    4,885-module production build, 2,752,711-byte remote lazy boundary와 diff 검사가 통과했다.
    근거: `evidence/ontology-disclosure-ownership.md`.
  - [x] MultiLayer Ontology datasource mutation 수명주기: confirm response runtime parser, 단건
    pending/error/exact retry, bulk target snapshot·부분 성공·실패-only retry, stream/search visible retry,
    native dialog 제거를 unit·브라우저·타입·구조·빌드 증거로 닫는다.
  - [x] MultiLayer Ontology document/dead-overlay 수명주기: PDF validation inline 오류, generation
    visible retry, producer 없는 model overlay selector/event/state/delete 제거를 계약·브라우저로 닫는다.
  - [x] MultiLayer Ontology panel resize 수명주기: 상세/What-If 크기 projection과 pointer
    완료·취소·Escape·unmount cleanup을 공용 composable로 분리하고 keyboard/Home·ARIA separator,
    순수 계약·구조·실제 브라우저·캡처·production build로 닫는다.
  - [x] MultiLayer Ontology causal analysis 수명주기: brush/request/progress/highlight 정책과
    abort·request sequence를 workflow 경계로 분리하고 network 부분 경고, 사용자 취소, late-result 폐기,
    exact retry, NDJSON 완료를 unit·브라우저·타입·구조·캡처·production build로 닫는다.
  - [x] MultiLayer Ontology node data·chart 수명주기: target/query/SQL projection과
    AbortController·request sequence·Ontology/Text2SQL exact retry를 workflow 경계로 분리했다.
    A→B 전환 뒤 A late result 폐기와 reset abort를 계약으로, 실제 KPI request 취소→Driver
    chart/table 유지와 session headers를 브라우저로 검증했다. 중복 chart 예약을 단일 managed watcher로
    통합했으며 type-check, node-data contract, 390-source 구조 검사, 4,851-module production build와
    `ontology-node-data-race-1920x1080.png` 실물 검토가 통과했다.
  - [x] MultiLayer Ontology filter 수명주기: nested direct-filter projection과 deterministic
    bidirectional cascade를 application 경계로 분리하고 direct override·conflict·cycle·stale rebuild를
    계약화했다. dialog draft 취소는 무변경, 확인은 단일 node-data reload, 초기화는 filter 없는 조회로
    고정했다. distinct 응답 parser·session header·AbortController·request sequence·exact retry와
    date/range disabled reason을 추가했다. type-check, filter/parser/node-data 계약, 393-source 구조 검사,
    전체 Ontology 브라우저 회귀, 4,853-module production build가 통과했다.
    `ontology-node-filter-contract-1920x1080.png`, `ontology-node-filter-lifecycle-1920x1080.png`,
    `ontology-node-filter-390x844.png`를 직접 검사했다.
  - MultiLayer Ontology의 datasource/sample dialog, generation shell/document form/progress/outcome,
    library/header/delete, operation notices와 전용 style을 이름 있는 UI 경계로 이동했다. Viewer의
    Behavior read, Measure→ObjectType creation, ontology persistence도 target/stale/retry/response
    validation composable로 분리해 Vue의 직접 backend API import를 0건으로 만들었다. Viewer는
    4,212줄에서 3,296줄, 부모 SCSS는 5,662줄에서 2,956줄로 줄었으며 type-check와 458-source
    architecture contract가 통과했다. 실제 backend E2E 대신 원문 request/response 계약만 유지한다.
- [x] T043 탭 스크롤 복원, 반응형 비율·여백, 접근성, 디자인 일관성 수정
  - [x] What-If causal explainability·Ontology SQL instance explorer·Security audit detail·
    Object child selection·Catalog holiday form의 dialog focus lifecycle을 공용화한다.
    visualization disposal, delayed close cancellation, pending guard, draft/selection/payload와
    desktop/mobile geometry를 focused browser로 검증한다.
    다섯 dialog의 자체 Escape/focus code를 shared lifecycle로 통합하면서 causal renderer
    disposal, SQL instance delayed close 취소와 pending guard, audit payload, child selection,
    holiday draft/save retry는 그대로 유지했다. focused Chromium 5종, 428-source architecture,
    type-check, 4,888-module production build와 2,759,761-byte lazy remote boundary가 통과했다.
    근거: `evidence/visualization-detail-form-modal-lifecycle.md`.
  - [x] App 설정 위험 작업·Text2SQL history 삭제·Agents.md ProcessGPT 선택·OLAP cube
    manager/editor의 key/focus/trigger lifecycle을 공용화한다. nested OLAP action suspension,
    read cancellation, mutation pending close 차단과 기존 error/exact retry/payload/geometry를
    기존 focused browser로 검증한다.
    다섯 dialog의 자체 Tab/Escape/trigger code를 제거하고 shared lifecycle로 통합했다.
    Settings/Text2SQL DELETE pending Escape 차단, ProcessGPT 초기 focus·Escape trigger 복귀,
    OLAP nested action→outer trigger→toolbar trigger 순서와 기존 exact retry/SSE cancellation을
    실제 Chromium으로 확인했다. 390×844 네 종류 화면을 직접 검사했으며 428-source architecture,
    type-check, 4,888-module production build와 2,759,761-byte lazy remote boundary가 통과했다.
    근거: `evidence/remaining-dialog-focus-ownership.md`.
  - [x] Text2SQL feedback·Text2SQL→Ontology instance·Ontology Behavior·ObjectType edit dialog의
    key/focus/trigger lifecycle을 공용화한다. nested delete suspension, inactive tab 제외, mutation
    pending close 차단과 기존 notes/instance/Behavior/chart payload·retry를 실제 browser로 검증한다.
    네 dialog의 로컬 document listener/Tab trap을 제거하고 `useDialogFocusLifecycle`에 정렬했다.
    `v-show`로 숨은 tab control은 focus 후보에서 제외하며 Behavior nested delete 중 outer listener만
    suspend해 delete trigger→outer trigger 복귀 순서를 보존한다. ObjectType chart PATCH pending 중
    Escape/close 차단, Text2SQL schema/instance·feedback 503 exact retry, Behavior delete exact retry를
    실제 Chromium으로 확인했다. 390×844 세 화면을 직접 검사했으며 type-check 포함 4,888-module
    production build와 2,760,840-byte lazy remote boundary가 통과했다.
    근거: `evidence/cross-domain-form-dialog-lifecycle.md`.
  - [x] shared ActionDialog와 Schema/Ontology modeling의 cardinality·relationship·ObjectType delete를
    공용 focus lifecycle로 통합한다. pending close 차단, cardinality dialog 내부 오류/동일 입력 재시도,
    trigger 복귀, mobile scroll/geometry를 검증하고 생산자 0인 ObjectType rename flow는 제거한다.
    architecture·focused browser는 즉시, type-check·build·lazy boundary는 배치 끝에 한 번 실행한다.
  - [x] Analyzer 기존 데이터 선택, Security 권한 추가, Ontology extraction feedback와 동의어 제안의
    복제된 modal keyboard/focus 수명주기를 shared form-dialog focus lifecycle로 통합한다. 이름·초기
    focus·Escape·Tab trap·trigger 복귀·mobile 내부 scroll과 기존 mutation/payload/부분 실패 결과를
    focused browser로 검증하고 architecture·unit은 즉시, type-check·build·lazy boundary는 배치 끝에
    한 번 실행했다. Analyzer name-case+append 결과, Ontology feedback와 동의어 PUT 결과를 보존했다.
    Security 저장 성공 직후 전체 재조회가 trigger를 제거하던 결함은 성공한 단일 규칙만 local commit해
    해결했고, 503에서는 dialog와 선택을 유지해 동일 payload를 재시도한다. pure focus-wrap unit,
    427-source 구조 검사, 실제 Chromium, type-check, 4,887-module production build와
    2,756,042-byte lazy remote boundary가 통과했다. 근거: `evidence/form-dialog-focus-lifecycle.md`.
  - [x] OntologyCanvas, ObjectTypeEditDialog, BpmnViewer와 runtime theme의 raw delayed callback을
    managed delayed-lifecycle 배치로 교정한다. latest-wins, close/unmount cancellation, popup generation,
    current modeler identity와 빠른 theme toggle을 unit·architecture·실제 browser로 검증하고
    type-check·build·lazy boundary는 배치 끝에 한 번 실행했다. ObjectType chart dialog는 label·이름 있는
    close·Escape·focus trap/복귀와 실패 status 가시성, 390×844 세로 config/preview 및 가로 overflow 0을
    확인했다. BPMN은 닫힌 popup의 delayed editor 생성 0건, reopen 뒤 실제 bpmn-js editor, 이전 성공
    timer가 후속 503을 지우지 않는 latest-wins, inline 높이 상한과 popup 독립성을 검증했다. runtime
    theme rapid toggle 역시 마지막 transition만 종료한다. 426-source 구조 검사, timer 계약, focused
    browser, type-check, 4,886-module production build와 2,756,042-byte lazy remote boundary가 통과했다.
    명시적 start/stop interval은 책임이 이미 분명하므로 재작성하지 않았다. 근거:
    `evidence/managed-delayed-lifecycle.md`.
  - [x] Text2SQL hidden-message reveal과 Electron Scope Browser context/confirmation/toast를 transient
    action ownership 배치로 교정한다. native reveal/menuitem/close, 공용 ActionDialog, managed timer
    cancellation, keyboard context/Escape/focus, exact trash IPC와 mobile geometry를 구조·계약·실제
    browser로 검증하고 type-check·build·lazy boundary는 배치 끝에 한 번 실행했다. 표시 대상의
    filter/window/count를 `messageWindow.ts`의 단일 순수 projection으로 합쳐 tool/thinking 때문에 숨김
    수가 어긋나던 결함도 제거했다. Scope context는 실제 menu rect로 viewport를 clamp하고 Shift+F10,
    방향키, Home/End, Escape와 trigger focus를 제공한다. 자체 alertdialog CSS를 공용 `ActionDialog`로
    교체했으며 toast close가 managed timer를 취소한다. 실패한 휴지통 요청은 row를 보존하고 동일
    root/path만 재시도한다. 390×844에서 tree/preview를 세로 배치해 root overflow 0을 확인했다. 전용
    unit과 두 focused browser, 426-source 구조 검사, type-check, 4,886-module production build,
    2,756,093-byte remote boundary가 통과했다. 근거: `evidence/transient-action-ownership.md`.
  - [x] Schema Behavior attempt, table/column reference result, Ontology child selection을 selection result
    ownership 배치로 교정한다. native selection/reference buttons와 labelled child/filter-scope checkbox,
    exact detail/navigation/confirm 결과, keyboard, responsive geometry를 focused browser·architecture로
    검증하고 type-check·production build·lazy boundary는 배치 종료에 한 번만 실행했다. 기존 관계
    verifier의 obsolete row double-click도 native add action으로 동기화해 duplicate node를 제거했다.
    모바일 실물 캡처에서 발견한 undefined surface token의 투명 dialog와 toolbar 압축을 canonical theme
    token·세로 toolbar·내부 table scroll로 교정했다. 425-source 구조 검사, type-check, 세 focused browser,
    4,885-module build, 2,756,093-byte lazy entry와 scoped diff가 통과했다. 근거:
    `evidence/selection-result-ownership.md`.
  - [x] Schema Canvas catalog/semantic source와 ObjectType Modeler source card를 modeling source action
    ownership 배치로 교정한다. drag wrapper와 native select/add/remove/Behavior/edit/delete sibling
    controls를 분리하고 redundant name double-click을 제거한다. exact canvas result, drag payload,
    keyboard, responsive geometry를 browser·architecture·type·build·lazy boundary로 검증했다.
    425-source 구조 검사, 두 focused browser, 4,885-module production build, 2,757,041-byte lazy
    entry와 diff 검사가 통과했다. 근거: `evidence/modeling-source-action-ownership.md`.
  - [x] MultiLayer Ontology canvas/edge context menu, relation edit, PDF picker, datasource mapping disclosure,
    node datasource result selection을 secondary action ownership 배치로 교정한다. native menuitem/button,
    expanded/controls/pressed state와 기존 graph/API/retry 결과를 focused browser·architecture·type·build
    ·lazy boundary로 검증했다. 전체 Ontology browser 회귀, 425-source architecture, type-check,
    4,885-module production build와 2,754,662-byte lazy entry가 통과했고
    `evidence/ontology-secondary-action-ownership.md`에 화면·계약 증거를 기록했다.
  - [x] Code Analysis upload tab, Schema detail Behavior card, Schema Canvas table-node column/Behavior
    action을 workspace native action ownership 배치로 교정한다. sibling tab controls, selected/expanded
    state, keyboard activation, 기존 edit/run/reference payload, responsive geometry를 focused
    browser·architecture·type·build·lazy boundary로 검증했다. keyboard reference popup의 `(0,0)`
    synthetic click 잘림과 Behavior 실행 버튼의 flex 축소 결함도 실물 캡처에서 발견해 control anchor
    + 양축 clamp와 고정 action 폭으로 교정했다. Parser upload, Ontology Behavior editor, Schema Canvas
    batch 브라우저 계약, 425-source 구조 검사, type-check, production build,
    2,754,662-byte remote lazy boundary와 diff 검사가 통과했다. 근거:
    `evidence/workspace-native-action-ownership.md`.
  - [x] MultiLayer Ontology layer group/badge/options를 native disclosure/selection으로 전환하고 Behavior
    model list의 schema+node request identity, abort/stale rejection, visible failure, same-target 보존과
    exact retry를 구현한다. saved ontology browser, 전체 Ontology 회귀, architecture·type·build·lazy
    boundary를 배치 단위로 검증했다. 503 뒤 동일 schema/node 요청 재시도, 성공 뒤 같은 target 갱신
    실패 시 last-valid model 보존, 동일 요청 4회, native layer keyboard 상태를 실제 브라우저에서
    확인했다. 425-source 구조 검사, type-check, 전체 Ontology 브라우저 회귀, 4,885-module production
    build, 2,753,769-byte remote lazy boundary와 diff 검사가 통과했다. 근거:
    `evidence/ontology-node-detail-state-ownership.md`.
  - [x] What-If DataSelector, OLAP FieldList, Security permission tree를 cross-domain interaction ownership
    배치로 정리한다. table/file/field/tree의 native activation과 독립 상태 소유권, invalid file,
    upload exact retry, drag payload, cascade 결과를 focused browser로 검증하고 배치 단위
    architecture·type·build·lazy boundary를 실행했다. Security의 중간 schema override 소실과 실제
    inherited level 소실도 함께 교정했고 모바일 캡처에서 발견한 level chip 압축을 재배치했다.
    425-source 구조 검사, type-check, 10-flow browser, 4,885-module build, 2,753,769-byte remote
    lazy boundary와 diff 검사가 통과했다. 근거: `evidence/cross-domain-interaction-ownership.md`.
  - [x] Schema Canvas datasource/schema 전체-header click을 expanded/controls가 있는 native disclosure로
    전환하고 schema state key를 datasource+schema identity로 교정한다. 동일 schema 이름의 교차-datasource
    독립 toggle, 기존 table drag/select/remove, Catalog retry, 타입·구조·브라우저·빌드를 검증했다.
    425-source 구조 검사, Schema Canvas drop 계약, type-check, 4,885-module build,
    2,753,769-byte remote lazy boundary와 diff 검사가 통과했다.
    근거: `evidence/schema-tree-disclosure-identity.md`.
  - [x] Object Explorer ObjectType row의 전체 div selection click과 중첩 expand를 형제 native button으로
    분리했다. selected/expanded/controls·Enter/Space·focus를 제공하고 expand request 0건, select actual
    data request 1건과 기존 graph/chart 결과를 실제 browser에서 검증했다. 425-source 구조 검사,
    type-check, 전환 정착 후 실물 캡처, 4,885-module build, 2,752,711-byte remote lazy boundary와 diff
    검사가 통과했다. 근거: `evidence/object-explorer-row-ownership.md`.
  - [x] Agents.md context sidebar의 always-open 연결 모델 header에서 죽은 `_models` click을 제거하고,
    built-in/ProcessGPT group은 expanded/controls를 가진 native disclosure로 전환했다. ProcessGPT add는
    toggle과 형제 action으로 분리했다. Enter/Space·focus·기존 add 실패/retry mutation·반응형 결과를
    Agents.md 집중 browser와 전체 Ontology 47-flow 회귀로 확인했고 425-source 구조 검사, unit,
    type-check, 실물 캡처, 4,885-module build, 2,752,711-byte remote lazy boundary와 diff 검사가 통과했다.
    근거: `evidence/agents-md-context-group-ownership.md`.
  - 2026-07-23: Analyzer 진행 overlay를 upload/graph 문맥으로 제한하고 schema 오류 알림과 범례의
    비중첩을 실측했다. 나머지 dialog/table/form의 전수 반응형·키보드 감사가 남아 있다.
  - Ontology 노드 필터 dialog를 이름 있는 modal과 draft confirm/cancel로 교체하고 context menu를 native
    menuitem control로 정리했다. 1920×1080에서 distinct 실패/재시도·계약 미확인 range 안내·적용 chip과
    graph 비중첩을, 390×844에서 viewport 내부 geometry·document overflow 0을 실제 캡처로 확인했다.
  - 데이터 리니지의 OLAP/Catalog 부분 장애를 숨기지 않는 비차단 경고로 표시하고, 성공한 소스의 그래프와
    통계를 유지했다. 1920×1080에서 경고·그래프 비중첩과 실제 재시도 클릭을 검증했다.
  - Ontology SQL 인스턴스 생성의 1920×1080 실물에서 카드 겹침을 발견해 고정 폭·12px gap·부모 중심 grid로
    교정했으며, 성공과 MV 부분 실패 경고가 동시에 읽히는지 재검증했다.
  - What-If 비교 카드를 실제 응답 모델 수에 맞는 auto-fit grid로 바꾸고, fallback 경고·승자 영역의
    비중첩을 1920×1080 실물로 확인했다. 세부 차트·테이블 토글은 키보드 버튼과 `aria-expanded`로 교체했다.
  - What-If 세션 저장 경고를 접근 가능한 고정 message stack으로 표시하고 1920×1080에서 콘텐츠 비중첩을
    확인했다. 세션 선택·단계 이동도 native button과 `aria-pressed`/`aria-current`로 교체해 Enter 전환을
    브라우저에서 검증했다.
  - 저장 온톨로지 드롭다운의 expanded/busy 상태와 실패·부분 제외 live region을 명시하고 스키마 선택을
    native button으로 교체했다. Enter 선택이 activate→detail 요청을 각각 한 번 수행하는지 검증했으며,
    다크/라이트 상태 스타일과 1920×1080 실패·재시도 캡처의 헤더/캔버스 비중첩을 직접 확인했다.
  - 노드 데이터소스 dialog에 단계별 오류·재시도와 명시적인 ObjectType 실행 datasource 선택을 추가했다.
    레이어 노드와 테이블/ObjectType 항목은 native button·`aria-pressed`·focus ring으로 교체했고 Enter
    선택부터 확정까지 검증했다. 1920×1080 실패/성공 dialog에서 세 선택 필드와 카드·footer 비중첩을 확인했다.
  - 저장 온톨로지 이름 변경 오류를 입력 바로 아래에 유지하고, 삭제 실패를 명명된 modal dialog 안에
    표시하며, load 부분 실패와 성공을 dropdown live state로 구분했다. pending 제어의 disabled/`aria-busy`,
    키보드 Enter 제출, 재시도, 네 가지 1920×1080 상태의 비중첩을 직접 확인했다.
  - extraction 스키마 선택기는 중첩된 클릭 행을 별도 native 선택/삭제 버튼으로 바꾸고 expanded/busy/current,
    live error, modal label/focus/Escape/disabled 상태를 명시했다. 목록·detail·삭제 실패와 active 삭제 성공
    네 가지 1920×1080 화면을 육안 검사했으며, 캡처도 transition 완료 뒤 수행해 실제 가독성을 증거화했다.
  - Wizard 저장 스키마 카드를 native button으로 교체하고 목록/선택 pending 중 입력 충돌을 막았다. 최초
    목록 실패와 activation 실패를 inline live state로 표시해 키보드 재시도를 검증했다. 긴 서버 오류가
    retry 버튼을 밀어내던 flex 최소폭 결함도 실제 캡처에서 찾아 줄바꿈·축소 규칙을 추가했으며 두 가지
    1920×1080 오류 화면의 카드·입력·동작 버튼 비중첩을 재확인했다.
  - DB schema 생성 dialog의 바깥 문서용 footer와 내부 Schema용 footer가 함께 표시되던 중복을 실제
    캡처에서 발견해 문서 모드로 제한했다. 생성된 단일 노드가 Cose layout의 종료 fit에서 캔버스 전체로
    확대되던 문제도 단일 노드 zoom 상한으로 교정했다. 실패 화면의 단일 action row와 성공 화면의 중앙
    일반 크기 노드를 1920×1080 캡처로 다시 확인했다.
  - ObjectType 생성 dialog의 선택 행·접기 header를 native control로 교체하고 dialog/busy/live/focus
    상태를 명시했다. 본체 성공 뒤 관계 실패를 고정 status/action 영역에 표시한다. 실제 캡처에서 relation
    catalog 오류 행이 flex 축소와 overflow에 잘리는 결함을 발견해 관계 영역은 콘텐츠 높이를 보존하고
    Text2SQL만 남은 공간을 쓰도록 책임을 교정했다. catalog 실패·부분 실패·재시도 성공 화면을 다시
    1920×1080으로 확인했다.
  - ObjectType Direct SQL 503 화면에서 관련 없는 Data Fabric `Internal Server Error`가 함께 보이던 것을
    캡처로 발견해 작업별 store 상태로 교정했다. Direct SQL의 단일 Text2SQL 오류·재시도와 설정 결과를
    재확인했다. Data Fabric table 503도 datasource card를 유지한 채 하단 상세 패널의 오류·재시도로
    표시되며 빈 table 상태와 구분되는지 1920×1080에서 확인했다.
  - 업로드 datasource 생성 폼의 하단 action이 1920×1080 실물에서 잘리는 것을 발견해 modal header/body
    flex 수명주기와 내부 scroll로 교정했다. 390×844에서는 파일/DDL을 단일 열로 전환하고 남는 높이를
    균등 배분하며 validation/action footer를 별도 행으로 고정했다. transition 완료 뒤 불투명 surface,
    가로 overflow 0, body/footer 비중첩을 수치와 캡처로 재확인했다.
  - Data Fabric 관리 화면은 responsive rule이 전혀 없고 datasource card가 마우스 전용이며 등록 modal의
    이름·focus/Escape 계약과 삭제 확인 UI가 없다. 책임 분해와 함께 1920×1080·390×844 실제 geometry,
    키보드 선택·확정·취소를 검증한다.
  - Data Fabric datasource card를 native selection button으로 바꾸고 add dialog와 delete alertdialog의
    label/focus/Escape/trigger focus 반환을 추가했다. 모바일 catalog는 단일열, form은 내부 scroll로
    전환했다. 첫 캡처에서 sticky action이 Database/Schema를 덮는 결함을 발견해 문서 흐름 action으로
    교정했으며 두 390×844 화면의 가로 overflow 0과 field/action 비중첩을 재확인했다.
  - Catalog 대량 업로드는 이름 있는 modal/alertdialog, 최초 focus, Escape 취소와 modal focus 복귀를
    명시했다. 390×844에서 header/step/filter/footer를 압축하고 6열 preview는 데이터를 숨기지 않는 내부
    가로 scroll을 사용한다. 손상 상태 폐기, 정상 상태 복원 취소·승인, malformed 200 재시도, import/rollback
    503 동일 dialog 재시도를 실제 키보드·클릭으로 검증했고 page 가로 overflow 0을 캡처로 확인했다.
  - Catalog 일반 용어 화면은 900px 이하에서 glossary strip/main/metadata를 세로 흐름으로 전환하고 table만
    내부 가로 scroll을 사용한다. 390×844 document/root overflow 0을 확인했다. 용어 행 Enter 선택,
    개별/전체 설명 펼치기의 실제 state·`aria-expanded`, 미구현 활동 피드 disabled 상태를 추가했다.
  - 영업일 캘린더 공휴일 dialog에 label/date input focus/Escape/trigger focus 복귀를 추가했다. mobile은
    sidebar/main을 세로로 쌓고 7열 grid만 내부 scroll한다. 390×844 document/root overflow 0과
    날짜 선택 `aria-pressed`, load/save 503 정확한 재시도를 브라우저에서 확인했다.
  - 앱 설정의 저장 draft와 runtime 적용 정책, 새 세션·전체 삭제 확인 수명주기를 분리했다. native confirm과
    사용되지 않는 그래프 통계/변경 상태를 제거했다. 새 세션 취소·확정, 중첩 alertdialog Escape·focus
    복귀, 전체 삭제 503 뒤 동일 DELETE 재시도, 성공 전 modal/상태 보존, 1280×720·390×844 geometry가
    브라우저에서 통과했다. 저장 깊이 경계 계약, type-check, 364-source 구조 검사, 4,817-module build와
    lazy entry boundary도 통과했다.
  - Text2SQL 히스토리의 조회 filter/race와 단건·전체 삭제 commit을 store 책임으로 정리했다. 늦은 검색
    응답 폐기와 filter 보존 pagination을 unit으로 고정하고, 삭제 실패를 false로 삼키던 경로를 제거했다.
    panel은 managed 검색 timer, 키보드 선택·펼치기, 대상별 alertdialog와 실패·재시도를 소유한다. 모바일
    280px panel은 본문을 찌그러뜨리지 않는 overlay로 전환했다. 단건 DELETE 503→동일 대상 재시도,
    전체 삭제 취소, 390×844 overflow 0과 완료 프레임을 브라우저에서 확인했으며 type-check,
    365-source 구조 검사, 4,820-module build·lazy boundary가 통과했다.
  - Text2SQL 결과→Ontology instance 생성은 domain UI에서 제거하고 두 domain 공개 경계를 소비하는
    `text2sql-ontology` workflow로 이동했다. 앱의 physical/domain 메뉴와 Ontology embedded 소비자를 같은
    wrapper로 통일하고 source SQL·질문·컬럼·datasource·schema/node/id/name mapping을 보존했다. schema
    목록·상세 503의 단계별 재시도, bulk-create 503 뒤 성공 전 상태 불변과 동일 workflow 재시도, MV 503
    부분 성공 경고를 native alert 없이 dialog 안에서 검증했다. Escape·trigger focus 복귀와
    1920×1080·390×844 geometry/overflow 0을 실제 브라우저로 확인했으며 type-check, 369-source 구조 검사,
    4,826-module build, remote/lazy build boundary와 diff 검사가 통과했다.
  - Text2SQL 본체의 최근 질문 parse/정규화/저장 정책을 application 모듈로 분리하고 손상 저장값·quota
    실패를 화면 warning으로 보존했다. SQL diff와 embedded/navigation 자동 submit timer는 공용 managed
    lifetime으로 전환했다. native prompt/alert 기반 피드백을 대상·notes·pending·error를 소유한 dialog로
    교체하고 API 성공 후에만 제출 완료 key를 commit한다. 오답 취소, 503 뒤 동일 SQL/question/notes/rating
    재시도, 히스토리 저장 503의 비파괴 warning, 390×844 focus/geometry/overflow 0을 브라우저로 확인했다.
    테스트 중 모바일 history toggle을 가리던 mode selector z-index 결함도 overlay 계층으로 교정했다.
    recent-query unit, history unit, type-check, 371-source 구조 검사, 4,830-module build, remote/lazy boundary,
    diff 검사가 통과했다.
  - 앱 알람 toast의 reconnect·자동 제거·acknowledgement 후 제거를 key 기반 managed lifetime으로 바꾸고,
    수동 닫기 때 알람별 timer를 취소한다. stream 실패는 기능이 활성화된 경우 재연결 status로 표시하며,
    확인은 알람 ID별 pending/error/retry를 소유하고 API 성공 후에만 acknowledged 상태를 commit한다.
    모바일 toast 폭·여백과 닫기 label도 보정했고 type-check와 371-source 구조 검사가 통과했다. 실제
    alarm stream 성공은 환경 의존 T052에 남긴다.
  - Security 사용자·역할 목록/editor/delete 상태와 감사 로그 상세 수명주기를 분리했다. native
    alert/confirm과 console-only load 오류를 제거하고 공용 delete alertdialog, editor/detail dialog의
    label·초기 focus·Escape·trap·trigger 복귀를 추가했다. backend에 없는 역할 수정은 alert-only 가짜
    동작 대신 사유가 있는 disabled control로 표시한다. 사용자·역할 DELETE 503→동일 UID/name 재시도,
    성공 전 목록 불변, 390×844 overflow 0을 브라우저에서 확인했으며 type-check와 372-source 구조 검사가
    통과했다. 4,833-module production build, 2,674,692-byte lazy remote boundary와 scoped diff 검사도
    통과했다.
  - OLAP의 단일 loading/error를 목록·선택·query·preview·sync identity로 분리하고 늦은 응답을 폐기한다.
    단건 삭제는 큐브와 같은 이름의 ETL 설정만 정리하고 DW table을 추정하지 않으며, 전체 DW 삭제는
    전체 큐브 삭제 dialog에서 명시적으로 선택한 경우에만 실행한다. `success:false`는 ETL/Airflow
    mutation의 실패이고, 6단계 provisioning은 같은 입력 재시도에서 완료 단계를 반복하지 않는다.
    EventSource는 runtime session header를 전달하고 abort 가능한 fetch-SSE로 교체했으며 editor 종료·새
    실행에서 stream/timer를 해제한다. 설정/script 조회 실패, 부분 초기 ETL 실패, terminal 없는 EOF를
    빈 초안·성공으로 숨기지 않는다. 단건/전체 삭제 취소·503·정확 재시도, DAG 재배포, provisioning
    checkpoint, config/script 재조회, SSE header/종료, 1920×1080·390×844 dialog geometry/focus를 두
    브라우저 계약으로 검증했다. 모바일 편집기 탭 잘림은 실물 캡처에서 발견해 3열 grid와 제목/탭
    경계 단언으로 교정했다. OLAP unit, type-check, 377-source 구조 검사, 4,840-module build,
    2,674,692-byte lazy remote boundary와 diff 검사가 통과했다.
  - Observability의 Agent Scheduler 프로필과 Text2SQL event rule mutation을 primary 성공 commit과
    후속 목록 refresh로 분리했다. 삭제는 대상/pending/error를 소유한 workflow alertdialog에서 취소·503
    동일 ID 재시도하며, backend 성공 전 목록을 유지한다. 삭제·toggle 성공 뒤 refresh 503은 이미 성공한
    결과를 로컬에 유지하고 별도 warning으로 표시해 mutation을 반복하지 않는다. 프로필 카드의
    `button > role=button` 중첩은 selection/toggle/delete 형제 native button으로 교체했고, 실제 모바일
    브라우저에서 detail overlay가 목록 action을 가리는 결함도 발견해 문서 흐름으로 교정했다. 두
    390×844 delete 오류 화면의 focus/geometry/overflow를 직접 확인했다. mutation unit, type-check,
    379-source 구조 검사, WatchAgent/EventDetection 브라우저 계약, 4,844-module build,
    2,674,692-byte lazy remote boundary와 diff 검사가 통과했다.
- [x] T044 `src/features` 옛 경로, compatibility shim, domain 밖 service URL, Vue raw fetch 0
  - 2026-07-23: 모든 Vue와 workflow의 raw fetch 0을 구조 검사로 고정했다. 공통 HTTP의 URL 기반
    backend 추론을 제거하고 Analyzer·Catalog·Parser·Text2SQL·What-If가 장애 문맥을 소유하게 했다.
    type-check, 334-source architecture contract, Analyzer/Schema/Text2SQL/What-If 브라우저 회귀가 통과했다.
  - What-If TTM/MindsDB 비교는 각각 endpoint 전용 오류 문맥을 소유해 한 capability의 503을 전체 서비스
    장애로 과장하지 않으며, 갱신된 type-check·domain contract·338-source architecture 검사가 통과했다.
  - What-If transport를 `createWhatIfClient`로 집중하고 JSON·FormData·GET·DELETE 18개 메서드 모두에
    runtime 언어/LLM/Neo4j 헤더를 전달하도록 정리했다. 전체 path·method·body·header 계약과 실제 비교
    브라우저 요청 헤더를 검증했다.
  - 옛 `features/code-analysis/components/upload`와 `features/code-analysis/upload.ts`를 제거하고
    `workflows/code-analysis/upload.ts` 하나만 앱 lazy entry로 사용한다. upload workflow의 domain 내부
    import, 하드코딩 connector fallback, `any`/강제 단언, native dialog, 비관리 timer는 구조 규칙으로
    재유입을 차단했다.
  - Data Fabric 관리 shell이 connector map·등록 form·native dialog·raw timer를 다시 흡수하지 못하도록
    구조 규칙을 추가했다. Data Fabric 전체에서 `any`/강제 단언/native dialog/raw timer/중복 시각 map은
    0건이며 connector dialog는 검증된 application 정책과 managed timer를 사용한다.
  - Catalog bulk upload/extract/import/rollback의 non-stream 응답도 `unknown` runtime parser를 반드시
    거치도록 고정했다. 대량 업로드 UI 5개 파일에서 `any`/`as unknown`/native dialog/raw timer/직접
    `JSON.parse`/template event cast는 0건이며 361-source 구조 검사가 통과했다.
  - Catalog 일반 glossary/term 응답 parser와 operation-specific retry, 공용 alertdialog를 구조 규칙에
    추가했다. glossary UI의 native confirm은 0건이며 최신 type-check·361-source 구조 검사·4,812-module
    production build와 lazy entry boundary가 통과했다.
  - Business calendar의 응답 날짜/설정/mutation success parser, 순수 정책, managed success timer,
    접근 가능한 dialog와 exact retry를 구조 규칙으로 고정했다. Catalog glossary UI의 raw timer와
    native dialog는 0건이며 362-source 구조 검사·4,813-module build·lazy entry boundary가 통과했다.
  - Glossary/Term modal의 접근성 경계와 Term metadata 부분 실패 표시·retry를 구조 규칙에 추가했다.
    최신 modal 브라우저 회귀와 type-check, 362-source 검사, 4,813-module build도 통과했다.
  - 앱 설정 shell이 native dialog나 저장값 직접 단언을 다시 흡수하지 못하도록 구조 규칙을 추가했다.
    `SettingsActionDialog`의 alertdialog/pending/cancel 계약과 application draft 의존이 고정됐으며 최신
    type-check, 364-source 구조 검사, 4,817-module build·lazy entry boundary가 통과했다.
  - Text2SQL history panel/store가 native dialog·raw timer·console-only mutation failure를 다시 만들지
    못하도록 구조 규칙을 추가했다. stale read sequence, active filter, keyboard selection과 접근 가능한
    history action dialog가 고정됐으며 최신 type-check, 365-source 검사, 4,820-module build가 통과했다.
  - 최종 옛 경로 감사에서 남은 `@/features` import는 사용자가 보호한 057/059 Analyzer graph WIP
    경계뿐이며 다른 legacy feature, Vue raw fetch, domain 밖 service URL은 없다. 이를 강제로 이동해
    보호 WIP를 훼손하지 않고 명시적 예외로 고정한다.

## Phase 6: Completion Audit

- [x] T050 전체 `npm run type-check`와 `npm run build` 통과
  - 2026-07-24: type-check 0건, Vite 4,964 modules production build, remote asset 2,759,761 bytes.
- [x] T051 모든 정적·unit spec 계약 및 신규 구조/계약 테스트 통과
  - architecture 458 sources, build boundary와 `test-*.mjs` 41개가 통과했다. 실제 backend/host
    Playwright E2E는 확정된 범위에 따라 제외했다.
- [x] T052 backend request/response 계약 정적 대조
  - 사용자 지시에 따라 실제 데이터·인증·서버 조합의 backend E2E는 frontend refactor 범위에서
    제외한다. backend 원문의 route/method/header/payload/response/error/event schema와 frontend
    client/parser를 대조한 기존 evidence를 완료 근거로 사용하며 실서버 성공으로 과장하지 않는다.
- [x] T053 standalone·Architect web·Electron 정적 host boundary 검증
  - 실제 host/backend 통합 Playwright는 별도 통합 단계로 넘긴다. 이번 범위에서는 feature id,
    embedded 4개 entry, mount/unmount, project/session context, toolbar ownership과 빌드 boundary를
    정적으로 보존한다.
- [x] T054 spec↔plan↔tasks↔code, Git diff, 사용자 WIP 보존 최종 감사
  - `git diff --check` 오류 0건. 사용자 소유 `package.json`, 057/059, code-analysis graph,
    `panelGraphProjection.ts`, `tsconfig.panel-projection.json`의 기존 dirty 상태를 보존하고 이번 배치에서
    수정·되돌림하지 않았다.
