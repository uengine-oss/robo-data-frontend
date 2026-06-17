# Feature Specification: Navigator 트리 가독성·조작성 개선 (상태점 크기 · 펼침버튼 클릭영역 · 모두 펼치기/접기)

**Feature Branch**: `017-navigator-tree-ux`

**Created**: 2026-06-17

**Status**: Draft (합의 전 — 코드 착수 금지)

**Input**: 사용자 피드백(스크린샷, MODULES 트리) — ① "초록색 동그라미가 너무 큼 → 약간 줄여(너무 줄이지는 말고)" ② "펼치기/닫기 버튼이 너무 작아 클릭이 힘들다 → 약간 늘려" ③ "전부 펼치고 접기 같은 것도 있어야 할 것 같다."

> 대상 = 코드 그래프 탭 좌측 **Navigator 패널**(features.ts `id:'graph'`). spec [001-code-analysis](../001-code-analysis/spec.md)·[016-graph-exploration-ux](../016-graph-exploration-ux/spec.md)(Navigator 토글/레이아웃)와 **같은 파일을 건드리므로** 순서·정합 주의(아래 Edge). 순수 프론트 UI — 백엔드 계약 무관.

## 사실 확정 (2026-06-17, 코드 확인 — 추측 아님)

- **초록 동그라미의 의미**: 분석 상태 표시가 **아님**. `NavigatorTreeNode.vue`의 `.nav-tree-label.on-canvas::after { content:'●' }` = **"이 노드가 그래프 캔버스에 올라가 있음" 표시**(`isOnCanvas` = `canvasStore.canvasNodeIds.has(id)`). 현재 `font-size:10px`, `color:var(--color-success,#40c057)`, 행 전체 `opacity:0.55`. `.name`이 `flex:1` 말줄임이라 ● 가 우측 끝에 붙어 보인다.
- **펼침 버튼**: `<span class="chevron" @click.stop="onToggle">▾/▸</span>`. CSS `.chevron { width:10px; font-size:9px }` → 클릭 타깃이 ~10px로 매우 작다. 행 클릭(`onSelect`)과 셰브론 클릭(`onToggle`, stopPropagation)이 분리돼 있어, 셰브론 영역만 키우면 선택 동작은 그대로 유지된다.
- **모두 펼치기/접기**: 스토어에 **둘 다 이미 존재·export됨** — `expandAll()`(navigator.ts:391, `collapsedNodes` 비움) / `collapseAll()`(navigator.ts:374, 전체 id 추가). 하지만 `NavigatorPanel.vue` 헤더에는 **"모두 접기"(⇱) 버튼만** 있고(line 71) **"모두 펼치기" 버튼이 없다**. → 신규 액션 불필요, **버튼 1개만 추가**.

## 결정된 설계 (단일 진실)

1. **상태점 축소(약간)**: `.on-canvas::after` `font-size: 10px → 8px`. 색·위치·의미 불변. (더 줄이면 보이지 않으므로 8px에서 멈춤.)
2. **펼침 버튼 클릭영역 확대**: `.chevron`을 ~10px → **~18px 정사각 히트박스**(`width:18px; height:18px; line-height:18px; font-size:11~12px; border-radius:3px`) + **hover 배경**(`--color-bg-hover`)으로 클릭 가능함을 시각화. 글자 화살표 자체는 과대해지지 않게 조절. 자식 없는 노드의 셰브론 칸은 정렬용 빈 칸으로 동일 폭 유지.
3. **"모두 펼치기" 버튼 추가**: `NavigatorPanel.vue` `.nav-actions`에 "모두 접기"(⇱) **앞**에 "모두 펼치기" 버튼(아이콘 ⇲, `title="모두 펼치기"`, `@click="navigatorStore.expandAll()"`) 추가. 두 버튼이 펼치기↔접기 쌍으로 나란히.

## User Scenarios & Testing *(mandatory)*

