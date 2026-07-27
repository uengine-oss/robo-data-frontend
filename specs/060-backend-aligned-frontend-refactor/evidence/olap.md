# OLAP contract and UI verification

## Backend reference

- Reference repository: `uengine-oss/data-platform-olap`
- Audited revision: `c851b2d431eeaebb813589a6bb7654f97ec4f489` (2026-01-12)
- FastAPI sources inspected: `backend/app/models/cube.py`, `models/query.py`,
  `api/routes.py`, `api/etl_routes.py`, `api/airflow_routes.py`.
- Gateway ownership remains `/api/gateway/olap/**` → independent OLAP service. No backend file was changed.

## Contract findings

- Cube measures use the backend field `agg`; the old frontend-local model expected `aggregator` and could silently
  replace a saved `AVG`, `COUNT`, `MIN`, or `MAX` with `sum` in the cube editor.
- Pivot and NL2SQL execution results expose `rows`, not `data`. The old result table read `data`, so a valid backend
  response could render no rows.
- Provisioning can return HTTP success with `{ success: false, errors: [...] }`; the old UI continued through upload,
  ETL config, and Airflow deployment and could announce final success. It now stops with the real error.
- The reference backend does not define the currently consumed script/agent endpoints
  (`/etl/generate-script*`, `/etl/script/*`). Those user-visible functions are preserved and now have explicit
  response/event contracts, but remain an unverified backend extension until a running service or owning repository
  proves them.
- Unused wrappers for backend-absent `/etl/ddl`, `/etl/execute-direct*`, `/etl/script/execute/*`, and
  `/etl/script/{cube}` were removed. No source consumer existed.

## Frontend changes

- Added `src/domains/olap/model/contracts.ts` as the single cube/query/ETL/Airflow/script contract source.
- Added runtime decoding at the API boundary for cube metadata, query rows, AI suggestions, ETL configs, Airflow,
  script SSE, agent SSE, and lineage.
- Removed stale Axios-shaped error access from the fetch-based store and made failures carry the real message.
- Removed explicit `any` from the OLAP API, store, Cube Designer, Pivot Analysis, and adjacent lineage detail action.
- Preserved feature ids, menu placement, request paths, and visible layouts.

## Verification

- `npm.cmd run type-check -- --pretty false`: passed.
- `npm.cmd run build`: passed; 4,747 modules transformed.
- `node contracts/test-domain-contract-parsers.mjs`: cube/query/NL2SQL/suggestion/SSE/lineage contracts passed.
- `node contracts/check-architecture.mjs`: passed across 302 TypeScript/Vue source files.
- `node contracts/verify-olap-ui.mjs`: passed at 1920×1080.
  - Actual Gateway cube request returned 500 and the screen showed the service failure with retry.
  - Injected successful `{ "cubes": [] }` response remained a valid empty state.

## Remaining live evidence

- `GET http://127.0.0.1:9000/api/gateway/olap/api/health` returned 500 on 2026-07-22 because the OLAP upstream was
  unavailable. Successful cube upload/query/provision/Airflow/script mutations are therefore not claimed as verified.

## Airflow UI boundary addendum

- Removed UI-owned `http://localhost:8080` construction from Cube Designer and lineage details. The frontend now opens
  only an `airflow_url` supplied by the OLAP response or lineage node properties.
- Missing URLs remain visibly unavailable instead of silently targeting the operator's own machine. HTTP(S) scheme
  validation and `noopener,noreferrer` protect all three Airflow link surfaces.
- Removed the runtime dependency on an externally hosted Airflow logo. Type-check, domain parser tests, 301-source
  architecture validation, and the OLAP browser regression passed after the change.

## Partial lineage failure addendum

- The lineage workflow combines OLAP ETL lineage with Catalog lineage. A failure from either source was previously
  logged and discarded, so the graph looked complete even when one backend was missing.
- Partial failures now remain visible as a non-blocking status while data from the successful source stays usable.
  When both sources fail, the existing blocking error state remains in effect.
- `node contracts/run-browser-suite.mjs verify-olap-ui.mjs` passed at 1920x1080. The scenario keeps the OLAP fixture
  successful, returns Catalog 503, verifies the retained `1|1|1|2` source/ETL/target/flow counts, and clicks retry to
  prove that exactly one additional Catalog request is sent.
- Visual evidence: `lineage-partial-failure-1920x1080.png`. The warning is readable without covering the lineage
  nodes, and its retry control remains above the graph interaction layer.

## Operation lifetime and destructive-scope addendum

- The former single-cube delete path requested every DW table, guessed ownership from table names, and could delete
  tables belonging to other cubes. `application/cubeDeletion.ts` now makes the destructive scope explicit:
  a single delete removes only the named cube and its same-name ETL configuration; all-DW cleanup is available only
  for the all-cubes action after the user selects that option.
- Cube list, cube selection, query, preview, and sync now have independent request identities. Late responses do not
  overwrite a newer selection/query, failed refreshes preserve the last usable list, and backend success is committed
  before local deletion state changes.
- ETL configuration, schema upload, Airflow deploy, and initial run pass through the same `success:false` result
  policy. Provisioning records six explicit checkpoints (`dw-schema`, `dw-tables`, `cube-schema`, `etl-config`,
  `airflow-deploy`, `initial-run`), so an exact retry resumes at the failed step instead of recreating resources that
  already succeeded. Initial-run failure remains a visible partial-success warning.
- ETL config and saved-script load errors remain visible with exact retry or an explicit new-draft action. They are
  not converted to a blank editable document. Script/agent execution uses header-bearing fetch-SSE with an
  `AbortController`; a new run, editor close, or unmount aborts the prior stream, and EOF without a terminal event is
  a failure rather than completion.
