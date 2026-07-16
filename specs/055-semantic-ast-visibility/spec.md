# Feature Specification: 의미 AST 뼈대 노드 표시/숨김 + 폴백 스트림 표시

**Feature Branch**: `055-semantic-ast-visibility`

**Created**: 2026-07-15

**Status**: Draft

**Input**: analyzer spec 054가 그래프에 보존하는 구조 노드(제어문 + 호출/생성/import)를 화면에서 기본
숨기고 "숨긴 요소 모두 보기"에서 함수 아래 중첩 표시한다. 상위 계약:
`../../antlr-code-parser/specs/007-semantic-control-flow-ast/contracts/ast-node-vocabulary.md`,
`../../robo-data-analyzer/specs/054-.../contracts/stream-events.md`.

## 배경과 현재 사실 (조사 완료)

- `graphVisibility.ts`의 `HIDDEN_NODE_LABELS`가 기본 숨김을 결정한다. 현재 `EXTERNAL, VARIABLE, CONSTANT,
  …, RULE, EXAMPLE, QUESTION` 등을 숨기지만 `IF/ELSE/LOOP/SWITCH/CASE/FUNCTION_CALL/NEW_INSTANCE/IMPORT`은
  목록에 없다(애초에 프론트에 존재한 적 없음 — analyzer가 안 보냈으므로).
- `PARENT_OF`는 `HIDDEN_LINK_TYPES`에 없어 독립적으로 숨겨지지 않는다. 자식 노드가 숨겨지면 화면에서
  관계도 자연히 사라진다. `showHidden=true`면 시스템 노드를 제외한 기본 숨김이 해제된다(`navigator.ts`
  `isExcluded`: `if (showHidden) return false`).
- `navigator.ts`의 `buildSubtree`/`buildChildIndexes`가 `PARENT_OF` 자식을 `astChildren`으로 모아
  `start_line` 순 정렬한다(이미 중첩·정렬 구현). 단, 주석·설명이 **DBMS 전용**으로 적혀 있다(`// DBMS
  구문(PARENT_OF)`, `// 1) PARENT_OF 부모를 가진 노드(=DBMS 구문) 집합` 등) → Framework 제어문까지 포함하는
  공통 표현으로 일반화 필요.
- 노드 스타일: `graphStyles.ts::getNodeColor`가 라벨 해시 기반 결정색을 쓰므로 **새 라벨도 명시 맵 없이
  색을 받는다**. `nodeClassify.ts`는 미매칭 statement에 첫 글자 badge를 준다(C: CASE/CATCH 충돌 주의).
- 노드 상세: `templateRouter.ts::pickTemplate`가 DML 외 구문 노드(IF/LOOP/CASE 등, `code_text` 보유)를
  `sqlStatement` 카드로 라우팅한다(주석: "DML 외 DBMS 구문도 코드 노드면 구문 카드로"). `SqlStatementCard`는
  입력/출력/원문 섹션만 있고 **Rules/Examples 섹션 없음**(`FunctionCard`만 그 섹션 보유). → 구조 노드는
  이미 규칙/예시 칸을 안 만든다(단, 명칭이 SQL 전용이라 Framework 일반화 필요).
- `analyzer.ts::applyProcessingEvent`가 `entity_kind`별 dedup + `PROGRESS_THROTTLE[rawKind] ?? 5` throttle을
  적용한다. 새 `entity_kind="Fragment"`(폴백)를 자연 수용하나 표시 문구·throttle 조정 여지 있음.
- **주의(보존)**: 현재 dirty WIP는 `NodeDetailPanel.vue`(검색 클러스터 팝업)·`src/shared/types/index.ts`
  (`ClusterNode.role`)이며, untracked `specs/054-search-anchor-display/`는 무관 기능. 이 스펙은 그와
  충돌하지 않게 별도 파일 중심으로 작업한다.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 기본 화면은 함수까지만, "숨긴 요소 모두 보기"에서 뼈대가 보인다 (Priority: P1)

기본 그래프/Navigator는 클래스·파일 아래 함수/메서드까지만 보인다. "숨긴 요소 모두 보기"를 켜면 함수 아래
`IF→FUNCTION_CALL`, `LOOP→IF→…` 같은 구조 노드가 `PARENT_OF` 중첩으로, 소스 라인 순으로 나타난다.

**Why this priority**: 사용자가 요구한 핵심 UX. 기본 화면 노이즈 없이, 필요할 때만 뼈대 확인.

**Independent Test**: 제어문 있는 C 함수 분석 그래프에서 기본/숨김보기 두 상태를 캡처해, 기본은 구조 노드
비노출, 숨김보기는 중첩·라인정렬 노출을 확인.

**Acceptance Scenarios**:

1. **Given** 구조 노드가 있는 분석 결과, **When** 기본 화면, **Then** IF/LOOP/FUNCTION_CALL/NEW_INSTANCE/
   IMPORT가 그래프·Navigator에 보이지 않는다.
2. **Given** 같은 결과, **When** "숨긴 요소 모두 보기" ON, **Then** 함수 아래 `FUNCTION→IF→(중첩 IF/
   FUNCTION_CALL)` 구조가 PARENT_OF 중첩·`start_line` 순으로 보인다.
3. **Given** GLOSSARY/EMBED_META 등 시스템 노드, **When** 숨김보기 ON, **Then** 이들은 여전히 노출되지
   않는다(시스템 노드 예외 유지).

---

### User Story 2 - 구조 노드 상세는 기본 정보만, 규칙/예시 칸이 없다 (Priority: P1)