### US1 - 상태점 가독성 (P2)
캔버스에 올라간 모듈 옆 초록 점이 **과하지 않게** 보인다(여전히 식별 가능, 행을 압도하지 않음).
- **Test**: 캔버스에 올린 노드 행에 8px 초록 ● 가 우측에 표시. 안 올린 노드엔 없음.

### US2 - 펼침 버튼 클릭 (P1)
사용자가 셰브론(▸/▾)을 **편하게 클릭**해 하위 트리를 펼치고 접는다.
- **Test**: 셰브론 영역(≈18px) 어디를 눌러도 토글되고 hover 시 배경이 비친다. 셰브론 밖(이름) 클릭은 여전히 **선택**(토글 아님).

### US3 - 모두 펼치기/접기 (P1)
헤더의 두 버튼으로 트리 전체를 한 번에 펼치거나 접는다.
- **Test**: "모두 펼치기" 클릭 → 모든 모듈/함수 펼쳐짐(`collapsedNodes` 빔). "모두 접기" 클릭 → 전체 접힘. 두 버튼이 나란히 보인다.

### Edge Cases
- ★**016/015와 파일 충돌 — 사실확인 결과 거의 없음(2026-06-17)**: 015 영향파일=features.ts/GraphTab/SchemaTab/MainLayout/SideNav/navigator.ts, 016 영향파일=NodeDetailPanel/GraphTab/SchemaTab/SchemaView/MainLayout/SideNav. **둘 다 `NavigatorTreeNode.vue`를 안 건드리고**, `NavigatorPanel.vue`도 양쪽 영향범위표에 없다(016의 Navigator 토글은 MainLayout/SideNav 레벨). → 017은 사실상 **독립·저위험**. **결정: 017을 독립 유지 + 가장 먼저 처리**, 016이 나중에 Navigator 토글 작업 시 본 변경을 포함/정합한다.
- 자식 없는 노드: 셰브론 칸 빈 채 폭만 유지(들여쓰기 정렬 깨지지 않게).
- 셰브론 확대로 badge/name가 우측으로 ~8px 밀림 — 좁은 패널(min 220px)에서 말줄임 동작 재확인.
- 모두 펼치기/접기는 `collapsedNodes`만 조작 — 섹션(MODULES/TABLES) 접힘(`expandedSections`)·패널 열림(`isPanelOpen`)과 무관함 확인.

## Requirements *(mandatory)*

- **FR-001**: 캔버스-탑재 상태점(`.on-canvas::after`)을 8px로 축소한다(색·위치·의미 불변).
- **FR-002**: 펼침 셰브론의 클릭 히트박스를 ~18px로 확대하고 hover 어포던스를 준다. 셰브론 클릭=토글, 행(이름) 클릭=선택의 분리는 유지한다.
- **FR-003**: Navigator 헤더에 "모두 펼치기" 버튼을 추가해 기존 `expandAll()`을 호출한다(신규 스토어 액션 없음). 기존 "모두 접기"와 쌍으로 배치.
- **FR-004**: 백엔드 계약·데이터·분석 파이프라인 무영향(순수 프론트 CSS/마크업/기존 액션 와이어링).
- **FR-005**(신규, 2026-06-17 사용자): 트리 **계층 들여쓰기**를 살짝 좁힌다. ✅구현: `NavigatorTreeNode.vue:79` `8+depth*14` → `8+depth*12`.
- **FR-006**(신규, 2026-06-17 사용자): ⒜ **모두 펼치기/접기 아이콘을 명확히 반대되는 쌍**으로(기존 ⮃/⇱ 헷갈림). ✅구현: `NavigatorPanel.vue` ⮃→**⊞**(펼치기)·⇱→**⊟**(접기). ⒝ 개별 노드 **셰브론 살짝 더 크게**. ✅구현: `NavigatorTreeNode.vue` `.chevron` 18→**20px**, font 12→13.

## 영향 범위 (Blast Radius — file:line, 착수 전 확정)

