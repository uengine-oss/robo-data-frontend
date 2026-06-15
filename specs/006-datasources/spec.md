# Feature Specification: Datasources

**Feature Branch**: `006-datasources`

**Created**: 2026-06-15

**Status**: Backfilled (reverse-engineered)

**Input**: Existing code reverse-engineered from `src/features/datasources/` (datasources.ts Pinia 스토어, components/DataSourceManager.vue, components/DataSourcesTab.vue, index.ts). 탭 등록은 `src/shared/config/features.ts` (id=`datasources`, label="데이터 소스", group=`physical`).

## User Scenarios & Testing *(mandatory)*

데이터 소스(외부 DB·API·SaaS 등)를 플랫폼에 등록·관리하는 UI. "데이터 소스" 탭으로 진입하며, MindsDB가 지원하는 70여 종 커넥터 유형을 카테고리별로 제공한다. 등록된 연결은 카탈로그(Neo4j)에 저장되고, 관계형 DB는 스키마/테이블/컬럼 메타데이터를 추출하여 후속 분석에 사용한다.

### User Story 1 - 데이터 소스 등록 및 메타데이터 추출 (Priority: P1)

사용자가 "새 연결 추가" → 유형 선택(검색·카테고리 그룹) → 연결 폼 작성(이름·host·port·user·password 등 유형별 동적 필드) → (선택) 연결 테스트 → "연결 생성"을 한다. PostgreSQL/MySQL/MariaDB 등 지원 엔진이면 등록 직후 자동으로 스키마·테이블·컬럼 메타데이터를 추출한다.

**Why this priority**: 데이터 소스 등록이 없으면 Text2SQL·스키마 관리·온톨로지 등 모든 하위 기능이 동작할 데이터가 없다. 이 기능의 존재 이유.

**Independent Test**: 탭 진입 → PostgreSQL 선택 → 유효 접속정보 입력 → 연결 생성 → 카드 목록에 새 항목과 스키마 배지가 표시되면 성공.

**Acceptance Scenarios**:

