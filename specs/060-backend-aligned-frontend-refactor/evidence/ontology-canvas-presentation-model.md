# Ontology canvas presentation model evidence

## Scope and invariant

- Refactored only the Cytoscape presentation policy owned by
  `MultiLayerOntologyViewer.vue`; no backend repository or protected Analyzer graph WIP was changed.
- Preserved the existing 43-selector order and every node, edge, relationship-type, edgehandles, agent,
  causal-highlight, and filter style value.
- Kept Cytoscape instance creation, event wiring, theme observation, and style application in the Viewer.
  The extracted model receives only the current dark/light boolean and has no Vue, DOM, or Cytoscape-instance
  dependency.

## Implementation

- Added `src/workflows/ontology/model/ontologyCanvasStyles.ts`.
- Consolidated 23 repeated relationship-style blocks into declarative selector/color/line metadata while returning
  fresh objects on every call.
- Removed the Viewer-local 300+ line stylesheet builder. The Viewer now calls
  `createOntologyCanvasStyles(isDarkMode.value)` at canvas initialization and theme refresh.
- `MultiLayerOntologyViewer.vue` decreased from 5,953 to 5,567 lines in this slice.
- Added FR-059, the matching plan slice, T042 subtask, architecture rule, structure gate, and deterministic unit
  contract before closing the implementation.

## Verification

- `test-ontology-canvas-styles.mjs`: PASS
  - exactly 43 selectors and stable order in both themes
  - dark/light base node, selection, edge, label, and label-background values
  - relationship dashed/width/curve rules
  - edgehandles, agent, causal, and filter styles
  - fresh-object isolation across calls
- All 16 `test-ontology-*.mjs` contracts: PASS.
- `test-domain-contract-parsers.mjs`: PASS.
- `npm run type-check`: PASS.
- `check-architecture.mjs`: PASS across 419 TypeScript/Vue source files.
- `verify-ontology-observability-ui.mjs`: PASS across 47 real Playwright flows at desktop and mobile sizes.
- Direct inspection of `ontology-schema-generation-success-1920x1080.png`: the generated Resource node is blue,
  centered and legible; its light text, border, layer count, legend, and surrounding canvas are intact with no
  clipping or overlap.
- `npm run build`: PASS, 4,879 modules transformed.
- `check-build-boundaries.mjs`: PASS; remote asset
  `__federation_expose_Remote-app-C5ZuL-IO.js` is 2,731,729 bytes and keeps UploadTab, GraphTab, and the Cytoscape
  graph runtime outside the entry boundary.
- `git diff --check`: no whitespace errors; only existing LF/CRLF conversion warnings were reported.
- Protected `package.json`, spec 057/059 recordings, `panelGraphProjection.ts`, code-analysis graph files, and
  `tsconfig.panel-projection.json` remain present with their pre-existing WIP status and were not edited by this
  slice.
