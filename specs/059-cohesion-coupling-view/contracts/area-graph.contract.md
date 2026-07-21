# Contract: `areaGraph.ts` — 응집도·결합도 화면 그래프 계산

**Date**: 2026-07-21 · **Plan**: [../plan.md](../plan.md) · **Data model**: [../data-model.md](../data-model.md)

`src/features/code-analysis/areaGraph.ts`가 지켜야 할 입출력 계약이다. 이 모듈은 **순수 함수만** 담고
Vue·Pinia·네트워크에 의존하지 않는다. import 는 **타입 전용**이어야 한다 — 그래야 계약 테스트가 단일
파일 트랜스파일로 실행된다(057 `panelGraphProjection.ts`와 같은 관례).

## 왜 라벨 집합을 인자로 받는가

층 판정의 단일 진실은 `src/shared/utils/nodeClassify.ts`의 `CONTAINER_LABELS`·`CALLABLE_LABELS`다.
이 모듈이 그것을 값으로 import 하면 타입 전용 규칙이 깨진다. 그래서 **집합을 주입받는다** — 정의는
여전히 `nodeClassify.ts` 한 곳에만 있고, 운영 호출자(캔버스 스토어)가 그 집합을 그대로 넘긴다.
사본을 만들지 않는다.

## 입력

```ts
interface LayerLabels {
  /** 모듈(그릇) 라벨 집합. 운영에서는 nodeClassify.CONTAINER_LABELS 를 그대로 넘긴다. */
  containerLabels: ReadonlySet<string>
  /** 루틴 라벨 집합. 운영에서는 nodeClassify.CALLABLE_LABELS 를 그대로 넘긴다. */
  routineLabels: ReadonlySet<string>
  /** 영역 라벨. 기본 'PACKAGE'. */
  areaLabel: string
  /** 테이블 라벨. 기본 'TABLE'. */
  tableLabel: string
}

interface ExpansionState {
  expandedAreaIds: ReadonlySet<string>
  expandedModuleIds: ReadonlySet<string>
  /** 단수. 새 루틴을 펼치면 이전 것은 호출자가 이미 지운 상태로 넘긴다(FR-011). */
  expandedRoutineId: string | null
}

interface CohesionInput {
  nodes: readonly GraphNode[]
  links: readonly GraphLink[]
  labels: LayerLabels
  expansion: ExpansionState
}
```

`GraphNode`/`GraphLink`는 `@/shared/types`의 기존 타입을 **타입 전용**으로 가져온다.

## 출력

```ts
type EdgeKind = 'write' | 'read' | 'call'

interface TableOwnership {
  tableId: string
  /** 주인 영역. 정할 수 없으면 UNASSIGNED_AREA. */
  ownerArea: string
  writeCounts: Readonly<Record<string, number>>
  readCounts: Readonly<Record<string, number>>
}

interface AreaEdge {
  id: string
  fromArea: string
  toArea: string
  kind: EdgeKind
  count: number
  viaTables: readonly string[]
  viaRoutines: readonly string[]
}

interface CohesionGraph {
  /** 화면에 그릴 노드(접힘 상태 반영). */
  nodes: readonly GraphNode[]
  /** 화면에 그릴 영역 간 관계. */
  edges: readonly AreaEdge[]
  /** 노드 → 소속 영역. 미소속은 UNASSIGNED_AREA. */
  areaOf: ReadonlyMap<string, string>
  /** 테이블 주인 판정 결과(진단·검증용). */
  tableOwners: ReadonlyMap<string, TableOwnership>
}

export const UNASSIGNED_AREA = '__기타__'
export function buildCohesionGraph(input: CohesionInput): CohesionGraph
```

## 규칙

### C1. 영역 소속

- `루틴 →(HAS_MEMBER 역방향)→ 모듈 →(BELONGS_TO)→ 영역`으로 해소한다.
- 어느 단계든 끊기면 `UNASSIGNED_AREA`에 넣는다. (FR-030)
- 모듈 자신도 `BELONGS_TO`로 영역을 갖는다.

### C2. R/W 출발점 해소

- `READS`/`WRITES`의 출발 노드가 루틴이 아니면 `PARENT_OF`를 **역방향**으로 거슬러 올라가 처음
  만나는 루틴을 소유 루틴으로 삼는다.
