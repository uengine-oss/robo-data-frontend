# Ontology Datasource Mapping Workspace Evidence

Date: 2026-07-24

## Scope

This slice completes the structural half of FR-057 without changing the
user-visible datasource mapping result:

- moved auto-link stream/progress/mapping ownership out of
  `MultiLayerOntologyViewer.vue`;
- moved candidate expansion, single confirmation pending/error, frozen bulk
  targets, partial success, and failed-target-only retry into
  `useOntologyDatasourceMapping.ts`;
- kept the Viewer responsible only for applying a validated confirmation to
  node, relation-field, Cytoscape, and selected-node-data projections;
- added AbortSignal ownership to the Ontology auto-link stream;
- added runtime validation and defensive cloning for auto-link mapping/candidate
  events;
- separated backend confirmation success from local graph application retry so
  a local application failure does not submit the same backend mutation twice.

The Viewer decreased from 6,231 to 6,093 lines. No backend repository was
changed.

## Contract and structure

- `application/datasourceMappingWorkspace.ts` owns immutable node snapshots,
  progress projection, mapping cloning/confirmation projection, candidate
  expansion, statistics, and exact target identity.
- `composables/useOntologyDatasourceMapping.ts` owns request sequence,
  AbortController, stale-event rejection, confirmation de-duplication,
  backend-success application-only retry, notices/errors, and bulk retry.
- `application/datasourceConfirmation.ts` remains the canonical frozen
  candidate and bulk-result policy.
- `objectExplorer.ts` now passes the current session headers and AbortSignal to
  `/ontology/auto-link-datasource/stream`, rejects missing terminal results,
  and validates every mapping/candidate before exposing it to the workflow.
- Architecture rules reject direct auto-link/confirm API calls, mapping refs,
  old lifecycle functions, and in-place mapping mutation in the Viewer.

## Verification

- `npm.cmd run type-check`: PASS.
- `node .../test-domain-contract-parsers.mjs`: PASS, including cloned valid
  auto-link mappings and malformed node identity rejection.
- `node .../test-ontology-datasource-mapping.mjs`: PASS:
  - immutable node/progress/mapping projections;
  - retry aborts and rejects stale stream events;
  - dialog close and scope disposal abort the active stream;
  - backend success followed by local application failure retries only the
    local snapshot and keeps the backend call count at one;
  - bulk partial failure retries only the failed target.
- all `test-ontology-*.mjs` contracts: PASS.
- `node .../check-architecture.mjs`: PASS across 417 TypeScript/Vue sources.
- `verify-ontology-observability-ui.mjs`: PASS, 47 real Playwright interaction
  flows. The relevant flows covered auto-link 503→retry, candidate
  confirmation 503→same payload retry, bulk Escape→zero mutation, partial
  success→failed target only retry, node discovery confirmation, current
  session headers, and desktop/mobile geometry.
- visual inspection:
  - `ontology-datasource-auto-link-failure-1920x1080.png`;
  - `ontology-datasource-bulk-confirm-390x844.png`;
  - `ontology-datasource-bulk-partial-failure-1920x1080.png`.
  The owning error/retry state is visible, the mobile alertdialog remains
  bounded, and partial success is not presented as total failure.
- `npm.cmd run build`: PASS, 4,877 modules transformed.
- `node .../check-build-boundaries.mjs`: PASS,
  `__federation_expose_Remote-app-ChQhJT0o.js` 2,731,729 bytes; UploadTab,
  GraphTab, and Cytoscape graph runtime remain excluded from the entry.
- `git diff --check`: PASS (existing checkout line-ending warnings only).

## Honest boundary

The Playwright suite uses deterministic network routes derived from the
backend path/method/header/payload/response contracts. It verifies frontend
behavior and request compatibility, not a live Ontology service with real
customer data. Live-service integration remains in T052 and is not claimed by
this slice.

Protected Analyzer graph WIP, specs 057/059, `package.json`,
`panelGraphProjection.ts`, and `tsconfig.panel-projection.json` were inspected
after the slice and not modified or reverted by this work.
