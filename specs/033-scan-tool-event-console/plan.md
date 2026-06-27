# Implementation Plan: 스캔 단계 tool_event 콘솔 표시

**Branch**: `033-scan-tool-event-console` | **Date**: 2026-06-27 | **Spec**: [spec.md](./spec.md)

## Summary
프론트가 무시하던 `tool_event`(스캔 등 에이전트 도구 활동, 친절 한글 message)를 콘솔에 렌더. `AnalyzeEvent` 타입에 tool_event 필드 추가(event 에 tool_start/end/error, agent/tool/message), 디스패치에 `case 'tool_event'`, `logToolEvent`가 tool_start 의 message 만 `🔎 …`로 표시. 백엔드 변경 0(이미 스트림).

## Technical Context
TS/Vue/Pinia. 변경: `src/shared/types/index.ts`(tool_event 타입), `src/features/code-analysis/analyzer.ts`(dispatch+logToolEvent). Testing: vue-tsc + tool_event 주입 로직. 라이브는 앱 분석 실행(스캔 구간). ~20 LOC.

## Constitution Check
I/II/III/IV: 신규 라우트/탭/백엔드콜 0(기존 스트림 더 소비), code-analysis 내부, 정직성↑(가짜 아닌 실제 에이전트 활동 표시). PASS.

## 설계
- 타입: `AnalyzeEventType += 'tool_event'`; `AnalyzeEvent.event += 'tool_start'|'tool_end'|'tool_error'`; `+agent? +tool? +message?`.
- 디스패치: `case 'tool_event': logToolEvent(event)`.
- `logToolEvent`: `if event.event!=='tool_start' || !message return; addMessage('message', '🔎 '+message)`.
- tool_end/error 미표시(가독성). 백엔드 친절 message 그대로.

## Project Structure
```
specs/033-scan-tool-event-console/{spec,plan,tasks}.md, checklists/requirements.md
src/shared/types/index.ts
src/features/code-analysis/analyzer.ts
```

## Complexity Tracking
*위반 없음.*
