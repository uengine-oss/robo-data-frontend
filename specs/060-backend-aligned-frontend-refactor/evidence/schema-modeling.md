# Schema Modeling Responsibility and UI Evidence

## Scope

`src/workflows/schema-modeling/state/schemaCanvas.ts`의 관계선 projection과 Catalog 관련 테이블 로딩을
첫 T042 책임 슬라이스로 감사했다. 공개 Pinia action, feature id, API method/path, 테이블 추가 동작은
유지하고 관계 identity·표시 정책·오류 상태를 분리했다.

## Findings and fixes

- 사용자 cardinality, Catalog provenance, 노드 위치로 Vue Flow edge를 만드는 로직을
  `model/relationshipEdgeProjection.ts`의 순수 projection으로 분리했다.
- 같은 from/to/type의 DDL·code 관계를 하나로 오판해 뒤의 관계를 버리던 결함을 확인했다. source까지
  identity에 포함하고 동일 source의 column pair만 순서 보존 병합한다.
- Catalog 관련 관계가 없거나 요청이 실패할 때 `_id` 컬럼명으로 테이블 관계를 추정하던 fallback을 제거했다.
  빈 관계는 빈 관계로 유지하고 장애는 화면의 재시도 가능한 오류로 표시한다.
- Analyzer 진행 overlay를 upload/graph 기능에만 렌더해 schema 범례·미니맵을 가리던 전역 상태 침범을
  제거했다. Analyzer 오류와 로그는 store에 남아 해당 기능으로 돌아가면 다시 확인할 수 있다.
- 캔버스 오류 알림은 상단 중앙 제한 폭으로 배치해 범례와 겹치지 않게 했다.
- 테이블/ObjectType 조회 SQL 생성, datasource 결정, 후보 SQL fallback, Data Fabric 응답 정규화를
  `application/tableDataQuery.ts`로 분리했다. store는 패널 수명주기와 화면 상태 적용만 조정한다.
- 테이블 데이터 패널의 진입 전환 selector가 주석에 합쳐져 enter animation이 적용되지 않던 결함을
  수정하고, 패널이 실제 viewport 안에 들어온 뒤 계약과 캡처를 검증한다.
- 소스 패널 state와 Statement 설명 로딩을 `application/sourceCodePanel.ts`로 분리했다. 원본 없음과
  원본 로드 실패를 계속 구분하고, 설명 API 실패는 코드를 유지한 채 재시도 경고로 표시한다. 패널 전환·닫기
  뒤 늦게 도착한 응답은 request id와 패널 identity 검사로 폐기한다.
- 실시간 캔버스 highlight의 개별 타이머를 `model/expiringMap.ts`로 통합했다. 같은 key 재갱신은 이전
  타이머를 취소하고, 캔버스 초기화와 store dispose에서 모든 값·타이머를 정리한다. 소비되지 않으면서
  영구 누적되던 `newRelationships`도 같은 5초 수명주기를 갖는다.
- 컴포넌트의 검색 debounce, fit-view, 소스 강조 스크롤은 `useManagedTimeouts`가 수명주기를 소유한다.
  Behavior 행 실행 상태·결과·오류·코드 선택은 `useBehaviorExecution`으로 분리하고, 닫기/취소 후 늦게
  도착한 실행 결과가 팝업을 다시 여는 경쟁 조건을 막았다.
- handle/edge/빈 공간 drop 파싱은 `model/relationshipInteraction.ts`로 분리했다. 하이픈이 포함된 컬럼과
  좌우 handle suffix를 동일 규칙으로 처리한다.
- Catalog TABLE 관계와 Ontology ObjectType 관계가 별도 API라는 백엔드 원문을 확인했다. 일반 schema edge가
  Ontology 편집·삭제 후 Catalog 삭제까지 중복 호출하던 경계를 제거했다. 일반 schema는 Catalog 전용
  다이얼로그를 사용하며 user 관계만 Catalog DELETE가 가능하고 DDL/code/procedure 관계는 읽기 전용이다.
- PowerShell background process 없이 Vite와 브라우저의 수명주기를 한 Node 프로세스가 소유하는
  `contracts/run-browser-suite.mjs`를 추가했다.
