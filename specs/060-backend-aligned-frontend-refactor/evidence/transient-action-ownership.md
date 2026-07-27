# Transient action ownership evidence

## 구현 결과

- Text2SQL의 표시 대상 필터, 최근 30개 window, 숨김 수와 전체 펼침을
  `src/domains/text2sql/application/messageWindow.ts`의 순수 projection으로 통합했다.
- 숨김 indicator는 native button이며 tool/thinking은 숨김 수에도 포함되지 않는다.
- Scope Browser context menu는 pointer와 Shift+F10을 같은 open 정책으로 사용하고 실제 menu rect로
  viewport를 clamp한다. native menuitem은 방향키, Home/End, Escape와 treeitem focus 복귀를 제공한다.
- Scope Browser의 자체 confirmation markup/CSS를 공용 `ActionDialog`로 교체했다. 취소는 trash IPC를
  호출하지 않으며 실패는 file row를 보존하고 다음 확인에서 같은 root/path를 재시도한다.
- toast는 이름 있는 sibling close button을 사용하고 수동 dismissal 때 `scope-toast` timer를 취소한다.
- 720px 이하 Scope Browser는 tree와 preview를 세로로 배치한다.

## 실행 증거

- `node specs/060-backend-aligned-frontend-refactor/contracts/test-text2sql-message-window.mjs`
  - 표시 대상 filter, hidden count, reveal, 입력 불변 통과
- `node specs/060-backend-aligned-frontend-refactor/contracts/check-architecture.mjs`
  - 426 TypeScript/Vue source 통과
- `npm.cmd run type-check`
  - `vue-tsc --noEmit` 통과
- `FRONTEND_URL=http://127.0.0.1:3011 node .../verify-text2sql-message-window-ui.mjs`
  - 실제 DOM에서 displayable 31개 중 최근 30개, 숨김 수 1, Enter 전체 펼침 통과
- `FRONTEND_URL=http://127.0.0.1:3011 node .../verify-scope-transient-actions-ui.mjs`
  - Shift+F10, menu focus/방향키/Escape, viewport clamp, shared confirmation, cancel 0 IPC,
    503 실패 뒤 동일 root/path 재시도, toast close, 390×844 root overflow 0 통과
- `npm.cmd run build`
  - 4,886 modules transformed, production build 통과
- `node specs/060-backend-aligned-frontend-refactor/contracts/check-build-boundaries.mjs`
  - remote asset 2,756,093 bytes, UploadTab/GraphTab/Cytoscape entry 제외 통과

브라우저의 filesystem 응답은 Electron preload 계약과 같은 형태의 결정론적 fixture다. 따라서 위 결과는
UI/IPC 요청 identity와 실패/재시도 수명주기의 증거이며 실제 OS 휴지통 서비스 성공으로 표기하지 않는다.

## 직접 확인한 화면

- `scope-browser-390x844.png`
- `scope-trash-failure-1280x720.png`
- `text2sql-message-window-1280x720.png`
