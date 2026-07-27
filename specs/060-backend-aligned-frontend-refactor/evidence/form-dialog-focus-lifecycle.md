# Shared form-dialog focus lifecycle 배치

## 구현 결과

- `useDialogFocusLifecycle.ts`가 active dialog의 document key listener, 초기 focus, Escape,
  Tab/Shift+Tab 순환, close/unmount 정리와 연결된 trigger focus 복귀를 단독 소유한다.
- shared composable은 backend, runtime store, mutation을 알지 않는다. 각 component가 close 가능 여부와
  close 요청만 전달한다.
- Analyzer 기존 데이터 처리, Security 권한 추가, Ontology extraction feedback, Ontology 동의어 제안에
  고유 dialog label, `aria-modal`, 이름 있는 close, visible focus와 viewport 내부 scroll을 적용했다.
- Analyzer의 숨겨진 radio는 `display:none`에서 keyboard-focus 가능한 visually hidden input으로
  바꿨다. 기존 original/uppercase/lowercase와 delete/append 결과는 그대로다.
- Security 저장 실패는 dialog 내부 alert에 표시하고 동일 draft로 재시도한다. 성공 직후 전체 목록을
  재조회해 선택 panel과 trigger를 제거하던 흐름은 성공한 단일 access rule만 local upsert하도록
  교정했다. backend 성공 전에는 로컬 규칙을 바꾸지 않는다.
- 동의어 적용 중에는 기존 정책대로 닫기를 차단하고, progress와 부분 실패를 status/alert로 노출한다.

## 실제 사용자 흐름

`verify-form-dialog-lifecycle-ui.mjs`는 실제 Vue component와 Chromium에서 다음을 확인했다.

- Analyzer: trigger→원본 radio 초기 focus, 마지막 control Tab→첫 control 순환, Escape→trigger 복귀,
  keyboard 대문자 선택 뒤 append 결과 `data:append:uppercase`
- Ontology feedback: textarea 초기 focus, Escape 복귀, 입력한 feedback submit 결과 보존
- Ontology synonym: 모두 선택 초기 focus, Escape 복귀, 선택 후 실제 glossary GET/PUT,
  `synonyms: ['오더']` payload와 applied count 1
- Security: warehouse 선택→권한 추가 role radio focus, Escape 복귀, POST 503 뒤 dialog/alert/draft 유지,
  두 번째 POST의 byte-equivalent payload, 성공 뒤 trigger 복귀
- 390×844에서 document 가로 overflow 0, 동의어 dialog가 viewport 안에 유지됨
- 예상한 Security 503 기록 외 page/console error 0

직접 검사한 캡처:

- `form-dialog-lifecycle-390x844.png`

## 배치 종료 검사

- `node specs/060-backend-aligned-frontend-refactor/contracts/test-dialog-focus-policy.mjs`
  - first↔last 양방향 wrap, middle no-wrap, empty/single control 경계 통과
- `node specs/060-backend-aligned-frontend-refactor/contracts/check-architecture.mjs`
  - 427개 TypeScript/Vue source 구조 검사 통과
  - shared lifecycle의 domain/workflow 의존 0
  - 네 form dialog의 shared focus ownership/label/mobile geometry 재유입 차단
- `node specs/060-backend-aligned-frontend-refactor/contracts/verify-form-dialog-lifecycle-ui.mjs`
  - 위 네 실제 component 흐름 통과
- `npm.cmd run build`
  - `vue-tsc --noEmit` 통과
  - 4,887 modules transformed, production build 통과
- `node specs/060-backend-aligned-frontend-refactor/contracts/check-build-boundaries.mjs`
  - `__federation_expose_Remote-app-zR9BIlZi.js`
  - 2,756,042 bytes
  - UploadTab, GraphTab, Cytoscape graph runtime가 remote entry에서 제외됨

실제 backend write는 수행하지 않았다. HTTP 503→동일 payload 재시도와 glossary GET/PUT은 backend
원문 계약에 맞춘 deterministic browser route로 검증했으며 실서비스 통합 성공으로 표기하지 않는다.
영향 경로가 없는 기존 suite와 전체 회귀는 반복하지 않았다.

보호 대상인 `package.json`, spec 057/059 graph WIP, `panelGraphProjection.ts`와
`src/features/code-analysis/components/graph/*`는 수정하지 않았다.
