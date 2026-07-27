# Feature Specification: 백엔드 책임 기준 프론트 전면 리팩토링

**Feature Branch**: `060-backend-aligned-frontend-refactor`

**Created**: 2026-07-22

**Status**: In Progress

**Input**: 백엔드는 현재 책임 분리를 유지하고, 프론트의 혼재된 API·상태·업무 로직·UI를 백엔드
책임 그룹으로 전면 재구성하되 사용자 기능과 결과는 동일하게 보존한다.

## User Scenarios & Testing

### User Story 1 - 개발자가 소유자를 즉시 찾는다 (Priority: P1)

개발자는 최상위 폴더명만 보고 Parser, Analyzer, Catalog, Data Fabric, Text2SQL, Ontology 등 어느
백엔드 계약을 다루는 코드인지 알 수 있다. 하나의 백엔드 클라이언트가 여러 화면 폴더에 중복되지 않는다.

**Independent Test**: 서비스별 base URL과 API path 소비자를 전수 검색해 각 서비스의 HTTP 호출이 해당
`src/domains/<backend>/api/` 경계에만 존재하는지 확인한다.

**Acceptance Scenarios**:

1. **Given** Data Fabric 요청, **When** 호출자를 찾는다, **Then** Data Fabric domain의 API 경계 한 곳과
   그 공개 소비자만 나온다.
2. **Given** Text2SQL 요청, **When** 호출자를 찾는다, **Then** Catalog와 합쳐지지 않고 Text2SQL domain
   아래 query·history·observability 하위 기능으로 분류된다.
3. **Given** Gateway, **When** 구조를 본다, **Then** 사용자 domain으로 분류되지 않고 공통 HTTP 입구로만
   사용된다.

### User Story 2 - 기존 기능과 결과가 그대로 동작한다 (Priority: P1)

사용자는 리팩토링 전과 같은 탭, 같은 입력, 같은 API 요청, 같은 진행·성공·실패 결과를 경험한다.
기능 보존을 이유로 옛 경로 shim이나 중복 구현을 남기지 않는다.

**Independent Test**: 이동 슬라이스마다 이동 전 계약 정답지와 이동 후 API 요청, 상태 변화, 화면 출력을
대조하고 생산 번들·전용 타입검사·실제 브라우저 시나리오를 통과한다.

**Acceptance Scenarios**:

1. **Given** 기존 DataSource 화면, **When** 목록·등록·연결시험·삭제를 수행한다, **Then** 요청 method,
   path, headers, body와 화면 결과가 이동 전과 같다.
2. **Given** 분석 업로드 흐름, **When** 업로드→파싱→분석→그래프 조회를 수행한다, **Then** 이벤트 순서와
   사용자 결과가 동일하다.
3. **Given** 실패·취소·빈 결과, **When** 같은 조건을 재현한다, **Then** 오류가 숨겨지지 않고 기존에
   정상적으로 표시되던 상태가 보존된다.

### User Story 3 - 내부 책임이 실제로 분리된다 (Priority: P1)

각 domain 내부는 API 계약, application/use-case, state, UI로 분리되고 UI가 직접 fetch하거나 거대한
스토어가 여러 업무 흐름을 동시에 소유하지 않는다.

**Independent Test**: 구조 검증기가 금지 import, domain 밖 raw fetch, shared→domain 역참조, 옛 경로,
정해진 크기·책임 예외를 검사한다.

**Acceptance Scenarios**:

1. **Given** Vue UI 컴포넌트, **When** 의존성을 확인한다, **Then** 공개 application/state 계약을 사용하고
   서비스 URL이나 raw fetch를 소유하지 않는다.
2. **Given** `shared`, **When** import를 전수 확인한다, **Then** domain·workflow를 import하지 않는다.
3. **Given** 여러 백엔드를 잇는 흐름, **When** 코드를 찾는다, **Then** 임의 domain store가 아니라 명시적
   workflow가 공개 domain 계약을 조립한다.

### User Story 4 - UI 품질 결함을 함께 근본 수정한다 (Priority: P2)

담당 핵심 영역의 시각 디자인과 기능은 보존하되, 탭 전환 시 스크롤, 반응형 비율, 여백, 키보드 접근성,
일관성 같은 명백한 결함은 공용 규칙으로 수정한다.

**Independent Test**: 지정 viewport와 키보드·마우스 시나리오에서 실제 화면, 콘솔, 네트워크, 스크롤
상태를 캡처해 전후를 대조한다.

## Edge Cases

- 선택 서비스가 실행되지 않는 제품 프로필에서는 기능을 live로 가장하지 않고 가용성 사유를 표시한다.
- 스트리밍 NDJSON/SSE는 청크 분할, 취소, 손상 이벤트, 정상 종료 순서를 보존한다.
- Electron이 주입하는 `X-Neo4j-*` 헤더와 standalone 기본 연결의 우선순위를 보존한다.
- 진행 중인 057·059 WIP 파일은 소유 슬라이스가 도달하기 전 수정하지 않는다.
- 한 화면이 여러 백엔드를 사용해도 API 소유권을 화면 폴더로 되돌리지 않는다.

## Requirements

### Functional Requirements

- **FR-001**: 시스템은 백엔드별 코드를 `src/domains/<backend>/` 아래 그룹화해야 한다.
- **FR-002**: Parser, Analyzer, Catalog, Data Fabric, Text2SQL은 서로 독립된 domain이어야 한다.
- **FR-003**: Ontology backend에 흩어진 `domain`, `ontology`, `object-explorer` 코드는 하나의 ontology
  domain 아래 하위 기능으로 재구성해야 한다.
- **FR-004**: Text2SQL query와 observability는 같은 backend group의 별도 하위 기능으로 유지해야 한다.
- **FR-005**: 독립 What-If와 Ontology domain-whatif는 서로 다른 backend 소유권을 유지해야 한다.
- **FR-006**: Gateway는 domain이 아니며 공통 HTTP 전송 입구로만 취급해야 한다.
- **FR-007**: 여러 backend를 조립하는 로직은 `src/workflows/`에 명시적으로 존재해야 한다.
- **FR-008**: 각 domain은 공개 `index.ts`를 제공하고 다른 domain/workflow는 그 공개 경계만 사용해야 한다.
- **FR-009**: UI 컴포넌트는 서비스 base URL과 raw fetch를 소유하지 않아야 한다.
- **FR-010**: `shared`는 domain/workflow를 import하지 않아야 한다.
- **FR-011**: 옛 import 경로를 위한 alias, re-export shim, 중복 파일을 남기지 않아야 한다.
- **FR-012**: feature id, label, menu group, embedded 여부, lazy-load 동작을 보존해야 한다.
- **FR-013**: API method, path, headers, request/response shape, stream event order를 명시적 변경이 없는 한
  보존해야 한다.
- **FR-014**: 각 이동 슬라이스는 이동 전·후 계약 테스트, 타입검사, 생산 번들 검사를 통과해야 한다.
- **FR-015**: 최종 완료 전 실제 서비스와 브라우저에서 정상·실패·경계·취소 시나리오를 검증해야 한다.
- **FR-016**: 현재 208개 타입 오류를 단순 기준선으로 영구 허용하지 않고 소유 domain 슬라이스마다 0으로
  줄여 최종 전체 타입검사를 통과해야 한다.
- **FR-017**: 057·059 사용자 WIP를 보존하고 관련 슬라이스 전에는 해당 dirty 파일을 수정하지 않아야 한다.
- **FR-018**: Ontology 노드의 datasource catalog는 실패와 성공한 빈 목록을 구분하고, 갱신 실패 시
  마지막 성공 목록을 보존하며 명시적 재시도를 제공해야 한다.
- **FR-019**: Ontology 노드 datasource binding은 `schema`와 `table` identity를 함께 보존하고, PUT/DELETE가
  성공하기 전에는 로컬 노드와 인스턴스 상태를 성공한 것처럼 변경하지 않아야 한다.
- **FR-020**: 노드·조회 제한 변경으로 여러 instance 요청이 겹치면 마지막 요청만 화면 상태를 변경하고,
  실패와 정상 빈 결과를 서로 다른 상태로 표시해야 한다.
- **FR-021**: 코드 업로드 화면은 Parser 입력·Analyzer 실행·Catalog 결과 조회를 조립하는
  `code-analysis` workflow가 소유해야 한다. Data Fabric datasource 선택·생성은 해당 domain의 공개
  계약만 사용하고, 임의 connector fallback·중복 catalog·옛 `features/code-analysis/upload` 공개 경계를
  남기지 않아야 한다.
- **FR-022**: Data Fabric 관리 화면은 datasource 목록·table 상세, connector 탐색·등록, 삭제 확인을
  각각의 UI/application 책임으로 분리해야 한다. connector catalog·표현 정책은 한 곳에서 파생하고,
  생성·연결시험·삭제의 실패를 숨기거나 native dialog·해제되지 않는 timer에 의존하지 않아야 한다.
  datasource와 connector 선택은 키보드로 가능해야 하며 390×844에서도 modal action과 관리 콘텐츠가
  잘리거나 가로로 넘치지 않아야 한다.
- **FR-023**: Catalog 용어 일괄 업로드는 upload→mapping→extract/stream→preview/edit→import→rollback
  상태와 session 복원 계약을 명시적으로 검증해야 한다. backend·sessionStorage JSON을 단언으로 신뢰하거나
  후보 편집을 `any`로 처리하지 않아야 하며, 복원·import·rollback 확인은 이름 있는 접근 가능한 dialog와
  pending/error 상태를 사용해야 한다. 취소·부분 추출·재시도·200건 초과 preview 복원 결과를 성공으로
  가장하거나 유실하지 않아야 한다.
- **FR-024**: Catalog 일반 용어 화면은 목록·상세·수정·삭제 실패의 원래 작업을 보존하고, 재시도가
  관련 없는 용어집 목록 요청으로 바뀌지 않아야 한다. 용어집·용어 삭제는 native confirm이 아니라
  대상·pending·오류를 소유한 접근 가능한 dialog에서 취소·재시도해야 한다. 용어 행과 설명 펼치기는
  키보드로 동작하고, 제공되지 않는 탭이나 동작하지 않는 control을 활성 기능처럼 표시하지 않아야 하며
  390×844에서도 세 패널과 table이 document 가로 overflow를 만들지 않아야 한다.
- **FR-025**: Catalog 영업일 캘린더는 날짜 grid·월 통계·저장 payload 계산을 UI에서 분리하고,
  조회·저장 응답과 `success=false`를 runtime에서 검증해야 한다. 연도 전환 중 늦은 과거 응답이 최신
  캘린더를 덮지 않아야 하며, 조회 실패와 저장 실패의 재시도 action을 구분해야 한다. 성공 알림은
  managed timer를 사용하고 공휴일 dialog는 label/focus/Escape/trigger focus 복귀를 제공해야 하며
  390×844에서 sidebar와 7열 grid가 document 가로 overflow를 만들지 않아야 한다.
