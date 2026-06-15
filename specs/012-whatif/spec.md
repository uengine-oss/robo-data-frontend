# Feature Specification: What-If Analysis

**Feature Branch**: `012-whatif`

**Created**: 2026-06-15

**Status**: Backfilled (reverse-engineered)

**Input**: Existing code under `src/features/whatif/`. 자연어 시나리오로부터 관련 데이터를 발견하고, 인과관계(온톨로지)를 추정·검증·비교한 뒤, What-If 영향 시뮬레이션을 수행하는 다이나믹 레이어 탭(`id: 'whatif'`, 라벨 "What-If 시뮬레이터"). 백엔드 `/whatif/*`(포트 8005)를 API Gateway(`/api/gateway/whatif`) 경유로 호출.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 시나리오에서 인과 온톨로지 발견 (Priority: P1)

분석가가 예측하고 싶은 내용을 한국어 자연어로 입력하면(예: "환율 변동이 제품 원가와 최종 수익에 미치는 영향"), 시스템이 관련 DB 테이블을 자동 발견하고 데이터를 수집한 뒤 변수 간 인과관계 그래프를 추정해 보여준다. 5단계 워크플로우(시나리오 → 데이터 선택 → 온톨로지 발견 → 검증·비교 → 시뮬레이션)의 앞 3단계가 이 스토리의 핵심이다.

**Why this priority**: 인과 온톨로지(엣지) 없이는 검증·비교·시뮬레이션이 모두 불가능하다. 이 흐름이 곧 제품의 최소 가치(MVP)다.

**Independent Test**: 시나리오 텍스트를 입력하고 "데이터 발견 시작"을 누른 뒤, 발견된 테이블 카드와 추정된 인과 엣지 그래프가 렌더되는지로 검증 가능.

**Acceptance Scenarios**:

1. **Given** 시나리오 입력칸에 텍스트가 있을 때, **When** "데이터 발견 시작"을 누르면, **Then** `/whatif/agent/analyze` 응답으로 `session_id`와 데이터 소스가 잡히고 진행 로그가 표시되며 2단계(데이터 선택)로 이동한다.
2. **Given** 발견된 테이블 또는 직접 작성한 SQL이 있을 때, **When** "실행"을 누르면, **Then** `/whatif/data/collect` 가 호출되고 3단계로 이동한다.
3. **Given** 세션과 데이터가 준비됐을 때, **When** Causal Discovery를 실행하면, **Then** `/whatif/causal/discover` + `/whatif/causal/validate` 결과로 인과 엣지 그래프가 렌더되고 4단계로 이동한다.

---

### User Story 2 - 모델 검증 및 MindsDB/TTM 비교 (Priority: P2)

발견된 인과 모델의 신뢰도를 확인하기 위해, 분석가가 검증 지표(R², 과적합 여부)를 보고 인과 모델 예측을 MindsDB 및 TTM(시계열 파운데이션 모델) 예측과 나란히 비교한다.

**Why this priority**: 추정된 인과관계가 통계적으로 타당한지 입증해야 시뮬레이션 결과를 신뢰할 수 있다. P1 산출물 위에서만 동작한다.

**Independent Test**: causalResult가 있는 세션에서 "비교 실행"을 눌러, 비교 차트/요약(어느 모델이 우세한지)이 표시되는지로 검증 가능.

**Acceptance Scenarios**:

1. **Given** causalResult가 존재할 때, **When** 비교를 실행하면, **Then** 먼저 `/whatif/ttm/compare`(3-way) 를 시도하고, 실패하면 `/whatif/mindsdb/compare` 로 폴백해 결과를 표시한다.
2. **Given** 비교 결과가 표시됐을 때, **When** "다음" 단계를 누르면, **Then** 5단계(시뮬레이션/리터러시)로 이동한다.

---

### User Story 3 - What-If 시뮬레이션 및 결과 해석 (Priority: P3)

