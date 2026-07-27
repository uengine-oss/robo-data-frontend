# Ontology node-data chart runtime 배치

- `useOntologyNodeDataChart.ts`가 ECharts host/instance, delayed render, dispose/resize,
  theme rerender와 causal brush event bridge를 소유한다.
- viewer는 validated node-data/causal refs와 selection callback을 주입하고 chart UI의 host/activate
  intent만 연결한다. API, Cytoscape와 analysis request는 chart runtime에 들어가지 않는다.
- `MultiLayerOntologyViewer.vue`는 ECharts import/instance/watch를 제거해 4,631줄에서
  4,485줄로 축소됐다.

검증:

- `test-ontology-node-data-chart.mjs`: fake chart와 managed scheduler로 render, ready,
  brush activation/selection, resize, theme rerender disposal, table result disposal과 scope cleanup 통과.
- architecture 446 sources, type-check 통과.
- 전체 Ontology browser 통과: latest node data, 실제 ECharts chart/table, causal brush,
  partial/cancel/retry/streamed result와 page error 0.
- 첫 browser 시도에서는 이전 HMR module graph의 Vite overlay가 남아 있었으나 동일 소스의
  production build는 통과했다. 3000번 frontend Vite process만 재시작한 뒤 전체 검증이 통과해
  코드/runtime 오류와 개발 서버 stale state를 구분했다.
- `ontology-node-data-race-1920x1080.png`의 chart/table과 causal lifecycle 화면을 재확인했다.
- production build 및 lazy remote 2,759,761 bytes 통과.
