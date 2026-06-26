# Feature Specification: 그래프 스토어 노드 식별키 단일화 + 일관 초기화

**Feature Branch**: `027-graph-store-identity-key`

**Created**: 2026-06-26

**Status**: Draft

**Input**: 분석 스트림은 노드를 논리 id로, 분석 후 `/robo/graph` fetch는 elementId로 nodeMap에 저장하고 병합 시 clear하지 않아, 같은 그래프가 2벌 쌓여 네비게이터/그래프가 통째로 2번 렌더됨. 식별키를 논리 id로 단일화하고 분석/재분석/append 시작 시 그래프 스토어를 일관 초기화한다.

## 배경 (왜)

분석 결과 화면(네비게이터 트리·그래프 캔버스)이 **같은 패키지→모듈→함수 구조를 2번** 보여준다. 실측: 네비게이터 노드수 588 ≈ neo4j 실제(302)의 약 2배.

근본원인(코드 확정, robo-data-frontend `features/code-analysis/analyzer.ts`):
- **스트림(분석 중)**: `mergeStreamNode` 가 노드를 **논리 id**(`event.id`, 예 `pkg.file.func`)를 키로 nodeMap 에 저장.
- **fetch(분석 후 `/robo/graph`)**: `convertNeo4jNode` 가 **elementId**(`node['Node ID']`, 예 `4:..:746`)를 키로 저장(`updateGraphData`).
- `updateGraphData` 가 기존 스트림 nodeMap **위에 덧붙임**(clear 안 함, 의도적=깜빡임 방지) → 같은 노드가 두 키로 공존 → **그래프 2벌**. 엣지도 동일(fetch 끝점=elementId, 스트림 끝점=논리 id).
- 부수: `clearGraphData`/`reset` 이 nodeMap 3종만 비우고 보조 캐시(`nodeNameCache`)는 안 비움 → 재분석/타프로젝트 시 옛 표시명 잔재. 재분석·append 경로가 그래프 스토어를 초기화하지 않아 누적/혼합.

데이터(neo4j)는 정상(1벌, 302노드). **프론트 스토어가 같은 그래프를 2벌 보유**하는 게 문제.

안전 전제(실측): `/robo/graph` 의 모든 노드가 `Properties.id`(논리 id) 보유(누락 0), 모든 관계 끝점이 노드배치 안(orphan 0) → 논리 id 키 통일·끝점 매핑이 안전.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 그래프가 한 벌로만 보인다 (Priority: P1)

분석을 본 사용자가 네비게이터/그래프에서 **같은 구조(패키지·모듈·함수)를 한 번만** 본다. 노드 개수가 실제 그래프와 일치한다.

**Why this priority**: 사용자가 지목한 핵심 증상(통째 2벌)의 직접 해소.

**Independent Test**: 분석 1회 후 네비게이터 노드수 = 백엔드 `/robo/graph` 노드수와 일치(±0), 같은 패키지/모듈이 2번 나오지 않음.

**Acceptance Scenarios**:

1. **Given** 분석을 마친 상태, **When** 네비게이터를 본다, **Then** 패키지·모듈·함수가 각 1번만 표시되고 노드수가 실제 그래프와 같다.
2. **Given** 분석 스트림으로 그린 노드와 분석 후 fetch한 노드가 같은 노드, **When** 스토어에 적재, **Then** 같은 키로 dedup되어 1개로 합쳐진다.
3. **Given** 분석 직후, **When** 그래프 캔버스를 본다, **Then** 노드/엣지가 중복 없이 1벌만 렌더된다.

### User Story 2 - 재분석·다른 프로젝트도 깨끗하게 (Priority: P2)

재분석하거나 다른 데이터를 분석하면 이전 그래프·표시명 잔재 없이 새 결과만 보인다.

**Why this priority**: 누적/혼합·stale 표시명 방지(②③).

**Independent Test**: 분석 → 재분석 후 노드수가 새 그래프와 일치(이전분 누적 없음), 이전 프로젝트 노드명이 섞이지 않음.

**Acceptance Scenarios**:

1. **Given** 한 번 분석한 상태, **When** 재분석을 시작, **Then** 시작 시 그래프 스토어가 초기화되어 이전 노드/엣지/표시명이 남지 않는다.
2. **Given** 기존 데이터 삭제 후 새 분석, **When** 결과를 본다, **Then** 이전 프로젝트 노드명이 섞이지 않는다.

### Edge Cases

