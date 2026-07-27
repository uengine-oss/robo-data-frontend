# Ontology Behavior editor evidence

## Backend contract source

- Read-only source: `uengine-oss/robo-insight-domain-layer`
- Inspected commit: `11de76785213296dd1dda06d182c2c78b8054efa`
- `app/routers/ontology.py`
  - `POST /object-types/{name}/behaviors` returns `success`, `message`, and the created `behavior`.
  - `PATCH /object-types/{name}/behaviors/{behavior_name}` returns explicit success and message.
  - `DELETE /object-types/{name}/behaviors/{behavior_name}` returns explicit success and message.
  - `POST /generate-code` returns explicit success, generated code, and language.
- `BehaviorDefinition` owns name, description, behavior type, config, input fields, and output field.

The backend repository was not modified. The external endpoint test is intentionally not the Ontology backend execute
route: it calls an operator-supplied URL and therefore uses an isolated boundary that never forwards ROBO session,
LLM, or Neo4j headers.

## Refactored ownership

- `domains/ontology/api/agents.ts`
  - strict Behavior mutation and code-generation response parsers
  - returned Behavior identity and type-specific config validation
  - abortable create/update/delete/generate operations
  - isolated abortable external endpoint test with visible JSON and non-JSON responses
- `domains/ontology/application/behaviorDraft.ts`
  - create/edit draft projection without mutating the supplied Behavior
  - input toggle and output field selection, including a real custom-output-field state
  - REST, DMN, Python, JavaScript, and existing ProcessGPT payload validation
  - immutable AI prompt and external-test request projection
  - generated-code and test-result presentation projection
- `domains/ontology/application/useBehaviorEditor.ts`
  - separate generation, save, external test, and delete state
  - per-operation AbortController, request sequence, stale-response rejection, and scope cleanup
  - reactive failed targets and exact frozen retry
  - success-before-emit semantics for create, update, and delete
- `domains/ontology/ui/modeling/BehaviorDialog.vue`
  - no domain API, fetch, JSON parsing/stringifying, raw timer, or native confirm/alert
  - named dialog, initial focus, focus containment, Escape, labeled fields, native buttons, and `aria-pressed`
  - shared `ActionDialog` deletion with pending close protection and focus restoration
  - preserved REST/DMN/Python/JavaScript authoring and safe existing ProcessGPT edit/delete presentation
  - body-owned scroll, contained type grid/editors/results, and fixed header/footer at 390×844

## Verification

- `test-ontology-behavior-editor.mjs`
  - passed create/edit and ProcessGPT draft projection, custom output field, validation, prompt context,
    invalid JSON, response parser, create/update, generation/save/test/delete exact retry, close abort, and
    late-response rejection.
- `verify-ontology-behavior-editor-ui.mjs`
  - generation 503 repeated the same prompt and current internal session headers.
  - invalid external JSON issued zero network requests; external 503 repeated the same URL/method/body and sent
    no ROBO session, LLM, or Neo4j headers.
  - create 503 repeated the same normalized Behavior payload.
  - edit/delete Escape issued zero delete requests; delete 503 retried the same frozen URL and target.
  - initial focus, backward focus wrapping, Escape close, zero page errors, and desktop/mobile containment passed.
- Existing `test-agents-md-editor.mjs` and `verify-agents-md-editor-ui.mjs`
  - passed with the actual ProcessGPT Behavior create response contract.
- Existing `verify-ontology-observability-ui.mjs`
  - all 46 Ontology/Observability browser scenarios passed.
- `check-architecture.mjs`
  - passed across 401 TypeScript/Vue sources.
- `npm run type-check`
  - passed.
- `npm run build`
  - type-check and production build passed; 4,861 modules transformed.
- `check-build-boundaries.mjs`
  - passed; remote asset `__federation_expose_Remote-app-CpjQUhux.js` was 2,724,088 bytes.

## Visual evidence

- `ontology-behavior-editor-lifecycle-1920x1080.png`
- `ontology-behavior-editor-390x844.png`

Both screenshots were inspected directly. Desktop retains the existing visual language while the result and actions
remain contained. At 390×844, the two-column type grid, code editor, input chips, fixed footer, and body-only scroll
remain within the viewport without document horizontal overflow.

## Remaining integration scope

The browser contract intercepts the exact backend paths with envelopes shaped from the inspected backend source.
A live Ontology dataset, code-generation model, and operator-owned external service were not available, so live
service success remains under T052 and is not claimed here.
