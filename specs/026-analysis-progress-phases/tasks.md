# Tasks: 분석 진행 표시 7단계 재구성

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Data**: [data-model.md](./data-model.md)

변경 = 2파일(`analyzer.ts` store + `FloatingProgressPanel.vue`). 신규 파일·API·계약 0.

> **상태(2026-06-26)**: T001~T011 ✅ 완료. 타입체크 내 파일 0에러, 심볼 전수 grep dangling 0, 라이브 검증(Playwright store 주입 → 진짜 패널 렌더) 통과 — 진행 4/7 `✓✓✓ ▶관계연결+세부 ○○○`, 완료 7/7 전부 ✓. 라이브 중 발견·수정: complete 시 마지막 단계도 ✓(index=length), 배지 clamp(7/7). T012(dbms 실런·speckit-analyze) 선택. 미커밋.

## Phase A — store (analyzer.ts)

- [ ] **T001** 상수 교체: 평평 `STEP_LABELS`/`stepLabel` 폐기 → `PHASES`(7), `STEP_TO_PHASE`(leaf→0..6), `STEP_SUBLABEL`(leaf→사용자문구). 키는 **실제 emit 노드명**(`analyze_code_step`, 죽은 `analyze_function_step` 제외). 매핑 = data-model.md. [FR-003/006/010]
- [ ] **T002** state 정리: `dynamicSteps`·`currentPhaseName`·`currentPhase`(leaf인덱스) 폐기. `totalPhases`(leaf수) → `expectedLeafCount`(이름 정합). 추가: `currentPhaseIndex`(=maxPhaseSeen, 초기 -1)·`doneLeafCount`. `currentStep`·`currentPhaseProgress` 유지. [FR-001/002]
- [ ] **T003** `applyPhaseEvent` 재작성(research R2 규칙): `start`→index=-1·done수0·진행0·'분석 시작...'; `node_done`→`currentPhaseIndex=max(현재, STEP_TO_PHASE[node])`·`currentStep=STEP_SUBLABEL[node]`·done수++·바%=min(99,done/expected); `complete`→index=6·100%·'분석 완료 ✓'; stopped/paused/resumed 유지. 미상 노드=index 안 낮추고 무해 처리. [FR-002/004/007/008/009]
- [ ] **T004** `doAnalyze`: `dynamicSteps=[]` 제거, `totalPhases=dbms?13:14`→`expectedLeafCount=...`. `reset()`에 `currentPhaseIndex=-1`·진행0 추가. [정합]
- [ ] **T005** export 객체 갱신: `dynamicSteps`·`currentPhaseName`·`currentPhase`·`totalPhases` 제거, `PHASES`·`currentPhaseIndex`·`expectedLeafCount` 추가. `currentStep`·`currentPhaseProgress` 유지.

## Phase B — 렌더 (FloatingProgressPanel.vue)

- [ ] **T006** `storeToRefs`: `dynamicSteps`/`totalPhases` 제거, `PHASES`/`currentPhaseIndex` 추가.
- [ ] **T007** `phaseStatusClass/Icon`: 인자를 단계 인덱스(0..6)로 → `idx<currentPhaseIndex`=done(✓) / `==`=active(▶, paused=⏸) / `>`=pending(○). [FR-002]
- [ ] **T008** 타임라인 렌더: `v-for dynamicSteps` → `v-for PHASES`(index 동반) 7행 고정. active 행에만 `currentStep`을 세부 한 줄(phase-desc)로 표시. 완료/대기 행은 세부 없음. [US1/US2/FR-004/005]
- [ ] **T009** 배지·완료판정: "단계" 카운트 → `max(0,currentPhaseIndex+1)/PHASES.length`. `isCompleted` = `currentPhaseIndex>=PHASES.length-1 && currentPhaseProgress>=100`. empty-hint 정리(7행 항상 표시). [FR-001]

## Phase C — 검증 (quickstart.md)

- [ ] **T010** 빌드 통과(`tsc -b` / 프론트 빌드). 심볼 전수 grep: `dynamicSteps`·`totalPhases`·`currentPhase(Name)` dangling 0(원칙 §5).
- [ ] **T011** 라이브 자가검증(quickstart): framework 1회 → 7단계만·상태전이·active 세부 1줄·내부어 0·skip 무오류·완료 시 7단계 done. 진행바·그래프객체·콘솔·드래그 무회귀.
- [ ] **T012** (가능 시) dbms 1회 → 동일 7단계. speckit-analyze로 spec↔plan↔tasks 교차검증.

## 의존
A(T001→T005 순차) → B(T006→T009) → C. T001은 data-model.md 매핑이 진실.
