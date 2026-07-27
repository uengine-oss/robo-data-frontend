# MultiLayer Ontology node datasource discovery lifecycle evidence

Date: 2026-07-24

## Outcome

- Moved query construction, provenance-to-candidate projection, table identity normalization, bounded probe
  requests, immutable probe results, manual/ObjectType candidates, and selected-candidate snapshots into
  `application/nodeDatasourceDiscovery.ts`.
- Moved dialog target, catalog/search/manual draft, candidate selection, search/probe/sample request identity,
  cancellation, stale-response rejection, visible failures, and exact confirmation retry into
  `composables/useNodeDatasourceDiscovery.ts`.
- Added `AbortSignal` support to Text2SQL ask/table-column reads, Ontology sample-data reads, and the shared JSON
  transport while preserving the runtime session headers.
- Removed Viewer-owned Text2SQL calls, discovery refs, row probe mutation, sample orchestration, and confirmation
  orchestration. `MultiLayerOntologyViewer.vue` decreased from 6,796 to 6,436 lines; grep finds zero old direct
  discovery implementations in the Viewer.
- Kept the existing desktop presentation. At 390×844, changed only the search controls to a two-row responsive
  grid after visual inspection showed that the original one-row input exposed only one character.

## Contract evidence

`test-ontology-node-datasource-discovery.mjs` passed and covers:

- layer-aware default queries and datasource/schema/table identity normalization;
- immutable provenance candidates with backend relevance and deduplicated columns;
- `LIMIT 11` probe projection to ten displayed rows plus an approximate marker;
- candidate-preserving partial probe failure;
- physical and ObjectType manual candidates with execution datasource preservation;
- A search aborted by B and late A results unable to overwrite B;
- transport failure, provenance-unavailable, and partial probe failure as distinct states;
- close and Vue scope disposal aborting pending search/sample work;
- local candidate samples avoiding network calls, direct samples using `LIMIT 10`, and visible sample failure;
- metadata failure before mutation, retry after metadata recovery, and no optimistic commit;
- frozen confirmation targets surviving backend failure so the retry sends the exact same node/candidate snapshot.

The domain parser test and relation-editor test also passed. The architecture contract passed across 413
TypeScript/Vue sources and rejects Viewer-owned discovery state/functions, direct Text2SQL calls, missing
sequence/abort guards, framework/API calls in the pure application projection, or missing signal/session-header
support at the API boundary.

## Browser evidence

The full Ontology/Observability Playwright suite passed with no browser runtime errors. Through the real UI and
gateway-shaped request boundary it verified:

- datasource catalog 503 versus an empty list, then explicit retry;
- Text2SQL ask 503 versus provenance-unavailable, then exact retry;
- a failed bounded row probe retaining the candidate;
- a failed sample request rendering an alert rather than an empty-data success;
- closing and reopening preview sending the same `LIMIT 10`, datasource, and table request, then rendering data;
- ObjectType execution datasource never being replaced by the UI sentinel;
- confirmation failure leaving the dialog and frozen payload intact, with byte-equivalent retry;
- all existing auto-link, bulk confirmation, relation, node-data, document, causal, graph, and instance flows.

Screenshots:

- `ontology-node-datasource-sample-failure-1920x1080.png`
- `ontology-node-datasource-search-390x844.png`

Both were visually inspected. The desktop error remains inside the sample surface and does not erase the search
candidate. The final mobile image has no document overflow, the dialog remains fully inside the viewport, the
query is readable, and datasource, query, search, preview, and select controls remain usable.

The browser suite uses deterministic gateway-shaped fixtures because this workflow requires a populated Text2SQL
catalog, Ontology schema, ObjectTypes, and datasource rows. It therefore proves frontend request/response and UI
lifecycle behavior, not live customer-data availability. No backend repository or external service was mutated.

## Build and boundary

- `npm.cmd run type-check`: PASS
- `node .../test-ontology-node-datasource-discovery.mjs`: PASS
- `node .../test-ontology-relation-editor.mjs`: PASS
- `node .../test-domain-contract-parsers.mjs`: PASS
- `node .../check-architecture.mjs`: PASS, 413 sources
- `node .../verify-ontology-observability-ui.mjs`: PASS
- `npm.cmd run build`: PASS, 4,873 modules
- `node .../check-build-boundaries.mjs`: PASS, remote asset 2,728,725 bytes
- repository `git diff --check`: PASS
