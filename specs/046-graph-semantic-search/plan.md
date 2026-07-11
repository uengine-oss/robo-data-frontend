# Implementation Plan: 그래프 탭 의미 기반 코드 검색

**Branch**: `046-graph-semantic-search` | **Date**: 2026-07-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/046-graph-semantic-search/spec.md`

## Summary

그래프 탭 Overview 패널의 기존 이름검색 **아래에** "의미 기반 관련 코드" 섹션을 붙인다. 사용자가 업무 말로 물으면 버튼 하나로 백엔드 스트림 검색을 실행하고, 진행 단계·경과초·취소를 결과가 나올 그 자리에 표시하며, 반환된 코드 뭉치를 클릭하면 관계와 함께 캔버스에 올린다. **새 백엔드 로직·새 raw 통신 경로는 없다** — 기존 게이트웨이 경유 NDJSON 스트림 소비 계층(`streamFetch`)을 재사용하고, 표시 계층 + 상태 스토어 + 검색 UI 재배치로 구현한다.

핵심 설계 결정 = **역할 분리로 FR-005 근본 해결**: "검색 = 캔버스로 가져오기(retrieve) / 캔버스 클릭 = 노드 상세 보기(inspect)". 지금은 Overview 검색 결과를 클릭하면 패널이 노드 상세(Node 뷰)로 통째 전환되어 검색 맥락이 소실된다. 이를 **결과 클릭 = 캔버스에 올리기만**(패널은 Overview 유지)로 바꾼다. 노드 상세는 캔버스의 노드를 클릭해 본다. 이름검색·의미검색 결과가 같은 규칙을 따른다.

## Technical Context

**Language/Version**: TypeScript 5.x / Vue 3 (SFC, `<script setup>`)

**Primary Dependencies**: Vue 3 · Pinia · NVL(그래프 캔버스) · Vite. 재사용 공유 계층 = `shared/services/http.ts`(`streamFetch` NDJSON 파서·게이트웨이 base·세션헤더), `shared/stores/session.ts`(getHeaders·activeTab), `features/code-analysis/graphCanvas.ts`(`addNodeToCanvas`).

**Storage**: N/A — 표시 계층. 검색 상태는 새 Pinia 스토어(`semanticSearch`)가 메모리에 보유. 그래프 데이터는 기존 `analyzer` 스토어(nodeMap/linkMap)와 Neo4j.

**Testing**: Playwright 헤드리스 자가검증(스크린샷을 직접 Read) + `npx vite build` 컴파일 게이트. (UI 단위테스트 별도 미요청 — constitution/§6 실행검증.)

**Target Platform**: 웹(vite dev 3000 standalone) + Electron/Module Federation 임베드. 둘 다 같은 SFC.

**Project Type**: Web frontend (단일 프로젝트, 기능 폴더 모듈성).

**Performance Goals**: 이름검색·버튼·안내 즉시 반응(<100ms). 의미검색 실행은 백엔드 소요(~40초)에 종속 — 표시 계층은 진행 스트림을 지연 없이 렌더하고 경과초를 1초 단위로 갱신.

**Constraints**: 새 API 클라이언트·raw fetch 금지(게이트웨이+세션헤더 재사용, constitution III). 매직 px 금지 → flex/grid·상대단위(constitution/§4). 질의 길이·형태로 분기 금지(해피패스 금지). 특정 소요초 하드코딩 금지.

**Scale/Scope**: 신규 1 스토어 + 1 API 메서드 + streamFetch 시그니처 확장(하위호환). 수정 SFC = NodeDetailPanel · GraphTab · TopToolbar · NavigatorPanel. 그래프 수백 노드·뭉치 수십 개 규모.

## Constitution Check

*GATE: Phase 0 전 통과 필수. Phase 1 후 재확인.*

| 원칙 | 판정 | 근거 |
|---|---|---|
| **I. 단일 라우트 + 탭** | ✅ PASS | 새 라우트 0. 기존 graph 탭 안에서만 동작. ⌘K도 `session.activeTab` 기준 라우팅(URL 미사용). |
| **II. 기능 폴더 모듈성** | ✅ PASS | 신규 스토어·API는 `features/code-analysis/` 안. 교차 사용은 `shared/services`·`shared/stores`의 명시적 import(streamFetch·getHeaders·activeTab)와 `shared/components/TopToolbar`(전역 검색 소유처)뿐. 타 기능 내부 침투 없음. |
| **III. 게이트웨이 경유 + 세션 헤더** | ✅ PASS | 새 호출은 `ROBO_BASE_URL`(`/api/gateway/robo`) 경유 + `session.getHeaders()`(X-Neo4j-*). raw fetch 0. `streamFetch` 재사용. |
| **IV. 실연동 vs 목업 정직성** | ✅ PASS (강화) | 목업 0. 실 백엔드 스트림 소비. 실패·0건·임베딩 없음을 정직하게 안내(FR-013/14). 예시 칩·거짓 장식 없음(FR-015). |

**게이트 통과** — 위반 없음. Complexity Tracking 불요.

## Project Structure

### Documentation (this feature)

```text
specs/046-graph-semantic-search/
├── plan.md              # (this file)
├── research.md          # Phase 0 — 설계 결정(FR-005 근본해결·스트림 계약·취소·매칭)
├── data-model.md        # Phase 1 — 프론트 상태/뷰 모델(스트림 이벤트→스토어→뷰)
├── quickstart.md        # Phase 1 — 실행·자가검증 시나리오(Playwright)
├── contracts/
│   └── search-stream.md # Phase 1 — 요청/NDJSON 이벤트 계약(프론트 소비 관점)
└── checklists/requirements.md
```

### Source Code (repository root = `project/robo-data-frontend/`)

```text
src/
├── shared/
│   ├── services/
│   │   └── http.ts                     # [수정] streamFetch 에 optional AbortSignal 추가(하위호환)
│   └── components/
│       └── TopToolbar.vue              # [수정] ⌘K→graph탭이면 Overview 의미검색 라우팅 + 진행 배지
├── features/
│   └── code-analysis/
│       ├── api.ts                      # [수정] roboApi.searchSemantic(body, headers, onEvent, signal)
│       ├── stores/
│       │   └── semanticSearch.ts       # [신규] 검색 세션 상태(질의·단계·경과초·상태·뭉치·에러·abort)
│       └── components/graph/
│           ├── GraphTab.vue            # [수정] 결과클릭=캔버스만(Overview 유지) / 배지 데이터 배선
│           ├── NodeDetailPanel.vue     # [수정] Overview 에 "의미 기반 관련 코드" 섹션(버튼·진행·결과·안내)
│           └── NavigatorPanel.vue      # [수정] 트리 검색 placeholder "목록에서 좁히기"(FR-012)
```

**Structure Decision**: 단일 web frontend. 신규는 `semanticSearch` 스토어 1개 + `searchSemantic` API 1개. `streamFetch` 시그니처는 optional `signal` 추가로 **기존 호출 무변경**(analyze 등). UI 변경은 code-analysis 기능 폴더 + 전역 검색 소유처(TopToolbar)에 한정.

## Phase 0 — Research (요약, 상세 research.md)

1. **FR-005 근본해결 = 역할 분리**. 결정: 검색 결과 클릭(이름·뭉치 공통) = 캔버스에 추가/포커스만, 패널은 Overview 유지. 노드 상세는 캔버스 노드 클릭으로. 대안(패널에 검색 상태를 상시 겹쳐 렌더)은 시각적 혼잡·모드 이중화라 기각.
2. **스트림 소비 = streamFetch 재사용 + AbortSignal**. 결정: `streamFetch(url, body, headers, onEvent, signal?)`. fetch 에 signal 전달, abort 시 reader 루프 종료. 새 검색 시작/취소가 이전 signal.abort(). 대안(EventSource)은 POST·세션헤더 불가라 기각.
3. **진행 단계 label = 서버 그대로**. 결정: 프론트는 progress.label 문자열을 그대로 표시(자체 판정 0). embed 단계는 analyze 스트림에서 이미 표시(무변경).
4. **노드 매칭 = node.id 논리속성**. 결정: result.nodes[].id 로 `addNodeToCanvas`. 코드 확인 완료(analyzer.ts convertNeo4jNode: id=properties.id). element_id 미사용.
5. **진행 배지 위치 = TopToolbar**. 결정: 분석 진행을 띄우던 상단 영역 재사용(하단 콘솔 아님). 스토어 isSearching·elapsed 구독.

## Phase 1 — Design (요약, 상세 data-model.md / contracts / quickstart)

- **상태 모델**: `semanticSearch` 스토어 = { query, status('idle'|'running'|'done'|'error'|'cancelled'), phases: [{stage,label,detail}], elapsedSec, clusters: Cluster[], errorMessage, _abort: AbortController|null }. 액션 = run(query, headers) / cancel() / reset(). 새 run 은 이전 _abort.abort() 후 시작.
- **뷰 모델**: NodeDetailPanel Overview = 이름섹션(기존) + 의미섹션(status 별 분기: idle=버튼+한줄안내 / running=단계·경과초·취소 / done&clusters>0=뭉치목록 / done&0=못찾음안내 / error=사유). 뭉치 = {id,title,score,nodes[]}, 클릭 → nodes[].id 를 캔버스에 add.
- **계약**: `POST {ROBO_BASE_URL}/search/semantic` + 세션헤더, body {query,limit?}. NDJSON: progress* → result → stream_end / error. contracts/search-stream.md 에 프론트 소비 규약(이벤트 타입·필드·종결·취소) 명문화.
- **agent context**: CLAUDE.md 의 SPECKIT 마커 사이 plan 참조를 이 plan.md 로 갱신.

## Constitution Re-Check (post-design)

설계 후 재확인 — 신규 스토어/뷰/계약 모두 게이트 4원칙 유지(새 라우트 0·기능폴더 한정·게이트웨이+세션헤더·목업 0). 위반 없음. 진행 가능.
