# Quickstart: 059 검증 실행 안내

**Date**: 2026-07-21 · **Plan**: [plan.md](./plan.md)

이 문서는 **검증을 어떻게 돌리는가**만 다룬다. 구현 내용은 `tasks.md`와 소스에 있다.

## 0. 전제

- Node 18+ (저장소 `package.json` 기준)
- 화면 검증에는 Neo4j와 analyzer가 떠 있어야 한다. 실측 포트는
  `robo-workspace` 기동값을 따른다(analyzer 15502, Neo4j 7687).
- **화면 검증 선행 조건**: 분석 결과의 `PACKAGE`가 2개 이상이어야 한다. 2026-07-21 기준 shopmall은
  1개뿐이라 이 상태에서는 FR-004 사유 표시 경로만 확인할 수 있다.

## 1. 순수 모듈 계약 테스트

`areaGraph.ts`의 반대 사례 N1~N12를 검증한다.

```bash
cd project/robo-data-frontend
node specs/059-cohesion-coupling-view/contracts/test-area-graph.mjs
```

기대 출력: `059 area-graph contract: N1~N12 통과`

> `package.json`은 057·058 작업이 점유 중이라 npm script를 추가하지 않는다. 그 작업이 착지한 뒤
> `test:area-graph` 스크립트로 승격한다.

## 2. 타입 검사

```bash
# 순수 모듈만 strict 검사
npx tsc -p specs/059-cohesion-coupling-view/tsconfig.json

# 저장소 전체 (기존 오류가 있으면 이번 변경분과 분리해 보고한다)
npm run type-check
```

## 3. 빌드

```bash
npm run build
```

## 4. 실데이터 대조 — 테이블 주인 정답지

계약 테스트는 합성 fixture를 쓴다. 실데이터가 규칙대로 갈리는지는 아래 질의로 직접 확인한다.
`PACKAGE`가 1개인 동안에는 영역 대신 모듈(FILE) 기준으로 확인한다 — 폴더를 나누면 같은 계산이 영역
단위로 그대로 적용된다.

```cypher
MATCH (m:FILE)-[:HAS_MEMBER]->(rt)-[:PARENT_OF*0..10]->(s)-[r:READS|WRITES]->(t:TABLE)
RETURN t.name AS tbl, m.name AS owner_candidate, type(r) AS op, count(*) AS cnt
ORDER BY tbl, op DESC, cnt DESC
```

**2026-07-21 실측 정답지** (테이블 22개 · 규칙 적용 결과)

영역마다 `(쓰기, 읽기)`를 만들어 사전식 최대인 영역이 주인. 최대가 유일하지 않으면 주인 없음.

| 결과 | 개수 | 예 |
|---|---:|---|
| 주인 있음 | 20 | `orders`→settlement(3,1) · `product_stock`→inventory(3,2) · `member`→member(2,2) vs payment(2,1) · `product_price_hst`→catalog(1,1) vs inventory(1,0) |
| 주인 없음 → `'기타'` | 2 | `member_grade_pol`(5개 영역 전부 (0,1) 동률) · `pg_company`(2개 영역 (0,1) 동률) |

화면에 표시된 소속이 이 표와 다르면 회귀다.

## 5. 화면 검증 (Playwright)

각 항목은 캡처를 남기고 콘솔·네트워크 오류가 없는지 함께 본다.

| 확인 | 성공 판정 |
|---|---|
| SC-001 | 영역 간 관계 보기에서 양 끝이 같은 영역인 선 **0개** |
| SC-004 | 따로 그려진 테이블 **0개**, 미사용 테이블 **0개** |
| SC-005 | 역할 칩 선택 시 노드 색이 그 역할 색으로 바뀜 (수정 전 0%) |
| FR-003 | 영역 간 선의 굵기가 건수에 따라 다르고 건수를 확인할 수 있음 |
| FR-009~012 | 더블클릭 한 단계씩 · 지목 대상만 · 새 루틴 펼치면 이전 루틴 접힘 · 전역 펼치기 없음 |
| FR-013 | 루틴을 펼쳐도 구문 노드가 캔버스에 없음 |
| FR-015~017 | 쓰기/읽기/호출 색 구분, 영역 통과 시 진하기 차이, 선 위 한국어 캡션 |
| FR-021 | 보기 모드가 정확히 2개 |
| FR-022~024 | 문제 목록 개수가 실제 값과 일치, 0건과 정보 없음이 구분 표시 |
| FR-025 | 서로 다른 언어 결과 두 개에서 층 이름이 동일 |

## 6. 죽은 코드 확인 (완료 게이트)

```bash
grep -rn "component_id\|component_name" src/          # 협력 군집 잔재
grep -rn "health-rw\|colorMode\|HEALTH_COLORS" src/   # 건강 보기 잔재
grep -rn "rolesOf" src/                                # 결함 함수 잔재
```

세 명령 모두 결과 0이어야 한다. 단 `analyzer.ts`의 `health_metrics_step`은 **분석 진행 단계 이름**이라
삭제 대상이 아니다(오판 주의).

## 7. WIP 보존 확인

```bash
git status --short
git diff --stat src/features/code-analysis/graphCanvas.ts
```

057·058이 점유한 파일(`package.json`, `analyzer.ts`, `graphVisibility.ts`, `panelGraphProjection.ts`,
`scripts/`, `tests/`, `tsconfig.panel-projection.json`)에 059의 변경이 섞이지 않았는지 확인한다.
`graphCanvas.ts`는 계획에 명시한 세 지점 외의 수정이 없어야 한다.
