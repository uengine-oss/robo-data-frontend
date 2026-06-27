# Feature Specification: 그래프 뷰 정리 — 캔버스 비우기 선택해제 + INIT_BY/REFERENCES 숨김

**Feature Branch**: `main`
**Created**: 2026-06-27
**Status**: Draft

**Input**: (A) "캔버스 비우기"하면 노드패널의 활성 필터(선택) 효과도 사라져야 하는데 안 사라짐. (B) 관계도에서 INIT_BY·REFERENCES 관계는 안 보이게. (C) GLOBAL_VARIABLE 노드도 안 보이게(표시 불필요).

## 배경 (왜)
- (A) `handleResetGraph`(캔버스 비우기)가 `clearCanvas()`만 호출 → 캔버스 노드(`canvasNodeIds`)만 비우고 `loadedLabels`/`loadedRelTypes`(노드패널 칩 active 하이라이트)는 유지. 캔버스가 비었는데 칩은 "활성"으로 남는 상태 불일치.
- (B) `HIDDEN_LINK_TYPES`(analyzer.ts)·`EXCLUDED_RELS`(nodeRelationships.ts)에 REFERENCES는 이미 있어 숨겨짐. INIT_BY만 양쪽에 빠져 그래프·패널에 노출. REFERENCES와 같은 부류(보조 참조 링크)라 동일 처리가 일관.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 캔버스 비우기 = 활성 필터 효과도 해제 (Priority: P1)
"캔버스 비우기" 클릭 시 캔버스 노드뿐 아니라 노드패널 라벨 칩의 active 하이라이트(loadedLabels/loadedRelTypes)도 함께 해제된다.

**Independent Test**: 라벨 칩으로 isolate(active) → 캔버스 비우기 → 칩 active 효과 0개.

**Acceptance Scenarios**:
1. **Given** loadedLabels에 'FUNCTION' active, **When** 캔버스 비우기, **Then** loadedLabels 비고 칩 active 해제.
2. **Given** 선택 노드/관계 있음, **When** 캔버스 비우기, **Then** 선택도 해제(기존 동작 유지).

### User Story 2 - INIT_BY/REFERENCES 관계도 숨김 (Priority: P1)
관계도(캔버스)와 노드패널 관계 목록에 INIT_BY·REFERENCES가 안 나온다.

**Independent Test**: 그래프 로드 → 캔버스/필터 목록에 INIT_BY·REFERENCES 없음.

**Acceptance Scenarios**:
1. **Given** 그래프에 INIT_BY 링크, **When** 캔버스 렌더, **Then** INIT_BY 미표시(HIDDEN_LINK_TYPES).
2. **Given** REFERENCES, **When** 렌더, **Then** 미표시(기존 유지).

### User Story 3 - GLOBAL_VARIABLE 노드 숨김 (Priority: P2)
관계도·필터·트리에 GLOBAL_VARIABLE 노드가 안 나온다(시각 노이즈 제거).

**Independent Test**: 그래프 로드 → 캔버스/필터 종류 목록에 GLOBAL_VARIABLE 없음.

**Acceptance Scenarios**:
1. **Given** GLOBAL_VARIABLE 노드, **When** 캔버스/필터 렌더, **Then** 미표시(HIDDEN_NODE_LABELS). 연결 링크도 숨김.

### User Story 4 - "숨김 요소 표시" 토글 (Priority: P1)
`필터 ▾` 메뉴에 **독립 섹션**으로 "숨김 요소 표시" 토글. 켜면 기본 숨김(변수·GLOBAL_VARIABLE·INIT_BY·REFERENCES·메타노드)이 **그래프·필터 목록·네비게이터 트리 전부**에 다시 나온다. 끄면 원복.

**Why this priority**: 기본은 깔끔(숨김), 필요 시 전부 보기 — 사용자 핵심 요구.

**Independent Test**: 토글 ON → graphData 노드/링크 수 증가, GLOBAL_VARIABLE·INIT_BY·REFERENCES 등장, 네비 트리에 변수 등장. OFF → 원복.

