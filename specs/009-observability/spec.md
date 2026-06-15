# Feature Specification: Observability

**Feature Branch**: `009-observability`

**Created**: 2026-06-15

**Status**: Backfilled (reverse-engineered)

**Input**: Existing implementation: `src/features/observability/` (14 files) — 데이터 품질·사고·알림·이벤트 감지·감시 에이전트를 한데 묶은 관측(Observability) UI. SPA 단일 라우트(`/` → `HomeView`) 안에서 `session.activeTab` 으로 전환되는 5개 동적 탭(`features.ts`)으로 구성됨.

## User Scenarios & Testing *(mandatory)*

이 기능은 단일 라우트 SPA 안에서 사이드내비(`SideNav`)의 동적 탭으로 노출된다. 탭 ID: `data-quality`, `incident-manager`, `alerts`, `event-detection`, `watch-agent`. 운영자가 분석 데이터의 품질·이상 상황을 감시하고, 조건 충족 시 알림 또는 후속 프로세스를 자동 실행하는 것이 목적이다.

### User Story 1 - 자연어로 이벤트 감지 규칙 등록 (Priority: P1)

운영자가 채팅창에 "수위가 3m 이상이면 알려줘" 처럼 자연어로 상황을 설명하면, AI가 감지 조건·간격·조치(알림/프로세스)를 추출해 카드로 보여주고, 확정 시 백엔드에 이벤트 규칙으로 등록한다. 등록 규칙은 사이드바 목록에서 토글/삭제할 수 있다.

**Why this priority**: 이 기능의 핵심 가치(실시간 감시 + 자동 조치)를 가장 직접적으로 제공하며, 유일하게 완전한 백엔드 CRUD 가 붙어 있다.

**Independent Test**: `event-detection` 탭에서 예시 문장을 입력 → 설정 카드 확인 → "이대로 등록" → 사이드바 목록에 활성 규칙이 나타나는 것으로 검증 가능.

**Acceptance Scenarios**:

1. **Given** 이벤트 감지 탭, **When** 자연어 조건을 입력하고 전송, **Then** AI 응답과 추출된 조건/간격/조치 카드 및 "이대로 등록" 버튼이 표시된다.
2. **Given** 추출된 설정, **When** "시뮬레이션" 클릭, **Then** 가짜 타임스탬프로 조건을 실행해 트리거 여부(생성 이벤트 수·알람 수)를 보여준다.
3. **Given** 등록된 규칙, **When** 사이드바에서 토글/삭제, **Then** 규칙의 활성 상태가 바뀌거나 목록에서 제거된다.

---

### User Story 2 - 감시 에이전트 워크플로우 편집 (Priority: P2)

운영자가 Vue Flow 캔버스에서 데이터(SQL/What-If) → 조건(임계값/추세) → 조치(프로세스 실행/알람/로그) 노드를 연결해 감시 파이프라인을 구성하고, 테스트 실행하거나 ProcessGPT 프로세스를 스트리밍 실행한다.

**Why this priority**: 단순 조건-알림을 넘어 다단계 파이프라인을 시각적으로 설계하는 고급 경로. 백엔드(agent-scheduler)와 연동되나 P1 보다 복잡도가 높다.

**Independent Test**: `watch-agent` 탭에서 노드를 추가·연결하고 저장 → 프로필/파이프라인 목록에 나타나고 "테스트" 실행 결과가 하단 패널에 출력되는 것으로 검증.

**Acceptance Scenarios**:

1. **Given** 빈 캔버스, **When** SQL·조건·조치 노드를 추가하고 연결 후 저장, **Then** 파이프라인이 백엔드에 생성되고 좌측 목록에 표시된다.
2. **Given** 저장된 프로필, **When** "테스트" 실행, **Then** 단계별 실행 로그(상태·소요시간)가 하단 결과 패널에 표시된다.

---

### User Story 3 - 데이터 품질·사고·알림 현황 모니터링 (Priority: P3)

