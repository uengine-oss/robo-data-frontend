# Ontology graph context menu presentation 배치

## 구현 결과

- `MultiLayerOntologyViewer`에 중첩돼 있던 canvas·node·relationship context menu markup과
  dark/light skin을 `ui/canvas/OntologyGraphContextMenu.vue`로 이동했다.
- 새 경계는 mode, 좌표, layer presentation, node/relationship label만 입력받고 add/relation/filter/
  What-If/rename/delete/edit event만 반환한다.
- graph position, Cytoscape, local graph mutation/history, filter, What-If와 delete confirmation은
  부모가 계속 소유한다. API/store/fallback/shim은 추가하지 않았다.
- 직접 캡처에서 하단 canvas 우클릭 메뉴가 viewport 아래로 잘려 header만 보이던 기존 결함을 발견했다.
  메뉴가 렌더된 뒤 실제 `offsetWidth/offsetHeight`와 offset parent 크기로 x/y를 clamp해 전체 항목을
  같은 graph panel 내부에 유지한다.

## 검증

- `check-architecture.mjs`: 429 TypeScript/Vue 소스 통과.
  - 부모의 inline context menu markup 재유입 차단
  - 자식의 API/Cytoscape/graph mutation 의존 차단
  - native menu/menuitem, explicit emits와 실제 크기 clamp 고정
- `npm.cmd run type-check -- --pretty false`: 통과.
- `verify-ontology-observability-ui.mjs`: 전체 Ontology 회귀 통과.
  - canvas menu Process/Measure 생성
  - node menu relation/filter/What-If/rename/delete
  - relationship edit/delete와 local undo/redo
  - menu geometry가 viewport 네 변 안에 존재
  - 기존 API/session/error/exact retry 및 page error 0
- `npm.cmd run build`: 통과, 4,891 modules transformed.
- `check-build-boundaries.mjs`: 통과. remote asset 2,759,761 bytes이며
  UploadTab/GraphTab/Cytoscape runtime은 entry에서 제외된다.

## 직접 검사

`ontology-canvas-context-menu-1920x1080.png`에서 오른쪽 아래 menu가 graph panel 안에 완전히
표시되고 KPI·Measure·Process·Driver·Resource 다섯 항목과 색상 dot, header, border/shadow가
잘리지 않는 것을 확인했다.
