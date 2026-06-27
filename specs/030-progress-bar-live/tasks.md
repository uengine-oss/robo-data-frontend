# Tasks: 분석 진행바(%) 라이브화

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Branch**: `030-progress-bar-live`
**유일 변경 파일**: `src/features/code-analysis/analyzer.ts`

## Phase 1: Setup
- [x] T001 `analyzer.ts`에서 `currentPhaseProgress`(≈469), `applyPhaseEvent` node_done 베이스라인(≈594-598), `applyProcessingEvent`(≈658), `expectedLeafCount`/`doneLeafCount` 위치 확인.

## Phase 2: Foundational
- [x] T002 `analyzer.ts`에 상수 `LIVE_FILL_K = 0.12`, `BOUNDARY_EPS = 0.5` 추가(상수 영역).

## Phase 3: US1 — 긴 단계 진행바 전진 (P1)
- [x] T003 [US1] `applyProcessingEvent`에 라이브 보간 추가(028 블록 뒤, 메시지 로직과 독립): `N=expectedLeafCount.value; if N>0 → boundary=(doneLeafCount.value+1)/N*100; cap=Math.min(99, boundary-BOUNDARY_EPS); if currentPhaseProgress.value<cap → currentPhaseProgress.value += (cap-currentPhaseProgress.value)*LIVE_FILL_K`. `src/features/code-analysis/analyzer.ts`.
- [x] T004 [US1] 보간을 **모든 done 처리 신호**에 적용(spec 029의 throttle/early-return 보다 앞 또는 독립 위치)되, status!=='done'이면 미적용 확인. 경계·99% 초과 없음 보장. `src/features/code-analysis/analyzer.ts`.

## Phase 4: US1 — node_done 인계·단조 (P1)
- [x] T005 [US1] `applyPhaseEvent` node_done 베이스라인이 `min(99, d/N*100)`로 cap 이상이라 역행 없음 확인(현행 식 유지). 라이브와 충돌 시 단조 불변 점검. `src/features/code-analysis/analyzer.ts`.

## Phase 5: US2 — 전략 무관 (P2)
- [x] T006 [US2] 보간이 `expectedLeafCount`(fw14/dbms13)만으로 동작(전략 분기 없음) 확인. dbms Batch 신호도 done이라 동일 적용. `src/features/code-analysis/analyzer.ts`.

## Phase 6: Polish & 검증
- [x] T007 `npx vue-tsc --noEmit` → analyzer.ts 0에러.
- [x] T008 [P] framework 실데이터/주입(quickstart 1·2·3): 긴 단계 처리 신호열에서 진행바 단조 증가·경계 미초과·node_done 매끄러운 인계 확인(로직 재생 또는 store 주입).
- [x] T009 [P] dbms 주입(시나리오 4): Batch done 신호로 진행바 전진(라이브 실증 불가=미검증 명시).
- [x] T010 [P] 028/029 무회귀(시나리오 5): `currentPhaseIndex` 전진·콘솔 메시지 동작 변화 없음 확인.

## Dependencies
- T002 선행. T003-T004 핵심(US1). T005 인계. T006 전략. T007-T010 검증(코드 후, 병렬).
- 한 파일 직렬. [P]=검증만.

## MVP
- T002-T004 = 긴 단계 진행바 전진(핵심). T005/T006 = 단조·전략 보강.

## 형식 검증
- 모든 작업 `- [ ] [TID] [P?] [US?] 설명 + 파일경로` 준수.
