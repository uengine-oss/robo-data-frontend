# Feature Specification: Domain Modeling

**Feature Branch**: `008-domain-modeling`

**Created**: 2026-06-15

**Status**: Backfilled (reverse-engineered)

**Input**: Existing code — `src/features/domain/` (~20 files), registered as the "도메인 레이어" 메뉴 그룹(`src/shared/config/features.ts`)의 세 탭: `schema-modeling`(ObjectTypeModeler), `multi-layer-ontology`(MultiLayerOntologyViewer), `ontology-viewer`(OntologyViewerRemote). API Gateway(`/api/gateway/ontology/*`)의 ontology 백엔드를 호출.

## User Scenarios & Testing *(mandatory)*

분석된 시스템(피지컬 레이어로 추출된 테이블·스키마) 위에, 사용자가 비즈니스 의미 단위인 **도메인 모델**(ObjectType, 온톨로지 노드/관계, 그 위의 Behavior·Agent)을 정의·관리하는 레이어다.

### User Story 1 - ObjectType 스키마 모델링 (Priority: P1)

사용자는 "도메인 스키마" 탭(ObjectTypeModeler)에서 도메인 객체 타입(ObjectType)을 정의한다. 좌측 패널에서 기존 ObjectType 목록을 검색하고, 새 타입을 생성하며(자연어/SQL 기반 생성 지원), 캔버스(SchemaCanvas 재사용)에 드래그·더블클릭으로 올려 컬럼과 타입 간 관계(relationship)를 시각적으로 연결한다. 빈 캔버스에 드롭하면 연결된 새 ObjectType을 생성하는 흐름으로 이어진다. 각 타입은 편집·이름변경·삭제(이름 재입력 확인)가 가능하다.

**Why this priority**: 도메인 레이어의 기반 산출물(ObjectType + 관계)이 없으면 온톨로지·Behavior·Agent 모두 성립하지 않는다. 단독으로도 "분석 데이터에 비즈니스 모델을 입힌다"는 핵심 가치를 전달한다.

**Independent Test**: 도메인 스키마 탭만 열어, ObjectType을 1개 생성→캔버스 배치→다른 타입과 관계 연결→삭제까지 수행하면 검증된다.

**Acceptance Scenarios**:

1. **Given** ObjectType 목록이 로드된 상태, **When** 항목을 캔버스로 더블클릭/드래그, **Then** 해당 타입이 컬럼·Behavior와 함께 캔버스 노드로 추가된다.
2. **Given** 캔버스의 컬럼 핸들을 빈 공간에 드롭, **When** "새 ObjectType 생성"을 선택, **Then** 생성 다이얼로그가 열리고 생성 후 소스와의 관계 생성 다이얼로그로 이어진다.
3. **Given** 삭제 다이얼로그, **When** 타입 이름을 정확히 재입력하지 않음, **Then** 삭제 버튼이 비활성/오류로 막힌다.

---

### User Story 2 - 온톨로지 생성·관리 (Priority: P1)

사용자는 "온톨로지 관리" 탭(MultiLayerOntologyViewer)에서 문서 또는 DB 스키마로부터 다층(multi-layer) 온톨로지를 생성하고, 노드/관계를 그래프로 보며 레이아웃(계층형/물리/원형/격자)을 바꾼다. 저장된 온톨로지 목록을 드롭다운에서 불러오고(이름 편집·삭제·활성화), Neo4j에 저장한다. 노드를 선택하면 실제 데이터(차트 추천 포함)·필터 값·샘플 데이터를 조회하고, 데이터소스 자동 링크, KPI/측정값에 대한 인과(causal) 분석(스트림), 노드→ObjectType 승격을 수행한다.

**Why this priority**: 도메인 의미망(온톨로지)을 구축·운영하는 주축 화면으로, ObjectType 모델링과 함께 도메인 레이어의 양대 MVP다.

**Independent Test**: 온톨로지 관리 탭에서 문서/스키마로 온톨로지 1건 생성→목록에서 재로드→노드 선택해 데이터 조회→저장까지 수행하면 검증된다.

**Acceptance Scenarios**:

1. **Given** 빈 뷰어, **When** "문서에서 생성" 또는 "DB 스키마에서 생성"을 실행, **Then** 다층 온톨로지가 생성되어 그래프로 렌더되고 동의어 제안 건수가 안내된다.
2. **Given** 노드 선택, **When** 데이터 조회, **Then** 컬럼·행 데이터와 추천 차트(막대/추이)가 표시된다.
3. **Given** 노드 수정 후, **When** "저장", **Then** 스키마가 Neo4j에 영속화된다.

---

### User Story 3 - Behavior·Agent 부착 (Priority: P2)

사용자는 ObjectType/노드에 **Behavior**(rest_api/javascript/python/dmn)를 추가·편집·실행하고, LLM으로 코드를 생성하며 실행 결과를 테이블로 저장한다. 또한 노드 타입에 **Agents.md**(에이전트 정의)를 작성/생성/재작성하고, 노드-로컬 에이전트 스케줄러로 에이전트를 모니터링(상태·로그 SSE 스트림)·트리거·정지/일시정지/피드백 제어하며, 에이전트가 노드에 시각 효과(배지·색상·알럿)를 입힌다.