1. **Given** "데이터 소스" 탭, **When** 유형을 선택하고 필수 필드를 채워 "연결 생성", **Then** 카탈로그에 등록되고(`POST /api/datasources`) 카드 목록에 추가된다.
2. **Given** 등록 폼에서 자동 추출 옵션이 켜진 지원 엔진, **When** 연결 생성 성공, **Then** 동기 메타데이터 추출이 실행되고 "N개 스키마, M개 테이블 추출 완료" 메시지가 표시된다.
3. **Given** 폼 작성 중, **When** "연결 테스트", **Then** 입력 파라미터로 직접 연결 검증(`POST /api/datasources/test-connection)`하여 성공/실패 메시지를 보여준다.

---

### User Story 2 - 데이터 소스 목록 조회·헬스·삭제·재추출 (Priority: P2)

사용자가 등록된 데이터 소스를 카드 그리드로 조회하고, 각 카드의 헬스 인디케이터로 연결 상태를 확인하며, 불필요한 소스를 삭제하거나 기존 소스의 메타데이터를 (비밀번호 재입력·스키마 필터와 함께) 재추출한다. 카드 클릭 시 스키마→테이블 계층을 드릴다운한다.

**Why this priority**: 등록 후 운영(상태 점검·정리·갱신)에 필요하지만 등록(P1)이 선행되어야 가치가 발생.

**Independent Test**: 소스가 1개 이상 존재하는 상태에서 탭 진입 → 헬스 점검 자동 실행, 카드 클릭 시 스키마 목록 표시, 삭제 시 목록에서 제거되면 성공.

**Acceptance Scenarios**:

1. **Given** 탭 마운트, **When** 목록 로드 완료, **Then** 모든 소스의 헬스 체크를 병렬 실행(`GET /api/datasources/{name}/health`)하여 카드에 ✓/!/✕/? 인디케이터를 표시한다.
2. **Given** 소스 카드, **When** 삭제 확인, **Then** 카탈로그에서 제거(`DELETE /api/datasources/{name}`)하고 목록에서 사라진다.
3. **Given** 추출 모달, **When** 비밀번호·스키마 필터 입력 후 "추출 시작", **Then** SSE 스트림(`POST /api/datasources/{name}/extract-metadata`)으로 진행률(스키마/테이블 카운트, %)을 실시간 표시한다.

---

### Edge Cases

- 유형 목록 API(`/api/datasources/types`) 실패 시 → 코드 내장 전체 유형 목록(`getAllDataSourceTypes`)으로 폴백.
- 지원 엔진 목록 API 실패 시 → `['postgres','postgresql','mysql','mariadb']` 기본값 폴백.
- 저장된 비밀번호로 추출 실패 시 → 추출 모달에서 비밀번호 재입력(입력 시 Neo4j에도 갱신).
- SSE 이벤트 `phase === 'error'` 또는 파싱 실패 → 진행을 중단하고 에러 메시지 표시.
- 등록된 소스가 0개 → 빈 상태(empty state) 안내와 "첫 번째 데이터 소스 추가" 버튼 표시.
- 비지원 엔진(예: kafka, s3) → 메타데이터 추출/자동추출 버튼 미노출(`canExtract` false).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 시스템은 카테고리(database/nosql/datawarehouse/api/saas/file/streaming/analytics/vector/other)별로 그룹화된 데이터 소스 유형 목록을 제공하고, 유형 검색(이름·type·설명)을 지원해야 한다.
- **FR-002**: 시스템은 선택한 유형의 동적 필드(text/number/password/select, required/default/placeholder)에 따라 연결 폼을 렌더링해야 한다.
- **FR-003**: 사용자는 연결 이름과 파라미터로 새 데이터 소스를 등록할 수 있어야 한다(`POST /api/datasources?register_to=both`).
- **FR-004**: 시스템은 입력 파라미터 기반 사전 연결 테스트를 제공해야 한다(`POST /api/datasources/test-connection`).
- **FR-005**: 시스템은 등록된 데이터 소스 목록을 조회하고(`GET /api/datasources?source=neo4j`) 이름 기준 정렬·검색해야 한다.
- **FR-006**: 시스템은 각 데이터 소스의 헬스 상태(healthy/disconnected/partial/checking/unknown)를 조회·표시해야 한다(`GET /api/datasources/{name}/health`).
- **FR-007**: 사용자는 데이터 소스를 삭제할 수 있어야 한다(`DELETE /api/datasources/{name}?delete_from=neo4j`).
- **FR-008**: 시스템은 지원 엔진(postgres/mysql/mariadb 등)에 대해 등록 직후 자동 메타데이터 추출(동기, `extract-metadata-sync`)을 옵션으로 수행해야 한다.
- **FR-009**: 시스템은 SSE 스트리밍 추출(`extract-metadata`)로 진행률(phase·progress·스키마/테이블 처리 카운트)을 실시간 표시해야 한다.
- **FR-010**: 사용자는 데이터 소스를 선택해 스키마 목록(`GET .../schemas`)과 스키마별 테이블 목록(`GET .../tables`)을 드릴다운할 수 있어야 한다.
- **FR-011**: 시스템은 유형/지원엔진 API 실패 시 내장 기본값으로 폴백하여 동작 가능해야 한다.

### Key Entities *(include if feature involves data)*

- **DataSource (연결)**: 등록된 데이터 소스 인스턴스. 속성 `name`, `engine`, `display_name?`, `host?`, `port?`, `database?`, `user?`, `schema_count?`, `tables?`, `created_at?`, `health?`.
- **DataSourceTypeConfig (유형)**: 커넥터 메타 정의. `type`, `display_name`, `icon`, `category`, `description?`, `fields[]`(DataSourceField: name/label/type/required/default/placeholder/options).
- **HealthCheckResult**: `name`, `status`, `message`, `db_connected`, `mindsdb_connected`.
- **DataSourceSchema / DataSourceTable**: 추출된 메타데이터 계층(스키마 name/description/table_count, 테이블 name/schema/column_count).
- **ExtractionProgress**: SSE 진행 상태(phase, message, progress, total/processed schemas·tables, error?).
- **백엔드 엔드포인트 (data-fabric 게이트웨이, base=`/api/gateway/data-fabric`)**:
  - `GET /api/datasources/types`, `GET /api/datasources/supported-engines`
  - `GET /api/datasources?source=`, `GET /api/datasources/{name}?source=`
  - `POST /api/datasources?register_to=`, `DELETE /api/datasources/{name}?delete_from=`
  - `GET /api/datasources/{name}/schemas`, `GET /api/datasources/{name}/tables?source=&schema=`
  - `POST /api/datasources/{name}/test?source=`, `POST /api/datasources/test-connection`
  - `GET /api/datasources/{name}/health`
  - `POST /api/datasources/{name}/extract-metadata` (SSE), `POST /api/datasources/{name}/extract-metadata-sync`

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 사용자는 유효한 접속정보로 데이터 소스를 1분 내에 등록 완료할 수 있다.
- **SC-002**: 등록된 모든 데이터 소스의 헬스 상태가 탭 진입 후 자동으로 표시된다.
- **SC-003**: 지원 엔진 등록 시 자동 메타데이터 추출 결과(스키마·테이블 수)가 사용자에게 노출된다.
- **SC-004**: 70종 이상의 데이터 소스 유형을 카테고리/검색으로 탐색할 수 있다.
- **SC-005**: 외부 유형/엔진 API가 실패해도 UI는 내장 폴백으로 정상 동작한다.

## Assumptions

- 모든 API는 data-fabric 게이트웨이(`VITE_DATA_FABRIC_URL` 또는 `/api/gateway/data-fabric`)를 통해 호출된다.
- 카탈로그 저장소는 Neo4j이며(`source=neo4j`/`delete_from=neo4j`), 등록은 기본 `register_to=both`(카탈로그+MindsDB).
- 메타데이터 자동/SSE 추출은 관계형 DB(postgres/mysql/mariadb)에 한정된다.
- 이 앱은 메모리 히스토리 SPA로, 라우팅이 아닌 탭 시스템(`session.activeTab`, `features.ts`의 `datasources` 탭)으로 진입한다.
- 비밀번호 등 민감정보는 등록 시 백엔드에 저장되며, 추출 시 필요 시에만 재입력한다.
