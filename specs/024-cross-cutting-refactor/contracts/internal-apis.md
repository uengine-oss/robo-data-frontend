# Internal API Contracts — 횡단 안전 리팩토링 배치 ①

본 배치는 외부(백엔드/MF/네트워크) 계약을 건드리지 않는다(그 계약은 `refactor-contracts` 메모리·constitution 참조, 전부 불변). 아래는 **리팩토링이 보존/정리하는 코드 내부 계약**이다.

## 1. 노드 표시이름 (US1)

> **설계 진화(구현 중 확정)**: 초기 "`getNodeDisplayName` 6옵션 단일함수" 안은 **막무가내 통합(옵션 지옥)**으로 기각([[principles]] 가독성·응집 우선). 골든 실측 결과 세 화면의 차이는 대부분 **의도적**(실데이터 어긋남 0)이고 진짜 중복은 "조립 로직"뿐임이 확인됨. 따라서 **진짜 복붙만 공유 헬퍼로 추출**하고, type 산출 전략과 화면 고유 분기는 각 함수에 얇게 유지한다.

### 신설 — 공유 헬퍼 2개 (진짜 중복 제거)
```ts
// src/shared/utils/graphDisplay.ts
export function typeWithLine(typeLabel: string, startLine: unknown, withLine: boolean): string
export function applyLogicalMode(node: GraphNode, physical: string, logical: boolean): string
```
- `typeWithLine`: 이름 없는 노드의 `타입` 또는 `타입 [line]`. 트리·패널=`withLine:true`, 캔버스=`false`(현 동작 보존).
- `applyLogicalMode`: 논리명 모드면 `logicalModeName` 위임, 아니면 물리명. 트리·캔버스 공유.

### 보존 — 공개 표면(소비처가 계속 import)
- `technicalNodeName(node)`, `logicalNodeName(node)`, `formatPeerListLabel`, `relationshipRowParts`, `formatRelationshipLine`, `friendlyEdgeLabel`, `formatRelWithOp`, `stripCStyleComments` — **공개 시그니처·반환값 불변**. `technicalNodeName`은 내부 `lineSuffix` 클로저를 `typeWithLine`으로 교체(중복 제거), 호출측(NodeDetailPanel·NodeDetailBase·ModuleCard·FileCard·FunctionCard) 반환 문자열 동일.
- `nodeClassify`: `logicalModeName`·`structureLogicalName`·`nodeTypeLabel`·`classifyNode`·라벨 집합 — 불변(논리명/배지 단일 결정처 유지).
- type 산출 전략은 **각 화면 고유**(의도적 차이, 통합 안 함): 패널=`nodeTypeLabel`(첫 구체), 트리=`pickDisplayLabel`(역할 제외→ROLE_PRIORITY 폴백, navigator 14-라벨), 캔버스=`labels[last]`. BL `[seq]`는 트리 고유 유지, 특수본문(RULE/Q/E)·DB세그먼트는 패널 고유 유지.

### 수렴 — 호출측(출력 보존)
- `navigator.pickDisplayName`: 물리명을 `typeWithLine(pickDisplayLabel(labels), start_line, true)`로, 논리명 모드를 `applyLogicalMode(...)`로. BL `[seq]` 분기 유지. 트리 항목 `name`·`nodeType` 동일.
- `NvlGraph.resolveCaption`: `applyLogicalMode(node, physical, showLogicalNames.value)`. `physical = name || labels[last] || id`. 캔버스 caption 동일.

**검증**: 골든 마스터 — 전 노드 × {tree,canvas,panel} × {physical,logical} = 6,738 케이스 출력 diff 0 (✅ 통과, SC-001).

## 2. 스타일 스토리지 (US3)

```ts
// src/shared/utils/graphStyleStorage.ts — 시그니처 전부 불변, 내부에 캐시만 추가
loadStyles(category): StyleMap
getStyle(category, type): StyleConfig | null
setColor / setSize / removeStyle / saveStyles / clearStyles(...)
getNodeStyle(type) / getRelationshipStyle(type)
export const storageVersion: Ref<number>   // 반응성 계약 — 불변
```
- `loadStyles`: 동일 저장상태에서 반복 호출 시 `localStorage.getItem`/`JSON.parse` 재실행 금지(메모이즈). 반환 **값** 동일.
- 모든 mutation: 캐시 무효화 + `storageVersion` bump(현 시점·횟수 보존).
- 소비처(`graphStyles.getNodeColor/getNodeSize/getRelationshipColor/getRelationshipWidth`, `GraphStylePanel`) 반환값 불변.

**검증**: 색/크기 함수 반환값 전후 동일 + `getItem` 호출 횟수 급감(SC-004).

## 3. 스트림 파서 (US2)

```ts
// src/shared/services/http.ts — 외부 시그니처 불변
streamFetch / streamSseFetch / postJson / postFormData / handleHttpError ...
```
- 내부 `parseJsonLine`·SSE `flushEvent`: 손상 줄 → `logger` 기록 + 스킵 + 지속(throw 금지).
- 정상 스트림: `onEvent` 호출 시퀀스·종료·버퍼 동작 불변.

**검증**: 정상 스트림 동작 동일 + 손상 줄 주입 시 비중단·기록(SC-003).
