# Feature Specification: Ontology

**Feature Branch**: `007-ontology`

**Created**: 2026-06-15

**Status**: Backfilled (reverse-engineered)

**Input**: 기존 `src/features/ontology/` 코드(약 26개 파일: OntologyTab/Wizard/Canvas/InstancePanel/SchemaSelector/FeedbackModal, whatif 6스텝 패널, 커스텀 노드, `api.ts`/`whatif-domain-api.ts`/`ontology.ts` 스토어)에서 역설계. 도메인 문서로부터 LLM이 온톨로지(엔티티/관계) 스키마를 생성하고, 시각 캔버스에서 검토·수정하며, 각 노드를 실제 데이터 테이블에 바인딩하고, 학습된 모델로 What-if 시뮬레이션까지 수행하는 기능.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 도메인 문서에서 온톨로지 스키마 생성·검토 (Priority: P1)

사용자는 도메인 설명 텍스트나 PDF 문서를 입력하면, LLM이 엔티티(노드)와 관계를 추출해 온톨로지 스키마를 자동 생성한다. 생성된 스키마는 VueFlow 캔버스에 노드/엣지 형태로 시각화되며, 자연어 피드백으로 반복 수정한 뒤 확정·저장한다.

**Why this priority**: 온톨로지가 없으면 이후 데이터 바인딩·시뮬레이션이 모두 불가능하다. 스키마 생성→검토→저장만으로도 "도메인 의미 모델"이라는 핵심 가치를 단독 제공한다.

**Independent Test**: 정수장 예제 텍스트를 입력하고 "온톨로지 스키마 생성"을 눌러 노드/관계가 채워진 캔버스가 나오는지, "스키마 수정" 피드백으로 변경되는지, "스키마 확정"·"저장" 후 목록에 남는지로 단독 검증 가능.

**Acceptance Scenarios**:

1. **Given** Step 1(도메인 입력)에서 텍스트가 입력된 상태, **When** "온톨로지 스키마 생성"을 클릭, **Then** 스트리밍 진행률 메시지가 표시되고 완료 시 Step 2(검토)로 전환되며 노드 수/관계 수와 캔버스가 표시된다.
2. **Given** Step 2에서 생성된 스키마가 보이는 상태, **When** 피드백 모달에 수정 요청을 입력해 제출, **Then** LLM이 수정한 새 스키마가 캔버스에 반영된다.
3. **Given** 검토를 마친 상태, **When** "스키마 확정"→"저장"을 클릭, **Then** 스키마가 백엔드에 영속 저장되고 다음 진입 시 저장 목록에 나타난다.

---

### User Story 2 - 저장된 스키마 선택 및 노드-데이터소스 바인딩 (Priority: P2)

사용자는 저장된 온톨로지 목록에서 스키마를 선택(활성화)하고, 각 온톨로지 노드를 실제 DB 테이블(데이터 소스)에 바인딩한다. 노드를 선택하면 인스턴스 패널이 열려 Text2SQL 에이전트로 해당 노드의 실제 인스턴스 데이터를 조회한다.

**Why this priority**: 의미 모델을 실제 데이터에 연결해야 모니터링·시뮬레이션이 의미를 가진다. 단, 스키마(P1)가 선행되어야 한다.

**Independent Test**: 저장된 스키마를 선택해 캔버스가 뜨고, 노드 클릭 시 인스턴스 패널에서 테이블을 바인딩한 뒤 인스턴스 데이터가 조회되는지로 검증.

**Acceptance Scenarios**:

1. **Given** 저장된 스키마가 1개 이상 존재, **When** SchemaSelector에서 스키마를 선택, **Then** 해당 스키마가 활성화되고 캔버스에 노드/관계가 렌더된다.
2. **Given** 데이터소스 미연결 노드를 선택, **When** 인스턴스 패널에서 테이블을 선택해 바인딩, **Then** 노드에 dataSource가 연결되고 Text2SQL로 인스턴스가 조회된다.

---

### User Story 3 - What-if 시뮬레이션 (관계 발견→학습→검증→시뮬레이션) (Priority: P3)

사용자는 활성 스키마에 대해 What-if 패널을 열어 6단계(관계 발견 → 모델 구성 → 학습/등록 → 검증 → 시뮬레이션 → 모델 관리)를 진행한다. 변수 간 상관/인과 엣지를 자동 발견하고, 모델 DAG를 구성해 MindsDB로 학습한 뒤, 개입(intervention) 값을 바꿔 결과 파급을 시뮬레이션한다.

