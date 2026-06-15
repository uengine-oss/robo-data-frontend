# Feature Specification: LangChain Agent

**Feature Branch**: `013-langchain-agent`

**Created**: 2026-06-15

**Status**: Backfilled (reverse-engineered)

**Input**: Existing feature reverse-engineered from `src/features/langchain/` — a chat/agent panel that runs a LangChain ReAct Text2SQL agent over the data and streams its reasoning, tool calls, and results into a conversational UI.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 자연어 질문을 SQL 답변으로 받기 (Priority: P1)

사용자는 LangChain 탭의 입력창에 자연어로 질문을 입력하고 전송한다. 에이전트는 ReAct 루프(사고 → 도구 실행 → 관찰)를 돌면서 SQL을 생성·실행하고, 최종 답변을 채팅 형태로 보여준다. 진행 과정(사고 중, 도구 호출, 도구 결과)이 단계별 메시지로 실시간 스트리밍된다.

**Why this priority**: 이 기능의 존재 이유 그 자체. 이것만 있어도 "자연어→SQL 답변" MVP가 성립한다.

**Independent Test**: 질문을 입력해 전송하면 사용자 말풍선이 뜨고, thinking/action/result 메시지가 차례로 나타나며, 마지막에 `final` 답변 블록이 표시되는지로 검증.

**Acceptance Scenarios**:

1. **Given** 빈 채팅 화면, **When** 자연어 질문을 입력하고 Enter(또는 🚀)로 전송, **Then** 사용자 메시지가 추가되고 에이전트가 실행되며 단계별 메시지가 스트리밍된다.
2. **Given** 에이전트 실행 완료, **When** 최종 출력이 도착, **Then** SQL/테이블/텍스트/OLAP/링크 블록으로 포맷된 `final` 답변이 표시된다.
3. **Given** 도구 결과에 표 형태 데이터가 포함, **When** 결과가 렌더링, **Then** 최대 20행까지 테이블로 보여주고 나머지는 "... and N more rows"로 요약한다.

---

### User Story 2 - 실행 제어 및 파라미터 조정 (Priority: P2)

사용자는 ⚙️ 설정 패널에서 최대 반복 횟수와 SQL 타임아웃을 조정할 수 있고, 실행 중에는 "중단" 버튼으로 진행을 취소할 수 있다.

**Why this priority**: 핵심 흐름은 P1로 동작하지만, 긴/무한 루프를 방지하고 비용을 통제하는 운영 안전장치.

**Independent Test**: 설정 패널을 열어 값을 바꾸고 전송하면 요청에 해당 파라미터가 실린다. 실행 중 "중단"을 누르면 스트림이 끊기고 "작업이 중단되었습니다." 메시지가 뜬다.

**Acceptance Scenarios**:

1. **Given** 에이전트 실행 중, **When** "중단" 클릭, **Then** 요청이 abort 되고 상태가 idle로 돌아가며 중단 안내 메시지가 추가된다.
2. **Given** 설정 패널, **When** maxIterations/maxSqlSeconds 변경 후 전송, **Then** 변경된 값이 `max_iterations`/`max_sql_seconds`로 전달된다.

---

### Edge Cases

