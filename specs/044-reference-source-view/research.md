# Phase 0 Research: 044 참조 소스뷰 + 컨트롤 일관화

조사는 추측 없이 코드 직접확인 기준(원칙 §2). 핵심 미확인점을 해소한다.

## R1. 접근 줄(evidence_line)이 그래프에 이미 있는가 — 생산자 전수

**Decision**: framework 참조의 정밀 접근 줄은 **이미 영속됨**. analyzer 코드 변경 없이 MVP 가능.

**근거(R/W 엣지 생성처 전수 = `ReadsWrites(` 3곳)**:
- `stage1_regex_grep/regex_table_linker.py:165` — `evidence_line = line`(`text[:m.start()].count("\n")+1`, 정확한 접근 줄). 잔여 패턴 루프(stage3)도 이 링커 재사용 → 동일.
- `step4_linking/link_dbms_tables_step.py:131` — DBMS: `evidence_line = fn.start_line`(DML을 담은 노드의 시작 줄).
- `step7_post_processing/enrich_lineage_from_catalog_step.py:78` — `evidence_line = 0` (단 이 lineage enrich는 manual §10#1의 silent no-op = 데드 경로).
- **LLM이 R/W 엣지를 직접 만드는 별도 생산처는 없음**(grep `ReadsWrites(` = 위 3곳뿐). spec의 "LLM 보강 경로 evidence_line 확인" 항목은 **해소** — 별도 LLM 직생성 경로 부재.

**Rationale**: 엣지 영속 쿼리(`reads_writes.py:24/34`)가 `SET r.evidence_line` 무조건 기록 → null 아님(framework ≥1). 

**Alternatives 기각**: analyzer에 evidence_line 추가 작업 → 불필요(이미 존재).

**라이브 확인(구현 시 1회)**: 현재 neo4j=zapamcom **framework**(READS/WRITES 25개). DBMS 전략의 엣지 형태(아래 R3)는 dbms 재분석으로 실측 — framework MVP를 막지 않음.

## R2. 코드 노드가 슬라이스 범위를 갖는가

**Decision**: 함수/프로시저/메서드 노드는 `start_line`·`end_line` 둘 다 보유 → 슬라이스 범위로 사용.

**근거**: `shared/neo4j/nodes/code_node.py:48-49`(start/end), `module.py:35-36` 등 전 노드 타입 동일. antlr AST 산물(정규식 아님 — 정확).

## R3. catalog 참조쿼리가 버리는 값 + DBMS 오너 루틴

**Decision**: catalog `fetch_table_references`가 **함수 노드 `end_line` + 엣지 `evidence_line`**를 함께 반환하도록 보강(필드 추가, 하위호환). DBMS는 접근 구문의 **오너 루틴**(PARENT_OF 상위 routine) `start_line/end_line`을 슬라이스 범위로, 구문 줄을 강조 줄로.

**근거(`service/schema_query_service.py`)**:
- fw_query(`:167`): `src.start_line`만 RETURN, `src.end_line`·`r.evidence_line` 누락 → 추가.
- proc_query(`:145`): `(s)-[:FROM|WRITES]->(t)`에서 `s`(구문)·오너 `p`(PARENT_OF* 상위 PROCEDURE/FUNCTION/METHOD/TRIGGER) 매칭은 이미 있음 → RETURN에 `p.start_line`·`p.end_line` 추가, 강조 줄=현행 `s.start_line`(statement_line).

**Rationale**: 노드 범위 슬라이스 + 접근 줄 강조를 두 전략 대칭으로. spec 044(analyzer) owner_resolver와 동일 사상(구문→오너 루틴 복원).

**Alternatives 기각**: 프론트에서 별도 노드조회 API 추가 → 라운드트립↑·계약 분산. 한 응답에 실어 보내는 게 직진.

**라이브 확인**: DBMS 재분석 후 proc_query 결과에 p 범위·s 줄이 채워지는지 실측(quickstart).

## R4. 슬라이스 시 줄번호·하이라이트·오토스크롤

**Decision**: 소스패널은 슬라이스 콘텐츠를 **실제 파일 줄번호로** 표시한다. `sourceCodePanel`에 `startLine` 추가 → 표시 줄번호 = `startLine + index`, 강조 = `evidence_line`(없으면 노드 `start_line` 폴백), 강조 줄로 오토스크롤.

**근거**: 현행 `SchemaCanvas.vue:1305` 렌더가 `index + 1`로 줄번호를 매김 → 슬라이스하면 실제 위치와 어긋남. `schemaCanvas.ts:1247` openSourceCodePanel은 `highlightedLine`만 받음(절대 줄). startLine 오프셋을 state로 흘려야 정합.

**Rationale**: 설계자/개발자가 "파일 1809줄 중 어디"를 교차참조. 1부터 재번호는 위치감 상실 → 기각.

## R5. getSourceContent slice 지원 여부

**Decision**: 추가 백엔드 작업 0. `GET /robo/source`(spec 043, `source_router.py:63`)가 이미 `start_line`·`end_line` 쿼리로 슬라이스 반환. 프론트 `api.ts:166 getSourceContent`도 이미 옵션 지원. **프론트 호출부만** `{startLine: node.start_line, endLine: node.end_line}`로 바꾸면 됨(현재 `{1,0}`=전체).

## R6. 참조 트리거 UX (사용자 위임 → 결정)

**Decision**: 테이블 노드에 **항상 보이는 참조 진입점**(참조 건수 표시)을 둔다 — 논리명/물리명 모드 무관하게 렌더되는 영역(노드 푸터/헤더 액션군)에 "🔗 참조 N" 형태. 작은 색칩(현행) 폐기.

**근거**: 현행 트리거=`TableNode.vue:498` 0.55rem 색칩, `!showLogicalNames && description_source`일 때만 렌더(논리명 모드엔 부재) → 발견성 0. 헤더 액션(`:440`)은 hover시만 보임(opacity 0→1)=발견성 약함. 푸터(`:806`)는 모드 무관 항상 렌더.

**Rationale**: "항상 보임 + 건수로 클릭 유인 + 모드 무관"이 FR-005·SC-004 충족. **정확한 시각형태·좌표는 구현 단계 Playwright 자가검증으로 확정**(사용자 위임) — tasks에서 후보 2~3개 비교.

**Alternatives 기각**: hover 액션버튼(발견성 약), 색칩 유지(현 문제).

## R7. 스키마 탭 캔버스 컨트롤 floating 일관화 (US4)

**Decision**: 그래프 탭 `GraphTab.vue:798 .floating-controls left-top` 패턴을 스키마 캔버스에 **동일 사상으로** 적용 — 캔버스 위 floating 그룹에 "테이블 보기"·논리/물리명 토글·범례를 모은다. 좌측 aside 푸터의 테이블보기 컨트롤(`SchemaCanvas.vue:970 .panel-footer`) 제거. 논리/물리명 토글 중복 마크업(`:1159` vs `:1211`)은 `NameModeSwitch` 단일 컴포넌트로 추출(DRY, todo 잔여 해소).

**Rationale**: 두 탭 컨트롤 위치 일치(SC-006). CSS는 flex/gap·상대단위(매직 px 금지, 원칙 §4).

**Alternatives 기각**: 푸터 자리 유지하고 스타일만 통일 → 위치 불일치 잔존(사용자 지적 미해소).
