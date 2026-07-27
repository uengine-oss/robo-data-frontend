# Ontology canvas latest-task lifecycle 배치

## 구현 결과

- backend 지식이 없는 `useLatestTaskScope.ts`가 이름 있는 task replacement, canvas generation,
  stale callback 거부와 일괄 정리만 소유한다.
- `MultiLayerOntologyViewer.vue`의 zero-size init retry, 저장 selection 복원, detail panel viewport
  동기화, edgehandles zoom 복원, schema loading 종료를 각각 `canvas-init`, `selection-restore`,
  `canvas-viewport-sync`, `edgehandles-zoom-restore`, `schema-loading-settle`로 고정했다.
- schema projection commit과 외부 canvas destroy는 이전 generation의 모든 timer를 취소한다.
  component dispose도 scope를 정리하며, stale `layoutstop`은 새 selection timer를 만들 수 없다.
- edgehandles callback은 drag 시작 당시 canvas identity와 generation이 모두 현재일 때만 zoom을
  복원한다.
- detail panel open/close/resize는 Vue DOM 반영 뒤 같은 이름의 task로 coalesce한다. 현재 zoom을
  유지한 채 Cytoscape가 실제 container 크기를 다시 읽고, 선택 node 또는 전체 node를 새 가용 폭의
  중앙에 둔다.

## 실제 사용자 흐름

`verify-ontology-canvas-task-lifecycle-ui.mjs`는 실제 full app과 Chromium 1280×720에서 다음을 확인했다.

- 저장 selection이 있는 schema A를 연 직후 schema B로 전환해도 B node만 렌더되고 선택됨
- A의 지연 callback이 B의 selection/loading/viewport를 변경하지 않음
- 두 schema activation 요청과 최종 B detail panel 결과 유지
- graph panel과 detail panel의 실제 bounding box 겹침 0, graph 가용 폭 320px 이상
- page error와 console error 0

직접 검사한 `ontology-canvas-latest-task-1280x720.png`에서 선택된 B node가 축소된 graph panel의
중앙에 완전히 표시되고 우측 detail panel 아래로 잘리지 않는 것을 확인했다.

## 배치 종료 검사

- `node specs/060-backend-aligned-frontend-refactor/contracts/test-latest-task-scope.mjs`
  - named replacement, begin/clear invalidation, stale schedule/guard 거부 통과
- `node specs/060-backend-aligned-frontend-refactor/contracts/check-architecture.mjs`
  - 428개 TypeScript/Vue source 구조 검사 통과
- `node specs/060-backend-aligned-frontend-refactor/contracts/verify-ontology-canvas-task-lifecycle-ui.mjs`
  - rapid A→B, selection, loading, panel geometry 실제 브라우저 계약 통과
- `npm.cmd run build`
  - `vue-tsc --noEmit` 통과
  - 4,888 modules transformed, production build 통과
- `node specs/060-backend-aligned-frontend-refactor/contracts/check-build-boundaries.mjs`
  - `__federation_expose_Remote-app-CPANdZ0T.js`
  - 2,756,042 bytes
  - UploadTab, GraphTab, Cytoscape graph runtime가 remote entry에서 제외됨

실제 backend write는 수행하지 않았다. schema 목록·상세·activation과 scheduler 응답은 backend 원문
계약에 맞춘 deterministic browser route로 검증했으며 실서비스 통합 성공으로 표기하지 않는다.
영향 경로가 없는 기존 suite와 전체 회귀는 반복하지 않았다.

보호 대상인 `package.json`, spec 057/059 graph WIP, `panelGraphProjection.ts`와
`src/features/code-analysis/components/graph/*`는 수정하지 않았다.
