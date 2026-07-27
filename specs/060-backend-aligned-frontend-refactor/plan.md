# Implementation Plan: 백엔드 책임 기준 프론트 전면 리팩토링

**Branch**: `main` (기존 WIP 보존) | **Date**: 2026-07-22 | **Spec**: [spec.md](./spec.md)

## Summary

백엔드는 변경하지 않고 현재 API·데이터 소유권을 프론트 코드 구조의 기준으로 삼는다. 화면 이름 중심의
`src/features/*`를 backend-aligned `src/domains/*`로 옮기고, 각 domain 내부를 `api`, `application`,
`state`, `ui` 책임으로 정리한다. 여러 backend 흐름만 `src/workflows/*`가 공개 domain API를 조립한다.

## Technical Context

**Language/Version**: TypeScript 5.3, Vue 3.4, Pinia 2.1, Vite 5

**Testing**: domain 전용 strict tsconfig/계약 테스트, 기존 spec 계약, `vue-tsc`, Vite production build,
실제 Gateway/backend와 Playwright 브라우저 검증

**Target Platform**: standalone SPA, Module Federation remote, Architect web/Electron host

**Baseline (2026-07-22)**:

- `npm.cmd run build:docker`: 통과, 4,719 modules
- `npm.cmd run type-check`: 실패, 기존 TypeScript 오류 208개
- `npm.cmd run test:panel-projection`: 통과
- `node specs/059-cohesion-coupling-view/contracts/test-area-graph.mjs`: 통과

**Constraints**:

- 백엔드 저장소와 Gateway 설정을 수정하지 않는다.
- 057·059 dirty 파일은 해당 작업이 끝나거나 소유 슬라이스에서 명시적으로 병합되기 전 수정하지 않는다.
- alias/re-export shim 없이 생산자와 소비자를 같은 슬라이스에서 이동한다.
- 한 슬라이스가 실패한 상태에서 다음 domain으로 넘어가지 않는다.

## Quality-Preserving Accelerated Cadence

- 같은 상태/API/상호작용 경계를 공유하는 화면 3~5개를 한 배치로 설계·수정한다. 파일 수를 늘리기
  위해 무관한 책임을 한 배치에 섞지 않는다.
- 수정 중에는 변경 파일의 architecture/domain contract와 해당 사용자 흐름의 focused browser만
  실행한다. 이미 통과했고 현재 dependency/contract diff의 영향 경로에 없는 suite는 반복하지 않는다.
- `type-check`, production build, lazy/build boundary, scoped diff는 배치 종료에 한 번 실행한다.
  전체 브라우저 회귀는 큰 마일스톤과 최종 감사에서 실행한다.
- 조사한 backend 계약, 통과한 fixture/request identity, 화면 캡처, asset boundary를 evidence에
  기록한다. 계약 또는 의존 경계가 바뀌지 않았다면 같은 사실을 다시 조사하지 않는다.
- 가속은 검증 생략이 아니다. 새 실패, stale/race 가능성, mutation payload, 접근성 상태, responsive
  geometry는 해당 배치에서 반드시 닫고 다음 배치로 넘어간다.

## Constitution Check

| 원칙 | 판정 | 근거 |
|---|---|---|
| I. Tab-Based Single-Route Shell | PASS | route와 feature id를 보존한다. |
| II. Backend-Aligned Responsibility Groups | PASS | domain과 workflow가 이 spec의 핵심 산출물이다. |
| III. Gateway-Routed, Session-Headed API | PASS | Gateway 경유와 session header를 보존하고 domain API로 집중한다. |
| IV. Honest State: Wired vs. Mock | PASS | mock/live 상태를 조사해 가용성 계약으로 드러낸다. |

## Target Structure

```text
src/
├── app/                         # bootstrap, shell, feature registry, navigation
├── domains/
│   ├── parser/
│   ├── analyzer/
│   ├── catalog/
│   ├── data-fabric/
│   ├── text2sql/
│   ├── ontology/
│   ├── whatif/
│   ├── olap/
│   ├── glossary/
│   ├── security/
│   ├── architect/
│   └── schedulers/
├── workflows/
│   ├── code-analysis/           # parser → analyzer → catalog
│   ├── schema-modeling/         # catalog + data-fabric + ontology
│   └── query-handoffs/          # text2sql → olap/ontology/monitoring
└── shared/                      # domain 독립 UI/infrastructure only
```

각 domain은 실제 책임이 존재할 때만 `api`, `application`, `state`, `ui` 하위 폴더를 만든다.

## Migration Order

1. Data Fabric: 현재 단일 `datasources.ts`에서 API·connector catalog·state·UI 분리
2. Parser: upload/parse contract 이동
3. Catalog: schema·graph·lineage API 통합
4. Analyzer: user WIP 착지 후 graph/search/source/state 분리
5. Code Analysis workflow: Parser→Analyzer→Catalog orchestration 추출
6. Text2SQL: query/history/direct SQL/observability를 한 backend group의 하위 책임으로 이동
7. Ontology: domain/ontology/object-explorer를 backend group 아래 재구성
8. WhatIf, OLAP, Glossary, Security, Architect/Schedulers 이동
9. App/shared 정리, UI/UX 공통 결함 수정, 옛 경로 0
10. 전체 실제 서비스·standalone·embedded 브라우저 회귀

## First Slice: Data Fabric

```text
src/domains/data-fabric/
├── api/client.ts
├── api/contracts.ts
├── catalog/connectors.ts
├── state/datasources.ts
├── ui/DataSourceManager.vue
├── ui/DataSourcesTab.vue
└── index.ts
```

이동 전후 보존 계약:

- `/api/gateway/data-fabric/api/datasources*` method/path 동일
- session `X-Neo4j-*` headers 동일
- store id `datasources`와 공개 action/state 이름 동일
- feature id `datasources`, label, embedded 노출 동일
- DataSourcesTab UI markup/style 동일

## Verification Strategy

각 domain마다 이동 전 정답지 고정 → `git mv` → 내부 분리 → 소비자 동시 이동 → 옛 경로 0 → domain
strict 타입검사/계약 테스트 → production bundle/인접 spec 회귀 → 실제 service/browser 검증을 반복한다.

### T042 거대 모듈 분해 게이트

#### Agents.md authoring workflow lifecycle

`AgentsMdEditor`는 Ontology의 Agents.md·agent context·Behavior와 Agent Scheduler의 ProcessGPT 목록을
동시에 조립하므로 domain UI가 아니라 `workflows/ontology`가 소유한다. Ontology API 경계는 content,
context, mutation success, rewrite 응답을 runtime 검증하고 모든 요청에 runtime session header와
workflow AbortSignal을 전달한다.

- `application/agentsMdEditorPolicy.ts`는 editor document snapshot, mention projection, ProcessGPT
  Behavior payload/name, diff line 계산을 순수하게 소유한다.
- `composables/useAgentsMdEditor.ts`는 node별 read sequence, AbortController, 원본과 draft, 작업별
  pending/error, target-frozen exact retry, create/save/toggle/delete/reset/rewrite/process-add commit
  순서를 소유한다.
- UI는 편집·preview·context 표현만 조립한다. 삭제와 dirty reset은 공용 `ActionDialog`, ProcessGPT
  선택은 이름 있는 modal과 native 선택 button을 사용하고 focus/Escape/busy/error/retry를 제공한다.
- node 전환과 scope 종료는 read/rewrite를 abort하고 timer를 정리한다. context 실패, process 목록
  실패, mutation 성공 뒤 context refresh 실패는 서로 다른 visible 상태로 유지한다.
- 같은 selected node의 데이터소스 보조 정보 갱신은 reactive node state만 변경한다. 상세 패널을
  `null → selected id`로 강제 재마운트하지 않아 Agents.md draft, 열린 dialog, focus를 보존한다.
- 그래프 layout 뒤 지연 실행되는 최근 선택 복원은 현재 선택이 없을 때만 실행해, 사용자가 먼저 연
  Behavior 탭과 진행 중인 편집 수명주기를 덮어쓰지 않는다.

순수/수명주기 계약은 malformed 200, `success:false`, 늦은 read/rewrite 폐기, enabled-only 저장과
실패 rollback, target-frozen delete/reset/rewrite/process-add retry, 성공 전 상태 불변을 검증한다.
브라우저는 생성→편집→저장, toggle 실패→복구→재시도, context/process 목록 실패→정확 재시도,
dirty reset·delete Escape→0 request와 503→동일 retry→성공, AI rewrite 취소/늦은 응답 폐기,
1920×1080·390×844 dialog/focus/overflow를 실제 사용자 조작으로 확인한다.

#### MultiLayer Ontology responsive shell

기존 desktop flex shell은 390×844에서도 280px layer panel, 최소 280px detail panel, 전체 header actions를
동시에 배치해 label을 세로 글자로 압축한다. mobile에서는 책임을 없애지 않고 표현 방식만 바꾼다.

- header는 title과 두 열 wrapping action grid로 전환하며 action label은 줄바꿈하지 않는다.
- layer panel은 viewer content 위 overlay로 두고 기존 collapse control로 canvas를 드러낸다.
- node/relation detail은 viewer content 전체 폭 overlay로 두고 header의 이름 있는 close control로
  선택/편집을 종료한다. mobile에서는 width resize separator를 숨긴다.
- graph toolbar와 legend는 자기 container 안에서 scroll/wrap하고 document root overflow를 만들지 않는다.
- viewport resize는 관리형 debounce 뒤 Cytoscape renderer를 resize하고 node collection을 center한다.
  기존 zoom 값은 보존해 mobile 전환을 임의 auto-fit으로 취급하지 않는다.
- desktop media 밖의 inline width, pointer/keyboard resize, selection, graph, toolbar 동작은 변경하지 않는다.

브라우저 계약은 390×844를 처음 viewport로 열어 header label의 비정상 세로 압축 0, document overflow 0,
layer collapse, node 선택→full-width detail, Behavior 탭, detail close→canvas 복귀를 실제 조작하고
1920×1080 panel/resize 회귀는 기존 Ontology 장기 suite로 다시 검증한다.

#### Ontology What-If model manager lifecycle

`StepModelManager`의 모델 목록·metrics projection·단건/전체 삭제를 domain application과 lifecycle로
분리한다.

- `application/modelManagerPolicy.ts`는 model status projection, 안전한 metrics projection, 단건/전체
  삭제 snapshot, 부분 성공 뒤 remaining target 계산을 순수하게 소유한다.
- `composables/useWhatIfModelManager.ts`는 schema별 AbortController/request sequence, 기존 목록 보존
  refresh, expanded row, delete dialog target, pending/error, 실패-only exact retry와 scope dispose를
  소유한다.
- What-If API는 model status/list와 delete mutation response를 runtime parser로 검증하고 목록 요청에
  workflow AbortSignal을 전달한다.
- UI는 공용 `ActionDialog`로 단건/전체 삭제를 확인하고, partial failure 때 성공 모델은 목록에서 제거한
  채 실패 target과 error를 dialog에 유지한다. row 상세는 native button으로 열고 모바일에서 header와
  row가 겹치거나 root overflow를 만들지 않는다. What-If panel의 narrow header는 제목/닫기와 단계
  navigation을 두 행으로 분리하고 단계 버튼을 자체 horizontal-scroll strip에 유지해 label을 세로로
  압축하지 않는다. ResizeObserver와 current-step watch는 active button만 strip 안으로 이동시키며
  component 종료 시 observer를 해제한다.

순수 계약은 malformed model/status/metrics, input 불변, partial delete projection, 성공-only 제거를
검증한다. 브라우저는 list 503→기존 목록 보존 retry, 단건 Escape→0 request와 503→same target retry,
전체 partial failure→failed-only retry, keyboard detail, 390×844 dialog/row geometry와 page error 0을
실제 조작한다.

#### Ontology What-If simulation lifecycle

`StepSimulation`의 snapshot→edit→simulate→profile-save 흐름을 API parser, pure request/presentation policy,
operation lifecycle, presentational UI로 분리한다.

- `application/simulationPolicy.ts`는 changed-variable/intervention projection, request snapshot, trace/timeline/
  delta dedupe와 scenario profile payload를 순수하게 소유한다.
- `application/useWhatIfSimulation.ts`는 schema/filter/date별 AbortController와 request sequence, 마지막 정상
  snapshot 보존, simulation/profile frozen retry, operation별 pending/error와 managed profile-success 정리를
  소유한다. 화면에 소비되지 않는 trace-delay animation state는 제거한다.
- What-If API는 snapshot/simulate/scenario response를 실제 domain-layer schema로 runtime 검증하고 세
  요청 모두 AbortSignal과 request/response identity 검사를 지원한다.
- UI는 API를 직접 import하지 않고 날짜 commit 전환, 입력 label, operation별 retry, pending disable을
  표현하며 390×844에서 header/action/form을 쌓고 결과 table만 내부 가로 scroll한다.

순수 계약은 malformed response, stale date/schema, refresh 보존, intervention/profile input 불변, simulate
503 exact retry와 profile 503 exact retry를 검증한다. 브라우저는 snapshot 날짜 503→기존 날짜/입력 보존,
simulation 503→same payload retry, profile 503→same payload retry, session headers, 390×844 geometry와
page error 0을 실제 조작한다.

#### Ontology Behavior editor lifecycle

`BehaviorDialog`의 draft·타입별 payload·AI prompt·외부 endpoint test·create/update/delete 흐름을 domain
policy, operation lifecycle, presentational dialog로 분리한다.

- `application/behaviorDraft.ts`는 create/edit draft, input toggle, REST/DMN/Python/JavaScript 검증,
  Behavior payload, code-generation prompt, 외부 test JSON/body와 결과 문자열 projection을 입력 비변형으로
  소유한다.
- `application/useBehaviorEditor.ts`는 dialog target generation, operation별 AbortController/request sequence,
  generate/save/test/delete target snapshot, exact retry, success-before-emit, close/dispose cleanup을 소유한다.
- Ontology API는 실제 domain-layer create/update/delete/generate-code 응답을 runtime parser로 검증하고
  내부 요청에 AbortSignal을 전달한다. 외부 endpoint test는 runtime header를 전달하지 않는 별도 경계로
  유지하되 AbortSignal과 frozen request를 받는다.
- UI는 API·직접 JSON parse를 소유하지 않고 이름 있는 dialog와 공용 `ActionDialog`, label/focus/Escape/
  busy state, native type/input controls, operation별 error/retry만 표현한다. mobile은 body scroll과 stacked
  action을 사용하며 dialog/header/footer는 viewport 안에 고정한다.

순수/수명주기 계약은 malformed success/code, create/edit draft 불변, 타입별 invalid payload, stale target,
generate/save/test/delete 503 exact retry와 abort를 검증한다. 브라우저는 create save 503→동일 payload,
external test JSON 오류·503→동일 URL/method/body, generate 503→동일 prompt, delete Escape→0 request와
503→동일 target, runtime headers의 내부 요청 보존·외부 요청 비전달, 1920×1080·390×844 focus/geometry/
overflow를 실제 조작한다.

#### MultiLayer local graph history lifecycle

Viewer 안의 undo/redo JSON 복제·stack·shortcut 책임을 `model/graphHistory.ts`와
`composables/useOntologyGraphHistory.ts`로 이동한다.

- 순수 model은 node/relationship 중첩 값의 참조를 공유하지 않는 snapshot과 editable target 판정을
  소유한다.
- composable은 최대 50개 undo/redo stack, checkpoint 뒤 redo 폐기, undo/redo commit, schema 전환 clear,
  restore 뒤 단 한 번의 renderer callback을 소유한다.
- Viewer는 mutation 직전 `checkpoint()`, schema 적용 뒤 `clear()`, document keydown 전달만 수행한다.
- shortcut은 graph context에서만 event를 소비하며 form/contenteditable의 native undo를 보존한다.

단위 계약은 nested snapshot 불변, 50개 eviction, branch mutation redo 폐기, empty stack, restore callback,
form/contenteditable shortcut 비침범을 검증한다. 기존 Ontology 실제 브라우저 회귀에 더해 전용 브라우저는
노드 추가→Ctrl+Z→Ctrl+Y와 rename input의 Ctrl+Z 비침범을 실제 DOM/Cytoscape 결과로 확인한다.

#### MultiLayer local graph mutation policy

Viewer 안의 node 추가·rename·layer 변경과 relation draft·편집 배열 조작을 기존
`model/localGraphMutation.ts`의 단일 순수 정책으로 이동한다. 별도 model을 더 만들어 삭제와 편집의
책임을 다시 나누지 않는다.

- node 생성은 `{layerId, layerName, position, now}`를 입력받아 기존 ID·이름 규칙을 재현하고 새 배열과
  새 node를 반환한다. rename/layer 변경은 target 부재·빈값·동일값을 명시적인 무변경 결과로 반환한다.
