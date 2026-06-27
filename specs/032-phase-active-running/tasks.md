# Tasks: 진행 단계 진행중 표시 + % 정수화

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)
**변경**: `src/features/code-analysis/analyzer.ts`, `src/shared/components/FloatingProgressPanel.vue`

## Phase 2: Foundational
- [x] T001 `analyzer.ts` 모듈 레벨에 `ORDERED_LEAVES_FRAMEWORK`(14)·`ORDERED_LEAVES_DBMS`(13) + `nextRunningLeaf`·`runningPhaseIndex` 헬퍼 추가(STEP_TO_PHASE 옆).
- [x] T002 `analyzer.ts` 스토어에 `doneLeaves: Set<string>` 추가 + `resetProgressTracking` 에 `doneLeaves.clear()`.

## Phase 3: US1 — 진행중 단계 (P1)
- [x] T003 [US1] `applyPhaseEvent` node_done: `doneLeaves.add(node)` 후 `currentPhaseIndex = runningPhaseIndex(...)`(단조), `currentStep = 다음 leaf sublabel`. start: clear+running(DDL). complete: PHASES.length 유지. `analyzer.ts`.
- [x] T004 [US1] `applyProcessingEvent` 의 spec 028 `/^step(\d+)/` 단계 승급 블록 제거(leaf 모델이 대체). 바(030)·메시지(029) 유지. `analyzer.ts`.

## Phase 4: US2 — % 정수화 (P1)
- [x] T005 [US2] `FloatingProgressPanel.vue` `progress = Math.round(currentPhaseProgress)` (내부 float 보존, 표시만 정수). 바 width 도 정수.

## Phase 6: 검증
- [x] T006 `npx vue-tsc --noEmit` → analyzer.ts·FloatingProgressPanel.vue 0에러.
- [x] T007 [P] leaf 순서 시뮬(framework·dbms): 매 완료마다 활성=다음 단계, 다중 leaf overshoot 0, 단조, 전부완료=모두 done.
- [ ] T008 [P] 라이브: framework 재분석 시 AST→스캔→관계연결→…→코드분석 활성 전환·% 정수 눈으로 확인(앱). dbms=로직(미검증 명시).

## MVP
- T001-T005 = 진행중 단계 정확 + % 정수(핵심).
