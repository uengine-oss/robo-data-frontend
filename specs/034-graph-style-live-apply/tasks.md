# Tasks: 그래프 스타일 변경 즉시 반영 (회귀 복원)

**Feature**: [spec.md](./spec.md) · **변경**: `src/features/code-analysis/components/graph/NvlGraph.vue`

- [x] T001 NVL API 확인: `updateElementsInGraph`가 제공 속성만 갱신·위치 보존(base/dist/types/index.d.ts:108-109). 기존 `updateAllStyles`/`updateNodeStyles`/`updateRelationshipStyles`가 이미 색·크기/두께 부분갱신 수행 확인.
- [x] T002 회귀 원인 확정: NvlGraph가 `storageVersion` 미구독, 부모(GraphTab)도 `updateAllStyles` 미호출(통계/범례만 storageVersion 재계산) → 캔버스 미반영.
- [x] T003 `NvlGraph.vue`: `storageVersion` import + `watch(storageVersion, () => updateAllStyles())` 추가(colorMode watch 옆).
- [x] T004 `npx vue-tsc --noEmit` → NvlGraph.vue **새 에러 0**(기존 'computed' 미사용 1건은 본 변경 무관·세션초 존재).
- [ ] T005 [P] 앱 라이브: 스타일 패널서 노드 색 변경 → 캔버스 색 즉시 변경·**위치 불변** 확인. 관계 색/두께도. (라이브 미검증→앱 확인)

## MVP
- T003 = watch 1줄로 회귀 복원.
