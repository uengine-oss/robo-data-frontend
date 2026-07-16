# Tasks: 의미 AST 뼈대 표시/숨김 + 폴백 스트림

**Input**: `spec.md`, `plan.md`,
`../../antlr-code-parser/specs/007-semantic-control-flow-ast/contracts/ast-node-vocabulary.md`,
`../../robo-data-analyzer/specs/054-.../contracts/stream-events.md`
**Tests**: 타입체크 + 실물 브라우저 캡처(필수). Playwright 미설치 — 수동/스크립트 캡처.
**전제**: analyzer 054가 구조 노드를 그래프에 보내야 US1/US2 실물 검증 가능. 로직 변경은 선행 가능.

## Phase 1: Setup

- [x] T001 현재 dirty WIP(`NodeDetailPanel.vue`, `src/shared/types/index.ts`)와 untracked
      `specs/054-search-anchor-display/` 범위를 확인하고, 이번 작업이 건드릴 파일과 겹치지 않게 경계 확정.

## Phase 2: User Story 1 — 기본 숨김 / 숨김보기 중첩 (P1) 🎯

### Implementation

- [x] T002 [US1] `graphVisibility.ts::HIDDEN_NODE_LABELS`에 `IF, ELSE, LOOP, SWITCH, CASE, TRY, CATCH,
      FUNCTION_CALL, NEW_INSTANCE, IMPORT, INCLUDE` 추가(TRY/CATCH는 Java/Python 확장 대비 예약).
      `PARENT_OF`는 `HIDDEN_LINK_TYPES`에 넣지 않음.
- [x] T003 [US1] `navigator.ts` PARENT_OF 중첩 로직의 DBMS 전용 주석·변수·타입 명칭을 "의미 AST 구조 노드"
      공통 표현으로 일반화(로직 무변경, `start_line` 정렬 유지).
- [ ] T004 [P] [US1] `nodeClassify.ts` — 구조 노드 badge/라벨 구분(CASE/CATCH/CLASS 첫 글자 충돌 회피,
      라벨 텍스트 표기).
- [ ] T005 [P] [US1] (선택) `graphStyles.ts`에 제어문군 전용 색 추가(해시 자동색으로 충분하면 생략).

### Verify

- [ ] T006 [US1] `vue-tsc --noEmit` 통과.

**Checkpoint**: 로직상 기본 숨김/숨김보기 준비 완료(실물 검증은 Phase 5).

---

## Phase 3: User Story 2 — 구조 노드 상세(규칙/예시 없음) (P1)

- [ ] T007 [US2] `templateRouter.ts` — Framework 구조 노드(`code_text` 보유, 비-DML, 비-callable)가 구문
      카드로 라우팅되는지 확인/보정. 함수만 `FunctionCard`(규칙/예시 섹션).
- [ ] T008 [US2] 구문 카드(`SqlStatementCard.vue` 또는 공통화한 `StatementCard`) 명칭·문구를 SQL 전용에서
      언어무관으로 정리(원문·위치·소속만, 규칙/예시 없음).

**Checkpoint**: 구조 노드 상세에 LLM 산물 칸 없음.

---

## Phase 4: User Story 3 — 폴백 스트림 표시 (P2)

- [ ] T009 [US3] `analyzer.ts::applyProcessingEvent` — `entity_kind="Fragment"` 표시 문구 추가(감지/분할/
      조각/병합/재검사). 필요 시 `PROGRESS_THROTTLE["Fragment"]` 조정.

---

## Phase 5: 실물 검증 (UI 원칙 — 필수)

- [ ] T010 analyzer 054 + parser 007(C) 완료 후, 제어문 있는 C 분석 실행 → 실제 브라우저에서:
      (a) 기본 화면 구조 노드 비노출, (b) 숨김보기 ON 시 `FUNCTION→IF→FUNCTION_CALL` 중첩·라인정렬,
      (c) 구조 노드 상세 규칙/예시 없음·원문 표시, (d) 폴백 콘솔 이벤트, (e) console/network 오류 0건 캡처.
- [ ] T011 DBMS 분석 그래프로 Navigator 일반화 회귀 확인(기존 DBMS 구문 표시 안 깨짐).
- [ ] T012 제어문 없는 기존 그래프 기본 화면이 변경 전과 동일(회귀 0) 확인.

## Dependencies & Execution Order

- Setup(T001) → US1(T002-6) → US2(T007-8) → US3(T009) → 실물 검증(T010-12, analyzer/parser 완료 후).
- T004/T005는 T002/T003과 다른 파일이라 병렬.
- 커밋은 사용자 요청 시에만. WIP 보존.
