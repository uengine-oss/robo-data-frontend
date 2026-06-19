# Implementation Plan: 그래프 보기모드 재설계 (계층 중첩·드래그·색·관계패널)

**Branch**: `main` | **Date**: 2026-06-20 | **Spec**: [spec.md](./spec.md)

## Summary
보기모드를 **계층 중첩 헐(패키지⊃파일⊃루틴)** 중심으로 재설계. 전부 **프론트 전용·재분석 0**(계층은 BELONGS_TO/HAS_MEMBER로 이미 존재). 핵심 난이도 = ①다단계 중첩 헐 렌더 ②헐 드래그(그룹 멤버 통째 이동). 둘 다 feasibility 검증 완료(NVL `setNodePositions` 존재).

## Technical Context
- TS5 / Vue3 Composition / Pinia. `@neo4j-nvl/base`(색=hex only, `getNodePositions`/`setNodePositions` 확인).
- 데이터(전제·검증됨): `FILE-BELONGS_TO->PACKAGE`, `TABLE-BELONGS_TO->SCHEMA`, `FILE-HAS_MEMBER->루틴`, `루틴.file_path`, `component_id`, `risk_level`, `EXTERNAL` 라벨. 프론트 `linkMap`에 BELONGS_TO/HAS_MEMBER 적재됨(HIDDEN 아님).
- **Constraints**: 백엔드 무변경·재분석0. NVL 색 hex. 회귀0.

## 핵심 설계 (HOW)

### A. 계층 조상 맵 (단일 도출처, DRY)
`graphCanvas.ts`에 헬퍼: 전체 `linkMap`를 1회 훑어 노드→{routineId,fileId,packageId,isExternal} 맵 구성.
- 루틴→파일: `HAS_MEMBER`(parent=file) 역인덱스, 폴백 `file_path`(파일 동일성 키).
- 파일→패키지: `BELONGS_TO`(file→package).
- external: 노드 라벨에 `EXTERNAL` 있으면 packageId를 가상 `"__external__"`로 오버라이드(프론트 분리 그룹).
→ 모듈간·영역(구조)가 공유. 캐시(linkMap 버전 기준).

### B. 다단계 중첩 헐 (`useGroupHulls.ts` 재설계)
현재: 단일 `groupBy` 평면. 변경: **레벨 배열**.
```
getConfig(): { levels: Array<{ keyOf:(n)=>string|null, labelOf:(key)=>string, padding:number }>, draggable:boolean } | { levels:[] }
```
- redraw: 바깥레벨(패키지, padding 큼)부터 → 안레벨(파일, padding 작음) 순서로 draw. 같은 화면 좌표 기반이라 안레벨 hull은 자연히 바깥레벨 안에 포함(부분집합).
- 1노드 그룹=원, 2노드=캡슐, ≥3=blob (기존 drawGroup 재사용, 레벨별 padding만 차등).
- **안 깨짐**: hull은 매 프레임 현재 화면좌표(convexHull)로 재계산(기존 rAF 미러링) → 줌/드래그 추종. 중첩은 padding 차등으로 분리.

### C. 헐 드래그 (`useGroupHulls` + `NvlGraph`)
- useGroupHulls가 redraw 시 **레벨별 그룹 폴리곤(screen pts)** 을 보관(hitTest용).
- 컨테이너 `pointerdown`(capture): 커서가 (a)노드 위가 아니고 (b)어떤 헐 폴리곤 내부면 → **그 그룹 hull-drag 시작**, `stopPropagation`으로 PanInteraction 차단.
- `pointermove`: 스크린 델타 → world 델타(`/scale*dpr`) → 멤버 노드 새 world 좌표 → `nvl.setNodePositions(members, false)` → redraw.
- `pointerup`: 종료. (드래그 대상 = 가장 안쪽(작은) 매치 그룹 우선 — 파일 원 잡으면 파일만, 패키지 여백 잡으면 패키지 전체.)
- 노드 자체 드래그(DragNodeInteraction)·팬과 충돌 안 나게: 노드 hit 우선 → 헐 hit → 그 외 팬.

