# Feature Specification: 필터 칩 케이스 통일 (역할 칩 하이라이트 복원)

**Feature Branch**: `041-filter-chip-case-unify`

**Created**: 2026-06-28

**Status**: Draft

**Input**: 오버뷰 "Node labels" 필터에서 역할 칩(Command/Query/Service 등) 클릭 시 캔버스는 isolate 되지만 칩 자체의 active 하이라이트가 안 켜지는 버그의 근본수정.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 역할 칩 클릭 시 켜짐/꺼짐이 보인다 (Priority: P1)

분석 그래프 오버뷰의 "Node labels" 목록에서 역할 칩(예: Command, Query, Service)을 클릭하면, 캔버스에 해당 노드들이 모이는 것과 **동시에 그 칩이 "켜짐(active)" 상태로 강조**되어, 사용자가 "지금 무엇을 보고 있는지"를 칩만 보고도 안다. 같은 칩을 다시 누르면 강조가 풀린다.

**Why this priority**: 현재 역할 칩은 눌러도 강조가 안 떠서, 캔버스에는 변화가 있는데 "내가 뭘 눌렀는지/켜져 있는지"를 알 수 없다. 필터 UI의 기본 피드백이 깨진 상태라 최우선.

**Independent Test**: 오버뷰에서 역할 칩 하나를 클릭 → 칩이 active로 강조되고 캔버스에 해당 역할 노드가 isolate 되는지 확인. 다시 클릭 → 강조 해제.

**Acceptance Scenarios**:

1. **Given** 분석 그래프가 로드된 상태, **When** 사용자가 역할 칩(Command)을 클릭, **Then** 그 칩이 active 상태로 강조되고 캔버스에 [*, Command] 노드들이 모인다.
2. **Given** Command 칩이 active 인 상태, **When** 같은 칩을 다시 클릭, **Then** 강조가 해제되고 캔버스에서도 빠진다.
3. **Given** 분석 그래프가 로드된 상태, **When** 사용자가 종류 칩(FUNCTION)을 클릭, **Then** 종전과 동일하게 칩이 강조되고 캔버스에 FUNCTION 노드가 모인다(회귀 없음).

### User Story 2 - 역할 렌즈 색이 그대로 동작한다 (Priority: P1)

역할 칩으로 isolate 하면, 캔버스의 해당 노드와 노드 디테일 배지가 그 역할의 색(역할 렌즈, 기존 동작)으로 칠해져 칩 색과 일치한다. 이번 수정 후에도 이 색 일치가 유지된다.

**Why this priority**: 케이스 통일이 색 렌즈(기존 기능)와 같은 데이터(loadedLabels)를 공유하므로, 같이 정리하지 않으면 색 렌즈가 깨질 수 있다. 회귀 방지를 위해 함께 보장해야 한다.

**Independent Test**: Command 칩으로 isolate → 캔버스의 [*, Command] 노드가 역할색으로, 평소엔 종류색으로 표시되는지 확인.

**Acceptance Scenarios**:

1. **Given** Command 칩을 클릭해 isolate 한 상태, **When** 캔버스를 본다, **Then** [*, Command] 노드가 역할(Command) 색으로 칠해진다.
2. **Given** 아무 칩도 active 가 아닌 기본 상태, **When** 캔버스를 본다, **Then** 노드는 종류(labels[0]) 색으로 칠해진다.

### Edge Cases

- 한 노드가 여러 역할을 가지는 경우는 현재 데이터에 없음(실측: 노드당 역할 0~1개). 다중 역할이 들어와도 "isolate 된 역할이 있으면 그 역할색, 없으면 종류색" 규칙은 그대로 성립한다.
- 같은 라벨이 대/소문자 두 형태로 동시에 존재하는 경우는 없음(neo4j 실측: 라벨 24종, 케이스 충돌 0건). 따라서 원본 케이스 정확매칭이 안전하다.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 사용자가 오버뷰 Node labels 의 역할 칩을 클릭하면, 그 칩이 active(켜짐)로 강조되어야 한다.
- **FR-002**: 사용자가 active 인 칩을 다시 클릭하면, 강조가 해제(꺼짐)되어야 한다.
- **FR-003**: 종류 칩(대문자)의 강조 동작은 기존과 동일하게 유지되어야 한다(회귀 없음).
- **FR-004**: 칩 클릭 시 캔버스에 해당 라벨 노드를 모으는(isolate) 동작은 기존과 동일하게 유지되어야 한다.
- **FR-005**: 역할 칩으로 isolate 했을 때 캔버스 노드와 노드 디테일 배지의 역할 렌즈 색(기존 동작)이 유지되어야 한다.
- **FR-006**: 라벨 비교는 라벨의 원본 표기(케이스)를 그대로 사용한 정확매칭이어야 하며, 특정 화면/비교 지점에서만 임시로 케이스를 맞추는 처리(예: 비교부에 toUpperCase 추가)는 두지 않는다.

### Key Entities

- **로드된 라벨 집합(loadedLabels)**: 사용자가 칩으로 isolate 한 노드 라벨들의 집합. 칩 강조 판정·캔버스 채움·역할 렌즈 색의 공통 입력. 라벨은 그래프 원본 표기로 보관된다.
- **노드 라벨(labels)**: `labels[0]`=종류(antlr 타입, 대문자), `labels[1:]`=역할(stereotype, CamelCase). 그래프 전체에서 단일 케이스로 canonical.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 모든 역할 칩과 모든 종류 칩에 대해, 클릭하면 100% active 강조가 켜지고 재클릭하면 꺼진다.
- **SC-002**: 칩 클릭 → 캔버스 isolate, 역할 isolate → 역할색 표시가 기존과 동일하게 동작한다(기존 기능 회귀 0건).
- **SC-003**: 케이스 정규화(toUpperCase 등) 처리 지점 수가 수정 전보다 줄어든다(코드가 통합·감소).

## Assumptions

- 노드 라벨은 analyzer 가 canonical 단일 케이스로 적재한다(종류=UPPER_SNAKE, 역할=CamelCase). neo4j 실측으로 케이스 충돌 0건 확인됨.
- 칩 라벨은 노드 라벨을 원본 그대로 표시·전달한다(별도 케이스 변형 없음).
- 우클릭 isolate·보기모드 일괄 로드는 loadedLabels(칩 강조)와 무관한 별개 메커니즘이라 이번 범위에 포함하지 않는다.
