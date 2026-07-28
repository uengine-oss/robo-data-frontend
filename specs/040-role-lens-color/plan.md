# Implementation Plan: 누적 라벨 렌즈 단일화와 회귀 차단

**Spec**: [spec.md](./spec.md)  
**Revised**: 2026-07-18

## Root cause

2026-07-14 라벨 순서 보강에서 `semanticRoleLabels(node)`가 추가됐지만, 기존 색 렌즈는 계속
`rolesOf(labels)`를 사용했다. 같은 개념을 두 함수가 서로 다르게 판정했고, `rolesOf()`가 마커만
반환하도록 회귀하면서 QUERY가 역할 후보에서 사라졌다. 결과적으로 QUERY를 눌러도
`colorLabelOf()`가 FUNCTION으로 fallback했다.

## Structure decision

```text
Graph data + active loadedLabels
        │
        ▼
nodeLabels.ts
  kindOfNode(node)
  semanticRoleLabels(node)
  colorLabelOfNode(node, activeLabels)   ← 유일한 시각 스타일 라벨 결정
        │
        ├── NvlGraph initial/update → getNodeColor([resolvedLabel])
        ├── NodeDetailBase badge   → getNodeColor([resolvedLabel])
        └── GraphTab legend        → getNodeColor([individualLabel])
```

`kindOf/rolesOf(labels)`는 과거 label-only 소비자를 위한 compatibility wrapper일 뿐, 역할 렌즈가
호출할 수 없다. production 색 렌즈는 반드시 node-aware 경로만 사용한다.

## Impact boundary

| 영역 | 영향 | 계약 |
|---|---|---|
| GraphTab Overview | 종류/역할 그룹, 누적 클릭 순서 | 원본 label·Set 순서 유지 |
| graphCanvas projection | 선택 집합의 union | 색 판정 금지, 데이터 구성만 담당 |
| NvlGraph initial render | 노드 base color | resolver 단일 키 사용 |
| NvlGraph active/style watcher | 부분 갱신 | 위치·선택 보존 |
| NodeDetailBase | 선택 노드 배지색 | 캔버스와 같은 resolver |
| GraphStylePanel/storage | label별 custom color/size | resolver 결과 label을 조회 키로 사용 |
| Navigator/nodeClassify | kind 표시·분류 | kindOfNode 공유 |
| health view | 위험도색 | 명시 예외로 label lens보다 우선 |
| 관계 스타일 | 무영향 | relationship type 계약 유지 |
| 숨김 필터 | 무영향 | 표시 blacklist와 색 렌즈 분리 |

## Verification gates

1. 순수 resolver 회귀 행렬 테스트.
2. source wiring 검사: NvlGraph와 NodeDetailBase 모두 `colorLabelOfNode` 사용, 옛 API 0.
3. `prebuild`와 `prebuild:docker`에서 테스트 자동 실행.
4. Vite production build.
5. 실제 분석 그래프 UI에서 FUNCTION → QUERY 누적 선택 전/후 node color 샘플 비교.
6. QUERY 스타일 변경 후 일반 FUNCTION 불변 및 Node panel 일치 확인.
7. 위치 좌표 snapshot 전후 동일성 확인(스타일 변경이 layout을 재실행하지 않음).

## Rollback

문제가 생기면 컴포넌트별 조건을 덧붙이지 않는다. `colorLabelOfNode`와 회귀 행렬만 수정하고 모든
소비자는 그대로 둔다. 이 경계를 깨는 변경은 spec 위반이다.

