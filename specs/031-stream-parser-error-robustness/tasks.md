# Tasks: 스트림 파서 견고화 (error 비종결)

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **변경 파일**: `src/shared/services/http.ts`

- [x] T001 `src/shared/services/http.ts` `processBuffer`(≈319-335)에서 종결 조건 `if (event.type === 'complete' || event.type === 'error') return ''` → `if (event.type === 'complete') return ''` 로 수정(주석으로 "error 는 데이터성 — 잔여 라인 보존" 명시).
- [x] T002 `processFinalBuffer`/`processStream` 종결 경로는 HTTP done 기반이라 변경 불요 확인(현행 유지).
- [x] T003 `npx vue-tsc --noEmit` → http.ts 0에러(프로젝트 전역 기존 에러 무관).
- [x] T004 [P] 라인 시퀀스 검증: `[node, error, node, relationship]` 한 청크 파싱 시 4개 콜백 전달(시나리오 1) — 로직 검증.
- [x] T005 [P] 회귀: `complete` 종결·정상(HTTP done) 종료 동작 유지 확인(시나리오 2·3).

## Dependencies
- T001 핵심. T002 확인. T003-T005 검증(병렬).

## MVP
- T001 = 핵심 1줄.
