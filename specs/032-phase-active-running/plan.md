# Implementation Plan: 진행 단계 = 진행중 정확 표시 + % 정수화

**Branch**: `032-phase-active-running` | **Date**: 2026-06-27 | **Spec**: [spec.md](./spec.md)

## Summary
`currentPhaseIndex`를 "완료 leaf 의 단계"(026) 대신 **"완료 leaf 의 다음 leaf 의 단계"(=진행 중)** 로 도출. 전략별 leaf 실행 순서 배열(`ORDERED_LEAVES_FRAMEWORK/DBMS`) + 헬퍼(`nextRunningLeaf`/`runningPhaseIndex`)로 단일 진실. `applyPhaseEvent` node_done 이 `doneLeaves` 집합에 추가 후 진행중 단계 재계산. spec 028 의 processing-event 단계 승급 블록은 제거(이 모델이 긴 단계도 처리). 진행바 % 는 표시 시 `Math.round`(030 float 보존). 백엔드 변경 0.

## Technical Context
TS/Vue/Pinia. 변경: `src/features/code-analysis/analyzer.ts`(leaf 순서 배열·헬퍼·applyPhaseEvent·028블록 제거·doneLeaves 상태/리셋), `src/shared/components/FloatingProgressPanel.vue`(progress 반올림). Testing: vue-tsc + leaf 순서 시뮬. ~50 LOC.

## Constitution Check
I/II/III/IV: 신규 라우트/탭/백엔드콜 0, code-analysis 슬라이스+공유 패널, 정직성↑(정확한 단계 표시). PASS.

## 설계
- `ORDERED_LEAVES_FRAMEWORK`(14)·`ORDERED_LEAVES_DBMS`(13) = 파이프라인 순서.
- `nextRunningLeaf(done, strategy)` = 최고 완료 인덱스 +1 의 leaf(없으면 null).
- `runningPhaseIndex(done, strategy)` = 그 leaf 의 STEP_TO_PHASE(전부 완료면 PHASES.length).
- `applyPhaseEvent`: start→doneLeaves.clear()+running(=DDL); node_done→doneLeaves.add+currentPhaseIndex=running(단조)+currentStep=다음 leaf sublabel; complete→PHASES.length.
- `applyProcessingEvent`: 028 phase 블록 제거(바·메시지만 유지).
- 패널: `progress = Math.round(currentPhaseProgress)`.

## Project Structure
```
specs/032-phase-active-running/{spec,plan,tasks}.md, checklists/requirements.md
src/features/code-analysis/analyzer.ts
src/shared/components/FloatingProgressPanel.vue
```

## Complexity Tracking
*위반 없음.*
