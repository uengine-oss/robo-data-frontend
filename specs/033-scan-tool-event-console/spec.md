# Feature Specification: 스캔(에이전트) 단계 콘솔 라이브 피드백 — tool_event 표시

**Feature Branch**: `033-scan-tool-event-console`

**Created**: 2026-06-27

**Status**: Draft

**Input**: 앱 실측 — 단계별 콘솔 메시지가 너무 적음, **특히 코드베이스 스캔** 구간. 스캔은 LLM 에이전트가 수 초~수십 초 도는데 콘솔엔 완료 한 줄("코드베이스 스캔 완료 — 패턴 N")만 떠 "멈춘 듯". 백엔드는 스캔 중 에이전트 도구 활동(tool_event)을 친절 문구로 스트림하지만 프론트가 **무시**한다.

## 배경 / 현재 동작 (왜)

콘솔 라이브 피드백 원천은 둘: ① `message`(단계 완료 요약, 단계당 1줄) ② `processing_event`(step 내 처리 단위, **step5~7 에만** 존재 — spec 029). DDL/AST/스캔/링킹 단계는 processing_event 가 없어 완료 message 한 줄만 뜬다. 그중 **스캔**은 LLM 에이전트라 시간이 걸리는데 그 사이 콘솔이 빈다.

**확인된 사실(코드·로그)**: 스캔 에이전트는 도구 호출마다 `tool_event`(친절 한글 message, 예 `"… 디렉토리 보는 중"`, `"… 패턴 검색 중"`, `"… 파일 보는 중"`)를 **스트림으로 보낸다**(scan_codebase_step → scan_agent → 미들웨어 stream_emit; 실 run tool_events.jsonl 에 scan agent 12건=tool_start 6+tool_end 6 확인). 그러나 프론트 디스패치에 `tool_event` 케이스가 없어 **전부 버려진다**(주석 "미렌더"). → 스캔 콘솔 공백의 직접 원인.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 스캔 중 무엇을 훑는지 보인다 (Priority: P1)

코드베이스 스캔이 도는 동안, 콘솔에 에이전트가 **지금 무엇을 보는지**가 라이브로 흐른다(예: `🔎 … 디렉토리 보는 중`, `🔎 … 패턴 검색 중`). 더 이상 완료 한 줄만 뜨고 멈춘 듯 보이지 않는다.

**Why this priority**: 사용자가 직접 지목한 "스캔 콘솔 비어 있음".

**Independent Test**: tool_event(tool_start, message 포함) 주입 → 콘솔에 친절 문구가 라이브로 추가되는지.

**Acceptance Scenarios**:
1. **Given** 스캔 에이전트가 도구를 시작(tool_start, message="… 보는 중"), **When** 이벤트 수신, **Then** 콘솔에 `🔎 … 보는 중` 한 줄 추가.
2. **Given** 스캔 동안 도구 호출 여러 건, **When** 진행, **Then** 콘솔이 그 활동으로 라이브로 채워짐(완료 한 줄만이 아님).
3. **Given** message 가 없는 tool_event(또는 tool_end/tool_error), **When** 수신, **Then** 시작(tool_start) 친절 문구만 표시(종료/결과는 생략, 가독성).

### Edge Cases
- 도구 활동이 매우 많은 대형 코드베이스 → tool_start 만 표시(종료/결과 생략)로 절반으로 줄임. 에이전트 호출 한도(ROBO_AGENT_SCAN_MAX_CALLS)로 자연 상한.
- tool_event 가 안 오는 환경(스트림 미연결/CLI) → 기존처럼 완료 message 만(열화 없음).
- 다른 LLM 단계(요약 등)의 tool_event 도 같은 규칙으로 표시(있으면) — step5~7 은 이미 processing_event 가 있어 보조적.

## Requirements *(mandatory)*

- **FR-001**: 프론트는 `tool_event`(현재 무시)를 콘솔 메시지로 렌더해야 한다.
- **FR-002**: 표시는 **tool_start 시점의 친절 message** 만(이모지 🔎 접두). tool_end/tool_error 는 표시하지 않는다(콘솔 가독성).
- **FR-003**: message 가 비면 표시하지 않는다(빈 줄 금지).
- **FR-004**: 원시 인자/경로 과다 노출 없이 백엔드가 만든 친절 message 를 그대로 사용(프론트 가공 최소).
- **FR-005**: 기존 message/processing_event 콘솔 동작 보존(중복·충돌 없음).

## Success Criteria *(mandatory)*

- **SC-001**: 스캔 구간 콘솔 줄 수가 **완료 1줄 → 도구 활동 N줄**로 증가(스캔이 "멈춘 듯" 안 보임).
- **SC-002**: 표시 문구는 사람이 읽을 친절 한글(원시 도구 덤프 아님).
- **SC-003**: 기존 단계 완료/처리 메시지 회귀 0.

## Assumptions

- 라이브 HTTP 분석에서 스캔 에이전트 tool_event 가 스트림됨(scan_codebase_step 가 stream.emit 전달, 코드 확인). 캡처된 CLI 로그에는 tool_event 가 스트림에 없었음(jsonl 에만) — 따라서 **라이브 실증은 앱에서 분석 실행으로** 확인(미검증 표기), 로직/타입은 검증.
- step5~7 LLM 단계의 tool_event 도 표시되나 그쪽은 processing_event(029)가 주 피드백이라 보조적·소량.
- 028~032 진행 표시와 별개 관심사(콘솔 메시지 채움).
