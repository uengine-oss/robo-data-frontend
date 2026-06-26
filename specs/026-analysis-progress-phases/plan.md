# Implementation Plan: 분석 진행 표시 7단계 재구성

**Branch**: `026-analysis-progress-phases` | **Date**: 2026-06-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/026-analysis-progress-phases/spec.md`

## Summary

분석 진행 패널(`FloatingProgressPanel.vue`)이 지금은 analyzer가 흘려보내는 leaf `node_done` 이벤트를 1:1로 `dynamicSteps`에 쌓아 **평평하게 나열**한다. 이를 **고정 7단계**(analyzer `analysis_flow/step1~step7` 구조)로 묶어, 7개 상위 단계만 보여주고 진행 중 단계엔 현재 세부를 **사용자 표현 한 줄**로만 표시한다.

**기술 접근 = 프론트 정적 매핑(백엔드 무변경)**: analyzer는 이미 leaf 노드명을 `node_done.node`로 보낸다. 프론트에 `leaf 노드명 → 7단계` 정적 매핑 + `leaf 노드명 → 사용자 세부문구` 매핑을 두고, 진행 상태(어느 단계가 done/active/pending)를 leaf 이벤트에서 파생한다. analyzer 이벤트 계약·페이로드는 바꾸지 않으므로 **cross-service contract 영향 0**.

## Technical Context

**Language/Version**: TypeScript 5 / Vue 3 (`<script setup>`) / Pinia

**Primary Dependencies**: Vue 3, Pinia (`storeToRefs`). 신규 의존성 없음.

**Storage**: N/A (런타임 진행 상태는 store ref, 영속 없음)

**Testing**: 라이브 자가검증(풀스택 기동 → 분석 1회 → 진행 패널 관찰). 프레임워크 단위 테스트는 레포 표준 따름(별도 추가 없음).

**Target Platform**: 브라우저 + Electron 임베드(Module Federation analyzer remote)

**Project Type**: web frontend (단일 SPA, 탭 셸)

**Performance Goals**: 진행 이벤트 초당 수~수십 건. 7단계 파생은 O(1)~O(leaf) 단순 계산 — 성능 이슈 없음.

**Constraints**: 신규 라우트·API·영속 스키마 0. 사용자 WIP 파일(TableCard.vue 등) 불가침. 루트 체크아웃 작업.

**Scale/Scope**: 단일 컴포넌트(FloatingProgressPanel.vue) + 단일 store(analyzer.ts)의 진행 표시 영역. 7단계 / 17 leaf 매핑.

## Constitution Check

*GATE: Phase 0 전 통과 필수. Phase 1 설계 후 재확인.*

| 원칙 | 판정 | 근거 |
|---|---|---|
| I. Tab-Based Single-Route Shell | ✅ N/A | 라우트 추가 없음. 기존 진행 패널 내부만 변경. |
| II. Feature-Folder Modularity | ✅ PASS | 변경 = `features/code-analysis/analyzer.ts`(자기 store) + `shared/components/FloatingProgressPanel.vue`(이미 analyzer store만 소비하는 공용 패널). 타 feature 내부 침범 0. |
| III. Gateway-Routed, Session-Headed API | ✅ N/A | 신규 백엔드 호출 0. 기존 NDJSON `phase_event` 스트림만 소비(계약 불변). |
| IV. Honest State: Wired vs Mock | ✅ PASS | 목업 추가 0. 실제 진행 이벤트를 7단계 구조로 더 정직하게 표시 → 원칙 강화. |

**결과: PASS** (신규 라우트·API·스키마·목업 0). Complexity Tracking 불필요.

## Project Structure

### Documentation (this feature)

```text
specs/026-analysis-progress-phases/
├── spec.md          # 완료
├── plan.md          # 이 파일
├── research.md      # 설계 결정(프론트 정적 매핑 / in-progress 파생 규칙 / 라벨)
├── data-model.md    # 7단계 정의 + leaf→단계 매핑 + leaf→세부문구 매핑
├── quickstart.md    # 라이브 자가검증 절차
└── tasks.md         # speckit-tasks 산출(이 plan 단계서 생성 안 함)
contracts/           # 없음 — 백엔드 계약 변경 0 (사유: research.md)
```

### Source Code (repository root = robo-data-frontend)

```text
src/
├── features/code-analysis/
│   └── analyzer.ts                     # [변경] PHASES·STEP_TO_PHASE·STEP_SUBLABEL 추가,
│                                       #        applyPhaseEvent를 7단계 파생으로, dynamicSteps 폐기
└── shared/components/
    └── FloatingProgressPanel.vue       # [변경] dynamicSteps 렌더 → 고정 7단계 렌더 + active 세부 1줄