**Acceptance Scenarios**:
1. **Given** 토글 OFF(기본), **When** 그래프, **Then** 변수·INIT_BY·REFERENCES 미표시.
2. **Given** 토글 ON, **When** 그래프/필터/네비, **Then** 숨김 요소 전부 표시.
3. **Given** 토글과 관계 끄고/켜기(섹션 A), **Then** 서로 독립(한쪽이 다른쪽 상태 불변).

### User Story 5 - 보기/필터 버튼 아이콘 세로 중앙정렬 (Priority: P3)
`보기 ▾`·`필터 ▾` 버튼의 아이콘이 글자와 세로 중앙으로 정렬된다(이모지 baseline 편차 근본 제거).

**Acceptance Scenarios**:
1. **Given** 보기 버튼, **When** 렌더, **Then** 아이콘이 글자 중앙선에 정렬(아래로 안 치우침).

### Edge Cases
- INIT_BY/REFERENCES·GLOBAL_VARIABLE·변수는 **데이터는 보존**, 표시만 차단. 토글로 복원.
- 캔버스 비우기 후 다시 라벨 칩 클릭하면 정상 재로드(상태 깨끗).
- 토글 ON 시 메타노드(RULE/EXAMPLE/QUESTION)는 의미링크(semanticLinkMap)까지 그래프에 합쳐 연결 표시.

## Requirements *(mandatory)*
- **FR-001**: `handleResetGraph`가 `clearPanelLoad()`도 호출해 loadedLabels/loadedRelTypes 해제.
- **FR-002**: 버튼 타이틀/주석을 실제 동작(필터 active도 해제)으로 정합.
- **FR-003**: `HIDDEN_LINK_TYPES`에 INIT_BY 추가(캔버스 숨김). REFERENCES는 유지.
- **FR-004**: `EXCLUDED_RELS`에 INIT_BY 추가(노드패널 관계목록 숨김) — REFERENCES와 동일 처리(일관).
- **FR-005**: 데이터 보존(표시만 차단).
- **FR-006**: `HIDDEN_NODE_LABELS`에 GLOBAL_VARIABLE 추가 — 캔버스·필터·연결 링크에서 숨김.
- **FR-007**: 단일 reactive 플래그 `showHidden`(analyzer store) — 그래프(graphData)·네비(isExcluded·buildChildIndexes)가 공유. `필터 ▾` 메뉴 섹션 B 토글이 제어. 관계 끄고/켜기(섹션 A)와 독립.
- **FR-008**: 적재(updateGraphData·mergeStreamRelationship)는 숨김 링크도 **전부 보존**(linkMap) — 표시 필터는 graphData 단계에서. (옛 적재시 drop=`isHiddenLink` 제거, 데드.) showHidden 토글로 복원 가능해짐.
- **FR-009**: showHidden 시 graphData가 의미링크(semanticLinkMap)도 포함 — 메타노드 연결 표시.
- **FR-010**: `보기 ▾`/`필터 ▾` 아이콘을 SVG(대칭 viewBox)로 — 이모지 baseline 편차 근본 제거(매직 px 금지).
- **FR-011**: ★근본 통합 — 링크는 `linkMap` **한 곳**에 날것 전부 저장(semanticLinkMap 이중맵 폐기). 숨김 정의는 `shared/utils/graphVisibility.ts` **단일 모듈**(HIDDEN_NODE_LABELS·HIDDEN_LINK_TYPES·isNodeHidden·isLinkHidden) — graphData·canvasGraphData 가 공유. 표시 필터는 오직 표시 단계. showHidden 시 메타노드(RULE/EXAMPLE/QUESTION)+의미링크까지 캔버스에 연결 표시. 노드패널 규칙보고서는 linkMap 에서 의미 타입만 추출(getSemanticReport self-filter).

## Success Criteria *(mandatory)*
- **SC-001**: 캔버스 비우기 후 노드패널 칩 active 0.
- **SC-002**: 캔버스/필터/패널에 INIT_BY·REFERENCES 미표시.
- **SC-003**: vue-tsc 변경파일 새 에러 0. 데이터 보존(set 복원 시 재노출).

## Assumptions
- handleClearFilters('*' 배지)와 동작이 겹쳐도 무방(캔버스 비우기는 선택해제까지 포함=상위집합).
- INIT_BY/REFERENCES 숨김은 시각 노이즈 제거 — 노드 식별/논리 무관(데이터 그대로).
