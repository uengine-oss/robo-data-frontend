# Tasks: 그래프 탐색 UX 재설계

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | 레포: frontend(`main`)

경로 약어: `F/` = `robo-data-frontend/src/`

---

## Phase 1: US1 — 보기·필터·isolate 3축 (P1, MVP) 🎯

**Goal**: 오버뷰 칩=isolate(빈캔버스도 로드), 관계 끄고켜기 신설, 필터 ▾(노드·관계 다중토글), relFilter 이동. "빈화면 혼란" 제거.

- [ ] T101 [US1] `F/features/code-analysis/graphCanvas.ts` — isolate 동작: 오버뷰 노드칩 클릭 시 `loadNodesByLabels([label])`로 그 종류를 캔버스에 로드(빈캔버스도). 기존 "필터(빼기)" 의미 제거.
- [ ] T102 [US1] `F/features/code-analysis/components/graph/NvlGraph.vue` — `relFilter` prop을 **단일→다중 집합**(여러 관계 동시) 소비로 일반화. `labelFilters`도 동일 확인.
- [ ] T103 [US1] `F/features/code-analysis/components/graph/GraphTab.vue` — ★**필터 ▾** 드롭다운 신설(보기 ▾ 옆): 노드 종류 + 관계 종류 다중 체크 토글. `relTypeFilter`/`nodeTypeFilter` 상태 추가. 보기모드와 직교 적용.
- [ ] T104 [US1] `F/.../GraphTab.vue` — 기존 보기 ▾의 읽기만/쓰기만(relFilter)을 **필터 ▾(관계)로 이동**, 보기 ▾는 보기모드 프리셋 전용으로 정리.
- [ ] T105 [US1] `F/.../NodeDetailPanel.vue` — 오버뷰 **노드칩 클릭 = isolate**(emit), **관계칩 클릭 = relTypeFilter 토글**(현재 색편집과 분리 — 색편집은 다른 트리거로/보조). 활성표시 동기화.
- [ ] T106 [US1] 검증 — 빈캔버스서 노드칩→로드, 관계 끄고켜기, 보기+필터 동시. Playwright 스샷 + 회귀(드래그-드롭) 확인. 커밋.

**Checkpoint**: 혼란 제거 MVP 동작 → 커밋.

---

## Phase 2: US2 — 영역(구조) 신설 + 협력군집 개명 (P2)

- [ ] T201 [US2] `F/.../graphCanvas.ts` + `useGroupHulls.ts` — **영역(구조)** 보기: groupBy=file/module(파일/모듈 단위), 영역 이름=파일/모듈명. 모든 노드 소속 보장.
- [ ] T202 [US2] `F/.../GraphTab.vue` — 보기 메뉴: 옛 "영역"(CALL군집) → **"협력 군집"** 개명, **"영역(구조)"** 신규 항목.
- [ ] T203 [US2] 협력군집 빈약 안내(D1) — clusters 소수/0이면 hint("내부 호출 N개라 군집 작음"). 검증 + 커밋.

---

## Phase 3: US3 — 모듈간 CALL + 건강 R/W (P3)

- [ ] T301 [US3] `F/.../graphCanvas.ts` — 모듈간: resolveModule을 CALLS에도 적용 → **모듈↔모듈 가상링크** 합성(기존 모듈↔테이블과 함께).
- [ ] T302 [US3] `F/.../graphCanvas.ts`(ensureNodesForView) — 건강: 루틴 + **그 루틴의 테이블(R/W) 같이 로드** → 외딴섬 감소. 검증 + 커밋.

---

## Phase 4: US4 — 콘솔 친화 (P4)

- [ ] T401 [US4] `F/.../analyzer.ts` + 콘솔 컴포넌트 — 사람말 메시지·진행감, 기술용어 숨김. 검증 + 커밋.

---

## Phase 5: US5 — 테이블 흐름 + 데이터부족 안내 (P5, 옵션)

- [ ] T501 [US5] `F/.../graphCanvas.ts` — 테이블흐름 보기(테이블+DML+R/W). 데이터부족 일반 안내. 검증 + 커밋.

---

## 의존·순서
```
US1(T101~106) MVP  → US2 → US3 → US4 → US5
각 US 완료 = 라이브검증 + 증분 커밋(미커밋 더미 0)
```
- T101·T102는 독립[P], T103~105는 GraphTab/패널 연쇄(순차).
- 회귀 항상 확인: 드래그-드롭·1-hop·스트림·색상크래시0.
