# Phase 1 Data Model: 횡단 안전 리팩토링 배치 ①

순수 내부 리팩토링이라 새 영속 엔티티는 없다. 아래는 리팩토링이 다루는 **개념 모델**과 보존 불변식이다.

## 표시이름 (Display Name)

한 `GraphNode`를 사람이 읽는 문자열. 화면별 함수(트리 `pickDisplayName`·캔버스 `resolveCaption`·패널 `technicalNodeName`)가 **공유 헬퍼**로 조립한다(단일 함수 통합은 막무가내라 기각 — `research.md` Decision 1).

**공유 헬퍼**
- `typeWithLine(typeLabel, startLine, withLine)` — 이름 없는 노드의 `타입`/`타입 [line]` 조립. 트리·패널 `withLine:true`, 캔버스 `false`.
- `applyLogicalMode(node, physical, logical)` — `logical`이면 `logicalModeName`(논리명→구조한글→물리) 위임, 아니면 물리명. 트리·캔버스 공유.

**입력**
- `node: GraphNode` — `id`, `labels: string[]`, `properties: Record<string, unknown>`(opaque, prune/rename 금지).
- 논리명 모드(`showLogicalNames`) — true면 `logical_name`→구조한글→물리명 폴백.
- 줄번호 표기 — 이름 없는 노드에 `[start_line]` 붙일지(트리·패널 O, 캔버스 X).

**산출 규칙(현 동작 보존; 화면별 함수가 자기 type 전략으로 적용)**
1. 특수 노드: `RULE`→statement, `QUESTION`→text, `EXAMPLE`→description(길이 절단). `BusinessLogic`→`[sequence] title`.
2. `properties.name` 존재 → 그대로.
3. DB 노드: `properties.id`가 점 구분(`db.schema.name`) → 마지막 세그먼트.
4. 이름 없음: 타입 라벨(+ `lineSuffix`면 ` [line]`). 콜론 id raw 노출 금지.
5. `logical` 모드면 위 물리명을 `logicalModeName(node, physical)`에 통과.

**불변식**: 동일 `(node, opts)` → 리팩토링 전후 동일 문자열(골든 마스터 diff 0). 화면별 변형은 오직 `opts`로 표현.

**렌더 채널(tri-channel, 보존)**
- 트리(navigator): 코드 구조 노드. BL은 `[seq]`. `lineSuffix=true`, `logical=showLogicalNames`.
- 캔버스(NvlGraph): 가시 노드(`HIDDEN_NODE_LABELS` 제외). `lineSuffix=false`, `logical=showLogicalNames`.
- 패널(NodeDetail*): 클릭된 노드(RULE/Q/E 포함). 기술명은 항상 물리(`logical=false`), 논리명은 `logicalNodeName`으로 병기.

## StyleMap / StyleConfig (US3 캐시 대상)

`localStorage`에 영속되는 사용자 지정 스타일.
- `StyleConfig { color?: string; size?: number }`
- `StyleMap = Record<string /*라벨|타입*/, StyleConfig>`
- 카테고리: `'node' | 'relationship'` → 각각 `STORAGE_KEYS.NODE_STYLES` / `RELATIONSHIP_STYLES`.

**캐시 불변식**
- `loadStyles(category)` 반환값은 캐시 전후 동일(동일 저장상태 → 동일 맵).
- mutation(`saveStyles`/`removeStyle`/`clearStyles`) 후 다음 `loadStyles`는 새 값 반환(캐시 무효화).
- `storageVersion` ref는 mutation마다 +1(기존 반응성 계약 보존) — 캐시 무효화와 동일 시점.

## StreamEvent (US2 표면화 대상)

스트림 한 줄이 파싱된 이벤트(`type` 판별, `complete`/`error` 종료).

**복원력 불변식**
- 유효 줄: 파싱·`onEvent` 전달이 전과 동일.
- 손상 줄: `onEvent` 미전달 + `logger` 기록 + 스트림 지속(전체 throw 금지).
- 종료/버퍼: `complete`/`error` 종료 신호, 최종 버퍼 처리 동작 보존.
