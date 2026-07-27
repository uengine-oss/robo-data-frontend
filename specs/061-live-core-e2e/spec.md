# Feature Specification: 핵심 영역 실서비스 E2E

**Feature Branch**: `061-live-core-e2e`

**Created**: 2026-07-27

**Status**: Complete

**Input**: 대규모 프론트 리팩토링 이후 담당 범위인 Catalog, Data Fabric, Analyzer를 실제
gateway/backend와 초기화한 `neo4j` 데이터베이스로 검증하고 기준 화면과 대조한다. DataSource
등록부터 분석 완료까지는 한 번만 연속 실행하고 완료 뒤 탐색은 저장된 체크포인트를 재사용한다.

## User Scenarios & Testing

### User Story 1 - 실제 분석 사슬을 한 번 완주한다 (Priority: P1)

사용자는 빈 그래프에서 DataSource를 등록하고 파일·DDL을 구성한 뒤 실제 ANTLR 파싱과 Analyzer 분석이
완료되는 전 과정을 한 번 연속 실행한다.

**Independent Test**: 1920×1080의 한 browser/context/page에서 DataSource 등록 → 업로드 →
ANTLR 파싱 → Analyzer 분석 완료까지 interception 없이 실행한다.

**Acceptance Scenarios**:

1. **Given** 초기화된 `neo4j`, **When** Data Fabric 화면에서 실제 DataSource를 등록한다,
   **Then** 연결 카드와 backend registry에 같은 값이 존재한다.
2. **Given** 분석 대상 파일을 선택했다, **When** 업로드 전 개별 삭제와 전체 삭제를 수행한다,
   **Then** 목록·카운트·local state가 즉시 일치하고 삭제한 파일은 요청 payload에 포함되지 않는다.
3. **Given** 최종 파일·DDL·DataSource 선택, **When** 업로드를 확정한다,
   **Then** 실제 upload와 ANTLR parse가 성공하고 같은 분석 입력으로 이어진다.
4. **Given** 실제 분석 스트림, **When** 이벤트가 도착한다,
   **Then** phase/progress가 단조 진행하고 console log와 Navigator/graph가 이벤트마다 점진적으로 채워진다.
5. **Given** complete 종단 이벤트, **When** 최종 그래프를 조회한다,
   **Then** UI 객체의 ID·label·properties와 관계 endpoint가 Neo4j 객체와 정합하다.

### User Story 2 - 완료 체크포인트에서 후속 탐색을 재사용한다 (Priority: P1)

분석 완료 후에는 같은 graph fingerprint를 봉인하고 재분석하지 않는다. Catalog, Data Fabric,
Analyzer의 후속 상호작용은 저장된 결과를 각자 독립적으로 검증한다.

**Independent Test**: 완료 직후 node/relationship ID와 핵심 속성으로 fingerprint를 만들고, 후속
   시나리오 전후에 같은지 비교한다.

**Acceptance Scenarios**:

1. **Given** 앞 단계가 성공했다, **When** 뒤 단계에서 오류가 발생한다,
   **Then** 성공한 DataSource·upload·analysis를 반복하지 않고 가장 가까운 유효 체크포인트부터 재개한다.
2. **Given** 분석 fingerprint가 유효하다, **When** 데이터 스키마의 테이블/컬럼/FK/코드 출처를 탐색한다,
   **Then** 실제 성공·빈 결과·오류가 정직하게 표시된다.
3. **Given** 분석 fingerprint가 유효하다, **When** Data Fabric 상태/테이블과 Analyzer
   Navigator/graph/detail을 탐색한다, **Then** 저장된 동일 결과를 사용한다.
4. **Given** 후속 탐색이 종료됐다, **When** fingerprint를 다시 계산한다,
   **Then** 탐색 때문에 분석 데이터가 변경되지 않는다.

### User Story 3 - 회귀와 실패가 숨겨지지 않는다 (Priority: P1)

개발자는 브라우저 오류, 실패한 실제 요청, 잘못된 빈 상태, 리팩토링 경계 위반을 한 번에 확인할 수 있다.

**Independent Test**: 정적 계약·type-check·build와 실제 브라우저의 pageerror, console error,
request failure, HTTP 5xx를 배치로 수집한다.

**Acceptance Scenarios**:

1. **Given** 실제 성공 흐름, **When** 테스트가 끝난다,
   **Then** 예상하지 않은 pageerror, console error, request failure, HTTP 5xx가 0건이다.
2. **Given** 읽기 API에 의도된 503을 interception한다, **When** 재시도를 누른다,
   **Then** 실패를 빈 결과로 가장하지 않고 오류 상세와 회복을 표시한다.
3. **Given** 결함이 여러 개 발견됐다, **When** 수정한다,
   **Then** 공통 원인과 의존 순서로 묶어 근본 수정하고 전체 배치를 다시 검증한다.

## Scope

- 포함: `neo4j` 그래프 초기화, DataSource 등록, 업로드 목록 개별/전체 삭제, 최종 파일·DDL 업로드,
  ANTLR 파싱, Analyzer 실시간 분석, Catalog 스키마/컬럼/FK/코드 출처 조회, Data Fabric 연결/상태/테이블
  조회, Analyzer Navigator/graph/detail 상호작용.
- 제외: Architect 웹/Electron·Proposal·Plan·Code, Text2SQL, Ontology 및 그 밖의 서비스 화면,
  분석 완료 후 재분석, 불필요한 DataSource 재등록.
