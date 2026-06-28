---
description: "Task list — 045 스키마 탭 & 그래프 탐색 UI/UX 모던화 정합"
---

# Tasks: 스키마 탭 & 그래프 탐색 UI/UX 모던화 정합

**Input**: `specs/045-schema-graph-nav-ux/` (plan·spec·research·data-model·quickstart)

**Tests**: 단위테스트 미요청. 검증 = **내가 직접** vite(3000)+Playwright 헤드리스 스크린샷 Read(원칙 §6, manual §3) + `npx vite build` 컴파일 게이트. ★UI 작업은 **스크린샷 필수**(사용자 명시).

**원칙 게이트(매 작업)**: ①SDD ②근본=구조정리(분기 늘면 멈춤) ③데드 즉시 제거 ④심볼변경=전수 grep ⑤매직px 금지·flex/grid ⑥일관성([[ui-principles]]: 같은 의미=같은 색·위치, 지그재그 금지, 마커 의미 읽히게, 잘된 컴포넌트 기준).

**범례**: US1~US4 = 이번 세션 **이미 구현**(구현 task는 [x], 사후 검증 task는 [ ]). US5·US6 = **미구현**.

## Format: `[ID] [P?] [Story] Description (path)`

---

## Phase 1: Setup (하니스)

- [x] T001 Playwright 자가검증 하니스 가동 확인 — `robo-data-frontend/.unittest`(스토어 핸들 `$pinia._s.get('schemaCanvas'|'analyzer'|'canvas'|'session')`, 탭전환 `session.activeTab`)
- [ ] T002 풀스택 기동 확인 — gateway 9000·analyzer 5502·catalog 5503·Neo4j 7687·vite 3000, 분석데이터(zapamcom framework) 존재

---

## Phase 2: Foundational

> 차단 작업 없음 — 공유 유틸(`kindOf`·`getNodeColor`·논리/물리명)이 이미 존재하고 단일 출처로 재사용된다(FR-019). 신규 영속·계약 0.

---

## Phase 3: User Story 1 - 테이블 카드 일관·정렬 (P1) — ✅ 구현됨

**Goal**: 컬럼 행 이름|마커|타입 일관 정렬, NOT NULL 주황 별표, 긴 이름 ellipsis. **Independent Test**: quickstart US1.

- [x] T003 [US1] 카드 컬럼 행 = 이름(flex) | 마커(PK/FK·NOT NULL `*` 타입 앞 딱붙임) | 타입(맨오른쪽 고정) flex 재설계 (src/features/schema/components/nodes/TableNode.vue)
- [x] T004 [US1] NOT NULL = 주황 별표(`*`) 마커 + 범례 설명, 타입 간단표기 `simpleType` (src/features/schema/components/nodes/TableNode.vue)
- [x] T005 [US1] 카드 고정폭 300px → 긴 이름 ellipsis(마커·타입 유지), 데드 `getColumnTypeShort` 제거 (src/features/schema/components/nodes/TableNode.vue)
- [ ] T006 [US1] Playwright 자가검증(스샷 Read) — FK·NOT NULL·14열·긴 논리명 카드: 정렬·ellipsis·마커 위치 (quickstart US1)

---

## Phase 4: User Story 2 - 상세패널 카드와 일관·깔끔 (P1) — ✅ 구현됨

**Goal**: NOT NULL 주황·타입 정렬(지그재그 0)·배경 카드 구분·파란선 제거. **Independent Test**: quickstart US2.

- [x] T007 [US2] NOT NULL 고정 슬롯 + 주황 배지(카드와 색 일관), 타입 모든 행 같은 위치(지그재그 제거) (src/features/schema/components/TableDetailPanel.vue)
- [x] T008 [US2] 각 컬럼 = 배경 단일 카드(이중박스·is-fk/is-pk 색 좌측선 제거), 분석의미 파란 accent 제거, 줄바꿈 keep-all, 데드 `column-item__real-name` 제거 (src/features/schema/components/TableDetailPanel.vue)
- [ ] T009 [US2] Playwright 자가검증(스샷 Read) — 카드↔패널 NOT NULL 색 일치·타입 정렬·배경 구분·파란선 없음 (quickstart US2)

