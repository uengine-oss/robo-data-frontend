# Ontology node Behavior/BPMN presentation 배치

- `OntologyNodeBehaviorPanel.vue`가 loading/error/retry와 Agents.md editor composition을 소유하고
  retry/refresh intent만 반환한다.
- `OntologyNodeBpmnPanel.vue`가 viewer/empty 상태를 소유하고 saved XML만 반환한다.
- `nodeBehaviorPresentation.ts`가 parent/editor/panel의 공유 model shape를 단일화한다.
- 부모는 abort sequence, frozen retry target, selected schema/node, API read와 XML mutation을 유지한다.

검증:

- architecture 438 sources, type-check 통과.
- 전체 Ontology browser 통과: Behavior failure/exact retry/last-valid 보존, Agents editor refresh,
  tab keyboard와 lazy workflow loading, BPMN 경계 포함 page error 0.
- 잘못된 BPMN 상대 import가 Vite lazy import를 끊는 반대 사례를 production build로 검출했고
  domain public entry import로 교정했다.
- production build 및 lazy remote 2,759,761 bytes 통과.
