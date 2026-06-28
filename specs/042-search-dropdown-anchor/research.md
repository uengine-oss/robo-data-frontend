# Research: 노드 검색 결과 위치 교정

**Feature**: 042-search-dropdown-anchor | **Date**: 2026-06-28

## 조사 대상 (NEEDS CLARIFICATION 없음 — 현행 코드 사실 확인)

### 현재 마크업/CSS 구조 (NodeDetailPanel.vue, 직접 확인)

`.search-section` (`position: relative`) 안에 세 블록이 순서대로 있다:

1. `.search-input-wrapper` (`position: relative; display:flex`) — 검색 input + 클리어 버튼(✕, `position:absolute`)
2. `.search-results-dropdown` (`position: absolute; top:100%; left:0; right:0; z-index:9999`) — `v-if="showSearchResults"`
3. `.reset-graph-btn` (일반 흐름, `margin-top:12px`, `width:100%`) — `v-if="hasGraph"`, "🔄 캔버스 비우기"

`.search-results-dropdown`의 `top:100%`는 **가장 가까운 positioned 조상 = `.search-section`** 에 대해 해석된다. `.search-section`의 높이 = 입력칸 + 12px + 캔버스비우기 버튼 + 패딩이므로, 드롭다운은 **버튼 아래(섹션 바닥)** 에 뜬다. 결과적으로 시각 스택은 입력칸 → 캔버스비우기 버튼 → 검색결과 순(스크린샷과 일치).

## Decision: 드롭다운을 입력칸(`.search-input-wrapper`)에 앵커

- **결정**: `.search-results-dropdown` 요소를 `.search-section`의 자식에서 `.search-input-wrapper`의 자식(클리어 버튼 다음)으로 이동. `.search-input-wrapper`가 이미 `position: relative`이므로 `top:100%`가 **입력칸 바로 아래**로 해석된다. 더는 앵커 기준이 아닌 `.search-section { position: relative }`는 제거.
- **Rationale**:
  - 드롭다운은 의미상 "입력칸에 속한" 결과다. 입력칸이 아니라 섹션에 앵커돼 있던 것이 곧 버그의 근본(잘못된 기준점). 기준점만 바로잡으면 결과가 입력칸 직하에 뜨고, 기존 `z-index:9999`로 검색 중 버튼을 자연히 덮어 클릭 경로에서 사라진다.
  - **새 분기·플래그·상태·조건부 숨김 로직 0**. CSS 규칙 추가 0(드롭다운 규칙 불변, 부모만 바뀜). 오히려 죽은 `position:relative` 1줄 제거 → 코드가 줄어드는 구조 정리([[principles]] 근본수정 정의 부합).
  - 버튼·검색 입력 모두 노드 패널(Overview) 안에 그대로(FR-003).
- **Alternatives considered**:
  - **검색 중 버튼 v-if 숨김**: 조건분기 1개 추가 = 땜빵. 위치(기준점)라는 근본을 안 고치고 증상만 가림. 기각.
  - **버튼을 패널 하단으로 이동**: 마크업 재배치 폭 큼 + 동선상 분리는 되나 "왜 결과가 섹션 바닥에 뜨나"라는 근본 원인은 그대로 남음. 기각(사용자도 입력칸 앵커 채택).

## 회귀 점검 포인트 (구현 시 확인)

- `.search-input-wrapper`는 `display:flex; align-items:center` — 드롭다운은 `position:absolute`라 flex 흐름에서 빠져 입력 행 레이아웃을 흔들지 않음(클리어 ✕ 버튼도 이미 absolute, 동일 패턴).
- `.search-no-results`("검색 결과가 없습니다") 도 같은 드롭다운 내부라 함께 입력칸 직하로 이동(FR edge case 충족).
- `.search-section`의 `position: relative` 제거 후, 그 섹션을 기준으로 앵커되는 다른 absolute 자식이 없는지 확인(현재 드롭다운이 유일 → 제거 안전).
- `.reset-graph-btn` 표시 조건(`v-if="hasGraph"`)·클릭(`emit('reset-graph')`)·스타일 불변(FR-004).