운영자가 데이터 품질 탭에서 테스트 케이스 성공/실패율·정상 자산·커버리지를 도넛 차트와 표로 확인하고, 사고 관리자에서 실패로 발생한 사고를 상태(New/Acknowledged/Resolved/Muted)별로 추적하며, 알림 탭에서 소스·트리거·목적지(Slack/Email) 단위 알림 규칙을 관리한다.

**Why this priority**: 대시보드 가시성 가치는 높으나, 현재 구현은 정적 더미 데이터로 채워진 화면(백엔드 미연동)이라 MVP 우선순위가 낮다.

**Independent Test**: 각 탭 진입 시 통계 카드·표·필터(상태/유형/담당자)가 렌더되고 검색·필터 상호작용이 동작하는 것으로 검증.

**Acceptance Scenarios**:

1. **Given** 데이터 품질 탭, **When** 상태 필터를 "Failed" 로 변경, **Then** 실패 테스트 케이스만 표에 남고 도넛 차트 통계가 표시된다.
2. **Given** 사고 관리자 탭, **When** 현황 필터/담당자 필터 적용, **Then** 조건에 맞는 사고만 목록에 남는다.
3. **Given** 알림 탭, **When** "알림 추가" → 폼 작성 → 저장, **Then** 알림 목록 보기로 돌아간다(현재는 로컬 상태만 갱신).

### Edge Cases

- 이벤트 감지 `chat` API 호출이 실패하면 → 로컬 정규식 추출(`extractEventInfo`) 폴백으로 조건/간격/조치를 추정해 응답한다.
- 등록 규칙이 0건이면 → 사이드바에 빈 상태("등록된 이벤트가 없습니다") 안내를 표시한다.
- 시뮬레이션 시 조건 미설정이면 → "먼저 감지 조건을 설정해주세요" 시스템 메시지를 표시한다.
- 데이터 품질/사고/알림 탭은 백엔드 미연동이라 새로고침해도 항상 동일한 더미 데이터가 보인다(실 데이터 반영 안 됨).
- 알람 SSE 스트림은 전역 `AlarmToast` 가 구독하며, 연결 끊김 시 `heartbeat`/재연결 동작에 의존한다.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 시스템은 운영자의 자연어 입력을 분석해 이벤트 감지 조건·간격·조치 유형(alert/process)을 추출하고 카드로 미리보기해야 한다.
- **FR-002**: 시스템은 추출된 설정을 이벤트 규칙으로 생성(`POST /text2sql/events/rules`)하고, 목록 조회·토글·삭제·수동 실행을 지원해야 한다.
- **FR-003**: 시스템은 등록 전 규칙을 가짜 데이터로 시뮬레이션(`POST /text2sql/events/simulate`)해 트리거 여부를 보여줘야 한다.
- **FR-004**: 시스템은 AI 대화 API(`POST /text2sql/events/chat`) 실패 시 로컬 추출 폴백으로 동작을 이어가야 한다.
- **FR-005**: 시스템은 감시 에이전트 파이프라인을 데이터/조건/조치 노드의 그래프로 편집·저장(`agent-scheduler`)하고, 노드 위치를 영속화해야 한다.
- **FR-006**: 시스템은 감시 프로필을 테스트 실행하고 ProcessGPT 프로세스를 스트리밍 실행하며, 단계별 실행 로그를 표시해야 한다.
- **FR-007**: 감시 에이전트는 What-If 시나리오(`ontology` whatif-domain-api)를 데이터 소스로 선택할 수 있어야 한다.
- **FR-008**: 시스템은 데이터 품질 탭에서 테스트 케이스 목록·성공/실패/중단 통계·정상 자산·커버리지를 도넛 차트와 표로 표시하고, 표를 검색·상태/유형/태그로 필터링해야 한다.
- **FR-009**: 시스템은 사고 관리자 탭에서 사고를 상태(New/Acknowledged/Resolved/Muted)·담당자·기간으로 필터링해 추적해야 한다.
- **FR-010**: 시스템은 알림 탭에서 소스·트리거·목적지(Slack/Email)를 가진 알림 규칙의 생성·활성화 토글·삭제 UI를 제공해야 한다.
- **FR-011**: 시스템은 알람 SSE 스트림(`/text2sql/events/stream/alarms`)을 전역 토스트로 구독해 실시간 알람을 표시해야 한다.
- **FR-012**: [NEEDS CLARIFICATION] 데이터 품질·사고 관리자·알림 탭은 현재 정적 더미 데이터로 동작한다 — 실제 백엔드 연동 여부/엔드포인트가 미정.

