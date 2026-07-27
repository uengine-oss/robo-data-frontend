# MultiLayer Ontology library workspace lifecycle evidence

Date: 2026-07-24

## Outcome

- Added pure immutable/frozen policies in `application/ontologyLibraryWorkspace.ts` for delete targets, renamed
  entries, application retry snapshots, and list/load failure presentation.
- Moved dropdown/list state, rename draft, delete target, lifecycle errors, list stale rejection, activate/detail
  load, screen-application retry, notices, and recent-history commit into
  `composables/useOntologyLibraryWorkspace.ts`.
- Reused the Ontology domain's `useOntologySchemaLifecycle` rather than duplicating activate/detail/rename/delete
  transport rules in the workflow.
- Kept Viewer-only canvas responsibilities behind `applySchema` and `clearDeletedSchema` callbacks. The Viewer no
  longer calls list/rename/delete/activate/detail APIs or mutates a library entry in place.
- `MultiLayerOntologyViewer.vue` decreased from 6,436 to 6,231 lines. Grep finds zero old Viewer library API,
  lifecycle function, or mutable-entry implementations.

## Contract evidence

`test-ontology-library-workspace.mjs` passed and covers:

- immutable rename projection and frozen delete/application targets;
- two concurrent list reads where late A cannot overwrite newer B;
- damaged schema entries excluded with a visible count;
- list transport failure retaining the last successful list rather than becoming an empty success;
- rename no-op avoiding the backend, rename failure preserving the draft, and Enter/blur submitting once;
- backend delete failure preserving list, current canvas callback, dialog target, and recent history;
- delete retry using the original id/name snapshot and committing removal only after success;
- detail failure after activation and retry that does not repeat successful activation;
- recent history remaining unchanged until full screen application succeeds;
- a failed renderer mutating its input without corrupting the frozen application retry snapshot;
- application-only retry issuing no activate/detail calls and receiving byte-equivalent schema data;
- disposed scope rejecting a late list response.

`test-ontology-history.mjs` also passed. The architecture contract passed across 415 TypeScript/Vue sources. It
rejects Viewer-owned library refs/functions/direct APIs/mutable entry updates, and requires stale-list,
frozen-target, lifecycle, projection, history, and disposal guards in the workflow.

## Browser evidence

The full Ontology/Observability Playwright suite passed without browser runtime errors. Existing real UI flows
proved that:

- list 503 is distinct from empty data and retry restores only valid entries;
- damaged entries display the exclusion count;
- keyboard trigger and selection remain available;
- activation failure preserves the current screen;
- detail failure after activation retries detail without repeating activation;
- rename failure preserves the attempted text and Enter/blur do not duplicate the mutation;
- delete failure keeps the confirmation dialog, canvas, and recent history;
- delete retry clears the current canvas/history only after backend success;
- downstream node datasource, relation, node-data, graph-save, document, causal, and instance flows still pass.

Current-run screenshots include:

- `ontology-library-failure-1920x1080.png`
- `ontology-library-retry-1920x1080.png`
- `ontology-schema-detail-failure-1920x1080.png`
- `ontology-schema-rename-failure-1920x1080.png`
- `ontology-schema-delete-failure-1920x1080.png`
- `ontology-schema-delete-success-1920x1080.png`

The retry screenshot was visually inspected. The dropdown remains aligned to its header trigger, the exclusion
notice and valid entry are readable, and the graph/sidebar/header proportions are unchanged.

The browser suite uses deterministic gateway-shaped fixtures because library activation requires populated
Ontology schemas and graph data. It validates frontend API sequencing and UI behavior, not live environment data.
No backend repository or external service was mutated.

## Build and boundary

- `npm.cmd run type-check`: PASS
- `node .../test-ontology-library-workspace.mjs`: PASS
- `node .../test-ontology-history.mjs`: PASS
- `node .../check-architecture.mjs`: PASS, 415 sources
- `node .../verify-ontology-observability-ui.mjs`: PASS
- `npm.cmd run build`: PASS, 4,875 modules
- `node .../check-build-boundaries.mjs`: PASS, remote asset 2,728,725 bytes
- repository `git diff --check`: PASS
- protected package/spec 057/spec 059/code-analysis graph WIP status was inspected and left intact
