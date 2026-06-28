---
description: "Task list — 044 스키마 탭 참조 UX 근본 재설계 + 컨트롤 일관화"
---

# Tasks: 스키마 탭 참조 UX 근본 재설계 + 컨트롤 배치 일관화

**Input**: `specs/044-reference-source-view/` (plan·spec·research·data-model·contracts·quickstart)

**Tests**: 별도 단위테스트 미요청. 검증 = **내가 직접** vite(3000)+Playwright 헤드리스 자가검증(원칙 §5·§6, 사용자에 미루지 않음).

**원칙 게이트(매 작업)**: ①근본=구조정리(로직/분기 추가로 늘면 땜빵 신호 → 멈춤) ②데드 즉시 제거(옛 코드 남기지 않음) ③심볼변경=전수 grep ④매직px 금지·레이아웃 계산식 ⑤조용한 실패 표면화 ⑥주석 짧게.

## Format: `[ID] [P?] [Story] Description (path)`

---

## Phase 1: Setup (베이스라인·하니스)

- [ ] T001 [P] Neo4j 직접쿼리로 현 graph(zapamcom framework) **함수 노드 end_line·READS/WRITES r.evidence_line 실재** 확인(원칙 §6, research R1 라이브 확정) — 없으면 가정 재검토
- [ ] T002 [P] Playwright 자가검증 하니스 가동 확인 — `robo-data-frontend/.unittest`의 verify_schema_source.mjs·sweep_schema_ux.mjs 실행·스토어 핸들(`$pinia._s.get('schemaCanvas')`)·탭전환(`session.activeTab='schema'`) 동작

---

## Phase 2: Foundational (US1 차단 — catalog 계약 보강)

**⚠️ 이 단계 완료 전 US1 불가. ★변경은 dev-desktop이 실행하는 서브모듈 catalog 체크아웃에(이중 체크아웃, handoff §6).**

- [ ] T003 catalog `fetch_table_references` fw_query RETURN에 `src.end_line AS end_line`·`r.evidence_line AS evidence_line` 추가 (robo-architect/robo-analyzer/robo-data-catalog/service/schema_query_service.py) — contracts/references-endpoint.md 준수
- [ ] T004 catalog `fetch_table_references` proc_query RETURN에 오너 `p.start_line AS start_line`·`p.end_line AS end_line` 추가(강조=현행 `s.start_line`=statement_line 유지) (.../schema_query_service.py)
- [ ] T005 catalog 라이브 검증(내가 직접) — `GET /robo/schema/tables/{t}/references` HTTP 호출해 end_line·evidence_line 채워져 오는지 + Neo4j 대조(원칙 §6). 서브모듈 catalog 재기동 반영 확인

**Checkpoint**: 참조 응답이 슬라이스 범위(start/end)+강조 줄을 실어 보냄 → US1 착수 가능

---

## Phase 3: User Story 1 - 노드범위 코드 + 접근 줄 강조 (P1) 🎯 MVP

**Goal**: 참조 열면 그 함수/프로시저 코드만 + 접근 줄 강조. 파일 전체 폐기, DBMS·framework 대칭.

**Independent Test**: framework 참조 클릭 → 패널이 함수 범위만·실줄번호·evidence 강조·오토스크롤 → Neo4j 원문 대조.

- [ ] T006 [P] [US1] api.ts 참조 타입에 `end_line`·`evidence_line` 추가(references·framework_references) (src/features/schema/api.ts)
- [ ] T007 [US1] schemaCanvas.ts `openSourceCodePanel`에 `startLine` 도입 + `sourceCodePanel` state에 `startLine` 반영 → ★시그니처 변경 즉시 `openSourceCodePanel` **호출부 전수 grep** 일치(원칙 §5) (src/features/schema/schemaCanvas.ts)
- [ ] T008 [US1] `openSourceFromReference`: 전체파일 fetch(`{startLine:1,endLine:0}`) **폐기** → 노드범위 `{startLine:start_line,endLine:end_line}` slice + 강조=evidence_line(폴백 start_line) (src/features/schema/components/nodes/TableNode.vue) — 데드 제거(§3)
- [ ] T009 [US1] `handleProcedureClick`·`handleFrameworkClick` 단일 경로로 통일(분기 추가 아니라 정리) — start_line/end_line/evidence_line 전달 (src/features/schema/components/nodes/TableNode.vue)
- [ ] T010 [US1] 소스패널 렌더: 표시 줄번호 = `startLine + index`, 강조 = 실제 줄, 강조줄 **오토스크롤**(R4) (src/features/schema/components/SchemaCanvas.vue)
- [ ] T011 [US1] 방어: 강조줄이 [start,end] 밖이면 강조 생략(패널 비깨짐), evidence 0/누락 시 start_line 폴백 (TableNode.vue / SchemaCanvas.vue)
- [ ] T012 [US1] Playwright 자가검증(내가 직접): SC-001(함수범위만)·R4(실줄번호)·SC-002(강조 보임·오토스크롤) + Neo4j 대조 (quickstart US1)

