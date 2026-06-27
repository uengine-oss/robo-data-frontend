# Tasks: 노드 타입 필터

- [ ] T001 graphVisibility: HIDDEN_NODE_LABELS += 'DEFINE'.
- [ ] T002 GraphTab: createTypeFilter() 팩토리 + relFilter/nodeFilter. 기존 hiddenRelTypes/toggleRelTypeHidden/isRelTypeShown/hiddenRelCount → relFilter.* 이관(회귀0).
- [ ] T003 GraphTab: nodeTypeList(canvasGraphData.nodes 라벨) computed. NvlGraph에 :hiddenNodeTypes 전달.
- [ ] T004 NvlGraph: hiddenNodeTypes prop + matchesNodeFilter(node) + 적용(initNvl 노드루프·증분·watch).
- [ ] T005 필터 ▾ 메뉴: 숨김토글 / 노드 영역(nodeTypeList) / 관계 영역(relTypeList) 구분.
- [ ] T006 vue-tsc 0 + vite+PW: 노드 끄기→노드·관계 사라짐·켜기 복원, 관계필터 회귀0, DEFINE 기본숨김, 기본뷰 불변.
