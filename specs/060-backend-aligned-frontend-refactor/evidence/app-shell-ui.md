# App shell / UI 검증 증거

## 검증 범위

- 독립 실행의 표시 기능 21개를 `1280×720`, `390×844`에서 전수 순회했다.
- 각 기능마다 document 가로 overflow, main/home viewport 붕괴, 브라우저 page error를 검사했다.
- 실제 세로 스크롤 가능 화면에서 다른 탭으로 이동했다가 돌아왔을 때 스크롤이 0으로 초기화되는지 검사했다.
- 키보드 포커스 시 데스크톱 내비게이션이 확장되고 모바일 내비게이션은 52px compact rail을 유지하는지 검사했다.
- 설정 모달의 viewport 경계, 초기 포커스, 역방향 Tab 포커스 트랩, Escape 닫기, 호출 버튼 포커스 복귀를 검사했다.
- runtime 테마 상태가 DOM `data-theme`에 반영되고 다시 원복되는지 검사했다.
- 전역 검색의 키워드→스키마 payload와 자연어→Text2SQL payload가 목적지 화면에서 실제 소비되는지 검사했다.

## 실행 결과

`contracts/verify-shell-ui.mjs` 통과:

- desktop scroll probe: `business-calendar / .calendar-main`
- mobile scroll probe: `text2sql / .chat-messages`
- 두 viewport 모두 21개 기능 순회 및 page error 0
- 타입 검사 오류 0
- architecture contract: 301개 TypeScript/Vue 소스 통과
- navigation/runtime 분리 후 architecture contract: 303개 TypeScript/Vue 소스 통과
- 코드분석 배럴의 정적 UI 결합을 좁은 lazy entrypoint로 교체한 뒤 Module Federation remote-app 시작 청크가
  6,557,770B에서 2,629,144B로 감소했다. `check-build-boundaries.mjs`는 UploadTab, GraphTab, Cytoscape가
  시작 청크로 다시 유입되지 않는지와 3.2MB 상한을 검사한다.

검증 중 실제로 발견해 수정한 회귀:

- 모바일에서 플로팅 진행 패널이 좌측 내비게이션 클릭을 가로채던 z-index/좌표 문제
- 코드 그래프에서 Navigator와 확장 내비게이션이 main viewport 폭을 0으로 만들던 flex 문제
- 모바일 보안관리자 화면의 잘림, 툴바/탭/테이블 비율 문제
- 설정 모달의 화면 밖 확장, body 배경 스크롤, 포커스 이탈 및 호출자 포커스 미복귀
- 전체 데이터 삭제 요청을 기다리지 않고 모달을 닫아 실패를 숨기던 비동기 처리
- backend 요청 헤더·테마·탭·도메인 간 전달을 한 Pinia store가 소유하던 혼합 책임

## Navigation/runtime 구조 결과

- `src/shared/stores/runtime.ts`: 테마, LLM key/provider, Electron Neo4j override, backend 요청 헤더만 소유
- `src/app/navigation/state.ts`: 활성 feature와 목적지별 일회성 handoff만 소유
- `src/shared/navigation/featureNavigation.ts`: lower layer가 app 구현을 역참조하지 않게 하는 포트 계약
- 옛 `src/shared/stores/session.ts`, `useSessionStore`, `session.activeTab` 참조 0
- 새 세션 시작은 앱 이동 payload와 분석 store를 함께 초기화하며, 삭제 요청은 backend 성공 뒤에만 닫힌다.

## 시각 증거

- `shell-1280x720.png`
- `shell-390x844.png`
- `shell-settings-390x844.png`

모바일 설정 모달 캡처는 전환 애니메이션 완료 후 직접 확인했다. 8px 외곽 여백, 하단 동작 버튼, 가로 스크롤 가능한 설정 분류, 입력 영역이 viewport 안에 유지된다.

## 아직 완료로 판정하지 않은 범위

- 이 검증은 app shell과 대표 공통 상호작용의 전수 순회다. 각 기능 내부의 모든 dialog/table/form 반응형·접근성 검사는 T043의 후속 화면 감사에서 계속한다.
- Architect web/Electron 임베드 검증은 T053에 남아 있다.

## 앱 설정 draft·위험 작업 수명주기 (2026-07-23)

- `SettingsModal.vue`에서 사용되지 않는 Analyzer 그래프 통계와 변경 감지 상태를 제거했다. 저장된 UML 깊이
  parsing·범위 검증, runtime snapshot, 앱 제목 정규화는 `app/settings/application/settingsDraft.ts`의
  순수 정책으로 분리했다.
- 새 세션과 서버 전체 삭제는 더 이상 native confirm을 사용하지 않는다. 이름 있는
  `SettingsActionDialog`가 action identity, pending, 오류, Escape, focus trap과 trigger focus 복귀를
  소유한다.
- 새 세션 취소는 상태를 바꾸지 않고, 확정은 navigation과 Analyzer 메모리 상태를 초기화한 뒤 업로드
  화면으로 이동한다. 전체 삭제는 Catalog DELETE 성공 전에는 modal을 닫거나 Analyzer를 초기화하지 않는다.
- 결정론적 브라우저 계약에서 첫 DELETE를 503으로 응답시켜 같은 dialog의 오류와 `다시 시도`를 확인하고,
  두 번째 DELETE 200 뒤에만 두 dialog가 종료되는지 검증했다. 요청 횟수는 실패 1회 + 재시도 1회였다.
- 중첩 dialog 종료 순서를 실제 브라우저에서 검사해 내부 trigger 복귀와 바깥 설정 버튼 복귀가 경합하던
  결함을 발견했다. 내부 복귀를 먼저 완료한 뒤 바깥 modal을 닫도록 수명주기를 교정했다.
- `1280×720`, `390×844`에서 21개 기능 순회, 설정·위험 작업 dialog geometry, document 가로 overflow 0,
  page error 0을 확인했다. 완료된 transition 프레임은
  `evidence/shell-settings-action-390x844.png`에 기록했다.
- 검증:
  - `node contracts/test-settings-draft.mjs`: PASS
  - `npm.cmd run type-check -- --pretty false`: PASS
  - `node contracts/check-architecture.mjs`: PASS across 364 TS/Vue sources
  - `node contracts/run-browser-suite.mjs verify-shell-ui.mjs`: PASS
  - `npm.cmd run build`: PASS, 4,817 modules
  - `node contracts/check-build-boundaries.mjs`: PASS
  - `git diff --check`: PASS (line-ending warnings only)
## Alarm toast lifetime addendum

- SSE reconnect, alarm auto-dismiss, and acknowledge-dismiss callbacks now use keyed managed timeouts and are disposed
  with the app-shell component. Manual close cancels both timers for that alarm.
- Stream failure is no longer console-only when the optional stream is enabled; a compact reconnect status remains
  visible. Acknowledgement owns per-alarm pending/error state, blocks duplicate requests, and commits acknowledged state
  only after the backend succeeds.
- Close controls have alarm-specific accessible names. At 480px and below the toast container uses eight-pixel viewport
  gutters, wrapped metadata, and no hover translation.
- `npm.cmd run type-check` and the 371-source architecture contract passed. Live stream delivery remains explicitly
  unverified under T052 because `VITE_ENABLE_ALARM_STREAM` and a healthy authenticated backend are required.