- `TableNode.vue`가 직접 소유하던 Catalog 참조 조회, Analyzer 소스 조회, 팝업 위치 계산과 요청 경합 방지를
  `composables/useTableReferences.ts`로 분리했다. 로컬 highlight 타이머도 제거해 store의 만료 정책을 단일
  소유자로 만들었으며, 빠른 컬럼·소스 전환에서 늦은 응답이 현재 선택을 덮지 못하게 했다.
- Catalog schema 응답을 `domains/catalog/api/schemaContracts.ts`의 런타임 parser로 고정했다. 관계 생성은
  `created: true`, 삭제는 `deleted: number`, 설명 편집은 `updated: true`가 아니면 성공으로 처리하지 않는다.
  설명 편집과 의미 검색은 설정 키를 실제 backend 요구 헤더인 `X-API-Key`로 명시적으로 매핑하면서 기존
  session/Neo4j 헤더를 함께 보존한다.
- table node, column cache, 선택, 삭제, 관계 projection의 identity를 `datasource + schema + name`으로
  통일했다. 같은 schema/name이 여러 datasource에 있거나 backend 관련-table 응답이 datasource를 생략해
  유일하게 식별할 수 없으면 첫 항목을 고르지 않고 요청/투영을 중단한다.
- Catalog column API가 `public`을 이름/FQN 조회로 취급하는 실제 동작을 반영해 exact 요청 실패 뒤 빈 schema로
  재요청하던 fallback과 table-name cache를 제거했다. 성공한 빈 컬럼 배열은 실제 빈 결과로 캐시한다.
- 관계 생성 UI가 backend에서 받지도 사용하지도 않는 `matchStrategy`를 보여주고 payload에 넣던 가짜 계약을
  제거했다. 대상 테이블은 canonical key로 선택하고 실제 target schema를 전송한다.
- 테이블/컬럼 설명과 관계 생성·삭제는 작업별 pending/error/exact-retry를 소유한다. primary mutation 성공 뒤
  목록 refresh 실패는 mutation 실패로 되돌리지 않고 별도 warning으로 보존한다.
- 관계 삭제와 캔버스 비우기는 공용 `ActionDialog`의 focus/Escape/pending/error 수명주기를 사용한다.
  검색·fit-view·highlight 지연 작업은 managed timeout으로 통합했다.

## Verification

- `node specs/060-backend-aligned-frontend-refactor/contracts/test-domain-contract-parsers.mjs`: PASS
  - cardinality 4종, 좌우 handle, source별 색/점선, 비가시 상태, invalid pair, 중복 edge
  - source identity 보존, 동일 source column pair 병합, 입력 불변성
- `node specs/060-backend-aligned-frontend-refactor/contracts/test-schema-modeling-contracts.mjs`: PASS
  - Catalog schema runtime response contract와 invalid success 거부
  - datasource/schema/name canonical identity, ambiguous 관계·column lookup 거부
  - canonical node의 handle/empty-drop projection
  - 설명 편집의 encoded path, session header 보존, `X-API-Key`, exact body
- `npm.cmd run type-check`: PASS
- `node specs/060-backend-aligned-frontend-refactor/contracts/check-architecture.mjs`: PASS across 381 TS/Vue files
- `node specs/060-backend-aligned-frontend-refactor/contracts/run-browser-suite.mjs verify-schema-relationship-ui.mjs`: PASS
  - 1920×1080 user/DDL/code 관계 동시 렌더링
  - label/color/dash와 DDL visibility 독립 토글
  - Catalog 503에서 재시도 오류, 추정 customer node/edge 0
  - Analyzer 진행 UI의 upload/graph 문맥 제한
  - 오류 알림과 범례 bounding-box 비중첩
  - Data Fabric 요청의 `datasource/query/max_rows`, 응답 컬럼·행·실행시간 보존
  - Limit 25→10 재조회와 Data Fabric 503의 가짜 데이터 없는 오류 표시
  - Statement 503에서 원본 코드 보존·오류 노출, 재시도 후 AI 설명 복구
  - 실제 테이블 참조 버튼 → `load_orders` 선택 → Analyzer 소스 패널 흐름과 `file_path/start_line/end_line` 전달
  - Catalog edge 확인·삭제 중 Ontology 관계 API 호출 0, Catalog DELETE 정확히 1회
  - DDL/code 분석 관계의 읽기 전용 UI와 user 관계 삭제 뒤 code edge 보존
  - 390×844 설명 저장 503에서 draft·편집 상태 보존, 같은 입력 재시도 성공
  - 테이블/컬럼 설명 요청의 `X-API-Key`, session header, backend body 실측
  - 관계 생성의 실제 target schema 보존과 `matchStrategy`/`match_strategy` 0
  - 모바일 detail panel viewport 포함과 document horizontal overflow 0
