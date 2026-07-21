# Phase 0 Research: 응집도·결합도 그래프 보기

**Date**: 2026-07-21 · **Spec**: [spec.md](./spec.md)

조사는 전부 원문 코드와 실행 결과로 확인했다. 추론으로 채운 항목은 없다.

---

## R1. 층(영역/모듈/루틴) 판정을 어디서 하는가

**Decision**: 기존 `src/shared/utils/nodeClassify.ts`를 그대로 쓴다. 새 판정기를 만들지 않는다.

**Rationale**: 이 파일이 이미 층 판정의 단일 진실이다.

- `NodeRole = 'container' | 'callable' | 'statement' | 'table' | 'column' | 'other'`
- `CONTAINER_LABELS = {FILE, CLASS, INTERFACE, RECORD, MODULE}` — 모듈(그릇)
- `CALLABLE_LABELS = {METHOD, FUNCTION, PROCEDURE, TRIGGER}` — 루틴
- 파일 주석: "역할(그릇/호출가능)은 타입집합으로 파생… 컴포넌트에 분기 산발 금지(DRY)"

영역(`PACKAGE`)은 여기서 의도적으로 제외돼 있고(`PACKAGE 는 네임스페이스라 별도 취급`), 소속은
`FILE -BELONGS_TO-> PACKAGE` 엣지로 판정한다. `graphCanvas.ts`의 `hierarchyMap`이 이미 그 계산을
하고 있다(BELONGS_TO + HAS_MEMBER 역인덱스).

**Alternatives considered**:

- *분석기가 `MODULE`/`ROUTINE` 라벨을 박고 프론트는 라벨만 읽는다* — 장기적으로 더 DRY하지만
  (a) 분석기 저장소가 156개 파일 dirty이고 `075-external-file-linking`이 tasks 48/100 진행 중,
  (b) `MODULE` 라벨이 이미 외부 stub(`:MODULE:EXTERNAL`)에 점유돼 있어 의미 충돌 정리가 선행돼야 한다.
  → 후속 범위로 분리. 이번엔 프론트에서 기존 단일 진실을 재사용한다.
- *059에서 새 층 판정 함수를 만든다* — `nodeClassify.ts`와 중복 판정이 생긴다. 거부.

---

## R2. 테이블 소속(주인) 판정

**Decision**: 영역마다 `(쓰기 수, 읽기 수)`를 만들어 **사전식으로 가장 큰 영역**이 주인이다.
가장 큰 영역이 **유일하지 않으면 주인을 정하지 않고** `'기타'`로 보낸다. R/W 관계의 출발 노드는
`PARENT_OF` 체인으로 거슬러 올라가 소유 루틴 → 소유 모듈 → 소유 영역으로 해소한 뒤 센다.

**Rationale**: 사업 결정(2026-07-21)이 "쓰기가 가장 많은 쪽"이다. 사전식 비교는 쓰기를 먼저 보므로 그
결정을 그대로 지키면서, 계단식 2차·3차 규칙을 **비교 하나로 흡수**한다.

초안은 `쓰기 최다 → 총 연결 최다 → 이름 순` 3단이었으나 폐기했다. 이름 순은 "왜 저 영역이 주인이냐"에
답할 수 없는 임의 규칙이고, 규칙을 계단으로 쌓는 것 자체가 특수 케이스 누적이다(principles §3).

**실측 검증 (테이블 22개 전수, Neo4j `neo4j` DB)**

| 결과 | 개수 | 예 |
|---|---:|---|
| 주인 있음 | 20 | `orders`→settlement(3,1) · `product_stock`→inventory(3,2) · `member`→member(2,2) vs payment(2,1) · `product_price_hst`→catalog(1,1) vs inventory(1,0) |
| 주인 없음 → `'기타'` | 2 | `member_grade_pol`(5개 영역 전부 (0,1) 동률) · `pg_company`(2개 영역 (0,1) 동률) |

3단 규칙이 2차·3차에서 갈랐던 `member`·`product_price_hst`가 **사전식 비교 하나로 그대로 갈린다.**
읽기 전용 마스터도 쓰기가 0이라 자동으로 읽기 수 비교로 넘어가므로 별도 규칙이 필요 없다 —
초안의 "쓰기가 0이면 읽기로 판정한다"는 조항도 함께 삭제했다.

주인 없는 2개는 실제로 여러 영역이 대등하게 참조하는 정책·마스터 테이블이라 "주인 없음"이 사실에
맞는 서술이다. 임의 배정이 오히려 거짓 정보를 만든다(constitution IV — 없는 것을 있다고 하지 않는다).

