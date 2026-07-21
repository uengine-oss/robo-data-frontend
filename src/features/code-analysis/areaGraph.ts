/**
 * areaGraph.ts
 * **테이블 주인 판정**의 단일 정의처 (spec 059).
 *
 * 테이블은 여러 영역이 함께 쓰는 공용 자산이지만 화면에 그리려면 소속이 하나 있어야 한다.
 * 예전에는 모든 테이블을 별도 구역에 몰아넣었는데, 그 구역이 선을 화면 가로로 늘여 정작 봐야 할
 * 결합을 가렸다. 그래서 자기를 가장 많이 쓰는 영역 안으로 녹인다.
 *
 * 주인 = **쓰기가 가장 많은 영역**(사업 결정 2026-07-21). 데이터를 바꾸는 쪽이 주인이다.
 * 쓰기가 같으면 읽기가 많은 쪽. 그래도 앞선 영역이 유일하지 않으면 **주인을 정하지 않는다** —
 * 데이터가 말해주지 않는 소유권을 만들어내지 않는다.
 *
 * 순수 함수만 담는다(Vue·Pinia·네트워크 의존 0, import 는 타입 전용). 그래서 계약 테스트가
 * 단일 파일 트랜스파일로 돌아간다 — `contracts/test-area-graph.mjs`.
 *
 * ※ 초안에 있던 "영역을 노드로 접는" 계산(buildCohesionGraph)은 폐기했다. 영역은 이미 저장소에
 *   헐(테두리)로 구현돼 있었고 노드는 모듈이라, 영역을 노드로 만들면 보기 이름과 화면이 어긋나고
 *   검증된 헐 구현을 버리게 된다(사용자 정정 2026-07-21).
 */
import type { GraphLink, GraphNode } from '@/shared/types'

/** 주인을 정할 수 없는 테이블. 어느 영역 테두리에도 넣지 않는다. */
export const UNASSIGNED_AREA = '__기타__'

export interface TableOwnerInput {
  nodes: readonly GraphNode[]
  links: readonly GraphLink[]
  /** 루틴 라벨 — 운영에서는 nodeClassify.CALLABLE_LABELS 를 그대로 넘긴다(사본 0). */
  routineLabels: ReadonlySet<string>
  tableLabel: string
  /** 루틴 → 영역 키. 호출자가 계층맵으로 해소해 넘긴다. */
  areaOfRoutine: (routineId: string) => string | null
}

export interface TableOwnership {
  tableId: string
  /** 주인 영역 키. 정할 수 없으면 null. */
  ownerArea: string | null
  writeCounts: Readonly<Record<string, number>>
  readCounts: Readonly<Record<string, number>>
}

const PARENT_OF = 'PARENT_OF'
const READS = 'READS'
const WRITES = 'WRITES'

function hasLabel(node: GraphNode, label: string): boolean {
  const target = label.toUpperCase()
  return (node.labels || []).some(l => l.toUpperCase() === target)
}

function hasAnyLabel(node: GraphNode, labels: ReadonlySet<string>): boolean {
  return (node.labels || []).some(l => labels.has(l.toUpperCase()))
}

/**
 * 테이블별 주인 영역을 계산한다. 같은 입력에는 항상 같은 출력을 낸다.
 *
 * R/W 의 출발점은 루틴일 수도(Framework) 중첩 구문일 수도(DBMS) 있어 `PARENT_OF` 를 거슬러
 * 소유 루틴을 찾는다. 이 한 식이 두 전략을 함께 덮으므로 전략 분기가 없다.
 */
export function computeTableOwners(input: TableOwnerInput): Map<string, TableOwnership> {
  const { nodes, links, routineLabels, tableLabel, areaOfRoutine } = input

  const nodeById = new Map<string, GraphNode>()
  for (const node of nodes) nodeById.set(node.id, node)

  const parentOfChild = new Map<string, string>()
  for (const link of links) {
    if (link.type === PARENT_OF) parentOfChild.set(link.target, link.source)
  }

  const routineCache = new Map<string, string | null>()
  function resolveRoutine(nodeId: string): string | null {
    const cached = routineCache.get(nodeId)
    if (cached !== undefined) return cached
    const path: string[] = []
    const seen = new Set<string>()
    let cur: string | undefined = nodeId
    let result: string | null = null
    while (cur !== undefined && !seen.has(cur)) {
      const memo = routineCache.get(cur)
      if (memo !== undefined) { result = memo; break }
      const node = nodeById.get(cur)
      if (node && hasAnyLabel(node, routineLabels)) { result = cur; break }
      seen.add(cur)
      path.push(cur)
      cur = parentOfChild.get(cur)
    }
    for (const id of path) routineCache.set(id, result)
    return result
  }

  interface Access { writes: Map<string, number>; reads: Map<string, number>; order: string[] }
  const access = new Map<string, Access>()

  for (const link of links) {
    if (link.type !== READS && link.type !== WRITES) continue
    const table = nodeById.get(link.target)
    if (!table || !hasLabel(table, tableLabel)) continue
    const routine = resolveRoutine(link.source)
    if (routine === null) continue
    const area = areaOfRoutine(routine)
    if (!area) continue

    let acc = access.get(table.id)
    if (!acc) { acc = { writes: new Map(), reads: new Map(), order: [] }; access.set(table.id, acc) }
    const bucket = link.type === WRITES ? acc.writes : acc.reads
    bucket.set(area, (bucket.get(area) ?? 0) + 1)
    if (!acc.order.includes(area)) acc.order.push(area)
  }

  const owners = new Map<string, TableOwnership>()
  for (const [tableId, acc] of access) {
    let best: string | null = null
    let bestWrite = -1
    let bestRead = -1
    let tied = false
    for (const area of acc.order) {
      const w = acc.writes.get(area) ?? 0
      const r = acc.reads.get(area) ?? 0
      if (w > bestWrite || (w === bestWrite && r > bestRead)) {
        best = area; bestWrite = w; bestRead = r; tied = false
      } else if (w === bestWrite && r === bestRead) {
        tied = true
      }
    }
    owners.set(tableId, {
      tableId,
      // 동률을 임의로 깨지 않는다 — 데이터가 주인을 말해주지 않으면 만들어내지 않는다.
      ownerArea: tied ? null : best,
      writeCounts: Object.fromEntries(acc.writes),
      readCounts: Object.fromEntries(acc.reads),
    })
  }
  return owners
}
