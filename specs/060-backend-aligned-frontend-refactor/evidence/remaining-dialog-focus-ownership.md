# Remaining action/editor dialog focus ownership 배치

## 구현 결과

- App `SettingsActionDialog`, Text2SQL `HistoryActionDialog`, Ontology workflow
  `AgentsMdEditor`의 ProcessGPT selector, OLAP `OlapTab` cube manager와 `PivotAnalysis` cube
  editor에서 자체 Escape/Tab/trigger 복귀 구현을 제거했다.
- 다섯 화면은 `useDialogFocusLifecycle`이 keyboard listener, initial focus, bidirectional trap,
  close/unmount 정리와 연결된 trigger 복귀를 단독 소유한다.
- 각 화면의 domain 책임은 이동하지 않았다.
  - Settings/History의 title, description, pending/error, parent exact retry state
  - ProcessGPT open draft reset, process list load/cancel, selected process/condition, mutation retry
  - OLAP delete target/options, cube/ETL draft, script generation/save/execution cancellation과 payload
- OLAP manager는 cube-delete `ActionDialog`, cube editor는 full-reload/redeploy `ActionDialog`가
  열리는 동안 outer key handling만 suspend한다. inner close 뒤 outer action trigger로, outer
  Escape 뒤 연결된 toolbar/editor trigger로 돌아간다.
- 모든 큐브 삭제 성공 뒤에는 manager toolbar trigger 자체가 조건부 렌더링에서 제거된다. shared
  lifecycle은 disconnected trigger에 focus하지 않는다. trigger 복귀는 single-delete cancel 뒤
  manager Escape라는 trigger가 실제 존재하는 경로에서 검증했다.
- BPMN document listener는 Escape뿐 아니라 popup modeler와 Ctrl+S 수명주기를 함께 소유하므로
  generic dialog duplication으로 바꾸지 않았다. What-If causal visualization은 graph/chart
  animation disposal과 함께 다음 별도 배치에서 감사한다.

## 검증

- `test-dialog-focus-policy.mjs`: shared Tab wrap policy 통과.
- `check-architecture.mjs`: 428 TypeScript/Vue 소스 통과. 다섯 화면의 shared lifecycle,
  accessible name, `tabindex=-1`, local document key listener 0과 OLAP suspension을 검사한다.
- `npm.cmd run type-check -- --pretty false`: 통과.
- `verify-shell-ui.mjs`: 21개 feature shell의 desktop/mobile 순회 통과.
  - new-session initial focus, Escape cancel, trigger 복귀
  - settings DELETE pending 중 Escape 차단, 503와 exact retry
- `verify-text2sql-ui.mjs`: 통과.
  - history delete-all cancel/trigger 복귀
  - item DELETE pending Escape 차단, 503, list 불변과 exact retry
- `verify-agents-md-editor-ui.mjs`: 통과.
  - ProcessGPT initial close focus, 목록 실패 retry, selected process/condition 보존 mutation retry
  - mobile Escape와 원래 process action trigger 복귀
- `verify-olap-lifecycle-ui.mjs`: 통과.
  - manager initial focus, nested single-delete cancel→delete trigger, manager Escape→toolbar trigger
  - single/all delete exact retry와 명시적 all-DW cleanup
  - editor initial focus, DAG/full-reload nested cancel, 503 exact retry, late SSE completion 거부
  - editor Escape와 edit trigger 복귀
- `npm.cmd run build`: `vue-tsc --noEmit` 포함 통과, 4,888 modules transformed.
- `check-build-boundaries.mjs`: 통과. remote asset 2,759,761 bytes, UploadTab/GraphTab/Cytoscape
  graph runtime은 entry에서 계속 제외된다.
- scoped `git diff --check`: 오류 없음. Windows checkout의 기존 LF→CRLF 안내만 출력됐다.

## 직접 검사한 390×844 화면

- `shell-settings-action-390x844.png`: outer settings와 alertdialog의 계층, description/action 간격 정상.
- `text2sql-history-delete-390x844.png`: 선택 대상 문구와 destructive/cancel action 비중첩.
- `ontology-agents-md-process-390x844.png`: process list, close, footer가 viewport 내부에 유지됨.
- `olap-delete-error-390x844.png`: 긴 delete 설명·오류·retry가 잘리지 않음.
- `olap-editor-stream-failure-390x844.png`: 3개 tab, terminal failure/status, script 영역과 footer가
  내부 scroll 안에서 유지됨.