- Cube deletion, full reload, DAG redeploy, and the editor now use named dialogs with pending/error ownership,
  Escape handling, focus trap, and trigger-focus restoration. Native confirm/alert and unmanaged timers are absent
  from the OLAP UI.

## Current verification

- `node contracts/test-olap-cube-deletion.mjs`: passed exact single/all deletion scope, primary versus cleanup failure,
  resumable provisioning, and strict drop-payload rejection.
- `node contracts/test-domain-contract-parsers.mjs`: passed.
- `npm.cmd run type-check`: passed.
- `node contracts/check-architecture.mjs`: passed across 377 TypeScript/Vue sources.
- `node contracts/run-browser-suite.mjs verify-olap-ui.mjs`: passed the actual-upstream HTTP 500 representation,
  successful empty cubes, current session headers, and partial-lineage retry at 1920×1080.
- `node contracts/run-browser-suite.mjs verify-olap-lifecycle-ui.mjs`: passed mocked contract scenarios for:
  single-delete cancel and 503 exact retry with `0` DW deletes; all-delete `success:false` then explicit all-DW
  cleanup; provisioning checkpoint resume; initial-run-only retry; ETL config/script load retry; DAG cancel and
  503 retry; fetch-SSE headers and terminal-less EOF failure; mobile geometry and focus return.
- Lifecycle request counts were: single cube delete `2`, single ETL cleanup `1`, single DW delete `0`; all cube delete
  `2`, all ETL cleanup `1`, all-DW delete `1`; DW schema/table/cube schema/deploy each `1`, ETL config `2`, initial
  run `2`; config load `2`, script load `2`, DAG deploy `2`, script execution `1`.
- Visual evidence was inspected directly:
  `olap-delete-error-390x844.png`, `olap-delete-success-390x844.png`,
  `olap-provision-resume-1920x1080.png`, and `olap-editor-stream-failure-390x844.png`.
  The first mobile editor capture exposed a clipped third tab; the responsive header was changed to a three-column
  grid and the verifier now asserts all tab/title bounds before capturing the corrected screen.
- `npm.cmd run build`: passed with 4,840 transformed modules.
- `node contracts/check-build-boundaries.mjs`: passed with
  `__federation_expose_Remote-app-Ccs6dbvL.js` at 2,674,692 bytes while Upload, Graph, and Cytoscape remained outside
  the remote entry.
- `git diff --check`: passed.

The lifecycle browser uses deterministic network replacements and is not live-service evidence. The current actual
OLAP upstream still returns HTTP 500/unavailable, so successful live mutation and stream verification remains under
T052 and is not claimed here.

## ETL script lifecycle extraction addendum

- `PivotAnalysis.vue` no longer owns script-operation refs, `OlapStreamControl`, or direct calls to
  `createAgentStream`, `generateETLScript`, `loadSavedScript`, `saveETLScript`, or `executeScriptWithRetry`.
  `domains/olap/composables/useEtlScriptLifecycle.ts` now owns agent/template generation, saved-script reads,
  frozen save retry, download generation, execution event reduction, cancellation, and scope disposal.
- `application/etlScriptTargets.ts` freezes cube/code/filename and cube/sync-mode/max-retry targets. A failed save
  exposes an explicit same-target retry; later UI state changes cannot alter its body. Saved-script refresh failures
  retain the last valid code and stale reads are rejected.
- Template generation, saved-script read, and script save API methods now accept `AbortSignal` while preserving the
  existing method, path, query, body, runtime headers, and response parser. Agent/execution streams retain
  header-bearing fetch-SSE.
- Generation and execution use independent request sequences. New requests, user cancellation, cube transition,
  editor close, and scope disposal cancel the prior control and reject late callbacks. A cancelled execution remains
  cancelled even when the intercepted transport later emits a successful terminal event.
- The 390×844 evidence initially exposed code-panel actions overlapping the execution log. The narrow layout now uses
  natural document order, a contained action grid, and no `margin-top:auto` execution pull-up. The verifier asserts
  code/action/execution/log rectangles do not escape or overlap before writing
  `olap-editor-stream-failure-390x844.png`; the corrected image was inspected directly.

### Extraction verification

- `node contracts/test-olap-etl-script-lifecycle.mjs`: passed immutable targets, stale saved reads, failure
  preservation, exact save retry, generation cancel/late completion, execution cancel/late completion, terminal
  failure, cube/scope cancellation.
- `node contracts/check-architecture.mjs`: passed across 407 TypeScript/Vue sources. The guard prevents the script
  API calls, stream handles, and duplicate operation refs from returning to `PivotAnalysis.vue`.
- `npm.cmd run type-check`: passed.
- `node contracts/verify-olap-lifecycle-ui.mjs` against the real browser and deterministic network replacement:
  passed saved read `503→retry`, script save `success:false→identical body/header retry`, execution cancel followed
  by ignored late success, terminal-less EOF failure, agent generation cancel followed by ignored late success,
  runtime headers, mobile geometry, and all prior deletion/provisioning/DAG scenarios. Request counts were script
  load `2`, script save `2`, DAG deploy `2`, execution `2`, and agent generation `1`.
- `node contracts/verify-olap-ui.mjs`: passed at 1920×1080; the currently reachable actual OLAP request returned HTTP
  500 and remained an honest visible failure. This is not a successful live mutation claim.
- `npm.cmd run build`: passed with 4,867 transformed modules.
- `node contracts/check-build-boundaries.mjs`: passed with
  `__federation_expose_Remote-app-zsYrcPJU.js` at 2,724,088 bytes; Upload, Graph, and Cytoscape remained excluded.
- Scoped `git diff --check`: passed. Protected package and Analyzer 057/059 graph WIP files were not edited.