- **FR-026**: 앱 설정은 저장 전 draft와 runtime 적용을 분리하고, 잘못된 저장값을 화면 상태로 직접
  신뢰하지 않아야 한다. 새 세션과 서버 전체 삭제는 native confirm이 아니라 작업 identity·pending·오류를
  소유한 접근 가능한 alertdialog에서 취소·확정·재시도해야 한다. 전체 삭제 실패는 설정 modal과 확인
  dialog를 유지하고 같은 DELETE만 재시도하며, 성공하기 전에는 Analyzer 상태나 navigation을 초기화하지
  않아야 한다. 설정 modal과 중첩 alertdialog는 각각 Escape·focus trap·trigger focus 복귀를 제공하고
  390×844 viewport를 벗어나거나 document 가로 overflow를 만들지 않아야 한다.
- **FR-027**: Text2SQL 히스토리는 목록 조회, 검색·페이지 이동, 단건 삭제, 전체 삭제 상태를 구분해야 한다.
  늦게 끝난 이전 검색 응답이 최신 검색 결과를 덮지 않아야 하고, 페이지 이동은 현재 검색 조건을 보존해야
  하며, 삭제 API 실패를 boolean이나 console-only 경로로 삼키지 않아야 한다. 단건·전체 삭제는 대상과
  pending·오류를 소유한 접근 가능한 alertdialog에서 취소·재시도하고 mutation 성공 전에는 목록·선택·total을
  바꾸지 않아야 한다. 항목 선택과 세부 펼치기는 키보드로 동작하고, 검색 debounce는 component 종료 시
  해제되며, 390×844에서 history panel과 dialog가 document 가로 overflow를 만들지 않아야 한다.
- **FR-028**: Text2SQL domain UI는 Ontology schema/instance API와 Materialized View→bulk-create 순서를
  직접 조립하지 않아야 한다. SQL 결과→Ontology instance 기능은 두 domain의 공개 경계를 소비하는 명시적
  workflow가 소유하고, source SQL·질문·컬럼·datasource·schema/node/id/name mapping을 끝까지 보존해야
  한다. schema 목록·상세 실패, MV 부분 실패, bulk-create 실패와 성공을 native alert·console-only 상태로
  처리하지 않고 접근 가능한 dialog 안에서 구분·재시도해야 한다. mutation 성공 전에는 성공 결과를
  표시하거나 dialog를 닫지 않아야 하며, dialog는 focus/Escape/pending과 390×844 내부 table overflow를
  올바르게 처리해야 한다.
- **FR-029**: Text2SQL 본체는 최근 질문 JSON 검증·정규화·저장 정책, 피드백 입력·제출 상태, SQL diff와
  자동 실행 timer 수명주기를 UI 거대 컴포넌트 안에서 직접 관리하지 않아야 한다. 손상된 최근 질문 저장값과
  저장 실패는 빈 성공이나 console-only 상태로 숨기지 않아야 한다. 오답 사유는 native prompt가 아닌 접근
  가능한 dialog에서 선택 입력하고, 피드백 실패는 native alert 없이 같은 payload를 재시도하며 API 성공
  전에는 제출 완료로 확정하지 않아야 한다. 모든 timer는 component 종료 시 해제되어야 하고, feedback
  dialog는 Escape·focus trap·trigger focus 복귀와 390×844 geometry를 보존해야 한다.
- **FR-030**: 앱 알람 toast는 SSE 연결·재연결, 알람별 자동 제거, acknowledgement 후 제거 timer를
  component 수명주기에 묶어야 한다. 연결 실패를 console-only로 두거나 종료 뒤 재연결하지 않아야 하며,
  acknowledgement pending·실패·재시도를 알람별로 구분하고 API 성공 전에 acknowledged/제거 상태를
  변경하지 않아야 한다. 수동 닫기는 해당 알람 timer를 취소하고 동일 알람의 중복 확인 요청을 막아야 한다.
- **FR-031**: Security 사용자·역할 CRUD와 감사 로그 조회는 load·editor mutation·delete mutation 오류를
  console/native dialog로 처리하지 않아야 한다. 사용자·역할 삭제는 대상 identity와 pending/error를 소유한
  alertdialog에서 취소·동일 요청 재시도하고 backend 성공 전 목록을 변경하지 않아야 한다. 사용자·역할
  editor와 감사 로그 상세는 이름 있는 dialog, 초기 focus, Escape, focus trap, trigger focus 복귀를
  제공해야 한다. Security backend에 없는 역할 수정은 작동하는 버튼처럼 노출하거나 성공한 것처럼 dialog를
  닫지 말고 명시적으로 disabled 처리해야 한다.
- **FR-032**: OLAP 큐브 목록·선택, pivot query/preview, ETL 설정·script, Airflow mutation과 실행 stream은
  서로 다른 작업 상태와 request identity를 가져야 한다. 큐브·ETL·DW·Airflow 응답의
  `success: false`를 HTTP 성공만으로 완료 처리하지 않아야 하며, mutation 성공 전 목록·배포·저장 상태를
  변경하지 않아야 한다. 단건 큐브 삭제는 이름을 사용하지 않는 전체 DW 목록이나 이름 패턴으로 “관련
  테이블”을 추정해 삭제하지 않아야 하고, 전체 DW 삭제는 모든 큐브 삭제에서 사용자가 명시적으로 선택한
  경우에만 실행해야 한다. 큐브 삭제·전체 재적재·DAG 재배포는 대상·옵션·pending·오류를 소유한 접근
  가능한 alertdialog에서 취소·동일 요청 재시도해야 한다. ETL 설정·저장 script 조회 실패는 빈 초안이나
  미저장 상태로 숨기지 않고 재시도 또는 명시적 새 초안 선택을 제공해야 한다. OLAP SSE는 현재 session
  headers를 전달하고 새 실행·취소·component 종료 시 이전 연결을 중단하며, 오류 또는 terminal event 없는
  종료를 실행 중 상태로 남기지 않아야 한다. raw timer·native dialog·console-only 오류를 남기지 않고
  editor/action dialog는 focus·Escape·trap·trigger focus 복귀와 390×844 geometry를 보존해야 한다.
- **FR-033**: Observability의 Agent Scheduler 프로필과 Text2SQL event rule 삭제는 대상 identity,
  pending, mutation 오류를 소유한 접근 가능한 alertdialog에서 취소·동일 대상 재시도해야 하며 backend
  성공 전에 목록을 변경하지 않아야 한다. 삭제·toggle backend 성공 뒤 목록 refresh가 실패하면 이미
  성공한 mutation을 실패로 되돌리거나 같은 mutation을 다시 보내지 않고, 로컬 commit과 별도 refresh
  warning을 유지해야 한다. 프로필 선택 surface 안에 `role=button` action을 중첩하지 말고 선택·toggle·삭제를
  각각 독립된 native button으로 제공해야 한다. dialog는 Escape·focus trap·trigger focus 복귀와
  390×844 geometry를 보존하고, WatchAgent/EventDetection UI에는 native dialog가 없어야 한다.
- **FR-034**: Security·OLAP·Observability 등 여러 책임에서 동일한 destructive action의
  label/description, pending/error, Escape, focus trap, trigger focus 복귀, 모바일 button stack 정책을
  복제하지 않고 domain-independent shared dialog primitive 한 곳에서 제공해야 한다. 각 소비자는
  domain action identity·문구·옵션·mutation만 소유하며, 이전 domain별 dialog 구현이나 compatibility
  re-export를 남기지 않아야 한다.
- **FR-035**: Data Lineage는 Catalog lineage와 OLAP ETL lineage를 조립하는 cross-domain workflow로
  유지하고, 두 backend 응답의 projection·중복 제거·부분 실패를 UI 컴포넌트가 직접 추론하지 않아야 한다.
  겹친 조회에서는 마지막 요청만 화면 상태를 변경하고, 한 backend 실패는 성공한 다른 backend의 graph를
  보존하며 둘 다 실패한 경우에만 blocking error로 전환해야 한다. ETL 노드의 DAG 재배포는 dialog를 열 때
  cube identity를 고정하고 native confirm이 아닌 공용 alertdialog에서 취소·pending·`success:false`·HTTP
  실패·동일 cube 재시도를 처리해야 하며 성공 전에 완료 상태나 Airflow URL을 commit하지 않아야 한다.
  backend가 `cube_name`을 제공하지 않은 ETL node는 node 이름으로 배포 대상을 추정하지 않고 이유가 있는
  disabled action으로 표시해야 한다.
  성공 알림과 graph viewport 보정은 component 종료 시 해제되는 managed timer를 사용하고, 390×844에서
  상세 panel과 action dialog가 잘리거나 document 가로 overflow를 만들지 않아야 한다.
- **FR-036**: Schema Modeling은 Catalog의 table·column·relationship 계약과 Data Fabric table query,
  Ontology ObjectType 조립을 workflow 책임으로 유지하되 Catalog 요청과 응답을 이름만으로 추론하지
  않아야 한다. Catalog schema API의 모든 요청은 현재 session의 `X-Neo4j-*` 헤더를 전달하고, 설명
  편집은 설정된 LLM key를 backend 원문이 요구하는 `X-API-Key`로 전달해야 한다. 테이블 설명 body는
  `{name,schema,description}`, 컬럼 설명 body는 `{table_name,table_schema,column_name,description}`,
  관계 생성·삭제는 from/to table·schema·column과 허용 type을 보존하며 각각 `created:true`,
  `updated:true`, 양의 `deleted`가 검증된 뒤에만 로컬 상태를 commit해야 한다.
  테이블 identity는 datasource·schema·name을 함께 보존하고 같은 이름의 다른 schema/datasource가 cache,
  node 선택, 관계 대상 선택, 설명 저장에서 서로 덮어쓰지 않아야 한다. backend가 schema를 생략하거나
  `public`일 때 이름/FQN fallback을 수행하는 column endpoint에는 정확한 조회 뒤 schema를 비운 재요청을
  하지 않으며, 구분 불가능한 중복 대상은 임의 항목을 선택하지 않고 사용자에게 계약 한계를 표시해야 한다.
  설명 저장과 관계 추가는 작업별 pending/error와 같은 입력 재시도를 유지하고 실패 시 editor/form을
  닫지 않아야 한다. 관계 삭제와 캔버스 비우기는 native dialog가 아니라 대상 identity를 고정한 공용
  alertdialog에서 취소·pending·오류·정확 재시도·focus 복귀를 제공하며 성공 전 화면을 변경하지 않아야 한다.
  node edge debounce와 update highlight는 component/store 종료 시 해제되는 managed lifetime을 사용하고,
  390×844에서 detail panel·relationship form·alertdialog가 잘리거나 document 가로 overflow를 만들지
  않아야 한다.
- **FR-037**: `MultiLayerOntologyViewer`의 로컬 graph 편집과 원격 mutation을 하나의 native
  `confirm/alert` 흐름으로 섞지 않아야 한다. 노드·관계 삭제는 dialog open 시 node/relationship identity와
  연결 관계 수를 고정하고 공용 `ActionDialog`에서 취소·Escape·focus 복귀를 제공한 뒤, 확인 시 한 번만
  undo snapshot과 graph/Cytoscape 상태를 함께 변경해야 한다. 관계 편집의 field mapping 검증 실패는
  editor 안의 오류로 표시하고 현재 입력과 editor를 유지해야 한다.
  Measure→ObjectType 생성은 대상 node identity와 요청 body를 고정하고 pending/error/같은 대상 재시도를
  dialog가 소유하며 backend 성공 전에 `dataSource`나 성공 상태를 commit하지 않아야 한다. 성공 뒤 node
  data refresh 실패는 이미 성공한 생성을 반복시키지 않고 별도 warning으로 구분해야 한다.
  Neo4j 저장은 빈 graph·열린 관계 생성·HTTP 실패·성공을 header의 작업별 상태로 표시하고 native alert를
  사용하지 않으며, 실패한 동일 graph 저장을 다시 실행할 수 있어야 한다.
