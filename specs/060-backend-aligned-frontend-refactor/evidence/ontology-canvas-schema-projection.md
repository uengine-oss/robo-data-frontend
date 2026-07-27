# Ontology Canvas Schema Projection Evidence

Date: 2026-07-24

## Scope and root cause

`MultiLayerOntologyViewer.vue` had three independent schema→canvas paths:

- document generation copied nodes, sanitized relationships, generated a name,
  calculated a summary, and started a save;
- DB schema generation remapped a different subset of node/relationship fields
  and rendered the graph;
- library load copied the graph and repeated relationship sanitation.

The duplication also left two real identity defects:

1. an id-less new document generation retained the previously opened schema id,
   so its follow-up save could update the old Ontology;
2. DB schema generation returned a real schema id but the Viewer did not commit
   it, leaving schema-dependent actions such as What-If disabled.

The DB generator also returned `label: Entity`, which is outside this
MultiLayer canvas's fixed KPI/Measure/Process/Driver/Resource set. The graph
showed a gray node while every layer count remained zero.

## Implementation

- Added `application/ontologyCanvasSchema.ts` as the single pure projection for
  `document`, `database`, and `library` sources.
- The policy deep-clones canvas node metadata, canonicalizes DB field aliases,
  maps unsupported DB layers to `Resource`, removes relationships with missing
  endpoints, deterministically rekeys blank/duplicate relationship ids, and
  returns identity/name/sanitation/summary metadata.
- Generation identity uses the returned id or explicit `null`; it never retains
  the previous schema id. Library load uses the requested target id.
- Added one Viewer commit function for graph/transient-state replacement.
  Document save status, DB store application, library retry/history, and render
  timing remain owned by their existing source lifecycles.
- Removed the Viewer-local relationship sanitizer, name generator, DB node map,
  DB relationship map, and document layer-summary loop.

The Viewer decreased from 6,093 to 5,953 lines.

## Verification

- `test-ontology-canvas-schema.mjs`: PASS.
  - document/database/library identity;
  - immutable deep clone;
  - missing endpoint removal;
  - deterministic blank/duplicate id rekey;
  - DB `from_field`/`to_field` canonicalization;
  - unsupported `Entity`→`Resource`;
  - name and graph/synonym summary.
- all `test-ontology-*.mjs`: PASS.
- `test-domain-contract-parsers.mjs`: PASS.
- `npm.cmd run type-check`: PASS.
- `check-architecture.mjs`: PASS across 418 TypeScript/Vue sources. The Viewer
  cannot reintroduce local schema sanitation or source-specific mapping loops.
- `verify-ontology-observability-ui.mjs`: PASS, 47 Playwright interaction flows.
  New assertions prove:
  - DB generation commits the returned schema id and enables What-If;
  - an unsupported Entity appears as `Resource 1` in the fixed layer list;
  - id-less document generation submits its follow-up save without the previous
    library schema id.
- Visual inspection of
  `ontology-schema-generation-success-1920x1080.png`: PASS. The Order node is
  blue, listed under Resource, and the Resource count is 1; no overlay,
  clipping, or inconsistent zero-count remains.
- `npm.cmd run build`: PASS, 4,878 modules transformed.
- `check-build-boundaries.mjs`: PASS,
  `__federation_expose_Remote-app-7XkmypYf.js` 2,731,729 bytes; UploadTab,
  GraphTab, and Cytoscape graph runtime remain excluded from the entry.
- `git diff --check`: PASS with existing checkout line-ending warnings only.
- old Viewer sanitizer/name/source-map grep: 0.

## Honest boundary

The browser suite verifies the frontend against deterministic network routes
derived from the backend contracts. It does not claim a live Ontology service
or customer-data integration; that remains T052.

Protected Analyzer graph WIP, specs 057/059, `package.json`,
`panelGraphProjection.ts`, graph components, and
`tsconfig.panel-projection.json` were not modified or reverted by this slice.
