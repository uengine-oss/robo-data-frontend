# ROBO Data Frontend Constitution

<!--
  Principles the robo-data-frontend codebase ALREADY embodies, derived 2026-06-15 by
  reverse-engineering the implementation. Every new spec/plan's "Constitution Check" must comply.
  Amending a principle requires bumping the version below with a rationale.
-->

## Core Principles

### I. Tab-Based Single-Route Shell (단일 라우트 + 탭)

The SPA runs on `createMemoryHistory` with a **single `/` route** (`HomeView`); all features are
surfaced as **tabs** switched via the `session` store's `activeTab`, NOT via vue-router navigation.
New features MUST register as a tab, not add a URL route.

**Rationale**: the app is designed to embed (Electron / Module Federation host) where URL routing
is unavailable or owned by the host; one route keeps embedding and deep-state consistent.

### II. Feature-Folder Modularity (기능 폴더 모듈성)

Each capability lives in `src/features/<name>/` (its own `.vue` UI, Pinia store, `api`/`service`,
types) and is registered in `src/shared/config/features.ts` (id, label, menu group, lazy import,
`hidden` flag). A feature MUST be self-contained; cross-feature use goes through explicit imports,
not reaching into another feature's internals.

**Rationale**: a 14-feature platform stays maintainable only if each feature is an independent,
lazily-loaded slice.

### III. Gateway-Routed, Session-Headed API (게이트웨이 경유 + 세션 헤더)

All backend calls go through the **API Gateway** (base URLs centralized in
`src/shared/services/http.ts`: `/api/gateway/<service>`), and carry session headers (including the
`X-Neo4j-*` override for Electron embedded mode) via the shared dispatch + `handleHttpError` layer.
New calls MUST use the shared client and gateway base, not hardcode service ports.

**Rationale**: one gateway + one client means CORS, auth, error handling, and the Neo4j override are
solved once. (Debt: a few features — `olap-api.ts`, `datasources.ts` — bypass the shared client with
raw `fetch`; new code MUST NOT.)

### IV. Honest State: Wired vs. Mock (실연동과 목업의 구분)

This is a unified shell over many backends; some feature surfaces are fully backend-wired and some
are still mock/placeholder. New work MUST NOT present mock data as live, and SHOULD replace mocks
rather than add more. (Currently mock-only: Security Policies, Table Permissions, several
Observability tabs, the What-If simulation core — see those specs.)

**Rationale**: a dashboard that looks live but renders hardcoded arrays is worse than an empty
state; the spec set marks exactly which surfaces are real.

## Cross-Service Contracts (the backends this UI drives, via gateway)

- **antlr** `/antlr/*` (upload, parse) · **robo-analyzer** `/robo/analyze*`, `/robo/graph*` ·
  **catalog** `/robo/schema/*`, `/robo/lineage/*`, `/robo/glossary/*` · **ontology** `/ontology/*` ·
  **olap** `/olap/*` · **security** `/security/*` (8006) · **whatif** `/whatif/*` (8005) ·
  **domain-whatif** `/domain-whatif/*` · **data-fabric** `/data-fabric/api/datasources/*` ·
  **schedulers** `/agent-scheduler/*`, `/node-agent-scheduler/*` · **langchain** `/langchain/*` ·
  **text2sql** `/text2sql/*`.

Each `service:path` the UI calls is a boundary; a backend changing its path/port ripples here. The
gateway route table (api-gateway spec 001) is the authority for `path → service`.

## Governance

New features go through `/speckit-specify → /speckit-plan`; each `plan.md` MUST include a
Constitution Check verifying the principles above. A principle is amended only by editing this file
and bumping the version, with the rationale recorded.

**Version**: 1.0.0 | **Ratified**: 2026-06-15 | **Last Amended**: 2026-06-15
