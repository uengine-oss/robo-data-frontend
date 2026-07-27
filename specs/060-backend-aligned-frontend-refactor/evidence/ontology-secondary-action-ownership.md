# Ontology secondary action ownership evidence

## 교정한 책임

- canvas와 edge context menu는 이름이 있는 `role=menu`를 사용하고 각 add/edit/delete 동작은
  native `button[role=menuitem]`이 기존 handler를 그대로 한 번 호출한다.
- selected-node relation card는 정보 projection만 소유한다. 관계 편집은 source·target·type으로
  이름 붙은 항상 보이는 sibling button이 소유하며 mouse double-click 경로는 제거했다.
- document generation PDF 영역은 drag/drop owner를 유지하면서 native picker button과 labelled file
  input을 연결한다. 제거 시 composable의 선택 상태와 실제 input value를 함께 비워 같은 파일을 다시
  선택할 수 있다.
- datasource mapping card는 native header disclosure만 expanded state를 변경한다. deterministic
  detail ID와 `aria-expanded`/`aria-controls`가 실제 conditional detail을 가리키며 candidate
  preview/confirm hit area는 중첩하지 않는다.
- node datasource search result card는 정보를 표시할 뿐 선택을 암묵적으로 소유하지 않는다.
  preview와 select는 sibling native buttons이고 select는 현재 선택을 `aria-pressed`로 노출한다.

## 정적·타입 계약

- `node specs/060-backend-aligned-frontend-refactor/contracts/check-architecture.mjs`
  - 425 TypeScript/Vue source files 통과
  - click-only mapping/result card, relation double-click, `$refs` picker가 돌아오거나 native/ARIA
    markers가 사라지면 실패하도록 계약을 추가했다.
- `npm.cmd run type-check`
  - `vue-tsc --noEmit` 통과
- verifier 자체 `node --check` 통과

## 실제 브라우저 계약

`verify-ontology-observability-ui.mjs` 전체 Ontology 회귀를 동일 browser/context/page에서 실행했다.

- canvas 빈 공간 context menu의 Process menuitem을 focus한 뒤 Enter로 생성했고 기존 graph
  undo/redo 결과가 유지됐다. edge menu의 native menuitem 구조와 기존 handler 연결은 architecture
  계약으로 고정했다.
- relation edit button을 focus한 뒤 Space로 editor를 열었다. 기존 endpoint-column 실패, exact retry,
  field mapping draft, desktop/mobile geometry가 그대로 통과했다.
- PDF picker를 Enter로 열어 잘못된 확장자의 visible validation과 non-commit을 확인했다. 정상 PDF를
  선택한 뒤 remove를 Space로 실행해 실제 input value가 비워졌음을 확인하고 동일 파일을 picker의
  Space activation으로 다시 선택했다.
- datasource mapping header를 Space로 닫고 Enter로 다시 열어 expanded/controls/detail 일치를
  확인했다. candidate detail, confirm failure, bulk partial-success/failed-only retry는 기존 결과를
  유지했다.
- node datasource preview를 Enter와 Space로 실행해 기존 bounded SQL과 exact sample retry를
  유지했다. select는 Space로 실행한 뒤 button pressed state와 card selected projection이 일치했다.
- 390×844 node datasource dialog는 가로 overflow, clipping 없이 preview/select actions를 함께
  표시했다.
- 전체 시나리오의 page runtime error는 0이었다.

직접 검사한 화면:

- `ontology-document-pdf-validation-1920x1080.png`: native picker focus, validation alert, dialog
  geometry가 겹치지 않는다.
- `ontology-candidate-disclosure-1920x1080.png`: mapping/candidate details와 sibling preview/select가
  같은 dialog 안에서 압축되거나 중첩되지 않는다.
- `ontology-node-datasource-search-390x844.png`: mobile result card의 preview/select와 footer가
  잘리지 않는다.
- `ontology-relation-column-retry-1920x1080.png`: keyboard-opened relation editor의 endpoints와
  field mapping이 기존 canvas와 함께 정상 배치된다.

## 배치 종료 검사

- Production build: 4,885 modules transformed, 통과
- Lazy boundary:
  - `__federation_expose_Remote-app-CiCXdo0Q.js`
  - 2,754,662 bytes
  - UploadTab, GraphTab, Cytoscape graph runtime가 entry에서 제외됨
- `git diff --check`: 통과; 기존 line-ending warning만 존재

실제 백엔드 데이터가 필요한 서비스 호출은 이 UI 책임 배치에서 새로 실행하지 않았다. 기존
Ontology browser fixture의 정상·실패·재시도·취소 payload 계약과 전체 회귀를 유지했고, production
backend write는 수행하지 않았다.

보호 대상인 `package.json`, spec 057/059 graph WIP, `panelGraphProjection.ts`,
`features/code-analysis/components/graph/*`, `tsconfig.panel-projection.json`은 수정하지 않았다.
