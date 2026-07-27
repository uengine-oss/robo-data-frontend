# Schema Canvas overlay-safe viewport evidence

## Scope and invariant

- Corrected automatic and manual Schema Canvas fit geometry only; table layout coordinates, node size, API requests,
  batch transaction semantics, user pan/zoom controls, and overlay visual design remain intact.
- Preserved each caller's existing numeric base padding (`0.2` or `0.3`) and delayed fit timing.
- Did not change backend repositories or protected Analyzer graph WIP.

## Root cause and correction

- Every success path called Vue Flow `fitView` with a uniform number. Vue Flow fitted only node bounds, so it could
  place the first row underneath the absolutely positioned expanded legend. The same omission applied to the top
  controls, bottom toolbar, and minimap.
- Added `model/schemaCanvasViewport.ts`. It converts the existing numeric padding to its equivalent pixel inset,
  combines it with measured top/right/bottom overlay extents and a gap, and clamps oversized/invalid measurements
  while retaining a finite minimum content area.
- `SchemaCanvas.vue` now measures the canvas, floating controls, expanded or collapsed legend, toolbar, and minimap.
  Drop, double-click, semantic add, related-table success, top/all batch success, and the manual Fit button all call
  one `fitCanvasView` helper.
- Related-table loading now reports a boolean result. Its caller schedules fit only on success, so a read failure no
  longer changes the viewport.

## Verification

- `test-schema-canvas-viewport.mjs`: PASS.
  - exact current numeric-padding conversion;
  - expanded and collapsed right extents;
  - overlay/base maximum selection;
  - oversized narrow-canvas clamp;
  - negative, NaN, and infinite measurement normalization.
- All five `test-schema-*.mjs` contracts: PASS.
- `npm run type-check`: PASS.
- `check-architecture.mjs`: PASS across 425 TypeScript/Vue source files.
- SchemaCanvas source audit: all scheduled success fits and the manual button use `fitCanvasView`; direct numeric
  `fitView` calls outside its unmounted fallback: 0.
- `verify-schema-canvas-batch-ui.mjs`: PASS.
  - with the legend expanded, eleven nodes have zero intersection area with the legend, floating controls, toolbar,
    and minimap;
  - the all-table 503 path retains the exact pre-failure viewport;
  - collapsing the legend produces a smaller measured extent, and the next manual Fit uses the same safe path with
    zero intersections.
- Existing `verify-schema-catalog-discovery-ui.mjs`: PASS.
- Existing `verify-schema-relationship-ui.mjs`: PASS across 16 desktop/mobile relationship flows, including honest
  related-table failure and retry.
- Direct inspection of `schema-canvas-batch-retry-1440x900.png`: the expanded legend no longer covers Table 4; all
  rows remain above the toolbar and left of the minimap.
- Direct inspection of `schema-canvas-overlay-safe-collapsed-1440x900.png`: the collapsed legend remains clear of
  nodes and the grid occupies the released horizontal space without clipping.
- `npm run build`: PASS, 4,885 modules transformed.
- `check-build-boundaries.mjs`: PASS; remote asset
  `__federation_expose_Remote-app-C4sRk2G3.js` is 2,749,443 bytes and keeps UploadTab, GraphTab, and Cytoscape graph
  runtime outside the entry boundary.
- `git diff --check`: PASS apart from existing line-ending conversion notices.
- Protected `package.json`, spec 057/059 recordings, `panelGraphProjection.ts`, code-analysis graph files, and
  `tsconfig.panel-projection.json` retain their pre-existing status and were not edited by this slice.
