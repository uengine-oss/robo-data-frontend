# Data Lineage Workflow Evidence

## Ownership and contract

The Data Lineage tab is intentionally a cross-domain workflow:

- Catalog owns `GET /api/gateway/robo/lineage/` and ETL SQL analysis.
- OLAP owns `GET /api/gateway/olap/api/etl/lineage/overview` and
  `POST /api/gateway/olap/api/airflow/etl/{cube}/deploy?force=true`.
- `workflows/data-lineage` projects the two public domain responses into the graph shown by the tab.

The backend separation was not changed. The Vue tab no longer owns the two response shapes, projection, dedupe,
source-success counting, or stale-request policy. Those responsibilities now live in
`application/useLineageGraphQuery.ts`, while common node/edge/stat types live in `model/graph.ts`.

Catalog lineage JSON is decoded at `domains/catalog/api/lineage.ts`. Missing or malformed node/edge arrays, node
identity/type, edge identity, properties, and numeric stats are rejected instead of becoming an apparently valid
empty graph.

## Query behavior

- OLAP and Catalog loads run independently and are combined only after both settle.
- One failed source produces a visible warning while the successful source graph remains usable.
- Both failed sources produce the existing blocking error state.
- A monotonically increasing load sequence prevents an older overlapping request from replacing the latest graph,
  warning, error, or loading state.
- Existing OLAP-first node dedupe behavior and edge/stat projection are contract-tested.

## DAG redeploy behavior

- The old browser `confirm` and unmanaged five-second timer were removed.
- Opening the shared `ActionDialog` freezes the selected node ID and explicit backend `cube_name`.
- Cancel sends no request and returns focus to the DAG action.
- HTTP failure and HTTP-200 `{ success: false }` remain in the same dialog and retry the same encoded cube, `force`
  flag, method, and runtime session headers.
- DAG ID and `airflow_url` are committed only after validated success.
- An ETL node without `cube_name` no longer derives a target from `ETL_...` or a lower-cased node name. Its action is
  disabled with the missing-contract reason.
- Success status and Vue Flow viewport scheduling use `useManagedTimeouts`, so replacement and component disposal
  cancel prior callbacks.

## UI inspection

The first 390×844 success capture exposed a real responsive defect: the title wrapped one Korean character per line
and the search/ETL actions were clipped outside the visible header. The mobile header now uses a full-width search
row and two equal action columns; stats use a 2×2 grid. The verifier asserts every header control, detail panel,
dialog, and document overflow boundary.

Directly inspected evidence:

- `lineage-dag-redeploy-error-390x844.png`
- `lineage-dag-redeploy-success-390x844.png`
- `lineage-partial-failure-1920x1080.png`

## Verification

- `node contracts/test-lineage-workflow.mjs`: passed Catalog runtime parsing, OLAP/Catalog projection and dedupe,
  partial/all failure, stale load rejection, and explicit cube identity.
- `npm.cmd run type-check -- --pretty false`: passed.
- `node contracts/check-architecture.mjs`: passed across 379 TypeScript/Vue sources; native lineage dialogs, raw
  lineage timers, duplicate graph interfaces, and UI-owned cross-domain projection are rejected.
- `node contracts/run-browser-suite.mjs verify-lineage-lifecycle-ui.mjs`: passed the 390×844 cancel, 503,
  `success:false`, exact retry, success commit, backend Airflow URL, missing-`cube_name`, focus, geometry, and overflow
  scenarios. Exactly three deliberate deploy requests were sent after the zero-request cancel.
- `node contracts/run-browser-suite.mjs verify-olap-ui.mjs`: passed the existing actual-upstream representation,
  successful empty cubes, runtime headers, and 1920×1080 partial-lineage warning/retry regression.
- `node contracts/test-domain-contract-parsers.mjs`: passed.
- `npm.cmd run build`: passed with 4,840 transformed modules.
- `node contracts/check-build-boundaries.mjs`: passed with remote entry
  `__federation_expose_Remote-app-D6w3wj5r.js` at 2,674,692 bytes; Upload, Graph, and Cytoscape remained excluded.
- `git diff --check`: passed; only existing line-ending warnings were emitted.

The lifecycle browser uses deterministic network contract responses and is not a live Airflow mutation. The actual
OLAP upstream still returned HTTP 500 during the adjacent verifier, so successful live DAG deployment remains
unverified under T052.
