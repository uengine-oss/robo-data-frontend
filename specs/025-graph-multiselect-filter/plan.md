# Implementation Plan: 그래프 다중선택 필터 + 노드패널 트리거 + 스타일

**Branch**: `025-graph-multiselect-filter` | **Date**: 2026-06-23 | **Spec**: [spec.md](./spec.md)

## Summary

전수조사 결과 **NvlGraph(소비처)는 이미 다중선택 whitelist를 지원**한다(`matchesLabelFilter`가 여러 라벨, `matchesRelFilter`가 `relFilter` whitelist + `hiddenRelTypes` blacklist). 병목은 **GraphTab(생산처)의 토글이 단일**(`labelFilters.value=[label]` 덮어쓰기)인 것뿐이다. 따라서 핵심 작업은 (1) GraphTab 라벨 토글을 legacy의 `Set` 누적 방식으로 되살리고, (2) 관계 whitelist 토글(`relFilter`)을 연결하며, (3) NodeDetailPanel 관계 칩에 필터 emit을 추가하는 **작은 정합**이다. 색·선두께는 기존 `GraphStylePanel`을 그대로 재사용한다.

## Technical Context

**Language/Version**: TypeScript 5.x, Vue 3.4 SFC.
**대상 파일**:
- `GraphTab.vue` — 라벨/관계 다중 토글 상태 + 필터▾/레전드 UI (핵심)
- `NvlGraph.vue` — 필터 적용(이미 다중 지원, **거의 불변**)
- `NodeDetailPanel.vue` — 레이블 칩(`label-filter` emit 존재)·관계 칩(필터 emit 신규)
- `graphCanvas.ts` — `loadNodesByLabels`(다중 라벨 로드 확인/보완)
- `GraphStylePanel.vue`·`graphStyleStorage.ts` — 색/선두께(재사용, 불변)

**Testing**: 풀스택 Playwright 라이브(다중선택·whitelist·칩 양방향·스타일 영속) + 회귀(전 보기모드·기존 단일필터 동작).
**Constraints**: 기존 보기모드(모듈간·협력군집·영역구조·건강)·단일 필터 흐름 회귀 0.
**Scale/Scope**: 3~4 파일 정합. NvlGraph 필터 엔진은 이미 다중이라 신규 엔진 0.

## Constitution Check

| 원칙 | 준수 | 근거 |
|---|---|---|
| I. 단일 라우트+탭 | ✅ | 탭/라우트 변경 없음 |
| II. 기능 폴더 모듈성 | ✅ | code-analysis feature 내부. 필터 상태는 GraphTab/canvasStore 단일 진실 |
| III. 게이트웨이+세션헤더 | ✅ | 백엔드 호출 없음(클라이언트 필터) |
| IV. 실연동/목업 정직 | ✅ | 실데이터 그래프 필터 |
위반 0.

## 설계 (변경 지점)

### 1. 노드 라벨 다중선택 (legacy 녹이기)
`GraphTab.handleLabelFilter`를 단일 덮어쓰기 → **`Set` 토글 누적**으로(legacy 로직을 현재 구조에 맞게):
```
선택에 있으면 제거, 없으면 추가 → labelFilters = [...set]
캔버스 로드: 선택된 전체 라벨로 loadNodesByLabels(labelFilters)
선택이 비면 clearCanvas (또는 전체 복귀 — Assumptions)
```
NvlGraph `matchesLabelFilter`는 이미 다중 → **불변**. `loadNodesByLabels`가 다중 라벨을 누적 로드하는지 확인·보완.

### 2. 관계 타입 다중선택 whitelist
`relFilter`(NvlGraph가 이미 whitelist 소비)를 GraphTab에서 토글하는 핸들러 추가. 필터▾ UI를 `hiddenRelTypes`(blacklist) → `relFilter`(whitelist) 중심으로 정합(blacklist는 supersede 또는 내부 통합). 빈 `relFilter` = 전체.

### 3. 노드패널 칩 트리거
- 레이블 칩: `NodeDetailPanel`이 이미 `label-filter` emit → GraphTab이 다중 토글로 처리(현재 단일 처리만). `isFilterActive`를 다중 반영(`labelFilters.includes`).
- 관계 칩: 좌클릭 **필터 emit 신규**(`relationship-filter`) — GraphTab이 `relFilter` 토글. 우클릭 스타일(`relationship-type-select`)은 유지.

### 4. 선택 상태 단일 진실 + 스타일
- `labelFilters`·`relFilter`(GraphTab ref)가 단일 진실 → 레전드·노드패널 칩·캔버스가 같은 상태 공유(FR-005).
- 색·선두께: `GraphStylePanel`(우클릭 → node/relationship-type-select → 패널)·`graphStyleStorage` **그대로 재사용**(불변).

## 위험과 처리
- **spec 021 단일 의도 supersede**: 오버뷰칩=단일 isolate, 필터▾=다중 분리 설계를 **다중 통일**로 변경. 사용자 흐름이 "누르면 그것만"→"누르면 추가/토글"로 바뀜 = 사용자 명시 요구(의도된 변경, FR-008). 옛 스펙 보존.
- **loadNodesByLabels 다중 로드**: 라벨 추가 시 캔버스 노드 누적 동작 검증. 빈 선택 정책(전체 vs 비움)은 Assumptions대로.
- **보기모드 상호작용**: `applyViewMode`가 필터 리셋하는 흐름 유지(보기모드 자체 노드집합). 회귀 검증.

## Project Structure
```
specs/025-graph-multiselect-filter/
├── plan.md (이 파일)
├── spec.md · checklists/requirements.md
└── tasks.md (다음)
변경: GraphTab.vue · NvlGraph.vue(미세) · NodeDetailPanel.vue · graphCanvas.ts
재사용(불변): GraphStylePanel.vue · graphStyleStorage.ts
```

**Structure Decision**: 신규 컴포넌트/스토어 0. 기존 필터 상태·NVL 엔진·스타일 패널을 다중선택으로 정합하는 최소 변경.