| 파일 | 변경 | 비고 |
|---|---|---|
| `src/features/code-analysis/components/graph/NavigatorTreeNode.vue` | `.on-canvas::after font-size 10→8`(146); `.chevron` 히트박스 확대+hover(162-169) | CSS만, 로직 불변 |
| `src/features/code-analysis/components/graph/NavigatorPanel.vue` | `.nav-actions`(69-73)에 "모두 펼치기"(⇲, `expandAll()`) 버튼 추가 | 마크업 1줄 + 기존 액션 |
| `src/shared/stores/navigator.ts` | **변경 없음** — `expandAll()`(391)/`collapseAll()`(374) 이미 존재·export | 확인용 |
| specs 016 | Navigator 토글/레이아웃과 파일 겹침 — 순서·흡수 여부 합의 | **정합 필요** |

## Success Criteria *(mandatory)*
- **SC-001**: 초록 상태점이 작아지되 여전히 식별 가능(8px).
- **SC-002**: 셰브론을 쉽게 클릭해 펼침/접힘이 동작하고, 이름 클릭 선택 동작은 회귀 없음.
- **SC-003**: "모두 펼치기"·"모두 접기" 두 버튼이 트리 전체를 즉시 펼치고 접는다.
- **SC-004**: 백엔드 호출·산출물 불변. 016/015와의 충돌로 인한 회귀 0.

## Plan (구현 순서 — 스펙 합의 후 착수)
1. ✅ (결정 완료) 017 독립 유지 + 015/016보다 먼저. 충돌 거의 없음(위 Edge).
2. NavigatorTreeNode.vue: 상태점 8px + 셰브론 히트박스 확대(CSS only).
3. NavigatorPanel.vue: "모두 펼치기" 버튼 추가(expandAll 연결).
4. `npx vite build`(npm run build는 vue-tsc 게이트) → 런타임 GUI 검증(상태점·셰브론·두 버튼·선택 회귀0).

---

# ★ 전략/구조 인지 트리 설계 확정 (2026-06-17 합의 — 전수조사 근거)

## 배경 (코드 확정)
DBMS와 Framework는 **자식 AST 구조가 다름**(analyzer 단일 스키마, 두 방식). Framework: 모듈(클래스/파일)→메서드(잎). DBMS: 파일(MODULE)→프로시저/함수/트리거(호출단위)→**중첩 구문(SELECT/IF/UPDATE…, PARENT_OF)**. 구문도 `FUNCTION` 라벨이라 현재 전부 'F'로 떠 함수처럼 보이는 게 문제. (판정: `own_ast_type`/`parent_id`/전략 — 데이터에 이미 있음, 백엔드 무변경. 상세 사실=016.)

## 결정
- **FR-101 트리=AST 그대로**: DBMS는 프로시저→중첩 구문을 **원래 AST 구조대로** 펼침(PARENT_OF 순회). Framework는 현행(모듈→메서드). → 분석가가 제어흐름을 트리로 탐색. (017의 모두 펼치기/접기가 여기 유용.)
- **FR-102 노드 이름 = `라벨[시작라인]`**: 구문 노드는 `SELECT [123]`·`IF [145]` 형식(이름 없으니). → 같은 SELECT 다수도 라인으로 구분(이름 중복 완화). 호출단위/Framework는 실제 이름(논리명 토글 유지).
- **FR-103 배지 = 타입 앞글자(이모지 X, Framework처럼)**: DBMS 구문은 `own_ast_type` 첫 글자(S/I/U/R/L/M…), 호출단위=F, 컨테이너=P/M. Framework 경로 무변경(회귀0). 읽기/쓰기/흐름 색 구분은 옵션.
- **FR-104 판정 단일화**: 트리·배지·이름·패널이 같은 **nodeClassify 판정처(016 아키텍처)**를 공유 — strategy 조건문 산발 금지(유지보수·DRY).

