# Feature Specification: 그래프 탐색 UX 재설계 (노드패널 보고서화 + 레이아웃 정합 + 스키마 단순화)

**Feature Branch**: `016-graph-exploration-ux`

**Created**: 2026-06-17

**Status**: Draft (합의 전 — 코드 착수 금지)

**Input**: 사용자 누적 피드백 — ① 노드패널이 밋밋(robo의 풍부한 의미데이터 미노출) ② 그래프 툴바가 우측 노드패널과 겹침 ③ Navigator가 토글 없이 갑자기 튀어나옴 ④ 데이터 스키마 스위처(캔버스/ER)가 뷰 전환 시 위치가 흔들림 ⑤ UML·Mermaid ER 거의 안 씀.

> spec [001-code-analysis](../001-code-analysis/spec.md)(코드 그래프) · [002-schema-browser](../002-schema-browser/spec.md)(데이터 스키마) · [015-graph-schema-split](../015-graph-schema-split/spec.md)(탭 분리) 의 **탐색 UX를 재설계**한다. 합의 후 001/002 본문 정합.

## Overview (현재 문제 — 사실 기반)

- **노드패널**: 식별 + 개요 거의 그게 전부. robo가 가진 **업무규칙·예시·질문·DB READS/WRITES·호출관계·원문코드**를 하나도 안 보여줌 → 밋밋.
- **레이아웃**: 그래프 툴바(상단 절대배치 z-index 100)가 우측 노드패널과 **물리적으로 겹침**.
- **Navigator**: 토글(`< >`) 없이 등장/사라짐 → "갑자기 튀어나옴".
- **데이터 스키마**: 캔버스(좌측 테이블목록 有)↔Mermaid ER(목록 無) 레이아웃이 달라 스위처 위치가 **들쭉날쭉**.
- **저활용 뷰**: UML(spec 015에서 제거 완료), Mermaid ER(저활용).

## 결정 (Decisions — 합의 대상)

1. **Mermaid ER 제거** — UML과 동일하게 **실제 제거**(MermaidERView 컴포넌트·스위처·mode 분기까지 삭제, 데드 코드 없음). 데이터 스키마 = **캔버스 전용**. 나중에 필요하면 **git 이력에서 재추가**. → 스위처 소멸로 위치 문제 원천 해소.
2. **IA 원칙 = 범위가 자리를 정한다(scope = location)**:
   - **노드 스코프**(클릭한 노드의 정보·관계) → **노드패널**
   - **그래프 전역**(영역·건강·테이블·모듈간·논리/물리명) → **상단 툴바**
   - **시각화** → **캔버스**. 노드 관계 "보기"의 **트리거는 패널, 효과는 캔버스**.
3. **노드패널 = 보고서형** — 상세 다 보여주되 **노이즈 제거·선별·조합**(데이터 있을 때만 섹션 노출).
4. **레이아웃 = "떠있는 절대배치" 금지 → 본문 폭을 존중하는 고정 영역**. Navigator·노드패널은 `< >` 토글 + 리사이즈.
5. **편집 단일 창구 = 데이터 스키마 캔버스(+우측 상세패널)**. (ER은 원래 보기 전용이었음 — 제거해도 편집 영향 0.)

## User Scenarios & Testing *(mandatory)*

### US1 - 노드 보고서 (P1)
사용자가 코드 그래프에서 노드를 클릭하면, 우측 노드패널이 그 노드의 **읽기 쉬운 보고서**(자기정보+의미데이터+관계)를 보여준다.
- **Test**: 함수 노드 클릭 → 이름(ID 아님)·타입·소속·라인·역할·건강 / 개요 / 업무규칙·예시·질문 / DB읽기쓰기 / 호출·피호출 / 원문(접힘)이 데이터 있는 만큼만 노출.

### US2 - 관계 탐색 (P1)
노드패널의 "관계" 섹션에서 호출/피호출/읽기쓰기 항목을 클릭하면 **캔버스에 그 이웃이 확장**된다(트리거=패널, 효과=캔버스).
- **Test**: 호출됨 목록의 항목 클릭 → 해당 노드가 캔버스에 추가·연결.

