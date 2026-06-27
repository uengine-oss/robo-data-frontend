# Implementation Plan: 필터 칩 케이스 통일 (역할 칩 하이라이트 복원)

**Branch**: `041-filter-chip-case-unify` | **Date**: 2026-06-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/041-filter-chip-case-unify/spec.md`

## Summary

오버뷰 Node labels 의 역할 칩(CamelCase) 클릭 시 칩 active 하이라이트가 안 켜지는 버그를, **케이스 정규화 산재 제거**로 근본수정한다. `canvas` store 의 `loadedLabels` 가 라벨을 대문자로 변형해 저장하던 것을 없애고 **노드 라벨 원본 케이스 그대로 보관·정확매칭**한다. 같은 입력(loadedLabels)을 쓰는 역할 렌즈 색 함수 `colorLabelOf` 의 대문자 비교도 정확매칭으로 통일한다. 결과적으로 `toUpperCase` 호출이 제거되어 코드가 줄고, 칩 강조·캔버스 isolate·역할 렌즈 색이 한 케이스 규약으로 일관된다.

## Technical Context

**Language/Version**: TypeScript 5 / Vue 3 (Composition API), Pinia

**Primary Dependencies**: Pinia(store), `@/shared/utils/nodeLabels`(위치·렌즈 단일출처), NVL(캔버스 렌더)

**Storage**: N/A (런타임 메모리 상태만 — `loadedLabels: Set<string>`)

**Testing**: vue-tsc(타입 게이트, 변경파일 새 에러 0) + vite dev(3000) + Playwright(`.unittest/`, neo4j 실데이터 graph.json 주입) 시각·DOM 검증

**Target Platform**: 브라우저 / Electron 임베드(데스크톱). 동일 frontend 코드.

**Project Type**: 웹 프론트엔드(분석기 화면, MF 리모트)

**Performance Goals**: N/A (상수 비용 비교, 성능 영향 없음)

**Constraints**: 기존 기능 회귀 0 (칩 isolate·역할 렌즈 색·종류 칩 동작). 외부 계약(IPC/REST/NDJSON) 변경 없음.

**Scale/Scope**: 파일 2개 수정(`graphCanvas.ts`, `nodeLabels.ts`), 소비처 검증 2곳(`NvlGraph.vue`, `NodeDetailBase.vue`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Tab-Based Single-Route Shell**: 영향 없음(라우트·탭 변경 없음). ✅
- **II. Feature-Folder Modularity**: 변경은 `features/code-analysis`(graphCanvas) + `shared/utils`(nodeLabels) 내부. cross-feature 침투 없음. ✅
- **III. Gateway-Routed, Session-Headed API**: 백엔드 호출 추가/변경 없음. ✅
- **IV. Honest State (Wired vs Mock)**: 실데이터 동작, 목업 도입 없음. ✅
- **Cross-Service Contracts**: 노드 라벨 케이스(종류 UPPER_SNAKE / 역할 CamelCase)는 analyzer 생산 계약이며 **소비만 정렬**한다. 생산자 변경 없음. ✅

GATE PASS — 위반 없음(Complexity Tracking 불필요).

## Project Structure

### Documentation (this feature)

```text
specs/041-filter-chip-case-unify/
├── plan.md              # 이 파일
├── research.md          # Phase 0 — 근본원인 전수조사·결정 근거
├── data-model.md        # Phase 1 — loadedLabels 상태 규약
├── quickstart.md        # Phase 1 — 검증(Playwright) 시나리오
└── tasks.md             # Phase 2 (/speckit-tasks)
```

(contracts/ 없음 — 외부 인터페이스 변경이 없는 순수 내부 UI 수정.)

### Source Code (repository root)

```text
src/
├── features/code-analysis/
│   └── graphCanvas.ts                      # [수정] toggleLabelLoad·rebuildPanelLoad 대문자 변형 제거
├── features/code-analysis/components/graph/
│   ├── NvlGraph.vue                        # [검증] colorLabelOf(labels, isolatedSet) 소비 — 정확매칭 후 동작 확인
│   └── node-detail/NodeDetailBase.vue      # [검증] colorLabelOf(labels, loadedLabels) 소비 — 동일
└── shared/utils/
    └── nodeLabels.ts                       # [수정] colorLabelOf role.toUpperCase() → 원본 정확매칭, 인자명 isolatedUpper→isolated
```

**Structure Decision**: 단일 프론트엔드 프로젝트. 변경 표면 = `loadedLabels` 를 생산하는 한 곳(`graphCanvas.ts`)과 그것을 색 렌즈로 소비하는 한 곳(`nodeLabels.ts colorLabelOf`). 칩 강조를 판정하는 `NodeDetailPanel.isFilterActive` 는 **이미 정확매칭**(`activeFilters.includes(label)`)이라 수정 없이 자동으로 맞아떨어진다 — 이것이 "비교부를 고치지 않고 데이터를 바로잡는" 근본수정의 핵심.

### 변경하지 않는 것 (회귀 방지 경계)

- `graphCanvas.isolateLabel`(우클릭 isolate), `loadNodesByLabels`(보기모드 일괄 로드): `loadedLabels` 와 무관한 별개 메커니즘. 자체 대소문자 무관 매칭을 그대로 둔다(임의 라벨을 캔버스 노드에 매칭하는 다른 목적).
- `toggleRelLoad`/`loadedRelTypes`: 관계 타입은 원래 정규화 안 함(원본). 무변경.
- analyzer 생산자, NDJSON 계약, catalog: 무관.

## Complexity Tracking

> 해당 없음 — Constitution Check 위반 없음.