---

## Phase 5: User Story 3 - 사이드바 구분 + 컨트롤 상시 (P2) — ✅ 구현됨

**Goal**: on-canvas 흐림+초록점 맨오른쪽(네비게이터 동일), 컨트롤 상시. **Independent Test**: quickstart US3.

- [x] T010 [US3] 사이드바 on-canvas = 흐림 + 초록점(●) 맨 오른쪽(margin-left:auto), hover 시 × 교체(display none↔inline-flex) (src/features/schema/components/SchemaCanvas.vue)
- [x] T011 [US3] 범례 "카드 표기" = NOT NULL(`*`)만 설명(PK/FK 제거=컬럼명 자명), 데드 `legend-tag` CSS 제거 (src/features/schema/components/SchemaCanvas.vue)
- [x] T012 [US3] 논리/물리 토글·비우기 캔버스 노드 의존 제거 → 상시 표시(비우기는 빈 캔버스 시 `:disabled`) (src/features/schema/components/SchemaCanvas.vue)
- [ ] T013 [US3] Playwright 자가검증(스샷 Read) — on-canvas 초록점 우측끝·선택 하이라이트·빈 캔버스서 컨트롤 표시 (quickstart US3)

---

## Phase 6: User Story 4 - 그래프 노드검색 의미·소속·종류 (P2) — ✅ 구현됨

**Goal**: 논리명 우선·소속·종류 배지(실제색)·실제 개수·스크롤 전체 도달. **Independent Test**: quickstart US4.

- [x] T014 [US4] 검색 결과 = 종류 배지(`kindOf`=실제 노드색) + 논리명 우선(`searchPrimary`) + 물리명·소속(`searchSecondary`), 소속=id 계층 prefix (src/features/code-analysis/components/graph/NodeDetailPanel.vue)
- [x] T015 [US4] 결과 cap(`MAX_SEARCH_RESULTS`) 제거 → 실제 전체 개수·드롭다운 스크롤 전체 도달, 행 컴팩트·세로 가운데·각 필드 ellipsis, 데드 `getNodeDisplayName` 제거 (src/features/code-analysis/components/graph/NodeDetailPanel.vue)
- [ ] T016 [US4] Playwright 자가검증(스샷 Read) — "auth" 검색: 논리명 우선·소속·종류 배지·실제개수·스크롤 하단 도달 (quickstart US4)

---

## Phase 7: User Story 5 - 스키마탭 검색 그래프 톤 정합 (P2) 🎯 미구현

**Goal**: 스키마탭 검색결과를 US4 톤(논리명 우선·소속·컴팩트·종류 표시)으로 정합, 푸르딩딩·칙칙함 제거. **의미검색 보존**. **Independent Test**: quickstart US5.

- [ ] T017 [US5] 스키마탭 검색결과(이름검색) 마크업 = NodeDetailPanel 검색과 같은 구성(종류/아이콘 + 논리명 우선 + 소속(스키마)) 으로 재설계, 트리 가이드선·칙칙한 톤 제거 (src/features/schema/components/SchemaCanvas.vue)
- [ ] T018 [US5] 의미검색(semantic-section) 톤 정합(유사도 % 유지) — **기능 보존**, 키 미설정 등은 정직 안내 (src/features/schema/components/SchemaCanvas.vue)
- [ ] T019 [P] [US5] 검색결과 CSS = US4와 일관(컴팩트 행·세로중앙·ellipsis·매직px 금지), 죽은 CSS(`.table-item__info`·`--search-result`·옛 톤) grep 후 제거 (src/features/schema/components/SchemaCanvas.vue)
- [ ] T020 [US5] Playwright 자가검증(스샷 Read) — 스키마탭 "card" 검색: US4와 같은 톤·논리명·소속·의미검색 섹션 보존 (quickstart US5)

