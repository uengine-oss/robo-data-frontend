# Implementation Plan: 노드패널 칩 = 캔버스 누적 로드(isolate) + 관계 숨김 필터 + 스타일

**Branch**: `025-graph-multiselect-filter` | **Date**: 2026-06-23 | **Spec**: [spec.md](./spec.md)

> ⚠️ **정정(SDD)**: 이 plan은 처음 *"다중 표시필터(whitelist) 정합"* 으로 작성됐으나, 구현·사용자 피드백을 거쳐 **"노드패널 칩 = 캔버스 누적 로드(isolate)"** 로 확정됐다. 아래는 실제 구현(frontend `622b5bb`)을 반영한 현재 진실이다.

## Summary

핵심 작업은 **노드패널 칩을 표시필터에서 "캔버스 누적 로드(isolate)"로 전환**하는 것이다. `canvasStore`에 노드패널 로드 상태(`loadedLabels`/`loadedRelTypes`)와 토글 메서드(`toggleLabelLoad`/`toggleRelLoad`/`rebuildPanelLoad`)를 추가하고, GraphTab의 칩 핸들러를 그 메서드로 연결한다. 칩의 active 표시는 캔버스 로드 상태에 바인딩한다. 표시 숨김 필터(필터▾, `hiddenRelTypes` blacklist)는 노드패널과 분리해 그대로 둔다. 색·선두께는 기존 `GraphStylePanel`을 재사용한다.

## Technical Context

**Language/Version**: TypeScript 5.x, Vue 3.4 SFC.
**대상 파일**:
- `graphCanvas.ts` — `loadedLabels`/`loadedRelTypes` 상태 + `toggleLabelLoad`/`toggleRelLoad`/`rebuildPanelLoad`(노드 라벨 노드 ∪ 관계 양끝 노드를 `canvasNodeIds`에 union, preset 해제) **추가** (핵심)
- `GraphTab.vue` — 노드패널 칩 핸들러를 canvasStore 누적 로드로 연결, 칩 active = 로드 상태
- `NodeDetailPanel.vue` — 레이블 칩(`label-filter` emit)·관계 칩(`relationship-filter` emit)·active 표시
- `NvlGraph.vue` — 표시필터 엔진은 불변(`hiddenRelTypes`만 실사용)
- `GraphStylePanel.vue`·`graphStyleStorage.ts` — 색/선두께(재사용, 불변)

**Testing**: 로직 검증(실데이터 union·토글) + 풀스택 Playwright 라이브(노드 칩 누적·관계 칩 양끝노드·경고0) + 회귀(전 보기모드·필터▾ 숨김).
**Constraints**: 기존 보기모드·필터▾ 숨김 흐름 회귀 0.
**Scale/Scope**: 3 파일 변경(graphCanvas·GraphTab·NodeDetailPanel). 표시필터 엔진·스타일 패널 불변.

## Constitution Check

| 원칙 | 준수 | 근거 |
|---|---|---|
| I. 단일 라우트+탭 | ✅ | 탭/라우트 변경 없음 |
| II. 기능 폴더 모듈성 | ✅ | code-analysis feature 내부. 노드패널 로드 상태는 canvasStore 단일 진실 |
| III. 게이트웨이+세션헤더 | ✅ | 백엔드 호출 없음(클라이언트 캔버스 구성) |
| IV. 실연동/목업 정직 | ✅ | 실데이터 그래프 |
위반 0.

## 설계 (변경 지점 — 구현된 형태)

### 1. canvasStore 노드패널 로드 상태 (핵심)
`loadedLabels: Set<string>`(UPPER)·`loadedRelTypes: Set<string>` + `rebuildPanelLoad()`:
```
ids = ∅
nodeMap 순회 → labels가 loadedLabels와 교차하면 add (노드 라벨 노드)
linkMap 순회 → type이 loadedRelTypes면 source·target add (관계 양끝 노드)
canvasNodeIds = ids   // union
```
`toggleLabelLoad(label)`·`toggleRelLoad(relType)`: preset 해제 → Set 토글 → rebuildPanelLoad. `clearPanelLoad()`로 초기화.

### 2. 노드패널 칩 핸들러 (GraphTab)
- 노드 라벨 칩(`label-filter` emit) → `canvasStore.toggleLabelLoad(label)`.
- 관계 칩(`relationship-filter` emit) → `canvasStore.toggleRelLoad(relType)`(관계+양끝노드).
- 칩 active = `loadedLabels`/`loadedRelTypes`(storeToRefs → 배열 computed). 표시필터(`labelFilters`/`relFilter`)와 무관.

### 3. 필터▾ 관계 숨김 (별도, 불변)
`hiddenRelTypes`(blacklist)는 노드패널 isolate와 분리. NvlGraph `matchesRelFilter`가 소비. 보기▾↔필터▾ 드롭다운 상호 배타.

### 4. 스타일 (불변 재사용)
색·선두께: `GraphStylePanel`(우클릭 → node/relationship-type-select → 패널)·`graphStyleStorage` 그대로 재사용. 5단계·헤더색 동기화·active 완화는 FR-009~012.

## 위험과 처리
- **spec 021 supersede**: 단일 isolate(`labelFilters=[label]`) → 다중 누적 isolate(`canvasStore.loadedLabels`)로 변경 = 사용자 명시 요구(FR-008). 옛 스펙 보존.
- **데드 ref 제거 완료**: 노드패널을 canvasStore 로드로 옮긴 뒤 비활성이던 `labelFilters`/`relFilter` 및 연관 데드(`matchesLabelFilter`·`showFilterEmptyOverlay`·watch·`clear-filters`/`open-navigator` emit·`handleOpenNavigator`)를 제거(FR-007, 동작 보존·회귀 0). NvlGraph는 `hiddenRelTypes`만 소비.
- **보기모드 상호작용**: 노드패널 칩 로드 시 preset 해제 → 보기모드 가상그래프와 표시필터 충돌(경고)이 사라짐. 회귀 검증 완료.

## Project Structure
```
specs/025-graph-multiselect-filter/
├── plan.md (이 파일)
├── spec.md · checklists/requirements.md
└── tasks.md
변경: graphCanvas.ts · GraphTab.vue · NodeDetailPanel.vue
불변: NvlGraph.vue(표시필터 엔진) · GraphStylePanel.vue · graphStyleStorage.ts
```

**Structure Decision**: 신규 컴포넌트 0, canvasStore에 노드패널 로드 상태만 추가. 표시필터(whitelist) 기획은 폐기 — "선택된 것만 보기"는 캔버스 누적 로드(isolate)가 충족한다.
