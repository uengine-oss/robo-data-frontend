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
