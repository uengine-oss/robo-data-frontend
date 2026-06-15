# Feature Specification: Security

**Feature Branch**: `011-security`

**Created**: 2026-06-15

**Status**: Backfilled (reverse-engineered)

**Input**: Existing feature reverse-engineered from `src/features/security/` — "보안관리자(Data Secure Guard)" 탭. RBAC 기반 접근 제어, 사용자/역할/권한 관리, 계층적 테이블 권한, 보안 정책, SQL 감사 로그 UI. API Gateway(`/api/gateway/security/**`)를 통해 백엔드 data-secure-guard(8006)에 연결.

## User Scenarios & Testing *(mandatory)*

이 기능은 라우터 네비게이션이 아니라 `features.ts`의 탭(`security-guard`, 라벨 "보안관리자")으로 진입한다. 진입점 `SecurityGuardTab.vue`는 5개 서브탭(사용자·역할·테이블·정책·감사)을 좌우 전환한다.

### User Story 1 - 사용자 및 역할 관리 (Priority: P1)

관리자가 시스템 사용자를 등록·수정·삭제하고, 각 사용자에게 역할(role)을 부여한다. 또한 역할을 정의하고 역할에 묶인 권한 집합을 관리한다.

**Why this priority**: RBAC의 핵심. 사용자-역할-권한 그래프(Neo4j)가 없으면 나머지 권한/감사 기능이 의미를 갖지 못한다. 이 슬라이스만으로도 "누가 어떤 역할을 갖는가"를 관리하는 독립 MVP가 된다.

**Independent Test**: "사용자 관리" 탭에서 사용자를 추가하고 역할을 토글한 뒤 저장 → 목록 갱신을 확인. "역할 관리" 탭에서 역할을 생성하고 권한을 체크 → 카드에 권한 개수 반영 확인.

**Acceptance Scenarios**:

1. **Given** 사용자 관리 탭, **When** "사용자 추가"로 이메일·사용자명·비밀번호·역할을 입력하고 생성, **Then** `POST /security/users` 호출 후 목록이 새로고침되어 신규 사용자가 표시된다.
2. **Given** 기존 사용자, **When** 수정 다이얼로그에서 역할/상태를 바꾸고 저장, **Then** `PATCH /security/users/{uid}`가 호출된다(이메일은 수정 불가).
3. **Given** 역할 관리 탭, **When** 역할명·우선순위·권한을 지정해 생성, **Then** `POST /security/roles` 호출 후 카드가 추가된다. 시스템 역할(`is_system`)은 삭제 버튼이 비활성화된다.

---

### User Story 2 - SQL 감사 로그 조회 (Priority: P2)

보안 담당자가 Secure Guard를 통과한 모든 SQL 쿼리의 처리 결과(허용/거부/변경됨)를 시간순으로 조회하고, 원본/변환 SQL과 세부 사유를 확인한다.

**Why this priority**: 사후 감사·규정 준수의 핵심이며, 사용자/역할 관리와 독립적으로 동작한다. 읽기 전용이라 위험이 낮다.

**Independent Test**: "감사 로그" 탭에서 상태 필터를 "거부"로 바꾸면 `GET /security/audit-logs?status=denied&limit=200`이 호출되고, 행 클릭 시 원본/변환 SQL 상세 모달이 열린다.

**Acceptance Scenarios**:

1. **Given** 감사 로그 탭, **When** 상태 필터/검색어를 변경, **Then** denied/allowed/rewritten 로그가 필터되어 표시된다(검색은 클라이언트 측 필터).
2. **Given** rewritten 상태 로그, **When** 상세 보기, **Then** 원본 SQL과 변환된 SQL이 나란히 표시된다.

---

### User Story 3 - 계층적 테이블 권한 및 보안 정책 (Priority: P3)

관리자가 데이터소스 > 스키마 > 테이블 3단계 계층 트리에서 노드를 선택해 역할/사용자별 접근 수준(none/read/write/admin)을 설정한다. 상위 권한은 하위로 캐스케이드(상속)되고 하위 설정이 상위를 오버라이드한다. 별도로 SQL에 적용되는 보안 정책(행 제한·PII 마스킹·속도 제한 등)을 확인·편집한다.

**Why this priority**: 세밀한 접근 제어 UI지만, 현재 구현이 부분적(상당 부분 mock 데이터, 미저장)이라 우선순위가 낮다.

**Independent Test**: "테이블 권한" 탭에서 스키마 트리 노드를 선택하고 권한을 추가하면 직접 규칙으로, 하위 노드에서는 "상속됨"으로 표시된다.

**Acceptance Scenarios**:

1. **Given** 테이블 권한 트리, **When** 데이터소스 노드에 analyst=read 추가, **Then** 하위 스키마/테이블에 "상속됨(← 경로)"으로 나타난다.
2. **Given** 보안 정책 탭, **When** 정책의 활성 토글을 끄거나 규칙 JSON을 편집, **Then** 카드 상태가 즉시 갱신된다.

---

### Edge Cases