- **FR-038**: MultiLayer Ontology의 데이터 소스 자동 연결·검색·단건 확정·일괄 확정은 서로 다른 작업
  identity와 오류를 유지해야 한다. `/confirm-datasource`의 HTTP 200도 `success: true`를 runtime에서
  검증한 뒤에만 mapping status, node datasource, relation field mapping을 commit해야 하며 단건 실패는
  현재 node/candidate와 dialog 입력을 보존한 채 같은 요청을 재시도해야 한다. 컬럼 목록이 제공되지 않은
  응답을 빈 schema로 추론해 기존 relation mapping을 삭제하지 않아야 한다.
  일괄 확정은 dialog open 시 미확정 node/candidate snapshot을 고정하고 공용 alertdialog에서 확인한 뒤,
  성공 node는 한 번만 commit하고 실패 node만 같은 payload로 재시도해야 한다. 부분 성공을 전체 실패나
  전체 성공으로 표시하지 않으며 요청 중 dialog/후보를 충돌 변경할 수 없어야 한다.
  자동 연결 stream과 자연어 검색 실패는 각각 소유 dialog 안의 visible error/retry로 남기고 native
  alert/confirm이나 시간 경과 오류 삭제를 사용하지 않아야 한다.
- **FR-039**: 문서 기반 Ontology 생성의 파일 형식 오류와 generation transport/stream 오류는 생성
  dialog 안에서 현재 입력과 재시도를 보존해 표시하고 native alert를 사용하지 않아야 한다. producer,
  활성화 control, 데이터 적재 경로가 모두 사라진 model overlay의 selector/event/state/delete 코드는
  가짜 사용자 기능으로 포장하지 않고 제거해야 한다.
- **FR-040**: MultiLayer Ontology의 상세 패널과 What-If 패널 크기 조절은 중복 전역 listener가 아니라
  공용 관리형 lifecycle을 사용해야 한다. pointer 완료·취소·Escape·component 종료마다 listener와
  document interaction 상태를 복구하고, 키보드 방향키·Home 및 현재 최소/최대/현재값을 노출하는
  접근 가능한 separator를 제공해야 한다.
- **FR-041**: MultiLayer Ontology 인과 분석은 선택 node/schema/brush payload를 실행 시점에 고정하고
  진행·보고서 chunk·result·transport failure·부분 network failure·사용자 취소를 서로 다른 상태로
  유지해야 한다. node/schema 전환과 component 종료는 진행 요청을 abort하고 늦은 결과를 폐기해야 하며,
  실패·취소 후에는 같은 선택 조건만 정확히 재시도해야 한다. 차트 구간 선택은 canvas toolbox에만
  의존하지 않고 keyboard focus 가능한 명시적 control로 시작할 수 있어야 한다.
- **FR-042**: MultiLayer Ontology 노드 데이터 조회는 node identity, datasource metadata, cascading
  filters, 영업일 옵션을 요청 시작 시점에 고정하고 Ontology 조회와 Text2SQL 원본 조회를 workflow
  lifecycle이 소유해야 한다. 새 노드 조회·선택 해제·schema 전환·component 종료는 이전 요청을
  abort하고, transport가 abort를 무시하더라도 늦은 응답은 현재 화면에 commit하지 않아야 한다.
  Ontology의 `hasDataSource:false`, transport failure, Text2SQL failure, 정상 결과는 구분하며 실패
  재시도는 변경된 현재 입력을 재조립하지 않고 실패한 동일 query 또는 SQL/datasource를 전송해야 한다.
  두 API는 현재 runtime session headers와 AbortSignal을 받아야 한다. 결과 변경과 chart container
  준비가 동시에 발생해도 차트 생성·폐기는 단일 관리형 진입점에서 한 번만 수행해야 한다.
- **FR-043**: MultiLayer Ontology 노드 필터는 dialog draft와 적용된 direct filter를 분리해야 한다.
  닫기·backdrop·Escape는 draft를 폐기하고 요청이나 적용 상태를 바꾸지 않으며, 확인은 활성 단일값을
  한 번만 commit한 뒤 노드 데이터를 한 번만 다시 조회해야 한다. cascading filter는 direct filter와
  관계 field mapping으로 매번 처음부터 결정론적으로 projection하여 삭제된 값이 되살아나거나 순환
  관계가 무한 전파되지 않아야 하고, 직접 입력은 같은 node/field의 파생값보다 우선해야 한다. distinct
  값 조회는 runtime 검증, session headers, AbortSignal, target/request sequence, visible error와 동일
  node/columns 재시도를 제공해야 한다. 공개 backend 원문으로 요청 표현을 확인할 수 없는 date/range
  control은 동작하는 것처럼 값을 받지 말고 비활성 상태와 계약 미확인 사유를 표시해야 한다.
- **FR-044**: Agents.md 편집은 Ontology의 문서·context·Behavior API와 Agent Scheduler의 ProcessGPT
  목록을 조립하는 workflow가 소유해야 하며 Ontology domain UI가 다른 domain을 직접 import하지 않아야
  한다. 조회·context·생성·저장·활성 전환·삭제·템플릿 초기화·AI 재작성·ProcessGPT Behavior 추가는
  작업별 pending/error와 실행 시점의 node/content/enabled/prompt/process snapshot을 가져야 한다.
  node 전환·dialog 닫기·component 종료는 진행 중 read/rewrite 요청을 abort하고 늦은 응답을 폐기해야
  하며, mutation 성공 전에는 editor 원본·agent 존재 여부·ProcessGPT method를 성공 상태로 commit하지
  않아야 한다. 활성 전환은 본문 변경 여부와 독립적으로 저장되고 실패하면 이전 활성값으로 복구되어야
  한다. 삭제와 dirty template 초기화는 native confirm 대신 이름 있는 alertdialog에서 취소·Escape·focus
  복귀·실패 후 동일 snapshot 재시도를 제공해야 한다. context와 ProcessGPT 목록의 실패는 빈 상태로
  위장하거나 console에만 남기지 말고 각각 현재 화면에서 재시도할 수 있어야 한다. API의 모든 200 응답은
  runtime parser를 통과하고 `success:false` 또는 malformed body를 성공으로 처리하지 않아야 하며,
  success/diff timer와 dialog listener는 component 종료 시 모두 정리되어야 한다. 같은 노드의
  데이터소스 메타데이터처럼 상세 패널의 보조 정보가 늦게 갱신되어도 선택 노드를 해제·재선택하여
  editor를 강제 재마운트하지 않아야 하며, 현재 초안·dialog·focus를 그대로 보존해야 한다. 그래프
  초기화 뒤 예약된 최근 선택 복원도 사용자가 이미 노드·탭을 선택했다면 무시되어야 한다.
- **FR-045**: MultiLayer Ontology shell은 390×844에서 desktop header action과 좌우 panel을 남은 폭에
  억지로 축소해 세로 글자나 화면 밖 콘텐츠를 만들지 않아야 한다. header action은 자체 wrapping
  grid에서 원래 label을 유지하고 document 가로 overflow를 만들지 않아야 한다. layer panel은 canvas
  위의 접을 수 있는 panel로, node/relation detail은 viewport 내부 전체 폭 panel로 제공해야 하며
  이름 있는 닫기 control로 canvas에 돌아갈 수 있어야 한다. mobile detail에서는 desktop resize
  separator를 숨기되 desktop 1920×1080의 panel 너비·resize·graph 동작은 그대로 유지해야 한다.
  viewport 크기가 바뀌면 Cytoscape renderer와 pan을 새 canvas에 맞추되 사용자의 현재 zoom은 바꾸지
  않아야 하며, detail을 닫은 canvas에서 기존 node가 화면 안에 남아야 한다.
- **FR-046**: Ontology What-If 모델 관리는 모델 목록 조회와 단건·전체 삭제를 native confirm/alert나
  하나의 `error` 상태로 처리하지 않아야 한다. model-status/list 응답의 model identity, status,
  inputs/outputs와 metrics는 runtime에서 검증·정규화하고, 삭제 HTTP 200도 `success: true` 뒤에만
  성공으로 처리해야 한다. schema 전환·refresh·component 종료는 이전 목록 요청을 abort하고 늦은
  응답을 폐기해야 하며 refresh 실패는 기존 목록을 보존한 채 재시도할 수 있어야 한다. 단건 삭제는
  dialog open 시 schema/model identity를, 전체 삭제는 현재 모델 snapshot을 고정해야 한다. 전체 삭제의
  일부만 실패하면 성공 모델은 즉시 한 번만 제거하고 실패 모델만 dialog에 남겨 동일 target으로
  재시도해야 한다. malformed metrics는 화면 전체를 깨뜨리지 않고 해당 모델의 visible warning으로
  표시해야 하며, row 상세는 keyboard로 열고 닫을 수 있어야 한다. 390×844에서 모델 관리가 포함된
  What-If 단계 navigation은 label을 세로 글자로 압축하지 않고 자체 가로 scroll 안에서 원래 이름을
  유지해야 한다. viewport 크기나 현재 단계가 바뀌면 active 단계가 strip의 보이는 영역 안에 있어야 하며,
  manager row·action·dialog와 함께 document 가로 overflow를 만들지 않아야 한다.
- **FR-047**: Ontology What-If 시뮬레이션은 snapshot 조회, simulation 실행, scenario profile 저장을
  Vue 화면의 하나의 error와 raw timer가 아니라 operation별 수명주기로 소유해야 한다. snapshot,
  simulation, scenario response는 runtime에서 `success`, schema/date/model trace/state/profile identity와
  유한한 수치를 검증해야 하며 요청 context와 다른 응답을 commit하지 않아야 한다. schema/filter/date
  전환과 component 종료는 이전 snapshot/simulation을 abort하고 늦은 응답을 폐기해야 한다. 날짜 조회
  실패는 마지막 정상 snapshot·선택 날짜·사용자 입력을 보존하며 동일 요청을 재시도할 수 있어야 한다.
  simulation과 profile 저장은 실행 시 schema/date/filter/intervention/result/draft snapshot을 고정하고
  실패 뒤 동일 payload로만 재시도해야 하며, backend success 전 결과나 저장 성공을 표시하지 않아야 한다.
  화면에 사용되지 않는 animation timer는 제거하고 profile 성공 정리는 managed lifetime을 사용해야 한다.
  390×844에서 chart header, snapshot field/action, profile form과 6열 결과 table은 겹치거나 document 가로
  overflow를 만들지 않고 필요한 table scroll은 전용 container 안에서만 발생해야 한다.