- relation draft는 source/target 존재, 자기 관계, 같은 방향 중복을 한 곳에서 검증하고 clock을 주입받아
  ID를 만든다. edgehandles와 context-menu는 같은 draft를 dialog state에만 보관한다.
- confirm은 draft type/description을 정규화한 뒤 단 한 번 history checkpoint와 graph/Cytoscape commit을
  수행한다. cancel은 transient Cytoscape 요소와 dialog draft만 폐기하고 graph/history는 바꾸지 않는다.
- 기존 relation 편집은 field mapping 검증을 통과한 뒤 순수 update 정책을 사용하며 no-op은 checkpoint와
  renderer update를 만들지 않는다.
- Viewer는 policy result를 ref에 할당하고 Cytoscape element data·selection·edgehandles를 동기화하는
  orchestration만 유지한다. 순수 정책은 Vue/Cytoscape/Date.now에 의존하지 않는다.

단위 계약은 입력 불변, node ID/기본 이름, trim/blank/not-found/no-op, layer/label 동시 변경,
missing/self/duplicate relation 거부, draft cancel 무변경, relation field 정규화와 no-op을 검증한다.
기존 Ontology 브라우저 회귀에 node 추가·rename·layer 변경·두 relation 진입점의 confirm/cancel·undo/redo
시나리오를 추가하고, 구조 검사는 Viewer의 직접 `nodes.value[index]`·`push` 및
`relationships.value[index]`·`push` 재유입을 차단한다.

#### MultiLayer document generation lifecycle

문서 생성의 input draft/PDF/용어집 조회/request identity와 exact retry는
`application/documentGeneration.ts` 및 `composables/useOntologyDocumentGeneration.ts`로 이동한다.

- 순수 application 정책은 text/url/pdf draft와 glossary 선택을 검증하고, PDF base64를 포함한 immutable
  request target을 만든다. PDF 형식 판정과 선택 상태도 Viewer 밖에서 결정한다.
- composable은 용어집 read sequence/AbortController와 generation sequence/AbortController를 각각
  소유한다. mode 전환·닫기·새 실행·취소·unmount에서 맞는 요청만 중단하고 stale 결과를 폐기한다.
- generation failure는 frozen target을 보존하며 exact retry와 input-edit action을 분리한다. retry는
  현재 draft를 다시 읽거나 PDF를 다시 인코딩하지 않는다.
- Viewer는 progress/event 표시와 성공 schema의 graph/Cytoscape commit, 독립적인 후속 Neo4j 저장만
  조립한다.
- Ontology generation API는 다른 Ontology route와 동일한 runtime session headers, AbortSignal, strict
  event/terminal 계약을 사용한다. Catalog glossary read도 AbortSignal을 받는다.

단위 계약은 input type별 body, glossary 전체/선택, PDF validation/한 번 인코딩, immutable target,
glossary stale/abort/error preservation, stream cancel/stale/exact retry/terminal error를 검증한다.
브라우저는 glossary 503→동일 GET 재시도, generation 503 또는 error event→form 변경 뒤 frozen body
재시도, input edit, cancel 뒤 late event 폐기, runtime headers와 성공 graph/후속 save 상태를 실제
조작한다. 구조 검사는 Viewer의 generation AbortController/request body/FileReader와 glossary 오류
삼키기 재유입을 차단한다.

거대 store/component는 줄 수만 줄이기 위해 임의로 쪼개지 않는다. 먼저 외부 props/emits/store action과
API·화면 결과를 고정하고, 메인 흐름을 단순하게 만드는 순수 정책·projection 또는 독립 수명주기만
추출한다. 각 추출은 정상·빈값·경계·중복·순서·비가시 상태를 계약 테스트로 잠근 뒤 store/component를
얇은 orchestration으로 교체하고 전체 타입·구조·브라우저 회귀를 다시 통과해야 한다.

MultiLayer Ontology 필터는 UI가 flat key와 direct/cascade 상태를 함께 변경하는 현재 구조를 폐기한다.
`application/ontologyFilterProjection.ts`가 node→field 중첩 direct filter와 관계 field mapping만 받아
effective/cascade/conflict를 입력 비변형으로 다시 계산하고, composable이 dialog draft와 distinct 요청의
abort·sequence·exact retry를 소유한다. Viewer는 draft 표시, confirm/cancel 조립, Cytoscape class 투영과
확정 뒤 단 한 번의 node-data reload만 맡는다. distinct 응답은 domain API runtime parser를 통과하고
session headers와 signal을 받는다. 공개 저장소와 Gateway route에서 실제 Domain Layer 소스를 찾을 수 없어
query 표현을 검증할 수 없는 date/range는 추측 구현하지 않고 disabled reason으로 명시한다.

Schema modeling의 첫 책임 슬라이스는 Catalog 관계와 캔버스 위치·가시성으로 Vue Flow edge를 만드는
순수 projection이다. 사용자 관계의 cardinality marker/label, DDL·code·user 스타일, 좌우 handle,
잘못된 column pair 제외, edge 중복 제거 및 원래 순서를 보존한다. store의 공개
`updateEdgesFromRelationships` action과 UI 상호작용 계약은 바꾸지 않는다.

Catalog가 관련 관계를 빈 배열로 반환하거나 요청이 실패했을 때 `_id` 이름으로 관계를 추정해서는 안 된다.
빈 배열은 실제 관계 없음으로 유지하고, 실패는 재시도 가능한 화면 오류로 노출한다. 추정 테이블을 자동으로
추가하던 기존 fallback은 API 실패를 성공처럼 보이게 하므로 제거 대상 결함이다.

같은 from/to/type이라도 DDL·code·user source가 다르면 서로 다른 provenance와 화면 스타일을 가진 별도
관계다. source까지 identity에 포함하고, 동일 identity가 여러 응답에 나뉜 경우 column pair만 안정적으로
병합한다. 응답 순서와 첫 관계 위치는 보존하며 중복 pair의 최신 이름은 반영한다.

Analyzer 진행·오류 상태는 store에 보존하되 전역 overlay는 그 상태를 실제 소비하는 upload/graph 화면에서만
렌더한다. 다른 기능에서 자동으로 축소한 badge를 띄워 해당 화면의 미니맵·범례·조작을 가리지 않는다.

### 앱 설정 draft와 위험 작업 슬라이스

`app/settings/SettingsModal.vue`는 설정 표시와 조립만 소유한다. localStorage/runtime store에서 편집
초안을 만들고 유효한 UML 깊이·테마·provider를 적용하는 정책은 app-owned application 모듈로 분리한다.
사용되지 않는 그래프 통계와 변경 감지 상태는 가짜 책임이므로 제거한다.

새 세션은 navigation과 Analyzer의 메모리 상태를 초기화하는 로컬 작업이고, 전체 삭제는 Catalog DELETE가
성공한 뒤 Analyzer가 초기화되는 원격 mutation이다. 두 작업은 같은 native confirm 분기로 합치지 않고
명시적 action identity를 가진 alertdialog에서 실행한다. 원격 실패 시 dialog 안에 오류와 재시도를
유지하고 설정 modal을 닫거나 로컬 성공을 가장하지 않는다. pending 중에는 닫기·Escape·중복 요청을 막고,
취소 또는 실패 뒤 닫기는 원래 danger action으로 focus를 복귀한다.

브라우저 계약은 새 세션 확인 취소, Escape focus 복귀, 전체 삭제 503 후 같은 DELETE 재시도, 성공 전
dialog/modal 유지, 성공 뒤 modal 종료와 요청 횟수, 390×844 geometry·가로 overflow를 검증한다.

### Text2SQL 히스토리 상태·상호작용 슬라이스

`domains/text2sql/state/history.ts`는 query snapshot과 mutation 성공 커밋만 소유한다. 조회 sequence와
현재 search/status를 보존해 늦은 과거 응답을 폐기하고, 다음/이전 페이지도 같은 filter를 사용한다. 삭제
API 실패는 console 뒤 `false`로 바꾸지 않고 호출자에게 전파하며, item·total·selectedItem은 성공 뒤에만
원자적으로 변경한다.

`HistoryPanel.vue`는 검색·선택·삭제 조립만 남긴다. raw timeout은 managed lifetime으로 교체하고, 선택
surface와 내부 action을 중첩 control 없이 분리한다. 단건·전체 삭제는 action identity와 대상 질문을 가진
전용 alertdialog가 pending/error/Escape/focus 복귀를 소유한다. export control은 실제 SQL이 있는 항목에만
노출되므로 도달 불가능한 native alert와 debug console을 제거한다.

계약은 조회 race, filter 보존 페이지 이동, 단건/전체 mutation 성공 전 불변, 실패 전파를 unit에서
검증한다. 브라우저는 키보드 선택, 세부 펼치기, 삭제 취소, DELETE 503 뒤 동일 대상 재시도, 전체 삭제
identity, 요청 횟수와 390×844 geometry를 검증한다.

### Text2SQL 결과→Ontology instance workflow 슬라이스

`domains/text2sql/ui/Text2SqlTab.vue`는 SQL 결과 payload를 만들고 명시적 event로 내보낼 뿐 Ontology
schema/API나 cross-service mutation을 import하지 않는다. 앱과 Ontology embedded 소비자는
`workflows/text2sql-ontology`의 public wrapper를 사용한다. wrapper는 Text2SQL 결과와 workflow dialog를
조립하고 기존 props·feature id·embedded 동작을 그대로 전달한다.

workflow dialog는 schema 목록/상세 request sequence, mapping draft, Materialized View→bulk-create
orchestration, pending/error/partial-success/success를 소유한다. schema metadata 실패는 비어 있는 성공으로
보이지 않고 단계별 재시도를 제공한다. MV 실패는 이미 검증된 정책대로 bulk-create를 계속하되 warning과
`materialized_view: null`을 표시하고, bulk-create 실패는 전체 실패로 유지한다. 성공/경고는 native alert가
아닌 dialog status에 남으며 사용자가 결과를 읽고 명시적으로 닫는다.

구조 계약은 Text2SQL domain의 Ontology import 0과 앱/embedded 소비자의 workflow entry 사용을 확인한다.
브라우저는 목록/상세 실패·재시도, payload 보존, MV 503 부분 성공, bulk 실패, focus/Escape, 1920×1080과
390×844 geometry를 검증한다.

### Text2SQL 본체 상태 수명주기 슬라이스

최근 질문의 runtime parse·trim·dedupe·상한·저장 실패 정책은 `application/recentQueries.ts`로 분리하고
UI는 결과와 warning만 렌더링한다. SQL diff highlight와 embedded/navigation 자동 submit은 공용 managed
timeout 수명주기를 사용해 탭 해제 뒤 callback이 남지 않게 한다.

결과 피드백은 API 성공 후에만 제출 완료 key를 commit한다. 오답은 사유를 선택 입력하는 전용 dialog가,
맞아요 즉시 제출 실패는 같은 dialog의 오류·재시도 상태가 소유한다. dialog는 대상 question·approved
identity·notes payload를 유지하고 pending 중 닫기나 중복 제출을 막으며 Escape/focus/모바일 수명주기를
제공한다. 구조 계약은 Text2SQL 본체의 native dialog·raw timer·직접 JSON parse·debug console 재유입을
차단하고, unit은 저장 정책을, 브라우저는 오답 취소·503·동일 payload 재시도·성공 commit을 검증한다.

### 앱 알람 수명주기 슬라이스

`app/notifications/AlarmToast.vue`는 domain alarm stream을 표시하는 app-shell adapter로 유지하되 raw
timeout 대신 key 기반 managed lifetime을 사용한다. reconnect, alarm auto-dismiss, acknowledge-dismiss를
서로 다른 key로 소유하고 수동 제거 시 관련 timer를 취소한다. stream abort와 timer dispose는 component
종료에 함께 일어난다.

연결 실패는 stream 기능이 켜진 경우에만 작은 재연결 status로 표시한다. acknowledgement는 알람 ID별
pending/error를 소유해 중복 요청을 차단하고, backend 성공 후에만 acknowledged 상태와 지연 제거를
commit한다. 구조 계약으로 raw timer·console-only error·미표시 pending의 재유입을 막는다.

### Security 관리 수명주기 슬라이스

사용자·역할 목록 조회, editor 저장, 삭제 상태를 분리한다. create/update는 editor 내부 pending/error를
유지하고 성공 후에만 닫고 목록을 갱신한다. 삭제는 공용 `SecurityActionDialog`가 대상·pending·error를
소유하며 실패 뒤 같은 UID/role name 요청만 재시도한다.

사용자·역할 editor와 감사 로그 상세는 dialog semantics, label 연결, 최초 focus, Escape, focus trap,
trigger focus 복귀를 제공한다. 실제 Security client에 update-role endpoint가 없으므로 기존 alert-only
가짜 수정 흐름은 제거하고 수정 control을 이유가 있는 disabled 상태로 표시한다. 390×844 브라우저 계약은
editor 취소, 사용자/역할 DELETE 503→동일 대상 재시도, 성공 전 목록 불변, 역할 수정 비활성, dialog
geometry와 overflow를 검증한다.

### OLAP 작업 상태·파괴 작업·stream 수명주기 슬라이스

`domains/olap/state/olap.ts`의 단일 `loading/error`를 큐브 목록, 큐브 선택, pivot query/preview, direct
sync 상태로 분리한다. 목록·선택·preview는 request sequence를 사용해 늦은 과거 응답을 폐기하고,
application/UI 호출자가 실패를 정확히 소유할 수 있도록 오류를 삼키지 않는다.

큐브 삭제 순서는 `application/cubeDeletion.ts`가 소유한다. 단건은 큐브 metadata 성공 삭제 뒤 ETL config
정리만 시도한다. 현재 backend에는 큐브별 DW 소유 테이블 계약이 없으므로 이름 패턴과 전체 DW 목록을 섞어
“관련 테이블”로 삭제하던 추정 경로를 제거한다. 전체 큐브 삭제만 사용자가 명시적으로 선택한 경우
`tables: []`의 전체 DW 삭제를 실행한다. primary mutation과 후속 cleanup·목록 refresh는 별도 결과이며,
cleanup/refresh 실패가 이미 성공한 삭제를 되돌리거나 같은 DELETE 재시도를 유도하지 않는다.

`application/operationResults.ts`는 cube/ETL/Airflow 응답의 `success`를 단일 정책으로 검증한다.
Cube Designer의 config→deploy→initial run과 Pivot editor의 save/redeploy는 이 정책을 사용하고 실제 완료
단계만 화면에 표시한다. ETL config와 저장 script 조회 실패는 빈 초안·미저장으로 바꾸지 않으며,
사용자가 재시도하거나 새 config 초안을 명시적으로 시작한다.

native EventSource는 session headers를 전달할 수 없으므로 shared fetch-SSE reader와 AbortController 기반
OLAP stream control로 교체한다. 새 generation/execution은 이전 연결을 취소하고, cancel·unmount·terminal
event에서 연결과 실행 상태를 함께 종료한다. malformed event, network error, terminal 없는 EOF는 visible
failure로 남는다.

큐브 삭제·전체 재적재·DAG 재배포는 OLAP action identity를 가진 alertdialog를 사용한다. editor도 label,
initial focus, Escape, focus trap, pending close 차단과 focus 복귀를 제공한다. success timer는 managed
lifetime으로 바꾸고, desktop/390×844 브라우저 계약은 단건 삭제의 DW 요청 0, 전체 삭제 옵션, 503 exact
retry, `success:false`, config/script load failure, stream cancel/terminal, dialog geometry와 overflow를
검증한다.

### Observability mutation·삭제 dialog 수명주기 슬라이스

Agent Scheduler `/profiles`와 Text2SQL `/events/rules`는 이미 서로 다른 domain 공개 경계를 통해
Observability workflow에서 조립한다. 이번 슬라이스는 backend 소유권을 다시 합치지 않고 두 목록의 공통
사용자 mutation 수명주기만 workflow application 정책으로 분리한다.

mutation 정책은 `backend mutation → 로컬 성공 commit → 목록 refresh` 순서를 고정한다. primary mutation
실패는 기존 목록을 유지하고 호출자에게 전파한다. primary가 성공한 뒤 refresh가 실패하면 삭제된 항목이나
toggle 결과를 로컬에 유지하고 별도 refresh warning을 반환한다. 이 상태에서 destructive dialog는 닫히며,
이미 성공한 DELETE를 “다시 시도” 대상으로 남기지 않는다.

WatchAgent 프로필 카드는 중첩된 `button > role=button` 구조를 제거하고 selection button과 toggle/delete
button을 형제 control로 분리한다. WatchAgent와 EventDetection 삭제는 대상 ID/name을 가진 하나의
workflow-owned alertdialog가 pending/error/Escape/focus trap/trigger focus 복귀를 소유한다. 브라우저
계약은 삭제 취소, DELETE 503 뒤 동일 ID 재시도, 성공 전 목록 불변, 성공 뒤 refresh 503에서도 로컬 삭제
유지와 DELETE 비반복, toggle 성공·refresh 실패 local commit, 키보드 선택, 390×844 dialog geometry와
document overflow를 검증한다.

