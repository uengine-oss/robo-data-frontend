# Feature Specification: 「코드 그래프」/「데이터 스키마」 탭 분리 + UML 제거

**Feature Branch**: `015-graph-schema-split`

**Created**: 2026-06-16

**Status**: Draft (스펙 합의 전 — 코드 착수 금지)

**Input**: 사용자 결정 — "스키마 관리 한 탭에 그래프+UML+스키마 3개를 욱여넣어 혼란스럽고 툴바가 어수선하다. ① 두 탭으로 분리(코드 그래프 / 데이터 스키마) ② UML 제거 ③ 함수 이름 ID 표시 버그는 별도(이미 수정)." → 본 스펙은 ①②의 **설계·계약·영향범위**를 코드보다 먼저 확정한다.

> 이 스펙은 spec [001-code-analysis](../001-code-analysis/spec.md)(그래프 탭)와 [002-schema-browser](../002-schema-browser/spec.md)(스키마)의 **구조를 재편**한다. 합의 후 001/002 본문을 이 결과에 맞게 정합한다.

## Overview (배경 — 사실 기반)

현재 「스키마 관리」(features.ts `id:'graph'`, GraphTab.vue) **한 탭**이 내부 뷰스위처(스키마/UML/Graph)로 **3개 뷰**를 담는다:

- **Graph** = NVL 지식그래프 (NvlGraph)
- **UML** = 클래스 다이어그램 (VueFlowClassDiagram, java/python만 활성)
- **스키마** = ER (SchemaView → 캔버스 SchemaCanvas / Mermaid ER)

**문제(검증됨)**: ① "스키마 관리"라는 이름은 3개 중 1개(스키마)만 맞다. ② 한 줄에 컨트롤 8개(뷰3+물리명+모듈간+영역+건강+테이블)로 어수선. ③ 떠있는 진행 패널(z-index 200)이 툴바(z-index 100)를 덮는다. ④ Navigator는 Graph 뷰일 때만 떠 일관성이 없다.

**목표**: 한 탭·뷰스위처 구조를 **두 개의 독립 탭**으로 분리하고, 거의 안 쓰는 UML을 제거해 각 화면을 단순·명확하게 한다.

## 결정된 설계 (단일 진실)

### 탭 A — 「코드 그래프」 (id `graph`)
- **내용**: NvlGraph 지식그래프 **전용**. 좌측 **Navigator**(드래그→캔버스).
- **툴바**: 물리명/논리명 토글 · 모듈간 상호작용 · 영역 보기 · 건강 보기 · 테이블 전체. (UML·스키마 스위처 **제거**.)
- **라벨**: features.ts `label: '스키마 관리' → '코드 그래프'`.

### 탭 B — 「데이터 스키마」 (id `schema`, 신규)
- **내용**: SchemaView(**캔버스 / Mermaid ER** 하위 전환) + 좌측 **테이블 목록**(검색·데이터소스>스키마>테이블).
- **라벨**: `'데이터 스키마'`, `embeddable: true`, 아이콘 `IconTable`.
- **컴포넌트**: 신규 `SchemaTab.vue` — 지금 GraphTab 안에 있는 스키마 부분(SchemaView·캔버스/Mermaid 스위처·테이블 목록 패널)을 **그대로 추출**해 담는다.

### 제거 — UML
- VueFlowClassDiagram 뷰 + UML 전용 컨트롤(클래스 검색·태그·umlDepth) + `showUmlTab`/뷰스위처의 UML 버튼 전부 제거.
- `classDiagram.ts` 유틸(getClassName 등)은 **다른 곳도 쓰면 유지**(검증 필요, 아래 Edge).

### 뷰스위처 — 제거
- 「스키마/UML/Graph」 내부 스위처와 `navigatorStore.activeView` 개념 제거. 화면 전환은 **좌측 레일 탭(A↔B)** 으로.

