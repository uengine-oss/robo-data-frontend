# Ontology document generation evidence

## Refactored ownership

- `workflows/ontology/application/documentGeneration.ts`
  - validates text, URL, PDF content, and selected glossary inputs
  - creates immutable input-type-specific request targets
  - preserves the original text/URL and clones/freezes selected glossary IDs
  - owns PDF file-type policy and form readiness
- `workflows/ontology/composables/useOntologyDocumentGeneration.ts`
  - owns document draft, PDF selection/encoding, glossary list, and generation operation state
  - keeps independent glossary and stream request sequences and AbortControllers
  - rejects stale results after retry, mode change, cancel, dialog close, or scope disposal
  - preserves failed request targets for exact retry without rereading the current form or re-encoding a PDF
  - separates exact retry, input editing, user cancellation, validation failure, and terminal failure
- `workflows/ontology/ui/MultiLayerOntologyViewer.vue`
  - projects validated progress and completion events
  - commits a successful generated schema to graph/Cytoscape once
  - keeps follow-up Neo4j save status separate from generation success
  - no longer constructs generation bodies or owns generation/glossary AbortControllers and FileReader

The Ontology API already routes requests through its local session-header-merging fetch wrapper; the browser contract
confirms that the generation POST carries the current runtime language and LLM headers. Catalog glossary reads now accept
an AbortSignal.

## Unit and structure verification

- `test-ontology-document-generation.mjs`
  - passed text/URL/PDF request projection, selected/all glossary policy, validation, and target freezing
  - passed PDF extension/MIME checks and request readiness
  - passed glossary retry abort, stale response rejection, last-good-list preservation, and visible error state
  - passed transport failure exact retry after draft mutation
  - passed PDF failure/retry with one encoding and the same encoded content
  - passed error-event failure and user cancel with ignored late complete event
  - passed scope-disposal abort
- Existing local graph mutation and graph history contracts passed.
- `check-architecture.mjs`
  - passed across 405 TypeScript/Vue sources.
  - prevents request body, API calls, FileReader, and generation AbortController from returning to the Viewer.
  - requires frozen retry target, request sequences, stale checks, scope disposal, and abortable glossary reads.
- `npm.cmd run type-check`
  - passed.

## Browser verification

The extended `verify-ontology-observability-ui.mjs` passed 47 Ontology/Observability checks:

1. glossary GET 503 stayed distinct from a valid empty list;
2. the dialog retried the same glossary GET and displayed the validated one-item result;
3. invalid PDF remained unselected with inline error and a valid PDF cleared the error;
4. generation POST 503 preserved a named error state and exact-retry action;
5. retry sent byte-equivalent JSON and the current runtime language/LLM headers;
6. successful NDJSON complete committed four nodes and one relationship once;
7. follow-up Neo4j save was reported independently as successful;
8. the remaining Ontology graph, datasource, filter, node-data, causal, ObjectType, library, save, responsive, and
   observability regressions passed with no page runtime error.

The initial attempt against the long-lived port-3000 HMR server was blocked by a stale Vite error overlay. A fresh
workspace dev server on port 3001 served the same source state, and the full browser contract passed there. This was not
counted as a product pass until the fresh-server run succeeded.

## Build and visual evidence

- `npm.cmd run build`
  - passed type-check and production build; 4,865 modules transformed.
- `check-build-boundaries.mjs`
  - passed with `__federation_expose_Remote-app-Dsq0QYT6.js` at 2,724,088 bytes.
- `ontology-document-generation-failure-1920x1080.png`
  - directly inspected: exact retry, input edit, and close actions are distinct and non-overlapping.
- `ontology-document-generation-success-1920x1080.png`
  - directly inspected: node/relation/layer totals, layer tags, Neo4j save state, synonym result, and final action fit
    without overlap.

This evidence uses deterministic backend-contract fixtures and does not claim a live service integration.
