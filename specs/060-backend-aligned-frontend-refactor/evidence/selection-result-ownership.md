# Selection Result Ownership Evidence

## Scope

- Schema Behavior 실행 attempt의 native selection/pressed ownership
- Schema table/column procedure/framework reference 결과의 native activation ownership
- Ontology Object Explorer child 선택의 labelled checkbox/filter-scope ownership
- 기존 keyboard row와 nested action propagation을 이미 제공하는 Catalog glossary term row는 비변경

## Production result

- `SchemaCanvas.vue`의 attempt layout row를 native button으로 바꾸고 현재 선택을 `aria-pressed`로
  노출했다. 기존 execution result, code/input/output projection과 API 호출은 변경하지 않았다.
- `TableNode.vue`의 네 reference result 종류를 simulated `div[role=button]`에서 native button으로 바꿨다.
  기존 procedure/framework navigation handler와 popup anchor/close 계약은 유지했다.
- `ChildSelectDialog.vue`의 row click toggle을 제거하고 child별 checkbox에 이름을 부여했다. 전체 선택은
  현재 filter 범위의 checked/indeterminate 상태를 유지한다.
- 모바일 캡처에서 실제 theme에 없는 `--color-surface` 계열 토큰 때문에 dialog가 투명해지는 결함을
  발견했다. canonical `--color-bg-*`, `--color-text*`, `--color-accent` 토큰으로 교정하고 toolbar는
  단일열, table은 내부 가로 scroll로 전환했다. 부모가 없는 ObjectType 선택 모드의 빈 따옴표도 제거했다.
- 관계 verifier에 남아 있던 obsolete search-row double-click은 두 번 add되어 같은 node를 중복 생성했다.
  검증도 실제 product 계약인 labelled native add button 한 번으로 동기화했다.

## Verification

- `node specs/060-backend-aligned-frontend-refactor/contracts/check-architecture.mjs`
  - PASS, 425 TypeScript/Vue source files
- `npm.cmd run type-check`
  - PASS
- `verify-schema-relationship-ui.mjs`
  - PASS, 1920×1080/390×844
  - reference result가 native button이고 Enter가 source request를 정확히 한 번 발생시킴
- `verify-ontology-behavior-editor-ui.mjs`
  - PASS, 1920×1080/390×844
  - row payload `{ instanceData: { age: 42, name: "Ada" } }` 보존, execute 1회,
    Space selection 뒤 두 attempt의 pressed state가 서로 반전됨
- `verify-object-chart-disclosure-ui.mjs`
  - PASS, 1280×720 및 child dialog 390×844
  - ObjectType data request 1회, `Order A 선택` checkbox Space, 선택 1건 confirm, chart 결과 보존
- `npm.cmd run build:docker`
  - PASS, 4,885 modules
- `node specs/060-backend-aligned-frontend-refactor/contracts/check-build-boundaries.mjs`
  - PASS, `__federation_expose_Remote-app-hQkGlc-J.js`, 2,756,093 bytes
- scoped `git diff --check`
  - PASS; repository의 기존 LF/CRLF 안내만 존재

## Visual inspection

- `schema-reference-result-native-button-1920x1080.png`
  - popup가 table node에 anchor되고 결과 label/detail/close가 겹치지 않음
- `schema-behavior-attempt-selection-1920x1080.png`
  - 실패/성공 attempt와 active focus/pressed projection, code/input/output가 popup 안에 유지됨
- `object-child-selection-390x844.png`
  - 불투명 surface, 단일열 toolbar, labelled checkbox, footer가 viewport 안에 있고 table 데이터는 내부
    scroll 경계에 보존됨

## Deferred

- 이 배치는 UI ownership만 변경하므로 비영향 전체 Ontology 장기 suite는 반복하지 않았다.
  전체 057/059 포함 회귀와 standalone/Architect web/Electron 검증은 Phase 6 마일스톤에서 수행한다.