**PARENT_OF 해소가 필요한 이유**: `graphCanvas.ts:83-86` 주석이 실측 근거를 남기고 있다 —
"READS/WRITES 의 source 는 루틴 루트가 아니라 그 안에 중첩된 구문 노드라(실측 156/157),
funcToModule 직접조회는 거의 다 실패해 2노드만 떴다". 같은 해소기를 쓴다. `PARENT_OF*0..10`은
Framework(출발이 루틴 자신)와 DBMS(출발이 구문) 양쪽을 한 식으로 덮는다 → **전략 분기 0**.

**Alternatives considered**:

- *많이 읽는 쪽을 주인으로* — 쓰기를 무시하면 데이터를 바꾸지 않는 영역이 주인이 된다. 거부.
- *공유 테이블을 영역 밖에 남긴다* — 초기 설계였으나 사용자 결정으로 폐기. 테이블 전용 구역이 생겨
  선이 화면을 가로지르는 현재 문제가 재현된다.
- *동률이면 이름 순으로 배정* — 폐기. 설명 불가능한 임의 규칙이고, 데이터에 없는 소유권을 만들어낸다.

---

## R3. 진행 중인 057·058 WIP와의 충돌 회피

**Decision**: 새 파일 위주로 작업하고, `graphCanvas.ts`는 057 해석과 겹치지 않는 세 지점만 최소
수정한다. 테스트·tsconfig 산출물은 `specs/059-cohesion-coupling-view/` 아래에 둔다.

**Rationale**: `git diff` 실측으로 057/058이 만진 hunk를 확인했다.

| 파일 | WIP 주인 | 만진 곳 | 059 충돌 |
|---|---|---|---|
| `graphCanvas.ts` | 057 | import 1줄, `panelProjection` computed 신설, `canvasGraphData`의 **링크 필터 루프**, `rebuildPanelLoad` 본문 | 059는 `CanvasPreset` 타입·`canvasGraphData` **프리셋 분기 머리**·`buildHealthGraph` 삭제만 건드린다 → **hunk 비중첩** |
| `graphVisibility.ts` | 058 | 라벨/링크 목록 **추가만** | 059는 이 파일을 건드리지 않는다 |
| `package.json` | 057/058 | scripts 2개 추가 | 059는 건드리지 않는다 → 테스트는 `node <경로>` 직접 실행 |
| `scripts/`, `tests/` | 057/058 | 신규 디렉터리 | 059는 쓰지 않는다 |

`specs/058-external-graph-integration/tsconfig.json`이 이미 존재하므로 **스펙 폴더 안에 tsconfig를 두는
것은 이 저장소의 확립된 관례**다. 059도 그 관례를 따른다.

**Alternatives considered**:

- *`package.json`에 test 스크립트 추가* — WIP 파일 수정이 된다. 거부. 대신 `quickstart.md`에 실행
  명령을 적고, 057/058이 착지한 뒤 스크립트로 승격한다.

---

## R4. 삭제 대상의 소비처 전수 (죽은 코드 0)

`grep` 전수 결과다. 이 목록이 tasks의 삭제 체크리스트가 된다.

**협력 군집(`viewMode='area'`)**

- `GraphTab.vue`: 타입 정의(56), `hullLevels`(65-74), `clusterKeyOf`(104-109), `clusterLabelOf`(125-135),
  `applyViewMode`(208), `ensureNodesForView('component_id')`(230-254), 라벨(263), 템플릿 버튼(818~)
- `component_id`/`component_name`을 읽는 곳은 위가 전부다(`src/` 기준). 다른 feature 소비처 0.

**건강(`viewMode='health'`, `colorMode='health'`, `health-rw` 프리셋)**

- `GraphTab.vue`: 타입(56), `hullLevels`(75), `clusterKeyOf`(98), `clusterLabelOf`(119), `colorMode`(140),
  `applyViewMode`(204-207), 힌트 문구(249), 라벨(264), 프리셋 해제 감시(549), 템플릿(732·823~)
- `NvlGraph.vue`: prop 정의(60), 기본값(127), `HEALTH_COLORS`(139), `HEALTH_NEUTRAL`(144),
  `resolveNodeColor` 분기(147-151), watch(855)
- `graphCanvas.ts`: `CanvasPreset`의 `'health-rw'`(30), `buildHealthGraph`(295-347), `makeRoutineResolver`
  (126-142 — buildHealthGraph 전용), `canvasGraphData` 분기(409-411)
- `analyzer.ts`의 `health_metrics_step`은 **분석 진행 단계 이름**이라 무관 — 삭제 대상 아님(오판 주의).

**`rolesOf`**

- 소비처는 같은 파일의 `colorLabelOf` **하나뿐**이다. 다른 파일 4곳은 전부 올바른
  `semanticRoleLabels`를 쓴다(`GraphTab.vue:388`, `NodeDetailBase.vue:62`, `nodeIdentity.ts:106`).
  → `rolesOf` 삭제 후 `colorLabelOf`가 `semanticRoleLabels`를 쓰게 하면 소비처 0이 된다.

---

