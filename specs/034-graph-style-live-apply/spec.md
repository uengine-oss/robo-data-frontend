# Feature Specification: 그래프 스타일(색/크기) 변경 즉시 반영 — 회귀 복원

**Feature Branch**: `034-graph-style-live-apply`

**Created**: 2026-06-27

**Status**: Draft

**Input**: 앱 실측 — 노드 스타일 패널에서 **색상을 바꿔도 그래프 캔버스에 반영 안 됨**(관계 색/두께도 동일 의심). 원래 되던 기능이 사라진 회귀. 색상만 딱 바뀌고 노드 위치/레이아웃은 그대로여야 함.

## 배경 / 현재 동작 (왜)

스타일 패널(GraphStylePanel)에서 색/크기를 고르면 `graphStyleStorage.setColor/setSize`가 localStorage에 저장하고 반응성 트리거 `storageVersion`을 +1 한다. 색 결정 함수(`getNodeColor`/`getRelationshipColor`)는 이 사용자 색을 반영한다.

**확인된 사실(코드)**: 그래프 캔버스(NvlGraph)에는 스타일을 NVL에 부분 반영하는 함수가 **이미 존재**한다 — `updateNodeStyles`/`updateRelationshipStyles`/`updateAllStyles`(NVL `updateElementsInGraph`로 **색·크기/두께만** 갱신, 위치·레이아웃 보존). 그러나 **이 함수들을 스타일 변경 시 호출하는 트리거가 끊겨 있다**: NvlGraph는 `storageVersion`을 구독하지 않고, 부모(GraphTab)도 스타일 변경 시 `updateAllStyles()`를 호출하지 않는다(통계/범례 패널만 storageVersion으로 재계산). → 캔버스 미반영(회귀).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 색 바꾸면 그래프에 즉시 반영 (Priority: P1)

스타일 패널에서 노드(또는 관계) 색을 바꾸면 **그래프 캔버스의 해당 요소 색이 즉시** 바뀐다. 노드 **위치·레이아웃·선택 상태는 그대로**(색만 변경).

**Why this priority**: 사용자가 직접 지목한, 사라진 핵심 기능.

**Independent Test**: 스타일 변경(storageVersion 증가) 시 NVL `updateElementsInGraph`가 해당 색/크기 부분으로 호출되고 위치는 미변경.

**Acceptance Scenarios**:
1. **Given** 캔버스에 특정 라벨 노드들이 그려져 있음, **When** 그 라벨 색을 변경, **Then** 캔버스의 그 노드들 색이 즉시 바뀐다(위치 불변).
2. **Given** 관계 타입 색/두께를 변경, **When** 적용, **Then** 캔버스의 그 관계들 색/두께가 즉시 바뀐다(끝점/위치 불변).
3. **Given** 색이 안 바뀐 요소, **When** 갱신, **Then** 그 요소는 건드리지 않음(no-op, 위치/상태 보존).

### Edge Cases
- 색 기준이 '건강(health)' 모드인 노드 → 사용자 라벨색이 적용 안 됨(risk 색 유지)이 정상. 크기는 갱신.
- 캔버스에 없는 라벨/타입의 스타일 변경 → 캔버스 변화 없음(NVL이 미존재 id 무시).
- 클러스터 보기 등에서도 위치/군집 배치 보존(부분 갱신이라 force 재정착 없음).

## Requirements *(mandatory)*

- **FR-001**: 스타일(색/크기/두께) 변경 시 그래프 캔버스의 해당 요소가 **즉시 반영**되어야 한다.
- **FR-002**: 반영은 **색·크기/두께만** 부분 갱신해야 한다(노드 위치·레이아웃·선택 상태·끝점 보존). NVL `updateElementsInGraph`(제공 속성만 변경) 사용.
- **FR-003**: 변경된 요소만 갱신(불변 요소 no-op).
- **FR-004**: 색 기준(health/label) 모드를 존중(health 노드는 risk 색 유지).
- **FR-005**: 기존 스타일 함수(`updateAllStyles` 등, 이미 존재)를 재사용 — 신규 렌더 경로 추가 없음.

## Success Criteria *(mandatory)*

- **SC-001**: 색 변경 후 그래프 캔버스 색이 바뀐다(현재=안 바뀜).
- **SC-002**: 색 변경으로 노드 위치/레이아웃이 **이동하지 않는다**(색만).
- **SC-003**: 관계 색/두께도 동일 반영.
- **SC-004**: 통계/범례 패널 색(기존 동작) 회귀 0.

## Assumptions

- 기존 `updateNodeStyles`/`updateRelationshipStyles`/`updateAllStyles` 는 정상 동작(위치 보존 부분 갱신) — 트리거만 끊겼던 것. 복원 = NvlGraph가 `storageVersion`을 watch해 `updateAllStyles()` 호출.
- 라이브 실증은 앱에서 색 변경으로 확인(미검증 표기) — 단위/타입은 검증.
