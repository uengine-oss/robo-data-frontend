# Feature Specification: 그래프 다중선택 필터(선택된 것만 보기) + 노드패널 트리거 + 레이블/관계 스타일

**Feature Branch**: `025-graph-multiselect-filter`

**Created**: 2026-06-23

**Status**: Draft

**Input**: 그래프에서 노드 라벨·관계 타입을 여러 개 골라 "선택된 것만" 보고, 그 레이블·관계에 색상·선두께를 지정한다. legacy 브랜치에 있던 다중선택 필터를 되살려 현재 코드에 녹인다.

## 개요 *(맥락)*

전수조사로 확정한 현재 상태:
- **legacy 브랜치(`origin/legacy`)의 GraphTab**: 노드 라벨 **다중선택 필터**(`new Set(labelFilters)` 토글 누적 → 여러 라벨 whitelist 표시)가 있었다.
- **현재 main(spec 021 재설계)**: 단일 isolate로 **퇴화**(`labelFilters.value = [label]` 덮어쓰기, `canvasStore.isolateLabel` 단일). 관계 필터는 `hiddenRelTypes`(blacklist=숨김)·`relFilter`로 "선택된 것만"이 아니다.
- **관계 색상·선두께**: `GraphStylePanel.vue`에 **이미 존재·노출**(GraphTab에서 사용). 노드=색+크기, 관계=색+두께. legacy와 거의 동일 — 새로 만드는 게 아니라 **이미 있는 것을 다중선택과 통합**하는 일.
- **노드패널 트리거 토대**: `NodeDetailPanel`이 이미 `label-filter`·`relationship-type-select` emit을 갖고 있다.

따라서 이 기능은 **(1) legacy의 다중선택 필터를 되살려 whitelist로 통합 + (2) 노드패널 칩에서 다중 토글 + (3) 기존 GraphStylePanel 스타일을 그 흐름에 연결**하는 작업이다.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 노드 라벨 다중선택 → 선택된 것만 보기 (Priority: P1)

사용자가 노드 라벨(예: TABLE, SELECT, PROCEDURE)을 **여러 개** 골라, 캔버스에 **고른 라벨의 노드만** 보이게 한다. 하나만 고르면 그것만, 여러 개면 그것들만, 다 해제하면 전체로 돌아온다.

**Why this priority**: 핵심 요구. 현재는 한 번에 하나만 isolate돼(다른 걸 누르면 이전 게 풀림) 여러 종류를 함께 보지 못한다. legacy엔 있던 기능의 회복.

**Independent Test**: 라벨 A 선택 → A만 표시. 라벨 B 추가 선택 → A·B 표시(누적). A 다시 클릭 → 해제되어 B만. 전부 해제 → 전체 표시.

**Acceptance Scenarios**:
1. **Given** 전체 그래프, **When** 라벨 칩 A 클릭, **Then** A 라벨 노드만 캔버스에 보인다.
2. **Given** A만 보이는 상태, **When** 라벨 칩 B 클릭, **Then** A·B 노드가 함께 보인다(누적, 덮어쓰기 아님).
3. **Given** A·B 보이는 상태, **When** A 다시 클릭, **Then** A가 해제되어 B만 보인다.
4. **Given** 선택이 비어 있음, **When** 어떤 라벨도 선택 안 함, **Then** 전체 그래프가 보인다(기본).

---

### User Story 2 - 관계 타입 다중선택 → 선택된 것만 보기 (Priority: P1)

사용자가 관계 타입(예: CALLS, READS, WRITES)을 **여러 개** 골라, **고른 관계만** 캔버스에 보이게 한다(whitelist). 다 해제하면 전체 관계.

**Why this priority**: 노드와 대칭. 현재는 관계를 "숨김(blacklist)"으로만 끌 수 있어 "이것만 보기"가 직관적이지 않다.

**Independent Test**: 관계 CALLS 선택 → CALLS 선만 표시. READS 추가 → CALLS·READS만. 해제 → 전체.

**Acceptance Scenarios**:
1. **Given** 전체 관계, **When** 관계 칩 CALLS 선택, **Then** CALLS 관계선만 보인다.
2. **Given** CALLS만 보임, **When** READS 추가 선택, **Then** CALLS·READS만 보인다.
3. **Given** 관계 선택이 비어 있음, **Then** 전체 관계가 보인다(기본).
4. **Given** 노드 다중선택과 동시, **When** 라벨 A·B + 관계 CALLS 선택, **Then** A·B 노드 사이의 CALLS만 보인다(교집합).

---

