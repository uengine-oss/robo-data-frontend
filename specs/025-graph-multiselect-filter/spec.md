# Feature Specification: 그래프 노드패널 칩 = 캔버스 누적 로드(isolate) + 관계 숨김 필터 + 레이블/관계 스타일

**Feature Branch**: `025-graph-multiselect-filter`

**Created**: 2026-06-23

**Status**: Implemented (2026-06-23, frontend `622b5bb`)

**Input**: 노드 상세패널에서 노드 라벨·관계 타입 칩을 누르면 **"누른 그것을 캔버스에 보여준다"**(여러 개 누적). **필터링이 아니라 캔버스 구성(isolate)**. 표시에서 끄는 필터는 별도(필터▾). 레이블·관계에 색상·선두께·크기 지정.

## 개요 *(맥락 — 전수조사로 확정한 현재 구현 진실)*

> ⚠️ **충돌 정리(SDD)**: 이 spec은 처음 *"legacy의 다중선택 표시필터(whitelist)를 되살린다"* 로 기획됐으나, 구현과 사용자 피드백을 거쳐 **"노드패널 칩 = 캔버스 누적 로드(isolate)"** 로 확정됐다. 아래는 옛 기획과의 충돌을 정리한 **현재 진실**이며 코드(frontend `622b5bb`)와 일치한다. (옛 기획 흔적은 git 이력·spec 021에 보존.)

- **노드패널 칩 = 캔버스 누적 로드(isolate, 표시필터 아님)**: `NodeDetailPanel`의 라벨/관계 통계 칩을 누르면, 그 라벨 노드들(노드 칩)·그 관계 + 양끝 노드(관계 칩)를 캔버스(`canvasNodeIds`)에 **직접 union**으로 띄운다. 여러 개 누르면 누적, 다시 누르면 제거. 보기모드(preset)는 해제. → `canvasStore.loadedLabels`/`loadedRelTypes` + `toggleLabelLoad`/`toggleRelLoad`/`rebuildPanelLoad`.
- **필터▾ = 관계 숨김 필터(별도)**: 표시에서 특정 관계 타입을 끄는 blacklist(`hiddenRelTypes`). 노드패널 isolate와 **독립**.
- **스타일**: `GraphStylePanel.vue`·`graphStyleStorage`에 이미 존재·노출(노드=색+크기, 관계=색+선두께, localStorage 영속, 5단계).
- **데드/충돌 정리**: 옛 기획의 다중 표시필터 ref `labelFilters`/`relFilter`(GraphTab)는 노드패널을 isolate로 분리한 뒤 **설정처가 없어 비활성(데드)**다. NvlGraph에 전달되나 항상 빈 배열 → 표시필터로 작동하지 않는다. **잔여 ref 제거는 별도 리팩토링 세션(refactor-estimate) 범위**로 둔다(본 spec은 동작 변경 0).
- **spec 021 충돌**: spec 021의 단일 isolate(`labelFilters=[label]` 덮어쓰기, `canvasStore.isolateLabel`)는 본 spec의 **다중 누적 isolate**(`canvasStore.loadedLabels`)로 supersede. 옛 문서는 보존하되 본 spec이 현재 진실이다.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 노드패널 노드 칩 → 그 라벨 노드들을 캔버스에 (Priority: P1)

`NodeDetailPanel`의 노드 라벨 통계 칩을 누르면, 그 라벨의 노드들이 캔버스에 로드된다(isolate). 여러 라벨을 누르면 **누적**, 다시 누르면 제거. **필터링이 아니라 캔버스에 "보여주기"**.

**Why this priority**: 사용자가 명시한 "노드패널에서 누르면 그것만 보여주는 것". 다중으로 누적 가능.

**Independent Test**: 라벨 SELECT 클릭 → SELECT 노드 로드. +TABLE → SELECT·TABLE 함께. SELECT 다시 클릭 → 해제되어 TABLE만. 전부 해제 → 캔버스 비움.

**Acceptance Scenarios**:
1. **Given** 캔버스에 노드가 있음, **When** 노드 칩 SELECT 클릭, **Then** SELECT 라벨 노드들이 캔버스에 로드된다(보기모드는 해제).
2. **Given** SELECT 로드 상태, **When** TABLE 칩 클릭, **Then** SELECT·TABLE 노드가 함께 보인다(누적 union, 덮어쓰기 아님).
3. **Given** SELECT·TABLE 상태, **When** SELECT 다시 클릭, **Then** 해제되어 TABLE만.
4. **Given** 보기모드(모듈간 등)가 켜진 상태, **When** 노드 칩 클릭, **Then** 보기모드가 해제되고 그 노드가 로드되며 **"필터 매치 0" 경고는 뜨지 않는다**(표시필터를 안 쓰므로).

---

### User Story 2 - 노드패널 관계 칩 → 관계 + 양끝 노드를 캔버스에 (Priority: P1)

