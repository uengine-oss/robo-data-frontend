# Specification Quality Checklist: 응집도·결합도 그래프 보기

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-21
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

### 1차 검증 (2026-07-21)

**Content Quality** — 통과. FR/SC 모두 "무엇을/왜"로 서술했고 파일·함수·색상코드 같은 구현 세부를
본문에서 제외했다. 색은 "서로 다른 색", "더 뚜렷하게"처럼 관찰 가능한 성질로만 표현했다.

**측정 가능성** — SC-001·SC-004·SC-005·SC-006은 개수/비율로 판정 가능하다. SC-002는 현재 기준선
(노드 312 · 관계 1073, 2026-07-21 Neo4j 실측)을 명시해 전후 비교가 가능하다.

**미해결 항목** — [NEEDS CLARIFICATION] 2건이 남아 있었다. 처리 내역은 아래.

### 모호함 해소 내역

| # | 항목 | 처리 |
|---|---|---|
| C1 | 영역 미소속 대상의 표시 규칙 | **코드로 해소** — 사용자에게 묻지 않음. 저장소에 이미 미소속 대상을 하나의 묶음('기타')으로 모으는 규칙이 존재한다(`GraphTab.vue` clusterKeyOf/clusterLabelOf의 `__ungrouped__` → '기타'). principles §7 "같은 의미는 같은 규칙"에 따라 그대로 재사용한다. → FR-030 으로 확정 |
| C2 | 공유 테이블의 화면 배치 | **사용자 결정(2026-07-21, 2차 수정)** — 별도 구역도, 영역 사이 배치도 아니다. **가장 많이 연결된 영역 하나에 소속**시키고, 소속 아닌 영역이 건드리면 영역 간 선으로 드러낸다. 테이블 전용 구역은 만들지 않는다. → FR-005~008a·FR-031 |
| C2-1 | 소속을 셀 때 읽기와 쓰기의 가중치 | **확정(2026-07-21, 사업 결정)** — 주인은 **쓰기가 가장 많은 영역**. → FR-005 |
| C2-2 | 동률 처리 | **확정(2026-07-21, 사용자 지시로 단순화)** — 계단식 2차·3차 규칙을 폐기하고 `(쓰기, 읽기)` 사전식 비교 하나로 통합. **최대가 유일하지 않으면 주인을 정하지 않고 '기타'로 보낸다.** 이름 순 같은 임의 규칙을 두지 않는다 |

### FR-005 실측 검증 (2026-07-21, Neo4j `neo4j` DB)

확정 규칙을 shopmall 테이블 22개 전수에 적용한 결과다. 지금은 `PACKAGE`가 1개뿐이라 모듈(FILE)
단위로 계산했다 — 폴더를 나누면 같은 계산이 영역 단위로 그대로 적용된다.

| 결과 | 테이블 수 | 예 |
|---|---:|---|
| 주인 있음 | 20 | `orders`→settlement(3,1) · `product_stock`→inventory(3,2) · `member`→member(2,2) vs payment(2,1) · `product_price_hst`→catalog(1,1) vs inventory(1,0) |
| 주인 없음 → `'기타'` | 2 | `member_grade_pol`(5개 영역 전부 (0,1) 동률) · `pg_company`(2개 영역 (0,1) 동률) |

초안의 3단 계단 규칙이 2차·3차에서 갈랐던 두 테이블이 **사전식 비교 하나로 그대로 갈린다.**
주인 없는 2개는 실제로 여러 영역이 대등하게 참조하는 정책·마스터라 "주인 없음"이 사실에 맞는 서술이며,
임의 배정은 없는 소유권을 만들어내는 거짓 정보가 된다.

### 재검증 (2026-07-21)

- [NEEDS CLARIFICATION] **0건**. 해당 체크 항목 통과 처리.
- 결정 근거를 실측으로 보강했다: 테이블 22개 중 공유 15 · 전용 7 · 미사용 0(Neo4j `neo4j` DB 조회).
  SC-004의 "전용·미사용 0개 표시" 판정에 쓸 수 있는 정답지가 확보됐다.

### 착수 전 확인해야 할 선행 조건

현재 shopmall 분석 결과는 `PACKAGE`가 1개뿐이라 이 기능을 켜도 FR-004의 사유 표시밖에 나오지 않는다.
**실물 검증에는 영역이 2개 이상인 분석 결과가 필요하다.** 샘플을 여러 폴더로 재구성하는 작업(이
저장소 범위 밖)이 검증보다 먼저 끝나야 한다. 구현·단위검증은 이 선행 조건 없이도 진행할 수 있다.