### Shared destructive action dialog primitive 슬라이스

Security, OLAP, Observability에서 반복 검증된 alertdialog의 focus/Escape/pending/error/mobile 정책은
backend 지식이 없는 `shared/components/ActionDialog.vue`가 소유한다. 소비자는 `dialogId`, title,
message, confirm/pending label, 선택 옵션과 mutation state만 전달한다. shared primitive는 domain을
import하지 않으며 모든 표시와 focus 복귀를 props/emits 계약으로 수행한다.

`SecurityActionDialog`, `OlapActionDialog`, `ObservabilityActionDialog` 소비자를 같은 슬라이스에서 새
primitive로 직접 이동하고 옛 파일은 삭제한다. alias/re-export wrapper는 만들지 않는다. 기존 Security,
OLAP, WatchAgent, EventDetection의 취소·503 exact retry·focus·390×844 회귀와 build boundary를 모두
재실행해 공용화가 결과를 바꾸지 않았음을 검증한다.

### Data Lineage 조립·DAG 재배포 수명주기 슬라이스

`workflows/data-lineage`는 Catalog의 Neo4j lineage와 OLAP의 ETL lineage를 함께 표시하는 명시적인
cross-domain workflow다. 두 domain API 소유권은 그대로 유지하고, 응답을 공통 graph node/edge/stat로
projection하고 중복·부분 실패를 병합하는 정책만 workflow `application`으로 이동한다. UI는 두 backend
응답 shape와 성공 source 수를 직접 세지 않는다.

- Catalog lineage 응답은 domain API 경계에서 node/edge/stats identity와 숫자 계약을 runtime 검증한다.
- workflow query는 각 load에 sequence를 부여해 늦게 끝난 이전 load가 최신 graph·warning·error를
  덮지 못하게 한다. 한 source 성공은 graph와 source별 warning을 반환하고 둘 다 실패한 경우에만 실패한다.
- ETL detail의 DAG 재배포는 action dialog를 열 때 backend lineage가 명시한 `cube_name`을 고정한다.
  `ETL_…` 노드 이름을 cube로 추정하지 않으며 `cube_name`이 없는 node는 이유를 표시한 disabled action으로
  남긴다. 취소는 요청 0건, `success:false`와 HTTP 503은 같은 dialog의 오류, 재시도는 같은
  `POST /olap/api/airflow/etl/{cube}/deploy?force=true`만 실행한다. 성공 뒤에만 dialog를 닫고 DAG ID와
  backend가 제공한 Airflow URL을 commit한다.
- DAG 성공 status와 Vue Flow viewport 지연 적용은 key 기반 managed timer로 교체한다. 새 layout은 이전
  viewport timer를 취소하고 component scope 종료 시 callback이 남지 않는다.
- 390×844에서 detail은 접근 가능한 close control을 가진 viewport 내부 panel로 유지하며 재배포 dialog의
  focus/Escape/trigger 복귀와 document overflow 0을 보장한다.

순수 계약은 Catalog runtime parser, 두 source projection·dedupe·부분/전체 실패, stale load 배제를
검증한다. 브라우저는 ETL node 선택, DAG 취소, 503 뒤 동일 cube exact retry, `success:false`, 성공 commit,
Airflow link와 390×844 panel/dialog geometry를 실제 사용자 조작으로 검증한다.

### Schema Modeling Catalog 계약·mutation 수명주기 슬라이스

`workflows/schema-modeling`은 Catalog table/column/relationship, Data Fabric row query, Ontology
ObjectType을 조립하는 cross-domain workflow다. 이번 슬라이스는 backend를 변경하지 않고 Catalog 원문
계약을 domain API 경계에서 runtime 검증하며, 거대 store와 detail UI에 섞인 identity·mutation·timer
책임을 분리한다.

- Catalog schema API는 모든 path segment를 encode하고 현재 `X-Neo4j-*` session header를 전달한다.
  설명 저장은 runtime 설정의 LLM key를 Catalog가 요구하는 `X-API-Key`로 명시 변환한다. table/column/
  relationship 목록과 `created:true`·`updated:true`·양의 `deleted` mutation 응답은 `unknown`에서
  runtime parser를 통과한다. malformed HTTP 200은 성공이 아니다.
- `datasource + schema + table name`을 canonical identity로 사용한다. column cache, canvas node,
  선택·편집·relationship target은 이 identity를 끝까지 보존한다. Catalog relationship 응답에는
  datasource가 없으므로 같은 schema/name이 여러 datasource에 걸쳐 모호하면 임의 node에 edge를
  연결하거나 mutation target으로 선택하지 않고 visible unsupported state로 남긴다.
- Catalog column backend는 schema `""`와 `public`을 이름/FQN fallback으로 처리한다. 프론트는 정확한
  조회가 0건이라고 schema를 비워 재요청하지 않는다. 이름 기반 legacy cache와 첫 번째 동일 이름 table
  fallback을 제거하고, 0건과 HTTP 실패를 구분해 같은 identity로만 재시도한다.
- description save와 relationship create는 operation-specific pending/error를 소유하며 실패 시 draft를
  보존한다. relationship delete는 dialog open 시 six-field target을 동결하고, HTTP 실패·`deleted:0`은
  같은 dialog의 오류, 재시도는 같은 DELETE만 실행한다. 성공한 mutation 뒤 refresh 실패는 이미 성공한
  mutation을 반복하지 않고 local commit과 별도 refresh warning으로 분리한다.
- canvas clear와 relationship delete는 shared `ActionDialog`를 사용한다. 취소는 mutation 0건이고,
  Escape·focus trap·trigger 복귀·pending close 차단을 공용 계약으로 유지한다. raw debounce/update timer는
  key 기반 managed lifetime으로 교체한다.
- unit은 schema response parser, exact request body/header, duplicate identity, ambiguous relationship,
  exact retry와 success-before-commit을 검증한다. 브라우저는 390×844에서 description 503→same-body retry,
  relationship create target schema 보존, delete cancel/503/`deleted:0`/same-query retry, clear cancel,
  focus·geometry·overflow를 실제 사용자 조작으로 검증한다.

### Ontology 노드 데이터소스 카탈로그 슬라이스

`MultiLayerOntologyViewer`의 개별 노드 연결 다이얼로그는 Text2SQL의 datasource → schema → table
메타데이터와 ObjectType materialized view를 조회한다. 자연어 검색용 datasource와 수동 선택의 source
kind는 서로 다른 상태다. UI 전용 ObjectType 선택값 `__ontology__`를 backend datasource로 전송하거나,
탭 전환으로 자연어 `/ask` 요청에 흘려보내지 않는다.

ObjectType 목록 API `/text2sql/meta/objecttypes`는 backend 원문상 실제 MindsDB datasource가 필수다.
ObjectType을 선택한 사용자는 실행 datasource를 명시적으로 선택해야 하며, 단 하나만 존재할 때만 자동
선택한다. 목록·확정 payload와 노드의 `dataSourceSchema.datasource`는 이 실제 값을 끝까지 보존한다.

Datasource/schema/table/ObjectType 조회 실패는 성공한 빈 목록과 구분한다. 단계별 오류와 재시도는 하나의
workflow-owned catalog loader가 소유하고, 빠른 선택 변경에서 늦게 끝난 이전 응답이 현재 목록을 덮지
않도록 요청 세대를 검증한다. 정상 빈 목록은 오류 없이 별도 empty state로 표시한다.

이 슬라이스의 계약은 datasource 목록 실패→재시도, 단일 datasource 자동 선택, 물리 테이블 projection,
ObjectType 실행 datasource 필수/보존, UI sentinel 비전송, 선택 경합, 키보드 선택과 확정 payload를
포함한다.

### Ontology 저장 스키마 수명주기 슬라이스

`MultiLayerOntologyViewer`의 이름 변경·삭제·활성화/상세 조회는
`domains/ontology/application/useOntologySchemaLifecycle.ts`의 domain-owned 수명주기로 분리한다.
단일 Ontology backend의 CRUD를 workflow 소유로 잘못 올리지 않는다. UI는 요청 중인 스키마 ID, 실패
단계, 재시도 가능 상태를 소비하고 직접 API 순서와 부분 성공을 추론하지 않는다.

- 이름 변경은 공백 이름을 전송하지 않고, Enter와 blur가 연속 발생해도 같은 요청을 한 번만 전송한다.
  실패하면 편집값과 포커스 가능한 입력을 유지하고 사용자가 수정하거나 다시 시도할 수 있어야 한다.
- 삭제는 응답의 `success`를 확인한 뒤에만 로컬 목록·최근 기록·현재 캔버스를 제거한다. 삭제 성공 뒤 목록
  새로고침 실패는 삭제 실패로 되돌리지 않으며, 이미 삭제한 항목을 보존 목록에 다시 표시하지 않는다.
- 불러오기는 `activate → detail → 화면 적용 → 최근 기록` 순서를 지킨다. activate 또는 detail이 실패하면
  기존 캔버스를 유지하고 최근 기록을 갱신하지 않는다.
- activate 성공 뒤 detail이 실패한 부분 성공은 별도 단계로 표시한다. 이 상태의 재시도는 서버 mutation인
  activate를 반복하지 않고 detail 조회부터 재개한다.
- rename/delete/load가 진행 중일 때 같은 destructive action과 충돌하는 목록 조작을 비활성화하고
  `aria-busy`, live error/success 상태를 화면에 드러낸다. `alert`와 조용한 `catch`를 상태 계약으로
  사용하지 않는다.

계약 테스트는 중복 rename, 실패 입력 보존, `success: false`, 삭제 성공 후 refresh 실패, activate 실패,
activate 성공/detail 실패/상세 재시도, 빈 detail, 최근 기록 커밋 시점을 포함한다. 브라우저 검증은
키보드 이름 변경, 삭제 실패→재시도, 부분 load 실패→재시도, 기존 캔버스 보존과 요청 횟수를 확인한다.

### Ontology extraction 스키마 선택기 슬라이스

`domains/ontology/ui/extraction/SchemaSelector.vue`는 같은 schema API를 다시 직접 조립하지 않고 domain
lifecycle을 재사용한다. 목록 조회 상태는 lifecycle mutation과 분리하되, 실패 시 이전 목록을 유지하고
성공한 빈 목록과 구분한다.

- 선택은 activate와 detail이 모두 성공한 뒤에만 parent store에 적용한다. activate 성공/detail 실패
  재시도는 detail부터 재개하며 기존 store schema를 유지한다.
- 삭제 대상과 active 여부는 mutation 전에 고정한다. 성공 뒤 목록 응답이 active ID를 바꾸더라도 원래
  active schema를 삭제한 경우 parent store를 반드시 reset한다.
- 삭제 실패는 브라우저 confirm/alert가 아니라 이름을 포함한 dialog 안에 유지한다. pending 동안 닫기와
  중복 삭제를 막고, 비활성 항목 삭제 성공 뒤 목록 refresh 실패 시 로컬에서 제거한 항목을 되살리지 않는다.
- 목록 행은 중첩 버튼 없는 native selection/delete controls로 제공하고 expanded/busy/current 상태,
  오류 live region, modal label/focus, document click listener 해제를 포함한다.

브라우저 계약은 selector mount 목록 실패→재시도, 키보드 선택, activate 성공/detail 실패→detail-only
재시도, 기존 store 보존, active 삭제 실패→재시도→store reset, listener/page-error 0을 검증한다.

### Ontology extraction 시작 Wizard 스키마 발견 슬라이스

`OntologyWizard.vue`의 저장 스키마 목록은 `SchemaSelector`와 동일한 Ontology query다. 두 UI가 각각
목록 요청·보존·실패 규칙을 구현하지 않고 `domains/ontology/application/useOntologySchemaLibrary.ts`를
공유한다. API boundary는 목록 응답의 필수 배열과 item identity를 runtime에서 검증한다.

- 최초 목록 실패와 성공한 빈 목록을 구분한다. 갱신 실패는 이미 성공한 목록과 active ID를 보존하고
  사용자가 명시적으로 재시도할 수 있게 한다.
- 저장 스키마 카드는 native button으로 제공한다. 선택 중 다른 카드·새 생성 입력의 충돌 동작을 막고
  `aria-busy`, visible focus, live error를 제공한다.
- Wizard 선택도 `activate → detail → store apply → binding` 순서를 지킨다. activation 또는 detail 실패
  전에는 기존 store와 wizard step을 바꾸지 않으며, activation 성공/detail 실패 재시도는 detail만 반복한다.
- 사용되지 않는 `schema-selected` emit과 조용한 `console.error` 경로를 제거한다. 목록·선택 실패는 실제
  화면 상태이며 fallback empty/success로 바뀌지 않는다.

계약 테스트는 목록 응답 parsing, 성공 뒤 refresh 실패 보존, active 항목 제거, 동시 refresh 차단을
포함한다. 브라우저는 Wizard 최초 목록 503→재시도, 키보드 선택, activation 503→재시도, store 커밋 시점,
request count, 실제 1920×1080 상태를 검증한 뒤 기존 selector 흐름을 계속 수행한다.

### Ontology Wizard 도달 불가능한 binding 화면 제거 슬라이스

`OntologyTab`은 schema가 존재하고 `wizard.step === 'binding'`이 되는 즉시 Wizard를 제거하고 실제
Ontology canvas/toolbar/`InstancePanel`을 렌더한다. 따라서 Wizard 내부의 Step 3 template과
`startDataBinding`/`startMonitoring`은 사용자에게 도달할 수 없다. 두 함수도 API를 호출하지 않고
`console.log`, browser `confirm`, “향후 구현” 주석만 실행하므로 보존할 기능이 아니라 가짜 dead code다.

- 저장 스키마 선택과 새 스키마 확정이 binding 상태로 이동해 기존과 동일하게 canvas를 여는 동작은 유지한다.
- 실제 명시적 노드 datasource 조회·선택·PUT binding은 canvas의 `InstancePanel` 책임으로 둔다. 근거 없는
  자동 매핑 알고리즘이나 backend에 없는 monitoring-start capability를 만들지 않는다.
- 도달 불가능한 template, MV 체크 상태, confirm/log 함수, 전용 스타일과 아이콘만 제거한다.
- 구조 계약은 Wizard에 해당 가짜 함수·browser confirm·dead Step 3 markup이 재유입되지 않도록 고정한다.
  브라우저 회귀는 완전 schema load 뒤 Wizard가 사라지고 기존 canvas/selector가 나타나는 현재 결과를
  계속 검증한다.

### Ontology InstancePanel datasource binding 슬라이스

실제 노드 datasource 연결은 `domains/ontology/ui/extraction/InstancePanel.vue`에서 catalog 조회,
명시적 table 선택, `PUT /ontology/nodes/{id}/datasource`, instance 조회, DELETE 해제를 순서대로
조립한다. 이 UI는 API 응답 구조나 보존 정책을 직접 추측하지 않고 domain application query와 store
action을 사용한다.

- datasource catalog 응답은 `{ tables: [{ schema, name, description? }] }`를 runtime에서 검증한다.
  문자열 table 호환 분기나 schema 없는 항목은 허용하지 않는다.
- catalog 최초 실패는 성공한 빈 목록과 구분한다. 갱신 실패는 이전 성공 목록을 보존하며, 동시 갱신은
  중복 요청을 만들지 않는다.
- table identity는 `schema + name`이며 같은 이름의 서로 다른 schema를 별도 항목으로 선택한다. binding
  body에도 두 값을 보존하고 PUT 성공 뒤에만 로컬 노드를 갱신한다.
- instance 조회 실패는 빈 결과로 바꾸지 않고 재시도 가능한 상태로 표시한다. 조회 제한을 실제 요청에
  전달하며 응답의 노드·datasource·count·column·row 구조를 runtime에서 검증한다. 늦게 완료된 이전
  노드·제한 요청은 최신 결과를 덮어쓰지 않는다.
- DELETE 실패 시 기존 binding과 instance 상태를 보존한다. 성공한 경우에만 둘을 지우고 catalog 선택
  화면으로 돌아간다.
- table 항목, 재시도, bind/unbind는 native control과 busy·pressed·focus·live error 상태를 제공한다.

계약 테스트는 catalog runtime parser, 실패 뒤 목록 보존, 동시 요청 차단과 늦은 instance 응답 배제를
포함한다. 브라우저는 catalog 503→재시도, 같은 이름의 schema별 항목, PUT 503→재시도, instance
503→재시도와 limit, DELETE 503→재시도를 실제 클릭·키보드로 검증한다.

### Ontology SQL instance workflow 소유권 슬라이스

`InstancePanel`은 Ontology backend의 datasource binding과 instance 조회만 소유한다. Text2SQL 자연어
질의·Direct SQL 결과, Data Fabric의 현재 datasource, Object Explorer bulk-create, 선택적 MV 생성을
조립하는 UI는 단일 backend domain이 아니라 `workflows/ontology/ui`가 소유한다.

