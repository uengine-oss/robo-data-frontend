# Tasks
- [ ] T001 nodeLabels.ts: colorLabelOf(labels, isolatedRoles:Set<string,대문자>) = rolesOf 중 isolate된 첫 역할 || kindOf.
- [ ] T002 NvlGraph: isolatedLabels prop. 노드 색 getNodeColor([colorLabelOf(labels, set)]). build·updateNodeStyles 적용.
- [ ] T003 NvlGraph: isolatedLabels watch → 색 부분 재갱신(updateElementsInGraph, 위치보존).
- [ ] T004 GraphTab: :isolatedLabels="activeNodeLoads" 전달.
- [ ] T005 NodeDetailBase: 배지색도 colorLabelOf(canvasStore.loadedLabels) 렌즈.
- [ ] T006 vue-tsc 0 + vite+PW: Query isolate→노드 연두, 기본 종류색, 여러역할 각색, 회귀0.
