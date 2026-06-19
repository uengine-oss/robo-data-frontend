# Implementation Plan: 그래프 탐색 UX 재설계

**Branch**: `main` | **Date**: 2026-06-19 | **Spec**: [spec.md](./spec.md)

## Summary

보기(프리셋)·필터(종류 다중토글)·isolate(이것만)·콘솔(사람말) 4축을 역할이 안 겹치게 분리한다. 핵심은 **"필터(빼기)"와 "로드(더하기)"의 혼란 제거** — 오버뷰 칩 클릭은 isolate(빈 캔버스여도 로드), 종류 끄고/켜기는 필터 ▾로.

## Technical Context

**Language/Version**: TypeScript 5 / Vue 3 (Composition API) / Pinia

**Primary Dependencies**: `@neo4j-nvl/base`(렌더, 색=hex only) · 자체 canvas 헐 오버레이(useGroupHulls)

**데이터(전제, 변경 없음)**: nodeMap/linkMap(라벨·component_id·risk_level·CALLS·READS·WRITES·HAS_MEMBER·PARENT_OF) — 분석 완주 시 존재.

**Project Type**: web frontend (단일 레포).

**Constraints**: NVL 색은 hex(022에서 확정). 노드/관계/속성 모델 불변. 회귀 0(드래그-드롭·스트림·크래시0 유지).

## Constitution Check

frontend 레포엔 별도 constitution 없음(analyzer 전용). robo 원칙([[principles]]) 준수: 근본수정·회귀금지·DRY·표시토글 단일개념.

## 핵심 설계 (HOW)

### 상태 모델 (graphCanvas / GraphTab)
```
viewMode        : 'default'|'area-struct'|'cohesion'|'module'|'health'|'table-flow'   (프리셋, 상호배타)
nodeTypeFilter  : Set<label>   — 표시할 노드 종류(비어있으면 전체). 다중 토글.
relTypeFilter   : Set<relType> — 표시할 관계 종류(비어있으면 전체). 다중 토글. ★신규
isolateLabel    : 오버뷰 칩 클릭 = 그 라벨만 로드(loadNodesByLabels 재사용)
```
- 보기모드 = 위 상태들의 **프리셋**(선택 시 nodeTypeFilter/relTypeFilter/그룹/색을 세팅).
- 필터 ▾ = nodeTypeFilter/relTypeFilter 직접 토글(보기모드와 직교).
- NvlGraph는 이미 `labelFilters`(노드)·`relFilter`(관계) prop 소비 → 이를 **다중 집합**으로 일반화.

### 영향 파일
```
src/features/code-analysis/
├── graphCanvas.ts            # viewMode 프리셋 분기 + 영역(구조)/협력군집/모듈간(CALL추가)/건강(R/W추가) 합성. loadNodesByLabels(isolate).
├── components/graph/
│   ├── GraphTab.vue          # 보기 ▾(프리셋 전용) + ★필터 ▾(노드·관계 다중토글) 신설. relFilter→필터▾ 이동.
│   ├── NvlGraph.vue          # labelFilters/relFilter prop을 다중 집합으로 소비(이미 구조 있음).
│   ├── NodeDetailPanel.vue   # 오버뷰 노드칩 클릭=isolate / 관계칩 클릭=relTypeFilter 토글(현재 색편집 → 분리).
│   └── useGroupHulls.ts      # 영역(구조) groupBy='file'|'module' 지원(이미 groupBy 일반화됨).
└── analyzer.ts               # 콘솔 사람말 리팩(US4).
```

### 보기모드별 합성 (graphCanvas)
| 보기 | 노드 | 관계 | 그룹/색 |
|---|---|---|---|
| 기본 | 빈→사용자 선택 | 전체 | 라벨색 |
| 영역(구조) ★ | 전체(또는 그릇/루틴) | 구조 | **groupBy=file/module**, 이름=파일/모듈명 |
| 협력 군집(개명) | component_id 보유 | CALL | groupBy=component_id |
| 모듈간 ★확장 | 모듈·테이블 | 모듈↔모듈(CALL 집계)+모듈↔테이블(R/W) | — |
| 건강 ★확장 | 루틴+테이블 | CALL+R/W | 위험색 |
| 테이블흐름 ★ | 테이블+DML | R/W | — |

- 모듈간 CALL 집계 = 기존 resolveModule(R/W용)을 CALLS에도 적용(루틴→모듈 양끝 해소).
- 협력군집 빈약 시 안내(D1): clusters 0/소수면 hint 노출.

## Project Structure (산출물)
```
specs/020-graph-explore-redesign/
├── plan.md (이 파일) · spec.md · tasks.md
└── checklists/requirements.md
```
(research/data-model/contracts는 설계가 대화로 확정돼 생략 — 핵심은 이 plan + tasks)

## Complexity Tracking
위반 0.

## 구현 순서 (증분 커밋)
1. **US1 MVP**(최우선): 오버뷰 노드칩=isolate / 관계 필터(relTypeFilter) 신설 / 필터 ▾ UI / relFilter 이동. → 혼란 제거 검증 후 커밋.
2. US2: 영역(구조) 신설 + 협력군집 개명 + 부족안내.
3. US3: 모듈간 CALL 추가 + 건강 R/W.
4. US4: 콘솔 친화.
5. US5(옵션): 테이블흐름.
각 US 완료 시 라이브검증(Playwright) + 커밋.