- `EntityQueryPanel`과 전체 Text2SQL 임베드 탐색 모달을 workflow UI로 이동한다. 다른 domain API는 각
  공개 `index.ts`를 통해 사용하고 Ontology 내부 API/application은 Ontology 공개 경계를 통해 사용한다.
- domain `InstancePanel`은 교차-domain 컴포넌트를 import하지 않는다. 사용자가 기존 위치에서 같은 검색
  UI를 보도록 workflow parent가 slot으로 query panel을 주입하고, AI 탐색 버튼 이벤트로 workflow modal을
  연다.
- 기존 query·initial query·auto execute·datasource·SQL·column mapping·MV warning·bulk-create payload와
  canvas instance 결과를 그대로 보존한다. 이동을 이유로 중복 구현이나 re-export shim을 남기지 않는다.
- modal open/close와 node 변경 수명주기를 workflow가 소유하고 native close control, dialog label,
  busy/error/success/warning 상태를 보존한다.

구조 계약은 Ontology domain에서 Text2SQL/Data Fabric import와 workflow UI 역참조가 0인지 검사한다.
브라우저는 기존 Entity query 부분 성공 흐름에 더해 AI 탐색 모달 열기·결과 채택·취소/닫기와 요청 payload를
실제 사용자 동작으로 고정한다.

### DB schema 기반 Ontology generation workflow 슬라이스

`SchemaBasedGenerator`는 Text2SQL metadata datasource/schema를 탐색한 뒤 Ontology backend의
`generate-from-schema`를 호출하는 교차-domain workflow다. 따라서 `domains/ontology/ui`가 아니라
`workflows/ontology/ui`가 소유한다.

- Text2SQL API가 보장하는 `string[]` 계약을 그대로 사용하고, 문자열/객체를 동시에 받는 compatibility
  분기와 존재하지 않는 datasource type·table count 표시를 제거한다.
- datasource와 schema 목록의 최초 실패, 성공한 빈 목록, 이전 성공 목록이 있는 갱신 실패를 구분한다.
  실패는 console로 숨기지 않고 해당 단계에 재시도 action과 함께 표시한다.
- datasource/schema 항목은 native button으로 제공한다. 빠른 datasource 변경에서 늦은 schema 응답은
  현재 선택을 덮어쓰지 않으며 뒤로 이동할 때 pending 응답을 무효화한다.
- generation은 `success: true`뿐 아니라 실제 schema 존재까지 확인한 뒤 store와 parent를 갱신한다.
  schema 없는 성공 응답은 완료로 표시하지 않는다.

브라우저 계약은 datasource 503→재시도, 키보드 datasource 선택, schema 503→재시도, 키보드 schema 선택,
schema 없는 generation 응답→재시도, 최종 payload와 store 적용을 검증한다. Schema workflow에서는
문서 workflow의 외부 action footer가 중복 렌더되지 않아야 한다. 생성 결과가 단일 노드일 때는 layout
완료 후 자동 fit이 노드를 캔버스 전체로 과도하게 확대하지 않도록 단일 노드에만 viewport zoom 상한을
적용하고, 다중 노드의 기존 fit 동작은 유지한다.

### ObjectType 생성 workflow 소유권·부분 실패 슬라이스

`CreateObjectTypeDialog`는 Text2SQL 질의 결과, Data Fabric datasource, Ontology ObjectType·관계 생성을
순서대로 조립하는 교차-domain workflow다. 따라서 `domains/ontology/ui/modeling`이 아니라
`workflows/ontology/ui`가 소유하며, 이전 domain 경로나 re-export shim은 남기지 않는다.

- ObjectType 목록과 이름 제안 응답은 domain API 경계에서 runtime 검증한다. 알 수 없는 값을
  `ObjectTypeInfo`로 단언하거나 실패를 빈 목록으로 바꾸지 않는다.
- 수동 입력과 질의 결과는 하나의 application builder가 명시적인 생성 요청으로 변환한다. ObjectType
  생성과 관계 생성의 요청 타입은 backend cardinality·match strategy 전체 집합을 표현하고, workflow는
  현재 화면에서 만들 수 있는 부분집합만 좁혀 사용한다.
- ObjectType 본체 생성과 후속 관계 생성은 별도 결과다. 본체 성공 뒤 관계 하나가 실패해도 전체 실패로
  위장하거나 본체 POST를 반복하지 않는다. 실패한 관계와 원인을 표시하고 그 관계만 재시도하며, 사용자는
  관계 없이 완료할 수도 있다.
- ObjectType/Data Fabric catalog와 AI 이름 제안의 실패는 성공한 빈 상태와 구분하고 해당 위치에서
  재시도한다. native button·checkbox·dialog/busy/live semantics와 pending 중 충돌 방지를 제공한다.

브라우저 계약은 관계 catalog 503→재시도, 키보드 ObjectType 선택, Text2SQL 결과 채택, ObjectType 생성
성공, 관계 생성 503, 본체 비반복, 실패 관계만 재시도, 목록 갱신을 실제 사용자 흐름으로 검증한다.
1920×1080에서는 관계 오류 행과 부분 성공 action이 Text2SQL 영역 또는 footer에 잘리거나 겹치지 않아야 한다.

### Data Fabric 작업별 상태 분리 슬라이스

Data Fabric store의 datasource 목록, 선택 datasource의 table 목록, 생성·삭제 mutation은 서로 다른
capability와 수명주기다. 하나의 `loading/error`를 공유하면 Text2SQL이 발생시킨 table 실패가 다른 화면에서
datasource 목록 실패로 표시되므로 각 상태를 별도로 소유한다.

- datasource 목록 실패는 성공한 이전 목록을 제거하지 않는다. 최초 실패/성공 빈 목록/갱신 실패를 구분하고
  이전 요청의 늦은 응답은 최신 목록을 덮지 않는다.
- table 조회는 선택 datasource identity와 요청 세대를 확인한다. 선택이 바뀐 뒤 도착한 이전 table 응답은
  폐기하며, 실패를 `테이블이 없습니다`로 표시하지 않고 상세 패널 안에서 재시도한다.
- 생성·삭제 오류는 목록 오류나 table 오류를 덮지 않는 mutation 상태로 표시한다. 모든 소비자는
  작업별 상태를 사용하며 기존 혼합 `error/loading/clearError` 경로는 구조 계약으로 재유입을 막는다.

계약 테스트는 table 실패가 datasource 목록과 mutation 상태를 오염시키지 않는지, 목록 갱신 실패가 이전
목록을 보존하는지, 늦은 table 응답을 폐기하는지 검증한다. 브라우저는 table 503에서 datasource card를
유지하고 상세 오류·재시도를 거쳐 실제 table을 표시하는 흐름과 ObjectType Direct SQL에서 관련 없는
Data Fabric 오류가 나타나지 않는 흐름을 검증한다.

### Parser→Analyzer 업로드 workflow 소유권 슬라이스

`UploadTab`과 그 modal/tree/drop/path-browser는 Parser 파일 입력을 Analyzer의 upload·parse·analyze
수명주기로 연결하고 완료 뒤 Catalog graph 화면으로 이동하는 교차-domain workflow다. 따라서
`features/code-analysis/components/upload`가 아니라 `workflows/code-analysis/ui/upload`가 소유한다.
앱 registry는 workflow 공개 진입점만 lazy import하며 옛 entrypoint와 re-export shim은 남기지 않는다.

- feature id `upload`, 메뉴·헤더·lazy-load 시점, modal `confirm` payload, 업로드→분석→graph 이동,
  파일/DDL 트리·미리보기·source line navigation과 standalone/Electron 경로 모드를 보존한다.
- Parser는 경로 정규화·트리 구성·파일 탐색 정책을 소유하고, workflow UI는 이를 중복 재귀나 `any`
  단언 없이 조립한다. 화면 전환 지연은 unmount 시 취소되는 공용 timer 수명주기를 사용한다.
- Data Fabric connector catalog와 생성 상태는 domain 공개 경계를 단일 진실로 사용한다. API 장애를
  가장하는 하드코딩 connector fallback이나 mutation 오류를 다른 작업 상태로 섞지 않는다.
- drag-and-drop entry와 file input은 runtime type guard로 좁히고, Electron FS bridge는 명시적 browser
  port를 사용한다. 실패·빈 파일·목록 실패·생성 실패는 각각 화면에서 구분하며 browser native
  `alert`/`confirm`에 의존하지 않는다.

계약 테스트는 트리 파일 수집·정확 경로/파일명/procedure 탐색 우선순위, Data Fabric connector 단일 진실,
옛 경로·fallback·`any` 재유입을 검증한다. 브라우저는 lazy upload 화면, modal 접근성, datasource 목록
503와 기존 목록 보존, connector 선택·생성 실패, 업로드 validation, source navigation timer 종료를
실제 사용자 조작으로 확인한다.

### Data Fabric 관리 UI 책임 분해 슬라이스

`DataSourceManager`는 관리 shell, datasource card/table 상세, connector catalog, 등록 form, 연결시험,
생성 success timer, 삭제 확인을 한 SFC에서 함께 소유한다. 관리 shell은 목록 검색과 선택만 조립하고,
connector 표현 정책·등록 dialog·삭제 확인을 독립 책임으로 분리한다. domain 공개 API와 화면의 class/문구,
feature id·mode별 select emit은 보존한다.

- connector icon/color/gradient와 category icon은 `catalog`의 순수 표현 정책으로 이동한다. UI는 87개
  connector 원본을 다시 하드코딩하거나 별도 fallback catalog를 만들지 않는다.
- 등록 dialog는 connector 검색/그룹화, 기본 field 값, 연결시험, 생성 상태를 소유한다. 성공 뒤 닫힘은
  unmount 시 정리되는 managed timer를 사용하고 생성·시험 실패를 각각 해당 action 위치에 표시한다.
- datasource card는 native button으로 선택하며 삭제 action은 별도 button이다. 삭제는 이름 있는
  `alertdialog`에서 명시적으로 확정하고 Escape 취소·초기 focus·pending/error 상태를 제공한다.
- add dialog는 이름 있는 `dialog`, focus/Escape/busy 상태, 모바일 단일열 form/grid와 내부 scroll을
  제공한다. 390×844에서 관리 header/action, datasource grid, connector catalog와 form action이
  가로 overflow·잘림·겹침 없이 유지되어야 한다.

정적 계약은 `DataSourceManager`의 connector map·등록 form/native dialog/raw timer 재유입을 차단한다.
브라우저 계약은 목록/table 실패→재시도에 더해 키보드 card 선택, 연결시험 실패, 생성 실패→동일 form 재시도,
삭제 Escape/실패→재시도/성공, desktop·mobile dialog geometry와 실제 request payload를 검증한다.

### Catalog 용어 일괄 업로드 상태·영속화 슬라이스

`TermBulkUploadModal`은 파일 upload, AI mapping, join/value transform, 일반·stream extract, 가상 preview,
candidate 편집, import/rollback, sessionStorage 복원을 한 SFC에서 함께 소유한다. API sequence와 3-step
화면 결과는 보존하되, mapping/request/preview/snapshot 정책은 Catalog application 모듈로 이동하고 UI는
명시적인 상태 전이와 사용자 action만 조립한다.

- upload/extract/import/rollback 응답과 stream event, 복원 snapshot은 runtime parser를 통과한다. 손상되거나
  stale한 snapshot은 부분 hydrate하지 않고 폐기하며, 200건 초과 preview는 session id와 mapping으로 서버에서
  복원한다.
- mapping 초기화, joined column identity, value transform, candidate clone/filter/sort/edit, import 선택 payload는
  순수 함수로 분리한다. column selection JSON은 허용된 string/joined-reference/null만 수용한다.
- upload phase message timer는 managed lifetime을 사용하고, stream 취소는 현재 request의 AbortController만
  중단한다. 취소 뒤 partial fetch 성공과 실패를 별도 결과로 표시한다.
- 이전 작업 복원, 선택 import, batch rollback은 하나의 명명된 confirmation 컴포넌트를 사용하되 action별
  문구·확정 callback·pending/error를 구분한다. modal 자체도 label/focus/Escape를 제공하고 진행 중에는
  충돌하는 close/step action을 막는다.

계약 테스트는 mapping/request/snapshot parser, 200건 영속화 경계, 후보 filter/sort/edit와 exact import
payload를 검증한다. 브라우저는 손상 snapshot 폐기, 복원 취소/수락, upload 실패→재시도, extract 취소 partial,
import 취소/503→재시도, rollback 취소/503→재시도와 1920×1080·390×844 preview/action geometry를 검증한다.

### Catalog 일반 용어 action·반응형 슬라이스

`GlossaryTab`의 목록·상세·편집 오류가 하나의 문자열과 무조건적인 목록 재조회 버튼을 공유하지 않도록
실패한 action identity를 보존한다. 용어집·용어 삭제는 Catalog 공용 `GlossaryActionDialog`를 사용하고,
mutation 성공 전에는 목록·선택 상태를 변경하지 않는다.

- 목록, 용어 목록, 선택 상세, 편집 상세는 각 retry action을 구분한다. 상세 503 뒤 재시도는 같은 term
  detail만 다시 요청하며 glossary list를 호출하지 않는다.
- 삭제 대상 ID와 glossary ID는 dialog를 열 때 고정한다. Escape는 요청 0건, 503은 같은 dialog의 오류,
  재시도 성공 뒤에만 목록을 갱신한다. 취소는 trigger에, 성공은 main 영역에 focus를 복귀시킨다.
- 용어 행은 Enter/Space로 선택할 수 있고 개별 설명/전체 설명 펼치기는 실제 state와 `aria-expanded`를
  공유한다. 구현되지 않은 활동 피드는 disabled control로 명시한다.
- 900px 이하에서는 glossary 목록을 가로 선택 strip, main과 metadata를 세로 흐름으로 전환한다. table은
  document가 아니라 전용 container에서 가로 scroll하며 390×844의 root/document overflow를 0으로 유지한다.

브라우저 계약은 상세 503→정확한 재시도, 개별 설명 확장, 키보드 선택, term/glossary 삭제
Escape→0 request와 503→동일 dialog retry→성공, 390×844 geometry와 page error 0을 검증한다.

### Catalog 영업일 캘린더 상태·계약 슬라이스

`BusinessDayCalendar`의 42-cell projection, 주말·공휴일·수동 비영업일 합집합 통계, 저장 payload,
고정일 공휴일 병합은 `application/businessCalendarDraft.ts`의 순수 정책으로 이동한다.

- GET/POST/DELETE/check/non-business-dates 응답은 날짜 형식, 배열, boolean과 mutation `success=true`를
  runtime에서 검증한다. `success=false`와 malformed 200을 성공으로 표시하지 않는다.
- 연도별 load는 request sequence와 requested year를 함께 고정해 늦은 과거 응답을 폐기한다.
  load 503은 load만, save 503은 보존된 편집 상태로 save만 다시 실행한다. save 성공 뒤 refresh 실패는
  mutation 실패로 되돌리지 않고 “저장은 완료됐지만 최신 상태 조회 실패”로 구분한다.
- 성공 알림은 managed timer로 해제한다. 공휴일 dialog는 이름, 연결된 label, date input 최초 focus,
  Escape와 trigger focus 복귀를 제공한다. 같은 날짜를 다시 추가하면 중복 key 대신 해당 항목을 교체한다.
- “대한민국 공휴일 자동추가”는 실제로 포함하는 고정 양력일만 설명하도록 “고정일 추가”로 정정한다.
  mobile은 sidebar/main을 세로로 쌓고 7열 grid와 legend만 main 내부에서 가로 scroll한다.

순수 계약은 42-cell, 통계 합계, reason 보존 payload, 중복 없는 고정일 병합, malformed date와
`success=false` 거부를 검증한다. 브라우저는 load/save 각각 503→정확한 retry, 날짜 선택,
dialog focus/Escape/복귀, exact payload, 390×844 overflow와 page error 0을 검증한다.

### MultiLayer Ontology graph 편집·mutation 수명주기 슬라이스

`MultiLayerOntologyViewer`의 노드/관계 로컬 삭제, 관계 field mapping 검증, Measure→ObjectType 생성,
Neo4j 저장을 첫 번째 명시적 graph-action 책임으로 분리한다.

- `model/localGraphMutation.ts`가 node/relationship delete target, 사용자 문구와 immutable graph 결과를
  계산한다. component는 undo snapshot과 Cytoscape 반영만 조립하며 context menu·detail panel·relation
  editor의 삭제 경로는 같은 정책과 공용 `ActionDialog`를 사용한다.
- field mapping의 미연결 datasource·조회 실패·현재 column 불일치는 editor inline error로 유지하고
  입력을 버리거나 browser alert를 띄우지 않는다.