관계 통계 칩을 누르면 그 관계와 **양끝 노드**가 캔버스에 로드된다(누적). 노드 칩과 함께 union으로 쌓인다.

**Why this priority**: 사용자 명시 — "관계를 누르면 그 관계로 연결된 노드들도 같이(관계 선 + 양끝 노드)".

**Independent Test**: 관계 READS 클릭 → READS 양끝 노드 + 관계선 로드. 노드 칩과 함께 → union. 다시 클릭 → 제거.

**Acceptance Scenarios**:
1. **Given** 전체 그래프, **When** 관계 칩 READS 클릭, **Then** READS 관계의 양끝 노드가 캔버스에 로드되고 그 관계선이 보인다.
2. **Given** 노드 칩(SELECT·TABLE)이 로드된 상태, **When** 관계 칩 READS 추가, **Then** 노드 라벨 노드 ∪ READS 양끝 노드(union 누적).
3. **Given** READS 로드 상태, **When** READS 다시 클릭, **Then** 제거된다.

---

### User Story 3 - 필터▾ 관계 숨김(별도 필터링) (Priority: P2)

표시에서 특정 관계 타입을 끄는 필터(필터▾, `hiddenRelTypes` blacklist). 노드패널 isolate와 **독립**적으로 작동한다 — 노드패널 칩은 "보여주기", 필터▾는 "숨기기".

**Why this priority**: 사용자 명시 — "노드패널에서 누르는 건 필터링이 아님. 필터링은 별도로 제공."

**Independent Test**: 필터▾에서 관계 타입을 숨김 → 그 관계선이 표시에서 사라진다.

**Acceptance Scenarios**:
1. **Given** 캔버스에 여러 관계, **When** 필터▾에서 한 관계 타입 숨김, **Then** 그 관계선이 표시에서 사라진다(`hiddenRelTypes`).
2. **Given** 보기▾가 열린 상태, **When** 필터▾를 연다, **Then** 보기▾는 닫힌다(상호 배타, FR-013).

---

### User Story 4 - 레이블·관계 색상·선두께/크기 지정 (Priority: P3)

노드 라벨·관계 타입에 **색상**과 **크기(노드)/선두께(관계)**를 지정해 영속한다. 기존 `GraphStylePanel`을 재사용한다.

**Why this priority**: 색/두께 지정 자체는 이미 구현돼 있어(GraphStylePanel) 위험·작업량이 낮다.

**Independent Test**: 라벨/관계 선택 → 스타일 패널에서 색·두께 변경 → 캔버스 즉시 반영 + 새로고침 후 유지(localStorage).

**Acceptance Scenarios**:
1. **Given** 라벨 선택, **When** 색상 지정, **Then** 그 라벨 노드 색이 바뀌고 영속된다(graphStyleStorage). 패널 헤더 색도 즉시 반영(FR-010).
2. **Given** 관계 선택, **When** 선두께 지정, **Then** 그 관계선 두께가 바뀌고 영속된다.

---

### Edge Cases
- 보기모드(모듈간·협력군집·영역구조·건강) 중 노드패널 칩 클릭 → 보기모드 **해제** 후 그 노드 로드(경고 없음).
- 노드 칩 + 관계 칩 동시 = **union**(교집합 아님 — 라벨 노드 ∪ 관계 양끝 노드).
- 전부 해제 → 캔버스 비움.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 노드패널 노드 라벨 칩 클릭 = 그 라벨 노드들을 캔버스(`canvasNodeIds`)에 **누적 로드(isolate)** — 표시필터가 아니라 캔버스 구성. 다시 클릭 시 제거, 다중 누적.
- **FR-002**: 노드패널 관계 칩 클릭 = 그 관계 + **양끝 노드**를 캔버스에 누적 로드.
- **FR-003**: 노드 칩·관계 칩 로드는 **union 누적**(여러 개 함께, 교집합 아님). 빈 = 캔버스 비움.
- **FR-004**: 노드패널 칩 로드는 보기모드(preset)를 **해제**하고, `canvasStore.loadedLabels`/`loadedRelTypes` + `toggleLabelLoad`/`toggleRelLoad`/`rebuildPanelLoad`로 구현한다. 칩의 active 표시 = 캔버스 로드 상태(`loadedLabels`/`loadedRelTypes`)이며 표시필터(`labelFilters`/`relFilter`)와 무관하다.
- **FR-005**: 표시 숨김 필터(필터▾)는 노드패널 isolate와 **분리된 별도 기능** — 관계 타입 숨김(`hiddenRelTypes` blacklist). 노드패널 칩은 "보여주기", 필터▾는 "숨기기".
- **FR-006**: 노드 라벨(색·크기)·관계 타입(색·선두께) 스타일 지정은 **기존 `GraphStylePanel`·`graphStyleStorage`를 재사용**해 영속한다(중복 구현 금지).
- **FR-007 (충돌 정리)**: 옛 기획의 다중 표시필터 ref `labelFilters`/`relFilter`(GraphTab)는 노드패널 isolate 분리 후 **비활성(데드)**다 — 설정처가 없어 NvlGraph에 항상 빈 배열로 전달되어 표시필터로 작동하지 않는다. "선택된 것만 보기"는 노드패널 isolate(FR-001·002)가 충족한다. **잔여 ref 제거는 리팩토링 세션(refactor-estimate) 범위**이며 본 spec은 동작 변경 0.
- **FR-008**: spec 021의 단일 isolate(`labelFilters=[label]`)·legacy의 다중 표시필터는 본 spec의 **다중 누적 isolate**(`canvasStore.loadedLabels`)로 **supersede**하되, 옛 스펙 문서는 보존하고 충돌을 본 개요에 명시한다.

