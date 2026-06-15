# Feature Specification: Glossary

**Feature Branch**: `004-glossary`

**Created**: 2026-06-15

**Status**: Backfilled (reverse-engineered)

**Input**: Existing code under `src/features/glossary/` (Vue 3 / Vite SPA). 비즈니스 용어집(business glossary)을 관리하는 UI — 용어집·용어 CRUD, 메타데이터(도메인/소유자/검토자/태그), 그리고 파일 기반 AI 용어 일괄 업로드. `GlossaryTab` 탭으로 노출되며 호스트(robo-architect)에 마이크로프론트엔드로 임베드된다.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 용어집·용어 CRUD 및 메타데이터 확인 (Priority: P1)

데이터 관리자가 `용어 관리` 탭을 연다. 좌측 사이드바에서 용어집(Business/Technical/DataQuality)을 만들거나 선택하고, 가운데 테이블에서 해당 용어집의 용어를 추가·수정·삭제한다. 용어 행을 클릭하면 우측 패널에 그 용어의 도메인/소유자/검토자/태그가 표시된다.

**Why this priority**: 용어집과 용어의 기본 관리가 이 기능의 핵심 가치이며, 이것만으로도 독립적인 MVP가 성립한다.

**Independent Test**: 용어집을 하나 생성하고 → 용어를 하나 추가하고 → 행을 선택해 우측 메타데이터 패널을 확인한 뒤 → 용어와 용어집을 삭제하는 흐름으로 단독 검증 가능.

**Acceptance Scenarios**:

1. **Given** 용어집이 하나도 없는 빈 상태, **When** 사용자가 "첫 용어집 만들기"로 이름·유형을 입력해 저장, **Then** 새 용어집이 목록에 추가되고 자동 선택된다.
2. **Given** 용어집이 선택된 상태, **When** "사용자 지정"(새 용어 추가)으로 이름과 상태를 입력해 저장, **Then** 용어 테이블에 행이 추가되고 사이드바의 termCount가 갱신된다.
3. **Given** 용어 행이 선택된 상태, **When** 우측 패널을 보면, **Then** 해당 용어의 도메인·소유자·검토자·태그가 pill 형태로 표시된다.

---

### User Story 2 - 검색·상태 필터링 (Priority: P2)

용어 수가 많을 때 사용자가 검색어를 입력하거나 상태(초안/검토중/승인됨/폐기됨) 드롭다운으로 목록을 좁힌다.

**Why this priority**: 대량 용어 환경에서의 실사용 편의를 높이지만, CRUD 없이는 의미가 없으므로 P2.

**Independent Test**: 여러 용어가 있는 용어집에서 검색어/상태 필터를 적용해 테이블이 클라이언트 측에서 즉시 좁혀지는지 확인.

**Acceptance Scenarios**:

1. **Given** 여러 용어가 있는 용어집, **When** 검색창에 일부 문자열 입력, **Then** 이름·설명에 그 문자열을 포함하는 용어만 표시된다.
2. **Given** 상태가 섞인 용어 목록, **When** 상태 드롭다운에서 "승인됨" 선택, **Then** 승인된 용어만 남는다.

---

### User Story 3 - 파일 기반 AI 용어 일괄 업로드 (Priority: P3)

사용자가 "일괄 업로드"로 CSV/스프레드시트 파일을 올리면, 백엔드가 파일을 분석(역할·조인 규칙 추론)하고 컬럼 매핑을 제안한다. 사용자가 매핑을 확정하면 용어 후보를 추출(선택적으로 AI 보강, SSE 진행률)하고, 미리보기에서 편집·선별 후 가져오기를 실행한다. 잘못 가져온 경우 batch 단위로 롤백한다.

**Why this priority**: 대량 도입을 가속하는 고급 기능으로 가치가 크지만, 수동 CRUD가 전제이며 가장 복잡하므로 P3.

