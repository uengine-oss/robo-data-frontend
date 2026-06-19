# Tasks: 그래프 보기모드 재설계 (021)

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | 레포: frontend(`main`) · 백엔드 변경 0

경로 약어: `F/` = `robo-data-frontend/src/`

---

## Phase 1: 건강색 + 테이블 제거 (US3) — 가장 독립
- [ ] T101 [US3] `F/.../NvlGraph.vue` HEALTH_COLORS: medium 주황→`#ffd43b`(노랑), low 초록→`#4dabf7`(파랑). high 빨강 유지.
- [ ] T102 [US3] `F/.../graphCanvas.ts`: `buildHealthGraph` 삭제 + `CanvasPreset`에서 `'health-rw'` 제거. `F/.../GraphTab.vue` 건강 분기 = `ensureNodesForView('risk_level')`(프리셋 폐기) + colorMode 유지.
- [ ] T103 [US3] 협력군집(area) 테이블 미포함 확인(component_id 없는 테이블 자연 제외) — 회귀 확인만.
- [ ] T104 검증: 건강=루틴만 빨강/노랑/파랑·테이블0, 협력군집 테이블0. Playwright 스샷. 커밋.

## Phase 2: 보기 독립 + 테이블흐름 제거 (US5)
- [ ] T201 [US5] `F/.../GraphTab.vue` `ensureNodesForView`: `if(canvasNodeIds.size>0)return` **제거** → 항상 자기 노드셋 리셋(setCanvasNodes). 진입 시 preset/hint 정리 일관화.
- [ ] T202 [US5] `F/.../GraphTab.vue`: 테이블흐름 메뉴 항목·`applyViewMode` 분기·`ViewMode` 타입·`activeViewLabel` 케이스 제거. `F/.../graphCanvas.ts` `loadTableFlow` 삭제(유일 호출처=GraphTab 확인됨).
- [ ] T203 검증: 테이블흐름→영역 전환 시 잔상/겹침0(구버그 재현X), 메뉴에 테이블흐름 없음. 스샷. 커밋.

## Phase 3: 계층 조상맵 + 영역(구조) 다단계 중첩 헐 (US1) ★핵심
- [ ] T301 [US1] `F/.../graphCanvas.ts`: 조상맵 헬퍼 `buildHierarchyMap()` — linkMap 1회 훑어 노드→{fileId(HAS_MEMBER/file_path), packageId(BELONGS_TO), isExternal(EXTERNAL 라벨)}. 캐시(linkMap 기준).
- [ ] T302 [US1] `F/.../useGroupHulls.ts`: 단일 groupBy → **levels 배열**(바깥→안 padding 차등). redraw가 레벨별 그룹 hull을 바깥→안 순서로 draw. 1/2/≥3 노드 케이스 기존 로직 재사용.
- [ ] T303 [US1] `F/.../GraphTab.vue`: 영역(구조) = 루틴 로드(reset) + groupHulls config = `[패키지, 파일]` levels(조상맵 기반). `NvlGraph` prop을 `groupHullBy`(단일)→`hullLevels`(배열)로 일반화.
- [ ] T304 검증: 패키지⊃파일⊃루틴 중첩 원·이름, 줌인/드래그 헐 안깨짐, 테이블0. 스샷(줌단계별). 커밋.

## Phase 4: 모듈간 패키지 헐 + external 분리 (US2)
- [ ] T401 [US2] `F/.../graphCanvas.ts` `buildModuleInteractionGraph`: 유지(모듈↔모듈+모듈↔테이블). 모듈 노드에 packageId/isExternal 부여(조상맵).
- [ ] T402 [US2] `F/.../GraphTab.vue`: 모듈간 hullLevels = `[패키지]`(모듈만, 테이블 제외). external 모듈 → `"__external__"` 그룹 키.
- [ ] T403 검증: 모듈↔모듈+모듈↔테이블 둘 다, external 그룹 분리, 패키지 헐. 스샷. 커밋.

## Phase 5: 헐 드래그 (US4)
- [ ] T501 [US4] `F/.../useGroupHulls.ts`: redraw 시 레벨별 그룹 폴리곤 보관. point-in-polygon 헬퍼. `hitTestHull(x,y)` → 가장 안쪽 매치 그룹.
- [ ] T502 [US4] `F/.../NvlGraph.vue`: 컨테이너 pointerdown(capture)에서 노드 hit 아님 + 헐 hit이면 hull-drag 시작(stopPropagation으로 팬 차단). move=델타→world→`setNodePositions(members,false)`+redraw. up=종료.
- [ ] T503 검증: 헐 드래그 시 그룹 멤버만 이동·헐 추종·타그룹 불변, 노드드래그/팬 회귀0. 스샷(전후). 커밋.

## Phase 6: 관계 클릭 패널 (US6)
- [ ] T601 [US6] `F/.../NodeDetailPanel.vue`+`node-detail/`: 관계 select 시 양끝 노드(논리명)+같은 타입 관계 표시. relationshipRowParts 재사용.
- [ ] T602 검증: 관계 클릭→패널 연결 표시. 스샷. 커밋.

## 의존·순서
```
P1(건강색) → P2(독립·테플제거) → P3(중첩헐 핵심) → P4(모듈간) → P5(드래그) → P6(관계패널)
```
- 각 Phase: vue-tsc 내 파일 0 에러 + Playwright 헤드리스 스샷 자가검증 + 증분 커밋.
- 회귀 상시 확인: 드래그-드롭·1-hop·필터▾·isolate·스트림·색상크래시0·논리명토글.
- ★백엔드/타 피처 무변경(영향도 분석 확정).
