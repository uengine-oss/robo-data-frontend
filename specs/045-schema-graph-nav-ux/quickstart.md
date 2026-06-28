# Quickstart: 자가검증 시나리오 (Playwright + vite)

> 검증 = **내가 직접** vite(3000) + Playwright 헤드리스 스크린샷을 Read로 본다(원칙 §6, manual §3). 하니스 = `robo-data-frontend/.unittest`. 스토어 핸들 `#app.__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas'|'analyzer'|'session'|'canvas')`. 탭전환 `session.activeTab='schema'|'graph'`.

## 전제
- 풀스택 기동(gateway 9000 · analyzer 5502 · catalog 5503 · Neo4j 7687) + `npm run dev`(vite 3000). 분석 데이터 존재(zapamcom framework).
- 각 시나리오 후 **스크린샷 Read** + `pageerror 0` + `npx vite build` 통과.

## US1 — 테이블 카드 (구현됨, 회귀검증)
1. schema 탭 → `loadAllTables` → FK·NOT NULL 섞인 테이블(zord_jncard)·14열(zngm_comm_cd_dtl) 캔버스에.
2. **확인**: 마커(*·PK/FK)가 타입 앞 일관 위치 / 타입 맨오른쪽 정렬 / 긴 논리명 `…` 말줄임(마커·타입 유지) / 카드 폭 고정.

## US2 — 상세패널 (구현됨, 회귀검증)
1. 테이블 selectNode → 상세패널.
2. **확인**: NOT NULL=주황 텍스트(카드 별표와 같은 색) / 타입 모든 행 같은 위치(지그재그 0) / 각 컬럼 배경 카드 구분 / 분석의미 파란선 없음.

## US3 — 사이드바·컨트롤 (구현됨, 회귀검증)
1. 일부 테이블 캔버스에 + selectNode.
2. **확인**: on-canvas = 흐림 + 초록 점 맨 오른쪽 / selected = 하이라이트 / 캔버스 비워도 논리물리 토글·비우기(비활성) 표시.

## US4 — 그래프 노드검색 (구현됨, 회귀검증)
1. graph 탭 → 노드 캔버스에(Overview 열림) → "노드 이름으로 검색"에 "auth".
2. **확인**: 1차=논리명 / 2차=물리명·소속(흐림) / 배지=종류 1개(실제 노드색) / 헤더=실제 개수 / 드롭다운 스크롤로 끝까지 도달 / 각 줄 ellipsis.

## US5 — 스키마탭 검색 (구현 대상)
1. schema 탭 → 검색에 "card".
2. **확인**: 결과가 US4와 **같은 톤**(논리명 우선·소속·컴팩트·종류 표시) / 과거 칙칙함 없음 / **의미검색 섹션 보존**(유사도/사유 안내).

## US6 — 상단 전체검색 (구현 대상)
1. 그래프 탭에서 상단 검색에 입력 → 노드검색으로 동작. 스키마 탭에서 입력 → 테이블검색으로 동작.
2. **확인**: placeholder·동작이 현재 탭에 일치(거짓 표기 0) / "All▾"·"⌘K" 빈 장식 0.

## 종료 기준
- US1~6 시나리오 통과(스크린샷) + 회귀 0 + pageerror 0 + `vite build` exit 0 + 데드 잔재 grep 0.