- **FR-048**: Ontology Behavior 편집은 draft 구성·타입별 검증·AI 코드 생성 prompt·외부 endpoint 테스트
  입력·생성/수정/삭제 mutation을 Vue dialog가 직접 조립하지 않아야 한다. backend의 create/update/delete와
  generate-code 응답은 `success: true`, Behavior/code identity와 필수 필드를 runtime 검증한 뒤에만
  성공으로 commit해야 하며 모든 내부 요청은 AbortSignal을 지원해야 한다. 외부 endpoint 테스트는 사용자가
  입력한 URL에 ROBO session/LLM/Neo4j header를 전달하지 않고 실행 시점의 URL/method/body를 고정해야 한다.
  생성·저장·테스트·삭제는 서로 다른 pending/error/failed target을 소유하고, 실패 뒤 동일 payload만
  재시도하며, dialog 닫기·target 전환·component 종료는 요청을 abort하고 늦은 결과를 폐기해야 한다.
  삭제는 이름 있는 alertdialog에서 Escape·focus 복귀·pending 중 닫기 방지·동일 target 재시도를 제공해야
  한다. 실행 방식과 input field 선택은 mouse-only `div`가 아니라 native button/checkbox semantics를
  사용하고, editor dialog는 이름·초기 focus·focus containment·Escape를 제공해야 한다. 390×844에서는
  header/body/footer가 viewport 안에 유지되고 body만 세로 scroll하며 타입 grid, DMN/code editor, 테스트
  결과와 action이 document 가로 overflow를 만들지 않아야 한다.
- **FR-049**: MultiLayer Ontology의 로컬 그래프 undo/redo는 Viewer가 직접 JSON 직렬화와 두 stack을
  조작하지 않고 독립된 history lifecycle이 소유해야 한다. checkpoint는 node/relationship의 중첩 값을
  참조 공유 없이 보존하고 최대 50개 제한과 새 mutation 뒤 redo 폐기를 지켜야 한다. undo/redo는 복원된
  graph를 commit한 뒤 정확히 한 번 renderer를 동기화하고, schema target 전환은 두 stack을 함께 비워야
  한다. Ctrl/Cmd+Z, Ctrl/Cmd+Y, Ctrl/Cmd+Shift+Z는 graph surface에서만 동작하며 input, textarea,
  select, contenteditable의 native 편집 undo를 가로채지 않아야 한다. 빈 stack shortcut은 event를
  소비하거나 renderer를 호출하지 않아야 한다.
- **FR-050**: MultiLayer Ontology의 로컬 node/relation 생성·이름 변경·layer 변경·관계 편집은 Viewer가
  ID·기본 이름·중복 판정·배열 mutation을 각각 직접 구현하지 않고 하나의 순수 graph mutation 정책을
  사용해야 한다. node 생성은 명시적으로 전달된 layer·position·clock과 현재 graph로 같은 ID·기본 이름을
  만들고 원본 배열을 변경하지 않아야 한다. 이름의 앞뒤 공백은 제거하되 빈 이름, 존재하지 않는 node,
  동일 이름은 graph와 history를 바꾸지 않아야 한다. layer 변경도 존재하지 않는 node·빈 layer·동일
  layer에서는 무변경이어야 하며 실제 변경 시 `layer`와 `label`을 함께 갱신해야 한다.
  관계 초안은 source/target/clock으로 결정론적 ID를 만들고 누락 node, 자기 관계, 같은 방향의 중복 관계를
  거부해야 한다. edgehandles와 context-menu의 두 진입점은 같은 초안 생성 정책과 같은 commit/cancel
  수명주기를 사용해야 하며, 취소는 graph/history에 흔적을 남기지 않고 확인 시에만 한 번 checkpoint한 뒤
  관계를 commit해야 한다. 관계 type·description·field mapping 수정은 trim/빈값 정규화와 no-op 판정을
  순수 정책이 담당하고 실제 변경에서만 history checkpoint와 Cytoscape projection을 각각 한 번 수행해야
  한다. 삭제를 포함한 모든 로컬 mutation은 입력 node/relationship 객체와 배열을 직접 변경하지 않아야
  하고 Viewer는 정책 결과를 commit하고 Cytoscape를 동기화하는 orchestration만 소유해야 한다.
- **FR-051**: 문서 기반 MultiLayer Ontology 생성은 입력 draft·PDF 검증/인코딩·용어집 조회·generation
  stream을 Viewer의 분산 ref와 AbortController로 직접 소유하지 않고 독립된 workflow lifecycle로
  관리해야 한다. 용어집 조회는 loading·정상 empty·transport/malformed failure를 구분하고, 실패 시 기존
  정상 목록과 선택을 보존한 채 같은 조회를 재시도해야 한다. dialog mode 전환·닫기·component 종료는
  진행 중 용어집 요청을 abort하고 늦은 응답을 폐기해야 한다.
  생성 시작 시 input type, text 또는 URL/PDF content, 전체/선택 glossary IDs를 검증·고정한 target을
  만들어야 하며 PDF는 요청 전에 한 번 인코딩한 동일 content를 재시도에 사용해야 한다. text/url/pdf
  입력 누락은 network 요청 없이 현재 form에 표시해야 한다. 생성 실패의 “같은 요청 재시도”는 사용자가
  form을 수정해도 실패 target의 body를 그대로 전송하고, “입력 수정”은 별도 action으로 실패 target을
  폐기해야 한다. 새 실행·사용자 취소·dialog 닫기·component 종료는 이전 stream을 abort하고 transport가
  abort를 무시해도 늦은 event와 finally가 현재 상태/graph를 변경하지 않아야 한다.
  generation 요청은 현재 runtime session headers와 AbortSignal을 전달하고 malformed event,
  `success:false`, error event, terminal 없는 EOF, HTTP failure를 성공으로 처리하지 않아야 한다.
  성공 complete event만 graph를 한 번 commit하며 후속 Neo4j 저장 pending/failure는 generation 성공과
  별도 상태로 유지해야 한다. 용어집·생성 실패는 dialog 안의 visible alert/retry로 제공하고 native
  dialog나 console-only 오류를 사용하지 않아야 한다.
- **FR-052**: OLAP Pivot 편집기의 ETL script 생성·저장본 조회·저장·실행은 Vue 화면의 분산 ref와
  stream handle이 아니라 cube identity를 소유한 독립 lifecycle로 관리해야 한다. agent/template 생성,
  저장본 조회, 저장, 다운로드용 생성, 실행은 서로 다른 pending/error/notice 상태를 가져야 하며 한 작업의
  시작·실패가 다른 작업의 정상 결과를 지우거나 loading으로 표시하지 않아야 한다. 생성과 실행은 새 요청,
  사용자 취소, cube 전환, editor 종료, component 종료에서 이전 stream을 취소하고 request sequence가 다른
  callback·Promise 완료를 폐기해야 한다. agent와 실행 stream은 terminal event에서만 성공하고 malformed
  event, transport failure, terminal 없는 EOF를 visible failure로 유지해야 한다.
  저장은 click 시점의 cube/code/filename을 복제한 target을 backend `success:true` 이후에만 commit해야
  하며 실패 재시도는 사용자가 화면 state를 바꾸더라도 동일 target만 전송해야 한다. 저장본 조회 실패는
  현재 script와 저장 여부를 빈 값으로 덮지 않고 동일 cube 조회를 재시도해야 한다. 실행은 시작 시
  cube/sync mode/max retry를 고정하고 저장되지 않은 script에는 요청을 보내지 않아야 한다. 취소는
  cancelled 결과와 log를 남기되 취소된 stream의 늦은 terminal event가 성공/실패로 덮지 못해야 한다.
  runtime session headers와 기존 OLAP method/path/query/body는 그대로 보존하고 Vue UI는 lifecycle의
  상태를 표시하고 log scroll·파일 다운로드 같은 browser projection만 조립해야 한다.
- **FR-053**: Schema Modeling의 Catalog 테이블 목록·의미 검색·테이블 컬럼 조회는 canvas store가
  Text2SQL 표시 타입과 직접 API 호출로 함께 소유하지 않고, Schema Modeling 전용 table/column projection과
  독립 discovery lifecycle로 관리해야 한다. 테이블 목록, 의미 검색, identity별 컬럼 조회는 각각
  pending/error/request identity를 가져야 하며 새 요청·검색 초기화·component 종료는 이전 요청을 abort하고
  AbortSignal을 무시한 늦은 응답도 폐기해야 한다. 목록·검색 갱신 실패는 마지막 정상 결과를 빈 배열로
  덮지 않고 visible error와 동일 target 재시도를 제공해야 한다.
  컬럼 cache key는 datasource+schema+table identity를 사용하고 HTTP 성공의 빈 컬럼은 정상 empty로
  cache해야 한다. 같은 identity의 동시 요청은 하나의 in-flight 요청을 공유하며, 서로 다른 datasource의
  동명 table을 Catalog API가 구분하지 못하는 경우 요청 전에 명시적으로 거부해야 한다. 실패는 identity별
  오류와 마지막 사용자-facing 오류를 남기고 성공 전 cache를 만들지 않아야 한다. Catalog read API는
  기존 gateway path/query/session header/parser를 보존하면서 AbortSignal을 받아야 한다. canvas store는
  discovery 결과를 canvas node와 panel에 조립할 수 있지만 Catalog read state·sequence·controller를
  중복 소유하거나 `Text2SqlTableInfo`/`Text2SqlColumnInfo`를 Schema Modeling 화면 모델로 사용하지 않아야
  한다.

- **FR-054**: MultiLayer Ontology 관계 편집기는 Viewer 안의 분산 ref와 비동기 함수가 아니라 독립
  workflow lifecycle이 관계 target, draft, source/target 컬럼 상태, validation error, request identity를
  소유해야 한다. 관계를 열 때 `id` 또는 기존 composite edge id로 찾은 source/target/type/description/
  field mapping을 고정하고 두 endpoint의 컬럼을 독립적으로 조회해야 한다. 새 관계 열기, 편집기 닫기,
  component scope 종료는 이전 컬럼 요청을 abort하고 AbortSignal을 무시한 늦은 응답도 현재 편집기를
  변경하지 못해야 한다.
  inline datasource schema에 검증된 컬럼이 있으면 network 없이 사용하고, 없을 때만 기존 Ontology
  node-data gateway path와 runtime session headers를 보존한 채 AbortSignal을 전달해야 한다.
  datasource 확정 시 아직 조회하지 않은 candidate 컬럼은 `columns: []`로 직렬화하지 않아야 하며,
  확인된 빈 schema와 미확인 컬럼 상태를 구분해야 한다. 조회 실패,
  node 누락, datasource 미연결은 서로 다른 source/target 상태와 visible error로 남아야 하며 실패 당시
  관계 identity를 유지한 명시적 컬럼 재시도를 제공해야 한다. 일시적 실패나 미연결 상태를 빈 컬럼으로
  추론해 기존 field mapping draft를 지우거나 관계에 commit해서는 안 되고, 실제 `ready` 컬럼 목록으로
  불일치가 확인된 field만 draft에서 제거해야 한다.
  type·description·field mapping 저장은 기존 순수 graph mutation 정책의 trim/no-op/immutability 계약을
  사용하고, field mapping은 양쪽이 모두 비어 있거나 양쪽 모두 현재 검증된 컬럼일 때만 commit해야 한다.
  validation 실패는 현재 draft와 editor를 유지하고, 실제 변경에서만 history checkpoint, relationship
  배열 commit, Cytoscape edge projection, causal highlight를 각각 한 번 수행해야 한다.

