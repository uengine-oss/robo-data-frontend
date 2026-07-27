# Ontology graph overlay presentation 배치

## 구현 결과

- `MultiLayerOntologyViewer`의 관계 생성 대기 banner, 연결 모드 toolbar와 graph legend markup/skin을
  `ui/canvas/OntologyGraphOverlay.vue`로 이동했다.
- overlay는 pending source name, relation-mode active/disabled와 layer presentation만 입력받고
  cancel/toggle event만 반환한다.
- pending source id, selected node, edgehandles, Cytoscape, relation draft와 local graph mutation은
  부모가 계속 소유한다.
- 연결 모드 button은 현재 action label과 `aria-pressed`, 대기 banner는 `role=status`와 이름 있는
  cancel, legend는 이름 있는 group을 제공한다.

## 실물 검사에서 교정한 결함

- 모바일 전환 시 기존 full-width detail panel이 canvas, pending banner와 target을 가려 관계 생성을
  진행할 수 없었다.
- 관계 대기 진입 시 기존 selection을 snapshot하고 정상 `deselectNode()` lifecycle로 detail을 닫는다.
  취소 또는 target 선택 뒤 유효한 selection은 `selectNode()`로 복원해 기존 결과 확인 흐름을 유지한다.
- mobile layer panel의 기존 node target 선택 경로는 접거나 제거하지 않았다. banner만 layer overlay보다
  높은 stacking layer에 두고 8px inset, wrapping, viewport containment를 적용했다.

## 검증

- `check-architecture.mjs`: 430 TypeScript/Vue 소스 통과.
  - 부모 inline overlay markup 재유입 차단
  - 자식의 API/Cytoscape/graph state 의존 차단
  - status/group/pressed semantics, snapshot+deselect+restore와 mobile containment 고정
- `verify-ontology-observability-ui.mjs`: 전체 Ontology 회귀 통과.
  - 연결 모드 off→on→off와 `aria-pressed`
  - KPI/Measure/Process/Driver/Resource 및 CAUSES/MEASURED_AS/PRODUCES legend
  - source 이름이 있는 pending 상태, cancel 후 detail selection 복원
  - layer-list target을 통한 기존 relation draft cancel/commit과 즉시 결과 표시
  - 390×844 document overflow 0, banner viewport containment와 topmost stacking
  - 기존 API/session/error/exact retry와 page error 0
- `npm.cmd run build`: type-check 포함 통과, 4,894 modules transformed.
- `check-build-boundaries.mjs`: 통과. remote asset 2,759,761 bytes이며
  UploadTab/GraphTab/Cytoscape runtime은 entry에서 제외된다.

## 직접 검사

- `ontology-graph-overlay-pending-1920x1080.png`: source identity, cancel, graph legend와 canvas가
  겹치지 않는다.
- `ontology-graph-overlay-pending-390x844.png`: banner가 layer panel 위에서 온전히 보이고 기존
  layer-list target은 그대로 유지된다.
