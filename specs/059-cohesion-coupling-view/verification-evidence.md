# 059 검증 증거 — 원칙 원문 대조

**Date**: 2026-07-21 · 대조 대상: 사용자 절대원칙(`principles`) §1~§11, `speckit` §1~§8,
`robo-data-frontend` constitution I~IV

각 항목은 **원칙 원문**과 **실행한 명령·결과**를 짝지어 적는다. 증거 없는 항목은 "미검증"으로 남긴다.

---

## §1 착수 전 필수 관문

> "현재 사실은 원문 코드, 설정, Git 상태, 실제 실행 결과로 확인한다. 메모리·옛 스펙·추측을
> 사실처럼 말하지 않는다."

| 확인한 사실 | 증거 |
|---|---|
| analyzer 156개 파일 dirty, `075` tasks 48체크/52미체크 | `git status --short \| wc -l`, `grep -c "^- \[x\]"` |
| analyzer 단위테스트 기준선 | `python -m unittest discover -s tests -t .` → **267 tests OK (skipped=1)** |
| 그래프 실측 | Neo4j `neo4j` DB 조회 — 노드 3445, `PACKAGE` 1, `FILE` 12, `FUNCTION` 127, `TABLE` 22 |
| `MODULE` 라벨의 정체 | 실조회 결과 `labels=['EXTERNAL','MODULE']`, `stereotype=None`, id `code:external:module:*` 3건 → **초기 가설(LLM stereotype 오염) 철회** |

> "변경 전 SpecKit으로 스펙·계약·영향범위·검증 기준을 확정한다."

`spec.md` → `plan.md` → `research.md`/`data-model.md`/`contracts/` → `tasks.md` 순으로 작성 후 구현.
`create-new-feature.ps1` 원문을 읽어 **`git ` 명령 0건**임을 확인하고 실행(브랜치·WIP 무영향).

---

## §2 전수조사와 영향도

> "함수 시그니처, 필드, export … 를 바꾸면 즉시 저장소 전체를 검색해 모든 생산자와 소비자를 함께
> 수정한다. 옛 이름과 끊어진 참조가 0인지 확인한다."

- `getRelationshipColor(type)` → `(type, crossesArea?)`: 소비처 전수 6곳을 `research.md` R5에 고정.
  두 번째 인자를 **선택적**으로 두어 기존 호출부 무변경. 동명이인
  `ObjectExplorerGraph.vue:226`은 **다른 feature의 지역 함수**라 제외(오판 방지 기록).
- `colorLabelOf(labels, …)` → `colorLabelOf(node, …)`: 소비처 2곳(`NvlGraph.vue:139`,
  `NodeDetailBase.vue:67`) 모두 같은 슬라이스에서 수정.
- 옛 심볼 grep 결과:

| 심볼 | 잔존 |
|---|---|
| `rolesOf` | **0** |
| `HEALTH_COLORS` / `HEALTH_NEUTRAL` | **0** |
| `buildHealthGraph` / `makeRoutineResolver` | **0** |
| `colorMode` | **0** |
| `hierarchyMap` / `HierarchyInfo` | **0** |
| `health-rw` | 1 — `graphCanvas.ts` **삭제 사유를 적은 주석**뿐(코드 0) |

### 보기 모드 교체로 죽은 로직 정리 (사용자 지시: "필요없어진 로직 제거")

`모듈간 상호작용`이 **영역 자체를 노드로** 그리게 되면서 아래가 무의미해져 삭제했다.

| 삭제 | 왜 죽었나 |
|---|---|
| `hullLevels` 의 module 분기 | 패키지 노드에는 `packageKey` 가 없어 **항상 null 을 돌려주던 분기** |
| `clusterKeyOf` / `clusterLabelOf` 의 module 분기 | '모듈/테이블/external 3분할'은 테이블을 최상위 구역으로 세워 선이 화면을 가로지르게 만든 원인. 이제 테이블은 소속 영역에 흡수된다 |
| `hierarchyMap` computed + `HierarchyInfo` 인터페이스 | 위 세 곳이 유일한 소비처였다. 제거 후 저장소 전체 참조 **0** |

삭제 후 회귀: 타입오류 **259(기준선 동일)**, 계약 테스트 통과, 057 테스트 통과.
`isContainerNode` 는 `buildModuleInteractionGraph` 가 계속 쓰므로 import 유지(참조 2건 확인).

