# Text2SQL refactor evidence

## Boundary and backend source

- Backend owner: independent `uengine-oss/robo-data-text2sql`; Catalog ownership was not inferred or merged.
- Backend source revision inspected: `25ab12a8b9129b99fa3e83519214e71e12962a9d`.
- Authoritative backend files inspected:
  - `app/routers/ask.py`
  - `app/routers/meta.py`
  - `app/routers/history.py`
  - `app/routers/direct_sql.py`
  - `app/routers/feedback.py`
  - `app/routers/events.py`
  - `app/routers/event_templates.py`
  - `app/main.py`
- Frontend owner: `src/domains/text2sql`; cross-service event-monitoring UI remains explicit under
  `src/workflows/observability` and consumes the Text2SQL domain boundary.

## Contract defects corrected

- Query history IDs now remain backend-owned strings. The prior frontend `number` type rejected the backend's
  Neo4j/hash identifiers.
- History steps consume `tool_result_preview`, the field emitted by the backend.
- `/ask` consumes `sql`, `table`, `charts`, `provenance`, `perf`, and `warnings` through runtime parsers.
- Array rows from `/ask` are indexed by column position. The prior UI incorrectly indexed row arrays with column names.
- Direct SQL and materialized-view HTTP 200 bodies with `status: "error"` now fail explicitly.
- The nonexistent Text2SQL `/generate` fallback was removed from Ontology behavior generation. Ontology
  `/generate-code` is the sole owner.
- Unused Catalog-style table/column-description and relationship CRUD was removed from the Text2SQL client.
- Missing provenance no longer produces invented relevance scores or a fabricated `SELECT *` statement.
- Event rules, notifications, scheduler, chat, CEP, simulation, alarm SSE, and templates now have runtime parsers in
  `api/eventContracts.ts` instead of trusting `response.json()` as a compile-time interface.
- Health now has an explicit healthy/unhealthy runtime contract instead of returning `unknown`.
- Query, history, metadata, feedback, ReAct, Direct SQL, materialized-view, health, event, and alarm-stream requests all
  carry current session headers.
- Malformed ReAct and Direct SQL stream lines now fail the request with a visible error instead of being logged/skipped.
- The declared `complete` ReAct event is handled directly; the former runtime-cast compatibility branch is gone.
- CEP status uses the backend's actual `esper_cep_available`, `esper_cep_status`, `simple_cep_status`, and local
  scheduler fields. The hardcoded “Esper CEP connected” label was removed.
- Event API calls now carry session headers. Alarm SSE uses authenticated/header-capable fetch streaming instead of
  native `EventSource`, which cannot attach the Electron Neo4j/session overrides.

## Honest-state and UI corrections

- History HTTP failure is rendered as an error with retry and is distinct from a successful empty history.
- Text2SQL mode controls are no longer covered by the global analysis progress panel. Outside analysis tabs, progress
  remains available as a compact bottom-right badge.
- Event chat failure no longer falls back to a frontend regex parser that fabricates a successful configuration.
- Backend `snake_case` extracted event settings are explicitly mapped to the UI model and back.
- The frontend no longer fabricates `sensor_data WHERE condition_met = true` SQL. Registration requires the operator's
  actual SELECT SQL and preserves it byte-for-byte in the request.
- Registration success now says the rule is active and explains that periodic execution depends on scheduler state;
  it no longer claims that Esper registration and real-time monitoring definitely started.
- SimpleCEP simulation remains the backend's intentional isolated simulation endpoint, but field, threshold, duration,
  generated value, and station are now explicit user inputs. The frontend no longer silently treats every condition as
  `water_level` or adds `0.5` to an inferred threshold.
- Chat output is escaped before the small bold/newline formatter runs, preventing user/backend HTML from executing.
- Event-list 500/503 is no longer shown as “no registered events”; retry and operation errors remain visible.
- Alarm acknowledgement now calls the backend before removing the toast. The unused synthetic test alarm was removed.

## Verification (2026-07-22)

- `npm.cmd run type-check -- --pretty false`: passed, zero project TypeScript errors.
- `node specs/060-backend-aligned-frontend-refactor/contracts/test-domain-contract-parsers.mjs`: passed.
- `node specs/060-backend-aligned-frontend-refactor/contracts/check-architecture.mjs`: passed across 308 TS/Vue files.

## 2026-07-23 type ownership addendum