## User Scenarios & Testing *(mandatory)*

### US1 - 코드 그래프 탐색 (P1)
사용자가 「코드 그래프」 탭에서 Navigator 노드를 캔버스로 드래그해 지식그래프를 탐색하고, 물리/논리명·모듈간·영역·건강·테이블 토글을 쓴다. UML·스키마는 여기 없다.
- **Test**: 「코드 그래프」 탭에 NvlGraph + Navigator + 5개 툴바만 보이고, 스위처/UML 없음.

### US2 - 데이터 스키마 탐색 (P1)
사용자가 「데이터 스키마」 탭에서 테이블 목록을 보고 ER을 캔버스/Mermaid로 본다.
- **Test**: 「데이터 스키마」 탭에 테이블 목록 + 캔버스/Mermaid 전환만 보이고, 그래프/UML 없음. 전환 시 상태 보존.

### US3 - 탭 전환 일관성 (P2)
좌측 레일에서 「코드 그래프」↔「데이터 스키마」를 오가며, 각 탭이 자기 화면만 깔끔히 보여준다.
- **Test**: 두 탭이 별개 항목으로 뜨고, 각자 적절한 좌측 패널(Navigator vs 테이블목록)을 가진다.

### Edge Cases
- UML 제거 후 `VueFlowClassDiagram`·`classDiagram.ts`를 **타 탭/기능이 import하는지** 확인 → 쓰면 유지, 안 쓰면 폐기(데드 금지).
- 임베드 호스트(architect): 신규 `schema` 탭이 `EMBEDDED_FEATURES`(embeddable 필터)에 자동 포함되는지, 호스트가 임베드 탭 수를 하드코딩하지 않는지 확인.
- 진행 패널(FloatingProgressPanel)이 두 탭 어디서 뜨고 무엇을 덮는지 — 분리 후 가림 재확인.
- 기존 `session.activeTab='graph'` 라우팅·복원에 신규 `schema` 추가 영향.

## Requirements *(mandatory)*

- **FR-001**: 「코드 그래프」 탭은 NvlGraph 지식그래프 전용으로, UML·스키마 뷰와 내부 뷰스위처를 포함하지 않는다.
- **FR-002**: 「코드 그래프」 툴바는 물리/논리명·모듈간 상호작용·영역 보기·건강 보기·테이블 전체만 둔다.
- **FR-003**: 신규 「데이터 스키마」 탭(`id:'schema'`, embeddable)은 SchemaView(캔버스/Mermaid 전환) + 테이블 목록을 담는다.
- **FR-004**: UML 뷰와 UML 전용 코드(컴포넌트·컨트롤·`showUmlTab`·`umlDepth`·뷰스위처 UML 버튼)를 제거한다. 공용 유틸은 타 사용처 확인 후 유지/폐기.
- **FR-005**: Navigator는 「코드 그래프」 탭에서 표시한다(`activeTab==='graph'`). 「데이터 스키마」는 자체 테이블 목록을 좌측에 둔다.
- **FR-006**: 백엔드 계약(분석 스트림·스키마 API)·데이터는 **불변**. 이 변경은 순수 프론트 UI 재구성이다.
- **FR-007**: 임베드(host) 노출은 `embeddable` SSoT(features.ts)로만 파생되어야 하며, 호스트 측 하드코딩 없이 신규 탭이 노출돼야 한다.

## 영향 범위 (Blast Radius — 착수 전 확정, file:line)