---

## §3 근본해결과 회귀금지

> "우회, 임시 플래그, 특수 케이스 누적 … 을 금지한다. 수정할수록 분기·맵·병합 로직이 늘면 멈추고
> 설계를 다시 본다."

- **테이블 주인 판정에서 계단식 규칙을 제거했다.** 초안은 `쓰기 최다 → 총 연결 최다 → 이름 순`
  3단이었으나, 사용자 지시("모든 상황에서 처리 가능한 솔루션이 아니면 추가하지 말 것")에 따라
  `(쓰기, 읽기)` **사전식 비교 하나**로 통합하고, 최대가 유일하지 않으면 **주인을 정하지 않는다**.
  결과: 규칙 2개 삭제, 실데이터 결과는 동일하거나 더 정직해짐(주인 있음 20 / 없음 2).
- **내부(구문) 판정에 라벨 목록을 쓰지 않는다.** DBMS 라벨은 antlr 타입 그대로라 어휘가 열려 있어
  denylist/allowlist 둘 다 반드시 샌다. "세 층 어디에도 안 걸리면 내부"라는 **여집합 정의**로 해결.
- **전략 분기 0**: `if (strategy === 'dbms')` 를 한 줄도 넣지 않았다. `PARENT_OF*0..10` 한 식이
  Framework(출발=루틴)와 DBMS(출발=구문)를 함께 덮는다.

> "A를 고쳐 B가 깨지지 않도록 …"

| 시점 | 저장소 전체 타입오류 |
|---|---|
| 착수 전 기준선 | **259** |
| 층 칩 구현 중(내가 낸 회귀) | 263 |
| 회귀 수정 후 | **259** — 기준선 복귀 |

057 회귀: `npm run test:panel-projection` → `OK`, `type-check:panel-projection` → 오류 0.

---

## §4 디버깅 — 가설은 반증한 뒤 확정

> "가설은 로그·역실험·최소 재현으로 반증한 뒤 원인으로 확정한다."

- `MODULE (1)` 원인 가설 = "검증 안 된 LLM stereotype이 라벨로 박힘" → **실데이터 조회로 반증**.
  실제로는 `calls.py:40`이 의도적으로 만드는 외부 stub 컨테이너 라벨. 가설을 철회하고
  `research.md`·checklist에 기록.
- 색 예약 구역 침범(`REPOSITORY` hue=23) → 원인은 `Math.round`가 구간 상단값을 밀어 올린 것.
  `Math.floor` + 밴드 ±20° 로 수정 후 재측정: 라벨 30종 최소 이격 **20°**.

---

## §5 설계와 코드 품질 / DRY

> "같은 정책·계약·판단은 단일 진실에서 재사용한다."

| 판단 | 단일 정의처 | 사본 |
|---|---|---|
| 층(모듈/루틴) 라벨 집합 | `shared/utils/nodeClassify.ts` (`CONTAINER_LABELS`/`CALLABLE_LABELS`) | 0 — `areaGraph.ts` 는 **주입받는다** |
| 관계 색·표시명 | `shared/config/graphStyles.ts` | 0 |
| 테이블 주인·영역 간 집계 | `features/code-analysis/areaGraph.ts` | 0 |
| 층 칩 판정 | 캔버스 스토어(→ nodeClassify) | 0 — 패널은 props/emit 표현 전용 |

패널이 스토어를 직접 참조하던 첫 구현은 **표현 전용 원칙 위반**이라 props/emit으로 되돌렸다.

> "임시 산출물은 전용 경로에 둔다. 저장소 루트에 로그·스크린샷·실험 파일을 방치하지 않는다."

진단 스크립트 전량을 세션 scratchpad에 두었다. 저장소에 추가된 파일은
`src/features/code-analysis/areaGraph.ts` 와 `specs/059-cohesion-coupling-view/` 뿐이다.

---

## §6 검증

> "빌드 통과만으로 완료하지 않는다." / "개수만 맞는 것을 정확성으로 간주하지 않는다."

| 검증 | 결과 |
|---|---|
| 계약 테스트(반대 사례 N1~N12) | 통과 |
| 순수 모듈 strict 타입검사 | 오류 0 |
| **실데이터 대조** — 테이블 22개 주인 판정 | **22/22 일치**. 개수가 아니라 **테이블별 주인 이름**을 Cypher 독립 산출값과 1:1 대조 |
| 색 계약 | 2축 색·표시명·hue 예약 전부 실제 함수 실행으로 확인 |