- Moved Text2SQL table/column metadata and all ReAct request, phase, stream, response, quality-gate, and execution types
  out of `shared/types` into `domains/text2sql/model/react.ts`.
- Text2SQL internals use the owned model directly. Ontology and schema-modeling consumers use the Text2SQL public
  entrypoint, preserving the workflow-to-domain dependency direction without compatibility re-exports.
- Architecture rules now reject any of these Text2SQL contracts under `shared`. Type-check, domain contract parsers,
  323-source architecture validation, the Text2SQL 1920×1080 failure/retry/header/direct-SQL browser contract, production
  build, and the 2,629,144-byte remote-app build boundary all passed.
- `node specs/060-backend-aligned-frontend-refactor/contracts/verify-text2sql-ui.mjs`: passed at 1920×1080.
- `node specs/060-backend-aligned-frontend-refactor/contracts/verify-event-observability-ui.mjs`: passed at 1920×1080.
  - actual `/events/rules`: HTTP 500
  - actual `/events/cep/status`: HTTP 500
  - successful empty list differs from failure
  - chat failure exposes no local registration fallback
  - explicit SQL and simulation inputs are preserved
  - session header reaches all observed event requests
  - malicious user/backend HTML remains text
- `npm.cmd run build`: passed, 4,755 modules transformed.
- Protected WIP regression:
  - `npm.cmd run type-check:panel-projection`: passed
  - `npm.cmd run test:panel-projection`: passed
  - `node specs/059-cohesion-coupling-view/contracts/test-area-graph.mjs`: N1-N11 passed
- Screenshots:
  - `evidence/text2sql-actual-direct-mode-1920x1080.png`
  - `evidence/event-observability-actual-1920x1080.png`
  - `evidence/event-observability-success-1920x1080.png`

## SQL result to Ontology instance partial-success addendum

- The optional Materialized View and required Ontology bulk-create operations now share the domain application
  boundary `createInstancesFromSql`. `domains/text2sql` now emits only a typed SQL-result export and contains no
  Ontology import or cross-service mutation sequence. `workflows/text2sql-ontology` owns schema metadata, mapping,
  Data Fabric datasource selection, MV→bulk orchestration, and the result dialog.
- Both app feature entries and the two Ontology embedded consumers load `Text2SqlWorkspace`; props, feature IDs,
  history selection, and the existing result-to-instance trigger remain unchanged.
- A Materialized View failure remains observable, but does not discard a valid SQL result or prevent instance
  creation. Bulk create receives an explicit `materialized_view: null`, and the user sees the created count together
  with the partial-failure warning. Bulk-create failure remains visible and does not report success or close the
  dialog; retry reruns the same workflow and only commits the success result after the required mutation succeeds.
- Runtime contracts cover MV success, MV failure followed by bulk success, and bulk failure propagation.
- `node specs/060-backend-aligned-frontend-refactor/contracts/run-browser-suite.mjs verify-text2sql-ui.mjs`: passed.
  The 1920×1080 browser flow selected a completed history result, Commerce schema, Order node, and ID/name mappings;
  it verified schema-list and schema-detail 503→exact retry, one failed and one successful bulk-create, two failed MV
  attempts, the full request payload, no native result alert, and an in-dialog result containing both
  `2개의 인스턴스가 생성되었습니다.` and the MV warning.
- Escape, initial focus, retry focus continuity, completion focus restoration, and mutation-success-before-result
  behavior passed. The 390×844 dialog remained fully inside the viewport with document overflow 0 and an internally
  scrollable sample table.
- Visual inspection of `evidence/text2sql-ontology-instance-1920x1080.png` and
  `evidence/text2sql-ontology-instance-390x844.png` found no clipping, overlap, hidden data, or inconsistent spacing.
- `npm.cmd run type-check`, the 369-source architecture contract, the 4,826-module production build,
  `check-build-boundaries.mjs` (remote asset 2,675,586 bytes), and scoped `git diff --check` passed.

## Main query UI lifetime addendum

- Recent-query JSON parsing, string validation, trim/deduplication, ten-item cap, and persistence warnings moved to
  `domains/text2sql/application/recentQueries.ts`. Malformed storage no longer reaches the component as an unchecked
  value or disappears into a console warning; the UI safely starts with an empty list and displays the storage warning.
