# Quickstart / Validation: 노드 검색 결과 위치 교정

**Feature**: 042-search-dropdown-anchor | **Date**: 2026-06-28

빌드·재분석 없이 **vite dev(3000) + Playwright 헤드리스 스크린샷**으로만 검증한다(기존 neo4j 데이터 사용, gateway 9000 경유).

## Prerequisites

- gateway(9000) 및 백엔드 가동(catalog 실데이터 로드용). 데스크톱 스택이 이미 떠 있으면 그대로 사용.
- frontend vite dev: `cd robo-data-frontend; npm run dev` → http://localhost:3000
- Playwright: `.unittest/node_modules` 사용. 검증 스크립트는 `.unittest/`에 두고 실행 후 제거.

## Validation Scenarios (spec ↔ 검증 매핑)

### V1 — 결과가 입력칸 바로 아래에 뜬다 (FR-001, SC-001)
1. Overview 패널(노드 미선택) 표시, 캔버스에 노드가 있는 상태(`hasGraph=true`라 "캔버스 비우기" 노출).
2. 검색칸에 글자 입력(예: "z" 또는 "comm").
3. **기대**: `.search-results-dropdown`의 화면상 top이 `.search-input-wrapper`의 bottom과 거의 일치(±몇 px). 입력칸과 결과 목록 사이의 세로 간격에 `.reset-graph-btn`이 들어오지 않음.
4. **측정**: Playwright `boundingBox()`로 input-wrapper.bottom, dropdown.top, reset-btn rect를 받아 `dropdown.top ≈ wrapper.bottom` 그리고 `reset-btn`이 dropdown 영역에 가려짐(겹침) 확인 + 스크린샷 Read.

### V2 — 입력→첫 결과 경로에 캔버스비우기 버튼 없음 (FR-002, SC-002)
1. V1 상태에서 입력칸 중심 ~ 첫 결과 항목 중심을 잇는 세로 구간을 계산.
2. **기대**: 그 구간 좌표에서 `elementFromPoint`가 `.reset-graph-btn`을 반환하지 않음(드롭다운/입력칸만).
3. 첫 결과 클릭 → 해당 노드만 캔버스 추가, 기존 캔버스 노드 수 **감소 없음**(canvas store node 수 before ≤ after).

### V3 — 검색 닫으면 버튼 정상 복귀 (FR-004, SC-003)
1. 검색칸 비우기(✕ 또는 전체 삭제) → 드롭다운 사라짐.
2. **기대**: `.reset-graph-btn`이 다시 정상 노출·클릭 가능, 레이아웃 점프 없음(섹션 높이 안정).

## Expected Outcome

- V1~V3 모두 통과(스크린샷 + boundingBox 수치).
- 회귀 0: 검색 결과 선택 동작, 캔버스 비우기 동작·표시 조건 종전과 동일.
