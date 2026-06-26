# Implementation Plan: 진행 단계 라이브 전진

**Branch**: `main` (spec dir `028-progress-live-step-advance`) | **Date**: 2026-06-27 | **Spec**: [spec.md](./spec.md)

## Summary
`applyProcessingEvent`(analyzer.ts) 맨 앞에 `processing_event.step("stepN.*")` → 단계 인덱스(N-1) 전진(maxPhaseSeen, 단조). node_done 전진은 유지. 긴 step6 동안 "코드 분석"으로 라이브 전진.

## 기술 접근 (최소·안전)
- 변경 = `applyProcessingEvent` 1함수에 5줄 추가(현 `status!=='done'` 조기 return **앞**에 둬서 start 에도 전진). currentPhaseIndex 는 027/026 의 단조 신호 — `max`로만 올림(역행 없음, FR-002).
- Blast radius: applyProcessingEvent 는 processing_event 디스패치(688)에서만 호출. 추가 로직은 currentPhaseIndex(이미 패널이 읽음) 올림뿐 → 타 소비처 무영향. `AnalyzeEvent.step` 타입 존재(types/index.ts:245).
- 매핑: `/^step(\d+)/` → N → phase=N-1, `0<=phase<PHASES.length` 가드.

## Constitution Check (frontend)
- I 라우트 N/A · II feature-folder(code-analysis 자기 store) · III API 무변경(이미 오는 이벤트 사용) · IV honest(표시가 실제와 일치=강화). **PASS**.

## 설계
```
function applyProcessingEvent(event):
  # ── 단계 라이브 전진(긴 단계 멈춤 방지) — status 무관, 가장 빠른 신호로
  m = /^step(\d+)/.exec(event.step ?? '')
  if m: phase = +m[1]-1; if 0<=phase<PHASES.length and phase>currentPhaseIndex: currentPhaseIndex=phase
  # ── 기존 콘솔 진행감(status!=='done' return ...) 그대로
```

## Project Structure
```
specs/028-progress-live-step-advance/ : spec.md ✓ plan.md tasks.md
변경: src/features/code-analysis/analyzer.ts (applyProcessingEvent)
```
## Complexity Tracking
없음.
