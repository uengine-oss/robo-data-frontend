# Ontology node Data chart/table presentation 배치

- `OntologyNodeDataChart.vue`: chart header, host mount/unmount event, brush control, analysis config와
  selection 기반 config reveal.
- `OntologyNodeDataTable.vue`: column type mark, 기존 null/number/date formatting과 first-50 boundary.
- 부모는 ECharts init/dispose·render, brush extraction, causal lifecycle과 API 상태를 유지한다.
- `MultiLayerOntologyViewer.vue`는 5,218줄에서 4,783줄로 축소됐다.

검증:

- architecture 443 sources, type-check 통과.
- 전체 Ontology browser 통과: data race/retry/fallback, business-day data, Measure ObjectType,
  causal lifecycle, tab keyboard와 page error 0.
- `ontology-node-data-race-1920x1080.png` 직접 검사: chart와 raw table이 detail panel 안에서
  기존 결과·간격·행 표시를 유지하고 overflow를 만들지 않는다.
- production build 및 lazy remote 2,759,761 bytes 통과.
- preceding run에서 document-generation disclosure와 canvas Measure menu에 각각 비결정적
  timeout이 한 번 관찰됐으며, 코드 변경 없이 재실행한 전체 검증은 통과했다. 최종 verifier
  안정성 감사에서 timing 의존성을 별도 점검한다.