### Key Entities *(include if feature involves data)*

- **EventRule (이벤트 규칙)**: 자연어 조건·SQL·검사 간격(분)·임계값·조치 유형(alert/process)·활성 여부·트리거 횟수. text2sql 백엔드에 영속.
- **EventNotification / EventTemplate**: 발생 알림(확인 여부)과 카테고리별 이벤트 템플릿(권장 조치·진단 질문).
- **AgentProfile / PipelineData**: 감시 에이전트의 SQL·조건·조치 단계와 노드 연결 그래프, ProcessGPT 프로세스 연결, What-If 데이터 소스. agent-scheduler 백엔드에 영속.
- **TestCase / Incident / Alert (더미)**: 데이터 품질 테스트 케이스(상태·실패 사유·테이블·열), 사고(상태·심각도·담당자), 알림 규칙(소스·트리거·목적지) — 현재 컴포넌트 내 정적 데이터.
- **백엔드 엔드포인트 (실연동)**:
  - text2sql (`TEXT2SQL_BASE_URL`): `GET/POST/PUT/DELETE /events/rules[/:id]`, `/events/rules/:id/toggle`, `/events/rules/:id/run`, `GET/POST/DELETE /events/notifications[...]`, `/events/scheduler/{start,stop,status}`, `POST /events/chat`, `POST /events/simulate`, `GET /events/cep/status`, `GET /events/simple-cep/status`, `GET /events/templates[...]`, `POST /events/templates/:id/create-rule`, SSE `GET /events/stream/alarms`.
  - agent-scheduler (`AGENT_SCHEDULER_URL`): `GET/POST/DELETE /pipelines[/:id]`, `/pipelines/:id/{toggle,positions}`, `GET/DELETE /profiles[/:id]`, `/profiles/:id/{toggle,test}`, `POST /profiles/processgpt/execute-stream`, `GET /profiles/processgpt/processes`.
  - ontology (`ONTOLOGY_BASE_URL`): What-If 시나리오 프로필 조회(whatif-domain-api).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 운영자가 자연어 한 문장으로 이벤트 규칙을 등록 완료(입력→확정→목록 반영)하기까지 5단계 이내 상호작용으로 가능하다.
- **SC-002**: 등록된 규칙의 토글·삭제·수동 실행이 즉시 목록에 반영된다(별도 새로고침 불필요).
- **SC-003**: 감시 에이전트 파이프라인 테스트 실행 시 모든 단계의 상태·소요시간이 하단 패널에 누락 없이 표시된다.
- **SC-004**: 알람 발생 시 어느 탭에 있든 전역 토스트로 실시간(SSE) 통지된다.

## Assumptions

- 단독 실행과 robo-architect 임베드 양쪽에서 메모리 히스토리(`createMemoryHistory`) 단일 라우트로 동작하며, 탭 전환은 URL 이 아닌 `session.activeTab` 으로 제어된다.
- 백엔드 베이스 URL 은 API Gateway 경유(`/text2sql`, `/agent-scheduler`, `/ontology`)이며 환경변수(`VITE_TEXT2SQL_API_URL`) 오버라이드를 허용한다.
- CEP 엔진(Esper/SimpleCEP)이 백엔드에 존재해 등록 규칙을 실시간 평가한다고 가정한다.
- 데이터 품질·사고 관리자·알림 탭은 현재 디자인/플로우 검증용 정적 더미이며, 실데이터 연동은 후속 작업으로 본다(out of scope for this backfill).
- 모바일은 사이드바 오버레이 정도만 고려된 보조 대상이다.
