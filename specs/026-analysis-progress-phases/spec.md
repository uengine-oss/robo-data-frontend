# Feature Specification: 분석 진행 표시 7단계 재구성

**Feature Branch**: `026-analysis-progress-phases`

**Created**: 2026-06-26

**Status**: Draft

**Input**: 분석 진행 패널이 백엔드 leaf 스텝 ~17개를 평평하게 "단계"로 나열해 ① 내부 구현 용어가 비개발자에게 노출되고 ② 실제 파이프라인 단계 구조(7단계)가 안 보인다. 진행 패널을 실제 7단계로 묶고, 진행 중 단계엔 현재 세부 작업을 사용자 표현 한 줄로만 보여준다.

## 배경 (왜)

분석을 돌리면 진행 패널이 단계 진행을 보여준다. 현재 표시는 analyzer가 흘려보내는 개별 leaf 스텝(예: `link_calls_by_name_step`)을 한글 라벨로 1:1 변환해 **평평하게 나열**한다. 그 결과:

- **내부 용어 노출**: "호출 이름 분류"(호출을 internal/external/drop으로 결정론 분류하는 내부 작업), "테이블 샘플 조회"(LLM 시나리오용 샘플행 미리받기 — datasource 없으면 skip), "잔여 패턴 연결" 등 구현 용어가 그대로 보인다. 사용자(비개발자)는 무슨 일인지 모른다.
- **구조 상실**: analyzer 파이프라인은 실제로 7개 상위 단계(`analysis_flow/step1~step7`)로 묶여 있는데, 화면은 그 묶음을 버리고 leaf만 평평하게 보여 "단계"가 17개처럼 읽힌다. 어디까지 왔는지 큰 흐름이 안 잡힌다.
- **노이즈**: skip된 세부(framework 런의 테이블 샘플 조회 등)도 단계처럼 보인다.

진실의 출처(7단계 정의) = analyzer `analysis_flow` 디렉토리 구조:

| # | 상위 단계 | 포함되는 leaf 스텝(내부 노드명) |
|---|---|---|
| 1 | DDL 파싱 | `parse_ddl_step` |
| 2 | AST 적재 | `load_ast_step` |
| 3 | 코드베이스 스캔 | `scan_codebase_step` |
| 4 | 관계 연결 | `link_deterministic_step` · `link_calls_by_name_step` · `link_residual_patterns_step` · `link_dbms_tables_step` · `link_calls_by_ast_step` |
| 5 | 분석 컨텍스트 구성 | `build_context_step` · `fetch_table_samples_step` |
| 6 | 코드 분석 | `analyze_code_step` |
| 7 | 후처리 | `summarize_module_step` · `enrich_table_description_step` · `enrich_lineage_from_catalog_step` · `build_components_step` · `health_metrics_step` · `embed_step` |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 7개 상위 단계로 큰 흐름 파악 (Priority: P1)

분석을 돌리는 사용자가 진행 패널에서 **7개 상위 단계**(DDL 파싱 → AST 적재 → 코드베이스 스캔 → 관계 연결 → 분석 컨텍스트 구성 → 코드 분석 → 후처리)를 1차 흐름으로 본다. 각 단계는 대기/진행중/완료 상태를 갖는다. leaf 스텝은 더 이상 최상위 항목으로 나열되지 않는다.

**Why this priority**: 핵심 가치. 사용자가 "지금 분석이 어디까지 왔나"를 큰 단위로 즉시 파악하게 하는 것이 이 기능의 본질.

**Independent Test**: 분석 1회 실행 → 진행 패널에 정확히 7개 상위 단계가 순서대로 보이고, 진행에 따라 상태가 대기→진행중→완료로 바뀌는지 확인.

**Acceptance Scenarios**:

1. **Given** 분석을 시작한 상태, **When** 진행 패널을 본다, **Then** 7개 상위 단계가 정해진 순서로 표시되고 각각 대기/진행중/완료 상태를 보인다.
2. **Given** analyzer가 leaf 스텝 이벤트(`link_calls_by_name_step` 등)를 보내는 중, **When** 진행 패널을 본다, **Then** leaf 스텝은 최상위 항목으로 나열되지 않고 해당 상위 단계 하나의 진행으로 반영된다.
3. **Given** 한 상위 단계의 모든 leaf가 끝난 상태, **When** 다음 단계 leaf 이벤트가 도착, **Then** 이전 단계는 완료, 다음 단계는 진행중으로 전이된다.