### US3 - 겹침 없는 레이아웃 (P1)
노드패널을 열면 캔버스 폭이 줄고 **툴바는 캔버스 폭 안**에만 있어 패널과 안 겹친다.
- **Test**: 노드패널 열기 → 툴바 버튼이 패널에 가려지지 않음.

### US4 - 일관된 토글 (P2)
Navigator·노드패널은 `< >` 토글로 명시적으로 열고 닫으며 폭 리사이즈된다("갑자기 튀어나옴" 없음).
- **Test**: 토글로 Navigator·패널 접기/펴기 + 드래그 리사이즈.

### US5 - 데이터 스키마 단순화 (P2)
데이터 스키마 탭은 **캔버스 하나**(테이블목록+캔버스+상세패널 편집). 스위처·ER·UML 없음.
- **Test**: 탭 진입 시 캔버스만, 뷰 스위처 없음. 편집(더블클릭→상세, 드래그→관계)은 그대로.

### Edge Cases
- 노드에 규칙/예시/질문/DB접근이 없으면 그 섹션 **숨김**(빈 칸·null·내부 id 노출 금지).
- 패널·Navigator 둘 다 접었을 때 캔버스 전체 폭.
- 데이터 0(테이블·그래프 미로드) 시 빈 상태 안내.

## Requirements *(mandatory)*

- **FR-001**: 노드패널 헤더는 **읽는 이름**(ID 아님)·타입배지·**소속(파일·모듈·패키지)**·**시작~끝 라인**(클릭→코드 점프)·역할·**건강지표**를 표시한다.
- **FR-002**: 노드패널은 robo 의미데이터를 섹션으로 노출 — **개요 / 업무규칙·예시·질문 / DB 읽기·쓰기 / 관계(호출·피호출·관련 테이블) / 원문코드(접힘 기본)**. 각 섹션은 **데이터 있을 때만** 렌더(노이즈 0).
- **FR-003**: 관계 섹션 항목 클릭 시 캔버스에 해당 노드를 확장한다(트리거=패널, 효과=캔버스).
- **FR-004**: 그래프 툴바·노드패널은 **절대배치 전면 오버레이가 아니라** 레이아웃 흐름 안에서 서로 폭을 존중해 **겹치지 않는다**.
- **FR-005**: Navigator·노드패널은 `< >` 토글 + 폭 리사이즈를 제공한다(예측 가능한 열림/닫힘).
- **FR-006**: 데이터 스키마 탭은 **캔버스 전용**(Mermaid ER·뷰 스위처 제거). 편집(설명·관계)은 캔버스+상세패널에서 그대로.
- **FR-007**: 백엔드 계약·데이터·분석 파이프라인 **무영향**(순수 프론트 UI 재설계). robo 의미데이터는 기존 그래프 속성/관계에서 읽는다.

## 노드패널 보고서 구조 (참고 레이아웃)
```
헤더:  🔧 <읽는 이름>            [타입]
       📄 <파일> : <시작~끝 라인>  ↗점프
       🏷 역할 · 📦 소속 · 💚 건강
─ 개요 ─────────────────────────
─ 업무규칙(n) · 예시(n) · 질문(n) ──   ★robo 고유
─ 데이터 접근:  ✏️쓰기 / 👁읽기 ──
─ 관계·상호작용: ←호출됨 / →호출 [캔버스에] ──
─ 원문 코드 [펼치기] ──
```
(섹션은 데이터 있을 때만. ID·null·내부필드 비노출.)

## 참고 서비스 (디자인 근거)
- **1순위 = robo-architect 본인 UI**(대표 지시 "디자인은 아키텍트 따라가라"): `InspectorPanel`(노드 상세 톤)·`FileTreePane`(좌측 토글 사이드바).
- VS Code(액티비티바+사이드바 토글) · Neo4j Bloom/Figma(겹침 없는 툴바) · Sourcegraph/IntelliJ(심볼 보고서·find usages).