**Checkpoint**: 참조 열기 = 노드범위 함수코드 + 접근 줄 강조 동작(MVP)

---

## Phase 4: User Story 2 - 참조 트리거 발견성 (P2)

**Goal**: 어디 눌러야 하는지 분명·논리/물리명 무관·무반응 해소.

**Independent Test**: 두 모드에서 트리거가 항상 보이고 클릭 가능(스샷 2장 Read).

- [ ] T013 [US2] 트리거 재설계: 작은 색칩(`.table-node__description-badge @click`) **폐기** → 모드 무관 항상 보이는 "참조 N" 진입점 (src/features/schema/components/nodes/TableNode.vue) — 데드 제거(§3)
- [ ] T014 [US2] 참조 건수 노출 + 참조 0 처리(트리거 숨김/비활성 결정) (src/features/schema/components/nodes/TableNode.vue)
- [ ] T015 [US2] Playwright 자가검증(내가 직접): 논리명·물리명 양쪽 트리거 발견성·클릭(FR-005·SC-004) 스샷 (quickstart US2)

**Checkpoint**: 참조 진입점이 발견 가능·모드 무관

---

## Phase 5: User Story 4 - 캔버스 컨트롤 floating 일관화 (P2)

**Goal**: "테이블 보기"·논리/물리 토글·범례를 그래프 탭처럼 캔버스 위 floating 그룹으로. 좌측 푸터 박힘 제거.

**Independent Test**: 그래프탭 vs 스키마탭 컨트롤 위치 일치·테이블보기 캔버스 위(스샷 대조).

- [ ] T016 [P] [US4] `NameModeSwitch.vue` 추출 — 논리/물리명 토글 중복 마크업(SchemaCanvas 두 곳) 단일화 (src/features/schema/components/) — DRY(§4)
- [ ] T017 [US4] 스키마 캔버스 floating 컨트롤 그룹 신설(그래프 `GraphTab.vue .floating-controls left-top` 사상) — 테이블보기+NameModeSwitch+범례 수용, **flex/gap·상대단위(매직px 금지 §4)** (src/features/schema/components/SchemaCanvas.vue)
- [ ] T018 [US4] aside `.panel-footer` 테이블보기 컨트롤 **제거** 후 floating으로 이전(데드 §3) (src/features/schema/components/SchemaCanvas.vue)
- [ ] T019 [US4] Playwright 자가검증(내가 직접): SC-006 두 탭 컨트롤 위치 일치·테이블보기 캔버스 위 스샷 대조 (quickstart US4)

**Checkpoint**: 두 탭 컨트롤 일관

---

## Phase 6: User Story 3 - 없음 vs 불러오기 실패 구분 (P3)

**Goal**: 조용한 빈 화면 제거 — "참조 없음"과 "실패+재시도" 구분.

**Independent Test**: 참조0 테이블 vs 강제실패 두 화면이 구분되고 실패엔 재시도.

- [ ] T020 [US3] `loadProcedureReferences`/`loadColumnReferences` catch→빈배열(조용한 실패) **제거** → `referencesError` 상태(§3 조용한실패 표면화) (src/features/schema/components/nodes/TableNode.vue)
- [ ] T021 [US3] 참조 팝업: "참조 없음" vs "불러오기 실패 + 재시도" 분기 렌더(FR-006) (src/features/schema/components/nodes/TableNode.vue)
- [ ] T022 [US3] 소스패널 `loadError`(소스 fetch 실패 ≠ notFound) + 재시도 (src/features/schema/schemaCanvas.ts / SchemaCanvas.vue)
- [ ] T023 [US3] Playwright 자가검증(내가 직접): 참조0 vs 실패 두 화면 구분 스샷(SC-005) (quickstart US3)

**Checkpoint**: 정직한 빈/에러 상태

---

## Phase 7: Polish & 횡단

- [ ] T024 [P] 죽은 CSS 전수 제거 — 옛 색칩 미사용 스타일·죽은 닫기버튼 CSS(`.modal-close`/`.source-panel-close`/`.detail-panel__close`/`.close-btn` 중 미사용, todo 043 잔여) grep 후 제거(§3)
- [ ] T025 [P] 최종 심볼 전수 grep 스윕 — `openSourceCodePanel`·참조 타입 신규 필드 잔재/누락 0(§5)
- [ ] T026 sweep_schema_ux.mjs 전체 스윕 — console pageerror·FATAL 0, 043 무회귀(닫기버튼·패널 상호배타)(§6 회귀금지)
- [ ] T027 quickstart 전체 1회 완주(내가 직접) — US1~4 + 회귀
- [ ] T028 (DBMS) dbms 재분석 후 proc_query 오너범위·구문줄 라이브 검증 — framework MVP와 분리(데이터 준비 시, contract 라이브)
- [ ] T029 memory `todo.md` 갱신 — 044 진행/완료, 043 잔여(토글 DRY·죽은 CSS) 해소 표기