---

### User Story 2 - 진행 중 단계의 현재 세부 1줄 (Priority: P2)

진행 **중인** 단계 하나에만, 그 단계 안에서 지금 무엇을 하는지 **사용자 표현 한 줄**(부제)이 보인다. 예: "관계 연결 — 함수 호출 분석 중". 펼치기/접기나 leaf 전체 나열은 없다.

**Why this priority**: 큰 흐름(US1)만으론 "멈춘 건지 도는 건지" 불안할 수 있어, 현재 활동을 가볍게 한 줄로 안심시킨다. US1 위에 얹히는 보조 정보.

**Independent Test**: 분석 중 진행 중 단계에 부제 한 줄이 현재 leaf에 맞춰 갱신되고, 완료/대기 단계엔 부제가 없는지 확인.

**Acceptance Scenarios**:

1. **Given** "관계 연결" 단계가 진행중이고 내부적으로 함수 호출 분석 leaf가 도는 중, **When** 패널을 본다, **Then** "관계 연결" 아래 현재 세부 한 줄이 사용자 표현으로 보인다.
2. **Given** 한 단계 안에서 세부 작업이 바뀜, **When** 패널을 본다, **Then** 부제 한 줄이 새 세부로 갱신된다.
3. **Given** 완료된 단계 또는 아직 시작 안 한 단계, **When** 패널을 본다, **Then** 그 단계엔 세부 부제가 표시되지 않는다.

---

### User Story 3 - 사용자 표현 라벨 (Priority: P3)

진행 패널에 보이는 모든 문구(상위 단계명 + 세부 한 줄)가 비개발자가 이해할 표현이다. "호출 이름 분류"·"테이블 샘플 조회"·"잔여 패턴 연결"·"건강 지표" 같은 내부 구현 용어가 그대로 노출되지 않는다.

**Why this priority**: 표현 다듬기. 구조(US1/US2)가 먼저 서야 의미가 있어 마지막 우선순위.

**Independent Test**: 표시되는 모든 라벨을 점검 → 내부 구현 토큰(영문 함수명, 직역식 내부어)이 화면에 없음을 확인.

**Acceptance Scenarios**:

1. **Given** 어떤 단계가 진행중, **When** 세부 한 줄을 본다, **Then** 사용자 표현으로 쓰여 있고 내부 함수명/구현 용어가 없다.
2. **Given** 모든 7단계, **When** 단계명을 본다, **Then** 모두 사용자 표현이다.

---

### Edge Cases