## Blast Radius (착수 전 확정 필요 — 구현 plan에서)
- `components/graph/NodeDetailPanel.vue` — 보고서형으로 재설계(데이터 섹션·관계·점프). robo 의미데이터 소스(규칙/예시/질문/READS/WRITES/CALLS) 그래프에서 읽는 경로 확인.
- `components/graph/GraphTab.vue` — 툴바·노드패널 레이아웃을 겹침 없는 고정영역으로. Navigator/패널 토글.
- `SchemaTab.vue` / `SchemaView` — Mermaid ER·스위처 제거 → 캔버스 전용(`SchemaView` mode prop 정리).
- `MainLayout`/`SideNav` — Navigator `< >` 토글 일관화.
- (참고 읽기) 아키텍트 `InspectorPanel.vue`·`FileTreePane.vue` 구조.

## 잔여 버그 (이 스펙과 별개, 따로 처리) — 2026-06-17 사실확정

> **전제 확정(Neo4j 직접 조회)**: 분석은 정상 — TABLE 16·COLUMN 153·HAS_COLUMN 153·READS 117·WRITES 40·AFFECTS_TABLE 105·FUNCTION 456·RULE 112·EXAMPLE 125 존재. **DDL 처리·테이블 생성 정상**. 문제는 "데이터가 화면까지 안 옴".

1. **노드 상세패널 제목 ID 표시** — navigator는 고쳤으나 상세패널(NodeDetailBase `nodeName`/FunctionCard `technicalNodeName`) 미적용 → `signature` 폴백 추가. (FR-001로 흡수)
2. **데이터 스키마 탭 (테이블·관계)** — 두 겹:
   - **2a. 인증 (✅수정완료)**: catalog `.env`에 Neo4j 비번 없어 기본값 `"neo4j"`로 시도→`Unauthorized`→`AuthenticationRateLimit`. → catalog `.env`에 analyzer와 동일 자격 추가(코드의 ".env 폴백" 설계의도대로). 500 사라짐.
   - **2b. 라벨 대소문자 불일치 (★미해결 핵심)**: 인증 후에도 `[]`(0개). 카탈로그가 **`:Table`(PascalCase)** 로 쿼리(`catalog_router.py:573` 등)하나 Neo4j 실제 라벨은 **`:TABLE`(UPPER_SNAKE)** (analyzer write) → 0 매치. **계약 아틀라스 확정**: analyzer write=UPPER_SNAKE(line29), catalog query/응답=PascalCase(line31), analyzer 스트림 emit=PascalCase(line23) — **3자 표기 불일치**.
3. **코드 그래프 Navigator TABLES=0** — 위 2b와 **같은 뿌리(라벨 표기 불일치)** 일 가능성: 스트림 emit는 `Table`(Pascal)인데 프론트 Navigator는 `TABLE`(UPPER) 기대 등. 확정 후 수정.

### 라벨 표기 통일 결정 (cross-service 계약 — 합의 필요)
- **정본 후보 ① UPPER_SNAKE(`:TABLE`)** ⭐추천 — Neo4j 실제 데이터가 이미 UPPER_SNAKE라 **재분석 불필요**. catalog 쿼리/응답 + analyzer 스트림 emit + 프론트 기대치만 UPPER로 정합.
- 정본 후보 ② PascalCase(`:Table`) — analyzer Neo4j write까지 바꿔야 함 → **전체 재분석 필요**(더 큼).
- → ①로 가면 데이터 안 건드리고 catalog/stream/front만 맞추면 테이블이 양쪽에 뜸. (단 catalog 자체 분석이 `:Table`을 write하는 경로가 있으면 그쪽도 함께 점검.)

## 구현 순서 (plan 초안)
1. (확인) 아키텍트 InspectorPanel·robo 의미데이터 소스 경로 사실확정.
2. NodeDetailPanel 보고서화(FR-001·002·003) — 임팩트 최대.
3. 레이아웃 겹침 해소 + Navigator/패널 토글(FR-004·005).
4. 데이터 스키마 캔버스 전용화(FR-006).
5. 빌드 → 런타임 검증 → 회귀 점검.

---

# ★ 노드 보고서 + 전략/구조 인지 설계 확정 (2026-06-17 합의 — 전수조사 근거)

