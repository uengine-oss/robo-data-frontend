# Plan: 역할 렌즈 색
**Branch**: main | **Spec**: [spec.md](./spec.md)
## Summary
nodeLabels.ts 에 colorLabelOf(labels, isolatedRoles) — isolate된 역할 있으면 그 역할, 없으면 kindOf. NvlGraph 가 isolatedLabels prop 받아 노드 색=getNodeColor([colorLabelOf]). isolate 변경 시 색 부분갱신. NodeDetailBase 배지도 동일.
## 근본/유지보수
- 색 라벨 선택 단일 헬퍼(colorLabelOf) — 캔버스·배지 공유(DRY). getNodeColor/distinctColor 알고리즘 불변.
- 기본(미isolate)=종류색 그대로(회귀0). 렌즈는 isolate일 때만.
## Structure
src/shared/utils/nodeLabels.ts        # colorLabelOf
src/features/code-analysis/components/graph/NvlGraph.vue   # isolatedLabels prop + 색 + recolor watch
src/features/code-analysis/components/graph/GraphTab.vue   # :isolatedLabels=activeNodeLoads
src/features/code-analysis/components/graph/node-detail/NodeDetailBase.vue  # 배지 렌즈