분석가가 드라이버 변수의 변화량(예: 환율 +10%)을 입력해 KPI에 미치는 영향을 예측·시각화하고, LLM 기반 설명으로 결과를 비전문가도 이해하도록 해석한다. 발견된 온톨로지를 Neo4j에 저장할 수도 있다.

**Why this priority**: 핵심 가치를 전달하지만 P1·P2 산출물에 전적으로 의존하며, 예측 자체는 클라이언트 측 계산(목업/선형 토폴로지 전파)으로 보강된다.

**Independent Test**: 검증된 세션에서 시나리오 변화량을 입력하고 "시뮬레이션 실행"을 눌러 예측 차트가 그려지고, "설명 생성"으로 LLM 텍스트가 표시되는지로 검증 가능.

**Acceptance Scenarios**:

1. **Given** 5단계에서, **When** 리포트 유형을 골라 "설명 생성"을 누르면, **Then** `/whatif/literacy/explain` 결과(한국어/영어) 설명이 표시된다.
2. **Given** 온톨로지 편집기에서, **When** "저장"을 누르면, **Then** `/whatif/neo4j/save` 로 노드·엣지가 온톨로지로 저장된다.
3. **Given** 시나리오 변화량 입력 후, **When** "시뮬레이션 실행"을 누르면, **Then** 예측 차트가 렌더된다(현재 클라이언트 측 계산).

### Edge Cases

- 시나리오가 비어 있으면 "분석 시나리오를 입력해주세요" 에러를 띄우고 호출하지 않는다.
- `/whatif/agent/analyze` 가 데이터 소스를 0개 반환하면 "관련 테이블을 찾지 못했습니다" 경고 후 직접 테이블/SQL 선택을 유도한다.
- 비교 실행 시 세션 ID가 없으면 클라이언트가 `whatif_<timestamp>` 임시 ID를 생성하고, 테이블이 비면 기본 테이블 집합(exchange_rate, import_cost, product_cost, sales_revenue, final_profit)으로 폴백한다.
- TTM 비교 실패 시 표준 MindsDB 비교로 자동 폴백한다.
- 백엔드(8005) 또는 Gateway(9000) 다운(404/502/503) 시 서비스 기동 안내 메시지를 표시한다.
- localStorage 세션은 최대 10개만 유지되며, 마지막 세션은 마운트 시 자동 복원된다.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST 자연어 시나리오를 받아 `/whatif/agent/analyze`(use_text2sql)로 관련 데이터 소스·변수·관계를 발견하고 `session_id`를 확보해야 한다.
- **FR-002**: System MUST 5단계 워크플로우(시나리오·데이터·온톨로지·검증·시뮬레이션)를 단계 게이팅(`canProceed`)과 함께 제공하고, 진행 로그 패널을 표시해야 한다.
- **FR-003**: Users MUST be able to 발견된 테이블을 선택하거나 직접 SQL을 작성해 `/whatif/data/collect` 로 데이터를 수집하거나, CSV/Excel 파일을 `/whatif/data/upload` 로 업로드할 수 있어야 한다.
- **FR-004**: System MUST `/whatif/causal/discover`(methods, max_lag)로 인과 엣지를 추정하고 `/whatif/causal/validate` 로 검증 지표를 함께 조회해야 한다.
- **FR-005**: System MUST 인과 모델 예측을 `/whatif/ttm/compare`(우선) 또는 `/whatif/mindsdb/compare`(폴백)로 비교하고 우세 모델·R² 요약을 표시해야 한다.
- **FR-006**: System MUST `/whatif/literacy/explain`(report_type, language=ko|en)로 LLM 기반 결과 설명을 생성해야 한다.
- **FR-007**: Users MUST be able to 발견된 인과관계를 `/whatif/neo4j/save` 로 온톨로지에 저장할 수 있어야 한다.
- **FR-008**: System MUST 진행 중인 분석 세션을 localStorage에 자동 저장·복원·삭제하고(최대 10개), 사이드바에서 세션을 전환할 수 있어야 한다.
- **FR-009**: System MUST 모든 호출을 API Gateway(`/api/gateway/whatif`) 경유로 보내고, 서비스 다운/검증오류를 사람이 읽을 메시지로 변환해 표시해야 한다.
- **FR-010**: System MUST 드라이버 변화량 입력에 따른 What-If 영향 시뮬레이션(예측 차트)과 온톨로지 편집기 내 선형 토폴로지 전파 테스트를 제공해야 한다. [현재 클라이언트 측 계산; 백엔드 시뮬레이션 엔드포인트 미연동]