### User Story 3 - 노드 상세패널에서 칩 클릭으로 다중선택 (Priority: P2)

노드 상세패널(NodeDetailPanel)의 **레이블 통계 칩·관계 통계 칩**을 클릭하면 US1·US2의 다중선택에 **토글로 추가/제거**된다. 별도 필터 메뉴를 안 열어도 패널에서 바로 골라 본다.

**Why this priority**: 사용자가 명시한 "노드패널에서 누르면 그것만". 기존 `label-filter`·`relationship-type-select` emit을 다중 토글로 확장.

**Independent Test**: 패널에서 레이블 칩 클릭 → 해당 라벨이 선택에 추가(캔버스 반영). 다시 클릭 → 제거. 관계 칩도 동일.

**Acceptance Scenarios**:
1. **Given** 노드 패널이 열림, **When** 레이블 칩 클릭, **Then** 그 라벨이 다중선택에 토글되어 캔버스가 즉시 반영된다.
2. **Given** 패널의 관계 칩, **When** 클릭, **Then** 그 관계 타입이 다중선택에 토글된다.
3. **Given** 선택된 칩, **When** 시각적 확인, **Then** 선택 상태(활성)가 칩에 표시된다.

---

### User Story 4 - 레이블·관계 색상·선두께 지정 (Priority: P3)

선택한 노드 라벨·관계 타입에 **색상**과 **선두께(관계)/크기(노드)**를 지정해 영속한다. 기존 `GraphStylePanel`을 다중선택 흐름에 연결한다.

**Why this priority**: 색/두께 지정 자체는 이미 구현돼 있어(GraphStylePanel) 위험·작업량이 낮다. 다중선택과의 연결만 필요.

**Independent Test**: 라벨/관계 선택 → 스타일 패널에서 색·두께 변경 → 캔버스 즉시 반영 + 새로고침 후 유지(localStorage).

**Acceptance Scenarios**:
1. **Given** 라벨 선택, **When** 색상 지정, **Then** 그 라벨 노드 색이 바뀌고 영속된다(기존 graphStyleStorage).
2. **Given** 관계 선택, **When** 선두께 지정, **Then** 그 관계선 두께가 바뀌고 영속된다.

---

### Edge Cases
- 다중선택 whitelist가 캔버스의 0개 노드와 매칭(선택한 라벨이 현재 캔버스에 없음) → 빈 안내 또는 그 라벨 노드 로드(현 `loadNodesByLabels` 패턴 계승).
- 보기모드(모듈간·협력군집·영역구조·건강)와 다중선택 필터의 상호작용 — 보기모드 전환 시 선택 유지/초기화 정책.
- 노드 다중선택 + 관계 다중선택 동시 = 교집합(US2-4).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 노드 라벨 필터는 **다중선택**(토글 누적)을 지원해야 한다 — 선택된 라벨들의 노드만 표시(whitelist), 빈 선택은 전체.
- **FR-002**: 관계 타입 필터는 **다중선택 whitelist**를 지원해야 한다 — 선택된 관계만 표시, 빈 선택은 전체.
- **FR-003**: 노드 라벨·관계 다중선택이 **동시 적용** 시 교집합(선택 라벨 노드 + 선택 관계)으로 표시되어야 한다.
- **FR-004**: `NodeDetailPanel`의 레이블 칩·관계 칩 클릭이 FR-001·FR-002의 다중선택을 **토글**해야 하며, 선택 상태가 칩에 시각적으로 표시되어야 한다.
- **FR-005**: 레전드/필터 UI와 노드패널 칩은 **같은 다중선택 상태를 공유**해야 한다(단일 진실원천 — 한 곳에서 바꾸면 다른 곳도 반영).
- **FR-006**: 노드 라벨(색·크기)·관계 타입(색·선두께) 스타일 지정은 **기존 `GraphStylePanel`·`graphStyleStorage`를 재사용**해 영속한다(중복 구현 금지).
- **FR-007**: legacy의 다중선택 토글 로직을 **현재 구조에 맞게 리팩토링해 녹인다**(legacy 코드 복붙이 아니라 현재 `GraphTab`/`canvasStore`/`NvlGraph` 계약에 정합).
- **FR-008**: spec 021의 단일 isolate(`labelFilters=[label]`)·blacklist(`hiddenRelTypes`)는 본 다중선택으로 **supersede**하되, 옛 스펙 문서는 보존하고 충돌을 명시한다.

### Key Entities *(데이터 관련)*

