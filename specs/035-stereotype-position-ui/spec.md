# Feature Specification: 역할(stereotype) 위치기반 UI — 패널 분리 + 색 정리 + 필터 구분

**Feature Branch**: `main`

**Created**: 2026-06-27

**Status**: Draft

**Input**: analyzer가 stereotype을 노드 라벨로 부여(spec 033, `labels[0]`=antlr 타입, `labels[1:]`=역할). 프론트가 이를 **위치기반**으로 소비 — 노드패널에 종류/역할 분리 표시, 색·라벨 추출을 위치기반으로 정리(하드코딩 역할집합 제거), 필터에 종류/역할 섹션 구분.

## 배경 (왜)

- analyzer가 노드에 멀티라벨 `[antlr타입, stereotype…]`을 부여(spec 033). `labels[0]`=종류, `labels[1:]`=역할 보장(생성순).
- 현재 프론트는 **하드코딩 역할집합 2벌**으로 종류/역할을 가른다:
  - `analyzer.ts:43` `PRIMARY_LABELS`(옛 stereotype명, ontology와 불일치하는 stale 집합) — `extractSubLabel`이 "이 집합 제외 첫 라벨"로 종류 추출.
  - `graphStyles.ts:90` `PRIMARY_LABELS`(구조타입 집합) — `getNodeColor`/`getNodeSize`가 이 집합으로 정렬해 색/크기 기준 라벨 선택.
- 이 하드코딩 집합은 ontology_roles.yaml 변경 시 드리프트. `labels[0]`=타입이 보장되므로 **위치로** 대체 → 드리프트 0.
- 노드패널은 역할(stereotype)을 속성(`p.stereotype`)에서 "분류" 행으로 보여주나, 위치기반(labels)으로 종류/역할을 명확히 분리해야(사용자 요구 "구분해서 표시").

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 노드패널에 종류/역할 분리 표시 (Priority: P1)

노드 클릭 시 디테일 패널이 **종류(labels[0], 예 FUNCTION)**와 **역할(labels[1:], 예 Command)**을 위치기반으로 분리해 보여준다. 하드코딩 집합 없이.

**Why this priority**: 사용자 핵심 요구("종류와 역할 구분해서 표시"). 역할 일급 가시성의 본체.

**Independent Test**: 함수 노드(라벨 `[FUNCTION, Command]`) 선택 → 패널에 종류=함수, 역할=Command 별도 표시 확인.

**Acceptance Scenarios**:
1. **Given** 노드 `[FUNCTION, Command]`, **When** 패널 표시, **Then** 종류=함수(FUNCTION), 역할=Command 분리 표시.
2. **Given** 노드 `[FILE, Service]`, **When** 패널, **Then** 종류=파일(FILE), 역할=Service.
3. **Given** stereotype 없는 노드 `[SELECT]`, **When** 패널, **Then** 종류=SELECT, 역할 없음(역할 영역 미표시).
4. **Given** 외부 stub `[FUNCTION, EXTERNAL]`, **When** 패널, **Then** 역할로 EXTERNAL을 표시하지 않음(EXTERNAL=종류미상 stub 마커이지 역할 아님).

### User Story 2 - 색·라벨 추출 위치기반 정리 (회귀 0, 색 불변) (Priority: P1)

색상·라벨추출 로직이 하드코딩 역할집합 대신 `labels[0]`(위치)을 쓴다. **노드 색은 종류 기준 그대로 — 시각적 변화 없음.**

**Why this priority**: 드리프트 제거 + 멀티라벨 도입으로 깨질 수 있는 색/이름 로직의 정합. 사용자에게 색이 갑자기 바뀌면 안 됨.

**Independent Test**: stereotype 라벨 부여 전후로 같은 노드의 색이 동일한지 + 라벨추출이 종류(labels[0]) 반환하는지.

**Acceptance Scenarios**:
1. **Given** 노드 `[FUNCTION, Command]`, **When** 색 계산, **Then** `distinctColorForLabel(FUNCTION)` = stereotype 부여 전과 동일 색.
2. **Given** 노드 라벨, **When** `extractSubLabel`, **Then** `labels[0]`(종류) 반환(하드코딩 집합 미사용).
3. **Given** 외부 stub `[FUNCTION, EXTERNAL]`, **When** 색/이름, **Then** 종류=FUNCTION 기준(불변).

