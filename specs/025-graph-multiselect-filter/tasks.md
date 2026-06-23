# Tasks: 그래프 다중선택 필터 + 노드패널 트리거 + 스타일

**Feature**: 025-graph-multiselect-filter | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

핵심 사실: **NvlGraph 필터 엔진은 이미 다중 whitelist 지원**(matchesLabelFilter·matchesRelFilter). GraphTab 토글만 단일 → 정합.

## Phase 1: Setup / 조사 보완
- [ ] T001 `graphCanvas.ts` `loadNodesByLabels` 시그니처·동작 확인 — 다중 라벨 누적 로드 가능한지(아니면 보완).
- [ ] T002 현재 필터▾ UI(GraphTab)·레전드(activeFilters)·NodeDetailPanel 관계 통계 칩 렌더 위치 확인.

## Phase 2: US1 노드 라벨 다중선택 (P1)
- [ ] T003 [US1] `GraphTab.handleLabelFilter`를 단일 덮어쓰기 → **Set 토글 누적**(legacy 로직 현재 구조에 맞게). `labelFilters` 누적, 캔버스는 `loadNodesByLabels(labelFilters)` 전체 로드. 빈 선택 = clearCanvas(Assumptions).
- [ ] T004 [US1] 레전드/오버뷰 칩 `isFilterActive`(active 표시)를 다중 반영(`labelFilters.includes(label)`).
- [ ] T005 [US1] `loadNodesByLabels` 다중 라벨 누적 보완(T001 결과 따라).

## Phase 3: US2 관계 타입 다중선택 whitelist (P1)
- [ ] T006 [US2] `GraphTab`에 관계 whitelist 토글 핸들러 — `relFilter`(NvlGraph 이미 소비) Set 토글. 빈 = 전체.
- [ ] T007 [US2] 필터▾ UI를 `relFilter`(whitelist) 중심으로 정합 — 기존 `hiddenRelTypes`(blacklist)와 충돌 없이(supersede 또는 내부 통합). 노드+관계 동시 = 교집합 동작 확인.

## Phase 4: US3 노드패널 칩 트리거 (P2)
- [ ] T008 [US3] `NodeDetailPanel` 관계 통계 칩 **좌클릭 → `relationship-filter` emit 신규**(우클릭 스타일 `relationship-type-select`는 유지). 레이블 칩은 기존 `label-filter` 활용.
- [ ] T009 [US3] `GraphTab`이 `label-filter`·`relationship-filter` emit을 **다중 토글**로 처리(US1·US2 상태에 반영). 칩 active 상태 다중 표시.

## Phase 5: US4 스타일 연결 (P3)
- [ ] T010 [US4] `GraphStylePanel`(우클릭 → node/relationship-type-select → 색·선두께)·`graphStyleStorage` 재사용 확인 — 신규 구현 0, 다중선택과 공존 확인.

## Phase 6: 검증 + 커밋
- [ ] T011 심볼 전수 grep — `labelFilters`/`relFilter`/`hiddenRelTypes`/`label-filter`/`relationship-filter` 전 호출부 정합, dangling 0.
- [ ] T012 타입체크(vue-tsc) 변경 파일 에러 0.
- [ ] T013 풀스택 Playwright 라이브 — ①라벨 2개+ 동시 표시(SC-001) ②관계 whitelist 2개+(SC-002) ③노드패널 칩↔필터 양방향(SC-003) ④색·선두께 변경+영속(SC-004) ⑤전 보기모드·기존 단일필터 회귀 0(SC-005). 스샷 Read 확인.
- [ ] T014 커밋·푸시(frontend main) + spec 025 박제 + architect 서브모듈 포인터 bump(코드 변경이므로).

## Dependencies
- US1·US2 독립(라벨/관계 각각). US3는 US1·US2 상태에 연결. US4는 기존 재사용(거의 독립).
- NvlGraph 필터 엔진 불변이 전제(이미 다중) — 변경 시 회귀 위험.

## MVP
US1(노드 라벨 다중) — legacy 회복의 핵심. US2~4 증분.
