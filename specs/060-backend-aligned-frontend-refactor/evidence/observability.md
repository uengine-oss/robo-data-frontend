# Observability frontend evidence

Date: 2026-07-22

## Backend sources inspected

- `uengine-oss/robo-data-agent-scheduler` at `8196e5ced91befbc16de98531a1740070b9fed69`
  - `app/routers/profiles.py`
  - `app/routers/pipelines.py`
  - `app/integrations/neo4j_client.py`
  - `app/scheduler/profile_scheduler.py`
  - `app/models/profile.py`
- `uengine-oss/robo-node-local-agent-scheduler` at `8043aae7a6f0e4e3966df893f449398e217a5c17`
  - `app/routers/agents.py`
  - `app/models/agent.py`
  - `app/services/scheduler.py`
  - `app/services/agent_runner.py`
- Current public `uengine-oss` repository inventory (GitHub organization repository API, first page with fewer than
  100 results, therefore no second page required).
- Frontend backfill contract `specs/009-observability/spec.md` and every file under
  `src/workflows/observability`.

The backend repository was read-only reference material. No backend source was changed.

## Frontend changes

- Replaced the mixed graph-pipeline scheduler client with a runtime-validated `/profiles` client.
- Added runtime validation for profile, SQL-test, debug-step, debug-result, and ProcessGPT process-list responses.
- Added current session/LLM/Neo4j headers to every scheduler request.
- Rebuilt Watch Agent around the backend's actual fixed profile flow:
  - SQL or What-If source;
  - server-owned condition expression;
  - optional ProcessGPT action;
  - real profile list/create/toggle/delete;
  - real SQL test;
  - real server dry-run debug with `simulate_action: false`.
- Removed client-side staged execution, artificial delays, locally evaluated step results, random execution log IDs,
  direct ProcessGPT action execution, inferred hard-coded process IDs, arbitrary graph nodes, and graph-position writes
  that belonged to the disconnected backend model.
- Existing profiles are honestly read-only because the backend exposes no update route.
- What-If profiles remain schedulable, while debug controls are disabled with an explanation because backend debug is
  SQL-only.
- Replaced Data Quality, Incident Management, and generic Alert Configuration sample dashboards with one accessible,
  responsive unavailable-capability state. Removed their dead local forms and exports.
- Rebuilt the node-local scheduler client with state/log/feedback/action runtime contracts, current session headers,
  encoded node identifiers, bounded log query validation, and abortable fetch SSE. Ontology node highlighting is
  preserved, while connection failure is no longer silently ignored.

## Verification

- `npm.cmd run type-check -- --pretty false` — passed.
- `node specs/060-backend-aligned-frontend-refactor/contracts/test-domain-contract-parsers.mjs` — passed.
- `node specs/060-backend-aligned-frontend-refactor/contracts/check-architecture.mjs` — passed across 307 source files.
- `node specs/060-backend-aligned-frontend-refactor/contracts/verify-watch-agent-ui.mjs` — passed at 1920×1080:
  - `/profiles` list and create;
  - SQL test and dry-run debug;
  - explicit SQL/condition/process values preserved;
  - no graph-pipeline payload;
  - three graph nodes rendered after save;
  - session language/API-key headers on all scheduler calls;
  - HTTP failure distinct from successful empty list;
  - no dummy operational records on the three unwired tabs;
  - no browser runtime errors.
- `node specs/060-backend-aligned-frontend-refactor/contracts/verify-event-observability-ui.mjs` — passed; actual
  Text2SQL event endpoints still return HTTP 500 in the current environment, and mocked contract success/failure paths
  remain correct.
- `node specs/060-backend-aligned-frontend-refactor/contracts/verify-ontology-observability-ui.mjs` — passed.
  This now also verifies node-local scheduler success/failure states and session headers.
- `npm.cmd run build` — passed, 4,749 modules transformed.
- Protected user work regressions:
  - `npm.cmd run type-check:panel-projection` — passed;
  - `npm.cmd run test:panel-projection` — passed;
  - `node specs/059-cohesion-coupling-view/contracts/test-area-graph.mjs` — N1–N11 passed.

Visual evidence: `watch-agent-profile-success-1920x1080.png`.

## Remaining live-service evidence

- A successful mutation against a real scheduler deployment was not performed in this slice.
- The backend's own `list_profiles` exception-to-empty behavior cannot be distinguished by any frontend when the
  backend returns HTTP 200 `[]`; this requires a backend contract correction.
- What-If scheduler execution, periodic firing, and ProcessGPT action execution still require live end-to-end evidence
  under completion task T052.

## Mutation and destructive-action lifetime addendum

- Backend ownership remains unchanged: WatchAgent consumes the independent Agent Scheduler public domain, while event
  rules consume the Text2SQL event public domain. The frontend did not merge these services or change either backend.
- Added the workflow application policy `commitMutationThenRefresh`. A failed primary mutation leaves the list
  unchanged and throws to the caller. A successful mutation commits the delete/toggle locally before attempting list
  refresh; refresh failure returns a separate warning and cannot turn the completed mutation into a retry target.
- WatchAgent and EventDetection deletion now retain target ID/name, pending state, and primary error in a named
  alertdialog. Cancel and Escape do not mutate; HTTP 503 keeps the same target for exact retry; success closes the
  dialog only after the local commit.
- The WatchAgent profile card no longer nests `role=button` actions inside a selection button. Selection, toggle, and
  deletion are sibling native buttons with target-specific accessible names.
- The first 390×844 profile deletion run exposed an existing fixed detail panel that intercepted every profile action.
  Mobile detail is now part of normal document flow, so the list and action buttons remain reachable without forcing
  browser clicks.

### Current verification

- `node contracts/test-observability-mutation-lifecycle.mjs`: passed primary failure invariance, success commit before
  refresh, refresh warning, and server-refresh replacement.
- `npm.cmd run type-check`: passed.
- `node contracts/test-domain-contract-parsers.mjs`: passed.
- `node contracts/check-architecture.mjs`: passed across 379 TypeScript/Vue sources and now prevents native dialogs,
  nested role buttons, missing action-dialog ownership, and refresh-before-commit regression in this workflow.
- `run-browser-suite.mjs verify-watch-agent-ui.mjs`: passed profile delete cancel, DELETE 503→same ID retry,
  pre-success list invariance, successful delete/toggle retained across refresh 503, focus restoration, and mobile
  dialog geometry in addition to the existing scheduler profile/test/debug/create contract.
- `run-browser-suite.mjs verify-event-observability-ui.mjs`: passed event toggle local commit, delete cancel,
  DELETE 503→same ID retry, successful delete retained across refresh 503, focus restoration, mobile overflow/dialog
  geometry, and the prior event/CEP/chat/simulation contracts. Actual event and CEP endpoints still returned HTTP 500.
- Visual evidence `watch-agent-delete-error-390x844.png` and `event-delete-error-390x844.png` was inspected directly;
  target, backend error, retry, and cancel controls are readable without clipping or overlap.
- `npm.cmd run build`: passed with 4,844 transformed modules.
- `node contracts/check-build-boundaries.mjs`: passed with
  `__federation_expose_Remote-app-pPLkrZfw.js` at 2,674,692 bytes while Upload, Graph, and Cytoscape remained outside
  the remote entry.
- `git diff --check`: passed.

The deletion/toggle browser paths use deterministic network replacements. They prove frontend contract and
interaction behavior, not a successful live scheduler/Text2SQL mutation. Live periodic execution, ProcessGPT action,
and successful event/scheduler mutations remain T052.