### User Story 3 - 필터에 종류/역할 섹션 구분 (Priority: P2)

"Node labels" 필터가 종류 칩과 역할 칩을 **위치기반으로 분리된 섹션**으로 보여준다. 역할 라벨이 자동 등장하되 종류와 섞이지 않는다.

**Why this priority**: 역할로 필터링 일급화 + 종류/역할 혼동 방지(사용자 "구분해서 표시").

**Independent Test**: 분석 후 필터 패널에 종류 섹션(FILE/FUNCTION/…)과 역할 섹션(Command/Service/…)이 분리 표시되는지.

**Acceptance Scenarios**:
1. **Given** 그래프에 `[FUNCTION,Command]` 등, **When** 필터 패널, **Then** 종류 섹션과 역할 섹션 분리, 각 칩 클릭 시 해당 라벨 필터.
2. **Given** EXTERNAL stub, **When** 필터, **Then** EXTERNAL은 종류 섹션 취급(역할 아님) 또는 명확히 구분.

### Edge Cases

- `labels[1:]`에 EXTERNAL 포함(stub) → 역할로 취급하지 않음(stub 마커). 종류측 또는 별도 처리.
- stereotype 없는 노드(구문 SELECT/IF, 테이블) → 역할 영역 미표시(빈 영역 없음).
- 라벨 순서가 어긋난 노드(이론상 caveat) → 최악 종류/역할 1회 swap 표시(데이터 무손상, 경미).
- 기존 stereotype 속성(`p.stereotype`)은 analyzer가 아직 유지(무중단) — 단 표시는 위치기반 라벨 우선.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 노드패널이 종류=`labels[0]`, 역할=`labels[1:]`(EXTERNAL 제외)을 위치기반으로 분리 표시.
- **FR-002**: `extractSubLabel`은 `labels[0]`(종류)을 반환. 하드코딩 역할집합(`analyzer.ts PRIMARY_LABELS`) 제거.
- **FR-003**: `getNodeColor`/`getNodeSize`는 `labels[0]`(위치) 기준. 하드코딩 `graphStyles.ts PRIMARY_LABELS` 제거. **색·크기 결과는 기존과 동일**(회귀 0).
- **FR-004**: 필터 "Node labels"가 종류 섹션과 역할 섹션을 위치기반으로 분리. 종류 = 어떤 노드에서든 `labels[0]`로 등장한 라벨, 역할 = 그 외(`labels[1:]` 전용). 하드코딩 집합 금지.
- **FR-005**: EXTERNAL은 역할로 표시/분류하지 않음(stub 종류미상 마커).
- **FR-006**: stereotype 없는 노드는 역할 영역/칩을 만들지 않음.

### Key Entities

- **종류(kind)**: `labels[0]` = antlr 타입. 노드의 "무엇인가".
- **역할(role)**: `labels[1:]`(EXTERNAL 제외) = stereotype. 노드의 "무엇을 하는가".

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: stereotype 보유 노드 패널에서 종류/역할이 분리 표시(100%).
- **SC-002**: stereotype 부여 전후 노드 색상 동일(시각 회귀 0).
- **SC-003**: 하드코딩 역할/구조 집합 2벌(analyzer.ts·graphStyles.ts PRIMARY_LABELS) 제거 — 위치기반으로 대체.
- **SC-004**: 필터에 종류/역할 섹션 분리, 역할 칩으로 필터 동작.
- **SC-005**: vue-tsc 변경파일 새 에러 0. 앱(또는 vite+playwright) 시각 확인.

## Assumptions

- analyzer spec 033 적용·검증 완료 — 현재 neo4j 그래프가 `[antlr타입, stereotype]` 멀티라벨 보유(`labels[0]`=타입). 프론트는 이를 읽음.
- `labels[0]`=타입은 contract(spec 033 contracts/stereotype-label-contract.md)로 약속됨. caveat(순서 비보장)는 수용(최악 경미).
- stereotype 속성도 당분간 존재(무중단) — 단 표시 기준은 위치기반 라벨로 이전.
- `templateRouter.pickTemplate`은 이미 위치안전(`labels.some(타입집합)`+`labels[0]`)이라 변경 불필요.
- architect `module_retriever`의 stereotype 속성 의존은 별개(이번 범위 밖, 속성 유지로 무영향).