**Why this priority**: 정적 모델에 동적 행위/자동화를 부여하는 고부가 기능이나, P1 모델·온톨로지가 선행되어야 하므로 P2다.

**Independent Test**: ObjectType 1개에 rest_api Behavior를 추가→샘플 데이터로 실행, 노드에 Agents.md를 생성→스케줄러 로그를 스트림으로 확인하면 검증된다.

**Acceptance Scenarios**:

1. **Given** ObjectType, **When** Behavior 추가 후 실행, **Then** 실행 결과(성공/오류)가 표시되고 필요 시 테이블로 저장된다.
2. **Given** 노드 타입, **When** Agents.md 생성, **Then** 컨텍스트(필드·메서드·연결객체)로 템플릿이 채워지고 저장된다.

---

### Edge Cases

- ObjectType 삭제 시 확인 이름이 불일치하면 진행 불가(연결된 컬럼·Materialized View 동반 삭제 경고).
- 저장된 온톨로지에 `schemaJson`이 없으면(`hasSchemaJson=false`) 로드 불가로 표시(⚠️).
- 원격 온톨로지 뷰어(OntologyViewerRemote)는 air-swmm 원격 모듈(MF, 포트 5173) 로드 실패/타임아웃(15s) 시 에러 안내.
- ontology 백엔드 다운(404/502/503) 시 공유 `handleHttpError`가 서비스별 안내 메시지로 폴백.
- Agents.md 미생성 노드 조회 시 404 → `null` 반환(에러 아님).
- Behavior 테스트는 rest_api 타입만 허용.
- 에이전트 로그 SSE 연결은 컴포넌트 unmount 시 닫는다.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 시스템은 ObjectType 목록을 조회·검색하고(`GET /ontology/object-types`) 좌측 패널에 컬럼 수·Behavior 수와 함께 표시해야 한다.
- **FR-002**: 사용자는 ObjectType을 생성(`POST /ontology/object-types`, 이름 자동생성 `POST /ontology/generate-object-type-name`)·편집·이름변경(`PATCH .../rename`)·삭제(`DELETE .../{name}`, 이름 재입력 확인)할 수 있어야 한다.
- **FR-003**: 시스템은 ObjectType을 SchemaCanvas에 드래그/더블클릭으로 추가하고 타입 간 관계를 생성·갱신할 수 있어야 한다(빈 공간 드롭 시 연결된 새 타입 생성 흐름 포함).
- **FR-004**: 시스템은 문서/DB 스키마로부터 다층 온톨로지를 생성(`POST /ontology/generate-multi-layer`)하고 그래프로 렌더하며 레이아웃 전환을 지원해야 한다.
- **FR-005**: 시스템은 저장된 온톨로지를 목록 조회(`GET /ontology/schemas`)·로드(`GET /ontology/schemas/{id}`)·이름변경(`PATCH /ontology/schemas/{id}`)·활성화(`POST .../activate`)·삭제(`DELETE /ontology/schemas/{id}`)·저장(`POST /ontology/schema`)할 수 있어야 한다.
- **FR-006**: 시스템은 온톨로지 노드의 실제 데이터(`GET /ontology/ontology-nodes/{id}/data`)·필터 값(`.../filter-values`)·샘플 데이터(`GET /ontology/node/{id}/sample-data`)를 조회하고 차트 추천을 제공해야 한다.
- **FR-007**: 시스템은 데이터소스 자동 링크(`POST /ontology/auto-link-datasource[/stream]`, `POST /ontology/confirm-datasource`)와 노드→ObjectType 승격(`POST /ontology/ontology-nodes/{id}/create-objecttype`)을 지원해야 한다.
- **FR-008**: 시스템은 KPI/측정 노드에 대한 인과 분석을 동기·스트림으로 수행해야 한다(`POST /ontology/schemas/{schemaId}/nodes/{nodeId}/causal-analysis[/stream]`, 수신 네트워크 `.../incoming-network`).
- **FR-009**: 사용자는 ObjectType에 Behavior(rest_api/javascript/python/dmn)를 CRUD·실행해야 한다(`/ontology/object-types/{name}/behaviors/*`, 실행 `.../execute`), LLM 코드 생성(`POST /ontology/generate-code`)·결과 테이블 저장(`POST /ontology/save-result-to-table`) 포함.
- **FR-010**: 시스템은 노드 타입의 Agents.md를 컨텍스트 기반으로 조회/생성/저장/삭제/재작성해야 한다(`/ontology/object-types/{name}/agent-context`, `.../agents-md`, `.../agents-md/rewrite`).
- **FR-011**: 시스템은 노드-로컬 에이전트를 모니터링·제어해야 한다(`/api/gateway/node-agent-scheduler/agents/*`: 목록·상태·run·control·feedback·logs, 로그 SSE 스트림), 에이전트 시각 효과(`/ontology/visual-effects`, `/ontology/object-types/{name}/visual-effects`) 폴링·설정·해제 포함.
- **FR-012**: 시스템은 ProcessGPT 프로세스 목록 조회 및 SSE 실행(`/api/gateway/agent-scheduler/*`: pipelines/profiles, `profiles/processgpt/processes`, `profiles/processgpt/execute-stream`)을 지원해야 한다.
- **FR-013**: 시스템은 노드의 BPMN XML 저장(`PATCH /ontology/nodes/{id}/bpmn-xml`)과 DMN 의사결정 편집(클라이언트 측 dmn-js)을 지원해야 한다.
- **FR-014**: 시스템은 외부 air-swmm 온톨로지 뷰어를 Module Federation 원격 모듈로 임베드하고(OntologyViewerRemote) 로드 실패를 안내해야 한다.
- **FR-015**: 모든 백엔드 호출은 공유 HTTP 코어(`src/shared/services/http.ts`)를 거쳐 API Gateway(`/api/gateway/*`)로 라우팅되고 서비스 다운 시 친절 안내 메시지로 폴백해야 한다.

