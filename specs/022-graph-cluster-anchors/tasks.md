# Tasks: 클러스터 분리 + 그룹 앵커 + 성능 (022)

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | 프론트(`main`)·재분석0

`F/` = `robo-data-frontend/src/`

## Phase 1: 클러스터 분리 배치 + 위치 고정 (US1·US3) 🎯
- [ ] T101 `F/.../graphCanvas.ts` — `buildClusterPlan(viewMode)`: 보기별 그룹키로 멤버 분류 + 클러스터 center 분산배치(겹침 최소) + 멤버 초기좌표. 계층맵 캐시(linkMap 버전).
- [ ] T102 `F/.../NvlGraph.vue` — NVL `layout:'free'`(or 초기 force 1회 후 고정) + `setNodePositions(plan)`. 노드 추가/선택 시 재레이아웃 0 확인.
- [ ] T103 `F/.../GraphTab.vue` — 보기 진입 시 clusterPlan 구성·전달. (구) preset/force 분기 정리.
- [ ] T104 검증 — 모듈/테이블/external 클러스터 분리·헐 안겹침, 노드선택 후 위치고정. Playwright(dpr2). 커밋.

## Phase 2: 그룹 앵커 + 앵커 드래그 (US2)
- [ ] T201 `F/.../graphCanvas.ts` — 앵커 합성(실노드 없을 때, id `__anchor__:`) + anchorToMembers 맵. 앵커를 클러스터 center에.
- [ ] T202 `F/.../NvlGraph.vue` — 앵커 드래그: mousedown→`getCanvasNodesAt`→앵커면 그룹 델타이동(setNodePositions). 일반노드=NVL 기본. **(구) 헐-드래그(mousedown capture/hitTest/isNearNode) 제거.**
- [ ] T203 검증 — 앵커 끌면 그룹+헐만 이동·타그룹 불변, 노드 개별드래그 OK. 스샷. 커밋.

## Phase 3: 성능·누수 정리 (FR-007)
- [ ] T301 `F/.../useGroupHulls.ts` — rAF **상호작용 중에만**(idle 정지): pan/zoom/drag 시작 시 loop, 종료 시 stop. 이벤트 기반 redraw 병행.
- [ ] T302 캐싱 — convexHull/계층맵 위치·데이터 변할 때만 재계산(매 프레임 X).
- [ ] T303 누수 감사 — rAF·window 리스너·heartbeat·NVL cleanup 전수(뷰전환·unmount 잔존 0). DevTools/코드 점검.
- [ ] T304 검증 — idle CPU 확인, 회귀(드롭·1-hop·필터·스트림·색상0). 커밋.

## Phase 4: 정리 (데드코드·스펙·todo)
- [ ] T401 데드코드 제거 — 폐기 헐-드래그·relFilter 잔재·미사용 함수 전수 grep.
- [ ] T402 021 spec에 "레이아웃/드래그 supersede by 022" 명시. memory todo 현실화.
- [ ] T403 최종 vue-tsc 0 + 회귀 0 확인. 커밋·푸시.

## 순서·원칙
```
P1(분리+고정) → P2(앵커드래그) → P3(성능) → P4(정리)
```
각 단계: vue-tsc(내 파일 0) + Playwright(dpr=2 포함) 스샷 + 증분 커밋. 회귀 상시. 백엔드 0.
