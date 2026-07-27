# Modeling dialog lifecycle 배치

## 구현 결과

- shared `ActionDialog`의 document key listener, Tab trap, trigger 복귀 중복을 제거하고
  `useDialogFocusLifecycle`에 정렬했다. domain mutation/pending/error는 dialog가 계속 소유한다.
- Schema Modeling `CardinalityModal`, `CatalogRelationshipDialog`와 Ontology Modeling
  `EditRelationshipDialog`, ObjectType delete가 같은 focus lifecycle을 사용한다.
- cardinality create 중에는 overlay/Escape/cancel/중복 confirm을 차단한다. 실패는 canvas 뒤쪽 alert만
  남기지 않고 열린 dialog의 `role=alert`에 표시하며 cardinality와 description을 보존한 채 같은 설정으로
  재시도한다.
- ObjectType delete는 확인 input을 초기 focus로 사용하고 pending 중 close를 차단한다. 503 뒤 target과
  확인 name을 보존하고 같은 DELETE body로 재시도한다.
- `ObjectTypeModeler.vue`에서 open 생산자가 0인 rename state, handler, API call, template, style을 모두
  제거했다. 파일은 1,277줄에서 1,084줄로 줄었다.
- shared `CloseButton`은 title과 동일한 `aria-label` 및 native disabled 상태를 전달한다.
- 네 modeling dialog는 이름 있는 dialog/alertdialog, `aria-modal`, `aria-busy`, viewport 제한과 내부
  scroll을 제공한다.

## 실제 사용자 흐름

`verify-modeling-dialog-lifecycle-ui.mjs`는 실제 Vue component harness와 Chromium에서 다음을 확인했다.

- shared action: cancel 초기 focus, mutation pending Escape 차단, 첫 실패 표시, retry 성공, trigger 복귀
- cardinality: 첫 option 초기 focus, `1:N`과 `주문별 고객` 보존, pending Escape 차단, dialog 내부 실패,
  동일 설정 재시도 결과 `cardinality:1:N:주문별 고객`, trigger 복귀
- Ontology relationship: name input 초기 focus, Escape/trigger 복귀, 실제 POST body가
  `Customer.id → Order.customer_id`, `EXACT_MATCH`, `ONE_TO_MANY`, `customer_orders`를 보존
- Catalog relationship: dialog 초기 focus, 마지막 delete에서 첫 close로 Tab 순환, Escape/trigger 복귀
- 390×844에서 dialog containment와 document/body 가로 overflow 0

직접 검사한 `modeling-dialog-lifecycle-390x844.png`는 390×844 원본이며, 2열 cardinality 선택,
세로 connection summary, 내부 scroll, 고정 action 영역이 겹치거나 잘리지 않는다.

`verify-ontology-behavior-editor-ui.mjs`의 실제 full app에서는 다음을 추가 확인했다.

- Customer ObjectType delete input 초기 focus와 Escape trigger 복귀
- 첫 DELETE pending 중 Escape로 target을 폐기하지 않음
- 503 뒤 `Customer` confirmation과 error가 dialog에 유지됨
- 두 DELETE의 `{ confirmName: "Customer" }` body와 `X-LLM-API-Key`가 동일함
- 성공 뒤 ObjectType 목록에서 Customer 제거

## 배치 종료 검사

- `node specs/060-backend-aligned-frontend-refactor/contracts/test-dialog-focus-policy.mjs`
  - first↔last wrap, middle no-wrap, empty/single 경계 통과
- `node specs/060-backend-aligned-frontend-refactor/contracts/check-architecture.mjs`
  - 428개 TypeScript/Vue source 구조 검사 통과
  - dead rename flow 재유입, dialog별 key listener 복제, pending/error 누락 차단
- `node specs/060-backend-aligned-frontend-refactor/contracts/verify-modeling-dialog-lifecycle-ui.mjs`
  - 네 component focus/pending/retry/payload/mobile 계약 통과
- `node specs/060-backend-aligned-frontend-refactor/contracts/verify-ontology-behavior-editor-ui.mjs`
  - 기존 Behavior 전체 흐름과 ObjectType delete 실제 full-app 계약 통과
- `node specs/060-backend-aligned-frontend-refactor/contracts/verify-schema-relationship-ui.mjs`
  - 기존 Catalog/Ontology 관계 경계와 desktop/mobile 회귀 통과
- `npm.cmd run build`
  - `vue-tsc --noEmit` 통과
  - 4,888 modules transformed, production build 통과
- `node specs/060-backend-aligned-frontend-refactor/contracts/check-build-boundaries.mjs`
  - `__federation_expose_Remote-app-Ba2RzhT6.js`
  - 2,760,759 bytes
  - UploadTab, GraphTab, Cytoscape graph runtime가 remote entry에서 제외됨

실제 backend write는 수행하지 않았다. ObjectType DELETE와 Ontology relationship POST는 backend 원문
계약에 맞춘 deterministic browser route로 검증했으며 실서비스 통합 성공으로 표기하지 않는다.
영향 경로가 없는 suite와 전체 회귀는 반복하지 않았다.

보호 대상인 `package.json`, spec 057/059 graph WIP, `panelGraphProjection.ts`와
`src/features/code-analysis/components/graph/*`는 수정하지 않았다.