- **FR-055**: MultiLayer Ontology의 node datasource discovery는 Viewer가 Text2SQL ask/direct-SQL/
  metadata API와 Ontology sample-data API를 직접 조합하지 않고 독립 workflow lifecycle이 dialog target,
  search/manual draft, result selection, row-count probe, sample preview, pending/error, request identity를
  소유해야 한다. 새 node dialog 열기, 닫기, 새 검색, datasource 변경, component scope 종료는 이전
  search/probe/sample 요청을 abort하거나 invalidate하여 늦은 응답이 현재 node와 결과를 바꾸지 못해야
  한다. Text2SQL provenance에 사용 table 근거가 없으면 성공 빈 목록으로 바꾸지 않고 별도 unavailable
  상태를 표시하며 transport failure와 구분해야 한다. 후보 table identity와 실행 datasource를 보존한
  직접 SQL probe는 최대 11행만 읽어 10행 초과 여부를 표시하고, probe 실패는 후보 자체를 제거하거나
  전체 검색 성공을 실패로 바꾸지 않아야 한다. sample preview는 후보가 가진 sample, 후보 table 직접
  조회, 확정 node sample 조회를 명시적으로 구분하고 실패를 빈 sample 성공으로 숨기지 않아야 한다.
  단건/일괄 datasource 확정은 고정된 node/candidate snapshot과 기존 session headers를 사용하며 backend
  성공 전에 node, mapping, relation field mapping, Cytoscape, 성공 notice를 commit하지 않아야 한다.

- **FR-056**: MultiLayer Ontology의 library workspace는 Viewer가 schema 목록, 이름 편집 draft, 삭제
  target, activate/detail load, 화면 적용 retry, recent history를 직접 조합하지 않고 독립 workflow
  lifecycle이 소유해야 한다. 목록 transport failure는 기존 목록을 유지하면서 성공 빈 목록과 구분하고,
  schema JSON이 없는 손상 entry 제외 건수를 표시해야 한다. rename은 공백/no-op/transport failure를
  구분하고 backend 성공 전 목록과 현재 schema 이름을 바꾸지 않으며, Enter와 blur가 같은 요청을
  중복 제출하지 않아야 한다. delete는 고정된 id/name snapshot을 사용하고 backend 성공 전 목록,
  현재 canvas, recent history를 지우지 않아야 한다. load는 activate failure, activate 성공 뒤 detail
  failure, detail 성공 뒤 화면 적용 failure를 구분하고 기존 화면을 유지해야 한다. detail retry는 이미
  성공한 activate를 반복하지 않고, 화면 적용 retry는 API를 반복하지 않은 채 복제된 동일 schema
  snapshot만 다시 적용해야 한다. recent history, dropdown close, 성공 notice는 화면 적용이 완전히
  끝난 뒤에만 commit되어야 한다.

- **FR-057**: MultiLayer Ontology의 datasource mapping workspace는 Viewer가 자동 연결 stream 상태,
  후보 확장 상태, 단건 pending/error, bulk target·부분 성공·실패-only retry를 직접 소유하지 않도록
  독립 workflow lifecycle로 분리해야 한다. 자동 연결은 현재 node id/name/layer snapshot을 고정하고
  dialog close·새 검색·component scope 종료 때 이전 stream을 abort하거나 invalidate하여 늦은 event가
  현재 progress와 mapping을 바꾸지 못해야 한다. stream transport failure, backend error event,
  terminal result 없는 종료, 성공한 빈 mapping은 서로 구분해야 하며 이전 실패 뒤 재시도는 새 결과가
  오기 전까지 이전 mapping을 성공 결과처럼 남기지 않아야 한다. 단건과 일괄 확정은 복제된
  node/candidate snapshot으로 `/confirm-datasource`를 한 번 호출하고 runtime 성공 검증 뒤에만 local
  graph projection callback을 실행해야 한다. backend 성공 뒤 local projection이 실패하면 같은 backend
  mutation을 반복하지 않고 고정된 local snapshot만 다시 적용해야 한다. bulk는 backend failure와
  local projection failure를 target별로 구분하고 성공 target을 다시 호출하지 않은 채 실패 target만
  재시도해야 한다. 모든 mapping·progress·pending·error 갱신은 입력 객체를 직접 변경하지 않는
  immutable projection이어야 한다.

- **FR-058**: MultiLayer Ontology의 document generation 완료, DB schema generation 완료, library
  load는 각자 node/relationship 변환·관계 정제·schema identity·이름·요약을 다시 구현하지 않고 하나의
  canvas schema projection 정책을 사용해야 한다. projection은 입력 schema를 변경하지 않고 node와
  relationship을 복제하며, 존재하지 않는 endpoint 관계를 제외하고 중복·빈 relationship id를
  결정론적으로 재발급해야 한다. DB schema 생성의 `from_field`/`to_field` alias와 기본 label/type,
  document generation의 동의어 수와 layer 요약, library load의 기존 필드·position은 각 source
  계약대로 보존해야 한다. 새 generation 결과는 응답의 schema id/name을 Viewer identity에 반영하며,
  id가 없는 새 결과는 이전 schema id를 유지하지 않고 명시적으로 `null`로 전환하여 후속 저장이 이전
  Ontology를 덮어쓰지 않아야 한다. library load는 요청한 schema id를 authoritative identity로 사용한다.
  관계 제외·재발급 수는 visible generation log 또는 load warning으로 남겨야 하며, 성공한 빈 graph와
  malformed/실패 generation을 같은 상태로 취급하지 않아야 한다.

- **FR-059**: MultiLayer Ontology의 Cytoscape presentation 규칙은 Vue 화면의 반응 상태와 이벤트
  orchestration에 섞지 않고 순수 canvas-style model이 소유해야 한다. model은 dark/light theme만
  명시적 입력으로 받아 node·selection·relationship type·edgehandles·agent activity·causal
  highlight·filter projection selector와 style을 결정적으로 반환해야 한다. 현재 selector, 색상,
  크기, 선 모양, opacity, label/background 규칙과 배열 순서는 사용자 결과를 보존하기 위해 동일해야
  하며, 호출 간 공유 객체를 반환하거나 입력 이후에 외부 상태를 읽어서는 안 된다. Viewer는 현재
  theme을 전달하고 Cytoscape 초기화와 theme 갱신만 조립해야 하며 presentation selector/style
  literal을 다시 소유하지 않아야 한다.

- **FR-060**: MultiLayer Ontology의 canonical layer catalog와 node/relationship→Cytoscape element
  변환은 Vue 화면이나 Cytoscape instance가 아니라 순수 canvas graph projection이 소유해야 한다.
  layer id·표시명·색상·아이콘·계층 rank는 하나의 선언에서 파생되어야 하며 Viewer와 layout이 별도의
  rank/color 사본을 갖지 않아야 한다. projection은 node id/name/layer/color와 유효한 저장 position,
  relationship id/weight/source·target layer를 보존하면서 기존 방향 정책을 결정적으로 적용해야 한다.
  수평 `PRECEDES`/`FOLLOWS`는 기존처럼 `NEXT`로 정규화하고, 상위→하위 또는 같은 계층의 비상향 관계는
  endpoint와 inverse type을 함께 뒤집어야 한다. 알려지지 않은 역관계는 `REV_` prefix를 사용해야 한다.
  저장 위치는 모든 node가 유한한 x/y 좌표를 가질 때만 전체 preset으로 인정해야 하며, 일부 node만
  위치가 있거나 NaN/무한 좌표가 섞인 graph는 겹치는 preset을 사용하지 않고 layout 대상이 되어야 한다.
  Viewer는 projection 결과로 Cytoscape를 만들고 event wiring·selection 복원·layout 실행만 조립해야 한다.

- **FR-061**: MultiLayer Ontology의 hierarchical layout은 Cytoscape collection을 직접 순회하며
  위치를 계산하는 Viewer 함수가 아니라 순수 layout projection이 소유해야 한다. 입력은 현재 renderer의
  node id/layer와 정규화된 edge source/target snapshot이어야 하며, 출력은 node id별 유한한 x/y
  position이어야 한다. KPI·Measure의 same-layer dependency depth, Process의 연결 순서, Resource의
  고정 행, Driver의 연결 node 평균과 반복 pull·최소 간격 보정은 기존 결과와 결정론적 순서를 보존해야
  한다. 빈 graph, 단절 node, cycle, Driver끼리만 연결된 graph, 알려지지 않은 layer는 throw·NaN·무한
  좌표를 만들지 않아야 하며 입력 배열을 변경하지 않아야 한다. Viewer는 Cytoscape에서 snapshot을 만들고
  projection position을 한 번 적용한 뒤 viewport fit만 수행해야 하며 layout 상수·depth traversal·
  Driver 배치 알고리즘을 다시 소유하지 않아야 한다.

- **FR-062**: Schema Modeling canvas의 `application/json` drag payload는 브라우저 외부 입력 경계로
  취급하고 `JSON.parse` 결과를 곧바로 store에 전달하지 않아야 한다. parser는 현재 생산자가 사용하는
  `{table}`, direct table, ObjectType direct payload 세 형태를 구분하고 table name/schema/description/
  column count/datasource, ObjectType columns와 behaviors를 runtime 검증한 뒤 canonical add target을
  반환해야 한다. Ontology behavior 구조 검증은 API와 drag parser가 서로 다른 사본을 갖지 않고 domain
  model의 단일 parser를 재사용해야 한다. 잘못된 JSON, 배열/primitive, 빈 identity, 잘못된 column/
  behavior 구조는 canvas mutation과 fit을 수행하지 않고 visible alert로 표시해야 한다. 유효한 drop의
  column/API 추가가 실패하면 복제된 table/options/position target을 보존해 동일 target만 재시도할 수
  있어야 하며 새 drop 또는 성공 전까지 오류를 조용히 지우지 않아야 한다. Viewer UI는 dataTransfer
  읽기, canvas-relative position 계산, pending/error/retry 표시와 projection 적용만 조립해야 한다.

- **FR-063**: Schema Modeling canvas의 `상위 10개`와 `전체` 추가는 여러 비파괴적 조회를 하나의
  사용자 mutation으로 조립하므로 중간 요청 실패를 부분 성공이나 기존 canvas 삭제로 노출하지 않아야
  한다. 실행 시작 시 table identity/metadata와 mode를 복제한 immutable attempt를 만들고, 실패 시
  실행 전 node/edge/relationship/highlight 상태와 full-view mode를 보존한 채 visible error와 동일
  attempt retry를 제공해야 한다. `전체`는 모든 column 응답과 grid node projection을 준비한 뒤 한 번만
  canvas를 교체해야 하며, `상위 10개`는 기존 related-table 자동 확장 결과까지 포함한 canvas transaction
  전체를 commit 또는 rollback해야 한다. 성공한 attempt만 한 번 fit하고, 실패·빈 target·중복 click은
  fit이나 mode 변경을 만들지 않아야 한다. node data와 grid position 생성은 store/UI 중복 literal이
  아닌 framework-free projection이 소유하고 single-table와 all-table 경로가 같은 logical metadata,
  column count, primary/ObjectType/behavior 기본 계약을 사용해야 한다.

