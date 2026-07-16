# Robo Analyzer Frontend

레거시 코드/데이터베이스를 **분석해 설계 그래프로 시각화**하는 분석기의 프론트엔드입니다. 단독 웹앱으로도 동작하고, 데스크톱 호스트(robo-architect, Electron)에 **Module Federation 리모트**로 끼워져 한 앱처럼 동작합니다.

## 📋 목차

- [프로젝트 개요](#-프로젝트-개요)
- [주요 기능](#-주요-기능)
- [기술 스택](#-기술-스택)
- [프로젝트 구조](#-프로젝트-구조)
- [아키텍처](#-아키텍처)
- [시작하기](#-시작하기)
- [상태 관리](#-상태-관리)
- [API & 스트리밍](#-api--스트리밍)
- [빌드 & 임베드](#-빌드--임베드)
- [개발 가이드](#-개발-가이드)
- [트러블슈팅](#-트러블슈팅)

---

## 🎯 프로젝트 개요

소스 코드 폴더(또는 DB DDL)를 고르면 → **파싱 → 분석 → 설계 그래프**로 이어지는 분석 결과를 화면에 보여줍니다.

### 핵심 워크플로우

```
소스 폴더 선택 → ANTLR 파싱(AST) → Analyzer 분석(LangGraph → Neo4j) → Catalog 조회 → 그래프 시각화
```

1. **입력**: 브라우저 업로드(드래그 앤 드롭) 또는 경로 모드(Electron이 고른 로컬 폴더 직접 분석)
2. **파싱**: ANTLR 서버가 소스를 AST JSON으로 변환(Java/Python/Oracle/PostgreSQL 자동 감지)
3. **분석**: Analyzer 백엔드가 AST를 LangGraph 파이프라인으로 분석 → 함수·테이블·관계를 Neo4j 그래프로 적재
4. **시각화**: Catalog가 그래프/스키마를 읽어 프론트가 NVL 그래프·트리·노드 패널로 렌더

모든 백엔드 호출은 **단일 입구인 API Gateway(`/api/gateway`)** 한 곳으로 나가고, 게이트웨이가 서비스별로 분배합니다.

---

## ✨ 주요 기능

기능은 **`src/shared/config/features.ts` 한 곳**에서 정의되며(탭의 단일 진실원천), 사이드 메뉴와 탭 렌더가 모두 여기서 파생됩니다. 레이어 그룹으로 묶입니다.

### 🧱 피지컬 레이어
- **코드**(`upload`): 소스 업로드/경로 선택, 파싱·분석 실행
- **데이터 소스**(`datasources`): 데이터 소스 연결·관리
- **코드 그래프**(`graph`): Neo4j 기반 NVL 대화형 그래프 — 보기모드 전환·Navigator 트리·노드 상세 패널·논리명 토글·스타일 커스터마이징·필터
- **데이터 스키마**(`schema`): 테이블/컬럼 스키마 뷰
- **자연어 질의**(`text2sql`): ReAct 기반 자연어 → SQL 변환(실시간 단계 스트리밍·휴먼인더루프·ERD)
- **보안관리자**(`security-guard`)

### 🧠 도메인 레이어
- **도메인 스키마**(`schema-modeling`): 오브젝트 타입 모델링
- **온톨로지 관리**(`multi-layer-ontology`): 다층 온톨로지 뷰어(cytoscape·echarts·필터·What-If)
- **오브젝트 탐색기**(`object-explorer`)
- **온톨로지 뷰어**(`ontology-viewer`)
- **자연어 질의(도메인)**(`domain-text2sql`)

### ⚡ 다이나믹 레이어
- **What-If 시뮬레이터**(`whatif`) · **데이터 품질**(`data-quality`) · **사고 관리자**(`incident-manager`) · **알림들**(`alerts`) · **이벤트 감지**(`event-detection`) · **감시 에이전트**(`watch-agent`)

### ⚙️ 기준관리 / 분석·도구
- **용어 관리**(`glossary`) · **영업일 캘린더**(`business-calendar`)
- **데이터 리니지**(`lineage`) · **OLAP 분석**(`olap`)

> 이 앱은 다양한 백엔드 위의 통합 셸이라 일부 화면은 완전 연동, 일부는 mock/placeholder 단계입니다(헌법 IV — 목업을 실연동처럼 표시하지 않음). 코드 분석 핵심(피지컬 레이어 4개: 코드·데이터소스·코드그래프·데이터스키마)이 데스크톱 임베드 노출 대상입니다(`embeddable`).

### 코드 그래프 보기모드
NVL 캔버스는 같은 그래프를 여러 관점으로 렌더합니다: **기본 · 모듈간 상호작용 · 협력 군집 · 영역(구조) · 건강 보기**. Navigator 트리에서 노드를 캔버스로 드래그하면 1-hop 이웃과 함께 표시됩니다.

---

## 🛠 기술 스택

| 분류 | 라이브러리 |
|---|---|
| 코어 | **Vue 3.4**(Composition API, `<script setup>`) · **TypeScript 5.3** · **Vite 5** |
| 상태 | **Pinia 2** |
| 라우팅 | **Vue Router 4** (메모리 히스토리, 단일 `/` 라우트) |
| 그래프 | **@neo4j-nvl/base** + **interaction-handlers**(코드 그래프) · **cytoscape**(온톨로지) · **@vue-flow/core**(다이어그램) · **elkjs**(레이아웃) |
| 차트/다이어그램 | **echarts** · **chart.js** · **d3-sankey** · **mermaid**(ERD) · **bpmn-js** · **dmn-js** |
| 에디터 | **Monaco Editor** |
| 모듈 연합 | **@originjs/vite-plugin-federation** |
| 스타일 | **Sass**(modern-compiler) |

---

## 📁 프로젝트 구조

기능별 폴더 모듈성(헌법 II) — 각 기능은 `src/features/<name>/` 안에서 자기 UI·스토어·API·타입을 자급합니다.

```
src/
├── features/                  # 14개 기능 (각자 .vue + Pinia store + api.ts + types)
│   ├── code-analysis/         # ★ 코드 분석 핵심
│   │   ├── analyzer.ts             # 분석 스토어(스트림 인제스천·그래프 상태)
│   │   ├── graphCanvas.ts          # 캔버스 노드/프리셋/계층 스토어
│   │   ├── api.ts                  # /antlr · /robo 엔드포인트
│   │   └── components/
│   │       ├── graph/              # GraphTab · NvlGraph · NodeDetailPanel · node-detail/*Card
│   │       └── upload/             # UploadTab · ScopeBrowser · JsonViewer
│   ├── datasources/  domain/  glossary/  langchain/  lineage/
│   ├── object-explorer/  observability/  olap/  ontology/
│   ├── schema/  security/  text2sql/  whatif/
│   └── (각 feature: <name>.ts 스토어 · api.ts · components/)
├── shared/                    # 횡단 공용
│   ├── services/http.ts            # API Gateway 코어(fetch·NDJSON/SSE 파서·에러 핸들러)
│   ├── stores/                     # navigator(트리) · session(탭·테마·Neo4j·헤더)
│   ├── config/                     # features.ts(탭 SSOT) · storageKeys · graphStyles · appSettings
│   ├── utils/                      # graphDisplay · nodeClassify · graphStyleStorage · logger ...
│   ├── types/index.ts              # GraphNode · GraphLink · StreamEvent 등
│   ├── components/  composables/  icons/  charts/
├── layouts/MainLayout.vue     # isEmbedded 에 따라 상단바 표시/숨김
├── views/HomeView.vue         # 단일 라우트 — activeTab 으로 기능 탭 렌더
├── router/                    # 메모리 히스토리, 단일 '/' 라우트
├── styles/main.scss
├── bootstrap.ts               # ★ MF 진입점(mount/unmount)
└── main.ts                    # 단독 실행 진입점
```

---

## 🏗 아키텍처

### 1. 단일 라우트 + 탭 (헌법 I)
`createMemoryHistory`의 **단일 `/` 라우트**(`HomeView`)에서, 모든 기능은 `session` 스토어의 `activeTab`으로 전환되는 **탭**입니다(URL 라우팅 아님). 임베드 환경에서 호스트가 URL을 소유하기 때문입니다.

### 2. 기능 폴더 모듈성 (헌법 II)
각 기능은 `src/features/<name>/`에서 자급하고 `config/features.ts`에 등록됩니다(`defineAsyncComponent` 지연 로딩 — 활성 탭만 청크 수신).

### 3. 게이트웨이 경유 + 세션 헤더 (헌법 III)
모든 백엔드 호출은 `shared/services/http.ts`의 단일 클라이언트로, base `/api/gateway`를 거쳐 Spring Gateway(9000)로 가고 게이트웨이가 서비스로 분배합니다. 모든 호출은 `session.getHeaders()`(임베드 시 `X-Neo4j-*` override 포함)를 부착합니다.

### 4. Module Federation (임베드)
호스트 **robo-architect**(5173)가 이 앱을 리모트로 로드합니다.
```
robo-architect (호스트)
   └─ import('robo-analyzer-frontend/remote-app')  → bootstrap.ts { mount, unmount }
robo-data-frontend (리모트, name: robo-analyzer-frontend, expose ./remote-app)
   shared 싱글톤: vue · pinia   |   이 앱은 airSwmmApp(5174)도 소비
```
`mount(el, { embedded?, projectRoot?, neo4j? })` — 호스트가 임베드 여부·로컬 폴더 경로(경로 모드)·Neo4j 연결을 주입합니다.

---

## 🚀 시작하기

### 필수 요구사항
- **Node.js** 18+
- 분석 풀스택(코드 그래프까지 보려면): **API Gateway**(9000) · **ANTLR**(8081) · **Analyzer**(5502) · **Catalog**(5503) · **Neo4j**(7687)

### 설치 & 개발 서버
```bash
npm install
npm run dev          # Vite dev 서버 (포트 3000, HMR)
```
브라우저에서 `http://localhost:3000` 접속. `/api/gateway/**` 요청은 Vite 프록시가 게이트웨이(9000)로 전달합니다(NDJSON/SSE 스트림 통과 처리 포함).

### 스크립트
```bash
npm run dev          # 개발 서버 (3000)
npm run build        # 타입체크(vue-tsc) + 프로덕션 빌드
npm run build:docker # 빌드만 (타입체크 생략)
npm run preview      # 빌드 결과 미리보기 (포트 5001, MF 리모트 서빙용)
npm run type-check   # vue-tsc --noEmit
```

### 포트 요약
| 대상 | 포트 |
|---|---|
| frontend (dev) | 3000 |
| frontend (MF preview) | 5001 |
| API Gateway (단일 입구) | 9000 |
| ANTLR 파서 | 8081 |
| Analyzer 백엔드 | 5502 |
| Catalog | 5503 |

---

## 🔄 상태 관리

Pinia 스토어는 Composition API 스타일입니다. 핵심 스토어:

### `code-analysis/analyzer.ts` — 분석 스토어
백엔드 NDJSON 스트림을 인제스천해 그래프 상태를 만듭니다.
- 상태: `nodeMap` / `linkMap`(가시 링크) / `semanticLinkMap`(규칙·예시·질문 = 패널 전용) / `graphData` / `sourceType` / `isProcessing` / `consoleMessages` / `graphEvents` / `analyzeMeta`
- 액션: `setProjectRoot` · `uploadFiles` · `loadExistingGraphData` · `pausePipeline` / `resumePipeline` · `reset`

### `code-analysis/graphCanvas.ts` — 캔버스 스토어
- 상태: `canvasNodeIds` · `canvasGraphData` · `presetMode` · `hierarchyMap`
- 액션: `addToCanvas` · `expand`/`collapse`/`removeFromCanvas` · `clearCanvas` · `loadNodesByLabels` · `setPreset` · `isolateLabel`

### `shared/stores/navigator.ts` — 트리 스토어
- 상태: `isPanelOpen` · `showLogicalNames`(논리명 토글) · `searchQuery` · `moduleTree` · `tableList` · `selectedNodeId`

### `shared/stores/session.ts` — 세션 스토어
- 상태: `activeTab` · `theme` · `apiKey` · `neo4jConnection`
- 액션: `getHeaders`(API 헤더 + Neo4j override) · `setNeo4jConnection` · `setActiveTab`

> 각 기능 스토어(`text2sql/text2sql.ts`, `olap/olap.ts`, `whatif/...`, `ontology/...`, `datasources/datasources.ts`, `schema/schemaCanvas.ts` 등)는 해당 기능 폴더에 자급합니다.

---

## 🌐 API & 스트리밍

### 단일 클라이언트 (`shared/services/http.ts`)
모든 도메인 API가 공유하는 코어:
- **Base**: `API_GATEWAY_URL`(`/api/gateway`) — `ANTLR_BASE_URL`·`ROBO_BASE_URL`·`TEXT2SQL_BASE_URL`·`ONTOLOGY_BASE_URL` 파생
- **선택 alarm SSE**: text2sql alarm backend를 함께 배포한 환경에서만
  `VITE_ENABLE_ALARM_STREAM=true`로 활성화합니다. 기본값은 연결하지 않음입니다.
- `postJson` / `postFormData` — JSON·FormData POST
- `streamFetch` — **NDJSON** 스트림(`\n` 분리, 줄 단위 JSON, 손상 줄은 logger 기록 후 스킵하고 계속)
- `streamSseFetch` — **SSE** 스트림(`event:`/`data:` 줄, 빈 줄 flush)
- `handleHttpError` — 서비스 다운(404/502/503) 시 포트별 친절 안내 + 서버 JSON 오류(`detail`/`error_type`/`message`) 추출

각 기능의 `api.ts`(예: `code-analysis/api.ts`, `text2sql/api.ts`)는 이 코어를 import해 엔드포인트만 정의합니다.

### 코드 분석 핵심 엔드포인트(게이트웨이 경유)
- `POST /antlr/parsing` — 파싱(NDJSON: `detected`/`message`) → ANTLR(8081)
- `POST /robo/analyze` — 분석(NDJSON 스트림) → Analyzer(5502)
- `GET /robo/graph/` — 그래프 스냅샷 `{Nodes, Relationships}` → Catalog(5503)
- 그 외 `/robo/check-data` · `/robo/delete` · `/robo/analyze/control`(pause|resume|stop)

### Analyzer NDJSON 이벤트
프론트 스트림 핸들러가 1:1 처리: `message` · `error` · `warning` · `detected` · `phase_event`(start|node_done|complete|paused|resumed|stopped) · `node_event`(op·label·id·props) · `relationship_event`(op·rel_type·from·to) · `processing_event` · `stream_end`.

### 그래프 데이터 모델 (Neo4j)
- 노드 식별자 = **`id` 하나로 통일**, 노드 라벨 = 그 노드의 **antlr 타입 단일**(UPPER_SNAKE, 예 `:FILE`/`:CLASS`/`:METHOD`/`:SELECT`/`:TABLE`/`:COLUMN`). 역할은 타입에서 파생.
- 프론트 변환: `Neo4jNode{'Node ID'→id, Labels→labels, Properties→properties}` — `properties`는 **opaque 통과**(UI가 런타임에 수십 키 읽음).

---

## 📦 빌드 & 임베드

### 단독 웹앱
`npm run build` → `dist/` 정적 산출. `npm run preview`(5001)로 확인.

### 데스크톱 임베드 (robo-architect, Electron)
- 데스크톱은 dev 서버가 아니라 **빌드본**(`app://`)을 로드 — 호스트 빌드 스크립트가 `ANALYZER_BASE=/analyzer/`를 주입해 co-locate 빌드합니다.
- 호스트는 `remoteEntry.js`로 `mount/unmount`를 받아 격리 마운트하고, Electron이 고른 **로컬 폴더 경로**(경로 모드)와 **Neo4j 연결**을 주입합니다.

---

## 💻 개발 가이드

- **경로 별칭** `@` → `src/`
- **컴포넌트**: `PascalCase.vue`, `<script setup lang="ts">`
- **새 탭 추가** = `config/features.ts` 배열에 한 줄(헌법 I — URL 라우트 추가 금지)
- **새 백엔드 호출** = `shared/services/http.ts` 코어 재사용(포트 하드코딩 금지, 게이트웨이 base 사용 — 헌법 III)
- **localStorage 키**는 `shared/config/storageKeys.ts` 상수만 사용(node-styles·relationship-styles·project-state·theme·api-key·whatif·text2sql 등)
- **로깅**: `shared/utils/logger`(debug/info = DEV 전용, warn/error = 항상). 조용한 실패(빈 `catch`) 금지 — 표면화

---

## 🔧 트러블슈팅

### API 요청 실패 / 그래프가 안 보임
1. 게이트웨이(9000)·ANTLR(8081)·Analyzer(5502)·Catalog(5503)·Neo4j(7687) 실행 확인
2. `vite.config.ts`의 `/api/gateway` 프록시 확인
3. 브라우저 콘솔/Network 탭 확인 — `handleHttpError`가 다운 서비스를 포트별로 안내

### 분석 스트림이 멈춤
1. Analyzer(5502)·Neo4j 연결 확인
2. NDJSON 손상 줄은 `logger.warn`으로 기록되고 스킵되므로 콘솔에서 확인 가능(스트림은 끊기지 않음)

### 타입 에러
`npm run type-check`(vue-tsc) 실행 → `src/shared/types/index.ts` 확인

### 임베드(데스크톱)에서 안 뜸
호스트(robo-architect)와 **Vue/Pinia 싱글톤** 공유 확인, `mount` 시그니처(`embedded`/`projectRoot`/`neo4j`) 확인

---

## 📄 라이선스

MIT