> "UI 작업은 Playwright 등으로 실제 화면을 띄워 캡처를 직접 보고 …"

**미검증.** 현재 그래프의 `PACKAGE`가 1개뿐이라 영역 간 결합을 그릴 데이터가 없다. 화면 검증은
샘플 폴더 분리 후에만 가능하다. 이 사실을 `spec.md` Assumptions와 `plan.md` 위험표에 명시했다.

---

## §7 UI 원칙

> "같은 의미는 모든 화면에서 같은 색·아이콘·용어·정렬 규칙을 쓴다."

- 관계 색을 캔버스·범례·통계·스타일 패널이 **같은 함수**에서 받는다. 영역 정보를 모르는 소비처는
  대표색(영역을 넘는 쪽)을 쓰도록 기본값을 정해 색 체계가 갈라지지 않게 했다.
- 미소속 대상 처리는 저장소에 이미 있던 규칙(`__ungrouped__` → '기타')을 재사용했다.

> "작은 표식은 범례나 표준 라벨로 뜻을 설명한다."

층 칩에 구성 종류를 툴팁으로 붙였다(예: 모듈 = '파일·클래스·PL/SQL 패키지').

---

## §9 소통과 Git / WIP 보존

> "사용자 WIP를 보존한다. 관련 없는 변경을 되돌리거나 덮지 않고 …"

| 057 점유 파일 | 상태 |
|---|---|
| `panelGraphProjection.ts` | mtime **2026-07-17 12:11** — 무변경 |
| `scripts/test-panel-relationship-projection.mjs` | mtime **2026-07-17 12:21** — 무변경 |
| `package.json` | diff = 057의 스크립트 2줄뿐. 내 변경 0 |
| `tsconfig.panel-projection.json` | 무변경 |

`graphCanvas.ts`는 계획에 명시한 지점만 수정했고, `git diff`에서 057의 `panelProjection` 관련
추가분이 그대로 남아 있음을 확인했다. 커밋은 하지 않았다(요청 범위 밖).

---

## §11 구조 리팩토링 특별 원칙

> "구조 변경 전 동작 기준선과 외부 계약을 먼저 고정한다."

착수 전 기준선을 먼저 측정했다: analyzer 단위테스트 267 OK, 프론트 타입오류 259,
그래프 노드/관계 실측치, 각 저장소 `git status`.

> "삭제는 소비자 0을 코드·동적 로딩·문서 명령·CI·외부 러너까지 재확인한 뒤 한다."

건강 보기 삭제 전 `research.md` R4에 소비처를 전수 목록화하고, 삭제 후 grep 0을 확인했다.
`analyzer.ts` 의 `health_metrics_step`은 **분석 진행 단계 이름**이라 삭제 대상이 아님을 명시해
오판을 막았다.

---

## Constitution (robo-data-frontend)

| 원칙 | 판정 | 근거 |
|---|---|---|
| I. 단일 라우트 + 탭 | PASS | 라우트 추가 0 |
| II. 기능 폴더 모듈성 | PASS | 신규 코드는 `features/code-analysis/`, 공용은 기존 `shared/` 재사용 |
| III. 게이트웨이 경유 API | PASS(해당 없음) | 신규 백엔드 호출 0 |
| IV. 실연동과 목업 구분 | PASS | 저장된 값만 사용. 저장 안 된 지표(거대 루틴 등)를 만들지 않았고, 순환 고리는 저장돼 있지 않아 이번 범위에서 제외 |

---

## 미검증 항목 (완료 아님)

1. **실제 화면 캡처** — `PACKAGE` 1개라 불가. 샘플 폴더 분리 선행 필요.
2. **`npm run build`** — 기준선부터 실패(기존 259 오류). 057 tasks T004에 같은 사실이 기록돼 있어
   이번 변경과 무관하나, 통과시키려면 기존 오류 정리가 선행돼야 한다.
3. **서로 다른 언어 결과 2개 대조**(SC-006) — DBMS 분석 결과를 같은 그래프에 적재해야 하는데,
   프로젝트 층이 없어 지금 하면 의미가 섞인다. 프로젝트 층 도입 후로 미룬다.
4. **발견된 문제 목록**(US5) — 사용자가 우선순위 낮음으로 지정, 별도 UI/UX 설계 대상.
