# Tasks: 역할(stereotype) 위치기반 UI

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

## Phase 1 — 위치판별 단일 헬퍼 (DRY 기반)

- [ ] T001 `src/shared/utils/nodeLabels.ts` 신규 — `kindOf(labels): string`(=labels[0]), `rolesOf(labels): string[]`(=labels.slice(1) minus 'EXTERNAL'), `isRoleLabel`/유틸. 하드코딩 stereotype 집합 없음.

## Phase 2 — 색·라벨추출 위치기반 (회귀 0)

- [ ] T002 `src/shared/config/graphStyles.ts` — `PRIMARY_LABELS` 제거. `getNodeColor`=`distinctColorForLabel(kindOf(labels))`(사용자색 우선 유지), `getNodeSize`=`kindOf` 기준 정렬 제거하고 labels[0]·NODE_SIZES. 색·크기 결과 불변 확인.
- [ ] T003 `src/features/code-analysis/analyzer.ts` — `PRIMARY_LABELS`(stale) 제거. `extractSubLabel`=`kindOf(labels)`.

## Phase 3 — 노드패널 종류/역할 분리

- [ ] T004 `src/shared/utils/nodeIdentity.ts` — "분류"(property `p.stereotype`) 행을 위치기반으로: 종류=`kindOf`(이미 카드 badge가 표시하나 식별행에 명시), 역할=`rolesOf(labels)` 칩/행. STEREOTYPE_KO는 역할 한글 곁들임 유지(있으면). stereotype 없으면 역할 행 없음.

## Phase 4 — 필터 종류/역할 섹션

- [ ] T005 `src/features/code-analysis/components/graph/GraphTab.vue` `overallNodeStats` — 라벨을 종류(전체에서 labels[0]로 등장)/역할로 위치분류. 분리된 두 통계(또는 각 stat에 `group:'kind'|'role'` 태그) 제공.
- [ ] T006 `src/features/code-analysis/components/graph/NodeDetailPanel.vue` — "Node labels" 섹션을 종류 섹션 / 역할 섹션 분리 렌더. 칩 클릭 필터 동작 유지.

## Phase 5 — 검증

- [ ] T007 vue-tsc 변경파일 새 에러 0.
- [ ] T008 vite dev(3000)+Playwright 또는 앱: 패널 종류/역할 분리, 색 불변, 필터 종류/역할 섹션 — 시각 확인. neo4j `labels(n)` ground truth 대조.

## 의존
T001 → (T002·T003·T004·T005 병렬, 다른 파일) → T006(T005 의존) → T007 → T008.