- **논리 id 없는 노드**(이론상): 안전망으로 elementId 폴백(현재 데이터엔 0건).
- **관계 끝점이 노드배치 밖**(orphan): 매핑 실패 시 폴백(드롭 또는 elementId 유지) — 현재 0건이나 견고화.
- **외부 함수+모듈**: 외부 호출은 컨테이너(MODULE)+엔트리 함수(FUNCTION) **2노드가 정상**(내부 file+함수와 동일). ★정정: 이 둘이 같은 논리 id면 본 스펙 키 통일로 잘못 1개로 합쳐져 **함수가 사라지는 회귀**가 생김 → 근본해결은 analyzer 가 모듈·함수에 **구분된 id** 부여(spec 031, `{module}.{name}`). 그러면 027 키 통일과 충돌 없이 모듈→함수 둘 다 정상 표시. (027 의 dedup 은 "진짜 같은 정체성" 노드용이지, 모듈/함수를 합치라는 게 아님.)
- **append(기존에 추가) 모드**: 의도된 누적과 버그성 누적 구분 — append는 새 분석분만 정상 합쳐지고 중복 키는 dedup.
- **스트림 도중 노드보다 관계가 먼저 도착**: 기존 동작(링크 먼저 등록) 보존.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 그래프 스토어(nodeMap/linkMap/semanticLinkMap)의 노드 식별키는 **논리 id 단일**이어야 한다. fetch·스트림 모두 같은 논리 id를 키로 쓴다.
- **FR-002**: fetch(`/robo/graph`) 노드는 `Properties.id`(논리 id)를 키로, 관계 끝점은 elementId→논리 id 매핑으로 적재해야 한다(같은 응답 내 노드로 매핑).
- **FR-003**: 같은 논리 id 노드는 스트림·fetch 출처와 무관하게 **1개로 dedup**되어야 한다(그래프 2벌 금지).
- **FR-004**: 분석/재분석/append 시작 시 그래프 스토어를 **일관 초기화**(nodeMap·linkMap·semanticLinkMap + 보조 캐시 nodeNameCache)하여 이전/타프로젝트 잔재가 남지 않아야 한다. (단 의도된 진행 중 스트림 렌더 깜빡임은 최소화.)
- **FR-005**: `clearGraphData`(또는 통합 초기화)는 nodeMap/linkMap/semanticLinkMap **및 nodeNameCache**를 함께 비워야 한다.
- **FR-006**: 식별키 변경으로 **기존 소비처(네비게이터 트리·그래프 캔버스·노드 상세·검색·드래그 확장 등)가 깨지지 않아야** 한다(무회귀). 소비처는 이미 논리 id(node.id)를 기대하므로 정합되어야 한다.
- **FR-007**: 관계 끝점·hidden 필터·semantic 링크 분리 등 기존 그래프 표시 규칙은 보존한다.

### Key Entities *(include if feature involves data)*

- **노드 식별키(논리 id)**: 모든 그래프 노드의 단일 정체성 키(`pkg.file.func` 등). 스트림·fetch 공통.
- **elementId**: neo4j 내부 노드 키(`4:..:746`). fetch 응답에만 존재 → 논리 id로 변환 후 버림(키로 쓰지 않음).
- **보조 캐시(nodeNameCache 등)**: 표시용 부가 상태 — 그래프 초기화 시 함께 비움.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 분석 후 네비게이터/스토어 노드수 = 백엔드 `/robo/graph` 고유 논리 id 수와 일치(2배 아님).
- **SC-002**: 같은 패키지·모듈이 네비게이터에 2번 나오지 않는다(트리 1벌).
- **SC-003**: 재분석 후 노드수가 새 그래프와 일치(이전분 누적 0).
- **SC-004**: 기존 그래프 기능(트리 펼침·캔버스 렌더·노드 상세·검색·드래그) 무회귀(콘솔 에러 0).

## Assumptions

- 작업 범위 = robo-data-frontend `features/code-analysis/analyzer.ts` 그래프 스토어 적재/초기화 로직. 백엔드(analyzer/catalog)·neo4j 데이터·`/robo/graph` 응답 형태는 무변경.
- 모든 노드가 `Properties.id` 보유, 관계 끝점이 응답 내 존재(실측 확인) — 폴백은 견고화용.
- ★정정: 외부 모듈·엔트리 함수는 **각각 별개 노드(구분 id)로 유지돼야** 한다(모듈→함수 표시). 같은 id 였던 건 analyzer 결함 → spec 031 이 구분 id 부여로 해결. 본 027 키 통일은 그 위에서 모듈·함수를 올바르게 둘 다 보여준다(합치지 않음).
- 검증은 framework 실데이터(zapamcom) 재분석으로 수행(노드수 일치·트리 1벌·무회귀).
- 루트 체크아웃 작업, 사용자 WIP(TableCard.vue 등) 불가침. Electron 반영은 서브모듈 sync+빌드(기존 절차).