### Key Entities *(데이터 관련)*

- **노드 로드 상태**(`canvasStore.loadedLabels`): 노드패널에서 누른 라벨 집합(`Set<string>`, UPPER). 빈 = 라벨 로드 없음.
- **관계 로드 상태**(`canvasStore.loadedRelTypes`): 노드패널에서 누른 관계 타입 집합. 빈 = 관계 로드 없음.
- **관계 숨김 상태**(`hiddenRelTypes`): 필터▾가 표시에서 끄는 관계 타입(blacklist).
- **StyleMap**(기존): 라벨/관계 타입 → `{color, size/width}`(localStorage 영속, graphStyleStorage).
- **GraphNode.labels / GraphLink.type**: 로드·매칭의 기준값(보존계약 — opaque).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 노드 칩을 2개 이상 누르면 그 라벨 노드들이 캔버스에 **누적**으로 함께 로드된다(union).
- **SC-002**: 관계 칩을 누르면 그 관계 + **양끝 노드**가 캔버스에 로드된다(노드 칩과 union).
- **SC-003**: 노드패널 칩 클릭 시 **"필터 매치 0" 경고가 뜨지 않는다**(표시필터를 안 쓰므로) — 보기모드 중 클릭에서도 확인.
- **SC-004**: 라벨/관계 색·선두께 변경이 캔버스에 반영되고 새로고침 후 유지(localStorage).
- **SC-005**: 기존 보기모드(모듈간·협력군집·영역구조·건강)·필터▾ 관계 숨김이 정상 동작(회귀 0) — Playwright 확인.

## Assumptions

- **"선택된 것만 보기"** = 노드패널 칩의 **캔버스 누적 로드(isolate)** 가 충족한다(별도 표시필터 whitelist 아님). 빈 로드 = 캔버스 비움.
- 노드 스타일 = 색+크기, 관계 스타일 = 색+선두께(기존 GraphStylePanel 의미 유지, 5단계).
- 보기모드 전환·노드패널 칩 클릭 시 보기모드(preset)는 **해제**한다(isolate 로드가 자체 노드집합을 구성하므로).
- `labelFilters`/`relFilter`는 현재 **데드**(FR-007) — 향후 필터▾ 다중 표시필터로 살릴 여지는 있으나 본 spec 범위 밖(리팩토링).
- 검증은 실데이터(catalog 그래프)로 풀스택 Playwright 라이브 + 로직 검증.

## 구현 후속 다듬기 (2026-06-23 사용자 피드백 반영)

구현·라이브검증 후 사용자 피드백으로 정련한 항목을 SDD 정합 위해 소급 박제(반응형 fix → 스펙 반영):

- **FR-009**: 스타일 옵션은 노드 크기·관계 두께 모두 **5단계**(노드 16·20·24·28·32px / 관계 두께 1·2·3·4·6).
- **FR-010**: 색 선택 시 스타일 패널 **헤더 색이 즉시 반영**(`headerColor`가 `selectedColor` 우선).
- **FR-011**: 크기/두께 옵션은 **실제 크기·두께가 시각적으로 구분**(`min-width/height` 하한 제거). 관계 두께 swatch 폭은 과도하게 길지 않게(26px).
- **FR-012**: 선택/활성(active) 하이라이트는 **과하지 않게** — 이중 링 → 단일 연한 ring, 칩 scale 1.05→1.02.
- **FR-013**: 보기▾·필터▾ 드롭다운은 **동시에 열리지 않는다**(상호 배타).
- **FR-014 (정정 이력)**: US3가 처음 "노드패널 칩 = 다중 표시필터"로 기획됐던 것을 **"캔버스 누적 로드(isolate)"** 로 정정(본 spec 본문 FR-001~005에 반영). → "필터 매치 0" 경고 원인 제거.

**후속 검증(Playwright 라이브)**: 노드 칩 누적(SELECT+TABLE)·관계 칩(READS 양끝노드 union)·경고0·드롭다운 배타·스타일 5단계·active 완화·타입0·pageerror0.