- 백엔드 미기동 시: GET 계열 API가 `!response.ok`이면 빈 배열을 반환하고 콘솔 에러 기록 → UI는 빈 상태 또는 "백엔드 서버 실행 확인" 에러 메시지를 표시한다.
- 생성/수정/삭제 실패 시: `throw new Error` → 컴포넌트가 `alert()`로 사용자에게 통지한다.
- 시스템 역할 삭제 시도: 클라이언트에서 차단하고 안내한다.
- 역할 "수정": API 미지원으로 "아직 구현되지 않았습니다" alert만 표시(현재 한계).
- 테이블 권한/보안 정책 변경: 현재 클라이언트 reactive 상태에만 반영되고 일부는 mock 데이터라 새로고침 시 소실될 수 있다.
- 빈 데이터소스: 트리에 "데이터소스가 없습니다 — 스키마 관리에서 테이블을 로드하세요" 안내.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST 사용자 목록을 조회·생성·수정·삭제하고(역할 배정 포함) 변경 후 목록을 새로고침한다.
- **FR-002**: System MUST 역할을 조회·생성·삭제하고, 자원유형별로 그룹핑된 권한(action:resource_type)을 역할에 부여한다.
- **FR-003**: System MUST 시스템 역할(`is_system`)의 삭제를 방지한다.
- **FR-004**: System MUST 권한 카탈로그를 조회해 역할 편집 UI에 표시한다.
- **FR-005**: System MUST SQL 감사 로그를 상태/사용자/limit으로 필터해 조회하고, 원본·변환 SQL·세션·실행시간 상세를 표시한다.
- **FR-006**: System MUST 데이터소스>스키마>테이블 계층 트리를 스키마 캔버스 스토어(`useSchemaCanvasStore`)로부터 구성한다.
- **FR-007**: System MUST 계층 권한의 캐스케이드(상속)와 하위 오버라이드를 계산해 직접/상속 규칙을 구분 표시한다.
- **FR-008**: System MUST 보안 정책(쿼리 제한·컬럼 마스킹·컬럼 필터·쿼리 변환·속도 제한)을 우선순위·활성여부와 함께 표시하고 규칙 JSON을 편집한다.
- **FR-009**: System MUST 모든 보안 API 호출을 API Gateway 단일 진입점(`API_GATEWAY_URL` = `/api/gateway`, 즉 `/api/gateway/security/**`)을 통해 라우팅한다.
- **FR-010**: System MUST 백엔드 미응답 시 GET 계열은 빈 배열로 graceful 처리하고, 변경 계열 실패는 사용자에게 통지한다.

*불명확/한계 표기:*

- **FR-011**: 역할 수정은 [현재 미구현 — alert만 표시]. 백엔드 PATCH 역할 API 부재.
- **FR-012**: 테이블 권한 저장은 [security-api.ts에 `saveAccessRule`/`getAccessRules`/`getEffectiveAccess`/`deleteAccessRule` 함수가 존재하나 TablePermissions.vue는 이를 호출하지 않고 로컬 reactive + mock으로 동작]. 영속화 미연결.
- **FR-013**: 보안 정책은 [전부 mock 데이터, 백엔드 엔드포인트 미연결].

### Key Entities *(include if feature involves data)*

- **User**: 시스템 사용자. `uid, email, username, status(active/inactive), roles[], created_at, last_login_at`. Neo4j User 노드. 엔드포인트 `/security/users`.
- **Role**: 권한 묶음. `name, description, priority, is_system, permissions[]`. 우선순위 높을수록 먼저 적용. 엔드포인트 `/security/roles`.
- **Permission**: 단위 권한. `action, resource_type(table/schema/model/admin), description`. 키 형식 `action:resource_type`. 엔드포인트 `/security/permissions`.
- **AuditLog**: SQL 처리 감사 기록. `log_id, user_email, session_id, original_sql, rewritten_sql?, status(allowed/denied/rewritten), timestamp, execution_time_ms?, details?`. 백엔드 파일시스템(JSONL) 저장. 엔드포인트 `/security/audit-logs`.
- **AccessRule / EffectiveAccess**: 경로(datasource/schema/table)별 대상(user|role)에 대한 접근 수준(none/read/write/admin/inherited)과 상속 출처. 엔드포인트 `/security/access-rules`, `/security/effective-access`(현재 UI 미연결).
- **Table**: 권한 부여 대상 테이블 메타. `name, schema, db, description?, column_count`. 엔드포인트 `/security/tables`(security-api 정의, UI는 스키마 스토어 사용).
- **SecurityPolicy**: SQL 적용 정책. `name, policy_type, description, rules_json, priority, is_active`(현재 mock).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 관리자가 신규 사용자 등록(이메일·역할 포함)을 한 화면 내에서 1분 이내에 완료할 수 있다.
- **SC-002**: 사용자/역할 목록이 진입 시 단일 로드(`Promise.all`)로 표시되어 두 데이터 소스를 한 번에 조회한다.
- **SC-003**: 감사 로그 화면에서 상태 필터 변경 시 서버 측 필터로 최대 200건이 조회되어 표시된다.
- **SC-004**: 백엔드 미기동 등 오류 상황에서도 화면이 크래시 없이 빈 상태/에러 메시지를 표시한다.

## Assumptions

- 백엔드 data-secure-guard(8006)가 API Gateway 경유로 `/api/gateway/security/**`를 제공한다고 가정한다(게이트웨이 rewrite → 8006/api/security/**).
- 사용자·역할·권한·테이블 데이터의 원천은 Neo4j이고 감사 로그는 파일시스템(JSONL)이라고 가정한다.
- 이 기능은 호스트(robo-architect)에 임베드되어 메모리 히스토리로 동작하며 별도 URL 라우트를 갖지 않는다(탭=`session.activeTab`, `features.ts` id `security-guard`).
- 인증/세션 자체는 이 프런트엔드의 책임 밖이며(별도 시스템) 본 기능은 RBAC 관리·감사 UI에 한정한다.
- 테이블 권한·보안 정책의 영속화는 향후 작업으로, 현재는 부분 구현/mock 상태임을 전제한다.