---

## Phase 8: User Story 6 - 상단 전체검색 현재 탭 맥락 (P3) 🎯 미구현

**Goal**: 상단 전체검색을 `activeTab` 기준 라우팅(그래프→노드검색, 스키마→테이블검색), placeholder 탭 따라 정직, 빈 장식 정리. **Independent Test**: quickstart US6.

- [ ] T021 [US6] TopToolbar 검색을 **현재 탭 맥락 라우팅** — 그래프 탭=노드검색, 스키마 탭=테이블검색으로(기존 검색 재사용), 분기 추가 아닌 단일 라우팅 (src/shared/components/TopToolbar.vue)
- [ ] T022 [US6] placeholder를 **현재 탭에 맞게 동적**(거짓 표기 제거), "All▾"·"⌘K" 빈 장식 실제 동작 연결 또는 제거(데드 §3) (src/shared/components/TopToolbar.vue)
- [ ] T023 [US6] Playwright 자가검증(스샷 Read) — 그래프/스키마 탭 각각 입력 시 맞는 검색 동작·placeholder 일치·빈 장식 0 (quickstart US6)

---

## Phase 9: Polish & 횡단

- [ ] T024 [P] 데드/끊김 전수 grep — 제거 심볼(getColumnTypeShort·MAX_SEARCH_RESULTS·col-key·legend-tag·real-name·스키마검색 죽은 CSS) 참조 0(§5) (src/)
- [ ] T025 일관성 최종 점검(FR-019) — NOT NULL 색·온캔버스 초록점·종류색이 카드·패널·사이드바·검색 어디서나 동일(스샷 대조)
- [ ] T026 회귀 스윕 — `sweep_schema_ux.mjs` + 그래프/스키마 검색, pageerror 0·신규 JS 에러 0, 기존 기능(핸들·참조팝업·소스패널·데이터조회·의미검색) 정상
- [ ] T027 컴파일 게이트 — `npx vite build` exit 0
- [ ] T028 memory `todo.md` 갱신 — 045 진행/완료 표기, 핸드오프 v6 잔여 해소
- [ ] T029 커밋 여부 사용자 확인 — 내 파일만(사용자 WIP 보호), 신원 ahnchiyoon87

---

## Dependencies & Execution Order

- **Setup(T001-2)**: 즉시.
- **US1~US4(T003-16)**: 구현 완료 → **검증 task(T006·T009·T013·T016)만 남음**. 독립.
- **US5(T017-20)**: Setup 후 착수. US4 톤을 기준으로 정합(참조만, 의존 아님).
- **US6(T021-23)**: Setup 후 착수. 기존 탭 검색 재사용(US4·US5 산출 활용 가능하나 독립).
- **Polish(T024-29)**: US5·US6 완료 후.

### Within story
- 마크업/데이터 → CSS·톤 → 자가검증(스샷). 스토리 완료 후 다음.

### Parallel
- T019·T024 [P]. US5·US6 서로 독립(다른 파일: SchemaCanvas vs TopToolbar).

## Implementation Strategy

- **즉시 가치 = US5**(스키마탭 검색, 사용자 직접 요청) → 구현·스샷검증 → US6(상단 전체검색).
- US1~4는 회귀만 막고 사후 스샷 검증으로 spec 충족 확인.
- 각 단계 **근본=구조정리** 자문(분기/플래그 늘면 멈춤), **데드 즉시 제거**, **UI는 스샷 필수**.

## Notes

- 커밋 = **내 파일만**, 신원 ahnchiyoon87(manual §7). 단일 체크아웃(robo-data-frontend).
- Electron 무관 — 검증은 vite(3000). 의미검색 **기능 삭제 절대 금지**(FR-016).
