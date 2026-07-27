# Ontology relation detail presentation 배치

## 구현 결과

- relation endpoint preview, type/description controlled form, source/target column 상태와
  retry/error/action을 `ui/canvas/OntologyRelationDetail.vue`로 이동했다.
- 반복되는 source/target lifecycle 표현은 `ui/canvas/RelationColumnField.vue`가
  `no_datasource/loading/error/ready`를 명시적으로 구분한다.
- 부모의 `useOntologyRelationEditor`가 relation identity, abort/stale column load, validation,
  history checkpoint, local relationship mutation과 Cytoscape update를 계속 소유한다.
- 자식은 field update를 먼저 반환한 뒤 select/column change에서 save intent를 내고,
  description blur/Enter에서 save intent를 내는 기존 commit timing을 보존한다.
- datasource 연결, 같은 관계 column retry, delete와 close는 대상/intent event만 반환한다.

## 검증

- `check-architecture.mjs`: 433 TypeScript/Vue source 통과.
  - 부모의 inline relation detail 재유입 차단
  - 자식의 API/Cytoscape/history/local mutation 소유 차단
  - controlled update/save와 네 column lifecycle 상태 고정
- type-check 통과.
- `verify-ontology-observability-ui.mjs`: 전체 Ontology 회귀 통과.
  - keyboard relation edit 진입과 controlled type 저장
  - endpoint column failure와 validation error의 분리
  - 같은 관계 column retry 뒤 editor/selection 유지
  - datasource 연결, relation delete confirmation, cancel focus 복원, delete/undo 결과
  - 390×844 panel viewport containment와 가로 overflow 없음
- `npm.cmd run build`: production build 통과.
- `check-build-boundaries.mjs`: 통과. remote asset 2,759,761 bytes이며
  UploadTab/GraphTab/Cytoscape runtime은 entry에서 제외됐다.

## 직접 검사

- `ontology-relation-column-retry-390x844.png`: header action, endpoint preview, form과 field mapping이
  기존 순서·폭을 유지하며 화면 밖으로 잘리거나 document 가로 overflow를 만들지 않는다.
