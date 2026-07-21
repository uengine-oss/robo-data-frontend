# Tasks: 응집도·결합도 그래프 보기

**Input**: `specs/059-cohesion-coupling-view/` (spec, plan, research, data-model, contracts, quickstart)

**Format**: `[ID] [P?] [Story] 설명 + 파일경로` · **[P]** = 다른 파일이라 병렬 가능

**공통 게이트(모든 태스크 완료 시 확인)**: 057·058 점유 파일(`package.json`, `analyzer.ts`,
`graphVisibility.ts`, `panelGraphProjection.ts`, `scripts/`, `tests/`, `tsconfig.panel-projection.json`)에
변경 0. `graphCanvas.ts`는 plan에 명시한 3지점 외 변경 0.

---

## Phase 1: Foundational (선행)

- [x] T001 [P] `src/features/code-analysis/areaGraph.ts` 신설 — 타입 전용 import 만 쓰고
      `buildCohesionGraph`·`UNASSIGNED_AREA` 를 계약대로 export. 증거: `node
      specs/059-cohesion-coupling-view/contracts/test-area-graph.mjs` 가 N1~N12 통과
- [x] T002 [P] `npx tsc -p specs/059-cohesion-coupling-view/tsconfig.json` strict 통과. 증거: 종료코드 0

---

## Phase 2: US4 색 (P2) — 다른 슬라이스와 파일이 겹쳐 먼저 처리

- [x] T003 [P] [US4] `src/shared/utils/nodeLabels.ts` — `rolesOf` 삭제, `colorLabelOf` 가
      `semanticRoleLabels` 를 쓰도록 수정(B1). 증거: `grep -rn "rolesOf" src/` 결과 0
- [x] T004 [US4] `src/shared/config/graphStyles.ts` — 관계 색을 `(종류, 영역통과)` 2축으로.
      쓰기 `#E5484D`/읽기 `#F5A524`/호출 `#4EA8DE`, 영역 내부는 같은 색상 저채도.
      `getRelationshipColor(type, crossesArea?)` 로 확장(두 번째 인자 선택적 → 기존 6개 소비처 무변경)
- [x] T005 [US4] `graphStyles.ts` — 관계 표시명(`쓰기`/`읽기`/`호출`) 변환 추가. 표에 없는 타입은
      원래 이름 유지(조용히 사라지지 않게)
- [x] T006 [US4] `graphStyles.ts` `distinctColorForLabel` — 관계 3색과 충돌하는 hue 구역을 배정에서
      제외. 증거: 라벨 20종 생성 시 관계 색과의 최소 hue 거리 검사
- [x] T007 [US4] `src/features/code-analysis/components/graph/NvlGraph.vue` — 관계 렌더에 영역통과
      여부 전달, 캡션을 표시명으로 교체
- [ ] T008 [US4] `src/features/code-analysis/components/graph/useGroupHulls.ts:273` — 교차 엣지 색에
      영역통과 여부 반영
- [ ] T009 [US4] 검증: 역할 칩 선택 시 캔버스·상세 패널 색 변경 캡처(SC-005), 범례·통계·패널 색 일치

---

## Phase 3: 삭제(건강) + 개명(협력 군집 → 실제 업무 단위) — research R4 목록 전수

- [x] T010 `GraphTab.vue` — 보기 모드를 **2종**으로: `'module'`(모듈간 상호작용, 059 로 동작 교체)
      + `'area'`(**'실제 업무 단위'** 로 개명). 사용자 정정(2026-07-21): 협력 군집은 삭제가 아니라 개명이다
- [x] T011 `GraphTab.vue` — 건강 관련 `colorMode` computed, `applyViewMode` 의 `health` 분기,
      힌트 문구, 프리셋 해제 감시, 템플릿 버튼·prop 삭제
- [x] T012 `NvlGraph.vue` — `colorMode` prop·기본값·`HEALTH_COLORS`·`HEALTH_NEUTRAL`·
      `resolveNodeColor` 의 health 분기·watch 삭제(B2)
- [x] T013 `graphCanvas.ts` — `CanvasPreset` 에서 `'health-rw'` 제거, `buildHealthGraph`·
      `makeRoutineResolver` 삭제, `canvasGraphData` 의 health 분기 삭제. **057 hunk 미접촉 확인**
- [x] T014 증거: `grep -rn "component_id\|component_name" src/` 0,
      `grep -rn "health-rw\|colorMode\|HEALTH_COLORS" src/` 0.
      단 `analyzer.ts` 의 `health_metrics_step`(분석 단계명)은 삭제 대상 아님

---

## Phase 4: US1·US2 영역 간 관계 (P1) — MVP

- [x] T015 [US1] `graphCanvas.ts` — `CanvasPreset` 에 `'area-relation'` 추가하고 **'모듈간 상호작용'
      보기가 이 프리셋을 쓰도록 교체**. `canvasGraphData` 가 `buildCohesionGraph` 결과를 반환
      (라벨 집합은 `nodeClassify` 에서 주입 — 사본 0)
- [x] T016 [US1] 펼침 상태(`expandedAreaIds`/`expandedModuleIds`/`expandedRoutineId`)를 캔버스
      스토어에 추가. `expandedRoutineId` 는 단수