## Blast Radius (착수 전, file:line)
| 파일 | 변경 |
|---|---|
| `NavigatorTreeNode.vue` | badgeChar/badgeClass에 DBMS 구문 분기(own_ast_type 첫 글자) + 이름 `라벨[라인]`. Framework 경로 무변경 |
| `navigator.ts` buildModulesTree | DBMS 구문 자식을 AST대로(PARENT_OF) 노출하도록 CHILD_REL 정합(현 HAS_FUNCTION flat → AST 중첩 확인 후) |
| `node-detail/nodeClassify.ts`(신규, 016) | 트리·배지·패널 공유 판정 단일처 |

## Success Criteria 추가
- **SC-101**: DBMS 트리가 프로시저→구문 AST 구조대로 보이고, 구문은 `라벨[라인]`+앞글자 배지(F 아님).
- **SC-102**: Framework 트리·배지 회귀 0.
- **SC-103**: 트리·배지·이름·패널이 단일 판정처를 공유(산발 분기 0).

## ~~★검증된 데이터 계약 (2026-06-17 초안)~~ → ★★근본 전환으로 대체(아래)
> 아래 옛 블록은 **프론트가 function_id/signature를 파싱**하는 접근(ownAstType·dbmsRoutineName이 function_id·signature 사용)이었다. 이게 반복 실패·'F'배지·오해의 근본 원인 → **폐기**. analyzer가 깨끗한 속성을 저장하는 [analyzer/016-node-display-properties](../../../robo-data-analyzer/specs/016-node-display-properties/spec.md)로 전환, 프론트는 직독한다.

<details><summary>(폐기된 옛 파싱 계약 — 이력 보존)</summary>

- 프론트 `GraphNode.id` = Neo4j elementId. `properties.function_id` = DBMS `{parent_id}:{TYPE}:{line}`. own_ast_type = function_id에서 parent_id 떼고 첫 세그먼트. 콜러블 이름 = function_id 2번째 세그먼트(파싱). → ownAstType/dbmsRoutineName이 function_id/signature 사용.
</details>

## ★★ 근본 전환 — 라벨·속성 직독 (2026-06-17 확정, analyzer 016 의존)
- **식별 = elementId 단일**(GraphNode.id). function_id·parent_id·fqn는 **표시·트리 도출에 안 씀**.
- **표시 타입 = primary 라벨 직독**: analyzer 016이 **DBMS 노드를 antlr type으로 라벨링**(`:SELECT`/`:PROCEDURE`/`:IF`…, 더 이상 `:FUNCTION` 뭉개기 아님). 프론트 기존 `pickDisplayLabel`(역할라벨 제외 구체라벨)이 DBMS·Framework 둘 다 자동 처리 → 'F' 대신 SELECT/PROCEDURE. 배지 = 타입 라벨 앞글자(S/I/U/P/T…). `ast_type` 속성 없음(라벨이 타입). signature/function_id 파싱 금지.
- **표시 이름 = `properties.name` 직독**(콜러블=루틴명). 구문(name 빈값)은 `${타입라벨} [${start_line}]`. 논리명 토글 시 `logical_name`. `dbmsRoutineName`(signature DDL 정규식)·`ownAstType`(signature/function_id 파싱) **삭제**.
- **트리 중첩 = PARENT_OF 엣지**로(parent_id 속성 파싱 아님). `start_line` 정렬 유지.
- **FR-102 대체**: 구문 이름 = `타입라벨[start_line]`, 콜러블 = `properties.name`.
- **FR-103 대체**: 배지 = primary 라벨 앞글자(파싱·속성 아님). Framework 경로 무변경(회귀0).
- **FR-104 유지**: 트리·배지·이름·패널이 단일 판정처(nodeClassify) 공유 — nodeClassify는 **파싱이 아니라 node.labels(타입라벨)·properties.name을 읽는** 판정처로 탈바꿈.
- **선행 의존**: analyzer 016(DBMS 라벨=antlr type) 구현·재분석 후 전환. 옛 `:FUNCTION` 데이터엔 폴백 안전 렌더.