**Independent Test**: 샘플 파일을 업로드 → 매핑 확정 → 추출 → 일부 행 선택 가져오기 → 롤백까지 3단계 마법사로 단독 검증.

**Acceptance Scenarios**:

1. **Given** 업로드된 파일들, **When** 분석이 끝나면, **Then** 감지된 컬럼 매핑·조인 규칙·미매핑 컬럼이 표시되고 사용자가 확정할 수 있다.
2. **Given** 매핑 확정 후 추출 완료, **When** 미리보기에서 행을 선택해 "가져오기" 실행, **Then** 생성/건너뜀/오류 수와 batch_id가 반환된다.
3. **Given** 방금 가져온 batch, **When** 롤백 실행, **Then** 해당 batch의 용어가 삭제된다.

---

### Edge Cases

- 용어집이 없을 때: 사이드바와 본문에 빈 상태 + "첫 용어집 만들기" CTA를 표시한다.
- 용어집 선택 없이 메타데이터 편집 시도: "먼저 용어를 선택해주세요" 안내를 표시한다.
- 용어집/용어 삭제는 confirm 다이얼로그로 재확인하며, 용어집 삭제 시 포함 용어가 함께 삭제됨을 경고한다.
- 비동기 경합: 용어집/용어를 빠르게 바꿀 때, 응답 도착 시 현재 선택 ID와 비교해 이전 요청 결과를 버린다(stale 응답 무시).
- API 오류는 우측 하단 error-toast로 노출되며 닫기 버튼으로 해제한다.
- 일괄 업로드: term_source 파일이 없으면(`no_term_source`) 안내, 추출 중 AbortController로 취소 가능, 미매핑 컬럼은 가져오기 후 reminder로 남는다.
- 백엔드 응답 형태가 불완전해도 정규화 함수(normalizeTerm 등)가 누락 필드를 안전한 기본값으로 채운다.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST 용어집 목록을 조회해 사이드바에 표시하고, 항목이 있으면 첫 용어집을 자동 선택해야 한다.
- **FR-002**: Users MUST be able to 용어집을 생성·수정·삭제할 수 있어야 한다(이름, 설명, 유형 Business/Technical/DataQuality).
- **FR-003**: System MUST 선택된 용어집의 용어 목록을 조회·표시하고, 용어 수(termCount)를 갱신해야 한다.
- **FR-004**: Users MUST be able to 용어를 생성·수정·삭제할 수 있어야 하며, 이름·설명·상태·동의어·도메인·소유자·검토자·태그를 편집할 수 있어야 한다.
- **FR-005**: System MUST 용어 상태를 Draft/Pending/Approved/Deprecated 네 가지로 관리하고, 상태별 배지·한글 라벨(초안/검토중/승인됨/폐기됨)을 표시해야 한다.
- **FR-006**: Users MUST be able to 검색어(이름·설명 대상)와 상태로 용어 목록을 클라이언트 측 필터링할 수 있어야 한다.
- **FR-007**: System MUST 용어 행 선택 시 상세를 재조회하고 우측 패널에 도메인/소유자/검토자/태그를 표시해야 한다.
- **FR-008**: System MUST 메타데이터 마스터(도메인·소유자·태그)를 조회·생성할 수 있어야 한다(용어 편집 모달의 선택지로 사용).
- **FR-009**: Users MUST be able to 파일을 일괄 업로드해 백엔드 분석 결과(역할·조인·컬럼 매핑)를 확인하고 매핑을 확정할 수 있어야 한다.
- **FR-010**: System MUST 확정된 매핑으로 용어 후보를 추출하되, 선택적 AI 보강과 SSE 스트리밍 진행률을 지원하고 취소가 가능해야 한다.
- **FR-011**: Users MUST be able to 추출된 후보를 미리보기에서 편집·선별 후 가져오기(import)하고, batch 단위로 롤백할 수 있어야 한다.
- **FR-012**: System MUST 모든 백엔드 요청에 세션 헤더(`sessionStore.getHeaders()`)를 첨부하고, 비-OK 응답을 공유 `handleHttpError`로 처리해야 한다.
- **FR-013**: System MUST 동일 기능군 내 영업일 캘린더(BusinessDayCalendar) 탭을 함께 제공해 연도별 영업일/휴일/주말 제외 설정을 관리할 수 있어야 한다.

