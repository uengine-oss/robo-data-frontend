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

## Phase 4: US4 — 콘솔 친화 (P4) ★진행 중

**근본**: step6 processing_event가 전량 `sub_action` → 프론트가 전량 폐기 → step6 콘솔 무음. 이 죽은 핸들러를 살려 친절한 진행감으로.

- [ ] T401 [US4] `F/.../analyzer.ts` — **친화 문구 사전화**: 생명주기 하드코딩 문구(업로드/파싱/분석 시작·완료) → 매우 친절·안심 톤으로 전면 교체. 전략 무관(generic).
- [ ] T402 [US4] `F/.../analyzer.ts` `applyProcessingEvent` **근본수정**: step6 진행을 콘솔에 흘리되 **entity_id 단위 dedup + throttle**(K건마다 1줄 집계, 플러드 금지). 원시 ID 노출 금지. "코드 N개 이해 중" 류 진행감.
- [ ] T403 [US4] `F/.../analyzer.ts` — **무음구간 안심 메시지**: 오래 걸리는 단계 진입/지속 시 "차근차근 진행 중이에요" 류 안심 1줄(중복 억제). step6 무음 0 보장.
- [ ] T404 [US4] 검증 — 타입체크 + **콘솔 라이브 스모크**(합성 NDJSON 이벤트로 store 구동→콘솔 스샷, 재분석 없이). framework·dbms 동일성은 generic 설계로 보장(코드 논증). 커밋.

---

## Phase 5: US5 — 테이블 흐름 + 데이터부족 안내 (P5) ★FR-010 빈틈 메우기

- [ ] T501 [US5] `F/.../GraphTab.vue` `applyViewMode` — **모듈간·건강·테이블흐름 빈 결과 사유 안내**(현재 `autoPopulateHint=''`로 침묵). 프리셋 적용 후 캔버스 결과 0이면 보기별 사유 힌트 세팅(전략·DDL 무관, 데이터 유무로만). 영역/협력군집 안내와 일관된 오버레이 재사용.
- [ ] T502 [US5] 검증 — 데이터 있는 보기는 정상 표시(안내 안 가림), 빈 보기는 사유 표시. 타입체크 + 스모크. 커밋.
- (참고) 테이블흐름 보기 자체(테이블+DML+R/W)는 US5 기구현(`loadTableFlow`). 본 Phase는 **빈 결과 안내**가 핵심.

---

## 의존·순서
```
US1(T101~106) MVP  → US2 → US3 → US4 → US5
각 US 완료 = 라이브검증 + 증분 커밋(미커밋 더미 0)
```
- T101·T102는 독립[P], T103~105는 GraphTab/패널 연쇄(순차).
- 회귀 항상 확인: 드래그-드롭·1-hop·스트림·색상크래시0.