---

## Dependencies & Execution Order

- **Setup(P1)**: 즉시.
- **Foundational(P2: T003-5)**: Setup 후. **US1 차단**.
- **US1(P3): T006-12**: Foundational 완료 후(catalog가 end/evidence 반환해야 슬라이스).
- **US2(T013-15)·US4(T016-19)·US3(T020-23)**: 프론트 전용 — Foundational 불요, Setup 후 독립 착수 가능(우선순위 순서로 진행). 서로 독립·독립 테스트.
- **Polish(P7)**: 원하는 스토리 완료 후.

### Within story
- 데이터/타입 → store → 컴포넌트 렌더 → 자가검증. 스토리 완료 후 다음 우선순위.

### Parallel
- T001·T002 병렬. T006·T016·T024·T025 [P] 병렬 가능(다른 파일). 스토리 간 병렬 가능(독립).

---

## Implementation Strategy

- **MVP = US1**: Setup → Foundational(catalog) → US1 → **STOP & 자가검증**(가장 큰 가치: 노드범위+강조).
- 이후 US2 → US4 → US3 증분, 각 단계 독립 자가검증.
- 각 단계 **근본=구조정리** 자문: 코드가 줄거나 통합되는가? 분기/플래그가 늘면 멈추고 재설계(§1·§3).

## Notes

- 커밋 = **내 파일만**(사용자 WIP 보호), 신원 ahnchiyoon87(handoff/manual §7). catalog는 서브모듈 체크아웃.
- Electron 무관 — 검증은 vite(3000). Electron 재기동은 사용자 명시 신호 때만.
- 각 [US*] 마지막 자가검증 task는 **내가 직접** 수행(스샷 Read·콘솔·Neo4j 대조), "확인해보세요" 금지.

---

## ✅ 구현·검증 결과 (2026-06-28, 내가 직접 vite 3000 + Playwright)

**코드 완료**: T003·T004(catalog) / T006~T011(US1) / T013·T014(US2) / T016~T018(US4) / T020~T022(US3) / T024·T025(데드CSS·grep). 신규 `NameModeSwitch.vue`.

**라이브 검증 통과**:
- US4(T019): floating 좌상단에 테이블보기+논리물리 토글, 옛 푸터 컨트롤 0 — 스샷 확인 ✓
- US2(T015): "🔗 참조" 트리거 물리명·논리명 양쪽 렌더(1/1) — 스샷 확인 ✓
- US3(T023): 트리거→팝업 "참조 없음" 표시(에러 아님, 재시도 버튼 0) ✓
- US1 메커니즘(T012 일부): `/robo/source` 슬라이스 = 요청 136~151 → **16줄만 반환**(전체 1809줄 아님) ✓
- 회귀(T026): pageerror·FATAL 0(콘솔 404/SSE는 text2sql 8000 미기동 환경요인)
- 컴파일: `npx vite build` 통과(오류 0)

**US1 전체 흐름 검증 완료(T012, 사용자 framework 재분석 복구 후 2026-06-29)**:
- zpay_ap_smpay_rgst_tmp → "🔗 참조" → 팝업 **2건(쓰기 evidence 2034 / 읽기 evidence 2048, 접근지점별 N행)** → 첫 항목 클릭 → 소스패널:
  - 함수 d510_..._creat_proc, **startLine 1795 ~ 2156 = 362줄만**(전체 파일 아님) → SC-001 ✓
  - 표시 줄번호 = 실제 파일 줄(1795~2156, 1부터 아님) → R4 ✓
  - **강조줄 2034 = `rc = mpfmdbio("zpay_ap_smpay_rgst_tmp_i0001", ...)`** = 이 테이블 쓰는 그 줄 → FR-002 ✓, 오토스크롤로 중앙 → SC-002 ✓
  - notFound/loadError 0, pageerror 0
- **catalog 계약 실값 확인**: 응답 start_line=1795·end_line=2156·evidence_line=2034(WRITES)/2048(READS) 채워짐 → T005 ✓
- **T028**: framework 재분석으로 R/W·CALLS 복구 완료(사용자). zapamcom=framework 전략 필수(todo 확정). dbms 라이브는 PL/SQL 소스 있을 때 후속.

**★구조 발견(MERGE 한계)**: framework R/W 엣지는 `MERGE (src)-[r]->(t)`로 (함수,테이블,관계)당 1개만 영속 → evidence_line은 관계당 1줄(여러 접근줄 전부 보존 안 됨). "접근 지점별 N행"은 DBMS(구문노드별)는 자연 충족, framework는 관계당 대표 1줄. 전(全) 접근줄 보존은 analyzer evidence_lines 리스트화 = 후속.
