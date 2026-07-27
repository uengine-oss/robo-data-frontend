# MultiLayer Ontology viewer reconstruction

## Result

- `MultiLayerOntologyViewer.vue`에서 single-node datasource/sample, generation, library/header/delete와
  operation notice presentation을 이름 있는 component로 이동했다.
- generation은 dialog lifecycle, document/PDF/glossary form, pipeline/log progress, terminal/error
  outcome으로 분리했다.
- 각 화면의 style blocks도 parent SCSS에서 실제 owner stylesheet로 이동했다.
- Behavior model read, Measure→ObjectType creation, ontology persistence는 workflow composable이
  abort/stale target, exact retry, partial refresh warning, request payload와 response ID validation을
  소유한다. Viewer는 backend API client를 직접 import하지 않는다.

## Preserved contracts

- datasource natural-language/manual/ObjectType execution-source selection, sample states와 exact confirm retry
- library list/load/rename/delete retry와 rename focus
- PDF picker/remove, glossary selection/retry, generation progress/log disclosure, cancel/error/edit/retry/finish
- ontology save payload positions, response schema ID, Measure ObjectType 후속 node-data refresh warning
- 기존 header layout/save/What-if intents와 dark/light/mobile selectors

## Verification policy

- 큰 재건설 배치 뒤 `vue-tsc --noEmit`, 458-source architecture contract, 41개 static/unit
  contract, 4,964-module production build와 2,759,761-byte remote boundary가 통과했다.
- 실제 backend·실데이터 E2E는 사용자 지시에 따라 수행하지 않는다. backend 원문의 endpoint
  request/response/error/event 계약만 frontend client/parser와 정적으로 대조한다.
