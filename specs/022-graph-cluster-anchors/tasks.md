# Tasks: 클러스터 분리 + 그룹 앵커 + 성능 (022)

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | 프론트(`main`)·재분석0

`F/` = `robo-data-frontend/src/`

## Phase 1: 클러스터 분리 배치 + 위치 고정 (US1·US3) 🎯 ✅
- [x] T101 클러스터 배치 — **NvlGraph.layoutClusters** 로 구현(plan 의 graphCanvas.buildClusterPlan 대신: NVL world 좌표가 필요해 NvlGraph 가 적소). 그룹키로 멤버 분류 → 각 그룹 phyllotaxis 원반 → 정사각 격자 셀 분리배치.
- [x] T102 `NvlGraph.vue` — forceDirected 결과를 무시하고 `setNodePositions(plan, false)` 로 결정적 배치 → 재레이아웃 0. onLayoutDone 비의존(rAF 1회 마감).
- [x] T103 `GraphTab.vue` — clusterKeyOf 그대로 사용(보기별 그룹키). 사후 평행이동 separateClusters 폐기.
- [x] T104 검증 — 모듈간 3클러스터(package/external/tables) 분리·헐 안겹침·노드선택 후 위치고정 Playwright(dpr2) 통과. + **fitView 가 우측 패널 가림(rightInset) 빼고 프레임**(범위 외 발견 버그 동시 수정). 커밋 ccfc1ac.

## Phase 2: 그룹 앵커 + 앵커 드래그 (US2) ✅
- [x] T201 앵커 = **합성 노드 `__anchor__:<key>` 균일 사용**(실 PACKAGE/SCHEMA 대신 — 모듈 가상그래프엔 실노드가 없고 FR-002 가 합성 허용). clusterLabelOf 로 라벨. anchorMembers 맵 = anchor→멤버.
- [x] T202 `NvlGraph.vue` — 앵커 드래그: capture mousedown→**`getHits(evt,['node']).nvlTargets.nodes` 의 insideNode**(★`getCanvasNodesAt` 는 이 NVL 버전에 없음 — 실측 정정) → 앵커면 그룹 델타이동, 일반노드=NVL 기본. **구 헐-area 드래그(hitTest/isNearNode/pointInGroup 등) 전면 제거.**
- [x] T203 검증 — 테이블 앵커 드래그 → 멤버 16 이동·타그룹 12 고정, 보기전환 앵커 잔재0. 커밋 234fc30.

## Phase 3: 성능·누수 정리 (FR-007) ✅
- [x] T301 `useGroupHulls.ts` — rAF **상호작용(mousedown~up·휠 kick) 중에만**, idle 자기정지. 검증: idle 헐 redraw 0회(과거 ~120). 커밋 ca07633.
- [x] T302 캐싱 — idle 정지로 매 프레임 재계산 자체가 사라짐(convexHull/keyOf 호출 0/frame). 그룹 n≤16 라 별도 캐시 불필요(드로 비용이 지배적, idle-stop 으로 해소).
- [x] T303 누수 감사 — **NVL 인터랙션 핸들러(Click/Drag/Pan/Zoom) destroy 누락 = 실누수 수정**(커밋 8813c5c). setTimeout(200ms 일회)·heartbeat(짝맞음)·rAF/리스너(detach/onGroupDragUp)·NVL destroy = 무해 확인.
- [x] T304 검증 — 필터토글 다회 init/destroy 에러0, 회귀(드롭·1-hop·필터·색상) 통과.

## Phase 4: 정리 (데드코드·스펙·todo) ✅
- [x] T401 데드코드 제거 — 폐기 헐-area 드래그 전부(NvlGraph onHull* + useGroupHulls hitTest/isNearNode/pointInGroup/pointInPolygon/distToSegment/drawnGroups/nodeScreens). grep 잔재0.
- [x] T402 021 spec supersede 배너(708dc53). memory todo/manual 갱신(getHits 정정).
- [x] T403 vue-tsc 내 파일 0 + 회귀 0. 커밋·푸시.

## 구현 노트 (plan 대비 결정/divergence)
- **클러스터 배치 위치 = NvlGraph**(plan 의 graphCanvas.buildClusterPlan 아님): NVL world 좌표·setNodePositions 가 NvlGraph 에 있어 적소. graphCanvas 무변경.
- **앵커 = 합성 균일**(`__anchor__:`): 모듈 가상그래프에 실 PACKAGE/SCHEMA 노드가 없어 일관되게 합성. FR-002 허용. 추후 실노드로 교체 가능.
- **hit-test = `getHits(insideNode)`**: spec 가 적은 `getCanvasNodesAt` 는 이 NVL 버전에 없음(실측). getHits 가 MouseEvent 직접 받아 좌표변환 불필요.
- **fitView rightInset**(범위 외 추가): 분리 후 우측 클러스터가 노드패널 뒤로 숨던 버그 → 패널 폭 빼고 프레임. NVL fit() 에 inset 옵션이 없어 수동 setZoomAndPan.

## 순서·원칙
```
P1(분리+고정) → P2(앵커드래그) → P3(성능) → P4(정리)
```
각 단계: vue-tsc(내 파일 0) + Playwright(dpr=2 포함) 스샷 + 증분 커밋. 회귀 상시. 백엔드 0.
