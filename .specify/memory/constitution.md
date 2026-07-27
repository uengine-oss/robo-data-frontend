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

### II. Backend-Aligned Responsibility Groups (백엔드 책임 그룹)

Frontend code MUST be grouped by the backend responsibility that owns the contract under
`src/domains/<backend>/`. Each group owns its API contracts, application logic, state, and UI
sub-capabilities. Similar screen names MUST NOT be used to merge distinct backend owners, and one
backend's code MUST NOT be scattered across unrelated top-level feature folders.

Flows that intentionally coordinate more than one backend live under `src/workflows/<flow>/` and
may consume only the public entrypoint of each domain. A domain MUST NOT reach into another
domain's internals. `src/shared/` is limited to infrastructure or UI proven to serve multiple
domains and MUST NOT import a domain or workflow.

User-facing tabs remain registered in the feature registry and lazy-loaded, but the registry is a
navigation concern rather than the source-code ownership model.

**Rationale**: the platform is implemented by multiple teams and backed by separately owned
services. Developers must be able to identify the contract owner from the top-level folder while
cross-service orchestration remains explicit instead of being hidden in stores or components.

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

## Amendment History

- **1.1.0 (2026-07-22)**: Replaced screen-oriented feature-folder ownership with backend-aligned
  domain groups and explicit cross-backend workflows. Navigation tabs remain unchanged. This
  amendment is required by spec 060 and supersedes Principle II only; all other principles remain.

**Version**: 1.1.0 | **Ratified**: 2026-06-15 | **Last Amended**: 2026-07-22