**Why this priority**: 고급 분석 기능으로, 스키마·데이터 바인딩이 모두 완료된 뒤에만 가치가 있다. 기존 학습 모델이 있으면 시뮬레이션 단계로 바로 진입 가능.

**Independent Test**: 데이터가 바인딩된 스키마에서 What-if 패널을 열어 관계 발견→모델 학습→시뮬레이션 실행이 순서대로 동작하고 결과 타임라인이 나오는지로 검증.

**Acceptance Scenarios**:

1. **Given** 활성 스키마에 기존 학습 모델이 없음, **When** What-if 패널을 열고 "관계 발견"을 실행, **Then** 엣지 후보 목록과 상관행렬이 표시된다.
2. **Given** 모델 학습·검증 완료, **When** 시뮬레이션 단계에서 개입 값을 설정해 실행, **Then** 파급 타임라인과 최종 상태/델타가 표시된다.
3. **Given** 기존 학습 모델이 존재, **When** 패널 진입, **Then** 재사용 다이얼로그가 떠 시뮬레이션 단계로 바로 이동할 수 있다.

---

### Edge Cases

- 입력 텍스트와 PDF가 모두 비어 있으면 "스키마 생성" 버튼은 비활성화된다.
- 스키마 생성 스트림이 complete 이벤트 없이 끝나면 "응답을 받지 못했습니다" 오류를 표시한다.
- `getSchema`/`getSchemaById`가 404면 스키마 없음(null)으로 처리하고 위저드를 input 단계로 유지한다.
- 온톨로지/Text2SQL/What-if 서비스가 다운(404/502/503)되면 서비스별 포트 안내 메시지를 노출한다.
- What-if: 시계열/숫자 컬럼이 없는 노드는 excluded(reason: no_time_column 등)로 분류되어 분석에서 제외된다.
- 데이터소스 미연결 노드는 인스턴스 조회를 건너뛰며 캔버스/바인딩 화면에 "미연결"로 표시된다.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST 도메인 텍스트 또는 PDF를 입력받아 LLM으로 온톨로지 스키마(노드·관계·라벨)를 생성하고, 생성 진행률을 NDJSON 스트림(progress/complete/error 이벤트)으로 노출해야 한다. (`POST {ONTOLOGY_BASE_URL}/generate`)
- **FR-002**: Users MUST be able to 자연어 피드백으로 현재 스키마를 수정 요청하고 갱신된 스키마를 받아야 한다. (`POST {ONTOLOGY_BASE_URL}/feedback`)
- **FR-003**: System MUST 생성된 스키마를 영속 저장하고(`POST .../schema`), 활성 스키마 단건 조회(`GET .../schema`)를 제공해야 한다.
- **FR-004**: System MUST 저장된 스키마 목록 조회·단건 조회·활성화·삭제를 제공해야 한다. (`GET .../schemas`, `GET .../schemas/{id}`, `POST .../schemas/{id}/activate`, `DELETE .../schemas/{id}`)
- **FR-005**: System MUST 스키마를 VueFlow 캔버스에 라벨별 커스텀 노드(asset/system/component/event/instance)와 관계 엣지로 시각화하고, 줌/핏뷰/미니맵을 제공해야 한다.
- **FR-006**: Users MUST be able to 노드를 선택해 인스턴스 패널을 열고, 데이터 소스(테이블)를 바인딩/해제하며(`PUT`/`DELETE .../nodes/{id}/datasource`), 사용 가능한 데이터 소스 목록을 조회(`GET .../datasources`)할 수 있어야 한다.
- **FR-007**: System MUST 바인딩된 노드의 실제 인스턴스 데이터를 Text2SQL 서브에이전트로 조회해야 한다. (`GET .../nodes/{id}/instances?limit=`)
- **FR-008**: System MUST 노드별 Materialized View 생성(`POST .../nodes/{id}/materialized-view`)과 Neo4j 동기화(`POST .../sync-neo4j`)를 지원해야 한다.
- **FR-009**: System MUST Process 노드의 BPMN XML 업데이트를 지원해야 한다. (`PATCH .../nodes/{id}/bpmn-xml`)
- **FR-010**: System MUST What-if 분석 6단계를 제공해야 한다: 관계 발견(`/discover-edges`, `/correlation-matrix`), LLM 엣지 필터링(`/filter-edges`), 모델 그래프 구성(`/build-model-graph`), 학습(`/train-models`)·상태 폴링(`/model-status/{id}`), 검증(`/validate`), 스냅샷(`/snapshot`)·시뮬레이션(`/simulate`)·시나리오 비교(`/compare-scenarios`).
- **FR-011**: Users MUST be able to What-if 시나리오 프로필을 생성·목록·조회·수정·삭제할 수 있어야 한다. (`/scenarios`, `/scenarios/{id}`)
- **FR-012**: System MUST 기존 학습 모델이 있으면 재사용 다이얼로그로 시뮬레이션 단계로 바로 이동할 수 있게 해야 한다.
- **FR-013**: System MUST 모든 백엔드 호출을 API Gateway(`/api/gateway`) 경유로 보내고, 서비스 다운(404/502/503) 시 서비스별 안내 메시지를 표시해야 한다.

