# Implementation Plan: 클러스터 분리 + 그룹 앵커 + 성능

**Branch**: `main` | **Spec**: [spec.md](./spec.md) | 프론트 전용·재분석0

## Summary
보기별로 멤버를 그룹키로 클러스터링 → **각 클러스터를 분리 구역에 배치하고 위치 고정** → **그룹 앵커(대표노드) 드래그로 그룹 통째 이동**. 헐은 021 Minkowski 유지(노드 따라옴). 성능(rAF idle정지·캐싱·누수0) 최우선.

## Technical Context
- Vue3/Pinia/TS, `@neo4j-nvl/base`(layout 'free'로 위치고정, `setNodePositions`, `getCanvasNodesAt`).
- 데이터(검증): PACKAGE/SCHEMA/FILE 실노드 + BELONGS_TO/HAS_MEMBER + component_id/file_path/risk_level. 백엔드 무변경.

## 핵심 설계 (HOW)

### A. 클러스터 모델 (graphCanvas, 프론트 합성)
```
ClusterPlan = {
  clusters: Array<{ key, anchorId, anchorNode(실or합성), memberIds[], center:{x,y} }>
  anchorToMembers: Map<anchorId, memberIds[]>   // 드래그용
}
```
- 보기별 그룹키로 멤버 분류(기존 데이터). 실앵커 없으면 합성노드 생성(id `__anchor__:<key>`, label=그룹명).
- **클러스터 배치**: 클러스터들을 큰 원/그리드로 분산(center 간격 ≥ 클러스터 반경합) → 겹침 최소. 멤버는 각 center 주변 원형/포스 1회 배치 후 고정.

### B. 위치 고정 (NvlGraph) — 재정렬 0
- NVL `layout: 'free'`(또는 초기 force 1회 후 free 전환) + `setNodePositions(clusterPlan positions)`.
- syncGraph가 노드 추가/선택 시 **재레이아웃 안 함**(updateLayoutOnChange:false 확인 + free).

### C. 앵커 드래그 (NvlGraph)
- mousedown에서 `getCanvasNodesAt(pt)` → 앵커 노드면 그 그룹 드래그 시작.
- move: 델타 → `setNodePositions(앵커+멤버, false)`. up 종료. 헐은 rAF로 추종.
- 일반 노드면 NVL 기본 드래그(그 노드만). → hit 판정 NVL에 위임(반지름 추측 폐기).

### D. 헐 (useGroupHulls) — 021 유지 + 성능
- Minkowski 렌더·dpr 정확값 유지.
- ★rAF: **상호작용(pan/zoom/drag) 중에만** 루프, idle 시 정지(이벤트 기반 redraw + 드래그 중 rAF).
- convexHull/계층맵 캐싱(위치·데이터 변할 때만).

### E. 성능·누수 감사
- rAF: 시작/정지 명확, idle 0. window 리스너(드래그): up·unmount서 제거. heartbeat interval: stop. NVL: destroy. → 뷰전환·unmount서 잔존 0 점검.

### 영향 파일
```
graphCanvas.ts   # 클러스터 플랜 합성(앵커·멤버·center), buildHierarchyMap 캐시. (구) preset/loadTableFlow 잔재 정리
GraphTab.vue     # 보기별 clusterPlan 구성, NvlGraph에 전달. hullLevels→클러스터 헐. 데드분기 제거
NvlGraph.vue     # free layout·setNodePositions 초기배치, 앵커드래그(getCanvasNodesAt), (구) 헐-드래그 제거
useGroupHulls.ts # rAF idle정지 + 캐싱. Minkowski 유지
```

## 구현 순서 (증분·검증·커밋)
1. **클러스터 분리 배치 + 위치 고정**(US1·US3) — 겹침·재정렬 동시 해결. 라이브검증.
2. **그룹 앵커 + 앵커 드래그**(US2) — getCanvasNodesAt 기반. (구) 헐-드래그 제거.
3. **성능·누수 정리**(FR-007) — rAF idle·캐싱·감사.
4. **데드코드·구스펙·todo 정리.**
각 단계 vue-tsc 0 + Playwright(dpr=2 포함) 스샷 + 커밋.

## Constitution Check
프론트 전용·DRY(클러스터 단일합성)·근본수정·성능명시·전수검증. 위반 0.
