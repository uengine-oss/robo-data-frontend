# Tasks: 노드 검색 결과 위치 교정 (캔버스 비우기 오조작 방지)

**Feature**: 042-search-dropdown-anchor | **Date**: 2026-06-28
**Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

유일 변경 파일: `src/features/code-analysis/components/graph/NodeDetailPanel.vue`
범위: 마크업 1블록 이동 + 죽은 CSS 1줄 제거(동작/로직 무변경). 새 분기·플래그·상태 추가 금지.

빌드·재분석 금지. 검증은 vite dev(3000) + Playwright 헤드리스만.

## Phase 1: Setup

(해당 없음 — 기존 컴포넌트 단일 수정, 프로젝트 초기화·신규 의존성 없음)

## Phase 2: Foundational

(해당 없음 — 차단성 선행 작업 없음)

## Phase 3: User Story 1 — 검색하고 결과를 누르는 동안 캔버스가 지워지지 않는다 (P1)

**Goal**: 검색 결과 드롭다운을 입력칸 바로 아래에 앵커시켜, 입력→결과 클릭 경로에서 "캔버스 비우기" 버튼이 사라지게 한다.

**Independent Test**: 검색어 입력 시 결과가 입력칸 직하에 뜨고, 입력→첫 결과 경로에 "캔버스 비우기" 버튼이 노출되지 않으며, 첫 결과 클릭 시 기존 캔버스가 비워지지 않는다.

- [X] T001 [US1] `NodeDetailPanel.vue` `<template>`: `.search-results-dropdown` (`v-if="showSearchResults"`) 블록을 `.search-section`의 직속 자식에서 `.search-input-wrapper` 내부(클리어 ✕ 버튼 다음, `.reset-graph-btn` 위치는 불변)로 이동. 마크업 내용·핸들러(`@mousedown.prevent="handleSearchResultSelect"`)·`v-if`/`v-for`·클래스 일절 변경 없이 부모만 교체.
- [X] T002 [US1] `NodeDetailPanel.vue` `<style scoped>`: 더 이상 앵커 기준으로 쓰이지 않는 `.search-section { position: relative; }` 선언 제거(`.search-results-dropdown`이 이제 `.search-input-wrapper` 기준 `top:100%`로 앵커되므로). `.search-results-dropdown` 규칙(`position:absolute; top:100%; left:0; right:0; z-index:9999` 등)은 그대로.
- [X] T003 [US1] 회귀 전수확인(코드 정독, 수정 아님): (a) `.search-section`을 positioned 조상으로 의존하는 다른 absolute 자식이 없는지 — 드롭다운이 유일했음을 확인해 `position:relative` 제거가 안전함을 입증. (b) `.reset-graph-btn`의 `v-if="hasGraph"`·`@click="emit('reset-graph')"`·스타일이 그대로인지. (c) `.search-input-wrapper`의 flex 흐름이 absolute 드롭다운 추가로 흔들리지 않는지(클리어 ✕와 동일 패턴).

## Phase 4: Verify (자가검증 — quickstart V1~V3)

- [X] T004 vite dev(3000) 기동 후 `.unittest/`의 Playwright 헤드리스 스크립트로 quickstart V1~V3 검증: ① `dropdown.top ≈ search-input-wrapper.bottom` 이고 그 사이에 `.reset-graph-btn` 없음(boundingBox), ② 입력→첫 결과 경로 `elementFromPoint`가 `.reset-graph-btn` 아님 + 첫 결과 클릭 후 canvas store 노드 수 감소 없음, ③ 검색 닫으면 `.reset-graph-btn` 정상 복귀. 스크린샷 Read로 육안 확인. 스크립트는 실행 후 제거.

## Dependencies

- T001 → T002 (같은 파일 연속 편집, 순차) → T003(정독 확인) → T004(검증).
- 전부 단일 스토리(US1) 내 순차. 병렬 기회 없음(동일 파일 1개).

## Implementation Strategy

MVP = US1 전체(T001~T004). 이 피처는 US1 단일 스토리라 MVP가 곧 전체 범위.
