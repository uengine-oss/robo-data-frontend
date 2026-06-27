# Tasks: 스캔 단계 tool_event 콘솔 표시

**Feature**: [spec.md](./spec.md) · **변경**: `src/shared/types/index.ts`, `src/features/code-analysis/analyzer.ts`

- [x] T001 `types/index.ts`: `AnalyzeEventType` 에 `'tool_event'` 추가; `AnalyzeEvent.event` 유니온에 `tool_start|tool_end|tool_error` 추가; `agent?`·`tool?`·`message?` 필드 추가.
- [x] T002 `analyzer.ts`: `logToolEvent(event)` 추가 — `event.event==='tool_start' && message` 일 때만 `addMessage('message', '🔎 '+message)`.
- [x] T003 `analyzer.ts` 디스패치: `case 'tool_event': logToolEvent(event); break` 추가, 주석에서 tool_event 미렌더 표기 제거.
- [x] T004 `npx vue-tsc --noEmit` → analyzer.ts·types 0에러.
- [ ] T005 [P] 라이브: 앱에서 framework 분석 → 코드베이스 스캔 구간에 `🔎 …` 활동 줄들이 라이브로 뜨는지 확인(스캔 콘솔 채워짐). dbms/대형은 로직(미검증 명시).

## MVP
- T001-T003 = 스캔 콘솔 라이브 채움.