- ObjectType 생성은 dialog open 시 node request snapshot을 고정한다. primary API 성공 뒤 node datasource를
  commit하고 dialog를 닫으며, 후속 data refresh 오류는 별도 warning으로 남겨 이미 성공한 create를
  재시도하지 않는다.
- Neo4j 저장은 header operation state가 validation/error/success를 소유하고 같은 graph retry를 제공한다.
  기존 `saveToNeo4jSilent` API sequence는 generation auto-save 소비자를 위해 유지한다.

단위 계약은 node/relationship target과 삭제 결과의 입력 불변성·연결 edge 제거를 검증한다. 브라우저는
관계 삭제 취소, 노드 삭제와 undo, field validation inline 상태, ObjectType 503 exact retry와 success,
저장 validation/503/retry를 실제 조작하고 focus·요청 횟수·성공 전 상태 불변을 확인한다.

### MultiLayer Ontology datasource mutation 수명주기 슬라이스

`MultiLayerOntologyViewer`의 자동 연결 stream, node 자연어 검색, 후보 단건 확정, 선택 후보 일괄 확정을
하나의 native dialog/오류 삼킴 흐름에서 분리한다.

- Ontology API는 datasource confirmation의 `success: true`를 runtime에서 검증한다. component의 commit
  함수는 실패를 삼키지 않고, node/mapping/relation 상태는 검증 이후에만 한 번 갱신한다.
- 단건 node dialog와 자동연결 candidate는 각각 pending/error/exact retry를 소유한다. 검색/stream 오류는
  소유 dialog에 남고 같은 입력으로 재시도하며 timer나 native alert로 사라지지 않는다.
- 일괄 확정 target snapshot과 부분 성공 projection은 workflow application 정책으로 둔다. 공용
  `ActionDialog` 확인 뒤 실패 target만 남겨 재시도하며 이미 성공한 node mutation은 반복하지 않는다.
- 미확인 컬럼 메타데이터는 기존 mapping을 보존하고, 실제 컬럼이 확인된 경우에만 불일치 field와
  짝이 없어진 반대 field를 정리한다.

순수 계약은 target snapshot, 부분 성공/실패 projection, response parser, 미확인 컬럼 보존을 검증한다.
브라우저는 node 단건 503→동일 retry, candidate 단건 503→동일 retry, 일괄 취소→0 request와
부분 성공→실패 node만 retry, 검색/stream 오류 retry, session headers와 390×844 dialog geometry를 검증한다.

### MultiLayer Ontology 문서 생성·죽은 overlay 정리 슬라이스

문서 기반 Ontology 생성은 파일 선택·검증과 generation transport/stream 실패를 생성 dialog가 직접
소유한다. 잘못된 파일을 native alert로 넘기거나 선택된 파일처럼 보존하지 않고, dialog 내부의
`role="alert"` 오류로 표시한다. 유효한 PDF를 다시 선택하면 같은 dialog에서 오류를 지우고 정상 입력으로
교체한다. generation 실패는 기존 결과/재시도 화면을 유지하며 native alert를 병행하지 않는다.

model overlay는 selector·event·state·delete 소비 코드만 있고 이를 활성화하는 control이나 데이터를
생산하는 경로가 없으므로 compatibility 경로를 만들지 않고 제거한다. 일반 graph node event와 transient
element 정리는 실제 생산되는 graph 요소만 대상으로 단순화한다.

구조 계약은 `MultiLayerOntologyViewer` 전체의 native alert/confirm과 model-overlay 식별자가 0개인지,
inline file validation 상태가 존재하는지를 검증한다. 브라우저는 잘못된 text 파일 선택→inline 오류와
입력 미확정, 유효한 PDF 재선택→오류 해제, labeled close를 실제 조작하고 1920×1080 dialog geometry와
page runtime 오류 0개를 확인한다.

### MultiLayer Ontology 패널 resize lifecycle 슬라이스

상세 패널 너비와 What-If 패널 높이는 같은 pointer 시작→projection→완료/취소 lifecycle을 공유하므로
`shared/composables/useResizablePanel.ts`가 값 clamp, 방향 projection, 전역 pointer listener,
document cursor/selection, scope dispose를 소유한다. viewer는 각 패널의 초기값·최소/최대·축·방향만
구성하며 자체 mouse state/listener를 보유하지 않는다.

pointer 종료는 현재 크기를 확정하고 pointer cancel·Escape는 drag 시작 크기로 복원한다. 모든 종료
경로는 기존 body cursor/user-select를 정확히 복원한다. separator는 pointer 조작을 유지하면서
`role="separator"`, orientation, min/max/current value, focus ring, 방향키와 Home reset을 제공한다.

순수 계약은 clamp와 음의 축 방향 크기 projection을 경계값까지 검증한다. 구조 계약은 viewer의 raw
move/up/cancel listener와 과거 중복 resize state 재유입을 차단한다. 브라우저는 상세 패널
ArrowLeft→Home, pointer drag→Escape→body style 복원과 What-If ArrowUp→Home을 실제 조작하고,
동시 패널·그래프·범례 비중첩과 page runtime 오류 0개를 1920×1080에서 확인한다.

### MultiLayer Ontology 인과 분석 lifecycle 슬라이스

brush selection/request builder/progress reducer/highlight projection은
`application/causalAnalysisLifecycle.ts`, API orchestration·AbortController·request sequence·report reveal은
`composables/useCausalAnalysis.ts`가 소유한다. viewer는 ECharts brush와 Cytoscape class projection,
data/analysis tab 전환만 조립한다. 결과 panel의 생산자 없는 `analysis-complete` 계약은 제거하고
cancel/retry event만 남긴다.

incoming network와 analysis stream은 같은 frozen schema/node/brush snapshot을 사용하고 각각 AbortSignal을
받는다. network 실패는 분석 전체 실패가 아닌 visible partial warning으로 유지하며 분석을 계속한다.
transport/parser 실패는 result와 구분하고, cancel은 현재 request를 abort한 뒤 같은 selection을 보존한다.
node/schema 전환·reset·scope dispose는 sequence를 무효화해 abort를 무시하는 늦은 응답도 commit하지 못한다.
stream progress의 `report_chunk`만 보고서에 누적하고 final result가 오면 reader를 종료한다.

순수/수명주기 계약은 runtime incoming-network parser, immutable request, chunk 누적, highlight dedupe,
metric/range 선택, 늦은 result 폐기, AbortSignal 취소, partial warning 뒤 success를 검증한다. 브라우저는
focus 가능한 구간 선택 control→실제 chart drag→network 503 warning→실행 중 취소→동일 payload retry
transport 503→동일 payload retry NDJSON progress/result를 조작하고 session headers, request count,
Cytoscape highlight, 1920×1080 상태 비중첩을 확인한다.

### MultiLayer Ontology 노드 데이터 조회·차트 lifecycle 슬라이스

node target/query projection은 `application/nodeDataRetrieval.ts`, 요청 ownership·AbortController·
request sequence·exact retry는 `composables/useOntologyNodeData.ts`가 소유한다. viewer는 데이터 탭
전환과 결과 표시만 조립하고 Ontology URL parameter, Text2SQL SQL/datasource 조립, raw loading/error
상태를 직접 소유하지 않는다.

- node identity, datasource/schema metadata, effective filter와 영업일 옵션은 요청 전에 복제한다.
  새 조회는 이전 controller를 abort하고 sequence가 다른 응답은 transport가 완료되어도 폐기한다.
- Ontology 정상 결과, `hasDataSource:false`, HTTP/parse failure를 구분한다. 원본 조회는 검증된
  datasource와 SQL snapshot만 사용하며 각 실패의 retry는 최초 query/request를 그대로 실행한다.
- Ontology node data와 Text2SQL Direct SQL API는 현재 runtime headers와 workflow AbortSignal을 받는다.
- 결과와 chart container를 함께 보는 단일 watcher가 같은 managed key로 render를 예약한다. 결과
  reset·table·빈 rows·component 종료는 pending render와 ECharts instance를 함께 폐기한다.

순수/수명주기 계약은 target 깊은 복제, query 생성, SQL LIMIT/datasource 결정, A→B 전환 뒤 A late
result 폐기, Ontology exact retry, Text2SQL exact retry와 reset abort를 검증한다. 브라우저는 느린 KPI
조회 중 Driver 선택→KPI request abort→Driver 결과·차트 유지, session headers와 runtime 오류 0개를
검증하고 1920×1080 캡처를 직접 확인한다.

### OLAP ETL script lifecycle 슬라이스

`PivotAnalysis.vue`에 함께 있던 agent/template 생성, 저장본 조회, 저장, 다운로드용 생성, 실행 stream과
두 stream handle을 `domains/olap/composables/useEtlScriptLifecycle.ts`로 이동한다. UI는 cube editor의
탭·dialog, log auto-scroll, Blob 다운로드만 조립하며 OLAP script API를 직접 호출하거나 stream handle을
보관하지 않는다.

- lifecycle은 generation/load/save/download/execution별 상태와 sequence를 소유한다. 새 generation 또는
  execution, cube 전환, editor 닫기, scope dispose는 해당 control을 취소하고 sequence가 다른 callback과
  Promise completion을 폐기한다.
- 저장 target은 cube/code/filename을 복제·동결하고 backend success 뒤에만 saved metadata를 commit한다.
  실패 target은 별도로 유지해 exact retry하며 일반 저장 action은 현재 화면 값으로 명시적 새 target을
  만든다. 저장본 refresh 실패는 마지막 정상 script를 보존한다.
- execution target은 cube/sync mode/max retry를 시작 시 고정한다. terminal error/complete와 사용자
  cancel은 서로 다른 result이며 취소 뒤 늦은 event는 무시한다. `script_updated` refresh도 execution
  sequence와 cube가 여전히 현재일 때만 commit한다.
- 다운로드는 별도 pending/error를 사용해 화면의 generation spinner와 agent status를 변경하지 않고,
  lifecycle이 반환한 검증된 code/filename을 UI가 browser Blob으로 투영한다.

전용 lifecycle 계약은 agent terminal/late callback, 저장본 stale read·기존 결과 보존, frozen save retry,
execution cancel·late complete, cube 전환·scope dispose를 검증한다. 구조 검사는 Pivot UI의 script API와
stream handle 직접 소유를 차단한다. 브라우저는 저장 조회 503→retry, generation 취소, 저장
`success:false`→동일 body retry, execution 취소 뒤 late complete 무시, session headers와 desktop/mobile
editor 상태를 실제 사용자 조작으로 고정한다.

### Schema Modeling Catalog discovery lifecycle 슬라이스

`schemaCanvas.ts`에 섞인 Catalog 테이블 목록, semantic search, identity별 column cache/error/request를
`application/schemaCatalogDiscovery.ts`와 `composables/useSchemaCatalogDiscovery.ts`로 이동한다.
Schema Modeling 전용 table/column view type을 정의해 Text2SQL domain의 표시 타입을 빌려 쓰는 의존을
제거하고, store는 discovery 결과와 canvas node/panel만 조립한다.

- application projection은 Catalog의 `table_schema`, `column_count`, description provenance를 workflow
  필드로 명시적으로 옮기고 입력을 변경하지 않는다.
- table list와 semantic search는 별도 AbortController·sequence·failed target을 사용한다. refresh failure는
  마지막 정상 결과를 보존하며 semantic error UI는 같은 query 재시도와 검색 초기화를 구분한다.
- column lookup은 canonical datasource+schema+table key를 사용한다. 같은 key의 동시 요청은 한 Promise를
  공유하고 성공한 empty도 cache하며, 실패 뒤 cache를 만들지 않고 identity별 error를 유지한다.
- Catalog `getTables`, `semanticSearch`, `getTableColumns`는 현재 session/API-key headers와 runtime parser를
  유지하면서 context의 AbortSignal을 실제 fetch에 전달한다.
- store의 기존 `loading` 공개 결과는 table-list와 canvas bulk-add pending을 합친 read-only projection으로
  유지하되 두 작업은 더 이상 같은 ref를 변경하지 않는다.

전용 unit은 projection, 목록/search stale response, 이전 결과 보존, exact semantic retry, empty column
cache, in-flight dedupe, ambiguous identity 선거부, scope disposal을 검증한다. 구조 검사는 store의 세
Catalog read 직접 호출과 Text2SQL table/column type 재유입을 차단한다. 브라우저는 목록 503→retry,
semantic 정상→503 결과 보존→동일 query retry, 컬럼 503→identity retry, session headers와 기존
canvas/detail 동작을 실제 사용자 조작으로 확인한다.

### MultiLayer Ontology relation editor lifecycle 슬라이스

`MultiLayerOntologyViewer.vue`에 남은 관계 선택, source/target 컬럼 조회, field draft 정합성, 저장
orchestration을 `application/relationEditorLifecycle.ts`와
`composables/useOntologyRelationEditor.ts`로 이동한다. application은 edge id 해석, 컬럼 정규화,
verified-column 기반 draft projection을 입력 불변 순수 정책으로 소유한다. composable은 관계 target과
form, endpoint별 pending/error/columns, AbortController/request sequence, retry, close/scope disposal,
순수 local graph update commit을 소유한다.

Viewer는 노드 선택 해제, history checkpoint, relationship ref 교체, Cytoscape edge 갱신과 causal
highlight만 callback으로 조립한다. 새 관계를 열거나 닫을 때 이전 두 endpoint 요청을 취소하고 늦은
응답을 폐기한다. 일시적 실패·미연결 datasource에서는 기존 mapping draft를 보존하며, 검증된 ready
목록에서 실제 누락이 확인된 field만 draft에서 제거한다. UI에는 endpoint별 실패와 같은 관계 컬럼
재시도를 표시한다. 단위 계약은 stale/abort, close/scope dispose, retry identity, inline schema,
mapping 보존/검증, no-op/commit 횟수와 다른 관계 전환 stale 차단을 검증하고, 구조 검사는 Viewer의
relation editor 분산 ref와 직접 node-data API 호출을 차단한다. Playwright는 실제 UI datasource 확정,
503→같은 관계 retry, mapping 보존, type/description/field 결과, desktop/mobile panel geometry를 실제
조작으로 고정한다.

### MultiLayer Ontology node datasource discovery lifecycle 슬라이스

Viewer에 남은 node datasource dialog의 자연어 검색, provenance→candidate projection, bounded row-count
probe, sample preview, manual/ObjectType candidate 작성, 단건 확인 retry를
`application/nodeDatasourceDiscovery.ts`와 `composables/useNodeDatasourceDiscovery.ts`로 이동한다.
Text2SQL ask/direct-SQL/table-column과 Ontology node-sample 호출에는 AbortSignal을 전달하고 dialog
target/request sequence로 늦은 결과를 폐기한다. 검색 결과 없음, provenance 없음, transport failure,
probe 부분 실패, sample 실패를 별도 상태로 유지한다. 확정 mutation은 기존
`projectConfirmedDatasourceSchema`와 graph reconciliation commit callback을 사용해 backend 성공 뒤에만
반영한다. 단위 계약은 projection immutability, table quoting, A→B stale rejection, close/scope abort,
probe concurrency/bounds, sample source, exact confirm retry를 검증한다. 구조 검사는 Viewer의 node
datasource 분산 ref, 직접 Text2SQL/Ontology discovery 호출, 후보 in-place mutation을 차단한다. 기존
Playwright datasource catalog/search/confirm/partial retry 흐름과 1920×1080·390×844 geometry를 다시
통과시킨다.

### MultiLayer Ontology library workspace lifecycle 슬라이스

도메인의 `useOntologySchemaLifecycle` activate/detail/rename/delete 계약을 재사용하되 Viewer에 남은
dropdown/list 상태, rename draft, frozen delete target, recent-history commit, schema 화면 적용 실패와
exact retry를 `composables/useOntologyLibraryWorkspace.ts`로 이동한다. 목록 projection과 손상 entry
제외는 기존 `projectOntologyLibrary`를 단일 진실로 유지한다. Viewer는 `applySchema`와
`clearDeletedSchema` callback만 제공하고 backend 성공 전에는 canvas/history/name을 바꾸지 않는다.
화면 적용 retry target은 schema를 깊은 복제로 고정하여 재시도 중 API 호출이나 활성화를 반복하지
않는다. 기존 library/list/load/rename/delete Playwright 흐름에 application failure exact retry와
Viewer direct API/ref 0 구조 검사를 추가한다.

### MultiLayer Ontology datasource mapping workspace lifecycle 슬라이스

기존 datasource confirmation의 response parser와 frozen target/bulk projection 정책을 유지하면서
Viewer에 남은 auto-link progress/mapping, candidate expansion, 단건 pending/error, bulk dialog
수명주기를 `application/datasourceMappingWorkspace.ts`와
`composables/useOntologyDatasourceMapping.ts`로 이동한다. Viewer는 현재 node projection과 backend
성공 뒤 node/relation/Cytoscape를 반영하는 local callback만 제공한다.

