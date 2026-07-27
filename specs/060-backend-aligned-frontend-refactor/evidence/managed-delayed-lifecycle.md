# Managed delayed-lifecycle 배치

## 범위와 소유권

- `OntologyCanvas.vue`의 canvas fit은 `canvas-fit` latest-wins callback으로 바꿨다. 새 fit 요청과
  unmount가 이전 callback을 취소한다.
- `ObjectTypeEditDialog.vue`의 chart 저장 status는 `chart-save-message`로 소유한다. 재저장·닫기·
  unmount가 이전 status callback을 취소하며, 이전 성공 timer가 후속 실패를 지우지 않는다.
- `BpmnViewer.vue`의 inline/popup viewport, popup open, resize, save status를 이름 있는 managed
  callback으로 분리했다. generation과 current-modeler identity를 함께 확인하므로 닫힌 popup이나
  교체된 editor에 stale callback이 적용되지 않는다.
- `runtime.ts`의 theme transition은 `theme-transition` latest-wins로 바꿨다. 빠른 연속 toggle에서
  마지막 전환이 끝나기 전에 transition class가 제거되지 않는다.
- analyzer heartbeat, semantic elapsed, node-agent/causal polling처럼 명시적인 start/stop을 이미
  소유한 interval은 모양이 비슷하다는 이유로 변경하지 않았다. scheduler 구현인
  `useManagedTimeouts.ts`와 `expiringMap.ts`의 native timer도 정책 경계이므로 유지했다.

## 접근성·반응형·실제 화면

- ObjectType chart dialog는 `role=dialog`, label, 이름 있는 close, 초기 focus, Escape, tab trap,
  trigger focus 복귀를 제공한다. 실패 status를 chart surface 위에 배치해 1280×720과 390×844에서
  완전히 보이게 했다.
- 720px 이하에서는 chart config와 preview를 세로로 배치하고 chart type은 두 열로 제한한다.
  390×844 실제 화면에서 document 가로 overflow가 0임을 확인했다.
- BPMN inline viewer는 viewport 높이의 75%와 확대 상한 안에서 fit한다. 전체 편집 popup의 크기와
  저장 workflow에는 이 inline 제한을 적용하지 않는다.
- 현재 `diagram-js`와 맞지 않아 console error를 만들던 obsolete `keyboard.bindTo: document`
  설정을 제거했다.

직접 검사한 캡처:

- `managed-object-chart-failure-1280x720.png`
- `managed-object-chart-failure-390x844.png`
- `managed-bpmn-failure-1280x720.png`

## 실행 증거

- `node specs/060-backend-aligned-frontend-refactor/contracts/check-architecture.mjs`
  - 426개 TypeScript/Vue source 구조 검사 통과
  - 대상 네 책임에서 raw timeout 0, managed key/generation/current-modeler/inline-height 규칙 통과
- `node specs/060-backend-aligned-frontend-refactor/contracts/test-domain-contract-parsers.mjs`
  - managed scheduler의 replacement, stale callback rejection, scope clear 계약 통과
- `node specs/060-backend-aligned-frontend-refactor/contracts/verify-managed-lifecycle-ui.mjs`
  - 실제 app의 rapid theme toggle 통과
  - API fixture를 사용하는 실제 ObjectType modeler에서 저장 성공 뒤 후속 503 replacement,
    dialog focus/Escape/복귀와 mobile geometry 통과
  - 실제 `bpmn-js`와 유효 BPMN XML을 사용하는 focused Vite 화면에서 open→100ms 이전 close의
    editor 생성 0건, reopen, 저장 성공→후속 503 replacement, inline/popup geometry 통과
  - 예상된 fixture 503 기록을 제외한 console/page error 0
- `npm.cmd run type-check`
  - 통과
- `npm.cmd run build`
  - 4,886 modules transformed, production build 통과
- `node specs/060-backend-aligned-frontend-refactor/contracts/check-build-boundaries.mjs`
  - `__federation_expose_Remote-app-DfF8NWyv.js`
  - 2,756,042 bytes
  - UploadTab, GraphTab, Cytoscape graph runtime가 remote entry에서 제외됨

이 배치는 backend write나 실제 데이터 mutation을 수행하지 않았다. 화면의 HTTP 정상·503 순서와
동일 저장 대상 재시도는 deterministic fixture로 검증했고, `bpmn-js` 렌더러 자체는 실제 runtime을
사용했다. 영향 경로가 없는 기존 전체 suite는 반복하지 않았으며, 전체 057/059 회귀와
standalone·Architect web·Electron 검증은 최종 마일스톤에 남아 있다.

보호 대상인 `package.json`, spec 057/059 graph WIP, `panelGraphProjection.ts`와
`src/features/code-analysis/components/graph/*`는 수정하지 않았다.