- SQL-diff removal/highlight and embedded/navigation auto-submit callbacks now use `useManagedTimeouts`, so replacing a
  diff or unmounting the component cancels owned callbacks.
- Native feedback `prompt`/`alert` and optimistic completion were removed. Negative feedback uses an accessible dialog
  that owns question, notes, approved identity, pending, error, retry, Escape, focus trap, and trigger-focus restoration.
  Positive feedback remains one-click; a failure opens the same explicit retry surface. Submitted state is committed
  only after the API succeeds.
- Automatic history-save failure now propagates from the store and appears as a non-destructive chat warning. The query
  result remains usable, while the application no longer reports or logs a false history-save success.
- The browser contract covered malformed local storage, history-save 503, negative-feedback cancel with zero mutation,
  feedback 503, exact SQL/question/notes/rating retry, success commit, and 390×844 overflow/focus/viewport bounds.
- Browser interaction exposed a separate mobile stacking defect: the mode selector intercepted the open history
  panel's toggle. The open panel now owns the overlay layer; the collapsed rail returns to normal document flow.
- `test-text2sql-recent-queries.mjs`, `test-text2sql-history-state.mjs`, `npm.cmd run type-check`, the 371-source
  architecture contract, the 4,830-module production build, the unchanged 2,675,586-byte remote build boundary, and
  scoped `git diff --check` passed.
- Screenshot: `evidence/text2sql-feedback-390x844.png`.

## Ontology node datasource metadata consumer addendum

- Read-only inspection of backend `app/routers/meta.py` confirmed that datasource/schema/table/ObjectType metadata is
  owned by Text2SQL. The Ontology workflow remains a public-boundary consumer and does not duplicate or reclassify
  that API under Catalog.
- The workflow now keeps its UI-only ObjectType source kind separate from the actual datasource required by
  `/meta/objecttypes`. It sends and persists the real datasource through ObjectType confirmation so later Direct SQL
  has the required execution context.
- Deterministic contracts cover metadata failure/retry, projection, request races, sentinel exclusion, and the complete
  keyboard-driven component path. Live success remains under T052 while the current upstream deployment is unhealthy.

## Still unverified

- The live Text2SQL history, event-rule, and CEP endpoints currently return HTTP 500, so live successful query/history,
  rule mutation, scheduler execution, notification acknowledgement, and alarm-stream delivery are not verified.
- Live successful ReAct/direct-SQL stream sequences remain unverified because the upstream service is not healthy.
  Malformed/contract edge behavior is covered by parser and browser tests; live success belongs to completion task T052.
- Backend defects are reference findings only and were not modified: event state is process-memory-only, condition
  evaluation uses `eval`, and event execution/process fallback behavior needs backend-owner review.

## Query-history state and interaction addendum (2026-07-23)

- History reads now retain active search/status filters across pagination and use a request sequence so a late older
  response cannot replace the latest result. Read failure remains distinct from a successful empty response.
- Single-item and all-history mutations no longer catch an API failure and return `false`. They propagate the failure
  and commit `items`, `total`, and `selectedItem` only after the DELETE succeeds.
- Search debounce uses the managed timeout lifetime. History selection is a native button with `aria-pressed`, detail
  expansion exposes `aria-expanded`, and export controls no longer retain unreachable native alerts or debug logging.
- `HistoryActionDialog` owns item/all action identity, target question, pending/error state, Escape, focus trap, and
  cancel focus restoration. A 503 leaves both the item and dialog intact; retry repeats the same item DELETE exactly
  once and only then commits the removal.
- At 390×844 the formerly fixed 280px flex column no longer leaves the chat with an unusable sliver. The expanded
  history is an in-viewport overlay and its collapsed rail returns to normal flow. Document horizontal overflow was
  zero. The verified completed frame is `evidence/text2sql-history-delete-390x844.png`.
- Verification:
  - `node contracts/test-text2sql-history-state.mjs`: PASS (race, filter pagination, mutation failure/success)
  - `npm.cmd run type-check -- --pretty false`: PASS
  - `node contracts/check-architecture.mjs`: PASS across 365 TS/Vue sources
  - `node contracts/run-browser-suite.mjs verify-text2sql-ui.mjs`: PASS
  - `npm.cmd run build`: PASS, 4,820 modules
  - `node contracts/check-build-boundaries.mjs`: PASS
  - `git diff --check`: PASS (line-ending warnings only)