- 실패 시나리오의 interception은 UI 오류 계약만 검증하며 실제 성공 E2E와 결과를 분리해 기록한다.

## Requirements

- **FR-001** 모든 live 요청은 gateway를 통하고 Neo4j database header 값은 `neo4j`여야 한다.
- **FR-002** 초기화·DataSource 등록·업로드·분석 mutation은 최초 연속 흐름에서 정확히 한 번만 허용한다.
- **FR-003** 완료 fingerprint 뒤에는 후속 탐색에 필요 없는 mutation 또는 재분석 요청을 실패 처리한다.
- **FR-004** 각 영역의 1920×1080 스크린샷, 실제 요청/응답, 콘솔 오류를 증거로 남겨야 한다.
- **FR-005** 새 스크린샷을 060 evidence와 `goal-verify` 기준 화면에 직접 대조해야 한다.
- **FR-006** 테스트가 시작한 프로세스와 브라우저는 성공·실패 모두에서 종료해야 한다.
- **FR-007** 수정은 compatibility shim, 오류 삼키기, 하드코딩 fixture 없이 현재 domain/application/UI
  경계 안에서 수행해야 한다.
- **FR-008** 스트림 원본 이벤트와 UI phase/progress/console/Navigator/graph 상태를 timestamp와 함께
  수집해 각 이벤트가 소비됐음을 대조해야 한다.
- **FR-009** phase/progress는 역행하지 않고 complete에서 100%가 되어야 하며, fatal error 또는
  complete 없는 종료를 성공으로 간주하지 않는다.
- **FR-010** node/relationship 이벤트는 유효한 ID, label/type, endpoint를 가져야 하고 완료 후
  Neo4j의 같은 객체와 핵심 속성이 일치해야 한다.

- **FR-011** 업로드 UI는 대상 언어를 선택하거나 임의 기본값을 만들지 않는다. `/antlr/fileUpload`에는
  저장 위치에 필요한 `targetFolder`만, `/antlr/parsing`에는 경로 모드에 필요한 `project_root`만 전달한다.
  실제 `target`과 `strategy`는 ANTLR `detected` 이벤트를 받은 뒤 Analyzer 요청에만 사용한다.

- **FR-012** 분석 완료 체크포인트의 Analyzer 상호작용은 `goal-verify`의 정방향 기능 의도를 기준으로 하되,
  이후 확정된 제품 명세가 이름이나 기능을 대체·삭제한 경우 최신 명세를 우선하여
  Navigator FILE 추가·더블클릭 확장·함수 상세·캔버스 제거, Overview TABLE+QUERY+관계 선택,
  관계/노드 스타일, READS OFF/ON, 논리명, 모듈간 상호작용, 실제 업무 단위, 위험 노드 상세,
  자연어 의미 검색의 실제 결과 흐름을 포함한다. Architect·Text2SQL·Ontology 항목은 실행하지 않는다.
- **FR-013** Analyzer 그래프의 노드 컨텍스트 메뉴는 포인터 좌표를 그래프 로컬 좌표로 변환하고
  그래프 가시영역 안에 배치되어야 한다. 최초/보기 전환 레이아웃 정착이 끝난 뒤 노드·관계 스타일만
  바꿀 때는 사용자 카메라의 배율과 위치를 자동으로 다시 맞추지 않아야 한다.
- **FR-014** Catalog에서 같은 datasource/schema/table을 컬럼 조회가 끝나기 전에 반복 선택하더라도
  진행 중 추가 작업을 같은 identity로 합쳐 컬럼 요청과 캔버스 노드를 각각 하나만 만들어야 한다.
- **FR-015** Analyzer의 군집 보기는 기존 force 물리, 노드·군집 드래그, 동적 갱신을 유지해야 한다.
  레이아웃이 정착한 뒤 작은 군집 면적의 35% 이상을 침범하는 심한 군집 겹침만 한 번 최소 평행 이동으로
  완화하며, free layout 전환·전체 pin·반복 보정으로 화면이 출렁이게 해서는 안 된다. 보정 전후 겹침,
  자동 맞춤 배율, 정착 후 좌표 안정성을 실제 체크포인트에서 계측해야 한다. 제한 시간 안에 force가
  정착하지 않으면 좌표를 덮어쓰지 않고 `skipped-unstable` 가드레일 상태를 명시해야 한다.
- **FR-016** 데이터 스키마의 컬럼 코드 출처 요청은 `column_name`을 무시해 테이블 전체 출처를
  반환해서는 안 된다. 컬럼 직접 관계가 없는 현재 그래프에서는 READS/WRITES의 증거 줄 주변에서
  정확한 컬럼 토큰이 확인된 출처만 반환하고, 근거가 없으면 정직한 빈 결과를 표시해야 한다.
- **FR-017** 데이터 스키마의 관련 테이블 조회는 Catalog의 `FK_TO_TABLE` 계약과 Analyzer가 생성한
  `FK(from_column, to_column)` 계약을 모두 읽고, UI에는 동일한 DDL FK 관계로 정규화해야 한다.

## Success Criteria

- 세 담당 영역의 live read 시나리오가 통과한다.
- 관련 정적 계약, type-check, production build가 통과한다.
- 예상하지 않은 브라우저/네트워크 오류가 0건이다.
- 초기화 직후 0건, 분석 완료 후 기대 그래프 생성, 후속 탐색 전후 fingerprint 동일성이 확인된다.
- 기준 화면과의 기능적·구조적 차이가 설명되거나 수정된다.