- **skip된 세부**: framework 런에서 `fetch_table_samples_step`은 datasource 없으면 skip된다. 이때 "분석 컨텍스트 구성" 단계는 정상 진행/완료로 보여야 하고, skip된 세부가 오류나 멈춤으로 오인되지 않아야 한다.
- **전략별 leaf 차이**: dbms 런과 framework 런은 "관계 연결" 안의 leaf 집합이 다르다(예: framework=`link_calls_by_name`, dbms=`link_calls_by_ast`/`link_dbms_tables`). 어느 전략이든 상위 7단계 표시는 동일해야 한다.
- **미등록/신규 leaf**: analyzer가 매핑에 없는 새 스텝을 보낼 수 있다(현 코드도 generic 폴백 보유). 이때도 7단계 표시가 깨지지 않고, 미상의 스텝은 가장 그럴듯한 상위 단계에 흡수되거나 무해하게 처리되어야 한다.
- **라벨 키 드리프트(전수조사 발견)**: 현재 `STEP_LABELS`에 `analyze_function_step` 키가 있으나 analyzer가 실제 emit하는 노드명은 `analyze_code_step`이라 지금도 매핑이 빗나가 generic 폴백 중. 7단계 매핑은 **실제 emit 노드명** 기준으로 정확해야 한다(죽은 키 정리 포함).
- **이벤트 순서**: 한 단계의 leaf 이벤트가 도착하면 그 단계가 진행중이 되어야 하고, 단계가 건너뛰어 시작되는 경우에도 앞선 단계는 완료로 정리되어야 한다.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 진행 패널은 분석 중 **정확히 7개 상위 단계**(DDL 파싱·AST 적재·코드베이스 스캔·관계 연결·분석 컨텍스트 구성·코드 분석·후처리)를 정해진 순서로 표시해야 한다.
- **FR-002**: 각 상위 단계는 **대기 / 진행중 / 완료** 상태를 가지며 analyzer 진행 이벤트에 따라 전이되어야 한다.
- **FR-003**: leaf 스텝은 **최상위 항목으로 나열되지 않아야** 하며, 각 leaf는 자신이 속한 상위 단계의 진행으로 반영되어야 한다(매핑 = 위 배경 표, 실제 emit 노드명 기준).
- **FR-004**: **진행 중인 단계 하나에만** 현재 세부 작업을 **사용자 표현 한 줄**(부제)로 표시해야 한다. 완료/대기 단계엔 세부 부제를 표시하지 않는다.
- **FR-005**: 펼치기/접기나 leaf 전체 목록 표시는 제공하지 않는다(세부는 진행 중 단 한 줄).
- **FR-006**: 화면에 보이는 모든 문구(단계명·세부 한 줄)는 **비개발자 표현**이어야 하며 내부 구현 용어(영문 함수명, 직역식 내부어)를 노출하지 않아야 한다.
- **FR-007**: skip되는 세부(예: datasource 없을 때 테이블 샘플 조회)는 해당 상위 단계의 정상 진행을 방해하거나 오류/멈춤으로 오인되게 표시하지 않아야 한다.
- **FR-008**: dbms·framework 등 분석 전략과 무관하게 동일한 7단계 표시를 제공해야 한다(전략별 leaf 차이는 상위 단계 안으로 흡수).
- **FR-009**: 매핑에 없는 미상의 leaf 이벤트가 와도 7단계 표시가 깨지지 않아야 한다(무해 흡수/폴백).
- **FR-010**: 단계 매핑은 실제 emit 노드명과 일치해야 하며, 더 이상 emit되지 않는 죽은 라벨 키(`analyze_function_step` 등)는 정리되어야 한다.

### Key Entities *(include if feature involves data)*

- **상위 단계(Phase)**: 사용자에게 보이는 7개 진행 단위. 속성 = 표시명(사용자 표현)·순서·상태(대기/진행중/완료)·현재 세부 한 줄(진행중일 때만).
- **세부 스텝(Leaf step)**: analyzer가 emit하는 내부 진행 이벤트(노드명). 화면에 직접 항목으로 노출되지 않고, 어느 상위 단계에 속하는지의 **매핑 대상**이자 그 단계의 "현재 세부 한 줄" 문구의 원천.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 분석 진행 중 진행 패널의 최상위 항목 수는 항상 7개다(leaf 수와 무관).
- **SC-002**: 진행 중 표시되는 문구 중 내부 구현 용어(영문 함수명·`*_step`·직역식 내부어)는 **0건**이다.
- **SC-003**: 분석이 정상 완료되면 7개 단계 모두 완료 상태로 끝난다(framework·dbms 양쪽에서).
- **SC-004**: 세부 한 줄은 동시에 **최대 1개 단계**(진행 중 단계)에만 표시된다.
- **SC-005**: framework 런에서 테이블 샘플 조회가 skip돼도 "분석 컨텍스트 구성" 단계는 완료로 표시된다(오류 표시 0건).

## Assumptions

- 7단계 정의와 leaf→단계 매핑의 진실 출처는 analyzer `analysis_flow/step1~step7` 디렉토리 구조다(이번 스펙 기준 스냅샷; 배경 표 참조).
- 스코프는 robo-data-frontend 분석 진행 표시 UI 한정이다. analyzer 진행 이벤트 계약(노드명·페이로드)을 바꿔 단계 정보를 백엔드가 보내게 할지, 아니면 프론트 정적 매핑으로 처리할지는 **plan에서 결정**한다(계약 변경이면 analyzer 영향 = contract 알람 대상).
- robo-data-frontend `main`에 사용자 WIP(예: TableCard.vue, 삭제된 doc, .unittest)가 있으므로 해당 파일은 건드리지 않는다. 작업은 루트 체크아웃 기준(이중 체크아웃 주의).
- 진행률 퍼센트·예상 소요시간 등 추가 지표는 이번 스코프 밖이다.
