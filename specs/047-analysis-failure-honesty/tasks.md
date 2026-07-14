# Tasks: 분석 실패 정직한 표면화

- [x] T001 `src/shared/types/index.ts`에 fatal 오류 wire 필드 추가.
- [x] T002 `src/features/code-analysis/analyzer.ts`가 `message ?? content`를 표시하도록 수정.
- [x] T003 fatal error와 `phase_event complete` 상태를 추적하고 스트림 종료 후 성공/실패를 판정.
- [x] T004 실패 시 완료 문구·100%·graph fetch 미실행, 상위 catch에서 `처리 실패` 표시 확인.
- [ ] T005 `npm run type-check` 및 정상/실패 실제 UI 검증.
