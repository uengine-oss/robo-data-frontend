# Implementation Plan: 그래프 스타일 변경 즉시 반영 (회귀 복원)

**Branch**: `034-graph-style-live-apply` | **Date**: 2026-06-27 | **Spec**: [spec.md](./spec.md)

## Summary
NvlGraph가 `graphStyleStorage.storageVersion`을 watch해 스타일 변경 시 **이미 존재하는** `updateAllStyles()`(=`updateNodeStyles`+`updateRelationshipStyles`)를 호출. 두 함수는 NVL `updateElementsInGraph`로 색·크기/두께만 부분 갱신(위치·레이아웃·선택 보존). 끊겼던 트리거만 복원 — 신규 렌더 경로 0.

## Technical Context
TS/Vue/NVL(@neo4j-nvl/base). 변경: `src/features/code-analysis/components/graph/NvlGraph.vue` — `storageVersion` import + `watch(storageVersion, () => updateAllStyles())`. ~2 LOC. Testing: vue-tsc + 앱 라이브(색 변경).

## Constitution Check
I/II/III/IV: 신규 라우트/탭/백엔드콜 0, graph 슬라이스 내부, 기존 함수 재사용. PASS.

## 설계
- `import { storageVersion } from '@/shared/utils/graphStyleStorage'`.
- `watch(storageVersion, () => updateAllStyles())` (colorMode watch 옆).
- `updateAllStyles`는 변경된 요소만 `updateElementsInGraph([{id,color,size}], [{id,color,width}])` → 위치 보존, 불변 no-op.
- NVL API 근거: `updateElementsInGraph` — "Only the properties that are provided will be updated. If an existing property is not provided, it will not be changed."(base/dist/types/index.d.ts:108-109).

## Project Structure
```
specs/034-graph-style-live-apply/{spec,plan,tasks}.md, checklists/requirements.md
src/features/code-analysis/components/graph/NvlGraph.vue
```

## Complexity Tracking
*위반 없음.*
