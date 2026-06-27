# Tasks: 필터 칩 케이스 통일 (역할 칩 하이라이트 복원)

**Input**: spec.md, plan.md, research.md, data-model.md, quickstart.md (`specs/041-filter-chip-case-unify/`)

**Tests**: 단위테스트 별도 요청 없음 → vue-tsc 타입게이트 + Playwright 시각·DOM 검증(quickstart)으로 대체.

---

## Phase 1: Setup

- [X] T001 변경 전 baseline 확인 — `src/features/code-analysis/graphCanvas.ts`(toggleLabelLoad·rebuildPanelLoad)·`src/shared/utils/nodeLabels.ts`(colorLabelOf) 현재 상태와 `loadedLabels` 소비처 전수(GraphTab.activeNodeLoads, NvlGraph isolatedSet, NodeDetailBase colorLabelOf) 재확인.

## Phase 2: Foundational

(별도 선행 작업 없음 — 두 파일 수정이 곧 핵심. Setup 후 바로 US 진행.)

## Phase 3: User Story 1 — 역할 칩 켜짐/꺼짐 (P1)

**Goal**: 역할 칩 클릭 시 칩 active 강조가 켜지고 재클릭 시 꺼진다(종류 칩 회귀 0).

**Independent Test**: 오버뷰 역할 칩 클릭 → `.stat-badge.active` ON + 캔버스 isolate, 재클릭 → OFF. 종류 칩도 동일.

- [X] T002 [US1] `src/features/code-analysis/graphCanvas.ts` `toggleLabelLoad` — `const up = label.toUpperCase()` 제거, 라벨 원본을 `loadedLabels` 에 add/delete(원본 케이스 보관).
- [X] T003 [US1] `src/features/code-analysis/graphCanvas.ts` `rebuildPanelLoad` — `loadedLabels.value.has(l.toUpperCase())` → `loadedLabels.value.has(l)`(원본 정확매칭).
- [X] T004 [US1] `isFilterActive`(NodeDetailPanel.vue) 는 이미 정확매칭이라 수정 불필요 — 코드 확인만(추가 toUpperCase 절대 넣지 않음).

## Phase 4: User Story 2 — 역할 렌즈 색 유지 (P1)

**Goal**: 역할 칩 isolate 시 노드·배지 역할색이 칩 색과 일치(기존 spec 040 동작 유지). loadedLabels 가 원본 케이스가 되었으므로 색 함수도 정확매칭으로 통일.

**Independent Test**: Command isolate → 캔버스 [*,Command] 노드 역할색, 노드 배지 동일색. 기본 상태 종류색.

- [X] T005 [US2] `src/shared/utils/nodeLabels.ts` `colorLabelOf` — `isolatedUpper.has(role.toUpperCase())` → `isolated.has(role)`. 인자명 `isolatedUpper`→`isolated`, JSDoc "(대문자)" 문구 제거.
- [X] T006 [US2] 소비처 정합 확인(코드 리뷰, 무수정 예상): `NvlGraph.vue` `isolatedSet`(=props.isolatedLabels=activeNodeLoads, 이제 원본) → colorLabelOf 와 정합 / `NodeDetailBase.vue` `colorLabelOf(node.labels, canvasStore.loadedLabels)`(이제 원본) → 정합. 주석의 "(대문자, loadedLabels)" 표기도 원본 케이스로 정정.

## Phase 5: Polish & 검증

- [X] T007 타입게이트 — `vue-tsc --noEmit` 실행, 변경파일(graphCanvas.ts·nodeLabels.ts·NvlGraph.vue) **새 에러 0** 확인(전역 기존 에러 무관).
- [X] T008 회귀·유지보수 전수검토 — loadedLabels 경로에 잔여 `toUpperCase`/대문자 가정 0 확인(grep). isolateLabel·loadNodesByLabels·loadedRelTypes 무변경 확인(스코프 경계). 데드·중복정의·드리프트 0.
- [X] T009 시각·DOM 검증(quickstart) — vite dev(3000)+Playwright, neo4j 실데이터 graph.json 주입. 시나리오 1~5(US1-1/2/3, US2-1/2) 전부 통과 + 스샷 Read 로 칩 강조·캔버스 isolate·역할색 육안 확인.
- [X] T010 빌드·재기동·동기화 — 커밋(내 파일만, 신원 ahnchiyoon87) → push → 서브모듈 ff → architect bump → `build-desktop-frontend.mjs` → dev-desktop.ps1 -Stop → -SkipBuild 재기동. 메모리(todo.md) 갱신.

---

## Dependencies

- T001 → (T002, T003, T004 / T005, T006) → T007 → T008 → T009 → T010.
- US1(T002~T004)과 US2(T005~T006)는 같은 케이스 규약 변경의 양면 — **함께 적용해야** 일관(US1만 하고 US2 안 하면 색 렌즈가 깨짐 = 회귀). 따라서 한 커밋 단위로 구현.

## Parallel Opportunities

- T002·T003(graphCanvas.ts)는 같은 파일이라 순차. T005(nodeLabels.ts)는 다른 파일이라 [P] 가능하나, 양면 동시적용 원칙상 같은 변경 세션에서 진행.

## MVP Scope

US1+US2 를 함께 = 최소이자 완결 단위(케이스 규약 통일은 분리 불가). 검증(T009)까지가 완료 기준.

## 변경 경계 (회귀 방지)

- 수정: `graphCanvas.ts`(toggleLabelLoad·rebuildPanelLoad), `nodeLabels.ts`(colorLabelOf).
- 무수정: `isolateLabel`, `loadNodesByLabels`, `toggleRelLoad`/`loadedRelTypes`, analyzer/catalog/계약.
