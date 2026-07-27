# Schema Canvas batch transaction evidence

## Scope and invariant

- Refactored the `상위 10개` append and `전체` replacement actions without changing Catalog/Data Fabric backend
  routes or writing to any backend repository.
- Preserved the existing top-table order, maximum of ten targets, related-table expansion, full square-grid geometry,
  table identity, column requests, relationship projection, and success-time viewport fit.
- A successful `전체` still replaces the canvas; the correction is that replacement now occurs only after every
  required read succeeds.

## Root cause and correction

- `handleAddTopTables` awaited `addTableToCanvas` in a UI loop and stopped on the first error. Nodes committed before
  that error remained on the canvas, and no batch retry existed.
- `addAllTablesToCanvas` cleared nodes and edges before loading the first column. Any later column failure destroyed
  the previous canvas and exposed a partially rebuilt grid.
- The UI also enabled full-view mode before knowing whether the all-table operation had succeeded.
- The UI now creates a cloned mode/table attempt and owns pending, visible error, dismissal, and exact retry.
  The store wraps top-table additions and related expansion in a canvas snapshot/rollback transaction. Full-table
  replacement loads and projects every node into a local array, then commits the array once.
- Full-view mode and fit run only after the store reports a commit. Empty or concurrent attempts report no commit and
  create neither mode nor viewport changes.

## Responsibility extraction

- Added `application/schemaCanvasBatch.ts` for immutable attempt creation and retry cloning.
- Added `model/schemaCanvasNodeProjection.ts` for shared table-node metadata/defaults, nested column/behavior cloning,
  and deterministic grid positions.
- Single-table and all-table paths now use the same node projection instead of maintaining different node-data
  literals. An explicitly supplied empty ObjectType column list is now honored rather than causing an unrelated
  Catalog column request.
- `SchemaCanvas.vue` is 1,557 lines after adding the visible batch lifecycle; batch snapshots and node/grid logic live
  outside the Vue controller.

## Verification

- `test-schema-canvas-batch.mjs`: PASS.
  - attempt and retry snapshot independence;
  - complete logical/physical metadata and behavior projection;
  - nested column/config/input immutability;
  - exact five-table grid positions and invalid index/count rejection.
- All four `test-schema-*.mjs` contracts: PASS.
- `npm run type-check`: PASS.
- `check-architecture.mjs`: PASS across 424 TypeScript/Vue source files.
- `verify-schema-canvas-batch-ui.mjs`: PASS using actual browser clicks and network failures.
  - top-10 failed on the second related-table 503 and rolled back to zero nodes;
  - exact retry replayed `orders, table_2, ...` and committed ten nodes once;
  - all-table failed on the eleventh table's column 503 and preserved the pre-existing Order node and exact viewport
    transform;
  - exact retry requested the same `warehouse/sales/table_11` target and committed eleven nodes once;
  - errors remained visible until success and all column calls retained `schema=sales`.
- Existing `verify-schema-catalog-discovery-ui.mjs`: PASS for table/search/drop contracts.
- Existing `verify-schema-relationship-ui.mjs`: PASS across 16 desktop/mobile relationship flows.
- The first direct inspection of `schema-canvas-batch-retry-1440x900.png` exposed a floating-legend overlap with the
  rightmost first-row card. That follow-up is now corrected and independently closed in
  `evidence/schema-canvas-overlay-safe-viewport.md`; the same batch verifier now asserts zero intersections.
- `npm run build`: PASS, 4,884 modules transformed.
- `check-build-boundaries.mjs`: PASS; remote asset
  `__federation_expose_Remote-app-DqSJX6oF.js` is 2,745,345 bytes and keeps UploadTab, GraphTab, and Cytoscape graph
  runtime outside the entry boundary.
- `git diff --check`: PASS apart from existing line-ending conversion notices.
- Protected `package.json`, spec 057/059 recordings, `panelGraphProjection.ts`, code-analysis graph files, and
  `tsconfig.panel-projection.json` retain their pre-existing status and were not edited by this slice.
