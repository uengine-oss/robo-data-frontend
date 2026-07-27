# Ontology datasource auto-link presentation 배치

- `OntologyDatasourceMappingDialog.vue`가 progress, node status, mapping stats/list, candidate
  disclosure/detail/sample과 footer presentation을 소유한다.
- pure application projection으로 stats/status/sample formatting을 단일화하고 close/retry,
  mapping/candidate toggle, preview, single/bulk confirm intent만 반환한다.
- SSE/abort, exact retry target, single/bulk confirmation과 canvas mapping commit은 기존
  `useOntologyDatasourceMapping`/viewer에 유지한다.
- nested bulk `ActionDialog`가 열릴 때 background dialog의 focus lifecycle을 suspend한다.
- dark/light/mobile style을 scoped stylesheet로 이동하고 parent의 stale auto-link selector를 제거했다.

검증:

- parent viewer 4,485 → 4,212 lines, parent SCSS 6,387 → 5,662 lines.
- architecture 447 sources, type-check 통과.
- 전체 Ontology browser 통과: auto-link failure/exact retry, keyboard mapping/candidate disclosure,
  sample preview, single confirmation exact retry, bulk Escape/partial success/failed-only retry와
  390×844 containment.
- `ontology-datasource-auto-link-failure-1920x1080.png` 직접 검사: error/stat/footer가 dialog
  안에서 겹치지 않고 기존 canvas 결과를 유지한다.
- `ontology-datasource-bulk-partial-failure-1920x1080.png` 직접 검사: nested action dialog와
  background mapping dialog가 올바른 modal 순서로 유지된다.
- production build 및 lazy remote 2,759,761 bytes 통과.