- **FR-064**: Schema Modeling canvas의 자동·수동 fit은 graph node bounds만 맞추고 floating UI를
  무시하지 않아야 한다. 좌상단 table controls, 우상단 expanded/collapsed legend, 하단 toolbar와
  우하단 minimap이 차지하는 실제 canvas-relative extent를 측정해 비대칭 safe padding으로 projection
  해야 한다. 기존 numeric padding의 기본 여백 비율은 보존하되 overlay extent와 gap보다 작아서는 안
  되며, 잘못되거나 canvas보다 큰 측정값은 음수·NaN·사용 불가능한 content area를 만들지 않아야 한다.
  drop, double-click, related-table, top/all batch 성공과 수동 fit이 모두 같은 helper를 사용하고 실패한
  mutation은 helper를 호출하지 않아야 한다. legend 접기 상태에 따라 다음 fit의 right inset은 실제
  축소 폭을 반영해야 하며 Vue UI는 DOM 측정과 fit 호출만 소유해야 한다.

- **FR-065**: 720px 이하 viewport에서 Schema Modeling의 고정 260~280px table panel이 canvas를
  압축하지 않아야 한다. table panel은 기본 닫힌 overlay drawer로 전환하고 명시적인 table-list trigger,
  close button, backdrop, Escape 닫기, trigger focus 복원을 제공해야 한다. 닫힌 drawer의 focusable
  descendants는 tab order에 남지 않아야 하며 열린 drawer는 viewport 너비 안에 머물고 내부 목록만
  스크롤해야 한다. mobile 최초 legend는 collapsed여야 하고 minimap은 숨기되 pan/zoom/manual fit,
  table search/add와 모든 관계 기능은 유지해야 한다. table 추가 성공 시 drawer는 닫혀 canvas 결과가
  보여야 하며 document/root horizontal overflow, floating control/legend/node overlap이 없어야 한다.

- **FR-066**: What-If Simulator는 같은 `.main-content` class를 중첩해 두 개의 vertical scroll owner와
  중복 padding/height/overflow 규칙을 만들지 않아야 한다. 세션 sidebar list를 제외한 workflow 본문은
  의미가 명확한 단일 `workflow-scroll` owner를 가져야 하고, 가운데 width constraint는 scroll을 갖지
  않는 `workflow-content`가 소유해야 한다. sticky step 판단은 단일 owner의 scrollTop만 사용해야 하며
  current step 또는 restored/new session이 바뀌면 nextTick 후 owner의 top/left를 0으로 초기화해야 한다.
  app feature 전환은 keyed component remount 계약에 따라 What-If 재진입 시 새 owner가 top 0에서
  시작해야 하고 app side navigation의 독립 scroll 위치는 변경하지 않아야 한다.

- **FR-067**: 768px 이하 viewport에서 What-If의 280px session sidebar가 workflow를 0px 수준으로
  압축하지 않아야 한다. sidebar는 desktop의 280px/collapsed 동작을 보존하면서 mobile에서는 기본
  닫힌 overlay drawer가 되어야 한다. workflow에는 명시적인 session-list trigger를 제공하고 drawer는
  close button, backdrop, Escape 닫기, open 시 close focus, close 시 trigger focus 복원을 제공해야
  한다. 닫힌 drawer는 화면과 tab order에서 제외되고 열린 drawer는 app content viewport 안에
  머물러야 한다. session restore/new-session 결과와 저장 계약은 유지하되 mobile 선택 성공 후 drawer를
  닫아 갱신된 workflow를 보여야 하며 document horizontal overflow가 없어야 한다.

- **FR-068**: 클릭으로 상태를 변경하는 설정 disclosure, pivot field removal, schema column description
  edit control은 `div`/`span` click handler에만 의존하지 않아야 한다. 각각 native button과 명확한
  accessible name을 제공하고, disclosure는 `aria-expanded`/`aria-controls`로 실제 panel 상태를
  표현해야 한다. 기존 mouse click 결과, store mutation target/index, edit 대상 column, 시각적 크기와
  배치는 유지하면서 Enter/Space keyboard activation과 visible focus를 제공해야 한다.

- **FR-069**: Ontology의 Object chart section, generation log, datasource candidate detail disclosure는
  action button을 포함한 전체 header `div` click에 의존하지 않아야 한다. 접기/펼치기 전용 native button은
  대상 이름, `aria-expanded`, `aria-controls`를 소유하고 preview/confirm action과 형제 control로
  분리되어야 한다. 부모가 소비하지 않아 아무 결과도 만들지 않는 Object chart `configure-chart` emit과
  톱니 control은 제거하고, 실제 chart configuration은 기존 ObjectType modeler 편집 책임에만 남겨야 한다.
  기존 collapsed set key, candidate index, log list, transition, action stop-propagation 결과는 유지하며
  Enter/Space와 visible focus로 같은 projection을 전환해야 한다. 펼친 candidate detail은 sibling mapping
  수에 의해 flex 압축되어서는 안 되며 내부 콘텐츠 높이를 보존하고 바깥 mapping list가 스크롤해야 한다.

- **FR-070**: Agents.md context sidebar의 built-in method와 ProcessGPT group은 클릭 가능한 `div` 또는
  중첩 button에 의존하지 않아야 한다. 각 실제 disclosure는 native button, group 이름,
  `aria-expanded`, `aria-controls`, Enter/Space, visible focus를 제공해야 하며 ProcessGPT 추가 action은
  toggle의 형제 button이어야 한다. 연결된 Behavior model 목록은 항상 펼쳐져 있고 대응하는 expanded
  state가 없으므로 클릭 affordance와 존재하지 않는 `_models` toggle 호출을 제거한 정적 label이어야 한다.
  기존 method mention 삽입, ProcessGPT 목록/Behavior 생성 실패와 exact retry, dialog focus/Escape 및
  responsive 결과는 바꾸지 않아야 한다.

- **FR-071**: Object Explorer의 ObjectType row는 전체 `div` click과 중첩 expand button에 selection과
  disclosure 책임을 섞지 않아야 한다. type selection과 detail expansion은 형제 native button이어야 하며
  selection은 selected state, expansion은 type 이름·`aria-expanded`·`aria-controls`를 각각 소유해야 한다.
  expand keyboard 조작은 object data request나 selection을 발생시키지 않고, select keyboard 조작은 기존
  단일 type-select→data request→graph/chart 결과를 정확히 한 번 발생시켜야 한다. 기존 row 배치, filter,
  materialized-view badge, details transition 및 type key는 유지해야 한다.

- **FR-072**: Schema Canvas table tree의 datasource/schema header는 클릭 가능한 `div`가 아니라
  native disclosure button이어야 하며 이름·`aria-expanded`·`aria-controls`·Enter/Space·visible focus를
  제공해야 한다. schema expansion identity는 schema 이름만이 아니라 datasource+schema canonical pair를
  사용해야 하며, 서로 다른 datasource에 같은 이름의 schema가 있어도 한쪽 toggle이 다른 쪽을 변경해서는
  안 된다. datasource toggle은 자신의 schema subtree만 제어하고 기존 기본-expanded 결과, table count,
  table drag/double-click/select/remove 동작은 유지해야 한다.

- **FR-073**: What-If data table 선택, OLAP field 추가, Security permission tree 선택·disclosure는
  클릭 가능한 `div`와 event bubbling 또는 mouse-only double-click에 의존하지 않아야 한다. What-If의
  table card는 단일 native checkbox ownership으로 card click·Enter/Space가 정확히 한 번 같은 selection과
  기존 SQL projection을 만들고, file drop target은 native button으로 picker keyboard activation,
  확장자 validation, 동일 파일 재선택, 실패 뒤 exact-file retry를 제공해야 한다. 성공 전에 파일을
  업로드 완료로 표시해서는 안 된다. OLAP dimension/measure field는 drag payload를 보존하면서 명명된
  native add control을 제공하고 keyboard activation이 기존 row/measure de-duplication을 사용해야 한다.
  Security datasource/schema의 disclosure와 node selection은 형제 native controls로 분리하고 각각
  expanded/controls와 selected state만 소유해야 하며 table selection도 native control이어야 한다.
  disclosure keyboard 조작은 selection을 변경하지 않아야 하고 selection은 disclosure를 변경하지 않아야
  한다. 같은 user/role에 대한 datasource→schema→table cascade는 가장 구체적인 규칙이 상위 규칙을
  override해야 하며 상속 표시는 실제 access level을 `inherited`라는 단일 값으로 덮어쓰지 않고 level과
  inherited source를 함께 보여야 한다. 기존 backend payload·실패·재시도와 responsive geometry는
  유지해야 한다.

- **FR-074**: MultiLayer Ontology의 layer group header는 native disclosure로 실제 layer node list의
  이름·expanded·controls를 소유해야 한다. 선택 노드의 layer badge와 layer option은 native button이어야
  하며 badge는 expanded/controls, option은 current layer pressed state를 표현해야 한다. Enter/Space
  조작은 기존 collapse set과 local graph layer mutation/history 결과를 그대로 한 번만 변경해야 한다.
  Behavior tab의 model list 조회는 console warning 뒤 성공한 empty state로 보이면 안 된다. schema+node
  target과 request sequence/AbortSignal을 소유하고 새 target에서는 이전 결과를 제거하되 같은 target
  refresh 실패에서는 마지막 유효 결과를 보존해야 한다. loading, 실제 오류, exact target retry를
  Agents.md editor와 함께 보이는 상태로 제공하고 stale/aborted response가 현재 node 결과를 덮어써서는
  안 된다.

- **FR-075**: Code Analysis upload file tabs, Schema detail Behavior cards, Schema Canvas table-node의
  column source·column expansion·Behavior actions는 클릭 가능한 `div`/`span`, 중첩 interactive control,
  mouse-only double-click, hover-only action에 의존하지 않아야 한다. upload tab activation과 close는
  형제 native buttons로 분리하고 active tab은 selected state를 표현하며 activation은 기존 viewer
  scroll reset/active-tab visibility를 한 번만 실행해야 한다. schema detail Behavior는 전체 card
  hitbox와 편집 대상 이름을 가진 native control로 같은 dialog payload를 열어야 한다. table-node의
  column source와 column expansion은 native buttons로 기존 reference request 및 visible column
  projection을 유지해야 한다. keyboard activation으로 연 reference popup은 `(0,0)` synthetic click
  좌표를 사용하지 않고 실제 control에 anchor되어 모든 viewport에서 잘리지 않아야 한다. 각 Behavior는
  이름이 있는 edit/run native controls를 항상 keyboard와
  focus로 발견할 수 있어야 하며 기존 edit/run emit payload를 변경해서는 안 된다. 이 교정은 기존
  Catalog/Analyzer API 호출, graph handle drag, table selection, responsive geometry를 바꾸지 않아야 한다.

