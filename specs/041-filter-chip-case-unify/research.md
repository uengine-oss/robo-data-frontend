# Research: 필터 칩 케이스 통일

## 근본원인 (코드 + neo4j 실측 전수조사)

### 데이터 흐름 (칩 클릭 → 강조 판정)

```
오버뷰 칩 (stat.label = node.labels 원본, 예 'Command')
  └ click → handleLabelFilter(label)            GraphTab.vue:548 → canvasStore.toggleLabelLoad(label)
       └ toggleLabelLoad: const up = label.toUpperCase()  ← ★여기서 'Command' → 'COMMAND'
            loadedLabels.add('COMMAND')          graphCanvas.ts:542-549
  activeNodeLoads = [...loadedLabels] = ['COMMAND']   GraphTab.vue:564
       ├ NvlGraph :isolatedLabels  (역할 렌즈 색)
       └ NodeDetailPanel :activeFilters
            isFilterActive(label='Command') = activeFilters.includes('Command')
              = ['COMMAND'].includes('Command') = false   ← ★하이라이트 안 켜짐
```

종류 칩(FUNCTION)은 라벨이 이미 대문자라 `['FUNCTION'].includes('FUNCTION')` = true → 우연히 동작.

### neo4j ground truth (전수조사, 추측 아님)

`CALL db.labels()` → 라벨 24종:
- 종류(UPPER_SNAKE): COLUMN, COMPONENT, CONSTANT, DATA_TYPE, DEFINE, EXAMPLE, EXTERNAL, FILE, FUNCTION, GLOBAL_VARIABLE, MODULE, PACKAGE, QUESTION, RULE, SCHEMA, TABLE, VARIABLE
- 역할(CamelCase): Adapter, ApplicationService, Command, Helper, Query, Service, Validator
- **같은 라벨이 두 케이스로 동시 존재 = 0건 (케이스 충돌 없음).**

멀티라벨 노드 실측: `['FUNCTION','Command']`, `['FUNCTION','Query']`, `['FUNCTION','ApplicationService']` 등 → `labels[0]`=종류(대문자), `labels[1:]`=역할(CamelCase) canonical.

→ **결론: 라벨은 그래프 전체에서 단일 케이스. 원본 케이스 정확매칭이 안전하며, 대문자 정규화는 불필요할 뿐 아니라 칩 강조를 깨뜨리는 원인.**

## 결정 (Decision / Rationale / Alternatives)

### D1. loadedLabels 대문자 정규화 제거 (원본 케이스 정확매칭)

- **Decision**: `toggleLabelLoad` 의 `label.toUpperCase()` 제거, `rebuildPanelLoad` 의 `l.toUpperCase()` 제거. `loadedLabels` 에 라벨 원본을 그대로 넣고 `node.labels` 와 정확매칭.
- **Rationale**: 라벨이 canonical 단일 케이스라 정규화가 무의미. 정규화를 없애면 `loadedLabels`(원본) ↔ 칩(원본) ↔ `node.labels`(원본)가 한 케이스로 일관 → `isFilterActive` 가 **수정 없이** 맞는다. 케이스 처리 분산이 사라져 코드가 준다.
- **Alternatives rejected**:
  - `isFilterActive` 에 `.toUpperCase()` 추가 → **땜빵**(불일치를 비교부에서 가림, 케이스 처리가 또 흩어짐). 금지.
  - `activeNodeLoads` 계산 시 다시 케이스 변환 → 변환을 더 추가하는 것 = 구조 악화.

### D2. colorLabelOf 정확매칭으로 통일

- **Decision**: `nodeLabels.colorLabelOf` 의 `isolatedUpper.has(role.toUpperCase())` → `isolated.has(role)`. 인자명 `isolatedUpper` → `isolated`, JSDoc "대문자" 문구 제거.
- **Rationale**: loadedLabels 가 원본 케이스가 되면, 색 렌즈도 원본 정확매칭이어야 일치한다. D1 과 같은 케이스 규약을 공유 → 렌즈가 안 깨진다. `toUpperCase` 한 번 더 제거.
- **소비처 영향(전수)**: `NvlGraph.vue:152 getNodeColor([colorLabelOf(labels, isolatedSet.value)])`, `NodeDetailBase.vue:47 colorLabelOf(node.labels, canvasStore.loadedLabels)` — 둘 다 isolated 인자에 원본 케이스 집합을 넘기게 되므로 정확매칭과 정합. 추가 수정 불필요.

### D3. 별개 메커니즘은 불변 (회귀 경계)

- `isolateLabel`, `loadNodesByLabels` 는 임의 라벨 입력을 캔버스 노드 라벨에 매칭하는 별도 경로로 `loadedLabels` 를 읽지 않음 → 자체 대소문자 무관 매칭 유지(이번 버그와 무관, 건드리면 스코프 확대·회귀 위험).
- `loadedRelTypes`/`toggleRelLoad` 는 원래 원본 케이스 → 무변경.

## 유지보수·회귀 점검 결과

- `loadedLabels` 쓰는 곳 전수 grep: `GraphTab.activeNodeLoads`, `NvlGraph isolatedSet`, `NodeDetailBase colorLabelOf`, `rebuildPanelLoad`, `toggleLabelLoad`, `clearPanelLoad`. 케이스 의존은 toggleLabelLoad·rebuildPanelLoad·colorLabelOf 세 곳뿐 → 전부 이번에 정리.
- 수정 후 잔여 `toUpperCase`/대문자 가정이 loadedLabels 경로에 없는지 재검토(데드·드리프트 0).
