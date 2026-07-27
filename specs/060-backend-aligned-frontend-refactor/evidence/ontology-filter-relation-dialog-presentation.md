# Ontology filter/relation draft dialog presentation 배치

- `OntologyNodeFilterDialog.vue`: controlled filter draft, distinct retry, clear/confirm/cancel,
  cascading/conflict와 unsupported backend-contract presentation.
- `OntologyNewRelationDialog.vue`: controlled relationship type/description와 confirm/cancel presentation.
- 두 자식은 공용 `useDialogFocusLifecycle`로 label, initial focus, Tab wrap, Escape와 trigger focus
  복귀를 소유하며 API/Cytoscape/graph state는 소유하지 않는다.
- 부모는 filter propagation·single node-data reload, graph history·draft edge·Cytoscape commit을
  유지하고 4,783줄에서 4,631줄로 축소됐다.
- dark/light/mobile style은 각 scoped component가 소유하며 monolithic parent SCSS의 filter bar,
  cascading/filter dialog와 relationship draft stale selector는 제거됐다.

검증:

- architecture 445 sources, type-check 통과.
- 전체 Ontology browser 통과: filter cancel/distinct retry/single commit reload/clear/disabled
  range 계약, relationship cancel/commit/undo/redo와 no page error.
- 최초 browser run에서 close button의 접근성 이름이 기존 `/관계 생성/` action selector와
  겹치는 문제를 발견해 `관계 초안 취소`로 명확히 구분한 뒤 전체 검증을 다시 통과했다.
- `ontology-node-filter-390x844.png` 직접 검사: modal이 viewport 안에 유지되고 필드·disabled
  계약 안내·footer가 겹치지 않는다.
- `ontology-new-relation-dialog-1920x1080.png` 직접 검사: source/target preview, type/description,
  footer가 기존 canvas 위에서 비중첩으로 유지된다.
- production build 및 lazy remote 2,759,761 bytes 통과.
