/**
 * nodeLabels.ts
 * 노드 라벨 위치 규칙 단일 출처 (spec 035 / 계약 spec 033).
 *
 * analyzer 가 노드를 멀티라벨 `[antlr타입, stereotype…]` 로 적재한다(타입을 먼저 등록 →
 * `labels[0]`=종류, `labels[1:]`=역할). 소비처는 **위치**로만 종류/역할을 가른다 —
 * 하드코딩 stereotype 집합을 두지 않는다(ontology 변경에도 드리프트 0).
 *
 * 예외(마커 라벨): 역할이 아닌 표식은 역할에서 제외한다 —
 * EXTERNAL = 외부 호출 stub "종류 미상" 마커(`[FUNCTION, EXTERNAL]`),
 * EMBEDDED = 검색 벡터 보유 마커(spec 044, 화면 비표시).
 */

/** stub 종류미상 마커 — 역할 아님. */
const SYSTEM_ROLE_LABELS: ReadonlySet<string> = new Set(['INTERNAL', 'EXTERNAL'])

/** 배관 마커 — 역할 아님 + 화면 비표시(spec 044 FR-009). */
const HIDDEN_MARKERS: ReadonlySet<string> = new Set(['EMBEDDED'])

/** 역할에서 제외하는 마커 전체. */
const MARKER_LABELS: ReadonlySet<string> = new Set([...SYSTEM_ROLE_LABELS, ...HIDDEN_MARKERS])

/** 노드의 종류(antlr 타입) = 첫 라벨. */
export function kindOf(labels: readonly string[] | undefined): string {
  return labels?.find(label => !MARKER_LABELS.has(label)) ?? 'Unknown'
}

/** 라벨이 stub 종류미상 마커인지. */
export function isStubMarker(label: string): boolean {
  return label === 'EXTERNAL'
}

function normalizedRole(value: unknown): string {
  return typeof value === 'string' ? value.replace(/[^a-z0-9]/gi, '').toUpperCase() : ''
}

/** Node의 명시 stereotype과 system role label을 순서와 무관하게 반환한다. */
export function semanticRoleLabels(node: { labels?: readonly string[]; properties?: Record<string, unknown> }): string[] {
  const stereotype = normalizedRole(node.properties?.stereotype)
  return (node.labels ?? []).filter(label =>
    SYSTEM_ROLE_LABELS.has(label)
    || (stereotype !== '' && normalizedRole(label) === stereotype),
  )
}

/** Neo4j label 순서에 의존하지 않는 종류 label. */
export function kindOfNode(node: { labels?: readonly string[]; properties?: Record<string, unknown> }): string {
  const roles = new Set(semanticRoleLabels(node))
  const explicit = typeof node.properties?.type === 'string' ? node.properties.type : ''
  if (explicit && node.labels?.includes(explicit)) return explicit
  return node.labels?.find(label => !roles.has(label) && !HIDDEN_MARKERS.has(label)) ?? 'Unknown'
}

/** 라벨이 화면 비표시 배관 마커인지 (통계·칩에서 완전 제외). */
export function isHiddenMarker(label: string): boolean {
  return HIDDEN_MARKERS.has(label)
}

/**
 * 색을 칠할 기준 라벨 — "활성 렌즈"(spec 040). 노드의 역할 중 지금 isolate 된 게 있으면 그 역할로
 * 색칠(역할 칩과 일치), 없으면 종류. 역할 우선.
 *
 * ★spec 059: 역할 판정을 `semanticRoleLabels` 로 통일했다. 이전 `rolesOf` 는 독스트링과 반대로
 * 마커(INTERNAL/EXTERNAL)만 돌려줘 COMMAND·HELPER 같은 실제 역할이 하나도 안 걸렸고, 그래서
 * 역할 칩을 눌러도 색이 바뀌지 않았다(캔버스·상세패널 양쪽). 역할 판정처는 이제 하나다.
 *
 * @param node     라벨과 stereotype 을 함께 봐야 역할을 판정할 수 있어 노드를 받는다.
 * @param isolated 현재 isolate 된 라벨 집합 — loadedLabels(라벨 원본 케이스).
 */
export function colorLabelOf(
  node: { labels?: readonly string[]; properties?: Record<string, unknown> },
  isolated?: ReadonlySet<string>,
): string {
  if (isolated && isolated.size) {
    for (const role of semanticRoleLabels(node)) {
      if (isolated.has(role)) return role
    }
  }
  return kindOf(node.labels)
}
