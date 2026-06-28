# Quickstart / 검증 가이드: 044

★검증은 **내(에이전트)가 직접** vite(3000)+Playwright 헤드리스로 수행한다 — 사용자에게 UI 테스트를 미루지 않음(원칙 §5, manual §3 자가검증 하니스). 사용자 확인 요청 금지.

## 전제 / 기동

- 풀스택: Neo4j + analyzer(5502) + catalog(5503) + antlr(8081) + gateway(9000). 백엔드만이면 `dev-desktop.ps1 -SkipBuild -NoElectron`(Electron 안 띄움).
- 프론트 dev: `cd robo-data-frontend && npm run dev`(vite 3000, /api/gateway→9000). HMR로 내 편집 즉시 반영.
- ★catalog 변경은 **dev-desktop이 실행하는 서브모듈 체크아웃**(`robo-architect/robo-analyzer/robo-data-catalog`)에 가해야 반영(이중 체크아웃, handoff §6).
- 현재 데이터: neo4j=zapamcom **framework**(TABLE7·FUNCTION46·READS/WRITES25). DBMS 경로는 dbms 재분석 후 검증.
- Playwright 하니스: `robo-data-frontend/.unittest`(보존, `verify_schema_source.mjs`·`sweep_schema_ux.mjs` 재사용). 스토어 핸들=`#app.__vue_app__.config.globalProperties.$pinia._s.get('schemaCanvas')`, 탭전환=`session.activeTab='schema'`.

## 검증 시나리오 (acceptance ↔ Playwright)

### US1 — 노드범위 슬라이스 + 접근 줄 강조 (P1)
1. 스키마 탭 → 테이블(예 참조 있는 테이블) 캔버스에 올림 → 참조 트리거 클릭 → 참조 목록.
2. framework 참조 항목 클릭 → 소스패널 검증:
   - **표시 줄 수 = 그 함수 범위(end-start+1)** 이고 파일 전체(예 1809줄)가 아님(SC-001).
   - 표시 줄번호가 **실제 파일 줄번호**(start_line부터)로 매겨짐(R4).
   - 강조 줄 = `evidence_line`이고 **보이는 영역 안**(오토스크롤, SC-002).
   - Neo4j 직접쿼리로 그 함수 start/end·엣지 evidence_line 대조(원칙 §6 실행검증).
3. DBMS 참조도 동일 형태(루틴 범위 + 구문 줄 강조)인지 — 비대칭 0(SC-003). *(dbms 데이터 준비 후)*

### US2 — 트리거 발견성 (P2)
4. 논리명 모드·물리명 모드 양쪽에서 참조 트리거가 **항상 보이고** 클릭 가능(FR-005). 스샷 2장 Read로 확인.

### US3 — 없음 vs 실패 (P3)
5. 참조 0 테이블 → "참조 없음" 안내. 백엔드 강제 실패(네트워크 차단/오류 주입) → "실패+재시도"(FR-006). 두 화면 구분되는지 스샷 대조.

### US4 — 컨트롤 floating 일관화 (P2)
6. 그래프 탭 스샷 vs 스키마 탭 스샷: 캔버스 컨트롤이 **동일 영역(캔버스 위 floating)**, "테이블 보기"가 좌측 패널 바닥에 없음(SC-006). 논리/물리 토글 단일 컴포넌트 동작.

## 회귀 가드
- `sweep_schema_ux.mjs`로 스키마 탭 전체 스윕 → console pageerror·FATAL 0.
- 기존 닫기버튼·패널 상호배타(043) 무회귀 확인.
