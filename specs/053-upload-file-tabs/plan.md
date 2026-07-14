# Implementation Plan: 업로드 파일 탭과 뷰어 전환

## Flow

`UploadTree/tab/close action → activateTab → activeTabId → next DOM → viewer scroll reset + active tab reveal`

그래프 source navigation은 별도 `openProcedureFile → scrollToHighlightedLine` 흐름을 유지한다.

## Design

- 탭 상태는 기존 `UploadTab.vue`가 계속 단독 소유한다.
- 사용자 전환은 `activateTab` 한 곳으로 모으고 직접 `activeTabId` 대입을 제거한다.
- 탭 strip과 viewer DOM ref를 사용해 상태 변경 후 필요한 컨테이너만 스크롤한다.
- Grid item에 `min-width: 0`, strip에 `width/max-width: 100%`를 주어 overflow 책임을 명시한다.
- 탭 너비·ellipsis·닫기 버튼의 기존 시각 규칙은 유지한다.

## Verification

- production build와 TypeScript/Vue compile.
- 여러 긴 파일 경로 탭, tree 전환, tab 전환, close 전환, source line navigation 실제 UI 확인.
- viewport 폭을 줄여 페이지 전체 horizontal overflow와 console error 확인.
