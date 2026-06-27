# Implementation Plan: 역할(stereotype) 위치기반 UI

**Branch**: `main` | **Date**: 2026-06-27 | **Spec**: [spec.md](./spec.md)

## Summary

stereotype이 노드 라벨로 부여됨(analyzer spec 033, `labels[0]`=타입, `labels[1:]`=역할)에 따라, 프론트 소비를 위치기반으로 정리: (1) 노드패널 종류/역할 분리, (2) 색·라벨추출 하드코딩 집합 2벌 제거→`labels[0]`, (3) 필터 종류/역할 섹션 구분. 위치 = `labels[0]`(어떤 노드든 첫라벨로 등장한 라벨=종류) vs 나머지(역할). EXTERNAL은 역할 아님(stub 마커). 색은 종류기준 그대로(시각 회귀 0).

## Technical Context

**Language/Version**: TypeScript + Vue 3 (Composition API, `<script setup>`)
**Primary Dependencies**: Pinia, NVL(그래프)
**Testing**: vue-tsc(변경파일 0에러) + vite dev(3000) + Playwright 자가검증 + neo4j 직접쿼리(ground truth)
**Project Type**: 프론트(분석기 화면, MF 리모트)
**Constraints**: 색·크기 결과 불변(회귀 0). 하드코딩 stereotype/구조 집합 금지(위치 사용).
**Scale/Scope**: 변경 ~5파일(analyzer.ts·graphStyles.ts·nodeIdentity.ts·GraphTab.vue·NodeDetailPanel.vue) + 위치 분류 헬퍼.

## Constitution Check

*GATE*
- 단일 진실: 종류/역할 위치판별 헬퍼 1곳(공용 util). 하드코딩 집합 2벌 제거 = 드리프트 0. ✅
- 회귀 금지: 색/크기 결과 불변(위치=기존 정렬과 동일 결과). EXTERNAL stub·templateRouter 무변경 확인. ✅
- 가독성: 위치판별을 명시 헬퍼(`splitKindRole`)로 — 카드/필터/색이 한 출처 사용. ✅
- 위반 없음.

## Project Structure

```text
src/
├── shared/utils/
│   ├── nodeLabels.ts        # 신규: kindOf(labels)=labels[0], rolesOf(labels)=labels[1:] minus EXTERNAL
│   └── nodeIdentity.ts      # buildIdentityRows: 종류/역할 위치기반 행(분류 property→labels)
├── shared/config/graphStyles.ts   # getNodeColor/getNodeSize: PRIMARY_LABELS 제거 → labels[0]
├── features/code-analysis/analyzer.ts   # extractSubLabel: PRIMARY_LABELS 제거 → kindOf
└── features/code-analysis/components/graph/
    ├── GraphTab.vue          # overallNodeStats: 종류/역할 위치분류(2맵 또는 분류태그)
    └── NodeDetailPanel.vue   # 필터: 종류 섹션 / 역할 섹션 분리 렌더
```

**Structure Decision**: 위치판별 단일 헬퍼 `nodeLabels.ts`(kindOf/rolesOf) 신규 → 모든 소비처가 이 하나를 씀(DRY, 드리프트 0). templateRouter는 이미 위치안전이라 무변경.

## 위치 판별 규칙 (핵심)

- `kindOf(labels)` = `labels[0]`(종류). `rolesOf(labels)` = `labels.slice(1)` 에서 `EXTERNAL` 제외(역할).
- 필터 종류 집합 = 그래프 전체에서 어떤 노드든 `labels[0]`로 등장한 라벨. 그 외 라벨 = 역할. (하드코딩 0, 데이터 파생.)
- EXTERNAL = stub 종류미상 마커 → 역할 아님. 종류 섹션 또는 무시.

## Complexity Tracking

> 위반 없음 — 비움.