### Key Entities *(include if feature involves data)*

- **OntologySchema**: 온톨로지 전체 모델. id, name, domain, version과 nodes/relationships/labels 컬렉션을 가진다.
- **OntologyNode (엔티티/클래스)**: 의미 엔티티. id, name, label(asset/system/component/event 등), description, position, dataSource(바인딩 테이블), instanceCount, BPMN XML(Process 노드)을 가진다.
- **OntologyRelationship**: 노드 간 관계(엣지). source/target 노드와 관계 타입.
- **OntologyLabel**: 노드 분류 라벨(캔버스 노드 타입·색상 매핑에 사용).
- **NodeInstanceData**: 노드에 바인딩된 실제 행 데이터(Text2SQL 조회 결과).
- **WizardState**: 위저드 단계(input/review/binding)·입력 방식(text/pdf)·생성 진행 상태.
- **EdgeCandidate / ModelSpec / RegisteredModel**: What-if의 상관·인과 엣지 후보, 모델 사양(target+features), 학습된 MindsDB 모델.
- **WhatIfScenarioProfile**: 개입(intervention) 집합과 마지막 시뮬레이션 결과를 담는 시나리오 프로필.
- **주요 뷰**: OntologyTab(메인), OntologyWizard(3단계), OntologyCanvas(VueFlow), InstancePanel/EntityQueryPanel(인스턴스), SchemaSelector, FeedbackModal, WhatIfPanel(6스텝).
- **백엔드 엔드포인트**: `{ONTOLOGY_BASE_URL} = /api/gateway/ontology/*` (스키마/노드/데이터소스/sync-neo4j), `WHATIF_DOMAIN_URL = /api/gateway/domain-whatif/*` (domain-layer 8002의 `/whatif/*`). 라우팅: Vite 프록시 → Spring Gateway(9000) → 각 서비스. 인스턴스 조회는 Text2SQL 서비스도 경유.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 사용자는 도메인 텍스트 입력부터 시각화된 온톨로지 검토까지 한 번의 위저드 흐름으로 도달할 수 있다.
- **SC-002**: 스키마 생성 중 진행률 메시지가 실시간(스트리밍)으로 갱신되어 무응답 대기 화면이 없다.
- **SC-003**: 저장된 스키마는 재진입 시 목록에서 100% 복원되어 노드 수/버전과 함께 선택 가능하다.
- **SC-004**: 데이터소스가 바인딩된 노드는 클릭 시 실제 인스턴스 데이터를 조회·표시한다.
- **SC-005**: What-if 패널에서 관계 발견→학습→시뮬레이션 전 단계가 단계 내비게이션으로 끊김 없이 진행되고, 기존 모델 존재 시 시뮬레이션으로 직행할 수 있다.
- **SC-006**: 의존 서비스 다운 시 사용자에게 어떤 서비스(포트)를 확인해야 하는지 명확한 안내가 표시된다.

## Assumptions

- API Gateway(`/api/gateway`)가 단일 진입점이며 Vite 프록시가 Spring Gateway(9000)로 전달한다고 가정.
- 스키마 생성·피드백·엣지 필터링은 외부 LLM, 모델 학습은 MindsDB, 그래프 동기화는 Neo4j에 의존한다.
- 라우터는 메모리 히스토리에 `/` 단일 라우트만 두며, 온톨로지는 라우트가 아니라 호스트(robo-architect) 임베드 시 탭(session.activeTab)으로 진입한다(별도 URL 경로 없음).
- 인스턴스 조회는 Text2SQL 서브에이전트(별도 서비스)에 의존하며, 데이터소스 미바인딩 노드는 조회 대상에서 제외된다.
- What-if 시뮬레이션은 시계열·숫자 컬럼이 있는 노드만 분석 대상으로 가정한다.
