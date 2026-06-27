# Data Model: 필터 칩 케이스 통일

이 기능은 영속 데이터가 없다. 런타임 상태 1개의 **케이스 규약**만 바꾼다.

## 상태: `loadedLabels` (canvas store)

| 항목 | 변경 전 | 변경 후 |
|---|---|---|
| 타입 | `Set<string>` | `Set<string>` (동일) |
| 보관 케이스 | **대문자 정규화** (`'COMMAND'`) | **노드 라벨 원본** (`'Command'`) |
| 추가 | `toggleLabelLoad` 가 `toUpperCase()` 후 add | 라벨 원본 그대로 add |
| 매칭 (rebuildPanelLoad) | `loadedLabels.has(l.toUpperCase())` | `loadedLabels.has(l)` (정확매칭) |
| 소비 (칩 강조) | `isFilterActive` 가 원본 비교 → 불일치 | 원본 비교 → 일치(수정 불필요) |
| 소비 (역할 렌즈 색) | `colorLabelOf` 가 `role.toUpperCase()` 비교 | `colorLabelOf` 가 원본 정확매칭 |

## 불변식 (수정 후 성립)

1. `loadedLabels` 의 모든 원소는 어떤 노드의 `labels` 에 원본 그대로 존재하는 라벨이다(칩이 node.labels 에서 옴).
2. 칩 강조 = `loadedLabels.has(칩 라벨)` (정확). 칩 라벨 = node.labels 원본 = loadedLabels 원소 → 항상 정확히 매칭.
3. 역할 렌즈 색: 노드의 `rolesOf(labels)` 중 `loadedLabels` 에 든 역할이 있으면 그 역할색, 없으면 종류색(`kindOf`). 비교는 원본 케이스.

## 전제 (실측 근거)

- 노드 라벨은 canonical 단일 케이스(neo4j 실측: 케이스 충돌 0건). → 정확매칭이 케이스 무관 매칭과 결과 동일하면서 더 단순.