## 목표(북극성)
레거시 코드 분석 도구 — 그래프로 **가독성 있게 시각화**하여 **코드에 숨은 내용을 하나도 안 빠뜨리고** 분석가가 읽게 한다. 노드 패널 = **"이 노드 1개에 대한 분석 보고서"**.

## 사실 확정 — DBMS vs Framework 구조 차이 (코드, file:line)
analyzer는 **하나의 스키마를 두 방식으로** 채움(13노드/19엣지 공통). 차이는 딱 3개:
- **DBMS-only**: 호출단위(프로시저/함수/트리거) **아래 구문 AST 트리**(PARENT_OF + `own_ast_type`: SELECT/INSERT/IF/LOOP/CURSOR/MERGE/UNION_ALL…). `graph_nodes.py:178` own_ast_type, `parent_of.py`.
- **Framework-only**: ① sub_label(`:FUNCTION:METHOD`·`:MODULE:CLASS/INTERFACE`, ontology 도출, `graph_nodes.py:157` DBMS 빈값) ② DATA_TYPE+HAS_MEMBER(C struct만).
- DBMS MODULE = **파일**(`antlr_json_reader.py:290` `_make_module(file_stem)`), 한 파일에 프로시저 N개 가능.
- **없는 것(가짜 생성 금지)**: DB_LINK·LINKS_TO·UML 상속(EXTENDS/IMPLEMENTS)·DATA_FLOW — **그래프에 데이터 0**(exhaustive grep). → 분석가에게 "이 도구 미추출" **한계만 명시**.
- READS/WRITES 분류(`link_dbms_tables_step.py`): SELECT/WITH→읽기, INSERT/UPDATE/DELETE/MERGE→쓰기, 제어문→엣지 없음. DBMS 엣지는 `dml_type`(graph_edges.py:88) 세분.
- skip 노드 DECLARE/TRY/TRIGGER_BLOCK = 분석 제외(`batch_planner.py:23`) → summary 없음.

## 보고서 3원칙
1. **완전성(누락0, 잘라내기0)**: SUMMARY는 `[핵심]`만 X → **핵심+전체 내용** 표시(현재 220px 클립 제거). 유용한 데이터는 절대 생략 안 함.
2. **무노이즈**: 빈 섹션 자동 숨김 / **내부 식별자(function_id·rule_hash·component_id) 비노출** / 중복 제거 / 코드토큰 대신 의미.
3. **가독성**: 각 섹션 첫 줄 = 한 줄 종합("읽기3·쓰기1") 후 상세 / 배지로 한눈 사실 / 라인·관계 클릭→점프(탐색 허브) / architect `InspectorPanel` 톤.

