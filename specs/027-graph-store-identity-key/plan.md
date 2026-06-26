# Implementation Plan: 그래프 스토어 식별키 단일화 + 일관 초기화

**Branch**: `main` (spec dir `027-graph-store-identity-key`) | **Date**: 2026-06-26 | **Spec**: [spec.md](./spec.md)

## Summary

`analyzer.ts` 의 fetch 경로(`convertNeo4jNode`/`convertNeo4jRelationship`)가 노드를 **elementId**로 키 잡아 스트림(**논리 id**)과 달라, `updateGraphData` 병합 시 같은 그래프가 2벌 쌓임. → fetch도 **논리 id(`Properties.id`)** 로 키 통일(관계 끝점은 elementId→논리 id 매핑) → 스트림과 자동 dedup = 1벌. 추가로 `clearGraphData`에 `nodeNameCache` 포함 + 재분석/신규분석 시작 시 그래프 스토어 초기화로 누적·stale 제거.

## 기술 접근 (무회귀 핵심)

**Blast radius 전수확인**: `node['Node ID']`(elementId)는 오직 `convertNeo4jNode`(:85)·`convertNeo4jRelationship`(:94-95) 두 함수에서만 사용(그 외는 타입정의/응답스키마뿐). 모든 소비처(NvlGraph·navigator·NodeDetail·검색·드래그)는 **`node.id`(논리 id) 기준** — 스트림이 이미 논리 id를 쓰므로 **소비처는 변경 0, fetch만 정합되면 됨**. 안전전제 실측: 모든 노드 `Properties.id` 보유(누락0), 관계 끝점 orphan 0.

## Constitution Check (frontend)
| 원칙 | 판정 | 근거 |
|---|---|---|
| I. Tab-Based Single-Route | ✅ N/A | 라우트 변경 0 |
| II. Feature-Folder Modularity | ✅ PASS | `features/code-analysis/analyzer.ts` 자기 store 내부만 |
| III. Gateway-Routed API | ✅ N/A | 신규 API 0, `/robo/graph` 응답형 무변경 |
| IV. Honest State | ✅ **강화** | 중복(2벌) 제거 = 화면이 실제 그래프와 일치 |

**PASS** (라우트·API·스키마·목업 0).

## 설계 (현재 → 목표)

### 현재
- `convertNeo4jNode`(:84-89): `id: node['Node ID']`(elementId).
- `convertNeo4jRelationship`(:91-99): `source/target = rel['Start/End Node ID']`(elementId).
- `updateGraphData`(:282-308): `new Map(기존)` 복사 후 elementId 키로 set → 스트림(논리키) 위에 덧붙음 = 2벌.
- `mergeStreamNode`(:399-407): 논리 id 키 + `nodeNameCache.set`.
- `clearGraphData`(:310-314): nodeMap/linkMap/semantic 3종만(보조캐시 누락).
- `doAnalyze`(:687~692): post-fetch를 clear 없이 merge(깜빡임 방지 의도).

### 목표
1. **fetch 키 = 논리 id**:
   - `convertNeo4jNode`: `id: (properties.id ?? node['Node ID'])`.
   - `updateGraphData`: 노드 배치로 `elemId→논리id` 맵 구축 → 관계 끝점을 그 맵으로 변환(없으면 원본 폴백). `convertNeo4jRelationship`은 맵 받도록(또는 updateGraphData 내 인라인 변환).
   - 효과: fetch·스트림 같은 논리 id 키 → 병합 자동 dedup → 1벌. (외부 트윈 같은 논리 id도 화면 1개로 합쳐짐.)
2. **일관 초기화**:
   - `clearGraphData`에 `nodeNameCache.clear()` 추가(FR-005).
   - 신규/재분석 시작 시 그래프 스토어 초기화: `executeUploadPipeline`(append 아닌 경로)·`executeRestartPipeline` 시작부에 `clearGraphData()` 호출(FR-004). append는 의도된 누적이라 clear 안 함(중복은 키 dedup으로 방지).
   - post-fetch merge(:687)는 그대로(키 통일로 더 이상 2벌 아님).

### blast radius / 무회귀 체크리스트(구현 시)
- elementId 의존 0 확인됨 → 소비처 무변경.
- `convertNeo4jRelationship` 시그니처 변경 시 호출부(:296) 1곳만.
- 심볼 전수 grep: `convertNeo4jRelationship` 호출부, `nodeNameCache` 참조, `clearGraphData` 호출부(append/restart/reset/data-confirm) 모두 정합.

## Project Structure
```
specs/027-graph-store-identity-key/ : spec.md ✓ plan.md(이파일) checklists/ ✓ tasks.md
변경 소스: src/features/code-analysis/analyzer.ts (convertNeo4jNode·convertNeo4jRelationship·updateGraphData·clearGraphData + 재분석 경로 clear)
```

## Complexity Tracking
없음. 단일 파일 내 적재/초기화 정합. (대량 그래프 성능: 맵 1개 추가 O(n), 무영향.)
