# MultiLayer Ontology relation editor lifecycle evidence

Date: 2026-07-24

## Outcome

- Moved relation lookup/form projection, column normalization, and verified-field reconciliation into
  `application/relationEditorLifecycle.ts`.
- Moved open/close/retry, endpoint column state, abort and stale-response rejection, validation, and immutable graph
  commit into `composables/useOntologyRelationEditor.ts`.
- Removed the Viewer-owned relation request sequence, controllers, mutable endpoint refs, direct `limit=1`
  node-data calls, and save orchestration. `MultiLayerOntologyViewer.vue` decreased from 6,995 to 6,796 lines.
- Added an explicit same-relation column retry action without changing the successful relation editor layout.
- Corrected datasource confirmation so an unqueried candidate no longer becomes a verified `columns: []` schema.
  Confirmed non-empty columns are trimmed, deduplicated, and cloned; unknown columns are omitted and therefore use
  the existing Ontology node-data gateway.

## Regression contracts

`test-ontology-relation-editor.mjs` passed and covers:

- exact and composite relationship identity with cloned targets;
- A editor requests aborted by B, with A late results unable to overwrite B;
- close and Vue scope disposal aborting in-flight work;
- retrying the exact source and target after endpoint failures;
- preserving field mappings on transient failure and no datasource;
- clearing only fields absent from a verified ready schema;
- inline schema avoiding network work, including verified empty schemas;
- rejecting one-sided field mappings;
- no history/UI hook for no-op saves and one hook each for a real immutable change.

`test-ontology-local-graph-mutation.mjs` passed and additionally proves that unknown confirmation columns are not
serialized as an empty schema.

The architecture contract passed across 411 TypeScript/Vue sources. It rejects Viewer-owned relation refs/functions,
direct relation node-data requests, mutable computed projections, missing abort/stale guards, framework coupling in
the application projection, and unknown-column/verified-empty conflation.

## Browser evidence

The full Ontology/Observability Playwright suite passed all 46 existing user-flow assertions plus the relation column
extension. Through the real UI it:

- connected the relation target to an ObjectType;
- received a 503 for the target column lookup;
- displayed endpoint failure separately from mapping validation;
- retried the same `sales-kpi` and `sales-measure` endpoints exactly once;
- preserved `order_id -> metric_id`;
- preserved `Accept-Language: ko` and the runtime LLM API key;
- removed stale endpoint and validation errors after success;
- retained downstream relation delete/undo, local graph mutation, Measure ObjectType, save, document generation,
  causal analysis, and instance workflows.

Screenshots:

- `ontology-relation-column-retry-1920x1080.png`
- `ontology-relation-column-retry-390x844.png`

Both were visually inspected. The desktop graph/panel proportions and field layout remain intact. At 390×844 the
relation editor stays inside the viewport, uses its scrollable panel, and creates no horizontal document overflow.

## Build and boundary

- `npm.cmd run type-check`: PASS
- `node .../test-ontology-relation-editor.mjs`: PASS
- `node .../test-ontology-local-graph-mutation.mjs`: PASS
- `node .../test-ontology-node-data.mjs`: PASS
- `node .../check-architecture.mjs`: PASS, 411 sources
- `node .../verify-ontology-observability-ui.mjs`: PASS
- `npm.cmd run build`: PASS, 4,871 modules
- `node .../check-build-boundaries.mjs`: PASS, remote asset 2,728,636 bytes
- scoped and repository `git diff --check`: PASS