- 사이클과 누락을 방어한다. 끝까지 루틴을 못 찾으면 그 관계는 집계에서 제외한다(조용히 버리지 않고
  결과에 남기지 않는 것으로 족하다 — 화면에 없는 것을 있다고 하지 않는다).
- 이 한 식이 Framework(출발=루틴)와 DBMS(출발=구문)를 모두 덮는다. **전략 분기를 두지 않는다.**

### C3. 테이블 주인

```
영역마다 (WRITES 건수, READS 건수) 를 만들고 사전식으로 가장 큰 영역이 주인이다.
가장 큰 영역이 유일하지 않으면 ownerArea = UNASSIGNED_AREA.
```

- 계단식 2차·3차 규칙을 두지 않는다. 쓰기가 먼저 비교되므로 사업 결정이 지켜지고, 쓰기가 전부 0이면
  자동으로 읽기 비교로 넘어간다.
- 동률을 임의로 깨지 않는다 — 이름 순 같은 규칙을 추가하지 않는다.
- 읽거나 쓰는 영역이 하나도 없는 테이블은 결과에 넣지 않는다. (FR-008)

### C4. 영역 간 관계

- 양 끝 영역이 같으면 만들지 않는다. (FR-002)
- `CALLS` → `call`, `WRITES` → `write`, `READS` → `read`.
- 테이블 접근은 **접근한 영역 → 테이블 주인 영역** 방향의 관계가 된다. 접근 영역이 주인과 같으면
  만들지 않는다. (FR-007)
- 같은 `(fromArea, toArea, kind)`는 하나로 합치고 `count`에 원본 건수를 누적한다. (FR-003)
- `viaTables`/`viaRoutines`에 원인을 남겨 사용자가 확인할 수 있게 한다.

### C5. 접힘/펼침

- 접힌 영역은 영역 노드 하나로만 나타난다. 그 안의 모듈·루틴·소속 테이블은 결과 `nodes`에 없다.
- `expandedAreaIds`에 있으면 그 영역의 모듈이 나타난다.
- `expandedModuleIds`에 있으면 그 모듈의 루틴이 나타난다.
- `expandedRoutineId`가 가리키는 루틴은 자신이 읽고 쓰는 테이블과 호출 대상까지 나타난다.
- **루틴 내부(구문)는 어떤 상태에서도 `nodes`에 넣지 않는다.** (FR-013)
- 펼쳤을 때 드러나는 대상이 1개뿐인 층은 건너뛰고 다음 층을 바로 드러낸다. (FR-014)

### C6. 결정론

같은 입력에 항상 같은 출력이어야 한다. 집합 순회 순서에 결과가 좌우되지 않아야 하며, 출력 배열은
안정 정렬한다. 동률을 임의로 깨는 규칙(이름 순 등)을 도입해서는 안 된다 — 동률은 동률로 남긴다.

## 반대 사례 (계약 테스트가 반드시 덮어야 하는 것)

| # | 상황 | 기대 |
|---|---|---|
| N1 | 같은 영역 안의 CALLS | `edges`에 없음 |
| N2 | 두 영역 사이에 write·read·call이 모두 있음 | `edges` 3개, 종류별 분리 |
| N3 | 테이블을 A가 2회 쓰고 B가 1회 씀 | 주인 A, B→A `write` 엣지 |
| N4 | 쓰기 동점(A 1, B 1), 읽기 A 2 · B 0 | 주인 A (사전식 2번째 항목에서 갈림) |
| N5 | 쓰기·읽기 모두 동률 | **주인 없음** — `ownerArea = UNASSIGNED_AREA` |
| N6 | 아무도 안 쓰고 A·B가 읽기만, A가 더 많이 읽음 | 주인 A (쓰기 0끼리 동률 → 읽기로 갈림) |
| N7 | 어느 영역도 읽거나 쓰지 않는 테이블 | `tableOwners`·`nodes`에 없음 |
| N8 | R/W 출발이 구문이고 `PARENT_OF`로 2단 위가 루틴 | 그 루틴의 영역으로 집계 |
| N9 | `BELONGS_TO`가 없는 모듈의 루틴 | `UNASSIGNED_AREA` 소속 |
| N10 | 영역이 접힌 상태 | 모듈·루틴·소속 테이블이 `nodes`에 없음 |
| N11 | 루틴을 펼친 상태 | 구문 노드가 `nodes`에 없음 |
| N12 | 같은 입력을 두 번 계산 | 결과가 완전히 동일 |
