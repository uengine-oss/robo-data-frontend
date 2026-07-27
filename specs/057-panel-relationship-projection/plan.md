# Implementation Plan

1. 현재 `rebuildPanelLoad`와 `canvasGraphData`의 끝점 기반 재포함을 반대 사례로 고정한다.
2. 노드와 관계 선택을 함께 계산하는 순수 투영 함수를 만든다.
3. 패널 로드 상태에서만 관계 ID allowlist를 적용하고 일반 캔버스 동작은 보존한다.
4. 국소 테스트, type-check, build, pinned 소스 정렬, Playwright 순서로 검증한다.
