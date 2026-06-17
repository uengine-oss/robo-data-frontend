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
