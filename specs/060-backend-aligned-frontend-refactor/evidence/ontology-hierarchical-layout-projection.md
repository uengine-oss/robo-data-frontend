# Ontology hierarchical layout projection evidence

## Scope and invariant

- Refactored only MultiLayer Ontology hierarchical topology and position calculation.
- Preserved the existing known-layer constants, KPI/Measure same-layer depth, Process traversal order, Resource row,
  Driver connected-average placement, three pull iterations, minimum spacing, Cytoscape position application, viewport
  fit, layout selection, and selection-restore timing.
- Did not modify backend repositories or protected Analyzer graph WIP.

## Root cause and correction

- `MultiLayerOntologyViewer.vue` previously owned a 300-line renderer-dependent function that mixed graph snapshot,
  adjacency construction, recursive depth, five-layer coordinates, Driver relaxation, Cytoscape mutation, and fit.
  The calculation could not be tested independently of the UI and duplicated the canvas layer semantics.
- Unknown layers received the Process rank in element direction policy but were omitted from every hierarchical layout
  bucket, so they could remain at Cytoscape's origin. The pure projection now gives them the existing Process fallback
  rank and a finite Process-row position.
- Node ids were stored in ordinary object dictionaries. Reserved names such as `__proto__` could collide with object
  prototypes. Internal node and position records now use null-prototype dictionaries while retaining the same indexed
  consumer contract.

## Implementation

- Added `src/workflows/ontology/model/ontologyHierarchicalLayout.ts`.
- The model accepts readonly `{id, layer}` and `{source, target}` snapshots and returns node-id keyed finite positions.
- The Viewer now snapshots current Cytoscape nodes/edges, invokes the projection, applies each returned position once,
  fits the viewport, and returns the same synchronous `null` layout result.
- Removed layout constants, node-info map, depth recursion, layer grouping, process traversal, Driver target/pull/
  overlap code, and duplicate rank consumption from the Viewer.
- `MultiLayerOntologyViewer.vue` decreased from 5,389 to 5,115 lines in this slice and from 6,231 to 5,115 across the
  recent library/mapping/schema/presentation/element/layout sequence.

## Verification

- `test-ontology-hierarchical-layout.mjs`: PASS
  - exact coordinates for a normal five-layer graph
  - input immutability
  - KPI dependency depth and Process chain order
  - KPI and Process cycles
  - missing source/target endpoints
  - disconnected and Driver-only graphs with minimum spacing
  - unknown layer fallback, empty graph, finite output
  - reserved `__proto__` node identity
- All 18 `test-ontology-*.mjs` contracts: PASS.
- `npm run type-check`: PASS.
- `check-architecture.mjs`: PASS across 421 TypeScript/Vue source files.
- Viewer grep for layout constants, depth traversal, and Driver calculation symbols: 0.
- `verify-ontology-observability-ui.mjs`: PASS across 47 real Playwright flows, including DB/document/library graph
  generation, local mutation/undo/redo, sparse fit, relation direction, desktop, and mobile paths.
- Direct inspection of `ontology-local-graph-mutation-1920x1080.png`: KPI, Measure, Driver, and Resource nodes remain
  separated and centered; upward `MEASURES`/`INFLUENCED_BY` edges, labels, selection, detail panel, layer list, and
  legend are intact with no clipping or origin overlap.
- `npm run build`: PASS, 4,881 modules transformed.
- `check-build-boundaries.mjs`: PASS; remote asset
  `__federation_expose_Remote-app-C11j6RAS.js` is 2,731,729 bytes and keeps UploadTab, GraphTab, and the Cytoscape
  graph runtime outside the entry boundary.
- New slice files contain no trailing whitespace.
- Protected `package.json`, spec 057/059 recordings, `panelGraphProjection.ts`, code-analysis graph files, and
  `tsconfig.panel-projection.json` retain their pre-existing status and were not edited by this slice.
