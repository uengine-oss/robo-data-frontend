# Workspace native action ownership evidence

## 교정한 책임

- Code Analysis upload file tab wrapper는 layout만 소유한다. tab activation과 close는 형제 native
  buttons이며 activation은 `aria-selected`, content panel, 기존 scroll reset과 active-tab visibility를
  소유한다.
- Schema detail Behavior card는 전체 card hitbox의 명명된 native edit button으로 기존
  `openEditBehaviorDialog` payload를 그대로 연다.
- Schema Canvas table-node의 column reference와 8↔전체 column disclosure는 native buttons다.
  각 Behavior는 항상 발견 가능한 edit/run sibling buttons로 기존 injected handlers를 호출한다.
- reference popup은 pointer activation이면 pointer 좌표, keyboard synthetic click이면 control bounds를
  anchor로 사용하고 popup 실측 최대 폭을 기준으로 X/Y를 viewport 안에 clamp한다.
- Behavior run action은 flex 축소로 폭이 0이 되지 않도록 action 폭을 소유한다.

## 실제 브라우저 계약

### Parser upload

`verify-parser-ui.mjs`에서 local project fixture의 두 파일을 열어 다음을 확인했다.

- 두 번째 file tab이 selected state를 소유한다.
- 첫 번째 tab의 Enter activation이 기존 file content와 selected state를 복원한다.
- 비활성 두 번째 tab을 Space로 닫아도 첫 번째 active tab은 유지된다.
- 기존 clear dialog, datasource 실패/retry/create, 390×844 upload modal 회귀가 함께 통과했다.

### Schema ObjectType Behavior

`verify-ontology-behavior-editor-ui.mjs`에서 실제 저장→ObjectType refresh→canvas projection 뒤 다음을
확인했다.

- Behavior run button이 hover 없이 보이는 native button이고 Enter로 `ObjectType.Customer` data panel을
  연다. fixture 상세 실패는 빈 성공이 아니라 visible error다.
- node edit button의 Space와 detail card edit hitbox의 Enter가 같은 `risk_check` 편집 dialog를 연다.
- 기존 generate/external-test/save/delete exact retry, session header, mobile dialog 회귀가 통과했다.
- `schema-objecttype-native-actions-1920x1080.png`에서 edit/run action, 9-column disclosure와 canvas
  geometry를 직접 확인했다.

### Catalog Schema table-node

`verify-schema-canvas-batch-ui.mjs`에서 다음을 확인했다.

- Enter로 8→9 columns, Space로 9→8 columns가 되고 `aria-expanded`가 같은 projection을 반영한다.
- 첫 column reference의 Enter activation이 정확히 `schema=sales&column_name=id` 요청을 한 번 보낸다.
- keyboard-opened popup의 left/top/right/bottom이 1440×900 viewport 안에 모두 포함된다.
- `schema-table-node-native-actions-1440x900.png`에서 popup이 잘리지 않고 node/control과 함께 보이는지
  직접 확인했다.
- 기존 top-10/all-table rollback·exact retry, viewport 불변, overlay fit, 390×844 drawer 회귀가
  통과했다.

## 완료 게이트

- Architecture contract: 425 TypeScript/Vue source files
- Type check: passed
- Focused browser: Parser upload, Ontology Behavior editor, Schema Canvas batch passed
- Production build: passed
- Lazy boundary: `__federation_expose_Remote-app-v1kxiT20.js`, 2,754,662 bytes, passed
- `git diff --check`: passed; 기존 line-ending warning만 존재

보호 대상인 `package.json`, spec 057/059 graph WIP, `panelGraphProjection.ts`,
`features/code-analysis/components/graph/*`, `tsconfig.panel-projection.json`은 수정하지 않았다.
