# Ontology layer panel presentation 배치

## 구현 결과

- `MultiLayerOntologyViewer`의 layer panel header/toggle, layer disclosure와 node action list
  markup/skin을 `ui/canvas/OntologyLayerPanel.vue`로 이동했다.
- 부모는 canonical layer/node를 기존 순서대로 presentation group으로 투영하고 panel/layer
  collapsed state, selection, context target과 Cytoscape orchestration을 계속 소유한다.
- 자식은 collapsed/groups/selected identity만 입력받고 panel toggle, layer toggle, node activate,
  node context event만 반환한다. API, Cytoscape, graph mutation에는 접근하지 않는다.
- layer disclosure는 고유한 encoded `aria-controls`와 `aria-expanded`, panel toggle은 현재
  expanded state와 이름 있는 native button을 유지한다.

## 검증

- `check-architecture.mjs`: 431 TypeScript/Vue source 통과.
  - 부모의 이전 inline layer panel 소유 차단
  - 자식의 API/Cytoscape/graph mutation 의존 차단
  - parent projection/event boundary와 disclosure identity 고정
- `verify-ontology-observability-ui.mjs`: 전체 Ontology 회귀 통과.
  - 이름 있는 panel button으로 collapse/reopen
  - `aria-expanded=false`, collapsed class와 node list 비노출
  - 재개방 뒤 기존 layer/node action과 graph 결과 유지
  - CSS transition 완료와 Cytoscape canvas/container width 일치를 실제 geometry로 대기
- type-check 통과.
- `npm.cmd run build`: production build 통과.
- `check-build-boundaries.mjs`: 통과. remote asset 2,759,761 bytes이며
  UploadTab/GraphTab/Cytoscape runtime은 entry에서 제외됐다.

## 직접 검사

- `ontology-layer-panel-collapsed-1920x1080.png`: panel이 44px collapsed rail로 축소되고 graph가
  남은 폭으로 정상 resize되며 legend와 canvas가 겹치지 않는다.
