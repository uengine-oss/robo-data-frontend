/**
 * nodeLabels.ts
 * 노드 라벨 위치 규칙 단일 출처 (spec 035 / 계약 spec 033).
 *
 * analyzer 가 노드를 멀티라벨 `[antlr타입, stereotype…]` 로 적재한다(타입을 먼저 등록 →
 * `labels[0]`=종류, `labels[1:]`=역할). 소비처는 **위치**로만 종류/역할을 가른다 —
 * 하드코딩 stereotype 집합을 두지 않는다(ontology 변경에도 드리프트 0).
 *
 * 예외 한 가지: 외부 호출 stub 은 `[FUNCTION, EXTERNAL]`/`[MODULE, EXTERNAL]` — EXTERNAL 은
 * 역할(stereotype)이 아니라 "종류 미상" 마커라 역할에서 제외한다.
 */

/** stub 종류미상 마커 — 역할 아님. */
const STUB_MARKER = 'EXTERNAL'

/** 노드의 종류(antlr 타입) = 첫 라벨. */
export function kindOf(labels: readonly string[] | undefined): string {
  return labels?.[0] ?? 'Unknown'
}

/** 노드의 역할(stereotype) 목록 = 첫 라벨 이후, stub 마커 제외. */
export function rolesOf(labels: readonly string[] | undefined): string[] {
  if (!labels || labels.length < 2) return []
  return labels.slice(1).filter(l => l !== STUB_MARKER)
}

/** 라벨이 stub 종류미상 마커인지. */
export function isStubMarker(label: string): boolean {
  return label === STUB_MARKER
}