```

**Structure Decision**: 변경은 정확히 2파일(store 1 + 렌더 1). 신규 파일 없음(응집도 — 진행 로직은 analyzer store 단일 책임, 렌더는 기존 패널). 7단계/매핑 상수는 표시 로직이 사는 `analyzer.ts`에 둔다(렌더 컴포넌트는 store 파생값만 읽음 = DRY).

## 설계 (Phase 1 요지 — 상세는 research.md / data-model.md)

### 현재 동작 (전수조사 확정, 추측 아님)
- `analyzer.ts:542 applyPhaseEvent`: analyzer wire = `start` / `node_done`(완료 leaf명 `event.node`) / `complete` / `stopped` / `paused` / `resumed`. **node_start 없음** — leaf는 "완료" 시점에만 통지됨.
- `node_done`마다 `dynamicSteps`에 `{num, name: stepLabel(node)}` append, `currentPhase = num`(=완료 개수-1), `currentStep = "<label> 완료"`.
- `FloatingProgressPanel.vue:292`: `dynamicSteps`를 행으로 렌더, 아이콘은 `currentPhase` 비교(`<`=✓ done / `==`=▶ active / `>`=○ pending). 카운트 배지 = `dynamicSteps.length`. → **마지막 완료가 ▶로 보이는 평평한 리스트.**

### 목표 동작
- store에 **고정 7단계**(`PHASES`) 정의. leaf 이벤트가 오면 `STEP_TO_PHASE`로 단계 인덱스를 구해 `maxPhaseSeen` 갱신.
- 단계 상태 파생: index `< maxPhaseSeen` = done / `== maxPhaseSeen` = active / `> maxPhaseSeen` = pending. `complete` 시 전 단계 done. → **skip된 leaf가 있어도(순차 파이프라인) 뒤 단계가 시작되면 앞 단계는 done**(FR-007/008/009, 순서 역전 없음).
- `currentLeafLabel` = 최근 leaf의 **사용자 세부문구**(`STEP_SUBLABEL`) → active 단계 한 줄(US2). 완료/대기 단계엔 미표시(FR-004).
- 렌더: `dynamicSteps` 대신 **PHASES 7행 고정**. 배지 = `현재/7` 또는 단계명(FR-001/003/005).
- 라벨: `PHASES` 7개 + `STEP_SUBLABEL` 모두 사용자 표현(FR-006).

### 정리 대상 (원칙 §3 데드/근본)
- 죽은 키 `analyze_function_step`(실제 emit = `analyze_code_step`) → 매핑은 실제 노드명만(FR-010).
- `dynamicSteps`·`totalPhases=6` 하드코딩 등 평평 리스트 잔재 폐기(7단계로 대체되면 미사용).
- **심볼 변경 전수 grep 필수**(원칙 §5): `dynamicSteps`·`totalPhases`·`currentPhase` store export 변경 시 소비처 전수 확인 — grep에 `FloatingProgressPanel.vue` 외 `GraphTab.vue`도 매칭됨 → GraphTab이 analyzer store의 이 export를 쓰는지 tasks에서 확인·정합(타 feature 동명 ref 오탐 가능성도 함께 판별).

## Complexity Tracking

해당 없음 (Constitution Check 위반 0).
