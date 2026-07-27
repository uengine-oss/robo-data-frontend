# Cross-domain form-dialog lifecycle 배치

## 구현 결과

- Text2SQL `FeedbackDialog`, Text2SQL→Ontology `SqlResultInstanceDialog`, Ontology
  `BehaviorDialog`, `ObjectTypeEditDialog`에서 복제된 document key listener, Tab trap, trigger
  복귀 코드를 제거하고 `useDialogFocusLifecycle`을 단일 소유자로 사용한다.
- 공용 lifecycle은 layout box가 없는 `v-show` hidden control을 focus 후보에서 제외한다. 따라서
  ObjectType 일반/차트 중 비활성 tab의 control로 Tab이 이동하지 않는다.
- lifecycle의 `suspended`는 listener/outer trigger 소유권을 해제하지 않고 key 처리만 멈춘다.
  Behavior delete `ActionDialog`가 열린 동안 inner dialog가 Escape와 Tab을 소유하고, 취소 시 outer
  delete button으로 돌아간 뒤 outer close가 원래 Behavior 편집 trigger로 돌아간다.
- Feedback notes reset과 approved-dependent initial focus, SQL instance draft reset·metadata generation
  invalidation·schema load, Behavior draft/API payload, ObjectType rename/chart payload와 status timer는
  기존 domain/component 책임에 그대로 남겼다.
- Feedback은 `100dvh` 제한과 body scroll을 갖는다. ObjectType rename/chart mutation 중에는
  overlay, Escape, close button으로 dialog를 닫을 수 없다.

## 계약 및 실제 사용자 흐름

- `test-dialog-focus-policy.mjs`: 공용 Tab wrap 정책 통과.
- `check-architecture.mjs`: 428 TypeScript/Vue 소스 통과. 네 dialog의 shared lifecycle, 이름 있는
  modal, local document listener 0과 Behavior suspension/ObjectType mutation guard를 확인한다.
- `verify-text2sql-ui.mjs`: 실제 Chromium 통과.
  - feedback initial focus, Escape cancel, trigger focus 복귀, 503와 같은 notes/payload 재시도
  - Ontology schema 목록/상세 실패와 exact retry
  - instance dialog 초기 focus, Escape, trigger 복귀, bulk-create 실패/재시도와 MV 부분 성공
- `verify-ontology-behavior-editor-ui.mjs`: 실제 Chromium 통과.
  - nested delete Escape가 mutation을 만들지 않고 outer delete trigger로 복귀
  - 이어진 outer Escape가 원래 page trigger로 복귀
  - delete 503 후 같은 target과 session header로 exact retry
- `verify-managed-lifecycle-ui.mjs`: 실제 Chromium 통과.
  - chart PATCH pending 중 Escape가 dialog를 닫지 않고 close control도 disabled
  - 성공 후 기존 parent result, 실패 status latest-wins, 모바일 geometry와 trigger 복귀 유지
- 무거운 세 browser runner를 동시에 실행한 최초 시도에서는 기존 theme transition의 100/170ms
  timing assertion이 CPU 부하로 한 번 실패했다. 동일 runner를 단독 재실행하자 theme와 이번
  ObjectType 계약이 모두 통과했다. 제품 상태 실패와 러너 부하를 구분했으며 시간 민감 browser
  runner는 이후 병렬 실행 대상에서 제외한다.

## 빌드와 화면 검사

- `npm.cmd run build`: `vue-tsc --noEmit` 포함 통과, 4,888 modules transformed.
- `check-build-boundaries.mjs`: 통과. remote asset 2,760,840 bytes이며 UploadTab, GraphTab,
  Cytoscape graph runtime은 entry에서 계속 제외된다.
- `git diff --check` scoped 검사 통과.
- 직접 검사한 캡처:
  - `text2sql-feedback-390x844.png`: dialog가 viewport 안에 있고 textarea/footer가 겹치지 않는다.
  - `ontology-behavior-editor-390x844.png`: body 내부 scroll과 footer action이 분리되어 있다.
  - `managed-object-chart-failure-390x844.png`: 실패 status, chart form, footer가 잘리거나 겹치지 않는다.
