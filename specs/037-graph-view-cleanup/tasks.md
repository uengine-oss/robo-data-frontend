# Tasks: 그래프 뷰 정리

- [ ] T001 GraphTab.vue `handleResetGraph` — `canvasStore.clearPanelLoad()` 추가(선택 해제 후). 주석/버튼 title 정합("필터 active도 해제").
- [ ] T002 analyzer.ts `HIDDEN_LINK_TYPES` — 'INIT_BY' 추가. 주석에 INIT_BY 포함.
- [ ] T003 nodeRelationships.ts `EXCLUDED_RELS` — 'INIT_BY' 추가(REFERENCES와 동일 부류).
- [ ] T004 vue-tsc 변경파일 0.
- [ ] T005 앱/playwright — 캔버스 비우기 후 칩 active 0 · INIT_BY/REFERENCES 미표시 확인.
- [ ] T006 analyzer.ts `HIDDEN_NODE_LABELS` — 'GLOBAL_VARIABLE' 추가(노드+연결링크 숨김, 데이터 보존).

## 확장 (숨김 토글 + 아이콘)
- [ ] T007 analyzer store: `showHidden` ref + 반환. graphData가 showHidden 시 전부 노출(+semanticLinkMap 병합). 적재 drop 제거(updateGraphData·mergeStreamRelationship), 데드 `isHiddenLink` 제거.
- [ ] T008 navigator: `isExcluded`·`buildChildIndexes`가 `useAnalyzerStore().showHidden` 존중 — 변수도 트리에.
- [ ] T009 GraphTab `필터 ▾` 메뉴: 섹션 B "숨김 요소 표시" 토글(showHidden) + 구분선 + 섹션 A(기존 관계 끄고/켜기). toggleShowHidden.
- [ ] T010 보기/필터 버튼 아이콘 이모지→SVG(대칭 viewBox), `.vm-eye` width/height. 세로 중앙정렬 근본수정.
- [ ] T011 검증: 토글 ON→그래프 149→300노드·INIT_BY/REFERENCES/GLOBAL 등장·네비 변수 44건, OFF 원복. 캔버스비우기 active 해제. 눈아이콘 중앙정렬(스샷). vue-tsc 0.
