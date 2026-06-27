# Implementation Plan: 분석 진행바(%) 라이브화

**Branch**: `030-progress-bar-live` | **Date**: 2026-06-27 | **Spec**: [spec.md](./spec.md)

## Summary

진행바 `currentPhaseProgress`를 긴 단계(특히 step6 코드분석) 동안에도 전진시킨다. 기존 베이스라인(`doneLeafCount/expectedLeafCount`, node_done에서만 증가)은 유지하고, `applyProcessingEvent`(spec 029 핸들러)에서 처리 단위 신호가 올 때마다 **현재 단계 슬롯의 다음 경계로 점근적으로 채운다**. 점근식이라 단계 총 처리 건수를 몰라도 경계를 넘지 않고, node_done이 오면 베이스라인이 그 경계로 올라 매끄럽게 이어진다(단조 증가 불변). 백엔드 변경 0.

## Technical Context

**Language/Version**: TypeScript 5 / Vue 3 (Pinia)
**Primary Dependencies**: 기존 `analyzer.ts`의 `currentPhaseProgress`·`doneLeafCount`·`expectedLeafCount`·`applyPhaseEvent`·`applyProcessingEvent`
**Storage**: N/A (런타임 ref)
**Testing**: `vue-tsc --noEmit`(내 파일 0에러) + framework 실데이터/주입 진행바 단조성 검증, dbms 신호 주입
**Project Type**: web/desktop SPA
**Constraints**: 백엔드/스트림 무변경. 단조 증가(역행 0). 완료 전 100%·단계경계 초과 금지(99% 상한 유지). 028/029 무회귀.
**Scale/Scope**: `analyzer.ts` 1파일, `applyProcessingEvent`에 라이브 보간 수 줄 + (선택)헬퍼. ~15 LOC.

## Constitution Check

- **I. 단일 라우트·탭** — 신규 라우트/탭 0. PASS/N/A.
- **II. 기능 폴더** — `features/code-analysis/analyzer.ts` 내부. PASS.
- **III. 게이트웨이 API** — 신규 호출 0(기존 스트림 소비). PASS/N/A.
- **IV. 정직한 상태** — 실제 처리 신호로 진행감을 정직하게 보간(가짜 애니메이션 아님, 실제 진척 비례). PASS.

위반 없음 → Complexity Tracking 비움.

## 설계 — 점근적 슬롯 채움 (핵심 결정)

기호: `N=expectedLeafCount`(14 fw / 13 dbms), `d=doneLeafCount`.
- **단계 슬롯**: 현재 단계는 `[d/N, (d+1)/N]` 구간(백분율). 다음 경계 `boundary = (d+1)/N * 100`.
- **라이브 보간**(processing_event done 마다): `currentPhaseProgress += (cap - currentPhaseProgress) * K`,
  - `cap = min(99, boundary - ε)` (경계·99% 도달 금지, ε 작게 예: 0.5),
  - `K` = 작은 계수(예: 0.12) → 건수↑일수록 cap에 **수렴(점근)**, 총량 미지여도 자연스러움.
  - 보간은 **증가만**(`cap > current`일 때만; current가 이미 cap≥면 no-op) → 단조.
- **node_done**(기존 applyPhaseEvent): `d += 1` 후 `currentPhaseProgress = min(99, d/N*100)`. 직전 라이브가 다가가던 `boundary`와 같은 지점이라 **매끄럽게 이어지고 역행 없음**(라이브 cap<boundary≤새 baseline).
- **complete**: 100%(현행). **start/재시작**: 0%(현행).

**왜 점근식인가**: 한 단계의 총 처리 건수를 모름(FR-004). 선형(건수/총수)은 총수 필요 → 불가. 점근식은 매 신호가 남은 간격의 일정 비율을 메워 **언제 끝나든 경계로 수렴**하되 도달 안 함 → 멈춤 없음 + 경계 초과 없음 동시 충족.

## Project Structure

```text
specs/030-progress-bar-live/{plan,spec,research,data-model,quickstart}.md, checklists/requirements.md
src/features/code-analysis/analyzer.ts   # currentPhaseProgress 라이브 보간 추가(applyProcessingEvent), applyPhaseEvent 베이스라인 유지
```

**Structure Decision**: 단일 파일·기존 핸들러 확장. 신규 컴포넌트/스토어 0.

## Phase 0/1 요약
- research.md: 점근식 선택 근거(선형 불가=총수 미지), 단조성·경계 불변식, 실데이터(코드분석 단계 처리 신호 다수) 근거, K/ε 기본값 근거.
- data-model.md: `currentPhaseProgress`/`doneLeafCount`/`expectedLeafCount` 의미 + 보간 규칙 + 불변식.
- quickstart.md: 긴 단계 주입 시 단조 증가·경계 미초과·node_done 매끄러운 인계·완료 100% 검증 시나리오.

## Complexity Tracking
*위반 없음 — 비움.*
