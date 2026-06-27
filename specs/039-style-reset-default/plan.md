# Plan: 스타일 기본값 되돌리기
**Branch**: main | **Spec**: [spec.md](./spec.md)
## Summary
GraphStylePanel.vue 에 removeStyle 배선 + 버튼. 저장소 removeStyle(→saveStyles→bumpVersion) 재사용, 신규 저장로직 0.
## Structure
src/features/code-analysis/components/graph/GraphStylePanel.vue  # import removeStyle, handleReset(), 버튼(커스텀 있을 때만)
## 회귀
신규 저장경로 0. 기존 setColor/setSize 불변. 버튼은 커스텀 있을 때만.