- [x] T017 [US1] `GraphTab.vue` — 보기 모드 진입 시 프리셋 연결 + 영역 0~1개일 때 사유 표시(FR-004)
- [x] T018 [US1] `NvlGraph.vue` — 영역 간 선 굵기를 `AreaEdge.count` 로, 건수 확인 수단 제공(FR-003)
- [ ] T019 [US2] 영역 간 선 선택 시 원인(`viaTables`/`viaRoutines`) 표시(FR-007)
- [ ] T020 [US1][US2] 검증: SC-001(같은 영역 선 0), SC-004(따로 그려진 테이블 0, 미사용 0),
      실측 정답지(주인 있음 20 / 없음 2) 대조

---

## Phase 5: US3 드릴다운 (P2)

- [x] T021 [US3] `GraphTab.vue` 의 `handleNodeExpand` 를 1-hop 확장에서 **층 한 단계 펼치기**로 교체
- [x] T022 [US3] 새 루틴 펼칠 때 이전 루틴 자동 접기(FR-011), 전역 펼치기 수단 없음(FR-012)
- [x] T023 [US3] 빈 층 자동 생략(FR-014) — `areaGraph.ts` 에서 처리하고 컴포넌트는 결과만 소비
- [ ] T024 [US3] 검증: FR-009~014 시나리오 캡처, 루틴 펼쳐도 구문 노드 0(FR-013)

---

## Phase 6: US5 발견된 문제 (P3)

- [ ] T025 [US5] `GraphTab.vue` 개요에 "발견된 문제" 목록 — 순환 포함 루틴(`in_call_cycle`),
      위험 루틴(`risk_level`), 주인 아닌 영역이 쓰는 테이블(화면 계산)
- [ ] T026 [US5] 항목 선택 시 해당 대상만 캔버스 투영(FR-023). 기존 칩 로드 기계 재사용
- [ ] T027 [US5] 0건과 "정보 없음"을 구분 표시(FR-024)
- [ ] T028 [US5] 검증: 목록 개수와 그래프 실제 값 대조

---

## Phase 7: US6 용어 (P3)

- [x] T029 [P] [US6] 층 칩(영역·모듈·루틴)을 노드 패널에 추가 — 언어마다 다른 종류 이름을 하나로
      묶어 부른다. 판정은 `nodeClassify` 단일 정의처, 패널은 props/emit 표현 전용
- [ ] T029b [US6] 남은 화면 문자열 통일, "숨김 요소 표시" → "내부 요소 펼치기"
- [ ] T030 [US6] 검증: 서로 다른 언어 결과 2개에서 층 이름 동일

---

## 진행 상태 (2026-07-21 실측)

| 게이트 | 결과 |
|---|---|
| 059 계약 테스트 N1~N12 | ✅ 통과 |
| 059 순수모듈 strict 타입검사 | ✅ 오류 0 |
| 실데이터 테이블 주인 판정 | ✅ **22/22 일치** (주인 없음 2: `member_grade_pol`·`pg_company`) |
| 색 계약(2축·표시명·hue 예약) | ✅ 라벨 30종 전부 관계색과 **20° 이상** 이격 |
| 저장소 전체 타입오류 | ✅ **259개 = 기준선 그대로** (내 변경분 0) |
| 057 회귀 | ✅ `test:panel-projection` 통과, 파일 mtime 무변경 |
| `npm run build` | ⚠️ **기준선부터 실패** — `vue-tsc` 가 기존 259개 오류에서 멈춤. 057 tasks T004 에도 같은 사실이 기록돼 있다(내 변경과 무관) |

**미착수(우선순위 조정)**: T019(영역 간 선의 원인 표시 UI), T025~T028(발견된 문제 목록 — 사용자가
우선순위 낮음으로 지정, 별도 UI/UX 설계 필요), T030(다른 언어 결과 대조), T032(빌드 — 기준선 선행 수정 필요),
T035(미검증 항목 보고).

**후속 저장소로 이관**: 층 라벨·프로젝트 층·폴더 트리 전체 노드화는 analyzer 범위이며
`075-external-file-linking`(48/100 진행 중) 착지 후 한 스펙으로 묶는다.

## Phase 8: 완료 게이트

- [x] T031 `npm run type-check` — 이번 변경분 오류 0(기존 오류는 기준선으로 분리 보고)
- [ ] T032 `npm run build` 통과
- [x] T033 `node specs/059-cohesion-coupling-view/contracts/test-area-graph.mjs` 통과
- [x] T034 `git status`·`git diff --stat` 로 057·058 파일 미변경, `graphCanvas.ts` 3지점 한정 확인
- [ ] T035 미검증 항목 분리 보고 — `PACKAGE` 1개인 동안 화면 검증 불가한 항목을 명시

---

## 의존 관계

```
T001 ─┬─▶ T015 ─▶ T016 ─▶ T017~T020 ─▶ T021~T024
      └─ (T002 검증)
T003 ─▶ T004~T009 ─▶ T010~T014 ─▶ T015
                              └─▶ T025~T028, T029~T030
```

**MVP**: T001~T002 + T003~T009 + T010~T014 + T015~T020 (US1·US2까지)

**병렬 가능**: T001·T002·T003 / T029