### Key Entities *(include if feature involves data)*

- **Scenario(시나리오)**: 사용자의 자연어 분석 의도. `analyzeScenario`의 입력(`scenario`, `use_text2sql`).
- **AgentAnalysisResult**: 시나리오 분석 산출물 — `session_id`, `variables`(driver/state/kpi), `relationships`, `data_sources`, `is_ready_for_causal`.
- **DataDiscoveryResult / DiscoveredTable**: 발견된 테이블 목록·관련도·샘플·제안 SQL.
- **CausalDiscoveryResult / CausalEdge**: 인과 엣지(source→target, strength, direction, p_value, formula, r_squared)와 요약(root_causes/final_effects)·검증.
- **ValidationResult**: 엣지별 train/test R², RMSE, MAPE, 과적합 여부.
- **ComparisonResult / TTMComparisonResult**: 인과 vs MindsDB vs TTM 비교(예측 차트, 우세 모델 카운트).
- **LiteracyExplanation**: report_type·language별 LLM 설명 텍스트.
- **SavedSession**: localStorage에 저장되는 워크플로우 상태(scenario, currentStep, 누적 결과).
- **Backend `/whatif/*` 엔드포인트(8005, Gateway 경유)**:
  - `POST /agent/analyze`, `POST /discovery/search`, `POST /data/collect`, `POST /data/upload`
  - `POST /causal/discover`, `POST /causal/validate`
  - `POST /mindsdb/compare`, `POST /mindsdb/create-model`, `POST /ttm/compare`, `GET /ttm/info`
  - `POST /literacy/explain`, `POST /literacy/presentation`
  - `POST /neo4j/save`, `GET /neo4j/graph/{session_id}`
  - `GET /sessions`, `GET /sessions/{id}`, `DELETE /sessions/{id}`, `GET /`(health)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 사용자가 자연어 시나리오 입력만으로 발견된 테이블 목록까지 한 번의 액션("데이터 발견 시작")으로 도달할 수 있다.
- **SC-002**: 인과 발견 후 검증 지표와 모델 비교 결과가 추가 수동 설정 없이 자동으로 함께 제시된다.
- **SC-003**: 분석 중 페이지를 새로고침해도 마지막 세션이 자동 복원되어 작업이 유실되지 않는다.
- **SC-004**: 백엔드 또는 Gateway 장애 시 사용자에게 원인과 기동 방법이 담긴 안내 메시지가 표시된다(원시 스택트레이스 미노출).

## Assumptions

- What-If 백엔드는 포트 8005에서 동작하며, 프런트엔드는 항상 API Gateway(`/api/gateway/whatif`, Vite 프록시 → Spring Gateway 9000) 경유로 접근한다(직접 호출 없음).
- 이 기능은 라우터 네비게이션이 아니라 `session.activeTab === 'whatif'` 탭으로 진입하며, `WhatIfSimulator`가 진입 컴포넌트다(features.ts, 다이나믹 레이어).
- 세션 영속화는 백엔드가 아니라 브라우저 localStorage(`whatif_sessions`, `whatif_current_session`)로 처리된다.
- P3의 시뮬레이션 예측은 현재 클라이언트 측 목업/선형 전파로 산출되며 전용 백엔드 시뮬레이션 엔드포인트는 호출하지 않는다.
- 시나리오 진행 로그의 일부 단계(키워드 추출·지연 연출)는 UX용 클라이언트 시뮬레이션이다.