### Key Entities *(include if feature involves data)*

- **ObjectType**: 도메인 객체 타입. 이름·설명·컬럼(name/type/description)·Behavior 목록·차트 설정을 가진다. 피지컬 테이블/노드에서 승격되어 생성된다.
- **Relationship**: ObjectType(컬럼) 간 연결. SchemaCanvas의 edge로 표현.
- **Ontology Schema**: 다층 온톨로지(노드·관계 그래프). id·name·nodeCount·updatedAt·schemaJson·hasSchemaJson·활성 여부를 가지며 Neo4j에 영속화.
- **Ontology Node**: 온톨로지 그래프의 노드(KPI/측정/엔티티 등). 데이터·필터값·샘플데이터·인과분석·시각효과의 대상.
- **Behavior**: ObjectType에 부착된 실행 단위(`rest_api`|`javascript`|`python`|`dmn`), config·inputFields·outputField 보유.
- **Agents.md / Node Agent**: 노드 타입의 에이전트 정의(content·enabled)와 그 런타임 상태(status·run_count·logs·feedback_queue).
- **주요 뷰**: `ObjectTypeModeler.vue`(schema-modeling 탭), `MultiLayerOntologyViewer.vue`(multi-layer-ontology 탭), `OntologyViewerRemote.vue`(ontology-viewer 탭); 보조 다이얼로그/패널 — `CreateObjectTypeDialog`, `ObjectTypeEditDialog`, `BehaviorDialog`, `BehaviorExecuteDialog`, `AgentsMdEditor`, `BpmnViewer`, `DmnEditor`, `CausalAnalysisPanel`, `ChartConfigTab`, `SynonymSuggestionModal`.
- **호출 백엔드**: ontology 서비스(`/api/gateway/ontology/*`), node-agent-scheduler·agent-scheduler(`/api/gateway/*`), 원격 air-swmm(MF, 포트 5173).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 사용자는 분석된 시스템 위에 ObjectType 1개를 생성하고 다른 타입과 관계를 연결하는 작업을 별도 문서 없이 완료할 수 있다.
- **SC-002**: 문서 또는 DB 스키마에서 다층 온톨로지를 생성하면 그래프와 동의어 제안 건수가 표시되고, 저장 후 목록에서 재로드된다.
- **SC-003**: 온톨로지 노드 선택 시 실제 데이터와 추천 차트가 표시되어, 모델이 실제 데이터에 연결됨을 사용자가 확인할 수 있다.
- **SC-004**: ObjectType에 부착한 Behavior 실행 결과(성공/오류)가 화면에 노출되고, 에이전트 로그가 실시간(SSE) 스트림으로 갱신된다.
- **SC-005**: ontology/scheduler 서비스 다운 시 빈 화면 대신 어떤 서비스를 어떻게 기동하는지 안내 메시지가 표시된다.

## Assumptions

- 피지컬 레이어(추출된 테이블/스키마)와 Object Explorer가 선행 존재하며, 도메인 모델은 그 위에 구축된다(`@/features/object-explorer`, `@/features/schema` 재사용).
- 온톨로지·ObjectType·Behavior·Agent 데이터는 ontology 백엔드(및 Neo4j)에 영속화되고, 프론트는 상태를 보유하지 않는다.
- 모든 API는 API Gateway(`/api/gateway`, Vite 프록시 → Spring Gateway 9000) 단일 진입점을 통해 호출된다.
- 앱은 호스트(robo-architect)에 임베드되는 SPA로, 라우터 네비게이션 대신 단일 `/` 라우트 + 탭(`session.activeTab`)으로 화면을 전환한다(`src/router/index.ts`).
- 온톨로지 뷰어 탭은 외부 air-swmm 프론트(포트 5173)가 기동 중이어야 정상 동작한다.
- ObjectType/Behavior 명세상의 백엔드 계약(키 차이 등)은 호출처가 보존하며, 프론트는 엔드포인트만 정의한다.
