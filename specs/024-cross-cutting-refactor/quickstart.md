# Quickstart — 회귀 검증 가이드 (배치 ①)

목적: 리팩토링이 **화면 출력 0변경**임을 실행으로 증명. 각 US는 독립 검증 가능.

## 사전 조건
- 풀스택 기동: gateway 9000 · antlr 8081 · analyzer 5502 · catalog 5503 · frontend 3000. (analyzer 미기동 시 검증 전 기동)
- 실그래프 확보: `GET http://localhost:5503/robo/graph/` → `d:/tmp/graph_snapshot.json`(1106노드).

## US1 — 이름 단일화 (골든 마스터 diff 0)
1. **리팩토링 전**: 세 함수(현행)를 실그래프 전 노드 × {tree,canvas,panel} × {physical,logical}에 적용 → `d:/tmp/name_golden.json` 캡처.
2. 합성 엣지 케이스(다중 라벨, BL, 외부 stub, 구조노드) 골든에 추가.
3. **리팩토링 후**: 공유 헬퍼(`typeWithLine`·`applyLogicalMode`) 기반 화면 함수로 동일 입력 재산출 → 골든과 글자단위 대조.
4. **통과 기준**: diff 0(SC-001). 1글자라도 다르면 실패 → 그 노드종류 보존 로직 수정.

## US2 — 스트림 복원력
1. 정상 NDJSON/SSE 입력으로 `streamFetch`/`streamSseFetch` 실행 → 수신 이벤트 시퀀스가 전과 동일(정상경로 보존).
2. 정상 줄들 사이에 깨진 줄 1개(예: `{"type":"node_e` 잘림) 주입.
3. **통과 기준**: 전체 throw 없이 이후 이벤트 계속 수신 + 깨진 줄이 `logger`에 원문과 함께 기록(SC-003).

## US3 — 스타일 캐시
1. 저장 스타일 고정 상태에서 `getNodeColor`/`getNodeSize`/`getRelationshipColor`/`getRelationshipWidth`를 다수 노드/관계에 반복 호출.
2. **통과 기준**: 반환값이 캐시 전과 100% 동일(SC-013 보존) + `localStorage.getItem` 실제 호출 횟수가 변경당 1회 수준으로 급감(SC-004). 스타일 패널에서 색 변경 시 다음 렌더에 즉시 반영(`storageVersion` 반응성 보존).

## 통합 — 풀스택 시각 회귀
1. frontend 3000에서 소스 폴더 분석 실행(~4분) → 그래프 생성.
2. **전 보기모드**(모듈간·협력군집·영역구조·건강) + **노드패널 종류별** + **콘솔 NDJSON 스트림 수신**을 Playwright 헤드리스로 캡처.
3. **통과 기준**(SC-002): 리팩토링 전/후 스크린샷 시각적 동일 + `pageerror = 0` + 콘솔 스트림 정상 수신. = [[manual]]§3 자가검증 하니스(내가 직접 수행, 사용자 UI 테스트 0).
