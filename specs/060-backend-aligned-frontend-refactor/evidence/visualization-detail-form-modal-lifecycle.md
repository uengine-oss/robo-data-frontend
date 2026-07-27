# Visualization/detail/form modal lifecycle 배치

## 구현 결과

- What-If `CausalExplainabilityModal`, Ontology `SqlInstanceExplorerModal`, Security
  `AuditLogs`, Object Explorer `ChildSelectDialog`, Catalog `BusinessDayCalendar`의
  keyboard listener, initial focus, bidirectional Tab trap, Escape와 연결된 trigger 복귀를
  `useDialogFocusLifecycle` 한 곳으로 통합했다.
- Causal modal은 backdrop이 아니라 실제 panel이 dialog를 소유한다. Cytoscape, Chart,
  animation generation과 dispose 책임은 그대로 유지했다.
- SQL instance explorer는 생성 중 close를 차단하며, 재개방 시 delayed auto-close를 취소하고
  config/error/success/warning 및 column draft를 초기화한다. query, cancel, instance payload와
  Materialized View 부분 실패 표시는 바꾸지 않았다.
- Audit detail payload, child selection/draft, holiday date/name/save payload와 exact retry는
  기존 domain/application 책임을 유지했다.
- modal 높이는 dynamic viewport 기준으로 제한하고 내부 scroll owner를 유지했다.

## 검증

- `test-dialog-focus-policy.mjs`: shared focus/Tab 정책 통과.
- `check-architecture.mjs`: 428 TypeScript/Vue 소스 통과. 다섯 화면의 shared lifecycle,
  accessible dialog name, `tabindex=-1`, 금지된 window/local Escape listener 부재,
  Causal renderer disposal과 SQL delayed-close cancellation을 검사한다.
- `npm.cmd run type-check -- --pretty false`: 통과.
- `verify-whatif-ui.mjs`: causal panel initial close focus, Escape, trigger 복귀, reopen 및 실제
  causal edge/renderer 흐름 통과.
- `verify-native-interaction-ui.mjs`: Security audit detail focus trap, Escape trigger 복귀와
  390×844 containment 통과.
- `verify-object-chart-disclosure-ui.mjs`: child selection 검색창 initial focus와 기존
  selection/chart disclosure 계약 통과.
- `verify-business-calendar-ui.mjs`: load/save 실패의 exact retry, holiday dialog initial focus,
  Escape trigger 복귀, draft 저장과 390×844 containment 통과.
- `verify-ontology-observability-ui.mjs`: SQL instance query, cancel, partial success, pending/close,
  Escape와 session/API 계약을 포함한 전체 Ontology 회귀 통과.
- `npm.cmd run build`: `vue-tsc --noEmit` 포함 통과, 4,888 modules transformed.
- `check-build-boundaries.mjs`: 통과. remote asset 2,759,761 bytes이며
  UploadTab/GraphTab/Cytoscape graph runtime은 entry에서 제외된다.

검증 중 제품 동작과 무관한 stale browser selector를 현재 `aria-label` 계약으로 동기화했고,
Business Calendar retry 검증은 기존 heading 존재가 아니라 저장 버튼 재활성화를 기다리도록
race를 제거했다. 제품 오류나 실패 상태를 완화하지 않았다.

## 직접 검사한 화면

- `whatif-contract-literacy-1920x1080.png`: 실제 dialog panel, close action, graph/detail 영역과
  footer 범례가 겹치지 않는다.
- `native-security-audit-detail-390x844.png`: audit 필드와 긴 SQL이 viewport 내부에 유지된다.
- `object-child-selection-390x844.png`: 검색, 선택 수, table rows와 footer action이 겹치지 않는다.
- `catalog-business-calendar-390x844.png`: sidebar/calendar scroll과 저장 status가 viewport에서
  잘리지 않는다.
- `ontology-sql-instance-explorer-partial-success-1920x1080.png`: instance 성공과 MV 경고가
  구분되고 query/result/config/footer가 단일 modal 내부에 유지된다.