### Key Entities *(include if feature involves data)*

- **Glossary(용어집)**: id, name, description, type(Business/Technical/DataQuality), termCount. 용어의 컨테이너.
- **Term(용어)**: id, name, description, status, synonyms[], owners[], reviewers[], domains[], tags[], relatedTerms[], 소속 glossaryId/Name. 정의(description)와 메타데이터를 가지는 핵심 엔티티.
- **GlossaryDomain / GlossaryOwner / GlossaryTag**: 용어에 부여되는 메타데이터 마스터(도메인 분류, 소유자/검토자, 색상 태그).
- **Bulk 세션 산출물**: BulkUploadResponse(파일 분석·조인·session_id), BulkConfirmedMapping, BulkTermCandidate, BulkImportResponse(batch_id·created/skipped/errors).
- **BusinessDay / 캘린더 설정**: 연도별 영업일/휴일/주말 제외 설정.

호출 백엔드 엔드포인트(베이스 `ROBO_BASE_URL = {API_GATEWAY}/robo`):
- `GET/POST /robo/glossary/`, `GET/PUT/DELETE /robo/glossary/{glossaryId}`
- `GET/POST /robo/glossary/{glossaryId}/terms`, `GET/PUT/DELETE /robo/glossary/{glossaryId}/terms/{termId}`
- `POST /robo/glossary/{glossaryId}/terms/bulk-upload`, `.../bulk-extract`, `.../bulk-extract/stream`(SSE), `.../bulk-import`, `DELETE .../bulk-rollback/{batchId}`
- `GET/POST /robo/glossary/meta/domains`, `/robo/glossary/meta/owners`, `/robo/glossary/meta/tags`
- `GET /robo/business-calendar/{year}`, `POST /robo/business-calendar/`, `GET /robo/business-calendar/check/{date}`, `DELETE /robo/business-calendar/{year}`, `GET /robo/business-calendar/non-business-dates`

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 사용자가 빈 상태에서 용어집을 만들고 첫 용어를 추가하기까지 1분 이내에 완료할 수 있다.
- **SC-002**: 용어 행 선택 시 우측 메타데이터 패널이 1회 상세 재조회로 즉시 채워진다(stale 응답은 표시되지 않는다).
- **SC-003**: 검색·상태 필터는 추가 네트워크 요청 없이 클라이언트 측에서 즉시 반영된다.
- **SC-004**: 일괄 업로드 마법사가 업로드→매핑확정→추출→가져오기 3단계를 끝까지 완주할 수 있고, 잘못 가져온 batch를 롤백으로 100% 되돌릴 수 있다.

## Assumptions

- 인증/테넌트 컨텍스트는 기존 세션 스토어(`useSessionStore().getHeaders()`)로 제공되며, 이 기능은 이를 재사용한다.
- 라우팅은 메모리 히스토리 단일 라우트(`/`)이며, 탭 노출은 `features.ts`의 `glossary`/`business-calendar` 항목으로 동적 등록된다(URL 네비게이션 미사용).
- 백엔드 `/robo/glossary/*`·`/robo/business-calendar/*` API는 API Gateway 뒤에 존재하며 가용하다고 가정한다.
- 검색·상태 필터는 클라이언트 측 처리이며, 서버 측 `status`/`search` 쿼리 파라미터는 정의돼 있으나 현재 UI는 전체 조회 후 클라이언트 필터링을 사용한다.
- 단일 호스트(robo-architect)에 마이크로프론트엔드로 임베드되는 환경을 우선 가정한다.