- **FR-076**: MultiLayer Ontology의 canvas/edge context actions, selected-node relation edit, generation
  PDF picker, datasource mapping disclosure, node datasource search-result selection은 click-only
  `div` 또는 mouse-only double-click에 의존하지 않아야 한다. context menu는 이름이 있는 native
  menuitem buttons로 기존 node/edge mutation handler를 정확히 한 번 호출해야 한다. relation row는
  source·type·target을 유지하면서 명명된 native edit action을 제공해야 한다. PDF drop owner는 drag/drop을
  유지하면서 native picker button, input label, same-file reset, validation error를 제공해야 한다.
  mapping header는 deterministic detail ID의 expanded/controls state만 소유하고 candidate preview/confirm
  mutation과 중첩되지 않아야 한다. search result는 preview와 selection을 형제 native buttons로 유지하고
  selection은 pressed state와 기존 exact confirmation target을 함께 반영해야 한다. 이 교정은 graph
  history, API payload, retry/abort/stale rejection, dialog geometry를 변경해서는 안 된다.

- **FR-077**: Schema Canvas의 catalog search/tree table과 semantic result, ObjectType Modeler의
  source card는 drag payload를 유지하면서 mouse-only double-click 없이 캔버스 추가를 수행할 수 있어야
  한다. 이미 캔버스에 있는 table은 native selection과 target-labelled removal을 형제 controls로
  제공하고, 아직 없는 table과 semantic result는 target-labelled add control을 제공해야 한다.
  ObjectType source는 이름이 있는 add button을 항상 표시하고 Behavior/edit/delete sibling actions도
  hover에만 의존하지 않아야 한다. selection과 add는 각각 기존 `selectNode`와 `addTableToCanvas`
  경로를 정확히 한 번 호출하며 datasource/schema identity, drag JSON, mobile panel close, viewport fit,
  ObjectType columns/behaviors projection을 변경해서는 안 된다. 이미 별도 edit button이 있는 saved-schema
  name과 selected-node name의 redundant double-click 편집 경로는 제거하되 기존 button/keyboard 편집은
  유지해야 한다.

- **FR-078**: 선택·활성화 결과를 표시하는 layout row가 click-only handler나 simulated
  `div[role=button]`을 소유해서는 안 된다. Schema Behavior 실행 시도는 선택 상태를 가진 native button이
  현재 attempt selection을 정확히 한 번 전환하고, Schema table/column reference 결과는 native button이
  기존 procedure/framework navigation payload를 변경 없이 emit해야 한다. Ontology 자식 선택 표는
  이름이 있는 native checkbox만 selection을 소유하고 정보 cell click과 nested activation에 의존하지
  않아야 하며, 전체 선택 checkbox도 현재 filter 범위와 partial state를 명시해야 한다. 이 교정은
  Behavior result projection, reference popup anchor/close, child filtering·confirm 순서, desktop/mobile
  geometry를 변경해서는 안 된다. 이미 keyboard row와 독립 action propagation을 갖춘 Catalog glossary
  term row는 같은 모양만으로 재작성하지 않는다.

- **FR-079**: 일시적으로 표시되는 reveal·context·confirmation·status action은 presentation surface
  전체의 mouse click에 의존하거나 이미 존재하는 공용 dialog 수명주기를 복제해서는 안 된다. Text2SQL의
  숨겨진 이전 메시지는 native button으로 현재 window를 한 번 확장해야 한다. 숨김 수와 window는
  tool/thinking을 제외한 실제 표시 대상에서 같은 순수 정책으로 계산되어야 한다. Electron Scope Browser의
  context menu는 keyboard context activation, native menuitem, viewport clamp, Escape와 trigger focus
  복귀를 제공해야 한다. 휴지통 확인은 공용 `ActionDialog`의 label·Escape·focus trap·trigger 복귀를
  재사용하고 기존 recoverable trash target과 확인 전 mutation 0건을 보존해야 한다. toast status는
  메시지 자체 click이 아니라 이름 있는 sibling close button으로 닫고 해당 managed timer도 취소해야
  한다. 이 교정은 file tree selection/expand, multi-buffer content/EOL, IPC request body, Text2SQL
  message ordering과 feature 전환 scroll reset을 변경해서는 안 된다.

- **FR-080**: 화면 전환·dialog 닫기·재저장·빠른 설정 변경 뒤에 실행되는 지연 callback은 해당
  component/store 수명주기가 소유해야 한다. 같은 의미의 후속 작업은 latest-wins key로 이전 callback을
  취소하고 scope dispose에서 모두 해제해야 한다. Ontology extraction canvas의 fit, ObjectType chart
  저장 status, BPMN inline/popup viewport·open·save status, app theme transition은 raw timeout을 직접
  만들면 안 된다. 닫힌 BPMN popup은 지연 editor/listener를 생성하지 않고, 이전 저장 status timer는
  다음 성공/실패 메시지를 지우지 않으며, 빠른 theme 변경은 마지막 변경 후 전체 fade 시간 동안
  transition class를 유지해야 한다. BPMN modeler는 현재 `diagram-js`에서 제거된 명시적
  `keyboard.bindTo` 설정을 넘겨 console error를 만들면 안 된다. 명시적 start/stop을 소유한 analyzer heartbeat, semantic elapsed,
  node-agent/causal polling interval은 같은 모양만으로 재작성하지 않는다.
  ObjectType chart 성공/실패 status는 내부 chart surface 위에서 완전히 보여야 하며 dialog label과 이름 있는
  close control, Escape, focus trap과 trigger focus 복귀를 유지해야 한다. 390×844에서는 config와 preview를
  세로 배치하고 document 가로 overflow를 만들면 안 된다. 작은/세로형 BPMN의 inline fit은 폭만 기준으로 과대 확대해 문서 높이를
  늘리면 안 되고 viewport 기반 높이와 확대 상한 안에서 pan 가능한 view를 제공해야 한다. 전체 편집 popup의
  크기와 저장 workflow는 이 inline 제한의 영향을 받으면 안 된다.

- **FR-081**: form/choice modal의 label·Escape·Tab 순환·초기 focus·닫은 뒤 trigger focus 복귀를
  화면마다 복제해서는 안 된다. backend 지식이 없는 shared dialog-focus lifecycle은 active 상태,
  dialog root, close 가능 여부와 close 요청만 받아 document key listener와 focus ownership을
  일관되게 관리해야 한다. Analyzer 기존 데이터 처리 선택, Security 권한 추가, Ontology extraction
  feedback, Ontology 동의어 제안은 이름 있는 `role=dialog`, 이름 있는 close control, visible focus와
  viewport 내부 scroll을 제공해야 한다. 기존 delete/append와 name-case 결과, 권한 payload·성공 전 상태
  보존·실패 재시도, feedback submit, 동의어 선택·부분 실패 결과는 변경하지 않는다. pending 중 닫기
  가능 여부도 각 화면의 기존 정책을 유지해야 하며 shared lifecycle이 mutation을 소유해서는 안 된다.

- **FR-082**: Ontology canvas의 container-size init retry, 저장 node 선택 복원, detail panel 폭 변경
  뒤 viewport 동기화, edgehandles zoom 복원, schema loading 종료는 매 호출마다 새 임의 timer key를
  만들어서는 안 된다. 다섯 작업은 canvas
  generation과 이름 있는 latest-task key를 함께 소유해야 하며 schema projection commit, canvas destroy,
  component dispose는 이전 generation의 모든 callback을 무효화해야 한다. layoutstop처럼 timer 이전의
  외부 event callback도 등록 당시 generation을 보존하고 stale event에서 새 timer를 만들면 안 된다.
  zoom 복원은 callback 시점의 전역 canvas가 아니라 drag 시작 때의 Cytoscape instance만 대상으로 해야
  한다. rapid A→B schema 전환 뒤 A의 init·selection·loading callback이 B의 node selection, loading
  status, viewport를 변경해서는 안 되며 정상 단일 schema의 init, layout, 저장 selection 복원과
  edgehandles interaction 결과는 유지해야 한다. detail panel open/close/resize 뒤에는 현재 zoom을
  유지하면서 Cytoscape가 실제 container 크기를 다시 읽고 선택 node가 있으면 그 node를, 없으면 전체
  node를 가용 viewport 중앙에 두어 패널 아래에 가려진 과거 pan을 남기지 않아야 한다.

- **FR-083**: shared destructive action과 Schema/Ontology modeling의 cardinality, Ontology relationship,
  Catalog relationship, ObjectType delete dialog는 서로 다른 document key listener와 focus 복귀 구현을
  복제해서는 안 된다. 모두 shared dialog focus lifecycle을 사용해 이름 있는 dialog/alertdialog,
  초기 focus, Tab/Shift+Tab 순환, Escape, close control, trigger focus 복귀와 mobile 내부 scroll을
  제공해야 한다. mutation pending 중 close가 target/draft/error를 버리면 안 되며, cardinality 생성
  실패는 overlay 뒤의 canvas alert만으로 표시하지 않고 열린 dialog 안에서 같은 frozen 입력으로
  재시도할 수 있어야 한다. ObjectType rename처럼 open 생산자가 0인 dead dialog/state/API 호출은
  접근성만 덧씌우지 말고 제거해야 한다. 기존 ObjectType delete confirmation name, relationship
  cardinality/description, Ontology create/edit/delete와 Catalog read/delete payload 및 성공 결과는
  변경하지 않는다.

- **FR-084**: Text2SQL feedback, Text2SQL→Ontology instance 생성, Ontology Behavior 편집,
  ObjectType 편집 dialog는 document key listener, Tab trap, trigger 복귀를 각각 재구현해서는 안 된다.
  네 dialog는 shared focus lifecycle을 사용하되 각자의 초기 focus, mutation pending close 정책,
  draft/error/exact retry와 API payload를 유지해야 한다. Behavior의 nested delete alertdialog가 열리는
  동안 outer dialog는 key 처리를 일시 정지해야 하지만 outer trigger 소유권을 반환해서는 안 되며,
  nested close 뒤 focus는 outer delete trigger로, outer close 뒤 focus는 원래 화면 trigger로 복귀해야
  한다. ObjectType rename/chart save pending 중 overlay/Escape/close로 draft와 결과를 폐기해서는 안
  된다. inactive `v-show` tab의 control은 Tab 순환 대상으로 계산하면 안 된다.

- **FR-085**: App 설정 위험 작업, Text2SQL 히스토리 삭제, Agents.md ProcessGPT 선택,
  OLAP 큐브 관리자와 큐브 편집기는 dialog마다 Escape, Tab trap, trigger 복귀를 복제해서는 안 된다.
  다섯 dialog는 shared focus lifecycle을 사용하되 기존 이름·설명·초기 focus, pending close guard,
  error/exact retry, 선택 draft와 API/IPC payload를 유지해야 한다. OLAP manager의 delete
  alertdialog와 cube editor의 ETL action alertdialog가 열리는 동안 outer key handling만 suspend하고
  outer trigger ownership은 유지해야 한다. ProcessGPT 목록 read는 닫을 때 취소되어야 하고,
  process mutation pending 중에는 닫혀서는 안 된다. BPMN의 Escape/save shortcut과 What-If
  visualization disposal처럼 keyboard 외 수명주기를 함께 소유하는 화면은 이 배치에 억지로 포함하지
  않고 별도 책임으로 검증한다.

