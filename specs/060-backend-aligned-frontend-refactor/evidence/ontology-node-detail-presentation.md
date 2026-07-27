# Ontology node detail navigation/info presentation 배치

- `OntologyNodeDetailHeader.vue`: delete/close와 capability-driven info/data/analysis/Behavior/BPMN
  tabs를 소유한다. tablist/tab/tabpanel identity, selected/disabled/busy, roving tabindex와
  좌우/Home/End keyboard를 제공한다.
- `OntologyNodeInfo.vue`: controlled name edit, layer selector, filter chips, datasource와 relationship
  presentation을 소유한다. 편집 진입 시 input focus/select만 UI에서 처리한다.
- 부모는 data fetch, analysis/Behavior/BPMN transition, rename/layer history·Cytoscape mutation,
  datasource dialog와 relation editor lifecycle을 계속 소유한다.

검증:

- architecture 435 sources, type-check 통과.
- 전체 Ontology browser 통과: tab capability/keyboard, Behavior failure/retry, name Enter/blur/Escape,
  layer keyboard state, filter/datasource/relation edit·delete/undo, desktop/mobile geometry.
- `ontology-node-filter-lifecycle-1920x1080.png` 직접 검사: header/tabs와 info content 정렬·색·폭 유지.
- production build 및 lazy remote 2,759,761 bytes 통과.