## 보고서 섹션 (위→아래 중요도순, 데이터 있을 때만)
| 섹션 | 내용 | 전략 |
|---|---|---|
| 식별·위치 | 이름(구문=`라벨[라인]`/프로시저=이름) · 타입배지 · 역할(stereotype) · 위험(있으면) · 파일·라인→점프 | 공통 |
| 개요 | summary `[핵심]`+**전체 내용**(도메인값·임계값 강조) | 공통 (skip노드="분석 제외 구문") |
| 업무규칙·예시·질문 | RULE/EXAMPLE/QUESTION (un-hide 완료=semanticLinkMap) | 공통 |
| 데이터 접근 | READS/WRITES + dml_type + 테이블역할 + 컬럼(table_insights) | DBMS 더 세분 |
| 관계 | 호출/**피호출**(incoming) — 클릭→캔버스 | 공통 |
| 구성(자식) | DBMS=내부 구문흐름(AstFlow) / FW모듈=멤버 메서드 / C=struct멤버 | **구조별 분기** |
| 인터페이스 | params·return·annotations(데코레이터) | **Framework** |
| 원문 코드 | 본문(접힘) | 공통 |

## 아키텍처 (★수정원칙: 0순위 영역설계·DRY·탈바꿈 — 산발 strategy `if` 금지)
```
node-detail/
 nodeClassify.ts   ★단일 판정처 — node→{strategy, role(컨테이너|호출단위|구문), astType,
                    배지글자, 표시이름, 표시섹션}. 전략 분기는 "오직 여기".
 NodeReport.vue    보고서 컨테이너(헤더+섹션 on/off, 데이터 유무로 자동)
 sections/         OverviewSection·RulesSection·DataAccessSection·RelationsSection·SourceSection (공통)
                   AstFlowSection (DBMS전용·분리) · InterfaceSection (FW전용·분리)
 cards/(templateRouter)  노드종류별 + FallbackCard (★모든 노드 소화)
```
- 공통 5섹션 = 두 전략 공유(중복0). 다른 것만 전용 파일(AstFlow/Interface). 컴포넌트는 `if(dbms)` 안 씀 → nodeClassify가 준 "표시섹션"·데이터유무로만 렌더. 기존 NodeDetailBase를 공통 골격으로 **탈바꿈**(땜빵·재작성 X).

## 배지(아이콘) — 글자 방식(Framework처럼), 이모지 X
타입 **앞글자** 배지: 호출단위=F / DBMS 구문=own_ast_type 첫 글자(S/I/U/R/L/M…). Framework 무영향. (읽기/쓰기/흐름 색은 옵션.) 상세=017.

## FR 추가
- **FR-008**: 노드패널은 모든 노드 라벨을 소화한다(templateRouter+Fallback). 미지정 노드도 안전 렌더.
- **FR-009**: DBMS/Framework 렌더는 **nodeClassify 단일 판정 + 데이터유무 기반**으로 분기하며, 컴포넌트에 strategy 조건문을 흩뿌리지 않는다(유지보수·DRY).
- **FR-010**: SUMMARY는 전체 내용을 표시한다(핵심만 잘라내지 않음).
- **FR-011**: 없는 데이터(DB링크·상속)는 생성하지 않고, 필요 시 "미추출" 한계만 명시한다(정직).

---

# ★★ 근본 전환 갱신 (2026-06-17 — analyzer가 깨끗한 속성 저장. 위 "파싱" 접근 폐기)

> 이전 본문(특히 line 97 "signature 폴백", line 124·151·161 own_ast_type 프론트 도출/배지 파싱)은 **프론트가 `function_id`/`signature`를 파싱**하는 옛 접근이다. 전수조사 결과 **그게 'F'배지·오해의 근본 원인**이었다(데이터는 있는데 안 꺼내 쓰고 키를 쪼갬). 아래로 **대체**한다. 백엔드 계약 = analyzer 신규 스펙 [analyzer/016](../../../robo-data-analyzer/specs/016-node-display-properties/spec.md) — **DBMS 노드 라벨 = antlr type 그대로**(SELECT→`:SELECT`, PROCEDURE→`:PROCEDURE`; 더 이상 `:FUNCTION` 뭉개기 아님) + `name`·`code_text` 속성. 그러면 프론트는 **라벨·속성 직독**(파싱 0).

## 전환 원칙 (사용자 확정)
1. **타입은 라벨에서 직독(파싱·속성 X)**: 노드 타입·배지 = **primary 라벨**(DBMS=antlr type `:SELECT`/`:PROCEDURE`, Framework=sub-label `:METHOD`). 프론트 기존 `pickDisplayLabel`/`extractSubLabel`(역할라벨 제외 구체라벨 추출)이 **이미 둘 다 처리** — DBMS가 제대로 된 라벨만 받으면 'F' 대신 SELECT/PROCEDURE가 자동으로 나온다. ❌`ast_type` 속성 같은 건 없음(라벨이 타입). 표시이름 = `properties.name || (타입라벨 + '[' + start_line + ']')`. 식별 = **elementId** 단일. function_id·parent_id는 표시에 안 씀(트리는 PARENT_OF 엣지).
2. **파싱 코드 삭제(탈바꿈)**: `nodeClassify.ts`의 `ownAstType`(signature 파싱)·`dbmsRoutineName`(signature DDL 정규식)·signature 기반 배지 도출 — **삭제**. `graphDisplay.ts technicalNodeName`의 signature 정규식·function_id 분해 — 삭제. nodeClassify는 `properties.ast_type`/`name`을 **읽기만** 한다.
3. **유령필드 폴백 제거(오해소지 차단, 코드로 확정)**: analyzer가 **안 쓰는데** 프론트가 읽던 필드 = `procedure_name`·`class_name`·`method_id`·`table_id`·`title`(analyzer.ts:141·navigator.ts:113·graphDisplay.ts:47) → 폴백 체인에서 제거(정본=`name`·`logical_name`). `actor`(FunctionCard:59 역할, analyzer 0건) → **`stereotype`으로 정렬**(이미 있는 값). `code_text`(FunctionCard:60, 옛 유령) → 이제 analyzer가 저장(실데이터)로 전환 = 원문코드 섹션 정상화.
4. **죽은 라벨/엣지 분기 제거**: `BusinessLogic` 라벨 + `HAS_BUSINESS_LOGIC`·HAS_PROCEDURE·HAS_METHOD·HAS_CLASS·CONTAINS·FROM·REFER_TO·FK_TO_TABLE·CALLS_SQL·USES 등은 **13노드/19엣지 계약에 없음**(grep 0) → navigator/nodeRelationships의 해당 분기는 데드코드, 정리(실재 계약: CALLS·READS·WRITES·AFFECTS_TABLE·PARENT_OF·HAS_FUNCTION·HAS_COLUMN·HAS_RULE/EXAMPLE/QUESTION·FK 등). ※주의: schema 기능의 `procedure_name`은 catalog 스키마 API 응답 필드라 거긴 실재 — 그래프 노드속성 맥락과 구분(건드리지 말 것).
5. **테이블 상호작용 뷰 = 신규 제작 아님, 기존 확장**: 「모듈간 상호작용」 프리셋이 이미 FUNCTION→TABLE READS/WRITES를 가상링크 합성(`graphCanvas.ts:58-145`), READS/WRITES 분류상수 존재(`nodeRelationships.ts:59-70`), relSummary가 노드별 테이블상호작용 표시(`NodeDetailBase.vue:88-165`). → 새 프리셋 `table-interaction`을 **기존 프리셋 패턴에 추가** + 엣지타입 필터를 `matchesLabelFilter`(NvlGraph.vue:228) **형제로 추가**(읽기만/쓰기만 = READS/WRITES 분류). 「전체 테이블」(showAllTables)은 **제거**.
6. **건강지표** = 데이터 있음(risk 453/456, lowercase). NvlGraph.vue:111 `properties.risk` 직독은 옳음 — colorMode='health' **토글 배선·재조회 타이밍**(risk는 step7 부여→/robo/graph 재조회에만) 디버그가 잔여 작업.

## FR 대체·추가
- **~~FR-001/FR-002의 "signature 폴백·own_ast_type 프론트 도출"~~ → 대체**: 타입·배지는 **primary 라벨 직독**(pickDisplayLabel 기존 로직), 이름은 `properties.name` 직독. function_id/signature 파싱 금지. ast_type 속성 없음.
- **FR-007 정정**: 본 스펙은 더 이상 "백엔드 무영향"이 아니다 — **analyzer 016 의존**(DBMS 라벨=antlr type + name·code_text). analyzer 016 합의·구현·재분석 후 프론트 직독 전환.
- **FR-012(신규)**: 프론트는 노드 식별에 elementId만 쓰고, function_id·parent_id·fqn를 표시 도출에 쓰지 않는다.
- **FR-013(신규)**: 유령필드 폴백(procedure_name/class_name/method_id/table_id/title)과 계약 외 라벨/엣지 분기(BusinessLogic·HAS_PROCEDURE 등)를 제거한다. 역할=stereotype, 원문=code_text(analyzer 저장).
- **FR-014(신규)**: 그래프 좌상단 플로팅 툴바(`GraphTab.vue` `.floating-controls.left-top`) 구성 = **논리/물리명 토글 · 모듈간 상호작용 · 영역 보기 · 건강 보기**. ★**「전체 테이블」 제거**(✅완료 — `showAllTables` 버튼·함수 삭제): 캔버스는 "노드 클릭→이웃 확장(필터)" 모델이라 전체 덤프는 중복·무의미(사용자 확인 2026-06-18). 함수↔테이블 읽기/쓰기 구분은 ⒜노드패널 "테이블 상호작용" 섹션(READS/WRITES per 노드)·⒝모듈간 상호작용 프리셋이 이미 보여줌. 별도 읽기만/쓰기만 **캔버스 엣지필터**는 `matchesLabelFilter` 형제로 추가(기존 인프라 확장, 중복 제작 금지) — 빌드 피드백 보며 마감.
### ★ 노드패널 보고서 — 라이브 UX 피드백 (2026-06-17, 구문 노드 화면 기준)
- **FR-021 북극성(패널 목적)**: 노드 클릭 시 **한눈에** ① 이 노드가 **뭐하는지**(요약·역할) ② **영향도**(호출/피호출·읽기/쓰기 테이블 = 바꾸면 뭐가 영향받나) ③ **누구와 관련**(관계) ④ 원문·위치 를 파악. **영향도(impact)를 핵심 축으로** 부각(관계 섹션을 "이 노드가 주는/받는 영향"으로 프레이밍). 예쁘고 스캔 가능한 구조.
- **FR-022 건강지표 표시**: 노드패널 헤더/섹션에 이 노드의 **건강지표(risk·fan_in/out·loc·god_flag·table_coupling)**를 표시(있을 때). + 그래프 건강뷰(colorMode='health') 작동 점검 — risk는 step7 부여라 **/robo/graph 재조회 시점에만** 존재(스트림 node_event엔 없음) → 토글 배선·재조회 타이밍 디버그. 범례(GraphStylePanel) 표시 상태 점검.