구조 노드(IF·FUNCTION_CALL 등)를 클릭하면 위치·이름·자기 원문(`code_text`)까지만 보이고, 요약/규칙/예시/
도메인 용어 같은 LLM 산물 칸은 아예 없다(analyzer가 그 필드를 안 채우므로).

**Why this priority**: 구조 노드는 분석 대상이 아니라는 계약을 화면이 지켜야 사용자 혼동이 없다.

**Independent Test**: 구조 노드 상세 패널을 열어 규칙/예시/요약 섹션이 렌더되지 않고 원문·위치만 보이는지
확인.

**Acceptance Scenarios**:

1. **Given** IF 노드, **When** 상세 열기, **Then** 규칙·예시·요약·도메인용어 섹션이 없고 원문 코드·라인·
   소속만 보인다.
2. **Given** FUNCTION_CALL 노드, **When** 상세 열기, **Then** 호출 이름·위치·원문만 보인다.

---

### User Story 3 - 폴백·인덱스 진행이 실시간 콘솔에 보인다 (Priority: P2)

analyzer가 보내는 폴백 이벤트(감지→분할→조각→병합→재검사)와 보강된 후처리/인덱스 이벤트가 processing
콘솔에 순서대로, 과도한 중복 없이 나타난다.

**Why this priority**: 사용자가 폴백이 실제로 동작하는지 화면에서 확인하려는 요구.

**Independent Test**: 폴백을 타는 분석 실행 중 processing 콘솔을 캡처해 단계 이벤트가 보이는지, 콘솔·
네트워크 오류가 없는지 확인.

**Acceptance Scenarios**:

1. **Given** 폴백 이벤트 스트림, **When** 분석 진행, **Then** 감지/분할/조각/병합/재검사가 콘솔에 표시된다.
2. **Given** 다건 이벤트, **When** 표시, **Then** 기존 throttle/dedup으로 폭주 없이 요약 표시된다.

### Edge Cases

- **badge 첫 글자 충돌**: C의 `CASE`/`CATCH`/`CLASS`가 모두 'C' badge가 될 수 있음 → 구조 노드는 라벨
  텍스트 배지 또는 명시 표기로 구분(작은 표식은 표준 라벨로 뜻 설명 — UI 원칙).
- **깊은 중첩**: `LOOP→IF→IF→FUNCTION_CALL` 다단 중첩에서 Navigator 들여쓰기·정렬이 흔들리지 않아야 함.
- **구조 노드 대량**: 큰 함수의 숨김보기에서 노드 수 급증 시 그래프 성능·레이아웃 확인.

## Requirements *(mandatory)*

- **FR-001**: `graphVisibility.ts::HIDDEN_NODE_LABELS`에 `IF, ELSE, LOOP, SWITCH, CASE, TRY, CATCH,
  FUNCTION_CALL, NEW_INSTANCE, IMPORT, INCLUDE`를 추가해 기본 숨김 처리한다. `TRY/CATCH`는 C 범위엔 없지만
  Java/Python 확장 시 프론트 무변경(스펙 Assumption)을 위해 미리 포함한다(어휘 계약 §1의 예약 타입).
- **FR-002**: `showHidden=true`에서 위 구조 노드와 그 `PARENT_OF` 중첩이 함수 아래 노출되어야 한다. 시스템
  노드(GLOSSARY/EMBED_META 등) 예외는 유지한다.
- **FR-003**: `navigator.ts`의 PARENT_OF 중첩 로직에 붙은 DBMS 전용 주석·명칭을 Framework 제어문까지 포함
  하는 공통 의미 AST 표현으로 일반화한다(로직 동작은 유지, 표현만 공통화).
- **FR-004**: 구조 노드 상세는 `code_text`·이름·라인·소속만 렌더하고 규칙/예시/요약/도메인용어 섹션을
  렌더하지 않는다. `templateRouter`가 구조 노드를 구문 카드로 라우팅하는 기존 동작을 Framework에도 적용하고,
  카드 명칭/문구가 SQL 전용이 아니라 언어 무관이 되도록 확인·정리한다.
- **FR-005**: 구조 노드 badge/라벨이 서로 구분되게 표시한다(첫 글자 충돌 회피 — 표준 라벨 표기).
- **FR-006**: `analyzer.ts`가 새 `entity_kind="Fragment"` 폴백 이벤트를 표시하고, 필요 시 표시 문구·
  throttle을 조정한다(`stream-events.md` 계약).
- **FR-007**: 실제 브라우저에서 기본/숨김보기, 중첩·정렬, 폴백 콘솔, console/network 오류를 검증한다(단위
  테스트만으로 완료하지 않음).

## Success Criteria *(mandatory)*

- **SC-001**: 기본 화면에서 구조 노드 노출 0건, 숨김보기에서 `FUNCTION→IF→FUNCTION_CALL` 중첩이 라인 순
  표시(실제 브라우저 캡처).
- **SC-002**: 구조 노드 상세에 규칙/예시/요약 섹션 0건, 원문·위치 표시 정상.
- **SC-003**: 폴백을 타는 실행에서 감지→분할→조각→병합→재검사 이벤트가 콘솔에 표시되고 console/network
  오류 0건.
- **SC-004**: 제어문 없는 기존 분석 그래프의 기본 화면이 이번 변경 전과 동일(회귀 0).

## Assumptions

- analyzer spec 054가 구조 노드를 결정론 필드만 채워 보내고 LLM 필드는 비운다(빈 규칙/예시가 오지 않음).
- 노드 색은 `graphStyles.ts` 해시 기반 자동 배정으로 충분(명시 맵 불필요). 필요 시 제어문군 전용 색만 추가.
- Java/Python 구조 노드도 같은 라벨(IF/LOOP 등)이라 언어 확장 시 프론트 추가 변경 없음(어휘 공통).
