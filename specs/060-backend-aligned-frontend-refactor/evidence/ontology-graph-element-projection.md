# Ontology graph element projection evidence

## Scope and invariant

- Refactored only the MultiLayer Ontology layer catalog and canonical graph→Cytoscape element projection.
- Preserved node identity/name/layer/color, complete stored positions, edge identity/weight/layer metadata, horizontal
  flow normalization, layer-aware direction, inverse relationship types, unknown `REV_` behavior, array order, and
  all Viewer event/layout/selection behavior.
- Did not edit backend repositories or protected Analyzer graph WIP.

## Root cause and correction

- Layer metadata lived in the Viewer while equivalent numeric rank tables were duplicated in both element direction
  projection and hierarchical layout. Adding or renaming a layer could therefore change its UI color without changing
  its graph direction/layout semantics.
- The Viewer treated a graph as positioned when any node merely had an `x` property. A partial `{x}` position, NaN,
  or infinity could select Cytoscape's preset path while one or more nodes had no usable position, causing overlap at
  the default origin.
- `ontologyGraphElements.ts` now declares id/name/color/icon/rank once and returns
  `{ elements, hasCompletePositions }`. Preset mode requires every node to have finite x and y coordinates; otherwise
  the existing layout path runs.

## Implementation

- Added `src/workflows/ontology/model/ontologyGraphElements.ts`.
- Moved 5-layer metadata, 41 inverse mappings, upward/horizontal relation sets, node element projection, and edge
  direction/type projection out of `MultiLayerOntologyViewer.vue`.
- Reused the canonical rank accessor from the hierarchical layout instead of retaining a second rank table.
- The Viewer now receives projected elements, creates Cytoscape, wires interactions, runs layout, and restores
  selection. It no longer imports `cytoscape.ElementDefinition` or owns renderer-construction loops.
- `MultiLayerOntologyViewer.vue` decreased from 5,567 to 5,389 lines in this slice and from 6,231 to 5,389 across the
  recent library/mapping/schema/presentation/element sequence.

## Verification

- `test-ontology-graph-elements.mjs`: PASS
  - canonical colors and ranks plus unknown fallback
  - bottom-up, top-down, same-rank upward and same-rank inverse direction
  - `PRECEDES`/`FOLLOWS`→`NEXT`
  - unknown `REV_` fallback and existing zero-weight fallback
  - input immutability and node/edge order
  - complete, partial, NaN, infinity, and empty position decisions
- All 17 `test-ontology-*.mjs` contracts: PASS.
- `npm run type-check`: PASS.
- `check-architecture.mjs`: PASS across 420 TypeScript/Vue source files.
- `verify-ontology-observability-ui.mjs`: PASS across 47 real Playwright flows, including DB/document/library graph
  creation, local create/rename/layer/relation changes, undo/redo, datasource updates, sparse fit, desktop, and mobile.
- Direct inspection of `ontology-local-graph-mutation-1920x1080.png`: KPI/Measure/Driver/Resource colors, upward edge
  direction, `MEASURES` and `INFLUENCED_BY` labels, node spacing, layer counts, selection, detail panel, and legend are
  intact with no clipping or origin overlap.
- `npm run build`: PASS, 4,880 modules transformed.
- `check-build-boundaries.mjs`: PASS; remote asset
  `__federation_expose_Remote-app-D7U59zI7.js` is 2,731,729 bytes and keeps UploadTab, GraphTab, and the Cytoscape
  graph runtime outside the entry boundary.
- New slice files contain no trailing whitespace. The final architecture check remained green.
- Protected `package.json`, spec 057/059 recordings, `panelGraphProjection.ts`, code-analysis graph files, and
  `tsconfig.panel-projection.json` retain their pre-existing status and were not edited by this slice.