- **FR-016 헤더 식별 정리**: 선택 노드를 패널 **상단에 명확히** 표시. ★**elementId·raw id 절대 노출 금지**(현재 `4:eb66bfb2-…:72`가 이름 자리에 뜸 = 버그). 표시명 = `name` 있으면 name / 없으면(구문) **`타입[라인]`("IF [41~44]")** / `logical_name`은 보조 병기. 타입 배지·소속(파일)·라인범위를 **각 값에 라벨 달아 정렬**(뭐가 무슨 값인지 명확), 노이즈 제거.
- **FR-017 Summary 전체(FR-010 강화)**: `[핵심]` 헤드라인 + **전체 본문**을 시각 구분해 모두 표시(핵심만 잘라내지 않음).
- **FR-018 업무규칙·예시·질문 명확화**: 섹션이 무엇인지(코드에서 추출한 업무규칙/시나리오/확인질문 = Example Mapping) **한 줄 안내** + summary와 **내용 중복 제거** + 데이터 있을 때만. 사용자가 "왜 뜨는지" 알 수 있게.
- **FR-019 원문코드 표시**: `code_text`(analyzer 016 저장) 섹션을 노드패널에 표시(접힘 기본 가능). 자기 요약 + 원문을 함께. (현재 미표시 = code_text 유령 → analyzer 016으로 채움.)
- **FR-020 레이아웃 가독성 재구성**: 예쁘고 읽기 쉬운 레이아웃으로 재구성. **과도한 숨김 지양**(데이터 있을 때만 노출하되 균형 — 빈약/노이즈 둘 다 회피). 섹션 정렬·간격·타이포 정돈.

- **FR-015(신규, 2026-06-17 사용자)**: 노드패널의 **설명 출처 라벨을 약어 없이 명확히** 한다. 현재 `TableCard.vue:106` 탭 버튼 **"DDL"**은 "이 설명(예 '웹 공급량 정보')의 출처 = 테이블 정의 SQL의 `COMMENT ON`/주석"이라는 뜻인데, 약어만 떠서 분석가가 의미를 모름(보고서 3원칙 "비개발자도 이해" 위반). → **"DDL" → "테이블 정의 주석"**(또는 툴팁 "테이블 생성 SQL의 주석에서 가져온 설명") / "코드 분석"(LLM 합성=analyzed_description) 유지. Column 설명 출처도 동일 적용. `description_source`(ddl/code/catalog) 값별 한국어 라벨 매핑.

## 선행 의존
analyzer 016(name·ast_type·code_text 저장) **먼저 구현·재분석** → 그래프에 새 속성 확인 → 그 다음 프론트 직독·파싱삭제(회귀 방지: 속성 없는 기존 데이터엔 빈값 폴백 안전 렌더).
