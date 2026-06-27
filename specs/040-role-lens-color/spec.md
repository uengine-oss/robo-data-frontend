# Feature Specification: 역할 렌즈 색상 — 역할로 isolate하면 노드를 역할색으로

**Feature Branch**: `main`
**Created**: 2026-06-28
**Status**: Draft

**Input**: 기본은 종류색(FUNCTION=빨강) 맞지만, 노드패널 역할 칩(Query)을 클릭해 isolate하면 그 [FUNCTION,Query] 노드는 역할색(Query=연두)으로 보여야 함. 지금은 종류색 그대로라 칩↔노드 색 불일치.

## 배경 (왜)
- 노드 색 = `getNodeColor(labels)` = `labels[0]`(종류) 고정(035). 역할 칩은 자기 역할색.
- "지금 무엇으로 isolate 중인지" = `canvasStore.loadedLabels`(칩 클릭 시 채워짐, 대문자) 이미 존재.
- → "활성 렌즈"로 색 결정: isolate한 역할이 노드에 있으면 그 역할로 색칠, 아니면 종류.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 역할 isolate 시 노드 역할색 (Priority: P1)
역할 칩(Query) 클릭 → 캔버스의 [*,Query] 노드가 Query 색(연두)으로. 해제하면 다시 종류색.

**Independent Test**: Query 칩 isolate → 그 노드 색 = getNodeColor(['Query']) (연두, 칩과 동일). 해제 → 종류색.

**Acceptance Scenarios**:
1. **Given** 기본 보기, **When** 캔버스, **Then** 노드 = 종류색(FUNCTION 빨강).
2. **Given** Query 칩 isolate, **When** 캔버스, **Then** [FUNCTION,Query] 노드 = Query 역할색(칩과 일치).
3. **Given** 종류 칩(FUNCTION) isolate, **When** , **Then** 종류색(빨강=기본, 변화 없음).
4. **Given** Query+Command 동시 isolate, **When** , **Then** 각 노드는 자기 역할색(Query 노드 연두, Command 노드 보라).
5. **Given** FUNCTION(종류)+Query(역할) 동시 isolate, [FUNCTION,Query] 노드, **Then** 역할 우선(연두).

### Edge Cases
- 노드가 isolate된 역할 미보유 → 종류색.
- EXTERNAL은 역할 아님(rolesOf 제외) → 렌즈 대상 아님.
- 노드패널 배지도 같은 렌즈 따라감(일관).
- 색 변경(부분갱신 updateElementsInGraph) — 위치 보존.

## Requirements *(mandatory)*
- **FR-001**: 색 라벨 결정 = `colorLabelOf(labels, isolatedRoles)` — 노드의 역할(rolesOf) 중 isolate된 게 있으면 그 역할, 없으면 kindOf(종류). 단일 헬퍼(덧대우기 금지).
- **FR-002**: NvlGraph 노드 색 = `getNodeColor([colorLabelOf(...)])`. isolatedLabels(loadedLabels) prop 수신.
- **FR-003**: isolate 변경 시 색만 부분 재갱신(위치·선택 보존).
- **FR-004**: 노드패널 배지(NodeDetailBase)도 같은 렌즈.
- **FR-005**: 역할+종류 동시 isolate → 역할 우선.

## Success Criteria *(mandatory)*
- **SC-001**: Query isolate → 노드 연두(칩 일치), 해제 → 종류색. vue-tsc 변경파일 0.
- **SC-002**: 기본 보기 색 = 종류(회귀 0).
- **SC-003**: 여러 역할 isolate → 각 자기 역할색.

## Assumptions
- loadedLabels(대문자)·getNodeColor·kindOf/rolesOf 재사용. 신규 색 알고리즘 0(렌즈 라벨 선택만).