| 파일 | 변경 | 비고 |
|---|---|---|
| `src/shared/config/features.ts` | `graph` label→'코드 그래프'; 신규 `schema`(데이터 스키마, embeddable, IconTable) 추가 | SSoT |
| `src/features/code-analysis/components/graph/GraphTab.vue` | UML 제거(import·showUmlTab·umlDepth·핸들러·UML버튼·UML컨테이너·UML컨트롤); 뷰스위처·스키마 하위 스위처·SchemaView 제거 → **Graph 전용** | 핵심·고위험 |
| `src/features/.../SchemaTab.vue` (신규) | GraphTab에서 추출한 스키마 부분(SchemaView·캔버스/Mermaid 스위처·테이블 목록) | 추출 정확도 관건 |
| `src/layouts/MainLayout.vue` | `showNavigator` 조건에서 `graphActiveView` 제거 → `activeTab==='graph'` | navigator 일관성 |
| `src/shared/stores/navigator.ts` | `activeView` 개념(뷰스위처용) 제거 또는 무해화 | 데드 정리 |
| `specs/001`, `specs/002` | 본 결과로 정합(코드그래프 / 데이터스키마) | 문서 |
| robo-architect host | 임베드 탭 목록이 `EMBEDDED_FEATURES` 파생인지 확인(하드코딩이면 호스트 수정) | **확인 필요** |

## Success Criteria *(mandatory)*
- **SC-001**: 좌측 레일에 「코드 그래프」와 「데이터 스키마」가 별개 항목으로 뜬다.
- **SC-002**: 「코드 그래프」엔 그래프+Navigator+5툴바만, 「데이터 스키마」엔 테이블목록+캔버스/Mermaid만 보인다(UML·뷰스위처 없음).
- **SC-003**: 각 탭의 기존 기능(드래그 확장·프리셋·영역/건강/테이블·ER 편집·관계관리)이 분리 전과 동일하게 동작(회귀 0).
- **SC-004**: 백엔드 호출·데이터 산출물 불변.

## 사실 확정 결과 (2026-06-17, 코드 확인 완료)
1. ✅ 스키마 "테이블 목록"은 GraphTab에 **없음** — `SchemaView`(→SchemaCanvas) 안에 자급. GraphTab은 `<SchemaView :mode="schemaMode"/>`(676)만 렌더 → **SchemaView만 새 SchemaTab으로 옮기면 됨**(추출 깔끔).
2. ✅ `VueFlowClassDiagram`·`classDiagram.ts`는 **GraphTab의 UML 부분 전용**(GraphTab가 getClassName/getDirectory/CLASS_LABELS를 UML 검색·노드표시에 사용: 287·357·358·807). UML 제거 시 **둘 다 데드 → 통째 폐기** 가능(타 탭 사용 없음).
3. ✅ 임베드 탭은 `EMBEDDED_FEATURES`(embeddable 필터) **파생**(SideNav.vue:31) → 신규 `schema` embeddable 추가하면 **호스트 무수정 자동 노출**.
4. ✅ `activeView`/`graphActiveView` 소비처 = GraphTab(스위처 47-48) · MainLayout(showNavigator 20·24) · SideNav(Navigator 토글 게이트 24·97) · navigator.ts(setActiveView 355·415). 분리 후 그래프탭은 항상 그래프 → `activeTab==='graph' && graphActiveView==='graph'` 를 **`activeTab==='graph'`로 치환**하고 activeView 개념 제거.

## Plan (구현 순서)
1. features.ts: `graph` label→'코드 그래프'; 신규 `schema`(데이터 스키마, embeddable, IconTable, →SchemaTab).
2. 신규 `SchemaTab.vue`: 자체 `schemaMode` + 캔버스/Mermaid 스위처 + `<SchemaView :mode/>`.
3. GraphTab: UML 전부 제거 + 뷰스위처·스키마 하위 스위처·SchemaView 제거 → **Graph 전용**. 그래프 툴바(물리명·모듈간·영역·건강·테이블)는 유지.
4. MainLayout(showNavigator)·SideNav(97) `graphActiveView` 제거→`activeTab==='graph'`. navigator.ts `activeView` 데드 정리.
5. classDiagram.ts·VueFlowClassDiagram.vue 폐기.
6. 빌드 → 런타임 검증(두 탭·UML없음·기능 회귀0).
