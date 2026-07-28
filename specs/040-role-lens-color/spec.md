# Feature Specification: 누적 라벨 렌즈의 부분집합 색상 계약

**Feature Branch**: `main`  
**Created**: 2026-06-28  
**Revised**: 2026-07-18  
**Status**: Active contract

## 사용자 의도

Overview에서 종류와 역할을 누적 선택할 때, 노드는 “마지막에 아무거나 누른 색으로 전부 덮이는”
것이 아니라 자신이 속한 가장 구체적인 활성 집합의 색을 따른다.

- `FUNCTION`만 활성: 모든 FUNCTION은 FUNCTION색.
- `FUNCTION → QUERY` 누적 활성: QUERY 역할을 가진 FUNCTION만 QUERY색, 나머지는 FUNCTION색.
- `TABLE + QUERY` 활성: TABLE은 TABLE색, QUERY 함수는 QUERY색.
- 활성 역할이 없는 이웃 노드는 자기 종류색을 유지한다.
- QUERY의 사용자 색·크기 변경은 QUERY 부분집합에만 반영되고 일반 FUNCTION을 오염시키지 않는다.

## 상위 원문 계약과 우선순위

1. **035/036 저장 계약**: 생산자는 원칙적으로 `[kind, ...roles]` 멀티라벨을 만든다.
2. **명시 속성 계약**: `properties.type`과 `properties.stereotype`이 있으면 Neo4j 라벨 반환 순서보다
   우선한다. 명시 속성이 없는 과거 데이터에서만 위치 계약을 fallback으로 쓴다.
3. **마커 계약**: `INTERNAL`, `EXTERNAL`, `EMBEDDED`는 종류·역할 렌즈가 아니다.
4. **041 케이스 계약**: `loadedLabels`는 그래프 원본 표기와 Set 삽입 순서를 그대로 보존한다.
   비교 지점에서 임의 대문자화·소문자화를 하지 않는다.
5. **건강 보기 예외**: `colorMode=health`에서는 위험도색이 라벨 렌즈보다 우선한다. 건강 보기 밖에서는
   이 예외를 적용하지 않는다.

## 단일 판정법

모든 production 소비자는 `colorLabelOfNode(node, activeLabels)`만 사용한다.

1. node-aware 종류를 `properties.type` 우선, 위치 fallback으로 구한다.
2. 종류와 마커를 제외한 라벨을 의미 역할로 구한다.
3. 활성 라벨을 최근 클릭 순서의 역순으로 훑는다.
4. 노드가 가진 활성 역할을 만나면 그 역할을 반환한다.
5. 활성 역할이 없으면 언제나 그 노드의 종류를 반환한다.

따라서 역할은 종류보다 구체적인 부분집합 렌즈이며, 역할 선택이 같은 종류 전체를 다시 칠하지 않는다.
여러 활성 역할을 동시에 가진 이론적 노드는 가장 최근에 활성화된 역할을 사용한다. Set 삭제 후 재추가는
새 활성화로 취급한다.

## User Scenarios & Acceptance

### US1 — 종류만 선택

**Given** 일반 FUNCTION과 QUERY FUNCTION이 존재하고  
**When** FUNCTION을 선택하면  
**Then** 둘 다 FUNCTION색이며 QUERY 역할은 아직 색을 덮지 않는다.

### US2 — 종류 뒤 역할 누적 선택

**Given** FUNCTION이 이미 활성이고  
**When** QUERY를 추가 선택하면  
**Then** QUERY FUNCTION만 QUERY색으로 바뀌고 일반 FUNCTION은 FUNCTION색을 유지한다.

### US3 — 서로 다른 종류·역할 동시 표시

**Given** TABLE과 QUERY를 활성화하면  
**Then** TABLE은 TABLE색, QUERY FUNCTION은 QUERY색, 그 밖의 연결 노드는 자기 종류색이다.

### US4 — 스타일 사용자 변경

**Given** QUERY가 활성이고  
**When** QUERY 색이나 크기를 변경하면  
**Then** QUERY 부분집합과 QUERY 범례·Node 패널만 같은 스타일 키를 사용하며 일반 FUNCTION은 변하지 않는다.

### US5 — 입력 순서와 마커 내성

