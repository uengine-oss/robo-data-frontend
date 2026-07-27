# Schema Canvas drag intake evidence

## Scope and invariant

- Refactored only the Schema Modeling canvas `application/json` drag intake and its failed-add retry lifecycle.
- Preserved all three current payload producers: wrapped `{table}`, direct table, and ObjectType payloads including
  the legacy marker.
- Preserved successful table placement, column loading, ObjectType behaviors, fit timing, existing feature id, API
  routes, and visible canvas result.
- Did not modify backend repositories, `package.json`, or protected spec 057/059 and Analyzer graph WIP.

## Root cause and correction

- `SchemaCanvas.vue` parsed browser-controlled DataTransfer text with raw `JSON.parse`, guessed several unrelated
  object shapes inline, and passed the resulting object directly to the store.
- Malformed payloads and add failures were logger-only outcomes, so the user received no visible failure or exact
  retry path.
- Drop coordinates used `event.target`; dropping over a nested child could therefore calculate against the wrong
  element bounds.
- The new workflow application parser validates and normalizes every supported payload into one canonical target.
  Invalid payloads cause no store mutation and no viewport fit. Failed adds retain a cloned target and position for
  an exact visible retry. Coordinates now use the registered canvas `currentTarget`.

## Implementation

- Added `src/workflows/schema-modeling/application/schemaCanvasDrop.ts`.
- Added and publicly exported `parseOntologyBehaviorList` from the ontology model, then reused it in both the
  Object Explorer API response parser and Schema Canvas drag parser instead of maintaining duplicate behavior
  parsing rules.
- `SchemaCanvas.vue` now owns only DataTransfer collection, canvas-coordinate projection, pending/error
  presentation, store invocation, exact retry, dismissal, and one fit after success.
- The parser validates table identity, schema/datasource metadata, finite nonnegative counts, columns, ObjectType
  markers, and behavior configuration. The retry clone isolates nested columns, inputs, and behavior parameters.
- `SchemaCanvas.vue` is 1,505 lines after the slice; the parsing and cloning responsibility now resides in the
  framework-free application module rather than increasing the UI controller further.

## Verification

- `test-schema-canvas-drop.mjs`: PASS for wrapped/direct/ObjectType/legacy payloads, metadata and behavior
  preservation, clone independence, malformed JSON, primitives, blank identity, invalid counts, columns, and
  behaviors.
- `test-domain-contract-parsers.mjs`: PASS.
- `test-schema-catalog-discovery.mjs`: PASS.
- `test-schema-modeling-contracts.mjs`: PASS.
- `npm run type-check`: PASS.
- `check-architecture.mjs`: PASS across 422 TypeScript/Vue source files.
- Source audit: raw `JSON.parse` and parsed-shape guesses in `SchemaCanvas.vue`: 0; duplicate behavior parser helpers
  in `objectExplorer.ts`: 0.
- `verify-schema-catalog-discovery-ui.mjs`: PASS with actual browser DataTransfer events:
  - malformed JSON produced a visible dismissible error, zero column requests, and zero nodes;
  - a valid wrapped `orders` drop received a 503, exposed retry, retried the frozen datasource/schema identity,
    and created exactly one node after success.
- Direct inspection of `schema-catalog-discovery-retry-1440x900.png`: the successful Order card is centered and
  unclipped, and the resolved alert no longer occupies or shifts the canvas.
- `verify-schema-relationship-ui.mjs`: PASS across 16 desktop/mobile relationship flows.
- `npm run build`: PASS, 4,882 modules transformed.
- `check-build-boundaries.mjs`: PASS; remote asset
  `__federation_expose_Remote-app-DMOkDvD6.js` is 2,739,744 bytes and keeps UploadTab, GraphTab, and Cytoscape graph
  runtime outside the entry boundary.
- `git diff --check`: PASS apart from existing line-ending conversion notices.
- Remaining adjacent risk is explicitly out of this slice: top/all-table bulk add still needs an atomic or
  recoverable partial-failure lifecycle and is the next active task.