## R5. 색 결정의 단일 진실과 시그니처 변경 영향

**Decision**: `getRelationshipColor(type)` → `getRelationshipColor(type, crossesArea)` 로 확장하되
두 번째 인자를 선택적으로 두어 기존 6개 소비처가 그대로 동작하게 한다. 영역 정보를 아는 곳
(캔버스 렌더)만 두 번째 인자를 넘긴다.

**Rationale**: 소비처 전수는 6곳이다.

| 소비처 | 영역 정보를 아는가 | 처리 |
|---|---|---|
| `NvlGraph.vue:244` 관계 렌더 | 예 | 두 번째 인자 전달 |
| `NvlGraph.vue:769` 범례 | 아니오(타입만) | 대표색(영역 넘는 쪽) 사용 |
| `NvlGraph.vue:292` 통계 | 아니오 | 대표색 |
| `GraphTab.vue:407` 개요 통계 | 아니오 | 대표색 |
| `GraphStylePanel.vue:66` 스타일 패널 | 아니오 | 대표색 |
| `useGroupHulls.ts:273` 교차 엣지 오버레이 | **예** — 클러스터 간 엣지만 그림 | 두 번째 인자 전달 |

`ObjectExplorerGraph.vue:226`에도 같은 이름의 함수가 있으나 **그 파일 안의 지역 함수**이고 다른
feature다. 건드리지 않는다(오판 주의).

**Alternatives considered**:

- *색 결정을 캔버스 컴포넌트 안에서 직접 계산* — 범례·통계·패널과 색이 갈라진다. constitution의
  단일 진실 취지에 어긋난다. 거부.

---

## R6. 드릴다운 상태를 어디에 두는가

**Decision**: 펼침 상태(`expandedAreaIds`, `expandedModuleIds`, `expandedRoutineId`)를 캔버스 스토어에
두고, 화면 그래프는 그 상태에서 파생되는 순수 함수로 계산한다. `expandedRoutineId`는 **단수**다
(FR-011: 새 루틴을 펼치면 이전 것이 자동으로 접힌다).

**Rationale**: NVL에 더블클릭 훅은 없지만 `NvlGraph.vue:596-616`에 300ms 간격 판정이 이미 구현돼
있고 `node-expand` 이벤트로 올라온다. `GraphTab.vue:593-596`이 그 이벤트를 받아
`expandNodeOnCanvas`(1-hop)를 호출한다. **훅은 그대로 두고 핸들러가 하는 일만 바꾼다.**

**Alternatives considered**:

- *그래프 라이브러리 교체* — 불필요. 더블클릭 판정이 이미 동작한다.
- *펼침 상태를 컴포넌트 지역 상태로* — 보기 모드 전환·프리셋 해제와 동기화가 필요해 스토어가 맞다.

---

## R7. 관계 캡션 한국어화

**Decision**: `NvlGraph.vue:243`의 `caption: link.type`을 표시명 변환 함수를 거치게 한다. 변환표는
`graphStyles.ts` 옆에 두어 색과 같은 곳에서 관리한다.

**Rationale**: 캡션이 이미 그려지고 있으므로 색약 대비 이중 부호화를 추가 비용 없이 얻는다.
`WRITES`→`쓰기`, `READS`→`읽기`, `CALLS`→`호출`. 표에 없는 타입은 원래 이름을 그대로 쓴다
(모르는 타입이 조용히 사라지지 않게).

---

## R8. NVL 제약 — 확인된 것과 미확인

- **확인**: 관계에 `color`, `width`, `caption`을 줄 수 있다(`NvlGraph.vue:237-250`이 실제로 사용 중).
- **미확인**: `style='dashed'` / `dashed=true`가 실제로 그려지는지. 코드 주석이 "NVL 이 옵션을 무시해도
  색/두께로 구분됨"이라고 적어 미검증 상태임을 스스로 밝히고 있다.
- **영향**: 059는 점선에 의존하지 않는다. 구분은 색(종류) + 진하기(영역 통과) + 굵기(건수) +
  캡션(한글)으로 충분하다. 점선은 기존 가상 링크 표시에 쓰이던 것을 그대로 둔다.

---

## R9. 검증 도구

**Decision**: 순수 모듈 + 계약 테스트(`node` 직접 실행) + 전용 tsconfig strict 검사. 실제 화면은
Playwright로 캡처해 눈으로 확인한다.

**Rationale**: `package.json` 실측 — `type-check`는 `vue-tsc --noEmit`, 057이
`test:panel-projection`(`node scripts/*.mjs`)과 `type-check:panel-projection`(전용 tsconfig)을 쓴다.
같은 패턴을 따르되 산출물 위치만 스펙 폴더로 옮긴다(R3).

**정답지**: 2026-07-21 실측한 테이블 22개 소속 결과를 계약 테스트의 기대값으로 쓴다.
