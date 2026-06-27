# Plan: 노드 타입 필터 + 영역구분 + DEFINE 기본숨김

**Branch**: main | **Spec**: [spec.md](./spec.md)

## Summary
관계 필터(hiddenRelTypes) 토글 기계를 공통 팩토리 createTypeFilter()로 추출해 노드·관계 둘 다 공유(DRY, 중복0). NvlGraph에 hiddenNodeTypes prop + matchesNodeFilter 추가(노드 안 그리면 visibleIds서 빠져 관계 자동 제외). 필터 ▾ 메뉴 = 숨김토글 + 노드영역 + 관계영역. DEFINE을 graphVisibility.HIDDEN_NODE_LABELS에 추가.

## 근본/유지보수
- 노드 필터를 관계 필터 복붙(덧대우기) 금지 → createTypeFilter 단일 팩토리로 양 축. 로직 안 늘림(구조 정리).
- 표시 필터는 렌더 단계만(데이터 보존). 기존 matchesRelFilter 지점에 matchesNodeFilter 동반.

## Constitution/회귀
- 관계 필터 이관 후 동작 동일(회귀0 검증). 노드 필터·DEFINE은 show-all일 때만/렌더단계라 기본뷰 외 영향 격리.

## Structure
```
src/shared/utils/graphVisibility.ts        # HIDDEN_NODE_LABELS += DEFINE
src/features/code-analysis/components/graph/GraphTab.vue   # createTypeFilter, nodeFilter/relFilter, nodeTypeList, 메뉴
src/features/code-analysis/components/graph/NvlGraph.vue   # hiddenNodeTypes + matchesNodeFilter
```