- auto-link client는 AbortSignal과 session headers를 실제 fetch에 전달한다. composable은 요청별
  AbortController·sequence를 소유하고 close/retry/scope disposal에서 이전 stream을 무효화한다.
- progress event와 result mapping은 깊이 복제한 immutable projection으로 반영한다. terminal result 없는
  EOF와 malformed mapping은 visible failure이며 성공 빈 mapping과 구분한다.
- confirmation target은 transport 단계와 local application 단계를 분리한다. transport 성공 뒤 local
  projection이 실패하면 backend가 이미 commit된 target을 application-retry로 보존하고, 같은 candidate의
  재시도는 API를 다시 호출하지 않은 채 local projection만 실행한다.
- bulk dialog는 open 시 target snapshot을 고정하고 target별 confirmation 결과를 투영한다. 이미 성공한
  target은 제거하며 transport/application 실패 target만 같은 단계와 payload로 남겨 재시도한다.
- Viewer의 mapping 관련 refs, direct auto-link/confirm API 호출, mapping in-place mutation은 구조 검사로
  재유입을 차단한다.

전용 계약은 auto-link stale/abort/terminal/malformed/empty, immutable projection, 단건 transport 실패,
backend 성공 뒤 application 실패와 API 비반복 retry, bulk 혼합 실패·성공 target 비반복, scope disposal을
검증한다. 기존 Playwright auto-link 503→retry, candidate 503→동일 payload retry, bulk Escape→0 request,
부분 성공→실패-only retry, node discovery confirm, session headers와 desktop/mobile geometry를 다시
통과시킨다.

### MultiLayer Ontology canvas schema projection 슬라이스

Viewer의 document generation complete, `SchemaBasedGenerator`의 generated event, library workspace의
apply callback에 중복된 node/relationship 변환과 identity commit을
`application/ontologyCanvasSchema.ts`의 source-aware 순수 projection으로 통합한다.

- `document`, `database`, `library` source를 명시하고 각 source의 기존 필드 정규화 차이를 정책으로
  보존한다. DB schema 관계의 snake_case field alias는 canonical camelCase로 옮기고, library/document
  schema의 확장 node 필드와 position은 복제로 보존한다.
- 관계 정제는 valid node endpoint, 기본 type, 빈/중복 id의 결정론적 rekey를 입력 불변으로 수행하고
  skipped/rekeyed count를 projection metadata로 반환한다.
- document/database generation은 반환 id가 있으면 새 identity를 commit하고 없으면 이전 identity를
  지운다. library는 요청 target id를 사용한다. 세 경로 모두 schema name과 graph summary를 동일 정책으로
  계산한다.
- Viewer는 projection 결과의 단일 commit과 source별 후속 처리만 조립한다. document는 generation
  result/synonym/save lifecycle, database는 store 적용 뒤 local canvas/render/close, library는
  history/render lifecycle을 그대로 유지한다.
- 기존 schema를 연 상태에서 id 없는 새 generation을 완료해도 다음 save payload에 기존 id가 들어가지
  않는 계약과, id 있는 DB generation 뒤 schema-dependent action이 새 id를 사용하는 계약을 추가한다.

전용 unit은 세 source projection, 입력 불변, missing endpoint, 빈/중복 id, alias, name/summary,
identity reset을 검증한다. 구조 검사는 Viewer의 relation sanitizer와 source별 node/relationship map
재유입을 차단한다. 기존 document/schema/library Playwright 흐름에 새 identity와 저장 payload 단언을
추가하고 type-check, 전체 Ontology unit, architecture, desktop capture, production build를 다시 통과한다.

### MultiLayer Ontology canvas presentation model 슬라이스

`MultiLayerOntologyViewer.vue`가 직접 소유한 Cytoscape stylesheet literal을
`model/ontologyCanvasStyles.ts`의 순수 projection으로 이동한다. Viewer는 현재 theme boolean을
전달해 style 배열을 얻고 Cytoscape 인스턴스의 생성·theme 갱신만 조립한다.

- node base/selection과 edge base 규칙, 모든 relationship type selector의 색상·두께·line style,
  edgehandles preview/source/target 상태, agent activity, causal highlight/fade, filter direct/cascade/
  edge 상태를 하나의 presentation model이 소유한다.
- 관계 유형별 반복은 selector·color·추가 style의 선언 데이터로 정리하되 반환 selector 순서와 개별
  Cytoscape style 값은 기존 결과와 동일하게 유지한다.
- 각 호출은 새 style 객체를 반환해 Cytoscape가 한 호출의 객체를 변경하더라도 다음 theme projection을
  오염시키지 않는다. model은 DOM, Vue ref, Cytoscape instance를 읽지 않는다.
- unit은 light/dark 차이, selector 순서, 관계 유형 style, interaction/agent/causal/filter 규칙과
  호출 간 독립성을 고정한다. 구조 검사는 Viewer 내부 style literal 재유입을 막고 기존 Ontology
  Playwright canvas·theme 회귀, type-check, architecture, production build로 사용자 결과를 확인한다.

### MultiLayer Ontology graph element projection 슬라이스

Viewer의 layer metadata, 중복 layer rank, node element 생성, relationship 방향·type 정규화를
`model/ontologyGraphElements.ts`의 순수 projection으로 이동한다. canonical layer catalog는 id/name/
color/icon/rank를 한 번만 선언하고 layer panel, element color, 방향 projection, 후속 hierarchical
layout이 함께 사용한다.

- projection은 nodes/relationships를 읽기만 하고 `{ elements, hasCompletePositions }`를 반환한다.
  node element는 기존 id/name/layer/color와 완전한 position을 보존하고 edge element는 기존
  id/source/target/type/label/weight/sourceLayer/targetLayer를 보존한다.
- 수평 흐름, layer 간 방향, 같은 layer의 upward/non-upward 관계, inverse map, unknown `REV_` fallback의
  우선순서와 결과를 전용 unit으로 고정한다.
- preset 결정은 일부 node의 x만 보는 기존 느슨한 조건 대신 모든 node의 finite x/y를 요구한다.
  일부/비정상 position은 Cytoscape 0,0 중첩을 만들지 않고 기존 layout 경로로 보낸다.
- Viewer는 projection과 Cytoscape instance/event orchestration만 담당하고 local hierarchy/inversion/
  upward/horizontal 선언이나 element construction loop를 소유하지 않는다.
- 구조·타입·전체 Ontology unit, 실제 DB/document/library/local graph Playwright 흐름, desktop 캡처,
  production build와 lazy boundary를 다시 검증한다.

### MultiLayer Ontology hierarchical layout projection 슬라이스

Viewer의 `applyHierarchicalLayout` 안에 결합된 topology 수집, same-layer depth, layer별 좌표, Driver
연결 기반 위치와 overlap relaxation을 `model/ontologyHierarchicalLayout.ts`의 순수 projection으로
이동한다. Viewer는 현재 Cytoscape node/edge의 최소 snapshot을 전달하고 반환 위치를 적용한 뒤
`fitGraphToViewport()`만 호출한다.

- projection 입력은 `{id, layer}` node와 `{source, target}` edge의 readonly 배열이며 canonical
  layer rank는 `ontologyGraphElements.ts`의 단일 진실을 재사용한다.
- 기존 상수와 알고리즘 순서를 보존해 알려진 정상 graph의 좌표를 byte-level 숫자 단언으로 고정한다.
  Process 연결 traversal은 현재 renderer edge 방향과 입력 순서를 따르고, KPI/Measure depth와 Driver
  connected-average·3회 pull·overlap 보정을 그대로 유지한다.
- cycle은 terminal이 없어도 모든 node에 기본 depth 좌표를 부여하고, 단절/Driver-only 연결과 unknown
  layer도 finite fallback 좌표를 가져야 한다. duplicate/missing endpoint edge는 존재하는 endpoint만
  adjacency에 반영한다.
- Viewer는 layout 상수, node-info map, recursive depth, layer grouping, position relaxation을 소유하지
  않는다. Cytoscape snapshot/apply/fit과 layout 선택 orchestration만 남긴다.
- unit은 정상 multi-layer exact coordinates, input immutability, process chain, same-layer cycle,
  missing endpoint, disconnected/driver-only, unknown layer, empty graph, finite output을 검증한다.
  구조·타입·전체 Ontology unit, 실제 graph Playwright, 캡처, production build와 lazy boundary를
  다시 통과한다.

### Schema Modeling canvas drag intake 슬라이스

`SchemaCanvas.vue`의 raw `JSON.parse`와 shape guessing을
`application/schemaCanvasDrop.ts`의 runtime parser로 이동한다. parser는 Schema Modeling table
identity와 ObjectType 전용 columns/behaviors를 canonical `{table, options}` target으로 만들며, behavior
검증은 `domains/ontology/model/behavior.ts`에 공개한 단일 parser를 ObjectType API와 함께 사용한다.

- `{table}`, direct table, ObjectType direct/legacy marker를 정상 입력으로 보존한다. 문자열 필드는
  명시적으로 검증·trim하고 optional metadata를 복제하며 column count는 finite nonnegative number만
  허용한다.
- ObjectType column은 name/table_name/dtype/description/nullable과 optional logical metadata를
  검증하고, behavior는 name/type/config/input/output 전체 runtime parser를 통과해야 한다.
- composable 또는 Viewer-local lifecycle은 parsed target과 drop position을 복제해 pending/error/
  failed target을 소유한다. malformed payload는 retry 없는 visible failure, add failure는 같은 target
  retry, 성공은 alert clear와 단일 fit을 보장한다.
- 구조 검사는 SchemaCanvas의 `JSON.parse`, shape marker 추론, 무검증 `parsed` 전달 재유입을 막고
  Ontology behavior parser 중복도 차단한다.
- unit은 세 정상 shape, metadata 보존, malformed JSON/primitive/빈 identity/invalid count/column/
  behavior, input 불변을 검증한다. 실제 browser는 invalid drop visible/no mutation, valid drop의 column
  503·동일 target retry·단일 node commit을 확인하고 type-check, architecture, schema 회귀, production
  build와 lazy boundary를 다시 통과한다.

### Schema Modeling canvas batch-add transaction 슬라이스

`SchemaCanvas.vue`의 `상위 10개` loop와 store의 clear-first `전체` loop를 frozen attempt와 canvas
transaction으로 교체한다. store 내부 mutation 전후 상태는 명시적인 snapshot/restore 책임으로
격리하고, node data와 전체 grid 배치는 framework-free projection으로 만든다.

- UI는 시작 시 mode와 table metadata를 복제하고 pending/error/failed attempt를 소유한다. 실패는
  visible retry로 남고 성공만 mode 전환·alert clear·단일 fit을 수행한다.
- `상위 10개`는 기존 `addTableToCanvas`와 related-table 확장을 그대로 실행하되 하나라도 실패하면
  nodes/edges/catalog relationships/transient highlights를 시작 상태로 rollback한다.
- `전체`는 column 조회 중 canvas를 건드리지 않는다. 모든 조회가 성공한 뒤 projected node 배열을
  한 번 commit하고 relationship edges를 갱신한다.
- node projection은 single/all 양쪽에서 같은 metadata·default를 사용하고 deterministic square grid를
  만든다. unit은 exact node/grid, input 불변, metadata/column fallback을 검증한다.
- 실제 browser는 기존 node가 있는 상태에서 top/all의 중간 column/related 503, zero partial mutation,
  frozen identity retry, success-only fit/full-view mode를 확인한다. 타입·구조·schema 회귀·production
  build·lazy boundary를 다시 통과한다.

### Schema Modeling overlay-safe viewport 슬라이스

Vue Flow의 uniform numeric `fitView`를 canvas overlay 실측과 순수 safe-padding projection을 사용하는
단일 helper로 교체한다.

- `model/schemaCanvasViewport.ts`는 canvas width/height, 기존 base padding, top/right/bottom occlusion을
  받아 Vue Flow가 소비하는 px padding을 반환한다.
- numeric base padding은 현재 Vue Flow 계산식과 같은 pixel inset으로 변환하고, overlay gap과 최소
  content width/height를 적용해 극단적 측정에서도 유한하고 사용 가능한 결과를 만든다.
- SchemaCanvas는 canvas/floating controls/legend/toolbar ref와 minimap DOM bounds만 측정한다.
  모든 성공 경로와 수동 Fit 버튼은 같은 helper를 호출한다.
- unit은 기존 비율, expanded/collapsed right inset, invalid/oversized 측정 clamp를 검증한다.
  실제 browser는 11-node desktop grid에서 legend/node, toolbar/node, minimap/node intersection 0,
  collapsed legend의 축소 inset, 실패 시 viewport 불변을 확인한다.

### Schema Modeling mobile canvas drawer 슬라이스

고정폭 table panel을 720px 이하에서 canvas 흐름 밖의 접근 가능한 drawer로 전환한다.

- desktop panel 구조와 너비는 그대로 보존하고 mobile에서만 absolute drawer + backdrop을 적용한다.
- trigger/close ref를 통해 open 시 close button focus, Escape/backdrop/close 시 trigger focus 복원을
  보장한다. visibility와 pointer-event를 함께 전환해 닫힌 panel을 tab order에서 제거한다.
- mobile 최초 legend는 collapsed로 시작하고 minimap을 숨겨 graph content area를 확보한다. floating
  controls는 두 줄까지 wrap되며 overlay-safe fit은 실측된 새 높이/폭을 그대로 소비한다.
- table double-click 성공은 drawer를 닫고 기존 add/related/fit 결과를 보존한다.
- 실제 390x844 browser에서 canvas usable width, drawer geometry/focus/Escape, table search/add,
  overlay/node intersection 0, document horizontal overflow 0을 검증한다.

### What-If single scroll-owner 슬라이스

중첩 `.main-content` 두 개에 동시에 적용되던 height/padding/overflow 규칙을 semantic scroll owner와
width container로 분리한다.

- outer `workflow-scroll`만 vertical scroll과 sticky step event를 소유한다.
- inner `workflow-content`는 max-width/centering만 소유하고 independent scroll을 만들지 않는다.
- `currentStep` watcher는 step button, next/previous, API transition, restored/new session을 하나의 경로로
  수렴시켜 nextTick 뒤 top/left 0과 sticky false를 보장한다.
- 실제 browser는 scrollable viewport에서 inner overflow visible, owner scroll/sticky, step-change reset,
  Schema 전환 후 What-If 재진입 top 0, SideNav scroll 보존을 검증한다.

### What-If mobile session drawer 슬라이스

390x844 실측에서 app content 338px 중 고정 session sidebar가 280px를 차지해 workflow가 64px,
내부 content가 0px로 축소되는 결함을 mobile presentation boundary에서 교정한다.

- desktop sidebar/collapse는 그대로 두고 768px 이하에서만 absolute overlay drawer로 전환한다.
- mobile trigger와 close button을 분리해 각 breakpoint의 제어 의미를 명확하게 유지한다.
- viewport query state는 drawer의 `aria-hidden`, title/content 노출과 focus lifecycle만 소유하고,
  session 저장/복원 domain state와 결합하지 않는다.
- open 시 close focus, close/backdrop/Escape/restore/new-session 시 trigger focus 복원을 검증한다.
- 실제 browser에서 closed workflow width, drawer containment, tab visibility, session action 후 close,
  horizontal overflow 0과 기존 desktop What-If 회귀를 함께 확인한다.

### Native interaction semantics 슬라이스

전역 click-handler 감사에서 발견된 비-native 상태 변경 control을 도메인 결과는 바꾸지 않고 control
semantics만 교정한다.

- Text2SQL advanced settings는 button disclosure가 panel ID와 expanded state를 소유한다.
- OLAP pivot row/column/measure 제거는 target label을 가진 작은 native button으로 기존 index mutation을
  그대로 호출한다.
- Schema column description은 column 이름을 포함한 edit button으로 기존 draft 전환을 그대로 호출한다.
- CSS는 native button 기본 외형만 reset하고 기존 크기/색/hover를 보존하며 `:focus-visible`을 추가한다.
- 구조 검사와 실제 keyboard activation을 기존 도메인 browser 회귀에 더해 검증한다.

### Ontology disclosure ownership 슬라이스

중첩 action을 가진 Ontology header가 header 전체 click과 child stop-propagation에 의존하는 구조를
disclosure/action 형제 control로 분리한다.

- Object chart header는 chart section toggle만 소유한다. 부모가 소비하지 않던 `configure-chart` emit과
  무응답 톱니는 제거하고 chart configuration은 ObjectType modeler 편집 화면에 단일화한다.
- generation logs는 count를 포함한 button disclosure가 log list의 expanded state를 표현한다.
- datasource candidate는 candidate info button만 detail toggle을 소유하고 preview/confirm은 독립 action을
  유지한다.
- selected mapping과 candidate detail은 콘텐츠 높이를 보존하고 bounded mapping list가 overflow를
  소유한다. 상세 height와 scrollHeight를 실제 browser에서 비교해 flex compression을 금지한다.
