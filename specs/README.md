# Specifications — ROBO Data Frontend

> **Backfilled** on 2026-06-15 by reverse-engineering the existing codebase using the
> [GitHub Spec Kit](https://github.com/github/spec-kit) format. Each `spec.md` was derived from the
> actual Vue components, Pinia stores, and `api`/`service` modules — **not** from a prior design
> doc. The backfill surfaced many mock/stub/dead surfaces; specs follow the **code** and mark what
> is real vs. placeholder (see "Findings" below).

## What this is

robo-data-frontend (Vue 3 / Vite) is the unified UI shell for the robo legacy-analysis platform. It
runs as a **single `/` route** with features surfaced as **tabs** (registered in
`src/shared/config/features.ts`), driving many backend services through the API Gateway.

> **text2sql는 본 백필에서 의도적으로 제외** (사용자 지시). `src/features/text2sql/`는 spec 없음.

## How to use these specs

- **Change planning**: update the relevant `spec.md` first; the spec is the contract.
- **New features**: `/speckit-specify → /speckit-plan → /speckit-tasks → /speckit-implement`.
  The constitution at [`.specify/memory/constitution.md`](../.specify/memory/constitution.md) states
  the 4 principles every new plan's Constitution Check must satisfy.

## Feature index

| # | Spec | One-liner | Backend (via gateway) |
|---|------|-----------|------------------------|
| 001 | [Code Analysis](001-code-analysis/spec.md) | upload→parse→analyze pipeline + graph/summaries explorer | antlr, robo-analyzer |
| 002 | [Schema Browser](002-schema-browser/spec.md) | ERD/canvas table·column·relationship browse + description edit | robo/catalog |
| 003 | [Lineage Visualization](003-lineage-visualization/spec.md) | source→ETL→target lineage graph + ETL-SQL analysis | catalog, olap |
| 004 | [Glossary](004-glossary/spec.md) | business glossary/terms CRUD + AI bulk-upload + business calendar | robo/catalog |
| 005 | [Object Explorer](005-object-explorer/spec.md) | browse Object Type instances + drilldown + charts | ontology |
| 006 | [Datasources](006-datasources/spec.md) | register/manage DB/API connections + metadata extraction | data-fabric |
| 007 | [Ontology](007-ontology/spec.md) | LLM-generate ontology schema, bind to tables, what-if | ontology, domain-whatif |
| 008 | [Domain Modeling](008-domain-modeling/spec.md) | ObjectType modeler, multi-layer ontology, behaviors, schedulers | ontology, schedulers |
| 009 | [Observability](009-observability/spec.md) | event detection, watch agent, (mock) data-quality/incidents/alerts | text2sql, agent-scheduler |
| 010 | [OLAP](010-olap/spec.md) | pivot analysis + cube designer + Airflow ETL provisioning | olap |
| 011 | [Security](011-security/spec.md) | RBAC admin (users/roles/permissions/audit) — partly mock | security (8006) |
| 012 | [What-If Analysis](012-whatif/spec.md) | 5-step causal/what-if wizard — simulation core is client-side mock | whatif (8005) |
| 013 | [LangChain Agent](013-langchain-agent/spec.md) | hidden ReAct Text2SQL chat with streaming | langchain |

## Cross-service contract

Every `service:path` the UI calls is a boundary; the **api-gateway route table** (api-gateway
spec 001) is the authority for `path → service:port`. A backend changing its path/port ripples here.

## Findings — wired vs. mock, and dead code (code is truth)

The backfill found substantial mock/stub surfaces; specs mark them explicitly:

- **011 Security**: Table Permissions + Security Policies tabs are **100% mock** (hardcoded rules/
  policies, no persistence). Role edit shows an "not implemented" alert. Users/roles/audit are real.
- **012 What-If**: the simulation core is **mock** (`generateMockForecast()` / local linear
  propagation) — no backend simulation endpoint. The step-3 label ("Ontology Discovery") actually
  calls causal-discovery.
- **009 Observability**: 3 of 5 tabs (Data Quality, Incident Manager, Alerts) render **dummy arrays**;
  only Event Detection + Watch Agent are backend-wired.
- **007 Ontology**: several wizard step-3 actions are stubs ("향후 구현"). Port comment drift:
  domain-whatif documented as both 8002 and 8005.
- **006 Datasources / 010 OLAP**: bypass the shared http client with raw `fetch` (constitution debt).
- **Navigation**: there are **no per-feature routes** — everything is a tab under `/` (memory
  history). Several "refresh"/"configure" buttons are no-op (object-explorer, etc.).

Specs are intentionally short (~90-160 lines each) — they describe the contract, not the code.