- **노드 라벨 선택 상태**: 선택된 라벨 집합(`Set<string>`/정렬 배열). 빈 = 전체.
- **관계 타입 선택 상태**: 선택된 관계 타입 집합(whitelist). 빈 = 전체.
- **StyleMap**(기존): 라벨/관계 타입 → `{color, size}`(localStorage 영속, graphStyleStorage).
- **GraphNode.labels / GraphLink.type**: 필터 매칭의 기준값(보존계약 — opaque).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 노드 라벨을 2개 이상 선택했을 때 그 라벨들의 노드가 **동시에** 보인다(현재는 1개만 — 회복 확인).
- **SC-002**: 관계 타입을 2개 이상 선택했을 때 그 관계들만 보인다(whitelist).
- **SC-003**: 노드패널 칩 클릭과 필터 UI가 동일 선택 상태를 공유(한쪽 변경이 다른쪽에 즉시 반영) — Playwright로 양방향 확인.
- **SC-004**: 라벨/관계 색·선두께 변경이 캔버스에 반영되고 새로고침 후 유지(localStorage).
- **SC-005**: 기존 단일 필터·보기모드(모듈간·협력군집·영역구조·건강)가 다중선택 도입 후에도 정상 동작(회귀 0) — Playwright 전 보기모드 확인.

## Assumptions

- "선택된 것만" = **whitelist**(고른 것만 표시), 빈 선택 = 전체(현 기본 동작 계승).
- 노드 스타일 = 색+크기, 관계 스타일 = 색+선두께(기존 GraphStylePanel 의미 유지). "레이블 선두께"는 관계의 선두께를 가리키며, 노드 라벨은 크기로 해석한다(불명확 시 이 기본).
- 보기모드 전환 시 다중선택 필터는 **초기화**한다(보기모드가 자체 노드집합을 구성하므로 — 현 `applyViewMode`가 `labelFilters=[]` 리셋하는 흐름 계승). 추후 사용자 피드백으로 유지 정책 변경 가능.
- 검증은 실데이터(catalog 그래프)로 풀스택 Playwright 라이브 + 회귀(전 보기모드·기존 단일필터 동작 보존).
- legacy 코드는 **참고만** — 현재 feature 폴더 구조(`features/code-analysis`)·스토어 계약·NVL props에 맞게 재작성(복붙 금지).

## 구현 후속 다듬기 (2026-06-23 사용자 피드백 반영)

구현·라이브검증 후 사용자 피드백으로 정련한 항목을 SDD 정합 위해 소급 박제(반응형 fix → 스펙 반영):

- **FR-009**: 스타일 옵션은 노드 크기·관계 두께 모두 **5단계**(노드 16·20·24·28·32px / 관계 두께 1·2·3·4·6).
- **FR-010**: 색 선택 시 스타일 패널 **헤더 색이 즉시 반영**되어야 한다(`headerColor`가 `selectedColor` 우선).
- **FR-011**: 크기/두께 옵션은 **실제 크기·두께가 시각적으로 구분**되어야 한다(`min-width/height` 20px 하한 제거). 관계 두께 swatch 폭은 과도하게 길지 않게(26px).
- **FR-012**: 선택/활성(active) 하이라이트는 **과하지 않게** — 이중 링 `box-shadow` → 단일 연한 ring, 칩 scale 1.05→1.02. 칩·swatch·패널 공통.
- **FR-013**: 보기▾·필터▾ 드롭다운은 **동시에 열리지 않는다** — 하나를 열면 다른 하나는 닫힘(상호 배타).
- **FR-014 (US3 해석 정정)**: 노드패널(NodeDetailPanel) 칩 클릭은 **표시필터(labelFilters/relFilter)가 아니라 "캔버스 누적 로드(isolate)"**다. 노드 라벨 칩 → 그 라벨 노드들, 관계 칩 → **그 관계 + 양끝 노드**를 캔버스에 직접 띄운다(여러 개 누르면 누적 union, 다시 누르면 제거). 보기모드(preset)는 해제. canvasStore에 `loadedLabels`/`loadedRelTypes` + `toggleLabelLoad`/`toggleRelLoad`/`rebuildPanelLoad`로 구현. **다중 whitelist 표시필터는 필터▾가 별도 담당**(노드패널과 분리). → "필터 매치 0" 경고는 표시필터를 안 쓰므로 발생하지 않는다.

**후속 검증(Playwright 라이브)**: 노드 16~32px·관계 26×(4~14px) 5단계 / 헤더색 선택 즉시 반영 / active 완화 / 드롭다운 배타 / 타입0·pageerror0.