- **FR-086**: What-If causal explainability, Ontology SQL instance explorer, Security audit detail,
  Object Explorer child selection, Catalog holiday form dialog는 이름 있는 modal, 최초 focus,
  Tab/Shift+Tab 순환, Escape와 연결된 trigger 복귀를 제공해야 하며 keyboard/focus lifecycle을
  각각 재구현해서는 안 된다. Causal modal은 shared focus lifecycle을 사용하되 Cytoscape/Chart와
  animation generation 폐기는 기존 visualization 책임으로 유지해야 한다. SQL instance explorer는
  create pending 중 닫히지 않아야 하고, close/reopen 시 delayed auto-close timer와 이전 config/error/
  success/warning을 폐기해야 한다. Audit detail·child selection·holiday form의 표시 데이터, selection,
  draft commit/cancel 결과와 API payload는 변경하지 않는다.

- **FR-087**: MultiLayer Ontology Viewer의 canvas·node·relationship context menu 표현은
  graph orchestration과 분리된 이름 있는 UI 책임이어야 한다. 메뉴는 기존 absolute 좌표, layer
  icon/name/color, node/relationship label, native `menu`/`menuitem`, action 순서와 dark/light
  visual 결과를 그대로 유지해야 한다. 새 컴포넌트는 Cytoscape, graph arrays, filter, What-If,
  rename/delete mutation을 직접 소유하지 않고 명시적 event만 emit해야 하며, 부모는 기존 action
  handler와 graph position을 계속 소유해야 한다.

- **FR-088**: MultiLayer Ontology canvas의 관계 생성 대기 안내, 연결 모드 control과 graph
  legend는 graph mutation과 분리된 canvas overlay UI 책임이어야 한다. overlay는 선택한 source
  이름, loading/node-count에 따른 disabled 상태, 현재 연결 모드, layer presentation만 입력받고
  cancel/toggle event만 반환해야 한다. 관계 대기 취소·연결 모드 전환·Cytoscape edgehandles와
  relation draft는 부모가 계속 소유한다. 연결 모드 control은 이름과 pressed 상태를 노출하고,
  대기 안내는 상태와 취소 action을 제공하며, legend의 기존 layer/edge 순서·색상과 desktop/mobile
  배치 및 dark/light 결과를 유지해야 한다. 관계 대기 진입 시 기존 detail 선택은 정상적인
  deselect lifecycle로 종료되어 mobile full-width detail이 canvas target과 cancel 안내를 가려서는
  안 된다. mobile layer panel의 기존 target 선택 경로는 유지하고 대기 안내는 panel보다 위에
  표시되어야 하며, 취소 또는 target 선택 뒤에는 유효한 이전 selection을 복원해 결과 확인 흐름을
  훼손해서는 안 된다.

- **FR-089**: MultiLayer Ontology의 layer panel header/toggle, layer disclosure와 node
  selection/context action은 graph orchestration과 분리된 이름 있는 panel UI 책임이어야 한다.
  panel은 layer별 node projection, collapsed/selected 상태만 입력받고 panel toggle, layer toggle,
  node activate, node context event만 반환해야 한다. selected/pending relation 처리, context-menu
  좌표, Cytoscape와 graph arrays mutation은 부모가 계속 소유한다. 기존 layer/node 순서와 count,
  `aria-expanded`/`aria-controls`/`aria-pressed`, keyboard activation, dark/light skin, 44px collapsed
  상태와 mobile overlay geometry를 유지해야 한다.

- **FR-090**: MultiLayer Ontology의 relation detail preview·속성 입력·양쪽 column 상태·retry/error
  presentation은 relation editor lifecycle과 분리된 이름 있는 UI 책임이어야 한다. UI는 relation/form/
  column 상태를 입력받고 form field update, save, datasource 연결, column retry, delete, close intent만
  반환해야 하며 API, relationship mutation, history checkpoint와 Cytoscape를 소유해서는 안 된다.
  기존 select/change와 input blur/Enter 저장 시점, datasource 없음·loading·error·ready 구분,
  동일 관계 column retry, alert semantics와 dark/light/mobile 결과는 유지해야 한다.

- **FR-091**: MultiLayer Ontology의 node detail header/tab controls와 info presentation은
  data/analysis/Behavior/BPMN orchestration 및 graph mutation과 분리된 이름 있는 UI 책임이어야 한다.
  tab UI는 active/capability/loading/count 상태를 입력받아 tab intent만 반환하고, 부모가 실제 data load,
  analysis transition, Behavior load와 BPMN activation을 결정해야 한다. info UI는 node/layer/filter/
  datasource/relationship projection과 edit state를 입력받고 name draft/save/cancel, layer selector,
  datasource 연결, relationship edit intent만 반환해야 한다. 이름 input focus/select는 UI가 소유하되
  rename/layer history checkpoint와 Cytoscape 갱신은 부모가 계속 소유해야 한다. 기존 tab availability,
  node name Enter/blur/Escape, layer disclosure, filter/data source/relationship 표시와 dark/light/mobile
  결과를 유지하고 tablist/tab/tabpanel의 연결된 접근성 상태를 제공해야 한다.

- **FR-092**: Node detail의 Behavior와 BPMN tab presentation은 부모의 모델 조회·retry target,
  schema/node selection 및 graph state와 분리되어야 한다. Behavior UI는 loading/error/models를
  입력받고 retry/editor mutation 완료 intent만 반환하며, BPMN UI는 node identity/name/XML을 입력받아
  saved XML만 반환해야 한다. API·abort sequence·selection·graph mutation은 부모가 소유하고 기존
  loading/alert/retry, Agents.md 생성·삭제 refresh, BPMN save/empty 상태와 tabpanel semantics를 유지한다.

- **FR-093**: Node detail Analysis 결과/empty presentation과 Data loading/empty/source-summary
  presentation은 API, ECharts와 분석 lifecycle에서 분리되어야 한다. UI는 상태와 projection을 입력받아
  retry/fallback/connect/create, metric update/reanalyze/reconfigure/cancel, business-day toggle intent만
  반환해야 한다. 부모는 node target, API retry·Text2SQL fallback capability, chart instance/brush,
  causal analysis 실행·취소·metric 재계산을 소유하고 기존 상태 구분·action availability·tabpanel
  semantics·desktop/mobile geometry를 유지해야 한다.

- **FR-094**: Node Data chart host/controls/config와 raw table presentation은 ECharts instance·brush
  extraction·analysis execution에서 분리되어야 한다. chart UI는 host element mount/unmount와 user
  intent만 반환하고 brush selection 표시 시 config를 viewport에 노출해야 한다. table UI는 columns,
  time/numeric metadata, rows와 rowCount를 입력받아 기존 locale cell formatting과 50-row boundary를
  유지해야 한다. 자식은 API/ECharts instance를 소유하지 않고 부모는 host identity 변경 시 dispose/
  render lifecycle을 유지해야 한다.

- **FR-095**: Ontology node filter와 local relationship draft dialog presentation은 canvas mutation,
  filter propagation·data reload lifecycle에서 분리되어야 한다. 자식은 controlled draft와 projection을
  입력받아 field/type/description update, retry/clear/confirm/cancel intent만 반환하고 API·Cytoscape·
  graph state를 소유하지 않아야 한다. modal label, initial focus, Tab wrap, Escape, trigger focus 복귀,
  unsupported backend-contract 안내와 기존 desktop/mobile geometry를 유지해야 한다.

- **FR-096**: Ontology node-data ECharts host/render/dispose/resize와 causal brush event bridge는
  viewer component에서 전용 chart runtime composable로 분리되어야 한다. runtime은 node-data result,
  theme, selected node/schema와 causal selection callback만 입력받고 API·Cytoscape·analysis request를
  소유하지 않아야 한다. host 교체, empty/table result, rerender, unmount에서 instance와 delayed render를
  정리하고 기존 chart model·brush range 복원·ready/brush-mode 상태를 유지해야 한다.

- **FR-097**: Ontology datasource auto-link progress/mapping/candidate dialog presentation은
  auto-link SSE와 confirmation mutation lifecycle에서 분리되어야 한다. UI는 immutable mapping/progress
  상태를 입력받아 close/retry, mapping/candidate disclosure, preview, single/bulk confirmation intent만
  반환하고 API·abort controller·mapping mutation을 소유하지 않아야 한다. 진행률, found/confirmed/
  not-found/error 통계, exact retry 오류, candidate columns/SQL/sample과 nested bulk dialog focus
  suspension을 기존 desktop/mobile 결과와 동일하게 유지해야 한다.

- **FR-098**: Ontology single-node datasource search/manual selection과 sample preview dialog
  presentation은 catalog/search/probe/confirmation lifecycle에서 분리되어야 한다. UI는 controlled
  datasource/schema/ObjectType/table/search/result/sample 상태를 입력받아 tab/field/selection,
  search/retry/preview/confirm/close intent만 반환하고 API·abort·retry target mutation을 소유하지
  않아야 한다. main/sample nested focus ownership, pending close 차단, failure와 empty 구분,
  actual ObjectType execution datasource, exact confirm retry와 390×844 containment를 유지해야 한다.

- **FR-099**: MultiLayer Ontology의 library/header, document-generation shell/form/progress/outcome,
  operation notices는 canvas controller와 분리된 이름 있는 UI 책임이어야 한다. 각 UI는 controlled
  state와 명시적 intent만 교환하고 API client, abort controller, Cytoscape mutation을 소유하지
  않아야 한다. library rename focus와 delete modal lifecycle, PDF input, glossary retry, generation
  terminal/error/log disclosure, save/partial-warning 표시는 기존 결과를 유지해야 한다. Behavior read,
  Measure→ObjectType creation과 ontology persistence의 target/retry/response validation은 각각 workflow
  composable이 소유하며 Viewer는 backend API를 직접 import하지 않아야 한다.

## Success Criteria

- **SC-001**: 서비스별 HTTP base/path 정의가 해당 domain API 경계 외부에서 0건이다.
- **SC-002**: 보호 중인 Analyzer graph WIP의 기존 `src/features/code-analysis` 경계를 제외한 옛
  `src/features/` 책임과 import가 0건이다. 해당 예외는 057/059 병합 뒤 별도 이동한다.
- **SC-003**: `shared`에서 domain/workflow import가 0건이다.
- **SC-004**: Vue UI 내부 raw fetch가 0건이다.
- **SC-005**: `npm run type-check`와 `npm run build`가 오류 없이 통과한다.
- **SC-006**: standalone과 Architect embedded의 feature id, mount contract, project/session headers,
  lazy entry와 toolbar ownership이 정적·빌드 계약에서 보존된다. 실제 host/backend 통합 E2E는 별도
  통합 단계에서 수행한다.
- **SC-007**: 사용자에게 노출되는 기존 feature registry 항목과 embedded 4개 항목이 모두 보존된다.

## Assumptions

- 백엔드 서비스 코드는 이번 spec에서 변경하지 않는다.
- 백엔드 실서버·실데이터 정상/장애/E2E는 이번 frontend refactor 완료 조건이 아니다. backend 원문의
  route/method/header/request/response/error/event 계약을 프론트 타입·parser·호출과 정적으로 대조한다.
- API 계약 불일치는 프론트에서 추측성 fallback으로 숨기지 않고 별도 evidence 문서에 기록한다.
- 메뉴의 피지컬·도메인·다이나믹·기준관리 그룹은 사용자 정보구조이며 코드 소유 그룹과 별개다.
