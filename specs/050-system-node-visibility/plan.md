# Implementation Plan: 시스템 노드 절대 비표시

`Catalog/stream input → isSystemNode(always reject) → user graph state → isNodeHidden(toggle-aware) → UI`

- 시스템 노드 집합은 `graphVisibility.ts` 한곳에서 관리한다.
- Catalog 응답과 라이브 스트림 적재 단계에서 시스템 노드와 그 연결을 거부한다.
- graphData, Navigator, 캔버스 최종 계산이 시스템 검사를 숨김 토글보다 먼저 적용한다.
- 필터·통계·상세 선택·라이브 이벤트도 같은 사용자 그래프 경계를 따른다.
