# Modeling source action ownership evidence

## 교정한 책임

- Schema Canvas catalog search/tree row는 drag layout만 소유한다. row 안의 primary native button이
  off-canvas table add 또는 on-canvas table selection을 소유하고, target-labelled remove button은
  형제 control로 분리했다.
- semantic search result도 drag JSON을 유지하면서 전체 primary button이 add/selection을 소유하고
  similarity badge와 항상 보이는 add/selected marker를 함께 표시한다.
- ObjectType Modeler card는 drag wrapper를 유지하고 add, Behavior, edit, delete를 이름 있는 sibling
  buttons로 제공한다. mouse-only double-click과 hover-only action reveal을 제거했다.
- ObjectType action 4개를 항상 표시하면서 한 줄 폭이 부족해진 실물 결함을 발견했다. card를
  `36px / minmax(0,1fr) / auto` 정보 행과 전체 action 행을 가진 grid로 바꿔 어떤 action도 숨기거나
  잘리지 않게 했다.
- saved Ontology schema name과 selected node name은 기존 edit button만 편집을 소유하게 하고 redundant
  double-click handler와 안내 문구를 제거했다. resize separator의 Home/double-click 보조 reset은
  별개의 accessible resize 입력이므로 유지했다.

## 구조·타입 계약

- `node specs/060-backend-aligned-frontend-refactor/contracts/check-architecture.mjs`
  - 425 TypeScript/Vue source files 통과
  - Schema Canvas/ObjectType Modeler double-click 복귀, native target label 누락, MultiLayer name
    double-click 복귀가 실패하도록 계약을 추가했다.
- production build의 `vue-tsc --noEmit` 통과
- `SchemaCanvas.vue`와 `ObjectTypeModeler.vue`의 `@dblclick` 검색 결과 0건

## 실제 브라우저 계약

### Schema Canvas

`verify-schema-canvas-batch-ui.mjs`에서 다음을 동일 browser/context/page로 검증했다.

- catalog orders wrapper의 `dragstart`를 실제 `DataTransfer`로 실행해 기존
  `{ table: { name: "orders", datasource: "warehouse", ... } }` JSON을 보존했다.
- 논리명 `주문` add button을 Enter로 실행해 정확한 orders node를 한 번 추가했다. 같은 button이
  selection으로 전환된 뒤 Space를 실행해 실제 selected node와 `aria-pressed=true`가 일치했다.
- 기존 top-10/all-table rollback, frozen retry order, column disclosure, reference exact request,
  viewport fit 결과가 그대로 통과했다.
- 390×844 drawer에서 주문 add를 Space로 실행한 뒤 drawer close와 overlay-safe canvas를 유지했다.
  다시 연 drawer에서 remove를 Enter로 실행해 orders node만 제거했다.
- 실제 semantic API/store 경계를 통해 받은 `semantic_orders`의 drag JSON
  `{ name, schema: "sales" }`를 확인하고 Space로 해당 node를 추가했다.
- document horizontal overflow는 0이고 page runtime error도 0이었다.

### ObjectType Modeler

`verify-ontology-behavior-editor-ui.mjs`에서 다음을 검증했다.

- Customer card의 add/Behavior/edit/delete 네 control은 hover 없이 모두 visible native buttons다.
- 실제 `dragstart`의 JSON은 `name=Customer`, `schema=ObjectType`, `isObjectType=true`, columns,
  behaviors projection을 유지했다.
- add button을 focus한 뒤 Enter로 실행해 Customer ObjectType node와 9 columns, saved
  `risk_check` Behavior를 그대로 projection했다.
- 기존 Behavior generate/external-test/save/delete exact retry, runtime header, edit/run action,
  mobile dialog 계약이 통과했다.

직접 검사한 화면:

- `schema-table-node-native-actions-1440x900.png`: search result의 selected primary와 remove action,
  canvas node, reference popup이 잘리지 않고 함께 보인다.
- `schema-modeling-source-actions-390x844.png`: mobile drawer에서 주문 add와 semantic result/add
  marker가 header/search/content 안에 완전히 포함된다.
- `schema-objecttype-native-actions-1920x1080.png`: Customer card의 add/Behavior/edit/delete 네 action과
  canvas의 9-column/Behavior edit/run controls가 모두 보이며 card 경계를 넘지 않는다.

## 배치 종료 검사

- Focused browser: Schema Canvas batch, Ontology Behavior/ObjectType 모두 통과
- Production build: 4,885 modules transformed, 통과
- Lazy boundary:
  - `__federation_expose_Remote-app-DQ_3BVfH.js`
  - 2,757,041 bytes
  - UploadTab, GraphTab, Cytoscape graph runtime가 entry에서 제외됨
- `git diff --check`: 통과; 기존 line-ending warning만 존재

실제 backend write는 수행하지 않았다. browser route fixture는 실제 frontend API/store/runtime
경계를 통과하며, 기존 정상·실패·재시도 payload와 화면 결과를 비교했다.

보호 대상인 `package.json`, spec 057/059 graph WIP, `panelGraphProjection.ts`,
`features/code-analysis/components/graph/*`, `tsconfig.panel-projection.json`은 수정하지 않았다.
