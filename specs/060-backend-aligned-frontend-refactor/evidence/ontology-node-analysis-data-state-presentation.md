# Ontology node Analysis/Data state presentation 배치

- `OntologyNodeAnalysisPanel.vue`: result header, metric control, idle 안내와 Causal panel composition.
- `OntologyNodeDataState.vue`: loading, no-source/read-failure, retry/Text2SQL fallback/connect/ObjectType actions.
- `OntologyNodeDataSummary.vue`: source/row/business-day 표시와 controlled toggle.
- 부모는 API target/retry/fallback, ECharts/brush, causal run/cancel/recalc와 data reload를 유지한다.

검증:

- architecture 441 sources, type-check 통과.
- 전체 Ontology browser 통과: data race/retry/fallback, Measure ObjectType, business-day data,
  causal partial warning/cancel/failure/exact retry/streamed result, tab keyboard와 page error 0.
- `ontology-causal-analysis-lifecycle-1920x1080.png` 직접 검사: result header/control/report가 기존
  detail 폭 안에서 정렬되고 canvas/document overflow를 만들지 않는다.
- production build 및 lazy remote 2,759,761 bytes 통과.