- 각 panel/list에 deterministic ID를 부여해 `aria-controls`가 실제 conditional content를 가리키게 한다.
- 구조 gate와 candidate 실제 keyboard flow, 기존 Ontology mutation 회귀로 결과 보존을 검증한다.

### Agents.md context-group ownership 슬라이스

Agents.md context sidebar의 그룹 label, disclosure, mutation action을 실제 상태 소유권에 맞춘다.

- 항상 노출되는 연결 모델 목록은 static group label로 표시하고 죽은 `_models` toggle 호출을 제거한다.
- built-in method group은 각 group의 `expanded` 값과 conditional item list를 native disclosure 하나가
  소유한다.
- ProcessGPT group toggle과 process-add action을 형제 button으로 분리해 중첩 interactive element와
  stop-propagation 의존을 제거한다.
- node type과 group key로 deterministic content ID를 만들고 `aria-controls`가 실제 conditional list를
  가리키게 한다.
- 기존 Agents.md browser verifier에 연결 모델 상시 노출, built-in/ProcessGPT Enter·Space 전환,
  add action의 기존 dialog/retry/mutation 결과를 함께 검증한다.

### Object Explorer row ownership 슬라이스

ObjectType row의 selection과 detail disclosure를 동일 `div` event bubbling에서 분리한다.

- expand button은 type별 deterministic detail ID와 expanded state만 소유한다.
- select button은 row의 나머지 주 surface와 selected state를 소유하고 기존 `type-select` emit을 호출한다.
- 두 button 모두 native Enter/Space와 focus-visible을 제공하고 nested interactive element를 만들지 않는다.
- 실제 gateway-shaped ObjectType fixture에서 expand가 data request 0건임을, select가 data request 1건과
  기존 graph/chart projection을 만드는지를 집중 browser로 검증한다.

### Schema tree disclosure identity 슬라이스

Schema Canvas tree의 disclosure semantics와 상태 identity를 동일 책임 조각에서 바로잡는다.

- datasource header는 datasource subtree ID를 제어하는 native disclosure로 전환한다.
- schema header는 datasource+schema pair로 만든 state key와 table-list ID를 제어하는 native disclosure로
  전환한다. schema 이름 단독 key는 제거한다.
- 두 datasource에 동일한 schema 이름을 제공하는 browser fixture에서 한쪽 Space/Enter toggle이 다른
  datasource의 같은 이름 schema와 table visibility를 바꾸지 않는지 역검증한다.
- table drag/drop, 검색, column exact retry와 기존 Schema Canvas 회귀를 함께 보존한다.

### Cross-domain interaction ownership 배치

이미 분리된 domain 경계를 건드리지 않고 What-If, OLAP, Security의 mouse-only interaction을 한 검증
배치로 교정한다. 각 component의 focused 구조 계약은 즉시 실행하고 type/build/lazy boundary는 배치
끝에서 한 번 실행한다.

- What-If table card는 label과 checkbox의 단일 activation 경로를 사용해 parent click과 child
  stop-propagation 중복을 제거한다. file picker는 drop을 함께 받는 native button으로 전환하고 선택 파일
  상태, invalid extension, same-file selection reset, 실패 뒤 exact File retry를 component가 소유한다.
- OLAP field item은 drag source와 add action을 분리한다. drag payload는 기존 item wrapper가 유지하고
  명명된 native button이 dimension row/measure add를 호출해 pointer와 keyboard 결과를 통일한다.
- Security datasource/schema row는 disclosure와 selection을 형제 button으로 분리하고 deterministic
  subtree ID, `aria-expanded`, `aria-controls`, `aria-pressed`를 제공한다. table row도 selection button을
  사용한다. effective rule projection은 root부터 leaf까지 같은 principal을 overwrite해 가장 구체적인
  rule을 남기고, inherited source와 실제 access level을 별도 필드 의미로 보존한다.
- focused browser는 What-If checkbox/invalid drop/upload 503→동일 file retry, OLAP Enter/Space add와
  drag payload, Security disclosure request 0건·selection 독립성·schema-over-datasource cascade 수준
  표시를 검증한다.
- 배치 종료 시 architecture, type-check, production build, lazy boundary와 실제 화면 캡처를 한 번에
  실행하고, 이 파일들의 의존 경계가 바뀌지 않은 기존 Ontology/Schema 회귀는 재실행하지 않는다.

### Ontology node-detail state ownership 배치

MultiLayer viewer의 layer navigation과 Behavior model read를 같은 selected-node presentation boundary에서
교정한다.

- layer header는 deterministic layer-node-list ID를 제어하는 native disclosure가 되고 collapse set만
  변경한다.
- selected node layer badge는 dropdown disclosure, 각 layer option은 pressed selection control이 된다.
  기존 `changeNodeLayer`의 history checkpoint, immutable node projection, Cytoscape update를 우회하지
  않는다.
- Behavior load는 schemaId+nodeId frozen attempt, sequence, AbortController를 소유한다. 새 node는 이전
  list를 지우고 같은 node refresh는 마지막 성공 list를 유지한다. 실패는 editor 위 inline alert와
  exact retry로 표시하고 abort/stale completion은 상태를 변경하지 않는다.
- saved ontology browser fixture에서 layer Enter/Space와 selection 독립성, Behavior 503→동일
  schema/node retry, 실제 returned model 표시, request header/payload와 화면 비중첩을 검증한다.
- 이 배치의 focused architecture 검사 후 전체 Ontology browser를 한 번 실행하고 type/build/lazy
  boundary는 배치 종료에 한 번만 실행한다.

### Workspace native action ownership 배치

Code Analysis upload workspace와 Schema Modeling의 detail/node presentation에서 interactive ownership만
한 배치로 교정한다.

- upload tab wrapper는 layout만 소유하고 activation button과 close button을 형제로 둔다. activation은
  `aria-selected`와 기존 `activateTab`을, close는 기존 active-neighbor 선택 정책을 그대로 사용한다.
- detail Behavior card에는 전체 card hitbox를 제공하는 명명된 native edit button을 두고 기존
  `openEditBehaviorDialog` payload를 재사용한다.
- table-node column source와 expansion은 native button으로 바꾸되 reference popup target/request와
  `displayColumns` projection을 변경하지 않는다. reference popup 위치는 pointer click이면 pointer,
  keyboard synthetic click이면 control bounds를 anchor로 사용하고 popup 실측 최대 폭을 기준으로 X/Y를
  viewport 안에 clamp한다.
- table-node Behavior는 mouse-only double-click과 hover 조건을 제거하고 명명된 edit/run sibling
  buttons가 기존 emit handler를 각각 호출하게 한다.
- 세 화면의 keyboard activation, selected/expanded state, exact emit 결과를 focused browser/구조
  계약으로 검증한다. type-check, production build, lazy boundary는 배치 끝에서 한 번만 실행하고 이미
  통과한 Ontology service 회귀는 영향 경로가 없으므로 반복하지 않는다.

### Ontology secondary action ownership 배치

MultiLayer viewer에 남은 secondary interaction 다섯 종류를 하나의 Ontology workspace 배치로 교정한다.

- canvas/edge context menu는 `role=menu`와 native menuitem buttons를 사용하고 기존 add/edit/delete
  handlers를 그대로 호출한다.
- relation row는 정보 projection을 유지하고 별도의 명명된 edit button을 제공해 mouse double-click
  전용 경로를 제거한다.
- PDF drop zone은 native picker button과 hidden file input을 연결한다. drag/drop, PDF validation,
  same-file selection과 기존 generation request는 유지한다.
- datasource mapping header는 deterministic details ID를 제어하는 native disclosure가 되고 candidate
  preview/confirm은 details 안의 별도 controls로 남는다.
- node datasource result outer click은 제거하고 preview/select sibling buttons 중 select가
  `aria-pressed`와 기존 selected target을 함께 소유한다.
- 기존 Ontology browser fixture의 실제 context/relation/PDF/mapping/search flows에 keyboard assertions를
  추가한다. focused architecture·type/browser 뒤 production build/lazy boundary는 배치 끝에 한 번만
  실행한다.

### Modeling source action ownership 배치

Schema Canvas와 ObjectType Modeler의 drag source/card actions를 하나의 modeling workspace 배치로
교정한다.

- Schema Canvas catalog search/tree table row의 layout/drag owner와 selection/add/remove controls를
  분리한다. on-canvas table은 selection과 removal을, off-canvas table은 add를 native sibling buttons로
  제공한다.
- semantic search result는 drag payload를 유지하면서 target-labelled native add button으로 기존
  `addSemanticResultToCanvas`를 호출한다.
- ObjectType card는 drag wrapper를 유지하되 항상 보이는 add/Behavior/edit/delete sibling buttons로
  기존 projection과 handlers를 호출하고 mouse double-click·hover-only discoverability를 제거한다.
- saved-schema와 selected-node name은 이미 존재하는 native edit action만 편집을 소유하도록 redundant
  double-click handler와 안내 문구를 제거한다. resize separator의 pointer double-click은 Home keyboard
  reset과 동일한 보조 입력이므로 유지한다.
- Schema Canvas batch와 Ontology Behavior/ObjectType browser fixture에서 Enter/Space, exact add/select/
  remove 결과, drag JSON, responsive geometry를 검증한다. architecture·type은 focused 구현 뒤,
  production build/lazy boundary는 배치 끝에서 한 번만 실행한다.

### Selection result ownership 배치

Schema Modeling과 Ontology Explorer에서 layout row가 activation까지 겸하는 남은 세 책임을 한 배치로
교정한다.

- Behavior 실행 attempt는 native selection button과 `aria-pressed`가 현재 detail selection을 소유하고,
  timeline layout과 status/error projection은 presentation으로 남긴다.
- table/column procedure/framework reference 결과의 simulated button을 native button으로 바꾸고 기존
  navigation emit, keyboard popup anchor, close 정책을 보존한다.
- ChildSelectDialog는 row click toggle을 제거하고 각 child label과 연결된 checkbox가 selection을
  소유한다. 전체 checkbox는 이름, filtered scope, checked/indeterminate state를 유지한다.
- Catalog glossary term row는 이미 Enter/Space row selection과 nested action stop-propagation을
  제공하므로 이 배치의 변경 대상에서 제외한다.
- architecture 규칙과 focused browser에서 keyboard activation, exact emit/request count, filtered
  selection·confirm 순서, desktop/mobile geometry를 검증한다. type-check, production build,
  lazy/build boundary는 배치 종료에 한 번 실행하고 비영향 전체 suite는 마일스톤 회귀까지 반복하지 않는다.

### Transient action ownership 배치

Text2SQL message window와 Electron Scope Browser의 일시적 action surface를 한 배치로 교정한다.

- Text2SQL hidden-message reveal은 native button이 소유한다. tool/thinking을 제외한 표시 대상 필터,
  최근 30개 window, 숨김 수와 전체 확장은 application의 단일 순수 projection을 사용해 숫자와 결과가
  어긋나지 않게 한다.
- Scope Browser context menu는 pointer와 Shift+F10을 같은 open 정책으로 조립하고, 실제 menu 크기로
  viewport를 clamp한다. menuitem Escape는 원래 treeitem으로 focus를 돌려준다.
- Scope Browser의 자체 alertdialog markup/CSS는 제거하고 shared `ActionDialog`를 사용한다. 기존
  Promise 기반 trash confirmation은 target을 보존하고 cancel/Escape에서 IPC를 호출하지 않는다.
- toast는 managed timer와 명시적 close action을 한 dismissal 함수로 결합한다.
- architecture, focused browser와 timer contract에서 native ownership, exact IPC target, cancel 0건,
  confirm 1건, focus/Escape, 390×844 geometry를 검증한다. 영향 없는 backend suites는 반복하지 않고
  type-check/build/lazy boundary는 배치 끝에 한 번 실행한다.

### Managed delayed-lifecycle 배치

raw timer 전수검색 결과 중 명시적 start/stop이 있는 interval은 보존하고, component/store 종료 뒤 stale
callback이 가능한 네 surface만 공용 `useManagedTimeouts`의 named latest-wins lifetime으로 교정한다.

- Ontology extraction canvas의 schema/init/manual fit은 `canvas-fit` 하나를 공유한다.
- ObjectType chart save status는 새 저장·dialog close에서 이전 clear를 취소하고 scope dispose에서
  정리한다.
- BPMN은 inline/popup별 deferred viewport key, resize key, popup-open key, save-status key를 소유한다.
  popup generation과 현재 modeler identity를 확인해 close/model change 뒤 editor·listener·viewport
  callback이 살아나지 않게 한다. 현재 diagram-js가 implicit keyboard binding을 사용하므로 제거된
  `keyboard.bindTo` 옵션은 inline viewer와 popup editor 양쪽에서 삭제한다.
- runtime theme transition은 마지막 theme change가 fade class 제거 시점을 소유한다.
- ObjectType chart status를 chart editor 앞에 배치하고 dialog/close label·Escape·focus trap/복귀를
  명시한다. 720px 이하는 config/preview와 field row를 세로로 배치한다. BPMN inline fit은
  viewport의 75% 이하 높이와 1.5배 이하 확대를 사용한 뒤 canvas 자체 fit/pan을 유지하며 popup editor는
  별도 viewport를 그대로 사용한다.
- 순수 fake scheduler 계약은 key replacement, cancel, scope clear를 검증한다. focused browser는 빠른
  theme toggle과 ObjectType/BPMN close/reopen·save status를 실제 조작하고 console/page 오류와 geometry를
  확인한다. architecture/type/build/lazy는 배치 경계에서 한 번 실행한다.

### Shared form-dialog focus lifecycle 배치

Analyzer 기존 데이터 처리, Security 권한 추가, Ontology extraction feedback, Ontology 동의어 제안의
mutation과 화면별 draft는 그대로 두고, modal keyboard/focus 소유권만 shared composable로 추출한다.

- shared lifecycle은 active getter와 dialog ref를 감시해 open 직전 trigger를 보존하고, open 뒤 지정된
  initial control 또는 첫 focusable control로 이동한다.
- document capture listener는 active 동안 한 번만 존재하고 Escape close와 Tab/Shift+Tab 순환을
  담당한다. close·unmount에서는 listener를 해제하고 연결된 trigger로 focus를 복귀시킨다.
- 각 dialog는 고유 label, `aria-modal`, 이름 있는 close와 mobile max-height/internal scroll을
  제공한다. mutation pending, exact retry, 부분 실패와 payload는 component/domain이 계속 소유한다.
- focused browser는 각 trigger→initial focus→Tab trap→Escape→focus 복귀와 기존 핵심 submit 결과를
  검증한다. architecture와 composable unit은 즉시 실행하고 type-check/build/lazy boundary는 네 화면
  배치 종료에 한 번 실행한다.

### Ontology canvas latest-task scope 배치

`MultiLayerOntologyViewer`의 임의 증가 timer key를 backend 지식 없는 shared latest-task scope로
교체한다. scope는 named task replacement와 generation invalidation만 소유하며 Cytoscape와 schema
mutation은 viewer가 계속 소유한다.

- schema projection commit과 외부 canvas destroy는 generation을 증가시키고 pending task를 모두
  취소한다. init 내부의 이전 canvas 교체는 현재 generation을 유지한다.
- `canvas-init`, `selection-restore`, `canvas-viewport-sync`, `edgehandles-zoom-restore`,
  `schema-loading-settle` 다섯 key만 사용한다. 같은 책임의 후속 요청은 이전 timer를 대체한다.
- zero-size retry와 layoutstop listener는 schedule/등록 당시 generation을 전달한다. callback은 해당
  generation이 현재일 때만 실행한다.
- detail panel open/close/resize는 DOM 반영 뒤 `canvas-viewport-sync`를 coalesce한다. 현재 zoom을
  유지한 채 canvas를 resize하고 선택 node 또는 전체 node를 실제 가용 폭 중앙으로 이동한다.
- edgehandles zoom restore는 drag 시작 당시 canvas identity를 함께 확인한다.
- fake scheduler unit은 key replacement, begin/clear invalidation, stale generation schedule 거부와
  scope dispose를 검증한다. focused browser는 rapid A→B load에서 B만 렌더·복원·loading 종료하는지
  확인하고, architecture/type/build/lazy boundary는 배치 끝에 한 번 실행한다.

### Modeling dialog lifecycle 배치

shared `ActionDialog`, Schema Modeling의 cardinality/Catalog relationship, Ontology Modeling의
relationship/ObjectType delete를 backend 지식 없는 `useDialogFocusLifecycle`에 정렬한다.

- 각 component가 mutation target, draft, payload, pending/error와 exact retry를 계속 소유하고 shared
  lifecycle에는 active/dialog/initial focus/close 가능 여부만 전달한다.
- cardinality dialog는 parent의 `isConnecting`과 visible error를 입력으로 받아 pending 중 close와
  중복 confirm을 막고, 실패 뒤 같은 connection/cardinality/description으로 재시도한다.
