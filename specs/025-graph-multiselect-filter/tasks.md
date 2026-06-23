# Tasks: 노드패널 칩 = 캔버스 누적 로드(isolate) + 관계 숨김 필터 + 스타일

**Feature**: 025-graph-multiselect-filter | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

> ⚠️ **정정(SDD)**: 처음 "다중 표시필터(whitelist)" task로 작성됐으나 구현·피드백을 거쳐 **"노드패널 칩 = 캔버스 누적 로드(isolate)"** 로 확정. 아래는 실제 수행한 task(frontend `622b5bb`, 모두 완료).

## Phase 1: 조사
- [x] T001 `graphCanvas.ts` 캔버스 상태(`canvasNodeIds`·`canvasGraphData`·`presetMode`)·`projectStore.nodeMap`/`linkMap` 접근 확인.
- [x] T002 필터▾(`hiddenRelTypes`)·NodeDetailPanel 통계 칩 렌더 위치·emit 확인. `labelFilters`/`relFilter`가 노드패널 분리 후 데드임을 전수조사로 확정.

## Phase 2: canvasStore 노드패널 로드 상태 (US1·US2 핵심)
- [x] T003 `loadedLabels`/`loadedRelTypes`(Set) + `rebuildPanelLoad()`(노드 라벨 노드 ∪ 관계 양끝 노드를 `canvasNodeIds`에 union) 추가.
- [x] T004 `toggleLabelLoad`/`toggleRelLoad`(preset 해제 → Set 토글 → rebuild) + `clearPanelLoad` 추가, store return 노출.

## Phase 3: GraphTab 칩 핸들러 (US1·US2)
- [x] T005 [US1] `handleLabelFilter` → `canvasStore.toggleLabelLoad(label)`(표시필터 labelFilters 사용 중단).
- [x] T006 [US2] 관계 칩 핸들러 → `canvasStore.toggleRelLoad(relType)`(관계+양끝노드).
- [x] T007 노드패널 칩 active = `loadedLabels`/`loadedRelTypes`(storeToRefs + 배열 computed). 표시필터와 분리.

## Phase 4: 필터▾ 관계 숨김 (US3, 별도)
- [x] T008 [US3] 필터▾ = `hiddenRelTypes`(blacklist) 그대로 유지(노드패널 isolate와 분리). 보기▾↔필터▾ 드롭다운 상호 배타(FR-013).

## Phase 5: 스타일 (US4, 재사용)
- [x] T009 [US4] `GraphStylePanel`·`graphStyleStorage` 재사용 — 5단계·헤더색 동기화·width26·active 완화(FR-009~012). 신규 구현 0.

## Phase 6: 검증 + 커밋
- [x] T010 타입체크(vue-tsc) 변경 파일 에러 0.
- [x] T011 로직 검증(실데이터) — SELECT129+TABLE16=145 누적 → +READS 양끝노드 union 149, 토글 해제 102. READS 양끝노드 전부 포함 확인.
- [x] T012 풀스택 Playwright 라이브 — 노드 칩 누적(SELECT·TABLE) + 관계 칩(READS) active, 캔버스 149노드 로드, **"필터 매치 0" 경고 0**(SC-003), pageerror 0.
- [x] T013 커밋·푸시(frontend `622b5bb`) + spec 025 박제 + architect 서브모듈 포인터 bump(`eb0e21b`).
- [ ] T014 (리팩토링 세션) 데드 ref `labelFilters`/`relFilter` 제거 — refactor-estimate 범위, 본 spec 밖.

## Dependencies
- T003·T004(canvasStore) → T005·T006·T007(GraphTab) → T012(검증).
- 필터▾(T008)·스타일(T009)은 독립(기존 재사용).

## MVP
T003~T007 — 노드패널 칩을 캔버스 누적 로드(isolate)로. "선택된 것만 보여주기"의 핵심.
