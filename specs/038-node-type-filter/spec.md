# Feature Specification: 필터 메뉴 노드 타입 필터(노드/관계 영역구분) + DEFINE 기본 숨김

**Feature Branch**: `main`
**Created**: 2026-06-27
**Status**: Draft

**Input**: (1) 필터 ▾ 메뉴에 관계만 끄고/켜기 있고 **노드 타입 끄고/켜기가 없음** → 노드도 필터링되게. 메뉴를 **노드 영역 / 관계 영역으로 구분**. (2) DEFINE 노드를 기본 보기모드에서 제거(GLOBAL_VARIABLE처럼).

## 배경 (왜)
- 캔버스(NvlGraph)는 관계 타입 blacklist(`hiddenRelTypes`)로 끈 관계를 렌더서 제외. **노드 타입엔 같은 메커니즘이 없음.**
- DEFINE(C 매크로 #define)은 양 많고 설계 흐름과 무관 → GLOBAL_VARIABLE과 같은 부류라 기본 숨김.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 노드 타입 끄고/켜기 (Priority: P1)
필터 ▾ 메뉴 "노드" 영역에서 노드 타입(FUNCTION/TABLE/Command 등)을 끄면 그 라벨을 가진 노드가 캔버스에서 사라진다(끝점 잃은 관계도 함께). 다시 켜면 복원.

**Independent Test**: 캔버스에 노드 로드 → 필터에서 FUNCTION 끄기 → FUNCTION 노드·그 관계 사라짐 → 켜면 복원.

**Acceptance Scenarios**:
1. **Given** 캔버스에 FUNCTION 노드, **When** 필터 노드영역 FUNCTION 끔, **Then** FUNCTION 노드 미표시 + 끝점 잃은 관계도 미표시.
2. **Given** 끈 상태, **When** 다시 켬, **Then** 복원. 데이터(canvasGraphData) 불변.

### User Story 2 - 필터 메뉴 노드/관계 영역구분 (Priority: P1)
필터 ▾ 메뉴가 **숨김 요소 표시 / 노드 끄고·켜기 / 관계 끄고·켜기** 세 영역으로 구분되어 한눈에 들어온다.

**Acceptance Scenarios**:
1. **Given** 필터 메뉴, **When** 열기, **Then** 노드 영역(노드 타입 칩)과 관계 영역(관계 타입 칩)이 구분선으로 나뉘어 표시.

### User Story 3 - DEFINE 기본 숨김 (Priority: P2)
DEFINE 노드가 기본 그래프·필터·네비에 안 보이고, "숨김 요소 표시" 켜면 나온다(GLOBAL_VARIABLE과 동일).

**Acceptance Scenarios**:
1. **Given** DEFINE 노드, **When** 기본 보기, **Then** 미표시. **When** 숨김 요소 표시 ON, **Then** 표시.

### Edge Cases
- 멀티라벨 노드([FUNCTION, Command]) → 어느 라벨이든 꺼지면 그 노드 숨김(any-label blacklist).
- 노드 필터와 관계 필터·숨김토글은 **서로 독립 축**.
- 노드 끄기로 데이터 삭제 0(렌더 단계 필터, 다시 켜면 복원).

## Requirements *(mandatory)*
- **FR-001**: 캔버스가 노드 타입 blacklist(`hiddenNodeTypes`)로 그 라벨 노드를 렌더서 제외(끝점 잃은 관계도 자동 제외).
- **FR-002**: 노드 필터 토글 기계(상태/토글/표시/카운트)는 관계 필터와 **공통 팩토리 공유**(중복 0, 덧대우기 금지).
- **FR-003**: 필터 ▾ 메뉴 = 숨김토글 + 노드 영역 + 관계 영역(구분선).
- **FR-004**: `HIDDEN_NODE_LABELS`에 DEFINE 추가(기본 숨김, 데이터 보존, 숨김토글로 복원).
- **FR-005**: 노드/관계/숨김 세 필터는 독립.
- **FR-006**: 필터 메뉴 노드·관계 목록은 **콤팩트 칩(flex-wrap)** — 종류·관계 수가 많아도 적은 세로공간에 감싸지고, 그래도 길면 메뉴가 스크롤(max-height). 끈 칩=흐림+취소선.

## Success Criteria *(mandatory)*
- **SC-001**: 노드 타입 끄면 그 노드·관계 캔버스서 사라지고, 켜면 복원(데이터 불변).
- **SC-002**: 관계 필터 회귀 0(공통 팩토리 이관 후도 동일 동작).
- **SC-003**: DEFINE 기본 미표시, 숨김토글 ON시 표시.
- **SC-004**: 메뉴 노드/관계 영역 구분 + 칩이 감싸져 많은 종류도 콤팩트(스크롤 대응). vue-tsc 변경파일 0.

## Assumptions
- 노드 필터 목록 = 현재 캔버스 노드 라벨(canvasGraphData). 관계 목록과 동형.
- 공통 팩토리 = createTypeFilter(): {hidden, toggle, isShown, count}. 관계·노드 둘 다 사용(DRY).