- ObjectType delete는 확인 name input을 초기 focus로 사용하고 pending 중 overlay/Escape/cancel로
  target을 폐기하지 않는다. 성공 뒤 기존 list/canvas refresh 순서를 유지한다.
- open 생산자가 없는 ObjectType rename state, handlers, template, styles와 API call 소비는 제거하고
  re-entry를 architecture contract로 막는다.
- `CloseButton`은 시각 title과 같은 accessible name 및 disabled 상태를 native button에 전달한다.
- focused harness/browser는 초기 focus, 양방향 trap, Escape/trigger 복귀, pending close 차단,
  visible retry, mobile containment와 기존 emitted result를 확인한다. architecture/unit은 즉시,
  type-check/build/lazy boundary는 다섯 화면 배치 끝에 한 번 실행한다.

### Cross-domain form-dialog lifecycle 배치

Text2SQL feedback, Text2SQL→Ontology instance, Ontology Behavior, ObjectType edit의 복제 focus 코드를
`useDialogFocusLifecycle`로 이동한다.

- shared lifecycle에 optional suspension을 추가한다. suspension은 nested dialog 동안 key handling만
  건너뛰며 listener, activation generation, outer trigger를 유지한다.
- focusable projection은 실제 layout에서 보이지 않는 `v-show` inactive control을 제외한다.
- Behavior outer dialog는 delete alertdialog open 동안 suspended이고 기존 ActionDialog가 delete
  pending/error/exact retry와 inner trigger 복귀를 소유한다.
- ObjectType edit는 rename/chart mutation을 하나의 close guard로 묶고 close control/overlay/Escape에
  같은 정책을 적용한다. 성공 emit과 sample-data read lifecycle은 바꾸지 않는다.
- Text2SQL feedback은 approved 여부에 따른 textarea/close 초기 focus와 notes reset을 보존한다.
  instance dialog는 open reset/schema load와 close metadata invalidation을 기존 watch에 남기고
  keyboard/focus 소유만 shared로 이동한다.
- 기존 Text2SQL full browser, Behavior full browser, Object chart browser를 회귀 증거로 사용한다.
  unit/architecture는 즉시, type-check/build/lazy boundary는 네 화면 배치 끝에 한 번 실행한다.

### Remaining action/editor dialog focus ownership 배치

App Settings danger action, Text2SQL history delete, Agents.md ProcessGPT selector, OLAP cube manager와
cube editor의 복제 focus 코드를 `useDialogFocusLifecycle`로 이동한다.

- Settings/History의 고유 title/description/error/retry skin과 parent mutation 상태는 유지하고
  keyboard/trigger 수명주기만 shared로 이동한다.
- ProcessGPT selector는 open 시 draft reset과 process list load, close 시 in-flight list cancel과
  process mutation state 정리를 기존 workflow에 남긴다. mutation pending만 close를 차단한다.
- OLAP manager는 nested cube-delete ActionDialog 동안 suspended되며 cancel 뒤 delete trigger로,
  manager close 뒤 원래 toolbar trigger로 복귀한다.
- OLAP cube editor는 nested full-reload/redeploy ActionDialog 동안 suspended되고 editor busy 또는
  pending action이면 overlay/Escape/close를 차단한다. ETL script cancellation/reset과 API payload는
  바꾸지 않는다.
- BPMN의 document shortcut은 popup modeler lifecycle과 Ctrl+S를 함께 소유하므로 공용 dialog
  focus와 다른 책임으로 유지한다. What-If causal modal은 graph/chart animation dispose를 포함한
  visualization 배치에서 처리한다.
- 기존 app-shell, Text2SQL, Agents.md, OLAP 실제 browser runner를 재사용한다. architecture/unit은
  즉시, type-check/build/lazy boundary는 다섯 화면 배치 끝에 한 번 실행한다.

### Visualization/detail/form modal lifecycle 배치

What-If causal explainability, Ontology SQL instance explorer, Security audit detail, Object Explorer
child selection, Catalog holiday form을 shared dialog focus lifecycle에 정렬한다.

- Causal overlay의 dialog semantics를 실제 panel로 옮기고 close action을 initial focus로 사용한다.
  global window Escape listener는 제거하되 open/result/selection watch와 Cytoscape, Chart,
  animation generation disposal은 그대로 유지한다.
- SQL instance explorer는 open마다 adoption config와 operation message를 초기화하고 close 시 named
  delayed auto-close를 취소한다. create pending close guard와 Text2SQL→MV→bulk create payload,
  partial warning 결과는 유지한다.
- Audit detail은 선택 log를 그대로 표시하고 close 뒤 row action trigger로 복귀한다.
- Child selection은 search를 initial focus로 사용하고 검색/전체/개별 selection과 confirm result를
  유지한다.
- Holiday form은 date input initial focus, draft reset/commit과 calendar save payload를 유지한다.
- 기존 What-If, Ontology SQL instance, Object chart, business calendar browser를 재사용하고 Security
  native-interaction runner에 audit fixture와 detail focus/Escape/mobile geometry를 추가한다.
  architecture/unit은 즉시, type-check/build/lazy boundary는 다섯 화면 배치 끝에 한 번 실행한다.

### MultiLayer graph context action presentation 배치

`MultiLayerOntologyViewer`의 canvas·node·relationship context menu markup과 skin을
`ui/canvas/OntologyGraphContextMenu.vue`로 이동한다.

- 새 컴포넌트는 visible mode, viewport-clamped position, layer presentation, node/relationship
  label만 입력받고 native menu action event만 반환한다.
- 부모는 graph position, add/relation/filter/What-If/rename/delete handler, Cytoscape와 local
  history commit을 계속 소유한다. API·store·graph mutation은 자식으로 이동하지 않는다.
- 기존 class, role, aria-label, item 순서와 문구를 유지하고 menu SCSS와 light-mode override는
  컴포넌트가 소유한다.
- 구조 검사는 부모의 세 menu markup 재유입과 자식의 domain API/Cytoscape 의존을 차단한다.
  기존 Ontology 실제 browser의 canvas/node/edge context action, keyboard, mobile filter/delete
  결과를 재사용하고 type-check/build/lazy boundary는 이 표현 배치 끝에 한 번 실행한다.

### MultiLayer canvas overlay presentation 배치

관계 생성 대기 banner, edgehandles 연결 모드 toolbar, node/edge legend를
`ui/canvas/OntologyGraphOverlay.vue`로 이동한다.

- overlay는 pending source name, relation-mode pressed/disabled, layer presentation만 입력받고
  cancel/toggle event만 emit한다.
- 부모는 pending source id, node identity lookup, loading/node count, edgehandles enable/disable,
  relation draft와 Cytoscape를 계속 소유한다.
- node context에서 관계 대기로 전환할 때 부모의 기존 `deselectNode()` lifecycle로 상세 panel을
  닫아 mobile에서도 canvas target과 cancel 안내를 조작 가능하게 한다. source id는 context target
  snapshot에서 유지하고 이전 selected node도 별도 snapshot해 취소/target 선택 뒤 유효하면 기존
  `selectNode()` lifecycle로 복원한다. 기존 layer-list target 선택은 유지하고 mobile banner의
  stacking layer만 layer overlay보다 높여 안내와 취소가 가려지지 않게 한다.
- 기존 class와 dark/light/mobile skin을 overlay로 함께 이동한다. toggle은 `aria-pressed`와 현재
  action label을, banner는 `role=status`와 이름 있는 cancel을, legend는 이름 있는 group을 제공한다.
- 구조 검사는 부모의 overlay markup 재유입과 자식의 API/Cytoscape/graph state 의존을 차단한다.
  기존 Ontology browser에 toggle pressed round-trip, banner cancel 무변경, legend와 geometry를
  추가하고 type-check/build/lazy boundary는 배치 끝에 한 번 실행한다.

### MultiLayer layer panel presentation 배치

layer panel header/toggle, layer disclosure와 node action list를
`ui/canvas/OntologyLayerPanel.vue`로 이동한다.

- 부모가 layer definition과 node arrays를 기존 순서대로 group projection하고 panel/layer collapsed,
  selected node id를 자식에 전달한다.
- 자식은 native panel/layer/node controls와 skin만 소유하고 panel toggle, layer toggle, node
  activate, node context event를 emit한다.
- 부모는 pending relation 분기, node selection/detail load, context-menu clamp/target,
  Cytoscape class와 graph state를 계속 소유한다.
- 기존 id, aria-expanded/controls/pressed, count, keyboard/context action과 44px collapsed/mobile
  overlay geometry를 보존한다. 구조 검사와 전체 Ontology browser, direct desktop/mobile 캡처,
  type-check/build/lazy boundary를 배치 단위로 실행한다.

### MultiLayer relation detail presentation 배치

relation detail의 endpoint preview, type/description form, source/target column 상태와 action을
`ui/canvas/OntologyRelationDetail.vue`로 이동한다.

- 부모의 `useOntologyRelationEditor`가 relation identity, abort/stale column load, form state,
  validation, history checkpoint와 local graph commit을 계속 소유한다.
- 자식은 controlled form field update와 save intent를 분리해 emit한다. select change는 update 뒤
  save, description은 blur/Enter save라는 기존 commit timing을 보존한다.
- datasource 연결은 source/target node identity를 event로 반환하고 column retry/delete/close도
  intent만 반환한다. API/Cytoscape/local mutation import는 구조 검사로 차단한다.
- 기존 relation editor 성공·부분 column 실패·retry·datasource 연결·삭제/닫기 회귀에 child
  boundary를 추가하고 type-check/build/lazy boundary는 관련 detail 배치 끝에 한 번 실행한다.

### MultiLayer node detail navigation/info presentation 배치

node detail의 header/tab controls는 `ui/canvas/OntologyNodeDetailHeader.vue`, info tab은
`ui/canvas/OntologyNodeInfo.vue`로 이동한다.

- header는 active tab, data/analysis/BPMN capability, Behavior loading/count만 입력받고 delete/close와
  tab intent를 emit한다. 부모의 단일 dispatcher가 기존 data fetch, analysis transition,
  Behavior load와 BPMN guard를 호출한다.
- info는 node snapshot, canonical layer presentation, filter chip과 relationship projection,
  controlled name/layer-selector state만 입력받는다. input focus/select는 편집 UI가 소유한다.
- 부모는 rename/layer history checkpoint, graph array/Cytoscape update, datasource dialog와 relation
  editor lifecycle을 계속 소유한다. 자식의 API/history/Cytoscape import는 구조 검사로 차단한다.
- tablist/tab/tabpanel identity와 selected/disabled/busy state를 연결하고 기존 keyboard action,
  name Enter/blur/Escape, layer change, datasource/relation edit 결과를 전체 Ontology browser와
  desktop/mobile 캡처로 확인한다. type-check/build/lazy boundary는 배치 끝에 한 번 실행한다.

### MultiLayer Behavior/BPMN tab presentation 배치

- Behavior loading/error/retry와 `AgentsMdEditor` composition을 `OntologyNodeBehaviorPanel.vue`로,
  BPMN viewer/empty presentation을 `OntologyNodeBpmnPanel.vue`로 이동한다.
- 부모는 abortable model read, frozen retry target, selected node/schema와 XML graph mutation을
  소유하고 자식은 retry/refresh/saved intent만 emit한다.
- 구조/type/전체 Ontology browser로 실패·retry·editor refresh·BPMN save와 tabpanel identity를
  검증하고 production build/lazy boundary는 배치 끝에 한 번 실행한다.

### MultiLayer Analysis/Data state presentation 배치

- Analysis header/empty/Causal panel composition은 `OntologyNodeAnalysisPanel.vue`, Data loading/empty
  actions는 `OntologyNodeDataState.vue`, source/business-day summary는 `OntologyNodeDataSummary.vue`로
  이동한다.
- 부모는 API target/retry/fallback, ECharts/brush와 causal lifecycle을 유지하고 controlled metric/
  business-day update 뒤 기존 재계산·reload를 수행한다.
- 구조/type/전체 Ontology browser로 idle/running/failure/cancel/result, no-source/read-failure/fallback,
  business toggle과 desktop/mobile containment를 검증한 뒤 build/lazy boundary를 한 번 실행한다.

### MultiLayer Data chart/table presentation 배치

- chart host/header/brush/config bar를 `OntologyNodeDataChart.vue`, raw table을
  `OntologyNodeDataTable.vue`로 이동한다.
- chart child는 host mount/unmount event를 emit하고 부모가 `chartContainerRef`·ECharts init/dispose,
  brush extraction과 causal state를 유지한다. config reveal scroll은 UI가 selection 변화에 맞춰 소유한다.
- table child는 기존 Korean number/date formatting과 column type marks, first-50 boundary를 소유한다.
- 구조/type/전체 Ontology browser와 chart/table screenshot, production build/lazy boundary로 검증한다.

### MultiLayer filter/relation draft dialog presentation 배치

- node filter form은 `OntologyNodeFilterDialog.vue`, local relationship draft form은
  `OntologyNewRelationDialog.vue`로 이동한다.
- 자식은 controlled draft projection과 update/retry/clear/confirm/cancel intent, 공용 modal focus
  lifecycle만 소유한다. 부모는 filter propagation·node-data reload, graph history·Cytoscape commit을
  유지한다.
- 기존 unsupported range/date 안내, distinct retry, cascading/conflict 표시, relation type/description,
  desktop/mobile geometry를 보존하고 구조/type/전체 Ontology browser·실물·build/lazy boundary로 검증한다.

### MultiLayer node-data chart runtime 배치

- ECharts host/instance/render/dispose/resize와 line brush event bridge를
  `useOntologyNodeDataChart.ts`로 이동한다.
- composable은 validated node-data projection과 causal selection callback만 소비하고 API,
  Cytoscape, analysis request를 소유하지 않는다. viewer는 host/activate intent와 ready state만
  presentation에 연결한다.
- host 교체·empty/table·theme·unmount cleanup, delayed latest render, brush restore/selection을
  구조/type/전체 Ontology browser·실물·build/lazy boundary로 검증한다.

### MultiLayer datasource auto-link presentation 배치

- auto-link progress, mapping stats/list, candidate disclosure/detail과 footer를
  `OntologyDatasourceMappingDialog.vue`로 이동한다.
- child는 pure stats/status/format projection과 controlled intent, modal focus만 소유하고 SSE,
  abort, single/bulk confirmation과 canvas mapping commit은 기존 composable/viewer에 유지한다.
- nested bulk confirmation 중 parent dialog focus를 suspend하고 exact retry, keyboard disclosure,
  candidate preview, desktop/mobile geometry를 구조/type/전체 Ontology browser·실물·build/lazy
  boundary로 검증한다.

### MultiLayer single-node datasource/sample presentation 배치

- search/manual/ObjectType/table selection dialog를 `OntologyNodeDatasourceDialog.vue`, sample loading/
  failure/table dialog를 `OntologyDatasourceSampleDialog.vue`로 이동한다.
- children은 controlled field/selection intent와 nested modal focus만 소유하고 catalog/search/probe/
  confirmation API, abort, frozen retry target은 `useNodeDatasourceDiscovery`에 유지한다.
- catalog/search/sample/confirm failure와 exact retry, ObjectType execution datasource, sibling preview/
  selection actions, desktop/mobile geometry를 구조/type/전체 Ontology browser·실물·build/lazy
  boundary로 검증한다.

### MultiLayer viewer shell/generation/API lifecycle 재건설 배치

- library/header/delete, operation notice, generation dialog/form/progress/outcome를 이름 있는 controlled
  UI로 이동하고 각 style block도 소유 컴포넌트로 이동한다.
- Viewer의 Behavior read, Measure→ObjectType creation, ontology save payload/response ID validation을
  workflow composable로 이동해 Vue controller의 직접 backend API import를 제거한다.
- backend 실서버를 기동하지 않는다. 원문 endpoint의 request/response 계약과 frontend runtime
  parser/client만 정적으로 대조하며, 큰 코드 배치 뒤 type/architecture를 한 번 실행하고 최종
  type/build/대표 smoke에서 통합 검수한다.

## Risks

| 위험 | 대응 |
|---|---|
| 기존 208 타입 오류가 새 회귀를 가림 | domain 전용 strict 검사와 오류 diff를 함께 사용하고 최종적으로 전체 오류를 제거한다. |
| 동적 import 누락 | feature registry, Vite federation, 문자열 경로를 이동 슬라이스마다 전수 검색한다. |
| 거대한 컴포넌트 분해 중 동작 손상 | 사용자 이벤트·props·emits·API sequence를 먼저 계약 테스트로 봉인한다. |
| 선택 backend 미기동 | mock fallback을 추가하지 않고 원문 API 계약만 정적으로 대조한다. 실제 통합
  성공 여부는 별도 backend E2E 단계로 넘긴다. |
| 진행 중 그래프 WIP 충돌 | dirty 파일 목록을 매 슬라이스 전 재확인하고 Analyzer 슬라이스를 뒤로 미룬다. |