### D. 보기별 합성 (graphCanvas / GraphTab)
| 보기 | 노드 로드 | 헐 levels | 색 | 비고 |
|---|---|---|---|---|
| 영역(구조) | 루틴(CALLABLE, file_path 보유) — reset | [패키지, 파일] | 라벨 | 테이블X. 깊이=루틴 |
| 모듈간 | 모듈+테이블 가상그래프(기존 buildModuleInteractionGraph) | [패키지](모듈만, 테이블 제외) + external 분리 | 라벨 | 모듈↔모듈+모듈↔테이블 유지 |
| 협력 군집 | component_id 루틴 — reset | [component_id] | 라벨 | 테이블X(자연 제외) |
| 건강 | risk_level 루틴 — reset(프리셋 폐기) | 없음(또는 [패키지] 옵션) | **health** | 테이블·R/W 제거 |
| 기본 | 수동 | 없음 | 라벨 | 불변 |
| ~~테이블흐름~~ | **삭제** | — | — | loadTableFlow 제거 |

- **건강**: `setPreset('health-rw')` 폐기 → `ensureNodesForView('risk_level')` + `colorMode='health'`. CALLS는 canvasGraphData가 자동 포함. (테이블/가상R/W 합성 제거 = buildHealthGraph 삭제.)
- **모듈간**: buildModuleInteractionGraph 유지(모듈↔모듈+모듈↔테이블). 헐 levels=패키지(모듈만). external 모듈 → "__external__" 그룹.

### E. 보기 독립 (GraphTab)
`ensureNodesForView`의 `if (canvasNodeIds.size>0) return` **제거** → 보기 진입 시 항상 자기 노드셋으로 `setCanvasNodes`(리셋). applyViewMode 진입부에서 preset/hint도 정리(기존).

### F. 건강 색 (`NvlGraph` HEALTH_COLORS)
`high:'#fa5252'(빨강)`, `medium:'#ffd43b'(노랑)`, `low:'#4dabf7'(파랑)`, neutral(위험도 없음)=회색 유지.

### G. 관계 클릭 패널 (`NodeDetailPanel`/node-detail)
관계 select 시 패널에 출발/도착 노드(논리명 포함)+같은 타입 관계 표시. 현재 relationship 분기 보강(노드패널 포맷 재사용).

### 영향 파일 (영향도 분석 확정 — graph 피처 한정)
```
graphCanvas.ts      # 조상맵 헬퍼, buildModuleInteractionGraph(헐용 패키지키), buildHealthGraph 삭제, loadTableFlow 삭제, ensureNodesForView 리셋
useGroupHulls.ts    # 다단계 levels + 드래그(setNodePositions)
GraphTab.vue        # applyViewMode(건강 프리셋→속성로드, table-flow 삭제, 독립리셋), groupHullBy→levels config, 메뉴
NvlGraph.vue        # HEALTH_COLORS 색, 헐드래그 배선, 관계select
NodeDetailPanel + node-detail/*  # 관계 클릭 연결 표시
```
무영향(확인): NavigatorTreeNode, schema/domain/ontology, 백엔드 전체.

## Constitution Check
robo 원칙 준수: 근본수정(early-return 제거·계층 단일도출)·회귀금지·DRY(조상맵 공유)·전수조사(영향도 코드검증)·실행검증(라이브 스샷). 위반 0.

## 구현 순서 (증분 커밋, 각 단계 라이브검증)
1. **건강 색 + 테이블 제거 + 협력군집 테이블 제거**(가장 작고 독립) → 검증·커밋.
2. **보기 독립(ensureNodesForView 리셋) + 테이블흐름 제거** → 검증·커밋.
3. **계층 조상맵 + 영역(구조) 다단계 중첩 헐**(핵심) → 검증·커밋.
4. **모듈간 패키지 헐 + external 분리** → 검증·커밋.
5. **헐 드래그** → 검증·커밋.
6. **관계 클릭 패널** → 검증·커밋.
각 단계: vue-tsc 0 + Playwright 스샷(헤드리스) 자가검증.
