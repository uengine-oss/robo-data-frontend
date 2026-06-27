# Feature Specification: 그래프 스타일 패널 "기본값" 스와치(되돌리기)

**Feature Branch**: `main`
**Created**: 2026-06-28
**Status**: Draft

**Input**: 관계/노드 색을 한번 바꾸면 기본값으로 되돌릴 방법이 없음. → 색 팔레트 **맨 앞에 "기본값" 스와치**를 넣고 누르면 커스텀 제거(removeStyle)로 진짜 기본색 복원.

## 배경 (왜)
- `GraphStylePanel.vue`는 `setColor`만 노출, 저장소 `removeStyle`(커스텀 제거→기본 복원, saveStyles가 storageVersion 올려 즉시 반영)이 있는데 UI가 호출 못 함.
- 사용자 제안: 별도 버튼 대신 **팔레트 첫 칸 = 그 요소의 기본색**(관계=회색, 노드=종류 자동색). 누르면 리셋.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 기본값 스와치로 되돌리기 (Priority: P1)
스타일 패널 색 팔레트 맨 앞 "기본값" 스와치(그 요소의 기본색 표시)를 누르면 커스텀 색이 지워지고 기본값으로 즉시 복원.

**Independent Test**: 관계 색 빨강으로 변경 → 팔레트 첫 "기본값"(회색) 클릭 → 캔버스·패널 회색 복원.

**Acceptance Scenarios**:
1. **Given** 관계 커스텀 색 있음, **When** "기본값" 스와치 클릭, **Then** `removeStyle` → 기본 회색 즉시 복원(storageVersion).
2. **Given** 노드(종류 FUNCTION), **When** "기본값" 스와치, **Then** FUNCTION 종류 자동색으로 복원.
3. **Given** 커스텀 없음, **When** "기본값" 스와치 active 표시(현재 = 기본).

### Edge Cases
- "기본값"은 setColor(특정색)이 아니라 **removeStyle**(완전 기본 복원, 색+크기 항목 제거).
- 다른 타입 커스텀 불변(그 타입 항목만 삭제).

## Requirements *(mandatory)*
- **FR-001**: 색 팔레트 맨 앞에 "기본값" 스와치 — 그 요소의 기본색(resolveDefaultColor) 표시.
- **FR-002**: 클릭 시 `removeStyle(category, elementType)` → 기본 복원(saveStyles가 storageVersion 갱신=캔버스 즉시 반영).
- **FR-003**: 커스텀 없을 때(기본 상태) "기본값" 스와치 active.

## Success Criteria *(mandatory)*
- **SC-001**: 커스텀 색 후 "기본값" 클릭 → 기본색 복원(캔버스+패널). vue-tsc 변경파일 0.
- **SC-002**: removeStyle 호출(setColor 아님) — 진짜 되돌리기.

## Assumptions
- 저장소 removeStyle/saveStyles(bumpVersion) 재사용 — 신규 저장로직 0(UI 배선만).