- `npm.cmd run build`: PASS, 4,842 modules transformed
- 직접 확인한 캡처:
  - `schema-relationship-projection-1920x1080.png`
  - `schema-relationship-failure-1920x1080.png`
  - `schema-table-data-1920x1080.png`
  - `schema-source-annotation-retry-1920x1080.png`
  - `schema-catalog-relationship-boundary-1920x1080.png`
  - `schema-detail-lifecycle-390x844.png`

## 2026-07-24 Catalog discovery lifecycle addendum

- Catalog 테이블 목록, 의미 검색, canonical `datasource + schema + table` 컬럼 cache/error/in-flight
  request를 `application/schemaCatalogDiscovery.ts`와 `composables/useSchemaCatalogDiscovery.ts`로
  분리했다. `schemaCanvas.ts`의 세 read API 직접 호출과 Schema Modeling의 Text2SQL 표시 타입 의존은
  제거했으며 파일 크기는 1,726줄에서 1,521줄로 줄었다.
- 목록과 의미 검색은 각자 AbortController와 request sequence를 소유한다. 새 요청·검색 초기화·scope
  종료는 이전 요청을 취소하고 AbortSignal을 무시한 늦은 응답도 commit하지 않는다. 실패 시 마지막 정상
  목록·검색 결과를 유지하며 의미 검색은 실패 당시 query를 고정해 명시적으로 재시도한다.
- 컬럼 조회는 canonical identity별 성공 결과만 cache하고 정상 empty array도 실제 결과로 cache한다.
  같은 identity의 동시 요청은 하나로 합치며, ambiguous identity는 API 호출 전에 거절한다. 실패는 cache를
  오염시키지 않고 datasource/schema/table identity가 포함된 화면 오류로 남는다.
- `test-schema-catalog-discovery.mjs`와 `test-schema-modeling-contracts.mjs`: PASS. stale/abort, 이전 결과
  보존, exact retry, in-flight dedupe, empty cache, ambiguity, scope disposal, 세 Catalog read의
  AbortSignal·session header·`X-API-Key` 전달을 검증했다.
- `verify-schema-catalog-discovery-ui.mjs`: PASS at 1440×900. 테이블 목록 503→retry(2 requests), 의미
  검색 성공→503→동일 query retry(`주문`, `고객 의도`, `고객 의도`), 이전 의미 결과 보존, 컬럼
  503→동일 table retry(2 requests), URL/query/header/payload 계약과 화면 겹침 없음을 실제 Playwright
  조작 및 `schema-catalog-discovery-retry-1440x900.png` 캡처로 확인했다.
- 기존 `verify-schema-relationship-ui.mjs`: PASS at 1920×1080 and 390×844. 관계 projection, Catalog/
  Ontology 경계, Data Fabric query, source handoff, 설명 exact retry, 모바일 overflow 회귀가 유지됐다.
- architecture: PASS across 409 TypeScript/Vue files. 전체 `vue-tsc --noEmit`: PASS.
- production build: PASS, 4,869 modules transformed. lazy remote boundary: PASS,
  `__federation_expose_Remote-app-CnrbuVqH.js` 2,728,636 bytes.
- 실제 Catalog/Neo4j 데이터와 의미 검색 모델의 live 정합성은 upstream 데이터가 준비되지 않아 검증하지
  않았다. fixture를 live 성공으로 기록하지 않으며 최종 live-service 게이트 T052에 그대로 남긴다.

## Live-service status

실제 Catalog 검증은 `Catalog table list did not return 200`으로 중단됐다. Workspace `up analyzer`는
Neo4j Bolt 7687 비가동을 doctor 단계에서 차단했다. 이를 fixture 성공으로 대체해 live 통과로 기록하지
않으며, Neo4j가 가동된 completion T052에서 실제 Catalog 목록·컬럼·관계 화면을 다시 검증한다.
