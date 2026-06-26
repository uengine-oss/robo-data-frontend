# Tasks: 진행 단계 라이브 전진

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

변경 = `src/features/code-analysis/analyzer.ts` `applyProcessingEvent` 1곳.

- [ ] **T001** `applyProcessingEvent` 맨 앞(상태 체크 전)에 `processing_event.step`("stepN") → phase=N-1 단조 전진(0≤phase<PHASES.length, > 현재일 때만). [FR-001/002/004]
- [ ] **T002** 기존 콘솔 진행감(status==='done' dedup/throttle)·node_done·complete·start 무변경 확인. [FR-003/005]
- [ ] **T003** 타입체크 내 파일 0에러.
- [ ] **T004** 라이브 검증: framework 재분석 중 step6.analyze_code 구간에 활성 단계="코드 분석"(index 5) 표시(또는 Playwright로 processing_event 주입 후 currentPhaseIndex 확인). 역행 0·완료 시 7단계 done.
- [ ] **T005** 커밋(frontend main, 내 파일만: analyzer.ts+specs/028+.specify/feature.json) → push → 서브모듈 ff → architect 포인터 bump → 재빌드.

## 의존
T001→T002→T003→T004→T005.