- 스트림 한 줄(JSON)이 파싱 실패하면 그 이벤트는 경고 로그만 남기고 건너뛴다(전체 중단 없음).
- 백엔드가 `error` 이벤트를 보내거나 HTTP가 비정상(`!ok`)이면 에러 메시지를 표시하고 진행 중 thinking 메시지를 정리한다.
- 사용자가 채팅을 위로 스크롤한 상태(바닥에서 50px 초과)면 새 메시지가 와도 강제로 바닥으로 끌어내리지 않는다.
- 빈 입력이거나 이미 실행 중이면 전송이 막힌다(`canSubmit`).
- 전송 시마다 채팅이 초기화되어 단일 질문-응답 세션으로 동작한다(이전 대화는 유지되지 않음).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 시스템은 사용자가 자연어 질문을 입력·전송할 수 있는 채팅 입력창을 제공해야 한다(Enter 전송, Shift+Enter 줄바꿈).
- **FR-002**: 시스템은 백엔드 LangChain ReAct 에이전트를 호출하고 그 실행을 NDJSON 스트림으로 받아 단계별로 화면에 반영해야 한다.
- **FR-003**: 시스템은 스트림 이벤트 유형(`phase`/`token`/`action`/`finish`/`complete`/`error`)에 따라 phase(thinking/reasoning/acting/observing), 토큰 누적, 도구 호출, 최종 출력, 에러를 상태로 변환해야 한다.
- **FR-004**: 시스템은 메시지를 user/thinking/action/result/final/error 유형으로 구분해 표시하고, action/result/final은 SQL·테이블·텍스트·OLAP·링크 블록으로 포맷팅해야 한다.
- **FR-005**: 시스템은 thinking 메시지를 해당 step의 action 시작·완료·idle 시점에 정리(제거)해야 한다.
- **FR-006**: 사용자는 실행 중 "중단"으로 요청을 취소할 수 있어야 하며(AbortController), 취소 시 상태가 idle로 복귀해야 한다.
- **FR-007**: 사용자는 최대 반복 횟수(기본 30, 1~50)와 SQL 타임아웃 초(기본 60, 10~300)를 조정할 수 있어야 하고, 그 값이 요청에 포함되어야 한다.
- **FR-008**: 시스템은 테이블 결과를 최대 20행까지만 렌더링하고 초과분은 요약 표기해야 한다.
- **FR-009**: 시스템은 사용자가 위로 스크롤한 상태에서는 자동 바닥 스크롤을 억제해야 한다.
- **FR-010**: 이 탭은 메뉴에 노출되지 않는 hidden 기능(id `langchain`)으로 등록되어 있어야 한다.

### Key Entities *(include if feature involves data)*

- **채팅 세션 (ChatMessage 목록)**: 화면에 표시되는 단일 질문-응답 세션. 각 메시지는 id, type(user/thinking/action/result/final/error), content, 선택적 tool/input/step을 가진다. 전송 시 초기화된다.
- **에이전트 상태 (langchain store)**: status(idle/running/completed/error), currentPhase, currentStep, streamingText, steps[], finalOutput, error, currentTool/Input/Result. Pinia 스토어로 관리.
- **스트림 이벤트 (LangChainStreamEvent)**: 백엔드가 NDJSON 한 줄씩 보내는 이벤트. type, phase, step, token, tool, input, result, content, output, message 필드를 가진다.
- **실행 스텝 (LangChainStep)**: tool, input, output 한 묶음. observing phase에서 결과가 오면 누적된다.
- **백엔드 엔드포인트 (`/langchain/api/*`)**: API Gateway 경유.
  - `POST {gateway}/langchain/api/react/stream` — ReAct 실행 NDJSON 스트림(주 경로, `streamLangChain`).
  - `POST {gateway}/langchain/api/react/run` — 비스트리밍 실행(`runLangChain`, 현재 UI 미사용).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 질문 전송 후 첫 진행 메시지(thinking/streaming)가 백엔드 첫 이벤트 도착 즉시(추가 폴링 없이) 표시된다.
- **SC-002**: 정상 완료 시 사용자는 하나의 `final` 답변 블록을 받고, 표 데이터는 20행 이내로 잘려 렌더링된다.
- **SC-003**: 실행 중 "중단"을 누르면 네트워크 요청이 abort 되고 새 질문을 즉시 보낼 수 있다.
- **SC-004**: 스트림 중 일부 라인 파싱 실패가 발생해도 세션 전체가 죽지 않고 나머지 이벤트가 계속 처리된다.

## Assumptions

- 백엔드 LangChain 서비스(`/langchain/api/...`)는 API Gateway(`/api/gateway`, env `VITE_API_GATEWAY_URL`) 뒤에 존재하며 NDJSON(줄 단위 JSON) 스트림을 반환한다.
- 대화 이력 유지는 범위 밖이다 — 매 전송마다 채팅이 초기화되는 단일 턴 세션이다.
- 이 탭은 단독 실행과 host(robo-architect) 임베드 모두에서 메모리 라우터의 단일 `/` 라우트 + 탭 전환(`session.activeTab`)으로 렌더되며, 자체 라우트는 없다.
- SQL 토큰화·결과 파싱은 공유 유틸(`@/shared/utils/resultFormatter`)을 재사용한다.
- 비스트리밍 `react/run` 엔드포인트는 API 계층에 정의되어 있으나 현재 UI는 스트리밍 경로만 사용한다.