**Given** labels 순서가 뒤집혔지만 `type=FUNCTION`, `stereotype=QUERY`이고  
**When** QUERY를 활성화하면  
**Then** 정상 순서 데이터와 동일하게 QUERY색이다. INTERNAL/EXTERNAL/EMBEDDED는 역할 후보가 아니다.

## Functional Requirements

- **FR-001**: 종류·역할 판정의 production 단일 출처는 `nodeLabels.ts`의 node-aware API다.
- **FR-002**: NvlGraph 초기 렌더와 부분 스타일 갱신은 같은 resolver를 사용해야 한다.
- **FR-003**: NodeDetailBase 배지는 NvlGraph와 같은 resolver 결과를 사용해야 한다.
- **FR-004**: GraphTab 범례는 라벨별 스타일 키를 표시하며, 역할/종류 그룹 판정은 같은 node-aware
  종류·역할 함수에서 받아야 한다.
- **FR-005**: `FUNCTION + QUERY`에서 일반 FUNCTION과 QUERY FUNCTION이 동시에 다른 색이어야 한다.
- **FR-006**: 사용자 스타일 저장소의 조회 키는 전체 labels 배열이 아니라 resolver가 반환한 단일 라벨이다.
- **FR-007**: 활성 라벨 또는 스타일 변경은 NVL 요소의 색·크기만 부분 갱신하고 위치·선택·레이아웃을
  초기화하지 않아야 한다.
- **FR-008**: 원본 케이스 정확매칭과 Set 삽입 순서를 유지해야 한다.
- **FR-009**: build와 build:docker 전에 회귀 테스트를 의무 실행해야 한다.
- **FR-010**: 실제 UI E2E는 FUNCTION → QUERY 누적 선택 후 두 집합이 동시에 구분되는지 확인해야 한다.

## 금지 패턴

- `NvlGraph`나 `NodeDetailBase`에서 종류·역할을 다시 자체 판정하는 분기.
- 역할 이름 목록을 하드코딩하는 방식.
- `getNodeColor(node.labels)`처럼 멀티라벨 배열을 그대로 스타일 키 선택에 넘기는 방식.
- 활성 QUERY를 이유로 모든 FUNCTION을 QUERY색으로 바꾸는 전역 덮어쓰기.
- 비교 지점의 임시 `toUpperCase()`/`toLowerCase()` 보정.
- 색상 변경을 위해 NVL을 재생성하거나 레이아웃을 재실행하는 방식.
- INTERNAL/EXTERNAL/EMBEDDED를 역할 렌즈로 취급하는 방식.

## 회귀 행렬

| 노드 | 활성 라벨 | 기대 스타일 라벨 |
|---|---|---|
| `[FUNCTION]` | `[]` | `FUNCTION` |
| `[FUNCTION]` | `[FUNCTION]` | `FUNCTION` |
| `[FUNCTION, QUERY]` | `[FUNCTION]` | `FUNCTION` |
| `[FUNCTION, QUERY]` | `[FUNCTION, QUERY]` | `QUERY` |
| `[FUNCTION]` | `[FUNCTION, QUERY]` | `FUNCTION` |
| `[TABLE]` | `[TABLE, QUERY]` | `TABLE` |
| `[FUNCTION, QUERY]` | `[TABLE, QUERY]` | `QUERY` |
| `[FUNCTION, COMMAND, QUERY]` | `[COMMAND, QUERY]` | `QUERY` |
| `[FUNCTION, COMMAND, QUERY]` | `[QUERY, COMMAND]` | `COMMAND` |
| 순서역전 + `type=FUNCTION, stereotype=QUERY` | `[QUERY]` | `QUERY` |
| `[FUNCTION, EXTERNAL, EMBEDDED]` | `[EXTERNAL]` | `FUNCTION` |

## Success Criteria

- **SC-001**: 회귀 행렬 전 항목 자동 테스트 통과.
- **SC-002**: production의 옛 `colorLabelOf(labels, ...)` 호출 0건.
- **SC-003**: 캔버스와 Node 패널이 동일 노드에 대해 동일 스타일 라벨을 사용.
- **SC-004**: FUNCTION → QUERY 실제 UI 누적 선택에서 두 색이 동시에 보이고 위치가 유지됨.
- **SC-005**: QUERY 사용자 스타일 변경 후 일반 FUNCTION의 계산색·크기 불변.
- **SC-006**: `npm run build:docker`가 회귀 테스트를 사전 실행하고 통과.

